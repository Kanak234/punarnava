import java.util.ArrayList;
import java.util.HashMap;

public class Grades {
    static String grade(int marks) {
        String g;
        switch (marks / 10) {
            case 10:
            case 9:
                g = "A";
                break;
            case 8:
                g = "B";
                break;
            case 7:
                g = "C";
                break;
            default:
                g = "F";
        }
        return g;
    }

    static int points(String g) {
        switch (g) {
            case "A":
                return 4;
            case "B":
                return 3;
            default:
                return 0;
        }
    }

    static void describe(int day) {
        switch (day) {
            case 1:
                System.out.println("Monday");
                break;
            case 2:
                System.out.println("Tuesday");
                System.out.println("(gym day)");
                break;
            default:
                System.out.println("Other day");
                break;
        }
    }

    public static void main(String[] args) {
        ArrayList<Integer> marks = new ArrayList<Integer>();
        marks.add(95);
        marks.add(81);
        marks.add(42);
        HashMap<String, Integer> count = new HashMap<String, Integer>();
        for (int m : marks) {
            String g = grade(m);
            count.put(g, count.getOrDefault(g, 0) + points(g));
            System.out.println(m + " -> " + g);
        }
        describe(1);
        describe(2);
        describe(5);
        Integer boxed = new Integer(42);
        System.out.println("boxed = " + boxed + ", total points = " + count.values().stream().mapToInt(x -> x).sum());
    }
}
