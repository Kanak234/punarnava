/*
 * rules/switch.js — purane colon-style `switch` ko modern banana.
 *   switch-expression (Java 14): har case ek hi variable ko value deta ho, ya
 *                                har case `return` karta ho → `x = switch (...) { case 1 -> 10; ... };`
 *   switch-arrow      (Java 14): baaki safe cases → `case 1 -> stmt;` (break hat jaata hai)
 *
 * WHY:   Kanak ke document ka example D yahi hai. `break` bhoolna students ki
 *        sabse common galti hai — arrow form mein fall-through hota hi nahi.
 * SAFETY: Hum switch tabhi badalte hain jab fall-through ka koi chance na ho,
 *        `break` sirf case ke END mein ho, aur ek case ka variable doosre case
 *        mein use na hota ho (arrow form mein har case ka scope alag hota hai).
 * FLOW:  engine.js → run(ctx) → edits[] (poora switch statement replace)
 */
'use strict';

const { matchBracket, indentAt, lineStart } = require('../lexer');

const SWITCH_RE = /\bswitch\s*\(/g;
const DECL_IN_BODY = /(?:^|[;{}])\s*(?:final\s+)?[A-Za-z_$][\w$.]*(?:\s*<[^;=(){}]*>)?(?:\s*\[\s*\])*\s+([A-Za-z_$][\w$]*)\s*(?:=|;)/g;
const KEYWORD_START = /^(return|if|for|while|do|try|synchronized|break|continue|switch|throw|yield)\b/;

function rules() {
  return [switchExpression, switchArrow];
}

/** Ek switch ko parse karo → groups[{labels:[...], body, bodyStart, bodyEnd}] ya null */
function parseSwitch(src, masked, at) {
  const parenOpen = masked.indexOf('(', at);
  const parenClose = matchBracket(masked, parenOpen);
  if (parenClose < 0) return null;
  let k = parenClose + 1;
  while (k < masked.length && /\s/.test(masked[k])) k++;
  if (masked[k] !== '{') return null;
  const bodyOpen = k, bodyClose = matchBracket(masked, bodyOpen);
  if (bodyClose < 0) return null;

  // Statement position check: switch ke pehle `;` `{` `}` ya `else`/`:` hona chahiye
  let p = at - 1;
  while (p >= 0 && /\s/.test(masked[p])) p--;
  const prevCh = p >= 0 ? masked[p] : ';';
  const prevWord = masked.slice(Math.max(0, p - 3), p + 1);
  if (!(';{}:'.includes(prevCh) || prevWord === 'else' || p < 0)) return null;

  // Labels dhoondho (body ke depth 0 par)
  const labels = [];
  let depth = 0, paren = 0;
  for (let i = bodyOpen + 1; i < bodyClose; i++) {
    const ch = masked[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '(') paren++;
    else if (ch === ')') paren--;
    if (depth !== 0 || paren !== 0) continue;
    const rest = masked.slice(i, i + 8);
    const isWordStart = i === 0 || !/[\w$]/.test(masked[i - 1]);
    if (!isWordStart) continue;
    if (/^case\b/.test(rest) || /^default\b/.test(rest)) {
      // label ka ':' ya '->' dhoondho
      let j = i, pd = 0;
      while (j < bodyClose) {
        const c = masked[j];
        if (c === '(') pd++;
        else if (c === ')') pd--;
        else if (pd === 0 && c === '-' && masked[j + 1] === '>') return null; // pehle se arrow style
        else if (pd === 0 && c === ':' && masked[j + 1] !== ':') break;
        else if (pd === 0 && (c === ';' || c === '{')) return null;
        j++;
      }
      const raw = src.slice(i, j).trim();
      if (/\?/.test(masked.slice(i, j))) return null;               // ternary label — skip
      const isDefault = /^default\b/.test(raw);
      const value = isDefault ? null : raw.replace(/^case\s+/, '').trim();
      // Java 21 pattern labels (`case String s:`) ya `when` guards — chhedo mat
      if (value && (/\bwhen\b/.test(value) || /^[A-Za-z_$][\w$.<>]*\s+[A-Za-z_$][\w$]*$/.test(value))) return null;
      labels.push({ start: i, colon: j, isDefault, value });
      i = j;
    }
  }
  if (!labels.length) return null;
  // pehle label se pehle body mein kuch code hai? (illegal/rare) → skip
  if (masked.slice(bodyOpen + 1, labels[0].start).trim()) return null;

  // Groups: lagataar labels jinke beech kuch nahi (fall-through merge `case 1, 2 ->`)
  const groups = [];
  for (let li = 0; li < labels.length; li++) {
    const L = labels[li];
    const next = labels[li + 1];
    const bStart = L.colon + 1;
    const bEnd = next ? next.start : bodyClose;
    const bodyMasked = masked.slice(bStart, bEnd);
    const last = groups[groups.length - 1];
    if (last && last.empty) {
      last.labels.push(L);
      last.bodyStart = bStart; last.bodyEnd = bEnd;
      last.body = src.slice(bStart, bEnd); last.bodyMasked = bodyMasked;
      last.empty = bodyMasked.trim() === '';
    } else {
      groups.push({ labels: [L], bodyStart: bStart, bodyEnd: bEnd, body: src.slice(bStart, bEnd), bodyMasked, empty: bodyMasked.trim() === '' });
    }
  }
  const selector = src.slice(parenOpen + 1, parenClose).trim();
  return { at, parenOpen, parenClose, bodyOpen, bodyClose, groups, selector };
}

/** group ki body ko statements mein todo (masked ke depth-0 `;` aur `{}` blocks par) */
function splitStatements(srcBody, maskedBody) {
  const stmts = [];
  let depth = 0, paren = 0, start = 0;
  for (let i = 0; i < maskedBody.length; i++) {
    const c = maskedBody[i];
    if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0 && paren === 0) {
        // block statement khatam — agar yeh `if/for/while ... {}` ya bare `{}` hai.
        // Lekin `else` / `catch` / `finally` agle token mein ho to statement jaari hai.
        const ahead = maskedBody.slice(i + 1).trimStart();
        if (!/^(else|catch|finally)\b/.test(ahead) && !/^[;,)]/.test(ahead) && !/^\)/.test(ahead)) {
          // `x = new Foo() { ... };` jaisa — '}' ke baad ';' ho to wahan tak le jao
          stmts.push({ s: srcBody.slice(start, i + 1), m: maskedBody.slice(start, i + 1) });
          start = i + 1;
        }
      }
    } else if (c === ';' && depth === 0 && paren === 0) {
      stmts.push({ s: srcBody.slice(start, i + 1), m: maskedBody.slice(start, i + 1) });
      start = i + 1;
    }
  }
  const tail = maskedBody.slice(start);
  if (tail.trim()) return null;   // adhoora statement — parse fail, skip
  return stmts.filter(x => x.m.trim()).map(x => ({ s: x.s.trim(), m: x.m.trim(), raw: x.s }));
}

/** Arrow/expression ke liye har group ka analysis */
function analyzeGroups(sw) {
  const out = [];
  for (let gi = 0; gi < sw.groups.length; gi++) {
    const g = sw.groups[gi];
    const isLast = gi === sw.groups.length - 1;
    const stmts = splitStatements(g.body, g.bodyMasked);
    if (!stmts) return null;
    let st = stmts.slice();
    const lastSt = st[st.length - 1];
    let endsWithBreak = false, terminal = false;
    if (lastSt && /^break\s*;$/.test(lastSt.m)) { endsWithBreak = true; st.pop(); }
    else if (lastSt && /^(return|throw)\b/.test(lastSt.m)) terminal = true;
    // fall-through: last group ke alawa har group break/return/throw se khatam ho
    if (!isLast && !endsWithBreak && !terminal) return null;
    // Body mein aur kahin `break` (label-less) — arrow mein uska matlab badal jaata
    if (st.some(x => /\bbreak\b/.test(x.m))) return null;
    if (st.some(x => /\byield\b/.test(x.m))) return null;
    out.push({ g, stmts: st, endsWithBreak, terminal });
  }
  // Scope check: ek group mein declare hua variable doosre group mein use?
  const declared = out.map(a => {
    const names = new Set();
    for (const s of a.stmts) {
      DECL_IN_BODY.lastIndex = 0;
      for (const m of (';' + s.m).matchAll(DECL_IN_BODY)) if (!/^(return|throw|new|else)$/.test(m[1])) names.add(m[1]);
    }
    return names;
  });
  for (let a = 0; a < out.length; a++) {
    for (const name of declared[a]) {
      const re = new RegExp('\\b' + name + '\\b');
      for (let b = 0; b < out.length; b++) if (b !== a && out[b].stmts.some(s => re.test(s.m))) return null;
    }
  }
  return out;
}

function labelText(g) {
  if (g.labels.some(l => l.isDefault)) {
    // `case 3: default:` → arrow form mein `case 3, default` sirf patterns ke saath chalta hai;
    // simple values ke liye bas `default` likhna sahi hai (3 bhi default mein aa jaata).
    return 'default';
  }
  return 'case ' + g.labels.map(l => l.value).join(', ');
}

function unitIndent(src, sw) {
  const base = indentAt(src, sw.at);
  const firstLabel = sw.groups[0].labels[0];
  const li = indentAt(src, firstLabel.start);
  const unit = li.startsWith(base) && li.length > base.length ? li.slice(base.length) : '    ';
  return { base, unit };
}

/** Statements ko naye indent par lagao (original relative indentation rakh kar) */
function reindent(stmtRaws, indent) {
  const text = stmtRaws.join('').replace(/^\s*\n/, '').replace(/\s+$/, '');
  const lines = text.split('\n');
  const ind = lines.filter(l => l.trim()).map(l => l.match(/^[ \t]*/)[0].length);
  const min = ind.length ? Math.min(...ind) : 0;
  return lines.map(l => (l.trim() ? indent + l.slice(Math.min(min, l.match(/^[ \t]*/)[0].length)) : '')).join('\n');
}

/* ─────────────── switch-expression ─────────────── */

const switchExpression = {
  id: 'switch-expression',
  java: 14,
  safety: 'safe',
  run(ctx) {
    const { src, masked } = ctx;
    const edits = [];
    SWITCH_RE.lastIndex = 0;
    let m;
    while ((m = SWITCH_RE.exec(masked))) {
      const sw = parseSwitch(src, masked, m.index);
      if (!sw) continue;
      const an = analyzeGroups(sw);
      if (!an) continue;
      if (!sw.groups.some(g => g.labels.some(l => l.isDefault))) continue;
      if (an.some(a => a.stmts.length !== 1)) continue;

      // Mode A: har group `X = expr;` (same X)
      const assigns = an.map(a => /^([A-Za-z_$][\w$]*)\s*=(?!=)\s*([\s\S]+);$/.exec(a.stmts[0].s));
      // Mode B: har group `return expr;`
      const returns = an.map(a => /^return\s+([\s\S]+);$/.exec(a.stmts[0].s));
      const { base, unit } = unitIndent(src, sw);
      let head, arms;
      let declEdit = null;

      if (assigns.every(Boolean) && new Set(assigns.map(x => x[1])).size === 1 && an.every(a => a.endsWithBreak || a === an[an.length - 1])) {
        const v = assigns[0][1];
        arms = an.map((a, i) => base + unit + labelText(a.g) + ' -> ' + assigns[i][2].trim() + ';');
        head = v + ' = switch (' + sw.selector + ') {';
        // `int result;` theek pehle declared ho → `int result = switch ...`
        const prevEnd = (() => { let p = m.index - 1; while (p >= 0 && /\s/.test(masked[p])) p--; return p; })();
        if (prevEnd >= 0 && masked[prevEnd] === ';') {
          let s = prevEnd - 1;
          while (s >= 0 && !';{}'.includes(masked[s])) s--;
          const declSrc = src.slice(s + 1, prevEnd + 1);
          const dm = new RegExp('^\\s*((?:final\\s+)?[A-Za-z_$][\\w$.]*(?:\\s*<[^;=]*>)?(?:\\s*\\[\\s*\\])*)\\s+' + v + '\\s*;\\s*$').exec(declSrc);
          if (dm && !/^(return|throw)$/.test(dm[1].trim())) {
            head = dm[1].trim() + ' ' + head;
            const ls = lineStart(src, s + 1 + declSrc.search(/\S/));
            declEdit = { start: ls, end: lineStart(src, m.index), text: '' };
          }
        }
      } else if (returns.every(Boolean) && an.every(a => a.terminal)) {
        arms = an.map((a, i) => base + unit + labelText(a.g) + ' -> ' + returns[i][1].trim() + ';');
        head = 'return switch (' + sw.selector + ') {';
      } else continue;

      const text = head + '\n' + arms.join('\n') + '\n' + base + '};';
      if (declEdit) edits.push(declEdit);
      edits.push({ start: m.index, end: sw.bodyClose + 1, text, rule: 'switch-expression' });
      SWITCH_RE.lastIndex = sw.bodyClose + 1;
    }
    return edits;
  }
};

/* ─────────────── switch-arrow ─────────────── */

const switchArrow = {
  id: 'switch-arrow',
  java: 14,
  safety: 'safe',
  run(ctx) {
    const { src, masked } = ctx;
    const edits = [];
    SWITCH_RE.lastIndex = 0;
    let m;
    while ((m = SWITCH_RE.exec(masked))) {
      const sw = parseSwitch(src, masked, m.index);
      if (!sw) continue;
      const an = analyzeGroups(sw);
      if (!an) continue;
      const { base, unit } = unitIndent(src, sw);
      const arms = [];
      for (const a of an) {
        const label = base + unit + labelText(a.g) + ' -> ';
        const st = a.stmts;
        if (st.length === 0) { arms.push(label + '{ }'); continue; }
        const single = st.length === 1 ? st[0] : null;
        const isExprStmt = single && !KEYWORD_START.test(single.m) && !/^\{/.test(single.m) &&
          !DECL_LIKE.test(single.m) && /;$/.test(single.m);
        const isThrow = single && /^throw\b/.test(single.m);
        const isBlock = single && /^\{[\s\S]*\}$/.test(single.m);
        if (isExprStmt || isThrow) arms.push(label + single.s.replace(/\s*\n\s*/g, ' '));
        else if (isBlock) arms.push(label + reindent([single.raw], base + unit).trimStart());
        else arms.push(label + '{\n' + reindent(st.map(x => x.raw), base + unit + unit) + '\n' + base + unit + '}');
      }
      const text = 'switch (' + sw.selector + ') {\n' + arms.join('\n') + '\n' + base + '}';
      edits.push({ start: m.index, end: sw.bodyClose + 1, text });
      SWITCH_RE.lastIndex = sw.bodyClose + 1;
    }
    return edits;
  }
};

const DECL_LIKE = /^(?:final\s+)?[A-Za-z_$][\w$.]*(?:\s*<[^;=(){}]*>)?(?:\s*\[\s*\])*\s+[A-Za-z_$][\w$]*\s*(?:=|;)/;

module.exports = { switchExpression, switchArrow, rules, parseSwitch };
