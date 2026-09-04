const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function sourceBetween(startText, endText) {
  const start = appSource.indexOf(startText);
  const end = appSource.indexOf(endText, start);
  assert.notEqual(start, -1, `missing source start: ${startText}`);
  assert.notEqual(end, -1, `missing source end: ${endText}`);
  return appSource.slice(start, end);
}

const stateSource = sourceBetween('var MarketBrief =', '// ── Boot');
const getAllTickersSource = sourceBetween('function getAllTickers', 'var _quoteFetches');
const persistenceSource = appSource.slice(appSource.indexOf('function exportSettings'));

function createStorage(initial = {}) {
  const values = {...initial};
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem(key, value) { values[key] = String(value); },
    value(key) { return values[key]; }
  };
}

function createHarness(initialStorage = {}) {
  const localStorage = createStorage(initialStorage);
  const sessionStorage = createStorage();
  const elements = {};
  const document = {
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = {
          value: '',
          innerHTML: '',
          textContent: '',
          select() {},
          setSelectionRange() {}
        };
      }
      return elements[id];
    }
  };
  const context = {
    window: {}, document, localStorage, sessionStorage,
    navigator: {clipboard: {writeText() {}}},
    location: {reload() {}},
    setTimeout() {}, clearTimeout() {},
    btoa(value) { return Buffer.from(value, 'binary').toString('base64'); },
    atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
    escape, unescape, encodeURIComponent, decodeURIComponent,
    console
  };
  vm.createContext(context);
  vm.runInContext(stateSource + getAllTickersSource + persistenceSource, context);
  return {context, elements, localStorage};
}

function ticker(sym, mkt) {
  return {sym, name: sym, sub: mkt, flag: mkt, mkt};
}

test('old mb5 data without myStocks loads with empty market lists', () => {
  const oldData = {customTickers: {US: [ticker('AAPL', 'US')], SG: [], HK: []}};
  const {context} = createHarness({mb5: JSON.stringify(oldData)});
  context.loadSettings();
  assert.deepEqual(JSON.parse(JSON.stringify(context.S.myStocks)), {US: [], SG: [], HK: []});
  assert.equal(context.S.customTickers.US[0].sym, 'AAPL');
});

test('save and reload preserve myStocks order and customTickers behavior', () => {
  const first = createHarness();
  first.context.S.customTickers.SG.push(ticker('D05.SI', 'SG'));
  first.context.S.myStocks.SG.push(ticker('O39.SI', 'SG'), ticker('C6L.SI', 'SG'));
  first.context.document.getElementById('cfgProxy_settingsPanel').value = '';
  first.context.document.getElementById('cfgStyle_settingsPanel').value = 'detailed';
  first.context.document.getElementById('cfgTz_settingsPanel').value = 'Asia/Singapore';
  first.context.saveSettings('settingsPanel');

  const saved = first.localStorage.value('mb5');
  const second = createHarness({mb5: saved});
  second.context.loadSettings();
  assert.deepEqual(Array.from(second.context.S.myStocks.SG, item => item.sym), ['O39.SI', 'C6L.SI']);
  assert.deepEqual(Array.from(second.context.S.customTickers.SG, item => item.sym), ['D05.SI']);
});

test('export and import preserve myStocks order', () => {
  const source = createHarness();
  source.context.S.customTickers.HK.push(ticker('0700.HK', 'HK'));
  source.context.S.myStocks.HK.push(ticker('9988.HK', 'HK'), ticker('0005.HK', 'HK'));
  source.context.exportSettings('settingsPanel');
  const html = source.elements.expOut_settingsPanel.innerHTML;
  const code = html.match(/readonly>([^<]+)<\/textarea>/)[1];

  const target = createHarness();
  target.context.document.getElementById('impInp_settingsPanel').value = code;
  target.context.importSettings('settingsPanel');
  assert.deepEqual(Array.from(target.context.S.myStocks.HK, item => item.sym), ['9988.HK', '0005.HK']);
  assert.deepEqual(Array.from(target.context.S.customTickers.HK, item => item.sym), ['0700.HK']);
  const persisted = JSON.parse(target.localStorage.value('mb5'));
  assert.deepEqual(persisted.myStocks.HK.map(item => item.sym), ['9988.HK', '0005.HK']);
});

test('old export without myStocks remains compatible', () => {
  const oldPayload = {
    proxyUrl: 'https://example.test', style: 'concise', tz: 'UTC',
    customTickers: {US: [ticker('MSFT', 'US')], SG: [], HK: []}
  };
  const {context, elements, localStorage} = createHarness();
  context.document.getElementById('impInp_settingsPanel').value = Buffer.from(
    unescape(encodeURIComponent(JSON.stringify(oldPayload))), 'binary'
  ).toString('base64');
  context.importSettings('settingsPanel');
  assert.equal(context.S.customTickers.US[0].sym, 'MSFT');
  assert.deepEqual(JSON.parse(JSON.stringify(context.S.myStocks)), {US: [], SG: [], HK: []});
  assert.deepEqual(JSON.parse(localStorage.value('mb5')).myStocks, {US: [], SG: [], HK: []});
});

test('getAllTickers output is unchanged when myStocks changes', () => {
  const {context} = createHarness();
  context.S.customTickers.US.push(ticker('AAPL', 'US'));
  const before = Array.from(context.getAllTickers(), item => item.sym);
  context.S.myStocks.US.push(ticker('VEEV', 'US'));
  context.S.myStocks.SG.push(ticker('D05.SI', 'SG'));
  assert.deepEqual(Array.from(context.getAllTickers(), item => item.sym), before);
  assert.ok(!context.getAllTickers().some(item => item.sym === 'VEEV' || item.sym === 'D05.SI'));
});
