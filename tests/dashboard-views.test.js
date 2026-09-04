const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'marketbrief.html'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'dashboard-ui.js'), 'utf8');

function sourceBetween(startText, endText) {
  const start = appSource.indexOf(startText);
  const end = appSource.indexOf(endText, start);
  assert.notEqual(start, -1, `missing source start: ${startText}`);
  assert.notEqual(end, -1, `missing source end: ${endText}`);
  return appSource.slice(start, end);
}

function ticker(sym, mkt) {
  return {sym, name: sym, sub: mkt, flag: mkt, mkt};
}

test('desktop and mobile navigation use the five-item product order', () => {
  const desktop = [...html.matchAll(/id="sn-([^"]+)"/g)].map(match => match[1]);
  const mobile = [...html.matchAll(/id="bn-([^"]+)"/g)].map(match => match[1]);
  const expected = ['MyStocks', 'Watchlist', 'Search', 'Invest', 'Settings'];
  assert.deepEqual(desktop, expected);
  assert.deepEqual(mobile, expected);
  assert.doesNotMatch(html, />\s*Dashboard\s*<\/button>/);
});

test('startup defaults to My Stocks and active ticker source follows the selected view', () => {
  const context = {window: {}};
  vm.createContext(context);
  vm.runInContext(sourceBetween('var MarketBrief =', '// ── Boot'), context);
  vm.runInContext(sourceBetween('function getAllTickers', 'var _quoteFetches'), context);
  context.S.fixedTickers = [ticker('^STI', 'SG')];
  context.S.myStocks = {US: [ticker('VEEV', 'US')], SG: [], HK: []};
  context.S.customTickers = {US: [ticker('AAPL', 'US')], SG: [], HK: []};
  assert.equal(context.currentView, 'MyStocks');
  assert.equal(context.activeTickerList, 'myStocks');
  assert.deepEqual(Array.from(context.getAllTickers(), item => item.sym), ['^STI', 'VEEV']);
  context.activeTickerList = 'customTickers';
  assert.deepEqual(Array.from(context.getAllTickers(), item => item.sym), ['^STI', 'AAPL']);
});

test('switching My Stocks and Watchlist clears prior data and reloads the shared view', () => {
  const elements = {};
  ['vDash', 'vSearch', 'vInvest', 'vSettings',
    'bn-MyStocks', 'bn-Watchlist', 'bn-Search', 'bn-Invest', 'bn-Settings'
  ].forEach(id => {
    elements[id] = {style: {}, classList: {toggle() {}}};
  });
  let loads = 0;
  const context = {
    currentView: 'MyStocks', activeTickerList: 'myStocks', mktData: [{sym: 'VEEV'}],
    isDesktop: false, _tickerDrag: null, savedSearchHTML: '', savedSearchQuery: '',
    document: {
      getElementById(id) { return elements[id] || null; },
      querySelectorAll() { return []; }
    },
    setTimeout() {}, cancelTickerDrag() {}, renderSearchBox() {}, renderSettingsPanelTo() {},
    renderInvestView() {}, renderIndices() {}, updateLiveIndicator() {}, restoreCurrentBrief() {},
    loadDash() { loads++; }, console
  };
  vm.createContext(context);
  vm.runInContext(sourceBetween('function isDashboardView', '// ── Desktop'), context);
  context.showView('Watchlist');
  assert.equal(context.currentView, 'Watchlist');
  assert.equal(context.activeTickerList, 'customTickers');
  assert.equal(context.mktData.length, 0);
  assert.equal(loads, 1);
  context.mktData = [{sym: 'AAPL'}];
  context.showView('MyStocks');
  assert.equal(context.activeTickerList, 'myStocks');
  assert.equal(context.mktData.length, 0);
  assert.equal(loads, 2);
});

test('shared card renderer keeps indices first and uses the active list label', () => {
  function renderFor(activeTickerList) {
    const grid = {innerHTML: '', querySelectorAll() { return []; }};
    const context = {
      mktData: [ticker('AAPL', 'US'), ticker('^DJI', 'US')], curFilter: 'all', activeTickerList,
      document: {getElementById(id) { return id === 'idxGrid' ? grid : null; }, querySelectorAll() { return []; }},
      window: {}, clearTimeout() {}, setTimeout() {},
      esc(value) { return String(value); }, fmt(value) { return String(value); },
      fmtD(value) { return String(value); }, fmtP(value) { return String(value); }
    };
    context.mktData.forEach(item => Object.assign(item, {price: 1, chg: 0, pct: 0}));
    vm.createContext(context);
    vm.runInContext(dashboardSource, context);
    context.renderIndices();
    return grid.innerHTML;
  }
  const mine = renderFor('myStocks');
  assert.ok(mine.indexOf('^DJI') < mine.indexOf('AAPL'));
  assert.match(mine, /US Markets · My Stocks/);
  const watch = renderFor('customTickers');
  assert.match(watch, /US Markets · Watchlist/);
});

test('Market Brief controls are available in both Dashboard-style views', () => {
  assert.match(html, /id="dashboardAIM"/);
  assert.match(html, /Generate Market Brief/);
  assert.doesNotMatch(html, /Generate AI Summary/);
  const desktopSource = sourceBetween('function renderDesktop', 'MarketBrief.searchAI=');
  assert.match(desktopSource, /Generate Market Brief/);
  assert.doesNotMatch(desktopSource, /showAI/);
});
