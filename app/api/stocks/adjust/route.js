import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/stocks/adjust — Admin sesuaikan stok manual
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { productId, branchId, newQuantity, note } = await req.json();

    if (!productId || !branchId) {
      return NextResponse.json({ error: "productId dan branchId wajib diisi" }, { status: 400 });
    }
    if (newQuantity == null || newQuantity < 0) {
      return NextResponse.json({ error: "Jumlah stok tidak valid" }, { status: 400 });
    }

    const stock = await prisma.stock.findUnique({
      where: { productId_branchId: { productId, branchId } },
    });

    if (!stock) {
      return NextResponse.json({ error: "Data stok tidak ditemukan" }, { status: 404 });
    }

    const before = stock.quantity;
    const after = parseInt(newQuantity);
    const change = after - before;

    const updatedStock = await prisma.stock.update({
      where: { productId_branchId: { productId, branchId } },
      data: { quantity: after },
    });

    await prisma.stockLog.create({
      data: {
        type: "ADJUSTMENT",
        change,
        noteBefore: before,
        noteAfter: after,
        note: note?.trim() || "Penyesuaian stok manual",
        productId,
        branchId,
        userId: session.user.id,
      },
    });

    return NextResponse.json(updatedStock);
  } catch (e) {
    console.error("[stocks/adjust]", e);
    return NextResponse.json({ error: "Gagal menyesuaikan stok" }, { status: 500 });
  }
}
