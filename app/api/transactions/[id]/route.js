import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import prismaTx from "@/lib/prisma-tx";
import { NextResponse } from "next/server";

// GET /api/transactions/[id]
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { name: true } } } },
      branch: { select: { name: true, address: true } },
      user:   { select: { name: true } },
    },
  });

  if (!transaction) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });

  if (session.user.role === "KASIR" && transaction.branchId !== session.user.branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(transaction);
}

// PATCH /api/transactions/[id] — void transaksi (admin only), atomik
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Hanya admin yang dapat melakukan aksi ini" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  if (!body.voidReason?.trim()) {
    return NextResponse.json({ error: "Alasan void wajib diisi" }, { status: 400 });
  }

  // Baca transaksi + items di luar tx (pre-check)
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!transaction) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });

  if (transaction.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Hanya transaksi berstatus Selesai yang dapat di-void" },
      { status: 400 }
    );
  }

  try {
    const voidReason = body.voidReason.trim();

    const updated = await prismaTx.$transaction(async (tx) => {
      // 1. Update status ke VOIDED
      await tx.transaction.update({
        where: { id },
        data: { status: "VOIDED", voidReason, voidedAt: new Date() },
      });

      // 2. Kembalikan stok tiap item + catat log
      for (const item of transaction.items) {
        const stock = await tx.stock.findUnique({
          where: { productId_branchId: { productId: item.productId, branchId: transaction.branchId } },
        });

        if (stock) {
          const newQty = stock.quantity + item.quantity;

          await tx.stock.update({
            where: { productId_branchId: { productId: item.productId, branchId: transaction.branchId } },
            data:  { quantity: newQty },
          });

          await tx.stockLog.create({
            data: {
              type:          "RETURN",
              change:        item.quantity,
              noteBefore:    stock.quantity,
              noteAfter:     newQty,
              note:          `Void ${transaction.invoiceNumber} — ${voidReason}`,
              productId:     item.productId,
              branchId:      transaction.branchId,
              userId:        session.user.id,
              transactionId: transaction.id,
            },
          });
        }
      }

      // 3. Return transaksi yang sudah di-void
      return tx.transaction.findUnique({
        where: { id },
        include: {
          items: { include: { product: { select: { name: true } } } },
          branch: { select: { name: true, address: true } },
          user:   { select: { name: true } },
        },
      });
    });

    return NextResponse.json(updated);

  } catch (e) {
    console.error("[PATCH /api/transactions/[id]] void error:", e);
    return NextResponse.json({ error: "Gagal memproses void" }, { status: 500 });
  }
}
