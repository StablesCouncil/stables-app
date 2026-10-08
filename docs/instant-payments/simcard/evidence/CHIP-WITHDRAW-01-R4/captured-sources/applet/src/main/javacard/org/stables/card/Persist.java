package org.stables.card;

import javacard.framework.JCSystem;
import javacard.framework.Util;

/**
 * The ONLY way the applet changes persistent memory (card build).
 *
 * Every persistent write in the applet goes through this class, so the tear harness can replace it (the test build
 * compiles src/tear/org/stables/card/Persist.java instead) with a version that stops at any write point and rolls
 * back an unfinished transaction as a card would. The source scan (tools/scan-applet.mjs) checks that nothing else
 * writes a persistent array.
 *
 * Card semantics relied on (Java Card 3.0.4 API): a single byte write and Util.arrayCopy to a persistent array are
 * atomic; inside beginTransaction / commitTransaction every write here is journaled by the card and rolled back on a
 * tear. fill and setShort are only used inside a transaction.
 */
final class Persist {
    private Persist() { }

    static void begin() {
        JCSystem.beginTransaction();
    }

    static void commit() {
        JCSystem.commitTransaction();
    }

    /** Atomic copy into a persistent array (participates in an open transaction). */
    static void write(byte[] src, short srcOff, byte[] dst, short dstOff, short len) {
        Util.arrayCopy(src, srcOff, dst, dstOff, len);
    }

    /** Atomic single byte write. */
    static void setByte(byte[] dst, short off, byte v) {
        dst[off] = v;
    }

    /** Two byte write: inside a transaction only. */
    static void setShort(byte[] dst, short off, short v) {
        Util.setShort(dst, off, v);
    }

    /**
     * Seam for the tear harness, called just before a PIN or PUK comparison. Does nothing on the card. The test build
     * checks that the try was already spent durably (counter = triesBefore - 1, no transaction open), so a tear can
     * never undo a try after the secret was compared (the classic tearing attack on PIN checks).
     */
    static void secretCompare(byte triesBefore, byte[] state, short off) {
    }

    /** Fill: inside a transaction only (Util.arrayFillNonAtomic would bypass the transaction). */
    static void fill(byte[] dst, short off, short len, byte v) {
        short end = (short) (off + len);
        for (short i = off; i < end; i++) {
            dst[i] = v;
        }
    }
}
