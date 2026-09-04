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

function element() {
  return {innerHTML: '', style: {}, offsetParent: {}, querySelector() { return null; }};
}

test('saved Market Brief HTML is isolated by list and restored to mobile and desktop', () => {
  const elements = {sumArea: element(), sumAreaD: element(), aiBtnM: element(), aiBtnD: element()};
  const context = {
    activeTickerList: 'myStocks', currentView: 'MyStocks',
    document: {getElementById(id) { return elements[id] || null; }},
    isDashboardView(name) { return name === 'MyStocks' || name === 'Watchlist'; },
    setAIBtnVisible() {}
  };
  vm.createContext(context);
  vm.runInContext(sourceBetween('function setSumHTML', 'function isAnyMarketOpen'), context);

  context.saveBriefHTML('myStocks', '<div>Mine</div>');
  context.saveBriefHTML('customTickers', '<div>Watch</div>');
  assert.equal(elements.sumArea.innerHTML, '<div>Mine</div>');
  assert.equal(elements.sumAreaD.innerHTML, '<div>Mine</div>');
  assert.equal(context.savedBriefHTML.myStocks, '<div>Mine</div>');
  assert.equal(context.savedBriefHTML.customTickers, '<div>Watch</div>');

  context.activeTickerList = 'customTickers';
  context.currentView = 'Watchlist';
  context.restoreCurrentBrief();
  assert.equal(elements.sumArea.innerHTML, '<div>Watch</div>');
  assert.equal(elements.sumAreaD.innerHTML, '<div>Watch</div>');
});

test('triggerSummary captures owner, filter and data snapshot and permits one request at a time', () => {
  const calls = [];
  const context = {
    activeTickerList: 'myStocks', curFilter: 'SG',
    mktData: [{sym: '^STI', mkt: 'SG'}, {sym: 'D05.SI', mkt: 'SG'}],
    S: {proxyUrl: 'https://example.test'}, savedBriefHTML: {myStocks: 'old mine', customTickers: 'old watch'},
    _summaryInFlight: false, _summaryOwner: null, Object,
    setSumHTML() {}, setAIBtnVisible() {},
    loadSummary(...args) { calls.push(args); return Promise.resolve(); }
  };
  vm.createContext(context);
  vm.runInContext(sourceBetween('function triggerSummary', '// ── Data'), context);
  context.triggerSummary();
  context.mktData[1].sym = 'CHANGED';
  context.activeTickerList = 'customTickers';
  context.triggerSummary();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'myStocks');
  assert.equal(calls[0][1], 'SG');
  assert.equal(calls[0][2][1].sym, 'D05.SI');
  assert.equal(context.savedBriefHTML.myStocks, '');
  assert.equal(context.savedBriefHTML.customTickers, 'old watch');
  assert.equal(context._summaryOwner, 'myStocks');
});

async function capturePrompt(briefKey, filter, summaryData) {
  let prompt = '';
  const context = {
    Promise, Date, Intl, TextDecoder, JSON,
    activeTickerList: briefKey, currentView: briefKey === 'myStocks' ? 'MyStocks' : 'Watchlist',
    _summaryOwner: briefKey, _summaryInFlight: true, _sumInFlight: true,
    S: {proxyUrl: 'https://example.test', style: 'bullets'},
    FIXED_SYMS: {'^DJI': 1, '^STI': 1, '^HSI': 1},
    MarketBrief: {marketData: {
      getSessionState() { return {regularOpen: false}; },
      getLatestCompletedRegularSessionDate() { return '2026-09-03'; }
    }},
    window: {}, document: {getElementById() { return null; }},
    isDashboardView(name) { return name === 'MyStocks' || name === 'Watchlist'; },
    setSumHTML() {}, saveBriefHTML() {}, setAIBtnVisible() {},
    fmt(value) { return String(value); }, fmtP(value) { return String(value); }, fmtD(value) { return String(value); },
    esc(value) { return String(value); }, cleanAIText(value) { return value; }, formatSummary(value) { return value; },
    fetchQuote() { return Promise.resolve({price: 1, pct: 0, chg: 0}); },
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    fetch(url, options) {
      prompt = JSON.parse(options.body).messages[0].content;
      return Promise.resolve({
        ok: true, status: 200,
        body: {getReader() { return {read() { return Promise.resolve({done: true}); }}; }}
      });
    },
    console: {log() {}}
  };
  vm.createContext(context);
  vm.runInContext(sourceBetween('async function loadSummary', '// ── Strip IV preamble'), context);
  await context.loadSummary(briefKey, filter, summaryData);
  return prompt;
}

test('My Stocks and Watchlist prompts use their captured list data and wording', async () => {
  const mine = await capturePrompt('myStocks', 'SG', [
    {sym: '^STI', name: 'STI', mkt: 'SG', price: 1, chg: 0, pct: 0},
    {sym: 'D05.SI', name: 'DBS', mkt: 'SG', price: 1, chg: 0, pct: 0},
    {sym: '^DJI', name: 'Dow', mkt: 'US', price: 1, chg: 0, pct: 0}
  ]);
  assert.match(mine, /MY STOCKS DATA:/);
  assert.match(mine, /💼 My Stocks/);
  assert.match(mine, /DBS \(D05\.SI\)/);
  assert.doesNotMatch(mine, /Dow: 1/);

  const watch = await capturePrompt('customTickers', 'US', [
    {sym: '^DJI', name: 'Dow', mkt: 'US', price: 1, chg: 0, pct: 0},
    {sym: 'AAPL', name: 'Apple', mkt: 'US', price: 1, chg: 0, pct: 0}
  ]);
  assert.match(watch, /MY WATCHLIST DATA:/);
  assert.match(watch, /💼 My Watchlist/);
  assert.match(watch, /Apple \(AAPL\)/);
});

test('streaming ownership and PDF selection remain tied to the initiating/current view', () => {
  const summarySource = sourceBetween('async function loadSummary', '// ── Strip IV preamble');
  const pdfSource = sourceBetween('function exportToPDF', '// ── Settings');
  assert.match(summarySource, /_summaryOwner!==briefKey/);
  assert.match(summarySource, /savedBriefHTML\[briefKey\]=briefPrefix\+rendered\+briefSuffix/);
  assert.match(summarySource, /savedBriefHTML\[briefKey\]=briefPrefix\+finalRendered\+briefSuffix/);
  assert.match(pdfSource, /contentEl=\(b&&b\.offsetParent!==null\)\?b:a/);
});
