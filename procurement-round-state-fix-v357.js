/* ======================================================
   PROCUREMENT ROUND STATE FIX — Release 3.5.7
   Corrects display/cache derivation without changing backend/source fields.

   Rules:
   - Submit Company is ONLY the selected round's R0-R5 Submit Company.
     It must never fall back to Final Submit Vendor or stale generic values.
   - Status Rebid is ALWAYS derived from the selected/active round:
       Round + submitted count / invited count + that round's Finish Date.
   - Final Submit Vendor remains independent and is never overwritten here.
====================================================== */
(function installProcurementRoundStateFix(){
  'use strict';
  if (window.__MSW_PROCUREMENT_ROUND_STATE_FIX_V357__) return;
  window.__MSW_PROCUREMENT_ROUND_STATE_FIX_V357__ = true;

  const CACHE_KEY = 'MSW_PROCUREMENT_CACHE';
  const ROUNDS = ['R0','R1','R2','R3','R4','R5'];

  function normalizeRound(value){
    const match = String(value || '').trim().toUpperCase().match(/R\s*([0-5])/);
    return match ? `R${match[1]}` : '';
  }

  function field(row, canonical, aliases = []){
    if (!row || typeof row !== 'object') return '';
    const keys = [canonical, ...aliases];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        const value = row[key];
        return value == null ? '' : value;
      }
    }
    return '';
  }

  function roundField(row, round, suffix){
    const lower = round.toLowerCase();
    const label = suffix === 'company' ? 'Company'
      : suffix === 'submitcompany' ? 'Submit Company'
      : suffix === 'startdate' ? 'Start Date'
      : suffix === 'finishdate' ? 'Finish Date'
      : suffix;
    return field(row, `${lower}${suffix}`, [
      `${round} ${label}`,
      `${round}${label.replace(/\s+/g, '')}`
    ]);
  }

  function detectLatestRound(row){
    let latest = -1;
    const declared = normalizeRound(field(row, 'roundpo', ['Round PR', 'Round PO']));
    if (declared) latest = Number(declared.slice(1));

    ROUNDS.forEach((round, index) => {
      const hasData = ['company','submitcompany','startdate','finishdate']
        .some(suffix => String(roundField(row, round, suffix) ?? '').trim() !== '');
      if (hasData) latest = Math.max(latest, index);
    });
    return latest >= 0 ? `R${latest}` : 'R0';
  }

  function splitVendors(value){
    const seen = new Set();
    return String(value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split(/\n|;/)
      .map(item => item.trim())
      .filter(item => {
        const key = item.toLocaleLowerCase('id');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function parseDate(value){
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
      const date = new Date((numeric - 25569) * 86400 * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const text = String(value).trim();
    if (!text) return null;
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,mei:4,jun:5,jul:6,aug:7,agu:7,agt:7,sep:8,oct:9,okt:9,nov:10,dec:11,des:11};
    const named = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{2,4})$/);
    if (named) {
      let year = Number(named[3]);
      if (year < 100) year += 2000;
      const month = months[named[2].slice(0,3).toLowerCase()];
      if (month !== undefined) return new Date(year, month, Number(named[1]));
    }
    const dmy = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (dmy) {
      let year = Number(dmy[3]);
      if (year < 100) year += 2000;
      return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    }
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function formatDate(value){
    const date = parseDate(value);
    return date
      ? date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
      : String(value || '').trim();
  }

  function statusForRound(row, round){
    const invited = splitVendors(roundField(row, round, 'company'));
    const submitted = splitVendors(roundField(row, round, 'submitcompany'));
    const finish = roundField(row, round, 'finishdate');
    return [
      round,
      `${submitted.length} of ${invited.length}`,
      finish ? formatDate(finish) : ''
    ].filter(Boolean).join('\n');
  }

  function sanitizeRow(row){
    if (!row || typeof row !== 'object') return row;
    const activeRound = normalizeRound(field(row, 'roundpo', ['Round PR', 'Round PO'])) || detectLatestRound(row);
    const submitted = roundField(row, activeRound, 'submitcompany');

    // Strict source: generic Submit Company mirrors only the active round field.
    // Do NOT use Final Submit Vendor as fallback.
    row.roundsubmitcompany = submitted == null ? '' : submitted;

    // Status Rebid is derived live from active round data, so stale imported
    // status text can never keep an old Finish Date.
    row.statusrebid = statusForRound(row, activeRound);
    return row;
  }

  function sanitizeRows(rows){
    if (!Array.isArray(rows)) return rows;
    rows.forEach(sanitizeRow);
    return rows;
  }

  // Runs before procurement-admin/script.js. Its saveProcurementCache() mutates
  // rows first, then this wrapper corrects the two derived display fields in-place
  // before the same array is rendered and cached.
  try {
    const cache = window.MSW?.cache;
    if (cache?.save && cache?.load && !cache.__MSW_ROUND_STATE_FIX_V357__) {
      cache.__MSW_ROUND_STATE_FIX_V357__ = true;
      const baseSave = cache.save.bind(cache);
      const baseLoad = cache.load.bind(cache);

      cache.save = function(key, data, ttl){
        if (String(key || '') === CACHE_KEY && Array.isArray(data)) sanitizeRows(data);
        return baseSave(key, data, ttl);
      };

      cache.load = function(key){
        const value = baseLoad(key);
        if (String(key || '') === CACHE_KEY && Array.isArray(value)) sanitizeRows(value);
        return value;
      };

      const existing = baseLoad(CACHE_KEY);
      if (Array.isArray(existing)) baseSave(CACHE_KEY, sanitizeRows(existing));
    }
  } catch (error) {
    console.warn('Procurement round-state cache fix could not be installed:', error);
  }

  function setCell(tr, key, value){
    const cell = tr?.querySelector(`td[data-key="${key}"]`);
    if (cell) cell.textContent = String(value ?? '');
  }

  function applyRoundView(index, selectedValue){
    const rows = (() => {
      try { return window.MSW?.cache?.load?.(CACHE_KEY) || []; }
      catch (_) { return []; }
    })();
    const row = Array.isArray(rows) ? rows[Number(index)] : null;
    const tr = document.querySelector(`#tableBody tr[data-index="${Number(index)}"]`);
    if (!row || !tr) return;

    const selected = normalizeRound(selectedValue) || 'R0';
    const company = roundField(row, selected, 'company');
    const submitted = roundField(row, selected, 'submitcompany');
    const start = roundField(row, selected, 'startdate');
    const finish = roundField(row, selected, 'finishdate');

    setCell(tr, 'roundcompany', company);
    setCell(tr, 'roundsubmitcompany', submitted);
    setCell(tr, 'roundstartdate', formatDate(start));
    setCell(tr, 'roundfinishdate', formatDate(finish));
    setCell(tr, 'statusrebid', statusForRound(row, selected));

    // Intentionally do not touch Final Submit Vendor. It is an independent field.
  }

  // Compatibility bridge installs updateRoundPR after DOMContentLoaded. Override
  // only that display function once it exists.
  function installRoundViewOverride(){
    if (window.__MSW_ROUND_VIEW_OVERRIDE_V357__) return true;
    if (typeof window.updateRoundPR !== 'function') return false;
    window.updateRoundPR = applyRoundView;
    window.updateRoundPO = applyRoundView;
    window.__MSW_ROUND_VIEW_OVERRIDE_V357__ = true;
    return true;
  }

  if (!installRoundViewOverride()) {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (installRoundViewOverride() || tries > 120) clearInterval(timer);
    }, 50);
  }
})();
