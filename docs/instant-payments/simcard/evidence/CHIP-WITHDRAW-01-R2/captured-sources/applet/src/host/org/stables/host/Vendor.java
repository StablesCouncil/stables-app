package org.stables.host;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.List;

/**
 * A vendor (issuer): an ordinary company with an ordinary computer (chip-balance-design.md 2). Its P-256 key lives
 * here, off card, and never goes on a card; it certifies chips, signs funding vouchers and registry snapshots. There
 * is no secret shared with any card: cards hold only the vendor's public key.
 */
public final class Vendor {
    public final String name;
    public final byte[] id;
    public final byte[] pub;
    private final KeyPair kp;

    public Vendor(String name) {
        try {
            this.name = name;
            KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
            g.initialize(new ECGenParameterSpec("secp256r1"));
            kp = g.generateKeyPair();
            ECPublicKey p = (ECPublicKey) kp.getPublic();
            pub = Hex.cat(new byte[] { 4 }, fixed(p.getW().getAffineX()), fixed(p.getW().getAffineY()));
            id = Hex.sub(Hex.sha256(Hex.ascii("vendor:" + name)), 0, 8);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static byte[] fixed(BigInteger v) {
        byte[] b = v.toByteArray();
        byte[] o = new byte[32];
        int n = Math.min(b.length, 32);
        System.arraycopy(b, b.length - n, o, 32 - n, n);
        return o;
    }

    /** vendorId (8) | public key (65): an accepted-vendor entry. */
    public byte[] entry() {
        return Hex.cat(id, pub);
    }

    public byte[] sign(byte[] body) {
        try {
            Signature s = Signature.getInstance("SHA256withECDSA", "SunEC");
            s.initSign(kp.getPrivate());
            s.update(body);
            return s.sign();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public byte[] certBody(byte[] chipPub) {
        return Hex.cat(Wire.header('Q'), id, chipPub);
    }

    /** The certificate signature this vendor gives a chip whose on-card key is chipPub. */
    public byte[] certify(byte[] chipPub) {
        return sign(certBody(chipPub));
    }

    public byte[] fundVoucher(byte[] chipId, byte[] token, long k, long totalF, long x) {
        byte[] body = Hex.cat(Wire.header('F'), chipId, token, Hex.u32(k), Hex.u64(totalF), Hex.u64(x));
        return Wire.signed(body, sign(body));
    }

    /** A registry snapshot header over the full vendor list and the full (append-only) revocation list. */
    public byte[] snapshotHeader(long version, long block, List<byte[]> vendors, List<byte[]> revocations) {
        byte[] vl = Hex.cat(vendors.toArray(new byte[0][]));
        byte[] rl = Hex.cat(revocations.toArray(new byte[0][]));
        byte[] body = Hex.cat(Wire.header('S'), id, Hex.u32(version), Hex.u32(block), new byte[] { (byte) vendors.size() },
            Hex.sha256(vl), Hex.u16(revocations.size()), Hex.sha256(rl));
        return Wire.signed(body, sign(body));
    }
}
