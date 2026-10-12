# Punarnava — purane Java ko naya Java banao, aur samjho bhi

**Punarnava** (पुनर्नव, *"jo phir se naya ho jaye"*) is a free VS Code extension that turns
old-style Java into modern Java 25 — **side-by-side, with a Hinglish or English explanation
and a mini quiz for every single change**.

Tools like OpenRewrite and IntelliJ can migrate code. They don't teach you *why*.
Punarnava is built for students: you see your old code on the left, the modern code on the
right, and a card for each change explaining what changed, which Java version added it,
the mistake students usually make, and a question to check you understood.

```java
// Before (college style)                     // After (Java 25)
import java.util.Scanner;                     void main() {
                                                  int a = Integer.parseInt(IO.readln("Enter a: ").trim());
public class Calculator {                         int b = Integer.parseInt(IO.readln("Enter b: ").trim());
  public static void main(String[] args) {        IO.println("Sum = " + (a + b));
    Scanner sc = new Scanner(System.in);      }
    System.out.print("Enter a: ");
    int a = sc.nextInt();
    System.out.print("Enter b: ");
    int b = sc.nextInt();
    System.out.println("Sum = " + (a + b));
    sc.close();
  }
}
```

## What it modernizes

| Java | Old | Modern | Safety |
|---|---|---|---|
| 25 | `public static void main(String[] args)` | `void main()` (args kept if used) | safe |
| 25 | `public class X { ... }` (single class file) | compact source file (no class line, `java.base` auto-imported) | safe |
| 25 | `System.out.println(x)` / `print` | `IO.println(x)` / `IO.print` | safe |
| 25 | `Scanner` + `nextInt()` / `nextLine()` | `IO.readln("prompt")` + `Integer.parseInt` | **review** |
| 16 | `if (o instanceof T) { T t = (T) o; ...` | `if (o instanceof T t) { ...` | safe |
| 16 | data class (final fields + ctor + accessors) | `record` | **review** |
| 15 | `"a\n" + "b\n" + "c"` | text block `"""` | safe |
| 14 | colon `switch` with `break` | arrow `case X ->` | safe |
| 14 | `switch` that only assigns / returns | switch **expression** | safe |
| 10 | `ArrayList<String> l = new ArrayList<String>()` | `var l = new ArrayList<String>()` | safe |
| 9  | `new Integer(5)` | `Integer.valueOf(5)` | safe |

**safe** rules never change what your program prints. **review** rules can change behaviour
slightly (e.g. `IO.readln()` reads a whole *line*, `Scanner.nextInt()` reads one *token*), so
they are **off by default** — tick them in the panel once you understand the difference.

### What it deliberately leaves alone

Punarnava would rather skip a change than break your code. It does **not** touch:
code inside comments or strings · `println(char[])` (IO would print `[C@…`) ·
`var` with the diamond `<>` or an interface type (the type would change) · fields ·
switches with real fall-through, early `break`, or variables shared between cases ·
files with a `package` line, `extends`, or no no-arg constructor (for compact files /
instance main) · `Scanner` loops using `hasNextInt()`.

## How to use

- Open any `.java` file. A **✦ Punarnava** line appears above `main()` — click it.
- Or press **Ctrl+Alt+J** (**Cmd+Alt+J** on macOS), or click the ✨ icon in the editor title bar.
- In the panel: **Apply to file** (undo with Ctrl+Z) · **Open in new tab** (your file stays
  untouched) · **Check with javac** · **▶ Run old / ▶ Run new** in the terminal to compare.
- Switch explanations between **Hinglish** and **English**, and choose a **Target Java**
  (25 / 21 / 17 / 11) to match the JDK you have installed.
- `Punarnava: Open an old-Java example` gives you four ready programs to try.

Needs **JDK 25 or newer** to *run* Java 25 code (`void main()`, `IO`). Pick Target Java 21/17
if your college lab has an older JDK. `Punarnava: Check my JDK version` tells you what you have.

## How we know the output is correct

Every release runs the test suite on **Windows, Linux and macOS** with JDK 25:
the original and the modernized program are both compiled with `javac 25`, run with the
same input, and their output must match **byte for byte**. Plus unit tests for every
"leave this alone" case above. Run it yourself: `node test/run-tests.js`.

## Settings

| Setting | Default | |
|---|---|---|
| `punarnava.language` | `hinglish` | `hinglish` or `english` |
| `punarnava.targetJava` | `25` | newest Java features to use |
| `punarnava.enableReviewRules` | `[]` | `scanner-to-io`, `record-class` |
| `punarnava.jdkPath` | | JDK folder for Check/Run (else `JAVA_HOME`/PATH) |
| `punarnava.codeLens` | `true` | the ✦ line above `main()` |
| `punarnava.hints` | `true` | hints + quick fixes in the Problems view |

Also works from a terminal: `node cli.js OldCode.java --explain`.

---

Made by **Kanak Prabhakar** · [Cooding with Kanak](https://www.youtube.com/@cooding-with-kanak) · MIT License
