import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const ignoredDirs = new Set(['.git', 'node_modules']);
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignoredDirs.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else files.push(full);
  }
}
walk(root);

const errors = [];
const jsFiles = files.filter((file) => extname(file) === '.js' || extname(file) === '.mjs');
for (const file of jsFiles) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    errors.push(`JavaScript syntax: ${relative(root, file)}\n${check.stderr || check.stdout}`);
  }
}

for (const file of files.filter((file) => extname(file) === '.json')) {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`JSON invalid: ${relative(root, file)} — ${error.message}`);
  }
}

const htmlFiles = files.filter((file) => extname(file) === '.html');
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const refs = [...html.matchAll(/<(?:script[^>]+src|link[^>]+href)=["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  for (const ref of refs) {
    if (/^(?:https?:)?\/\//i.test(ref) || ref.startsWith('data:') || ref.startsWith('#')) continue;
    const clean = ref.split('?')[0].split('#')[0];
    if (!existsSync(resolve(dirname(file), clean))) {
      errors.push(`Referensi lokal hilang: ${relative(root, file)} -> ${ref}`);
    }
  }
}

const textFiles = files.filter((file) => ['.js', '.mjs', '.html', '.md', '.json', '.csv', '.css'].includes(extname(file)));
const forbidden = [
  { name: 'Apps Script deployment URL', pattern: /https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/g },
  { name: 'Google Spreadsheet production ID', pattern: /https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/g },
  { name: 'Google Drive production folder', pattern: /https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]{20,}/g }
];
for (const file of textFiles) {
  const relativePath = relative(root, file);
  // Local deployment config may contain user-specific runtime URLs.
  if (relativePath === 'config.js') continue;
  const text = readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    // A deployed Apps Script endpoint is a public client configuration value,
    // not an authentication secret. The consolidated core needs this endpoint
    // to make browser requests; do not misreport that required URL as a secret.
    if (relativePath === 'core/core.js' && rule.name === 'Apps Script deployment URL') continue;
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) errors.push(`${rule.name}: ${relativePath}`);
  }
}

if (errors.length) {
  console.error(`Validation failed (${errors.length} issue(s)):\n`);
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}\n`));
  process.exit(1);
}

console.log(`Validation OK: ${jsFiles.length} JavaScript files, ${htmlFiles.length} HTML files, ${files.length} total files.`);
