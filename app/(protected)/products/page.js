import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ProductManager from "./ProductManager";

export const metadata = { title: "Produk — POS Frozen Food" };

export default async function ProductsPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session.user.role === "ADMIN";
  const branchId = session.user.branchId;

  const [products, categories, branches] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: {
        category: true,
        stocks: {
          where: isAdmin ? {} : { branchId },
          include: { branch: true },
        },
        discountRules: {
          where:   { isActive: true },
          orderBy: [{ branchId: "asc" }, { minQty: "asc" }],
          include: { branch: { select: { name: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    isAdmin ? prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }) : [],
  ]);

  // Jangan kirim costPrice ke kasir — informasi bisnis sensitif
  const sanitizedProducts = isAdmin
    ? products
    : products.map(({ costPrice: _hidden, ...p }) => p);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Produk</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isAdmin ? "Kelola semua produk dan stok" : `Daftar produk — ${session.user.branchName}`}
        </p>
      </div>
      <ProductManager
        initialProducts={sanitizedProducts}
        categories={categories}
        branches={branches}
        isAdmin={isAdmin}
        currentBranchId={branchId}
      />
    </div>
  );
}
