(function(){
  'use strict';
  function init(){
    if(!/\/procurement-admin\/Form\//i.test(location.pathname))return;
    const local=window.MSW_PROCUREMENT_LOCAL_FILES;
    if(!local){setTimeout(init,100);return;}
    window.MSW_EXISTING_PR_FOLDER=Object.freeze({
      resolvePrFolder:local.resolvePrFolder,
      ensureStructure:local.ensureStructure,
      resolveTarget:local.resolveTarget,
      showContents:local.showContents
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();