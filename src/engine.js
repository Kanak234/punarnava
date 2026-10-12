/*
 * engine.js — Punarnava ka dil. Purana Java lo, rules ek-ek karke chalao,
 * har badlaav ko explanation ke saath record karo.
 *
 * WHY:   VS Code extension, CLI aur future web demo — teeno isi ek pure-JS engine
 *        ko use karte hain. VS Code ka koi import yahan nahi hai, isliye isko
 *        Node mein seedha test kar sakte hain (test/run-tests.js).
 * WHAT:  modernize(source, options) → { code, changes[], warnings[], minJava }
 * FLOW:  extension.js / cli.js → modernize() → har rule: lex → analyze → run →
 *        edits apply → agla rule → final result → panel.js dikhata hai
 */
'use strict';

const { lex, lineStart, lineEnd, lineOf } = require('./lexer');
const { analyze } = require('./structure');
const { explain } = require('./explain');
const { instanceMain, ioPrintln, compactSource } = require('./rules/main-and-io');
const { scannerToIO } = require('./rules/scanner');
const { varLocal, wrapperValueOf, instanceofPattern } = require('./rules/syntax');
const { switchExpression, switchArrow } = require('./rules/switch');
const { textBlock } = require('./rules/textblock');
const { recordClass } = require('./rules/record');

/*
 * ORDER MATTERS:
 *  - switch-expression pehle, switch-arrow baad mein (jo expression nahi ban saka
 *    woh kam se kam arrow ban jaaye)
 *  - scanner-to-io sabse PEHLE: (a) io-println se pehle, taaki prompt wala
 *    `System.out.print("Enter a: ")` readln mein merge ho sake; (b) var-local se
 *    pehle, warna card mein pehle `var sc` dikhta aur phir woh line gayab ho jaati
 *  - instance-main, compact-source se PEHLE (compact file ko `void main()` chahiye)
 */
const RULES = [
  scannerToIO,
  wrapperValueOf,
  varLocal,
  switchExpression,
  switchArrow,
  textBlock,
  instanceofPattern,
  recordClass,
  ioPrintln,
  instanceMain,
  compactSource
];

/** Default ON rules: saare 'safe' wale. 'review' wale student khud ON karta hai. */
function defaultEnabled() {
  return RULES.filter(r => r.safety === 'safe').map(r => r.id);
}

/**
 * @param {string} source  purana Java code
 * @param {{target?:number, enabled?:string[], lang?:'hi'|'en'}} [opts]
 */
function modernize(source, opts = {}) {
  const target = opts.target || 25;
  const enabled = new Set(opts.enabled || defaultEnabled());
  const lang = opts.lang || 'en';   // English default (1.0.1)
  // Windows files mein \r\n hota hai — andar \n par kaam karo, end mein wapas lagao.
  const crlf = /\r\n/.test(source);
  let src = source.replace(/\r\n/g, '\n');
  const changes = [];
  const warnings = [];
  const available = [];   // is file par lag sakne wale (par OFF) review rules

  for (const rule of RULES) {
    if (rule.java > target) continue;               // target Java se naya feature — skip
    const isOn = enabled.has(rule.id);
    let ctx;
    try {
      const lx = lex(src);
      ctx = { src, masked: lx.masked, strings: lx.strings, comments: lx.comments, struct: analyze(lx.masked) };
    } catch (e) { warnings.push('parse: ' + e.message); break; }

    let edits;
    try { edits = rule.run(ctx) || []; }
    catch (e) { warnings.push(rule.id + ': ' + e.message); continue; }
    if (!edits.length) continue;
    if (!isOn) { available.push({ id: rule.id, count: edits.length, safety: rule.safety, ...pick(explain(rule.id, lang)) }); continue; }

    // Overlap check: same edit do baar → ek rakho; asli overlap → poora rule chhod do (safe side)
    edits = dedupe(edits).sort((a, b) => a.start - b.start || a.end - b.end);
    let overlap = false;
    for (let i = 1; i < edits.length; i++) if (edits[i].start < edits[i - 1].end) { overlap = true; break; }
    if (overlap) { warnings.push(rule.id + ': overlapping edits — rule skipped for safety'); continue; }

    // Badlaav ko groups mein record karo (paas-paas ke edits = ek change card)
    const groups = groupEdits(src, edits);
    const next = applyEdits(src, edits);

    // Safety net: braces/parens balance same rehna chahiye
    if (!balanced(next)) { warnings.push(rule.id + ': result looked unbalanced — rule skipped'); continue; }

    // Line numbers: is pass ke src mein. Final file mein alag ho sakte hain —
    // UI final diff alag se dikhata hai, card mein before/after snippet hai.
    for (const g of groups) {
      changes.push({
        rule: rule.id,
        java: rule.java,
        safety: rule.safety,
        line: lineOf(src, g.start),
        before: g.before,
        after: g.after,
        note: g.notes.join(' ') || undefined,
        explanation: explain(rule.id, lang)
      });
    }
    src = next;
  }

  // Imports/class header hatne ke baad file ke shuru mein khaali lines bach jaati
  // hain — unhe saaf karo (agar original mein nahi thi).
  if (!/^\s*\n/.test(source.replace(/\r\n/g, '\n'))) src = src.replace(/^(?:[ \t]*\n)+/, '');
  // 3+ lagataar khaali lines → 1 (rules ke delete se aisa ho sakta hai)
  if (changes.length) src = src.replace(/\n(?:[ \t]*\n){2,}/g, '\n\n');
  const code = crlf ? src.replace(/\n/g, '\r\n') : src;
  const minJava = changes.reduce((mx, c) => Math.max(mx, c.java), 8);
  return { code, changes, warnings, available, minJava, rules: RULES.map(r => ({ id: r.id, java: r.java, safety: r.safety })) };
}

function pick(e) { return e ? { title: e.title, java: e.java, mistake: e.mistake } : {}; }

function dedupe(edits) {
  const seen = new Set();
  return edits.filter(e => { const k = e.start + ':' + e.end + ':' + e.text; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** End se shuru karke edits lagao, taaki pehle wale offsets na khiskein */
function applyEdits(src, edits) {
  let out = src;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** Paas ke edits (1 line ke gap tak) ko ek card mein jodo; before/after snippet banao */
function groupEdits(src, edits) {
  const groups = [];
  for (const e of edits) {
    const ls = lineStart(src, e.start);
    const le = lineEnd(src, Math.max(e.start, e.end - 1));
    const g = groups[groups.length - 1];
    if (g && lineOf(src, ls) - lineOf(src, g.le) <= 2) {
      g.le = Math.max(g.le, le); g.edits.push(e);
    } else groups.push({ start: e.start, ls, le, edits: [e] });
  }
  return groups.map(g => {
    const before = src.slice(g.ls, g.le);
    // group ke edits ko sirf us snippet par lagao
    const local = g.edits.map(e => ({ start: e.start - g.ls, end: e.end - g.ls, text: e.text }));
    const after = applyEdits(before, local.map(x => ({ ...x, end: Math.min(x.end, before.length) })));
    const [b2, a2] = dedentPair(trimBlank(before), trimBlank(after));
    return { start: g.start, before: b2, after: a2, notes: g.edits.map(e => e.note).filter(Boolean) };
  });
}

/** before/after dono se common leading indent hatao (card mein code left-aligned dikhe) */
function dedentPair(a, b) {
  const ind = t => t.split('\n').filter(l => l.trim()).map(l => l.match(/^[ \t]*/)[0].length);
  const all = [...ind(a), ...ind(b)];
  const min = all.length ? Math.min(...all) : 0;
  const cut = t => t.split('\n').map(l => l.slice(Math.min(min, l.match(/^[ \t]*/)[0].length))).join('\n');
  return [cut(a), cut(b)];
}

function trimBlank(s) { return s.replace(/^\s*\n/, '').replace(/\s+$/, ''); }

function balanced(src) {
  const { masked } = lex(src);
  let a = 0, b = 0, c = 0;
  for (const ch of masked) {
    if (ch === '{') a++; else if (ch === '}') a--;
    else if (ch === '(') b++; else if (ch === ')') b--;
    else if (ch === '[') c++; else if (ch === ']') c--;
    if (a < 0 || b < 0 || c < 0) return false;
  }
  return a === 0 && b === 0 && c === 0;
}

/**
 * Line-level diff (LCS) — panel ke side-by-side view ke liye.
 * Return: [{type:'same'|'del'|'add', a?:line, b?:line, text}]
 */
function diffLines(oldText, newText) {
  const A = oldText.replace(/\r\n/g, '\n').split('\n');
  const B = newText.replace(/\r\n/g, '\n').split('\n');
  // Sirf indentation badli ho (compact file mein class hatne se poori body ek
  // level left jaati hai) to line ko "same" maano — warna poori file laal/hari dikhti.
  const kA = A.map(l => l.trim()), kB = B.map(l => l.trim());
  const n = A.length, m = B.length;
  // Bahut badi file par O(n*m) memory — 4000 lines tak theek; usse badi file
  // seekhne wale programs mein hoti nahi.
  if (n * m > 16e6) return [...A.map((t, i) => ({ type: 'del', a: i + 1, text: t })), ...B.map((t, i) => ({ type: 'add', b: i + 1, text: t }))];
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = kA[i] === kB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (kA[i] === kB[j]) { out.push({ type: 'same', a: i + 1, b: j + 1, text: A[i], textB: B[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', a: i + 1, text: A[i] }); i++; }
    else { out.push({ type: 'add', b: j + 1, text: B[j] }); j++; }
  }
  while (i < n) { out.push({ type: 'del', a: i + 1, text: A[i] }); i++; }
  while (j < m) { out.push({ type: 'add', b: j + 1, text: B[j] }); j++; }
  return out;
}

module.exports = { modernize, diffLines, defaultEnabled, RULES };
