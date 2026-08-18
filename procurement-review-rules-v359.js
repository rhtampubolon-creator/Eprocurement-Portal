/* ======================================================
   PROCUREMENT REVIEW DISPLAY RULES — Release 3.5.9
   Presentation-only adapter for the root Procurement Review table.

   Rules:
   - Finish Date appears only when Flow Process is exactly RFQ.
   - Finish Date comes from the last/current Round PR Finish Date.
   - Requirement Date appears only when Flow Process contains "Completed"
     anywhere in the text and uses Actual PO Del. Date.
   - Adds Status Rebid derived only from the last/current Round PR.
   - Does not modify Procurement Admin source data or backend behavior.
====================================================== */
(function installProcurementReviewRulesV359(){
  'use strict';
  if (window.__MSW_PROCUREMENT_REVIEW_RULES_V359__) return;
  window.__MSW_PROCUREMENT_REVIEW_RULES_V359__ = true;

  const ROUND_LIST = ['R0','R1','R2','R3','R4','R5'];
  const REVIEW_COLUMN_COUNT = 10;

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function valueOf(row, aliases){
    try {
      if (typeof window.smartGetField === 'function') {
        const value = window.smartGetField(row, aliases);
        if (value !== undefined && value !== null && text(value) !== '') return value;
      }
    } catch (_) {}
    if (!row || typeof row !== 'object') return '';
    for (const key of aliases) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        const value = row[key];
        if (value !== undefined && value !== null && text(value) !== '') return value;
      }
    }
    return '';
  }

  function flowOf(row){
    return text(valueOf(row, ['flowprocess', 'Flow Process']));
  }

  function normalizedFlow(row){
    return flowOf(row).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function normalizeRound(value){
    const match = text(value).toUpperCase().match(/R\s*([0-5])/);
    return match ? `R${match[1]}` : '';
  }

  function roundField(row, round, suffix){
    const lower = round.toLowerCase();
    const label = suffix === 'company' ? 'Company'
      : suffix === 'submitcompany' ? 'Submit Company'
      : suffix === 'finishdate' ? 'Finish Date'
      : suffix === 'startdate' ? 'Start Date'
      : suffix;
    return valueOf(row, [
      `${lower}${suffix}`,
      `${round} ${label}`,
      `${round}${label.replace(/\s+/g, '')}`
    ]);
  }

  function lastRoundInfo(row){
    const declared = normalizeRound(valueOf(row, ['roundpo', 'roundpr', 'Round PR', 'Round PO']));
    if (declared) return { round: declared, found: true };

    const statusRound = normalizeRound(valueOf(row, ['statusrebid', 'Status Rebid']));
    if (statusRound) return { round: statusRound, found: true };

    let latest = '';
    ROUND_LIST.forEach(round => {
      const hasRoundData = ['company','submitcompany','startdate','finishdate']
        .some(suffix => text(roundField(row, round, suffix)) !== '');
      if (hasRoundData) latest = round;
    });
    return { round: latest || 'R0', found: Boolean(latest) };
  }

  function parseDate(value){
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = text(value);
    if (!raw) return null;

    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
      const date = new Date((numeric - 25569) * 86400000);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    try {
      if (typeof window.overviewParseDate === 'function') {
        const parsed = window.overviewParseDate(raw);
        if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed;
      }
    } catch (_) {}

    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function formatDate(value){
    const date = parseDate(value);
    if (!date) return text(value);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function splitVendors(value){
    const seen = new Set();
    return text(value)
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

  function reviewFinishDate(row){
    // Exact RFQ only. "Completed RFQ", "RFQ Completed", CQS, Create BL, etc. stay blank.
    if (normalizedFlow(row) !== 'rfq') return '';
    const info = lastRoundInfo(row);
    if (!info.found) return '';
    return formatDate(roundField(row, info.round, 'finishdate'));
  }

  function reviewRequirementDate(row){
    // Completed may be at the beginning, middle, or end of Flow Process.
    if (!/completed/i.test(flowOf(row))) return '';
    return formatDate(valueOf(row, [
      'actualpodeldate',
      'Actual PO Del. Date',
      'Actual PO Delivery Date'
    ]));
  }

  function reviewStatusRebid(row){
    const info = lastRoundInfo(row);
    if (!info.found) return '';
    const invited = splitVendors(roundField(row, info.round, 'company'));
    const submitted = splitVendors(roundField(row, info.round, 'submitcompany'));
    const finish = formatDate(roundField(row, info.round, 'finishdate'));
    return [
      info.round,
      `${submitted.length} of ${invited.length}`,
      finish
    ].filter(Boolean).join(' / ');
  }

  function reviewValues(row){
    const coreText = (aliases) => text(valueOf(row, aliases));
    const procurementName = typeof window.overviewProcurementName === 'function'
      ? window.overviewProcurementName(row)
      : coreText(['Description']);
    const status = typeof window.overviewStatus === 'function'
      ? window.overviewStatus(row)
      : coreText(['statuspr', 'Status PR', 'Status']);

    return [
      coreText(['noPR', 'No PR', 'PR Number']),
      procurementName,
      coreText(['ownerName', 'Owner Name', 'Buyer (Ditambahkan)', 'buyer', 'Buyer', 'Buyer Name', 'Signature Buyer', 'ownerEmail', 'Owner Email']),
      coreText(['pic', 'PIC']),
      status,
      flowOf(row),
      reviewFinishDate(row),
      reviewRequirementDate(row),
      reviewStatusRebid(row),
      coreText(['notebuyer', 'Note Buyer', 'Buyer Note', 'Note'])
    ];
  }

  function ensureFilterSlots(){
    try {
      if (Array.isArray(PROCUREMENT_REVIEW_FILTERS)) {
        while (PROCUREMENT_REVIEW_FILTERS.length < REVIEW_COLUMN_COUNT) PROCUREMENT_REVIEW_FILTERS.push('');
      }
    } catch (_) {}
  }

  function installReviewValueOverride(){
    if (typeof window.overviewReviewValues !== 'function') return false;
    window.overviewReviewValues = reviewValues;
    return true;
  }

  function ensureHeader(){
    const headerRow = document.querySelector('#procurementReviewPanel .procurement-overview-table thead tr');
    if (!headerRow) return false;

    const headers = Array.from(headerRow.querySelectorAll('th'));
    const noteHeader = headers.find(th => /^\s*Note\s*$/i.test(th.querySelector('span')?.textContent || th.textContent || ''));
    if (!noteHeader) return false;

    const noteFilter = noteHeader.querySelector('[data-procurement-filter-button]');
    if (noteFilter) {
      noteFilter.dataset.procurementFilterButton = '9';
      noteFilter.setAttribute('aria-label', 'Filter Note');
      noteFilter.title = 'Filter Note';
    }

    if (!headerRow.querySelector('[data-msw-review-status-rebid]')) {
      const th = document.createElement('th');
      th.dataset.mswReviewStatusRebid = 'true';
      th.innerHTML = '<span>Status Rebid</span><button type="button" class="procurement-header-filter" data-procurement-filter-button="8" aria-label="Filter Status Rebid" title="Filter Status Rebid"><i data-lucide="filter"></i></button>';
      headerRow.insertBefore(th, noteHeader);
      try { window.lucide?.createIcons?.(); } catch (_) {}
    }
    return true;
  }

  function fixStateColspan(){
    document.querySelectorAll('#procurementOverviewRows td.procurement-overview-state').forEach(cell => {
      cell.colSpan = REVIEW_COLUMN_COUNT;
    });
  }

  function refreshReview(){
    ensureFilterSlots();
    ensureHeader();
    fixStateColspan();
    try {
      if (typeof window.renderProcurementReviewPage === 'function') window.renderProcurementReviewPage();
    } catch (error) {
      console.warn('Procurement Review v3.5.9 rerender skipped:', error);
    }
    fixStateColspan();
  }

  function install(){
    if (!installReviewValueOverride()) return false;
    ensureFilterSlots();
    ensureHeader();

    const body = document.getElementById('procurementOverviewRows');
    if (body && !body.__MSW_REVIEW_V359_OBSERVER__) {
      body.__MSW_REVIEW_V359_OBSERVER__ = true;
      new MutationObserver(fixStateColspan).observe(body, { childList: true, subtree: true });
    }

    // Core resets the filter array to 9 slots when Procurement Year changes.
    // Restore the new Status Rebid slot after that existing handler completes.
    document.addEventListener('click', event => {
      if (!event.target.closest?.('[data-procurement-overview-year]')) return;
      queueMicrotask(() => {
        ensureFilterSlots();
        ensureHeader();
      });
    }, true);

    refreshReview();
    window.MSW_PROCUREMENT_REVIEW_RULES_V359 = Object.freeze({
      reviewFinishDate,
      reviewRequirementDate,
      reviewStatusRebid,
      lastRoundInfo
    });
    return true;
  }

  if (!install()) {
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (install() || tries > 120) window.clearInterval(timer);
    }, 50);
  }
})();
