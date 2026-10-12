/*
 * rules/main-and-io.js — Java 25 (JEP 512) wale teen rules:
 *   1. instance-main   : `public static void main(String[] args)` → `void main()`
 *   2. io-println      : `System.out.println(...)` → `IO.println(...)`
 *   3. compact-source  : akeli class ko hata kar compact source file banana
 *
 * WHY:   Yahi woh badlaav hain jo Insta par viral hain, aur juniors yahi nahi
 *        samajh pa rahe. Har rule SAFE tabhi lagta hai jab output same rahe.
 * FLOW:  engine.js → rule.run(ctx) → edits[] → engine apply karta hai
 *
 * Har rule ka contract:
 *   { id, java, safety: 'safe'|'review', run(ctx) → Edit[] }
 *   Edit = { start, end, text }   (ctx.src ke offsets)
 */
'use strict';

const { matchBracket, lineStart, lineEnd } = require('../lexer');
const javabase = require('../../data/javabase.json');

/* ─────────────── 1. instance-main ─────────────── */

// `public static void main(String[] args)` — modifiers kisi bhi order mein,
// `final` param, `String... args` aur `String args[]` teeno purane forms.
const MAIN_RE = /\b(?:(?:public|static|final)\s+){2,3}void\s+main\s*\(\s*(?:final\s+)?String\s*(?:\[\s*\]\s*([A-Za-z_$][\w$]*)|\.\.\.\s*([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*\[\s*\])\s*\)/g;

const instanceMain = {
  id: 'instance-main',
  java: 25,
  safety: 'safe',
  run(ctx) {
    const { masked, struct } = ctx;
    const edits = [];
    MAIN_RE.lastIndex = 0;
    let m;
    while ((m = MAIN_RE.exec(masked))) {
      const header = m[0];
      // sirf `public` aur `static` dono hone chahiye (warna yeh launcher ka main nahi tha)
      if (!/\bpublic\b/.test(header) || !/\bstatic\b/.test(header)) continue;
      const argName = m[1] || m[2] || m[3];

      // Main kis class mein hai? Uski body dhoondho.
      const owner = struct.innermost(m.index);
      if (!owner || owner.kind !== 'type') continue;          // main kisi method ke andar? skip
      const classBody = masked.slice(owner.open, owner.close);

      // SAFETY 1: instance main ke liye launcher `new Class()` karta hai — no-arg
      // constructor chahiye. Agar class mein koi constructor hai jo args leta hai
      // aur no-arg wala nahi hai → skip.
      const ctorRe = new RegExp('\\b' + owner.name + '\\s*\\(([^)]*)\\)\\s*(?:throws[^{]*)?\\{', 'g');
      const ctors = [...classBody.matchAll(ctorRe)].filter(c => !/\bnew\s*$/.test(classBody.slice(0, c.index)));
      if (ctors.length && !ctors.some(c => c[1].trim() === '')) continue;
      // private no-arg constructor bhi launcher nahi bula sakta
      if (/\bprivate\s+/.test(classBody) && new RegExp('\\bprivate\\s+' + owner.name + '\\s*\\(\\s*\\)').test(classBody)) continue;
      // abstract class ka object ban hi nahi sakta
      if (/\babstract\b/.test(masked.slice(owner.headerStart, owner.open))) continue;

      // SAFETY 2: koi aur code `ClassName.main(...)` call karta ho to static hatana
      // use tod dega.
      if (new RegExp('\\b' + owner.name + '\\s*\\.\\s*main\\s*\\(').test(masked)) continue;

      // main ki body: args use ho rahe hain?
      const bodyOpen = masked.indexOf('{', m.index + header.length);
      const bodyClose = matchBracket(masked, bodyOpen);
      if (bodyOpen < 0 || bodyClose < 0) continue;
      // NOTE: `throws X` header ke baad aur '{' se pehle hota hai — hum sirf header
      // (m[0]) replace karte hain, isliye `throws` apne aap bach jaata hai.
      const body = masked.slice(bodyOpen, bodyClose);
      const usesArgs = new RegExp('\\b' + argName.replace(/\$/g, '\\$') + '\\b').test(body);

      const text = usesArgs ? 'void main(String[] ' + argName + ')' : 'void main()';
      edits.push({ start: m.index, end: m.index + header.length, text,
        note: usesArgs ? 'args use ho rahe hain, isliye parameter rakha gaya' : undefined });
    }
    return edits;
  }
};

/* ─────────────── 2. io-println ─────────────── */

const PRINT_RE = /\bSystem\s*\.\s*out\s*\.\s*(println|print)\s*\(/g;

const ioPrintln = {
  id: 'io-println',
  java: 25,
  safety: 'safe',
  run(ctx) {
    const { masked } = ctx;
    const edits = [];
    // char[] variables ko dhoondho: System.out.println(char[]) characters print
    // karta hai, par IO.println(Object) "[C@1b6d3586" print karega — output badal
    // jaata. Aise calls ko chhod do.
    const charArrays = new Set();
    for (const c of masked.matchAll(/\bchar\s*\[\s*\]\s*([A-Za-z_$][\w$]*)|\bchar\s+([A-Za-z_$][\w$]*)\s*\[\s*\]/g)) charArrays.add(c[1] || c[2]);

    PRINT_RE.lastIndex = 0;
    let m;
    while ((m = PRINT_RE.exec(masked))) {
      const open = m.index + m[0].length - 1;
      const close = matchBracket(masked, open);
      if (close < 0) continue;
      const arg = masked.slice(open + 1, close).trim();
      // char[] ya `new char[]...` ya `.toCharArray()` — skip
      if (charArrays.has(arg) || /^new\s+char\b/.test(arg) || /toCharArray\s*\(\s*\)\s*$/.test(arg)) continue;
      edits.push({ start: m.index, end: open, text: 'IO.' + m[1] });
    }
    return edits;
  }
};

/* ─────────────── 3. compact-source ─────────────── */

const compactSource = {
  id: 'compact-source',
  java: 25,
  safety: 'safe',
  run(ctx) {
    const { src, masked, struct } = ctx;
    // SAFETY: package wali file compact nahi ho sakti (implicit class unnamed package mein hoti hai)
    if (/^\s*package\s+[\w.]+\s*;/m.test(masked)) return [];
    // Ek hi top-level type, aur woh plain `class` ho
    const tops = struct.topLevelTypes;
    if (tops.length !== 1) return [];
    const t = tops[0];
    const header = masked.slice(t.headerStart, t.open);
    if (!/\bclass\b/.test(header)) return [];                           // interface/enum/record nahi
    if (/\b(extends|implements|abstract|sealed|permits)\b/.test(header)) return [];
    if (/</.test(header.slice(header.indexOf('class')))) return [];      // generic class
    if (/@/.test(header)) return [];                                     // annotations
    const body = masked.slice(t.open + 1, t.close);
    // Naya `void main()` hona chahiye (instance-main pehle chal chuka hota hai);
    // agar abhi bhi static main hai, compact file mat banao.
    if (!/\bvoid\s+main\s*\(/.test(body)) return [];
    if (/\bstatic\s+void\s+main\s*\(/.test(body)) return [];
    // Implicit class ka naam code se refer nahi ho sakta: `Hello.x`, `new Hello()`,
    // `Hello.class` — kahin bhi naam aaya to skip (constructor bhi isi se pakda jaata hai).
    const nameRe = new RegExp('\\b' + t.name + '\\b', 'g');
    const outside = masked.slice(0, t.headerStart) + masked.slice(t.close + 1);
    if (nameRe.test(body) || new RegExp('\\b' + t.name + '\\b').test(outside)) return [];
    // `this` / `super` explicit use bhi theek hai, par `super` ka koi matlab nahi — skip
    if (/\bsuper\b/.test(body)) return [];

    const edits = [];
    // a) class header line hatao: "public class Hello {" (poori line agar sirf header hai)
    const hStart = firstNonSpace(masked, t.headerStart);
    const hLineStart = lineStart(src, hStart);
    const afterBrace = t.open + 1;
    const hLineEnd = lineEnd(src, t.open);
    const restOfLine = src.slice(afterBrace, hLineEnd);
    // header ke saath us line mein aur kuch (code) ho to skip — formatting ajeeb ho jaayegi
    if (src.slice(hLineStart, hStart).trim() !== '' || restOfLine.trim() !== '' && !/^\s*\/\//.test(restOfLine)) {
      return [];
    }
    // header se pehle ke comments (javadoc) rakho — sirf header line hatao
    edits.push({ start: hLineStart, end: Math.min(src.length, hLineEnd + 1), text: '' });

    // b) closing '}' line hatao
    const cLineStart = lineStart(src, t.close);
    const cLineEnd = lineEnd(src, t.close);
    if (src.slice(cLineStart, t.close).trim() !== '' || src.slice(t.close + 1, cLineEnd).trim() !== '') return [];
    // c) body ko ek level dedent karo (class ka indent hat gaya)
    const bodyStart = Math.min(src.length, hLineEnd + 1);
    const bodyText = src.slice(bodyStart, cLineStart);
    const dedented = dedentOnce(bodyText);
    edits.push({ start: bodyStart, end: cLineStart, text: dedented });
    edits.push({ start: cLineStart, end: Math.min(src.length, cLineEnd + 1), text: '' });

    // d) java.base imports hatao — compact file mein `import module java.base` apne aap hota hai.
    //    Sirf woh single-type imports jinka naam java.base mein unique hai (ambiguity nahi).
    for (const im of masked.matchAll(/^[ \t]*import\s+(?!static\b)([\w.]+?)\.(\*|[A-Z][\w$]*)\s*;[ \t]*\r?\n?/gm)) {
      const pkg = im[1], name = im[2];
      if (!javabase.packages.includes(pkg)) continue;
      if (name !== '*' && javabase.ambiguous.includes(name)) continue;
      // `import java.util.*` hataane se kisi doosre package se clash ho sakta hai agar
      // file kisi non-base on-demand import par bhi depend kare — tab chhod do.
      if (name === '*' && /^[ \t]*import\s+(?!java\.)[\w.]+\.\*\s*;/m.test(masked)) continue;
      edits.push({ start: im.index, end: im.index + im[0].length, text: '' });
    }
    return edits;
  }
};

function firstNonSpace(s, i) { while (i < s.length && /\s/.test(s[i])) i++; return i; }

/** har line se ek indentation level (4 spaces ya 1 tab ya min common) hatao */
function dedentOnce(text) {
  const lines = text.split('\n');
  const indents = lines.filter(l => l.trim()).map(l => l.match(/^[ \t]*/)[0]);
  if (!indents.length) return text;
  // sabse chhota common indent = class ka ek level (aam taur par 4 spaces ya tab)
  let unit = indents.reduce((a, b) => (b.length < a.length ? b : a));
  if (!unit.length) return text;
  return lines.map(l => (l.startsWith(unit) ? l.slice(unit.length) : l.replace(/^[ \t]+/, ''))).join('\n');
}

module.exports = { instanceMain, ioPrintln, compactSource, dedentOnce };
