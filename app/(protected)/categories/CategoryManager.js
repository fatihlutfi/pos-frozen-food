"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";

export default function CategoryManager({ initialCategories }) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [modal, setModal] = useState({ open: false, mode: "add", category: null });
  const [formName, setFormName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  function openAdd() {
    setFormName("");
    setError("");
    setModal({ open: true, mode: "add", category: null });
  }

  function openEdit(cat) {
    setFormName(cat.name);
    setError("");
    setModal({ open: true, mode: "edit", category: cat });
  }

  function closeModal() {
    setModal({ open: false, mode: "add", category: null });
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const isEdit = modal.mode === "edit";
    const url = isEdit ? `/api/categories/${modal.category.id}` : "/api/categories";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formName }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Terjadi kesalahan");
      return;
    }

    router.refresh();
    closeModal();

    if (isEdit) {
      setCategories((prev) => prev.map((c) => (c.id === data.id ? { ...c, ...data } : c)));
    } else {
      setCategories((prev) => [...prev, { ...data, _count: { products: 0 } }]);
    }
  }

  async function handleDelete(cat) {
    setLoading(true);
    const res = await fetch(`/api/categories/${cat.id}`, { method: "DELETE" });
    const data = await res.json();
    setLoading(false);
    setDeleteConfirm(null);

    if (!res.ok) {
      alert(data.error || "Gagal menghapus kategori");
      return;
    }

    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    router.refresh();
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{categories.length} kategori</p>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition cursor-pointer"
        >
          <span>+</span> Tambah Kategori
        </button>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {categories.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            Belum ada kategori. Tambahkan kategori pertama!
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Nama Kategori</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Jumlah Produk</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3.5 font-medium text-gray-800">{cat.name}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      {cat._count.products} produk
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(cat)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(cat)}
                        disabled={cat._count.products > 0}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={cat._count.products > 0 ? "Hapus produk di kategori ini terlebih dahulu" : ""}
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Add/Edit */}
      <Modal
        isOpen={modal.open}
        onClose={closeModal}
        title={modal.mode === "add" ? "Tambah Kategori" : "Edit Kategori"}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nama Kategori
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="contoh: Daging & Unggas"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={closeModal}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer"
            >
              {loading ? "Menyimpan..." : modal.mode === "add" ? "Tambah" : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Konfirmasi Hapus */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Hapus Kategori"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-5">
          Yakin ingin menghapus kategori <strong>{deleteConfirm?.name}</strong>?
          Tindakan ini tidak dapat dibatalkan.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setDeleteConfirm(null)}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={() => handleDelete(deleteConfirm)}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition cursor-pointer"
          >
            {loading ? "Menghapus..." : "Ya, Hapus"}
          </button>
        </div>
      </Modal>
    </>
  );
}
