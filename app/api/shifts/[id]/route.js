import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const CloseShiftSchema = z.object({
  closingBalance: z.number().int().nonnegative(),
  note:           z.string().max(500).optional(),
});

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
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
    }
    const parsed = CloseShiftSchema.safeParse({
      ...body,
      closingBalance: typeof body.closingBalance === "string" ? parseInt(body.closingBalance) : body.closingBalance,
    });
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      );
      return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
    }

    const shift = await prisma.cashierShift.findUnique({ where: { id } });
    if (!shift) return NextResponse.json({ error: "Shift tidak ditemukan" }, { status: 404 });

    // Hanya pemilik atau admin yang boleh tutup shift
    if (!isAdmin && shift.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (shift.status !== "OPEN") {
      return NextResponse.json({ error: "Shift sudah ditutup" }, { status: 400 });
    }

    const updated = await prisma.cashierShift.update({
      where: { id },
      data: {
        status:         "CLOSED",
        closingBalance: parsed.data.closingBalance,
        note:           parsed.data.note?.trim() || null,
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
