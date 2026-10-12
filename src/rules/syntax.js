/*
 * rules/syntax.js — chhote, line-level modern Java rules:
 *   var-local          (Java 10)  `ArrayList<String> l = new ArrayList<String>();` → `var l = ...`
 *   wrapper-valueof    (Java 9)   `new Integer(5)` → `Integer.valueOf(5)`
 *   instanceof-pattern (Java 16)  `if (o instanceof String) { String s = (String) o;` → `if (o instanceof String s) {`
 *
 * WHY:   Yeh woh features hain jo Java 8 se 25 ke beech aaye aur college syllabus
 *        mein aksar nahi padhaye jaate. Learning tool ko pura safar dikhana hai,
 *        sirf Java 25 nahi.
 * FLOW:  engine.js → run(ctx) → edits[]
 */
'use strict';

const { matchBracket, lineStart, lineEnd } = require('../lexer');

/* ─────────────── var-local ─────────────── */

// Type: `Foo`, `java.util.Foo`, `Foo<Bar, Baz<Q>>`, `int[]`, `Foo[][]`
const TYPE = '([A-Za-z_$][\\w$.]*(?:\\s*<[^;=(){}]*>)?(?:\\s*\\[\\s*\\])*)';
const DECL_RE = new RegExp('(^|[;{}]\\s*|\\)\\s*)((?:final\\s+)?)' + TYPE + '\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+', 'gm');

const varLocal = {
  id: 'var-local',
  java: 10,
  safety: 'safe',
  run(ctx) {
    const { masked, struct } = ctx;
    const edits = [];
    DECL_RE.lastIndex = 0;
    let m;
    while ((m = DECL_RE.exec(masked))) {
      const typeStart = m.index + m[1].length + m[2].length;
      const declType = m[3];
      const name = m[4];
      const newStart = m.index + m[0].length;           // `new ` ke baad
      if (/^(return|throw|else|new|case|yield)$/.test(declType)) continue;
      if (/^(var)$/.test(declType)) continue;          // pehle se var
      if (!struct.insideMethod(typeStart)) continue;    // field → var allowed nahi
      // for-loop header ke andar `for (Foo f = new Foo(); ...)` — skip (rare, readability)
      const before = masked.slice(lineStart(masked, typeStart), typeStart);
      if (/\bfor\s*\(\s*$/.test(before)) continue;

      // RHS ka constructed type: `new X<...>(` ya `new int[`
      const rhs = masked.slice(newStart);
      const rm = /^([A-Za-z_$][\w$.]*)(\s*<[^;=(){}]*>)?\s*([(\[])/.exec(rhs);
      if (!rm) continue;
      const newBase = rm[1], newGen = (rm[2] || '').replace(/\s+/g, ''), opener = rm[3];
      const dt = declType.replace(/\s+/g, '');
      // Diamond `<>` → var ke saath type Object ban jaata, isliye skip.
      if (newGen === '<>') continue;

      if (opener === '(') {
        // Declared type == constructed type (generics bhi same). Interface vs
        // class (List l = new ArrayList()) → var se type badal jaata, skip.
        if (dt !== newBase + newGen) continue;
        // Anonymous class `new Foo() { ... }` → var ka type anonymous ban jaata; skip
        const open = newStart + rm[0].length - 1;
        const close = matchBracket(masked, open);
        if (close < 0) continue;
        if (/^\s*\{/.test(masked.slice(close + 1))) continue;
      } else {
        // Array: `int[] a = new int[5];` → declared `int[]`, constructed base `int` + dims
        const dims = (dt.match(/\[\]/g) || []).length;
        const baseDecl = dt.replace(/(\[\])+$/, '');
        if (baseDecl !== newBase || dims === 0 || newGen) continue;
        // `new int[5][3]` dims count compare
        const after = masked.slice(newStart + rm[0].length - 1);
        const dm = /^(\s*\[[^\]]*\])+/.exec(after);
        const newDims = dm ? (dm[0].match(/\[/g) || []).length : 0;
        if (newDims !== dims) continue;
      }
      // Ek hi declaration mein kai variables (`Foo a = new Foo(), b = ...`) — skip
      const semi = findStatementEnd(masked, newStart);
      if (semi < 0) continue;
      if (/,\s*[A-Za-z_$][\w$]*\s*=/.test(stripNested(masked.slice(newStart, semi)))) continue;

      edits.push({ start: typeStart, end: typeStart + declType.length, text: 'var' });
    }
    return edits;
  }
};

function findStatementEnd(masked, from) {
  let depth = 0;
  for (let k = from; k < masked.length; k++) {
    const ch = masked[k];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ';' && depth === 0) return k;
  }
  return -1;
}

/** nested brackets ka content hata do (commas ko top-level par hi dekhna hai) */
function stripNested(s) {
  let out = '', depth = 0;
  for (const ch of s) {
    if ('([{<'.includes(ch)) { depth++; continue; }
    if (')]}>'.includes(ch)) { depth--; continue; }
    if (depth === 0) out += ch;
  }
  return out;
}

/* ─────────────── wrapper-valueof ─────────────── */

const WRAPPERS = ['Integer', 'Long', 'Double', 'Float', 'Short', 'Byte', 'Character', 'Boolean'];
const WRAP_RE = new RegExp('\\bnew\\s+(' + WRAPPERS.join('|') + ')\\s*\\(', 'g');

const wrapperValueOf = {
  id: 'wrapper-valueof',
  java: 9,
  safety: 'safe',
  run(ctx) {
    const { masked } = ctx;
    const edits = [];
    WRAP_RE.lastIndex = 0;
    let m;
    while ((m = WRAP_RE.exec(masked))) {
      const open = m.index + m[0].length - 1;
      const close = matchBracket(masked, open);
      if (close < 0) continue;
      // `new Integer(5) {}` anonymous? wrappers final hain, aisa ho hi nahi sakta — phir bhi check
      if (/^\s*\{/.test(masked.slice(close + 1))) continue;
      // `new Integer[3]`? regex '(' maangta hai, to array waala match hi nahi hota.
      edits.push({ start: m.index, end: open, text: m[1] + '.valueOf' });
    }
    return edits;
  }
};

/* ─────────────── instanceof-pattern ─────────────── */

// if ( x instanceof Type ) {   — x simple identifier, Type bina generics
const IF_RE = /\bif\s*\(\s*([A-Za-z_$][\w$]*)\s+instanceof\s+([A-Za-z_$][\w$.]*)\s*\)\s*\{/g;

const instanceofPattern = {
  id: 'instanceof-pattern',
  java: 16,
  safety: 'safe',
  run(ctx) {
    const { src, masked } = ctx;
    const edits = [];
    IF_RE.lastIndex = 0;
    let m;
    while ((m = IF_RE.exec(masked))) {
      const [, obj, type] = m;
      const braceAt = m.index + m[0].length - 1;
      const close = matchBracket(masked, braceAt);
      if (close < 0) continue;
      // Block ka PEHLA statement: `Type y = (Type) obj;`
      const body = masked.slice(braceAt + 1, close);
      const esc = s => s.replace(/[.$]/g, '\\$&');
      const castRe = new RegExp('^\\s*(?:final\\s+)?' + esc(type) + '\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*\\(\\s*' + esc(type) + '\\s*\\)\\s*' + esc(obj) + '\\s*;');
      const cm = castRe.exec(body);
      if (!cm) continue;
      const y = cm[1];
      // Pattern variable ka naam outer scope ke kisi variable se takraaye nahi
      if (y === obj) continue;
      // `if` ke baad `else` hai aur usme bhi y use hota hai? y sirf then-block mein tha — safe.
      // Cast line hatao (poori line)
      const castStart = braceAt + 1 + cm.index + cm[0].search(/\S/);
      const castEnd = braceAt + 1 + cm.index + cm[0].length;
      const ls = lineStart(src, castStart), le = lineEnd(src, castEnd - 1);
      const fullLine = src.slice(ls, castStart).trim() === '' && src.slice(castEnd, le).trim() === '';
      edits.push({ start: m.index, end: braceAt + 1,
        text: 'if (' + src.slice(m.index, braceAt).replace(/^if\s*\(\s*/, '').replace(/\s*\)\s*$/, '') + ' ' + y + ') {' });
      edits.push(fullLine ? { start: ls, end: Math.min(src.length, le + 1), text: '' } : { start: castStart, end: castEnd, text: '' });
    }
    return edits;
  }
};

module.exports = { varLocal, wrapperValueOf, instanceofPattern };
