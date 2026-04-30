"use client";

import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("[App Error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">
        Terjadi kesalahan
      </h2>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">
        Halaman tidak dapat dimuat. Coba refresh atau kembali ke dashboard.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition cursor-pointer"
        >
          Coba Lagi
        </button>
        <a
          href="/dashboard"
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
        >
          Ke Dashboard
        </a>
      </div>
    </div>
  );
}
