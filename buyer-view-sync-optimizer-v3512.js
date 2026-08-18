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
