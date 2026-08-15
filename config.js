/**
 * Public runtime configuration.
 *
 * Production frontend intentionally contains only the Web App endpoint and
 * non-sensitive UI settings. Spreadsheet IDs and Apps Script project URLs
 * stay on the backend (Script Properties).
 */
window.APP_CONFIG = Object.freeze({
  ENVIRONMENT: "production",
  VERSION: "3.5.2",
  GAS_URL: "https://script.google.com/macros/s/AKfycbwlpvbUm6CEPzSDzMFIfsrh_RnBUFNmWr7XLDhth_n1P2CM_XyifNKlFKxqrsmangwcSg/exec",
  EMAILS: Object.freeze({ releasePoCc: [], releasePrTo: "", releasePrCc: "", poProcTo: "", appointmentTo: "", procurementInbox: "", procurementCc: "" })
});

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
        localFiles.src=new URL('../../procurement-local-files.js',window.location.href).href+'?v=20260815-pr-local-v3';
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
