import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
});

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // accessible to both ADMIN and KASIR (needed for POS product filtering)
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      take: 100,
      include: { _count: { select: { products: true } } },
    });
    return NextResponse.json(categories);
  } catch (e) {
    console.error("[GET /api/categories]", e);
    return NextResponse.json({ error: "Gagal mengambil data kategori" }, { status: 500 });
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
    }
    const parsed = CreateCategorySchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      );
      return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
    }

    const category = await prisma.category.create({
      data: { name: parsed.data.name.trim() },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (e) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Nama kategori sudah ada" }, { status: 409 });
    }
    return NextResponse.json({ error: "Gagal membuat kategori" }, { status: 500 });
  }
}
