"use client";

import { useState, useCallback } from "react";
import { formatRupiah, formatDateTime } from "@/lib/format";
import { printReceipt } from "@/lib/printReceipt";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  COMPLETED: "Selesai",
  VOIDED:    "VOID",
};

const STATUS_CLASS = {
  COMPLETED: "bg-green-100 text-green-700",
  VOIDED:    "bg-red-600  text-white font-semibold",
};

const METHOD_LABEL = {
  CASH:          "Tunai",
  TRANSFER_BANK: "Transfer Bank",
  QRIS:          "QRIS",
};

// ─── Component ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function TransactionList({ initialTransactions, branches, isAdmin, defaultBranchId }) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [loading, setLoading]           = useState(false);
  const [selected, setSelected]         = useState(null);
  const [printSize, setPrintSize]       = useState("80mm");

  // Void states
  const [voidMode,   setVoidMode]   = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding,    setVoiding]    = useState(false);
  const [voidError,  setVoidError]  = useState("");

  // Filter state
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom,      setDateFrom]      = useState(today);
  const [dateTo,        setDateTo]        = useState(today);
  const [filterBranch,  setFilterBranch]  = useState("");
  const [filterStatus,  setFilterStatus]  = useState("");

  // Pagination state
  const [page,      setPage]      = useState(1);
  const [totalRows, setTotalRows] = useState(initialTransactions.length);
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTransactions = useCallback(async (params = {}, targetPage = 1) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
      if (params.dateTo)   sp.set("dateTo",   params.dateTo);
      if (params.branchId) sp.set("branchId", params.branchId);
      if (params.status)   sp.set("status",   params.status);
      sp.set("limit",  String(PAGE_SIZE));
      sp.set("offset", String((targetPage - 1) * PAGE_SIZE));
      const res  = await fetch(`/api/transactions?${sp.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setTransactions(data);
        setTotalRows(parseInt(res.headers.get("X-Total-Count") || "0", 10));
        setPage(targetPage);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function handleFilter() {
    fetchTransactions({ dateFrom, dateTo, branchId: filterBranch, status: filterStatus }, 1);
  }

  function handleReset() {
    setDateFrom(today); setDateTo(today);
    setFilterBranch(""); setFilterStatus("");
    fetchTransactions({ dateFrom: today, dateTo: today }, 1);
  }

  function handlePageChange(newPage) {
    fetchTransactions({ dateFrom, dateTo, branchId: filterBranch, status: filterStatus }, newPage);
  }

  // ── Open / Close detail ────────────────────────────────────────────────────

  function openDetail(tx) {
    setSelected(tx);
    setVoidMode(false);
    setVoidReason("");
    setVoidError("");
  }

  function closeDetail() {
    setSelected(null);
    setVoidMode(false);
    setVoidReason("");
    setVoidError("");
  }

  // ── Void handler ───────────────────────────────────────────────────────────

  async function handleVoid() {
    if (!voidReason.trim()) return;
    setVoiding(true);
    setVoidError("");
    try {
      const res = await fetch(`/api/transactions/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voidReason: voidReason.trim() }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setVoidError(`Server error (HTTP ${res.status})`);
        return;
      }

      if (!res.ok) {
        setVoidError((data.error || "Gagal void transaksi") + (data.detail ? `: ${data.detail}` : ""));
        return;
      }

      setTransactions((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      setSelected(data);
      setVoidMode(false);
      setVoidReason("");
    } catch (err) {
      setVoidError("Terjadi kesalahan: " + err.message);
    } finally {
      setVoiding(false);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  const completedTx  = transactions.filter((t) => t.status === "COMPLETED");
  const totalRevenue = completedTx.reduce((s, t) => s + t.grandTotal, 0);
  const voidedCount  = transactions.filter((t) => t.status === "VOIDED" ).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">Riwayat Transaksi</h1>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Dari Tanggal</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Sampai Tanggal</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Semua Status</option>
              <option value="COMPLETED">Selesai</option>
              <option value="VOIDED">VOID</option>
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total Transaksi</p>
          <p className="text-2xl font-bold text-gray-900">{transactions.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">{completedTx.length} selesai</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total Pendapatan</p>
          <p className="text-2xl font-bold text-green-600">{formatRupiah(totalRevenue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">dari transaksi selesai</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 mb-1">Void</p>
          <p className="text-2xl font-bold text-red-500">{voidedCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">transaksi</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {transactions.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Tidak ada transaksi ditemukan</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">No. Invoice</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tanggal</th>
                  {isAdmin && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Cabang</th>}
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Kasir</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Pembayaran</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Total</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className={`hover:bg-gray-50 transition ${tx.status === "VOIDED" ? "bg-red-50/30" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700 whitespace-nowrap">
                      {tx.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{formatDateTime(tx.createdAt)}</td>
                    {isAdmin && <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{tx.branch.name}</td>}
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{tx.user.name}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{METHOD_LABEL[tx.paymentMethod]}</td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${tx.status === "VOIDED" ? "text-gray-400 line-through" : "text-gray-900"}`}>
                      {formatRupiah(tx.grandTotal)}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${STATUS_CLASS[tx.status]}`}>
                        {STATUS_LABEL[tx.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button onClick={() => openDetail(tx)}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-500">
            Halaman {page} dari {totalPages} ({totalRows} transaksi)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              ← Sebelumnya
            </button>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              Berikutnya →
            </button>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-gray-900">Detail Transaksi</h2>
                  {selected.status === "VOIDED" && (
                    <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">VOID</span>
                  )}
                </div>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{selected.invoiceNumber}</p>
              </div>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer">×</button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Info umum */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Tanggal</p>
                  <p className="font-medium text-gray-800">{formatDateTime(selected.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Status</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${STATUS_CLASS[selected.status]}`}>
                    {STATUS_LABEL[selected.status]}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Cabang</p>
                  <p className="font-medium text-gray-800">{selected.branch.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Kasir</p>
                  <p className="font-medium text-gray-800">{selected.user.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Metode Bayar</p>
                  <p className="font-medium text-gray-800">{METHOD_LABEL[selected.paymentMethod]}</p>
                </div>
                {selected.voidedAt && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Waktu Void</p>
                    <p className="font-medium text-red-600">{formatDateTime(selected.voidedAt)}</p>
                  </div>
                )}
              </div>

              {/* Void reason box */}
              {selected.status === "VOIDED" && selected.voidReason && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-red-700 mb-1">Alasan Void:</p>
                  <p className="text-sm text-red-700">{selected.voidReason}</p>
                </div>
              )}

              {/* Items */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Item Pembelian</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Produk</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600">Qty</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Harga</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selected.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 text-gray-800">{item.product.name}</td>
                          <td className="px-3 py-2 text-center text-gray-600">{item.quantity}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{formatRupiah(item.price)}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">{formatRupiah(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span><span>{formatRupiah(selected.subtotal)}</span>
                </div>
                {selected.discountAmount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Diskon</span><span>- {formatRupiah(selected.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-base text-gray-900 pt-1 border-t border-gray-200">
                  <span>Total</span><span>{formatRupiah(selected.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Dibayar</span><span>{formatRupiah(selected.amountPaid)}</span>
                </div>
                {selected.changeAmount > 0 && (
                  <div className="flex justify-between font-medium text-gray-800">
                    <span>Kembalian</span><span>{formatRupiah(selected.changeAmount)}</span>
                  </div>
                )}
              </div>

              {/* Void inline error */}
              {voidError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {voidError}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-2">

              {/* Print row — only for COMPLETED */}
              {selected.status === "COMPLETED" && (
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium shrink-0">
                    {["58mm", "80mm"].map((s) => (
                      <button key={s} onClick={() => setPrintSize(s)}
                        className={`px-2.5 py-1.5 cursor-pointer transition ${printSize === s ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => printReceipt(selected, printSize)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer">
                    🖨 Cetak Ulang
                  </button>
                </div>
              )}

              {/* Void input — expands inline when voidMode */}
              {isAdmin && selected.status === "COMPLETED" && (
                voidMode ? (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="text-xs font-semibold text-red-700 mb-1 block">Alasan Void *</label>
                      <textarea
                        value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                        placeholder="Contoh: Kesalahan input harga, permintaan pelanggan, dll."
                        rows={2}
                        className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setVoidMode(false); setVoidReason(""); setVoidError(""); }}
                        className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleVoid}
                        disabled={!voidReason.trim() || voiding}
                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition cursor-pointer"
                      >
                        {voiding ? "Memproses..." : "Konfirmasi Void"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setVoidMode(true); setVoidError(""); }}
                    className="w-full px-4 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition cursor-pointer"
                  >
                    Void Transaksi
                  </button>
                )
              )}

              {/* Close button */}
              <button onClick={closeDetail}
                className="w-full px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
