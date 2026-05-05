import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { formatRupiah, formatDateTime, startOfToday } from "@/lib/format";
import Link from "next/link";

export const metadata = { title: "Dashboard — POS Frozen Food" };

const LOW_STOCK_MAX_FETCH = 100; // ambil semua stok di bawah nilai ini, filter by lowStockAlert di JS

// ── WIB (UTC+7) timezone helpers ──────────────────────────────────────────
const WIB_MS = 7 * 60 * 60 * 1000;

/** Hitung selisih hari berdasarkan batas hari WIB */
function diffDaysWIB(expiryDate) {
  const nowWIB     = new Date(Date.now() + WIB_MS);
  const todayDayMs = Date.UTC(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), nowWIB.getUTCDate());
  const expWIB     = new Date(new Date(expiryDate).getTime() + WIB_MS);
  const expDayMs   = Date.UTC(expWIB.getUTCFullYear(), expWIB.getUTCMonth(), expWIB.getUTCDate());
  return Math.ceil((expDayMs - todayDayMs) / 86400000);
}

/** Start of today in WIB as UTC Date — untuk filter Prisma endDate >= hari ini WIB */
function startOfTodayWIB() {
  const nowWIB = new Date(Date.now() + WIB_MS);
  const midnightWIBAsUTC = Date.UTC(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), nowWIB.getUTCDate()) - WIB_MS;
  return new Date(midnightWIBAsUTC);
}

async function getDashboardStats(session) {
  const today    = startOfToday();
  const isAdmin  = session.user.role === "ADMIN";
  const branchFilter = isAdmin ? {} : { branchId: session.user.branchId };

  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const expiryAlertCutoff = new Date();
  expiryAlertCutoff.setDate(expiryAlertCutoff.getDate() + 30);

  // ── Semua query paralel dalam satu Promise.all ────────────────────────────
  const [
    todayStats,
    monthStats,
    lowStockItems,
    recentTransactions,
    branchCount,
    expiryBatches,
    profitData,
    activeBundles,
    activeDiscountCount,
  ] = await Promise.all([
    // Penjualan & jumlah transaksi hari ini
    prisma.transaction.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: today }, ...branchFilter },
      _sum:   { grandTotal: true },
      _count: { id: true },
    }),

    // Penjualan bulan ini
    prisma.transaction.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: firstOfMonth }, ...branchFilter },
      _sum: { grandTotal: true },
    }),

    // Stok menipis — fetch dengan batas longgar, filter by lowStockAlert masing-masing di JS
    prisma.stock.findMany({
      where: { ...branchFilter, quantity: { lte: LOW_STOCK_MAX_FETCH } },
      select: {
        quantity:      true,
        lowStockAlert: true,
        product: { select: { name: true } },
        branch:  { select: { name: true } },
      },
      orderBy: { quantity: "asc" },
    }),

    // Transaksi terbaru (5 terakhir)
    prisma.transaction.findMany({
      where:   { ...branchFilter },
      orderBy: { createdAt: "desc" },
      take:    5,
      include: {
        user:   { select: { name: true } },
        branch: { select: { name: true } },
      },
    }),

    // Cabang aktif (admin only)
    isAdmin
      ? prisma.branch.count({ where: { isActive: true } })
      : Promise.resolve(null),

    // Batch kadaluarsa dalam 30 hari
    prisma.productBatch.findMany({
      where: {
        isActive:   true,
        quantity:   { gt: 0 },
        expiryDate: { lte: expiryAlertCutoff },
        ...branchFilter,
      },
      include: {
        product: { select: { name: true } },
        branch:  { select: { name: true } },
      },
      orderBy: { expiryDate: "asc" },
    }),

    // Net profit — admin only: ambil HPP dari transaction items
    isAdmin
      ? Promise.all([
          prisma.transactionItem.findMany({
            where:  { transaction: { status: "COMPLETED", createdAt: { gte: today } } },
            select: { costPrice: true, quantity: true, subtotal: true },
          }),
          prisma.transactionItem.findMany({
            where:  { transaction: { status: "COMPLETED", createdAt: { gte: firstOfMonth } } },
            select: { costPrice: true, quantity: true, subtotal: true },
          }),
        ])
      : Promise.resolve(null),

    // Bundling aktif hari ini (WIB) — fail-safe jika tabel belum ada
    prisma.bundle.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: new Date() } }] },
          { OR: [{ endDate: null }, { endDate: { gte: startOfTodayWIB() } }] },
          ...(isAdmin ? [] : [{ OR: [{ branchId: session.user.branchId }, { branchId: null }] }]),
        ],
      },
      include: {
        items: { include: { product: { select: { name: true, price: true } } } },
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }).catch(() => []),

    // Jumlah aturan diskon qty aktif
    prisma.productDiscountRule.count({
      where: {
        isActive: true,
        ...(isAdmin ? {} : { branchId: session.user.branchId }),
      },
    }),
  ]);

  // ── Kalkulasi net profit (admin) ──────────────────────────────────────────
  let todayNetProfit = null;
  let monthNetProfit = null;
  let avgMarginPct   = null;

  if (isAdmin && profitData) {
    const [todayItems, monthItems] = profitData;

    const todaySalesVal  = todayStats._sum.grandTotal ?? 0;
    const todayHPP       = todayItems.reduce((s, i) => s + Number(i.costPrice) * Number(i.quantity), 0);
    todayNetProfit        = todaySalesVal - todayHPP;

    const monthSalesVal  = monthStats._sum.grandTotal ?? 0;
    const monthHPP       = monthItems.reduce((s, i) => s + Number(i.costPrice) * Number(i.quantity), 0);
    monthNetProfit        = monthSalesVal - monthHPP;

    avgMarginPct = monthSalesVal > 0
      ? Math.round((monthNetProfit / monthSalesVal) * 100)
      : 0;
  }

  // Batch dengan auto-discount expiry — hitung pakai batas hari WIB
  const expiryPromoCount = expiryBatches.filter((b) => {
    const d = diffDaysWIB(b.expiryDate);
    return d >= 0 && d < 30;
  }).length;

  // Filter lowStockItems by each stock's own lowStockAlert threshold
  const filteredLowStock = lowStockItems.filter((s) => s.quantity <= s.lowStockAlert);

  return {
    todaySales:       todayStats._sum.grandTotal ?? 0,
    todayTransactions: todayStats._count.id ?? 0,
    monthSales:       monthStats._sum.grandTotal ?? 0,
    lowStockItems:    filteredLowStock,
    recentTransactions,
    branchCount,
    todayNetProfit,
    monthNetProfit,
    avgMarginPct,
    expiryBatches,
    activeBundles,
    activeDiscountCount,
    expiryPromoCount,
  };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const stats   = await getDashboardStats(session);
  const isAdmin = session.user.role === "ADMIN";

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isAdmin ? "Ringkasan semua cabang" : `Cabang: ${session.user.branchName}`}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Penjualan Hari Ini"
          value={formatRupiah(stats.todaySales)}
          sub="Transaksi selesai"
          color="blue"
          icon="💰"
        />
        <StatCard
          label="Transaksi Hari Ini"
          value={stats.todayTransactions}
          sub="Total transaksi"
          color="green"
          icon="🧾"
        />
        <StatCard
          label="Penjualan Bulan Ini"
          value={formatRupiah(stats.monthSales)}
          sub="Akumulasi bulan ini"
          color="purple"
          icon="📈"
        />
        {isAdmin ? (
          <StatCard
            label="Cabang Aktif"
            value={stats.branchCount}
            sub="Cabang beroperasi"
            color="orange"
            icon="🏪"
          />
        ) : (
          <StatCard
            label="Stok Menipis"
            value={stats.lowStockItems.length}
            sub="Produk perlu restock"
            color={stats.lowStockItems.length > 0 ? "red" : "green"}
            icon="⚠️"
          />
        )}
      </div>

      {/* Net Profit Cards — admin only */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Net Profit Hari Ini"
            value={formatRupiah(stats.todayNetProfit)}
            sub="Pendapatan − HPP"
            color={stats.todayNetProfit >= 0 ? "green" : "red"}
            icon="📊"
          />
          <StatCard
            label="Net Profit Bulan Ini"
            value={formatRupiah(stats.monthNetProfit)}
            sub="Akumulasi bulan ini"
            color={stats.monthNetProfit >= 0 ? "green" : "red"}
            icon="💹"
          />
          <StatCard
            label="Margin % Bulan Ini"
            value={`${stats.avgMarginPct}%`}
            sub="(Net Profit / Penjualan) × 100"
            color={stats.avgMarginPct >= 20 ? "green" : stats.avgMarginPct >= 10 ? "blue" : "orange"}
            icon="📉"
          />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Transaksi Terbaru */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Transaksi Terbaru</h2>
            <Link href="/transactions" className="text-sm text-blue-600 hover:underline">
              Lihat semua →
            </Link>
          </div>

          {stats.recentTransactions.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              Belum ada transaksi
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {stats.recentTransactions.map((trx) => (
                <div key={trx.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{trx.invoiceNumber}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {trx.user.name} · {trx.branch.name} · {formatDateTime(trx.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatRupiah(trx.grandTotal)}
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        trx.status === "COMPLETED"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-600 text-white"
                      }`}
                    >
                      {trx.status === "COMPLETED" ? "Selesai" : "VOID"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stok Menipis */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">⚠ Stok Menipis</h2>
            <Link href="/products" className="text-sm text-blue-600 hover:underline">
              Kelola →
            </Link>
          </div>

          {stats.lowStockItems.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-green-600">
              ✓ Semua stok aman
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {stats.lowStockItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-gray-400">{item.branch.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-sm font-bold ${item.quantity === 0 ? "text-red-600" : "text-orange-500"}`}>
                      {item.quantity}
                    </span>
                    <p className="text-xs text-gray-400">min {item.lowStockAlert}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expiry Alert Widget */}
      {stats.expiryBatches.length > 0 && (
        <div className="bg-white rounded-xl border border-orange-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-orange-100 bg-orange-50 rounded-t-xl">
            <div className="flex items-center gap-2">
              <span className="text-lg">⏰</span>
              <h2 className="font-semibold text-orange-800">Expiry Alert</h2>
              <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-semibold">
                {stats.expiryBatches.length} batch
              </span>
            </div>
            <Link href="/products" className="text-sm text-orange-700 hover:underline font-medium">
              Kelola Batch →
            </Link>
          </div>
          <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
            {stats.expiryBatches.map((b) => {
              const diffDays = diffDaysWIB(b.expiryDate); // WIB-aware
              const { label, color } = diffDays < 0
                ? { label: "Expired",      color: "bg-black text-white"         }
                : diffDays < 7
                ? { label: "Deal Today",   color: "bg-red-600 text-white"       }
                : diffDays < 30
                ? { label: "Segera Habis", color: "bg-orange-500 text-white"    }
                : { label: "Segera Promo", color: "bg-yellow-400 text-gray-900" };
              const expDateWIB = new Date(b.expiryDate).toLocaleDateString("id-ID", {
                timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric",
              });
              return (
                <div key={b.id} className="flex items-center justify-between px-5 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{b.product.name}</p>
                    <p className="text-xs text-gray-400">{b.branch.name} · {b.batchCode} · Exp: {expDateWIB}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${color}`}>
                      {label}
                    </span>
                    <p className="text-xs text-gray-400">
                      {diffDays < 0 ? "Sudah lewat" : `${diffDays} hari lagi`} · Sisa {b.quantity}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Promo Aktif Hari Ini */}
      {(stats.activeBundles.length > 0 || stats.activeDiscountCount > 0 || stats.expiryPromoCount > 0) && (
        <div className="bg-white rounded-xl border border-orange-300 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-red-50 rounded-t-xl">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔥</span>
              <h2 className="font-semibold text-orange-800">Promo Aktif Hari Ini</h2>
              <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-semibold">
                {stats.activeBundles.length + (stats.activeDiscountCount > 0 ? 1 : 0) + (stats.expiryPromoCount > 0 ? 1 : 0)} jenis promo
              </span>
            </div>
            {isAdmin && (
              <Link href="/promo" className="text-sm text-orange-700 hover:underline font-medium">
                Kelola Promo →
              </Link>
            )}
          </div>
          <div className="p-5 space-y-3">
            {/* Diskon Qty */}
            {stats.activeDiscountCount > 0 && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <span className="text-xl">🏷️</span>
                <div>
                  <p className="text-sm font-medium text-blue-800">Diskon Qty Aktif</p>
                  <p className="text-xs text-blue-600">{stats.activeDiscountCount} aturan diskon berdasarkan jumlah pembelian</p>
                </div>
              </div>
            )}

            {/* Bundling */}
            {stats.activeBundles.map((bundle) => {
              const normalPrice = bundle.items.reduce((s, i) => s + (i.product.price * i.quantity), 0);
              const hemat       = normalPrice - bundle.bundlePrice;
              return (
                <div key={bundle.id} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                  <span className="text-xl">📦</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-green-800">{bundle.name}</p>
                    <p className="text-xs text-green-600">
                      {bundle.items.map((i) => `${i.product.name} ×${i.quantity}`).join(", ")}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs line-through text-gray-400">{bundle.bundlePrice !== normalPrice ? formatRupiah(normalPrice) : ""}</span>
                      <span className="text-xs font-semibold text-green-700">{formatRupiah(bundle.bundlePrice)}</span>
                      {hemat > 0 && <span className="text-xs bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full">Hemat {formatRupiah(hemat)}</span>}
                    </div>
                  </div>
                  {bundle.branch && <span className="text-xs text-gray-400 shrink-0">📍 {bundle.branch.name}</span>}
                </div>
              );
            })}

            {/* Promo Expiry */}
            {stats.expiryPromoCount > 0 && (
              <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                <span className="text-xl">⏰</span>
                <div>
                  <p className="text-sm font-medium text-red-800">Diskon Expiry Otomatis</p>
                  <p className="text-xs text-red-600">{stats.expiryPromoCount} produk mendapat diskon otomatis karena mendekati expired</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Akses Cepat</h2>
        <div className="flex flex-wrap gap-3">
          <QuickLink href="/pos"          label="Buka Kasir"         icon="🛒" color="bg-blue-600"  />
          <QuickLink href="/transactions" label="Riwayat Transaksi"  icon="📋" color="bg-gray-700"  />
          {isAdmin && (
            <>
              <QuickLink href="/products"    label="Kelola Produk" icon="📦" color="bg-green-600"  />
              <QuickLink href="/reports"     label="Laporan"       icon="📊" color="bg-purple-600" />
              <QuickLink href="/admin/users" label="Kelola User"   icon="👥" color="bg-orange-500" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  const colors = {
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
    red:    "bg-red-50 text-red-600",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1.5">{value}</p>
          <p className="text-xs text-gray-400 mt-1">{sub}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${colors[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, label, icon, color }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-4 py-2.5 ${color} text-white rounded-lg text-sm font-medium hover:opacity-90 transition`}
    >
      <span>{icon}</span>
      {label}
    </Link>
  );
}
