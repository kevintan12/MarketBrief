const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const appCssSource = fs.readFileSync(path.join(__dirname, '..', 'app.css'), 'utf8');

function sourceBetween(startText, endText) {
  const start = appSource.indexOf(startText);
  const end = appSource.indexOf(endText, start);
  assert.notEqual(start, -1, `missing source start: ${startText}`);
  assert.notEqual(end, -1, `missing source end: ${endText}`);
  return appSource.slice(start, end);
}

const stateSource = sourceBetween('var MarketBrief =', '// ── Boot');
const navigationSource = sourceBetween('function showView', '// ── Desktop');
const getAllTickersSource = sourceBetween('function getAllTickers', 'var _quoteFetches');
const settingsListSource = sourceBetween('function renderSettingsPanelTo', 'function exportSettings');
const persistenceSource = appSource.slice(appSource.indexOf('function exportSettings'));

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
  const windowListeners = {};
  const window = {
    addEventListener(type, handler) { windowListeners[type] = handler; },
    removeEventListener(type, handler) { if (windowListeners[type] === handler) delete windowListeners[type]; }
  };
  const document = {
    querySelectorAll() { return []; },
    elementFromPoint() { return null; },
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = {
          value: '',
          innerHTML: '',
          textContent: '',
          style: {},
          classList: {toggle() {}, add() {}, remove() {}, contains() { return false; }},
          select() {},
          setSelectionRange() {},
          addEventListener() {},
          appendChild() {}
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
    renderIndices() {}, updateLiveIndicator() {}, console
  };
  vm.createContext(context);
  vm.runInContext(stateSource + navigationSource + getAllTickersSource + settingsListSource + persistenceSource, context);
  return {context, elements, localStorage};
}

function ticker(sym, mkt) {
  return {sym, name: sym, sub: mkt, flag: mkt, mkt};
}

test('old mb5 data without myStocks loads with empty market lists', () => {
  const oldData = {customTickers: {US: [ticker('AAPL', 'US')], SG: [], HK: []}};
  const {context} = createHarness({mb5: JSON.stringify(oldData)});
  context.loadSettings();
  assert.deepEqual(JSON.parse(JSON.stringify(context.S.myStocks)), {US: [], SG: [], HK: []});
  assert.equal(context.S.customTickers.US[0].sym, 'AAPL');
});

test('save and reload preserve myStocks order and customTickers behavior', () => {
  const first = createHarness();
  first.context.S.customTickers.SG.push(ticker('D05.SI', 'SG'));
  first.context.S.myStocks.SG.push(ticker('O39.SI', 'SG'), ticker('C6L.SI', 'SG'));
  first.context.document.getElementById('cfgProxy_settingsPanel').value = '';
  first.context.document.getElementById('cfgStyle_settingsPanel').value = 'detailed';
  first.context.document.getElementById('cfgTz_settingsPanel').value = 'Asia/Singapore';
  first.context.saveSettings('settingsPanel');

  const saved = first.localStorage.value('mb5');
  const second = createHarness({mb5: saved});
  second.context.loadSettings();
  assert.deepEqual(Array.from(second.context.S.myStocks.SG, item => item.sym), ['O39.SI', 'C6L.SI']);
  assert.deepEqual(Array.from(second.context.S.customTickers.SG, item => item.sym), ['D05.SI']);
});

test('export and import preserve myStocks order', () => {
  const source = createHarness();
  source.context.S.customTickers.HK.push(ticker('0700.HK', 'HK'));
  source.context.S.myStocks.HK.push(ticker('9988.HK', 'HK'), ticker('0005.HK', 'HK'));
  source.context.exportSettings('settingsPanel');
  const html = source.elements.expOut_settingsPanel.innerHTML;
  const code = html.match(/readonly>([^<]+)<\/textarea>/)[1];

  const target = createHarness();
  target.context.document.getElementById('impInp_settingsPanel').value = code;
  target.context.importSettings('settingsPanel');
  assert.deepEqual(Array.from(target.context.S.myStocks.HK, item => item.sym), ['9988.HK', '0005.HK']);
  assert.deepEqual(Array.from(target.context.S.customTickers.HK, item => item.sym), ['0700.HK']);
  const persisted = JSON.parse(target.localStorage.value('mb5'));
  assert.deepEqual(persisted.myStocks.HK.map(item => item.sym), ['9988.HK', '0005.HK']);
});

test('old export without myStocks remains compatible', () => {
  const oldPayload = {
    proxyUrl: 'https://example.test', style: 'concise', tz: 'UTC',
    customTickers: {US: [ticker('MSFT', 'US')], SG: [], HK: []}
  };
  const {context, elements, localStorage} = createHarness();
  context.document.getElementById('impInp_settingsPanel').value = Buffer.from(
    unescape(encodeURIComponent(JSON.stringify(oldPayload))), 'binary'
  ).toString('base64');
  context.importSettings('settingsPanel');
  assert.equal(context.S.customTickers.US[0].sym, 'MSFT');
  assert.deepEqual(JSON.parse(JSON.stringify(context.S.myStocks)), {US: [], SG: [], HK: []});
  assert.deepEqual(JSON.parse(localStorage.value('mb5')).myStocks, {US: [], SG: [], HK: []});
});

test('getAllTickers output is unchanged when myStocks changes', () => {
  const {context} = createHarness();
  context.S.customTickers.US.push(ticker('AAPL', 'US'));
  const before = Array.from(context.getAllTickers(), item => item.sym);
  context.S.myStocks.US.push(ticker('VEEV', 'US'));
  context.S.myStocks.SG.push(ticker('D05.SI', 'SG'));
  assert.deepEqual(Array.from(context.getAllTickers(), item => item.sym), before);
  assert.ok(!context.getAllTickers().some(item => item.sym === 'VEEV' || item.sym === 'D05.SI'));
});

test('Settings renders Watchlist and My Stocks through list-aware controls', () => {
  const {context, elements} = createHarness();
  context.S.customTickers.US.push(ticker('AAPL', 'US'));
  context.S.myStocks.US.push(ticker('VEEV', 'US'));
  context.renderSettingsPanelTo('settingsPanel');
  const html = elements.settingsPanel.innerHTML;
  assert.match(html, /Watchlist — by Market/);
  assert.match(html, /My Stocks — by Market/);
  assert.match(html, /settAC_customTickers_US_settingsPanel/);
  assert.match(html, /settAC_myStocks_US_settingsPanel/);
  assert.match(html, /moveTicker\('customTickers','US'/);
  assert.match(html, /moveTicker\('myStocks','US'/);
  assert.match(html, /selectAll_customTickers_settingsPanel/);
  assert.match(html, /selectAll_myStocks_settingsPanel/);
  assert.equal((html.match(/class="ticker-drag-handle"/g) || []).length, 2);
  assert.match(html, /aria-label="Move AAPL up"[^>]* disabled/);
  assert.match(html, /aria-label="Move AAPL down"[^>]* disabled/);
  assert.doesNotMatch(html, /class="ticker-select"[^>]* checked/);
  assert.ok(html.indexOf('My Stocks — by Market') < html.indexOf('Watchlist — by Market'));
  assert.ok(html.indexOf('Change PIN') < html.indexOf('★ Proxy URL'));
  assert.ok(html.indexOf('★ Proxy URL') < html.indexOf('Disclaimer'));
});

test('list-aware add and remove mutate only the requested list', () => {
  const {context} = createHarness();
  context.addTickerDirect('customTickers', 'US', 'AAPL', 'Apple', 'settingsPanel');
  context.addTickerDirect('customTickers', 'US', 'AAPL', 'Apple', 'settingsPanel');
  assert.deepEqual(Array.from(context.S.customTickers.US, item => item.sym), ['AAPL']);
  assert.deepEqual(Array.from(context.S.myStocks.US, item => item.sym), []);

  context.addTickerDirect('myStocks', 'US', 'AAPL', 'Apple', 'settingsPanel');
  context.addTickerDirect('myStocks', 'US', 'AAPL', 'Apple', 'settingsPanel');
  assert.deepEqual(Array.from(context.S.customTickers.US, item => item.sym), ['AAPL']);
  assert.deepEqual(Array.from(context.S.myStocks.US, item => item.sym), ['AAPL']);

  context.removeTicker('myStocks', 'US', 0, 'settingsPanel');
  assert.deepEqual(Array.from(context.S.customTickers.US, item => item.sym), ['AAPL']);
  assert.deepEqual(Array.from(context.S.myStocks.US, item => item.sym), []);
});

test('list-aware reorder preserves Watchlist and My Stocks independently', () => {
  const {context} = createHarness();
  context.S.customTickers.SG.push(ticker('D05.SI', 'SG'), ticker('O39.SI', 'SG'));
  context.S.myStocks.SG.push(ticker('C6L.SI', 'SG'), ticker('Z74.SI', 'SG'));

  context.moveTicker('myStocks', 'SG', 0, 1, 'settingsPanel');
  assert.deepEqual(Array.from(context.S.customTickers.SG, item => item.sym), ['D05.SI', 'O39.SI']);
  assert.deepEqual(Array.from(context.S.myStocks.SG, item => item.sym), ['Z74.SI', 'C6L.SI']);

  context.moveTicker('customTickers', 'SG', 0, 1, 'settingsPanel');
  assert.deepEqual(Array.from(context.S.customTickers.SG, item => item.sym), ['O39.SI', 'D05.SI']);
  assert.deepEqual(Array.from(context.S.myStocks.SG, item => item.sym), ['Z74.SI', 'C6L.SI']);

  context.moveTicker('customTickers', 'SG', 0, -1, 'settingsPanel');
  context.moveTicker('myStocks', 'SG', 1, 1, 'settingsPanel');
  assert.deepEqual(Array.from(context.S.customTickers.SG, item => item.sym), ['O39.SI', 'D05.SI']);
  assert.deepEqual(Array.from(context.S.myStocks.SG, item => item.sym), ['Z74.SI', 'C6L.SI']);
});

function dragClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    contains(name) { return values.has(name); }
  };
}

function pointerEvent(pointerType, handle) {
  return {
    pointerType,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    currentTarget: handle,
    preventDefault() {}
  };
}

function dragRow(listKey, mkt, idx) {
  return {dataset: {listKey, mkt, idx: String(idx)}, classList: dragClassList()};
}

function dragParent(rows) {
  const parent = {
    children: rows.slice(),
    insertBefore(node, reference) {
      this.children = this.children.filter(item => item !== node);
      const index = reference ? this.children.indexOf(reference) : -1;
      if (index < 0) this.children.push(node); else this.children.splice(index, 0, node);
    },
    appendChild(node) { this.children = this.children.filter(item => item !== node); this.children.push(node); },
    querySelectorAll() { return this.children; }
  };
  rows.forEach((row, index) => {
    row.parentNode = parent;
    row.nextSibling = rows[index + 1] || null;
    row.getBoundingClientRect = () => ({left: index * 100, right: index * 100 + 80, top: 0, bottom: 28, width: 80, height: 28});
  });
  return parent;
}

test('mouse drag reorders only the target list and persists through save/reload', () => {
  const harness = createHarness();
  harness.context.S.customTickers.US.push(ticker('AAPL', 'US'), ticker('MSFT', 'US'));
  harness.context.S.myStocks.US.push(ticker('VEEV', 'US'), ticker('NVDA', 'US'));
  const sourceRow = dragRow('customTickers', 'US', 0);
  const targetRow = dragRow('customTickers', 'US', 1);
  dragParent([sourceRow, targetRow]);
  const handle = {parentElement: sourceRow, setPointerCapture() {}};
  harness.context.document.elementFromPoint = () => ({closest: () => targetRow});

  harness.context.startTickerDrag(pointerEvent('mouse', handle), 'customTickers', 'US', 0, 'settingsPanel');
  const move = pointerEvent('mouse', handle); move.clientX = 190; move.clientY = 14;
  harness.context.moveTickerDrag(move);
  harness.context.endTickerDrag(pointerEvent('mouse', handle));
  assert.deepEqual(Array.from(harness.context.S.customTickers.US, item => item.sym), ['MSFT', 'AAPL']);
  assert.deepEqual(Array.from(harness.context.S.myStocks.US, item => item.sym), ['VEEV', 'NVDA']);
  assert.doesNotMatch(harness.elements.settingsPanel.innerHTML, /class="ticker-select"[^>]* checked/);

  harness.context.document.getElementById('cfgProxy_settingsPanel').value = '';
  harness.context.document.getElementById('cfgStyle_settingsPanel').value = 'detailed';
  harness.context.document.getElementById('cfgTz_settingsPanel').value = 'Asia/Singapore';
  harness.context.saveSettings('settingsPanel');
  const reloaded = createHarness({mb5: harness.localStorage.value('mb5')});
  reloaded.context.loadSettings();
  assert.deepEqual(Array.from(reloaded.context.S.customTickers.US, item => item.sym), ['MSFT', 'AAPL']);
  assert.deepEqual(Array.from(reloaded.context.S.myStocks.US, item => item.sym), ['VEEV', 'NVDA']);
});

test('touch drag reorders My Stocks without changing Watchlist or fixed indices', () => {
  const harness = createHarness();
  harness.context.S.customTickers.SG.push(ticker('D05.SI', 'SG'));
  harness.context.S.myStocks.SG.push(ticker('O39.SI', 'SG'), ticker('C6L.SI', 'SG'));
  const fixedBefore = JSON.stringify(harness.context.S.fixedTickers);
  const sourceRow = dragRow('myStocks', 'SG', 1);
  const targetRow = dragRow('myStocks', 'SG', 0);
  dragParent([targetRow, sourceRow]);
  const handle = {parentElement: sourceRow, setPointerCapture() {}};
  harness.context.document.elementFromPoint = () => ({closest: () => targetRow});

  harness.context.startTickerDrag(pointerEvent('touch', handle), 'myStocks', 'SG', 1, 'settingsPanel');
  harness.context.moveTickerDrag(pointerEvent('touch', handle));
  harness.context.endTickerDrag(pointerEvent('touch', handle));
  assert.deepEqual(Array.from(harness.context.S.myStocks.SG, item => item.sym), ['C6L.SI', 'O39.SI']);
  assert.deepEqual(Array.from(harness.context.S.customTickers.SG, item => item.sym), ['D05.SI']);
  assert.equal(JSON.stringify(harness.context.S.fixedTickers), fixedBefore);
});

test('dragged ticker floats while the in-list placeholder reflows before drop', () => {
  const harness = createHarness();
  harness.context.S.customTickers.US.push(ticker('AAPL', 'US'), ticker('MSFT', 'US'), ticker('NVDA', 'US'));
  const ghost = {classList: dragClassList(), style: {}, parentNode: null};
  const rows = [dragRow('customTickers', 'US', 0), dragRow('customTickers', 'US', 1), dragRow('customTickers', 'US', 2)];
  rows.forEach((row, index) => {
    row.getBoundingClientRect = () => ({left: index * 100, top: 0, width: 80, height: 28});
    row.cloneNode = () => ghost;
  });
  const capture = {pointerId: null, listeners: {}};
  const parent = {
    children: rows.slice(),
    insertBefore(node, reference) {
      this.children = this.children.filter(item => item !== node);
      const index = reference ? this.children.indexOf(reference) : -1;
      if (index < 0) this.children.push(node);
      else this.children.splice(index, 0, node);
    },
    appendChild(node) {
      this.children = this.children.filter(item => item !== node);
      this.children.push(node);
    },
    querySelectorAll() { return this.children; },
    setPointerCapture(pointerId) { capture.pointerId = pointerId; },
    hasPointerCapture(pointerId) { return capture.pointerId === pointerId; },
    releasePointerCapture(pointerId) { if (capture.pointerId === pointerId) capture.pointerId = null; },
    addEventListener(type, handler) { capture.listeners[type] = handler; },
    removeEventListener(type, handler) { if (capture.listeners[type] === handler) delete capture.listeners[type]; }
  };
  rows.forEach((row, index) => {
    row.parentNode = parent;
    row.nextSibling = rows[index + 1] || null;
  });
  harness.context.document.body = {
    appendChild(node) { node.parentNode = this; },
    removeChild(node) { node.parentNode = null; }
  };
  let hitRow = rows[1];
  harness.context.document.elementFromPoint = () => ({closest: () => hitRow});
  let handleCaptureCalls = 0;
  const handle = {parentElement: rows[0], setPointerCapture() { handleCaptureCalls += 1; }};
  const start = pointerEvent('mouse', handle);
  start.clientX = 10;
  start.clientY = 10;
  harness.context.startTickerDrag(start, 'customTickers', 'US', 0, 'settingsPanel');
  assert.equal(rows[0].classList.contains('drag-placeholder'), true);
  assert.equal(ghost.classList.contains('ticker-drag-ghost'), true);
  assert.equal(capture.pointerId, 1);
  assert.equal(handleCaptureCalls, 0);

  const move = pointerEvent('mouse', handle);
  move.clientX = 190;
  move.clientY = 14;
  harness.context.moveTickerDrag(move);
  assert.deepEqual(parent.children, [rows[1], rows[0], rows[2]]);
  assert.equal(capture.pointerId, 1);

  hitRow = rows[2];
  move.clientX = 290;
  harness.context.moveTickerDrag(move);
  assert.deepEqual(parent.children, [rows[1], rows[2], rows[0]]);
  assert.equal(capture.pointerId, 1);
  assert.equal(ghost.style.transform, 'translate3d(280px,4px,0) scale(1.03)');
  harness.context._tickerDrag.toIdx = 0;

  const pointerUpOutside = pointerEvent('mouse', handle);
  pointerUpOutside.target = harness.context.document.body;
  harness.context.endTickerDrag(pointerUpOutside);
  assert.deepEqual(Array.from(harness.context.S.customTickers.US, item => item.sym), ['MSFT', 'NVDA', 'AAPL']);
  assert.equal(capture.pointerId, null);
  assert.equal(ghost.parentNode, null);
  assert.match(appCssSource, /\.ticker-row\.drag-placeholder\{[^}]*pointer-events:none/);
  assert.match(appCssSource, /\.ticker-drag-ghost\{[^}]*pointer-events:none/);
});

test('dragging second ticker before first commits the placeholder DOM index', () => {
  const harness = createHarness();
  harness.context.S.myStocks.US.push(ticker('AAPL', 'US'), ticker('MSFT', 'US'));
  const rows = [dragRow('myStocks', 'US', 0), dragRow('myStocks', 'US', 1)];
  const parent = {
    children: rows.slice(),
    insertBefore(node, reference) {
      this.children = this.children.filter(item => item !== node);
      const index = reference ? this.children.indexOf(reference) : -1;
      if (index < 0) this.children.push(node); else this.children.splice(index, 0, node);
    },
    appendChild(node) { this.children = this.children.filter(item => item !== node); this.children.push(node); },
    querySelectorAll() { return this.children; }
  };
  rows.forEach((row, index) => {
    row.parentNode = parent;
    row.nextSibling = rows[index + 1] || null;
    row.getBoundingClientRect = () => ({left: index * 100, top: 0, width: 80, height: 28});
  });
  const handle = {parentElement: rows[1], setPointerCapture() {}};
  harness.context.document.elementFromPoint = () => ({closest: () => rows[0]});
  harness.context.startTickerDrag(pointerEvent('touch', handle), 'myStocks', 'US', 1, 'settingsPanel');
  const move = pointerEvent('touch', handle); move.clientX = 0; move.clientY = 0;
  harness.context.moveTickerDrag(move);
  assert.deepEqual(parent.children, [rows[1], rows[0]]);
  harness.context.endTickerDrag(pointerEvent('touch', handle));
  assert.deepEqual(Array.from(harness.context.S.myStocks.US, item => item.sym), ['MSFT', 'AAPL']);
});

test('pointer release without placeholder movement preserves original order', () => {
  const harness = createHarness();
  harness.context.S.customTickers.HK.push(ticker('0700.HK', 'HK'), ticker('9988.HK', 'HK'));
  const row = dragRow('customTickers', 'HK', 0);
  const handle = {parentElement: row, setPointerCapture() {}};
  harness.context.startTickerDrag(pointerEvent('mouse', handle), 'customTickers', 'HK', 0, 'settingsPanel');
  harness.context.endTickerDrag(pointerEvent('mouse', handle));
  assert.deepEqual(Array.from(harness.context.S.customTickers.HK, item => item.sym), ['0700.HK', '9988.HK']);
});

test('drag cleanup removes clones on cancel, rerender, navigation and replacement drag', () => {
  const harness = createHarness();
  harness.context.S.customTickers.US.push(ticker('AAPL', 'US'), ticker('MSFT', 'US'));
  const rows = [dragRow('customTickers', 'US', 0), dragRow('customTickers', 'US', 1)];
  const parentListeners = {};
  let capturedPointerId = null;
  const parent = {
    children: rows.slice(),
    insertBefore(node, reference) {
      this.children = this.children.filter(item => item !== node);
      const index = reference ? this.children.indexOf(reference) : -1;
      if (index < 0) this.children.push(node); else this.children.splice(index, 0, node);
    },
    appendChild(node) { this.children = this.children.filter(item => item !== node); this.children.push(node); },
    querySelectorAll() { return this.children; },
    setPointerCapture(pointerId) { capturedPointerId = pointerId; },
    hasPointerCapture(pointerId) { return capturedPointerId === pointerId; },
    releasePointerCapture(pointerId) { if (capturedPointerId === pointerId) capturedPointerId = null; },
    addEventListener(type, handler) { parentListeners[type] = handler; },
    removeEventListener(type, handler) { if (parentListeners[type] === handler) delete parentListeners[type]; }
  };
  rows.forEach((row, index) => {
    row.parentNode = parent;
    row.nextSibling = rows[index + 1] || null;
    row.getBoundingClientRect = () => ({left: index * 100, top: 0, width: 80, height: 28});
  });
  const activeGhosts = [];
  harness.context.document.body = {
    appendChild(node) { node.parentNode = this; activeGhosts.push(node); },
    removeChild(node) { node.parentNode = null; const index = activeGhosts.indexOf(node); if (index >= 0) activeGhosts.splice(index, 1); }
  };
  function begin(row, index) {
    const ghost = {classList: dragClassList(), style: {}, parentNode: null};
    row.cloneNode = () => ghost;
    const handle = {
      parentElement: row,
      setPointerCapture() { throw new Error('movable handle must not capture the pointer'); },
      addEventListener() {}, removeEventListener() {}
    };
    harness.context.startTickerDrag(pointerEvent('mouse', handle), 'customTickers', 'US', index, 'settingsPanel');
    return ghost;
  }

  const cancelledGhost = begin(rows[0], 0);
  harness.context.document.elementFromPoint = () => ({closest: () => rows[1]});
  const move = pointerEvent('mouse', {parentElement: rows[0]}); move.clientX = 190; move.clientY = 14;
  harness.context.moveTickerDrag(move);
  assert.equal(capturedPointerId, 1);
  parentListeners.lostpointercapture(pointerEvent('mouse', {parentElement: rows[0]}));
  assert.equal(cancelledGhost.parentNode, null);
  assert.equal(capturedPointerId, null);
  assert.deepEqual(parent.children, rows);
  assert.deepEqual(Array.from(harness.context.S.customTickers.US, item => item.sym), ['AAPL', 'MSFT']);

  const firstGhost = begin(rows[0], 0);
  const replacementGhost = begin(rows[1], 1);
  assert.equal(firstGhost.parentNode, null);
  assert.equal(activeGhosts.length, 1);
  assert.equal(activeGhosts[0], replacementGhost);

  harness.context.renderSettingsPanelTo('settingsPanel');
  assert.equal(replacementGhost.parentNode, null);
  const navigationGhost = begin(rows[0], 0);
  harness.context.currentView = 'Settings';
  harness.context.isDesktop = false;
  harness.context.showView('Dash');
  assert.equal(navigationGhost.parentNode, null);
  assert.equal(activeGhosts.length, 0);
});

function installSelectionDom(harness, listKey, boxes) {
  const pid = 'settingsPanel';
  harness.elements['tickerList_' + listKey + '_' + pid] = {
    querySelectorAll() { return boxes; }
  };
  harness.elements['selectAll_' + listKey + '_' + pid] = {checked: false, indeterminate: false};
  harness.elements['deleteSelected_' + listKey + '_' + pid] = {disabled: true};
}

test('Select All and partial state remain independent per list', () => {
  const harness = createHarness();
  const watchBoxes = [
    {checked: false, dataset: {mkt: 'US', idx: '0'}},
    {checked: false, dataset: {mkt: 'SG', idx: '0'}}
  ];
  const stockBoxes = [{checked: false, dataset: {mkt: 'HK', idx: '0'}}];
  installSelectionDom(harness, 'customTickers', watchBoxes);
  installSelectionDom(harness, 'myStocks', stockBoxes);

  harness.elements.selectAll_customTickers_settingsPanel.checked = true;
  harness.context.toggleTickerSelection('customTickers', 'settingsPanel');
  assert.ok(watchBoxes.every(box => box.checked));
  assert.ok(stockBoxes.every(box => !box.checked));
  assert.equal(harness.elements.selectAll_customTickers_settingsPanel.indeterminate, false);

  watchBoxes[0].checked = false;
  harness.context.updateTickerSelectionControls('customTickers', 'settingsPanel');
  assert.equal(harness.elements.selectAll_customTickers_settingsPanel.checked, false);
  assert.equal(harness.elements.selectAll_customTickers_settingsPanel.indeterminate, true);
  assert.equal(harness.elements.deleteSelected_customTickers_settingsPanel.disabled, false);

  watchBoxes[1].checked = false;
  harness.context.updateTickerSelectionControls('customTickers', 'settingsPanel');
  assert.equal(harness.elements.selectAll_customTickers_settingsPanel.indeterminate, false);
  assert.equal(harness.elements.deleteSelected_customTickers_settingsPanel.disabled, true);
});

test('Delete Selected confirms count, cancel preserves data and confirm deletes only target selection', () => {
  const harness = createHarness();
  harness.context.S.customTickers.US.push(ticker('AAPL', 'US'), ticker('MSFT', 'US'));
  harness.context.S.customTickers.SG.push(ticker('D05.SI', 'SG'));
  harness.context.S.myStocks.US.push(ticker('AAPL', 'US'));
  const boxes = [
    {checked: true, dataset: {mkt: 'US', idx: '0'}},
    {checked: false, dataset: {mkt: 'US', idx: '1'}},
    {checked: true, dataset: {mkt: 'SG', idx: '0'}}
  ];
  installSelectionDom(harness, 'customTickers', boxes);
  let prompt = '';
  harness.context.confirm = message => { prompt = message; return false; };
  harness.context.deleteSelectedTickers('customTickers', 'settingsPanel');
  assert.match(prompt, /2 selected tickers/);
  assert.deepEqual(Array.from(harness.context.S.customTickers.US, item => item.sym), ['AAPL', 'MSFT']);
  assert.deepEqual(Array.from(harness.context.S.customTickers.SG, item => item.sym), ['D05.SI']);

  harness.context.confirm = () => true;
  harness.context.renderSettingsPanelTo = () => {};
  harness.context.deleteSelectedTickers('customTickers', 'settingsPanel');
  assert.deepEqual(Array.from(harness.context.S.customTickers.US, item => item.sym), ['MSFT']);
  assert.deepEqual(Array.from(harness.context.S.customTickers.SG, item => item.sym), []);
  assert.deepEqual(Array.from(harness.context.S.myStocks.US, item => item.sym), ['AAPL']);
});

test('selection is transient and absent from saved and exported settings', () => {
  const harness = createHarness();
  harness.context.S.myStocks.US.push(ticker('VEEV', 'US'));
  harness.context.document.getElementById('cfgProxy_settingsPanel').value = '';
  harness.context.document.getElementById('cfgStyle_settingsPanel').value = 'detailed';
  harness.context.document.getElementById('cfgTz_settingsPanel').value = 'Asia/Singapore';
  harness.context.saveSettings('settingsPanel');
  const saved = JSON.parse(harness.localStorage.value('mb5'));
  assert.equal(Object.prototype.hasOwnProperty.call(saved, 'selection'), false);

  harness.context.exportSettings('settingsPanel');
  const code = harness.elements.expOut_settingsPanel.innerHTML.match(/readonly>([^<]+)<\/textarea>/)[1];
  const exported = JSON.parse(decodeURIComponent(escape(Buffer.from(code, 'base64').toString('binary'))));
  assert.equal(Object.prototype.hasOwnProperty.call(exported, 'selection'), false);

  const reloaded = createHarness({mb5: JSON.stringify(saved)});
  reloaded.context.loadSettings();
  reloaded.context.renderSettingsPanelTo('settingsPanel');
  assert.doesNotMatch(reloaded.elements.settingsPanel.innerHTML, /class="ticker-select"[^>]* checked/);
});
