"use client";

import { useState, useCallback } from "react";
import { formatRupiah, formatDateTime } from "@/lib/format";

const STATUS_LABEL = { OPEN: "Berjalan", CLOSED: "Selesai" };
const STATUS_CLASS  = {
  OPEN:   "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-500",
};

export default function ShiftList({ initialShifts, isAdmin, branches, currentUserId }) {
  const [shifts,        setShifts]        = useState(initialShifts);
  const [loading,       setLoading]       = useState(false);
  const [filterStatus,  setFilterStatus]  = useState("");
  const [filterBranch,  setFilterBranch]  = useState("");

  // Detail modal
  const [detail,        setDetail]        = useState(null);
  const [detailData,    setDetailData]    = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Close-shift form (inside detail modal)
  const [closeMode,     setCloseMode]     = useState(false);
  const [closingBal,    setClosingBal]    = useState("");
  const [closingNote,   setClosingNote]   = useState("");
  const [closeLoading,  setCloseLoading]  = useState(false);
  const [closeError,    setCloseError]    = useState("");

  // ── Fetch list ─────────────────────────────────────────────

  const fetchShifts = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (params.status)   sp.set("status",   params.status);
      if (params.branchId) sp.set("branchId", params.branchId);
      sp.set("limit", "100");
      const res  = await fetch(`/api/shifts?${sp}`);
      const data = await res.json();
      if (res.ok) setShifts(data);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleFilter() { fetchShifts({ status: filterStatus, branchId: filterBranch }); }
  function handleReset()  { setFilterStatus(""); setFilterBranch(""); fetchShifts({}); }

  // ── Open detail ────────────────────────────────────────────

  async function openDetail(shift) {
    setDetail(shift);
    setDetailData(null);
    setDetailLoading(true);
    setCloseMode(false);
    setClosingBal("");
    setClosingNote("");
    setCloseError("");
    try {
      const res  = await fetch(`/api/shifts/${shift.id}`);
      const data = await res.json();
      if (res.ok) setDetailData(data);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetailModal() {
    setDetail(null);
    setDetailData(null);
    setCloseMode(false);
    setClosingBal("");
    setClosingNote("");
    setCloseError("");
  }

  // ── Close shift ────────────────────────────────────────────

  async function handleCloseShift() {
    const bal = parseInt(closingBal);
    if (isNaN(bal) || bal < 0) { setCloseError("Masukkan jumlah kas akhir yang valid"); return; }
    setCloseLoading(true);
    setCloseError("");
    try {
      const res  = await fetch(`/api/shifts/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closingBalance: bal, note: closingNote }),
      });
      const data = await res.json();
      if (!res.ok) { setCloseError(data.error || "Gagal menutup shift"); return; }

      // Update list
      setShifts((prev) => prev.map((s) =>
        s.id === data.id
          ? { ...s, status: "CLOSED", closedAt: data.closedAt, closingBalance: data.closingBalance }
          : s
      ));
      // Refresh detail
      setDetailData((prev) => prev ? { ...prev, ...data, status: "CLOSED" } : prev);
      setDetail((prev) => prev ? { ...prev, status: "CLOSED", closedAt: data.closedAt } : prev);
      setCloseMode(false);
      setClosingBal("");
      setClosingNote("");
    } catch (e) {
      setCloseError("Terjadi kesalahan: " + e.message);
    } finally {
      setCloseLoading(false);
    }
  }

  // ── Summary cards ─────────────────────────────────────────

  const openCount    = shifts.filter((s) => s.status === "OPEN").length;
  const closedCount  = shifts.filter((s) => s.status === "CLOSED").length;
  const totalRevenue = shifts.filter((s) => s.status === "CLOSED")
    .reduce((sum, s) => sum + (s.totalRevenue ?? 0), 0);

  // Can current user close this shift?
  function canClose(shift) {
    return shift.status === "OPEN" && (isAdmin || shift.userId === currentUserId);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">Shift Kasir</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Shift Berjalan</p>
          <p className="text-2xl font-bold text-green-600">{openCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Shift Selesai</p>
          <p className="text-2xl font-bold text-gray-900">{closedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 mb-1">Total Pendapatan</p>
          <p className="text-xl font-bold text-blue-600">{formatRupiah(totalRevenue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">dari shift selesai</p>
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
              <option value="OPEN">Berjalan</option>
              <option value="CLOSED">Selesai</option>
            </select>
          </div>
          {isAdmin && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Cabang</label>
              <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Semua Cabang</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
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
        {shifts.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Belum ada shift</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {isAdmin && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Kasir</th>}
                  {isAdmin && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Cabang</th>}
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Dibuka</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Ditutup</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Modal Awal</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Pendapatan</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Transaksi</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shifts.map((s) => (
                  <tr key={s.id} className={`hover:bg-gray-50 transition ${s.status === "OPEN" ? "bg-green-50/30" : ""}`}>
                    {isAdmin && <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{s.user.name}</td>}
                    {isAdmin && <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.branch.name}</td>}
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{formatDateTime(s.openedAt)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {s.closedAt ? formatDateTime(s.closedAt) : <span className="text-green-600 font-medium">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatRupiah(s.openingBalance)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{formatRupiah(s.totalRevenue)}</td>
                    <td className="px-4 py-3 text-center text-gray-700 whitespace-nowrap">{s.totalTx}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[s.status]}`}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button onClick={() => openDetail(s)}
                        className="text-blue-600 hover:underline text-xs font-medium cursor-pointer">
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Detail Modal ── */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) closeDetailModal(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-gray-900">Detail Shift</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[detail.status]}`}>
                    {STATUS_LABEL[detail.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{detail.user?.name} · {detail.branch?.name}</p>
              </div>
              <button onClick={closeDetailModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer">×</button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {detailLoading && (
                <div className="text-center text-sm text-gray-400 py-8">Memuat data...</div>
              )}

              {!detailLoading && detailData && (
                <>
                  {/* Waktu */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Dibuka</p>
                      <p className="font-medium text-gray-800">{formatDateTime(detailData.openedAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Ditutup</p>
                      <p className="font-medium text-gray-800">
                        {detailData.closedAt
                          ? formatDateTime(detailData.closedAt)
                          : <span className="text-green-600">Masih berjalan</span>}
                      </p>
                    </div>
                  </div>

                  {/* Ringkasan transaksi */}
                  <div className="space-y-3 text-sm">
                    {/* Kas Tunai */}
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Kas Tunai</p>
                      <div className="flex justify-between text-gray-700">
                        <span>Transaksi tunai</span>
                        <span className="font-semibold">{detailData.cashTxCount} transaksi</span>
                      </div>
                      <div className="flex justify-between text-gray-700">
                        <span>Total masuk laci</span>
                        <span className="font-semibold text-green-700">{formatRupiah(detailData.totalCash)}</span>
                      </div>
                    </div>
                    {/* Non-Tunai */}
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
                      <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">
                        Non-Tunai <span className="normal-case font-normal text-purple-500">(info saja)</span>
                      </p>
                      <div className="flex justify-between text-gray-700">
                        <span>Transfer Bank + QRIS</span>
                        <span className="font-semibold">{detailData.nonCashTxCount} transaksi</span>
                      </div>
                      <div className="flex justify-between text-gray-700">
                        <span>Total non-tunai</span>
                        <span className="font-semibold text-purple-700">{formatRupiah(detailData.totalNonCash)}</span>
                      </div>
                      <p className="text-xs text-purple-400 italic">Tidak mempengaruhi selisih kas</p>
                    </div>
                    {/* Grand Total */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex justify-between items-center">
                      <p className="text-xs text-gray-500">Grand Total ({detailData.totalTx} transaksi)</p>
                      <span className="font-bold text-gray-900">{formatRupiah(detailData.totalRevenue)}</span>
                    </div>
                  </div>

                  {/* Kas */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Kas</p>
                    <div className="flex justify-between text-gray-700">
                      <span>Modal awal</span>
                      <span>{formatRupiah(detailData.openingBalance)}</span>
                    </div>
                    <div className="flex justify-between text-gray-700">
                      <span>Ekspektasi kas akhir</span>
                      <span className="font-medium">{formatRupiah(detailData.expectedClosing)}</span>
                    </div>
                    {detailData.closingBalance !== null && detailData.closingBalance !== undefined && (
                      <>
                        <div className="flex justify-between text-gray-700">
                          <span>Kas akhir (fisik)</span>
                          <span className="font-medium">{formatRupiah(detailData.closingBalance)}</span>
                        </div>
                        <div className={`flex justify-between font-semibold border-t border-gray-200 pt-2 mt-1 ${
                          detailData.closingBalance === detailData.expectedClosing
                            ? "text-green-600"
                            : detailData.closingBalance > detailData.expectedClosing
                              ? "text-yellow-600"
                              : "text-red-600"
                        }`}>
                          <span>Selisih</span>
                          <span>{formatRupiah(detailData.closingBalance - detailData.expectedClosing)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Catatan */}
                  {detailData.note && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                      <p className="text-xs font-semibold text-yellow-700 mb-1">Catatan:</p>
                      <p className="text-sm text-yellow-800">{detailData.note}</p>
                    </div>
                  )}

                  {/* ── Form Tutup Shift (inline) ── */}
                  {canClose(detail) && closeMode && (
                    <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-semibold text-orange-700">Tutup Shift</p>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Kas Akhir (Hitung Fisik) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={closingBal ? parseInt(closingBal).toLocaleString("id-ID") : ""}
                          onChange={(e) => setClosingBal(e.target.value.replace(/\./g, "").replace(/[^0-9]/g, ""))}
                          placeholder="Jumlah uang di laci kasir"
                          autoFocus
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                        />
                        {/* Selisih preview */}
                        {closingBal !== "" && !isNaN(parseInt(closingBal)) && (() => {
                          const diff = parseInt(closingBal) - detailData.expectedClosing;
                          return (
                            <p className={`text-xs font-medium text-right mt-1 ${
                              diff === 0 ? "text-green-600" : diff > 0 ? "text-yellow-600" : "text-red-600"
                            }`}>
                              Selisih: {diff > 0 ? "+" : ""}{formatRupiah(diff)}
                              {diff === 0 && " ✓ Sesuai"}
                              {diff > 0 && " (lebih)"}
                              {diff < 0 && " (kurang)"}
                            </p>
                          );
                        })()}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Catatan (opsional)</label>
                        <textarea
                          value={closingNote}
                          onChange={(e) => setClosingNote(e.target.value)}
                          placeholder="Kendala atau catatan shift..."
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none bg-white"
                        />
                      </div>

                      {closeError && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{closeError}</p>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => { setCloseMode(false); setClosingBal(""); setClosingNote(""); setCloseError(""); }}
                          className="flex-1 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-100 transition cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          onClick={handleCloseShift}
                          disabled={closeLoading || closingBal === ""}
                          className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition cursor-pointer"
                        >
                          {closeLoading ? "Menutup..." : "Konfirmasi Tutup"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-2">
              {/* Tombol Tutup Shift — muncul jika shift masih OPEN dan user berhak */}
              {!detailLoading && detailData && canClose(detail) && !closeMode && (
                <button
                  onClick={() => { setCloseMode(true); setCloseError(""); }}
                  className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition cursor-pointer"
                >
                  Tutup Shift Ini
                </button>
              )}
              <button
                onClick={closeDetailModal}
                className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
