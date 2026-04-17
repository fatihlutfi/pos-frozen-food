import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import CategoryManager from "./CategoryManager";

export const metadata = { title: "Kategori — POS Frozen Food" };

export default async function CategoriesPage() {
  const session = await getServerSession(authOptions);
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: { where: { isActive: true } } } } },
  });

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Kategori Produk</h1>
        <p className="text-sm text-gray-500 mt-0.5">Kelola kategori untuk pengelompokan produk</p>
      </div>
      <CategoryManager initialCategories={categories} />
    </div>
  );
}
