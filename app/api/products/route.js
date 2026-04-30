import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const search = searchParams.get("search");
  const branchId =
    session.user.role === "KASIR"
      ? session.user.branchId
      : searchParams.get("branchId");

  try {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      include: {
        category: true,
        stocks: {
          where: branchId ? { branchId } : {},
          include: { branch: true },
        },
      },
      orderBy: { name: "asc" },
      take: 500,
    });
    return NextResponse.json(products);
  } catch (e) {
    console.error("[GET /api/products]", e);
    return NextResponse.json({ error: "Gagal mengambil produk" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { name, description, price, costPrice, categoryId } = await req.json();

    if (!name?.trim()) return NextResponse.json({ error: "Nama produk wajib diisi" }, { status: 400 });
    if (!price || price <= 0) return NextResponse.json({ error: "Harga jual tidak valid" }, { status: 400 });
    if (!categoryId) return NextResponse.json({ error: "Kategori wajib dipilih" }, { status: 400 });

    // Cek kategori exist
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 404 });

    // Buat produk + stock awal 0 untuk semua cabang aktif
    const branches = await prisma.branch.findMany({ where: { isActive: true } });

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        price:       parseInt(price),
        costPrice:   parseInt(costPrice) || 0,
        categoryId,
        stocks: {
          create: branches.map((b) => ({
            branchId: b.id,
            quantity: 0,
            lowStockAlert: 10,
          })),
        },
      },
      include: {
        category: true,
        stocks: { include: { branch: true } },
        discountRules: { where: { isActive: true }, orderBy: [{ branchId: "asc" }, { minQty: "asc" }], include: { branch: { select: { name: true } } } },
      },
    });

    // Catat stock log awal
    await prisma.stockLog.createMany({
      data: branches.map((b) => ({
        type: "INITIAL",
        change: 0,
        noteBefore: 0,
        noteAfter: 0,
        note: "Produk baru dibuat",
        productId: product.id,
        branchId: b.id,
        userId: session.user.id,
      })),
    });

    return NextResponse.json(product, { status: 201 });
  } catch (e) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Nama produk sudah ada" }, { status: 409 });
    }
    console.error("[POST /api/products]", e);
    return NextResponse.json({ error: "Gagal membuat produk" }, { status: 500 });
  }
}
