import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/products/[id]/discount-rules?branchId=xxx (optional filter)
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branchId");

  const rules = await prisma.productDiscountRule.findMany({
    where:   { productId: id, ...(branchId ? { branchId } : {}) },
    orderBy: [{ branchId: "asc" }, { minQty: "asc" }],
    include: { branch: { select: { name: true } } },
  });
  return NextResponse.json(rules);
}

// POST /api/products/[id]/discount-rules
// Body: { minQty, discountPercent, branchId }
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const { minQty, discountPercent, branchId } = await req.json();
    if (!branchId) {
      return NextResponse.json({ error: "branchId wajib diisi" }, { status: 400 });
    }
    if (!minQty || parseInt(minQty) < 1) {
      return NextResponse.json({ error: "Minimal qty harus ≥ 1" }, { status: 400 });
    }
    if (!discountPercent || parseFloat(discountPercent) <= 0 || parseFloat(discountPercent) >= 100) {
      return NextResponse.json({ error: "Diskon harus antara 0–100%" }, { status: 400 });
    }
    const rule = await prisma.productDiscountRule.upsert({
      where: {
        productId_branchId_minQty: {
          productId: id,
          branchId,
          minQty: parseInt(minQty),
        },
      },
      update: { discountPercent: parseFloat(discountPercent), isActive: true },
      create: {
        productId:       id,
        branchId,
        minQty:          parseInt(minQty),
        discountPercent: parseFloat(discountPercent),
      },
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (e) {
    console.error("[POST discount-rules]", e);
    return NextResponse.json({ error: "Gagal menyimpan aturan diskon" }, { status: 500 });
  }
}

// DELETE /api/products/[id]/discount-rules?ruleId=xxx
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const ruleId = searchParams.get("ruleId");
  if (!ruleId) return NextResponse.json({ error: "ruleId required" }, { status: 400 });
  try {
    await prisma.productDiscountRule.delete({
      where: { id: ruleId, productId: id },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Gagal menghapus aturan" }, { status: 500 });
  }
}
