const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'claude-analysis.js'), 'utf8');

function load(overrides = {}) {
  const context = {
    window: {},
    S: {
      proxyUrl: 'https://proxy.example',
      tz: 'Asia/Singapore',
      myStocks: {US: [], SG: [], HK: []},
      customTickers: {US: [], SG: [], HK: []}
    },
    Date, Number, String, TypeError, Error, Object, Array, JSON, Promise,
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

function packages() {
  const zones = {US: 'America/New_York', SG: 'Asia/Singapore', HK: 'Asia/Hong_Kong'};
  return ['HK', 'US', 'SG'].map(market => ({
    market,
    marketContext: {
      exchangeTimezone: zones[market], marketState: 'CLOSED',
      primaryCompletedSessionDate: null, includesCurrentOverlay: false, calendarContext: null
    },
    telemetry: {benchmarkSnapshots: [], stockSnapshots: []},
    evidenceContext: {
      evidence: [], materialEvents: [], authoritativeFacts: [], principalCatalysts: [],
      supportingEvidence: [], conflictingEvidence: [], subsequentDevelopments: [],
      unresolvedGaps: [], furtherReadings: []
    }
  }));
}

test('maps current filters to canonical scopes and preserves ALL market order', () => {
  const api = load().window.MarketBrief.claudeAnalysis;
  assert.equal(api.mapScope('all'), 'ALL');
  assert.equal(api.mapScope('US'), 'US');
  assert.equal(api.mapScope('sg'), 'SG');
  assert.equal(api.mapScope('HK'), 'HK');
  assert.deepEqual(Array.from(api.getScopeMarkets('ALL')), ['US', 'SG', 'HK']);
  assert.throws(() => api.mapScope('XX'), /Invalid Market Brief scope/);
});

test('builds MARKET_BRIEF request with UTC time, S.tz and canonical package order', () => {
  const context = load();
  const request = context.window.MarketBrief.claudeAnalysis.createMarketBriefRequest({
    filter: 'all', listKey: 'myStocks', marketPackages: packages(), now: '2026-09-06T12:34:56+08:00'
  });
  assert.deepEqual(Object.keys(request), ['analysisRequest', 'marketPackages', 'portfolioContext', 'outputRequirements']);
  assert.equal(request.analysisRequest.reportType, 'MARKET_BRIEF');
  assert.equal(request.analysisRequest.selectedScope, 'ALL');
  assert.equal(request.analysisRequest.generatedAt, '2026-09-06T04:34:56.000Z');
  assert.equal(request.analysisRequest.userTimezone, 'Asia/Singapore');
  assert.deepEqual(Array.from(request.marketPackages, item => item.market), ['US', 'SG', 'HK']);
  assert.equal(Object.hasOwn(request.marketPackages[0], 'evidenceCollection'), false);
  assert.ok(request.marketPackages[0].evidenceContext);
  assert.equal(request.outputRequirements.header, 'REPORT HEADER / ANALYSIS CONTEXT');
  assert.equal(request.outputRequirements.sections.length, 11);
  assert.equal(request.outputRequirements.maximumWords, 2500);
});

test('keeps My Stocks and Watchlist portfolio context separate, ordered and scoped', () => {
  const mineUS = [{sym: 'MSFT'}, {sym: 'AAPL'}];
  const mineSG = [{sym: 'D05.SI'}];
  const watchUS = [{sym: 'VEEV'}];
  const context = load();
  context.S.myStocks = {US: mineUS, SG: mineSG, HK: []};
  context.S.customTickers = {US: watchUS, SG: [], HK: [{sym: '0700.HK'}]};
  const api = context.window.MarketBrief.claudeAnalysis;
  const us = api.getPortfolioContext('US');
  const all = api.getPortfolioContext('ALL');
  assert.deepEqual(Array.from(us.myStocks, item => item.symbol), ['MSFT', 'AAPL']);
  assert.deepEqual(Array.from(us.watchlist, item => item.symbol), ['VEEV']);
  assert.deepEqual(Array.from(all.myStocks, item => item.symbol), ['MSFT', 'AAPL', 'D05.SI']);
  assert.deepEqual(Array.from(all.watchlist, item => item.symbol), ['VEEV', '0700.HK']);
  us.myStocks[0].symbol = 'CHANGED';
  assert.equal(mineUS[0].sym, 'MSFT');
  assert.equal(watchUS[0].sym, 'VEEV');
});

test('rejects missing canonical packages before fetch', async () => {
  let calls = 0;
  const api = load().window.MarketBrief.claudeAnalysis;
  await assert.rejects(api.requestMarketBriefAnalysis({
    filter: 'ALL', marketPackages: [packages()[1]],
    fetchImpl: async () => { calls++; }
  }), /Missing canonical market package for SG/);
  const factoryStyle = {...packages()[1], evidenceCollection: {market: 'US', items: []}};
  await assert.rejects(api.requestMarketBriefAnalysis({
    filter: 'US', marketPackages: [factoryStyle], fetchImpl: async () => { calls++; }
  }), /Invalid canonical market package/);
  assert.equal(calls, 0);
});

test('posts exactly one JSON request and returns structured result without retry', async () => {
  const calls = [];
  const expected = {status: 'NORMAL', findings: [], gaps: []};
  const api = load().window.MarketBrief.claudeAnalysis;
  const result = await api.requestMarketBriefAnalysis({
    filter: 'SG', marketPackages: [packages()[2]],
    now: '2026-09-06T00:00:00Z',
    fetchImpl: async (url, options) => {
      calls.push({url, options});
      return {ok: true, status: 200, async json() { return {result: expected}; }};
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://proxy.example/api/quote?claudeAnalysis=1');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(Object.keys(calls[0].options.headers), ['Content-Type']);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.analysisRequest.reportType, 'MARKET_BRIEF');
  assert.deepEqual(Object.keys(body), ['analysisRequest', 'marketPackages', 'portfolioContext', 'outputRequirements']);
  assert.ok(body.marketPackages[0].evidenceContext);
  assert.equal(Object.hasOwn(body.marketPackages[0], 'evidenceCollection'), false);
  assert.equal(result, expected);
});

test('preserves backend failure types and handles malformed and network failures deterministically', async () => {
  const api = load().window.MarketBrief.claudeAnalysis;
  const base = {filter: 'US', marketPackages: [packages()[1]]};
  await assert.rejects(api.requestMarketBriefAnalysis({...base, fetchImpl: async () => ({
    ok: false, status: 502, async json() { return {error: {type: 'CONTRACT_FAILURE', message: 'bad contract', upstreamStatus: 200}}; }
  })}), error => error.type === 'CONTRACT_FAILURE' && error.upstreamStatus === 200);
  await assert.rejects(api.requestMarketBriefAnalysis({...base, fetchImpl: async () => ({
    ok: true, status: 200, async json() { return {}; }
  })}), error => error.type === 'MALFORMED_RESPONSE');
  await assert.rejects(api.requestMarketBriefAnalysis({...base, fetchImpl: async () => ({
    ok: true, status: 200, async json() { throw new Error('bad json'); }
  })}), error => error.type === 'MALFORMED_RESPONSE');
  let calls = 0;
  await assert.rejects(api.requestMarketBriefAnalysis({...base, fetchImpl: async () => {
    calls++; throw new Error('offline');
  }}), error => error.type === 'NETWORK_FAILURE');
  assert.equal(calls, 1);
  await assert.rejects(api.requestMarketBriefAnalysis(base), error => error.type === 'NETWORK_FAILURE');
});

test('loads after Dashboard UI and before app.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'marketbrief.html'), 'utf8');
  const dashboard = html.indexOf('src="dashboard-ui.js');
  const helper = html.indexOf('src="claude-analysis.js');
  const app = html.indexOf('src="app.js');
  assert.ok(dashboard !== -1 && helper > dashboard && app > helper);
});
