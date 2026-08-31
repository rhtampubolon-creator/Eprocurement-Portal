/* ======================================================
   PROCUREMENT IMPORT REVISION RETRY
   If another user/device changes Admin Procurement between
   page load and Smart Import confirmation, refresh the current
   Admin revision and retry the import once.

   Safety:
   - Only intercepts BATCH_IMPORT_PROCUREMENT_BY_BUYER.
   - Only retries once.
   - Never changes the imported rows.
   - If the retry is rejected, the original backend response is returned.
====================================================== */
(function installProcurementImportRevisionRetry(){
  "use strict";

  if (window.__MSW_PROCUREMENT_IMPORT_REVISION_RETRY_V1__) return;
  window.__MSW_PROCUREMENT_IMPORT_REVISION_RETRY_V1__ = true;

  const nativeFetch = window.fetch.bind(window);
  const IMPORT_ACTION = "BATCH_IMPORT_PROCUREMENT_BY_BUYER";

  function parseJson(text){
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  function isImportPayload(payload){
    return String(payload?.action || "").trim().toUpperCase() === IMPORT_ACTION;
  }

  function isRevisionConflict(result){
    if (!result || result.success !== false) return false;
    const message = String(result.message || "").toLowerCase();
    return Boolean(
      result.conflict === true ||
      message.includes("berubah sejak halaman dibuka") ||
      message.includes("revision") ||
      message.includes("revisi") ||
      message.includes("expectedrevision")
    );
  }

  function requestUrl(input){
    return typeof input === "string" ? input : String(input?.url || "");
  }

  function requestInit(input, init){
    return Object.assign({}, init || {}, {
      method: String(init?.method || input?.method || "GET").toUpperCase()
    });
  }

  async function readAdminRevision(gasUrl, sheet){
    const separator = gasUrl.includes("?") ? "&" : "?";
    const url = `${gasUrl}${separator}sheet=${encodeURIComponent(sheet || "Admin")}&_revisionRetry=${Date.now()}`;
    const response = await nativeFetch(url, { method: "GET", cache: "no-store" });
    if (!response.ok) return null;

    const text = await response.text();
    const data = parseJson(text);
    const revision = Number(data?.revision);
    return Number.isFinite(revision) ? revision : null;
  }

  async function retryWithLatestRevision(url, init, payload, gasUrl){
    const latestRevision = await readAdminRevision(gasUrl, payload.sheet || "Admin");
    if (latestRevision == null) return null;

    const retryPayload = Object.assign({}, payload, {
      expectedRevision: latestRevision
    });

    return nativeFetch(url, Object.assign({}, init, {
      method: "POST",
      body: JSON.stringify(retryPayload)
    }));
  }

  window.fetch = async function procurementImportRevisionRetry(input, init){
    const url = requestUrl(input);
    const options = requestInit(input, init);

    if (options.method !== "POST" || !String(url).includes(String(window.APP_CONFIG?.GAS_URL || ""))) {
      return nativeFetch(input, init);
    }

    let payload = null;
    try {
      payload = typeof options.body === "string" ? JSON.parse(options.body) : null;
    } catch (_) {
      payload = null;
    }

    if (!isImportPayload(payload)) {
      return nativeFetch(input, init);
    }

    const firstResponse = await nativeFetch(input, init);
    const firstText = await firstResponse.clone().text();
    const firstResult = parseJson(firstText);

    if (!isRevisionConflict(firstResult)) {
      return firstResponse;
    }

    console.warn("Procurement Smart Import revision stale; refreshing revision and retrying once.");

    try {
      const gasUrl = String(window.APP_CONFIG?.GAS_URL || "").trim();
      const retryResponse = await retryWithLatestRevision(url, options, payload, gasUrl);
      if (retryResponse) return retryResponse;
    } catch (error) {
      console.warn("Procurement Smart Import revision retry gagal:", error);
    }

    return firstResponse;
  };
})();
