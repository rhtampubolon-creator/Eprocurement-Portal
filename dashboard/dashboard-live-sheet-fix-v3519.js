/* ======================================================
   DASHBOARD LIVE SHEET FIX v3.5.19
   - Reads Admin directly from Google Apps Script via authenticated POST.
   - Keeps Google Sheet as source of truth.
   - Normalizes Procurement headers used by dashboard calculations.
   - Does not touch Procurement Import or Android bridge.
====================================================== */
(function installDashboardLiveSheetFix(){
  if (window.__MSW_DASHBOARD_LIVE_SHEET_FIX_V3519__) return;
  window.__MSW_DASHBOARD_LIVE_SHEET_FIX_V3519__ = true;

  function firstValue(row, keys, fallback){
    for (const key of keys) {
      const value = row && row[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return fallback;
  }

  function readAuthToken(){
    try {
      if (typeof window.MSW_GET_AUTH_TOKEN === 'function') {
        const token = String(window.MSW_GET_AUTH_TOKEN() || '').trim();
        if (token) return token;
      }
    } catch (_) {}

    try {
      if (window.MSW?.auth?.getToken) {
        const token = String(window.MSW.auth.getToken() || '').trim();
        if (token) return token;
      }
    } catch (_) {}

    try {
      const keys = ['MSW_AUTH_TOKEN','authToken','sessionToken','MSW_SESSION_TOKEN'];
      for (const key of keys) {
        const token = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
        if (token) return token;
      }
    } catch (_) {}

    return '';
  }

  window.mapDashboardRows = function mapDashboardRowsLive(rows){
    return (Array.isArray(rows) ? rows : []).map(r => ({
      prno: firstValue(r, ['No PR','NO PR','No. PR','noPR','nopr'], ''),
      description: firstValue(r, ['Description','DESCRIPTION','description'], ''),
      procurementtype: firstValue(r, ['Status PR','STATUS PR','Pengadaan','PENGADAAN','statuspr','pengadaan'], ''),
      assigndate: firstValue(r, ['Assign PR','ASSIGN PR','Assign Date','Assign PR Date','assignprdate','assignpr'], ''),
      cqsapproval: firstValue(r, ['CQS Approval Date','cqsapprovaldate'], ''),
      pocreatedate: firstValue(r, ['PO Create Date','PO Date','pocreatedate'], ''),
      pono: firstValue(r, ['No PO','NO PO','PO Number','nopo'], ''),
      estimateprice: firstValue(r, ['Est. Price US - Rp','Est. Price','Estimate Price','estpriceus'], 0),
      poactualprice: firstValue(r, ['Price (Rp) Excl. PPn','Price (Rp) Excl. PPN','PO Price','pricerp'], 0),
      winner: firstValue(r, ['Winner PO','Final Submit Vendor','Final Vendor List','winnerpo'], ''),
      flowprocess: firstValue(r, ['Flow Process','flowprocess'], ''),
      buyer: firstValue(r, ['Buyer','PIC','Owner Name','Owner Email','buyer','pic','ownerName','ownerEmail'], ''),
      buyeremail: firstValue(r, ['Owner Email','Created By','ownerEmail','createdBy'], ''),
      department: firstValue(r, ['Departement','Department','departement','department'], ''),
      pic: firstValue(r, ['PIC','pic'], ''),
      statusrebid: firstValue(r, ['Status Rebid','STATUS REBID','statusrebid'], ''),
      r0: firstValue(r, ['R0 Submit Company','R0 Company','r0submitcompany','r0company'], ''),
      r1: firstValue(r, ['R1 Submit Company','R1 Company','r1submitcompany','r1company'], ''),
      r2: firstValue(r, ['R2 Submit Company','R2 Company','r2submitcompany','r2company'], ''),
      r3: firstValue(r, ['R3 Submit Company','R3 Company','r3submitcompany','r3company'], ''),
      r4: firstValue(r, ['R4 Submit Company','R4 Company','r4submitcompany','r4company'], ''),
      r5: firstValue(r, ['R5 Submit Company','R5 Company','r5submitcompany','r5company'], ''),
      r0start: firstValue(r, ['R0 Start Date','r0startdate'], ''),
      r1start: firstValue(r, ['R1 Start Date','r1startdate'], ''),
      r2start: firstValue(r, ['R2 Start Date','r2startdate'], ''),
      r3start: firstValue(r, ['R3 Start Date','r3startdate'], ''),
      r4start: firstValue(r, ['R4 Start Date','r4startdate'], ''),
      r5start: firstValue(r, ['R5 Start Date','r5startdate'], '')
    })).filter(row => String(row.prno || '').trim() !== '');
  };

  window.calculateSummary = function calculateSummaryLive(){
    const rows = Array.isArray(window.dashboard?.filteredRows) ? window.dashboard.filteredRows : [];
    const cleanPR = rows.filter(r => String(r.prno || '').trim() !== '');
    const uniquePR = typeof window.uniqueBy === 'function' ? window.uniqueBy(cleanPR, 'prno') : cleanPR;

    let poRows = [];
    try {
      poRows = typeof window.getFilteredPORows === 'function' ? window.getFilteredPORows() : rows;
    } catch (_) {
      poRows = rows;
    }
    poRows = poRows.filter(r => String(r.pono || '').trim() !== '');
    const uniquePO = typeof window.uniqueBy === 'function' ? window.uniqueBy(poRows, 'pono') : poRows;

    let estimatePrice = 0;
    let poActualPrice = 0;
    cleanPR.forEach(r => {
      estimatePrice += typeof window.parseNumberID === 'function' ? (window.parseNumberID(r.estimateprice) || 0) : (Number(r.estimateprice) || 0);
      poActualPrice += typeof window.parseNumberID === 'function' ? (window.parseNumberID(r.poactualprice) || 0) : (Number(r.poactualprice) || 0);
    });

    let comparison = 0;
    let comparisonLabel = 'Saving';
    if (estimatePrice > 0 && poActualPrice > 0) {
      comparison = ((poActualPrice - estimatePrice) / estimatePrice) * 100;
      comparisonLabel = comparison <= 0 ? 'Saving' : 'Over Budget';
    }

    return {
      totalPR: uniquePR.length,
      totalPO: uniquePO.length,
      estimatePrice,
      poActualPrice,
      comparison,
      comparisonLabel
    };
  };

  window.loadDashboardData = async function loadDashboardDataLive(){
    const apiUrl = String(window.APP_CONFIG?.GAS_URL || '').trim();
    if (!apiUrl) throw new Error('GAS_URL belum diisi pada config.js.');

    try {
      const token = readAuthToken();
      const payload = { action: 'READ_SHEET', sheet: 'Admin' };
      if (token) payload.authToken = token;

      const response = await fetch(apiUrl, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      const raw = await response.text();
      let json;
      try { json = JSON.parse(raw); }
      catch (_) { throw new Error('Respons Google Apps Script bukan JSON yang valid.'); }

      if (!response.ok || json?.success === false) {
        throw new Error(json?.message || `Google Apps Script HTTP ${response.status}`);
      }
      if (!Array.isArray(json.rows)) {
        throw new Error(json?.message || 'Data Admin dari Google Sheet tidak valid.');
      }

      window.dashboard.rows = window.mapDashboardRows(json.rows);
      if (typeof window.generateYearButtons === 'function') window.generateYearButtons();
      if (typeof window.generateBuyerFilter === 'function') window.generateBuyerFilter();
      if (typeof window.filterDashboard === 'function') window.filterDashboard();

      const sync = document.getElementById('lastSync');
      if (sync) sync.textContent = new Date().toLocaleString('id-ID') + ' · Google Sheet';
    } catch (error) {
      console.warn('Dashboard live Google Sheet error:', error);
      if (typeof window.loadDashboardCache === 'function' && window.loadDashboardCache()) return;
      const sync = document.getElementById('lastSync');
      if (sync) sync.textContent = 'Google Sheet tidak terhubung';
    }
  };

  // script.js may already have completed its first load before this patch is parsed.
  // Refresh once immediately using the live Google Sheet transport.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => window.loadDashboardData(), 0), { once: true });
  } else {
    setTimeout(() => window.loadDashboardData(), 0);
  }
})();
