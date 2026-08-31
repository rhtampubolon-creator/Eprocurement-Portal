/* ======================================================
   PROCUREMENT AUTH TRANSPORT v3.5.19
   Backend v3.5.19 rejects authToken in query strings.
   This compatibility layer converts authenticated GAS GET
   requests into POST JSON before the request reaches the
   common fetch wrapper.

   Procurement Smart Import intentionally does NOT send a
   stale page revision. The backend reads the current sheet
   state immediately before the UPSERT, so import behaves as
   synchronization: existing keys UPDATE, new keys INSERT,
   duplicates are skipped.

   Scope: Procurement Admin page only.
   Android bridge is intentionally untouched.
====================================================== */
(function installProcurementAuthTransport(){
  if (window.__MSW_PROCUREMENT_AUTH_TRANSPORT_V3519__) return;
  window.__MSW_PROCUREMENT_AUTH_TRANSPORT_V3519__ = true;

  const originalFetch = window.fetch.bind(window);
  const gasUrl = String(window.APP_CONFIG?.GAS_URL || '').trim();

  function readToken(){
    try {
      if (typeof window.MSW_GET_AUTH_TOKEN === 'function') {
        return String(window.MSW_GET_AUTH_TOKEN() || '').trim();
      }
    } catch (_) {}
    try {
      return String(sessionStorage.getItem('MSW_AUTH_TOKEN') || localStorage.getItem('MSW_AUTH_TOKEN') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function convertAuthenticatedGet(input, init){
    if (!gasUrl) return null;
    const method = String(init?.method || 'GET').toUpperCase();
    if (method !== 'GET') return null;

    const rawUrl = typeof input === 'string' ? input : String(input?.url || '');
    if (!rawUrl || rawUrl.indexOf(gasUrl) !== 0) return null;

    let url;
    try { url = new URL(rawUrl, window.location.href); } catch (_) { return null; }
    const queryToken = String(url.searchParams.get('authToken') || '').trim();
    const token = queryToken || readToken();
    if (!token) return null;

    // Do not send the session token in the URL.
    url.searchParams.delete('authToken');

    const payload = {};
    url.searchParams.forEach((value, key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        if (!Array.isArray(payload[key])) payload[key] = [payload[key]];
        payload[key].push(value);
      } else {
        payload[key] = value;
      }
    });
    payload.authToken = token;

    return {
      url: url.origin + url.pathname + (url.search ? url.search : ''),
      init: Object.assign({}, init || {}, {
        method: 'POST',
        headers: Object.assign({}, init?.headers || {}, {
          'Content-Type': 'text/plain;charset=utf-8'
        }),
        body: JSON.stringify(payload)
      })
    };
  }

  function normalizeProcurementSmartImportBody(init){
    const method = String(init?.method || 'GET').toUpperCase();
    if (method !== 'POST' || typeof init?.body !== 'string') return init;

    let payload;
    try { payload = JSON.parse(init.body); } catch (_) { return init; }

    if (String(payload?.action || '').trim() !== 'BATCH_IMPORT_PROCUREMENT_BY_BUYER') {
      return init;
    }

    // Smart Import is an UPSERT against the live sheet. Do not reject an
    // otherwise valid import because the page revision became stale while
    // the user was preparing the Excel file. The server still performs the
    // current-state read, role/ownership checks, duplicate detection and
    // writes a fresh revision after the mutation.
    delete payload.expectedRevision;

    // Preserve the mutation id for server-side idempotency.
    if (!payload.clientMutationId) {
      payload.clientMutationId = 'SMI-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }

    return Object.assign({}, init, { body: JSON.stringify(payload) });
  }

  window.fetch = function(input, init){
    try {
      const converted = convertAuthenticatedGet(input, init || {});
      if (converted) return originalFetch(converted.url, converted.init);

      const normalizedInit = normalizeProcurementSmartImportBody(init || {});
      if (normalizedInit !== (init || {})) {
        return originalFetch(input, normalizedInit);
      }
    } catch (error) {
      console.warn('Procurement auth transport fallback:', error);
    }
    return originalFetch(input, init);
  };
})();
