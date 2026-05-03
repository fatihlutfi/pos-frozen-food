import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";

const AdjustStockSchema = z.object({
  productId:   z.string().min(1),
  branchId:    z.string().min(1),
  newQuantity: z.number().int().nonnegative().max(999999),
  note:        z.string().max(500).optional(),
});

// POST /api/stocks/adjust — Admin sesuaikan stok manual
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
    }
    const parsed = AdjustStockSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      );
      return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
    }
    const { productId, branchId, newQuantity, note } = parsed.data;

    const stock = await prisma.stock.findUnique({
      where: { productId_branchId: { productId, branchId } },
    });

    if (!stock) {
      return NextResponse.json({ error: "Data stok tidak ditemukan" }, { status: 404 });
    }

    const before = stock.quantity;
    const after = newQuantity;
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

    auditLog("UPDATE", "stock", {
      actorId:    session.user.id,
      actorEmail: session.user.email,
      targetId:   `${productId}:${branchId}`,
      meta: { before, after, change },
    });

    return NextResponse.json(updatedStock);
  } catch (e) {
    console.error("[stocks/adjust]", e);
    return NextResponse.json({ error: "Gagal menyesuaikan stok" }, { status: 500 });
  }
}
