"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";

// ── Helpers ────────────────────────────────────────────────────────────────

function getSelisih(item) {
  if (item.physicalQty === null || item.physicalQty === "") return null;
  const phys = parseInt(item.physicalQty);
  if (isNaN(phys)) return null;
  return phys - item.systemQty;
}

function getStatus(item) {
  const s = getSelisih(item);
  if (s === null)  return "UNFILLED";
  if (s > 0)       return "LEBIH";
  if (s === 0)     return "SESUAI";
  return "KURANG";
}

const STATUS_STYLE = {
  LEBIH:    { badge: "bg-green-100 text-green-700",  label: "Lebih"  },
  SESUAI:   { badge: "bg-gray-100 text-gray-500",    label: "Sesuai" },
  KURANG:   { badge: "bg-red-100 text-red-700",      label: "Kurang" },
  UNFILLED: { badge: "bg-gray-50 text-gray-400",     label: "—"      },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function OpnameDetail({ opname: initialOpname, autoSyncedCount = 0 }) {
  const router = useRouter();
  const isConfirmed = initialOpname.status === "CONFIRMED";

  // State: items (editable copy)
  const [items,        setItems]        = useState(
    initialOpname.items.map((it) => ({
      ...it,
      physicalQty: it.physicalQty !== null ? String(it.physicalQty) : "",
    }))
  );

  // State: UI
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [search,       setSearch]       = useState("");
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState(""); // "" | "saving" | "saved" | "error"
  const [confirming,   setConfirming]   = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDeleteModal,  setShowDeleteModal]  = useState(false);
  const [deleting,         setDeleting]         = useState(false);
  const [deleteError,      setDeleteError]      = useState("");

  // ── Computed summary ─────────────────────────────────────────────────────

  const summary = useMemo(() => {
    let lebih = 0, sesuai = 0, kurang = 0, unfilled = 0;
    for (const item of items) {
      const s = getStatus(item);
      if (s === "LEBIH")    lebih++;
      else if (s === "SESUAI")  sesuai++;
      else if (s === "KURANG")  kurang++;
      else                  unfilled++;
    }
    return { lebih, sesuai, kurang, unfilled, total: items.length };
  }, [items]);

  // ── Filtered items ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchStatus = filterStatus === "ALL" || getStatus(item) === filterStatus;
      const matchSearch = item.product.name.toLowerCase().includes(search.toLowerCase()) ||
                          item.product.category.name.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [items, filterStatus, search]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleQtyChange(itemId, value) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, physicalQty: value.replace(/[^0-9]/g, "") }
          : it
      )
    );
    setSaveMsg(""); // reset save state on change
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg("saving");
    try {
      const res = await fetch(`/api/stock-opname/${initialOpname.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          items: items.map((it) => ({ id: it.id, physicalQty: it.physicalQty })),
        }),
      });
      if (res.ok) {
        setSaveMsg("saved");
        setTimeout(() => setSaveMsg(""), 2500);
      } else {
        const data = await res.json();
        setSaveMsg("error:" + (data.error || "Gagal menyimpan"));
      }
    } catch (e) {
      setSaveMsg("error:" + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    setConfirmError("");
    try {
      // Simpan dulu sebelum konfirmasi
      const saveRes = await fetch(`/api/stock-opname/${initialOpname.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          items: items.map((it) => ({ id: it.id, physicalQty: it.physicalQty })),
        }),
      });
      if (!saveRes.ok) {
        const d = await saveRes.json();
        setConfirmError(d.error || "Gagal menyimpan data");
        return;
      }

      // Konfirmasi
      const res  = await fetch(`/api/stock-opname/${initialOpname.id}/confirm`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setConfirmError(data.error || "Gagal mengkonfirmasi opname");
        return;
      }
      // Redirect ke halaman list dengan refresh
      router.push("/stock-opname");
      router.refresh();
    } catch (e) {
      setConfirmError("Terjadi kesalahan: " + e.message);
    } finally {
      setConfirming(false);
      setShowConfirmModal(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/stock-opname/${initialOpname.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        setDeleteError(d.error || "Gagal menghapus opname");
        return;
      }
      router.push("/stock-opname");
      router.refresh();
    } catch (e) {
      setDeleteError("Terjadi kesalahan: " + e.message);
    } finally {
      setDeleting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const shortId = initialOpname.id.slice(-8).toUpperCase();

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => router.push("/stock-opname")}
              className="text-gray-400 hover:text-gray-600 text-sm cursor-pointer"
            >
              ← Kembali
            </button>
            <span className="text-gray-300">|</span>
            <h1 className="text-xl font-semibold text-gray-900">
              Stock Opname #{shortId}
            </h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isConfirmed
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
            }`}>
              {isConfirmed ? "Terkonfirmasi" : "Draft"}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {initialOpname.branch.name} &middot; {formatDateTime(initialOpname.createdAt)} &middot; oleh {initialOpname.user.name}
          </p>
          {initialOpname.note && (
            <p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 mt-2">
              {initialOpname.note}
            </p>
          )}
          {isConfirmed && initialOpname.confirmedAt && (
            <p className="text-sm text-green-700 mt-1">
              Dikonfirmasi pada {formatDateTime(initialOpname.confirmedAt)}
            </p>
          )}
        </div>

        {/* Hapus Draft — hanya saat status DRAFT */}
        {!isConfirmed && (
          <button
            onClick={() => { setShowDeleteModal(true); setDeleteError(""); }}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium border border-red-200 transition cursor-pointer shrink-0"
          >
            Hapus Draft
          </button>
        )}
      </div>

      {/* Banner: auto-sync */}
      {autoSyncedCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-yellow-500 text-lg shrink-0">⚠️</span>
          <p className="text-sm text-yellow-800">
            <strong>{autoSyncedCount} produk baru</strong> telah ditambahkan ke draft ini karena terdaftar di sistem setelah opname dibuat. Silakan isi stok fisik produk tersebut.
          </p>
        </div>
      )}

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: "ALL",      label: "Total Produk", value: summary.total,    color: "border-blue-200 bg-blue-50",    text: "text-blue-700"  },
          { key: "LEBIH",    label: "Lebih",         value: summary.lebih,    color: "border-green-200 bg-green-50",  text: "text-green-700" },
          { key: "SESUAI",   label: "Sesuai",         value: summary.sesuai,   color: "border-gray-200 bg-gray-50",    text: "text-gray-700"  },
          { key: "KURANG",   label: "Kurang",         value: summary.kurang,   color: "border-red-200 bg-red-50",      text: "text-red-700"   },
        ].map(({ key, label, value, color, text }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            className={`rounded-xl border p-3 text-left transition cursor-pointer ${color} ${
              filterStatus === key ? "ring-2 ring-blue-500" : "hover:opacity-80"
            }`}
          >
            <p className="text-xs text-gray-500 mb-0.5">{label}</p>
            <p className={`text-2xl font-bold ${text}`}>{value}</p>
            {key === "ALL" && summary.unfilled > 0 && (
              <p className="text-xs text-orange-500 mt-0.5">{summary.unfilled} belum diisi</p>
            )}
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari produk atau kategori..."
          className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">Semua ({summary.total})</option>
          <option value="UNFILLED">Belum diisi ({summary.unfilled})</option>
          <option value="LEBIH">Lebih ({summary.lebih})</option>
          <option value="SESUAI">Sesuai ({summary.sesuai})</option>
          <option value="KURANG">Kurang ({summary.kurang})</option>
        </select>
      </div>

      {/* Tabel produk */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Produk</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Kategori</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Stok Sistem</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">
                  {isConfirmed ? "Stok Fisik" : "Stok Fisik (isi)"}
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Selisih</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-400 text-sm">
                    Tidak ada produk yang sesuai filter
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const selisih = getSelisih(item);
                  const status  = getStatus(item);
                  const rowBg   =
                    status === "LEBIH"  ? "bg-green-50/40" :
                    status === "KURANG" ? "bg-red-50/40"   : "";

                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 transition ${rowBg}`}>
                      <td className="px-4 py-3 text-gray-800 font-medium">{item.product.name}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{item.product.category.name}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-mono whitespace-nowrap">
                        {item.systemQty}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isConfirmed ? (
                          <span className="font-mono font-semibold text-gray-900">
                            {item.physicalQty ?? "—"}
                          </span>
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.physicalQty}
                            onChange={(e) => handleQtyChange(item.id, e.target.value)}
                            placeholder="—"
                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-right text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold whitespace-nowrap">
                        {selisih === null ? (
                          <span className="text-gray-300">—</span>
                        ) : selisih > 0 ? (
                          <span className="text-green-600">+{selisih}</span>
                        ) : selisih < 0 ? (
                          <span className="text-red-600">{selisih}</span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[status].badge}`}>
                          {STATUS_STYLE[status].label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action bar (hanya saat DRAFT) */}
      {!isConfirmed && (
        <div className="sticky bottom-4 z-10">
          <div className="bg-white rounded-xl border border-gray-200 shadow-lg px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-600">
              {summary.unfilled > 0 ? (
                <span className="text-orange-600 font-medium">
                  {summary.unfilled} produk belum diisi — isi semua sebelum konfirmasi
                </span>
              ) : (
                <span className="text-green-600 font-medium">
                  Semua {summary.total} produk sudah diisi
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition cursor-pointer"
              >
                {saving ? "Menyimpan..." :
                 saveMsg === "saved" ? "✓ Tersimpan" :
                 saveMsg.startsWith("error") ? "Gagal!" : "Simpan"}
              </button>
              <button
                onClick={() => {
                  if (summary.unfilled > 0) {
                    setConfirmError(`${summary.unfilled} produk belum diisi. Isi semua stok fisik terlebih dahulu.`);
                    setShowConfirmModal(true);
                    return;
                  }
                  setConfirmError("");
                  setShowConfirmModal(true);
                }}
                disabled={confirming}
                className="px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition cursor-pointer"
              >
                {confirming ? "Mengkonfirmasi..." : "Konfirmasi Opname"}
              </button>
            </div>
          </div>
          {saveMsg.startsWith("error") && (
            <p className="text-xs text-red-600 text-right mt-1 px-1">
              {saveMsg.replace("error:", "")}
            </p>
          )}
        </div>
      )}

      {/* Modal: Hapus Draft */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setShowDeleteModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <span className="text-4xl">🗑️</span>
              <h2 className="text-lg font-semibold text-gray-900 mt-2">Hapus Draft Opname?</h2>
            </div>
            <p className="text-sm text-gray-600 text-center">
              Sesi opname <strong>#{shortId}</strong> beserta semua data yang sudah diisi akan dihapus permanen. Tindakan ini <strong>tidak dapat dibatalkan</strong>.
            </p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { if (!deleting) setShowDeleteModal(false); }}
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

      {/* Modal Konfirmasi */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget && !confirming) setShowConfirmModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            {confirmError && summary.unfilled > 0 ? (
              <>
                <div className="text-center">
                  <span className="text-4xl">⚠️</span>
                  <h2 className="text-lg font-semibold text-gray-900 mt-2">Tidak Bisa Konfirmasi</h2>
                </div>
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
                  {confirmError}
                </p>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition cursor-pointer"
                >
                  Kembali dan Isi
                </button>
              </>
            ) : (
              <>
                <div className="text-center">
                  <span className="text-4xl">✅</span>
                  <h2 className="text-lg font-semibold text-gray-900 mt-2">Konfirmasi Stock Opname</h2>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Total produk</span>
                    <span className="font-semibold">{summary.total}</span>
                  </div>
                  <div className="flex justify-between text-green-700">
                    <span>Stok lebih</span>
                    <span className="font-semibold">{summary.lebih} produk</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Stok sesuai</span>
                    <span className="font-semibold">{summary.sesuai} produk</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Stok kurang</span>
                    <span className="font-semibold">{summary.kurang} produk</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Stok sistem akan diperbarui sesuai stok fisik yang sudah diisi.
                  Tindakan ini <strong>tidak dapat dibatalkan</strong>.
                </p>
                {confirmError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{confirmError}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { if (!confirming) setShowConfirmModal(false); }}
                    disabled={confirming}
                    className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition cursor-pointer"
                  >
                    {confirming ? "Memproses..." : "Ya, Konfirmasi"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
