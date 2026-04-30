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
    const { name } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "Nama kategori wajib diisi" }, { status: 400 });
    }

    const { id } = await params;
    const category = await prisma.category.update({
      where: { id },
      data: { name: name.trim() },
    });
    return NextResponse.json(category);
  } catch (e) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Nama kategori sudah ada" }, { status: 409 });
    }
    if (e.code === "P2025") {
      return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 404 });
    }
    console.error("[PUT /api/categories/[id]]", e);
    return NextResponse.json({ error: "Gagal mengubah kategori" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { id } = await params;

    // Cek apakah kategori masih dipakai produk
    const productCount = await prisma.product.count({ where: { categoryId: id } });
    if (productCount > 0) {
      return NextResponse.json(
        { error: `Kategori masih digunakan oleh ${productCount} produk` },
        { status: 409 }
      );
    }

    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e.code === "P2025") {
      return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 404 });
    }
    console.error("[DELETE /api/categories/[id]]", e);
    return NextResponse.json({ error: "Gagal menghapus kategori" }, { status: 500 });
  }
}
