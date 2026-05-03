import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const UpdateBranchSchema = z.object({
  name:     z.string().min(1).max(100).optional(),
  address:  z.string().max(300).optional().nullable(),
  phone:    z.string().max(20).optional().nullable(),
  isActive: z.boolean().optional(),
});

function adminOnly(session) {
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

// GET /api/admin/branches/[id] — ringkasan stok cabang
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const { id } = await params;

  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) return NextResponse.json({ error: "Cabang tidak ditemukan" }, { status: 404 });

  const stocks = await prisma.stock.findMany({
    where: { branchId: id },
    include: {
      product: {
        select: { name: true, isActive: true, category: { select: { name: true } } },
      },
    },
    orderBy: { quantity: "asc" },
  });

  const totalProducts  = stocks.length;
  const totalUnits     = stocks.reduce((s, st) => s + st.quantity, 0);
  const outOfStock     = stocks.filter((st) => st.quantity === 0).length;
  const lowStock       = stocks.filter((st) => st.quantity > 0 && st.quantity <= 20).length;

  return NextResponse.json({
    branch: { id: branch.id, name: branch.name },
    summary: { totalProducts, totalUnits, outOfStock, lowStock },
    stocks: stocks.map((st) => ({
      productName: st.product.name,
      categoryName: st.product.category.name,
      isActive: st.product.isActive,
      quantity: st.quantity,
      lowStockAlert: st.lowStockAlert,
    })),
  });
}

// PATCH /api/admin/branches/[id] — update name/address/phone/isActive
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const { id } = await params;
  const rawBody = await req.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") {
    return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
  }
  const parsed = UpdateBranchSchema.safeParse(rawBody);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) =>
      i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
    );
    return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) return NextResponse.json({ error: "Cabang tidak ditemukan" }, { status: 404 });

    // Cek duplikat nama jika name berubah
    if (body.name && body.name.trim() !== branch.name) {
      const dup = await prisma.branch.findUnique({ where: { name: body.name.trim() } });
      if (dup) return NextResponse.json({ error: "Nama cabang sudah digunakan" }, { status: 409 });
    }

    const data = {};
    if (body.name !== undefined)     data.name    = body.name.trim();
    if (body.address !== undefined)  data.address = body.address?.trim() || null;
    if (body.phone !== undefined)    data.phone   = body.phone?.trim() || null;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const updated = await prisma.branch.update({
      where: { id },
      data,
      include: { _count: { select: { users: true, transactions: true } } },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[PATCH /api/admin/branches/[id]]", e);
    return NextResponse.json({ error: "Gagal mengupdate cabang" }, { status: 500 });
  }
}
