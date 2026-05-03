import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const CreateOpnameSchema = z.object({
  branchId: z.string().min(1),
  note:     z.string().max(500).optional(),
});

// GET /api/stock-opname — daftar sesi opname (admin only)
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status")   || undefined;
  const branchId = searchParams.get("branchId") || undefined;
  const limit    = Math.min(parseInt(searchParams.get("limit")  || "50"), 200);
  const offset   = Math.max(parseInt(searchParams.get("offset") || "0"),  0);

  const where = {
    ...(status   && { status }),
    ...(branchId && { branchId }),
  };

  const [opnames, total] = await Promise.all([
    prisma.stockOpname.findMany({
      where,
      include: {
        branch: { select: { name: true } },
        user:   { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take:  limit,
      skip:  offset,
    }),
    prisma.stockOpname.count({ where }),
  ]);

  return NextResponse.json(opnames, {
    headers: {
      "X-Total-Count": String(total),
      "X-Limit":       String(limit),
      "X-Offset":      String(offset),
    },
  });
}

// POST /api/stock-opname — buat sesi opname baru (admin only)
// Body: { branchId, note? }
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

    const parsed = CreateOpnameSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      );
      return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
    }

    const { branchId, note } = parsed.data;

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
