/* ======================================================
   VENDOR COLUMN FILTER SCROLL FIX — Release 3.5.10

   Root cause:
   vendor-company/script.js closes an open Excel-style filter on any captured
   `scroll` event. A scroll originating from the filter value list is captured
   by document too, so the popup is closed/interrupted before the user can
   browse values further down the list.

   This compatibility adapter must load BEFORE vendor-company/script.js.
   It consumes only scroll events that originate inside the filter popup.
   Scrolls from the table/page keep their existing close-menu behavior.
====================================================== */
(function installVendorFilterScrollFix(){
  'use strict';
  if (window.__MSW_VENDOR_FILTER_SCROLL_FIX_V3510__) return;
  window.__MSW_VENDOR_FILTER_SCROLL_FIX_V3510__ = true;

  function isInsideFilterMenu(target){
    return target instanceof Element && Boolean(target.closest('.excel-column-filter-menu'));
  }

  // Registered before the core Vendor script. stopImmediatePropagation prevents
  // its later document-level `scroll -> closeColumnFilterMenu` handler from
  // treating an internal value-list scroll as a page/table scroll.
  document.addEventListener('scroll', function(event){
    if (!isInsideFilterMenu(event.target)) return;
    event.stopImmediatePropagation();
  }, true);

  // Keep mouse-wheel scrolling inside the values while the list still has room
  // to move, instead of also moving the underlying vendor table.
  document.addEventListener('wheel', function(event){
    const list = event.target instanceof Element
      ? event.target.closest('.excel-filter-values')
      : null;
    if (!list || list.scrollHeight <= list.clientHeight + 1) return;

    const goingDown = event.deltaY > 0;
    const goingUp = event.deltaY < 0;
    const atTop = list.scrollTop <= 0;
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;

    if ((goingDown && !atBottom) || (goingUp && !atTop)) {
      event.stopPropagation();
    }
  }, { capture: true, passive: true });

  // Cross-device hardening for desktop mouse, touch screen and Android WebView.
  const style = document.createElement('style');
  style.id = 'msw-vendor-filter-scroll-v3510';
  style.textContent = `
    .excel-column-filter-menu {
      pointer-events: auto !important;
    }
    .excel-filter-values {
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
      scrollbar-gutter: stable;
      pointer-events: auto !important;
    }
  `;
  document.head.appendChild(style);
})();
