import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const UpdateProductSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  price:       z.number().int().positive(),
  costPrice:   z.number().int().nonnegative().optional(),
  categoryId:  z.string().min(1).optional(),
  isActive:    z.boolean().optional(),
});

export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
    }
    const parsed = UpdateProductSchema.safeParse({
      ...body,
      price:     typeof body.price     === "string" ? parseInt(body.price)     : body.price,
      costPrice: typeof body.costPrice === "string" ? parseInt(body.costPrice) : body.costPrice,
    });
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      );
      return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        name:        parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        price:       parsed.data.price,
        costPrice:   parsed.data.costPrice ?? 0,
        categoryId:  parsed.data.categoryId,
        isActive:    parsed.data.isActive ?? true,
      },
      include: {
        category: true,
        stocks: { include: { branch: true } },
        discountRules: {
          where: { isActive: true },
          orderBy: [{ branchId: "asc" }, { minQty: "asc" }],
          include: { branch: { select: { name: true } } },
        },
      },
    });
    return NextResponse.json(product);
  } catch (e) {
    if (e.code === "P2002") return NextResponse.json({ error: "Nama produk sudah ada" }, { status: 409 });
    if (e.code === "P2025") return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
    console.error("[PUT /api/products/[id]]", e);
    return NextResponse.json({ error: "Gagal mengubah produk" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { id } = await params;

    // Soft delete — nonaktifkan produk
    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e.code === "P2025") return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
    console.error("[DELETE /api/products/[id]]", e);
    return NextResponse.json({ error: "Gagal menghapus produk" }, { status: 500 });
  }
}
