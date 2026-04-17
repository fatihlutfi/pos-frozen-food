import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import OpnameDetail from "./OpnameDetail";

export const metadata = { title: "Detail Stock Opname — POS Frozen Food" };

export default async function OpnameDetailPage({ params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;

  const opname = await prisma.stockOpname.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, name: true, address: true } },
      user:   { select: { name: true, email: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { product: { name: "asc" } },
      },
    },
  });

  if (!opname) notFound();

  return (
    <div className="p-4 sm:p-6">
      <OpnameDetail opname={JSON.parse(JSON.stringify(opname))} />
    </div>
  );
}
