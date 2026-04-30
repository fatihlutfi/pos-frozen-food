import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { checkRateLimit, resetRateLimit } from "./rateLimit";

const IDLE_TIMEOUT    = 8  * 60 * 60;       // 8 jam  — sesi tanpa "Ingat Saya"
const REMEMBER_TIMEOUT = 30 * 24 * 60 * 60; // 30 hari — sesi dengan "Ingat Saya"

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email:      { label: "Email",      type: "email"    },
        password:   { label: "Password",   type: "password" },
        rememberMe: { label: "Ingat Saya", type: "text"     },
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
          rememberMe: credentials.rememberMe === "true",
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Initial sign-in: set semua field + expiry sesuai pilihan "Ingat Saya"
        token.id         = user.id;
        token.role       = user.role;
        token.branchId   = user.branchId;
        token.branchName = user.branchName;
        token.rememberMe = user.rememberMe;
        token.exp = Math.floor(Date.now() / 1000) + (
          user.rememberMe ? REMEMBER_TIMEOUT : IDLE_TIMEOUT
        );
      } else if (!token.rememberMe) {
        // Rolling idle timeout: setiap request refresh 8 jam
        // → session expire jika idle >8 jam atau komputer tidur >8 jam
        token.exp = Math.floor(Date.now() / 1000) + IDLE_TIMEOUT;
      }
      // rememberMe=true: exp tidak di-refresh, tetap 30 hari sejak login
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
    maxAge: REMEMBER_TIMEOUT, // Cookie max 30 hari; JWT exp mengontrol akses aktual
  },

  secret: process.env.NEXTAUTH_SECRET,
};
