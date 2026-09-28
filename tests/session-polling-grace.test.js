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

test('SG and HK close grace uses five-second and sixty-second phases then stops after sixty minutes', () => {
  assertPolling('SG', '2026-09-03T09:00:00Z', 'closed', false, 5, true);
  assertPolling('SG', '2026-09-03T09:29:59Z', 'closed', false, 5, true);
  assertPolling('SG', '2026-09-03T09:30:00Z', 'closed', false, 60, true);
  assertPolling('SG', '2026-09-03T09:45:00Z', 'closed', false, 60, true);
  assertPolling('SG', '2026-09-03T09:59:59Z', 'closed', false, 60, true);
  assertPolling('SG', '2026-09-03T10:00:00Z', 'closed', false, 0, false);
  assertPolling('HK', '2026-09-03T08:00:00Z', 'closed', false, 5, true);
  assertPolling('HK', '2026-09-03T08:29:59Z', 'closed', false, 5, true);
  assertPolling('HK', '2026-09-03T08:30:00Z', 'closed', false, 60, true);
  assertPolling('HK', '2026-09-03T08:45:00Z', 'closed', false, 60, true);
  assertPolling('HK', '2026-09-03T08:59:59Z', 'closed', false, 60, true);
  assertPolling('HK', '2026-09-03T09:00:00Z', 'closed', false, 0, false);
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

test('.L symbols map to the UK market while US, SG and HK mapping is unchanged', () => {
  assert.equal(marketData.getMarketCodeForSymbol('SPYL.L'), 'UK');
  assert.equal(marketData.getMarketCodeForSymbol('jepq.l'), 'UK');
  assert.equal(marketData.getMarketCodeForSymbol('AAPL'), 'US');
  assert.equal(marketData.getMarketCodeForSymbol('D05.SI'), 'SG');
  assert.equal(marketData.getMarketCodeForSymbol('0700.HK'), 'HK');
  assert.equal(marketData.getMarketCodeForSymbol('^GSPC'), 'US');
});

test('UK session runs 08:00 to 16:30 London time on weekdays with no polling grace', () => {
  // 2026-09-03 is BST (UTC+1)
  assertPolling('UK', '2026-09-03T06:59:59Z', 'closed', false, 0, false);
  assertPolling('UK', '2026-09-03T07:00:00Z', 'regular', true, 0, true);
  assertPolling('UK', '2026-09-03T15:29:59Z', 'regular', true, 0, true);
  assertPolling('UK', '2026-09-03T15:30:00Z', 'closed', false, 0, false);
  // Saturday and the 2026 Summer bank holiday
  assertPolling('UK', '2026-09-05T10:00:00Z', 'closed', false, 0, false);
  const holiday = marketData.getSessionState('SPYL.L', instant('2026-08-31T10:00:00Z'));
  assert.equal(holiday.session, 'holiday');
  assert.equal(holiday.holidayName, 'Summer bank holiday');
  assert.equal(holiday.market, 'UK');
  assert.equal(holiday.timezone, 'Europe/London');
});

test('UK session is independent of S.tz', () => {
  global.S = { tz: 'Asia/Singapore' };
  assert.equal(marketData.getSessionState('UK', instant('2026-09-03T07:00:00Z')).session, 'regular');
  global.S.tz = 'America/New_York';
  assert.equal(marketData.getSessionState('UK', instant('2026-09-03T07:00:00Z')).session, 'regular');
});

test('UK open and close follow London time across the 25 October 2026 clock change, before the US change on 1 November', () => {
  // Fri 23 Oct: London still BST (UTC+1) -> 08:00 London = 07:00Z
  assert.equal(marketData.getSessionState('UK', instant('2026-10-23T06:59:59Z')).session, 'closed');
  assert.equal(marketData.getSessionState('UK', instant('2026-10-23T07:00:00Z')).session, 'regular');
  assert.equal(marketData.getSessionState('UK', instant('2026-10-23T15:30:00Z')).session, 'closed');
  // Mon 26 to Fri 30 Oct: London GMT (UTC+0), New York still EDT -> 08:00 London = 08:00Z
  ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'].forEach(day => {
    assert.equal(marketData.getSessionState('UK', instant(day + 'T07:59:59Z')).session, 'closed');
    assert.equal(marketData.getSessionState('UK', instant(day + 'T08:00:00Z')).session, 'regular');
    assert.equal(marketData.getSessionState('UK', instant(day + 'T16:29:59Z')).session, 'regular');
    assert.equal(marketData.getSessionState('UK', instant(day + 'T16:30:00Z')).session, 'closed');
  });
  // US is still on EDT that week (regular open 13:30Z); after the US change on Sun 1 Nov it moves to 14:30Z
  assert.equal(marketData.getSessionState('US', instant('2026-10-26T13:29:59Z')).session, 'preMarket');
  assert.equal(marketData.getSessionState('US', instant('2026-10-26T13:30:00Z')).session, 'regular');
  assert.equal(marketData.getSessionState('US', instant('2026-11-02T14:29:59Z')).session, 'preMarket');
  assert.equal(marketData.getSessionState('US', instant('2026-11-02T14:30:00Z')).session, 'regular');
  assert.equal(marketData.getSessionState('UK', instant('2026-11-02T08:00:00Z')).session, 'regular');
});

test('previous trading date for a .L symbol uses the London calendar', () => {
  assert.equal(marketData.getPreviousTradingDate('SPYL.L', '2026-10-26'), '2026-10-23');
  assert.equal(marketData.getPreviousTradingDate('SPYL.L', '2026-10-27'), '2026-10-26');
  assert.equal(marketData.getPreviousTradingDate('JEPQ.L', '2026-11-02'), '2026-10-30');
  // 2026-08-31 is a UK bank holiday but a normal US trading day
  assert.equal(marketData.getPreviousTradingDate('SPYL.L', '2026-09-01'), '2026-08-28');
  assert.equal(marketData.getPreviousTradingDate('AAPL', '2026-09-01'), '2026-08-31');
  assert.equal(marketData.getLatestCompletedRegularSessionDate('SPYL.L', instant('2026-10-27T16:30:00Z')), '2026-10-27');
  assert.equal(marketData.getLatestCompletedRegularSessionDate('SPYL.L', instant('2026-10-27T16:29:59Z')), '2026-10-26');
});
