"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

const STORAGE_KEY = "pos-sidebar-collapsed";

export default function AppShell({ role, userName, branchName, children }) {
  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();

  const isPosPage   = pathname === "/pos";
  const isCollapsed = isPosPage && sidebarCollapsed;

  // Tutup mobile drawer otomatis saat navigasi
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Baca preferensi collapse dari localStorage
  useEffect(() => {
    try { setSidebarCollapsed(localStorage.getItem(STORAGE_KEY) === "true"); } catch {}
  }, []);

  // Event dari POSInterface untuk toggle collapse
  useEffect(() => {
    function handler() {
      setSidebarCollapsed((prev) => {
        const next = !prev;
        try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
        return next;
      });
    }
    window.addEventListener("toggle-pos-sidebar", handler);
    return () => window.removeEventListener("toggle-pos-sidebar", handler);
  }, []);

  // Cegah scroll body saat mobile drawer terbuka
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  return (
    <>
      {/*
        ══════════════════════════════════════════════════════
        MOBILE DRAWER  (tersembunyi di desktop via lg:hidden)
        ══════════════════════════════════════════════════════
        Backdrop dan panel drawer di-render di luar layout flow
        sehingga benar-benar mengoverlay seluruh layar.
      */}

      {/* Backdrop — semi-transparan, fade in/out */}
      <div
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
        className={[
          "fixed inset-0 z-30 bg-black/50",
          "transition-opacity duration-300 ease-in-out",
          "lg:hidden",
          sidebarOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      {/* Drawer panel — slide dari kiri */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-40",
          "w-[75%] max-w-[280px]",
          "transition-transform duration-300 ease-in-out",
          "lg:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <Sidebar
          role={role}
          userName={userName}
          branchName={branchName}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/*
        ══════════════════════════════════════════════════════
        LAYOUT UTAMA
        ══════════════════════════════════════════════════════
      */}
      <div className="flex h-screen overflow-hidden bg-gray-50">

        {/*
          Desktop sidebar — hidden di mobile (hidden lg:block),
          selalu visible di desktop. Wrapper menangani animasi
          collapse di halaman POS.
        */}
        <div
          className={[
            "hidden lg:block",
            "shrink-0 overflow-hidden",
            "transition-[width] duration-300 ease-in-out",
            isCollapsed ? "w-0" : "w-64",
          ].join(" ")}
        >
          <Sidebar
            role={role}
            userName={userName}
            branchName={branchName}
            onClose={() => {}} // no-op di desktop
          />
        </div>

        {/* Area konten */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">

          {/* Mobile top bar — hamburger + judul + avatar */}
          <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 transition cursor-pointer"
              aria-label="Buka menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="font-semibold text-gray-800 text-sm">POS Frozen Food</span>
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold select-none">
              {userName?.charAt(0).toUpperCase()}
            </div>
          </header>

          {/* Konten halaman */}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>

        </div>
      </div>
    </>
  );
}
