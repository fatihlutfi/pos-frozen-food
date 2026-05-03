import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const OpnameItemSchema = z.object({
  id:          z.string().min(1),
  physicalQty: z.number().int().nonnegative().nullable(),
});

const UpdateOpnameSchema = z.object({
  items: z.array(OpnameItemSchema).max(2000).optional(),
  note:  z.string().max(500).nullable().optional(),
});

// GET /api/stock-opname/[id] — detail opname + semua items
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

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

  if (!opname) {
    return NextResponse.json({ error: "Sesi opname tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(opname);
}

// DELETE /api/stock-opname/[id] — hapus draft opname (hanya status DRAFT)
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const opname = await prisma.stockOpname.findUnique({
      where:  { id },
      select: { status: true },
    });

    if (!opname) {
      return NextResponse.json({ error: "Sesi opname tidak ditemukan" }, { status: 404 });
    }
    if (opname.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Hanya opname berstatus Draft yang dapat dihapus" },
        { status: 400 }
      );
    }

    // Items akan terhapus otomatis via onDelete: Cascade di schema
    await prisma.stockOpname.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/stock-opname/[id]]", e);
    return NextResponse.json({ error: "Gagal menghapus opname" }, { status: 500 });
  }
}

// PATCH /api/stock-opname/[id] — update physicalQty item-item
// Body: { items: [{ id, physicalQty }] }  — hanya update item yang dikirim
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const opname = await prisma.stockOpname.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!opname) {
      return NextResponse.json({ error: "Sesi opname tidak ditemukan" }, { status: 404 });
    }
    if (opname.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "Opname sudah dikonfirmasi, tidak bisa diubah" },
        { status: 400 }
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object") {
      return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
    }
    const parsed = UpdateOpnameSchema.safeParse({
      ...rawBody,
      items: Array.isArray(rawBody.items)
        ? rawBody.items.map((item) => ({
            ...item,
            physicalQty: item.physicalQty === "" || item.physicalQty == null
              ? null
              : typeof item.physicalQty === "string" ? parseInt(item.physicalQty) : item.physicalQty,
          }))
        : undefined,
    });
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      );
      return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
    }
    const { items, note } = parsed.data;

    // Update note jika ada
    if (note !== undefined) {
      await prisma.stockOpname.update({
        where: { id },
        data: { note: note?.trim() || null },
      });
    }

    // Update physicalQty per item — wrapped in transaction to avoid N+1 race conditions
    if (Array.isArray(items) && items.length > 0) {
      await prisma.$transaction(
        items.map((item) =>
          prisma.stockOpnameItem.update({
            where: { id: item.id },
            data:  { physicalQty: item.physicalQty },
          })
        )
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/stock-opname/[id]]", e);
    return NextResponse.json({ error: "Gagal menyimpan data opname" }, { status: 500 });
  }
}
