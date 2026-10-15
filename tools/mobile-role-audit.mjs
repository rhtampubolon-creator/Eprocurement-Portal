import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const checks = [];
const check = (label, ok) => { checks.push([label, Boolean(ok)]); };

const shared = read('shared-modules.js');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(shared, ctx);
const allowed = role => ctx.window.MSW_SHARED.allowedModuleIds(role);
check('Buyer sees Procurement', allowed('BUYER').includes('procurementAdmin'));
check('Buyer sees Vendor Management', allowed('BUYER').includes('vendorCompany'));
check('Buyer sees Vendor Requests', allowed('BUYER').includes('vendorRequests'));
check('Buyer sees Contract Management', allowed('BUYER').includes('detailContract'));
check('Buyer does not see Agreement Tracker', !allowed('BUYER').includes('agreementTracker'));
check('Procurement Admin does not see Procurement', !allowed('PROCUREMENT_ADMIN').includes('procurementAdmin'));
check('Procurement Admin sees Vendor Management', allowed('PROCUREMENT_ADMIN').includes('vendorCompany'));
check('Procurement Admin sees Vendor Requests', allowed('PROCUREMENT_ADMIN').includes('vendorRequests'));
check('Contract sees Agreement Dashboard', allowed('CONTRACT').includes('agreementDashboard'));
check('Contract sees Contract Management', allowed('CONTRACT').includes('detailContract'));
check('Contract sees Agreement Tracker', allowed('CONTRACT').includes('agreementTracker'));
check('Contract does not see Procurement', !allowed('CONTRACT').includes('procurementAdmin'));
check('Contract does not see Vendor Management', !allowed('CONTRACT').includes('vendorCompany'));

const procurementHtml = read('procurement-admin/index.html');
check('Buyer Procurement has no duplicate Dashboard button', !procurementHtml.includes('id="btnDashboard"') && !/>\s*Dashboard\s*<\/button>/.test(procurementHtml));

const common = read('common.js');
check('touch double-tap edit bridge', common.includes('dispatchRowGesture("dblclick"'));
check('touch long-press context bridge', common.includes('dispatchRowGesture("contextmenu"'));
check('touch supports native touch and pen', common.includes('addEventListener("touchstart"') && common.includes("pointerType || '').toLowerCase() !== 'pen'"));


const contractScript = read('detail-contract/script.js');
check('Buyer Contract load is not blocked by manage permission', !/window\.addEventListener\("load"[\s\S]{0,300}if \(!canManageContract\(\)\) return;/.test(contractScript));
check('Buyer Contract applies view-only UI before load', contractScript.includes('applyBuyerViewOnlyUI();'));
check('Buyer Contract keeps Export action available', /actionDropdown\) actionDropdown\.style\.display = ""/.test(contractScript));

const vendorScript = read('vendor-company/script.js');
check('Buyer Vendor keeps Export action available', /actionDropdown\) actionDropdown\.style\.display = ""/.test(vendorScript));

const backend = read('codegs.js');
check('Buyer backend contract view', /BUYER:\s*\[[\s\S]*?"contract\.view"/.test(backend));
check('Buyer backend company/vendor view', /BUYER:\s*\[[\s\S]*?"company\.view"/.test(backend));

const mainScript = read('script.js');
const adminHiddenBlock = (mainScript.match(/const adminHiddenNavigationIds\s*=\s*\[([\s\S]*?)\];/) || [,''])[1];
check('Procurement Admin hides Dashboard', adminHiddenBlock.includes('workspaceDashboard'));
check('Procurement Admin hides Procurement', adminHiddenBlock.includes('workspaceProcurement'));
check('Procurement Admin keeps Overdue visible', !adminHiddenBlock.includes('workspaceOverdue'));
check('Procurement Admin role is written to body', mainScript.includes('document.body.dataset.userRole = role'));
check('Procurement Admin sidebar uses inline fail-safe', mainScript.includes('element.style.display = mustHide ? "none" : ""'));
const contractHiddenBlock = (mainScript.match(/const contractHiddenNavigationIds\s*=\s*\[([\s\S]*?)\];/) || [,''])[1];
check('Contract keeps Dashboard visible', !contractHiddenBlock.includes('workspaceDashboard'));
check('Contract hides Procurement navigation', contractHiddenBlock.includes('workspaceProcurement'));
check('Contract keeps AI Contract Reminder visible', !contractHiddenBlock.includes('workspaceAiReminder'));
check('Contract sidebar title is role-specific', mainScript.includes('CONTRACT WORKSPACE'));
check('Contract dashboard opens Agreement Dashboard module', mainScript.includes('openModule("agreementDashboard"'));
const agreementDashboardHtml = read('agreement-dashboard/index.html');
check('Agreement Dashboard has viewport', /name=["']viewport["']/.test(agreementDashboardHtml));
check('Agreement Dashboard has Attention Required table', agreementDashboardHtml.includes('Agreement Attention Required'));
const mainCss = read('style.css');
check('Procurement Admin CSS hard-hides Dashboard', mainCss.includes('body[data-user-role="PROCUREMENT_ADMIN"] #workspaceDashboard'));
check('Procurement Admin CSS hard-hides Procurement', mainCss.includes('body[data-user-role="PROCUREMENT_ADMIN"] #workspaceProcurement'));
check('Procurement Admin Overdue uses dedicated backend endpoint', mainScript.includes('smartFetchOverdueForAdmin') && mainScript.includes('action: "GET_OVERDUE"'));
check('Backend grants Admin overdue-only permission', /PROCUREMENT_ADMIN:\s*\[[\s\S]*?"procurement\.overdue\.view_all"/.test(backend));
check('Backend has dedicated overdue route', backend.includes('action === "GET_OVERDUE"') && backend.includes('loadProcurementOverdueData_'));

for (const rel of ['index.html','procurement-admin/index.html','detail-contract/index.html','vendor-company/index.html','vendor-requests/index.html','agreement-tracker/index.html']) {
  const html = read(rel);
  check(`${rel} viewport`, /name=["']viewport["']/.test(html));
  if (rel !== 'index.html') {
    const expectedCommonVersion = /common\.js\?v=20260810-contract-dashboard-v28/;
    check(`${rel} loads common touch support`, expectedCommonVersion.test(html));
  }
}

for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`);
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`Mobile/role audit failed: ${failed.length} check(s)`);
  process.exit(1);
}
console.log(`Mobile/role audit OK: ${checks.length} checks.`);
