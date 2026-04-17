import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import TransactionList from "./TransactionList";

export const metadata = { title: "Riwayat Transaksi — POS Frozen Food" };

export default async function TransactionsPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session.user.role === "ADMIN";

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [transactions, branches] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        ...(isAdmin ? {} : { branchId: session.user.branchId }),
        createdAt: { gte: todayStart },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        items: { include: { product: { select: { name: true } } } },
        branch: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
    isAdmin
      ? prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
      : [],
  ]);

  return (
    <TransactionList
      initialTransactions={JSON.parse(JSON.stringify(transactions))}
      branches={branches}
      isAdmin={isAdmin}
      defaultBranchId={session.user.branchId ?? null}
    />
  );
}
