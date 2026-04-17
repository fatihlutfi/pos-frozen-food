import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import UserManager from "./UserManager";

export const metadata = { title: "Manajemen User — POS Frozen Food" };

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");

  const [users, branches] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, email: true, role: true,
        isActive: true, createdAt: true, branchId: true,
        branch: { select: { name: true } },
      },
    }),
    prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <UserManager
      initialUsers={JSON.parse(JSON.stringify(users))}
      branches={branches}
      currentUserId={session.user.id}
    />
  );
}
