/*
 * test/integration/runTest.js — asli VS Code download karke uske andar extension
 * load karta hai aur suite.js chalata hai. (CI mein Windows/Linux/macOS par.)
 */
'use strict';
const path = require('path');
const { runTests } = require('@vscode/test-electron');
(async () => {
  try {
    await runTests({
      extensionDevelopmentPath: path.resolve(__dirname, '../..'),
      extensionTestsPath: path.resolve(__dirname, 'suite.js'),
      launchArgs: ['--disable-extensions', '--disable-workspace-trust']
    });
  } catch (e) {
    console.error('VS Code integration test failed:', e);
    process.exit(1);
  }
})();
