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
      localFiles.src = new URL("../../procurement-local-files.js", window.location.href).href + "?v=20260814-pr-local-v1";
      localFiles.defer = true;
      localFiles.dataset.mswPrLocalFiles = "true";
      document.body.appendChild(localFiles);
    }, { once: true });
    document.body.appendChild(rules);
  }, { once: true });
})();
