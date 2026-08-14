(function () {
  'use strict';

  const text = value => value == null ? '' : String(value).trim();

  function stripLineSuffix(value) {
    return text(value).replace(/\s*\(\s*Line[^)]*\)\s*$/i, '').trim();
  }

  function getRevisionRound(value) {
    const source = stripLineSuffix(value);
    if (!source) return '';

    // Standalone round field, e.g. R0 / R1 / R10.
    const standalone = source.match(/^R\s*(\d+)$/i);
    if (standalone) return `R${Number(standalone[1])}`;

    // PR revision must follow the numeric end of the base PR. This deliberately
    // does NOT treat the R in PR001 as a revision.
    // Supported: PR001 R1, PR001R1, PC0126-000001961 R2, ...961R2.
    const revision = source.match(/(\d)\s*R\s*(\d+)\s*$/i);
    return revision ? `R${Number(revision[2])}` : '';
  }

  function getBasePR(value) {
    const source = stripLineSuffix(value);
    if (!source) return '';
    return source.replace(/(\d)\s*R\s*\d+\s*$/i, '$1').trim();
  }

  function normalizeRound(value, fallback = 'R0') {
    const revision = getRevisionRound(value);
    if (revision) return revision;
    const match = text(value).match(/^\s*R\s*(\d+)\s*$/i);
    return match ? `R${Number(match[1])}` : fallback;
  }

  function isProjectFolderMatch(folderName, value) {
    const folder = text(folderName);
    const base = getBasePR(value);
    if (!folder || !base) return false;
    const upperFolder = folder.toUpperCase();
    const upperBase = base.toUpperCase();
    if (upperFolder === upperBase) return true;
    if (!upperFolder.startsWith(upperBase)) return false;
    const boundary = folder.charAt(base.length);
    return /[\s\-_(]/.test(boundary);
  }

  window.MSW_PR_IDENTITY = Object.freeze({
    stripLineSuffix,
    getBasePR,
    getRevisionRound,
    normalizeRound,
    isProjectFolderMatch
  });
})();
