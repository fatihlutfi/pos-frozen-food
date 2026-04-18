import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/transactions — untuk halaman riwayat
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // Kasir hanya bisa lihat cabangnya sendiri
  const branchId = session.user.role === "KASIR"
    ? session.user.branchId
    : searchParams.get("branchId") || undefined;

  const status = searchParams.get("status") || undefined;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const limit = parseInt(searchParams.get("limit") || "100");

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo
              ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) }
              : {}),
          },
        }
      : {}),
  };

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      items: { include: { product: { select: { name: true } } } },
      branch: { select: { name: true, address: true } },
      user: { select: { name: true } },
    },
  });

  return NextResponse.json(transactions);
}

// POST /api/transactions — buat transaksi baru
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { items, paymentMethod, discountAmount, amountPaid, note, branchId: bodyBranchId } = body;

    // Tentukan cabang
    const branchId = session.user.role === "KASIR"
      ? session.user.branchId
      : bodyBranchId;

    // Validasi shift untuk kasir
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

    if (!branchId) {
      return NextResponse.json({ error: "Cabang wajib dipilih" }, { status: 400 });
    }
    if (!items?.length) {
      return NextResponse.json({ error: "Keranjang belanja kosong" }, { status: 400 });
    }
    if (!["CASH", "TRANSFER_BANK", "QRIS"].includes(paymentMethod)) {
      return NextResponse.json({ error: "Metode pembayaran tidak valid" }, { status: 400 });
    }

    // Ambil stok + costPrice semua produk dalam transaksi sekaligus
    const productIds = items.map((i) => i.productId);
    const stocks = await prisma.stock.findMany({
      where: { productId: { in: productIds }, branchId },
      include: { product: { select: { name: true, costPrice: true } } },
    });

    // Validasi stok tiap item
    for (const item of items) {
      const stock = stocks.find((s) => s.productId === item.productId);
      if (!stock) {
        return NextResponse.json({ error: "Produk tidak ditemukan di cabang ini" }, { status: 404 });
      }
      if (stock.quantity < item.quantity) {
        return NextResponse.json(
          { error: `Stok "${stock.product.name}" tidak cukup. Tersisa: ${stock.quantity}` },
          { status: 409 }
        );
      }
    }

    // Hitung total
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const discount = Math.max(0, discountAmount || 0);
    const grandTotal = Math.max(0, subtotal - discount);
    const paid = paymentMethod === "CASH" ? (amountPaid || 0) : grandTotal;
    const change = Math.max(0, paid - grandTotal);

    if (paymentMethod === "CASH" && paid < grandTotal) {
      return NextResponse.json({ error: "Jumlah pembayaran kurang dari total belanja" }, { status: 400 });
    }

    // Generate nomor invoice: INV-YYYYMMDD-XXXX
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const dateStr = todayStart.toISOString().slice(0, 10).replace(/-/g, "");
    const countToday = await prisma.transaction.count({
      where: { createdAt: { gte: todayStart } },
    });
    const invoiceNumber = `INV-${dateStr}-${String(countToday + 1).padStart(4, "0")}`;

    // Simpan transaksi + items
    const transaction = await prisma.transaction.create({
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
            const stock = stocks.find((s) => s.productId === item.productId);
            return {
              productId:       item.productId,
              quantity:        item.quantity,
              price:           item.price,
              costPrice:       stock?.product?.costPrice ?? 0,
              discountPercent: item.discountPercent ?? 0,
              subtotal:        item.price * item.quantity,
            };
          }),
        },
      },
      include: {
        items: { include: { product: { select: { name: true } } } },
        branch: { select: { name: true, address: true } },
        user: { select: { name: true } },
      },
    });

    // Kurangi stok & catat log (sequential — pgBouncer tidak support $transaction array)
    for (const item of items) {
      const stock = stocks.find((s) => s.productId === item.productId);
      const newQty = stock.quantity - item.quantity;

      await prisma.stock.update({
        where: { productId_branchId: { productId: item.productId, branchId } },
        data: { quantity: newQty },
      });

      await prisma.stockLog.create({
        data: {
          type: "SALE",
          change: -item.quantity,
          noteBefore: stock.quantity,
          noteAfter: newQty,
          note: `Penjualan ${invoiceNumber}`,
          productId: item.productId,
          branchId,
          userId: session.user.id,
          transactionId: transaction.id,
        },
      });

      // FIFO batch deduction — kurangi dari batch dengan expiry paling dekat
      const batches = await prisma.productBatch.findMany({
        where: { productId: item.productId, branchId, isActive: true, quantity: { gt: 0 } },
        orderBy: { expiryDate: "asc" },
      });

      let remaining = item.quantity;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const deduct = Math.min(batch.quantity, remaining);
        await prisma.productBatch.update({
          where: { id: batch.id },
          data: { quantity: batch.quantity - deduct },
        });
        remaining -= deduct;
      }
    }

    return NextResponse.json(transaction, { status: 201 });
  } catch (e) {
    console.error("[POST /api/transactions]", e);
    return NextResponse.json({ error: "Gagal memproses transaksi" }, { status: 500 });
  }
}
