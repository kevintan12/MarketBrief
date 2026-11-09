const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../market-data.js');

const marketData = global.window.MarketBrief.marketData;

// New York is UTC-5 (standard time) on all dates used here, so 09:30 ET = 14:30Z.
function ny(date, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 5) * 60 + m) * 60000);
}

function check(date, hhmm, session, polling, latestCompleted) {
  const now = ny(date, hhmm);
  const label = `${date} ${hhmm}`;
  const state = marketData.getSessionState('US', now);
  assert.equal(state.exchangeTime, hhmm, `${label} exchange time`);
  assert.equal(state.session, session, `${label} session`);
  assert.equal(marketData.shouldPollSearchQuote('US', now), polling, `${label} polling`);
  assert.equal(marketData.getLatestCompletedRegularSessionDate('US', now), latestCompleted, `${label} latest completed`);
}

const DAYS = [
  { date: '2026-11-27', previous: '2026-11-25' },
  { date: '2026-12-24', previous: '2026-12-23' }
];

for (const { date, previous } of DAYS) {
  test(`${date} before pre-market is closed and not polled`, () => {
    check(date, '03:59', 'closed', false, previous);
  });

  test(`${date} pre-market runs 04:00 to 09:30`, () => {
    check(date, '04:00', 'preMarket', true, previous);
    check(date, '09:29', 'preMarket', true, previous);
  });

  test(`${date} regular session runs 09:30 to 13:00`, () => {
    check(date, '09:30', 'regular', true, previous);
    check(date, '12:59', 'regular', true, previous);
    assert.equal(marketData.getSessionState('US', ny(date, '12:59')).regularOpen, true);
  });

  test(`${date} after-hours starts at the 13:00 close and today becomes the latest completed session`, () => {
    check(date, '13:00', 'postMarket', true, date);
    assert.equal(marketData.getSessionState('US', ny(date, '13:00')).regularOpen, false);
  });

  test(`${date} after-hours ends at 17:00 and polling stops`, () => {
    check(date, '16:59', 'postMarket', true, date);
    check(date, '17:00', 'closed', false, date);
    check(date, '20:00', 'closed', false, date);
  });
}

test('25 Nov and 30 Nov 2026 keep the normal 16:00 close and 20:00 after-hours end', () => {
  for (const date of ['2026-11-25', '2026-11-30']) {
    const prev = date === '2026-11-25' ? '2026-11-24' : '2026-11-27';
    check(date, '12:59', 'regular', true, prev);
    check(date, '13:00', 'regular', true, prev);
    check(date, '15:59', 'regular', true, prev);
    check(date, '16:00', 'postMarket', true, date);
    check(date, '17:00', 'postMarket', true, date);
    check(date, '19:59', 'postMarket', true, date);
    check(date, '20:00', 'closed', false, date);
  }
});

test('26 Nov 2027 is not an early-close day', () => {
  check('2027-11-26', '13:00', 'regular', true, '2027-11-24');
  check('2027-11-26', '16:00', 'postMarket', true, '2027-11-26');
  check('2027-11-26', '17:00', 'postMarket', true, '2027-11-26');
});

test('24 Dec 2027 stays a closed holiday and 26 Nov 2026 stays Thanksgiving', () => {
  assert.equal(marketData.getSessionState('US', ny('2027-12-24', '10:00')).session, 'holiday');
  assert.equal(marketData.getSessionState('US', ny('2026-11-26', '10:00')).session, 'holiday');
});

test('early close does not change Singapore or Hong Kong sessions on the same dates', () => {
  // 2026-11-27 13:00 SGT = 05:00Z (afternoon open); 16:00 HKT = 08:00Z (closed)
  assert.equal(marketData.getSessionState('SG', new Date('2026-11-27T05:00:00Z')).session, 'regularAfternoon');
  assert.equal(marketData.getSessionState('HK', new Date('2026-11-27T05:00:00Z')).session, 'regularAfternoon');
  assert.equal(marketData.getSessionState('HK', new Date('2026-11-27T08:00:00Z')).session, 'closed');
});
