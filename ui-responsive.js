(function () {
  const toggle = document.getElementById('mobileSidebarToggle');
  const backdrop = document.getElementById('mobileSidebarBackdrop');
  const sidebar = document.getElementById('leftSidebar');
  const mainLayout = document.getElementById('mainLayout');
  if (!toggle || !backdrop || !sidebar) return;

  const isAndroidApp = /EprocMSW\//i.test(navigator.userAgent) || /Android/i.test(navigator.userAgent);
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0 ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  if (isAndroidApp) document.body.classList.add('android-app-webview');
  if (isTouchDevice) document.body.classList.add('touch-device');

  function useDrawerMode() { return isAndroidApp || isTouchDevice || window.innerWidth <= 860; }
  function isLandscape() {
    return !!(window.matchMedia && window.matchMedia('(orientation: landscape)').matches);
  }
  function clearDesktopHiddenState() {
    sidebar.classList.remove('overlay', 'sidebar-hidden');
    if (mainLayout) mainLayout.classList.remove('sidebar-collapsed');
    const desktopTrigger = document.getElementById('sidebarTrigger');
    if (desktopTrigger) desktopTrigger.classList.add('hidden');
  }
  function setOpen(open) {
    if (useDrawerMode()) clearDesktopHiddenState();
    document.body.classList.toggle('mobile-sidebar-open', !!open);
    toggle.setAttribute('aria-expanded', String(!!open));
    toggle.setAttribute('aria-label', open ? 'Close workspace menu' : 'Open workspace menu');
    const icon = toggle.querySelector('[data-lucide]');
    if (icon) icon.setAttribute('data-lucide', open ? 'x' : 'menu');
    if (window.lucide) window.lucide.createIcons();
  }
  function syncOrientationState() {
    const landscape = isLandscape();
    document.documentElement.classList.toggle('eproc-landscape', landscape);
    document.body.classList.toggle('eproc-landscape', landscape);

    if (landscape) setOpen(false);
    if (useDrawerMode()) clearDesktopHiddenState();
    else setOpen(false);
  }

  toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('mobile-sidebar-open')));
  backdrop.addEventListener('click', () => setOpen(false));
  sidebar.addEventListener('click', event => { if (useDrawerMode() && event.target.closest('.workspace-navigation-item')) setOpen(false); });
  window.addEventListener('resize', syncOrientationState, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(syncOrientationState, 80), { passive: true });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });

  if (useDrawerMode()) { clearDesktopHiddenState(); setOpen(false); }
  syncOrientationState();
})();
