// Step 9AL: Settings is grouped into General, My Stocks and Watchlist sections. Each section
// remembers its last open/closed state on this device in 'mb_settings_open' (never in mb5 or the
// export code). Nothing valid saved means General open, My Stocks and Watchlist closed.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { appDeclaration, appDeclarations, appStatement } = require('./helpers/app-source');

const stateSource = [
  appDeclaration('MarketBrief'), appStatement('MarketBrief.config ='),
  appDeclarations('S', 'mktData', 'FIXED_SYMS', 'acTimers')
].join('\n');
const settingsListSource = appDeclarations(
  'renderSettingsPanelTo', 'rememberSettingsSections', 'tickerSelectionControls', 'getTickerSelectionBoxes',
  'updateTickerSelectionControls', 'toggleTickerSelection', 'deleteSelectedTickers', 'settAcFetch',
  'filterSettAcResults', 'renderSettAcDrop', 'closeSettAcDrop', 'tickerListLabel', 'tickerListHas',
  'listOverlapNotice', 'removeCrossListDuplicates', 'listOverlapText', 'addTickerDirect', 'removeTicker',
  'moveTicker', 'reorderTickerArray', 'reorderTicker', '_tickerDrag', 'cancelTickerDrag', 'clearTickerDragVisuals',
  'removeTickerDragListeners', 'cancelTickerDragOnEscape', 'moveTickerDrag', 'endTickerDrag', 'finishTickerDrag',
  'positionTickerDragGhost', 'addTickerDragListeners', 'startTickerDrag'
);
const persistenceSource = appDeclarations('exportSettings', 'importSettings', 'storeSave', 'storeLoad', 'saveSettings', 'loadSettings');

const KEY = 'mb_settings_open';
const PID = 'settingsPanel';
const SECTIONS = ['general', 'myStocks', 'watchlist'];
const DEFAULT_OPEN = {general: true, myStocks: false, watchlist: false};

function createStorage(initial = {}, {broken = false} = {}) {
  const values = {...initial};
  const writes = [];
  return {
    getItem(key) {
      if (broken) throw new Error('storage blocked');
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key, value) {
      if (broken) throw new Error('storage blocked');
      writes.push(key);
      values[key] = String(value);
    },
    value(key) { return values[key]; },
    writes
  };
}

// Section elements (sg_*) exist only once drawn, as in a real page; other ids are created on demand.
function createHarness(initialStorage = {}, options = {}) {
  const localStorage = createStorage(initialStorage, options);
  const sessionStorage = createStorage();
  const elements = {};
  const window = {addEventListener() {}, removeEventListener() {}};
  const document = {
    querySelectorAll() { return []; },
    elementFromPoint() { return null; },
    getElementById(id) {
      if (id.startsWith('sg_')) return elements[id] || null;
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
  vm.runInContext(stateSource + settingsListSource + persistenceSource, context);
  if (!context.S.fixedTickers) context.S.fixedTickers = [];
  return {context, elements, localStorage, sessionStorage};
}

function ticker(sym, mkt) {
  return {sym, name: sym, sub: mkt, flag: mkt, mkt};
}

// Draws the panel, then mirrors each drawn section into the fake page (like the browser would).
function render(harness) {
  harness.context.renderSettingsPanelTo(PID);
  syncSections(harness);
  return harness.elements[PID].innerHTML;
}

function syncSections(harness) {
  const html = harness.elements[PID].innerHTML;
  for (const key of SECTIONS) {
    const tag = html.match(new RegExp(`<details class="sgroup" id="sg_${key}_${PID}"[^>]*>`));
    if (tag) harness.elements[`sg_${key}_${PID}`] = {open: / open[ >]/.test(tag[0])};
  }
}

function openState(html) {
  const state = {};
  for (const key of SECTIONS) {
    const tag = html.match(new RegExp(`<details class="sgroup" id="sg_${key}_${PID}"[^>]*>`));
    assert.ok(tag, `section ${key} is drawn`);
    state[key] = / open[ >]/.test(tag[0]);
  }
  return state;
}

// Kevin taps a section header: the browser flips it and fires ontoggle.
function toggle(harness, key) {
  const el = harness.elements[`sg_${key}_${PID}`];
  el.open = !el.open;
  harness.context.rememberSettingsSections(PID);
}

function sectionBody(html, key) {
  const start = html.indexOf(`<details class="sgroup" id="sg_${key}_${PID}"`);
  assert.ok(start >= 0, `section ${key} is drawn`);
  return html.slice(start, html.indexOf('</details>', start));
}

function saveSettingsNow(harness) {
  const doc = harness.context.document;
  doc.getElementById(`cfgProxy_${PID}`).value = 'https://proxy.example';
  doc.getElementById(`cfgStyle_${PID}`).value = 'concise';
  doc.getElementById(`cfgTz_${PID}`).value = 'UTC';
  doc.getElementById(`cfgModel_${PID}`).value = 'haiku-4.5';
  harness.context.saveSettings(PID);
}

test('Step 9AL: Settings has exactly General, My Stocks and Watchlist sections, in that order', () => {
  const html = render(createHarness());
  const ids = [...html.matchAll(/<details class="sgroup" id="sg_([A-Za-z]+)_settingsPanel"/g)].map(m => m[1]);
  assert.deepEqual(ids, SECTIONS);
  const titles = [...html.matchAll(/<summary class="sgroup-head">([^<]*)<\/summary>/g)].map(m => m[1]);
  assert.deepEqual(titles, ['General', 'My Stocks', 'Watchlist']);
  assert.doesNotMatch(html, /Engine|Admin/);
});

test('Step 9AL: each control sits inside its own section', () => {
  const html = render(createHarness());
  const general = sectionBody(html, 'general');
  for (const marker of ['id="cfgStyle_', 'id="cfgTz_', 'id="cfgModel_', 'onclick="exportSettings(', 'id="impInp_',
    'onclick="pasteSettingsCode(', 'onclick="importSettings(', 'id="cfgCurPin_', 'id="cfgNewPin_', 'id="cfgConPin_',
    'onclick="doChangePIN(', 'id="cfgProxy_']) {
    assert.ok(general.includes(marker), `General holds ${marker}`);
  }
  assert.doesNotMatch(general, /settAC_|tickerList_/);
  const myStocks = sectionBody(html, 'myStocks');
  const watchlist = sectionBody(html, 'watchlist');
  for (const [body, own, other] of [[myStocks, 'myStocks', 'customTickers'], [watchlist, 'customTickers', 'myStocks']]) {
    for (const mkt of ['US', 'SG', 'HK']) assert.ok(body.includes(`id="settAC_${own}_${mkt}_${PID}"`));
    assert.ok(body.includes(`id="selectAll_${own}_${PID}"`));
    assert.ok(body.includes(`id="tickerList_${own}_${PID}"`));
    assert.ok(body.includes(`id="listMsg_${own}_${PID}"`));
    assert.ok(!body.includes(`_${other}_`), `no ${other} controls`);
    assert.doesNotMatch(body, /id="cfg|impInp_/);
  }
  assert.match(myStocks, /My Stocks — by Market/);
  assert.match(watchlist, /Watchlist — by Market/);
});

test('Step 9AL: one Save and one save message sit after and outside all sections, with the Disclaimer', () => {
  const html = render(createHarness());
  assert.equal(html.split('onclick="saveSettings(').length - 1, 1);
  assert.equal(html.split('id="saveMsg_').length - 1, 1);
  const lastSectionEnd = html.lastIndexOf('</details>');
  assert.ok(lastSectionEnd < html.indexOf('Disclaimer'));
  assert.ok(html.indexOf('Disclaimer') < html.indexOf('id="saveMsg_'));
  assert.ok(html.indexOf('id="saveMsg_') < html.indexOf('onclick="saveSettings('));
});

test('Step 9AL: sections are <details> with a <summary> header and record their state on toggle', () => {
  const html = render(createHarness());
  assert.equal((html.match(/<details class="sgroup"/g) || []).length, 3);
  assert.equal((html.match(/<summary class="sgroup-head">/g) || []).length, 3);
  assert.equal((html.match(/ontoggle="rememberSettingsSections\('settingsPanel'\)"/g) || []).length, 3);
  assert.doesNotMatch(html, /<details[^>]* name=/, 'no auto-close group');
});

test('Step 9AL: with nothing saved, General is open and the lists are closed; several can be open', () => {
  const harness = createHarness();
  assert.deepEqual(openState(render(harness)), DEFAULT_OPEN);
  toggle(harness, 'myStocks');
  toggle(harness, 'watchlist');
  assert.deepEqual(openState(render(harness)), {general: true, myStocks: true, watchlist: true});
});

test('Step 9AL: Save with every section closed writes the same mb5; toggling never touches mb5', () => {
  const harness = createHarness({[KEY]: 'v1:'});
  assert.deepEqual(openState(render(harness)), {general: false, myStocks: false, watchlist: false});
  saveSettingsNow(harness);
  const saved = JSON.parse(harness.localStorage.value('mb5'));
  assert.deepEqual(Object.keys(saved), ['proxyUrl', 'style', 'tz', 'model', 'customTickers', 'myStocks']);
  assert.equal(saved.proxyUrl, 'https://proxy.example');
  assert.equal(saved.style, 'concise');
  assert.equal(saved.tz, 'UTC');
  assert.equal(saved.model, 'haiku-4.5');
  const before = harness.localStorage.value('mb5');
  for (const key of SECTIONS) toggle(harness, key);
  toggle(harness, 'general');
  assert.equal(harness.localStorage.value('mb5'), before);
});

test('Step 9AL: a fresh load restores the saved state', () => {
  assert.deepEqual(openState(render(createHarness({[KEY]: 'v1:myStocks,watchlist'}))),
    {general: false, myStocks: true, watchlist: true});
  assert.deepEqual(openState(render(createHarness({[KEY]: 'v1:'}))),
    {general: false, myStocks: false, watchlist: false});
  assert.deepEqual(openState(render(createHarness({[KEY]: 'v1:watchlist,general'}))),
    {general: true, myStocks: false, watchlist: true});
});

test('Step 9AL: the state survives rebuilds from ticker add, remove and move', () => {
  const harness = createHarness();
  render(harness);
  toggle(harness, 'general');
  toggle(harness, 'myStocks');
  assert.equal(harness.localStorage.value(KEY), 'v1:myStocks');
  const expected = {general: false, myStocks: true, watchlist: false};
  const {context} = harness;
  context.addTickerDirect('myStocks', 'US', 'AAPL', 'Apple', PID);
  assert.deepEqual(openState(harness.elements[PID].innerHTML), expected);
  syncSections(harness);
  context.addTickerDirect('myStocks', 'US', 'MSFT', 'Microsoft', PID);
  syncSections(harness);
  context.moveTicker('myStocks', 'US', 0, 1, PID);
  assert.deepEqual(openState(harness.elements[PID].innerHTML), expected);
  syncSections(harness);
  context.removeTicker('myStocks', 'US', 0, PID);
  assert.deepEqual(openState(harness.elements[PID].innerHTML), expected);
  assert.deepEqual(JSON.parse(JSON.stringify(context.S.myStocks.US)).map(t => t.sym), ['AAPL']);
});

test('Step 9AL: with storage blocked, a rebuild keeps the state shown on screen', () => {
  const harness = createHarness({}, {broken: true});
  assert.deepEqual(openState(render(harness)), DEFAULT_OPEN);
  assert.doesNotThrow(() => toggle(harness, 'general'));
  toggle(harness, 'watchlist');
  harness.context.addTickerDirect('customTickers', 'US', 'AAPL', 'Apple', PID);
  assert.deepEqual(openState(harness.elements[PID].innerHTML), {general: false, myStocks: false, watchlist: true});
});

test('Step 9AL: missing, junk or other-version values fall back to the default without error', () => {
  for (const value of [undefined, '', 'junk', 'v2:general', 'v1:general,foo', 'v1:general,general', 'v1:general,',
    'V1:myStocks', ' v1:myStocks', '{"general":false,"myStocks":true}', 'null']) {
    const initial = value === undefined ? {} : {[KEY]: value};
    assert.deepEqual(openState(render(createHarness(initial))), DEFAULT_OPEN, String(value));
  }
  assert.deepEqual(openState(render(createHarness({}, {broken: true}))), DEFAULT_OPEN);
  const fixed = createHarness({[KEY]: 'junk'});
  render(fixed);
  toggle(fixed, 'watchlist');
  assert.equal(fixed.localStorage.value(KEY), 'v1:general,watchlist');
});

test('Step 9AL: section state stays out of mb5, the export code and import', () => {
  const harness = createHarness({[KEY]: 'v1:watchlist'});
  render(harness);
  toggle(harness, 'general');
  assert.deepEqual([...new Set(harness.localStorage.writes)], [KEY]);

  harness.context.exportSettings(PID);
  const code = harness.elements[`expOut_${PID}`].innerHTML.match(/readonly>([^<]+)<\/textarea>/)[1];
  const exported = JSON.parse(decodeURIComponent(escape(Buffer.from(code, 'base64').toString('binary'))));
  assert.deepEqual(Object.keys(exported), ['proxyUrl', 'style', 'tz', 'model', 'customTickers', 'myStocks', 'pinHash']);

  const target = createHarness({[KEY]: 'v1:myStocks'});
  const withExtra = Buffer.from(unescape(encodeURIComponent(JSON.stringify({...exported, [KEY]: 'v1:general'}))), 'binary').toString('base64');
  target.context.document.getElementById(`impInp_${PID}`).value = withExtra;
  target.context.importSettings(PID);
  assert.equal(target.localStorage.value(KEY), 'v1:myStocks');
  assert.ok(!Object.prototype.hasOwnProperty.call(JSON.parse(target.localStorage.value('mb5')), KEY));
});

test('Step 9AL: a storage failure while recording never breaks Save Settings', () => {
  const harness = createHarness({}, {broken: true});
  render(harness);
  assert.doesNotThrow(() => harness.context.rememberSettingsSections(PID));
  assert.doesNotThrow(() => harness.context.rememberSettingsSections('missingPanel'));
  saveSettingsNow(harness);
  assert.match(harness.elements[`saveMsg_${PID}`].innerHTML, /✓ Saved \(session only\)\./);
  assert.equal(JSON.parse(harness.sessionStorage.value('mb5')).model, 'haiku-4.5');
});
