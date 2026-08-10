(function () {
  "use strict";

  const MODULES = {
    "vendor-company": { table: ".company-table", container: "#tableContainer", frozen: 6, minimum: 64 },
    "detail-contract": { table: ".contract-table", container: "#tableContainer, .scroll-container", frozen: 7, minimum: 60 },
    "procurement-admin": { table: "#tableContainer table", container: "#tableContainer, .table-container", frozen: 7, minimum: 64 }
  };

  const moduleName = Object.keys(MODULES).find((name) => location.pathname.includes(name));
  if (!moduleName) return;
  const settings = MODULES[moduleName];
  let rafId = 0;
  let tableObserver;

  function isBuyerView() {
    return document.body.classList.contains("msw-buyer-centered-module");
  }

  function distribute(total, weights, minimum) {
    const count = weights.length;
    if (!count || total < count * minimum) return null;
    const weightTotal = weights.reduce((sum, value) => sum + value, 0) || count;
    const widths = weights.map((value) => Math.max(minimum, Math.floor(total * value / weightTotal)));
    let difference = total - widths.reduce((sum, value) => sum + value, 0);
    for (let index = count - 1; difference !== 0 && index >= 0; index = (index - 1 + count) % count) {
      if (difference > 0) {
        widths[index] += 1;
        difference -= 1;
      } else if (widths[index] > minimum) {
        widths[index] -= 1;
        difference += 1;
      }
    }
    return widths;
  }

  function clearFit(table) {
    table.style.removeProperty("width");
    table.style.removeProperty("min-width");
    table.style.removeProperty("max-width");
    table.querySelectorAll("th,td").forEach((cell) => {
      ["width", "min-width", "max-width", "left"].forEach((name) => cell.style.removeProperty(name));
    });
  }

  function applyFit() {
    rafId = 0;
    const table = document.querySelector(settings.table);
    const container = document.querySelector(settings.container);
    if (!table || !container || !isBuyerView()) return;
    const headers = Array.from(table.querySelectorAll("thead th"));
    if (!headers.length) return;

    clearFit(table);
    const available = Math.floor(container.clientWidth);
    const weights = headers.map((cell) => Math.max(settings.minimum, Math.round(cell.getBoundingClientRect().width)));
    const widths = distribute(available, weights, settings.minimum);

    /* On narrow screens, keep the stable original widths and horizontal scroll. */
    if (!widths) return;

    table.style.setProperty("width", available + "px", "important");
    table.style.setProperty("min-width", available + "px", "important");
    table.style.setProperty("max-width", available + "px", "important");

    let frozenLeft = 0;
    widths.forEach((width, columnIndex) => {
      table.querySelectorAll(`tr > :nth-child(${columnIndex + 1})`).forEach((cell) => {
        cell.style.setProperty("width", width + "px", "important");
        cell.style.setProperty("min-width", width + "px", "important");
        cell.style.setProperty("max-width", width + "px", "important");
        if (columnIndex < settings.frozen) cell.style.setProperty("left", frozenLeft + "px", "important");
      });
      if (columnIndex < settings.frozen) frozenLeft += width;
    });
  }

  function scheduleFit() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(applyFit);
  }

  function connectTableObserver() {
    const table = document.querySelector(settings.table);
    if (!table || tableObserver) return;
    tableObserver = new MutationObserver(scheduleFit);
    tableObserver.observe(table, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    connectTableObserver();
    scheduleFit();
    new MutationObserver(() => {
      connectTableObserver();
      scheduleFit();
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", scheduleFit, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(scheduleFit).observe(document.documentElement);
  });
})();
