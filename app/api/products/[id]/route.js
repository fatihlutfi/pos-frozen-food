import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { name, description, price, costPrice, categoryId, isActive, storageZone } = await req.json();

    if (!name?.trim()) return NextResponse.json({ error: "Nama produk wajib diisi" }, { status: 400 });
    if (!price || price <= 0) return NextResponse.json({ error: "Harga jual tidak valid" }, { status: 400 });

    const VALID_ZONES = ["FROZEN", "CHILLED", "AMBIENT", "DISPLAY_ONLY"];
    if (storageZone && !VALID_ZONES.includes(storageZone)) {
      return NextResponse.json({ error: "Storage zone tidak valid" }, { status: 400 });
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        price:       parseInt(price),
        costPrice:   parseInt(costPrice) || 0,
        categoryId,
        isActive:    isActive ?? true,
        ...(storageZone ? { storageZone } : {}),
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
