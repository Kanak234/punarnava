/*
 * scripts/preview-panel.js — panel ko bina VS Code ke browser mein dekhne ke liye
 * ek HTML page banata hai (VS Code dark theme variables + asli engine output).
 * USE: node scripts/preview-panel.js examples/Calculator.java out.html [en] [light]
 */
'use strict';
const fs = require('fs'), path = require('path');
const { modernize, diffLines, RULES, defaultEnabled } = require('../src/engine');
const { RULES: EX } = require('../src/explain');
const [file, outFile, lang = 'hi', theme = 'dark'] = process.argv.slice(2);
const src = fs.readFileSync(file, 'utf8');
const review = ['scanner-to-io'];
const res = modernize(src, { enabled: [...defaultEnabled(), ...review], lang });
const msg = {
  t: 'render', file: path.basename(file), original: src, modern: res.code, diff: diffLines(src, res.code),
  changes: res.changes, available: res.available, warnings: res.warnings, minJava: res.minJava, lang, target: 25,
  reviewRules: RULES.filter(r => r.safety === 'review').map(r => ({ id: r.id, java: r.java, on: review.includes(r.id), title: EX[r.id].title[lang] }))
};
const dark = {
  '--vscode-foreground': '#cccccc', '--vscode-editor-background': '#1e1e1e', '--vscode-descriptionForeground': '#9d9d9d',
  '--vscode-font-family': 'Segoe UI, Ubuntu, sans-serif', '--vscode-font-size': '13px', '--vscode-editor-font-family': 'DejaVu Sans Mono, monospace',
  '--vscode-editor-font-size': '13px', '--vscode-textCodeBlock-background': '#2a2a2a', '--vscode-button-background': '#0e639c',
  '--vscode-button-foreground': '#ffffff', '--vscode-button-hoverBackground': '#1177bb', '--vscode-button-secondaryBackground': '#3a3d41',
  '--vscode-button-secondaryForeground': '#ffffff', '--vscode-button-secondaryHoverBackground': '#45494e', '--vscode-dropdown-background': '#3c3c3c',
  '--vscode-dropdown-foreground': '#f0f0f0', '--vscode-dropdown-border': '#3c3c3c', '--vscode-editorWidget-background': '#252526',
  '--vscode-widget-border': '#3a3a3a', '--vscode-editorLineNumber-foreground': '#6e7681', '--vscode-errorForeground': '#f48771', '--vscode-focusBorder': '#007fd4'
};
const light = {
  '--vscode-foreground': '#3b3b3b', '--vscode-editor-background': '#ffffff', '--vscode-descriptionForeground': '#616161',
  '--vscode-font-family': 'Segoe UI, Ubuntu, sans-serif', '--vscode-font-size': '13px', '--vscode-editor-font-family': 'DejaVu Sans Mono, monospace',
  '--vscode-editor-font-size': '13px', '--vscode-textCodeBlock-background': '#f3f3f3', '--vscode-button-background': '#005fb8',
  '--vscode-button-foreground': '#ffffff', '--vscode-button-hoverBackground': '#0258a8', '--vscode-button-secondaryBackground': '#e5e5e5',
  '--vscode-button-secondaryForeground': '#3b3b3b', '--vscode-button-secondaryHoverBackground': '#cccccc', '--vscode-dropdown-background': '#ffffff',
  '--vscode-dropdown-foreground': '#3b3b3b', '--vscode-dropdown-border': '#cecece', '--vscode-editorWidget-background': '#f8f8f8',
  '--vscode-widget-border': '#e5e5e5', '--vscode-editorLineNumber-foreground': '#6e7681', '--vscode-errorForeground': '#a1260d', '--vscode-focusBorder': '#005fb8',
  '--vscode-symbolIcon-keywordForeground': '#af00db', '--vscode-debugTokenExpression-string': '#a31515', '--vscode-debugTokenExpression-number': '#098658', '--vscode-symbolIcon-classForeground': '#267f99'
};
const vars = Object.entries(theme === 'light' ? light : dark).map(([k, v]) => k + ':' + v).join(';');
const media = path.join(__dirname, '..', 'media');
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>:root{${vars}}</style>
<style>${fs.readFileSync(path.join(media, 'panel.css'), 'utf8')}</style></head><body><div id="app"></div>
<script>window.acquireVsCodeApi=()=>({postMessage(m){ if(m.t==='ready') setTimeout(()=>window.postMessage(${JSON.stringify(msg).replace(/</g, '\\u003c')},'*'),0); }});</script>
<script>${fs.readFileSync(path.join(media, 'panel.js'), 'utf8')}</script></body></html>`;
fs.writeFileSync(outFile, html);
console.log('wrote', outFile, res.changes.length, 'changes');
