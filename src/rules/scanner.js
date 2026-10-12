/*
 * rules/scanner.js — `Scanner` input ko Java 25 ke `IO.readln()` mein badalna.
 *
 * WHY:   Kanak ke juniors ka sabse bada confusion: "naye Java mein Scanner import
 *        kahan gaya?". Yeh rule dikhata hai ki `Scanner sc = new Scanner(System.in);
 *        int a = sc.nextInt();` ab `int a = Integer.parseInt(IO.readln());` hai.
 * SAFETY: 'review' — kyunki Scanner TOKEN padhta hai aur readln poori LINE. Agar
 *        user ek line mein "10 20" likhe, naya code fail karega. Isliye yeh rule
 *        panel mein default OFF aata hai; student khud tick karke seekhta hai.
 * FLOW:  engine.js → run(ctx) → edits[] (declaration hatao, har read badlo,
 *        close() hatao, import hatao)
 */
'use strict';

const { lineStart, lineEnd } = require('../lexer');

// Scanner method → naya expression. `%P` ki jagah IO.readln(...) ka call aata hai.
const READS = {
  nextLine:    { tpl: '%P',                         token: false },
  next:        { tpl: '%P.trim()',                  token: true },
  nextInt:     { tpl: 'Integer.parseInt(%P.trim())', token: true },
  nextLong:    { tpl: 'Long.parseLong(%P.trim())',   token: true },
  nextShort:   { tpl: 'Short.parseShort(%P.trim())', token: true },
  nextByte:    { tpl: 'Byte.parseByte(%P.trim())',   token: true },
  nextDouble:  { tpl: 'Double.parseDouble(%P.trim())', token: true },
  nextFloat:   { tpl: 'Float.parseFloat(%P.trim())', token: true },
  nextBoolean: { tpl: 'Boolean.parseBoolean(%P.trim())', token: true }
};

const scannerToIO = {
  id: 'scanner-to-io',
  java: 25,
  safety: 'review',
  run(ctx) {
    const { src, masked } = ctx;
    const edits = [];
    const declRe = /(?:\b(?:private|public|protected|static|final)\s+)*\b(?:Scanner|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Scanner\s*\(\s*System\s*\.\s*in\s*\)\s*;/g;
    const decls = [...masked.matchAll(declRe)];
    if (decls.length !== 1) return [];              // 0 ya kai scanners — complex, skip
    const decl = decls[0];
    const v = decl[1];

    // Variable ke saare uses check karo — sirf supported calls hone chahiye.
    const useRe = new RegExp('\\b' + v + '\\b', 'g');
    const uses = [];
    let u;
    while ((u = useRe.exec(masked))) {
      if (u.index >= decl.index && u.index < decl.index + decl[0].length) continue; // declaration khud
      const after = masked.slice(u.index + v.length);
      const call = /^\s*\.\s*([A-Za-z]+)\s*\(\s*\)/.exec(after);
      if (!call) return [];                          // sc ko kahin pass kiya / hasNext() etc → skip
      const method = call[1];
      if (method !== 'close' && !READS[method]) return [];   // hasNextInt, useDelimiter ... unsupported
      uses.push({ start: u.index, end: u.index + v.length + call[0].length, method });
    }
    if (!uses.length) return [];

    // Declaration line hatao
    edits.push(lineDelete(src, decl.index, decl.index + decl[0].length));

    let prevWasToken = false;
    for (const use of uses) {
      const stmt = statementAround(masked, use.start);
      const stmtText = masked.slice(stmt.start, stmt.end).trim();
      const isStandalone = stmtText.replace(/\s+/g, '') === masked.slice(use.start, use.end).replace(/\s+/g, '') + ';';

      if (use.method === 'close') {
        if (!isStandalone) return [];               // `if (x) sc.close();` jaisa — skip, safe raho
        edits.push(lineDelete(src, stmt.start, stmt.end));
        continue;
      }
      const r = READS[use.method];

      // Famous "buffer saaf karne wala" `sc.nextLine();` — nextInt() ke baad bacha
      // hua newline khaane ke liye likha jaata hai. Line-based reading mein koi
      // newline bachta hi nahi, isliye ise HATANA hai (warna ek real line kha lega).
      if (use.method === 'nextLine' && isStandalone && prevWasToken) {
        edits.push(lineDelete(src, stmt.start, stmt.end));
        prevWasToken = false;
        continue;
      }

      // Prompt merge: pichhla statement `System.out.print("Enter a: ");` ho to
      // use hata kar `IO.readln("Enter a: ")` bana do — naya Java ka sabse saaf form.
      let prompt = '';
      const prev = previousStatement(masked, stmt.start);
      if (prev && !isStandalone) {
        const prevSrc = src.slice(prev.start, prev.end).trim();
        const pm = /^System\s*\.\s*out\s*\.\s*print\s*\(\s*("(?:[^"\\\n]|\\.)*")\s*\)\s*;$/.exec(prevSrc);
        if (pm && onlyWhitespaceBetween(masked, prev.end, stmt.start)) {
          prompt = pm[1];
          edits.push(lineDelete(src, prev.start, prev.end));
        }
      }
      const readCall = 'IO.readln(' + prompt + ')';
      edits.push({ start: use.start, end: use.end, text: r.tpl.replace('%P', readCall) });
      prevWasToken = r.token;
    }

    // `import java.util.Scanner;` hatao agar file mein ab koi Scanner nahi bacha
    const scannerMentions = [...masked.matchAll(/\bScanner\b/g)].filter(x => !(x.index >= decl.index && x.index < decl.index + decl[0].length));
    const imp = /^[ \t]*import\s+java\s*\.\s*util\s*\.\s*Scanner\s*;[ \t]*\r?\n?/m.exec(masked);
    if (imp && scannerMentions.length === 1) edits.push({ start: imp.index, end: imp.index + imp[0].length, text: '' });

    return edits;
  }
};

/** offset wala statement: pichhle ; { } ke baad se agle ; tak */
function statementAround(masked, at) {
  let s = at;
  while (s > 0 && !';{}'.includes(masked[s - 1])) s--;
  let e = at;
  let depth = 0;
  while (e < masked.length) {
    const ch = masked[e];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth <= 0) { e++; break; }
    e++;
  }
  return { start: s, end: e };
}

/** stmtStart se theek pehle wala statement (agar `;` se khatam hota ho) */
function previousStatement(masked, stmtStart) {
  let e = stmtStart;
  while (e > 0 && /\s/.test(masked[e - 1])) e--;
  if (masked[e - 1] !== ';') return null;
  let s = e - 1;
  while (s > 0 && !';{}'.includes(masked[s - 1])) s--;
  return { start: s, end: e };
}

function onlyWhitespaceBetween(masked, a, b) { return masked.slice(a, b).trim() === ''; }

/**
 * Statement wali poori line hatao agar line par sirf wahi statement hai;
 * warna sirf statement ka text hatao.
 */
function lineDelete(src, start, end) {
  // leading whitespace skip
  while (start < end && /\s/.test(src[start])) start++;
  const ls = lineStart(src, start), le = lineEnd(src, end > start ? end - 1 : end);
  if (src.slice(ls, start).trim() === '' && src.slice(end, le).trim() === '') {
    return { start: ls, end: Math.min(src.length, le + 1), text: '' };
  }
  return { start, end, text: '' };
}

module.exports = { scannerToIO, statementAround, previousStatement, lineDelete };
