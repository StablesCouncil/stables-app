package org.stables.card;

import javacard.security.AESKey;
import javacard.security.MessageDigest;
import javacardx.crypto.Cipher;

/**
 * LX16: labelled-XOR Lamport over SHA-256 with 16-byte elements (payment-account-design.md 1.3; reference
 * implementation measure/ots.mjs; chain verifiers kiss/lx16_helper_K5_P255.kiss and kiss/balance/d1_core_runscript.kiss).
 *
 * Parameters (as measured on chain): n = 16 bytes, 255 positions, 5 chunks of 51.
 *   secret s(i, p, b) = AES-256_k("LX16" | i (4) | p (2) | b (1) | 0 (5)), then big-endian bit (p mod 128) forced to b
 *   h(s) = first 16 bytes of SHA-256(s)
 *   T_p = SHA-256(h(s_p0)) XOR SHA-256(h(s_p1))
 *   chunk_c = SHA-256(0x01 | T_51c | ... | T_51c+50),  pk = SHA-256(0x01 | chunk_0 | ... | chunk_4)
 *   signature on digest d: R_p = s(p, bit), C_p = h(s(p, 1 - bit)), where bit is big-endian bit (p mod 128) of
 *   d[16..32) for p < 128 and of d[0..16) for p >= 128.
 * Only SHA-256 and AES are used (the J3R180 has no SHA-3). The secrets never leave the chip except as the revealed
 * half of one signature, and the applet only ever signs a digest it stored together with the key index in one
 * transaction (StablesApplet.defund).
 *
 * The signature (8,160 bytes) is larger than transient memory, so it streams out in 34 blocks of 240 bytes:
 * blocks 0..16 are R (15 positions each), blocks 17..33 are C.
 */
final class Lx16 {
    static final short N = 16;
    static final short POS = 255;
    static final short CHUNKS = 5;
    static final short PER_CHUNK = 51;
    static final short PER_BLOCK = 15;
    static final short BLOCKS = 17;
    static final short BLOCK_BYTES = 240;
    static final short CD_LEN = 160;

    // work buffer layout (transient, owned by the caller)
    private static final short W_PT = 0;     // 32: plaintext blocks for bit 0 and bit 1
    private static final short W_S = 32;     // 32: the two secrets
    private static final short W_H = 64;     // 32: h0 | h1
    private static final short W_A = 96;     // 32: SHA-256(h0), or a scratch hash
    private static final short W_B = 128;    // 32: SHA-256(h1), then T
    private static final short W_ONE = 160;  // 1: the constant 0x01
    static final short W_LEN = 161;

    private static final byte[] BIT = { (byte) 0x01, (byte) 0x02, (byte) 0x04, (byte) 0x08,
        (byte) 0x10, (byte) 0x20, (byte) 0x40, (byte) 0x80 };

    private final MessageDigest md;
    private final MessageDigest mdc;
    private final Cipher aes;
    private final byte[] tW;

    Lx16(byte[] tWork) {
        md = MessageDigest.getInstance(MessageDigest.ALG_SHA_256, false);
        mdc = MessageDigest.getInstance(MessageDigest.ALG_SHA_256, false);
        aes = Cipher.getInstance(Cipher.ALG_AES_BLOCK_128_ECB_NOPAD, false);
        tW = tWork;
    }

    /** Both secrets of position pos of key ki into tW[W_S .. W_S+32). The cipher must be initialised. */
    private void secrets(short ki, short pos) {
        Ram.fill(tW, W_PT, (short) 32, (byte) 0);
        for (short b = 0; b < 2; b++) {
            short o = (short) (W_PT + (short) (b * 16));
            tW[o] = (byte) 0x4C;                          // 'L'
            tW[(short) (o + 1)] = (byte) 0x58;            // 'X'
            tW[(short) (o + 2)] = (byte) 0x31;            // '1'
            tW[(short) (o + 3)] = (byte) 0x36;            // '6'
            tW[(short) (o + 6)] = (byte) (ki >> 8);
            tW[(short) (o + 7)] = (byte) ki;
            tW[(short) (o + 8)] = (byte) (pos >> 8);
            tW[(short) (o + 9)] = (byte) pos;
            tW[(short) (o + 10)] = (byte) b;
        }
        aes.doFinal(tW, W_PT, (short) 32, tW, W_S);
        short lb = (short) (pos & 127);
        short idx = (short) (15 - (short) (lb >> 3));
        byte mask = BIT[(short) (lb & 7)];
        tW[(short) (W_S + idx)] = (byte) (tW[(short) (W_S + idx)] & (byte) ~mask);
        tW[(short) (W_S + 16 + idx)] = (byte) (tW[(short) (W_S + 16 + idx)] | mask);
    }

    /** Bit of digest d (32 bytes at dOff) that position pos signs. */
    static short digestBit(byte[] d, short dOff, short pos) {
        short lb = (short) (pos & 127);
        short half = (pos < 128) ? (short) 16 : (short) 0;
        byte v = d[(short) (dOff + half + 15 - (short) (lb >> 3))];
        return ((v & BIT[(short) (lb & 7)]) != 0) ? (short) 1 : (short) 0;
    }

    /** The five chunk digests (160 bytes at cdOff) and the public key (32 bytes at pkOff) of key ki. */
    void publicKey(AESKey key, short ki, byte[] tOut, short cdOff, short pkOff) {
        Ram.check(tOut);
        aes.init(key, Cipher.MODE_ENCRYPT);
        tW[W_ONE] = (byte) 1;
        for (short c = 0; c < CHUNKS; c++) {
            mdc.reset();
            mdc.update(tW, W_ONE, (short) 1);
            for (short j = 0; j < PER_CHUNK; j++) {
                secrets(ki, (short) ((short) (c * PER_CHUNK) + j));
                md.reset();
                md.doFinal(tW, W_S, N, tW, W_A);
                Ram.copy(tW, W_A, tW, W_H, N);
                md.reset();
                md.doFinal(tW, (short) (W_S + N), N, tW, W_A);
                Ram.copy(tW, W_A, tW, (short) (W_H + N), N);
                md.reset();
                md.doFinal(tW, W_H, N, tW, W_A);
                md.reset();
                md.doFinal(tW, (short) (W_H + N), N, tW, W_B);
                for (short k = 0; k < 32; k++) {
                    tW[(short) (W_B + k)] = (byte) (tW[(short) (W_B + k)] ^ tW[(short) (W_A + k)]);
                }
                mdc.update(tW, W_B, (short) 32);
            }
            mdc.doFinal(tW, W_ONE, (short) 0, tOut, (short) (cdOff + (short) (c * 32)));
        }
        md.reset();
        md.update(tW, W_ONE, (short) 1);
        md.doFinal(tOut, cdOff, CD_LEN, tOut, pkOff);
    }

    /**
     * One 240-byte block of the signature on digest d (32 bytes at dOff) by key ki.
     * Blocks 0..16: R for positions 15b .. 15b+14. Blocks 17..33: C for the same positions of block b-17.
     */
    void sigBlock(AESKey key, short ki, byte[] d, short dOff, short b, byte[] tOut, short oOff) {
        Ram.check(tOut);
        boolean comp = b >= BLOCKS;
        short blk = comp ? (short) (b - BLOCKS) : b;
        aes.init(key, Cipher.MODE_ENCRYPT);
        for (short j = 0; j < PER_BLOCK; j++) {
            short pos = (short) ((short) (blk * PER_BLOCK) + j);
            short bit = digestBit(d, dOff, pos);
            secrets(ki, pos);
            short o = (short) (oOff + (short) (j * N));
            if (!comp) {
                Ram.copy(tW, (short) (W_S + (short) (bit * N)), tOut, o, N);
            } else {
                md.reset();
                md.doFinal(tW, (short) (W_S + (short) ((short) (1 - bit) * N)), N, tW, W_A);
                Ram.copy(tW, W_A, tOut, o, N);
            }
        }
    }

    /** Self-test helper: one AES block (the FIPS-197 known answer). */
    void encryptBlock(AESKey key, byte[] in, short inOff, byte[] tOut, short oOff) {
        Ram.check(tOut);
        aes.init(key, Cipher.MODE_ENCRYPT);
        aes.doFinal(in, inOff, N, tOut, oOff);
    }

    /** Self-test helper: true when the label bit of both secrets of (ki, pos) is forced correctly. */
    boolean labelsOk(AESKey key, short ki, short pos) {
        aes.init(key, Cipher.MODE_ENCRYPT);
        secrets(ki, pos);
        short lb = (short) (pos & 127);
        short idx = (short) (15 - (short) (lb >> 3));
        byte mask = BIT[(short) (lb & 7)];
        return (tW[(short) (W_S + idx)] & mask) == 0 && (tW[(short) (W_S + 16 + idx)] & mask) != 0;
    }
}
