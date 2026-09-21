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
      fixedTickers: [
        {sym: '^DJI', mkt: 'US'}, {sym: '^IXIC', mkt: 'US'},
        {sym: '^GSPC', mkt: 'US'}, {sym: '^RUT', mkt: 'US'},
        {sym: '^STI', mkt: 'SG'}, {sym: '^HSI', mkt: 'HK'}
      ],
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
      sessionAssociations: [], broadMarketFocus: [], unresolvedGaps: [], furtherReadings: []
    }
  }));
}

function canonicalUsEnvelope() {
  return {
    analysisRequest: {
      selectedScope: 'US', initiatingList: 'myStocks', generatedAt: '2026-09-06T10:00:00.000Z',
      userTimezone: 'Asia/Singapore', reportType: 'MARKET_BRIEF'
    },
    marketPackages: [packages()[1]],
    portfolioContext: {myStocks: [], watchlist: []},
    outputRequirements: {header: 'REPORT HEADER / ANALYSIS CONTEXT', sections: [], maximumWords: 2500}
  };
}

function populatedUsEnvelope() {
  const envelope = canonicalUsEnvelope();
  envelope.marketPackages[0].marketContext.primaryCompletedSessionDate = '2026-09-04';
  function fiveSessions(last) {
    return [
      {sessionDate:'2026-08-31',close:last.close-140,absoluteChange:20,percentChange:0.08},
      {sessionDate:'2026-09-01',close:last.close-110,absoluteChange:30,percentChange:0.11},
      {sessionDate:'2026-09-02',close:last.close-80,absoluteChange:30,percentChange:0.11},
      {sessionDate:'2026-09-03',close:last.close-last.absoluteChange,absoluteChange:30,percentChange:0.11},
      Object.assign({sessionDate:'2026-09-04'},last)
    ];
  }
  envelope.marketPackages[0].telemetry = {
    benchmarkSnapshots: [
      {reference: 't1', snapshot: {
        symbol: '^DJI', instrumentName: 'Dow Jones Industrial Average',
        completedSessions: fiveSessions({close: 53414.25, absoluteChange: -271.86, percentChange: -0.51}),
        currentOverlay: null
      }},
      {reference: 't2', snapshot: {symbol: '^IXIC', instrumentName: 'NASDAQ Composite', completedSessions:
        fiveSessions({close: 26506.99, absoluteChange: -77.07, percentChange: -0.29}), currentOverlay: null}},
      {reference: 't3', snapshot: {symbol: '^GSPC', instrumentName: 'S&P <500>', completedSessions:
        fiveSessions({close: 7718.60, absoluteChange: -29.11, percentChange: -0.38}), currentOverlay: null}},
      {reference: 't4', snapshot: {symbol: '^RUT', instrumentName: 'Russell 2000', completedSessions:
        fiveSessions({close: 2975.65, absoluteChange: 7.38, percentChange: 0.25}), currentOverlay: null}}
    ],
    stockSnapshots: []
  };
  envelope.marketPackages[0].evidenceContext.evidence = [
    {reference: 'e1', item: {
      title: 'Trusted <Market> report',
      canonicalUrl: 'https://finance.yahoo.com/markets/stocks/market-recap.html',
      provenance: {publisher: 'Yahoo! Finance'}
    }},
    {reference: 'e2', item: {
      title: 'CNBC closing-market recap',
      canonicalUrl: 'https://www.cnbc.com/2026/09/04/stock-market-today.html',
      provenance: {publisher: 'CNBC'}
    }},
    {reference: 'e3', item: {
      title: 'Global markets recap',
      canonicalUrl: 'https://www.reuters.com/markets/global-markets-recap/',
      provenance: {publisher: 'Reuters'}
    }}
  ];
  return envelope;
}

function structuredResult(envelope, status = 'NORMAL') {
  const sections = [
    'EXECUTIVE MARKET SUMMARY', 'KEY MARKET DRIVERS', 'STOCKS & SECTORS IN FOCUS',
    'MY STOCKS & WATCHLIST - MATERIAL MOVEMENTS', 'MARKET INTERPRETATION',
    'KEY RISKS & OPPORTUNITIES', 'WHAT TO WATCH FOR NEXT', 'FURTHER READINGS'
  ].map((name, index) => ({
    name,
    content: index === 7 || status === 'FAILED' ? null : index === 0 ? 'Safe <script>alert(1)</script> analysis.' : 'Supported analysis.',
    evidenceRefs: index === 7 || status === 'FAILED' ? [] : ['e1'],
    telemetryRefs: index === 7 || status === 'FAILED' ? [] : ['t1'],
    uncertainties: status === 'DEGRADED' && index === 5 ? ['Evidence remains incomplete.'] : []
  }));
  if(status === 'DEGRADED'){
    sections[5].content = null;
    sections[5].evidenceRefs = [];
    sections[5].telemetryRefs = [];
  }
  return {
    status,
    reportContext: {
      header: 'REPORT HEADER / ANALYSIS CONTEXT', selectedScope: 'US',
      generatedAt: envelope.analysisRequest.generatedAt,
      userTimezone: envelope.analysisRequest.userTimezone,
      reportType: 'MARKET_BRIEF', markets: ['US']
    },
    sections,
    evidenceReferences: status === 'FAILED' ? [] : ['e1'],
    furtherReadings: status === 'FAILED' ? [] : ['e1', 'e2'],
    evidenceGaps: status === 'NORMAL' ? [] : ['A canonical evidence gap remains.']
  };
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
    filter: 'all', initiatingList: 'myStocks', marketPackages: packages(), now: '2026-09-06T12:34:56+08:00'
  });
  assert.deepEqual(Object.keys(request), ['analysisRequest', 'marketPackages', 'portfolioContext', 'outputRequirements']);
  assert.equal(request.analysisRequest.reportType, 'MARKET_BRIEF');
  assert.equal(request.analysisRequest.selectedScope, 'ALL');
  assert.equal(request.analysisRequest.initiatingList, 'myStocks');
  assert.equal(request.analysisRequest.generatedAt, '2026-09-06T04:34:56.000Z');
  assert.equal(request.analysisRequest.userTimezone, 'Asia/Singapore');
  assert.deepEqual(Array.from(request.marketPackages, item => item.market), ['US', 'SG', 'HK']);
  assert.equal(Object.hasOwn(request.marketPackages[0], 'evidenceCollection'), false);
  assert.ok(request.marketPackages[0].evidenceContext);
  assert.equal(request.outputRequirements.header, 'REPORT HEADER / ANALYSIS CONTEXT');
  assert.equal(request.outputRequirements.sections.length, 8);
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

test('builds exact US package request from ordered fixed anchors and user-managed membership', () => {
  const mine = [{sym: 'MSFT'}, {sym: 'AAPL'}];
  const watch = [{sym: 'VEEV'}, {sym: 'NVDA'}];
  const context = load();
  context.S.myStocks.US = mine;
  context.S.customTickers.US = watch;
  const request = context.window.MarketBrief.claudeAnalysis.createMarketBriefPackageRequest({
    filter: 'US', initiatingList: 'watchlist'
  });
  assert.deepEqual(Object.keys(request), ['benchmarkAnchors', 'selectedScope', 'initiatingList', 'userTimezone', 'myStocks', 'watchlist']);
  assert.deepEqual(Array.from(request.benchmarkAnchors, item => item.symbol), ['^DJI', '^IXIC', '^GSPC', '^RUT']);
  assert.deepEqual(Array.from(request.myStocks, item => item.symbol), ['MSFT', 'AAPL']);
  assert.deepEqual(Array.from(request.watchlist, item => item.symbol), ['VEEV', 'NVDA']);
  assert.equal(request.selectedScope, 'US');
  assert.equal(request.initiatingList, 'watchlist');
  assert.equal(request.userTimezone, 'Asia/Singapore');
  request.benchmarkAnchors[0].symbol = 'CHANGED';
  request.myStocks[0].symbol = 'CHANGED';
  assert.equal(context.S.fixedTickers[0].sym, '^DJI');
  assert.equal(mine[0].sym, 'MSFT');
  assert.equal(watch[0].sym, 'VEEV');
  assert.throws(() => context.window.MarketBrief.claudeAnalysis.createMarketBriefPackageRequest({
    filter: 'SG', initiatingList: 'myStocks'
  }), /supports US only/);
});

test('requires a canonical initiating list before either structured fetch', async () => {
  const api = load().window.MarketBrief.claudeAnalysis;
  for(const initiatingList of [undefined, '', 'customTickers', 'other']){
    let calls=0;
    await assert.rejects(api.requestMarketBriefPackage({
      initiatingList,
      fetchImpl:async()=>{calls++;}
    }), /initiating list/);
    await assert.rejects(api.requestMarketBriefAnalysis({
      filter:'US', initiatingList, marketPackages:[packages()[1]],
      fetchImpl:async()=>{calls++;}
    }), /initiating list/);
    assert.equal(calls,0);
  }
});

test('rejects benchmark overlap before package fetch', async () => {
  let calls = 0;
  const context = load();
  context.S.myStocks.US = [{sym: '^RUT'}];
  await assert.rejects(context.window.MarketBrief.claudeAnalysis.requestMarketBriefPackage({
    initiatingList: 'myStocks',
    fetchImpl: async () => { calls++; }
  }), /cannot be portfolio membership/);
  context.S.myStocks.US = [];
  context.S.customTickers.US = [{sym: '^DJI'}];
  await assert.rejects(context.window.MarketBrief.claudeAnalysis.requestMarketBriefPackage({
    initiatingList: 'watchlist',
    fetchImpl: async () => { calls++; }
  }), /cannot be portfolio membership/);
  assert.equal(calls, 0);
});

test('posts package request once and passes canonical envelope through directly without Claude', async () => {
  const calls = [];
  const expected = populatedUsEnvelope();
  const api = load().window.MarketBrief.claudeAnalysis;
  const result = await api.requestMarketBriefPackage({
    initiatingList: 'myStocks',
    fetchImpl: async (url, options) => {
      calls.push({url, options});
      return {ok: true, status: 200, async json() { return expected; }};
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://proxy.example/api/quote?analysisPackage=1');
  assert.doesNotMatch(calls[0].url, /claude/i);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(Object.keys(calls[0].options.headers), ['Content-Type']);
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(Object.keys(JSON.parse(calls[0].options.body)), ['benchmarkAnchors', 'selectedScope', 'initiatingList', 'userTimezone', 'myStocks', 'watchlist']);
  assert.equal(JSON.parse(calls[0].options.body).initiatingList, 'myStocks');
  assert.equal(result, expected);
  assert.deepEqual(result.marketPackages[0].evidenceContext.broadMarketFocus, []);
  assert.deepEqual(result.marketPackages[0].telemetry.benchmarkSnapshots.map(entry => entry.snapshot.completedSessions.length),
    [5, 5, 5, 5]);
});

test('structured POSTs share a bounded generation ID only in URLs and preserve bodies and returns', async () => {
  const api = load().window.MarketBrief.claudeAnalysis;
  const envelope = populatedUsEnvelope();
  const analysisResult = {status: 'NORMAL'};
  const calls = [];
  const generationId = '123e4567-e89b-42d3-a456-426614174000';
  const fetchImpl = async (url, options) => {
    calls.push({url, options});
    return {ok: true, status: 200, async json() { return calls.length === 1 ? envelope : {result: analysisResult}; }};
  };
  const actualEnvelope = await api.requestMarketBriefPackage({initiatingList: 'myStocks', generationId, fetchImpl});
  const actualResult = await api.requestMarketBriefAnalysis({envelope: actualEnvelope, generationId, fetchImpl});
  assert.equal(calls[0].url, 'https://proxy.example/api/quote?analysisPackage=1&generationId='+generationId);
  assert.equal(calls[1].url, 'https://proxy.example/api/quote?claudeAnalysis=1&generationId='+generationId);
  assert.equal(Object.hasOwn(JSON.parse(calls[0].options.body), 'generationId'), false);
  assert.equal(calls[1].options.body, JSON.stringify(envelope));
  assert.equal(actualEnvelope, envelope);
  assert.equal(actualResult, analysisResult);
});

test('missing or malformed generation IDs leave structured POST URLs unchanged', async () => {
  const api = load().window.MarketBrief.claudeAnalysis;
  const envelope = populatedUsEnvelope();
  for (const generationId of [undefined, '', 'invalid', '123e4567-e89b-42d3-a456-426614174000&x=1', 'x'.repeat(1000)]) {
    const urls = [];
    const fetchImpl = async url => {
      urls.push(url);
      return {ok: true, status: 200, async json() { return urls.length === 1 ? envelope : {result: {status: 'NORMAL'}}; }};
    };
    await api.requestMarketBriefPackage({initiatingList: 'myStocks', generationId, fetchImpl});
    await api.requestMarketBriefAnalysis({envelope, generationId, fetchImpl});
    assert.deepEqual(urls, [
      'https://proxy.example/api/quote?analysisPackage=1',
      'https://proxy.example/api/quote?claudeAnalysis=1'
    ]);
  }
});

test('accepts canonical package keys in arbitrary top-level and nested order without transforming the response', async () => {
  const source = populatedUsEnvelope();
  const marketPackage = source.marketPackages[0];
  const reordered = {
    outputRequirements: source.outputRequirements,
    portfolioContext: {watchlist: source.portfolioContext.watchlist, myStocks: source.portfolioContext.myStocks},
    marketPackages: [{
      evidenceContext: marketPackage.evidenceContext,
      telemetry: {stockSnapshots: marketPackage.telemetry.stockSnapshots, benchmarkSnapshots: marketPackage.telemetry.benchmarkSnapshots},
      marketContext: {
        calendarContext: marketPackage.marketContext.calendarContext,
        includesCurrentOverlay: marketPackage.marketContext.includesCurrentOverlay,
        primaryCompletedSessionDate: marketPackage.marketContext.primaryCompletedSessionDate,
        marketState: marketPackage.marketContext.marketState,
        exchangeTimezone: marketPackage.marketContext.exchangeTimezone
      },
      market: marketPackage.market
    }],
    analysisRequest: {
      reportType: source.analysisRequest.reportType,
      userTimezone: source.analysisRequest.userTimezone,
      generatedAt: source.analysisRequest.generatedAt,
      initiatingList: source.analysisRequest.initiatingList,
      selectedScope: source.analysisRequest.selectedScope
    }
  };
  const result = await load().window.MarketBrief.claudeAnalysis.requestMarketBriefPackage({
    initiatingList: 'myStocks',
    fetchImpl: async () => ({ok: true, status: 200, async json() { return reordered; }})
  });
  assert.equal(result, reordered);
});

test('package transport preserves structured failures and handles malformed and network failures deterministically', async () => {
  const api = load().window.MarketBrief.claudeAnalysis;
  for (const status of [400, 502]) {
    await assert.rejects(api.requestMarketBriefPackage({initiatingList:'myStocks',fetchImpl: async () => ({
      ok: false, status, async json() { return {error: {type: 'PACKAGE_FAILURE', message: 'package failed', upstreamStatus: status}}; }
    })}), error => error.type === 'PACKAGE_FAILURE' && error.upstreamStatus === status);
  }
  await assert.rejects(api.requestMarketBriefPackage({initiatingList:'myStocks',fetchImpl: async () => ({
    ok: true, status: 200, async json() { return {}; }
  })}), error => error.type === 'MALFORMED_RESPONSE');
  const missingSessionAssociations = canonicalUsEnvelope();
  delete missingSessionAssociations.marketPackages[0].evidenceContext.sessionAssociations;
  await assert.rejects(api.requestMarketBriefPackage({initiatingList:'myStocks',fetchImpl: async () => ({
    ok: true, status: 200, async json() { return missingSessionAssociations; }
  })}), error => error.type === 'MALFORMED_RESPONSE');
  const missingBroadMarketFocus = canonicalUsEnvelope();
  delete missingBroadMarketFocus.marketPackages[0].evidenceContext.broadMarketFocus;
  await assert.rejects(api.requestMarketBriefPackage({initiatingList:'myStocks',fetchImpl: async () => ({
    ok: true, status: 200, async json() { return missingBroadMarketFocus; }
  })}), error => error.type === 'MALFORMED_RESPONSE');
  const extraEvidenceContextKey = canonicalUsEnvelope();
  extraEvidenceContextKey.marketPackages[0].evidenceContext.unexpected = [];
  await assert.rejects(api.requestMarketBriefPackage({initiatingList:'myStocks',fetchImpl: async () => ({
    ok: true, status: 200, async json() { return extraEvidenceContextKey; }
  })}), error => error.type === 'MALFORMED_RESPONSE');
  const extraTopLevelKey = canonicalUsEnvelope();
  extraTopLevelKey.unexpected = true;
  await assert.rejects(api.requestMarketBriefPackage({initiatingList:'myStocks',fetchImpl: async () => ({
    ok: true, status: 200, async json() { return extraTopLevelKey; }
  })}), error => error.type === 'MALFORMED_RESPONSE');
  await assert.rejects(api.requestMarketBriefPackage({initiatingList:'myStocks',fetchImpl: async () => ({
    ok: true, status: 200, async json() { throw new Error('bad json'); }
  })}), error => error.type === 'MALFORMED_RESPONSE');
  let calls = 0;
  await assert.rejects(api.requestMarketBriefPackage({initiatingList:'myStocks',fetchImpl: async () => {
    calls++; throw new Error('offline');
  }}), error => error.type === 'NETWORK_FAILURE');
  assert.equal(calls, 1);
});

test('rejects missing canonical packages before fetch', async () => {
  let calls = 0;
  const api = load().window.MarketBrief.claudeAnalysis;
  await assert.rejects(api.requestMarketBriefAnalysis({
    filter: 'ALL', initiatingList: 'myStocks', marketPackages: [packages()[1]],
    fetchImpl: async () => { calls++; }
  }), /Missing canonical market package for SG/);
  const factoryStyle = {...packages()[1], evidenceCollection: {market: 'US', items: []}};
  await assert.rejects(api.requestMarketBriefAnalysis({
    filter: 'US', initiatingList: 'watchlist', marketPackages: [factoryStyle], fetchImpl: async () => { calls++; }
  }), /Invalid canonical market package/);
  assert.equal(calls, 0);
});

test('posts exactly one JSON request and returns structured result without retry', async () => {
  const calls = [];
  const expected = {status: 'NORMAL', findings: [], gaps: []};
  const api = load().window.MarketBrief.claudeAnalysis;
  const result = await api.requestMarketBriefAnalysis({
    filter: 'SG', initiatingList: 'watchlist', marketPackages: [packages()[2]],
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
  assert.equal(body.analysisRequest.initiatingList, 'watchlist');
  assert.deepEqual(Object.keys(body), ['analysisRequest', 'marketPackages', 'portfolioContext', 'outputRequirements']);
  assert.ok(body.marketPackages[0].evidenceContext);
  assert.equal(Object.hasOwn(body.marketPackages[0], 'evidenceCollection'), false);
  assert.equal(result, expected);
});

test('posts an acquired canonical envelope to structured analysis unchanged', async () => {
  const envelope = populatedUsEnvelope();
  const expected = structuredResult(envelope);
  const calls = [];
  const api = load().window.MarketBrief.claudeAnalysis;
  const result = await api.requestMarketBriefAnalysis({
    envelope,
    fetchImpl: async (url, options) => {
      calls.push({url, options});
      return {ok: true, status: 200, async json() { return {result: expected}; }};
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://proxy.example/api/quote?claudeAnalysis=1');
  assert.equal(calls[0].options.body, JSON.stringify(envelope));
  assert.deepEqual(JSON.parse(calls[0].options.body), envelope);
  assert.deepEqual(envelope.marketPackages[0].telemetry.benchmarkSnapshots.map(entry => entry.snapshot.completedSessions.length),
    [5, 5, 5, 5]);
  assert.deepEqual(JSON.parse(calls[0].options.body).marketPackages[0].telemetry.benchmarkSnapshots,
    envelope.marketPackages[0].telemetry.benchmarkSnapshots);
  assert.deepEqual(JSON.parse(calls[0].options.body).marketPackages[0].evidenceContext.sessionAssociations,
    envelope.marketPackages[0].evidenceContext.sessionAssociations);
  assert.equal(result, expected);
});

test('renders the canonical eight sections in order without removed or duplicate headings', () => {
  const envelope = populatedUsEnvelope();
  const api = load().window.MarketBrief.claudeAnalysis;
  const result = structuredResult(envelope);
  const html = api.renderMarketBriefAnalysis(result, envelope);
  assert.match(html, /REPORT HEADER \/ ANALYSIS CONTEXT/);
  assert.match(html, /US · NORMAL/);
  assert.match(html, /<table aria-label="Analysis context"/);
  assert.match(html, />Market<\/th><td[^>]*>US<\/td>/);
  assert.match(html, />Session<\/th><td[^>]*>Market Closed<\/td>/);
  assert.match(html, />Analysis State<\/th><td[^>]*>Completed session<\/td>/);
  assert.match(html, />Principal Completed Regular Session<\/th><td[^>]*>04-09-2026<\/td>/);
  assert.match(html, />Generated<\/th><td[^>]*>06-09-2026 · 18:00 SGT<\/td>/);
  assert.doesNotMatch(html, /AI · Claude/);
  assert.doesNotMatch(html, /2026-09-06T10:00:00\.000Z/);
  let previous = -1;
  assert.equal(result.sections.length, 8);
  result.sections.forEach((section, index) => {
    const position = html.indexOf(`${index + 1}. ${section.name.replace(/&/g, '&amp;')}`);
    assert.ok(position > previous, `${section.name} must render in frozen order`);
    previous = position;
  });
  assert.equal((html.match(/KEY RISKS &amp; OPPORTUNITIES/g) || []).length, 1);
  assert.doesNotMatch(html, /WHAT DROVE \/ IS DRIVING THE MARKET|MARKETBRIEF TAKEAWAY/);
  assert.ok(html.indexOf('8. FURTHER READINGS') > html.indexOf('7. WHAT TO WATCH FOR NEXT'));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Safe &lt;script&gt;alert\(1\)&lt;\/script&gt; analysis/);
  assert.match(html, /Trusted &lt;Market&gt; report/);
  assert.match(html, /Dow Jones Industrial Average/);
  assert.match(html, /href="https:\/\/finance\.yahoo\.com\/markets\/stocks\/market-recap\.html"/);
});

test('bounds the report body without moving the stable report header into the scroller', () => {
  const envelope = populatedUsEnvelope();
  const html = load().window.MarketBrief.claudeAnalysis.renderMarketBriefAnalysis(structuredResult(envelope), envelope);
  const headerEnd = html.indexOf('</div><div class="sumbody">');
  const bodyStart = html.indexOf('<div class="sumbody">');
  assert.ok(bodyStart > html.indexOf('class="sumhdr"'));
  assert.ok(headerEnd >= 0);
  assert.ok(html.indexOf('1. EXECUTIVE MARKET SUMMARY', bodyStart) > bodyStart);
  assert.ok(html.lastIndexOf('</div></div>') >= html.lastIndexOf('8. FURTHER READINGS'));

  const css = fs.readFileSync(path.join(__dirname, '..', 'app.css'), 'utf8');
  assert.match(css, /#sumAreaD,#sumArea\{flex:1;min-height:0;display:flex;flex-direction:column;\}/);
  assert.match(css, /\.sumbox\{[\s\S]*?flex:1;min-height:0;display:flex;flex-direction:column;/);
  assert.match(css, /\.sumbox \.sumhdr\{flex-shrink:0;\}/);
  assert.match(css, /\.sumbox \.sumbody\{flex:1;min-height:0;overflow-y:auto;/);
  assert.match(css, /#dashboardAIM\{display:flex;flex-direction:column;max-height:calc\(100vh - 150px\);\}/);
});

test('renders supported canonical US session states in clear report context', () => {
  const cases = [
    ['WEEKEND', false, 'Weekend / Market Closed', 'Completed session'],
    ['CLOSED', false, 'Market Closed', 'Completed session'],
    ['PRE', true, 'Pre-Market', 'Live / in progress'],
    ['PRE-MARKET', true, 'Pre-Market', 'Live / in progress'],
    ['REGULAR', true, 'Trading', 'Live / in progress'],
    ['TRADING', true, 'Trading', 'Live / in progress'],
    ['POST', true, 'After-Hours', 'Live / in progress'],
    ['POST-MARKET', true, 'After-Hours', 'Live / in progress']
  ];
  const api = load().window.MarketBrief.claudeAnalysis;
  cases.forEach(([state, overlay, label, progress]) => {
    const envelope = populatedUsEnvelope();
    envelope.marketPackages[0].marketContext.marketState = state;
    envelope.marketPackages[0].marketContext.includesCurrentOverlay = overlay;
    if(overlay)envelope.marketPackages[0].telemetry.benchmarkSnapshots[0].snapshot.currentOverlay =
      {lastPrice:99999,absoluteChange:999,percentChange:99};
    const html = api.renderMarketBriefAnalysis(structuredResult(envelope), envelope);
    assert.match(html, new RegExp(`>Session<\\/th><td[^>]*>${label.replace(/\//g, '\\/')}<\\/td>`));
    assert.match(html, new RegExp(`>Analysis State<\\/th><td[^>]*>${progress.replace(/\//g, '\\/')}<\\/td>`));
    if(state === 'WEEKEND')assert.doesNotMatch(html, /Session status unavailable/);
  });
});

test('rejects the retired eleven-section structured output contract', () => {
  const envelope = populatedUsEnvelope();
  const result = structuredResult(envelope);
  while(result.sections.length < 11)result.sections.splice(result.sections.length-1,0,{
    name:'RETIRED SECTION',content:'Retired content.',evidenceRefs:[],telemetryRefs:[],uncertainties:[]
  });
  assert.throws(() => load().window.MarketBrief.claudeAnalysis.renderMarketBriefAnalysis(result,envelope),
    /Invalid structured Market Brief sections/);
});

test('PRE, REGULAR and POST render valid benchmark overlays as live values before Section 1', () => {
  for (const state of ['PRE', 'REGULAR', 'POST']) {
    const envelope = populatedUsEnvelope();
    envelope.marketPackages[0].marketContext.marketState = state;
    envelope.marketPackages[0].marketContext.includesCurrentOverlay = true;
    envelope.marketPackages[0].telemetry.benchmarkSnapshots.forEach((entry, index) => {
      entry.snapshot.currentOverlay = {
        lastPrice: 54000 + index,
        absoluteChange: index % 2 ? -10 - index : 10 + index,
        percentChange: index % 2 ? -0.2 - index / 100 : 0.2 + index / 100
      };
    });
    const html = load().window.MarketBrief.claudeAnalysis.renderMarketBriefAnalysis(structuredResult(envelope), envelope);
    const table = html.indexOf('class="benchmark-table"');
    const sectionOne = html.indexOf('1. EXECUTIVE MARKET SUMMARY');
    assert.ok(table !== -1 && table < sectionOne);
    assert.match(html, />Last<\/th>/);
    assert.match(html, /Dow Jones[\s\S]*54,000\.00[\s\S]*↑ 10\.00 \(0\.20%\)/);
    assert.match(html, /NASDAQ[\s\S]*54,001\.00[\s\S]*↓ 11\.00 \(0\.21%\)/);
    assert.doesNotMatch(html, /53,414\.25|26,506\.99|7,718\.60|2,975\.65/);
  }
});

test('active benchmark rows fall back independently to visibly marked prior-close data', () => {
  const envelope = populatedUsEnvelope();
  envelope.marketPackages[0].marketContext.marketState = 'REGULAR';
  envelope.marketPackages[0].marketContext.includesCurrentOverlay = true;
  const benchmarks = envelope.marketPackages[0].telemetry.benchmarkSnapshots;
  benchmarks[0].snapshot.currentOverlay = {lastPrice: 54000, absoluteChange: 10, percentChange: 0.2};
  benchmarks[1].snapshot.currentOverlay = null;
  benchmarks[2].snapshot.currentOverlay = {lastPrice: Number.NaN, absoluteChange: 12, percentChange: 0.2};
  benchmarks[3].snapshot.currentOverlay = {lastPrice: 3000, absoluteChange: -5, percentChange: -0.17};
  const html = load().window.MarketBrief.claudeAnalysis.renderMarketBriefAnalysis(structuredResult(envelope), envelope);
  const nasdaq = html.match(/<tr><td[^>]*>NASDAQ<\/td>[\s\S]*?<\/tr>/)[0];
  const sp = html.match(/<tr><td[^>]*>S&amp;P 500<\/td>[\s\S]*?<\/tr>/)[0];
  assert.match(html, /Dow Jones[\s\S]*54,000\.00[\s\S]*↑ 10\.00 \(0\.20%\)/);
  assert.match(html, /Russell 2000[\s\S]*3,000\.00[\s\S]*↓ 5\.00 \(0\.17%\)/);
  assert.match(nasdaq, /26,506\.99[\s\S]*Prior close[\s\S]*↓ 77\.07 \(0\.29%\)/);
  assert.match(sp, /7,718\.60[\s\S]*Prior close[\s\S]*↓ 29\.11 \(0\.38%\)/);
  assert.doesNotMatch(nasdaq, /54,001\.00/);
});

test('CLOSED, WEEKEND and HOLIDAY retain completed benchmark closes despite overlay data', () => {
  for (const state of ['CLOSED', 'WEEKEND', 'HOLIDAY']) {
    const envelope = populatedUsEnvelope();
    envelope.marketPackages[0].marketContext.marketState = state;
    envelope.marketPackages[0].marketContext.includesCurrentOverlay = false;
    envelope.marketPackages[0].telemetry.benchmarkSnapshots[0].snapshot.currentOverlay =
      {lastPrice: 99999, absoluteChange: 999, percentChange: 99};
    const html = load().window.MarketBrief.claudeAnalysis.renderMarketBriefAnalysis(structuredResult(envelope), envelope);
    assert.match(html, />Close<\/th>/);
    assert.match(html, /Dow Jones[\s\S]*53,414\.25[\s\S]*↓ 271\.86 \(0\.51%\)/);
    assert.doesNotMatch(html, /99,999\.00|999\.00 \(99\.00%\)|Prior close/);
  }
});

test('renders unavailable benchmark close data without substituting current overlay values', () => {
  const envelope = populatedUsEnvelope();
  const russell = envelope.marketPackages[0].telemetry.benchmarkSnapshots[3].snapshot;
  russell.completedSessions = [];
  russell.currentOverlay = {lastPrice: 3001.25, absoluteChange: 32.98, percentChange: 1.11};
  const html = load().window.MarketBrief.claudeAnalysis.renderMarketBriefAnalysis(structuredResult(envelope), envelope);
  const row = html.match(/<tr><td[^>]*>Russell 2000<\/td>[\s\S]*?<\/tr>/)[0];
  assert.match(row, />—<\/td>[\s\S]*>—<\/td>/);
  assert.doesNotMatch(row, /3,001\.25|32\.98|1\.11/);
});

test('renders an exactly unchanged completed benchmark session neutrally', () => {
  const envelope = populatedUsEnvelope();
  envelope.marketPackages[0].telemetry.benchmarkSnapshots[3].snapshot.completedSessions = [
    {close: 2975.65, absoluteChange: 0, percentChange: 0}
  ];
  const html = load().window.MarketBrief.claudeAnalysis.renderMarketBriefAnalysis(structuredResult(envelope), envelope);
  const row = html.match(/<tr><td[^>]*>Russell 2000<\/td>[\s\S]*?<\/tr>/)[0];
  assert.match(row, /<td[^>]*>2,975\.65<\/td><td class="neu"[^>]*>— 0\.00 \(0\.00%\)<\/td>/);
  assert.doesNotMatch(row, /class="(?:up|dn)"/);
});

test('renders DEGRADED and FAILED results without fabricating unavailable content', () => {
  const envelope = populatedUsEnvelope();
  const api = load().window.MarketBrief.claudeAnalysis;
  const degraded = api.renderMarketBriefAnalysis(structuredResult(envelope, 'DEGRADED'), envelope);
  const failed = api.renderMarketBriefAnalysis(structuredResult(envelope, 'FAILED'), envelope);
  assert.match(degraded, /US · DEGRADED/);
  assert.doesNotMatch(degraded, /Evidence remains incomplete/);
  assert.doesNotMatch(degraded, /Uncertainty:/);
  assert.doesNotMatch(degraded, /Evidence gaps/);
  assert.doesNotMatch(degraded, /A canonical evidence gap remains/);
  assert.match(degraded, /No supported analysis is available from the supplied package/);
  assert.match(failed, /US · FAILED/);
  assert.doesNotMatch(failed, /Evidence gaps/);
  assert.doesNotMatch(failed, /A canonical evidence gap remains/);
  assert.doesNotMatch(failed, /Supported analysis/);
});

test('renders the structured generated time in the user timezone without a raw ISO value', () => {
  const envelope = populatedUsEnvelope();
  envelope.analysisRequest.generatedAt = '2026-09-07T12:47:19.351Z';
  envelope.analysisRequest.userTimezone = 'America/New_York';
  const result = structuredResult(envelope);
  const html = load().window.MarketBrief.claudeAnalysis.renderMarketBriefAnalysis(result, envelope);
  assert.match(html, /US · NORMAL/);
  assert.doesNotMatch(html, /2026-09-07T12:47:19\.351Z/);
  assert.match(html, />Generated<\/th><td[^>]*>07-09-2026 · 08:47 (?:GMT-4|EDT)<\/td>/);
  assert.doesNotMatch(html, /AI · Claude/);
  assert.doesNotMatch(html, /SGT/);
});

test('validates the structured user timezone while rendering the generated time', () => {
  const envelope = populatedUsEnvelope();
  const api = load().window.MarketBrief.claudeAnalysis;
  assert.doesNotThrow(() => api.renderMarketBriefAnalysis(structuredResult(envelope), envelope));
  envelope.analysisRequest.userTimezone = 'Not/A_Timezone';
  const result = structuredResult(envelope);
  assert.throws(() => api.renderMarketBriefAnalysis(result, envelope), /user timezone/);
});

test('renders validated Further Readings in supplied order and handles partial or absent lists', () => {
  const api = load().window.MarketBrief.claudeAnalysis;
  function renderWith(readings) {
    const envelope = populatedUsEnvelope();
    const result = structuredResult(envelope);
    result.furtherReadings = readings;
    const html = api.renderMarketBriefAnalysis(result, envelope);
    return html.slice(html.indexOf('8. FURTHER READINGS'));
  }
  const all = renderWith(['e1', 'e2', 'e3']);
  const yahoo = all.indexOf('Yahoo! – Trusted &lt;Market&gt; report');
  const cnbc = all.indexOf('CNBC – CNBC closing-market recap');
  const reuters = all.indexOf('Reuters – Global markets recap');
  assert.ok(yahoo !== -1 && cnbc > yahoo && reuters > cnbc);
  assert.match(all, /href="https:\/\/finance\.yahoo\.com\/markets\/stocks\/market-recap\.html"[^>]*>Yahoo! – Trusted &lt;Market&gt; report<\/a>/);
  assert.match(all, /href="https:\/\/www\.cnbc\.com\/2026\/09\/04\/stock-market-today\.html"[^>]*>CNBC – CNBC closing-market recap<\/a>/);
  assert.match(all, /href="https:\/\/www\.reuters\.com\/markets\/global-markets-recap\/"[^>]*>Reuters – Global markets recap<\/a>/);
  assert.doesNotMatch(all, />https?:\/\//);
  assert.match(renderWith(['e1']), /Yahoo! – Trusted &lt;Market&gt; report/);
  assert.doesNotMatch(renderWith(['e1']), /CNBC closing-market recap/);
  assert.match(renderWith(['e2']), /CNBC – CNBC closing-market recap/);
  assert.doesNotMatch(renderWith(['e2']), /Trusted &lt;Market&gt; report/);
  assert.match(renderWith([]), /No validated Further Readings were supplied/);

  const missingPublisherEnvelope = populatedUsEnvelope();
  delete missingPublisherEnvelope.marketPackages[0].evidenceContext.evidence[0].item.provenance;
  const missingPublisherResult = structuredResult(missingPublisherEnvelope);
  missingPublisherResult.furtherReadings = ['e1'];
  const missingPublisher = api.renderMarketBriefAnalysis(missingPublisherResult, missingPublisherEnvelope);
  assert.match(missingPublisher, />Trusted &lt;Market&gt; report<\/a>/);
  assert.doesNotMatch(missingPublisher, /Yahoo!/);

  const escapedEnvelope = populatedUsEnvelope();
  escapedEnvelope.marketPackages[0].evidenceContext.evidence[2].item.provenance.publisher = 'Reuters & <Partners>';
  escapedEnvelope.marketPackages[0].evidenceContext.evidence[2].item.title = 'Markets <rise> & rotate';
  const escapedResult = structuredResult(escapedEnvelope);
  escapedResult.furtherReadings = ['e3'];
  const escaped = api.renderMarketBriefAnalysis(escapedResult, escapedEnvelope);
  assert.match(escaped, /Reuters &amp; &lt;Partners&gt; – Markets &lt;rise&gt; &amp; rotate/);
});

test('renders rich, degraded and portfolio-overlap fixtures without frontend filler', () => {
  const envelope = populatedUsEnvelope();
  envelope.portfolioContext.myStocks = [{market:'US', symbol:'MSFT', telemetryRefs:[], evidenceRefs:[], upcomingEvents:[]}];
  const api = load().window.MarketBrief.claudeAnalysis;
  const rich = structuredResult(envelope);
  rich.sections[2].content = 'Microsoft led the broad market because of a supported catalyst.';
  rich.sections[3].content = 'Microsoft was also material to the initiating My Stocks list. An ordinary holding was not material.';
  const richHtml = api.renderMarketBriefAnalysis(rich, envelope);
  assert.match(richHtml, /Microsoft led the broad market/);
  assert.match(richHtml, /Microsoft was also material to the initiating My Stocks list/);
  const thin = structuredResult(envelope, 'DEGRADED');
  const thinHtml = api.renderMarketBriefAnalysis(thin, envelope);
  assert.match(thinHtml, /6\. KEY RISKS &amp; OPPORTUNITIES[\s\S]*No supported analysis is available from the supplied package/);
  assert.doesNotMatch(thinHtml, /buying opportunity|rebound may/i);
});

test('rejects unknown structured references and never renders unsupplied Further Reading URLs', () => {
  const envelope = populatedUsEnvelope();
  const api = load().window.MarketBrief.claudeAnalysis;
  const unknownEvidence = structuredResult(envelope);
  unknownEvidence.sections[0].evidenceRefs = ['e999'];
  assert.throws(() => api.renderMarketBriefAnalysis(unknownEvidence, envelope), /evidence reference/);
  const unknownTelemetry = structuredResult(envelope);
  unknownTelemetry.sections[0].telemetryRefs = ['t999'];
  assert.throws(() => api.renderMarketBriefAnalysis(unknownTelemetry, envelope), /telemetry reference/);
  const unknownReading = structuredResult(envelope);
  unknownReading.furtherReadings = ['e999'];
  assert.throws(() => api.renderMarketBriefAnalysis(unknownReading, envelope), /Further Reading reference/);
  const unsafeEnvelope = populatedUsEnvelope();
  unsafeEnvelope.marketPackages[0].evidenceContext.evidence[0].item.canonicalUrl = 'javascript:alert(1)';
  const unsafeResult = structuredResult(unsafeEnvelope);
  unsafeResult.furtherReadings = ['e1'];
  const html = api.renderMarketBriefAnalysis(unsafeResult, unsafeEnvelope);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /No validated Further Readings were supplied/);
});

test('preserves backend failure types and handles malformed and network failures deterministically', async () => {
  const api = load().window.MarketBrief.claudeAnalysis;
  const base = {filter: 'US', initiatingList: 'myStocks', marketPackages: [packages()[1]]};
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

test('loads current cache-busted asset after Dashboard UI and before app.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'marketbrief.html'), 'utf8');
  const dashboard = html.indexOf('src="dashboard-ui.js');
  const helper = html.indexOf('src="claude-analysis.js');
  const app = html.indexOf('src="app.js');
  assert.ok(dashboard !== -1 && helper > dashboard && app > helper);
  assert.match(html, /href="app\.css\?rev=1d7111f"/);
  assert.match(html, /src="search\.js\?rev=1d7111f"/);
  assert.match(html, /src="investment\.js\?rev=1d7111f"/);
  assert.match(html, /src="claude-analysis\.js\?rev=1d7111f"/);
  assert.match(html, /src="app\.js\?rev=b9099a5"/);
  assert.doesNotMatch(html, /src="claude-analysis\.js\?rev=7d95563"/);
});

test('keeps visible and cache-check release versions synchronized', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'marketbrief.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.equal((html.match(/v2\.20260921\.25\.F/g) || []).length, 3);
  assert.equal((app.match(/v2\.20260921\.25\.F/g) || []).length, 2);
  assert.doesNotMatch(html + app, /v2\.20260921\.24\.F|v2\.20260919\.23\.FP/);
  const cacheCheckPattern = app.match(/var m=html\.match\((\/class=.*?\/)\);/);
  assert.ok(cacheCheckPattern);
  assert.equal(html.match(vm.runInNewContext(cacheCheckPattern[1]))[1], 'v2.20260921.25.F');
});
