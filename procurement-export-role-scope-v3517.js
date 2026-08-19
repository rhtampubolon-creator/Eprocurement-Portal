/* ======================================================
   PROCUREMENT EXPORT ROLE SCOPE — Release 3.5.17

   Shared rule for Procurement exports / print:
   - BUYER: only rows owned by the logged-in Buyer.
   - SUPER_ADMIN: all Buyer rows.
   - Year remains a reporting period filter.
   - Buyer selector / column filters do not silently reduce or widen export scope.
====================================================== */
(function installProcurementExportRoleScopeV3517(){
  'use strict';
  if (window.__MSW_PROCUREMENT_EXPORT_ROLE_SCOPE_V3517__) return;
  window.__MSW_PROCUREMENT_EXPORT_ROLE_SCOPE_V3517__ = true;

  const CACHE_KEY = 'MSW_PROCUREMENT_CACHE';
  const REVIEW_HEADERS = [
    'No PR','Procurement','Buyer','Requestor','Status','Flow Process',
    'Finish Date','Requirement Date','Status Rebid','Note'
  ];

  function text(value){ return String(value == null ? '' : value).trim(); }
  function normalizeRole(value){ return text(value).toUpperCase().replace(/[\s-]+/g, '_'); }
  function normalizeName(value){ return text(value).toLocaleLowerCase('id').replace(/\s+/g, ' '); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[ch]);
  }
  function profile(){
    try { return window.MSW?.auth?.getProfile?.() || window.ACTIVE_PROFILE || null; }
    catch (_) { return window.ACTIVE_PROFILE || null; }
  }
  function role(){
    try { return normalizeRole(window.MSW?.auth?.getRole?.() || profile()?.role || ''); }
    catch (_) { return normalizeRole(profile()?.role || ''); }
  }
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
  function ownerEmail(row){
    return text(valueOf(row, ['ownerEmail','Owner Email','buyerEmail','Buyer Email'])).toLowerCase();
  }
  function ownerName(row){
    return normalizeName(valueOf(row, [
      'ownerName','Owner Name','Buyer (Ditambahkan)','buyer','Buyer','Buyer Name','Signature Buyer'
    ]));
  }
  function activeIdentity(){
    const p = profile() || {};
    return {
      role: role(),
      email: text(p.email || p.userEmail || '').toLowerCase(),
      name: normalizeName(p.name || p.fullName || p.displayName || '')
    };
  }
  function belongsToBuyer(row, identity){
    const rowEmail = ownerEmail(row);
    if (rowEmail) return Boolean(identity.email && rowEmail === identity.email);
    const rowName = ownerName(row);
    return Boolean(rowName && identity.name && rowName === identity.name);
  }
  function scopeRows(rows){
    const source = Array.isArray(rows) ? rows : [];
    const identity = activeIdentity();
    if (identity.role === 'SUPER_ADMIN') return source.slice();
    if (identity.role !== 'BUYER') return source.slice();
    if (!identity.email && !identity.name) return [];
    return source.filter(row => belongsToBuyer(row, identity));
  }
  function scopeLabel(){
    const identity = activeIdentity();
    if (identity.role === 'SUPER_ADMIN') return 'ALL BUYERS';
    if (identity.role === 'BUYER') return text(profile()?.name || profile()?.email || 'BUYER');
    return identity.role || 'CURRENT ROLE';
  }
  function selectedYear(){
    try { return text(window.PROCUREMENT_OVERVIEW_YEAR || PROCUREMENT_OVERVIEW_YEAR || 'ALL') || 'ALL'; }
    catch (_) { return 'ALL'; }
  }
  function procurementYear(row){
    try {
      if (typeof window.overviewProcurementYear === 'function') return text(window.overviewProcurementYear(row));
      if (typeof overviewProcurementYear === 'function') return text(overviewProcurementYear(row));
    } catch (_) {}
    return '';
  }
  function reviewSourceRows(){
    let source = [];
    try { if (Array.isArray(PROCUREMENT_OVERVIEW_SOURCE_ROWS)) source = PROCUREMENT_OVERVIEW_SOURCE_ROWS.slice(); } catch (_) {}
    if (!source.length) {
      try { if (Array.isArray(PROCUREMENT_REVIEW_ROWS)) source = PROCUREMENT_REVIEW_ROWS.slice(); } catch (_) {}
    }
    const year = selectedYear();
    source = scopeRows(source);
    if (year !== 'ALL') source = source.filter(row => procurementYear(row) === year);
    try {
      if (typeof overviewIsHiddenStatus === 'function') source = source.filter(row => !overviewIsHiddenStatus(row));
    } catch (_) {}
    try {
      if (typeof overviewFlowPriority === 'function') {
        source = source.map((row,index) => ({row,index}))
          .sort((a,b) => overviewFlowPriority(a.row) - overviewFlowPriority(b.row) || a.index - b.index)
          .map(item => item.row);
      }
    } catch (_) {}
    return source;
  }
  function reviewValues(){
    const rows = reviewSourceRows();
    if (typeof overviewReviewValues !== 'function') return [];
    return rows.map(row => overviewReviewValues(row).map(value => text(value)));
  }
  function safeFilePart(value){
    return text(value).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'ALL';
  }
  async function exportReviewExcel(){
    const values = reviewValues();
    if (!values.length) {
      window.alert('Tidak ada data Procurement Review untuk scope role dan tahun yang dipilih.');
      return;
    }
    if (typeof window.MSW_ENSURE_XLSX === 'function') await window.MSW_ENSURE_XLSX();
    if (!window.XLSX) throw new Error('Library Excel belum tersedia.');
    const ws = window.XLSX.utils.aoa_to_sheet([REVIEW_HEADERS, ...values]);
    ws['!cols'] = [
      {wch:24},{wch:48},{wch:28},{wch:24},{wch:12},{wch:22},
      {wch:16},{wch:18},{wch:30},{wch:55}
    ];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Procurement Review');
    const date = new Date().toISOString().slice(0,10);
    const fileScope = role() === 'BUYER' ? safeFilePart(scopeLabel()) : 'ALL_BUYERS';
    window.XLSX.writeFile(wb, `Procurement_Review_${fileScope}_${safeFilePart(selectedYear())}_${date}.xlsx`);
  }
  function printReview(){
    const values = reviewValues();
    if (!values.length) {
      window.alert('Tidak ada data Procurement Review untuk scope role dan tahun yang dipilih.');
      return;
    }
    const body = values.map(row => `<tr>${row.map(value => `<td>${esc(value || '-')}</td>`).join('')}</tr>`).join('');
    const header = REVIEW_HEADERS.map(value => `<th>${esc(value)}</th>`).join('');
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
      h1{font-size:16px;margin:0 0 3px}.meta{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;color:#475569;font-size:9px}
      table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #cbd5e1;padding:4px 5px;vertical-align:top;white-space:pre-wrap;word-break:break-word}
      th{background:#163f6d;color:#fff;font-weight:700;text-align:left}tbody tr:nth-child(even){background:#f8fafc}.footer{margin-top:6px;color:#64748b;font-size:8px}
    </style></head><body>
      <h1>Procurement Review</h1>
      <div class="meta"><span><b>Scope:</b> ${esc(scopeLabel())}</span><span><b>Year:</b> ${esc(selectedYear())}</span><span><b>Rows:</b> ${values.length}</span><span><b>Generated:</b> ${esc(generated)}</span></div>
      <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
      <div class="footer">PT Makmur Sejahtera Wisesa — Procurement Division</div>
      <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},100);});<\/script>
    </body></html>`);
    popup.document.close();
  }

  function installReviewInterceptors(){
    if (document.body?.dataset?.mswPage !== 'main-menu') return;
    document.addEventListener('click', function(event){
      const excel = event.target.closest?.('#mswProcurementReviewExcel');
      const print = event.target.closest?.('#mswProcurementReviewPrint');
      if (!excel && !print) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (excel) exportReviewExcel().catch(error => window.alert(error?.message || 'Export Excel gagal.'));
      else printReview();
    }, true);
  }

  function installAdminExportWrapper(){
    if (!/\/procurement-admin\/?(?:index\.html)?$/i.test(window.location.pathname)) return;
    let tries = 0;
    const timer = window.setInterval(function(){
      tries += 1;
      if (typeof window.exportExcel !== 'function') {
        if (tries > 200) window.clearInterval(timer);
        return;
      }
      if (window.exportExcel.__MSW_ROLE_SCOPE_V3517__) {
        window.clearInterval(timer);
        return;
      }
      const previous = window.exportExcel;
      const wrapped = function(){
        const cache = window.MSW?.cache;
        if (!cache?.load) return previous.apply(this, arguments);
        const originalLoad = cache.load;
        const rawRows = originalLoad.call(cache, CACHE_KEY);
        const scoped = scopeRows(Array.isArray(rawRows) ? rawRows : []);
        if (role() === 'BUYER' && !scoped.length && Array.isArray(rawRows) && rawRows.length) {
          window.alert('Tidak ada data Procurement milik Buyer login yang dapat diekspor.');
          return;
        }
        cache.load = function(key){
          if (String(key || '') === CACHE_KEY) return scoped.slice();
          return originalLoad.apply(this, arguments);
        };
        try { return previous.apply(this, arguments); }
        finally { cache.load = originalLoad; }
      };
      wrapped.__MSW_ROLE_SCOPE_V3517__ = true;
      window.exportExcel = wrapped;
      window.clearInterval(timer);
    }, 50);
  }

  installReviewInterceptors();
  installAdminExportWrapper();

  window.MSW_PROCUREMENT_EXPORT_SCOPE = Object.freeze({
    role, profile, scopeRows, scopeLabel, belongsToBuyer, reviewSourceRows, exportReviewExcel, printReview
  });
})();
