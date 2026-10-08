package org.stables.card;

import java.util.ArrayList;
import java.util.Arrays;

import javacard.framework.APDU;
import javacard.framework.JCSystem;

/**
 * TEST BUILD ONLY (never in a CAP): the instrumented persistence layer for the tear harness.
 *
 * jCardSim neither rolls back a transaction nor loses power (VERIFIED, jCardSim 3.0.6.0 source: begin/commit only
 * count depth; reset() clears only CLEAR_ON_RESET memory). This class supplies both, for the writes the applet makes:
 *  - every call is a numbered "write point"; the harness can cut the power just before point k (tearAt);
 *  - writes inside a transaction are journaled and rolled back on a tear, as the card's commit buffer would;
 *  - a write outside a transaction is one atomic step (Util.arrayCopy and single-byte writes are atomic on a card);
 *  - it checks that every destination is persistent (and Ram checks that every other write is transient), so no
 *    persistent write escapes the model.
 * Limits (stated in docs/simulator-status.md): it models the Java Card transaction semantics as specified, not a
 * card's actual EEPROM behaviour; key objects (setW, genKeyPair, setKey) are written inside the JC key classes and
 * are not journaled (they hold no value state: device key and seed at install, scratch verification keys per tap).
 */
public final class Persist {
    private Persist() { }

    /** The simulated power cut. An Error, so applet code (which only catches card exceptions) cannot swallow it. */
    public static final class Tear extends Error {
        public Tear(String m) {
            super(m);
        }
    }

    /** One write point, as recorded in an enumeration run. */
    public static final class Point {
        public final int index;
        public final String kind;
        public final String site;
        public final String step;
        public final int bytes;
        public final boolean inTx;

        Point(int index, String kind, String site, String step, int bytes, boolean inTx) {
            this.index = index;
            this.kind = kind;
            this.site = site;
            this.step = step;
            this.bytes = bytes;
            this.inTx = inTx;
        }
    }

    public static int writes;
    public static int tearAt = -1;
    public static boolean torn;
    public static boolean recording;
    public static String step = "";
    public static final ArrayList<Point> points = new ArrayList<Point>();
    public static final ArrayList<String> violations = new ArrayList<String>();
    public static int maxTxBytes;
    public static String maxTxSite = "";

    private static boolean inTx;
    private static int txBytes;
    private static final ArrayList<Object[]> journal = new ArrayList<Object[]>();

    /** Clears the counters and the tear plan (not the violation log). */
    public static void reset() {
        writes = 0;
        tearAt = -1;
        torn = false;
        points.clear();
        inTx = false;
        txBytes = 0;
        journal.clear();
    }

    public static boolean inTransaction() {
        return inTx;
    }

    /** Called by the harness after every APDU: a card aborts a transaction the applet left open. */
    public static void endOfApdu() {
        if (inTx) {
            violations.add("transaction left open at the end of an APDU (" + step + ")");
            rollback();
        }
    }

    private static String site() {
        StackTraceElement[] st = new Throwable().getStackTrace();
        StringBuilder sb = new StringBuilder();
        int n = 0;
        for (StackTraceElement e : st) {
            if (e.getClassName().equals(Persist.class.getName())) {
                continue;
            }
            if (!e.getClassName().startsWith("org.stables.card")) {
                break;
            }
            if (n++ > 0) {
                sb.append(" < ");
            }
            sb.append(e.getMethodName()).append(':').append(e.getLineNumber());
            if (n == 2) {
                break;
            }
        }
        return sb.toString();
    }

    private static boolean isApduBuffer(byte[] a) {
        try {
            return a == APDU.getCurrentAPDUBuffer();
        } catch (Throwable t) {
            return false;
        }
    }

    private static void point(String kind, byte[] dst, int len) {
        if (torn) {
            throw new Tear("power is off");
        }
        if (dst != null && (JCSystem.isTransient(dst) != JCSystem.NOT_A_TRANSIENT_OBJECT || isApduBuffer(dst))) {
            violations.add("Persist." + kind + " on a transient array at " + site());
        }
        if (writes == tearAt) {
            torn = true;
            rollback();
            throw new Tear("power cut before write point " + writes + " (" + kind + " at " + site() + ")");
        }
        if (recording) {
            points.add(new Point(writes, kind, site(), step, len, inTx));
        }
        writes++;
    }

    private static void journal(byte[] dst, int off, int len) {
        journal.add(new Object[] { dst, Integer.valueOf(off), Arrays.copyOfRange(dst, off, off + len) });
        txBytes += len;
        if (txBytes > maxTxBytes) {
            maxTxBytes = txBytes;
            maxTxSite = site();
        }
    }

    private static void rollback() {
        for (int i = journal.size() - 1; i >= 0; i--) {
            Object[] j = journal.get(i);
            byte[] before = (byte[]) j[2];
            System.arraycopy(before, 0, (byte[]) j[0], ((Integer) j[1]).intValue(), before.length);
        }
        journal.clear();
        inTx = false;
        txBytes = 0;
    }

    static void begin() {
        point("begin", null, 0);
        if (inTx) {
            violations.add("nested transaction at " + site());
        }
        inTx = true;
        txBytes = 0;
        journal.clear();
    }

    static void commit() {
        point("commit", null, 0);
        if (!inTx) {
            violations.add("commit without a transaction at " + site());
        }
        inTx = false;
        journal.clear();
        txBytes = 0;
    }

    static void write(byte[] src, short srcOff, byte[] dst, short dstOff, short len) {
        point("write", dst, len);
        if (inTx) {
            journal(dst, dstOff, len);
        }
        System.arraycopy(src, srcOff, dst, dstOff, len);
    }

    static void setByte(byte[] dst, short off, byte v) {
        point("setByte", dst, 1);
        if (inTx) {
            journal(dst, off, 1);
        }
        dst[off] = v;
    }

    static void setShort(byte[] dst, short off, short v) {
        point("setShort", dst, 2);
        if (!inTx) {
            violations.add("setShort outside a transaction at " + site());
        }
        journal(dst, off, 2);
        dst[off] = (byte) (v >> 8);
        dst[off + 1] = (byte) v;
    }

    /** The try must already be spent, durably, when the secret is compared. */
    static void secretCompare(byte triesBefore, byte[] state, short off) {
        if (inTx || state[off] != (byte) (triesBefore - 1)) {
            violations.add("secret compared before a try was durably spent (tries before " + triesBefore + ", now "
                + state[off] + (inTx ? ", transaction open" : "") + ") at " + site());
        }
    }

    static void fill(byte[] dst, short off, short len, byte v) {
        point("fill", dst, len);
        if (!inTx) {
            violations.add("fill outside a transaction at " + site());
        }
        journal(dst, off, len);
        Arrays.fill(dst, off, off + len, v);
    }
}
