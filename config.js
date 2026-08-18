/**
 * Public runtime configuration.
 *
 * Production frontend intentionally contains only the Web App endpoint and
 * non-sensitive UI settings. Spreadsheet IDs and Apps Script project URLs
 * stay on the backend (Script Properties).
 */
window.APP_CONFIG = Object.freeze({
  ENVIRONMENT: "production",
  VERSION: "3.5.14",
  GAS_URL: "https://script.google.com/macros/s/AKfycbwlpvbUm6CEPzSDzMFIfsrh_RnBUFNmWr7XLDhth_n1P2CM_XyifNKlFKxqrsmangwcSg/exec",
  EMAILS: Object.freeze({ releasePoCc: [], releasePrTo: "", releasePrCc: "", poProcTo: "", appointmentTo: "", procurementInbox: "", procurementCc: "" })
});

(function loadGlobalTableFilterScrollEarly(){
  if(window.__MSW_GLOBAL_TABLE_FILTER_SCROLL_V3511__||document.querySelector('script[data-msw-global-table-filter-scroll]'))return;
  const configSrc=document.currentScript?.src||new URL('config.js',window.location.href).href;
  const url=new URL('./global-table-filter-scroll-v3511.js',configSrc).href+'?v=20260818-global-filter-v3511';
  if(document.readyState==='loading')document.write('<script data-msw-global-table-filter-scroll="true" src="'+url.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></'+'script>');
  else{const s=document.createElement('script');s.src=url;s.dataset.mswGlobalTableFilterScroll='true';document.head.appendChild(s);}
})();

(function loadBuyerViewSyncOptimizerEarly(){
  if(!/\/(?:vendor-company|detail-contract)\//i.test(window.location.pathname)||document.querySelector('script[data-msw-buyer-view-sync]'))return;
  const configSrc=document.currentScript?.src||new URL('config.js',window.location.href).href;
  const url=new URL('./buyer-view-sync-optimizer-v3512.js',configSrc).href+'?v=20260818-buyer-sync-v3512';
  if(document.readyState==='loading')document.write('<script data-msw-buyer-view-sync="true" src="'+url.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></'+'script>');
  else{const s=document.createElement('script');s.src=url;s.dataset.mswBuyerViewSync='true';document.head.appendChild(s);}
})();

(function loadUnrestrictedLocalUploadEarly(){
  const path=window.location.pathname;
  const isProcurementParent=/\/procurement-admin\/?(?:index\.html)?$/i.test(path);
  const isProcurementForm=/\/procurement-admin\/Form\//i.test(path);
  if((!isProcurementParent&&!isProcurementForm)||document.querySelector('script[data-msw-unrestricted-local-upload]'))return;
  const configSrc=document.currentScript?.src||new URL('config.js',window.location.href).href;
  const url=new URL('./unrestricted-local-upload-v3512.js',configSrc).href+'?v=20260818-any-file-v3512';
  if(document.readyState==='loading')document.write('<script data-msw-unrestricted-local-upload="true" src="'+url.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></'+'script>');
  else{const s=document.createElement('script');s.src=url;s.dataset.mswUnrestrictedLocalUpload='true';document.head.appendChild(s);}
})();

(function loadPrIdentityEarly(){
  if(document.querySelector('script[data-msw-pr-identity]'))return;
  const configSrc=document.currentScript?.src||new URL('config.js',window.location.href).href;
  const url=new URL('./procurement-pr-identity.js',configSrc).href+'?v=20260815-pr-identity-v1';
  if(document.readyState==='loading')document.write('<script data-msw-pr-identity="true" src="'+url.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></'+'script>');
  else{const s=document.createElement('script');s.src=url;s.dataset.mswPrIdentity='true';document.head.appendChild(s);}
})();

(function loadAndroidFolderAdapterEarly(){
  if(!window.AndroidFolder||document.querySelector('script[data-msw-android-folder-fs]'))return;
  const configSrc=document.currentScript?.src||new URL('config.js',window.location.href).href;
  const url=new URL('./android-folder-fs.js',configSrc).href+'?v=20260815-android-folder-v2';
  if(document.readyState==='loading')document.write('<script data-msw-android-folder-fs="true" src="'+url.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></'+'script>');
  else{const s=document.createElement('script');s.src=url;s.dataset.mswAndroidFolderFs='true';document.head.appendChild(s);}
})();

(function loadBidderLocalPrBridgeEarly(){
  if(!/\/bidder-list\//i.test(window.location.pathname)||document.querySelector('script[data-msw-bidder-local-pr-bridge]'))return;
  if(document.readyState==='loading'){
    const bridgeUrl=new URL('./local-pr-bridge.js',window.location.href).href+'?v=20260815-storage-v4';
    document.write('<script data-msw-bidder-local-pr-bridge="true" src="'+bridgeUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></'+'script>');
    const sidebarUrl=new URL('./storage-sidebar.js',window.location.href).href+'?v=20260815-storage-sidebar-v3';
    document.write('<script data-msw-storage-sidebar="true" src="'+sidebarUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></'+'script>');
    if(window.AndroidFolder){
      const pickerUrl=new URL('./android-storage-picker-fix.js',window.location.href).href+'?v=20260815-android-picker-v1';
      document.write('<script data-msw-android-storage-picker="true" src="'+pickerUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></'+'script>');
    }
    const viewUrl=new URL('./local-document-view-bridge.js',window.location.href).href+'?v=20260815-local-view-v2';
    document.write('<script data-msw-local-document-view="true" src="'+viewUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></'+'script>');
  }
})();

(function loadProcurementFolderRules(){
  if(!/\/procurement-admin\/Form\//i.test(window.location.pathname))return;
  window.addEventListener('DOMContentLoaded',function(){
    if(document.querySelector('script[data-msw-pr-folder-rules]'))return;
    const rules=document.createElement('script');
    rules.src=new URL('../../procurement-folder-rules.js',window.location.href).href+'?v=20260815-pr-folder-v3';
    rules.defer=true;rules.dataset.mswPrFolderRules='true';
    rules.addEventListener('load',function(){
      const patch=document.createElement('script');
      patch.src=new URL('../../procurement-pr-rules-patch.js',window.location.href).href+'?v=20260815-pr-rules-patch-v1';
      patch.defer=true;patch.dataset.mswPrRulesPatch='true';
      patch.addEventListener('load',function(){
        const localFiles=document.createElement('script');
        localFiles.src=new URL('../../procurement-local-files.js',window.location.href).href+'?v=20260818-any-file-v3512';
        localFiles.defer=true;localFiles.dataset.mswPrLocalFiles='true';
        localFiles.addEventListener('load',function(){
          const existingPr=document.createElement('script');
          existingPr.src=new URL('../../procurement-existing-pr-folder.js',window.location.href).href+'?v=20260815-existing-pr-v3';
          existingPr.defer=true;existingPr.dataset.mswExistingPrFolder='true';document.body.appendChild(existingPr);
        },{once:true});
        document.body.appendChild(localFiles);
      },{once:true});
      document.body.appendChild(patch);
    },{once:true});
    document.body.appendChild(rules);
  },{once:true});
})();

(function loadProcurementActionBridge(){
  if(!/\/procurement-admin\/?(?:index\.html)?$/i.test(window.location.pathname))return;
  const install=function(){
    if(window.__MSW_PROCUREMENT_ACTION_BRIDGE_V354_H1__||document.querySelector('script[data-msw-procurement-action-bridge]'))return;
    const script=document.createElement('script');
    script.src=new URL('../procurement-action-bridge-v354-hotfix1.js',window.location.href).href+'?v=20260818-allclear-cache-h1';
    script.defer=true;
    script.dataset.mswProcurementActionBridge='true';
    script.addEventListener('load',function(){
      if(window.__MSW_BUYER_SCOPED_ALLCLEAR_V358__||document.querySelector('script[data-msw-buyer-allclear]'))return;
      const buyerClear=document.createElement('script');
      buyerClear.src=new URL('../procurement-buyer-allclear-v358.js',window.location.href).href+'?v=20260818-buyer-allclear-v358';
      buyerClear.defer=true;
      buyerClear.dataset.mswBuyerAllclear='true';
      document.body.appendChild(buyerClear);
    },{once:true});
    document.body.appendChild(script);
  };
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();

(function loadProcurementReviewRules(){
  if(document.body?.dataset?.mswPage!=='main-menu')return;
  const install=function(){
    if(window.__MSW_PROCUREMENT_REVIEW_RULES_V359__||document.querySelector('script[data-msw-procurement-review-rules]'))return;
    const script=document.createElement('script');
    script.src=new URL('./procurement-review-rules-v359.js',window.location.href).href+'?v=20260818-review-v359';
    script.defer=true;
    script.dataset.mswProcurementReviewRules='true';
    document.body.appendChild(script);
  };
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();

(function loadProcurementReviewFastNoteBridge(){
  if(document.body?.dataset?.mswPage!=='main-menu')return;
  const install=function(){
    if(window.__MSW_PROCUREMENT_REVIEW_FAST_NOTE_V3514__||document.querySelector('script[data-msw-procurement-review-fast-note]'))return;
    const script=document.createElement('script');
    script.src=new URL('./procurement-review-note-fast-v3514.js',window.location.href).href+'?v=20260818-review-note-fast-v3514';
    script.defer=true;
    script.dataset.mswProcurementReviewFastNote='true';
    document.body.appendChild(script);
  };
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();

(function loadProcurementReviewNoteEditor(){
  if(document.body?.dataset?.mswPage!=='main-menu')return;
  const install=function(){
    if(window.__MSW_PROCUREMENT_REVIEW_NOTE_V3513__||document.querySelector('script[data-msw-procurement-review-note]'))return;
    const script=document.createElement('script');
    script.src=new URL('./procurement-review-note-v3513.js',window.location.href).href+'?v=20260818-review-note-v3514';
    script.defer=true;
    script.dataset.mswProcurementReviewNote='true';
    document.body.appendChild(script);
  };
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();

(function loadProcurementReviewExport(){
  if(document.body?.dataset?.mswPage!=='main-menu')return;
  const install=function(){
    if(window.__MSW_PROCUREMENT_REVIEW_EXPORT_V3514__||document.querySelector('script[data-msw-procurement-review-export]'))return;
    const script=document.createElement('script');
    script.src=new URL('./procurement-review-export-v3514.js',window.location.href).href+'?v=20260818-review-export-v3514';
    script.defer=true;
    script.dataset.mswProcurementReviewExport='true';
    document.body.appendChild(script);
  };
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();