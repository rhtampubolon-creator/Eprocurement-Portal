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
