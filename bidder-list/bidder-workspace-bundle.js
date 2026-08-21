/*
 * CONSOLIDATION TEST BUNDLE — SHADOW BRANCH ONLY
 * Original source order preserved.
 * - bidder-list/local-document-view-bridge.js
 * - bidder-list/internal-email-release-pr-v3516.js
 * - bidder-list/rfq-excel-import-v3523.js
 */

/* ===== BEGIN ORIGINAL: bidder-list/local-document-view-bridge.js ===== */
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

/* ===== END ORIGINAL: bidder-list/local-document-view-bridge.js ===== */

/* ===== BEGIN ORIGINAL: bidder-list/internal-email-release-pr-v3516.js ===== */
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

/* ===== END ORIGINAL: bidder-list/internal-email-release-pr-v3516.js ===== */

/* ===== BEGIN ORIGINAL: bidder-list/rfq-excel-import-v3523.js ===== */
/* ======================================================
   RFQ EXCEL IMPORT v3.5.24

   Scope only:
   - Upload RFQ Excel is visible only in RFQ view.
   - The file picker starts from the ACTIVE No PR folder only.
   - User chooses the subfolder/location manually; no document folder is selected automatically.
   - Reads only Sheet RFQ from XLS/XLSX/XLSM/XLSB.
   - Main RFQ input comes from columns B:D through row 25; blank rows are skipped.
   - Internal reference import is limited to:
       I = Est. Budget PR USD
       J = Est. Budget PR IDR / Convert IDR fallback
       K = Item Number
   - If I has a value, IDR is recalculated with the USD/IDR rate currently
     used by Procurement Workspace and Qty. If I is blank, J is used as-is.
====================================================== */
(function installRfqExcelImportV3524(){
  'use strict';
  if (window.__MSW_RFQ_EXCEL_IMPORT_V3524__) return;
  window.__MSW_RFQ_EXCEL_IMPORT_V3524__ = true;
  window.__MSW_RFQ_EXCEL_IMPORT_V3523__ = true;

  const MAX_ROW = 25;
  const DEFAULT_DATA_START_ROW = 6;
  const IMPORT_BUTTON_ID = 'rfqExcelImportBtn';
  const XLSX_SRC = new URL('../assets/xlsx.full.min.js?v=20260819-rfq-import-v3524', window.location.href).href;

  // Same storage used by the existing local PR folder feature.
  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const DB_STORE = 'handles';
  const ROOT_HANDLE_KEY = 'prRoot';

  let xlsxLoadPromise = null;
  let patchScheduled = false;

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function isBlank(value){
    return value == null || (typeof value === 'string' && value.trim() === '');
  }

  function parseNumber(value){
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    try {
      if (typeof parseCurrencyNumber === 'function') return Number(parseCurrencyNumber(value) || 0);
    } catch (_) {}

    let source = text(value)
      .replace(/rp/gi, '')
      .replace(/idr/gi, '')
      .replace(/usd/gi, '')
      .replace(/[^\d.,-]/g, '');
    if (!source) return 0;

    const lastComma = source.lastIndexOf(',');
    const lastDot = source.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      source = lastComma > lastDot
        ? source.replace(/\./g, '').replace(',', '.')
        : source.replace(/,/g, '');
    } else if (lastComma > -1) {
      const parts = source.split(',');
      source = parts.length > 1 && parts[parts.length - 1].length === 3
        ? source.replace(/,/g, '')
        : source.replace(',', '.');
    } else if (lastDot > -1) {
      const parts = source.split('.');
      if (parts.length > 1 && parts[parts.length - 1].length === 3) source = source.replace(/\./g, '');
    }

    const result = Number(source);
    return Number.isFinite(result) ? result : 0;
  }

  function formatIdr(value){
    const number = Number(value || 0);
    return number > 0 ? Math.round(number).toLocaleString('id-ID') : '';
  }

  function formatUsd(value){
    const number = Number(value || 0);
    if (!(number > 0)) return '';
    return number.toLocaleString('id-ID', { maximumFractionDigits: 6 });
  }

  function setStatus(message){
    const el = document.getElementById('saveStatus');
    if (el) el.textContent = message;
  }

  function isRfqView(){
    try {
      if (typeof currentView !== 'undefined') return String(currentView).toUpperCase() === 'RFQ';
    } catch (_) {}
    return text(document.getElementById('viewTitle')?.textContent).toUpperCase() === 'RFQ';
  }

  function getActiveNoPr(){
    try {
      if (typeof getBidderMeta === 'function') {
        const meta = getBidderMeta() || {};
        const value = text(meta.nopr || meta.noPR || meta['No PR']);
        if (value) return value;
      }
    } catch (_) {}

    try {
      const params = new URLSearchParams(window.location.search);
      return text(params.get('noPR') || params.get('nopr'));
    } catch (_) {
      return '';
    }
  }

  function getBasePr(value){
    return text(value)
      .replace(/\s*\(\s*Line[^)]*\)\s*$/i, '')
      .replace(/\s+R\s*\d+\s*$/i, '')
      .trim();
  }

  function isPrefixMatch(folderName, base){
    const folder = text(folderName).toUpperCase();
    const key = text(base).toUpperCase();
    if (!folder || !key || !folder.startsWith(key)) return false;
    if (folder === key) return true;
    return /[\s\-_(]/.test(folder.charAt(key.length));
  }

  function openDb(){
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Local PR database tidak dapat dibuka.'));
    });
  }

  async function loadPrRootHandle(){
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const request = tx.objectStore(DB_STORE).get(ROOT_HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Folder PR tersimpan tidak dapat dibaca.'));
      });
    } finally {
      db.close();
    }
  }

  async function ensureReadPermission(handle){
    if (!handle) return false;
    const options = { mode: 'read' };
    try {
      if ((await handle.queryPermission(options)) === 'granted') return true;
      return (await handle.requestPermission(options)) === 'granted';
    } catch (_) {
      return false;
    }
  }

  async function findActivePrDirectory(root, noPr){
    const base = getBasePr(noPr);
    if (!base) throw new Error('No PR aktif belum tersedia.');

    try {
      const exact = await root.getDirectoryHandle(base, { create: false });
      return exact;
    } catch (_) {
      // Continue with existing prefix behavior, e.g. "PR001 - Description".
    }

    const matches = [];
    for await (const [name, handle] of root.entries()) {
      if (handle.kind !== 'directory') continue;
      if (isPrefixMatch(name, base)) matches.push({ name, handle });
    }
    matches.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
    if (matches.length) return matches[0].handle;

    throw new Error(`Folder No PR ${base} tidak ditemukan di dalam folder PR yang terhubung.`);
  }

  async function pickExcelFromActivePr(){
    const noPr = getActiveNoPr();
    const basePr = getBasePr(noPr);
    if (!basePr) throw new Error('No PR aktif belum tersedia. Buka PR terlebih dahulu.');

    if (typeof window.showOpenFilePicker !== 'function') {
      throw new Error('Browser ini belum mendukung pembukaan file langsung dari folder No PR. Gunakan Microsoft Edge atau Google Chrome terbaru.');
    }

    setStatus(`Membuka folder ${basePr}...`);
    const root = await loadPrRootHandle();
    if (!root) throw new Error('Folder PR belum terhubung. Connect Folder PR terlebih dahulu.');
    if (!(await ensureReadPermission(root))) throw new Error('Izin akses folder PR belum diberikan.');

    const prDirectory = await findActivePrDirectory(root, basePr);
    const handles = await window.showOpenFilePicker({
      startIn: prDirectory,
      multiple: false,
      excludeAcceptAllOption: false,
      types: [{
        description: 'RFQ Excel',
        accept: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
          'application/vnd.ms-excel.sheet.binary.macroEnabled.12': ['.xlsb'],
          'application/vnd.ms-excel': ['.xls']
        }
      }]
    });

    const handle = Array.isArray(handles) ? handles[0] : null;
    if (!handle) return null;
    return handle.getFile();
  }

  function readRateFromParent(){
    let current = window;
    for (let depth = 0; depth < 4; depth += 1) {
      try {
        const parent = current.parent;
        if (!parent || parent === current) break;
        current = parent;
        const candidates = [
          current.document?.getElementById('usdRateDisplay')?.value,
          current.document?.getElementById('usdRateDisplay')?.textContent,
          current.document?.getElementById('kpiDollarRate')?.textContent
        ];
        for (const candidate of candidates) {
          const rate = parseNumber(candidate);
          if (rate > 1000) return rate;
        }
      } catch (_) {
        break;
      }
    }
    return 0;
  }

  function getProcurementUsdRate(){
    const parentRate = readRateFromParent();
    if (parentRate > 1000) return parentRate;

    try {
      if (typeof getCurrentUsdIdrRate === 'function') {
        const rate = Number(getCurrentUsdIdrRate() || 0);
        if (rate > 1000) return rate;
      }
    } catch (_) {}

    try {
      const meta = DATA?.structured?.BidderList?.meta || {};
      const rate = parseNumber(meta.usd_rate_locked || meta.usd_rate_live || meta.usd_rate_used);
      if (rate > 1000) return rate;
    } catch (_) {}

    return 0;
  }

  function cellValue(sheet, column, row){
    const cell = sheet?.[`${column}${row}`];
    if (!cell) return '';
    if (cell.v != null) return cell.v;
    if (cell.w != null) return cell.w;
    return '';
  }

  function detectStartRow(sheet){
    for (let row = 1; row <= MAX_ROW; row += 1) {
      const b = text(cellValue(sheet, 'B', row)).toUpperCase();
      const c = text(cellValue(sheet, 'C', row)).toUpperCase();
      const d = text(cellValue(sheet, 'D', row)).toUpperCase();
      if (b === 'DESCRIPTION' && (c === 'QTY' || c === 'QUANTITY') && /UNIT/.test(d)) {
        return Math.min(MAX_ROW, row + 1);
      }
    }
    return DEFAULT_DATA_START_ROW;
  }

  function blankReferenceFields(){
    return {
      'Previous Price': '',
      'Date': '',
      'No Company': '',
      'Company Name': '',
      'Commodity WHS': '',
      'Previous Company': '',
      'Reference Source': '',
      'Reference Checked At': ''
    };
  }

  function buildImportedItems(sheet, usdRate){
    const startRow = detectStartRow(sheet);
    const items = [];

    for (let sourceRow = startRow; sourceRow <= MAX_ROW; sourceRow += 1) {
      const description = cellValue(sheet, 'B', sourceRow);
      const qtyRaw = cellValue(sheet, 'C', sourceRow);
      const unit = cellValue(sheet, 'D', sourceRow);
      if ([description, qtyRaw, unit].every(isBlank)) continue;

      const usdRaw = cellValue(sheet, 'I', sourceRow);
      const idrRaw = cellValue(sheet, 'J', sourceRow);
      const itemNumber = cellValue(sheet, 'K', sourceRow);
      const usd = parseNumber(usdRaw);
      const qty = parseNumber(qtyRaw);

      const row = Object.assign({
        'No': String(items.length + 1),
        'Description': text(description),
        'Qty': isBlank(qtyRaw) ? '' : text(qtyRaw),
        'Ord Unit': text(unit),
        'Est. Budget PR USD': '',
        'Est. Budget PR IDR': '',
        '__EstBudgetIdrMode': 'auto',
        'Item Number': text(itemNumber)
      }, blankReferenceFields());

      if (usd > 0) {
        row['Est. Budget PR USD'] = String(usd);
        const qtyFactor = qty > 0 ? qty : 1;
        const calculatedIdr = Math.round(usd * usdRate * qtyFactor);
        row['Est. Budget PR IDR'] = calculatedIdr > 0 ? formatIdr(calculatedIdr) : '';
        row.__EstBudgetIdrMode = 'auto';
      } else {
        const fallbackIdr = parseNumber(idrRaw);
        row['Est. Budget PR IDR'] = fallbackIdr > 0 ? formatIdr(fallbackIdr) : '';
        row.__EstBudgetIdrMode = fallbackIdr > 0 ? 'manual' : 'auto';
      }

      items.push(row);
    }

    return items;
  }

  async function ensureXlsx(){
    if (window.XLSX?.read && window.XLSX?.utils) return window.XLSX;
    if (xlsxLoadPromise) return xlsxLoadPromise;

    xlsxLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-msw-rfq-xlsx-lib]');
      if (existing) {
        const timer = window.setInterval(() => {
          if (window.XLSX?.read && window.XLSX?.utils) {
            window.clearInterval(timer);
            resolve(window.XLSX);
          }
        }, 50);
        window.setTimeout(() => {
          window.clearInterval(timer);
          if (window.XLSX?.read && window.XLSX?.utils) resolve(window.XLSX);
          else reject(new Error('Library pembaca Excel belum tersedia.'));
        }, 10000);
        return;
      }

      const script = document.createElement('script');
      script.src = XLSX_SRC;
      script.defer = true;
      script.dataset.mswRfqXlsxLib = 'true';
      script.onload = () => window.XLSX?.read ? resolve(window.XLSX) : reject(new Error('Library Excel gagal diinisialisasi.'));
      script.onerror = () => reject(new Error('Library Excel tidak dapat dimuat.'));
      document.head.appendChild(script);
    });

    return xlsxLoadPromise;
  }

  function findRfqSheet(workbook){
    const name = (workbook?.SheetNames || []).find(sheetName => text(sheetName).toUpperCase() === 'RFQ');
    return name ? workbook.Sheets[name] : null;
  }

  async function importExcelFile(file){
    if (!file) return;
    const button = document.getElementById(IMPORT_BUTTON_ID);
    const originalLabel = button?.textContent || 'Upload RFQ Excel';

    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Reading Excel...';
      }
      setStatus(`Membaca ${file.name}...`);

      const XLSX = await ensureXlsx();
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: 'array', cellDates: true, cellFormula: true, cellNF: true, cellText: true
      });
      const sheet = findRfqSheet(workbook);
      if (!sheet) throw new Error('Sheet RFQ tidak ditemukan pada file Excel yang dipilih.');

      const usdRate = getProcurementUsdRate();
      if (!(usdRate > 1000)) {
        throw new Error('Dolar USD/IDR pada Procurement Workspace belum tersedia. Sync kurs terlebih dahulu lalu upload kembali.');
      }

      const items = buildImportedItems(sheet, usdRate);
      if (!items.length) throw new Error(`Tidak ada item RFQ terisi sampai baris ${MAX_ROW}.`);

      const noPr = getBasePr(getActiveNoPr());
      const confirmed = window.confirm(
        `No PR aktif: ${noPr}\n` +
        `Ditemukan ${items.length} item pada Sheet RFQ.\n\n` +
        `Data item RFQ Workspace saat ini akan diganti dengan hasil upload.\n` +
        `Kurs USD/IDR yang dipakai: ${Math.round(usdRate).toLocaleString('id-ID')}.\n\n` +
        `Lanjutkan import?`
      );
      if (!confirmed) {
        setStatus('Import RFQ dibatalkan.');
        return;
      }

      if (typeof DATA === 'undefined' || !DATA?.structured?.RFQ) {
        throw new Error('Workspace RFQ belum siap. Silakan buka tab RFQ lalu coba kembali.');
      }

      DATA.structured.RFQ.items = items;
      try { if (typeof ensureRFQReferenceFields === 'function') ensureRFQReferenceFields(); } catch (_) {}

      if (typeof markDirty === 'function') {
        markDirty(`${items.length} item RFQ diimport dari Excel untuk ${noPr}. Menunggu autosave...`);
      } else {
        setStatus(`${items.length} item RFQ berhasil diimport dari Excel.`);
      }
      try { if (typeof scheduleDocumentAutosave === 'function') scheduleDocumentAutosave(); } catch (_) {}
      if (typeof renderCurrent === 'function') renderCurrent();
      scheduleUsdDisplayPatch();
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus('Pemilihan file RFQ dibatalkan.');
        return;
      }
      console.error('RFQ Excel import gagal:', error);
      setStatus(`Import RFQ gagal: ${error?.message || error}`);
      window.alert(`Import RFQ gagal.\n\n${error?.message || error}`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  }

  async function chooseAndImport(){
    const button = document.getElementById(IMPORT_BUTTON_ID);
    const originalLabel = button?.textContent || 'Upload RFQ Excel';
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Opening PR...';
      }
      const file = await pickExcelFromActivePr();
      if (file) await importExcelFile(file);
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus('Pemilihan file RFQ dibatalkan.');
        return;
      }
      console.error('Buka folder PR gagal:', error);
      setStatus(`Upload RFQ gagal: ${error?.message || error}`);
      window.alert(`Upload RFQ gagal.\n\n${error?.message || error}`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  }

  function patchUsdDisplay(){
    patchScheduled = false;
    if (!isRfqView()) return;
    let rows = [];
    try { rows = DATA?.structured?.RFQ?.items || []; } catch (_) {}

    document.querySelectorAll('.rfq-reference-table [data-key="Est. Budget PR USD"]').forEach(cell => {
      const index = Number(cell.dataset.row);
      if (!Number.isInteger(index) || !rows[index]) return;
      const raw = rows[index]['Est. Budget PR USD'];
      if (isBlank(raw)) return;
      const formatted = formatUsd(parseNumber(raw));
      if (formatted && cell.textContent !== formatted) cell.textContent = formatted;
    });
  }

  function scheduleUsdDisplayPatch(){
    if (patchScheduled) return;
    patchScheduled = true;
    window.requestAnimationFrame(patchUsdDisplay);
  }

  function syncButtonVisibility(){
    const button = document.getElementById(IMPORT_BUTTON_ID);
    if (button) button.style.display = isRfqView() ? '' : 'none';
    if (isRfqView()) scheduleUsdDisplayPatch();
  }

  function installUi(){
    if (document.getElementById(IMPORT_BUTTON_ID)) return true;
    const toolbar = document.querySelector('.panel-header .toolbar');
    if (!toolbar) return false;

    const button = document.createElement('button');
    button.id = IMPORT_BUTTON_ID;
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = '⬆ Upload RFQ Excel';
    button.title = 'Buka folder No PR aktif, pilih lokasi secara manual, lalu pilih file RFQ Excel';
    button.style.marginRight = '8px';
    button.addEventListener('click', chooseAndImport);

    toolbar.insertBefore(button, toolbar.firstChild);

    document.querySelectorAll('.nav-btn[data-view]').forEach(nav => {
      nav.addEventListener('click', () => window.setTimeout(syncButtonVisibility, 0));
    });

    const viewTitle = document.getElementById('viewTitle');
    if (viewTitle) new MutationObserver(syncButtonVisibility).observe(viewTitle, { childList: true, subtree: true, characterData: true });

    const viewBody = document.getElementById('viewBody');
    if (viewBody) new MutationObserver(scheduleUsdDisplayPatch).observe(viewBody, { childList: true, subtree: true, characterData: true });

    syncButtonVisibility();
    return true;
  }

  function install(){
    if (installUi()) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (installUi() || tries > 200) window.clearInterval(timer);
    }, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

/* ===== END ORIGINAL: bidder-list/rfq-excel-import-v3523.js ===== */
