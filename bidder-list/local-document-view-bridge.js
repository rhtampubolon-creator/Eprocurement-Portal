(function(){
  'use strict';

  const ROUND_TYPES=new Set(['02. Bidderlist','03. CQS']);
  const TYPE_CONFIG={
    BIDDERLIST:{folder:'02. Bidderlist',label:'BidderList'},
    RFQ:{folder:'01. PR Approval',label:'RFQ'},
    CQS:{folder:'03. CQS',label:'CQS'}
  };

  const text=v=>v==null?'':String(v).trim();
  const id=()=>window.MSW_PR_IDENTITY;
  const basePR=v=>id()?.getBasePR(v)||text(v).replace(/\s*\(\s*Line[^)]*\)\s*$/i,'').replace(/(\d)\s*R\s*\d+\s*$/i,'$1').trim();
  const revRound=v=>id()?.getRevisionRound(v)||((text(v).match(/(\d)\s*R\s*(\d+)\s*(?:\([^)]*\))?\s*$/i)||[])[2]?`R${Number((text(v).match(/(\d)\s*R\s*(\d+)\s*(?:\([^)]*\))?\s*$/i)||[])[2])}`:'');

  function currentContext(){
    const meta=typeof getBidderMeta==='function'?getBidderMeta():{};
    const noPR=text(meta?.nopr||meta?.noPR||meta?.['No PR']||new URLSearchParams(location.search).get('noPR'));
    let round='';
    try{ if(typeof getDocumentRound==='function') round=text(getDocumentRound(meta)); }catch(_){}
    round=revRound(noPR)||id()?.normalizeRound(round,'R0')||(/^R\s*\d+$/i.test(round)?`R${Number(round.replace(/\D/g,''))}`:'R0');
    return {meta,noPR,base:basePR(noPR),round};
  }

  async function rootHandle(){
    const bridge=window.MSW_BIDDER_LOCAL_PR_BRIDGE;
    if(bridge?.getConnectedPrRoot) return bridge.getConnectedPrRoot(true);
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('MSW_PROCUREMENT_LOCAL_FS',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try{return await new Promise((resolve,reject)=>{const tx=db.transaction('handles','readonly');const r=tx.objectStore('handles').get('prRoot');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}finally{db.close();}
  }

  function matchFolder(name,base){
    if(id()?.isProjectFolderMatch) return id().isProjectFolderMatch(name,base);
    const n=text(name).toUpperCase(),b=text(base).toUpperCase();
    return n===b||(n.startsWith(b)&&/[\s\-_(]/.test(name.charAt(base.length)));
  }

  async function findProject(root,base){
    if(!root) throw new Error('Folder PR belum dipilih pada Storage Location.');
    if(!base) throw new Error('No PR belum tersedia.');
    try{const exact=await root.getDirectoryHandle(base,{create:false});return {handle:exact,name:exact.name||base};}catch(_){}
    const matches=[];
    for await(const [name,handle] of root.entries()) if(handle.kind==='directory'&&matchFolder(name,base)) matches.push({handle,name});
    matches.sort((a,b)=>a.name.length-b.name.length||a.name.localeCompare(b.name,'id'));
    if(!matches.length) throw new Error(`Folder PR ${base} tidak ditemukan.`);
    if(matches.length>1&&matches[0].name.length===matches[1].name.length) throw new Error(`Ditemukan lebih dari satu folder yang cocok untuk ${base}.`);
    return matches[0];
  }

  async function documentDirectory(type){
    const cfg=TYPE_CONFIG[type]; if(!cfg) throw new Error('Jenis dokumen tidak dikenali.');
    const ctx=currentContext();
    const root=await rootHandle();
    const project=await findProject(root,ctx.base);
    let dir=await project.handle.getDirectoryHandle(cfg.folder,{create:false});
    let path=`PR/${project.name}/${cfg.folder}`;
    if(type==='RFQ'){
      const rfqFolder=ctx.round==='R0'?'RFQ awal':`RFQ ${ctx.round}`;
      try{dir=await dir.getDirectoryHandle(rfqFolder,{create:false});path+=`/${rfqFolder}`;}catch(_){/* compatibility: allow files directly under 01. PR Approval */}
    }else if(ROUND_TYPES.has(cfg.folder)){
      dir=await dir.getDirectoryHandle(ctx.round,{create:false});path+=`/${ctx.round}`;
    }
    return {dir,path,ctx,project,cfg};
  }

  function scoreFile(name,type){
    const n=text(name).toLowerCase(); let s=0;
    if(type==='CQS'&&/cqs/.test(n)) s+=100;
    if(type==='RFQ'&&/rfq/.test(n)) s+=100;
    if(type==='BIDDERLIST'&&/bidder/.test(n)) s+=100;
    if(/\.xlsx?$|\.xlsm$/.test(n)) s+=30;
    if(/\.pdf$/.test(n)) s+=20;
    if(/\.docx?$/.test(n)) s+=10;
    return s;
  }

  async function listFiles(type){
    const target=await documentDirectory(type);
    const files=[];
    for await(const [name,handle] of target.dir.entries()){
      if(handle.kind!=='file') continue;
      const file=await handle.getFile();
      files.push({name,handle,file,score:scoreFile(name,type)});
    }
    files.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'id',{numeric:true}));
    return {target,files};
  }

  async function openLocal(type){
    const {target,files}=await listFiles(type);
    if(!files.length) throw new Error(`${target.cfg.label} belum ditemukan di ${target.path}.`);
    const chosen=files[0];
    const url=URL.createObjectURL(chosen.file);
    const opened=window.open(url,'_blank','noopener,noreferrer');
    if(!opened){const a=document.createElement('a');a.href=url;a.download=chosen.file.name;document.body.appendChild(a);a.click();a.remove();}
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    return {fileName:chosen.file.name,path:target.path};
  }

  async function localExists(type){try{return (await listFiles(type)).files.length>0;}catch(_){return false;}}

  function install(){
    if(typeof window.openStoredProcurementDocument!=='function'||typeof window.updateProcurementDocumentViewButtons!=='function') return false;
    if(window.__MSW_LOCAL_DOCUMENT_VIEW_INSTALLED__) return true;
    window.__MSW_LOCAL_DOCUMENT_VIEW_INSTALLED__=true;

    const originalOpen=window.openStoredProcurementDocument;
    const originalUpdate=window.updateProcurementDocumentViewButtons;

    window.openStoredProcurementDocument=async function(documentType){
      const type=text(documentType).toUpperCase();
      if(!TYPE_CONFIG[type]) return originalOpen(documentType);
      try{return await openLocal(type);}catch(error){
        console.warn(`Local ${type} view gagal, mencoba sumber lama:`,error);
        try{return await originalOpen(documentType);}catch(_){alert(error?.message||`${TYPE_CONFIG[type].label} tidak ditemukan.`);}
      }
    };

    window.updateProcurementDocumentViewButtons=function(){
      try{originalUpdate();}catch(_){}
      Object.keys(TYPE_CONFIG).forEach(async type=>{
        const btn=document.getElementById(`viewStored${type}Btn`); if(!btn) return;
        const exists=await localExists(type);
        if(exists){btn.disabled=false;btn.title=`Buka ${TYPE_CONFIG[type].label} dari folder PR lokal`;} 
      });
    };

    // Re-apply listeners because original button listener resolves global function at click time,
    // but this capture handler guarantees local-first behavior in every build.
    document.addEventListener('click',event=>{
      const btn=event.target.closest?.('.stored-document-view-btn'); if(!btn) return;
      const type=text(btn.dataset.documentType).toUpperCase(); if(!TYPE_CONFIG[type]) return;
      event.preventDefault(); event.stopImmediatePropagation();
      openLocal(type).catch(error=>alert(error?.message||`${TYPE_CONFIG[type].label} tidak ditemukan.`));
    },true);

    // Correct attachment listing for PR001R1 / PR001 R1 too.
    if(typeof window.loadMultipleEmailFolderFiles==='function'){
      const oldLoad=window.loadMultipleEmailFolderFiles;
      window.loadMultipleEmailFolderFiles=async function(folderType){
        const source=text(folderType||'01. PR Approval');
        if(!['01. PR Approval','02. Bidderlist','03. CQS','04. PO','05. Contract'].includes(source)) return oldLoad(folderType);
        const map={ '01. PR Approval':'RFQ','02. Bidderlist':'BIDDERLIST','03. CQS':'CQS' };
        if(!map[source]) return oldLoad(folderType);
        try{
          const {target,files}=await listFiles(map[source]);
          const rows=files.map(({file})=>({
            fileId:['localpr',encodeURIComponent(target.project.name),encodeURIComponent(source),encodeURIComponent(ROUND_TYPES.has(source)?target.ctx.round:''),encodeURIComponent(file.name)].join('|'),
            fileName:file.name,fileUrl:'',downloadUrl:'',previewUrl:'',mimeType:file.type||'application/octet-stream',size:Number(file.size||0),folderType:source,folderName:target.project.name,source:'LOCAL_PR'
          }));
          window.MULTIPLE_EMAIL_FOLDER_FILES=rows;
          try{if(typeof renderMultipleEmailAttachmentFileList==='function') renderMultipleEmailAttachmentFileList();}catch(_){}
          return {success:true,source:'LOCAL_PR',folderType:source,files:rows};
        }catch(_){return oldLoad(folderType);}
      };
    }

    setTimeout(()=>window.updateProcurementDocumentViewButtons(),0);
    return true;
  }

  if(!install()){
    let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer);},100);
  }
})();
