/**
 * Public runtime configuration.
 *
 * Production frontend intentionally contains only the Web App endpoint and
 * non-sensitive UI settings. Spreadsheet IDs and Apps Script project URLs
 * stay on the backend (Script Properties).
 */
window.APP_CONFIG = Object.freeze({
  ENVIRONMENT: "production",
  VERSION: "3.5.0-stable-auth-v23",
  GAS_URL: "https://script.google.com/macros/s/AKfycbwlpvbUm6CEPzSDzMFIfsrh_RnBUFNmWr7XLDhth_n1P2CM_XyifNKlFKxqrsmangwcSg/exec",
  EMAILS: Object.freeze({
    releasePoCc: [],
    releasePrTo: "",
    releasePrCc: "",
    poProcTo: "",
    appointmentTo: "",
    procurementInbox: "",
    procurementCc: ""
  })
});

(function loadAndroidFolderAdapterEarly() {
  if (!window.AndroidFolder || document.querySelector('script[data-msw-android-folder-fs]')) return;
  const configSrc = document.currentScript?.src || new URL('config.js', window.location.href).href;
  const adapterUrl = new URL('./android-folder-fs.js', configSrc).href + '?v=20260814-android-folder-v1';
  if (document.readyState === 'loading') {
    const safeUrl = adapterUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    document.write('<script data-msw-android-folder-fs="true" src="' + safeUrl + '"></' + 'script>');
  } else {
    const script = document.createElement('script');
    script.src = adapterUrl;
    script.dataset.mswAndroidFolderFs = 'true';
    document.head.appendChild(script);
  }
})();

(function loadBidderLocalPrBridgeEarly() {
  if (!/\/bidder-list\//i.test(window.location.pathname)) return;
  if (document.querySelector('script[data-msw-bidder-local-pr-bridge]')) return;

  // config.js berada sebelum bidder-list/script.js. document.write digunakan
  // sengaja di fase parser agar bridge lokal aktif sinkron SEBELUM script besar
  // BidderList menjalankan initializeBidderWorkspace() dan preload master lama.
  if (document.readyState === "loading") {
    const bridgeUrl = new URL("./local-pr-bridge.js", window.location.href).href + "?v=20260814-storage-setup-v3";
    const safeUrl = bridgeUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    document.write('<script data-msw-bidder-local-pr-bridge="true" src="' + safeUrl + '"></' + 'script>');

    const sidebarUrl = new URL("./storage-sidebar.js", window.location.href).href + "?v=20260814-storage-sidebar-v2";
    const safeSidebarUrl = sidebarUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    document.write('<script data-msw-storage-sidebar="true" src="' + safeSidebarUrl + '"></' + 'script>');
  }
})();

(function loadProcurementFolderRules() {
  if (!/\/procurement-admin\/Form\//i.test(window.location.pathname)) return;
  window.addEventListener("DOMContentLoaded", function () {
    if (document.querySelector('script[data-msw-pr-folder-rules]')) return;

    const rules = document.createElement("script");
    rules.src = new URL("../../procurement-folder-rules.js", window.location.href).href + "?v=20260814-pr-folder-v2";
    rules.defer = true;
    rules.dataset.mswPrFolderRules = "true";
    rules.addEventListener("load", function () {
      if (document.querySelector('script[data-msw-pr-local-files]')) return;
      const localFiles = document.createElement("script");
      localFiles.src = new URL("../../procurement-local-files.js", window.location.href).href + "?v=20260814-pr-local-v2";
      localFiles.defer = true;
      localFiles.dataset.mswPrLocalFiles = "true";
      localFiles.addEventListener("load", function () {
        if (document.querySelector('script[data-msw-existing-pr-folder]')) return;
        const existingPr = document.createElement("script");
        existingPr.src = new URL("../../procurement-existing-pr-folder.js", window.location.href).href + "?v=20260814-existing-pr-v2";
        existingPr.defer = true;
        existingPr.dataset.mswExistingPrFolder = "true";
        document.body.appendChild(existingPr);
      }, { once: true });
      document.body.appendChild(localFiles);
    }, { once: true });
    document.body.appendChild(rules);
  }, { once: true });
})();
