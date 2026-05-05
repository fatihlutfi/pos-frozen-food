import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

// ── Global API Rate Limiting ─────────────────────────────────────────────────
// In-memory per Edge instance — cukup untuk Vercel Hobby (single instance).
// Upgrade ke Redis (Upstash) jika sudah multi-instance.

const WINDOW_MS = 5 * 60 * 1000; // 5 menit
const MAX_WRITE = 100; // POST/PUT/PATCH/DELETE per IP per window
const MAX_READ  = 500; // GET per IP per window

const writeStore = new Map();
const readStore  = new Map();

function getClientIP(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function checkLimit(store, key, max) {
  const now   = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { allowed: true };
}

// ── Main Middleware ──────────────────────────────────────────────────────────

export default async function middleware(req) {
  const { pathname } = req.nextUrl;

  // ── NextAuth internal routes — jangan disentuh middleware ────────────────
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // ── Rate limiting untuk API routes ────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    const ip      = getClientIP(req);
    const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
    const store   = isWrite ? writeStore : readStore;
    const max     = isWrite ? MAX_WRITE  : MAX_READ;
    const key     = `${ip}:${isWrite ? "w" : "r"}`;

    const result = checkLimit(store, key, max);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak permintaan. Coba lagi dalam beberapa menit." },
        {
          status: 429,
          headers: {
            "Retry-After":       String(result.retryAfter),
            "X-RateLimit-Limit": String(max),
          },
        }
      );
    }

    return NextResponse.next();
  }

  // ── Auth guard untuk halaman protected ────────────────────────────────────
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Sudah login, coba akses /login → redirect ke dashboard
  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Belum login, coba akses halaman protected → redirect ke login
  if (!token && pathname !== "/login") {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Kasir coba akses halaman admin → redirect ke dashboard
  if (token?.role === "KASIR" && pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Halaman protected
    "/((?!api|_next/static|_next/image|favicon.ico|public).*)",
    // API routes untuk rate limiting
    "/api/:path*",
  ],
};
