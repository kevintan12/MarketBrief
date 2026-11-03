// Step 9AA.4: the page draws the Section 4 plain-text table as a real table. All fixtures are
// made-up -- this repo is PUBLIC.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'claude-analysis.js'), 'utf8');

function load() {
  const context = {
    window: {},
    S: {
      proxyUrl: 'https://proxy.example', tz: 'Asia/Singapore',
      fixedTickers: [], myStocks: {US: [], SG: [], HK: []}, customTickers: {US: [], SG: [], HK: []}
    },
    Date, Number, String, TypeError, Error, Object, Array, JSON, Promise
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.MarketBrief.claudeAnalysis;
}

const NAMES = [
  'EXECUTIVE MARKET SUMMARY', 'KEY MARKET DRIVERS', 'STOCKS & SECTORS IN FOCUS',
  'MY STOCKS & WATCHLIST - MATERIAL MOVEMENTS', 'MARKET INTERPRETATION',
  'KEY RISKS & OPPORTUNITIES', 'WHAT TO WATCH FOR NEXT', 'FURTHER READINGS'
];

function envelope() {
  const zones = {US: 'America/New_York'};
  return {
    analysisRequest: {
      selectedScope: 'US', initiatingList: 'myStocks', generatedAt: '2026-11-02T03:29:10.607Z',
      userTimezone: 'Asia/Singapore', reportType: 'MARKET_BRIEF'
    },
    marketPackages: [{
      market: 'US',
      marketContext: {
        exchangeTimezone: zones.US, marketState: 'CLOSED',
        primaryCompletedSessionDate: '2026-10-30', includesCurrentOverlay: false, calendarContext: null
      },
      telemetry: {benchmarkSnapshots: [], stockSnapshots: []},
      evidenceContext: {
        evidence: [], materialEvents: [], authoritativeFacts: [], principalCatalysts: [],
        supportingEvidence: [], conflictingEvidence: [], subsequentDevelopments: [],
        sessionAssociations: [], broadMarketFocus: [], unresolvedGaps: [], furtherReadings: []
      }
    }],
    portfolioContext: {myStocks: [], watchlist: []},
    outputRequirements: {header: 'REPORT HEADER / ANALYSIS CONTEXT', sections: [], maximumWords: 2500}
  };
}

// Renders a report whose Section 4 holds `section4` (and, optionally, Section 3 holds `section3`).
function render(section4, section3 = 'Supported analysis.') {
  const env = envelope();
  const result = {
    status: 'NORMAL',
    reportContext: {
      header: 'REPORT HEADER / ANALYSIS CONTEXT', selectedScope: 'US',
      generatedAt: env.analysisRequest.generatedAt, userTimezone: env.analysisRequest.userTimezone,
      reportType: 'MARKET_BRIEF', markets: ['US']
    },
    sections: NAMES.map((name, index) => ({
      name,
      content: index === 7 ? null : index === 3 ? section4 : index === 2 ? section3 : 'Supported analysis.',
      evidenceRefs: [], telemetryRefs: [], uncertainties: []
    })),
    evidenceReferences: [], furtherReadings: [], evidenceGaps: []
  };
  return load().renderMarketBriefAnalysis(result, env);
}

function sectionFour(html) {
  const start = html.indexOf('4. MY STOCKS &amp; WATCHLIST');
  const end = html.indexOf('5. MARKET INTERPRETATION');
  assert.ok(start !== -1 && end > start);
  return html.slice(start, end);
}

const NEW_TABLE = [
  'Stock | Ticker | Last Price | Change',
  'My Stocks',
  'Capri Holdings | CPRI | $18.68 | ↑ 2.62 (16.31%)',
  'Copart | CPRT | $45.10* | ↓ 0.09 (0.20%)',
  'Flat Co | FLAT | $10.00 | — 0.00 (0.00%)',
  'Watchlist',
  'Not available | XYZ | Not available | Not available',
  'Prices at the close on Fri 30 Oct.',
  'Capri rose after a supported announcement.',
  'No material news for the other stocks.'
].join('\n');

test('new four-column header draws a real table with columns, group rows and a caption', () => {
  const s4 = sectionFour(render(NEW_TABLE));
  assert.equal((s4.match(/<table /g) || []).length, 1);
  assert.match(s4, /<th[^>]*>Stock<\/th><th[^>]*>Ticker<\/th><th[^>]*>Last Price<\/th><th[^>]*>Change<\/th>/);
  assert.match(s4, /<td colspan="4"[^>]*>My Stocks<\/td>/);
  assert.match(s4, /<td colspan="4"[^>]*>Watchlist<\/td>/);
  assert.ok(s4.indexOf('>My Stocks<') < s4.indexOf('>Capri Holdings<'));
  assert.ok(s4.indexOf('>Capri Holdings<') < s4.indexOf('>Watchlist<'));
  assert.match(s4, /<td[^>]*>Capri Holdings<\/td><td[^>]*>CPRI<\/td><td[^>]*>\$18\.68<\/td><td[^>]*>↑ 2\.62 \(16\.31%\)<\/td>/);
  assert.equal((s4.match(/<tr>/g) || []).length, 1 + 2 + 3 + 1);
  assert.match(s4, /<\/table><\/div><div[^>]*font-size:0\.85rem[^>]*>Prices at the close on Fri 30 Oct\.<\/div>/);
  assert.doesNotMatch(s4, /Stock \| Ticker/);
});

test('numbers are right-aligned, names and tickers left-aligned, table sits in its own scroll box', () => {
  const s4 = sectionFour(render(NEW_TABLE));
  assert.match(s4, /<div style="overflow-x:auto;[^"]*"><table /);
  assert.match(s4, /<th[^>]*text-align:left[^>]*>Stock<\/th>/);
  assert.match(s4, /<th[^>]*text-align:left[^>]*>Ticker<\/th>/);
  assert.match(s4, /<th[^>]*text-align:right[^>]*>Last Price<\/th>/);
  assert.match(s4, /<th[^>]*text-align:right[^>]*>Change<\/th>/);
  assert.match(s4, /<td[^>]*text-align:left[^>]*>CPRI<\/td>/);
  assert.match(s4, /<td[^>]*text-align:right;[^>]*white-space:nowrap[^>]*>\$18\.68<\/td>/);
});

test('arrows follow the page colours: up green, down red, flat and Not available grey', () => {
  const s4 = sectionFour(render(NEW_TABLE));
  assert.match(s4, /<td[^>]*color:var\(--grn\)[^>]*>↑ 2\.62 \(16\.31%\)<\/td>/);
  assert.match(s4, /<td[^>]*color:var\(--red\)[^>]*>↓ 0\.09 \(0\.20%\)<\/td>/);
  assert.match(s4, /<td[^>]*color:var\(--mut\)[^>]*>— 0\.00 \(0\.00%\)<\/td>/);
  assert.match(s4, /<td[^>]*color:var\(--mut\)[^>]*>Not available<\/td><td[^>]*>XYZ<\/td><td[^>]*color:var\(--mut\)[^>]*>Not available<\/td><td[^>]*color:var\(--mut\)[^>]*>Not available<\/td>/);
});

test('the * on a last-close price is kept as written', () => {
  assert.match(sectionFour(render(NEW_TABLE)), /<td[^>]*>\$45\.10\*<\/td>/);
});

test('colours and borders sit on each element so the PDF swap works (no classes needed)', () => {
  const s4 = sectionFour(render(NEW_TABLE));
  const cells = s4.match(/<t[dh] [^>]*>/g);
  assert.ok(cells.length > 10);
  cells.forEach(tag => assert.match(tag, /border:1px solid var\(--bor\)/));
  assert.doesNotMatch(s4, /class="(up|dn|neu)"/);
});

test('all six known note wordings are drawn as a small grey caption under the table', () => {
  const notes = [
    'Prices at the close on Fri 30 Oct.',
    'Prices at the latest close.',
    'Live prices at 12:58 pm ET; * last close.',
    '* No live prices yet; last close on Fri 4 Sep.',
    '* No live prices yet; last close.',
    'Prices not available.'
  ];
  notes.forEach(note => {
    const s4 = sectionFour(render(['Stock | Ticker | Last Price | Change', 'My Stocks', 'A Co | AAA | $1.00 | ↑ 1.00 (1.00%)', note].join('\n')));
    assert.ok(s4.includes('</table></div><div style="color:var(--mut);font-size:0.85rem;margin-bottom:8px;">' + note.replace(/&/g, '&amp;') + '</div>'), note);
  });
});

test('an unknown note stays a normal line, not a caption', () => {
  const s4 = sectionFour(render(['Stock | Ticker | Last Price | Change', 'My Stocks', 'A Co | AAA | $1.00 | ↑ 1.00 (1.00%)', 'Some other note.'].join('\n')));
  assert.match(s4, /<\/table><\/div><div style="font-size:1\.05rem[^"]*">Some other note\.<\/div>/);
  assert.doesNotMatch(s4, /font-size:0\.85rem;margin-bottom:8px/);
});

test('explanation paragraphs and the closing line are drawn as ordinary lines, outside the table', () => {
  const s4 = sectionFour(render(NEW_TABLE));
  const after = s4.slice(s4.indexOf('</table>'));
  assert.match(after, /<div style="font-size:1\.05rem[^"]*">Capri rose after a supported announcement\.<\/div>/);
  assert.match(after, /<div style="font-size:1\.05rem[^"]*">No material news for the other stocks\.<\/div>/);
  assert.doesNotMatch(s4.slice(0, s4.indexOf('</table>')), /Capri rose after/);
});

test('old three-column reports still draw: Name (TICKER) | Price | Change', () => {
  const old = ['Stock | Price | Change', 'My Stocks', 'Capri Holdings (CPRI) | $105.00 | ↑ 3.00 (2.94%)', 'Copart (CPRT) | $45.10 | ↓ 0.09 (0.20%)', 'Prices at the latest close.'].join('\n');
  const s4 = sectionFour(render(old));
  assert.equal((s4.match(/<table /g) || []).length, 1);
  assert.match(s4, /<th[^>]*>Stock<\/th><th[^>]*>Price<\/th><th[^>]*>Change<\/th>/);
  assert.match(s4, /<td colspan="3"[^>]*>My Stocks<\/td>/);
  assert.match(s4, /<td[^>]*text-align:left[^>]*>Capri Holdings \(CPRI\)<\/td><td[^>]*text-align:right[^>]*>\$105\.00<\/td><td[^>]*color:var\(--grn\)[^>]*>↑ 3\.00 \(2\.94%\)<\/td>/);
  assert.match(s4, /<td[^>]*color:var\(--red\)[^>]*>↓ 0\.09 \(0\.20%\)<\/td>/);
  assert.match(s4, /<div[^>]*font-size:0\.85rem[^>]*>Prices at the latest close\.<\/div>/);
});

test('a report with no table is drawn exactly as before', () => {
  const text = 'Capri rose after news.\n\nNo material news for the other stocks.';
  const withText = render(text);
  assert.doesNotMatch(sectionFour(withText), /<table/);
  // Identical to what the unchanged line renderer produces for any other section.
  const same = render('Supported analysis.', text);
  const s3 = same.slice(same.indexOf('3. STOCKS &amp; SECTORS IN FOCUS'), same.indexOf('4. MY STOCKS'));
  const s3Body = s3.slice(s3.indexOf('</div>') + 6);
  const s4Body = sectionFour(withText).slice(sectionFour(withText).indexOf('</div>') + 6);
  assert.equal(s4Body.replace(/<div style="color:var\(--mut\)[^]*$/, ''), s3Body.replace(/<div style="color:var\(--mut\)[^]*$/, ''));
});

test('a header that is not the first non-blank line leaves the whole text as plain lines', () => {
  const text = 'Intro line first.\n' + NEW_TABLE;
  const s4 = sectionFour(render(text));
  assert.doesNotMatch(s4, /<table/);
  assert.match(s4, /Stock \| Ticker \| Last Price \| Change/);
});

test('blank lines before the header are skipped and the table is still drawn', () => {
  assert.match(sectionFour(render('\n\n' + NEW_TABLE)), /<table /);
});

test('a header with different wording or case is not treated as a table', () => {
  const s4 = sectionFour(render(['Stock | Ticker | Price | Change', 'A Co | AAA | $1.00 | ↑ 1.00 (1.00%)'].join('\n')));
  assert.doesNotMatch(s4, /<table/);
});

test('one stock: header, one group row, one data row, note', () => {
  const s4 = sectionFour(render(['Stock | Ticker | Last Price | Change', 'Watchlist', 'Solo Inc | SOLO | $5.00 | ↓ 0.50 (9.09%)', 'Prices at the latest close.', 'No material news for this stock.'].join('\n')));
  assert.equal((s4.match(/<tr>/g) || []).length, 3);
  assert.doesNotMatch(s4, />My Stocks</);
  assert.match(s4, /No material news for this stock\./);
});

test('every row Not available: all grey, table still drawn, note shown', () => {
  const s4 = sectionFour(render(['Stock | Ticker | Last Price | Change', 'My Stocks', 'Not available | AAA | Not available | Not available', 'Not available | BBB | Not available | Not available', 'Prices not available.', 'No material news for all stocks.'].join('\n')));
  assert.equal((s4.match(/>Not available</g) || []).length, 6);
  assert.doesNotMatch(s4, /color:var\(--grn\)|color:var\(--red\)/);
  assert.match(s4, /Prices not available\./);
});

test('a malformed line (too few or too many cells) is a grey full-width row and the table continues', () => {
  const s4 = sectionFour(render(['Stock | Ticker | Last Price | Change', 'My Stocks', 'Short | SHT | $1.00', 'Good Co | GOOD | $2.00 | ↑ 1.00 (1.00%)', 'Long | LNG | $3.00 | ↑ 1.00 (1.00%) | extra', 'Last Co | LAST | $4.00 | ↓ 1.00 (1.00%)', 'Prices at the latest close.'].join('\n')));
  assert.equal((s4.match(/<table /g) || []).length, 1);
  assert.match(s4, /<td colspan="4"[^>]*color:var\(--mut\)[^>]*>Short \| SHT \| \$1\.00<\/td>/);
  assert.match(s4, /<td colspan="4"[^>]*color:var\(--mut\)[^>]*>Long \| LNG \| \$3\.00 \| ↑ 1\.00 \(1\.00%\) \| extra<\/td>/);
  assert.match(s4, /<td[^>]*>Good Co<\/td>/);
  assert.match(s4, /<td[^>]*>Last Co<\/td>/);
  assert.match(s4, /Prices at the latest close\./);
});

test('report text is escaped in every cell, group label, note-like line and malformed row', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const s4 = sectionFour(render([
    'Stock | Ticker | Last Price | Change', 'My Stocks',
    evil + ' | <script>x</script> | "$1" | \'↑\' & 1',
    'bad ' + evil + ' | row',
    'Prices at the latest close.', evil
  ].join('\n')));
  assert.doesNotMatch(s4, /<img|<script/);
  assert.match(s4, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(s4, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(s4, /&quot;\$1&quot;/);
  assert.match(s4, /&#39;↑&#39; &amp; 1/);
});

test('a table-looking text in any other section is left as plain lines', () => {
  const html = render('Supported analysis.', NEW_TABLE);
  assert.equal((html.match(/<table class="section-four-table"/g) || []).length, 0);
  assert.match(html, /Stock \| Ticker \| Last Price \| Change/);
});

test('an empty-list Section 4 sentence (no table) is unchanged', () => {
  const s4 = sectionFour(render('You have no stocks in My Stocks or the Watchlist.'));
  assert.doesNotMatch(s4, /<table/);
  assert.match(s4, />You have no stocks in My Stocks or the Watchlist\.<\/div>/);
});
