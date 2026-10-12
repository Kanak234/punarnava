#!/usr/bin/env node
/*
 * test/extension-test.js — Punarnava extension ka wiring test (mock VS Code par).
 * Checks: activate, commands, CodeLens, hints + quick fixes, panel render/toggle/apply,
 * javac check, run-in-terminal. Windows/Linux/macOS teeno par same chalta hai.
 * FLOW: node test/extension-test.js → exit 0 = pass
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const mock = require('./vscode-mock');

const root = path.join(__dirname, '..');
const jdk = process.env.PUNARNAVA_JDK || process.env.JAVA_HOME || '';
const vscode = mock.install({ config: { 'punarnava.jdkPath': jdk } });
const ext = require(path.join(root, 'extension.js'));
const { modernize, defaultEnabled } = require(path.join(root, 'src/engine.js'));

let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); } };
const tick = () => new Promise(r => setTimeout(r, 30));

(async () => {
  console.log('\n[extension] Punarnava on mock VS Code (' + process.platform + ')');
  const ctx = mock.context(root);
  ext.activate(ctx);
  for (const id of ['punarnava.modernize', 'punarnava.applySafe', 'punarnava.applyRule', 'punarnava.openExample', 'punarnava.checkJdk'])
    ok(vscode._commands.has(id), 'command registered: ' + id);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const declared = pkg.contributes.commands.map(c => c.command);
  ok(declared.every(c => vscode._commands.has(c)), 'every command in package.json is implemented');

  // fixture ki temp copy
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-ext-'));
  const file = path.join(dir, 'Calculator.java');
  fs.copyFileSync(path.join(root, 'test/fixtures/Calculator.java'), file);
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  await vscode.window.showTextDocument(doc);
  vscode._fire('open', doc);

  // CodeLens
  const lenses = vscode._lens.provideCodeLenses(doc);
  ok(lenses.length === 2 && /Punarnava: \d+ modern Java/.test(lenses[0].command.title), 'CodeLens shows change count above main()', lenses[0] && lenses[0].command.title);

  // Hints + quick fixes — diagnostics us collection mein hain jo extension ne banayi
  const actions = vscode._actions.provideCodeActions(doc, null, { diagnostics: [{ source: 'Punarnava', code: 'io-println', range: null }] });
  ok(actions.some(a => /sirf yeh badlaav/.test(a.title)) && actions.some(a => /poori file/.test(a.title)), 'quick fixes offered for a hint');

  // Panel
  await vscode.commands.executeCommand('punarnava.modernize', doc.uri);
  const panel = vscode._panels[0];
  ok(!!panel, 'learning panel opens');
  ok(/Content-Security-Policy/.test(panel.webview.html) && /nonce-/.test(panel.webview.html), 'webview has a strict CSP with nonce');
  panel.send({ t: 'ready' }); await tick();
  let r = panel.posted.filter(m => m.t === 'render').pop();
  ok(r && r.changes.length >= 4 && r.diff.length > 0, 'panel renders changes + diff (' + (r && r.changes.length) + ' changes)');
  ok(r && r.available.some(a => a.id === 'scanner-to-io'), 'Scanner rule shown as available (off by default)');
  ok(r && r.reviewRules.length === 2, 'two review toggles shown');

  panel.send({ t: 'toggleReview', id: 'scanner-to-io', on: true }); await tick();
  r = panel.posted.filter(m => m.t === 'render').pop();
  ok(r.changes.some(c => c.rule === 'scanner-to-io') && /IO\.readln\("Enter first number: "\)/.test(r.modern), 'turning on the Scanner rule updates the preview');

  panel.send({ t: 'lang', lang: 'en' }); await tick();
  r = panel.posted.filter(m => m.t === 'render').pop();
  ok(r.lang === 'en' && /Since Java/.test(r.changes.map(c => c.explanation.why).join(' ')), 'language switch → English explanations');

  panel.send({ t: 'target', target: '21' }); await tick();
  r = panel.posted.filter(m => m.t === 'render').pop();
  ok(r.changes.every(c => c.java <= 21), 'target Java 21 hides Java 25 changes');
  panel.send({ t: 'target', target: '25' }); await tick();

  // Apply
  const expected = modernize(doc.getText(), { enabled: [...defaultEnabled(), 'scanner-to-io'] }).code;
  panel.send({ t: 'apply' }); await tick(); await tick();
  ok(doc.getText() === expected, 'Apply writes exactly the engine output into the document');
  ok(vscode._messages.some(m => /badlaav lage/.test(m.m)), 'status bar confirms with undo hint');

  // Copy
  panel.send({ t: 'copy' }); await tick();
  ok((await vscode.env.clipboard.readText()) === modernize(doc.getText(), { enabled: [...defaultEnabled(), 'scanner-to-io'] }).code, 'Copy puts modern code on the clipboard');

  // javac check
  if (jdk) {
    panel.send({ t: 'check' }); await new Promise(r2 => setTimeout(r2, 4000));
    const chk = panel.posted.filter(m => m.t === 'check').pop();
    ok(chk && chk.ok, 'Check with javac succeeds on the applied code', chk && chk.text);
  } else console.log('  - javac check skipped (no PUNARNAVA_JDK/JAVA_HOME)');

  // run in terminal
  panel.send({ t: 'run', which: 'new' }); await tick();
  const term = vscode._terminals.pop();
  ok(jdk ? (term && /java/.test(term.sent[0]) && /Calculator\.java/.test(term.sent[0])) : true, 'Run new opens a terminal with `java Calculator.java`', term && term.sent[0]);

  // Examples bundled
  const ex = fs.readdirSync(path.join(root, 'examples'));
  ok(['OldJava.java', 'Calculator.java', 'Grades.java', 'Shapes.java'].every(f => ex.includes(f)), 'examples are bundled');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
