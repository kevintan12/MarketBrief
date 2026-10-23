// Step 9V.2: the page must accept evidenceContext.sinceCloseDevelopments (the one optional
// last list mb-proxy Step 9V adds to Closed/Weekend/Holiday packages), while still rejecting
// any other unexpected key. All fixtures here are made-up -- this repo is PUBLIC.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'claude-analysis.js'), 'utf8');

const NEW_MALFORMED_MESSAGE =
  'The report data arrived in a format this page does not recognise. Reload the page; ' +
  'if it repeats, the page and server versions do not match. No report was written.';

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

function baseEvidenceContext() {
  return {
    evidence: [], materialEvents: [], authoritativeFacts: [], principalCatalysts: [],
    supportingEvidence: [], conflictingEvidence: [], subsequentDevelopments: [],
    sessionAssociations: [], broadMarketFocus: [], unresolvedGaps: [], furtherReadings: []
  };
}

function closedPackage(evidenceContextOverride) {
  return {
    market: 'US',
    marketContext: {
      exchangeTimezone: 'America/New_York', marketState: 'CLOSED',
      primaryCompletedSessionDate: '2026-10-22', includesCurrentOverlay: false, calendarContext: null
    },
    telemetry: {benchmarkSnapshots: [], stockSnapshots: []},
    evidenceContext: evidenceContextOverride || baseEvidenceContext()
  };
}

function canonicalUsEnvelope(pkg) {
  return {
    analysisRequest: {
      selectedScope: 'US', initiatingList: 'myStocks', generatedAt: '2026-10-23T01:57:13.789Z',
      userTimezone: 'Asia/Singapore', reportType: 'MARKET_BRIEF'
    },
    marketPackages: [pkg],
    portfolioContext: {myStocks: [], watchlist: []},
    outputRequirements: {header: 'REPORT HEADER / ANALYSIS CONTEXT', sections: [], maximumWords: 2500}
  };
}

async function requestWith(envelope) {
  const api = load().window.MarketBrief.claudeAnalysis;
  return api.requestMarketBriefPackage({
    initiatingList: 'myStocks',
    fetchImpl: async () => ({ok: true, status: 200, async json() { return envelope; }})
  });
}

test('Step 9V.2: list present and non-empty is accepted', async () => {
  const ec = baseEvidenceContext();
  ec.subsequentDevelopments = ['sd1'];
  ec.sinceCloseDevelopments = ['sd1'];
  const result = await requestWith(canonicalUsEnvelope(closedPackage(ec)));
  assert.deepEqual(result.marketPackages[0].evidenceContext.sinceCloseDevelopments, ['sd1']);
});

test('Step 9V.2: list absent is accepted (today\'s shape, unchanged)', async () => {
  const result = await requestWith(canonicalUsEnvelope(closedPackage()));
  assert.ok(!Object.prototype.hasOwnProperty.call(result.marketPackages[0].evidenceContext, 'sinceCloseDevelopments'));
});

test('Step 9V.2: list present and empty is accepted', async () => {
  const ec = baseEvidenceContext();
  ec.sinceCloseDevelopments = [];
  const result = await requestWith(canonicalUsEnvelope(closedPackage(ec)));
  assert.deepEqual(result.marketPackages[0].evidenceContext.sinceCloseDevelopments, []);
});

test('Step 9V.2: an unknown extra key is rejected, alone and alongside the list', async () => {
  const ecAlone = baseEvidenceContext();
  ecAlone.unexpected = [];
  await assert.rejects(
    requestWith(canonicalUsEnvelope(closedPackage(ecAlone))),
    error => error.type === 'MALFORMED_RESPONSE' && error.message === NEW_MALFORMED_MESSAGE
  );

  const ecWithList = baseEvidenceContext();
  ecWithList.sinceCloseDevelopments = [];
  ecWithList.unexpected = [];
  await assert.rejects(
    requestWith(canonicalUsEnvelope(closedPackage(ecWithList))),
    error => error.type === 'MALFORMED_RESPONSE'
  );
});

test('Step 9V.2: a missing required key is still rejected even with the list present', async () => {
  const ec = baseEvidenceContext();
  delete ec.broadMarketFocus;
  ec.sinceCloseDevelopments = [];
  await assert.rejects(
    requestWith(canonicalUsEnvelope(closedPackage(ec))),
    error => error.type === 'MALFORMED_RESPONSE'
  );
});

test('Step 9V.2: the list is rejected when placed outside evidenceContext', async () => {
  const onMarketContext = closedPackage();
  onMarketContext.marketContext.sinceCloseDevelopments = [];
  await assert.rejects(
    requestWith(canonicalUsEnvelope(onMarketContext)),
    error => error.type === 'MALFORMED_RESPONSE'
  );

  const onPackageTopLevel = closedPackage();
  onPackageTopLevel.sinceCloseDevelopments = [];
  await assert.rejects(
    requestWith(canonicalUsEnvelope(onPackageTopLevel)),
    error => error.type === 'MALFORMED_RESPONSE'
  );
});

test('Step 9V.2: a Closed package shaped like the 23 Oct run (SIMULATED -- no saved file found) is accepted end to end', async () => {
  const api = load().window.MarketBrief.claudeAnalysis;
  const ec = baseEvidenceContext();
  ec.subsequentDevelopments = ['news1', 'news2'];
  ec.sessionAssociations = [];
  ec.sinceCloseDevelopments = ['news1'];
  const envelope = canonicalUsEnvelope(closedPackage(ec));

  const acquired = await api.requestMarketBriefPackage({
    initiatingList: 'myStocks',
    fetchImpl: async () => ({ok: true, status: 200, async json() { return envelope; }})
  });
  assert.deepEqual(acquired.marketPackages[0].evidenceContext.sinceCloseDevelopments, ['news1']);

  let sentBody = null;
  await api.requestMarketBriefAnalysis({
    envelope: acquired,
    fetchImpl: async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return {ok: true, status: 200, async json() { return {result: {}}; }};
    }
  });
  assert.deepEqual(sentBody.marketPackages[0].evidenceContext.sinceCloseDevelopments, ['news1']);
});

test('Step 9V.2: the new malformed-response message is exactly option B', async () => {
  await assert.rejects(
    requestWith({}),
    error => error.type === 'MALFORMED_RESPONSE'
      && error.message === NEW_MALFORMED_MESSAGE
  );
});
