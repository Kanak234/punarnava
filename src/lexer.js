/*
 * lexer.js — Java source ka "masked" view banata hai.
 *
 * WHY:   Har rule regex/scan se kaam karta hai. Agar hum seedha source par regex
 *        chalayein to `"public static void main"` jaisi string ya ek comment ke
 *        andar likha code bhi badal jaayega — yeh galat hoga.
 * WHAT:  Comments, string literals, text blocks aur char literals ko SAME LENGTH
 *        ke spaces se replace kar deta hai (newlines rakhta hai). Isse har offset
 *        original source ke barabar rehta hai, to rules masked text mein dhoondh
 *        kar original text mein edit kar sakte hain.
 * USE:   engine.js har rule se pehle `lex(src)` call karta hai.
 * FLOW:  lex() → { masked, strings[], comments[] } → rules/*.js
 */
'use strict';

/**
 * @param {string} src  original Java source
 * @returns {{masked:string, strings:Array<{start:number,end:number,kind:string}>, comments:Array<{start:number,end:number}>}}
 */
function lex(src) {
  const out = src.split('');              // array: in-place blanking easy hai
  const strings = [];                      // har string/text-block/char literal ka span
  const comments = [];                     // har comment ka span
  const n = src.length;
  let i = 0;

  // blank(): range ke andar ke characters ko space bana do, par '\n' rehne do —
  // taaki line numbers aur indentation dono same rahein.
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };

  while (i < n) {
    const c = src[i], d = src[i + 1];

    // 1) Line comment:  // ... end-of-line
    if (c === '/' && d === '/') {
      let j = i + 2;
      while (j < n && src[j] !== '\n') j++;
      comments.push({ start: i, end: j });
      blank(i, j); i = j; continue;
    }
    // 2) Block / javadoc comment:  /* ... */
    if (c === '/' && d === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;            // unterminated comment: file ke end tak
      comments.push({ start: i, end: j });
      blank(i, j); i = j; continue;
    }
    // 3) Text block:  """ ... """   (Java 15+) — string se PEHLE check, warna
    //    teen quotes ko teen alag strings samajh lenge.
    if (c === '"' && d === '"' && src[i + 2] === '"') {
      let j = i + 3;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }       // escape skip
        if (src[j] === '"' && src[j + 1] === '"' && src[j + 2] === '"') { j += 3; break; }
        j++;
      }
      strings.push({ start: i, end: j, kind: 'textblock' });
      // quotes ko rehne do (taaki rules ko pata chale yahan ek value hai), andar ka blank
      blank(i + 3, Math.max(i + 3, j - 3)); i = j; continue;
    }
    // 4) Normal string literal: " ... "
    if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"' && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      j = Math.min(n, j + 1);
      strings.push({ start: i, end: j, kind: 'string' });
      blank(i + 1, j - 1); i = j; continue;
    }
    // 5) Char literal: 'a', '\n', '\''  — chhota hota hai, par '"' andar ho sakta hai
    if (c === '\'') {
      let j = i + 1;
      while (j < n && src[j] !== '\'' && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      j = Math.min(n, j + 1);
      strings.push({ start: i, end: j, kind: 'char' });
      blank(i + 1, j - 1); i = j; continue;
    }
    i++;
  }
  return { masked: out.join(''), strings, comments };
}

/**
 * Masked text mein `open` index ('(' ya '{' ya '[') ka matching closing bracket.
 * WHY: method body, switch body, constructor args — sab ka end yahi batata hai.
 * Return: closing ka index, ya -1 agar code adhoora hai.
 */
function matchBracket(masked, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const o = masked[open], cl = pairs[o];
  if (!cl) return -1;
  let depth = 0;
  for (let k = open; k < masked.length; k++) {
    const ch = masked[k];
    if (ch === o) depth++;
    else if (ch === cl) { depth--; if (depth === 0) return k; }
  }
  return -1;
}

/** offset → 1-based line number (UI mein "line 12" dikhane ke liye) */
function lineOf(src, offset) {
  let line = 1;
  for (let k = 0; k < offset && k < src.length; k++) if (src[k] === '\n') line++;
  return line;
}

/** offset wali line ki leading whitespace (naye code ko sahi indent dene ke liye) */
function indentAt(src, offset) {
  let s = offset;
  while (s > 0 && src[s - 1] !== '\n') s--;
  let e = s;
  while (e < src.length && (src[e] === ' ' || src[e] === '\t')) e++;
  return src.slice(s, e);
}

/** line ka start offset */
function lineStart(src, offset) {
  let s = offset;
  while (s > 0 && src[s - 1] !== '\n') s--;
  return s;
}

/** line ka end offset (newline se pehle) */
function lineEnd(src, offset) {
  let e = offset;
  while (e < src.length && src[e] !== '\n') e++;
  return e;
}

module.exports = { lex, matchBracket, lineOf, indentAt, lineStart, lineEnd };
