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
