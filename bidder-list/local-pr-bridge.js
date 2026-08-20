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
