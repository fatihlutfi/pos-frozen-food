import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import PromoManager from "./PromoManager";

export const metadata = { title: "Promo — POS Frozen Food" };

export default async function PromoPage() {
  const session = await getServerSession(authOptions);
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const [products, branches] = await Promise.all([
    prisma.product.findMany({
      where:   { isActive: true },
      select:  { id: true, name: true, price: true, categoryId: true },
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({
      where:   { isActive: true },
      select:  { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Manajemen Promo</h1>
        <p className="text-sm text-gray-500 mt-0.5">Atur diskon qty, bundling, dan promo expiry</p>
      </div>
      <PromoManager products={products} branches={branches} />
    </div>
  );
}
