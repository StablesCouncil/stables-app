package org.stables.card;

import javacard.framework.APDU;
import javacard.framework.Applet;
import javacard.framework.ISO7816;
import javacard.framework.ISOException;
import javacard.framework.JCSystem;
import javacard.framework.Util;
import javacard.security.AESKey;
import javacard.security.ECPrivateKey;
import javacard.security.ECPublicKey;
import javacard.security.KeyBuilder;
import javacard.security.KeyPair;
import javacard.security.MessageDigest;
import javacard.security.RandomData;
import javacard.security.Signature;

/**
 * Benchmark applet (test cards only; the production CAP leaves it out). APDU-driven, so the same host harness
 * (src/host/org/stables/host/Bench.java) runs it in jCardSim now and on a real card over PC/SC later.
 *
 * It uses the applet's own classes (Lx16, Persist) and its own keys, generated at install and never certified or
 * registered: the bench EC key signs only its fixed internal buffer, and the bench LX16 keys sign only the two fixed
 * digests below. Nothing here can sign data chosen by the host.
 *
 * Simulator timings are relative only and NOT representative of a card (Phase 0 decision 6).
 */
public class BenchApplet extends Applet {
    static final byte INS_SHA = (byte) 0x02;        // P1 size code (0..5 = 16..512 B), P2 iterations
    static final byte INS_AES = (byte) 0x04;        // P1 size code, P2 iterations
    static final byte INS_SIGN = (byte) 0x06;       // P1 0 = 32 B, 1 = 256 B; P2 iterations
    static final byte INS_VERIFY = (byte) 0x08;     // P1 as SIGN; P2 iterations
    static final byte INS_LX_KEYGEN = (byte) 0x0A;  // data key index (2): chunk digests (160) | pk (32)
    static final byte INS_LX_BLOCK = (byte) 0x0C;   // P1 digest selector 0/1, P2 block 0..33, data key index (2)
    static final byte INS_MEM = (byte) 0x0E;        // available memory and commit capacity
    static final byte INS_ECGEN = (byte) 0x10;      // P2 iterations of on-card P-256 key generation
    static final byte INS_COMMIT = (byte) 0x12;     // P1 size code (0..3 = 16, 64, 150, 250 B), P2 iterations
    static final byte INS_DIGESTS = (byte) 0x14;    // the two fixed bench digests (64)

    private static final short[] SIZES = { 16, 32, 64, 128, 256, 512 };
    private static final short[] TX_SIZES = { 16, 64, 150, 250 };
    // SHA-256 of these labels are the only digests the bench LX16 keys ever sign
    private static final byte[] LABEL_A = { (byte) 0x62, (byte) 0x65, (byte) 0x6E, (byte) 0x63, (byte) 0x68, (byte) 0x2D, (byte) 0x41 };
    private static final byte[] LABEL_B = { (byte) 0x62, (byte) 0x65, (byte) 0x6E, (byte) 0x63, (byte) 0x68, (byte) 0x2D, (byte) 0x42 };

    private final byte[] pScratch;
    private final byte[] tData;
    private final byte[] tOut;
    private final byte[] tW;
    private final byte[] tSig;
    private final MessageDigest md;
    private final Signature sig;
    private final RandomData rng;
    private final ECPrivateKey kPriv;
    private final ECPublicKey kPub;
    private final ECPrivateKey kGenPriv;
    private final ECPublicKey kGenPub;
    private final KeyPair kpGen;
    private final AESKey kSeed;
    private final javacardx.crypto.Cipher aes;
    private final Lx16 lx;

    public static void install(byte[] bArray, short bOffset, byte bLength) {
        new BenchApplet().register(bArray, (short) (bOffset + 1), bArray[bOffset]);
    }

    protected BenchApplet() {
        pScratch = new byte[256];
        tData = JCSystem.makeTransientByteArray((short) 512, JCSystem.CLEAR_ON_DESELECT);
        tOut = JCSystem.makeTransientByteArray((short) 256, JCSystem.CLEAR_ON_DESELECT);
        tW = JCSystem.makeTransientByteArray(Lx16.W_LEN, JCSystem.CLEAR_ON_DESELECT);
        tSig = JCSystem.makeTransientByteArray((short) 80, JCSystem.CLEAR_ON_DESELECT);
        md = MessageDigest.getInstance(MessageDigest.ALG_SHA_256, false);
        sig = Signature.getInstance(Signature.ALG_ECDSA_SHA_256, false);
        rng = RandomData.getInstance(RandomData.ALG_SECURE_RANDOM);
        aes = javacardx.crypto.Cipher.getInstance(javacardx.crypto.Cipher.ALG_AES_BLOCK_128_ECB_NOPAD, false);
        kPriv = (ECPrivateKey) KeyBuilder.buildKey(KeyBuilder.TYPE_EC_FP_PRIVATE, KeyBuilder.LENGTH_EC_FP_256, false);
        kPub = (ECPublicKey) KeyBuilder.buildKey(KeyBuilder.TYPE_EC_FP_PUBLIC, KeyBuilder.LENGTH_EC_FP_256, false);
        kGenPriv = (ECPrivateKey) KeyBuilder.buildKey(KeyBuilder.TYPE_EC_FP_PRIVATE, KeyBuilder.LENGTH_EC_FP_256, false);
        kGenPub = (ECPublicKey) KeyBuilder.buildKey(KeyBuilder.TYPE_EC_FP_PUBLIC, KeyBuilder.LENGTH_EC_FP_256, false);
        Ec.setP256(kPriv);
        Ec.setP256(kPub);
        Ec.setP256(kGenPriv);
        Ec.setP256(kGenPub);
        new KeyPair(kPub, kPriv).genKeyPair();
        kpGen = new KeyPair(kGenPub, kGenPriv);
        kSeed = (AESKey) KeyBuilder.buildKey(KeyBuilder.TYPE_AES, KeyBuilder.LENGTH_AES_256, false);
        rng.generateData(tData, (short) 0, (short) 32);
        kSeed.setKey(tData, (short) 0);
        Ram.fill(tData, (short) 0, (short) 32, (byte) 0);
        lx = new Lx16(tW);
    }

    public void process(APDU apdu) {
        if (selectingApplet()) {
            return;
        }
        byte[] buf = apdu.getBuffer();
        if (buf[ISO7816.OFFSET_CLA] != Proto.CLA) {
            ISOException.throwIt(ISO7816.SW_CLA_NOT_SUPPORTED);
        }
        short p1 = (short) (buf[ISO7816.OFFSET_P1] & 0xFF);
        short p2 = (short) (buf[ISO7816.OFFSET_P2] & 0xFF);
        short got = apdu.setIncomingAndReceive();
        short cdata = apdu.getOffsetCdata();
        short out = 0;
        switch (buf[ISO7816.OFFSET_INS]) {
            case INS_SHA: {
                short n = size(p1, SIZES);
                for (short i = 0; i < p2; i++) {
                    md.reset();
                    md.doFinal(tData, (short) 0, n, tOut, (short) 0);
                }
                out = 32;
                break;
            }
            case INS_AES: {
                short n = size(p1, SIZES);
                aes.init(kSeed, javacardx.crypto.Cipher.MODE_ENCRYPT);
                for (short i = 0; i < p2; i++) {
                    aes.doFinal(tData, (short) 0, n, tData, (short) 0);
                }
                out = 0;
                break;
            }
            case INS_SIGN: {
                short n = (p1 == 0) ? (short) 32 : (short) 256;
                sig.init(kPriv, Signature.MODE_SIGN);
                for (short i = 0; i < p2; i++) {
                    out = sig.sign(tData, (short) 0, n, tSig, (short) 0);
                }
                tOut[0] = (byte) out;
                out = 1;
                break;
            }
            case INS_VERIFY: {
                short n = (p1 == 0) ? (short) 32 : (short) 256;
                sig.init(kPriv, Signature.MODE_SIGN);
                short sl = sig.sign(tData, (short) 0, n, tSig, (short) 0);
                sig.init(kPub, Signature.MODE_VERIFY);
                boolean ok = true;
                for (short i = 0; i < p2; i++) {
                    ok = sig.verify(tData, (short) 0, n, tSig, (short) 0, sl) && ok;
                }
                tOut[0] = ok ? (byte) 1 : (byte) 0;
                out = 1;
                break;
            }
            case INS_LX_KEYGEN: {
                short ki = keyIndex(buf, cdata, got);
                lx.publicKey(kSeed, ki, tOut, (short) 0, Lx16.CD_LEN);
                out = (short) (Lx16.CD_LEN + 32);
                break;
            }
            case INS_LX_BLOCK: {
                short ki = keyIndex(buf, cdata, got);
                if (p2 >= (short) (2 * Lx16.BLOCKS)) {
                    ISOException.throwIt(ISO7816.SW_INCORRECT_P1P2);
                }
                digest(p1, tSig, (short) 0);
                lx.sigBlock(kSeed, ki, tSig, (short) 0, p2, tOut, (short) 0);
                out = Lx16.BLOCK_BYTES;
                break;
            }
            case INS_DIGESTS:
                digest((short) 0, tOut, (short) 0);
                digest((short) 1, tOut, (short) 32);
                out = 64;
                break;
            case INS_MEM: {
                Ram.setShort(tOut, (short) 0, JCSystem.getAvailableMemory(JCSystem.MEMORY_TYPE_PERSISTENT));
                Ram.setShort(tOut, (short) 2, JCSystem.getAvailableMemory(JCSystem.MEMORY_TYPE_TRANSIENT_RESET));
                Ram.setShort(tOut, (short) 4, JCSystem.getAvailableMemory(JCSystem.MEMORY_TYPE_TRANSIENT_DESELECT));
                Ram.setShort(tOut, (short) 6, JCSystem.getMaxCommitCapacity());
                out = 8;
                break;
            }
            case INS_ECGEN:
                for (short i = 0; i < p2; i++) {
                    kpGen.genKeyPair();
                }
                out = 0;
                break;
            case INS_COMMIT: {
                short n = size(p1, TX_SIZES);
                for (short i = 0; i < p2; i++) {
                    Persist.begin();
                    Persist.write(tData, (short) 0, pScratch, (short) 0, n);
                    Persist.commit();
                }
                out = 0;
                break;
            }
            default:
                ISOException.throwIt(ISO7816.SW_INS_NOT_SUPPORTED);
        }
        if (out > 0) {
            apdu.setOutgoing();
            apdu.setOutgoingLength(out);
            apdu.sendBytesLong(tOut, (short) 0, out);
        }
    }

    private static short size(short code, short[] table) {
        if (code >= (short) table.length) {
            ISOException.throwIt(ISO7816.SW_INCORRECT_P1P2);
        }
        return table[code];
    }

    private static short keyIndex(byte[] buf, short cdata, short got) {
        if (got != 2) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }
        short ki = Util.getShort(buf, cdata);
        if (ki < 0 || ki >= Proto.KEYS) {
            ISOException.throwIt(ISO7816.SW_WRONG_DATA);
        }
        return ki;
    }

    /** The fixed bench digest 0 or 1: SHA-256("bench-A") or SHA-256("bench-B"). */
    private void digest(short sel, byte[] tDst, short off) {
        if (sel > 1) {
            ISOException.throwIt(ISO7816.SW_INCORRECT_P1P2);
        }
        md.reset();
        md.doFinal(sel == 0 ? LABEL_A : LABEL_B, (short) 0, (short) LABEL_A.length, tDst, off);
    }
}
