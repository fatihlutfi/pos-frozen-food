import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// PATCH /api/batches/[id] — edit expiryDate batch
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const { expiryDate } = await req.json();
    if (!expiryDate) {
      return NextResponse.json({ error: "expiryDate wajib diisi" }, { status: 400 });
    }

    const batch = await prisma.productBatch.update({
      where: { id },
      data: { expiryDate: new Date(expiryDate) },
      include: {
        product: { select: { id: true, name: true } },
        branch:  { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(batch);
  } catch (e) {
    if (e.code === "P2025") {
      return NextResponse.json({ error: "Batch tidak ditemukan" }, { status: 404 });
    }
    console.error("[PATCH /api/batches/[id]]", e);
    return NextResponse.json({ error: "Gagal mengubah batch" }, { status: 500 });
  }
}

// DELETE /api/batches/[id] — hapus batch dari database dan kurangi stok
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const batch = await prisma.productBatch.findUnique({
      where: { id },
      select: { id: true, productId: true, branchId: true, quantity: true, batchCode: true },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch tidak ditemukan" }, { status: 404 });
    }

    // Kurangi stok jika masih ada sisa quantity
    if (batch.quantity > 0) {
      const stockBefore = await prisma.stock.findUnique({
        where: { productId_branchId: { productId: batch.productId, branchId: batch.branchId } },
        select: { quantity: true },
      });

      await prisma.stock.updateMany({
        where: { productId: batch.productId, branchId: batch.branchId },
        data:  { quantity: { decrement: batch.quantity } },
      });

      await prisma.stockLog.create({
        data: {
          type:       "ADJUSTMENT",
          change:     -batch.quantity,
          noteBefore: stockBefore?.quantity ?? 0,
          noteAfter:  (stockBefore?.quantity ?? 0) - batch.quantity,
          note:       `Hapus batch ${batch.batchCode}`,
          productId:  batch.productId,
          branchId:   batch.branchId,
          userId:     session.user.id,
        },
      });
    }

    await prisma.productBatch.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e.code === "P2025") {
      return NextResponse.json({ error: "Batch tidak ditemukan" }, { status: 404 });
    }
    console.error("[DELETE /api/batches/[id]]", e);
    return NextResponse.json({ error: "Gagal menghapus batch" }, { status: 500 });
  }
}
