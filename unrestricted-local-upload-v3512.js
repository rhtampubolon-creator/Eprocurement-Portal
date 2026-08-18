/* ======================================================
   UNRESTRICTED LOCAL FILE PICKER — Release 3.5.12

   Applies only to Procurement Form attachment pickers.
   The local file writer already stores File/Blob data without extension checks.
   This adapter removes UI-level accept filters so email files (.msg/.eml),
   archives, documents, images and other file types can be selected.
====================================================== */
(function installUnrestrictedLocalUpload(){
  'use strict';
  if (window.__MSW_UNRESTRICTED_LOCAL_UPLOAD_V3512__) return;
  window.__MSW_UNRESTRICTED_LOCAL_UPLOAD_V3512__ = true;

  if (!/\/procurement-admin\/Form\//i.test(window.location.pathname)) return;

  const FILE_INPUT_IDS = [
    'folderFileInput',
    'extendedRebidFile'
  ];

  function relaxInput(input){
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    input.removeAttribute('accept');
    // Empty accept is the broadest browser/WebView file-picker contract.
    input.accept = '';
    input.dataset.mswAnyFile = 'true';
    input.title = 'Semua jenis file dapat dipilih';
  }

  function relaxAll(){
    FILE_INPUT_IDS.forEach(id => relaxInput(document.getElementById(id)));
  }

  function install(){
    relaxAll();

    // Re-apply immediately before opening a picker. This also protects against
    // another script restoring an old accept list after initial page load.
    document.addEventListener('click', event => {
      const trigger = event.target?.closest?.('#uploadFilesBtn, #extendedRebidFile, label[for="extendedRebidFile"]');
      if (!trigger) return;
      relaxAll();
    }, true);

    // Form sections can be shown/hidden dynamically; if an input is recreated,
    // keep the picker unrestricted without changing any upload destination logic.
    new MutationObserver(relaxAll).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
