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
      const token = readActiveToken();
      if (gasUrl && token && targetUrl.indexOf(gasUrl) === 0) {
        const options = Object.assign({}, init || {});
        const method = String(options.method || "GET").toUpperCase();
        if (method === "GET") {
          // Jangan menambahkan authToken kedua apabila caller sudah mengirimkannya.
          if (!/[?&]authToken=/.test(targetUrl)) {
            const separator = targetUrl.indexOf("?") >= 0 ? "&" : "?";
            targetUrl += separator + "authToken=" + encodeURIComponent(token);
          }
          input = targetUrl;
        } else if (typeof options.body === "string") {
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

const MSW = window.MSW || {};
window.MSW = MSW;

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
