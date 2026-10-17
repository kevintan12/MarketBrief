const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { appSource, appDeclarations } = require('./helpers/app-source');
const investmentSource = fs.readFileSync(path.join(__dirname, '..', 'investment.js'), 'utf8');

const briefStateSource = appDeclarations(
  'setSumHTML', 'saveBriefHTML', 'saveGeneratedBrief', 'restoreCurrentBrief',
  'autoRefreshTimer', 'lastSearchSym', 'savedBriefHTML', '_summaryInFlight', '_summaryProgress',
  'savedSearchHTML', 'savedSearchQuery', 'savedInvestHTML'
);
const structuredElapsedSource = appDeclarations('formatStructuredElapsed', 'loadStructuredSummary');

function element() {
  return {innerHTML: '', style: {}, offsetParent: {}, querySelector() { return null; }};
}

test('one shared Market Brief slot is shown on both tabs, however it was generated', () => {
  const elements = {sumArea: element(), sumAreaD: element(), aiBtnM: element(), aiBtnD: element()};
  const context = {
    activeTickerList: 'myStocks', currentView: 'MyStocks',
    document: {getElementById(id) { return elements[id] || null; }},
    isDashboardView(name) { return name === 'MyStocks' || name === 'Watchlist'; },
    setAIBtnVisible() {}
  };
  vm.createContext(context);
  vm.runInContext(briefStateSource, context);

  context.saveBriefHTML('<div>Shared report</div>');
  assert.equal(elements.sumArea.innerHTML, '<div>Shared report</div>');
  assert.equal(elements.sumAreaD.innerHTML, '<div>Shared report</div>');
  assert.equal(context.savedBriefHTML, '<div>Shared report</div>');

  // Switching tabs never clears it and never re-renders a different copy.
  context.activeTickerList = 'customTickers';
  context.currentView = 'Watchlist';
  context.restoreCurrentBrief();
  assert.equal(elements.sumArea.innerHTML, '<div>Shared report</div>');
  assert.equal(elements.sumAreaD.innerHTML, '<div>Shared report</div>');
});

test('adding or removing a stock after a brief is made does not touch the saved brief or add any notice', () => {
  const elements = {sumArea: element(), sumAreaD: element(), aiBtnM: element(), aiBtnD: element()};
  const context = {
    activeTickerList: 'myStocks', currentView: 'MyStocks',
    S: {myStocks: {US: [{sym: 'AAPL'}], SG: [], HK: []}, customTickers: {US: [], SG: [], HK: []}},
    document: {getElementById(id) { return elements[id] || null; }},
    isDashboardView(name) { return name === 'MyStocks' || name === 'Watchlist'; },
    setAIBtnVisible() {}
  };
  vm.createContext(context);
  vm.runInContext(briefStateSource, context);

  context.saveGeneratedBrief('<div>My report</div>');
  context.S.myStocks.US.push({sym: 'NVDA'});
  context.S.myStocks.US.splice(0, 1);
  context.restoreCurrentBrief();
  assert.equal(elements.sumArea.innerHTML, '<div>My report</div>');
  assert.doesNotMatch(elements.sumArea.innerHTML, /List changed/);
  assert.equal(context.savedBriefHTML, '<div>My report</div>');
});

test('triggerSummary captures the initiating list, filter and data snapshot, and permits one request at a time', () => {
  const calls = [];
  const context = {
    activeTickerList: 'myStocks', curFilter: 'SG',
    mktData: [{sym: '^STI', mkt: 'SG'}, {sym: 'D05.SI', mkt: 'SG'}],
    S: {proxyUrl: 'https://example.test'}, savedBriefHTML: 'old brief',
    _summaryInFlight: false, Object,
    setSumHTML() {}, setAIBtnVisible() {},
    loadSummary(...args) { calls.push(args); return Promise.resolve(); }
  };
  vm.createContext(context);
  vm.runInContext(appDeclarations('triggerSummary'), context);
  context.triggerSummary();
  context.mktData[1].sym = 'CHANGED';
  context.activeTickerList = 'customTickers';
  context.triggerSummary();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'myStocks');
  assert.equal(calls[0][1], 'SG');
  assert.equal(calls[0][2][1].sym, 'D05.SI');
  assert.equal(context.savedBriefHTML, 'old brief');
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
      savedBriefHTML: 'shared brief',
      _summaryInFlight: false, Object,
      setSumHTML() {}, setAIBtnVisible() {}, esc(value) { return String(value); },
      loadStructuredSummary(...args) { calls.push(['structured', ...args]); return pending; },
      loadSummary(...args) { calls.push(['legacy', ...args]); return pending; }
    };
    vm.createContext(context);
    vm.runInContext(appDeclarations('triggerSummary'), context);
    context.triggerSummary();
    context.triggerSummary();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], filter === 'US' ? 'structured' : 'legacy');
    assert.equal(calls[0][1], 'customTickers');
    if (filter === 'US') {
      assert.equal(calls[0][2], 'shared brief');
    } else {
      assert.equal(calls[0][2], filter);
    }
    finish();
    await pending;
    await Promise.resolve();
  }
});

test('failed US regeneration preserves the previous shared report', async () => {
  const visible = [];
  const context = {
    activeTickerList: 'myStocks', curFilter: 'US', mktData: [{sym: 'AAPL', mkt: 'US'}],
    S: {proxyUrl: 'https://example.test'},
    savedBriefHTML: '<div>Previous valid report</div>',
    _summaryInFlight: false, Object,
    setSumHTML(html) { visible.push(html); }, setAIBtnVisible() {},
    esc(value) { return String(value); },
    loadStructuredSummary() {
      const error = new Error('package unavailable');
      error.structuredElapsedText = 'Worked for 1 min 08 secs';
      return Promise.reject(error);
    },
    loadSummary() { throw new Error('legacy path must not run'); }
  };
  vm.createContext(context);
  vm.runInContext(appDeclarations('triggerSummary'), context);
  context.triggerSummary();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(context.savedBriefHTML, '<div>Previous valid report</div>');
  assert.match(visible.at(-1), /Worked for 1 min 08 secs/);
  assert.match(visible.at(-1), /package unavailable/);
  assert.match(visible.at(-1), /Previous valid report/);
  assert.ok(visible.at(-1).indexOf('Worked for 1 min 08 secs') < visible.at(-1).indexOf('Market Brief error'));
  assert.equal(context._summaryInFlight, false);
});

test('structured loader hands off the envelope and saves to the one shared brief regardless of which tab started it', async () => {
  const calls = [];
  const ids = ['123e4567-e89b-42d3-a456-426614174000', '123e4567-e89b-42d3-a456-426614174001'];
  const envelope = {analysisRequest: {initiatingList: 'myStocks'}};
  const result = {status: 'NORMAL'};
  let saved = 'old brief';
  const visible = [];
  const clearedTimers = [];
  const timerDelays = [];
  const context = {
    MarketBrief: {claudeAnalysis: {
      async requestMarketBriefPackage(options) { calls.push(['package', options]); return envelope; },
      async requestMarketBriefAnalysis(options) { calls.push(['analysis', options]); return result; },
      renderMarketBriefAnalysis(actualResult, actualEnvelope) {
        calls.push(['render', actualResult, actualEnvelope]);
        return '<div>Structured report</div>';
      }
    }},
    setSumHTML(html) { visible.push(html); },
    saveBriefHTML(html) { saved = html; visible.push(html); },
    saveGeneratedBrief(html) { saved = html; visible.push(html); },
    _summaryProgress: '', Date: {now() { return 87000; }}, Error,
    crypto: {randomUUID() { return ids.shift(); }},
    setInterval(callback, delay) { timerDelays.push(delay); return 17; }, clearInterval(id) { clearedTimers.push(id); }
  };
  vm.createContext(context);
  vm.runInContext(structuredElapsedSource, context);
  await context.loadStructuredSummary('myStocks', 'old brief');
  assert.equal(calls[0][0], 'package');
  assert.equal(calls[0][1].filter, 'US');
  assert.equal(calls[0][1].initiatingList, 'myStocks');
  assert.equal(calls[0][1].generationId, '123e4567-e89b-42d3-a456-426614174000');
  assert.equal(calls[1][0], 'analysis');
  assert.equal(calls[1][1].envelope, envelope);
  assert.equal(calls[1][1].generationId, calls[0][1].generationId);
  assert.deepEqual(calls[2], ['render', result, envelope]);
  assert.match(saved, /^<div class="sumdate"[^>]*>Worked for 0 secs<\/div><div>Structured report<\/div>$/);
  assert.match(visible[0], /Preparing market package/);
  assert.doesNotMatch(visible[0], /old brief/);
  assert.match(visible[1], /Generating structured analysis/);
  assert.deepEqual(clearedTimers, [17]);
  assert.deepEqual(timerDelays, [1000]);
  assert.equal(context._summaryProgress, '');

  // Generating from the Watchlist tab lands in the same shared slot.
  envelope.analysisRequest.initiatingList = 'watchlist';
  await context.loadStructuredSummary('customTickers', saved);
  assert.equal(calls[3][0], 'package');
  assert.equal(calls[3][1].filter, 'US');
  assert.equal(calls[3][1].initiatingList, 'watchlist');
  assert.equal(calls[3][1].generationId, '123e4567-e89b-42d3-a456-426614174001');
  assert.equal(calls[4][1].generationId, calls[3][1].generationId);
  assert.notEqual(calls[3][1].generationId, calls[0][1].generationId);
  assert.match(saved, /Worked for 0 secs/);
  assert.deepEqual(clearedTimers, [17, 17]);
  assert.deepEqual(timerDelays, [1000, 1000]);
});

test('user-facing timestamps follow S.tz without changing exchange session logic', () => {
  const context = {S: {tz: 'Asia/Singapore'}, Intl, Date};
  vm.createContext(context);
  vm.runInContext(appDeclarations('getUserTimeZone', 'formatUserTime', 'formatUserDateTime'), context);
  const instant = '2026-09-21T14:30:00.000Z';
  const singapore = context.formatUserDateTime(instant);
  context.S.tz = 'America/New_York';
  const newYork = context.formatUserDateTime(instant);
  assert.notEqual(newYork, singapore);
  assert.match(singapore, /2026/);
  assert.match(newYork, /2026/);

  const summarySource = appDeclarations('loadSummary');
  const tickerSource = appDeclarations('genTickerAI');
  const pdfSource = appDeclarations('exportToPDF', 'genInvestAI');
  assert.match(summarySource, /formatUserTime\(summaryNow\)/);
  assert.match(summarySource, /formatUserTime\(new Date\(\)\)/);
  assert.match(tickerSource, /formatUserDateTime\(now\)/);
  assert.match(pdfSource, /formatUserDateTime\(now\)/);
  assert.match(investmentSource, /formatUserDateTime\(report\.generatedAt\)/);
  assert.match(tickerSource, /mktTz=.*Asia\/Singapore.*Asia\/Hong_Kong.*America\/New_York/);
  assert.match(appSource, /function getPrevDay\(sym\)[\s\S]*?timeZone:tz/);
});

test('structured loader omits correlation when UUID generation is unavailable or invalid', async () => {
  for (const cryptoValue of [undefined, {randomUUID() { return 'invalid'; }}, {randomUUID() { throw new Error('unavailable'); }}]) {
    const calls = [];
    const envelope = {analysisRequest: {initiatingList: 'myStocks'}};
    const context = {
      crypto: cryptoValue, Date: {now() { return 0; }}, Error,
      _summaryProgress: '', setInterval() { return 1; }, clearInterval() {},
      setSumHTML() {}, saveBriefHTML() {}, saveGeneratedBrief() {},
      MarketBrief: {claudeAnalysis: {
        async requestMarketBriefPackage(options) { calls.push(options); return envelope; },
        async requestMarketBriefAnalysis(options) { calls.push(options); return {status: 'NORMAL'}; },
        renderMarketBriefAnalysis() { return '<div>Report</div>'; }
      }}
    };
    vm.createContext(context);
    vm.runInContext(structuredElapsedSource, context);
    await context.loadStructuredSummary('myStocks', 'old');
    assert.equal(calls.length, 2);
    assert.equal(Object.hasOwn(calls[0], 'generationId'), false);
    assert.equal(Object.hasOwn(calls[1], 'generationId'), false);
    assert.equal(calls[1].envelope, envelope);
  }
});

test('structured elapsed timer formats seconds and minutes and is cleaned up on failure', async () => {
  const visible = [];
  const clearedTimers = [];
  const timerDelays = [];
  const context = {
    MarketBrief: {claudeAnalysis: {
      async requestMarketBriefPackage() { throw new Error('package unavailable'); }
    }},
    _summaryProgress: '', Date, Error,
    setSumHTML(html) { visible.push(html); },
    saveBriefHTML() { throw new Error('failed generation must not save'); },
    setInterval(callback, delay) { timerDelays.push(delay); return 23; }, clearInterval(id) { clearedTimers.push(id); }
  };
  vm.createContext(context);
  vm.runInContext(structuredElapsedSource, context);
  assert.equal(context.formatStructuredElapsed(12), 'Worked for 12 secs');
  assert.equal(context.formatStructuredElapsed(68), 'Worked for 1 min 08 secs');
  assert.equal(context.formatStructuredElapsed(134), 'Worked for 2 mins 14 secs');
  const failure = await context.loadStructuredSummary('myStocks', 'old brief').then(
    () => null,
    error => error
  );
  assert.match(failure.message, /package unavailable/);
  assert.equal(failure.structuredElapsedText, 'Worked for 0 secs');
  assert.match(visible[0], /Worked for 0 secs/);
  assert.doesNotMatch(visible[0], /old brief/);
  assert.deepEqual(clearedTimers, [23]);
  assert.deepEqual(timerDelays, [1000]);
  assert.equal(context._summaryProgress, '');
});

test('switching tabs mid-generation shows the same in-progress state, not the old shared report, for both US structured and legacy routes', async () => {
  for (const scenario of [
    {label: 'US structured', filter: 'US'},
    {label: 'legacy SG/HK/ALL', filter: 'SG'}
  ]) {
    const elements = {sumArea: element(), sumAreaD: element(), aiBtnM: element(), aiBtnD: element()};
    let resolvePackage, resolveFetch;
    const context = {
      activeTickerList: 'myStocks', currentView: 'MyStocks', curFilter: scenario.filter,
      mktData: [{sym: scenario.filter === 'US' ? 'AAPL' : '^STI', mkt: scenario.filter === 'US' ? 'US' : 'SG'}],
      S: {proxyUrl: 'https://example.test', style: 'detailed'},
      FIXED_SYMS: {'^DJI': 1, '^STI': 1, '^HSI': 1},
      document: {getElementById(id) { return elements[id] || null; }},
      isDashboardView(name) { return name === 'MyStocks' || name === 'Watchlist'; },
      setAIBtnVisible() {}, Error, Object, Promise, Date, Intl, TextDecoder, JSON, console: {log() {}},
      savedBriefHTML: '<div>Old shared report</div>',
      _summaryInFlight: false, _summaryProgress: '',
      esc(value) { return String(value); }, cleanAIText(value) { return value; }, formatSummary(value) { return value; },
      formatUserTime() { return '12:00 GMT+8'; },
      fmt(value) { return String(value); }, fmtP(value) { return String(value); }, fmtD(value) { return String(value); },
      MarketBrief: {
        marketData: {
          getSessionState() { return {regularOpen: false}; },
          getLatestCompletedRegularSessionDate() { return '2026-09-03'; }
        },
        claudeAnalysis: {
          requestMarketBriefPackage() { return new Promise(resolve => { resolvePackage = resolve; }); },
          async requestMarketBriefAnalysis() { return {status: 'NORMAL'}; },
          renderMarketBriefAnalysis() { return '<div>New shared report</div>'; }
        }
      },
      window: {}, fetchQuote() { return Promise.resolve({price: 1, pct: 0, chg: 0}); },
      setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
      fetch() {
        return new Promise(resolve => {
          resolveFetch = resolve;
        });
      }
    };
    vm.createContext(context);
    vm.runInContext(briefStateSource, context);
    vm.runInContext(structuredElapsedSource, context);
    vm.runInContext(appDeclarations('loadSummary'), context);
    vm.runInContext(appDeclarations('triggerSummary'), context);

    context.triggerSummary();
    assert.equal(context._summaryInFlight, true, scenario.label + ': generation starts');

    // Switch to the other tab mid-generation.
    context.activeTickerList = 'customTickers';
    context.currentView = 'Watchlist';
    context.restoreCurrentBrief();
    assert.doesNotMatch(elements.sumArea.innerHTML, /Old shared report/, scenario.label + ': other tab must not show the stale report while generating');
    assert.notEqual(elements.sumArea.innerHTML, '', scenario.label + ': other tab shows the in-progress state');

    // Clicking Generate again from the other tab must not start a second request.
    context.triggerSummary();

    if (scenario.filter === 'US') {
      resolvePackage({analysisRequest: {initiatingList: 'myStocks'}});
    } else {
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
      resolveFetch({
        ok: true, status: 200,
        body: {getReader() { return {read() { return Promise.resolve({done: true}); }}; }}
      });
    }
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(context._summaryInFlight, false, scenario.label + ': generation finished');
  }
});

async function capturePrompt(initiatingTab, filter, summaryData, sessionState) {
  let prompt = '';
  const context = {
    Promise, Date, Intl, TextDecoder, JSON,
    activeTickerList: initiatingTab, currentView: initiatingTab === 'myStocks' ? 'MyStocks' : 'Watchlist',
    _summaryInFlight: true, _sumInFlight: true, _summaryProgress: '',
    S: {proxyUrl: 'https://example.test', style: 'bullets'},
    FIXED_SYMS: {'^DJI': 1, '^STI': 1, '^HSI': 1},
    MarketBrief: {marketData: {
      getSessionState() { return sessionState || {regularOpen: false}; },
      getLatestCompletedRegularSessionDate() { return '2026-09-03'; }
    }},
    window: {}, document: {getElementById() { return null; }},
    isDashboardView(name) { return name === 'MyStocks' || name === 'Watchlist'; },
    setSumHTML() {}, saveBriefHTML() {}, setAIBtnVisible() {},
    saveGeneratedBrief() {},
    formatUserTime() { return '12:00 GMT+8'; },
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
  vm.runInContext(appDeclarations('loadSummary'), context);
  await context.loadSummary(initiatingTab, filter, summaryData);
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

test('one shared brief rule holds from both tabs across every market state (Pre-market, Trading, After-hours, Closed, Weekend, Holiday)', async () => {
  const states = {
    'Pre-market': {regularOpen: false, session: 'PRE'},
    'Trading': {regularOpen: true, session: 'REGULAR'},
    'After-hours': {regularOpen: false, session: 'POST'},
    'Closed': {regularOpen: false, session: 'CLOSED'},
    'Weekend': {regularOpen: false, session: 'WEEKEND'},
    'Holiday': {regularOpen: false, session: 'HOLIDAY'}
  };
  for (const [label, sessionState] of Object.entries(states)) {
    for (const tab of ['myStocks', 'customTickers']) {
      const prompt = await capturePrompt(tab, 'SG', [
        {sym: '^STI', name: 'STI', mkt: 'SG', price: 1, chg: 0, pct: 0}
      ], sessionState);
      assert.ok(prompt.length > 0, label + '/' + tab + ': prompt is generated regardless of which tab or state');
    }
  }
});

test('streaming respects the one in-flight generation and PDF selection remains tied to the current view', () => {
  const summarySource = appDeclarations('loadSummary');
  const pdfSource = appDeclarations('exportToPDF', 'genInvestAI');
  assert.doesNotMatch(summarySource, /_summaryOwner/);
  assert.doesNotMatch(summarySource, /savedBriefHTML\[.*\]/);
  assert.match(summarySource, /saveGeneratedBrief\(briefPrefix\+finalRendered\+briefSuffix\)/);
  assert.match(pdfSource, /contentEl=\(b&&b\.offsetParent!==null\)\?b:a/);
});

test('legacy Market Brief remains on the streaming claude route only', () => {
  const summarySource = appDeclarations('loadSummary');
  assert.match(summarySource, /\/api\/quote\?claude=1/);
  assert.doesNotMatch(summarySource, /claudeAnalysis=1/);
  assert.doesNotMatch(summarySource, /analysisPackage=1/);
  assert.doesNotMatch(appDeclarations('triggerSummary'), /claudeAnalysis/);
  assert.doesNotMatch(appDeclarations('triggerSummary'), /analysisPackage/);
});

test('legacy Market Brief puts sumStream inside the bounded report body', () => {
  const summarySource = appDeclarations('loadSummary');
  const prefixStart = summarySource.indexOf('var briefPrefix=');
  const prefixEnd = summarySource.indexOf('var briefSuffix=', prefixStart);
  assert.ok(prefixStart >= 0 && prefixEnd > prefixStart);
  const markup = summarySource.slice(prefixStart, prefixEnd);
  assert.ok(markup.indexOf('class="sumhdr"') < markup.indexOf('class="sumbody"'));
  assert.ok(markup.indexOf('class="sumbody"') < markup.indexOf('id="sumStream"'));
  assert.match(summarySource, /var briefSuffix='<\/div><\/div><\/div>'/);
});

test('the list-changed notice and its supporting code are gone', () => {
  assert.doesNotMatch(appSource, /List changed since this Market Brief was generated/);
  assert.doesNotMatch(appSource, /function presentSavedBrief/);
  assert.doesNotMatch(appSource, /function isSavedBriefStale/);
  assert.doesNotMatch(appSource, /function getBriefListFingerprint/);
  assert.doesNotMatch(appSource, /savedBriefState/);
});
