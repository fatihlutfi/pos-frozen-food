"use client";

import { useState, useEffect, useCallback } from "react";
import { formatRupiah } from "@/lib/format";

const TABS = [
  { key: "diskon",   label: "🏷️ Diskon Qty"     },
  { key: "bundling", label: "📦 Bundling"         },
  { key: "expiry",   label: "⏰ Promo Expiry"     },
];

const EMPTY_DISC_FORM = { productId: "", branchId: "", minQty: "", discountPercent: "" };
const EMPTY_BUNDLE_FORM = {
  name: "", bundlePrice: "", branchId: "", startDate: "", endDate: "", isActive: true,
  items: [{ productId: "", quantity: "1" }],
};
const EMPTY_EXPIRY_FORM = {
  criticalDays: 7, warningDays: 30, criticalDiscount: 25, warningDiscount: 15, isActive: true,
};

export default function PromoManager({ products, branches }) {
  const [tab, setTab] = useState("diskon");

  // ─── Diskon Qty ───────────────────────────────────────────
  const [discRules,   setDiscRules]   = useState([]);
  const [discLoading, setDiscLoading] = useState(false);
  const [discError,   setDiscError]   = useState("");
  const [discForm,    setDiscForm]    = useState(EMPTY_DISC_FORM);
  const [discSaving,  setDiscSaving]  = useState(false);

  // ─── Bundling ─────────────────────────────────────────────
  const [bundles,        setBundles]        = useState([]);
  const [bundleLoading,  setBundleLoading]  = useState(false);
  const [bundleError,    setBundleError]    = useState("");
  const [showBundleForm, setShowBundleForm] = useState(false);
  const [editingBundle,  setEditingBundle]  = useState(null);
  const [bundleForm,     setBundleForm]     = useState(EMPTY_BUNDLE_FORM);
  const [bundleSaving,   setBundleSaving]   = useState(false);

  // ─── Promo Expiry ─────────────────────────────────────────
  const [expirySettings, setExpirySettings] = useState(null);
  const [expiryBatches,  setExpiryBatches]  = useState([]);
  const [expiryLoading,  setExpiryLoading]  = useState(false);
  const [expiryForm,     setExpiryForm]     = useState(EMPTY_EXPIRY_FORM);
  const [expirySaving,   setExpirySaving]   = useState(false);
  const [expiryError,    setExpiryError]    = useState("");

  // ─── Load on tab switch ───────────────────────────────────
  useEffect(() => {
    if (tab === "diskon")   loadDiscountRules();
    if (tab === "bundling") loadBundles();
    if (tab === "expiry")   loadExpiryData();
  }, [tab]); // eslint-disable-line

  // ══════════════════════════════════════════════════════════
  //  DISKON QTY
  // ══════════════════════════════════════════════════════════

  async function loadDiscountRules() {
    setDiscLoading(true);
    setDiscError("");
    try {
      const res  = await fetch("/api/discounts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDiscRules(data);
    } catch (e) {
      setDiscError(e.message || "Gagal memuat aturan diskon");
    } finally {
      setDiscLoading(false);
    }
  }

  async function handleAddDiscount(e) {
    e.preventDefault();
    if (!discForm.productId || !discForm.branchId || !discForm.minQty || !discForm.discountPercent) {
      setDiscError("Isi semua field"); return;
    }
    setDiscSaving(true);
    setDiscError("");
    try {
      const res = await fetch(`/api/products/${discForm.productId}/discount-rules`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          branchId:        discForm.branchId,
          minQty:          parseInt(discForm.minQty),
          discountPercent: parseFloat(discForm.discountPercent),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setDiscError(data.error || "Gagal menyimpan"); return; }
      setDiscForm(EMPTY_DISC_FORM);
      await loadDiscountRules();
    } catch {
      setDiscError("Terjadi kesalahan");
    } finally {
      setDiscSaving(false);
    }
  }

  async function handleDeleteDiscount(productId, ruleId) {
    if (!confirm("Hapus aturan diskon ini?")) return;
    try {
      await fetch(`/api/products/${productId}/discount-rules?ruleId=${ruleId}`, { method: "DELETE" });
      setDiscRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch {
      alert("Gagal menghapus");
    }
  }

  // ══════════════════════════════════════════════════════════
  //  BUNDLING
  // ══════════════════════════════════════════════════════════

  async function loadBundles() {
    setBundleLoading(true);
    setBundleError("");
    try {
      const res  = await fetch("/api/bundles");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBundles(data);
    } catch (e) {
      setBundleError(e.message || "Gagal memuat bundling");
    } finally {
      setBundleLoading(false);
    }
  }

  function openNewBundle() {
    setEditingBundle(null);
    setBundleForm(EMPTY_BUNDLE_FORM);
    setBundleError("");
    setShowBundleForm(true);
  }

  function openEditBundle(bundle) {
    setEditingBundle(bundle);
    setBundleForm({
      name:        bundle.name,
      bundlePrice: String(bundle.bundlePrice),
      branchId:    bundle.branchId ?? "",
      startDate:   bundle.startDate ? bundle.startDate.slice(0, 10) : "",
      endDate:     bundle.endDate   ? bundle.endDate.slice(0, 10)   : "",
      isActive:    bundle.isActive,
      items:       bundle.items.map((i) => ({ productId: i.productId, quantity: String(i.quantity) })),
    });
    setBundleError("");
    setShowBundleForm(true);
  }

  function addBundleItem() {
    setBundleForm((prev) => ({ ...prev, items: [...prev.items, { productId: "", quantity: "1" }] }));
  }

  function removeBundleItem(idx) {
    setBundleForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  }

  function updateBundleItem(idx, field, value) {
    setBundleForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }));
  }

  function calcNormalPrice() {
    return bundleForm.items.reduce((sum, item) => {
      const p = products.find((p) => p.id === item.productId);
      return sum + (p ? p.price * (parseInt(item.quantity) || 1) : 0);
    }, 0);
  }

  async function handleSaveBundle(e) {
    e.preventDefault();
    setBundleError("");

    const validItems = bundleForm.items.filter((i) => i.productId);
    if (validItems.length < 2) { setBundleError("Pilih minimal 2 produk"); return; }

    const uniqueProducts = new Set(validItems.map((i) => i.productId));
    if (uniqueProducts.size !== validItems.length) { setBundleError("Produk tidak boleh duplikat"); return; }

    setBundleSaving(true);
    try {
      const payload = {
        name:        bundleForm.name,
        bundlePrice: parseInt(bundleForm.bundlePrice),
        branchId:    bundleForm.branchId || null,
        startDate:   bundleForm.startDate || null,
        endDate:     bundleForm.endDate   || null,
        isActive:    bundleForm.isActive,
        items:       validItems,
      };

      const url    = editingBundle ? `/api/bundles/${editingBundle.id}` : "/api/bundles";
      const method = editingBundle ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setBundleError(data.error || "Gagal menyimpan"); return; }

      setShowBundleForm(false);
      await loadBundles();
    } catch {
      setBundleError("Terjadi kesalahan");
    } finally {
      setBundleSaving(false);
    }
  }

  async function handleDeleteBundle(id) {
    if (!confirm("Hapus bundling ini?")) return;
    try {
      const res = await fetch(`/api/bundles/${id}`, { method: "DELETE" });
      if (res.ok) setBundles((prev) => prev.filter((b) => b.id !== id));
      else alert("Gagal menghapus bundling");
    } catch {
      alert("Terjadi kesalahan");
    }
  }

  async function toggleBundleActive(bundle) {
    try {
      await fetch(`/api/bundles/${bundle.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...bundle, isActive: !bundle.isActive, items: bundle.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) }),
      });
      setBundles((prev) => prev.map((b) => b.id === bundle.id ? { ...b, isActive: !b.isActive } : b));
    } catch {
      alert("Gagal mengubah status");
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PROMO EXPIRY
  // ══════════════════════════════════════════════════════════

  async function loadExpiryData() {
    setExpiryLoading(true);
    setExpiryError("");
    try {
      const [settingsRes, batchesRes] = await Promise.all([
        fetch("/api/promo-settings"),
        fetch("/api/batches/expiry-alert?days=90"),
      ]);
      const settings = await settingsRes.json();
      const batchData = await batchesRes.json();
      if (!settingsRes.ok) throw new Error(settings.error);
      setExpirySettings(settings);
      setExpiryForm({
        criticalDays:     settings.criticalDays,
        warningDays:      settings.warningDays,
        criticalDiscount: settings.criticalDiscount,
        warningDiscount:  settings.warningDiscount,
        isActive:         settings.isActive,
      });
      setExpiryBatches(batchData.batches || []);
    } catch (e) {
      setExpiryError(e.message || "Gagal memuat data expiry");
    } finally {
      setExpiryLoading(false);
    }
  }

  async function handleSaveExpirySettings(e) {
    e.preventDefault();
    setExpirySaving(true);
    setExpiryError("");
    try {
      const res  = await fetch("/api/promo-settings", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(expiryForm),
      });
      const data = await res.json();
      if (!res.ok) { setExpiryError(data.error || "Gagal menyimpan"); return; }
      setExpirySettings(data);
      alert("Pengaturan disimpan!");
    } catch {
      setExpiryError("Terjadi kesalahan");
    } finally {
      setExpirySaving(false);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Diskon Qty ───────────────────────────────── */}
      {tab === "diskon" && (
        <div className="space-y-4">
          {/* Form tambah */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Tambah Aturan Diskon Qty</h2>
            <form onSubmit={handleAddDiscount} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <select
                value={discForm.productId}
                onChange={(e) => setDiscForm({ ...discForm, productId: e.target.value })}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Pilih Produk</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {formatRupiah(p.price)}</option>
                ))}
              </select>
              <select
                value={discForm.branchId}
                onChange={(e) => setDiscForm({ ...discForm, branchId: e.target.value })}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Pilih Cabang</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <input
                type="number" min="1"
                placeholder="Min. Qty"
                value={discForm.minQty}
                onChange={(e) => setDiscForm({ ...discForm, minQty: e.target.value })}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number" min="0.1" max="99" step="0.1"
                placeholder="Diskon %"
                value={discForm.discountPercent}
                onChange={(e) => setDiscForm({ ...discForm, discountPercent: e.target.value })}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={discSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                {discSaving ? "Menyimpan…" : "+ Tambah"}
              </button>
            </form>
            {discError && <p className="mt-2 text-sm text-red-600">{discError}</p>}
          </div>

          {/* List */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Aturan Diskon Aktif</h2>
              <span className="text-xs text-gray-400">{discRules.length} aturan</span>
            </div>
            {discLoading ? (
              <div className="py-12 text-center text-gray-400 text-sm">Memuat…</div>
            ) : discRules.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">Belum ada aturan diskon qty</div>
            ) : (
              <table className="w-full text-sm min-w-[540px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Produk</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Cabang</th>
                    <th className="text-center px-5 py-3 font-medium text-gray-600">Min. Qty</th>
                    <th className="text-center px-5 py-3 font-medium text-gray-600">Diskon</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {discRules.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-800">{r.product.name}</p>
                        <p className="text-xs text-gray-400">{formatRupiah(r.product.price)}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{r.branch.name}</td>
                      <td className="px-5 py-3 text-center">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                          ≥ {r.minQty} pcs
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-semibold">
                          {r.discountPercent}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleDeleteDiscount(r.productId, r.id)}
                          className="px-3 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition cursor-pointer"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Bundling ─────────────────────────────────── */}
      {tab === "bundling" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={openNewBundle}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer"
            >
              + Buat Bundling Baru
            </button>
          </div>

          {/* Bundle Form */}
          {showBundleForm && (
            <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 space-y-4">
              <h2 className="font-semibold text-gray-800">
                {editingBundle ? "Edit Bundling" : "Buat Bundling Baru"}
              </h2>
              <form onSubmit={handleSaveBundle} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nama Paket *</label>
                    <input
                      type="text"
                      placeholder="contoh: Paket Hemat A"
                      value={bundleForm.name}
                      onChange={(e) => setBundleForm({ ...bundleForm, name: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Cabang (opsional)</label>
                    <select
                      value={bundleForm.branchId}
                      onChange={(e) => setBundleForm({ ...bundleForm, branchId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Semua Cabang</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal Mulai</label>
                    <input
                      type="date"
                      value={bundleForm.startDate}
                      onChange={(e) => setBundleForm({ ...bundleForm, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal Berakhir</label>
                    <input
                      type="date"
                      value={bundleForm.endDate}
                      onChange={(e) => setBundleForm({ ...bundleForm, endDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Bundle Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-700">Produk dalam Paket *</label>
                    <button
                      type="button"
                      onClick={addBundleItem}
                      className="text-xs text-blue-600 hover:underline cursor-pointer"
                    >
                      + Tambah produk
                    </button>
                  </div>
                  <div className="space-y-2">
                    {bundleForm.items.map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <select
                          value={item.productId}
                          onChange={(e) => updateBundleItem(idx, "productId", e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="">Pilih Produk</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} — {formatRupiah(p.price)}</option>
                          ))}
                        </select>
                        <input
                          type="number" min="1"
                          value={item.quantity}
                          onChange={(e) => updateBundleItem(idx, "quantity", e.target.value)}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                        />
                        <span className="text-xs text-gray-400 whitespace-nowrap">pcs</span>
                        {bundleForm.items.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeBundleItem(idx)}
                            className="text-red-400 hover:text-red-600 text-lg cursor-pointer"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Price Summary */}
                {(() => {
                  const normalPrice = calcNormalPrice();
                  const bundlePrice = parseInt(bundleForm.bundlePrice) || 0;
                  const hemat       = normalPrice - bundlePrice;
                  return (
                    <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                      <div className="flex justify-between text-gray-600">
                        <span>Harga Normal (auto)</span>
                        <span className={normalPrice > 0 ? "line-through text-gray-400" : ""}>{formatRupiah(normalPrice)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700 font-medium">Harga Bundling *</span>
                        <input
                          type="number" min="1"
                          placeholder="0"
                          value={bundleForm.bundlePrice}
                          onChange={(e) => setBundleForm({ ...bundleForm, bundlePrice: e.target.value })}
                          required
                          className="w-36 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      {hemat > 0 && (
                        <div className="flex justify-between text-green-600 font-medium">
                          <span>Hemat</span>
                          <span>{formatRupiah(hemat)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Active toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bundleForm.isActive}
                    onChange={(e) => setBundleForm({ ...bundleForm, isActive: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-gray-700">Aktifkan bundling ini</span>
                </label>

                {bundleError && <p className="text-sm text-red-600">{bundleError}</p>}

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowBundleForm(false)}
                    className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={bundleSaving}
                    className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg cursor-pointer"
                  >
                    {bundleSaving ? "Menyimpan…" : editingBundle ? "Simpan Perubahan" : "Buat Bundling"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Bundle List */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Daftar Bundling</h2>
              <span className="text-xs text-gray-400">{bundles.length} bundling</span>
            </div>
            {bundleLoading ? (
              <div className="py-12 text-center text-gray-400 text-sm">Memuat…</div>
            ) : bundles.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">Belum ada bundling</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {bundles.map((bundle) => {
                  const normalPrice = bundle.items.reduce((s, i) => s + (i.product.price * i.quantity), 0);
                  const hemat       = normalPrice - bundle.bundlePrice;
                  const now         = new Date();
                  const isExpired   = bundle.endDate && new Date(bundle.endDate) < now;
                  const isUpcoming  = bundle.startDate && new Date(bundle.startDate) > now;
                  return (
                    <div key={bundle.id} className="p-5 hover:bg-gray-50 transition">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-800">{bundle.name}</p>
                            {bundle.isActive && !isExpired && !isUpcoming ? (
                              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Aktif</span>
                            ) : isExpired ? (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Expired</span>
                            ) : isUpcoming ? (
                              <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">Belum Mulai</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Nonaktif</span>
                            )}
                            {bundle.branch && (
                              <span className="text-xs text-gray-400">📍 {bundle.branch.name}</span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {bundle.items.map((item) => (
                              <span key={item.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                {item.product.name} ×{item.quantity}
                              </span>
                            ))}
                          </div>
                          <div className="mt-2 flex items-center gap-4 text-sm">
                            <span className="line-through text-gray-400">{formatRupiah(normalPrice)}</span>
                            <span className="font-bold text-green-700">{formatRupiah(bundle.bundlePrice)}</span>
                            {hemat > 0 && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                                Hemat {formatRupiah(hemat)}
                              </span>
                            )}
                          </div>
                          {(bundle.startDate || bundle.endDate) && (
                            <p className="text-xs text-gray-400 mt-1">
                              {bundle.startDate ? new Date(bundle.startDate).toLocaleDateString("id-ID") : "—"}
                              {" → "}
                              {bundle.endDate ? new Date(bundle.endDate).toLocaleDateString("id-ID") : "∞"}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => toggleBundleActive(bundle)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer ${
                              bundle.isActive
                                ? "text-orange-600 bg-orange-50 hover:bg-orange-100"
                                : "text-green-600 bg-green-50 hover:bg-green-100"
                            }`}
                          >
                            {bundle.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                          <button
                            onClick={() => openEditBundle(bundle)}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteBundle(bundle.id)}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition cursor-pointer"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Promo Expiry ─────────────────────────────── */}
      {tab === "expiry" && (
        <div className="space-y-4">
          {expiryLoading ? (
            <div className="py-12 text-center text-gray-400 text-sm">Memuat…</div>
          ) : (
            <>
              {/* Settings Card */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h2 className="font-semibold text-gray-800 mb-4">Pengaturan Threshold Diskon Expiry</h2>
                <form onSubmit={handleSaveExpirySettings} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-red-50 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-semibold text-red-700">🔴 Kritis (Deal Today)</p>
                      <div>
                        <label className="text-xs text-gray-600">Expired dalam … hari</label>
                        <input
                          type="number" min="1" max="90"
                          value={expiryForm.criticalDays}
                          onChange={(e) => setExpiryForm({ ...expiryForm, criticalDays: parseInt(e.target.value) })}
                          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Diskon otomatis (%)</label>
                        <input
                          type="number" min="0" max="100" step="0.5"
                          value={expiryForm.criticalDiscount}
                          onChange={(e) => setExpiryForm({ ...expiryForm, criticalDiscount: parseFloat(e.target.value) })}
                          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-semibold text-orange-700">🟠 Warning (Segera Habis)</p>
                      <div>
                        <label className="text-xs text-gray-600">Expired dalam … hari</label>
                        <input
                          type="number" min="1" max="365"
                          value={expiryForm.warningDays}
                          onChange={(e) => setExpiryForm({ ...expiryForm, warningDays: parseInt(e.target.value) })}
                          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Diskon otomatis (%)</label>
                        <input
                          type="number" min="0" max="100" step="0.5"
                          value={expiryForm.warningDiscount}
                          onChange={(e) => setExpiryForm({ ...expiryForm, warningDiscount: parseFloat(e.target.value) })}
                          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={expiryForm.isActive}
                      onChange={(e) => setExpiryForm({ ...expiryForm, isActive: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-700">Aktifkan diskon expiry otomatis di kasir</span>
                  </label>
                  {expiryError && <p className="text-sm text-red-600">{expiryError}</p>}
                  <button
                    type="submit"
                    disabled={expirySaving}
                    className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                  >
                    {expirySaving ? "Menyimpan…" : "Simpan Pengaturan"}
                  </button>
                </form>
              </div>

              {/* Batch Expiry List */}
              <div className="bg-white rounded-xl border border-orange-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-orange-100 bg-orange-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⏰</span>
                    <h2 className="font-semibold text-orange-800">Produk Mendekati Expired</h2>
                    <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-semibold">
                      {expiryBatches.length} batch
                    </span>
                  </div>
                  <span className="text-xs text-orange-600">dalam 90 hari ke depan</span>
                </div>
                {expiryBatches.length === 0 ? (
                  <div className="py-10 text-center text-sm text-green-600">✓ Tidak ada produk hampir expired</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {expiryBatches.map((b) => {
                      const diffDays  = Math.ceil((new Date(b.expiryDate) - new Date()) / 86400000);
                      const isCrit    = diffDays >= 0 && diffDays < (expirySettings?.criticalDays ?? 7);
                      const isWarn    = diffDays >= (expirySettings?.criticalDays ?? 7) && diffDays < (expirySettings?.warningDays ?? 30);
                      const clsBadge  = diffDays < 0  ? "bg-black text-white"
                                      : isCrit        ? "bg-red-600 text-white"
                                      : isWarn        ? "bg-orange-500 text-white"
                                      : "bg-yellow-400 text-gray-900";
                      const labelBadge = diffDays < 0  ? "Expired"
                                       : isCrit        ? `Deal Today (-${expirySettings?.criticalDiscount ?? 25}%)`
                                       : isWarn        ? `Segera Habis (-${expirySettings?.warningDiscount ?? 15}%)`
                                       : "Segera Promo";
                      return (
                        <div key={b.id} className="flex items-center justify-between px-5 py-3 gap-3 hover:bg-gray-50">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{b.product.name}</p>
                            <p className="text-xs text-gray-400">{b.branch.name} · Batch: {b.batchCode}</p>
                          </div>
                          <div className="text-right shrink-0 space-y-0.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${clsBadge}`}>
                              {labelBadge}
                            </span>
                            <p className="text-xs text-gray-400">
                              {diffDays < 0 ? "Sudah lewat" : `${diffDays} hari`} · Sisa {b.quantity}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
