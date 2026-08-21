/*
 * CONSOLIDATION TEST BUNDLE — SHADOW BRANCH ONLY
 * Original source order preserved.
 * - procurement-folder-rules.js
 * - procurement-pr-rules-patch.js
 * - procurement-local-files.js
 * - procurement-existing-pr-folder.js
 */

/* ===== BEGIN ORIGINAL: procurement-folder-rules.js ===== */
(function () {
  'use strict';

  const BIDDERLIST_FOLDER = '02. Bidderlist & Quotation';
  const LEGACY_BIDDERLIST_FOLDER = '02. Bidderlist';
  const ROUND_FOLDER_TYPES = new Set([BIDDERLIST_FOLDER, '03. CQS']);
  const FOLDER_TYPES = [
    '01. PR Approval',
    BIDDERLIST_FOLDER,
    '03. CQS',
    '04. PO',
    '05. Contract'
  ];
  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const DB_STORE = 'handles';
  const ROOT_HANDLE_KEY = 'prRoot';

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function getBasePR(value) {
    const source = text(value);
    if (!source) return '';
    return source
      .replace(/\s*\(\s*Line[^)]*\)\s*$/i, '')
      .replace(/\s+R\s*\d+\s*$/i, '')
      .trim();
  }

  function normalizeRound(value) {
    const match = text(value).toUpperCase().match(/R\s*(\d+)/);
    return match ? `R${Number(match[1])}` : 'R0';
  }

  function getActiveRounds() {
    const roundSelect = document.getElementById('roundpo');
    const active = normalizeRound(roundSelect && roundSelect.value);
    const max = Math.max(0, Number(active.slice(1)) || 0);
    return Array.from({ length: max + 1 }, (_, index) => `R${index}`);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) {
          request.result.createObjectStore(DB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveHandle(handle) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(handle, ROOT_HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function loadHandle() {
    const db = await openDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get(ROOT_HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  }

  async function ensurePermission(handle, requestPermission) {
    if (!handle) return false;
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    if (requestPermission && (await handle.requestPermission(options)) === 'granted') return true;
    return false;
  }

  async function choosePrRoot() {
    if (!window.showDirectoryPicker) {
      throw new Error('Browser ini belum mendukung pemilihan folder lokal. Gunakan Microsoft Edge atau Google Chrome desktop.');
    }
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (text(handle.name).toUpperCase() !== 'PR') {
      throw new Error(`Folder yang dipilih harus bernama PR. Folder terpilih: ${handle.name}`);
    }
    await saveHandle(handle);
    return handle;
  }

  async function ensureLocalStructure(rootHandle, noPR) {
    if (!(await ensurePermission(rootHandle, true))) {
      throw new Error('Izin akses folder PR belum diberikan.');
    }

    const basePR = getBasePR(noPR);
    if (!basePR) throw new Error('No PR belum tersedia.');

    const prFolder = await rootHandle.getDirectoryHandle(basePR, { create: true });
    const rounds = getActiveRounds();

    for (const type of FOLDER_TYPES) {
      const typeFolder = await prFolder.getDirectoryHandle(type, { create: true });
      if (ROUND_FOLDER_TYPES.has(type)) {
        for (const round of rounds) {
          await typeFolder.getDirectoryHandle(round, { create: true });
        }
      }
    }

    return { basePR, rounds };
  }

  function setStatus(message, tone) {
    const el = document.getElementById('localPrFolderStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `text-sm ${tone === 'error' ? 'text-red-700' : tone === 'ok' ? 'text-emerald-700' : 'text-slate-600'}`;
  }

  function buildPanel() {
    if (document.getElementById('localPrFolderPanel')) return;
    const folderManager = document.getElementById('folderManagerSection');
    if (!folderManager) return;

    const panel = document.createElement('section');
    panel.id = 'localPrFolderPanel';
    panel.className = 'mt-8 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4';
    panel.innerHTML = `
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 class="font-semibold text-emerald-900">OneDrive Local Root: PR</h3>
          <p id="localPrFolderStatus" class="text-sm text-slate-600">Belum terhubung ke folder PR.</p>
          <p class="mt-1 text-xs text-slate-500">Pilih hanya folder PR pada OneDrive user. Path C:\\Users\\... tidak disimpan portal.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" id="connectPrRootBtn" class="folder-action-button bg-emerald-600 hover:bg-emerald-700 text-white">Connect Folder PR</button>
          <button type="button" id="createLocalPrStructureBtn" class="folder-action-button bg-indigo-600 hover:bg-indigo-700 text-white">Create / Refresh Structure</button>
        </div>
      </div>`;
    folderManager.parentNode.insertBefore(panel, folderManager);
  }

  async function refreshRootStatus() {
    try {
      const handle = await loadHandle();
      if (!handle) return setStatus('Belum terhubung ke folder PR.', 'neutral');
      const granted = await ensurePermission(handle, false);
      setStatus(granted ? `Terhubung: ${handle.name}` : `Folder ${handle.name} tersimpan. Klik Connect untuk memberi izin lagi.`, granted ? 'ok' : 'neutral');
    } catch (error) {
      setStatus(`Status folder gagal dibaca: ${error.message}`, 'error');
    }
  }

  function installLocalFolderActions() {
    document.getElementById('connectPrRootBtn')?.addEventListener('click', async () => {
      try {
        const handle = await choosePrRoot();
        setStatus(`Terhubung: ${handle.name}`, 'ok');
      } catch (error) {
        if (error && error.name === 'AbortError') return;
        setStatus(error.message || 'Gagal memilih folder PR.', 'error');
      }
    });

    document.getElementById('createLocalPrStructureBtn')?.addEventListener('click', async () => {
      try {
        let handle = await loadHandle();
        if (!handle || !(await ensurePermission(handle, true))) handle = await choosePrRoot();
        const noPR = document.getElementById('noPR')?.value || '';
        const result = await ensureLocalStructure(handle, noPR);
        setStatus(`Siap: PR/${result.basePR} • ${result.rounds.join(', ')}`, 'ok');
      } catch (error) {
        if (error && error.name === 'AbortError') return;
        setStatus(error.message || 'Gagal membuat struktur folder.', 'error');
      }
    });
  }

  function installRoundFolderUi() {
    const typeSelect = document.getElementById('documentFolderType');
    const roundSelect = document.getElementById('documentRound');
    const roundWrapper = document.getElementById('documentRoundWrapper');
    const pathEl = document.getElementById('folderTargetPath');
    if (!typeSelect || !roundSelect || !roundWrapper) return;

    const legacyOption = Array.from(typeSelect.options || []).find(option => option.value === LEGACY_BIDDERLIST_FOLDER);
    if (legacyOption) {
      legacyOption.value = BIDDERLIST_FOLDER;
      legacyOption.textContent = BIDDERLIST_FOLDER;
    }

    const update = () => {
      const type = typeSelect.value;
      const isRoundFolder = ROUND_FOLDER_TYPES.has(type);
      roundWrapper.classList.toggle('hidden', !isRoundFolder);
      if (isRoundFolder) {
        roundSelect.value = normalizeRound(document.getElementById('roundpo')?.value || roundSelect.value);
      }
      if (pathEl) pathEl.textContent = isRoundFolder ? `${type}/${roundSelect.value}` : type;
    };

    typeSelect.addEventListener('change', update);
    roundSelect.addEventListener('change', update);
    document.getElementById('roundpo')?.addEventListener('change', update);
    update();

    if (typeof window.selectedFolderTarget === 'function') {
      window.selectedFolderTarget = function () {
        const type = typeSelect.value || FOLDER_TYPES[0];
        return { type, round: ROUND_FOLDER_TYPES.has(type) ? roundSelect.value : '' };
      };
    }
  }

  function installBasePrAdapter() {
    if (typeof window.postFolderAction !== 'function') return;
    const original = window.postFolderAction;
    window.postFolderAction = async function (payload) {
      const next = payload && typeof payload === 'object' ? { ...payload } : payload;
      if (next && next.noPR) {
        next.displayNoPR = next.noPR;
        next.noPR = getBasePR(next.noPR);
      }
      if (next && ['createFolder', 'getFolderStructure'].includes(next.action)) {
        next.roundFolderTypes = Array.from(ROUND_FOLDER_TYPES);
        next.folderTypes = FOLDER_TYPES.slice();
      }
      return original(next);
    };
  }

  function init() {
    if (!/\/procurement-admin\/Form\//i.test(window.location.pathname)) return;
    buildPanel();
    installLocalFolderActions();
    installRoundFolderUi();
    installBasePrAdapter();
    refreshRootStatus();
    window.MSW_PROCUREMENT_FOLDER_RULES = Object.freeze({
      getBasePR,
      folderTypes: FOLDER_TYPES.slice(),
      roundFolderTypes: Array.from(ROUND_FOLDER_TYPES)
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

/* ===== END ORIGINAL: procurement-folder-rules.js ===== */

/* ===== BEGIN ORIGINAL: procurement-pr-rules-patch.js ===== */
(function(){
  'use strict';
  function patchRules(){
    const identity=window.MSW_PR_IDENTITY;
    const current=window.MSW_PROCUREMENT_FOLDER_RULES;
    if(!identity||!current)return false;
    window.MSW_PROCUREMENT_FOLDER_RULES=Object.freeze({
      ...current,
      getBasePR:identity.getBasePR,
      getRevisionRound:identity.getRevisionRound,
      normalizeRound:identity.normalizeRound
    });
    return true;
  }
  function syncRoundFromNoPr(){
    const identity=window.MSW_PR_IDENTITY;if(!identity)return;
    const noPr=document.getElementById('noPR');if(!noPr)return;
    const revision=identity.getRevisionRound(noPr.value);if(!revision)return;
    const roundPo=document.getElementById('roundpo');if(roundPo&&roundPo.value!==revision){roundPo.value=revision;roundPo.dispatchEvent(new Event('change',{bubbles:true}));}
    const documentRound=document.getElementById('documentRound');if(documentRound&&documentRound.value!==revision)documentRound.value=revision;
  }
  function init(){
    let tries=0;const timer=setInterval(()=>{tries++;if(patchRules()||tries>50)clearInterval(timer);},50);
    syncRoundFromNoPr();
    document.addEventListener('change',e=>{if(e.target?.id==='noPR')syncRoundFromNoPr();},true);
    document.addEventListener('input',e=>{if(e.target?.id==='noPR')syncRoundFromNoPr();},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
/* ===== END ORIGINAL: procurement-pr-rules-patch.js ===== */

/* ===== BEGIN ORIGINAL: procurement-local-files.js ===== */
(function () {
  'use strict';

  const ROUND_TYPES = new Set(['02. Bidderlist & Quotation', '03. CQS']);
  const FOLDER_TYPES = ['01. PR Approval', '02. Bidderlist & Quotation', '03. CQS', '04. PO', '05. Contract'];
  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const DB_STORE = 'handles';
  const ROOT_HANDLE_KEY = 'prRoot';
  const MAX_ENTRIES = 300;

  let rootHandle = null;
  let browserTarget = null;
  let busy = false;

  const text = value => value == null ? '' : String(value).trim();

  function basePR(value) {
    const helper = window.MSW_PROCUREMENT_FOLDER_RULES?.getBasePR;
    if (typeof helper === 'function') return helper(value);
    return text(value).replace(/\s+R\s*\d+(?:\s*\([^)]*\))?\s*$/i, '').trim();
  }

  function roundNo(value) {
    const match = text(value).toUpperCase().match(/R\s*(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function currentRound() {
    return `R${Math.max(
      roundNo(document.getElementById('roundpo')?.value),
      roundNo(document.getElementById('noPR')?.value)
    )}`;
  }

  function selectedTarget() {
    const type = document.getElementById('documentFolderType')?.value || FOLDER_TYPES[0];
    const round = ROUND_TYPES.has(type)
      ? (document.getElementById('documentRound')?.value || currentRound())
      : '';
    return { type, round };
  }

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

  async function loadRoot() {
    const db = await openDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get(ROOT_HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    rootHandle = handle;
    return handle;
  }

  async function permission(handle, request) {
    if (!handle) return false;
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    return Boolean(request && (await handle.requestPermission(options)) === 'granted');
  }

  async function allowedRoot() {
    const handle = rootHandle || await loadRoot();
    if (!handle) return null;
    if (!(await permission(handle, true))) return null;
    rootHandle = handle;
    return handle;
  }

  async function dirByParts(root, parts, create) {
    let current = root;
    for (const part of parts) current = await current.getDirectoryHandle(part, { create: Boolean(create) });
    return current;
  }

  async function resolveTarget(create = true) {
    const root = await allowedRoot();
    if (!root) throw new Error('Connect Folder PR terlebih dahulu.');
    const pr = basePR(document.getElementById('noPR')?.value);
    if (!pr) throw new Error('No PR belum tersedia.');
    const target = selectedTarget();
    const parts = [pr, target.type];
    if (target.round && ROUND_TYPES.has(target.type)) parts.push(target.round);
    return {
      directory: await dirByParts(root, parts, create),
      path: ['PR', ...parts].join('/'),
      pr,
      ...target
    };
  }

  async function ensureStructure() {
    const root = await allowedRoot();
    if (!root) throw new Error('Connect Folder PR terlebih dahulu.');
    const pr = basePR(document.getElementById('noPR')?.value);
    if (!pr) throw new Error('No PR belum tersedia.');
    const prDir = await root.getDirectoryHandle(pr, { create: true });
    const maxRound = roundNo(currentRound());

    for (const type of FOLDER_TYPES) {
      const typeDir = await prDir.getDirectoryHandle(type, { create: true });
      if (!ROUND_TYPES.has(type)) continue;
      for (let index = 0; index <= maxRound; index += 1) {
        await typeDir.getDirectoryHandle(`R${index}`, { create: true });
      }
    }
    return { pr, maxRound };
  }

  function managerStatus(message, error) {
    const el = document.getElementById('folderManagerStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `text-sm ${error ? 'text-red-700' : 'text-emerald-700'}`;
  }

  function setProgress(done, total, label) {
    const wrapper = document.getElementById('folderUploadProgress');
    const bar = document.getElementById('folderUploadBar');
    const labelEl = document.getElementById('folderUploadLabel');
    const percentEl = document.getElementById('folderUploadPercent');
    const percent = total ? Math.round((done / total) * 100) : 0;
    wrapper?.classList.remove('hidden');
    if (bar) bar.style.width = `${percent}%`;
    if (labelEl) labelEl.textContent = label || `${done}/${total}`;
    if (percentEl) percentEl.textContent = `${percent}%`;
  }

  async function writeFile(directory, file) {
    const relative = text(file.webkitRelativePath) || file.name;
    const parts = relative.replace(/\\/g, '/').split('/').filter(Boolean);
    const fileName = parts.pop() || file.name;
    let target = directory;
    for (const part of parts) target = await target.getDirectoryHandle(part, { create: true });
    const handle = await target.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || busy) return;
    busy = true;
    try {
      const target = await resolveTarget(true);
      setProgress(0, files.length, `Menyiapkan ${files.length} file...`);
      for (let index = 0; index < files.length; index += 1) {
        await writeFile(target.directory, files[index]);
        setProgress(index + 1, files.length, `${index + 1}/${files.length} • ${files[index].name}`);
      }
      managerStatus(`Upload selesai ke ${target.path}`, false);
      await showContents();
    } finally {
      busy = false;
      const fileInput = document.getElementById('folderFileInput');
      const dirInput = document.getElementById('folderDirectoryInput');
      if (fileInput) fileInput.value = '';
      if (dirInput) dirInput.value = '';
    }
  }

  async function collect(directory, prefix, entries) {
    if (entries.length >= MAX_ENTRIES) return entries;
    for await (const [name, handle] of directory.entries()) {
      if (entries.length >= MAX_ENTRIES) break;
      const path = prefix ? `${prefix}/${name}` : name;
      entries.push({ path, kind: handle.kind });
      if (handle.kind === 'directory') await collect(handle, path, entries);
    }
    return entries;
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function render(target, entries) {
    const browser = document.getElementById('folderFileBrowser');
    const title = document.getElementById('folderFileBrowserTitle');
    const list = document.getElementById('folderFileBrowserList');
    if (!browser || !list) return;
    browser.classList.remove('hidden');
    if (title) title.textContent = `Local: ${target.path}`;
    if (!entries.length) {
      list.innerHTML = '<div class="text-sm text-slate-500 py-2">Folder masih kosong.</div>';
      return;
    }
    list.innerHTML = entries.map(entry => {
      const icon = entry.kind === 'directory' ? '📁' : '📄';
      const action = entry.kind === 'file'
        ? `<button type="button" class="local-file-open-btn px-2 py-1 rounded bg-sky-100 text-sky-800 text-xs" data-local-path="${escapeHtml(entry.path)}">Open</button>`
        : '<span class="text-xs text-slate-400">Folder</span>';
      return `<div class="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0">
        <div class="min-w-0 text-sm text-slate-700 break-all">${icon} ${escapeHtml(entry.path)}</div>
        <div class="shrink-0">${action}</div>
      </div>`;
    }).join('');
  }

  async function showContents() {
    const target = await resolveTarget(true);
    browserTarget = target;
    const entries = await collect(target.directory, '', []);
    render(target, entries);
    managerStatus(`Menampilkan ${target.path}`, false);
  }

  async function getFileHandle(directory, relativePath) {
    const parts = text(relativePath).split('/').filter(Boolean);
    const fileName = parts.pop();
    let current = directory;
    for (const part of parts) current = await current.getDirectoryHandle(part, { create: false });
    return current.getFileHandle(fileName, { create: false });
  }

  async function openFile(relativePath) {
    const target = browserTarget || await resolveTarget(true);
    const handle = await getFileHandle(target.directory, relativePath);
    const file = await handle.getFile();
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function hasLocalRoot() {
    const handle = rootHandle || await loadRoot();
    if (!handle) return false;
    rootHandle = handle;
    return true;
  }

  function captureClick(id, localAction, fallbackAction) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      (async () => {
        if (await hasLocalRoot()) return localAction();
        if (typeof fallbackAction === 'function') return fallbackAction();
      })().catch(error => managerStatus(error.message || 'Aksi folder gagal.', true));
    }, true);
  }

  function install() {
    captureClick('ensureFolderBtn', async () => {
      const result = await ensureStructure();
      managerStatus(`Folder lokal siap: PR/${result.pr}`, false);
    }, () => window.ensureFolderStructure?.());

    captureClick('openTargetFolderBtn', showContents, () => window.openSelectedFolder?.());
    captureClick('refreshFolderFilesBtn', showContents, () => window.loadSelectedFolderFiles?.());
    captureClick('uploadFilesBtn', () => document.getElementById('folderFileInput')?.click(), () => document.getElementById('folderFileInput')?.click());
    captureClick('uploadDirectoryBtn', () => document.getElementById('folderDirectoryInput')?.click(), () => document.getElementById('folderDirectoryInput')?.click());

    captureClick('saveCreateFolderBtn', async () => {
      const result = await ensureStructure();
      managerStatus(`Folder lokal siap: PR/${result.pr}`, false);
      if (typeof window.saveProcurement !== 'function') throw new Error('Fungsi penyimpanan procurement tidak tersedia.');
      await window.saveProcurement({ createFolderAfterSave: false });
    }, () => window.saveProcurement?.({ createFolderAfterSave: true }));

    document.getElementById('folderFileInput')?.addEventListener('change', event => {
      if (!rootHandle) return;
      event.stopImmediatePropagation();
      uploadFiles(event.target.files).catch(error => managerStatus(error.message || 'Upload gagal.', true));
    }, true);

    document.getElementById('folderDirectoryInput')?.addEventListener('change', event => {
      if (!rootHandle) return;
      event.stopImmediatePropagation();
      uploadFiles(event.target.files).catch(error => managerStatus(error.message || 'Upload folder gagal.', true));
    }, true);

    document.getElementById('folderFileBrowserList')?.addEventListener('click', event => {
      const button = event.target.closest('.local-file-open-btn');
      if (!button) return;
      event.preventDefault();
      openFile(button.dataset.localPath || '').catch(error => managerStatus(error.message || 'File gagal dibuka.', true));
    });
  }

  async function init() {
    if (!/\/procurement-admin\/Form\//i.test(window.location.pathname)) return;
    try { await loadRoot(); } catch (_) { rootHandle = null; }
    install();
    window.MSW_PROCUREMENT_LOCAL_FILES = Object.freeze({ resolveTarget, ensureStructure, showContents });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

/* ===== END ORIGINAL: procurement-local-files.js ===== */

/* ===== BEGIN ORIGINAL: procurement-existing-pr-folder.js ===== */
(function () {
  'use strict';

  const ROUND_TYPES = new Set(['02. Bidderlist & Quotation', '03. CQS']);
  const FOLDER_TYPES = ['01. PR Approval', '02. Bidderlist & Quotation', '03. CQS', '04. PO', '05. Contract'];
  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const DB_STORE = 'handles';
  const ROOT_HANDLE_KEY = 'prRoot';
  const MAX_ENTRIES = 300;

  let rootHandle = null;
  let browserTarget = null;
  let busy = false;

  const text = value => value == null ? '' : String(value).trim();

  function getBasePR(value) {
    const helper = window.MSW_PROCUREMENT_FOLDER_RULES?.getBasePR;
    if (typeof helper === 'function') return helper(value);
    return text(value)
      .replace(/\s*\(\s*Line[^)]*\)\s*$/i, '')
      .replace(/\s+R\s*\d+\s*$/i, '')
      .trim();
  }

  function roundNo(value) {
    const match = text(value).toUpperCase().match(/R\s*(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function currentRound() {
    return `R${Math.max(
      roundNo(document.getElementById('roundpo')?.value),
      roundNo(document.getElementById('noPR')?.value)
    )}`;
  }

  function selectedTarget() {
    const type = document.getElementById('documentFolderType')?.value || FOLDER_TYPES[0];
    const round = ROUND_TYPES.has(type)
      ? (document.getElementById('documentRound')?.value || currentRound())
      : '';
    return { type, round };
  }

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

  async function loadRoot() {
    const db = await openDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get(ROOT_HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    rootHandle = handle;
    return handle;
  }

  async function ensurePermission(handle) {
    if (!handle) return false;
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    return (await handle.requestPermission(options)) === 'granted';
  }

  async function allowedRoot() {
    const handle = rootHandle || await loadRoot();
    if (!handle) throw new Error('Connect Folder PR terlebih dahulu.');
    if (!(await ensurePermission(handle))) throw new Error('Izin akses folder PR belum diberikan.');
    rootHandle = handle;
    return handle;
  }

  function isPrefixMatch(folderName, base) {
    const folder = text(folderName).toUpperCase();
    const key = text(base).toUpperCase();
    if (!folder || !key || !folder.startsWith(key)) return false;
    if (folder === key) return true;
    const next = folder.charAt(key.length);
    return /[\s\-_(]/.test(next);
  }

  async function findExistingPrDirectory(root, base) {
    try {
      const exact = await root.getDirectoryHandle(base, { create: false });
      return { handle: exact, name: exact.name || base, match: 'exact' };
    } catch (_) {
      // Continue with prefix lookup.
    }

    const matches = [];
    for await (const [name, handle] of root.entries()) {
      if (handle.kind !== 'directory') continue;
      if (isPrefixMatch(name, base)) matches.push({ handle, name });
    }

    matches.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
    if (matches.length) return { ...matches[0], match: 'prefix' };

    throw new Error(`Folder PR untuk ${base} tidak ditemukan di dalam folder PR. Portal tidak membuat folder root PR baru.`);
  }

  async function resolvePrFolder() {
    const root = await allowedRoot();
    const base = getBasePR(document.getElementById('noPR')?.value);
    if (!base) throw new Error('No PR belum tersedia.');
    const found = await findExistingPrDirectory(root, base);
    return { root, base, ...found };
  }

  async function ensureStructure() {
    const pr = await resolvePrFolder();
    const maxRound = roundNo(currentRound());

    for (const type of FOLDER_TYPES) {
      const typeDir = await pr.handle.getDirectoryHandle(type, { create: true });
      if (!ROUND_TYPES.has(type)) continue;
      for (let index = 0; index <= maxRound; index += 1) {
        await typeDir.getDirectoryHandle(`R${index}`, { create: true });
      }
    }

    return { ...pr, maxRound };
  }

  async function resolveTarget() {
    const pr = await resolvePrFolder();
    const target = selectedTarget();
    let directory = await pr.handle.getDirectoryHandle(target.type, { create: true });
    if (target.round && ROUND_TYPES.has(target.type)) {
      directory = await directory.getDirectoryHandle(target.round, { create: true });
    }
    const parts = ['PR', pr.name, target.type];
    if (target.round && ROUND_TYPES.has(target.type)) parts.push(target.round);
    return { directory, path: parts.join('/'), pr, ...target };
  }

  function managerStatus(message, error) {
    const el = document.getElementById('folderManagerStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `text-sm ${error ? 'text-red-700' : 'text-emerald-700'}`;
  }

  function localStatus(message, error) {
    const el = document.getElementById('localPrFolderStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `text-sm ${error ? 'text-red-700' : 'text-emerald-700'}`;
  }

  function setProgress(done, total, label) {
    const wrapper = document.getElementById('folderUploadProgress');
    const bar = document.getElementById('folderUploadBar');
    const labelEl = document.getElementById('folderUploadLabel');
    const percentEl = document.getElementById('folderUploadPercent');
    const percent = total ? Math.round((done / total) * 100) : 0;
    wrapper?.classList.remove('hidden');
    if (bar) bar.style.width = `${percent}%`;
    if (labelEl) labelEl.textContent = label || `${done}/${total}`;
    if (percentEl) percentEl.textContent = `${percent}%`;
  }

  async function writeFile(directory, file) {
    const relative = text(file.webkitRelativePath) || file.name;
    const parts = relative.replace(/\\/g, '/').split('/').filter(Boolean);
    const fileName = parts.pop() || file.name;
    let target = directory;
    for (const part of parts) target = await target.getDirectoryHandle(part, { create: true });
    const handle = await target.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || busy) return;
    busy = true;
    try {
      const target = await resolveTarget();
      setProgress(0, files.length, `Menyiapkan ${files.length} file...`);
      for (let index = 0; index < files.length; index += 1) {
        await writeFile(target.directory, files[index]);
        setProgress(index + 1, files.length, `${index + 1}/${files.length} • ${files[index].name}`);
      }
      managerStatus(`Upload selesai ke ${target.path}`, false);
      await showContents();
    } finally {
      busy = false;
      const fileInput = document.getElementById('folderFileInput');
      const dirInput = document.getElementById('folderDirectoryInput');
      if (fileInput) fileInput.value = '';
      if (dirInput) dirInput.value = '';
    }
  }

  async function collect(directory, prefix, entries) {
    if (entries.length >= MAX_ENTRIES) return entries;
    for await (const [name, handle] of directory.entries()) {
      if (entries.length >= MAX_ENTRIES) break;
      const path = prefix ? `${prefix}/${name}` : name;
      entries.push({ path, kind: handle.kind });
      if (handle.kind === 'directory') await collect(handle, path, entries);
    }
    return entries;
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function render(target, entries) {
    const browser = document.getElementById('folderFileBrowser');
    const title = document.getElementById('folderFileBrowserTitle');
    const list = document.getElementById('folderFileBrowserList');
    if (!browser || !list) return;
    browser.classList.remove('hidden');
    if (title) title.textContent = `Local: ${target.path}`;
    if (!entries.length) {
      list.innerHTML = '<div class="text-sm text-slate-500 py-2">Folder masih kosong.</div>';
      return;
    }
    list.innerHTML = entries.map(entry => {
      const icon = entry.kind === 'directory' ? '📁' : '📄';
      const action = entry.kind === 'file'
        ? `<button type="button" class="existing-pr-file-open-btn px-2 py-1 rounded bg-sky-100 text-sky-800 text-xs" data-local-path="${escapeHtml(entry.path)}">Open</button>`
        : '<span class="text-xs text-slate-400">Folder</span>';
      return `<div class="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0">
        <div class="min-w-0 text-sm text-slate-700 break-all">${icon} ${escapeHtml(entry.path)}</div>
        <div class="shrink-0">${action}</div>
      </div>`;
    }).join('');
  }

  async function showContents() {
    const target = await resolveTarget();
    browserTarget = target;
    const entries = await collect(target.directory, '', []);
    render(target, entries);
    managerStatus(`Menampilkan ${target.path}`, false);
  }

  async function getFileHandle(directory, relativePath) {
    const parts = text(relativePath).split('/').filter(Boolean);
    const fileName = parts.pop();
    let current = directory;
    for (const part of parts) current = await current.getDirectoryHandle(part, { create: false });
    return current.getFileHandle(fileName, { create: false });
  }

  async function openFile(relativePath) {
    const target = browserTarget || await resolveTarget();
    const handle = await getFileHandle(target.directory, relativePath);
    const file = await handle.getFile();
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function handleError(error) {
    const message = error?.message || 'Aksi folder gagal.';
    managerStatus(message, true);
    localStatus(message, true);
  }

  function installClickOverride() {
    document.addEventListener('click', event => {
      if (!rootHandle) return;
      const button = event.target.closest('button');
      if (!button) return;
      const id = button.id;
      if (!['createLocalPrStructureBtn', 'ensureFolderBtn', 'openTargetFolderBtn', 'refreshFolderFilesBtn', 'uploadFilesBtn', 'uploadDirectoryBtn'].includes(id)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      let action;
      if (id === 'createLocalPrStructureBtn' || id === 'ensureFolderBtn') {
        action = async () => {
          const result = await ensureStructure();
          const message = `Folder ditemukan: PR/${result.name}`;
          managerStatus(message, false);
          localStatus(message, false);
          await showContents();
        };
      } else if (id === 'openTargetFolderBtn' || id === 'refreshFolderFilesBtn') {
        action = showContents;
      } else if (id === 'uploadFilesBtn') {
        action = () => document.getElementById('folderFileInput')?.click();
      } else {
        action = () => document.getElementById('folderDirectoryInput')?.click();
      }

      Promise.resolve(action()).catch(handleError);
    }, true);
  }

  function installInputOverride() {
    document.addEventListener('change', event => {
      if (!rootHandle) return;
      const input = event.target;
      if (!input || !['folderFileInput', 'folderDirectoryInput'].includes(input.id)) return;
      event.stopPropagation();
      event.stopImmediatePropagation();
      uploadFiles(input.files).catch(handleError);
    }, true);
  }

  function installFileOpen() {
    document.getElementById('folderFileBrowserList')?.addEventListener('click', event => {
      const button = event.target.closest('.existing-pr-file-open-btn');
      if (!button) return;
      event.preventDefault();
      openFile(button.dataset.localPath || '').catch(handleError);
    });
  }

  function refreshAfterConnect() {
    document.getElementById('connectPrRootBtn')?.addEventListener('click', () => {
      window.setTimeout(() => loadRoot().catch(() => {}), 800);
      window.setTimeout(() => loadRoot().catch(() => {}), 1800);
    });
  }

  async function init() {
    if (!/\/procurement-admin\/Form\//i.test(window.location.pathname)) return;
    try { await loadRoot(); } catch (_) { rootHandle = null; }
    installClickOverride();
    installInputOverride();
    installFileOpen();
    refreshAfterConnect();
    window.MSW_EXISTING_PR_FOLDER = Object.freeze({
      findExistingPrDirectory,
      resolvePrFolder,
      ensureStructure,
      resolveTarget
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

/* ===== END ORIGINAL: procurement-existing-pr-folder.js ===== */
