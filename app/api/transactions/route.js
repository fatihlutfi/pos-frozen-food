import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import prismaTx from "@/lib/prisma-tx";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

// ── Zod schema ──────────────────────────────────────────────────────────────
const CartItemSchema = z.object({
  productId:       z.string().min(1),
  quantity:        z.number().int().positive().max(9999),
  price:           z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100).optional(),
});

const TransactionSchema = z.object({
  branchId:       z.string().min(1).optional(),
  paymentMethod:  z.enum(["CASH", "TRANSFER_BANK", "QRIS"]),
  items:          z.array(CartItemSchema).min(1).max(100),
  discountAmount: z.number().nonnegative().optional(),
  amountPaid:     z.number().nonnegative().optional(),
  note:           z.string().max(500).optional(),
});

// GET /api/transactions — untuk halaman riwayat
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  const branchId = session.user.role === "KASIR"
    ? session.user.branchId
    : searchParams.get("branchId") || undefined;

  const status   = searchParams.get("status")   || undefined;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo   = searchParams.get("dateTo");
  const limit    = parseInt(searchParams.get("limit") || "100");

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(status   ? { status }   : {}),
    ...(dateFrom || dateTo ? {
      createdAt: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) } : {}),
      },
    } : {}),
  };

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      items: { include: { product: { select: { name: true } } } },
      branch: { select: { name: true, address: true } },
      user:   { select: { name: true } },
    },
  });

  return NextResponse.json(transactions);
}

// POST /api/transactions — buat transaksi baru (atomic, retry on invoice collision)
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
    }

    const parsed = TransactionSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      );
      return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
    }

    const { items, paymentMethod, discountAmount, amountPaid, note, branchId: bodyBranchId } = parsed.data;

    // ── Tentukan cabang ─────────────────────────────────────────────────────
    const branchId = session.user.role === "KASIR" ? session.user.branchId : bodyBranchId;

    // ── Validasi shift (KASIR) ──────────────────────────────────────────────
    let shiftId = null;
    if (session.user.role === "KASIR") {
      const activeShift = await prisma.cashierShift.findFirst({
        where: { userId: session.user.id, branchId, status: "OPEN" },
        select: { id: true },
      });
      if (!activeShift) {
        return NextResponse.json(
          { error: "Anda harus membuka shift terlebih dahulu sebelum melakukan transaksi" },
          { status: 400 }
        );
      }
      shiftId = activeShift.id;
    }

    // ── Validasi input ──────────────────────────────────────────────────────
    // items & paymentMethod sudah divalidasi Zod di atas
    if (!branchId) return NextResponse.json({ error: "Cabang wajib dipilih" }, { status: 400 });

    // ── Pre-validasi stok (fast fail sebelum masuk tx) ──────────────────────
    const productIds = items.map((i) => i.productId);
    const preStocks = await prisma.stock.findMany({
      where: { productId: { in: productIds }, branchId },
      include: { product: { select: { name: true, costPrice: true } } },
    });

    for (const item of items) {
      const s = preStocks.find((st) => st.productId === item.productId);
      if (!s) return NextResponse.json({ error: "Produk tidak ditemukan di cabang ini" }, { status: 404 });
      if (s.quantity < item.quantity) {
        return NextResponse.json(
          { error: `Stok "${s.product.name}" tidak cukup. Tersisa: ${s.quantity}` },
          { status: 409 }
        );
      }
    }

    // ── Hitung total ────────────────────────────────────────────────────────
    const subtotal   = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const discount   = Math.max(0, discountAmount || 0);
    const grandTotal = Math.max(0, subtotal - discount);
    const paid       = paymentMethod === "CASH" ? (amountPaid || 0) : grandTotal;
    const change     = Math.max(0, paid - grandTotal);

    if (paymentMethod === "CASH" && paid < grandTotal) {
      return NextResponse.json({ error: "Jumlah pembayaran kurang dari total belanja" }, { status: 400 });
    }

    // ── Invoice date prefix ─────────────────────────────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const dateStr = todayStart.toISOString().slice(0, 10).replace(/-/g, "");

    // ── Atomic transaction + retry on invoice collision (P2002) ────────────
    let transaction = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Count outside tx — di-retry tiap attempt agar nomor segar
        const countToday = await prisma.transaction.count({
          where: { createdAt: { gte: todayStart } },
        });
        const invoiceNumber = `INV-${dateStr}-${String(countToday + 1).padStart(4, "0")}`;

        transaction = await prismaTx.$transaction(async (tx) => {
          // Re-fetch stok di dalam tx untuk konsistensi concurrent
          const txStocks = await tx.stock.findMany({
            where: { productId: { in: productIds }, branchId },
            include: { product: { select: { name: true, costPrice: true } } },
          });

          // Validasi stok ulang di dalam tx
          for (const item of items) {
            const s = txStocks.find((st) => st.productId === item.productId);
            if (!s) throw Object.assign(new Error("Produk tidak ditemukan di cabang ini"), { _http: 404 });
            if (s.quantity < item.quantity) {
              throw Object.assign(
                new Error(`Stok "${s.product.name}" tidak cukup. Tersisa: ${s.quantity}`),
                { _http: 409 }
              );
            }
          }

          // Buat transaksi
          const newTrx = await tx.transaction.create({
            data: {
              invoiceNumber,
              paymentMethod,
              status: "COMPLETED",
              subtotal,
              discountAmount: discount,
              grandTotal,
              amountPaid: paid,
              changeAmount: change,
              note: note?.trim() || null,
              branchId,
              userId: session.user.id,
              shiftId,
              items: {
                create: items.map((item) => {
                  const s = txStocks.find((st) => st.productId === item.productId);
                  return {
                    productId:       item.productId,
                    quantity:        item.quantity,
                    price:           item.price,
                    costPrice:       s?.product?.costPrice ?? 0,
                    discountPercent: item.discountPercent ?? 0,
                    subtotal:        item.price * item.quantity,
                  };
                }),
              },
            },
          });

          // Kurangi stok + log + FIFO batch deduction (atomic — no race condition)
          for (const item of items) {
            const s = txStocks.find((st) => st.productId === item.productId);

            // Atomic conditional decrement — jika qty < item.quantity saat commit, count = 0 → throw
            const stockResult = await tx.stock.updateMany({
              where: { productId: item.productId, branchId, quantity: { gte: item.quantity } },
              data:  { quantity: { decrement: item.quantity } },
            });
            if (stockResult.count === 0) {
              throw Object.assign(
                new Error(`Stok "${s.product.name}" habis saat proses, silakan coba lagi`),
                { _http: 409 }
              );
            }

            await tx.stockLog.create({
              data: {
                type:          "SALE",
                change:        -item.quantity,
                noteBefore:    s.quantity,
                noteAfter:     s.quantity - item.quantity,
                note:          `Penjualan ${invoiceNumber}`,
                productId:     item.productId,
                branchId,
                userId:        session.user.id,
                transactionId: newTrx.id,
              },
            });

            // FIFO batch deduction — batch dengan expiry paling dekat dikurangi duluan (atomic per batch)
            const batches = await tx.productBatch.findMany({
              where:   { productId: item.productId, branchId, isActive: true, quantity: { gt: 0 } },
              orderBy: { expiryDate: "asc" },
            });

            let remaining = item.quantity;
            for (const batch of batches) {
              if (remaining <= 0) break;
              const deduct = Math.min(batch.quantity, remaining);
              // Atomic conditional decrement per batch
              await tx.productBatch.updateMany({
                where: { id: batch.id, quantity: { gte: deduct } },
                data:  { quantity: { decrement: deduct } },
              });
              remaining -= deduct;
            }
          }

          // Return transaksi lengkap untuk response
          return tx.transaction.findUnique({
            where: { id: newTrx.id },
            include: {
              items: { include: { product: { select: { name: true } } } },
              branch: { select: { name: true, address: true } },
              user:   { select: { name: true } },
            },
          });
        });

        break; // Sukses — keluar dari retry loop

      } catch (e) {
        // Invoice number collision (unique constraint) → retry
        if (e?.code === "P2002" && attempt < 2) {
          await new Promise((r) => setTimeout(r, 60 * (attempt + 1)));
          continue;
        }
        // Error dari validasi stok di dalam tx → kembalikan HTTP error
        if (e?._http) {
          return NextResponse.json({ error: e.message }, { status: e._http });
        }
        throw e;
      }
    }

    // Invalidate cache POS supaya refresh halaman dapat stok terbaru
    revalidatePath("/pos");

    return NextResponse.json(transaction, { status: 201 });

  } catch (e) {
    console.error("[POST /api/transactions]", e);
    return NextResponse.json({ error: "Gagal memproses transaksi" }, { status: 500 });
  }
}
