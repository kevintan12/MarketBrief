const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../market-data.js');

const normalizeQuote = global.window.MarketBrief.marketData.normalizeQuote;

function rawQuote(symbol, marketState, providerOverrides, rawOverrides) {
  return {
    symbol,
    name: symbol,
    price: 999,
    prev: 998,
    priceSource: 'latestDailyClose',
    provider: {
      marketState,
      regularMarketPrice: 110,
      regularMarketPreviousClose: 100,
      regularMarketTime: 1767808800,
      latestDailyClose: 110,
      latestDailyCloseTime: 1767808800,
      previousDailyClose: 100,
      dailyClosePairHasGap: false,
      immediatePreviousClose: null,
      immediatePreviousCloseTime: null,
      immediatePreviousCloseSource: null,
      ...providerOverrides
    },
    ...rawOverrides
  };
}

test('normal completed daily pair is unchanged', () => {
  const quote = normalizeQuote(rawQuote('0700.HK', 'CLOSED'), '0700.HK');
  assert.equal(quote.displayPrice, 110);
  assert.equal(quote.referencePrice, 100);
  assert.equal(quote.change, 10);
  assert.equal(quote.percentChange, 10);
});

test('equal completed closes produce zero change', () => {
  const quote = normalizeQuote(rawQuote('D05.SI', 'CLOSED', {
    latestDailyClose: 100,
    previousDailyClose: 100
  }), 'D05.SI');
  assert.equal(quote.referencePrice, 100);
  assert.equal(quote.change, 0);
  assert.equal(quote.percentChange, 0);
});

test('immediate previous close without a timestamp remains unavailable', () => {
  const quote = normalizeQuote(rawQuote('^HSI', 'CLOSED', {
    latestDailyClose: 25329.73046875,
    previousDailyClose: 25566.990234375,
    dailyClosePairHasGap: false,
    immediatePreviousClose: 25584.80,
    immediatePreviousCloseSource: 'yahooChart5d'
  }), '^HSI');
  assert.equal(quote.displayPrice, 25329.73046875);
  assert.equal(quote.referencePrice, 25566.990234375);
  assert.ok(Math.abs(quote.change - (25329.73046875 - 25566.990234375)) < 1e-9);
});

test('STI trailing-null completed session uses verified immediate previous close', () => {
  const quote = normalizeQuote(rawQuote('^STI', null, {
    regularMarketPrice: 5759.46,
    regularMarketPreviousClose: null,
    regularMarketTime: 1788398433,
    latestDailyClose: 5710.3701171875,
    latestDailyCloseTime: 1788224400,
    previousDailyClose: 5755.35986328125,
    dailyClosePairHasGap: false,
    immediatePreviousClose: 5744.11,
    immediatePreviousCloseTime: 1788310800,
    immediatePreviousCloseSource: 'yahooChart5dQuery2',
    exchangeTimezoneName: 'Asia/Singapore'
  }), '^STI');
  assert.equal(quote.displayPrice, 5759.46);
  assert.equal(quote.referencePrice, 5744.11);
  assert.ok(Math.abs(quote.change - 15.35) < 1e-9);
  assert.ok(Math.abs(quote.percentChange - (15.35 / 5744.11 * 100)) < 1e-9);
});

test('HSI missing expected daily row accepts dated query1 fallback', () => {
  const quote = normalizeQuote(rawQuote('^HSI', null, {
    regularMarketPrice: 25737.60,
    regularMarketPreviousClose: null,
    regularMarketTime: Date.parse('2026-09-04T04:05:00Z') / 1000,
    latestDailyClose: 25311.2109375,
    latestDailyCloseTime: Date.parse('2026-09-02T01:30:00Z') / 1000,
    previousDailyClose: 25329.73046875,
    previousDailyCloseTime: Date.parse('2026-09-01T01:30:00Z') / 1000,
    immediatePreviousClose: 25213.31,
    immediatePreviousCloseTime: Date.parse('2026-09-03T01:30:00Z') / 1000,
    immediatePreviousCloseSource: 'yahooChart5dQuery1',
    exchangeTimezoneName: 'Asia/Hong_Kong'
  }), '^HSI');
  assert.equal(quote.displayPrice, 25737.60);
  assert.equal(quote.referencePrice, 25213.31);
  assert.ok(Math.abs(quote.change - 524.29) < 1e-9);
});

test('stale dated immediate previous close is rejected', () => {
  const quote = normalizeQuote(rawQuote('^HSI', null, {
    regularMarketPrice: 25737.60,
    regularMarketPreviousClose: null,
    regularMarketTime: Date.parse('2026-09-04T04:05:00Z') / 1000,
    latestDailyClose: 25311.2109375,
    latestDailyCloseTime: Date.parse('2026-09-02T01:30:00Z') / 1000,
    previousDailyClose: 25329.73046875,
    previousDailyCloseTime: Date.parse('2026-09-01T01:30:00Z') / 1000,
    immediatePreviousClose: 25311.20,
    immediatePreviousCloseTime: Date.parse('2026-09-02T01:30:00Z') / 1000,
    immediatePreviousCloseSource: 'arbitrary-provenance',
    exchangeTimezoneName: 'Asia/Hong_Kong'
  }), '^HSI');
  assert.equal(quote.referencePrice, null);
  assert.equal(quote.change, null);
  assert.equal(quote.percentChange, null);
});

test('HSI expected previous trading-date close outranks stale verified immediate close', () => {
  const quote = normalizeQuote(rawQuote('^HSI', null, {
    regularMarketPrice: 25251.90,
    regularMarketPreviousClose: null,
    regularMarketTime: 1788417216,
    latestDailyClose: 25311.2109375,
    latestDailyCloseTime: 1788312600,
    previousDailyClose: 25329.73046875,
    immediatePreviousClose: 25329.70,
    immediatePreviousCloseTime: 1788226200,
    immediatePreviousCloseSource: 'yahooChart5d',
    exchangeTimezoneName: 'Asia/Hong_Kong'
  }), '^HSI');
  assert.equal(quote.displayPrice, 25251.90);
  assert.equal(quote.referencePrice, 25311.2109375);
  assert.ok(Math.abs(quote.change - (25251.90 - 25311.2109375)) < 1e-9);
});

test('post-close HSI rollover uses previous daily close from expected trading date', () => {
  const quote = normalizeQuote(rawQuote('^HSI', null, {
    regularMarketPrice: 25171.10,
    regularMarketPreviousClose: null,
    regularMarketTime: 1788422780,
    latestDailyClose: 25171.099609375,
    latestDailyCloseTime: 1788399000,
    previousDailyClose: 25311.2109375,
    previousDailyCloseTime: 1788312600,
    immediatePreviousClose: 25329.70,
    immediatePreviousCloseTime: 1788226200,
    immediatePreviousCloseSource: 'yahooChart5d',
    dailyClosePairHasGap: false,
    exchangeTimezoneName: 'Asia/Hong_Kong'
  }), '^HSI');
  assert.equal(quote.displayPrice, 25171.099609375);
  assert.equal(quote.referencePrice, 25311.2109375);
  assert.ok(Math.abs(quote.change - (-140.111328125)) < 1e-9);
});

test('post-close STI rollover uses previous daily close from expected trading date', () => {
  const quote = normalizeQuote(rawQuote('^STI', null, {
    regularMarketPrice: 5759.46,
    regularMarketPreviousClose: null,
    regularMarketTime: 1788424389,
    latestDailyClose: 5759.46,
    latestDailyCloseTime: 1788397200,
    previousDailyClose: 5744.11,
    previousDailyCloseTime: 1788310800,
    immediatePreviousClose: 5710.37,
    immediatePreviousCloseTime: 1788224400,
    immediatePreviousCloseSource: 'yahooChart5d',
    dailyClosePairHasGap: false,
    exchangeTimezoneName: 'Asia/Singapore'
  }), '^STI');
  assert.equal(quote.displayPrice, 5759.46);
  assert.equal(quote.referencePrice, 5744.11);
  assert.ok(Math.abs(quote.change - 15.35) < 1e-9);
});

test('ordinary HK equity rollover uses dated previous daily close', () => {
  const quote = normalizeQuote(rawQuote('0700.HK', null, {
    regularMarketPrice: 612.5,
    regularMarketPreviousClose: null,
    regularMarketTime: 1788422780,
    latestDailyClose: 612.5,
    latestDailyCloseTime: 1788399000,
    previousDailyClose: 608.0,
    previousDailyCloseTime: 1788312600,
    immediatePreviousClose: 605.0,
    immediatePreviousCloseTime: 1788226200,
    immediatePreviousCloseSource: 'yahooChart5d',
    exchangeTimezoneName: 'Asia/Hong_Kong'
  }), '0700.HK');
  assert.equal(quote.referencePrice, 608.0);
  assert.equal(quote.change, 4.5);
});

test('expected previous trading date skips weekend and holiday', () => {
  const quote = normalizeQuote(rawQuote('^GSPC', null, {
    regularMarketPrice: 120,
    regularMarketPreviousClose: null,
    regularMarketTime: Date.parse('2026-09-08T14:30:00Z') / 1000,
    latestDailyClose: 110,
    latestDailyCloseTime: Date.parse('2026-09-04T20:00:00Z') / 1000,
    previousDailyClose: 100,
    immediatePreviousClose: 100,
    immediatePreviousCloseTime: Date.parse('2026-09-03T20:00:00Z') / 1000,
    immediatePreviousCloseSource: 'yahooChart5d',
    exchangeTimezoneName: 'America/New_York'
  }), '^GSPC');
  assert.equal(quote.displayPrice, 120);
  assert.equal(quote.referencePrice, 110);
  assert.equal(quote.change, 10);
});

test('newer regular close prefers verified immediate close over stale latest daily close', () => {
  const quote = normalizeQuote(rawQuote('TEST.SI', null, {
    regularMarketPrice: 120,
    regularMarketPreviousClose: null,
    regularMarketTime: 1788398433,
    latestDailyClose: 100,
    latestDailyCloseTime: 1788224400,
    previousDailyClose: 90,
    immediatePreviousClose: 110,
    immediatePreviousCloseTime: 1788310800,
    immediatePreviousCloseSource: 'yahooChart5d',
    exchangeTimezoneName: 'Asia/Singapore'
  }), 'TEST.SI');
  assert.equal(quote.displayPrice, 120);
  assert.equal(quote.referencePrice, 110);
  assert.equal(quote.change, 10);
});

test('older daily history without a verified immediate close remains conservative', () => {
  [
    { immediatePreviousClose: 110, immediatePreviousCloseSource: null },
    { immediatePreviousClose: 110, immediatePreviousCloseTime: 1788224400, immediatePreviousCloseSource: 'unverified' },
    { immediatePreviousClose: -1, immediatePreviousCloseTime: 1788310800, immediatePreviousCloseSource: 'yahooChart5d' }
  ].forEach(fallback => {
    const quote = normalizeQuote(rawQuote('^STI', null, {
      regularMarketPrice: 120,
      regularMarketPreviousClose: null,
      regularMarketTime: 1788398433,
      latestDailyClose: 100,
      latestDailyCloseTime: 1788224400,
      previousDailyClose: 90,
      exchangeTimezoneName: 'Asia/Singapore',
      ...fallback
    }), '^STI');
    assert.equal(quote.referencePrice, null);
    assert.equal(quote.change, null);
  });
});

test('HSI verified immediate previous close remains authoritative', () => {
  const quote = normalizeQuote(rawQuote('^HSI', null, {
    regularMarketPrice: 25482.56,
    regularMarketPreviousClose: null,
    regularMarketTime: 1788398484,
    latestDailyClose: 25329.73046875,
    latestDailyCloseTime: 1788226200,
    previousDailyClose: 25566.990234375,
    immediatePreviousClose: 25311.21,
    immediatePreviousCloseTime: 1788312600,
    immediatePreviousCloseSource: 'yahooChart5d',
    exchangeTimezoneName: 'Asia/Hong_Kong'
  }), '^HSI');
  assert.equal(quote.displayPrice, 25482.56);
  assert.equal(quote.referencePrice, 25311.21);
  assert.ok(Math.abs(quote.change - 171.35) < 1e-9);
});

test('ordinary SG equity without verified immediate close keeps latest daily close', () => {
  const quote = normalizeQuote(rawQuote('D05.SI', null, {
    regularMarketPrice: 78.24,
    regularMarketPreviousClose: null,
    regularMarketTime: 1788398781,
    latestDailyClose: 77.5999984741211,
    latestDailyCloseTime: 1788310800,
    previousDailyClose: 76.91000366210938,
    immediatePreviousClose: null,
    immediatePreviousCloseSource: null,
    exchangeTimezoneName: 'Asia/Singapore'
  }), 'D05.SI');
  assert.equal(quote.displayPrice, 78.24);
  assert.equal(quote.referencePrice, 77.5999984741211);
  assert.ok(Math.abs(quote.change - (78.24 - 77.5999984741211)) < 1e-9);
});

test('gap-free completed pair without verified immediate close remains unchanged', () => {
  [
    { immediatePreviousClose: 95, immediatePreviousCloseSource: null },
    { immediatePreviousClose: 95, immediatePreviousCloseSource: 'unverified' }
  ].forEach(fallback => {
    const quote = normalizeQuote(rawQuote('0700.HK', 'CLOSED', {
      latestDailyClose: 110,
      previousDailyClose: 100,
      dailyClosePairHasGap: false,
      ...fallback
    }), '0700.HK');
    assert.equal(quote.referencePrice, 100);
    assert.equal(quote.change, 10);
  });
});

test('gapped completed pair without verified fallback remains conservative', () => {
  [
    { immediatePreviousClose: -1, immediatePreviousCloseTime: 1767722400, immediatePreviousCloseSource: 'yahooChart5d' },
    { immediatePreviousClose: 25584.80, immediatePreviousCloseSource: 'unverified' }
  ].forEach(fallback => {
    const quote = normalizeQuote(rawQuote('^HSI', 'CLOSED', {
      latestDailyClose: 25329.73,
      previousDailyClose: 25566.99,
      dailyClosePairHasGap: true,
      ...fallback
    }), '^HSI');
    assert.equal(quote.displayPrice, 25329.73);
    assert.equal(quote.referencePrice, null);
    assert.equal(quote.change, null);
    assert.equal(quote.percentChange, null);
  });
});

test('regularMarketPreviousClose overrides verified fallback', () => {
  const quote = normalizeQuote(rawQuote('VEEV', 'REGULAR', {
    regularMarketPreviousClose: 100,
    immediatePreviousClose: 95,
    immediatePreviousCloseTime: Date.parse('2026-01-06T21:00:00Z') / 1000,
    immediatePreviousCloseSource: 'yahooChart5d',
    dailyClosePairHasGap: false
  }), 'VEEV');
  assert.equal(quote.referencePrice, 100);
  assert.equal(quote.change, 10);
});

test('US pre-market uses verified fallback when regular previous close is unavailable', () => {
  const quote = normalizeQuote(rawQuote('AAPL', 'PRE', {
    regularMarketPreviousClose: null,
    preMarketPrice: 108,
    preMarketChange: 8,
    preMarketChangePercent: 8,
    preMarketTime: 1767790800,
    immediatePreviousClose: 100,
    immediatePreviousCloseTime: Date.parse('2026-01-06T21:00:00Z') / 1000,
    immediatePreviousCloseSource: 'yahooChart5d',
    dailyClosePairHasGap: false
  }), 'AAPL');
  assert.equal(quote.displayPriceSession, 'pre');
  assert.equal(quote.displayPrice, 108);
  assert.equal(quote.previousClose, 100);
  assert.equal(quote.referencePrice, 100);
  assert.equal(quote.change, 8);
});

test('US pre-market retains matching provider movement and labels the active quote', () => {
  const quote = normalizeQuote(rawQuote('AAPL', 'PRE', {
    preMarketPrice: 108,
    preMarketChange: 7.5,
    preMarketChangePercent: 7.5
  }), 'AAPL');
  assert.equal(quote.displayPrice, 108);
  assert.equal(quote.change, 7.5);
  assert.equal(quote.percentChange, 7.5);
  assert.equal(quote.displayLabel, 'PRE');
  assert.equal(quote.isActiveSessionDisplay, true);
  assert.equal(quote.isActiveSessionFallback, false);
});

test('US pre-market price without matching movement leaves movement unavailable', () => {
  const quote = normalizeQuote(rawQuote('AAPL', 'PRE', {
    preMarketPrice: 108,
    preMarketChange: null,
    preMarketChangePercent: null
  }), 'AAPL');
  assert.equal(quote.displayPrice, 108);
  assert.equal(quote.change, null);
  assert.equal(quote.percentChange, null);
  assert.equal(quote.displayLabel, 'PRE');
});

test('US pre-market without a quote labels its regular-price fallback', () => {
  const quote = normalizeQuote(rawQuote('AAPL', 'PRE', {
    preMarketPrice: null
  }), 'AAPL');
  assert.equal(quote.displayPriceSession, 'regularClose');
  assert.equal(quote.displayLabel, 'Prior close');
  assert.equal(quote.isActiveSessionDisplay, false);
  assert.equal(quote.isActiveSessionFallback, true);
});

test('regular session uses verified fallback when regular previous close is unavailable', () => {
  const quote = normalizeQuote(rawQuote('VEEV', 'REGULAR', {
    regularMarketPreviousClose: null,
    immediatePreviousClose: 100,
    immediatePreviousCloseTime: Date.parse('2026-01-06T21:00:00Z') / 1000,
    immediatePreviousCloseSource: 'yahooChart5d',
    dailyClosePairHasGap: false
  }), 'VEEV');
  assert.equal(quote.referencePrice, 100);
  assert.equal(quote.change, 10);
});

test('US post-market ignores verified immediate previous close', () => {
  const quote = normalizeQuote(rawQuote('AAPL', 'POST', {
    regularMarketPrice: 110,
    regularMarketPreviousClose: null,
    postMarketPrice: 112,
    postMarketChange: 2,
    postMarketChangePercent: (2 / 110) * 100,
    postMarketTime: 1767823200,
    immediatePreviousClose: 100,
    immediatePreviousCloseTime: Date.parse('2026-01-06T21:00:00Z') / 1000,
    immediatePreviousCloseSource: 'yahooChart5d',
    dailyClosePairHasGap: true
  }), 'AAPL');
  assert.equal(quote.displayPriceSession, 'post');
  assert.equal(quote.displayPrice, 112);
  assert.equal(quote.referencePrice, 110);
  assert.equal(quote.change, 2);
});

test('US post-market price without matching movement leaves movement unavailable', () => {
  const quote = normalizeQuote(rawQuote('AAPL', 'POST', {
    postMarketPrice: 112,
    postMarketChange: null,
    postMarketChangePercent: null
  }), 'AAPL');
  assert.equal(quote.displayPrice, 112);
  assert.equal(quote.change, null);
  assert.equal(quote.percentChange, null);
  assert.equal(quote.displayLabel, 'After-hours');
});

test('US post-market without a quote labels its regular-close fallback', () => {
  const quote = normalizeQuote(rawQuote('AAPL', 'POST', {
    postMarketPrice: null
  }), 'AAPL');
  assert.equal(quote.displayPriceSession, 'regularClose');
  assert.equal(quote.displayLabel, 'Regular close');
  assert.equal(quote.isActiveSessionFallback, true);
});

test('US regular and completed-session presentation stay on their existing bases', () => {
  const regular = normalizeQuote(rawQuote('AAPL', 'REGULAR'), 'AAPL');
  assert.equal(regular.displayPrice, 110);
  assert.equal(regular.change, 10);
  assert.equal(regular.displayLabel, 'Live');
  ['CLOSED', 'WEEKEND', 'HOLIDAY'].forEach(state => {
    const completed = normalizeQuote(rawQuote('AAPL', state), 'AAPL');
    assert.equal(completed.displayPrice, 110, state);
    assert.equal(completed.change, 10, state);
    assert.equal(completed.displayLabel, null, state);
    assert.equal(completed.isActiveSessionDisplay, false, state);
  });
});

test('SG and HK quotes retain their existing display behavior', () => {
  ['D05.SI', '0700.HK'].forEach(symbol => {
    const quote = normalizeQuote(rawQuote(symbol, 'CLOSED', {
      preMarketPrice: 108, preMarketChange: 8, preMarketChangePercent: 8,
      postMarketPrice: 112, postMarketChange: 2, postMarketChangePercent: 2
    }), symbol);
    assert.equal(quote.displayPrice, 110, symbol);
    assert.equal(quote.change, 10, symbol);
    assert.equal(quote.displayLabel, null, symbol);
    assert.equal(quote.isActiveSessionDisplay, false, symbol);
  });
});

test('raw.prev remains ignored when no canonical reference is available', () => {
  const quote = normalizeQuote(rawQuote('AAPL', 'REGULAR', {
    regularMarketPreviousClose: null,
    immediatePreviousClose: null,
    immediatePreviousCloseSource: null,
    dailyClosePairHasGap: false
  }, { prev: 50 }), 'AAPL');
  assert.equal(quote.displayPrice, 110);
  assert.equal(quote.referencePrice, null);
  assert.equal(quote.change, null);
});

test('missing daily values and invalid dates remain conservative', () => {
  const quote = normalizeQuote(rawQuote('0700.HK', null, {
    regularMarketPrice: 612.5,
    regularMarketPreviousClose: null,
    regularMarketTime: null,
    latestDailyClose: 610,
    latestDailyCloseTime: null,
    previousDailyClose: null,
    previousDailyCloseTime: null,
    immediatePreviousClose: 608,
    immediatePreviousCloseSource: 'unverified',
    exchangeTimezoneName: 'Asia/Hong_Kong'
  }, { prev: 607 }), '0700.HK');
  assert.equal(quote.displayPrice, 612.5);
  assert.equal(quote.referencePrice, null);
  assert.equal(quote.change, null);
});
