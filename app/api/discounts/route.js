import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/discounts?branchId=&productId=
// Mengembalikan semua aturan diskon qty dengan info produk dan cabang
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const branchId  = searchParams.get("branchId");
  const productId = searchParams.get("productId");

  try {
    const rules = await prisma.productDiscountRule.findMany({
      where: {
        isActive: true,
        ...(branchId  ? { branchId  } : {}),
        ...(productId ? { productId } : {}),
      },
      include: {
        product: { select: { id: true, name: true, price: true } },
        branch:  { select: { id: true, name: true } },
      },
      orderBy: [{ product: { name: "asc" } }, { branchId: "asc" }, { minQty: "asc" }],
    });
    return NextResponse.json(rules);
  } catch (e) {
    console.error("[GET /api/discounts]", e);
    return NextResponse.json({ error: "Gagal mengambil aturan diskon" }, { status: 500 });
  }
}
