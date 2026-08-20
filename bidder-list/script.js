
const DEFAULT_DATA = JSON.parse(document.getElementById('workbook-data').textContent);
let DATA = structuredClone(DEFAULT_DATA);
const MIN_BIDDER_WORKSPACE_ROWS = 10;

// Pastikan kolom No Company selalu berada di antara No dan Name of Invited Supplier.
// Kolom ini read-only dan nilainya diambil dari master Vendor Company (key: noCompany).
function ensureBidderNoCompanyColumn() {
  const rows = DATA?.structured?.BidderList?.rows;
  if (!Array.isArray(rows)) return;

  rows.forEach((row, index) => {
    if (!row || Array.isArray(row)) return;

    const orderedRow = {
      'No': row['No'] ?? String(index + 1),
      'No Company': row['No Company'] ?? row.noCompany ?? '',
      'Name of Invited Supplier': row['Name of Invited Supplier'] ?? ''
    };

    Object.entries(row).forEach(([key, value]) => {
      if (['No', 'No Company', 'noCompany', 'Name of Invited Supplier'].includes(key)) return;
      orderedRow[key] = value;
    });

    rows[index] = orderedRow;
  });
}

ensureBidderNoCompanyColumn();
let currentView = 'BidderList';

async function saveBlobToLocalDrive(blob, fileName, documentType = '') {
  const bridge = window.MSW_BIDDER_LOCAL_PR_BRIDGE;
  if (!bridge?.getConnectedPrRoot || !bridge?.findExistingPrFolder) {
    throw new Error('Storage Location belum siap. Buka Storage Location lalu aktifkan kembali folder PR.');
  }

  const type = String(documentType || currentView || '').trim().toUpperCase();
  const folderName = type === 'CQS' ? '03. CQS' : '02. Bidderlist & Quotation';
  const meta = getBidderMeta();
  const noPR = String(meta?.nopr || meta?.noPR || meta?.['No PR'] || '').trim();
  if (!noPR) throw new Error('No PR belum tersedia.');

  const round = typeof getDocumentRound === 'function'
    ? String(getDocumentRound(meta) || 'R0').toUpperCase().replace(/\s+/g, '')
    : 'R0';
  const normalizedRound = /^R\d+$/.test(round) ? round : 'R0';

  try {
    const root = await bridge.getConnectedPrRoot(true);
    const project = await bridge.findExistingPrFolder(root, noPR);
    const typeDirectory = await project.handle.getDirectoryHandle(folderName, { create: true });
    const roundDirectory = await typeDirectory.getDirectoryHandle(normalizedRound, { create: true });
    const fileHandle = await roundDirectory.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return {
      saved: true,
      path: `PR/${project.name}/${folderName}/${normalizedRound}/${fileName}`
    };
  } catch (error) {
    throw new Error(`File tidak dapat disimpan ke Storage Location: ${error?.message || error}`);
  }
}

async function saveCurrentDocumentAsToStorage() {
  const view = String(currentView || '').toUpperCase();
  if (view === 'BIDDERLIST') return saveBidderListAs();
  if (view === 'RFQ') return saveRFQAs();
  if (view === 'CQS') return saveCQSAs();
  alert('Save As lokal tersedia pada tab BidderList, RFQ, atau CQS.');
  return false;
}

window.saveCurrentDocumentAsToStorage = saveCurrentDocumentAsToStorage;

// Guard proses Save Vendor & Dates agar tombol tidak menjalankan dua request bersamaan.
// Variabel ini wajib dideklarasikan; tanpa deklarasi browser berhenti dengan ReferenceError.
let BIDDER_PROCUREMENT_SAVE_IN_FLIGHT = false;

/* =========================================================
   PENGATURAN LEBAR KOLOM MANUAL
   - Geser garis kanan header kolom untuk mengubah lebar.
   - Lebar tersimpan otomatis di browser untuk setiap tab/tabel.
   - Klik dua kali garis resize untuk mengembalikan kolom tersebut.
========================================================= */
const COLUMN_WIDTH_STORAGE_KEY = 'MSW_BIDDERLIST_COLUMN_WIDTHS_V2_AUTO';

function loadSavedColumnWidths() {
  try {
    const data = JSON.parse(localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

function saveColumnWidths(data) {
  try { localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(data || {})); } catch (_) {}
}


function enableManualColumnResize() {
  const root = document.getElementById('viewBody');
  if (!root) return;

  root.querySelectorAll('.table-wrap > table').forEach((table, tableIndex) => {
    const headers = Array.from(table.querySelectorAll('thead tr:first-child > th'));
    if (!headers.length) return;

    const tableKey = `${currentView}::${tableIndex}`;
    const savedAll = loadSavedColumnWidths();
    const saved = savedAll[tableKey] || {};

    let colgroup = table.querySelector(':scope > colgroup.manual-colgroup');
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
      colgroup.className = 'manual-colgroup';
      headers.forEach(() => colgroup.appendChild(document.createElement('col')));
      table.insertBefore(colgroup, table.firstChild);
    }

    const cols = Array.from(colgroup.children);
    table.classList.add('manual-resizable-table');

    headers.forEach((th, columnIndex) => {
      const col = cols[columnIndex];
      if (!col) return;

      const savedWidth = Number(saved[columnIndex]);
      if (Number.isFinite(savedWidth) && savedWidth >= 40) {
        col.style.width = `${savedWidth}px`;
      } else {
        col.style.removeProperty('width');
      }
      col.style.removeProperty('min-width');

      th.classList.add('manual-resizable-header');
      if (th.querySelector(':scope > .column-resize-handle')) return;

      const handle = document.createElement('span');
      handle.className = 'column-resize-handle';
      handle.title = 'Kolom menyesuaikan otomatis. Geser untuk memberi lebar manual; klik dua kali untuk kembali otomatis.';
      handle.setAttribute('aria-hidden', 'true');

      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        const startX = event.clientX;
        const startWidth = Math.max(40, Math.round(th.getBoundingClientRect().width || 120));
        handle.setPointerCapture(event.pointerId);
        document.body.classList.add('is-resizing-column');

        const move = moveEvent => {
          const width = Math.max(40, Math.min(900, Math.round(startWidth + moveEvent.clientX - startX)));
          col.style.width = `${width}px`;
        };

        const stop = stopEvent => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', stop);
          handle.removeEventListener('pointercancel', stop);
          document.body.classList.remove('is-resizing-column');

          const width = Math.max(40, Math.round(th.getBoundingClientRect().width));
          const latest = loadSavedColumnWidths();
          latest[tableKey] = latest[tableKey] || {};
          latest[tableKey][columnIndex] = width;
          saveColumnWidths(latest);

          try { handle.releasePointerCapture(stopEvent.pointerId); } catch (_) {}
        };

        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
      });

      handle.addEventListener('dblclick', event => {
        event.preventDefault();
        event.stopPropagation();
        const latest = loadSavedColumnWidths();
        if (latest[tableKey]) {
          delete latest[tableKey][columnIndex];
          if (!Object.keys(latest[tableKey]).length) delete latest[tableKey];
        }
        saveColumnWidths(latest);
        col.style.removeProperty('width');
        renderCurrent();
      });

      th.appendChild(handle);
    });
  });
}

let editMode = true;
let showBlankRows = false;
let dirty = false;
let WORKSPACE_VERSION = 0;
let WORKSPACE_LOADING_KEY = '';
let CQS_TEMPLATE_ARRAY_BUFFER = null;
let CQS_TEMPLATE_FILE_NAME = 'CQS.xlsx';
let ACTIVE_CQS_VENDOR_KEY = '';
let RFQ_TEMPLATE_ARRAY_BUFFER = null;
let RFQ_TEMPLATE_FILE_NAME = 'RFQ.xlsx';
const WORKSPACE_PARAMS = new URLSearchParams(window.location.search);
const IS_EMBEDDED_WORKSPACE = WORKSPACE_PARAMS.get('workspace') === '1';
const WORKSPACE_AUTOSAVE_DELAY_MS = 1200;
let WORKSPACE_AUTOSAVE_TIMER = null;
let WORKSPACE_SAVE_IN_FLIGHT = false;
let WORKSPACE_SAVE_PENDING = false;
let WORKSPACE_CHANGE_SEQUENCE = 0;
let WORKSPACE_LAST_SAVE_ERROR = '';

const NATIVE_DOCUMENT_SYNC_DELAY_MS = 3500;
let NATIVE_DOCUMENT_SYNC_TIMER = null;
let NATIVE_DOCUMENT_SYNC_IN_FLIGHT = false;
let NATIVE_DOCUMENT_SYNC_PENDING = false;
const NATIVE_DOCUMENT_LAST_SIGNATURES = Object.create(null);

const EMBEDDED_FLOW_PROCESS = WORKSPACE_PARAMS.get('flow') || '';
const NORMALIZED_EMBEDDED_FLOW = String(EMBEDDED_FLOW_PROCESS)
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '');

function normalizeCQSFlow(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function getCurrentCQSFlow() {
  const metaFlow = DATA?.structured?.BidderList?.meta?.flow_process || '';
  return normalizeCQSFlow(metaFlow || EMBEDDED_FLOW_PROCESS || NORMALIZED_EMBEDDED_FLOW);
}

function isCQSFlowAllowed() {
  const flow = getCurrentCQSFlow();
  return flow === 'CREATECQS' || flow === 'CQS';
}

function createBlankWorkspaceRow(sample, fallbackHeaders = []) {
  if (Array.isArray(sample)) return sample.map(() => '');
  const headers = sample && typeof sample === 'object'
    ? Object.keys(sample).filter(key => !String(key).startsWith('__'))
    : fallbackHeaders;
  const row = {};
  headers.forEach(header => { row[header] = ''; });
  if (Object.prototype.hasOwnProperty.call(row, 'No')) row.No = '1';
  return row;
}

function isMeaningfulBidderRow(row) {
  if (!row || typeof row !== 'object') return false;
  return [
    'No Company', 'Name of Invited Supplier', 'Contact Person', 'No Telp',
    'Email', 'Company Status', 'Register Status', 'Accepted Date',
    'Time', 'Notes', 'Remarks'
  ].some(key => String(row[key] ?? '').trim() !== '');
}

function isMeaningfulRFQItemRow(row) {
  if (!row || typeof row !== 'object') return false;
  return [
    'Description', 'Item Description', 'Qty', 'Quantity', 'Ord Unit', 'Unit',
    'Item Number', 'Est. Budget PR', 'Est. Budget PR USD', 'Est. Budget PR IDR', 'USD PR', 'Convert IDR'
  ].some(key => String(row[key] ?? '').trim() !== '');
}

function ensureMinimumBidderRows(rows, sample = {}) {
  if (!Array.isArray(rows)) return rows;
  const fallbackHeaders = [
    'No', 'No Company', 'Name of Invited Supplier', 'Contact Person',
    'No Telp', 'Email', 'Company Status', 'Register Status',
    'Accepted Date', 'Time', 'Notes', 'Remarks'
  ];
  const rowTemplate = sample && typeof sample === 'object' ? sample : {};
  while (rows.length < MIN_BIDDER_WORKSPACE_ROWS) {
    rows.push(createBlankWorkspaceRow(rowTemplate, fallbackHeaders));
  }
  rows.forEach((row, index) => {
    if (row && Object.prototype.hasOwnProperty.call(row, 'No')) row.No = String(index + 1);
  });
  return rows;
}

function compactWorkspaceEntryRows() {
  const bidderRows = DATA?.structured?.BidderList?.rows;
  if (Array.isArray(bidderRows)) {
    const sample = bidderRows.find(row => row && typeof row === 'object') || {};
    const populated = bidderRows.filter(isMeaningfulBidderRow);
    DATA.structured.BidderList.rows = ensureMinimumBidderRows(populated, sample);
  }

  const rfqRows = DATA?.structured?.RFQ?.items;
  if (Array.isArray(rfqRows)) {
    const sample = rfqRows.find(row => row && typeof row === 'object') || {};
    const populated = rfqRows.filter(isMeaningfulRFQItemRow);
    DATA.structured.RFQ.items = populated.length
      ? populated
      : [createBlankWorkspaceRow(sample, ['No', 'Description', 'Qty', 'Ord Unit', 'Item Number'])];
    DATA.structured.RFQ.items.forEach((row, index) => {
      if (row && Object.prototype.hasOwnProperty.call(row, 'No')) row.No = String(index + 1);
    });
  }
}


/* ==========================
   DELIVERY LOCATION
========================== */

let selectedDelivery = "msw";

function getRFQDeliveryAddress(meta = DATA?.structured?.RFQ?.meta || {}, location = selectedDelivery) {
    const normalizedLocation = String(location || 'msw').trim().toLowerCase() === 'ibt'
        ? 'ibt'
        : 'msw';
    const address = normalizedLocation === 'ibt'
        ? meta.destination_ibt
        : meta.destination_msw;
    return String(address || '').trim();
}

function changeDelivery(value){
    selectedDelivery = value === 'ibt' ? 'ibt' : 'msw';
    const rfqMeta = DATA?.structured?.RFQ?.meta;
    if (rfqMeta) {
        rfqMeta.delivery_location = selectedDelivery;
        rfqMeta.delivery_address = getRFQDeliveryAddress(rfqMeta, selectedDelivery);
    }
    markDirty('Location Delivery berubah. Menunggu autosave...');
    renderCurrent();
}

/* =========================================================
   TAMBAHAN: KURS USD KE IDR REAL TIME + LOCK SAAT PRINT/SAVE
   Konsep sama seperti VBA KursUSDtoIDR()
   Sumber: https://open.er-api.com/v6/latest/USD
   ========================================================= */

const USD_IDR_FALLBACK_RATE = 17500;

async function KursUSDtoIDR() {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      cache: 'no-store'
    });

    if (!response.ok) throw new Error('Gagal mengambil kurs USD.');

    const json = await response.json();
    const rate = Number(json?.rates?.IDR || 0);

    return isNaN(rate) ? 0 : rate;
  } catch (error) {
    console.warn('KursUSDtoIDR gagal:', error);
    return 0;
  }
}

function buildWorkspaceLoadUrl(noPR, round, procurementId = '') {
  const params = new URLSearchParams({
    action: 'loadWorkspace',
    noPR: String(noPR || '').trim(),
    round: normalizeDocumentRound(round)
  });
  if (procurementId) params.set('procurementId', String(procurementId).trim());
  return `${GAS_URL}?${params.toString()}`;
}

function getBidderMeta() {
  DATA.structured.BidderList.meta = DATA.structured.BidderList.meta || {};
  return DATA.structured.BidderList.meta;
}

function parseCurrencyNumber(value) {
  let text = String(value ?? '').trim();
  if (!text) return 0;

  text = text
    .replace(/rp/gi, '')
    .replace(/idr/gi, '')
    .replace(/usd/gi, '')
    .replace(/[^\d.,-]/g, '');

  if (!text) return 0;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // Format Indonesia: 1.500.000,50
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      // Format English: 1,500,000.50
      text = text.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    const parts = text.split(',');
    const last = parts[parts.length - 1];

    // 17,500 dianggap 17500
    if (last.length === 3 && parts.length > 1) {
      text = text.replace(/,/g, '');
    } else {
      text = text.replace(',', '.');
    }
  } else if (lastDot > -1) {
    const parts = text.split('.');
    const last = parts[parts.length - 1];

    // 17.500 dianggap 17500
    if (last.length === 3 && parts.length > 1) {
      text = text.replace(/\./g, '');
    }
  }

  const number = Number(text);
  return isNaN(number) ? 0 : number;
}

function formatIntegerID(value) {
  return Math.round(Number(value || 0)).toLocaleString('id-ID');
}

/* =========================================================
   TAMBAHAN: EST. PRICE PR OTOMATIS MENJADI RUPIAH
   Rumus: Est. Price PR x Dolar USD/IDR
   ========================================================= */

function getCurrentUsdIdrRate() {
  const meta = getBidderMeta();

  const rate = parseCurrencyNumber(
    meta.usd_rate_locked ||
    meta.usd_rate_live ||
    meta.usd_rate_used ||
    USD_IDR_FALLBACK_RATE
  );

  return rate || USD_IDR_FALLBACK_RATE;
}

/* =========================================================
   TAMBAHAN: EST. PRICE OTOMATIS
   Logika:
   1. Jika Est. Price PR ada nilai  => Est. Price PR x Dolar USD/IDR
   2. Jika Est. Price PR kosong     => ambil langsung Est. Price US - RP
   ========================================================= */

function hasRealValue(value) {
  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== '' &&
    String(value).trim() !== '-'
  );
}

function getEstPricePRRaw(meta) {
  return getMetaValue(meta, [
    'est_price',
    'est_price_pr',
    'Est. Price PR',
    'Est Price PR',
    'EST PRICE PR',
    'EST. PRICE PR',
    'estpricerp',
    'estpricepr',
    'estPricePR',
    'EstPricePR'
  ], '');
}

function getEstPriceUSRpRaw(meta) {
  return getMetaValue(meta, [
    'est_price_us_rp',
    'Est. Price US - RP',
    'EST. PRICE US - RP',
    'Est Price US - RP',
    'Est Price US RP',
    'EST PRICE US RP',
    'estpriceus',
    'estpriceusrp',
    'est_price_us_rp',
    'estPriceUSRP',
    'estPriceUsRp',
    'EstPriceUSRP'
  ], '');
}

function getEstPricePR(meta) {
  return parseCurrencyNumber(getEstPricePRRaw(meta));
}

function getEstPriceUSRp(meta) {
  return parseCurrencyNumber(getEstPriceUSRpRaw(meta));
}

function calculateEstPriceRpFromMeta(meta) {
  const estPricePRRaw = getEstPricePRRaw(meta);
  const estPricePR = getEstPricePR(meta);
  const estPriceUSRp = getEstPriceUSRp(meta);
  const usdRate = getCurrentUsdIdrRate();

  if (hasRealValue(estPricePRRaw) && estPricePR > 0) {
    return estPricePR * usdRate;
  }

  return estPriceUSRp;
}

function metaEstPriceRpCard(meta) {
  const estPricePRRaw = getEstPricePRRaw(meta);
  const estPricePR = getEstPricePR(meta);
  const estPriceUSRp = getEstPriceUSRp(meta);
  const usdRate = getCurrentUsdIdrRate();
  const estPriceRp = calculateEstPriceRpFromMeta(meta);

  if (!estPriceRp) {
    return metaCard('Est. Price Total (Rp)', '-');
  }

  const rateStatus = meta.usd_rate_locked ? 'Locked' : 'Live';

  if (hasRealValue(estPricePRRaw) && estPricePR > 0) {
    return metaCard(
      'Est. Price Total (Rp)',
      `Rp ${formatIntegerID(estPriceRp)}\nUSD ${formatIntegerID(estPricePR)} x ${formatIntegerID(usdRate)} (${rateStatus})`
    );
  }

  return metaCard(
    'Est. Price Total (Rp)',
    `Rp ${formatIntegerID(estPriceUSRp)}`
  );
}

function refreshDollarAndBidderView() {
  updateDollarKPI();

  if (currentView === 'BidderList' && typeof renderCurrent === 'function') {
    renderCurrent();
  }
}

function updateDollarKPI() {
  const meta = getBidderMeta();
  const savedRate = parseCurrencyNumber(meta.usd_rate_locked || meta.usd_rate_used || meta.usd_rate_live);
  const rate = savedRate || USD_IDR_FALLBACK_RATE;
  const rateEl = document.getElementById('kpiDollarRate');
  const statusEl = document.getElementById('kpiDollarStatus');

  if (rateEl) rateEl.textContent = `1$ - ${formatIntegerID(rate)}`;
  if (statusEl) {
    statusEl.textContent = savedRate
      ? ['Snapshot PR', meta.usd_rate_date || meta.usd_rate_locked_at || '', meta.usd_rate_source || ''].filter(Boolean).join(' • ')
      : 'Belum tersimpan pada PR • menggunakan nilai fallback sementara';
  }
}

async function syncKursUSDtoIDR(showAlert = false) {
  const meta = getBidderMeta();
  const rate = await KursUSDtoIDR();

  if (rate > 0) {
    meta.usd_rate_live = rate;
    meta.usd_rate_date = new Date().toLocaleString('id-ID');

    if (!meta.usd_rate_locked) {
      meta.usd_rate_used = rate;
    }

  
    refreshDollarAndBidderView();

    if (showAlert) {
      alert(`Kurs USD/IDR berhasil sync: ${formatIntegerID(rate)}`);
    }

    return rate;
  }

  refreshDollarAndBidderView();

  if (showAlert) {
    alert('Gagal sync kurs USD/IDR. Sistem memakai fallback 17.500.');
  }

  return USD_IDR_FALLBACK_RATE;
}

async function lockKursUSDtoIDR() {
  const meta = getBidderMeta();

  const lockedRate = parseCurrencyNumber(meta.usd_rate_locked);
  if (lockedRate > 0) return lockedRate;

  let rate = parseCurrencyNumber(meta.usd_rate_live);

  if (!rate) {
    rate = await KursUSDtoIDR();
  }

  if (!rate) {
    rate = USD_IDR_FALLBACK_RATE;
  }

  meta.usd_rate_locked = rate;
  meta.usd_rate_used = rate;
  meta.usd_rate_locked_at = new Date().toLocaleString('id-ID');

  
  refreshDollarAndBidderView();

  return rate;
}


async function printBidderList() {
  await lockKursUSDtoIDR();
  window.print();
}

async function saveFinalData() {
  await lockKursUSDtoIDR();

  // Tombol Save utama sekarang menjalankan satu alur lengkap:
  // 1) simpan workspace BidderList/RFQ,
  // 2) sinkronkan vendor undangan dan tanggal ke Procurement Admin,
  // 3) perbarui dokumen native di Drive.
  return await saveBidderListToProcurementAdmin({
    syncDocuments: true,
    showSuccessAlert: true
  });
}

function ensureSaveToProcurementButtons() {
  const buttonLabel = 'Save Company Name & Dates';

  if (!document.getElementById('saveBidderToProcurementBtn')) {
    const toolbar = document.querySelector('.panel-header .toolbar');
    const status = document.getElementById('saveStatus');
    if (toolbar && status) {
      const button = document.createElement('button');
      button.id = 'saveBidderToProcurementBtn';
      button.type = 'button';
      button.textContent = buttonLabel;
      button.title = 'Simpan Company Name, Start Date, Finish Date, dan Final Vendor List pada Round PR aktif.';
      button.onclick = saveBidderListToProcurementAdmin;
      button.style.background = '#0f766e';
      button.style.color = '#fff';
      button.style.borderColor = '#0f766e';
      button.style.whiteSpace = 'nowrap';
      toolbar.insertBefore(button, status);
    }
  }

  if (!document.getElementById('saveBidderToProcurementMenuBtn')) {
    const saveButton = document.querySelector('.action-menu button[onclick="saveFinalData()"]');
    if (saveButton) {
      const menuButton = document.createElement('button');
      menuButton.id = 'saveBidderToProcurementMenuBtn';
      menuButton.type = 'button';
      menuButton.textContent = buttonLabel;
      menuButton.title = 'Simpan Company Name, Start Date, Finish Date, dan Final Vendor List pada Round PR aktif.';
      menuButton.onclick = saveBidderListToProcurementAdmin;
      saveButton.parentElement.insertBefore(menuButton, saveButton);
    }
  }
}

async function waitForWorkspaceSaveIdle(timeoutMs = 12000) {
  const started = Date.now();
  while (WORKSPACE_SAVE_IN_FLIGHT) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Autosave masih berjalan. Tunggu beberapa saat lalu coba lagi.');
    }
    await new Promise(resolve => window.setTimeout(resolve, 150));
  }
}

async function postProcurementUpdate(payload) {
  const response = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let result;
  try {
    result = JSON.parse(responseText || '{}');
  } catch (error) {
    throw new Error(`Respons backend tidak valid (${response.status}).`);
  }

  if (!response.ok && !result?.success) {
    throw new Error(result?.message || `Backend gagal merespons (${response.status}).`);
  }
  return result;
}

function recordProcurementActivity(activity) {
  const meta = getBidderMeta();
  const enriched = {
    ...activity,
    noPR: String(activity?.noPR || meta?.nopr || '').trim(),
    round: String(activity?.round || getDocumentRound(meta) || '').trim(),
    user: String(
      activity?.user ||
      CURRENT_USER_PROFILE?.name ||
      CURRENT_USER_PROFILE?.email ||
      meta?.pic ||
      ''
    ).trim(),
    timestamp: String(activity?.timestamp || new Date().toISOString())
  };

  const localItem = window.MSW?.activity?.add
    ? MSW.activity.add(enriched)
    : enriched;

  // Riwayat dashboard tidak boleh menggagalkan proses utama. Simpan lokal
  // terlebih dahulu, lalu sinkronkan ke sheet Recent Activity di belakang layar.
  fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'LOG_ACTIVITY', activity: localItem })
  }).catch(error => console.warn('Recent Activity belum dapat disinkronkan:', error));

  return localItem;
}


const BIDDER_PROCUREMENT_PENDING_PREFIX = 'MSW_PENDING_SUBMIT_COMPANY_V1';
let BIDDER_PROCUREMENT_RETRY_IN_FLIGHT = false;

function getBidderProcurementPendingKey(noPR, round) {
  return `${BIDDER_PROCUREMENT_PENDING_PREFIX}::${String(noPR || '').trim().toUpperCase()}::${String(round || 'R0').trim().toUpperCase()}`;
}

function cacheBidderProcurementPending(payload) {
  const key = getBidderProcurementPendingKey(payload.noPR, payload.round);
  try {
    localStorage.setItem(key, JSON.stringify({
      payload,
      status: 'PENDING',
      cachedAt: new Date().toISOString()
    }));
  } catch (error) {
    console.warn('Cache Company Name tidak dapat ditulis:', error);
  }
  return key;
}

function clearBidderProcurementPending(noPR, round) {
  try { localStorage.removeItem(getBidderProcurementPendingKey(noPR, round)); }
  catch (error) { console.warn('Cache Company Name tidak dapat dihapus:', error); }
}

function listBidderProcurementPending() {
  const entries = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(`${BIDDER_PROCUREMENT_PENDING_PREFIX}::`)) continue;
      try {
        const cached = JSON.parse(localStorage.getItem(key) || '{}');
        if (cached?.payload?.noPR) entries.push({ key, ...cached });
      } catch (error) {
        console.warn('Cache Company Name tidak valid dan dilewati:', key, error);
      }
    }
  } catch (error) {
    console.warn('Cache Company Name tidak dapat dibaca:', error);
  }
  return entries;
}

async function retryBidderProcurementPending(options = {}) {
  if (BIDDER_PROCUREMENT_RETRY_IN_FLIGHT || BIDDER_PROCUREMENT_SAVE_IN_FLIGHT) return false;
  const pendingEntries = listBidderProcurementPending();
  if (!pendingEntries.length || navigator.onLine === false) return false;

  BIDDER_PROCUREMENT_RETRY_IN_FLIGHT = true;
  const status = document.getElementById('saveStatus');
  let savedCount = 0;
  try {
    await syncProcurementAdminFromGoogleSheet(false);

    for (const entry of pendingEntries) {
      const payload = entry.payload || {};
      const noPR = String(payload.noPR || '').trim();
      const round = normalizeDocumentRound(payload.round || 'R0');
      const companyName = String(payload.companyName || payload.finalVendorList || '').trim();
      const startDate = String(payload.startDate || '').trim();
      const finishDate = String(payload.finishDate || '').trim();
      if (!noPR || !companyName || !startDate || !finishDate) continue;

      const currentRow = findProcurementRowByNoPR(noPR);
      if (!currentRow) continue;
      const currentVersion = Number(getProcurementAdminValue(currentRow, [
        'Version', '__version', 'version'
      ]) || 0);

      const result = await postProcurementUpdate({
        action: 'EDIT',
        sheet: 'Admin',
        originalPR: noPR,
        data: {
          noPR,
          [`${round} Company`]: companyName,
          [`${round} Start Date`]: startDate,
          [`${round} Finish Date`]: finishDate,
          'Final Vendor List': companyName,
          __version: currentVersion
        }
      });

      if (!result?.success) continue;
      clearBidderProcurementPending(noPR, round);
      savedCount += 1;

      window.parent?.postMessage({
        action: 'BIDDERLIST_PROCUREMENT_UPDATED',
        noPR,
        round,
        data: {
          ...(currentRow || {}),
          ...(result.data || {}),
          'No PR': noPR,
          [`${round} Company`]: companyName,
          [`${round} Start Date`]: startDate,
          [`${round} Finish Date`]: finishDate,
          'Final Vendor List': companyName
        },
        result
      }, '*');
    }

    if (savedCount) {
      await syncProcurementAdminFromGoogleSheet(false);
      if (status) status.textContent = `${savedCount} data pending berhasil disinkronkan otomatis.`;
      if (!options.silent) alert(`${savedCount} data vendor & tanggal yang tertunda berhasil disinkronkan.`);
    }
    return savedCount > 0;
  } catch (error) {
    console.warn('Retry sinkron Company Name belum berhasil:', error);
    return false;
  } finally {
    BIDDER_PROCUREMENT_RETRY_IN_FLIGHT = false;
  }
}

async function saveBidderListToProcurementAdmin(options = {}) {
  if (BIDDER_PROCUREMENT_SAVE_IN_FLIGHT) return false;
  BIDDER_PROCUREMENT_SAVE_IN_FLIGHT = true;
  let pendingCached = false;

  const button = document.getElementById('saveBidderToProcurementBtn');
  const menuButton = document.getElementById('saveBidderToProcurementMenuBtn');
  const status = document.getElementById('saveStatus');
  if (button) button.disabled = true;
  if (menuButton) menuButton.disabled = true;

  try {
    const meta = getBidderMeta();
    const noPR = String(meta.nopr || '').trim();
    const round = normalizeDocumentRound(getDocumentRound(meta) || 'R0');
    const invitedVendors = (DATA?.structured?.BidderList?.rows || [])
      .map(row => String(row?.['Name of Invited Supplier'] || '').trim())
      .filter(Boolean)
      .filter((name, index, list) =>
        list.findIndex(item => companyNamesEquivalent(item, name)) === index
      );

    if (!noPR) {
      throw new Error('No PR wajib diisi sebelum menyimpan vendor dan tanggal.');
    }
    if (!invitedVendors.length) {
      throw new Error('Vendor yang diundang masih kosong.');
    }

    const openDate = formatMetaDate(meta.open_date || '');
    let closeDate = formatMetaDate(meta.close_date || '');
    if (openDate && !closeDate) {
      closeDate = formatMetaDate(addDays(openDate, 7));
      meta.close_date = closeDate;
    }

    if (!openDate) {
      throw new Error('Open Date wajib diisi sebelum menyimpan ke Procurement Admin.');
    }
    if (!closeDate) {
      throw new Error('Close Date wajib diisi sebelum menyimpan ke Procurement Admin.');
    }

    meta.open_date = openDate;
    meta.close_date = closeDate;

    // Tombol ini khusus untuk Procurement Admin. Jangan menjalankan
    // SAVE_WORKSPACE di sini karena targetnya hanya field round aktif dan daftar final:
    // Rn Company, Rn Start Date, Rn Finish Date, dan Final Vendor List.
    // Autosave workspace tetap berjalan melalui mekanismenya sendiri dan tidak
    // boleh menghalangi penyimpanan Company Name.

    // Ambil Version terbaru sesaat sebelum partial update. Ini mengurangi
    // konflik palsu akibat cache Procurement Admin yang sudah tertinggal.
    await syncProcurementAdminFromGoogleSheet(false);
    const procurementRow = findProcurementRowByNoPR(noPR);
    if (!procurementRow) {
      throw new Error(`No PR ${noPR} tidak ditemukan pada Procurement Admin.`);
    }

    const procurementVersion = Number(getProcurementAdminValue(procurementRow, [
      'Version', '__version', 'version'
    ]) || 0);

    if (status) status.textContent = 'Menyimpan Company Name, Start Date, dan Finish Date ke Procurement Admin...';

    // Cache-first: data aman di browser sebelum dikirim ke Google Sheet.
    // Partial EDIT hanya menyentuh field vendor/tanggal pada Round PR aktif dan Final Vendor List.
    const vendorText = invitedVendors.join('\n');
    const existingCompany = String(getProcurementAdminValue(procurementRow, [
      `${round} Company`, `${round.toLowerCase()}company`, 'Round Company'
    ]) || '').trim();
    const existingStartDate = formatMetaDate(getProcurementAdminValue(procurementRow, [
      `${round} Start Date`, `${round.toLowerCase()}startdate`, 'Round Start Date'
    ]) || '');
    const existingFinishDate = formatMetaDate(getProcurementAdminValue(procurementRow, [
      `${round} Finish Date`, `${round.toLowerCase()}finishdate`, 'Round Finish Date'
    ]) || '');
    const existingFinalVendorList = String(getProcurementAdminValue(procurementRow, [
      'Final Vendor List', 'finalvendorlist'
    ]) || '').trim();
    const normalizeVendorLines = value => String(value || '')
      .split(/\r?\n|;/)
      .map(item => item.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join('|');

    if (
      normalizeVendorLines(existingCompany) === normalizeVendorLines(vendorText) &&
      existingStartDate === openDate &&
      existingFinishDate === closeDate &&
      normalizeVendorLines(existingFinalVendorList) === normalizeVendorLines(vendorText)
    ) {
      clearBidderProcurementPending(noPR, round);
      if (status) status.textContent = `Data ${round} sudah sama di Procurement Admin; tidak ditulis ulang.`;
      if (options.showSuccessAlert !== false) {
        alert(`Data BidderList ${round} sudah tersimpan dan tidak ditulis ulang.`);
      }
      return true;
    }

    const procurementPartial = {
      noPR,
      [`${round} Company`]: vendorText,
      [`${round} Start Date`]: openDate,
      [`${round} Finish Date`]: closeDate,
      'Final Vendor List': vendorText,
      __version: procurementVersion
    };

    cacheBidderProcurementPending({
      noPR,
      round,
      companyName: vendorText,
      finalVendorList: vendorText,
      startDate: openDate,
      finishDate: closeDate,
      procurementVersion
    });
    pendingCached = true;

    const result = await postProcurementUpdate({
      action: 'EDIT',
      sheet: 'Admin',
      originalPR: noPR,
      data: procurementPartial
    });

    if (!result.success) {
      if (result.conflict) {
        throw new Error([
          result.message || 'Data Procurement telah diperbarui user lain.',
          `Diubah oleh: ${result.updatedBy || '-'}`,
          `Waktu: ${result.updatedAt || '-'}`
        ].join('\n'));
      }
      throw new Error(result.message || 'Gagal menyimpan vendor dan tanggal ke Procurement Admin.');
    }

    // Coba muat ulang agar cache lokal sama dengan Google Sheet. Jika jaringan
    // terlambat, data hasil backend tetap dipakai sebagai fallback.
    try {
      await syncProcurementAdminFromGoogleSheet(false);
    } catch (refreshError) {
      console.warn('Refresh Procurement Admin setelah sinkronisasi gagal:', refreshError);
    }

    clearBidderProcurementPending(noPR, round);

    const backendRow = result.data || {};
    const latestProcurementRow = findProcurementRowByNoPR(noPR) || {};
    const refreshedRow = {
      ...(procurementRow || {}),
      ...latestProcurementRow,
      ...backendRow,
      'No PR': noPR,
      [`${round} Company`]: vendorText,
      [`${round} Start Date`]: openDate,
      [`${round} Finish Date`]: closeDate,
      'Final Vendor List': vendorText,
      finalvendorlist: vendorText,
      Version: result.version || latestProcurementRow.Version || procurementVersion
    };

    window.parent?.postMessage({
      action: 'BIDDERLIST_PROCUREMENT_UPDATED',
      noPR,
      round,
      data: refreshedRow,
      result
    }, '*');

    let documentSyncResult = null;
    if (options.syncDocuments) {
      if (status) status.textContent = 'Data Procurement tersimpan | Memperbarui dokumen native di Drive...';
      documentSyncResult = await syncNativeDocumentsToDrive({ silent: true, force: true });
    }

    if (status) {
      status.textContent = `Company Name & tanggal tersimpan | ${round} | ${invitedVendors.length} vendor | ${new Date().toLocaleString('id-ID')}`;
    }

    if (options.showSuccessAlert !== false) {
      const documentSummary = summarizeNativeDocumentSync(documentSyncResult);
      alert([
        'Vendor berhasil disimpan ke Company Name; Open Date/Close Date berhasil disimpan ke Start Date/Finish Date Procurement Admin.',
        `No PR: ${noPR}`,
        `Round: ${round}`,
        `Tujuan: ${round} Company, ${round} Start Date, ${round} Finish Date, Final Vendor List`,
        `Vendor: ${invitedVendors.length}`,
        `Open Date: ${openDate}`,
        `Close Date: ${closeDate}`,
        documentSummary || ''
      ].filter(Boolean).join('\n'));
    }

    recordProcurementActivity({
      type: 'BIDDERLIST',
      noPR,
      documentNo: formatRFQDisplayFromMeta(meta),
      status: 'Company & Dates Saved',
      detail: `${invitedVendors.length} vendor · ${openDate} sampai ${closeDate}`,
      round
    });
    return true;
  } catch (error) {
    if (status) {
      status.textContent = pendingCached
        ? `Tersimpan di cache dan akan dicoba ulang otomatis: ${error.message || error}`
        : `Gagal menyimpan vendor & tanggal: ${error.message || error}`;
    }
    alert(`Gagal menyimpan vendor & tanggal ke Procurement Admin:\n${error.message || error}`);
    return false;
  } finally {
    BIDDER_PROCUREMENT_SAVE_IN_FLIGHT = false;
    if (button) button.disabled = false;
    if (menuButton) menuButton.disabled = false;
  }
}

ensureSaveToProcurementButtons();

// =========================================
// SIDEBAR
// =========================================

const toggleMenu = document.getElementById("toggleMenu");
const sidebar = document.querySelector("aside");
const hover = document.getElementById("sidebarHover");

let collapsed = false;

toggleMenu.addEventListener("click", () => {
    collapsed = !collapsed;
    document.body.classList.toggle("sidebar-hide", collapsed);
});

hover.addEventListener("mouseenter", () => {
    if (collapsed) {
        document.body.classList.remove("sidebar-hide");
    }
});

sidebar.addEventListener("mouseleave", () => {
    if (collapsed) {
        document.body.classList.add("sidebar-hide");
    }
});

const GAS_URL = String(window.APP_CONFIG?.GAS_URL || "").trim();

// Profil user yang sedang login (nama & no HP), diambil sekali dari backend
// dan dipakai otomatis di signature email -- supaya tiap Buyer yang login
// tidak perlu isi manual kolom "Signature Buyer" setiap kali bikin draft.
let CURRENT_USER_PROFILE = null;
let CURRENT_USER_PROFILE_PROMISE = null;

async function loadCurrentUserProfile() {
  if (CURRENT_USER_PROFILE) return CURRENT_USER_PROFILE;
  if (CURRENT_USER_PROFILE_PROMISE) return CURRENT_USER_PROFILE_PROMISE;

  CURRENT_USER_PROFILE_PROMISE = (async () => {
    try {
      const response = await fetch(`${GAS_URL}?action=getCurrentUserProfile`);
      const result = JSON.parse((await response.text()) || '{}');
      CURRENT_USER_PROFILE = result?.success ? result : { email: '', name: '', phone: '' };
    } catch (error) {
      console.warn('Gagal mengambil profil user login:', error);
      CURRENT_USER_PROFILE = { email: '', name: '', phone: '' };
    }
    return CURRENT_USER_PROFILE;
  })();

  return CURRENT_USER_PROFILE_PROMISE;
}

// Panggil sedini mungkin supaya sudah siap saat draft pertama kali dibuat.
loadCurrentUserProfile();
let VENDOR_COMPANIES = [];
let vendorSourceLabel = 'Fallback dari sheet FIND';

const PROCUREMENT_DOCUMENT_VIEW_CONFIG = {
  BIDDERLIST: { label: 'BidderList', view: 'BidderList', folderName: '02. Bidderlist & Quotation' },
  RFQ: { label: 'RFQ', view: 'RFQ', folderName: '02. Bidderlist & Quotation' },
  CQS: { label: 'CQS', view: 'CQS', folderName: '03. CQS' }
};

let PROCUREMENT_DOCUMENT_STATE = {
  key: '',
  loading: false,
  loaded: false,
  documents: {}
};

// Dokumen yang sedang dibuka pada viewer. Nilai ini dipakai oleh tombol
// Download/Open Excel dan Save Back to Storage agar file yang sudah diedit
// selalu kembali ke jenis dokumen serta subfolder No PR yang benar.
let ACTIVE_STORED_DOCUMENT_TYPE = '';
let STORED_DOCUMENT_UPLOAD_IN_FLIGHT = false;

let MULTIPLE_EMAIL_ATTACHMENT_CONTEXT = null;
let MULTIPLE_EMAIL_FOLDER_FILES = [];
let ACTIVE_MULTIPLE_EMAIL_MODE = 'vendor';

const MULTIPLE_EMAIL_VENDOR_CONFIG = {
  RFQ_INVITATION: {
    label: 'RFQ Baru',
    description: 'Undangan awal pengiriman quotation.',
    attachmentHint: 'PR/RFQ + Terms & Conditions'
  },
  RFQ_REBID: {
    label: 'Rebid RFQ',
    description: 'Undangan ulang karena kuorum penawaran belum tercapai.',
    attachmentHint: 'PR/RFQ + Terms & Conditions'
  },
  RFQ_REMINDER: {
    label: 'Reminder RFQ',
    description: 'Pengingat closing penawaran kepada vendor.',
    attachmentHint: 'PR/RFQ; Terms & Conditions opsional'
  },
  RFQ_CANCEL: {
    label: 'Cancel RFQ',
    description: 'Pemberitahuan pembatalan proses RFQ.',
    attachmentHint: 'Attachment opsional'
  },
  RFQ_UNSUCCESSFUL: {
    label: 'Vendor Tidak Terpilih',
    description: 'Pemberitahuan hasil evaluasi kepada vendor yang tidak terpilih.',
    attachmentHint: 'Attachment opsional'
  }
};

// Sumber attachment Multiple Email dibuat tetap agar Buyer tidak mengambil
// dokumen dari lokasi yang salah.
const MULTIPLE_EMAIL_ATTACHMENT_SOURCES = {
  'Attch PR': {
    value: '01. PR Approval',
    label: 'PR / RFQ — 01. PR Approval pada folder No PR aktif'
  },
  'Attch TC': {
    value: 'TC_MASTER',
    label: 'Terms & Conditions — folder master TC'
  }
};

// Email internal yang masih dipakai pada workbook Multiple Email.xlsm.
// Release PR mengambil PR/RFQ + Bidderlist, PO Proc mengambil PO + CQS,
// sedangkan Release PO, Proforma PO, dan Surat Penunjukan memakai wording
// serta attachment masing-masing.
const RUNTIME_EMAIL_CONFIG = window.APP_CONFIG?.EMAILS || {};
const PROCUREMENT_INBOX_EMAIL = String(
  RUNTIME_EMAIL_CONFIG.procurementInbox || 'procurement@example.com'
).trim();
const PROCUREMENT_CC_EMAIL = String(
  RUNTIME_EMAIL_CONFIG.procurementCc || 'procurement.cc@example.com'
).trim();
const PROCUREMENT_EMAIL_EN = PROCUREMENT_CC_EMAIL
  ? `${PROCUREMENT_INBOX_EMAIL} and cc ${PROCUREMENT_CC_EMAIL}`
  : PROCUREMENT_INBOX_EMAIL;
const PROCUREMENT_EMAIL_ID = PROCUREMENT_CC_EMAIL
  ? `${PROCUREMENT_INBOX_EMAIL} dengan tembusan ${PROCUREMENT_CC_EMAIL}`
  : PROCUREMENT_INBOX_EMAIL;
const MULTIPLE_EMAIL_RELEASE_PO_CC = Array.isArray(RUNTIME_EMAIL_CONFIG.releasePoCc)
  ? RUNTIME_EMAIL_CONFIG.releasePoCc.filter(Boolean).join('; ')
  : String(RUNTIME_EMAIL_CONFIG.releasePoCc || '').trim();

const MULTIPLE_EMAIL_INTERNAL_CONFIG = {
  RELEASE_PR: {
    label: 'Release PR',
    to: String(RUNTIME_EMAIL_CONFIG.releasePrTo || '').trim(),
    cc: String(RUNTIME_EMAIL_CONFIG.releasePrCc || '').trim(),
    attachmentSources: [
      { folderType: '01. PR Approval', label: 'Pilih PR / RFQ' },
      { folderType: '02. Bidderlist & Quotation', label: 'Pilih Bidderlist' }
    ]
  },
  PO_PROC: {
    label: 'PO Proc',
    to: String(RUNTIME_EMAIL_CONFIG.poProcTo || '').trim(),
    cc: '',
    attachmentSources: [
      { folderType: '04. PO', label: 'Pilih PO' },
      { folderType: '03. CQS', label: 'Pilih CQS Approval' }
    ]
  },
  RELEASE_PO: {
    label: 'Release PO',
    to: '',
    cc: MULTIPLE_EMAIL_RELEASE_PO_CC,
    dynamicRecipient: true,
    attachmentSources: [
      { folderType: '04. PO', label: 'Pilih PO Original' },
      { folderType: 'TC_MASTER', label: 'Pilih Terms & Conditions' },
      { folderType: 'PROCUREMENT_MASTER', label: 'Pilih Surat Submission Invoice' }
    ]
  },
  PROFORMA_PO: {
    label: 'Proforma PO',
    to: '',
    cc: MULTIPLE_EMAIL_RELEASE_PO_CC,
    dynamicRecipient: true,
    attachmentSources: [
      { folderType: '04. PO', label: 'Pilih Proforma PO / Draft PO' }
    ]
  },
  SURAT_PENUNJUKAN: {
    label: 'Surat Penunjukan',
    to: String(RUNTIME_EMAIL_CONFIG.appointmentTo || '').trim(),
    cc: '',
    attachmentSources: [
      { folderType: '04. PO', label: 'Pilih Surat Penunjukan' }
    ]
  }
};

const subtitles = {
  BidderList: 'Daftar supplier yang diundang dan status quotation.',
  RFQ: 'Request for Quotation: item, syarat dokumen, dan terms & conditions.',
  CQS: 'Commercial Quotation Summary dari seluruh vendor yang mengirim quotation.',
  Multiple_Email: 'Pengiriman RFQ vendor dan email internal melalui Outlook Draft dengan attachment.',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function pathToArray(path) { 
  return String(path).split('.'); 
}

function getByPath(path) { 
  return pathToArray(path).reduce((obj, key) => obj?.[key], DATA); 
}


function getWorkspaceDraftKey(noPR = '', round = '') {
  const normalizedPR = normalizeTextKey(noPR || getBidderMeta()?.nopr || '');
  const normalizedRound = normalizeDocumentRound(round || getDocumentRound(getBidderMeta()));
  return normalizedPR ? `eproc-workspace-draft::${normalizedPR}::${normalizedRound}` : '';
}

function persistWorkspaceDraftLocally() {
  const meta = getBidderMeta();
  const key = getWorkspaceDraftKey(meta?.nopr, getDocumentRound(meta));
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify({
      version: WORKSPACE_VERSION,
      changeSequence: WORKSPACE_CHANGE_SEQUENCE,
      savedAt: new Date().toISOString(),
      structured: {
        BidderList: DATA.structured.BidderList,
        RFQ: DATA.structured.RFQ,
        CQS: DATA.structured.CQS,
        Multiple_Email: DATA.structured.Multiple_Email
      }
    }));
  } catch (error) {
    console.warn('Draft lokal tidak dapat disimpan:', error);
  }
}

function clearWorkspaceDraftLocally() {
  const meta = getBidderMeta();
  const key = getWorkspaceDraftKey(meta?.nopr, getDocumentRound(meta));
  if (!key) return;
  try { sessionStorage.removeItem(key); } catch (ignore) {}
}

function restoreWorkspaceDraftLocally(noPR, round) {
  const key = getWorkspaceDraftKey(noPR, round);
  if (!key) return false;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (!draft?.structured) return false;
    if (Number(draft.version || 0) !== Number(WORKSPACE_VERSION || 0)) {
      sessionStorage.removeItem(key);
      return false;
    }
    DATA.structured.BidderList = structuredClone(draft.structured.BidderList || DATA.structured.BidderList);
    DATA.structured.RFQ = structuredClone(draft.structured.RFQ || DATA.structured.RFQ);
    DATA.structured.CQS = structuredClone(draft.structured.CQS || DATA.structured.CQS || { vendors: {} });
    DATA.structured.Multiple_Email = structuredClone(draft.structured.Multiple_Email || DATA.structured.Multiple_Email);
    WORKSPACE_CHANGE_SEQUENCE = Math.max(WORKSPACE_CHANGE_SEQUENCE, Number(draft.changeSequence || 0));
    dirty = true;
    return true;
  } catch (error) {
    console.warn('Draft lokal tidak dapat dipulihkan:', error);
    return false;
  }
}

function scheduleWorkspaceAutoSave() {
  if (!editMode || !dirty || WORKSPACE_LOADING_KEY) return;
  const meta = getBidderMeta();
  if (!String(meta?.nopr || '').trim()) return;
  clearTimeout(WORKSPACE_AUTOSAVE_TIMER);
  WORKSPACE_AUTOSAVE_TIMER = setTimeout(() => runWorkspaceAutoSave(), WORKSPACE_AUTOSAVE_DELAY_MS);
}

async function runWorkspaceAutoSave() {
  clearTimeout(WORKSPACE_AUTOSAVE_TIMER);
  WORKSPACE_AUTOSAVE_TIMER = null;
  if (!editMode || !dirty || WORKSPACE_LOADING_KEY) return false;
  if (WORKSPACE_SAVE_IN_FLIGHT) {
    WORKSPACE_SAVE_PENDING = true;
    return false;
  }
  const status = document.getElementById('saveStatus');
  if (status) status.textContent = 'Menyimpan otomatis...';
  const saved = await saveData(false, { automatic: true });
  if (WORKSPACE_SAVE_PENDING) {
    WORKSPACE_SAVE_PENDING = false;
    scheduleWorkspaceAutoSave();
  }
  return saved;
}

function markDirty(message='Perubahan belum disimpan.') {
  dirty = true;
  WORKSPACE_CHANGE_SEQUENCE += 1;
  WORKSPACE_LAST_SAVE_ERROR = '';
  persistWorkspaceDraftLocally();
  const el = document.getElementById('saveStatus');
  if (el) el.textContent = editMode
    ? `${message.replace(/Klik Save[^.]*\.?/i, '').trim()} Autosave aktif.`
    : message;
  scheduleWorkspaceAutoSave();
}

function normalizeTextKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeCompanyMatchKey(value, removeLegalEntity = false) {
  let text = String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!removeLegalEntity) return text.replace(/\s/g, '');

  const legalTokens = new Set([
    'pt', 'cv', 'tbk', 'ltd', 'limited', 'inc', 'incorporated',
    'corp', 'corporation', 'llc', 'pte', 'plc', 'co', 'company'
  ]);
  return text
    .split(' ')
    .filter(token => token && !legalTokens.has(token))
    .join('');
}

function companyNamesEquivalent(left, right) {
  const exactLeft = normalizeCompanyMatchKey(left, false);
  const exactRight = normalizeCompanyMatchKey(right, false);
  if (!exactLeft || !exactRight) return false;
  if (exactLeft === exactRight) return true;

  const baseLeft = normalizeCompanyMatchKey(left, true);
  const baseRight = normalizeCompanyMatchKey(right, true);
  return Boolean(baseLeft && baseRight && baseLeft === baseRight);
}

function pickValueByAliases(obj, aliases) {
  if (!obj || typeof obj !== 'object') return '';
  const normalizedAliases = aliases.map(normalizeTextKey);
  for (const [key, value] of Object.entries(obj)) {
    if (normalizedAliases.includes(normalizeTextKey(key))) return String(value ?? '').trim();
  }
  return '';
}

function normalizeVendorRecord(record) {
  const companyName = pickValueByAliases(record, ['Company Name', 'Name of Invited Supplier', 'Supplier', 'Vendor', 'Vendor Name', 'Company']);
  if (!companyName) return null;
  return {
    companyName,
    customerContact: pickValueByAliases(record, ['CUSTOMER CONTACT', 'Customer Contact', 'Contact Person', 'Contact', 'PIC', 'Nama']),
    companyPhone: pickValueByAliases(record, ['COMPANY PHONE', 'Company Phone', 'No Telp', 'Phone', 'Telephone', 'Telp', 'HP', 'Mobile']),
    email: pickValueByAliases(record, ['EMAIL', 'Email', 'Email Address', 'Alamat Email']),
    registerStatus: pickValueByAliases(record, ['Status Register', 'Register Status', 'Status', 'status']),
    companyStatus: pickValueByAliases(record, ['Company Status', 'companystatus']),
    noCompany: pickValueByAliases(record, ['No Company', 'NoCompany', 'noCompany']),
    coreBusiness: pickValueByAliases(record, ['Core Business', 'corebusiness']),
    address: pickValueByAliases(record, ['Address Company', 'Address', 'address']),
    contactPersons: Array.isArray(record.contactPersons) ? record.contactPersons : (Array.isArray(record.contacts) ? record.contacts : []),
    raw: record
  };
}

function dedupeVendorRecords(records) {
  const map = new Map();
  records.forEach(record => {
    const normalized = normalizeVendorRecord(record);
    if (!normalized) return;
    const key = normalizeTextKey(normalized.companyName);
    if (!map.has(key)) map.set(key, normalized);
    else {
      const current = map.get(key);
      map.set(key, {
        ...current,
        customerContact: current.customerContact || normalized.customerContact,
        companyPhone: current.companyPhone || normalized.companyPhone,
        email: current.email || normalized.email,
        registerStatus: current.registerStatus || normalized.registerStatus,
        companyStatus: current.companyStatus || normalized.companyStatus,
        noCompany: current.noCompany || normalized.noCompany,
        coreBusiness: current.coreBusiness || normalized.coreBusiness,
        address: current.address || normalized.address,
        contactPersons: current.contactPersons?.length ? current.contactPersons : normalized.contactPersons,
        raw: {...normalized.raw, ...current.raw}
      });
    }
  });
  return [...map.values()].sort((a, b) => a.companyName.localeCompare(b.companyName, 'id'));
}


function findHeaderIndex(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeTextKey);
  return headers.findIndex(header => normalizedAliases.includes(normalizeTextKey(header)));
}

function parseMatrixRows(rows) {
  const output = [];
  for (let i = 0; i < rows.length; i++) {
    const header = rows[i].map(value => String(value ?? '').trim());
    const companyIdx = findHeaderIndex(header, ['Company Name', 'Name of Invited Supplier', 'Supplier', 'Vendor', 'Vendor Name', 'Company']);
    if (companyIdx < 0) continue;
    const contactIdx = findHeaderIndex(header, ['CUSTOMER CONTACT', 'Customer Contact', 'Contact Person', 'Contact', 'PIC', 'Nama']);
    const phoneIdx = findHeaderIndex(header, ['COMPANY PHONE', 'Company Phone', 'No Telp', 'Phone', 'Telephone', 'Telp', 'HP', 'Mobile']);
    const emailIdx = findHeaderIndex(header, ['EMAIL', 'Email', 'Email Address', 'Alamat Email']);
    const registerIdx = findHeaderIndex(header, ['Status Register', 'Register Status', 'Status']);
    const companyStatusIdx = findHeaderIndex(header, ['Company Status']);
    const noCompanyIdx = findHeaderIndex(header, ['No Company', 'NoCompany']);
    const coreBusinessIdx = findHeaderIndex(header, ['Core Business']);
    const addressIdx = findHeaderIndex(header, ['Address Company', 'Address']);
    for (let r = i + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const companyName = String(row[companyIdx] ?? '').trim();
      if (!companyName) continue;
      output.push({
        'Company Name': companyName,
        'CUSTOMER CONTACT': contactIdx >= 0 ? row[contactIdx] : '',
        'COMPANY PHONE': phoneIdx >= 0 ? row[phoneIdx] : '',
        'EMAIL': emailIdx >= 0 ? row[emailIdx] : '',
        'Status Register': registerIdx >= 0 ? row[registerIdx] : '',
        'Company Status': companyStatusIdx >= 0 ? row[companyStatusIdx] : '',
        'No Company': noCompanyIdx >= 0 ? row[noCompanyIdx] : '',
        'Core Business': coreBusinessIdx >= 0 ? row[coreBusinessIdx] : '',
        'Address Company': addressIdx >= 0 ? row[addressIdx] : ''
      });
    }
  }
  return output;
}

function collectVendorRecordsFromJSON(value, output=[]) {
  if (Array.isArray(value)) {
    if (value.every(item => Array.isArray(item))) output.push(...parseMatrixRows(value));
    value.forEach(item => collectVendorRecordsFromJSON(item, output));
    return output;
  }
  if (value && typeof value === 'object') {
    const vendor = normalizeVendorRecord(value);
    if (vendor) output.push(value);
    Object.values(value).forEach(item => collectVendorRecordsFromJSON(item, output));
  }
  return output;
}

function syncExistingBidderNoCompany() {
  const rows = DATA?.structured?.BidderList?.rows;
  if (!Array.isArray(rows)) return;

  rows.forEach(row => {
    const vendor = findVendorByCompany(row?.['Name of Invited Supplier']);
    if (vendor) row['No Company'] = vendor.noCompany || '';
  });
}

function setVendorCompanies(records, sourceLabel) {
  VENDOR_COMPANIES = dedupeVendorRecords(records);
  vendorSourceLabel = sourceLabel;
  ensureBidderNoCompanyColumn();
  syncExistingBidderNoCompany();
  updateVendorStatus();

  if (currentView === 'BidderList') {
    renderCurrent();
  }
}

function updateVendorStatus(extraMessage='') {
  const el = document.getElementById('vendorStatusText');
  if (!el) return;
  const count = VENDOR_COMPANIES.length;
  el.textContent = `${count} vendor | ${vendorSourceLabel}${extraMessage ? ' | ' + extraMessage : ''}`;
}

async function syncVendorCompanyFromGoogleSheet(showAlert = false) {
  try {
    const res = await fetch(`${GAS_URL}?sheet=Company`, { cache: 'no-store' });
    const data = await res.json();
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (!rows.length) {
      updateVendorStatus('Tab Company di Google Sheet masih kosong');
      if (showAlert) alert('Data Company di Google Sheet masih kosong.');
      return false;
    }
    setVendorCompanies(rows, 'Google Sheet (tab Company)');
    if (showAlert) alert(`Berhasil sync ${VENDOR_COMPANIES.length} vendor langsung dari Google Sheet (tab Company).`);
    return true;
  } catch (error) {
    console.warn('Gagal sync Company dari Google Sheet:', error);
    if (showAlert) alert('Gagal mengambil data dari Google Sheet (tab Company).\n\n' + error.message);
    return false;
  }
}

async function initVendorCompanyData() {
    const liveOk =
    await syncVendorCompanyFromGoogleSheet(false);

    if (liveOk) return;

    VENDOR_COMPANIES = [];
    vendorSourceLabel = 'Google Sheet (Company)';

    updateVendorStatus();
    updateCQSNavigationStatus();
}

function findVendorByCompany(companyName) {
  const exactKey = normalizeCompanyMatchKey(companyName, false);
  if (!exactKey) return null;

  const exact = VENDOR_COMPANIES.find(v =>
    normalizeCompanyMatchKey(v.companyName, false) === exactKey
  );
  if (exact) return exact;

  const baseKey = normalizeCompanyMatchKey(companyName, true);
  if (!baseKey) return null;
  const candidates = VENDOR_COMPANIES.filter(v =>
    normalizeCompanyMatchKey(v.companyName, true) === baseKey
  );
  return candidates.length === 1 ? candidates[0] : null;
}

function ensureManualVendorDefaults(row) {
  const companyName = String(row?.['Name of Invited Supplier'] || '').trim();
  const vendor = companyName ? findVendorByCompany(companyName) : null;
  if (!companyName) {
    row['No Company'] = '';
    row['Register Status'] = '';
    return null;
  }
  if (!vendor) {
    row['No Company'] = 'New Vendor';
    row['Register Status'] = 'No Register';
  }
  return vendor;
}

function applySupplierName(rowIndex, companyName, finalize = false) {
  const rows = getByPath('structured.BidderList.rows');
  if (!Array.isArray(rows) || !rows[rowIndex]) return;
  const row = rows[rowIndex];
  const previousName = String(row['Name of Invited Supplier'] || '').trim();
  const nextName = String(companyName || '').trim();
  const vendor = findVendorByCompany(nextName);
  const companyChanged = previousName && !companyNamesEquivalent(previousName, nextName);

  row['Name of Invited Supplier'] = nextName;
  if (vendor) {
    row['No Company'] = vendor.noCompany || 'New Vendor';
    row['Contact Person'] = vendor.customerContact || '';
    row['No Telp'] = vendor.companyPhone || '';
    row['Email'] = vendor.email || '';
    row['Register Status'] = vendor.registerStatus || 'No Register';
    row['Company Status'] = vendor.companyStatus || row['Company Status'] || '';
    row.__vendorSnapshot = {
      noCompany: vendor.noCompany || '',
      companyName: vendor.companyName || '',
      address: vendor.address || '',
      customerContact: vendor.customerContact || '',
      companyPhone: vendor.companyPhone || '',
      email: vendor.email || '',
      registerStatus: vendor.registerStatus || '',
      companyStatus: vendor.companyStatus || '',
      contactPersons: vendor.contactPersons || []
    };
  } else if (nextName) {
    row['No Company'] = 'New Vendor';
    row['Register Status'] = 'No Register';
    if (companyChanged) {
      row['Contact Person'] = '';
      row['No Telp'] = '';
      row['Email'] = '';
      row['Company Status'] = '';
    }
    row.__vendorSnapshot = null;
    row.__selectedCQS = false;
  } else {
    row['No Company'] = '';
    row['Contact Person'] = '';
    row['No Telp'] = '';
    row['Email'] = '';
    row['Register Status'] = '';
    row['Company Status'] = '';
    row.__vendorSnapshot = null;
    row.__selectedCQS = false;
  }

  markDirty(vendor
    ? 'Vendor ditemukan; data kontak otomatis diisi.'
    : 'Vendor manual disimpan sebagai New Vendor / No Register.');
  if (finalize) renderCurrent();
}

function handleSupplierManualInput(inputEl) {
  applySupplierName(Number(inputEl.dataset.row), inputEl.value, false);
}

function handleSupplierManualCommit(inputEl) {
  applySupplierName(Number(inputEl.dataset.row), inputEl.value, true);
}

function handleBidderManualField(inputEl) {
  const rows = getByPath('structured.BidderList.rows');
  const rowIndex = Number(inputEl.dataset.row);
  const key = inputEl.dataset.key;
  if (!Array.isArray(rows) || !rows[rowIndex] || !key) return;
  rows[rowIndex][key] = inputEl.value;
  ensureManualVendorDefaults(rows[rowIndex]);
  markDirty(`${key} berubah. Menunggu autosave...`);
}

function handleSupplierSelect(selectEl) {
  applySupplierName(Number(selectEl.dataset.row), selectEl.value, true);
}


function renderSourceToolsGrid() {
  // Procurement Admin dan Vendor Company tetap tersinkron otomatis di background.
  // Kartu sumber manual dihapus agar halaman lebih ringkas; hanya snapshot kurs PR ditampilkan.
  return `<div class="source-tools-grid source-tools-grid-dollar-only">
    ${renderDollarTools()}
  </div>`;
}

const CQS_EXCLUSION_REASONS = [
  'No Quote',
  'Quote (cc Buyer)',
  'Quote (Disqualification Timeline)'
];

function getInvitedBidderRows() {
  return (DATA?.structured?.BidderList?.rows || [])
    .map((row, index) => ({ row, index }))
    .filter(item => String(item.row?.['Name of Invited Supplier'] || '').trim());
}

function getMissingCQSExclusionReasons() {
  return getInvitedBidderRows().filter(item =>
    !item.row.__selectedCQS &&
    !CQS_EXCLUSION_REASONS.includes(String(item.row.__cqsExclusionReason || '').trim())
  );
}

function buildCQSExcludedVendorNote() {
  return getInvitedBidderRows()
    .filter(item => !item.row.__selectedCQS)
    .map(item => {
      const company = String(item.row['Name of Invited Supplier'] || '').trim();
      const reason = String(item.row.__cqsExclusionReason || '').trim();
      return company && reason ? `${company} - ${reason}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function setCQSExclusionReason(rowIndex, value) {
  const row = DATA?.structured?.BidderList?.rows?.[Number(rowIndex)];
  if (!row) return;
  row.__cqsExclusionReason = CQS_EXCLUSION_REASONS.includes(value) ? value : '';
  markDirty('Alasan vendor tidak masuk CQS berubah. Menunggu autosave...');
  renderCurrent();
}

function getSelectedCQSVendors() {
  const rows = DATA?.structured?.BidderList?.rows || [];
  const selected = rows
    .map((row, index) => ({ row, index }))
    .filter(item => Boolean(item.row?.__selectedCQS) && String(item.row?.['Name of Invited Supplier'] || '').trim());
  selected.forEach((item, fallbackIndex) => {
    if (!Number.isFinite(Number(item.row.__cqsOrder))) item.row.__cqsOrder = fallbackIndex + 1;
  });
  return selected.sort((a, b) => Number(a.row.__cqsOrder) - Number(b.row.__cqsOrder));
}

function updateCQSNavigationStatus() {
  const selectedCount = getSelectedCQSVendors().length;
  const rfqReady = hasRFQDescriptionItems();
  const templateAvailable = selectedCount >= 1 && selectedCount <= 10;
  const exclusionsReady = getMissingCQSExclusionReasons().length === 0;
  const ready = templateAvailable && rfqReady && exclusionsReady;
  const flowAllowsCQS = isCQSFlowAllowed();
  const cqsAccessible = selectedCount >= 1 && selectedCount <= 10;
  const templateSheet = selectedCount <= 3 ? '3V' : `${selectedCount}V`;
  const status = document.getElementById('cqsNavStatus');
  const button = document.getElementById('cqsNavBtn');

  if (status) {
    if (!selectedCount) status.textContent = '0V';
    else status.textContent = ready ? `${selectedCount}V Ready` : `${selectedCount}V Dummy`;
  }

  if (button) {
    button.classList.toggle('is-dummy', cqsAccessible && !ready);
    button.disabled = !cqsAccessible;
    button.title = selectedCount < 1
      ? 'Pilih minimal 1 vendor yang masuk CQS'
      : !templateAvailable
        ? `Master CQS tersedia untuk 1 sampai 10 vendor; saat ini ${selectedCount} vendor dipilih`
        : !rfqReady
          ? 'CQS dapat dibuka sebagai DUMMY; isi Description RFQ agar menjadi READY'
          : !exclusionsReady
            ? `${getMissingCQSExclusionReasons().length} vendor yang tidak masuk CQS belum memiliki alasan`
            : `CQS siap menggunakan sheet ${templateSheet}`;
  }

  if (window.parent !== window) {
    window.parent.postMessage({
      action: 'CQS_STATUS',
      ready,
      selectedCount,
      rfqReady,
      exclusionsReady,
      accessible: cqsAccessible,
      flowAllowsCQS,
      templateAvailable,
      templateSheet
    }, '*');
  }
}

function toggleCQSSelection(rowIndex, checked) {
  const rows = DATA?.structured?.BidderList?.rows || [];
  const row = rows[rowIndex];
  if (!row) return;

  row.__selectedCQS = Boolean(checked);
  if (checked) {
    const currentOrders = getSelectedCQSVendors()
      .filter(item => item.index !== rowIndex)
      .map(item => Number(item.row.__cqsOrder) || 0);
    row.__cqsOrder = Math.max(0, ...currentOrders) + 1;
    row.__cqsExclusionReason = '';
  } else {
    delete row.__cqsOrder;
    getSelectedCQSVendors().forEach((item, index) => { item.row.__cqsOrder = index + 1; });
  }
  markDirty('Pilihan vendor CQS berubah. Klik Save untuk menyimpan.');
  updateCQSNavigationStatus();
  renderCurrent();
}

function renderBidderSupplierTable(rows, path) {
  const term = document.getElementById('searchBox')?.value.trim() || '';
  const sourceRows = Array.isArray(rows) ? rows : [];
  const headers = getHeaders(sourceRows);
  const filtered = sourceRows
    .map((row, idx) => ({row, idx}))
    .filter(item => rowMatches(item.row, term));

  sourceRows.forEach(row => ensureManualVendorDefaults(row));

  let out = '';
  const showCQSColumns = isCQSFlowAllowed();
  if (path) {
    const hint = showCQSColumns
      ? 'Pilih atau ketik vendor; vendor manual otomatis menjadi New Vendor / No Register.'
      : 'Pilih atau ketik vendor; kolom CQS tampil ketika Flow Process sudah CQS.';
    out += `<div class="table-actions"><button class="mini-btn ok" data-path="${escapeHtml(path)}" onclick="addRow(this.dataset.path)">+ Tambah Baris</button><span class="pill">${escapeHtml(hint)}</span></div>`;
  }
  if (!filtered.length) return out + '<p class="empty">Tidak ada data.</p>';

  out += `<datalist id="vendorCompanyOptions">${VENDOR_COMPANIES.map(v => `<option value="${escapeHtml(v.companyName)}">`).join('')}</datalist>`;
  out += '<div class="table-wrap"><table><thead><tr>';
  headers.forEach(h => out += `<th>${escapeHtml(h)}</th>`);
  if (showCQSColumns) out += '<th>Pilih CQS</th><th>Alasan Tidak Masuk CQS</th>';
  if (path) out += '<th>Action</th>';
  out += '</tr></thead><tbody>';

  filtered.forEach(item => {
    out += '<tr>';
    headers.forEach(h => {
      const value = item.row[h] || '';
      if (h === 'Name of Invited Supplier') {
        out += `<td><input class="vendor-select bidder-field-input" list="vendorCompanyOptions" data-row="${item.idx}" value="${escapeHtml(value)}" placeholder="Pilih atau ketik nama perusahaan" oninput="handleSupplierManualInput(this)" onchange="handleSupplierManualCommit(this)" autocomplete="off"></td>`;
      } else if (['Contact Person', 'No Telp', 'Email'].includes(h)) {
        out += `<td class="autofill-cell"><input class="bidder-field-input" data-row="${item.idx}" data-key="${escapeHtml(h)}" value="${escapeHtml(value)}" oninput="handleBidderManualField(this)" placeholder="Isi ${escapeHtml(h)}"></td>`;
      } else if (['No Company', 'Register Status'].includes(h)) {
        out += `<td class="autofill-cell"><input class="bidder-field-input bidder-readonly-input" value="${escapeHtml(value)}" readonly tabindex="-1" aria-label="${escapeHtml(h)}"></td>`;
      } else {
        out += `<td contenteditable="true" data-path="${escapeHtml(path)}" data-row="${item.idx}" data-key="${escapeHtml(h)}" oninput="handleCellEdit(this)">${escapeHtml(value)}</td>`;
      }
    });
    if (showCQSColumns) {
      const canSelect = Boolean(String(item.row['Name of Invited Supplier'] || '').trim());
      out += `<td class="cqs-select-cell"><input type="checkbox" ${item.row.__selectedCQS ? 'checked' : ''} ${canSelect ? '' : 'disabled'} onchange="toggleCQSSelection(${item.idx}, this.checked)" aria-label="Pilih vendor untuk CQS">${item.row.__selectedCQS ? `<span class="cqs-order-badge">${escapeHtml(item.row.__cqsOrder || '')}</span>` : ''}</td>`;
      const selectedReason = String(item.row.__cqsExclusionReason || '').trim();
      if (item.row.__selectedCQS) {
        out += '<td class="cqs-exclusion-cell is-selected">-</td>';
      } else if (canSelect) {
        out += `<td class="cqs-exclusion-cell${selectedReason ? '' : ' is-missing'}"><select onchange="setCQSExclusionReason(${item.idx}, this.value)" aria-label="Alasan vendor tidak masuk CQS"><option value="">-- Pilih alasan --</option>${CQS_EXCLUSION_REASONS.map(reason => `<option value="${escapeHtml(reason)}"${selectedReason === reason ? ' selected' : ''}>${escapeHtml(reason)}</option>`).join('')}</select></td>`;
      } else {
        out += '<td class="cqs-exclusion-cell">-</td>';
      }
    }
    if (path) {
      out += `<td class="action-cell"><button class="mini-btn danger" data-path="${escapeHtml(path)}" data-row="${item.idx}" onclick="deleteRow(this.dataset.path, Number(this.dataset.row))">Hapus</button></td>`;
    }
    out += '</tr>';
  });
  out += '</tbody></table></div>';
  return out;
}

function isEmptyRow(row) {
  if (Array.isArray(row)) return row.every(v => !String(v ?? '').trim());
  return Object.values(row || {}).every(v => !String(v ?? '').trim());
}

function rowMatches(row, term) {
  if (!term) return true;
  const text = Array.isArray(row) ? row.join(' ') : Object.values(row || {}).join(' ');
  return text.toLowerCase().includes(term.toLowerCase());
}

function getHeaders(rows, options={}) {
  if (options.headers) return options.headers;
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (!sourceRows.length) return [];
  if (Array.isArray(sourceRows[0])) {
    const maxCols = Math.max(...sourceRows.map(r => Array.isArray(r) ? r.length : 0), 1);
    return Array.from({length: maxCols}, (_, i) => i);
  }
  const headers = [];
  sourceRows.forEach(row => Object.keys(row || {}).forEach(key => { if (!String(key).startsWith('__') && !headers.includes(key)) headers.push(key); }));
  return headers;
}

function createBlankRow(rows, headers) {
  const first = rows[0];
  if (Array.isArray(first) || headers.every(h => Number.isInteger(h))) return headers.map(() => '');
  const obj = {};
  headers.forEach(h => obj[h] = '');
  return obj;
}

function renderTable(rows, path, options={}) {
  const term = document.getElementById('searchBox').value.trim();
  const sourceRows = Array.isArray(rows) ? rows : [];
  const headers = getHeaders(sourceRows, options);
  const filtered = sourceRows
    .map((row, idx) => ({row, idx}))
    .filter(item => (showBlankRows || !isEmptyRow(item.row)) && rowMatches(item.row, term));

  let out = '';
  if (editMode && path) {
    out += `<div class="table-actions"><button class="mini-btn ok" data-path="${escapeHtml(path)}" onclick="addRow(this.dataset.path)">+ Tambah Baris</button><span class="pill">Klik sel untuk mengubah data</span></div>`;
  }
  if (!filtered.length) return out + '<p class="empty">Tidak ada data yang cocok.</p>';

  const editable = editMode && path ? ' contenteditable="true"' : '';
  out += '<div class="table-wrap"><table><thead><tr>';
  headers.forEach(h => out += `<th>${escapeHtml(Number.isInteger(h) ? String.fromCharCode(65 + h) : h)}</th>`);
  if (editMode && path) out += '<th>Action</th>';
  out += '</tr></thead><tbody>';

  filtered.forEach(item => {
    out += '<tr>';
    headers.forEach(h => {
      const value = Array.isArray(item.row) ? item.row[h] : item.row[h];
      out += `<td${editable} data-path="${escapeHtml(path)}" data-row="${item.idx}" data-key="${escapeHtml(h)}" oninput="handleCellEdit(this)">${escapeHtml(value || '')}</td>`;
    });
    if (editMode && path) {
      out += `<td class="action-cell"><button class="mini-btn danger" data-path="${escapeHtml(path)}" data-row="${item.idx}" onclick="deleteRow(this.dataset.path, Number(this.dataset.row))">Hapus</button></td>`;
    }
    out += '</tr>';
  });
  out += '</tbody></table></div>';
  return out;
}

function handleCellEdit(cell) {
  const path = cell.dataset.path;
  const rowIndex = Number(cell.dataset.row);
  const key = cell.dataset.key;
  const rows = getByPath(path);
  if (!Array.isArray(rows) || !rows[rowIndex]) return;
  if (Array.isArray(rows[rowIndex])) rows[rowIndex][Number(key)] = cell.innerText;
  else rows[rowIndex][key] = cell.innerText;
  markDirty('Perubahan belum disimpan. Klik Save untuk mengirim perubahan ke Google Sheet.');
}

function addRow(path) {
  const rows = getByPath(path);
  if (!Array.isArray(rows)) return;
  const headers = getHeaders(rows);
  rows.push(createBlankRow(rows, headers));

  // Lanjutkan nomor urut otomatis (mengikuti pola yang sama seperti deleteRow),
  // supaya baris baru tidak kosong di kolom "No".
  rows.forEach((row, index) => {
    if (row && Object.prototype.hasOwnProperty.call(row, 'No')) row.No = String(index + 1);
  });

  markDirty('Baris baru ditambahkan. Klik Save untuk mengirim perubahan ke Google Sheet.');
  renderCurrent();
}

function deleteRow(path, rowIndex) {
  const rows = getByPath(path);
  if (!Array.isArray(rows) || rowIndex < 0 || rowIndex >= rows.length) return;
  if (!confirm('Hapus baris ini?')) return;

  const deletedSample = rows[rowIndex];
  rows.splice(rowIndex, 1);

  if (path === 'structured.BidderList.rows') {
    ensureMinimumBidderRows(rows, deletedSample || {});
  } else if (!rows.length && path === 'structured.RFQ.items') {
    rows.push(createBlankWorkspaceRow(
      deletedSample || {},
      ['No', 'Description', 'Qty', 'Ord Unit', 'Item Number']
    ));
  }

  rows.forEach((row, index) => {
    if (row && Object.prototype.hasOwnProperty.call(row, 'No')) row.No = String(index + 1);
  });

  markDirty('Baris dihapus. Klik Save untuk mengirim perubahan ke Google Sheet.');
  renderCurrent();
}

function renderRawGrid(sheetName, matrix) {
  const path = `rawSheets.${sheetName}`;
  const term = document.getElementById('searchBox').value.trim();
  const sourceRows = Array.isArray(matrix) ? matrix : [];
  const maxCols = Math.max(...sourceRows.map(r => Array.isArray(r) ? r.length : 0), 1);
  const headers = Array.from({length: maxCols}, (_, i) => i);
  const filteredRows = sourceRows
    .map((row, idx) => ({row, idx}))
    .filter(item => (showBlankRows || !isEmptyRow(item.row)) && rowMatches(item.row, term));

  let out = `<div class="section-title"><h3>${escapeHtml(sheetName)}</h3><span class="pill">${filteredRows.length} rows</span></div>`;
  if (editMode) out += `<div class="table-actions"><button class="mini-btn ok" data-path="${escapeHtml(path)}" onclick="addRow(this.dataset.path)">+ Tambah Baris</button></div>`;
  if (!filteredRows.length) return out + '<p class="empty">Tidak ada data.</p>';
  const editable = editMode ? ' contenteditable="true"' : '';
  out += '<div class="table-wrap raw-grid"><table><thead><tr><th class="row-number">#</th>';
  headers.forEach(h => out += `<th>${String.fromCharCode(65 + h)}</th>`);
  if (editMode) out += '<th>Action</th>';
  out += '</tr></thead><tbody>';
  filteredRows.forEach(item => {
    out += `<tr><td class="row-number">${item.idx + 1}</td>`;
    headers.forEach(h => out += `<td${editable} data-path="${escapeHtml(path)}" data-row="${item.idx}" data-key="${h}" oninput="handleCellEdit(this)">${escapeHtml(item.row[h] || '')}</td>`);
    if (editMode) out += `<td class="action-cell"><button class="mini-btn danger" data-path="${escapeHtml(path)}" data-row="${item.idx}" onclick="deleteRow(this.dataset.path, Number(this.dataset.row))">Hapus</button></td>`;
    out += '</tr>';
  });
  out += '</tbody></table></div>';
  return out;
}

function metaCard(label, value, fallback = '-') {
  const isEmpty = value === undefined || value === null || String(value).trim() === '';
  const displayValue = isEmpty ? fallback : value;

  return `<div class="meta"><small>${escapeHtml(label)}</small><strong>${escapeHtml(displayValue)}</strong></div>`;
}

/* =========================================================
   TAMBAHAN: FORMAT DATE, RFQ, DAN INPUT MANUAL OPEN DATE
   Open Date manual format dd mmm yyyy.
   Close Date otomatis Open Date + 7 hari, tetapi bisa diedit manual.
   No RFQ tampil 4 digit.
   ========================================================= */

function parseMetaDate(value) {
  if (!value && value !== 0) return null;
  const text = String(value).trim();
  if (!text || text === '-') return null;

  // Excel serial number
  if (!isNaN(text) && Number(text) > 20000 && Number(text) < 80000) {
    const d = new Date((Number(text) - 25569) * 86400 * 1000);
    return isNaN(d) ? null : d;
  }

  // yyyy-mm-dd
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [yyyy, mm, dd] = text.split('-').map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    return isNaN(d) ? null : d;
  }

  // dd/mm/yyyy atau dd-mm-yyyy
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(text)) {
    const [dd, mm, yy] = text.replaceAll('-', '/').split('/');
    const yyyy = Number(String(yy).length === 2 ? (Number(yy) >= 70 ? '19' + yy : '20' + yy) : yy);
    const d = new Date(yyyy, Number(mm) - 1, Number(dd));
    return isNaN(d) ? null : d;
  }

  // dd mmm yyyy, contoh 27 Mei 2026 / 27 May 2026
  const m = text.replace(/\s+/g, ' ').match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ\.]+)\s+(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mon = m[2].toLowerCase().replace(/\./g, '');
    const yy = m[3];
    const yyyy = Number(yy.length === 2 ? (Number(yy) >= 70 ? '19' + yy : '20' + yy) : yy);

    const monthMap = {
      jan: 0, januari: 0, january: 0,
      feb: 1, februari: 1, february: 1,
      mar: 2, maret: 2, march: 2,
      apr: 3, april: 3,
      mei: 4, may: 4,
      jun: 5, juni: 5, june: 5,
      jul: 6, juli: 6, july: 6,
      agu: 7, agt: 7, agustus: 7, aug: 7, august: 7,
      sep: 8, september: 8,
      okt: 9, oktober: 9, oct: 9, october: 9,
      nov: 10, november: 10,
      des: 11, desember: 11, dec: 11, december: 11
    };

    if (monthMap[mon] !== undefined) {
      const d = new Date(yyyy, monthMap[mon], dd);
      return isNaN(d) ? null : d;
    }
  }

  const d = new Date(text);
  return isNaN(d) ? null : d;
}

function formatMetaDate(value) {
  const d = value instanceof Date ? value : parseMetaDate(value);
  if (!d) return String(value || '').trim();

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function addDays(dateValue, days) {
  const d = parseMetaDate(dateValue);
  if (!d) return null;
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

function formatRFQ4Digit(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return '';
  const digits = text.replace(/\D/g, '');
  if (!digits) return text;
  return digits.slice(-4).padStart(4, '0');
}

function getRFQPrefixByStatusPR(statusPR) {
  const status = String(statusPR ?? '').trim().toUpperCase();

  if (status === 'BID') return 'S';
  if (status === 'TDR') return 'T';
  if (status === 'IOM') return 'D';
 if (status === 'CTR') return 'D';

  return '';
}

function getExistingRFQPrefix(value) {
  const text = String(value ?? '').trim().toUpperCase();
  const match = text.match(/^([A-Z])\s*-\s*\d+/);
  return match ? match[1] : '';
}

function formatRFQByStatusPR(noRFQ, statusPR) {
  const nomor = formatRFQ4Digit(noRFQ);
  if (!nomor) return '';

  const hasStatus = String(statusPR ?? '').trim() !== '';
  const prefixFromStatus = getRFQPrefixByStatusPR(statusPR);

  const prefix = prefixFromStatus || (!hasStatus ? getExistingRFQPrefix(noRFQ) : '');

  return prefix ? `${prefix}-${nomor}` : nomor;
}

function formatRFQDisplayFromMeta(meta) {
  return formatRFQByStatusPR(
    meta.rfq || meta.no_rfq || '',
    meta.status_pr || meta.statusPR || meta['Status PR'] || ''
  );
}


function metaDateInput(label, key, value, autoClose = false) {
  return `<div class="meta date-editable">
    <small>${escapeHtml(label)}</small>
    <input
        class="meta-date-input"
        type="text"
        value="${value || ''}"
        data-date-key="${escapeHtml(key)}"
        data-auto-close="${autoClose ? '1' : '0'}"
    >
  </div>`;
}

function handleMetaDateEdit(input) {

  const key = input.dataset.dateKey;
  const autoClose = input.dataset.autoClose === '1';
  const meta = DATA.structured.BidderList.meta;

  const fp = input._flatpickr;
  const parsed = fp && fp.selectedDates.length
      ? fp.selectedDates[0]
      : null;

  const formatted = parsed
      ? formatMetaDate(parsed)
      : '';

  meta[key] = formatted;

  if (key === 'open_date' && autoClose && parsed) {
      meta.close_date = formatMetaDate(addDays(parsed, 7));
  }

  markDirty('Tanggal berubah. Klik Save untuk mengirim perubahan ke Google Sheet.');

  renderCurrent();

}

let PROCUREMENT_ADMIN_ROWS = [];

/* =========================================================
   MASTER COST CENTER DETAIL
   Cost Center Detail otomatis mengikuti kolom kedua dari daftar ini.
   ========================================================= */
const COST_CENTER_DETAIL_MAP = {
  '6100DA300': 'MSW Operation & Maintenance',
  '6100DA301': 'MSW Operation & Performance - Operation',
  '6100DA302': 'MSW Operation & Performance - WTP',
  '6100DA303': 'MSW Operation & Performance - Plant Performance',
  '6100DB202': 'MSW Technical Sevices - Project & Improvement',
  '6100DB203': 'MSW Technical Services - Planning',
  '6100DB400': 'MSW Maintenance',
  '6100DB401': 'MSW Maintenance - Mechanical',
  '6100DB402': 'MSW Maintenance - Electrical, Insturment, & Control',
  '6100DB403': 'MSW Maintenance - Planning',
  '6100DB404': 'MSW Technical Maintenance - Project & Improvement',
  '6100DB405': 'MSW Technical Maintenance - Planning',
  '6100DB410': 'MSW Transmission & Distribution',
  '6100DB411': 'MSW T&D - Maintenance',
  '6100DB412': 'MSW T&D - Electrification',
  '6100DB413': 'MSW Technical Maintenance - Elektrifikasi',
  '6100DB420': 'MSW Technical Maintenance - Solar IV',
  '6100DB421': 'MSW T&D - Solar PV',
  '6100DB431': 'MSW T&D - DGOM AI',
  '6100DB432': 'MSW T&D - DGOM IBT',
  '6100DB433': 'MSW T&D - DGOM ATS',
  '6100DB441': 'MSW T&D - Planning',
  '6100DD100': 'MSW Directorate',
  '6100DD200': 'MSW Technical Support',
  '6100DD201': 'MSW Technical Services - Engineering',
  '6100DE700': 'MSW Support Services',
  '6100DE710': 'MSW Support Services - OHS',
  '6100DE720': 'MSW Support Services - QMS',
  '6100DI210': 'MSW Finance & Accounting',
  '6100DK100': 'MSW HRGA',
  '6100DK110': 'MSW HR',
  '6100DK111': 'MSW Human Resources - Site',
  '6100DK112': 'MSW Human Resources - Jakarta',
  '6100DK120': 'MSW GA',
  '6100DL600': 'MSW General Power Plant',
  '6100DN730': 'MSW Support Services - Material Management',
  '6100DN731': 'MSW Support Services - Material Management - Procurement',
  '6100DN732': 'MSW Support Services - Material Management - Inventory',
  '6100DN800': 'MSW Material Management'
};

function normalizeCostCenterCode(value) {
  const text = String(value ?? '').toUpperCase().trim();
  const match = text.match(/6100[A-Z]{2}\d{3}/);
  return match ? match[0] : text.replace(/[^A-Z0-9]/g, '');
}

function getCostCenterDetail(costCenter) {
  const code = normalizeCostCenterCode(costCenter);
  return COST_CENTER_DETAIL_MAP[code] || '';
}

function cleanProcValue(value) {
  const text = String(value ?? '').trim();
  return text === '-' ? '' : text;
}

async function syncProcurementAdminFromGoogleSheet(showAlert = false) {
  try {
    const res = await fetch(`${GAS_URL}?sheet=Admin`, { cache: 'no-store' });
    const data = await res.json();
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (!rows.length) {
      if (showAlert) alert('Data Admin di Google Sheet masih kosong.');
      return false;
    }
    PROCUREMENT_ADMIN_ROWS = rows;
    
    if (showAlert) alert(`Berhasil sync ${getUniqueProcurementPRRows().length} No PR langsung dari Google Sheet (tab Admin).`);
    if (currentView === 'BidderList') renderCurrent();
    return true;
  } catch (error) {
    console.warn('Gagal sync Admin dari Google Sheet:', error);
    if (showAlert) alert('Gagal mengambil data dari Google Sheet (tab Admin).\n\n' + error.message);
    return false;
  }
}

async function initProcurementAdminRows() {
  await syncProcurementAdminFromGoogleSheet(false);
}

function getProcurementAdminValue(row, keys) {
  if (!row || typeof row !== 'object') return '';

  // Cek nama kolom persis
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return cleanProcValue(row[key]);
    }
  }

  // Cek nama kolom versi normalisasi
  // Supaya "Est. Price PR", "Est Price PR", "estpricepr",
  // atau kolom dengan spasi/titik tetap terbaca.
  const wanted = keys.map(normalizeTextKey);

  for (const [actualKey, actualValue] of Object.entries(row)) {
    if (
      wanted.includes(normalizeTextKey(actualKey)) &&
      actualValue !== undefined &&
      actualValue !== null &&
      String(actualValue).trim() !== ''
    ) {
      return cleanProcValue(actualValue);
    }
  }

  return '';
}

function getProcurementRowYear(row) {
  const explicit = getProcurementAdminValue(row, ['PR Year', 'prYear', 'pryear']);
  const explicitYear = Number(String(explicit || '').match(/\d{4}/)?.[0] || 0);
  if (explicitYear >= 1900 && explicitYear <= 2200) return explicitYear;

  const assignValue = getProcurementAdminValue(row, [
    'Assign PR Date', 'Assign PR', 'Assign Date', 'assignprdate'
  ]);
  const parsed = new Date(assignValue);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getFullYear();
}

function getProcurementRowId(row) {
  return cleanProcValue(getProcurementAdminValue(row, [
    'Procurement ID', 'procurementId', 'procurementid'
  ]));
}

function parseProcurementChoice(value) {
  const raw = cleanProcValue(value);
  const match = raw.match(/^(.*?)\s*[·|]\s*(\d{4})$/);
  return {
    raw,
    noPR: cleanProcValue(match ? match[1] : raw),
    year: match ? Number(match[2]) : 0
  };
}

function procurementChoiceValue(row) {
  const noPR = cleanProcValue(getProcurementAdminValue(row, [
    'noPR', 'No PR', 'NO PR', 'nopr', 'no_pr'
  ]));
  const year = getProcurementRowYear(row);
  return year ? `${noPR} · ${year}` : noPR;
}

function getUniqueProcurementPRRows() {
  const map = new Map();
  PROCUREMENT_ADMIN_ROWS.forEach(row => {
    const noPR = getProcurementAdminValue(row, ['noPR', 'No PR', 'NO PR', 'nopr', 'no_pr']);
    if (!noPR) return;
    const id = getProcurementRowId(row);
    const year = getProcurementRowYear(row);
    const key = id || `${year}|${normalizeTextKey(noPR)}`;
    if (!map.has(key)) map.set(key, row);
  });
  return [...map.values()].sort((a, b) => {
    const yearDiff = getProcurementRowYear(b) - getProcurementRowYear(a);
    if (yearDiff) return yearDiff;
    const aa = getProcurementAdminValue(a, ['noPR', 'No PR', 'NO PR', 'nopr', 'no_pr']);
    const bb = getProcurementAdminValue(b, ['noPR', 'No PR', 'NO PR', 'nopr', 'no_pr']);
    return aa.localeCompare(bb, 'id', { numeric: true, sensitivity: 'base' });
  });
}

function findProcurementRowByNoPR(value) {
  const choice = parseProcurementChoice(value);
  const key = normalizeTextKey(choice.noPR);
  const matches = PROCUREMENT_ADMIN_ROWS.filter(row =>
    normalizeTextKey(getProcurementAdminValue(row, [
      'noPR', 'No PR', 'NO PR', 'nopr', 'no_pr'
    ])) === key
  );

  if (choice.year) {
    return matches.find(row => getProcurementRowYear(row) === choice.year) || null;
  }

  // Input lama yang hanya berisi No PR tetap didukung. Jika terdapat nomor
  // yang sama pada beberapa tahun, data tahun terbaru dipilih.
  return matches.sort((a, b) => getProcurementRowYear(b) - getProcurementRowYear(a))[0] || null;
}

function metaSelectNoPR(label, value) {
  const rows = getUniqueProcurementPRRows();
  const meta = getBidderMeta();
  const currentValue = meta.prYear
    ? `${cleanProcValue(value)} · ${meta.prYear}`
    : cleanProcValue(value);

  const options = rows.map(row => {
    const choiceValue = procurementChoiceValue(row);
    const desc = getProcurementAdminValue(row, ['Description', 'description']);
    const id = getProcurementRowId(row);
    const labelText = [desc, id].filter(Boolean).join(' — ');
    return `<option value="${escapeHtml(choiceValue)}" label="${escapeHtml(labelText)}"></option>`;
  }).join('');

  return `<div class="meta no-pr-filter">
    <small>${escapeHtml(label)}</small>
    <div class="editable-select-wrap">
      <input
        id="noPrComboInput"
        class="meta-select editable-select-input"
        type="text"
        list="procurement-pr-options"
        value="${escapeHtml(currentValue)}"
        placeholder="Ketik atau pilih No PR"
        autocomplete="off"
        oninput="handleNoPRTyping(this.value)"
        onchange="handleNoPRSelect(this.value)"
        onkeydown="if(event.key === 'Enter'){ event.preventDefault(); handleNoPRSelect(this.value); this.blur(); }"
      >
      <button type="button" class="editable-select-toggle" title="Tampilkan pilihan No PR" aria-label="Tampilkan pilihan No PR" onclick="openNoPRChoices()">▾</button>
    </div>
    <datalist id="procurement-pr-options">${options}</datalist>
  </div>`;
}


function openNoPRChoices() {
  const input = document.getElementById('noPrComboInput');
  if (!input) return;
  input.focus();
  if (typeof input.showPicker === 'function') {
    try { input.showPicker(); return; } catch (_) {}
  }
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
}

function handleNoPRTyping(value) {
  const bidder = DATA?.structured?.BidderList || {};
  bidder.meta = bidder.meta || {};
  const choice = parseProcurementChoice(value);
  bidder.meta.nopr = choice.noPR;
  bidder.meta.prYear = choice.year || '';
  bidder.meta.procurementId = '';
  markDirty('No PR diketik. Klik Save untuk mengirim perubahan ke Google Sheet.');
}


function renderDollarTools() {
  const meta = getBidderMeta();
  const savedRate = parseCurrencyNumber(
    meta.usd_rate_locked ||
    meta.usd_rate_used ||
    meta.usd_rate_live
  );
  const rate = savedRate || USD_IDR_FALLBACK_RATE;
  const rateDate = meta.usd_rate_date || meta.usd_rate_locked_at || '';
  const source = meta.usd_rate_source || '';
  const status = savedRate
    ? ['Snapshot PR', rateDate, source].filter(Boolean).join(' • ')
    : 'Belum tersimpan pada PR • menggunakan nilai fallback sementara';

  return `<div class="dollar-tools card-dollar">
    <p>Dolar USD/IDR</p>
    <strong id="kpiDollarRate">1$ - ${escapeHtml(formatIntegerID(rate))}</strong>
    <small id="kpiDollarStatus">${escapeHtml(status)}</small>
  </div>`;
}


function splitProcurementVendorNames(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item ?? '').trim())
      .filter(Boolean)
      .filter((name, index, list) =>
        list.findIndex(item => companyNamesEquivalent(item, name)) === index
      );
  }

  const raw = String(value ?? '').trim();
  if (!raw) return [];

  // Data lama kadang tersimpan sebagai JSON array.
  if (/^\s*\[/.test(raw)) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return splitProcurementVendorNames(parsed);
    } catch (_) {}
  }

  return raw
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .split(/\r?\n|;|\||•|\u2022/)
    .map(name => name.replace(/^[-–—\s]+/, '').trim())
    .filter(Boolean)
    .filter((name, index, list) =>
      list.findIndex(item => companyNamesEquivalent(item, name)) === index
    );
}

function fillBidderRowFromVendorName(targetRow, companyName, rowNumber) {
  if (!targetRow) return;
  const vendor = findVendorByCompany(companyName);
  const previousName = String(targetRow['Name of Invited Supplier'] || '').trim();
  const sameCompany = previousName && companyNamesEquivalent(previousName, companyName);

  targetRow['No'] = String(rowNumber + 1);
  targetRow['Name of Invited Supplier'] = vendor?.companyName || companyName || '';
  targetRow['No Company'] = vendor?.noCompany || (sameCompany ? String(targetRow['No Company'] || '') : '');
  targetRow['Contact Person'] = vendor?.customerContact || (sameCompany ? String(targetRow['Contact Person'] || '') : '');
  targetRow['No Telp'] = vendor?.companyPhone || (sameCompany ? String(targetRow['No Telp'] || '') : '');
  targetRow['Email'] = vendor?.email || (sameCompany ? String(targetRow['Email'] || '') : '');
  targetRow['Register Status'] = vendor?.registerStatus || (sameCompany ? String(targetRow['Register Status'] || '') : '');
  targetRow['Company Status'] = vendor?.companyStatus || (sameCompany ? String(targetRow['Company Status'] || '') : '');
  targetRow.__vendorSnapshot = vendor ? {
    noCompany: vendor.noCompany || '',
    companyName: vendor.companyName || companyName || '',
    address: vendor.address || '',
    customerContact: vendor.customerContact || '',
    companyPhone: vendor.companyPhone || '',
    email: vendor.email || '',
    registerStatus: vendor.registerStatus || '',
    companyStatus: vendor.companyStatus || '',
    contactPersons: vendor.contactPersons || []
  } : (sameCompany ? targetRow.__vendorSnapshot || null : null);
}

function getProcurementInvitationState(procurementRow, round) {
  if (!procurementRow) return { invited: [], submitted: [] };
  const normalizedRound = normalizeDocumentRound(round || 'R0');
  const declaredRound = normalizeDocumentRound(getProcurementAdminValue(procurementRow, ['Round PR','Round PO','roundpr','roundpo']) || 'R0');
  const exactInvited = getProcurementAdminValue(procurementRow, [`${normalizedRound} Company`, `${normalizedRound.toLowerCase()}company`]);
  const exactSubmitted = getProcurementAdminValue(procurementRow, [`${normalizedRound} Submit Company`, `${normalizedRound.toLowerCase()}submitcompany`]);
  let invitedRaw = exactInvited;
  let submittedRaw = exactSubmitted;
  if (!invitedRaw && declaredRound === normalizedRound) invitedRaw = getProcurementAdminValue(procurementRow, ['roundcompany','Round Company','List Invitation Vendor','List Invitation Company']);
  if (!submittedRaw && declaredRound === normalizedRound) submittedRaw = getProcurementAdminValue(procurementRow, ['roundsubmitcompany','Round Submit Company','Submit Quote Vendor']);
  if (!invitedRaw && normalizedRound === 'R0') invitedRaw = getProcurementAdminValue(procurementRow, ['Final Vendor List','finalvendorlist']);
  if (!submittedRaw && normalizedRound === 'R0') submittedRaw = getProcurementAdminValue(procurementRow, ['Final Submit Vendor','finalsubmitvendor']);
  return { invited: splitProcurementVendorNames(invitedRaw), submitted: splitProcurementVendorNames(submittedRaw) };
}

function getPreviousRoundName(round) {
  const normalized = normalizeDocumentRound(round || 'R0');
  const number = Number(normalized.replace('R', ''));
  return Number.isFinite(number) && number > 0 ? `R${number - 1}` : '';
}

function getPreviousRoundSubmittedVendors(procurementRow, activeRound) {
  const previousRound = getPreviousRoundName(activeRound);
  if (!previousRound) return [];
  return getProcurementInvitationState(procurementRow, previousRound).submitted || [];
}

function synchronizeBidderRowsWithInvitation(procurementRow, round) {
  const state = getProcurementInvitationState(procurementRow, round);

  // List Invitation Company adalah sumber utama. Jangan menggantinya dengan
  // Submit Quote Vendor karena kedua daftar mempunyai fungsi berbeda.
  const names = state.invited;
  if (!names.length) return false;

  const bidder = DATA?.structured?.BidderList;
  if (!bidder) return false;

  const currentRows = Array.isArray(bidder.rows) ? bidder.rows : [];
  const takeExistingRow = companyName => {
    const index = currentRows.findIndex(row =>
      companyNamesEquivalent(row?.['Name of Invited Supplier'], companyName)
    );
    return index >= 0 ? currentRows[index] : null;
  };

  const beforeNames = currentRows
    .map(row => String(row?.['Name of Invited Supplier'] || '').trim())
    .filter(Boolean);
  const listChanged = beforeNames.length !== names.length ||
    beforeNames.some((name, index) => !companyNamesEquivalent(name, names[index]));

  const synchronizedRows = names.map((name, index) => {
    const existing = takeExistingRow(name);
    const row = existing ? { ...existing } : {};
    fillBidderRowFromVendorName(row, name, index);
    return row;
  });

  const submittedOrder = Array.isArray(state.submitted)
    ? state.submitted.filter(Boolean)
    : [];
  synchronizedRows.forEach(row => {
    const submittedIndex = submittedOrder.findIndex(name =>
      companyNamesEquivalent(name, row['Name of Invited Supplier'])
    );
    if (submittedIndex >= 0) {
      row.__selectedCQS = true;
      row.__cqsOrder = submittedIndex + 1;
    } else if (submittedOrder.length > 0) {
      row.__selectedCQS = false;
      delete row.__cqsOrder;
    }
  });

  bidder.rows = ensureMinimumBidderRows(synchronizedRows, currentRows[0] || {});
  ensureBidderNoCompanyColumn();

  const rfqItems = DATA?.structured?.RFQ?.items || [];
  const description = getProcurementAdminValue(procurementRow, ['Description', 'description']);
  if (description && rfqItems.length && !rfqItems.some(item => String(item?.Description || '').trim())) {
    rfqItems[0].Description = description;
  }

  return listChanged;
}

function detectLatestProcurementRound(row) {
  if (!row || typeof row !== 'object') return 'R0';
  for (let number = 5; number >= 0; number--) {
    const round = `R${number}`;
    const lower = round.toLowerCase();
    const hasData = [
      `${round} Company`, `${lower}company`,
      `${round} Submit Company`, `${lower}submitcompany`,
      `${round} Start Date`, `${lower}startdate`,
      `${round} Finish Date`, `${lower}finishdate`
    ].some(key => String(getProcurementAdminValue(row, [key]) || '').trim());
    if (hasData) return round;
  }
  return 'R0';
}

function resolveProcurementRound(row, overrideRound) {
  const explicit = normalizeDocumentRound(overrideRound || '');
  if (explicit && String(overrideRound || '').trim()) return explicit;

  const declared = normalizeDocumentRound(getProcurementAdminValue(row, [
    'Round PR', 'Round PO', 'roundpr', 'roundpo', 'Round', 'round'
  ]) || '');
  if (declared && getProcurementAdminValue(row, ['Round PR', 'Round PO', 'roundpr', 'roundpo', 'Round', 'round'])) {
    return declared;
  }

  const fromStatusRebid = normalizeDocumentRound(getProcurementAdminValue(row, [
    'Status Rebid', 'statusrebid'
  ]) || '');
  if (fromStatusRebid && getProcurementAdminValue(row, ['Status Rebid', 'statusrebid'])) {
    return fromStatusRebid;
  }

  return detectLatestProcurementRound(row);
}

function getProcurementRoundDate(row, round, type) {
  const normalizedRound = normalizeDocumentRound(round || 'R0');
  const lower = normalizedRound.toLowerCase();
  const isStart = type === 'start';
  const suffix = isStart ? 'Start Date' : 'Finish Date';
  const compactSuffix = isStart ? 'startdate' : 'finishdate';
  const declaredRound = normalizeDocumentRound(getProcurementAdminValue(row, ['Round PR', 'Round PO', 'roundpr', 'roundpo']) || 'R0');

  const aliases = [
    `${normalizedRound} ${suffix}`,
    `${lower}${compactSuffix}`,
    `${normalizedRound}${suffix.replace(/\s+/g, '')}`
  ];

  if (declaredRound === normalizedRound) {
    aliases.push(isStart ? 'roundstartdate' : 'roundfinishdate');
    aliases.push(isStart ? 'Start Date' : 'Finish Date');
  }

  return getProcurementAdminValue(row, aliases);
}

function applyRoundMetaFromProcurement(meta, row, requestedRound) {
  const previousRound = normalizeDocumentRound(meta.round || 'R0');
  const activeRound = resolveProcurementRound(row, requestedRound);
  const roundChanged = previousRound !== activeRound;

  meta.round = activeRound;
  meta.revision = activeRound === 'R0' ? '' : activeRound;
  meta.rev = meta.revision;

  const openDate = getProcurementRoundDate(row, activeRound, 'start');
  const closeDate = getProcurementRoundDate(row, activeRound, 'finish');

  if (openDate) meta.open_date = formatMetaDate(openDate);
  else if (roundChanged) meta.open_date = '';
  else meta.open_date = formatMetaDate(meta.open_date || '');

  if (closeDate) meta.close_date = formatMetaDate(closeDate);
  else if (openDate) meta.close_date = formatMetaDate(addDays(openDate, 7));
  else if (roundChanged) meta.close_date = '';
  else meta.close_date = formatMetaDate(meta.close_date || '');

  return activeRound;
}

function seedWorkspaceFromProcurementRow(procurementRow, round) {
  return synchronizeBidderRowsWithInvitation(procurementRow, round);
}

function handleNoPRSelect(value, options = {}) {
  const bidder = DATA?.structured?.BidderList || {};
  bidder.meta = bidder.meta || {};
  const meta = bidder.meta;
  const choice = parseProcurementChoice(value);

  const row = options.rowOverride || findProcurementRowByNoPR(value);
  meta.nopr = choice.noPR;
  meta.prYear = choice.year || (row ? getProcurementRowYear(row) : '');
  meta.procurementId = row ? getProcurementRowId(row) : '';

  if (row) {
    meta.description = getProcurementAdminValue(row, ['Description', 'description']);

    // Status PR menentukan prefix No RFQ:
// BID = S, TDR = T, IOM = D
meta.status_pr = getProcurementAdminValue(row, [
  'Status PR',
  'STATUS PR',
  'statuspr',
  'status_pr',
  'PR Status',
  'pr_status',
  'status'
]);

const rfqNumber = getProcurementAdminValue(row, [
  'rfq',
  'RFQ',
  'No RFQ',
  'NO RFQ',
  'no_rfq',
  'norfq'
]) || meta.rfq || '';

meta.rfq = formatRFQByStatusPR(rfqNumber, meta.status_pr);

    // Revision, Open Date, dan Close Date mengikuti round aktif Procurement Admin.
    // Nilainya diterapkan setelah round aktif selesai ditentukan di bawah.

    // Sumber nilai dari kolom Est. Price PR.
    // Tampilan HTML dan Export XLSX otomatis menghitung:
    // Est. Price PR x Kurs USD/IDR.

    meta.est_price = getProcurementAdminValue(row, [
      'Est. Price PR',
      'Est Price PR',
      'EST PRICE PR',
      'Estimate Price PR',
      'Estimated Price PR',
      'estpricepr',
      'estpricerp',
      'est_price_pr',
      'estPricePR',
      'estPricePr',
      'EstPricePR'
    ]);

    meta.est_price_us_rp = getProcurementAdminValue(row, [
      'Est. Price US - RP',
      'EST. PRICE US - RP',
      'Est Price US - RP',
      'Est Price US RP',
      'EST PRICE US RP',
      'estpriceusrp',
      'estpriceus',
      'est_price_us_rp',
      'estPriceUSRP',
      'estPriceUsRp',
      'EstPriceUSRP'
    ]);

    const procurementUsdRate = getProcurementAdminValue(row, [
      'USD/IDR Rate', 'USD IDR Rate', 'usdidrrate', 'usd_rate_locked', 'usdRate'
    ]);
    if (procurementUsdRate) {
      meta.usd_rate_locked = procurementUsdRate;
      meta.usd_rate_used = procurementUsdRate;
      meta.usd_rate_date = getProcurementAdminValue(row, [
        'USD/IDR Rate Date', 'USD IDR Rate Date', 'usdidrratedate', 'usd_rate_date'
      ]);
      meta.usd_rate_source = getProcurementAdminValue(row, [
        'USD/IDR Source', 'USD IDR Source', 'usdidrsource', 'usd_rate_source'
      ]);
      meta.usd_rate_locked_at = meta.usd_rate_date || meta.usd_rate_locked_at || '';
    }

    meta.cost_center = getProcurementAdminValue(row, ['departement', 'Department', 'Cost Center', 'cost_center']);

    // Cost Center Detail otomatis dari master Cost Center.
    // Jika Cost Center = 6100DA300, maka detail = MSW Operation & Maintenance.
    const autoCostCenterDetail = getCostCenterDetail(meta.cost_center);

    // Type Quotation diambil dari kolom Pengadaan
    meta.type_quotation = getProcurementAdminValue(row, ['Pengadaan', 'pengadaan']);
    meta.flow_process = getProcurementAdminValue(row, ['Flow Process', 'flowprocess']);
    
    // Round dokumen mengikuti pilihan aktif. Untuk data lama yang belum memiliki
    // Round PR, sistem mendeteksi Status Rebid atau round terakhir yang berisi data.
    applyRoundMetaFromProcurement(meta, row, options.roundOverride);
    meta.folderid = getProcurementAdminValue(row, ['Folder ID', 'folderid']);
    meta.folderlink = getProcurementAdminValue(row, ['Folder LINK', 'Folder Link', 'folderlink']);
    
    meta.previous_winner_po = getProcurementAdminValue(row, [
      'previoussubmitpo', 'Previous Submit PO', 'Previous Winner PO',
      'previouswinnerpo', 'Previous PO', 'previouspo'
    ]) || 'None';

    // Untuk R1/R2/dst., Previous Vendor Quote harus menampilkan vendor yang
    // mengirim quotation pada round sebelumnya, bukan submit vendor round aktif.
    const previousRoundSubmitted = getPreviousRoundSubmittedVendors(row, meta.round);
    const legacyPreviousVendorQuote = getProcurementAdminValue(row, [
      'previous_vendor_quote', 'Previous Vendor Quote', 'previousvendorquote'
    ]);
    meta.previous_vendor_quote = previousRoundSubmitted.length
      ? previousRoundSubmitted.join('\n')
      : (legacyPreviousVendorQuote || 'None');
    meta.cost_center_detail = autoCostCenterDetail || getProcurementAdminValue(row, ['costcenterdetail', 'Cost Center Detail', 'descriptioncostcenter', 'Description Cost Center']) || meta.cost_center_detail || '';
   
    // PIC diambil dari kolom Procurement Admin: PIC
    meta.pic = getProcurementAdminValue(row, [
      'PIC',
      'pic',
      'PIC User',
      'picuser',
      'pic_user',
      'User PIC',
      'userpic'
    ]);
  }

  invalidateProcurementDocumentState();
  markDirty(row ? 'No PR dipilih dari Procurement Admin. Workspace sedang dimuat.' : 'No PR diketik manual. Klik Save untuk mengirim perubahan ke Google Sheet.');

  // Hindari 20 baris kosong master terlihat selama workspace masih dimuat.
  compactWorkspaceEntryRows();
  renderCurrent();
  if (row) loadWorkspaceForPR(meta.nopr, meta.round || 'R0', { ...meta }, row);
}

function editHint() {
  return '';
}

function renderBidderList() {
  const x = DATA.structured.BidderList;
  let out = editHint();
  out += renderSourceToolsGrid();
  out += `<div class="meta-grid">
		${metaCard('Company', x.meta.company)}
		${metaSelectNoPR('No PR', x.meta.nopr || '')}
    ${metaCard('Revision', x.meta.revision || '', '')}
		${metaCard('Description', x.meta.description || '-')}
    
		${metaCard('No RFQ', formatRFQDisplayFromMeta(x.meta))}
		
		${metaDateInput('Open Date', 'open_date', x.meta.open_date || '', true)}
		${metaDateInput('Close Date', 'close_date', x.meta.close_date || '', false)}
		${metaEstPriceRpCard(x.meta)}
		${metaCard('Cost Center', x.meta.cost_center || '-')}
		${metaCard('Cost Center detail',`${x.meta.cost_center_detail || getCostCenterDetail(x.meta.cost_center) || 'None'}\nPIC : ${x.meta.pic || '-'}`)}
		${metaCard('Type Quotation', x.meta.type_quotation || '-')}
		${metaCard('Previous Winner PO', x.meta.previous_winner_po || 'None')}
		${metaCard('Previous Vendor Quote', x.meta.previous_vendor_quote || 'None')}</div>`;
  out += renderBidderSupplierTable(x.rows, 'structured.BidderList.rows');
  out += '<div class="notice">Perubahan disimpan otomatis. Data supplier berasal dari tab Company dan tetap dapat disimpan manual melalui tombol Save.</div>';
  return out;
}


function getCurrentProcurementDocumentKey(meta = getBidderMeta()) {
  const identifier = normalizeTextKey(meta?.procurementId || meta?.nopr || '');
  const round = normalizeDocumentRound(meta?.round || meta?.revision || 'R0');
  return identifier ? `${identifier}|${round}` : '';
}

function invalidateProcurementDocumentState() {
  PROCUREMENT_DOCUMENT_STATE = {
    key: getCurrentProcurementDocumentKey(),
    loading: false,
    loaded: false,
    documents: {}
  };
  updateProcurementDocumentViewButtons();
}

function ensureProcurementDocumentViewButtons() {
  const toolbar = document.querySelector('.panel-header .toolbar');
  if (!toolbar) return;

  let group = document.getElementById('procurementDocumentViewGroup');
  if (!group) {
    group = document.createElement('div');
    group.id = 'procurementDocumentViewGroup';
    group.className = 'procurement-document-view-group';

    const saveToFolderHandlers = {
      BIDDERLIST: saveBidderListAs,
      RFQ: saveRFQAs,
      CQS: saveCQSAs
    };

    Object.entries(PROCUREMENT_DOCUMENT_VIEW_CONFIG).forEach(([type, config]) => {
      const documentActions = document.createElement('div');
      documentActions.className = 'procurement-document-action-set';

      const button = document.createElement('button');
      button.type = 'button';
      button.id = `viewStored${type}Btn`;
      button.className = 'secondary stored-document-view-btn';
      button.textContent = `View ${config.label}`;
      button.disabled = true;
      button.dataset.documentType = type;
      button.addEventListener('click', () => openStoredProcurementDocument(type));
      documentActions.appendChild(button);

      const saveToFolderButton = document.createElement('button');
      saveToFolderButton.type = 'button';
      saveToFolderButton.id = `save${type}ToFolderBtn`;
      saveToFolderButton.className = 'secondary document-save-folder-btn';
      saveToFolderButton.textContent = `Save ${config.label} to Storage`;
      saveToFolderButton.title = `Simpan ${config.label} ke Storage Location lokal: ${config.folderName}/Round aktif`;
      saveToFolderButton.addEventListener('click', async () => {
        if (saveToFolderButton.disabled) return;
        const originalText = saveToFolderButton.textContent;
        saveToFolderButton.disabled = true;
        saveToFolderButton.textContent = 'Saving...';
        try {
          await saveToFolderHandlers[type]?.();
        } finally {
          saveToFolderButton.textContent = originalText;
          updateProcurementDocumentViewButtons();
        }
      });
      documentActions.appendChild(saveToFolderButton);
      group.appendChild(documentActions);
    });

    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className = 'secondary stored-document-refresh-btn';
    refreshButton.textContent = '↻';
    refreshButton.title = 'Periksa ulang dokumen pada folder Procurement';
    refreshButton.addEventListener('click', () => refreshProcurementDocuments({ force: true }));
    group.appendChild(refreshButton);

    const editButton = document.getElementById('editBtn');
    toolbar.insertBefore(group, editButton || toolbar.firstChild);

  }

  updateProcurementDocumentViewButtons();
}

function isStoredProcurementDocumentAvailable(documentInfo) {
  return Boolean(buildDrivePreviewUrl(documentInfo));
}

function getProcurementDocumentReadiness(documentType) {
  const type = String(documentType || '').trim().toUpperCase();
  const meta = getBidderMeta();
  if (!String(meta?.nopr || '').trim()) {
    return { ready: false, reason: 'Pilih No PR terlebih dahulu.' };
  }
  if (type === 'RFQ' && !hasRFQDescriptionItems()) {
    return { ready: false, reason: 'Isi minimal satu Description pada RFQ.' };
  }
  if (type === 'CQS') return getCQSNativeDocumentReadiness();
  return { ready: true };
}

function updateProcurementDocumentViewButtons() {
  const meta = getBidderMeta();
  const hasPR = Boolean(String(meta?.nopr || '').trim());

  Object.entries(PROCUREMENT_DOCUMENT_VIEW_CONFIG).forEach(([type, config]) => {
    const button = document.getElementById(`viewStored${type}Btn`);
    const saveButton = document.getElementById(`save${type}ToFolderBtn`);
    if (!button && !saveButton) return;

    const documentInfo = PROCUREMENT_DOCUMENT_STATE.documents?.[type] || null;
    const isAvailable = isStoredProcurementDocumentAvailable(documentInfo);

    if (button) {
      button.disabled =
        PROCUREMENT_DOCUMENT_STATE.loading ||
        !hasPR;
      button.classList.toggle('is-available', isAvailable);
      button.classList.toggle('is-current-view', currentView === config.view);
      button.textContent = `View ${config.label}`;

      if (PROCUREMENT_DOCUMENT_STATE.loading) {
        button.title = `Memeriksa ${config.label} pada ${config.folderName}...`;
      } else if (isAvailable) {
        button.title = `${documentInfo.fileName}
Lokasi: ${documentInfo.folderName || config.folderName}
Membuka file hasil yang sudah tersimpan di folder PR.`;
      } else if (!hasPR) {
        button.title = 'Pilih No PR terlebih dahulu.';
      } else {
        button.title = `${config.label} belum tersimpan di ${config.folderName}. Gunakan Save ${config.label} to Storage terlebih dahulu.`;
      }
    }

    if (saveButton) {
      let canSave = hasPR;
      if (type === 'RFQ') canSave = canSave && hasRFQDescriptionItems();
      if (type === 'CQS') canSave = canSave && getCQSNativeDocumentReadiness().ready;
      saveButton.disabled = PROCUREMENT_DOCUMENT_STATE.loading || !canSave;
      saveButton.title = !hasPR
        ? 'Pilih No PR terlebih dahulu.'
        : !canSave
          ? `Data ${config.label} belum lengkap untuk disimpan.`
          : `Simpan snapshot ${config.label} ke ${config.folderName} pada folder No PR aktif.`;
    }
  });

  const refreshButton = document.querySelector('.stored-document-refresh-btn');
  if (refreshButton) {
    refreshButton.disabled = PROCUREMENT_DOCUMENT_STATE.loading || !hasPR;
    refreshButton.classList.toggle('is-loading', PROCUREMENT_DOCUMENT_STATE.loading);
  }
}

async function refreshProcurementDocuments(options = {}) {
  const meta = getBidderMeta();
  const key = getCurrentProcurementDocumentKey(meta);

  if (!key) {
    invalidateProcurementDocumentState();
    return {};
  }

  if (
    !options.force &&
    PROCUREMENT_DOCUMENT_STATE.key === key &&
    PROCUREMENT_DOCUMENT_STATE.loaded
  ) {
    updateProcurementDocumentViewButtons();
    return PROCUREMENT_DOCUMENT_STATE.documents || {};
  }

  if (PROCUREMENT_DOCUMENT_STATE.loading && PROCUREMENT_DOCUMENT_STATE.key === key) {
    return PROCUREMENT_DOCUMENT_STATE.documents || {};
  }

  PROCUREMENT_DOCUMENT_STATE = {
    key,
    loading: true,
    loaded: false,
    documents: PROCUREMENT_DOCUMENT_STATE.key === key
      ? (PROCUREMENT_DOCUMENT_STATE.documents || {})
      : {}
  };
  updateProcurementDocumentViewButtons();

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'GET_PROCUREMENT_DOCUMENTS',
        noPR: meta.nopr || '',
        description: meta.description || '',
        rfq: meta.rfq || '',
        statusPR: meta.status_pr || '',
        round: getDocumentRound(meta),
        folderId: meta.folderid || ''
      })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Gagal membaca dokumen Procurement.');

    if (getCurrentProcurementDocumentKey() !== key) return {};

    // Gunakan kembali folder akar yang sudah divalidasi backend terhadap No PR.
    // View dan Save to Folder berikutnya dengan demikian selalu memakai target
    // yang sama, walaupun Folder ID pada cache Workspace sebelumnya sudah lama.
    if (result.folderId) {
      meta.folderid = result.folderId;
      meta.folderlink = result.folderUrl || meta.folderlink || '';
    }

    PROCUREMENT_DOCUMENT_STATE = {
      key,
      loading: false,
      loaded: true,
      documents: result.documents || {}
    };
    return PROCUREMENT_DOCUMENT_STATE.documents;
  } catch (error) {
    console.warn('Dokumen Procurement tidak dapat diperiksa:', error);
    if (getCurrentProcurementDocumentKey() === key) {
      PROCUREMENT_DOCUMENT_STATE.loading = false;
      PROCUREMENT_DOCUMENT_STATE.loaded = true;
    }
    return PROCUREMENT_DOCUMENT_STATE.documents || {};
  } finally {
    updateProcurementDocumentViewButtons();
  }
}

function rememberUploadedProcurementDocument(documentType, result) {
  const type = String(documentType || result?.documentType || '').trim().toUpperCase();
  if (!PROCUREMENT_DOCUMENT_VIEW_CONFIG[type] || !result?.success || !result?.fileId) return;

  const key = getCurrentProcurementDocumentKey();
  if (!key) return;
  if (PROCUREMENT_DOCUMENT_STATE.key !== key) {
    PROCUREMENT_DOCUMENT_STATE = { key, loading: false, loaded: true, documents: {} };
  }

  PROCUREMENT_DOCUMENT_STATE.documents[type] = {
    documentType: type,
    fileId: result.fileId,
    fileName: result.fileName || '',
    fileUrl: result.fileUrl || '',
    previewUrl: result.previewUrl || `https://drive.google.com/file/d/${encodeURIComponent(result.fileId)}/preview`,
    mimeType: result.mimeType || '',
    updatedAt: result.updatedAt || new Date().toISOString(),
    folderName: result.folderName || PROCUREMENT_DOCUMENT_VIEW_CONFIG[type].folderName,
    targetFolderId: result.targetFolderId || '',
    targetFolderUrl: result.targetFolderUrl || '',
    downloadUrl: result.downloadUrl || `https://drive.google.com/uc?export=download&id=${encodeURIComponent(result.fileId)}`,
    extension: String(result.fileName || '').split('.').pop().toLowerCase()
  };
  PROCUREMENT_DOCUMENT_STATE.loaded = true;
  updateProcurementDocumentViewButtons();
}

function ensureStoredDocumentViewerDialog() {
  let dialog = document.getElementById('storedProcurementDocumentDialog');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'storedProcurementDocumentDialog';
  dialog.className = 'stored-procurement-document-dialog';
  dialog.innerHTML = `
    <div class="stored-document-viewer-header">
      <div>
        <h3 id="storedDocumentViewerTitle">View Document</h3>
        <p id="storedDocumentViewerMeta">-</p>
      </div>
      <div class="stored-document-viewer-actions">
        <button type="button" class="secondary stored-document-excel-btn" id="storedDocumentDownloadExcel">Download/Open Excel</button>
        <button type="button" class="secondary stored-document-save-back-btn" id="storedDocumentSaveBack">Save Back to Storage</button>
        <button type="button" class="secondary stored-document-back-btn" id="storedDocumentViewerBack">← Back</button>
        <input type="file" id="storedDocumentUploadInput" class="hidden-input"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
      </div>
    </div>
    <div class="stored-document-viewer-body">
      <iframe id="storedDocumentViewerFrame" title="Preview dokumen Procurement" loading="lazy"></iframe>
    </div>`;
  document.body.appendChild(dialog);

  const close = () => {
    const frame = document.getElementById('storedDocumentViewerFrame');
    if (frame) frame.src = 'about:blank';
    ACTIVE_STORED_DOCUMENT_TYPE = '';
    dialog.close();
  };
  dialog.querySelector('#storedDocumentDownloadExcel').addEventListener('click', downloadStoredProcurementDocument);
  dialog.querySelector('#storedDocumentSaveBack').addEventListener('click', requestStoredProcurementDocumentUpload);
  dialog.querySelector('#storedDocumentUploadInput').addEventListener('change', event => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (file) saveEditedProcurementDocumentBackToFolder(file);
  });
  dialog.querySelector('#storedDocumentViewerBack').addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close();
  });
  return dialog;
}

function getActiveStoredProcurementDocument() {
  const type = String(ACTIVE_STORED_DOCUMENT_TYPE || '').trim().toUpperCase();
  return {
    type,
    config: PROCUREMENT_DOCUMENT_VIEW_CONFIG[type] || null,
    documentInfo: PROCUREMENT_DOCUMENT_STATE.documents?.[type] || null
  };
}

function getStoredProcurementDocumentDownloadUrl(documentInfo) {
  if (!documentInfo) return '';
  const directUrl = String(documentInfo.downloadUrl || '').trim();
  if (directUrl && !/\/folders\//i.test(directUrl)) return directUrl;

  const previewUrl = buildDrivePreviewUrl(documentInfo);
  const match = previewUrl.match(/\/file\/d\/([^/?#]+)/i);
  const fileId = match?.[1]
    ? decodeURIComponent(match[1])
    : String(documentInfo.fileId || '').trim();
  return fileId
    ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`
    : '';
}

function downloadStoredProcurementDocument() {
  const { config, documentInfo } = getActiveStoredProcurementDocument();
  if (!config || !documentInfo) {
    alert('Dokumen belum tersedia. Klik View kembali setelah file tersimpan di folder PR.');
    return;
  }

  const downloadUrl = getStoredProcurementDocumentDownloadUrl(documentInfo);
  if (!downloadUrl) {
    alert('Link Download Excel tidak tersedia.');
    return;
  }

  const link = document.createElement('a');
  link.href = downloadUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.download = documentInfo.fileName || `${config.label}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function requestStoredProcurementDocumentUpload() {
  const { config, documentInfo } = getActiveStoredProcurementDocument();
  if (!config || !documentInfo) {
    alert('Dokumen tujuan belum tersedia pada folder PR.');
    return;
  }
  if (STORED_DOCUMENT_UPLOAD_IN_FLIGHT) return;

  const input = document.getElementById('storedDocumentUploadInput');
  if (input) input.click();
}

async function saveEditedProcurementDocumentBackToFolder(file) {
  const { type, config, documentInfo } = getActiveStoredProcurementDocument();
  if (!type || !config || !documentInfo || STORED_DOCUMENT_UPLOAD_IN_FLIGHT) return;

  if (!/\.xlsx$/i.test(String(file?.name || ''))) {
    alert('Pilih file Excel berformat .xlsx.');
    return;
  }

  const targetFileName = String(documentInfo.fileName || file.name || '').trim();
  const confirmed = window.confirm(
    `Simpan kembali file hasil edit ke Storage Location lokal?\n\n` +
    `${targetFileName}\n` +
    `Lokasi: ${config.folderName} pada No PR aktif\n\n` +
    `File dengan nama yang sama akan diperbarui.`
  );
  if (!confirmed) return;

  STORED_DOCUMENT_UPLOAD_IN_FLIGHT = true;
  const saveBackButton = document.getElementById('storedDocumentSaveBack');
  const downloadButton = document.getElementById('storedDocumentDownloadExcel');
  const originalText = saveBackButton?.textContent || 'Save Back to Storage';
  if (saveBackButton) {
    saveBackButton.disabled = true;
    saveBackButton.textContent = 'Saving Back...';
  }
  if (downloadButton) downloadButton.disabled = true;

  try {
    const result = await saveBlobToLocalDrive(file, targetFileName, type);
    if (!result?.saved) throw new Error('File hasil edit gagal disimpan kembali.');

    alert(
      `${config.label} hasil edit berhasil disimpan kembali ke Storage Location.\n\n` +
      `${result.path}`
    );
    recordProcurementActivity({
      type,
      documentNo: type === 'CQS' ? getCQSNumber() : formatRFQDisplayFromMeta(getBidderMeta()),
      status: 'Updated from Excel',
      detail: `${config.folderName} · Update file lokal`,
      fileName: targetFileName
    });
  } catch (error) {
    console.error(`Gagal menyimpan kembali ${config.label}:`, error);
    alert(`Gagal menyimpan kembali ${config.label}: ${error.message || error}`);
  } finally {
    STORED_DOCUMENT_UPLOAD_IN_FLIGHT = false;
    if (saveBackButton) {
      saveBackButton.disabled = false;
      saveBackButton.textContent = originalText;
    }
    if (downloadButton) downloadButton.disabled = false;
  }
}

async function openStoredProcurementDocument(documentType) {
  const type = String(documentType || '').trim().toUpperCase();
  if (!PROCUREMENT_DOCUMENT_VIEW_CONFIG[type]) return;

  // Setiap klik View membaca ulang folder PR agar iframe selalu membuka file
  // hasil yang benar-benar tersimpan. View tidak boleh membuat file dari master
  // template; pembuatan/pembaruan file hanya dilakukan oleh Save ... to Storage.
  await refreshProcurementDocuments({ force: true });
  const documentInfo = PROCUREMENT_DOCUMENT_STATE.documents?.[type] || null;

  if (!isStoredProcurementDocumentAvailable(documentInfo)) {
    const config = PROCUREMENT_DOCUMENT_VIEW_CONFIG[type];
    alert(`${config.label} belum ditemukan di Storage Location ${config.folderName} untuk No PR aktif.\n\nGunakan Save ${config.label} to Storage terlebih dahulu, lalu klik View kembali.`);
    return;
  }

  const dialog = ensureStoredDocumentViewerDialog();
  const title = document.getElementById('storedDocumentViewerTitle');
  const meta = document.getElementById('storedDocumentViewerMeta');
  const frame = document.getElementById('storedDocumentViewerFrame');

  // Semua dokumen dibuka dari file hasil di folder PR melalui iframe Google
  // Drive Preview. Master template tidak dibuka dan tidak diubah oleh View.
  ACTIVE_STORED_DOCUMENT_TYPE = type;
  title.textContent = `View ${PROCUREMENT_DOCUMENT_VIEW_CONFIG[type].label}`;
  meta.textContent = `${documentInfo.fileName} • ${documentInfo.folderName || PROCUREMENT_DOCUMENT_VIEW_CONFIG[type].folderName}`;
  frame.src = buildDrivePreviewUrl(documentInfo);

  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', 'open');
}

function ensureBidderTemplatePreviewButton() {
  // Preview HTML dihapus agar tidak tertukar dengan file XLSX hasil export.
  const oldButton = document.getElementById('viewBidderTemplateBtn');
  if (oldButton) oldButton.remove();
}

function buildBidderTemplatePreviewHtml() {
  const bidder = DATA?.structured?.BidderList || {};
  const meta = bidder.meta || {};
  const rows = (bidder.rows || []).filter(row => String(row?.['Name of Invited Supplier'] || '').trim());
  const supplierRows = rows.length ? rows : [{}];

  return `
    <div class="bidder-template-sheet">
      <div class="bidder-template-brand">AlamTri<span>geo</span></div>
      <div class="bidder-template-company">${escapeHtml(meta.company || 'PT. MAKMUR SEJAHTERA WISESA')}</div>
      <div class="bidder-template-doc-actions"><span>ME</span><span>RFQ</span></div>
      <div class="bidder-template-meta bidder-template-pr"><strong>No PR :</strong> ${escapeHtml(meta.nopr || '-')}</div>
      <div class="bidder-template-meta bidder-template-rfq"><strong>No RFQ :</strong> ${escapeHtml(formatRFQDisplayFromMeta(meta) || '-')}</div>
      <div class="bidder-template-meta bidder-template-open"><strong>Open Date :</strong> ${escapeHtml(formatMetaDate(meta.open_date) || '-')}</div>
      <div class="bidder-template-meta bidder-template-close"><strong>Close Date :</strong> ${escapeHtml(formatMetaDate(meta.close_date) || '-')}</div>
      <div class="bidder-template-meta bidder-template-description"><strong>Description :</strong> ${escapeHtml(meta.description || '-')}</div>
      <div class="bidder-template-meta bidder-template-estimate"><strong>Estimation Price :</strong> Rp ${escapeHtml(formatIntegerID(calculateEstPriceRpFromMeta(meta) || 0))}</div>
      <div class="bidder-template-table-wrap">
        <table class="bidder-template-table">
          <thead>
            <tr>
              <th rowspan="2">No</th><th rowspan="2">No Company</th>
              <th rowspan="2" class="supplier-wide">Name of Invited Supplier</th>
              <th colspan="3">Contact Person</th><th rowspan="2">Company Status</th>
              <th rowspan="2">Register Status</th><th colspan="2">Quotation</th>
              <th rowspan="2">Notes</th><th rowspan="2">Remarks</th>
            </tr>
            <tr><th>Nama</th><th>No Telp</th><th>Email</th><th>Accepted Date</th><th>Time</th></tr>
          </thead>
          <tbody>
            ${supplierRows.map((row, index) => `
              <tr>
                <td>${index + 1}</td><td>${escapeHtml(row?.['No Company'] || '')}</td>
                <td class="supplier-wide">${escapeHtml(row?.['Name of Invited Supplier'] || '')}</td>
                <td>${escapeHtml(row?.['Contact Person'] || '')}</td>
                <td>${escapeHtml(row?.['No Telp'] || '')}</td><td>${escapeHtml(row?.['Email'] || '')}</td>
                <td>${escapeHtml(row?.['Company Status'] || '')}</td>
                <td>${escapeHtml(row?.['Register Status'] || '')}</td>
                <td>${escapeHtml(row?.['Accepted Date'] || '')}</td><td>${escapeHtml(row?.['Time'] || '')}</td>
                <td>${escapeHtml(row?.Notes || '')}</td><td>${escapeHtml(row?.Remarks || '')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="bidder-template-footer-grid">
        <div><strong>Previous Winner PO:</strong><br>${escapeHtml(meta.previous_winner_po || 'None').replace(/\n/g, '<br>')}</div>
        <div><strong>Previous Vendor Quote:</strong><br>${escapeHtml(meta.previous_vendor_quote || 'None').replace(/\n/g, '<br>')}</div>
        <div><strong>Description Cost Center:</strong><br>${escapeHtml(meta.cost_center_detail || '-')}<br><br><strong>PIC User:</strong> ${escapeHtml(meta.pic || '-')}</div>
      </div>
    </div>`;
}


function renderDeliveryLocation(meta){

    const address = getRFQDeliveryAddress(meta, selectedDelivery) || "-";

    return `
        <div class="section-title">
            <h3>Location Delivery</h3>
        </div>

        <div class="delivery-option">

            <label>
                <input
                    type="radio"
                    name="deliveryLocation"
                    value="msw"
                    ${selectedDelivery==="msw" ? "checked" : ""}
                    onchange="changeDelivery('msw')">
                Delivery MSW
            </label>

            <label>
                <input
                    type="radio"
                    name="deliveryLocation"
                    value="ibt"
                    ${selectedDelivery==="ibt" ? "checked" : ""}
                    onchange="changeDelivery('ibt')">
                Delivery IBT
            </label>

        </div>

        <div class="delivery-address">

            ${escapeHtml(address).replace(/\n/g,"<br>")}

        </div>
    `;
}

const RFQ_BUDGET_IDR_MODE_FIELD = '__EstBudgetIdrMode';

const RFQ_REFERENCE_FIELDS = [
  'Previous Price',
  'Date',
  'No Company',
  'Company Name',
  'Est. Budget PR USD',
  'Est. Budget PR IDR',
  RFQ_BUDGET_IDR_MODE_FIELD,
  'Item Number',
  'Commodity WHS',
  'Previous Company',
  'Reference Source',
  'Reference Checked At'
];

const RFQ_MAIN_INPUT_HEADERS = ['No', 'Description', 'Qty', 'Ord Unit'];
const RFQ_INTERNAL_REFERENCE_HEADERS = [
  'Previous Price',
  'Date',
  'No Company',
  'Company Name',
  'Est. Budget PR USD',
  'Est. Budget PR IDR',
  'Item Number',
  'Commodity WHS',
  'Previous Company'
];

const RFQ_INTERNAL_EDITABLE_HEADERS = [
  'Est. Budget PR USD',
  'Est. Budget PR IDR',
  'Item Number'
];

function ensureRFQReferenceFields() {
  const items = DATA?.structured?.RFQ?.items;
  if (!Array.isArray(items)) return;

  items.forEach((row, index) => {
    if (!row || Array.isArray(row)) return;

    RFQ_MAIN_INPUT_HEADERS.concat(RFQ_REFERENCE_FIELDS).forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(row, field)) row[field] = '';
    });

    // Migrasi data lama: satu kolom Est. Budget PR dianggap sebagai nilai IDR.
    if (
      !String(row['Est. Budget PR IDR'] || '').trim() &&
      String(row['Est. Budget PR'] || '').trim()
    ) {
      row['Est. Budget PR IDR'] = row['Est. Budget PR'];
    }

    [
      'Est. Budget PR', 'Value', 'List of WS Status', 'Previous PO', 'Currency',
      'Buyer Name'
    ].forEach(field => {
      if (Object.prototype.hasOwnProperty.call(row, field)) delete row[field];
    });

    row.No = String(index + 1);
    ensureRFQBudgetIdrMode(row);
    if (row[RFQ_BUDGET_IDR_MODE_FIELD] === 'auto') {
      const automaticIdr = calculateRFQBudgetIdrAuto(row);
      row['Est. Budget PR IDR'] = automaticIdr > 0 ? formatIntegerID(automaticIdr) : '';
    }
    if (!String(row['Item Number'] || '').trim()) clearRFQItemReference(row);
  });
}

function getRFQItemHeaders(rows) {
  const found = getHeaders(rows);
  const preferred = RFQ_MAIN_INPUT_HEADERS.concat(RFQ_REFERENCE_FIELDS);
  return preferred.filter(header => found.includes(header))
    .concat(found.filter(header => !preferred.includes(header) && ![
      'Est. Budget PR', 'Value', 'List of WS Status', 'Previous PO', 'Currency',
      'Buyer Name'
    ].includes(header)));
}

function isRFQReferenceReadOnlyHeader(header) {
  return !RFQ_INTERNAL_EDITABLE_HEADERS.includes(header);
}

function clearRFQItemReference(row) {
  if (!row || typeof row !== 'object') return;

  // Budget USD/IDR adalah input Buyer dan tidak dihapus ketika Item Number berubah.
  [
    'Previous Price', 'Date', 'No Company', 'Company Name',
    'Commodity WHS', 'Previous Company', 'Reference Source',
    'Reference Checked At'
  ].forEach(field => row[field] = '');
}

function formatRFQMoneyDisplay(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const number = parseCurrencyNumber(text);
  return number || /^0([.,]0+)?$/.test(text) ? formatIntegerID(number) : text;
}

function getRFQBudgetQty(row) {
  const qty = parseCurrencyNumber(row?.Qty ?? row?.Quantity ?? 0);
  return qty > 0 ? qty : 1;
}

function calculateRFQBudgetIdrAuto(row, usdValue = null) {
  const usd = usdValue === null
    ? parseCurrencyNumber(row?.['Est. Budget PR USD'] || 0)
    : parseCurrencyNumber(usdValue);
  if (!(usd > 0)) return 0;
  return Math.round(usd * getCurrentUsdIdrRate() * getRFQBudgetQty(row));
}

function ensureRFQBudgetIdrMode(row) {
  if (!row || typeof row !== 'object') return 'auto';
  const currentMode = String(row[RFQ_BUDGET_IDR_MODE_FIELD] || '').toLowerCase();
  if (currentMode === 'manual' || currentMode === 'auto') return currentMode;

  const usd = parseCurrencyNumber(row['Est. Budget PR USD'] || 0);
  const idrText = String(row['Est. Budget PR IDR'] || '').trim();
  const idr = parseCurrencyNumber(idrText);
  if (!idrText || !(usd > 0)) {
    row[RFQ_BUDGET_IDR_MODE_FIELD] = idrText ? 'manual' : 'auto';
    return row[RFQ_BUDGET_IDR_MODE_FIELD];
  }

  // Migrasi aman: nilai dari versi lama (USD x kurs) dan versi baru
  // (USD x kurs x Qty) dianggap hasil otomatis. Nilai lain dianggap total manual.
  const rate = getCurrentUsdIdrRate();
  const oldAutomatic = Math.round(usd * rate);
  const newAutomatic = Math.round(usd * rate * getRFQBudgetQty(row));
  row[RFQ_BUDGET_IDR_MODE_FIELD] =
    (Math.abs(idr - oldAutomatic) <= 1 || Math.abs(idr - newAutomatic) <= 1)
      ? 'auto'
      : 'manual';
  return row[RFQ_BUDGET_IDR_MODE_FIELD];
}

function syncRFQBudgetIdrCell(row, rowIndex) {
  const idrCell = document.querySelector(
    `td[data-row="${rowIndex}"][data-key="Est. Budget PR IDR"]`
  );
  if (idrCell) idrCell.innerText = row['Est. Budget PR IDR'] || '';
}

function recalculateRFQBudgetIdrIfAutomatic(row, rowIndex) {
  if (ensureRFQBudgetIdrMode(row) !== 'auto') return;
  const automaticIdr = calculateRFQBudgetIdrAuto(row);
  row['Est. Budget PR IDR'] = automaticIdr > 0 ? formatIntegerID(automaticIdr) : '';
  syncRFQBudgetIdrCell(row, rowIndex);
}

function updateRFQBudgetFromUsd(row, rowIndex, usdValue) {
  ensureRFQBudgetIdrMode(row);
  const usd = parseCurrencyNumber(usdValue);
  row['Est. Budget PR USD'] = usd > 0 ? formatIntegerID(usd) : '';

  // Convert IDR yang pernah diisi manual adalah harga total dan tidak dihitung ulang.
  if (row[RFQ_BUDGET_IDR_MODE_FIELD] === 'auto') {
    const automaticIdr = calculateRFQBudgetIdrAuto(row, usd);
    row['Est. Budget PR IDR'] = automaticIdr > 0 ? formatIntegerID(automaticIdr) : '';
  }

  syncRFQBudgetIdrCell(row, rowIndex);
}

function handleRFQBudgetCellEdit(cell) {
  const rowIndex = Number(cell.dataset.row);
  const key = cell.dataset.key;
  const rows = DATA?.structured?.RFQ?.items || [];
  const row = rows[rowIndex];
  if (!row) return;

  if (key === 'Est. Budget PR USD') {
    updateRFQBudgetFromUsd(row, rowIndex, cell.innerText);
    cell.innerText = row[key];
  } else if (key === 'Est. Budget PR IDR') {
    const rawText = String(cell.innerText || '').trim();
    const value = parseCurrencyNumber(rawText);
    if (rawText && value >= 0) {
      row[key] = formatIntegerID(value);
      row[RFQ_BUDGET_IDR_MODE_FIELD] = 'manual';
    } else {
      row[RFQ_BUDGET_IDR_MODE_FIELD] = 'auto';
      const automaticIdr = calculateRFQBudgetIdrAuto(row);
      row[key] = automaticIdr > 0 ? formatIntegerID(automaticIdr) : '';
    }
    cell.innerText = row[key];
  }

  markDirty('Est. Budget PR berubah. Nilai otomatis dihitung USD x kurs x Qty; input IDR manual dianggap harga total.');
  if (typeof scheduleDocumentAutosave === 'function') scheduleDocumentAutosave();
}


function renderRFQMainItemTable(filtered, path) {
  let out = '<div class="table-wrap rfq-main-table"><table><thead><tr>';
  RFQ_MAIN_INPUT_HEADERS.forEach(header => out += `<th>${escapeHtml(header)}</th>`);
  out += '</tr></thead><tbody>';
  filtered.forEach(item => {
    out += '<tr>';
    RFQ_MAIN_INPUT_HEADERS.forEach(header => {
      const value = item.row[header] || '';
      const editable = editMode ? ' contenteditable="true"' : '';
      const oninput = editMode
        ? ` data-path="${escapeHtml(path)}" data-row="${item.idx}" data-key="${escapeHtml(header)}" oninput="handleRFQItemCellEdit(this)"`
        : '';
      out += `<td${editable}${oninput}>${escapeHtml(value)}</td>`;
    });
    out += '</tr>';
  });
  out += '</tbody></table></div>';
  return out;
}

function renderRFQInternalReferenceTable(filtered, path) {
  let out = `<details class="rfq-internal-reference"${editMode ? ' open' : ''}>
    <summary>Reference Internal Item — tidak tampil pada RFQ/PDF</summary>
    <div class="rfq-reference-caption">Previous Price dan histori diambil dari Report berstatus CLOSE. Commodity WHS diambil dari List of WS. Est. Budget PR otomatis dihitung USD × kurs snapshot × Qty; input Convert IDR manual dianggap sebagai harga total.</div>
    <div class="table-wrap rfq-item-table rfq-reference-table"><table><thead>
      <tr class="rfq-reference-group-header">
        <th rowspan="2">Previous Price</th>
        <th rowspan="2">Date</th>
        <th rowspan="2">No Company</th>
        <th rowspan="2">Company Name</th>
        <th colspan="2">Est. Budget PR</th>
        <th rowspan="2">Item Number</th>
        <th rowspan="2">Commodity WHS</th>
        <th rowspan="2">Previous Company</th>
        ${editMode && path ? '<th rowspan="2" class="reference-action-header">Action</th>' : ''}
      </tr>
      <tr class="rfq-reference-sub-header">
        <th>USD</th>
        <th>Convert IDR</th>
      </tr>
    </thead><tbody>`;

  filtered.forEach(item => {
    out += '<tr>';
    RFQ_INTERNAL_REFERENCE_HEADERS.forEach(header => {
      const rawValue = item.row[header] || '';
      const value = ['Previous Price', 'Est. Budget PR USD', 'Est. Budget PR IDR'].includes(header)
        ? formatRFQMoneyDisplay(rawValue)
        : rawValue;
      const readOnly = isRFQReferenceReadOnlyHeader(header);
      const isItemNumber = header === 'Item Number';
      const isBudget = header === 'Est. Budget PR USD' || header === 'Est. Budget PR IDR';
      const editable = editMode && !readOnly ? ' contenteditable="true"' : '';
      const readOnlyClass = readOnly ? ' rfq-reference-readonly' : ' rfq-reference-input';
      const itemClass = isItemNumber ? ' item-number-cell' : '';
      const budgetClass = isBudget ? ' rfq-budget-cell' : '';
      let oninput = '';
      if (editMode && isBudget) {
        oninput = ` data-path="${escapeHtml(path)}" data-row="${item.idx}" data-key="${escapeHtml(header)}" onblur="handleRFQBudgetCellEdit(this)"`;
      } else if (editMode && isItemNumber) {
        oninput = ` data-path="${escapeHtml(path)}" data-row="${item.idx}" data-key="${escapeHtml(header)}" oninput="handleRFQItemCellEdit(this)" onblur="lookupRFQItem(${item.idx}, false)"`;
      }
      out += `<td class="${(readOnlyClass + itemClass + budgetClass).trim()}"${editable}${oninput}>${escapeHtml(value)}</td>`;
    });

    if (editMode && path) {
      const hasItem = Boolean(String(item.row['Item Number'] || '').trim());
      out += `<td class="action-cell reference-actions">
        <button type="button" class="mini-btn" ${hasItem ? '' : 'disabled'} onclick="lookupRFQItem(${item.idx}, true)">Lookup</button>
        <button class="mini-btn danger" data-path="${escapeHtml(path)}" data-row="${item.idx}" onclick="deleteRow(this.dataset.path, Number(this.dataset.row))">Hapus</button>
      </td>`;
    }
    out += '</tr>';
  });

  out += '</tbody></table></div></details>';
  return out;
}

// Rapikan baris RFQ items sebelum dirender: baris kosong (belum diisi Description/
// Qty/dst) disembunyikan/dibuang kecuali baris terakhir (supaya baris yang baru saja
// ditambahkan lewat "+ Tambah Baris" tetap terlihat untuk diisi). Jika seluruh baris
// masih kosong, hanya baris ke-1 yang ditampilkan. Ini berlaku untuk tabel Description
// (atas) maupun Reference Internal Item (bawah) karena keduanya berbagi array data
// yang sama (structured.RFQ.items).
function compactRFQItemRowsForDisplay() {
  const rfq = DATA?.structured?.RFQ;
  if (!rfq || !Array.isArray(rfq.items) || rfq.items.length <= 1) return;

  const rows = rfq.items;
  const finalRows = rows.filter((row, idx) => isMeaningfulRFQItemRow(row) || idx === rows.length - 1);
  if (finalRows.length === rows.length) return;

  rows.splice(0, rows.length, ...finalRows);
  rows.forEach((row, idx) => {
    if (row && Object.prototype.hasOwnProperty.call(row, 'No')) row.No = String(idx + 1);
  });
}

function renderRFQItemTable(rows, path, forExport = false) {
  if (!forExport) compactRFQItemRowsForDisplay();
  const term = document.getElementById('searchBox')?.value.trim() || '';
  const sourceRows = Array.isArray(rows) ? rows : [];
  const filtered = sourceRows
    .map((row, idx) => ({row, idx}))
    .filter(item => rowMatches(item.row, term));

  let out = '';
  if (!forExport) {
    out += '<div class="table-actions rfq-reference-actions">';
    if (editMode && path) {
      out += `<button class="mini-btn ok" data-path="${escapeHtml(path)}" onclick="addRFQItemRow(this.dataset.path)">+ Tambah Baris</button>`;
    }
    out += '<button type="button" class="mini-btn" onclick="refreshAllRFQItemReferences()">Refresh Semua Item</button>';
    out += '<span class="pill">Autosave aktif</span></div>';
  }
  if (!filtered.length) return out + '<p class="empty">Tidak ada data yang cocok.</p>';

  // Description (kiri) dan Reference Internal Item (kanan) ditampilkan sebelahan
  // dalam satu baris flex, bukan bertumpuk vertikal seperti sebelumnya.
  out += '<div class="rfq-tables-row">';
  out += renderRFQMainItemTable(filtered, path);
  if (!forExport) out += renderRFQInternalReferenceTable(filtered, path);
  out += '</div>';
  return out;
}

function addRFQItemRow(path) {
  ensureRFQReferenceFields();
  const rows = getByPath(path);
  if (!Array.isArray(rows)) return;
  const headers = getRFQItemHeaders(rows);
  const row = {};
  headers.forEach(header => row[header] = '');
  rows.push(row);

  // Lanjutkan nomor urut otomatis untuk semua baris (sama seperti addRow/deleteRow).
  rows.forEach((r, index) => {
    if (r && Object.prototype.hasOwnProperty.call(r, 'No')) r.No = String(index + 1);
  });

  markDirty('Baris RFQ baru ditambahkan. Klik Save untuk menyimpan.');
  renderCurrent();
}

function handleRFQItemCellEdit(cell) {
  handleCellEdit(cell);
  const rowIndex = Number(cell.dataset.row);
  const rows = DATA?.structured?.RFQ?.items || [];
  const row = rows[rowIndex];
  if (!row) return;

  if (cell.dataset.key === 'Qty') {
    recalculateRFQBudgetIdrIfAutomatic(row, rowIndex);
    if (typeof scheduleDocumentAutosave === 'function') scheduleDocumentAutosave();
    return;
  }

  if (cell.dataset.key === 'Item Number') clearRFQItemReference(row);
}

async function lookupRFQItem(rowIndex, showAlert = true, rerender = true) {
  ensureRFQReferenceFields();
  const rows = DATA?.structured?.RFQ?.items || [];
  const row = rows[rowIndex];
  if (!row) return false;

  const itemNumber = String(row['Item Number'] || '').trim();
  if (!itemNumber) {
    clearRFQItemReference(row);
    if (showAlert) alert('Isi Item Number terlebih dahulu.');
    if (rerender) renderCurrent();
    return false;
  }

  if (rerender) renderCurrent();

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify({action: 'LOOKUP_ITEM_NUMBER', itemNumber})
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Lookup Item Number gagal.');

    row['Previous Price'] = result.previousPrice || result.previousUnitPrice || '';
    row.Date = result.previousDate || '';
    row['Company Name'] = result.companyName || result.previousWinner || '';
    row['No Company'] = result.noCompany || (row['Company Name'] ? 'New Vendor' : '');
    row['Commodity WHS'] = result.commodityWHS || '';
    row['Previous Company'] = result.previousCompany || '';
    row['Reference Source'] = [result.reportSource, result.listOfWSSource]
      .filter(Boolean)
      .join(' | ');
    row['Reference Checked At'] = formatReferenceCheckedAt(
      result.checkedAt || new Date().toISOString()
    );

    markDirty(`Referensi Item Number ${itemNumber} diperbarui. Klik Save untuk menyimpan snapshot.`);
    if (showAlert && !result.found) {
      alert(result.message || 'Item Number tidak ditemukan pada Report/List of WS.');
    }
    if (rerender) renderCurrent();
    return Boolean(result.found);
  } catch (error) {
    row['Reference Checked At'] = formatReferenceCheckedAt(new Date().toISOString());
    if (rerender) renderCurrent();
    if (showAlert) alert(`Gagal lookup Item Number: ${error.message || error}`);
    return false;
  }
}

function formatReferenceCheckedAt(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value || '');
  return date.toLocaleString('en-GB', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false}).replace(/,/g, '');
}

async function refreshAllRFQItemReferences() {
  const rows = DATA?.structured?.RFQ?.items || [];
  const indexes = rows.map((row, index) => String(row?.['Item Number'] || '').trim() ? index : -1).filter(index => index >= 0);
  if (!indexes.length) return alert('Belum ada Item Number untuk diperiksa.');

  const status = document.getElementById('saveStatus');
  if (status) status.textContent = `Memeriksa ${indexes.length} Item Number...`;
  let found = 0;
  for (const index of indexes) {
    if (await lookupRFQItem(index, false, false)) found += 1;
  }
  renderCurrent();
  if (status) status.textContent = `${found} dari ${indexes.length} Item Number ditemukan. Klik Save untuk menyimpan snapshot.`;
}

function normalizeChecklistValue(value) {
  const text = String(value || '').trim().toLowerCase();
  return ['☑', '✓', '✔', 'yes', 'true', '1', 'checked', 'aktif', 'active'].includes(text);
}

function ensureRFQSelectionState() {
  const rfq = DATA?.structured?.RFQ;
  if (!rfq) return;

  if (!Array.isArray(rfq.requirements)) rfq.requirements = [];
  rfq.requirements.forEach(row => {
    if (!row || typeof row !== 'object') return;
    row.Checklist = normalizeChecklistValue(row.Checklist) ? '☑' : '☐';
  });

  if (!Array.isArray(rfq.terms)) rfq.terms = [];
  if (!Array.isArray(rfq.termSelections)) rfq.termSelections = [];

  const cleanedTerms = [];
  const cleanedSelections = [];
  rfq.terms.forEach((term, idx) => {
    if (isFrancoTerm(term)) return;
    cleanedTerms.push(term);
    cleanedSelections.push(typeof rfq.termSelections[idx] === 'boolean' ? rfq.termSelections[idx] : true);
  });
  rfq.terms = cleanedTerms;
  rfq.termSelections = cleanedSelections;
}

function renderRFQRequirements(rows, path, forExport = false) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const visibleRows = (editMode && !forExport)
    ? sourceRows.map((row, idx) => ({row, idx}))
    : sourceRows.map((row, idx) => ({row, idx}))
        .filter(item => normalizeChecklistValue(item.row?.Checklist));

  if (!visibleRows.length) return '<p class="empty">Tidak ada mandatory requirement yang dipilih.</p>';

  let out = '<div class="table-wrap"><table class="rfq-requirement-table"><thead><tr>';
  if (editMode && !forExport) out += '<th>Checklist</th>';
  out += '<th>Requirement</th></tr></thead><tbody>';

  visibleRows.forEach(item => {
    const selected = normalizeChecklistValue(item.row?.Checklist);
    const editable = editMode && !forExport
      ? ` contenteditable="true" data-path="${escapeHtml(path)}" data-row="${item.idx}" data-key="Requirement" oninput="handleCellEdit(this)"`
      : '';
    out += '<tr>';
    if (editMode && !forExport) {
      out += `<td class="rfq-check-cell"><input type="checkbox"${selected ? ' checked' : ''} onchange="toggleRFQRequirement(${item.idx}, this.checked)" aria-label="Pilih mandatory requirement"></td>`;
    }
    out += `<td${editable}>${escapeHtml(item.row?.Requirement || '')}</td></tr>`;
  });

  out += '</tbody></table></div>';
  return out;
}
function toggleRFQRequirement(rowIndex, checked) {
  const rows = DATA?.structured?.RFQ?.requirements || [];
  if (!rows[rowIndex]) return;
  rows[rowIndex].Checklist = checked ? '☑' : '☐';
  markDirty('Checklist mandatory requirement berubah. Klik Save untuk menyimpan.');
}

function isTermsHeading(value) {
  return String(value || '').trim().toLowerCase() === 'terms and conditions';
}

function isFrancoTerm(value) {
  return /^\s*franco\b/i.test(String(value || '').trim());
}

function renderRFQTerms(x, forExport = false) {
  ensureRFQSelectionState();
  const terms = Array.isArray(x.terms) ? x.terms : [];
  const selections = Array.isArray(x.termSelections) ? x.termSelections : [];
  const termRows = terms
    .map((text, idx) => ({ text, idx }))
    .filter(item => !isTermsHeading(item.text) && !isFrancoTerm(item.text));

  if (!termRows.length) return '<p class="empty">Belum ada Terms & Conditions.</p>';

  const selectedRows = termRows.filter(item => selections[item.idx] !== false);
  if (forExport || !editMode) {
    if (!selectedRows.length) return '<p class="empty">Tidak ada Terms & Conditions yang dipilih.</p>';
    return `<div class="rfq-terms-export">${selectedRows.map(item => `<div class="notice">${escapeHtml(item.text).replace(/\n/g, '<br>')}</div>`).join('')}</div>`;
  }

  let out = `<div class="table-actions rfq-term-actions">
      <button class="mini-btn ok" type="button" onclick="setAllRFQTerms(true)">Pilih Semua</button>
      <button class="mini-btn" type="button" onclick="setAllRFQTerms(false)">Kosongkan Pilihan</button>
      <span class="pill">Centang hanya Terms & Conditions yang akan tampil</span>
    </div>`;

  out += '<div class="rfq-term-list">';
  termRows.forEach(item => {
    const checked = selections[item.idx] !== false;
    out += `<div class="rfq-term-row${checked ? ' selected' : ''}">
      <label class="rfq-term-check">
        <input type="checkbox"${checked ? ' checked' : ''} onchange="toggleRFQTerm(${item.idx}, this.checked)">
      </label>
      <div class="notice rfq-term-text" contenteditable="true" data-term-index="${item.idx}" oninput="handleTermEdit(this)">${escapeHtml(item.text).replace(/\n/g, '<br>')}</div>
    </div>`;
  });
  out += '</div>';
  return out;
}
function toggleRFQTerm(termIndex, checked) {
  ensureRFQSelectionState();
  DATA.structured.RFQ.termSelections[termIndex] = Boolean(checked);
  markDirty('Pilihan Terms & Conditions berubah. Klik Save untuk menyimpan.');
  renderCurrent();
}

function setAllRFQTerms(checked) {
  ensureRFQSelectionState();
  const rfq = DATA.structured.RFQ;
  rfq.terms.forEach((term, idx) => {
    if (!isTermsHeading(term)) rfq.termSelections[idx] = Boolean(checked);
  });
  markDirty('Pilihan Terms & Conditions diperbarui. Klik Save untuk menyimpan.');
  renderCurrent();
}

function renderRFQ(options = {}) {
  const { forExport = false } = options;
  const x = DATA.structured.RFQ;
  ensureRFQReferenceFields();
  ensureRFQSelectionState();
  selectedDelivery = x?.meta?.delivery_location === 'ibt' ? 'ibt' : 'msw';
  if (x?.meta) {
    x.meta.delivery_location = selectedDelivery;
    x.meta.delivery_address = getRFQDeliveryAddress(x.meta, selectedDelivery);
  }
  let out = forExport ? '' : editHint();

  out += `<div class="section-title">
            <h3>RFQ Items</h3>
            <span class="pill">${x.items.length} rows</span>
          </div>`;
  if (!forExport) {
    out += `<div class="notice rfq-reference-notice">Isi RFQ tetap manual. Hanya <b>Item Number</b> yang membaca referensi Report/List of WS untuk menampilkan status, previous winner, dan previous unit price secara read-only.</div>`;
  }
  out += renderRFQItemTable(x.items, 'structured.RFQ.items', forExport);

  out += '<div class="rfq-rules-grid">';
  out += '<section class="rfq-rule-panel rfq-rule-panel-mandatory">';
  out += `<div class="section-title"><h3>Mandatory Requirements</h3></div>`;
  out += renderRFQRequirements(x.requirements, 'structured.RFQ.requirements', forExport);
  out += '</section>';

  out += '<section class="rfq-rule-panel rfq-rule-panel-terms">';
  out += `<div class="section-title"><h3>Terms & Conditions</h3></div>`;
  out += renderRFQTerms(x, forExport);
  out += '</section>';
  out += '</div>';

  out += renderDeliveryLocation(x.meta);

  return out;
}
function handleTermEdit(el) {
  const idx = Number(el.dataset.termIndex);
  DATA.structured.RFQ.terms[idx] = el.innerText;
  markDirty('Terms berubah. Klik Save untuk mengirim perubahan ke Google Sheet.');
}


function getVendorSnapshotForCQS(row) {
  const live = findVendorByCompany(row?.['Name of Invited Supplier']);
  const snap = row?.__vendorSnapshot || {};
  return {
    noCompany: row?.['No Company'] || live?.noCompany || snap.noCompany || '',
    companyName: row?.['Name of Invited Supplier'] || live?.companyName || snap.companyName || '',
    address: live?.address || snap.address || pickValueByAliases(live?.raw || snap.raw || {}, ['Address Company', 'Address', 'Company Address']),
    customerContact: live?.customerContact || snap.customerContact || row?.['Contact Person'] || '',
    companyPhone: String(live?.companyPhone || snap.companyPhone || row?.['No Telp'] || ''),
    email: live?.email || snap.email || row?.['Email'] || '',
    contactPersons: live?.contactPersons || snap.contactPersons || [],
    raw: live?.raw || {}
  };
}

function splitContactValues(value) {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  return String(value || '')
    .split(/\r?\n|;|\|/)
    .map(v => v.trim())
    .filter(Boolean);
}

function buildVendorAttn(vendor) {
  const raw = vendor.raw || {};
  const explicitContacts = vendor.contactPersons || raw.contactPersons || raw.contacts || raw['Contact Persons'];
  if (Array.isArray(explicitContacts) && explicitContacts.length) {
    return explicitContacts.map(contact => {
      const name = String(contact.name || contact.Name || contact.customerContact || '').trim();
      const phone = String(contact.phone || contact.Phone || contact.companyPhone || '').trim();
      const emails = splitContactValues(contact.email || contact.Email || '').join('; ');
      return [name, phone, emails].filter(Boolean).join(' - ');
    }).filter(Boolean).join('; ');
  }

  const names = splitContactValues(vendor.customerContact);
  const phones = splitContactValues(vendor.companyPhone);
  const emails = splitContactValues(vendor.email);

  // Satu nama dapat memiliki lebih dari satu email. Seluruh email tetap berada
  // pada kontak yang sama, misalnya:
  // Contoh format: Nama - telepon - email utama; email alternatif
  if (names.length <= 1) {
    return [
      names[0] || '',
      phones[0] || '',
      emails.join('; ')
    ].filter(Boolean).join(' - ');
  }

  // Jika terdapat beberapa nama, data dipasangkan berdasarkan urutan. Email
  // tambahan yang tidak memiliki pasangan ditempelkan pada kontak terakhir.
  const count = Math.max(names.length, phones.length, 1);
  const contacts = [];
  for (let index = 0; index < count; index++) {
    const contactEmails = [];
    if (emails[index]) contactEmails.push(emails[index]);
    if (index === count - 1 && emails.length > count) {
      contactEmails.push(...emails.slice(count));
    }
    const line = [
      names[index] || '',
      phones[index] || '',
      contactEmails.join('; ')
    ].filter(Boolean).join(' - ');
    if (line) contacts.push(line);
  }
  return contacts.join('; ');
}

function hasRFQDescriptionItems() {
  const items = DATA?.structured?.RFQ?.items || [];
  return items.some(item => String(item?.Description || '').trim());
}

function getCQSWorkspaceStore() {
  DATA.structured.CQS = DATA.structured.CQS && typeof DATA.structured.CQS === 'object'
    ? DATA.structured.CQS
    : { vendors: {} };
  DATA.structured.CQS.vendors = DATA.structured.CQS.vendors && typeof DATA.structured.CQS.vendors === 'object'
    ? DATA.structured.CQS.vendors
    : {};
  return DATA.structured.CQS;
}

function getCQSVendorStorageKey(vendor, index = 0) {
  const noCompany = normalizeTextKey(vendor?.noCompany || '');
  const company = normalizeTextKey(vendor?.companyName || '');
  return noCompany ? `no-${noCompany}` : (company ? `company-${company}` : `vendor-${index + 1}`);
}

function getCQSItemStorageKey(item, index = 0) {
  const itemNumber = normalizeTextKey(item?.['Item Number'] || item?.itemNumber || '');
  const description = normalizeTextKey(item?.Description || '');
  // Item Number pada RFQ tidak selalu unik. Nomor urut wajib menjadi bagian
  // key agar line tambahan milik satu baris tidak ikut tampil pada baris lain.
  return `row-${index + 1}-${itemNumber || description || 'item'}`;
}

const CQS_BOTTOM_LINE_ANCHOR = '__CQS_BOTTOM__';

function normalizeCQSRemarkImages(images) {
  return Array.isArray(images)
    ? images.map(image => ({
        fileId: String(image?.fileId || ''),
        fileName: String(image?.fileName || 'Image'),
        fileUrl: String(image?.fileUrl || ''),
        previewUrl: String(image?.previewUrl || ''),
        mimeType: String(image?.mimeType || '')
      })).filter(image => image.fileId || image.fileUrl)
    : [];
}

function normalizeCQSAdditionalItem(item = {}, index = 0, defaultAfterItemKey = '') {
  return {
    itemKey: String(item?.itemKey || `extra-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`),
    afterItemKey: String(item?.afterItemKey || item?.parentItemKey || defaultAfterItemKey || ''),
    description: String(item?.description || ''),
    qty: item?.qty ?? '',
    unit: String(item?.unit || ''),
    unitPrice: item?.unitPrice ?? '',
    remarks: String(item?.remarks || ''),
    remarkImages: normalizeCQSRemarkImages(item?.remarkImages)
  };
}

function ensureCQSWorkspaceVendor(vendor, index = 0) {
  const store = getCQSWorkspaceStore();
  const key = getCQSVendorStorageKey(vendor, index);
  const current = store.vendors[key] && typeof store.vendors[key] === 'object'
    ? store.vendors[key]
    : {};
  const previousItems = Array.isArray(current.items) ? current.items : [];
  const previousByKey = new Map(previousItems.map(item => [String(item?.itemKey || ''), item]));
  const rfqItems = (DATA?.structured?.RFQ?.items || [])
    .filter(item => String(item?.Description || '').trim())
    .slice(0, 28);
  const items = rfqItems.map((item, itemIndex) => {
    const itemKey = getCQSItemStorageKey(item, itemIndex);
    const previous = previousByKey.get(itemKey) || previousItems[itemIndex] || {};
    return {
      itemKey,
      unitPrice: previous.unitPrice ?? '',
      remarks: String(previous.remarks || ''),
      remarkImages: normalizeCQSRemarkImages(previous.remarkImages)
    };
  });
  const baseItemKeys = rfqItems.map((item, itemIndex) => getCQSItemStorageKey(item, itemIndex));
  const defaultAfterItemKey = baseItemKeys[baseItemKeys.length - 1] || '';
  const validBaseItemKeys = new Set(baseItemKeys);
  const additionalItems = Array.isArray(current.additionalItems)
    ? current.additionalItems.map((item, itemIndex) => {
        const normalized = normalizeCQSAdditionalItem(item, itemIndex, defaultAfterItemKey);
        if (normalized.afterItemKey !== CQS_BOTTOM_LINE_ANCHOR &&
            !validBaseItemKeys.has(normalized.afterItemKey)) {
          normalized.afterItemKey = defaultAfterItemKey;
        }
        return normalized;
      })
    : [];
  const data = {
    companyName: vendor?.companyName || current.companyName || '',
    noCompany: vendor?.noCompany || current.noCompany || '',
    quotationNo: current.quotationNo || current.quotationNumber || current.noQuotation || '',
    quotationDate: current.quotationDate || '',
    validUntilDays: current.validUntilDays ?? '30',
    paymentTerm: current.paymentTerm || '45 days',
    deliveryTerm: current.deliveryTerm || 'Subject prior to sales',
    // Franco mengikuti Location Delivery pada RFQ dan tidak memakai nilai
    // lama yang tersimpan di workspace CQS.
    franco: getCQSFrancoFromRFQ(),
    selectedSupplier: Boolean(current.selectedSupplier),
    justification: current.justification || '',
    note: current.note || '',
    items,
    additionalItems
  };
  store.vendors[key] = data;
  return { key, vendor, data, rfqItems };
}

function getSelectedCQSWorkspaceVendors() {
  return getSelectedCQSVendors().map((item, index) =>
    ensureCQSWorkspaceVendor(getVendorSnapshotForCQS(item.row), index)
  );
}

function setActiveCQSVendor(key) {
  ACTIVE_CQS_VENDOR_KEY = String(key || '');
  renderCurrent();
}

function getCQSWorkspaceItemTarget(key, itemKind, itemIndex) {
  const vendor = getCQSWorkspaceStore().vendors[String(key || '')];
  if (!vendor) return null;
  const collection = itemKind === 'extra' ? vendor.additionalItems : vendor.items;
  if (!Array.isArray(collection)) return null;
  return collection[Number(itemIndex)] || null;
}

function updateCQSVendorFieldFromElement(element) {
  const key = String(element?.dataset?.cqsVendorKey || '');
  const field = String(element?.dataset?.cqsField || '');
  const vendor = getCQSWorkspaceStore().vendors[key];
  if (!vendor || !field) return;
  vendor[field] = element.type === 'checkbox' ? Boolean(element.checked) : element.value;
  markDirty(`Data CQS ${vendor.companyName || ''} berubah. Menunggu autosave...`);
  if (field === 'quotationNo' || field === 'quotationDate') renderCurrent();
}

function updateCQSNumberFromElement(element) {
  const store = getCQSWorkspaceStore();
  store.noCQS = String(element?.value || '').trim();
  markDirty('No CQS berubah. Menunggu autosave...');
}

function getCQSNumber() {
  const store = getCQSWorkspaceStore();
  if (String(store.noCQS || '').trim()) return String(store.noCQS).trim();
  const meta = getBidderMeta();
  return String(getMetaValue(meta, ['no_cqs', 'noCQS', 'No CQS', 'CQS Number', 'No. CQS'], '') || '').trim();
}

function getTargetValidQuotationDateSerial(value) {
  const serial = excelSerialFromDate(value);
  return serial ? serial + 30 : '';
}

function getCQSFrancoFromRFQ() {
  const rfqMeta = DATA?.structured?.RFQ?.meta || {};
  const deliveryLocation = String(rfqMeta.delivery_location || selectedDelivery || 'msw')
    .trim()
    .toLowerCase();
  return deliveryLocation === 'ibt' ? 'IBT' : 'MSW Tanjung';
}

function calculateCQSVendorOfferedTotal(vendorData, rfqItems = null) {
  const sourceItems = Array.isArray(rfqItems)
    ? rfqItems
    : (DATA?.structured?.RFQ?.items || []).filter(item => String(item?.Description || '').trim()).slice(0, 28);
  const baseQuotes = Array.isArray(vendorData?.items) ? vendorData.items : [];
  const baseTotal = sourceItems.reduce((total, item, itemIndex) => {
    const qty = parseCurrencyNumber(item?.Qty || 0);
    const unitPrice = parseCurrencyNumber(baseQuotes[itemIndex]?.unitPrice || 0);
    return total + (qty * unitPrice);
  }, 0);
  const extraTotal = (Array.isArray(vendorData?.additionalItems) ? vendorData.additionalItems : [])
    .reduce((total, item) => total + (
      parseCurrencyNumber(item?.qty || 0) * parseCurrencyNumber(item?.unitPrice || 0)
    ), 0);
  return baseTotal + extraTotal;
}

function updateCQSOfferedTotalDisplay(vendorKey) {
  const vendor = getCQSWorkspaceStore().vendors[String(vendorKey || '')];
  if (!vendor) return;
  const target = Array.from(document.querySelectorAll('[data-cqs-offered-total]'))
    .find(element => String(element.dataset.cqsOfferedTotal || '') === String(vendorKey || ''));
  if (target) target.value = formatIntegerID(calculateCQSVendorOfferedTotal(vendor));
}

function formatTargetValidQuotationDate(value) {
  const parsed = parseMetaDate(value);
  if (!(parsed instanceof Date) || isNaN(parsed.getTime())) return '';
  const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + 30);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: '2-digit'
  }).format(target);
}

function autoResizeCQSTextarea(element) {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${Math.min(360, Math.max(54, element.scrollHeight + 2))}px`;
}

function prepareCQSPriceInput(element) {
  if (!element) return;
  const number = parseCurrencyNumber(element.value || '');
  element.value = number ? String(number) : '';
  element.select?.();
}

function commitCQSPriceInput(element) {
  if (!element) return;
  updateCQSItemFieldFromElement(element);
  const number = parseCurrencyNumber(element.value || '');
  element.value = number ? formatIntegerID(number) : '';
}

function updateCQSItemFieldFromElement(element) {
  const key = String(element?.dataset?.cqsVendorKey || '');
  const itemIndex = Number(element?.dataset?.cqsItemIndex);
  const itemKind = String(element?.dataset?.cqsItemKind || 'base');
  const field = String(element?.dataset?.cqsField || '');
  const vendor = getCQSWorkspaceStore().vendors[key];
  const item = getCQSWorkspaceItemTarget(key, itemKind, itemIndex);
  if (!vendor || !item || !field) return;

  if (field === 'unitPrice') item[field] = String(element.value || '').trim() ? parseCurrencyNumber(element.value) : '';
  else if (field === 'qty') item[field] = String(element.value || '').trim() ? parseCurrencyNumber(element.value) : '';
  else item[field] = element.value;

  const row = element.closest('tr');
  if (row && ['unitPrice', 'qty'].includes(field)) {
    const qty = itemKind === 'extra'
      ? parseCurrencyNumber(item.qty || 0)
      : parseCurrencyNumber(element.dataset.qty || row.querySelector('[data-cqs-qty]')?.textContent || 0);
    const totalCell = row.querySelector('[data-cqs-total]');
    if (totalCell) totalCell.textContent = formatIntegerID(qty * parseCurrencyNumber(item.unitPrice || 0));
    updateCQSOfferedTotalDisplay(key);
  }
  markDirty(`Quotation CQS ${vendor.companyName || ''} berubah. Menunggu autosave...`);
}

function getCQSExportRowCount() {
  const workspaces = getSelectedCQSWorkspaceVendors();
  const baseCount = (DATA?.structured?.RFQ?.items || []).filter(item => String(item?.Description || '').trim()).length;
  const extraCount = workspaces.reduce((total, workspace) => total + (workspace.data.additionalItems?.length || 0), 0);
  return baseCount + extraCount;
}

function getCQSBaseItemKeys() {
  return (DATA?.structured?.RFQ?.items || [])
    .filter(item => String(item?.Description || '').trim())
    .slice(0, 28)
    .map((item, itemIndex) => getCQSItemStorageKey(item, itemIndex));
}

function addCQSLineAfter(key, afterItemKey = '', afterExtraItemKey = '') {
  // getCQSExportRowCount() menormalisasi ulang store vendor. Karena itu ambil
  // referensi vendor SETELAH pengecekan kapasitas; jika diambil sebelumnya,
  // line masuk ke object lama dan tidak pernah terlihat pada render berikutnya.
  if (getCQSExportRowCount() >= 28) {
    alert('CQS maksimum 28 baris (RFQ + line tambahan). Hapus line lain sebelum menambah.');
    return false;
  }
  const vendor = getCQSWorkspaceStore().vendors[String(key || '')];
  if (!vendor) {
    alert('Gagal menambah line: perusahaan belum dikenali. Muat ulang halaman lalu coba kembali.');
    return false;
  }

  const baseKeys = getCQSBaseItemKeys();
  const anchorKey = baseKeys.includes(String(afterItemKey || ''))
    ? String(afterItemKey)
    : (baseKeys[baseKeys.length - 1] || '');
  if (!anchorKey) {
    alert('Belum ada item RFQ yang dapat dijadikan lokasi line tambahan.');
    return false;
  }

  vendor.additionalItems = Array.isArray(vendor.additionalItems) ? vendor.additionalItems : [];
  const rfqItems = (DATA?.structured?.RFQ?.items || [])
    .filter(item => String(item?.Description || '').trim())
    .slice(0, 28);
  const anchorItemIndex = baseKeys.indexOf(anchorKey);
  const anchorItem = anchorItemIndex >= 0 ? rfqItems[anchorItemIndex] : null;
  const newItem = normalizeCQSAdditionalItem({
    afterItemKey: anchorKey,
    description: '',
    qty: anchorItem?.Qty ?? '',
    unit: anchorItem?.['Ord Unit'] || anchorItem?.Unit || ''
  });
  let insertAt = vendor.additionalItems.length;

  if (afterExtraItemKey) {
    const clickedIndex = vendor.additionalItems.findIndex(item => String(item?.itemKey || '') === String(afterExtraItemKey));
    if (clickedIndex >= 0) insertAt = clickedIndex + 1;
  } else {
    const lastSameAnchor = vendor.additionalItems.reduce(
      (lastIndex, item, itemIndex) => String(item?.afterItemKey || '') === anchorKey ? itemIndex : lastIndex,
      -1
    );
    if (lastSameAnchor >= 0) insertAt = lastSameAnchor + 1;
  }

  vendor.additionalItems.splice(insertAt, 0, newItem);
  markDirty(`Line tambahan ${vendor.companyName || ''} ditambahkan di bawah item terpilih. Menunggu autosave...`);
  renderCurrent();
  return false;
}

function addCQSAdditionalItem(key) {
  const baseKeys = getCQSBaseItemKeys();
  return addCQSLineAfter(key, baseKeys[baseKeys.length - 1] || '');
}

function addCQSLineAtBottom(key) {
  if (getCQSExportRowCount() >= 28) {
    alert('CQS maksimum 28 baris (RFQ + line tambahan). Hapus line lain sebelum menambah.');
    return false;
  }
  const vendor = getCQSWorkspaceStore().vendors[String(key || '')];
  if (!vendor) {
    alert('Gagal menambah line: perusahaan belum dikenali. Muat ulang halaman lalu coba kembali.');
    return false;
  }

  vendor.additionalItems = Array.isArray(vendor.additionalItems) ? vendor.additionalItems : [];
  vendor.additionalItems.push(normalizeCQSAdditionalItem({
    afterItemKey: CQS_BOTTOM_LINE_ANCHOR,
    description: '',
    qty: '',
    unit: ''
  }));
  markDirty(`Line mandiri ${vendor.companyName || ''} ditambahkan pada baris akhir. Menunggu autosave...`);
  renderCurrent();
  return false;
}

function removeCQSAdditionalItem(key, index) {
  const vendor = getCQSWorkspaceStore().vendors[String(key || '')];
  if (!vendor || !Array.isArray(vendor.additionalItems)) return false;
  vendor.additionalItems.splice(Number(index), 1);
  markDirty(`Line tambahan ${vendor.companyName || ''} dihapus. Menunggu autosave...`);
  renderCurrent();
  return false;
}

// Fungsi dibuat global karena seluruh tombol workspace CQS memakai onclick,
// sama seperti tombol lain yang sudah stabil pada iframe E-Procurement.
window.addCQSLineAfter = addCQSLineAfter;
window.addCQSAdditionalItem = addCQSAdditionalItem;
window.addCQSLineAtBottom = addCQSLineAtBottom;
window.removeCQSAdditionalItem = removeCQSAdditionalItem;

function buildCQSRemarkImagePreview(images, key, itemKind, itemIndex) {
  if (!Array.isArray(images) || !images.length) return '';
  const encodedKey = encodeURIComponent(key);
  return `<div class="cqs-remark-images">${images.map((image, imageIndex) => {
    const thumbnail = image.fileId
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(image.fileId)}&sz=w240`
      : image.previewUrl;
    const targetUrl = image.fileUrl || image.previewUrl || '#';
    return `<div class="cqs-remark-image-card">
      <a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener" title="${escapeHtml(image.fileName || 'Image')}">
        ${thumbnail ? `<img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(image.fileName || 'Image')}">` : '<span>Image</span>'}
      </a>
      <button type="button" onclick="removeCQSRemarkImage(decodeURIComponent('${encodedKey}'),'${itemKind}',${itemIndex},${imageIndex})" title="Hapus referensi gambar">×</button>
    </div>`;
  }).join('')}</div>`;
}

function removeCQSRemarkImage(key, itemKind, itemIndex, imageIndex) {
  const item = getCQSWorkspaceItemTarget(key, itemKind, itemIndex);
  if (!item || !Array.isArray(item.remarkImages)) return;
  item.remarkImages.splice(Number(imageIndex), 1);
  markDirty('Referensi gambar Remarks dihapus. Menunggu autosave...');
  renderCurrent();
}

function sanitizeCQSFileNamePart(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70) || 'Vendor';
}

async function uploadCQSRemarkImage(file, vendorName, itemLabel) {
  const meta = getBidderMeta();
  if (!meta.nopr) throw new Error('No PR belum tersedia.');
  const extension = String(file?.name || '').split('.').pop() || String(file?.type || '').split('/').pop() || 'png';
  const fileName = `CQS Remark - ${sanitizeCQSFileNamePart(meta.nopr)} - ${sanitizeCQSFileNamePart(vendorName)} - ${sanitizeCQSFileNamePart(itemLabel)} - ${Date.now()}.${extension}`;
  const fileData = await blobToDataUrl(file);
  const response = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'uploadFile',
      documentType: 'CQS',
      fileName,
      noPR: meta.nopr,
      description: meta.description || '',
      rfq: meta.rfq || '',
      statusPR: meta.status_pr || '',
      round: getDocumentRound(meta),
      folderId: meta.folderid,
      fileData,
      mimeType: file.type || 'image/png',
      replaceExisting: false,
      workspaceVersion: Number(WORKSPACE_VERSION || 0)
    })
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.message || 'Gagal mengunggah gambar Remarks.');
  return {
    fileId: result.fileId || '',
    fileName: result.fileName || fileName,
    fileUrl: result.fileUrl || '',
    previewUrl: result.previewUrl || '',
    mimeType: result.mimeType || file.type || ''
  };
}

async function handleCQSRemarksPaste(event, element) {
  const clipboardItems = Array.from(event?.clipboardData?.items || []);
  const imageItem = clipboardItems.find(item => String(item.type || '').startsWith('image/'));
  if (!imageItem) return;
  event.preventDefault();

  const file = imageItem.getAsFile();
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert('Ukuran gambar maksimum 5 MB.');
    return;
  }

  const key = String(element?.dataset?.cqsVendorKey || '');
  const itemIndex = Number(element?.dataset?.cqsItemIndex);
  const itemKind = String(element?.dataset?.cqsItemKind || 'base');
  const item = getCQSWorkspaceItemTarget(key, itemKind, itemIndex);
  const vendor = getCQSWorkspaceStore().vendors[key];
  if (!item || !vendor) return;
  item.remarkImages = Array.isArray(item.remarkImages) ? item.remarkImages : [];
  if (item.remarkImages.length >= 3) {
    alert('Maksimum 3 gambar untuk setiap baris Remarks.');
    return;
  }

  const status = document.getElementById('saveStatus');
  if (status) status.textContent = 'Mengunggah gambar Remarks ke folder 03. CQS...';
  try {
    const uploaded = await uploadCQSRemarkImage(file, vendor.companyName, `${itemKind}-${itemIndex + 1}`);
    item.remarkImages.push(uploaded);
    markDirty(`Gambar Remarks ${vendor.companyName || ''} ditambahkan. Menunggu autosave...`);
    renderCurrent();
  } catch (error) {
    console.error(error);
    alert(`Gagal menempelkan gambar: ${error.message || error}`);
  }
}

function buildCQSRemarkText(quote) {
  if (!quote) return '';
  const text = String(quote.remarks || '').trim();
  const imageLines = normalizeCQSRemarkImages(quote.remarkImages)
    .map(image => `Image: ${image.fileUrl || image.previewUrl || image.fileName}`)
    .filter(Boolean);
  return [text, ...imageLines].filter(Boolean).join('\n');
}

function buildCQSCombinedNote(workspaceVendors = getSelectedCQSWorkspaceVendors()) {
  const vendorNotes = workspaceVendors
    .filter(workspace => String(workspace?.data?.note || '').trim())
    .map(workspace => `${workspace.data.companyName}: ${String(workspace.data.note).trim()}`);
  const excluded = buildCQSExcludedVendorNote();
  const sections = [];
  if (vendorNotes.length) sections.push(`Vendor Note:\n${vendorNotes.join('\n')}`);
  if (excluded) sections.push(`Vendor tidak masuk CQS:\n${excluded}`);
  return sections.join('\n\n');
}

function renderCQSWorkspacePanel(workspace) {
  const { key, vendor, data, rfqItems } = workspace;
  const encodedKey = escapeHtml(key);
  const onclickKey = encodeURIComponent(key);
  const offeredTotal = calculateCQSVendorOfferedTotal(data, rfqItems);
  let out = `<section class="cqs-company-workspace">
    <div class="cqs-company-heading">
      <div><small>Supplier</small><h3>${escapeHtml(vendor.companyName || '-')}</h3><p>${escapeHtml(vendor.noCompany || '-')} · ${escapeHtml(vendor.address || '-')}</p></div>
      <label class="cqs-selected-check"><input type="checkbox" data-cqs-vendor-key="${encodedKey}" data-cqs-field="selectedSupplier" ${data.selectedSupplier ? 'checked' : ''} onchange="updateCQSVendorFieldFromElement(this)"> Selected Supplier</label>
    </div>
    <div class="cqs-commercial-grid">
      <label>No Quotation<input type="text" value="${escapeHtml(data.quotationNo)}" placeholder="Nomor quotation vendor" data-cqs-vendor-key="${encodedKey}" data-cqs-field="quotationNo" onchange="updateCQSVendorFieldFromElement(this)"></label>
      <label>Quotation Date<input type="date" value="${escapeHtml(data.quotationDate)}" data-cqs-vendor-key="${encodedKey}" data-cqs-field="quotationDate" onchange="updateCQSVendorFieldFromElement(this)"></label>
      <label>Validity<input type="text" value="${String(data.quotationNo || '').trim() ? '30 days' : ''}" placeholder="Terisi otomatis setelah No Quotation" readonly></label>
      <label>Target Valid Date Quotation<input type="text" value="${escapeHtml(formatTargetValidQuotationDate(data.quotationDate))}" placeholder="Quotation Date + 30 hari" readonly></label>
      <label>Payment Term<input type="text" value="${escapeHtml(data.paymentTerm)}" data-cqs-vendor-key="${encodedKey}" data-cqs-field="paymentTerm" onchange="updateCQSVendorFieldFromElement(this)"></label>
      <label>Delivery Term<input type="text" value="${escapeHtml(data.deliveryTerm)}" data-cqs-vendor-key="${encodedKey}" data-cqs-field="deliveryTerm" onchange="updateCQSVendorFieldFromElement(this)"></label>
      <label>Franco<input type="text" value="${escapeHtml(getCQSFrancoFromRFQ())}" readonly title="Mengikuti Location Delivery pada RFQ"></label>
      <label>Total yang Ditawarkan<input type="text" value="${escapeHtml(formatIntegerID(offeredTotal))}" readonly data-cqs-offered-total="${encodedKey}" title="Total Qty × Unit Price seluruh line, belum termasuk PPN"></label>
      <label class="cqs-justification-field" title="Alasan pemilihan vendor sebagai Selected Supplier. Bukan kolom Note.">Justification (alasan memilih supplier)<textarea class="cqs-auto-grow" data-cqs-vendor-key="${encodedKey}" data-cqs-field="justification" oninput="autoResizeCQSTextarea(this)" onchange="updateCQSVendorFieldFromElement(this)">${escapeHtml(data.justification)}</textarea></label>
      <label class="cqs-note-field">Note<textarea class="cqs-auto-grow" data-cqs-vendor-key="${encodedKey}" data-cqs-field="note" oninput="autoResizeCQSTextarea(this)" onchange="updateCQSVendorFieldFromElement(this)" placeholder="Catatan umum vendor yang akan ditulis pada area Note CQS">${escapeHtml(data.note)}</textarea></label>
    </div>
    <div class="table-wrap cqs-company-table-wrap"><table class="cqs-company-table"><thead><tr>
      <th>No</th><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th><th>Remarks</th><th>Action</th>
    </tr></thead><tbody>`;

  const renderRemarkCell = (quote, itemKind, itemIndex) => `<td class="cqs-remarks-cell">
    <textarea class="cqs-auto-grow cqs-remarks-input" data-cqs-vendor-key="${encodedKey}" data-cqs-item-kind="${itemKind}" data-cqs-item-index="${itemIndex}" data-cqs-field="remarks" oninput="autoResizeCQSTextarea(this)" onchange="updateCQSItemFieldFromElement(this)" onpaste="handleCQSRemarksPaste(event,this)" placeholder="Ketik remarks atau tempel gambar (Ctrl+V)">${escapeHtml(quote.remarks || '')}</textarea>
    ${buildCQSRemarkImagePreview(quote.remarkImages, key, itemKind, itemIndex)}
    <small class="cqs-paste-hint">Gambar yang ditempel disimpan ke folder 03. CQS dan link-nya ikut masuk ke Remarks.</small>
  </td>`;

  const renderAdditionalRow = (quote, extraIndex, anchorItemKey) => {
    const total = parseCurrencyNumber(quote.qty || 0) * parseCurrencyNumber(quote.unitPrice || 0);
    const encodedAnchor = encodeURIComponent(anchorItemKey || '');
    const encodedExtraKey = encodeURIComponent(quote.itemKey || '');
    const addButtonAction = anchorItemKey === CQS_BOTTOM_LINE_ANCHOR
      ? `return addCQSLineAtBottom(decodeURIComponent('${onclickKey}'))`
      : `return addCQSLineAfter(decodeURIComponent('${onclickKey}'),decodeURIComponent('${encodedAnchor}'),decodeURIComponent('${encodedExtraKey}'))`;
    out += `<tr class="cqs-equivalent-row">
      <td></td>
      <td><textarea class="cqs-auto-grow cqs-extra-description" data-cqs-vendor-key="${encodedKey}" data-cqs-item-kind="extra" data-cqs-item-index="${extraIndex}" data-cqs-field="description" oninput="autoResizeCQSTextarea(this)" onchange="updateCQSItemFieldFromElement(this)" placeholder="Description item tambahan">${escapeHtml(quote.description || '')}</textarea></td>
      <td><input class="cqs-extra-small-input" inputmode="decimal" value="${escapeHtml(quote.qty ?? '')}" data-cqs-vendor-key="${encodedKey}" data-cqs-item-kind="extra" data-cqs-item-index="${extraIndex}" data-cqs-field="qty" onchange="updateCQSItemFieldFromElement(this)"></td>
      <td><input class="cqs-extra-small-input" value="${escapeHtml(quote.unit || '')}" data-cqs-vendor-key="${encodedKey}" data-cqs-item-kind="extra" data-cqs-item-index="${extraIndex}" data-cqs-field="unit" onchange="updateCQSItemFieldFromElement(this)"></td>
      <td><input class="cqs-price-input" inputmode="decimal" value="${escapeHtml(String(quote.unitPrice || '').trim() ? formatIntegerID(parseCurrencyNumber(quote.unitPrice)) : '')}" data-cqs-vendor-key="${encodedKey}" data-cqs-item-kind="extra" data-cqs-item-index="${extraIndex}" data-cqs-field="unitPrice" onfocus="prepareCQSPriceInput(this)" onblur="commitCQSPriceInput(this)"></td>
      <td class="cqs-total-cell" data-cqs-total>${escapeHtml(formatIntegerID(total))}</td>
      ${renderRemarkCell(quote, 'extra', extraIndex)}
      <td class="cqs-row-action-cell"><div class="cqs-row-action-buttons">
        <button type="button" class="mini-btn" title="${anchorItemKey === CQS_BOTTOM_LINE_ANCHOR ? 'Tambahkan line mandiri lain pada bagian akhir tabel' : 'Tambahkan line yang terkait tepat di bawah baris ini'}" onclick="${addButtonAction}">+ Line</button>
        <button type="button" class="mini-btn danger" onclick="return removeCQSAdditionalItem(decodeURIComponent('${onclickKey}'),${extraIndex})">Delete</button>
      </div></td>
    </tr>`;
  };

  rfqItems.forEach((item, itemIndex) => {
    const quote = data.items[itemIndex] || {};
    const qty = parseCurrencyNumber(item?.Qty || 0);
    const total = qty * parseCurrencyNumber(quote.unitPrice || 0);
    const itemKey = getCQSItemStorageKey(item, itemIndex);
    const encodedItemKey = encodeURIComponent(itemKey);
    out += `<tr>
      <td>${itemIndex + 1}</td>
      <td class="cqs-description-cell">${escapeHtml(item?.Description || '')}</td>
      <td data-cqs-qty>${escapeHtml(item?.Qty || '')}</td>
      <td>${escapeHtml(item?.['Ord Unit'] || item?.Unit || '')}</td>
      <td><input class="cqs-price-input" inputmode="decimal" value="${escapeHtml(String(quote.unitPrice || '').trim() ? formatIntegerID(parseCurrencyNumber(quote.unitPrice)) : '')}" data-qty="${escapeHtml(item?.Qty || '')}" data-cqs-vendor-key="${encodedKey}" data-cqs-item-kind="base" data-cqs-item-index="${itemIndex}" data-cqs-field="unitPrice" onfocus="prepareCQSPriceInput(this)" onblur="commitCQSPriceInput(this)"></td>
      <td class="cqs-total-cell" data-cqs-total>${escapeHtml(formatIntegerID(total))}</td>
      ${renderRemarkCell(quote, 'base', itemIndex)}
      <td class="cqs-row-action-cell"><button type="button" class="mini-btn" title="Tambahkan line yang terkait tepat di bawah baris ini" onclick="return addCQSLineAfter(decodeURIComponent('${onclickKey}'),decodeURIComponent('${encodedItemKey}'))">+ Line</button></td>
    </tr>`;

    (data.additionalItems || []).forEach((extraQuote, extraIndex) => {
      if (String(extraQuote?.afterItemKey || '') === itemKey) renderAdditionalRow(extraQuote, extraIndex, itemKey);
    });
  });

  // Data lama yang belum memiliki anchor ditampilkan di bawah item RFQ terakhir.
  const knownBaseKeys = new Set(rfqItems.map((item, itemIndex) => getCQSItemStorageKey(item, itemIndex)));
  const fallbackAnchor = rfqItems.length ? getCQSItemStorageKey(rfqItems[rfqItems.length - 1], rfqItems.length - 1) : '';
  (data.additionalItems || []).forEach((extraQuote, extraIndex) => {
    const anchor = String(extraQuote?.afterItemKey || '');
    if (anchor !== CQS_BOTTOM_LINE_ANCHOR && !knownBaseKeys.has(anchor)) {
      renderAdditionalRow(extraQuote, extraIndex, fallbackAnchor);
    }
  });
  // Line mandiri selalu dirender satu kali setelah seluruh baris RFQ.
  (data.additionalItems || []).forEach((extraQuote, extraIndex) => {
    if (String(extraQuote?.afterItemKey || '') === CQS_BOTTOM_LINE_ANCHOR) {
      renderAdditionalRow(extraQuote, extraIndex, CQS_BOTTOM_LINE_ANCHOR);
    }
  });
  out += `</tbody></table></div>
    <div class="cqs-add-row-actions"><button type="button" class="mini-btn" title="Tambahkan line mandiri yang tidak terkait dengan item RFQ tertentu" onclick="return addCQSLineAtBottom(decodeURIComponent('${onclickKey}'))">+ Line Mandiri di Baris Akhir</button><span>Total baris CQS seluruh vendor: ${getCQSExportRowCount()} / 28</span></div>
  </section>`;
  requestAnimationFrame(() => document.querySelectorAll('.cqs-auto-grow').forEach(autoResizeCQSTextarea));
  return out;
}

function renderCQS() {
  const selected = getSelectedCQSVendors();
  const rfqReady = hasRFQDescriptionItems();
  const templateAvailable = selected.length >= 1 && selected.length <= 10;
  const missingExclusions = getMissingCQSExclusionReasons();
  const exclusionsReady = missingExclusions.length === 0;
  const rowCapacityReady = getCQSExportRowCount() <= 28;
  const ready = templateAvailable && rfqReady && exclusionsReady && rowCapacityReady;
  const templateSheet = selected.length <= 3 ? '3V' : `${selected.length}V`;
  let message = '';
  if (selected.length < 1) message = 'Pilih minimal 1 vendor yang masuk CQS.';
  else if (!templateAvailable) message = `Saat ini ${selected.length} vendor dipilih. Master CQS tersedia untuk 1 sampai 10 vendor.`;
  else if (!rfqReady) message = `${selected.length} vendor sudah dipilih, tetapi RFQ belum mempunyai Description.`;
  else if (!exclusionsReady) message = `${missingExclusions.length} vendor yang tidak masuk CQS belum memiliki alasan.`;
  else if (!rowCapacityReady) message = `Jumlah baris RFQ dan line tambahan melebihi kapasitas CQS 28 baris.`;
  else message = `${selected.length} vendor dan RFQ telah lengkap. Isi quotation setiap perusahaan, kemudian simpan ke sheet ${templateSheet}.`;

  let out = `<div class="cqs-status-card ${ready ? 'ready' : 'dummy'}">
    <h3>CQS ${ready ? 'READY' : 'DUMMY'} — ${selected.length} Vendor</h3>
    <p>${escapeHtml(message)}</p>
  </div>`;

  out += `<div class="cqs-global-fields"><label>No CQS<input type="text" value="${escapeHtml(getCQSNumber())}" placeholder="Contoh: 279/MSW/J/CQS-PP-01/XII/2025" onchange="updateCQSNumberFromElement(this)"></label></div>`;

  const workspaces = getSelectedCQSWorkspaceVendors();
  if (workspaces.length) {
    if (!workspaces.some(item => item.key === ACTIVE_CQS_VENDOR_KEY)) ACTIVE_CQS_VENDOR_KEY = workspaces[0].key;
    out += '<div class="cqs-company-tabs" role="tablist">';
    workspaces.forEach((workspace, index) => {
      out += `<button type="button" class="cqs-company-tab ${workspace.key === ACTIVE_CQS_VENDOR_KEY ? 'active' : ''}" onclick="setActiveCQSVendor(decodeURIComponent('${encodeURIComponent(workspace.key)}'))">${index + 1}. ${escapeHtml(workspace.vendor.companyName)}</button>`;
    });
    out += '</div>';
    const active = workspaces.find(item => item.key === ACTIVE_CQS_VENDOR_KEY) || workspaces[0];
    out += renderCQSWorkspacePanel(active);
  }

  const excludedNote = buildCQSExcludedVendorNote();
  if (excludedNote) {
    out += `<div class="notice"><b>Vendor tidak masuk CQS:</b><br>${escapeHtml(excludedNote).replace(/\n/g, '<br>')}</div>`;
  }
  out += `<div class="notice">Justification digunakan untuk alasan pemilihan Selected Supplier. Note ditulis per perusahaan pada row 53: Vendor 1 I53:M53, Vendor 2 N53:R53, dan seterusnya. Alasan vendor yang tidak masuk CQS tetap pada B54:H54. Tombol + Line di setiap baris menambahkan line tepat di bawah baris tersebut.</div>`;
  return out;
}

function getMultipleEmailRows() {
  DATA.structured.Multiple_Email = DATA.structured.Multiple_Email || { rows: [] };
  DATA.structured.Multiple_Email.rows = Array.isArray(DATA.structured.Multiple_Email.rows)
    ? DATA.structured.Multiple_Email.rows.map(normalizeMultipleEmailRow)
    : [];
  return DATA.structured.Multiple_Email.rows;
}

function setMultipleEmailMode(mode) {
  ACTIVE_MULTIPLE_EMAIL_MODE = mode === 'internal' ? 'internal' : 'vendor';
  renderCurrent();
}

function getMultipleEmailInternalStore() {
  getMultipleEmailRows();
  const root = DATA.structured.Multiple_Email;
  root.internal = root.internal && typeof root.internal === 'object' ? root.internal : {};
  root.internal.activeType = MULTIPLE_EMAIL_INTERNAL_CONFIG[root.internal.activeType]
    ? root.internal.activeType
    : 'RELEASE_PR';
  root.internal.drafts = root.internal.drafts && typeof root.internal.drafts === 'object'
    ? root.internal.drafts
    : {};
  return root.internal;
}

function isVendorReleaseEmailType(type) {
  return type === 'RELEASE_PO' || type === 'PROFORMA_PO';
}

function getMultipleEmailInternalRecipientDefaults(type, config = MULTIPLE_EMAIL_INTERNAL_CONFIG[type] || {}) {
  if (isVendorReleaseEmailType(type)) {
    const data = getInternalEmailProcurementData();
    return {
      to: String(data.winnerEmail || '').trim(),
      cc: String(config.cc || MULTIPLE_EMAIL_RELEASE_PO_CC).trim()
    };
  }
  return {
    to: String(config.to || '').trim(),
    cc: String(config.cc || '').trim()
  };
}

function getMultipleEmailInternalDraft(type = '') {
  const store = getMultipleEmailInternalStore();
  const resolvedType = MULTIPLE_EMAIL_INTERNAL_CONFIG[type]
    ? type
    : store.activeType;
  const config = MULTIPLE_EMAIL_INTERNAL_CONFIG[resolvedType];
  const defaults = getMultipleEmailInternalRecipientDefaults(resolvedType, config);
  const existing = store.drafts[resolvedType] && typeof store.drafts[resolvedType] === 'object'
    ? store.drafts[resolvedType]
    : {};
  const releaseRecipientNeedsRefresh = isVendorReleaseEmailType(resolvedType) && !String(existing.to || '').trim();
  store.drafts[resolvedType] = {
    to: existing.to === undefined || releaseRecipientNeedsRefresh ? defaults.to : String(existing.to || ''),
    cc: existing.cc === undefined ? defaults.cc : String(existing.cc || ''),
    'Subject Override': String(existing['Subject Override'] || ''),
    'Body Override': String(existing['Body Override'] || ''),
    attachments: Array.isArray(existing.attachments) ? existing.attachments : [],
    'Draft Status': String(existing['Draft Status'] || '')
  };
  return store.drafts[resolvedType];
}

function changeMultipleEmailInternalType(type) {
  const store = getMultipleEmailInternalStore();
  store.activeType = MULTIPLE_EMAIL_INTERNAL_CONFIG[type] ? type : 'RELEASE_PR';
  getMultipleEmailInternalDraft(store.activeType);
  markDirty('Jenis email internal berubah. Menunggu autosave...');
  renderCurrent();
}

function getInternalEmailProcurementData() {
  const meta = getBidderMeta();
  const procurementRow = findProcurementRowByNoPR(meta.nopr) || {};
  const value = (keys, fallback = '') => getProcurementAdminValue(procurementRow, keys) || fallback;
  const estPrice = calculateEstPriceRpFromMeta(meta) || parseCurrencyNumber(value([
    'estpriceus', 'Est. Price US - Rp', 'estpricerp', 'Est. Price PR'
  ]));
  const actualPrice = parseCurrencyNumber(value(['pricerp', 'Price (Rp) Excl. PPn', 'Actual Cost']));
  const savingRate = estPrice > 0 && actualPrice > 0 ? (estPrice - actualPrice) / estPrice : null;
  const round = getDocumentRound(meta);
  const invitedVendors = getInvitedVendorEmailRows()
    .map(row => String(row?.['Name of Invited Supplier'] || '').trim())
    .filter(Boolean);
  const rfq = String(formatRFQDisplayFromMeta(meta) || meta.rfq || '').trim();
  const buyerName = String(CURRENT_USER_PROFILE?.name || meta.pic || 'Procurement Team').trim();
  const buyerEmail = String(CURRENT_USER_PROFILE?.email || '').trim();
  const buyerPhone = String(CURRENT_USER_PROFILE?.phone || meta.buyer_phone || meta.buyerPhone || '').trim();
  const winner = String(value(['winnerpo', 'Winner PO'])).trim();
  const winnerVendor = winner ? findVendorByCompany(winner) : null;
  const winnerEmail = String(value([
    'emailwinnerpo', 'Email Winner PO', 'Winner PO Email', 'Winner Email'
  ]) || winnerVendor?.email || '').trim();
  const winnerContactName = String(winnerVendor?.customerContact || '').trim();
  const deliveryKey = getMultipleEmailDeliveryKey();

  return {
    noPR: String(meta.nopr || value(['noPR', 'No PR'])).trim(),
    noPRRound: `${String(meta.nopr || value(['noPR', 'No PR'])).trim()}${round && round !== 'R0' ? ` ${round}` : ''}`.trim(),
    description: String(meta.description || value(['Description', 'description'])).trim(),
    rfq,
    noPO: String(value(['nopo', 'No PO'])).trim(),
    user: String(meta.pic || value(['pic', 'PIC'])).trim(),
    winner,
    winnerEmail,
    winnerContactName,
    estPrice,
    actualPrice,
    savingRate,
    invitedVendors,
    previousWinner: String(meta.previous_winner_po || value(['previoussubmitpo', 'Previous Submit PO']) || 'None').trim(),
    previousQuotation: String(meta.previous_vendor_quote || value(['finalsubmitvendor', 'Final Submit Vendor']) || 'None').trim(),
    closingDate: String(meta.close_date || value(['roundfinishdate', 'Finish Date', 'Close Date']) || '-').trim(),
    buyerName,
    buyerEmail,
    buyerPhone,
    deliveryKey,
    deliveryLabel: deliveryKey === 'IBT' ? 'IBT Mekar Putih' : 'MSW Tanjung'
  };
}

function formatInternalEmailMoney(value) {
  const number = Number(value || 0);
  return number > 0 ? `Rp ${formatIntegerID(number)}` : '-';
}

function getGeneratedInternalEmailSubject(type) {
  const data = getInternalEmailProcurementData();
  if (type === 'PO_PROC' || type === 'RELEASE_PO') {
    return [data.noPO, data.winner, data.description].filter(Boolean).join(' - ') || data.noPR || (type === 'PO_PROC' ? 'PO Proc' : 'Release PO');
  }
  if (type === 'PROFORMA_PO') {
    const detail = [data.noPO, data.winner, data.description].filter(Boolean).join(' - ');
    return ['PROFORMA PO', detail].filter(Boolean).join(' - ') || data.noPR || 'Proforma PO';
  }
  if (type === 'SURAT_PENUNJUKAN') {
    const detail = [data.winner, data.description].filter(Boolean).join(' - ');
    return ['Surat Penunjukan', detail].filter(Boolean).join(' - ') || data.noPR || 'Surat Penunjukan';
  }
  const prSubject = [data.noPRRound, data.description].filter(Boolean).join(' - ');
  return [data.rfq, 'RFQ', prSubject].filter(Boolean).join(' - ') || data.noPR || 'Release PR';
}

function getInternalEmailSignatureText(data) {
  return [
    'Salam,',
    data.buyerName || 'Procurement Team',
    data.buyerPhone ? `WA/telp -- ${data.buyerPhone}` : '',
    'Procurement - PT. Makmur Sejahtera Wisesa'
  ].filter(Boolean).join('\n');
}

function getReleasePODeliveryText(data) {
  if (data.deliveryKey === 'IBT') {
    return `Receiving/Warehouse IBT:\n- Franco IBT Mekar Putih\n- Koordinasi penerimaan dengan tim Warehouse/Receiving IBT.`;
  }
  return `Receiving/Warehouse MSW:\n- Franco MSW Tanjung\n- Alamat: Jl. Ahmad Yani Km 7 RT.001 RW.001, Kel. Mabuun, Kabupaten Tabalong, Tanjung 71571, Kalimantan Selatan.\n- Koordinasi penerimaan dengan tim Warehouse/Receiving MSW.`;
}

function getGeneratedInternalEmailBody(type) {
  const data = getInternalEmailProcurementData();
  if (type === 'PO_PROC') {
    const saving = data.savingRate === null
      ? '-'
      : `${(data.savingRate * 100).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    return `Kepada Yth
Pak Rusfandy,

Mohon memberikan approval PO365 beserta dokumen pendukungnya terlampir.

User: ${data.user || '-'}
Est. Price PR: ${formatInternalEmailMoney(data.estPrice)}
Actual Cost: ${formatInternalEmailMoney(data.actualPrice)}
Winning Bid: ${data.winner || '-'} - ${saving}
No PO: ${data.noPO || '-'}
No PR: ${data.noPR || '-'}

${getInternalEmailSignatureText(data)}`;
  }

  if (type === 'PROFORMA_PO') {
    const attn = data.winnerContactName ? `Attn: Bapak/Ibu ${data.winnerContactName}` : 'Attn: Bapak/Ibu PIC terkait';
    return `Kepada Yth.
Bapak/Ibu Pimpinan
${data.winner || '-'}
${attn}

Terlampir Proforma PO untuk dapat segera diproses ke tahap selanjutnya. Delivery Date dalam Proforma PO tidak ada perubahan sejak kami kirimkan hari ini.

PO Original yang telah lengkap ditandatangani akan kami kirimkan melalui email secara terpisah.

No PO: ${data.noPO || '-'}
No PR: ${data.noPR || '-'}
Pekerjaan/Pengadaan: ${data.description || '-'}

Demikian disampaikan. Terima kasih atas perhatian dan kerja samanya.

${getInternalEmailSignatureText(data)}`;
  }

  if (type === 'SURAT_PENUNJUKAN') {
    return `Kepada Yth.
Pak Rusfandy,

Mohon memberikan approval by e-sign atas Surat Penunjukan terlampir.

No PR: ${data.noPR || '-'}
Vendor: ${data.winner || '-'}
Pekerjaan/Pengadaan: ${data.description || '-'}

Mohon diinformasikan apabila terdapat koreksi pada dokumen tersebut.

${getInternalEmailSignatureText(data)}`;
  }

  if (type === 'RELEASE_PO') {
    const attn = data.winnerContactName ? `Attn: Bapak/Ibu ${data.winnerContactName}` : 'Attn: Bapak/Ibu PIC terkait';
    return `Kepada Yth.
Bapak/Ibu Pimpinan
${data.winner || '-'}
${attn}

Terlampir PO untuk dapat segera diproses ke tahap selanjutnya.

USER = ${data.user || '-'}
Person In Charge (PIC MSW) PO = ${data.buyerName || '-'}${data.buyerPhone ? ` / ${data.buyerPhone}` : ''}
No PO: ${data.noPO || '-'}
No PR: ${data.noPR || '-'}
Pekerjaan/Pengadaan: ${data.description || '-'}
Lokasi Pengiriman: ${data.deliveryLabel || '-'}

${getReleasePODeliveryText(data)}

Untuk invoicing, mohon dokumen pendukung dikirimkan sesuai persyaratan pada Surat Submission Invoice 2026 terlampir.

Sesuai Terms & Conditions terlampir, ketentuan denda keterlambatan pengiriman barang dan/atau pekerjaan jasa tetap berlaku.

Sebagai kelengkapan dokumentasi Procurement, mohon Terms & Conditions ditandatangani dan distempel perusahaan, kemudian dikirimkan kembali kepada kami maksimal 3 hari setelah diterima.

Demikian disampaikan. Terima kasih atas perhatian dan kerja samanya.

${getInternalEmailSignatureText(data)}`;
  }

  const invited = data.invitedVendors.length
    ? data.invitedVendors.map((vendor, index) => `${index + 1}. ${vendor}`).join('\n')
    : '-';
  return `Kepada Yth
Bapak Agustinus,

Mohon approval Bidderlist terlampir dan untuk detail sesuai informasi di bawah ini.

USER = ${data.user || '-'}

No PR: ${data.noPRRound || '-'}
No RFQ: ${data.rfq || '-'}
Invited Vendors:
${invited}
Previous PO Winner: ${data.previousWinner || 'None'}
Previous Submit Quotation: ${data.previousQuotation || 'None'}
Est. Price (Rp): ${formatInternalEmailMoney(data.estPrice)}
Closing Date: ${data.closingDate || '-'}

${getInternalEmailSignatureText(data)}`;
}

function buildInternalEmailSignatureHtml(data) {
  const phone = data.buyerPhone ? `<br>WA/telp -- ${escapeHtmlBody_(data.buyerPhone)}` : '';
  return `<p style="margin:16px 0 0 0;">Salam,<br><b>${escapeHtmlBody_(data.buyerName || 'Procurement Team')}</b>${phone}<br>Procurement - PT. Makmur Sejahtera Wisesa</p>`;
}

function getReleasePOBodyHtml(data) {
  const attn = data.winnerContactName ? `Bapak/Ibu ${data.winnerContactName}` : 'Bapak/Ibu PIC terkait';
  const delivery = data.deliveryKey === 'IBT'
    ? `<p><b><i><u>Receiving/Warehouse IBT:</u></i></b><br>&nbsp;&nbsp;&nbsp;&nbsp;a. Franco <b>IBT Mekar Putih</b><br>&nbsp;&nbsp;&nbsp;&nbsp;b. Koordinasi penerimaan dengan tim Warehouse/Receiving IBT.</p>`
    : `<p><b><i><u>Receiving/Warehouse MSW:</u></i></b><br>&nbsp;&nbsp;&nbsp;&nbsp;a. Franco <b>MSW Tanjung</b><br>&nbsp;&nbsp;&nbsp;&nbsp;b. Jl. Ahmad Yani Km 7 RT.001 RW.001, Kel. Mabuun, Kabupaten Tabalong, Tanjung 71571, Kalimantan Selatan.<br>&nbsp;&nbsp;&nbsp;&nbsp;c. Koordinasi penerimaan dengan tim Warehouse/Receiving MSW.</p>`;
  return `<div style="font-family:'Palatino Linotype','Book Antiqua',Palatino,serif;font-size:14px;color:#000;line-height:1.5;">
    <p>Kepada Yth.<br>Bapak/Ibu Pimpinan<br><b>${escapeHtmlBody_(data.winner || '-')}</b><br>Attn: ${escapeHtmlBody_(attn)}</p>
    <p>Terlampir <b>PO</b> untuk dapat segera diproses ke tahap selanjutnya.</p>
    <p><span style="color:#0066ff"><b>USER = ${escapeHtmlBody_(data.user || '-')}</b></span><br>
    <b>Person In Charge (PIC MSW) PO = ${escapeHtmlBody_(data.buyerName || '-')}</b>${data.buyerPhone ? ` / ${escapeHtmlBody_(data.buyerPhone)}` : ''}<br>
    No PO: <b>${escapeHtmlBody_(data.noPO || '-')}</b><br>No PR: <b>${escapeHtmlBody_(data.noPR || '-')}</b><br>
    Pekerjaan/Pengadaan: ${escapeHtmlBody_(data.description || '-')}<br>Lokasi Pengiriman: <b>${escapeHtmlBody_(data.deliveryLabel || '-')}</b></p>
    ${delivery}
    <p>Untuk <i>invoicing</i>, mohon dokumen pendukung dikirimkan sesuai persyaratan pada <span style="color:#0066ff"><b><u>Surat Submission Invoice 2026</u></b></span> terlampir.</p>
    <p>Sesuai dengan <b><i>Terms &amp; Conditions</i></b> terlampir, ketentuan denda keterlambatan pengiriman barang dan/atau pekerjaan jasa tetap berlaku.</p>
    <p>Sebagai kelengkapan dokumentasi Procurement, <span style="color:#0066ff"><b><u>mohon Terms &amp; Conditions ditandatangani dan distempel perusahaan</u></b></span>, kemudian dikirimkan kembali kepada kami maksimal <span style="background:#ffff00"><b>3 Hari</b></span> setelah diterima.</p>
    <p>Demikian disampaikan. Terima kasih atas perhatian dan kerja samanya.</p>
    ${buildInternalEmailSignatureHtml(data)}
  </div>`;
}
function getProformaPOBodyHtml(data) {
  const attn = data.winnerContactName ? `Bapak/Ibu ${data.winnerContactName}` : 'Bapak/Ibu PIC terkait';
  return `<div style="font-family:'Palatino Linotype','Book Antiqua',Palatino,serif;font-size:14px;color:#000;line-height:1.5;">
    <p>Kepada Yth.<br>Bapak/Ibu Pimpinan<br><b>${escapeHtmlBody_(data.winner || '-')}</b><br>Attn: ${escapeHtmlBody_(attn)}</p>
    <p>Terlampir <span style="color:#0066ff"><b>Proforma PO</b></span> untuk dapat segera diproses ke tahap selanjutnya. <span style="color:#0066ff"><b><i>Delivery Date</i></b> dalam Proforma PO tidak ada perubahan sejak kami kirimkan hari ini.</span></p>
    <p><span style="color:#0066ff"><b>PO Original</b></span> yang telah lengkap ditandatangani akan kami kirimkan melalui email secara terpisah.</p>
    <p>No PO: <b>${escapeHtmlBody_(data.noPO || '-')}</b><br>No PR: <b>${escapeHtmlBody_(data.noPR || '-')}</b><br>Pekerjaan/Pengadaan: ${escapeHtmlBody_(data.description || '-')}</p>
    <p>Demikian disampaikan. Terima kasih atas perhatian dan kerja samanya.</p>
    ${buildInternalEmailSignatureHtml(data)}
  </div>`;
}

function getSuratPenunjukanBodyHtml(data) {
  return `<div style="font-family:'Palatino Linotype','Book Antiqua',Palatino,serif;font-size:14px;color:#000;line-height:1.5;">
    <p>Kepada Yth.<br>Pak Rusfandy,</p>
    <p>Mohon memberikan <i>approval by e-sign</i> atas <b>Surat Penunjukan</b> terlampir.</p>
    <p>No PR: <b>${escapeHtmlBody_(data.noPR || '-')}</b><br>Vendor: <b>${escapeHtmlBody_(data.winner || '-')}</b><br>Pekerjaan/Pengadaan: ${escapeHtmlBody_(data.description || '-')}</p>
    <p>Mohon diinformasikan apabila terdapat koreksi pada dokumen tersebut.</p>
    ${buildInternalEmailSignatureHtml(data)}
  </div>`;
}

function getInternalEmailSubject(type, draft = getMultipleEmailInternalDraft(type)) {
  return String(draft?.['Subject Override'] || '').trim() || getGeneratedInternalEmailSubject(type);
}

function getInternalEmailBody(type, draft = getMultipleEmailInternalDraft(type)) {
  return String(draft?.['Body Override'] || '').trim() || getGeneratedInternalEmailBody(type);
}

function getInternalEmailBodyHtml(type, draft = getMultipleEmailInternalDraft(type)) {
  const override = String(draft?.['Body Override'] || '').trim();
  if (!override) {
    const data = getInternalEmailProcurementData();
    if (type === 'RELEASE_PO') return getReleasePOBodyHtml(data);
    if (type === 'PROFORMA_PO') return getProformaPOBodyHtml(data);
    if (type === 'SURAT_PENUNJUKAN') return getSuratPenunjukanBodyHtml(data);
  }
  const body = override || getGeneratedInternalEmailBody(type);
  return `<div style="font-family:'Palatino Linotype','Book Antiqua',Palatino,serif;font-size:14px;color:#000000;line-height:1.5;">${escapeHtmlBody_(body).replace(/\n/g, '<br>')}</div>`;
}

function updateMultipleEmailInternalField(key, value) {
  const store = getMultipleEmailInternalStore();
  const draft = getMultipleEmailInternalDraft(store.activeType);
  draft[key] = value;
  markDirty('Data email internal berubah. Menunggu autosave...');
}

function resetMultipleEmailInternalWording() {
  const store = getMultipleEmailInternalStore();
  const draft = getMultipleEmailInternalDraft(store.activeType);
  draft['Subject Override'] = '';
  draft['Body Override'] = '';
  markDirty('Wording email internal dikembalikan ke data Procurement. Menunggu autosave...');
  renderCurrent();
}

function refreshMultipleEmailInternalDefaults() {
  const store = getMultipleEmailInternalStore();
  const type = store.activeType;
  const config = MULTIPLE_EMAIL_INTERNAL_CONFIG[type];
  const defaults = getMultipleEmailInternalRecipientDefaults(type, config);
  const draft = getMultipleEmailInternalDraft(type);
  draft.to = defaults.to;
  draft.cc = defaults.cc;
  draft['Subject Override'] = '';
  draft['Body Override'] = '';
  draft['Draft Status'] = '';
  markDirty('Penerima dan wording email internal diperbarui dari data Procurement. Menunggu autosave...');
  renderCurrent();
}

function removeMultipleEmailInternalAttachment(fileId) {
  const store = getMultipleEmailInternalStore();
  const draft = getMultipleEmailInternalDraft(store.activeType);
  draft.attachments = draft.attachments.filter(file => String(file?.fileId || '') !== String(fileId || ''));
  markDirty('Attachment email internal dihapus. Menunggu autosave...');
  renderCurrent();
}

function getInvitedVendorEmailRows() {
  const rows = DATA?.structured?.BidderList?.rows || [];
  return rows.filter(row => String(row?.['Name of Invited Supplier'] || '').trim());
}

function createBlankMultipleEmailRow() {
  return {
    Company: '',
    Phone: '',
    to: '',
    cc: '',
    RFQ: '',
    'No PR': '',
    Time: '',
    'Attch PR': '',
    'Attch PR Files': [],
    'Attch TC': '',
    'Attch TC Files': [],
    Email: '',
    'Signature Buyer': '',
    'Buyer Phone': '',
    'Vendor Email Type': 'RFQ_INVITATION',
    'Subject Override': '',
    'Body Override': '',
    DI: 'No',
    Lg: 'Indo',
    'Info Tender': '',
    'Sent Status': ''
  };
}

function normalizeMultipleEmailRow(source = {}) {
  const row = { ...createBlankMultipleEmailRow(), ...(source || {}) };
  // Kolom legacy tidak dipakai lagi pada web.
  [
    'Buyer Its', 'Col 11', 'Col 13', 'Col 14', 'Col 15'
  ].forEach(key => delete row[key]);
  row['Attch PR Files'] = Array.isArray(row['Attch PR Files']) ? row['Attch PR Files'] : [];
  row['Attch TC Files'] = Array.isArray(row['Attch TC Files']) ? row['Attch TC Files'] : [];
  // Build tanpa Power Automate Premium: pengiriman langsung dinonaktifkan.
  // Semua baris menggunakan Outlook Draft (.eml) agar attachment tetap terpasang.
  row.DI = 'No';
  row.Lg = String(row.Lg || 'Indo').trim().toLowerCase().startsWith('eng') ? 'Eng' : 'Indo';
  row['Vendor Email Type'] = MULTIPLE_EMAIL_VENDOR_CONFIG[row['Vendor Email Type']]
    ? row['Vendor Email Type']
    : 'RFQ_INVITATION';
  return row;
}

function syncMultipleEmailFromBidderList(showAlert = true, rerender = true) {
  const sourceRows = getInvitedVendorEmailRows();
  if (!sourceRows.length) {
    if (showAlert) alert('Belum ada vendor pada BidderList. Isi List Invitation Vendor terlebih dahulu.');
    return false;
  }

  const meta = getBidderMeta();
  const oldRows = getMultipleEmailRows().map(normalizeMultipleEmailRow);
  const oldByCompany = new Map();
  oldRows.forEach(row => {
    const key = normalizeCompanyMatchKey(row?.Company || '', true);
    if (key && !oldByCompany.has(key)) oldByCompany.set(key, row);
  });

  const syncedRows = sourceRows.map(source => {
    const company = String(source['Name of Invited Supplier'] || '').trim();
    const key = normalizeCompanyMatchKey(company, true);
    const row = normalizeMultipleEmailRow(oldByCompany.get(key));
    row.Company = company;
    row.Phone = String(source['No Telp'] || row.Phone || '').trim();
    row.to = String(source.Email || row.to || '').trim();
    row.cc = String(row.cc || [RUNTIME_EMAIL_CONFIG.procurementInbox, RUNTIME_EMAIL_CONFIG.procurementCc].filter(Boolean).join('; ')).trim();
    row.RFQ = String(meta.rfq || row.RFQ || '').trim();
    row['No PR'] = String(meta.nopr || row['No PR'] || '').trim();
    row.Time = String(meta.close_date || meta.time || row.Time || '').trim();
    row['Info Tender'] = String(meta.description || row['Info Tender'] || '').trim();
    row['Signature Buyer'] = String(row['Signature Buyer'] || meta.pic || '').trim();
    row['Buyer Phone'] = String(row['Buyer Phone'] || meta.buyer_phone || meta.buyerPhone || '').trim();
    return row;
  });

  DATA.structured.Multiple_Email.rows = syncedRows;
  markDirty(`${sourceRows.length} vendor Multiple Email telah disinkronkan. Menunggu autosave...`);
  if (showAlert) alert(`${sourceRows.length} vendor berhasil disinkronkan dari BidderList ke Multiple Email.`);
  if (rerender) renderCurrent();
  return true;
}

function normalizeEmailRecipients(value) {
  return String(value || '')
    .split(/[;,\n]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .join(';');
}

const MULTIPLE_EMAIL_DEFAULT_CC = [RUNTIME_EMAIL_CONFIG.procurementInbox, RUNTIME_EMAIL_CONFIG.procurementCc].filter(Boolean).join('; ');

function getMultipleEmailDeliveryKey() {
  const rfqMeta = DATA?.structured?.RFQ?.meta || {};
  const value = String(rfqMeta.delivery_location || selectedDelivery || 'msw').trim().toLowerCase();
  return value === 'ibt' ? 'IBT' : 'MSW';
}

function getMultipleEmailDeliveryLabel() {
  return getMultipleEmailDeliveryKey() === 'IBT'
    ? 'FRANCO IBT Mekar Putih - Kalimantan Selatan'
    : 'FRANCO Tanjung Tabalong - Kalimantan Selatan';
}

function getMultipleEmailDeliveryAddress(language = 'Indo') {
  const isEnglish = String(language).toLowerCase().startsWith('eng');
  if (getMultipleEmailDeliveryKey() === 'IBT') {
    return [
      'PT Indonesia Bulk Terminal',
      'Mekarputih Kecamatan Pulau Laut Tanjung',
      'Kabupaten Kotabaru Kalimantan Selatan',
      'Kode Pos 72157 - PO Box 118'
    ].join('\n');
  }
  return [
    'PT Makmur Sejahtera Wisesa',
    'Jalan Ahmad Yani RT 001 RW 001 Kelurahan Mabuun',
    'Kecamatan Murung Pundak, Kabupaten Tabalong',
    isEnglish ? 'Tanjung 71571 - South Kalimantan' : 'Tanjung 71571 - Kalimantan Selatan'
  ].join('\n');
}

function normalizeEmailTime(value) {
  const text = String(value || '').trim();
  if (!text) return '17.00';
  const match = text.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (!match) return '17.00';
  return `${String(match[1]).padStart(2, '0')}.${match[2]}`;
}

function getMultipleEmailClosingParts(row) {
  const meta = getBidderMeta();
  const rawDate = String(meta.close_date || row.Time || '').trim();
  const parsed = parseMetaDate(rawDate);
  const time = normalizeEmailTime(meta.time || row.Time || '17:00');
  if (!parsed) {
    return {
      dateText: rawDate || '-',
      weekday: '',
      time,
      fullIndo: `${rawDate || '-'} Jam ${time} WIB`,
      fullEng: `${rawDate || '-'} at ${time} WIB`
    };
  }
  const dateText = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  }).format(parsed).replace(/,/g, '');
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(parsed);
  return {
    dateText,
    weekday,
    time,
    fullIndo: `${weekday} / ${dateText} Jam ${time} WIB`,
    fullEng: `${weekday} / ${dateText} at ${time} WIB`
  };
}

function getMultipleEmailTemplateData(row) {
  const meta = getBidderMeta();
  const round = normalizeDocumentRound(meta.round || meta.revision || meta.rev || 'R0');
  const roundLabel = round === 'R0' ? '' : ` ${round}`;
  const language = String(row.Lg || 'Indo').toLowerCase().startsWith('eng') ? 'Eng' : 'Indo';
  const signature = String(
    CURRENT_USER_PROFILE?.name || row['Signature Buyer'] || meta.pic || 'Procurement Team'
  ).trim();
  const phone = String(
    CURRENT_USER_PROFILE?.phone || row['Buyer Phone'] || meta.buyer_phone || meta.buyerPhone || ''
  ).trim();
  return {
    language,
    emailType: MULTIPLE_EMAIL_VENDOR_CONFIG[row['Vendor Email Type']] ? row['Vendor Email Type'] : 'RFQ_INVITATION',
    company: String(row.Company || '').trim() || 'Vendor',
    rfq: String(row.RFQ || meta.rfq || '').trim(),
    noPR: `${String(row['No PR'] || meta.nopr || '').trim()}${roundLabel}`.trim(),
    description: String(meta.description || row['Info Tender'] || '').trim(),
    closing: getMultipleEmailClosingParts(row),
    deliveryLabel: getMultipleEmailDeliveryLabel(),
    deliveryAddress: getMultipleEmailDeliveryAddress(language),
    signature,
    phone
  };
}

function getGeneratedMultipleEmailSubject(row) {
  const data = getMultipleEmailTemplateData(row);
  const baseDetail = [data.noPR, 'RFQ', data.rfq].filter(Boolean).join(' ');
  const description = data.description ? ` - ${data.description}` : '';

  if (data.emailType === 'RFQ_REBID') {
    return `${baseDetail} (REBID / RE-INVITATION)${description}`.replace(/\s+/g, ' ').trim();
  }
  if (data.emailType === 'RFQ_REMINDER') {
    return `${baseDetail} (REMINDER TO QUOTE)`.replace(/\s+/g, ' ').trim();
  }
  if (data.emailType === 'RFQ_CANCEL') {
    return `CANCEL RFQ -- ${baseDetail}${description}`.replace(/\s+/g, ' ').trim();
  }
  if (data.emailType === 'RFQ_UNSUCCESSFUL') {
    const suffix = data.language === 'Eng' ? 'RFQ Result Notification' : 'Pemberitahuan Hasil RFQ';
    return `${baseDetail} -- ${suffix}`.replace(/\s+/g, ' ').trim();
  }

  return `${data.rfq} RFQ ${data.noPR} - ${data.description}`
    .replace(/\s+/g, ' ')
    .replace(/\s+-\s*$/, '')
    .trim();
}

function getMultipleEmailSubject(row) {
  return String(row?.['Subject Override'] || '').trim() || getGeneratedMultipleEmailSubject(row);
}

function buildMultipleEmailSignature(data, language) {
  const lines = [
    language === 'Eng' ? 'Best Regards,' : 'Salam,',
    data.signature
  ];
  if (data.phone) lines.push(`WA/telp -- ${data.phone}`);
  lines.push(
    'PT. Makmur Sejahtera Wisesa (MSW Jakarta)',
    'Menara Karya 27th Floor, Jl. HR Rasuna Said X-5 Kav 1-2 Jakarta 12950'
  );
  return lines.join('\n');
}

function getGeneratedMultipleEmailInvitationBody(row) {
  const data = getMultipleEmailTemplateData(row);
  const isEnglish = data.language === 'Eng';

  if (isEnglish) {
    return `Dear Sir/Madam
${data.company}

On behalf of PT Makmur Sejahtera Wisesa, we hereby formally invite your company to submit an official quotation, in accordance with the specifications stated in the attached Request for Quotation (RFQ).

Please submit your quotation no later than ${data.closing.fullEng}.

Kindly ensure your quotation takes into consideration the following Terms and Conditions:

1. The quotation shall be issued on the Company's official letterhead and duly signed as follows:
   a. For quotation value below IDR 100,000,000: signed by an authorized company representative and affixed with company stamp.
   b. For quotation value equal to or exceeding IDR 100,000,000: signed by the Company Director, affixed with company stamp, and subject to IDR 10,000 duty stamp.
   Quotations that are not fully compliant may be subject to further administrative completion at MSW's discretion.

2. The quotation must be submitted exclusively via e-mail to ${PROCUREMENT_EMAIL_EN}. Any submission delivered through any other channel shall be automatically DISQUALIFIED.

3. Price shall be quoted in Indonesian Rupiah (IDR), with delivery terms ${data.deliveryLabel}, to the following address:
${data.deliveryAddress}

4. The quotation validity is a minimum of thirty (30) calendar days after the quotation submission deadline. Payment terms shall be N45 calendar days after the quotation is declared complete and accurate by MSW Finance, Accounting, and Tax (FAT).

5. In the absence of a stated validity period, or where the stated period is less than thirty (30) days, the quotation shall be deemed valid for thirty (30) days from the RFQ issuance date until the submission deadline on ${data.closing.fullEng}.

6. Supporting documents shall be provided, where applicable, including but not limited to:
   a. Catalogues/data sheets,
   b. Certificate of Origin (COO) or product warranty, and
   c. Other relevant technical documents.

7. Failure to comply with any of the above requirements shall result in disqualification of the quotation.

8. Should your company decide not to participate, kindly provide a formal written notice by replying to this email.

9. The Terms & Conditions as stated in the attached Purchase Order (PO) are provided as reference for preparing your quotation and related contractual clauses.

For further information regarding our company, please refer to https://www.alamtri.com/pages/read/7/24/Power.

${buildMultipleEmailSignature(data, 'Eng')}`;
  }

  return `Kepada Yth
Bapak/Ibu Pimpinan
${data.company}

Kami atas nama PT Makmur Sejahtera Wisesa bermaksud mengundang Perusahaan Bapak/Ibu untuk menyampaikan penawaran resmi sesuai spesifikasi yang tercantum dalam Request For Quotation terlampir.

Penawaran harus kami terima paling lambat pada ${data.closing.fullIndo}.

Adapun penawaran yang disampaikan mohon dapat mempertimbangkan Term & Condition sebagai berikut:

1. Persyaratan surat penawaran:
   - Penawaran wajib menggunakan kop surat resmi perusahaan, dan
   - Untuk nilai penawaran di bawah Rp100.000.000, penawaran harus ditandatangani oleh perwakilan perusahaan dan dibubuhi cap perusahaan, atau
   - Untuk nilai penawaran sama dengan/lebih dari Rp100.000.000, penawaran harus ditandatangani oleh Pimpinan Perusahaan, dibubuhi cap perusahaan, dan wajib meterai Rp10.000.
   - Apabila dokumen penawaran belum memenuhi persyaratan tersebut, maka akan kami tindak lanjuti untuk proses melengkapinya.

2. Penawaran HANYA disampaikan melalui email ke ${PROCUREMENT_EMAIL_ID}. Penawaran di luar email tersebut akan DIDISKUALIFIKASI.

3. Harga penawaran wajib dalam IDR (Rupiah) dengan term delivery ${data.deliveryLabel} sesuai alamat di bawah ini:
${data.deliveryAddress}

4. Masa berlaku penawaran adalah 30 hari dihitung sejak tanggal jatuh tempo penawaran di atas dan TOP N45 hari kalender sejak dinyatakan lengkap dan benar oleh FAT MSW.

5. Masa penawaran di bawah 30 hari atau tidak tertera dalam penawaran, dianggap berlaku selama 30 hari sejak kami menyampaikan RFQ email ini hingga tanggal terakhir penerimaan ${data.closing.fullIndo}.

6. Dokumen pendukung yang harus dilengkapi adalah sebagai berikut:
   - Catalog/data sheet item yang ditawarkan (jika ada).
   - Certificate of Origin (COO) (jika ada) atau Warranty Item yang ditawarkan.
   - Kelengkapan pendukung dokumen teknis lainnya.

7. Kegagalan untuk memenuhi ketentuan yang disampaikan di atas akan mengakibatkan penawaran Anda DIDISKUALIFIKASI.

8. Mohon dapat disampaikan alasan resmi bila tidak berkenan memasukkan penawaran atas inquiry dengan membalas email ini.

9. TERMS & CONDITION sebagaimana tercantum dalam PO dilampirkan sebagai acuan dalam penyusunan klausul penawaran.

Untuk informasi mengenai perusahaan kami dapat dilihat pada website https://www.alamtri.com/pages/read/7/24/Power.

Catatan:
Jika masih ada pertanyaan yang kurang jelas, dipersilakan menghubungi kontak saya di bawah ini.

${buildMultipleEmailSignature(data, 'Indo')}`;
}


function getGeneratedMultipleEmailSpecialBody(row) {
  const data = getMultipleEmailTemplateData(row);
  const isEnglish = data.language === 'Eng';
  const signature = buildMultipleEmailSignature(data, data.language);

  if (data.emailType === 'RFQ_REBID') {
    const base = getGeneratedMultipleEmailInvitationBody(row);
    if (isEnglish) {
      return base.replace(
        'On behalf of PT Makmur Sejahtera Wisesa, we hereby formally invite your company to submit an official quotation, in accordance with the specifications stated in the attached Request for Quotation (RFQ).',
        'As the minimum quotation quorum of three (3) valid offers has not yet been achieved, on behalf of PT Makmur Sejahtera Wisesa we hereby invite your company again to submit an official quotation in accordance with the attached Request for Quotation (RFQ).'
      );
    }
    return base.replace(
      'Kami atas nama PT Makmur Sejahtera Wisesa bermaksud mengundang Perusahaan Bapak/Ibu untuk menyampaikan penawaran resmi sesuai spesifikasi yang tercantum dalam Request For Quotation terlampir.',
      'Sehubungan belum tercapainya kuorum minimal tiga penawaran yang valid, kami atas nama PT Makmur Sejahtera Wisesa bermaksud mengundang kembali Perusahaan Bapak/Ibu untuk menyampaikan penawaran resmi sesuai spesifikasi yang tercantum dalam Request For Quotation terlampir.'
    );
  }

  if (data.emailType === 'RFQ_REMINDER') {
    if (isEnglish) {
      return `Dear Sir/Madam
${data.company}

This is a reminder that quotation submission for ${data.noPR || 'the referenced PR'} / RFQ ${data.rfq || '-'} will close on ${data.closing.fullEng}. The RFQ is attached again for your reference.

When submitting your quotation, please ensure that:
1. The quotation is sent only to ${PROCUREMENT_EMAIL_EN}.
2. The quotation uses the Company's official letterhead and is duly signed and stamped. Quotations equal to or above IDR 100,000,000 must be signed by the Company Director and bear an IDR 10,000 duty stamp.
3. The quoted price is in Indonesian Rupiah (IDR) with delivery terms ${data.deliveryLabel}.
4. If you have already submitted your quotation, please disregard this reminder.
5. Failure to comply with the requirements may result in the quotation being disqualified.

${signature}`;
    }
    return `Kepada Yth
Bapak/Ibu Pimpinan
${data.company}

Sekadar mengingatkan bahwa penerimaan penawaran untuk ${data.noPR || 'PR terkait'} / RFQ ${data.rfq || '-'} akan ditutup pada ${data.closing.fullIndo}. RFQ kami lampirkan kembali sebagai referensi.

Dalam menyampaikan penawaran, mohon memastikan:
1. Penawaran hanya dikirim ke ${PROCUREMENT_EMAIL_ID}.
2. Penawaran menggunakan kop surat resmi perusahaan, ditandatangani, dan dibubuhi cap perusahaan. Penawaran sama dengan/lebih dari Rp100.000.000 wajib ditandatangani Pimpinan Perusahaan dan menggunakan meterai Rp10.000.
3. Harga penawaran dalam IDR (Rupiah) dengan term delivery ${data.deliveryLabel}.
4. Jika penawaran telah dikirim sebelum batas waktu, mohon abaikan email pengingat ini.
5. Ketidaksesuaian terhadap persyaratan dapat mengakibatkan penawaran didiskualifikasi.

${signature}`;
  }

  if (data.emailType === 'RFQ_CANCEL') {
    if (isEnglish) {
      return `Dear Sir/Madam
${data.company}

We hereby inform you that the procurement process for ${data.noPR || 'the referenced PR'} / RFQ ${data.rfq || '-'}, with the quotation closing date of ${data.closing.fullEng}, has been cancelled.

This decision was made after a comprehensive review of the Company's requirements and strategy. The main considerations may include:
1. Budget adjustment that requires the related request to be postponed; and/or
2. Re-evaluation of the project specifications and requirements before the procurement process is continued.

We sincerely appreciate the time and effort your company has invested in this RFQ process. We apologize for any inconvenience caused and hope to cooperate again in future opportunities.

${signature}`;
    }
    return `Kepada Yth
Bapak/Ibu Pimpinan
${data.company}

Dengan ini kami informasikan bahwa proses pengadaan untuk ${data.noPR || 'PR terkait'} / RFQ ${data.rfq || '-'}, dengan batas penerimaan penawaran ${data.closing.fullIndo}, dibatalkan.

Keputusan ini diambil setelah dilakukan evaluasi menyeluruh terhadap kebutuhan dan strategi perusahaan. Pertimbangan utama dapat meliputi:
1. Penyesuaian anggaran yang mengharuskan permintaan terkait ditunda; dan/atau
2. Evaluasi ulang spesifikasi dan kebutuhan proyek sebelum proses pengadaan dilanjutkan.

Kami sangat menghargai waktu dan upaya yang telah Bapak/Ibu berikan dalam proses RFQ ini. Kami mohon maaf atas ketidaknyamanan yang timbul dan berharap dapat kembali bekerja sama pada kesempatan berikutnya.

${signature}`;
  }

  if (data.emailType === 'RFQ_UNSUCCESSFUL') {
    if (isEnglish) {
      return `Dear Sir/Madam
${data.company}

Thank you for your participation and for submitting your quotation for ${data.noPR || 'the referenced PR'} / RFQ ${data.rfq || '-'}.

After a comprehensive evaluation, we regret to inform you that your quotation was not selected for this RFQ.

We sincerely appreciate the time and effort your company has invested, and we look forward to the opportunity to work together on future projects.

Thank you for your understanding.

${signature}`;
    }
    return `Kepada Yth
Bapak/Ibu Pimpinan
${data.company}

Terima kasih atas partisipasi dan penawaran yang telah Bapak/Ibu sampaikan untuk ${data.noPR || 'PR terkait'} / RFQ ${data.rfq || '-'}.

Setelah melalui proses evaluasi secara menyeluruh, dengan ini kami informasikan bahwa penawaran yang diajukan belum dapat kami pilih sebagai pemenang untuk RFQ tersebut.

Kami sangat menghargai waktu dan usaha yang telah diberikan, serta berharap dapat kembali bekerja sama pada kesempatan berikutnya.

Terima kasih atas perhatian dan kerja samanya.

${signature}`;
  }

  return getGeneratedMultipleEmailInvitationBody(row);
}

function getGeneratedMultipleEmailBody(row) {
  const data = getMultipleEmailTemplateData(row);
  return data.emailType === 'RFQ_INVITATION'
    ? getGeneratedMultipleEmailInvitationBody(row)
    : getGeneratedMultipleEmailSpecialBody(row);
}

// Escape dasar untuk teks yang disisipkan ke HTML (bukan untuk tag yang
// memang sengaja kita buat sendiri di bawah).
function escapeHtmlBody_(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMultipleEmailSignatureHtml_(data, language) {
  const lines = [];
  lines.push(`<p style="margin:0 0 2px 0;">${language === 'Eng' ? 'Best Regards,' : 'Salam,'}</p>`);
  lines.push(`<p style="margin:0 0 2px 0;"><strong>${escapeHtmlBody_(data.signature)}</strong></p>`);
  if (data.phone) lines.push(`<p style="margin:0 0 2px 0;">WA/telp -- ${escapeHtmlBody_(data.phone)}</p>`);
  lines.push('<p style="margin:0 0 2px 0;">PT. Makmur Sejahtera Wisesa (MSW Jakarta)</p>');
  lines.push('<p style="margin:0;">Menara Karya 27th Floor, Jl. HR Rasuna Said X-5 Kav 1-2 Jakarta 12950</p>');
  return lines.join('\n');
}

// Versi HTML dari email RFQ, mengikuti format & warna template Anda:
// - Tanggal batas waktu (deadline) ditebalkan dan merah.
// - Kata DISQUALIFIED / DIDISKUALIFIKASI ditebalkan dan merah.
// - Nama perusahaan tujuan ditebalkan.
// - Link website perusahaan berwarna biru dan dapat diklik.
// - Daftar Terms & Conditions memakai <ol> bernomor otomatis.
function getGeneratedMultipleEmailInvitationBodyHtml(row) {
  const data = getMultipleEmailTemplateData(row);
  const isEnglish = data.language === 'Eng';
  const deadline = isEnglish ? data.closing.fullEng : data.closing.fullIndo;
  const wrap = (inner) => `<div style="font-family:'Palatino Linotype','Book Antiqua',Palatino,serif;font-size:14px;color:#000000;line-height:1.5;">${inner}</div>`;
  const redBold = (text) => `<strong style="color:#C00000;">${text}</strong>`;
  const link = (url) => `<a href="${url}" style="color:#0563C1;text-decoration:underline;">${url}</a>`;

  if (isEnglish) {
    return wrap(`
<p style="margin:0 0 10px 0;">Dear Sir/Madam<br><strong>${escapeHtmlBody_(data.company)}</strong></p>

<p style="margin:0 0 10px 0;">On behalf of PT Makmur Sejahtera Wisesa, we hereby formally invite your company to submit an official quotation, in accordance with the specifications stated in the attached Request for Quotation (RFQ).</p>

<p style="margin:0 0 10px 0;">Please submit your quotation no later than ${redBold(escapeHtmlBody_(deadline))}.</p>

<p style="margin:0 0 6px 0;">Kindly ensure your quotation takes into consideration the following Terms and Conditions:</p>

<ol style="margin:0 0 10px 0;padding-left:20px;">
  <li style="margin-bottom:8px;">The quotation shall be issued on the Company's official letterhead and duly signed as follows:
    <ol type="a" style="margin:4px 0 0 0;padding-left:18px;">
      <li>For quotation value below IDR 100,000,000: signed by an authorized company representative and affixed with company stamp.</li>
      <li>For quotation value equal to or exceeding IDR 100,000,000: signed by the Company Director, affixed with company stamp, and subject to IDR 10,000 duty stamp.</li>
    </ol>
    <span>Quotations that are not fully compliant may be subject to further administrative completion at MSW's discretion.</span>
  </li>
  <li style="margin-bottom:8px;">The quotation must be submitted exclusively via e-mail to ${PROCUREMENT_EMAIL_EN}. Any submission delivered through any other channel shall be automatically ${redBold('DISQUALIFIED')}.</li>
  <li style="margin-bottom:8px;">Price shall be quoted in Indonesian Rupiah (IDR), with delivery terms ${escapeHtmlBody_(data.deliveryLabel)}, to the following address:<br>${escapeHtmlBody_(data.deliveryAddress).replace(/\n/g, '<br>')}</li>
  <li style="margin-bottom:8px;">The quotation validity is a minimum of thirty (30) calendar days after the quotation submission deadline. Payment terms shall be N45 calendar days after the quotation is declared complete and accurate by MSW Finance, Accounting, and Tax (FAT).</li>
  <li style="margin-bottom:8px;">In the absence of a stated validity period, or where the stated period is less than thirty (30) days, the quotation shall be deemed valid for thirty (30) days from the RFQ issuance date until the submission deadline on ${redBold(escapeHtmlBody_(deadline))}.</li>
  <li style="margin-bottom:8px;">Supporting documents shall be provided, where applicable, including but not limited to:
    <ol type="a" style="margin:4px 0 0 0;padding-left:18px;">
      <li>Catalogues/data sheets,</li>
      <li>Certificate of Origin (COO) or product warranty, and</li>
      <li>Other relevant technical documents.</li>
    </ol>
  </li>
  <li style="margin-bottom:8px;">Failure to comply with any of the above requirements shall result in disqualification of the quotation.</li>
  <li style="margin-bottom:8px;">Should your company decide not to participate, kindly provide a formal written notice by replying to this email.</li>
  <li style="margin-bottom:8px;">The Terms &amp; Conditions as stated in the attached Purchase Order (PO) are provided as reference for preparing your quotation and related contractual clauses.</li>
</ol>

<p style="margin:0 0 14px 0;">For further information regarding our company, please refer to ${link('https://www.alamtri.com/pages/read/7/24/Power')}.</p>

${buildMultipleEmailSignatureHtml_(data, 'Eng')}
`);
  }

  return wrap(`
<p style="margin:0 0 10px 0;">Kepada Yth<br>Bapak/Ibu Pimpinan<br><strong>${escapeHtmlBody_(data.company)}</strong></p>

<p style="margin:0 0 10px 0;">Kami atas nama PT Makmur Sejahtera Wisesa bermaksud mengundang Perusahaan Bapak/Ibu untuk menyampaikan penawaran resmi sesuai spesifikasi yang tercantum dalam Request For Quotation terlampir.</p>

<p style="margin:0 0 10px 0;">Penawaran harus kami terima paling lambat pada ${redBold(escapeHtmlBody_(deadline))}.</p>

<p style="margin:0 0 6px 0;">Adapun penawaran yang disampaikan mohon dapat mempertimbangkan Term &amp; Condition sebagai berikut:</p>

<ol style="margin:0 0 10px 0;padding-left:20px;">
  <li style="margin-bottom:8px;">Persyaratan surat penawaran:
    <ul style="margin:4px 0 0 0;padding-left:18px;">
      <li>Penawaran wajib menggunakan kop surat resmi perusahaan, dan</li>
      <li>Untuk nilai penawaran di bawah Rp100.000.000, penawaran harus ditandatangani oleh perwakilan perusahaan dan dibubuhi cap perusahaan, atau</li>
      <li>Untuk nilai penawaran sama dengan/lebih dari Rp100.000.000, penawaran harus ditandatangani oleh Pimpinan Perusahaan, dibubuhi cap perusahaan, dan wajib meterai Rp10.000.</li>
      <li>Apabila dokumen penawaran belum memenuhi persyaratan tersebut, maka akan kami tindak lanjuti untuk proses melengkapinya.</li>
    </ul>
  </li>
  <li style="margin-bottom:8px;">Penawaran HANYA disampaikan melalui email ke ${PROCUREMENT_EMAIL_ID}. Penawaran di luar email tersebut akan ${redBold('DIDISKUALIFIKASI')}.</li>
  <li style="margin-bottom:8px;">Harga penawaran wajib dalam IDR (Rupiah) dengan term delivery ${escapeHtmlBody_(data.deliveryLabel)} sesuai alamat di bawah ini:<br>${escapeHtmlBody_(data.deliveryAddress).replace(/\n/g, '<br>')}</li>
  <li style="margin-bottom:8px;">Masa berlaku penawaran adalah 30 hari dihitung sejak tanggal jatuh tempo penawaran di atas dan TOP N45 hari kalender sejak dinyatakan lengkap dan benar oleh FAT MSW.</li>
  <li style="margin-bottom:8px;">Masa penawaran di bawah 30 hari atau tidak tertera dalam penawaran, dianggap berlaku selama 30 hari sejak kami menyampaikan RFQ email ini hingga tanggal terakhir penerimaan ${redBold(escapeHtmlBody_(deadline))}.</li>
  <li style="margin-bottom:8px;">Dokumen pendukung yang harus dilengkapi adalah sebagai berikut:
    <ul style="margin:4px 0 0 0;padding-left:18px;">
      <li>Catalog/data sheet item yang ditawarkan (jika ada).</li>
      <li>Certificate of Origin (COO) (jika ada) atau Warranty Item yang ditawarkan.</li>
      <li>Kelengkapan pendukung dokumen teknis lainnya.</li>
    </ul>
  </li>
  <li style="margin-bottom:8px;">Kegagalan untuk memenuhi ketentuan yang disampaikan di atas akan mengakibatkan penawaran Anda ${redBold('DIDISKUALIFIKASI')}.</li>
  <li style="margin-bottom:8px;">Mohon dapat disampaikan alasan resmi bila tidak berkenan memasukkan penawaran atas inquiry dengan membalas email ini.</li>
  <li style="margin-bottom:8px;">TERMS &amp; CONDITION sebagaimana tercantum dalam PO dilampirkan sebagai acuan dalam penyusunan klausul penawaran.</li>
</ol>

<p style="margin:0 0 10px 0;">Untuk informasi mengenai perusahaan kami dapat dilihat pada website ${link('https://www.alamtri.com/pages/read/7/24/Power')}.</p>

<p style="margin:0 0 14px 0;"><em>Catatan:</em><br>Jika masih ada pertanyaan yang kurang jelas, dipersilakan menghubungi kontak saya di bawah ini.</p>

${buildMultipleEmailSignatureHtml_(data, 'Indo')}
`);
}


function getGeneratedMultipleEmailSpecialBodyHtml(row) {
  const data = getMultipleEmailTemplateData(row);
  const body = getGeneratedMultipleEmailSpecialBody(row);
  const deadline = data.language === 'Eng' ? data.closing.fullEng : data.closing.fullIndo;
  const paragraphs = escapeHtmlBody_(body)
    .split(/\n{2,}/)
    .map(paragraph => `<p style="margin:0 0 10px 0;">${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  let highlighted = paragraphs;
  if (deadline && deadline !== '-') {
    highlighted = highlighted.replace(
      escapeHtmlBody_(deadline),
      `<strong style="color:#C00000;">${escapeHtmlBody_(deadline)}</strong>`
    );
  }
  highlighted = highlighted
    .replace(/(DIDISKUALIFIKASI|DISQUALIFIED|didiskualifikasi|disqualified)/g, '<strong style="color:#C00000;">$1</strong>')
    .replace(/(dibatalkan|cancelled)/gi, '<strong style="color:#C00000;">$1</strong>');
  return `<div style="font-family:'Palatino Linotype','Book Antiqua',Palatino,serif;font-size:14px;color:#000000;line-height:1.5;">${highlighted}</div>`;
}

function getGeneratedMultipleEmailBodyHtml(row) {
  const data = getMultipleEmailTemplateData(row);
  return data.emailType === 'RFQ_INVITATION'
    ? getGeneratedMultipleEmailInvitationBodyHtml(row)
    : getGeneratedMultipleEmailSpecialBodyHtml(row);
}

// Kalau user mengedit body di kotak preview (plain text override), body HTML
// tetap dibuat dari teks yang diedit itu (paragraf + <br>), supaya editan user
// tidak hilang -- tapi styling warna deadline/T&C tetap dari versi generated
// kalau user belum override.
function getMultipleEmailBodyHtml(row) {
  const override = String(row?.['Body Override'] || '').trim();
  if (!override) return getGeneratedMultipleEmailBodyHtml(row);
  const paragraphs = override.split(/\n{2,}/).map(p => `<p style="margin:0 0 10px 0;">${escapeHtmlBody_(p).replace(/\n/g, '<br>')}</p>`).join('\n');
  return `<div style="font-family:'Palatino Linotype','Book Antiqua',Palatino,serif;font-size:14px;color:#000000;line-height:1.5;">${paragraphs}</div>`;
}

function getMultipleEmailBody(row) {
  return String(row?.['Body Override'] || '').trim() || getGeneratedMultipleEmailBody(row);
}

function getMultipleEmailAttachmentFiles(row) {
  const files = [
    ...(Array.isArray(row?.['Attch PR Files']) ? row['Attch PR Files'] : []),
    ...(Array.isArray(row?.['Attch TC Files']) ? row['Attch TC Files'] : [])
  ];
  const seen = new Set();
  return files.filter(file => {
    const id = String(file?.fileId || '').trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getMultipleEmailAttachmentText(row, includeLinks = false) {
  const files = getMultipleEmailAttachmentFiles(row);
  if (!files.length) return '';
  return files.map(file => {
    const name = String(file.fileName || 'Attachment').trim();
    const link = String(file.fileUrl || file.downloadUrl || '').trim();
    return includeLinks && link ? `${name}: ${link}` : name;
  }).join('\n');
}

function updateMultipleEmailField(index, key, value) {
  const rows = getMultipleEmailRows();
  const row = rows[Number(index)];
  if (!row) return;
  row[key] = value;
  if (key === 'Lg' || key === 'Vendor Email Type') {
    row['Subject Override'] = '';
    row['Body Override'] = '';
  }
  markDirty('Data Multiple Email berubah. Menunggu autosave...');
  if (key === 'DI' || key === 'Lg' || key === 'Vendor Email Type') renderCurrent();
}

async function loadMultipleEmailFolderFiles(folderType) {
  const meta = getBidderMeta();
  const sourceType = String(folderType || '01. PR Approval').trim();
  if (!['TC_MASTER', 'PROCUREMENT_MASTER'].includes(sourceType) && !meta.nopr) throw new Error('No PR belum tersedia.');
  const response = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'LIST_PROCUREMENT_FILES',
      noPR: meta.nopr,
      description: meta.description || '',
      folderId: meta.folderid || '',
      folderType: sourceType,
      round: getDocumentRound(meta)
    })
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.message || 'Daftar file tidak dapat dimuat.');
  MULTIPLE_EMAIL_FOLDER_FILES = Array.isArray(result.files) ? result.files : [];
  renderMultipleEmailAttachmentFileList();
  return result;
}

function renderMultipleEmailAttachmentFileList() {
  const container = document.getElementById('multipleEmailAttachmentFileList');
  if (!container || !MULTIPLE_EMAIL_ATTACHMENT_CONTEXT) return;
  const { mode, rowIndex, field } = MULTIPLE_EMAIL_ATTACHMENT_CONTEXT;
  let selectedFiles = [];
  if (mode === 'internal') {
    const store = getMultipleEmailInternalStore();
    selectedFiles = getMultipleEmailInternalDraft(store.activeType).attachments;
  } else {
    const row = getMultipleEmailRows()[rowIndex] || {};
    selectedFiles = row[`${field} Files`] || [];
  }
  const selectedIds = new Set(selectedFiles.map(file => String(file?.fileId || '')));
  if (!MULTIPLE_EMAIL_FOLDER_FILES.length) {
    container.innerHTML = '<p class="empty">Folder ini belum memiliki file.</p>';
    return;
  }
  container.innerHTML = MULTIPLE_EMAIL_FOLDER_FILES.map((file, index) => `
    <label class="attachment-file-option">
      <input type="checkbox" data-file-index="${index}" ${selectedIds.has(String(file.fileId)) ? 'checked' : ''}>
      <span><strong>${escapeHtml(file.fileName)}</strong><small>${escapeHtml(file.folderType || '')} • ${formatFileSize(file.size)}</small></span>
      <button type="button" class="mini-btn" onclick="event.preventDefault(); openOriginalProcurementFileByIndex(${index})">Buka</button>
    </label>`).join('');
}

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildDrivePreviewUrl(file) {
  if (!file) return '';
  if (String(file.mimeType || '').trim() === 'application/vnd.google-apps.folder') return '';

  const idsFromUrl = [file.previewUrl, file.fileUrl, file.downloadUrl]
    .map(value => String(value || '').trim())
    .filter(value => value && !/\/folders\//i.test(value))
    .map(value => {
      const match =
        value.match(/\/(?:file|spreadsheets|document|presentation)\/d\/([^/?#]+)/i) ||
        value.match(/[?&]id=([^&#]+)/i);
      return match?.[1] ? decodeURIComponent(match[1]) : '';
    })
    .filter(Boolean);

  const rawFileId = String(file.fileId || '').trim();
  const blockedFolderIds = new Set([
    String(file.folderId || '').trim(),
    String(file.rootFolderId || '').trim(),
    String(file.targetFolderId || '').trim(),
    String(getBidderMeta()?.folderid || '').trim()
  ].filter(Boolean));

  const fileId = [...idsFromUrl, rawFileId]
    .find(candidate => candidate && !blockedFolderIds.has(candidate));

  return fileId
    ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`
    : '';
}

function openOriginalProcurementFile(file) {
  if (!file) return;

  // Semua dokumen proyek tersimpan di Google Drive. Jangan gunakan Office URI
  // (ms-excel:ofe) karena URL Google Drive bukan URL Office/SharePoint dan akan
  // memunculkan error "Office doesn't recognize the command".
  const targetUrl = buildDrivePreviewUrl(file) || String(file.fileUrl || file.downloadUrl || '').trim();
  if (!targetUrl) {
    alert('URL dokumen tidak tersedia.');
    return;
  }

  const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.href = targetUrl;
}

function openOriginalProcurementFileByIndex(index) {
  openOriginalProcurementFile(MULTIPLE_EMAIL_FOLDER_FILES[Number(index)]);
}

async function openMultipleEmailAttachmentPicker(index, field) {
  MULTIPLE_EMAIL_ATTACHMENT_CONTEXT = { mode: 'vendor', rowIndex: Number(index), field };
  const dialog = document.getElementById('multipleEmailAttachmentDialog');
  const title = document.getElementById('multipleEmailAttachmentTitle');
  const folderSelect = document.getElementById('multipleEmailAttachmentFolder');
  if (!dialog || !folderSelect) return;

  const source = MULTIPLE_EMAIL_ATTACHMENT_SOURCES[field] || MULTIPLE_EMAIL_ATTACHMENT_SOURCES['Attch PR'];
  if (title) title.textContent = field === 'Attch TC' ? 'Pilih Attachment TC' : 'Pilih Attachment PR/RFQ';
  folderSelect.innerHTML = `<option value="${escapeHtml(source.value)}">${escapeHtml(source.label)}</option>`;
  folderSelect.value = source.value;
  folderSelect.disabled = true;

  document.getElementById('multipleEmailAttachmentFileList').innerHTML = '<p class="empty">Memuat file...</p>';
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', 'open');
  try {
    await loadMultipleEmailFolderFiles(source.value);
  } catch (error) {
    document.getElementById('multipleEmailAttachmentFileList').innerHTML = `<p class="empty">${escapeHtml(error.message || error)}</p>`;
  }
}

async function openMultipleEmailInternalAttachmentPicker(folderType, label) {
  MULTIPLE_EMAIL_ATTACHMENT_CONTEXT = { mode: 'internal', folderType: String(folderType || '') };
  const dialog = document.getElementById('multipleEmailAttachmentDialog');
  const title = document.getElementById('multipleEmailAttachmentTitle');
  const folderSelect = document.getElementById('multipleEmailAttachmentFolder');
  if (!dialog || !folderSelect) return;

  if (title) title.textContent = label || 'Pilih Attachment Internal';
  folderSelect.innerHTML = `<option value="${escapeHtml(folderType)}">${escapeHtml(folderType)}</option>`;
  folderSelect.value = folderType;
  folderSelect.disabled = true;

  document.getElementById('multipleEmailAttachmentFileList').innerHTML = '<p class="empty">Memuat file...</p>';
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', 'open');
  try {
    await loadMultipleEmailFolderFiles(folderType);
  } catch (error) {
    document.getElementById('multipleEmailAttachmentFileList').innerHTML = `<p class="empty">${escapeHtml(error.message || error)}</p>`;
  }
}

async function changeMultipleEmailAttachmentFolder(value) {
  const container = document.getElementById('multipleEmailAttachmentFileList');
  if (container) container.innerHTML = '<p class="empty">Memuat file...</p>';
  try { await loadMultipleEmailFolderFiles(value); }
  catch (error) { if (container) container.innerHTML = `<p class="empty">${escapeHtml(error.message || error)}</p>`; }
}

function applyMultipleEmailAttachmentSelection() {
  if (!MULTIPLE_EMAIL_ATTACHMENT_CONTEXT) return;
  const { mode, rowIndex, field, folderType } = MULTIPLE_EMAIL_ATTACHMENT_CONTEXT;
  const selected = [...document.querySelectorAll('#multipleEmailAttachmentFileList input[type="checkbox"]:checked')]
    .map(input => MULTIPLE_EMAIL_FOLDER_FILES[Number(input.dataset.fileIndex)])
    .filter(Boolean)
    .map(file => ({
      fileId: file.fileId,
      fileName: file.fileName,
      fileUrl: file.fileUrl,
      downloadUrl: file.downloadUrl,
      mimeType: file.mimeType,
      size: file.size,
      folderType: file.folderType
    }));

  if (mode === 'internal') {
    const store = getMultipleEmailInternalStore();
    const draft = getMultipleEmailInternalDraft(store.activeType);
    const otherSources = draft.attachments.filter(file => String(file?.folderType || '') !== String(folderType || ''));
    const seen = new Set();
    draft.attachments = [...otherSources, ...selected].filter(file => {
      const id = String(file?.fileId || '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    markDirty('Attachment email internal diperbarui. Menunggu autosave...');
    document.getElementById('multipleEmailAttachmentDialog')?.close();
    renderCurrent();
    return;
  }

  const row = getMultipleEmailRows()[rowIndex];
  if (!row) return;
  row[`${field} Files`] = selected;
  row[field] = selected.map(file => file.fileName).join('; ');
  markDirty(`${field} diperbarui. Menunggu autosave...`);
  document.getElementById('multipleEmailAttachmentDialog')?.close();
  renderCurrent();
}

function updateMultipleEmailPreviewDraft(index, key, value) {
  const row = getMultipleEmailRows()[Number(index)];
  if (!row) return;
  row[key] = value;
  markDirty('Wording email diperbarui. Menunggu autosave...');
}

async function showMultipleEmailPreview(index) {
  const row = getMultipleEmailRows()[Number(index)];
  if (!row) return;
  await loadCurrentUserProfile();
  const dialog = document.getElementById('multipleEmailPreviewDialog');
  if (!dialog) return;

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value || '-';
  };
  setText('emailPreviewTo', normalizeEmailRecipients(row.to));
  setText('emailPreviewCc', normalizeEmailRecipients(row.cc || MULTIPLE_EMAIL_DEFAULT_CC));
  setText('emailPreviewAttachments', getMultipleEmailAttachmentText(row) || 'Belum ada attachment dipilih.');
  setText('emailPreviewType', getMultipleEmailVendorTypeLabel(row));
  setText('emailPreviewDelivery', 'Outlook Draft + Attachment (.eml)');
  setText('emailPreviewLanguage', row.Lg || 'Indo');
  setText('emailPreviewLocation', getMultipleEmailDeliveryLabel());

  const subjectInput = document.getElementById('emailPreviewSubjectInput');
  const bodyInput = document.getElementById('emailPreviewBodyInput');
  if (subjectInput) {
    subjectInput.value = getMultipleEmailSubject(row);
    subjectInput.dataset.rowIndex = String(index);
  }
  if (bodyInput) {
    bodyInput.value = getMultipleEmailBody(row);
    bodyInput.dataset.rowIndex = String(index);
  }

  const actionButton = document.getElementById('emailPreviewPrimaryAction');
  if (actionButton) {
    actionButton.dataset.rowIndex = String(index);
    actionButton.innerHTML = OUTLOOK_DRAFT_BUTTON_HTML;
    actionButton.className = 'mini-btn ok';
  }
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', 'open');
}

function executeMultipleEmailPreviewAction() {
  const button = document.getElementById('emailPreviewPrimaryAction');
  const index = Number(button?.dataset?.rowIndex);
  const row = getMultipleEmailRows()[index];
  if (!row) return;
  const subjectInput = document.getElementById('emailPreviewSubjectInput');
  const bodyInput = document.getElementById('emailPreviewBodyInput');
  if (subjectInput) row['Subject Override'] = subjectInput.value;
  if (bodyInput) row['Body Override'] = bodyInput.value;
  markDirty('Wording email dari Preview disimpan. Menunggu autosave...');
  document.getElementById('multipleEmailPreviewDialog')?.close();
  openOutlookDraft(index);
}

const OUTLOOK_DRAFT_BUTTON_HTML = '<span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-right:6px;border-radius:3px;background:#0a64ad;color:#fff;font-weight:700;font-size:11px;line-height:1">O</span><span>Outlook Draft + Attachment</span>';

async function requestOutlookDraftEml(payload) {
  const response = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'CREATE_OUTLOOK_DRAFT_EML', ...payload })
  });

  const raw = await response.text();
  let result = {};
  try { result = JSON.parse(raw || '{}'); }
  catch (error) { throw new Error(`Respons Apps Script tidak valid: ${raw.slice(0, 250)}`); }

  if (!result.success || !result.base64) {
    throw new Error(result.message || 'Draft Outlook tidak dapat dibuat.');
  }

  const draftBlob = new Blob(
    [base64ToArrayBuffer(result.base64)],
    { type: result.mimeType || 'message/rfc822' }
  );
  downloadBlob(draftBlob, result.fileName || 'Outlook Draft.eml');
  return result;
}

async function openOutlookDraft(index) {
  const row = getMultipleEmailRows()[Number(index)];
  if (!row) return;

  await loadCurrentUserProfile();

  const to = normalizeEmailRecipients(row.to);
  if (!to) {
    alert('Email penerima belum tersedia. Periksa kolom To atau data Email pada Vendor Company.');
    return;
  }

  const triggerButton = document.activeElement instanceof HTMLButtonElement
    ? document.activeElement
    : null;
  const originalButtonHtml = triggerButton?.innerHTML || '';

  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.textContent = 'Membuat draft...';
  }

  try {
    const result = await requestOutlookDraftEml({
      to,
      cc: normalizeEmailRecipients(row.cc || MULTIPLE_EMAIL_DEFAULT_CC),
      subject: getMultipleEmailSubject(row),
      body: getMultipleEmailBody(row),
      bodyHtml: getMultipleEmailBodyHtml(row),
      attachmentFileIds: getMultipleEmailAttachmentFiles(row).map(file => file.fileId),
      draftFileName: `Outlook Draft - ${getMultipleEmailVendorTypeLabel(row)} - ${row.RFQ || row['No PR'] || row.Company || 'Vendor'}.eml`
    });

    row['Sent Status'] = `Draft dibuat ${new Date().toLocaleString('id-ID')}`;
    markDirty('Status Outlook Draft diperbarui. Menunggu autosave...');
    renderCurrent();

    alert(
      `Draft Outlook berhasil dibuat dengan ${result.attachmentCount || 0} attachment.\n\n` +
      `Buka file “${result.fileName}” dari folder Downloads, lalu periksa dan klik Send di Outlook Classic.`
    );
  } catch (error) {
    alert(`Gagal membuat Outlook Draft: ${error.message || error}`);
  } finally {
    if (triggerButton && document.body.contains(triggerButton)) {
      triggerButton.disabled = false;
      triggerButton.innerHTML = originalButtonHtml || OUTLOOK_DRAFT_BUTTON_HTML;
    }
  }
}

async function sendMultipleEmailDirect(index) {
  alert('Direct Send dinonaktifkan karena tidak menggunakan Power Automate Premium. Sistem akan membuat Outlook Draft dengan attachment.');
  return openOutlookDraft(index);
}

function renderMultipleEmailAttachmentCell(row, index, field) {
  const files = Array.isArray(row[`${field} Files`]) ? row[`${field} Files`] : [];
  const label = files.length ? `${files.length} file` : 'Pilih File';
  const names = files.map(file => file.fileName).join('\n');
  return `<div class="attachment-cell">
    <button type="button" class="mini-btn" onclick="openMultipleEmailAttachmentPicker(${index}, '${field}')">${escapeHtml(label)}</button>
    <small title="${escapeHtml(names)}">${escapeHtml(names || 'Belum dipilih')}</small>
  </div>`;
}



function normalizeWhatsAppPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  else if (digits.startsWith('620')) digits = `62${digits.slice(3)}`;
  return digits;
}

function getVendorWhatsAppMessage(row) {
  const company = String(row?.Company || 'Bapak/Ibu Vendor').trim();
  const rfq = String(row?.RFQ || '').trim();
  const noPR = String(row?.['No PR'] || '').trim();
  const info = String(row?.['Info Tender'] || '').trim();
  const emailType = getMultipleEmailVendorTypeLabel(row);
  const isEnglish = String(row?.Lg || '').toLowerCase() === 'eng';

  if (isEnglish) {
    return [
      `Dear ${company},`,
      '',
      `This is Procurement PT Makmur Sejahtera Wisesa regarding ${emailType}${rfq ? ` ${rfq}` : ''}${noPR ? ` / PR ${noPR}` : ''}.`,
      info ? `Tender information: ${info}.` : '',
      'Please check the email sent by our Procurement team for the complete information and attachments.',
      '',
      'Thank you.'
    ].filter(Boolean).join('\n');
  }

  return [
    `Yth. Bapak/Ibu ${company},`,
    '',
    `Kami dari Procurement PT Makmur Sejahtera Wisesa terkait ${emailType}${rfq ? ` ${rfq}` : ''}${noPR ? ` / PR ${noPR}` : ''}.`,
    info ? `Informasi tender: ${info}.` : '',
    'Mohon memeriksa email yang telah dikirim oleh tim Procurement untuk informasi dan lampiran lengkap.',
    '',
    'Terima kasih.'
  ].filter(Boolean).join('\n');
}

function openVendorWhatsApp(index) {
  const row = normalizeMultipleEmailRow(getMultipleEmailRows()[Number(index)] || {});
  const phone = normalizeWhatsAppPhone(row.Phone);

  if (!phone) {
    alert(`Nomor WhatsApp untuk ${row.Company || 'vendor'} belum tersedia. Isi kolom WhatsApp terlebih dahulu.`);
    return;
  }

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(getVendorWhatsAppMessage(row))}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function openCommunicationShortcut(type) {
  if (type === 'whatsapp') {
    window.open('https://web.whatsapp.com/', '_blank', 'noopener,noreferrer');
    return;
  }
  if (type === 'outlook') {
    window.open('https://outlook.office.com/mail/', '_blank', 'noopener,noreferrer');
  }
}

function applyMultipleEmailVendorTypeToAll(type) {
  const resolved = MULTIPLE_EMAIL_VENDOR_CONFIG[type] ? type : 'RFQ_INVITATION';
  const rows = getMultipleEmailRows();
  let changed = 0;
  rows.forEach(row => {
    if (!String(row?.Company || row?.to || '').trim()) return;
    row['Vendor Email Type'] = resolved;
    row['Subject Override'] = '';
    row['Body Override'] = '';
    changed += 1;
  });
  markDirty(`Jenis email ${changed} vendor diperbarui. Menunggu autosave...`);
  renderCurrent();
}

function getMultipleEmailVendorTypeLabel(row) {
  const type = MULTIPLE_EMAIL_VENDOR_CONFIG[row?.['Vendor Email Type']]
    ? row['Vendor Email Type']
    : 'RFQ_INVITATION';
  return MULTIPLE_EMAIL_VENDOR_CONFIG[type].label;
}

function renderMultipleEmailEditorRows() {
  const activeRows = getMultipleEmailRows()
    .map((row, index) => ({ row: normalizeMultipleEmailRow(row), index }))
    .filter(item => String(item.row.Company || item.row.to || '').trim());
  activeRows.forEach(item => { DATA.structured.Multiple_Email.rows[item.index] = item.row; });
  if (!activeRows.length) return '<div class="notice">Belum ada vendor. Klik <b>Sinkronkan Vendor dari BidderList</b>.</div>';

  const body = activeRows.map(({ row, index }) => {
    const ready = Boolean(normalizeEmailRecipients(row.to));
    return `<tr>
      <td><strong>${escapeHtml(row.Company || '-')}</strong></td>
      <td><input type="text" value="${escapeHtml(row.Phone || '')}" placeholder="08..." onchange="updateMultipleEmailField(${index}, 'Phone', this.value)"></td>
      <td><select onchange="updateMultipleEmailField(${index}, 'Vendor Email Type', this.value)" title="${escapeHtml(MULTIPLE_EMAIL_VENDOR_CONFIG[row['Vendor Email Type']]?.description || '')}">
        ${Object.entries(MULTIPLE_EMAIL_VENDOR_CONFIG).map(([key, item]) => `<option value="${key}" ${row['Vendor Email Type'] === key ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
      </select><small>${escapeHtml(MULTIPLE_EMAIL_VENDOR_CONFIG[row['Vendor Email Type']]?.attachmentHint || '')}</small></td>
      <td><input type="text" value="${escapeHtml(row.to)}" onchange="updateMultipleEmailField(${index}, 'to', this.value)"></td>
      <td><input type="text" value="${escapeHtml(row.cc || MULTIPLE_EMAIL_DEFAULT_CC)}" onchange="updateMultipleEmailField(${index}, 'cc', this.value)"></td>
      <td>${escapeHtml(row.RFQ || '-')}</td>
      <td>${escapeHtml(row['No PR'] || '-')}</td>
      <td><input type="text" value="${escapeHtml(row.Time)}" onchange="updateMultipleEmailField(${index}, 'Time', this.value)"></td>
      <td>${renderMultipleEmailAttachmentCell(row, index, 'Attch PR')}</td>
      <td>${renderMultipleEmailAttachmentCell(row, index, 'Attch TC')}</td>
      <td><select disabled title="Direct Send memerlukan Graph App Registration atau lisensi yang sesuai"><option value="No" selected>No — Outlook Draft</option></select></td>
      <td><select onchange="updateMultipleEmailField(${index}, 'Lg', this.value)"><option value="Indo" ${row.Lg === 'Indo' ? 'selected' : ''}>Indo</option><option value="Eng" ${row.Lg === 'Eng' ? 'selected' : ''}>Eng</option></select></td>
      <td><span class="pill">${escapeHtml(getMultipleEmailDeliveryKey())}</span></td>
      <td><textarea onchange="updateMultipleEmailField(${index}, 'Info Tender', this.value)">${escapeHtml(row['Info Tender'])}</textarea></td>
      <td><span class="email-readiness ${ready ? 'ready' : 'missing'}">${escapeHtml(row['Sent Status'] || (ready ? 'Siap' : 'Email kosong'))}</span></td>
      <td class="email-action-cell"><button type="button" class="mini-btn" onclick="showMultipleEmailPreview(${index})">Preview</button><button type="button" class="mini-btn whatsapp-action-btn" ${normalizeWhatsAppPhone(row.Phone) ? '' : 'disabled'} onclick="openVendorWhatsApp(${index})" title="Buka WhatsApp vendor"><span aria-hidden="true" class="whatsapp-mini-icon">WA</span><span>WhatsApp</span></button><button type="button" class="mini-btn ok" ${ready ? '' : 'disabled'} onclick="openOutlookDraft(${index})">${OUTLOOK_DRAFT_BUTTON_HTML}</button></td>
    </tr>`;
  }).join('');

  return `<div class="table-wrap multiple-email-editor"><table>
    <thead><tr><th>Company</th><th>WhatsApp</th><th>Jenis Email</th><th>To</th><th>CC</th><th>RFQ</th><th>No PR</th><th>Closing</th><th>Attch PR</th><th>Attch TC</th><th>DI</th><th>Lg</th><th>Location</th><th>Info Tender</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function openMultipleEmailInternalAttachment(fileId) {
  const store = getMultipleEmailInternalStore();
  const file = getMultipleEmailInternalDraft(store.activeType).attachments
    .find(item => String(item?.fileId || '') === String(fileId || ''));
  openOriginalProcurementFile(file);
}

function renderMultipleEmailInternalAttachments(draft) {
  const files = Array.isArray(draft.attachments) ? draft.attachments : [];
  if (!files.length) return '<p class="internal-email-empty">Belum ada attachment dipilih.</p>';
  return `<div class="internal-email-attachment-list">${files.map(file => {
    const encodedId = encodeURIComponent(String(file.fileId || ''));
    return `<div class="internal-email-attachment-item">
      <span><strong>${escapeHtml(file.fileName || 'Attachment')}</strong><small>${escapeHtml(file.folderType || '')} • ${formatFileSize(file.size)}</small></span>
      <div><button type="button" class="mini-btn" onclick="openMultipleEmailInternalAttachment(decodeURIComponent('${encodedId}'))">Buka</button><button type="button" class="mini-btn danger" onclick="removeMultipleEmailInternalAttachment(decodeURIComponent('${encodedId}'))">Hapus</button></div>
    </div>`;
  }).join('')}</div>`;
}

function renderMultipleEmailAttachmentDialog() {
  return `<dialog id="multipleEmailAttachmentDialog" class="email-preview-dialog attachment-picker-dialog">
    <div class="email-preview-header"><h3 id="multipleEmailAttachmentTitle">Pilih Attachment</h3><button type="button" class="mini-btn" onclick="this.closest('dialog').close()">Tutup</button></div>
    <label class="attachment-folder-select">Sumber<select id="multipleEmailAttachmentFolder" disabled><option value="01. PR Approval">01. PR Approval</option></select></label>
    <div id="multipleEmailAttachmentFileList" class="attachment-file-list"><p class="empty">Memuat file...</p></div>
    <div class="email-preview-actions"><button type="button" class="mini-btn ok" onclick="applyMultipleEmailAttachmentSelection()">Gunakan File Terpilih</button></div>
  </dialog>`;
}

async function openMultipleEmailInternalOutlookDraft() {
  const store = getMultipleEmailInternalStore();
  const type = store.activeType;
  const config = MULTIPLE_EMAIL_INTERNAL_CONFIG[type];
  const draft = getMultipleEmailInternalDraft(type);
  const to = normalizeEmailRecipients(draft.to);
  if (!to) {
    alert('Email penerima internal belum tersedia. Periksa kolom To.');
    return;
  }

  await loadCurrentUserProfile();
  const button = document.getElementById('internalEmailDraftButton');
  const originalHtml = button?.innerHTML || OUTLOOK_DRAFT_BUTTON_HTML;
  if (button) {
    button.disabled = true;
    button.textContent = 'Membuat draft...';
  }

  try {
    const data = getInternalEmailProcurementData();
    const result = await requestOutlookDraftEml({
      to,
      cc: normalizeEmailRecipients(draft.cc),
      subject: getInternalEmailSubject(type, draft),
      body: getInternalEmailBody(type, draft),
      bodyHtml: getInternalEmailBodyHtml(type, draft),
      importance: 'high',
      attachmentFileIds: draft.attachments.map(file => file.fileId).filter(Boolean),
      draftFileName: `Outlook Draft Internal - ${config.label} - ${data.noPR || 'Procurement'}.eml`
    });

    draft['Draft Status'] = `Draft dibuat ${new Date().toLocaleString('id-ID')}`;
    markDirty('Status Outlook Draft internal diperbarui. Menunggu autosave...');
    recordProcurementActivity({
      type: 'EMAIL',
      documentNo: data.noPR || '',
      status: `Internal ${config.label} Draft`,
      detail: `${result.attachmentCount || 0} attachment`,
      fileName: result.fileName || ''
    });
    renderCurrent();
    alert(
      `Draft internal ${config.label} berhasil dibuat dengan ${result.attachmentCount || 0} attachment.\n\n` +
      `Buka file “${result.fileName}” dari folder Downloads, lalu periksa dan klik Send di Outlook Classic.`
    );
  } catch (error) {
    alert(`Gagal membuat Outlook Draft internal: ${error.message || error}`);
  } finally {
    if (button && document.body.contains(button)) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
}

function renderMultipleEmailInternal() {
  const store = getMultipleEmailInternalStore();
  const type = store.activeType;
  const config = MULTIPLE_EMAIL_INTERNAL_CONFIG[type];
  const draft = getMultipleEmailInternalDraft(type);
  const subject = getInternalEmailSubject(type, draft);
  const body = getInternalEmailBody(type, draft);
  const sourceButtons = config.attachmentSources.map(source =>
    `<button type="button" class="mini-btn" onclick="openMultipleEmailInternalAttachmentPicker('${escapeHtml(source.folderType)}', '${escapeHtml(source.label)}')">${escapeHtml(source.label)}</button>`
  ).join('');

  const data = getInternalEmailProcurementData();
  const recipientReady = Boolean(normalizeEmailRecipients(draft.to));
  const vendorReleaseMeta = isVendorReleaseEmailType(type)
    ? `<div class="notice"><b>Winner:</b> ${escapeHtml(data.winner || '-')} &nbsp;|&nbsp; <b>Email Vendor:</b> ${escapeHtml(data.winnerEmail || 'belum tersedia')} &nbsp;|&nbsp; <b>Lokasi:</b> ${escapeHtml(data.deliveryLabel || '-')}</div>`
    : '';

  return `<div class="communication-card internal-email-card">
    <div><h3>Multiple Email Internal</h3><p>Format mengikuti workbook Multiple Email.xlsm dan data Procurement pada No PR aktif.</p></div>
    <label class="internal-email-type-label">Jenis Email
      <select onchange="changeMultipleEmailInternalType(this.value)">
        ${Object.entries(MULTIPLE_EMAIL_INTERNAL_CONFIG).map(([key, item]) => `<option value="${key}" ${key === type ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
      </select>
    </label>
  </div>
  <div class="notice"><b>Release PR</b> menggunakan PR/RFQ + Bidderlist. <b>PO Proc</b> menggunakan PO + CQS Approval. <b>Release PO</b> menggunakan PO Original + Terms & Conditions + Surat Submission Invoice. <b>Proforma PO</b> hanya menggunakan Proforma/Draft PO. <b>Surat Penunjukan</b> menggunakan dokumen Surat Penunjukan untuk approval e-sign. To/CC dapat berisi beberapa email yang dipisahkan tanda titik koma.</div>
  ${vendorReleaseMeta}
  <div class="internal-email-form">
    <label>To<input type="text" value="${escapeHtml(draft.to)}" oninput="updateMultipleEmailInternalField('to', this.value)"></label>
    <label>CC<input type="text" value="${escapeHtml(draft.cc)}" oninput="updateMultipleEmailInternalField('cc', this.value)"></label>
    <label class="internal-email-full">Subject<input type="text" value="${escapeHtml(subject)}" oninput="updateMultipleEmailInternalField('Subject Override', this.value)"></label>
    <label class="internal-email-full">Body Email<textarea oninput="updateMultipleEmailInternalField('Body Override', this.value)">${escapeHtml(body)}</textarea></label>
    <section class="internal-email-full internal-email-attachments">
      <div class="internal-email-attachment-header"><strong>Attachments</strong><div>${sourceButtons}</div></div>
      ${renderMultipleEmailInternalAttachments(draft)}
    </section>
    <div class="internal-email-full internal-email-footer">
      <span class="email-readiness ${recipientReady ? 'ready' : 'missing'}">${escapeHtml(draft['Draft Status'] || (recipientReady ? 'Siap dibuat' : 'Email penerima belum tersedia'))}</span>
      <div><button type="button" class="mini-btn" onclick="refreshMultipleEmailInternalDefaults()">Refresh Data</button><button type="button" class="mini-btn" onclick="resetMultipleEmailInternalWording()">Reset Wording</button><button type="button" id="internalEmailDraftButton" class="mini-btn ok" ${recipientReady ? '' : 'disabled'} onclick="openMultipleEmailInternalOutlookDraft()">${OUTLOOK_DRAFT_BUTTON_HTML}</button></div>
    </div>
  </div>`;
}

function renderMultipleEmail() {
  const modeTabs = `<div class="multiple-email-mode-tabs" role="tablist" aria-label="Jenis Multiple Email">
    <button type="button" class="${ACTIVE_MULTIPLE_EMAIL_MODE === 'vendor' ? 'active' : ''}" onclick="setMultipleEmailMode('vendor')">Vendor RFQ</button>
    <button type="button" class="${ACTIVE_MULTIPLE_EMAIL_MODE === 'internal' ? 'active' : ''}" onclick="setMultipleEmailMode('internal')">Internal</button>
  </div>`;

  if (ACTIVE_MULTIPLE_EMAIL_MODE === 'internal') {
    return `${modeTabs}${renderMultipleEmailInternal()}${renderMultipleEmailAttachmentDialog()}`;
  }

  const hasPreparedRows = getMultipleEmailRows().some(row => String(row.Company || '').trim());
  if (!hasPreparedRows && getInvitedVendorEmailRows().length) syncMultipleEmailFromBidderList(false, false);

  return `${modeTabs}<div class="communication-card">
    <div><h3>Multiple Email Web — RFQ Vendor</h3><p>Vendor mengikuti BidderList round aktif. Tersedia RFQ Baru, Rebid, Reminder, Cancel RFQ, dan pemberitahuan vendor tidak terpilih.</p></div>
    <div class="communication-actions">
      <label>Jenis untuk semua vendor
        <select onchange="applyMultipleEmailVendorTypeToAll(this.value)">
          <option value="">Pilih dan terapkan...</option>
          ${Object.entries(MULTIPLE_EMAIL_VENDOR_CONFIG).map(([key, item]) => `<option value="${key}">${escapeHtml(item.label)}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="mini-btn ok" onclick="syncMultipleEmailFromBidderList(true, true)">Sinkronkan Vendor dari BidderList</button>
    </div>
  </div>
  <div class="notice"><b>Jenis Email</b> menentukan subject dan wording masing-masing vendor. <b>Lg</b> memilih bahasa Indo/Eng. Isi email mengikuti <b>Location Delivery RFQ</b> (MSW/IBT) dan dapat diedit pada Preview. Untuk RFQ Baru/Rebid gunakan attachment PR/RFQ dan TC; Reminder dapat melampirkan RFQ kembali; Cancel RFQ serta Vendor Tidak Terpilih tidak mewajibkan attachment. Setelah tombol Outlook diklik, buka file <b>.eml</b> menggunakan <b>Outlook Classic</b>, periksa email, lalu klik Send.</div>
  ${renderMultipleEmailEditorRows()}
  ${renderMultipleEmailAttachmentDialog()}
  <dialog id="multipleEmailPreviewDialog" class="email-preview-dialog">
    <div class="email-preview-header"><h3>Preview Email Vendor</h3><button type="button" class="mini-btn" onclick="this.closest('dialog').close()">Tutup</button></div>
    <dl class="email-preview-meta">
      <dt>To</dt><dd id="emailPreviewTo">-</dd><dt>CC</dt><dd id="emailPreviewCc">-</dd>
      <dt>Jenis Email</dt><dd id="emailPreviewType">-</dd><dt>DI</dt><dd id="emailPreviewDelivery">-</dd>
      <dt>Language</dt><dd id="emailPreviewLanguage">-</dd><dt>Location</dt><dd id="emailPreviewLocation">-</dd>
      <dt>Attachments</dt><dd><pre id="emailPreviewAttachments">-</pre></dd>
    </dl>
    <label class="email-preview-edit-label">Subject
      <input id="emailPreviewSubjectInput" class="email-preview-subject-input" type="text" oninput="updateMultipleEmailPreviewDraft(this.dataset.rowIndex, 'Subject Override', this.value)">
    </label>
    <label class="email-preview-edit-label">Body Email
      <textarea id="emailPreviewBodyInput" class="email-preview-body-input" oninput="updateMultipleEmailPreviewDraft(this.dataset.rowIndex, 'Body Override', this.value)"></textarea>
    </label>
    <div class="email-preview-actions"><button type="button" id="emailPreviewPrimaryAction" class="mini-btn ok" onclick="executeMultipleEmailPreviewAction()">${OUTLOOK_DRAFT_BUTTON_HTML}</button></div>
  </dialog>`;
}

function renderSupport() {
  const x = DATA.structured.Support;
  let out = editHint();
  out += renderTable(x.contacts, 'structured.Support.contacts');
  out += `<div class="section-title"><h3>Vendor Categories</h3><span class="pill">${x.categories.length} category</span></div>`;
  out += `<div class="category-list">${x.categories.map((c, idx) => `<span${editMode ? ` contenteditable="true" data-category-index="${idx}" oninput="handleCategoryEdit(this)"` : ''}>${escapeHtml(c)}</span>`).join('')}</div>`;
  if (editMode) out += '<div class="table-actions"><button class="mini-btn ok" onclick="addCategory()">+ Tambah Kategori</button></div>';
  return out;
}

function handleCategoryEdit(el) {
  const idx = Number(el.dataset.categoryIndex);
  DATA.structured.Support.categories[idx] = el.innerText;
  markDirty('Kategori berubah. Klik Save untuk mengirim perubahan ke Google Sheet.');
}

function addCategory() {
  DATA.structured.Support.categories.push('Kategori Baru');
  markDirty('Kategori baru ditambahkan. Klik Save untuk mengirim perubahan ke Google Sheet.');
  

  renderCurrent();
}

function renderRaw() {
  let out = editHint();
  out += Object.entries(DATA.rawSheets).map(([name, matrix]) => renderRawGrid(name, matrix)).join('');
  return out;
}

function renderCurrent() {
  document.getElementById('viewTitle').textContent = currentView === 'Raw' ? 'Original Grid' : currentView;
  document.getElementById('viewSubtitle').textContent = subtitles[currentView] || '';

  const renderers = {
    BidderList: renderBidderList,
    RFQ: renderRFQ,
    CQS: renderCQS,
    Multiple_Email: renderMultipleEmail,
    Support: renderSupport,
    Raw: renderRaw
  };

  const viewBody = document.getElementById('viewBody');
  viewBody.dataset.view = currentView;
  viewBody.innerHTML = renderers[currentView]();
  requestAnimationFrame(enableManualColumnResize);

  // Tambahkan ini
  if (window.flatpickr) {

    document.querySelectorAll(".meta-date-input").forEach(el => {

      flatpickr(el, {
        dateFormat: "d M Y",
        defaultDate: parseMetaDate(el.value),
        allowInput: false,
        disableMobile: true,
        onChange(selectedDates) {

          handleMetaDateEdit(el);

        }

      });

    });

  }

  updateVendorStatus();
  updateCQSNavigationStatus();
  ensureProcurementDocumentViewButtons();
  ensureBidderTemplatePreviewButton();
}

async function toggleEdit() {
  editMode = true;
  renderCurrent();
  scheduleWorkspaceAutoSave();
}


/* =========================================================
   EXPORT KE TEMPLATE XLSX TANPA MACRO
   ========================================================= */
let XLSM_TEMPLATE_ARRAY_BUFFER = null; // nama variabel dipertahankan agar patch kompatibel
let XLSM_TEMPLATE_FILE_NAME = 'Bidderlist.xlsx';

const MASTER_TEMPLATE_TYPE_BY_FILE_NAME = Object.freeze({
  'bidderlist.xlsx': 'BIDDERLIST',
  'rfq.xlsx': 'RFQ',
  'cqs.xlsx': 'CQS'
});
const MASTER_TEMPLATE_LOAD_INFO = Object.create(null);
const MASTER_TEMPLATE_LOAD_ERRORS = Object.create(null);

function base64ToArrayBuffer(base64Value) {
  const cleanBase64 = String(base64Value || '').replace(/\s+/g, '');
  if (!cleanBase64) throw new Error('Isi master template dari backend kosong.');

  let binary;
  try {
    binary = window.atob(cleanBase64);
  } catch (error) {
    throw new Error('Isi master template dari backend bukan Base64 yang valid.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function fetchDriveMasterTemplate(fileName) {
  const normalizedFileName = String(fileName || '').trim().toLowerCase();
  const templateType = MASTER_TEMPLATE_TYPE_BY_FILE_NAME[normalizedFileName];
  if (!templateType) throw new Error(`Jenis master ${fileName} tidak dikenali.`);

  const url = `${GAS_URL}?action=getMasterTemplate&templateType=${encodeURIComponent(templateType)}&_=${Date.now()}`;
  const response = await fetch(url, { cache: 'no-store' });
  const responseText = await response.text();

  let result;
  try {
    result = JSON.parse(responseText || '{}');
  } catch (error) {
    throw new Error(
      `Respons master ${fileName} dari Apps Script tidak valid. ` +
      `Pastikan Web App sudah dideploy ulang dan dapat diakses.`
    );
  }

  if (!response.ok || !result?.success) {
    throw new Error(result?.message || `Master ${fileName} gagal dibaca dari Google Drive.`);
  }

  const buffer = base64ToArrayBuffer(result.base64);
  const loaded = {
    buffer,
    fileName: String(result.fileName || fileName),
    fileId: String(result.fileId || ''),
    updatedAt: String(result.updatedAt || ''),
    size: Number(result.size || buffer.byteLength || 0),
    source: String(result.source || 'GOOGLE_DRIVE_MASTER_FOLDER'),
    templateType
  };

  MASTER_TEMPLATE_LOAD_INFO[templateType] = loaded;
  delete MASTER_TEMPLATE_LOAD_ERRORS[templateType];
  return loaded;
}

async function validateWorkbookTemplate(arrayBuffer, requiredSheets, label) {
  if (typeof JSZip === 'undefined') {
    throw new Error('Library JSZip belum tersedia untuk memeriksa template XLSX.');
  }
  const zip = await JSZip.loadAsync(arrayBuffer);
  const workbookFile = zip.file('xl/workbook.xml');
  if (!workbookFile) throw new Error(`${label || 'Template'} bukan workbook Excel OOXML yang valid.`);

  const workbookXmlText = await workbookFile.async('string');
  const workbookDoc = new DOMParser().parseFromString(workbookXmlText, 'application/xml');
  if (workbookDoc.querySelector('parsererror')) throw new Error(`Struktur ${label || 'template'} tidak dapat dibaca.`);

  const sheetNames = [...workbookDoc.getElementsByTagName('sheet')]
    .map(sheet => String(sheet.getAttribute('name') || '').trim());
  const missing = (requiredSheets || []).filter(name => !sheetNames.includes(name));
  if (missing.length) throw new Error(`${label || 'Template'} wajib memiliki sheet: ${missing.join(', ')}.`);
  return sheetNames;
}

async function validateBidderListTemplateWorkbook(arrayBuffer) {
  return validateWorkbookTemplate(arrayBuffer, ['BidderList'], 'Master BidderList');
}

function getWorksheetCellNode(sheetDoc, address) {
  return Array.from(sheetDoc.getElementsByTagName('c'))
    .find(cell => String(cell.getAttribute('r') || '').toUpperCase() === String(address || '').toUpperCase()) || null;
}

function getWorksheetCellText(sheetDoc, address) {
  const cell = getWorksheetCellNode(sheetDoc, address);
  if (!cell) return '';

  const inlineText = Array.from(cell.getElementsByTagName('t'))
    .map(node => String(node.textContent || ''))
    .join('');
  if (inlineText) return inlineText;

  const valueNode = cell.getElementsByTagName('v')[0];
  return valueNode ? String(valueNode.textContent || '') : '';
}

async function validateCQSWorkbookTemplate(arrayBuffer) {
  const requiredSheets = ['3V', '4V', '5V', '6V', '7V', '8V', '9V', '10V'];
  await validateWorkbookTemplate(arrayBuffer, requiredSheets, 'Master CQS');

  if (typeof JSZip === 'undefined') {
    throw new Error('Library JSZip belum tersedia untuk memeriksa Master CQS.');
  }

  const zip = await JSZip.loadAsync(arrayBuffer);
  const workbookFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relsFile) throw new Error('Struktur Master CQS tidak lengkap.');

  const workbookXml = await workbookFile.async('string');
  const relsXml = await relsFile.async('string');
  const parser = new DOMParser();
  const invalidSheets = [];

  for (const sheetName of requiredSheets) {
    const vendorCount = Number.parseInt(sheetName, 10);
    const worksheetPath = resolveWorksheetPath(workbookXml, relsXml, sheetName);
    const worksheetFile = zip.file(worksheetPath);
    if (!worksheetFile) {
      invalidSheets.push(`${sheetName} (worksheet tidak ditemukan)`);
      continue;
    }

    const sheetDoc = parser.parseFromString(await worksheetFile.async('string'), 'application/xml');
    if (sheetDoc.querySelector('parsererror')) {
      invalidSheets.push(`${sheetName} (XML rusak)`);
      continue;
    }

    const lastVendorUnitPriceColumn = excelColumnName(9 + ((vendorCount - 1) * 5));
    const lastVendorCompanyColumn = excelColumnName(10 + ((vendorCount - 1) * 5));
    const lastVendorTotalColumn = excelColumnName(10 + ((vendorCount - 1) * 5));
    const requiredCells = [
      'B21', 'C21', 'G21', 'H21', 'B50',
      `${lastVendorCompanyColumn}11`,
      `${lastVendorUnitPriceColumn}21`,
      `${lastVendorUnitPriceColumn}22`,
      `${lastVendorTotalColumn}22`
    ];

    const missingCells = requiredCells.filter(address => !getWorksheetCellNode(sheetDoc, address));
    const totalCell = getWorksheetCellNode(sheetDoc, `${lastVendorTotalColumn}22`);
    const hasTotalFormula = Boolean(totalCell?.getElementsByTagName('f')?.length);

    if (missingCells.length || !hasTotalFormula) {
      invalidSheets.push(
        `${sheetName}${missingCells.length ? ` (sel kosong: ${missingCells.join(', ')})` : ''}${!hasTotalFormula ? ' (formula total vendor terakhir tidak ada)' : ''}`
      );
    }
  }

  if (invalidSheets.length) {
    throw new Error(`Master CQS tidak lengkap pada sheet ${invalidSheets.join('; ')}.`);
  }

  return requiredSheets;
}

async function loadBundledMasterTemplate(fileName, templateType) {
  const templateUrl = new URL(`../Template/${fileName}`, window.location.href).toString();
  const response = await fetch(`${templateUrl}${templateUrl.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Template lokal ${fileName} tidak ditemukan (${response.status}).`);

  const buffer = await response.arrayBuffer();
  const loaded = {
    buffer,
    fileName,
    fileId: '',
    updatedAt: '',
    size: buffer.byteLength,
    source: 'LOCAL_BUNDLED_TEMPLATE',
    templateType
  };
  MASTER_TEMPLATE_LOAD_INFO[templateType] = loaded;
  return loaded;
}

function readXlsxTemplateFile(event, validator, onLoaded) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) {
    alert('Template harus berformat .xlsx tanpa macro.');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const buffer = e.target.result;
      const sheetNames = await validator(buffer);
      onLoaded(buffer, file.name, sheetNames);
    } catch (error) {
      event.target.value = '';
      alert(`Template tidak dapat digunakan: ${error.message || error}`);
    }
  };
  reader.readAsArrayBuffer(file);
}

function loadTemplate(event) {
  readXlsxTemplateFile(event, validateBidderListTemplateWorkbook, (buffer, fileName, sheetNames) => {
    XLSM_TEMPLATE_ARRAY_BUFFER = buffer;
    XLSM_TEMPLATE_FILE_NAME = fileName;
    alert(`Template ${fileName} berhasil dimuat. Sheet tersedia: ${sheetNames.join(', ')}.`);
  });
}

function loadRFQTemplate(event) {
  readXlsxTemplateFile(event, buffer => validateWorkbookTemplate(buffer, ['RFQ'], 'Master RFQ'), (buffer, fileName) => {
    RFQ_TEMPLATE_ARRAY_BUFFER = buffer;
    RFQ_TEMPLATE_FILE_NAME = fileName;
    alert(`Template ${fileName} berhasil dimuat.`);
  });
}

async function loadDefaultTemplate(fileName) {
  const normalizedFileName = String(fileName || '').trim().toLowerCase();
  const templateType = MASTER_TEMPLATE_TYPE_BY_FILE_NAME[normalizedFileName] || normalizedFileName;

  try {
    return await fetchDriveMasterTemplate(fileName);
  } catch (driveError) {
    MASTER_TEMPLATE_LOAD_ERRORS[templateType] = driveError?.message || String(driveError);
    console.warn(`Master ${fileName} dari Google Drive gagal dimuat.`, driveError);

    // Fallback hanya untuk paket yang dijalankan melalui web server/hosting.
    // Pada mode file://, master tetap diambil melalui Apps Script agar user
    // tidak perlu memilih file template dari komputer.
    if (window.location.protocol !== 'file:') {
      try {
        const response = await fetch(fileName, { cache: 'no-store' });
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const loaded = {
            buffer,
            fileName,
            fileId: '',
            updatedAt: '',
            size: buffer.byteLength,
            source: 'LOCAL_BUNDLED_TEMPLATE',
            templateType
          };
          MASTER_TEMPLATE_LOAD_INFO[templateType] = loaded;
          return loaded;
        }
      } catch (localError) {
        console.warn(`Fallback master lokal ${fileName} juga gagal dimuat.`, localError);
      }
    }

    throw new Error(
      `Master ${fileName} tidak dapat dimuat otomatis dari folder Google Drive. ` +
      `${driveError?.message || driveError}`
    );
  }
}

async function initMasterTemplates() {
  try {
    if (!XLSM_TEMPLATE_ARRAY_BUFFER) {
      const loaded = await loadDefaultTemplate('Bidderlist.xlsx');
      await validateBidderListTemplateWorkbook(loaded.buffer);
      XLSM_TEMPLATE_ARRAY_BUFFER = loaded.buffer;
      XLSM_TEMPLATE_FILE_NAME = loaded.fileName || 'Bidderlist.xlsx';
      console.info(`Master BidderList aktif: ${XLSM_TEMPLATE_FILE_NAME} (${loaded.source}).`);
    }
  } catch (error) {
    MASTER_TEMPLATE_LOAD_ERRORS.BIDDERLIST = error?.message || String(error);
    console.warn(error);
  }

  try {
    if (!RFQ_TEMPLATE_ARRAY_BUFFER) {
      const loaded = await loadDefaultTemplate('RFQ.xlsx');
      await validateWorkbookTemplate(loaded.buffer, ['RFQ'], 'Master RFQ');
      RFQ_TEMPLATE_ARRAY_BUFFER = loaded.buffer;
      RFQ_TEMPLATE_FILE_NAME = loaded.fileName || 'RFQ.xlsx';
      console.info(`Master RFQ aktif: ${RFQ_TEMPLATE_FILE_NAME} (${loaded.source}).`);
    }
  } catch (error) {
    MASTER_TEMPLATE_LOAD_ERRORS.RFQ = error?.message || String(error);
    console.warn(error);
  }

  try {
    if (!CQS_TEMPLATE_ARRAY_BUFFER) {
      let loaded = null;
      let driveError = null;

      try {
        loaded = await fetchDriveMasterTemplate('CQS.xlsx');
        await validateCQSWorkbookTemplate(loaded.buffer);
      } catch (error) {
        driveError = error;
        console.warn('Master CQS dari Google Drive tidak lengkap; memakai template CQS bawaan aplikasi.', error);
        loaded = await loadBundledMasterTemplate('CQS.xlsx', 'CQS');
        await validateCQSWorkbookTemplate(loaded.buffer);
      }

      CQS_TEMPLATE_ARRAY_BUFFER = loaded.buffer;
      CQS_TEMPLATE_FILE_NAME = loaded.fileName || 'CQS.xlsx';
      delete MASTER_TEMPLATE_LOAD_ERRORS.CQS;
      console.info(
        `Master CQS aktif: ${CQS_TEMPLATE_FILE_NAME} (${loaded.source}).` +
        (driveError ? ' Template Google Drive dilewati karena tidak lengkap.' : '')
      );
    }
  } catch (error) {
    MASTER_TEMPLATE_LOAD_ERRORS.CQS = error?.message || String(error);
    console.warn(error);
  }
}

function loadCQSTemplate(event) {
  readXlsxTemplateFile(event, validateCQSWorkbookTemplate, (buffer, fileName) => {
    CQS_TEMPLATE_ARRAY_BUFFER = buffer;
    CQS_TEMPLATE_FILE_NAME = fileName;
    MASTER_TEMPLATE_LOAD_INFO.CQS = {
      buffer,
      fileName,
      fileId: '',
      updatedAt: '',
      size: buffer.byteLength,
      source: 'MANUAL_TEMPLATE',
      templateType: 'CQS'
    };
    alert(`Master ${fileName} berhasil dimuat dan seluruh sheet 3V-10V sudah diperiksa.`);
  });
}

function getMetaValue(meta, keys, fallback = '') {
  for (const key of keys) {
    if (meta && meta[key] !== undefined && meta[key] !== null && String(meta[key]).trim() !== '') {
      return meta[key];
    }
  }
  return fallback;
}

function calculateEstPriceRp(meta, usdRate) {
  const estPricePRRaw = getEstPricePRRaw(meta);
  const estPricePR = getEstPricePR(meta);
  const estPriceUSRp = getEstPriceUSRp(meta);

  if (hasRealValue(estPricePRRaw) && estPricePR > 0) {
    return estPricePR * usdRate;
  }

  return estPriceUSRp;
}

function columnNumberFromAddress(address) {
  const letters = String(address).match(/^[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
  let number = 0;
  for (const char of letters) number = number * 26 + char.charCodeAt(0) - 64;
  return number;
}

async function sanitizeXlsxPackage(zip) {
  // calcChain menjadi tidak valid setelah nilai/formula diubah dan dapat memicu Excel Repair.
  zip.remove('xl/calcChain.xml');

  // XLSX web tidak lagi memakai external link ke Admin - RHT.xlsm atau path lokal.
  Object.keys(zip.files || {}).forEach(path => {
    if (path.startsWith('xl/externalLinks/')) zip.remove(path);
  });

  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  const workbookFile = zip.file('xl/workbook.xml');
  if (workbookFile) {
    const doc = parser.parseFromString(await workbookFile.async('string'), 'application/xml');
    if (!doc.querySelector('parsererror')) {
      Array.from(doc.getElementsByTagName('externalReferences')).forEach(node => node.parentNode?.removeChild(node));
      Array.from(doc.getElementsByTagName('definedName')).forEach(node => {
        if (String(node.textContent || '').includes('[')) node.parentNode?.removeChild(node);
      });
      const workbookPr = doc.getElementsByTagName('workbookPr')[0];
      if (workbookPr) workbookPr.setAttribute('updateLinks', 'never');
      const calcPr = doc.getElementsByTagName('calcPr')[0];
      if (calcPr) {
        calcPr.setAttribute('calcMode', 'auto');
        calcPr.setAttribute('fullCalcOnLoad', '1');
        calcPr.setAttribute('forceFullCalc', '1');
      }
      zip.file('xl/workbook.xml', serializer.serializeToString(doc));
    }
  }

  const relsPath = 'xl/_rels/workbook.xml.rels';
  const relsFile = zip.file(relsPath);
  if (relsFile) {
    const doc = parser.parseFromString(await relsFile.async('string'), 'application/xml');
    if (!doc.querySelector('parsererror')) {
      Array.from(doc.getElementsByTagName('Relationship')).forEach(node => {
        const type = String(node.getAttribute('Type') || '');
        if (/\/(calcChain|externalLink)$/i.test(type)) node.parentNode?.removeChild(node);
      });
      zip.file(relsPath, serializer.serializeToString(doc));
    }
  }

  const contentTypesPath = '[Content_Types].xml';
  const contentTypesFile = zip.file(contentTypesPath);
  if (contentTypesFile) {
    const doc = parser.parseFromString(await contentTypesFile.async('string'), 'application/xml');
    if (!doc.querySelector('parsererror')) {
      Array.from(doc.getElementsByTagName('Override')).forEach(node => {
        const partName = String(node.getAttribute('PartName') || '');
        if (partName === '/xl/calcChain.xml' || partName.startsWith('/xl/externalLinks/')) {
          node.parentNode?.removeChild(node);
        }
      });
      zip.file(contentTypesPath, serializer.serializeToString(doc));
    }
  }
}

function resolveWorksheetPath(workbookXmlText, relsXmlText, wantedSheetName) {
  const parser = new DOMParser();
  const workbookDoc = parser.parseFromString(workbookXmlText, 'application/xml');
  const relsDoc = parser.parseFromString(relsXmlText, 'application/xml');

  if (workbookDoc.querySelector('parsererror') || relsDoc.querySelector('parsererror')) {
    throw new Error('Struktur workbook template tidak dapat dibaca.');
  }

  const sheets = [...workbookDoc.getElementsByTagName('sheet')];
  const selectedSheet = sheets.find(sheet => sheet.getAttribute('name') === wantedSheetName) || sheets[0];
  if (!selectedSheet) throw new Error('Template tidak memiliki worksheet.');

  const relationId = selectedSheet.getAttribute('r:id') ||
    selectedSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const relationship = [...relsDoc.getElementsByTagName('Relationship')]
    .find(item => item.getAttribute('Id') === relationId);
  if (!relationship) throw new Error('Relasi worksheet pada template tidak ditemukan.');

  let target = relationship.getAttribute('Target') || '';
  target = target.replace(/^\//, '');
  if (!target.startsWith('xl/')) target = `xl/${target.replace(/^\.\//, '')}`;
  return target;
}


function getOrCreateRow(sheetDoc, rowNumber) {
  const namespace = sheetDoc.documentElement.namespaceURI;
  const sheetData = sheetDoc.getElementsByTagName('sheetData')[0];
  if (!sheetData) throw new Error('Bagian sheetData tidak ditemukan dalam template.');

  let row = [...sheetData.getElementsByTagName('row')]
    .find(item => Number(item.getAttribute('r')) === Number(rowNumber));
  if (row) return row;

  row = sheetDoc.createElementNS(namespace, 'row');
  row.setAttribute('r', String(rowNumber));

  const nextRow = [...sheetData.childNodes].find(node =>
    node.nodeType === 1 && node.localName === 'row' && Number(node.getAttribute('r')) > Number(rowNumber)
  );
  if (nextRow) sheetData.insertBefore(row, nextRow);
  else sheetData.appendChild(row);
  return row;
}

function getOrCreateCell(sheetDoc, address) {
  const namespace = sheetDoc.documentElement.namespaceURI;
  const rowNumber = Number(String(address).match(/\d+$/)?.[0]);
  const row = getOrCreateRow(sheetDoc, rowNumber);

  let cell = [...row.childNodes].find(node =>
    node.nodeType === 1 && node.localName === 'c' && node.getAttribute('r') === address
  );
  if (cell) return cell;

  cell = sheetDoc.createElementNS(namespace, 'c');
  cell.setAttribute('r', address);
  const wantedColumn = columnNumberFromAddress(address);
  const nextCell = [...row.childNodes].find(node =>
    node.nodeType === 1 && node.localName === 'c' &&
    columnNumberFromAddress(node.getAttribute('r') || 'A1') > wantedColumn
  );
  if (nextCell) row.insertBefore(cell, nextCell);
  else row.appendChild(cell);
  return cell;
}

function setWorksheetCellValue(sheetDoc, address, value, type = 'string') {
  const namespace = sheetDoc.documentElement.namespaceURI;
  const cell = getOrCreateCell(sheetDoc, address);

  // Style (atribut s), format, merge, lebar kolom, tinggi baris, dan objek lain tidak disentuh.
  [...cell.childNodes].forEach(child => {
    if (child.nodeType === 1 && ['v', 'f', 'is'].includes(child.localName)) cell.removeChild(child);
  });

  // Sel input numerik CQS yang tidak memiliki nilai harus benar-benar kosong.
  // Menulis "" sebagai inline string membuat formula perkalian Excel membaca
  // operand sebagai teks dan dapat menghasilkan #VALUE!.
  if (type === 'blank') {
    cell.removeAttribute('t');
    return;
  }

  if (type === 'boolean') {
    cell.setAttribute('t', 'b');
    const valueNode = sheetDoc.createElementNS(namespace, 'v');
    valueNode.textContent = value ? '1' : '0';
    cell.appendChild(valueNode);
    return;
  }

  if (['number', 'decimal'].includes(type) && Number.isFinite(Number(value))) {
    cell.removeAttribute('t');
    const valueNode = sheetDoc.createElementNS(namespace, 'v');
    valueNode.textContent = type === 'decimal'
      ? String(Number(value))
      : String(Math.round(Number(value)));
    cell.appendChild(valueNode);
    return;
  }

  cell.setAttribute('t', 'inlineStr');
  const inlineString = sheetDoc.createElementNS(namespace, 'is');
  const textNode = sheetDoc.createElementNS(namespace, 't');
  textNode.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  textNode.textContent = value == null ? '' : String(value);
  inlineString.appendChild(textNode);
  cell.appendChild(inlineString);
}

function setWorksheetCellFormula(sheetDoc, address, formula) {
  const namespace = sheetDoc.documentElement.namespaceURI;
  const cell = getOrCreateCell(sheetDoc, address);
  [...cell.childNodes].forEach(child => {
    if (child.nodeType === 1 && ['v', 'f', 'is'].includes(child.localName)) cell.removeChild(child);
  });
  cell.removeAttribute('t');
  const formulaNode = sheetDoc.createElementNS(namespace, 'f');
  formulaNode.textContent = String(formula || '').replace(/^=/, '');
  cell.appendChild(formulaNode);
}

function clearWorksheetCellValue(sheetDoc, address) {
  const cell = getOrCreateCell(sheetDoc, address);
  [...cell.childNodes].forEach(child => {
    if (child.nodeType === 1 && ['v', 'f', 'is'].includes(child.localName)) cell.removeChild(child);
  });
  cell.removeAttribute('t');
}

function columnLettersFromNumber(number) {
  let value = Number(number) || 1;
  let letters = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

function parseWorksheetRange(rangeRef) {
  const [startRef, endRef = startRef] = String(rangeRef || '').toUpperCase().split(':');
  const parseAddress = address => ({
    column: columnNumberFromAddress(address),
    row: Number(String(address).match(/\d+$/)?.[0] || 1)
  });
  const start = parseAddress(startRef);
  const end = parseAddress(endRef);
  return {
    startColumn: Math.min(start.column, end.column),
    endColumn: Math.max(start.column, end.column),
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row)
  };
}

function worksheetRangesOverlap(firstRef, secondRef) {
  const first = parseWorksheetRange(firstRef);
  const second = parseWorksheetRange(secondRef);
  return !(
    first.endColumn < second.startColumn ||
    second.endColumn < first.startColumn ||
    first.endRow < second.startRow ||
    second.endRow < first.startRow
  );
}

function getOrCreateMergeCells(sheetDoc) {
  const namespace = sheetDoc.documentElement.namespaceURI;
  let mergeCells = sheetDoc.getElementsByTagName('mergeCells')[0];
  if (mergeCells) return mergeCells;

  mergeCells = sheetDoc.createElementNS(namespace, 'mergeCells');
  const sheetData = sheetDoc.getElementsByTagName('sheetData')[0];
  if (!sheetData) throw new Error('Bagian sheetData tidak ditemukan saat membuat merge.');
  if (sheetData.nextSibling) sheetData.parentNode.insertBefore(mergeCells, sheetData.nextSibling);
  else sheetData.parentNode.appendChild(mergeCells);
  return mergeCells;
}

function ensureWorksheetMergedRange(sheetDoc, rangeRef) {
  const namespace = sheetDoc.documentElement.namespaceURI;
  const mergeCells = getOrCreateMergeCells(sheetDoc);
  [...mergeCells.childNodes]
    .filter(node => node.nodeType === 1 && node.localName === 'mergeCell')
    .forEach(node => {
      const existingRef = node.getAttribute('ref') || '';
      if (existingRef !== rangeRef && worksheetRangesOverlap(existingRef, rangeRef)) {
        mergeCells.removeChild(node);
      }
    });

  const exists = [...mergeCells.childNodes].some(node =>
    node.nodeType === 1 && node.localName === 'mergeCell' && node.getAttribute('ref') === rangeRef
  );
  if (!exists) {
    const mergeCell = sheetDoc.createElementNS(namespace, 'mergeCell');
    mergeCell.setAttribute('ref', rangeRef);
    mergeCells.appendChild(mergeCell);
  }
  mergeCells.setAttribute('count', String(
    [...mergeCells.childNodes].filter(node => node.nodeType === 1 && node.localName === 'mergeCell').length
  ));
}

function clearMergedRangeExceptTopLeft(sheetDoc, rangeRef) {
  const range = parseWorksheetRange(rangeRef);
  for (let row = range.startRow; row <= range.endRow; row++) {
    for (let column = range.startColumn; column <= range.endColumn; column++) {
      if (row === range.startRow && column === range.startColumn) continue;
      clearWorksheetCellValue(sheetDoc, `${columnLettersFromNumber(column)}${row}`);
    }
  }
}


function getWorksheetMergedRanges(sheetDoc) {
  const mergeCells = sheetDoc.getElementsByTagName('mergeCells')[0];
  if (!mergeCells) return [];
  return [...mergeCells.childNodes]
    .filter(node => node.nodeType === 1 && node.localName === 'mergeCell')
    .map(node => String(node.getAttribute('ref') || '').toUpperCase())
    .filter(Boolean);
}

function detectRFQTemplateWorkspaceLayout(sheetDoc) {
  const mergedRanges = getWorksheetMergedRanges(sheetDoc);

  // Cari blok Franco/Location Delivery: merge vertikal kolom A dan blok alamat
  // kolom B:D dengan start row yang sama. Dua master yang aktif saat ini:
  // - compact  : A28:A31 + B28:D31
  // - extended : A31:A34 + B31:D34
  const verticalA = mergedRanges
    .map(ref => ({ ref, range: parseWorksheetRange(ref) }))
    .filter(item =>
      item.range.startColumn === 1 &&
      item.range.endColumn === 1 &&
      item.range.startRow >= 25 &&
      item.range.startRow <= 40 &&
      item.range.endRow - item.range.startRow >= 2
    )
    .sort((a, b) => a.range.startRow - b.range.startRow);

  let francoStartRow = 31;
  let francoEndRow = 34;
  for (const candidate of verticalA) {
    const hasAddressMerge = mergedRanges.some(ref => {
      const range = parseWorksheetRange(ref);
      return range.startColumn === 2 &&
        range.endColumn === 4 &&
        range.startRow === candidate.range.startRow &&
        range.endRow === candidate.range.endRow;
    });
    if (hasAddressMerge) {
      francoStartRow = candidate.range.startRow;
      francoEndRow = candidate.range.endRow;
      break;
    }
  }

  return {
    mandatoryRow: francoStartRow - 3,
    termsHeaderRow: francoStartRow - 2,
    termsBodyRow: francoStartRow - 1,
    francoStartRow,
    francoEndRow,
    deliveryCell: `B${francoStartRow}`
  };
}

function applyRFQTemplateWorkspaceLayout(sheetDoc) {
  const layout = detectRFQTemplateWorkspaceLayout(sheetDoc);
  const mandatorySnapshot = getSelectedRFQRequirementsForTemplate().join('\n');
  const termsSnapshot = getSelectedRFQTermsForTemplate().join('\n');
  const rfqMeta = DATA?.structured?.RFQ?.meta || {};
  const deliveryLocation = String(rfqMeta.delivery_location || selectedDelivery || 'msw')
    .trim()
    .toLowerCase() === 'ibt'
      ? 'ibt'
      : 'msw';
  const delivery = getRFQDeliveryAddress(rfqMeta, deliveryLocation);

  // Mapping otomatis sesuai master RFQ.xlsx:
  // compact  : Mandatory A25:D25, header A26:D26, T&C A27:D27,
  //            Franco A28:A31, alamat B28:D31.
  // extended : Mandatory A28:D28, header A29:D29, T&C A30:D30,
  //            Franco A31:A34, alamat B31:D34.
  setWorksheetCellValue(sheetDoc, `A${layout.mandatoryRow}`, mandatorySnapshot, 'string');
  setWorksheetCellValue(sheetDoc, `A${layout.termsHeaderRow}`, 'Terms and Conditions', 'string');
  setWorksheetCellValue(sheetDoc, `A${layout.termsBodyRow}`, termsSnapshot, 'string');
  setWorksheetCellValue(sheetDoc, `A${layout.francoStartRow}`, 'Franco', 'string');
  setWorksheetCellValue(sheetDoc, layout.deliveryCell, delivery, 'string');

  return { ...layout, mandatorySnapshot, termsSnapshot, delivery };
}

function calculateAdaptiveRowHeight(value, options = {}) {
  const charactersPerLine = Math.max(12, Number(options.charactersPerLine || 60));
  const minimum = Math.max(15, Number(options.minimum || 24));
  const maximum = Math.max(minimum, Number(options.maximum || 220));
  const lineHeight = Math.max(10, Number(options.lineHeight || 15));
  const padding = Math.max(0, Number(options.padding || 10));
  const lineCount = estimateWrappedTextLineCount(value, charactersPerLine);
  return Math.min(maximum, Math.max(minimum, padding + (lineCount * lineHeight)));
}

function applyRFQDynamicRowHeights(sheetDoc, layout) {
  if (!layout) return;

  // Description item RFQ: format, merge, font, border dan lebar kolom tetap
  // dari master. Hanya tinggi baris file hasil yang menyesuaikan isi aktual.
  const items = DATA?.structured?.RFQ?.items || [];
  for (let index = 0; index < 10; index++) {
    const rowNumber = 5 + index;
    const item = items[index] || {};
    const description = String(getRFQRowValue(item, ['Description']) || '');
    const itemNumber = String(getRFQRowValue(item, ['Item Number']) || '');
    if (!description.trim() && !itemNumber.trim()) continue;
    setWorksheetRowHeight(sheetDoc, rowNumber, calculateAdaptiveRowHeight(description, {
      charactersPerLine: 52, minimum: 28, maximum: 180, lineHeight: 15, padding: 10
    }));
  }

  const hasMandatoryContent = Boolean(String(layout.mandatorySnapshot || '').trim());
  setWorksheetRowHidden(sheetDoc, layout.mandatoryRow, !hasMandatoryContent);
  if (hasMandatoryContent) {
    setWorksheetRowHeight(sheetDoc, layout.mandatoryRow, calculateAdaptiveRowHeight(
      layout.mandatorySnapshot,
      { charactersPerLine: 92, minimum: 30, maximum: 170, lineHeight: 15, padding: 10 }
    ));
  }

  // Header Terms & Conditions tetap ringkas; body-nya menyesuaikan jumlah
  // ketentuan terpilih dan panjang kalimat.
  setWorksheetRowHidden(sheetDoc, layout.termsHeaderRow, false);
  setWorksheetRowHidden(sheetDoc, layout.termsBodyRow, false);
  setWorksheetRowHeight(sheetDoc, layout.termsHeaderRow, 22);
  setWorksheetRowHeight(sheetDoc, layout.termsBodyRow, calculateAdaptiveRowHeight(
    layout.termsSnapshot,
    { charactersPerLine: 92, minimum: 48, maximum: 300, lineHeight: 14, padding: 12 }
  ));

  // Area Franco/Location Delivery adalah merge lintas beberapa baris. Total
  // tinggi dihitung dari alamat, lalu dibagi merata ke baris merge tersebut.
  const startRow = Number(layout.francoStartRow || 31);
  const endRow = Math.max(startRow, Number(layout.francoEndRow || startRow));
  const rowCount = Math.max(1, endRow - startRow + 1);
  const totalDeliveryHeight = calculateAdaptiveRowHeight(layout.delivery, {
    charactersPerLine: 62, minimum: 64, maximum: 190, lineHeight: 15, padding: 14
  });
  const perRowHeight = Math.max(18, totalDeliveryHeight / rowCount);
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber++) {
    setWorksheetRowHeight(sheetDoc, rowNumber, perRowHeight);
  }
}


function getRFQRowValue(row, aliases, fallback = '') {
  if (!row || typeof row !== 'object') return fallback;
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
      return row[alias];
    }
  }
  const wanted = aliases.map(normalizeTextKey);
  for (const [key, value] of Object.entries(row)) {
    if (wanted.includes(normalizeTextKey(key)) && value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return fallback;
}

function excelSerialFromDate(value) {
  const parsed = parseMetaDate(value);
  if (!(parsed instanceof Date) || isNaN(parsed.getTime())) return '';
  const utc = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.floor((utc - Date.UTC(1899, 11, 30)) / 86400000);
}

function createTemplateCellUpdates(meta, rows, estPriceRp) {
  const updates = [
    ['B8', getMetaValue(meta, ['description', 'Description']), 'string'],
    ['N8', estPriceRp, 'number'],
    ['Q8', getMetaValue(meta, ['cost_center']), 'string'],
    ['R8', getMetaValue(meta, ['type_quotation', 'pengadaan', 'Pengadaan']), 'string'],
    ['B32', `Previous Winner PO:\n${getMetaValue(meta, ['previous_winner_po'], 'None') || 'None'}`, 'string'],
    ['J32', `Previous Vendor Quote:\n${getMetaValue(meta, ['previous_vendor_quote'], 'None') || 'None'}`, 'string'],
    ['O32', `Description Cost Center:\n${getMetaValue(meta, ['cost_center_detail'], '') || ''}\n\nPIC User: ${getMetaValue(meta, ['pic'], 'None') || 'None'}`, 'string']
  ];

  const startRow = 12;
  const vendorNameCount = rows.reduce((count, row) =>
    count + (String(row?.['Name of Invited Supplier'] || '').trim() ? 1 : 0), 0
  );
  // Nomor line pada file hasil selalu terlihat minimal 1-10. Jika vendor
  // lebih dari 10, nomor mengikuti jumlah vendor aktual sampai kapasitas 20.
  const visibleVendorLineCount = Math.min(20, Math.max(10, vendorNameCount));
  // Seluruh 20 row native tetap dibersihkan/diisi agar data lama tidak
  // tertinggal. Jumlah row yang terlihat ditentukan saat file dibangun:
  // minimum 10 line atau mengikuti jumlah vendor aktual sampai 20.
  const BIDDERLIST_ROW_COUNT = 20;
  for (let i = 0; i < BIDDERLIST_ROW_COUNT; i++) {
    const rowNumber = startRow + i;
    const row = rows[i] || {};
    const isVisibleLine = i < visibleVendorLineCount;
    const acceptedDate = excelSerialFromDate(row['Accepted Date']);
    const remarks = [row.Notes, row.Remarks].filter(value => String(value || '').trim()).join(' | ');
    updates.push(
      [`A${rowNumber}`, isVisibleLine ? i + 1 : '', isVisibleLine ? 'number' : 'blank'],
      [`B${rowNumber}`, row['No Company'] || row.noCompany || '', 'string'],
      [`C${rowNumber}`, row['Name of Invited Supplier'] || '', 'string'],
      [`D${rowNumber}`, row['Contact Person'] || '', 'string'],
      [`F${rowNumber}`, String(row['No Telp'] || ''), 'string'],
      [`J${rowNumber}`, row['Email'] || '', 'string'],
      [`L${rowNumber}`, row['Company Status'] || '', 'string'],
      [`M${rowNumber}`, row['Register Status'] || '', 'string'],
      [`N${rowNumber}`, acceptedDate || row['Accepted Date'] || '', acceptedDate ? 'number' : 'string'],
      [`O${rowNumber}`, row.Time || '', 'string'],
      // Kolom P memiliki formula Qualified/Disqualified native; tidak ditimpa.
      [`Q${rowNumber}`, remarks, 'string']
    );
  }
  return updates;
}

function applyBidderListTemplateLayout(sheetDoc, meta) {
  const noPR = getMetaValue(meta, ['nopr', 'no_pr', 'No PR']);
  const noPRWithRound = `${noPR || ''}${getDocumentRoundSuffix(meta)}`.trim();
  const noRFQ = formatRFQDisplayFromMeta(meta);
  const openSerial = excelSerialFromDate(getMetaValue(meta, ['open_date', 'Open Date']));
  const closeSerial = excelSerialFromDate(getMetaValue(meta, ['close_date', 'Close Date']));

  // Mengikuti merge dan style yang sudah ada pada Bidderlist.xlsx; tidak membuat merge baru.
  setWorksheetCellValue(sheetDoc, 'B7', noPRWithRound, 'string');
  setWorksheetCellValue(sheetDoc, 'F7', `No RFQ : ${noRFQ || ''}`.trim(), 'string');
  if (openSerial) setWorksheetCellValue(sheetDoc, 'N7', openSerial, 'number');
  else clearWorksheetCellValue(sheetDoc, 'N7');
  if (closeSerial) setWorksheetCellValue(sheetDoc, 'P7', closeSerial, 'number');
  else clearWorksheetCellValue(sheetDoc, 'P7');
}

function getSelectedRFQRequirementsForTemplate() {
  ensureRFQSelectionState();
  const requirements = DATA?.structured?.RFQ?.requirements || [];
  return (Array.isArray(requirements) ? requirements : [])
    .filter(row => row && normalizeChecklistValue(row.Checklist))
    .map(row => String(row.Requirement || '').trim())
    .filter(Boolean);
}

function getSelectedRFQTermsForTemplate() {
  ensureRFQSelectionState();
  const rfq = DATA?.structured?.RFQ || {};
  const selections = Array.isArray(rfq.termSelections) ? rfq.termSelections : [];
  return (Array.isArray(rfq.terms) ? rfq.terms : [])
    .map((text, index) => ({ text: String(text || '').trim(), index }))
    .filter(item => item.text && !isTermsHeading(item.text) && !isFrancoTerm(item.text) && selections[item.index] !== false)
    .map(item => item.text);
}

function resolveRFQBudgetIdr(row) {
  const idrRaw = getRFQRowValue(row, [
    'Est. Budget PR IDR', 'Convert IDR', 'Estimated Budget IDR'
  ]);
  const idr = parseCurrencyNumber(idrRaw);
  if (String(idrRaw || '').trim() && idr >= 0) return idr;

  const automaticIdr = calculateRFQBudgetIdrAuto(row);
  return automaticIdr > 0 ? automaticIdr : '';
}

function createRFQTemplateCellUpdates(meta, items) {
  const updates = [
    ['A3', buildDocumentBaseName('RFQ'), 'string'],
    ['E4', 'Previous Price', 'string'],
    ['F4', 'Date', 'string'],
    ['G4', 'No Company', 'string'],
    ['H4', 'Company Name', 'string'],
    ['I4', 'Est. Budget PR USD', 'string'],
    ['J4', 'Est. Budget PR IDR', 'string'],
    ['K4', 'Item Number', 'string'],
    ['L4', 'Commodity WHS', 'string'],
    ['M4', 'Previous Company', 'string']
  ];

  // Native RFQ.xlsx menyediakan 20 baris item pada row 5-24, tapi workspace
  // web sekarang membatasi tampilan/isi tetap 10 baris walau data di bawah 10.
  const RFQ_ROW_COUNT = 10;
  for (let index = 0; index < RFQ_ROW_COUNT; index++) {
    const rowNumber = 5 + index;
    const row = items[index] || {};
    const itemNumber = String(getRFQRowValue(row, ['Item Number']) || '').trim();
    const hasDescription = Boolean(String(getRFQRowValue(row, ['Description']) || '').trim());
    const hasMainItem = hasDescription || Boolean(itemNumber);

    const qtyRaw = getRFQRowValue(row, ['Qty', 'Quantity']);
    const previousPriceRaw = getRFQRowValue(row, ['Previous Price', 'Previous Unit Price']);
    const previousPriceValue = String(previousPriceRaw).trim() !== ''
      ? parseCurrencyNumber(previousPriceRaw)
      : '';
    const usdRaw = getRFQRowValue(row, [
      'Est. Budget PR USD', 'USD PR', 'Estimated Budget USD'
    ]);
    const usdValue = String(usdRaw).trim() !== '' ? parseCurrencyNumber(usdRaw) : '';
    const idrValue = resolveRFQBudgetIdr(row);

    updates.push(
      [`A${rowNumber}`, hasMainItem ? getRFQRowValue(row, ['No'], index + 1) : '', hasMainItem ? 'number' : 'string'],
      [`B${rowNumber}`, getRFQRowValue(row, ['Description']), 'string'],
      [`C${rowNumber}`, qtyRaw, String(qtyRaw).trim() !== '' && Number.isFinite(Number(qtyRaw)) ? 'number' : 'string'],
      [`D${rowNumber}`, getRFQRowValue(row, ['Ord Unit', 'Unit']), 'string'],

      // Kolom E-M adalah snapshot referensi internal. Ukuran/format kolom native tidak diubah.
      [`E${rowNumber}`, itemNumber && previousPriceValue !== '' ? previousPriceValue : '', itemNumber && previousPriceValue !== '' ? 'decimal' : 'string'],
      [`F${rowNumber}`, itemNumber ? getRFQRowValue(row, ['Date', 'Previous Date']) : '', 'string'],
      [`G${rowNumber}`, itemNumber ? getRFQRowValue(row, ['No Company']) : '', 'string'],
      [`H${rowNumber}`, itemNumber ? getRFQRowValue(row, ['Company Name']) : '', 'string'],
      [`I${rowNumber}`, usdValue !== '' ? usdValue : '', usdValue !== '' ? 'decimal' : 'string'],
      [`J${rowNumber}`, idrValue !== '' ? idrValue : '', idrValue !== '' ? 'decimal' : 'string'],
      [`K${rowNumber}`, itemNumber, 'string'],
      [`L${rowNumber}`, itemNumber ? getRFQRowValue(row, ['Commodity WHS']) : '', 'string'],
      [`M${rowNumber}`, itemNumber ? getRFQRowValue(row, ['Previous Company']) : '', 'string']
    );
  }

  // Mandatory Requirements, Terms & Conditions, dan Location Delivery
  // ditulis secara dinamis setelah struktur merge RFQ.xlsx dibaca. Master RFQ
  // di Google Drive dapat memakai layout compact (A25/A27/B28) atau layout
  // extended (A28/A30/B31), sehingga alamat sel tidak boleh di-hard-code.
  return updates;
}

async function patchSingleSheetTemplate(templateBuffer, sheetName, updates, options = {}) {
  const zip = await JSZip.loadAsync(templateBuffer);
  const workbookFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relsFile) throw new Error('File bukan workbook Excel OOXML yang valid.');

  const workbookXmlText = await workbookFile.async('string');
  const relsXmlText = await relsFile.async('string');
  const worksheetPath = resolveWorksheetPath(workbookXmlText, relsXmlText, sheetName);
  const worksheetFile = zip.file(worksheetPath);
  if (!worksheetFile) throw new Error(`Worksheet tidak ditemukan: ${sheetName}`);

  const parser = new DOMParser();
  const sheetDoc = parser.parseFromString(await worksheetFile.async('string'), 'application/xml');
  if (sheetDoc.querySelector('parsererror')) throw new Error(`XML worksheet ${sheetName} tidak dapat dibaca.`);
  updates.forEach(([address, value, type]) => setWorksheetCellValue(sheetDoc, address, value, type));
  if (String(sheetName || '').trim().toUpperCase() === 'RFQ') {
    const rfqLayout = applyRFQTemplateWorkspaceLayout(sheetDoc);
    applyRFQDynamicRowHeights(sheetDoc, rfqLayout);
  }
  const hiddenRows = Array.isArray(options.hiddenRows) ? options.hiddenRows.map(Number) : [];
  for (let rowNumber = 1; rowNumber <= 200; rowNumber++) {
    if (hiddenRows.includes(rowNumber)) setWorksheetRowHidden(sheetDoc, rowNumber, true);
  }
  zip.file(worksheetPath, new XMLSerializer().serializeToString(sheetDoc));
  await sanitizeXlsxPackage(zip);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

async function buildBidderListXlsxDocument(options = {}) {
  const shouldDownload = options.download === true;
  const shouldUpload = options.upload !== false;

  if (typeof JSZip === 'undefined') throw new Error('Library JSZip belum tersedia.');
  if (!XLSM_TEMPLATE_ARRAY_BUFFER) await initMasterTemplates();
  if (!XLSM_TEMPLATE_ARRAY_BUFFER) throw new Error('Master Bidderlist.xlsx belum tersedia.');

  const bidder = DATA.structured.BidderList || {};
  const meta = bidder.meta || {};
  const rows = bidder.rows || [];
  if (!String(meta.nopr || '').trim()) throw new Error('No PR wajib diisi sebelum membuat BidderList.');

  const usdRate = getCurrentUsdIdrRate();
  const estPriceRp = calculateEstPriceRp(meta, usdRate);

  const zip = await JSZip.loadAsync(XLSM_TEMPLATE_ARRAY_BUFFER);
  const workbookFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relsFile) throw new Error('Master BidderList bukan workbook OOXML yang valid.');

  const workbookXmlText = await workbookFile.async('string');
  const relsXmlText = await relsFile.async('string');
  const worksheetPath = resolveWorksheetPath(workbookXmlText, relsXmlText, 'BidderList');
  const worksheetFile = zip.file(worksheetPath);
  if (!worksheetFile) throw new Error('Sheet BidderList tidak ditemukan.');

  const parser = new DOMParser();
  const sheetDoc = parser.parseFromString(await worksheetFile.async('string'), 'application/xml');
  if (sheetDoc.querySelector('parsererror')) throw new Error('XML sheet BidderList tidak dapat dibaca.');

  applyBidderListTemplateLayout(sheetDoc, meta);
  createTemplateCellUpdates(meta, rows, estPriceRp).forEach(([address, value, type]) => {
    setWorksheetCellValue(sheetDoc, address, value, type);
  });

  // BidderList selalu menampilkan minimum 10 line. Jika vendor lebih dari
  // 10, line bertambah sampai jumlah vendor aktual (maksimum native 20).
  // Row kosong selebihnya disembunyikan pada file hasil dan otomatis sama
  // saat dilihat melalui iframe Drive Preview.
  const vendorNameCount = rows.reduce((count, row) =>
    count + (String(row?.['Name of Invited Supplier'] || '').trim() ? 1 : 0), 0
  );
  // Minimum 10 line; setelah itu mengikuti jumlah nama vendor aktual.
  // Contoh: 8 vendor = 10 line, 10 vendor = 10 line, 12 vendor = 12 line.
  const visibleVendorLineCount = Math.min(20, Math.max(10, vendorNameCount));
  const lastVisibleVendorRow = 11 + visibleVendorLineCount;

  for (let rowNumber = 12; rowNumber <= 31; rowNumber++) {
    setWorksheetRowHidden(sheetDoc, rowNumber, rowNumber > lastVisibleVendorRow);
  }

  // Border penutup native berada pada row 31. Saat row 31 disembunyikan,
  // presentasinya dipindahkan ke line terakhir yang terlihat agar tabel
  // tetap tertutup rapi tanpa menampilkan seluruh 20 line.
  if (lastVisibleVendorRow < 31) {
    copyWorksheetRowPresentation(sheetDoc, 31, lastVisibleVendorRow, 18);
  }

  zip.file(worksheetPath, new XMLSerializer().serializeToString(sheetDoc));
  await sanitizeXlsxPackage(zip);

  const output = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  const fileName = `${buildDocumentBaseName('BIDDERLIST')}.xlsx`;
  const blob = new Blob([output], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  if (shouldDownload) downloadBlob(blob, fileName);

  let uploadResult = { skipped: true };
  if (shouldUpload) {
    uploadResult = await uploadBlobToProcurementFolder(blob, 'BIDDERLIST', fileName);
    if (!uploadResult?.success) {
      throw new Error(uploadResult?.message || 'BidderList berhasil dibuat tetapi gagal disimpan ke folder 02. Bidderlist.');
    }
  }

  return { blob, fileName, uploadResult };
}

async function exportBidderListToXlsxTemplate() {
  return saveBidderListAs();
}

async function saveBidderListAs() {
  try {
    const result = await buildBidderListXlsxDocument({ download: false, upload: false });
    const saved = await saveBlobToLocalDrive(result.blob, result.fileName, 'BIDDERLIST');
    if (saved?.saved) {
      alert(`BidderList berhasil disimpan ke Storage Location:\n${saved.path}`);
    }
  } catch (error) {
    console.error('Gagal menjalankan BidderList Save As:', error);
    alert(`Gagal menjalankan BidderList Save As: ${error.message || error}`);
  }
}

async function buildRFQXlsxDocument(options = {}) {
  const shouldDownload = options.download === true;
  const shouldUpload = options.upload !== false;

  if (typeof JSZip === 'undefined') throw new Error('Library JSZip belum tersedia.');
  if (!RFQ_TEMPLATE_ARRAY_BUFFER) await initMasterTemplates();
  if (!RFQ_TEMPLATE_ARRAY_BUFFER) throw new Error('Master RFQ.xlsx belum tersedia.');
  if (!hasRFQDescriptionItems()) throw new Error('Isi minimal satu Description pada RFQ sebelum membuat dokumen.');

  const items = DATA?.structured?.RFQ?.items || [];
  const lastItemIndex = Math.min(19, items.reduce((last, item, index) =>
    String(item?.Description || item?.['Item Number'] || '').trim() ? index : last, -1
  ));
  const usedItemCount = lastItemIndex + 1;
  const hiddenRows = [];
  for (let rowNumber = 5 + usedItemCount; rowNumber <= 24; rowNumber++) hiddenRows.push(rowNumber);

  // Snapshot native: nilai sel dan hidden row item kosong berubah. Tinggi row
  // Description/Mandatory/Terms/Franco menyesuaikan isi aktual; lebar kolom,
  // merge, font, warna, border, print area, dan page setup tetap dari RFQ.xlsx.
  const output = await patchSingleSheetTemplate(
    RFQ_TEMPLATE_ARRAY_BUFFER,
    'RFQ',
    createRFQTemplateCellUpdates(getBidderMeta(), items),
    { hiddenRows }
  );
  const fileName = `${buildDocumentBaseName('RFQ')}.xlsx`;
  const blob = new Blob([output], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  if (shouldDownload) downloadBlob(blob, fileName);

  let uploadResult = { skipped: true };
  if (shouldUpload) {
    uploadResult = await uploadBlobToProcurementFolder(blob, 'RFQ', fileName);
    if (!uploadResult?.success) {
      throw new Error(uploadResult?.message || 'RFQ berhasil dibuat tetapi gagal disimpan ke folder 01. PR Approval.');
    }
  }
  return { blob, fileName, uploadResult };
}

// Alias lama dipertahankan agar tombol/cache lama tidak error. PDF dicetak dari
// Microsoft Excel Desktop (Adobe PDF atau Microsoft Print to PDF).
async function buildRFQPdfDocument(options = {}) {
  return buildRFQXlsxDocument(options);
}

async function exportRFQToXlsxTemplate() {
  return saveRFQAs();
}

async function saveRFQAs() {
  try {
    const result = await buildRFQXlsxDocument({ download: false, upload: false });
    const saved = await saveBlobToLocalDrive(result.blob, result.fileName, 'RFQ');
    if (saved?.saved) {
      alert(`RFQ berhasil disimpan ke Storage Location:\n${saved.path}`);
    }
    return result;
  } catch (error) {
    console.error('Gagal menjalankan RFQ Save As:', error);
    alert(`Gagal menjalankan RFQ Save As: ${error.message || error}`);
    throw error;
  }
}

async function exportRFQToPDF() {
  return exportRFQToXlsxTemplate();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || '').split(',').pop());
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Export otomatis ke PDF (tanpa perlu buka Excel Desktop). Berlaku untuk
// Bidderlist, RFQ, dan CQS -- panggil dengan documentType yang sesuai.
// Prasyarat backend: lihat komentar exportXlsxAsPdf_ di codegs.js
// (Drive API advanced service harus diaktifkan).
async function exportDocumentToPdf(documentType) {
  const meta = getBidderMeta();
  let blob, fileName;

  if (documentType === 'BIDDERLIST') {
    ({ blob, fileName } = await buildBidderListXlsxDocument({ download: false, upload: false }));
  } else if (documentType === 'RFQ') {
    ({ blob, fileName } = await buildRFQXlsxDocument({ download: false, upload: false }));
  } else if (documentType === 'CQS') {
    ({ blob, fileName } = await buildCQSXlsxDocument({ download: false, upload: false }));
  } else {
    throw new Error(`documentType tidak dikenal: ${documentType}`);
  }

  const base64 = await blobToBase64(blob);
  const response = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'exportPdf',
      documentType,
      fileName: fileName.replace(/\.xlsx$/i, ''),
      fileData: base64,
      noPR: meta.nopr,
      description: meta.description,
      rounds: [getDocumentRound(meta)]
    })
  });

  const result = JSON.parse((await response.text()) || '{}');
  if (!result.success) throw new Error(result.message || 'Gagal membuat PDF.');

  if (result.base64 && !result.fileUrl) {
    const pdfBlob = new Blob([base64ToArrayBuffer(result.base64)], { type: 'application/pdf' });
    downloadBlob(pdfBlob, `${fileName.replace(/\.xlsx$/i, '')}.pdf`);
  }
  return result;
}

// Membuat Outlook Draft (.eml) tanpa Power Automate Premium.
// Draft menyertakan To, CC, Subject, Body, dan attachment lalu dibuka
// oleh Buyer melalui Outlook Classic untuk pemeriksaan sebelum Send.
async function openSendVendorEmailDialog() {
  const meta = getBidderMeta();
  const rows = (DATA?.structured?.BidderList?.rows || []).filter(row => String(row?.Email || '').trim());
  const to = rows.map(row => String(row.Email || '').trim());

  if (!to.length) {
    alert('Tidak ada email vendor yang terisi di Bidderlist saat ini.');
    return;
  }

  const subject = window.prompt('Subjek email:', `RFQ ${formatRFQDisplayFromMeta(meta) || ''} - ${meta.description || ''}`.trim());
  if (subject === null) return;

  const bodyHtml = `<p>Yth. Bapak/Ibu,</p><p>Terlampir dokumen RFQ untuk pengadaan <strong>${escapeHtml(meta.description || '')}</strong>. Mohon dapat mengirimkan penawaran sesuai batas waktu yang tercantum.</p><p>Terima kasih.</p>`;

  try {
    const result = await sendVendorEmailWithConfirmation({
      to,
      subject,
      bodyHtml,
      attachmentDocs: [{ documentType: 'RFQ' }]
    });
    alert(result.message);
  } catch (error) {
    alert(`Gagal membuat Outlook Draft: ${error.message || error}`);
  }
}

async function sendVendorEmailWithConfirmation({ to, cc, subject, bodyHtml, attachmentDocs = [] }) {
  const previewText =
    `Buat Outlook Draft untuk:\n${(to || []).join(', ')}\n\n` +
    `Subjek: ${subject}\n\n` +
    `Lampiran: ${attachmentDocs.map(a => a.documentType).join(', ') || '(tidak ada)'}\n\n` +
    `Klik OK untuk membuat file draft .eml. Email belum akan terkirim otomatis.`;

  if (!window.confirm(previewText)) {
    return { success: false, sent: false, message: 'Pembuatan draft dibatalkan pengguna.' };
  }

  const attachments = [];
  for (const doc of attachmentDocs) {
    let blob, fileName;
    if (doc.documentType === 'BIDDERLIST') ({ blob, fileName } = await buildBidderListXlsxDocument({ download: false, upload: false }));
    else if (doc.documentType === 'RFQ') ({ blob, fileName } = await buildRFQXlsxDocument({ download: false, upload: false }));
    else if (doc.documentType === 'CQS') ({ blob, fileName } = await buildCQSXlsxDocument({ download: false, upload: false }));
    else continue;
    attachments.push({
      fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: await blobToBase64(blob)
    });
  }

  const result = await requestOutlookDraftEml({
    to,
    cc,
    subject,
    bodyHtml,
    attachments,
    draftFileName: `Outlook Draft - ${subject}.eml`
  });

  return {
    success: true,
    sent: false,
    message: `Draft Outlook berhasil dibuat. Buka file “${result.fileName}” dari folder Downloads, periksa attachment, lalu klik Send di Outlook Classic.`
  };
}

function normalizeDocumentRound(value) {
  const match = String(value || '').trim().toUpperCase().match(/R\s*(\d+)/);
  return match ? `R${Number(match[1])}` : 'R0';
}

function getDocumentRound(meta = getBidderMeta()) {
  return normalizeDocumentRound(meta.round || meta.revision || meta.rev || 'R0');
}

function getDocumentRoundSuffix(meta = getBidderMeta()) {
  const round = getDocumentRound(meta);
  return round === 'R0' ? '' : ` ${round}`;
}

function cleanDocumentFilePart(value) {
  return String(value || '').replace(/[\\/:*?"<>|#%{}]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildDocumentBaseName(documentType) {
  const meta = getBidderMeta();
  const noPR = cleanDocumentFilePart(meta.nopr || 'NO-PR');
  const description = cleanDocumentFilePart(meta.description || 'Tanpa Description');
  const roundSuffix = getDocumentRoundSuffix(meta);
  const type = String(documentType || '').toUpperCase();

  // Format final dokumen. BidderList dan RFQ menggunakan nama yang sama
  // karena disimpan pada folder yang berbeda:
  // R0: S-0001 PR0001 - Pekerjaan Valve.xlsx
  // R1: S-0001 PR0001 R1 - Pekerjaan Valve.xlsx
  // CQS R0: CQS PR0001 - Pekerjaan Valve.xlsx
  // CQS R1: CQS PR0001 R1 - Pekerjaan Valve.xlsx
  if (type === 'CQS') return `CQS ${noPR}${roundSuffix} - ${description}`;

  const rfq = cleanDocumentFilePart(formatRFQDisplayFromMeta(meta) || 'NO-RFQ');
  return `${rfq} ${noPR}${roundSuffix} - ${description}`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function uploadBlobToProcurementFolder(blob, documentType, fileName) {
  const meta = getBidderMeta();
  if (!meta.nopr) return { skipped: true, message: 'No PR belum tersedia.' };

  const normalizedDocumentType = String(documentType || '').trim().toUpperCase();
  const documentConfig = PROCUREMENT_DOCUMENT_VIEW_CONFIG[normalizedDocumentType];
  if (!documentConfig) {
    return { success: false, message: `Jenis dokumen tidak dikenali: ${documentType || '-'}` };
  }

  try {
    const fileData = await blobToDataUrl(blob);
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'uploadFile',
        documentType: normalizedDocumentType,
        folderType: documentConfig.folderName,
        fileName,
        noPR: meta.nopr,
        description: meta.description || '',
        rfq: meta.rfq || '',
        statusPR: meta.status_pr || '',
        round: getDocumentRound(meta),
        folderId: meta.folderid,
        fileData,
        mimeType: blob.type,
        replaceExisting: true,
        workspaceVersion: Number(WORKSPACE_VERSION || 0)
      })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Gagal upload dokumen.');

    // Selalu gunakan Folder ID akar yang dikembalikan backend setelah Folder ID
    // Workspace divalidasi terhadap No PR aktif. Ini mencegah upload berikutnya
    // memakai ID lama atau ID subfolder dari PR lain.
    if (result.rootFolderId || result.folderId) {
      meta.folderid = result.rootFolderId || result.folderId;
      meta.folderlink = result.rootFolderUrl || result.folderUrl || meta.folderlink || '';
    }

    rememberUploadedProcurementDocument(normalizedDocumentType, result);
    const status = document.getElementById('saveStatus');
    if (status) {
      const location = result.folderPath || `${meta.nopr} / ${documentConfig.folderName}`;
      status.textContent = `Dokumen tersimpan: ${location} / ${fileName}`;
    }
    return result;
  } catch (error) {
    console.warn('Dokumen gagal disimpan ke folder Drive:', error);
    return { success: false, message: error.message };
  }
}

function excelColumnName(columnNumber) {
  let number = Number(columnNumber);
  let name = '';
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

function buildCQSTitle(meta = getBidderMeta()) {
  const noPR = String(meta.nopr || '').trim();
  const roundSuffix = getDocumentRoundSuffix(meta);
  const description = String(meta.description || '').trim();
  return `${noPR}${roundSuffix} - ${description}`.trim().replace(/\s+-\s+$/, '');
}

function getCQSUsdAmount(meta = getBidderMeta()) {
  const raw = getEstPricePRRaw(meta);
  if (!hasRealValue(raw)) return 0;
  return parseCurrencyNumber(raw);
}


function getCQSIdrEquivalent(meta = getBidderMeta()) {
  const usdAmount = getCQSUsdAmount(meta);
  if (usdAmount > 0) return usdAmount * getCurrentUsdIdrRate();
  return getEstPriceUSRp(meta);
}

function getCQSLayoutForSheet(sheetName) {
  const normalized = String(sheetName || '3V').trim().toUpperCase();
  const vendorCount = Math.max(3, Math.min(10, Number.parseInt(normalized, 10) || 3));
  // Posisi No CQS mengikuti lebar sheet template: 3V=T:W, 4V=Y:AB,
  // lalu bergeser lima kolom untuk setiap tambahan vendor sampai 10V=BC:BF.
  const noCQSRange = `${excelColumnName(5 + (vendorCount * 5))}7:${excelColumnName(8 + (vendorCount * 5))}7`;
  return {
    sheetName: vendorCount <= 3 ? '3V' : `${vendorCount}V`,
    vendorCount,
    vendorNoCompanyRow: 11,
    vendorCompanyRow: 11,
    vendorAddressRow: 12,
    quotationNoRow: 14,
    vendorAttnRow: 15,
    quotationDateRow: 16,
    validUntilRow: 17,
    paymentTermRow: 18,
    deliveryTermRow: 19,
    francoRow: 20,
    exchangeRateCell: 'B17',
    usdAmountCell: 'F17',
    idrEquivalentCell: 'B18',
    noCQSCell: noCQSRange.split(':')[0],
    noCQSRange,
    itemStartRow: 22,
    itemEndRow: 49,
    totalRow: 50,
    noteLabelRow: 53,
    vendorNoteRow: 53,
    excludedNoteCell: 'B54',
    excludedNoteRange: 'B54:H54'
  };
}

function buildCQSTemplateUpdates(templateCapacity, sheetName) {
  const selected = getSelectedCQSVendors();
  if (selected.length < 1) throw new Error('CQS memerlukan minimal 1 vendor.');
  if (selected.length > 10) throw new Error(`Master CQS hanya menyediakan maksimum 10 vendor. Saat ini ${selected.length} vendor dipilih.`);

  const meta = getBidderMeta();
  const vendors = selected.map(item => getVendorSnapshotForCQS(item.row));
  const layout = getCQSLayoutForSheet(sheetName || (templateCapacity <= 3 ? '3V' : `${templateCapacity}V`));
  const usdAmount = getCQSUsdAmount(meta);
  const idrEquivalent = getCQSIdrEquivalent(meta);
  const updates = [
    ['F7', buildCQSTitle(meta), 'string'],
    ['F9', getMetaValue(meta, ['cost_center_detail']) || getCostCenterDetail(meta.cost_center) || meta.cost_center || '', 'string'],
    [layout.exchangeRateCell, usdAmount > 0 ? `1$ - ${formatIntegerID(getCurrentUsdIdrRate())}` : '', 'string'],
    [layout.usdAmountCell, usdAmount > 0 ? usdAmount : '', usdAmount > 0 ? 'decimal' : 'string'],
    [layout.idrEquivalentCell, idrEquivalent > 0 ? idrEquivalent : '', idrEquivalent > 0 ? 'decimal' : 'string'],
    [layout.noCQSCell, getCQSNumber() ? `No CQS : ${getCQSNumber()}` : '', 'string']
  ];

  const CQS_VENDOR_CELLS = Array.from({ length: 10 }, (_unused, index) => {
    const noCompanyColumn = excelColumnName(9 + (index * 5));
    const companyNameColumn = excelColumnName(10 + (index * 5));
    return {
      noCompany: `${noCompanyColumn}${layout.vendorNoCompanyRow}`,
      companyName: `${companyNameColumn}${layout.vendorCompanyRow}`,
      address: `${noCompanyColumn}${layout.vendorAddressRow}`,
      attn: `${noCompanyColumn}${layout.vendorAttnRow}`,
      note: `${noCompanyColumn}${layout.vendorNoteRow}`
    };
  });

  for (let index = 0; index < templateCapacity; index++) {
    const cells = CQS_VENDOR_CELLS[index];
    const vendorColumn = excelColumnName(9 + (index * 5));
    const targetValidColumn = excelColumnName(11 + (index * 5));
    updates.push(
      [cells.noCompany, '', 'string'],
      [cells.companyName, '', 'string'],
      [cells.address, '', 'string'],
      [`${vendorColumn}${layout.quotationNoRow}`, '', 'string'],
      [cells.attn, '', 'string'],
      [cells.note, '', 'string'],
      [`${vendorColumn}${layout.quotationDateRow}`, '', 'string'],
      [`${vendorColumn}${layout.validUntilRow}`, '', 'string'],
      [`${targetValidColumn}${layout.validUntilRow}`, '', 'blank'],
      [`${vendorColumn}${layout.paymentTermRow}`, '', 'string'],
      [`${vendorColumn}${layout.deliveryTermRow}`, '', 'string'],
      [`${vendorColumn}${layout.francoRow}`, '', 'string']
    );
  }

  const workspaceVendors = vendors.map((vendor, index) => ensureCQSWorkspaceVendor(vendor, index));
  const selectedSupplierNames = workspaceVendors
    .filter(item => item.data.selectedSupplier)
    .map(item => item.data.companyName)
    .filter(Boolean);
  const supplierJustifications = workspaceVendors
    .filter(item => item.data.selectedSupplier && String(item.data.justification || '').trim())
    .map(item => `${item.data.companyName}: ${item.data.justification}`);
  updates.push(
    ['B11', selectedSupplierNames.join('\n'), 'string'],
    ['B13', supplierJustifications.join('\n'), 'string'],
    [layout.excludedNoteCell, buildCQSExcludedVendorNote(), 'string']
  );

  vendors.forEach((vendor, index) => {
    const cells = CQS_VENDOR_CELLS[index];
    const workspace = workspaceVendors[index]?.data || {};
    const vendorColumn = excelColumnName(9 + (index * 5));
    const quotationDateSerial = excelSerialFromDate(workspace.quotationDate);
    const targetValidDate = formatTargetValidQuotationDate(workspace.quotationDate);
    const validityText = String(workspace.quotationNo || '').trim() ? '30 days' : '';
    const targetValidText = targetValidDate
      ? `Target Valid Date Quotation : ${targetValidDate}`
      : '';
    const targetValidColumn = excelColumnName(11 + (index * 5));
    updates.push(
      [cells.noCompany, vendor.noCompany, 'string'],
      [cells.companyName, vendor.companyName, 'string'],
      [cells.address, vendor.address, 'string'],
      [`${vendorColumn}${layout.quotationNoRow}`, workspace.quotationNo || '', 'string'],
      [cells.attn, buildVendorAttn(vendor), 'string'],
      [cells.note, workspace.note || '', 'string'],
      [`${vendorColumn}${layout.quotationDateRow}`, quotationDateSerial || '', quotationDateSerial ? 'number' : 'string'],
      [`${vendorColumn}${layout.validUntilRow}`, validityText, validityText ? 'string' : 'blank'],
      [`${targetValidColumn}${layout.validUntilRow}`, targetValidText, targetValidText ? 'string' : 'blank'],
      [`${vendorColumn}${layout.paymentTermRow}`, workspace.paymentTerm || '', 'string'],
      [`${vendorColumn}${layout.deliveryTermRow}`, workspace.deliveryTerm || '', 'string'],
      [`${vendorColumn}${layout.francoRow}`, getCQSFrancoFromRFQ(), 'string']
    );
  });

  const CQS_ITEM_ROW_COUNT = layout.itemEndRow - layout.itemStartRow + 1;
  const baseItems = (DATA?.structured?.RFQ?.items || [])
    .filter(item => String(item?.Description || '').trim());
  const exportRows = [];
  const exportedExtraKeys = new Set();

  // Line tambahan adalah milik blok kolom masing-masing vendor. Karena itu,
  // line dengan posisi yang sama setelah item RFQ yang sama harus memakai
  // SATU row CQS yang sama, bukan membuat row global baru untuk setiap vendor.
  //
  // Contoh:
  // - Vendor 1: + Line pertama setelah Item A
  // - Vendor 2: + Line pertama setelah Item A
  // Keduanya ditulis pada row yang sama, tetapi pada kolom Vendor 1 dan
  // Vendor 2 masing-masing. Ini mencegah isi vendor lain terdorong ke bawah.
  const appendGroupedExtraRows = (afterItemKey, fallbackToBottom = false) => {
    const groupedByPosition = [];

    workspaceVendors.forEach((workspace, vendorIndex) => {
      const matchingExtras = (workspace.data.additionalItems || [])
        .map((quote, extraIndex) => ({ quote, extraIndex }))
        .filter(({ quote }) => {
          const anchor = String(quote?.afterItemKey || '');
          return fallbackToBottom
            ? !anchor || !getCQSBaseItemKeys().includes(anchor)
            : anchor === afterItemKey;
        });

      matchingExtras.forEach(({ quote, extraIndex }, position) => {
        const extraKey = `${vendorIndex}:${String(quote.itemKey || extraIndex)}`;
        if (exportedExtraKeys.has(extraKey)) return;
        exportedExtraKeys.add(extraKey);

        if (!groupedByPosition[position]) {
          groupedByPosition[position] = {
            kind: 'extra-group',
            quotesByVendor: {},
            item: { Description: '', Qty: '', 'Ord Unit': '' }
          };
        }

        groupedByPosition[position].quotesByVendor[vendorIndex] = quote;

        // Kolom Description/Qty/Unit adalah kolom umum. Ambil data dari line
        // pertama yang terisi pada posisi tersebut tanpa mencampur Remarks
        // atau Unit Price antarkolom vendor.
        if (!String(groupedByPosition[position].item.Description || '').trim() &&
            String(quote.description || '').trim()) {
          groupedByPosition[position].item.Description = quote.description;
        }
        if (String(groupedByPosition[position].item.Qty ?? '').trim() === '' &&
            String(quote.qty ?? '').trim() !== '') {
          groupedByPosition[position].item.Qty = quote.qty;
        }
        if (!String(groupedByPosition[position].item['Ord Unit'] || '').trim() &&
            String(quote.unit || '').trim()) {
          groupedByPosition[position].item['Ord Unit'] = quote.unit;
        }
      });
    });

    groupedByPosition.filter(Boolean).forEach(row => exportRows.push(row));
  };

  const baseItemKeys = getCQSBaseItemKeys();
  baseItems.forEach((item, baseIndex) => {
    const baseItemKey = getCQSItemStorageKey(item, baseIndex);
    exportRows.push({
      kind: 'base',
      item,
      baseIndex,
      sourceVendorIndex: null,
      quote: null
    });
    appendGroupedExtraRows(baseItemKey);
  });

  // Fallback data lama/orphan tetap diekspor paling bawah, tetapi tetap
  // disejajarkan menurut posisi line dan dipisahkan pada kolom tiap vendor.
  appendGroupedExtraRows('', true);

  if (exportRows.length > CQS_ITEM_ROW_COUNT) {
    throw new Error(`Jumlah baris RFQ dan line tambahan ${exportRows.length}, melebihi kapasitas CQS ${CQS_ITEM_ROW_COUNT} baris.`);
  }

  const rowHeights = {};
  for (let index = 0; index < CQS_ITEM_ROW_COUNT; index++) {
    const rowNumber = layout.itemStartRow + index;
    const exportRow = exportRows[index] || null;
    const item = exportRow?.item || {};
    const qtyText = String(item.Qty ?? '').trim();
    const lineNumber = exportRow?.kind === 'base' ? Number(exportRow.baseIndex) + 1 : '';
    updates.push(
      [`B${rowNumber}`, lineNumber, lineNumber !== '' ? 'number' : 'blank'],
      [`C${rowNumber}`, item.Description || '', 'string'],
      [`G${rowNumber}`, qtyText ? parseCurrencyNumber(item.Qty) : '', qtyText ? 'number' : 'blank'],
      [`H${rowNumber}`, item['Ord Unit'] || item.Unit || '', 'string']
    );

    let longestText = String(item.Description || '');
    for (let vendorIndex = 0; vendorIndex < templateCapacity; vendorIndex++) {
      const unitPriceColumn = excelColumnName(9 + (vendorIndex * 5));
      const specColumn = excelColumnName(11 + (vendorIndex * 5));
      const remarksColumn = excelColumnName(12 + (vendorIndex * 5));
      let quote = null;
      if (exportRow?.kind === 'base') {
        quote = workspaceVendors[vendorIndex]?.data?.items?.[exportRow.baseIndex] || null;
      } else if (exportRow?.kind === 'extra-group') {
        quote = exportRow.quotesByVendor?.[vendorIndex] || null;
      }

      const unitPrice = quote && String(quote.unitPrice ?? '').trim()
        ? parseCurrencyNumber(quote.unitPrice)
        : '';
      const remarks = buildCQSRemarkText(quote);
      updates.push(
        [`${unitPriceColumn}${rowNumber}`, unitPrice, unitPrice !== '' ? 'decimal' : 'blank'],
        [`${specColumn}${rowNumber}`, '', 'string'],
        [`${remarksColumn}${rowNumber}`, remarks, 'string']
      );
      if (remarks.length > longestText.length) longestText = remarks;
    }

    if (exportRow) {
      const lines = Math.max(
        estimateWrappedTextLineCount(item.Description || '', 52),
        estimateWrappedTextLineCount(longestText, 42)
      );
      rowHeights[rowNumber] = Math.min(220, Math.max(34, 10 + lines * 15));
    }
  }

  // Jika satu blok vendor sama sekali tidak memiliki harga, Grand Total dan
  // Total + PPN pada file hasil harus tetap kosong. Formula native SUMIF
  // biasanya menampilkan 0 walaupun seluruh input harga kosong.
  for (let vendorIndex = 0; vendorIndex < templateCapacity; vendorIndex++) {
    const workspace = workspaceVendors[vendorIndex]?.data;
    const baseQuotes = Array.isArray(workspace?.items) ? workspace.items : [];
    const extraQuotes = Array.isArray(workspace?.additionalItems) ? workspace.additionalItems : [];
    const hasAnyUnitPrice = [...baseQuotes, ...extraQuotes]
      .some(quote => String(quote?.unitPrice ?? '').trim() !== '');
    if (!hasAnyUnitPrice) {
      const totalColumn = excelColumnName(9 + (vendorIndex * 5));
      updates.push(
        [`${totalColumn}${layout.totalRow}`, '', 'blank'],
        [`${totalColumn}${layout.totalRow + 1}`, '', 'blank']
      );
    }
  }
  return { updates, itemCount: exportRows.length, layout, rowHeights };
}

function setWorksheetRowHeight(sheetDoc, rowNumber, height) {
  const row = getOrCreateRow(sheetDoc, Number(rowNumber));
  row.setAttribute('ht', String(Math.max(15, Number(height) || 15)));
  row.setAttribute('customHeight', '1');
}

function setWorksheetRowHidden(sheetDoc, rowNumber, hidden) {
  const row = getOrCreateRow(sheetDoc, Number(rowNumber));
  if (hidden) row.setAttribute('hidden', '1');
  else row.removeAttribute('hidden');
}

function copyWorksheetRowPresentation(sheetDoc, sourceRowNumber, targetRowNumber, lastColumn = 18) {
  const sourceRow = getOrCreateRow(sheetDoc, Number(sourceRowNumber));
  const targetRow = getOrCreateRow(sheetDoc, Number(targetRowNumber));

  // Salin tinggi dan penanda border bawah baris terakhir, tanpa menyentuh
  // nilai/formula sel target. Ini menjaga bentuk native BidderList saat
  // baris kosong setelah minimum 10 line disembunyikan.
  ['s', 'customFormat', 'ht', 'customHeight', 'thickTop', 'thickBot'].forEach(attribute => {
    if (sourceRow.hasAttribute(attribute)) targetRow.setAttribute(attribute, sourceRow.getAttribute(attribute));
    else targetRow.removeAttribute(attribute);
  });

  for (let columnNumber = 1; columnNumber <= Number(lastColumn || 18); columnNumber++) {
    const columnName = excelColumnName(columnNumber);
    const sourceCell = getOrCreateCell(sheetDoc, `${columnName}${sourceRowNumber}`);
    const targetCell = getOrCreateCell(sheetDoc, `${columnName}${targetRowNumber}`);
    if (sourceCell.hasAttribute('s')) targetCell.setAttribute('s', sourceCell.getAttribute('s'));
    else targetCell.removeAttribute('s');
  }
}


function preserveCQSNativeGrandTotalFormulas(sheetDoc) {
  // Sengaja tidak mengubah formula pada row 51/52.
  // Area item CQS distandarkan pada row 22-49 dan Grand Total dimulai row 50.
  // Formula native yang sudah disesuaikan pada master CQS.xlsx dipertahankan.
  return sheetDoc;
}


const CQS_LAYOUT_SHEET_NAMES = new Set(['3V', '4V', '5V', '6V', '7V', '8V', '9V', '10V']);

function normalizePackagePartPath(basePartPath, targetPath) {
  const target = String(targetPath || '').replace(/^\//, '');
  if (!target) return '';
  if (!String(targetPath || '').startsWith('.')) return target.startsWith('xl/') ? target : `xl/${target}`;

  const baseParts = String(basePartPath || '').split('/');
  baseParts.pop();
  String(targetPath || '').split('/').forEach(part => {
    if (!part || part === '.') return;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  });
  return baseParts.join('/');
}

function getPackageRelsPath(partPath) {
  const parts = String(partPath || '').split('/');
  const fileName = parts.pop();
  return `${parts.join('/')}/_rels/${fileName}.rels`;
}

async function getRelationshipTargets(zip, partPath) {
  const relsPath = getPackageRelsPath(partPath);
  const relsFile = zip.file(relsPath);
  if (!relsFile) return [];

  const parser = new DOMParser();
  const relsDoc = parser.parseFromString(await relsFile.async('string'), 'application/xml');
  if (relsDoc.querySelector('parsererror')) return [];

  return Array.from(relsDoc.getElementsByTagName('Relationship'))
    .map(node => normalizePackagePartPath(partPath, node.getAttribute('Target')))
    .filter(Boolean);
}

async function pruneCQSWorkbookToSelectedLayout(zip, selectedSheetName) {
  const selectedName = String(selectedSheetName || '').trim();
  if (!CQS_LAYOUT_SHEET_NAMES.has(selectedName)) {
    throw new Error(`Sheet CQS tidak valid: ${selectedName || '(kosong)'}.`);
  }

  const workbookPath = 'xl/workbook.xml';
  const workbookRelsPath = 'xl/_rels/workbook.xml.rels';
  const workbookFile = zip.file(workbookPath);
  const workbookRelsFile = zip.file(workbookRelsPath);
  if (!workbookFile || !workbookRelsFile) throw new Error('Struktur workbook CQS tidak lengkap.');

  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const workbookDoc = parser.parseFromString(await workbookFile.async('string'), 'application/xml');
  const relsDoc = parser.parseFromString(await workbookRelsFile.async('string'), 'application/xml');
  if (workbookDoc.querySelector('parsererror') || relsDoc.querySelector('parsererror')) {
    throw new Error('Struktur workbook CQS tidak dapat dibaca.');
  }

  const originalSheets = Array.from(workbookDoc.getElementsByTagName('sheet'));
  const relationNodes = Array.from(relsDoc.getElementsByTagName('Relationship'));
  const relationMap = new Map(relationNodes.map(node => [node.getAttribute('Id'), node]));
  const sheetRecords = originalSheets.map((node, originalIndex) => {
    const name = String(node.getAttribute('name') || '').trim();
    const relationId = node.getAttribute('r:id') || node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const relation = relationMap.get(relationId);
    const target = relation ? normalizePackagePartPath(workbookPath, relation.getAttribute('Target')) : '';
    return { node, originalIndex, name, relationId, relation, target };
  });

  const selectedRecord = sheetRecords.find(record => record.name === selectedName);
  if (!selectedRecord?.target) throw new Error(`Sheet ${selectedName} tidak ditemukan pada master CQS.`);

  // Hanya layout 3V-10V yang dipangkas. Sheet helper/reference di masa depan tetap dipertahankan.
  const removedRecords = sheetRecords.filter(record =>
    CQS_LAYOUT_SHEET_NAMES.has(record.name) && record.name !== selectedName
  );
  const removedNames = new Set(removedRecords.map(record => record.name));
  const remainingRecords = sheetRecords.filter(record => !removedRecords.includes(record));
  const oldToNewIndex = new Map(remainingRecords.map((record, newIndex) => [record.originalIndex, newIndex]));

  // Catat dependency worksheet yang masih dipakai agar drawing/printer milik sheet aktif tidak ikut terhapus.
  const keptDependencies = new Set();
  for (const record of remainingRecords) {
    if (!record.target) continue;
    const dependencies = await getRelationshipTargets(zip, record.target);
    dependencies.forEach(path => keptDependencies.add(path));
  }

  const removedParts = new Set();
  for (const record of removedRecords) {
    record.node.parentNode?.removeChild(record.node);
    if (record.relation) record.relation.parentNode?.removeChild(record.relation);
    if (!record.target) continue;

    const dependencies = await getRelationshipTargets(zip, record.target);
    removedParts.add(record.target);
    removedParts.add(getPackageRelsPath(record.target));

    dependencies.forEach(path => {
      if (keptDependencies.has(path)) return;
      removedParts.add(path);
      removedParts.add(getPackageRelsPath(path));
    });
  }

  removedParts.forEach(path => {
    if (path && zip.file(path)) zip.remove(path);
  });

  // Remap localSheetId dan pertahankan hanya named range milik sheet yang masih ada.
  const definedNamesNode = workbookDoc.getElementsByTagName('definedNames')[0];
  if (definedNamesNode) {
    Array.from(definedNamesNode.getElementsByTagName('definedName')).forEach(node => {
      const text = String(node.textContent || '');
      const localSheetId = node.getAttribute('localSheetId');
      let remove = /#REF!/i.test(text);

      if (localSheetId !== null && localSheetId !== '') {
        const newIndex = oldToNewIndex.get(Number(localSheetId));
        if (newIndex === undefined) remove = true;
        else node.setAttribute('localSheetId', String(newIndex));
      }

      if (!remove) {
        for (const removedName of removedNames) {
          const quoted = `'${removedName.replace(/'/g, "''")}'!`;
          const plain = `${removedName}!`;
          if (text.includes(quoted) || text.includes(plain)) {
            remove = true;
            break;
          }
        }
      }

      if (remove) node.parentNode?.removeChild(node);
    });
    if (!definedNamesNode.getElementsByTagName('definedName').length) {
      definedNamesNode.parentNode?.removeChild(definedNamesNode);
    }
  }

  // Pastikan sheet layout yang dipilih menjadi sheet aktif saat file dibuka di Microsoft Excel.
  const selectedNewIndex = remainingRecords.findIndex(record => record.name === selectedName);
  Array.from(workbookDoc.getElementsByTagName('workbookView')).forEach(view => {
    view.setAttribute('activeTab', String(Math.max(0, selectedNewIndex)));
    view.setAttribute('firstSheet', String(Math.max(0, selectedNewIndex)));
  });

  zip.file(workbookPath, serializer.serializeToString(workbookDoc));
  zip.file(workbookRelsPath, serializer.serializeToString(relsDoc));

  // Hapus deklarasi content type untuk worksheet/drawing/printer yang sudah dibuang.
  const contentTypesPath = '[Content_Types].xml';
  const contentTypesFile = zip.file(contentTypesPath);
  if (contentTypesFile) {
    const contentTypesDoc = parser.parseFromString(await contentTypesFile.async('string'), 'application/xml');
    if (!contentTypesDoc.querySelector('parsererror')) {
      Array.from(contentTypesDoc.getElementsByTagName('Override')).forEach(node => {
        const partName = String(node.getAttribute('PartName') || '').replace(/^\//, '');
        if (removedParts.has(partName)) node.parentNode?.removeChild(node);
      });
      zip.file(contentTypesPath, serializer.serializeToString(contentTypesDoc));
    }
  }

  // Sinkronkan metadata daftar sheet agar Excel tidak menampilkan metadata delapan layout lama.
  const appPath = 'docProps/app.xml';
  const appFile = zip.file(appPath);
  if (appFile) {
    const appDoc = parser.parseFromString(await appFile.async('string'), 'application/xml');
    if (!appDoc.querySelector('parsererror')) {
      const titlesVector = Array.from(appDoc.getElementsByTagName('vector'))
        .find(node => node.parentNode?.localName === 'TitlesOfParts');
      if (titlesVector) {
        Array.from(titlesVector.children).forEach(node => {
          const text = String(node.textContent || '');
          const remove = Array.from(removedNames).some(name =>
            text === name || text.includes(`'${name}'!`) || text.includes(`${name}!`)
          );
          if (remove) node.parentNode?.removeChild(node);
        });
        titlesVector.setAttribute('size', String(titlesVector.children.length));
      }

      const headingPairs = appDoc.getElementsByTagName('HeadingPairs')[0];
      if (headingPairs) {
        const variants = Array.from(headingPairs.getElementsByTagName('variant'));
        variants.forEach((variant, index) => {
          const label = String(variant.textContent || '').trim();
          const nextVariant = variants[index + 1];
          if (!nextVariant) return;
          const countNode = nextVariant.getElementsByTagName('i4')[0];
          if (!countNode) return;
          if (label === 'Worksheets') countNode.textContent = String(remainingRecords.length);
          if (label === 'Named Ranges') {
            countNode.textContent = String(workbookDoc.getElementsByTagName('definedName').length);
          }
        });
      }
      zip.file(appPath, serializer.serializeToString(appDoc));
    }
  }
}


function estimateWrappedTextLineCount(value, charactersPerLine = 62) {
  const text = String(value || '');
  if (!text) return 1;
  return text.split(/\r?\n/).reduce((total, line) => {
    const length = Math.max(1, String(line || '').trim().length);
    return total + Math.max(1, Math.ceil(length / Math.max(20, Number(charactersPerLine) || 62)));
  }, 0);
}

function getWorksheetRowHeight(sheetDoc, rowNumber, fallback = 15) {
  const row = [...sheetDoc.getElementsByTagName('row')]
    .find(item => Number(item.getAttribute('r')) === Number(rowNumber));
  const height = Number(row?.getAttribute('ht') || 0);
  return height > 0 ? height : fallback;
}

async function ensureWorksheetCellWrapStyle(zip, sheetDoc, address) {
  const cell = getOrCreateCell(sheetDoc, address);
  const currentStyleIndex = Number(cell.getAttribute('s') || 0);
  const stylesPath = 'xl/styles.xml';
  const stylesFile = zip.file(stylesPath);
  if (!stylesFile) return;

  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const stylesDoc = parser.parseFromString(await stylesFile.async('string'), 'application/xml');
  if (stylesDoc.querySelector('parsererror')) return;

  const cellXfs = stylesDoc.getElementsByTagName('cellXfs')[0];
  if (!cellXfs) return;
  const xfs = [...cellXfs.childNodes].filter(node => node.nodeType === 1 && node.localName === 'xf');
  const sourceXf = xfs[currentStyleIndex] || xfs[0];
  if (!sourceXf) return;

  const wrappedXf = sourceXf.cloneNode(true);
  let alignment = [...wrappedXf.childNodes]
    .find(node => node.nodeType === 1 && node.localName === 'alignment');
  if (!alignment) {
    alignment = stylesDoc.createElementNS(stylesDoc.documentElement.namespaceURI, 'alignment');
    wrappedXf.appendChild(alignment);
  }
  alignment.setAttribute('horizontal', 'left');
  alignment.setAttribute('vertical', 'top');
  alignment.setAttribute('wrapText', '1');
  wrappedXf.setAttribute('applyAlignment', '1');

  cellXfs.appendChild(wrappedXf);
  const newStyleIndex = xfs.length;
  cellXfs.setAttribute('count', String(newStyleIndex + 1));
  cell.setAttribute('s', String(newStyleIndex));
  zip.file(stylesPath, serializer.serializeToString(stylesDoc));
}

async function patchNativeWorkbook(templateBuffer, sheetName, updates, rowHeights = {}, hiddenRows = [], hiddenColumnRanges = [], layoutOptions = null) {
  const zip = await JSZip.loadAsync(templateBuffer);
  const workbookFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relsFile) throw new Error('Master XLSX tidak valid.');

  const worksheetPath = resolveWorksheetPath(
    await workbookFile.async('string'),
    await relsFile.async('string'),
    sheetName
  );
  const worksheetFile = zip.file(worksheetPath);
  if (!worksheetFile) throw new Error(`Sheet ${sheetName} tidak ditemukan.`);

  const parser = new DOMParser();
  const sheetDoc = parser.parseFromString(await worksheetFile.async('string'), 'application/xml');
  if (sheetDoc.querySelector('parsererror')) throw new Error(`XML sheet ${sheetName} rusak.`);

  updates.forEach(([address, value, type]) => setWorksheetCellValue(sheetDoc, address, value, type));

  const layout = layoutOptions || getCQSLayoutForSheet(sheetName);

  ensureWorksheetMergedRange(sheetDoc, layout.noCQSRange);
  clearMergedRangeExceptTopLeft(sheetDoc, layout.noCQSRange);

  // Rumus native sebelumnya hanya memeriksa Qty. Saat Unit Price kosong tetapi
  // tersimpan sebagai teks, hasilnya #VALUE!. Tulis rumus eksplisit untuk
  // seluruh line dan vendor: hasil kosong jika salah satu input kosong, serta
  // IFERROR sebagai perlindungan untuk data lama yang bukan angka.
  for (let rowNumber = layout.itemStartRow; rowNumber <= layout.itemEndRow; rowNumber++) {
    for (let vendorIndex = 0; vendorIndex < Number(layout.vendorCount || 0); vendorIndex++) {
      const unitPriceColumn = excelColumnName(9 + (vendorIndex * 5));
      const lineTotalColumn = excelColumnName(10 + (vendorIndex * 5));
      setWorksheetCellFormula(
        sheetDoc,
        `${lineTotalColumn}${rowNumber}`,
        `IF(OR($G${rowNumber}="",${unitPriceColumn}${rowNumber}=""),"",IFERROR($G${rowNumber}*${unitPriceColumn}${rowNumber},""))`
      );
    }
  }

  // B54:H54 khusus alasan vendor yang tidak masuk CQS. Note masing-masing
  // vendor ditulis pada blok vendor row 53 (I53:M53, N53:R53, dst.).
  ensureWorksheetMergedRange(sheetDoc, layout.excludedNoteRange);
  clearMergedRangeExceptTopLeft(sheetDoc, layout.excludedNoteRange);
  await ensureWorksheetCellWrapStyle(zip, sheetDoc, layout.excludedNoteCell);
  const noteText = String(
    updates.find(update => String(update?.[0] || '').toUpperCase() === layout.excludedNoteCell.toUpperCase())?.[1] || ''
  );
  const excludedNoteRow = Number(String(layout.excludedNoteCell).match(/\d+/)?.[0] || 55);
  const nativeNoteHeight = getWorksheetRowHeight(sheetDoc, excludedNoteRow, 80);
  const neededNoteHeight = noteText
    ? Math.min(360, Math.max(nativeNoteHeight, 14 + estimateWrappedTextLineCount(noteText, 62) * 16))
    : nativeNoteHeight;
  setWorksheetRowHeight(sheetDoc, excludedNoteRow, neededNoteHeight);

  const vendorNoteRow = Number(layout.vendorNoteRow || 53);
  let vendorNoteHeight = getWorksheetRowHeight(sheetDoc, vendorNoteRow, 70);
  for (let vendorIndex = 0; vendorIndex < Number(layout.vendorCount || 0); vendorIndex++) {
    const startColumn = excelColumnName(9 + (vendorIndex * 5));
    const endColumn = excelColumnName(13 + (vendorIndex * 5));
    const vendorNoteCell = `${startColumn}${vendorNoteRow}`;
    const vendorNoteRange = `${vendorNoteCell}:${endColumn}${vendorNoteRow}`;
    ensureWorksheetMergedRange(sheetDoc, vendorNoteRange);
    clearMergedRangeExceptTopLeft(sheetDoc, vendorNoteRange);
    await ensureWorksheetCellWrapStyle(zip, sheetDoc, vendorNoteCell);
    const vendorNoteText = String(
      updates.find(update => String(update?.[0] || '').toUpperCase() === vendorNoteCell.toUpperCase())?.[1] || ''
    );
    if (vendorNoteText) {
      vendorNoteHeight = Math.min(
        360,
        Math.max(vendorNoteHeight, 14 + estimateWrappedTextLineCount(vendorNoteText, 42) * 16)
      );
    }
  }
  setWorksheetRowHeight(sheetDoc, vendorNoteRow, vendorNoteHeight);

  Object.entries(rowHeights || {}).forEach(([rowNumber, height]) => setWorksheetRowHeight(sheetDoc, rowNumber, height));
  // Hanya row item kosong yang boleh disembunyikan. Header dan Grand Total
  // mengikuti posisi native masing-masing sheet dan selalu ditampilkan.
  setWorksheetRowHidden(sheetDoc, layout.itemStartRow - 1, false);
  setWorksheetRowHidden(sheetDoc, layout.totalRow, false);
  for (let rowNumber = layout.itemStartRow; rowNumber <= layout.itemEndRow; rowNumber++) {
    setWorksheetRowHidden(sheetDoc, rowNumber, hiddenRows.includes(rowNumber));
  }
  // Tidak ada kolom BidderList/RFQ/CQS yang disembunyikan oleh web.
  // Sheet 4V, 5V, dst. dipakai sesuai jumlah vendor dan bentuk native tetap utuh.
  preserveCQSNativeGrandTotalFormulas(sheetDoc);
  zip.file(worksheetPath, new XMLSerializer().serializeToString(sheetDoc));

  // File hasil export hanya menyimpan layout sesuai jumlah vendor:
  // 1-3 vendor = 3V, 4 vendor = 4V, dan seterusnya sampai 10V.
  // Master CQS.xlsx tidak pernah diubah.
  await pruneCQSWorkbookToSelectedLayout(zip, sheetName);
  await sanitizeXlsxPackage(zip);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

async function validateGeneratedCQSWorkbook(arrayBuffer, sheetName, workspaceVendors) {
  if (typeof JSZip === 'undefined') throw new Error('Library JSZip belum tersedia untuk memeriksa hasil CQS.');

  const zip = await JSZip.loadAsync(arrayBuffer);
  const workbookFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relsFile) throw new Error('File hasil CQS tidak memiliki struktur workbook yang lengkap.');

  const workbookXml = await workbookFile.async('string');
  const relsXml = await relsFile.async('string');
  const worksheetPath = resolveWorksheetPath(workbookXml, relsXml, sheetName);
  const worksheetFile = zip.file(worksheetPath);
  if (!worksheetFile) throw new Error(`Sheet hasil ${sheetName} tidak ditemukan.`);

  const sheetDoc = new DOMParser().parseFromString(await worksheetFile.async('string'), 'application/xml');
  if (sheetDoc.querySelector('parsererror')) throw new Error(`Sheet hasil ${sheetName} rusak.`);

  const missing = [];
  (workspaceVendors || []).forEach((workspace, index) => {
    const companyCell = `${excelColumnName(10 + (index * 5))}11`;
    const quotationCell = `${excelColumnName(9 + (index * 5))}14`;
    const expectedCompany = String(workspace?.vendor?.companyName || workspace?.data?.companyName || '').trim();
    const actualCompany = String(getWorksheetCellText(sheetDoc, companyCell) || '').trim();
    const expectedQuotation = String(workspace?.data?.quotationNo || '').trim();
    const actualQuotation = String(getWorksheetCellText(sheetDoc, quotationCell) || '').trim();

    if (expectedCompany && normalizeTextKey(actualCompany) !== normalizeTextKey(expectedCompany)) {
      missing.push(`Vendor ${index + 1} (${companyCell})`);
    }
    if (expectedQuotation && normalizeTextKey(actualQuotation) !== normalizeTextKey(expectedQuotation)) {
      missing.push(`No Quotation Vendor ${index + 1} (${quotationCell})`);
    }
  });

  if (missing.length) {
    throw new Error(`Hasil CQS ${sheetName} tidak lengkap: ${missing.join(', ')}.`);
  }
  return true;
}

async function getBundledCQSBufferForRetry() {
  const loaded = await loadBundledMasterTemplate('CQS.xlsx', 'CQS');
  await validateCQSWorkbookTemplate(loaded.buffer);
  return loaded;
}

function getCQSNativeDocumentReadiness() {
  const selectedCount = getSelectedCQSVendors().length;
  if (selectedCount < 1) return { ready: false, reason: 'Belum ada vendor yang dipilih masuk CQS.' };
  if (selectedCount > 10) return { ready: false, reason: `Master CQS maksimum 10 vendor; saat ini ${selectedCount} vendor dipilih.` };
  if (!hasRFQDescriptionItems()) return { ready: false, reason: 'Description RFQ belum diisi.' };
  const cqsRowCount = getCQSExportRowCount();
  if (cqsRowCount > 28) return { ready: false, reason: `Jumlah baris RFQ dan line tambahan ${cqsRowCount}, melebihi kapasitas CQS 28 baris.` };

  const missingReasons = getMissingCQSExclusionReasons();
  if (missingReasons.length) {
    return {
      ready: false,
      reason: `${missingReasons.length} vendor yang tidak masuk CQS belum memiliki alasan.`
    };
  }
  return { ready: true, selectedCount };
}

async function buildCQSXlsxDocument(options = {}) {
  const shouldDownload = options.download === true;
  const shouldUpload = options.upload !== false;
  const readiness = getCQSNativeDocumentReadiness();

  if (!readiness.ready) throw new Error(readiness.reason);
  if (typeof JSZip === 'undefined') throw new Error('Library JSZip belum tersedia.');
  if (!CQS_TEMPLATE_ARRAY_BUFFER) await initMasterTemplates();
  if (!CQS_TEMPLATE_ARRAY_BUFFER) throw new Error('Master CQS.xlsx belum tersedia.');

  const selectedCount = readiness.selectedCount;
  const sheetName = selectedCount <= 3 ? '3V' : `${selectedCount}V`;
  const templateCapacity = selectedCount <= 3 ? 3 : selectedCount;
  const layout = getCQSLayoutForSheet(sheetName);
  const built = buildCQSTemplateUpdates(templateCapacity, sheetName);
  const hiddenRows = [];
  const firstUnusedRow = layout.itemStartRow + built.itemCount;
  for (let row = firstUnusedRow; row <= layout.itemEndRow; row++) hiddenRows.push(row);

  // Sheet 3V tetap menampilkan seluruh tiga blok. Blok vendor yang tidak dipakai
  // hanya dikosongkan, tidak disembunyikan, agar bentuk native tetap utuh.
  const workspaceVendors = getSelectedCQSWorkspaceVendors();
  let output;
  try {
    output = await patchNativeWorkbook(
      CQS_TEMPLATE_ARRAY_BUFFER,
      sheetName,
      built.updates,
      built.rowHeights || {},
      hiddenRows,
      [],
      layout
    );
    await validateGeneratedCQSWorkbook(output, sheetName, workspaceVendors);
  } catch (error) {
    const currentSource = String(MASTER_TEMPLATE_LOAD_INFO.CQS?.source || '');
    if (currentSource === 'LOCAL_BUNDLED_TEMPLATE') throw error;

    console.warn(`CQS ${sheetName} gagal diverifikasi dari master aktif; mencoba template bawaan aplikasi.`, error);
    const bundled = await getBundledCQSBufferForRetry();
    CQS_TEMPLATE_ARRAY_BUFFER = bundled.buffer;
    CQS_TEMPLATE_FILE_NAME = bundled.fileName || 'CQS.xlsx';

    output = await patchNativeWorkbook(
      CQS_TEMPLATE_ARRAY_BUFFER,
      sheetName,
      built.updates,
      built.rowHeights || {},
      hiddenRows,
      [],
      layout
    );
    await validateGeneratedCQSWorkbook(output, sheetName, workspaceVendors);
  }
  const fileName = `${buildDocumentBaseName('CQS')}.xlsx`;
  const blob = new Blob([output], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  if (shouldDownload) downloadBlob(blob, fileName);

  let uploadResult = { skipped: true };
  if (shouldUpload) {
    uploadResult = await uploadBlobToProcurementFolder(blob, 'CQS', fileName);
    if (!uploadResult?.success) {
      throw new Error(uploadResult?.message || 'CQS berhasil dibuat tetapi gagal disimpan ke folder 03. CQS.');
    }
  }

  return { blob, fileName, uploadResult, sheetName };
}

async function exportCQSToXlsxTemplate() {
  return saveCQSAs();
}

async function saveCQSAs() {
  try {
    const result = await buildCQSXlsxDocument({ download: false, upload: false });
    const saved = await saveBlobToLocalDrive(result.blob, result.fileName, 'CQS');
    if (saved?.saved) {
      alert(`CQS berhasil disimpan ke Storage Location:\n${saved.path}`);
    }
  } catch (error) {
    console.error('Gagal menjalankan CQS Save As:', error);
    alert(`Gagal menjalankan CQS Save As: ${error.message || error}`);
  }
}

// Alias lama dipertahankan agar tombol/cache lama tidak error.
async function exportCQSToXlsmTemplate() {
  return exportCQSToXlsxTemplate();
}


function getNativeDocumentSignature(documentType) {
  const type = String(documentType || '').toUpperCase();
  const meta = getBidderMeta();
  const keyData = {
    noPR: meta.nopr || '',
    round: getDocumentRound(meta),
    rfq: formatRFQDisplayFromMeta(meta),
    description: meta.description || '',
    openDate: meta.open_date || '',
    closeDate: meta.close_date || '',
    costCenter: meta.cost_center || '',
    costCenterDetail: meta.cost_center_detail || '',
    usdRate: getCurrentUsdIdrRate()
  };

  if (type === 'BIDDERLIST') {
    return JSON.stringify({
      ...keyData,
      previousWinnerPO: meta.previous_winner_po || '',
      previousVendorQuote: meta.previous_vendor_quote || '',
      rows: DATA?.structured?.BidderList?.rows || []
    });
  }

  if (type === 'RFQ') {
    return JSON.stringify({
      ...keyData,
      rfqData: DATA?.structured?.RFQ || {}
    });
  }

  if (type === 'CQS') {
    return JSON.stringify({
      ...keyData,
      rfqItems: DATA?.structured?.RFQ?.items || [],
      selectedVendors: getSelectedCQSVendors().map(item => item.row),
      excludedVendorNote: buildCQSExcludedVendorNote(),
      cqsWorkspace: DATA?.structured?.CQS || {}
    });
  }

  return JSON.stringify(keyData);
}

function getNativeDocumentSignatureKey(documentType) {
  return `${getCurrentProcurementDocumentKey()}|${String(documentType || '').toUpperCase()}`;
}

function scheduleNativeDocumentSync() {
  clearTimeout(NATIVE_DOCUMENT_SYNC_TIMER);
  NATIVE_DOCUMENT_SYNC_TIMER = null;

  const meta = getBidderMeta();
  if (!String(meta?.nopr || '').trim()) return;

  NATIVE_DOCUMENT_SYNC_TIMER = setTimeout(() => {
    NATIVE_DOCUMENT_SYNC_TIMER = null;
    syncNativeDocumentsToDrive({ silent: true, force: false }).catch(error => {
      console.warn('Sinkronisasi dokumen native tertunda gagal:', error);
    });
  }, NATIVE_DOCUMENT_SYNC_DELAY_MS);
}

function summarizeNativeDocumentSync(result) {
  const saved = (result?.saved || []).map(item => item.label);
  const skipped = result?.skipped || [];
  const errors = result?.errors || [];

  const lines = [];
  if (saved.length) lines.push(`Dokumen tersimpan: ${saved.join(', ')}.`);
  if (skipped.length) {
    lines.push(`Belum dibuat: ${skipped.map(item => `${item.label} (${item.reason})`).join('; ')}.`);
  }
  if (errors.length) {
    lines.push(`Gagal: ${errors.map(item => `${item.label} (${item.reason})`).join('; ')}.`);
  }
  return lines.join('\n');
}

async function syncNativeDocumentsToDrive(options = {}) {
  const silent = options.silent !== false;
  const force = Boolean(options.force);

  if (NATIVE_DOCUMENT_SYNC_IN_FLIGHT) {
    NATIVE_DOCUMENT_SYNC_PENDING = true;
    return { saved: [], skipped: [], errors: [], pending: true };
  }

  const meta = getBidderMeta();
  if (!String(meta?.nopr || '').trim()) {
    return {
      saved: [],
      skipped: [{ type: 'ALL', label: 'Dokumen', reason: 'No PR belum tersedia' }],
      errors: []
    };
  }

  NATIVE_DOCUMENT_SYNC_IN_FLIGHT = true;
  clearTimeout(NATIVE_DOCUMENT_SYNC_TIMER);
  NATIVE_DOCUMENT_SYNC_TIMER = null;

  const result = { saved: [], skipped: [], errors: [] };
  const definitions = [
    {
      type: 'BIDDERLIST',
      label: 'BidderList',
      ready: () => ({ ready: true }),
      build: () => buildBidderListXlsxDocument({ download: false, upload: true })
    },
    {
      type: 'RFQ',
      label: 'RFQ',
      ready: () => hasRFQDescriptionItems()
        ? { ready: true }
        : { ready: false, reason: 'Description RFQ belum diisi' },
      build: () => buildRFQXlsxDocument({ download: false, upload: true })
    },
    {
      type: 'CQS',
      label: 'CQS',
      ready: () => getCQSNativeDocumentReadiness(),
      build: () => buildCQSXlsxDocument({ download: false, upload: true })
    }
  ];

  try {
    await initMasterTemplates();

    for (const definition of definitions) {
      const readiness = definition.ready();
      if (!readiness.ready) {
        result.skipped.push({
          type: definition.type,
          label: definition.label,
          reason: readiness.reason || 'Data belum siap'
        });
        continue;
      }

      const signature = getNativeDocumentSignature(definition.type);
      const signatureKey = getNativeDocumentSignatureKey(definition.type);
      if (!force && NATIVE_DOCUMENT_LAST_SIGNATURES[signatureKey] === signature) {
        continue;
      }

      try {
        const built = await definition.build();
        NATIVE_DOCUMENT_LAST_SIGNATURES[signatureKey] = signature;
        result.saved.push({
          type: definition.type,
          label: definition.label,
          fileName: built?.fileName || '',
          uploadResult: built?.uploadResult || null
        });
      } catch (error) {
        result.errors.push({
          type: definition.type,
          label: definition.label,
          reason: String(error?.message || error)
        });
      }
    }

    await refreshProcurementDocuments({ force: true });

    const status = document.getElementById('saveStatus');
    const summary = summarizeNativeDocumentSync(result);
    if (status && summary) {
      status.textContent = summary.replace(/\n/g, ' ');
    }

    if (!silent && result.errors.length) {
      alert(summarizeNativeDocumentSync(result));
    }
    return result;
  } finally {
    NATIVE_DOCUMENT_SYNC_IN_FLIGHT = false;
    if (NATIVE_DOCUMENT_SYNC_PENDING) {
      NATIVE_DOCUMENT_SYNC_PENDING = false;
      scheduleNativeDocumentSync();
    }
  }
}

function getCurrentWorkspaceStructuredPayload() {
  return {
    BidderList: DATA.structured.BidderList,
    RFQ: DATA.structured.RFQ,
    CQS: DATA.structured.CQS,
    Multiple_Email: DATA.structured.Multiple_Email
  };
}

function workspaceStructuredSignature(value) {
  try {
    return JSON.stringify(value || {});
  } catch (error) {
    return '';
  }
}

async function reconcileWorkspaceConflictWithServer(noPR, round) {
  try {
    const normalizedRound = normalizeDocumentRound(round);
    const response = await fetch(
      buildWorkspaceLoadUrl(noPR, normalizedRound, getBidderMeta().procurementId || ''),
      { cache: 'no-store' }
    );
    const latest = await response.json();
    if (!latest?.success || !latest?.found || !latest?.data?.structured) return false;

    const localSignature = workspaceStructuredSignature(getCurrentWorkspaceStructuredPayload());
    const serverSignature = workspaceStructuredSignature(latest.data.structured);
    if (!localSignature || localSignature !== serverSignature) return false;

    // Data server dan data layar identik. Conflict hanya disebabkan Version
    // yang sudah naik pada autosave/tab lain, sehingga aman mengadopsi versi
    // terbaru tanpa menimpa perubahan siapa pun.
    WORKSPACE_VERSION = Number(latest.version || WORKSPACE_VERSION || 0);
    WORKSPACE_LAST_SAVE_ERROR = '';
    dirty = false;
    clearWorkspaceDraftLocally();

    const status = document.getElementById('saveStatus');
    if (status) {
      status.textContent = `Workspace sudah tersinkron | Version ${WORKSPACE_VERSION} | ${new Date().toLocaleString('id-ID')}`;
    }
    return true;
  } catch (error) {
    console.warn('Rekonsiliasi Version workspace gagal:', error);
    return false;
  }
}

async function saveData(showAlert = false, options = {}) {
  const automatic = Boolean(options.automatic);
  const syncDocumentsNow = Boolean(options.syncDocuments || showAlert);
  const meta = getBidderMeta();

  if (!meta.nopr) {
    if (showAlert) alert('No PR wajib diisi sebelum menyimpan.');
    return false;
  }
  if (WORKSPACE_SAVE_IN_FLIGHT) {
    WORKSPACE_SAVE_PENDING = true;
    return false;
  }

  WORKSPACE_SAVE_IN_FLIGHT = true;
  const saveSequence = WORKSPACE_CHANGE_SEQUENCE;
  const status = document.getElementById('saveStatus');
  if (status) status.textContent = automatic ? 'Menyimpan otomatis...' : 'Menyimpan...';

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'SAVE_WORKSPACE',
        procurementId: meta.procurementId || '',
        noPR: meta.nopr,
        round: getDocumentRound(meta),
        version: WORKSPACE_VERSION,
        invitedVendors: (DATA.structured.BidderList.rows || [])
          .map(row => String(row?.['Name of Invited Supplier'] || '').trim())
          .filter(Boolean),
        data: {
          structured: {
            BidderList: DATA.structured.BidderList,
            RFQ: DATA.structured.RFQ,
            CQS: DATA.structured.CQS,
            Multiple_Email: DATA.structured.Multiple_Email
          }
        }
      })
    });
    const result = await response.json();
    if (!result.success) {
      if (result.conflict) {
        const reconciled = await reconcileWorkspaceConflictWithServer(
          meta.nopr,
          getDocumentRound(meta)
        );
        if (reconciled) {
          result.success = true;
          result.version = WORKSPACE_VERSION;
          result.reconciled = true;
        } else {
          throw new Error(`${result.message}\nDiubah oleh: ${result.updatedBy || '-'}\nWaktu: ${result.updatedAt || '-'}`);
        }
      } else {
        throw new Error(result.message || 'Gagal menyimpan workspace.');
      }
    }

    WORKSPACE_VERSION = Number(result.version || WORKSPACE_VERSION || 1);
    WORKSPACE_LAST_SAVE_ERROR = '';

    if (saveSequence === WORKSPACE_CHANGE_SEQUENCE) {
      dirty = false;
      clearWorkspaceDraftLocally();
      if (status) {
        status.textContent = `${automatic ? 'Tersimpan otomatis' : 'Workspace tersimpan'} | Version ${WORKSPACE_VERSION} | ${new Date().toLocaleString('id-ID')}`;
      }
    } else {
      dirty = true;
      persistWorkspaceDraftLocally();
      if (status) status.textContent = `Perubahan baru menunggu autosave | Version ${WORKSPACE_VERSION}`;
      WORKSPACE_SAVE_PENDING = true;
    }

    let documentSyncResult = null;
    if (syncDocumentsNow) {
      if (status) status.textContent = `Workspace tersimpan | Membuat BidderList, RFQ, dan CQS dari template...`;
      documentSyncResult = await syncNativeDocumentsToDrive({ silent: true, force: true });
    } else if (automatic) {
      // Data tetap autosave cepat. File XLSX disinkronkan setelah pengguna berhenti
      // mengedit beberapa detik agar template besar tidak dibuat pada setiap ketikan.
      scheduleNativeDocumentSync();
    }

    if (showAlert) {
      const summary = summarizeNativeDocumentSync(documentSyncResult);
      alert([
        `Workspace berhasil disimpan (Version ${WORKSPACE_VERSION}).`,
        summary || 'Dokumen native akan disinkronkan otomatis.'
      ].join('\n'));
    }
    return true;
  } catch (error) {
    dirty = true;
    WORKSPACE_LAST_SAVE_ERROR = String(error.message || error);
    persistWorkspaceDraftLocally();
    if (status) status.textContent = `Autosave gagal: ${WORKSPACE_LAST_SAVE_ERROR}`;
    if (!options.suppressAlert && (showAlert || !automatic)) {
      alert(`Gagal menyimpan: ${WORKSPACE_LAST_SAVE_ERROR}`);
    }
    return false;
  } finally {
    WORKSPACE_SAVE_IN_FLIGHT = false;
    if (WORKSPACE_SAVE_PENDING) {
      WORKSPACE_SAVE_PENDING = false;
      scheduleWorkspaceAutoSave();
    }
  }
}
async function loadWorkspaceForPR(noPR, round, procurementMeta = null, procurementRow = null) {
  const procurementId = getProcurementRowId(procurementRow) || procurementMeta?.procurementId || '';
  const key = `${normalizeTextKey(procurementId || noPR)}|${normalizeDocumentRound(round)}`;
  if (!noPR || WORKSPACE_LOADING_KEY === key) return;
  WORKSPACE_LOADING_KEY = key;
  try {
    const response = await fetch(
      buildWorkspaceLoadUrl(noPR, round, procurementId),
      { cache: 'no-store' }
    );
    const result = await response.json();
    if (result.success && result.found && result.data?.structured) {
      const loadedStructured = result.data.structured;
      DATA = structuredClone(DEFAULT_DATA);
      DATA.structured.BidderList = loadedStructured.BidderList || DATA.structured.BidderList;
      DATA.structured.RFQ = loadedStructured.RFQ || DATA.structured.RFQ;
      DATA.structured.CQS = loadedStructured.CQS || { vendors: {} };
      DATA.structured.Multiple_Email = loadedStructured.Multiple_Email || DATA.structured.Multiple_Email;
      ensureBidderNoCompanyColumn();
      DATA.structured.BidderList.meta = { ...(DATA.structured.BidderList.meta || {}), ...(procurementMeta || {}) };
      if (procurementRow) {
        applyRoundMetaFromProcurement(DATA.structured.BidderList.meta, procurementRow, round);
        DATA.structured.BidderList.meta.flow_process = getProcurementAdminValue(procurementRow, ['Flow Process', 'flowprocess']) || DATA.structured.BidderList.meta.flow_process || '';
      }
      WORKSPACE_VERSION = Number(result.version || 0);
      const localDraftRestored = restoreWorkspaceDraftLocally(noPR, round);

      // List Invitation Vendor pada Procurement Admin adalah sumber daftar vendor
      // untuk round aktif. Rekonsiliasi juga dilakukan pada workspace lama agar
      // data lama tidak terus tampil berbeda dengan form Procurement Admin.
      const invitationSynchronized = synchronizeBidderRowsWithInvitation(
        procurementRow,
        normalizeDocumentRound(round)
      );
      dirty = Boolean(localDraftRestored || invitationSynchronized);
      const status = document.getElementById('saveStatus');
      if (status) status.textContent = localDraftRestored
        ? `Draft lokal dipulihkan | Version ${WORKSPACE_VERSION} | Autosave aktif`
        : (invitationSynchronized
          ? `List Invitation Vendor disinkronkan | Version ${WORKSPACE_VERSION} | Autosave aktif`
          : `Workspace dimuat | Version ${WORKSPACE_VERSION}`);
    } else {
      WORKSPACE_VERSION = 0;
      DATA = structuredClone(DEFAULT_DATA);
      const currentRound = normalizeDocumentRound(round);
      const currentRoundNumber = Number(currentRound.substring(1)) || 0;
      let copiedFromPrevious = false;

      // Round baru menggunakan BidderList dan RFQ round sebelumnya sebagai draft,
      // tetapi pilihan CQS selalu dikosongkan agar status kembali DUMMY.
      if (currentRoundNumber > 0) {
        const previousRound = `R${currentRoundNumber - 1}`;
        try {
          const previousResponse = await fetch(
            buildWorkspaceLoadUrl(noPR, previousRound, procurementId),
            { cache: 'no-store' }
          );
          const previousResult = await previousResponse.json();
          if (previousResult.success && previousResult.found && previousResult.data?.structured) {
            const previousStructured = previousResult.data.structured;
            DATA.structured.BidderList = structuredClone(previousStructured.BidderList || DATA.structured.BidderList);
            DATA.structured.RFQ = structuredClone(previousStructured.RFQ || DATA.structured.RFQ);
            DATA.structured.CQS = { vendors: {} };
            DATA.structured.Multiple_Email = structuredClone(previousStructured.Multiple_Email || DATA.structured.Multiple_Email);
            (DATA.structured.BidderList.rows || []).forEach(row => {
              row.__selectedCQS = false;
              delete row.__cqsOrder;
              row['Accepted Date'] = '';
              row['Time'] = '';
            });
            copiedFromPrevious = true;
          }
        } catch (copyError) {
          console.warn('Round sebelumnya tidak dapat disalin:', copyError);
        }
      }

      ensureBidderNoCompanyColumn();
      if (procurementMeta) DATA.structured.BidderList.meta = { ...(DATA.structured.BidderList.meta || {}), ...procurementMeta };
      if (procurementRow) {
        applyRoundMetaFromProcurement(DATA.structured.BidderList.meta, procurementRow, currentRound);
        DATA.structured.BidderList.meta.flow_process = getProcurementAdminValue(procurementRow, ['Flow Process', 'flowprocess']) || DATA.structured.BidderList.meta.flow_process || '';
      }
      // List Invitation Company pada round aktif tetap menjadi sumber utama,
      // termasuk ketika draft round baru disalin dari round sebelumnya.
      const seededFromProcurement = seedWorkspaceFromProcurementRow(procurementRow, currentRound);
      const localDraftRestored = restoreWorkspaceDraftLocally(noPR, currentRound);
      dirty = Boolean(localDraftRestored || copiedFromPrevious || seededFromProcurement);
      const status = document.getElementById('saveStatus');
      if (status) status.textContent = localDraftRestored
        ? `Draft lokal ${currentRound} dipulihkan | Autosave aktif`
        : (copiedFromPrevious
          ? `Draft ${currentRound} disalin dari round sebelumnya. Autosave aktif.`
          : (seededFromProcurement
            ? 'BidderList/RFQ diisi otomatis dari Procurement Admin. Autosave aktif.'
            : 'Workspace baru: belum pernah disimpan.'));
    }
    compactWorkspaceEntryRows();
    renderCurrent();
    await refreshProcurementDocuments({ force: true });
  } catch (error) {
    console.warn('Gagal memuat workspace:', error);
  } finally {
    WORKSPACE_LOADING_KEY = '';
    scheduleWorkspaceAutoSave();
  }
}

function resetData() {
  if (!confirm('Reset tampilan ke master awal? Data Google Sheet tidak dihapus sampai tombol Save ditekan.')) return;
  DATA = structuredClone(DEFAULT_DATA);
  ensureBidderNoCompanyColumn();
  compactWorkspaceEntryRows();
  WORKSPACE_VERSION = 0;
  markDirty('Data di-reset. Klik Save jika ingin menyimpan reset.');
  renderCurrent();
}

function importBackupJSON(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed?.structured) throw new Error('Format JSON tidak sesuai.');
      DATA = parsed;
      ensureBidderNoCompanyColumn();
      compactWorkspaceEntryRows();
      markDirty('Backup JSON dimuat. Klik Save untuk menyimpan.');
      renderCurrent();
    } catch (error) { alert(`Gagal import JSON: ${error.message || error}`); }
  };
  reader.readAsText(file);
}

function downloadCurrentCSV() {
  const tables = document.querySelectorAll('#viewBody table');
  if (!tables.length) return;
  const lines = [];
  tables.forEach((table, index) => {
    if (index > 0) lines.push('');
    table.querySelectorAll('tr').forEach(tr => {
      const cells = [...tr.children]
        .filter(td => !td.classList.contains('action-cell'))
        .map(td => `"${td.innerText.replace(/"/g, '""')}"`);
      lines.push(cells.join(','));
    });
  });
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentView}-export.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    document.getElementById('searchBox').value = '';
    renderCurrent();
  });
});

window.addEventListener('beforeunload', event => {
  if (dirty) persistWorkspaceDraftLocally();
  if (IS_EMBEDDED_WORKSPACE || !dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && dirty) {
    persistWorkspaceDraftLocally();
    if (editMode) runWorkspaceAutoSave();
  }
});

window.addEventListener('message', event => {
  if (event.data?.action === 'PROCUREMENT_CONTEXT_UPDATED') {
    const context = event.data.data || {};
    const round = normalizeDocumentRound(event.data.round || context.roundpo || context['Round PR'] || context['Round PO'] || 'R0');
    const currentRound = normalizeDocumentRound(getBidderMeta().round || 'R0');
    if (round !== currentRound) {
      handleNoPRSelect(event.data.noPR || context.noPR || context['No PR'] || getBidderMeta().nopr, { rowOverride: context, roundOverride: round });
    } else {
      const meta = getBidderMeta();
      const pr = event.data.noPR || context.noPR || context['No PR'] || meta.nopr;
      const row = context;
      meta.nopr = pr;
      meta.description = getProcurementAdminValue(row, ['Description','description']) || meta.description;
      applyRoundMetaFromProcurement(meta, row, round);
      meta.rfq = formatRFQByStatusPR(getProcurementAdminValue(row,['rfq','RFQ','No RFQ']) || meta.rfq, getProcurementAdminValue(row,['statuspr','Status PR']) || meta.status_pr);
      meta.status_pr = getProcurementAdminValue(row,['statuspr','Status PR']) || meta.status_pr;
      meta.cost_center = getProcurementAdminValue(row,['departement','Department','Cost Center']) || meta.cost_center;
      meta.type_quotation = getProcurementAdminValue(row,['pengadaan','Pengadaan']) || meta.type_quotation;
      meta.flow_process = getProcurementAdminValue(row, ['Flow Process', 'flowprocess']) || meta.flow_process;

      // JANGAN timpa baris BidderList (Nama Vendor & Accepted Date) jika masih
      // ada perubahan lokal yang belum disimpan (dirty). Tanpa guard ini, setiap
      // kali pesan PROCUREMENT_CONTEXT_UPDATED diterima -- misalnya saat pindah
      // tab Procurement <-> BidderList -- synchronizeBidderRowsWithInvitation()
      // akan membangun ulang seluruh baris dari daftar vendor undangan yang
      // tersimpan di Procurement Admin, sehingga nama vendor/tanggal yang baru
      // diketik tapi belum di-Save akan hilang tanpa peringatan.
      if (!dirty) {
        synchronizeBidderRowsWithInvitation(row, round);
      } else {
        console.warn('Sinkronisasi BidderList dilewati: ada perubahan lokal (nama vendor/tanggal) yang belum disimpan.');
      }
      renderCurrent();
      refreshProcurementDocuments({ force: true });
    }
    return;
  }
  if (event.data?.action !== 'SET_WORKSPACE_VIEW') return;
  let view = event.data.view;
  if (!['BidderList', 'RFQ', 'CQS', 'Multiple_Email'].includes(view)) return;
  if (view === 'CQS' && (getSelectedCQSVendors().length < 1 || getSelectedCQSVendors().length > 10)) {
    view = 'BidderList';
  }
  currentView = view;
  document.querySelectorAll('.nav-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.view === currentView);
  });
  const searchBox = document.getElementById('searchBox');
  if (searchBox) searchBox.value = '';
  renderCurrent();
});

async function initializeBidderWorkspace() {
  // Master XLSX membawa 20 slot kosong. Workspace web mempertahankan minimal
  // 10 baris Bidder List tanpa mengubah data vendor yang sudah terisi.
  compactWorkspaceEntryRows();

  await Promise.all([
    initProcurementAdminRows(),
    initVendorCompanyData(),
    initMasterTemplates()
  ]);
  await retryBidderProcurementPending({ silent: true });

  const params = new URLSearchParams(window.location.search);
  const requestedPR = params.get('pr') || params.get('noPR') || '';
  const requestedView = params.get('view');
  const requestedRound = params.get('round') || '';

  if (requestedPR) handleNoPRSelect(requestedPR, { roundOverride: requestedRound || undefined });
  if (requestedView && ['BidderList', 'RFQ', 'CQS', 'Multiple_Email'].includes(requestedView)) {
    currentView = requestedView === 'CQS' && (getSelectedCQSVendors().length < 1 || getSelectedCQSVendors().length > 10)
      ? 'BidderList'
      : requestedView;
    document.querySelectorAll('.nav-btn').forEach(button => button.classList.toggle('active', button.dataset.view === currentView));
  }

  updateDollarKPI();
  renderCurrent();
}

window.addEventListener('online', () => {
  retryBidderProcurementPending({ silent: true });
});

initializeBidderWorkspace();
