/* ======================================================
   RFQ EXCEL IMPORT v3.5.24

   Scope only:
   - Upload RFQ Excel is visible only in RFQ view.
   - The file picker starts from the ACTIVE No PR folder only.
   - User chooses the subfolder/location manually; no document folder is selected automatically.
   - Reads only Sheet RFQ from XLS/XLSX/XLSM/XLSB.
   - Main RFQ input comes from columns B:D through row 25; blank rows are skipped.
   - Internal reference import is limited to:
       I = Est. Budget PR USD
       J = Est. Budget PR IDR / Convert IDR fallback
       K = Item Number
   - If I has a value, IDR is recalculated with the USD/IDR rate currently
     used by Procurement Workspace and Qty. If I is blank, J is used as-is.
====================================================== */
(function installRfqExcelImportV3524(){
  'use strict';
  if (window.__MSW_RFQ_EXCEL_IMPORT_V3524__) return;
  window.__MSW_RFQ_EXCEL_IMPORT_V3524__ = true;
  window.__MSW_RFQ_EXCEL_IMPORT_V3523__ = true;

  const MAX_ROW = 25;
  const DEFAULT_DATA_START_ROW = 6;
  const IMPORT_BUTTON_ID = 'rfqExcelImportBtn';
  const XLSX_SRC = new URL('../assets/xlsx.full.min.js?v=20260819-rfq-import-v3524', window.location.href).href;

  // Same storage used by the existing local PR folder feature.
  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const DB_STORE = 'handles';
  const ROOT_HANDLE_KEY = 'prRoot';

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
    return number.toLocaleString('id-ID', { maximumFractionDigits: 6 });
  }

  function setStatus(message){
    const el = document.getElementById('saveStatus');
    if (el) el.textContent = message;
  }

  function isRfqView(){
    try {
      if (typeof currentView !== 'undefined') return String(currentView).toUpperCase() === 'RFQ';
    } catch (_) {}
    return text(document.getElementById('viewTitle')?.textContent).toUpperCase() === 'RFQ';
  }

  function getActiveNoPr(){
    try {
      if (typeof getBidderMeta === 'function') {
        const meta = getBidderMeta() || {};
        const value = text(meta.nopr || meta.noPR || meta['No PR']);
        if (value) return value;
      }
    } catch (_) {}

    try {
      const params = new URLSearchParams(window.location.search);
      return text(params.get('noPR') || params.get('nopr'));
    } catch (_) {
      return '';
    }
  }

  function getBasePr(value){
    return text(value)
      .replace(/\s*\(\s*Line[^)]*\)\s*$/i, '')
      .replace(/\s+R\s*\d+\s*$/i, '')
      .trim();
  }

  function isPrefixMatch(folderName, base){
    const folder = text(folderName).toUpperCase();
    const key = text(base).toUpperCase();
    if (!folder || !key || !folder.startsWith(key)) return false;
    if (folder === key) return true;
    return /[\s\-_(]/.test(folder.charAt(key.length));
  }

  function openDb(){
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Local PR database tidak dapat dibuka.'));
    });
  }

  async function loadPrRootHandle(){
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const request = tx.objectStore(DB_STORE).get(ROOT_HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Folder PR tersimpan tidak dapat dibaca.'));
      });
    } finally {
      db.close();
    }
  }

  async function ensureReadPermission(handle){
    if (!handle) return false;
    const options = { mode: 'read' };
    try {
      if ((await handle.queryPermission(options)) === 'granted') return true;
      return (await handle.requestPermission(options)) === 'granted';
    } catch (_) {
      return false;
    }
  }

  async function findActivePrDirectory(root, noPr){
    const base = getBasePr(noPr);
    if (!base) throw new Error('No PR aktif belum tersedia.');

    try {
      const exact = await root.getDirectoryHandle(base, { create: false });
      return exact;
    } catch (_) {
      // Continue with existing prefix behavior, e.g. "PR001 - Description".
    }

    const matches = [];
    for await (const [name, handle] of root.entries()) {
      if (handle.kind !== 'directory') continue;
      if (isPrefixMatch(name, base)) matches.push({ name, handle });
    }
    matches.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
    if (matches.length) return matches[0].handle;

    throw new Error(`Folder No PR ${base} tidak ditemukan di dalam folder PR yang terhubung.`);
  }

  async function pickExcelFromActivePr(){
    const noPr = getActiveNoPr();
    const basePr = getBasePr(noPr);
    if (!basePr) throw new Error('No PR aktif belum tersedia. Buka PR terlebih dahulu.');

    if (typeof window.showOpenFilePicker !== 'function') {
      throw new Error('Browser ini belum mendukung pembukaan file langsung dari folder No PR. Gunakan Microsoft Edge atau Google Chrome terbaru.');
    }

    setStatus(`Membuka folder ${basePr}...`);
    const root = await loadPrRootHandle();
    if (!root) throw new Error('Folder PR belum terhubung. Connect Folder PR terlebih dahulu.');
    if (!(await ensureReadPermission(root))) throw new Error('Izin akses folder PR belum diberikan.');

    const prDirectory = await findActivePrDirectory(root, basePr);
    const handles = await window.showOpenFilePicker({
      startIn: prDirectory,
      multiple: false,
      excludeAcceptAllOption: false,
      types: [{
        description: 'RFQ Excel',
        accept: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
          'application/vnd.ms-excel.sheet.binary.macroEnabled.12': ['.xlsb'],
          'application/vnd.ms-excel': ['.xls']
        }
      }]
    });

    const handle = Array.isArray(handles) ? handles[0] : null;
    if (!handle) return null;
    return handle.getFile();
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

  function cellValue(sheet, column, row){
    const cell = sheet?.[`${column}${row}`];
    if (!cell) return '';
    if (cell.v != null) return cell.v;
    if (cell.w != null) return cell.w;
    return '';
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
        row['Est. Budget PR IDR'] = fallbackIdr > 0 ? formatIdr(fallbackIdr) : '';
        row.__EstBudgetIdrMode = fallbackIdr > 0 ? 'manual' : 'auto';
      }

      items.push(row);
    }

    return items;
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
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: 'array', cellDates: true, cellFormula: true, cellNF: true, cellText: true
      });
      const sheet = findRfqSheet(workbook);
      if (!sheet) throw new Error('Sheet RFQ tidak ditemukan pada file Excel yang dipilih.');

      const usdRate = getProcurementUsdRate();
      if (!(usdRate > 1000)) {
        throw new Error('Dolar USD/IDR pada Procurement Workspace belum tersedia. Sync kurs terlebih dahulu lalu upload kembali.');
      }

      const items = buildImportedItems(sheet, usdRate);
      if (!items.length) throw new Error(`Tidak ada item RFQ terisi sampai baris ${MAX_ROW}.`);

      const noPr = getBasePr(getActiveNoPr());
      const confirmed = window.confirm(
        `No PR aktif: ${noPr}\n` +
        `Ditemukan ${items.length} item pada Sheet RFQ.\n\n` +
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

      DATA.structured.RFQ.items = items;
      try { if (typeof ensureRFQReferenceFields === 'function') ensureRFQReferenceFields(); } catch (_) {}

      if (typeof markDirty === 'function') {
        markDirty(`${items.length} item RFQ diimport dari Excel untuk ${noPr}. Menunggu autosave...`);
      } else {
        setStatus(`${items.length} item RFQ berhasil diimport dari Excel.`);
      }
      try { if (typeof scheduleDocumentAutosave === 'function') scheduleDocumentAutosave(); } catch (_) {}
      if (typeof renderCurrent === 'function') renderCurrent();
      scheduleUsdDisplayPatch();
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus('Pemilihan file RFQ dibatalkan.');
        return;
      }
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

  async function chooseAndImport(){
    const button = document.getElementById(IMPORT_BUTTON_ID);
    const originalLabel = button?.textContent || 'Upload RFQ Excel';
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Opening PR...';
      }
      const file = await pickExcelFromActivePr();
      if (file) await importExcelFile(file);
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus('Pemilihan file RFQ dibatalkan.');
        return;
      }
      console.error('Buka folder PR gagal:', error);
      setStatus(`Upload RFQ gagal: ${error?.message || error}`);
      window.alert(`Upload RFQ gagal.\n\n${error?.message || error}`);
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
    let rows = [];
    try { rows = DATA?.structured?.RFQ?.items || []; } catch (_) {}

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
    button.title = 'Buka folder No PR aktif, pilih lokasi secara manual, lalu pilih file RFQ Excel';
    button.style.marginRight = '8px';
    button.addEventListener('click', chooseAndImport);

    toolbar.insertBefore(button, toolbar.firstChild);

    document.querySelectorAll('.nav-btn[data-view]').forEach(nav => {
      nav.addEventListener('click', () => window.setTimeout(syncButtonVisibility, 0));
    });

    const viewTitle = document.getElementById('viewTitle');
    if (viewTitle) new MutationObserver(syncButtonVisibility).observe(viewTitle, { childList: true, subtree: true, characterData: true });

    const viewBody = document.getElementById('viewBody');
    if (viewBody) new MutationObserver(scheduleUsdDisplayPatch).observe(viewBody, { childList: true, subtree: true, characterData: true });

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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
