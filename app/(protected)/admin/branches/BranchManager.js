"use client";

import { useState } from "react";

const EMPTY_FORM = { name: "", address: "", phone: "" };

const LOW_STOCK = 20;

export default function BranchManager({ initialBranches }) {
  const [branches, setBranches] = useState(initialBranches);

  // Create / Edit modal
  const [modal, setModal]   = useState(null); // null | "create" | "edit"
  const [editing, setEditing] = useState(null);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [toggling, setToggling] = useState(null);

  // Stock summary modal
  const [stockModal, setStockModal]   = useState(false);
  const [stockBranch, setStockBranch] = useState(null); // { id, name }
  const [stockData, setStockData]     = useState(null);  // API response
  const [stockLoading, setStockLoading] = useState(false);
  const [stockFilter, setStockFilter]   = useState("all"); // all | low | out

  // ── Form helpers ──────────────────────────────────────────────────────────

  function openCreate() {
    setForm(EMPTY_FORM);
    setError("");
    setModal("create");
  }

  function openEdit(branch) {
    setEditing(branch);
    setForm({ name: branch.name, address: branch.address ?? "", phone: branch.phone ?? "" });
    setError("");
    setModal("edit");
  }

  function closeModal() {
    setModal(null);
    setEditing(null);
    setError("");
  }

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      const isEdit = modal === "edit";
      const url    = isEdit ? `/api/admin/branches/${editing.id}` : "/api/admin/branches";
      const method = isEdit ? "PATCH" : "POST";

      const res  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Terjadi kesalahan"); return; }

      if (isEdit) {
        setBranches((prev) => prev.map((b) => (b.id === data.id ? data : b)));
      } else {
        setBranches((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(branch) {
    setToggling(branch.id);
    try {
      const res  = await fetch(`/api/admin/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !branch.isActive }),
      });
      const data = await res.json();
      if (res.ok) setBranches((prev) => prev.map((b) => (b.id === data.id ? data : b)));
    } finally {
      setToggling(null);
    }
  }

  // ── Stock modal helpers ───────────────────────────────────────────────────

  async function openStock(branch) {
    setStockBranch(branch);
    setStockData(null);
    setStockFilter("all");
    setStockModal(true);
    setStockLoading(true);
    try {
      const res  = await fetch(`/api/admin/branches/${branch.id}`);
      const data = await res.json();
      if (res.ok) setStockData(data);
    } finally {
      setStockLoading(false);
    }
  }

  function closeStock() {
    setStockModal(false);
    setStockBranch(null);
    setStockData(null);
  }

  const filteredStocks = stockData
    ? stockData.stocks.filter((s) => {
        if (stockFilter === "out") return s.quantity === 0;
        if (stockFilter === "low") return s.quantity > 0 && s.quantity <= LOW_STOCK;
        return true;
      })
    : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Manajemen Cabang</h1>
          <p className="text-sm text-gray-500 mt-0.5">{branches.length} cabang terdaftar</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition cursor-pointer"
        >
          + Tambah Cabang
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {branches.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Belum ada cabang</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Nama Cabang</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Alamat</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Telepon</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-600">Kasir</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-600">Transaksi</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-600">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {branches.map((b) => (
                  <tr key={b.id} className={`hover:bg-gray-50 transition ${!b.isActive ? "opacity-60" : ""}`}>
                    <td className="px-5 py-3 font-semibold text-gray-900">{b.name}</td>
                    <td className="px-5 py-3 text-gray-600 max-w-[180px] truncate">
                      {b.address || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {b.phone || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-5 py-3 text-center text-gray-700">{b._count.users}</td>
                    <td className="px-5 py-3 text-center text-gray-700">{b._count.transactions}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        b.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {b.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-3 flex-wrap">
                        <button
                          onClick={() => openEdit(b)}
                          className="text-blue-600 hover:underline text-xs font-medium cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openStock(b)}
                          className="text-indigo-600 hover:underline text-xs font-medium cursor-pointer"
                        >
                          Lihat Stok
                        </button>
                        <button
                          onClick={() => handleToggleActive(b)}
                          disabled={toggling === b.id}
                          className={`text-xs font-medium cursor-pointer disabled:opacity-50 ${
                            b.isActive ? "text-orange-500 hover:underline" : "text-green-600 hover:underline"
                          }`}
                        >
                          {toggling === b.id ? "..." : b.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ── */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">
                {modal === "create" ? "Tambah Cabang" : "Edit Cabang"}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Cabang <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="cth: Cabang Utama"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setField("address", e.target.value)}
                  placeholder="cth: Jl. Sudirman No. 1, Jakarta"
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telepon</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="cth: 021-1234567"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={closeModal} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer">
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
              >
                {saving ? "Menyimpan..." : modal === "create" ? "Tambah Cabang" : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stock Summary Modal ── */}
      {stockModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) closeStock(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900">Ringkasan Stok</h2>
                <p className="text-xs text-indigo-600 mt-0.5">{stockBranch?.name}</p>
              </div>
              <button onClick={closeStock} className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer">×</button>
            </div>

            {stockLoading ? (
              <div className="flex-1 flex items-center justify-center py-16 text-sm text-gray-400">
                Memuat data stok...
              </div>
            ) : stockData ? (
              <>
                {/* Summary cards */}
                <div className="px-6 pt-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                  {[
                    { label: "Total Produk", value: stockData.summary.totalProducts, color: "text-gray-900" },
                    { label: "Total Unit", value: stockData.summary.totalUnits, color: "text-blue-600" },
                    { label: "Stok Menipis", value: stockData.summary.lowStock, color: "text-orange-500" },
                    { label: "Habis", value: stockData.summary.outOfStock, color: "text-red-500" },
                  ].map((c) => (
                    <div key={c.label} className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 mb-0.5">{c.label}</p>
                      <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                    </div>
                  ))}
                </div>

                {/* Filter tabs */}
                <div className="px-6 pb-3 shrink-0">
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium w-fit">
                    {[
                      { key: "all", label: `Semua (${stockData.stocks.length})` },
                      { key: "low", label: `Menipis (${stockData.summary.lowStock})` },
                      { key: "out", label: `Habis (${stockData.summary.outOfStock})` },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setStockFilter(key)}
                        className={`px-3 py-2 cursor-pointer transition ${
                          stockFilter === key ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stock table */}
                <div className="overflow-y-auto flex-1 px-6 pb-4">
                  {filteredStocks.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-sm">Tidak ada produk</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">Produk</th>
                          <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">Kategori</th>
                          <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs">Stok</th>
                          <th className="text-center px-3 py-2.5 font-medium text-gray-600 text-xs">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredStocks.map((s) => {
                          const isOut = s.quantity === 0;
                          const isLow = !isOut && s.quantity <= LOW_STOCK;
                          return (
                            <tr key={s.productName} className="hover:bg-gray-50">
                              <td className="px-3 py-2.5">
                                <span className={`font-medium ${!s.isActive ? "text-gray-400 line-through" : "text-gray-800"}`}>
                                  {s.productName}
                                </span>
                                {!s.isActive && (
                                  <span className="ml-2 text-xs text-gray-400">(nonaktif)</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-gray-500 text-xs">{s.categoryName}</td>
                              <td className={`px-3 py-2.5 text-right font-bold ${
                                isOut ? "text-red-500" : isLow ? "text-orange-500" : "text-gray-900"
                              }`}>
                                {s.quantity}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {isOut ? (
                                  <span className="inline-block bg-red-100 text-red-600 text-xs font-medium px-2 py-0.5 rounded-full">Habis</span>
                                ) : isLow ? (
                                  <span className="inline-block bg-orange-100 text-orange-600 text-xs font-medium px-2 py-0.5 rounded-full">Menipis</span>
                                ) : (
                                  <span className="inline-block bg-green-100 text-green-600 text-xs font-medium px-2 py-0.5 rounded-full">Aman</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center py-16 text-sm text-red-400">
                Gagal memuat data stok
              </div>
            )}

            <div className="px-6 py-4 border-t border-gray-100 shrink-0">
              <button onClick={closeStock} className="w-full px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
