(function () {
  'use strict';

  const native = window.AndroidFolder;
  if (!native) return;

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
    const info = folderInfo(kind);
    if (!info.connected || !info.name) return null;
    return new AndroidDirectoryHandle(kind, '', info.name);
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

  window.MSW_ANDROID_FOLDER_FS = Object.freeze({
    isAvailable: () => Boolean(window.AndroidFolder),
    getRoot,
    chooseRoot,
    folderInfo,
    DirectoryHandle: AndroidDirectoryHandle,
    FileHandle: AndroidFileHandle
  });
})();