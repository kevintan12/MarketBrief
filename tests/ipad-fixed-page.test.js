const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Step 9AS.3: the page is fixed in place; only the ticker list and the report scroll.
const css = fs.readFileSync(path.join(__dirname, '..', 'app.css'), 'utf8');
const block = css.slice(css.indexOf('/* Step 9AS.3'));

function mediaBlock(source, query) {
  const start = source.indexOf(query + '{');
  assert.ok(start >= 0, 'missing ' + query);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unclosed ' + query);
}

test('desktop and tablet layout stops the page scrolling', () => {
  const wide = mediaBlock(block, '@media(min-width:769px)');
  assert.match(wide, /html,body\{overflow:hidden;overscroll-behavior:none;\}/);
  assert.match(wide, /\.app\{height:100vh;height:100dvh;\}/);
  assert.match(wide, /\.sidebar\{height:calc\(100vh - 61px\);height:calc\(100dvh - 61px\);\}/);
  // the vh fallback comes first so a browser without dvh keeps today's value
  assert.ok(wide.indexOf('100vh;') < wide.indexOf('100dvh;'));
});

test('phone layout keeps page scrolling and only caps the report box to the visible height', () => {
  const narrow = mediaBlock(block, '@media(max-width:768px)');
  assert.match(narrow, /#dashboardAIM\{max-height:calc\(100vh - 150px\);max-height:calc\(100dvh - 150px\);\}/);
  assert.doesNotMatch(narrow, /overflow:hidden/);
});

test('the original rules are left in place so earlier pins still hold', () => {
  assert.match(css, /#dashboardAIM\{display:flex;flex-direction:column;max-height:calc\(100vh - 150px\);\}/);
  assert.match(css, /@media\(min-width:769px\)\{\.app\{max-width:1280px;height:100vh;overflow:hidden;/);
  assert.equal((css.match(/html,body\{overflow:hidden/g) || []).length, 1);
});
