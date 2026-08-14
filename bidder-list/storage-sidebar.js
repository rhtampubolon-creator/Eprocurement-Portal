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