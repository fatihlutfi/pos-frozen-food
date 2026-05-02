"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { TrendingUp, ClipboardList } from "lucide-react";

const navAdmin = [
  { href: "/dashboard",      label: "Dashboard",      icon: "▦",  lucide: null },
  { href: "/pos",            label: "Kasir (POS)",     icon: "🛒", lucide: null },
  { href: "/shifts",         label: "Shift Kasir",     icon: "🕐", lucide: null },
  { href: "/products",       label: "Produk",          icon: "📦", lucide: null },
  { href: "/categories",     label: "Kategori",        icon: "🗂", lucide: null },
  { href: "/promo",          label: "Promo",           icon: "🔥", lucide: null },
  { href: "/transactions",   label: "Transaksi",       icon: "📋", lucide: null },
  { href: "/reports",        label: "Laporan",         icon: null, lucide: TrendingUp },
  { href: "/stock-opname",   label: "Stock Opname",    icon: null, lucide: ClipboardList },
  { href: "/admin/branches", label: "Cabang",          icon: "🏪", lucide: null },
  { href: "/admin/users",    label: "Manajemen User",  icon: "👥", lucide: null },
];

const navKasir = [
  { href: "/dashboard",    label: "Dashboard",      icon: "▦",  lucide: null },
  { href: "/pos",          label: "Kasir (POS)",    icon: "🛒", lucide: null },
  { href: "/shifts",       label: "Shift Saya",     icon: "🕐", lucide: null },
  { href: "/transactions", label: "Transaksi Saya", icon: "📋", lucide: null },
];

/**
 * Sidebar — hanya bertanggung jawab atas KONTEN.
 * Positioning (fixed overlay vs static) ditangani oleh AppShell.
 * Prop `onClose` dipanggil saat link diklik atau tombol ✕ ditekan.
 */
export default function Sidebar({ role, userName, branchName, onClose }) {
  const pathname = usePathname();
  const router   = useRouter();
  const navItems = role === "ADMIN" ? navAdmin : navKasir;

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [checkingShift,  setCheckingShift]  = useState(false);

  async function handleLogout() {
    if (role === "ADMIN") {
      signOut({ callbackUrl: "/login" });
      return;
    }
    // Kasir: cek apakah ada shift aktif sebelum keluar
    setCheckingShift(true);
    try {
      const res  = await fetch("/api/shifts?status=OPEN&limit=1");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setShowShiftModal(true);
        return;
      }
    } catch {
      // Jika cek gagal, izinkan keluar
    } finally {
      setCheckingShift(false);
    }
    signOut({ callbackUrl: "/login" });
  }

  function goToShifts() {
    setShowShiftModal(false);
    onClose?.();
    router.push("/shifts");
  }

  return (
    <>
      {/*
        aside mengisi 100% tinggi dan lebar container-nya.
        Di mobile: container = fixed drawer panel di AppShell (w-[75%])
        Di desktop: container = wrapper div di AppShell (w-64)
      */}
      <aside className="h-full w-full bg-slate-900 text-white flex flex-col">

        {/* Logo + tombol tutup (tutup hanya dirender di mobile via lg:hidden) */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700 shrink-0">
          <span className="text-2xl">🧊</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight">POS Frozen Food</p>
            <p className="text-slate-400 text-xs">Multi-Cabang</p>
          </div>
          {/* ✕ hanya muncul di mobile */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer shrink-0"
            aria-label="Tutup menu"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info pengguna */}
        <div className="px-5 py-4 border-b border-slate-700 shrink-0">
          <p className="text-xs text-slate-400 mb-0.5">Login sebagai</p>
          <p className="text-sm font-semibold truncate">{userName}</p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                role === "ADMIN"
                  ? "bg-blue-500/20 text-blue-300"
                  : "bg-green-500/20 text-green-300"
              }`}
            >
              {role}
            </span>
            {branchName && (
              <span className="text-xs text-slate-400 truncate">{branchName}</span>
            )}
          </div>
        </div>

        {/* Navigasi — scrollable */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            const LucideIcon = item.lucide;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose} // tutup drawer saat navigasi (no-op di desktop)
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white",
                ].join(" ")}
              >
                <span className="w-5 flex items-center justify-center shrink-0">
                  {LucideIcon
                    ? <LucideIcon size={16} />
                    : <span className="text-base leading-none">{item.icon}</span>
                  }
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Tombol keluar */}
        <div className="px-3 py-4 border-t border-slate-700 shrink-0">
          <button
            onClick={handleLogout}
            disabled={checkingShift}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-60"
          >
            <span className="text-base w-5 text-center shrink-0">
              {checkingShift ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : "⎋"}
            </span>
            Keluar
          </button>
        </div>
      </aside>

      {/* Modal: shift masih aktif saat hendak logout */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-base font-bold text-gray-800">Shift Masih Aktif</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Anda masih memiliki shift yang sedang berjalan. Tutup shift terlebih dahulu agar catatan kasir tersimpan dengan benar.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={goToShifts}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition cursor-pointer"
              >
                Tutup Shift Sekarang
              </button>
              <button
                onClick={() => { setShowShiftModal(false); signOut({ callbackUrl: "/login" }); }}
                className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-lg text-sm transition cursor-pointer"
              >
                Keluar Tanpa Menutup Shift
              </button>
              <button
                onClick={() => setShowShiftModal(false)}
                className="w-full py-2.5 text-gray-500 hover:text-gray-700 text-sm transition cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
