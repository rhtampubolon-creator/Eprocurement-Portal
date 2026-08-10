import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const config = read('config.js');
const backend = read('codegs.js');
const index = read('index.html');
const checks = [
  ['frontend production mode', /ENVIRONMENT:\s*"production"/.test(config)],
  ['frontend has no spreadsheet URLs', !/docs\.google\.com\/spreadsheets\/d\//.test(config)],
  ['frontend has no Apps Script project URL', !/script\.google\.com\/u\/0\/home\/projects\//.test(config)],
  ['backend defaults production', /APP_ENV\s*=\s*scriptProperty_\("APP_ENV",\s*"PRODUCTION"\)/.test(backend)],
  ['production forces role enforcement', /APP_ENV\s*===\s*"PRODUCTION"[\s\S]{0,80}\?\s*true/.test(backend)],
  ['AUTH_PEPPER production guard', /Security configuration incomplete\. Run setupProductionSecurity_/.test(backend)],
  ['brute-force guard', /LOGIN_MAX_ATTEMPTS/.test(backend) && /recordLoginFailure_/.test(backend)],
  ['password hash v2', /return "v2\$" \+ value/.test(backend)],
  ['session lifetime configured', /SESSION_HOURS/.test(backend) && /REMEMBER_SESSION_HOURS/.test(backend)],
  ['direct admin database links removed', !/id="adminGoogleSheetLink"/.test(index) && !/id="adminAppsScriptLink"/.test(index)],
  ['CSP present', /Content-Security-Policy/.test(index)],
];
let failed=0;
for (const [name, ok] of checks) {
  console.log(`${ok?'PASS':'FAIL'} - ${name}`);
  if(!ok) failed++;
}
if(failed) process.exit(1);
console.log(`Security audit OK: ${checks.length} checks.`);
