import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const PromoSettingsSchema = z.object({
  criticalDays:     z.number().int().min(1),
  warningDays:      z.number().int().min(1),
  criticalDiscount: z.number().min(0).max(100),
  warningDiscount:  z.number().min(0).max(100),
  isActive:         z.boolean().optional(),
}).refine(data => data.criticalDays < data.warningDays, {
  message: "Hari kritis harus lebih kecil dari hari warning",
  path: ["criticalDays"],
});

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
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
    }
    const parsed = PromoSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      );
      return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
    }
    const { criticalDays, warningDays, criticalDiscount, warningDiscount, isActive } = parsed.data;

    const settings = await prisma.promoExpirySettings.upsert({
      where:  { id: SINGLETON_ID },
      update: {
        criticalDays,
        warningDays,
        criticalDiscount,
        warningDiscount,
        isActive: isActive ?? true,
      },
      create: {
        id:               SINGLETON_ID,
        criticalDays,
        warningDays,
        criticalDiscount,
        warningDiscount,
        isActive:         isActive ?? true,
      },
    });
    return NextResponse.json(settings);
  } catch (e) {
    console.error("[PUT /api/promo-settings]", e);
    return NextResponse.json({ error: "Gagal menyimpan pengaturan promo" }, { status: 500 });
  }
}
