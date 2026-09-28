'use strict';
// Step 20A: locate code in app.js by name, never by position or neighbour.
// Moving, reordering or deleting other functions must not change what a test loads.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parses(text) {
  try {
    new vm.Script(text);
    return true;
  } catch (error) {
    return false;
  }
}

// Returns the text of the statement starting at `start`: the first closing `}` or `;`
// after which the text compiles. Braces inside strings, regexes or templates cannot end
// it early because a cut inside them does not compile.
function statementFrom(start, label) {
  for (let i = start; i < appSource.length; i++) {
    const ch = appSource[i];
    if (ch !== '}' && ch !== ';') continue;
    let end = i + 1;
    if (ch === '}') {
      const semicolon = /^[ \t]*;/.exec(appSource.slice(end));
      if (semicolon) end += semicolon[0].length;
    }
    const text = appSource.slice(start, end);
    if (parses(text)) return text;
  }
  throw new Error(`app.js: could not find the end of ${label}`);
}

function findUnique(pattern, label) {
  const matches = [...appSource.matchAll(new RegExp(pattern, 'gm'))];
  if (matches.length === 0) throw new Error(`app.js: missing top-level ${label}`);
  if (matches.length > 1) throw new Error(`app.js: ${label} is declared ${matches.length} times at top level`);
  return statementFrom(matches[0].index, label);
}

// Top-level `function NAME`, `async function NAME` or `var NAME` (first name on the line).
function appDeclaration(name) {
  const n = escapeRegExp(name);
  return findUnique(`^(?:(?:async\\s+)?function\\s+${n}\\s*\\(|var\\s+${n}\\b)`, name);
}

// A top-level statement that starts a line with `prefix`, e.g. 'MarketBrief.config ='.
function appStatement(prefix) {
  return findUnique(`^${escapeRegExp(prefix)}`, prefix);
}

function appDeclarations(...names) {
  return names.map(appDeclaration).join('\n');
}

module.exports = { appSource, appDeclaration, appDeclarations, appStatement };
