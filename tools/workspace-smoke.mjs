import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden'); return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(res);
});
const listen = () => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(4173, '127.0.0.1', resolve);
});
let browser;
let failures = 0;
try {
  await listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const localFailures = [];
  page.on('pageerror', e => errors.push({ page: page.url(), message: e.message }));
  page.on('response', r => {
    if (r.url().startsWith('http://127.0.0.1:4173/') && r.status() >= 400) {
      localFailures.push(`${r.status()} ${new URL(r.url()).pathname}`);
    }
  });
  // Isolate test from production: all Apps Script requests receive fixture data.
  const mockAppsScript = async route => {
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
      status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' },
      body: JSON.stringify({ success: true, status: 'ONLINE', loginRequired: true, rows, sheets: {}, data: [], result: [] })
    });
  };
  await page.route('https://script.google.com/**', mockAppsScript);
  await page.route('https://script.googleusercontent.com/**', mockAppsScript);
  await page.goto('http://127.0.0.1:4173/procurement-admin/workspace/index.html?pr=TEST-PR&tab=BidderList', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => {
    const frame = document.getElementById('bidderWorkspaceFrame');
    return frame && frame.src.includes('/bidder-list/index.html?');
  }, { timeout: 10000 });
  await page.waitForTimeout(2500);
  const bidderFrame = page.frames().find(f => f.url().includes('/bidder-list/index.html?'));
  if (!bidderFrame) throw new Error('BidderList iframe was not created');
  const state = await bidderFrame.evaluate(() => ({
    title: document.title,
    viewTitle: document.getElementById('viewTitle')?.textContent?.trim() || '',
    viewBodyExists: Boolean(document.getElementById('viewBody')),
    viewBodyChildren: document.getElementById('viewBody')?.children?.length || 0,
    viewBodyText: document.getElementById('viewBody')?.innerText?.trim()?.slice(0, 250) || '',
    readyState: document.readyState
  }));
  const supplierInput = bidderFrame.locator('input.vendor-select').first();
  await supplierInput.focus();
  const suggestion = bidderFrame.locator('#vendorCompanySuggestionPopup [data-vendor-index="0"]');
  await suggestion.waitFor({ state: 'visible', timeout: 5000 });
  const suggestionText = await suggestion.innerText();
  await suggestion.click();
  await bidderFrame.waitForFunction(() => document.querySelector('input.vendor-select')?.value === 'PT Vendor Example', null, { timeout: 5000 });
  const pickerState = {
    suggestionVisibleOnFocus: true,
    firstSuggestion: suggestionText,
    selectedValue: await bidderFrame.locator('input.vendor-select').first().inputValue(),
    popupHiddenAfterSelect: await bidderFrame.locator('#vendorCompanySuggestionPopup').evaluate(el => el.hidden)
  };
  console.log(JSON.stringify({ test: 'workspace-bidderlist', state, pickerState, pageErrors: errors, localFailures }, null, 2));
  if (!state.viewBodyExists || state.readyState !== 'complete') failures++;
  if (pickerState.selectedValue !== 'PT Vendor Example' || !pickerState.popupHiddenAfterSelect) failures++;
  if (errors.length || localFailures.length) failures++;
} catch (error) {
  console.error(error.stack || String(error));
  failures++;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(`Workspace smoke test: ${failures ? 'FAILED' : 'PASSED'}`);
if (failures) process.exitCode = 1;
