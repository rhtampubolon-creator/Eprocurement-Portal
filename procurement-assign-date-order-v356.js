/* ======================================================
   PROCUREMENT ASSIGN DATE ORDER
   Release 3.5.6
   - Presentation/order adapter only; does not rewrite backend business data.
   - Primary order: Assign Date ascending (oldest -> newest).
   - Empty/invalid Assign Date goes last.
   - Tie-breaker: No PR ascending (numeric-aware).
   - Applies to Procurement cache and Admin-sheet GET responses so imports from
     multiple Buyers appear immediately in one consistent chronological order.
====================================================== */
(function installProcurementAssignDateOrder(){
  'use strict';
  if (window.__MSW_PROCUREMENT_ASSIGN_DATE_ORDER_V356__) return;
  window.__MSW_PROCUREMENT_ASSIGN_DATE_ORDER_V356__ = true;

  const CACHE_KEY = 'MSW_PROCUREMENT_CACHE';

  function firstValue(row, keys){
    for (const key of keys) {
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  }

  function parseAssignDate(value){
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 20000 && value < 80000) {
        const excel = new Date((value - 25569) * 86400 * 1000);
        return Number.isNaN(excel.getTime()) ? null : excel;
      }
      return null;
    }

    const text = String(value).trim();
    if (!text) return null;

    const numericValue = Number(text);
    if (Number.isFinite(numericValue) && numericValue > 20000 && numericValue < 80000) {
      const excel = new Date((numericValue - 25569) * 86400 * 1000);
      return Number.isNaN(excel.getTime()) ? null : excel;
    }

    const months = {
      jan:0, feb:1, mar:2, apr:3, may:4, mei:4, jun:5, jul:6,
      aug:7, agu:7, agt:7, sep:8, oct:9, okt:9, nov:10, dec:11, des:11
    };

    const named = text.match(/^(\d{1,2})[\s\-]+([A-Za-z]{3,9})[\s\-]+(\d{2,4})$/);
    if (named) {
      let year = Number(named[3]);
      if (year < 100) year += 2000;
      const month = months[named[2].slice(0,3).toLowerCase()];
      if (month !== undefined) {
        const date = new Date(year, month, Number(named[1]));
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }

    const dmy = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (dmy) {
      let year = Number(dmy[3]);
      if (year < 100) year += 2000;
      const date = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (iso) {
      const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function assignDateOf(row){
    return firstValue(row, [
      'assignprdate', 'Assign Date', 'Assign PR', 'Assign PR Date', 'AssignDate'
    ]);
  }

  function noPrOf(row){
    return String(firstValue(row, ['noPR', 'No PR', 'NoPR', 'PR No', 'PR Number']) || '').trim();
  }

  function sortRows(rows){
    if (!Array.isArray(rows) || rows.length < 2) return Array.isArray(rows) ? rows.slice() : rows;

    return rows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const leftDate = parseAssignDate(assignDateOf(left.row));
        const rightDate = parseAssignDate(assignDateOf(right.row));
        const leftTime = leftDate ? leftDate.getTime() : Number.POSITIVE_INFINITY;
        const rightTime = rightDate ? rightDate.getTime() : Number.POSITIVE_INFINITY;

        if (leftTime !== rightTime) return leftTime - rightTime;

        const prCompare = noPrOf(left.row).localeCompare(noPrOf(right.row), 'id', {
          numeric: true,
          sensitivity: 'base'
        });
        if (prCompare !== 0) return prCompare;

        return left.index - right.index;
      })
      .map(item => item.row);
  }

  window.MSW_PROCUREMENT_SORT_BY_ASSIGN_DATE = sortRows;

  try {
    const cached = window.MSW?.cache?.load?.(CACHE_KEY);
    if (Array.isArray(cached)) window.MSW.cache.save(CACHE_KEY, sortRows(cached));
  } catch (error) {
    console.warn('Procurement Assign Date cache ordering skipped:', error);
  }

  try {
    const cache = window.MSW?.cache;
    if (cache?.save && cache?.load && !cache.__MSW_ASSIGN_DATE_ORDER_V356__) {
      cache.__MSW_ASSIGN_DATE_ORDER_V356__ = true;
      const baseSave = cache.save.bind(cache);
      const baseLoad = cache.load.bind(cache);

      cache.save = function(key, data, ttl){
        const value = String(key || '') === CACHE_KEY && Array.isArray(data)
          ? sortRows(data)
          : data;
        return baseSave(key, value, ttl);
      };

      cache.load = function(key){
        const value = baseLoad(key);
        return String(key || '') === CACHE_KEY && Array.isArray(value)
          ? sortRows(value)
          : value;
      };
    }
  } catch (error) {
    console.warn('Procurement cache order adapter could not be installed:', error);
  }

  const upstreamFetch = window.fetch.bind(window);
  window.fetch = async function procurementAssignDateFetch(input, init){
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    const gas = String(window.APP_CONFIG?.GAS_URL || '').trim();

    if (!gas || method !== 'GET' || url.indexOf(gas) !== 0) {
      return upstreamFetch(input, init);
    }

    let isAdminSheet = false;
    try {
      const parsed = new URL(url, window.location.href);
      isAdminSheet = String(parsed.searchParams.get('sheet') || '').trim().toLowerCase() === 'admin';
    } catch (_) {
      isAdminSheet = /[?&]sheet=Admin(?:&|$)/i.test(url);
    }

    if (!isAdminSheet) return upstreamFetch(input, init);

    const response = await upstreamFetch(input, init);
    try {
      const raw = await response.clone().text();
      if (!raw || /^\s*</.test(raw)) return response;
      const payload = JSON.parse(raw);
      if (!Array.isArray(payload?.rows)) return response;

      const ordered = Object.assign({}, payload, { rows: sortRows(payload.rows) });
      return new Response(JSON.stringify(ordered), {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers)
      });
    } catch (error) {
      console.warn('Procurement Assign Date response ordering skipped:', error);
      return response;
    }
  };
})();
