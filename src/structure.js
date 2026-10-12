/*
 * structure.js — Java file ka "nakshaa": kaunsa '{' class body hai, kaunsa
 * method/block body, aur top-level types kaun se hain.
 *
 * WHY:   Kai rules ko jaanna padta hai ki code kahan hai. Example: `var` sirf
 *        LOCAL variable par chalta hai (method ke andar), field par nahi. Compact
 *        source file tabhi ban sakti hai jab file mein ek hi top-level class ho.
 * WHAT:  Masked text ko ek baar scan karke har brace pair ko classify karta hai.
 * USE:   rules isse `insideMethod(offset)` aur `topLevelTypes` poochte hain.
 * FLOW:  lexer.lex() → analyze(masked) → rules/*.js
 */
'use strict';

const TYPE_HEADER = /\b(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g;

/**
 * @param {string} masked  lexer se masked source
 */
function analyze(masked) {
  const blocks = [];      // { open, close, kind:'type'|'block', name?, depth }
  const stack = [];
  let lastSemiOrBrace = 0; // header text '{' se pehle kahan se shuru hota hai

  for (let k = 0; k < masked.length; k++) {
    const ch = masked[k];
    if (ch === '{') {
      // '{' se pehle ka header (pichhle ; { } ke baad se) dekh kar decide karo.
      const header = masked.slice(lastSemiOrBrace, k);
      let kind = 'block', name;
      TYPE_HEADER.lastIndex = 0;
      const m = [...header.matchAll(TYPE_HEADER)].pop();
      // "class X ... {" — par agar header mein '(' ke baad class aaya hai (jaise
      // anonymous `new Foo() {`) to woh block hi hai, type nahi.
      if (m && !/\bnew\b/.test(header.slice(m.index + m[0].length))) {
        kind = 'type'; name = m[2];
      } else if (/\bnew\s+[A-Za-z_$][\w$.]*\s*(<[^;]*>)?\s*\([^;]*\)\s*$/.test(header)) {
        // anonymous class: `new Runnable() {` — iske andar ke members FIELDS hain,
        // locals nahi. Isliye ise bhi 'type' maano (naam nahi hota).
        kind = 'type'; name = undefined;
      }
      // `= {` ya `[] {` array initializer bhi block jaisa treat hota hai (method ke andar ho to fine)
      const b = { open: k, close: -1, kind, name, depth: stack.length, headerStart: lastSemiOrBrace };
      blocks.push(b); stack.push(b);
      lastSemiOrBrace = k + 1;
    } else if (ch === '}') {
      const b = stack.pop();
      if (b) b.close = k;
      lastSemiOrBrace = k + 1;
    } else if (ch === ';') {
      lastSemiOrBrace = k + 1;
    }
  }

  const topLevelTypes = blocks.filter(b => b.kind === 'type' && b.depth === 0);

  /** kya offset kisi method/constructor/initializer body ke andar hai? */
  function insideMethod(offset) {
    // Sabse andar wala brace 'block' hona chahiye — tab hi yeh local scope hai.
    const b = innermost(offset);
    return !!b && b.kind === 'block';
  }

  /** offset ke sabse andar wala block */
  function innermost(offset) {
    let best = null;
    for (const b of blocks) if (b.open < offset && (b.close === -1 || offset < b.close)) if (!best || b.depth > best.depth) best = b;
    return best;
  }

  return { blocks, topLevelTypes, insideMethod, innermost };
}

module.exports = { analyze };
