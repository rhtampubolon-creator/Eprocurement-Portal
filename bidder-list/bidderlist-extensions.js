/*
 * SHADOW CONSOLIDATION BUNDLE — NOT LOADED BY PRODUCTION
 * Generated from active files without refactoring.
 * Source order is preserved exactly as listed below.
 * Do not reference this bundle until regression verification passes.
 * Sources:
 * - bidder-list/local-pr-bridge.js
 * - bidder-list/storage-sidebar.js
 * - bidder-list/local-document-view-bridge.js
 * - bidder-list/internal-email-release-pr-v3516.js
 * - bidder-list/rfq-excel-import-v3523.js
 */

/* ===== BEGIN ORIGINAL: bidder-list/local-pr-bridge.js ===== */
(function () {
  'use strict';

  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const DB_STORE = 'handles';
  const PR_ROOT_KEY = 'prRoot';
  const TC_ROOT_KEY = 'tcRoot';
  const LOCAL_PR_ID_PREFIX = 'localpr|';
  const LOCAL_TC_ID_PREFIX = 'localtc|';
  const PROJECT_FOLDER_TYPES = new Set([
    '01. PR Approval',
    '02. Bidderlist & Quotation',
    '03. CQS',
    '04. PO',
    '05. Contract'
  ]);
  const ROUND_FOLDER_TYPES = new Set(['02. Bidderlist & Quotation', '03. CQS']);
  const MAX_INLINE_ATTACHMENT_BYTES = 20 * 1024 * 1024;

  let startupLazyGuard = true;
  let overridesInstalled = false;
  let allowExplicitDocumentRefresh = false;
  let storageSetupReady = false;

  const nativeFetch = window.fetch.bind(window);
  const nativeWarn = console.warn.bind(console);

  function asText(value) {
    return value == null ? '' : String(value).trim();
  }

  function isTemplateStartupRequest(input) {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    if (!url) return false;
    return /[?&]action=(?:getMasterTemplate|GET_MASTER_TEMPLATE)(?:&|$)/i.test(url) ||
      /\/(?:bidder-list|Template)\/(?:Bidderlist|RFQ|CQS)\.xlsx(?:[?#]|$)/i.test(url);
  }

  window.fetch = function (input, init) {
    if (startupLazyGuard && isTemplateStartupRequest(input)) {
      const error = new Error('__MSW_LAZY_TEMPLATE_STARTUP__');
      error.code = 'MSW_LAZY_TEMPLATE_STARTUP';
      return Promise.reject(error);
    }
    return nativeFetch(input, init);
  };

  console.warn = function (...args) {
    if (startupLazyGuard) {
      const value = args.map(arg => {
        if (arg instanceof Error) return `${arg.message || ''} ${arg.stack || ''}`;
        try { return typeof arg === 'string' ? arg : JSON.stringify(arg); }
        catch (_) { return String(arg || ''); }
      }).join(' ');
      if (/MSW_LAZY_TEMPLATE_STARTUP|Master\s+(?:Bidderlist|RFQ|CQS)|Fallback master lokal|Google Drive.*gagal dimuat/i.test(value)) {
        return;
      }
    }
    nativeWarn(...args);
  };

  window.addEventListener('load', () => {
    window.setTimeout(() => { startupLazyGuard = false; }, 0);
  }, { once: true });

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadHandle(key) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const request = tx.objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function saveHandle(key, handle) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(handle, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Penyimpanan akses folder dibatalkan.'));
      });
    } finally {
      db.close();
    }
  }

  async function permissionState(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return 'prompt';
    try { return await handle.queryPermission({ mode: 'readwrite' }); }
    catch (_) { return 'prompt'; }
  }

  async function ensurePermission(handle, requestPermission) {
    if (!handle) return false;
    const options = { mode: 'readwrite' };
    try {
      if ((await handle.queryPermission(options)) === 'granted') return true;
      return Boolean(requestPermission && (await handle.requestPermission(options)) === 'granted');
    } catch (_) {
      return false;
    }
  }

  function validateSelectedFolder(handle, expectedName, label) {
    const actual = asText(handle?.name);
    if (actual.toUpperCase() !== expectedName.toUpperCase()) {
      throw new Error(`${label} harus memilih folder bernama "${expectedName}". Folder terpilih: ${actual || '-'}`);
    }
  }

  async function chooseStorageFolder(key, expectedName, label) {
    if (typeof window.showDirectoryPicker !== 'function' || !window.isSecureContext) {
      throw new Error('Pemilihan folder lokal membutuhkan Microsoft Edge/Google Chrome desktop melalui HTTPS.');
    }
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    validateSelectedFolder(handle, expectedName, label);
    await saveHandle(key, handle);
    return handle;
  }

  async function getConnectedRoot(key, expectedName, label, requestPermission = true) {
    const root = await loadHandle(key);
    if (!root) throw new Error(`${label} belum dipilih pada Storage Setup.`);
    validateSelectedFolder(root, expectedName, label);
    if (!(await ensurePermission(root, requestPermission))) {
      throw new Error(`Izin akses ${label} belum aktif. Buka Storage Setup dan klik Aktifkan.`);
    }
    return root;
  }

  function getConnectedPrRoot(requestPermission = true) {
    return getConnectedRoot(PR_ROOT_KEY, 'PR', 'Folder PR / Log Book', requestPermission);
  }

  function getConnectedTcRoot(requestPermission = true) {
    return getConnectedRoot(TC_ROOT_KEY, 'Original TC', 'Folder Master TC', requestPermission);
  }

  function setupStyle() {
    if (document.getElementById('mswStorageSetupStyle')) return;
    const style = document.createElement('style');
    style.id = 'mswStorageSetupStyle';
    style.textContent = `
      body.msw-storage-locked { overflow: hidden !important; }
      #mswStorageSetupGate { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(15, 23, 42, .72); backdrop-filter: blur(5px); }
      #mswStorageSetupGate[hidden] { display: none !important; }
      .msw-storage-card { width: min(760px, 96vw); max-height: 94vh; overflow: auto; background: #fff; border-radius: 18px; box-shadow: 0 24px 80px rgba(15,23,42,.35); border: 1px solid #e2e8f0; }
      .msw-storage-head { padding: 22px 24px 16px; border-bottom: 1px solid #e2e8f0; }
      .msw-storage-head h2 { margin: 0 0 6px; color: #0f172a; font-size: 22px; }
      .msw-storage-head p { margin: 0; color: #64748b; font-size: 13px; line-height: 1.55; }
      .msw-storage-body { padding: 20px 24px; display: grid; gap: 14px; }
      .msw-storage-row { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; padding: 16px; border: 1px solid #e2e8f0; border-radius: 14px; background: #f8fafc; }
      .msw-storage-row h3 { margin: 0 0 5px; color: #0f172a; font-size: 15px; }
      .msw-storage-path { margin: 0 0 5px; color: #334155; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
      .msw-storage-status { margin: 0; font-size: 12px; }
      .msw-storage-status.ok { color: #047857; }
      .msw-storage-status.warn { color: #b45309; }
      .msw-storage-status.bad { color: #b91c1c; }
      .msw-storage-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .msw-storage-btn { border: 1px solid #cbd5e1; border-radius: 9px; background: #fff; color: #0f172a; padding: 9px 12px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
      .msw-storage-btn:hover { background: #f1f5f9; }
      .msw-storage-btn:disabled { opacity: .48; cursor: not-allowed; }
      .msw-storage-footer { padding: 0 24px 22px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .msw-storage-note { color: #64748b; font-size: 12px; line-height: 1.45; }
      #mswEnterWorkspaceBtn { border: 0; border-radius: 10px; background: #0f172a; color: #fff; padding: 11px 18px; font-weight: 800; cursor: pointer; white-space: nowrap; }
      #mswEnterWorkspaceBtn:disabled { background: #94a3b8; cursor: not-allowed; }
      @media (max-width: 720px) { .msw-storage-row { grid-template-columns: 1fr; } .msw-storage-actions { justify-content: flex-start; } .msw-storage-footer { align-items: stretch; flex-direction: column; } #mswEnterWorkspaceBtn { width: 100%; } }
    `;
    document.head.appendChild(style);
  }

  function buildStorageSetupGate() {
    if (document.getElementById('mswStorageSetupGate')) return document.getElementById('mswStorageSetupGate');
    setupStyle();
    const gate = document.createElement('div');
    gate.id = 'mswStorageSetupGate';
    gate.innerHTML = `
      <div class="msw-storage-card" role="dialog" aria-modal="true" aria-labelledby="mswStorageSetupTitle">
        <div class="msw-storage-head">
          <h2 id="mswStorageSetupTitle">Procurement Storage Setup</h2>
          <p>Tentukan lokasi file sebelum masuk Procurement Workspace. Lokasi boleh OneDrive atau drive lain; portal hanya menyimpan izin folder pada browser ini dan tidak menyimpan path Windows lengkap.</p>
        </div>
        <div class="msw-storage-body">
          <div class="msw-storage-row">
            <div>
              <h3>Folder Log Book / PR</h3>
              <p class="msw-storage-path" id="mswPrFolderName">Belum dipilih</p>
              <p class="msw-storage-status warn" id="mswPrFolderStatus">Pilih folder kerja bernama PR.</p>
            </div>
            <div class="msw-storage-actions">
              <button type="button" class="msw-storage-btn" id="mswActivatePrBtn">Aktifkan</button>
              <button type="button" class="msw-storage-btn" id="mswChoosePrBtn">Pilih / Ganti Folder</button>
            </div>
          </div>
          <div class="msw-storage-row">
            <div>
              <h3>Folder Master TC</h3>
              <p class="msw-storage-path" id="mswTcFolderName">Belum dipilih</p>
              <p class="msw-storage-status warn" id="mswTcFolderStatus">Pilih folder bernama Original TC.</p>
            </div>
            <div class="msw-storage-actions">
              <button type="button" class="msw-storage-btn" id="mswActivateTcBtn">Aktifkan</button>
              <button type="button" class="msw-storage-btn" id="mswChooseTcBtn">Pilih / Ganti Folder</button>
            </div>
          </div>
        </div>
        <div class="msw-storage-footer">
          <div class="msw-storage-note" id="mswStorageSetupNote">Kedua folder harus siap sebelum workspace dibuka.</div>
          <button type="button" id="mswEnterWorkspaceBtn" disabled>Masuk Procurement Workspace</button>
        </div>
      </div>`;
    document.body.appendChild(gate);
    document.body.classList.add('msw-storage-locked');
    return gate;
  }

  function setSetupStatus(prefix, handle, state, errorMessage = '') {
    const nameEl = document.getElementById(`msw${prefix}FolderName`);
    const statusEl = document.getElementById(`msw${prefix}FolderStatus`);
    const activateBtn = document.getElementById(`mswActivate${prefix}Btn`);
    if (!nameEl || !statusEl || !activateBtn) return;

    nameEl.textContent = handle?.name || 'Belum dipilih';
    statusEl.className = 'msw-storage-status';
    if (errorMessage) {
      statusEl.textContent = errorMessage;
      statusEl.classList.add('bad');
      activateBtn.disabled = !handle;
      return;
    }
    if (!handle) {
      statusEl.textContent = prefix === 'Pr' ? 'Pilih folder kerja bernama PR.' : 'Pilih folder bernama Original TC.';
      statusEl.classList.add('warn');
      activateBtn.disabled = true;
      return;
    }
    if (state === 'granted') {
      statusEl.textContent = '✓ Terhubung dan izin aktif';
      statusEl.classList.add('ok');
      activateBtn.disabled = true;
    } else {
      statusEl.textContent = 'Folder tersimpan. Klik Aktifkan untuk memberikan izin akses sesi ini.';
      statusEl.classList.add('warn');
      activateBtn.disabled = false;
    }
  }

  async function refreshStorageSetup() {
    const enterBtn = document.getElementById('mswEnterWorkspaceBtn');
    const note = document.getElementById('mswStorageSetupNote');
    let prReady = false;
    let tcReady = false;

    try {
      const pr = await loadHandle(PR_ROOT_KEY);
      if (pr) validateSelectedFolder(pr, 'PR', 'Folder PR / Log Book');
      const state = pr ? await permissionState(pr) : 'prompt';
      prReady = Boolean(pr && state === 'granted');
      setSetupStatus('Pr', pr, state);
    } catch (error) {
      setSetupStatus('Pr', await loadHandle(PR_ROOT_KEY).catch(() => null), 'prompt', error?.message || String(error));
    }

    try {
      const tc = await loadHandle(TC_ROOT_KEY);
      if (tc) validateSelectedFolder(tc, 'Original TC', 'Folder Master TC');
      const state = tc ? await permissionState(tc) : 'prompt';
      tcReady = Boolean(tc && state === 'granted');
      setSetupStatus('Tc', tc, state);
    } catch (error) {
      setSetupStatus('Tc', await loadHandle(TC_ROOT_KEY).catch(() => null), 'prompt', error?.message || String(error));
    }

    storageSetupReady = prReady && tcReady;
    if (enterBtn) enterBtn.disabled = !storageSetupReady;
    if (note) note.textContent = storageSetupReady
      ? 'Storage siap. File project akan mengikuti PR aktif; Attachment TC membaca Original TC.'
      : 'Kedua folder harus siap sebelum workspace dibuka.';
    return storageSetupReady;
  }

  async function activateStoredFolder(key, expectedName, label) {
    const handle = await loadHandle(key);
    if (!handle) throw new Error(`${label} belum dipilih.`);
    validateSelectedFolder(handle, expectedName, label);
    if (!(await ensurePermission(handle, true))) throw new Error(`Izin ${label} tidak diberikan.`);
    return handle;
  }

  function wireStorageSetup() {
    const gate = buildStorageSetupGate();
    if (gate.dataset.wired === 'true') return;
    gate.dataset.wired = 'true';

    const run = async action => {
      const note = document.getElementById('mswStorageSetupNote');
      try {
        if (note) note.textContent = 'Memproses akses folder...';
        await action();
      } catch (error) {
        if (error?.name !== 'AbortError' && note) note.textContent = error?.message || String(error);
      } finally {
        await refreshStorageSetup();
      }
    };

    document.getElementById('mswChoosePrBtn')?.addEventListener('click', () => run(() => chooseStorageFolder(PR_ROOT_KEY, 'PR', 'Folder PR / Log Book')));
    document.getElementById('mswChooseTcBtn')?.addEventListener('click', () => run(() => chooseStorageFolder(TC_ROOT_KEY, 'Original TC', 'Folder Master TC')));
    document.getElementById('mswActivatePrBtn')?.addEventListener('click', () => run(() => activateStoredFolder(PR_ROOT_KEY, 'PR', 'Folder PR / Log Book')));
    document.getElementById('mswActivateTcBtn')?.addEventListener('click', () => run(() => activateStoredFolder(TC_ROOT_KEY, 'Original TC', 'Folder Master TC')));
    document.getElementById('mswEnterWorkspaceBtn')?.addEventListener('click', async () => {
      if (!(await refreshStorageSetup())) return;
      gate.hidden = true;
      document.body.classList.remove('msw-storage-locked');
    });

    refreshStorageSetup().catch(() => null);
  }

  function normalizeBasePr(value) {
    return asText(value)
      .replace(/\s*\(\s*Line[^)]*\)\s*$/i, '')
      .replace(/\s+R\s*\d+\s*$/i, '')
      .trim();
  }

  function isPrefixMatch(folderName, basePr) {
    const name = asText(folderName);
    const base = asText(basePr);
    if (!name || !base) return false;
    const upperName = name.toUpperCase();
    const upperBase = base.toUpperCase();
    if (!upperName.startsWith(upperBase)) return false;
    if (upperName.length === upperBase.length) return true;
    const boundary = name.charAt(base.length);
    return !boundary || /[\s\-_(]/.test(boundary);
  }

  async function findExistingPrFolder(root, noPr) {
    const basePr = normalizeBasePr(noPr);
    if (!basePr) throw new Error('No PR belum tersedia.');

    try {
      const exact = await root.getDirectoryHandle(basePr, { create: false });
      return { handle: exact, name: exact.name, basePr };
    } catch (_) {}

    const matches = [];
    for await (const [name, handle] of root.entries()) {
      if (handle.kind !== 'directory') continue;
      if (isPrefixMatch(name, basePr)) matches.push({ handle, name, basePr });
    }

    if (!matches.length) {
      throw new Error(`Folder PR ${basePr} tidak ditemukan di root PR. Portal tidak membuat folder PR baru.`);
    }
    if (matches.length > 1) {
      const names = matches.map(item => item.name).sort((a, b) => a.localeCompare(b, 'id')).join('; ');
      throw new Error(`Ditemukan lebih dari satu folder untuk ${basePr}: ${names}. Rapikan nama folder agar unik.`);
    }
    return matches[0];
  }

  function normalizeRound(value) {
    const match = asText(value).toUpperCase().match(/R\s*(\d+)/);
    return match ? `R${Number(match[1])}` : 'R0';
  }

  function currentProjectContext() {
    const meta = typeof getBidderMeta === 'function' ? getBidderMeta() : {};
    const noPr = asText(meta?.nopr || meta?.noPR || meta?.['No PR']);
    const round = typeof getDocumentRound === 'function'
      ? normalizeRound(getDocumentRound(meta))
      : normalizeRound(meta?.round || meta?.revision || meta?.rev || 'R0');
    return { meta, noPr, round };
  }

  async function getProjectFolderHandle(sourceType, options = {}) {
    const root = await getConnectedPrRoot(options.requestPermission !== false);
    const context = currentProjectContext();
    const prFolder = await findExistingPrFolder(root, context.noPr);
    let directory = prFolder.handle;

    try {
      directory = await directory.getDirectoryHandle(sourceType, { create: false });
      if (ROUND_FOLDER_TYPES.has(sourceType)) {
        directory = await directory.getDirectoryHandle(context.round, { create: false });
      }
    } catch (error) {
      if (error?.name === 'NotFoundError') return { directory: null, prFolder, context, sourceType };
      throw error;
    }
    return { directory, prFolder, context, sourceType };
  }

  function mimeFromName(name, fallback) {
    if (fallback) return fallback;
    const ext = asText(name).split('.').pop().toLowerCase();
    return ({
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
      xls: 'application/vnd.ms-excel',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ppt: 'application/vnd.ms-powerpoint',
      txt: 'text/plain',
      csv: 'text/csv',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      zip: 'application/zip'
    })[ext] || 'application/octet-stream';
  }

  function createLocalPrFileId(prFolderName, sourceType, round, fileName) {
    return ['localpr', encodeURIComponent(prFolderName), encodeURIComponent(sourceType), encodeURIComponent(round || ''), encodeURIComponent(fileName)].join('|');
  }

  function createLocalTcFileId(fileName) {
    return `localtc|${encodeURIComponent(fileName)}`;
  }

  function parseLocalPrFileId(fileId) {
    const raw = asText(fileId);
    if (!raw.startsWith(LOCAL_PR_ID_PREFIX)) return null;
    const parts = raw.split('|');
    if (parts.length !== 5) return null;
    try {
      return {
        kind: 'pr',
        prFolderName: decodeURIComponent(parts[1]),
        sourceType: decodeURIComponent(parts[2]),
        round: decodeURIComponent(parts[3]),
        fileName: decodeURIComponent(parts[4])
      };
    } catch (_) { return null; }
  }

  function parseLocalTcFileId(fileId) {
    const raw = asText(fileId);
    if (!raw.startsWith(LOCAL_TC_ID_PREFIX)) return null;
    try {
      return { kind: 'tc', fileName: decodeURIComponent(raw.slice(LOCAL_TC_ID_PREFIX.length)) };
    } catch (_) { return null; }
  }

  function parseLocalFileId(fileId) {
    return parseLocalPrFileId(fileId) || parseLocalTcFileId(fileId);
  }

  async function listLocalProjectFiles(sourceType) {
    const target = await getProjectFolderHandle(sourceType, { requestPermission: true });
    if (!target.directory) return [];
    const files = [];
    for await (const [name, handle] of target.directory.entries()) {
      if (handle.kind !== 'file') continue;
      const file = await handle.getFile();
      files.push({
        fileId: createLocalPrFileId(target.prFolder.name, sourceType, ROUND_FOLDER_TYPES.has(sourceType) ? target.context.round : '', name),
        fileName: name,
        fileUrl: '',
        downloadUrl: '',
        previewUrl: '',
        mimeType: mimeFromName(name, file.type),
        size: Number(file.size || 0),
        folderType: sourceType,
        folderName: target.prFolder.name,
        source: 'LOCAL_PR'
      });
    }
    return files.sort((a, b) => a.fileName.localeCompare(b.fileName, 'id', { numeric: true }));
  }

  async function listLocalTcFiles() {
    const root = await getConnectedTcRoot(true);
    const files = [];
    for await (const [name, handle] of root.entries()) {
      if (handle.kind !== 'file') continue;
      const file = await handle.getFile();
      files.push({
        fileId: createLocalTcFileId(name),
        fileName: name,
        fileUrl: '',
        downloadUrl: '',
        previewUrl: '',
        mimeType: mimeFromName(name, file.type),
        size: Number(file.size || 0),
        folderType: 'TC_MASTER',
        folderName: root.name,
        source: 'LOCAL_TC'
      });
    }
    return files.sort((a, b) => a.fileName.localeCompare(b.fileName, 'id', { numeric: true }));
  }

  async function resolveLocalFile(fileOrId) {
    const fileId = typeof fileOrId === 'string' ? fileOrId : fileOrId?.fileId;
    const parsed = parseLocalFileId(fileId);
    if (!parsed) throw new Error('Referensi file lokal tidak valid.');

    if (parsed.kind === 'tc') {
      const root = await getConnectedTcRoot(true);
      try {
        const handle = await root.getFileHandle(parsed.fileName, { create: false });
        return await handle.getFile();
      } catch (error) {
        if (error?.name === 'NotFoundError') throw new Error(`TC ${parsed.fileName} tidak ditemukan lagi pada folder Original TC.`);
        throw error;
      }
    }

    const root = await getConnectedPrRoot(true);
    try {
      let directory = await root.getDirectoryHandle(parsed.prFolderName, { create: false });
      directory = await directory.getDirectoryHandle(parsed.sourceType, { create: false });
      if (parsed.round && ROUND_FOLDER_TYPES.has(parsed.sourceType)) directory = await directory.getDirectoryHandle(parsed.round, { create: false });
      const handle = await directory.getFileHandle(parsed.fileName, { create: false });
      return await handle.getFile();
    } catch (error) {
      if (error?.name === 'NotFoundError') throw new Error(`File ${parsed.fileName} tidak ditemukan lagi pada folder PR lokal.`);
      throw error;
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.includes(',') ? result.split(',').pop() : result);
      };
      reader.onerror = () => reject(reader.error || new Error(`Gagal membaca ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  function markExplicitDocumentRefresh(event) {
    const target = event.target instanceof Element ? event.target.closest('.stored-document-view-btn, .stored-document-refresh-btn') : null;
    if (!target) return;
    allowExplicitDocumentRefresh = true;
    window.setTimeout(() => { allowExplicitDocumentRefresh = false; }, 3000);
  }

  function installOverrides() {
    if (overridesInstalled || document.readyState === 'loading') return;
    overridesInstalled = true;

    if (typeof loadMultipleEmailFolderFiles === 'function') {
      const originalLoadMultipleEmailFolderFiles = loadMultipleEmailFolderFiles;
      window.loadMultipleEmailFolderFiles = async function (folderType) {
        const sourceType = asText(folderType || '01. PR Approval');
        let files;
        if (PROJECT_FOLDER_TYPES.has(sourceType)) {
          files = await listLocalProjectFiles(sourceType);
        } else if (sourceType === 'TC_MASTER') {
          files = await listLocalTcFiles();
        } else {
          return originalLoadMultipleEmailFolderFiles(sourceType);
        }
        MULTIPLE_EMAIL_FOLDER_FILES = files;
        if (typeof renderMultipleEmailAttachmentFileList === 'function') renderMultipleEmailAttachmentFileList();
        return { success: true, source: sourceType === 'TC_MASTER' ? 'LOCAL_TC' : 'LOCAL_PR', folderType: sourceType, files };
      };
    }

    if (typeof openOriginalProcurementFile === 'function') {
      const originalOpenOriginalProcurementFile = openOriginalProcurementFile;
      window.openOriginalProcurementFile = async function (file) {
        if (!parseLocalFileId(file?.fileId)) return originalOpenOriginalProcurementFile(file);
        try {
          const localFile = await resolveLocalFile(file);
          const url = URL.createObjectURL(localFile);
          const opened = window.open(url, '_blank', 'noopener,noreferrer');
          if (!opened) {
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = localFile.name;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
          }
          window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) {
          alert(error?.message || 'File lokal tidak dapat dibuka.');
        }
      };
    }

    if (typeof requestOutlookDraftEml === 'function') {
      const originalRequestOutlookDraftEml = requestOutlookDraftEml;
      window.requestOutlookDraftEml = async function (payload = {}) {
        const ids = Array.isArray(payload.attachmentFileIds) ? payload.attachmentFileIds.slice() : [];
        const backendIds = [];
        const inlineAttachments = Array.isArray(payload.attachments) ? payload.attachments.slice() : [];
        let localBytes = 0;

        for (const fileId of ids) {
          if (!parseLocalFileId(fileId)) {
            backendIds.push(fileId);
            continue;
          }
          const file = await resolveLocalFile(fileId);
          localBytes += Number(file.size || 0);
          if (localBytes > MAX_INLINE_ATTACHMENT_BYTES) {
            throw new Error('Total attachment lokal melebihi 20 MB. Kurangi jumlah/ukuran file sebelum membuat Outlook Draft.');
          }
          inlineAttachments.push({ fileName: file.name, mimeType: mimeFromName(file.name, file.type), base64: await fileToBase64(file) });
        }

        return originalRequestOutlookDraftEml({ ...payload, attachmentFileIds: backendIds, attachments: inlineAttachments });
      };
    }

    if (typeof scheduleNativeDocumentSync === 'function') {
      window.scheduleNativeDocumentSync = function () {
        // Dokumen native tidak dibuat/di-sync hanya karena autosave workspace.
      };
    }

    if (typeof refreshProcurementDocuments === 'function') {
      const originalRefreshProcurementDocuments = refreshProcurementDocuments;
      window.refreshProcurementDocuments = async function (options = {}) {
        if (!allowExplicitDocumentRefresh) {
          try {
            if (typeof updateProcurementDocumentViewButtons === 'function') updateProcurementDocumentViewButtons();
            return typeof PROCUREMENT_DOCUMENT_STATE !== 'undefined' ? (PROCUREMENT_DOCUMENT_STATE.documents || {}) : {};
          } catch (_) { return {}; }
        }
        allowExplicitDocumentRefresh = false;
        return originalRefreshProcurementDocuments(options);
      };
      document.addEventListener('click', markExplicitDocumentRefresh, true);
    }

    window.MSW_BIDDER_LOCAL_PR_BRIDGE = Object.freeze({
      listLocalProjectFiles,
      listLocalTcFiles,
      resolveLocalFile,
      findExistingPrFolder,
      normalizeBasePr,
      refreshStorageSetup,
      getConnectedPrRoot,
      getConnectedTcRoot
    });
  }

  function initStorageSetup() {
    if (!document.body) return;
    wireStorageSetup();
  }

  document.addEventListener('readystatechange', installOverrides);
  document.addEventListener('DOMContentLoaded', () => {
    installOverrides();
    initStorageSetup();
  }, { once: true });
  window.setTimeout(installOverrides, 0);
})();

/* ===== END ORIGINAL: bidder-list/local-pr-bridge.js ===== */

/* ===== BEGIN ORIGINAL: bidder-list/storage-sidebar.js ===== */
(function () {
  'use strict';

  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const DB_STORE = 'handles';
  const PR_ROOT_KEY = 'prRoot';
  const TC_ROOT_KEY = 'tcRoot';

  // Gate lama tidak boleh menghalangi user setiap membuka PR.
  const antiGateStyle = document.createElement('style');
  antiGateStyle.id = 'mswStorageSidebarAntiGate';
  antiGateStyle.textContent = '#mswStorageSetupGate{display:none!important}body.msw-storage-locked{overflow:auto!important}';
  (document.head || document.documentElement).appendChild(antiGateStyle);

  function hideLegacyGate() {
    const gate = document.getElementById('mswStorageSetupGate');
    if (gate) gate.hidden = true;
    document.body?.classList.remove('msw-storage-locked');
  }

  const gateObserver = new MutationObserver(hideLegacyGate);
  gateObserver.observe(document.documentElement, { childList: true, subtree: true });

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadHandle(key) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const request = tx.objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function saveHandle(key, handle) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(handle, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Penyimpanan folder dibatalkan.'));
      });
    } finally {
      db.close();
    }
  }

  async function permissionState(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return 'prompt';
    try { return await handle.queryPermission({ mode: 'readwrite' }); }
    catch (_) { return 'prompt'; }
  }

  async function requestStoredPermission(handle) {
    if (!handle) return false;
    try {
      const options = { mode: 'readwrite' };
      if ((await handle.queryPermission(options)) === 'granted') return true;
      return (await handle.requestPermission(options)) === 'granted';
    } catch (_) {
      return false;
    }
  }

  function validateFolder(handle, expectedName, label) {
    const actual = String(handle?.name || '').trim();
    if (actual.toUpperCase() !== expectedName.toUpperCase()) {
      throw new Error(`${label} harus memilih folder bernama "${expectedName}". Folder terpilih: ${actual || '-'}`);
    }
  }

  async function chooseFolder(key, expectedName, label) {
    if (typeof window.showDirectoryPicker !== 'function' || !window.isSecureContext) {
      throw new Error('Gunakan Microsoft Edge/Google Chrome desktop melalui HTTPS untuk memilih folder.');
    }
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    validateFolder(handle, expectedName, label);
    await saveHandle(key, handle); // auto-save, tidak ada tombol Save terpisah
    return handle;
  }

  function injectStyle() {
    if (document.getElementById('mswStorageSidebarStyle')) return;
    const style = document.createElement('style');
    style.id = 'mswStorageSidebarStyle';
    style.textContent = `
      #mswStorageSidebarCard{margin:14px 10px 8px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(248,250,252,.72);font-family:inherit}
      #mswStorageSidebarCard .msw-storage-summary{display:flex;align-items:center;justify-content:space-between;gap:8px}
      #mswStorageSidebarCard .msw-storage-title{font-size:11px;font-weight:800;letter-spacing:.04em;color:#334155;text-transform:uppercase}
      #mswStorageSidebarCard .msw-storage-badge{font-size:10px;font-weight:700;color:#047857;white-space:nowrap}
      #mswStorageSidebarCard .msw-storage-badge.warn{color:#b45309}
      #mswStorageSidebarCard button{font:inherit}
      #mswStorageSidebarCard .msw-storage-manage{border:0;background:transparent;color:#2563eb;font-size:10px;font-weight:700;cursor:pointer;padding:2px}
      #mswStorageSidebarDetails{margin-top:9px;display:grid;gap:8px}
      #mswStorageSidebarDetails[hidden]{display:none!important}
      .msw-storage-side-row{padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:#fff}
      .msw-storage-side-label{font-size:10px;font-weight:800;color:#475569;margin-bottom:3px}
      .msw-storage-side-name{font-size:11px;font-weight:700;color:#0f172a;overflow-wrap:anywhere;margin-bottom:5px}
      .msw-storage-side-status{font-size:9px;color:#64748b;margin-bottom:6px}
      .msw-storage-side-status.ok{color:#047857}.msw-storage-side-status.warn{color:#b45309}
      .msw-storage-side-actions{display:flex;gap:5px;flex-wrap:wrap}
      .msw-storage-side-actions button{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:6px;padding:4px 7px;font-size:9px;font-weight:700;cursor:pointer}
      .msw-storage-side-actions button:hover{background:#f8fafc}
      #mswStorageSidebarMessage{font-size:9px;color:#b45309;line-height:1.35;margin-top:3px}
    `;
    document.head.appendChild(style);
  }

  function buildSidebarCard(aside) {
    if (document.getElementById('mswStorageSidebarCard')) return;
    injectStyle();
    const card = document.createElement('div');
    card.id = 'mswStorageSidebarCard';
    card.innerHTML = `
      <div class="msw-storage-summary">
        <div>
          <div class="msw-storage-title">Storage Location</div>
          <div id="mswStorageSidebarBadge" class="msw-storage-badge warn">Belum lengkap</div>
        </div>
        <button type="button" id="mswStorageManageBtn" class="msw-storage-manage">Atur</button>
      </div>
      <div id="mswStorageSidebarDetails">
        <div class="msw-storage-side-row">
          <div class="msw-storage-side-label">Log Book / PR</div>
          <div id="mswSidebarPrName" class="msw-storage-side-name">Belum dipilih</div>
          <div id="mswSidebarPrStatus" class="msw-storage-side-status warn">Pilih folder PR satu kali.</div>
          <div class="msw-storage-side-actions">
            <button type="button" id="mswSidebarChoosePr">Pilih / Ganti</button>
            <button type="button" id="mswSidebarActivatePr" hidden>Aktifkan</button>
          </div>
        </div>
        <div class="msw-storage-side-row">
          <div class="msw-storage-side-label">Master TC</div>
          <div id="mswSidebarTcName" class="msw-storage-side-name">Belum dipilih</div>
          <div id="mswSidebarTcStatus" class="msw-storage-side-status warn">Pilih folder Original TC satu kali.</div>
          <div class="msw-storage-side-actions">
            <button type="button" id="mswSidebarChooseTc">Pilih / Ganti</button>
            <button type="button" id="mswSidebarActivateTc" hidden>Aktifkan</button>
          </div>
        </div>
        <div id="mswStorageSidebarMessage"></div>
      </div>`;
    aside.appendChild(card);
  }

  async function refreshSidebar(options = {}) {
    const pr = await loadHandle(PR_ROOT_KEY).catch(() => null);
    const tc = await loadHandle(TC_ROOT_KEY).catch(() => null);
    const prState = pr ? await permissionState(pr) : 'missing';
    const tcState = tc ? await permissionState(tc) : 'missing';

    const prName = document.getElementById('mswSidebarPrName');
    const tcName = document.getElementById('mswSidebarTcName');
    const prStatus = document.getElementById('mswSidebarPrStatus');
    const tcStatus = document.getElementById('mswSidebarTcStatus');
    const prActivate = document.getElementById('mswSidebarActivatePr');
    const tcActivate = document.getElementById('mswSidebarActivateTc');
    const badge = document.getElementById('mswStorageSidebarBadge');
    const details = document.getElementById('mswStorageSidebarDetails');

    if (!prName || !tcName) return;
    prName.textContent = pr?.name || 'Belum dipilih';
    tcName.textContent = tc?.name || 'Belum dipilih';

    prStatus.className = 'msw-storage-side-status ' + (pr ? (prState === 'granted' ? 'ok' : 'warn') : 'warn');
    tcStatus.className = 'msw-storage-side-status ' + (tc ? (tcState === 'granted' ? 'ok' : 'warn') : 'warn');
    prStatus.textContent = !pr ? 'Belum diset.' : (prState === 'granted' ? '✓ Tersimpan otomatis' : 'Tersimpan • izin browser perlu diaktifkan bila diperlukan.');
    tcStatus.textContent = !tc ? 'Belum diset.' : (tcState === 'granted' ? '✓ Tersimpan otomatis' : 'Tersimpan • izin browser perlu diaktifkan bila diperlukan.');
    prActivate.hidden = !pr || prState === 'granted';
    tcActivate.hidden = !tc || tcState === 'granted';

    const complete = Boolean(pr && tc);
    badge.textContent = complete ? '✓ PR & TC tersimpan' : 'Belum lengkap';
    badge.classList.toggle('warn', !complete);

    // Setelah setup pertama lengkap, otomatis ringkas. Tidak meminta lagi saat buka PR berikutnya.
    if (complete && options.initial) details.hidden = true;
    if (!complete) details.hidden = false;
  }

  function setMessage(message) {
    const el = document.getElementById('mswStorageSidebarMessage');
    if (el) el.textContent = message || '';
  }

  function wireSidebar() {
    const aside = document.querySelector('main aside') || document.querySelector('aside');
    if (!aside) return false;
    buildSidebarCard(aside);

    const details = document.getElementById('mswStorageSidebarDetails');
    document.getElementById('mswStorageManageBtn')?.addEventListener('click', () => {
      details.hidden = !details.hidden;
    });

    const run = async action => {
      setMessage('');
      try {
        await action();
        await refreshSidebar();
      } catch (error) {
        if (error?.name !== 'AbortError') setMessage(error?.message || String(error));
      }
    };

    document.getElementById('mswSidebarChoosePr')?.addEventListener('click', () => run(() => chooseFolder(PR_ROOT_KEY, 'PR', 'Folder Log Book / PR')));
    document.getElementById('mswSidebarChooseTc')?.addEventListener('click', () => run(() => chooseFolder(TC_ROOT_KEY, 'Original TC', 'Folder Master TC')));
    document.getElementById('mswSidebarActivatePr')?.addEventListener('click', () => run(async () => {
      const handle = await loadHandle(PR_ROOT_KEY);
      if (!(await requestStoredPermission(handle))) throw new Error('Izin Folder PR belum diberikan.');
    }));
    document.getElementById('mswSidebarActivateTc')?.addEventListener('click', () => run(async () => {
      const handle = await loadHandle(TC_ROOT_KEY);
      if (!(await requestStoredPermission(handle))) throw new Error('Izin Folder TC belum diberikan.');
    }));

    refreshSidebar({ initial: true }).catch(() => null);
    return true;
  }

  function init() {
    hideLegacyGate();
    if (wireSidebar()) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      hideLegacyGate();
      tries += 1;
      if (wireSidebar() || tries > 40) window.clearInterval(timer);
    }, 100);
  }

  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
/* ===== END ORIGINAL: bidder-list/storage-sidebar.js ===== */

/* ===== BEGIN ORIGINAL: bidder-list/local-document-view-bridge.js ===== */
(function(){
  'use strict';

  const ROUND_TYPES=new Set(['02. Bidderlist & Quotation','03. CQS']);
  const TYPE_CONFIG={
    BIDDERLIST:{folder:'02. Bidderlist & Quotation',label:'BidderList'},
    RFQ:{folder:'02. Bidderlist & Quotation',label:'RFQ'},
    CQS:{folder:'03. CQS',label:'CQS'}
  };
  const text=v=>v==null?'':String(v).trim();
  const identity=()=>window.MSW_PR_IDENTITY;
  let activeObjectUrl='';

  function currentContext(){
    const meta=typeof getBidderMeta==='function'?getBidderMeta():{};
    const noPR=text(meta?.nopr||meta?.noPR||meta?.['No PR']||new URLSearchParams(location.search).get('noPR'));
    let round='';
    try{if(typeof getDocumentRound==='function')round=text(getDocumentRound(meta));}catch(_){}
    const base=identity()?.getBasePR(noPR)||noPR;
    round=identity()?.getRevisionRound(noPR)||identity()?.normalizeRound(round,'R0')||'R0';
    return {meta,noPR,base,round};
  }

  async function rootHandle(){
    const bridge=window.MSW_BIDDER_LOCAL_PR_BRIDGE;
    if(bridge?.getConnectedPrRoot)return bridge.getConnectedPrRoot(true);
    throw new Error('Folder PR belum dipilih pada Storage Location.');
  }

  function matchFolder(name,base){return identity()?.isProjectFolderMatch(name,base)||false;}

  async function findProject(root,base){
    if(!base)throw new Error('No PR belum tersedia.');
    try{
      const handle=await root.getDirectoryHandle(base,{create:false});
      return {handle,name:handle.name||base};
    }catch(_){}
    const matches=[];
    for await(const [name,handle] of root.entries()){
      if(handle.kind==='directory'&&matchFolder(name,base))matches.push({handle,name});
    }
    matches.sort((a,b)=>a.name.length-b.name.length||a.name.localeCompare(b.name,'id'));
    if(!matches.length)throw new Error(`Folder PR ${base} tidak ditemukan di Storage Location.`);
    return matches[0];
  }

  async function documentDirectory(type){
    const cfg=TYPE_CONFIG[type];
    if(!cfg)throw new Error('Jenis dokumen tidak dikenali.');
    const ctx=currentContext();
    const root=await rootHandle();
    const project=await findProject(root,ctx.base);
    let dir=await project.handle.getDirectoryHandle(cfg.folder,{create:false});
    let path=`PR/${project.name}/${cfg.folder}`;

    if(type==='RFQ'){
      const rfqFolder=ctx.round==='R0'?'RFQ awal':`RFQ ${ctx.round}`;
      try{
        dir=await dir.getDirectoryHandle(rfqFolder,{create:false});
        path+=`/${rfqFolder}`;
      }catch(_){
        // Compatibility only: RFQ lama mungkin masih berada langsung di 01. PR Approval.
        // View tidak pernah membuat subfolder atau file.
      }
    }else if(ROUND_TYPES.has(cfg.folder)){
      dir=await dir.getDirectoryHandle(ctx.round,{create:false});
      path+=`/${ctx.round}`;
    }
    return {dir,path,ctx,project,cfg};
  }

  function scoreFile(name,type){
    const n=text(name).toLowerCase();
    let score=0;
    if(type==='CQS'&&/cqs/.test(n))score+=100;
    if(type==='RFQ'&&/rfq/.test(n))score+=100;
    if(type==='BIDDERLIST'&&/bidder/.test(n))score+=100;
    if(/\.xlsx?$|\.xlsm$/.test(n))score+=40;
    if(/\.pdf$/.test(n))score+=20;
    return score;
  }

  async function listFiles(type){
    const target=await documentDirectory(type);
    const files=[];
    for await(const [name,handle] of target.dir.entries()){
      if(handle.kind!=='file')continue;
      const file=await handle.getFile();
      files.push({name,file,score:scoreFile(name,type)});
    }
    files.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'id',{numeric:true}));
    return {target,files};
  }

  function ensureViewer(){
    let dialog=document.getElementById('mswReadonlyLocalViewer');
    if(dialog)return dialog;

    const style=document.createElement('style');
    style.id='mswReadonlyLocalViewerStyle';
    style.textContent=`
      #mswReadonlyLocalViewer{width:min(96vw,1500px);height:min(92vh,950px);padding:0;border:0;border-radius:14px;box-shadow:0 24px 80px rgba(15,23,42,.35);overflow:hidden;background:#fff;color:#0f172a}
      #mswReadonlyLocalViewer::backdrop{background:rgba(15,23,42,.58)}
      .msw-ro-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border-bottom:1px solid #dbe3ec;background:#f8fafc}
      .msw-ro-title{font-weight:800;font-size:14px}.msw-ro-meta{font-size:11px;color:#64748b;margin-top:2px;overflow-wrap:anywhere}
      .msw-ro-close{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer}
      .msw-ro-note{padding:7px 16px;background:#ecfdf5;color:#047857;font-size:11px;border-bottom:1px solid #d1fae5}
      .msw-ro-body{height:calc(100% - 94px);overflow:auto;background:#fff}
      .msw-ro-tabs{position:sticky;top:0;z-index:2;display:flex;gap:4px;flex-wrap:wrap;padding:7px 10px;border-bottom:1px solid #e2e8f0;background:#f8fafc}
      .msw-ro-tab{border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:5px 9px;font-size:11px;cursor:pointer}
      .msw-ro-tab.active{background:#0f172a;color:#fff;border-color:#0f172a}
      .msw-ro-sheet{padding:10px;overflow:auto}
      .msw-ro-sheet table{border-collapse:collapse;min-width:max-content;font-size:11px;background:#fff}
      .msw-ro-sheet td,.msw-ro-sheet th{border:1px solid #d9e1e8;padding:4px 6px;white-space:pre-wrap;vertical-align:top;min-width:36px;max-width:420px}
      .msw-ro-message{padding:24px;color:#475569;font-size:13px;line-height:1.6}
      .msw-ro-image{display:block;max-width:100%;max-height:calc(92vh - 120px);margin:0 auto;padding:12px}
    `;
    document.head.appendChild(style);

    dialog=document.createElement('dialog');
    dialog.id='mswReadonlyLocalViewer';
    dialog.innerHTML=`
      <div class="msw-ro-head">
        <div><div id="mswRoTitle" class="msw-ro-title">View</div><div id="mswRoMeta" class="msw-ro-meta"></div></div>
        <button type="button" id="mswRoClose" class="msw-ro-close">Close</button>
      </div>
      <div class="msw-ro-note">Read-only preview • file asli di OneDrive tidak diubah, tidak disimpan ulang, dan tidak di-download.</div>
      <div id="mswRoBody" class="msw-ro-body"></div>`;
    document.body.appendChild(dialog);
    document.getElementById('mswRoClose')?.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{
      if(activeObjectUrl){URL.revokeObjectURL(activeObjectUrl);activeObjectUrl='';}
      const body=document.getElementById('mswRoBody');if(body)body.innerHTML='';
    });
    return dialog;
  }

  function showDialog(title,meta){
    const dialog=ensureViewer();
    document.getElementById('mswRoTitle').textContent=title;
    document.getElementById('mswRoMeta').textContent=meta;
    if(typeof dialog.showModal==='function'){
      if(!dialog.open)dialog.showModal();
    }else dialog.setAttribute('open','open');
    return document.getElementById('mswRoBody');
  }

  function loadSheetJs(){
    if(window.XLSX?.read)return Promise.resolve(window.XLSX);
    if(window.__MSW_SHEETJS_LOADING__)return window.__MSW_SHEETJS_LOADING__;
    window.__MSW_SHEETJS_LOADING__=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.onload=()=>window.XLSX?.read?resolve(window.XLSX):reject(new Error('Library preview Excel tidak tersedia.'));
      script.onerror=()=>reject(new Error('Preview Excel tidak dapat dimuat. Periksa koneksi internet.'));
      document.head.appendChild(script);
    });
    return window.__MSW_SHEETJS_LOADING__;
  }

  async function previewExcel(file,title,meta){
    const body=showDialog(title,meta);
    body.innerHTML='<div class="msw-ro-message">Membuka workbook read-only...</div>';
    const XLSX=await loadSheetJs();
    const buffer=await file.arrayBuffer();
    // Hanya membaca workbook. Tidak ada writeFile/write/createWritable sehingga formula existing tidak tersentuh.
    const workbook=XLSX.read(buffer,{type:'array',cellFormula:true,cellNF:true,cellStyles:true,bookVBA:true});
    if(!workbook.SheetNames?.length)throw new Error('Workbook tidak memiliki worksheet yang dapat ditampilkan.');

    body.innerHTML='<div class="msw-ro-tabs"></div><div class="msw-ro-sheet"></div>';
    const tabs=body.querySelector('.msw-ro-tabs');
    const sheetBox=body.querySelector('.msw-ro-sheet');

    const renderSheet=name=>{
      const sheet=workbook.Sheets[name];
      const html=XLSX.utils.sheet_to_html(sheet,{editable:false,header:'',footer:''});
      sheetBox.innerHTML=html||'<div class="msw-ro-message">Worksheet kosong.</div>';
      tabs.querySelectorAll('.msw-ro-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.sheet===name));
    };

    workbook.SheetNames.forEach((name,index)=>{
      const button=document.createElement('button');
      button.type='button';button.className='msw-ro-tab';button.dataset.sheet=name;button.textContent=name;
      button.addEventListener('click',()=>renderSheet(name));
      tabs.appendChild(button);
      if(index===0)renderSheet(name);
    });
  }

  async function previewImage(file,title,meta){
    const body=showDialog(title,meta);
    if(activeObjectUrl)URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl=URL.createObjectURL(file);
    body.innerHTML='';
    const img=document.createElement('img');img.className='msw-ro-image';img.alt=file.name;img.src=activeObjectUrl;body.appendChild(img);
  }

  async function previewFile(type,target,chosen){
    const file=chosen.file;
    const name=text(file.name||chosen.name);
    const lower=name.toLowerCase();
    const title=`View ${target.cfg.label}`;
    const meta=`${name} • ${target.path}`;

    if(/\.(xlsx?|xlsm)$/i.test(lower))return previewExcel(file,title,meta);
    if(/^image\//i.test(file.type)||/\.(png|jpe?g|gif|webp|bmp)$/i.test(lower))return previewImage(file,title,meta);

    const body=showDialog(title,meta);
    body.innerHTML=`<div class="msw-ro-message"><strong>${target.cfg.label} ditemukan.</strong><br>Format <code>${name.replace(/</g,'&lt;')}</code> tidak dapat dipreview langsung di portal. Demi menjaga file existing, View tidak akan men-download atau mengubah file tersebut.</div>`;
  }

  async function openLocal(type){
    const normalized=text(type).toUpperCase();
    const {target,files}=await listFiles(normalized);
    if(!files.length){
      throw new Error(`${target.cfg.label} belum ada di ${target.path}. Tidak ada file yang dibuat atau diubah oleh tombol View.`);
    }
    const chosen=files[0];
    await previewFile(normalized,target,chosen);
    return {fileName:chosen.file.name,path:target.path,readOnly:true};
  }

  async function exists(type){try{return(await listFiles(type)).files.length>0;}catch(_){return false;}}

  function install(){
    if(typeof window.openStoredProcurementDocument!=='function'||typeof window.updateProcurementDocumentViewButtons!=='function')return false;
    if(window.__MSW_LOCAL_DOCUMENT_VIEW_INSTALLED__)return true;
    window.__MSW_LOCAL_DOCUMENT_VIEW_INSTALLED__=true;
    const oldUpdate=window.updateProcurementDocumentViewButtons;

    window.updateProcurementDocumentViewButtons=function(){
      try{oldUpdate();}catch(_){}
      const ctx=currentContext();
      Object.keys(TYPE_CONFIG).forEach(async type=>{
        const btn=document.getElementById(`viewStored${type}Btn`);
        if(!btn)return;
        // Bila No PR tersedia, View tetap dapat diklik. Jika file tidak ada,
        // klik hanya menampilkan informasi tanpa membuat/download file.
        btn.disabled=!ctx.base;
        if(!ctx.base){btn.title='Pilih No PR terlebih dahulu.';return;}
        const found=await exists(type);
        btn.title=found
          ? `Preview read-only ${TYPE_CONFIG[type].label} existing dari OneDrive`
          : `${TYPE_CONFIG[type].label} belum ditemukan; klik untuk melihat informasi lokasi.`;
      });
    };

    document.addEventListener('click',event=>{
      const btn=event.target.closest?.('.stored-document-view-btn');
      if(!btn)return;
      const type=text(btn.dataset.documentType).toUpperCase();
      if(!TYPE_CONFIG[type])return;
      event.preventDefault();event.stopImmediatePropagation();
      openLocal(type).catch(error=>alert(error?.message||`${TYPE_CONFIG[type].label} tidak ditemukan.`));
    },true);

    setTimeout(()=>window.updateProcurementDocumentViewButtons(),0);
    window.MSW_LOCAL_DOCUMENT_VIEW=Object.freeze({openLocal,listFiles,currentContext,findProject,readOnly:true});
    return true;
  }

  if(!install()){
    let tries=0;
    const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer);},100);
  }
})();

/* ===== END ORIGINAL: bidder-list/local-document-view-bridge.js ===== */

/* ===== BEGIN ORIGINAL: bidder-list/internal-email-release-pr-v3516.js ===== */
/* ======================================================
   MULTIPLE EMAIL INTERNAL — RELEASE PR ENHANCEMENT v3.5.16

   Scope only:
   1) "Pilih Bidderlist" first keeps the existing local/OneDrive flow, then
      falls back to backend LIST_PROCUREMENT_FILES when local storage is not
      connected, permission is inactive, or the active local folder is empty.
   2) Release PR Outlook draft uses an HTML table matching the Procurement
      email format requested by the user.

   Other internal/vendor email types, Procurement data, folder structure,
   permissions, and document generation are not changed.
====================================================== */
(function installReleasePrInternalEmailV3516(){
  'use strict';
  if (window.__MSW_RELEASE_PR_INTERNAL_EMAIL_V3516__) return;
  window.__MSW_RELEASE_PR_INTERNAL_EMAIL_V3516__ = true;

  const BIDDER_FOLDER = '02. Bidderlist';

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function html(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }

  function linesHtml(value, fallback){
    const raw = Array.isArray(value) ? value : String(value == null ? '' : value).split(/\r?\n/);
    const values = raw.map(text).filter(Boolean);
    return values.length ? values.map(html).join('<br>') : html(fallback || '-');
  }

  function authToken(){
    try {
      if (typeof window.MSW_GET_AUTH_TOKEN === 'function') return text(window.MSW_GET_AUTH_TOKEN());
      if (typeof getStoredAuthToken === 'function') return text(getStoredAuthToken());
    } catch (_) {}
    try { return text(sessionStorage.getItem('MSW_AUTH_TOKEN') || localStorage.getItem('MSW_AUTH_TOKEN')); }
    catch (_) { return ''; }
  }

  async function loadBidderlistFromBackend(){
    if (typeof getBidderMeta !== 'function') throw new Error('Data Procurement aktif belum tersedia.');
    const meta = getBidderMeta() || {};
    if (!text(meta.nopr)) throw new Error('No PR belum tersedia.');

    const endpoint = text(window.APP_CONFIG?.GAS_URL || (typeof GAS_URL !== 'undefined' ? GAS_URL : ''));
    if (!endpoint) throw new Error('Endpoint Google Apps Script belum tersedia.');

    const payload = {
      action: 'LIST_PROCUREMENT_FILES',
      authToken: authToken(),
      noPR: meta.nopr,
      description: meta.description || '',
      folderId: meta.folderid || '',
      folderType: BIDDER_FOLDER,
      round: typeof getDocumentRound === 'function' ? getDocumentRound(meta) : (meta.round || 'R0')
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!result?.success) throw new Error(result?.message || 'Daftar file Bidderlist tidak dapat dimuat.');

    const files = Array.isArray(result.files) ? result.files : [];
    try {
      MULTIPLE_EMAIL_FOLDER_FILES = files;
      if (typeof renderMultipleEmailAttachmentFileList === 'function') renderMultipleEmailAttachmentFileList();
    } catch (_) {}

    return Object.assign({}, result, {source: result.source || 'BACKEND_DRIVE', files});
  }

  function installAttachmentFallback(){
    if (typeof window.loadMultipleEmailFolderFiles !== 'function') return false;
    if (window.loadMultipleEmailFolderFiles.__MSW_BIDDER_FALLBACK_V3516__) return true;

    const previous = window.loadMultipleEmailFolderFiles;
    const wrapped = async function(folderType){
      const sourceType = text(folderType || '01. PR Approval');
      if (sourceType !== BIDDER_FOLDER) return previous.apply(this, arguments);

      let localResult = null;
      let localError = null;
      try {
        localResult = await previous.apply(this, arguments);
        const localFiles = Array.isArray(localResult?.files) ? localResult.files : [];
        if (localFiles.length) return localResult;
      } catch (error) {
        localError = error;
      }

      try {
        return await loadBidderlistFromBackend();
      } catch (backendError) {
        if (localError) {
          throw new Error(
            'Folder Bidderlist belum dapat dibaca dari penyimpanan lokal maupun server. ' +
            'Lokal: ' + (localError?.message || localError) + ' | Server: ' + (backendError?.message || backendError)
          );
        }
        throw backendError;
      }
    };
    wrapped.__MSW_BIDDER_FALLBACK_V3516__ = true;
    window.loadMultipleEmailFolderFiles = wrapped;
    return true;
  }

  function formatEstPrice(value){
    const number = Number(value || 0);
    if (Number.isFinite(number) && number !== 0) return Math.round(number).toLocaleString('id-ID');
    return text(value) || '-';
  }

  function buildReleasePrHtml(data){
    data = data || {};
    const invited = Array.isArray(data.invitedVendors) ? data.invitedVendors : data.invitedVendors || [];
    const buyer = text(data.buyerName) || 'Procurement Team';
    const user = text(data.user) || '-';

    const th = "border:1px solid #9ca3af;background:#1f6f08;color:#ffffff;padding:8px 9px;text-align:center;font-weight:700;vertical-align:middle;";
    const td = "border:1px solid #9ca3af;padding:9px 10px;text-align:center;vertical-align:middle;line-height:1.45;";

    return '<html><body>' +
      '<div style="font-family:\'Palatino Linotype\',\'Book Antiqua\',Palatino,serif;font-size:11pt;color:#000000;line-height:1.45;">' +
      '<p style="margin:0 0 14px 0;">Kepada Yth<br><b>Bapak Agustinus,</b></p>' +
      '<p style="margin:0 0 14px 0;">Mohon approval Bidderlist terlampir dan untuk detail sesuai informasi dibawah ini.</p>' +
      '<p style="margin:0 0 14px 0;color:#1d4ed8;">USER = ' + html(user) + '</p>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:880px;table-layout:fixed;font-size:10pt;">' +
        '<thead><tr>' +
          '<th style="' + th + '">Invited Vendors</th>' +
          '<th style="' + th + '">Previous<br>PO Winner</th>' +
          '<th style="' + th + '">Previous<br>Submit Quotation</th>' +
          '<th style="' + th + '">Est. Price<br>(Rp)</th>' +
          '<th style="' + th + '">Closing date</th>' +
        '</tr></thead>' +
        '<tbody><tr>' +
          '<td style="' + td + '">' + linesHtml(invited, '-') + '</td>' +
          '<td style="' + td + '">' + linesHtml(data.previousWinner, 'None') + '</td>' +
          '<td style="' + td + '">' + linesHtml(data.previousQuotation, 'None') + '</td>' +
          '<td style="' + td + '">' + html(formatEstPrice(data.estPrice)) + '</td>' +
          '<td style="' + td + '">' + html(text(data.closingDate) || '-') + '</td>' +
        '</tr></tbody>' +
      '</table>' +
      '<p style="margin:18px 0 0 0;">Salam,<br>' + html(buyer) + '<br>Procurement - PT. Makmur Sejahtera Wisesa</p>' +
      '</div></body></html>';
  }

  function installReleasePrHtml(){
    if (typeof window.getInternalEmailBodyHtml !== 'function') return false;
    if (window.getInternalEmailBodyHtml.__MSW_RELEASE_PR_HTML_V3516__) return true;

    const previous = window.getInternalEmailBodyHtml;
    const wrapped = function(type, draft){
      if (text(type).toUpperCase() !== 'RELEASE_PR') return previous.apply(this, arguments);

      let resolvedDraft = draft;
      try {
        if (!resolvedDraft && typeof getMultipleEmailInternalDraft === 'function') resolvedDraft = getMultipleEmailInternalDraft(type);
      } catch (_) {}

      // Bila user sengaja mengubah Body Email, pertahankan wording custom existing.
      if (text(resolvedDraft?.['Body Override'])) return previous.apply(this, arguments);

      try {
        if (typeof getInternalEmailProcurementData !== 'function') return previous.apply(this, arguments);
        return buildReleasePrHtml(getInternalEmailProcurementData());
      } catch (_) {
        return previous.apply(this, arguments);
      }
    };
    wrapped.__MSW_RELEASE_PR_HTML_V3516__ = true;
    window.getInternalEmailBodyHtml = wrapped;
    return true;
  }

  function install(){
    return installAttachmentFallback() && installReleasePrHtml();
  }

  if (!install()) {
    let tries = 0;
    const timer = window.setInterval(function(){
      tries += 1;
      if (install() || tries > 200) window.clearInterval(timer);
    }, 50);
  }
})();

/* Load the isolated RFQ Excel upload/import adapter on BidderList workspace. */
(function loadRfqExcelImportV3523(){
  if (window.__MSW_RFQ_EXCEL_IMPORT_V3523__ || document.querySelector('script[data-msw-rfq-excel-import]')) return;
  const script = document.createElement('script');
  script.src = new URL('./rfq-excel-import-v3523.js?v=20260819-rfq-import-v3523', window.location.href).href;
  script.defer = true;
  script.dataset.mswRfqExcelImport = 'true';
  document.body.appendChild(script);
})();

/* ===== END ORIGINAL: bidder-list/internal-email-release-pr-v3516.js ===== */

/* ===== BEGIN ORIGINAL: bidder-list/rfq-excel-import-v3523.js ===== */
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

/* ===== END ORIGINAL: bidder-list/rfq-excel-import-v3523.js ===== */
