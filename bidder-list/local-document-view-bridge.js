(function(){
  'use strict';

  const ROUND_TYPES=new Set(['02. Bidderlist & Quotation','03. CQS']);
  const TYPE_CONFIG={
    BIDDERLIST:{folder:'02. Bidderlist & Quotation',label:'BidderList'},
    RFQ:{folder:'02. Bidderlist & Quotation',label:'RFQ'},
    CQS:{folder:'03. CQS',label:'CQS'}
  };
  const text=v=>v==null?'':String(v).trim();
  const identity=()=>window.MSW_PR_IDENTITY;
  let activeObjectUrl='';

  function currentContext(){
    const meta=typeof getBidderMeta==='function'?getBidderMeta():{};
    const noPR=text(meta?.nopr||meta?.noPR||meta?.['No PR']||new URLSearchParams(location.search).get('noPR'));
    let round='';
    try{if(typeof getDocumentRound==='function')round=text(getDocumentRound(meta));}catch(_){}
    const base=identity()?.getBasePR(noPR)||noPR;
    round=identity()?.getRevisionRound(noPR)||identity()?.normalizeRound(round,'R0')||'R0';
    return {meta,noPR,base,round};
  }

  async function rootHandle(){
    const bridge=window.MSW_BIDDER_LOCAL_PR_BRIDGE;
    if(bridge?.getConnectedPrRoot)return bridge.getConnectedPrRoot(true);
    throw new Error('Folder PR belum dipilih pada Storage Location.');
  }

  function matchFolder(name,base){return identity()?.isProjectFolderMatch(name,base)||false;}

  async function findProject(root,base){
    if(!base)throw new Error('No PR belum tersedia.');
    try{
      const handle=await root.getDirectoryHandle(base,{create:false});
      return {handle,name:handle.name||base};
    }catch(_){}
    const matches=[];
    for await(const [name,handle] of root.entries()){
      if(handle.kind==='directory'&&matchFolder(name,base))matches.push({handle,name});
    }
    matches.sort((a,b)=>a.name.length-b.name.length||a.name.localeCompare(b.name,'id'));
    if(!matches.length)throw new Error(`Folder PR ${base} tidak ditemukan di Storage Location.`);
    return matches[0];
  }

  async function documentDirectory(type){
    const cfg=TYPE_CONFIG[type];
    if(!cfg)throw new Error('Jenis dokumen tidak dikenali.');
    const ctx=currentContext();
    const root=await rootHandle();
    const project=await findProject(root,ctx.base);
    let dir=await project.handle.getDirectoryHandle(cfg.folder,{create:false});
    let path=`PR/${project.name}/${cfg.folder}`;

    if(type==='RFQ'){
      const rfqFolder=ctx.round==='R0'?'RFQ awal':`RFQ ${ctx.round}`;
      try{
        dir=await dir.getDirectoryHandle(rfqFolder,{create:false});
        path+=`/${rfqFolder}`;
      }catch(_){
        // Compatibility only: RFQ lama mungkin masih berada langsung di 01. PR Approval.
        // View tidak pernah membuat subfolder atau file.
      }
    }else if(ROUND_TYPES.has(cfg.folder)){
      dir=await dir.getDirectoryHandle(ctx.round,{create:false});
      path+=`/${ctx.round}`;
    }
    return {dir,path,ctx,project,cfg};
  }

  function scoreFile(name,type){
    const n=text(name).toLowerCase();
    let score=0;
    if(type==='CQS'&&/cqs/.test(n))score+=100;
    if(type==='RFQ'&&/rfq/.test(n))score+=100;
    if(type==='BIDDERLIST'&&/bidder/.test(n))score+=100;
    if(/\.xlsx?$|\.xlsm$/.test(n))score+=40;
    if(/\.pdf$/.test(n))score+=20;
    return score;
  }

  async function listFiles(type){
    const target=await documentDirectory(type);
    const files=[];
    for await(const [name,handle] of target.dir.entries()){
      if(handle.kind!=='file')continue;
      const file=await handle.getFile();
      files.push({name,file,score:scoreFile(name,type)});
    }
    files.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'id',{numeric:true}));
    return {target,files};
  }

  function ensureViewer(){
    let dialog=document.getElementById('mswReadonlyLocalViewer');
    if(dialog)return dialog;

    const style=document.createElement('style');
    style.id='mswReadonlyLocalViewerStyle';
    style.textContent=`
      #mswReadonlyLocalViewer{width:min(96vw,1500px);height:min(92vh,950px);padding:0;border:0;border-radius:14px;box-shadow:0 24px 80px rgba(15,23,42,.35);overflow:hidden;background:#fff;color:#0f172a}
      #mswReadonlyLocalViewer::backdrop{background:rgba(15,23,42,.58)}
      .msw-ro-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border-bottom:1px solid #dbe3ec;background:#f8fafc}
      .msw-ro-title{font-weight:800;font-size:14px}.msw-ro-meta{font-size:11px;color:#64748b;margin-top:2px;overflow-wrap:anywhere}
      .msw-ro-close{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer}
      .msw-ro-note{padding:7px 16px;background:#ecfdf5;color:#047857;font-size:11px;border-bottom:1px solid #d1fae5}
      .msw-ro-body{height:calc(100% - 94px);overflow:auto;background:#fff}
      .msw-ro-tabs{position:sticky;top:0;z-index:2;display:flex;gap:4px;flex-wrap:wrap;padding:7px 10px;border-bottom:1px solid #e2e8f0;background:#f8fafc}
      .msw-ro-tab{border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:5px 9px;font-size:11px;cursor:pointer}
      .msw-ro-tab.active{background:#0f172a;color:#fff;border-color:#0f172a}
      .msw-ro-sheet{padding:10px;overflow:auto}
      .msw-ro-sheet table{border-collapse:collapse;min-width:max-content;font-size:11px;background:#fff}
      .msw-ro-sheet td,.msw-ro-sheet th{border:1px solid #d9e1e8;padding:4px 6px;white-space:pre-wrap;vertical-align:top;min-width:36px;max-width:420px}
      .msw-ro-message{padding:24px;color:#475569;font-size:13px;line-height:1.6}
      .msw-ro-image{display:block;max-width:100%;max-height:calc(92vh - 120px);margin:0 auto;padding:12px}
    `;
    document.head.appendChild(style);

    dialog=document.createElement('dialog');
    dialog.id='mswReadonlyLocalViewer';
    dialog.innerHTML=`
      <div class="msw-ro-head">
        <div><div id="mswRoTitle" class="msw-ro-title">View</div><div id="mswRoMeta" class="msw-ro-meta"></div></div>
        <button type="button" id="mswRoClose" class="msw-ro-close">Close</button>
      </div>
      <div class="msw-ro-note">Read-only preview • file asli di OneDrive tidak diubah, tidak disimpan ulang, dan tidak di-download.</div>
      <div id="mswRoBody" class="msw-ro-body"></div>`;
    document.body.appendChild(dialog);
    document.getElementById('mswRoClose')?.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{
      if(activeObjectUrl){URL.revokeObjectURL(activeObjectUrl);activeObjectUrl='';}
      const body=document.getElementById('mswRoBody');if(body)body.innerHTML='';
    });
    return dialog;
  }

  function showDialog(title,meta){
    const dialog=ensureViewer();
    document.getElementById('mswRoTitle').textContent=title;
    document.getElementById('mswRoMeta').textContent=meta;
    if(typeof dialog.showModal==='function'){
      if(!dialog.open)dialog.showModal();
    }else dialog.setAttribute('open','open');
    return document.getElementById('mswRoBody');
  }

  function loadSheetJs(){
    if(window.XLSX?.read)return Promise.resolve(window.XLSX);
    if(window.__MSW_SHEETJS_LOADING__)return window.__MSW_SHEETJS_LOADING__;
    window.__MSW_SHEETJS_LOADING__=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.onload=()=>window.XLSX?.read?resolve(window.XLSX):reject(new Error('Library preview Excel tidak tersedia.'));
      script.onerror=()=>reject(new Error('Preview Excel tidak dapat dimuat. Periksa koneksi internet.'));
      document.head.appendChild(script);
    });
    return window.__MSW_SHEETJS_LOADING__;
  }

  async function previewExcel(file,title,meta){
    const body=showDialog(title,meta);
    body.innerHTML='<div class="msw-ro-message">Membuka workbook read-only...</div>';
    const XLSX=await loadSheetJs();
    const buffer=await file.arrayBuffer();
    // Hanya membaca workbook. Tidak ada writeFile/write/createWritable sehingga formula existing tidak tersentuh.
    const workbook=XLSX.read(buffer,{type:'array',cellFormula:true,cellNF:true,cellStyles:true,bookVBA:true});
    if(!workbook.SheetNames?.length)throw new Error('Workbook tidak memiliki worksheet yang dapat ditampilkan.');

    body.innerHTML='<div class="msw-ro-tabs"></div><div class="msw-ro-sheet"></div>';
    const tabs=body.querySelector('.msw-ro-tabs');
    const sheetBox=body.querySelector('.msw-ro-sheet');

    const renderSheet=name=>{
      const sheet=workbook.Sheets[name];
      const html=XLSX.utils.sheet_to_html(sheet,{editable:false,header:'',footer:''});
      sheetBox.innerHTML=html||'<div class="msw-ro-message">Worksheet kosong.</div>';
      tabs.querySelectorAll('.msw-ro-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.sheet===name));
    };

    workbook.SheetNames.forEach((name,index)=>{
      const button=document.createElement('button');
      button.type='button';button.className='msw-ro-tab';button.dataset.sheet=name;button.textContent=name;
      button.addEventListener('click',()=>renderSheet(name));
      tabs.appendChild(button);
      if(index===0)renderSheet(name);
    });
  }

  async function previewImage(file,title,meta){
    const body=showDialog(title,meta);
    if(activeObjectUrl)URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl=URL.createObjectURL(file);
    body.innerHTML='';
    const img=document.createElement('img');img.className='msw-ro-image';img.alt=file.name;img.src=activeObjectUrl;body.appendChild(img);
  }

  async function previewFile(type,target,chosen){
    const file=chosen.file;
    const name=text(file.name||chosen.name);
    const lower=name.toLowerCase();
    const title=`View ${target.cfg.label}`;
    const meta=`${name} • ${target.path}`;

    if(/\.(xlsx?|xlsm)$/i.test(lower))return previewExcel(file,title,meta);
    if(/^image\//i.test(file.type)||/\.(png|jpe?g|gif|webp|bmp)$/i.test(lower))return previewImage(file,title,meta);

    const body=showDialog(title,meta);
    body.innerHTML=`<div class="msw-ro-message"><strong>${target.cfg.label} ditemukan.</strong><br>Format <code>${name.replace(/</g,'&lt;')}</code> tidak dapat dipreview langsung di portal. Demi menjaga file existing, View tidak akan men-download atau mengubah file tersebut.</div>`;
  }

  async function openLocal(type){
    const normalized=text(type).toUpperCase();
    const {target,files}=await listFiles(normalized);
    if(!files.length){
      throw new Error(`${target.cfg.label} belum ada di ${target.path}. Tidak ada file yang dibuat atau diubah oleh tombol View.`);
    }
    const chosen=files[0];
    await previewFile(normalized,target,chosen);
    return {fileName:chosen.file.name,path:target.path,readOnly:true};
  }

  async function exists(type){try{return(await listFiles(type)).files.length>0;}catch(_){return false;}}

  function install(){
    if(typeof window.openStoredProcurementDocument!=='function'||typeof window.updateProcurementDocumentViewButtons!=='function')return false;
    if(window.__MSW_LOCAL_DOCUMENT_VIEW_INSTALLED__)return true;
    window.__MSW_LOCAL_DOCUMENT_VIEW_INSTALLED__=true;
    const oldUpdate=window.updateProcurementDocumentViewButtons;

    window.updateProcurementDocumentViewButtons=function(){
      try{oldUpdate();}catch(_){}
      const ctx=currentContext();
      Object.keys(TYPE_CONFIG).forEach(async type=>{
        const btn=document.getElementById(`viewStored${type}Btn`);
        if(!btn)return;
        // Bila No PR tersedia, View tetap dapat diklik. Jika file tidak ada,
        // klik hanya menampilkan informasi tanpa membuat/download file.
        btn.disabled=!ctx.base;
        if(!ctx.base){btn.title='Pilih No PR terlebih dahulu.';return;}
        const found=await exists(type);
        btn.title=found
          ? `Preview read-only ${TYPE_CONFIG[type].label} existing dari OneDrive`
          : `${TYPE_CONFIG[type].label} belum ditemukan; klik untuk melihat informasi lokasi.`;
      });
    };

    document.addEventListener('click',event=>{
      const btn=event.target.closest?.('.stored-document-view-btn');
      if(!btn)return;
      const type=text(btn.dataset.documentType).toUpperCase();
      if(!TYPE_CONFIG[type])return;
      event.preventDefault();event.stopImmediatePropagation();
      openLocal(type).catch(error=>alert(error?.message||`${TYPE_CONFIG[type].label} tidak ditemukan.`));
    },true);

    setTimeout(()=>window.updateProcurementDocumentViewButtons(),0);
    window.MSW_LOCAL_DOCUMENT_VIEW=Object.freeze({openLocal,listFiles,currentContext,findProject,readOnly:true});
    return true;
  }

  if(!install()){
    let tries=0;
    const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer);},100);
  }
})();
