/**
 * Audit logging — mencatat aksi penting admin ke server logs (Vercel Logs).
 * Format JSON terstruktur agar mudah di-filter di Vercel Dashboard.
 *
 * Upgrade path: ganti console.log dengan insert ke tabel AuditLog di DB
 * ketika migrasi sudah siap.
 */

/**
 * @param {"CREATE"|"UPDATE"|"DELETE"|"RESET_PASSWORD"} action
 * @param {string} resource  - e.g. "user", "branch", "product", "batch", "stock"
 * @param {object} opts
 * @param {string} opts.actorId    - ID user yang melakukan aksi
 * @param {string} opts.actorEmail - Email user yang melakukan aksi
 * @param {string} [opts.targetId] - ID entitas yang diubah
 * @param {object} [opts.meta]     - Data tambahan (jangan masukkan password)
 */
export function auditLog(action, resource, { actorId, actorEmail, targetId, meta } = {}) {
  console.log(
    JSON.stringify({
      audit: true,
      ts:    new Date().toISOString(),
      action,
      resource,
      actorId,
      actorEmail,
      targetId:  targetId ?? null,
      meta:      meta     ?? null,
    })
  );
}
