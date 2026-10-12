public class Shapes {
    static class Student {
        private final String name;
        private final int age;

        Student(String name, int age) {
            this.name = name;
            this.age = age;
        }

        public String name() { return name; }
        public int age() { return age; }
    }

    static String describe(Object o) {
        if (o instanceof String) {
            String s = (String) o;
            return "String of length " + s.length();
        }
        if (o instanceof Integer) {
            Integer n = (Integer) o;
            return "Integer doubled " + (n * 2);
        }
        return "Something else";
    }

    public static void main(String[] args) {
        String menu = "1. Start\n"
                    + "2. Settings\n"
                    + "3. Exit";
        System.out.println(menu);
        String html = "<html>\n" +
                      "  <body>\"Hi\"</body>\n" +
                      "</html>\n";
        System.out.print(html);
        System.out.println(describe("hello"));
        System.out.println(describe(21));
        System.out.println(describe(3.5));
        Student st = new Student("Kanak", 20);
        System.out.println(st.name() + " " + st.age());
        char[] letters = {'J', 'a', 'v', 'a'};
        System.out.println(letters);
        // public static void main(String[] args) <- comment ke andar, badalna nahi
        String trap = "System.out.println(\"not code\")";
        System.out.println(trap);
    }
}
