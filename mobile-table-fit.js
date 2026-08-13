/* EprocMSW Mobile Table Fit v1.3.0
   Shared Web + Android responsive layer.
   - Enables explicit user pinch zoom.
   - Adds Fit / 100% / - / + controls to wide tables.
   - Injects responsive-device.css and table-fit assets into same-origin iframes.
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
  const SELF_CSS_URL = baseUrl ? baseUrl + 'mobile-table-fit.css?v=20260813-universal-v130' : '';
  const RESPONSIVE_CSS_URL = baseUrl ? baseUrl + 'responsive-device.css?v=20260813-v130' : '';

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
