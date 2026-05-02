"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { formatRupiah, formatDateTime } from "@/lib/format";
import ReceiptModal from "./ReceiptModal";
import { useOfflineQueue } from "@/lib/useOfflineQueue";

const STORAGE_KEY = "pos-sidebar-collapsed";

function toggleSidebar() {
  window.dispatchEvent(new CustomEvent("toggle-pos-sidebar"));
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Tunai", icon: "💵" },
  { value: "TRANSFER_BANK", label: "Transfer Bank", icon: "🏦" },
  { value: "QRIS", label: "QRIS", icon: "📱" },
];

// Hitung expiry status dari tanggal kadaluarsa + promo settings yang dikonfigurasi admin
function getExpiryInfo(expiryDate, settings = null) {
  const diffDays       = Math.ceil((new Date(expiryDate) - new Date()) / 86400000);
  const criticalDays   = settings?.isActive ? (settings.criticalDays   ?? 7)  : 7;
  const warningDays    = settings?.isActive ? (settings.warningDays    ?? 30) : 30;
  const criticalDisc   = settings?.isActive ? (settings.criticalDiscount ?? 25) : 25;
  const warningDisc    = settings?.isActive ? (settings.warningDiscount  ?? 15) : 15;

  if (diffDays < 0)             return { status: "expired",  label: "Expired",      autoDiscount: 0,           blocked: true,  cls: "bg-black text-white"         };
  if (diffDays < criticalDays)  return { status: "critical",  label: "Deal Today",   autoDiscount: criticalDisc, blocked: false, cls: "bg-red-600 text-white"        };
  if (diffDays < warningDays)   return { status: "warning",   label: "Segera Habis", autoDiscount: warningDisc,  blocked: false, cls: "bg-orange-500 text-white"     };
  if (diffDays < 90)            return { status: "soon",      label: "Segera Promo", autoDiscount: 0,            blocked: false, cls: "bg-yellow-400 text-gray-900"  };
  return                               { status: "good",      label: null,           autoDiscount: 0,            blocked: false, cls: ""                            };
}

export default function POSInterface({
  products: initialProducts, categories, branches,
  isAdmin, defaultBranchId, defaultBranchName, cashierName,
  userId, initialShift, batchAlerts = [], activeBundles = [], promoSettings = null,
}) {
  const router = useRouter();

  // Salinan lokal produk — diupdate langsung setelah transaksi tanpa fetch ulang
  const [products, setProducts] = useState(initialProducts);

  // Branch selection (admin only)
  const [selectedBranchId, setSelectedBranchId] = useState(
    isAdmin ? (branches[0]?.id ?? "") : defaultBranchId
  );

  // Product browser state
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [mobileTab, setMobileTab] = useState("products"); // "products" | "cart"

  // Cart state
  const [cart, setCart] = useState([]); // [{ product, quantity }]

  // Checkout state
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [amountPaid, setAmountPaid] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  // Receipt
  const [receipt, setReceipt] = useState(null);

  // Offline queue
  const { isOnline, pendingCount, failedCount, syncing, enqueue, syncQueue } = useOfflineQueue();

  // Sinkronkan icon hamburger dengan state sidebar di AppShell
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    try { setSidebarCollapsed(localStorage.getItem(STORAGE_KEY) === "true"); } catch {}
    function handler() {
      setSidebarCollapsed((prev) => !prev);
    }
    window.addEventListener("toggle-pos-sidebar", handler);
    return () => window.removeEventListener("toggle-pos-sidebar", handler);
  }, []);

  // Shift state
  const [activeShift,      setActiveShift]      = useState(initialShift);
  const [showOpenShift,    setShowOpenShift]     = useState(false);
  const [showCloseShift,   setShowCloseShift]    = useState(false);
  const [openingBalance,   setOpeningBalance]    = useState("");
  const [closingBalance,   setClosingBalance]    = useState("");
  const [closingNote,      setClosingNote]       = useState("");
  const [shiftLoading,     setShiftLoading]      = useState(false);
  const [shiftError,       setShiftError]        = useState("");
  const [shiftSummary,     setShiftSummary]      = useState(null); // data saat tutup shift

  // Nama cabang yang aktif
  const activeBranchName = isAdmin
    ? branches.find((b) => b.id === selectedBranchId)?.name ?? ""
    : defaultBranchName;

  // Ambil stok produk untuk cabang yang dipilih
  function getStockForBranch(product) {
    const s = product.stocks.find((s) => s.branchId === selectedBranchId);
    return s ? s.quantity : 0;
  }

  // Update stok lokal setelah transaksi berhasil — tanpa re-fetch ke server
  function deductLocalStock(soldItems, branchId) {
    setProducts((prev) =>
      prev.map((p) => {
        const sold = soldItems.find((i) => i.productId === p.id);
        if (!sold) return p;
        return {
          ...p,
          stocks: p.stocks.map((s) =>
            s.branchId === branchId
              ? { ...s, quantity: Math.max(0, s.quantity - sold.quantity) }
              : s
          ),
        };
      })
    );
  }

  // Ambil expiry info dari batch terdekat kadaluarsa untuk produk+cabang ini
  function getProductExpiryInfo(productId) {
    const nearest = batchAlerts
      .filter((b) => b.productId === productId && b.branchId === selectedBranchId && b.quantity > 0)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0];
    return nearest ? getExpiryInfo(nearest.expiryDate, promoSettings) : null;
  }

  // Tambah semua produk dalam bundling ke keranjang dengan harga bundle
  function addBundleToCart(bundle) {
    const normalTotal = bundle.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    const discountPct = normalTotal > bundle.bundlePrice
      ? Math.round((1 - bundle.bundlePrice / normalTotal) * 100)
      : 0;

    for (const item of bundle.items) {
      const product = products.find((p) => p.id === item.product.id);
      if (!product) continue;
      const stock = getStockForBranch(product);
      if (stock <= 0) continue;

      setCart((prev) => {
        const existing = prev.find((i) => i.product.id === product.id);
        const newQty   = (existing?.quantity ?? 0) + item.quantity;
        const effectivePrice = discountPct > 0 ? Math.round(product.price * (1 - discountPct / 100)) : product.price;
        if (existing) {
          return prev.map((i) =>
            i.product.id === product.id
              ? { ...i, quantity: Math.min(stock, newQty), discountPct, effectivePrice }
              : i
          );
        }
        return [...prev, { product, quantity: Math.min(stock, item.quantity), discountPct, effectivePrice, expiryInfo: null }];
      });
    }
    if (mobileTab === "products") setMobileTab("cart");
  }

  // Filter produk
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = filterCategory ? p.categoryId === filterCategory : true;
      return matchSearch && matchCat;
    });
  }, [products, search, filterCategory]);

  // ── Qty discount helpers ───────────────────────────────────

  function getApplicableDiscount(product, qty) {
    const rules = (product.discountRules || []).filter(
      (r) => r.isActive !== false && r.minQty <= qty && r.branchId === selectedBranchId
    );
    if (rules.length === 0) return 0;
    return Math.max(...rules.map((r) => r.discountPercent));
  }

  function getEffectivePrice(product, qty) {
    const disc = getApplicableDiscount(product, qty);
    return disc > 0 ? Math.round(product.price * (1 - disc / 100)) : product.price;
  }

  // ── Cart operations ────────────────────────────────────────

  function addToCart(product) {
    const stock = getStockForBranch(product);
    if (stock <= 0) return;

    // Block produk expired
    const expiryInfo = getProductExpiryInfo(product.id);
    if (expiryInfo?.blocked) return;

    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= stock) return prev;
        const newQty         = existing.quantity + 1;
        const qtyDiscPct     = getApplicableDiscount(product, newQty);
        const expiryDisc     = expiryInfo?.autoDiscount ?? 0;
        const discountPct    = Math.max(qtyDiscPct, expiryDisc);
        const effectivePrice = discountPct > 0 ? Math.round(product.price * (1 - discountPct / 100)) : product.price;
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: newQty, discountPct, effectivePrice }
            : i
        );
      }
      const qtyDiscPct     = getApplicableDiscount(product, 1);
      const expiryDisc     = expiryInfo?.autoDiscount ?? 0;
      const discountPct    = Math.max(qtyDiscPct, expiryDisc);
      const effectivePrice = discountPct > 0 ? Math.round(product.price * (1 - discountPct / 100)) : product.price;
      return [...prev, { product, quantity: 1, discountPct, effectivePrice, expiryInfo }];
    });
    if (mobileTab === "products") setMobileTab("cart");
  }

  function updateQty(productId, delta) {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.product.id !== productId) return i;
          const stock          = getStockForBranch(i.product);
          const newQty         = Math.min(stock, Math.max(1, i.quantity + delta));
          const discountPct    = getApplicableDiscount(i.product, newQty);
          const effectivePrice = getEffectivePrice(i.product, newQty);
          return { ...i, quantity: newQty, discountPct, effectivePrice };
        })
        .filter((i) => i.quantity > 0)
    );
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  function clearCart() {
    setCart([]);
    setAmountPaid("");
    setCheckoutError("");
    setPaymentMethod("CASH");
  }

  // ── Shift handlers ────────────────────────────────────────

  async function handleOpenShift() {
    const bal = parseInt(openingBalance) || 0;
    setShiftLoading(true);
    setShiftError("");
    try {
      const res  = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingBalance: bal, branchId: selectedBranchId }),
      });
      const data = await res.json();
      if (!res.ok) { setShiftError(data.error || "Gagal membuka shift"); return; }
      setActiveShift(data);
      setShowOpenShift(false);
      setOpeningBalance("");
    } catch (e) {
      setShiftError("Terjadi kesalahan: " + e.message);
    } finally {
      setShiftLoading(false);
    }
  }

  async function handleLoadShiftSummary() {
    if (!activeShift) return;
    setShiftLoading(true);
    setShiftError("");
    try {
      const res  = await fetch(`/api/shifts/${activeShift.id}`);
      const data = await res.json();
      if (res.ok) setShiftSummary(data);
    } finally {
      setShiftLoading(false);
    }
  }

  async function handleCloseShift() {
    const bal = parseInt(closingBalance);
    if (isNaN(bal) || bal < 0) { setShiftError("Masukkan jumlah kas akhir yang valid"); return; }
    setShiftLoading(true);
    setShiftError("");
    try {
      const res  = await fetch(`/api/shifts/${activeShift.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closingBalance: bal, note: closingNote }),
      });
      const data = await res.json();
      if (!res.ok) { setShiftError(data.error || "Gagal menutup shift"); return; }
      // Shift berhasil ditutup — logout kasir dan redirect ke login
      signOut({ callbackUrl: "/login" });
    } catch (e) {
      setShiftError("Terjadi kesalahan: " + e.message);
    } finally {
      setShiftLoading(false);
    }
  }

  // ── Kalkulasi ──────────────────────────────────────────────

  const subtotal   = cart.reduce((sum, i) => sum + (i.effectivePrice ?? i.product.price) * i.quantity, 0);
  const grandTotal = subtotal;
  // amountPaid disimpan sebagai string angka murni (tanpa titik)
  const paid = parseInt(amountPaid) || 0;
  const change = paymentMethod === "CASH" ? Math.max(0, paid - grandTotal) : 0;
  const isPaymentValid =
    cart.length > 0 &&
    (paymentMethod !== "CASH" || paid >= grandTotal);

  // ── Checkout ───────────────────────────────────────────────

  async function handleCheckout() {
    if (!isPaymentValid) return;
    setCheckoutError("");
    setLoading(true);

    const txPayload = {
      items: cart.map((i) => ({
        productId:       i.product.id,
        quantity:        i.quantity,
        price:           i.effectivePrice ?? i.product.price,
        discountPercent: i.discountPct ?? 0,
      })),
      paymentMethod,
      discountAmount: 0,
      amountPaid: paymentMethod === "CASH" ? paid : grandTotal,
      branchId: selectedBranchId,
    };

    // ── Offline: simpan ke queue, tampilkan struk sementara ──────────────
    if (!isOnline) {
      const offlineId = enqueue(txPayload);
      setLoading(false);
      // Buat struk sementara (tanpa invoice number yang valid)
      setReceipt({
        _offline:      true,
        _offlineId:    offlineId,
        invoiceNumber: `OFFLINE-${Date.now()}`,
        paymentMethod,
        status:        "PENDING_SYNC",
        subtotal,
        discountAmount: discountAmt,
        grandTotal,
        amountPaid: txPayload.amountPaid,
        changeAmount: change,
        createdAt: new Date().toISOString(),
        branch:  { name: activeBranchName },
        user:    { name: cashierName },
        items: cart.map((i) => ({
          quantity: i.quantity,
          price:    i.effectivePrice ?? i.product.price,
          subtotal: (i.effectivePrice ?? i.product.price) * i.quantity,
          product:  { name: i.product.name },
        })),
      });
      return;
    }

    // ── Online: proses normal ─────────────────────────────────────────────
    try {
      const res = await fetch("/api/transactions", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(txPayload),
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setCheckoutError(data.error || "Terjadi kesalahan saat checkout");
        return;
      }

      // Update stok lokal langsung — tidak perlu refresh halaman
      deductLocalStock(
        txPayload.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        selectedBranchId
      );

      setReceipt(data);
    } catch (e) {
      // Jika fetch gagal (misal internet tiba-tiba putus saat request)
      setLoading(false);
      setCheckoutError("Koneksi bermasalah. Cek jaringan dan coba lagi, atau tunggu antrian offline tersinkron.");
    }
  }

  // ── Render ─────────────────────────────────────────────────

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <>
      <div className="h-full flex flex-col">
        {/* ── Offline Banner ── */}
        {!isOnline && (
          <div className="shrink-0 bg-orange-500 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm font-medium">
            <span>Offline — transaksi akan disimpan & dikirim saat koneksi kembali</span>
            {pendingCount > 0 && (
              <span className="bg-white text-orange-600 px-2 py-0.5 rounded-full text-xs font-bold">
                {pendingCount} antrian
              </span>
            )}
          </div>
        )}
        {isOnline && (pendingCount > 0 || failedCount > 0) && (
          <div className="shrink-0 bg-blue-600 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm">
            <span>
              {syncing
                ? "Menyinkronkan transaksi offline..."
                : `${pendingCount} transaksi offline menunggu sinkronisasi${failedCount > 0 ? ` · ${failedCount} gagal` : ""}`}
            </span>
            {!syncing && (
              <button
                onClick={syncQueue}
                className="bg-white text-blue-700 px-3 py-0.5 rounded-full text-xs font-bold hover:bg-blue-50 transition cursor-pointer"
              >
                Sinkron Sekarang
              </button>
            )}
          </div>
        )}
        {/* ── Header POS ── */}
        <div className="shrink-0 bg-white border-b border-gray-200 px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* Hamburger toggle sidebar — hanya desktop (lg), mobile pakai header AppShell */}
            {/* Hamburger toggle — hanya desktop (lg+), mobile pakai header AppShell */}
            <button
              onClick={toggleSidebar}
              title={sidebarCollapsed ? "Tampilkan sidebar" : "Sembunyikan sidebar"}
              className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition shrink-0 cursor-pointer"
              style={{ color: sidebarCollapsed ? "#2563eb" : "#9ca3af" }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-xl">🛒</span>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm leading-tight">Kasir (POS)</p>
              <p className="text-xs text-gray-400 truncate">{cashierName} · {activeBranchName}</p>
            </div>
          </div>

          {/* Shift indicator + buttons (kasir only) */}
          {!isAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              {activeShift ? (
                <>
                  <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-medium">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block"></span>
                    Shift Buka
                  </span>
                  <button
                    onClick={() => { setShowCloseShift(true); setShiftError(""); setShiftSummary(null); handleLoadShiftSummary(); }}
                    className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-medium transition cursor-pointer"
                  >
                    Tutup Shift
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setShowOpenShift(true); setShiftError(""); }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  Buka Shift
                </button>
              )}
            </div>
          )}

          {/* Admin: pilih cabang */}
          {isAdmin && branches.length > 0 && (
            <select
              value={selectedBranchId}
              onChange={(e) => { setSelectedBranchId(e.target.value); clearCart(); }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}

          {/* Mobile: tab toggle */}
          <div className="flex lg:hidden rounded-lg border border-gray-200 overflow-hidden text-xs font-medium shrink-0">
            <button
              onClick={() => setMobileTab("products")}
              className={`px-3 py-1.5 cursor-pointer transition ${mobileTab === "products" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}
            >
              Produk
            </button>
            <button
              onClick={() => setMobileTab("cart")}
              className={`px-3 py-1.5 cursor-pointer transition relative ${mobileTab === "cart" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}
            >
              Keranjang
              {cartCount > 0 && (
                <span className="ml-1 bg-red-500 text-white rounded-full text-xs w-4 h-4 inline-flex items-center justify-center leading-none">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Body: produk + cart ── */}
        <div className="flex-1 overflow-hidden flex">

          {/* ── Panel Produk ── */}
          <div className={`flex flex-col flex-1 overflow-hidden lg:flex ${mobileTab === "products" ? "flex" : "hidden"}`}>
            {/* Filter */}
            <div className="shrink-0 px-4 py-3 bg-white border-b border-gray-100 space-y-2">
              <input
                type="text"
                placeholder="Cari produk..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setFilterCategory("")}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${!filterCategory ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  Semua
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setFilterCategory(c.id === filterCategory ? "" : c.id)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${filterCategory === c.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Paket Bundling ── */}
            {activeBundles.length > 0 && (
              <div className="shrink-0 px-4 py-3 border-b border-gray-100 bg-orange-50">
                <p className="text-xs font-semibold text-orange-700 mb-2">🔥 Paket Bundling</p>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {activeBundles
                    .filter((b) => !b.branchId || b.branchId === selectedBranchId)
                    .map((bundle) => {
                      const normalTotal = bundle.items.reduce((s, i) => s + (i.product.price * i.quantity), 0);
                      const hemat       = normalTotal - bundle.bundlePrice;
                      return (
                        <button
                          key={bundle.id}
                          onClick={() => addBundleToCart(bundle)}
                          className="shrink-0 text-left bg-white border-2 border-orange-200 hover:border-orange-400 rounded-xl p-3 w-48 transition shadow-sm cursor-pointer"
                        >
                          <p className="text-xs font-bold text-gray-800 line-clamp-1">{bundle.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                            {bundle.items.map((i) => `${i.product.name} ×${i.quantity}`).join(", ")}
                          </p>
                          <div className="mt-2 flex items-center gap-1 flex-wrap">
                            {normalTotal !== bundle.bundlePrice && (
                              <span className="text-xs line-through text-gray-400">{formatRupiah(normalTotal)}</span>
                            )}
                            <span className="text-sm font-bold text-orange-600">{formatRupiah(bundle.bundlePrice)}</span>
                          </div>
                          {hemat > 0 && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">
                              Hemat {formatRupiah(hemat)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Grid produk */}
            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
              {filteredProducts.map((product) => {
                const stock      = getStockForBranch(product);
                const inCart     = cart.find((i) => i.product.id === product.id)?.quantity ?? 0;
                const outOfStock = stock <= 0;
                const expiryInfo = getProductExpiryInfo(product.id);
                const isExpired  = expiryInfo?.blocked;
                const disabled   = outOfStock || isExpired;

                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={disabled}
                    className={`relative text-left p-3 rounded-xl border-2 transition cursor-pointer
                      ${disabled
                        ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                        : inCart > 0
                          ? "border-blue-500 bg-blue-50 shadow-sm"
                          : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm"
                      }`}
                  >
                    {/* Badge qty di keranjang */}
                    {inCart > 0 && (
                      <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
                        {inCart}
                      </span>
                    )}
                    {/* Expiry badge */}
                    {expiryInfo?.label && (
                      <span className={`absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded font-semibold ${expiryInfo.cls}`}>
                        {expiryInfo.label}
                      </span>
                    )}

                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-xs text-gray-400 truncate">{product.category.name}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 mb-2">
                      {product.name}
                    </p>
                    <p className="text-sm font-bold text-blue-600">
                      {expiryInfo?.autoDiscount > 0
                        ? <><span className="line-through text-gray-400 text-xs font-normal">{formatRupiah(product.price)}</span>{" "}{formatRupiah(Math.round(product.price * (1 - expiryInfo.autoDiscount / 100)))}</>
                        : formatRupiah(product.price)
                      }
                    </p>
                    {expiryInfo?.autoDiscount > 0 && (
                      <p className="text-xs text-red-600 font-semibold">Auto-diskon {expiryInfo.autoDiscount}%</p>
                    )}
                    {!expiryInfo?.autoDiscount && (() => {
                      const branchRules = (product.discountRules || []).filter(
                        (r) => r.isActive !== false && r.branchId === selectedBranchId
                      ).sort((a, b) => a.minQty - b.minQty);
                      return branchRules.length > 0 ? (
                        <p className="text-xs text-green-600 font-medium mt-0.5 truncate">
                          {`≥${branchRules[0].minQty} → ${branchRules[0].discountPercent}% off`}
                        </p>
                      ) : null;
                    })()}
                    <p className={`text-xs mt-1 font-medium ${isExpired ? "text-black" : outOfStock ? "text-red-500" : stock <= 20 ? "text-orange-500" : "text-gray-400"}`}>
                      {isExpired ? "Tidak bisa dijual" : outOfStock ? "Stok habis" : `Stok: ${stock}`}
                    </p>
                  </button>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="col-span-full py-16 text-center text-gray-400 text-sm">
                  Tidak ada produk ditemukan
                </div>
              )}
            </div>
          </div>

          {/* ── Panel Cart ── */}
          <div className={`w-full lg:w-80 xl:w-96 shrink-0 flex flex-col bg-white border-l border-gray-200 lg:flex ${mobileTab === "cart" ? "flex" : "hidden"}`}>

            {/* List item keranjang */}
            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 p-6 text-sm">
                  <span className="text-4xl mb-3">🛒</span>
                  <p>Keranjang kosong</p>
                  <p className="text-xs mt-1">Pilih produk untuk mulai transaksi</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cart.map((item) => {
                    const stock = getStockForBranch(item.product);
                    return (
                      <div key={item.product.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {item.discountPct > 0 ? (
                              <>
                                <span className="text-xs text-gray-400 line-through">{formatRupiah(item.product.price)}</span>
                                <span className="text-xs font-semibold text-blue-600">{formatRupiah(item.effectivePrice)}</span>
                                <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-semibold">
                                  Diskon qty {item.discountPct}%
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-blue-600 font-semibold">{formatRupiah(item.product.price)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => updateQty(item.product.id, -1)}
                            className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm flex items-center justify-center cursor-pointer transition leading-none"
                          >−</button>
                          <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => updateQty(item.product.id, +1)}
                            disabled={item.quantity >= stock}
                            className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 font-bold text-sm flex items-center justify-center cursor-pointer transition leading-none"
                          >+</button>
                        </div>
                        <div className="text-right shrink-0 w-20">
                          <p className="text-sm font-semibold text-gray-800">
                            {formatRupiah((item.effectivePrice ?? item.product.price) * item.quantity)}
                          </p>
                          <button
                            onClick={() => removeFromCart(item.product.id)}
                            className="text-xs text-red-400 hover:text-red-600 cursor-pointer transition"
                          >hapus</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Panel Checkout ── */}
            <div className="shrink-0 border-t border-gray-200 p-4 space-y-3 bg-gray-50">

              {/* Ringkasan */}
              <div className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span><span className="text-blue-600">{formatRupiah(grandTotal)}</span>
                </div>
              </div>

              {/* Metode pembayaran */}
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => { setPaymentMethod(m.value); setAmountPaid(""); }}
                    className={`py-2 rounded-lg text-xs font-medium transition cursor-pointer flex flex-col items-center gap-0.5
                      ${paymentMethod === m.value
                        ? "bg-blue-600 text-white"
                        : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300"
                      }`}
                  >
                    <span>{m.icon}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Nominal bayar (tunai saja) */}
              {paymentMethod === "CASH" && (
                <div className="space-y-2">
                  {/* Suggestion buttons */}
                  <div className="grid grid-cols-4 gap-1">
                    {[50000, 100000, 200000, 500000].map((val) => (
                      <button
                        key={val}
                        onClick={() => setAmountPaid(String(val))}
                        className={`py-1.5 rounded-lg text-xs font-medium transition cursor-pointer border
                          ${paid === val
                            ? "bg-blue-600 text-white border-blue-600"
                            : val >= grandTotal
                              ? "bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:text-blue-600"
                              : "bg-white border-gray-200 text-gray-400"
                          }`}
                      >
                        {val === 50000 ? "50rb" : val === 100000 ? "100rb" : val === 200000 ? "200rb" : "500rb"}
                      </button>
                    ))}
                  </div>

                  {/* Input dengan format ribuan */}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amountPaid ? parseInt(amountPaid).toLocaleString("id-ID") : ""}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\./g, "").replace(/[^0-9]/g, "");
                      setAmountPaid(raw);
                    }}
                    placeholder="Jumlah uang diterima"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />

                  {paid >= grandTotal && grandTotal > 0 && (
                    <p className="text-xs text-green-600 font-semibold text-right">
                      Kembalian: {formatRupiah(change)}
                    </p>
                  )}
                  {paid > 0 && paid < grandTotal && (
                    <p className="text-xs text-red-500 text-right">
                      Kurang: {formatRupiah(grandTotal - paid)}
                    </p>
                  )}
                </div>
              )}

              {/* Error */}
              {checkoutError && (
                <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{checkoutError}</p>
              )}

              {/* Tombol checkout */}
              <button
                onClick={handleCheckout}
                disabled={!isPaymentValid || loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition cursor-pointer"
              >
                {loading ? "Memproses..." : `Bayar ${grandTotal > 0 ? formatRupiah(grandTotal) : ""}`}
              </button>

              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="w-full py-2 text-xs text-gray-400 hover:text-red-500 transition cursor-pointer"
                >
                  Kosongkan keranjang
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {receipt && (
        <ReceiptModal
          transaction={receipt}
          onClose={() => setReceipt(null)}
          onNewTransaction={() => {
            setReceipt(null);
            clearCart();
            router.refresh();
            setMobileTab("products");
          }}
        />
      )}

      {/* ── Modal: Buka Shift ── */}
      {!isAdmin && showOpenShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <span className="text-3xl">🔑</span>
              <h2 className="text-lg font-semibold text-gray-900 mt-2">Buka Shift</h2>
              <p className="text-sm text-gray-500 mt-1">Hitung uang di laci dan masukkan jumlahnya</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modal Kas Awal</label>
              <input
                type="text"
                inputMode="numeric"
                value={openingBalance ? parseInt(openingBalance).toLocaleString("id-ID") : ""}
                onChange={(e) => setOpeningBalance(e.target.value.replace(/\./g, "").replace(/[^0-9]/g, ""))}
                placeholder="Contoh: 500.000"
                autoFocus
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Masukkan 0 jika tidak ada modal awal</p>
            </div>
            {shiftError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{shiftError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowOpenShift(false); setShiftError(""); setOpeningBalance(""); }}
                className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleOpenShift}
                disabled={shiftLoading}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
              >
                {shiftLoading ? "Membuka..." : "Mulai Shift"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Tutup Shift ── */}
      {!isAdmin && showCloseShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Tutup Shift</h2>
              {activeShift && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Dibuka: {formatDateTime(activeShift.openedAt)}
                </p>
              )}
            </div>

            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              {/* Ringkasan shift */}
              {shiftSummary && (
                <div className="space-y-3 text-sm">
                  {/* Kas Tunai */}
                  <div className="bg-green-50 rounded-xl border border-green-200 p-4 space-y-2">
                    <p className="font-semibold text-green-700 text-xs uppercase tracking-wide mb-2">Kas Tunai</p>
                    <div className="flex justify-between text-gray-600">
                      <span>Transaksi tunai</span>
                      <span className="font-medium">{shiftSummary.cashTxCount} transaksi</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Total masuk laci</span>
                      <span className="font-medium text-green-700">{formatRupiah(shiftSummary.totalCash)}</span>
                    </div>
                    <div className="border-t border-green-200 pt-2 mt-1 space-y-1">
                      <div className="flex justify-between text-gray-600">
                        <span>Modal awal</span>
                        <span>{formatRupiah(shiftSummary.openingBalance)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-gray-900">
                        <span>Ekspektasi kas akhir</span>
                        <span className="text-blue-600">{formatRupiah(shiftSummary.expectedClosing)}</span>
                      </div>
                    </div>
                  </div>
                  {/* Pembayaran Non-Tunai (info) */}
                  <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 space-y-2">
                    <p className="font-semibold text-purple-700 text-xs uppercase tracking-wide mb-2">
                      Non-Tunai <span className="normal-case font-normal text-purple-500">(info saja)</span>
                    </p>
                    <div className="flex justify-between text-gray-600">
                      <span>Transfer Bank + QRIS</span>
                      <span className="font-medium">{shiftSummary.nonCashTxCount} transaksi</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Total non-tunai</span>
                      <span className="font-medium text-purple-700">{formatRupiah(shiftSummary.totalNonCash)}</span>
                    </div>
                    <p className="text-xs text-purple-400 italic">Tidak masuk laci kas, tidak mempengaruhi selisih</p>
                  </div>
                  {/* Grand Total */}
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 flex justify-between items-center">
                    <p className="text-xs text-gray-500">Grand Total ({shiftSummary.totalTx} transaksi)</p>
                    <span className="font-bold text-gray-900">{formatRupiah(shiftSummary.totalRevenue)}</span>
                  </div>
                </div>
              )}
              {shiftLoading && !shiftSummary && (
                <div className="text-center text-sm text-gray-400 py-4">Memuat ringkasan...</div>
              )}

              {/* Input kas akhir */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kas Akhir (Hitung Fisik) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={closingBalance ? parseInt(closingBalance).toLocaleString("id-ID") : ""}
                  onChange={(e) => setClosingBalance(e.target.value.replace(/\./g, "").replace(/[^0-9]/g, ""))}
                  placeholder="Jumlah uang di laci kasir"
                  autoFocus
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {/* Selisih */}
                {shiftSummary && closingBalance !== "" && !isNaN(parseInt(closingBalance)) && (() => {
                  const diff = parseInt(closingBalance) - shiftSummary.expectedClosing;
                  return (
                    <div className={`mt-1.5 text-xs font-medium text-right ${
                      diff === 0 ? "text-green-600" : diff > 0 ? "text-yellow-600" : "text-red-600"
                    }`}>
                      Selisih: {diff > 0 ? "+" : ""}{formatRupiah(diff)}
                      {diff === 0 && " ✓ Sesuai"}
                      {diff > 0 && " (lebih)"}
                      {diff < 0 && " (kurang)"}
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan (opsional)</label>
                <textarea
                  value={closingNote}
                  onChange={(e) => setClosingNote(e.target.value)}
                  placeholder="Kendala atau catatan shift..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {shiftError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{shiftError}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => { setShowCloseShift(false); setShiftError(""); setClosingBalance(""); setClosingNote(""); setShiftSummary(null); }}
                className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleCloseShift}
                disabled={shiftLoading || closingBalance === ""}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition cursor-pointer"
              >
                {shiftLoading ? "Menutup..." : "Tutup Shift"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Overlay: Kasir belum buka shift ── */}
      {!isAdmin && !activeShift && !showOpenShift && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center space-y-4">
            <span className="text-5xl">🔒</span>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Shift Belum Dibuka</h2>
              <p className="text-sm text-gray-500 mt-2">
                Buka shift terlebih dahulu untuk mulai menerima transaksi.
              </p>
            </div>
            <button
              onClick={() => { setShowOpenShift(true); setShiftError(""); }}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition cursor-pointer"
            >
              Buka Shift Sekarang
            </button>
          </div>
        </div>
      )}
    </>
  );
}
