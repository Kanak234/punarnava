#!/usr/bin/env node
/*
 * test/run-tests.js — Punarnava ka poora test suite. Windows, Linux, macOS teeno par
 * same chalta hai (sirf Node + optional JDK 25).
 *
 * TEEN tarah ke test:
 *   1. UNIT     — engine ko chhote snippets do, check karo ki sahi badla / NAHI badla
 *                 (comment ke andar ka code, char[] println, diamond var, fall-through...)
 *   2. COMPILE  — har fixture ka naya code JDK 25 `javac` se compile hona chahiye
 *   3. SAME-OUTPUT — purana aur naya program same input par byte-by-byte same output de
 *                 (yahi asli proof hai ki conversion ne behaviour nahi badla)
 *
 * JDK 25 kahan se: env PUNARNAVA_JDK=<jdk folder>, ya JAVA_HOME, ya PATH ka javac.
 * Agar JDK 25 na mile to 2 aur 3 SKIP hote hain (CI mein JDK 25 install hota hai).
 * FLOW:  node test/run-tests.js → exit code 0 = sab pass
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { modernize, RULES, diffLines } = require('../src/engine');

let pass = 0, fail = 0, skip = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + String(extra).split('\n').join('\n      ') : '')); }
};
const ALL = RULES.map(r => r.id);
const conv = (src, all = true, extra = {}) => modernize(src, { enabled: all ? ALL : undefined, ...extra }).code;

/* ───────────────────────── 1. UNIT ───────────────────────── */
console.log('\n[1] unit — engine behaviour');

ok(conv('class A {\n    public static void main(String[] args) {\n        System.out.println("x");\n    }\n}\n') ===
  'void main() {\n    IO.println("x");\n}\n', 'Hello world → compact source + IO.println');

ok(conv('class A {\n    // public static void main(String[] args)\n    public static void main(String[] a) { System.out.println(a.length); }\n}\n')
  .includes('// public static void main(String[] args)'), 'code inside comments is never touched');

ok(conv('class A { public static void main(String[] a) { String s = "System.out.println(1)"; } }')
  .includes('"System.out.println(1)"'), 'code inside strings is never touched');

ok(conv('class A { public static void main(String[] args) { char[] c = {\'a\'}; System.out.println(c); } }')
  .includes('System.out.println(c)'), 'println(char[]) stays System.out (IO would print [C@...)');

ok(/List<String> l = new ArrayList<>\(\)/.test(conv('class A { void f() { List<String> l = new ArrayList<>(); } }')),
  'diamond <> is NOT turned into var (would become ArrayList<Object>)');

ok(/List<String> l = new ArrayList<String>\(\)/.test(conv('class A { void f() { List<String> l = new ArrayList<String>(); } }')),
  'interface-typed variable is NOT turned into var (type would change)');

ok(/private StringBuilder sb = new StringBuilder\(\)/.test(conv('class A { private StringBuilder sb = new StringBuilder(); }')),
  'fields never get var');

ok(/var sb = new StringBuilder\(\)/.test(conv('class A { void f() { StringBuilder sb = new StringBuilder(); } }')),
  'local with same type on both sides → var');

ok(/StringBuilder a = new StringBuilder\(\), b = new StringBuilder\(\)/.test(conv('class A { void f() { StringBuilder a = new StringBuilder(), b = new StringBuilder(); } }')),
  'multi-variable declaration is left alone');

ok(/Runnable r = new Runnable\(\) \{/.test(conv('class A { void f() { Runnable r = new Runnable() { public void run() {} }; } }')),
  'anonymous class is left alone (var would change the type)');

{
  const fall = 'class A { void f(int d) {\n switch (d) {\n  case 1:\n   System.out.println(1);\n  case 2:\n   System.out.println(2);\n   break;\n }\n} }';
  ok(/case 1:/.test(conv(fall)), 'real fall-through switch is NOT converted');
}
{
  const brk = 'class A { void f(int d) {\n switch (d) {\n  case 1:\n   if (d > 0) break;\n   System.out.println(1);\n   break;\n  default:\n   break;\n }\n} }';
  ok(/case 1:/.test(conv(brk)), 'switch with an early break inside a case is NOT converted');
}
{
  const scope = 'class A { void f(int d) {\n switch (d) {\n  case 1:\n   int x = 1;\n   break;\n  case 2:\n   x = 2;\n   System.out.println(x);\n   break;\n }\n} }';
  ok(/case 1:/.test(conv(scope)), 'switch whose case variable is shared with another case is NOT converted');
}
{
  const out = conv('class A { void f(int d) {\n        int r;\n        switch (d) {\n            case 1: r = 10; break;\n            default: r = 0;\n        }\n    }\n}');
  ok(/int r = switch \(d\) \{\n\s+case 1 -> 10;\n\s+default -> 0;\n\s+\};/.test(out), 'declaration + switch assignment → `int r = switch (...)`', out);
}
ok(/case 1:/.test(conv('class A { int f(int d) { switch (d) { case 1: return 1; case 2: return 2; } return 0; } }')) ||
   !/return switch/.test(conv('class A { int f(int d) { switch (d) { case 1: return 1; case 2: return 2; } return 0; } }')),
  'return-switch without default is not turned into an expression');

ok(conv('class A { String s = "a\\n" + "b\\n" + "c"; }').includes('"""\n    a\n    b\n    c"""'),
  'text block: no trailing newline → closing """ on last line (value unchanged)');
ok(conv('class A { String s = "a\\n" + "b\\n"; }').includes('"""\n    a\n    b\n    """'),
  'text block: trailing newline → closing """ on its own line');
ok(conv('class A { String s = "a \\n" + "b\\n" + "c"; }').includes('"a \\n"'),
  'text block skipped when a line has trailing spaces (would be stripped)');
ok(conv('class A { String s = "a\\n" + x + "b\\n"; }').includes('"a\\n" + x'),
  'chains with variables are not text-blocked');

ok(/if \(o instanceof String s\) \{\n\s+return s;/.test(conv('class A { Object f(Object o) {\n if (o instanceof String) {\n   String s = (String) o;\n   return s;\n }\n return o; } }')),
  'instanceof + cast → pattern matching');

ok(/Integer\.valueOf\(5\)/.test(conv('class A { Integer i = new Integer(5); }')), 'new Integer(5) → Integer.valueOf(5)');

ok(conv('package p;\npublic class A {\n    public static void main(String[] args) {}\n}\n').includes('public class A'),
  'files with a package declaration do not become compact source files');
ok(conv('public class A {\n    A(int x) {}\n    public static void main(String[] args) {}\n}\n').includes('public static void main'),
  'class without a no-arg constructor keeps static main');
ok(conv('class A extends Thread {\n    public static void main(String[] args) {}\n}\n').includes('class A extends Thread'),
  'class with extends is not unwrapped into a compact file');
ok(conv('import javax.swing.JFrame;\nclass A {\n    public static void main(String[] args) { JFrame f = null; }\n}\n').includes('import javax.swing.JFrame;'),
  'non-java.base imports are kept in a compact file');
ok(!conv('import java.util.Scanner;\nclass A {\n    public static void main(String[] args) { Scanner s = null; }\n}\n').includes('import java.util'),
  'java.base imports are dropped in a compact file');

{
  const sc = 'import java.util.Scanner;\nclass A {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        while (in.hasNextInt()) { System.out.println(in.nextInt()); }\n    }\n}\n';
  ok(conv(sc).includes('hasNextInt'), 'Scanner with hasNextInt() loop is NOT converted (no IO equivalent)');
}
{
  const r = modernize('class A { void f() { java.util.Scanner s = null; } }');
  ok(Array.isArray(r.available) && Array.isArray(r.changes), 'result shape has changes[] and available[]');
}
{
  const r = modernize('import java.util.Scanner;\nclass A {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int a = sc.nextInt();\n        System.out.println(a);\n    }\n}\n');
  ok(r.available.some(a => a.id === 'scanner-to-io'), 'review rule (Scanner) is OFF by default but reported as available');
  ok(r.code.includes('sc.nextInt()'), 'default run does not apply the review rule');
}
{
  const crlf = 'class A {\r\n    public static void main(String[] args) {\r\n        System.out.println("x");\r\n    }\r\n}\r\n';
  ok(conv(crlf) === 'void main() {\r\n    IO.println("x");\r\n}\r\n', 'Windows CRLF line endings are preserved');
}
ok(conv('class A { public static void main(String[] a) {} }', true, { target: 21 }).includes('public static void main'),
  'target Java 21 → Java 25-only rules are skipped');
ok(diffLines('a\nb\nc', 'a\nc').some(d => d.type === 'del' && d.text === 'b'), 'line diff marks removed lines');
{
  const bad = 'class A { void f( { }';
  let threw = false; try { modernize(bad); } catch { threw = true; }
  ok(!threw, 'broken / half-typed code never crashes the engine');
}

/* ───────────────── 2 + 3. COMPILE + SAME OUTPUT ───────────────── */
console.log('\n[2+3] compile with JDK 25 and compare program output');

const jdk = findJdk25();
const fixtures = path.join(__dirname, 'fixtures');
if (!jdk) {
  console.log('  - JDK 25 not found (set PUNARNAVA_JDK) — compile/output tests SKIPPED');
  skip++;
} else {
  console.log('  using ' + jdk.javac);
  const files = fs.readdirSync(fixtures).filter(f => f.endsWith('.java'));
  for (const mode of ['default', 'all']) {
    for (const f of files) {
      const name = f.replace(/\.java$/, '');
      const src = fs.readFileSync(path.join(fixtures, f), 'utf8');
      const res = modernize(src, { enabled: mode === 'all' ? ALL : undefined });
      const stdinFile = path.join(fixtures, name + '.stdin');
      const argsFile = path.join(fixtures, name + '.args');
      const input = fs.existsSync(stdinFile) ? fs.readFileSync(stdinFile, 'utf8') : '';
      const progArgs = fs.existsSync(argsFile) ? fs.readFileSync(argsFile, 'utf8').trim().split(/\s+/) : ['one', 'two'];
      const oldRun = compileAndRun(jdk, name, src, input, progArgs, 'old');
      const newRun = compileAndRun(jdk, name, res.code, input, progArgs, 'new');
      ok(oldRun.compiled, `${mode}/${name}: original compiles`, oldRun.err);
      ok(newRun.compiled, `${mode}/${name}: modernized compiles with javac 25 (${res.changes.length} changes)`, newRun.err + '\n--- code ---\n' + res.code);
      if (oldRun.compiled && newRun.compiled) {
        ok(oldRun.out === newRun.out, `${mode}/${name}: same output as original`,
          'old: ' + JSON.stringify(oldRun.out) + '\nnew: ' + JSON.stringify(newRun.out));
      }
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed${skip ? ', ' + skip + ' skipped' : ''}`);
process.exit(fail ? 1 : 0);

/* ───────────────────────── helpers ───────────────────────── */

function findJdk25() {
  const exe = process.platform === 'win32' ? '.exe' : '';
  const homes = [process.env.PUNARNAVA_JDK, process.env.JAVA_HOME].filter(Boolean);
  const cands = homes.map(h => ({ javac: path.join(h, 'bin', 'javac' + exe), java: path.join(h, 'bin', 'java' + exe) }));
  cands.push({ javac: 'javac', java: 'java' });
  for (const c of cands) {
    try {
      const v = cp.execFileSync(c.javac, ['-version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const m = /javac (\d+)/.exec(v);
      if (m && Number(m[1]) >= 25) return c;
    } catch { /* next */ }
  }
  return null;
}

function compileAndRun(jdk, name, code, input, args, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'punarnava-' + tag + '-'));
  const file = path.join(dir, name + '.java');
  fs.writeFileSync(file, code);
  const classes = path.join(dir, 'classes');
  const env = { ...process.env, JAVA_TOOL_OPTIONS: '' };
  const c = cp.spawnSync(jdk.javac, ['-nowarn', '-Xlint:none', '-d', classes, file], { encoding: 'utf8', env });
  if (c.status !== 0) return { compiled: false, err: (c.stderr || '') + (c.stdout || '') };
  // package wali class: package path ke saath main class naam
  const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(code);
  const mainClass = (pkg ? pkg[1] + '.' : '') + name;
  const r = cp.spawnSync(jdk.java, ['-cp', classes, mainClass, ...args], { input, encoding: 'utf8', env, timeout: 20000 });
  fs.rmSync(dir, { recursive: true, force: true });
  const clean = s => (s || '').split(/\r?\n/).filter(l => !/^Picked up JAVA_TOOL_OPTIONS/.test(l)).join('\n');
  return { compiled: true, out: clean(r.stdout) + (r.status !== 0 ? '\n[exit ' + r.status + '] ' + clean(r.stderr) : ''), err: '' };
}
