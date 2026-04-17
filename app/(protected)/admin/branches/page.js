import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import BranchManager from "./BranchManager";

export const metadata = { title: "Manajemen Cabang — POS Frozen Food" };

export default async function BranchesPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");

  const branches = await prisma.branch.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true, transactions: true } } },
  });

  return <BranchManager initialBranches={JSON.parse(JSON.stringify(branches))} />;
}
