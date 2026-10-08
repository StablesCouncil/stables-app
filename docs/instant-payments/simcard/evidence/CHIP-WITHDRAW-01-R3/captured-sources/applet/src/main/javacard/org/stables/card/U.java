package org.stables.card;

/**
 * Unsigned big-endian arithmetic on byte arrays (amounts are u64 atoms, counters u32). Java Card has no long, and the
 * applet does not rely on the optional int type, so everything is done with short arithmetic. Destinations are
 * transient work buffers (checked by Ram.check in the test build); results reach persistent memory only via Persist.
 */
final class U {
    private U() { }

    /** Compares a and b (len bytes, unsigned big endian): -1, 0 or 1. */
    static byte cmp(byte[] a, short aOff, byte[] b, short bOff, short len) {
        for (short i = 0; i < len; i++) {
            short x = (short) (a[(short) (aOff + i)] & 0xFF);
            short y = (short) (b[(short) (bOff + i)] & 0xFF);
            if (x != y) {
                return (x < y) ? (byte) -1 : (byte) 1;
            }
        }
        return 0;
    }

    /** tOut = a + b; returns the carry out (1 means overflow). tOut may alias a or b. */
    static byte add(byte[] a, short aOff, byte[] b, short bOff, byte[] tOut, short oOff, short len) {
        Ram.check(tOut);
        short c = 0;
        for (short i = (short) (len - 1); i >= 0; i--) {
            c = (short) ((short) (a[(short) (aOff + i)] & 0xFF) + (short) (b[(short) (bOff + i)] & 0xFF) + c);
            tOut[(short) (oOff + i)] = (byte) c;
            c = (short) ((short) (c >> 8) & 1);
        }
        return (byte) c;
    }

    /** tOut = a - b; returns the borrow (1 means a < b). tOut may alias a or b. */
    static byte sub(byte[] a, short aOff, byte[] b, short bOff, byte[] tOut, short oOff, short len) {
        Ram.check(tOut);
        short br = 0;
        for (short i = (short) (len - 1); i >= 0; i--) {
            short d = (short) ((short) (a[(short) (aOff + i)] & 0xFF) - (short) (b[(short) (bOff + i)] & 0xFF) - br);
            if (d < 0) {
                d = (short) (d + 256);
                br = 1;
            } else {
                br = 0;
            }
            tOut[(short) (oOff + i)] = (byte) d;
        }
        return (byte) br;
    }

    /** tOut = a + 1 over len bytes; returns the carry out. */
    static byte inc(byte[] a, short aOff, byte[] tOut, short oOff, short len) {
        Ram.check(tOut);
        short c = 1;
        for (short i = (short) (len - 1); i >= 0; i--) {
            c = (short) ((short) (a[(short) (aOff + i)] & 0xFF) + c);
            tOut[(short) (oOff + i)] = (byte) c;
            c = (short) ((short) (c >> 8) & 1);
        }
        return (byte) c;
    }

    static boolean isZero(byte[] a, short off, short len) {
        for (short i = 0; i < len; i++) {
            if (a[(short) (off + i)] != 0) {
                return false;
            }
        }
        return true;
    }

    /** Writes the unsigned 16-bit value v as a 4-byte big-endian number. */
    static void u16to32(short v, byte[] tOut, short off) {
        Ram.check(tOut);
        tOut[off] = 0;
        tOut[(short) (off + 1)] = 0;
        tOut[(short) (off + 2)] = (byte) (v >> 8);
        tOut[(short) (off + 3)] = (byte) v;
    }

    /** True when a 4-byte big-endian number fits in 16 bits (then u32lo gives it). */
    static boolean fits16(byte[] a, short off) {
        return a[off] == 0 && a[(short) (off + 1)] == 0;
    }

    /** Low 16 bits of a 4-byte big-endian number, as an unsigned value held in a short. */
    static short u32lo(byte[] a, short off) {
        return (short) (((short) (a[(short) (off + 2)] & 0xFF) << 8) | (short) (a[(short) (off + 3)] & 0xFF));
    }

    /** Unsigned comparison of two 16-bit values held in shorts: a < b. */
    static boolean ult(short a, short b) {
        return (short) (a ^ (short) 0x8000) < (short) (b ^ (short) 0x8000);
    }

    /** Constant-time equality (for PINs). */
    static boolean ctEquals(byte[] a, short aOff, byte[] b, short bOff, short len) {
        short diff = 0;
        for (short i = 0; i < len; i++) {
            diff = (short) (diff | (short) ((a[(short) (aOff + i)] ^ b[(short) (bOff + i)]) & 0xFF));
        }
        return diff == 0;
    }
}
