/* MSW E-Procurement performance layer v1.0
   - User-scoped stale-while-revalidate cache for authenticated GAS GET requests.
   - Lazy local XLSX loading on first Excel import/export interaction.
   - Never shares cached business responses between different user/role profiles. */
(function(){
  'use strict';
  if (window.__MSW_PERFORMANCE_CACHE_V1__) return;
  window.__MSW_PERFORMANCE_CACHE_V1__ = true;

  const currentScript = document.currentScript;
  let assetBase = '';
  try { assetBase = currentScript?.src ? new URL('./assets/', currentScript.src).href : 'assets/'; }
  catch (_) { assetBase = 'assets/'; }

  /* USER role guard must load before the page/module script that follows this file.
     The portal includes performance-cache.js immediately before each business script,
     so parser-time loading keeps Web and Android WebView behavior identical. */
  try {
    if (!window.__MSW_USER_READONLY_ROLE_V1__ && currentScript?.src && document.readyState === 'loading') {
      const guardUrl = new URL('./user-role-readonly.js?v=20260815-user-readonly-v1', currentScript.src).href;
      document.write('<script src="' + guardUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"><\/script>');
    }
  } catch (error) {
    console.warn('USER read-only guard gagal dimuat.', error);
  }

  /* Super Admin User Approval helper. This is loaded for all portal roles,
     but it only affects the existing approval-role select when that modal exists. */
  try {
    if (!window.__MSW_USER_APPROVAL_ROLE_V1__ && currentScript?.src && document.readyState === 'loading') {
      const approvalUrl = new URL('./user-approval-role.js?v=20260815-user-approval-v1', currentScript.src).href;
      document.write('<script src="' + approvalUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"><\/script>');
    }
  } catch (error) {
    console.warn('USER approval role helper gagal dimuat.', error);
  }

  const CACHE_PREFIX = 'MSW_NET_CACHE_V1_';
  const MAX_STALE_MS = 24 * 60 * 60 * 1000;
  const nativeFetch = window.fetch.bind(window);
  let xlsxPromise = null;

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

  window.fetch = async function(input, init){
    const url = typeof input === 'string' ? input : String(input?.url || '');
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
