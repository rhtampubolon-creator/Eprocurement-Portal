"use strict";
const GAS_URL = String(window.APP_CONFIG?.GAS_URL || "").trim();
const SHEET_NAME = "Agreement Tracker";
const DATA_HEADERS = ["Work Order","Description","Vendor","Buyer","User","Assigned To","Start Date","Due Date","% Complete","Status","Remarks","To Do"];
const HEADERS = ["No", ...DATA_HEADERS];
const AGREEMENT_CACHE_KEY = "MSW_AGREEMENT_TRACKER_CACHE_V1";
let agreementData=[]; let filteredData=[]; let agreementRevision=0; let currentPage=1; const PAGE_SIZE=10; let editingIndex=-1; let editingOriginalRow=null; let contextIndex=-1; let users=[]; let vendors=[];
const byId=id=>document.getElementById(id);
function esc(v){return String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));}
function token(){return localStorage.getItem("MSW_AUTH_TOKEN")||sessionStorage.getItem("MSW_AUTH_TOKEN")||"";}
function toast(msg,type="success"){const c=byId("toastContainer");const d=document.createElement("div");d.className=`toast toast-${type} show`;d.textContent=msg;c.appendChild(d);setTimeout(()=>d.remove(),3200);}
function fmtDate(v){if(!v)return"";const d=new Date(v);if(Number.isNaN(d.getTime()))return v;return d.toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"});}
function statusBadge(v){const s=String(v??"").trim();if(!s)return "";const cls=s.toLowerCase().replace(/\s+/g,"-");return `<span class="agreement-status status-${esc(cls)}">${esc(s)}</span>`;}
function progress(v){const n=Math.max(0,Math.min(100,Number(v)||0));return `<div class="agreement-progress"><div class="agreement-progress-track"><div class="agreement-progress-bar" style="width:${n}%"></div></div><div class="agreement-progress-label">${n}%</div></div>`;}
function normalizeRows(rows){return (Array.isArray(rows)?rows:[]).map(r=>{const x={}; DATA_HEADERS.forEach(h=>x[h]=r?.[h]??""); return x;});}
function saveAgreementCache(){
 try{
  if(window.MSW?.cache?.save) MSW.cache.save(AGREEMENT_CACHE_KEY, agreementData);
  else localStorage.setItem(AGREEMENT_CACHE_KEY, JSON.stringify(agreementData));
 }catch(e){console.warn("Agreement cache save gagal",e);}
}
function loadAgreementCache(){
 try{
  const cached=window.MSW?.cache?.load?MSW.cache.load(AGREEMENT_CACHE_KEY):JSON.parse(localStorage.getItem(AGREEMENT_CACHE_KEY)||"null");
  if(Array.isArray(cached)){agreementData=normalizeRows(cached);render();return true;}
 }catch(e){console.warn("Agreement cache load gagal",e);}
 return false;
}
function hideRowContextMenu(){
 const menu=byId("rowContextMenu");
 if(menu){menu.classList.add("hidden");menu.setAttribute("aria-hidden","true");menu.style.left="";menu.style.top="";}
 document.querySelectorAll("#tableBody tr.context-row-active").forEach(tr=>tr.classList.remove("context-row-active"));
 contextIndex=-1;
}
function showRowContextMenu(event,rowIndex,tr){
 const menu=byId("rowContextMenu"); if(!menu||!agreementData[rowIndex])return;
 event.preventDefault(); event.stopPropagation(); hideRowContextMenu(); contextIndex=rowIndex; tr?.classList.add("context-row-active");
 menu.classList.remove("hidden"); menu.setAttribute("aria-hidden","false"); menu.style.visibility="hidden"; menu.style.left="0px"; menu.style.top="0px";
 const rect=menu.getBoundingClientRect(); const pad=8;
 const left=Math.max(pad,Math.min(event.clientX,window.innerWidth-rect.width-pad));
 const top=Math.max(pad,Math.min(event.clientY,window.innerHeight-rect.height-pad));
 menu.style.left=`${left}px`; menu.style.top=`${top}px`; menu.style.visibility="visible";
 try{lucide.createIcons();}catch(e){}
}
function bindAgreementRowInteractions(){
 document.querySelectorAll("#tableBody tr[data-index]").forEach(tr=>{
  const realIndex=Number(tr.dataset.index);
  tr.addEventListener("contextmenu",event=>showRowContextMenu(event,realIndex,tr));
  tr.addEventListener("dblclick",event=>{
   if(event.target.closest("button,input,select,textarea,a,label"))return;
   hideRowContextMenu(); openForm("edit",realIndex);
  });
 });
}
function render(){
 const q=String(byId("searchInput")?.value||"").trim().toLowerCase();
 filteredData=agreementData.map((row,index)=>({row,index})).filter(item=>!q||DATA_HEADERS.some(h=>String(item.row[h]||"").toLowerCase().includes(q)));
 const pages=Math.max(1,Math.ceil(filteredData.length/PAGE_SIZE)); if(currentPage>pages)currentPage=pages;
 const start=(currentPage-1)*PAGE_SIZE; const rows=filteredData.slice(start,start+PAGE_SIZE);
 byId("theadRow").innerHTML=HEADERS.map(h=>`<th>${esc(h)}</th>`).join("");
 byId("tableBody").innerHTML=rows.length?rows.map((item,i)=>{const r=item.row;return `<tr data-index="${item.index}" title="Double-click untuk Edit • Klik kanan untuk Delete Row">
<td>${start+i+1}</td><td>${esc(r["Work Order"])}</td><td>${esc(r.Description)}</td><td>${esc(r.Vendor)}</td><td>${esc(r.Buyer)}</td><td>${esc(r.User)}</td><td>${esc(r["Assigned To"])}</td><td>${esc(fmtDate(r["Start Date"]))}</td><td>${esc(fmtDate(r["Due Date"]))}</td><td>${progress(r["% Complete"])}</td><td>${statusBadge(r.Status)}</td><td>${esc(r.Remarks)}</td><td>${esc(r["To Do"])}</td></tr>`;}).join(""):`<tr><td colspan="13" class="py-10 text-center text-gray-400">Belum ada Agreement Tracker.</td></tr>`;
 byId("tableInfo").textContent=`Showing ${rows.length?start+1:0}-${start+rows.length} of ${filteredData.length} data`; byId("pageInfo").textContent=`${currentPage} / ${pages}`; byId("prevPage").disabled=currentPage<=1; byId("nextPage").disabled=currentPage>=pages;
 bindAgreementRowInteractions();
}
async function load(silent=false){
 try{const r=await fetch(`${GAS_URL}?sheet=${encodeURIComponent(SHEET_NAME)}&_=${Date.now()}`,{cache:"no-store"});const j=await r.json();if(!j.success)throw new Error(j.message||"Gagal memuat data");agreementData=normalizeRows(j.rows);agreementRevision=Number(j.revision||0);saveAgreementCache();byId("syncInfo").textContent=`Last Sync: ${new Date().toLocaleString("id-ID")}`;render();}catch(e){if(!silent)toast(e.message||"Gagal memuat Agreement Tracker","error");render();}
}
async function loadMasters(){
 try{const r=await fetch(`${GAS_URL}?action=listAgreementUsers&_=${Date.now()}`);const j=await r.json();users=j.users||[];}catch(e){users=[];}
 try{const r=await fetch(`${GAS_URL}?sheet=Company&_=${Date.now()}`);const j=await r.json();vendors=(j.rows||[]).map(x=>({name:x.Company||x["Company Name"]||x["Vendor"]||x["No Company"]||""})).filter(x=>x.name);}catch(e){vendors=[];}
 window.AGREEMENT_FORM_CONTEXT={users,vendors,row:window.AGREEMENT_FORM_CONTEXT?.row||null};
}
function openForm(mode="add",index=-1){
 const safeMode=mode==="edit"?"edit":"add";
 const row=safeMode==="edit"?agreementData[index]:null;
 if(safeMode==="edit"&&!row){toast("Data Agreement yang akan diedit tidak ditemukan.","error");return;}
 // Parent menjadi sumber kebenaran mode form. Add selalu index -1,
 // sehingga cache/iframe lama tidak dapat mengubah Add menjadi Edit.
 editingIndex=safeMode==="edit"?Number(index):-1;
 editingOriginalRow=row?JSON.parse(JSON.stringify(row)):null;
 window.AGREEMENT_FORM_CONTEXT={users,vendors,row:editingOriginalRow?JSON.parse(JSON.stringify(editingOriginalRow)):null};
 const modal=byId("formModal"); byId("formWindowTitle").textContent=safeMode==="edit"?"Edit Agreement Tracker":"Add Agreement Tracker";
 modal.classList.remove("hidden"); modal.style.display="block";
 const frame=byId("formFrame"); frame.src=`Form/index.html?mode=${safeMode}&index=${editingIndex}&_=${Date.now()}`;
}
function closeForm(){const modal=byId("formModal");modal.classList.add("hidden");modal.style.display="none";byId("formFrame").src="";editingIndex=-1;editingOriginalRow=null;window.AGREEMENT_FORM_CONTEXT={users,vendors,row:null};}
async function postAgreementAction(payload){
 const response=await fetch(GAS_URL,{
  method:"POST",
  headers:{"Content-Type":"text/plain;charset=utf-8"},
  body:JSON.stringify(payload)
 });
 const text=await response.text();
 let result;
 try{result=JSON.parse(text);}
 catch(_){throw new Error(text||`HTTP ${response.status}`);}
 if(!response.ok||result?.success===false)throw new Error(result?.message||"Google Sheet Agreement Tracker gagal diperbarui.");
 if(result?.revision!=null)agreementRevision=Number(result.revision);
 return result;
}

// CRUD Agreement Tracker mengikuti pola Contract Management:
// frontend/cache menjadi sumber data kerja, lalu seluruh dataset disimpan ke backend
// melalui REPLACE_AGREEMENT_TRACKER. Tidak ada lagi lookup row berdasarkan Work Order.
function agreementRowsForSheet(rows=agreementData){
 return normalizeRows(rows).map(row=>{const out={};DATA_HEADERS.forEach(h=>out[h]=row[h]??"");return out;});
}
async function saveAgreementToGoogleSheet(rows=agreementData){
 const result=await postAgreementAction({
  action:"REPLACE_AGREEMENT_TRACKER",
  sheet:SHEET_NAME,
  rows:agreementRowsForSheet(rows),
  // Bila masih ada queue Agreement dari sesi/offline sebelumnya, jangan memakai
  // revision lokal yang mungkin sudah tertinggal. Queue lama diselesaikan dulu
  // dan REPLACE terbaru menjadi state final, sama seperti pola Contract cache-first.
  expectedRevision:hasPendingAgreementSync()?null:agreementRevision
 });
 if(result?.revision!=null)agreementRevision=Number(result.revision);
 return result;
}
function isAgreementPendingItem(item){
 const action=String(item?.payload?.action||"").trim().toUpperCase();
 const sheet=String(item?.payload?.sheet||"").trim().toLowerCase();
 return sheet===SHEET_NAME.toLowerCase() || ["REPLACE_AGREEMENT_TRACKER","ADD_AGREEMENT_TRACKER","EDIT_AGREEMENT_TRACKER","DELETE_AGREEMENT_TRACKER"].includes(action);
}
function hasPendingAgreementSync(){
 try{return Boolean(window.MSW?.sync?.getPending?.().some(isAgreementPendingItem));}catch(_){return false;}
}
async function refreshAgreementFromBackend(silent=true){
 // Sama seperti cache-first Contract: jangan menimpa perubahan lokal yang masih pending.
 if(hasPendingAgreementSync()){
  try{await window.MSW?.sync?.flush?.({silent:true});}catch(_){}
  if(hasPendingAgreementSync())return false;
 }
 await load(silent);
 return true;
}
function recordAgreementActivity(status,row={},detail=""){
 const item={
  type:"AGREEMENT",
  documentNo:String(row?.["Work Order"]||"").trim(),
  status:String(status||"Updated"),
  detail:String(detail||row?.Description||"").trim(),
  timestamp:new Date().toISOString()
 };
 const localItem=window.MSW?.activity?.add?MSW.activity.add(item):item;
 // Activity log tidak boleh menggagalkan transaksi utama dan tidak masuk Pending Sync.
 fetch(GAS_URL,{
  method:"POST",
  headers:{"Content-Type":"text/plain;charset=utf-8"},
  body:JSON.stringify({action:"LOG_ACTIVITY",activity:localItem})
 }).catch(()=>{});
 return localItem;
}
async function saveAgreement(data, mode, index){
 const safeMode=(mode==="edit" && Number.isInteger(Number(index)) && Number(index)>=0 && agreementData[Number(index)])?"edit":"add";
 const safeIndex=safeMode==="edit"?Number(index):-1;
 const before=agreementData.map(r=>Object.assign({},r));
 const normalized=normalizeRows([data])[0];

 if(safeMode==="edit") agreementData[safeIndex]=normalized;
 else agreementData.push(normalized);

 // Sama dengan Contract: perubahan langsung terlihat dan tersimpan di cache frontend.
 saveAgreementCache();
 render();

 try{
  const result=await saveAgreementToGoogleSheet();
  closeForm();
  recordAgreementActivity(safeMode==="edit"?"Updated":"Added",normalized,String(normalized?.Description||""));
  toast(result?.queued?"Perubahan disimpan di frontend. Sinkronisasi Google Sheet berjalan otomatis.":(safeMode==="edit"?"Agreement berhasil diperbarui.":"Agreement berhasil ditambahkan."),result?.queued?"info":"success");
 }catch(err){
  // Jika backend benar-benar menolak (bukan offline queue), kembalikan state agar sama seperti sebelum Save.
  agreementData=normalizeRows(before);
  saveAgreementCache();
  render();
  throw err;
 }
}
async function deleteRow(index){
 const safeIndex=Number(index);
 const row=agreementData[safeIndex];
 if(!row)return;
 if(!confirm(`Hapus Agreement ${row["Work Order"]||row.Description||"ini"}?`))return;
 const before=agreementData.map(r=>Object.assign({},r));
 agreementData.splice(safeIndex,1);
 saveAgreementCache();
 render();
 try{
  const result=await saveAgreementToGoogleSheet();
  recordAgreementActivity("Deleted",row,String(row.Description||""));
  toast(result?.queued?"Delete disimpan di frontend. Sinkronisasi Google Sheet berjalan otomatis.":"Agreement berhasil dihapus.",result?.queued?"info":"success");
 }catch(err){
  agreementData=normalizeRows(before);
  saveAgreementCache();
  render();
  toast(err.message||"Gagal menghapus","error");
 }
}
function exportExcel(){if(!window.XLSX){toast("Excel library belum tersedia","error");return;}const rows=filteredData.map(item=>Object.assign({},item.row));const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Agreement Tracker");XLSX.writeFile(wb,"Agreement_Tracker.xlsx");}
function normalizeImportHeader(value){return String(value||"").trim().toLowerCase().replace(/[^a-z0-9%]+/g,"");}
function agreementImportAliases(){return {
  "Work Order":["workorder","workorder#","workorderno","workordernumber","wo","noworkorder"],
  "Description":["description","desc","deskripsi"],
  "Vendor":["vendor","company","companyname","vendorname"],
  "Buyer":["buyer","buyername"],
  "User":["user","username","requestor","requester"],
  "Assigned To":["assignedto","assignto","assigned","pic"],
  "Start Date":["startdate","start","tanggalmulai"],
  "Due Date":["duedate","due","deadline","tanggalselesai"],
  "% Complete":["%complete","complete","completion","progress","progress%","percentagecomplete"],
  "Status":["status"],
  "Remarks":["remarks","remark","catatan"],
  "To Do":["todo","todolist","task","actionitem"]
 };}
function headerMatchesAgreementField(value, field){
 const norm=normalizeImportHeader(value); if(!norm)return false;
 const aliases=agreementImportAliases();
 return [normalizeImportHeader(field),...(aliases[field]||[]).map(normalizeImportHeader)].includes(norm);
}
function findAgreementHeaderRow(matrix){
 const rows=Array.isArray(matrix)?matrix:[];
 let bestIndex=-1,bestScore=-1;
 rows.slice(0,20).forEach((row,index)=>{
  const cells=Array.isArray(row)?row:[]; let score=0;
  DATA_HEADERS.forEach(field=>{if(cells.some(cell=>headerMatchesAgreementField(cell,field)))score++;});
  const hasWorkOrder=cells.some(cell=>headerMatchesAgreementField(cell,"Work Order"));
  if(hasWorkOrder && score>bestScore){bestScore=score;bestIndex=index;}
 });
 if(bestIndex<0 || bestScore<5)throw new Error('Header Agreement Tracker tidak ditemukan. Pastikan file memiliki kolom "Work order #", Description, Vendor, Buyer, User, dan kolom tracker lainnya.');
 return bestIndex;
}
function importHeaderMapFromArray(headerRow){
 const aliases=agreementImportAliases(), map={};
 (Array.isArray(headerRow)?headerRow:[]).forEach((value,index)=>{
  const norm=normalizeImportHeader(value); if(!norm)return;
  DATA_HEADERS.forEach(field=>{
   if(map[field]!=null)return;
   const names=[normalizeImportHeader(field),...(aliases[field]||[]).map(normalizeImportHeader)];
   if(names.includes(norm))map[field]=index;
  });
 });
 return map;
}
function excelDateToIso(value){
 if(value==null||value==="") return "";
 if(value instanceof Date && !Number.isNaN(value.getTime())){
  const y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,"0"),d=String(value.getDate()).padStart(2,"0"); return `${y}-${m}-${d}`;
 }
 if(typeof value==="number" && window.XLSX?.SSF?.parse_date_code){
  const p=XLSX.SSF.parse_date_code(value); if(p&&p.y&&p.m&&p.d) return `${p.y}-${String(p.m).padStart(2,"0")}-${String(p.d).padStart(2,"0")}`;
 }
 const text=String(value).trim(); if(!text)return ""; if(text==="-")return "-";
 let m=text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/); if(m)return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
 m=text.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/); if(m){
  const a=Number(m[1]),b=Number(m[2]);
  if(a>12)return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  if(b>12)return `${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
 }
 const parsed=new Date(text); if(!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,"0")}-${String(parsed.getDate()).padStart(2,"0")}`;
 return text;
}
function normalizeImportedPercent(value){
 if(value==null||value==="")return "";
 if(typeof value==="number"){
  const n=value>=0&&value<=1?value*100:value; return Math.max(0,Math.min(100,Math.round(n*100)/100));
 }
 const text=String(value).trim(); if(!text)return "";
 const hasPercent=text.includes("%"); const n=Number(text.replace(/%/g,"").replace(/,/g,"."));
 if(!Number.isFinite(n))return "";
 const pct=!hasPercent&&n>=0&&n<=1?n*100:n;
 return Math.max(0,Math.min(100,Math.round(pct*100)/100));
}
function normalizeImportedStatus(value){
 const text=String(value??"").trim(); if(!text)return "";
 const lower=text.toLowerCase();
 if(lower==="complete"||lower==="completed")return "Complete";
 if(lower==="incomplete"||lower==="overdue")return "Incomplete";
 if(lower==="-1")return "";
 if(lower==="1")return "Complete";
 if(lower==="0")return "Incomplete";
 // SheetJS can expose formula result using the cell's date interpretation in some workbooks.
 if(/^1899-12-31/.test(lower))return "Complete";
 if(/^1899-12-30/.test(lower))return "Incomplete";
 if(/^1899-12-29/.test(lower))return "";
 return text;
}
function mapImportedAgreementRowsFromSheet(sheet){
 // raw:false is intentional: the source workbook uses percent/date/custom Status formatting.
 const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false,blankrows:false});
 if(!matrix.length)return [];
 const headerIndex=findAgreementHeaderRow(matrix), headers=matrix[headerIndex], map=importHeaderMapFromArray(headers);
 if(map["Work Order"]==null)throw new Error('Kolom "Work order #" tidak ditemukan pada file Excel.');
 const rows=matrix.slice(headerIndex+1).map(arr=>{
  const row=Array.isArray(arr)?arr:[], out={};
  DATA_HEADERS.forEach(h=>out[h]=map[h]!=null?(row[map[h]]??""):"");
  out["Start Date"]=excelDateToIso(out["Start Date"]); out["Due Date"]=excelDateToIso(out["Due Date"]);
  out["% Complete"]=normalizeImportedPercent(out["% Complete"]);
  out.Status=normalizeImportedStatus(out.Status);
  DATA_HEADERS.forEach(h=>{if(h!=="% Complete")out[h]=String(out[h]??"").trim();});
  return out;
 }).filter(row=>DATA_HEADERS.some(h=>String(row[h]??"").trim()!==""));
 const seen=new Set(),dupes=[];
 rows.forEach(row=>{const key=String(row["Work Order"]||"").trim().toLowerCase();if(!key)return;if(seen.has(key))dupes.push(row["Work Order"]);else seen.add(key);});
 if(dupes.length)throw new Error(`Work Order duplikat pada file Excel: ${[...new Set(dupes)].slice(0,5).join(", ")}${dupes.length>5?" ...":""}`);
 return rows;
}
async function importAgreementExcel(event){
 const input=event?.target; const file=input?.files?.[0]; if(!file)return;
 try{
  if(!window.XLSX) throw new Error("Excel library belum tersedia.");
  const buffer=await file.arrayBuffer();
  const wb=XLSX.read(buffer,{type:"array",cellDates:false,cellNF:true,cellStyles:true});
  const preferredName=wb.SheetNames.find(n=>/agreement|work\s*order/i.test(String(n)))||wb.SheetNames[0];
  const firstSheet=wb.Sheets[preferredName]; if(!firstSheet)throw new Error("Sheet Excel tidak ditemukan.");
  const rows=mapImportedAgreementRowsFromSheet(firstSheet); if(!rows.length)throw new Error("Tidak ada data Agreement Tracker yang dapat diimport.");
  const blankWorkOrders=rows.filter(r=>!String(r["Work Order"]||"").trim()).length;
  const extra=blankWorkOrders?`\n\nCatatan: ${blankWorkOrders} baris memiliki Work Order kosong dan akan tetap diimport sesuai file Excel.`:"";
  if(!confirm(`Import akan mengganti seluruh data Agreement Tracker dengan ${rows.length} baris dari file ${file.name}.${extra}\n\nLanjutkan?`))return;
  byId("importAgreementFile").disabled=true;
  const before=agreementData.map(r=>Object.assign({},r));
  agreementData=normalizeRows(rows); currentPage=1; saveAgreementCache(); render();
  let result;
  try{result=await saveAgreementToGoogleSheet();}
  catch(err){agreementData=normalizeRows(before);saveAgreementCache();render();throw err;}
  byId("syncInfo").textContent=`Last Sync: ${new Date().toLocaleString("id-ID")}`;
  byId("actionDropdown").classList.remove("open");
  const note=blankWorkOrders?` (${blankWorkOrders} Work Order kosong dipertahankan sesuai Excel)`:"";
  recordAgreementActivity("Import Excel",{},`${rows.length} data dari ${file.name}`);
  toast(result.queued?"Import disimpan di frontend. Sinkronisasi Google Sheet berjalan otomatis.":`Berhasil import ${rows.length} data Agreement Tracker${note}.`,result.queued?"info":"success");
 }catch(e){toast(e.message||"Gagal import Agreement Tracker","error");}
 finally{if(input){input.value="";input.disabled=false;}}
}
async function clearAll(){
 if(!agreementData.length)return;
 if(!confirm("Hapus seluruh Agreement Tracker?"))return;
 const before=agreementData.map(r=>Object.assign({},r));
 const previousCount=agreementData.length;
 agreementData=[]; saveAgreementCache(); render();
 try{
  const result=await saveAgreementToGoogleSheet();
  recordAgreementActivity("All Clear",{},`${previousCount} data Agreement Tracker dihapus`);
  toast(result?.queued?"All Clear disimpan di frontend. Sinkronisasi Google Sheet berjalan otomatis.":"Seluruh Agreement Tracker berhasil dihapus.",result?.queued?"info":"success");
 }catch(err){
  agreementData=normalizeRows(before); saveAgreementCache(); render();
  toast(err.message||"Gagal menghapus seluruh data","error");
 }
}
function bind(){
 byId("searchInput").addEventListener("input",()=>{currentPage=1;render();byId("clearSearchBtn").classList.toggle("hidden",!byId("searchInput").value);});byId("clearSearchBtn").onclick=()=>{byId("searchInput").value="";currentPage=1;render();byId("clearSearchBtn").classList.add("hidden");};
 byId("prevPage").onclick=()=>{if(currentPage>1){currentPage--;render();}};byId("nextPage").onclick=()=>{currentPage++;render();};
 byId("addAgreementBtn").onclick=()=>openForm("add");byId("exportAgreementBtn").onclick=exportExcel;byId("importAgreementFile").addEventListener("change",importAgreementExcel);byId("clearAgreementBtn").onclick=clearAll;byId("closeModal").onclick=closeForm;
 byId("menuBtn").onclick=()=>byId("actionDropdown").classList.toggle("open");
 byId("contextDeleteBtn")?.addEventListener("click",async()=>{const index=contextIndex;hideRowContextMenu();if(index>=0)await deleteRow(index);});
 document.addEventListener("click",e=>{if(!e.target.closest("#rowContextMenu"))hideRowContextMenu();});
 document.addEventListener("scroll",hideRowContextMenu,true); window.addEventListener("resize",hideRowContextMenu); document.addEventListener("keydown",e=>{if(e.key==="Escape")hideRowContextMenu();});
 window.addEventListener("focus",()=>refreshAgreementFromBackend(true)); document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshAgreementFromBackend(true);});
 window.addEventListener("message",async e=>{
  const frameWindow=byId("formFrame")?.contentWindow;
  if(frameWindow && e.source!==frameWindow)return;
  if(e.data?.type==="AGREEMENT_FORM_CANCEL"){closeForm();return;}if(e.data?.type==="AGREEMENT_FORM_SAVE"){
  // Jangan percaya mode/index dari iframe. Parent menentukan berdasarkan form yang dibuka.
  const activeMode=(editingIndex>=0&&editingOriginalRow)?"edit":"add";
  const activeIndex=activeMode==="edit"?editingIndex:-1;
  try{await saveAgreement(e.data.data,activeMode,activeIndex);}catch(err){toast(err.message||"Gagal menyimpan","error");const btn=byId("formFrame")?.contentDocument?.getElementById("saveBtn");if(btn)btn.disabled=false;}
 }});
}
(async function init(){bind();loadAgreementCache();await loadMasters();await refreshAgreementFromBackend(true);setInterval(()=>refreshAgreementFromBackend(true),60000);try{lucide.createIcons();}catch(e){}})();
