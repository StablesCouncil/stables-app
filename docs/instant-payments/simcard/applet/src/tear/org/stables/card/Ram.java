package org.stables.card;

import javacard.framework.APDU;
import javacard.framework.JCSystem;
import javacard.framework.Util;

/**
 * TEST BUILD ONLY: transient writes, checked. Every write the applet makes that is not through Persist must land in
 * transient memory or the APDU buffer; a persistent destination here is recorded as a violation (it would be a write
 * the tear model cannot see).
 */
final class Ram {
    private Ram() { }

    static void check(byte[] a) {
        if (JCSystem.isTransient(a) == JCSystem.NOT_A_TRANSIENT_OBJECT && !isApduBuffer(a)) {
            Persist.violations.add("Ram write to a persistent array at " + new Throwable().getStackTrace()[2]);
        }
    }

    private static boolean isApduBuffer(byte[] a) {
        try {
            return a == APDU.getCurrentAPDUBuffer();
        } catch (Throwable t) {
            return false;
        }
    }

    static void copy(byte[] src, short srcOff, byte[] dst, short dstOff, short len) {
        check(dst);
        Util.arrayCopyNonAtomic(src, srcOff, dst, dstOff, len);
    }

    static void fill(byte[] dst, short off, short len, byte v) {
        check(dst);
        Util.arrayFillNonAtomic(dst, off, len, v);
    }

    static void setShort(byte[] dst, short off, short v) {
        check(dst);
        Util.setShort(dst, off, v);
    }
}
