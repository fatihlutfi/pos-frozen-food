import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

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

    const { items, note } = await req.json();

    // Update note jika ada
    if (note !== undefined) {
      await prisma.stockOpname.update({
        where: { id },
        data: { note: note?.trim() || null },
      });
    }

    // Update physicalQty per item
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (item.id == null) continue;
        const qty = item.physicalQty === "" || item.physicalQty == null
          ? null
          : parseInt(item.physicalQty);
        await prisma.stockOpnameItem.update({
          where: { id: item.id },
          data: { physicalQty: qty !== null && !isNaN(qty) ? qty : null },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/stock-opname/[id]]", e);
    return NextResponse.json({ error: "Gagal menyimpan data opname" }, { status: 500 });
  }
}
