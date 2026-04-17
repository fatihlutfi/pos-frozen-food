import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

function adminOnly(session) {
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

// GET /api/admin/branches
export async function GET(req) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const branches = await prisma.branch.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { users: true, transactions: true } },
    },
  });

  return NextResponse.json(branches);
}

// POST /api/admin/branches
export async function POST(req) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const { name, address, phone } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nama cabang wajib diisi" }, { status: 400 });
    }

    const existing = await prisma.branch.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json({ error: "Nama cabang sudah digunakan" }, { status: 409 });
    }

    const branch = await prisma.branch.create({
      data: {
        name: name.trim(),
        address: address?.trim() || null,
        phone: phone?.trim() || null,
      },
      include: { _count: { select: { users: true, transactions: true } } },
    });

    // Buat stock entry untuk semua produk aktif di cabang baru
    const activeProducts = await prisma.product.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    if (activeProducts.length > 0) {
      await prisma.stock.createMany({
        data: activeProducts.map((p) => ({
          productId: p.id,
          branchId: branch.id,
          quantity: 0,
          lowStockAlert: 10,
        })),
        skipDuplicates: true,
      });

      await prisma.stockLog.createMany({
        data: activeProducts.map((p) => ({
          type: "INITIAL",
          change: 0,
          noteBefore: 0,
          noteAfter: 0,
          note: `Cabang baru: ${branch.name}`,
          productId: p.id,
          branchId: branch.id,
          userId: session.user.id,
        })),
      });
    }

    return NextResponse.json(branch, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/branches]", e);
    return NextResponse.json({ error: "Gagal membuat cabang" }, { status: 500 });
  }
}
