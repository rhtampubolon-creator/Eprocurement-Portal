(function () {
  'use strict';

  const native = window.AndroidFolder;
  if (!native) return;

  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const PR_ROOT_KEY = 'prRoot';
  const TC_ROOT_KEY = 'tcRoot';

  const parseJson = (value, fallback) => {
    try { return JSON.parse(String(value || '')); }
    catch (_) { return fallback; }
  };

  const cleanPart = value => String(value == null ? '' : value).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  const joinPath = (...parts) => parts.map(cleanPart).filter(Boolean).join('/');

  function folderInfo(kind) {
    return parseJson(native.getFolderInfo(kind), { connected: false, name: '' });
  }

  function dataUrlToFile(dataUrl, name, type) {
    const raw = String(dataUrl || '');
    const comma = raw.indexOf(',');
    if (!raw.startsWith('data:') || comma < 0) throw new Error(`File ${name} tidak dapat dibaca dari Android.`);
    const header = raw.slice(5, comma);
    const mime = type || header.split(';')[0] || 'application/octet-stream';
    const payload = raw.slice(comma + 1);
    let bytes;
    if (/;base64/i.test(header)) {
      const binary = atob(payload);
      bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    }
    return new File([bytes], name, { type: mime });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('File tidak dapat diproses.'));
      reader.readAsDataURL(blob);
    });
  }

  class AndroidFileHandle {
    constructor(kind, relativePath, name, meta = {}) {
      this.kind = 'file';
      this.name = name;
      this._kind = kind;
      this._path = relativePath;
      this._meta = meta;
    }

    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }

    async getFile() {
      const dataUrl = native.readFileDataUrl(this._kind, this._path);
      return dataUrlToFile(dataUrl, this.name, this._meta.mimeType || '');
    }

    async createWritable() {
      let pending = null;
      const handle = this;
      return {
        async write(value) {
          if (value && typeof value === 'object' && value.type === 'write' && 'data' in value) value = value.data;
          if (value instanceof Blob) pending = value;
          else if (value instanceof ArrayBuffer) pending = new Blob([value]);
          else if (ArrayBuffer.isView(value)) pending = new Blob([value.buffer]);
          else pending = new Blob([value == null ? '' : value]);
        },
        async close() {
          const blob = pending || new Blob([]);
          const dataUrl = await blobToDataUrl(blob);
          const slash = handle._path.lastIndexOf('/');
          const directory = slash >= 0 ? handle._path.slice(0, slash) : '';
          const result = parseJson(native.writeFileDataUrl(handle._kind, directory, handle.name, dataUrl), { success: false });
          if (!result.success) throw new Error(result.error || `Gagal menyimpan ${handle.name} ke folder Android.`);
        },
        async abort() { pending = null; }
      };
    }
  }

  class AndroidDirectoryHandle {
    constructor(kind, relativePath, name) {
      this.kind = 'directory';
      this.name = name;
      this._kind = kind;
      this._path = cleanPart(relativePath);
    }

    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }

    _entriesArray() {
      return parseJson(native.listEntries(this._kind, this._path), []);
    }

    async getDirectoryHandle(name, options = {}) {
      const childName = String(name || '').trim();
      if (!childName) throw new DOMException('Nama folder kosong.', 'TypeMismatchError');
      const childPath = joinPath(this._path, childName);
      const existing = this._entriesArray().find(item => item.kind === 'directory' && String(item.name).toUpperCase() === childName.toUpperCase());
      if (!existing && !options.create) throw new DOMException(`Folder ${childName} tidak ditemukan.`, 'NotFoundError');
      if (!existing && options.create && !native.ensureDirectory(this._kind, childPath)) throw new Error(`Folder ${childName} tidak dapat dibuat.`);
      return new AndroidDirectoryHandle(this._kind, childPath, existing?.name || childName);
    }

    async getFileHandle(name, options = {}) {
      const childName = String(name || '').trim();
      if (!childName) throw new DOMException('Nama file kosong.', 'TypeMismatchError');
      const existing = this._entriesArray().find(item => item.kind === 'file' && String(item.name).toUpperCase() === childName.toUpperCase());
      if (!existing && !options.create) throw new DOMException(`File ${childName} tidak ditemukan.`, 'NotFoundError');
      return new AndroidFileHandle(this._kind, joinPath(this._path, existing?.name || childName), existing?.name || childName, existing || {});
    }

    async *entries() {
      for (const item of this._entriesArray()) {
        const name = String(item.name || '');
        if (!name) continue;
        if (item.kind === 'directory') yield [name, new AndroidDirectoryHandle(this._kind, joinPath(this._path, name), name)];
        else yield [name, new AndroidFileHandle(this._kind, joinPath(this._path, name), name, item)];
      }
    }

    [Symbol.asyncIterator]() { return this.entries(); }
  }

  function getRoot(kind) {
    const normalized = kind === 'tc' ? 'tc' : 'pr';
    const info = folderInfo(normalized);
    if (!info.connected || !info.name) return null;
    return new AndroidDirectoryHandle(normalized, '', info.name);
  }

  function chooseRoot(kind) {
    return new Promise((resolve, reject) => {
      const normalized = kind === 'tc' ? 'tc' : 'pr';
      const timeout = window.setTimeout(() => {
        window.removeEventListener('msw-android-folder-selected', listener);
        reject(new Error('Pemilihan folder Android tidak selesai.'));
      }, 120000);
      const listener = event => {
        if (event?.detail?.kind !== normalized) return;
        window.clearTimeout(timeout);
        window.removeEventListener('msw-android-folder-selected', listener);
        if (!event.detail.success) return reject(new Error(event.detail.error || 'Pemilihan folder dibatalkan.'));
        const root = getRoot(normalized);
        if (!root) return reject(new Error('Folder Android tidak dapat dibuka.'));
        resolve(root);
      };
      window.addEventListener('msw-android-folder-selected', listener);
      native.chooseFolder(normalized);
    });
  }

  function inferPickerKind() {
    const active = document.activeElement;
    const clue = `${active?.id || ''} ${active?.textContent || ''} ${active?.getAttribute?.('aria-label') || ''}`;
    return /(?:^|\W)tc(?:\W|$)|original\s*tc|master\s*tc/i.test(clue) ? 'tc' : 'pr';
  }

  // Android WebView tidak menyediakan File System Access API. Polyfill ini membuat
  // modul portal lama tetap dapat memakai showDirectoryPicker() tanpa rewrite besar.
  window.showDirectoryPicker = async function () {
    return chooseRoot(inferPickerKind());
  };

  // Semua modul procurement menyimpan FileSystemDirectoryHandle pada DB ini.
  // Handle SAF Android tidak structured-cloneable, jadi khusus DB handle tersebut
  // IndexedDB dibuat sebagai facade yang mengambil root langsung dari native prefs.
  const realIndexedDbOpen = window.indexedDB?.open?.bind(window.indexedDB);
  if (realIndexedDbOpen) {
    window.indexedDB.open = function (name, version) {
      if (String(name) !== DB_NAME) return realIndexedDbOpen(name, version);

      const fakeDb = {
        objectStoreNames: { contains: () => true },
        close() {},
        transaction() {
          let completeHandler = null;
          const tx = {
            error: null,
            objectStore() {
              return {
                get(key) {
                  const request = { result: key === TC_ROOT_KEY ? getRoot('tc') : (key === PR_ROOT_KEY ? getRoot('pr') : null), error: null };
                  Object.defineProperty(request, 'onsuccess', { set(fn) { if (typeof fn === 'function') queueMicrotask(() => fn({ target: request })); } });
                  Object.defineProperty(request, 'onerror', { set() {} });
                  return request;
                },
                put(value, key) {
                  // Native chooseRoot() sudah menyimpan URI secara persisten.
                  // Put dipertahankan sebagai no-op agar kontrak kode lama tetap sama.
                  queueMicrotask(() => { if (completeHandler) completeHandler({ target: tx }); });
                  return { result: key, error: null };
                }
              };
            }
          };
          Object.defineProperty(tx, 'oncomplete', { set(fn) { completeHandler = fn; queueMicrotask(() => { if (completeHandler) completeHandler({ target: tx }); }); } });
          Object.defineProperty(tx, 'onerror', { set() {} });
          Object.defineProperty(tx, 'onabort', { set() {} });
          return tx;
        }
      };

      const request = { result: fakeDb, error: null };
      Object.defineProperty(request, 'onupgradeneeded', { set() {} });
      Object.defineProperty(request, 'onsuccess', { set(fn) { if (typeof fn === 'function') queueMicrotask(() => fn({ target: request })); } });
      Object.defineProperty(request, 'onerror', { set() {} });
      return request;
    };
  }

  window.MSW_ANDROID_FOLDER_FS = Object.freeze({
    isAvailable: () => Boolean(window.AndroidFolder),
    getRoot,
    chooseRoot,
    folderInfo,
    DirectoryHandle: AndroidDirectoryHandle,
    FileHandle: AndroidFileHandle
  });
})();