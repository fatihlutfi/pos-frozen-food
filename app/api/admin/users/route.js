import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

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

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
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
    const { name, email, password, role, branchId } = await req.json();

    if (!name?.trim())     return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 });
    if (!email?.trim())    return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
    if (!password)         return NextResponse.json({ error: "Password wajib diisi" }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 });
    if (!["ADMIN", "KASIR"].includes(role)) {
      return NextResponse.json({ error: "Role tidak valid" }, { status: 400 });
    }
    if (role === "KASIR" && !branchId) {
      return NextResponse.json({ error: "Kasir wajib memiliki cabang" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
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
        name: name.trim(),
        email: email.trim().toLowerCase(),
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

    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/users]", e);
    return NextResponse.json({ error: "Gagal membuat user" }, { status: 500 });
  }
}
