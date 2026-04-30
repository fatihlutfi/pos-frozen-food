"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { formatRupiah } from "@/lib/format";

const EMPTY_FORM = { name: "", description: "", price: "", costPrice: "", categoryId: "" };

export default function ProductManager({
  initialProducts, categories, branches, isAdmin, currentBranchId,
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [modal, setModal] = useState({ open: false, mode: "add", product: null });
  const [stockModal, setStockModal] = useState({ open: false, product: null });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [stockForm, setStockForm] = useState({ branchId: "", quantity: "", note: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Batch modal
  const [batchModal,   setBatchModal]   = useState({ open: false, product: null });
  const [batches,      setBatches]      = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError,   setBatchError]   = useState("");
  const [batchForm,    setBatchForm]    = useState({ branchId: "", batchCode: "", productionDate: "", expiryDate: "", quantity: "" });

  // Discount rules modal
  const [discountModal, setDiscountModal]   = useState({ open: false, product: null });
  const [discountRules, setDiscountRules]   = useState([]);
  const [discLoading,   setDiscLoading]     = useState(false);
  const [discError,     setDiscError]       = useState("");
  const [discForm,      setDiscForm]        = useState({ minQty: "", discountPercent: "", branchId: "" });

  // Dropdown Kelola
  const [openDropdown, setOpenDropdown] = useState(null); // product.id or null

  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest("[data-dropdown-kelola]")) {
        setOpenDropdown(null);
      }
    }
    if (openDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown]);

  // Filter produk di client
  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat  = filterCategory ? p.categoryId === filterCategory : true;
      return matchSearch && matchCat;
    });
  }, [products, search, filterCategory]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setError("");
    setModal({ open: true, mode: "add", product: null });
  }

  function openEdit(product) {
    setForm({
      name:        product.name,
      description: product.description || "",
      price:       product.price,
      costPrice:   product.costPrice ?? 0,
      categoryId:  product.categoryId,
    });
    setError("");
    setModal({ open: true, mode: "edit", product });
  }

  function openStock(product) {
    setStockForm({
      branchId: branches[0]?.id || "",
      quantity: "",
      note: "",
    });
    setError("");
    setStockModal({ open: true, product });
  }

  function closeModal() {
    setModal({ open: false, mode: "add", product: null });
    setError("");
  }

  function closeStockModal() {
    setStockModal({ open: false, product: null });
    setError("");
  }

  async function openDiscountModal(product) {
    setDiscountModal({ open: true, product });
    setDiscError("");
    setDiscForm({ minQty: "", discountPercent: "", branchId: branches[0]?.id || "" });
    setDiscLoading(true);
    try {
      const res  = await fetch(`/api/products/${product.id}/discount-rules`);
      const data = await res.json();
      if (res.ok) setDiscountRules(data);
      setProducts((prev) => prev.map((p) =>
        p.id === product.id ? { ...p, discountRules: res.ok ? data : p.discountRules } : p
      ));
    } finally {
      setDiscLoading(false);
    }
  }

  // Batch helpers
  function getExpiryStatus(expiryDate) {
    const now = new Date();
    const diffDays = Math.ceil((new Date(expiryDate) - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0)  return { status: "expired",  label: "Expired",      color: "bg-black text-white",         autoDiscount: 0  };
    if (diffDays < 7)  return { status: "critical",  label: "Deal Today",   color: "bg-red-600 text-white",       autoDiscount: 25 };
    if (diffDays < 30) return { status: "warning",   label: "Segera Habis", color: "bg-orange-500 text-white",    autoDiscount: 15 };
    if (diffDays < 90) return { status: "soon",      label: "Segera Promo", color: "bg-yellow-400 text-gray-900", autoDiscount: 0  };
    return               { status: "good",      label: "Aman",         color: "bg-green-500 text-white",     autoDiscount: 0  };
  }

  async function openBatchModal(product) {
    setBatchModal({ open: true, product });
    setBatchError("");
    setBatchForm({ branchId: branches[0]?.id || "", batchCode: "", productionDate: "", expiryDate: "", quantity: "" });
    setBatchLoading(true);
    try {
      const res = await fetch(`/api/batches?productId=${product.id}&includeExpired=true`);
      if (res.ok) setBatches(await res.json());
    } finally {
      setBatchLoading(false);
    }
  }

  function closeBatchModal() {
    setBatchModal({ open: false, product: null });
    setBatches([]);
    setBatchError("");
  }

  async function handleAddBatch(e) {
    e.preventDefault();
    if (!batchForm.batchCode || !batchForm.expiryDate || !batchForm.quantity || !batchForm.branchId) {
      setBatchError("Isi semua field yang wajib"); return;
    }
    setBatchLoading(true);
    setBatchError("");
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId:      batchModal.product.id,
          branchId:       batchForm.branchId,
          batchCode:      batchForm.batchCode,
          productionDate: batchForm.productionDate || null,
          expiryDate:     batchForm.expiryDate,
          quantity:       parseInt(batchForm.quantity),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setBatchError(data.error || "Gagal menyimpan"); return; }
      // Refresh list
      const refreshRes = await fetch(`/api/batches?productId=${batchModal.product.id}&includeExpired=true`);
      if (refreshRes.ok) setBatches(await refreshRes.json());
      // Update stok di state lokal
      setProducts((prev) => prev.map((p) => {
        if (p.id !== batchModal.product.id) return p;
        return {
          ...p,
          stocks: p.stocks.map((s) =>
            s.branchId === batchForm.branchId
              ? { ...s, quantity: s.quantity + parseInt(batchForm.quantity) }
              : s
          ),
        };
      }));
      setBatchForm((f) => ({ ...f, batchCode: "", productionDate: "", expiryDate: "", quantity: "" }));
    } finally {
      setBatchLoading(false);
    }
  }

  function closeDiscountModal() {
    setDiscountModal({ open: false, product: null });
    setDiscError("");
    setDiscountRules([]);
    setDiscForm({ minQty: "", discountPercent: "", branchId: "" });
  }

  async function handleAddDiscountRule(e) {
    e.preventDefault();
    if (!discForm.minQty || !discForm.discountPercent || !discForm.branchId) {
      setDiscError("Isi semua field termasuk cabang"); return;
    }
    setDiscLoading(true);
    setDiscError("");
    try {
      const res  = await fetch(`/api/products/${discountModal.product.id}/discount-rules`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          minQty:          parseInt(discForm.minQty),
          discountPercent: parseFloat(discForm.discountPercent),
          branchId:        discForm.branchId,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setDiscError(data.error || "Gagal menyimpan"); return; }
      // Refresh full list so branch info is included
      const refreshRes = await fetch(`/api/products/${discountModal.product.id}/discount-rules`);
      const refreshed  = refreshRes.ok ? await refreshRes.json() : null;
      if (refreshed) {
        setDiscountRules(refreshed);
        setProducts((prev) => prev.map((p) =>
          p.id === discountModal.product.id ? { ...p, discountRules: refreshed } : p
        ));
      }
      setDiscForm({ minQty: "", discountPercent: "", branchId: discForm.branchId });
    } finally {
      setDiscLoading(false);
    }
  }

  async function handleDeleteDiscountRule(ruleId) {
    setDiscLoading(true);
    try {
      const res = await fetch(
        `/api/products/${discountModal.product.id}/discount-rules?ruleId=${ruleId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setDiscountRules((prev) => prev.filter((r) => r.id !== ruleId));
        setProducts((prev) => prev.map((p) =>
          p.id === discountModal.product.id
            ? { ...p, discountRules: (p.discountRules || []).filter(r => r.id !== ruleId) }
            : p
        ));
      }
    } finally {
      setDiscLoading(false);
    }
  }

  async function handleProductSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const isEdit = modal.mode === "edit";
    const url = isEdit ? `/api/products/${modal.product.id}` : "/api/products";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        price:     parseInt(form.price),
        costPrice: parseInt(form.costPrice) || 0,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error || "Terjadi kesalahan"); return; }

    if (isEdit) {
      setProducts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    } else {
      setProducts((prev) => [...prev, data]);
    }
    closeModal();
    router.refresh();
  }

  async function handleStockSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/stocks/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: stockModal.product.id,
        branchId: stockForm.branchId,
        newQuantity: parseInt(stockForm.quantity),
        note: stockForm.note,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error || "Terjadi kesalahan"); return; }

    // Update stok di state lokal
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== stockModal.product.id) return p;
        return {
          ...p,
          stocks: p.stocks.map((s) =>
            s.branchId === stockForm.branchId ? { ...s, quantity: parseInt(stockForm.quantity) } : s
          ),
        };
      })
    );

    closeStockModal();
    router.refresh();
  }

  async function handleDelete(product) {
    setLoading(true);
    const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    setLoading(false);
    setDeleteConfirm(null);

    if (!res.ok) { alert("Gagal menonaktifkan produk"); return; }

    setProducts((prev) => prev.filter((p) => p.id !== product.id));
    router.refresh();
  }

  const LOW_STOCK_THRESHOLD = 20;

  function getStock(product) {
    if (!isAdmin) {
      const s = product.stocks.find((s) => s.branchId === currentBranchId);
      return s ? s.quantity : 0;
    }
    return product.stocks.reduce((sum, s) => sum + s.quantity, 0);
  }

  function getStockColor(qty) {
    if (qty === 0) return "text-red-600";
    if (qty <= LOW_STOCK_THRESHOLD) return "text-orange-500";
    return "text-gray-800";
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Cari produk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Semua Kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition cursor-pointer whitespace-nowrap"
          >
            <span>+</span> Tambah Produk
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-3">{filtered.length} produk ditemukan</p>

      {/* Tabel Produk */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Tidak ada produk ditemukan</div>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Produk</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Kategori</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Harga Jual</th>
                {isAdmin && <th className="text-right px-5 py-3 font-medium text-gray-600">HPP</th>}
                {isAdmin && <th className="text-right px-5 py-3 font-medium text-gray-600">Margin</th>}
                <th className="text-center px-5 py-3 font-medium text-gray-600">
                  {isAdmin ? "Total Stok" : "Stok"}
                </th>
                {isAdmin && (
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((product) => {
                const stock = getStock(product);

                return (
                  <tr key={product.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900">{product.name}</p>
                      {product.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{product.description}</p>
                      )}
                      {/* Diskon qty badges grouped by branch */}
                      {(product.discountRules || []).length > 0 && (() => {
                        const grouped = {};
                        for (const r of product.discountRules) {
                          const bName = r.branch?.name ?? r.branchId ?? "—";
                          if (!grouped[bName]) grouped[bName] = [];
                          grouped[bName].push(r);
                        }
                        return (
                          <div className="mt-1 space-y-0.5">
                            {Object.entries(grouped).map(([bName, rules]) => (
                              <div key={bName} className="flex flex-wrap items-center gap-1">
                                <span className="text-xs text-gray-400 font-medium">{bName}:</span>
                                {rules.map((r) => (
                                  <span key={r.id} className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs rounded font-medium">
                                    ≥{r.minQty} → {r.discountPercent}%
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {product.category.name}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-gray-900">
                      {formatRupiah(product.price)}
                    </td>
                    {isAdmin && (() => {
                      const hpp    = product.costPrice ?? 0;
                      const margin = product.price - hpp;
                      const mPct   = product.price > 0 ? Math.round((margin / product.price) * 100) : 0;
                      return (
                        <>
                          <td className="px-5 py-3.5 text-right text-gray-600 text-sm">
                            {hpp > 0 ? formatRupiah(hpp) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-5 py-3.5 text-right text-sm">
                            {hpp > 0 ? (
                              <div>
                                <span className={`font-semibold ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {formatRupiah(margin)}
                                </span>
                                <span className={`ml-1.5 text-xs ${margin >= 0 ? "text-green-500" : "text-red-500"}`}>
                                  ({mPct}%)
                                </span>
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </>
                      );
                    })()}
                    <td className="px-5 py-3.5 text-center">
                      <span className={`font-semibold text-sm ${getStockColor(stock)}`}>
                        {stock}
                      </span>
                      {stock > 0 && stock <= LOW_STOCK_THRESHOLD && (
                        <span className="ml-1.5 text-xs text-orange-500">⚠</span>
                      )}
                      {stock === 0 && (
                        <span className="ml-1.5 text-xs text-red-500">Habis</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Dropdown Kelola */}
                          <div className="relative" data-dropdown-kelola>
                            <button
                              onClick={() => setOpenDropdown(openDropdown === product.id ? null : product.id)}
                              className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition cursor-pointer flex items-center gap-1"
                            >
                              ⚙️ Kelola
                              <svg className={`w-3 h-3 transition-transform ${openDropdown === product.id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {openDropdown === product.id && (
                              <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
                                <button
                                  onClick={() => { openBatchModal(product); setOpenDropdown(null); }}
                                  className="w-full text-left px-4 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 transition cursor-pointer"
                                >
                                  📦 Kelola Batch
                                </button>
                                <button
                                  onClick={() => { openStock(product); setOpenDropdown(null); }}
                                  className="w-full text-left px-4 py-2 text-xs font-medium text-green-700 hover:bg-green-50 transition cursor-pointer"
                                >
                                  📊 Update Stok
                                </button>
                                <button
                                  onClick={() => { openDiscountModal(product); setOpenDropdown(null); }}
                                  className="w-full text-left px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 transition cursor-pointer"
                                >
                                  🏷️ Atur Diskon Qty
                                </button>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => openEdit(product)}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(product)}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition cursor-pointer"
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Tambah / Edit Produk */}
      <Modal
        isOpen={modal.open}
        onClose={closeModal}
        title={modal.mode === "add" ? "Tambah Produk" : "Edit Produk"}
        size="md"
      >
        <form onSubmit={handleProductSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama Produk</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="contoh: Nugget Ayam 400g"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Kategori</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- Pilih Kategori --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Harga Jual (Rp) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="contoh: 25000"
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {form.price > 0 && (
                <p className="text-xs text-gray-400 mt-1">{formatRupiah(form.price)}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Harga Beli / HPP (Rp)
                <span className="ml-1 text-xs text-gray-400 font-normal">(admin)</span>
              </label>
              <input
                type="number"
                min="0"
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                placeholder="0"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {form.costPrice > 0 && form.price > 0 && (
                <p className="text-xs text-green-600 mt-1">
                  Margin: {formatRupiah(form.price - form.costPrice)}
                  {" "}({Math.round(((form.price - form.costPrice) / form.price) * 100)}%)
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Deskripsi <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Deskripsi singkat produk..."
              rows={2}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={closeModal}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer">
              Batal
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer">
              {loading ? "Menyimpan..." : modal.mode === "add" ? "Tambah Produk" : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Atur Stok */}
      <Modal
        isOpen={stockModal.open}
        onClose={closeStockModal}
        title={`Atur Stok — ${stockModal.product?.name}`}
        size="sm"
      >
        {stockModal.product && (
          <div className="space-y-4">
            {/* Info stok per cabang */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              {stockModal.product.stocks.map((s) => (
                <div key={s.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{s.branch.name}</span>
                  <span className={`font-semibold ${s.quantity <= s.lowStockAlert ? "text-orange-500" : "text-gray-800"}`}>
                    {s.quantity} unit
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={handleStockSubmit} className="space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Cabang</label>
                <select
                  value={stockForm.branchId}
                  onChange={(e) => setStockForm({ ...stockForm, branchId: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Jumlah Stok Baru
                </label>
                <input
                  type="number"
                  min="0"
                  value={stockForm.quantity}
                  onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
                  placeholder="Masukkan jumlah stok"
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Keterangan <span className="text-gray-400 font-normal">(opsional)</span>
                </label>
                <input
                  type="text"
                  value={stockForm.note}
                  onChange={(e) => setStockForm({ ...stockForm, note: e.target.value })}
                  placeholder="contoh: Restok minggu ini"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeStockModal}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer">
                  Batal
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition cursor-pointer">
                  {loading ? "Menyimpan..." : "Update Stok"}
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>

      {/* Modal Diskon Qty */}
      <Modal
        isOpen={discountModal.open}
        onClose={closeDiscountModal}
        title={`Diskon Qty — ${discountModal.product?.name}`}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Atur aturan diskon otomatis berdasarkan jumlah qty yang dibeli.
            Kasir akan otomatis menerima harga setelah diskon.
          </p>

          {/* Daftar rules grouped by branch */}
          {discLoading && discountRules.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Memuat...</p>
          ) : discountRules.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Belum ada aturan diskon</p>
          ) : (() => {
            const grouped = {};
            for (const r of discountRules) {
              const bName = r.branch?.name ?? r.branchId ?? "—";
              if (!grouped[bName]) grouped[bName] = [];
              grouped[bName].push(r);
            }
            return (
              <div className="space-y-3">
                {Object.entries(grouped).map(([bName, rules]) => (
                  <div key={bName}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{bName}</p>
                    <div className="space-y-1.5">
                      {rules.map((r) => (
                        <div key={r.id} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                          <div>
                            <span className="text-sm font-semibold text-blue-800">Beli ≥ {r.minQty} pcs</span>
                            <span className="mx-2 text-gray-400">→</span>
                            <span className="text-sm font-bold text-green-700">Diskon {r.discountPercent}%</span>
                          </div>
                          <button
                            onClick={() => handleDeleteDiscountRule(r.id)}
                            disabled={discLoading}
                            className="text-red-400 hover:text-red-600 text-xs font-medium cursor-pointer transition disabled:opacity-50"
                          >
                            Hapus
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Form tambah rule */}
          <form onSubmit={handleAddDiscountRule} className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-600">Tambah Aturan Baru</p>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Cabang</label>
              <select
                value={discForm.branchId}
                onChange={(e) => setDiscForm({ ...discForm, branchId: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">-- Pilih Cabang --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">Min Qty</label>
                <input
                  type="number"
                  min="1"
                  value={discForm.minQty}
                  onChange={(e) => setDiscForm({ ...discForm, minQty: e.target.value })}
                  placeholder="contoh: 5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">Diskon (%)</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  value={discForm.discountPercent}
                  onChange={(e) => setDiscForm({ ...discForm, discountPercent: e.target.value })}
                  placeholder="contoh: 10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {discError && <p className="text-xs text-red-600">{discError}</p>}
            <button
              type="submit"
              disabled={discLoading}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
            >
              {discLoading ? "Menyimpan..." : "+ Tambah Aturan"}
            </button>
          </form>
        </div>
      </Modal>

      {/* Modal Batch & Expiry */}
      <Modal
        isOpen={batchModal.open}
        onClose={closeBatchModal}
        title={`Batch & Expiry — ${batchModal.product?.name}`}
        size="md"
      >
        <div className="space-y-4">
          {/* Daftar batch */}
          {batchLoading && batches.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Memuat...</p>
          ) : batches.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Belum ada batch</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {batches.map((b) => {
                const info = getExpiryStatus(b.expiryDate);
                return (
                  <div key={b.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{b.batchCode}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${info.color}`}>
                          {info.label}
                        </span>
                        {info.autoDiscount > 0 && (
                          <span className="text-xs text-orange-600 font-medium">Auto-diskon {info.autoDiscount}%</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Exp: {new Date(b.expiryDate).toLocaleDateString("id-ID")}
                        {" · "}{b.branch?.name}
                        {" · "}<span className="font-medium text-gray-600">Sisa: {b.quantity}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Form tambah batch baru */}
          <form onSubmit={handleAddBatch} className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-600">Terima Batch Baru</p>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Cabang</label>
              <select
                value={batchForm.branchId}
                onChange={(e) => setBatchForm({ ...batchForm, branchId: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">-- Pilih Cabang --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Kode Batch <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={batchForm.batchCode}
                  onChange={(e) => setBatchForm({ ...batchForm, batchCode: e.target.value })}
                  placeholder="contoh: B2024-001"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Qty <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="1"
                  value={batchForm.quantity}
                  onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })}
                  placeholder="100"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Tgl Produksi</label>
                <input
                  type="date"
                  value={batchForm.productionDate}
                  onChange={(e) => setBatchForm({ ...batchForm, productionDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Tgl Expired <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={batchForm.expiryDate}
                  onChange={(e) => setBatchForm({ ...batchForm, expiryDate: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {batchError && <p className="text-xs text-red-600">{batchError}</p>}
            <button
              type="submit"
              disabled={batchLoading}
              className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition cursor-pointer"
            >
              {batchLoading ? "Menyimpan..." : "+ Terima Batch"}
            </button>
          </form>
        </div>
      </Modal>

      {/* Modal Konfirmasi Hapus */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Nonaktifkan Produk" size="sm">
        <p className="text-sm text-gray-600 mb-5">
          Produk <strong>{deleteConfirm?.name}</strong> akan dinonaktifkan dan tidak tampil di kasir.
          Data transaksi tetap tersimpan.
        </p>
        <div className="flex gap-3">
          <button onClick={() => setDeleteConfirm(null)}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer">
            Batal
          </button>
          <button onClick={() => handleDelete(deleteConfirm)} disabled={loading}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition cursor-pointer">
            {loading ? "Memproses..." : "Nonaktifkan"}
          </button>
        </div>
      </Modal>
    </>
  );
}
