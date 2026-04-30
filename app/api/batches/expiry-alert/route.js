import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getExpiryStatus } from "../route.js";

// GET /api/batches/expiry-alert?branchId=&days=30
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "30");
  const branchId = session.user.role === "KASIR"
    ? session.user.branchId
    : searchParams.get("branchId") || undefined;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  try {
    const batches = await prisma.productBatch.findMany({
      where: {
        isActive: true,
        quantity: { gt: 0 },
        expiryDate: { lte: cutoff },
        ...(branchId ? { branchId } : {}),
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

    // Group by status
    const grouped = {
      expired:  enriched.filter((b) => b.expiryInfo.status === "expired"),
      critical: enriched.filter((b) => b.expiryInfo.status === "critical"),
      warning:  enriched.filter((b) => b.expiryInfo.status === "warning"),
      soon:     enriched.filter((b) => b.expiryInfo.status === "soon"),
    };

    return NextResponse.json({ batches: enriched, grouped, total: enriched.length });
  } catch (e) {
    console.error("[GET /api/batches/expiry-alert]", e);
    return NextResponse.json({ error: "Gagal mengambil expiry alert" }, { status: 500 });
  }
}
