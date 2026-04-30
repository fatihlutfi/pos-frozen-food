import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT /api/bundles/[id]
export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { name, bundlePrice, branchId, startDate, endDate, isActive, items } = await req.json();

    if (!name?.trim())   return NextResponse.json({ error: "Nama paket wajib diisi" }, { status: 400 });
    if (!bundlePrice || parseInt(bundlePrice) <= 0)
      return NextResponse.json({ error: "Harga bundling harus lebih dari 0" }, { status: 400 });
    if (!items || items.length < 2)
      return NextResponse.json({ error: "Bundling harus memiliki minimal 2 produk" }, { status: 400 });

    // Delete existing items, recreate with new list
    await prisma.bundleItem.deleteMany({ where: { bundleId: id } });

    const bundle = await prisma.bundle.update({
      where: { id },
      data: {
        name:        name.trim(),
        bundlePrice: parseInt(bundlePrice),
        branchId:    branchId || null,
        startDate:   startDate ? new Date(startDate) : null,
        endDate:     endDate   ? new Date(endDate)   : null,
        isActive:    isActive ?? true,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity:  parseInt(item.quantity) || 1,
          })),
        },
      },
      include: {
        branch: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, price: true, isActive: true } },
          },
        },
      },
    });

    return NextResponse.json(bundle);
  } catch (e) {
    if (e.code === "P2025") return NextResponse.json({ error: "Bundling tidak ditemukan" }, { status: 404 });
    console.error("[PUT /api/bundles/[id]]", e);
    return NextResponse.json({ error: "Gagal mengubah bundling" }, { status: 500 });
  }
}

// DELETE /api/bundles/[id]
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { id } = await params;
    await prisma.bundle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e.code === "P2025") return NextResponse.json({ error: "Bundling tidak ditemukan" }, { status: 404 });
    console.error("[DELETE /api/bundles/[id]]", e);
    return NextResponse.json({ error: "Gagal menghapus bundling" }, { status: 500 });
  }
}
