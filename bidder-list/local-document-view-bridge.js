(function(){
  'use strict';
  const ROUND_TYPES=new Set(['02. Bidderlist','03. CQS']);
  const TYPE_CONFIG={BIDDERLIST:{folder:'02. Bidderlist',label:'BidderList'},RFQ:{folder:'01. PR Approval',label:'RFQ'},CQS:{folder:'03. CQS',label:'CQS'}};
  const text=v=>v==null?'':String(v).trim();
  const identity=()=>window.MSW_PR_IDENTITY;
  function currentContext(){
    const meta=typeof getBidderMeta==='function'?getBidderMeta():{};
    const noPR=text(meta?.nopr||meta?.noPR||meta?.['No PR']||new URLSearchParams(location.search).get('noPR'));
    let round='';try{if(typeof getDocumentRound==='function')round=text(getDocumentRound(meta));}catch(_){}
    const base=identity()?.getBasePR(noPR)||noPR;
    round=identity()?.getRevisionRound(noPR)||identity()?.normalizeRound(round,'R0')||'R0';
    return {meta,noPR,base,round};
  }
  async function rootHandle(){const b=window.MSW_BIDDER_LOCAL_PR_BRIDGE;if(b?.getConnectedPrRoot)return b.getConnectedPrRoot(true);throw new Error('Folder PR belum dipilih pada Storage Location.');}
  function matchFolder(name,base){return identity()?.isProjectFolderMatch(name,base)||false;}
  async function findProject(root,base){try{const h=await root.getDirectoryHandle(base,{create:false});return{handle:h,name:h.name||base};}catch(_){}const matches=[];for await(const [name,h] of root.entries())if(h.kind==='directory'&&matchFolder(name,base))matches.push({handle:h,name});matches.sort((a,b)=>a.name.length-b.name.length||a.name.localeCompare(b.name,'id'));if(!matches.length)throw new Error(`Folder PR ${base} tidak ditemukan.`);return matches[0];}
  async function documentDirectory(type){const cfg=TYPE_CONFIG[type];const ctx=currentContext();const root=await rootHandle();const project=await findProject(root,ctx.base);let dir=await project.handle.getDirectoryHandle(cfg.folder,{create:false});let path=`PR/${project.name}/${cfg.folder}`;if(type==='RFQ'){const rfqFolder=ctx.round==='R0'?'RFQ awal':`RFQ ${ctx.round}`;try{dir=await dir.getDirectoryHandle(rfqFolder,{create:false});path+=`/${rfqFolder}`;}catch(_){}}else if(ROUND_TYPES.has(cfg.folder)){dir=await dir.getDirectoryHandle(ctx.round,{create:false});path+=`/${ctx.round}`;}return{dir,path,ctx,project,cfg};}
  function scoreFile(name,type){const n=text(name).toLowerCase();let s=0;if(type==='CQS'&&/cqs/.test(n))s+=100;if(type==='RFQ'&&/rfq/.test(n))s+=100;if(type==='BIDDERLIST'&&/bidder/.test(n))s+=100;if(/\.xlsx?$|\.xlsm$/.test(n))s+=30;if(/\.pdf$/.test(n))s+=20;return s;}
  async function listFiles(type){const target=await documentDirectory(type),files=[];for await(const [name,h] of target.dir.entries()){if(h.kind!=='file')continue;const file=await h.getFile();files.push({name,file,score:scoreFile(name,type)});}files.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'id',{numeric:true}));return{target,files};}
  async function openLocal(type){const {target,files}=await listFiles(type);if(!files.length)throw new Error(`${target.cfg.label} belum ditemukan di ${target.path}.`);const chosen=files[0],url=URL.createObjectURL(chosen.file);const opened=window.open(url,'_blank','noopener,noreferrer');if(!opened){const a=document.createElement('a');a.href=url;a.download=chosen.file.name;document.body.appendChild(a);a.click();a.remove();}setTimeout(()=>URL.revokeObjectURL(url),60000);return{fileName:chosen.file.name,path:target.path};}
  async function exists(type){try{return(await listFiles(type)).files.length>0;}catch(_){return false;}}
  function install(){if(typeof window.openStoredProcurementDocument!=='function'||typeof window.updateProcurementDocumentViewButtons!=='function')return false;if(window.__MSW_LOCAL_DOCUMENT_VIEW_INSTALLED__)return true;window.__MSW_LOCAL_DOCUMENT_VIEW_INSTALLED__=true;const oldUpdate=window.updateProcurementDocumentViewButtons;window.updateProcurementDocumentViewButtons=function(){try{oldUpdate();}catch(_){}Object.keys(TYPE_CONFIG).forEach(async type=>{const btn=document.getElementById(`viewStored${type}Btn`);if(btn&&await exists(type)){btn.disabled=false;btn.title=`Buka ${TYPE_CONFIG[type].label} dari folder PR lokal`;}});};document.addEventListener('click',event=>{const btn=event.target.closest?.('.stored-document-view-btn');if(!btn)return;const type=text(btn.dataset.documentType).toUpperCase();if(!TYPE_CONFIG[type])return;event.preventDefault();event.stopImmediatePropagation();openLocal(type).catch(error=>alert(error?.message||`${TYPE_CONFIG[type].label} tidak ditemukan.`));},true);setTimeout(()=>window.updateProcurementDocumentViewButtons(),0);window.MSW_LOCAL_DOCUMENT_VIEW=Object.freeze({openLocal,listFiles,currentContext,findProject});return true;}
  if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer);},100);}
})();