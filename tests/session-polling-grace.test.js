const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../market-data.js');

const marketData = global.window.MarketBrief.marketData;

function instant(iso) {
  return new Date(iso);
}

function assertPolling(market, iso, expectedSession, expectedMoving, expectedGrace, expectedPolling) {
  const now = instant(iso);
  const state = marketData.getSessionState(market, now);
  assert.equal(state.session, expectedSession);
  assert.equal(state.quoteExpectedToMove, expectedMoving);
  assert.equal(marketData.shouldPollQuoteDuringGrace(market, now), expectedGrace);
  assert.equal(marketData.shouldPollSearchQuote(market, now), expectedPolling);
}

test('SG lunch grace starts at 12:00, expires at 12:30 and afternoon resumes at 13:00', () => {
  assertPolling('SG', '2026-09-03T03:59:59Z', 'regularMorning', true, false, true);
  assertPolling('SG', '2026-09-03T04:00:00Z', 'lunchBreak', false, true, true);
  assertPolling('SG', '2026-09-03T04:29:59Z', 'lunchBreak', false, true, true);
  assertPolling('SG', '2026-09-03T04:30:00Z', 'lunchBreak', false, false, false);
  assertPolling('SG', '2026-09-03T05:00:00Z', 'regularAfternoon', true, false, true);
});

test('HK lunch grace starts at 12:00, expires at 12:30 and afternoon resumes at 13:00', () => {
  assertPolling('HK', '2026-09-03T03:59:59Z', 'regularMorning', true, false, true);
  assertPolling('HK', '2026-09-03T04:00:00Z', 'lunchBreak', false, true, true);
  assertPolling('HK', '2026-09-03T04:29:59Z', 'lunchBreak', false, true, true);
  assertPolling('HK', '2026-09-03T04:30:00Z', 'lunchBreak', false, false, false);
  assertPolling('HK', '2026-09-03T05:00:00Z', 'regularAfternoon', true, false, true);
});

test('existing SG and HK close grace remains inclusive at close and exclusive at 30 minutes', () => {
  assertPolling('SG', '2026-09-03T09:00:00Z', 'closed', false, true, true);
  assertPolling('SG', '2026-09-03T09:29:59Z', 'closed', false, true, true);
  assertPolling('SG', '2026-09-03T09:30:00Z', 'closed', false, false, false);
  assertPolling('HK', '2026-09-03T08:00:00Z', 'closed', false, true, true);
  assertPolling('HK', '2026-09-03T08:29:59Z', 'closed', false, true, true);
  assertPolling('HK', '2026-09-03T08:30:00Z', 'closed', false, false, false);
});

test('US session behavior has no polling grace', () => {
  assertPolling('US', '2026-09-03T12:00:00Z', 'preMarket', true, false, true);
  assertPolling('US', '2026-09-03T14:00:00Z', 'regular', true, false, true);
  assertPolling('US', '2026-09-03T21:00:00Z', 'postMarket', true, false, true);
  assertPolling('US', '2026-09-04T01:00:00Z', 'closed', false, false, false);
});

test('polling grace uses exchange timezone and is independent of S.tz', () => {
  global.S = { tz: 'America/New_York' };
  assert.equal(marketData.shouldPollQuoteDuringGrace('SG', instant('2026-09-03T04:15:00Z')), true);
  global.S.tz = 'Europe/London';
  assert.equal(marketData.shouldPollQuoteDuringGrace('SG', instant('2026-09-03T04:15:00Z')), true);
  assert.equal(marketData.getSessionState('SG', instant('2026-09-03T04:15:00Z')).session, 'lunchBreak');
});
