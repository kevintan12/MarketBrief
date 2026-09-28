'use strict';
// Step 20G: PDF export scripts must load from exact versions, never "latest" or a range,
// so a CDN update cannot change or break PDF export without a code change here.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sources = ['app.js', 'marketbrief.html'].map(function (name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}).join('\n');

const pdfUrls = (sources.match(/https:\/\/(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)\/[^'"\s)]+/g) || [])
  .filter(function (url) { return /pdfmake/i.test(url); });

const EXACT = /^\d+\.\d+\.\d+$/;

function versionOf(url) {
  let match = url.match(/cdnjs\.cloudflare\.com\/ajax\/libs\/[^/]+\/([^/]+)\//);
  if (match) return match[1];
  match = url.match(/\/npm\/(?:@[^/@]+\/)?[^/@]+@([^/]+)\//);
  if (match) return match[1];
  match = url.match(/unpkg\.com\/(?:@[^/@]+\/)?[^/@]+@([^/]+)\//);
  return match ? match[1] : null;
}

test('PDF script URLs are found (guards against a silently empty check)', function () {
  assert.ok(pdfUrls.some(function (u) { return /html-to-pdfmake/.test(u); }), 'html-to-pdfmake URL not found');
  assert.ok(pdfUrls.some(function (u) { return /pdfmake\.min\.js/.test(u); }), 'pdfmake.min.js URL not found');
  assert.ok(pdfUrls.some(function (u) { return /vfs_fonts\.min\.js/.test(u); }), 'vfs_fonts.min.js URL not found');
});

test('every PDF script URL carries an exact x.y.z version', function () {
  pdfUrls.forEach(function (url) {
    const version = versionOf(url);
    assert.ok(version && EXACT.test(version), 'not pinned to an exact version: ' + url + ' (found: ' + version + ')');
  });
});

test('no PDF script URL uses latest or a version range', function () {
  pdfUrls.forEach(function (url) {
    assert.ok(!/@latest|@[\^~>*<]|@\d+(\.\d+)?(\/|$)|\/latest\//.test(url), 'unpinned or ranged URL: ' + url);
  });
});

test('pdfmake.min.js and vfs_fonts.min.js use the same version', function () {
  const core = pdfUrls.find(function (u) { return /pdfmake\.min\.js/.test(u); });
  const fonts = pdfUrls.find(function (u) { return /vfs_fonts\.min\.js/.test(u); });
  assert.ok(core && fonts, 'pdfmake.min.js or vfs_fonts.min.js URL missing');
  assert.strictEqual(versionOf(core), versionOf(fonts));
});
