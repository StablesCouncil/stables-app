package org.stables.host;

import java.util.ArrayList;
import java.util.List;

/** A minimal test recorder: named checks, pass or fail, and a Markdown table. No framework dependency. */
public final class T {
    public static final class Row {
        public final String group, name, detail;
        public final boolean pass;

        Row(String group, String name, boolean pass, String detail) {
            this.group = group;
            this.name = name;
            this.pass = pass;
            this.detail = detail;
        }
    }

    public interface Body {
        void run() throws Exception;
    }

    public final List<Row> rows = new ArrayList<Row>();
    private final String title;
    /** Only groups matching this regular expression run (null = all); used to run the new cases on the pre-fix build. */
    private final java.util.regex.Pattern only;

    public T(String title) {
        this(title, null);
    }

    public T(String title, String onlyGroups) {
        this.title = title;
        this.only = onlyGroups == null || onlyGroups.isEmpty() ? null : java.util.regex.Pattern.compile(onlyGroups);
    }

    private boolean skip(String group) {
        return only != null && !only.matcher(group).matches();
    }

    public void check(String group, String name, boolean ok, String detail) {
        if (skip(group)) {
            return;
        }
        rows.add(new Row(group, name, ok, detail == null ? "" : detail));
        if (!ok) {
            System.out.println("  FAIL " + group + " / " + name + " : " + detail);
        }
    }

    /** Runs a body; any exception is a failure with its message. */
    public void test(String group, String name, Body b) {
        if (skip(group)) {
            return;
        }
        try {
            b.run();
            check(group, name, true, "");
        } catch (Throwable e) {
            check(group, name, false, e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    public static void eq(Object want, Object got, String what) {
        if (want == null ? got != null : !want.equals(got)) {
            throw new AssertionError(what + ": want " + want + ", got " + got);
        }
    }

    public static void yes(boolean b, String what) {
        if (!b) {
            throw new AssertionError(what);
        }
    }

    /** Expects a refusal with the given status word. */
    public static void refused(int sw, Runnable r, String what) {
        try {
            r.run();
        } catch (Card.Err e) {
            if (e.sw != sw) {
                throw new AssertionError(what + ": want SW " + Integer.toHexString(sw) + ", got " + Integer.toHexString(e.sw));
            }
            return;
        }
        throw new AssertionError(what + ": was accepted");
    }

    public int passed() {
        int n = 0;
        for (Row r : rows) {
            if (r.pass) {
                n++;
            }
        }
        return n;
    }

    public int failed() {
        return rows.size() - passed();
    }

    public String markdown() {
        StringBuilder sb = new StringBuilder();
        sb.append("| # | Group | Test | Result | Detail |\n|---|---|---|---|---|\n");
        int i = 1;
        for (Row r : rows) {
            sb.append("| ").append(i++).append(" | ").append(r.group).append(" | ").append(r.name).append(" | ")
                .append(r.pass ? "pass" : "**FAIL**").append(" | ").append(r.detail.replace("|", "/")).append(" |\n");
        }
        return sb.toString();
    }

    public String summary() {
        return title + ": " + passed() + " passed, " + failed() + " failed, " + rows.size() + " total";
    }
}
