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

test('US routes to one structured generation while SG, HK and ALL retain legacy routing', async () => {
  for (const filter of ['US', 'SG', 'HK', 'all']) {
    const calls = [];
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const context = {
      activeTickerList: 'customTickers', curFilter: filter,
      mktData: [{sym: 'AAPL', mkt: 'US'}],
      S: {proxyUrl: 'https://example.test'},
      savedBriefHTML: {myStocks: 'mine', customTickers: 'watch'},
      _summaryInFlight: false, _summaryOwner: null, Object,
      setSumHTML() {}, setAIBtnVisible() {}, esc(value) { return String(value); },
      loadStructuredSummary(...args) { calls.push(['structured', ...args]); return pending; },
      loadSummary(...args) { calls.push(['legacy', ...args]); return pending; }
    };
    vm.createContext(context);
    vm.runInContext(sourceBetween('function triggerSummary', '// ── Data'), context);
    context.triggerSummary();
    context.triggerSummary();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], filter === 'US' ? 'structured' : 'legacy');
    assert.equal(calls[0][1], 'customTickers');
    if (filter === 'US') {
      assert.equal(calls[0][2], 'watch');
      assert.equal(context.savedBriefHTML.customTickers, 'watch');
    } else {
      assert.equal(calls[0][2], filter);
      assert.equal(context.savedBriefHTML.customTickers, '');
    }
    finish();
    await pending;
    await Promise.resolve();
  }
});

test('failed US regeneration preserves the previous keyed report', async () => {
  const visible = [];
  const context = {
    activeTickerList: 'myStocks', curFilter: 'US', mktData: [{sym: 'AAPL', mkt: 'US'}],
    S: {proxyUrl: 'https://example.test'},
    savedBriefHTML: {myStocks: '<div>Previous valid report</div>', customTickers: '<div>Watch</div>'},
    _summaryInFlight: false, _summaryOwner: null, Object,
    setSumHTML(html, key) { visible.push([key, html]); }, setAIBtnVisible() {},
    esc(value) { return String(value); },
    loadStructuredSummary() {
      const error = new Error('package unavailable');
      error.structuredElapsedText = 'Worked for 1 min 08 secs';
      return Promise.reject(error);
    },
    loadSummary() { throw new Error('legacy path must not run'); }
  };
  vm.createContext(context);
  vm.runInContext(sourceBetween('function triggerSummary', '// ── Data'), context);
  context.triggerSummary();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(context.savedBriefHTML.myStocks, '<div>Previous valid report</div>');
  assert.equal(context.savedBriefHTML.customTickers, '<div>Watch</div>');
  assert.match(visible.at(-1)[1], /Worked for 1 min 08 secs/);
  assert.match(visible.at(-1)[1], /package unavailable/);
  assert.match(visible.at(-1)[1], /Previous valid report/);
  assert.ok(visible.at(-1)[1].indexOf('Worked for 1 min 08 secs') < visible.at(-1)[1].indexOf('Market Brief error'));
  assert.equal(context._summaryInFlight, false);
  assert.equal(context._summaryOwner, null);
});

test('structured loader maps ownership, hands off the envelope and stores only the initiating key', async () => {
  const calls = [];
  const envelope = {analysisRequest: {initiatingList: 'myStocks'}};
  const result = {status: 'NORMAL'};
  const saved = {myStocks: 'old mine', customTickers: 'old watch'};
  const visible = [];
  const clearedTimers = [];
  const timerDelays = [];
  const context = {
    MarketBrief: {claudeAnalysis: {
      async requestMarketBriefPackage(options) { calls.push(['package', options]); return envelope; },
      async requestMarketBriefAnalysis(options) { calls.push(['analysis', options]); return result; },
      renderMarketBriefAnalysis(actualResult, actualEnvelope) {
        calls.push(['render', actualResult, actualEnvelope]);
        return '<div>Structured My Stocks</div>';
      }
    }},
    setSumHTML(html, key) { visible.push([key, html]); },
    saveBriefHTML(key, html) { saved[key] = html; visible.push([key, html]); },
    _structuredSummaryProgress: {}, Date: {now() { return 87000; }}, Error,
    setInterval(callback, delay) { timerDelays.push(delay); return 17; }, clearInterval(id) { clearedTimers.push(id); }
  };
  vm.createContext(context);
  vm.runInContext(sourceBetween('function formatStructuredElapsed', 'async function loadSummary'), context);
  await context.loadStructuredSummary('myStocks', 'old mine');
  assert.equal(calls[0][0], 'package');
  assert.equal(calls[0][1].filter, 'US');
  assert.equal(calls[0][1].initiatingList, 'myStocks');
  assert.equal(calls[1][0], 'analysis');
  assert.equal(calls[1][1].envelope, envelope);
  assert.deepEqual(calls[2], ['render', result, envelope]);
  assert.match(saved.myStocks, /^<div class="sumdate"[^>]*>Worked for 0 secs<\/div><div>Structured My Stocks<\/div>$/);
  assert.equal(saved.customTickers, 'old watch');
  assert.match(visible[0][1], /Preparing market package/);
  assert.doesNotMatch(visible[0][1], /old mine/);
  assert.match(saved.myStocks, /Worked for 0 secs/);
  assert.match(visible[1][1], /Generating structured analysis/);
  assert.deepEqual(clearedTimers, [17]);
  assert.deepEqual(timerDelays, [1000]);
  assert.deepEqual(context._structuredSummaryProgress, {});

  envelope.analysisRequest.initiatingList = 'watchlist';
  await context.loadStructuredSummary('customTickers', 'old watch');
  assert.equal(calls[3][0], 'package');
  assert.equal(calls[3][1].filter, 'US');
  assert.equal(calls[3][1].initiatingList, 'watchlist');
  assert.match(saved.customTickers, /Worked for 0 secs/);
  assert.deepEqual(clearedTimers, [17, 17]);
  assert.deepEqual(timerDelays, [1000, 1000]);
});

test('structured elapsed timer formats seconds and minutes and is cleaned up on failure', async () => {
  const visible = [];
  const clearedTimers = [];
  const timerDelays = [];
  const context = {
    MarketBrief: {claudeAnalysis: {
      async requestMarketBriefPackage() { throw new Error('package unavailable'); }
    }},
    _structuredSummaryProgress: {}, Date, Error,
    setSumHTML(html, key) { visible.push([key, html]); },
    saveBriefHTML() { throw new Error('failed generation must not save'); },
    setInterval(callback, delay) { timerDelays.push(delay); return 23; }, clearInterval(id) { clearedTimers.push(id); }
  };
  vm.createContext(context);
  vm.runInContext(sourceBetween('function formatStructuredElapsed', 'async function loadSummary'), context);
  assert.equal(context.formatStructuredElapsed(12), 'Worked for 12 secs');
  assert.equal(context.formatStructuredElapsed(68), 'Worked for 1 min 08 secs');
  assert.equal(context.formatStructuredElapsed(134), 'Worked for 2 mins 14 secs');
  const failure = await context.loadStructuredSummary('myStocks', 'old mine').then(
    () => null,
    error => error
  );
  assert.match(failure.message, /package unavailable/);
  assert.equal(failure.structuredElapsedText, 'Worked for 0 secs');
  assert.match(visible[0][1], /Worked for 0 secs/);
  assert.doesNotMatch(visible[0][1], /old mine/);
  assert.deepEqual(clearedTimers, [23]);
  assert.deepEqual(timerDelays, [1000]);
  assert.deepEqual(context._structuredSummaryProgress, {});
});

test('structured completion remains keyed to its initiating view after navigation', async () => {
  let resolvePackage;
  const packagePromise = new Promise(resolve => { resolvePackage = resolve; });
  const elements = {sumArea: element(), sumAreaD: element(), aiBtnM: element(), aiBtnD: element()};
  const envelope = {analysisRequest: {initiatingList: 'myStocks'}};
  const context = {
    activeTickerList: 'myStocks', currentView: 'MyStocks',
    document: {getElementById(id) { return elements[id] || null; }},
    isDashboardView(name) { return name === 'MyStocks' || name === 'Watchlist'; },
    setAIBtnVisible() {}, Error,
    _structuredSummaryProgress: {}, Date,
    setInterval() { return 1; }, clearInterval() {},
    MarketBrief: {claudeAnalysis: {
      requestMarketBriefPackage() { return packagePromise; },
      async requestMarketBriefAnalysis() { return {status: 'NORMAL'}; },
      renderMarketBriefAnalysis() { return '<div>Mine completed</div>'; }
    }}
  };
  vm.createContext(context);
  vm.runInContext(sourceBetween('function setSumHTML', 'function isAnyMarketOpen'), context);
  vm.runInContext(sourceBetween('function formatStructuredElapsed', 'async function loadSummary'), context);
  context.savedBriefHTML.myStocks = '<div>Old mine retained</div>';
  const generation = context.loadStructuredSummary('myStocks', 'old mine');
  assert.equal(context.savedBriefHTML.myStocks, '<div>Old mine retained</div>');
  assert.match(elements.sumArea.innerHTML, /Preparing market package/);
  assert.doesNotMatch(elements.sumArea.innerHTML, /Old mine retained|old mine/);
  context.activeTickerList = 'customTickers';
  context.currentView = 'Watchlist';
  context.savedBriefHTML.customTickers = '<div>Watch remains</div>';
  context.restoreCurrentBrief();
  resolvePackage(envelope);
  await generation;
  assert.match(context.savedBriefHTML.myStocks, /Worked for 0 secs/);
  assert.match(context.savedBriefHTML.myStocks, /Mine completed/);
  assert.equal(context.savedBriefHTML.customTickers, '<div>Watch remains</div>');
  assert.equal(elements.sumArea.innerHTML, '<div>Watch remains</div>');
  assert.equal(elements.sumAreaD.innerHTML, '<div>Watch remains</div>');
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

test('legacy Market Brief remains on the streaming claude route only', () => {
  const summarySource = sourceBetween('async function loadSummary', '// ── Strip IV preamble');
  assert.match(summarySource, /\/api\/quote\?claude=1/);
  assert.doesNotMatch(summarySource, /claudeAnalysis=1/);
  assert.doesNotMatch(summarySource, /analysisPackage=1/);
  assert.doesNotMatch(sourceBetween('function triggerSummary', '// ── Data'), /claudeAnalysis/);
  assert.doesNotMatch(sourceBetween('function triggerSummary', '// ── Data'), /analysisPackage/);
});
