// In-memory token bucket — rate limit login per email
// Reset otomatis saat proses restart. Untuk multi-instance gunakan Redis.

const WINDOW_MS   = 5 * 60 * 1000; // 5 menit
const MAX_ATTEMPTS = 8;

/** @type {Map<string, { count: number, resetAt: number }>} */
const store = new Map();

/**
 * Periksa apakah email boleh mencoba login.
 * @param {string} email - sudah di-lowercase sebelum dipanggil
 * @returns {{ allowed: boolean, waitSecs?: number }}
 */
export function checkRateLimit(email) {
  const now   = Date.now();
  const entry = store.get(email);

  if (!entry || now >= entry.resetAt) {
    store.set(email, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const waitSecs = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, waitSecs };
  }

  entry.count += 1;
  return { allowed: true };
}

/**
 * Reset counter setelah login berhasil.
 * @param {string} email - sudah di-lowercase
 */
export function resetRateLimit(email) {
  store.delete(email);
}
