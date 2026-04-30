import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/bundles?branchId=&activeOnly=true
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const branchId  = searchParams.get("branchId");
  const activeOnly = searchParams.get("activeOnly") === "true";

  const now = new Date();

  try {
    const bundles = await prisma.bundle.findMany({
      where: {
        ...(activeOnly ? {
          isActive: true,
          OR: [
            { startDate: null },
            { startDate: { lte: now } },
          ],
          AND: [
            {
              OR: [
                { endDate: null },
                { endDate: { gte: now } },
              ],
            },
          ],
        } : {}),
        ...(branchId ? {
          OR: [{ branchId }, { branchId: null }],
        } : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, price: true, isActive: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(bundles);
  } catch (e) {
    console.error("[GET /api/bundles]", e);
    return NextResponse.json({ error: "Gagal mengambil bundling" }, { status: 500 });
  }
}

// POST /api/bundles
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { name, bundlePrice, branchId, startDate, endDate, isActive, items } = await req.json();

    if (!name?.trim())   return NextResponse.json({ error: "Nama paket wajib diisi" }, { status: 400 });
    if (!bundlePrice || parseInt(bundlePrice) <= 0)
      return NextResponse.json({ error: "Harga bundling harus lebih dari 0" }, { status: 400 });
    if (!items || items.length < 2)
      return NextResponse.json({ error: "Bundling harus memiliki minimal 2 produk" }, { status: 400 });

    const bundle = await prisma.bundle.create({
      data: {
        name:        name.trim(),
        bundlePrice: parseInt(bundlePrice),
        branchId:    branchId || null,
        startDate:   startDate ? new Date(startDate) : null,
        endDate:     endDate   ? new Date(endDate)   : null,
        isActive:    isActive ?? true,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity:  parseInt(item.quantity) || 1,
          })),
        },
      },
      include: {
        branch: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, price: true, isActive: true } },
          },
        },
      },
    });

    return NextResponse.json(bundle, { status: 201 });
  } catch (e) {
    console.error("[POST /api/bundles]", e);
    return NextResponse.json({ error: "Gagal membuat bundling" }, { status: 500 });
  }
}
