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

  // Auto-sync: tambahkan produk aktif yang belum ada di draft
  let autoSyncedCount = 0;
  if (opname.status === "DRAFT") {
    const existingProductIds = new Set(opname.items.map((i) => i.productId));
    const activeStocks = await prisma.stock.findMany({
      where: { branchId: opname.branchId, product: { isActive: true } },
      select: { productId: true, quantity: true },
    });
    const missing = activeStocks.filter((s) => !existingProductIds.has(s.productId));
    if (missing.length > 0) {
      await prisma.stockOpnameItem.createMany({
        data: missing.map((s) => ({
          opnameId:    opname.id,
          productId:   s.productId,
          systemQty:   s.quantity,
          physicalQty: null,
        })),
      });
      autoSyncedCount = missing.length;

      // Re-fetch opname dengan items yang sudah diperbarui
      const updated = await prisma.stockOpname.findUnique({
        where: { id: opname.id },
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
      return (
        <div className="p-4 sm:p-6">
          <OpnameDetail
            opname={JSON.parse(JSON.stringify(updated))}
            autoSyncedCount={autoSyncedCount}
          />
        </div>
      );
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <OpnameDetail
        opname={JSON.parse(JSON.stringify(opname))}
        autoSyncedCount={autoSyncedCount}
      />
    </div>
  );
}
