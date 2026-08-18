/* ======================================================
   UNRESTRICTED LOCAL FILE PICKER — Release 3.5.12

   Applies only to Procurement attachment pickers.
   The local file writer already stores File/Blob data without extension checks.
   This adapter removes UI-level accept filters so email files (.msg/.eml),
   archives, documents, images and other file types can be selected.
====================================================== */
(function installUnrestrictedLocalUpload(){
  'use strict';
  if (window.__MSW_UNRESTRICTED_LOCAL_UPLOAD_V3512__) return;
  window.__MSW_UNRESTRICTED_LOCAL_UPLOAD_V3512__ = true;

  const path = String(window.location.pathname || '');
  const isForm = /\/procurement-admin\/Form\//i.test(path);
  const isParent = /\/procurement-admin\/?(?:index\.html)?$/i.test(path);
  if (!isForm && !isParent) return;

  const FILE_INPUT_IDS = ['folderFileInput', 'extendedRebidFile'];

  function relaxInput(input, View = window){
    if (!(input instanceof View.HTMLInputElement) || input.type !== 'file') return;
    input.removeAttribute('accept');
    input.accept = '';
    input.dataset.mswAnyFile = 'true';
    input.title = 'Semua jenis file dapat dipilih';
  }

  function relaxDocument(doc, View = window){
    if (!doc) return;
    FILE_INPUT_IDS.forEach(id => relaxInput(doc.getElementById(id), View));
  }

  function installInside(doc, View = window){
    relaxDocument(doc, View);

    doc.addEventListener('click', event => {
      const trigger = event.target?.closest?.('#uploadFilesBtn, #extendedRebidFile, label[for="extendedRebidFile"]');
      if (!trigger) return;
      relaxDocument(doc, View);
    }, true);

    if (doc.body && View.MutationObserver) {
      new View.MutationObserver(() => relaxDocument(doc, View))
        .observe(doc.body, { childList: true, subtree: true });
    }
  }

  function installParentBridge(){
    const bind = function(){
      const frame = document.getElementById('formFrame');
      if (!frame || frame.dataset.mswAnyFileBridge === 'true') return;
      frame.dataset.mswAnyFileBridge = 'true';
      frame.addEventListener('load', () => {
        try {
          const childWindow = frame.contentWindow;
          const childDocument = frame.contentDocument;
          if (childWindow && childDocument) installInside(childDocument, childWindow);
        } catch (error) {
          console.warn('Any-file picker bridge tidak dapat mengakses Procurement Form.', error);
        }
      });
    };

    bind();
    if (document.body) new MutationObserver(bind).observe(document.body, { childList: true, subtree: true });
  }

  function install(){
    if (isForm) installInside(document, window);
    if (isParent) installParentBridge();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
