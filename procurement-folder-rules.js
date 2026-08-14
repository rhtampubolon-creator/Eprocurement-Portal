(function () {
  'use strict';

  const ROUND_FOLDER_TYPES = new Set(['02. Bidderlist', '03. CQS']);
  const FOLDER_TYPES = [
    '01. PR Approval',
    '02. Bidderlist',
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
