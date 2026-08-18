/* ======================================================
   PROCUREMENT REVIEW FAST NOTE BRIDGE — Release 3.5.14

   Intercepts ONLY the note-only Procurement Review EDIT payload and upgrades it
   to UPDATE_PROCUREMENT_NOTE. If the deployed Apps Script does not support the
   new lightweight action yet, it safely falls back to the existing EDIT action.
   No other Procurement edit request is changed.
====================================================== */
(function installProcurementReviewFastNoteBridgeV3514(){
  'use strict';
  if (window.__MSW_PROCUREMENT_REVIEW_FAST_NOTE_V3514__) return;
  window.__MSW_PROCUREMENT_REVIEW_FAST_NOTE_V3514__ = true;
  if (document.body?.dataset?.mswPage !== 'main-menu') return;

  const previousFetch = window.fetch.bind(window);

  function text(value){ return String(value == null ? '' : value).trim(); }

  function parseBody(init){
    if (!init || String(init.method || 'GET').toUpperCase() !== 'POST') return null;
    if (typeof init.body !== 'string') return null;
    try { return JSON.parse(init.body); } catch (_) { return null; }
  }

  function isNoteOnlyEdit(body){
    if (!body || text(body.action).toUpperCase() !== 'EDIT') return false;
    if (text(body.sheet || 'Admin').toUpperCase() !== 'ADMIN') return false;
    const data = body.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const allowed = new Set(['procurementId','Procurement ID','__version','version','Version','note','Note']);
    const keys = Object.keys(data);
    if (!keys.length || !keys.some(key => key === 'note' || key === 'Note')) return false;
    if (!keys.every(key => allowed.has(key))) return false;
    return Boolean(text(data.procurementId || data['Procurement ID']));
  }

  function fastPayload(body){
    const data = body.data || {};
    return {
      action: 'UPDATE_PROCUREMENT_NOTE',
      sheet: body.sheet || 'Admin',
      authToken: body.authToken || '',
      procurementId: data.procurementId || data['Procurement ID'] || '',
      expectedVersion: data.__version ?? data.version ?? data.Version ?? 0,
      note: data.note ?? data.Note ?? ''
    };
  }

  async function responseJson(response){
    try { return JSON.parse(await response.clone().text()); }
    catch (_) { return null; }
  }

  function unsupported(result){
    if (!result || result.success !== false) return false;
    return /action atau payload tidak dikenali|unknown action|update_procurement_note.*tidak/i.test(String(result.message || ''));
  }

  window.fetch = async function(input, init){
    const body = parseBody(init);
    if (!isNoteOnlyEdit(body)) return previousFetch(input, init);

    const upgradedInit = Object.assign({}, init, {body: JSON.stringify(fastPayload(body))});
    try {
      const fastResponse = await previousFetch(input, upgradedInit);
      const result = await responseJson(fastResponse);
      if (!unsupported(result)) return fastResponse;
    } catch (_) {
      // Backend lama / deployment belum mendukung action baru: fallback di bawah.
    }

    return previousFetch(input, init);
  };
})();
