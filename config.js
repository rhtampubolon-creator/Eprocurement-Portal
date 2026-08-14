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
    const script = document.createElement("script");
    script.src = new URL("../../procurement-folder-rules.js", window.location.href).href + "?v=20260814-pr-folder-v1";
    script.defer = true;
    script.dataset.mswPrFolderRules = "true";
    document.body.appendChild(script);
  }, { once: true });
})();
