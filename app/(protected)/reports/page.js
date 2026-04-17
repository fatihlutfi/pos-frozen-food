import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ReportView from "./ReportView";

export const metadata = { title: "Laporan Penjualan — POS Frozen Food" };

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session.user.role === "ADMIN";

  const branches = isAdmin
    ? await prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
    : [];

  return (
    <ReportView
      isAdmin={isAdmin}
      branches={branches}
      defaultBranchId={session.user.branchId ?? null}
      defaultBranchName={session.user.branchName ?? null}
    />
  );
}
