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
