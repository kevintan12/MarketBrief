const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { appDeclaration, appDeclarations } = require('./helpers/app-source');

// Step 9Y: Paste from Clipboard fills the settings import box and never imports by itself.
const pasteSource = appDeclarations('pasteSettingsCode', 'importSettings');
const settingsPanelSource = appDeclaration('renderSettingsPanelTo');

const FALLBACK = "Couldn't read the clipboard. Tap and hold the box above, then choose Paste.";

function createHarness(clipboard) {
  const elements = {};
  const calls = {storeSave: 0, reload: 0};
  const document = {
    getElementById(id) {
      if (!elements[id]) elements[id] = {value: '', innerHTML: ''};
      return elements[id];
    }
  };
  const context = {
    document,
    navigator: clipboard === undefined ? {} : {clipboard},
    S: {},
    location: {reload() { calls.reload++; }},
    localStorage: {setItem() {}},
    setTimeout() {},
    storeSave() { calls.storeSave++; },
    removeCrossListDuplicates() { return []; },
    listOverlapText() { return ''; },
    esc(value) { return String(value); },
    Promise, String
  };
  vm.createContext(context);
  vm.runInContext(pasteSource, context);
  return {context, elements, calls};
}

test('Step 9Y: pasted code is trimmed into the import box and nothing is imported', async () => {
  const code = 'TWFkZVVwVGVzdENvZGU=';
  const {context, elements, calls} = createHarness({readText: () => Promise.resolve('  \n' + code + ' \n')});
  await context.pasteSettingsCode('settingsPanel');
  assert.equal(elements.impInp_settingsPanel.value, code);
  assert.match(elements.impMsg_settingsPanel.innerHTML, /✓ Code pasted\. Tap Import Settings Code\./);
  assert.equal(calls.storeSave, 0);
  assert.equal(calls.reload, 0);
  assert.equal(Object.keys(context.S).length, 0);
});

test('Step 9Y: a rejected clipboard read shows the fallback and leaves the box unchanged', async () => {
  const {context, elements, calls} = createHarness({readText: () => Promise.reject(new Error('NotAllowedError'))});
  context.document.getElementById('impInp_settingsPanel').value = 'typed-by-hand';
  await context.pasteSettingsCode('settingsPanel');
  assert.equal(elements.impInp_settingsPanel.value, 'typed-by-hand');
  assert.ok(elements.impMsg_settingsPanel.innerHTML.includes(FALLBACK));
  assert.equal(calls.storeSave, 0);
});

test('Step 9Y: a missing clipboard API shows the fallback without throwing', async () => {
  for (const clipboard of [undefined, {}, {readText() { throw new Error('blocked'); }}]) {
    const {context, elements} = createHarness(clipboard);
    await assert.doesNotReject(async () => { await context.pasteSettingsCode('settingsPanel'); });
    assert.ok(elements.impMsg_settingsPanel.innerHTML.includes(FALLBACK));
    assert.equal(elements.impInp_settingsPanel ? elements.impInp_settingsPanel.value : '', '');
  }
});

test('Step 9Y: an empty clipboard shows the fallback', async () => {
  const {context, elements} = createHarness({readText: () => Promise.resolve('   ')});
  await context.pasteSettingsCode('settingsPanel');
  assert.ok(elements.impMsg_settingsPanel.innerHTML.includes(FALLBACK));
});

test('Step 9Y: import box is 16px with keyboard corrections off, Paste sits before Import', () => {
  const boxStart = settingsPanelSource.indexOf('id="impInp_');
  assert.ok(boxStart > 0);
  const box = settingsPanelSource.slice(settingsPanelSource.lastIndexOf('<textarea', boxStart), settingsPanelSource.indexOf('</textarea>', boxStart));
  assert.match(box, /font-size:1rem/);
  assert.doesNotMatch(box, /font-size:0\.8rem/);
  assert.match(box, /autocapitalize="off"/);
  assert.match(box, /autocorrect="off"/);
  assert.match(box, /spellcheck="false"/);
  const pasteAt = settingsPanelSource.indexOf('onclick="pasteSettingsCode(');
  const importAt = settingsPanelSource.indexOf('onclick="importSettings(');
  assert.ok(pasteAt > boxStart, 'Paste button follows the import box');
  assert.ok(pasteAt < importAt, 'Paste button comes before Import');
  assert.match(settingsPanelSource, /📋 Paste from Clipboard/);
  assert.match(settingsPanelSource, /⬇ Import Settings Code/);
});
