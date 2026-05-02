"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

const STORAGE_KEY = "pos-sidebar-collapsed";

export default function AppShell({ role, userName, branchName, children }) {
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
        />
      </div>

      {/* Area konten */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        {/* Konten halaman */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
