package org.stables.host;

import java.math.BigInteger;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;

/**
 * The host's own reading of the chip messages (independent of the applet's Proto class): offsets, parsing, and an
 * off-card ECDSA P-256 verifier (the JDK's SunEC provider, a different implementation from jCardSim's Bouncy Castle).
 */
public final class Wire {
    private Wire() { }

    public static final byte[] TAG = Hex.ascii("STBC");
    public static final int VER = 1;
    public static final int HDR = 6;
    public static final int CERT_VID = 6, CERT_PUB = 14, CERT_BODY = 79;
    public static final int H_RID = 6, H_M = 38, H_CAP = 42, H_TOKEN = 50, H_SNAP = 82, H_FLAGS = 86, H_BODY = 87;
    public static final int X_PID = 6, X_N = 38, X_RID = 42, X_M = 74, X_A = 78, X_TOKEN = 86, X_K = 118, X_F = 122,
        X_SNAP = 130, X_BAL = 134, X_BODY = 142;
    public static final int A_RID = 6, A_PID = 38, A_N = 70, A_M = 74, A_A = 78, A_TOKEN = 86, A_EXTRA = 118,
        A_SECRET = 119, A_BODY = 119, A_BODY_SWAP = 151;
    public static final int F_BODY = 90;
    public static final int S_BODY = 89;
    public static final int V_MSG = 52;

    public static int bodyLen(byte[] wire) {
        switch (wire[5]) {
            case 'Q': return CERT_BODY;
            case 'H': return H_BODY;
            case 'T': return X_BODY;
            case 'A': return wire[A_EXTRA] == 1 ? A_BODY_SWAP : A_BODY;
            case 'C': return A_BODY;
            case 'F': return F_BODY;
            case 'S': return S_BODY;
            default: throw new IllegalArgumentException("unknown type " + wire[5]);
        }
    }

    public static byte[] body(byte[] wire) {
        return Hex.sub(wire, 0, bodyLen(wire));
    }

    public static byte[] sig(byte[] wire) {
        int bl = bodyLen(wire);
        return Hex.sub(wire, bl + 1, wire[bl] & 0xFF);
    }

    public static byte[] header(char type) {
        return Hex.cat(TAG, new byte[] { (byte) VER, (byte) type });
    }

    public static byte[] signed(byte[] body, byte[] der) {
        return Hex.cat(body, new byte[] { (byte) der.length }, der);
    }

    public static byte[] chipId(byte[] pub65) {
        return Hex.sha256(pub65);
    }

    // ----------------------------------------------------------------- off-card P-256
    private static ECParameterSpec p256;

    static synchronized ECParameterSpec p256() throws Exception {
        if (p256 == null) {
            AlgorithmParameters ap = AlgorithmParameters.getInstance("EC");
            ap.init(new ECGenParameterSpec("secp256r1"));
            p256 = ap.getParameterSpec(ECParameterSpec.class);
        }
        return p256;
    }

    public static PublicKey pubKey(byte[] pub65) throws Exception {
        if (pub65.length != 65 || pub65[0] != 4) {
            throw new IllegalArgumentException("not an uncompressed P-256 point");
        }
        ECPoint w = new ECPoint(new BigInteger(1, Hex.sub(pub65, 1, 32)), new BigInteger(1, Hex.sub(pub65, 33, 32)));
        return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(w, p256()));
    }

    /** Standard ECDSA P-256 / SHA-256 verification of a DER signature (SunEC). */
    public static boolean verify(byte[] pub65, byte[] data, byte[] der) {
        try {
            Signature s = Signature.getInstance("SHA256withECDSA", "SunEC");
            s.initVerify(pubKey(pub65));
            s.update(data);
            return s.verify(der);
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean verifyWire(byte[] pub65, byte[] wire) {
        return verify(pub65, body(wire), sig(wire));
    }

    public static long amount(byte[] wire, int off) {
        return Hex.u64(wire, off);
    }
}
