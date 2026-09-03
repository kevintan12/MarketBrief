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

test('verified immediate previous close overrides an older normal daily reference', () => {
  const quote = normalizeQuote(rawQuote('^HSI', 'CLOSED', {
    latestDailyClose: 25329.73046875,
    previousDailyClose: 25566.990234375,
    dailyClosePairHasGap: false,
    immediatePreviousClose: 25584.80,
    immediatePreviousCloseSource: 'yahooChart1d'
  }), '^HSI');
  assert.equal(quote.displayPrice, 25329.73046875);
  assert.equal(quote.referencePrice, 25584.80);
  assert.ok(Math.abs(quote.change - (-255.06953125)) < 1e-9);
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
    immediatePreviousCloseSource: 'yahooChart1d',
    exchangeTimezoneName: 'Asia/Singapore'
  }), '^STI');
  assert.equal(quote.displayPrice, 5759.46);
  assert.equal(quote.referencePrice, 5744.11);
  assert.ok(Math.abs(quote.change - 15.35) < 1e-9);
  assert.ok(Math.abs(quote.percentChange - (15.35 / 5744.11 * 100)) < 1e-9);
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
    immediatePreviousCloseSource: 'yahooChart1d',
    exchangeTimezoneName: 'Asia/Singapore'
  }), 'TEST.SI');
  assert.equal(quote.displayPrice, 120);
  assert.equal(quote.referencePrice, 110);
  assert.equal(quote.change, 10);
});

test('newer regular close ignores invalid or unverified immediate close', () => {
  [
    { immediatePreviousClose: 110, immediatePreviousCloseSource: null },
    { immediatePreviousClose: 110, immediatePreviousCloseSource: 'unverified' },
    { immediatePreviousClose: -1, immediatePreviousCloseSource: 'yahooChart1d' }
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
    assert.equal(quote.referencePrice, 100);
    assert.equal(quote.change, 20);
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
    immediatePreviousCloseSource: 'yahooChart1d',
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
    { immediatePreviousClose: -1, immediatePreviousCloseSource: 'yahooChart1d' },
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
    immediatePreviousCloseSource: 'yahooChart1d',
    dailyClosePairHasGap: false
  }), 'VEEV');
  assert.equal(quote.referencePrice, 100);
  assert.equal(quote.change, 10);
});

test('US pre-market uses verified fallback when regular previous close is unavailable', () => {
  const quote = normalizeQuote(rawQuote('AAPL', 'PRE', {
    regularMarketPreviousClose: null,
    preMarketPrice: 108,
    preMarketTime: 1767790800,
    immediatePreviousClose: 100,
    immediatePreviousCloseSource: 'yahooChart1d',
    dailyClosePairHasGap: false
  }), 'AAPL');
  assert.equal(quote.displayPriceSession, 'pre');
  assert.equal(quote.displayPrice, 108);
  assert.equal(quote.previousClose, 100);
  assert.equal(quote.referencePrice, 100);
  assert.equal(quote.change, 8);
});

test('regular session uses verified fallback when regular previous close is unavailable', () => {
  const quote = normalizeQuote(rawQuote('VEEV', 'REGULAR', {
    regularMarketPreviousClose: null,
    immediatePreviousClose: 100,
    immediatePreviousCloseSource: 'yahooChart1d',
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
    postMarketTime: 1767823200,
    immediatePreviousClose: 100,
    immediatePreviousCloseSource: 'yahooChart1d',
    dailyClosePairHasGap: true
  }), 'AAPL');
  assert.equal(quote.displayPriceSession, 'post');
  assert.equal(quote.displayPrice, 112);
  assert.equal(quote.referencePrice, 110);
  assert.equal(quote.change, 2);
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
