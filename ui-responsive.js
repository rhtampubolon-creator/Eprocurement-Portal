(function () {
  const toggle = document.getElementById('mobileSidebarToggle');
  const backdrop = document.getElementById('mobileSidebarBackdrop');
  const sidebar = document.getElementById('leftSidebar');
  if (!toggle || !backdrop || !sidebar) return;

  function setOpen(open) {
    document.body.classList.toggle('mobile-sidebar-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close workspace menu' : 'Open workspace menu');
    const icon = toggle.querySelector('[data-lucide]');
    if (icon) icon.setAttribute('data-lucide', open ? 'x' : 'menu');
    if (window.lucide) window.lucide.createIcons();
  }

  toggle.addEventListener('click', function () {
    setOpen(!document.body.classList.contains('mobile-sidebar-open'));
  });
  backdrop.addEventListener('click', function () { setOpen(false); });
  sidebar.addEventListener('click', function (event) {
    if (window.innerWidth <= 860 && event.target.closest('.workspace-navigation-item')) setOpen(false);
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 860) setOpen(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') setOpen(false);
  });
})();
