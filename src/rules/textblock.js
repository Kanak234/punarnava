/*
 * rules/textblock.js — `"a\n" + "b\n" + "c"` jaisi chain ko Java 15 text block mein.
 *
 * WHY:   Kanak ke document ka example B. Usme ek galti thi (closing `"""` nayi
 *        line par → extra `\n`). Yeh rule closing delimiter ko EXACT jagah lagata
 *        hai taaki string ki value 1 character bhi na badle.
 * SAFETY: Sirf tab badalte hain jab:
 *        - chain mein sirf string literals aur `+` hon (koi variable nahi)
 *        - kam se kam 2 line-breaks hon (warna text block ka fayda nahi)
 *        - kisi line ke end mein space/tab na ho (text block trailing space hata deta hai)
 *        - content mein `"""` na ho
 * FLOW:  engine.js → run(ctx) → edits[]
 */
'use strict';

const { indentAt } = require('../lexer');

const textBlock = {
  id: 'text-block',
  java: 15,
  safety: 'safe',
  run(ctx) {
    const { src, masked, strings } = ctx;
    const edits = [];
    const lits = strings.filter(s => s.kind === 'string');
    let i = 0;
    while (i < lits.length) {
      // chain banao: lit (+ lit)*
      const chain = [lits[i]];
      let j = i;
      while (j + 1 < lits.length) {
        const gap = masked.slice(lits[j].end, lits[j + 1].start);
        if (/^\s*\+\s*$/.test(gap)) { chain.push(lits[j + 1]); j++; } else break;
      }
      i = j + 1;
      if (chain.length < 2) continue;
      // chain ke aage-peeche `+` na ho (jaise `"a\n" + x + "b"`) — tab yeh poora expression nahi
      const before = masked.slice(0, chain[0].start).trimEnd();
      const after = masked.slice(chain[chain.length - 1].end).trimStart();
      if (/[+.]$/.test(before) || /^[+.]/.test(after)) continue;  // `.` = method call on result / qualified

      // literals ka content (quotes ke bina), escapes as-is
      const parts = chain.map(s => src.slice(s.start + 1, s.end - 1));
      // har part (last ke alawa) `\n` se khatam hona chahiye — line structure saaf rahe
      if (!parts.slice(0, -1).every(p => endsWithNewlineEscape(p))) continue;
      const joined = parts.join('');
      const lines = splitOnNewlineEscapes(joined);
      if (lines.length < 3) continue;   // kam se kam 2 line breaks (warna fayda nahi)
      if (joined.includes('"""') || /\\"""/.test(joined)) continue;
      // trailing whitespace — text block mein strip ho jaata, value badal jaati
      if (lines.some(l => /[ \t]$/.test(l))) continue;
      // `\r` ya dusre line terminators ke escape — skip (rare, confusing)
      if (/\\r/.test(joined)) continue;

      const ind = indentAt(src, chain[0].start) + '    ';
      const endsWithNl = lines[lines.length - 1] === '';
      const body = endsWithNl ? lines.slice(0, -1) : lines;
      // escaped quote `\"` text block mein bhi valid hai, par saaf dikhane ke liye
      // `\"` → `"` (sirf jab woh `""` sequence na banaye).
      const pretty = body.map((l, idx) => {
        const isLast = idx === body.length - 1;
        // aakhri line ke saath closing `"""` lagega — agar woh `"` par khatam hoti hai
        // to unescape karne se `""""` ban jaata. Us line ka `\"` waisa hi rakho.
        if (isLast && !endsWithNl && /\\"$/.test(l)) return l;
        const u = l.replace(/\\"/g, '"');
        return /"""/.test(u) ? l : u;   // `"""` banta ho to escaped hi rakho
      });
      let text = '"""\n';
      text += pretty.map(l => (l === '' ? '' : ind + l)).join('\n');
      // closing delimiter: newline khatam ho to nayi line par (same indent),
      // warna aakhri line ke saath hi — taaki extra `\n` na jude.
      text += endsWithNl ? '\n' + ind + '"""' : '"""';
      // Agar sab lines khali hain to incidental-indent ka hisaab gadbad ho sakta hai — skip
      if (!pretty.some(l => l !== '')) continue;
      // Indent ka min wahi rahe: closing line (endsWithNl case) bhi `ind` par hai — sahi.
      edits.push({ start: chain[0].start, end: chain[chain.length - 1].end, text });
    }
    return edits;
  }
};

/** "abc\\n" — string literal content `\n` escape se khatam (aur woh khud escaped backslash nahi) */
function endsWithNewlineEscape(p) {
  if (!p.endsWith('\\n')) return false;
  // count backslashes before 'n'
  let k = p.length - 2, count = 0;
  while (k >= 0 && p[k] === '\\') { count++; k--; }
  return count % 2 === 1;
}

/** content ko `\n` escapes par todo (escaped backslash `\\n` ko chhod kar) */
function splitOnNewlineEscapes(s) {
  const out = [];
  let cur = '';
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '\\') {
      const nx = s[k + 1];
      if (nx === 'n') { out.push(cur); cur = ''; k++; continue; }
      cur += s[k] + (nx ?? ''); k++; continue;
    }
    cur += s[k];
  }
  out.push(cur);
  return out;
}

module.exports = { textBlock, splitOnNewlineEscapes };
