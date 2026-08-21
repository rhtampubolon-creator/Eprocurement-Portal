/*
 * CONSOLIDATION TEST BUNDLE — SHADOW BRANCH ONLY
 * Original source order preserved.
 * - procurement-action-bridge-v354-hotfix1.js
 * - procurement-buyer-allclear-v358.js
 */

/* ===== BEGIN ORIGINAL: procurement-action-bridge-v354-hotfix1.js ===== */
/* ======================================================
   PROCUREMENT ACTION + MULTI-USER BRIDGE
   Release 3.5.4 hotfix 1
   - Keeps Procurement Action compatibility patch isolated from stable core.
   - Keeps Buyer Smart Import revision retry limited to one safe retry.
   - Prevents unsafe full-sheet retry.
   - Adds Procurement cache quota recovery.
   - Explains backend BUYER All Clear permission denial without bypassing it.
====================================================== */
(function installProcurementActionBridge(){
  'use strict';
  if (window.__MSW_PROCUREMENT_ACTION_BRIDGE_V354_H1__) return;
  window.__MSW_PROCUREMENT_ACTION_BRIDGE_V354_H1__ = true;

  const MODULE_ID = 'procurementAdmin';
  const SHEET_NAME = 'Admin';
  const CACHE_KEY = 'MSW_PROCUREMENT_CACHE';
  const NET_CACHE_PREFIX = 'MSW_NET_CACHE_V1_';
  const BUYER_SAFE_RETRY_ACTION = 'BATCH_IMPORT_PROCUREMENT_BY_BUYER';

  function gasUrl(){ return String(window.APP_CONFIG?.GAS_URL || '').trim(); }
  function role(){
    try { return String(window.MSW?.auth?.getRole?.() || '').trim().toUpperCase(); }
    catch (_) { return ''; }
  }
  function isViewOnly(){ try { return Boolean(window.MSW?.auth?.isViewOnlyModule?.(MODULE_ID)); } catch (_) { return false; } }
  function blockMutation(){ if (!isViewOnly()) return false; try { window.MSW?.auth?.showViewOnlyMessage?.(); } catch (_) {} return true; }

  function notify(message, type = 'info'){
    const text = String(message || '');
    const container = document.getElementById('toastContainer');
    if (!container) { console[type === 'error' ? 'error' : 'info'](text); return; }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 4500);
  }

  function networkCacheEntries(){
    const entries = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = String(localStorage.key(i) || '');
        if (!key.startsWith(NET_CACHE_PREFIX)) continue;
        let savedAt = 0;
        try { savedAt = Number(JSON.parse(localStorage.getItem(key) || '{}')?.savedAt || 0); } catch (_) {}
        entries.push({ key, savedAt });
      }
    } catch (_) {}
    return entries.sort((a,b) => b.savedAt - a.savedAt);
  }

  function prunePerformanceNetworkCache(keepNewest = 4){
    const entries = networkCacheEntries();
    entries.slice(Math.max(0, keepNewest)).forEach(item => {
      try { localStorage.removeItem(item.key); } catch (_) {}
    });
  }

  function clearPerformanceNetworkCache(){
    networkCacheEntries().forEach(item => {
      try { localStorage.removeItem(item.key); } catch (_) {}
    });
  }

  function installProcurementCacheQuotaRecovery(){
    const cache = window.MSW?.cache;
    if (!cache?.save || cache.__MSW_PROCUREMENT_QUOTA_H1__) return;
    cache.__MSW_PROCUREMENT_QUOTA_H1__ = true;

    // Sisakan hanya beberapa snapshot network terbaru agar cache Procurement besar
    // tidak bersaing dengan banyak salinan respons GAS lama di localStorage.
    prunePerformanceNetworkCache(4);

    const baseSave = cache.save.bind(cache);
    cache.save = function(key, data, ttl){
      if (String(key || '') !== CACHE_KEY) return baseSave(key, data, ttl);

      let saved = baseSave(key, data, ttl);
      if (saved !== false) return saved;

      // Jika localStorage penuh, buang cache GET yang bisa dibuat ulang dari server,
      // bukan data transaksi/pending sync, lalu retry satu kali.
      clearPerformanceNetworkCache();
      saved = baseSave(key, data, ttl);
      if (saved === false) {
        notify('Cache browser penuh. Data tetap dibaca dari server, tetapi cache lokal Procurement tidak dapat disimpan.', 'error');
      }
      return saved;
    };
  }

  installProcurementCacheQuotaRecovery();

  function parseJsonBody(body){ if (typeof body !== 'string') return null; try { return JSON.parse(body); } catch (_) { return null; } }
  async function readJsonResponse(response){ try { const text = await response.clone().text(); if (!text || /^\s*</.test(text)) return null; return JSON.parse(text); } catch (_) { return null; } }
  function isRevisionConflict(payload){
    if (!payload || payload.success !== false) return false;
    const message = String(payload.message || '').toLowerCase();
    return Boolean(payload.conflict) || message.includes('berubah sejak halaman dibuka') || message.includes('revision conflict') || message.includes('revision berubah') || (message.includes('revision') && message.includes('muat ulang'));
  }
  function isBuyerAllClearPermissionDenied(message){
    const text = String(message || '').toLowerCase();
    return role() === 'BUYER' && text.includes('akses ditolak') && text.includes('procurement.import');
  }

  const upstreamFetch = window.fetch.bind(window);

  async function fetchFreshAdminSnapshot(){
    const gas = gasUrl();
    if (!gas) throw new Error('Google Apps Script belum dikonfigurasi.');
    const separator = gas.includes('?') ? '&' : '?';
    const url = `${gas}${separator}sheet=${encodeURIComponent(SHEET_NAME)}&revisionProbe=${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const response = await upstreamFetch(url, { cache: 'no-store' });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Google Apps Script HTTP ${response.status}.`);
    if (!raw || /^\s*</.test(raw)) throw new Error('Respons Google Apps Script bukan JSON.');
    const data = JSON.parse(raw);
    if (data?.success === false) throw new Error(data.message || 'Gagal mengambil revision terbaru.');
    if (!Array.isArray(data?.rows)) throw new Error('Snapshot Procurement terbaru tidak valid.');
    return data;
  }

  window.fetch = async function procurementRevisionAwareFetch(input, init){
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const gas = gasUrl();
    const options = init || {};
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    if (!gas || method !== 'POST' || url.indexOf(gas) !== 0) return upstreamFetch(input, init);

    const payload = parseJsonBody(options.body);
    const action = String(payload?.action || '').trim().toUpperCase();
    if (!payload || payload.expectedRevision == null) return upstreamFetch(input, init);

    const firstResponse = await upstreamFetch(input, init);
    const firstPayload = await readJsonResponse(firstResponse);
    if (!isRevisionConflict(firstPayload)) return firstResponse;

    if (action !== BUYER_SAFE_RETRY_ACTION) {
      notify('Data berubah karena aktivitas user lain. Proses dibatalkan agar data terbaru tidak tertimpa.', 'error');
      return firstResponse;
    }

    try {
      const snapshot = await fetchFreshAdminSnapshot();
      const latestRevision = Number(snapshot.revision || 0);
      if (!Number.isFinite(latestRevision)) return firstResponse;
      notify('Data berubah oleh user lain. Smart Import Buyer memakai revision terbaru dan dicoba kembali sekali.', 'info');
      const retryPayload = Object.assign({}, payload, { expectedRevision: latestRevision, clientRetryAfterRevisionConflict: true });
      const retryOptions = Object.assign({}, options, { body: JSON.stringify(retryPayload) });
      return upstreamFetch(url, retryOptions);
    } catch (error) {
      console.warn('Smart Import multi-user retry tidak dapat dijalankan:', error);
      return firstResponse;
    }
  };

  function openProcurementForm(url){
    if (blockMutation()) return;
    const frame = document.getElementById('formFrame');
    const modal = document.getElementById('formModal');
    const formWindow = document.getElementById('formWindow');
    if (!frame || !modal || !formWindow) { notify('Procurement Form belum siap. Muat ulang halaman lalu coba kembali.', 'error'); return; }
    frame.src = url;
    const dragTitle = document.querySelector('#formDragHandle span');
    if (dragTitle) dragTitle.textContent = String(url).includes('workspace/') ? 'Procurement Workspace' : 'Procurement Form';
    formWindow.style.left = '50%'; formWindow.style.top = '50%'; formWindow.style.transform = 'translate(-50%, -50%)'; formWindow.classList.remove('is-dragging'); modal.classList.remove('hidden');
  }

  window.handleAdd = function(){ openProcurementForm('Form/index.html?mode=add'); };
  function cacheRows(){ try { const rows = window.MSW?.cache?.load?.(CACHE_KEY); return Array.isArray(rows) ? rows : []; } catch (_) { return []; } }

  window.exportExcel = function(){
    const rows = cacheRows();
    if (!rows.length) { notify('Tidak ada data untuk diekspor.', 'info'); return; }
    if (!window.XLSX) { notify('Library Excel belum termuat. Klik Export Excel sekali lagi.', 'error'); return; }
    const roundList = ['R0','R1','R2','R3','R4','R5'];
    const exportRows = rows.map(r => {
      const out = {
        'No PR': r.noPR || '', 'Description': r.Description || '', 'Previous Submit PO': r.previoussubmitpo || '', 'Final Vendor List': r.finalvendorlist || '', 'Final Submit Vendor': r.finalsubmitvendor || '', 'Status Rebid': r.statusrebid || '', 'PIC': r.pic || '', 'Assign PR': r.assignprdate || '', 'Departement': r.departement || '', 'Pengadaan': r.pengadaan || '', 'Status PR': r.statuspr || '', 'RFQ': r.rfq || '', 'Est. Price PR': r.estpricerp || '', 'Est. Price US - Rp': r.estpriceus || '', 'USD/IDR Rate': r.usdidrrate || '', 'USD/IDR Rate Date': r.usdidrratedate || '', 'USD/IDR Source': r.usdidrsource || '', 'USD/IDR Locked': r.usdidrlocked === true || String(r.usdidrlocked || '').toLowerCase() === 'true', 'Flow Process': r.flowprocess || '', 'Round PR': r.roundpo || ''
      };
      roundList.forEach(round => { const key = round.toLowerCase(); out[`${round} Company`] = r[`${key}company`] || ''; out[`${round} Submit Company`] = r[`${key}submitcompany`] || ''; out[`${round} Start Date`] = r[`${key}startdate`] || ''; out[`${round} Finish Date`] = r[`${key}finishdate`] || ''; });
      Object.assign(out, { 'Winner PO': r.winnerpo || '', 'Email Winner PO': r.emailwinnerpo || '', 'No PO': r.nopo || '', 'Price (Rp) Excl. PPn': r.pricerp || '', 'CQS Create Date': r.cqscreatedate || '', 'CQS Approval Date': r.cqsapprovaldate || '', 'PO Create Date': r.pocreatedate || '', 'PO Del. Date': r.podeldate || '', 'Actual PO Rel. Date': r.actualporeleasedate || '', 'Actual PO Del. Date': r.actualpodeldate || '', 'Days Calender (Days)': r.days || '', 'Actual Received PO (GRN Date)': r.actualreceivedpo || '', 'Note': r.note || '', 'Folder ID': r.folderid || '', 'Folder LINK': r.folderlink || '' });
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(exportRows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Procurement'); XLSX.writeFile(wb, `Procurement Admin-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  window.clearAll = async function(){
    if (blockMutation()) return;
    if (!window.confirm('Hapus semua data?')) return;
    try {
      notify('Memeriksa revision Procurement terbaru...', 'info');
      const snapshot = await fetchFreshAdminSnapshot();
      const revision = Number(snapshot.revision || 0);
      if (!Number.isFinite(revision)) throw new Error('Revision Procurement terbaru tidak valid.');
      const gas = gasUrl();
      const response = await upstreamFetch(gas, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'BATCH_REPLACE_PROCUREMENT', sheet: SHEET_NAME, rows: [], expectedRevision: revision }) });
      const raw = await response.text();
      let result; try { result = raw ? JSON.parse(raw) : {}; } catch (_) { throw new Error(raw || `HTTP ${response.status}`); }
      if (isRevisionConflict(result)) throw new Error('Data Procurement berubah setelah konfirmasi. All Clear dibatalkan agar perubahan user lain tidak terhapus. Muat ulang lalu ulangi jika masih diperlukan.');
      if (!response.ok || result?.success === false) {
        const serverMessage = result?.message || `Google Sheet gagal diperbarui (HTTP ${response.status}).`;
        if (isBuyerAllClearPermissionDenied(serverMessage)) {
          throw new Error('BUYER_ALL_CLEAR_PERMISSION:Backend menolak All Clear untuk role BUYER karena permission procurement.import belum diberikan. Proteksi ini tidak dibypass agar Buyer tidak dapat menghapus data Buyer lain.');
        }
        throw new Error(serverMessage);
      }
      if (result?.queued || result?.pendingSync) { notify('All Clear tersimpan sebagai Pending Sync dan akan dijalankan saat koneksi tersedia.', 'info'); return; }
      try { window.MSW?.cache?.remove?.(CACHE_KEY); } catch (_) {}
      clearPerformanceNetworkCache();
      notify('Semua data Procurement berhasil dihapus.', 'success');
      setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      const message = String(error?.message || error || '');
      if (message.startsWith('BUYER_ALL_CLEAR_PERMISSION:')) {
        const userMessage = 'All Clear belum diizinkan server untuk BUYER. Agar aman pada sistem multi-user, Buyer tidak akan diberi bypass untuk menghapus seluruh sheet. Backend Apps Script perlu permission/action khusus untuk menghapus data Buyer sendiri.';
        console.warn(userMessage);
        notify(userMessage, 'error');
        return;
      }
      console.error('All Clear gagal:', error);
      notify(`All Clear gagal: ${message}`, 'error');
    }
  };

  function parseFlexibleDate(value){
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (!Number.isNaN(Number(value)) && Number(value) > 20000 && Number(value) < 80000) { const date = new Date((Number(value) - 25569) * 86400 * 1000); return Number.isNaN(date.getTime()) ? null : date; }
    const text = String(value).trim();
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,mei:4,jun:5,jul:6,aug:7,agu:7,agt:7,sep:8,oct:9,okt:9,nov:10,dec:11,des:11};
    const named = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{2,4})$/);
    if (named) { let year = Number(named[3]); if (year < 100) year += 2000; const month = months[named[2].slice(0,3).toLowerCase()]; if (month !== undefined) return new Date(year, month, Number(named[1])); }
    const numeric = text.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
    if (numeric) { let year = Number(numeric[3]); if (year < 100) year += 2000; return new Date(year, Number(numeric[2]) - 1, Number(numeric[1])); }
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/); if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const date = new Date(text); return Number.isNaN(date.getTime()) ? null : date;
  }
  function formatDate(value){ const date = parseFlexibleDate(value); return date ? date.toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : String(value || ''); }

  window.updateRoundPR = function(index, selectedValue){
    const rows = cacheRows(); const row = rows[Number(index)]; const tr = document.querySelector(`#tableBody tr[data-index="${Number(index)}"]`); if (!row || !tr) return;
    const selected = String(selectedValue || 'R0').trim().toUpperCase().match(/^R[0-5]$/)?.[0] || 'R0';
    const stored = String(row.roundpo || '').trim().toUpperCase().match(/^R[0-5]$/)?.[0] || 'R0';
    const key = selected.toLowerCase(); const active = selected === stored;
    const company = row[`${key}company`] || (active ? row.roundcompany : '') || ''; const submitted = row[`${key}submitcompany`] || (active ? row.roundsubmitcompany : '') || ''; const start = row[`${key}startdate`] || (active ? row.roundstartdate : '') || ''; const finish = row[`${key}finishdate`] || (active ? row.roundfinishdate : '') || '';
    const setText = (field, value) => { const cell = tr.querySelector(`td[data-key="${field}"]`); if (cell) cell.textContent = String(value ?? ''); };
    setText('roundcompany', company); setText('roundsubmitcompany', submitted); setText('roundstartdate', formatDate(start)); setText('roundfinishdate', formatDate(finish)); setText('finalvendorlist', company && start && finish ? company : ''); setText('finalsubmitvendor', submitted);
  };
  window.updateRoundPO = window.updateRoundPR;
})();

/* ===== END ORIGINAL: procurement-action-bridge-v354-hotfix1.js ===== */

/* ===== BEGIN ORIGINAL: procurement-buyer-allclear-v358.js ===== */
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

/* ===== END ORIGINAL: procurement-buyer-allclear-v358.js ===== */
