package org.stables.host;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

/**
 * Reflection bridge to the instrumented persistence layer (src/tear/org/stables/card/Persist.java). With the shipped
 * build on the class path (build/sim-card) the fields do not exist and every call is a no-op, so the functional tests
 * run unchanged against the code as it goes into the CAP.
 */
public final class TearControl {
    private TearControl() { }

    private static final Class<?> P;
    private static final boolean AVAILABLE;

    static {
        Class<?> c = null;
        boolean ok = false;
        try {
            c = Class.forName("org.stables.card.Persist");
            c.getField("tearAt");
            ok = true;
        } catch (Throwable t) {
            ok = false;
        }
        P = c;
        AVAILABLE = ok;
    }

    public static boolean available() {
        return AVAILABLE;
    }

    private static Field f(String n) throws Exception {
        return P.getField(n);
    }

    public static void reset() {
        call("reset");
    }

    public static void endOfApdu() {
        call("endOfApdu");
    }

    private static void call(String m) {
        if (!AVAILABLE) {
            return;
        }
        try {
            Method x = P.getMethod(m);
            x.invoke(null);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public static boolean torn() {
        return AVAILABLE && (Boolean) get("torn");
    }

    public static void clearTorn() {
        set("torn", Boolean.FALSE);
    }

    public static void tearAt(int k) {
        set("tearAt", k);
    }

    public static int writes() {
        return AVAILABLE ? (Integer) get("writes") : -1;
    }

    public static void recording(boolean on) {
        set("recording", on);
    }

    public static void step(String s) {
        set("step", s);
    }

    public static int maxTxBytes() {
        return AVAILABLE ? (Integer) get("maxTxBytes") : -1;
    }

    public static String maxTxSite() {
        return AVAILABLE ? (String) get("maxTxSite") : "";
    }

    @SuppressWarnings("unchecked")
    public static List<String> violations() {
        return AVAILABLE ? (List<String>) get("violations") : new ArrayList<String>();
    }

    /** The recorded write points: {index, kind, site, step, bytes, inTx}. */
    public static List<Object[]> points() {
        List<Object[]> out = new ArrayList<Object[]>();
        if (!AVAILABLE) {
            return out;
        }
        try {
            for (Object p : (List<?>) get("points")) {
                Class<?> pc = p.getClass();
                out.add(new Object[] { pc.getField("index").get(p), pc.getField("kind").get(p), pc.getField("site").get(p),
                    pc.getField("step").get(p), pc.getField("bytes").get(p), pc.getField("inTx").get(p) });
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return out;
    }

    private static Object get(String n) {
        try {
            return f(n).get(null);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static void set(String n, Object v) {
        if (!AVAILABLE) {
            return;
        }
        try {
            f(n).set(null, v);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
