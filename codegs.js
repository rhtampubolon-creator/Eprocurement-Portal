/**
 * PROCUREMENT ADMIN - GOOGLE APPS SCRIPT BACKEND (LENGKAP)
 *
 * Fitur:
 * 1. Load sheet Admin / Company dan sheet lain melalui doGet.
 * 2. Save seluruh data Admin melalui payload { sheet, rows }.
 * 3. ADD / EDIT / DELETE Procurement.
 * 4. ADD_COMPANY / EDIT_COMPANY / DELETE_COMPANY.
 * 5. Create / refresh struktur folder procurement.
 * 6. Membaca link setiap folder dokumen tanpa subfolder round.
 * 7. Upload file atau isi folder ke lokasi yang dipilih.
 * 8. Workspace terintegrasi BidderList / RFQ / CQS per No PR dan round.
 * 9. Backup extended rebid mulai R3.
 *
 * Setelah mengganti kode:
 * Deploy > Manage deployments > Edit > New version > Deploy.
 */

/* =========================================================
   ENVIRONMENT & SECRET CONFIGURATION

   Nilai sensitif tidak lagi ditulis di source code. Isi melalui:
   Apps Script > Project Settings > Script Properties.

   Properti database (default sudah diarahkan ke empat file pengguna,
   tetapi dapat dioverride melalui Script Properties):
   - CORE_SPREADSHEET_ID
   - OPERATION_SPREADSHEET_ID
   - ACTIVITY_SPREADSHEET_ID
   - SECURITY_SPREADSHEET_ID
   - AGREEMENT_TRACKER_SPREADSHEET_ID

   Properti wajib untuk fitur Drive/dokumen:
   - PROCUREMENT_ROOT_FOLDER_ID
   - MULTIPLE_EMAIL_TC_FOLDER_ID
   - MASTER_TEMPLATE_FOLDER_ID
   - ITEM_REFERENCE_SPREADSHEET_ID

   Properti opsional:
   - APP_ENV = DEVELOPMENT | STAGING | PRODUCTION
   - ROLE_ENFORCEMENT_ENABLED = true | false
   - DEVELOPMENT_ADMIN_EMAILS = email1@domain.com,email2@domain.com
========================================================= */

function scriptProperty_(name, fallbackValue) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  return value == null || String(value).trim() === ""
    ? String(fallbackValue == null ? "" : fallbackValue)
    : String(value).trim();
}

function scriptBooleanProperty_(name, fallbackValue) {
  const value = scriptProperty_(name, fallbackValue ? "true" : "false").toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function requiredScriptProperty_(name) {
  const value = scriptProperty_(name, "");
  if (!value) {
    throw new Error(
      "Konfigurasi Script Property '" + name + "' belum diisi. " +
      "Buka Apps Script > Project Settings > Script Properties."
    );
  }
  return value;
}

const APP_ENV = scriptProperty_("APP_ENV", "PRODUCTION").toUpperCase();


// Production hardening. Jalankan setupProductionSecurity_() satu kali dari
// Apps Script editor sebelum deployment production. Secret tidak dikembalikan
// ke frontend dan hanya disimpan pada Script Properties.
function setupProductionSecurity_() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty("APP_ENV", "PRODUCTION");
  props.setProperty("ROLE_ENFORCEMENT_ENABLED", "true");
  if (!String(props.getProperty("AUTH_PEPPER") || "").trim()) {
    props.setProperty("AUTH_PEPPER", authRandomToken_() + authRandomToken_());
  }
  if (!String(props.getProperty("LOGIN_MAX_ATTEMPTS") || "").trim()) props.setProperty("LOGIN_MAX_ATTEMPTS", "5");
  if (!String(props.getProperty("LOGIN_LOCK_SECONDS") || "").trim()) props.setProperty("LOGIN_LOCK_SECONDS", "900");
  if (!String(props.getProperty("SESSION_HOURS") || "").trim()) props.setProperty("SESSION_HOURS", "8");
  if (!String(props.getProperty("REMEMBER_SESSION_HOURS") || "").trim()) props.setProperty("REMEMBER_SESSION_HOURS", "72");
  if (!String(props.getProperty("PASSWORD_HASH_ITERATIONS") || "").trim()) props.setProperty("PASSWORD_HASH_ITERATIONS", "6000");
  return {
    success: true,
    appEnv: "PRODUCTION",
    roleEnforcement: true,
    authPepperConfigured: true,
    message: "Production security properties configured. Deploy a New Version after running this function."
  };
}

// Public wrappers supaya fungsi security muncul pada dropdown Run di Apps Script editor.
// Helper dengan akhiran underscore tetap dipertahankan agar tidak dapat dipanggil
// langsung dari client-side google.script.run.
function setupProductionSecurity() {
  return setupProductionSecurity_();
}

function productionSecurityStatus() {
  return productionSecurityStatus_();
}

function productionSecurityStatus_() {
  const props = PropertiesService.getScriptProperties();
  return {
    success: true,
    environment: APP_ENV,
    roleEnforcement: ROLE_ENFORCEMENT_ENABLED,
    authPepperConfigured: Boolean(String(props.getProperty("AUTH_PEPPER") || "").trim()),
    loginMaxAttempts: Number(scriptProperty_("LOGIN_MAX_ATTEMPTS", "5")),
    loginLockSeconds: Number(scriptProperty_("LOGIN_LOCK_SECONDS", "900")),
    sessionHours: Number(scriptProperty_("SESSION_HOURS", "8")),
    rememberSessionHours: Number(scriptProperty_("REMEMBER_SESSION_HOURS", "72"))
  };
}

// Database EProcurement. Agreement Tracker memiliki spreadsheet terpisah dari Core Master.
// Nilai di bawah adalah default dari file yang diberikan pengguna dan tetap dapat dioverride melalui Script Properties.
// SPREADSHEET_ID lama dipertahankan sebagai fallback kompatibilitas.
const LEGACY_SPREADSHEET_ID = scriptProperty_("SPREADSHEET_ID", "");
const CORE_SPREADSHEET_ID = scriptProperty_(
  "CORE_SPREADSHEET_ID",
  LEGACY_SPREADSHEET_ID || "1vZPcwjbkw0SORY7jAb5exmErIs5rp-uatYugxMXwt3A"
);
const OPERATION_SPREADSHEET_ID = scriptProperty_(
  "OPERATION_SPREADSHEET_ID",
  "12nzZY-xDRsmUHfsT6ksrS_X-v4AnU4bkXuQxoVWsQeU"
);
const ACTIVITY_SPREADSHEET_ID = scriptProperty_(
  "ACTIVITY_SPREADSHEET_ID",
  "1vnmkotagO3gtCj1IqoZz5GbPB_BEKZ1Y3RZQ37IuL9Q"
);
const SECURITY_SPREADSHEET_ID = scriptProperty_(
  "SECURITY_SPREADSHEET_ID",
  "1xvDtGoluXyKJu3k9VFhw-7vPva7HeXq6KF5avwYeCvM"
);
const AGREEMENT_TRACKER_SPREADSHEET_ID = scriptProperty_(
  "AGREEMENT_TRACKER_SPREADSHEET_ID",
  "1mt8IVTkDlrRB9Z6AaB3BfO1yTzVZEkOe3alqsn14QHI"
);

// Alias lama untuk status/diagnostik yang masih membaca SPREADSHEET_ID.
const SPREADSHEET_ID = CORE_SPREADSHEET_ID;
const PROCUREMENT_ROOT_FOLDER_ID = scriptProperty_("PROCUREMENT_ROOT_FOLDER_ID", "");
const MULTIPLE_EMAIL_TC_FOLDER_ID = scriptProperty_("MULTIPLE_EMAIL_TC_FOLDER_ID", "");

// Folder master permanen untuk template dokumen Procurement.
// Template di folder ini hanya dibaca. File aslinya tidak diubah atau ditimpa.
const MASTER_TEMPLATE_FOLDER_ID = scriptProperty_("MASTER_TEMPLATE_FOLDER_ID", "");
const MASTER_TEMPLATE_DEFINITIONS = {
  BIDDERLIST: {
    aliases: ["Bidderlist.xlsx", "BidderList.xlsx"],
    keyword: "bidderlist"
  },
  RFQ: {
    aliases: ["RFQ.xlsx"],
    keyword: "rfq"
  },
  CQS: {
    aliases: ["CQS.xlsx"],
    keyword: "cqs"
  }
};

const DEFAULT_SHEET_NAME = "Admin";
const DEFAULT_COMPANY_SHEET_NAME = "Company";
const MAX_ROUND = 5;
const NORMAL_MAX_ROUND = 2;
const DOCUMENT_WORKSPACE_SHEET_NAME = "Procurement Workspace";
// Google Sheets membatasi isi satu sel sekitar 50.000 karakter. Workspace CQS
// dengan 4-10 vendor dapat melewati batas tersebut, sehingga JSON disimpan
// bertahap: bagian pertama di kolom Data JSON (D), sisanya mulai kolom H.
const WORKSPACE_JSON_CHUNK_SIZE = 45000;
const REBID_REQUEST_SHEET_NAME = "Rebid Requests";
const RECENT_ACTIVITY_SHEET_NAME = "Recent Activity";
const AUDIT_LOG_SHEET_NAME = "Audit Log";
const MAX_POST_BODY_CHARS = 15000000;
const MAX_UPLOAD_BYTES = 10000000;
const USERS_SHEET_NAME = "Users";
let CURRENT_REQUEST_AUTH_TOKEN = "";

/**
 * Cari profil (nama, no HP) dari akun Google yang sedang login, dicocokkan
 * lewat sheet "Users" (kolom: Email, Name, Phone). Kalau sheet atau baris
 * yang cocok tidak ada, name/phone dikembalikan kosong -- frontend akan
 * fallback ke 'Signature Buyer'/PIC seperti sebelumnya.
 *
 * PRASYARAT supaya Session.getActiveUser().getEmail() terisi:
 * Web App harus di-deploy dengan "Execute as: User accessing the web app"
 * dan "Who has access" dibatasi ke domain/organisasi Anda (bukan "Anyone").
 */
function normalizeRole_(value) {
  const role = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  const aliases = {
    ADMIN: "PROCUREMENT_ADMIN",
    SUPERADMIN: "SUPER_ADMIN",
    PROCUREMENT: "PROCUREMENT_ADMIN",
    PROCUREMENTADMIN: "PROCUREMENT_ADMIN",
    COMPANY: "VENDOR",
    SUPPLIER: "VENDOR",
    CONTRACTADMIN: "CONTRACT",
    CONTRACT_ADMIN: "CONTRACT",
    CONTRACTMANAGEMENT: "CONTRACT",
    CONTRACT_MANAGEMENT: "CONTRACT"
  };
  return aliases[role] || role;
}

function parseActiveFlag_(value, fallbackValue) {
  const text = String(value == null ? "" : value).trim().toLowerCase();
  if (!text) return Boolean(fallbackValue);
  return ["true", "1", "yes", "y", "active", "aktif"].indexOf(text) >= 0;
}

function permissionsForRole_(role) {
  return (ROLE_PERMISSIONS[normalizeRole_(role)] || []).slice();
}

function roleHasPermission_(profile, permission) {
  if (!permission) return true;
  const permissions = Array.isArray(profile && profile.permissions)
    ? profile.permissions
    : permissionsForRole_(profile && profile.role);
  if (permissions.indexOf("*") >= 0) return true;

  const alternatives = String(permission).split("|").map(function (item) {
    return String(item || "").trim();
  }).filter(Boolean);
  return alternatives.some(function (item) {
    return permissions.indexOf(item) >= 0;
  });
}



const USER_HEADERS = [
  "User ID", "Email", "Name", "Phone", "Password Salt", "Password Hash",
  "Role", "Company ID", "Status", "Active", "Created At", "Approved At",
  "Approved By", "Last Login", "Session Token Hash", "Session Expires"
];

const VENDOR_REQUESTS_SHEET_NAME = "Vendor Requests";
const VENDOR_REQUEST_HEADERS = [
  "Request ID", "Company Name", "PIC Name", "Vendor Email", "Vendor Contact",
  "Category", "Reason", "Priority", "Status", "Buyer Email", "Buyer Name",
  "Created At", "Updated At", "Assigned Admin", "Admin Note", "Buyer Note",
  "Processed By", "Notification Read At"
];

function ensureVendorRequestsSheet_() {
  const ss = getSpreadsheet_(VENDOR_REQUESTS_SHEET_NAME);
  let sheet = ss.getSheetByName(VENDOR_REQUESTS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(VENDOR_REQUESTS_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, VENDOR_REQUEST_HEADERS.length).setValues([VENDOR_REQUEST_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function requireVendorRequestUser_(allowedRoles) {
  const profile = getCurrentUserProfile_();
  const role = normalizeRole_(profile.role);
  if (!profile.found || !profile.active || allowedRoles.indexOf(role) < 0) {
    throw new Error("Anda tidak memiliki akses ke Vendor Requests.");
  }
  return profile;
}

function vendorRequestObject_(headers, row) {
  const m = userHeaderMap_(headers);
  const value = function(key) { return m[key] >= 0 ? String(row[m[key]] || "").trim() : ""; };
  return {
    requestId:value("requestid"), companyName:value("companyname"), picName:value("picname"),
    vendorEmail:value("vendoremail"), vendorContact:value("vendorcontact"), category:value("category"),
    reason:value("reason"), priority:value("priority"), status:value("status"), buyerEmail:value("buyeremail"),
    buyerName:value("buyername"), createdAt:value("createdat"), updatedAt:value("updatedat"),
    assignedAdmin:value("assignedadmin"), adminNote:value("adminnote"), buyerNote:value("buyernote"),
    processedBy:value("processedby"), notificationReadAt:value("notificationreadat")
  };
}

function createVendorRequest_(body) {
  const buyer = requireVendorRequestUser_(["BUYER"]);
  const companyName=String(body.companyName||"").trim(), picName=String(body.picName||"").trim();
  const vendorEmail=String(body.vendorEmail||"").trim().toLowerCase(), vendorContact=String(body.vendorContact||"").trim();
  if(companyName.length<3) throw new Error("Nama perusahaan minimal 3 karakter.");
  if(picName.length<3) throw new Error("Nama PIC minimal 3 karakter.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendorEmail)) throw new Error("Email vendor tidak valid.");
  if(vendorContact.length<8) throw new Error("Nomor kontak vendor tidak valid.");
  const sheet=ensureVendorRequestsSheet_(), headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  const map=userHeaderMap_(headers), row=new Array(headers.length).fill("");
  const set=function(key,val){ if(map[key]>=0) row[map[key]]=val; };
  set("requestid","VR-"+Utilities.getUuid()); set("companyname",companyName); set("picname",picName);
  set("vendoremail",vendorEmail); set("vendorcontact",vendorContact); set("category",String(body.category||"").trim());
  set("reason",String(body.reason||"").trim()); set("priority",String(body.priority||"NORMAL").trim().toUpperCase());
  set("status","PENDING REVIEW"); set("buyeremail",buyer.email); set("buyername",buyer.name); set("createdat",new Date()); set("updatedat",new Date());
  sheet.appendRow(row);
  return {success:true,message:"Permintaan penambahan vendor berhasil dikirim.",requestId:row[map.requestid]};
}

function listVendorRequests_() {
  const profile=requireVendorRequestUser_(["BUYER","PROCUREMENT_ADMIN","SUPER_ADMIN"]), role=normalizeRole_(profile.role);
  const sheet=ensureVendorRequestsSheet_(), values=sheet.getDataRange().getDisplayValues();
  if(values.length<2) return {success:true,requests:[],unreadCount:0};
  const requests=[];
  for(let r=1;r<values.length;r++) {
    const item=vendorRequestObject_(values[0],values[r]);
    if(role==="BUYER" && item.buyerEmail.toLowerCase()!==String(profile.email||"").toLowerCase()) continue;
    requests.push(item);
  }
  const unreadCount=role==="BUYER" ? requests.filter(function(item){return item.updatedAt && !item.notificationReadAt && item.status!=="PENDING REVIEW";}).length : requests.filter(function(item){return item.status==="PENDING REVIEW";}).length;
  return {success:true,requests:requests.reverse(),unreadCount:unreadCount};
}

function updateVendorRequest_(body) {
  const admin=requireVendorRequestUser_(["PROCUREMENT_ADMIN","SUPER_ADMIN"]);
  const allowed=["IN REVIEW","NEED BUYER INFO","INVITATION SENT","WAITING VENDOR DATA","UNDER VERIFICATION","APPROVED","REJECTED","ACTIVE"];
  const status=String(body.status||"").trim().toUpperCase(), requestId=String(body.requestId||"").trim();
  if(allowed.indexOf(status)<0) throw new Error("Status permintaan tidak valid.");
  const sheet=ensureVendorRequestsSheet_(), values=sheet.getDataRange().getDisplayValues(), map=userHeaderMap_(values[0]);
  let rowNumber=0; for(let r=1;r<values.length;r++) if(String(values[r][map.requestid]||"").trim()===requestId){rowNumber=r+1;break;}
  if(!rowNumber) throw new Error("Permintaan vendor tidak ditemukan.");
  const set=function(key,val){if(map[key]>=0) sheet.getRange(rowNumber,map[key]+1).setValue(val);};
  if(status==="ACTIVE") activateVendorFromRequest_(values[0], values[rowNumber-1]);
  set("status",status); set("adminnote",String(body.adminNote||"").trim()); set("assignedadmin",String(body.assignedAdmin||admin.email||admin.name).trim());
  set("processedby",admin.email||admin.name); set("updatedat",new Date()); set("notificationreadat","");
  return {success:true,message:"Status permintaan vendor berhasil diperbarui."};
}

function activateVendorFromRequest_(requestHeaders, requestRow) {
  const request=vendorRequestObject_(requestHeaders,requestRow);
  const sheet=getSpreadsheet_(DEFAULT_COMPANY_SHEET_NAME).getSheetByName(DEFAULT_COMPANY_SHEET_NAME);
  if(!sheet) throw new Error("Sheet Company belum tersedia.");
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0], map=userHeaderMap_(headers);
  const values=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getDisplayValues():[];
  const companyKey=String(request.companyName||"").trim().toLowerCase(), emailKey=String(request.vendorEmail||"").trim().toLowerCase();
  for(let i=0;i<values.length;i++) {
    const existingCompany=map.companyname>=0?String(values[i][map.companyname]||"").trim().toLowerCase():"";
    const existingEmail=map.email>=0?String(values[i][map.email]||"").trim().toLowerCase():"";
    if((companyKey&&existingCompany===companyKey)||(emailKey&&existingEmail===emailKey)) throw new Error("Vendor sudah terdaftar di Vendor Management.");
  }
  const row=new Array(headers.length).fill(""); const set=function(key,val){if(map[key]>=0)row[map[key]]=val;};
  set("companyname",request.companyName); set("email",request.vendorEmail); set("customercontact",request.picName);
  set("companyphone",request.vendorContact); set("corebusiness",request.category); set("statusregister","REGISTERED"); set("companystatus","ACTIVE");
  sheet.appendRow(row);
}

function markVendorNotificationsRead_() {
  const buyer=requireVendorRequestUser_(["BUYER"]), sheet=ensureVendorRequestsSheet_(), values=sheet.getDataRange().getDisplayValues();
  if(values.length<2) return {success:true}; const map=userHeaderMap_(values[0]);
  for(let r=1;r<values.length;r++) if(String(values[r][map.buyeremail]||"").trim().toLowerCase()===buyer.email.toLowerCase() && String(values[r][map.status]||"").trim()!=="PENDING REVIEW") sheet.getRange(r+1,map.notificationreadat+1).setValue(new Date());
  return {success:true};
}

function ensureUsersSheet_() {
  const ss = getSpreadsheet_(USERS_SHEET_NAME);
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(USERS_SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS]);
  const existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
  const normalized = existing.map(function(h){ return String(h||"").trim().toLowerCase().replace(/[\s_-]+/g, ""); });
  USER_HEADERS.forEach(function(header){
    const key = header.toLowerCase().replace(/[\s_-]+/g, "");
    if (normalized.indexOf(key) < 0) { existing.push(header); normalized.push(key); }
  });
  sheet.getRange(1, 1, 1, existing.length).setValues([existing]);
  return sheet;
}

function authHex_(bytes) {
  return bytes.map(function(b){ const n=(b+256)%256; return (n<16?'0':'')+n.toString(16); }).join('');
}
function authHash_(value) { return authHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value||""), Utilities.Charset.UTF_8)); }
function authRandomToken_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }
function authPepper_() {
  const configured = String(PropertiesService.getScriptProperties().getProperty("AUTH_PEPPER") || "").trim();
  if (configured) return configured;
  if (APP_ENV === "PRODUCTION") {
    throw new Error("Security configuration incomplete. Run setupProductionSecurity_() in Apps Script, then deploy a New Version.");
  }
  return "MSW-EPROC-CHANGE-ME";
}
function authPasswordHashV1_(password, salt, pepper) {
  let value = String(salt||"") + ":" + String(password||"") + ":" + String(pepper||"");
  for (let i=0;i<1200;i++) value = authHash_(value);
  return value;
}
function authPasswordHashLegacy_(password, salt) {
  // Hanya untuk migrasi akun lama yang memakai fallback bawaan.
  return authPasswordHashV1_(password, salt, "MSW-EPROC-CHANGE-ME");
}
function authPasswordHash_(password, salt) {
  const secret = authPepper_();
  const iterations = Math.max(3000, Math.min(20000, Number(scriptProperty_("PASSWORD_HASH_ITERATIONS", "6000")) || 6000));
  let value = String(salt||"") + ":" + String(password||"") + ":" + secret;
  for (let i=0;i<iterations;i++) value = authHash_(secret + ":" + value + ":" + salt);
  return "v2$" + value;
}
function authVerifyPassword_(password, salt, storedHash) {
  const stored = String(storedHash || "");
  if (stored.indexOf("v2$") === 0) {
    return { valid: authPasswordHash_(password, salt) === stored, migrate: false };
  }
  // Kompatibilitas V1: dahulu hash tidak memiliki prefix. Coba pepper
  // yang sekarang dikonfigurasi, lalu fallback bawaan lama untuk migrasi.
  const currentPepperValid = authPasswordHashV1_(password, salt, authPepper_()) === stored;
  const legacyValid = currentPepperValid || authPasswordHashLegacy_(password, salt) === stored;
  return { valid: legacyValid, migrate: legacyValid };
}
function loginRateKey_(email) {
  return "LOGIN_GUARD_" + authHash_(String(email || "").trim().toLowerCase()).slice(0, 32);
}
function readLoginGuard_(email) {
  const raw = CacheService.getScriptCache().get(loginRateKey_(email));
  if (!raw) return { attempts: 0, lockedUntil: 0 };
  try { return JSON.parse(raw); } catch (_) { return { attempts: 0, lockedUntil: 0 }; }
}
function writeLoginGuard_(email, guard) {
  const ttl = Math.max(60, Math.min(21600, Number(scriptProperty_("LOGIN_LOCK_SECONDS", "900")) || 900));
  CacheService.getScriptCache().put(loginRateKey_(email), JSON.stringify(guard || {}), ttl);
}
function assertLoginAllowed_(email) {
  const guard = readLoginGuard_(email);
  const now = Date.now();
  if (Number(guard.lockedUntil || 0) > now) {
    const seconds = Math.max(1, Math.ceil((Number(guard.lockedUntil) - now) / 1000));
    throw new Error("Terlalu banyak percobaan login. Coba lagi dalam " + Math.ceil(seconds / 60) + " menit.");
  }
}
function recordLoginFailure_(email) {
  const maxAttempts = Math.max(3, Math.min(10, Number(scriptProperty_("LOGIN_MAX_ATTEMPTS", "5")) || 5));
  const lockSeconds = Math.max(60, Math.min(21600, Number(scriptProperty_("LOGIN_LOCK_SECONDS", "900")) || 900));
  const guard = readLoginGuard_(email);
  const attempts = Number(guard.attempts || 0) + 1;
  const lockedUntil = attempts >= maxAttempts ? Date.now() + lockSeconds * 1000 : 0;
  writeLoginGuard_(email, { attempts: attempts, lockedUntil: lockedUntil });
}
function clearLoginFailures_(email) {
  CacheService.getScriptCache().remove(loginRateKey_(email));
}
function userHeaderMap_(headers) {
  const map={}; headers.forEach(function(h,i){ map[String(h||"").trim().toLowerCase().replace(/[\s_-]+/g,"")]=i; }); return map;
}
function userRecordByEmail_(email) {
  const sheet=ensureUsersSheet_(); const values=sheet.getDataRange().getDisplayValues(); const map=userHeaderMap_(values[0]);
  const target=String(email||"").trim().toLowerCase();
  for(let r=1;r<values.length;r++) if(String(values[r][map.email]||"").trim().toLowerCase()===target) return {sheet:sheet,row:r+1,values:values[r],map:map,headers:values[0]};
  return null;
}
function userRecordByToken_(token) {
  if(!token) return null; const tokenHash=authHash_(token); const sheet=ensureUsersSheet_(); const values=sheet.getDataRange().getDisplayValues(); const map=userHeaderMap_(values[0]);
  for(let r=1;r<values.length;r++) {
    if(String(values[r][map.sessiontokenhash]||"")!==tokenHash) continue;
    const expiry=new Date(values[r][map.sessionexpires]||""); if(!expiry.getTime() || expiry.getTime()<Date.now()) return null;
    return {sheet:sheet,row:r+1,values:values[r],map:map,headers:values[0]};
  } return null;
}
function profileFromUserRecord_(record) {
  if(!record) return {success:true,email:"",name:"",phone:"",role:"",companyId:"",status:"",active:false,found:false,permissions:[]};
  const v=record.values,m=record.map; const role=normalizeRole_(v[m.role]||"");
  return {success:true,email:String(v[m.email]||"").trim().toLowerCase(),name:String(v[m.name]||"").trim(),phone:String(v[m.phone]||"").trim(),role:role,companyId:String(v[m.companyid]||"").trim(),status:String(v[m.status]||"").trim().toUpperCase(),active:parseActiveFlag_(v[m.active],false),found:true,permissions:permissionsForRole_(role)};
}
function registerUser_(body) {
  const name=String(body.name||"").trim(), phone=String(body.phone||"").trim(), email=String(body.email||"").trim().toLowerCase(), password=String(body.password||"");
  if(name.length<3) throw new Error("Full Name must contain at least 3 characters.");
  if(!/^\+?[0-9][0-9\s-]{8,18}$/.test(phone)) throw new Error("Mobile Number is not valid.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email is not valid.");
  if(password.length<10) throw new Error("Password must contain at least 10 characters.");
  if(!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) throw new Error("Password must contain uppercase, lowercase, and a number.");
  if(userRecordByEmail_(email)) throw new Error("This email is already registered.");
  const sheet=ensureUsersSheet_(); const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0]; const map=userHeaderMap_(headers); const row=new Array(headers.length).fill("");
  const salt=authRandomToken_().slice(0,32); const set=function(k,val){ if(map[k]>=0) row[map[k]]=val; };
  set('userid','USR-'+Utilities.getUuid()); set('email',email); set('name',name); set('phone',phone); set('passwordsalt',salt); set('passwordhash',authPasswordHash_(password,salt)); set('status','PENDING'); set('active',false); set('createdat',new Date());
  sheet.appendRow(row); return {success:true,status:'PENDING',message:'Registration submitted. Your account is waiting for Super Admin approval.'};
}
function loginUser_(body) {
  const email=String(body.email||"").trim().toLowerCase(), password=String(body.password||"");
  if(!email || !password) throw new Error("Email or password is incorrect.");
  assertLoginAllowed_(email);
  const record=userRecordByEmail_(email);
  if(!record) { recordLoginFailure_(email); throw new Error("Email or password is incorrect."); }
  const v=record.values,m=record.map;
  const verification=authVerifyPassword_(password,v[m.passwordsalt],String(v[m.passwordhash]||""));
  if(!verification.valid) { recordLoginFailure_(email); throw new Error("Email or password is incorrect."); }
  const status=String(v[m.status]||"").trim().toUpperCase(); const active=parseActiveFlag_(v[m.active],false);
  if(status==='PENDING' || !active) throw new Error("Your account is awaiting Super Admin approval.");
  clearLoginFailures_(email);
  if(verification.migrate) {
    record.sheet.getRange(record.row,m.passwordhash+1).setValue(authPasswordHash_(password,v[m.passwordsalt]));
  }
  const token=authRandomToken_();
  const normalHours=Math.max(1,Math.min(24,Number(scriptProperty_("SESSION_HOURS","8"))||8));
  const rememberHours=Math.max(normalHours,Math.min(168,Number(scriptProperty_("REMEMBER_SESSION_HOURS","72"))||72));
  const expiry=new Date(Date.now()+(body.rememberMe?rememberHours:normalHours)*60*60*1000);
  record.sheet.getRange(record.row,m.sessiontokenhash+1).setValue(authHash_(token));
  record.sheet.getRange(record.row,m.sessionexpires+1).setValue(expiry);
  record.sheet.getRange(record.row,m.lastlogin+1).setValue(new Date());
  return {success:true,token:token,expires:expiry.toISOString(),profile:profileFromUserRecord_(record)};
}
function logoutUser_(body) {
  const record=userRecordByToken_(String(body.authToken||CURRENT_REQUEST_AUTH_TOKEN||"")); if(record){ record.sheet.getRange(record.row,record.map.sessiontokenhash+1).clearContent(); record.sheet.getRange(record.row,record.map.sessionexpires+1).clearContent(); }
  return {success:true};
}

function requireSuperAdmin_() {
  const profile = getCurrentUserProfile_();
  if (!profile.found || !profile.active || normalizeRole_(profile.role) !== "SUPER_ADMIN") throw new Error("Akses hanya tersedia untuk Super Admin.");
  return profile;
}
function listPendingUsers_() {
  requireSuperAdmin_();
  const sheet=ensureUsersSheet_(), values=sheet.getDataRange().getDisplayValues();
  if(values.length<2) return {success:true,users:[]};
  const map=userHeaderMap_(values[0]), users=[];
  for(let r=1;r<values.length;r++) {
    const row=values[r]; if(String(row[map.status]||"").trim().toUpperCase()!=="PENDING") continue;
    users.push({userId:String(row[map.userid]||"").trim(),email:String(row[map.email]||"").trim(),name:String(row[map.name]||"").trim(),phone:String(row[map.phone]||"").trim(),createdAt:String(row[map.createdat]||"").trim()});
  }
  return {success:true,users:users};
}
function reviewPendingUser_(body) {
  const admin=requireSuperAdmin_(), email=String(body.email||"").trim().toLowerCase(), decision=String(body.decision||"").trim().toUpperCase(), role=normalizeRole_(body.role||"BUYER");
  if(!email) throw new Error("Email pengguna wajib diisi.");
  if(["APPROVE","REJECT"].indexOf(decision)<0) throw new Error("Keputusan approval tidak valid.");
  if(decision==="APPROVE" && ["SUPER_ADMIN","PROCUREMENT_ADMIN","BUYER","CONTRACT","VENDOR"].indexOf(role)<0) throw new Error("Role pengguna tidak valid.");
  const record=userRecordByEmail_(email); if(!record) throw new Error("Pengguna tidak ditemukan.");
  if(String(record.values[record.map.status]||"").trim().toUpperCase()!=="PENDING") throw new Error("Pendaftaran ini sudah diproses.");
  const set=function(key,value){if(record.map[key]>=0) record.sheet.getRange(record.row,record.map[key]+1).setValue(value);};
  if(decision==="APPROVE") { set("role",role); set("companyid",String(body.companyId||(role==="BUYER"?"INTERNAL":"")).trim()); set("status","APPROVED"); set("active",true); }
  else { set("role",""); set("companyid",""); set("status","REJECTED"); set("active",false); }
  set("approvedat",new Date()); set("approvedby",admin.email||admin.name||"SUPER_ADMIN");
  return {success:true,message:decision==="APPROVE"?"Akun berhasil disetujui.":"Pendaftaran berhasil ditolak."};
}

function getCurrentUserProfile_() {
  const tokenRecord = userRecordByToken_(CURRENT_REQUEST_AUTH_TOKEN);
  if (tokenRecord) return profileFromUserRecord_(tokenRecord);
  const email = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  const result = {
    success: true,
    email: email,
    name: "",
    phone: "",
    role: "",
    companyId: "",
    active: false,
    found: false,
    permissions: []
  };

  const sheet = getSpreadsheet_(USERS_SHEET_NAME).getSheetByName(USERS_SHEET_NAME);
  if (sheet && sheet.getLastRow() >= 2) {
    const values = sheet.getDataRange().getDisplayValues();
    const headers = values[0].map(function (h) {
      return String(h || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
    });
    const emailCol = headers.indexOf("email");
    const nameCol = headers.indexOf("name");
    const phoneCol = headers.indexOf("phone");
    const roleCol = headers.indexOf("role");
    const companyCol = headers.indexOf("companyid") >= 0
      ? headers.indexOf("companyid")
      : headers.indexOf("nocompany");
    const activeCol = headers.indexOf("active");

    if (email && emailCol >= 0) {
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][emailCol] || "").trim().toLowerCase() !== email) continue;

        result.found = true;
        result.name = nameCol >= 0 ? String(values[i][nameCol] || "").trim() : "";
        result.phone = phoneCol >= 0 ? String(values[i][phoneCol] || "").trim() : "";
        result.role = normalizeRole_(roleCol >= 0 ? values[i][roleCol] : "BUYER") || "BUYER";
        result.companyId = companyCol >= 0 ? String(values[i][companyCol] || "").trim() : "";
        result.active = activeCol >= 0 ? parseActiveFlag_(values[i][activeCol], true) : true;
        break;
      }
    }
  }

  if (
    APP_ENV === "DEVELOPMENT" &&
    email &&
    DEVELOPMENT_ADMIN_EMAILS.indexOf(email) >= 0
  ) {
    result.found = true;
    result.role = "SUPER_ADMIN";
    result.active = true;
  }

  result.permissions = permissionsForRole_(result.role);
  return result;
}

function authorizeAction_(action, payload) {
  if (!ROLE_ENFORCEMENT_ENABLED) {
    return getCurrentUserProfile_();
  }

  const profile = getCurrentUserProfile_();
  if (!profile.email) {
    throw new Error("Login diperlukan. Gunakan akun perusahaan yang terdaftar.");
  }
  if (!profile.found || !profile.active) {
    throw new Error("Akun belum terdaftar atau sudah dinonaktifkan.");
  }

  const permission = ACTION_PERMISSIONS[String(action || "").trim()] || "";
  if (permission && !roleHasPermission_(profile, permission)) {
    throw new Error(
      "Akses ditolak untuk role " + (profile.role || "UNKNOWN") +
      ". Permission yang diperlukan: " + permission + "."
    );
  }
  return profile;
}

function authorizeRead_(resource, sheetName) {
  if (!ROLE_ENFORCEMENT_ENABLED) return getCurrentUserProfile_();

  const profile = getCurrentUserProfile_();
  if (!profile.email) throw new Error("Login diperlukan.");
  if (!profile.found || !profile.active) throw new Error("Akun tidak aktif atau belum terdaftar.");

  if (resource === "sheet") {
    const name = String(sheetName || "").trim();
    if (name === DEFAULT_SHEET_NAME) {
      if (
        !roleHasPermission_(profile, "procurement.view_all") &&
        !roleHasPermission_(profile, "procurement.view_own")
      ) throw new Error("Anda tidak memiliki akses ke data Procurement.");
    } else if (name === DEFAULT_COMPANY_SHEET_NAME) {
      if (
        !roleHasPermission_(profile, "company.view") &&
        !roleHasPermission_(profile, "company.view_own")
      ) throw new Error("Anda tidak memiliki akses ke data Company.");
    } else if (name === "Contract") {
      if (!roleHasPermission_(profile, "contract.view")) {
        throw new Error("Anda tidak memiliki akses ke data Contract.");
      }
    } else if (name === "Agreement Tracker") {
      if (!roleHasPermission_(profile, "agreement.tracker.view")) {
        throw new Error("Anda tidak memiliki akses ke Agreement Tracker.");
      }
    }
  }

  if (resource === "workspace" && !roleHasPermission_(profile, "workspace.manage")) {
    throw new Error("Anda tidak memiliki akses ke workspace Procurement.");
  }
  if (resource === "activity" && !roleHasPermission_(profile, "activity.view")) {
    throw new Error("Anda tidak memiliki akses ke Recent Activity.");
  }
  if (resource === "agreementTracker" && !roleHasPermission_(profile, "agreement.tracker.view")) {
    throw new Error("Anda tidak memiliki akses ke Agreement Tracker.");
  }
  return profile;
}

function isAllowedClientSheet_(sheetName) {
  return CLIENT_SHEET_WHITELIST.indexOf(String(sheetName || "").trim()) >= 0;
}

function assertAllowedClientSheet_(sheetName) {
  const name = String(sheetName || "").trim();
  if (!isAllowedClientSheet_(name)) {
    throw new Error("Akses langsung ke sheet '" + name + "' tidak diizinkan.");
  }
  return name;
}

function actionNeedsScriptLock_(action, body) {
  const readOnlyActions = [
    "getFolderStructure",
    "GET_PROCUREMENT_DOCUMENTS",
    "LIST_PROCUREMENT_FILES",
    "LOOKUP_ITEM_NUMBER",
    "MIGRATE_PROCUREMENT_IDENTIFIERS"
  ];
  if (readOnlyActions.indexOf(String(action || "").trim()) >= 0) return false;
  return Boolean(action || (body && body.sheet && Array.isArray(body.rows)));
}

// Referensi historis Item Number untuk RFQ (read-only lookup).
// Spreadsheet sumber tidak diubah oleh E-Procurement.
const ITEM_REFERENCE_SPREADSHEET_ID = scriptProperty_("ITEM_REFERENCE_SPREADSHEET_ID", "");
const ITEM_REFERENCE_PREFERRED_SHEETS = ["Report", "List of WS"];
const ITEM_REFERENCE_REPORT_GID = 1701097814;
const ITEM_REFERENCE_LIST_WS_GID = 0;

// DEVELOPMENT tetap dapat dipakai oleh admin untuk stabilisasi.
// STAGING/PRODUCTION sebaiknya mengaktifkan ROLE_ENFORCEMENT_ENABLED.
const MULTI_USER_FOUNDATION_ENABLED = true;
const ROLE_ENFORCEMENT_ENABLED = APP_ENV === "PRODUCTION"
  ? true
  : scriptBooleanProperty_("ROLE_ENFORCEMENT_ENABLED", true);

const DEVELOPMENT_ADMIN_EMAILS = scriptProperty_(
  "DEVELOPMENT_ADMIN_EMAILS",
  ""
).split(",").map(function (email) {
  return String(email || "").trim().toLowerCase();
}).filter(Boolean);

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ["*"],
  PROCUREMENT_ADMIN: [
    "company.view", "company.edit_own", "company.manage",
    "workspace.manage", "document.manage",
    "activity.view", "activity.write",
    "ai.admin_reminder", "vendor.request.manage",
    "procurement.overdue.view_all"
  ],
  BUYER: [
    "procurement.view_own", "procurement.create", "procurement.edit_own",
    "procurement.import_own", "company.view", "vendor.view", "vendor.request.create",
    "workspace.manage", "document.manage", "activity.view", "activity.write", "contract.view"
  ],
  CONTRACT: [
    "company.view", "contract.view", "contract.manage",
    "agreement.tracker.view", "agreement.tracker.manage",
    "activity.view", "activity.write"
  ],
  VENDOR: [
    "company.view_own", "company.edit_own"
  ]
};

const ACTION_PERMISSIONS = {
  ADD: "procurement.create",
  EDIT: "procurement.edit_all|procurement.edit_own",
  DELETE: "procurement.delete",
  DELETE_ROW: "procurement.delete",
  BATCH_REPLACE_PROCUREMENT: "procurement.import",
  BATCH_IMPORT_PROCUREMENT_BY_BUYER: "procurement.import|procurement.import_own",
  NORMALIZE_PROCUREMENT_DATES: "procurement.import",
  MIGRATE_PROCUREMENT_IDENTIFIERS: "procurement.import",

  ADD_COMPANY: "company.manage",
  EDIT_COMPANY: "company.manage|company.edit_own",
  DELETE_COMPANY: "company.manage",

  REPLACE_CONTRACTS: "contract.manage",
  REPLACE_AGREEMENT_TRACKER: "agreement.tracker.manage",
  ADD_AGREEMENT_TRACKER: "agreement.tracker.manage",
  EDIT_AGREEMENT_TRACKER: "agreement.tracker.manage",
  DELETE_AGREEMENT_TRACKER: "agreement.tracker.manage",

  SAVE_WORKSPACE: "workspace.manage",
  SAVE_BIDDERLIST_TO_PROCUREMENT: "procurement.edit_all|procurement.edit_own",
  SAVE_REBID_REQUEST: "procurement.edit_all|procurement.edit_own",

  createFolder: "document.manage",
  ensureFolderStructure: "document.manage",
  uploadFile: "document.manage",
  exportPdf: "document.manage",
  CREATE_OUTLOOK_DRAFT_EML: "document.manage",
  getFolderStructure: "document.manage",
  GET_PROCUREMENT_DOCUMENTS: "document.manage",
  LIST_PROCUREMENT_FILES: "document.manage",
  LOOKUP_ITEM_NUMBER: "workspace.manage",

  LOG_ACTIVITY: "activity.write"
};

const CLIENT_SHEET_WHITELIST = [
  DEFAULT_SHEET_NAME,
  DEFAULT_COMPANY_SHEET_NAME,
  "Contract",
  "Agreement Tracker"
];

const PROCUREMENT_METADATA_HEADERS = [
  "Procurement ID",
  "Owner Name",
  "Owner NIP",
  "Owner Email",
  "Version",
  "Created At",
  "Created By",
  "Updated At",
  "Updated By"
];

const PROCUREMENT_SYSTEM_HEADERS = [
  "PR Year",
  "USD/IDR Rate",
  "USD/IDR Rate Date",
  "USD/IDR Source",
  "USD/IDR Locked",
  "BidderList Saved Date",
  "BidderList Saved By"
];

// Format tanggal bisnis Procurement di Google Sheet.
// Nilai disimpan sebagai Date asli agar Add, Edit, dan Import konsisten.
const PROCUREMENT_DATE_NUMBER_FORMAT = "dd mmm yyyy";
const PROCUREMENT_DATE_HEADER_KEYS = {
  assigndate: true,
  assignpr: true,
  assignprdate: true,
  usdidrratedate: true,
  cqscreatedate: true,
  cqscreateddate: true,
  cqsapprovaldate: true,
  pocreatedate: true,
  podeldate: true,
  podeliverydate: true,
  actualporeleasedate: true,
  actualpodeldate: true,
  actualpodeliverydate: true,
  actualreceivedpo: true,
  actualreceivedpogrndate: true,
  grndate: true
};

const PROCUREMENT_MAIN_FOLDERS = [
  "01. PR Approval",
  "02. Bidderlist",
  "03. CQS",
  "04. PO",
  "05. Contract"
];

// Semua round berada dalam folder dokumen yang sama. R0/R1/R2 dan round
// lanjutan dibedakan melalui nama file, bukan subfolder Drive.
const PROCUREMENT_ROUND_FOLDERS = {};


/* =========================================================
   AGREEMENT TRACKER
========================================================= */
const AGREEMENT_TRACKER_HEADERS = ["Work Order","Description","Vendor","Buyer","User","Assigned To","Start Date","Due Date","% Complete","Status","Remarks","To Do"];
function ensureAgreementTrackerSheet_(){
  const ss=getSpreadsheet_("Agreement Tracker");
  let sheet=ss.getSheetByName("Agreement Tracker");

  // Spreadsheet Agreement Tracker pengguna menunjuk ke gid=0. Jika tab pertama
  // masih bernama Sheet1/nama lain, gunakan tab gid=0 tersebut dan ubah namanya
  // menjadi Agreement Tracker agar load/import/edit/delete selalu menuju tab yang sama.
  if(!sheet){
    const sheets=ss.getSheets();
    for(let i=0;i<sheets.length;i++){
      if(Number(sheets[i].getSheetId())===0){ sheet=sheets[i]; break; }
    }
    if(!sheet && sheets.length) sheet=sheets[0];
    if(sheet) sheet.setName("Agreement Tracker");
    else sheet=ss.insertSheet("Agreement Tracker");
  }

  if(sheet.getLastRow()===0) sheet.getRange(1,1,1,AGREEMENT_TRACKER_HEADERS.length).setValues([AGREEMENT_TRACKER_HEADERS]);
  else {
    const headers=sheet.getRange(1,1,1,Math.max(sheet.getLastColumn(),1)).getDisplayValues()[0];
    if(!headers.some(h=>String(h||"").trim())) sheet.getRange(1,1,1,AGREEMENT_TRACKER_HEADERS.length).setValues([AGREEMENT_TRACKER_HEADERS]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}
function listAgreementUsers_(){
  const sheet=ensureUsersSheet_(); const values=sheet.getDataRange().getDisplayValues();
  if(values.length<2)return {success:true,users:[]};
  const map=userHeaderMap_(values[0]), users=[];
  for(let i=1;i<values.length;i++){
    const r=values[i], name=String(r[map.name]||"").trim(), email=String(r[map.email]||"").trim(), role=normalizeRole_(r[map.role]||"");
    const active=parseActiveFlag_(r[map.active],true), status=String(r[map.status]||"").trim().toUpperCase();
    if(!name || !active || (status && status!=="APPROVED")) continue;
    users.push({name,email,role});
  }
  return {success:true,users:users};
}
function agreementRowValues_(data){
  return AGREEMENT_TRACKER_HEADERS.map(h=>h==="% Complete"?Math.max(0,Math.min(100,Number(data[h])||0)):String(data[h]??""));
}
function addAgreementTracker_(data){
  const sheet=ensureAgreementTrackerSheet_(); const work=String(data["Work Order"]||"").trim();
  if(!work) throw new Error("Work Order wajib diisi.");
  const values=sheet.getDataRange().getDisplayValues();
  // Idempotent seperti save modul lain: replay Pending Sync tidak membuat error/duplikat.
  for(let i=1;i<values.length;i++){
    if(String(values[i][0]||"").trim().toLowerCase()===work.toLowerCase()){
      sheet.getRange(i+1,1,1,AGREEMENT_TRACKER_HEADERS.length).setValues([agreementRowValues_(data)]);
      return {success:true,message:"Agreement Tracker sudah ada dan telah disinkronkan.",rowCount:sheet.getLastRow()-1,revision:bumpSheetRevision_(sheet.getName())};
    }
  }
  sheet.appendRow(agreementRowValues_(data));
  return {success:true,message:"Agreement Tracker berhasil ditambahkan.",rowCount:sheet.getLastRow()-1,revision:bumpSheetRevision_(sheet.getName())};
}
function findAgreementRow_(values, workOrder, description){
  const targetWork=String(workOrder||"").trim().toLowerCase();
  const targetDesc=String(description||"").trim().toLowerCase();
  for(let i=1;i<values.length;i++){
    const rowWork=String(values[i][0]||"").trim().toLowerCase();
    const rowDesc=String(values[i][1]||"").trim().toLowerCase();
    if(targetWork && rowWork===targetWork)return i+1;
    if(!targetWork && targetDesc && !rowWork && rowDesc===targetDesc)return i+1;
  }
  return -1;
}
function editAgreementTracker_(data, originalWorkOrder, originalDescription){
  const sheet=ensureAgreementTrackerSheet_(); const old=String(originalWorkOrder||"").trim(); const work=String(data["Work Order"]||"").trim();
  const values=sheet.getDataRange().getDisplayValues();
  let rowNumber=findAgreementRow_(values,old,originalDescription);
  // Kompatibilitas Pending Sync versi lama: bila identitas lama tidak ditemukan,
  // cari Work Order terbaru. Jika tetap tidak ada, perlakukan sebagai Add (upsert).
  if(rowNumber<0 && work) rowNumber=findAgreementRow_(values,work,data["Description"]||"");
  if(rowNumber<0){
    if(!work) throw new Error("Work Order wajib diisi.");
    sheet.appendRow(agreementRowValues_(data));
    return {success:true,message:"Agreement Tracker berhasil disinkronkan sebagai data baru.",revision:bumpSheetRevision_(sheet.getName())};
  }
  if(work){for(let i=1;i<values.length;i++) if(i+1!==rowNumber && String(values[i][0]||"").trim().toLowerCase()===work.toLowerCase()) throw new Error("Work Order baru sudah digunakan.");}
  sheet.getRange(rowNumber,1,1,AGREEMENT_TRACKER_HEADERS.length).setValues([agreementRowValues_(data)]);
  return {success:true,message:"Agreement Tracker berhasil diperbarui.",revision:bumpSheetRevision_(sheet.getName())};
}
function deleteAgreementTracker_(workOrder, description){
  const sheet=ensureAgreementTrackerSheet_(); const values=sheet.getDataRange().getDisplayValues();
  const rowNumber=findAgreementRow_(values,workOrder,description);
  if(rowNumber>0){sheet.deleteRow(rowNumber);return {success:true,message:"Agreement Tracker berhasil dihapus.",revision:bumpSheetRevision_(sheet.getName())};}
  // Delete dibuat idempotent agar replay queue lama tidak gagal terus-menerus.
  return {success:true,message:"Agreement Tracker sudah tidak ada; tidak ada perubahan tambahan.",revision:getSheetRevision_(sheet.getName())};
}

/* =========================================================
   WEB APP ENTRY POINT
========================================================= */

function doGet(e) {
  try {
    CURRENT_REQUEST_AUTH_TOKEN = String((e && e.parameter && e.parameter.authToken) || "").trim();
    e = e || {};
    e.parameter = e.parameter || {};

    const action = String(e.parameter.action || "").trim();

    if (action === "loadAll") {
      authorizeRead_("sheet", DEFAULT_SHEET_NAME);
      return jsonOutput_(loadAllData_());
    }

    if (action === "GET_OVERDUE") {
      const profile = authorizeProcurementOverdueRead_();
      return jsonOutput_(loadProcurementOverdueData_(profile));
    }

    if (action === "loadWorkspace") {
      authorizeRead_("workspace");
      return jsonOutput_(loadWorkspaceData_(
        e.parameter.noPR || "",
        e.parameter.round || "R0",
        e.parameter.procurementId || ""
      ));
    }

    if (action === "loadRebidRequest") {
      authorizeRead_("workspace");
      return jsonOutput_(loadRebidRequest_(
        e.parameter.noPR || "",
        e.parameter.requestedRound || "R3"
      ));
    }

    if (action === "loadRecentActivity") {
      authorizeRead_("activity");
      return jsonOutput_(loadRecentActivity_(e.parameter.limit || 50));
    }

    if (action === "multiUserStatus") {
      return jsonOutput_({ success: true, status: "ONLINE", loginRequired: true });
    }

    if (action === "securityStatus") {
      requireSuperAdmin_();
      return jsonOutput_(productionSecurityStatus_());
    }

    if (action === "buildFileName") {
      return jsonOutput_({
        success: true,
        fileName: buildProcurementDocumentFileName_(
          e.parameter.documentType || "BIDDERLIST",
          e.parameter
        )
      });
    }

    if (action === "getUsdIdrRate") {
      return jsonOutput_(getUsdIdrRate_());
    }

    if (action === "getCurrentUserProfile") {
      return jsonOutput_(getCurrentUserProfile_());
    }

    if (action === "listAgreementUsers") {
      authorizeRead_("agreementTracker");
      return jsonOutput_(listAgreementUsers_());
    }

    if (action === "listPendingUsers") {
      return jsonOutput_(listPendingUsers_());
    }

    if (action === "LIST_VENDOR_REQUESTS") {
      return jsonOutput_(listVendorRequests_());
    }

    if (action === "getMasterTemplate") {
      authorizeRead_("workspace");
      return jsonOutput_(getMasterTemplate_(
        e.parameter.templateType ||
        e.parameter.type ||
        e.parameter.fileName ||
        ""
      ));
    }

    if (action === "listMasterTemplates") {
      authorizeRead_("workspace");
      return jsonOutput_(listMasterTemplates_());
    }

    // Dipakai untuk mengecek apakah Web App online.
    if (!e.parameter.sheet) {
      return jsonOutput_({
        success: true,
        status: "ONLINE",
        loginRequired: true,
        timestamp: new Date().toISOString()
      });
    }

    const sheetName = assertAllowedClientSheet_(
      String(e.parameter.sheet || DEFAULT_SHEET_NAME).trim()
    );
    const profile = authorizeRead_("sheet", sheetName);
    return jsonOutput_(loadSheetData_(sheetName, profile));

  } catch (error) {
    return jsonOutput_({
      success: false,
      message: errorMessage_(error),
      rows: []
    });
  }
}

function doPost(e) {
  let lock = null;
  let body = {};
  let effectiveAction = "";
  let profile = null;

  try {
    const bodyText = e && e.postData ? e.postData.contents : "{}";
    if (String(bodyText || "").length > MAX_POST_BODY_CHARS) {
      throw new Error("Payload terlalu besar. Batas request adalah sekitar 15 MB.");
    }
    body = JSON.parse(bodyText || "{}");
    const action = String(body.action || "").trim();
    CURRENT_REQUEST_AUTH_TOKEN = String(body.authToken || "").trim();

    if (action === "REGISTER_USER") return jsonOutput_(registerUser_(body));
    if (action === "LOGIN_USER") return jsonOutput_(loginUser_(body));
    if (action === "LOGOUT_USER") return jsonOutput_(logoutUser_(body));
    if (action === "REVIEW_PENDING_USER") return jsonOutput_(reviewPendingUser_(body));
    if (action === "CREATE_VENDOR_REQUEST") return jsonOutput_(createVendorRequest_(body));
    if (action === "UPDATE_VENDOR_REQUEST") return jsonOutput_(updateVendorRequest_(body));
    if (action === "MARK_VENDOR_NOTIFICATIONS_READ") return jsonOutput_(markVendorNotificationsRead_());

    if (body.sheet) assertAllowedClientSheet_(body.sheet);

    // Payload sinkronisasi lama tanpa action tetap diperlakukan sebagai import.
    effectiveAction = action || (
      body.sheet && Array.isArray(body.rows)
        ? (String(body.sheet).trim() === DEFAULT_SHEET_NAME
          ? "BATCH_REPLACE_PROCUREMENT"
          : (String(body.sheet).trim() === "Contract"
            ? "REPLACE_CONTRACTS"
            : "ADD_COMPANY"))
        : ""
    );
    profile = authorizeAction_(effectiveAction, body);

    // Lock hanya dipakai untuk operasi yang benar-benar mengubah data.
    // Lookup/list tidak lagi menahan seluruh request pengguna lain.
    if (actionNeedsScriptLock_(effectiveAction, body)) {
      lock = LockService.getScriptLock();
      lock.waitLock(30000);
    }

    // --------------------------
    // Folder Manager
    // --------------------------
    if (action === "createFolder" || action === "ensureFolderStructure") {
      return auditedJsonOutput_(effectiveAction, body, profile, ensureProcurementFolderStructure_(body));
    }

    if (action === "getFolderStructure") {
      return auditedJsonOutput_(effectiveAction, body, profile, getProcurementFolderStructure_(body));
    }

    if (action === "uploadFile") {
      return auditedJsonOutput_(effectiveAction, body, profile, uploadProcurementFile_(body));
    }

    if (action === "exportPdf") {
      return auditedJsonOutput_(effectiveAction, body, profile, exportXlsxAsPdf_(body));
    }

    if (action === "CREATE_OUTLOOK_DRAFT_EML") {
      return auditedJsonOutput_(effectiveAction, body, profile, createOutlookDraftEml_(body));
    }

    if (action === "GET_PROCUREMENT_DOCUMENTS") {
      return auditedJsonOutput_(effectiveAction, body, profile, getProcurementDocuments_(body));
    }

    if (action === "LIST_PROCUREMENT_FILES") {
      return auditedJsonOutput_(effectiveAction, body, profile, listProcurementFiles_(body));
    }

    if (action === "LOOKUP_ITEM_NUMBER") {
      return auditedJsonOutput_(effectiveAction, body, profile, lookupItemNumberReference_(body.itemNumber || ""));
    }

    if (action === "SAVE_WORKSPACE") {
      return auditedJsonOutput_(effectiveAction, body, profile, saveWorkspaceData_(body));
    }

    if (action === "SAVE_BIDDERLIST_TO_PROCUREMENT") {
      return auditedJsonOutput_(effectiveAction, body, profile, saveBidderListToProcurement_(body));
    }

    if (action === "SAVE_REBID_REQUEST") {
      return auditedJsonOutput_(effectiveAction, body, profile, saveRebidRequest_(body));
    }

    if (action === "LOG_ACTIVITY") {
      return auditedJsonOutput_(effectiveAction, body, profile, logRecentActivity_(body.activity || body));
    }

    // --------------------------
    // Company
    // --------------------------
    if (action === "ADD_COMPANY") {
      return auditedJsonOutput_(effectiveAction, body, profile, addCompanyRow_(
        getSheetOrThrow_(body.sheet || DEFAULT_COMPANY_SHEET_NAME),
        body.row || {}
      ));
    }

    if (action === "EDIT_COMPANY") {
      return auditedJsonOutput_(effectiveAction, body, profile, editCompanyRow_(
        getSheetOrThrow_(body.sheet || DEFAULT_COMPANY_SHEET_NAME),
        body.row || {},
        body.originalNoCompany
      ));
    }

    if (action === "DELETE_COMPANY") {
      return auditedJsonOutput_(effectiveAction, body, profile, deleteCompanyRow_(
        getSheetOrThrow_(body.sheet || DEFAULT_COMPANY_SHEET_NAME),
        body.originalNoCompany || body.noCompany
      ));
    }

    // --------------------------
    // Procurement
    // --------------------------
    if (action === "ADD") {
      return auditedJsonOutput_(effectiveAction, body, profile, addProcurement_(
        getSheetOrThrow_(body.sheet || DEFAULT_SHEET_NAME),
        body.data || {}
      ));
    }

    if (action === "EDIT") {
      return auditedJsonOutput_(effectiveAction, body, profile, editProcurement_(
        getSheetOrThrow_(body.sheet || DEFAULT_SHEET_NAME),
        body.data || {},
        body.originalPR
      ));
    }

    if (action === "DELETE" || action === "DELETE_ROW") {
      return auditedJsonOutput_(effectiveAction, body, profile, deleteProcurement_(
        getSheetOrThrow_(body.sheet || DEFAULT_SHEET_NAME),
        body.originalPR || body.noPR,
        body.procurementId || body["Procurement ID"] || "",
        body.assignPRDate || body.assignprdate || ""
      ));
    }

    if (action === "BATCH_REPLACE_PROCUREMENT") {
      return auditedJsonOutput_(effectiveAction, body, profile, replaceProcurementRowsSafely_(
        getSheetOrThrow_(body.sheet || DEFAULT_SHEET_NAME),
        Array.isArray(body.rows) ? body.rows : [],
        body.expectedRevision
      ));
    }

    if (action === "BATCH_IMPORT_PROCUREMENT_BY_BUYER") {
      return auditedJsonOutput_(effectiveAction, body, profile, importProcurementRowsByBuyer_(
        getSheetOrThrow_(body.sheet || DEFAULT_SHEET_NAME),
        Array.isArray(body.rows) ? body.rows : [],
        body.expectedRevision
      ));
    }

    if (action === "NORMALIZE_PROCUREMENT_DATES") {
      const targetSheet = getSheetOrThrow_(body.sheet || DEFAULT_SHEET_NAME);
      const result = normalizeExistingProcurementDates_(targetSheet);
      PropertiesService.getScriptProperties().setProperty(
        procurementDateMigrationKey_(targetSheet),
        "1"
      );
      return auditedJsonOutput_(effectiveAction, body, profile, result);
    }

    if (action === "MIGRATE_PROCUREMENT_IDENTIFIERS") {
      const targetSheet = getSheetOrThrow_(body.sheet || DEFAULT_SHEET_NAME);
      const headers = ensureProcurementMetadataColumns_(targetSheet);
      return auditedJsonOutput_(effectiveAction, body, profile, Object.assign(
        { success: true, message: "Migrasi Procurement ID dan PR Year selesai." },
        ensureProcurementIdentifierMigration_(targetSheet, headers, true)
      ));
    }

    // --------------------------
    // Agreement Tracker
    // --------------------------
    if (action === "ADD_AGREEMENT_TRACKER") {
      return auditedJsonOutput_(effectiveAction, body, profile, addAgreementTracker_(body.data || {}));
    }
    if (action === "EDIT_AGREEMENT_TRACKER") {
      return auditedJsonOutput_(effectiveAction, body, profile, editAgreementTracker_(body.data || {}, body.originalWorkOrder || "", body.originalDescription || ""));
    }
    if (action === "DELETE_AGREEMENT_TRACKER") {
      return auditedJsonOutput_(effectiveAction, body, profile, deleteAgreementTracker_(body.originalWorkOrder || "", body.originalDescription || ""));
    }
    if (action === "REPLACE_AGREEMENT_TRACKER") {
      return auditedJsonOutput_(effectiveAction, body, profile, replaceRowsWithRevision_(
        body.sheet || "Agreement Tracker",
        Array.isArray(body.rows) ? body.rows : [],
        body.expectedRevision,
        "Agreement Tracker"
      ));
    }

    // --------------------------
    // Contract Management
    // --------------------------
    if (action === "REPLACE_CONTRACTS") {
      return auditedJsonOutput_(effectiveAction, body, profile, replaceRowsWithRevision_(
        body.sheet || "Contract",
        Array.isArray(body.rows) ? body.rows : [],
        body.expectedRevision,
        "Contract"
      ));
    }

    // --------------------------
    // Sinkronisasi seluruh data.
    // Digunakan oleh Procurement Admin versi terbaru.
    // --------------------------
    if (body.sheet && Array.isArray(body.rows)) {
      if (String(body.sheet).trim() === DEFAULT_SHEET_NAME) {
        return auditedJsonOutput_(effectiveAction, body, profile, replaceProcurementRowsSafely_(
          getSheetOrThrow_(body.sheet),
          body.rows,
          body.expectedRevision
        ));
      }
      return auditedJsonOutput_(effectiveAction, body, profile, saveRowsToSheet_(body.sheet, body.rows));
    }

    return auditedJsonOutput_(effectiveAction, body, profile, {
      success: false,
      message: "Action atau payload tidak dikenali."
    });

  } catch (error) {
    const failure = {
      success: false,
      message: errorMessage_(error)
    };
    try {
      writeAuditLog_(effectiveAction || String(body.action || ""), body, profile, failure);
    } catch (ignoreAuditFailure) {}
    return jsonOutput_(failure);

  } finally {
    try { SpreadsheetApp.flush(); } catch (ignoreFlush) {}
    if (lock) {
      try { lock.releaseLock(); } catch (ignore) {}
    }
  }
}

/* =========================================================
   RFQ ITEM NUMBER REFERENCE (READ-ONLY)
========================================================= */

function lookupItemNumberReference_(itemNumber) {
  const requested = String(itemNumber == null ? "" : itemNumber).trim();
  if (!requested) {
    return { success: false, found: false, message: "Item Number wajib diisi." };
  }

  const referenceBook = SpreadsheetApp.openById(requiredScriptProperty_("ITEM_REFERENCE_SPREADSHEET_ID"));
  const reportSheet = getReferenceSheetByIdOrName_(
    referenceBook,
    ITEM_REFERENCE_REPORT_GID,
    ["Report"]
  );
  const listOfWSSheet = getReferenceSheetByIdOrName_(
    referenceBook,
    ITEM_REFERENCE_LIST_WS_GID,
    ["List of WS"]
  );

  const reportResult = lookupClosedReportItem_(reportSheet, requested);
  const commodityResult = lookupCommodityWHS_(listOfWSSheet, requested);
  const companyName = reportResult ? reportResult.vendorName : "";
  const noCompany = companyName
    ? (findVendorNoCompanyByName_(companyName) || "New Vendor")
    : "";

  const found = Boolean(reportResult || commodityResult.found);
  const messageParts = [];
  if (!reportResult) messageParts.push("Riwayat berstatus CLOSE tidak ditemukan pada Report.");
  if (!commodityResult.found) messageParts.push("Item Number tidak ditemukan pada List of WS.");

  return {
    success: true,
    found: found,
    itemNumber: requested,
    previousPrice: reportResult ? reportResult.unitCost : "",
    previousUnitPrice: reportResult ? reportResult.unitCost : "",
    previousDate: reportResult ? reportResult.exchangeDate : "",
    companyName: companyName,
    previousWinner: companyName,
    noCompany: noCompany,
    commodityWHS: commodityResult.value,
    previousCompany: reportResult ? buildPreviousCompanyDetail_(reportResult) : "",
    reportSource: reportResult
      ? reportSheet.getName() + "!" + reportResult.sourceRow
      : "",
    listOfWSSource: commodityResult.found
      ? listOfWSSheet.getName() + "!" + commodityResult.sourceRows.join(",")
      : "",
    checkedAt: new Date().toISOString(),
    message: messageParts.join(" ") || "Referensi Item Number ditemukan."
  };
}

function getReferenceSheetByIdOrName_(spreadsheet, gid, fallbackNames) {
  let sheet = null;
  try {
    sheet = spreadsheet.getSheetById(Number(gid));
  } catch (ignoreGetById) {}

  if (sheet) return sheet;

  const names = Array.isArray(fallbackNames) ? fallbackNames : [];
  for (let index = 0; index < names.length; index++) {
    sheet = spreadsheet.getSheetByName(names[index]);
    if (sheet) return sheet;
  }

  throw new Error(
    "Sheet referensi tidak ditemukan. GID: " + gid +
    (names.length ? ", nama: " + names.join("/") : "")
  );
}

function lookupClosedReportItem_(sheet, itemNumber) {
  if (!sheet) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return null;
  const values = sheet.getRange(1, 1, lastRow, 18).getDisplayValues();
  const target = normalizeItemReferenceKey_(itemNumber);
  const matches = [];

  // Mapping Report berdasarkan kolom tetap:
  // A prnum, B ponum, D itemnum, I unitcost, L status,
  // P Buyer Name, Q exchangedate, R vendorname.
  for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex] || [];
    const candidate = normalizeItemReferenceKey_(row[3]);
    if (!candidate || candidate !== target) continue;

    const status = String(row[11] == null ? "" : row[11]).trim().toUpperCase();
    if (status !== "CLOSE" && status !== "CLOSED") continue;

    matches.push({
      prNum: valueAtReferenceColumn_(row, 0),
      poNum: valueAtReferenceColumn_(row, 1),
      itemNum: valueAtReferenceColumn_(row, 3),
      unitCost: valueAtReferenceColumn_(row, 8),
      buyerName: valueAtReferenceColumn_(row, 15),
      exchangeDate: valueAtReferenceColumn_(row, 16),
      vendorName: valueAtReferenceColumn_(row, 17),
      sourceRow: rowIndex + 1
    });
  }

  if (!matches.length) return null;

  matches.sort(function (a, b) {
    const dateA = parseReferenceDate_(a.exchangeDate);
    const dateB = parseReferenceDate_(b.exchangeDate);
    if (dateA !== dateB) return dateB - dateA;
    return Number(b.sourceRow || 0) - Number(a.sourceRow || 0);
  });

  return matches[0];
}

function lookupCommodityWHS_(sheet, itemNumber) {
  if (!sheet) return { found: false, value: "", sourceRows: [] };

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return { found: false, value: "", sourceRows: [] };
  const values = sheet.getRange(1, 1, lastRow, 8).getDisplayValues();
  const target = normalizeItemReferenceKey_(itemNumber);
  const output = [];
  const sourceRows = [];

  // Mapping List of WS berdasarkan kolom tetap:
  // A Item Number, hasil gabungan E dan H dengan line break.
  for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex] || [];
    const candidate = normalizeItemReferenceKey_(row[0]);
    if (!candidate || candidate !== target) continue;

    [valueAtReferenceColumn_(row, 4), valueAtReferenceColumn_(row, 7)]
      .forEach(function (value) {
        const clean = String(value || "").trim();
        if (clean && output.indexOf(clean) < 0) output.push(clean);
      });

    sourceRows.push(rowIndex + 1);
  }

  return {
    found: sourceRows.length > 0,
    value: output.join("\n"),
    sourceRows: sourceRows
  };
}

function buildPreviousCompanyDetail_(record) {
  if (!record) return "";

  const firstLine = [record.prNum, record.buyerName]
    .filter(function (value) { return String(value || "").trim() !== ""; })
    .join(" - ");

  const detailLines = [
    record.poNum,
    record.itemNum,
    record.vendorName,
    record.unitCost,
    record.exchangeDate
  ].filter(function (value) {
    return String(value || "").trim() !== "";
  });

  const lines = [];
  if (firstLine) lines.push(firstLine);
  if (firstLine && detailLines.length) lines.push("");
  Array.prototype.push.apply(lines, detailLines);
  return lines.join("\n");
}

function findVendorNoCompanyByName_(companyName) {
  const key = normalizeCompanyLookupKey_(companyName);
  if (!key) return "";

  const sheet = getSpreadsheet_(DEFAULT_COMPANY_SHEET_NAME).getSheetByName(DEFAULT_COMPANY_SHEET_NAME);
  if (!sheet) return "";

  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return "";

  const maxHeaderRows = Math.min(values.length, 20);
  let headerRow = -1;
  let companyColumn = -1;
  let noCompanyColumn = -1;

  for (let rowIndex = 0; rowIndex < maxHeaderRows; rowIndex++) {
    const headers = values[rowIndex].map(normalizeReferenceHeader_);
    companyColumn = findReferenceAliasColumn_(headers, [
      "company name", "name of invited supplier", "vendor name", "supplier name", "company"
    ]);
    noCompanyColumn = findReferenceAliasColumn_(headers, [
      "no company", "company no", "vendor no", "no vendor", "nocompany"
    ]);
    if (companyColumn >= 0 && noCompanyColumn >= 0) {
      headerRow = rowIndex;
      break;
    }
  }

  if (headerRow < 0) return "";

  for (let rowIndex = headerRow + 1; rowIndex < values.length; rowIndex++) {
    const candidate = normalizeCompanyLookupKey_(values[rowIndex][companyColumn]);
    if (candidate && candidate === key) {
      return String(values[rowIndex][noCompanyColumn] || "").trim();
    }
  }

  return "";
}

function normalizeCompanyLookupKey_(value) {
  return String(value == null ? "" : value)
    .toUpperCase()
    .replace(/\b(PT|CV|TBK|PERSERO)\b/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function normalizeReferenceHeader_(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[\r\n_\-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findReferenceAliasColumn_(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeReferenceHeader_);
  for (let index = 0; index < headers.length; index++) {
    const header = headers[index];
    if (!header) continue;
    if (normalizedAliases.indexOf(header) >= 0) return index;
  }
  for (let index = 0; index < headers.length; index++) {
    const header = headers[index];
    if (!header) continue;
    for (let aliasIndex = 0; aliasIndex < normalizedAliases.length; aliasIndex++) {
      const alias = normalizedAliases[aliasIndex];
      if (alias && (header.indexOf(alias) >= 0 || alias.indexOf(header) >= 0)) return index;
    }
  }
  return -1;
}

function normalizeItemReferenceKey_(value) {
  return String(value == null ? "" : value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function valueAtReferenceColumn_(row, columnIndex) {
  return columnIndex >= 0
    ? String(row[columnIndex] == null ? "" : row[columnIndex]).trim()
    : "";
}

function parseReferenceDate_(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return 0;

  const direct = new Date(text).getTime();
  if (!isNaN(direct)) return direct;

  const match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!match) return 0;

  const year = Number(match[3]) < 100
    ? 2000 + Number(match[3])
    : Number(match[3]);

  return new Date(year, Number(match[2]) - 1, Number(match[1])).getTime() || 0;
}

/* =========================================================
   LOAD DATA
========================================================= */

function rowValueByAliases_(row, aliases) {
  const source = row || {};
  const keys = Object.keys(source);
  let fallback = "";
  for (let i = 0; i < aliases.length; i++) {
    const target = String(aliases[i] || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
    for (let k = 0; k < keys.length; k++) {
      const normalized = String(keys[k] || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
      if (normalized !== target) continue;
      const value = source[keys[k]];
      if (String(value == null ? "" : value).trim() !== "") return value;
      fallback = value;
    }
  }
  return fallback;
}

function assertCanEditProcurementRow_(headers, row) {
  if (!ROLE_ENFORCEMENT_ENABLED) return true;
  const profile = getCurrentUserProfile_();
  if (
    roleHasPermission_(profile, "procurement.edit_all") ||
    roleHasPermission_(profile, "*")
  ) return true;

  if (!roleHasPermission_(profile, "procurement.edit_own")) {
    throw new Error("Anda tidak memiliki akses edit Procurement.");
  }

  const object = {};
  headers.forEach(function (header, index) {
    if (header) object[header] = row[index];
  });
  const ownerEmail = String(rowValueByAliases_(object, [
    "Owner Email", "Created By", "Updated By"
  ]) || "").trim().toLowerCase();
  const ownerName = String(rowValueByAliases_(object, ["Owner Name"]) || "")
    .trim().toLowerCase();
  const currentEmail = String(profile.email || "").trim().toLowerCase();
  const currentName = String(profile.name || "").trim().toLowerCase();

  if (
    (currentEmail && ownerEmail === currentEmail) ||
    (currentName && ownerName === currentName)
  ) return true;

  throw new Error("Anda hanya dapat mengubah Procurement milik sendiri.");
}

function assertCanEditCompanyRow_(headers, row) {
  if (!ROLE_ENFORCEMENT_ENABLED) return true;
  const profile = getCurrentUserProfile_();
  if (roleHasPermission_(profile, "company.manage") || roleHasPermission_(profile, "*")) {
    return true;
  }
  if (!roleHasPermission_(profile, "company.edit_own")) {
    throw new Error("Anda tidak memiliki akses edit Company.");
  }

  const object = {};
  headers.forEach(function (header, index) {
    if (header) object[header] = row[index];
  });
  const companyId = String(rowValueByAliases_(object, [
    "No Company", "Company ID", "Vendor Code", "No_365"
  ]) || "").trim().toLowerCase();
  if (companyId && companyId === String(profile.companyId || "").trim().toLowerCase()) {
    return true;
  }
  throw new Error("Vendor hanya dapat mengubah profil perusahaannya sendiri.");
}

function filterRowsForProfile_(sheetName, rows, profile) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (!ROLE_ENFORCEMENT_ENABLED) return sourceRows;

  const current = profile || getCurrentUserProfile_();
  if (roleHasPermission_(current, "*")) return sourceRows;

  if (sheetName === DEFAULT_SHEET_NAME) {
    if (roleHasPermission_(current, "procurement.view_all")) return sourceRows;
    if (!roleHasPermission_(current, "procurement.view_own")) return [];

    const email = String(current.email || "").trim().toLowerCase();
    const name = String(current.name || "").trim().toLowerCase();
    return sourceRows.filter(function (row) {
      const ownerEmail = String(rowValueByAliases_(row, [
        "Owner Email", "Created By", "Updated By"
      ]) || "").trim().toLowerCase();
      const ownerName = String(rowValueByAliases_(row, ["Owner Name"]) || "").trim().toLowerCase();
      return Boolean(
        (email && ownerEmail === email) ||
        (name && ownerName === name)
      );
    });
  }

  if (sheetName === DEFAULT_COMPANY_SHEET_NAME) {
    if (roleHasPermission_(current, "company.view")) return sourceRows;
    if (!roleHasPermission_(current, "company.view_own")) return [];

    const companyId = String(current.companyId || "").trim().toLowerCase();
    if (!companyId) return [];
    return sourceRows.filter(function (row) {
      const id = String(rowValueByAliases_(row, [
        "No Company", "Company ID", "Vendor Code", "No_365"
      ]) || "").trim().toLowerCase();
      return id === companyId;
    });
  }

  return sourceRows;
}

function procurementOwnerKey_(value) {
  return String(value == null ? "" : value)
    .trim()
    .toUpperCase()
    .replace(/\s*\(?LINE\b.*$/i, "")
    .replace(/\s+/g, "");
}

function procurementUserNamesByEmail_() {
  const result = {};
  const usersSheet = getSpreadsheet_(USERS_SHEET_NAME).getSheetByName(USERS_SHEET_NAME);
  if (!usersSheet || usersSheet.getLastRow() < 2) return result;

  const values = usersSheet.getDataRange().getDisplayValues();
  const map = userHeaderMap_(values[0] || []);
  if (map.email == null || map.name == null) return result;

  values.slice(1).forEach(function (row) {
    const email = String(row[map.email] || "").trim().toLowerCase();
    const name = String(row[map.name] || "").trim();
    if (email && name) result[email] = name;
  });
  return result;
}

/**
 * Melengkapi Buyer pada seluruh line dengan No PR yang sama.
 * Prioritas sumber: Owner Name, lalu email kepemilikan yang dicocokkan ke Users.
 * PIC sengaja tidak digunakan karena PIC adalah Requestor.
 */
function enrichProcurementBuyerByPR_(rows) {
  const source = Array.isArray(rows) ? rows : [];
  const userNames = procurementUserNamesByEmail_();
  const ownerByPR = {};

  source.forEach(function (row) {
    const key = procurementOwnerKey_(rowValueByAliases_(row, ["No PR", "PR No", "PR Number"]));
    if (!key) return;
    const email = String(rowValueByAliases_(row, [
      "Owner Email", "Created By", "Updated By"
    ]) || "").trim().toLowerCase();
    const name = String(rowValueByAliases_(row, [
      "Owner Name", "Buyer (Ditambahkan)", "Buyer", "Buyer Name", "Signature Buyer"
    ]) || "").trim() || userNames[email] || "";
    if (!ownerByPR[key]) ownerByPR[key] = { name: name, email: email };
    if (!ownerByPR[key].name && name) ownerByPR[key].name = name;
    if (!ownerByPR[key].email && email) ownerByPR[key].email = email;
  });

  return source.map(function (row) {
    const key = procurementOwnerKey_(rowValueByAliases_(row, ["No PR", "PR No", "PR Number"]));
    const owner = ownerByPR[key] || {};
    const copy = Object.assign({}, row);
    const currentEmail = String(rowValueByAliases_(copy, [
      "Owner Email", "Created By", "Updated By"
    ]) || owner.email || "").trim().toLowerCase();
    const currentName = String(rowValueByAliases_(copy, [
      "Owner Name", "Buyer (Ditambahkan)", "Buyer", "Buyer Name", "Signature Buyer"
    ]) || "").trim();
    copy["Owner Email"] = String(copy["Owner Email"] || owner.email || currentEmail || "").trim();
    copy["Owner Name"] = currentName || owner.name || userNames[currentEmail] || "";
    return copy;
  });
}

function authorizeProcurementOverdueRead_() {
  if (!ROLE_ENFORCEMENT_ENABLED) return getCurrentUserProfile_();

  const profile = getCurrentUserProfile_();
  if (!profile.email) throw new Error("Login diperlukan.");
  if (!profile.found || !profile.active) throw new Error("Akun tidak aktif atau belum terdaftar.");

  const allowed =
    roleHasPermission_(profile, "*") ||
    roleHasPermission_(profile, "procurement.overdue.view_all") ||
    roleHasPermission_(profile, "procurement.view_all") ||
    roleHasPermission_(profile, "procurement.view_own");

  if (!allowed) throw new Error("Anda tidak memiliki akses ke data Overdue.");
  return profile;
}

function procurementOverdueDate_(row) {
  return rowValueByAliases_(row, [
    "Actual PO Del. Date", "Actual PO Delivery Date", "actualpodeldate"
  ]);
}

function isProcurementOverdueRow_(row) {
  const status = String(rowValueByAliases_(row, ["Status PR", "Status", "statuspr"]) || "").toLowerCase();
  const flow = String(rowValueByAliases_(row, ["Flow Process", "flowprocess"]) || "").toLowerCase();
  const grn = String(rowValueByAliases_(row, ["Actual Received PO (GRN Date)", "GRN Date", "actualreceivedpo"]) || "").trim();

  if (/cancel(?:led)?/.test(status + " " + flow)) return false;
  if (/completed/.test(flow)) return false;
  if (grn) return false;

  const rawDate = procurementOverdueDate_(row);
  if (rawDate == null || String(rawDate).trim() === "") return false;

  let parsed = parseProcurementDateValue_(rawDate);
  if (!(parsed instanceof Date) || isNaN(parsed.getTime())) {
    const fallback = new Date(String(rawDate));
    if (isNaN(fallback.getTime())) return false;
    parsed = fallback;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return parsed.getTime() < today.getTime();
}

function procurementOverduePublicRow_(row) {
  return {
    "No PR": String(rowValueByAliases_(row, ["No PR", "PR Number", "noPR"]) || "").trim(),
    "Description": String(rowValueByAliases_(row, ["Description"]) || "").trim(),
    "No PO": String(rowValueByAliases_(row, ["No PO", "PO Number", "nopo"]) || "").trim(),
    "Winner PO": String(rowValueByAliases_(row, ["Winner PO", "winnerpo", "Company"]) || "").trim(),
    "Actual PO Del. Date": String(procurementOverdueDate_(row) || "").trim(),
    "Assign Date": String(rowValueByAliases_(row, ["Assign Date", "Assign PR", "Assign PR Date", "assignprdate"]) || "").trim(),
    "Owner Name": String(rowValueByAliases_(row, ["Owner Name", "Buyer (Ditambahkan)", "Buyer", "Buyer Name", "Signature Buyer"]) || "").trim(),
    "Owner Email": String(rowValueByAliases_(row, ["Owner Email", "Created By", "Updated By"]) || "").trim()
  };
}

function loadProcurementOverdueData_(profile) {
  const sheet = getSpreadsheet_(DEFAULT_SHEET_NAME).getSheetByName(DEFAULT_SHEET_NAME);
  if (!sheet) return { success: false, message: "Sheet '" + DEFAULT_SHEET_NAME + "' tidak ditemukan.", rows: [] };

  if (MULTI_USER_FOUNDATION_ENABLED) {
    ensureProcurementMetadataColumns_(sheet);
    ensureProcurementDateMigration_(sheet);
  }

  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return { success: true, mtimeMs: Date.now(), rows: [] };

  const headers = values[0].map(function(header) { return String(header || "").trim(); });
  let rows = values.slice(1).filter(function(row) {
    return row.some(function(value) { return String(value || "").trim() !== ""; });
  }).map(function(row) {
    const object = {};
    headers.forEach(function(header, index) { if (header) object[header] = row[index] == null ? "" : row[index]; });
    return object;
  });

  rows = enrichProcurementBuyerByPR_(rows);

  if (!roleHasPermission_(profile, "*") &&
      !roleHasPermission_(profile, "procurement.overdue.view_all") &&
      !roleHasPermission_(profile, "procurement.view_all")) {
    rows = filterRowsForProfile_(DEFAULT_SHEET_NAME, rows, profile);
  }

  return {
    success: true,
    mtimeMs: Date.now(),
    revision: getSheetRevision_(DEFAULT_SHEET_NAME),
    rows: rows.filter(isProcurementOverdueRow_).map(procurementOverduePublicRow_)
  };
}

function loadSheetData_(sheetName, profile) {
  sheetName = assertAllowedClientSheet_(sheetName);
  const sheet = String(sheetName).trim().toLowerCase() === "agreement tracker"
    ? ensureAgreementTrackerSheet_()
    : getSpreadsheet_(sheetName).getSheetByName(sheetName);

  if (!sheet) {
    return {
      success: false,
      message: "Sheet '" + sheetName + "' tidak ditemukan.",
      rows: []
    };
  }

  if (sheetName === DEFAULT_SHEET_NAME && MULTI_USER_FOUNDATION_ENABLED) {
    ensureProcurementMetadataColumns_(sheet);
    ensureProcurementDateMigration_(sheet);
  }

  const values = sheet.getDataRange().getDisplayValues();

  if (!values.length || !values[0].some(function (value) {
    return String(value || "").trim() !== "";
  })) {
    return {
      success: true,
      mtimeMs: Date.now(),
      revision: getSheetRevision_(sheetName),
      rows: []
    };
  }

  const headers = values[0].map(function (header) {
    return String(header || "").trim();
  });

  const rows = values.slice(1)
    .filter(function (row) {
      return row.some(function (value) {
        return String(value || "").trim() !== "";
      });
    })
    .map(function (row) {
      const object = {};

      headers.forEach(function (header, index) {
        if (header) {
          object[header] = row[index] == null ? "" : row[index];
        }
      });

      return object;
    });

  const enrichedRows = sheetName === DEFAULT_SHEET_NAME
    ? enrichProcurementBuyerByPR_(rows)
    : rows;
  const visibleRows = filterRowsForProfile_(sheetName, enrichedRows, profile);
  return {
    success: true,
    mtimeMs: Date.now(),
    revision: getSheetRevision_(sheetName),
    rows: visibleRows
  };
}

function loadAllData_() {
  const result = {};
  const profile = getCurrentUserProfile_();

  CLIENT_SHEET_WHITELIST.forEach(function (sheetName) {
    try {
      authorizeRead_("sheet", sheetName);
      result[sheetName] = loadSheetData_(sheetName, profile).rows;
    } catch (ignoreUnauthorizedSheet) {
      result[sheetName] = [];
    }
  });

  return {
    success: true,
    mtimeMs: Date.now(),
    sheets: result
  };
}

/* =========================================================
   RECENT ACTIVITY
   Riwayat bersama untuk dashboard Quick Access.
========================================================= */

function getOrCreateRecentActivitySheet_() {
  const spreadsheet = getSpreadsheet_(RECENT_ACTIVITY_SHEET_NAME);
  let sheet = spreadsheet.getSheetByName(RECENT_ACTIVITY_SHEET_NAME);
  const headers = [
    "ID", "Timestamp", "Type", "No PR", "Document No",
    "Status", "Detail", "Round", "User", "File Name",
    "User Email", "User Role"
  ];

  if (!sheet) sheet = spreadsheet.insertSheet(RECENT_ACTIVITY_SHEET_NAME);

  // Selalu selaraskan header agar sheet lama 10 kolom otomatis mendapat
  // User Email dan User Role tanpa mengubah baris aktivitas yang sudah ada.
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  return sheet;
}

function cleanActivityText_(value, maxLength) {
  return String(value == null ? "" : value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Number(maxLength || 500));
}

function normalizeActivityType_(value) {
  const normalized = cleanActivityText_(value, 30).toUpperCase();
  const allowed = ["BIDDERLIST", "RFQ", "CQS", "PROCUREMENT", "CONTRACT", "AGREEMENT"];
  return allowed.indexOf(normalized) >= 0 ? normalized : "PROCUREMENT";
}

function logRecentActivity_(activity) {
  activity = activity || {};
  const sheet = getOrCreateRecentActivitySheet_();
  const now = new Date();
  const timestamp = cleanActivityText_(activity.timestamp, 50) || now.toISOString();
  const profile = getCurrentUserProfile_();
  const activeEmail = cleanActivityText_(profile.email || Session.getActiveUser().getEmail(), 160).toLowerCase();
  const activeRole = normalizeRole_(profile.role || activity.userRole || "");
  const user = cleanActivityText_(activity.user, 160) || cleanActivityText_(profile.name, 160) || activeEmail;
  const item = {
    id: cleanActivityText_(activity.id, 120) || Utilities.getUuid(),
    timestamp: timestamp,
    type: normalizeActivityType_(activity.type),
    noPR: cleanActivityText_(activity.noPR, 120),
    documentNo: cleanActivityText_(activity.documentNo, 180),
    status: cleanActivityText_(activity.status, 180) || "Updated",
    detail: cleanActivityText_(activity.detail, 500),
    round: cleanActivityText_(activity.round, 20).toUpperCase(),
    user: user,
    fileName: cleanActivityText_(activity.fileName, 240),
    userEmail: activeEmail,
    userRole: activeRole
  };

  sheet.appendRow([
    item.id, item.timestamp, item.type, item.noPR, item.documentNo,
    item.status, item.detail, item.round, item.user, item.fileName,
    item.userEmail, item.userRole
  ]);
  sheet.getRange(sheet.getLastRow(), 1, 1, 12).setNumberFormat("@");

  return {
    success: true,
    message: "Recent Activity berhasil dicatat.",
    activity: item
  };
}

function loadRecentActivity_(requestedLimit) {
  const spreadsheet = getSpreadsheet_(RECENT_ACTIVITY_SHEET_NAME);
  const sheet = spreadsheet.getSheetByName(RECENT_ACTIVITY_SHEET_NAME);
  const limit = Math.max(1, Math.min(100, Number(requestedLimit || 50)));
  const profile = getCurrentUserProfile_();
  const currentRole = normalizeRole_(profile.role || "");
  const currentEmail = String(profile.email || "").trim().toLowerCase();
  const currentName = String(profile.name || "").trim().toLowerCase();

  if (!sheet || sheet.getLastRow() < 2) {
    return { success: true, activities: [] };
  }

  // Ambil lebih banyak baris sebelum filter agar pengguna tetap memperoleh
  // aktivitas miliknya walaupun ada banyak aktivitas pengguna lain.
  const scanCount = Math.min(500, sheet.getLastRow() - 1);
  const startRow = sheet.getLastRow() - scanCount + 1;
  const values = sheet.getRange(startRow, 1, scanCount, 12).getDisplayValues();
  const activities = values.reverse().map(function (row) {
    return {
      id: row[0] || "",
      timestamp: row[1] || "",
      type: row[2] || "PROCUREMENT",
      noPR: row[3] || "",
      documentNo: row[4] || "",
      status: row[5] || "Updated",
      detail: row[6] || "",
      round: row[7] || "",
      user: row[8] || "",
      fileName: row[9] || "",
      userEmail: String(row[10] || "").trim().toLowerCase(),
      userRole: normalizeRole_(row[11] || "")
    };
  }).filter(function (item) {
    if (currentRole === "SUPER_ADMIN") return true;

    let belongsToCurrentUser = false;
    if (item.userEmail) {
      belongsToCurrentUser = Boolean(currentEmail) && item.userEmail === currentEmail;
    } else {
      // Kompatibilitas aktivitas lama: cocokkan kolom User dengan email/nama akun.
      const legacyUser = String(item.user || "").trim().toLowerCase();
      belongsToCurrentUser = Boolean(legacyUser) && (legacyUser === currentEmail || legacyUser === currentName);
    }
    if (!belongsToCurrentUser) return false;

    // Untuk role Contract, Recent Activity benar-benar khusus pekerjaan Contract:
    // Contract Management + Agreement Tracker. Aktivitas Procurement/Bidder lama
    // tidak ikut tampil walaupun pernah dibuat oleh akun/email yang sama.
    if (currentRole === "CONTRACT") {
      return item.type === "CONTRACT" || item.type === "AGREEMENT";
    }
    return true;
  }).slice(0, limit);

  return { success: true, activities: activities };
}


/* =========================================================
   SAVE SEMUA ROW
========================================================= */

function replaceRowsWithRevision_(sheetName, rows, expectedRevision, entityLabel) {
  sheetName = assertAllowedClientSheet_(sheetName);
  const currentRevision = getSheetRevision_(sheetName);
  const suppliedRevision = expectedRevision === "" || expectedRevision == null
    ? null
    : Number(expectedRevision);

  if (suppliedRevision !== null && suppliedRevision !== currentRevision) {
    return {
      success: false,
      conflict: true,
      message: "Data " + String(entityLabel || sheetName) + " berubah sejak halaman dibuka. Muat ulang sebelum menyimpan.",
      currentRevision: currentRevision
    };
  }

  return saveRowsToSheet_(sheetName, rows);
}

function saveRowsToSheet_(sheetName, rows) {
  sheetName = assertAllowedClientSheet_(sheetName);
  const spreadsheet = getSpreadsheet_(sheetName);
  let sheet = String(sheetName).trim().toLowerCase() === "agreement tracker"
    ? ensureAgreementTrackerSheet_()
    : spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  rows = Array.isArray(rows) ? rows : [];

  if (!rows.length) {
    const lastRow = sheet.getLastRow();
    const lastColumn = Math.max(sheet.getLastColumn(), 1);

    // Header tetap dipertahankan; hanya data di bawahnya yang dihapus.
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
    }

    return {
      success: true,
      message: "Data berhasil dihapus; header tetap dipertahankan.",
      rowCount: 0,
      revision: bumpSheetRevision_(sheetName)
    };
  }

  const headers = buildIncomingHeaders_(sheet, rows);
  const values = rows.map(function (row) {
    return headers.map(function (header) {
      const value = row && Object.prototype.hasOwnProperty.call(row, header)
        ? row[header]
        : "";

      if (value == null) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return value;
    });
  });

  const oldLastRow = Math.max(sheet.getLastRow(), 1);
  const oldLastColumn = Math.max(sheet.getLastColumn(), headers.length, 1);

  // clearContent mempertahankan style/warna/format yang sudah ada.
  sheet.getRange(1, 1, oldLastRow, oldLastColumn).clearContent();

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  forceTextColumns_(sheet, headers, 2, values.length);
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  sheet.setFrozenRows(1);

  return {
    success: true,
    message: "Google Sheet berhasil diperbarui.",
    rowCount: rows.length,
    revision: bumpSheetRevision_(sheetName)
  };
}

function buildIncomingHeaders_(sheet, rows) {
  const incoming = [];

  rows.forEach(function (row) {
    Object.keys(row || {}).forEach(function (key) {
      if (String(key).indexOf("__") === 0) return;
      if (incoming.indexOf(key) < 0) incoming.push(key);
    });
  });

  if (!incoming.length) return [];

  const existing = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
        .map(function (value) { return String(value || "").trim(); })
        .filter(Boolean)
    : [];

  const ordered = [];

  existing.forEach(function (header) {
    if (incoming.indexOf(header) >= 0 && ordered.indexOf(header) < 0) {
      ordered.push(header);
    }
  });

  incoming.forEach(function (header) {
    if (ordered.indexOf(header) < 0) ordered.push(header);
  });

  return ordered;
}

/* =========================================================
   COMPANY
========================================================= */

function addCompanyRow_(sheet, rowData) {
  const headers = getHeadersOrThrow_(sheet);
  const rowIndex = sheet.getLastRow() + 1;

  const row = headers.map(function (header) {
    return getObjectValue_(rowData, header);
  });

  forceTextColumns_(sheet, headers, rowIndex, 1);
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);

  return {
    success: true,
    message: "Baris Company berhasil ditambahkan.",
    rowNumber: rowIndex
  };
}

function editCompanyRow_(sheet, rowData, originalNoCompany) {
  const values = sheet.getDataRange().getDisplayValues();

  if (!values.length) {
    throw new Error("Sheet Company belum mempunyai header.");
  }

  const headers = values[0].map(function (value) {
    return String(value || "").trim();
  });

  const keyColumn = findHeaderIndex_(headers, ["No Company", "Company No", "Vendor No"]);

  if (keyColumn < 0) {
    throw new Error("Kolom 'No Company' tidak ditemukan.");
  }

  const key = String(originalNoCompany == null ? "" : originalNoCompany).trim();

  for (let index = 1; index < values.length; index++) {
    if (key && String(values[index][keyColumn] || "").trim() === key) {
      assertCanEditCompanyRow_(headers, values[index]);
      const existingRow = values[index];
      const newRow = headers.map(function (header, columnIndex) {
        return Object.prototype.hasOwnProperty.call(rowData, header)
          ? normalizeCellValue_(rowData[header])
          : existingRow[columnIndex];
      });

      forceTextColumns_(sheet, headers, index + 1, 1);
      sheet.getRange(index + 1, 1, 1, newRow.length).setValues([newRow]);

      return {
        success: true,
        message: "Baris Company berhasil diperbarui.",
        rowNumber: index + 1
      };
    }
  }

  // Vendor tidak boleh membuat perusahaan baru lewat jalur EDIT.
  if (
    ROLE_ENFORCEMENT_ENABLED &&
    !roleHasPermission_(getCurrentUserProfile_(), "company.manage")
  ) {
    throw new Error("Profil Company yang sesuai dengan akun Anda tidak ditemukan.");
  }

  // Kompatibilitas admin untuk data lama.
  return addCompanyRow_(sheet, rowData);
}

function deleteCompanyRow_(sheet, originalNoCompany) {
  return deleteRowByKey_(
    sheet,
    ["No Company", "Company No", "Vendor No"],
    originalNoCompany,
    "Company"
  );
}

/* =========================================================
   PROCUREMENT ADD / EDIT / DELETE
========================================================= */

function addProcurement_(sheet, formData) {
  const headers = ensureProcurementMetadataColumns_(sheet);
  const mapped = mapFormData_(formData || {});
  const noPR = String(mapped["No PR"] || "").trim();
  if (!noPR) throw new Error("No PR wajib diisi.");
  const assignDate = procurementAssignDateFromObject_(mapped);
  const prYear = procurementYearFromAssignDate_(assignDate);
  ensureUniqueProcurementPR_(sheet, noPR, assignDate, 0);

  const rowIndex = sheet.getLastRow() + 1;
  const now = new Date().toISOString();
  const actor = currentActorEmail_(formData);
  const procurementId = String(formData.procurementId || formData["Procurement ID"] || "").trim()
    || ("PROC-" + Utilities.getUuid());

  const activeProfile = getCurrentUserProfile_();
  const metadata = {
    "Procurement ID": procurementId,
    "PR Year": prYear,
    "Owner Name": activeProfile.name ||
      readFirstPresent_(formData, ["ownerName", "Owner Name"]),
    "Owner NIP": readFirstPresent_(formData, ["ownerNIP", "Owner NIP", "NIP"]),
    "Owner Email": activeProfile.email ||
      readFirstPresent_(formData, ["ownerEmail", "Owner Email", "Email Perusahaan"]),
    "Version": 1,
    "Created At": now,
    "Created By": actor,
    "Updated At": now,
    "Updated By": actor
  };

  const row = headers.map(function (header) {
    if (Object.prototype.hasOwnProperty.call(metadata, header)) {
      return normalizeProcurementValueForSheet_(header, metadata[header]);
    }
    return Object.prototype.hasOwnProperty.call(mapped, header)
      ? normalizeProcurementValueForSheet_(header, mapped[header])
      : "";
  });

  copyProcurementRowFormat_(sheet, rowIndex, row.length);
  forceTextColumns_(sheet, headers, rowIndex, 1);
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  applyProcurementDateFormats_(sheet, headers, rowIndex, 1);
  const revision = bumpSheetRevision_(sheet.getName());

  return {
    success: true,
    message: "Data Procurement berhasil ditambahkan.",
    rowNumber: rowIndex,
    procurementId: procurementId,
    version: 1,
    revision: revision
  };
}

function editProcurement_(sheet, formData, originalPR) {
  const headers = ensureProcurementMetadataColumns_(sheet);
  const rawValues = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();

  if (!rawValues.length) throw new Error("Sheet Procurement belum mempunyai header.");

  const prColumn = findHeaderIndex_(headers, ["No PR", "PR No", "PR Number"]);
  const idColumn = findHeaderIndex_(headers, ["Procurement ID"]);
  const versionColumn = findHeaderIndex_(headers, ["Version"]);
  if (prColumn < 0) throw new Error("Kolom 'No PR' tidak ditemukan.");

  const key = String(originalPR == null ? "" : originalPR).trim();
  const incomingId = String(formData.procurementId || formData["Procurement ID"] || "").trim();
  const expectedVersionRaw = readFirstPresent_(formData, ["__version", "version", "Version"]);
  const expectedVersion = expectedVersionRaw === "" || expectedVersionRaw == null ? 0 : Number(expectedVersionRaw);
  const mapped = mapFormData_(formData || {});

  for (let index = 1; index < displayValues.length; index++) {
    const sameId = incomingId && idColumn >= 0 &&
      String(displayValues[index][idColumn] || "").trim() === incomingId;
    const samePR = key && String(displayValues[index][prColumn] || "").trim() === key;
    // Procurement ID selalu menjadi identitas utama. Fallback No PR hanya
    // dipakai untuk record lama yang belum memiliki ID.
    if (incomingId ? !sameId : !samePR) continue;

    assertCanEditProcurementRow_(headers, displayValues[index]);
    const rowNumber = index + 1;
    const newPR = String(mapped["No PR"] || displayValues[index][prColumn] || "").trim();
    const assignDate = procurementAssignDateFromObject_(mapped) || valueByHeader_(displayValues[index], headers, "Assign PR Date") || valueByHeader_(displayValues[index], headers, "Assign PR") || valueByHeader_(displayValues[index], headers, "Assign Date");
    const prYear = procurementYearFromAssignDate_(assignDate);
    ensureUniqueProcurementPR_(sheet, newPR, assignDate, rowNumber);

    const currentVersion = versionColumn >= 0 ? Number(displayValues[index][versionColumn] || 1) : 1;
    if (expectedVersion && expectedVersion !== currentVersion) {
      return {
        success: false,
        conflict: true,
        message: "Data Procurement telah diperbarui user lain. Muat ulang sebelum menyimpan.",
        currentVersion: currentVersion,
        updatedBy: valueByHeader_(displayValues[index], headers, "Updated By"),
        updatedAt: valueByHeader_(displayValues[index], headers, "Updated At")
      };
    }

    const nextVersion = currentVersion + 1;
    const now = new Date().toISOString();
    const actor = currentActorEmail_(formData);
    const newRow = headers.map(function (header, columnIndex) {
      if (header === "Version") return nextVersion;
      if (header === "PR Year") return prYear;
      if (header === "Updated At") return now;
      if (header === "Updated By") return actor;
      if (header === "Procurement ID") {
        return incomingId || rawValues[index][columnIndex] || ("PROC-" + Utilities.getUuid());
      }
      return Object.prototype.hasOwnProperty.call(mapped, header)
        ? normalizeProcurementValueForSheet_(header, mapped[header])
        : normalizeProcurementValueForSheet_(header, rawValues[index][columnIndex]);
    });

    forceTextColumns_(sheet, headers, rowNumber, 1);
    sheet.getRange(rowNumber, 1, 1, newRow.length).setValues([newRow]);
    applyProcurementDateFormats_(sheet, headers, rowNumber, 1);
    const revision = bumpSheetRevision_(sheet.getName());

    return {
      success: true,
      message: "Data Procurement berhasil diperbarui.",
      rowNumber: rowNumber,
      procurementId: newRow[idColumn],
      version: nextVersion,
      revision: revision
    };
  }

  return { success: false, message: "No PR '" + key + "' tidak ditemukan." };
}

function deleteProcurement_(sheet, noPR, procurementId, assignDate) {
  const headers = ensureProcurementMetadataColumns_(sheet);
  const values = sheet.getDataRange().getDisplayValues();
  const prColumn = findHeaderIndex_(headers, ["No PR", "PR No", "PR Number"]);
  const idColumn = findHeaderIndex_(headers, ["Procurement ID"]);
  const assignColumn = findHeaderIndex_(headers, ["Assign PR Date", "Assign PR", "Assign Date"]);
  const targetId = String(procurementId || "").trim();
  const targetPR = String(noPR || "").trim();
  const targetYear = assignDate ? procurementYearFromAssignDate_(assignDate) : 0;
  const matches = [];

  for (let index = 1; index < values.length; index++) {
    const rowId = idColumn >= 0 ? String(values[index][idColumn] || "").trim() : "";
    const rowPR = prColumn >= 0 ? String(values[index][prColumn] || "").trim() : "";

    if (targetId) {
      if (rowId === targetId) matches.push(index + 1);
      continue;
    }

    if (!targetPR || rowPR !== targetPR) continue;
    if (targetYear && assignColumn >= 0) {
      try {
        if (procurementYearFromAssignDate_(values[index][assignColumn]) !== targetYear) continue;
      } catch (ignoreInvalidDate) {
        continue;
      }
    }
    matches.push(index + 1);
  }

  if (!matches.length) {
    return { success: false, message: "Data Procurement tidak ditemukan." };
  }
  if (matches.length > 1) {
    return {
      success: false,
      ambiguous: true,
      message: "No PR ditemukan pada lebih dari satu tahun. Hapus menggunakan Procurement ID."
    };
  }

  sheet.deleteRow(matches[0]);
  return {
    success: true,
    message: "Data Procurement berhasil dihapus.",
    rowNumber: matches[0],
    procurementId: targetId,
    revision: bumpSheetRevision_(sheet.getName())
  };
}

function mapFormData_(data) {
  data = data || {};
  const mapped = {};

  copyField_(mapped, data, ["noPR", "No PR"], ["No PR"]);
  copyField_(mapped, data, ["Description", "description"], ["Description"]);
  copyField_(mapped, data, ["previoussubmitpo", "Previous Submit PO"], ["Previous Submit PO"]);
  copyField_(mapped, data, ["finalvendorlist", "Final Vendor List"], ["Final Vendor List"]);
  copyField_(mapped, data, ["finalsubmitvendor", "Final Submit Vendor"], ["Final Submit Vendor"]);

  // Status Rebid dan Round PR adalah dua kolom berbeda.
  copyField_(mapped, data, ["statusrebid", "Status Rebid"], ["Status Rebid"]);
  copyField_(mapped, data, ["roundpr", "Round PR", "roundpo", "Round PO"], ["Round PR"]);

  copyField_(mapped, data, ["pic", "PIC"], ["PIC"]);
  copyField_(mapped, data,
    ["assignprdate", "Assign Date", "Assign PR", "Assign PR Date"],
    ["Assign Date", "Assign PR", "Assign PR Date"]
  );
  copyField_(mapped, data, ["departement", "Departement", "Department"], ["Departement", "Department"]);
  copyField_(mapped, data, ["pengadaan", "Pengadaan"], ["Pengadaan"]);
  copyField_(mapped, data, ["statuspr", "Status PR"], ["Status PR"]);
  copyField_(mapped, data, ["rfq", "RFQ"], ["RFQ"]);
  copyField_(mapped, data,
    ["estpricerp", "Est. Price PR", "Est. Price PR (USD)"],
    ["Est. Price PR", "Est. Price PR (USD)"]
  );
  copyField_(mapped, data,
    ["estpriceus", "Est. Price US - Rp", "Est. Price US-Rp"],
    ["Est. Price US - Rp", "Est. Price US-Rp"]
  );
  copyField_(mapped, data,
    ["usdidrrate", "USD/IDR Rate", "USD IDR Rate"],
    ["USD/IDR Rate", "USD IDR Rate"]
  );
  copyField_(mapped, data,
    ["usdidrratedate", "USD/IDR Rate Date", "USD IDR Rate Date"],
    ["USD/IDR Rate Date", "USD IDR Rate Date"]
  );
  copyField_(mapped, data,
    ["usdidrsource", "USD/IDR Source", "USD IDR Source"],
    ["USD/IDR Source", "USD IDR Source"]
  );
  copyField_(mapped, data,
    ["usdidrlocked", "USD/IDR Locked", "USD IDR Locked"],
    ["USD/IDR Locked", "USD IDR Locked"]
  );
  copyField_(mapped, data, ["flowprocess", "Flow Process"], ["Flow Process"]);

  for (let roundNumber = 0; roundNumber <= MAX_ROUND; roundNumber++) {
    const lower = "r" + roundNumber;
    const upper = "R" + roundNumber;

    copyField_(mapped, data,
      [lower + "company", upper + " Company"],
      [upper + " Company"]
    );
    copyField_(mapped, data,
      [lower + "submitcompany", upper + " Submit Company"],
      [upper + " Submit Company"]
    );
    copyField_(mapped, data,
      [lower + "startdate", upper + " Start Date"],
      [upper + " Start Date"]
    );
    copyField_(mapped, data,
      [lower + "finishdate", upper + " Finish Date"],
      [upper + " Finish Date"]
    );
  }

  // Kompatibilitas form lama yang hanya mengirim vendor untuk round aktif.
  const activeRound = normalizeRound_(readFirstPresent_(data, ["roundpr", "Round PR", "roundpo", "Round PO"]));
  if (activeRound) {
    copyField_(mapped, data, ["roundcompany"], [activeRound + " Company"]);
    copyField_(mapped, data, ["roundsubmitcompany"], [activeRound + " Submit Company"]);
    copyField_(mapped, data, ["roundstartdate"], [activeRound + " Start Date"]);
    copyField_(mapped, data, ["roundfinishdate"], [activeRound + " Finish Date"]);
  }

  copyField_(mapped, data, ["winnerpo", "Winner PO"], ["Winner PO"]);
  copyField_(mapped, data,
    ["emailwinnerpo", "Email Winner PO", "Winner PO Email"],
    ["Email Winner PO", "Winner PO Email"]
  );
  copyField_(mapped, data, ["nopo", "No PO"], ["No PO"]);
  copyField_(mapped, data,
    ["pricerp", "Price (Rp) Excl. PPn", "Price (Rp) Excl. PPN"],
    ["Price (Rp) Excl. PPn", "Price (Rp) Excl. PPN"]
  );
  copyField_(mapped, data,
    ["cqscreatedate", "CQS Create Date", "CQS Created Date"],
    ["CQS Create Date", "CQS Created Date"]
  );
  copyField_(mapped, data, ["cqsapprovaldate", "CQS Approval Date"], ["CQS Approval Date"]);
  copyField_(mapped, data, ["pocreatedate", "PO Create Date"], ["PO Create Date"]);
  copyField_(mapped, data, ["podeldate", "PO Del. Date", "PO Delivery Date"], ["PO Del. Date", "PO Delivery Date"]);
  copyField_(mapped, data,
    ["actualporeldate", "Actual PO Rel. Date", "actualporeleasedate", "Actual PO Release Date"],
    ["Actual PO Rel. Date", "Actual PO Release Date"]
  );
  copyField_(mapped, data,
    ["actualpodeldate", "Actual PO Del. Date", "Actual PO Delivery Date"],
    ["Actual PO Del. Date", "Actual PO Delivery Date"]
  );
  copyField_(mapped, data,
    ["days", "Days Calender (Days)", "Days Calendar (Days)"],
    ["Days Calender (Days)", "Days Calendar (Days)"]
  );
  copyField_(mapped, data,
    ["actualreceivedpo", "Actual Received PO (GRN Date)", "GRN Date"],
    ["Actual Received PO (GRN Date)", "GRN Date"]
  );
  copyField_(mapped, data, ["note", "Note"], ["Note"]);
  copyField_(mapped, data, ["folderid", "Folder ID"], ["Folder ID"]);
  copyField_(mapped, data,
    ["folderlink", "Folder LINK", "Folder Link"],
    ["Folder LINK", "Folder Link"]
  );

  // Field yang sudah memakai nama header asli tetap diterima.
  Object.keys(data).forEach(function (key) {
    if (key.indexOf("__") === 0) return;
    if (key === "folderstructure") return;
    if (key.indexOf(" ") < 0) return;

    const value = data[key];
    if (value == null || typeof value !== "object") {
      mapped[key] = normalizeCellValue_(value);
    }
  });

  return mapped;
}

/* =========================================================
   MASTER TEMPLATE PERMANEN
   BidderList / RFQ / CQS dibaca dari Google Drive sebagai Base64.
   Frontend membuat salinan di memori sehingga file master tidak berubah.
========================================================= */

function normalizeMasterTemplateType_(value) {
  const normalized = String(value == null ? "" : value)
    .trim()
    .toUpperCase()
    .replace(/\.XLSX$/i, "")
    .replace(/[^A-Z0-9]/g, "");

  if (normalized === "BIDDERLIST" || normalized === "BIDDER") return "BIDDERLIST";
  if (normalized === "RFQ") return "RFQ";
  if (normalized === "CQS") return "CQS";
  return "";
}

function normalizedMasterTemplateFileName_(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findMasterTemplateFile_(templateType) {
  const type = normalizeMasterTemplateType_(templateType);
  const definition = MASTER_TEMPLATE_DEFINITIONS[type];

  if (!type || !definition) {
    throw new Error(
      "Jenis master template tidak dikenali. Gunakan BIDDERLIST, RFQ, atau CQS."
    );
  }

  const folder = DriveApp.getFolderById(requiredScriptProperty_("MASTER_TEMPLATE_FOLDER_ID"));
  let newestExact = null;
  let newestExactTime = -1;

  // Prioritaskan nama standar agar isi folder master tetap terkontrol.
  definition.aliases.forEach(function (fileName) {
    const exactFiles = folder.getFilesByName(fileName);
    while (exactFiles.hasNext()) {
      const file = exactFiles.next();
      const updated = file.getLastUpdated();
      const timestamp = updated ? updated.getTime() : 0;
      if (!newestExact || timestamp >= newestExactTime) {
        newestExact = file;
        newestExactTime = timestamp;
      }
    }
  });

  if (newestExact) return newestExact;

  // Fallback case-insensitive untuk menghindari gagal hanya karena spasi/case.
  const keyword = normalizedMasterTemplateFileName_(definition.keyword);
  const files = folder.getFiles();
  let newestFallback = null;
  let newestFallbackTime = -1;

  while (files.hasNext()) {
    const file = files.next();
    const fileName = String(file.getName() || "");
    if (!/\.xlsx$/i.test(fileName)) continue;

    const normalizedName = normalizedMasterTemplateFileName_(fileName);
    if (!normalizedName || normalizedName.indexOf(keyword) < 0) continue;

    const updated = file.getLastUpdated();
    const timestamp = updated ? updated.getTime() : 0;
    if (!newestFallback || timestamp >= newestFallbackTime) {
      newestFallback = file;
      newestFallbackTime = timestamp;
    }
  }

  if (newestFallback) return newestFallback;

  throw new Error(
    "Master " + type + " tidak ditemukan di folder master. " +
    "Gunakan nama: " + definition.aliases.join(" atau ") + "."
  );
}

function getMasterTemplate_(templateType) {
  const type = normalizeMasterTemplateType_(templateType);
  const file = findMasterTemplateFile_(type);
  const mimeType = String(file.getMimeType() || "");

  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    throw new Error(
      "Master " + type + " masih berupa Google Sheets. " +
      "Simpan atau upload sebagai file XLSX tanpa konversi."
    );
  }

  const blob = file.getBlob();
  const bytes = blob.getBytes();
  const updatedAt = file.getLastUpdated();

  return {
    success: true,
    templateType: type,
    fileId: file.getId(),
    fileName: file.getName(),
    mimeType: mimeType,
    size: bytes.length,
    updatedAt: updatedAt ? updatedAt.toISOString() : "",
    source: "GOOGLE_DRIVE_MASTER_FOLDER",
    base64: Utilities.base64Encode(bytes)
  };
}

function listMasterTemplates_() {
  const templates = {};
  const errors = {};

  Object.keys(MASTER_TEMPLATE_DEFINITIONS).forEach(function (type) {
    try {
      const file = findMasterTemplateFile_(type);
      const updatedAt = file.getLastUpdated();
      templates[type] = {
        fileId: file.getId(),
        fileName: file.getName(),
        mimeType: file.getMimeType(),
        size: Number(file.getSize() || 0),
        updatedAt: updatedAt ? updatedAt.toISOString() : ""
      };
    } catch (error) {
      errors[type] = errorMessage_(error);
    }
  });

  return {
    success: Object.keys(errors).length === 0,
    folderId: MASTER_TEMPLATE_FOLDER_ID,
    templates: templates,
    errors: errors,
    message: Object.keys(errors).length
      ? "Sebagian master template belum tersedia."
      : "Semua master template tersedia."
  };
}

/* =========================================================
   FOLDER MANAGER
========================================================= */

function ensureProcurementFolderStructure_(payload) {
  const noPR = cleanFolderName_(payload.noPR);
  const description = cleanFolderName_(payload.description || "");
  const rootFolder = resolveProcurementRootFolder_(payload, noPR, description, true);
  const rounds = collectRoundsFromPayload_(payload);
  const folderMap = readOrEnsureStandardSubfolders_(rootFolder, rounds, true);

  return {
    success: true,
    message: "Susunan folder Procurement berhasil dibuat atau diperbarui.",
    folderId: rootFolder.getId(),
    folderUrl: rootFolder.getUrl(),
    rootFolderId: rootFolder.getId(),
    rootFolderUrl: rootFolder.getUrl(),
    folderMap: folderMap
  };
}

function getProcurementFolderStructure_(payload) {
  const noPR = cleanFolderName_(payload.noPR);
  const description = cleanFolderName_(payload.description || "");
  const rootFolder = resolveProcurementRootFolder_(payload, noPR, description, false);

  if (!rootFolder) {
    return {
      success: false,
      message: "Folder Procurement belum ditemukan."
    };
  }

  const rounds = collectRoundsFromPayload_(payload);
  const folderMap = readOrEnsureStandardSubfolders_(rootFolder, rounds, false);

  return {
    success: true,
    folderId: rootFolder.getId(),
    folderUrl: rootFolder.getUrl(),
    rootFolderId: rootFolder.getId(),
    rootFolderUrl: rootFolder.getUrl(),
    folderMap: folderMap
  };
}

function uploadProcurementFile_(payload) {
  let fileName = cleanFileName_(payload.fileName);

  if (payload.autoFileName || !fileName) {
    fileName = buildProcurementDocumentFileName_(
      payload.documentType || "BIDDERLIST",
      payload
    );
  }

  if (!fileName) {
    throw new Error("Nama file kosong.");
  }

  if (!payload.fileData) {
    throw new Error("Isi file kosong.");
  }

  const noPR = cleanFolderName_(payload.noPR);
  const description = cleanFolderName_(payload.description || "");
  const rootFolder = resolveProcurementRootFolder_(payload, noPR, description, true);
  const rounds = collectRoundsFromPayload_(payload);
  const folderMap = readOrEnsureStandardSubfolders_(rootFolder, rounds, true);

  const documentFolderMap = {
    BIDDERLIST: "02. Bidderlist",
    RFQ: "01. PR Approval",
    CQS: "03. CQS",
    PO: "04. PO",
    CONTRACT: "05. Contract",
    PR: "01. PR Approval"
  };
  const requestedDocumentType = String(payload.documentType || "").trim().toUpperCase();
  const lockedDocumentFolder = documentFolderMap[requestedDocumentType] || "";
  const folderType = lockedDocumentFolder || (
    PROCUREMENT_MAIN_FOLDERS.indexOf(payload.folderType) >= 0
      ? payload.folderType
      : "01. PR Approval"
  );

  let targetInfo = folderMap[folderType];

  if (!targetInfo) {
    throw new Error("Folder tujuan tidak ditemukan: " + folderType);
  }

  let targetFolder = DriveApp.getFolderById(targetInfo.id);

  // Saat pengguna memilih Upload Folder, struktur subfolder dipertahankan.
  const relativeParts = String(payload.relativePath || "")
    .split("/")
    .filter(function (part) { return String(part || "").trim() !== ""; });

  if (relativeParts.length > 2) {
    relativeParts.slice(1, -1).forEach(function (part) {
      const folderName = cleanFolderName_(part);
      if (folderName) {
        targetFolder = getOrCreateChildFolder_(targetFolder, folderName);
      }
    });
  }

  let base64Data = String(payload.fileData || "");
  if (base64Data.indexOf(",") >= 0) {
    base64Data = base64Data.split(",").pop();
  }

  const bytes = Utilities.base64Decode(base64Data);
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error("Ukuran file melebihi batas 10 MB.");
  }
  const blob = Utilities.newBlob(
    bytes,
    payload.mimeType || "application/octet-stream",
    fileName
  );

  const file = targetFolder.createFile(blob);

  // Dokumen hasil generate web menggantikan versi lama dengan nama yang sama.
  // File baru dibuat lebih dahulu; versi lama baru dipindahkan ke Trash setelah
  // pembuatan berhasil sehingga dokumen terakhir tidak hilang bila upload gagal.
  if (payload.replaceExisting === true) {
    trashOtherFilesByExactName_(targetFolder, fileName, file.getId());
  }

  const updatedAt = file.getLastUpdated();

  return {
    success: true,
    message: "File berhasil disimpan.",
    documentType: requestedDocumentType,
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    previewUrl: "https://drive.google.com/file/d/" + encodeURIComponent(file.getId()) + "/preview",
    fileName: file.getName(),
    mimeType: file.getMimeType(),
    updatedAt: updatedAt ? updatedAt.toISOString() : "",
    folderName: targetFolder.getName(),
    folderPath: rootFolder.getName() + " / " + targetFolder.getName(),
    folderId: rootFolder.getId(),
    folderUrl: rootFolder.getUrl(),
    rootFolderId: rootFolder.getId(),
    rootFolderUrl: rootFolder.getUrl(),
    targetFolderId: targetFolder.getId(),
    targetFolderUrl: targetFolder.getUrl(),
    folderMap: folderMap
  };
}

function trashOtherFilesByExactName_(folder, fileName, keepFileId) {
  const files = folder.getFilesByName(String(fileName || ""));
  while (files.hasNext()) {
    const file = files.next();
    if (String(file.getId()) === String(keepFileId || "")) continue;
    try {
      file.setTrashed(true);
    } catch (ignore) {}
  }
}

function fileInfoForWeb_(file, documentType, folderName) {
  if (!file) return null;
  const updatedAt = file.getLastUpdated();
  const parents = file.getParents();
  const parentId = parents.hasNext() ? parents.next().getId() : "";
  return {
    documentType: documentType,
    fileId: file.getId(),
    fileName: file.getName(),
    fileUrl: file.getUrl(),
    previewUrl: "https://drive.google.com/file/d/" + encodeURIComponent(file.getId()) + "/preview",
    mimeType: file.getMimeType(),
    updatedAt: updatedAt ? updatedAt.toISOString() : "",
    folderName: folderName || "",
    targetFolderId: parentId
  };
}

function findNewestFileByExactName_(folder, fileName) {
  const files = folder.getFilesByName(String(fileName || ""));
  let newest = null;
  let newestTime = 0;

  while (files.hasNext()) {
    const file = files.next();
    const time = file.getLastUpdated() ? file.getLastUpdated().getTime() : 0;
    if (!newest || time >= newestTime) {
      newest = file;
      newestTime = time;
    }
  }
  return newest;
}

function getProcurementDocuments_(payload) {
  payload = payload || {};
  const noPR = cleanFolderName_(payload.noPR);
  const description = cleanFolderName_(payload.description || "");
  const rootFolder = resolveProcurementRootFolder_(payload, noPR, description, false);

  if (!rootFolder) {
    return {
      success: true,
      message: "Folder Procurement belum tersedia.",
      documents: {}
    };
  }

  const folderMap = readOrEnsureStandardSubfolders_(
    rootFolder,
    collectRoundsFromPayload_(payload),
    false
  );

  const definitions = [
    { type: "BIDDERLIST", folderName: "02. Bidderlist" },
    { type: "RFQ", folderName: "01. PR Approval" },
    { type: "CQS", folderName: "03. CQS" }
  ];
  const documents = {};

  definitions.forEach(function (definition) {
    const folderInfo = folderMap[definition.folderName];
    if (!folderInfo || !folderInfo.id) return;

    const folder = DriveApp.getFolderById(folderInfo.id);
    const expectedFileName = buildProcurementDocumentFileName_(
      definition.type,
      payload
    );
    const file = findNewestFileByExactName_(folder, expectedFileName);
    if (!file) return;

    documents[definition.type] = fileInfoForWeb_(
      file,
      definition.type,
      definition.folderName
    );
  });

  return {
    success: true,
    message: "Dokumen Procurement berhasil diperiksa.",
    folderId: rootFolder.getId(),
    folderUrl: rootFolder.getUrl(),
    documents: documents
  };
}


function listProcurementFiles_(payload) {
  payload = payload || {};
  const requestedType = String(payload.folderType || "01. PR Approval").trim();
  let sourceFolder = null;
  let sourceLabel = "";

  if (requestedType === "TC_MASTER") {
    sourceFolder = DriveApp.getFolderById(requiredScriptProperty_("MULTIPLE_EMAIL_TC_FOLDER_ID"));
    sourceLabel = "Terms & Conditions";
  } else if (requestedType === "PROCUREMENT_MASTER") {
    sourceFolder = DriveApp.getFolderById(requiredScriptProperty_("MASTER_TEMPLATE_FOLDER_ID"));
    sourceLabel = "Dokumen Master Procurement";
  } else {
    const noPR = cleanFolderName_(payload.noPR);
    const description = cleanFolderName_(payload.description || "");
    if (!noPR) throw new Error("No PR wajib diisi untuk mengambil attachment PR/RFQ.");

    const rootFolder = resolveProcurementRootFolder_(payload, noPR, description, false);
    if (!rootFolder) {
      return {
        success: true,
        message: "Folder Procurement untuk No PR belum ditemukan.",
        files: []
      };
    }

    const folderMap = readOrEnsureStandardSubfolders_(
      rootFolder,
      collectRoundsFromPayload_(payload),
      false
    );
    // Hormati lokasi yang dipilih di Procurement Document Folder. Versi lama
    // selalu membaca 01. PR Approval sehingga file pada Bidderlist, CQS, PO,
    // dan Contract tidak pernah masuk daftar walaupun foldernya benar.
    const resolvedType = PROCUREMENT_MAIN_FOLDERS.indexOf(requestedType) >= 0
      ? requestedType
      : "01. PR Approval";
    const folderInfo = folderMap[resolvedType];
    if (!folderInfo || !folderInfo.id) {
      return {
        success: true,
        message: "Folder " + resolvedType + " belum tersedia.",
        files: []
      };
    }
    sourceFolder = DriveApp.getFolderById(folderInfo.id);
    sourceLabel = resolvedType;
  }

  const files = [];
  collectDriveFilesForEmail_(sourceFolder, sourceLabel, "", files, 0);
  files.sort(function (a, b) {
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });

  return {
    success: true,
    message: files.length
      ? files.length + " file tersedia."
      : "Folder belum memiliki file.",
    folderType: requestedType,
    sourceFolderId: sourceFolder.getId(),
    sourceFolderUrl: sourceFolder.getUrl(),
    files: files
  };
}

function collectDriveFilesForEmail_(folder, sourceLabel, relativePath, output, depth) {
  if (!folder || depth > 5 || output.length >= 500) return;

  const files = folder.getFiles();
  while (files.hasNext() && output.length < 500) {
    const file = files.next();
    const updatedAt = file.getLastUpdated();
    const fileName = file.getName();
    const extensionParts = String(fileName || "").split(".");
    output.push({
      fileId: file.getId(),
      fileName: fileName,
      fileUrl: file.getUrl(),
      previewUrl: "https://drive.google.com/file/d/" + encodeURIComponent(file.getId()) + "/preview",
      downloadUrl: "https://drive.google.com/uc?export=download&id=" + encodeURIComponent(file.getId()),
      mimeType: file.getMimeType(),
      size: Number(file.getSize() || 0),
      updatedAt: updatedAt ? updatedAt.toISOString() : "",
      extension: extensionParts.length > 1 ? extensionParts.pop().toLowerCase() : "",
      folderType: sourceLabel,
      relativePath: relativePath ? relativePath + "/" + fileName : fileName
    });
  }

  const folders = folder.getFolders();
  while (folders.hasNext() && output.length < 500) {
    const child = folders.next();
    const childPath = relativePath
      ? relativePath + "/" + child.getName()
      : child.getName();
    collectDriveFilesForEmail_(child, sourceLabel, childPath, output, depth + 1);
  }
}


function procurementRootNameMatchesNoPR_(folder, noPR) {
  const normalizedPR = cleanFolderName_(noPR).toLowerCase();
  if (!folder || !normalizedPR) return false;

  const folderName = cleanFolderName_(folder.getName()).toLowerCase();
  return folderName === normalizedPR || folderName.indexOf(normalizedPR + " - ") === 0;
}

function findProcurementRootFromCandidate_(candidateFolder, noPR) {
  if (!candidateFolder || !noPR) return null;

  let currentLevel = [candidateFolder];
  const visited = {};

  // Folder ID lama kadang berisi ID subfolder dokumen. Naik sampai empat
  // tingkat untuk menemukan folder akar yang namanya sesuai No PR aktif.
  for (let depth = 0; depth <= 4 && currentLevel.length; depth++) {
    const nextLevel = [];

    for (let index = 0; index < currentLevel.length; index++) {
      const folder = currentLevel[index];
      const folderId = String(folder.getId() || "");
      if (!folderId || visited[folderId]) continue;
      visited[folderId] = true;

      if (procurementRootNameMatchesNoPR_(folder, noPR)) return folder;

      const parents = folder.getParents();
      while (parents.hasNext()) nextLevel.push(parents.next());
    }

    currentLevel = nextLevel;
  }

  return null;
}

function extractDriveFolderId_(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/\/folders\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : "";
}

function resolveProcurementRootFolder_(payload, noPR, description, createIfMissing) {
  payload = payload || {};

  const suppliedFolderIds = [
    String(payload.folderId || "").trim(),
    extractDriveFolderId_(payload.folderUrl || payload.folderLink || "")
  ].filter(function (id, index, values) {
    return id && values.indexOf(id) === index;
  });

  for (let index = 0; index < suppliedFolderIds.length; index++) {
    try {
      const candidate = DriveApp.getFolderById(suppliedFolderIds[index]);
      const matchingRoot = findProcurementRootFromCandidate_(candidate, noPR);
      if (matchingRoot) return matchingRoot;
    } catch (ignore) {}
  }

  const parent = DriveApp.getFolderById(requiredScriptProperty_("PROCUREMENT_ROOT_FOLDER_ID"));
  const normalizedPR = String(noPR || "").toLowerCase();

  if (normalizedPR) {
    const folders = parent.getFolders();

    while (folders.hasNext()) {
      const candidate = folders.next();
      const candidateName = candidate.getName().toLowerCase();

      if (
        candidateName === normalizedPR ||
        candidateName.indexOf(normalizedPR + " - ") === 0
      ) {
        return candidate;
      }
    }
  }

  if (!createIfMissing) return null;

  if (!noPR) {
    throw new Error("No PR wajib diisi sebelum membuat folder.");
  }

  const folderName = noPR + (description ? " - " + description : "");
  return parent.createFolder(folderName.substring(0, 180));
}

function readOrEnsureStandardSubfolders_(rootFolder, rounds, createMissing) {
  const map = {};

  PROCUREMENT_MAIN_FOLDERS.forEach(function (folderName) {
    let mainFolder = getChildFolder_(rootFolder, folderName);

    if (!mainFolder && createMissing) {
      mainFolder = rootFolder.createFolder(folderName);
    }

    if (!mainFolder) return;

    const info = folderInfo_(mainFolder);

    if (PROCUREMENT_ROUND_FOLDERS[folderName]) {
      info.rounds = {};

      rounds.forEach(function (round) {
        let roundFolder = getChildFolder_(mainFolder, round);

        if (!roundFolder && createMissing) {
          roundFolder = mainFolder.createFolder(round);
        }

        if (roundFolder) {
          info.rounds[round] = folderInfo_(roundFolder);
        }
      });
    }

    map[folderName] = info;
  });

  return map;
}

function collectRoundsFromPayload_(payload) {
  let source = [];

  if (Array.isArray(payload.rounds)) {
    source = source.concat(payload.rounds);
  }

  if (payload.round) source.push(payload.round);
  if (payload.roundpo) source.push(payload.roundpo);
  if (payload.roundPO) source.push(payload.roundPO);

  let maxRoundNumber = 0;

  source.forEach(function (value) {
    const round = normalizeRound_(value);
    if (!round) return;

    const number = Number(round.substring(1));
    if (number > maxRoundNumber) maxRoundNumber = number;
  });

  maxRoundNumber = Math.min(Math.max(maxRoundNumber, 0), MAX_ROUND);

  const result = [];
  for (let number = 0; number <= maxRoundNumber; number++) {
    result.push("R" + number);
  }

  return result;
}



/* =========================================================
   USD/IDR SNAPSHOT
========================================================= */

function getUsdIdrRate_() {
  const cache = CacheService.getScriptCache();
  const cachedText = cache.get("USD_IDR_RATE_LATEST");

  if (cachedText) {
    try {
      const cached = JSON.parse(cachedText);
      if (cached && Number(cached.rate) > 0) return cached;
    } catch (ignore) {}
  }

  const providers = [
    {
      name: "open.er-api.com",
      url: "https://open.er-api.com/v6/latest/USD",
      read: function (json) {
        return {
          rate: Number(json && json.rates && json.rates.IDR || 0),
          rateDate: String(json && (json.time_last_update_utc || json.time_last_update_unix) || "")
        };
      }
    },
    {
      name: "frankfurter.app",
      url: "https://api.frankfurter.app/latest?from=USD&to=IDR",
      read: function (json) {
        return {
          rate: Number(json && json.rates && json.rates.IDR || 0),
          rateDate: String(json && json.date || "")
        };
      }
    }
  ];

  const errors = [];
  for (let index = 0; index < providers.length; index++) {
    const provider = providers[index];

    try {
      const response = UrlFetchApp.fetch(provider.url, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: { "Accept": "application/json" }
      });
      const status = Number(response.getResponseCode() || 0);
      if (status < 200 || status >= 300) {
        throw new Error("HTTP " + status);
      }

      const json = JSON.parse(response.getContentText() || "{}");
      const parsed = provider.read(json);
      const rate = Math.round(Number(parsed.rate || 0));

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error("Rate IDR tidak tersedia.");
      }

      const result = {
        success: true,
        rate: rate,
        rateDate: parsed.rateDate || new Date().toISOString(),
        source: provider.name,
        checkedAt: new Date().toISOString()
      };

      cache.put("USD_IDR_RATE_LATEST", JSON.stringify(result), 21600);
      return result;
    } catch (error) {
      errors.push(provider.name + ": " + errorMessage_(error));
    }
  }

  return {
    success: false,
    rate: 0,
    rateDate: "",
    source: "",
    checkedAt: new Date().toISOString(),
    message: "Kurs USD/IDR gagal disinkronkan. " + errors.join(" | ")
  };
}

/* =========================================================
   BIDDERLIST -> PROCUREMENT ADMIN
========================================================= */

function saveBidderListToProcurement_(payload) {
  payload = payload || {};

  const sheet = getSheetOrThrow_(payload.sheet || DEFAULT_SHEET_NAME);
  const noPR = String(payload.noPR || "").trim();
  const round = normalizeRound_(payload.round) || "R0";
  if (!noPR) throw new Error("No PR wajib diisi.");

  const invited = uniqueNonBlankStrings_(payload.invitedVendors);
  if (!invited.length) {
    throw new Error("List Invitation Vendor masih kosong.");
  }

  const vendorText = invited.join("\n");
  const lowerRound = round.toLowerCase();
  const actor = currentActorEmail_(payload);
  const savedAt = new Date().toISOString();
  const openDate = String(payload.openDate || "").trim();
  const closeDate = String(payload.closeDate || "").trim();

  // BidderList hanya mengisi Company Name, tanggal pada round aktif, dan
  // Final Vendor List. Submit Company, Final Submit Vendor, Previous Submit
  // PO, Winner PO, dan field Procurement lain tidak disentuh.
  const partial = {
    noPR: noPR,
    __version: Number(payload.procurementVersion || payload.version || 0),
    "BidderList Saved Date": savedAt,
    "BidderList Saved By": actor
  };

  partial[lowerRound + "company"] = vendorText;
  partial["Final Vendor List"] = vendorText;
  if (openDate) {
    partial[lowerRound + "startdate"] = openDate;
  }
  if (closeDate) {
    partial[lowerRound + "finishdate"] = closeDate;
  }

  const result = editProcurement_(sheet, partial, noPR);
  if (!result.success) return result;

  result.message = "Company Name, Start Date, Finish Date, dan Final Vendor List BidderList berhasil disimpan sesuai Round PR.";
  result.noPR = noPR;
  result.round = round;
  result.invitedVendors = invited;
  result.openDate = openDate;
  result.closeDate = closeDate;
  result.savedAt = savedAt;
  result.savedBy = actor;
  result.data = {
    "No PR": noPR,
    "Round PR": round,
    "Round Company": vendorText,
    "Company Name": vendorText,
    "Final Vendor List": vendorText,
    "Start Date": openDate,
    "Finish Date": closeDate,
    roundcompany: vendorText,
    finalvendorlist: vendorText,
    roundstartdate: openDate,
    roundfinishdate: closeDate
  };
  result.data[round + " Company"] = vendorText;
  result.data[round + " Start Date"] = openDate;
  result.data[round + " Finish Date"] = closeDate;
  result.data[lowerRound + "company"] = vendorText;
  result.data[lowerRound + "startdate"] = openDate;
  result.data[lowerRound + "finishdate"] = closeDate;
  return result;
}

function uniqueNonBlankStrings_(values) {
  const source = Array.isArray(values)
    ? values
    : String(values == null ? "" : values).split(/\r?\n|;|\||\u2022/);

  const output = [];
  const seen = {};

  source.forEach(function (value) {
    const text = String(value == null ? "" : value).trim();
    if (!text) return;
    const key = text.toLowerCase().replace(/\s+/g, " ");
    if (seen[key]) return;
    seen[key] = true;
    output.push(text);
  });

  return output;
}

/* =========================================================
   WORKSPACE BIDDERLIST / RFQ / CQS
   Satu record per No PR + Round, aman dari overwrite record lain.
========================================================= */

function getOrCreateWorkspaceSheet_() {
  const spreadsheet = getSpreadsheet_(DOCUMENT_WORKSPACE_SHEET_NAME);
  let sheet = spreadsheet.getSheetByName(DOCUMENT_WORKSPACE_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(DOCUMENT_WORKSPACE_SHEET_NAME);
  }

  const headers = [
    "Key", "No PR", "Round", "Data JSON", "Version",
    "Updated By", "Updated At"
  ];

  if (sheet.getLastRow() < 1 || !sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0].some(Boolean)) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  forceTextColumns_(sheet, headers, 2, Math.max(sheet.getMaxRows() - 1, 1));
  return sheet;
}

function workspaceKey_(identifier, round, isProcurementId) {
  const value = String(identifier || "").trim().toUpperCase();
  const normalizedRound = normalizeRound_(round) || "R0";
  if (!value) return "|" + normalizedRound;
  return (isProcurementId ? "ID:" : "") + value + "|" + normalizedRound;
}

function splitWorkspaceJson_(jsonText) {
  const text = String(jsonText == null ? "" : jsonText);
  if (!text) return [""];

  const chunks = [];
  for (let offset = 0; offset < text.length; offset += WORKSPACE_JSON_CHUNK_SIZE) {
    chunks.push(text.substring(offset, offset + WORKSPACE_JSON_CHUNK_SIZE));
  }
  return chunks.length ? chunks : [""];
}

function ensureWorkspaceChunkColumns_(sheet, chunkCount) {
  // Kolom A:G tetap seperti struktur lama. Bagian JSON kedua dan seterusnya
  // ditempatkan mulai kolom H agar Version/Updated By/Updated At tidak bergeser.
  const continuationCount = Math.max(0, Number(chunkCount || 1) - 1);
  const requiredColumns = 7 + continuationCount;
  const currentMaxColumns = sheet.getMaxColumns();
  if (currentMaxColumns < requiredColumns) {
    sheet.insertColumnsAfter(currentMaxColumns, requiredColumns - currentMaxColumns);
  }

  if (continuationCount > 0) {
    const headers = [];
    for (let index = 0; index < continuationCount; index++) {
      headers.push("Data JSON Part " + (index + 2));
    }
    sheet.getRange(1, 8, 1, continuationCount).setValues([headers]);
  }
}

function readWorkspaceJsonFromValues_(rowValues) {
  const values = Array.isArray(rowValues) ? rowValues : [];
  const chunks = [String(values[3] == null ? "" : values[3])];

  // Kolom H dan seterusnya hanya dipakai untuk lanjutan Data JSON.
  for (let columnIndex = 7; columnIndex < values.length; columnIndex++) {
    const part = String(values[columnIndex] == null ? "" : values[columnIndex]);
    if (part) chunks.push(part);
  }
  return chunks.join("");
}

function writeWorkspaceRecord_(sheet, rowNumber, record) {
  const jsonText = String(record.dataJson || "{}");
  const chunks = splitWorkspaceJson_(jsonText);
  ensureWorkspaceChunkColumns_(sheet, chunks.length);

  const maxColumns = Math.max(sheet.getLastColumn(), 7);
  // Hapus potongan lama terlebih dahulu. Ini penting ketika data yang sebelumnya
  // besar kemudian menjadi lebih kecil agar sisa JSON lama tidak ikut terbaca.
  if (maxColumns >= 8) {
    sheet.getRange(rowNumber, 8, 1, maxColumns - 7).clearContent();
  }

  sheet.getRange(rowNumber, 1, 1, 7).setValues([[
    record.key,
    record.noPR,
    record.round,
    chunks[0] || "",
    record.version,
    record.updatedBy,
    record.updatedAt
  ]]);
  sheet.getRange(rowNumber, 1, 1, 4).setNumberFormat("@");

  if (chunks.length > 1) {
    const continuations = chunks.slice(1);
    sheet.getRange(rowNumber, 8, 1, continuations.length).setValues([continuations]);
    sheet.getRange(rowNumber, 8, 1, continuations.length).setNumberFormat("@");
  }

  SpreadsheetApp.flush();

  // Verifikasi langsung agar tombol Save tidak pernah melaporkan sukses apabila
  // vendor ke-4 dan seterusnya belum benar-benar tersimpan utuh.
  const verifyWidth = Math.max(sheet.getLastColumn(), 7);
  const storedValues = sheet.getRange(rowNumber, 1, 1, verifyWidth).getValues()[0];
  const storedJson = readWorkspaceJsonFromValues_(storedValues);
  if (storedJson !== jsonText) {
    throw new Error(
      "Verifikasi penyimpanan workspace gagal. Data quotation belum tersimpan utuh " +
      "(" + storedJson.length + " dari " + jsonText.length + " karakter)."
    );
  }

  try {
    JSON.parse(storedJson || "{}");
  } catch (error) {
    throw new Error("Verifikasi JSON workspace gagal: " + errorMessage_(error));
  }

  return {
    jsonLength: jsonText.length,
    chunkCount: chunks.length
  };
}

function loadWorkspaceData_(noPR, round, procurementId) {
  const sheet = getOrCreateWorkspaceSheet_();
  const values = sheet.getDataRange().getValues();
  const primaryKey = procurementId
    ? workspaceKey_(procurementId, round, true)
    : workspaceKey_(noPR, round, false);
  const legacyKey = workspaceKey_(noPR, round, false);
  const acceptedKeys = procurementId
    ? [primaryKey, legacyKey]
    : [legacyKey];

  for (let index = 1; index < values.length; index++) {
    const storedKey = String(values[index][0] || "").trim();
    if (acceptedKeys.indexOf(storedKey) < 0) continue;

    const dataJson = readWorkspaceJsonFromValues_(values[index]);
    let data = {};
    try { data = JSON.parse(dataJson || "{}"); }
    catch (error) {
      return {
        success: false,
        message: "Data workspace rusak atau tidak lengkap: " + errorMessage_(error),
        jsonLength: dataJson.length
      };
    }

    return {
      success: true,
      found: true,
      key: storedKey,
      canonicalKey: primaryKey,
      legacyKey: storedKey !== primaryKey,
      procurementId: String(procurementId || "").trim(),
      noPR: values[index][1],
      round: values[index][2] || "R0",
      data: data,
      version: Number(values[index][4] || 1),
      updatedBy: values[index][5] || "",
      updatedAt: values[index][6] || "",
      jsonLength: dataJson.length,
      chunkCount: splitWorkspaceJson_(dataJson).length
    };
  }

  return {
    success: true,
    found: false,
    key: primaryKey,
    canonicalKey: primaryKey,
    procurementId: String(procurementId || "").trim(),
    noPR: String(noPR || "").trim(),
    round: normalizeRound_(round) || "R0",
    data: {},
    version: 0,
    jsonLength: 0,
    chunkCount: 0
  };
}

function saveWorkspaceData_(payload) {
  const noPR = String(payload.noPR || "").trim();
  const procurementId = String(payload.procurementId || payload["Procurement ID"] || "").trim();
  const round = normalizeRound_(payload.round) || "R0";
  if (!noPR) throw new Error("No PR wajib diisi sebelum menyimpan workspace.");

  const sheet = getOrCreateWorkspaceSheet_();
  const values = sheet.getDataRange().getValues();
  const key = procurementId
    ? workspaceKey_(procurementId, round, true)
    : workspaceKey_(noPR, round, false);
  const legacyKey = workspaceKey_(noPR, round, false);
  const incomingVersion = Number(payload.version || 0);
  const userEmail = Session.getActiveUser().getEmail() || String(payload.updatedBy || "");
  const updatedAt = new Date().toISOString();
  const dataJson = JSON.stringify(payload.data || {});

  for (let index = 1; index < values.length; index++) {
    const storedKey = String(values[index][0] || "").trim();
    if (storedKey !== key && !(procurementId && storedKey === legacyKey)) continue;

    const currentVersion = Number(values[index][4] || 1);
    if (incomingVersion && incomingVersion !== currentVersion) {
      return {
        success: false,
        conflict: true,
        message: "Data telah diperbarui user lain. Muat ulang sebelum menyimpan.",
        currentVersion: currentVersion,
        updatedBy: values[index][5] || "",
        updatedAt: values[index][6] || ""
      };
    }

    const nextVersion = currentVersion + 1;
    const rowNumber = index + 1;
    const storage = writeWorkspaceRecord_(sheet, rowNumber, {
      key: key,
      noPR: noPR,
      round: round,
      dataJson: dataJson,
      version: nextVersion,
      updatedBy: userEmail,
      updatedAt: updatedAt
    });

    return {
      success: true,
      message: "Workspace berhasil diperbarui dan diverifikasi.",
      key: key,
      version: nextVersion,
      updatedBy: userEmail,
      updatedAt: updatedAt,
      jsonLength: storage.jsonLength,
      chunkCount: storage.chunkCount
    };
  }

  const rowNumber = sheet.getLastRow() + 1;
  const version = 1;
  const storage = writeWorkspaceRecord_(sheet, rowNumber, {
    key: key,
    noPR: noPR,
    round: round,
    dataJson: dataJson,
    version: version,
    updatedBy: userEmail,
    updatedAt: updatedAt
  });

  return {
    success: true,
    message: "Workspace berhasil dibuat dan diverifikasi.",
    key: key,
    version: version,
    updatedBy: userEmail,
    updatedAt: updatedAt,
    jsonLength: storage.jsonLength,
    chunkCount: storage.chunkCount
  };
}


/* =========================================================
   EXTENDED REBID R3 DAN SETERUSNYA
========================================================= */

function getOrCreateRebidRequestSheet_() {
  const spreadsheet = getSpreadsheet_(REBID_REQUEST_SHEET_NAME);
  let sheet = spreadsheet.getSheetByName(REBID_REQUEST_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(REBID_REQUEST_SHEET_NAME);

  const headers = [
    "Key", "No PR", "Source Round", "Requested Round", "Reason",
    "File ID", "File URL", "File Name", "Requested By", "Requested At", "Status"
  ];
  if (sheet.getLastRow() < 1 || !sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0].some(Boolean)) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rebidRequestKey_(noPR, requestedRound) {
  return String(noPR || "").trim().toUpperCase() + "|" + (normalizeRound_(requestedRound) || "R3");
}

function loadRebidRequest_(noPR, requestedRound) {
  const sheet = getOrCreateRebidRequestSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const key = rebidRequestKey_(noPR, requestedRound);
  for (let index = 1; index < values.length; index++) {
    if (String(values[index][0] || "").trim() !== key) continue;
    return {
      success: true,
      found: true,
      key: key,
      noPR: values[index][1],
      sourceRound: values[index][2],
      requestedRound: values[index][3],
      reason: values[index][4],
      fileId: values[index][5],
      fileUrl: values[index][6],
      fileName: values[index][7],
      requestedBy: values[index][8],
      requestedAt: values[index][9],
      status: values[index][10]
    };
  }
  return { success: true, found: false, key: key };
}

function saveRebidRequest_(payload) {
  const noPR = String(payload.noPR || "").trim();
  const requestedRound = normalizeRound_(payload.requestedRound);
  if (!noPR) throw new Error("No PR wajib diisi.");
  if (!requestedRound || Number(requestedRound.substring(1)) < 3) {
    throw new Error("Extended rebid hanya berlaku mulai R3.");
  }
  if (!String(payload.reason || "").trim()) throw new Error("Alasan rebid wajib diisi.");
  if (!String(payload.fileUrl || "").trim()) throw new Error("Backup permintaan rebid wajib diunggah.");

  const sourceRound = "R" + (Number(requestedRound.substring(1)) - 1);
  const sheet = getOrCreateRebidRequestSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const key = rebidRequestKey_(noPR, requestedRound);
  const requestedBy = Session.getActiveUser().getEmail() || String(payload.requestedBy || "");
  const requestedAt = new Date().toISOString();
  const row = [
    key, noPR, sourceRound, requestedRound, String(payload.reason || "").trim(),
    payload.fileId || "", payload.fileUrl || "", payload.fileName || "",
    requestedBy, requestedAt, "BACKUP_UPLOADED"
  ];

  for (let index = 1; index < values.length; index++) {
    if (String(values[index][0] || "").trim() === key) {
      sheet.getRange(index + 1, 1, 1, row.length).setValues([row]);
      sheet.getRange(index + 1, 1, 1, 8).setNumberFormat("@");
      return { success: true, message: "Permintaan extended rebid diperbarui.", key: key, sourceRound: sourceRound, requestedRound: requestedRound, requestedBy: requestedBy, requestedAt: requestedAt, status: "BACKUP_UPLOADED" };
    }
  }

  const rowNumber = sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  sheet.getRange(rowNumber, 1, 1, 8).setNumberFormat("@");
  return { success: true, message: "Permintaan extended rebid disimpan.", key: key, sourceRound: sourceRound, requestedRound: requestedRound, requestedBy: requestedBy, requestedAt: requestedAt, status: "BACKUP_UPLOADED" };
}

/* =========================================================
   FORMAT NAMA FILE PROCUREMENT
========================================================= */

function formatRfqNumber_(value, statusPR) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;

  const number = digits.slice(-4).padStart(4, "0");
  const status = String(statusPR || "").trim().toUpperCase();
  let prefix = "";

  if (status === "BID") prefix = "S";
  else if (status === "TDR") prefix = "T";
  else if (status === "IOM" || status === "CTR") prefix = "D";
  else {
    const existing = raw.toUpperCase().match(/^([A-Z])\s*-/);
    prefix = existing ? existing[1] : "";
  }

  return prefix ? prefix + "-" + number : number;
}

function documentRoundSuffix_(round) {
  const normalized = normalizeRound_(round) || "R0";
  return normalized === "R0" ? "" : " " + normalized;
}

function buildProcurementDocumentFileName_(type, payload) {
  payload = payload || {};
  const noPR = cleanFileName_(payload.noPR || "");
  const description = cleanFileName_(payload.description || "");
  const roundSuffix = documentRoundSuffix_(payload.round || payload.roundpo);
  const documentType = String(type || "").trim().toUpperCase();

  let baseName = "";
  let extension = "";

  if (documentType === "CQS") {
    baseName = "CQS " + noPR + roundSuffix + " - " + description;
    extension = "xlsx";
  } else {
    // BidderList dan RFQ memakai nama yang sama; lokasinya berbeda.
    const rfq = formatRfqNumber_(
      payload.rfq || payload.noRFQ,
      payload.statusPR || payload.statuspr
    );
    baseName = rfq + " " + noPR + roundSuffix + " - " + description;
    extension = "xlsx";
  }

  return cleanFileName_(baseName) + "." + extension;
}

/* =========================================================
   MULTI-USER FOUNDATION (LOGIN/ROLE BELUM DIAKTIFKAN)
========================================================= */

function revisionPropertyKey_(sheetName) {
  return "MSW_SHEET_REVISION__" + String(sheetName || "").trim();
}

function getSheetRevision_(sheetName) {
  const value = PropertiesService.getScriptProperties().getProperty(revisionPropertyKey_(sheetName));
  return Number(value || 0);
}

function bumpSheetRevision_(sheetName) {
  const next = getSheetRevision_(sheetName) + 1;
  PropertiesService.getScriptProperties().setProperty(revisionPropertyKey_(sheetName), String(next));
  return next;
}

function ensureProcurementMetadataColumns_(sheet) {
  let headers = getHeadersOrThrow_(sheet);

  // Migrasi nama kolom tampilan tanpa memindahkan atau mengubah isi data.
  const legacyRoundIndex = findHeaderIndex_(headers, ["Round PO"]);
  const roundPrIndex = findHeaderIndex_(headers, ["Round PR"]);
  if (legacyRoundIndex >= 0 && roundPrIndex < 0) {
    sheet.getRange(1, legacyRoundIndex + 1).setValue("Round PR");
    headers[legacyRoundIndex] = "Round PR";
  }

  const systemAliases = {
    "USD/IDR Rate": ["USD/IDR Rate", "USD IDR Rate"],
    "USD/IDR Rate Date": ["USD/IDR Rate Date", "USD IDR Rate Date"],
    "USD/IDR Source": ["USD/IDR Source", "USD IDR Source"],
    "USD/IDR Locked": ["USD/IDR Locked", "USD IDR Locked"],
    "BidderList Saved Date": ["BidderList Saved Date"],
    "BidderList Saved By": ["BidderList Saved By"]
  };

  const missingMetadata = PROCUREMENT_METADATA_HEADERS.filter(function (header) {
    return findHeaderIndex_(headers, [header]) < 0;
  });
  const missingSystem = PROCUREMENT_SYSTEM_HEADERS.filter(function (header) {
    return findHeaderIndex_(headers, systemAliases[header] || [header]) < 0;
  });
  const missing = missingMetadata.concat(missingSystem);

  if (missing.length) {
    const startColumn = headers.length + 1;
    sheet.getRange(1, startColumn, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
    sheet.getRange(2, startColumn, Math.max(sheet.getMaxRows() - 1, 1), missing.length).setNumberFormat("@");
  }

  // Kolom teknis diletakkan di kanan dan disembunyikan agar tampilan sheet
  // yang sudah familiar tidak berubah.
  PROCUREMENT_METADATA_HEADERS.forEach(function (header) {
    const index = findHeaderIndex_(headers, [header]);
    if (index >= 0) {
      try { sheet.hideColumns(index + 1); } catch (ignore) {}
    }
  });
  PROCUREMENT_SYSTEM_HEADERS.forEach(function (header) {
    const index = findHeaderIndex_(headers, systemAliases[header] || [header]);
    if (index >= 0) {
      try { sheet.hideColumns(index + 1); } catch (ignore) {}
    }
  });

  ensureProcurementIdentifierMigration_(sheet, headers);
  return headers;
}

function procurementIdentifierMigrationKey_(sheet) {
  return "MSW_PROCUREMENT_IDENTIFIER_MIGRATION__" + String(sheet.getSheetId());
}

function ensureProcurementIdentifierMigration_(sheet, headers, force) {
  const properties = PropertiesService.getScriptProperties();
  const key = procurementIdentifierMigrationKey_(sheet);
  if (!force && properties.getProperty(key) === "1") return {
    skipped: true,
    updatedIds: 0,
    updatedYears: 0
  };

  let lock = null;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      return { skipped: true, locked: true, updatedIds: 0, updatedYears: 0 };
    }
    if (!force && properties.getProperty(key) === "1") {
      return { skipped: true, updatedIds: 0, updatedYears: 0 };
    }
    const result = backfillProcurementIdentifiers_(sheet, headers);
    properties.setProperty(key, "1");
    return result;
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (ignore) {}
    }
  }
}

function backfillProcurementIdentifiers_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { updatedIds: 0, updatedYears: 0 };

  const idIndex = findHeaderIndex_(headers, ["Procurement ID"]);
  const yearIndex = findHeaderIndex_(headers, ["PR Year"]);
  const prIndex = findHeaderIndex_(headers, ["No PR", "PR No", "PR Number"]);
  const assignIndex = findHeaderIndex_(headers, ["Assign PR Date", "Assign PR", "Assign Date"]);
  if (idIndex < 0 || yearIndex < 0) return { updatedIds: 0, updatedYears: 0 };

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const ids = [];
  const years = [];
  let updatedIds = 0;
  let updatedYears = 0;

  values.forEach(function (row) {
    const hasBusinessData = (prIndex >= 0 && String(row[prIndex] || "").trim()) ||
      (assignIndex >= 0 && String(row[assignIndex] || "").trim());
    let id = String(row[idIndex] || "").trim();
    let year = row[yearIndex];

    if (hasBusinessData && !id) {
      id = "PROC-" + Utilities.getUuid();
      updatedIds++;
    }

    if (hasBusinessData && !String(year || "").trim() && assignIndex >= 0) {
      try {
        year = procurementYearFromAssignDate_(row[assignIndex]);
        updatedYears++;
      } catch (ignoreInvalidAssignDate) {
        year = "";
      }
    }

    ids.push([id]);
    years.push([year]);
  });

  if (updatedIds) {
    sheet.getRange(2, idIndex + 1, ids.length, 1).setNumberFormat("@").setValues(ids);
  }
  if (updatedYears) {
    sheet.getRange(2, yearIndex + 1, years.length, 1).setNumberFormat("0").setValues(years);
  }

  return { updatedIds: updatedIds, updatedYears: updatedYears };
}

function procurementAssignDateFromObject_(row) {
  return readFirstPresent_(row || {}, [
    "Assign PR Date", "Assign PR", "Assign Date", "assignprdate"
  ]);
}

function procurementYearFromAssignDate_(value) {
  const parsed = parseProcurementDateValue_(value);
  if (!(parsed instanceof Date) || isNaN(parsed.getTime())) {
    throw new Error("Assign PR Date wajib diisi dengan format tanggal yang valid.");
  }
  return parsed.getFullYear();
}

function normalizeProcurementPR_(value) {
  return String(value == null ? "" : value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function procurementStatusAllowsBlankAssign_(statusPR) {
  const status = String(statusPR == null ? "" : statusPR)
    .trim()
    .toUpperCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");

  return ["CANCEL", "CANCELLED", "CANCELED", "PRB"].indexOf(status) >= 0;
}

function procurementBusinessKey_(noPR, assignDate, statusPR) {
  const normalizedPR = normalizeProcurementPR_(noPR);
  if (!normalizedPR) throw new Error("No PR wajib diisi.");

  const rawAssignDate = String(assignDate == null ? "" : assignDate).trim();
  if (!rawAssignDate && procurementStatusAllowsBlankAssign_(statusPR)) {
    return "NO_ASSIGN|" + normalizedPR;
  }

  return procurementYearFromAssignDate_(assignDate) + "|" + normalizedPR;
}

function mergeImportProcurementRow_(oldRow, incomingRow) {
  const result = Object.assign({}, oldRow || {});
  Object.keys(incomingRow || {}).forEach(function (header) {
    const value = incomingRow[header];
    const isSystemField = PROCUREMENT_METADATA_HEADERS.indexOf(header) >= 0 ||
      ["PR Year", "Created At", "Created By", "Updated At", "Updated By"].indexOf(header) >= 0;
    if (isSystemField) return;
    if (value == null || String(value).trim() === "") return;
    result[header] = value;
  });
  return result;
}

function ensureUniqueProcurementPR_(sheet, noPR, assignDate, excludedRowNumber) {
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return;
  const headers = values[0].map(function (v) { return String(v || "").trim(); });
  const prColumn = findHeaderIndex_(headers, ["No PR", "PR No", "PR Number"]);
  const assignColumn = findHeaderIndex_(headers, ["Assign PR Date", "Assign PR", "Assign Date"]);
  if (prColumn < 0 || assignColumn < 0) return;
  const key = procurementBusinessKey_(noPR, assignDate);
  for (let index = 1; index < values.length; index++) {
    if (index + 1 === Number(excludedRowNumber || 0)) continue;
    const rowPR = String(values[index][prColumn] || "").trim();
    const rowDate = values[index][assignColumn];
    if (!rowPR || !rowDate) continue;
    try {
      if (procurementBusinessKey_(rowPR, rowDate) === key) {
        throw new Error("No PR '" + noPR + "' untuk tahun " + procurementYearFromAssignDate_(assignDate) + " sudah digunakan.");
      }
    } catch (error) {
      if (String(error && error.message || "").indexOf("sudah digunakan") >= 0) throw error;
    }
  }
}

function currentActorEmail_(payload) {
  return String(
    Session.getActiveUser().getEmail() ||
    readFirstPresent_(payload || {}, ["updatedBy", "ownerEmail", "Owner Email", "Email Perusahaan"]) ||
    ""
  ).trim().toLowerCase();
}

function valueByHeader_(row, headers, header) {
  const index = headers.indexOf(header);
  return index >= 0 ? (row[index] || "") : "";
}


function normalizeBuyerIdentity_(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function buyerIdentityMatches_(left, right) {
  const a = normalizeBuyerIdentity_(left);
  const b = normalizeBuyerIdentity_(right);
  if (!a || !b) return false;
  return a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0;
}

function getRequiredImportActorProfile_() {
  const profile = getCurrentUserProfile_() || {};
  const email = String(profile.email || "").trim().toLowerCase();
  const name = String(profile.name || "").trim();
  const role = normalizeRole_(profile.role || "");

  if (!email) {
    throw new Error(
      "Akun pengguna tidak terbaca. Pastikan login masih aktif dan Web App menggunakan deployment /exec yang benar."
    );
  }

  if (!name) {
    throw new Error(
      "Email '" + email + "' belum memiliki Name pada sheet Users."
    );
  }

  return {
    email: email,
    name: name,
    role: role,
    phone: String(profile.phone || "").trim()
  };
}

function importMatchKey_(noPR, assignDate) {
  const normalizedPR = normalizeProcurementPR_(noPR);
  if (!normalizedPR) return "";
  const rawAssign = String(assignDate == null ? "" : assignDate).trim();
  if (!rawAssign) return "";
  try {
    return procurementYearFromAssignDate_(assignDate) + "|" + normalizedPR;
  } catch (ignoreInvalidDate) {
    return "";
  }
}

/**
 * Smart Import untuk Super Admin, Procurement Admin, dan Buyer.
 * - No PR dan Assign Date tidak wajib;
 * - keduanya hanya menjadi kunci pencocokan bila sama-sama tersedia;
 * - Import Action: UPDATE, NEW, atau SKIP;
 * - Buyer hanya dapat memperbarui record miliknya;
 * - Admin/Super Admin dapat mempertahankan Owner dari file/data lama.
 */
function importProcurementRowsByBuyer_(sheet, rows, expectedRevision) {
  const currentRevision = getSheetRevision_(sheet.getName());
  const suppliedRevision = expectedRevision === "" || expectedRevision == null
    ? null
    : Number(expectedRevision);

  if (suppliedRevision !== null && suppliedRevision !== currentRevision) {
    return {
      success: false,
      conflict: true,
      message: "Data Procurement berubah sejak halaman dibuka. Muat ulang atau ulangi Smart Import.",
      currentRevision: currentRevision
    };
  }

  const actor = getRequiredImportActorProfile_();
  const isBuyer = actor.role === "BUYER";
  const incomingRows = Array.isArray(rows) ? rows : [];
  if (!incomingRows.length) throw new Error("Tidak ada baris Procurement untuk diimpor.");

  const headers = ensureProcurementMetadataColumns_(sheet);
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const lastColumn = headers.length;
  const existingRawRows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues()
    : [];
  const existingDisplayRows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getDisplayValues()
    : [];
  const prIndex = findHeaderIndex_(headers, ["No PR", "PR No", "PR Number"]);
  const assignIndex = findHeaderIndex_(headers, ["Assign PR Date", "Assign PR", "Assign Date"]);
  const idIndex = findHeaderIndex_(headers, ["Procurement ID"]);

  const existingByKey = {};
  const existingById = {};
  existingDisplayRows.forEach(function (displayRow, index) {
    const object = {};
    headers.forEach(function (header, columnIndex) {
      if (header) object[header] = displayRow[columnIndex];
    });
    const procurementId = idIndex >= 0 ? String(displayRow[idIndex] || "").trim() : "";
    if (procurementId) {
      existingById[procurementId] = { index: index, rowNumber: index + 2, object: object };
    }
    const noPR = prIndex >= 0 ? String(displayRow[prIndex] || "").trim() : "";
    const assignDate = assignIndex >= 0 ? displayRow[assignIndex] : "";
    const key = importMatchKey_(noPR, assignDate);
    if (key && !existingByKey[key]) {
      existingByKey[key] = { index: index, rowNumber: index + 2, object: object };
    }
  });

  const ownershipConflicts = [];
  const prepared = [];
  const now = new Date().toISOString();

  incomingRows.forEach(function (source) {
    const incoming = Object.assign({}, source || {});
    const action = String(
      incoming["Import Action"] || incoming.__importAction || "NEW"
    ).trim().toUpperCase();
    delete incoming["Import Action"];
    delete incoming.__importAction;
    if (action === "SKIP") return;

    const noPR = String(incoming["No PR"] || incoming.noPR || "").trim();
    const assignDate = procurementAssignDateFromObject_(incoming);
    const incomingId = String(incoming["Procurement ID"] || incoming.procurementId || "").trim();
    const key = importMatchKey_(noPR, assignDate);

    let existingEntry = null;
    if (action === "UPDATE") {
      existingEntry = (incomingId && existingById[incomingId]) ||
        (key && existingByKey[key]) ||
        null;
    }
    if (action === "NEW") existingEntry = null;

    const old = existingEntry ? existingEntry.object : {};
    const oldOwnerEmail = String(old["Owner Email"] || "").trim().toLowerCase();
    const oldCreatedBy = String(old["Created By"] || "").trim().toLowerCase();
    const oldUpdatedBy = String(old["Updated By"] || "").trim().toLowerCase();

    if (isBuyer && existingEntry) {
      if (oldOwnerEmail && oldOwnerEmail !== actor.email) {
        ownershipConflicts.push((noPR || incomingId || "Baris tanpa No PR") + " (milik " + oldOwnerEmail + ")");
        return;
      }
      if (
        !oldOwnerEmail &&
        oldCreatedBy &&
        oldCreatedBy !== actor.email &&
        oldUpdatedBy !== actor.email
      ) {
        ownershipConflicts.push((noPR || incomingId || "Baris tanpa No PR") + " (dibuat oleh " + oldCreatedBy + ")");
        return;
      }
    }

    const merged = mergeImportProcurementRow_(old, incoming);
    merged["No PR"] = noPR;

    let prYear = "";
    if (String(assignDate == null ? "" : assignDate).trim()) {
      try { prYear = procurementYearFromAssignDate_(assignDate); } catch (ignoreInvalidAssignDate) { prYear = ""; }
    }
    merged["PR Year"] = prYear;

    const generatedId = "PROC-" + Utilities.getUuid();
    merged["Procurement ID"] = existingEntry
      ? (old["Procurement ID"] || incomingId || generatedId)
      : (action === "NEW" ? generatedId : (incomingId || generatedId));

    const incomingOwnerName = String(incoming["Owner Name"] || incoming.ownerName || "").trim();
    const incomingOwnerEmail = String(incoming["Owner Email"] || incoming.ownerEmail || "").trim().toLowerCase();

    merged["Owner Name"] = isBuyer
      ? actor.name
      : (incomingOwnerName || old["Owner Name"] || actor.name);
    merged["Owner Email"] = isBuyer
      ? actor.email
      : (incomingOwnerEmail || old["Owner Email"] || actor.email);
    merged["Owner NIP"] = incoming["Owner NIP"] || old["Owner NIP"] || "";

    merged["Version"] = existingEntry
      ? Number(old["Version"] || 0) + 1
      : 1;
    merged["Created At"] = old["Created At"] || now;
    merged["Created By"] = old["Created By"] || actor.email;
    merged["Updated At"] = now;
    merged["Updated By"] = actor.email;

    prepared.push({
      noPR: noPR,
      businessKey: key || ("ID|" + merged["Procurement ID"]),
      existingEntry: existingEntry,
      row: merged
    });
  });

  if (ownershipConflicts.length) {
    throw new Error(
      "Import dibatalkan agar data Buyer lain tidak tertimpa. Konflik: " +
      ownershipConflicts.slice(0, 10).join(", ") +
      (ownershipConflicts.length > 10 ? " dan lainnya." : ".")
    );
  }

  const finalRows = existingRawRows.map(function (row) { return row.slice(); });
  let addedCount = 0;
  let updatedCount = 0;

  prepared.forEach(function (item) {
    const values = headers.map(function (header) {
      const value = Object.prototype.hasOwnProperty.call(item.row, header)
        ? item.row[header]
        : "";
      return normalizeProcurementValueForSheet_(header, value);
    });

    if (item.existingEntry) {
      finalRows[item.existingEntry.index] = values;
      updatedCount++;
    } else {
      finalRows.push(values);
      addedCount++;
    }
  });

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (finalRows.length) {
    sheet.getRange(2, 1, finalRows.length, headers.length).setValues(finalRows);
    forceTextColumns_(sheet, headers, 2, finalRows.length);
    applyProcurementDateFormats_(sheet, headers, 2, finalRows.length);
  }
  if (lastRow > finalRows.length + 1) {
    sheet.getRange(finalRows.length + 2, 1, lastRow - finalRows.length - 1, headers.length).clearContent();
  }
  sheet.setFrozenRows(1);

  const revision = bumpSheetRevision_(sheet.getName());
  return {
    success: true,
    message: "Smart Import berhasil. Kolom kosong yang tidak wajib tetap diterima.",
    importedCount: prepared.length,
    addedCount: addedCount,
    updatedCount: updatedCount,
    totalRowCount: finalRows.length,
    ownerName: actor.name,
    ownerEmail: actor.email,
    revision: revision
  };
}

function replaceProcurementRowsSafely_(sheet, rows, expectedRevision) {
  const currentRevision = getSheetRevision_(sheet.getName());
  const suppliedRevision = expectedRevision === "" || expectedRevision == null
    ? null
    : Number(expectedRevision);

  if (suppliedRevision !== null && suppliedRevision !== currentRevision) {
    return {
      success: false,
      conflict: true,
      message: "Data Procurement berubah sejak halaman dibuka. Muat ulang sebelum Import atau All Clear.",
      currentRevision: currentRevision
    };
  }

  const headers = ensureProcurementMetadataColumns_(sheet);
  const existingValues = sheet.getDataRange().getDisplayValues();
  const existingByPR = {};
  if (existingValues.length > 1) {
    const currentHeaders = existingValues[0].map(function (v) { return String(v || "").trim(); });
    const prIndex = findHeaderIndex_(currentHeaders, ["No PR", "PR No", "PR Number"]);
    const assignIndex = findHeaderIndex_(currentHeaders, ["Assign PR Date", "Assign PR", "Assign Date"]);
    existingValues.slice(1).forEach(function (row) {
      const noPR = prIndex >= 0 ? String(row[prIndex] || "").trim() : "";
      const assignDate = assignIndex >= 0 ? row[assignIndex] : "";
      if (!noPR || !assignDate) return;
      let key;
      try { key = procurementBusinessKey_(noPR, assignDate); } catch (ignoreInvalidExistingDate) { return; }
      const obj = {};
      currentHeaders.forEach(function (header, i) { if (header) obj[header] = row[i]; });
      existingByPR[key] = obj;
    });
  }

  const now = new Date().toISOString();
  const actor = currentActorEmail_({});
  const normalized = (Array.isArray(rows) ? rows : []).map(function (incoming) {
    const row = Object.assign({}, incoming || {});
    const noPR = String(row["No PR"] || row.noPR || "").trim();
    const assignDate = procurementAssignDateFromObject_(row);
    const prYear = procurementYearFromAssignDate_(assignDate);
    const old = existingByPR[procurementBusinessKey_(noPR, assignDate)] || {};
    row["PR Year"] = prYear;
    row["Procurement ID"] = row["Procurement ID"] || old["Procurement ID"] || ("PROC-" + Utilities.getUuid());
    row["Owner Name"] = row["Owner Name"] || old["Owner Name"] || "";
    row["Owner NIP"] = row["Owner NIP"] || old["Owner NIP"] || "";
    row["Owner Email"] = row["Owner Email"] || old["Owner Email"] || "";
    row["Version"] = Number(old["Version"] || row["Version"] || 0) + 1;
    row["Created At"] = old["Created At"] || row["Created At"] || now;
    row["Created By"] = old["Created By"] || row["Created By"] || actor;
    row["Updated At"] = now;
    row["Updated By"] = actor;
    return row;
  });

  const values = normalized.map(function (row) {
    return headers.map(function (header) {
      const value = Object.prototype.hasOwnProperty.call(row, header) ? row[header] : "";
      return normalizeProcurementValueForSheet_(header, value);
    });
  });

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const lastColumn = Math.max(sheet.getLastColumn(), headers.length, 1);
  sheet.getRange(1, 1, lastRow, lastColumn).clearContent();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (values.length) {
    forceTextColumns_(sheet, headers, 2, values.length);
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    applyProcurementDateFormats_(sheet, headers, 2, values.length);
  }
  sheet.setFrozenRows(1);
  const revision = bumpSheetRevision_(sheet.getName());
  return {
    success: true,
    message: values.length ? "Import Procurement berhasil disimpan dengan perlindungan revisi." : "Semua data Procurement berhasil dihapus.",
    rowCount: values.length,
    revision: revision
  };
}

/* =========================================================
   GENERIC HELPERS
========================================================= */

function normalizeSpreadsheetGroup_(value) {
  const group = String(value || "").trim().toUpperCase();
  return ["CORE", "OPERATION", "ACTIVITY", "SECURITY", "AGREEMENT"].indexOf(group) >= 0
    ? group
    : "";
}

function spreadsheetGroupForSheet_(sheetName) {
  const explicitGroup = normalizeSpreadsheetGroup_(sheetName);
  if (explicitGroup) return explicitGroup;

  const name = String(sheetName || "").trim().toLowerCase();
  if (name === String(USERS_SHEET_NAME).toLowerCase()) return "SECURITY";
  if (name === "agreement tracker") return "AGREEMENT";
  if (name === String(RECENT_ACTIVITY_SHEET_NAME).toLowerCase() ||
      name === String(AUDIT_LOG_SHEET_NAME).toLowerCase()) return "ACTIVITY";
  if (name === String(DOCUMENT_WORKSPACE_SHEET_NAME).toLowerCase() ||
      name === String(VENDOR_REQUESTS_SHEET_NAME).toLowerCase() ||
      name === String(REBID_REQUEST_SHEET_NAME).toLowerCase()) return "OPERATION";

  // Admin, Company, dan Contract Management tetap berada di Core Master.
  // Agreement Tracker secara eksplisit dirutekan ke spreadsheet AGREEMENT di atas.
  return "CORE";
}

function spreadsheetIdForGroup_(group) {
  const normalized = normalizeSpreadsheetGroup_(group) || "CORE";
  const ids = {
    CORE: CORE_SPREADSHEET_ID,
    OPERATION: OPERATION_SPREADSHEET_ID,
    ACTIVITY: ACTIVITY_SPREADSHEET_ID,
    SECURITY: SECURITY_SPREADSHEET_ID,
    AGREEMENT: AGREEMENT_TRACKER_SPREADSHEET_ID
  };
  const id = String(ids[normalized] || "").trim();
  if (!id) {
    throw new Error(
      "Spreadsheet ID untuk grup '" + normalized + "' belum dikonfigurasi. " +
      "Periksa Apps Script > Project Settings > Script Properties."
    );
  }
  return id;
}

/**
 * Membuka database berdasarkan nama sheet atau nama grup.
 * - CORE: Admin, Company, Contract
 * - OPERATION: Procurement Workspace, Vendor Requests, Rebid Requests
 * - ACTIVITY: Audit Log, Recent Activity
 * - SECURITY: Users
 * - AGREEMENT: Agreement Tracker
 */
function getSpreadsheet_(sheetNameOrGroup) {
  const group = spreadsheetGroupForSheet_(sheetNameOrGroup);
  return SpreadsheetApp.openById(spreadsheetIdForGroup_(group));
}

function testFourSpreadsheetRouting() {
  const expectedSheets = {
    CORE: [DEFAULT_SHEET_NAME, DEFAULT_COMPANY_SHEET_NAME, "Contract"],
    OPERATION: [DOCUMENT_WORKSPACE_SHEET_NAME, VENDOR_REQUESTS_SHEET_NAME, REBID_REQUEST_SHEET_NAME],
    ACTIVITY: [AUDIT_LOG_SHEET_NAME, RECENT_ACTIVITY_SHEET_NAME],
    SECURITY: [USERS_SHEET_NAME],
    AGREEMENT: ["Agreement Tracker"]
  };
  const result = { success: true, databases: {} };

  Object.keys(expectedSheets).forEach(function (group) {
    const spreadsheet = getSpreadsheet_(group);
    const sheetStatus = {};
    expectedSheets[group].forEach(function (sheetName) {
      sheetStatus[sheetName] = Boolean(spreadsheet.getSheetByName(sheetName));
    });
    result.databases[group] = {
      id: spreadsheet.getId(),
      name: spreadsheet.getName(),
      sheets: sheetStatus
    };
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function getSheetOrThrow_(sheetName) {
  sheetName = assertAllowedClientSheet_(sheetName);
  const sheet = String(sheetName).trim().toLowerCase() === "agreement tracker"
    ? ensureAgreementTrackerSheet_()
    : getSpreadsheet_(sheetName).getSheetByName(sheetName);

  if (!sheet) {
    throw new Error("Sheet '" + sheetName + "' tidak ditemukan.");
  }

  return sheet;
}

function getHeadersOrThrow_(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throw new Error("Sheet '" + sheet.getName() + "' belum mempunyai header.");
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(function (value) { return String(value || "").trim(); });

  if (!headers.some(Boolean)) {
    throw new Error("Header pada sheet '" + sheet.getName() + "' masih kosong.");
  }

  return headers;
}

function deleteRowByKey_(sheet, headerAliases, keyValue, entityName) {
  const values = sheet.getDataRange().getDisplayValues();

  if (!values.length) {
    return {
      success: false,
      message: "Sheet masih kosong."
    };
  }

  const headers = values[0].map(function (value) {
    return String(value || "").trim();
  });

  const keyColumn = findHeaderIndex_(headers, headerAliases);

  if (keyColumn < 0) {
    return {
      success: false,
      message: "Kolom kunci tidak ditemukan: " + headerAliases.join(" / ")
    };
  }

  const key = String(keyValue == null ? "" : keyValue).trim();

  if (!key) {
    return {
      success: false,
      message: "Nilai kunci untuk delete masih kosong."
    };
  }

  for (let index = 1; index < values.length; index++) {
    if (String(values[index][keyColumn] || "").trim() === key) {
      sheet.deleteRow(index + 1);

      return {
        success: true,
        message: "Data " + entityName + " berhasil dihapus.",
        deletedKey: key
      };
    }
  }

  return {
    success: false,
    message: entityName + " dengan kunci '" + key + "' tidak ditemukan."
  };
}

function procurementDateHeaderKey_(header) {
  return String(header == null ? "" : header)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function isProcurementDateHeader_(header) {
  const key = procurementDateHeaderKey_(header);
  if (!key) return false;
  if (PROCUREMENT_DATE_HEADER_KEYS[key]) return true;
  return /^r[0-5](startdate|finishdate)$/.test(key);
}

function parseProcurementDateValue_(value) {
  if (value == null || value === "") return "";

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? value : new Date(
      value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0
    );
  }

  if (typeof value === "number" && isFinite(value)) {
    // Excel serial date, umum pada hasil import XLSX.
    if (value >= 1 && value <= 100000) {
      const epoch = new Date(1899, 11, 30, 12, 0, 0);
      epoch.setDate(epoch.getDate() + Math.floor(value));
      return epoch;
    }
    return value;
  }

  const original = String(value).trim();
  if (!original) return "";

  // yyyy-mm-dd atau ISO timestamp. Bagian waktu sengaja diabaikan untuk
  // kolom tanggal bisnis agar tidak bergeser karena timezone.
  let match = original.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (match) {
    return buildSafeProcurementDate_(Number(match[1]), Number(match[2]), Number(match[3]), original);
  }

  // dd/mm/yyyy, dd-mm-yyyy, atau dd.mm.yyyy.
  match = original.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    return buildSafeProcurementDate_(year, Number(match[2]), Number(match[1]), original);
  }

  const monthMap = {
    jan: 1, january: 1, januari: 1,
    feb: 2, february: 2, februari: 2,
    mar: 3, march: 3, maret: 3,
    apr: 4, april: 4,
    may: 5, mei: 5,
    jun: 6, june: 6, juni: 6,
    jul: 7, july: 7, juli: 7,
    aug: 8, august: 8, agu: 8, agustus: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, okt: 10, oktober: 10,
    nov: 11, november: 11,
    dec: 12, december: 12, des: 12, desember: 12
  };

  // dd MMM yyyy, menerima singkatan Inggris maupun Indonesia.
  match = original.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
  if (match) {
    const month = monthMap[String(match[2]).toLowerCase()];
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    if (month) return buildSafeProcurementDate_(year, month, Number(match[1]), original);
  }

  return value;
}

function buildSafeProcurementDate_(year, month, day, fallback) {
  year = Number(year);
  month = Number(month);
  day = Number(day);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return fallback;

  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return fallback;

  return date;
}

function normalizeProcurementValueForSheet_(header, value) {
  if (isProcurementDateHeader_(header)) {
    return parseProcurementDateValue_(value);
  }
  return normalizeCellValue_(value);
}

function applyProcurementDateFormats_(sheet, headers, startRow, rowCount) {
  if (!rowCount || rowCount < 1) return;

  headers.forEach(function (header, index) {
    if (!isProcurementDateHeader_(header)) return;
    sheet
      .getRange(startRow, index + 1, rowCount, 1)
      .setNumberFormat(PROCUREMENT_DATE_NUMBER_FORMAT);
  });
}

function copyProcurementRowFormat_(sheet, targetRow, columnCount) {
  if (targetRow <= 2 || columnCount < 1 || sheet.getMaxRows() < 2) return;

  const sourceRow = 2;
  try {
    sheet.getRange(sourceRow, 1, 1, columnCount).copyTo(
      sheet.getRange(targetRow, 1, 1, columnCount),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false
    );
  } catch (ignoreFormatCopy) {}

  try {
    sheet.getRange(sourceRow, 1, 1, columnCount).copyTo(
      sheet.getRange(targetRow, 1, 1, columnCount),
      SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
      false
    );
  } catch (ignoreValidationCopy) {}

  try { sheet.setRowHeight(targetRow, sheet.getRowHeight(sourceRow)); }
  catch (ignoreRowHeight) {}
}

function procurementDateMigrationKey_(sheet) {
  return "PROCUREMENT_DATE_MIGRATION_R27_" + String(sheet.getSheetId());
}

function ensureProcurementDateMigration_(sheet) {
  const properties = PropertiesService.getScriptProperties();
  const key = procurementDateMigrationKey_(sheet);
  if (properties.getProperty(key) === "1") return;

  normalizeExistingProcurementDates_(sheet);
  properties.setProperty(key, "1");
}

function normalizeExistingProcurementDates_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) {
    return { success: true, message: "Tidak ada data tanggal yang perlu dinormalisasi.", updatedCells: 0 };
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(function (value) { return String(value || "").trim(); });
  const rawValues = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  let updatedCells = 0;

  headers.forEach(function (header, columnIndex) {
    if (!isProcurementDateHeader_(header)) return;

    const columnValues = rawValues.map(function (row) {
      const current = row[columnIndex];
      const normalized = parseProcurementDateValue_(current);
      if (
        normalized instanceof Date &&
        !(current instanceof Date && current.getTime() === normalized.getTime())
      ) updatedCells++;
      return [normalized];
    });

    sheet.getRange(2, columnIndex + 1, columnValues.length, 1)
      .setValues(columnValues)
      .setNumberFormat(PROCUREMENT_DATE_NUMBER_FORMAT);
  });

  return {
    success: true,
    message: "Format tanggal Procurement berhasil diseragamkan menjadi dd MMM yyyy.",
    updatedCells: updatedCells,
    rowCount: lastRow - 1
  };
}

function forceTextColumns_(sheet, headers, startRow, rowCount) {
  if (!rowCount || rowCount < 1) return;

  const textColumns = [
    "No PR",
    "PR No",
    "PR Number",
    "RFQ",
    "No PO",
    "No Company",
    "Company No",
    "Vendor No",
    "Company Phone",
    "Phone",
    "Folder ID"
  ];

  textColumns.forEach(function (columnName) {
    const columnIndex = headers.indexOf(columnName);

    if (columnIndex >= 0) {
      sheet
        .getRange(startRow, columnIndex + 1, rowCount, 1)
        .setNumberFormat("@");
    }
  });
}

function findHeaderIndex_(headers, aliases) {
  const normalizedHeaders = headers.map(normalizeHeader_);

  for (let index = 0; index < aliases.length; index++) {
    const found = normalizedHeaders.indexOf(normalizeHeader_(aliases[index]));
    if (found >= 0) return found;
  }

  return -1;
}

function copyField_(target, source, sourceKeys, targetHeaders) {
  const result = readFirstPresentWithFlag_(source, sourceKeys);
  if (!result.found) return;

  targetHeaders.forEach(function (header) {
    target[header] = normalizeCellValue_(result.value);
  });
}

function readFirstPresent_(object, keys) {
  return readFirstPresentWithFlag_(object, keys).value;
}

function readFirstPresentWithFlag_(object, keys) {
  object = object || {};

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];

    if (Object.prototype.hasOwnProperty.call(object, key)) {
      return {
        found: true,
        value: object[key]
      };
    }
  }

  return {
    found: false,
    value: undefined
  };
}

function getObjectValue_(object, header) {
  if (object && Object.prototype.hasOwnProperty.call(object, header)) {
    return normalizeCellValue_(object[header]);
  }

  return "";
}

function normalizeCellValue_(value) {
  if (value == null) return "";

  if (typeof value === "object" && !(value instanceof Date)) {
    return JSON.stringify(value);
  }

  return value;
}

function normalizeHeader_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeRound_(value) {
  const match = String(value || "")
    .toUpperCase()
    .match(/R\s*([0-5])/);

  return match ? "R" + match[1] : "";
}

function getChildFolder_(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : null;
}

function getOrCreateChildFolder_(parentFolder, name) {
  return getChildFolder_(parentFolder, name) || parentFolder.createFolder(name);
}

function folderInfo_(folder) {
  return {
    id: folder.getId(),
    url: folder.getUrl(),
    name: folder.getName()
  };
}

function cleanFolderName_(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|#%{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanFileName_(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|#%{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAuditMutationAction_(action, body) {
  const normalized = String(action || "").trim();
  const excluded = [
    "", "getFolderStructure", "GET_PROCUREMENT_DOCUMENTS",
    "LIST_PROCUREMENT_FILES", "LOOKUP_ITEM_NUMBER", "LOG_ACTIVITY"
  ];
  if (excluded.indexOf(normalized) >= 0) {
    return Boolean(!normalized && body && body.sheet && Array.isArray(body.rows));
  }
  return true;
}

function auditEntityFromAction_(action) {
  const text = String(action || "").toUpperCase();
  if (text.indexOf("COMPANY") >= 0) return "Company";
  if (text.indexOf("WORKSPACE") >= 0 || text.indexOf("BIDDER") >= 0 || text.indexOf("REBID") >= 0) return "Workspace";
  if (text.indexOf("FOLDER") >= 0 || text.indexOf("FILE") >= 0 || text.indexOf("PDF") >= 0 || text.indexOf("OUTLOOK") >= 0) return "Document";
  if (text.indexOf("PROCUREMENT") >= 0 || ["ADD", "EDIT", "DELETE", "DELETE_ROW"].indexOf(text) >= 0) return "Procurement";
  return "System";
}

function auditRecordKey_(body) {
  const source = body && (body.data || body.row || body) || {};
  return String(
    source.procurementId || source["Procurement ID"] ||
    source.originalNoCompany || source.noCompany || source["No Company"] ||
    source.originalPR || source.noPR || source["No PR"] ||
    source.workspaceKey || source.key || ""
  ).trim().substring(0, 240);
}

function auditSummary_(result) {
  const safe = result && typeof result === "object" ? result : {};
  const summary = {
    message: String(safe.message || "").substring(0, 500),
    created: Number(safe.created || safe.added || 0),
    updated: Number(safe.updated || 0),
    deleted: Number(safe.deleted || 0),
    skipped: Number(safe.skipped || safe.unchanged || 0),
    invalid: Number(safe.invalid || 0)
  };
  return JSON.stringify(summary);
}

function ensureAuditLogSheet_() {
  const spreadsheet = getSpreadsheet_(AUDIT_LOG_SHEET_NAME);
  let sheet = spreadsheet.getSheetByName(AUDIT_LOG_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(AUDIT_LOG_SHEET_NAME);

  const headers = [
    "Timestamp", "Actor Email", "Actor Name", "Role", "Action",
    "Entity", "Record Key", "Success", "Summary"
  ];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function writeAuditLog_(action, body, profile, result) {
  if (!isAuditMutationAction_(action, body)) return;

  const activeProfile = profile || getCurrentUserProfile_() || {};
  const actorEmail = String(activeProfile.email || Session.getActiveUser().getEmail() || "").trim();
  const sheet = ensureAuditLogSheet_();
  sheet.appendRow([
    new Date(),
    actorEmail,
    String(activeProfile.name || "").trim(),
    String(activeProfile.role || "").trim(),
    String(action || "UNKNOWN").trim(),
    auditEntityFromAction_(action),
    auditRecordKey_(body),
    !(result && result.success === false),
    auditSummary_(result)
  ]);
}

function auditedJsonOutput_(action, body, profile, result) {
  try {
    writeAuditLog_(action, body, profile, result);
  } catch (ignoreAudit) {}
  return jsonOutput_(result);
}

function errorMessage_(error) {
  if (!error) return "Unknown error";
  return error.message || error.toString();
}

function jsonOutput_(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
   OPTIONAL TEST FUNCTIONS
   Jalankan manual satu kali untuk meminta izin Spreadsheet/Drive.
========================================================= */

function testConnection() {
  Logger.log(loadSheetData_(DEFAULT_SHEET_NAME));
}

function testCreateFolder() {
  Logger.log(ensureProcurementFolderStructure_({
    noPR: "PRTEST002",
    description: "Testing Folder",
    rounds: ["R0", "R1", "R2"]
  }));
}

function testMasterTemplates() {
  Logger.log(JSON.stringify(listMasterTemplates_(), null, 2));
}

/* =========================================================
   PDF EXPORT (Bidderlist / RFQ / CQS)
   Prasyarat: aktifkan "Drive API" (Advanced Google Service, v3)
   di menu Services pada editor Apps Script. Tanpa ini, fungsi
   di bawah akan gagal dengan error "Drive is not defined".
========================================================= */
function exportXlsxAsPdf_(payload) {
  if (!payload || !payload.fileData) {
    throw new Error("Isi file (fileData) kosong, tidak ada yang bisa dikonversi ke PDF.");
  }

  const fileName = cleanFileName_(payload.fileName || "Document") + ".xlsx";
  const pdfName = cleanFileName_(payload.fileName || "Document") + ".pdf";

  let base64Data = String(payload.fileData || "");
  if (base64Data.indexOf(",") >= 0) base64Data = base64Data.split(",").pop();
  const bytes = Utilities.base64Decode(base64Data);
  const xlsxBlob = Utilities.newBlob(
    bytes,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName
  );

  // Langkah 1: upload xlsx sebagai Google Sheets sementara (convert: true)
  // supaya Drive bisa export ke PDF dengan layout yang benar.
  const tempFile = Drive.Files.create(
    { name: fileName, mimeType: MimeType.GOOGLE_SHEETS },
    xlsxBlob,
    { convert: true }
  );

  let pdfBlob;
  try {
    // Langkah 2: export hasil convert sebagai PDF.
    pdfBlob = Drive.Files.export(tempFile.id, "application/pdf");
    pdfBlob.setName(pdfName);
  } finally {
    // Langkah 3: hapus file sementara supaya tidak menumpuk di Drive.
    Drive.Files.remove(tempFile.id);
  }

  // Simpan PDF ke folder yang sama dengan xlsx, kalau info folder disertakan.
  if (payload.noPR) {
    const noPR = cleanFolderName_(payload.noPR);
    const description = cleanFolderName_(payload.description || "");
    const rootFolder = resolveProcurementRootFolder_(payload, noPR, description, true);
    const rounds = collectRoundsFromPayload_(payload);
    const folderMap = readOrEnsureStandardSubfolders_(rootFolder, rounds, true);
    const documentFolderMap = {
      BIDDERLIST: "02. Bidderlist",
      RFQ: "01. PR Approval",
      CQS: "03. CQS"
    };
    const folderType = documentFolderMap[String(payload.documentType || "").toUpperCase()] || "01. PR Approval";
    const targetInfo = folderMap[folderType];
    if (targetInfo) {
      const targetFolder = DriveApp.getFolderById(targetInfo.id);
      trashOtherFilesByExactName_(targetFolder, pdfName, null);
      const savedPdf = targetFolder.createFile(pdfBlob);
      return {
        success: true,
        message: "PDF berhasil dibuat dan disimpan.",
        fileId: savedPdf.getId(),
        fileUrl: savedPdf.getUrl(),
        base64: Utilities.base64Encode(pdfBlob.getBytes())
      };
    }
  }

  // Kalau tidak ada info folder, kembalikan saja base64 PDF-nya untuk didownload di browser.
  return {
    success: true,
    message: "PDF berhasil dibuat.",
    base64: Utilities.base64Encode(pdfBlob.getBytes())
  };
}

/* =========================================================
   OUTLOOK DRAFT + ATTACHMENT TANPA POWER AUTOMATE PREMIUM
   ---------------------------------------------------------
   Backend membuat file MIME .eml dengan header X-Unsent: 1.
   Browser mengunduh file tersebut, lalu Buyer membukanya di
   Outlook Classic untuk memeriksa dan mengirim email.
========================================================= */

function createOutlookDraftEml_(payload) {
  payload = payload || {};

  const to = normalizeEmlRecipients_(payload.to);
  if (!to) throw new Error("Alamat penerima (To) belum tersedia.");

  const cc = normalizeEmlRecipients_(payload.cc);
  const subject = sanitizeEmlHeader_(payload.subject || "(Tanpa subjek)");
  const bodyHtml = String(payload.bodyHtml || "").trim();
  const bodyText = String(payload.body || "").trim() || stripHtmlForEml_(bodyHtml);
  const html = bodyHtml || plainTextToHtmlForEml_(bodyText);

  const attachments = collectEmlAttachments_(payload);
  const maxRawBytes = 12 * 1024 * 1024;
  const totalRawBytes = attachments.reduce(function (sum, item) {
    return sum + item.bytes.length;
  }, 0);

  if (totalRawBytes > maxRawBytes) {
    throw new Error(
      "Total attachment terlalu besar untuk pembuatan draft melalui web (maksimal 12 MB pada build ini). " +
      "Kurangi attachment atau kompres file terlebih dahulu."
    );
  }

  const token = Utilities.getUuid().replace(/-/g, "");
  const mixedBoundary = "----=_EProcurement_Mixed_" + token;
  const alternativeBoundary = "----=_EProcurement_Alt_" + token;
  const lines = [];

  // X-Unsent membuat Outlook Classic membuka .eml sebagai pesan yang
  // dapat diedit/dikirim, bukan sebagai email masuk biasa.
  lines.push("X-Unsent: 1");
  if (String(payload.importance || "").toLowerCase() === "high") {
    lines.push("Importance: high");
    lines.push("X-Priority: 1");
    lines.push("X-MSMail-Priority: High");
  }
  lines.push("To: " + to.replace(/;/g, ", "));
  if (cc) lines.push("Cc: " + cc.replace(/;/g, ", "));
  lines.push("Subject: " + encodeEmlHeaderWord_(subject));
  lines.push("Date: " + Utilities.formatDate(new Date(), "GMT", "EEE, dd MMM yyyy HH:mm:ss 'GMT'"));
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: multipart/mixed; boundary="' + mixedBoundary + '"');
  lines.push("");

  lines.push("--" + mixedBoundary);
  lines.push('Content-Type: multipart/alternative; boundary="' + alternativeBoundary + '"');
  lines.push("");

  lines.push("--" + alternativeBoundary);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(wrapEmlBase64_(utf8Base64ForEml_(bodyText)));
  lines.push("");

  lines.push("--" + alternativeBoundary);
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(wrapEmlBase64_(utf8Base64ForEml_(html)));
  lines.push("");
  lines.push("--" + alternativeBoundary + "--");

  attachments.forEach(function (attachment) {
    const asciiName = asciiEmlFileName_(attachment.fileName);
    const headerFileName = /^[\x20-\x7E]*$/.test(attachment.fileName)
      ? asciiName
      : encodeEmlHeaderWord_(attachment.fileName);
    const encodedName = encodeURIComponent(attachment.fileName).replace(/'/g, "%27");
    lines.push("");
    lines.push("--" + mixedBoundary);
    lines.push("Content-Type: " + attachment.mimeType + '; name="' + headerFileName + '";');
    lines.push(" name*=UTF-8''" + encodedName);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push('Content-Disposition: attachment; filename="' + headerFileName + '";');
    lines.push(" filename*=UTF-8''" + encodedName);
    lines.push("");
    lines.push(wrapEmlBase64_(Utilities.base64Encode(attachment.bytes)));
  });

  lines.push("");
  lines.push("--" + mixedBoundary + "--");
  lines.push("");

  const requestedName = String(payload.draftFileName || "").trim();
  const fileName = cleanEmlDraftFileName_(requestedName || ("Outlook Draft - " + subject + ".eml"));
  const emlText = lines.join("\r\n");
  const emlBlob = Utilities.newBlob(emlText, "message/rfc822", fileName);

  return {
    success: true,
    message: "Outlook Draft berhasil dibuat.",
    fileName: fileName,
    mimeType: "message/rfc822",
    base64: Utilities.base64Encode(emlBlob.getBytes()),
    attachmentCount: attachments.length,
    attachmentBytes: totalRawBytes
  };
}

function collectEmlAttachments_(payload) {
  const attachments = [];
  const seenFileIds = {};
  const fileIds = Array.isArray(payload.attachmentFileIds) ? payload.attachmentFileIds : [];

  fileIds.forEach(function (rawId) {
    const fileId = String(rawId || "").trim();
    if (!fileId || seenFileIds[fileId]) return;
    seenFileIds[fileId] = true;

    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    attachments.push({
      fileName: sanitizeEmlAttachmentName_(file.getName() || blob.getName() || "attachment"),
      mimeType: blob.getContentType() || "application/octet-stream",
      bytes: blob.getBytes()
    });
  });

  const inlineAttachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  inlineAttachments.forEach(function (item) {
    if (!item || !item.base64) return;
    let base64 = String(item.base64 || "");
    if (base64.indexOf(",") >= 0) base64 = base64.split(",").pop();
    attachments.push({
      fileName: sanitizeEmlAttachmentName_(item.fileName || "attachment"),
      mimeType: String(item.mimeType || "application/octet-stream"),
      bytes: Utilities.base64Decode(base64)
    });
  });

  return attachments;
}

function normalizeEmlRecipients_(value) {
  const source = Array.isArray(value) ? value.join(";") : String(value || "");
  return source
    .split(/[;,\n]+/)
    .map(function (item) { return sanitizeEmlHeader_(item); })
    .filter(Boolean)
    .join(";");
}

function sanitizeEmlHeader_(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeEmlAttachmentName_(value) {
  const cleaned = String(value || "attachment")
    .replace(/[\r\n]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "attachment").substring(0, 180);
}

function asciiEmlFileName_(value) {
  const cleaned = sanitizeEmlAttachmentName_(value)
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/[";]/g, "_");
  return cleaned || "attachment";
}

function cleanEmlDraftFileName_(value) {
  let fileName = String(value || "Outlook Draft.eml")
    .replace(/[\r\n]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  if (!/\.eml$/i.test(fileName)) fileName += ".eml";
  if (fileName.length > 160) fileName = fileName.substring(0, 156) + ".eml";
  return fileName || "Outlook Draft.eml";
}

function encodeEmlHeaderWord_(value) {
  const text = sanitizeEmlHeader_(value);
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return "=?UTF-8?B?" + utf8Base64ForEml_(text) + "?=";
}

function utf8Base64ForEml_(value) {
  return Utilities.base64Encode(Utilities.newBlob(String(value || ""), "text/plain").getBytes());
}

function wrapEmlBase64_(value) {
  const text = String(value || "");
  const chunks = text.match(/.{1,76}/g);
  return chunks ? chunks.join("\r\n") : "";
}

function stripHtmlForEml_(html) {
  return String(html || "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function plainTextToHtmlForEml_(text) {
  return "<html><body style=\"font-family:Arial,sans-serif;font-size:11pt\">" +
    String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\r\n|\r|\n/g, "<br>") +
    "</body></html>";
}
