import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/shifts — list shift
// Admin: semua shift (filter by branchId, status)
// Kasir: shift milik sendiri
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const isAdmin = session.user.role === "ADMIN";
  const statusFilter = searchParams.get("status") || undefined;
  const branchFilter = isAdmin ? searchParams.get("branchId") || undefined : session.user.branchId;
  const limit = parseInt(searchParams.get("limit") || "50");

  const shifts = await prisma.cashierShift.findMany({
    where: {
      ...(isAdmin ? {} : { userId: session.user.id }),
      ...(branchFilter ? { branchId: branchFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      user:   { select: { name: true } },
      branch: { select: { name: true } },
      _count: { select: { transactions: true } },
    },
    orderBy: { openedAt: "desc" },
    take: limit,
  });

  // Hitung total revenue per shift dari transaksi COMPLETED
  const shiftIds = shifts.map((s) => s.id);
  const revenues = await prisma.transaction.groupBy({
    by: ["shiftId"],
    where: { shiftId: { in: shiftIds }, status: "COMPLETED" },
    _sum: { grandTotal: true, amountPaid: true },
    _count: { id: true },
  });

  const revenueMap = Object.fromEntries(
    revenues.map((r) => [r.shiftId, { total: r._sum.grandTotal ?? 0, count: r._count.id }])
  );

  return NextResponse.json(
    shifts.map((s) => ({
      ...s,
      totalRevenue: revenueMap[s.id]?.total ?? 0,
      totalTx: revenueMap[s.id]?.count ?? 0,
    }))
  );
}

// POST /api/shifts — buka shift baru
// Body: { openingBalance, branchId (admin opsional) }
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const isAdmin = session.user.role === "ADMIN";

    const branchId = isAdmin
      ? (body.branchId || session.user.branchId)
      : session.user.branchId;

    if (!branchId) {
      return NextResponse.json({ error: "Cabang wajib dipilih" }, { status: 400 });
    }

    const openingBalance = parseInt(body.openingBalance) ?? 0;
    if (isNaN(openingBalance) || openingBalance < 0) {
      return NextResponse.json({ error: "Modal awal tidak valid" }, { status: 400 });
    }

    // Cek apakah user sudah punya shift OPEN di cabang ini
    const existing = await prisma.cashierShift.findFirst({
      where: { userId: session.user.id, branchId, status: "OPEN" },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Anda sudah memiliki shift yang sedang berjalan di cabang ini" },
        { status: 409 }
      );
    }

    const shift = await prisma.cashierShift.create({
      data: {
        openingBalance,
        userId: session.user.id,
        branchId,
      },
      include: {
        user:   { select: { name: true } },
        branch: { select: { name: true } },
      },
    });

    return NextResponse.json(shift, { status: 201 });
  } catch (e) {
    console.error("[POST /api/shifts]", e);
    return NextResponse.json({ error: "Gagal membuka shift" }, { status: 500 });
  }
}
