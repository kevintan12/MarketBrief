const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../market-data.js');

const marketData = global.window.MarketBrief.marketData;

function instant(iso) {
  return new Date(iso);
}

function assertPolling(market, iso, expectedSession, expectedMoving, expectedGraceCadence, expectedPolling) {
  const now = instant(iso);
  const state = marketData.getSessionState(market, now);
  assert.equal(state.session, expectedSession);
  assert.equal(state.quoteExpectedToMove, expectedMoving);
  assert.equal(marketData.getQuotePollingGraceCadence(market, now), expectedGraceCadence);
  assert.equal(marketData.shouldPollQuoteDuringGrace(market, now), expectedGraceCadence > 0);
  assert.equal(marketData.shouldPollSearchQuote(market, now), expectedPolling);
}

test('SG lunch grace uses five-second and sixty-second phases before afternoon resumes', () => {
  assertPolling('SG', '2026-09-03T03:59:59Z', 'regularMorning', true, 0, true);
  assertPolling('SG', '2026-09-03T04:00:00Z', 'lunchBreak', false, 5, true);
  assertPolling('SG', '2026-09-03T04:29:59Z', 'lunchBreak', false, 5, true);
  assertPolling('SG', '2026-09-03T04:30:00Z', 'lunchBreak', false, 60, true);
  assertPolling('SG', '2026-09-03T04:45:00Z', 'lunchBreak', false, 60, true);
  assertPolling('SG', '2026-09-03T04:59:59Z', 'lunchBreak', false, 60, true);
  assertPolling('SG', '2026-09-03T05:00:00Z', 'regularAfternoon', true, 0, true);
});

test('HK lunch grace polls for fifteen minutes then stops before afternoon resumes', () => {
  assertPolling('HK', '2026-09-03T03:59:59Z', 'regularMorning', true, 0, true);
  assertPolling('HK', '2026-09-03T04:00:00Z', 'lunchBreak', false, 5, true);
  assertPolling('HK', '2026-09-03T04:14:59Z', 'lunchBreak', false, 5, true);
  assertPolling('HK', '2026-09-03T04:15:00Z', 'lunchBreak', false, 0, false);
  assertPolling('HK', '2026-09-03T04:59:59Z', 'lunchBreak', false, 0, false);
  assertPolling('HK', '2026-09-03T05:00:00Z', 'regularAfternoon', true, 0, true);
});

test('SG and HK close grace uses five-second and sixty-second phases then stops', () => {
  assertPolling('SG', '2026-09-03T09:00:00Z', 'closed', false, 5, true);
  assertPolling('SG', '2026-09-03T09:29:59Z', 'closed', false, 5, true);
  assertPolling('SG', '2026-09-03T09:30:00Z', 'closed', false, 60, true);
  assertPolling('SG', '2026-09-03T09:44:59Z', 'closed', false, 60, true);
  assertPolling('SG', '2026-09-03T09:45:00Z', 'closed', false, 0, false);
  assertPolling('HK', '2026-09-03T08:00:00Z', 'closed', false, 5, true);
  assertPolling('HK', '2026-09-03T08:29:59Z', 'closed', false, 5, true);
  assertPolling('HK', '2026-09-03T08:30:00Z', 'closed', false, 60, true);
  assertPolling('HK', '2026-09-03T08:44:59Z', 'closed', false, 60, true);
  assertPolling('HK', '2026-09-03T08:45:00Z', 'closed', false, 0, false);
});

test('US session behavior has no polling grace', () => {
  assertPolling('US', '2026-09-03T12:00:00Z', 'preMarket', true, 0, true);
  assertPolling('US', '2026-09-03T14:00:00Z', 'regular', true, 0, true);
  assertPolling('US', '2026-09-03T21:00:00Z', 'postMarket', true, 0, true);
  assertPolling('US', '2026-09-04T01:00:00Z', 'closed', false, 0, false);
});

test('polling grace uses exchange timezone and is independent of S.tz', () => {
  global.S = { tz: 'America/New_York' };
  assert.equal(marketData.getQuotePollingGraceCadence('SG', instant('2026-09-03T04:35:00Z')), 60);
  global.S.tz = 'Europe/London';
  assert.equal(marketData.getQuotePollingGraceCadence('SG', instant('2026-09-03T04:35:00Z')), 60);
  assert.equal(marketData.getSessionState('SG', instant('2026-09-03T04:35:00Z')).session, 'lunchBreak');
});
