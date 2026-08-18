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
