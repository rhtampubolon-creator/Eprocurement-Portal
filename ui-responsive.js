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

  // APK always uses the drawer navigation, including wide foldable screens.
  // Normal web browsers use the drawer only on compact widths.
  function useDrawerMode() { return isAndroidApp || window.innerWidth <= 860; }
  function isLandscape() { return !!(window.matchMedia && window.matchMedia('(orientation: landscape)').matches); }
  function clearDesktopHiddenState() {
    sidebar.classList.remove('overlay', 'sidebar-hidden');
    if (mainLayout) mainLayout.classList.remove('sidebar-collapsed');
    const desktopTrigger = document.getElementById('sidebarTrigger');
    if (desktopTrigger) desktopTrigger.classList.add('hidden');
  }
  function syncDrawerModeClass() {
    const drawerMode = useDrawerMode();
    document.body.classList.toggle('mobile-drawer-mode', drawerMode);
    return drawerMode;
  }
  function setOpen(open) {
    const drawerMode = syncDrawerModeClass();
    if (drawerMode) clearDesktopHiddenState();
    else open = false;
    document.body.classList.toggle('mobile-sidebar-open', !!open);
    toggle.setAttribute('aria-expanded', String(!!open));
    toggle.setAttribute('aria-label', open ? 'Close workspace menu' : 'Open workspace menu');
    const icon = toggle.querySelector('[data-lucide]');
    if (icon) icon.setAttribute('data-lucide', open ? 'x' : 'menu');
    if (window.lucide) window.lucide.createIcons();
  }
  function closeDrawer() {
    setOpen(false);
    document.body.classList.remove('mobile-sidebar-open');
  }
  function syncOrientationState() {
    const landscape = isLandscape();
    document.documentElement.classList.toggle('eproc-landscape', landscape);
    document.body.classList.toggle('eproc-landscape', landscape);
    const drawerMode = syncDrawerModeClass();
    if (drawerMode) clearDesktopHiddenState();
    closeDrawer();
  }

  toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('mobile-sidebar-open')));
  backdrop.addEventListener('click', closeDrawer);
  sidebar.addEventListener('click', event => {
    if (!useDrawerMode() || !event.target.closest('.workspace-navigation-item')) return;
    // Close before the workspace handler swaps dashboard/module content so
    // Fold/phone APK navigation never leaves the drawer visible over the new page.
    closeDrawer();
    requestAnimationFrame(closeDrawer);
    setTimeout(closeDrawer, 80);
  }, true);
  window.addEventListener('resize', syncOrientationState, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(syncOrientationState, 80), { passive: true });
  window.addEventListener('pageshow', closeDrawer, { passive: true });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });

  syncDrawerModeClass();
  if (useDrawerMode()) clearDesktopHiddenState();
  closeDrawer();
  syncOrientationState();
})();

(function(){
  if(window.__MSW_RESPONSIVE_ASSET_LOADER__) return;
  window.__MSW_RESPONSIVE_ASSET_LOADER__=true;

  if(!document.querySelector('link[data-eproc-responsive-device]')){
    const responsive=document.createElement('link');
    responsive.rel='stylesheet';
    responsive.href='responsive-device.css?v=20260815-drawer-v3';
    responsive.setAttribute('data-eproc-responsive-device','1');
    document.head.appendChild(responsive);
  }

  if(!document.querySelector('link[data-eproc-mobile-fit-css]')){
    const fitCss=document.createElement('link');
    fitCss.rel='stylesheet';
    fitCss.href='mobile-table-fit.css?v=20260813-v130';
    fitCss.setAttribute('data-eproc-mobile-fit-css','1');
    document.head.appendChild(fitCss);
  }

  if(!document.querySelector('script[data-eproc-mobile-fit-js]')){
    const fitJs=document.createElement('script');
    fitJs.src='mobile-table-fit.js?v=20260813-v130';
    fitJs.defer=true;
    fitJs.setAttribute('data-eproc-mobile-fit-js','1');
    document.body.appendChild(fitJs);
  }
})();
