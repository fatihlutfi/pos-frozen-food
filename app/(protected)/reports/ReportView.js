"use client";

import { useState, useCallback, useMemo } from "react";
import { formatRupiah, formatDateTime } from "@/lib/format";

// ─── Constants ───────────────────────────────────────────────────────────────

const METHOD_LABEL = { CASH: "Tunai", TRANSFER_BANK: "Transfer Bank", QRIS: "QRIS" };
const METHOD_COLOR = {
  CASH: "bg-green-100 text-green-700",
  TRANSFER_BANK: "bg-blue-100 text-blue-700",
  QRIS: "bg-purple-100 text-purple-700",
};
const METHOD_BAR_COLOR = { CASH: "bg-green-500", TRANSFER_BANK: "bg-blue-500", QRIS: "bg-purple-500" };
const BRANCH_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-orange-500", "bg-pink-500"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtDateLong(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function getISOWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getWeekLabel(weekKey) {
  const [year, w] = weekKey.split("-W");
  const simple = new Date(Number(year), 0, 1 + (Number(w) - 1) * 7);
  const day = simple.getDay();
  const monday = new Date(simple);
  monday.setDate(simple.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${sunday.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`;
}

function getMonthLabel(monthKey) {
  return new Date(monthKey + "-01T00:00:00").toLocaleDateString("id-ID", {
    month: "long", year: "numeric",
  });
}

function aggregateBy(dailySales, groupBy) {
  if (groupBy === "day") return dailySales.map((d) => ({ ...d, label: fmtDate(d.date) }));
  const map = {};
  for (const d of dailySales) {
    const key = groupBy === "week" ? getISOWeek(d.date) : d.date.slice(0, 7);
    if (!map[key]) map[key] = { key, label: "", count: 0, revenue: 0, discount: 0 };
    map[key].count += d.count;
    map[key].revenue += d.revenue;
    map[key].discount += d.discount;
  }
  return Object.values(map)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => ({
      ...row,
      label: groupBy === "week" ? getWeekLabel(row.key) : getMonthLabel(row.key),
    }));
}

function getDefaultDates() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: firstDay.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

function getPresetDates(mode) {
  const today = new Date();
  const days = mode === "week" ? 7 : 30;
  const from = new Date(today);
  from.setDate(today.getDate() - days + 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportCSV(transactionList, branchLabel, dateFrom, dateTo) {
  const headers = ["No. Invoice", "Tanggal", "Cabang", "Kasir", "Metode Bayar", "Subtotal", "Diskon", "Total", "Jml Item"];
  const rows = transactionList.map((t) => [
    t.invoiceNumber,
    new Date(t.createdAt).toLocaleString("id-ID"),
    t.branchName,
    t.userName,
    METHOD_LABEL[t.paymentMethod],
    t.subtotal,
    t.discountAmount,
    t.grandTotal,
    t.itemCount,
  ]);

  const csvContent = [
    `Laporan Penjualan - ${branchLabel}`,
    `Periode: ${fmtDateLong(dateFrom)} s/d ${fmtDateLong(dateTo)}`,
    "",
    headers.join(";"),
    ...rows.map((r) => r.join(";")),
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `laporan-${dateFrom}-sd-${dateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

function sortRows(rows, key, dir) {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number") return dir === "asc" ? av - bv : bv - av;
    return dir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * ProductListCard — reusable card "Produk Terlaris" / "Produk Tidak Laris"
 *
 * type="top" → sort qty DESC, kolom: #, Produk+bar, Qty, Pendapatan, Tren
 * type="low"  → sort qty ASC,  kolom: Produk, Qty, Tren, Stok, Status
 *
 * Sorting SELALU terjadi sebelum slicing.
 * State show-more dikelola lokal — setiap instance independen.
 */
const INITIAL_LIMIT  = 5;
const EXPANDED_LIMIT = 15;

const MEDAL = ["🥇", "🥈", "🥉"];

function ProductListCard({ title, icon, subtitle, data = [], type, periodInfo }) {
  const [showMore, setShowMore] = useState(false);

  // ── 1. Sort SEBELUM slice (clone agar tidak mutasi prop) ──────────────────
  const sortedData = useMemo(() => {
    const clone = [...data];
    return type === "top"
      ? clone.sort((a, b) => b.qty - a.qty)   // Terlaris: qty tertinggi duluan
      : clone.sort((a, b) => a.qty - b.qty);  // Tidak Laris: qty terendah duluan
  }, [data, type]);

  // ── 2. Slice dari data yang sudah diurutkan ───────────────────────────────
  const limit        = showMore ? EXPANDED_LIMIT : INITIAL_LIMIT;
  const visibleItems = sortedData.slice(0, limit);

  // ── 3. Kalkulasi button label ─────────────────────────────────────────────
  const hasMore     = sortedData.length > INITIAL_LIMIT;
  const showTrend   = !!periodInfo;
  // 6–15 item → "Tampilkan semua", >15 → "Tampilkan lebih banyak"
  const expandLabel = sortedData.length <= EXPANDED_LIMIT
    ? `Tampilkan semua (${sortedData.length})`
    : `Tampilkan lebih banyak (${EXPANDED_LIMIT} dari ${sortedData.length})`;

  return (
    <div className="print-card bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
        <span className="text-xs text-gray-400 ml-auto">{subtitle}</span>
      </div>

      {/* ── Empty state ── */}
      {sortedData.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-sm">
          Belum ada penjualan dalam periode ini
        </div>
      ) : (
        <>
          {/* ── Table (hanya visibleItems yang di-render, TIDAK ada hidden rows) ── */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {type === "top" && (
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs w-10">#</th>
                  )}
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs">Produk</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Qty</th>
                  {showTrend && (
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Tren</th>
                  )}
                  {type === "top" && (
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Pendapatan</th>
                  )}
                  {type === "low" && (
                    <>
                      <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Stok</th>
                      <th className="px-4 py-2.5 text-gray-500 font-medium text-xs">Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleItems.map((p, i) => {
                  const rank       = i + 1;
                  const isTopThree = type === "top" && rank <= 3;
                  // Bar width relatif terhadap produk terlaris (index 0 setelah sort)
                  const barPct = sortedData[0]?.qty > 0
                    ? Math.max(4, Math.round((p.qty / sortedData[0].qty) * 100))
                    : 4;

                  return (
                    <tr
                      key={p.name}
                      className={`transition-colors ${isTopThree ? "bg-amber-50/40 hover:bg-amber-50/60" : "hover:bg-gray-50"}`}
                    >
                      {/* Rank dengan medal untuk top 3 */}
                      {type === "top" && (
                        <td className="px-4 py-3 text-center">
                          {rank <= 3
                            ? <span className="text-base leading-none">{MEDAL[rank - 1]}</span>
                            : <span className="text-xs font-bold text-gray-300">{rank}</span>
                          }
                        </td>
                      )}

                      {/* Produk */}
                      <td className="px-4 py-3">
                        <p className={`font-medium text-sm ${isTopThree ? "text-gray-900" : "text-gray-800"}`}>
                          {p.name}
                        </p>
                        {type === "top" && (
                          <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1">
                            <div
                              className="bg-amber-400 h-1 rounded-full transition-all"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        )}
                        {type === "low" && (
                          <p className="text-xs text-gray-400 mt-0.5">{formatRupiah(p.revenue)}</p>
                        )}
                      </td>

                      {/* Qty */}
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{p.qty}</td>

                      {/* Tren */}
                      {showTrend && (
                        <td className="px-4 py-3 text-right">
                          <TrendBadge trend={p.trend} />
                        </td>
                      )}

                      {/* Pendapatan — top only */}
                      {type === "top" && (
                        <td className="px-4 py-3 text-right font-semibold text-green-600 whitespace-nowrap text-xs">
                          {formatRupiah(p.revenue)}
                        </td>
                      )}

                      {/* Stok + Status — low only */}
                      {type === "low" && (
                        <>
                          <td className="px-4 py-3 text-right text-gray-600">{p.currentStock}</td>
                          <td className="px-4 py-3">
                            {p.needsPromo && (
                              <span className="inline-block bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                                Perlu Promo
                              </span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Show more / less — hanya muncul jika data > INITIAL_LIMIT ── */}
          {hasMore && (
            <div className="px-5 py-3 border-t border-gray-100 no-print flex justify-center">
              <button
                onClick={() => setShowMore((v) => !v)}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
              >
                {showMore ? "Tampilkan lebih sedikit" : expandLabel}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SortTh({ label, sortKey, currentKey, currentDir, onSort, className = "" }) {
  const active = currentKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-4 py-3 font-medium text-gray-600 text-xs cursor-pointer select-none whitespace-nowrap hover:text-gray-900 ${className}`}
    >
      {label}
      <span className="ml-1 text-gray-300">
        {active ? (currentDir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}

function BarChart({ data, valueKey, labelKey, colorClass = "bg-blue-500" }) {
  const maxVal = data.length ? Math.max(...data.map((d) => d[valueKey])) : 0;
  if (!data.length) return <p className="py-8 text-center text-gray-400 text-sm">Belum ada data</p>;

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1.5 min-w-0 px-2 pb-2 pt-4" style={{ minHeight: 180 }}>
        {data.map((d, i) => {
          const pct = maxVal > 0 ? Math.max(4, Math.round((d[valueKey] / maxVal) * 140)) : 4;
          return (
            <div key={i} className="flex flex-col items-center flex-1 min-w-[28px] max-w-[56px] group">
              {/* Tooltip */}
              <div className="hidden group-hover:flex flex-col items-center mb-1 z-10">
                <div className="bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg">
                  {formatRupiah(d[valueKey])}
                  <br />
                  <span className="text-gray-300">{d.count} transaksi</span>
                </div>
                <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-800" />
              </div>
              <div
                className={`w-full rounded-t ${colorClass} transition-all`}
                style={{ height: pct }}
              />
              <p className="text-gray-400 mt-1 text-center leading-tight" style={{ fontSize: 9 }}>
                {d[labelKey]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendBadge({ trend }) {
  if (!trend) return <span className="text-gray-300 text-xs">—</span>;
  if (trend.direction === "up") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-600 whitespace-nowrap">
        ↑ {trend.pct !== null ? `${trend.pct}%` : "Baru"}
      </span>
    );
  }
  if (trend.direction === "down") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500 whitespace-nowrap">
        ↓ {Math.abs(trend.pct)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-400 whitespace-nowrap">
      → Stabil
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReportView({ isAdmin, branches, defaultBranchId, defaultBranchName }) {
  const defaults = getDefaultDates();

  // Filter state
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [filterBranch, setFilterBranch] = useState("");
  const [filterMethod, setFilterMethod] = useState("");

  // Report state
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);

  // Analysis period toggle
  const [analysisMode, setAnalysisMode] = useState(null); // null = custom, "week", "month"

  // Chart groupBy
  const [groupBy, setGroupBy] = useState("day");

  // Table sort
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");

  // Applied filter labels (for print header / CSV)
  const [appliedFrom, setAppliedFrom] = useState(defaults.from);
  const [appliedTo, setAppliedTo] = useState(defaults.to);
  const [appliedBranch, setAppliedBranch] = useState("");

  const fetchReport = useCallback(async (params) => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
      if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
      if (params.dateTo) sp.set("dateTo", params.dateTo);
      if (params.branchId) sp.set("branchId", params.branchId);
      if (params.paymentMethod) sp.set("paymentMethod", params.paymentMethod);

      const res = await fetch(`/api/reports?${sp.toString()}`);
      if (!res.ok) throw new Error("Gagal memuat laporan");
      const data = await res.json();
      setReport(data);
      setHasLoaded(true);
      setAppliedFrom(params.dateFrom || "");
      setAppliedTo(params.dateTo || "");
      setAppliedBranch(params.branchId || "");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleLoad() {
    setAnalysisMode(null);
    fetchReport({ dateFrom, dateTo, branchId: filterBranch, paymentMethod: filterMethod });
  }

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function handleAnalysisMode(mode) {
    setAnalysisMode(mode);
    const preset = getPresetDates(mode);
    setDateFrom(preset.from);
    setDateTo(preset.to);
    fetchReport({ dateFrom: preset.from, dateTo: preset.to, branchId: filterBranch, paymentMethod: filterMethod });
  }

  const branchLabel = isAdmin
    ? (appliedBranch ? branches.find((b) => b.id === appliedBranch)?.name ?? "Semua Cabang" : "Semua Cabang")
    : defaultBranchName;

  // Computed chart data
  const chartData = useMemo(() => {
    if (!report?.dailySales) return [];
    return aggregateBy(report.dailySales, groupBy);
  }, [report, groupBy]);

  // Sorted transaction list
  const sortedTx = useMemo(() => {
    if (!report?.transactionList) return [];
    return sortRows(report.transactionList, sortKey, sortDir);
  }, [report, sortKey, sortDir]);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { font-size: 11px; background: white; }
          .print-card { border: 1px solid #e5e7eb !important; break-inside: avoid; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="space-y-5">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Laporan Penjualan</h1>
          {hasLoaded && report && (
            <div className="no-print flex gap-2">
              <button
                onClick={() => exportCSV(report.transactionList, branchLabel, appliedFrom, appliedTo)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer"
              >
                ⬇ Export CSV
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition cursor-pointer"
              >
                🖨 Cetak / PDF
              </button>
            </div>
          )}
        </div>

        {/* ── Filter Bar ── */}
        <div className="no-print bg-white rounded-xl border border-gray-200 p-4">
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
              <label className="text-xs font-medium text-gray-600">Metode Bayar</label>
              <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Semua Metode</option>
                <option value="CASH">Tunai</option>
                <option value="TRANSFER_BANK">Transfer Bank</option>
                <option value="QRIS">QRIS</option>
              </select>
            </div>
            <button onClick={handleLoad} disabled={loading}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer">
              {loading ? "Memuat..." : "Tampilkan Laporan"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {!hasLoaded && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 py-20 text-center text-gray-400 text-sm">
            Pilih rentang tanggal lalu klik <strong>Tampilkan Laporan</strong>
          </div>
        )}

        {hasLoaded && report && (
          <>
            {/* Print header */}
            <div className="print-only text-center mb-4">
              <p className="text-lg font-bold">POS FROZEN FOOD — Laporan Penjualan</p>
              <p className="text-sm text-gray-600">
                {branchLabel} · {appliedFrom ? fmtDateLong(appliedFrom) : "—"} s/d {appliedTo ? fmtDateLong(appliedTo) : "—"}
              </p>
            </div>

            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: "Total Pendapatan", value: formatRupiah(report.summary.totalRevenue), color: "text-green-600" },
                { label: "Jumlah Transaksi", value: report.summary.totalTransactions, color: "text-gray-900" },
                { label: "Rata-rata / Transaksi", value: formatRupiah(report.summary.avgTransaction), color: "text-blue-600" },
                { label: "Total Item Terjual", value: report.summary.totalItems, color: "text-indigo-600" },
                { label: "Total Diskon", value: formatRupiah(report.summary.totalDiscount), color: "text-orange-500" },
              ].map((c) => (
                <div key={c.label} className="print-card bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                  <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* ── Laporan Keuntungan (HPP) ── */}
            {isAdmin && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-gray-900">Laporan Keuntungan</h2>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Profit summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Total Pendapatan (Gross)", value: formatRupiah(report.summary.totalRevenue), color: "text-green-600", bg: "bg-green-50" },
                    { label: "Total HPP (Modal)", value: formatRupiah(report.summary.totalHPP ?? 0), color: "text-orange-600", bg: "bg-orange-50" },
                    { label: "Net Profit", value: formatRupiah(report.summary.netProfit ?? 0), color: (report.summary.netProfit ?? 0) >= 0 ? "text-emerald-700" : "text-red-600", bg: (report.summary.netProfit ?? 0) >= 0 ? "bg-emerald-50" : "bg-red-50" },
                    { label: "Margin %", value: `${(report.summary.marginPct ?? 0).toFixed(1)}%`, color: (report.summary.marginPct ?? 0) >= 20 ? "text-blue-700" : "text-gray-700", bg: "bg-blue-50" },
                  ].map((c) => (
                    <div key={c.label} className={`print-card rounded-xl border border-gray-200 p-4 ${c.bg}`}>
                      <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                      <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                    </div>
                  ))}
                </div>

                {/* Net profit per cabang */}
                {report.byBranch && report.byBranch.length > 0 && (
                  <div className="print-card bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100">
                      <h3 className="font-semibold text-gray-800 text-sm">Net Profit per Cabang</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-5 py-3 font-medium text-gray-600 text-xs">Cabang</th>
                            <th className="text-right px-5 py-3 font-medium text-gray-600 text-xs whitespace-nowrap">Pendapatan</th>
                            <th className="text-right px-5 py-3 font-medium text-gray-600 text-xs whitespace-nowrap">HPP</th>
                            <th className="text-right px-5 py-3 font-medium text-gray-600 text-xs whitespace-nowrap">Net Profit</th>
                            <th className="text-right px-5 py-3 font-medium text-gray-600 text-xs whitespace-nowrap">Margin %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {report.byBranch.map((b, i) => (
                            <tr key={b.name} className="hover:bg-gray-50">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2.5 h-2.5 rounded-full ${BRANCH_COLORS[i % BRANCH_COLORS.length]}`} />
                                  <span className="font-medium text-gray-800">{b.name}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-right text-gray-800">{formatRupiah(b.revenue)}</td>
                              <td className="px-5 py-3 text-right text-orange-500">
                                {(b.hpp ?? 0) > 0 ? formatRupiah(b.hpp) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className={`px-5 py-3 text-right font-semibold ${(b.profit ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {formatRupiah(b.profit ?? 0)}
                              </td>
                              <td className="px-5 py-3 text-right text-blue-600 font-medium">
                                {(b.hpp ?? 0) > 0 ? `${(b.marginPct ?? 0).toFixed(1)}%` : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Grafik Penjualan ── */}
            <div className="print-card bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-semibold text-gray-800 text-sm">Grafik Penjualan</h3>
                <div className="no-print flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                  {[["day", "Harian"], ["week", "Mingguan"], ["month", "Bulanan"]].map(([val, lbl]) => (
                    <button key={val} onClick={() => setGroupBy(val)}
                      className={`px-3 py-1.5 cursor-pointer transition ${groupBy === val ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-3 py-2">
                <BarChart data={chartData} valueKey="revenue" labelKey="label" colorClass="bg-blue-500" />
              </div>
              <div className="px-5 pb-3 flex items-center gap-1 text-xs text-gray-400 no-print">
                <span>Hover bar untuk detail</span>
              </div>
            </div>

            {/* ── Metode Pembayaran ── */}
            <div className="print-card bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800 text-sm">Metode Pembayaran</h3>
              </div>
              <div className="p-5 space-y-4">
                {Object.entries(report.byPaymentMethod).map(([method, data]) => {
                  const pct = report.summary.totalRevenue > 0
                    ? Math.round((data.revenue / report.summary.totalRevenue) * 100) : 0;
                  return (
                    <div key={method}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${METHOD_COLOR[method]}`}>
                          {METHOD_LABEL[method]}
                        </span>
                        <div className="text-right text-sm">
                          <span className="font-semibold text-gray-900">{formatRupiah(data.revenue)}</span>
                          <span className="text-gray-400 text-xs ml-2">{data.count} transaksi · {pct}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div className={`h-2.5 rounded-full transition-all ${METHOD_BAR_COLOR[method]}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Perbandingan Cabang (Admin only, no branch filter) ── */}
            {isAdmin && report.byBranch && report.byBranch.length > 0 && (
              <div className="print-card bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-800 text-sm">Perbandingan Cabang</h3>
                </div>
                <div className="p-5 space-y-4">
                  {report.byBranch.map((b, i) => {
                    const pct = report.summary.totalRevenue > 0
                      ? Math.round((b.revenue / report.summary.totalRevenue) * 100) : 0;
                    return (
                      <div key={b.name}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${BRANCH_COLORS[i % BRANCH_COLORS.length]}`} />
                            <span className="text-sm font-medium text-gray-800">{b.name}</span>
                          </div>
                          <div className="text-right text-sm">
                            <span className="font-semibold text-gray-900">{formatRupiah(b.revenue)}</span>
                            <span className="text-gray-400 text-xs ml-2">{b.count} transaksi · {pct}%</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2.5">
                          <div className={`h-2.5 rounded-full ${BRANCH_COLORS[i % BRANCH_COLORS.length]}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        {b.discount > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">Diskon: {formatRupiah(b.discount)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Analisis Produk ── */}
            {report.productAnalysis && (
              <div className="space-y-4">
                {/* Section header */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Analisis Produk</h2>
                    {report.periodInfo && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Tren vs {fmtDate(report.periodInfo.prevFrom)} – {fmtDate(report.periodInfo.prevTo)}
                      </p>
                    )}
                  </div>
                  <div className="flex-1 h-px bg-gray-200" />
                  <div className="no-print flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                    {[["week", "Mingguan"], ["month", "Bulanan"]].map(([val, lbl]) => (
                      <button key={val} onClick={() => handleAnalysisMode(val)}
                        className={`px-3 py-1.5 cursor-pointer transition ${analysisMode === val ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ProductListCard
                    title="Produk Terlaris"
                    icon="🏆"
                    subtitle="by qty terjual"
                    data={report.productAnalysis.topByQty}
                    type="top"
                    periodInfo={report.periodInfo}
                  />
                  <ProductListCard
                    title="Produk Tidak Laris"
                    icon="📉"
                    subtitle="qty terjual paling sedikit"
                    data={report.productAnalysis.bottomByQty}
                    type="low"
                    periodInfo={report.periodInfo}
                  />
                </div>

                {/* 3. Produk Stagnan */}
                <div className="print-card bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-base">🧊</span>
                    <div>
                      <h3 className="font-semibold text-gray-800 text-sm">Produk Stagnan</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Tidak terjual sama sekali dalam periode ini</p>
                    </div>
                    <span className="ml-auto text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                      {report.productAnalysis.stagnant.length} produk
                    </span>
                  </div>
                  {report.productAnalysis.stagnant.length === 0 ? (
                    <div className="py-10 text-center text-green-600 text-sm font-medium">
                      Semua produk terjual dalam periode ini
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-5 py-2.5 text-gray-500 font-medium text-xs">#</th>
                            <th className="text-left px-5 py-2.5 text-gray-500 font-medium text-xs">Nama Produk</th>
                            <th className="text-right px-5 py-2.5 text-gray-500 font-medium text-xs">Stok Mengendap</th>
                            <th className="px-5 py-2.5 text-gray-500 font-medium text-xs">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {report.productAnalysis.stagnant.map((p, i) => (
                            <tr key={p.name} className="hover:bg-red-50/40 transition">
                              <td className="px-5 py-3 text-gray-400 text-xs">{i + 1}</td>
                              <td className="px-5 py-3 font-medium text-gray-800">{p.name}</td>
                              <td className="px-5 py-3 text-right font-bold text-red-500">{p.currentStock}</td>
                              <td className="px-5 py-3">
                                <span className="inline-block bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                                  Stok Mengendap
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                          <tr>
                            <td colSpan={2} className="px-5 py-2.5 text-xs font-semibold text-gray-600">
                              Total stok mengendap
                            </td>
                            <td className="px-5 py-2.5 text-right font-bold text-red-500">
                              {report.productAnalysis.stagnant.reduce((s, p) => s + p.currentStock, 0)}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tabel Detail Transaksi (Sortable) ── */}
            <div className="print-card bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-semibold text-gray-800 text-sm">Detail Transaksi</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{sortedTx.length} transaksi · klik header kolom untuk sort</p>
                </div>
              </div>
              {sortedTx.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">Tidak ada transaksi dalam rentang ini</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <SortTh label="No. Invoice" sortKey="invoiceNumber" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-left" />
                        <SortTh label="Tanggal" sortKey="createdAt" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-left" />
                        {isAdmin && <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs whitespace-nowrap">Cabang</th>}
                        <SortTh label="Kasir" sortKey="userName" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-left" />
                        <SortTh label="Metode" sortKey="paymentMethod" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-left" />
                        <SortTh label="Item" sortKey="itemCount" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                        <SortTh label="Diskon" sortKey="discountAmount" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                        <SortTh label="Total" sortKey="grandTotal" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedTx.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700 whitespace-nowrap">
                            {tx.invoiceNumber}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                            {formatDateTime(tx.createdAt)}
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{tx.branchName}</td>
                          )}
                          <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{tx.userName}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${METHOD_COLOR[tx.paymentMethod]}`}>
                              {METHOD_LABEL[tx.paymentMethod]}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{tx.itemCount}</td>
                          <td className="px-4 py-2.5 text-right text-orange-500">
                            {tx.discountAmount > 0 ? formatRupiah(tx.discountAmount) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap">
                            {formatRupiah(tx.grandTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Footer total */}
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td colSpan={isAdmin ? 5 : 4} className="px-4 py-3 font-semibold text-gray-800 text-sm">
                          Total ({sortedTx.length} transaksi)
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {sortedTx.reduce((s, t) => s + t.itemCount, 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-orange-500">
                          {formatRupiah(sortedTx.reduce((s, t) => s + t.discountAmount, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-600 text-base whitespace-nowrap">
                          {formatRupiah(sortedTx.reduce((s, t) => s + t.grandTotal, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
