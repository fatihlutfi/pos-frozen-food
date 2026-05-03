import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const CreateDiscountRuleSchema = z.object({
  branchId:        z.string().min(1),
  minQty:          z.number().int().min(1),
  discountPercent: z.number().positive().max(99.99),
});

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
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
    }
    const parsed = CreateDiscountRuleSchema.safeParse({
      ...body,
      minQty:          typeof body.minQty          === "string" ? parseInt(body.minQty)          : body.minQty,
      discountPercent: typeof body.discountPercent === "string" ? parseFloat(body.discountPercent) : body.discountPercent,
    });
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      );
      return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
    }
    const rule = await prisma.productDiscountRule.upsert({
      where: {
        productId_branchId_minQty: {
          productId: id,
          branchId:  parsed.data.branchId,
          minQty:    parsed.data.minQty,
        },
      },
      update: { discountPercent: parsed.data.discountPercent, isActive: true },
      create: {
        productId:       id,
        branchId:        parsed.data.branchId,
        minQty:          parsed.data.minQty,
        discountPercent: parsed.data.discountPercent,
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
    if (e.code === "P2025") return NextResponse.json({ error: "Aturan tidak ditemukan" }, { status: 404 });
    console.error("[DELETE /api/products/[id]/discount-rules]", e);
    return NextResponse.json({ error: "Gagal menghapus aturan" }, { status: 500 });
  }
}
