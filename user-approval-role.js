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
