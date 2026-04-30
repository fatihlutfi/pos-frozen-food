import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { checkRateLimit, resetRateLimit } from "./rateLimit";

// Sesi selalu 8 jam rolling — tidak ada "Ingat Saya"
const SESSION_TIMEOUT = 8 * 60 * 60; // 8 jam dalam detik

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
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { branch: true },
        });

        if (!user || !user.isActive) return null;

        const passwordMatch = await bcrypt.compare(credentials.password, user.password);
        if (!passwordMatch) return null;

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
        token.id         = user.id;
        token.role       = user.role;
        token.branchId   = user.branchId;
        token.branchName = user.branchName;
      }
      // Rolling: setiap request perpanjang 8 jam dari sekarang
      // → otomatis expired jika idle >8 jam
      token.exp = Math.floor(Date.now() / 1000) + SESSION_TIMEOUT;
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id         = token.id;
        session.user.role       = token.role;
        session.user.branchId   = token.branchId;
        session.user.branchName = token.branchName;
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
