public class TextValues {
    public static void main(String[] args) {
        String a = "line1\n" + "line2\n" + "line3";
        String b = "x\n" +
                   "  indented\n" +
                   "\n" +
                   "after blank\n";
        String c = "say \"hi\"\n" + "tab\there\n" + "back\\slash";
        String d = "ends with quote\n" + "\"quoted\"";
        String e = "{\n" + "  \"name\": \"Kanak\",\n" + "  \"age\": 20\n" + "}";
        for (String s : new String[] {a, b, c, d, e}) {
            System.out.println("[" + s.replace("\n", "\\n").replace("\t", "\\t") + "] len=" + s.length());
        }
    }
}
