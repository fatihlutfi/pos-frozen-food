import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";

const ResetPasswordSchema = z.object({
  newPassword: z.string().min(6).max(100),
});

const EditUserSchema = z.object({
  name:     z.string().min(1).max(100).optional(),
  email:    z.string().email().max(200).optional(),
  role:     z.enum(["ADMIN", "KASIR"]).optional(),
  branchId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
});

function adminOnly(session) {
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

// PATCH /api/admin/users/[id] — edit info atau reset password
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });

    // Mode reset password
    if (body.newPassword !== undefined) {
      const parsed = ResetPasswordSchema.safeParse(body);
      if (!parsed.success) {
        const details = parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
        );
        return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
      }
      const hashed = await bcrypt.hash(parsed.data.newPassword, 10);
      await prisma.user.update({ where: { id }, data: { password: hashed } });
      auditLog("RESET_PASSWORD", "user", {
        actorId:    session.user.id,
        actorEmail: session.user.email,
        targetId:   id,
      });
      return NextResponse.json({ message: "Password berhasil direset" });
    }

    // Mode edit data
    const parsed = EditUserSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      );
      return NextResponse.json({ error: "Input tidak valid", details }, { status: 400 });
    }
    const { name, email, role, branchId, isActive } = parsed.data;

    // Cegah admin menonaktifkan atau mengubah role dirinya sendiri
    if (id === session.user.id) {
      if (isActive === false) {
        return NextResponse.json({ error: "Tidak bisa menonaktifkan akun sendiri" }, { status: 400 });
      }
      if (role && role !== session.user.role) {
        return NextResponse.json({ error: "Tidak bisa mengubah role akun sendiri" }, { status: 400 });
      }
    }

    const effectiveRole = role ?? user.role;
    if (effectiveRole === "KASIR" && branchId === null) {
      return NextResponse.json({ error: "Kasir wajib memiliki cabang" }, { status: 400 });
    }

    if (email && email.trim().toLowerCase() !== user.email) {
      const dup = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
      if (dup) return NextResponse.json({ error: "Email sudah digunakan" }, { status: 409 });
    }

    if (branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch) return NextResponse.json({ error: "Cabang tidak ditemukan" }, { status: 404 });
    }

    const data = {};
    if (name !== undefined)     data.name     = name.trim();
    if (email !== undefined)    data.email    = email.trim().toLowerCase();
    if (role !== undefined)     data.role     = role;
    if (isActive !== undefined) data.isActive = isActive;
    if (branchId !== undefined) data.branchId = effectiveRole === "ADMIN" ? (branchId || null) : branchId;

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, name: true, email: true, role: true,
        isActive: true, createdAt: true, branchId: true,
        branch: { select: { name: true } },
      },
    });

    auditLog("UPDATE", "user", {
      actorId:    session.user.id,
      actorEmail: session.user.email,
      targetId:   id,
      meta: { fields: Object.keys(data) },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[PATCH /api/admin/users/[id]]", e);
    return NextResponse.json({ error: "Gagal mengupdate user" }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id]
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json({ error: "Tidak bisa menghapus akun sendiri" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { transactions: true } } },
    });
    if (!user) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });

    if (user._count.transactions > 0) {
      return NextResponse.json(
        { error: `User memiliki ${user._count.transactions} transaksi. Nonaktifkan saja, jangan dihapus.` },
        { status: 409 }
      );
    }

    await prisma.user.delete({ where: { id } });
    auditLog("DELETE", "user", {
      actorId:    session.user.id,
      actorEmail: session.user.email,
      targetId:   id,
      meta: { name: user.name, email: user.email },
    });
    return NextResponse.json({ message: "User berhasil dihapus" });
  } catch (e) {
    console.error("[DELETE /api/admin/users/[id]]", e);
    return NextResponse.json({ error: "Gagal menghapus user" }, { status: 500 });
  }
}
