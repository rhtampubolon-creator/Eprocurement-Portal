

/* ===== MERGED FROM app-core.js ===== */

/* MSW E-Procurement consolidated core runtime.
   Source order intentionally preserved: config -> shared modules -> common -> performance cache. */


/* ======================================================
   CONSOLIDATED CORE: config.js
   ====================================================== */

/**
 * Public runtime configuration.
 *
 * Production frontend intentionally contains only the Web App endpoint and
 * non-sensitive UI settings. Spreadsheet IDs and Apps Script project URLs
 * stay on the backend (Script Properties).
 */
window.APP_CONFIG = Object.freeze({
  ENVIRONMENT: "production",
    GAS_URL: "https://script.google.com/macros/s/AKfycbwlpvbUm6CEPzSDzMFIfsrh_RnBUFNmWr7XLDhth_n1P2CM_XyifNKlFKxqrsmangwcSg/exec",
  EMAILS: Object.freeze({ releasePoCc: [], releasePrTo: "", releasePrCc: "", poProcTo: "", appointmentTo: "", procurementInbox: "", procurementCc: "" })
});

/* Consolidated: loadGlobalTableFilterScrollEarly is included in this core bundle. */

/* Consolidated: loadBuyerViewSyncOptimizerEarly is included in this core bundle. */

/* Consolidated: loadUnrestrictedLocalUploadEarly is included in this core bundle. */

/* Consolidated: loadAndroidFolderAdapterEarly is included in this core bundle. */

/* loadBidderExtensionsEarly() dihapus 2026-09-10: kode sidebar storage,
   workspace, dan fix Android untuk BidderList sekarang sudah langsung
   digabung ke dalam bidder-list/script.js itu sendiri (lihat komentar
   header file tersebut), jadi tidak perlu dimuat terpisah lagi di sini. */

/* Consolidated: loadProcurementActionBundle is included in this core bundle. */

/* Consolidated: loadProcurementReviewBundle is included in this core bundle. */


/* ======================================================
   CONSOLIDATED CORE: shared-modules.js
   ====================================================== */

/* ======================================================
   SHARED MODULE REGISTRY
   Satu sumber menu untuk Super Admin, Procurement Admin, dan Buyer.
   Modul Admin otomatis diwariskan kepada Super Admin.
====================================================== */
"use strict";

(function(){
  const registry = [
    {
      id: "procurementAdmin",
      navId: "workspaceProcurement",
      label: "Procurement",
      icon: "clipboard-list",
      url: "procurement-admin/index.html?v=20260818-buyer-sync-upload-v3512",
      roles: ["SUPER_ADMIN", "BUYER"]
    },
    {
      id: "vendorCompany",
      navId: "workspaceVendor",
      label: "Vendor Management",
      icon: "building-2",
      url: "vendor-company/index.html?v=20260818-buyer-sync-v3512",
      roles: ["PROCUREMENT_ADMIN"],
      viewOnlyRoles: ["BUYER"]
    },
    {
      id: "vendorRequests",
      navId: "workspaceVendorRequests",
      label: "Vendor Requests",
      icon: "inbox",
      url: "vendor-requests/index.html?v=20260818-global-filter-v3511",
      roles: ["PROCUREMENT_ADMIN"],
      viewOnlyRoles: ["BUYER"]
    },
    {
      id: "agreementDashboard",
      navId: "workspaceDashboard",
      label: "Agreement Dashboard",
      icon: "layout-dashboard",
      url: "agreement-dashboard/index.html?v=20260818-global-filter-v3511",
      roles: ["CONTRACT"]
    },
    {
      id: "detailContract",
      navId: "workspaceContract",
      label: "Contract Management",
      icon: "file-text",
      url: "detail-contract/index.html?v=20260818-buyer-sync-v3512",
      roles: ["SUPER_ADMIN", "CONTRACT"],
      viewOnlyRoles: ["BUYER"]
    },
    {
      id: "agreementTracker",
      navId: "workspaceAgreementTracker",
      label: "Agreement Tracker",
      icon: "clipboard-check",
      url: "agreement-tracker/index.html?v=20260818-global-filter-v3511",
      roles: ["SUPER_ADMIN", "CONTRACT"]
    }
  ];

  registry.forEach(module => {
    if (module.roles.includes("PROCUREMENT_ADMIN") && !module.roles.includes("SUPER_ADMIN")) {
      module.roles.push("SUPER_ADMIN");
    }
  });

  window.MSW_SHARED = window.MSW_SHARED || {};
  window.MSW_SHARED.modules = registry;
  window.MSW_SHARED.procurement = Object.freeze({
    roundLabel: "Round PR",
    roundAliases: ["Round PR", "Round PO", "roundpr", "roundpo"],
    overdueDateLabel: "Actual PO Del. Date",
    overdueDateAliases: ["Actual PO Del. Date", "actualpodeldate", "Actual PO Delivery Date"],
    yearDateAliases: ["Assign Date", "Assign PR", "Assign PR Date", "assignprdate"]
  });
  window.MSW_SHARED.allowedModuleIds = function(role){
    const raw = String(role || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
    const normalized = raw === "ADMIN"
      ? "PROCUREMENT_ADMIN"
      : (raw === "SUPERADMIN"
        ? "SUPER_ADMIN"
        : (["CONTRACTADMIN", "CONTRACT_ADMIN", "CONTRACTMANAGEMENT", "CONTRACT_MANAGEMENT"].includes(raw) ? "CONTRACT" : raw));
    if (normalized === "SUPER_ADMIN") return registry.map(item => item.id);
    return registry
      .filter(item => item.roles.includes(normalized) || (item.viewOnlyRoles || []).includes(normalized))
      .map(item => item.id);
  };
})();

/* Consolidated: loadProcurementExportRoleScopeV3517 is included in this core bundle. */


/* ======================================================
   CONSOLIDATED CORE: common.js
   ====================================================== */

/* ======================================================
   MSW E-PROCUREMENT COMMON LIBRARY
   Version : 1.0.0
   Author  : Procurement Division
====================================================== */

"use strict";

/* ======================================================
   AUTHENTICATED APPS SCRIPT REQUESTS
   V23: token selalu dipilih dari storage yang memiliki profile aktif.
   Ini mencegah token lama localStorage mengalahkan sessionStorage aktif.
====================================================== */
(function installAuthenticatedFetch(){
  const TOKEN_KEY = "MSW_AUTH_TOKEN";
  const PROFILE_KEY = "MSW_ACTIVE_PROFILE";

  function safeGet(storage, key){
    try { return String(storage.getItem(key) || "").trim(); }
    catch (_) { return ""; }
  }

  function readActiveToken(){
    const sessionToken = safeGet(sessionStorage, TOKEN_KEY);
    const localToken = safeGet(localStorage, TOKEN_KEY);
    const sessionProfile = safeGet(sessionStorage, PROFILE_KEY);
    const localProfile = safeGet(localStorage, PROFILE_KEY);

    // Prioritaskan pasangan token + profile yang berada pada storage yang sama.
    if (sessionToken && sessionProfile) return sessionToken;
    if (localToken && localProfile) return localToken;
    // Fallback untuk fase sesaat setelah login sebelum profile ditulis.
    return sessionToken || localToken || "";
  }

  window.MSW_GET_AUTH_TOKEN = readActiveToken;

  function isAuthFailure(payload){
    const message = String(payload?.message || "").toLowerCase();
    return payload?.success === false && (
      message.includes("login diperlukan") ||
      message.includes("please sign in") ||
      message.includes("session expired") ||
      message.includes("sesi berakhir")
    );
  }

  function signalAuthRequired(message){
    const detail = { message: String(message || "Sesi login berakhir. Silakan sign in kembali.") };
    try { window.dispatchEvent(new CustomEvent("MSW_AUTH_REQUIRED", { detail })); } catch (_) {}
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "MSW_AUTH_REQUIRED", message: detail.message }, "*");
      }
    } catch (_) {}
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    let targetUrl = typeof input === "string" ? input : String(input?.url || "");
    try {
      const gasUrl = String(window.APP_CONFIG?.GAS_URL || "").trim();
      let token = readActiveToken();
      if (gasUrl && targetUrl.indexOf(gasUrl) === 0) {
        const options = Object.assign({}, init || {});
        const method = String(options.method || "GET").toUpperCase();
        if (method === "GET") {
          const parsedUrl = new URL(targetUrl, window.location.href);
          token = token || String(parsedUrl.searchParams.get("authToken") || "").trim();
          if (token) {
            const payload = {};
            parsedUrl.searchParams.forEach((value, key) => {
              if (key !== "authToken" && key !== "_") payload[key] = value;
            });
            if (!payload.action) payload.action = payload.sheet ? "READ_SHEET" : "HEALTH_CHECK";
            payload.authToken = token;
            options.method = "POST";
            options.headers = Object.assign({}, options.headers || {}, {
              "Content-Type": "text/plain;charset=utf-8"
            });
            options.body = JSON.stringify(payload);
            targetUrl = gasUrl;
            input = gasUrl;
          }
        } else if (token && typeof options.body === "string") {
          try {
            const payload = JSON.parse(options.body);
            if (!payload.authToken) payload.authToken = token;
            options.body = JSON.stringify(payload);
          } catch (_) {}
        }
        init = options;
      }
    } catch (_) {}

    const request = nativeFetch(input, init);
    return Promise.resolve(request).then(response => {
      try {
        const gasUrl = String(window.APP_CONFIG?.GAS_URL || "").trim();
        if (gasUrl && targetUrl.indexOf(gasUrl) === 0) {
          response.clone().json().then(payload => {
            if (isAuthFailure(payload)) signalAuthRequired(payload.message);
          }).catch(() => {});
        }
      } catch (_) {}
      return response;
    });
  };
})();

/* ======================================================
   ROOT OBJECT
====================================================== */

window.MSW = window.MSW || {};

/* ======================================================
   CACHE-FIRST PENDING SYNC
   Semua mutasi disimpan sebagai antrean lokal bila Google Apps Script
   tidak dapat dihubungi. Antrean dicoba kembali saat online, berkala,
   berpindah fokus, dan sebelum logout.
====================================================== */

MSW.sync = MSW.sync || {};

(function installPendingSync(){
    const SYNC_STORAGE_KEY = "MSW_PENDING_SYNC_V1";
    const originalFetch = window.fetch.bind(window);
    const pendingMutationActions = new Set([
        "ADD", "EDIT", "DELETE", "DELETE_ROW",
        "BATCH_REPLACE_PROCUREMENT", "BATCH_IMPORT_PROCUREMENT_BY_BUYER",
        "ADD_COMPANY", "EDIT_COMPANY", "DELETE_COMPANY",
        "REPLACE_CONTRACTS", "REPLACE_AGREEMENT_TRACKER", "ADD_AGREEMENT_TRACKER", "EDIT_AGREEMENT_TRACKER", "DELETE_AGREEMENT_TRACKER", "CREATE_VENDOR_REQUEST", "UPDATE_VENDOR_REQUEST",
        "SAVE_WORKSPACE", "SAVE_BIDDERLIST_TO_PROCUREMENT", "SAVE_REBID_REQUEST",
        "createFolder", "ensureFolderStructure", "uploadFile", "exportPdf",
        "CREATE_OUTLOOK_DRAFT_EML"
    ]);

    function currentToken(){
        if (typeof window.MSW_GET_AUTH_TOKEN === "function") {
            return String(window.MSW_GET_AUTH_TOKEN() || "").trim();
        }
        return String(sessionStorage.getItem("MSW_AUTH_TOKEN") || localStorage.getItem("MSW_AUTH_TOKEN") || "").trim();
    }

    function parseBody(body){
        if (typeof body !== "string") return null;
        try { return JSON.parse(body); } catch (_) { return null; }
    }

    function isMutationRequest(url, init){
        const method = String(init?.method || "GET").toUpperCase();
        if (method !== "POST") return false;
        const gasUrl = String(window.APP_CONFIG?.GAS_URL || "").trim();
        if (!gasUrl || String(url || "").indexOf(gasUrl) !== 0) return false;
        const payload = parseBody(init?.body);
        if (!payload || typeof payload !== "object") return false;
        const action = String(payload.action || "").trim();
        if (["LOGIN_USER", "REGISTER_USER", "LOGOUT_USER", "REVIEW_PENDING_USER",
             "MARK_VENDOR_NOTIFICATIONS_READ"].includes(action)) return false;
        if (pendingMutationActions.has(action)) return true;
        // Payload lama Vendor/Contract tidak memiliki action tetapi membawa rows.
        return Boolean(payload.sheet && Array.isArray(payload.rows));
    }

    function loadQueue(){
        try {
            const parsed = JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY) || "[]");
            const rows = Array.isArray(parsed) ? parsed : [];
            // Activity log adalah data pendukung, bukan transaksi utama. Versi lama
            // pernah memasukkannya ke Pending Sync sehingga indikator bisa tetap
            // menampilkan "1 perubahan" meski data Contract/Agreement sudah aman.
            const cleaned = rows.filter(item => String(item?.payload?.action || "").trim().toUpperCase() !== "LOG_ACTIVITY");
            if (cleaned.length !== rows.length) {
                try { localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(cleaned)); } catch (_) {}
            }
            return cleaned;
        } catch (_) {
            return [];
        }
    }

    function saveQueue(queue){
        const safe = Array.isArray(queue) ? queue.slice(-250) : [];
        try {
            localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(safe));
        } catch (error) {
            console.error("Pending Sync tidak dapat disimpan ke cache perangkat:", error);
            return false;
        }
        MSW.sync.renderIndicator();
        window.dispatchEvent(new CustomEvent("MSW_PENDING_SYNC_UPDATED", {
            detail: { count: safe.length }
        }));
        return true;
    }

    function requestFingerprint(payload){
        const action = String(payload?.action || "LEGACY_REPLACE").trim().toUpperCase();
        const sheet = String(payload?.sheet || "").trim().toUpperCase();
        const data = payload?.data || payload?.row || {};
        const recordId = String(
            payload?.procurementId || data?.procurementId || data?.["Procurement ID"] ||
            payload?.originalNoCompany || data?.["No Company"] ||
            payload?.originalPR || data?.noPR || data?.["No PR"] ||
            payload?.originalWorkOrder || data?.["Work Order"] ||
            payload?.originalDescription || data?.Description || ""
        ).trim().toUpperCase();
        // Replace/import terakhir menggantikan pending replace/import sebelumnya.
        const replaceLike = ["BATCH_REPLACE_PROCUREMENT", "REPLACE_CONTRACTS", "REPLACE_AGREEMENT_TRACKER"].includes(action) ||
            (!payload?.action && Array.isArray(payload?.rows));
        if (replaceLike) return `${action}|${sheet}`;
        return `${action}|${sheet}|${recordId || payload?.clientMutationId || "GENERAL"}`;
    }

    function enqueue(url, init, reason){
        const payload = parseBody(init?.body);
        if (!payload) return null;
        delete payload.authToken;
        const action = String(payload.action || "").trim().toUpperCase();
        const data = payload.data || payload.row || {};
        const hasRecordIdentity = Boolean(
            payload.procurementId || data.procurementId || data["Procurement ID"] ||
            payload.originalNoCompany || data["No Company"] ||
            payload.originalPR || data.noPR || data["No PR"] ||
            payload.originalWorkOrder || data["Work Order"] ||
            payload.originalDescription || data.Description
        );
        if (!payload.clientMutationId && (
            action === "BATCH_IMPORT_PROCUREMENT_BY_BUYER" ||
            (["ADD", "ADD_COMPANY", "ADD_AGREEMENT_TRACKER", "CREATE_VENDOR_REQUEST"].includes(action) && !hasRecordIdentity)
        )) {
            payload.clientMutationId = `mutation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }
        const queue = loadQueue();
        const fingerprint = requestFingerprint(payload);
        const now = Date.now();
        const item = {
            id: `sync-${now}-${Math.random().toString(36).slice(2, 9)}`,
            fingerprint,
            url: String(url || ""),
            method: String(init?.method || "POST").toUpperCase(),
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            payload,
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
            attempts: 0,
            lastError: String(reason || "Google Sheet belum terhubung")
        };
        const existingIndex = queue.findIndex(entry => entry.fingerprint === fingerprint);
        if (existingIndex >= 0) {
            item.id = queue[existingIndex].id;
            item.createdAt = queue[existingIndex].createdAt || item.createdAt;
            item.attempts = Number(queue[existingIndex].attempts || 0);
            queue[existingIndex] = item;
        } else {
            queue.push(item);
        }
        return saveQueue(queue) ? item : null;
    }

    function syntheticQueuedResponse(item){
        return new Response(JSON.stringify({
            success: true,
            queued: true,
            pendingSync: true,
            queueId: item?.id || "",
            message: "Perubahan sudah disimpan di cache dan menunggu sinkronisasi Google Sheet."
        }), {
            status: 202,
            headers: { "Content-Type": "application/json" }
        });
    }

    async function responseIsUsable(response){
        if (!response || !response.ok) return false;
        const clone = response.clone();
        const raw = await clone.text();
        if (/^\s*<!doctype html|^\s*<html/i.test(raw)) return false;
        if (!raw.trim()) return true;
        try {
            JSON.parse(raw);
            // Respons JSON valid (termasuk success:false/conflict/permission)
            // harus diteruskan ke modul agar tidak disamarkan sebagai offline.
            return true;
        } catch (_) {
            return false;
        }
    }

    async function responseMutationSucceeded(response){
        if (!response || !response.ok) return { success: false, message: `HTTP ${response?.status || 0}` };
        const raw = await response.clone().text();
        if (/^\s*<!doctype html|^\s*<html/i.test(raw)) return { success: false, message: "Respons HTML, bukan JSON" };
        if (!raw.trim()) return { success: true, message: "" };
        try {
            const parsed = JSON.parse(raw);
            return parsed?.success === false
                ? { success: false, message: parsed.message || "Sinkronisasi ditolak backend", conflict: Boolean(parsed.conflict) }
                : { success: true, message: parsed?.message || "" };
        } catch (_) {
            return { success: false, message: "Respons JSON tidak valid" };
        }
    }

    // Interceptor transparan: kode modul lama tetap menerima respons sukses
    // 202 ketika request sudah aman masuk Pending Sync.
    window.fetch = async function(input, init){
        const url = typeof input === "string" ? input : String(input?.url || "");
        const mutation = isMutationRequest(url, init || {});
        try {
            const response = await originalFetch(input, init);
            if (!mutation) return response;
            if (await responseIsUsable(response)) return response;
            const item = enqueue(url, init || {}, `HTTP ${response?.status || 0}`);
            return item ? syntheticQueuedResponse(item) : response;
        } catch (error) {
            if (!mutation) throw error;
            const item = enqueue(url, init || {}, error?.message || error);
            if (!item) throw error;
            return syntheticQueuedResponse(item);
        }
    };

    MSW.sync.getPending = loadQueue;
    MSW.sync.getPendingCount = () => loadQueue().length;
    MSW.sync.enqueue = enqueue;

    MSW.sync.flush = async function({ silent = false } = {}){
        if (!navigator.onLine) {
            if (!silent) MSW.sync.renderIndicator("Offline — menunggu koneksi");
            return { success: false, remaining: loadQueue().length, offline: true };
        }

        let queue = loadQueue();
        if (!queue.length) {
            MSW.sync.renderIndicator();
            return { success: true, synced: 0, remaining: 0 };
        }

        let synced = 0;
        const remaining = [];
        for (const item of queue) {
            try {
                const payload = Object.assign({}, item.payload || {});
                // Pertahankan expectedRevision agar antrean dari cache lama tidak
                // menimpa perubahan yang sudah dibuat pada perangkat lain.
                const token = currentToken();
                if (token) payload.authToken = token;
                const response = await originalFetch(item.url, {
                    method: item.method || "POST",
                    headers: item.headers || { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify(payload)
                });
                const outcome = await responseMutationSucceeded(response);
                if (!outcome.success) {
                    throw new Error(outcome.message || `HTTP ${response.status}`);
                }
                synced++;
            } catch (error) {
                remaining.push(Object.assign({}, item, {
                    attempts: Number(item.attempts || 0) + 1,
                    updatedAt: new Date().toISOString(),
                    lastError: String(error?.message || error)
                }));
            }
        }
        saveQueue(remaining);
        if (!silent && synced) {
            MSW.sync.renderIndicator(
                remaining.length
                    ? `${synced} tersinkron, ${remaining.length} masih pending`
                    : "Semua perubahan tersinkron"
            );
        }
        return {
            success: remaining.length === 0,
            synced,
            remaining: remaining.length
        };
    };

    MSW.sync.waitUntilSynced = async function(){
        const result = await MSW.sync.flush({ silent: false });
        return result.remaining === 0;
    };

    // Pending Sync tetap berjalan di background, tetapi indikator visual dihapus
    // agar tidak mengganggu tampilan aplikasi.
    function removePendingSyncIndicator_(){
        const indicator = document.getElementById("mswPendingSyncIndicator");
        if (indicator) indicator.remove();
    }
    removePendingSyncIndicator_();
    MSW.sync.renderIndicator = function(){
        removePendingSyncIndicator_();
    };
    // Pengaman untuk sisa elemen indikator dari script versi lama yang masih sempat
    // dibuat oleh frame/module lain. Hanya elemen UI yang dihapus; queue tetap utuh.
    const pendingIndicatorObserver = new MutationObserver(function(){ removePendingSyncIndicator_(); });
    pendingIndicatorObserver.observe(document.documentElement,{childList:true,subtree:true});

    window.addEventListener("online", () => MSW.sync.flush({ silent: true }));
    window.addEventListener("focus", () => MSW.sync.flush({ silent: true }));
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") MSW.sync.flush({ silent: true });
    });
    setInterval(() => MSW.sync.flush({ silent: true }), 60 * 1000);
    setTimeout(() => {
        MSW.sync.renderIndicator();
        MSW.sync.flush({ silent: true });
    }, 1200);
})();


/* ======================================================
   ROLE ACCESS
====================================================== */

MSW.auth = {};

MSW.auth.normalizeRole = function (value) {
    const role = String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
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
};

MSW.auth.getProfile = function () {
    const profileKey = "MSW_ACTIVE_PROFILE";
    const tokenKey = "MSW_AUTH_TOKEN";

    // Baca profil dari storage yang sama dengan token aktif. Ini mencegah
    // profil lama di sessionStorage mengalahkan profil Admin di localStorage.
    const sessionHasToken = Boolean(sessionStorage.getItem(tokenKey));
    const localHasToken = Boolean(localStorage.getItem(tokenKey));
    const storages = sessionHasToken
        ? [sessionStorage, localStorage]
        : (localHasToken ? [localStorage, sessionStorage] : [sessionStorage, localStorage]);

    for (const storage of storages) {
        try {
            const raw = storage.getItem(profileKey);
            if (raw) return JSON.parse(raw);
        } catch (_) {}
    }
    return null;
};

MSW.auth.getRole = function () {
    return MSW.auth.normalizeRole(MSW.auth.getProfile()?.role || "");
};

MSW.auth.canAccessModule = function (moduleName) {
    const role = MSW.auth.getRole();
    const moduleKey = String(moduleName || "").trim();
    if (!role || !moduleKey) return false;
    if (role === "SUPER_ADMIN") return true;

    const allowed = window.MSW_SHARED?.allowedModuleIds?.(role);
    return Array.isArray(allowed) && allowed.includes(moduleKey);
};

MSW.auth.isViewOnlyModule = function (moduleName) {
    const role = MSW.auth.getRole();
    const moduleKey = String(moduleName || "").trim();
    return role === "BUYER" && ["vendorCompany", "detailContract"].includes(moduleKey);
};

MSW.auth.canManageModule = function (moduleName) {
    return !MSW.auth.isViewOnlyModule(moduleName);
};

MSW.auth.showViewOnlyMessage = function () {
    const message = "Akun Buyer hanya dapat melihat data pada halaman ini.";
    if (typeof window.showToast === "function") window.showToast(message, "info");
    else window.alert(message);
};

MSW.auth.addRoleBanner = function (message) {
    if (!document.body || document.getElementById("mswRoleAccessBanner")) return;
    const banner = document.createElement("div");
    banner.id = "mswRoleAccessBanner";
    banner.setAttribute("role", "status");
    banner.textContent = String(message || "View Only");
    banner.style.cssText = [
        "padding:8px 14px", "background:#fff7ed", "color:#9a3412",
        "border:1px solid #fed7aa", "border-radius:8px", "font-size:13px",
        "font-weight:600", "text-align:center", "margin:0 0 10px"
    ].join(";");
    document.body.prepend(banner);
};

MSW.auth.applyBuyerModuleLayout = function () {
    const centeredTitle = document.getElementById("buyerCenteredTitle");
    const subtitle = document.getElementById("moduleSubtitle");
    if (!centeredTitle || !subtitle) return;

    const role = MSW.auth.getRole();
    const moduleKey = /vendor-company/i.test(location.pathname)
        ? "vendorCompany"
        : (/detail-contract/i.test(location.pathname) ? "detailContract" : "procurementAdmin");
    const isBuyer = role === "BUYER";
    const isAdminManagedModule = (
        role === "SUPER_ADMIN"
        && ["vendorCompany", "detailContract", "procurementAdmin"].includes(moduleKey)
    ) || (
        role === "PROCUREMENT_ADMIN"
        && moduleKey === "vendorCompany"
    ) || (role === "CONTRACT" && moduleKey === "detailContract");
    if (!isBuyer && !isAdminManagedModule) return;

    document.body.classList.add("msw-buyer-centered-module");
    centeredTitle.textContent = moduleKey === "procurementAdmin"
        ? "Procurement Management"
        : String(subtitle.textContent || "").trim();
    subtitle.style.display = "none";

    // Vendor dan Contract bersifat view-only untuk Buyer. Action tetap ditampilkan
    // agar fungsi read-only seperti Export Excel tersedia; masing-masing modul
    // menyembunyikan Add/Edit/Delete/Import/All Clear dan backend tetap menolak mutasi.
    if (isBuyer && ["vendorCompany", "detailContract"].includes(moduleKey)) {
        const actionDropdown = document.getElementById("actionDropdown");
        if (actionDropdown) actionDropdown.style.display = "";
    }

    // Procurement Admin tidak memiliki akses ke modul Procurement.
};

MSW.auth.applyBuyerModuleLayout();

/* ======================================================
   MOBILE / TABLET TOUCH ROW INTERACTIONS — V21
   Desktop tetap memakai double-click + klik kanan.
   Touchscreen memakai event touch native agar konsisten pada Android/iOS:
   - double-tap pada row -> dispatch dblclick (Edit)
   - long-press pada row -> dispatch contextmenu (Delete/menu row)
   Pen stylus memakai PointerEvent sebagai fallback.
   Handler bisnis tetap milik masing-masing modul sehingga permission backend
   (mis. Buyer view-only Contract/Vendor) tidak dapat dilewati oleh gesture.
====================================================== */
MSW.touch = MSW.touch || {};

(function installTouchRowInteractions(){
    if (window.__MSW_TOUCH_ROWS_V21__) return;
    window.__MSW_TOUCH_ROWS_V21__ = true;

    const ROW_SELECTOR = "#tableBody tr[data-index], tbody tr[data-index]";
    const INTERACTIVE_SELECTOR = "button,input,select,textarea,a,label,[contenteditable='true'],[role='button'],[role='menuitem']";
    const LONG_PRESS_MS = 650;
    const DOUBLE_TAP_MS = 500;
    const MOVE_TOLERANCE = 18;

    let activeTouch = null;
    let activePen = null;
    let lastTapAt = 0;
    let lastTapRow = null;
    let suppressClickUntil = 0;
    let suppressNativeContextUntil = 0;

    function getRow(target){
        return target?.closest?.(ROW_SELECTOR) || null;
    }

    function isInteractive(target){
        return !!target?.closest?.(INTERACTIVE_SELECTOR);
    }

    function dispatchRowGesture(type, row, source){
        if (!row) return;
        const event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: Number(source?.clientX || 0),
            clientY: Number(source?.clientY || 0),
            screenX: Number(source?.screenX || 0),
            screenY: Number(source?.screenY || 0),
            button: type === "contextmenu" ? 2 : 0,
            buttons: 0,
            detail: type === "dblclick" ? 2 : 1
        });
        // Dispatch pada TR, bukan child cell. Ini lebih konsisten pada Safari/Chrome mobile
        // dan tetap tertangkap oleh handler dblclick/contextmenu yang sudah ada.
        row.dispatchEvent(event);
    }

    function cancelActiveTouch(){
        if (activeTouch?.timer) clearTimeout(activeTouch.timer);
        activeTouch = null;
    }

    function finishTap(row, source, nativeEvent){
        const now = Date.now();
        if (lastTapRow === row && (now - lastTapAt) <= DOUBLE_TAP_MS) {
            lastTapAt = 0;
            lastTapRow = null;
            suppressClickUntil = now + 550;
            try { if (nativeEvent?.cancelable) nativeEvent.preventDefault(); } catch (_) {}
            dispatchRowGesture("dblclick", row, source);
            return true;
        }
        lastTapAt = now;
        lastTapRow = row;
        return false;
    }

    // TOUCH: jalur utama HP/tablet (Android Chrome, Samsung Internet, iOS Safari).
    document.addEventListener("touchstart", event => {
        if (event.touches.length !== 1 || isInteractive(event.target)) return;
        const row = getRow(event.target);
        if (!row) return;
        const touch = event.touches[0];
        cancelActiveTouch();
        activeTouch = {
            row,
            startX: touch.clientX,
            startY: touch.clientY,
            longPressed: false,
            source: {
                clientX: touch.clientX,
                clientY: touch.clientY,
                screenX: touch.screenX,
                screenY: touch.screenY
            },
            timer: null
        };
        activeTouch.timer = setTimeout(() => {
            if (!activeTouch) return;
            activeTouch.longPressed = true;
            suppressClickUntil = Date.now() + 900;
            suppressNativeContextUntil = Date.now() + 1000;
            dispatchRowGesture("contextmenu", activeTouch.row, activeTouch.source);
            try { navigator.vibrate?.(24); } catch (_) {}
        }, LONG_PRESS_MS);
    }, { passive: true });

    document.addEventListener("touchmove", event => {
        if (!activeTouch || event.touches.length !== 1) return;
        const touch = event.touches[0];
        if (Math.hypot(touch.clientX-activeTouch.startX, touch.clientY-activeTouch.startY) > MOVE_TOLERANCE) {
            cancelActiveTouch();
        }
    }, { passive: true });

    document.addEventListener("touchcancel", cancelActiveTouch, { passive: true });

    document.addEventListener("touchend", event => {
        if (!activeTouch) return;
        const state = activeTouch;
        if (state.timer) clearTimeout(state.timer);
        activeTouch = null;
        if (state.longPressed) return;
        const touch = event.changedTouches?.[0];
        if (!touch) return;
        if (Math.hypot(touch.clientX-state.startX, touch.clientY-state.startY) > MOVE_TOLERANCE) return;
        finishTap(state.row, touch, event);
    }, { passive: false });

    // PEN/STYLUS fallback. Touch sengaja tidak diproses di PointerEvent untuk
    // mencegah satu tap dihitung dua kali pada browser yang mengirim touch+pointer.
    function clearPen(){
        if (activePen?.timer) clearTimeout(activePen.timer);
        activePen = null;
    }

    document.addEventListener("pointerdown", event => {
        if (String(event.pointerType || '').toLowerCase() !== 'pen' || isInteractive(event.target)) return;
        const row = getRow(event.target);
        if (!row) return;
        clearPen();
        activePen = {
            pointerId: event.pointerId,
            row,
            startX: event.clientX,
            startY: event.clientY,
            longPressed: false,
            source: event,
            timer: setTimeout(() => {
                if (!activePen || activePen.pointerId !== event.pointerId) return;
                activePen.longPressed = true;
                suppressClickUntil = Date.now() + 900;
                suppressNativeContextUntil = Date.now() + 1000;
                dispatchRowGesture("contextmenu", activePen.row, activePen.source);
            }, LONG_PRESS_MS)
        };
    }, { passive: true });

    document.addEventListener("pointermove", event => {
        if (!activePen || event.pointerId !== activePen.pointerId) return;
        if (Math.hypot(event.clientX-activePen.startX, event.clientY-activePen.startY) > MOVE_TOLERANCE) clearPen();
    }, { passive: true });

    document.addEventListener("pointercancel", event => {
        if (activePen && event.pointerId === activePen.pointerId) clearPen();
    }, { passive: true });

    document.addEventListener("pointerup", event => {
        if (!activePen || event.pointerId !== activePen.pointerId) return;
        const state = activePen;
        if (state.timer) clearTimeout(state.timer);
        activePen = null;
        if (state.longPressed || Math.hypot(event.clientX-state.startX,event.clientY-state.startY) > MOVE_TOLERANCE) return;
        finishTap(state.row, event, event);
    }, { passive: false });

    document.addEventListener("click", event => {
        if (Date.now() > suppressClickUntil) return;
        if (!getRow(event.target) || isInteractive(event.target)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    document.addEventListener("contextmenu", event => {
        if (!event.isTrusted || Date.now() > suppressNativeContextUntil) return;
        if (!getRow(event.target)) return;
        event.preventDefault();
    }, true);

    const style = document.createElement("style");
    style.id = "mswTouchSupportV21";
    style.textContent = `
      @media (pointer: coarse), (max-width: 860px) {
        input, select, textarea { font-size: 16px !important; }
        button, .action-btn, .pagination-btn, [role="menuitem"] { min-height: 44px; }
        #tableContainer, .table-container, .scroll-container {
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }
        #tableBody tr[data-index], tbody tr[data-index] {
          touch-action: manipulation;
          -webkit-touch-callout: none;
          -webkit-tap-highlight-color: rgba(37,99,235,.12);
          user-select: none;
        }
        .row-context-menu button, #rowContextMenu button { min-height: 44px; }
      }
    `;
    document.head?.appendChild(style);

    MSW.touch.enabled = true;
    MSW.touch.instructions = Object.freeze({ edit: "double-tap", delete: "long-press" });
})();

/* ======================================================
   CONFIGURATION
====================================================== */

MSW.config = {

    version: "2.0.0",

    scrollStep: 80,

    pageStep: 500,

    scrollBehavior: "smooth",

    searchDelay: 300,

    autoFocus: true,

    autoScroll: true

};

/* ======================================================
   KEYBOARD
====================================================== */

MSW.keyboard = {};

/* ======================================================
   TABLE
====================================================== */

MSW.table = {};

/* ======================================================
   SHORTCUT
====================================================== */

MSW.shortcut = {};

/* ======================================================
   IFRAME
====================================================== */

MSW.iframe = {};

/* ======================================================
   MODAL
====================================================== */

MSW.modal = {};

/* ======================================================
   MESSAGE
====================================================== */

MSW.message = {};

/* ======================================================
   HELPER
====================================================== */

MSW.helper = {};

/* ======================================================
   GET TABLE CONTAINER
====================================================== */

MSW.table.getContainer = function () {

    return document.querySelector(".flex-1.overflow-auto");

};

/* ======================================================
   SCROLL
====================================================== */

MSW.table.scrollLeft = function () {

    const container = MSW.table.getContainer();

    if (!container) return;

    container.scrollBy({

        left: -MSW.config.scrollStep,

        behavior: MSW.config.scrollBehavior

    });

};

MSW.table.scrollRight = function () {

    const container = MSW.table.getContainer();

    if (!container) return;

    container.scrollBy({

        left: MSW.config.scrollStep,

        behavior: MSW.config.scrollBehavior

    });

};

MSW.table.scrollUp = function () {

    const container = MSW.table.getContainer();

    if (!container) return;

    container.scrollBy({

        top: -MSW.config.scrollStep,

        behavior: MSW.config.scrollBehavior

    });

};

MSW.table.scrollDown = function () {

    const container = MSW.table.getContainer();

    if (!container) return;

    container.scrollBy({

        top: MSW.config.scrollStep,

        behavior: MSW.config.scrollBehavior

    });

};

MSW.table.scrollTop = function () {

    const container = MSW.table.getContainer();

    if (!container) return;

    container.scrollTo({

        top: 0,

        behavior: MSW.config.scrollBehavior

    });

};

MSW.table.scrollBottom = function () {

    const container = MSW.table.getContainer();

    if (!container) return;

    container.scrollTo({

        top: container.scrollHeight,

        behavior: MSW.config.scrollBehavior

    });

};

/* ======================================================
   PAGE SCROLL
====================================================== */

MSW.table.pageUp = function () {

    const container = MSW.table.getContainer();

    if (!container) return;

    container.scrollBy({

        top: -MSW.config.pageStep,

        behavior: MSW.config.scrollBehavior

    });

};

MSW.table.pageDown = function () {

    const container = MSW.table.getContainer();

    if (!container) return;

    container.scrollBy({

        top: MSW.config.pageStep,

        behavior: MSW.config.scrollBehavior

    });

};

/* ======================================================
   AFTER ADD
====================================================== */

MSW.table.afterAdd = function () {

    const container = MSW.table.getContainer();

    if (!container) return;

    /* Scroll ke baris paling bawah */

    requestAnimationFrame(() => {

        container.scrollTo({

            top: container.scrollHeight,

            behavior: MSW.config.scrollBehavior

        });

    });

    /* Fokus ke input pertama pada baris terakhir */

    if (!MSW.config.autoFocus) return;

    setTimeout(() => {

        const tbody = document.getElementById("tableBody");

        if (!tbody) return;

        const lastRow = tbody.lastElementChild;

        if (!lastRow) return;

        const firstInput = lastRow.querySelector(

            "input, select, textarea"

        );

        if (firstInput) {

            firstInput.focus();

            if (typeof firstInput.select === "function") {

                firstInput.select();

            }

        }

    }, 150);

};

/* ======================================================
   KEYBOARD NAVIGATION
====================================================== */

MSW.keyboard.enable = function () {

    document.addEventListener("keydown", function (e) {

        const tag = document.activeElement.tagName;

        if(document.activeElement.isContentEditable){

            return;

        }

        if (
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            tag === "SELECT"
        ) {
            return;
        }

        switch (e.key) {

            case "ArrowLeft":

                e.preventDefault();

                MSW.table.scrollLeft();

                break;

            case "ArrowRight":

                e.preventDefault();

                MSW.table.scrollRight();

                break;

            case "ArrowUp":

                e.preventDefault();

                MSW.table.scrollUp();

                break;

            case "ArrowDown":

                e.preventDefault();

                MSW.table.scrollDown();

                break;

            case "Home":

                e.preventDefault();

                MSW.table.scrollTop();

                break;

            case "End":

                e.preventDefault();

                MSW.table.scrollBottom();

                break;

            case "PageUp":

                e.preventDefault();

                MSW.table.pageUp();

                break;

            case "PageDown":

                e.preventDefault();

                MSW.table.pageDown();

                break;

        }

    });

};

/* ======================================================
   SHORTCUT
====================================================== */

MSW.shortcut.enable = function () {

    document.addEventListener("keydown", function (e) {

        /* Ctrl + F */
        if (e.ctrlKey && e.key.toLowerCase() === "f") {

            const search = document.getElementById("searchInput");

            if (search) {

                e.preventDefault();

                search.focus();

                search.select();

            }

        }

        /* Ctrl + N */
        if (e.ctrlKey && e.key.toLowerCase() === "n") {

            const menu = document.getElementById("menu");

            const menuBtn = document.getElementById("menuBtn");

            if (menuBtn && menu && menu.classList.contains("hidden")) {

                e.preventDefault();

                menu.classList.remove("hidden");

                return;

            }

            const addButton = document.querySelector(
                '#menu button[onclick*="handleAdd"]'
            );

            if (addButton) {

                e.preventDefault();

                addButton.click();

            }

        }

        /* F5 */

        if (e.key === "F5") {

            e.preventDefault();

            if (window.self !== window.top) {

                window.location.reload();

            }

        }

        /* ESC */

        if (e.key === "Escape") {

            const menu = document.getElementById("menu");

            if (menu) {

                menu.classList.add("hidden");

            }

        }

    });

};

/* ======================================================
   CACHE
====================================================== */

MSW.cache = {};

MSW.cache.version = "1.0.0";

MSW.cache.defaultTTL = 1000 * 60 * 60 * 24 * 7; // 7 hari

MSW.cache.save = function (key, data, ttl = MSW.cache.defaultTTL) {

    try {

        const payload = {

            version: MSW.cache.version,

            updatedAt: Date.now(),

            expiredAt: Date.now() + ttl,

            data: JSON.parse(JSON.stringify(data))

        };

        localStorage.setItem(

            key,

            JSON.stringify(payload)

        );

        return true;

    } catch (err) {

        console.error("Cache Save Error :", err);

        return false;

    }

};

MSW.cache.load = function (key) {

    try {

        const raw = localStorage.getItem(key);

        if (!raw) return null;

        const payload = JSON.parse(raw);

        if (

            payload.expiredAt &&

            Date.now() > payload.expiredAt

        ) {

            localStorage.removeItem(key);

            return null;

        }

        return JSON.parse(

            JSON.stringify(payload.data)

        );

    } catch (err) {

        console.error("Cache Load Error :", err);

        return null;

    }

};

MSW.cache.remove = function (key) {

    localStorage.removeItem(key);

};

MSW.cache.exist = function (key) {

    return localStorage.getItem(key) !== null;

};

MSW.cache.info = function (key) {

    try {

        const raw = localStorage.getItem(key);

        if (!raw) return null;

        return JSON.parse(raw);

    } catch {

        return null;

    }

};

MSW.cache.clearAll = function () {

    localStorage.clear();

};

/* ======================================================
   RECENT PROCUREMENT ACTIVITY
====================================================== */

MSW.activity = {};

MSW.activity.storageKey = "MSW_RECENT_ACTIVITY_V1";
MSW.activity.maxItems = 250;

MSW.activity.readAll = function () {
    try {
        const rows = JSON.parse(localStorage.getItem(MSW.activity.storageKey) || "[]");
        return Array.isArray(rows)
            ? rows.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
            : [];
    } catch {
        return [];
    }
};

MSW.activity.list = function (limit) {

    try {

        const rows = MSW.activity.readAll();

        const profile = MSW.auth?.getProfile?.() || {};
        const role = MSW.auth?.normalizeRole?.(profile.role || "") || "";
        const email = String(profile.email || "").trim().toLowerCase();
        const name = String(profile.name || "").trim().toLowerCase();

        const visibleRows = Array.isArray(rows)
            ? rows.filter(row => {
                if (role === "SUPER_ADMIN") return true;
                const rowEmail = String(row?.userEmail || "").trim().toLowerCase();
                if (rowEmail) return Boolean(email) && rowEmail === email;
                // Kompatibilitas data cache lama yang belum mempunyai User Email.
                const rowUser = String(row?.user || "").trim().toLowerCase();
                return Boolean(rowUser) && (rowUser === email || rowUser === name);
            })
            : [];

        const sorted = visibleRows
            .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        return Number(limit) > 0 ? sorted.slice(0, Number(limit)) : sorted;

    } catch {

        return [];

    }

};

MSW.activity.add = function (activity) {

    const now = new Date();
    const profile = MSW.auth?.getProfile?.() || {};
    const role = MSW.auth?.normalizeRole?.(activity?.userRole || profile.role || "") || "";
    const userEmail = String(activity?.userEmail || profile.email || "").trim().toLowerCase();
    const item = {
        id: String(activity?.id || `activity-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`),
        timestamp: String(activity?.timestamp || now.toISOString()),
        type: String(activity?.type || "PROCUREMENT").trim().toUpperCase(),
        noPR: String(activity?.noPR || "").trim(),
        documentNo: String(activity?.documentNo || "").trim(),
        status: String(activity?.status || "Updated").trim(),
        detail: String(activity?.detail || "").trim(),
        round: String(activity?.round || "").trim().toUpperCase(),
        user: String(activity?.user || profile.name || profile.email || "").trim(),
        fileName: String(activity?.fileName || "").trim(),
        userEmail: userEmail,
        userRole: role
    };

    const rows = MSW.activity.readAll();
    const fingerprint = [item.userEmail, item.type, item.noPR, item.documentNo, item.status, item.round]
        .join("|")
        .toLowerCase();
    const recentDuplicate = rows.find(row => {
        const rowFingerprint = [row.userEmail, row.type, row.noPR, row.documentNo, row.status, row.round]
            .join("|")
            .toLowerCase();
        const ageMs = now.getTime() - new Date(row.timestamp || 0).getTime();
        return rowFingerprint === fingerprint && ageMs >= 0 && ageMs < 30000;
    });

    if (recentDuplicate) return recentDuplicate;

    const nextRows = [item, ...rows.filter(row => row.id !== item.id)]
        .slice(0, MSW.activity.maxItems);

    try {
        localStorage.setItem(MSW.activity.storageKey, JSON.stringify(nextRows));
    } catch {}

    window.dispatchEvent(new CustomEvent("MSW_RECENT_ACTIVITY_UPDATED", { detail: item }));

    try {
        if (window.top && window.top !== window) {
            window.top.postMessage({ action: "MSW_RECENT_ACTIVITY_UPDATED", activity: item }, "*");
        }
    } catch {}

    return item;

};

/* ======================================================
   QUEUE
====================================================== */

MSW.queue = {};

const QUEUE_KEY = "MSW_CONTRACT_QUEUE";

MSW.queue.get = function () {

    try {

        return JSON.parse(
            localStorage.getItem(QUEUE_KEY)
        ) || [];

    } catch {

        return [];

    }

};

MSW.queue.save = function (queue) {

    localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify(queue)
    );

};

MSW.queue.add = function (change) {

    const queue = MSW.queue.get();

    const existing = queue.find(item =>

        item.module === change.module &&
        item.type === change.type &&
        item.rowIndex === change.rowIndex &&
        item.field === change.field

    );

    if (existing) {

        existing.newValue = change.newValue;

        existing.created = Date.now();

    } else {

        queue.push({

            id: Date.now(),

            created: Date.now(),

            ...change

        });

    }

    MSW.queue.save(queue);

};

MSW.queue.remove = function (id) {

    const queue =
        MSW.queue.get()
        .filter(q => q.id !== id);

    MSW.queue.save(queue);

};

MSW.queue.clear = function () {

    localStorage.removeItem(QUEUE_KEY);

};


/* ======================================================
   COMMUNICATION LAUNCHER
====================================================== */

MSW.communication = {};

MSW.communication.openWhatsApp = function (phone = "", message = "") {

    const rawPhone = String(phone || "").trim();
    const rawMessage = String(message || "").trim();

    if (!rawPhone) {

        window.open("https://web.whatsapp.com/", "_blank", "noopener,noreferrer");
        return;

    }

    let digits = rawPhone.replace(/\D/g, "");

    if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
    else if (digits.startsWith("8")) digits = `62${digits}`;
    else if (digits.startsWith("620")) digits = `62${digits.slice(3)}`;

    const url = `https://wa.me/${digits}${rawMessage ? `?text=${encodeURIComponent(rawMessage)}` : ""}`;
    window.open(url, "_blank", "noopener,noreferrer");

};

MSW.communication.openOutlook = function ({ to = "", subject = "", body = "" } = {}) {

    const hasComposeData = String(to || subject || body || "").trim();

    if (!hasComposeData) {

        window.open("https://outlook.office.com/mail/", "_blank", "noopener,noreferrer");
        return;

    }

    const params = new URLSearchParams();
    if (to) params.set("to", String(to));
    if (subject) params.set("subject", String(subject));
    if (body) params.set("body", String(body));

    window.open(
        `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`,
        "_blank",
        "noopener,noreferrer"
    );

};

MSW.communication.injectLauncher = function () {

    // Launcher cepat hanya ditampilkan pada halaman menu utama.
    // Halaman modul tetap memiliki tombol komunikasi yang relevan di dalam fiturnya.
    if (!document.body || document.body.dataset.mswPage !== "main-menu") return;
    if (document.getElementById("mswCommunicationLauncher")) return;

    if (!document.getElementById("mswCommunicationLauncherStyle")) {

        const style = document.createElement("style");
        style.id = "mswCommunicationLauncherStyle";
        style.textContent = `
          .msw-communication-launcher{
            position:fixed;
            right:18px;
            bottom:18px;
            z-index:9998;
            display:flex;
            flex-direction:column;
            gap:10px;
          }
          .msw-communication-button{
            width:48px;
            height:48px;
            display:grid;
            place-items:center;
            padding:0;
            border:0;
            border-radius:16px;
            color:#fff;
            cursor:pointer;
            box-shadow:0 10px 24px rgba(15,23,42,.24);
            transition:transform .16s ease, box-shadow .16s ease, filter .16s ease;
          }
          .msw-communication-button:hover{
            transform:translateY(-2px);
            box-shadow:0 14px 30px rgba(15,23,42,.30);
            filter:brightness(1.03);
          }
          .msw-communication-button:focus-visible{
            outline:3px solid rgba(255,255,255,.95);
            outline-offset:2px;
          }
          .msw-communication-button svg{
            width:24px;
            height:24px;
            display:block;
          }
          .msw-communication-button.is-whatsapp{ background:#25d366; }
          .msw-communication-button.is-outlook{ background:#0a64ad; }
          @media (max-width:640px){
            .msw-communication-launcher{ right:12px; bottom:12px; gap:8px; }
            .msw-communication-button{ width:44px; height:44px; border-radius:14px; }
          }
          @media print{
            .msw-communication-launcher{ display:none !important; }
          }
        `;
        document.head.appendChild(style);

    }

    const launcher = document.createElement("nav");
    launcher.id = "mswCommunicationLauncher";
    launcher.className = "msw-communication-launcher";
    launcher.setAttribute("aria-label", "Akses komunikasi cepat");
    launcher.innerHTML = `
      <button type="button" class="msw-communication-button is-whatsapp"
        title="Buka WhatsApp" aria-label="Buka WhatsApp">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <path d="M20.52 3.48A11.8 11.8 0 0 0 12.08 0C5.55 0 .24 5.3.24 11.83c0 2.08.54 4.11 1.57 5.9L.14 23.82l6.23-1.63a11.8 11.8 0 0 0 5.7 1.45h.01c6.52 0 11.83-5.3 11.83-11.83 0-3.16-1.2-6.12-3.39-8.33ZM12.08 21.64h-.01a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.7.97.99-3.61-.23-.37a9.78 9.78 0 0 1-1.51-5.22c0-5.42 4.41-9.83 9.84-9.83a9.78 9.78 0 0 1 6.96 2.88 9.78 9.78 0 0 1 2.88 6.95c-.01 5.42-4.42 9.81-9.86 9.81Zm5.39-7.36c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.76.96-.94 1.16-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.38-1.47a8.93 8.93 0 0 1-1.65-2.05c-.17-.3-.02-.46.13-.61.13-.13.3-.34.44-.52.15-.17.2-.3.3-.49.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.91-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47 0 1.46 1.07 2.87 1.21 3.06.15.2 2.1 3.2 5.08 4.49.71.3 1.27.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.56-.34Z"/>
        </svg>
      </button>
      <button type="button" class="msw-communication-button is-outlook"
        title="Buka Outlook" aria-label="Buka Outlook">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <path d="M14.1 3.1 3.5 5.1A1.8 1.8 0 0 0 2 6.9v10.2a1.8 1.8 0 0 0 1.5 1.8l10.6 2V3.1Zm-5.2 13c-2 0-3.4-1.6-3.4-4.1 0-2.6 1.4-4.2 3.5-4.2 2.1 0 3.4 1.6 3.4 4.1 0 2.6-1.4 4.2-3.5 4.2Zm.1-6.7c-.9 0-1.5 1-1.5 2.6 0 1.6.6 2.5 1.5 2.5.9 0 1.5-.9 1.5-2.6 0-1.6-.6-2.5-1.5-2.5Z"/>
          <path d="M15.4 6.2h6.1c.3 0 .5.2.5.5v10.6c0 .3-.2.5-.5.5h-6.1v-2.2h4.4l-4.4-3.1v-1.1l4.4-3h-4.4V6.2Zm0 3.5 3.5 2.3-3.5 2.4V9.7Z"/>
        </svg>
      </button>
    `;

    const whatsappButton = launcher.querySelector(".is-whatsapp");
    const outlookButton = launcher.querySelector(".is-outlook");

    whatsappButton.addEventListener("click", () => MSW.communication.openWhatsApp());
    outlookButton.addEventListener("click", () => MSW.communication.openOutlook());

    document.body.appendChild(launcher);

};


/* ======================================================
   INITIALIZE
====================================================== */

MSW.init = function () {

    console.log(

        "MSW Common Library",

        MSW.config.version

    );

    MSW.keyboard.enable();

    MSW.shortcut.enable();

    MSW.communication.injectLauncher();

    window.focus();

    requestAnimationFrame(() => {

      document.body.setAttribute("tabindex", "-1");

      document.body.focus();

    });

};

window.addEventListener("load", () => {

    MSW.init();

});


/* ======================================================
   CONSOLIDATED CORE: performance-cache.js
   ====================================================== */

/* MSW E-Procurement performance layer v1.1
   - User-scoped stale-while-revalidate cache for authenticated GAS GET requests.
   - Scoped fresh-fetch support for views that must bypass stale snapshots safely.
   - Lazy local XLSX loading on first Excel import/export interaction.
   - Never shares cached business responses between different user/role profiles. */
(function(){
  'use strict';
  if (window.__MSW_PERFORMANCE_CACHE_V1__) return;
  window.__MSW_PERFORMANCE_CACHE_V1__ = true;

  const currentScript = document.currentScript;
  let assetBase = '';
  try { assetBase = currentScript?.src ? new URL('../assets/', currentScript.src).href : 'assets/'; }
  catch (_) { assetBase = 'assets/'; }

  /* Role access implementation is consolidated below in this bundle. */
  const CACHE_PREFIX = 'MSW_NET_CACHE_V1_';
  const MAX_STALE_MS = 24 * 60 * 60 * 1000;
  const nativeFetch = window.fetch.bind(window);
  let xlsxPromise = null;
  let freshFetchDepth = 0;

  function profileFrom(storage){
    try {
      const raw = storage.getItem('MSW_ACTIVE_PROFILE');
      if (!raw) return null;
      const p = JSON.parse(raw);
      return p && typeof p === 'object' ? p : null;
    } catch (_) { return null; }
  }

  function activeProfile(){
    return profileFrom(sessionStorage) || profileFrom(localStorage) || null;
  }

  function userScope(){
    const p = activeProfile();
    if (!p) return '';
    const email = String(p.email || '').trim().toLowerCase();
    const role = String(p.role || '').trim().toUpperCase();
    if (!email && !role) return '';
    return `${email}|${role}`;
  }

  function hash(text){
    let h = 2166136261;
    for (let i=0;i<text.length;i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function normalizedGasUrl(raw){
    try {
      const url = new URL(raw, location.href);
      url.searchParams.delete('_');
      url.searchParams.delete('authToken');
      [...url.searchParams.keys()].sort().forEach(() => {});
      return `${url.origin}${url.pathname}?${url.searchParams.toString()}`;
    } catch (_) { return String(raw || ''); }
  }

  function cacheKey(url, scope){
    return CACHE_PREFIX + hash(scope + '|' + normalizedGasUrl(url));
  }

  function readCache(key){
    try {
      const item = JSON.parse(localStorage.getItem(key) || 'null');
      if (!item || !item.body || !item.savedAt) return null;
      if (Date.now() - Number(item.savedAt) > MAX_STALE_MS) return null;
      return item;
    } catch (_) { return null; }
  }

  function saveCache(key, body, status, headers){
    try {
      const payload = { body, status: Number(status || 200), headers: headers || {'Content-Type':'application/json'}, savedAt: Date.now() };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (_) {}
  }

  function responseFromCache(item){
    return new Response(item.body, {
      status: item.status || 200,
      headers: Object.assign({'Content-Type':'application/json','X-MSW-Cache':'HIT'}, item.headers || {})
    });
  }

  async function usableJsonResponse(response){
    if (!response || !response.ok) return null;
    try {
      const text = await response.clone().text();
      if (!text || /^\s*</.test(text)) return null;
      const json = JSON.parse(text);
      if (json?.success === false) return null;
      return { text, json };
    } catch (_) { return null; }
  }

  function isCacheableGasGet(url, init){
    const gas = String(window.APP_CONFIG?.GAS_URL || '').trim();
    const method = String(init?.method || 'GET').toUpperCase();
    return Boolean(gas && method === 'GET' && String(url || '').indexOf(gas) === 0 && userScope());
  }

  async function revalidate(url, init, key){
    try {
      const response = await nativeFetch(url, Object.assign({}, init || {}, {cache:'no-store'}));
      const usable = await usableJsonResponse(response);
      if (!usable) return;
      saveCache(key, usable.text, response.status, {'Content-Type':'application/json'});
      try {
        window.dispatchEvent(new CustomEvent('MSW_BACKGROUND_DATA_REFRESHED', {
          detail: { url: normalizedGasUrl(url), data: usable.json, refreshedAt: Date.now() }
        }));
      } catch (_) {}
    } catch (_) {}
  }

  /* Run only the supplied operation in a direct/fresh network scope.
     Existing callers remain stale-while-revalidate; this is opt-in and therefore
     does not increase GAS traffic for unrelated stable modules. */
  window.MSW_WITH_FRESH_FETCH = async function(task){
    if (typeof task !== 'function') return undefined;
    freshFetchDepth += 1;
    try {
      return await task();
    } finally {
      freshFetchDepth = Math.max(0, freshFetchDepth - 1);
    }
  };

  window.fetch = async function(input, init){
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const requestedCacheMode = String(init?.cache || '').trim().toLowerCase();
    const requiresFreshResponse = requestedCacheMode === 'no-store' || requestedCacheMode === 'reload';

    // Callers that explicitly request no-store/reload must never receive a
    // stale-while-revalidate snapshot. This is required after Import/Delete/
    // All Clear so the UI reflects the mutation that just reached Google Sheet.
    if ((freshFetchDepth > 0 || requiresFreshResponse) && isCacheableGasGet(url, init || {})) {
      const freshInit = Object.assign({}, init || {}, { cache: 'no-store' });
      const response = await nativeFetch(input, freshInit);
      const usable = await usableJsonResponse(response);
      if (usable) {
        const scope = userScope();
        saveCache(cacheKey(url, scope), usable.text, response.status, {'Content-Type':'application/json'});
      }
      return response;
    }

    if (!isCacheableGasGet(url, init || {})) return nativeFetch(input, init);

    const scope = userScope();
    const key = cacheKey(url, scope);
    const cached = readCache(key);
    if (cached) {
      // Return last safe user-scoped snapshot immediately; refresh silently in background.
      revalidate(url, init, key);
      return responseFromCache(cached);
    }

    const response = await nativeFetch(input, init);
    const usable = await usableJsonResponse(response);
    if (usable) saveCache(key, usable.text, response.status, {'Content-Type':'application/json'});
    return response;
  };

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      const existing = document.querySelector(`script[data-msw-asset="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load',resolve,{once:true});
        existing.addEventListener('error',reject,{once:true});
        return;
      }
      const s=document.createElement('script');
      s.src=src;
      s.defer=true;
      s.dataset.mswAsset=src;
      s.onload=()=>{s.dataset.loaded='1';resolve();};
      s.onerror=reject;
      (document.head||document.documentElement).appendChild(s);
    });
  }

  function ensureXLSX(){
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxPromise) xlsxPromise = loadScript(assetBase + 'xlsx.full.min.js?v=20260813-performance-v1').then(()=>window.XLSX);
    return xlsxPromise;
  }
  window.MSW_ENSURE_XLSX = ensureXLSX;

  function looksLikeExcelAction(target){
    const el = target?.closest?.('button,a,label,input');
    if (!el) return false;
    const signature = `${el.id || ''} ${el.className || ''} ${el.textContent || ''} ${el.getAttribute?.('accept') || ''}`.toLowerCase();
    return /excel|xlsx|xls|export|import/.test(signature);
  }

  document.addEventListener('click', async function(event){
    if (window.XLSX || !looksLikeExcelAction(event.target)) return;
    const target = event.target?.closest?.('button,a,label');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try { await ensureXLSX(); target.click(); }
    catch (_) { console.error('XLSX lokal gagal dimuat.'); }
  }, true);

  document.addEventListener('change', async function(event){
    const input = event.target;
    if (window.XLSX || !(input instanceof HTMLInputElement) || input.type !== 'file' || !looksLikeExcelAction(input)) return;
    event.stopImmediatePropagation();
    try {
      await ensureXLSX();
      input.dispatchEvent(new Event('change',{bubbles:true}));
    } catch (_) { console.error('XLSX lokal gagal dimuat.'); }
  }, true);
})();


/* ===== MERGED FROM buyer-view-sync-optimizer-v3512.js ===== */

/* ======================================================
   BUYER VIEW SYNC OPTIMIZER — Release 3.5.12

   Purpose:
   - Keep existing business cache for instant first paint.
   - Refresh Vendor/Contract directly from GAS immediately in background.
   - For BUYER Contract view, Vendor master must not block Contract visibility.
   - No permission, mutation, ownership, filter or backend rule is changed.
====================================================== */
(function installBuyerViewSyncOptimizer(){
  'use strict';
  if (window.__MSW_BUYER_VIEW_SYNC_OPTIMIZER_V3512__) return;
  window.__MSW_BUYER_VIEW_SYNC_OPTIMIZER_V3512__ = true;

  const path = String(window.location.pathname || '').toLowerCase();
  const isVendorPage = /\/vendor-company\/(?:index\.html)?$/.test(path);
  const isContractPage = /\/detail-contract\/(?:index\.html)?$/.test(path);
  if (!isVendorPage && !isContractPage) return;

  function normalizedRole(){
    return String(window.MSW?.auth?.getRole?.() || window.MSW?.auth?.getProfile?.()?.role || '')
      .trim().toUpperCase().replace(/[\s-]+/g, '_');
  }

  function isBuyer(){
    return normalizedRole() === 'BUYER';
  }

  function fresh(task){
    if (typeof task !== 'function') return Promise.resolve();
    if (typeof window.MSW_WITH_FRESH_FETCH === 'function') {
      return window.MSW_WITH_FRESH_FETCH(task);
    }
    return Promise.resolve().then(task);
  }

  function cacheHasArray(key){
    try {
      const value = window.MSW?.cache?.load?.(key);
      return Array.isArray(value) && value.length >= 0;
    } catch (_) {
      return false;
    }
  }

  function silent(promise){
    return Promise.resolve(promise).catch(error => {
      console.warn('Buyer background sync dilewati:', error?.message || error);
      return null;
    });
  }

  function installVendorOptimizer(){
    if (!isBuyer()) return;
    const hadCacheAtStartup = cacheHasArray('MSW_COMPANY_CACHE');
    let lastFreshAt = 0;

    const runFresh = function(){
      if (typeof window.loadFromGoogleSheet !== 'function') return Promise.resolve();
      const now = Date.now();
      if (now - lastFreshAt < 10000) return Promise.resolve();
      lastFreshAt = now;
      return fresh(() => window.loadFromGoogleSheet(true));
    };

    // Core Vendor already renders MSW_COMPANY_CACHE immediately. When cache exists,
    // do not wait for its 60-second timer: refresh directly as soon as window loads.
    window.addEventListener('load', () => {
      if (hadCacheAtStartup) silent(runFresh());
    }, { once: true });

    // Returning to the module/tab is a strong signal that the user expects current data.
    window.addEventListener('focus', () => silent(runFresh()));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) silent(runFresh());
    });
  }

  function installContractOptimizer(){
    if (!isBuyer()) return;

    const originalVendorLoad = window.loadVendorData;
    const originalContractLoad = window.loadFromGoogleSheet;
    if (typeof originalContractLoad !== 'function') return;

    const hadContractCache = cacheHasArray('MSW_CONTRACT_CACHE');
    let startup = true;
    let lastFreshAt = 0;

    // Buyer never edits Company dropdowns. Vendor master may enrich phone/contact,
    // but it must not block the Contract table from becoming usable.
    if (typeof originalVendorLoad === 'function') {
      window.loadVendorData = function(force){
        if (startup && force === true) {
          silent(fresh(() => originalVendorLoad.call(window, true)));
          return Promise.resolve();
        }
        return originalVendorLoad.apply(this, arguments);
      };
    }

    window.loadFromGoogleSheet = function(force){
      if (startup && force === true) {
        startup = false;
        const request = fresh(() => originalContractLoad.call(window, true));
        // With cache: table is already visible, so fresh sync is background-only.
        // Without cache: keep the existing loading overlay until Contract itself arrives.
        if (hadContractCache) {
          silent(request);
          return Promise.resolve();
        }
        return request;
      }
      return originalContractLoad.apply(this, arguments);
    };

    const refreshOnReturn = function(){
      const now = Date.now();
      if (now - lastFreshAt < 10000) return;
      lastFreshAt = now;
      const jobs = [fresh(() => originalContractLoad.call(window, true))];
      if (typeof originalVendorLoad === 'function') jobs.push(fresh(() => originalVendorLoad.call(window, true)));
      silent(Promise.allSettled(jobs));
    };

    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshOnReturn();
    });
  }

  function install(){
    if (!isBuyer()) return;
    if (isVendorPage) installVendorOptimizer();
    if (isContractPage) installContractOptimizer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();


/* ===== MERGED FROM procurement-form-storage-bundle.js ===== */

/*
 * CONSOLIDATION TEST BUNDLE — SHADOW BRANCH ONLY
 * Original source order preserved.
 * - procurement-folder-rules.js
 * - procurement-pr-rules-patch.js
 * - procurement-local-files.js
 * - procurement-existing-pr-folder.js
 */

/* ===== BEGIN ORIGINAL: procurement-folder-rules.js ===== */
(function () {
  'use strict';

  const BIDDERLIST_FOLDER = '02. Bidderlist & Quotation';
  const LEGACY_BIDDERLIST_FOLDER = '02. Bidderlist';
  const ROUND_FOLDER_TYPES = new Set([BIDDERLIST_FOLDER, '03. CQS']);
  const FOLDER_TYPES = [
    '01. PR Approval',
    BIDDERLIST_FOLDER,
    '03. CQS',
    '04. PO',
    '05. Contract'
  ];
  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const DB_STORE = 'handles';
  const ROOT_HANDLE_KEY = 'prRoot';

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function getBasePR(value) {
    const source = text(value);
    if (!source) return '';
    return source
      .replace(/\s*\(\s*Line[^)]*\)\s*$/i, '')
      .replace(/\s+R\s*\d+\s*$/i, '')
      .trim();
  }

  function normalizeRound(value) {
    const match = text(value).toUpperCase().match(/R\s*(\d+)/);
    return match ? `R${Number(match[1])}` : 'R0';
  }

  function getActiveRounds() {
    const roundSelect = document.getElementById('roundpo');
    const active = normalizeRound(roundSelect && roundSelect.value);
    const max = Math.max(0, Number(active.slice(1)) || 0);
    return Array.from({ length: max + 1 }, (_, index) => `R${index}`);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) {
          request.result.createObjectStore(DB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveHandle(handle) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(handle, ROOT_HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function loadHandle() {
    const db = await openDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get(ROOT_HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  }

  async function ensurePermission(handle, requestPermission) {
    if (!handle) return false;
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    if (requestPermission && (await handle.requestPermission(options)) === 'granted') return true;
    return false;
  }

  async function choosePrRoot() {
    if (!window.showDirectoryPicker) {
      throw new Error('Browser ini belum mendukung pemilihan folder lokal. Gunakan Microsoft Edge atau Google Chrome desktop.');
    }
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (text(handle.name).toUpperCase() !== 'PR') {
      throw new Error(`Folder yang dipilih harus bernama PR. Folder terpilih: ${handle.name}`);
    }
    await saveHandle(handle);
    return handle;
  }

  async function ensureLocalStructure(rootHandle, noPR) {
    if (!(await ensurePermission(rootHandle, true))) {
      throw new Error('Izin akses folder PR belum diberikan.');
    }

    const basePR = getBasePR(noPR);
    if (!basePR) throw new Error('No PR belum tersedia.');

    const prFolder = await rootHandle.getDirectoryHandle(basePR, { create: true });
    const rounds = getActiveRounds();

    for (const type of FOLDER_TYPES) {
      const typeFolder = await prFolder.getDirectoryHandle(type, { create: true });
      if (ROUND_FOLDER_TYPES.has(type)) {
        for (const round of rounds) {
          await typeFolder.getDirectoryHandle(round, { create: true });
        }
      }
    }

    return { basePR, rounds };
  }

  function setStatus(message, tone) {
    const el = document.getElementById('localPrFolderStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `text-sm ${tone === 'error' ? 'text-red-700' : tone === 'ok' ? 'text-emerald-700' : 'text-slate-600'}`;
  }

  function buildPanel() {
    if (document.getElementById('localPrFolderPanel')) return;
    const folderManager = document.getElementById('folderManagerSection');
    if (!folderManager) return;

    const panel = document.createElement('section');
    panel.id = 'localPrFolderPanel';
    panel.className = 'mt-8 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4';
    panel.innerHTML = `
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 class="font-semibold text-emerald-900">OneDrive Local Root: PR</h3>
          <p id="localPrFolderStatus" class="text-sm text-slate-600">Belum terhubung ke folder PR.</p>
          <p class="mt-1 text-xs text-slate-500">Pilih hanya folder PR pada OneDrive user. Path C:\\Users\\... tidak disimpan portal.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" id="connectPrRootBtn" class="folder-action-button bg-emerald-600 hover:bg-emerald-700 text-white">Connect Folder PR</button>
          <button type="button" id="createLocalPrStructureBtn" class="folder-action-button bg-indigo-600 hover:bg-indigo-700 text-white">Create / Refresh Structure</button>
        </div>
      </div>`;
    folderManager.parentNode.insertBefore(panel, folderManager);
  }

  async function refreshRootStatus() {
    try {
      const handle = await loadHandle();
      if (!handle) return setStatus('Belum terhubung ke folder PR.', 'neutral');
      const granted = await ensurePermission(handle, false);
      setStatus(granted ? `Terhubung: ${handle.name}` : `Folder ${handle.name} tersimpan. Klik Connect untuk memberi izin lagi.`, granted ? 'ok' : 'neutral');
    } catch (error) {
      setStatus(`Status folder gagal dibaca: ${error.message}`, 'error');
    }
  }

  function installLocalFolderActions() {
    document.getElementById('connectPrRootBtn')?.addEventListener('click', async () => {
      try {
        const handle = await choosePrRoot();
        setStatus(`Terhubung: ${handle.name}`, 'ok');
      } catch (error) {
        if (error && error.name === 'AbortError') return;
        setStatus(error.message || 'Gagal memilih folder PR.', 'error');
      }
    });

    document.getElementById('createLocalPrStructureBtn')?.addEventListener('click', async () => {
      try {
        let handle = await loadHandle();
        if (!handle || !(await ensurePermission(handle, true))) handle = await choosePrRoot();
        const noPR = document.getElementById('noPR')?.value || '';
        const result = await ensureLocalStructure(handle, noPR);
        setStatus(`Siap: PR/${result.basePR} • ${result.rounds.join(', ')}`, 'ok');
      } catch (error) {
        if (error && error.name === 'AbortError') return;
        setStatus(error.message || 'Gagal membuat struktur folder.', 'error');
      }
    });
  }

  function installRoundFolderUi() {
    const typeSelect = document.getElementById('documentFolderType');
    const roundSelect = document.getElementById('documentRound');
    const roundWrapper = document.getElementById('documentRoundWrapper');
    const pathEl = document.getElementById('folderTargetPath');
    if (!typeSelect || !roundSelect || !roundWrapper) return;

    const legacyOption = Array.from(typeSelect.options || []).find(option => option.value === LEGACY_BIDDERLIST_FOLDER);
    if (legacyOption) {
      legacyOption.value = BIDDERLIST_FOLDER;
      legacyOption.textContent = BIDDERLIST_FOLDER;
    }

    const update = () => {
      const type = typeSelect.value;
      const isRoundFolder = ROUND_FOLDER_TYPES.has(type);
      roundWrapper.classList.toggle('hidden', !isRoundFolder);
      if (isRoundFolder) {
        roundSelect.value = normalizeRound(document.getElementById('roundpo')?.value || roundSelect.value);
      }
      if (pathEl) pathEl.textContent = isRoundFolder ? `${type}/${roundSelect.value}` : type;
    };

    typeSelect.addEventListener('change', update);
    roundSelect.addEventListener('change', update);
    document.getElementById('roundpo')?.addEventListener('change', update);
    update();

    if (typeof window.selectedFolderTarget === 'function') {
      window.selectedFolderTarget = function () {
        const type = typeSelect.value || FOLDER_TYPES[0];
        return { type, round: ROUND_FOLDER_TYPES.has(type) ? roundSelect.value : '' };
      };
    }
  }

  function installBasePrAdapter() {
    if (typeof window.postFolderAction !== 'function') return;
    const original = window.postFolderAction;
    window.postFolderAction = async function (payload) {
      const next = payload && typeof payload === 'object' ? { ...payload } : payload;
      if (next && next.noPR) {
        next.displayNoPR = next.noPR;
        next.noPR = getBasePR(next.noPR);
      }
      if (next && ['createFolder', 'getFolderStructure'].includes(next.action)) {
        next.roundFolderTypes = Array.from(ROUND_FOLDER_TYPES);
        next.folderTypes = FOLDER_TYPES.slice();
      }
      return original(next);
    };
  }

  function init() {
    if (!/\/procurement-admin\/Form\//i.test(window.location.pathname)) return;
    buildPanel();
    installLocalFolderActions();
    installRoundFolderUi();
    installBasePrAdapter();
    refreshRootStatus();
    window.MSW_PROCUREMENT_FOLDER_RULES = Object.freeze({
      getBasePR,
      folderTypes: FOLDER_TYPES.slice(),
      roundFolderTypes: Array.from(ROUND_FOLDER_TYPES)
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

/* ===== END ORIGINAL: procurement-folder-rules.js ===== */

/* ===== BEGIN ORIGINAL: procurement-pr-rules-patch.js ===== */
(function(){
  'use strict';
  function patchRules(){
    const identity=window.MSW_PR_IDENTITY;
    const current=window.MSW_PROCUREMENT_FOLDER_RULES;
    if(!identity||!current)return false;
    window.MSW_PROCUREMENT_FOLDER_RULES=Object.freeze({
      ...current,
      getBasePR:identity.getBasePR,
      getRevisionRound:identity.getRevisionRound,
      normalizeRound:identity.normalizeRound
    });
    return true;
  }
  function syncRoundFromNoPr(){
    const identity=window.MSW_PR_IDENTITY;if(!identity)return;
    const noPr=document.getElementById('noPR');if(!noPr)return;
    const revision=identity.getRevisionRound(noPr.value);if(!revision)return;
    const roundPo=document.getElementById('roundpo');if(roundPo&&roundPo.value!==revision){roundPo.value=revision;roundPo.dispatchEvent(new Event('change',{bubbles:true}));}
    const documentRound=document.getElementById('documentRound');if(documentRound&&documentRound.value!==revision)documentRound.value=revision;
  }
  function init(){
    let tries=0;const timer=setInterval(()=>{tries++;if(patchRules()||tries>50)clearInterval(timer);},50);
    syncRoundFromNoPr();
    document.addEventListener('change',e=>{if(e.target?.id==='noPR')syncRoundFromNoPr();},true);
    document.addEventListener('input',e=>{if(e.target?.id==='noPR')syncRoundFromNoPr();},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
/* ===== END ORIGINAL: procurement-pr-rules-patch.js ===== */

/* ===== BEGIN ORIGINAL: procurement-local-files.js ===== */
(function () {
  'use strict';

  const ROUND_TYPES = new Set(['02. Bidderlist & Quotation', '03. CQS']);
  const FOLDER_TYPES = ['01. PR Approval', '02. Bidderlist & Quotation', '03. CQS', '04. PO', '05. Contract'];
  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const DB_STORE = 'handles';
  const ROOT_HANDLE_KEY = 'prRoot';
  const MAX_ENTRIES = 300;

  let rootHandle = null;
  let browserTarget = null;
  let busy = false;

  const text = value => value == null ? '' : String(value).trim();

  function basePR(value) {
    const helper = window.MSW_PROCUREMENT_FOLDER_RULES?.getBasePR;
    if (typeof helper === 'function') return helper(value);
    return text(value).replace(/\s+R\s*\d+(?:\s*\([^)]*\))?\s*$/i, '').trim();
  }

  function roundNo(value) {
    const match = text(value).toUpperCase().match(/R\s*(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function currentRound() {
    return `R${Math.max(
      roundNo(document.getElementById('roundpo')?.value),
      roundNo(document.getElementById('noPR')?.value)
    )}`;
  }

  function selectedTarget() {
    const type = document.getElementById('documentFolderType')?.value || FOLDER_TYPES[0];
    const round = ROUND_TYPES.has(type)
      ? (document.getElementById('documentRound')?.value || currentRound())
      : '';
    return { type, round };
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadRoot() {
    const db = await openDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get(ROOT_HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    rootHandle = handle;
    return handle;
  }

  async function permission(handle, request) {
    if (!handle) return false;
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    return Boolean(request && (await handle.requestPermission(options)) === 'granted');
  }

  async function allowedRoot() {
    const handle = rootHandle || await loadRoot();
    if (!handle) return null;
    if (!(await permission(handle, true))) return null;
    rootHandle = handle;
    return handle;
  }

  async function dirByParts(root, parts, create) {
    let current = root;
    for (const part of parts) current = await current.getDirectoryHandle(part, { create: Boolean(create) });
    return current;
  }

  async function resolveTarget(create = true) {
    const root = await allowedRoot();
    if (!root) throw new Error('Connect Folder PR terlebih dahulu.');
    const pr = basePR(document.getElementById('noPR')?.value);
    if (!pr) throw new Error('No PR belum tersedia.');
    const target = selectedTarget();
    const parts = [pr, target.type];
    if (target.round && ROUND_TYPES.has(target.type)) parts.push(target.round);
    return {
      directory: await dirByParts(root, parts, create),
      path: ['PR', ...parts].join('/'),
      pr,
      ...target
    };
  }

  async function ensureStructure() {
    const root = await allowedRoot();
    if (!root) throw new Error('Connect Folder PR terlebih dahulu.');
    const pr = basePR(document.getElementById('noPR')?.value);
    if (!pr) throw new Error('No PR belum tersedia.');
    const prDir = await root.getDirectoryHandle(pr, { create: true });
    const maxRound = roundNo(currentRound());

    for (const type of FOLDER_TYPES) {
      const typeDir = await prDir.getDirectoryHandle(type, { create: true });
      if (!ROUND_TYPES.has(type)) continue;
      for (let index = 0; index <= maxRound; index += 1) {
        await typeDir.getDirectoryHandle(`R${index}`, { create: true });
      }
    }
    return { pr, maxRound };
  }

  function managerStatus(message, error) {
    const el = document.getElementById('folderManagerStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `text-sm ${error ? 'text-red-700' : 'text-emerald-700'}`;
  }

  function setProgress(done, total, label) {
    const wrapper = document.getElementById('folderUploadProgress');
    const bar = document.getElementById('folderUploadBar');
    const labelEl = document.getElementById('folderUploadLabel');
    const percentEl = document.getElementById('folderUploadPercent');
    const percent = total ? Math.round((done / total) * 100) : 0;
    wrapper?.classList.remove('hidden');
    if (bar) bar.style.width = `${percent}%`;
    if (labelEl) labelEl.textContent = label || `${done}/${total}`;
    if (percentEl) percentEl.textContent = `${percent}%`;
  }

  async function writeFile(directory, file) {
    const relative = text(file.webkitRelativePath) || file.name;
    const parts = relative.replace(/\\/g, '/').split('/').filter(Boolean);
    const fileName = parts.pop() || file.name;
    let target = directory;
    for (const part of parts) target = await target.getDirectoryHandle(part, { create: true });
    const handle = await target.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || busy) return;
    busy = true;
    try {
      const target = await resolveTarget(true);
      setProgress(0, files.length, `Menyiapkan ${files.length} file...`);
      for (let index = 0; index < files.length; index += 1) {
        await writeFile(target.directory, files[index]);
        setProgress(index + 1, files.length, `${index + 1}/${files.length} • ${files[index].name}`);
      }
      managerStatus(`Upload selesai ke ${target.path}`, false);
      await showContents();
    } finally {
      busy = false;
      const fileInput = document.getElementById('folderFileInput');
      const dirInput = document.getElementById('folderDirectoryInput');
      if (fileInput) fileInput.value = '';
      if (dirInput) dirInput.value = '';
    }
  }

  async function collect(directory, prefix, entries) {
    if (entries.length >= MAX_ENTRIES) return entries;
    for await (const [name, handle] of directory.entries()) {
      if (entries.length >= MAX_ENTRIES) break;
      const path = prefix ? `${prefix}/${name}` : name;
      entries.push({ path, kind: handle.kind });
      if (handle.kind === 'directory') await collect(handle, path, entries);
    }
    return entries;
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function render(target, entries) {
    const browser = document.getElementById('folderFileBrowser');
    const title = document.getElementById('folderFileBrowserTitle');
    const list = document.getElementById('folderFileBrowserList');
    if (!browser || !list) return;
    browser.classList.remove('hidden');
    if (title) title.textContent = `Local: ${target.path}`;
    if (!entries.length) {
      list.innerHTML = '<div class="text-sm text-slate-500 py-2">Folder masih kosong.</div>';
      return;
    }
    list.innerHTML = entries.map(entry => {
      const icon = entry.kind === 'directory' ? '📁' : '📄';
      const action = entry.kind === 'file'
        ? `<button type="button" class="local-file-open-btn px-2 py-1 rounded bg-sky-100 text-sky-800 text-xs" data-local-path="${escapeHtml(entry.path)}">Open</button>`
        : '<span class="text-xs text-slate-400">Folder</span>';
      return `<div class="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0">
        <div class="min-w-0 text-sm text-slate-700 break-all">${icon} ${escapeHtml(entry.path)}</div>
        <div class="shrink-0">${action}</div>
      </div>`;
    }).join('');
  }

  async function showContents() {
    const target = await resolveTarget(true);
    browserTarget = target;
    const entries = await collect(target.directory, '', []);
    render(target, entries);
    managerStatus(`Menampilkan ${target.path}`, false);
  }

  async function getFileHandle(directory, relativePath) {
    const parts = text(relativePath).split('/').filter(Boolean);
    const fileName = parts.pop();
    let current = directory;
    for (const part of parts) current = await current.getDirectoryHandle(part, { create: false });
    return current.getFileHandle(fileName, { create: false });
  }

  async function openFile(relativePath) {
    const target = browserTarget || await resolveTarget(true);
    const handle = await getFileHandle(target.directory, relativePath);
    const file = await handle.getFile();
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function hasLocalRoot() {
    const handle = rootHandle || await loadRoot();
    if (!handle) return false;
    rootHandle = handle;
    return true;
  }

  function captureClick(id, localAction, fallbackAction) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      (async () => {
        if (await hasLocalRoot()) return localAction();
        if (typeof fallbackAction === 'function') return fallbackAction();
      })().catch(error => managerStatus(error.message || 'Aksi folder gagal.', true));
    }, true);
  }

  function install() {
    captureClick('ensureFolderBtn', async () => {
      const result = await ensureStructure();
      managerStatus(`Folder lokal siap: PR/${result.pr}`, false);
    }, () => window.ensureFolderStructure?.());

    captureClick('openTargetFolderBtn', showContents, () => window.openSelectedFolder?.());
    captureClick('refreshFolderFilesBtn', showContents, () => window.loadSelectedFolderFiles?.());
    captureClick('uploadFilesBtn', () => document.getElementById('folderFileInput')?.click(), () => document.getElementById('folderFileInput')?.click());
    captureClick('uploadDirectoryBtn', () => document.getElementById('folderDirectoryInput')?.click(), () => document.getElementById('folderDirectoryInput')?.click());

    captureClick('saveCreateFolderBtn', async () => {
      const result = await ensureStructure();
      managerStatus(`Folder lokal siap: PR/${result.pr}`, false);
      if (typeof window.saveProcurement !== 'function') throw new Error('Fungsi penyimpanan procurement tidak tersedia.');
      await window.saveProcurement({ createFolderAfterSave: false });
    }, () => window.saveProcurement?.({ createFolderAfterSave: true }));

    document.getElementById('folderFileInput')?.addEventListener('change', event => {
      if (!rootHandle) return;
      event.stopImmediatePropagation();
      uploadFiles(event.target.files).catch(error => managerStatus(error.message || 'Upload gagal.', true));
    }, true);

    document.getElementById('folderDirectoryInput')?.addEventListener('change', event => {
      if (!rootHandle) return;
      event.stopImmediatePropagation();
      uploadFiles(event.target.files).catch(error => managerStatus(error.message || 'Upload folder gagal.', true));
    }, true);

    document.getElementById('folderFileBrowserList')?.addEventListener('click', event => {
      const button = event.target.closest('.local-file-open-btn');
      if (!button) return;
      event.preventDefault();
      openFile(button.dataset.localPath || '').catch(error => managerStatus(error.message || 'File gagal dibuka.', true));
    });
  }

  async function init() {
    if (!/\/procurement-admin\/Form\//i.test(window.location.pathname)) return;
    try { await loadRoot(); } catch (_) { rootHandle = null; }
    install();
    window.MSW_PROCUREMENT_LOCAL_FILES = Object.freeze({ resolveTarget, ensureStructure, showContents });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

/* ===== END ORIGINAL: procurement-local-files.js ===== */

/* ===== BEGIN ORIGINAL: procurement-existing-pr-folder.js ===== */
(function () {
  'use strict';

  const ROUND_TYPES = new Set(['02. Bidderlist & Quotation', '03. CQS']);
  const FOLDER_TYPES = ['01. PR Approval', '02. Bidderlist & Quotation', '03. CQS', '04. PO', '05. Contract'];
  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const DB_STORE = 'handles';
  const ROOT_HANDLE_KEY = 'prRoot';
  const MAX_ENTRIES = 300;

  let rootHandle = null;
  let browserTarget = null;
  let busy = false;

  const text = value => value == null ? '' : String(value).trim();

  function getBasePR(value) {
    const helper = window.MSW_PROCUREMENT_FOLDER_RULES?.getBasePR;
    if (typeof helper === 'function') return helper(value);
    return text(value)
      .replace(/\s*\(\s*Line[^)]*\)\s*$/i, '')
      .replace(/\s+R\s*\d+\s*$/i, '')
      .trim();
  }

  function roundNo(value) {
    const match = text(value).toUpperCase().match(/R\s*(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function currentRound() {
    return `R${Math.max(
      roundNo(document.getElementById('roundpo')?.value),
      roundNo(document.getElementById('noPR')?.value)
    )}`;
  }

  function selectedTarget() {
    const type = document.getElementById('documentFolderType')?.value || FOLDER_TYPES[0];
    const round = ROUND_TYPES.has(type)
      ? (document.getElementById('documentRound')?.value || currentRound())
      : '';
    return { type, round };
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadRoot() {
    const db = await openDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get(ROOT_HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    rootHandle = handle;
    return handle;
  }

  async function ensurePermission(handle) {
    if (!handle) return false;
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    return (await handle.requestPermission(options)) === 'granted';
  }

  async function allowedRoot() {
    const handle = rootHandle || await loadRoot();
    if (!handle) throw new Error('Connect Folder PR terlebih dahulu.');
    if (!(await ensurePermission(handle))) throw new Error('Izin akses folder PR belum diberikan.');
    rootHandle = handle;
    return handle;
  }

  function isPrefixMatch(folderName, base) {
    const folder = text(folderName).toUpperCase();
    const key = text(base).toUpperCase();
    if (!folder || !key || !folder.startsWith(key)) return false;
    if (folder === key) return true;
    const next = folder.charAt(key.length);
    return /[\s\-_(]/.test(next);
  }

  async function findExistingPrDirectory(root, base) {
    try {
      const exact = await root.getDirectoryHandle(base, { create: false });
      return { handle: exact, name: exact.name || base, match: 'exact' };
    } catch (_) {
      // Continue with prefix lookup.
    }

    const matches = [];
    for await (const [name, handle] of root.entries()) {
      if (handle.kind !== 'directory') continue;
      if (isPrefixMatch(name, base)) matches.push({ handle, name });
    }

    matches.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
    if (matches.length) return { ...matches[0], match: 'prefix' };

    throw new Error(`Folder PR untuk ${base} tidak ditemukan di dalam folder PR. Portal tidak membuat folder root PR baru.`);
  }

  async function resolvePrFolder() {
    const root = await allowedRoot();
    const base = getBasePR(document.getElementById('noPR')?.value);
    if (!base) throw new Error('No PR belum tersedia.');
    const found = await findExistingPrDirectory(root, base);
    return { root, base, ...found };
  }

  async function ensureStructure() {
    const pr = await resolvePrFolder();
    const maxRound = roundNo(currentRound());

    for (const type of FOLDER_TYPES) {
      const typeDir = await pr.handle.getDirectoryHandle(type, { create: true });
      if (!ROUND_TYPES.has(type)) continue;
      for (let index = 0; index <= maxRound; index += 1) {
        await typeDir.getDirectoryHandle(`R${index}`, { create: true });
      }
    }

    return { ...pr, maxRound };
  }

  async function resolveTarget() {
    const pr = await resolvePrFolder();
    const target = selectedTarget();
    let directory = await pr.handle.getDirectoryHandle(target.type, { create: true });
    if (target.round && ROUND_TYPES.has(target.type)) {
      directory = await directory.getDirectoryHandle(target.round, { create: true });
    }
    const parts = ['PR', pr.name, target.type];
    if (target.round && ROUND_TYPES.has(target.type)) parts.push(target.round);
    return { directory, path: parts.join('/'), pr, ...target };
  }

  function managerStatus(message, error) {
    const el = document.getElementById('folderManagerStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `text-sm ${error ? 'text-red-700' : 'text-emerald-700'}`;
  }

  function localStatus(message, error) {
    const el = document.getElementById('localPrFolderStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `text-sm ${error ? 'text-red-700' : 'text-emerald-700'}`;
  }

  function setProgress(done, total, label) {
    const wrapper = document.getElementById('folderUploadProgress');
    const bar = document.getElementById('folderUploadBar');
    const labelEl = document.getElementById('folderUploadLabel');
    const percentEl = document.getElementById('folderUploadPercent');
    const percent = total ? Math.round((done / total) * 100) : 0;
    wrapper?.classList.remove('hidden');
    if (bar) bar.style.width = `${percent}%`;
    if (labelEl) labelEl.textContent = label || `${done}/${total}`;
    if (percentEl) percentEl.textContent = `${percent}%`;
  }

  async function writeFile(directory, file) {
    const relative = text(file.webkitRelativePath) || file.name;
    const parts = relative.replace(/\\/g, '/').split('/').filter(Boolean);
    const fileName = parts.pop() || file.name;
    let target = directory;
    for (const part of parts) target = await target.getDirectoryHandle(part, { create: true });
    const handle = await target.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || busy) return;
    busy = true;
    try {
      const target = await resolveTarget();
      setProgress(0, files.length, `Menyiapkan ${files.length} file...`);
      for (let index = 0; index < files.length; index += 1) {
        await writeFile(target.directory, files[index]);
        setProgress(index + 1, files.length, `${index + 1}/${files.length} • ${files[index].name}`);
      }
      managerStatus(`Upload selesai ke ${target.path}`, false);
      await showContents();
    } finally {
      busy = false;
      const fileInput = document.getElementById('folderFileInput');
      const dirInput = document.getElementById('folderDirectoryInput');
      if (fileInput) fileInput.value = '';
      if (dirInput) dirInput.value = '';
    }
  }

  async function collect(directory, prefix, entries) {
    if (entries.length >= MAX_ENTRIES) return entries;
    for await (const [name, handle] of directory.entries()) {
      if (entries.length >= MAX_ENTRIES) break;
      const path = prefix ? `${prefix}/${name}` : name;
      entries.push({ path, kind: handle.kind });
      if (handle.kind === 'directory') await collect(handle, path, entries);
    }
    return entries;
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function render(target, entries) {
    const browser = document.getElementById('folderFileBrowser');
    const title = document.getElementById('folderFileBrowserTitle');
    const list = document.getElementById('folderFileBrowserList');
    if (!browser || !list) return;
    browser.classList.remove('hidden');
    if (title) title.textContent = `Local: ${target.path}`;
    if (!entries.length) {
      list.innerHTML = '<div class="text-sm text-slate-500 py-2">Folder masih kosong.</div>';
      return;
    }
    list.innerHTML = entries.map(entry => {
      const icon = entry.kind === 'directory' ? '📁' : '📄';
      const action = entry.kind === 'file'
        ? `<button type="button" class="existing-pr-file-open-btn px-2 py-1 rounded bg-sky-100 text-sky-800 text-xs" data-local-path="${escapeHtml(entry.path)}">Open</button>`
        : '<span class="text-xs text-slate-400">Folder</span>';
      return `<div class="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0">
        <div class="min-w-0 text-sm text-slate-700 break-all">${icon} ${escapeHtml(entry.path)}</div>
        <div class="shrink-0">${action}</div>
      </div>`;
    }).join('');
  }

  async function showContents() {
    const target = await resolveTarget();
    browserTarget = target;
    const entries = await collect(target.directory, '', []);
    render(target, entries);
    managerStatus(`Menampilkan ${target.path}`, false);
  }

  async function getFileHandle(directory, relativePath) {
    const parts = text(relativePath).split('/').filter(Boolean);
    const fileName = parts.pop();
    let current = directory;
    for (const part of parts) current = await current.getDirectoryHandle(part, { create: false });
    return current.getFileHandle(fileName, { create: false });
  }

  async function openFile(relativePath) {
    const target = browserTarget || await resolveTarget();
    const handle = await getFileHandle(target.directory, relativePath);
    const file = await handle.getFile();
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function handleError(error) {
    const message = error?.message || 'Aksi folder gagal.';
    managerStatus(message, true);
    localStatus(message, true);
  }

  function installClickOverride() {
    document.addEventListener('click', event => {
      if (!rootHandle) return;
      const button = event.target.closest('button');
      if (!button) return;
      const id = button.id;
      if (!['createLocalPrStructureBtn', 'ensureFolderBtn', 'openTargetFolderBtn', 'refreshFolderFilesBtn', 'uploadFilesBtn', 'uploadDirectoryBtn'].includes(id)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      let action;
      if (id === 'createLocalPrStructureBtn' || id === 'ensureFolderBtn') {
        action = async () => {
          const result = await ensureStructure();
          const message = `Folder ditemukan: PR/${result.name}`;
          managerStatus(message, false);
          localStatus(message, false);
          await showContents();
        };
      } else if (id === 'openTargetFolderBtn' || id === 'refreshFolderFilesBtn') {
        action = showContents;
      } else if (id === 'uploadFilesBtn') {
        action = () => document.getElementById('folderFileInput')?.click();
      } else {
        action = () => document.getElementById('folderDirectoryInput')?.click();
      }

      Promise.resolve(action()).catch(handleError);
    }, true);
  }

  function installInputOverride() {
    document.addEventListener('change', event => {
      if (!rootHandle) return;
      const input = event.target;
      if (!input || !['folderFileInput', 'folderDirectoryInput'].includes(input.id)) return;
      event.stopPropagation();
      event.stopImmediatePropagation();
      uploadFiles(input.files).catch(handleError);
    }, true);
  }

  function installFileOpen() {
    document.getElementById('folderFileBrowserList')?.addEventListener('click', event => {
      const button = event.target.closest('.existing-pr-file-open-btn');
      if (!button) return;
      event.preventDefault();
      openFile(button.dataset.localPath || '').catch(handleError);
    });
  }

  function refreshAfterConnect() {
    document.getElementById('connectPrRootBtn')?.addEventListener('click', () => {
      window.setTimeout(() => loadRoot().catch(() => {}), 800);
      window.setTimeout(() => loadRoot().catch(() => {}), 1800);
    });
  }

  async function init() {
    if (!/\/procurement-admin\/Form\//i.test(window.location.pathname)) return;
    try { await loadRoot(); } catch (_) { rootHandle = null; }
    installClickOverride();
    installInputOverride();
    installFileOpen();
    refreshAfterConnect();
    window.MSW_EXISTING_PR_FOLDER = Object.freeze({
      findExistingPrDirectory,
      resolvePrFolder,
      ensureStructure,
      resolveTarget
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

/* ===== END ORIGINAL: procurement-existing-pr-folder.js ===== */


/* ===== MERGED FROM procurement-pr-identity.js ===== */

(function () {
  'use strict';
  const text = value => value == null ? '' : String(value).trim();
  function stripLineSuffix(value){return text(value).replace(/\s*\(\s*Line[^)]*\)\s*$/i,'').trim();}
  function getRevisionRound(value){const source=stripLineSuffix(value);if(!source)return'';const standalone=source.match(/^R\s*(\d+)$/i);if(standalone)return`R${Number(standalone[1])}`;const revision=source.match(/(\d)\s*R\s*(\d+)\s*$/i);return revision?`R${Number(revision[2])}`:'';}
  function getBasePR(value){const source=stripLineSuffix(value);if(!source)return'';return source.replace(/(\d)\s*R\s*\d+\s*$/i,'$1').trim();}
  function normalizeRound(value,fallback='R0'){const revision=getRevisionRound(value);if(revision)return revision;const match=text(value).match(/^\s*R\s*(\d+)\s*$/i);return match?`R${Number(match[1])}`:fallback;}
  function isProjectFolderMatch(folderName,value){const folder=text(folderName),base=getBasePR(value);if(!folder||!base)return false;const f=folder.toUpperCase(),b=base.toUpperCase();if(f===b)return true;if(!f.startsWith(b))return false;return /[\s\-_(]/.test(folder.charAt(base.length));}
  window.MSW_PR_IDENTITY=Object.freeze({stripLineSuffix,getBasePR,getRevisionRound,normalizeRound,isProjectFolderMatch});
})();

/* ===== MERGED FROM responsive-ui-bundle.js ===== */

/*
 * SHADOW CONSOLIDATION BUNDLE — NOT LOADED BY PRODUCTION
 * Generated from active files without refactoring.
 * Source order is preserved exactly as listed below.
 * Do not reference this bundle until regression verification passes.
 * Sources:
 * - ui-responsive.js
 * - mobile-table-fit.js
 */

/* ===== BEGIN ORIGINAL: ui-responsive.js ===== */
(function () {
  const toggle = document.getElementById('mobileSidebarToggle');
  const backdrop = document.getElementById('mobileSidebarBackdrop');
  const sidebar = document.getElementById('leftSidebar');
  const mainLayout = document.getElementById('mainLayout');
  if (!toggle || !backdrop || !sidebar) return;

  const isAndroidApp = /EprocMSW\//i.test(navigator.userAgent) || /Android/i.test(navigator.userAgent);
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0 ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  if (isAndroidApp) document.body.classList.add('android-app-webview');
  if (isTouchDevice) document.body.classList.add('touch-device');

  // APK always uses the drawer navigation, including wide foldable screens.
  // Normal web browsers use the drawer only on compact widths.
  function useDrawerMode() { return isAndroidApp || window.innerWidth <= 860; }
  function isLandscape() { return !!(window.matchMedia && window.matchMedia('(orientation: landscape)').matches); }
  function clearDesktopHiddenState() {
    sidebar.classList.remove('overlay', 'sidebar-hidden');
    if (mainLayout) mainLayout.classList.remove('sidebar-collapsed');
    const desktopTrigger = document.getElementById('sidebarTrigger');
    if (desktopTrigger) desktopTrigger.classList.add('hidden');
  }
  function syncDrawerModeClass() {
    const drawerMode = useDrawerMode();
    document.body.classList.toggle('mobile-drawer-mode', drawerMode);
    return drawerMode;
  }
  function setOpen(open) {
    const drawerMode = syncDrawerModeClass();
    if (drawerMode) clearDesktopHiddenState();
    else open = false;
    document.body.classList.toggle('mobile-sidebar-open', !!open);
    toggle.setAttribute('aria-expanded', String(!!open));
    toggle.setAttribute('aria-label', open ? 'Close workspace menu' : 'Open workspace menu');
    const icon = toggle.querySelector('[data-lucide]');
    if (icon) icon.setAttribute('data-lucide', open ? 'x' : 'menu');
    if (window.lucide) window.lucide.createIcons();
  }
  function closeDrawer() {
    setOpen(false);
    document.body.classList.remove('mobile-sidebar-open');
  }
  function syncOrientationState() {
    const landscape = isLandscape();
    document.documentElement.classList.toggle('eproc-landscape', landscape);
    document.body.classList.toggle('eproc-landscape', landscape);
    const drawerMode = syncDrawerModeClass();
    if (drawerMode) clearDesktopHiddenState();
    closeDrawer();
  }

  toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('mobile-sidebar-open')));
  backdrop.addEventListener('click', closeDrawer);
  sidebar.addEventListener('click', event => {
    if (!useDrawerMode() || !event.target.closest('.workspace-navigation-item')) return;
    // Close before the workspace handler swaps dashboard/module content so
    // Fold/phone APK navigation never leaves the drawer visible over the new page.
    closeDrawer();
    requestAnimationFrame(closeDrawer);
    setTimeout(closeDrawer, 80);
  }, true);
  window.addEventListener('resize', syncOrientationState, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(syncOrientationState, 80), { passive: true });
  window.addEventListener('pageshow', closeDrawer, { passive: true });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });

  syncDrawerModeClass();
  if (useDrawerMode()) clearDesktopHiddenState();
  closeDrawer();
  syncOrientationState();
})();

(function(){
  if(window.__MSW_RESPONSIVE_ASSET_LOADER__) return;
  window.__MSW_RESPONSIVE_ASSET_LOADER__=true;

  if(!document.querySelector('link[data-eproc-responsive-device]')){
    const responsive=document.createElement('link');
    responsive.rel='stylesheet';
    responsive.href=new URL('../styles/responsive-device.css?v=20260815-drawer-v3', document.currentScript?.src || window.location.href).href;
    responsive.setAttribute('data-eproc-responsive-device','1');
    document.head.appendChild(responsive);
  }

  if(!document.querySelector('link[data-eproc-mobile-fit-css]')){
    const fitCss=document.createElement('link');
    fitCss.rel='stylesheet';
    fitCss.href=new URL('../styles/mobile-table-fit.css?v=20260813-v130', document.currentScript?.src || window.location.href).href;
    fitCss.setAttribute('data-eproc-mobile-fit-css','1');
    document.head.appendChild(fitCss);
  }
})();

/* ===== END ORIGINAL: ui-responsive.js ===== */

/* ===== BEGIN ORIGINAL: mobile-table-fit.js ===== */
/* EprocMSW Mobile Table Fit v1.3.0
   Shared Web + Android responsive layer.
   - Enables explicit user pinch zoom.
   - Adds Fit / 100% / - / + controls to wide tables.
   - Injects ../styles/responsive-device.css and table-fit assets into same-origin iframes.
   Desktop/laptop layout is intentionally unchanged. */
(function(){
  'use strict';

  if (window.__EPROC_MOBILE_TABLE_FIT_V130__) return;
  window.__EPROC_MOBILE_TABLE_FIT_V130__ = true;

  const MOBILE_QUERY = '(max-width: 1024px), (pointer: coarse)';
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 1.50;
  const STEP = 0.10;

  const currentScript = document.currentScript;
  const selfSrc = currentScript && currentScript.src ? currentScript.src : '';
  let baseUrl = '';
  try {
    baseUrl = selfSrc ? new URL('.', selfSrc).href : '';
  } catch (_e) {}
  const SELF_JS_URL = baseUrl ? baseUrl + 'mobile-table-fit.js?v=20260813-universal-v130' : '';
  const SELF_CSS_URL = baseUrl ? baseUrl + '../styles/mobile-table-fit.css?v=20260813-universal-v130' : '';
  const RESPONSIVE_CSS_URL = baseUrl ? baseUrl + '../styles/responsive-device.css?v=20260813-v130' : '';

  function isMobile(){
    return !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);
  }

  function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

  function forceZoomableViewport(doc){
    if(!doc || !doc.head) return;
    let meta = doc.querySelector('meta[name="viewport"]');
    if(!meta){
      meta = doc.createElement('meta');
      meta.setAttribute('name','viewport');
      doc.head.appendChild(meta);
    }
    meta.setAttribute('content','width=device-width, initial-scale=1.0, minimum-scale=0.25, maximum-scale=5.0, user-scalable=yes');
  }

  function ensureStyles(doc){
    if(!doc || !doc.head) return;
    if(RESPONSIVE_CSS_URL && !doc.querySelector('link[data-eproc-responsive-device]')){
      const responsive = doc.createElement('link');
      responsive.rel = 'stylesheet';
      responsive.href = RESPONSIVE_CSS_URL;
      responsive.setAttribute('data-eproc-responsive-device','1');
      doc.head.appendChild(responsive);
    }
    if(SELF_CSS_URL && !doc.querySelector('link[data-eproc-mobile-fit-css]')){
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = SELF_CSS_URL;
      link.setAttribute('data-eproc-mobile-fit-css','1');
      doc.head.appendChild(link);
    }
  }

  function scrollParent(table){
    let el = table.parentElement;
    while(el && el !== document.body){
      const cs = getComputedStyle(el);
      if(/auto|scroll/.test(cs.overflowX) || /table-wrap|table-container|responsive/i.test(el.className || '')) return el;
      el = el.parentElement;
    }
    return table.parentElement || document.body;
  }

  function naturalWidth(table){
    const oldTransform = table.style.transform;
    const oldWidth = table.style.width;
    table.style.transform = 'none';
    table.style.width = '';
    const width = Math.max(table.scrollWidth, table.getBoundingClientRect().width, table.offsetWidth);
    table.style.transform = oldTransform;
    table.style.width = oldWidth;
    return width;
  }

  function ensureWrapperHeight(state){
    const naturalH = state.table.offsetHeight || state.table.getBoundingClientRect().height;
    const saved = Math.max(0, naturalH - (naturalH * state.scale));
    state.table.style.marginBottom = saved ? (-saved) + 'px' : '';
  }

  function setScale(state, value){
    const s = clamp(Number(value) || 1, MIN_SCALE, MAX_SCALE);
    state.scale = s;
    state.table.classList.add('mobile-fit-table');
    state.table.style.transform = 'scale(' + s + ')';
    state.table.dataset.mobileTableScale = String(s);
    if(state.label) state.label.textContent = Math.round(s * 100) + '%';
    ensureWrapperHeight(state);
    document.body.classList.toggle('mobile-table-fit-active', s < 1);
  }

  function fit(state){
    const wrapperWidth = Math.max(1, state.wrapper.clientWidth - 4);
    const tableWidth = Math.max(1, naturalWidth(state.table));
    setScale(state, Math.min(1, wrapperWidth / tableWidth));
    try { state.wrapper.scrollLeft = 0; } catch(_e){}
  }

  function buildTools(state){
    if(state.table.dataset.mobileTableTools === '1') return;
    state.table.dataset.mobileTableTools = '1';
    const bar = document.createElement('div');
    bar.className = 'mobile-table-tools';
    bar.setAttribute('aria-label','Kontrol tampilan tabel');
    const fitBtn = document.createElement('button'); fitBtn.type='button'; fitBtn.textContent='Fit';
    const resetBtn = document.createElement('button'); resetBtn.type='button'; resetBtn.textContent='100%';
    const minusBtn = document.createElement('button'); minusBtn.type='button'; minusBtn.textContent='−';
    const label = document.createElement('span'); label.className='mobile-table-scale'; label.textContent='100%';
    const plusBtn = document.createElement('button'); plusBtn.type='button'; plusBtn.textContent='+';
    bar.append(fitBtn, resetBtn, minusBtn, label, plusBtn);
    state.label = label;
    fitBtn.addEventListener('click',()=>fit(state));
    resetBtn.addEventListener('click',()=>setScale(state,1));
    minusBtn.addEventListener('click',()=>setScale(state,state.scale-STEP));
    plusBtn.addEventListener('click',()=>setScale(state,state.scale+STEP));
    if(state.wrapper && state.wrapper.parentNode) state.wrapper.parentNode.insertBefore(bar,state.wrapper);
  }

  function enhanceTable(table){
    if(!isMobile() || !table || table.dataset.mobileTableEnhanced === '1') return;
    const wrapper = scrollParent(table);
    const width = naturalWidth(table);
    const available = Math.max(window.innerWidth || 0, wrapper ? wrapper.clientWidth : 0);
    if(width <= available + 30) return;
    table.dataset.mobileTableEnhanced='1';
    const state={table,wrapper,scale:1,label:null};
    buildTools(state);
    requestAnimationFrame(()=>fit(state));
  }

  function injectIntoFrame(frame){
    if(!frame || frame.dataset.eprocMobileFitHook === '1') return;
    frame.dataset.eprocMobileFitHook='1';
    function inject(){
      try{
        const doc=frame.contentDocument;
        if(!doc || !doc.documentElement) return;
        forceZoomableViewport(doc);
        ensureStyles(doc);
        if(SELF_JS_URL && !frame.contentWindow.__EPROC_MOBILE_TABLE_FIT_V130__ && !doc.querySelector('script[data-eproc-mobile-fit-js]')){
          const script=doc.createElement('script');
          script.src=SELF_JS_URL; script.defer=true; script.setAttribute('data-eproc-mobile-fit-js','1');
          (doc.body || doc.documentElement).appendChild(script);
        }
      }catch(_e){}
    }
    frame.addEventListener('load',inject);
    inject();
  }

  function scan(){
    if(!isMobile()) return;
    forceZoomableViewport(document);
    ensureStyles(document);
    document.querySelectorAll('table').forEach(enhanceTable);
    document.querySelectorAll('iframe').forEach(injectIntoFrame);
  }

  function init(){
    if(!isMobile()) return;
    scan();
    const observer=new MutationObserver(scan);
    observer.observe(document.documentElement,{childList:true,subtree:true});
    window.EPROC_MOBILE_TABLE=Object.freeze({rescan:scan});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();

/* ===== END ORIGINAL: mobile-table-fit.js ===== */


/* ===== MERGED FROM procurement-action-bundle.js ===== */

/*
 * CONSOLIDATION TEST BUNDLE — SHADOW BRANCH ONLY
 * Original source order preserved.
 * - procurement-action-bridge-v354-hotfix1.js
 * - procurement-buyer-allclear-v358.js
 */

/* ===== BEGIN ORIGINAL: procurement-action-bridge-v354-hotfix1.js ===== */
/* ======================================================
   PROCUREMENT ACTION + MULTI-USER BRIDGE
   Release 3.5.4 hotfix 1
   - Keeps Procurement Action compatibility patch isolated from stable core.
   - Keeps Buyer Smart Import revision retry limited to one safe retry.
   - Prevents unsafe full-sheet retry.
   - Adds Procurement cache quota recovery.
   - Explains backend BUYER All Clear permission denial without bypassing it.
====================================================== */
(function installProcurementActionBridge(){
  'use strict';
  if (window.__MSW_PROCUREMENT_ACTION_BRIDGE_V354_H1__) return;
  window.__MSW_PROCUREMENT_ACTION_BRIDGE_V354_H1__ = true;

  const MODULE_ID = 'procurementAdmin';
  const SHEET_NAME = 'Admin';
  const CACHE_KEY = 'MSW_PROCUREMENT_CACHE';
  const NET_CACHE_PREFIX = 'MSW_NET_CACHE_V1_';
  const BUYER_SAFE_RETRY_ACTION = 'BATCH_IMPORT_PROCUREMENT_BY_BUYER';

  function gasUrl(){ return String(window.APP_CONFIG?.GAS_URL || '').trim(); }
  function role(){
    try { return String(window.MSW?.auth?.getRole?.() || '').trim().toUpperCase(); }
    catch (_) { return ''; }
  }
  function isViewOnly(){ try { return Boolean(window.MSW?.auth?.isViewOnlyModule?.(MODULE_ID)); } catch (_) { return false; } }
  function blockMutation(){ if (!isViewOnly()) return false; try { window.MSW?.auth?.showViewOnlyMessage?.(); } catch (_) {} return true; }

  function notify(message, type = 'info'){
    const text = String(message || '');
    const container = document.getElementById('toastContainer');
    if (!container) { console[type === 'error' ? 'error' : 'info'](text); return; }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 4500);
  }

  function networkCacheEntries(){
    const entries = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = String(localStorage.key(i) || '');
        if (!key.startsWith(NET_CACHE_PREFIX)) continue;
        let savedAt = 0;
        try { savedAt = Number(JSON.parse(localStorage.getItem(key) || '{}')?.savedAt || 0); } catch (_) {}
        entries.push({ key, savedAt });
      }
    } catch (_) {}
    return entries.sort((a,b) => b.savedAt - a.savedAt);
  }

  function prunePerformanceNetworkCache(keepNewest = 4){
    const entries = networkCacheEntries();
    entries.slice(Math.max(0, keepNewest)).forEach(item => {
      try { localStorage.removeItem(item.key); } catch (_) {}
    });
  }

  function clearPerformanceNetworkCache(){
    networkCacheEntries().forEach(item => {
      try { localStorage.removeItem(item.key); } catch (_) {}
    });
  }

  function installProcurementCacheQuotaRecovery(){
    const cache = window.MSW?.cache;
    if (!cache?.save || cache.__MSW_PROCUREMENT_QUOTA_H1__) return;
    cache.__MSW_PROCUREMENT_QUOTA_H1__ = true;

    // Sisakan hanya beberapa snapshot network terbaru agar cache Procurement besar
    // tidak bersaing dengan banyak salinan respons GAS lama di localStorage.
    prunePerformanceNetworkCache(4);

    const baseSave = cache.save.bind(cache);
    cache.save = function(key, data, ttl){
      if (String(key || '') !== CACHE_KEY) return baseSave(key, data, ttl);

      let saved = baseSave(key, data, ttl);
      if (saved !== false) return saved;

      // Jika localStorage penuh, buang cache GET yang bisa dibuat ulang dari server,
      // bukan data transaksi/pending sync, lalu retry satu kali.
      clearPerformanceNetworkCache();
      saved = baseSave(key, data, ttl);
      if (saved === false) {
        notify('Cache browser penuh. Data tetap dibaca dari server, tetapi cache lokal Procurement tidak dapat disimpan.', 'error');
      }
      return saved;
    };
  }

  installProcurementCacheQuotaRecovery();

  function parseJsonBody(body){ if (typeof body !== 'string') return null; try { return JSON.parse(body); } catch (_) { return null; } }
  async function readJsonResponse(response){ try { const text = await response.clone().text(); if (!text || /^\s*</.test(text)) return null; return JSON.parse(text); } catch (_) { return null; } }
  function isRevisionConflict(payload){
    if (!payload || payload.success !== false) return false;
    const message = String(payload.message || '').toLowerCase();
    return Boolean(payload.conflict) || message.includes('berubah sejak halaman dibuka') || message.includes('revision conflict') || message.includes('revision berubah') || (message.includes('revision') && message.includes('muat ulang'));
  }
  function isBuyerAllClearPermissionDenied(message){
    const text = String(message || '').toLowerCase();
    return role() === 'BUYER' && text.includes('akses ditolak') && text.includes('procurement.import');
  }

  const upstreamFetch = window.fetch.bind(window);

  async function fetchFreshAdminSnapshot(){
    const gas = gasUrl();
    if (!gas) throw new Error('Google Apps Script belum dikonfigurasi.');
    const separator = gas.includes('?') ? '&' : '?';
    const url = `${gas}${separator}sheet=${encodeURIComponent(SHEET_NAME)}&revisionProbe=${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const response = await upstreamFetch(url, { cache: 'no-store' });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Google Apps Script HTTP ${response.status}.`);
    if (!raw || /^\s*</.test(raw)) throw new Error('Respons Google Apps Script bukan JSON.');
    const data = JSON.parse(raw);
    if (data?.success === false) throw new Error(data.message || 'Gagal mengambil revision terbaru.');
    if (!Array.isArray(data?.rows)) throw new Error('Snapshot Procurement terbaru tidak valid.');
    return data;
  }

  window.fetch = async function procurementRevisionAwareFetch(input, init){
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const gas = gasUrl();
    const options = init || {};
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    if (!gas || method !== 'POST' || url.indexOf(gas) !== 0) return upstreamFetch(input, init);

    const payload = parseJsonBody(options.body);
    const action = String(payload?.action || '').trim().toUpperCase();
    if (!payload || payload.expectedRevision == null) return upstreamFetch(input, init);

    const firstResponse = await upstreamFetch(input, init);
    const firstPayload = await readJsonResponse(firstResponse);
    if (!isRevisionConflict(firstPayload)) return firstResponse;

    if (action !== BUYER_SAFE_RETRY_ACTION) {
      notify('Data berubah karena aktivitas user lain. Proses dibatalkan agar data terbaru tidak tertimpa.', 'error');
      return firstResponse;
    }

    try {
      const snapshot = await fetchFreshAdminSnapshot();
      const latestRevision = Number(snapshot.revision || 0);
      if (!Number.isFinite(latestRevision)) return firstResponse;
      notify('Data berubah oleh user lain. Smart Import Buyer memakai revision terbaru dan dicoba kembali sekali.', 'info');
      const retryPayload = Object.assign({}, payload, { expectedRevision: latestRevision, clientRetryAfterRevisionConflict: true });
      const retryOptions = Object.assign({}, options, { body: JSON.stringify(retryPayload) });
      return upstreamFetch(url, retryOptions);
    } catch (error) {
      console.warn('Smart Import multi-user retry tidak dapat dijalankan:', error);
      return firstResponse;
    }
  };

  function openProcurementForm(url){
    if (blockMutation()) return;
    const frame = document.getElementById('formFrame');
    const modal = document.getElementById('formModal');
    const formWindow = document.getElementById('formWindow');
    if (!frame || !modal || !formWindow) { notify('Procurement Form belum siap. Muat ulang halaman lalu coba kembali.', 'error'); return; }
    frame.src = url;
    const dragTitle = document.querySelector('#formDragHandle span');
    if (dragTitle) dragTitle.textContent = String(url).includes('workspace/') ? 'Procurement Workspace' : 'Procurement Form';
    formWindow.style.left = '50%'; formWindow.style.top = '50%'; formWindow.style.transform = 'translate(-50%, -50%)'; formWindow.classList.remove('is-dragging'); modal.classList.remove('hidden');
  }

  window.handleAdd = function(){ openProcurementForm('Form/index.html?mode=add'); };
  function cacheRows(){ try { const rows = window.MSW?.cache?.load?.(CACHE_KEY); return Array.isArray(rows) ? rows : []; } catch (_) { return []; } }

  window.exportExcel = function(){
    const rows = cacheRows();
    if (!rows.length) { notify('Tidak ada data untuk diekspor.', 'info'); return; }
    if (!window.XLSX) { notify('Library Excel belum termuat. Klik Export Excel sekali lagi.', 'error'); return; }
    const roundList = ['R0','R1','R2','R3','R4','R5'];
    const exportRows = rows.map(r => {
      const out = {
        'No PR': r.noPR || '', 'Description': r.Description || '', 'Previous Submit PO': r.previoussubmitpo || '', 'Final Vendor List': r.finalvendorlist || '', 'Final Submit Vendor': r.finalsubmitvendor || '', 'Status Rebid': r.statusrebid || '', 'PIC': r.pic || '', 'Assign PR': r.assignprdate || '', 'Departement': r.departement || '', 'Pengadaan': r.pengadaan || '', 'Status PR': r.statuspr || '', 'RFQ': r.rfq || '', 'Est. Price PR': r.estpricerp || '', 'Est. Price US - Rp': r.estpriceus || '', 'USD/IDR Rate': r.usdidrrate || '', 'USD/IDR Rate Date': r.usdidrratedate || '', 'USD/IDR Source': r.usdidrsource || '', 'USD/IDR Locked': r.usdidrlocked === true || String(r.usdidrlocked || '').toLowerCase() === 'true', 'Flow Process': r.flowprocess || '', 'Round PR': r.roundpo || ''
      };
      roundList.forEach(round => { const key = round.toLowerCase(); out[`${round} Company`] = r[`${key}company`] || ''; out[`${round} Submit Company`] = r[`${key}submitcompany`] || ''; out[`${round} Start Date`] = r[`${key}startdate`] || ''; out[`${round} Finish Date`] = r[`${key}finishdate`] || ''; });
      Object.assign(out, { 'Winner PO': r.winnerpo || '', 'Email Winner PO': r.emailwinnerpo || '', 'No PO': r.nopo || '', 'Price (Rp) Excl. PPn': r.pricerp || '', 'CQS Create Date': r.cqscreatedate || '', 'CQS Approval Date': r.cqsapprovaldate || '', 'PO Create Date': r.pocreatedate || '', 'PO Del. Date': r.podeldate || '', 'Actual PO Rel. Date': r.actualporeleasedate || '', 'Actual PO Del. Date': r.actualpodeldate || '', 'Days Calender (Days)': r.days || '', 'Actual Received PO (GRN Date)': r.actualreceivedpo || '', 'Note': r.note || '', 'Folder ID': r.folderid || '', 'Folder LINK': r.folderlink || '' });
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(exportRows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Procurement'); XLSX.writeFile(wb, `Procurement Admin-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  window.clearAll = async function(){
    if (blockMutation()) return;
    if (!window.confirm('Hapus semua data?')) return;
    try {
      notify('Memeriksa revision Procurement terbaru...', 'info');
      const snapshot = await fetchFreshAdminSnapshot();
      const revision = Number(snapshot.revision || 0);
      if (!Number.isFinite(revision)) throw new Error('Revision Procurement terbaru tidak valid.');
      const gas = gasUrl();
      const response = await upstreamFetch(gas, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'BATCH_REPLACE_PROCUREMENT', sheet: SHEET_NAME, rows: [], expectedRevision: revision }) });
      const raw = await response.text();
      let result; try { result = raw ? JSON.parse(raw) : {}; } catch (_) { throw new Error(raw || `HTTP ${response.status}`); }
      if (isRevisionConflict(result)) throw new Error('Data Procurement berubah setelah konfirmasi. All Clear dibatalkan agar perubahan user lain tidak terhapus. Muat ulang lalu ulangi jika masih diperlukan.');
      if (!response.ok || result?.success === false) {
        const serverMessage = result?.message || `Google Sheet gagal diperbarui (HTTP ${response.status}).`;
        if (isBuyerAllClearPermissionDenied(serverMessage)) {
          throw new Error('BUYER_ALL_CLEAR_PERMISSION:Backend menolak All Clear untuk role BUYER karena permission procurement.import belum diberikan. Proteksi ini tidak dibypass agar Buyer tidak dapat menghapus data Buyer lain.');
        }
        throw new Error(serverMessage);
      }
      if (result?.queued || result?.pendingSync) { notify('All Clear tersimpan sebagai Pending Sync dan akan dijalankan saat koneksi tersedia.', 'info'); return; }
      try { window.MSW?.cache?.remove?.(CACHE_KEY); } catch (_) {}
      clearPerformanceNetworkCache();
      notify('Semua data Procurement berhasil dihapus.', 'success');
      setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      const message = String(error?.message || error || '');
      if (message.startsWith('BUYER_ALL_CLEAR_PERMISSION:')) {
        const userMessage = 'All Clear belum diizinkan server untuk BUYER. Agar aman pada sistem multi-user, Buyer tidak akan diberi bypass untuk menghapus seluruh sheet. Backend Apps Script perlu permission/action khusus untuk menghapus data Buyer sendiri.';
        console.warn(userMessage);
        notify(userMessage, 'error');
        return;
      }
      console.error('All Clear gagal:', error);
      notify(`All Clear gagal: ${message}`, 'error');
    }
  };

  function parseFlexibleDate(value){
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (!Number.isNaN(Number(value)) && Number(value) > 20000 && Number(value) < 80000) { const date = new Date((Number(value) - 25569) * 86400 * 1000); return Number.isNaN(date.getTime()) ? null : date; }
    const text = String(value).trim();
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,mei:4,jun:5,jul:6,aug:7,agu:7,agt:7,sep:8,oct:9,okt:9,nov:10,dec:11,des:11};
    const named = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{2,4})$/);
    if (named) { let year = Number(named[3]); if (year < 100) year += 2000; const month = months[named[2].slice(0,3).toLowerCase()]; if (month !== undefined) return new Date(year, month, Number(named[1])); }
    const numeric = text.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
    if (numeric) { let year = Number(numeric[3]); if (year < 100) year += 2000; return new Date(year, Number(numeric[2]) - 1, Number(numeric[1])); }
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/); if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const date = new Date(text); return Number.isNaN(date.getTime()) ? null : date;
  }
  function formatDate(value){ const date = parseFlexibleDate(value); return date ? date.toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : String(value || ''); }

  window.updateRoundPR = function(index, selectedValue){
    const rows = cacheRows(); const row = rows[Number(index)]; const tr = document.querySelector(`#tableBody tr[data-index="${Number(index)}"]`); if (!row || !tr) return;
    const selected = String(selectedValue || 'R0').trim().toUpperCase().match(/^R[0-5]$/)?.[0] || 'R0';
    const stored = String(row.roundpo || '').trim().toUpperCase().match(/^R[0-5]$/)?.[0] || 'R0';
    const key = selected.toLowerCase(); const active = selected === stored;
    const company = row[`${key}company`] || (active ? row.roundcompany : '') || ''; const submitted = row[`${key}submitcompany`] || (active ? row.roundsubmitcompany : '') || ''; const start = row[`${key}startdate`] || (active ? row.roundstartdate : '') || ''; const finish = row[`${key}finishdate`] || (active ? row.roundfinishdate : '') || '';
    const setText = (field, value) => { const cell = tr.querySelector(`td[data-key="${field}"]`); if (cell) cell.textContent = String(value ?? ''); };
    setText('roundcompany', company); setText('roundsubmitcompany', submitted); setText('roundstartdate', formatDate(start)); setText('roundfinishdate', formatDate(finish)); setText('finalvendorlist', company && start && finish ? company : ''); setText('finalsubmitvendor', submitted);
  };
  window.updateRoundPO = window.updateRoundPR;
})();

/* ===== END ORIGINAL: procurement-action-bridge-v354-hotfix1.js ===== */

/* ===== BEGIN ORIGINAL: procurement-buyer-allclear-v358.js ===== */
/* ======================================================
   BUYER-SCOPED ALL CLEAR — Release 3.5.8
   Uses one backend action CLEAR_OWN_PROCUREMENT.
   Backend verifies exact Owner Email and deletes only authenticated BUYER rows.
====================================================== */
(function installBuyerScopedAllClearV358(){
  'use strict';
  if (window.__MSW_BUYER_SCOPED_ALLCLEAR_V358__) return;
  window.__MSW_BUYER_SCOPED_ALLCLEAR_V358__ = true;

  const SHEET_NAME = 'Admin';
  const CACHE_KEY = 'MSW_PROCUREMENT_CACHE';

  function role(){ try { return String(window.MSW?.auth?.getRole?.() || '').trim().toUpperCase(); } catch (_) { return ''; } }
  function profile(){ try { return window.MSW?.auth?.getProfile?.() || {}; } catch (_) { return {}; } }
  function gasUrl(){ return String(window.APP_CONFIG?.GAS_URL || '').trim(); }

  function notify(message, type = 'info'){
    const container = document.getElementById('toastContainer');
    if (!container) { console[type === 'error' ? 'error' : 'info'](message); return; }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = String(message || '');
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 5000);
  }

  function clearReloadableCaches(){
    try { window.MSW?.cache?.remove?.(CACHE_KEY); } catch (_) {}
    try {
      Object.keys(localStorage).forEach(key => {
        if (String(key).startsWith('MSW_NET_CACHE_V1_')) localStorage.removeItem(key);
      });
    } catch (_) {}
  }

  async function freshRevision(){
    const gas = gasUrl();
    const separator = gas.includes('?') ? '&' : '?';
    const url = `${gas}${separator}sheet=${encodeURIComponent(SHEET_NAME)}&buyerClearProbe=${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const response = await window.fetch(url, { cache: 'no-store' });
    const raw = await response.text();
    if (!response.ok || !raw || /^\s*</.test(raw)) throw new Error(`Gagal membaca Procurement terbaru (HTTP ${response.status}).`);
    const data = JSON.parse(raw);
    if (data?.success === false) throw new Error(data.message || 'Gagal membaca Procurement terbaru.');
    return Number(data.revision || 0);
  }

  async function buyerClearAll(){
    const activeProfile = profile();
    const email = String(activeProfile?.email || '').trim().toLowerCase();
    if (!email) { notify('Email akun BUYER tidak ditemukan. All Clear dibatalkan.', 'error'); return; }

    const confirmed = window.confirm(
      `Hapus semua data Procurement milik akun ${email}?\n\n` +
      'Data Buyer lain tidak akan dihapus. Tindakan ini tidak dapat dibatalkan.'
    );
    if (!confirmed) return;

    try {
      notify('Memeriksa revision Procurement terbaru...', 'info');
      const revision = await freshRevision();
      const response = await window.fetch(gasUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'CLEAR_OWN_PROCUREMENT',
          sheet: SHEET_NAME,
          expectedRevision: revision
        })
      });
      const raw = await response.text();
      let result;
      try { result = raw ? JSON.parse(raw) : {}; }
      catch (_) { throw new Error(raw || `HTTP ${response.status}`); }

      if (result?.conflict) {
        throw new Error(result.message || 'Data berubah oleh user lain. Muat ulang lalu ulangi All Clear.');
      }
      if (!response.ok || result?.success === false) {
        throw new Error(result?.message || `All Clear gagal (HTTP ${response.status}).`);
      }

      clearReloadableCaches();
      notify(result.message || `${Number(result.deletedCount || 0)} data Procurement milik ${email} berhasil dihapus.`, 'success');
      setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      console.error('Buyer-scoped All Clear gagal:', error);
      notify(`All Clear BUYER gagal: ${error?.message || error}`, 'error');
    }
  }

  function installOverride(){
    if (role() !== 'BUYER') return true;
    if (typeof window.clearAll !== 'function') return false;
    window.clearAll = buyerClearAll;
    window.__MSW_BUYER_SCOPED_ALLCLEAR_ACTIVE__ = true;
    return true;
  }

  if (!installOverride()) {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (installOverride() || tries > 120) clearInterval(timer);
    }, 50);
  }
})();

/* ===== END ORIGINAL: procurement-buyer-allclear-v358.js ===== */


/* ===== MERGED FROM global-table-filter-scroll-v3511.js ===== */

/* ======================================================
   GLOBAL TABLE FILTER SCROLL FIX — Release 3.5.11

   Shared compatibility layer for table column-filter popups.
   It is intentionally business-logic agnostic: no data, role, permission,
   filter selection, sorting, import/export, or backend behavior is changed.

   Problem addressed:
   Several modules close an Excel-style filter popup on any captured `scroll`
   event (`document.addEventListener('scroll', close..., true)`). Internal
   scrolling of the filter values bubbles through that captured listener too,
   so the popup closes or becomes impossible to browse.

   Rule:
   - Scroll/wheel/touch inside a filter popup stays inside that popup.
   - Scroll outside the popup keeps each module's existing close behavior.
====================================================== */
(function installGlobalTableFilterScroll(){
  'use strict';
  if (window.__MSW_GLOBAL_TABLE_FILTER_SCROLL_V3511__) return;
  window.__MSW_GLOBAL_TABLE_FILTER_SCROLL_V3511__ = true;

  const MENU_SELECTOR = [
    '.excel-column-filter-menu',
    '.column-filter-menu',
    '.table-filter-menu',
    '.filter-dropdown-menu',
    '[data-column-filter-menu]',
    '[data-table-filter-menu]'
  ].join(',');

  const VALUES_SELECTOR = [
    '.excel-filter-values',
    '.column-filter-values',
    '.table-filter-values',
    '.filter-value-list',
    '[data-column-filter-values]',
    '[data-table-filter-values]'
  ].join(',');

  function asElement(target){
    return target instanceof Element ? target : null;
  }

  function closestMenu(target){
    const element = asElement(target);
    return element ? element.closest(MENU_SELECTOR) : null;
  }

  function closestScrollableValues(target){
    const element = asElement(target);
    if (!element) return null;

    const explicit = element.closest(VALUES_SELECTOR);
    if (explicit) return explicit;

    const menu = element.closest(MENU_SELECTOR);
    if (!menu) return null;

    // Generic fallback for a future filter implementation: only treat an
    // element as the value scroller when it is inside a known filter menu and
    // actually has vertical overflow.
    let current = element;
    while (current && current !== menu.parentElement) {
      if (current.scrollHeight > current.clientHeight + 1) {
        const style = getComputedStyle(current);
        if (/auto|scroll|overlay/i.test(style.overflowY || '')) return current;
      }
      if (current === menu) break;
      current = current.parentElement;
    }
    return null;
  }

  // Registered from config.js before module business scripts. This prevents
  // later document-level captured scroll handlers from closing the filter when
  // the scroll originated inside the filter itself.
  document.addEventListener('scroll', function(event){
    if (!closestMenu(event.target)) return;
    event.stopImmediatePropagation();
  }, true);

  // Keep mouse/trackpad scrolling inside the value list while that list can
  // still move in the requested direction. At the list boundary we do not
  // prevent the module/page from receiving the wheel event.
  document.addEventListener('wheel', function(event){
    const scroller = closestScrollableValues(event.target);
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) return;

    const down = event.deltaY > 0;
    const up = event.deltaY < 0;
    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;

    if ((down && !atBottom) || (up && !atTop)) event.stopPropagation();
  }, { capture: true, passive: true });

  // Prevent pointer/touch gestures inside the scrollable filter values from
  // being interpreted as gestures on the underlying table.
  ['pointerdown', 'touchstart'].forEach(type => {
    document.addEventListener(type, function(event){
      if (!closestScrollableValues(event.target)) return;
      event.stopPropagation();
    }, { capture: true, passive: true });
  });

  const style = document.createElement('style');
  style.id = 'msw-global-table-filter-scroll-v3511';
  style.textContent = `
    ${MENU_SELECTOR} {
      pointer-events: auto !important;
      overscroll-behavior: contain;
    }
    ${VALUES_SELECTOR} {
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
      scrollbar-gutter: stable;
      pointer-events: auto !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
})();


/* ===== MERGED FROM cache-hardening-v358.js ===== */

/* ======================================================
   MSW CACHE HARDENING — Release 3.5.8
   Loaded after common.js. Keeps auth/profile/pending-sync safe when
   localStorage quota is full. Business/network caches may be rebuilt.
====================================================== */
(function installCacheHardeningV358(){
  'use strict';
  if (window.__MSW_CACHE_HARDENING_V358__) return;
  window.__MSW_CACHE_HARDENING_V358__ = true;

  const MSW = window.MSW;
  if (!MSW?.cache) return;

  const cache = MSW.cache;
  cache.version = '1.1.0';

  const PROTECTED_KEYS = new Set([
    'MSW_AUTH_TOKEN','MSW_ACTIVE_PROFILE','MSW_UI_SETTINGS','MSW_PENDING_SYNC_V1',
    'MSW_MODULES','MSW_RECENT_ACTIVITY_V1','MSW_CONTRACT_QUEUE'
  ]);
  const BUSINESS_KEYS = new Set(['MSW_PROCUREMENT_CACHE','MSW_CONTRACT_CACHE']);
  const NETWORK_PREFIX = 'MSW_NET_CACHE_V1_';

  function isQuotaError(error){
    return Boolean(error && (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014 || /quota/i.test(String(error.message || ''))));
  }
  function allKeys(){ try { return Object.keys(localStorage); } catch (_) { return []; } }
  function isProtected(key){ return PROTECTED_KEYS.has(String(key || '')); }

  function pruneExpired(){
    let removed = false;
    allKeys().forEach(key => {
      if (!String(key).startsWith('MSW_') || isProtected(key)) return;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const payload = JSON.parse(raw);
        if (payload?.expiredAt && Date.now() > Number(payload.expiredAt)) {
          localStorage.removeItem(key); removed = true;
        }
      } catch (_) {}
    });
    return removed;
  }

  function pruneNetworkCache(){
    let removed = false;
    allKeys().forEach(key => {
      if (!String(key).startsWith(NETWORK_PREFIX)) return;
      try { localStorage.removeItem(key); removed = true; } catch (_) {}
    });
    return removed;
  }

  function pruneOtherLargeCaches(exceptKey){
    let removed = false;
    BUSINESS_KEYS.forEach(key => {
      if (key === exceptKey) return;
      try {
        if (localStorage.getItem(key) !== null) { localStorage.removeItem(key); removed = true; }
      } catch (_) {}
    });
    return removed;
  }

  cache._isProtectedKey = isProtected;
  cache._pruneExpired = pruneExpired;
  cache._pruneNetworkCache = pruneNetworkCache;
  cache._pruneLargeCaches = pruneOtherLargeCaches;

  cache.save = function(key, data, ttl = cache.defaultTTL){
    let serialized;
    try {
      serialized = JSON.stringify({ version: cache.version, updatedAt: Date.now(), expiredAt: Date.now() + ttl, data: JSON.parse(JSON.stringify(data)) });
    } catch (error) {
      console.warn('Cache serialization gagal:', key, error); return false;
    }

    const attempt = () => { localStorage.setItem(key, serialized); return true; };
    try { return attempt(); }
    catch (error) {
      if (!isQuotaError(error)) { console.error('Cache Save Error:', error); return false; }
    }

    const recoverySteps = [pruneExpired, pruneNetworkCache, () => pruneOtherLargeCaches(key)];
    for (const recover of recoverySteps) {
      try {
        if (!recover()) continue;
        try { return attempt(); }
        catch (error) { if (!isQuotaError(error)) throw error; }
      } catch (_) {}
    }

    let previous = null;
    try {
      previous = localStorage.getItem(key);
      localStorage.removeItem(key);
      return attempt();
    } catch (error) {
      if (previous !== null) { try { localStorage.setItem(key, previous); } catch (_) {} }
      console.warn('Cache Save dilewati karena localStorage penuh:', key, '- aplikasi tetap menggunakan data server.');
      return false;
    }
  };

  cache.load = function(key){
    try {
      const raw = localStorage.getItem(key); if (!raw) return null;
      const payload = JSON.parse(raw);
      if (payload?.expiredAt && Date.now() > Number(payload.expiredAt)) { localStorage.removeItem(key); return null; }
      return JSON.parse(JSON.stringify(payload.data));
    } catch (error) { console.warn('Cache Load Error:', key, error); return null; }
  };

  cache.remove = function(key){ try { localStorage.removeItem(key); } catch (_) {} };
  cache.exist = function(key){ try { return localStorage.getItem(key) !== null; } catch (_) { return false; } };
  cache.info = function(key){ try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (_) { return null; } };

  cache.clearAll = function(){
    try {
      allKeys().forEach(key => {
        if (isProtected(key)) return;
        if (BUSINESS_KEYS.has(key) || String(key).startsWith(NETWORK_PREFIX)) localStorage.removeItem(key);
      });
      return true;
    } catch (error) { console.warn('Clear cache gagal:', error); return false; }
  };

  pruneExpired();
})();


/* ===== MERGED FROM procurement-review-bundle.js ===== */

/*
 * SHADOW CONSOLIDATION BUNDLE — NOT LOADED BY PRODUCTION
 * Generated from active files without refactoring.
 * Source order is preserved exactly as listed below.
 * Do not reference this bundle until regression verification passes.
 * Sources:
 * - procurement-review-rules-v359.js
 * - procurement-review-note-fast-v3514.js
 * - procurement-review-note-v3513.js
 * - procurement-review-export-v3514.js
 */

/* ===== BEGIN ORIGINAL: procurement-review-rules-v359.js ===== */
/* ======================================================
   PROCUREMENT REVIEW DISPLAY RULES — Release 3.5.9
   Presentation-only adapter for the root Procurement Review table.

   Rules:
   - Finish Date appears only when Flow Process is exactly RFQ.
   - Finish Date comes from the last/current Round PR Finish Date.
   - Requirement Date appears only when Flow Process contains "Completed"
     anywhere in the text and uses Actual PO Del. Date.
   - Adds Status Rebid derived only from the last/current Round PR.
   - Does not modify Procurement Admin source data or backend behavior.
====================================================== */
(function installProcurementReviewRulesV359(){
  'use strict';
  if (window.__MSW_PROCUREMENT_REVIEW_RULES_V359__) return;
  window.__MSW_PROCUREMENT_REVIEW_RULES_V359__ = true;

  const ROUND_LIST = ['R0','R1','R2','R3','R4','R5'];
  const REVIEW_COLUMN_COUNT = 10;

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function valueOf(row, aliases){
    try {
      if (typeof window.smartGetField === 'function') {
        const value = window.smartGetField(row, aliases);
        if (value !== undefined && value !== null && text(value) !== '') return value;
      }
    } catch (_) {}
    if (!row || typeof row !== 'object') return '';
    for (const key of aliases) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        const value = row[key];
        if (value !== undefined && value !== null && text(value) !== '') return value;
      }
    }
    return '';
  }

  function flowOf(row){
    return text(valueOf(row, ['flowprocess', 'Flow Process']));
  }

  function normalizedFlow(row){
    return flowOf(row).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function normalizeRound(value){
    const match = text(value).toUpperCase().match(/R\s*([0-5])/);
    return match ? `R${match[1]}` : '';
  }

  function roundField(row, round, suffix){
    const lower = round.toLowerCase();
    const label = suffix === 'company' ? 'Company'
      : suffix === 'submitcompany' ? 'Submit Company'
      : suffix === 'finishdate' ? 'Finish Date'
      : suffix === 'startdate' ? 'Start Date'
      : suffix;
    return valueOf(row, [
      `${lower}${suffix}`,
      `${round} ${label}`,
      `${round}${label.replace(/\s+/g, '')}`
    ]);
  }

  function lastRoundInfo(row){
    const declared = normalizeRound(valueOf(row, ['roundpo', 'roundpr', 'Round PR', 'Round PO']));
    if (declared) return { round: declared, found: true };

    const statusRound = normalizeRound(valueOf(row, ['statusrebid', 'Status Rebid']));
    if (statusRound) return { round: statusRound, found: true };

    let latest = '';
    ROUND_LIST.forEach(round => {
      const hasRoundData = ['company','submitcompany','startdate','finishdate']
        .some(suffix => text(roundField(row, round, suffix)) !== '');
      if (hasRoundData) latest = round;
    });
    return { round: latest || 'R0', found: Boolean(latest) };
  }

  function parseDate(value){
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = text(value);
    if (!raw) return null;

    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
      const date = new Date((numeric - 25569) * 86400000);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    try {
      if (typeof window.overviewParseDate === 'function') {
        const parsed = window.overviewParseDate(raw);
        if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed;
      }
    } catch (_) {}

    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function formatDate(value){
    const date = parseDate(value);
    if (!date) return text(value);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function splitVendors(value){
    const seen = new Set();
    return text(value)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split(/\n|;/)
      .map(item => item.trim())
      .filter(item => {
        const key = item.toLocaleLowerCase('id');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function reviewFinishDate(row){
    // Exact RFQ only. "Completed RFQ", "RFQ Completed", CQS, Create BL, etc. stay blank.
    if (normalizedFlow(row) !== 'rfq') return '';
    const info = lastRoundInfo(row);
    if (!info.found) return '';
    return formatDate(roundField(row, info.round, 'finishdate'));
  }

  function reviewRequirementDate(row){
    // Completed may be at the beginning, middle, or end of Flow Process.
    if (!/completed/i.test(flowOf(row))) return '';
    return formatDate(valueOf(row, [
      'actualpodeldate',
      'Actual PO Del. Date',
      'Actual PO Delivery Date'
    ]));
  }

  function reviewStatusRebid(row){
    const info = lastRoundInfo(row);
    if (!info.found) return '';
    const invited = splitVendors(roundField(row, info.round, 'company'));
    const submitted = splitVendors(roundField(row, info.round, 'submitcompany'));
    const finish = formatDate(roundField(row, info.round, 'finishdate'));
    return [
      info.round,
      `${submitted.length} of ${invited.length}`,
      finish
    ].filter(Boolean).join(' / ');
  }

  function reviewValues(row){
    const coreText = (aliases) => text(valueOf(row, aliases));
    const procurementName = typeof window.overviewProcurementName === 'function'
      ? window.overviewProcurementName(row)
      : coreText(['Description']);
    const status = typeof window.overviewStatus === 'function'
      ? window.overviewStatus(row)
      : coreText(['statuspr', 'Status PR', 'Status']);

    return [
      coreText(['noPR', 'No PR', 'PR Number']),
      procurementName,
      coreText(['ownerName', 'Owner Name', 'Buyer (Ditambahkan)', 'buyer', 'Buyer', 'Buyer Name', 'Signature Buyer', 'ownerEmail', 'Owner Email']),
      coreText(['pic', 'PIC']),
      status,
      flowOf(row),
      reviewFinishDate(row),
      reviewRequirementDate(row),
      reviewStatusRebid(row),
      coreText(['notebuyer', 'Note Buyer', 'Buyer Note', 'Note'])
    ];
  }

  function ensureFilterSlots(){
    try {
      if (Array.isArray(PROCUREMENT_REVIEW_FILTERS)) {
        while (PROCUREMENT_REVIEW_FILTERS.length < REVIEW_COLUMN_COUNT) PROCUREMENT_REVIEW_FILTERS.push('');
      }
    } catch (_) {}
  }

  function installReviewValueOverride(){
    if (typeof window.overviewReviewValues !== 'function') return false;
    window.overviewReviewValues = reviewValues;
    return true;
  }

  function ensureHeader(){
    const headerRow = document.querySelector('#procurementReviewPanel .procurement-overview-table thead tr');
    if (!headerRow) return false;

    const headers = Array.from(headerRow.querySelectorAll('th'));
    const noteHeader = headers.find(th => /^\s*Note\s*$/i.test(th.querySelector('span')?.textContent || th.textContent || ''));
    if (!noteHeader) return false;

    const noteFilter = noteHeader.querySelector('[data-procurement-filter-button]');
    if (noteFilter) {
      noteFilter.dataset.procurementFilterButton = '9';
      noteFilter.setAttribute('aria-label', 'Filter Note');
      noteFilter.title = 'Filter Note';
    }

    if (!headerRow.querySelector('[data-msw-review-status-rebid]')) {
      const th = document.createElement('th');
      th.dataset.mswReviewStatusRebid = 'true';
      th.innerHTML = '<span>Status Rebid</span><button type="button" class="procurement-header-filter" data-procurement-filter-button="8" aria-label="Filter Status Rebid" title="Filter Status Rebid"><i data-lucide="filter"></i></button>';
      headerRow.insertBefore(th, noteHeader);
      try { window.lucide?.createIcons?.(); } catch (_) {}
    }
    return true;
  }

  function fixStateColspan(){
    document.querySelectorAll('#procurementOverviewRows td.procurement-overview-state').forEach(cell => {
      cell.colSpan = REVIEW_COLUMN_COUNT;
    });
  }

  function refreshReview(){
    ensureFilterSlots();
    ensureHeader();
    fixStateColspan();
    try {
      if (typeof window.renderProcurementReviewPage === 'function') window.renderProcurementReviewPage();
    } catch (error) {
      console.warn('Procurement Review v3.5.9 rerender skipped:', error);
    }
    fixStateColspan();
  }

  function install(){
    if (!installReviewValueOverride()) return false;
    ensureFilterSlots();
    ensureHeader();

    const body = document.getElementById('procurementOverviewRows');
    if (body && !body.__MSW_REVIEW_V359_OBSERVER__) {
      body.__MSW_REVIEW_V359_OBSERVER__ = true;
      new MutationObserver(fixStateColspan).observe(body, { childList: true, subtree: true });
    }

    // Core resets the filter array to 9 slots when Procurement Year changes.
    // Restore the new Status Rebid slot after that existing handler completes.
    document.addEventListener('click', event => {
      if (!event.target.closest?.('[data-procurement-overview-year]')) return;
      queueMicrotask(() => {
        ensureFilterSlots();
        ensureHeader();
      });
    }, true);

    refreshReview();
    window.MSW_PROCUREMENT_REVIEW_RULES_V359 = Object.freeze({
      reviewFinishDate,
      reviewRequirementDate,
      reviewStatusRebid,
      lastRoundInfo
    });
    return true;
  }

  if (!install()) {
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (install() || tries > 120) window.clearInterval(timer);
    }, 50);
  }
})();

/* ===== END ORIGINAL: procurement-review-rules-v359.js ===== */

/* ===== BEGIN ORIGINAL: procurement-review-note-fast-v3514.js ===== */
/* ======================================================
   PROCUREMENT REVIEW FAST NOTE BRIDGE — Release 3.5.14

   Intercepts ONLY the note-only Procurement Review EDIT payload and upgrades it
   to UPDATE_PROCUREMENT_NOTE. If the deployed Apps Script does not support the
   new lightweight action yet, it safely falls back to the existing EDIT action.
   No other Procurement edit request is changed.
====================================================== */
(function installProcurementReviewFastNoteBridgeV3514(){
  'use strict';
  if (window.__MSW_PROCUREMENT_REVIEW_FAST_NOTE_V3514__) return;
  window.__MSW_PROCUREMENT_REVIEW_FAST_NOTE_V3514__ = true;
  if (document.body?.dataset?.mswPage !== 'main-menu') return;

  const previousFetch = window.fetch.bind(window);

  function text(value){ return String(value == null ? '' : value).trim(); }

  function parseBody(init){
    if (!init || String(init.method || 'GET').toUpperCase() !== 'POST') return null;
    if (typeof init.body !== 'string') return null;
    try { return JSON.parse(init.body); } catch (_) { return null; }
  }

  function isNoteOnlyEdit(body){
    if (!body || text(body.action).toUpperCase() !== 'EDIT') return false;
    if (text(body.sheet || 'Admin').toUpperCase() !== 'ADMIN') return false;
    const data = body.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const allowed = new Set(['procurementId','Procurement ID','__version','version','Version','note','Note']);
    const keys = Object.keys(data);
    if (!keys.length || !keys.some(key => key === 'note' || key === 'Note')) return false;
    if (!keys.every(key => allowed.has(key))) return false;
    return Boolean(text(data.procurementId || data['Procurement ID']));
  }

  function fastPayload(body){
    const data = body.data || {};
    return {
      action: 'UPDATE_PROCUREMENT_NOTE',
      sheet: body.sheet || 'Admin',
      authToken: body.authToken || '',
      procurementId: data.procurementId || data['Procurement ID'] || '',
      expectedVersion: data.__version ?? data.version ?? data.Version ?? 0,
      note: data.note ?? data.Note ?? ''
    };
  }

  async function responseJson(response){
    try { return JSON.parse(await response.clone().text()); }
    catch (_) { return null; }
  }

  function unsupported(result){
    if (!result || result.success !== false) return false;
    return /action atau payload tidak dikenali|unknown action|update_procurement_note.*tidak/i.test(String(result.message || ''));
  }

  window.fetch = async function(input, init){
    const body = parseBody(init);
    if (!isNoteOnlyEdit(body)) return previousFetch(input, init);

    const upgradedInit = Object.assign({}, init, {body: JSON.stringify(fastPayload(body))});
    try {
      const fastResponse = await previousFetch(input, upgradedInit);
      const result = await responseJson(fastResponse);
      if (!unsupported(result)) return fastResponse;
    } catch (_) {
      // Backend lama / deployment belum mendukung action baru: fallback di bawah.
    }

    return previousFetch(input, init);
  };
})();

/* ===== END ORIGINAL: procurement-review-note-fast-v3514.js ===== */

/* ===== BEGIN ORIGINAL: procurement-review-note-v3513.js ===== */
/* ======================================================
   PROCUREMENT REVIEW NOTE EDITOR — Release 3.5.13

   - Click No PR in Procurement Review to edit the same Admin-sheet Note field.
   - Uses existing partial EDIT action, so unrelated Procurement fields stay intact.
   - BUYER ownership and SUPER_ADMIN permissions remain enforced by backend.
   - Sends row Version to preserve optimistic concurrency protection.
====================================================== */
(function installProcurementReviewNoteV3513(){
  'use strict';
  if (window.__MSW_PROCUREMENT_REVIEW_NOTE_V3513__) return;
  window.__MSW_PROCUREMENT_REVIEW_NOTE_V3513__ = true;
  if (!/\/(?:index\.html)?$/i.test(location.pathname)) return;

  let activeRow = null;
  let saving = false;

  function text(value){ return String(value == null ? '' : value).trim(); }

  function valueOf(row, aliases){
    if (!row || typeof row !== 'object') return '';
    try {
      if (typeof window.smartGetField === 'function') {
        const value = window.smartGetField(row, aliases);
        if (value !== undefined && value !== null && text(value) !== '') return value;
      }
    } catch (_) {}
    for (const key of aliases) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
      const value = row[key];
      if (value !== undefined && value !== null && text(value) !== '') return value;
    }
    return '';
  }

  function authToken(){
    try {
      if (typeof window.MSW_GET_AUTH_TOKEN === 'function') return text(window.MSW_GET_AUTH_TOKEN());
      if (typeof getStoredAuthToken === 'function') return text(getStoredAuthToken());
    } catch (_) {}
    return text(sessionStorage.getItem('MSW_AUTH_TOKEN') || localStorage.getItem('MSW_AUTH_TOKEN'));
  }

  function ensureUi(){
    if (document.getElementById('mswReviewNoteModal')) return;

    const style = document.createElement('style');
    style.id = 'mswReviewNoteStyleV3513';
    style.textContent = `
      .msw-review-pr-note-btn{appearance:none;border:0;background:transparent;padding:0;color:#075985;font:inherit;cursor:pointer;text-decoration:none;text-align:left}
      .msw-review-pr-note-btn:hover,.msw-review-pr-note-btn:focus-visible{color:#0369a1;text-decoration:underline;outline:none}
      .msw-review-note-cell-btn{appearance:none;width:100%;min-width:96px;border:1px solid #bae6fd;border-radius:7px;background:#f0f9ff;color:#075985;padding:6px 9px;font:inherit;font-size:12px;cursor:pointer;text-align:left}
      .msw-review-note-cell-btn:hover,.msw-review-note-cell-btn:focus-visible{border-color:#0284c7;background:#e0f2fe;outline:none}
      .msw-review-note-cell-btn.is-empty{color:#64748b;font-style:italic}
      #mswReviewNoteModal{position:fixed;inset:0;z-index:2147482500;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.48);backdrop-filter:blur(2px)}
      #mswReviewNoteModal[hidden]{display:none!important}
      .msw-review-note-card{width:min(560px,96vw);background:#fff;border:1px solid #cbd5e1;border-radius:14px;box-shadow:0 22px 65px rgba(15,23,42,.28);overflow:hidden}
      .msw-review-note-head{padding:16px 18px 12px;border-bottom:1px solid #e2e8f0}
      .msw-review-note-head h3{margin:0;color:#0f172a;font-size:17px;font-weight:800}
      .msw-review-note-head p{margin:4px 0 0;color:#64748b;font-size:12px}
      .msw-review-note-body{padding:16px 18px}
      #mswReviewNoteText{width:100%;min-height:130px;resize:vertical;border:1px solid #cbd5e1;border-radius:9px;padding:10px 12px;font:inherit;font-size:13px;line-height:1.5;outline:none}
      #mswReviewNoteText:focus{border-color:#0284c7;box-shadow:0 0 0 3px rgba(14,165,233,.12)}
      #mswReviewNoteStatus{min-height:18px;margin-top:7px;font-size:11px;color:#64748b}
      #mswReviewNoteStatus.error{color:#b91c1c}#mswReviewNoteStatus.ok{color:#047857}
      .msw-review-note-actions{display:flex;justify-content:flex-end;gap:8px;padding:0 18px 16px}
      .msw-review-note-actions button{border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer}
      #mswReviewNoteCancel{border:1px solid #cbd5e1;background:#fff;color:#334155}
      #mswReviewNoteSave{border:1px solid #0284c7;background:#0284c7;color:#fff}
      #mswReviewNoteSave:disabled,#mswReviewNoteCancel:disabled{opacity:.55;cursor:not-allowed}
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'mswReviewNoteModal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="msw-review-note-card" role="dialog" aria-modal="true" aria-labelledby="mswReviewNoteTitle">
        <div class="msw-review-note-head">
          <h3 id="mswReviewNoteTitle">Procurement Note</h3>
          <p id="mswReviewNotePr">No PR: -</p>
        </div>
        <div class="msw-review-note-body">
          <textarea id="mswReviewNoteText" placeholder="Isi catatan untuk Procurement ini..."></textarea>
          <div id="mswReviewNoteStatus" aria-live="polite"></div>
        </div>
        <div class="msw-review-note-actions">
          <button type="button" id="mswReviewNoteCancel">Batal</button>
          <button type="button" id="mswReviewNoteSave">Simpan Note</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('mswReviewNoteCancel')?.addEventListener('click', closeModal);
    document.getElementById('mswReviewNoteSave')?.addEventListener('click', saveNote);
    modal.addEventListener('pointerdown', event => { if (event.target === modal) closeModal(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.hidden && !saving) closeModal();
    });
  }

  function setStatus(message, kind){
    const el = document.getElementById('mswReviewNoteStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = kind || '';
  }

  function setBusy(value){
    saving = Boolean(value);
    const save = document.getElementById('mswReviewNoteSave');
    const cancel = document.getElementById('mswReviewNoteCancel');
    const textarea = document.getElementById('mswReviewNoteText');
    if (save) { save.disabled = saving; save.textContent = saving ? 'Menyimpan...' : 'Simpan Note'; }
    if (cancel) cancel.disabled = saving;
    if (textarea) textarea.disabled = saving;
  }

  function openModal(row){
    const role = String(window.MSW?.auth?.getRole?.() || '').toUpperCase();
    if (role === 'USER') return window.MSW?.auth?.showViewOnlyMessage?.();
    ensureUi();
    const modal = document.getElementById('mswReviewNoteModal');
    const pr = text(valueOf(row, ['noPR','No PR','PR Number']));
    const note = text(valueOf(row, ['note','Note','notebuyer','Note Buyer','Buyer Note']));
    activeRow = row;
    document.getElementById('mswReviewNotePr').textContent = `No PR: ${pr || '-'}`;
    document.getElementById('mswReviewNoteText').value = note;
    setStatus('Note ini tersimpan pada data Procurement yang sama.', '');
    setBusy(false);
    modal.hidden = false;
    requestAnimationFrame(() => document.getElementById('mswReviewNoteText')?.focus({preventScroll:true}));
  }

  function closeModal(){
    if (saving) return;
    const modal = document.getElementById('mswReviewNoteModal');
    if (modal) modal.hidden = true;
    activeRow = null;
    setStatus('', '');
  }

  function updateRowObject(row, note, version){
    if (!row || typeof row !== 'object') return;
    row.note = note;
    row.Note = note;
    if (Object.prototype.hasOwnProperty.call(row, 'notebuyer')) row.notebuyer = note;
    if (Object.prototype.hasOwnProperty.call(row, 'Note Buyer')) row['Note Buyer'] = note;
    if (version != null && Number.isFinite(Number(version))) {
      row.version = Number(version);
      row.Version = Number(version);
    }
  }

  function updateKnownRows(identity, note, version){
    const targetId = text(identity.procurementId);
    const targetPr = text(identity.noPR);
    const collections = [];
    try { if (Array.isArray(PROCUREMENT_OVERVIEW_SOURCE_ROWS)) collections.push(PROCUREMENT_OVERVIEW_SOURCE_ROWS); } catch (_) {}
    try { if (Array.isArray(PROCUREMENT_REVIEW_ROWS)) collections.push(PROCUREMENT_REVIEW_ROWS); } catch (_) {}

    collections.forEach(rows => rows.forEach(row => {
      const rowId = text(valueOf(row, ['procurementId','Procurement ID']));
      const rowPr = text(valueOf(row, ['noPR','No PR','PR Number']));
      if ((targetId && rowId === targetId) || (!targetId && targetPr && rowPr === targetPr)) updateRowObject(row, note, version);
    }));

    try {
      const cache = window.MSW?.cache?.load?.('MSW_PROCUREMENT_CACHE');
      if (Array.isArray(cache)) {
        let changed = false;
        cache.forEach(row => {
          const rowId = text(valueOf(row, ['procurementId','Procurement ID']));
          const rowPr = text(valueOf(row, ['noPR','No PR','PR Number']));
          if ((targetId && rowId === targetId) || (!targetId && targetPr && rowPr === targetPr)) {
            updateRowObject(row, note, version);
            changed = true;
          }
        });
        if (changed) window.MSW?.cache?.save?.('MSW_PROCUREMENT_CACHE', cache);
      }
    } catch (_) {}
  }

  async function saveNote(){
    if (!activeRow || saving) return;
    const noPR = text(valueOf(activeRow, ['noPR','No PR','PR Number']));
    const procurementId = text(valueOf(activeRow, ['procurementId','Procurement ID']));
    const versionRaw = valueOf(activeRow, ['version','Version']);
    const version = Number(versionRaw || 0);
    const note = String(document.getElementById('mswReviewNoteText')?.value || '').trim();

    if (!noPR) return setStatus('No PR tidak tersedia pada record ini.', 'error');
    if (!procurementId) return setStatus('Procurement ID belum tersedia. Buka Procurement sekali untuk memigrasikan identitas record.', 'error');

    const token = authToken();
    if (!token) return setStatus('Sesi login tidak ditemukan. Silakan login ulang.', 'error');

    setBusy(true);
    setStatus('Menyimpan Note ke Procurement Admin...', '');
    try {
      const response = await fetch(String(window.APP_CONFIG?.GAS_URL || ''), {
        method: 'POST',
        headers: {'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify({
          action: 'UPDATE_PROCUREMENT_NOTE',
          sheet: 'Admin',
          authToken: token,
          procurementId,
          expectedVersion: Number.isFinite(version) ? version : 0,
          note
        })
      });
      const raw = await response.text();
      let result;
      try { result = JSON.parse(raw); }
      catch (_) { throw new Error('Server mengembalikan respons yang tidak valid.'); }

      if (result?.queued || result?.pendingSync) throw new Error('Perubahan belum tersimpan di Google Sheet; masih menunggu Pending Sync. Coba kembali saat online.');
      if (!result?.success) {
        if (result?.conflict) throw new Error(result.message || 'Data berubah di perangkat lain. Muat ulang lalu coba lagi.');
        throw new Error(result?.message || 'Note gagal disimpan.');
      }

      updateKnownRows({procurementId, noPR}, note, result.version);
      try { localStorage.setItem('MSW_PROCUREMENT_NOTE_SYNC', JSON.stringify({procurementId, noPR, note, version:result.version, at:Date.now()})); } catch (_) {}
      try { document.querySelectorAll('iframe').forEach(frame => frame.contentWindow?.postMessage({action:'MSW_PROCUREMENT_NOTE_UPDATED', procurementId, noPR, note, version:result.version}, location.origin)); } catch (_) {}
      activeRow = null;
      const modal = document.getElementById('mswReviewNoteModal');
      if (modal) modal.hidden = true;
      setBusy(false);
      try { if (typeof window.renderProcurementReviewPage === 'function') window.renderProcurementReviewPage(); } catch (_) {}
    } catch (error) {
      setBusy(false);
      setStatus(error?.message || String(error), 'error');
    }
  }

  function currentPageRows(){
    try {
      if (!Array.isArray(PROCUREMENT_REVIEW_ROWS) || typeof overviewReviewValues !== 'function') return [];
      const filters = Array.isArray(PROCUREMENT_REVIEW_FILTERS) ? PROCUREMENT_REVIEW_FILTERS : [];
      const filtered = PROCUREMENT_REVIEW_ROWS.filter(row => overviewReviewValues(row).every((value, index) =>
        !filters[index] || String(value || '').toLowerCase().includes(filters[index])
      ));
      const size = Number(PROCUREMENT_REVIEW_PAGE_SIZE || 10) || 10;
      const page = Math.max(1, Number(PROCUREMENT_REVIEW_PAGE || 1) || 1);
      const start = (page - 1) * size;
      return filtered.slice(start, start + size);
    } catch (_) {
      return [];
    }
  }

  function decorateRows(){
    const body = document.getElementById('procurementOverviewRows');
    if (!body) return;
    const rows = currentPageRows();
    const trs = Array.from(body.querySelectorAll('tr')).filter(tr => !tr.querySelector('.procurement-overview-state'));
    trs.forEach((tr, index) => {
      const row = rows[index];
      const prCell = tr.cells?.[0];
      const noteCell = tr.cells?.[tr.cells.length - 1];
      if (!row || !prCell || !noteCell) return;
      const pr = text(valueOf(row, ['noPR','No PR','PR Number'])) || text(prCell.textContent);
      const note = text(valueOf(row, ['note','Note','notebuyer','Note Buyer','Buyer Note']));
      prCell.textContent = '';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'msw-review-pr-note-btn';
      button.textContent = pr || '-';
      button.title = 'Klik untuk isi / edit Note Procurement';
      button.setAttribute('aria-label', `Edit Note ${pr || 'Procurement'}`);
      button.addEventListener('click', () => openModal(row));
      prCell.appendChild(button);

      noteCell.textContent = '';
      const noteButton = document.createElement('button');
      noteButton.type = 'button';
      noteButton.className = `msw-review-note-cell-btn${note ? '' : ' is-empty'}`;
      noteButton.textContent = note || '+ Tambah note';
      noteButton.title = `Isi / edit Note untuk ${pr || 'Procurement'}`;
      noteButton.setAttribute('aria-label', `Isi atau edit Note ${pr || 'Procurement'}`);
      noteButton.addEventListener('click', () => openModal(row));
      noteCell.appendChild(noteButton);
    });
  }

  function wrapRenderer(){
    if (typeof window.renderProcurementReviewPage !== 'function') return false;
    if (window.renderProcurementReviewPage.__MSW_NOTE_V3513__) return true;
    const original = window.renderProcurementReviewPage;
    const wrapped = function(){
      const result = original.apply(this, arguments);
      queueMicrotask(decorateRows);
      return result;
    };
    wrapped.__MSW_NOTE_V3513__ = true;
    window.renderProcurementReviewPage = wrapped;
    decorateRows();
    return true;
  }

  function install(){
    ensureUi();
    if (!wrapRenderer()) return false;
    const body = document.getElementById('procurementOverviewRows');
    if (body && !body.__MSW_NOTE_OBSERVER_V3513__) {
      body.__MSW_NOTE_OBSERVER_V3513__ = true;
      new MutationObserver(() => queueMicrotask(decorateRows)).observe(body, {childList:true, subtree:false});
    }
    return true;
  }

  function startNoteEditor(){
    if (document.body?.dataset?.mswPage !== 'main-menu') return;
    if (!install()) {
      let tries = 0;
      const timer = window.setInterval(() => {
        tries += 1;
        if (install() || tries > 160) window.clearInterval(timer);
      }, 50);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startNoteEditor, {once:true});
  else startNoteEditor();
})();

/* ===== END ORIGINAL: procurement-review-note-v3513.js ===== */

/* ===== BEGIN ORIGINAL: procurement-review-export-v3514.js ===== */
/* ======================================================
   PROCUREMENT REVIEW PRINT / EXPORT — Release 3.5.14

   - Adds Print and Export Excel actions to Procurement Review.
   - Exports the entire currently filtered Review result, not only page 1.
   - Respects Buyer/year/column filters already applied by the Review core.
   - Uses the same 10 visible Review columns, including Status Rebid and Note.
   - Does not mutate Procurement source data.
====================================================== */
(function installProcurementReviewExportV3514(){
  'use strict';
  if (window.__MSW_PROCUREMENT_REVIEW_EXPORT_V3514__) return;
  window.__MSW_PROCUREMENT_REVIEW_EXPORT_V3514__ = true;
  if (document.body?.dataset?.mswPage !== 'main-menu') return;

  const HEADERS = [
    'No PR','Procurement','Buyer','Requestor','Status','Flow Process',
    'Finish Date','Requirement Date','Status Rebid','Note'
  ];

  function text(value){ return String(value == null ? '' : value).trim(); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[ch]);
  }

  function filteredRows(){
    try {
      if (!Array.isArray(PROCUREMENT_REVIEW_ROWS) || typeof overviewReviewValues !== 'function') return [];
      const filters = Array.isArray(PROCUREMENT_REVIEW_FILTERS) ? PROCUREMENT_REVIEW_FILTERS : [];
      return PROCUREMENT_REVIEW_ROWS.filter(row => {
        const values = overviewReviewValues(row);
        return values.every((value, index) => !filters[index] || String(value || '').toLowerCase().includes(filters[index]));
      });
    } catch (_) {
      return [];
    }
  }

  function rowsAsValues(){
    return filteredRows().map(row => overviewReviewValues(row).map(value => text(value)));
  }

  function currentContext(){
    let year = 'ALL';
    let buyer = 'ALL';
    try { year = text(PROCUREMENT_OVERVIEW_YEAR || 'ALL') || 'ALL'; } catch (_) {}
    try { buyer = text(PROCUREMENT_OVERVIEW_BUYER || 'ALL') || 'ALL'; } catch (_) {}
    return {year, buyer};
  }

  function safeFilePart(value){
    return text(value).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'ALL';
  }

  async function exportExcel(){
    const values = rowsAsValues();
    if (!values.length) {
      window.alert('Tidak ada data Procurement Review sesuai filter saat ini.');
      return;
    }

    if (typeof window.MSW_ENSURE_XLSX === 'function') await window.MSW_ENSURE_XLSX();
    if (!window.XLSX) throw new Error('Library Excel belum tersedia.');

    const context = currentContext();
    const aoa = [HEADERS, ...values];
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      {wch:24},{wch:48},{wch:28},{wch:24},{wch:12},{wch:22},
      {wch:16},{wch:18},{wch:30},{wch:55}
    ];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Procurement Review');
    const date = new Date().toISOString().slice(0,10);
    window.XLSX.writeFile(wb, `Procurement_Review_${safeFilePart(context.year)}_${date}.xlsx`);
  }

  function printReview(){
    const values = rowsAsValues();
    if (!values.length) {
      window.alert('Tidak ada data Procurement Review sesuai filter saat ini.');
      return;
    }

    const context = currentContext();
    const body = values.map(row => `<tr>${row.map(value => `<td>${esc(value || '-')}</td>`).join('')}</tr>`).join('');
    const header = HEADERS.map(value => `<th>${esc(value)}</th>`).join('');
    const generated = new Date().toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const popup = window.open('', '_blank');
    if (!popup) {
      window.alert('Popup print diblokir browser. Izinkan popup untuk portal ini lalu coba lagi.');
      return;
    }
    try { popup.opener = null; } catch (_) {}
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Procurement Review</title><style>
      @page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;margin:0;font-size:8.5px}
      h1{font-size:16px;margin:0 0 3px}p{margin:0 0 8px;color:#475569;font-size:9px}.meta{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px}
      table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #cbd5e1;padding:4px 5px;vertical-align:top;white-space:pre-wrap;word-break:break-word}
      th{background:#163f6d;color:#fff;font-weight:700;text-align:left}tbody tr:nth-child(even){background:#f8fafc}
      .footer{margin-top:6px;color:#64748b;font-size:8px}@media print{button{display:none}}
    </style></head><body>
      <h1>Procurement Review</h1>
      <div class="meta"><span><b>Year:</b> ${esc(context.year)}</span><span><b>Buyer:</b> ${esc(context.buyer)}</span><span><b>Rows:</b> ${values.length}</span><span><b>Generated:</b> ${esc(generated)}</span></div>
      <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
      <div class="footer">PT Makmur Sejahtera Wisesa — Procurement Division</div>
      <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},100);});<\/script>
    </body></html>`);
    popup.document.close();
  }

  function style(){
    if (document.getElementById('mswProcurementReviewExportStyleV3514')) return;
    const el = document.createElement('style');
    el.id = 'mswProcurementReviewExportStyleV3514';
    el.textContent = `
      #mswProcurementReviewActions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap;margin:6px 0 10px}
      #mswProcurementReviewActions button{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px;padding:6px 10px;font:inherit;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
      #mswProcurementReviewActions button:hover{background:#f8fafc;border-color:#94a3b8}
      #mswProcurementReviewActions .msw-review-export-primary{background:#0f766e;border-color:#0f766e;color:#fff}
      #mswProcurementReviewActions .msw-review-export-primary:hover{background:#115e59}
      @media(max-width:700px){#mswProcurementReviewActions{width:100%;justify-content:flex-end}}
    `;
    document.head.appendChild(el);
  }

  function installActions(){
    const title = document.getElementById('procurementOverviewTitle');
    const panel = document.getElementById('procurementReviewPanel') || document.getElementById('procurementAdminOverview');
    if (!title || !panel) return false;
    if (document.getElementById('mswProcurementReviewActions')) return true;
    style();

    const actions = document.createElement('div');
    actions.id = 'mswProcurementReviewActions';
    actions.innerHTML = `
      <button type="button" id="mswProcurementReviewPrint" title="Print seluruh data sesuai filter">Print</button>
      <button type="button" id="mswProcurementReviewExcel" class="msw-review-export-primary" title="Export seluruh data sesuai filter ke Excel">Export Excel</button>`;

    const host = title.parentElement;
    if (!host) return false;
    title.insertAdjacentElement('afterend', actions);

    document.getElementById('mswProcurementReviewPrint')?.addEventListener('click', printReview);
    document.getElementById('mswProcurementReviewExcel')?.addEventListener('click', () => exportExcel().catch(error => window.alert(error?.message || 'Export Excel gagal.')));
    return true;
  }

  if (!installActions()) {
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (installActions() || tries > 160) window.clearInterval(timer);
    }, 50);
  }

  window.MSW_PROCUREMENT_REVIEW_EXPORT_V3514 = Object.freeze({filteredRows, exportExcel, printReview});
})();

/* ===== END ORIGINAL: procurement-review-export-v3514.js ===== */


/* ===== MERGED FROM procurement-preload-bundle.js ===== */

/*
 * CONSOLIDATION TEST BUNDLE — SHADOW BRANCH ONLY
 * Original source order preserved.
 * - procurement-assign-date-order-v356.js
 * - procurement-round-state-fix-v357.js
 */

/* ===== BEGIN ORIGINAL: procurement-assign-date-order-v356.js ===== */
/* ======================================================
   PROCUREMENT ASSIGN DATE ORDER
   Release 3.5.6
   - Presentation/order adapter only; does not rewrite backend business data.
   - Primary order: Assign Date ascending (oldest -> newest).
   - Empty/invalid Assign Date goes last.
   - Tie-breaker: No PR ascending (numeric-aware).
   - Applies to Procurement cache and Admin-sheet GET responses so imports from
     multiple Buyers appear immediately in one consistent chronological order.
====================================================== */
(function installProcurementAssignDateOrder(){
  'use strict';
  if (window.__MSW_PROCUREMENT_ASSIGN_DATE_ORDER_V356__) return;
  window.__MSW_PROCUREMENT_ASSIGN_DATE_ORDER_V356__ = true;

  const CACHE_KEY = 'MSW_PROCUREMENT_CACHE';

  function firstValue(row, keys){
    for (const key of keys) {
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  }

  function parseAssignDate(value){
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 20000 && value < 80000) {
        const excel = new Date((value - 25569) * 86400 * 1000);
        return Number.isNaN(excel.getTime()) ? null : excel;
      }
      return null;
    }

    const text = String(value).trim();
    if (!text) return null;

    const numericValue = Number(text);
    if (Number.isFinite(numericValue) && numericValue > 20000 && numericValue < 80000) {
      const excel = new Date((numericValue - 25569) * 86400 * 1000);
      return Number.isNaN(excel.getTime()) ? null : excel;
    }

    const months = {
      jan:0, feb:1, mar:2, apr:3, may:4, mei:4, jun:5, jul:6,
      aug:7, agu:7, agt:7, sep:8, oct:9, okt:9, nov:10, dec:11, des:11
    };

    const named = text.match(/^(\d{1,2})[\s\-]+([A-Za-z]{3,9})[\s\-]+(\d{2,4})$/);
    if (named) {
      let year = Number(named[3]);
      if (year < 100) year += 2000;
      const month = months[named[2].slice(0,3).toLowerCase()];
      if (month !== undefined) {
        const date = new Date(year, month, Number(named[1]));
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }

    const dmy = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (dmy) {
      let year = Number(dmy[3]);
      if (year < 100) year += 2000;
      const date = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (iso) {
      const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function assignDateOf(row){
    return firstValue(row, [
      'assignprdate', 'Assign Date', 'Assign PR', 'Assign PR Date', 'AssignDate'
    ]);
  }

  function noPrOf(row){
    return String(firstValue(row, ['noPR', 'No PR', 'NoPR', 'PR No', 'PR Number']) || '').trim();
  }

  function sortRows(rows){
    if (!Array.isArray(rows) || rows.length < 2) return Array.isArray(rows) ? rows.slice() : rows;

    return rows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const leftDate = parseAssignDate(assignDateOf(left.row));
        const rightDate = parseAssignDate(assignDateOf(right.row));
        const leftTime = leftDate ? leftDate.getTime() : Number.POSITIVE_INFINITY;
        const rightTime = rightDate ? rightDate.getTime() : Number.POSITIVE_INFINITY;

        if (leftTime !== rightTime) return leftTime - rightTime;

        const prCompare = noPrOf(left.row).localeCompare(noPrOf(right.row), 'id', {
          numeric: true,
          sensitivity: 'base'
        });
        if (prCompare !== 0) return prCompare;

        return left.index - right.index;
      })
      .map(item => item.row);
  }

  window.MSW_PROCUREMENT_SORT_BY_ASSIGN_DATE = sortRows;

  try {
    const cached = window.MSW?.cache?.load?.(CACHE_KEY);
    if (Array.isArray(cached)) window.MSW.cache.save(CACHE_KEY, sortRows(cached));
  } catch (error) {
    console.warn('Procurement Assign Date cache ordering skipped:', error);
  }

  try {
    const cache = window.MSW?.cache;
    if (cache?.save && cache?.load && !cache.__MSW_ASSIGN_DATE_ORDER_V356__) {
      cache.__MSW_ASSIGN_DATE_ORDER_V356__ = true;
      const baseSave = cache.save.bind(cache);
      const baseLoad = cache.load.bind(cache);

      cache.save = function(key, data, ttl){
        const value = String(key || '') === CACHE_KEY && Array.isArray(data)
          ? sortRows(data)
          : data;
        return baseSave(key, value, ttl);
      };

      cache.load = function(key){
        const value = baseLoad(key);
        return String(key || '') === CACHE_KEY && Array.isArray(value)
          ? sortRows(value)
          : value;
      };
    }
  } catch (error) {
    console.warn('Procurement cache order adapter could not be installed:', error);
  }

  const upstreamFetch = window.fetch.bind(window);
  window.fetch = async function procurementAssignDateFetch(input, init){
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    const gas = String(window.APP_CONFIG?.GAS_URL || '').trim();

    if (!gas || method !== 'GET' || url.indexOf(gas) !== 0) {
      return upstreamFetch(input, init);
    }

    let isAdminSheet = false;
    try {
      const parsed = new URL(url, window.location.href);
      isAdminSheet = String(parsed.searchParams.get('sheet') || '').trim().toLowerCase() === 'admin';
    } catch (_) {
      isAdminSheet = /[?&]sheet=Admin(?:&|$)/i.test(url);
    }

    if (!isAdminSheet) return upstreamFetch(input, init);

    const response = await upstreamFetch(input, init);
    try {
      const raw = await response.clone().text();
      if (!raw || /^\s*</.test(raw)) return response;
      const payload = JSON.parse(raw);
      if (!Array.isArray(payload?.rows)) return response;

      const ordered = Object.assign({}, payload, { rows: sortRows(payload.rows) });
      return new Response(JSON.stringify(ordered), {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers)
      });
    } catch (error) {
      console.warn('Procurement Assign Date response ordering skipped:', error);
      return response;
    }
  };
})();

/* ===== END ORIGINAL: procurement-assign-date-order-v356.js ===== */

/* ===== BEGIN ORIGINAL: procurement-round-state-fix-v357.js ===== */
/* ======================================================
   PROCUREMENT ROUND STATE FIX — Release 3.5.7
   Corrects display/cache derivation without changing backend/source fields.

   Rules:
   - Submit Company is ONLY the selected round's R0-R5 Submit Company.
     It must never fall back to Final Submit Vendor or stale generic values.
   - Status Rebid is ALWAYS derived from the selected/active round:
       Round + submitted count / invited count + that round's Finish Date.
   - Final Submit Vendor remains independent and is never overwritten here.
====================================================== */
(function installProcurementRoundStateFix(){
  'use strict';
  if (window.__MSW_PROCUREMENT_ROUND_STATE_FIX_V357__) return;
  window.__MSW_PROCUREMENT_ROUND_STATE_FIX_V357__ = true;

  const CACHE_KEY = 'MSW_PROCUREMENT_CACHE';
  const ROUNDS = ['R0','R1','R2','R3','R4','R5'];

  function normalizeRound(value){
    const match = String(value || '').trim().toUpperCase().match(/R\s*([0-5])/);
    return match ? `R${match[1]}` : '';
  }

  function field(row, canonical, aliases = []){
    if (!row || typeof row !== 'object') return '';
    const keys = [canonical, ...aliases];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        const value = row[key];
        return value == null ? '' : value;
      }
    }
    return '';
  }

  function roundField(row, round, suffix){
    const lower = round.toLowerCase();
    const label = suffix === 'company' ? 'Company'
      : suffix === 'submitcompany' ? 'Submit Company'
      : suffix === 'startdate' ? 'Start Date'
      : suffix === 'finishdate' ? 'Finish Date'
      : suffix;
    return field(row, `${lower}${suffix}`, [
      `${round} ${label}`,
      `${round}${label.replace(/\s+/g, '')}`
    ]);
  }

  function detectLatestRound(row){
    let latest = -1;
    const declared = normalizeRound(field(row, 'roundpo', ['Round PR', 'Round PO']));
    if (declared) latest = Number(declared.slice(1));

    ROUNDS.forEach((round, index) => {
      const hasData = ['company','submitcompany','startdate','finishdate']
        .some(suffix => String(roundField(row, round, suffix) ?? '').trim() !== '');
      if (hasData) latest = Math.max(latest, index);
    });
    return latest >= 0 ? `R${latest}` : 'R0';
  }

  function splitVendors(value){
    const seen = new Set();
    return String(value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split(/\n|;/)
      .map(item => item.trim())
      .filter(item => {
        const key = item.toLocaleLowerCase('id');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function parseDate(value){
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
      const date = new Date((numeric - 25569) * 86400 * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const text = String(value).trim();
    if (!text) return null;
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,mei:4,jun:5,jul:6,aug:7,agu:7,agt:7,sep:8,oct:9,okt:9,nov:10,dec:11,des:11};
    const named = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{2,4})$/);
    if (named) {
      let year = Number(named[3]);
      if (year < 100) year += 2000;
      const month = months[named[2].slice(0,3).toLowerCase()];
      if (month !== undefined) return new Date(year, month, Number(named[1]));
    }
    const dmy = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (dmy) {
      let year = Number(dmy[3]);
      if (year < 100) year += 2000;
      return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    }
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function formatDate(value){
    const date = parseDate(value);
    return date
      ? date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
      : String(value || '').trim();
  }

  function statusForRound(row, round){
    const invited = splitVendors(roundField(row, round, 'company'));
    const submitted = splitVendors(roundField(row, round, 'submitcompany'));
    const finish = roundField(row, round, 'finishdate');
    return [
      round,
      `${submitted.length} of ${invited.length}`,
      finish ? formatDate(finish) : ''
    ].filter(Boolean).join('\n');
  }

  function sanitizeRow(row){
    if (!row || typeof row !== 'object') return row;
    const activeRound = normalizeRound(field(row, 'roundpo', ['Round PR', 'Round PO'])) || detectLatestRound(row);
    const submitted = roundField(row, activeRound, 'submitcompany');

    // Strict source: generic Submit Company mirrors only the active round field.
    // Do NOT use Final Submit Vendor as fallback.
    row.roundsubmitcompany = submitted == null ? '' : submitted;

    // Status Rebid is derived live from active round data, so stale imported
    // status text can never keep an old Finish Date.
    row.statusrebid = statusForRound(row, activeRound);
    return row;
  }

  function sanitizeRows(rows){
    if (!Array.isArray(rows)) return rows;
    rows.forEach(sanitizeRow);
    return rows;
  }

  // Runs before procurement-admin/script.js. Its saveProcurementCache() mutates
  // rows first, then this wrapper corrects the two derived display fields in-place
  // before the same array is rendered and cached.
  try {
    const cache = window.MSW?.cache;
    if (cache?.save && cache?.load && !cache.__MSW_ROUND_STATE_FIX_V357__) {
      cache.__MSW_ROUND_STATE_FIX_V357__ = true;
      const baseSave = cache.save.bind(cache);
      const baseLoad = cache.load.bind(cache);

      cache.save = function(key, data, ttl){
        if (String(key || '') === CACHE_KEY && Array.isArray(data)) sanitizeRows(data);
        return baseSave(key, data, ttl);
      };

      cache.load = function(key){
        const value = baseLoad(key);
        if (String(key || '') === CACHE_KEY && Array.isArray(value)) sanitizeRows(value);
        return value;
      };

      const existing = baseLoad(CACHE_KEY);
      if (Array.isArray(existing)) baseSave(CACHE_KEY, sanitizeRows(existing));
    }
  } catch (error) {
    console.warn('Procurement round-state cache fix could not be installed:', error);
  }

  function setCell(tr, key, value){
    const cell = tr?.querySelector(`td[data-key="${key}"]`);
    if (cell) cell.textContent = String(value ?? '');
  }

  function applyRoundView(index, selectedValue){
    const rows = (() => {
      try { return window.MSW?.cache?.load?.(CACHE_KEY) || []; }
      catch (_) { return []; }
    })();
    const row = Array.isArray(rows) ? rows[Number(index)] : null;
    const tr = document.querySelector(`#tableBody tr[data-index="${Number(index)}"]`);
    if (!row || !tr) return;

    const selected = normalizeRound(selectedValue) || 'R0';
    const company = roundField(row, selected, 'company');
    const submitted = roundField(row, selected, 'submitcompany');
    const start = roundField(row, selected, 'startdate');
    const finish = roundField(row, selected, 'finishdate');

    setCell(tr, 'roundcompany', company);
    setCell(tr, 'roundsubmitcompany', submitted);
    setCell(tr, 'roundstartdate', formatDate(start));
    setCell(tr, 'roundfinishdate', formatDate(finish));
    setCell(tr, 'statusrebid', statusForRound(row, selected));

    // Intentionally do not touch Final Submit Vendor. It is an independent field.
  }

  // Compatibility bridge installs updateRoundPR after DOMContentLoaded. Override
  // only that display function once it exists.
  function installRoundViewOverride(){
    if (window.__MSW_ROUND_VIEW_OVERRIDE_V357__) return true;
    if (typeof window.updateRoundPR !== 'function') return false;
    window.updateRoundPR = applyRoundView;
    window.updateRoundPO = applyRoundView;
    window.__MSW_ROUND_VIEW_OVERRIDE_V357__ = true;
    return true;
  }

  if (!installRoundViewOverride()) {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (installRoundViewOverride() || tries > 120) clearInterval(timer);
    }, 50);
  }
})();

/* ===== END ORIGINAL: procurement-round-state-fix-v357.js ===== */


/* ===== MERGED FROM role-access-bundle.js ===== */

/*
 * CONSOLIDATION TEST BUNDLE — SHADOW BRANCH ONLY
 * Original source order preserved.
 * - user-role-readonly.js
 * - user-approval-role.js
 */

/* ===== BEGIN ORIGINAL: user-role-readonly.js ===== */
/* ======================================================
   MSW USER ROLE — SUPER ADMIN VIEW / READ ONLY
   USER sees the same business views as SUPER_ADMIN but cannot mutate data.
   Applies to web and Android WebView APK that loads the same portal assets.
====================================================== */
(function(){
  'use strict';
  if (window.__MSW_USER_READONLY_ROLE_V1__) return;
  window.__MSW_USER_READONLY_ROLE_V1__ = true;

  const PROFILE_KEY = 'MSW_ACTIVE_PROFILE';

  function normalizeRole(value){
    return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  }

  function profileFrom(storage){
    try {
      const raw = storage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function profile(){
    try {
      const p = window.MSW?.auth?.getProfile?.();
      if (p) return p;
    } catch (_) {}
    return profileFrom(sessionStorage) || profileFrom(localStorage) || null;
  }

  function isUser(){
    return normalizeRole(profile()?.role) === 'USER';
  }

  function notify(){
    const message = 'Akun USER hanya dapat melihat data. Perubahan data tidak diizinkan.';
    try {
      if (typeof window.showToast === 'function') return window.showToast(message, 'info');
    } catch (_) {}
    try {
      const old = document.getElementById('mswUserReadonlyToast');
      if (old) old.remove();
      const el = document.createElement('div');
      el.id = 'mswUserReadonlyToast';
      el.textContent = message;
      el.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:420px;padding:12px 16px;border-radius:12px;background:#0f172a;color:#fff;font:600 13px/1.45 Arial,sans-serif;box-shadow:0 12px 32px rgba(15,23,42,.28)';
      document.body?.appendChild(el);
      setTimeout(() => el.remove(), 3500);
    } catch (_) {}
  }

  function ensureUserApprovalOption(){
    document.querySelectorAll('select.approval-role').forEach(select => {
      if (select.querySelector('option[value="USER"]')) return;
      const option = document.createElement('option');
      option.value = 'USER';
      option.textContent = 'User (View Only)';
      const vendor = select.querySelector('option[value="VENDOR"]');
      select.insertBefore(option, vendor || null);
    });
  }

  function patchAuth(){
    const auth = window.MSW?.auth;
    if (!auth || auth.__MSW_USER_READONLY_PATCHED__) return;
    auth.__MSW_USER_READONLY_PATCHED__ = true;

    const baseAccess = auth.canAccessModule?.bind(auth);
    const baseViewOnly = auth.isViewOnlyModule?.bind(auth);
    const baseManage = auth.canManageModule?.bind(auth);
    const baseMessage = auth.showViewOnlyMessage?.bind(auth);
    const baseRoleBanner = auth.addRoleBanner?.bind(auth);

    auth.canAccessModule = function(moduleName){
      if (isUser()) return true;
      return baseAccess ? baseAccess(moduleName) : false;
    };
    auth.isViewOnlyModule = function(moduleName){
      if (isUser()) return true;
      return baseViewOnly ? baseViewOnly(moduleName) : false;
    };
    auth.canManageModule = function(moduleName){
      if (isUser()) return false;
      return baseManage ? baseManage(moduleName) : true;
    };
    auth.showViewOnlyMessage = function(){
      if (isUser()) return notify();
      return baseMessage ? baseMessage() : undefined;
    };
    if (baseRoleBanner) {
      auth.addRoleBanner = function(message){
        if (isUser()) {
          const clean = String(message || '')
            .replace(/^Buyer\s*[—-]\s*/i, '')
            .replace(/^Akun Buyer\s*/i, '');
          return baseRoleBanner('User — View Only. ' + clean.replace(/^View Only\.\s*/i, ''));
        }
        return baseRoleBanner(message);
      };
    }
  }

  patchAuth();

  /* Hard frontend write firewall for USER. Read/filter/search remain untouched. */
  (function(){
    if (window.__MSW_USER_WRITE_FIREWALL_V1__) return;
    window.__MSW_USER_WRITE_FIREWALL_V1__ = true;
    const upstream = window.fetch.bind(window);
    window.fetch = function(input, init){
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      const url = typeof input === 'string' ? input : String(input?.url || '');
      const gas = String(window.APP_CONFIG?.GAS_URL || '').trim();
      if (isUser() && gas && url.indexOf(gas) === 0 && !['GET','HEAD','OPTIONS'].includes(method)) {
        let action = '';
        try { action = String(JSON.parse(String(init?.body || '{}'))?.action || '').toUpperCase(); } catch (_) {}
        if (action !== 'LOGOUT_USER') {
          notify();
          return Promise.resolve(new Response(JSON.stringify({
            success:false,
            readOnly:true,
            message:'USER adalah role view-only. Perubahan data tidak diizinkan.'
          }), {status:403,headers:{'Content-Type':'application/json'}}));
        }
      }
      return upstream(input, init);
    };
  })();

  function hideMutationControls(){
    if (!isUser()) return;
    document.body?.classList.add('msw-user-readonly');

    [
      'actionDropdown','menuBtn','addAgreementBtn','clearAgreementBtn','contextEditBtn',
      'contextDeleteBtn','contextFolderBtn','userApprovalsButton','adminToolsSection'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    const importAgreement = document.getElementById('importAgreementFile');
    if (importAgreement?.closest('label')) importAgreement.closest('label').style.display = 'none';

    document.querySelectorAll('[onclick*="handleAdd"],[onclick*="clearAll"],[onclick*="delete" i],[onclick*="edit" i]').forEach(el => {
      el.style.display = 'none';
    });
  }

  /* Agreement Tracker has custom dblclick/contextmenu CRUD; block only mutation gestures. */
  function inAgreementTracker(){
    const path = String(location.pathname || '').toLowerCase();
    return path.includes('/agreement-tracker/') && !path.includes('/agreement-tracker/form/');
  }

  document.addEventListener('dblclick', event => {
    if (!isUser() || !inAgreementTracker() || !event.target?.closest?.('#tableBody tr[data-index]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notify();
  }, true);

  document.addEventListener('contextmenu', event => {
    if (!isUser() || !inAgreementTracker() || !event.target?.closest?.('#tableBody tr[data-index]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notify();
  }, true);

  /* Root portal: USER inherits SUPER_ADMIN view rules, but mutation rights remain USER. */
  function patchRoot(){
    if (window.__MSW_USER_ROOT_PATCHED__) return;
    if (typeof window.normalizedFrontendRole !== 'function' || typeof window.applyFrontendRole !== 'function') return;
    window.__MSW_USER_ROOT_PATCHED__ = true;

    const baseNormalize = window.normalizedFrontendRole;
    window.normalizedFrontendRole = function(value){
      if (normalizeRole(value) === 'USER') return 'SUPER_ADMIN';
      return baseNormalize(value);
    };

    const basePending = typeof window.loadPendingUsers === 'function' ? window.loadPendingUsers : null;
    if (basePending) {
      window.loadPendingUsers = function(){
        if (isUser()) return Promise.resolve([]);
        return Promise.resolve(basePending.apply(this, arguments)).finally(ensureUserApprovalOption);
      };
    }

    const baseApply = window.applyFrontendRole;
    window.applyFrontendRole = function(activeProfile){
      const rawRole = normalizeRole(activeProfile?.role);
      const result = baseApply.apply(this, arguments);
      if (rawRole === 'USER') queueMicrotask(() => decorateRoot());
      return result;
    };

    // Jika login/profile sudah diproses sebelum patch root terpasang, apply ulang
    // sekali agar USER langsung mendapat seluruh visibility SUPER_ADMIN.
    const active = profile();
    if (normalizeRole(active?.role) === 'USER' && !window.__MSW_USER_VIEW_REAPPLIED__) {
      window.__MSW_USER_VIEW_REAPPLIED__ = true;
      queueMicrotask(() => {
        try { window.applyFrontendRole(active); } catch (_) {}
        decorateRoot();
      });
    }
  }

  function decorateRoot(){
    if (!isUser()) return;
    const accountRole = document.getElementById('accountRole');
    if (accountRole) accountRole.textContent = 'USER · VIEW ONLY';
    const profileRole = document.getElementById('profileModalRole');
    if (profileRole) profileRole.textContent = 'USER · VIEW ONLY';
    const badge = document.querySelector('#roleDashboardBadge span');
    if (badge) badge.textContent = 'User Workspace · View Only';
    document.querySelectorAll('.role-access-label').forEach(el => { el.textContent = 'View Only'; });
    const adminTools = document.getElementById('adminToolsSection');
    if (adminTools) adminTools.style.display = 'none';
    const approvals = document.getElementById('userApprovalsButton');
    if (approvals) approvals.style.display = 'none';
    hideMutationControls();
  }

  document.addEventListener('DOMContentLoaded', () => {
    patchAuth();
    patchRoot();
    ensureUserApprovalOption();
    decorateRoot();
    hideMutationControls();
  }, {capture:true});

  // Fallback bila common.js / script.js selesai dimuat setelah guard.
  window.addEventListener('load', () => {
    patchAuth();
    patchRoot();
    decorateRoot();
    hideMutationControls();
  }, {once:true});

  const observer = new MutationObserver(() => {
    patchAuth();
    patchRoot();
    ensureUserApprovalOption();
    if (isUser()) hideMutationControls();
  });
  try { observer.observe(document.documentElement,{childList:true,subtree:true}); } catch (_) {}
})();

/* ===== END ORIGINAL: user-role-readonly.js ===== */

/* ===== BEGIN ORIGINAL: user-approval-role.js ===== */
/* ======================================================
   USER APPROVAL ROLE
   Ensures Super Admin can assign USER (View Only) from User Approvals.
   Existing reviewPendingUser() already submits the selected role value,
   so selecting this option sends role: "USER" to the backend.
====================================================== */
(function(){
  'use strict';
  if (window.__MSW_USER_APPROVAL_ROLE_V1__) return;
  window.__MSW_USER_APPROVAL_ROLE_V1__ = true;

  function ensureUserRoleOption(root = document){
    root.querySelectorAll?.('select.approval-role').forEach(select => {
      if (select.querySelector('option[value="USER"]')) return;

      const option = document.createElement('option');
      option.value = 'USER';
      option.textContent = 'User (View Only)';
      option.title = 'View seluruh data seperti Super Admin tanpa hak Add/Edit/Delete/Approval.';

      const vendorOption = select.querySelector('option[value="VENDOR"]');
      select.insertBefore(option, vendorOption || null);
    });
  }

  function patchPendingUserRenderer(){
    if (window.__MSW_USER_APPROVAL_RENDER_PATCHED__) return;
    if (typeof window.renderPendingUsers !== 'function') return;

    window.__MSW_USER_APPROVAL_RENDER_PATCHED__ = true;
    const baseRenderPendingUsers = window.renderPendingUsers;

    window.renderPendingUsers = function(users){
      const result = baseRenderPendingUsers.apply(this, arguments);
      ensureUserRoleOption();
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    patchPendingUserRenderer();
    ensureUserRoleOption();
  }, { capture: true });

  const observer = new MutationObserver(mutations => {
    let needsCheck = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes?.length) {
        needsCheck = true;
        break;
      }
    }
    if (!needsCheck) return;
    patchPendingUserRenderer();
    ensureUserRoleOption();
  });

  try {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
})();

/* ===== END ORIGINAL: user-approval-role.js ===== */


/* ===== MERGED FROM procurement-export-role-scope-v3517.js ===== */

/* ======================================================
   PROCUREMENT EXPORT ROLE SCOPE — Release 3.5.17

   Shared rule for Procurement exports / print:
   - BUYER: only rows owned by the logged-in Buyer.
   - SUPER_ADMIN: all Buyer rows.
   - Year remains a reporting period filter.
   - Buyer selector / column filters do not silently reduce or widen export scope.
====================================================== */
(function installProcurementExportRoleScopeV3517(){
  'use strict';
  if (window.__MSW_PROCUREMENT_EXPORT_ROLE_SCOPE_V3517__) return;
  window.__MSW_PROCUREMENT_EXPORT_ROLE_SCOPE_V3517__ = true;

  const CACHE_KEY = 'MSW_PROCUREMENT_CACHE';
  const REVIEW_HEADERS = [
    'No PR','Procurement','Buyer','Requestor','Status','Flow Process',
    'Finish Date','Requirement Date','Status Rebid','Note'
  ];

  function text(value){ return String(value == null ? '' : value).trim(); }
  function normalizeRole(value){ return text(value).toUpperCase().replace(/[\s-]+/g, '_'); }
  function normalizeName(value){ return text(value).toLocaleLowerCase('id').replace(/\s+/g, ' '); }
  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[ch]);
  }
  function profile(){
    try { return window.MSW?.auth?.getProfile?.() || window.ACTIVE_PROFILE || null; }
    catch (_) { return window.ACTIVE_PROFILE || null; }
  }
  function role(){
    try { return normalizeRole(window.MSW?.auth?.getRole?.() || profile()?.role || ''); }
    catch (_) { return normalizeRole(profile()?.role || ''); }
  }
  function valueOf(row, aliases){
    if (!row || typeof row !== 'object') return '';
    try {
      if (typeof window.smartGetField === 'function') {
        const value = window.smartGetField(row, aliases);
        if (value !== undefined && value !== null && text(value) !== '') return value;
      }
    } catch (_) {}
    for (const key of aliases) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
      const value = row[key];
      if (value !== undefined && value !== null && text(value) !== '') return value;
    }
    return '';
  }
  function ownerEmail(row){
    return text(valueOf(row, ['ownerEmail','Owner Email','buyerEmail','Buyer Email'])).toLowerCase();
  }
  function ownerName(row){
    return normalizeName(valueOf(row, [
      'ownerName','Owner Name','Buyer (Ditambahkan)','buyer','Buyer','Buyer Name','Signature Buyer'
    ]));
  }
  function activeIdentity(){
    const p = profile() || {};
    return {
      role: role(),
      email: text(p.email || p.userEmail || '').toLowerCase(),
      name: normalizeName(p.name || p.fullName || p.displayName || '')
    };
  }
  function belongsToBuyer(row, identity){
    const rowEmail = ownerEmail(row);
    if (rowEmail) return Boolean(identity.email && rowEmail === identity.email);
    const rowName = ownerName(row);
    return Boolean(rowName && identity.name && rowName === identity.name);
  }
  function scopeRows(rows){
    const source = Array.isArray(rows) ? rows : [];
    const identity = activeIdentity();
    if (identity.role === 'SUPER_ADMIN') return source.slice();
    if (identity.role !== 'BUYER') return source.slice();
    if (!identity.email && !identity.name) return [];
    return source.filter(row => belongsToBuyer(row, identity));
  }
  function scopeLabel(){
    const identity = activeIdentity();
    if (identity.role === 'SUPER_ADMIN') return 'ALL BUYERS';
    if (identity.role === 'BUYER') return text(profile()?.name || profile()?.email || 'BUYER');
    return identity.role || 'CURRENT ROLE';
  }
  function selectedYear(){
    try { return text(window.PROCUREMENT_OVERVIEW_YEAR || PROCUREMENT_OVERVIEW_YEAR || 'ALL') || 'ALL'; }
    catch (_) { return 'ALL'; }
  }
  function procurementYear(row){
    try {
      if (typeof window.overviewProcurementYear === 'function') return text(window.overviewProcurementYear(row));
      if (typeof overviewProcurementYear === 'function') return text(overviewProcurementYear(row));
    } catch (_) {}
    return '';
  }
  function reviewSourceRows(){
    let source = [];
    try { if (Array.isArray(PROCUREMENT_OVERVIEW_SOURCE_ROWS)) source = PROCUREMENT_OVERVIEW_SOURCE_ROWS.slice(); } catch (_) {}
    if (!source.length) {
      try { if (Array.isArray(PROCUREMENT_REVIEW_ROWS)) source = PROCUREMENT_REVIEW_ROWS.slice(); } catch (_) {}
    }
    const year = selectedYear();
    source = scopeRows(source);
    if (year !== 'ALL') source = source.filter(row => procurementYear(row) === year);
    try {
      if (typeof overviewIsHiddenStatus === 'function') source = source.filter(row => !overviewIsHiddenStatus(row));
    } catch (_) {}
    try {
      if (typeof overviewFlowPriority === 'function') {
        source = source.map((row,index) => ({row,index}))
          .sort((a,b) => overviewFlowPriority(a.row) - overviewFlowPriority(b.row) || a.index - b.index)
          .map(item => item.row);
      }
    } catch (_) {}
    return source;
  }
  function reviewValues(){
    const rows = reviewSourceRows();
    if (typeof overviewReviewValues !== 'function') return [];
    return rows.map(row => overviewReviewValues(row).map(value => text(value)));
  }
  function safeFilePart(value){
    return text(value).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'ALL';
  }
  async function exportReviewExcel(){
    const values = reviewValues();
    if (!values.length) {
      window.alert('Tidak ada data Procurement Review untuk scope role dan tahun yang dipilih.');
      return;
    }
    if (typeof window.MSW_ENSURE_XLSX === 'function') await window.MSW_ENSURE_XLSX();
    if (!window.XLSX) throw new Error('Library Excel belum tersedia.');
    const ws = window.XLSX.utils.aoa_to_sheet([REVIEW_HEADERS, ...values]);
    ws['!cols'] = [
      {wch:24},{wch:48},{wch:28},{wch:24},{wch:12},{wch:22},
      {wch:16},{wch:18},{wch:30},{wch:55}
    ];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Procurement Review');
    const date = new Date().toISOString().slice(0,10);
    const fileScope = role() === 'BUYER' ? safeFilePart(scopeLabel()) : 'ALL_BUYERS';
    window.XLSX.writeFile(wb, `Procurement_Review_${fileScope}_${safeFilePart(selectedYear())}_${date}.xlsx`);
  }
  function printReview(){
    const values = reviewValues();
    if (!values.length) {
      window.alert('Tidak ada data Procurement Review untuk scope role dan tahun yang dipilih.');
      return;
    }
    const body = values.map(row => `<tr>${row.map(value => `<td>${esc(value || '-')}</td>`).join('')}</tr>`).join('');
    const header = REVIEW_HEADERS.map(value => `<th>${esc(value)}</th>`).join('');
    const generated = new Date().toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const popup = window.open('', '_blank');
    if (!popup) {
      window.alert('Popup print diblokir browser. Izinkan popup untuk portal ini lalu coba lagi.');
      return;
    }
    try { popup.opener = null; } catch (_) {}
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Procurement Review</title><style>
      @page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;margin:0;font-size:8.5px}
      h1{font-size:16px;margin:0 0 3px}.meta{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;color:#475569;font-size:9px}
      table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #cbd5e1;padding:4px 5px;vertical-align:top;white-space:pre-wrap;word-break:break-word}
      th{background:#163f6d;color:#fff;font-weight:700;text-align:left}tbody tr:nth-child(even){background:#f8fafc}.footer{margin-top:6px;color:#64748b;font-size:8px}
    </style></head><body>
      <h1>Procurement Review</h1>
      <div class="meta"><span><b>Scope:</b> ${esc(scopeLabel())}</span><span><b>Year:</b> ${esc(selectedYear())}</span><span><b>Rows:</b> ${values.length}</span><span><b>Generated:</b> ${esc(generated)}</span></div>
      <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
      <div class="footer">PT Makmur Sejahtera Wisesa — Procurement Division</div>
      <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},100);});<\/script>
    </body></html>`);
    popup.document.close();
  }

  function installReviewInterceptors(){
    if (document.body?.dataset?.mswPage !== 'main-menu') return;
    document.addEventListener('click', function(event){
      const excel = event.target.closest?.('#mswProcurementReviewExcel');
      const print = event.target.closest?.('#mswProcurementReviewPrint');
      if (!excel && !print) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (excel) exportReviewExcel().catch(error => window.alert(error?.message || 'Export Excel gagal.'));
      else printReview();
    }, true);
  }

  function installAdminExportWrapper(){
    if (!/\/procurement-admin\/?(?:index\.html)?$/i.test(window.location.pathname)) return;
    let tries = 0;
    const timer = window.setInterval(function(){
      tries += 1;
      if (typeof window.exportExcel !== 'function') {
        if (tries > 200) window.clearInterval(timer);
        return;
      }
      if (window.exportExcel.__MSW_ROLE_SCOPE_V3517__) {
        window.clearInterval(timer);
        return;
      }
      const previous = window.exportExcel;
      const wrapped = function(){
        const cache = window.MSW?.cache;
        if (!cache?.load) return previous.apply(this, arguments);
        const originalLoad = cache.load;
        const rawRows = originalLoad.call(cache, CACHE_KEY);
        const scoped = scopeRows(Array.isArray(rawRows) ? rawRows : []);
        if (role() === 'BUYER' && !scoped.length && Array.isArray(rawRows) && rawRows.length) {
          window.alert('Tidak ada data Procurement milik Buyer login yang dapat diekspor.');
          return;
        }
        cache.load = function(key){
          if (String(key || '') === CACHE_KEY) return scoped.slice();
          return originalLoad.apply(this, arguments);
        };
        try { return previous.apply(this, arguments); }
        finally { cache.load = originalLoad; }
      };
      wrapped.__MSW_ROLE_SCOPE_V3517__ = true;
      window.exportExcel = wrapped;
      window.clearInterval(timer);
    }, 50);
  }

  installReviewInterceptors();
  installAdminExportWrapper();

  window.MSW_PROCUREMENT_EXPORT_SCOPE = Object.freeze({
    role, profile, scopeRows, scopeLabel, belongsToBuyer, reviewSourceRows, exportReviewExcel, printReview
  });
})();


/* ===== MERGED FROM unrestricted-local-upload-v3512.js ===== */

/* ======================================================
   UNRESTRICTED LOCAL FILE PICKER — Release 3.5.12

   Applies only to Procurement attachment pickers.
   The local file writer already stores File/Blob data without extension checks.
   This adapter removes UI-level accept filters so email files (.msg/.eml),
   archives, documents, images and other file types can be selected.
====================================================== */
(function installUnrestrictedLocalUpload(){
  'use strict';
  if (window.__MSW_UNRESTRICTED_LOCAL_UPLOAD_V3512__) return;
  window.__MSW_UNRESTRICTED_LOCAL_UPLOAD_V3512__ = true;

  const path = String(window.location.pathname || '');
  const isForm = /\/procurement-admin\/Form\//i.test(path);
  const isParent = /\/procurement-admin\/?(?:index\.html)?$/i.test(path);
  if (!isForm && !isParent) return;

  const FILE_INPUT_IDS = ['folderFileInput', 'extendedRebidFile'];

  function relaxInput(input, View = window){
    if (!(input instanceof View.HTMLInputElement) || input.type !== 'file') return;
    input.removeAttribute('accept');
    input.accept = '';
    input.dataset.mswAnyFile = 'true';
    input.title = 'Semua jenis file dapat dipilih';
  }

  function relaxDocument(doc, View = window){
    if (!doc) return;
    FILE_INPUT_IDS.forEach(id => relaxInput(doc.getElementById(id), View));
  }

  function installInside(doc, View = window){
    relaxDocument(doc, View);

    doc.addEventListener('click', event => {
      const trigger = event.target?.closest?.('#uploadFilesBtn, #extendedRebidFile, label[for="extendedRebidFile"]');
      if (!trigger) return;
      relaxDocument(doc, View);
    }, true);

    if (doc.body && View.MutationObserver) {
      new View.MutationObserver(() => relaxDocument(doc, View))
        .observe(doc.body, { childList: true, subtree: true });
    }
  }

  function installParentBridge(){
    const bind = function(){
      const frame = document.getElementById('formFrame');
      if (!frame || frame.dataset.mswAnyFileBridge === 'true') return;
      frame.dataset.mswAnyFileBridge = 'true';
      frame.addEventListener('load', () => {
        try {
          const childWindow = frame.contentWindow;
          const childDocument = frame.contentDocument;
          if (childWindow && childDocument) installInside(childDocument, childWindow);
        } catch (error) {
          console.warn('Any-file picker bridge tidak dapat mengakses Procurement Form.', error);
        }
      });
    };

    bind();
    if (document.body) new MutationObserver(bind).observe(document.body, { childList: true, subtree: true });
  }

  function install(){
    if (isForm) installInside(document, window);
    if (isParent) installParentBridge();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();


/* ===== MERGED FROM android-folder-fs.js ===== */

(function () {
  'use strict';

  const native = window.AndroidFolder;
  if (!native) return;

  const DB_NAME = 'MSW_PROCUREMENT_LOCAL_FS';
  const PR_ROOT_KEY = 'prRoot';
  const TC_ROOT_KEY = 'tcRoot';

  const parseJson = (value, fallback) => {
    try { return JSON.parse(String(value || '')); }
    catch (_) { return fallback; }
  };

  const cleanPart = value => String(value == null ? '' : value).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  const joinPath = (...parts) => parts.map(cleanPart).filter(Boolean).join('/');

  function folderInfo(kind) {
    return parseJson(native.getFolderInfo(kind), { connected: false, name: '' });
  }

  function dataUrlToFile(dataUrl, name, type) {
    const raw = String(dataUrl || '');
    const comma = raw.indexOf(',');
    if (!raw.startsWith('data:') || comma < 0) throw new Error(`File ${name} tidak dapat dibaca dari Android.`);
    const header = raw.slice(5, comma);
    const mime = type || header.split(';')[0] || 'application/octet-stream';
    const payload = raw.slice(comma + 1);
    let bytes;
    if (/;base64/i.test(header)) {
      const binary = atob(payload);
      bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    }
    return new File([bytes], name, { type: mime });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('File tidak dapat diproses.'));
      reader.readAsDataURL(blob);
    });
  }

  class AndroidFileHandle {
    constructor(kind, relativePath, name, meta = {}) {
      this.kind = 'file';
      this.name = name;
      this._kind = kind;
      this._path = relativePath;
      this._meta = meta;
    }

    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }

    async getFile() {
      const dataUrl = native.readFileDataUrl(this._kind, this._path);
      return dataUrlToFile(dataUrl, this.name, this._meta.mimeType || '');
    }

    async createWritable() {
      let pending = null;
      const handle = this;
      return {
        async write(value) {
          if (value && typeof value === 'object' && value.type === 'write' && 'data' in value) value = value.data;
          if (value instanceof Blob) pending = value;
          else if (value instanceof ArrayBuffer) pending = new Blob([value]);
          else if (ArrayBuffer.isView(value)) pending = new Blob([value.buffer]);
          else pending = new Blob([value == null ? '' : value]);
        },
        async close() {
          const blob = pending || new Blob([]);
          const dataUrl = await blobToDataUrl(blob);
          const slash = handle._path.lastIndexOf('/');
          const directory = slash >= 0 ? handle._path.slice(0, slash) : '';
          const result = parseJson(native.writeFileDataUrl(handle._kind, directory, handle.name, dataUrl), { success: false });
          if (!result.success) throw new Error(result.error || `Gagal menyimpan ${handle.name} ke folder Android.`);
        },
        async abort() { pending = null; }
      };
    }
  }

  class AndroidDirectoryHandle {
    constructor(kind, relativePath, name) {
      this.kind = 'directory';
      this.name = name;
      this._kind = kind;
      this._path = cleanPart(relativePath);
    }

    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }

    _entriesArray() {
      return parseJson(native.listEntries(this._kind, this._path), []);
    }

    async getDirectoryHandle(name, options = {}) {
      const childName = String(name || '').trim();
      if (!childName) throw new DOMException('Nama folder kosong.', 'TypeMismatchError');
      const childPath = joinPath(this._path, childName);
      const existing = this._entriesArray().find(item => item.kind === 'directory' && String(item.name).toUpperCase() === childName.toUpperCase());
      if (!existing && !options.create) throw new DOMException(`Folder ${childName} tidak ditemukan.`, 'NotFoundError');
      if (!existing && options.create && !native.ensureDirectory(this._kind, childPath)) throw new Error(`Folder ${childName} tidak dapat dibuat.`);
      return new AndroidDirectoryHandle(this._kind, childPath, existing?.name || childName);
    }

    async getFileHandle(name, options = {}) {
      const childName = String(name || '').trim();
      if (!childName) throw new DOMException('Nama file kosong.', 'TypeMismatchError');
      const existing = this._entriesArray().find(item => item.kind === 'file' && String(item.name).toUpperCase() === childName.toUpperCase());
      if (!existing && !options.create) throw new DOMException(`File ${childName} tidak ditemukan.`, 'NotFoundError');
      return new AndroidFileHandle(this._kind, joinPath(this._path, existing?.name || childName), existing?.name || childName, existing || {});
    }

    async *entries() {
      for (const item of this._entriesArray()) {
        const name = String(item.name || '');
        if (!name) continue;
        if (item.kind === 'directory') yield [name, new AndroidDirectoryHandle(this._kind, joinPath(this._path, name), name)];
        else yield [name, new AndroidFileHandle(this._kind, joinPath(this._path, name), name, item)];
      }
    }

    [Symbol.asyncIterator]() { return this.entries(); }
  }

  function getRoot(kind) {
    const normalized = kind === 'tc' ? 'tc' : 'pr';
    const info = folderInfo(normalized);
    if (!info.connected || !info.name) return null;
    return new AndroidDirectoryHandle(normalized, '', info.name);
  }

  function chooseRoot(kind) {
    return new Promise((resolve, reject) => {
      const normalized = kind === 'tc' ? 'tc' : 'pr';
      const timeout = window.setTimeout(() => {
        window.removeEventListener('msw-android-folder-selected', listener);
        reject(new Error('Pemilihan folder Android tidak selesai.'));
      }, 120000);
      const listener = event => {
        if (event?.detail?.kind !== normalized) return;
        window.clearTimeout(timeout);
        window.removeEventListener('msw-android-folder-selected', listener);
        if (!event.detail.success) return reject(new Error(event.detail.error || 'Pemilihan folder dibatalkan.'));
        const root = getRoot(normalized);
        if (!root) return reject(new Error('Folder Android tidak dapat dibuka.'));
        resolve(root);
      };
      window.addEventListener('msw-android-folder-selected', listener);
      native.chooseFolder(normalized);
    });
  }

  function inferPickerKind() {
    const active = document.activeElement;
    const clue = `${active?.id || ''} ${active?.textContent || ''} ${active?.getAttribute?.('aria-label') || ''}`;
    return /(?:^|\W)tc(?:\W|$)|original\s*tc|master\s*tc/i.test(clue) ? 'tc' : 'pr';
  }

  // Android WebView tidak menyediakan File System Access API. Polyfill ini membuat
  // modul portal lama tetap dapat memakai showDirectoryPicker() tanpa rewrite besar.
  window.showDirectoryPicker = async function () {
    return chooseRoot(inferPickerKind());
  };

  // Semua modul procurement menyimpan FileSystemDirectoryHandle pada DB ini.
  // Handle SAF Android tidak structured-cloneable, jadi khusus DB handle tersebut
  // IndexedDB dibuat sebagai facade yang mengambil root langsung dari native prefs.
  const realIndexedDbOpen = window.indexedDB?.open?.bind(window.indexedDB);
  if (realIndexedDbOpen) {
    window.indexedDB.open = function (name, version) {
      if (String(name) !== DB_NAME) return realIndexedDbOpen(name, version);

      const fakeDb = {
        objectStoreNames: { contains: () => true },
        close() {},
        transaction() {
          let completeHandler = null;
          const tx = {
            error: null,
            objectStore() {
              return {
                get(key) {
                  const request = { result: key === TC_ROOT_KEY ? getRoot('tc') : (key === PR_ROOT_KEY ? getRoot('pr') : null), error: null };
                  Object.defineProperty(request, 'onsuccess', { set(fn) { if (typeof fn === 'function') queueMicrotask(() => fn({ target: request })); } });
                  Object.defineProperty(request, 'onerror', { set() {} });
                  return request;
                },
                put(value, key) {
                  // Native chooseRoot() sudah menyimpan URI secara persisten.
                  // Put dipertahankan sebagai no-op agar kontrak kode lama tetap sama.
                  queueMicrotask(() => { if (completeHandler) completeHandler({ target: tx }); });
                  return { result: key, error: null };
                }
              };
            }
          };
          Object.defineProperty(tx, 'oncomplete', { set(fn) { completeHandler = fn; queueMicrotask(() => { if (completeHandler) completeHandler({ target: tx }); }); } });
          Object.defineProperty(tx, 'onerror', { set() {} });
          Object.defineProperty(tx, 'onabort', { set() {} });
          return tx;
        }
      };

      const request = { result: fakeDb, error: null };
      Object.defineProperty(request, 'onupgradeneeded', { set() {} });
      Object.defineProperty(request, 'onsuccess', { set(fn) { if (typeof fn === 'function') queueMicrotask(() => fn({ target: request })); } });
      Object.defineProperty(request, 'onerror', { set() {} });
      return request;
    };
  }

  window.MSW_ANDROID_FOLDER_FS = Object.freeze({
    isAvailable: () => Boolean(window.AndroidFolder),
    getRoot,
    chooseRoot,
    folderInfo,
    DirectoryHandle: AndroidDirectoryHandle,
    FileHandle: AndroidFileHandle
  });
})();