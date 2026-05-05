import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { checkRateLimit, resetRateLimit } from "./rateLimit";

// Sesi selalu 8 jam rolling — tidak ada "Ingat Saya"
const SESSION_TIMEOUT = 8 * 60 * 60; // 8 jam dalam detik

// Interval re-check status cabang (5 menit)
const BRANCH_CHECK_INTERVAL = 5 * 60;

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Normalisasi email + rate limit (max 8 percobaan / 5 menit)
        const email = credentials.email.toLowerCase().trim();
        const limit = checkRateLimit(email);
        if (!limit.allowed) {
          console.warn(`[auth] Rate limit hit for ${email} — coba lagi dalam ${limit.waitSecs}s`);
          throw new Error(`RATE_LIMIT:${limit.waitSecs}`);
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { branch: true },
        });

        if (!user || !user.isActive) return null;

        const passwordMatch = await bcrypt.compare(credentials.password, user.password);
        if (!passwordMatch) return null;

        // Kasir: tolak login jika cabang dinonaktifkan
        if (user.role !== "ADMIN" && user.branchId && user.branch && !user.branch.isActive) {
          throw new Error("INACTIVE_BRANCH");
        }

        // Reset counter setelah login berhasil
        resetRateLimit(email);

        return {
          id:         user.id,
          name:       user.name,
          email:      user.email,
          role:       user.role,
          branchId:   user.branchId,
          branchName: user.branch?.name ?? null,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Initial sign-in: set semua field user ke token
        token.id               = user.id;
        token.role             = user.role;
        token.branchId         = user.branchId;
        token.branchName       = user.branchName;
        token.branchActive     = true;
        token.branchCheckedAt  = Math.floor(Date.now() / 1000);
      }

      // Re-check status cabang setiap 5 menit untuk kasir (bukan admin)
      const now = Math.floor(Date.now() / 1000);
      if (
        token.role !== "ADMIN" &&
        token.branchId &&
        now - (token.branchCheckedAt ?? 0) > BRANCH_CHECK_INTERVAL
      ) {
        try {
          const branch = await prisma.branch.findUnique({
            where:  { id: token.branchId },
            select: { isActive: true },
          });
          token.branchActive    = branch?.isActive ?? false;
          token.branchCheckedAt = now;
        } catch {
          // Jaga nilai lama jika DB error
        }
      }

      // Rolling: setiap request perpanjang 8 jam dari sekarang
      token.exp = Math.floor(Date.now() / 1000) + SESSION_TIMEOUT;
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id           = token.id;
        session.user.role         = token.role;
        session.user.branchId     = token.branchId;
        session.user.branchName   = token.branchName;
        // Admin selalu aktif (tidak punya cabang); kasir ikut status cabang
        session.user.branchActive = token.role === "ADMIN" ? true : (token.branchActive !== false);
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error:  "/login",
  },

  session: {
    strategy: "jwt",
    maxAge:   SESSION_TIMEOUT, // JWT expiry reference — 8 jam
  },

  // Override cookie: hapus maxAge → jadi session cookie
  // Browser akan menghapus cookie saat ditutup, bukan setelah 8 jam
  cookies: {
    sessionToken: {
      name: process.env.NEXTAUTH_URL?.startsWith("https")
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path:     "/",
        secure:   process.env.NEXTAUTH_URL?.startsWith("https") ?? false,
        // Tidak ada maxAge/expires → session cookie (hilang saat browser tutup)
      },
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};
