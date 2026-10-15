/* Add as separate Apps Script .gs file to existing backend. */
function resetEmailKey_(email) {
  return "PWD_RESET_" + authHash_(String(email || "").trim().toLowerCase());
}
function requestPasswordReset_(body) {
  const email = String(body.email || "").trim().toLowerCase();
  const generic = { success: true, message: "Jika email terdaftar dan aktif, tautan reset password akan dikirim. Periksa Inbox atau Spam." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return generic;

  const cache = CacheService.getScriptCache();
  const key = resetEmailKey_(email);
  // Throttle repeat requests per address, avoiding easy email flooding.
  const throttleKey = "PWD_RESET_THROTTLE_" + authHash_(email);
  if (cache.get(throttleKey)) return generic;
  cache.put(throttleKey, "1", 120);
  const record = userRecordByEmail_(email);
  if (!record) return generic;
  const profile = profileFromUserRecord_(record);
  if (!profile.active || profile.status !== "APPROVED") return generic;

  const portal = scriptProperty_("PUBLIC_PORTAL_URL", "");
  if (!portal || !/^https:\/\//i.test(portal)) {
    throw new Error("PUBLIC_PORTAL_URL belum dikonfigurasi sebagai URL HTTPS portal yang dapat diakses pengguna.");
  }
  const token = authRandomToken_();
  cache.put(key, authHash_(token), 900);
  const join = portal.indexOf("#") >= 0 ? portal.split("#")[0] : portal;
  const link = join + "#password-reset=" + encodeURIComponent(email) + ":" + token;
  MailApp.sendEmail({
    to: email,
    subject: "Reset Password MSW E-Procurement",
    body: "Ada permintaan reset password untuk akun MSW E-Procurement.\n\n" +
          "Buka tautan berikut untuk membuat password baru (berlaku 15 menit, satu kali pakai):\n" +
          link + "\n\nJika Anda tidak meminta reset, abaikan email ini."
  });
  return generic;
}
function confirmPasswordReset_(body) {
  const email = String(body.email || "").trim().toLowerCase();
  const token = String(body.resetToken || "").trim();
  const password = String(body.newPassword || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-f0-9]{64}$/i.test(token)) {
    throw new Error("Tautan reset tidak valid atau sudah kedaluwarsa.");
  }
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Password minimal 10 karakter dan harus memiliki huruf besar, huruf kecil, serta angka.");
  }
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const key = resetEmailKey_(email);
    const cache = CacheService.getScriptCache();
    const storedHash = cache.get(key);
    if (!storedHash || storedHash !== authHash_(token)) throw new Error("Tautan reset tidak valid, kedaluwarsa, atau sudah digunakan.");
    const record = userRecordByEmail_(email);
    if (!record || !profileFromUserRecord_(record).active) throw new Error("Akun tidak tersedia untuk reset.");
    // Consume token while holding the lock, invalidate all prior sessions.
    cache.remove(key);
    const salt = authRandomToken_().slice(0, 32);
    record.sheet.getRange(record.row, record.map.passwordsalt + 1).setValue(salt);
    record.sheet.getRange(record.row, record.map.passwordhash + 1).setValue(authPasswordHash_(password, salt));
    record.sheet.getRange(record.row, record.map.sessiontokenhash + 1).clearContent();
    record.sheet.getRange(record.row, record.map.sessionexpires + 1).clearContent();
    return { success: true, message: "Password berhasil diperbarui. Silakan sign in kembali." };
  } finally {
    lock.releaseLock();
  }
}
