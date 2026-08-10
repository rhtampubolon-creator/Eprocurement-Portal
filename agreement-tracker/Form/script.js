"use strict";
const GAS_URL = String(window.APP_CONFIG?.GAS_URL || "").trim();
const params = new URLSearchParams(location.search);
const mode = params.get("mode") === "edit" ? "edit" : "add";
const rowIndex = Number(params.get("index") || -1);
const PARENT_CACHE_KEY = "MSW_AGREEMENT_FORM_USERS_V1";
const byId = id => document.getElementById(id);
let users = [], vendors = [];

function parentData(){ try { return window.parent?.AGREEMENT_FORM_CONTEXT || null; } catch(e){ return null; } }
function notifyParent(type, payload={}){ try { window.parent?.postMessage(Object.assign({type}, payload), "*"); } catch(e){} }
function esc(v){ return String(v ?? "").trim(); }
function authUrl(url){
  try{
    const t=String(localStorage.getItem("MSW_AUTH_TOKEN")||sessionStorage.getItem("MSW_AUTH_TOKEN")||"").trim();
    if(!t)return url;
    return url+(url.includes("?")?"&":"?")+"authToken="+encodeURIComponent(t);
  }catch(_){return url;}
}
function fillSelect(id, rows, placeholder, value=""){
  const el=byId(id); if(!el) return;
  el.innerHTML=`<option value="">${placeholder}</option>` + rows.map(x=>`<option value="${String(x.name||x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}">${String(x.name||x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}</option>`).join("");
  if(value) el.value=value;
}
async function loadMasters(){
  const ctx=parentData();
  if(ctx){ users=Array.isArray(ctx.users)?ctx.users:[]; vendors=Array.isArray(ctx.vendors)?ctx.vendors:[]; }
  if(!users.length && GAS_URL){
    try { const r=await fetch(authUrl(`${GAS_URL}?action=listAgreementUsers&_=${Date.now()}`)); const j=await r.json(); users=j.users||[]; } catch(e){ console.warn(e); }
  }
  if(!vendors.length && GAS_URL){
    try { const r=await fetch(authUrl(`${GAS_URL}?sheet=Company&_=${Date.now()}`)); const j=await r.json(); vendors=(j.rows||[]).map(x=>({name:x.Company||x["Company Name"]||x["Company Name / Vendor"]||x["Vendor"]||x["No Company"]||""})).filter(x=>x.name); } catch(e){ console.warn(e); }
  }
  const buyers=users.filter(x=>String(x.role||"").toUpperCase()==="BUYER");
  fillSelect("vendorSelect", vendors, "-- Select Vendor --", "");
  fillSelect("buyerSelect", buyers, "-- Select Buyer --", "");
  fillSelect("userSelect", users, "-- Select User --", "");
  fillSelect("assignedSelect", users, "-- Select Assigned To --", "");
}

function setSelectValue(id,value){
  const el=byId(id); if(!el)return; const v=String(value??"").trim(); if(!v){el.value="";return;}
  let option=[...el.options].find(o=>String(o.value).trim()===v);
  if(!option){option=document.createElement("option");option.value=v;option.textContent=v;el.appendChild(option);}
  el.value=v;
}
function setForm(data){
  if(!data)return;
  byId("workOrder").value=data["Work Order"]||""; byId("description").value=data["Description"]||"";
  const vendor=data["Vendor"]||""; if([...byId("vendorSelect").options].some(o=>o.value===vendor)) byId("vendorSelect").value=vendor; else {byId("manualVendorToggle").checked=!!vendor; byId("manualVendor").classList.remove("hidden"); byId("manualVendor").value=vendor;}
  setSelectValue("buyerSelect",data["Buyer"]||""); setSelectValue("userSelect",data["User"]||""); setSelectValue("assignedSelect",data["Assigned To"]||"");
  byId("startDate").value=data["Start Date"]||""; byId("dueDate").value=data["Due Date"]||""; byId("progress").value=parseInt(data["% Complete"],10)||0; setSelectValue("status",data["Status"]||"To Do"); byId("remarks").value=data["Remarks"]||""; byId("todo").value=data["To Do"]||"";
}
async function init(){
  await loadMasters();
  const ctx=parentData();
  if(mode==="edit") { byId("formTitle").textContent="Edit Agreement Tracker"; setForm(ctx?.row || {}); }
  else byId("formTitle").textContent="Add Agreement Tracker";
  byId("manualVendorToggle").addEventListener("change",()=>byId("manualVendor").classList.toggle("hidden",!byId("manualVendorToggle").checked));
  byId("cancelBtn").onclick=()=>notifyParent("AGREEMENT_FORM_CANCEL");
  byId("agreementForm").addEventListener("submit", async e=>{
    e.preventDefault();
    const vendor=byId("manualVendorToggle").checked?esc(byId("manualVendor").value):esc(byId("vendorSelect").value);
    const data={"Work Order":esc(byId("workOrder").value),"Description":esc(byId("description").value),"Vendor":vendor,"Buyer":esc(byId("buyerSelect").value),"User":esc(byId("userSelect").value),"Assigned To":esc(byId("assignedSelect").value),"Start Date":byId("startDate").value,"Due Date":byId("dueDate").value,"% Complete":Math.max(0,Math.min(100,Number(byId("progress").value)||0)),"Status":byId("status").value,"Remarks":esc(byId("remarks").value),"To Do":esc(byId("todo").value)};
    byId("saveBtn").disabled=true;
    notifyParent("AGREEMENT_FORM_SAVE", {mode, index:rowIndex, data});
  });
  document.querySelectorAll("textarea").forEach(t=>t.addEventListener("input",()=>{t.style.height="auto";t.style.height=t.scrollHeight+"px";}));
}
init();
