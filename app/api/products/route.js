import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const CreateProductSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  price:       z.number().int().positive(),
  costPrice:   z.number().int().nonnegative().optional(),
  categoryId:  z.string().min(1),
  imageUrl:    z.string().url().max(2000).optional().or(z.literal("")),
});

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
      take: 500, // POS membutuhkan semua produk — hard-capped di 500
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
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
    }

    const parsed = CreateProductSchema.safeParse({
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

    const { name, description, price, costPrice, categoryId, imageUrl } = parsed.data;

    // name, price, categoryId sudah divalidasi Zod di atas — cek kategori exist
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 404 });

    // Buat produk + stock awal 0 untuk semua cabang aktif
    const branches = await prisma.branch.findMany({ where: { isActive: true } });

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        price,
        costPrice: costPrice ?? 0,
        categoryId,
        imageUrl: imageUrl?.trim() || null,
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
