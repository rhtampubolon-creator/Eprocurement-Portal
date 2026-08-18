/* ======================================================
   BUYER-SCOPED ALL CLEAR — Release 3.5.8
   Uses one backend action CLEAR_OWN_PROCUREMENT.
   Backend verifies exact Owner Email and deletes only authenticated BUYER rows.
====================================================== */
(function installBuyerScopedAllClearV358(){
  'use strict';
  if (window.__MSW_BUYER_SCOPED_ALLCLEAR_V358__) return;
  window.__MSW_BUYER_SCOPED_ALLCLEAR_V358__ = true;

  const SHEET_NAME = 'Admin';
  const CACHE_KEY = 'MSW_PROCUREMENT_CACHE';

  function role(){ try { return String(window.MSW?.auth?.getRole?.() || '').trim().toUpperCase(); } catch (_) { return ''; } }
  function profile(){ try { return window.MSW?.auth?.getProfile?.() || {}; } catch (_) { return {}; } }
  function gasUrl(){ return String(window.APP_CONFIG?.GAS_URL || '').trim(); }

  function notify(message, type = 'info'){
    const container = document.getElementById('toastContainer');
    if (!container) { console[type === 'error' ? 'error' : 'info'](message); return; }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = String(message || '');
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 5000);
  }

  function clearReloadableCaches(){
    try { window.MSW?.cache?.remove?.(CACHE_KEY); } catch (_) {}
    try {
      Object.keys(localStorage).forEach(key => {
        if (String(key).startsWith('MSW_NET_CACHE_V1_')) localStorage.removeItem(key);
      });
    } catch (_) {}
  }

  async function freshRevision(){
    const gas = gasUrl();
    const separator = gas.includes('?') ? '&' : '?';
    const url = `${gas}${separator}sheet=${encodeURIComponent(SHEET_NAME)}&buyerClearProbe=${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const response = await window.fetch(url, { cache: 'no-store' });
    const raw = await response.text();
    if (!response.ok || !raw || /^\s*</.test(raw)) throw new Error(`Gagal membaca Procurement terbaru (HTTP ${response.status}).`);
    const data = JSON.parse(raw);
    if (data?.success === false) throw new Error(data.message || 'Gagal membaca Procurement terbaru.');
    return Number(data.revision || 0);
  }

  async function buyerClearAll(){
    const activeProfile = profile();
    const email = String(activeProfile?.email || '').trim().toLowerCase();
    if (!email) { notify('Email akun BUYER tidak ditemukan. All Clear dibatalkan.', 'error'); return; }

    const confirmed = window.confirm(
      `Hapus semua data Procurement milik akun ${email}?\n\n` +
      'Data Buyer lain tidak akan dihapus. Tindakan ini tidak dapat dibatalkan.'
    );
    if (!confirmed) return;

    try {
      notify('Memeriksa revision Procurement terbaru...', 'info');
      const revision = await freshRevision();
      const response = await window.fetch(gasUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'CLEAR_OWN_PROCUREMENT',
          sheet: SHEET_NAME,
          expectedRevision: revision
        })
      });
      const raw = await response.text();
      let result;
      try { result = raw ? JSON.parse(raw) : {}; }
      catch (_) { throw new Error(raw || `HTTP ${response.status}`); }

      if (result?.conflict) {
        throw new Error(result.message || 'Data berubah oleh user lain. Muat ulang lalu ulangi All Clear.');
      }
      if (!response.ok || result?.success === false) {
        throw new Error(result?.message || `All Clear gagal (HTTP ${response.status}).`);
      }

      clearReloadableCaches();
      notify(result.message || `${Number(result.deletedCount || 0)} data Procurement milik ${email} berhasil dihapus.`, 'success');
      setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      console.error('Buyer-scoped All Clear gagal:', error);
      notify(`All Clear BUYER gagal: ${error?.message || error}`, 'error');
    }
  }

  function installOverride(){
    if (role() !== 'BUYER') return true;
    if (typeof window.clearAll !== 'function') return false;
    window.clearAll = buyerClearAll;
    window.__MSW_BUYER_SCOPED_ALLCLEAR_ACTIVE__ = true;
    return true;
  }

  if (!installOverride()) {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (installOverride() || tries > 120) clearInterval(timer);
    }, 50);
  }
})();
