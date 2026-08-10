"use strict";
const GAS_URL=String(window.APP_CONFIG?.GAS_URL||"").trim();
const profile=window.MSW?.auth?.getProfile?.()||{};
const role=String(profile.role||"").toUpperCase().replace(/[\s-]+/g,"_");
const isBuyer=role==="BUYER", isAdmin=role==="PROCUREMENT_ADMIN"||role==="SUPER_ADMIN";
const statuses=["IN REVIEW","NEED BUYER INFO","INVITATION SENT","WAITING VENDOR DATA","UNDER VERIFICATION","APPROVED","REJECTED","ACTIVE"];
function toast(message){const el=document.getElementById("toast");el.textContent=message;el.style.display="block";setTimeout(()=>el.style.display="none",3500)}
async function api(payload,method="POST"){
  const url=method==="GET"?`${GAS_URL}?${new URLSearchParams(payload)}`:GAS_URL;
  const response=await fetch(url,method==="GET"?{cache:"no-store"}:{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)});
  const json=await response.json(); if(!json.success) throw new Error(json.message||"Request gagal"); return json;
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function loadRequests(){
  try{const data=await api({action:"LIST_VENDOR_REQUESTS"},"GET"), rows=data.requests||[];
    document.getElementById("summary").textContent=`${rows.length} permintaan • ${data.unreadCount||0} perlu perhatian`;
    document.getElementById("requestRows").innerHTML=rows.length?rows.map(renderRow).join(""):'<tr><td colspan="9">Belum ada permintaan vendor.</td></tr>';
    if(isBuyer&&data.unreadCount) await api({action:"MARK_VENDOR_NOTIFICATIONS_READ"});
  }catch(e){toast(e.message)}
}
function renderRow(r){const action=isAdmin?`<div class="admin-box"><select data-status="${esc(r.requestId)}">${statuses.map(s=>`<option ${s===r.status?'selected':''}>${s}</option>`).join("")}</select><textarea data-note="${esc(r.requestId)}" rows="2" placeholder="Catatan Admin">${esc(r.adminNote)}</textarea><button onclick="updateRequest('${esc(r.requestId)}')">Update</button></div>`:"";
  return `<tr><td>${esc(r.requestId)}</td><td><b>${esc(r.companyName)}</b><br>${esc(r.category)}</td><td>${esc(r.picName)}<br>${esc(r.vendorEmail)}<br>${esc(r.vendorContact)}</td><td>${esc(r.buyerName)}<br>${esc(r.buyerEmail)}</td><td><span class="status">${esc(r.status)}</span></td><td>${esc(r.priority)}</td><td>${esc(r.adminNote)||"-"}</td><td>${esc(r.updatedAt||r.createdAt)}</td>${isAdmin?`<td>${action}</td>`:"<td>-</td>"}</tr>`}
window.updateRequest=async function(id){try{const status=document.querySelector(`[data-status="${CSS.escape(id)}"]`).value,adminNote=document.querySelector(`[data-note="${CSS.escape(id)}"]`).value;await api({action:"UPDATE_VENDOR_REQUEST",requestId:id,status,adminNote});toast("Status berhasil diperbarui");loadRequests()}catch(e){toast(e.message)}};
document.getElementById("vendorRequestForm").addEventListener("submit",async e=>{e.preventDefault();try{const payload=Object.fromEntries(new FormData(e.currentTarget));payload.action="CREATE_VENDOR_REQUEST";await api(payload);e.currentTarget.reset();toast("Permintaan berhasil dikirim");loadRequests()}catch(err){toast(err.message)}});
document.getElementById("refreshBtn").addEventListener("click",loadRequests);
document.addEventListener("DOMContentLoaded",()=>{if(!isBuyer&&!isAdmin){toast("Role Anda tidak memiliki akses");return}document.getElementById("buyerFormCard").classList.toggle("hidden",!isBuyer);document.getElementById("listTitle").textContent=isBuyer?"My Vendor Requests":"Vendor Request Approval";document.getElementById("roleInfo").textContent=isBuyer?"Ajukan dan pantau permintaan vendor":"Review dan proses permintaan dari Buyer";document.getElementById("adminActionHead").style.display=isAdmin?"":"none";loadRequests()});
