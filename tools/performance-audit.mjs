import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const stat = rel => fs.statSync(path.join(root, rel)).size;
const fmt = bytes => bytes >= 1024 * 1024
  ? `${(bytes / 1024 / 1024).toFixed(2)} MiB`
  : `${(bytes / 1024).toFixed(1)} KiB`;

const assets = [
  'core/core.js',
  'script.js',
  'bidder-list/script.js',
  'procurement-admin/script.js',
  'assets/lucide.min.js',
  'assets/xlsx.full.min.js'
];
const htmlFiles = [
  'index.html',
  'bidder-list/index.html',
  'procurement-admin/index.html',
  'dashboard/index.html',
  'detail-contract/index.html',
  'agreement-tracker/index.html',
  'agreement-dashboard/index.html',
  'vendor-company/index.html',
  'vendor-requests/index.html',
  'procurement-admin/Form/index.html'
];
const warnings = [];

console.log('MSW E-Procurement static performance audit');
console.log('Note: static findings only; no live browser/network timings are inferred.\n');

console.log('Largest runtime assets:');
for (const rel of assets) {
  console.log(`  ${fmt(stat(rel)).padStart(10)}  ${rel}`);
}

console.log('\nHTML script loading review:');
for (const rel of htmlFiles) {
  const html = read(rel);
  const tags = [...html.matchAll(/<script\b([^>]*)>(?:[\s\S]*?<\/script\s*>|)/gi)];
  const blocking = tags
    .map(match => ({ attrs: match[1], tag: match[0].slice(0, 240) }))
    .filter(item => /\bsrc\s*=/.test(item.attrs) &&
      !/\b(?:defer|async)\b/i.test(item.attrs) &&
      !/\btype\s*=\s*["']module["']/i.test(item.attrs));
  if (blocking.length) {
    console.log(`  REVIEW ${rel}: ${blocking.length} external script(s) without defer/async`);
    for (const item of blocking.slice(0, 8)) {
      console.log(`    - ${item.tag.replace(/\s+/g, ' ').slice(0, 180)}`);
    }
    warnings.push(`${rel}: ${blocking.length} blocking script(s)`);
  } else {
    console.log(`  OK     ${rel}: no external blocking script detected`);
  }
}

const core = read('core/core.js');
const fetchWrappers = (core.match(/window\.fetch\s*=/g) || []).length;
console.log(`\nShared runtime: ${fetchWrappers} window.fetch assignments in core/core.js`);
if (fetchWrappers > 1) warnings.push(`core/core.js has ${fetchWrappers} fetch wrapper assignments; verify wrapper order before changing`);

const backend = read('backend/Code.gs');
const sheetReads = (backend.match(/getDataRange\(\)\.getDisplayValues\(\)/g) || []).length;
const openById = (backend.match(/SpreadsheetApp\.openById\(/g) || []).length;
console.log(`Backend static indicators: ${sheetReads} getDataRange().getDisplayValues() call sites; ${openById} SpreadsheetApp.openById() call sites`);
console.log('These counts indicate review locations, not per-request call counts or measured latency.');

const pdfCspMismatch = [];
for (const rel of htmlFiles) {
  const html = read(rel);
  const pdfHosts = [...html.matchAll(/https:\/\/([^/'"\s]+)[^'"\s]*pdf(?:\.min)?\.js/gi)].map(m => m[1]);
  if (!pdfHosts.length) continue;
  const csp = (html.match(/Content-Security-Policy[^>]+content=["']([^"']+)/i) || [,''])[1];
  for (const host of new Set(pdfHosts)) {
    if (csp && !csp.includes(host) && !/script-src[^;]*\*/.test(csp)) {
      pdfCspMismatch.push(`${rel}: PDF.js host ${host} is not explicitly allowed by script-src`);
    }
  }
}
if (pdfCspMismatch.length) {
  console.log('\nPotential PDF.js/CSP mismatches:');
  for (const item of pdfCspMismatch) { console.log(`  REVIEW ${item}`); warnings.push(item); }
}

console.log(`\nAudit complete: ${warnings.length} review item(s). This audit is advisory and does not fail the build.`);
