/*
 * test/integration/suite.js — asli VS Code ke andar chalta hai.
 * Example file kholo → command chalao → document modern ho gaya? → panel khula?
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

exports.run = async function () {
  const ext = vscode.extensions.all.find(e => e.packageJSON.name === 'punarnava');
  assert.ok(ext, 'extension loaded');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-it-'));
  const file = path.join(dir, 'OldJava.java');
  fs.copyFileSync(path.join(ext.extensionPath, 'examples', 'OldJava.java'), file);
  const doc = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(doc);
  await ext.activate();
  const cmds = await vscode.commands.getCommands(true);
  for (const c of ['punarnava.modernize', 'punarnava.applySafe', 'punarnava.openExample', 'punarnava.checkJdk'])
    assert.ok(cmds.includes(c), 'command ' + c);
  await vscode.commands.executeCommand('punarnava.modernize', doc.uri);
  await vscode.commands.executeCommand('punarnava.applySafe', doc.uri);
  await new Promise(r => setTimeout(r, 500));
  const text = doc.getText();
  assert.ok(/^void main\(\) \{/m.test(text), 'void main() applied');
  assert.ok(/IO\.println\("Hello, Java!"\)/.test(text), 'IO.println applied');
  assert.ok(!/public class/.test(text), 'compact source file');
  console.log('Punarnava integration: OK on ' + process.platform);
};
