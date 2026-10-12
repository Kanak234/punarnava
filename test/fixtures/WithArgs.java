public class WithArgs {
    private int counter = 0;

    public static void main(String[] args) {
        System.out.println("args: " + args.length);
        for (String a : args) {
            System.out.println(a);
        }
    }
}
