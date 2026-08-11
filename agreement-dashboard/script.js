"use strict";
const GAS_URL = String(window.APP_CONFIG?.GAS_URL || "").trim();
const SHEET_NAME = "Agreement Tracker";
const HEADERS = ["Work Order","Description","Vendor","Buyer","User","Assigned To","Start Date","Due Date","% Complete","Status","Remarks","To Do"];
let sourceRows = [];

const $ = id => document.getElementById(id);
const text = value => String(value ?? "").trim();
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
function toast(message, type="info") { const el=$("toast"); if(!el)return; el.textContent=message; el.className=`toast ${type} show`; clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.className="toast",2600); }
function normalizeRows(rows){return (Array.isArray(rows)?rows:[]).map(row=>{const out={};HEADERS.forEach(h=>out[h]=row?.[h]??"");return out;});}
function normalizeStatus(value){return text(value).toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ");}
function progressValue(row){return Math.max(0,Math.min(100,Number(row?.["% Complete"])||0));}
function isComplete(row){const status=normalizeStatus(row?.Status);return progressValue(row)>=100 || ["complete","completed","done","closed","finish","finished"].includes(status);}
function parseDate(value){
  if(value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(),value.getMonth(),value.getDate());
  const raw=text(value); if(!raw || raw==="-") return null;
  let m=raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/); if(m) return safeDate(+m[1],+m[2],+m[3]);
  m=raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); if(m) return safeDate(+m[3],+m[2],+m[1]);
  const parsed=new Date(raw); return Number.isNaN(parsed.getTime())?null:new Date(parsed.getFullYear(),parsed.getMonth(),parsed.getDate());
}
function safeDate(y,m,d){const date=new Date(y,m-1,d);return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?date:null;}
function today(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function dayDiff(date, base=today()){return Math.round((date-base)/86400000);}
function isOverdue(row){const due=parseDate(row?.["Due Date"]);return Boolean(due && !isComplete(row) && due<today());}
function isDueSoon(row,days=7){const due=parseDate(row?.["Due Date"]);if(!due||isComplete(row))return false;const diff=dayDiff(due);return diff>=0&&diff<=days;}
function isTodo(row){return !isComplete(row) && progressValue(row)===0;}
function isInProgress(row){const p=progressValue(row);return !isComplete(row)&&p>0&&p<100;}
function formatDate(value){const d=parseDate(value);return d?d.toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}):"-";}
function monthKey(row){const d=parseDate(row?.["Due Date"]);return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`:"";}
function monthLabel(key){const [y,m]=String(key).split("-").map(Number);return new Date(y,m-1,1).toLocaleDateString("id-ID",{month:"long",year:"numeric"});}
function distinct(values){return [...new Set(values.map(text).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"id"));}
function setOptions(id,values,labelFn=v=>v){const select=$(id);if(!select)return;const current=select.value;const first=select.options[0]?.outerHTML||'<option value="ALL">All</option>';select.innerHTML=first+values.map(v=>`<option value="${esc(v)}">${esc(labelFn(v))}</option>`).join("");if([...select.options].some(o=>o.value===current))select.value=current;}
function applyFilters(){
  const buyer=$("buyerFilter").value, assigned=$("assignedFilter").value, status=$("statusFilter").value, month=$("monthFilter").value;
  return sourceRows.filter(row=>(buyer==="ALL"||text(row.Buyer)===buyer)&&(assigned==="ALL"||text(row["Assigned To"])===assigned)&&(status==="ALL"||text(row.Status)===status)&&(month==="ALL"||monthKey(row)===month));
}
function fillFilters(){
  setOptions("buyerFilter",distinct(sourceRows.map(r=>r.Buyer)));
  setOptions("assignedFilter",distinct(sourceRows.map(r=>r["Assigned To"])));
  setOptions("statusFilter",distinct(sourceRows.map(r=>r.Status)));
  setOptions("monthFilter",distinct(sourceRows.map(monthKey)),monthLabel);
}
function renderKpis(rows){
  $("kpiTotal").textContent=rows.length;
  $("kpiComplete").textContent=rows.filter(isComplete).length;
  $("kpiProgress").textContent=rows.filter(isInProgress).length;
  $("kpiTodo").textContent=rows.filter(isTodo).length;
  $("kpiOverdue").textContent=rows.filter(isOverdue).length;
  $("kpiDueSoon").textContent=rows.filter(row=>isDueSoon(row,7)).length;
}
function renderStatus(rows){
  const segments=[
    {label:"Complete",value:rows.filter(isComplete).length,color:"#18867b"},
    {label:"Overdue",value:rows.filter(isOverdue).length,color:"#d14343"},
    {label:"In Progress",value:rows.filter(row=>isInProgress(row)&&!isOverdue(row)).length,color:"#2f7ec4"},
    {label:"To Do",value:rows.filter(row=>isTodo(row)&&!isOverdue(row)).length,color:"#e39a22"}
  ];
  const covered=segments.reduce((sum,x)=>sum+x.value,0); if(rows.length>covered)segments.push({label:"Other",value:rows.length-covered,color:"#a7b0bf"});
  let cursor=0;const gradient=[];segments.forEach(seg=>{const start=rows.length?(cursor/rows.length)*360:0;cursor+=seg.value;const end=rows.length?(cursor/rows.length)*360:0;gradient.push(`${seg.color} ${start}deg ${end}deg`);});
  $("statusDonut").style.background=rows.length?`conic-gradient(${gradient.join(",")})`:"#e9eef5";
  $("donutTotal").textContent=rows.length;$("statusTotal").textContent=`${rows.length} agreements`;
  $("statusLegend").innerHTML=segments.map(seg=>`<div class="legend-row"><span class="legend-dot" style="background:${seg.color}"></span><span>${esc(seg.label)}</span><strong>${seg.value}</strong></div>`).join("");
}
function renderBarList(id,items){
  const el=$(id);if(!items.length){el.innerHTML='<div class="empty-mini">Belum ada data.</div>';return;}
  const max=Math.max(1,...items.map(x=>x.value));el.innerHTML=items.map(item=>`<div class="bar-row"><span class="bar-label" title="${esc(item.label)}">${esc(item.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3,(item.value/max)*100)}%"></div></div><strong>${item.value}</strong></div>`).join("");
}
function renderProgress(rows){
  const buckets=[
    ["0%",r=>progressValue(r)===0],
    ["1–25%",r=>{const p=progressValue(r);return p>=1&&p<=25;}],
    ["26–50%",r=>{const p=progressValue(r);return p>=26&&p<=50;}],
    ["51–75%",r=>{const p=progressValue(r);return p>=51&&p<=75;}],
    ["76–99%",r=>{const p=progressValue(r);return p>=76&&p<=99;}],
    ["100%",r=>progressValue(r)>=100]
  ].map(([label,test])=>({label,value:rows.filter(test).length}));
  renderBarList("progressBars",buckets);
}
function renderAssigned(rows){const counts=new Map();rows.forEach(row=>{const key=text(row["Assigned To"])||"Unassigned";counts.set(key,(counts.get(key)||0)+1);});const items=[...counts].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label,"id")).slice(0,8);renderBarList("assignedBars",items);}
function renderDue(rows){
  const upcoming=rows.map(row=>({row,due:parseDate(row["Due Date"])})).filter(item=>item.due&&!isComplete(item.row)&&dayDiff(item.due)>=0&&dayDiff(item.due)<=14).sort((a,b)=>a.due-b.due).slice(0,8);
  $("dueList").innerHTML=upcoming.length?upcoming.map(item=>{const days=dayDiff(item.due);return `<div class="due-item"><strong>${esc(item.row["Work Order"]||"-")}</strong><div class="due-copy"><b title="${esc(item.row.Description)}">${esc(item.row.Description||"No description")}</b><span>${esc(formatDate(item.row["Due Date"]))} · ${esc(item.row["Assigned To"]||"Unassigned")}</span></div><span class="days-chip">${days===0?"Today":`${days} day${days===1?"":"s"}`}</span></div>`;}).join(""):'<div class="empty-mini">Tidak ada due date dalam 14 hari ke depan.</div>';
}
function attentionPriority(row){if(isOverdue(row))return 0;if(isDueSoon(row,7))return 1;if(isTodo(row))return 2;if(isInProgress(row)&&progressValue(row)<=50)return 3;return 9;}
function renderAttention(rows){
  const attention=rows.filter(row=>attentionPriority(row)<9).sort((a,b)=>{const pa=attentionPriority(a),pb=attentionPriority(b);if(pa!==pb)return pa-pb;const da=parseDate(a["Due Date"]),db=parseDate(b["Due Date"]);return (da?.getTime()||Number.MAX_SAFE_INTEGER)-(db?.getTime()||Number.MAX_SAFE_INTEGER);});
  $("attentionCount").textContent=`${attention.length} items`;
  const shown=attention.slice(0,10);$("attentionBody").innerHTML=shown.length?shown.map(row=>{const p=progressValue(row);const state=isOverdue(row)?"Overdue":isDueSoon(row,7)?"Due Soon":text(row.Status)||"To Do";const cls=isOverdue(row)?"overdue":isDueSoon(row,7)?"due-soon":"";return `<tr><td><strong>${esc(row["Work Order"]||"-")}</strong></td><td>${esc(row.Description||"-")}</td><td>${esc(row.Vendor||"-")}</td><td>${esc(row["Assigned To"]||"-")}</td><td>${esc(formatDate(row["Due Date"]))}</td><td class="progress-cell"><div class="progress-mini"><div class="progress-mini-track"><div class="progress-mini-fill" style="width:${p}%"></div></div><span>${p}%</span></div></td><td><span class="status-chip ${cls}">${esc(state)}</span></td><td>${esc(row["To Do"]||"-")}</td></tr>`;}).join(""):'<tr><td colspan="8" class="empty-mini">Tidak ada agreement yang membutuhkan perhatian.</td></tr>';
}
function render(){const rows=applyFilters();renderKpis(rows);renderStatus(rows);renderProgress(rows);renderAssigned(rows);renderDue(rows);renderAttention(rows);$("emptyState").classList.toggle("hidden",sourceRows.length>0);if(window.lucide)lucide.createIcons();}
async function loadData(silent=false){
  if(!GAS_URL){if(!silent)toast("GAS_URL belum dikonfigurasi.","error");return;}
  try{const response=await fetch(`${GAS_URL}?sheet=${encodeURIComponent(SHEET_NAME)}&_=${Date.now()}`,{cache:"no-store"});const payload=await response.json();if(!payload.success)throw new Error(payload.message||"Gagal memuat Agreement Tracker");sourceRows=normalizeRows(payload.rows);fillFilters();render();$("lastSync").textContent=`Last Sync: ${new Date().toLocaleString("id-ID")}`;}catch(error){console.error(error);if(!silent)toast(error.message||"Gagal memuat Agreement Tracker","error");render();}
}
["buyerFilter","assignedFilter","statusFilter","monthFilter"].forEach(id=>$(id)?.addEventListener("change",render));
$("resetFilterBtn")?.addEventListener("click",()=>{["buyerFilter","assignedFilter","statusFilter","monthFilter"].forEach(id=>{if($(id))$(id).value="ALL";});render();});
$("refreshBtn")?.addEventListener("click",()=>loadData(false));
$("openTrackerBtn")?.addEventListener("click",()=>{try{window.parent.postMessage({type:"MSW_OPEN_MODULE",module:"agreementTracker"},"*");}catch(_){}});
window.addEventListener("focus",()=>loadData(true));
window.addEventListener("load",()=>{if(window.lucide)lucide.createIcons();loadData(false);});
