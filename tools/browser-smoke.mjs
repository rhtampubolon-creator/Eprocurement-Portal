import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12'
};
const pages = [
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
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(target).pipe(res);
});

const listen = () => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(4173, '127.0.0.1', () => resolve());
});
const results = [];
let failures = 0;
let browser;
try {
  await listen();
  browser = await chromium.launch({ headless: true });
  for (const pagePath of pages) {
    const page = await browser.newPage();
    const pageErrors = [];
    const localFailures = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith('http://127.0.0.1:4173/') && response.status() >= 400) {
        localFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
    });

    // Isolate frontend smoke tests from production data. No Apps Script requests
    // are sent during this test; authenticated reads/writes are represented by a
    // harmless fixture response.
    await page.route('https://script.google.com/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' },
      body: JSON.stringify({ success: true, status: 'ONLINE', loginRequired: true, rows: [], sheets: {}, data: [] })
    }));
    await page.route('https://script.googleusercontent.com/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, status: 'ONLINE', loginRequired: true, rows: [], sheets: {}, data: [] })
    }));

    const startedAt = Date.now();
    let nav = null;
    let navigationError = '';
    try {
      await page.goto(`http://127.0.0.1:4173/${pagePath}`, { waitUntil: 'load', timeout: 30000 });
      nav = await page.evaluate(() => {
        const entry = performance.getEntriesByType('navigation')[0];
        return entry ? {
          domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
          loadMs: Math.round(entry.loadEventEnd),
          transferBytes: entry.transferSize || 0
        } : null;
      });
    } catch (error) {
      navigationError = error.message;
    }
    await page.waitForTimeout(250);
    const result = {
      page: pagePath,
      elapsedMs: Date.now() - startedAt,
      navigation: nav,
      pageErrors,
      localFailures,
      navigationError
    };
    results.push(result);
    if (pageErrors.length || localFailures.length || navigationError) failures++;
    console.log(JSON.stringify(result));
    await page.close();
  }
} catch (error) {
  console.error(error.stack || String(error));
  failures++;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(`Browser smoke test complete: ${pages.length} pages, ${failures} failed page(s).`);
if (failures) process.exitCode = 1;
