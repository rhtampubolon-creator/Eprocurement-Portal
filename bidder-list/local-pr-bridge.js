(function () {
  'use strict';

  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const DB_STORE = 'handles';
  const ROOT_HANDLE_KEY = 'prRoot';
  const LOCAL_ID_PREFIX = 'localpr|';
  const PROJECT_FOLDER_TYPES = new Set([
    '01. PR Approval',
    '02. Bidderlist',
    '03. CQS',
    '04. PO',
    '05. Contract'
  ]);
  const ROUND_FOLDER_TYPES = new Set(['02. Bidderlist', '03. CQS']);
  const MAX_INLINE_ATTACHMENT_BYTES = 20 * 1024 * 1024;

  let startupLazyGuard = true;
  let overridesInstalled = false;
  let allowExplicitDocumentRefresh = false;

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
      const text = args.map(arg => {
        if (arg instanceof Error) return `${arg.message || ''} ${arg.stack || ''}`;
        try { return typeof arg === 'string' ? arg : JSON.stringify(arg); }
        catch (_) { return String(arg || ''); }
      }).join(' ');
      if (/MSW_LAZY_TEMPLATE_STARTUP|Master\s+(?:Bidderlist|RFQ|CQS)|Fallback master lokal|Google Drive.*gagal dimuat/i.test(text)) {
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

  async function loadRootHandle() {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const request = tx.objectStore(DB_STORE).get(ROOT_HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function ensurePermission(handle, requestPermission) {
    if (!handle) return false;
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    return Boolean(requestPermission && (await handle.requestPermission(options)) === 'granted');
  }

  async function getConnectedPrRoot(requestPermission = true) {
    const root = await loadRootHandle();
    if (!root) {
      throw new Error('Folder PR belum terhubung. Buka tab Procurement lalu klik Connect Folder PR.');
    }
    if (asText(root.name).toUpperCase() !== 'PR') {
      throw new Error(`Root lokal harus folder PR. Folder tersimpan saat ini: ${root.name || '-'}`);
    }
    if (!(await ensurePermission(root, requestPermission))) {
      throw new Error('Izin akses folder PR belum diberikan. Klik Connect Folder PR kembali dari tab Procurement.');
    }
    return root;
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
    return !boundary || /[\s\-_([]/.test(boundary);
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
      if (error?.name === 'NotFoundError') {
        return { directory: null, prFolder, context, sourceType };
      }
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

  function createLocalFileId(prFolderName, sourceType, round, fileName) {
    return [
      'localpr',
      encodeURIComponent(prFolderName),
      encodeURIComponent(sourceType),
      encodeURIComponent(round || ''),
      encodeURIComponent(fileName)
    ].join('|');
  }

  function parseLocalFileId(fileId) {
    const raw = asText(fileId);
    if (!raw.startsWith(LOCAL_ID_PREFIX)) return null;
    const parts = raw.split('|');
    if (parts.length !== 5) return null;
    try {
      return {
        prFolderName: decodeURIComponent(parts[1]),
        sourceType: decodeURIComponent(parts[2]),
        round: decodeURIComponent(parts[3]),
        fileName: decodeURIComponent(parts[4])
      };
    } catch (_) {
      return null;
    }
  }

  async function listLocalProjectFiles(sourceType) {
    const target = await getProjectFolderHandle(sourceType, { requestPermission: true });
    if (!target.directory) return [];
    const files = [];
    for await (const [name, handle] of target.directory.entries()) {
      if (handle.kind !== 'file') continue;
      const file = await handle.getFile();
      files.push({
        fileId: createLocalFileId(
          target.prFolder.name,
          sourceType,
          ROUND_FOLDER_TYPES.has(sourceType) ? target.context.round : '',
          name
        ),
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

  async function resolveLocalFile(fileOrId) {
    const fileId = typeof fileOrId === 'string' ? fileOrId : fileOrId?.fileId;
    const parsed = parseLocalFileId(fileId);
    if (!parsed) throw new Error('Referensi file lokal tidak valid.');

    const root = await getConnectedPrRoot(true);
    let directory;
    try {
      directory = await root.getDirectoryHandle(parsed.prFolderName, { create: false });
      directory = await directory.getDirectoryHandle(parsed.sourceType, { create: false });
      if (parsed.round && ROUND_FOLDER_TYPES.has(parsed.sourceType)) {
        directory = await directory.getDirectoryHandle(parsed.round, { create: false });
      }
      const handle = await directory.getFileHandle(parsed.fileName, { create: false });
      return await handle.getFile();
    } catch (error) {
      if (error?.name === 'NotFoundError') {
        throw new Error(`File ${parsed.fileName} tidak ditemukan lagi pada folder OneDrive lokal.`);
      }
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
        if (!PROJECT_FOLDER_TYPES.has(sourceType)) {
          return originalLoadMultipleEmailFolderFiles(sourceType);
        }

        const files = await listLocalProjectFiles(sourceType);
        MULTIPLE_EMAIL_FOLDER_FILES = files;
        if (typeof renderMultipleEmailAttachmentFileList === 'function') {
          renderMultipleEmailAttachmentFileList();
        }
        return {
          success: true,
          source: 'LOCAL_PR',
          folderType: sourceType,
          files
        };
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
          inlineAttachments.push({
            fileName: file.name,
            mimeType: mimeFromName(file.name, file.type),
            base64: await fileToBase64(file)
          });
        }

        return originalRequestOutlookDraftEml({
          ...payload,
          attachmentFileIds: backendIds,
          attachments: inlineAttachments
        });
      };
    }

    if (typeof scheduleNativeDocumentSync === 'function') {
      window.scheduleNativeDocumentSync = function () {
        // Dokumen native tidak lagi dibuat/di-sync hanya karena autosave workspace.
        // Template baru dimuat ketika user memilih View/Save/Export BidderList, RFQ, atau CQS.
      };
    }

    if (typeof refreshProcurementDocuments === 'function') {
      const originalRefreshProcurementDocuments = refreshProcurementDocuments;
      window.refreshProcurementDocuments = async function (options = {}) {
        if (!allowExplicitDocumentRefresh) {
          try {
            if (typeof updateProcurementDocumentViewButtons === 'function') updateProcurementDocumentViewButtons();
            return typeof PROCUREMENT_DOCUMENT_STATE !== 'undefined'
              ? (PROCUREMENT_DOCUMENT_STATE.documents || {})
              : {};
          } catch (_) {
            return {};
          }
        }
        allowExplicitDocumentRefresh = false;
        return originalRefreshProcurementDocuments(options);
      };
      document.addEventListener('click', markExplicitDocumentRefresh, true);
    }

    window.MSW_BIDDER_LOCAL_PR_BRIDGE = Object.freeze({
      listLocalProjectFiles,
      resolveLocalFile,
      findExistingPrFolder,
      normalizeBasePr
    });
  }

  document.addEventListener('readystatechange', installOverrides);
  document.addEventListener('DOMContentLoaded', installOverrides, { once: true });
  window.setTimeout(installOverrides, 0);
})();
