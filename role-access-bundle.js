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
