/*
 * SHADOW CONSOLIDATION BUNDLE — NOT LOADED BY PRODUCTION
 * Generated from active files without refactoring.
 * Source order is preserved exactly as listed below.
 * Do not reference this bundle until regression verification passes.
 * Sources:
 * - procurement-review-rules-v359.js
 * - procurement-review-note-fast-v3514.js
 * - procurement-review-note-v3513.js
 * - procurement-review-export-v3514.js
 */

/* ===== BEGIN ORIGINAL: procurement-review-rules-v359.js ===== */
/* ======================================================
   PROCUREMENT REVIEW DISPLAY RULES — Release 3.5.9
   Presentation-only adapter for the root Procurement Review table.

   Rules:
   - Finish Date appears only when Flow Process is exactly RFQ.
   - Finish Date comes from the last/current Round PR Finish Date.
   - Requirement Date appears only when Flow Process contains "Completed"
     anywhere in the text and uses Actual PO Del. Date.
   - Adds Status Rebid derived only from the last/current Round PR.
   - Does not modify Procurement Admin source data or backend behavior.
====================================================== */
(function installProcurementReviewRulesV359(){
  'use strict';
  if (window.__MSW_PROCUREMENT_REVIEW_RULES_V359__) return;
  window.__MSW_PROCUREMENT_REVIEW_RULES_V359__ = true;

  const ROUND_LIST = ['R0','R1','R2','R3','R4','R5'];
  const REVIEW_COLUMN_COUNT = 10;

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function valueOf(row, aliases){
    try {
      if (typeof window.smartGetField === 'function') {
        const value = window.smartGetField(row, aliases);
        if (value !== undefined && value !== null && text(value) !== '') return value;
      }
    } catch (_) {}
    if (!row || typeof row !== 'object') return '';
    for (const key of aliases) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        const value = row[key];
        if (value !== undefined && value !== null && text(value) !== '') return value;
      }
    }
    return '';
  }

  function flowOf(row){
    return text(valueOf(row, ['flowprocess', 'Flow Process']));
  }

  function normalizedFlow(row){
    return flowOf(row).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function normalizeRound(value){
    const match = text(value).toUpperCase().match(/R\s*([0-5])/);
    return match ? `R${match[1]}` : '';
  }

  function roundField(row, round, suffix){
    const lower = round.toLowerCase();
    const label = suffix === 'company' ? 'Company'
      : suffix === 'submitcompany' ? 'Submit Company'
      : suffix === 'finishdate' ? 'Finish Date'
      : suffix === 'startdate' ? 'Start Date'
      : suffix;
    return valueOf(row, [
      `${lower}${suffix}`,
      `${round} ${label}`,
      `${round}${label.replace(/\s+/g, '')}`
    ]);
  }

  function lastRoundInfo(row){
    const declared = normalizeRound(valueOf(row, ['roundpo', 'roundpr', 'Round PR', 'Round PO']));
    if (declared) return { round: declared, found: true };

    const statusRound = normalizeRound(valueOf(row, ['statusrebid', 'Status Rebid']));
    if (statusRound) return { round: statusRound, found: true };

    let latest = '';
    ROUND_LIST.forEach(round => {
      const hasRoundData = ['company','submitcompany','startdate','finishdate']
        .some(suffix => text(roundField(row, round, suffix)) !== '');
      if (hasRoundData) latest = round;
    });
    return { round: latest || 'R0', found: Boolean(latest) };
  }

  function parseDate(value){
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = text(value);
    if (!raw) return null;

    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
      const date = new Date((numeric - 25569) * 86400000);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    try {
      if (typeof window.overviewParseDate === 'function') {
        const parsed = window.overviewParseDate(raw);
        if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed;
      }
    } catch (_) {}

    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function formatDate(value){
    const date = parseDate(value);
    if (!date) return text(value);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function splitVendors(value){
    const seen = new Set();
    return text(value)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split(/\n|;/)
      .map(item => item.trim())
      .filter(item => {
        const key = item.toLocaleLowerCase('id');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function reviewFinishDate(row){
    // Exact RFQ only. "Completed RFQ", "RFQ Completed", CQS, Create BL, etc. stay blank.
    if (normalizedFlow(row) !== 'rfq') return '';
    const info = lastRoundInfo(row);
    if (!info.found) return '';
    return formatDate(roundField(row, info.round, 'finishdate'));
  }

  function reviewRequirementDate(row){
    // Completed may be at the beginning, middle, or end of Flow Process.
    if (!/completed/i.test(flowOf(row))) return '';
    return formatDate(valueOf(row, [
      'actualpodeldate',
      'Actual PO Del. Date',
      'Actual PO Delivery Date'
    ]));
  }

  function reviewStatusRebid(row){
    const info = lastRoundInfo(row);
    if (!info.found) return '';
    const invited = splitVendors(roundField(row, info.round, 'company'));
    const submitted = splitVendors(roundField(row, info.round, 'submitcompany'));
    const finish = formatDate(roundField(row, info.round, 'finishdate'));
    return [
      info.round,
      `${submitted.length} of ${invited.length}`,
      finish
    ].filter(Boolean).join(' / ');
  }

  function reviewValues(row){
    const coreText = (aliases) => text(valueOf(row, aliases));
    const procurementName = typeof window.overviewProcurementName === 'function'
      ? window.overviewProcurementName(row)
      : coreText(['Description']);
    const status = typeof window.overviewStatus === 'function'
      ? window.overviewStatus(row)
      : coreText(['statuspr', 'Status PR', 'Status']);

    return [
      coreText(['noPR', 'No PR', 'PR Number']),
      procurementName,
      coreText(['ownerName', 'Owner Name', 'Buyer (Ditambahkan)', 'buyer', 'Buyer', 'Buyer Name', 'Signature Buyer', 'ownerEmail', 'Owner Email']),
      coreText(['pic', 'PIC']),
      status,
      flowOf(row),
      reviewFinishDate(row),
      reviewRequirementDate(row),
      reviewStatusRebid(row),
      coreText(['notebuyer', 'Note Buyer', 'Buyer Note', 'Note'])
    ];
  }

  function ensureFilterSlots(){
    try {
      if (Array.isArray(PROCUREMENT_REVIEW_FILTERS)) {
        while (PROCUREMENT_REVIEW_FILTERS.length < REVIEW_COLUMN_COUNT) PROCUREMENT_REVIEW_FILTERS.push('');
      }
    } catch (_) {}
  }

  function installReviewValueOverride(){
    if (typeof window.overviewReviewValues !== 'function') return false;
    window.overviewReviewValues = reviewValues;
    return true;
  }

  function ensureHeader(){
    const headerRow = document.querySelector('#procurementReviewPanel .procurement-overview-table thead tr');
    if (!headerRow) return false;

    const headers = Array.from(headerRow.querySelectorAll('th'));
    const noteHeader = headers.find(th => /^\s*Note\s*$/i.test(th.querySelector('span')?.textContent || th.textContent || ''));
    if (!noteHeader) return false;

    const noteFilter = noteHeader.querySelector('[data-procurement-filter-button]');
    if (noteFilter) {
      noteFilter.dataset.procurementFilterButton = '9';
      noteFilter.setAttribute('aria-label', 'Filter Note');
      noteFilter.title = 'Filter Note';
    }

    if (!headerRow.querySelector('[data-msw-review-status-rebid]')) {
      const th = document.createElement('th');
      th.dataset.mswReviewStatusRebid = 'true';
      th.innerHTML = '<span>Status Rebid</span><button type="button" class="procurement-header-filter" data-procurement-filter-button="8" aria-label="Filter Status Rebid" title="Filter Status Rebid"><i data-lucide="filter"></i></button>';
      headerRow.insertBefore(th, noteHeader);
      try { window.lucide?.createIcons?.(); } catch (_) {}
    }
    return true;
  }

  function fixStateColspan(){
    document.querySelectorAll('#procurementOverviewRows td.procurement-overview-state').forEach(cell => {
      cell.colSpan = REVIEW_COLUMN_COUNT;
    });
  }

  function refreshReview(){
    ensureFilterSlots();
    ensureHeader();
    fixStateColspan();
    try {
      if (typeof window.renderProcurementReviewPage === 'function') window.renderProcurementReviewPage();
    } catch (error) {
      console.warn('Procurement Review v3.5.9 rerender skipped:', error);
    }
    fixStateColspan();
  }

  function install(){
    if (!installReviewValueOverride()) return false;
    ensureFilterSlots();
    ensureHeader();

    const body = document.getElementById('procurementOverviewRows');
    if (body && !body.__MSW_REVIEW_V359_OBSERVER__) {
      body.__MSW_REVIEW_V359_OBSERVER__ = true;
      new MutationObserver(fixStateColspan).observe(body, { childList: true, subtree: true });
    }

    // Core resets the filter array to 9 slots when Procurement Year changes.
    // Restore the new Status Rebid slot after that existing handler completes.
    document.addEventListener('click', event => {
      if (!event.target.closest?.('[data-procurement-overview-year]')) return;
      queueMicrotask(() => {
        ensureFilterSlots();
        ensureHeader();
      });
    }, true);

    refreshReview();
    window.MSW_PROCUREMENT_REVIEW_RULES_V359 = Object.freeze({
      reviewFinishDate,
      reviewRequirementDate,
      reviewStatusRebid,
      lastRoundInfo
    });
    return true;
  }

  if (!install()) {
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (install() || tries > 120) window.clearInterval(timer);
    }, 50);
  }
})();

/* ===== END ORIGINAL: procurement-review-rules-v359.js ===== */

/* ===== BEGIN ORIGINAL: procurement-review-note-fast-v3514.js ===== */
/* ======================================================
   PROCUREMENT REVIEW FAST NOTE BRIDGE — Release 3.5.14

   Intercepts ONLY the note-only Procurement Review EDIT payload and upgrades it
   to UPDATE_PROCUREMENT_NOTE. If the deployed Apps Script does not support the
   new lightweight action yet, it safely falls back to the existing EDIT action.
   No other Procurement edit request is changed.
====================================================== */
(function installProcurementReviewFastNoteBridgeV3514(){
  'use strict';
  if (window.__MSW_PROCUREMENT_REVIEW_FAST_NOTE_V3514__) return;
  window.__MSW_PROCUREMENT_REVIEW_FAST_NOTE_V3514__ = true;
  if (document.body?.dataset?.mswPage !== 'main-menu') return;

  const previousFetch = window.fetch.bind(window);

  function text(value){ return String(value == null ? '' : value).trim(); }

  function parseBody(init){
    if (!init || String(init.method || 'GET').toUpperCase() !== 'POST') return null;
    if (typeof init.body !== 'string') return null;
    try { return JSON.parse(init.body); } catch (_) { return null; }
  }

  function isNoteOnlyEdit(body){
    if (!body || text(body.action).toUpperCase() !== 'EDIT') return false;
    if (text(body.sheet || 'Admin').toUpperCase() !== 'ADMIN') return false;
    const data = body.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const allowed = new Set(['procurementId','Procurement ID','__version','version','Version','note','Note']);
    const keys = Object.keys(data);
    if (!keys.length || !keys.some(key => key === 'note' || key === 'Note')) return false;
    if (!keys.every(key => allowed.has(key))) return false;
    return Boolean(text(data.procurementId || data['Procurement ID']));
  }

  function fastPayload(body){
    const data = body.data || {};
    return {
      action: 'UPDATE_PROCUREMENT_NOTE',
      sheet: body.sheet || 'Admin',
      authToken: body.authToken || '',
      procurementId: data.procurementId || data['Procurement ID'] || '',
      expectedVersion: data.__version ?? data.version ?? data.Version ?? 0,
      note: data.note ?? data.Note ?? ''
    };
  }

  async function responseJson(response){
    try { return JSON.parse(await response.clone().text()); }
    catch (_) { return null; }
  }

  function unsupported(result){
    if (!result || result.success !== false) return false;
    return /action atau payload tidak dikenali|unknown action|update_procurement_note.*tidak/i.test(String(result.message || ''));
  }

  window.fetch = async function(input, init){
    const body = parseBody(init);
    if (!isNoteOnlyEdit(body)) return previousFetch(input, init);

    const upgradedInit = Object.assign({}, init, {body: JSON.stringify(fastPayload(body))});
    try {
      const fastResponse = await previousFetch(input, upgradedInit);
      const result = await responseJson(fastResponse);
      if (!unsupported(result)) return fastResponse;
    } catch (_) {
      // Backend lama / deployment belum mendukung action baru: fallback di bawah.
    }

    return previousFetch(input, init);
  };
})();

/* ===== END ORIGINAL: procurement-review-note-fast-v3514.js ===== */

/* ===== BEGIN ORIGINAL: procurement-review-note-v3513.js ===== */
/* ======================================================
   PROCUREMENT REVIEW NOTE EDITOR — Release 3.5.13

   - Click No PR in Procurement Review to edit the same Admin-sheet Note field.
   - Uses existing partial EDIT action, so unrelated Procurement fields stay intact.
   - BUYER ownership and SUPER_ADMIN permissions remain enforced by backend.
   - Sends row Version to preserve optimistic concurrency protection.
====================================================== */
(function installProcurementReviewNoteV3513(){
  'use strict';
  if (window.__MSW_PROCUREMENT_REVIEW_NOTE_V3513__) return;
  window.__MSW_PROCUREMENT_REVIEW_NOTE_V3513__ = true;
  if (document.body?.dataset?.mswPage !== 'main-menu') return;

  let activeRow = null;
  let saving = false;

  function text(value){ return String(value == null ? '' : value).trim(); }

  function valueOf(row, aliases){
    if (!row || typeof row !== 'object') return '';
    try {
      if (typeof window.smartGetField === 'function') {
        const value = window.smartGetField(row, aliases);
        if (value !== undefined && value !== null && text(value) !== '') return value;
      }
    } catch (_) {}
    for (const key of aliases) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
      const value = row[key];
      if (value !== undefined && value !== null && text(value) !== '') return value;
    }
    return '';
  }

  function authToken(){
    try {
      if (typeof window.MSW_GET_AUTH_TOKEN === 'function') return text(window.MSW_GET_AUTH_TOKEN());
      if (typeof getStoredAuthToken === 'function') return text(getStoredAuthToken());
    } catch (_) {}
    return text(sessionStorage.getItem('MSW_AUTH_TOKEN') || localStorage.getItem('MSW_AUTH_TOKEN'));
  }

  function ensureUi(){
    if (document.getElementById('mswReviewNoteModal')) return;

    const style = document.createElement('style');
    style.id = 'mswReviewNoteStyleV3513';
    style.textContent = `
      .msw-review-pr-note-btn{appearance:none;border:0;background:transparent;padding:0;color:#075985;font:inherit;cursor:pointer;text-decoration:none;text-align:left}
      .msw-review-pr-note-btn:hover,.msw-review-pr-note-btn:focus-visible{color:#0369a1;text-decoration:underline;outline:none}
      #mswReviewNoteModal{position:fixed;inset:0;z-index:2147482500;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.48);backdrop-filter:blur(2px)}
      #mswReviewNoteModal[hidden]{display:none!important}
      .msw-review-note-card{width:min(560px,96vw);background:#fff;border:1px solid #cbd5e1;border-radius:14px;box-shadow:0 22px 65px rgba(15,23,42,.28);overflow:hidden}
      .msw-review-note-head{padding:16px 18px 12px;border-bottom:1px solid #e2e8f0}
      .msw-review-note-head h3{margin:0;color:#0f172a;font-size:17px;font-weight:800}
      .msw-review-note-head p{margin:4px 0 0;color:#64748b;font-size:12px}
      .msw-review-note-body{padding:16px 18px}
      #mswReviewNoteText{width:100%;min-height:130px;resize:vertical;border:1px solid #cbd5e1;border-radius:9px;padding:10px 12px;font:inherit;font-size:13px;line-height:1.5;outline:none}
      #mswReviewNoteText:focus{border-color:#0284c7;box-shadow:0 0 0 3px rgba(14,165,233,.12)}
      #mswReviewNoteStatus{min-height:18px;margin-top:7px;font-size:11px;color:#64748b}
      #mswReviewNoteStatus.error{color:#b91c1c}#mswReviewNoteStatus.ok{color:#047857}
      .msw-review-note-actions{display:flex;justify-content:flex-end;gap:8px;padding:0 18px 16px}
      .msw-review-note-actions button{border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer}
      #mswReviewNoteCancel{border:1px solid #cbd5e1;background:#fff;color:#334155}
      #mswReviewNoteSave{border:1px solid #0284c7;background:#0284c7;color:#fff}
      #mswReviewNoteSave:disabled,#mswReviewNoteCancel:disabled{opacity:.55;cursor:not-allowed}
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'mswReviewNoteModal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="msw-review-note-card" role="dialog" aria-modal="true" aria-labelledby="mswReviewNoteTitle">
        <div class="msw-review-note-head">
          <h3 id="mswReviewNoteTitle">Procurement Note</h3>
          <p id="mswReviewNotePr">No PR: -</p>
        </div>
        <div class="msw-review-note-body">
          <textarea id="mswReviewNoteText" placeholder="Isi catatan untuk Procurement ini..."></textarea>
          <div id="mswReviewNoteStatus" aria-live="polite"></div>
        </div>
        <div class="msw-review-note-actions">
          <button type="button" id="mswReviewNoteCancel">Batal</button>
          <button type="button" id="mswReviewNoteSave">Simpan Note</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('mswReviewNoteCancel')?.addEventListener('click', closeModal);
    document.getElementById('mswReviewNoteSave')?.addEventListener('click', saveNote);
    modal.addEventListener('pointerdown', event => { if (event.target === modal) closeModal(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.hidden && !saving) closeModal();
    });
  }

  function setStatus(message, kind){
    const el = document.getElementById('mswReviewNoteStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = kind || '';
  }

  function setBusy(value){
    saving = Boolean(value);
    const save = document.getElementById('mswReviewNoteSave');
    const cancel = document.getElementById('mswReviewNoteCancel');
    const textarea = document.getElementById('mswReviewNoteText');
    if (save) { save.disabled = saving; save.textContent = saving ? 'Menyimpan...' : 'Simpan Note'; }
    if (cancel) cancel.disabled = saving;
    if (textarea) textarea.disabled = saving;
  }

  function openModal(row){
    ensureUi();
    const modal = document.getElementById('mswReviewNoteModal');
    const pr = text(valueOf(row, ['noPR','No PR','PR Number']));
    const note = text(valueOf(row, ['note','Note','notebuyer','Note Buyer','Buyer Note']));
    activeRow = row;
    document.getElementById('mswReviewNotePr').textContent = `No PR: ${pr || '-'}`;
    document.getElementById('mswReviewNoteText').value = note;
    setStatus('Note ini tersimpan pada data Procurement yang sama.', '');
    setBusy(false);
    modal.hidden = false;
    requestAnimationFrame(() => document.getElementById('mswReviewNoteText')?.focus({preventScroll:true}));
  }

  function closeModal(){
    if (saving) return;
    const modal = document.getElementById('mswReviewNoteModal');
    if (modal) modal.hidden = true;
    activeRow = null;
    setStatus('', '');
  }

  function updateRowObject(row, note, version){
    if (!row || typeof row !== 'object') return;
    row.note = note;
    row.Note = note;
    if (Object.prototype.hasOwnProperty.call(row, 'notebuyer')) row.notebuyer = note;
    if (Object.prototype.hasOwnProperty.call(row, 'Note Buyer')) row['Note Buyer'] = note;
    if (version != null && Number.isFinite(Number(version))) {
      row.version = Number(version);
      row.Version = Number(version);
    }
  }

  function updateKnownRows(identity, note, version){
    const targetId = text(identity.procurementId);
    const targetPr = text(identity.noPR);
    const collections = [];
    try { if (Array.isArray(PROCUREMENT_OVERVIEW_SOURCE_ROWS)) collections.push(PROCUREMENT_OVERVIEW_SOURCE_ROWS); } catch (_) {}
    try { if (Array.isArray(PROCUREMENT_REVIEW_ROWS)) collections.push(PROCUREMENT_REVIEW_ROWS); } catch (_) {}

    collections.forEach(rows => rows.forEach(row => {
      const rowId = text(valueOf(row, ['procurementId','Procurement ID']));
      const rowPr = text(valueOf(row, ['noPR','No PR','PR Number']));
      if ((targetId && rowId === targetId) || (!targetId && targetPr && rowPr === targetPr)) updateRowObject(row, note, version);
    }));

    try {
      const cache = window.MSW?.cache?.load?.('MSW_PROCUREMENT_CACHE');
      if (Array.isArray(cache)) {
        let changed = false;
        cache.forEach(row => {
          const rowId = text(valueOf(row, ['procurementId','Procurement ID']));
          const rowPr = text(valueOf(row, ['noPR','No PR','PR Number']));
          if ((targetId && rowId === targetId) || (!targetId && targetPr && rowPr === targetPr)) {
            updateRowObject(row, note, version);
            changed = true;
          }
        });
        if (changed) window.MSW?.cache?.save?.('MSW_PROCUREMENT_CACHE', cache);
      }
    } catch (_) {}
  }

  async function saveNote(){
    if (!activeRow || saving) return;
    const noPR = text(valueOf(activeRow, ['noPR','No PR','PR Number']));
    const procurementId = text(valueOf(activeRow, ['procurementId','Procurement ID']));
    const versionRaw = valueOf(activeRow, ['version','Version']);
    const version = Number(versionRaw || 0);
    const note = String(document.getElementById('mswReviewNoteText')?.value || '').trim();

    if (!noPR) return setStatus('No PR tidak tersedia pada record ini.', 'error');
    if (!procurementId) return setStatus('Procurement ID belum tersedia. Buka Procurement sekali untuk memigrasikan identitas record.', 'error');

    const token = authToken();
    if (!token) return setStatus('Sesi login tidak ditemukan. Silakan login ulang.', 'error');

    setBusy(true);
    setStatus('Menyimpan Note ke Procurement Admin...', '');
    try {
      const response = await fetch(String(window.APP_CONFIG?.GAS_URL || ''), {
        method: 'POST',
        headers: {'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify({
          action: 'EDIT',
          sheet: 'Admin',
          originalPR: noPR,
          authToken: token,
          data: {
            procurementId,
            __version: Number.isFinite(version) ? version : 0,
            note
          }
        })
      });
      const raw = await response.text();
      let result;
      try { result = JSON.parse(raw); }
      catch (_) { throw new Error('Server mengembalikan respons yang tidak valid.'); }

      if (!result?.success) {
        if (result?.conflict) throw new Error(result.message || 'Data berubah di perangkat lain. Muat ulang lalu coba lagi.');
        throw new Error(result?.message || 'Note gagal disimpan.');
      }

      updateKnownRows({procurementId, noPR}, note, result.version);
      activeRow = null;
      const modal = document.getElementById('mswReviewNoteModal');
      if (modal) modal.hidden = true;
      setBusy(false);
      try { if (typeof window.renderProcurementReviewPage === 'function') window.renderProcurementReviewPage(); } catch (_) {}
    } catch (error) {
      setBusy(false);
      setStatus(error?.message || String(error), 'error');
    }
  }

  function currentPageRows(){
    try {
      if (!Array.isArray(PROCUREMENT_REVIEW_ROWS) || typeof overviewReviewValues !== 'function') return [];
      const filters = Array.isArray(PROCUREMENT_REVIEW_FILTERS) ? PROCUREMENT_REVIEW_FILTERS : [];
      const filtered = PROCUREMENT_REVIEW_ROWS.filter(row => overviewReviewValues(row).every((value, index) =>
        !filters[index] || String(value || '').toLowerCase().includes(filters[index])
      ));
      const size = Number(PROCUREMENT_REVIEW_PAGE_SIZE || 10) || 10;
      const page = Math.max(1, Number(PROCUREMENT_REVIEW_PAGE || 1) || 1);
      const start = (page - 1) * size;
      return filtered.slice(start, start + size);
    } catch (_) {
      return [];
    }
  }

  function decorateRows(){
    const body = document.getElementById('procurementOverviewRows');
    if (!body) return;
    const rows = currentPageRows();
    const trs = Array.from(body.querySelectorAll('tr')).filter(tr => !tr.querySelector('.procurement-overview-state'));
    trs.forEach((tr, index) => {
      const row = rows[index];
      const cell = tr.cells?.[0];
      if (!row || !cell || cell.querySelector('.msw-review-pr-note-btn')) return;
      const pr = text(valueOf(row, ['noPR','No PR','PR Number'])) || text(cell.textContent);
      cell.textContent = '';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'msw-review-pr-note-btn';
      button.textContent = pr || '-';
      button.title = 'Klik untuk isi / edit Note Procurement';
      button.setAttribute('aria-label', `Edit Note ${pr || 'Procurement'}`);
      button.addEventListener('click', () => openModal(row));
      cell.appendChild(button);
    });
  }

  function wrapRenderer(){
    if (typeof window.renderProcurementReviewPage !== 'function') return false;
    if (window.renderProcurementReviewPage.__MSW_NOTE_V3513__) return true;
    const original = window.renderProcurementReviewPage;
    const wrapped = function(){
      const result = original.apply(this, arguments);
      queueMicrotask(decorateRows);
      return result;
    };
    wrapped.__MSW_NOTE_V3513__ = true;
    window.renderProcurementReviewPage = wrapped;
    decorateRows();
    return true;
  }

  function install(){
    ensureUi();
    if (!wrapRenderer()) return false;
    const body = document.getElementById('procurementOverviewRows');
    if (body && !body.__MSW_NOTE_OBSERVER_V3513__) {
      body.__MSW_NOTE_OBSERVER_V3513__ = true;
      new MutationObserver(() => queueMicrotask(decorateRows)).observe(body, {childList:true, subtree:false});
    }
    return true;
  }

  if (!install()) {
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (install() || tries > 160) window.clearInterval(timer);
    }, 50);
  }
})();

/* ===== END ORIGINAL: procurement-review-note-v3513.js ===== */

/* ===== BEGIN ORIGINAL: procurement-review-export-v3514.js ===== */
/* ======================================================
   PROCUREMENT REVIEW PRINT / EXPORT — Release 3.5.14

   - Adds Print and Export Excel actions to Procurement Review.
   - Exports the entire currently filtered Review result, not only page 1.
   - Respects Buyer/year/column filters already applied by the Review core.
   - Uses the same 10 visible Review columns, including Status Rebid and Note.
   - Does not mutate Procurement source data.
====================================================== */
(function installProcurementReviewExportV3514(){
  'use strict';
  if (window.__MSW_PROCUREMENT_REVIEW_EXPORT_V3514__) return;
  window.__MSW_PROCUREMENT_REVIEW_EXPORT_V3514__ = true;
  if (document.body?.dataset?.mswPage !== 'main-menu') return;

  const HEADERS = [
    'No PR','Procurement','Buyer','Requestor','Status','Flow Process',
    'Finish Date','Requirement Date','Status Rebid','Note'
  ];

  function text(value){ return String(value == null ? '' : value).trim(); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[ch]);
  }

  function filteredRows(){
    try {
      if (!Array.isArray(PROCUREMENT_REVIEW_ROWS) || typeof overviewReviewValues !== 'function') return [];
      const filters = Array.isArray(PROCUREMENT_REVIEW_FILTERS) ? PROCUREMENT_REVIEW_FILTERS : [];
      return PROCUREMENT_REVIEW_ROWS.filter(row => {
        const values = overviewReviewValues(row);
        return values.every((value, index) => !filters[index] || String(value || '').toLowerCase().includes(filters[index]));
      });
    } catch (_) {
      return [];
    }
  }

  function rowsAsValues(){
    return filteredRows().map(row => overviewReviewValues(row).map(value => text(value)));
  }

  function currentContext(){
    let year = 'ALL';
    let buyer = 'ALL';
    try { year = text(PROCUREMENT_OVERVIEW_YEAR || 'ALL') || 'ALL'; } catch (_) {}
    try { buyer = text(PROCUREMENT_OVERVIEW_BUYER || 'ALL') || 'ALL'; } catch (_) {}
    return {year, buyer};
  }

  function safeFilePart(value){
    return text(value).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'ALL';
  }

  async function exportExcel(){
    const values = rowsAsValues();
    if (!values.length) {
      window.alert('Tidak ada data Procurement Review sesuai filter saat ini.');
      return;
    }

    if (typeof window.MSW_ENSURE_XLSX === 'function') await window.MSW_ENSURE_XLSX();
    if (!window.XLSX) throw new Error('Library Excel belum tersedia.');

    const context = currentContext();
    const aoa = [HEADERS, ...values];
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      {wch:24},{wch:48},{wch:28},{wch:24},{wch:12},{wch:22},
      {wch:16},{wch:18},{wch:30},{wch:55}
    ];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Procurement Review');
    const date = new Date().toISOString().slice(0,10);
    window.XLSX.writeFile(wb, `Procurement_Review_${safeFilePart(context.year)}_${date}.xlsx`);
  }

  function printReview(){
    const values = rowsAsValues();
    if (!values.length) {
      window.alert('Tidak ada data Procurement Review sesuai filter saat ini.');
      return;
    }

    const context = currentContext();
    const body = values.map(row => `<tr>${row.map(value => `<td>${esc(value || '-')}</td>`).join('')}</tr>`).join('');
    const header = HEADERS.map(value => `<th>${esc(value)}</th>`).join('');
    const generated = new Date().toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const popup = window.open('', '_blank');
    if (!popup) {
      window.alert('Popup print diblokir browser. Izinkan popup untuk portal ini lalu coba lagi.');
      return;
    }
    try { popup.opener = null; } catch (_) {}
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Procurement Review</title><style>
      @page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;margin:0;font-size:8.5px}
      h1{font-size:16px;margin:0 0 3px}p{margin:0 0 8px;color:#475569;font-size:9px}.meta{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px}
      table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #cbd5e1;padding:4px 5px;vertical-align:top;white-space:pre-wrap;word-break:break-word}
      th{background:#163f6d;color:#fff;font-weight:700;text-align:left}tbody tr:nth-child(even){background:#f8fafc}
      .footer{margin-top:6px;color:#64748b;font-size:8px}@media print{button{display:none}}
    </style></head><body>
      <h1>Procurement Review</h1>
      <div class="meta"><span><b>Year:</b> ${esc(context.year)}</span><span><b>Buyer:</b> ${esc(context.buyer)}</span><span><b>Rows:</b> ${values.length}</span><span><b>Generated:</b> ${esc(generated)}</span></div>
      <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
      <div class="footer">PT Makmur Sejahtera Wisesa — Procurement Division</div>
      <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},100);});<\/script>
    </body></html>`);
    popup.document.close();
  }

  function style(){
    if (document.getElementById('mswProcurementReviewExportStyleV3514')) return;
    const el = document.createElement('style');
    el.id = 'mswProcurementReviewExportStyleV3514';
    el.textContent = `
      #mswProcurementReviewActions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap;margin:6px 0 10px}
      #mswProcurementReviewActions button{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px;padding:6px 10px;font:inherit;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
      #mswProcurementReviewActions button:hover{background:#f8fafc;border-color:#94a3b8}
      #mswProcurementReviewActions .msw-review-export-primary{background:#0f766e;border-color:#0f766e;color:#fff}
      #mswProcurementReviewActions .msw-review-export-primary:hover{background:#115e59}
      @media(max-width:700px){#mswProcurementReviewActions{width:100%;justify-content:flex-end}}
    `;
    document.head.appendChild(el);
  }

  function installActions(){
    const title = document.getElementById('procurementOverviewTitle');
    const panel = document.getElementById('procurementReviewPanel') || document.getElementById('procurementAdminOverview');
    if (!title || !panel) return false;
    if (document.getElementById('mswProcurementReviewActions')) return true;
    style();

    const actions = document.createElement('div');
    actions.id = 'mswProcurementReviewActions';
    actions.innerHTML = `
      <button type="button" id="mswProcurementReviewPrint" title="Print seluruh data sesuai filter">Print</button>
      <button type="button" id="mswProcurementReviewExcel" class="msw-review-export-primary" title="Export seluruh data sesuai filter ke Excel">Export Excel</button>`;

    const host = title.parentElement;
    if (!host) return false;
    title.insertAdjacentElement('afterend', actions);

    document.getElementById('mswProcurementReviewPrint')?.addEventListener('click', printReview);
    document.getElementById('mswProcurementReviewExcel')?.addEventListener('click', () => exportExcel().catch(error => window.alert(error?.message || 'Export Excel gagal.')));
    return true;
  }

  if (!installActions()) {
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (installActions() || tries > 160) window.clearInterval(timer);
    }, 50);
  }

  window.MSW_PROCUREMENT_REVIEW_EXPORT_V3514 = Object.freeze({filteredRows, exportExcel, printReview});
})();

/* ===== END ORIGINAL: procurement-review-export-v3514.js ===== */
