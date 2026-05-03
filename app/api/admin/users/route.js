import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";

const CreateUserSchema = z.object({
  name:     z.string().min(1).max(100),
  email:    z.string().email().max(200),
  password: z.string().min(6).max(100),
  role:     z.enum(["ADMIN", "KASIR"]),
  branchId: z.string().min(1).optional(),
});

function adminOnly(session) {
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

// GET /api/admin/users
export async function GET(req) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      branchId: true,
      branch: { select: { name: true } },
    },
  });

  return NextResponse.json(users);
}

// POST /api/admin/users — buat user baru
export async function POST(req) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
    }
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      );
      return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
    }
    const { name, email, password, role, branchId } = parsed.data;

    if (role === "KASIR" && !branchId) {
      return NextResponse.json({ error: "Kasir wajib memiliki cabang" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.trim().toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 409 });
    }

    if (branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch) return NextResponse.json({ error: "Cabang tidak ditemukan" }, { status: 404 });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name.trim(),
        email: parsed.data.email.trim().toLowerCase(),
        password: hashed,
        role,
        branchId: role === "ADMIN" ? (branchId || null) : branchId,
      },
      select: {
        id: true, name: true, email: true, role: true,
        isActive: true, createdAt: true, branchId: true,
        branch: { select: { name: true } },
      },
    });

    auditLog("CREATE", "user", {
      actorId:    session.user.id,
      actorEmail: session.user.email,
      targetId:   user.id,
      meta: { name: user.name, email: user.email, role: user.role },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/users]", e);
    return NextResponse.json({ error: "Gagal membuat user" }, { status: 500 });
  }
}
