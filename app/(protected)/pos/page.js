import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import POSInterface from "./POSInterface";

export const metadata = { title: "Kasir (POS) — POS Frozen Food" };

// Cache produk + kategori 30 detik — data ini jarang berubah saat toko buka
const getCachedProductsAndCategories = unstable_cache(
  async (branchId, isAdmin) => {
    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: { isActive: true },
        include: {
          category: true,
          stocks: {
            where: isAdmin ? {} : { branchId },
          },
          discountRules: {
            where:   { isActive: true },
            orderBy: [{ branchId: "asc" }, { minQty: "asc" }],
          },
        },
        orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      }),
      prisma.category.findMany({ orderBy: { name: "asc" } }),
    ]);
    return { products, categories };
  },
  ["pos-products-categories"],
  { revalidate: 30 }
);

export default async function POSPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session.user.role === "ADMIN";
  const branchId = session.user.branchId ?? null;

  // Produk & kategori dari cache — data shift & batch harus fresh tiap render
  const [{ products, categories }, branches, activeShift, batchAlerts] = await Promise.all([
    getCachedProductsAndCategories(isAdmin ? "all" : branchId, isAdmin),
    isAdmin
      ? prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    !isAdmin
      ? prisma.cashierShift.findFirst({
          where: { userId: session.user.id, status: "OPEN" },
          select: { id: true, openingBalance: true, openedAt: true, branchId: true },
        })
      : Promise.resolve(null),
    prisma.productBatch.findMany({
      where: {
        isActive: true,
        quantity: { gt: 0 },
        expiryDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        ...(isAdmin ? {} : { branchId }),
      },
      select: { productId: true, branchId: true, expiryDate: true, quantity: true },
      orderBy: { expiryDate: "asc" },
    }),
  ]);

  // Jangan kirim costPrice ke kasir di client
  const sanitizedProducts = isAdmin
    ? products
    : products.map(({ costPrice: _hidden, ...p }) => p);

  return (
    <POSInterface
      products={sanitizedProducts}
      categories={categories}
      branches={branches}
      isAdmin={isAdmin}
      defaultBranchId={branchId}
      defaultBranchName={session.user.branchName ?? null}
      cashierName={session.user.name}
      userId={session.user.id}
      initialShift={activeShift ? JSON.parse(JSON.stringify(activeShift)) : null}
      batchAlerts={JSON.parse(JSON.stringify(batchAlerts))}
    />
  );
}
