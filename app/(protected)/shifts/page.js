import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ShiftList from "./ShiftList";

export const metadata = { title: "Shift Kasir — POS Frozen Food" };

export default async function ShiftsPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session.user.role === "ADMIN";

  const shifts = await prisma.cashierShift.findMany({
    where: isAdmin ? {} : { userId: session.user.id },
    include: {
      user:   { select: { name: true } },
      branch: { select: { name: true } },
      _count: { select: { transactions: true } },
    },
    orderBy: { openedAt: "desc" },
    take: 100,
  });

  // Hitung total revenue per shift
  const shiftIds = shifts.map((s) => s.id);
  const revenues = shiftIds.length > 0
    ? await prisma.transaction.groupBy({
        by: ["shiftId"],
        where: { shiftId: { in: shiftIds }, status: "COMPLETED" },
        _sum: { grandTotal: true },
        _count: { id: true },
      })
    : [];

  const revenueMap = Object.fromEntries(
    revenues.map((r) => [r.shiftId, { total: r._sum.grandTotal ?? 0, count: r._count.id }])
  );

  const enriched = shifts.map((s) => ({
    ...s,
    totalRevenue: revenueMap[s.id]?.total ?? 0,
    totalTx:      revenueMap[s.id]?.count ?? 0,
  }));

  const branches = isAdmin
    ? await prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];

  return (
    <div className="p-4 sm:p-6">
      <ShiftList
        initialShifts={JSON.parse(JSON.stringify(enriched))}
        isAdmin={isAdmin}
        branches={branches}
        currentUserId={session.user.id}
        currentBranchId={session.user.branchId ?? null}
      />
    </div>
  );
}
