const params = new URLSearchParams(window.location.search);
const noPR = params.get('pr') || params.get('noPR') || '';
const requestedTab = params.get('tab') || '';
const procurementFrame = document.getElementById('procurementFrame');
const bidderFrame = document.getElementById('bidderWorkspaceFrame');
const prLabel = document.getElementById('workspacePr');
const bidderTab = document.getElementById('workspaceBidderTab');

const BIDDER_VIEWS = ['BidderList', 'RFQ', 'CQS', 'Multiple_Email'];
prLabel.textContent = noPR || 'No PR belum tersedia';

function normalizeFlow(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function getProcurementRow() {
  try {
    return window.parent?.getProcurementByPR?.(noPR) || null;
  } catch (_) {
    return null;
  }
}

let procurementRow = getProcurementRow();
let flowProcess = params.get('flow') || procurementRow?.flowprocess || procurementRow?.['Flow Process'] || '';
let activeRound = String(params.get('round') || procurementRow?.roundpo || procurementRow?.['Round PR'] || procurementRow?.['Round PO'] || 'R0').toUpperCase();
let normalizedFlow = normalizeFlow(flowProcess);
let flowAllowsCQS = normalizedFlow === 'CREATECQS' || normalizedFlow === 'CQS';

let bidderView = BIDDER_VIEWS.includes(requestedTab)
  ? requestedTab
  : (flowAllowsCQS ? 'CQS' : 'BidderList');

procurementFrame.src = `../Form/index.html?mode=edit&pr=${encodeURIComponent(noPR)}`;
bidderFrame.src = `../../bidder-list/index.html?workspace=1&pr=${encodeURIComponent(noPR)}&round=${encodeURIComponent(activeRound)}&view=${encodeURIComponent(bidderView)}&flow=${encodeURIComponent(flowProcess)}`;

function setActiveButton(tab) {
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
}

function sendBidderView(view) {
  if (!BIDDER_VIEWS.includes(view)) return;
  bidderView = view;
  try {
    bidderFrame.contentWindow?.postMessage({
      action: 'SET_WORKSPACE_VIEW',
      view
    }, '*');
  } catch (_) {}
}

function notifyOuterSize(isProcurement) {
  window.parent.postMessage({ action: 'PROCUREMENT_WORKSPACE_RESIZE', mode: isProcurement ? 'normal' : 'large' }, '*');
}

function forwardProcurementContext() {
  bidderFrame.contentWindow?.postMessage({ action: 'PROCUREMENT_CONTEXT_UPDATED', noPR, round: activeRound, data: procurementRow || {} }, '*');
}

function openTab(tab) {
  const isProcurement = tab === 'Procurement';
  setActiveButton(isProcurement ? 'Procurement' : 'BidderList');
  procurementFrame.classList.toggle('is-hidden', !isProcurement);
  bidderFrame.classList.toggle('is-hidden', isProcurement);

  notifyOuterSize(isProcurement);
  if (!isProcurement) {
    procurementFrame.contentWindow?.postMessage({ action: 'REQUEST_PROCUREMENT_CONTEXT' }, '*');
    sendBidderView(bidderView);
    forwardProcurementContext();
  }
}

document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', () => openTab(button.dataset.tab));
});

bidderFrame.addEventListener('load', () => {
  sendBidderView(bidderView);
  forwardProcurementContext();
});

window.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.action === 'PROCUREMENT_CONTEXT_UPDATED') {
    procurementRow = event.data.data || procurementRow || {};
    activeRound = String(event.data.round || procurementRow.roundpo || procurementRow['Round PR'] || procurementRow['Round PO'] || 'R0').toUpperCase();
    flowProcess = procurementRow.flowprocess || procurementRow['Flow Process'] || flowProcess;
    normalizedFlow = normalizeFlow(flowProcess);
    flowAllowsCQS = normalizedFlow === 'CREATECQS' || normalizedFlow === 'CQS';
    forwardProcurementContext();
    return;
  }

  if (event.data.action === 'FOLDER_UPDATED') {
    // Diteruskan apa adanya ke parent (App utama) supaya Folder ID/Link
    // langsung disimpan ke Google Sheet, tidak menunggu tombol Update.
    window.parent.postMessage(event.data, '*');
    return;
  }

  if (event.data.action === 'CQS_STATUS') {
    if (bidderTab) {
      const selected = Number(event.data.selectedCount || 0);
      bidderTab.title = event.data.ready
        ? 'BidderList, RFQ, CQS, dan Multiple Email — CQS siap'
        : `BidderList, RFQ, CQS, dan Multiple Email — CQS DUMMY (${selected}/3 vendor)`;
    }
    return;
  }

  if (event.data.action === 'BIDDERLIST_PROCUREMENT_UPDATED') {
    procurementRow = { ...(procurementRow || {}), ...(event.data.data || {}) };
    activeRound = String(event.data.round || procurementRow.roundpo || procurementRow['Round PR'] || procurementRow['Round PO'] || activeRound || 'R0').toUpperCase();
    forwardProcurementContext();
    window.parent.postMessage(event.data, '*');
    return;
  }

  if (!['PROCUREMENT_SAVED', 'PROCUREMENT_CANCELLED'].includes(event.data.action)) return;
  window.parent.postMessage({
    ...event.data,
    keepWorkspaceOpen: event.data.action === 'PROCUREMENT_SAVED'
  }, '*');
});

// Tab RFQ dan CQS tidak lagi ditampilkan pada workspace luar.
// Keduanya tetap tersedia sebagai tab internal di dalam modul BidderList.
const initialOuterTab = requestedTab === 'Procurement' ? 'Procurement' : 'BidderList';
openTab(initialOuterTab);
