"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

const STORAGE_KEY = "pos-sidebar-collapsed";

export default function AppShell({ role, userName, branchName, children }) {
  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();

  // Hanya collapse sidebar di halaman /pos
  const isPosPage = pathname === "/pos";
  const isCollapsed = isPosPage && sidebarCollapsed;

  // Baca preferensi dari localStorage setelah mount
  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {}
  }, []);

  // Listen event toggle dari POSInterface
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

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Wrapper sidebar — animasi lebar untuk collapse/expand di desktop */}
      <div
        className={`
          shrink-0 overflow-hidden
          transition-[width] duration-300 ease-in-out
          ${isCollapsed ? "w-0" : "w-64"}
        `}
      >
        <Sidebar
          role={role}
          userName={userName}
          branchName={branchName}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Area konten */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        {/* Mobile header — hamburger untuk mobile overlay sidebar */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition cursor-pointer"
            aria-label="Buka menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-gray-800 text-sm">POS Frozen Food</span>
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
            {userName?.charAt(0).toUpperCase()}
          </div>
        </header>

        {/* Konten halaman */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
