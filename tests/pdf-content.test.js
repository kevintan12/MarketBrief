'use strict';
// Step 20J: PDF-only text mapping, single black title rule, and the Carlito font files.
// The on-screen report must never change; everything here applies to the PDF only.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { appDeclaration, appDeclarations } = require('./helpers/app-source');

const root = path.join(__dirname, '..');

const context = vm.createContext({});
vm.runInContext(
  appDeclarations('PDF_SYMBOL_MAP', 'PDF_MAPPED_SYMBOLS_RE', 'PDF_STRIPPED_SYMBOLS_RE', 'stripPdfEmoji', 'PDF_CARLITO_FILES', 'PDF_CARLITO_FONT') +
  ';this.stripPdfEmoji=stripPdfEmoji;this.PDF_CARLITO_FILES=PDF_CARLITO_FILES;this.PDF_CARLITO_FONT=PDF_CARLITO_FONT;',
  context
);
const strip = context.stripPdfEmoji;
const exportSource = appDeclaration('exportToPDF');

test('emoji and flag pairs are stripped', function () {
  assert.strictEqual(strip('🇸🇬 Singapore Markets'), 'Singapore Markets');
  assert.strictEqual(strip('🇺🇸 US 🇭🇰 HK'), 'US HK');
  assert.strictEqual(strip('💼 My Stocks'), 'My Stocks');
  assert.strictEqual(strip('🌏 📰 📊 📈 💰 Regional'), 'Regional');
  assert.strictEqual(strip('shield️ joined‍text'), 'shield joinedtext');
});

test('arrows and punctuation with a font glyph are kept', function () {
  const kept = 'a → b ↑ c ↓ d · e — f – g … h • i › j × k';
  assert.strictEqual(strip(kept), kept);
});

test('triangles map to arrows: ▲ to ↑ and ▼ to ↓', function () {
  assert.strictEqual(strip('rose ▲ 0.42% fell ▼ 0.8%'), 'rose ↑ 0.42% fell ↓ 0.8%');
});

test('✓ ⚠ ✅ ❌ 🔺 🔻 are mapped and other symbols are stripped', function () {
  assert.strictEqual(strip('✓ ok'), '√ ok');
  assert.strictEqual(strip('⚠ risk'), '! risk');
  assert.strictEqual(strip('✅ done'), '√ done');
  assert.strictEqual(strip('❌ failed'), '× failed');
  assert.strictEqual(strip('🔺 up'), '↑ up');
  assert.strictEqual(strip('🔻 down'), '↓ down');
  assert.strictEqual(strip('★ star ✦ spark ⬆ ⬇'), 'star spark ');
});

test('spacing is tidied after stripping', function () {
  assert.strictEqual(strip('(🔴 LIVE as of 10:30)'), '(LIVE as of 10:30)');
  assert.strictEqual(strip('( 🔴 LIVE)'), '(LIVE)');
  assert.strictEqual(strip('Markets (🔴)'), 'Markets ');
  assert.strictEqual(strip('a 📉  b'), 'a b');
  assert.strictEqual(strip('  📉 leading'), ' leading');
  assert.strictEqual(strip('📉 leading'), 'leading');
  assert.doesNotMatch(strip('Hang Seng fell 📉 () today'), /\(\)|  /);
});

test('text without emoji is returned unchanged', function () {
  assert.strictEqual(strip(' spaced  text ( kept ) '), ' spaced  text ( kept ) ');
  assert.strictEqual(strip(''), '');
});

test('exportToPDF passes replaceText to htmlToPdfmake and the on-screen report never uses it', function () {
  assert.match(exportSource, /htmlToPdfmake\(wrappedHtml,\{window:window,replaceText:function\(t\)\{return stripPdfEmoji\(t,!carlitoOk\);\}\}\)/);
  ['formatters.js', 'claude-analysis.js', 'dashboard-ui.js', 'search.js', 'investment.js'].forEach(function (name) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    assert.ok(!/stripPdfEmoji/.test(source), name + ' must not use stripPdfEmoji');
  });
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const uses = appSource.match(/stripPdfEmoji\(/g) || [];
  assert.strictEqual(uses.length, 2, 'stripPdfEmoji should be defined once and called once (inside exportToPDF)');
});

test('exactly one title rule (black, 0.5 pt) and a leading hr is dropped', function () {
  assert.strictEqual((exportSource.match(/type:'line'/g) || []).length, 1);
  assert.match(exportSource, /\{canvas:\[\{type:'line',x1:0,y1:0,x2:514,y2:0,lineWidth:0\.5,lineColor:'#000000'\}\],marginBottom:12\}/);
  assert.ok(!/lineColor:'#cccccc'/.test(exportSource), 'the faint grey title line must be gone');
  assert.match(exportSource, /dropLeadingHr\(_tmpDiv\);/);
  assert.match(appDeclaration('dropLeadingHr'), /querySelector\('hr'\)/);
});

test('Carlito font paths are exact and the files ship with the licence', function () {
  const expected = {
    normal: 'fonts/carlito/Carlito-Regular.ttf',
    bold: 'fonts/carlito/Carlito-Bold.ttf',
    italics: 'fonts/carlito/Carlito-Italic.ttf',
    bolditalics: 'fonts/carlito/Carlito-BoldItalic.ttf'
  };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(context.PDF_CARLITO_FILES)), expected);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(context.PDF_CARLITO_FONT)), {
    normal: 'Carlito-Regular.ttf', bold: 'Carlito-Bold.ttf', italics: 'Carlito-Italic.ttf', bolditalics: 'Carlito-BoldItalic.ttf'
  });
  Object.keys(expected).forEach(function (style) {
    assert.strictEqual(path.basename(expected[style]), context.PDF_CARLITO_FONT[style], 'vfs name must match the file name');
    const rel = expected[style];
    assert.ok(/^fonts\/carlito\/Carlito-[A-Za-z]+\.ttf$/.test(rel), 'not an exact relative path: ' + rel);
    const file = path.join(root, rel);
    assert.ok(fs.existsSync(file), 'missing font file ' + rel);
    const head = fs.readFileSync(file).subarray(0, 4);
    assert.ok(head.equals(Buffer.from([0, 1, 0, 0])) || head.toString('latin1') === 'true', 'not a TrueType file: ' + rel);
  });
  const licence = fs.readFileSync(path.join(root, 'fonts', 'carlito', 'OFL.txt'), 'utf8');
  assert.match(licence, /SIL Open Font License/);
  assert.match(licence, /Carlito/);
});

test('Roboto fallback turns arrows into words', function () {
  assert.strictEqual(strip('rose ↑ 0.4% fell ↓ 0.2% → flat', true), 'rose Up 0.4% fell Down 0.2% to flat');
  assert.strictEqual(strip('▲ 1% ▼ 2% 🔺 🔻', true), 'Up 1% Down 2% Up Down');
  assert.strictEqual(strip('↑', false), '↑');
});
