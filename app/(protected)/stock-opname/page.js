import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import StockOpnameList from "./StockOpnameList";

export const metadata = { title: "Stock Opname — POS Frozen Food" };

export default async function StockOpnamePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const [opnames, branches] = await Promise.all([
    prisma.stockOpname.findMany({
      include: {
        branch: { select: { name: true } },
        user:   { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.branch.findMany({
      where:   { isActive: true },
      orderBy: { name: "asc" },
      select:  { id: true, name: true },
    }),
  ]);

  return (
    <div className="p-4 sm:p-6">
      <StockOpnameList
        initialOpnames={JSON.parse(JSON.stringify(opnames))}
        branches={branches}
      />
    </div>
  );
}
