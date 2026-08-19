/* ======================================================
   PROCUREMENT EXPORT ROLE SCOPE — Release 3.5.17

   Shared rule for Procurement exports / print:
   - BUYER: only rows owned by the logged-in Buyer.
   - SUPER_ADMIN: all Buyer rows.
   - UI column filters never widen or silently reduce the role scope.
====================================================== */
(function installProcurementExportRoleScopeV3517(){
  'use strict';
  if (window.__MSW_PROCUREMENT_EXPORT_ROLE_SCOPE_V3517__) return;
  window.__MSW_PROCUREMENT_EXPORT_ROLE_SCOPE_V3517__ = true;

  function text(value){ return String(value == null ? '' : value).trim(); }
  function normalizeRole(value){ return text(value).toUpperCase().replace(/[\s-]+/g, '_'); }
  function normalizeName(value){ return text(value).toLocaleLowerCase('id').replace(/\s+/g, ' '); }
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

  window.MSW_PROCUREMENT_EXPORT_SCOPE = Object.freeze({ role, profile, scopeRows, scopeLabel, belongsToBuyer });
})();
