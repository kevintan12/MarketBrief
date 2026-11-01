// Step 9AK: the Settings "AI Model" choice is saved, loaded, imported, exported and sent
// as &model= on both structured Market Brief calls. Anything but 'haiku-4.5' means 'haiku-5.5'.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { appSource, appDeclaration, appDeclarations, appStatement } = require('./helpers/app-source');
const analysisSource = fs.readFileSync(path.join(__dirname, '..', 'claude-analysis.js'), 'utf8');

const stateSource = [
  appDeclaration('MarketBrief'), appStatement('MarketBrief.config ='),
  appDeclarations('S', 'mktData', 'FIXED_SYMS', 'acTimers')
].join('\n');
const navigationSource = appDeclarations('isDashboardView', 'tickerListForView', 'showView');
const getAllTickersSource = appDeclarations('getAllTickers');
const settingsListSource = appDeclarations(
  'renderSettingsPanelTo', 'tickerSelectionControls', 'getTickerSelectionBoxes', 'updateTickerSelectionControls',
  'toggleTickerSelection', 'deleteSelectedTickers', 'settAcFetch', 'filterSettAcResults', 'renderSettAcDrop', 'closeSettAcDrop',
  'tickerListLabel', 'tickerListHas', 'listOverlapNotice', 'removeCrossListDuplicates', 'listOverlapText',
  'addTickerDirect', 'removeTicker', 'moveTicker', 'reorderTickerArray', 'reorderTicker', '_tickerDrag',
  'positionTickerDragGhost', 'clearTickerDragVisuals', 'addTickerDragListeners', 'removeTickerDragListeners',
  'cancelTickerDragOnEscape', 'startTickerDrag', 'moveTickerDrag', 'endTickerDrag', 'cancelTickerDrag',
  'finishTickerDrag'
);
const persistenceSource = appDeclarations('exportSettings', 'importSettings', 'storeSave', 'storeLoad', 'saveSettings', 'loadSettings');

function createStorage(initial = {}) {
  const values = {...initial};
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem(key, value) { values[key] = String(value); },
    value(key) { return values[key]; }
  };
}

function createHarness(initialStorage = {}) {
  const localStorage = createStorage(initialStorage);
  const sessionStorage = createStorage();
  const elements = {};
  const window = {addEventListener() {}, removeEventListener() {}};
  const document = {
    querySelectorAll() { return []; },
    elementFromPoint() { return null; },
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = {
          value: '', innerHTML: '', textContent: '', style: {},
          classList: {toggle() {}, add() {}, remove() {}, contains() { return false; }},
          select() {}, setSelectionRange() {}, addEventListener() {}, appendChild() {}
        };
      }
      return elements[id];
    }
  };
  const context = {
    window, document, localStorage, sessionStorage,
    navigator: {clipboard: {writeText() {}}},
    location: {reload() {}},
    confirm() { return true; },
    setTimeout() {}, clearTimeout() {},
    btoa(value) { return Buffer.from(value, 'binary').toString('base64'); },
    atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
    escape, unescape, encodeURIComponent, decodeURIComponent,
    esc(value) { return String(value); },
    renderIndices() {}, updateLiveIndicator() {}, restoreCurrentBrief() {}, console
  };
  vm.createContext(context);
  vm.runInContext(stateSource + navigationSource + getAllTickersSource + settingsListSource + persistenceSource, context);
  return {context, elements, localStorage};
}

function ticker(sym, mkt) {
  return {sym, name: sym, sub: mkt, flag: mkt, mkt};
}

function settingsCode(payload) {
  return Buffer.from(unescape(encodeURIComponent(JSON.stringify(payload))), 'binary').toString('base64');
}

function saveWithModel(harness, model) {
  const doc = harness.context.document;
  doc.getElementById('cfgProxy_settingsPanel').value = '';
  doc.getElementById('cfgStyle_settingsPanel').value = 'detailed';
  doc.getElementById('cfgTz_settingsPanel').value = 'Asia/Singapore';
  doc.getElementById('cfgModel_settingsPanel').value = model;
  harness.context.saveSettings('settingsPanel');
}

function selectedModel(html) {
  const select = html.match(/<select class="sinp" id="cfgModel_settingsPanel">([\s\S]*?)<\/select>/)[1];
  return select.match(/<option value="([^"]+)" selected>/)[1];
}

test('Step 9AK: config default model is haiku-5.5', () => {
  const {context} = createHarness();
  assert.equal(context.S.model, 'haiku-5.5');
  context.loadSettings();
  assert.equal(context.S.model, 'haiku-5.5');
});

test('Step 9AK: AI Model dropdown renders after Timezone with the saved value selected', () => {
  for (const model of ['haiku-4.5', 'haiku-5.5']) {
    const {context, elements} = createHarness({mb5: JSON.stringify({model})});
    context.loadSettings();
    context.renderSettingsPanelTo('settingsPanel');
    const html = elements.settingsPanel.innerHTML;
    assert.ok(html.indexOf('id="cfgTz_settingsPanel"') < html.indexOf('id="cfgModel_settingsPanel"'));
    assert.match(html, /<div class="slbl">AI Model<\/div>/);
    assert.match(html, /<option value="haiku-5.5"[^>]*>Haiku 5\.5 \(recommended\)<\/option>/);
    assert.match(html, /<option value="haiku-4.5"[^>]*>Haiku 4\.5 \(older, about 10x the cost\)<\/option>/);
    assert.match(html, /Used for each new Market Brief\./);
    assert.equal(selectedModel(html), model);
  }
});

test('Step 9AK: save then reload keeps the chosen model', () => {
  const first = createHarness();
  saveWithModel(first, 'haiku-4.5');
  assert.equal(first.context.S.model, 'haiku-4.5');
  const second = createHarness({mb5: first.localStorage.value('mb5')});
  second.context.loadSettings();
  assert.equal(second.context.S.model, 'haiku-4.5');
});

test('Step 9AK: junk or missing model loads and saves as haiku-5.5', () => {
  for (const model of [undefined, 'claude-x', '', null, 'HAIKU-4.5', 5, 'haiku-4.5 ']) {
    const {context} = createHarness({mb5: JSON.stringify({model})});
    context.S.model = 'haiku-4.5';
    context.loadSettings();
    assert.equal(context.S.model, 'haiku-5.5', String(model));
  }
  const junkSave = createHarness();
  saveWithModel(junkSave, 'claude-x');
  assert.equal(junkSave.context.S.model, 'haiku-5.5');
  assert.equal(JSON.parse(junkSave.localStorage.value('mb5')).model, 'haiku-5.5');
});

test('Step 9AK: export then import carries the model', () => {
  const source = createHarness();
  source.context.S.model = 'haiku-4.5';
  source.context.exportSettings('settingsPanel');
  const code = source.elements.expOut_settingsPanel.innerHTML.match(/readonly>([^<]+)<\/textarea>/)[1];
  assert.equal(JSON.parse(decodeURIComponent(escape(Buffer.from(code, 'base64').toString('binary')))).model, 'haiku-4.5');

  const target = createHarness();
  target.context.document.getElementById('impInp_settingsPanel').value = code;
  target.context.importSettings('settingsPanel');
  assert.equal(target.context.S.model, 'haiku-4.5');
  assert.equal(JSON.parse(target.localStorage.value('mb5')).model, 'haiku-4.5');
});

test('Step 9AK: an old code without model keeps the current choice; a junk model gives haiku-5.5', () => {
  const old = createHarness();
  old.context.S.model = 'haiku-4.5';
  old.context.document.getElementById('impInp_settingsPanel').value = settingsCode({
    proxyUrl: 'https://example.test', style: 'concise', tz: 'UTC',
    customTickers: {US: [ticker('MSFT', 'US')], SG: [], HK: []}
  });
  old.context.importSettings('settingsPanel');
  assert.equal(old.context.S.model, 'haiku-4.5');
  assert.equal(JSON.parse(old.localStorage.value('mb5')).model, 'haiku-4.5');

  const junk = createHarness();
  junk.context.S.model = 'haiku-4.5';
  junk.context.document.getElementById('impInp_settingsPanel').value = settingsCode({model: 'claude-haiku-4-5'});
  junk.context.importSettings('settingsPanel');
  assert.equal(junk.context.S.model, 'haiku-5.5');
});

test('Step 9AK: all three storeSave calls carry the model', () => {
  const calls = persistenceSource.match(/storeSave\(\{[^}]*\}\)/g);
  assert.equal(calls.length, 3);
  calls.forEach(call => assert.match(call, /model:S\.model/));

  // Load path that rewrites storage (Step 20B overlap).
  const overlap = createHarness({mb5: JSON.stringify({
    model: 'haiku-4.5',
    customTickers: {US: [ticker('AAPL', 'US')], SG: [], HK: []},
    myStocks: {US: [ticker('AAPL', 'US')], SG: [], HK: []}
  })});
  overlap.context.loadSettings();
  assert.equal(JSON.parse(overlap.localStorage.value('mb5')).model, 'haiku-4.5');
});

function loadAnalysis(model) {
  const S = {
    proxyUrl: 'https://proxy.example', tz: 'Asia/Singapore',
    fixedTickers: [
      {sym: '^DJI', mkt: 'US'}, {sym: '^IXIC', mkt: 'US'},
      {sym: '^GSPC', mkt: 'US'}, {sym: '^RUT', mkt: 'US'},
      {sym: '^STI', mkt: 'SG'}, {sym: '^HSI', mkt: 'HK'}
    ],
    myStocks: {US: [], SG: [], HK: []}, customTickers: {US: [], SG: [], HK: []}
  };
  if (model !== undefined) S.model = model;
  const context = {window: {}, S, Date, Number, String, TypeError, Error, Object, Array, JSON, Promise};
  vm.createContext(context);
  vm.runInContext(analysisSource, context);
  return context.window.MarketBrief.claudeAnalysis;
}

function sgPackage() {
  return {
    market: 'SG',
    marketContext: {
      exchangeTimezone: 'Asia/Singapore', marketState: 'CLOSED',
      primaryCompletedSessionDate: null, includesCurrentOverlay: false, calendarContext: null
    },
    telemetry: {benchmarkSnapshots: [], stockSnapshots: []},
    evidenceContext: {
      evidence: [], materialEvents: [], authoritativeFacts: [], principalCatalysts: [],
      supportingEvidence: [], conflictingEvidence: [], subsequentDevelopments: [],
      sessionAssociations: [], broadMarketFocus: [], unresolvedGaps: [], furtherReadings: []
    }
  };
}

// Records each URL, then fails the request so nothing after the fetch matters.
async function capturedUrls(model, generationId) {
  const api = loadAnalysis(model);
  const urls = [];
  const fetchImpl = async url => { urls.push(url); throw new Error('no network in tests'); };
  await assert.rejects(api.requestMarketBriefPackage({initiatingList: 'myStocks', generationId, fetchImpl}));
  await assert.rejects(api.requestMarketBriefAnalysis({
    filter: 'SG', initiatingList: 'watchlist', marketPackages: [sgPackage()],
    now: '2026-09-06T00:00:00Z', generationId, fetchImpl
  }));
  assert.equal(urls.length, 2);
  return urls;
}

test('Step 9AK: both Generate calls send &model= for the two exact ids', async () => {
  const generationId = '123e4567-e89b-42d3-a456-426614174000';
  for (const model of ['haiku-5.5', 'haiku-4.5']) {
    assert.deepEqual(await capturedUrls(model), [
      'https://proxy.example/api/quote?analysisPackage=1&model=' + model,
      'https://proxy.example/api/quote?claudeAnalysis=1&model=' + model
    ]);
    assert.deepEqual(await capturedUrls(model, generationId), [
      'https://proxy.example/api/quote?analysisPackage=1&generationId=' + generationId + '&model=' + model,
      'https://proxy.example/api/quote?claudeAnalysis=1&generationId=' + generationId + '&model=' + model
    ]);
  }
});

test('Step 9AK: junk or missing model sends no model, and never a claude value', async () => {
  for (const model of [undefined, 'claude-haiku-4-5', '', 'HAIKU-5.5', 'haiku-5.5&x=1']) {
    const urls = await capturedUrls(model);
    urls.forEach(url => {
      assert.doesNotMatch(url, /model=/, String(model));
      assert.doesNotMatch(url, /model=claude/i);
    });
  }
});

test('Step 9AK: legacy ?claude=1 calls do not send a model', () => {
  const lines = appSource.split('\n').filter(line => line.includes('?claude=1'));
  assert.ok(lines.length >= 1);
  lines.forEach(line => assert.doesNotMatch(line, /model/));
});
