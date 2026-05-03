import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import prismaTx from "@/lib/prisma-tx";
import { NextResponse } from "next/server";
import { z } from "zod";

const BundleItemSchema = z.object({
  productId: z.string().min(1),
  quantity:  z.number().int().positive().optional(),
});

const CreateBundleSchema = z.object({
  name:        z.string().min(1).max(200),
  bundlePrice: z.number().int().positive(),
  branchId:    z.string().min(1).optional(),
  startDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Format tanggal tidak valid (YYYY-MM-DD)").optional(),
  endDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Format tanggal tidak valid (YYYY-MM-DD)").optional(),
  isActive:    z.boolean().optional(),
  items:       z.array(BundleItemSchema).min(2).max(50),
});

// PUT /api/bundles/[id]
export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
    }
    const parsed = CreateBundleSchema.safeParse({
      ...body,
      bundlePrice: typeof body.bundlePrice === "string" ? parseInt(body.bundlePrice) : body.bundlePrice,
    });
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      );
      return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
    }
    // Delete existing items, recreate with new list — atomic
    const bundle = await prismaTx.$transaction(async (tx) => {
      await tx.bundleItem.deleteMany({ where: { bundleId: id } });
      return tx.bundle.update({
        where: { id },
        data: {
          name:        parsed.data.name.trim(),
          bundlePrice: parsed.data.bundlePrice,
          branchId:    parsed.data.branchId || null,
          startDate:   parsed.data.startDate ? new Date(parsed.data.startDate) : null,
          endDate:     parsed.data.endDate   ? new Date(parsed.data.endDate)   : null,
          isActive:    parsed.data.isActive  ?? true,
          items: {
            create: parsed.data.items.map((item) => ({
              productId: item.productId,
              quantity:  item.quantity || 1,
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
    });

    return NextResponse.json(bundle);
  } catch (e) {
    if (e.code === "P2025") return NextResponse.json({ error: "Bundling tidak ditemukan" }, { status: 404 });
    console.error("[PUT /api/bundles/[id]]", e);
    return NextResponse.json({ error: "Gagal mengubah bundling" }, { status: 500 });
  }
}

// DELETE /api/bundles/[id]
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { id } = await params;
    await prisma.bundle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e.code === "P2025") return NextResponse.json({ error: "Bundling tidak ditemukan" }, { status: 404 });
    console.error("[DELETE /api/bundles/[id]]", e);
    return NextResponse.json({ error: "Gagal menghapus bundling" }, { status: 500 });
  }
}
