import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/shifts/[id] — detail shift + ringkasan transaksi
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const isAdmin = session.user.role === "ADMIN";

  const shift = await prisma.cashierShift.findUnique({
    where: { id },
    include: {
      user:   { select: { name: true, email: true } },
      branch: { select: { name: true, address: true } },
    },
  });

  if (!shift) return NextResponse.json({ error: "Shift tidak ditemukan" }, { status: 404 });

  // Kasir hanya bisa lihat shift milik sendiri
  if (!isAdmin && shift.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Agregat transaksi COMPLETED dalam shift ini — pisahkan tunai vs non-tunai
  const [cashAgg, nonCashAgg] = await Promise.all([
    // Tunai: grandTotal = uang bersih yang masuk laci (setelah kembalian)
    prisma.transaction.aggregate({
      where: { shiftId: id, status: "COMPLETED", paymentMethod: "CASH" },
      _sum: { grandTotal: true },
      _count: { id: true },
    }),
    // Non-tunai: Transfer Bank + QRIS (tidak masuk laci kas)
    prisma.transaction.aggregate({
      where: {
        shiftId: id,
        status: "COMPLETED",
        paymentMethod: { in: ["TRANSFER_BANK", "QRIS"] },
      },
      _sum: { grandTotal: true },
      _count: { id: true },
    }),
  ]);

  const totalCash     = cashAgg._sum.grandTotal    ?? 0;  // uang tunai bersih masuk laci
  const totalNonCash  = nonCashAgg._sum.grandTotal ?? 0;  // non-tunai (info saja)
  const totalRevenue  = totalCash + totalNonCash;          // grand total semua metode
  const totalTx       = (cashAgg._count.id ?? 0) + (nonCashAgg._count.id ?? 0);
  const cashTxCount   = cashAgg._count.id    ?? 0;
  const nonCashTxCount= nonCashAgg._count.id ?? 0;

  // Ekspektasi kas = modal awal + semua pemasukan tunai bersih
  const expectedClosing = shift.openingBalance + totalCash;

  return NextResponse.json({
    ...shift,
    totalCash,
    totalNonCash,
    totalRevenue,
    totalTx,
    cashTxCount,
    nonCashTxCount,
    expectedClosing,
  });
}

// PATCH /api/shifts/[id] — tutup shift
// Body: { closingBalance, note }
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const isAdmin = session.user.role === "ADMIN";

  try {
    const body = await req.json();

    const shift = await prisma.cashierShift.findUnique({ where: { id } });
    if (!shift) return NextResponse.json({ error: "Shift tidak ditemukan" }, { status: 404 });

    // Hanya pemilik atau admin yang boleh tutup shift
    if (!isAdmin && shift.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (shift.status !== "OPEN") {
      return NextResponse.json({ error: "Shift sudah ditutup" }, { status: 400 });
    }

    const closingBalance = parseInt(body.closingBalance);
    if (isNaN(closingBalance) || closingBalance < 0) {
      return NextResponse.json({ error: "Kas akhir tidak valid" }, { status: 400 });
    }

    const updated = await prisma.cashierShift.update({
      where: { id },
      data: {
        status:         "CLOSED",
        closingBalance,
        note:           body.note?.trim() || null,
        closedAt:       new Date(),
      },
      include: {
        user:   { select: { name: true } },
        branch: { select: { name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[PATCH /api/shifts/[id]]", e);
    return NextResponse.json({ error: "Gagal menutup shift" }, { status: 500 });
  }
}
