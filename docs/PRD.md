# Punarnava — PRD + TRD (v1.0)

## Problem (verified 2026-10-12)
- Java 25 (Sept 2025, LTS) changed how beginner programs look: `void main()`, compact
  source files, `IO.println` / `IO.readln`, auto-import of `java.base`.
- College syllabus and most notes still teach the old style. Kanak's juniors at AISECT
  University cannot read the new style; the HOD agreed to pilot and test the tool.
- Existing tools (OpenRewrite `UpgradeToJava25`, IntelliJ quick-fixes) **migrate** code but
  do not **teach**, need Maven/Gradle or a specific IDE, and have no Hinglish.

## Goal
A free VS Code extension that converts old Java to modern Java and **explains every change**
so a BCA/B.Tech student understands it.

## Non-goals (v1)
Whole-project migration (OpenRewrite does that) · build files · Java EE/Spring APIs ·
paid features (download gate: paid only after 1,000+ installs).

## Users
BCA/B.Tech students (primary), Java instructors, coaching institutes.

## Features
1. Side-by-side panel (old | modern), changed lines highlighted.
2. Card per change: Java version, why, common mistake, 1-question quiz. Hinglish/English.
3. Rules (Java 9 → 25), safe by default; behaviour-changing rules are "review" and off.
4. Apply (undoable), open as new tab, copy, javac check, run old/new in terminal.
5. Target Java 25/21/17/11. CodeLens above main(). Hints + quick fixes.

## Acceptance criteria
- Every fixture: original and modernized both compile with `javac 25`, same output byte for byte.
- Never modifies code inside comments/strings.
- Every "leave alone" case has a unit test (see README).
- Tests pass on Windows, Linux, macOS (CI).

## Architecture (TRD)
- `src/engine.js` — pure Node, no VS Code dependency. Rule pipeline:
  lex (mask comments/strings, same offsets) → structure (type vs block braces) → rule.run →
  edits → overlap + bracket-balance safety checks → apply → next rule.
- `src/rules/*` — one file per family; each rule: `{id, java, safety, run(ctx) → edits}`.
- `src/explain.js` — all teaching text in one place (for teacher review).
- `extension.js` — VS Code glue; `media/panel.*` — webview (strict CSP, textContent only).
- `cli.js` — same engine from a terminal (tests, labs, future web demo).
- Decision: rule-based, not AI. Reason: deterministic, offline, verifiable output — a
  learning tool must never show a wrong "modern" version.

## Open items
- Teacher review of `src/explain.js` text (acceptance criterion from the conditional pass).
- Usability test with 5 students (AISECT pilot).
- KP orbit watermark: add `media/logo-mark.svg` when Kanak supplies it.
