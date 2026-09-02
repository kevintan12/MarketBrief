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

const automaticRefreshSource = sourceBetween(
  'function getDashboardPollingMarkets',
  'async function silentRefreshTicker'
);
const manualRefreshSource = sourceBetween(
  'var _dashboardQuoteGeneration',
  'function setSumHTML'
);
const refreshLifecycleSource = sourceBetween(
  'var DASHBOARD_REFRESH_BATCH_TIMEOUT_MS',
  '// ── AI Summary'
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function requestSequence(...promises) {
  let index = 0;
  return () => promises[index++];
}

function canonical(price, change, percentChange, providerTimestamp = null, providerTimestampSource = null) {
  return { status: 'ok', displayPrice: price, change, percentChange, providerTimestamp, providerTimestampSource, name: 'Canonical' };
}

function createHarness({ tickers, requests }) {
  const calls = { render: 0 };
  const context = {
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    S: { proxyUrl: 'https://example.test' },
    mktData: tickers.map(ticker => ({ sym: ticker.sym, mkt: ticker.mkt, price: 1, chg: 1, pct: 1 })),
    getAllTickers: () => tickers,
    fetchQuote: symbol => typeof requests[symbol] === 'function' ? requests[symbol]() : requests[symbol],
    MarketBrief: {
      marketData: {
        normalizeQuote: raw => raw.canonical,
        getSessionState: () => ({ quoteExpectedToMove: false }),
        shouldPollSearchQuote: () => false
      }
    },
    calls,
    renderIndices() { calls.render++; },
    updateLiveIndicator() {},
    refreshSearchSessionPresentation() {},
    getSearchPollingCadence() { return 0; },
    silentRefreshTicker() { return Promise.resolve(); },
    setGridHTML() {},
    setAIBtnVisible() {},
    startAutoRefresh() {}
  };
  vm.createContext(context);
  vm.runInContext(automaticRefreshSource, context);
  vm.runInContext(manualRefreshSource, context);
  vm.runInContext(refreshLifecycleSource, context);
  context.startAutoRefresh = function() {};
  return context;
}

function waitForRender() {
  return new Promise(resolve => setTimeout(resolve, 10));
}

test('successful automatic quote is applied before another symbol settles', async () => {
  const a = deferred();
  const b = deferred();
  const context = createHarness({
    tickers: [{ sym: 'A', mkt: 'SG' }, { sym: 'B', mkt: 'SG' }],
    requests: { A: a.promise, B: b.promise }
  });

  const refresh = context.silentRefreshDash({ any: true, SG: true });
  a.resolve({ canonical: canonical(20, 3, 17.65) });
  await waitForRender();

  assert.deepEqual(
    { price: context.mktData[0].price, chg: context.mktData[0].chg, pct: context.mktData[0].pct },
    { price: 20, chg: 3, pct: 17.65 }
  );
  assert.equal(context.calls.render, 1);

  let batchSettled = false;
  refresh.then(() => { batchSettled = true; });
  await Promise.resolve();
  assert.equal(batchSettled, false);

  b.resolve({ canonical: canonical(30, 4, 15.38) });
  await refresh;
});

test('STI final quote is applied while another SG ticker remains pending', async () => {
  const sti = deferred();
  const other = deferred();
  const context = createHarness({
    tickers: [{ sym: '^STI', mkt: 'SG' }, { sym: 'D05.SI', mkt: 'SG' }],
    requests: { '^STI': sti.promise, 'D05.SI': other.promise }
  });

  const refresh = context.silentRefreshDash({ any: true, SG: true });
  sti.resolve({ canonical: canonical(5744.11, 33.74, 0.591) });
  await waitForRender();

  const applied = context.mktData.find(item => item.sym === '^STI');
  assert.deepEqual(
    { price: applied.price, chg: applied.chg, pct: applied.pct },
    { price: 5744.11, chg: 33.74, pct: 0.591 }
  );
  assert.equal(context.calls.render, 1);

  other.resolve({ canonical: canonical(10, 1, 11.11) });
  await refresh;
});

test('one rejected ticker does not prevent another successful quote being applied', async () => {
  const good = deferred();
  const bad = deferred();
  const context = createHarness({
    tickers: [{ sym: 'GOOD', mkt: 'SG' }, { sym: 'BAD', mkt: 'SG' }],
    requests: { GOOD: good.promise, BAD: bad.promise }
  });

  const refresh = context.silentRefreshDash({ any: true, SG: true });
  bad.reject(new Error('provider failure'));
  good.resolve({ canonical: canonical(42, -2, -4.55) });
  await refresh;
  await waitForRender();

  assert.deepEqual(
    { price: context.mktData[0].price, chg: context.mktData[0].chg, pct: context.mktData[0].pct },
    { price: 42, chg: -2, pct: -4.55 }
  );
});

test('permanently pending batch releases refresh gate after timeout and permits a later batch', async () => {
  const never = new Promise(() => {});
  const context = createHarness({ tickers: [], requests: {} });
  let batchCalls = 0;
  context.DASHBOARD_REFRESH_BATCH_TIMEOUT_MS = 20;
  context.silentRefreshDash = () => {
    batchCalls++;
    return never;
  };

  context.runDashboardRefreshBatch({ any: true, SG: true });
  assert.equal(context._refreshInFlight, true);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(context._refreshInFlight, false);

  context.runDashboardRefreshBatch({ any: true, SG: true });
  assert.equal(batchCalls, 2);
  assert.equal(context._refreshInFlight, true);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(context._refreshInFlight, false);
});

test('successful quote applied before timeout remains applied after gate release', async () => {
  const sti = deferred();
  const pending = deferred();
  const context = createHarness({
    tickers: [{ sym: '^STI', mkt: 'SG' }, { sym: 'SLOW', mkt: 'SG' }],
    requests: { '^STI': sti.promise, SLOW: pending.promise }
  });
  context.DASHBOARD_REFRESH_BATCH_TIMEOUT_MS = 20;

  context.runDashboardRefreshBatch({ any: true, SG: true });
  sti.resolve({ canonical: canonical(5744.11, 33.74, 0.591) });
  await waitForRender();
  assert.equal(context.mktData[0].price, 5744.11);

  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(context._refreshInFlight, false);
  assert.deepEqual(
    { price: context.mktData[0].price, chg: context.mktData[0].chg, pct: context.mktData[0].pct },
    { price: 5744.11, chg: 33.74, pct: 0.591 }
  );

  pending.resolve({ canonical: canonical(10, 1, 11.11) });
});

test('normally settled batch releases refresh gate before timeout', async () => {
  const context = createHarness({
    tickers: [{ sym: '^STI', mkt: 'SG' }],
    requests: { '^STI': Promise.resolve({ canonical: canonical(5744.11, 33.74, 0.591) }) }
  });
  context.DASHBOARD_REFRESH_BATCH_TIMEOUT_MS = 1000;

  context.runDashboardRefreshBatch({ any: true, SG: true });
  assert.equal(context._refreshInFlight, true);
  await waitForRender();
  assert.equal(context._refreshInFlight, false);
  assert.equal(context.mktData[0].price, 5744.11);
});

test('request resolving after timeout still applies its successful quote', async () => {
  const late = deferred();
  const context = createHarness({
    tickers: [{ sym: '^STI', mkt: 'SG' }],
    requests: { '^STI': late.promise }
  });
  context.DASHBOARD_REFRESH_BATCH_TIMEOUT_MS = 20;

  context.runDashboardRefreshBatch({ any: true, SG: true });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(context._refreshInFlight, false);
  assert.equal(context.mktData[0].price, 1);

  late.resolve({ canonical: canonical(5744.11, 33.74, 0.591) });
  await waitForRender();
  assert.deepEqual(
    { price: context.mktData[0].price, chg: context.mktData[0].chg, pct: context.mktData[0].pct },
    { price: 5744.11, chg: 33.74, pct: 0.591 }
  );
});

test('older automatic response cannot overwrite a newer automatic response', async () => {
  const older = deferred();
  const newer = deferred();
  const context = createHarness({
    tickers: [{ sym: '^STI', mkt: 'SG' }],
    requests: { '^STI': requestSequence(older.promise, newer.promise) }
  });

  const first = context.silentRefreshDash({ any: true, SG: true });
  const second = context.silentRefreshDash({ any: true, SG: true });
  newer.resolve({ canonical: canonical(200, 20, 11.11, 2000, 'regularMarketTime') });
  await waitForRender();
  older.resolve({ canonical: canonical(100, 10, 11.11, 1000, 'regularMarketTime') });
  await Promise.all([first, second]);
  await waitForRender();

  assert.deepEqual(
    { price: context.mktData[0].price, chg: context.mktData[0].chg, pct: context.mktData[0].pct },
    { price: 200, chg: 20, pct: 11.11 }
  );
});

test('older automatic response cannot overwrite a newer manual Refresh result', async () => {
  const automatic = deferred();
  const manual = deferred();
  const context = createHarness({
    tickers: [{ sym: '^STI', name: 'STI', sub: 'SG', flag: 'SG', mkt: 'SG' }],
    requests: { '^STI': requestSequence(automatic.promise, manual.promise) }
  });

  const automaticRefresh = context.silentRefreshDash({ any: true, SG: true });
  const manualRefresh = context.loadDash();
  manual.resolve({ canonical: canonical(200, 20, 11.11, 2000, 'regularMarketTime') });
  await manualRefresh;
  automatic.resolve({ canonical: canonical(100, 10, 11.11, 1000, 'regularMarketTime') });
  await automaticRefresh;
  await waitForRender();

  assert.deepEqual(
    { price: context.mktData[0].price, chg: context.mktData[0].chg, pct: context.mktData[0].pct },
    { price: 200, chg: 20, pct: 11.11 }
  );
});

test('newer automatic response applies after an older manual Refresh result', async () => {
  const manual = deferred();
  const automatic = deferred();
  const context = createHarness({
    tickers: [{ sym: '^STI', name: 'STI', sub: 'SG', flag: 'SG', mkt: 'SG' }],
    requests: { '^STI': requestSequence(manual.promise, automatic.promise) }
  });

  const manualRefresh = context.loadDash();
  manual.resolve({ canonical: canonical(100, 10, 11.11, 1000, 'regularMarketTime') });
  await manualRefresh;
  const automaticRefresh = context.silentRefreshDash({ any: true, SG: true });
  automatic.resolve({ canonical: canonical(200, 20, 11.11, 2000, 'regularMarketTime') });
  await automaticRefresh;
  await waitForRender();

  assert.deepEqual(
    { price: context.mktData[0].price, chg: context.mktData[0].chg, pct: context.mktData[0].pct },
    { price: 200, chg: 20, pct: 11.11 }
  );
});

test('equal provider timestamps deterministically preserve the newer request', async () => {
  const older = deferred();
  const newer = deferred();
  const context = createHarness({
    tickers: [{ sym: '^STI', mkt: 'SG' }],
    requests: { '^STI': requestSequence(older.promise, newer.promise) }
  });

  const first = context.silentRefreshDash({ any: true, SG: true });
  const second = context.silentRefreshDash({ any: true, SG: true });
  newer.resolve({ canonical: canonical(200, 20, 11.11, 2000, 'regularMarketTime') });
  await waitForRender();
  older.resolve({ canonical: canonical(100, 10, 11.11, 2000, 'regularMarketTime') });
  await Promise.all([first, second]);
  await waitForRender();

  assert.equal(context.mktData[0].price, 200);
});

test('freshness ordering is independent per symbol', async () => {
  const olderA = deferred();
  const newerA = deferred();
  const validB = deferred();
  const laterB = deferred();
  const context = createHarness({
    tickers: [{ sym: 'A', mkt: 'SG' }, { sym: 'B', mkt: 'SG' }],
    requests: {
      A: requestSequence(olderA.promise, newerA.promise),
      B: requestSequence(validB.promise, laterB.promise)
    }
  });

  const first = context.silentRefreshDash({ any: true, SG: true });
  const second = context.silentRefreshDash({ any: true, SG: true });
  newerA.resolve({ canonical: canonical(200, 20, 11.11, 2000, 'regularMarketTime') });
  validB.resolve({ canonical: canonical(300, 30, 11.11, 3000, 'regularMarketTime') });
  laterB.resolve({ canonical: canonical(400, 40, 11.11, 4000, 'regularMarketTime') });
  await waitForRender();
  olderA.resolve({ canonical: canonical(100, 10, 11.11, 1000, 'regularMarketTime') });
  await Promise.all([first, second]);
  await waitForRender();

  assert.equal(context.mktData.find(item => item.sym === 'A').price, 200);
  assert.equal(context.mktData.find(item => item.sym === 'B').price, 400);
});

test('late response after batch timeout cannot regress a newer result', async () => {
  const older = deferred();
  const newer = deferred();
  const context = createHarness({
    tickers: [{ sym: '^STI', mkt: 'SG' }],
    requests: { '^STI': requestSequence(older.promise, newer.promise) }
  });
  context.DASHBOARD_REFRESH_BATCH_TIMEOUT_MS = 20;

  context.runDashboardRefreshBatch({ any: true, SG: true });
  await new Promise(resolve => setTimeout(resolve, 30));
  context.runDashboardRefreshBatch({ any: true, SG: true });
  newer.resolve({ canonical: canonical(200, 20, 11.11, 2000, 'regularMarketTime') });
  await waitForRender();
  older.resolve({ canonical: canonical(100, 10, 11.11, 1000, 'regularMarketTime') });
  await waitForRender();

  assert.deepEqual(
    { price: context.mktData[0].price, chg: context.mktData[0].chg, pct: context.mktData[0].pct },
    { price: 200, chg: 20, pct: 11.11 }
  );
});

test('Dashboard polling market cadence remains two ticks active and five ticks grace', () => {
  const context = createHarness({ tickers: [], requests: {} });
  context.MarketBrief.marketData.getSessionState = market => ({ quoteExpectedToMove: market === 'US' });
  context.MarketBrief.marketData.shouldPollSearchQuote = market => market === 'SG';

  assert.deepEqual({ ...context.getDashboardPollingMarkets(undefined, 2) }, { any: true, US: true, SG: false, HK: false });
  assert.deepEqual({ ...context.getDashboardPollingMarkets(undefined, 5) }, { any: true, US: false, SG: true, HK: false });
  assert.deepEqual({ ...context.getDashboardPollingMarkets(undefined, 10) }, { any: true, US: true, SG: true, HK: false });
});

test('manual Dashboard Refresh still rebuilds the complete market dataset', async () => {
  const tickers = [{ sym: '^STI', name: 'STI', sub: 'SG', flag: 'SG', mkt: 'SG' }];
  const context = createHarness({
    tickers,
    requests: { '^STI': Promise.resolve({ canonical: canonical(5744.11, 33.74, 0.591) }) }
  });
  context.mktData.push({ sym: 'OLD', mkt: 'US', price: 1, chg: 1, pct: 1 });

  await context.loadDash();

  assert.equal(context.mktData.length, 1);
  assert.deepEqual(
    { sym: context.mktData[0].sym, price: context.mktData[0].price, chg: context.mktData[0].chg, pct: context.mktData[0].pct },
    { sym: '^STI', price: 5744.11, chg: 33.74, pct: 0.591 }
  );
  assert.equal(context.calls.render, 1);
});
