import java.util.Scanner;

public class Calculator {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.print("Enter first number: ");
        int a = sc.nextInt();
        System.out.print("Enter second number: ");
        int b = sc.nextInt();
        sc.nextLine();
        System.out.print("Your name: ");
        String name = sc.nextLine();
        System.out.println("Hi " + name + ", sum = " + (a + b));
        sc.close();
    }
}
