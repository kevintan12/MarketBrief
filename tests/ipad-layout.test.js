const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { appDeclarations } = require('./helpers/app-source');

// Step 9AS.1: detectLayout must not rebuild the page on every resize.
const layoutSource = appDeclarations('lastLayoutDesktop', 'detectLayout');

function makeHarness() {
  const calls = { renderDesktop: 0, restoreCurrentBrief: 0 };
  const els = {};
  ['desktopWrap', 'mobileWrap', 'mBnav'].forEach(id => { els[id] = { style: {} }; });
  const context = {
    window: { innerWidth: 1024 },
    document: { activeElement: { tagName: 'BODY' }, getElementById: id => els[id] },
    isDesktop: false,
    currentView: 'MyStocks',
    isDashboardView: () => true,
    renderDesktop() { calls.renderDesktop++; },
    restoreCurrentBrief() { calls.restoreCurrentBrief++; }
  };
  vm.createContext(context);
  vm.runInContext(layoutSource, context);
  return { context, calls, els };
}
const draws = calls => calls.renderDesktop + calls.restoreCurrentBrief;

test('first call draws the layout', () => {
  const { context, calls, els } = makeHarness();
  context.detectLayout();
  assert.equal(calls.renderDesktop, 1);
  assert.equal(context.isDesktop, true);
  assert.equal(els.desktopWrap.style.display, 'flex');
  assert.equal(els.mobileWrap.style.display, 'none');
});

test('a second call at the same layout (width or height-only resize) draws nothing', () => {
  const { context, calls } = makeHarness();
  context.detectLayout();
  context.window.innerWidth = 820;
  context.detectLayout();
  context.detectLayout();
  assert.equal(draws(calls), 1);
});

test('crossing 769 px draws the new layout', () => {
  const { context, calls, els } = makeHarness();
  context.detectLayout();
  context.window.innerWidth = 600;
  context.detectLayout();
  assert.equal(context.isDesktop, false);
  assert.equal(calls.restoreCurrentBrief, 1);
  assert.equal(els.mobileWrap.style.display, 'block');
  context.detectLayout(); // same mobile layout again
  assert.equal(draws(calls), 2);
  context.window.innerWidth = 769;
  context.detectLayout();
  assert.equal(context.isDesktop, true);
  assert.equal(calls.renderDesktop, 2);
});

test('a focused input, textarea or select blocks the redraw, and the flip is retried after blur', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    const { context, calls } = makeHarness();
    context.detectLayout();
    context.window.innerWidth = 600;
    context.document.activeElement = { tagName };
    context.detectLayout();
    assert.equal(draws(calls), 1, tagName + ' must block the redraw');
    assert.equal(context.isDesktop, true);
    context.document.activeElement = { tagName: 'BODY' };
    context.detectLayout();
    assert.equal(context.isDesktop, false);
    assert.equal(calls.restoreCurrentBrief, 1);
  }
});

test('a focused input on the very first call is not drawn until it loses focus', () => {
  const { context, calls } = makeHarness();
  context.document.activeElement = { tagName: 'INPUT' };
  context.detectLayout();
  assert.equal(draws(calls), 0);
  context.document.activeElement = null;
  context.detectLayout();
  assert.equal(calls.renderDesktop, 1);
});
