/*
 * extension.js — Punarnava ka VS Code wala hissa.
 *
 * WHY:   Engine (src/engine.js) pure JS hai; yeh file use VS Code se jodti hai:
 *        commands, CodeLens ("✦ Punarnava: 6 modern badlaav"), hints, quick-fix,
 *        aur side-by-side learning panel.
 * FLOW:  VS Code `activate()` → commands/providers register → user command chalata
 *        hai → engine.modernize() → panel.js (webview) dikhata hai → user "Apply"
 *        dabata hai → WorkspaceEdit (Ctrl+Z se undo ho sakta hai)
 */
'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const { modernize, diffLines, RULES, defaultEnabled } = require('./src/engine');
const { RULES: EXPLAIN } = require('./src/explain');

let panel;                 // ek hi learning panel (dobara command → wahi panel refresh)
let panelDoc;              // panel kis document ke liye khula hai
let diagnostics;           // Problems tab mein "hint" level suggestions
let out;                   // Output channel: PUNARNAVA
let state = { review: [], lang: 'en', target: 25 };   // panel ke toggles

function activate(context) {
  out = vscode.window.createOutputChannel('Punarnava');
  diagnostics = vscode.languages.createDiagnosticCollection('punarnava');
  const c = cfg();
  state = { review: c.reviewRules, lang: c.lang, target: c.target };

  context.subscriptions.push(
    out, diagnostics,
    vscode.commands.registerCommand('punarnava.modernize', uri => openPanel(context, uri)),
    vscode.commands.registerCommand('punarnava.applySafe', uri => applyToDocument(uri, defaultEnabled())),
    vscode.commands.registerCommand('punarnava.applyRule', (uri, ruleId) => applyToDocument(uri, [ruleId])),
    vscode.commands.registerCommand('punarnava.openExample', () => openExample(context)),
    vscode.commands.registerCommand('punarnava.checkJdk', () => checkJdk(true)),
    vscode.languages.registerCodeLensProvider({ language: 'java' }, new LensProvider()),
    vscode.languages.registerCodeActionsProvider({ language: 'java' }, new QuickFixes(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.workspace.onDidOpenTextDocument(refreshHints),
    vscode.workspace.onDidSaveTextDocument(refreshHints),
    vscode.workspace.onDidChangeTextDocument(debounce(e => refreshHints(e.document), 600)),
    vscode.workspace.onDidCloseTextDocument(d => diagnostics.delete(d.uri)),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('punarnava')) { vscode.workspace.textDocuments.forEach(refreshHints); }
    })
  );
  vscode.workspace.textDocuments.forEach(refreshHints);
}

/* ───────────── settings ───────────── */

function cfg() {
  const c = vscode.workspace.getConfiguration('punarnava');
  return {
    lang: c.get('language', 'english') === 'hinglish' ? 'hi' : 'en',
    target: Number(c.get('targetJava', '25')),
    reviewRules: c.get('enableReviewRules', []),
    jdkPath: c.get('jdkPath', ''),
    codeLens: c.get('codeLens', true),
    hints: c.get('hints', true)
  };
}

function enabledRules() {
  return [...defaultEnabled(), ...state.review];
}

/* ───────────── CodeLens: main method ke upar ek clickable line ───────────── */

class LensProvider {
  constructor() { this._ev = new vscode.EventEmitter(); this.onDidChangeCodeLenses = this._ev.event; }
  provideCodeLenses(doc) {
    if (!cfg().codeLens) return [];
    const text = doc.getText();
    const res = safeModernize(text, { enabled: enabledRules(), target: cfg().target, lang: cfg().lang });
    if (!res || !res.changes.length) return [];
    // lens pehle `main` par, warna pehli class par, warna line 0
    let line = 0;
    const lines = text.split(/\r?\n/);
    const mi = lines.findIndex(l => /\bvoid\s+main\s*\(/.test(l));
    const ci = lines.findIndex(l => /\bclass\s+\w+/.test(l));
    line = mi >= 0 ? mi : (ci >= 0 ? ci : 0);
    const range = new vscode.Range(line, 0, line, 0);
    return [
      new vscode.CodeLens(range, { title: '✦ Punarnava: ' + res.changes.length + ' modern Java ' + (res.changes.length === 1 ? 'change' : 'changes') + ' — see and learn', command: 'punarnava.modernize', arguments: [doc.uri] }),
      new vscode.CodeLens(range, { title: 'Apply safe', command: 'punarnava.applySafe', arguments: [doc.uri] })
    ];
  }
}

/* ───────────── Hints (Problems tab) + Quick fix ───────────── */

function refreshHints(doc) {
  if (!doc || doc.languageId !== 'java' || doc.uri.scheme === 'git') return;
  if (!cfg().hints) { diagnostics.delete(doc.uri); return; }
  const text = doc.getText();
  const list = [];
  // Har rule ko ALAG se original code par chalao — tab line numbers original
  // file ke hi hote hain (combined run mein lines khisak jaati hain).
  for (const id of enabledRules()) {
    const r = safeModernize(text, { enabled: [id], target: cfg().target, lang: cfg().lang });
    if (!r) continue;
    for (const ch of r.changes) {
      const ln = Math.max(0, Math.min(doc.lineCount - 1, ch.line - 1));
      const d = new vscode.Diagnostic(doc.lineAt(ln).range,
        'Java ' + ch.java + ': ' + stripTicks(ch.explanation.title), vscode.DiagnosticSeverity.Hint);
      d.source = 'Punarnava';
      d.code = id;
      list.push(d);
    }
  }
  diagnostics.set(doc.uri, list);
}

class QuickFixes {
  provideCodeActions(doc, range, ctx) {
    const acts = [];
    for (const d of ctx.diagnostics.filter(x => x.source === 'Punarnava')) {
      const a = new vscode.CodeAction('Punarnava: apply only this change (' + d.code + ')', vscode.CodeActionKind.QuickFix);
      a.command = { command: 'punarnava.applyRule', title: '', arguments: [doc.uri, String(d.code)] };
      a.diagnostics = [d];
      acts.push(a);
    }
    if (acts.length) {
      const all = new vscode.CodeAction('Punarnava: modernize the whole file (safe)', vscode.CodeActionKind.QuickFix);
      all.command = { command: 'punarnava.applySafe', title: '', arguments: [doc.uri] };
      const learn = new vscode.CodeAction('Punarnava: explain side-by-side', vscode.CodeActionKind.QuickFix);
      learn.command = { command: 'punarnava.modernize', title: '', arguments: [doc.uri] };
      acts.push(all, learn);
    }
    return acts;
  }
}

/* ───────────── Apply in place ───────────── */

async function applyToDocument(uri, enabled) {
  const doc = await docFor(uri);
  if (!doc) return;
  const text = doc.getText();
  const res = safeModernize(text, { enabled, target: cfg().target, lang: cfg().lang });
  if (!res || res.code === text) { vscode.window.showInformationMessage('Punarnava: no modern Java changes found in this file.'); return; }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), res.code);
  await vscode.workspace.applyEdit(edit);
  vscode.window.setStatusBarMessage('Punarnava: ' + res.changes.length + ' change(s) applied — Ctrl+Z to undo', 5000);
  if (res.minJava >= 25) checkJdk(false);
  if (panel && panelDoc && panelDoc.toString() === doc.uri.toString()) render();
}

/* ───────────── Learning panel ───────────── */

async function openPanel(context, uri) {
  const doc = await docFor(uri);
  if (!doc) return;
  panelDoc = doc.uri;
  if (!panel) {
    panel = vscode.window.createWebviewPanel('punarnava', 'Punarnava', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
    });
    panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'icon.png'));
    panel.webview.html = htmlShell(panel.webview, context);
    panel.onDidDispose(() => { panel = undefined; panelDoc = undefined; });
    panel.webview.onDidReceiveMessage(m => onPanelMessage(m));
  } else {
    panel.reveal(vscode.ViewColumn.Beside, true);
  }
  panel.title = 'Punarnava · ' + path.basename(doc.uri.fsPath || doc.uri.path);
  render();
}

async function render() {
  if (!panel || !panelDoc) return;
  const doc = await docFor(panelDoc);
  if (!doc) return;
  const text = doc.getText();
  const res = safeModernize(text, { enabled: enabledRules(), target: state.target, lang: state.lang });
  if (!res) return;
  const reviewRules = RULES.filter(r => r.safety === 'review').map(r => ({
    id: r.id, java: r.java, on: state.review.includes(r.id), title: EXPLAIN[r.id].title[state.lang]
  }));
  panel.webview.postMessage({
    t: 'render',
    file: path.basename(doc.uri.fsPath || doc.uri.path),
    original: text,
    modern: res.code,
    diff: diffLines(text, res.code),
    changes: res.changes,
    available: res.available,
    warnings: res.warnings,
    minJava: res.minJava,
    lang: state.lang,
    target: state.target,
    reviewRules
  });
}

async function onPanelMessage(m) {
  switch (m.t) {
    case 'ready': render(); break;
    case 'toggleReview':
      state.review = m.on ? [...new Set([...state.review, m.id])] : state.review.filter(x => x !== m.id);
      render(); break;
    case 'lang': state.lang = m.lang === 'hi' ? 'hi' : 'en'; render(); break;
    case 'target': state.target = Number(m.target) || 25; render(); break;
    case 'apply': await applyToDocument(panelDoc, enabledRules()); break;
    case 'newFile': await openAsNewFile(); break;
    case 'copy': {
      const doc = await docFor(panelDoc);
      const res = safeModernize(doc.getText(), { enabled: enabledRules(), target: state.target, lang: state.lang });
      await vscode.env.clipboard.writeText(res.code);
      vscode.window.setStatusBarMessage('Punarnava: modern code copied', 3000);
      break;
    }
    case 'check': await compileCheck(); break;
    case 'run': await runInTerminal(m.which); break;
  }
}

/** Naya code ek nayi untitled tab mein (original file bilkul nahi badalti) */
async function openAsNewFile() {
  const doc = await docFor(panelDoc);
  const res = safeModernize(doc.getText(), { enabled: enabledRules(), target: state.target, lang: state.lang });
  const nd = await vscode.workspace.openTextDocument({ language: 'java', content: res.code });
  await vscode.window.showTextDocument(nd, vscode.ViewColumn.One);
}

/* ───────────── JDK: dhoondho, version check, compile, run ───────────── */

/** Configured JDK → JAVA_HOME → PATH. Return { javac, java, version } ya null */
function findJdk() {
  const exe = process.platform === 'win32' ? '.exe' : '';
  const homes = [cfg().jdkPath, process.env.JAVA_HOME].filter(Boolean);
  const cands = homes.map(h => ({ javac: path.join(h, 'bin', 'javac' + exe), java: path.join(h, 'bin', 'java' + exe) }));
  cands.push({ javac: 'javac', java: 'java' });
  for (const c of cands) {
    try {
      const v = cp.execFileSync(c.javac, ['-version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
      const m = /javac (\d+)/.exec(v);
      if (m) return { ...c, version: Number(m[1]) };
    } catch { /* agla */ }
  }
  return null;
}

let warnedJdk = false;
function checkJdk(explicit) {
  const j = findJdk();
  if (!j) {
    if (explicit || !warnedJdk) vscode.window.showWarningMessage('Punarnava: no JDK found. Running modern Java (void main, IO) needs JDK 25+.', 'Download JDK 25')
      .then(x => { if (x) vscode.env.openExternal(vscode.Uri.parse('https://adoptium.net/temurin/releases/?version=25')); });
    warnedJdk = true; return;
  }
  if (j.version < 25) {
    if (explicit || !warnedJdk) vscode.window.showWarningMessage('Punarnava: your JDK is ' + j.version + '. `void main()` and `IO` need JDK 25+ — or choose "Target Java" ' + j.version + ' in settings.', 'Download JDK 25')
      .then(x => { if (x) vscode.env.openExternal(vscode.Uri.parse('https://adoptium.net/temurin/releases/?version=25')); });
    warnedJdk = true; return;
  }
  if (explicit) vscode.window.showInformationMessage('Punarnava: JDK ' + j.version + ' found (' + j.javac + ') — ready for modern Java.');
}

/** Naya code temp folder mein compile karo; result panel mein dikhao */
async function compileCheck() {
  const j = findJdk();
  if (!j) { panel?.webview.postMessage({ t: 'check', ok: false, text: 'No JDK found. Install JDK 25 or set punarnava.jdkPath.' }); return; }
  const doc = await docFor(panelDoc);
  const res = safeModernize(doc.getText(), { enabled: enabledRules(), target: state.target, lang: state.lang });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'punarnava-'));
  const name = mainName(doc, res.code);
  const file = path.join(dir, name + '.java');
  fs.writeFileSync(file, res.code);
  const r = cp.spawnSync(j.javac, ['-d', path.join(dir, 'out'), file], { encoding: 'utf8', timeout: 60000 });
  fs.rmSync(dir, { recursive: true, force: true });
  const okk = r.status === 0;
  panel?.webview.postMessage({
    t: 'check', ok: okk,
    text: okk ? 'javac ' + j.version + ': compile SUCCESS ✓' : ('javac ' + j.version + ' errors:\n' + (r.stderr || r.stdout || r.error || '')).replace(new RegExp(escapeRe(file), 'g'), name + '.java')
  });
}

/** Purana ya naya code integrated terminal mein chalao — input (Scanner/readln) ke saath */
async function runInTerminal(which) {
  const j = findJdk();
  if (!j) { checkJdk(true); return; }
  const doc = await docFor(panelDoc);
  const res = safeModernize(doc.getText(), { enabled: enabledRules(), target: state.target, lang: state.lang });
  const code = which === 'old' ? doc.getText() : res.code;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'punarnava-run-'));
  const name = mainName(doc, code);
  const file = path.join(dir, name + '.java');
  fs.writeFileSync(file, code);
  // Windows par terminal ka shell fix karo (cmd.exe) — user ka default PowerShell,
  // Git Bash ya cmd kuch bhi ho sakta hai, aur quoting har shell mein alag hai.
  const win = process.platform === 'win32';
  const t = vscode.window.createTerminal({
    name: 'Punarnava · ' + (which === 'old' ? 'old' : 'modern') + ' Java',
    ...(win ? { shellPath: process.env.ComSpec || 'cmd.exe' } : {})
  });
  t.show();
  // `java File.java` = source-file mode: compile + run ek hi step mein (Java 11+)
  const q = s => (win ? '"' + s + '"' : "'" + s.replace(/'/g, "'\\''") + "'");
  t.sendText(q(j.java) + ' ' + q(file));
}

/** Public class ka naam = file ka naam hona chahiye; compact file ke liye original file naam */
function mainName(doc, code) {
  const m = /\bpublic\s+(?:final\s+)?(?:class|record|enum|interface)\s+([A-Za-z_$][\w$]*)/.exec(code);
  if (m) return m[1];
  const base = path.basename(doc.uri.fsPath || 'Main.java').replace(/\.java$/i, '');
  return /^[A-Za-z_$][\w$]*$/.test(base) ? base : 'Main';
}

/* ───────────── Examples ───────────── */

async function openExample(context) {
  const dir = path.join(context.extensionPath, 'examples');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.java'));
  const pick = await vscode.window.showQuickPick(files.map(f => ({ label: f, description: exampleDesc(f) })), { placeHolder: 'Punarnava: open an old-Java example' });
  if (!pick) return;
  // Example ko temp copy mein kholo taaki extension folder ki file na badle
  const tmp = path.join(os.tmpdir(), 'punarnava-examples');
  fs.mkdirSync(tmp, { recursive: true });
  const dst = path.join(tmp, pick.label);
  fs.copyFileSync(path.join(dir, pick.label), dst);
  const doc = await vscode.workspace.openTextDocument(dst);
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  openPanel(context, doc.uri);
}

function exampleDesc(f) {
  return ({
    'OldJava.java': 'Hello world — void main() + IO',
    'Calculator.java': 'Scanner input → IO.readln()',
    'Grades.java': 'switch → switch expression, var',
    'Shapes.java': 'text blocks, records, instanceof pattern'
  })[f] || '';
}

/* ───────────── helpers ───────────── */

async function docFor(uri) {
  try {
    if (uri && uri.fsPath !== undefined && uri.scheme) return await vscode.workspace.openTextDocument(uri);
    const ed = vscode.window.activeTextEditor;
    if (ed && ed.document.languageId === 'java') return ed.document;
    if (panelDoc) return await vscode.workspace.openTextDocument(panelDoc);
  } catch { /* fall through */ }
  vscode.window.showInformationMessage('Punarnava: open a .java file first.');
  return null;
}

function safeModernize(text, opts) {
  try { return modernize(text, opts); }
  catch (e) { out.appendLine('engine error: ' + (e && e.stack || e)); return null; }
}

function stripTicks(s) { return String(s).replace(/`/g, ''); }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function htmlShell(webview, context) {
  const media = p => webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', p)));
  const nonce = [...Array(24)].map(() => Math.random().toString(36)[2]).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${media('panel.css')}">
<title>Punarnava</title></head>
<body><div id="app"><p class="muted">Loading…</p></div>
<script nonce="${nonce}" src="${media('panel.js')}"></script></body></html>`;
}

function deactivate() { }

module.exports = { activate, deactivate };
