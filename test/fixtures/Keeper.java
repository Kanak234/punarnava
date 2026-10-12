package demo;

import java.util.List;
import java.util.ArrayList;

public class Keeper {
    private final List<String> items;

    public Keeper(List<String> items) {
        this.items = items;
    }

    public static void main(String[] args) {
        List<String> l = new ArrayList<>();
        l.add("x");
        Keeper k = new Keeper(l);
        System.out.println(k.items.size());
    }
}
