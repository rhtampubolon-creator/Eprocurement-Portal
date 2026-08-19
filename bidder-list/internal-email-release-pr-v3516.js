/* ======================================================
   MULTIPLE EMAIL INTERNAL — RELEASE PR ENHANCEMENT v3.5.16

   Scope only:
   1) "Pilih Bidderlist" first keeps the existing local/OneDrive flow, then
      falls back to backend LIST_PROCUREMENT_FILES when local storage is not
      connected, permission is inactive, or the active local folder is empty.
   2) Release PR Outlook draft uses an HTML table matching the Procurement
      email format requested by the user.

   Other internal/vendor email types, Procurement data, folder structure,
   permissions, and document generation are not changed.
====================================================== */
(function installReleasePrInternalEmailV3516(){
  'use strict';
  if (window.__MSW_RELEASE_PR_INTERNAL_EMAIL_V3516__) return;
  window.__MSW_RELEASE_PR_INTERNAL_EMAIL_V3516__ = true;

  const BIDDER_FOLDER = '02. Bidderlist';

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function html(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }

  function linesHtml(value, fallback){
    const raw = Array.isArray(value) ? value : String(value == null ? '' : value).split(/\r?\n/);
    const values = raw.map(text).filter(Boolean);
    return values.length ? values.map(html).join('<br>') : html(fallback || '-');
  }

  function authToken(){
    try {
      if (typeof window.MSW_GET_AUTH_TOKEN === 'function') return text(window.MSW_GET_AUTH_TOKEN());
      if (typeof getStoredAuthToken === 'function') return text(getStoredAuthToken());
    } catch (_) {}
    try { return text(sessionStorage.getItem('MSW_AUTH_TOKEN') || localStorage.getItem('MSW_AUTH_TOKEN')); }
    catch (_) { return ''; }
  }

  async function loadBidderlistFromBackend(){
    if (typeof getBidderMeta !== 'function') throw new Error('Data Procurement aktif belum tersedia.');
    const meta = getBidderMeta() || {};
    if (!text(meta.nopr)) throw new Error('No PR belum tersedia.');

    const endpoint = text(window.APP_CONFIG?.GAS_URL || (typeof GAS_URL !== 'undefined' ? GAS_URL : ''));
    if (!endpoint) throw new Error('Endpoint Google Apps Script belum tersedia.');

    const payload = {
      action: 'LIST_PROCUREMENT_FILES',
      authToken: authToken(),
      noPR: meta.nopr,
      description: meta.description || '',
      folderId: meta.folderid || '',
      folderType: BIDDER_FOLDER,
      round: typeof getDocumentRound === 'function' ? getDocumentRound(meta) : (meta.round || 'R0')
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!result?.success) throw new Error(result?.message || 'Daftar file Bidderlist tidak dapat dimuat.');

    const files = Array.isArray(result.files) ? result.files : [];
    try {
      MULTIPLE_EMAIL_FOLDER_FILES = files;
      if (typeof renderMultipleEmailAttachmentFileList === 'function') renderMultipleEmailAttachmentFileList();
    } catch (_) {}

    return Object.assign({}, result, {source: result.source || 'BACKEND_DRIVE', files});
  }

  function installAttachmentFallback(){
    if (typeof window.loadMultipleEmailFolderFiles !== 'function') return false;
    if (window.loadMultipleEmailFolderFiles.__MSW_BIDDER_FALLBACK_V3516__) return true;

    const previous = window.loadMultipleEmailFolderFiles;
    const wrapped = async function(folderType){
      const sourceType = text(folderType || '01. PR Approval');
      if (sourceType !== BIDDER_FOLDER) return previous.apply(this, arguments);

      let localResult = null;
      let localError = null;
      try {
        localResult = await previous.apply(this, arguments);
        const localFiles = Array.isArray(localResult?.files) ? localResult.files : [];
        if (localFiles.length) return localResult;
      } catch (error) {
        localError = error;
      }

      try {
        return await loadBidderlistFromBackend();
      } catch (backendError) {
        if (localError) {
          throw new Error(
            'Folder Bidderlist belum dapat dibaca dari penyimpanan lokal maupun server. ' +
            'Lokal: ' + (localError?.message || localError) + ' | Server: ' + (backendError?.message || backendError)
          );
        }
        throw backendError;
      }
    };
    wrapped.__MSW_BIDDER_FALLBACK_V3516__ = true;
    window.loadMultipleEmailFolderFiles = wrapped;
    return true;
  }

  function formatEstPrice(value){
    const number = Number(value || 0);
    if (Number.isFinite(number) && number !== 0) return Math.round(number).toLocaleString('id-ID');
    return text(value) || '-';
  }

  function buildReleasePrHtml(data){
    data = data || {};
    const invited = Array.isArray(data.invitedVendors) ? data.invitedVendors : data.invitedVendors || [];
    const buyer = text(data.buyerName) || 'Procurement Team';
    const user = text(data.user) || '-';

    const th = "border:1px solid #9ca3af;background:#1f6f08;color:#ffffff;padding:8px 9px;text-align:center;font-weight:700;vertical-align:middle;";
    const td = "border:1px solid #9ca3af;padding:9px 10px;text-align:center;vertical-align:middle;line-height:1.45;";

    return '<html><body>' +
      '<div style="font-family:\'Palatino Linotype\',\'Book Antiqua\',Palatino,serif;font-size:11pt;color:#000000;line-height:1.45;">' +
      '<p style="margin:0 0 14px 0;">Kepada Yth<br><b>Bapak Agustinus,</b></p>' +
      '<p style="margin:0 0 14px 0;">Mohon approval Bidderlist terlampir dan untuk detail sesuai informasi dibawah ini.</p>' +
      '<p style="margin:0 0 14px 0;color:#1d4ed8;">USER = ' + html(user) + '</p>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:880px;table-layout:fixed;font-size:10pt;">' +
        '<thead><tr>' +
          '<th style="' + th + '">Invited Vendors</th>' +
          '<th style="' + th + '">Previous<br>PO Winner</th>' +
          '<th style="' + th + '">Previous<br>Submit Quotation</th>' +
          '<th style="' + th + '">Est. Price<br>(Rp)</th>' +
          '<th style="' + th + '">Closing date</th>' +
        '</tr></thead>' +
        '<tbody><tr>' +
          '<td style="' + td + '">' + linesHtml(invited, '-') + '</td>' +
          '<td style="' + td + '">' + linesHtml(data.previousWinner, 'None') + '</td>' +
          '<td style="' + td + '">' + linesHtml(data.previousQuotation, 'None') + '</td>' +
          '<td style="' + td + '">' + html(formatEstPrice(data.estPrice)) + '</td>' +
          '<td style="' + td + '">' + html(text(data.closingDate) || '-') + '</td>' +
        '</tr></tbody>' +
      '</table>' +
      '<p style="margin:18px 0 0 0;">Salam,<br>' + html(buyer) + '<br>Procurement - PT. Makmur Sejahtera Wisesa</p>' +
      '</div></body></html>';
  }

  function installReleasePrHtml(){
    if (typeof window.getInternalEmailBodyHtml !== 'function') return false;
    if (window.getInternalEmailBodyHtml.__MSW_RELEASE_PR_HTML_V3516__) return true;

    const previous = window.getInternalEmailBodyHtml;
    const wrapped = function(type, draft){
      if (text(type).toUpperCase() !== 'RELEASE_PR') return previous.apply(this, arguments);

      let resolvedDraft = draft;
      try {
        if (!resolvedDraft && typeof getMultipleEmailInternalDraft === 'function') resolvedDraft = getMultipleEmailInternalDraft(type);
      } catch (_) {}

      // Bila user sengaja mengubah Body Email, pertahankan wording custom existing.
      if (text(resolvedDraft?.['Body Override'])) return previous.apply(this, arguments);

      try {
        if (typeof getInternalEmailProcurementData !== 'function') return previous.apply(this, arguments);
        return buildReleasePrHtml(getInternalEmailProcurementData());
      } catch (_) {
        return previous.apply(this, arguments);
      }
    };
    wrapped.__MSW_RELEASE_PR_HTML_V3516__ = true;
    window.getInternalEmailBodyHtml = wrapped;
    return true;
  }

  function install(){
    return installAttachmentFallback() && installReleasePrHtml();
  }

  if (!install()) {
    let tries = 0;
    const timer = window.setInterval(function(){
      tries += 1;
      if (install() || tries > 200) window.clearInterval(timer);
    }, 50);
  }
})();

/* Load the isolated RFQ Excel upload/import adapter on BidderList workspace. */
(function loadRfqExcelImportV3523(){
  if (window.__MSW_RFQ_EXCEL_IMPORT_V3523__ || document.querySelector('script[data-msw-rfq-excel-import]')) return;
  const script = document.createElement('script');
  script.src = new URL('./rfq-excel-import-v3523.js?v=20260819-rfq-import-v3523', window.location.href).href;
  script.defer = true;
  script.dataset.mswRfqExcelImport = 'true';
  document.body.appendChild(script);
})();
