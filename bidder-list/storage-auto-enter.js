(function () {
  'use strict';

  async function autoEnterWhenStorageReady() {
    const bridge = window.MSW_BIDDER_LOCAL_PR_BRIDGE;
    if (!bridge || typeof bridge.refreshStorageSetup !== 'function') return;

    try {
      const ready = await bridge.refreshStorageSetup();
      if (!ready) return;

      const gate = document.getElementById('mswStorageSetupGate');
      if (gate) gate.hidden = true;
      document.body?.classList.remove('msw-storage-locked');
    } catch (_) {
      // Bila handle belum ada atau permission tidak aktif, Storage Setup tetap tampil.
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.setTimeout(autoEnterWhenStorageReady, 0);
    window.setTimeout(autoEnterWhenStorageReady, 100);
  }, { once: true });
})();
