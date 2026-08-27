/**
 * Public runtime configuration.
 *
 * Production frontend intentionally contains only the Web App endpoint and
 * non-sensitive UI settings. Spreadsheet IDs and Apps Script project URLs
 * stay on the backend (Script Properties).
 */
window.APP_CONFIG = Object.freeze({
  ENVIRONMENT: "production",
  VERSION: "3.5.17",
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

(function loadBidderExtensionsEarly(){
  if(!/\/bidder-list\//i.test(window.location.pathname)||document.querySelector('script[data-msw-bidder-storage-bundle]'))return;
  if(document.readyState==='loading'){
    const storageUrl=new URL('./bidder-storage-bundle.js',window.location.href).href+'?v=20260821-shadow-test-v1';
    document.write('<script data-msw-bidder-storage-bundle="true" src="'+storageUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"><\/script>');
    if(window.AndroidFolder){
      const pickerUrl=new URL('./android-storage-picker-fix.js',window.location.href).href+'?v=20260815-android-picker-v1';
      document.write('<script data-msw-android-storage-picker="true" src="'+pickerUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"><\/script>');
    }
    const workspaceUrl=new URL('./bidder-workspace-bundle.js',window.location.href).href+'?v=20260821-shadow-test-v1';
    document.write('<script data-msw-bidder-workspace-bundle="true" data-msw-rfq-excel-import="true" src="'+workspaceUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"><\/script>');
  }
})();

(function loadProcurementFormStorageBundle(){
  if(!/\/procurement-admin\/Form\//i.test(window.location.pathname))return;
  window.addEventListener('DOMContentLoaded',function(){
    if(document.querySelector('script[data-msw-procurement-form-storage-bundle]'))return;
    const script=document.createElement('script');
    script.src=new URL('../../procurement-form-storage-bundle.js',window.location.href).href+'?v=20260821-shadow-test-v1';
    script.defer=true;
    script.dataset.mswProcurementFormStorageBundle='true';
    document.body.appendChild(script);
  },{once:true});
})();

(function loadProcurementActionBundle(){
  if(!/\/procurement-admin\/?(?:index\.html)?$/i.test(window.location.pathname))return;
  const install=function(){
    if(
      (window.__MSW_PROCUREMENT_ACTION_BRIDGE_V354_H1__ &&
       window.__MSW_BUYER_SCOPED_ALLCLEAR_V358__) ||
      document.querySelector('script[data-msw-procurement-action-bundle]')
    )return;
    const script=document.createElement('script');
    script.src=new URL('../procurement-action-bundle.js',window.location.href).href+'?v=20260821-shadow-test-v1';
    script.defer=true;
    script.dataset.mswProcurementActionBundle='true';
    document.body.appendChild(script);
  };
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();

(function loadProcurementReviewBundle(){
  if(document.body?.dataset?.mswPage!=='main-menu')return;
  const install=function(){
    if(
      (window.__MSW_PROCUREMENT_REVIEW_RULES_V359__ &&
       window.__MSW_PROCUREMENT_REVIEW_FAST_NOTE_V3514__ &&
       window.__MSW_PROCUREMENT_REVIEW_NOTE_V3513__ &&
       window.__MSW_PROCUREMENT_REVIEW_EXPORT_V3514__) ||
      document.querySelector('script[data-msw-procurement-review-bundle]')
    )return;
    const script=document.createElement('script');
    script.src=new URL('./procurement-review-bundle.js',window.location.href).href+'?v=20260821-shadow-test-v1';
    script.defer=true;
    script.dataset.mswProcurementReviewBundle='true';
    document.body.appendChild(script);
  };
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
