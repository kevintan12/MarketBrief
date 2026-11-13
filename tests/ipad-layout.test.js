const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { appSource, appDeclarations } = require('./helpers/app-source');

// Step 9AS.3: layout is decided by matchMedia('(min-width:769px)'), the same test app.css uses.
// detectLayout skips while a form field has focus; one re-check runs on focusout only if a change was skipped.
const layoutSource = appDeclarations('layoutRedrawPending', 'layoutQuery', 'layoutFieldFocused', 'redrawSkippedLayout', 'detectLayout');

function makeHarness(opts = {}) {
  const calls = { renderDesktop: 0, restoreCurrentBrief: 0 };
  const els = {};
  ['desktopWrap', 'mobileWrap', 'mBnav'].forEach(id => { els[id] = { style: {} }; });
  const query = { matches: opts.matches !== false, queries: [] };
  const context = {
    window: {
      innerWidth: 1, // must be ignored: a zoomed iPad reports a small innerWidth
      matchMedia(q) { query.queries.push(q); return query; }
    },
    document: { activeElement: { tagName: 'BODY' }, getElementById: id => els[id] },
    isDesktop: false,
    currentView: 'MyStocks',
    isDashboardView: () => opts.dashboard !== false,
    renderDesktop() { calls.renderDesktop++; },
    restoreCurrentBrief() { calls.restoreCurrentBrief++; }
  };
  vm.createContext(context);
  vm.runInContext(layoutSource, context);
  return { context, calls, els, query };
}

test('the layout comes from matchMedia(min-width:769px), never from innerWidth', () => {
  const desktop = makeHarness({ matches: true });
  assert.deepEqual(desktop.query.queries, ['(min-width:769px)']);
  desktop.context.detectLayout();
  assert.equal(desktop.context.isDesktop, true);
  assert.equal(desktop.els.desktopWrap.style.display, 'flex');
  assert.equal(desktop.els.mobileWrap.style.display, 'none');
  assert.equal(desktop.els.mBnav.style.display, 'none');
  assert.equal(desktop.calls.renderDesktop, 1);

  const phone = makeHarness({ matches: false });
  phone.context.detectLayout();
  assert.equal(phone.context.isDesktop, false);
  assert.equal(phone.els.desktopWrap.style.display, 'none');
  assert.equal(phone.els.mobileWrap.style.display, 'block');
  assert.equal(phone.els.mBnav.style.display, 'flex');
  assert.equal(phone.calls.renderDesktop, 0);
  assert.equal(phone.calls.restoreCurrentBrief, 1);

  const other = makeHarness({ matches: false, dashboard: false });
  other.context.detectLayout();
  assert.equal(other.calls.restoreCurrentBrief, 0);
});

test('a change event with no focused field redraws the new layout', () => {
  const { context, calls, query } = makeHarness();
  context.detectLayout();
  query.matches = false;
  context.detectLayout();
  assert.equal(context.isDesktop, false);
  assert.equal(calls.restoreCurrentBrief, 1);
  query.matches = true;
  context.detectLayout();
  assert.equal(context.isDesktop, true);
  assert.equal(calls.renderDesktop, 2);
});

test('a change with a focused input, textarea or select does not redraw', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    const { context, calls, els, query } = makeHarness();
    context.detectLayout();
    query.matches = false;
    context.document.activeElement = { tagName };
    context.detectLayout();
    assert.equal(calls.renderDesktop + calls.restoreCurrentBrief, 1, tagName);
    assert.equal(context.isDesktop, true);
    assert.equal(els.desktopWrap.style.display, 'flex');
  }
});

test('focusout redraws once after a skipped change, and not at all if none was skipped', () => {
  const { context, calls, query } = makeHarness();
  context.detectLayout();
  context.redrawSkippedLayout(); // nothing skipped: no redraw
  assert.equal(calls.renderDesktop, 1);
  query.matches = false;
  context.document.activeElement = { tagName: 'INPUT' };
  context.detectLayout(); // skipped
  context.document.activeElement = { tagName: 'BODY' };
  context.redrawSkippedLayout();
  assert.equal(context.isDesktop, false);
  assert.equal(calls.restoreCurrentBrief, 1);
  context.redrawSkippedLayout(); // a second focusout does nothing
  assert.equal(calls.restoreCurrentBrief, 1);
  assert.equal(calls.renderDesktop, 1);
});

test('focus moving between fields keeps the skipped change pending', () => {
  const { context, calls, query } = makeHarness();
  context.detectLayout();
  query.matches = false;
  context.document.activeElement = { tagName: 'INPUT' };
  context.detectLayout();
  context.document.activeElement = { tagName: 'TEXTAREA' };
  context.redrawSkippedLayout();
  assert.equal(calls.restoreCurrentBrief, 0);
  context.document.activeElement = { tagName: 'BODY' };
  context.redrawSkippedLayout();
  assert.equal(calls.restoreCurrentBrief, 1);
});

test('boot listens to the matchMedia change event (with an older-browser fallback) and not to resize', () => {
  const onload = appSource.slice(appSource.indexOf('window.onload=function'), appSource.indexOf('function layoutFieldFocused'));
  assert.match(onload, /layoutQuery\.addEventListener\('change',detectLayout\)/);
  assert.match(onload, /layoutQuery\.addListener\(detectLayout\)/);
  assert.match(onload, /document\.addEventListener\('focusout'/);
  assert.doesNotMatch(appSource, /addEventListener\('resize'/);
  assert.doesNotMatch(appDeclarations('detectLayout'), /innerWidth/);
});
