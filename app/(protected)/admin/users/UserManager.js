"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/format";

const EMPTY_CREATE = { name: "", email: "", password: "", role: "KASIR", branchId: "" };
const EMPTY_EDIT   = { name: "", email: "", role: "KASIR", branchId: "", isActive: true };

const ROLE_COLOR = {
  ADMIN: "bg-blue-100 text-blue-700",
  KASIR: "bg-green-100 text-green-700",
};

export default function UserManager({ initialUsers, branches, currentUserId }) {
  const [users, setUsers]   = useState(initialUsers);
  const [modal, setModal]   = useState(null); // null | "create" | "edit" | "reset"
  const [target, setTarget] = useState(null);
  const [form, setForm]     = useState(EMPTY_CREATE);
  const [newPwd, setNewPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [toggling, setToggling] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function openCreate() {
    setForm(EMPTY_CREATE);
    setError("");
    setModal("create");
  }

  function openEdit(user) {
    setTarget(user);
    setForm({
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branchId ?? "",
      isActive: user.isActive,
    });
    setError("");
    setModal("edit");
  }

  function openReset(user) {
    setTarget(user);
    setNewPwd("");
    setError("");
    setModal("reset");
  }

  function closeModal() {
    setModal(null);
    setTarget(null);
    setError("");
    setNewPwd("");
  }

  async function handleCreate() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Gagal membuat user"); return; }
      setUsers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    setError("");
    setSaving(true);
    try {
      const payload = { ...form, branchId: form.branchId || null };
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Gagal menyimpan"); return; }
      setUsers((prev) => prev.map((u) => (u.id === data.id ? data : u)));
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Gagal reset password"); return; }
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(user) {
    if (user.id === currentUserId) return;
    setToggling(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const data = await res.json();
      if (res.ok) setUsers((prev) => prev.map((u) => (u.id === data.id ? data : u)));
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(user) {
    setDeleting(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Gagal menghapus user");
      } else {
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
      }
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  const isSelf = (user) => user.id === currentUserId;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Manajemen User</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} user terdaftar</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition cursor-pointer"
        >
          + Tambah User
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Nama</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Email</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Role</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Cabang</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Dibuat</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className={`hover:bg-gray-50 transition ${!u.isActive ? "opacity-60" : ""}`}>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-gray-900">{u.name}</p>
                    {isSelf(u) && (
                      <span className="text-xs text-blue-500 font-medium">(Anda)</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{u.email}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLOR[u.role]}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {u.branch?.name ?? <span className="text-gray-300 italic">Semua</span>}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {u.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {formatDateTime(u.createdAt)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <button onClick={() => openEdit(u)} className="text-blue-600 hover:underline text-xs font-medium cursor-pointer">
                        Edit
                      </button>
                      <button onClick={() => openReset(u)} className="text-indigo-600 hover:underline text-xs font-medium cursor-pointer">
                        Reset PW
                      </button>
                      {!isSelf(u) && (
                        <>
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={toggling === u.id}
                            className={`text-xs font-medium cursor-pointer disabled:opacity-50 ${
                              u.isActive ? "text-orange-500 hover:underline" : "text-green-600 hover:underline"
                            }`}
                          >
                            {toggling === u.id ? "..." : u.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(u)}
                            className="text-red-500 hover:underline text-xs font-medium cursor-pointer"
                          >
                            Hapus
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CREATE MODAL ── */}
      {modal === "create" && (
        <FormModal
          title="Tambah User"
          onClose={closeModal}
          onSave={handleCreate}
          saving={saving}
          error={error}
          saveLabel="Buat User"
          disabled={!form.name.trim() || !form.email.trim() || !form.password}
        >
          <UserFormFields form={form} setField={setField} branches={branches} showPassword />
        </FormModal>
      )}

      {/* ── EDIT MODAL ── */}
      {modal === "edit" && target && (
        <FormModal
          title={`Edit User — ${target.name}`}
          onClose={closeModal}
          onSave={handleEdit}
          saving={saving}
          error={error}
          saveLabel="Simpan Perubahan"
          disabled={!form.name.trim() || !form.email.trim()}
        >
          <UserFormFields form={form} setField={setField} branches={branches} isSelf={isSelf(target)} />
          {/* isActive toggle (not for self) */}
          {!isSelf(target) && (
            <div className="flex items-center justify-between py-2 border-t border-gray-100 mt-2">
              <div>
                <p className="text-sm font-medium text-gray-700">Status Akun</p>
                <p className="text-xs text-gray-400">Nonaktif = user tidak bisa login</p>
              </div>
              <button
                type="button"
                onClick={() => setField("isActive", !form.isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  form.isActive ? "bg-green-500" : "bg-gray-300"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  form.isActive ? "translate-x-6" : "translate-x-1"
                }`} />
              </button>
            </div>
          )}
        </FormModal>
      )}

      {/* ── RESET PASSWORD MODAL ── */}
      {modal === "reset" && target && (
        <FormModal
          title={`Reset Password — ${target.name}`}
          onClose={closeModal}
          onSave={handleResetPassword}
          saving={saving}
          error={error}
          saveLabel="Reset Password"
          disabled={newPwd.length < 6}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password Baru <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Password lama akan langsung diganti.</p>
          </div>
        </FormModal>
      )}

      {/* ── CONFIRM DELETE ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Hapus User?</h3>
            <p className="text-sm text-gray-600">
              Yakin hapus <strong>{confirmDelete.name}</strong>? Aksi ini tidak bisa dibatalkan.
              Jika user punya riwayat transaksi, penghapusan akan gagal.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting === confirmDelete.id}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 cursor-pointer"
              >
                {deleting === confirmDelete.id ? "Menghapus..." : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable Form Modal ───────────────────────────────────────────────────────

function FormModal({ title, onClose, onSave, saving, error, saveLabel, disabled, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {children}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer">
            Batal
          </button>
          <button
            onClick={onSave}
            disabled={saving || disabled}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
          >
            {saving ? "Menyimpan..." : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── User form fields (shared by create + edit) ────────────────────────────────

function UserFormFields({ form, setField, branches, showPassword, isSelf }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nama <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
          placeholder="Nama lengkap"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setField("email", e.target.value)}
          placeholder="email@example.com"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {showPassword && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            placeholder="Minimal 6 karakter"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
        <select
          value={form.role}
          onChange={(e) => setField("role", e.target.value)}
          disabled={isSelf}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="KASIR">Kasir</option>
          <option value="ADMIN">Admin</option>
        </select>
        {isSelf && <p className="text-xs text-gray-400 mt-1">Tidak bisa mengubah role akun sendiri.</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Cabang {form.role === "KASIR" && <span className="text-red-500">*</span>}
        </label>
        <select
          value={form.branchId}
          onChange={(e) => setField("branchId", e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{form.role === "KASIR" ? "— Pilih Cabang —" : "Semua Cabang (Admin)"}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        {form.role === "KASIR" && !form.branchId && (
          <p className="text-xs text-red-500 mt-1">Kasir wajib memiliki cabang.</p>
        )}
      </div>
    </>
  );
}
