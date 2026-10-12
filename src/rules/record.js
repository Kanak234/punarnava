/*
 * rules/record.js — sirf-data class ko Java 16 `record` banana.
 *
 * WHY:   Kanak ke document ka example C. Record boilerplate (constructor + getters)
 *        ko ek line bana deta hai.
 * SAFETY: 'review' — record purani class jaisa 100% nahi: woh equals/hashCode/
 *        toString bhi bana deta hai (object print karne par output badal jaata)
 *        aur class final ho jaati hai. Isliye default OFF; student tick karke
 *        badlaav dekhta hai aur explanation padhta hai.
 *        Hum sirf tab badalte hain jab:
 *          - class mein sirf `private final` fields hon
 *          - ek hi constructor ho jo har field ko usi naam ke parameter se set kare
 *          - baaki methods sirf accessors hon jinka naam field jaisa ho (`name()`)
 *            — `getName()` hota to bahar ka code toot jaata, isliye skip
 * FLOW:  engine.js → run(ctx) → edits[]
 */
'use strict';

const T = '[A-Za-z_$][\\w$.]*(?:\\s*<[^;=(){}]*>)?(?:\\s*\\[\\s*\\])*';

const recordClass = {
  id: 'record-class',
  java: 16,
  safety: 'review',
  run(ctx) {
    const { src, masked, struct } = ctx;
    const edits = [];
    for (const b of struct.blocks) {
      if (b.kind !== 'type' || !b.name) continue;
      const header = masked.slice(b.headerStart, b.open);
      const hm = /^\s*((?:(?:public|protected|private|static|final)\s+)*)class\s+([A-Za-z_$][\w$]*)\s*$/.exec(header);
      if (!hm) continue;                 // extends/implements/generics/annotations → skip
      const name = hm[2];
      const body = masked.slice(b.open + 1, b.close);
      // nested types ya initializer blocks andar → skip
      if (struct.blocks.some(x => x.open > b.open && x.close < b.close && x.kind === 'type')) continue;

      // Body ko members mein todo
      const members = splitMembers(body);
      if (!members) continue;
      const fields = [], accessors = [];
      let ctor = null, bad = false;
      for (const mem of members) {
        const t = mem.replace(/\s+/g, ' ').trim();
        let m;
        if ((m = new RegExp('^private final (' + T + ') ([A-Za-z_$][\\w$]*) ;$').exec(t.replace(/;$/, ' ;')))) {
          fields.push({ type: m[1].replace(/\s+/g, ''), name: m[2] });
        } else if ((m = new RegExp('^(?:public |protected |private )?' + name + ' ?\\(([^)]*)\\) ?\\{([^{}]*)\\}$').exec(t))) {
          if (ctor) { bad = true; break; }
          ctor = { params: m[1], body: m[2] };
        } else if ((m = new RegExp('^(?:public )?(' + T + ') ([A-Za-z_$][\\w$]*) ?\\( ?\\) ?\\{ ?return (?:this\\.)?([A-Za-z_$][\\w$]*) ?; ?\\}$').exec(t))) {
          accessors.push({ type: m[1].replace(/\s+/g, ''), name: m[2], field: m[3] });
        } else { bad = true; break; }
      }
      if (bad || !ctor || !fields.length) continue;
      // Constructor params == fields (same order, same types)
      const params = ctor.params.split(',').map(p => p.trim()).filter(Boolean).map(p => {
        const pm = new RegExp('^(?:final\\s+)?(' + T + ')\\s+([A-Za-z_$][\\w$]*)$').exec(p);
        return pm ? { type: pm[1].replace(/\s+/g, ''), name: pm[2] } : null;
      });
      if (params.some(p => !p) || params.length !== fields.length) continue;
      if (!params.every((p, i) => p.type === fields[i].type && p.name === fields[i].name)) continue;
      // Constructor body: sirf `this.f = f;` har field ke liye
      const assigns = ctor.body.split(';').map(s => s.trim()).filter(Boolean);
      if (assigns.length !== fields.length) continue;
      const ok = fields.every(f => assigns.some(a => new RegExp('^this\\s*\\.\\s*' + f.name + '\\s*=\\s*' + f.name + '$').test(a)));
      if (!ok) continue;
      // Accessors: naam == field naam, type == field type
      if (!accessors.every(a => a.name === a.field && fields.some(f => f.name === a.field && f.type === a.type))) continue;
      // Class ka naam `new Name(` ke alawa kahin `extends Name` mein to nahi? record final hai
      if (new RegExp('\\bextends\\s+' + name + '\\b').test(masked)) continue;

      const mods = hm[1].replace(/\bfinal\s+/, '').trim();
      // original source se types lo (generics ke spaces ke saath)
      const comps = fields.map(f => {
        const srcField = src.slice(b.open, b.close).match(new RegExp('private\\s+final\\s+(' + T + ')\\s+' + f.name + '\\s*;'));
        return (srcField ? srcField[1].trim() : f.type) + ' ' + f.name;
      });
      const text = (mods ? mods + ' ' : '') + 'record ' + name + '(' + comps.join(', ') + ') {}';
      const start = b.headerStart + header.search(/\S/);
      edits.push({ start, end: b.close + 1, text });
    }
    return edits;
  }
};

/** class body ko members mein todo: `...;` ya `... { ... }` */
function splitMembers(body) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { out.push(body.slice(start, i + 1)); start = i + 1; } }
    else if (c === ';' && depth === 0) { out.push(body.slice(start, i + 1)); start = i + 1; }
  }
  if (body.slice(start).trim()) return null;
  return out.filter(x => x.trim());
}

module.exports = { recordClass };
