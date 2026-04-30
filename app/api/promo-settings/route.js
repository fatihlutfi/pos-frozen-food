import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

const SINGLETON_ID = "singleton";

// GET /api/promo-settings
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Upsert: buat default jika belum ada
    const settings = await prisma.promoExpirySettings.upsert({
      where:  { id: SINGLETON_ID },
      update: {},
      create: {
        id:               SINGLETON_ID,
        criticalDays:     7,
        warningDays:      30,
        criticalDiscount: 25,
        warningDiscount:  15,
        isActive:         true,
      },
    });
    return NextResponse.json(settings);
  } catch (e) {
    console.error("[GET /api/promo-settings]", e);
    return NextResponse.json({ error: "Gagal mengambil pengaturan promo" }, { status: 500 });
  }
}

// PUT /api/promo-settings
export async function PUT(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const { criticalDays, warningDays, criticalDiscount, warningDiscount, isActive } = await req.json();

    if (criticalDays < 1 || warningDays < 1 || criticalDays >= warningDays)
      return NextResponse.json({ error: "Hari kritis harus lebih kecil dari hari warning" }, { status: 400 });
    if (criticalDiscount < 0 || criticalDiscount > 100 || warningDiscount < 0 || warningDiscount > 100)
      return NextResponse.json({ error: "Diskon harus antara 0-100%" }, { status: 400 });

    const settings = await prisma.promoExpirySettings.upsert({
      where:  { id: SINGLETON_ID },
      update: {
        criticalDays:     parseInt(criticalDays),
        warningDays:      parseInt(warningDays),
        criticalDiscount: parseFloat(criticalDiscount),
        warningDiscount:  parseFloat(warningDiscount),
        isActive:         isActive ?? true,
      },
      create: {
        id:               SINGLETON_ID,
        criticalDays:     parseInt(criticalDays),
        warningDays:      parseInt(warningDays),
        criticalDiscount: parseFloat(criticalDiscount),
        warningDiscount:  parseFloat(warningDiscount),
        isActive:         isActive ?? true,
      },
    });
    return NextResponse.json(settings);
  } catch (e) {
    console.error("[PUT /api/promo-settings]", e);
    return NextResponse.json({ error: "Gagal menyimpan pengaturan promo" }, { status: 500 });
  }
}
