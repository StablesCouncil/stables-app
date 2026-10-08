package org.stables.host;

import java.util.Arrays;

/**
 * A Java port of the LX16 reference verifier in measure/ots.mjs (lxVerify with n = 16, chunks = 5, positions = 255).
 * Used by the harnesses to check card-made signatures inside the JVM; the authoritative cross-check runs the real
 * ots.mjs and the KISS scripts (crosscheck/lx16-crosscheck.mjs).
 */
public final class Lx16Ref {
    private Lx16Ref() { }

    public static final int N = 16, P = 255, K = 5, B = 51;

    static int beBit(byte[] buf, int off, int len, int i) {
        return (buf[off + len - 1 - (i >> 3)] >> (i & 7)) & 1;
    }

    /** The bit of digest d that position i signs. */
    public static int digestBit(byte[] d, int i) {
        int half = i < 128 ? 16 : 0;
        return beBit(d, half, 16, i % 128);
    }

    public static byte[][] chunkDigests(byte[] R, byte[] C) {
        byte[][] t = new byte[P][];
        for (int i = 0; i < P; i++) {
            byte[] r = Hex.sub(R, i * N, N), c = Hex.sub(C, i * N, N);
            byte[] y = Hex.sha256(Hex.sub(Hex.sha256(r), 0, N));
            byte[] z = Hex.sha256(c);
            byte[] ti = new byte[32];
            for (int k = 0; k < 32; k++) {
                ti[k] = (byte) (y[k] ^ z[k]);
            }
            t[i] = ti;
        }
        byte[][] cds = new byte[K][];
        for (int c = 0; c < K; c++) {
            byte[] acc = new byte[] { 1 };
            for (int i = c * B; i < c * B + B; i++) {
                acc = Hex.cat(acc, t[i]);
            }
            cds[c] = Hex.sha256(acc);
        }
        return cds;
    }

    /** Labels match d, and the chunk digests hash to pk. */
    public static boolean verify(byte[] pk, byte[] d, byte[] R, byte[] C) {
        if (R.length != P * N || C.length != P * N) {
            return false;
        }
        for (int i = 0; i < P; i++) {
            if (beBit(R, i * N, N, i % 128) != digestBit(d, i)) {
                return false;
            }
        }
        return Arrays.equals(pkOf(chunkDigests(R, C)), pk);
    }

    public static byte[] pkOf(byte[][] cds) {
        return Hex.sha256(new byte[] { 1 }, Hex.cat(cds));
    }

    /** d = SHA-256(0x44 | chip id | message) (kiss/balance/chip_account.kiss, D1). */
    public static byte[] voucherDigest(byte[] chipId, byte[] msg) {
        return Hex.sha256(new byte[] { 0x44 }, chipId, msg);
    }
}
