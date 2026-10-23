import { chromium } from 'playwright';

const origin = process.env.PRODUCTION_BASE_URL || 'https://rhtampubolon-creator.github.io/Eprocurement-Portal';
const paths = [
  '',
  'dashboard/',
  'bidder-list/',
  'procurement-admin/workspace/index.html?pr=PERF-SMOKE&tab=BidderList'
];
const browser = await chromium.launch({ headless: true });
const results = [];
let failures = 0;

function mockAppsScript(route) {
  let requestData = {};
  try { requestData = route.request().postDataJSON() || {}; } catch (_) {}
  let sheetName = String(requestData.sheet || '');
  try {
    const url = new URL(route.request().url());
    sheetName = sheetName || url.searchParams.get('sheet') || '';
  } catch (_) {}
  const rows = sheetName.toLowerCase() === 'company' ? [
    { 'No Company': 'V001', 'Company Name': 'PT Vendor Example', 'Customer Contact': 'Tester', 'Company Phone': '08123456789', 'Email': 'vendor@example.test', 'Status Register': 'Registered', 'Company Status': 'Active' },
    { 'No Company': 'V002', 'Company Name': 'CV Supplier Demo', 'Customer Contact': 'Demo Contact', 'Company Phone': '08111111111', 'Email': 'demo@example.test', 'Status Register': 'Registered', 'Company Status': 'Active' }
  ] : [];
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify({ success: true, status: 'ONLINE', loginRequired: true, rows, sheets: {}, data: [], result: [] })
  });
}

try {
  for (const path of paths) {
    const page = await browser.newPage();
    const pageErrors = [];
    const assetFailures = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => {
      const url = response.url();
      if (url.startsWith(origin) && response.status() >= 400) {
        assetFailures.push({ status: response.status(), url });
      }
    });
    await page.route('https://script.google.com/**', mockAppsScript);
    await page.route('https://script.googleusercontent.com/**', mockAppsScript);

    let status = null;
    let navigationTiming = null;
    let title = '';
    try {
      const response = await page.goto(new URL(path, origin.replace(/\\/+$/, '') + '/').href, { waitUntil: 'load', timeout: 45000 });
      status = response?.status() ?? null;
      await page.waitForTimeout(800);
      title = await page.title();
      navigationTiming = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        if (!nav) return null;
        return {
          responseStartMs: Math.round(nav.responseStart),
          domInteractiveMs: Math.round(nav.domInteractive),
          domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
          loadEventEndMs: Math.round(nav.loadEventEnd),
          transferSizeBytes: nav.transferSize
        };
      });
    } catch (error) {
      pageErrors.push(String(error?.message || error));
    }

    const result = { path, status, title, navigationTiming, pageErrors, assetFailures };
    results.push(result);
    if (status !== 200 || pageErrors.length || assetFailures.length) failures++;
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  test: 'production-read-only-performance-smoke',
  origin,
  note: 'All Google Apps Script endpoints are intercepted and mocked; this test does not write to production Sheets.',
  results,
  failures,
  outcome: failures ? 'FAILED' : 'PASSED'
}, null, 2));

if (failures) process.exitCode = 1;
