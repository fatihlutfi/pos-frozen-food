import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import prismaTx from "@/lib/prisma-tx";
import { NextResponse } from "next/server";

// POST /api/stock-opname/[id]/confirm — konfirmasi opname, update stok
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const opname = await prisma.stockOpname.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { name: true } },
          },
        },
      },
    });

    if (!opname) {
      return NextResponse.json({ error: "Sesi opname tidak ditemukan" }, { status: 404 });
    }
    if (opname.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "Opname sudah dikonfirmasi sebelumnya" },
        { status: 400 }
      );
    }

    // Cek semua item sudah diisi physicalQty
    const unfilledItems = opname.items.filter((item) => item.physicalQty == null);
    if (unfilledItems.length > 0) {
      return NextResponse.json(
        {
          error: `${unfilledItems.length} produk belum diisi stok fisiknya. Isi semua produk sebelum konfirmasi.`,
          unfilledCount: unfilledItems.length,
        },
        { status: 400 }
      );
    }

    // Ambil shortId untuk keterangan stock log
    const shortId = id.slice(-8).toUpperCase();
    const logNote = `Stock Opname #${shortId}`;

    // Proses atomik: update stok + log + konfirmasi dalam satu $transaction
    const changedItems = opname.items.filter(
      (item) => item.physicalQty !== item.systemQty
    );

    const updated = await prismaTx.$transaction(async (tx) => {
      for (const item of changedItems) {
        const before = item.systemQty;
        const after  = item.physicalQty;
        const change = after - before;

        await tx.stock.updateMany({
          where: { productId: item.productId, branchId: opname.branchId },
          data:  { quantity: after },
        });

        await tx.stockLog.create({
          data: {
            type:       "OPNAME",
            change,
            noteBefore: before,
            noteAfter:  after,
            note:       logNote,
            productId:  item.productId,
            branchId:   opname.branchId,
            userId:     session.user.id,
          },
        });
      }

      return tx.stockOpname.update({
        where: { id },
        data:  { status: "CONFIRMED", confirmedAt: new Date() },
        include: {
          branch: { select: { name: true } },
          user:   { select: { name: true } },
          _count: { select: { items: true } },
        },
      });
    });

    return NextResponse.json({
      ...updated,
      changedCount: changedItems.length,
      totalItems:   opname.items.length,
    });
  } catch (e) {
    console.error("[POST /api/stock-opname/[id]/confirm]", e);
    return NextResponse.json({ error: "Gagal mengkonfirmasi opname" }, { status: 500 });
  }
}
