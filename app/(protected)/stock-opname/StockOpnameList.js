"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";

const STATUS_LABEL = { DRAFT: "Draft", CONFIRMED: "Terkonfirmasi" };
const STATUS_CLASS  = {
  DRAFT:     "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-green-100 text-green-700",
};

export default function StockOpnameList({ initialOpnames, branches }) {
  const router = useRouter();
  const [opnames,       setOpnames]       = useState(initialOpnames);
  const [loading,       setLoading]       = useState(false);
  const [filterStatus,  setFilterStatus]  = useState("");
  const [filterBranch,  setFilterBranch]  = useState("");

  // Modal buat baru
  const [showNew,       setShowNew]       = useState(false);
  const [newBranch,     setNewBranch]     = useState("");
  const [newNote,       setNewNote]       = useState("");
  const [creating,      setCreating]      = useState(false);
  const [createError,   setCreateError]   = useState("");

  // Hapus draft
  const [deleteTarget,  setDeleteTarget]  = useState(null); // { id, shortId }
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState("");

  // ── Fetch list ──────────────────────────────────────────────

  async function fetchOpnames(params = {}) {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (params.status)   sp.set("status",   params.status);
      if (params.branchId) sp.set("branchId", params.branchId);
      sp.set("limit", "50");
      const res  = await fetch(`/api/stock-opname?${sp}`);
      const data = await res.json();
      if (res.ok) setOpnames(data);
    } finally {
      setLoading(false);
    }
  }

  function handleFilter() { fetchOpnames({ status: filterStatus, branchId: filterBranch }); }
  function handleReset()  { setFilterStatus(""); setFilterBranch(""); fetchOpnames({}); }

  // ── Buat sesi baru ──────────────────────────────────────────

  async function handleCreate() {
    if (!newBranch) { setCreateError("Pilih cabang terlebih dahulu"); return; }
    setCreating(true);
    setCreateError("");
    try {
      const res  = await fetch("/api/stock-opname", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ branchId: newBranch, note: newNote }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || "Gagal membuat sesi opname"); return; }
      // Langsung buka halaman detail opname
      router.push(`/stock-opname/${data.id}`);
    } catch (e) {
      setCreateError("Terjadi kesalahan: " + e.message);
    } finally {
      setCreating(false);
    }
  }

  // ── Hapus draft ─────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/stock-opname/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        setDeleteError(d.error || "Gagal menghapus opname");
        return;
      }
      setOpnames((prev) => prev.filter((o) => o.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError("Terjadi kesalahan: " + e.message);
    } finally {
      setDeleting(false);
    }
  }

  // ── Summary ─────────────────────────────────────────────────

  const draftCount     = opnames.filter((o) => o.status === "DRAFT").length;
  const confirmedCount = opnames.filter((o) => o.status === "CONFIRMED").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Stock Opname</h1>
        <button
          onClick={() => { setShowNew(true); setCreateError(""); setNewBranch(""); setNewNote(""); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition cursor-pointer"
        >
          + Buat Sesi Baru
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total Sesi</p>
          <p className="text-2xl font-bold text-gray-900">{opnames.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Draft</p>
          <p className="text-2xl font-bold text-yellow-600">{draftCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 mb-1">Terkonfirmasi</p>
          <p className="text-2xl font-bold text-green-600">{confirmedCount}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Semua Status</option>
              <option value="DRAFT">Draft</option>
              <option value="CONFIRMED">Terkonfirmasi</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Cabang</label>
            <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Semua Cabang</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleFilter} disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer">
              {loading ? "Loading..." : "Cari"}
            </button>
            <button onClick={handleReset} disabled={loading}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition cursor-pointer">
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {opnames.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            <p className="text-3xl mb-3">📋</p>
            <p>Belum ada sesi stock opname</p>
            <button
              onClick={() => { setShowNew(true); setCreateError(""); setNewBranch(""); setNewNote(""); }}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition cursor-pointer"
            >
              Buat Sesi Pertama
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tanggal</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Cabang</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Dibuat oleh</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Produk</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {opnames.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{formatDateTime(o.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-800 whitespace-nowrap font-medium">{o.branch.name}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{o.user.name}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{o._count.items} produk</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[o.status]}`}>
                        {STATUS_LABEL[o.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => router.push(`/stock-opname/${o.id}`)}
                          className="text-blue-600 hover:underline text-xs font-medium cursor-pointer"
                        >
                          {o.status === "DRAFT" ? "Lanjutkan" : "Detail"}
                        </button>
                        {o.status === "DRAFT" && (
                          <button
                            onClick={() => {
                              setDeleteTarget({ id: o.id, shortId: o.id.slice(-8).toUpperCase() });
                              setDeleteError("");
                            }}
                            className="text-red-500 hover:text-red-700 text-xs font-medium cursor-pointer"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Buat sesi baru */}
      {showNew && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNew(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Buat Sesi Stock Opname</h2>
            <p className="text-sm text-gray-500 -mt-2">
              Sistem akan mengambil semua produk aktif beserta stok saat ini sebagai acuan.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cabang <span className="text-red-500">*</span>
              </label>
              <select
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Pilih Cabang --</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catatan (opsional)</label>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Contoh: Opname bulanan April 2026"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {createError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowNew(false)}
                className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newBranch}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
              >
                {creating ? "Membuat..." : "Mulai Opname"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Hapus Draft */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <span className="text-4xl">🗑️</span>
              <h2 className="text-lg font-semibold text-gray-900 mt-2">Hapus Draft Opname?</h2>
            </div>
            <p className="text-sm text-gray-600 text-center">
              Sesi opname <strong>#{deleteTarget.shortId}</strong> beserta semua data yang sudah diisi akan dihapus permanen.
              Tindakan ini <strong>tidak dapat dibatalkan</strong>.
            </p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { if (!deleting) setDeleteTarget(null); }}
                disabled={deleting}
                className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition cursor-pointer"
              >
                {deleting ? "Menghapus..." : "Ya, Hapus Draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
