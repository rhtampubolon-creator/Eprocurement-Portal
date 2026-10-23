import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirs = new Set(['.git', 'node_modules', '.next', 'dist', 'coverage']);
const allFiles = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignoredDirs.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else allFiles.push(full);
  }
}
walk(root);

const errors = [];
const warnings = [];
const info = [];
const rel = (file) => relative(root, file).split(sep).join('/');
const read = (file) => readFileSync(file, 'utf8');

function checkSyntax(file, source = null) {
  const args = ['--check'];
  if (source === null) args.push(file);
  else args.push('-');
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    input: source === null ? undefined : source,
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.status !== 0) {
    errors.push(`Syntax error: ${rel(file)}\n${(result.stderr || result.stdout || 'Node syntax check failed').trim()}`);
  }
}

const sourceFiles = allFiles.filter((file) =>
  ['.js', '.mjs', '.cjs'].includes(extname(file))
);
for (const file of sourceFiles) checkSyntax(file);

const backendFile = join(root, 'backend', 'Code.gs');
if (existsSync(backendFile)) checkSyntax(backendFile, read(backendFile));
else errors.push('Backend entrypoint missing: backend/Code.gs');

for (const file of allFiles.filter((item) => extname(item) === '.json')) {
  try {
    JSON.parse(read(file));
  } catch (error) {
    errors.push(`Invalid JSON: ${rel(file)} — ${error.message}`);
  }
}

const htmlFiles = allFiles.filter((file) => extname(file) === '.html');
let htmlBytes = 0;
let blockingExternalScripts = 0;
const missingRefs = [];
const largeScripts = [];
const externalBlockingDetails = [];

for (const file of htmlFiles) {
  const html = read(file);
  htmlBytes += Buffer.byteLength(html);
  const refs = [...html.matchAll(/<(script|link)\b[^>]*>/gi)];
  for (const match of refs) {
    const tag = match[0];
    const isScript = /^<script\b/i.test(tag);
    const attr = isScript ? /\bsrc\s*=\s*["']([^"']+)["']/i : /\bhref\s*=\s*["']([^"']+)["']/i;
    const refMatch = tag.match(attr);
    if (!refMatch) continue;
    const ref = refMatch[1].trim();
    if (/^(?:https?:)?\/\//i.test(ref) || /^(?:data:|mailto:|tel:|#)/i.test(ref)) {
      if (isScript && !/\b(?:async|defer)\b/i.test(tag)) {
        blockingExternalScripts++;
        externalBlockingDetails.push(`${rel(file)} -> ${ref}`);
      }
      continue;
    }
    const clean = decodeURIComponent(ref.split('?')[0].split('#')[0]);
    if (!clean) continue;
    const target = clean.startsWith('/')
      ? resolve(root, `.${clean}`)
      : resolve(dirname(file), clean);
    if (!target.startsWith(root + sep) && target !== root) {
      missingRefs.push(`${rel(file)} -> ${ref} (path escapes repository root)`);
    } else if (!existsSync(target)) {
      missingRefs.push(`${rel(file)} -> ${ref}`);
    }
  }
}

for (const file of allFiles.filter((item) => extname(item) === '.js')) {
  const bytes = statSync(file).size;
  if (bytes >= 180 * 1024) largeScripts.push({ file: rel(file), bytes });
}
largeScripts.sort((a, b) => b.bytes - a.bytes);

if (missingRefs.length) errors.push(...missingRefs.map((item) => `Missing local asset: ${item}`));
if (blockingExternalScripts) {
  warnings.push(`${blockingExternalScripts} external script tag(s) are parser-blocking; defer/lazy-load where execution order permits.`);
  externalBlockingDetails.forEach((item) => info.push(`Blocking external script: ${item}`));
}
if (largeScripts.length) {
  warnings.push(`${largeScripts.length} JavaScript asset(s) are at least 180 KiB raw; review code splitting, compression, and lazy loading.`);
  largeScripts.forEach((item) => info.push(`Large JS: ${item.file} — ${(item.bytes / 1024).toFixed(1)} KiB raw`));
}

const coreFile = join(root, 'core', 'core.js');
if (existsSync(coreFile)) {
  const core = read(coreFile);
  const fetchWrappers = [...core.matchAll(/window\.fetch\s*=/g)].length;
  if (fetchWrappers > 1) warnings.push(`core/core.js installs ${fetchWrappers} window.fetch wrappers; review ordering and ensure each wrapper delegates exactly once.`);
}
if (existsSync(backendFile)) {
  const backend = read(backendFile);
  const fullRangeReads = [...backend.matchAll(/getDataRange\(\)\.get(?:Display)?Values\(\)/g)].length;
  if (fullRangeReads) warnings.push(`backend/Code.gs contains ${fullRangeReads} full-range getDataRange() reads; verify they are not repeated unnecessarily on hot request paths.`);
}

const packageFile = join(root, 'package.json');
if (existsSync(packageFile)) {
  const pkg = JSON.parse(read(packageFile));
  if (!pkg.scripts || !pkg.scripts['audit:performance']) {
    errors.push('package.json must define the audit:performance script.');
  }
}

console.log('E-Procurement performance and safety audit');
console.log(`Scanned ${allFiles.length} files, ${sourceFiles.length} JavaScript source files, ${htmlFiles.length} HTML pages (${(htmlBytes / 1024).toFixed(1)} KiB total HTML).`);
console.log(`Blocking external scripts: ${blockingExternalScripts}; large JS assets (>=180 KiB): ${largeScripts.length}.`);
for (const item of info) console.log(`INFO  ${item}`);
for (const warning of warnings) console.warn(`WARN  ${warning}`);

if (errors.length) {
  console.error(`\nFAILED — ${errors.length} blocking issue(s):`);
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  process.exit(1);
}

console.log(`\nPASS — syntax, JSON, backend entrypoint, and local HTML asset references passed. ${warnings.length} performance observation(s) need review; warnings do not fail the build.`);
