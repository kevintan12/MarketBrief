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
  'async function loadDash',
  'function setSumHTML'
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

function canonical(price, change, percentChange) {
  return { status: 'ok', displayPrice: price, change, percentChange, name: 'Canonical' };
}

function createHarness({ tickers, requests }) {
  const calls = { render: 0 };
  const context = {
    Promise,
    setTimeout,
    clearTimeout,
    S: { proxyUrl: 'https://example.test' },
    mktData: tickers.map(ticker => ({ sym: ticker.sym, mkt: ticker.mkt, price: 1, chg: 1, pct: 1 })),
    getAllTickers: () => tickers,
    fetchQuote: symbol => requests[symbol],
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
    setGridHTML() {},
    setAIBtnVisible() {},
    startAutoRefresh() {}
  };
  vm.createContext(context);
  vm.runInContext(automaticRefreshSource, context);
  vm.runInContext(manualRefreshSource, context);
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
