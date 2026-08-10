/** Safe public frontend configuration example. */
window.APP_CONFIG = Object.freeze({
  ENVIRONMENT: "production",
  VERSION: "3.2.0-security-v18",
  GAS_URL: "PASTE_DEPLOYED_APPS_SCRIPT_EXEC_URL_HERE",
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
