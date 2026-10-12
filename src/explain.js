/*
 * explain.js — har rule ki "padhai wali" baatein: kya badla, kyun badla,
 * students kaunsi galti karte hain, aur ek practice question.
 *
 * WHY:   Punarnava sirf converter nahi, learning tool hai. OpenRewrite/IntelliJ
 *        code badal dete hain par samjhate nahi — yahi hamara asli farq hai.
 * WHAT:  Rule id → { title, java, why, mistake, practice } — Hinglish aur English dono.
 * USE:   engine.js har change ke saath yeh text attach karta hai; panel.js dikhata hai.
 * FLOW:  rules/*.js (id) → engine.js → explain(id, lang) → webview cards
 *
 * NOTE:  Yeh text expert review ke liye ek hi jagah rakha gaya hai — teacher ko
 *        sirf yeh file padhni hai technical correctness check karne ke liye.
 */
'use strict';

const RULES = {
  'instance-main': {
    java: 25,
    title: { hi: 'Instance main method — `void main()`', en: 'Instance main method — `void main()`' },
    why: {
      hi: 'Java 25 (JEP 512) se `main` ko `public static` hone ki zaroorat nahi. Launcher khud class ka object banata hai aur `main()` call karta hai. Agar `args` use nahi ho rahe, to parameter bhi hata sakte ho.',
      en: 'Since Java 25 (JEP 512) `main` no longer needs to be `public static`. The launcher creates an instance of the class and calls `main()`. If `args` is unused, the parameter can go too.'
    },
    mistake: {
      hi: 'Galti: socha ki purana `public static void main(String[] args)` ab galat hai. Nahi — woh ab bhi 100% valid hai. Naya tareeka sirf chhota hai. Aur instance main ke liye class mein bina-argument wala constructor hona chahiye.',
      en: 'Mistake: thinking the old `public static void main(String[] args)` is now wrong. It is still 100% valid; the new form is just shorter. An instance main also needs a no-argument constructor in the class.'
    },
    practice: {
      q: { hi: 'Java 25 mein inme se kaunsa main method valid HAI?', en: 'Which of these is a valid main method in Java 25?' },
      options: ['void main()', 'private void main()', 'static int main()', 'void Main()'],
      answer: 0,
      explain: {
        hi: '`void main()` valid hai. `private` main launcher nahi dhoondhta, `int` return type allowed nahi, aur `Main` (capital M) alag naam hai.',
        en: '`void main()` is valid. The launcher ignores a `private` main, an `int` return type is not allowed, and `Main` (capital M) is a different name.'
      }
    }
  },

  'compact-source': {
    java: 25,
    title: { hi: 'Compact source file — class likhne ki zaroorat nahi', en: 'Compact source file — no class declaration needed' },
    why: {
      hi: 'Java 25 mein chhoti file mein seedha methods aur fields likh sakte ho. Compiler ek "implicit class" khud bana deta hai. Saath mein `java.base` module ke saare packages (java.util, java.io, ...) apne aap import ho jaate hain — isliye `import java.util.Scanner;` bhi zaroori nahi.',
      en: 'In Java 25 a small file can contain methods and fields directly. The compiler creates an "implicit class" for you, and every package of the `java.base` module (java.util, java.io, ...) is imported automatically — so `import java.util.Scanner;` is no longer required.'
    },
    mistake: {
      hi: 'Galti: compact file ki class ka naam doosri file se use karna (`new Hello()`). Implicit class ka naam code se refer nahi kar sakte. Bade project mein normal class hi likho — compact file sirf chhote programs aur seekhne ke liye hai.',
      en: 'Mistake: referring to the implicit class by name from another file (`new Hello()`). The implicit class cannot be named in code. Large projects should keep normal classes — compact files are for small programs and learning.'
    },
    practice: {
      q: { hi: 'Compact source file mein kaunsa import AB BHI likhna padega?', en: 'Which import must you STILL write in a compact source file?' },
      options: ['import java.util.ArrayList;', 'import java.io.File;', 'import javax.swing.JFrame;', 'import java.time.LocalDate;'],
      answer: 2,
      explain: {
        hi: '`javax.swing` java.base module mein nahi hai (java.desktop mein hai), isliye woh import zaroori hai. Baaki teeno java.base ke hain.',
        en: '`javax.swing` is not in java.base (it lives in java.desktop), so that import is still needed. The other three are in java.base.'
      }
    }
  },

  'io-println': {
    java: 25,
    title: { hi: '`System.out.println` → `IO.println`', en: '`System.out.println` → `IO.println`' },
    why: {
      hi: 'Java 25 mein `java.lang.IO` class aayi hai: `IO.println()`, `IO.print()`, `IO.readln()`. Yeh `java.lang` mein hai, to kisi import ki zaroorat nahi. Andar se yeh bhi `System.out` hi use karti hai, isliye output same aata hai.',
      en: 'Java 25 adds the `java.lang.IO` class: `IO.println()`, `IO.print()`, `IO.readln()`. It lives in `java.lang`, so no import is needed. It writes to `System.out`, so output is identical.'
    },
    mistake: {
      hi: 'Galti: `IO.printf(...)` likhna — IO mein printf nahi hai. Formatting ke liye `System.out.printf` ya `IO.println(String.format(...))` use karo.',
      en: 'Mistake: writing `IO.printf(...)` — IO has no printf. Use `System.out.printf` or `IO.println(String.format(...))` for formatting.'
    },
    practice: {
      q: { hi: '`IO.println("Hi")` chalane ke liye kaunsa import chahiye?', en: 'Which import does `IO.println("Hi")` need?' },
      options: ['import java.io.IO;', 'import java.lang.IO;', 'Koi import nahi / No import', 'import java.util.IO;'],
      answer: 2,
      explain: {
        hi: '`IO` java.lang package mein hai, aur java.lang hamesha auto-import hota hai.',
        en: '`IO` is in java.lang, which is always imported automatically.'
      }
    }
  },

  'scanner-to-io': {
    java: 25,
    title: { hi: '`Scanner` input → `IO.readln()`', en: '`Scanner` input → `IO.readln()`' },
    why: {
      hi: 'Seekhne wale programs mein `Scanner` banana, import karna aur close karna — sab boilerplate hai. Java 25 mein `IO.readln("Enter a: ")` prompt dikhata hai aur poori line String mein deta hai. Number chahiye to `Integer.parseInt(...)` lagao. Bonus: purana `nextInt()` ke baad `nextLine()` khaali aane wala famous bug isme hota hi nahi.',
      en: 'For learning programs, creating, importing and closing a `Scanner` is boilerplate. In Java 25 `IO.readln("Enter a: ")` prints a prompt and returns the whole line as a String; wrap it in `Integer.parseInt(...)` for numbers. Bonus: the classic "nextLine() returns empty after nextInt()" bug cannot happen.'
    },
    mistake: {
      hi: 'DHYAAN DO (review): `IO.readln()` poori LINE padhta hai, `Scanner.nextInt()` sirf ek TOKEN. Agar user ek hi line mein "10 20" type kare, to naya code error dega. Har value alag line par enter karni hogi.',
      en: 'REVIEW: `IO.readln()` reads a whole LINE, `Scanner.nextInt()` reads one TOKEN. If the user types "10 20" on one line, the new code throws. Each value must be entered on its own line.'
    },
    practice: {
      q: { hi: 'User ne "5" type kiya. `int x = Integer.parseInt(IO.readln());` ke baad x kya hai?', en: 'The user types "5". After `int x = Integer.parseInt(IO.readln());`, what is x?' },
      options: ['"5" (String)', '5 (int)', 'Compile error', '53 (char code)'],
      answer: 1,
      explain: {
        hi: '`IO.readln()` String "5" deta hai, `Integer.parseInt` usse int 5 bana deta hai.',
        en: '`IO.readln()` returns the String "5" and `Integer.parseInt` turns it into the int 5.'
      }
    }
  },

  'var-local': {
    java: 10,
    title: { hi: '`var` — local variable type inference', en: '`var` — local variable type inference' },
    why: {
      hi: 'Java 10 se jab right side par `new ArrayList<String>()` jaisa type saaf dikh raha ho, to left side par dobara likhne ki zaroorat nahi — `var` likho, compiler type khud samajh lega. Type ab bhi STATIC hai, `var` JavaScript jaisa dynamic nahi.',
      en: 'Since Java 10, when the right side already shows the type (e.g. `new ArrayList<String>()`), you can write `var` on the left and the compiler infers it. The type is still STATIC — `var` is not dynamic like JavaScript.'
    },
    mistake: {
      hi: 'Galti: `var list = new ArrayList<>();` — diamond `<>` ke saath type `ArrayList<Object>` ban jaata hai. Isliye Punarnava diamond wale case ko nahi chhedta. Aur `var` field ya method parameter par nahi chalta.',
      en: 'Mistake: `var list = new ArrayList<>();` — with the diamond the type becomes `ArrayList<Object>`. That is why Punarnava leaves diamond cases alone. `var` also does not work on fields or method parameters.'
    },
    practice: {
      q: { hi: 'Inme se kaunsa line COMPILE hogi?', en: 'Which line COMPILES?' },
      options: ['var x;', 'var y = null;', 'var z = new StringBuilder();', 'var a = {1, 2, 3};'],
      answer: 2,
      explain: {
        hi: '`var` ko initializer se type chahiye. `null` aur `{1,2,3}` se type pata nahi chalta, aur bina initializer `var` allowed nahi.',
        en: '`var` needs an initializer to infer a type. `null` and `{1,2,3}` give no type, and `var` without an initializer is not allowed.'
      }
    }
  },

  'switch-arrow': {
    java: 14,
    title: { hi: 'Arrow `switch` (`case X ->`)', en: 'Arrow `switch` (`case X ->`)' },
    why: {
      hi: 'Java 14 se `case 1 ->` likh sakte ho. Isme `break` ki zaroorat nahi aur fall-through (galti se agla case chal jaana) hota hi nahi. Kai labels ek saath: `case 1, 2 ->`.',
      en: 'Since Java 14 you can write `case 1 ->`. No `break` is needed and accidental fall-through cannot happen. Several labels can share one arm: `case 1, 2 ->`.'
    },
    mistake: {
      hi: 'Galti: ek hi switch mein `case 1:` aur `case 2 ->` dono mix karna — compile error. Ya to sab colon style, ya sab arrow style.',
      en: 'Mistake: mixing `case 1:` and `case 2 ->` in one switch — that is a compile error. Use one style throughout.'
    },
    practice: {
      q: { hi: 'Arrow switch mein `break` likhna kab zaroori hai?', en: 'When is `break` required in an arrow switch?' },
      options: ['Har case ke baad', 'Sirf default ke baad', 'Kabhi nahi (fall-through hota hi nahi)', 'Sirf String switch mein'],
      answer: 2,
      explain: {
        hi: 'Arrow form mein har arm akela chalta hai, isliye `break` ki zaroorat kabhi nahi.',
        en: 'In the arrow form each arm runs on its own, so `break` is never needed.'
      }
    }
  },

  'switch-expression': {
    java: 14,
    title: { hi: 'Switch expression — switch se value lo', en: 'Switch expression — switch that returns a value' },
    why: {
      hi: 'Jab har case sirf ek hi variable ko value deta hai, to Java 14 ka switch expression seedha value return kar sakta hai: `int r = switch (day) { case 1 -> 10; default -> 0; };`. Compiler check karta hai ki har case cover hai — variable "unassigned" reh hi nahi sakta.',
      en: 'When every case only assigns one variable, a Java 14 switch expression returns the value directly: `int r = switch (day) { case 1 -> 10; default -> 0; };`. The compiler checks every case is covered, so the variable can never stay unassigned.'
    },
    mistake: {
      hi: 'Galti: switch expression ke end mein `;` bhool jaana. Yeh ek expression hai, statement ki tarah `};` se khatam hota hai.',
      en: 'Mistake: forgetting the `;` after the closing brace. It is an expression, so the statement ends with `};`.'
    },
    practice: {
      q: { hi: 'Switch expression mein `default` kab zaroori hai (int par)?', en: 'When is `default` required in a switch expression over an int?' },
      options: ['Kabhi nahi', 'Hamesha — sab values cover honi chahiye', 'Sirf 3 se zyada case ho to', 'Sirf String ke liye'],
      answer: 1,
      explain: {
        hi: 'Expression ko har input par value deni hai. int ki saari values cases se cover nahi hoti, isliye `default` zaroori hai.',
        en: 'An expression must produce a value for every input. Cases cannot cover every int, so `default` is required.'
      }
    }
  },

  'text-block': {
    java: 15,
    title: { hi: 'Text block — `"""` multi-line string', en: 'Text block — `"""` multi-line string' },
    why: {
      hi: 'Java 15 se kai lines ka text `"""` ke beech seedha likh sakte ho — `\\n` aur `+` ki lambi chain ki zaroorat nahi. HTML, JSON, SQL ya menu likhna bahut aasaan ho jaata hai.',
      en: 'Since Java 15, multi-line text goes between `"""` delimiters — no long chain of `\\n` and `+`. HTML, JSON, SQL or menus become much easier to write.'
    },
    mistake: {
      hi: 'Galti: closing `"""` ko nayi line par rakhna jab end mein newline nahi chahiye. Closing delimiter nayi line par ho to string ke end mein ek extra `\\n` aa jaata hai. Punarnava yeh dhyaan rakh kar delimiter sahi jagah lagata hai.',
      en: 'Mistake: putting the closing `"""` on its own line when no trailing newline is wanted — that adds an extra `\\n`. Punarnava places the delimiter so the value stays identical.'
    },
    practice: {
      q: { hi: '`"""` ke turant baad (same line par) text likh sakte ho?', en: 'Can text follow the opening `"""` on the same line?' },
      options: ['Haan', 'Nahi — opening `"""` ke baad newline zaroori hai', 'Sirf ek word', 'Sirf Java 21 mein'],
      answer: 1,
      explain: {
        hi: 'Opening delimiter ke baad line khatam honi chahiye; content agli line se shuru hota hai.',
        en: 'The opening delimiter must be followed by a line break; content starts on the next line.'
      }
    }
  },

  'instanceof-pattern': {
    java: 16,
    title: { hi: 'Pattern matching for `instanceof`', en: 'Pattern matching for `instanceof`' },
    why: {
      hi: 'Purana tareeka: pehle `instanceof` check, phir alag line mein cast. Java 16 se dono ek saath: `if (obj instanceof String s)` — `s` already cast ho chuka hai. Kam code, aur galat cast ki galti bhi khatam.',
      en: 'The old way: an `instanceof` check, then a cast on a separate line. Since Java 16 both happen at once: `if (obj instanceof String s)` — `s` is already cast. Less code and no wrong-cast mistakes.'
    },
    mistake: {
      hi: 'Galti: pattern variable ko `if` ke bahar use karna. `s` sirf wahan available hai jahan compiler ko pakka pata ho ki check true hai.',
      en: 'Mistake: using the pattern variable outside the `if`. `s` is only in scope where the compiler knows the check succeeded.'
    },
    practice: {
      q: { hi: '`if (o instanceof Integer n && n > 5)` — kya yeh valid hai?', en: 'Is `if (o instanceof Integer n && n > 5)` valid?' },
      options: ['Haan', 'Nahi, n yahan scope mein nahi', 'Sirf Java 21 mein', 'Sirf || ke saath'],
      answer: 0,
      explain: {
        hi: '`&&` ke right side tabhi chalta hai jab left true ho, isliye `n` wahan available hai.',
        en: 'The right side of `&&` runs only when the left is true, so `n` is in scope there.'
      }
    }
  },

  'wrapper-valueof': {
    java: 9,
    title: { hi: '`new Integer(x)` → `Integer.valueOf(x)`', en: '`new Integer(x)` → `Integer.valueOf(x)`' },
    why: {
      hi: 'Wrapper constructors (`new Integer`, `new Double`, ...) Java 9 mein deprecated hue aur ab "for removal" mark hain — future Java mein hat jaayenge. `valueOf` chhoti values ko cache se deta hai, memory bachti hai.',
      en: 'Wrapper constructors (`new Integer`, `new Double`, ...) were deprecated in Java 9 and are now marked for removal. `valueOf` reuses cached small values and saves memory.'
    },
    mistake: {
      hi: 'Galti: wrapper objects ko `==` se compare karna. `Integer.valueOf(1000) == Integer.valueOf(1000)` false ho sakta hai — hamesha `.equals()` use karo.',
      en: 'Mistake: comparing wrapper objects with `==`. `Integer.valueOf(1000) == Integer.valueOf(1000)` may be false — always use `.equals()`.'
    },
    practice: {
      q: { hi: 'Do Integer objects compare karne ka sahi tareeka?', en: 'The correct way to compare two Integer objects?' },
      options: ['a == b', 'a.equals(b)', 'a = b', 'a.compare(b)'],
      answer: 1,
      explain: {
        hi: '`==` reference compare karta hai, value nahi. `.equals()` value compare karta hai.',
        en: '`==` compares references, not values. `.equals()` compares values.'
      }
    }
  },

  'record-class': {
    java: 16,
    title: { hi: 'Data class → `record`', en: 'Data class → `record`' },
    why: {
      hi: 'Sirf data rakhne wali class (private final fields + constructor + getters) ko Java 16 mein ek line ka `record` bana sakte ho. Compiler constructor, accessors, `equals()`, `hashCode()` aur `toString()` khud bana deta hai.',
      en: 'A pure data class (private final fields + constructor + getters) becomes a one-line `record` in Java 16. The compiler generates the constructor, accessors, `equals()`, `hashCode()` and `toString()`.'
    },
    mistake: {
      hi: 'DHYAAN DO (review): record aur purani class 100% same nahi hain. Record `equals/hashCode/toString` bhi bana deta hai, class `final` ho jaati hai, aur accessor ka naam field jaisa hota hai (`name()`, `getName()` nahi).',
      en: 'REVIEW: a record is not identical to the old class. It also generates `equals/hashCode/toString`, the class becomes `final`, and accessors are named like the field (`name()`, not `getName()`).'
    },
    practice: {
      q: { hi: '`record Point(int x, int y) {}` mein x ki value kaise padhoge?', en: 'How do you read x from `record Point(int x, int y) {}`?' },
      options: ['p.getX()', 'p.x()', 'p.x', 'Point.x'],
      answer: 1,
      explain: {
        hi: 'Record accessor ka naam component jaisa hota hai: `p.x()`. Field private hai, isliye `p.x` bahar se nahi chalega.',
        en: 'Record accessors are named after the component: `p.x()`. The field is private, so `p.x` does not work from outside.'
      }
    }
  }
};

/** Ek rule ki explanation, chuni hui language mein. lang: 'hi' (Hinglish) | 'en' */
function explain(id, lang) {
  const r = RULES[id];
  if (!r) return null;
  const L = lang === 'en' ? 'en' : 'hi';
  return {
    id,
    java: r.java,
    title: r.title[L],
    why: r.why[L],
    mistake: r.mistake[L],
    practice: {
      q: r.practice.q[L],
      options: r.practice.options,
      answer: r.practice.answer,
      explain: r.practice.explain[L]
    }
  };
}

module.exports = { RULES, explain };
