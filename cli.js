#!/usr/bin/env node
/*
 * cli.js — terminal se Punarnava chalao (VS Code ke bina).
 *
 * WHY:   1) Tests isi se chalte hain.  2) Teacher/lab mein bina VS Code ke bhi use ho.
 *        3) Insta reel ke liye terminal demo.
 * USE:   node cli.js OldCode.java            → naya code stdout par
 *        node cli.js OldCode.java --explain  → har badlaav ki explanation
 *        node cli.js OldCode.java --all      → review rules (Scanner, record) bhi ON
 *        node cli.js OldCode.java --lang en  → English explanation
 *        node cli.js OldCode.java --target 21 → sirf Java 21 tak ke features
 *        node cli.js OldCode.java --json
 * FLOW:  file padho → engine.modernize() → print
 */
'use strict';

const fs = require('fs');
const { modernize, RULES, defaultEnabled } = require('./src/engine');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a) && a !== 'en' && a !== 'hi');
if (!file) {
  console.error('usage: punarnava <File.java> [--explain] [--all] [--lang en|hi] [--target 25] [--json]');
  process.exit(2);
}
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const src = fs.readFileSync(file, 'utf8');
const enabled = args.includes('--all') ? RULES.map(r => r.id) : defaultEnabled();
const res = modernize(src, { enabled, lang: opt('--lang') || 'hi', target: Number(opt('--target') || 25) });

if (args.includes('--json')) { process.stdout.write(JSON.stringify(res, null, 2) + '\n'); process.exit(0); }
process.stdout.write(res.code);
if (args.includes('--explain')) {
  const err = s => process.stderr.write(s + '\n');
  err('\n──── Punarnava: ' + res.changes.length + ' badlaav (minimum Java ' + res.minJava + ') ────');
  for (const c of res.changes) {
    err('\n● [Java ' + c.java + '] ' + c.explanation.title + '  (line ' + c.line + ')' + (c.safety === 'review' ? '  ⚠ review' : ''));
    err('  ' + c.explanation.why);
  }
  for (const a of res.available) err('\n○ OFF (review): ' + a.title + ' — --all se ON karo');
  for (const w of res.warnings) err('! ' + w);
}
