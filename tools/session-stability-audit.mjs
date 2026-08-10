import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const common = read('common.js');
const main = read('script.js');
const dashboard = read('dashboard/script.js');
const backend = read('codegs.js');
const checks = [
  ['active token helper exists', common.includes('window.MSW_GET_AUTH_TOKEN = readActiveToken')],
  ['token pairs profile and storage', common.includes('sessionToken && sessionProfile') && common.includes('localToken && localProfile')],
  ['GET auth token not duplicated', common.includes('!/[?&]authToken=/.test(targetUrl)')],
  ['auth failure propagates from iframe', common.includes('MSW_AUTH_REQUIRED') && common.includes('window.parent.postMessage')],
  ['main recovers expired session', main.includes('function recoverExpiredSession') && main.includes('clearAuthSession();')],
  ['background features wait for auth', !/document\.body\.dataset\.workspacePanel = "dashboard";\s*initSmartAlerts\(\);\s*initRecentActivity\(\);/.test(main)],
  ['smart alerts require token', /async function loadSmartAlerts\(options = \{\}\)\{\s*if \(!getStoredAuthToken\(\)\) return;/.test(main)],
  ['recent activity requires token', /async function loadRecentActivity\(options = \{\}\)\{\s*if \(!getStoredAuthToken\(\)\) return;/.test(main)],
  ['profile resolver tries both storages', main.includes('{ name: "session", storage: sessionStorage }') && main.includes('{ name: "local", storage: localStorage }')],
  ['Buyer dashboard remains enabled', /return \["SUPER_ADMIN", "BUYER"\]/.test(main)],
  ['Buyer data filtered server-side', backend.includes('procurement.view_own') && backend.includes('filterRowsForProfile_')],
  ['dashboard uses authenticated common library', dashboard.includes('APP_CONFIG?.GAS_URL')],
];
let failed=0;
for (const [label, ok] of checks) { console.log(`${ok?'PASS':'FAIL'} - ${label}`); if(!ok) failed++; }
if(failed){ console.error(`Session stability audit failed: ${failed}`); process.exit(1); }
console.log(`Session stability audit OK: ${checks.length} checks.`);
