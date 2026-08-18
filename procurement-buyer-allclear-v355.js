/* ======================================================
   BUYER-SCOPED ALL CLEAR — Release 3.5.5
   BUYER may clear only Procurement records whose Owner Email exactly matches
   the authenticated BUYER email. Other buyers' rows are never selected.
   SUPER_ADMIN keeps the existing full-sheet All Clear implementation.
====================================================== */
(function installBuyerScopedAllClear(){
  'use strict';
  if (window.__MSW_BUYER_SCOPED_ALLCLEAR_V355__) return;
  window.__MSW_BUYER_SCOPED_ALLCLEAR_V355__ = true;

  const SHEET_NAME = 'Admin';
  const CACHE_KEY = 'MSW_PROCUREMENT_CACHE';
  const NET_CACHE_PREFIX = 'MSW_NET_CACHE_V1_';

  function normalize(value){ return String(value == null ? '' : value).trim(); }
  function normalizeEmail(value){ return normalize(value).toLowerCase(); }
  function role(){
    try { return String(window.MSW?.auth?.getRole?.() || '').trim().toUpperCase(); }
    catch (_) { return ''; }
  }
  function profile(){
    try { return window.MSW?.auth?.getProfile?.() || {}; }
    catch (_) { return {}; }
  }
  function gasUrl(){ return String(window.APP_CONFIG?.GAS_URL || '').trim(); }

  function notify(message, type = 'info'){
    const text = String(message || '');
    const container = document.getElementById('toastContainer');
    if (!container) {
      console[type === 'error' ? 'error' : 'info'](text);
      return;
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 5200);
  }

  function clearReloadableCaches(){
    try { window.MSW?.cache?.remove?.(CACHE_KEY); } catch (_) {}
    try {
      const remove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = String(localStorage.key(i) || '');
        if (key.startsWith(NET_CACHE_PREFIX)) remove.push(key);
      }
      remove.forEach(key => localStorage.removeItem(key));
    } catch (_) {}
  }

  async function freshSnapshot(){
    const gas = gasUrl();
    if (!gas) throw new Error('Google Apps Script belum dikonfigurasi.');
    const separator = gas.includes('?') ? '&' : '?';
    const url = `${gas}${separator}sheet=${encodeURIComponent(SHEET_NAME)}&buyerClearProbe=${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const response = await window.fetch(url, { cache: 'no-store' });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Google Apps Script HTTP ${response.status}.`);
    if (!raw || /^\s*</.test(raw)) throw new Error('Respons Google Apps Script bukan JSON.');
    const data = JSON.parse(raw);
    if (data?.success === false) throw new Error(data.message || 'Gagal mengambil data Procurement terbaru.');
    if (!Array.isArray(data?.rows)) throw new Error('Data Procurement terbaru tidak valid.');
    return data;
  }

  function ownedRows(rows, buyerEmail){
    return (Array.isArray(rows) ? rows : []).filter(row =>
      normalizeEmail(row?.ownerEmail || row?.['Owner Email']) === buyerEmail
    );
  }

  async function deleteOwnedRow(row){
    const noPR = normalize(row?.noPR || row?.['No PR']);
    const procurementId = normalize(row?.procurementId || row?.['Procurement ID']);
    if (!noPR && !procurementId) {
      return { success:false, skipped:true, message:'Record tidak memiliki No PR maupun Procurement ID.' };
    }

    const response = await window.fetch(gasUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'DELETE',
        sheet: SHEET_NAME,
        originalPR: noPR,
        procurementId,
        assignPRDate: row?.assignprdate || row?.['Assign PR'] || row?.['Assign Date'] || ''
      })
    });

    const raw = await response.text();
    let result;
    try { result = raw ? JSON.parse(raw) : {}; }
    catch (_) { throw new Error(raw || `HTTP ${response.status}`); }

    if (!response.ok || result?.success === false) {
      throw new Error(result?.message || `DELETE gagal (HTTP ${response.status}).`);
    }
    return {
      success:true,
      queued:Boolean(result?.queued || result?.pendingSync),
      noPR,
      procurementId
    };
  }

  async function buyerClearAll(){
    const activeProfile = profile();
    const buyerEmail = normalizeEmail(activeProfile?.email);
    if (!buyerEmail) {
      notify('Email akun BUYER tidak ditemukan. All Clear dibatalkan.', 'error');
      return;
    }

    try {
      notify('Memuat data Procurement terbaru untuk akun BUYER aktif...', 'info');
      const snapshot = await freshSnapshot();
      const targets = ownedRows(snapshot.rows, buyerEmail);

      if (!targets.length) {
        notify(`Tidak ada data Procurement milik ${buyerEmail} yang perlu dihapus.`, 'info');
        return;
      }

      const confirmed = window.confirm(
        `Hapus ${targets.length} data Procurement milik akun ${buyerEmail}?\n\n` +
        'Data Buyer lain tidak akan dihapus. Tindakan ini tidak dapat dibatalkan.'
      );
      if (!confirmed) return;

      let deleted = 0;
      let pending = 0;
      let skipped = 0;

      for (let index = 0; index < targets.length; index += 1) {
        // Re-check ownership immediately before each mutation. Never trust UI/cache alone.
        const row = targets[index];
        if (normalizeEmail(row?.ownerEmail || row?.['Owner Email']) !== buyerEmail) continue;
        notify(`Menghapus data BUYER ${index + 1} dari ${targets.length}...`, 'info');
        const outcome = await deleteOwnedRow(row);
        if (outcome?.skipped) { skipped += 1; continue; }
        deleted += 1;
        if (outcome?.queued) pending += 1;
      }

      clearReloadableCaches();
      if (pending) {
        notify(`${deleted} data diproses; ${pending} menunggu Pending Sync. Data Buyer lain tetap aman.`, 'info');
      } else if (skipped) {
        notify(`${deleted} data milik BUYER dihapus. ${skipped} record tanpa identitas aman tidak disentuh.`, 'success');
      } else {
        notify(`${deleted} data Procurement milik ${buyerEmail} berhasil dihapus. Data Buyer lain tetap aman.`, 'success');
      }
      setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      console.error('Buyer-scoped All Clear gagal:', error);
      notify(`All Clear BUYER gagal: ${error?.message || error}. Tidak ada data Buyer lain yang disentuh.`, 'error');
      clearReloadableCaches();
      setTimeout(() => window.location.reload(), 1200);
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
      if (installOverride() || tries > 80) clearInterval(timer);
    }, 50);
  }
})();
