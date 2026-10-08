package org.stables.host;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Small byte helpers for the host harnesses. */
public final class Hex {
    private Hex() { }

    public static byte[] h(String s) {
        s = s.replaceAll("\\s", "").replaceFirst("^0x", "");
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) {
            b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        }
        return b;
    }

    public static String x(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte v : b) {
            sb.append(String.format("%02X", v));
        }
        return sb.toString();
    }

    public static byte[] cat(byte[]... parts) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        for (byte[] p : parts) {
            o.write(p, 0, p.length);
        }
        return o.toByteArray();
    }

    public static byte[] sub(byte[] b, int off, int len) {
        byte[] r = new byte[len];
        System.arraycopy(b, off, r, 0, len);
        return r;
    }

    public static byte[] sha256(byte[]... parts) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            for (byte[] p : parts) {
                md.update(p);
            }
            return md.digest();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.US_ASCII);
    }

    public static byte[] u64(long v) {
        byte[] b = new byte[8];
        for (int i = 7; i >= 0; i--) {
            b[i] = (byte) v;
            v >>>= 8;
        }
        return b;
    }

    public static byte[] u32(long v) {
        return new byte[] { (byte) (v >> 24), (byte) (v >> 16), (byte) (v >> 8), (byte) v };
    }

    public static byte[] u16(int v) {
        return new byte[] { (byte) (v >> 8), (byte) v };
    }

    public static long u64(byte[] b, int off) {
        long v = 0;
        for (int i = 0; i < 8; i++) {
            v = (v << 8) | (b[off + i] & 0xFF);
        }
        return v;
    }

    public static long u32(byte[] b, int off) {
        return ((long) (b[off] & 0xFF) << 24) | ((b[off + 1] & 0xFF) << 16) | ((b[off + 2] & 0xFF) << 8) | (b[off + 3] & 0xFF);
    }

    public static int u16(byte[] b, int off) {
        return ((b[off] & 0xFF) << 8) | (b[off + 1] & 0xFF);
    }

    /** USDw-style amounts: 8 decimals. */
    public static long atoms(double units) {
        return BigInteger.valueOf(Math.round(units * 100)).multiply(BigInteger.valueOf(1000000)).longValue();
    }

    public static String units(long atoms) {
        return String.format("%.2f", atoms / 1e8);
    }
}
