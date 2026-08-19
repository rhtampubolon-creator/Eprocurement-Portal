/* ======================================================
   RFQ EXCEL IMPORT v3.5.23

   Scope only:
   - Adds an Upload RFQ Excel button that is visible only in RFQ view.
   - Reads only Sheet RFQ from XLS/XLSX/XLSM/XLSB.
   - Main RFQ input comes from columns B:D, rows after the detected header
     through row 25; blank rows are skipped, including blanks between items.
   - Internal reference import is limited to:
       I = Est. Budget PR USD
       J = Est. Budget PR IDR / Convert IDR fallback
       K = Item Number
   - If I has a value, IDR is recalculated with the USD/IDR rate currently
     used by Procurement Workspace and Qty. If I is blank, J is used as-is.
   - Previous Price / Date / Company / Commodity history is not imported.
====================================================== */
(function installRfqExcelImportV3523(){
  'use strict';
  if (window.__MSW_RFQ_EXCEL_IMPORT_V3523__) return;
  window.__MSW_RFQ_EXCEL_IMPORT_V3523__ = true;

  const MAX_ROW = 25;
  const DEFAULT_DATA_START_ROW = 6;
  const IMPORT_BUTTON_ID = 'rfqExcelImportBtn';
  const IMPORT_INPUT_ID = 'rfqExcelImportInput';
  const XLSX_SRC = new URL('../assets/xlsx.full.min.js?v=20260819-rfq-import-v3523', window.location.href).href;
  let xlsxLoadPromise = null;
  let patchScheduled = false;

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function isBlank(value){
    return value == null || (typeof value === 'string' && value.trim() === '');
  }

  function parseNumber(value){
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    try {
      if (typeof parseCurrencyNumber === 'function') return Number(parseCurrencyNumber(value) || 0);
    } catch (_) {}

    let source = text(value)
      .replace(/rp/gi, '')
      .replace(/idr/gi, '')
      .replace(/usd/gi, '')
      .replace(/[^\d.,-]/g, '');
    if (!source) return 0;

    const lastComma = source.lastIndexOf(',');
    const lastDot = source.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      source = lastComma > lastDot
        ? source.replace(/\./g, '').replace(',', '.')
        : source.replace(/,/g, '');
    } else if (lastComma > -1) {
      const parts = source.split(',');
      source = parts.length > 1 && parts[parts.length - 1].length === 3
        ? source.replace(/,/g, '')
        : source.replace(',', '.');
    } else if (lastDot > -1) {
      const parts = source.split('.');
      if (parts.length > 1 && parts[parts.length - 1].length === 3) source = source.replace(/\./g, '');
    }

    const result = Number(source);
    return Number.isFinite(result) ? result : 0;
  }

  function formatIdr(value){
    const number = Number(value || 0);
    return number > 0 ? Math.round(number).toLocaleString('id-ID') : '';
  }

  function formatUsd(value){
    const number = Number(value || 0);
    if (!(number > 0)) return '';
    return number.toLocaleString('id-ID', {
      minimumFractionDigits: Number.isInteger(number) ? 0 : 0,
      maximumFractionDigits: 6
    });
  }

  function cellValue(sheet, column, row){
    const cell = sheet?.[`${column}${row}`];
    if (!cell) return '';
    if (cell.v != null) return cell.v;
    if (cell.w != null) return cell.w;
    return '';
  }

  function isRfqView(){
    try {
      if (typeof currentView !== 'undefined') return String(currentView).toUpperCase() === 'RFQ';
    } catch (_) {}
    return text(document.getElementById('viewTitle')?.textContent).toUpperCase() === 'RFQ';
  }

  function readRateFromParent(){
    let current = window;
    for (let depth = 0; depth < 4; depth += 1) {
      try {
        const parent = current.parent;
        if (!parent || parent === current) break;
        current = parent;
        const candidates = [
          current.document?.getElementById('usdRateDisplay')?.value,
          current.document?.getElementById('usdRateDisplay')?.textContent,
          current.document?.getElementById('kpiDollarRate')?.textContent
        ];
        for (const candidate of candidates) {
          const rate = parseNumber(candidate);
          if (rate > 1000) return rate;
        }
      } catch (_) {
        break;
      }
    }
    return 0;
  }

  function getProcurementUsdRate(){
    const parentRate = readRateFromParent();
    if (parentRate > 1000) return parentRate;

    try {
      if (typeof getCurrentUsdIdrRate === 'function') {
        const rate = Number(getCurrentUsdIdrRate() || 0);
        if (rate > 1000) return rate;
      }
    } catch (_) {}

    try {
      const meta = DATA?.structured?.BidderList?.meta || {};
      const rate = parseNumber(meta.usd_rate_locked || meta.usd_rate_live || meta.usd_rate_used);
      if (rate > 1000) return rate;
    } catch (_) {}

    return 0;
  }

  function detectStartRow(sheet){
    for (let row = 1; row <= MAX_ROW; row += 1) {
      const b = text(cellValue(sheet, 'B', row)).toUpperCase();
      const c = text(cellValue(sheet, 'C', row)).toUpperCase();
      const d = text(cellValue(sheet, 'D', row)).toUpperCase();
      if (b === 'DESCRIPTION' && (c === 'QTY' || c === 'QUANTITY') && /UNIT/.test(d)) {
        return Math.min(MAX_ROW, row + 1);
      }
    }
    return DEFAULT_DATA_START_ROW;
  }

  function blankReferenceFields(){
    return {
      'Previous Price': '',
      'Date': '',
      'No Company': '',
      'Company Name': '',
      'Commodity WHS': '',
      'Previous Company': '',
      'Reference Source': '',
      'Reference Checked At': ''
    };
  }

  function buildImportedItems(sheet, usdRate){
    const startRow = detectStartRow(sheet);
    const items = [];

    for (let sourceRow = startRow; sourceRow <= MAX_ROW; sourceRow += 1) {
      const description = cellValue(sheet, 'B', sourceRow);
      const qtyRaw = cellValue(sheet, 'C', sourceRow);
      const unit = cellValue(sheet, 'D', sourceRow);

      // B:D menentukan apakah baris adalah item. Blank di tengah tidak menghentikan import.
      if ([description, qtyRaw, unit].every(isBlank)) continue;

      const usdRaw = cellValue(sheet, 'I', sourceRow);
      const idrRaw = cellValue(sheet, 'J', sourceRow);
      const itemNumber = cellValue(sheet, 'K', sourceRow);
      const usd = parseNumber(usdRaw);
      const qty = parseNumber(qtyRaw);

      const row = Object.assign({
        'No': String(items.length + 1),
        'Description': text(description),
        'Qty': isBlank(qtyRaw) ? '' : text(qtyRaw),
        'Ord Unit': text(unit),
        'Est. Budget PR USD': '',
        'Est. Budget PR IDR': '',
        '__EstBudgetIdrMode': 'auto',
        'Item Number': text(itemNumber)
      }, blankReferenceFields());

      if (usd > 0) {
        row['Est. Budget PR USD'] = String(usd);
        const qtyFactor = qty > 0 ? qty : 1;
        const calculatedIdr = Math.round(usd * usdRate * qtyFactor);
        row['Est. Budget PR IDR'] = calculatedIdr > 0 ? formatIdr(calculatedIdr) : '';
        row.__EstBudgetIdrMode = 'auto';
      } else {
        const fallbackIdr = parseNumber(idrRaw);
        row['Est. Budget PR USD'] = '';
        row['Est. Budget PR IDR'] = fallbackIdr > 0 ? formatIdr(fallbackIdr) : '';
        row.__EstBudgetIdrMode = fallbackIdr > 0 ? 'manual' : 'auto';
      }

      items.push(row);
    }

    return { items, startRow };
  }

  async function ensureXlsx(){
    if (window.XLSX?.read && window.XLSX?.utils) return window.XLSX;
    if (xlsxLoadPromise) return xlsxLoadPromise;

    xlsxLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-msw-rfq-xlsx-lib]');
      if (existing) {
        const timer = window.setInterval(() => {
          if (window.XLSX?.read && window.XLSX?.utils) {
            window.clearInterval(timer);
            resolve(window.XLSX);
          }
        }, 50);
        window.setTimeout(() => {
          window.clearInterval(timer);
          if (window.XLSX?.read && window.XLSX?.utils) resolve(window.XLSX);
          else reject(new Error('Library pembaca Excel belum tersedia.'));
        }, 10000);
        return;
      }

      const script = document.createElement('script');
      script.src = XLSX_SRC;
      script.defer = true;
      script.dataset.mswRfqXlsxLib = 'true';
      script.onload = () => window.XLSX?.read ? resolve(window.XLSX) : reject(new Error('Library Excel gagal diinisialisasi.'));
      script.onerror = () => reject(new Error('Library Excel tidak dapat dimuat.'));
      document.head.appendChild(script);
    });

    return xlsxLoadPromise;
  }

  function findRfqSheet(workbook){
    const name = (workbook?.SheetNames || []).find(sheetName => text(sheetName).toUpperCase() === 'RFQ');
    return name ? workbook.Sheets[name] : null;
  }

  function setStatus(message){
    const el = document.getElementById('saveStatus');
    if (el) el.textContent = message;
  }

  async function importExcelFile(file){
    if (!file) return;
    const button = document.getElementById(IMPORT_BUTTON_ID);
    const originalLabel = button?.textContent || 'Upload RFQ Excel';

    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Reading Excel...';
      }
      setStatus(`Membaca ${file.name}...`);

      const XLSX = await ensureXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellDates: true,
        cellFormula: true,
        cellNF: true,
        cellText: true
      });
      const sheet = findRfqSheet(workbook);
      if (!sheet) throw new Error('Sheet RFQ tidak ditemukan pada file Excel yang dipilih.');

      const usdRate = getProcurementUsdRate();
      if (!(usdRate > 1000)) {
        throw new Error('Dolar USD/IDR pada Procurement Workspace belum tersedia. Sync kurs terlebih dahulu lalu upload kembali.');
      }

      const result = buildImportedItems(sheet, usdRate);
      if (!result.items.length) {
        throw new Error(`Tidak ada item RFQ terisi sampai baris ${MAX_ROW}.`);
      }

      const confirmed = window.confirm(
        `Ditemukan ${result.items.length} item pada Sheet RFQ.\n\n` +
        `Data item RFQ Workspace saat ini akan diganti dengan hasil upload.\n` +
        `Kurs USD/IDR yang dipakai: ${Math.round(usdRate).toLocaleString('id-ID')}.\n\n` +
        `Lanjutkan import?`
      );
      if (!confirmed) {
        setStatus('Import RFQ dibatalkan.');
        return;
      }

      if (typeof DATA === 'undefined' || !DATA?.structured?.RFQ) {
        throw new Error('Workspace RFQ belum siap. Silakan buka tab RFQ lalu coba kembali.');
      }

      DATA.structured.RFQ.items = result.items;
      try { if (typeof ensureRFQReferenceFields === 'function') ensureRFQReferenceFields(); } catch (_) {}

      if (typeof markDirty === 'function') {
        markDirty(`${result.items.length} item RFQ diimport dari Excel. Menunggu autosave...`);
      } else {
        setStatus(`${result.items.length} item RFQ berhasil diimport dari Excel.`);
      }
      try { if (typeof scheduleDocumentAutosave === 'function') scheduleDocumentAutosave(); } catch (_) {}
      if (typeof renderCurrent === 'function') renderCurrent();
      scheduleUsdDisplayPatch();
    } catch (error) {
      console.error('RFQ Excel import gagal:', error);
      setStatus(`Import RFQ gagal: ${error?.message || error}`);
      window.alert(`Import RFQ gagal.\n\n${error?.message || error}`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  }

  function patchUsdDisplay(){
    patchScheduled = false;
    if (!isRfqView()) return;
    const rows = (() => {
      try { return DATA?.structured?.RFQ?.items || []; } catch (_) { return []; }
    })();

    document.querySelectorAll('.rfq-reference-table [data-key="Est. Budget PR USD"]').forEach(cell => {
      const index = Number(cell.dataset.row);
      if (!Number.isInteger(index) || !rows[index]) return;
      const raw = rows[index]['Est. Budget PR USD'];
      if (isBlank(raw)) return;
      const formatted = formatUsd(parseNumber(raw));
      if (formatted && cell.textContent !== formatted) cell.textContent = formatted;
    });
  }

  function scheduleUsdDisplayPatch(){
    if (patchScheduled) return;
    patchScheduled = true;
    window.requestAnimationFrame(patchUsdDisplay);
  }

  function syncButtonVisibility(){
    const button = document.getElementById(IMPORT_BUTTON_ID);
    if (button) button.style.display = isRfqView() ? '' : 'none';
    if (isRfqView()) scheduleUsdDisplayPatch();
  }

  function installUi(){
    if (document.getElementById(IMPORT_BUTTON_ID)) return true;
    const toolbar = document.querySelector('.panel-header .toolbar');
    if (!toolbar) return false;

    const button = document.createElement('button');
    button.id = IMPORT_BUTTON_ID;
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = '⬆ Upload RFQ Excel';
    button.title = 'Import item dari Sheet RFQ (.xlsx/.xlsm/.xls/.xlsb)';
    button.style.marginRight = '8px';
    button.addEventListener('click', () => document.getElementById(IMPORT_INPUT_ID)?.click());

    const input = document.createElement('input');
    input.id = IMPORT_INPUT_ID;
    input.type = 'file';
    input.accept = '.xlsx,.xlsm,.xls,.xlsb,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
    input.className = 'hidden-input';
    input.style.display = 'none';
    input.addEventListener('change', event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) importExcelFile(file);
    });

    toolbar.insertBefore(button, toolbar.firstChild);
    document.body.appendChild(input);

    document.querySelectorAll('.nav-btn[data-view]').forEach(nav => {
      nav.addEventListener('click', () => window.setTimeout(syncButtonVisibility, 0));
    });

    const viewTitle = document.getElementById('viewTitle');
    if (viewTitle) new MutationObserver(syncButtonVisibility).observe(viewTitle, {childList:true, subtree:true, characterData:true});

    const viewBody = document.getElementById('viewBody');
    if (viewBody) new MutationObserver(scheduleUsdDisplayPatch).observe(viewBody, {childList:true, subtree:true, characterData:true});

    syncButtonVisibility();
    return true;
  }

  function install(){
    if (installUi()) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (installUi() || tries > 200) window.clearInterval(timer);
    }, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
