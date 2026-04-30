import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// Helper: hitung expiry status dari expiryDate
export function getExpiryStatus(expiryDate) {
  const now = new Date();
  const diffMs = new Date(expiryDate) - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0)  return { status: "expired",   label: "Expired",       autoDiscount: 0,   blocked: true  };
  if (diffDays < 7)  return { status: "critical",   label: "Deal Today",    autoDiscount: 25,  blocked: false };
  if (diffDays < 30) return { status: "warning",    label: "Segera Habis",  autoDiscount: 15,  blocked: false };
  if (diffDays < 90) return { status: "soon",       label: "Segera Promo",  autoDiscount: 0,   blocked: false };
  return               { status: "good",       label: "Aman",          autoDiscount: 0,   blocked: false };
}

// GET /api/batches?productId=&branchId=&includeExpired=
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const productId      = searchParams.get("productId");
  const branchId       = searchParams.get("branchId")
    || (session.user.role === "KASIR" ? session.user.branchId : undefined);
  const includeExpired = searchParams.get("includeExpired") === "true";

  try {
    const batches = await prisma.productBatch.findMany({
      where: {
        ...(productId ? { productId } : {}),
        ...(branchId  ? { branchId  } : {}),
        isActive: true,
        quantity: { gt: 0 },
        ...(!includeExpired ? { expiryDate: { gte: new Date() } } : {}),
      },
      include: {
        product: { select: { id: true, name: true } },
        branch:  { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: "asc" },
    });

    const enriched = batches.map((b) => ({
      ...b,
      expiryInfo: getExpiryStatus(b.expiryDate),
    }));

    return NextResponse.json(enriched);
  } catch (e) {
    console.error("[GET /api/batches]", e);
    return NextResponse.json({ error: "Gagal mengambil batch" }, { status: 500 });
  }
}

// POST /api/batches — tambah batch baru (admin only)
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { productId, branchId, batchCode, productionDate, expiryDate, quantity } = await req.json();

    if (!productId)   return NextResponse.json({ error: "productId wajib diisi" }, { status: 400 });
    if (!branchId)    return NextResponse.json({ error: "branchId wajib diisi" }, { status: 400 });
    if (!batchCode?.trim()) return NextResponse.json({ error: "Kode batch wajib diisi" }, { status: 400 });
    if (!expiryDate)  return NextResponse.json({ error: "Tanggal expired wajib diisi" }, { status: 400 });
    if (!quantity || parseInt(quantity) <= 0) {
      return NextResponse.json({ error: "Quantity harus lebih dari 0" }, { status: 400 });
    }

    const qty = parseInt(quantity);

    // Baca stok sebelum increment untuk noteBefore yang akurat
    const stockBefore = await prisma.stock.findUnique({
      where: { productId_branchId: { productId, branchId } },
      select: { quantity: true },
    });

    const batch = await prisma.productBatch.create({
      data: {
        productId,
        branchId,
        batchCode: batchCode.trim(),
        productionDate: productionDate ? new Date(productionDate) : null,
        expiryDate: new Date(expiryDate),
        quantity: qty,
        initialQty: qty,
      },
      include: {
        product: { select: { id: true, name: true } },
        branch:  { select: { id: true, name: true } },
      },
    });

    // Baca stok sebelum increment untuk noteBefore yang akurat (atomic increment)
    await prisma.stock.updateMany({
      where: { productId, branchId },
      data: { quantity: { increment: qty } },
    });

    // Catat stock log dengan noteBefore yang sudah dibaca sebelumnya
    const noteBefore = stockBefore?.quantity ?? 0;
    await prisma.stockLog.create({
      data: {
        type:       "ADJUSTMENT",
        change:     qty,
        noteBefore,
        noteAfter:  noteBefore + qty,
        note:       `Terima batch ${batchCode.trim()} (exp: ${new Date(expiryDate).toLocaleDateString("id-ID")})`,
        productId,
        branchId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ ...batch, expiryInfo: getExpiryStatus(batch.expiryDate) }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/batches]", e);
    return NextResponse.json({ error: "Gagal membuat batch" }, { status: 500 });
  }
}
