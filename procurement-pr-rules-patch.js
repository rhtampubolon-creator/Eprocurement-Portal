(function(){
  'use strict';
  function patchRules(){
    const identity=window.MSW_PR_IDENTITY;
    const current=window.MSW_PROCUREMENT_FOLDER_RULES;
    if(!identity||!current)return false;
    window.MSW_PROCUREMENT_FOLDER_RULES=Object.freeze({
      ...current,
      getBasePR:identity.getBasePR,
      getRevisionRound:identity.getRevisionRound,
      normalizeRound:identity.normalizeRound
    });
    return true;
  }
  function syncRoundFromNoPr(){
    const identity=window.MSW_PR_IDENTITY;if(!identity)return;
    const noPr=document.getElementById('noPR');if(!noPr)return;
    const revision=identity.getRevisionRound(noPr.value);if(!revision)return;
    const roundPo=document.getElementById('roundpo');if(roundPo&&roundPo.value!==revision){roundPo.value=revision;roundPo.dispatchEvent(new Event('change',{bubbles:true}));}
    const documentRound=document.getElementById('documentRound');if(documentRound&&documentRound.value!==revision)documentRound.value=revision;
  }
  function init(){
    let tries=0;const timer=setInterval(()=>{tries++;if(patchRules()||tries>50)clearInterval(timer);},50);
    syncRoundFromNoPr();
    document.addEventListener('change',e=>{if(e.target?.id==='noPR')syncRoundFromNoPr();},true);
    document.addEventListener('input',e=>{if(e.target?.id==='noPR')syncRoundFromNoPr();},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();