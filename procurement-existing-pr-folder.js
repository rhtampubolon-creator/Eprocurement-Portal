(function () {
  'use strict';

  const ROUND_TYPES = new Set(['02. Bidderlist', '03. CQS']);
  const FOLDER_TYPES = ['01. PR Approval', '02. Bidderlist', '03. CQS', '04. PO', '05. Contract'];
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
