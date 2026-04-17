import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/stock-opname — daftar sesi opname (admin only)
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status")   || undefined;
  const branchId = searchParams.get("branchId") || undefined;
  const limit    = parseInt(searchParams.get("limit") || "50");

  const opnames = await prisma.stockOpname.findMany({
    where: {
      ...(status   && { status }),
      ...(branchId && { branchId }),
    },
    include: {
      branch: { select: { name: true } },
      user:   { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(opnames);
}

// POST /api/stock-opname — buat sesi opname baru (admin only)
// Body: { branchId, note? }
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { branchId, note } = await req.json();

    if (!branchId) {
      return NextResponse.json({ error: "branchId wajib diisi" }, { status: 400 });
    }

    // Cek cabang ada
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return NextResponse.json({ error: "Cabang tidak ditemukan" }, { status: 404 });
    }

    // Ambil semua stok aktif di cabang ini
    const stocks = await prisma.stock.findMany({
      where: {
        branchId,
        product: { isActive: true },
      },
      include: {
        product: { select: { id: true, name: true } },
      },
      orderBy: { product: { name: "asc" } },
    });

    if (stocks.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada produk aktif dengan stok di cabang ini" },
        { status: 400 }
      );
    }

    // Buat sesi opname + items sekaligus
    const opname = await prisma.stockOpname.create({
      data: {
        branchId,
        userId: session.user.id,
        note:   note?.trim() || null,
        items: {
          create: stocks.map((s) => ({
            productId:  s.productId,
            systemQty:  s.quantity,
            physicalQty: null,
          })),
        },
      },
      include: {
        branch: { select: { name: true } },
        user:   { select: { name: true } },
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json(opname, { status: 201 });
  } catch (e) {
    console.error("[POST /api/stock-opname]", e);
    return NextResponse.json({ error: "Gagal membuat sesi opname" }, { status: 500 });
  }
}
