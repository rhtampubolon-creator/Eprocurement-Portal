import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const backendSource = fs.readFileSync(path.join(root, 'codegs.js'), 'utf8');
const backendContext = {
  PropertiesService: {
    getScriptProperties() {
      return { getProperty() { return null; }, setProperty() {} };
    }
  },
  ContentService: {
    MimeType: { JSON: 'JSON' },
    createTextOutput(text) {
      return { text, setMimeType() { return this; } };
    }
  },
  console
};
vm.createContext(backendContext);
vm.runInContext(backendSource, backendContext);

const sanitizationCases = [
  ['=IMPORTXML("https://example.invalid")', "'=IMPORTXML(\"https://example.invalid\")"],
  ['+SUM(1,1)', "'+SUM(1,1)"],
  ['-25', '-25'],
  ['normal text', 'normal text']
];
for (const [input, expected] of sanitizationCases) {
  const actual = backendContext.sanitizeSpreadsheetCell_(input);
  if (actual !== expected) throw new Error(`Formula guard failed: ${input} -> ${actual}`);
}

let denied = false;
try {
  backendContext.authorizeAction_('UNKNOWN_ACTION', {});
} catch (error) {
  denied = /tidak dikenali/.test(String(error.message || error));
}
if (!denied) throw new Error('Unknown backend action was not denied.');

const getWithToken = JSON.parse(backendContext.doGet({ parameter: { authToken: 'secret' } }).text);
if (getWithToken.success !== false || !/Token login tidak boleh/.test(getWithToken.message)) {
  throw new Error('GET query token was not rejected.');
}

const health = JSON.parse(backendContext.doPost({
  postData: { contents: JSON.stringify({ action: 'HEALTH_CHECK' }) }
}).text);
if (!health.success || health.status !== 'ONLINE') throw new Error('POST health check failed.');

const commonSource = fs.readFileSync(path.join(root, 'common.js'), 'utf8');
const commonStart = commonSource.indexOf('(function installAuthenticatedFetch');
const commonEnd = commonSource.indexOf('})();', commonStart) + 5;
let capturedRequest = null;
const storage = values => ({ getItem(key) { return values[key] || ''; } });
const fakeResponse = { clone() { return this; }, json() { return Promise.resolve({ success: true }); } };
const browserWindow = {
  APP_CONFIG: { GAS_URL: 'https://script.google.com/macros/s/test/exec' },
  location: { href: 'https://app.example.test/' },
  fetch(input, init) {
    capturedRequest = { input, init };
    return Promise.resolve(fakeResponse);
  },
  dispatchEvent() {},
  parent: null
};
browserWindow.parent = browserWindow;
const browserContext = {
  window: browserWindow,
  sessionStorage: storage({ MSW_AUTH_TOKEN: 'token-123', MSW_ACTIVE_PROFILE: '{}' }),
  localStorage: storage({}),
  URL,
  Promise,
  JSON,
  String,
  CustomEvent: function CustomEvent() {}
};
vm.createContext(browserContext);
vm.runInContext(commonSource.slice(commonStart, commonEnd), browserContext);
await browserWindow.fetch(
  'https://script.google.com/macros/s/test/exec?sheet=Admin&_=123',
  { cache: 'no-store' }
);
const postPayload = JSON.parse(capturedRequest?.init?.body || '{}');
if (
  capturedRequest?.input !== browserWindow.APP_CONFIG.GAS_URL ||
  capturedRequest?.init?.method !== 'POST' ||
  postPayload.action !== 'READ_SHEET' ||
  postPayload.sheet !== 'Admin' ||
  postPayload.authToken !== 'token-123'
) {
  throw new Error('Authenticated GET was not converted to a token-safe POST request.');
}

console.log('Backend hardening audit OK: 6 security behavior groups.');
