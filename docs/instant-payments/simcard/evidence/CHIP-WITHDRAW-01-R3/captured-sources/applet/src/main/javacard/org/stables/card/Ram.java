package org.stables.card;

import javacard.framework.Util;

/**
 * Writes to transient memory and the APDU buffer (card build). The test build replaces this class with one that
 * checks, at run time, that the destination really is transient; together with Persist that proves every write the
 * applet makes is either instrumented (persistent) or lost at power-off (transient).
 */
final class Ram {
    private Ram() { }

    /** Called by helpers that write into an array passed to them. No-op on the card. */
    static void check(byte[] a) {
    }

    static void copy(byte[] src, short srcOff, byte[] dst, short dstOff, short len) {
        Util.arrayCopyNonAtomic(src, srcOff, dst, dstOff, len);
    }

    static void fill(byte[] dst, short off, short len, byte v) {
        Util.arrayFillNonAtomic(dst, off, len, v);
    }

    static void setShort(byte[] dst, short off, short v) {
        Util.setShort(dst, off, v);
    }
}
