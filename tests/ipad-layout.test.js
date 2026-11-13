const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { appDeclarations } = require('./helpers/app-source');

// Step 9AS.1b: detectLayout redraws on every resize as before 9AS.1 (commit 7abf096),
// except while a form field has focus; a skipped resize runs once when focus leaves.
const layoutSource = appDeclarations('layoutRedrawPending', 'layoutFieldFocused', 'redrawSkippedLayout', 'detectLayout');

function makeHarness(opts = {}) {
  const calls = { renderDesktop: 0, restoreCurrentBrief: 0 };
  const els = {};
  ['desktopWrap', 'mobileWrap', 'mBnav'].forEach(id => { els[id] = { style: {} }; });
  const context = {
    window: { innerWidth: 1024 },
    document: { activeElement: { tagName: 'BODY' }, getElementById: id => els[id] },
    isDesktop: false,
    currentView: 'MyStocks',
    isDashboardView: () => opts.dashboard !== false,
    renderDesktop() { calls.renderDesktop++; },
    restoreCurrentBrief() { calls.restoreCurrentBrief++; }
  };
  vm.createContext(context);
  vm.runInContext(layoutSource, context);
  return { context, calls, els };
}

test('a resize with no focused field redraws every time, even at the same layout', () => {
  const { context, calls } = makeHarness();
  context.detectLayout();
  context.window.innerWidth = 820;
  context.detectLayout();
  context.detectLayout();
  assert.equal(calls.renderDesktop, 3);
});

test('a resize with a focused input, textarea or select does not redraw or change the layout', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    const { context, calls, els } = makeHarness();
    context.detectLayout();
    context.window.innerWidth = 600;
    context.document.activeElement = { tagName };
    context.detectLayout();
    assert.equal(calls.renderDesktop + calls.restoreCurrentBrief, 1, tagName);
    assert.equal(context.isDesktop, true);
    assert.equal(els.desktopWrap.style.display, 'flex');
  }
});

test('focusout redraws once after a skipped resize, and not at all if none was skipped', () => {
  const { context, calls } = makeHarness();
  context.detectLayout();
  context.redrawSkippedLayout(); // nothing was skipped: no redraw
  assert.equal(calls.renderDesktop, 1);
  context.window.innerWidth = 600;
  context.document.activeElement = { tagName: 'INPUT' };
  context.detectLayout(); // skipped
  context.document.activeElement = { tagName: 'BODY' };
  context.redrawSkippedLayout();
  assert.equal(context.isDesktop, false);
  assert.equal(calls.restoreCurrentBrief, 1);
  context.redrawSkippedLayout(); // second focusout: already done
  assert.equal(calls.restoreCurrentBrief, 1);
  assert.equal(calls.renderDesktop, 1);
});

test('focus moving from one field to another keeps the skipped resize pending', () => {
  const { context, calls } = makeHarness();
  context.detectLayout();
  context.window.innerWidth = 600;
  context.document.activeElement = { tagName: 'INPUT' };
  context.detectLayout();
  context.document.activeElement = { tagName: 'TEXTAREA' }; // focusout, but another field has focus
  context.redrawSkippedLayout();
  assert.equal(calls.restoreCurrentBrief, 0);
  context.document.activeElement = { tagName: 'BODY' };
  context.redrawSkippedLayout();
  assert.equal(calls.restoreCurrentBrief, 1);
});

test('the layout decision matches 7abf096: 769 px and up is desktop, below is mobile', () => {
  const wide = makeHarness();
  wide.context.window.innerWidth = 769;
  wide.context.detectLayout();
  assert.equal(wide.context.isDesktop, true);
  assert.equal(wide.els.desktopWrap.style.display, 'flex');
  assert.equal(wide.els.mobileWrap.style.display, 'none');
  assert.equal(wide.els.mBnav.style.display, 'none');
  assert.equal(wide.calls.renderDesktop, 1);

  const narrow = makeHarness();
  narrow.context.window.innerWidth = 768;
  narrow.context.detectLayout();
  assert.equal(narrow.context.isDesktop, false);
  assert.equal(narrow.els.desktopWrap.style.display, 'none');
  assert.equal(narrow.els.mobileWrap.style.display, 'block');
  assert.equal(narrow.els.mBnav.style.display, 'flex');
  assert.equal(narrow.calls.renderDesktop, 0);
  assert.equal(narrow.calls.restoreCurrentBrief, 1);

  const other = makeHarness({ dashboard: false });
  other.context.window.innerWidth = 500;
  other.context.detectLayout();
  assert.equal(other.calls.restoreCurrentBrief, 0);
});
