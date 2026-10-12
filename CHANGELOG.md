# Changelog

## 1.0.0 — 2026-10-12

First release.

- Side-by-side learning panel: old Java | modern Java, with changed lines highlighted.
- Explanation card for every change (what changed, which Java version, common mistake) and
  a one-question quiz — in Hinglish or English.
- 11 rules from Java 9 to Java 25: instance `void main()`, compact source files,
  `IO.println`/`IO.print`, `Scanner` → `IO.readln` (review), `instanceof` patterns,
  `record` (review), text blocks, arrow `switch`, switch expressions, `var`,
  `Integer.valueOf`.
- Target Java setting (25 / 21 / 17 / 11).
- CodeLens above `main()`, hints with quick fixes in the Problems view.
- Check with `javac`, and run the old or the new program in the terminal.
- CLI: `node cli.js File.java --explain`.
- Verified: every example compiles with `javac 25` and prints exactly the same output as
  the original, on Windows, Linux and macOS (CI).
