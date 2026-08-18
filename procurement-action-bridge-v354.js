/* ======================================================
   PROCUREMENT ACTION + MULTI-USER BRIDGE
   Release 3.5.4
   - Restores Procurement inline Action handlers without rewriting stable core.
   - Auto-retries only Buyer-scoped Smart Import after a revision conflict.
   - Never auto-retries full-sheet BATCH_REPLACE mutations.
   - Keeps USER/read-only permissions enforced by the existing MSW auth layer.
====================================================== */
(function installProcurementActionBridge(){
  'use strict';
  if (window.__MSW_PROCUREMENT_ACTION_BRIDGE_V354__) return;
  window.__MSW_PROCUREMENT_ACTION_BRIDGE_V354__ = true;

  const MODULE_ID = 'procurementAdmin';
  const SHEET_NAME = 'Admin';
  const CACHE_KEY = 'MSW_PROCUREMENT_CACHE';
  const BUYER_SAFE_RETRY_ACTION = 'BATCH_IMPORT_PROCUREMENT_BY_BUYER';

  function gasUrl(){ return String(window.APP_CONFIG?.GAS_URL || '').trim(); }
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
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3800);
  }

  function parseJsonBody(body){ if (typeof body !== 'string') return null; try { return JSON.parse(body); } catch (_) { return null; } }
  async function readJsonResponse(response){ try { const text = await response.clone().text(); if (!text || /^\s*</.test(text)) return null; return JSON.parse(text); } catch (_) { return null; } }
  function isRevisionConflict(payload){
    if (!payload || payload.success !== false) return false;
    const message = String(payload.message || '').toLowerCase();
    return Boolean(payload.conflict) || message.includes('berubah sejak halaman dibuka') || message.includes('revision conflict') || message.includes('revision berubah') || (message.includes('revision') && message.includes('muat ulang'));
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

  function clearPerformanceNetworkCache(){ try { const keys = []; for (let i = 0; i < localStorage.length; i++) { const key = String(localStorage.key(i) || ''); if (key.startsWith('MSW_NET_CACHE_V1_')) keys.push(key); } keys.forEach(key => localStorage.removeItem(key)); } catch (_) {} }

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
      if (!response.ok || result?.success === false) throw new Error(result?.message || `Google Sheet gagal diperbarui (HTTP ${response.status}).`);
      if (result?.queued || result?.pendingSync) { notify('All Clear tersimpan sebagai Pending Sync dan akan dijalankan saat koneksi tersedia.', 'info'); return; }
      try { window.MSW?.cache?.remove?.(CACHE_KEY); } catch (_) {}
      clearPerformanceNetworkCache();
      notify('Semua data Procurement berhasil dihapus.', 'success');
      setTimeout(() => window.location.reload(), 450);
    } catch (error) { console.error('All Clear gagal:', error); notify(`All Clear gagal: ${error?.message || error}`, 'error'); }
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
