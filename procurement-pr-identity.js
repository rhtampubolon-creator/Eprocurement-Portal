(function () {
  'use strict';
  const text = value => value == null ? '' : String(value).trim();
  function stripLineSuffix(value){return text(value).replace(/\s*\(\s*Line[^)]*\)\s*$/i,'').trim();}
  function getRevisionRound(value){const source=stripLineSuffix(value);if(!source)return'';const standalone=source.match(/^R\s*(\d+)$/i);if(standalone)return`R${Number(standalone[1])}`;const revision=source.match(/(\d)\s*R\s*(\d+)\s*$/i);return revision?`R${Number(revision[2])}`:'';}
  function getBasePR(value){const source=stripLineSuffix(value);if(!source)return'';return source.replace(/(\d)\s*R\s*\d+\s*$/i,'$1').trim();}
  function normalizeRound(value,fallback='R0'){const revision=getRevisionRound(value);if(revision)return revision;const match=text(value).match(/^\s*R\s*(\d+)\s*$/i);return match?`R${Number(match[1])}`:fallback;}
  function isProjectFolderMatch(folderName,value){const folder=text(folderName),base=getBasePR(value);if(!folder||!base)return false;const f=folder.toUpperCase(),b=base.toUpperCase();if(f===b)return true;if(!f.startsWith(b))return false;return /[\s\-_(]/.test(folder.charAt(base.length));}
  window.MSW_PR_IDENTITY=Object.freeze({stripLineSuffix,getBasePR,getRevisionRound,normalizeRound,isProjectFolderMatch});
})();