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

test('gapped completed pair uses verified immediate previous close', () => {
  const quote = normalizeQuote(rawQuote('^HSI', 'CLOSED', {
    latestDailyClose: 25329.73,
    previousDailyClose: 25566.99,
    dailyClosePairHasGap: true,
    immediatePreviousClose: 25584.80,
    immediatePreviousCloseSource: 'yahooChart1d'
  }), '^HSI');
  assert.equal(quote.displayPrice, 25329.73);
  assert.equal(quote.referencePrice, 25584.80);
  assert.ok(Math.abs(quote.change - (-255.07)) < 1e-9);
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
    dailyClosePairHasGap: true
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
    dailyClosePairHasGap: true
  }), 'AAPL');
  assert.equal(quote.displayPriceSession, 'pre');
  assert.equal(quote.displayPrice, 108);
  assert.equal(quote.previousClose, 100);
  assert.equal(quote.referencePrice, 100);
  assert.equal(quote.change, 8);
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
