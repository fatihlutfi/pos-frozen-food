"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { TrendingUp, ClipboardList } from "lucide-react";

const navAdmin = [
  { href: "/dashboard",      label: "Dashboard",       icon: "▦",  lucide: null },
  { href: "/pos",            label: "Kasir (POS)",      icon: "🛒", lucide: null },
  { href: "/shifts",         label: "Shift Kasir",      icon: "🕐", lucide: null },
  { href: "/products",       label: "Produk",           icon: "📦", lucide: null },
  { href: "/categories",     label: "Kategori",         icon: "🗂", lucide: null },
  { href: "/transactions",   label: "Transaksi",        icon: "📋", lucide: null },
  { href: "/reports",        label: "Laporan",          icon: null, lucide: TrendingUp },
  { href: "/stock-opname",   label: "Stock Opname",     icon: null, lucide: ClipboardList },
  { href: "/admin/branches", label: "Cabang",           icon: "🏪", lucide: null },
  { href: "/admin/users",    label: "Manajemen User",   icon: "👥", lucide: null },
];

const navKasir = [
  { href: "/dashboard",    label: "Dashboard",      icon: "▦",  lucide: null },
  { href: "/pos",          label: "Kasir (POS)",    icon: "🛒", lucide: null },
  { href: "/shifts",       label: "Shift Saya",     icon: "🕐", lucide: null },
  { href: "/transactions", label: "Transaksi Saya", icon: "📋", lucide: null },
];

export default function Sidebar({ role, userName, branchName, isOpen, onClose }) {
  const pathname = usePathname();
  const navItems = role === "ADMIN" ? navAdmin : navKasir;

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-slate-900 text-white z-30
          flex flex-col transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700">
          <span className="text-2xl">🧊</span>
          <div>
            <p className="font-bold text-sm leading-tight">POS Frozen Food</p>
            <p className="text-slate-400 text-xs">Multi-Cabang</p>
          </div>
        </div>

        {/* User info */}
        <div className="px-5 py-4 border-b border-slate-700">
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

        {/* Nav links */}
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
                onClick={onClose}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }
                `}
              >
                <span className="w-5 flex items-center justify-center">
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

        {/* Logout */}
        <div className="px-3 py-4 border-t border-slate-700">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition-colors cursor-pointer"
          >
            <span className="text-base w-5 text-center">⎋</span>
            Keluar
          </button>
        </div>
      </aside>
    </>
  );
}
