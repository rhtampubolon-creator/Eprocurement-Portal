(function () {
  'use strict';

  const ROUND_FOLDER_TYPES = new Set(['02. Bidderlist', '03. CQS']);
  const FOLDER_TYPES = ['01. PR Approval','02. Bidderlist','03. CQS','04. PO','05. Contract'];
  const DB_NAME='MSW_PROCUREMENT_LOCAL_FS', DB_STORE='handles', ROOT_HANDLE_KEY='prRoot';
  const text=v=>v==null?'':String(v).trim();

  function getBasePR(value){
    if(window.MSW_PR_IDENTITY?.getBasePR) return window.MSW_PR_IDENTITY.getBasePR(value);
    return text(value).replace(/\s*\(\s*Line[^)]*\)\s*$/i,'').replace(/(\d)\s*R\s*\d+\s*$/i,'$1').trim();
  }
  function getRevisionRound(value){
    if(window.MSW_PR_IDENTITY?.getRevisionRound) return window.MSW_PR_IDENTITY.getRevisionRound(value);
    const m=text(value).replace(/\s*\(\s*Line[^)]*\)\s*$/i,'').match(/(\d)\s*R\s*(\d+)\s*$/i);
    return m?`R${Number(m[2])}`:'';
  }
  function normalizeRound(value){
    if(window.MSW_PR_IDENTITY?.normalizeRound) return window.MSW_PR_IDENTITY.normalizeRound(value,'R0');
    const m=text(value).match(/^R\s*(\d+)$/i); return m?`R${Number(m[1])}`:'R0';
  }
  function currentRound(){return getRevisionRound(document.getElementById('noPR')?.value)||normalizeRound(document.getElementById('roundpo')?.value||'R0');}
  function getActiveRounds(){const max=Math.max(0,Number(currentRound().slice(1))||0);return Array.from({length:max+1},(_,i)=>`R${i}`);}

  function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function saveHandle(handle){const db=await openDb();try{await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(handle,ROOT_HANDLE_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
  async function loadHandle(){const db=await openDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly');const r=tx.objectStore(DB_STORE).get(ROOT_HANDLE_KEY);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}finally{db.close();}}
  async function ensurePermission(handle,requestPermission){if(!handle)return false;const o={mode:'readwrite'};if((await handle.queryPermission(o))==='granted')return true;return Boolean(requestPermission&&(await handle.requestPermission(o))==='granted');}
  async function choosePrRoot(){if(!window.showDirectoryPicker)throw new Error('Browser ini belum mendukung pemilihan folder lokal.');const h=await window.showDirectoryPicker({mode:'readwrite'});if(text(h.name).toUpperCase()!=='PR')throw new Error(`Folder yang dipilih harus bernama PR. Folder terpilih: ${h.name}`);await saveHandle(h);return h;}

  function isMatch(name,base){if(window.MSW_PR_IDENTITY?.isProjectFolderMatch)return window.MSW_PR_IDENTITY.isProjectFolderMatch(name,base);const n=text(name).toUpperCase(),b=text(base).toUpperCase();return n===b||(n.startsWith(b)&&/[\s\-_(]/.test(name.charAt(base.length)));}
  async function findExisting(root,base){try{const exact=await root.getDirectoryHandle(base,{create:false});return exact;}catch(_){}const matches=[];for await(const [name,h] of root.entries())if(h.kind==='directory'&&isMatch(name,base))matches.push({name,h});matches.sort((a,b)=>a.name.length-b.name.length||a.name.localeCompare(b.name));if(!matches.length)throw new Error(`Folder PR ${base} tidak ditemukan. Portal tidak membuat folder root PR baru.`);return matches[0].h;}
  async function ensureLocalStructure(rootHandle,noPR){if(!(await ensurePermission(rootHandle,true)))throw new Error('Izin akses folder PR belum diberikan.');const base=getBasePR(noPR);if(!base)throw new Error('No PR belum tersedia.');const prFolder=await findExisting(rootHandle,base);const rounds=getActiveRounds();for(const type of FOLDER_TYPES){const typeFolder=await prFolder.getDirectoryHandle(type,{create:true});if(ROUND_FOLDER_TYPES.has(type))for(const round of rounds)await typeFolder.getDirectoryHandle(round,{create:true});}return {basePR:base,rounds,folderName:prFolder.name};}

  function setStatus(message,tone){const el=document.getElementById('localPrFolderStatus');if(!el)return;el.textContent=message;el.className=`text-sm ${tone==='error'?'text-red-700':tone==='ok'?'text-emerald-700':'text-slate-600'}`;}
  function buildPanel(){if(document.getElementById('localPrFolderPanel'))return;const fm=document.getElementById('folderManagerSection');if(!fm)return;const panel=document.createElement('section');panel.id='localPrFolderPanel';panel.className='mt-8 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4';panel.innerHTML=`<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h3 class="font-semibold text-emerald-900">OneDrive Local Root: PR</h3><p id="localPrFolderStatus" class="text-sm text-slate-600">Belum terhubung ke folder PR.</p><p class="mt-1 text-xs text-slate-500">Pilih hanya folder PR. Folder project harus sudah ada.</p></div><div class="flex flex-wrap gap-2"><button type="button" id="connectPrRootBtn" class="folder-action-button bg-emerald-600 hover:bg-emerald-700 text-white">Connect Folder PR</button><button type="button" id="createLocalPrStructureBtn" class="folder-action-button bg-indigo-600 hover:bg-indigo-700 text-white">Create / Refresh Structure</button></div></div>`;fm.parentNode.insertBefore(panel,fm);}
  async function refreshRootStatus(){try{const h=await loadHandle();if(!h)return setStatus('Belum terhubung ke folder PR.','neutral');const granted=await ensurePermission(h,false);setStatus(granted?`Terhubung: ${h.name}`:`Folder ${h.name} tersimpan. Klik Connect untuk memberi izin lagi.`,granted?'ok':'neutral');}catch(e){setStatus(`Status folder gagal dibaca: ${e.message}`,'error');}}
  function installActions(){document.getElementById('connectPrRootBtn')?.addEventListener('click',async()=>{try{const h=await choosePrRoot();setStatus(`Terhubung: ${h.name}`,'ok');}catch(e){if(e?.name!=='AbortError')setStatus(e.message||'Gagal memilih folder PR.','error');}});document.getElementById('createLocalPrStructureBtn')?.addEventListener('click',async()=>{try{let h=await loadHandle();if(!h||!(await ensurePermission(h,true)))h=await choosePrRoot();const r=await ensureLocalStructure(h,document.getElementById('noPR')?.value||'');setStatus(`Siap: PR/${r.folderName} • ${r.rounds.join(', ')}`,'ok');}catch(e){if(e?.name!=='AbortError')setStatus(e.message||'Gagal membuat struktur folder.','error');}});}
  function installRoundUi(){const t=document.getElementById('documentFolderType'),r=document.getElementById('documentRound'),w=document.getElementById('documentRoundWrapper'),p=document.getElementById('folderTargetPath');if(!t||!r||!w)return;const update=()=>{const is=ROUND_FOLDER_TYPES.has(t.value);w.classList.toggle('hidden',!is);if(is)r.value=currentRound();if(p)p.textContent=is?`${t.value}/${r.value}`:t.value;};t.addEventListener('change',update);r.addEventListener('change',update);document.getElementById('roundpo')?.addEventListener('change',update);document.getElementById('noPR')?.addEventListener('change',update);update();if(typeof window.selectedFolderTarget==='function')window.selectedFolderTarget=()=>({type:t.value||FOLDER_TYPES[0],round:ROUND_FOLDER_TYPES.has(t.value)?r.value:''});}
  function installBaseAdapter(){if(typeof window.postFolderAction!=='function')return;const original=window.postFolderAction;window.postFolderAction=async payload=>{const next=payload&&typeof payload==='object'?{...payload}:payload;if(next?.noPR){next.displayNoPR=next.noPR;next.noPR=getBasePR(next.noPR);}if(next&&['createFolder','getFolderStructure'].includes(next.action)){next.roundFolderTypes=Array.from(ROUND_FOLDER_TYPES);next.folderTypes=FOLDER_TYPES.slice();}return original(next);};}
  function init(){if(!/\/procurement-admin\/Form\//i.test(location.pathname))return;buildPanel();installActions();installRoundUi();installBaseAdapter();refreshRootStatus();window.MSW_PROCUREMENT_FOLDER_RULES=Object.freeze({getBasePR,getRevisionRound,currentRound,folderTypes:FOLDER_TYPES.slice(),roundFolderTypes:Array.from(ROUND_FOLDER_TYPES)});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();