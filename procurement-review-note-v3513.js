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
