package org.stables.card;

import javacard.framework.APDU;
import javacard.framework.Applet;
import javacard.framework.ISO7816;
import javacard.framework.ISOException;
import javacard.framework.JCSystem;
import javacard.framework.Util;
import javacard.security.AESKey;
import javacard.security.CryptoException;
import javacard.security.ECPrivateKey;
import javacard.security.ECPublicKey;
import javacard.security.Key;
import javacard.security.KeyBuilder;
import javacard.security.KeyPair;
import javacard.security.MessageDigest;
import javacard.security.RandomData;
import javacard.security.Signature;

/**
 * Stables checking account on a chip (Stage 2), per simcard/docs/chip-balance-design.md sections 3, 4 and 5.
 *
 * The chip holds a balance per currency and pays chip to chip with P-256 signatures (EC profile, 4.1). Payments
 * never touch the chain. Money leaves through a defund voucher signed with a one-time LX16 key that the chain can
 * check (5.1). Everything that changes persistent memory goes through Persist, and follows "commit, then emit"
 * (3.3): the state change is committed before any message that depends on it leaves the chip.
 *
 * Commands: see Proto. There is no "sign anything" command: every signature is over a message the chip builds
 * from its own state and checked inputs (Phase 0 decision 1).
 *
 * Hooks carried and unused (founder decision 14, appendix "Deferred: if a chip is ever broken"): the version byte of
 * every message, the signed payment counter n, the snapshot version in HELLO and TRANSFER, the counters k, F, S, R,
 * D per currency, G_HOOK_STATUS and G_HOOK_FRESH. Nothing acts on them beyond what the design describes.
 *
 * Java Card 3.0.4 subset only: no String, no int, no long; every array is allocated in the constructor.
 * Status: ASSUMED design, exercised in jCardSim only; nothing here has run on a real card.
 */
public class StablesApplet extends Applet {

    // ---------------------------------------------------------------- self-test bits
    static final short ST_SHA = 0x0001;
    static final short ST_AES = 0x0002;
    static final short ST_ECDSA_KAT = 0x0004;
    static final short ST_ECDSA_ROUNDTRIP = 0x0008;
    static final short ST_ECDSA_REFUSES = 0x0010;
    static final short ST_RANDOM = 0x0020;
    static final short ST_LX16_LABELS = 0x0040;
    static final short ST_COMMIT = 0x0080;
    static final short ST_ALL = 0x00FF;
    /** Largest single transaction the applet makes, in bytes written, with margin (measured by the tear harness). */
    static final short REQUIRED_COMMIT = 512;

    private static final byte[] TAG = { (byte) 0x53, (byte) 0x54, (byte) 0x42, (byte) 0x43 }; // "STBC"
    private static final byte[] BIT = { (byte) 0x01, (byte) 0x02, (byte) 0x04, (byte) 0x08,
        (byte) 0x10, (byte) 0x20, (byte) 0x40, (byte) 0x80 };
    private static final byte[] MAX_ATOMS = { (byte) 0x7F, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF,
        (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF };
    private static final byte PIN_TRIES = 3;
    private static final byte PUK_TRIES = 10;
    private static final short PIN_MIN = 4;
    private static final short PIN_MAX = 8;
    private static final short PUK_LEN = 8;

    // session flags (transient, lost at power-off or deselect)
    private static final short SS_PIN_OK = 0;
    private static final short SS_PEER = 1;
    private static final short SS_SNAP = 2;
    private static final short SS_LEN = 4;

    // tTmp layout
    private static final short T_A = 0;
    private static final short T_B = 8;
    private static final short T_C = 16;
    private static final short T_D = 24;
    private static final short T_E = 32;
    private static final short T_F = 40;
    private static final short T_DIG = 48;   // 32
    private static final short TMP_LEN = 80;

    // ---------------------------------------------------------------- persistent state (all mutable state is here)
    private final byte[] pState;
    private final byte[] pSlots;
    private final byte[] pChipId;
    private final byte[] pCert;
    private final byte[] pIssuer;
    private final byte[] pPin;
    private final byte[] pPuk;
    private final byte[] pPend;
    private final byte[] pOut;
    private final byte[] pCredLog;
    private final byte[] pCredited;
    private final byte[] pRev;
    private final byte[] pVend;
    private final byte[] pKeyUsed;
    private final byte[] pVouch;
    private final byte[] pTkLog;

    // key objects (their contents are set at install, or are scratch: kPeer, kVend)
    private final ECPrivateKey kPriv;
    private final ECPublicKey kPub;
    private final ECPublicKey kPeer;
    private final ECPublicKey kVend;
    private final ECPublicKey kIssuer;
    private final AESKey kChain;

    private final Signature sig;
    private final MessageDigest md;
    private final RandomData rng;
    private final Lx16 lx;

    // ---------------------------------------------------------------- transient buffers
    private final byte[] tIn;
    private final byte[] tOut;
    private final byte[] tBuf;
    private final byte[] tSig;
    private final byte[] tPeer;
    private final byte[] tTmp;
    private final byte[] tSess;
    private final byte[] tSnap;
    private final byte[] tW;

    public static void install(byte[] bArray, short bOffset, byte bLength) {
        new StablesApplet().register(bArray, (short) (bOffset + 1), bArray[bOffset]);
    }

    protected StablesApplet() {
        pState = new byte[Proto.G_LEN];
        pSlots = new byte[(short) (Proto.NUM_SLOTS * Proto.SLOT_LEN)];
        pChipId = new byte[Proto.ID_LEN];
        pCert = new byte[Proto.CERT_MAX];
        pIssuer = new byte[Proto.VEND_ENTRY];
        pPin = new byte[PIN_MAX];
        pPuk = new byte[PUK_LEN];
        pPend = new byte[(short) (Proto.PEND_N * Proto.PEND_LEN)];
        pOut = new byte[(short) (Proto.OUT_N * Proto.OUT_LEN)];
        pCredLog = new byte[(short) (Proto.CLOG_N * Proto.CLOG_LEN)];
        pCredited = new byte[Proto.NONCES];
        pRev = new byte[(short) (Proto.REV_MAX * Proto.REV_ENTRY)];
        pVend = new byte[(short) (2 * Proto.VEND_MAX * Proto.VEND_ENTRY)];
        pKeyUsed = new byte[(short) (Proto.KEYS / 8)];
        pVouch = new byte[(short) (Proto.VOUCH_N * Proto.VOUCH_LEN)];
        pTkLog = new byte[(short) (Proto.TKLOG_N * Proto.TKLOG_LEN)];

        tIn = JCSystem.makeTransientByteArray((short) 256, JCSystem.CLEAR_ON_DESELECT);
        tOut = JCSystem.makeTransientByteArray((short) 256, JCSystem.CLEAR_ON_DESELECT);
        tBuf = JCSystem.makeTransientByteArray((short) 256, JCSystem.CLEAR_ON_DESELECT);
        tSig = JCSystem.makeTransientByteArray((short) 80, JCSystem.CLEAR_ON_DESELECT);
        tPeer = JCSystem.makeTransientByteArray((short) 40, JCSystem.CLEAR_ON_DESELECT);
        tTmp = JCSystem.makeTransientByteArray(TMP_LEN, JCSystem.CLEAR_ON_DESELECT);
        tSess = JCSystem.makeTransientByteArray(SS_LEN, JCSystem.CLEAR_ON_DESELECT);
        tSnap = JCSystem.makeTransientByteArray(Proto.S_BODY, JCSystem.CLEAR_ON_DESELECT);
        tW = JCSystem.makeTransientByteArray(Lx16.W_LEN, JCSystem.CLEAR_ON_DESELECT);

        md = MessageDigest.getInstance(MessageDigest.ALG_SHA_256, false);
        sig = Signature.getInstance(Signature.ALG_ECDSA_SHA_256, false);
        // Secure random is UNKNOWN on the J3R180 (card-capabilities.md): if it is missing, getInstance throws and the
        // install fails loudly rather than falling back to a weaker generator.
        rng = RandomData.getInstance(RandomData.ALG_SECURE_RANDOM);

        kPriv = (ECPrivateKey) KeyBuilder.buildKey(KeyBuilder.TYPE_EC_FP_PRIVATE, KeyBuilder.LENGTH_EC_FP_256, false);
        kPub = (ECPublicKey) KeyBuilder.buildKey(KeyBuilder.TYPE_EC_FP_PUBLIC, KeyBuilder.LENGTH_EC_FP_256, false);
        kPeer = (ECPublicKey) KeyBuilder.buildKey(KeyBuilder.TYPE_EC_FP_PUBLIC, KeyBuilder.LENGTH_EC_FP_256, false);
        kVend = (ECPublicKey) KeyBuilder.buildKey(KeyBuilder.TYPE_EC_FP_PUBLIC, KeyBuilder.LENGTH_EC_FP_256, false);
        kIssuer = (ECPublicKey) KeyBuilder.buildKey(KeyBuilder.TYPE_EC_FP_PUBLIC, KeyBuilder.LENGTH_EC_FP_256, false);
        Ec.setP256(kPriv);
        Ec.setP256(kPub);
        Ec.setP256(kPeer);
        Ec.setP256(kVend);
        Ec.setP256(kIssuer);
        kChain = (AESKey) KeyBuilder.buildKey(KeyBuilder.TYPE_AES, KeyBuilder.LENGTH_AES_256, false);
        lx = new Lx16(tW);

        // the device key is generated on the chip and never leaves it
        KeyPair kp = new KeyPair(kPub, kPriv);
        kp.genKeyPair();

        short st = selfTest();

        // the chain-key seed (LX16 secrets) comes from the chip's own random generator and never leaves it
        rng.generateData(tBuf, (short) 0, (short) 32);
        kChain.setKey(tBuf, (short) 0);
        Ram.fill(tBuf, (short) 0, (short) 32, (byte) 0);

        // chip id = SHA-256 of the uncompressed public key
        short wl = kPub.getW(tBuf, (short) 0);
        md.reset();
        md.doFinal(tBuf, (short) 0, wl, tTmp, T_DIG);
        Persist.write(tTmp, T_DIG, pChipId, (short) 0, Proto.ID_LEN);

        Persist.setByte(pState, Proto.G_PINTRIES, PIN_TRIES);
        Persist.setByte(pState, Proto.G_PUKTRIES, PUK_TRIES);
        Persist.setByte(pState, (short) (Proto.G_KEYNEXT + 1), (byte) 1);    // key index 0 is never usable on chain
        Persist.setByte(pState, Proto.G_SELFTEST, (byte) (st >> 8));
        Persist.setByte(pState, (short) (Proto.G_SELFTEST + 1), (byte) st);
        short alloc = (short) (Proto.G_LEN + pSlots.length + Proto.ID_LEN + Proto.CERT_MAX + Proto.VEND_ENTRY + PIN_MAX
            + PUK_LEN + pPend.length + pOut.length + pCredLog.length + pCredited.length + pRev.length + pVend.length
            + pKeyUsed.length + pVouch.length + pTkLog.length);
        Persist.setByte(pState, Proto.G_ALLOC, (byte) (alloc >> 8));
        Persist.setByte(pState, (short) (Proto.G_ALLOC + 1), (byte) alloc);
        short cc = JCSystem.getMaxCommitCapacity();
        Persist.setByte(pState, Proto.G_COMMITCAP, (byte) (cc >> 8));
        Persist.setByte(pState, (short) (Proto.G_COMMITCAP + 1), (byte) cc);
        if (st != ST_ALL) {
            // a chip that fails a check never operates: it installs inert, answering only GET_STATE, so the phone (or
            // the first test on a real card) can read which check failed; it can never be personalised or used
            Persist.setByte(pState, Proto.G_LIFE, Proto.LIFE_FAILED);
        }
    }

    /** Install self-test (the cashu-javacard lesson): every primitive the applet relies on, checked on this chip. */
    private short selfTest() {
        short ok = 0;
        // SHA-256("abc")
        tBuf[0] = (byte) 0x61;
        tBuf[1] = (byte) 0x62;
        tBuf[2] = (byte) 0x63;
        md.reset();
        md.doFinal(tBuf, (short) 0, (short) 3, tTmp, T_DIG);
        if (Util.arrayCompare(tTmp, T_DIG, Ec.SHA_ABC, (short) 0, (short) 32) == 0) {
            ok |= ST_SHA;
        }
        // AES-256 (FIPS-197 C.3), using the chain-key object before its real seed is set
        kChain.setKey(Ec.AES_KEY, (short) 0);
        lx.encryptBlock(kChain, Ec.AES_PT, (short) 0, tTmp, T_DIG);
        if (Util.arrayCompare(tTmp, T_DIG, Ec.AES_CT, (short) 0, (short) 16) == 0) {
            ok |= ST_AES;
        }
        // ECDSA verify known answer (RFC 6979 A.2.5), and refusal of a tampered copy
        kVend.setW(Ec.KAT_W, (short) 0, (short) 65);
        Ram.copy(Ec.KAT_SIG, (short) 0, tSig, (short) 0, (short) Ec.KAT_SIG.length);
        if (verify(kVend, Ec.KAT_MSG, (short) 0, (short) Ec.KAT_MSG.length, tSig, (short) 0, (short) Ec.KAT_SIG.length)) {
            ok |= ST_ECDSA_KAT;
        }
        tSig[10] = (byte) (tSig[10] ^ 0x01);
        if (!verify(kVend, Ec.KAT_MSG, (short) 0, (short) Ec.KAT_MSG.length, tSig, (short) 0, (short) Ec.KAT_SIG.length)) {
            ok |= ST_ECDSA_REFUSES;
        }
        // round trip with the device key
        short sl = signWithDevice(Ec.KAT_MSG, (short) 0, (short) Ec.KAT_MSG.length, tSig, (short) 0);
        if (verify(kPub, Ec.KAT_MSG, (short) 0, (short) Ec.KAT_MSG.length, tSig, (short) 0, sl)) {
            ok |= ST_ECDSA_ROUNDTRIP;
        }
        // random: two draws differ and are not zero
        rng.generateData(tTmp, T_A, (short) 16);
        rng.generateData(tTmp, T_C, (short) 16);
        if (Util.arrayCompare(tTmp, T_A, tTmp, T_C, (short) 16) != 0 && !U.isZero(tTmp, T_A, (short) 16)) {
            ok |= ST_RANDOM;
        }
        // LX16 label forcing, with the KAT key still in place
        if (lx.labelsOk(kChain, (short) 1, (short) 0) && lx.labelsOk(kChain, (short) 1, (short) 127)
            && lx.labelsOk(kChain, (short) 1, (short) 128) && lx.labelsOk(kChain, (short) 1, (short) 254)) {
            ok |= ST_LX16_LABELS;
        }
        // commit buffer large enough for the largest transaction (UNKNOWN on the J3R180)
        short cap = JCSystem.getMaxCommitCapacity();
        if (cap < 0 || cap >= REQUIRED_COMMIT) {
            ok |= ST_COMMIT;
        }
        Ram.fill(tTmp, (short) 0, TMP_LEN, (byte) 0);
        return ok;
    }

    public boolean select() {
        return true;
    }

    // ================================================================ dispatch
    public void process(APDU apdu) {
        if (selectingApplet()) {
            return;
        }
        byte[] buf = apdu.getBuffer();
        if (buf[ISO7816.OFFSET_CLA] != Proto.CLA) {
            ISOException.throwIt(ISO7816.SW_CLA_NOT_SUPPORTED);
        }
        byte ins = buf[ISO7816.OFFSET_INS];
        byte p1 = buf[ISO7816.OFFSET_P1];
        byte p2 = buf[ISO7816.OFFSET_P2];
        if (pState[Proto.G_LIFE] == Proto.LIFE_FAILED && ins != Proto.INS_GET_STATE) {
            fail(Proto.SW_SELFTEST);
        }
        short len = receive(apdu);
        short out;
        switch (ins) {
            case Proto.INS_GET_STATE: out = getState(p1, p2, len); break;
            case Proto.INS_GET_CERT: out = getCert(); break;
            case Proto.INS_GET_PUBKEY: out = kPub.getW(tOut, (short) 0); break;
            case Proto.INS_LX_PUBKEY: out = lxPubkey(len); break;
            case Proto.INS_VERIFY_PIN: out = verifyPin(len); break;
            case Proto.INS_CHANGE_PIN: out = changePin(len); break;
            case Proto.INS_UNBLOCK_PIN: out = unblockPin(len); break;
            case Proto.INS_SET_LIMITS: out = setLimits(p1, len); break;
            case Proto.INS_PEER: out = peer(len); break;
            case Proto.INS_HELLO: out = hello(p1, len); break;
            case Proto.INS_PAY: out = pay(len); break;
            case Proto.INS_CREDIT: out = credit(len); break;
            case Proto.INS_ACK: out = ack(len); break;
            case Proto.INS_RESEND: out = resend(len); break;
            case Proto.INS_CANCEL_PROOF: out = cancelProof(len); break;
            case Proto.INS_CANCEL: out = cancel(len); break;
            case Proto.INS_ISSUE_TICKETS: out = issueTickets(p1, p2, len); break;
            case Proto.INS_GET_TICKET: out = getTicket(len); break;
            case Proto.INS_SWAP_EXPECT: out = swapExpect(p1, len); break;
            case Proto.INS_FUND: out = fund(len); break;
            case Proto.INS_DEFUND: out = defund(p1, len); break;
            case Proto.INS_DEFUND_READ: out = defundRead(p1, p2); break;
            case Proto.INS_SNAP_BEGIN: out = snapBegin(len); break;
            case Proto.INS_SNAP_VENDORS: out = snapVendors(p1, len); break;
            case Proto.INS_SNAP_REVOCATIONS: out = snapRevocations(len); break;
            case Proto.INS_SNAP_COMMIT: out = snapCommit(); break;
            case Proto.INS_PERSO_SET_ISSUER: out = persoSetIssuer(len); break;
            case Proto.INS_PERSO_SET_CERT: out = persoSetCert(len); break;
            case Proto.INS_PERSO_SET_PIN: out = persoSetPin(len); break;
            case Proto.INS_PERSO_SET_PUK: out = persoSetPuk(len); break;
            case Proto.INS_PERSO_ADD_CURRENCY: out = persoAddCurrency(len); break;
            case Proto.INS_PERSO_LOCK: out = persoLock(); break;
            default:
                ISOException.throwIt(ISO7816.SW_INS_NOT_SUPPORTED);
                return;
        }
        if (out > 0) {
            apdu.setOutgoing();
            apdu.setOutgoingLength(out);
            apdu.sendBytesLong(tOut, (short) 0, out);
        }
    }

    /** Copies the command data into tIn (does not rely on the APDU buffer being larger than the minimum). */
    private short receive(APDU apdu) {
        byte[] buf = apdu.getBuffer();
        short got = apdu.setIncomingAndReceive();
        short total = apdu.getIncomingLength();
        short done = 0;
        short cdata = apdu.getOffsetCdata();
        while (got > 0) {
            if ((short) (done + got) > (short) tIn.length) {
                ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
            }
            Ram.copy(buf, cdata, tIn, done, got);
            done = (short) (done + got);
            got = apdu.receiveBytes(cdata);
        }
        if (done != total) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }
        return done;
    }

    // ================================================================ small helpers
    private static void fail(short sw) {
        ISOException.throwIt(sw);
    }

    private void requireActive() {
        if (pState[Proto.G_LIFE] != 1) {
            fail(Proto.SW_LIFECYCLE);
        }
    }

    private void requirePerso() {
        if (pState[Proto.G_LIFE] != 0) {
            fail(Proto.SW_LIFECYCLE);
        }
    }

    private static short so(short slot) {
        return (short) (slot * Proto.SLOT_LEN);
    }

    private short slotOfToken(byte[] a, short off) {
        for (short s = 0; s < Proto.NUM_SLOTS; s++) {
            short o = so(s);
            if ((pSlots[(short) (o + Proto.SL_FLAGS)] & Proto.SLF_USED) != 0
                && Util.arrayCompare(pSlots, (short) (o + Proto.SL_TOKEN), a, off, Proto.TOKEN_LEN) == 0) {
                return s;
            }
        }
        return -1;
    }

    private short requireSlot(byte p1) {
        short s = p1;
        if (s < 0 || s >= Proto.NUM_SLOTS || (pSlots[(short) (so(s) + Proto.SL_FLAGS)] & Proto.SLF_USED) == 0) {
            fail(Proto.SW_CURRENCY);
        }
        return s;
    }

    private boolean hasLimit(short slot) {
        return !U.isZero(pSlots, (short) (so(slot) + Proto.SL_HOLD), Proto.AMT);
    }

    private boolean checkHeader(byte[] a, short off, byte type) {
        return Util.arrayCompare(a, off, TAG, (short) 0, (short) 4) == 0 && a[(short) (off + 4)] == Proto.VER
            && a[(short) (off + 5)] == type;
    }

    private void writeHeader(byte[] tDst, short off, byte type) {
        Ram.copy(TAG, (short) 0, tDst, off, (short) 4);
        tDst[(short) (off + 4)] = Proto.VER;
        tDst[(short) (off + 5)] = type;
    }

    /** Length of a signed wire message whose body is bodyLen long, or fails. */
    private short wireLen(short bodyLen, short len) {
        if (len <= bodyLen) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        short sl = (short) (tIn[bodyLen] & 0xFF);
        if (sl < 8 || sl > Proto.MAX_SIG || (short) (bodyLen + 1 + sl) > len) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        return (short) (bodyLen + 1 + sl);
    }

    private short signWithDevice(byte[] a, short off, short len, byte[] tDst, short dOff) {
        sig.init(kPriv, Signature.MODE_SIGN);
        return sig.sign(a, off, len, tDst, dOff);
    }

    private boolean verify(Key k, byte[] a, short off, short len, byte[] s, short sOff, short sLen) {
        try {
            sig.init(k, Signature.MODE_VERIFY);
            return sig.verify(a, off, len, s, sOff, sLen);
        } catch (CryptoException e) {
            return false;
        }
    }

    /** Signs the body in tBuf[0..bodyLen) with the device key and writes body | sigLen | sig to tOut. */
    private short emitSigned(short bodyLen) {
        short sl = signWithDevice(tBuf, (short) 0, bodyLen, tSig, (short) 0);
        Ram.copy(tBuf, (short) 0, tOut, (short) 0, bodyLen);
        tOut[bodyLen] = (byte) sl;
        Ram.copy(tSig, (short) 0, tOut, (short) (bodyLen + 1), sl);
        return (short) (bodyLen + 1 + sl);
    }

    private short vendorIndex(byte[] a, short off) {
        short base = (short) (pState[Proto.G_VACTIVE] * (short) (Proto.VEND_MAX * Proto.VEND_ENTRY));
        short n = pState[Proto.G_VCOUNT];
        for (short i = 0; i < n; i++) {
            if (Util.arrayCompare(pVend, (short) (base + (short) (i * Proto.VEND_ENTRY)), a, off, Proto.VID_LEN) == 0) {
                return (short) (base + (short) (i * Proto.VEND_ENTRY));
            }
        }
        return -1;
    }

    private short revCount() {
        return Util.getShort(pState, Proto.G_REVCOUNT);
    }

    /** True when the chip id at id[off] is among the first count owner-revoked entries. */
    private boolean revoked(byte[] id, short off, short count) {
        for (short i = 0; i < count; i++) {
            if (Util.arrayCompare(pRev, (short) (i * Proto.REV_ENTRY), id, off, Proto.REV_ENTRY) == 0) {
                return true;
            }
        }
        return false;
    }

    /** The cached peer (PEER) must be the chip named at a[off]. */
    private void requirePeer(byte[] a, short off) {
        if (tSess[SS_PEER] != 1 || Util.arrayCompare(tPeer, (short) 0, a, off, Proto.ID_LEN) != 0) {
            fail(Proto.SW_NO_PEER);
        }
    }

    private boolean isCredited(short m16) {
        short bi = (short) ((short) (m16 >> 3) & 0x1FFF);
        return (pCredited[bi] & BIT[(short) (m16 & 7)]) != 0;
    }

    /** Index of the outstanding HELLO entry for m (4 bytes at a[off]), or -1. */
    private short outIndex(byte[] a, short off) {
        for (short i = 0; i < Proto.OUT_N; i++) {
            short o = (short) (i * Proto.OUT_LEN);
            if ((pOut[(short) (o + Proto.OU_FLAGS)] & Proto.OF_USED) != 0
                && Util.arrayCompare(pOut, (short) (o + Proto.OU_M), a, off, (short) 4) == 0) {
                return i;
            }
        }
        return -1;
    }

    /** Ticket offset j of m16 in the current range, or -1. */
    private short ticketIndex(short m16) {
        short count = (short) (pState[Proto.G_TK_COUNT] & 0xFF);
        if (count == 0) {
            return -1;
        }
        short d = (short) (m16 - U.u32lo(pState, Proto.G_TK_START));
        if (d >= 0 && d < count) {
            return d;
        }
        return -1;
    }

    private boolean ticketRetired(short j) {
        short bi = (short) (Proto.G_TK_RETIRED + 3 - (short) (j >> 3));
        return (pState[bi] & BIT[(short) (j & 7)]) != 0;
    }

    /** Ticket j is still creditable: in the range, not credited, not retired. */
    private boolean ticketOpen(short j) {
        short m16 = (short) (U.u32lo(pState, Proto.G_TK_START) + j);
        return !isCredited(m16) && !ticketRetired(j);
    }

    /** Reads the next nonce m (fails when the 65,536 nonces are used up): tTmp[T_E .. T_E+4). */
    private void nextNonce(short count) {
        Ram.copy(pState, Proto.G_MNEXT, tTmp, T_E, (short) 4);
        if (!U.fits16(tTmp, T_E)) {
            fail(Proto.SW_EXHAUSTED);
        }
        short m16 = U.u32lo(tTmp, T_E);
        // m16 + count must not pass 65,536
        short last = (short) (m16 + (short) (count - 1));
        if (U.ult(last, m16)) {
            fail(Proto.SW_EXHAUSTED);
        }
    }

    /** Persist: G_MNEXT = m + count (inside a transaction). */
    private void writeNextNonce(short count) {
        short m16 = U.u32lo(tTmp, T_E);
        short nx = (short) (m16 + count);
        tTmp[T_F] = 0;
        tTmp[(short) (T_F + 1)] = (U.ult(nx, m16) || nx == 0 && count > 0) ? (byte) 1 : (byte) 0;
        tTmp[(short) (T_F + 2)] = (byte) (nx >> 8);
        tTmp[(short) (T_F + 3)] = (byte) nx;
        Persist.write(tTmp, T_F, pState, Proto.G_MNEXT, (short) 4);
    }

    /** tTmp[T_D..] = room under the holding limit: hold - balance - reserved (0 if negative). */
    private void room(short slot) {
        short o = so(slot);
        byte br = U.sub(pSlots, (short) (o + Proto.SL_HOLD), pSlots, (short) (o + Proto.SL_BAL), tTmp, T_D, Proto.AMT);
        if (br == 0) {
            br = U.sub(tTmp, T_D, pSlots, (short) (o + Proto.SL_RESERVED), tTmp, T_D, Proto.AMT);
        }
        if (br != 0) {
            Ram.fill(tTmp, T_D, Proto.AMT, (byte) 0);
        }
    }

    /** Persist (in a transaction): reserved = reserved - cap, floored at 0. Only when a holding limit is set. */
    private void release(short slot, byte[] cap, short capOff) {
        if (!hasLimit(slot)) {
            return;
        }
        short o = (short) (so(slot) + Proto.SL_RESERVED);
        if (U.sub(pSlots, o, cap, capOff, tTmp, T_F, Proto.AMT) != 0) {
            Ram.fill(tTmp, T_F, Proto.AMT, (byte) 0);
        }
        Persist.write(tTmp, T_F, pSlots, o, Proto.AMT);
    }

    /** Persist (in a transaction): reserved = reserved + cap, saturating. Only when a holding limit is set. */
    private void reserve(short slot, byte[] cap, short capOff) {
        if (!hasLimit(slot)) {
            return;
        }
        short o = (short) (so(slot) + Proto.SL_RESERVED);
        if (U.add(pSlots, o, cap, capOff, tTmp, T_F, Proto.AMT) != 0) {
            Ram.copy(MAX_ATOMS, (short) 0, tTmp, T_F, Proto.AMT);
        }
        Persist.write(tTmp, T_F, pSlots, o, Proto.AMT);
    }

    // ================================================================ state and identity
    private short getState(byte p1, byte p2, short len) {
        short o = 0;
        switch (p1) {
            case 0:
                tOut[o++] = pState[Proto.G_LIFE];
                Ram.copy(pChipId, (short) 0, tOut, o, Proto.ID_LEN);
                o = (short) (o + Proto.ID_LEN);
                Ram.copy(pState, (short) 0, tOut, o, Proto.G_SW_SECRET); // the general record, without the swap secret
                o = (short) (o + Proto.G_SW_SECRET);
                return o;
            case 1: {
                short s = requireSlot(p2);
                Ram.copy(pSlots, so(s), tOut, (short) 0, Proto.SLOT_LEN);
                return Proto.SLOT_LEN;
            }
            case 2: {
                short i = p2;
                if (i < 0 || i >= Proto.PEND_N) {
                    fail(ISO7816.SW_INCORRECT_P1P2);
                }
                Ram.copy(pPend, (short) (i * Proto.PEND_LEN), tOut, (short) 0, Proto.PEND_LEN);
                return Proto.PEND_LEN;
            }
            case 3: {
                short i = p2;
                if (i < 0 || i >= Proto.VOUCH_N) {
                    fail(ISO7816.SW_INCORRECT_P1P2);
                }
                Ram.copy(pVouch, (short) (i * Proto.VOUCH_LEN), tOut, (short) 0, Proto.VOUCH_LEN);
                return Proto.VOUCH_LEN;
            }
            case 4: {
                // nonce status: issued | credited | outstanding HELLO | open ticket
                if (len != 4) {
                    fail(ISO7816.SW_WRONG_LENGTH);
                }
                Ram.fill(tOut, (short) 0, (short) 4, (byte) 0);
                if (U.fits16(tIn, (short) 0) && U.cmp(tIn, (short) 0, pState, Proto.G_MNEXT, (short) 4) < 0) {
                    short m16 = U.u32lo(tIn, (short) 0);
                    tOut[0] = 1;
                    tOut[1] = isCredited(m16) ? (byte) 1 : (byte) 0;
                    tOut[2] = (outIndex(tIn, (short) 0) >= 0) ? (byte) 1 : (byte) 0;
                    short j = ticketIndex(m16);
                    tOut[3] = (j >= 0 && ticketOpen(j)) ? (byte) 1 : (byte) 0;
                }
                return 4;
            }
            case 5:
                Ram.copy(pOut, (short) 0, tOut, (short) 0, (short) pOut.length);
                return (short) pOut.length;
            case 7: {
                // ticket log page P2: entries in the current batch's log (1) | 8 transfer digests (16 each)
                short pg = p2;
                short pl = (short) (8 * Proto.TKLOG_LEN);
                if (pg < 0 || (short) (pg * pl) >= (short) pTkLog.length) {
                    fail(ISO7816.SW_INCORRECT_P1P2);
                }
                tOut[0] = pState[Proto.G_TK_LOGN];
                Ram.copy(pTkLog, (short) (pg * pl), tOut, (short) 1, pl);
                return (short) (1 + pl);
            }
            case 6: {
                // credit log page P2 (8 entries of m (4) | transfer digest (16))
                short pg = p2;
                short pl = (short) (8 * Proto.CLOG_LEN);
                if (pg < 0 || (short) (pg * pl) >= (short) pCredLog.length) {
                    fail(ISO7816.SW_INCORRECT_P1P2);
                }
                Ram.copy(pCredLog, (short) (pg * pl), tOut, (short) 0, pl);
                return pl;
            }
            default:
                fail(ISO7816.SW_INCORRECT_P1P2);
        }
        return 0;
    }

    private short getCert() {
        short n = (short) (pState[Proto.G_CERTLEN] & 0xFF);
        if (n == 0) {
            fail(Proto.SW_LIFECYCLE);
        }
        Ram.copy(pCert, (short) 0, tOut, (short) 0, n);
        return n;
    }

    private short lxPubkey(short len) {
        if (len != 2) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        short ki = Util.getShort(tIn, (short) 0);
        if (ki < 0 || ki >= Proto.KEYS) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        lx.publicKey(kChain, ki, tOut, (short) 0, Lx16.CD_LEN);
        return (short) (Lx16.CD_LEN + 32);
    }

    // ================================================================ PIN and the owner's limits (3.4)
    private short verifyPin(short len) {
        requireActive();
        short tries = pState[Proto.G_PINTRIES];
        if (tries <= 0) {
            fail(Proto.SW_PIN_BLOCKED);
        }
        short pl = pState[Proto.G_PINLEN];
        if (len != pl && len != (short) (pl + 9)) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        short slot = -1;
        if (len != pl) {
            slot = requireSlot(tIn[pl]);
        }
        // decrement first, as a single atomic write: a tear after this point never gives the try back
        Persist.setByte(pState, Proto.G_PINTRIES, (byte) (tries - 1));
        Persist.secretCompare((byte) tries, pState, Proto.G_PINTRIES);
        if (!U.ctEquals(tIn, (short) 0, pPin, (short) 0, pl)) {
            fail((short) (Proto.SW_WRONG_PIN_BASE + (short) (tries - 1)));
        }
        Ram.fill(tTmp, T_A, Proto.AMT, (byte) 0);
        Persist.begin();
        Persist.setByte(pState, Proto.G_PINTRIES, PIN_TRIES);
        for (short s = 0; s < Proto.NUM_SLOTS; s++) {
            if ((pSlots[(short) (so(s) + Proto.SL_FLAGS)] & Proto.SLF_USED) != 0) {
                Persist.write(tTmp, T_A, pSlots, (short) (so(s) + Proto.SL_SPENT), Proto.AMT);
            }
        }
        if (slot >= 0) {
            Persist.write(tIn, (short) (pl + 1), pSlots, (short) (so(slot) + Proto.SL_ARM), Proto.AMT);
        }
        Persist.commit();
        tSess[SS_PIN_OK] = 1;
        return 0;
    }

    private void consumePin() {
        if (tSess[SS_PIN_OK] != 1) {
            fail(Proto.SW_PIN_REQUIRED);
        }
        tSess[SS_PIN_OK] = 0;
    }

    private short changePin(short len) {
        requireActive();
        if (len < PIN_MIN || len > PIN_MAX) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        consumePin();
        Ram.fill(tBuf, (short) 0, PIN_MAX, (byte) 0xFF);
        Ram.copy(tIn, (short) 0, tBuf, (short) 0, len);
        Persist.begin();
        Persist.write(tBuf, (short) 0, pPin, (short) 0, PIN_MAX);
        Persist.setByte(pState, Proto.G_PINLEN, (byte) len);
        Persist.commit();
        return 0;
    }

    private short unblockPin(short len) {
        requireActive();
        short tries = pState[Proto.G_PUKTRIES];
        if (tries <= 0) {
            fail(Proto.SW_PIN_BLOCKED);
        }
        short nl = (short) (len - PUK_LEN);
        if (nl < PIN_MIN || nl > PIN_MAX) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        Persist.setByte(pState, Proto.G_PUKTRIES, (byte) (tries - 1));
        Persist.secretCompare((byte) tries, pState, Proto.G_PUKTRIES);
        if (!U.ctEquals(tIn, (short) 0, pPuk, (short) 0, PUK_LEN)) {
            fail((short) (Proto.SW_WRONG_PIN_BASE + (short) (tries - 1)));
        }
        Ram.fill(tBuf, (short) 0, PIN_MAX, (byte) 0xFF);
        Ram.copy(tIn, PUK_LEN, tBuf, (short) 0, nl);
        Persist.begin();
        Persist.setByte(pState, Proto.G_PUKTRIES, PUK_TRIES);
        Persist.write(tBuf, (short) 0, pPin, (short) 0, PIN_MAX);
        Persist.setByte(pState, Proto.G_PINLEN, (byte) nl);
        Persist.setByte(pState, Proto.G_PINTRIES, PIN_TRIES);
        Persist.commit();
        return 0;
    }

    /** P1 = slot; data = holding limit | per-payment limit | PIN-less per payment | PIN-less total (8 each). */
    private short setLimits(byte p1, short len) {
        requireActive();
        short s = requireSlot(p1);
        if (len != 32) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        short o = so(s);
        // the owner may lower the PIN-less allowances, never raise them above the personalisation ceilings
        if (U.cmp(tIn, (short) 16, pSlots, (short) (o + Proto.SL_PL_PAY_MAX), Proto.AMT) > 0
            || U.cmp(tIn, (short) 24, pSlots, (short) (o + Proto.SL_PL_TOT_MAX), Proto.AMT) > 0) {
            fail(Proto.SW_LIMIT);
        }
        consumePin();
        Persist.begin();
        Persist.write(tIn, (short) 0, pSlots, (short) (o + Proto.SL_HOLD), (short) 32);
        Persist.commit();
        return 0;
    }

    // ================================================================ payments (4.1)
    /** PEER: check another chip's certificate (accepted vendor, vendor signature) and cache its key for this session. */
    private short peer(short len) {
        requireActive();
        short wl = wireLen(Proto.CERT_BODY, len);
        if (wl != len || !checkHeader(tIn, (short) 0, Proto.T_CERT)) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        short vo = vendorIndex(tIn, Proto.CERT_VID);
        if (vo < 0) {
            fail(Proto.SW_FOREIGN_VENDOR);
        }
        kVend.setW(pVend, (short) (vo + Proto.VID_LEN), Proto.PUB_LEN);
        if (!verify(kVend, tIn, (short) 0, Proto.CERT_BODY, tIn, (short) (Proto.CERT_BODY + 1),
            (short) (tIn[Proto.CERT_BODY] & 0xFF))) {
            fail(Proto.SW_BAD_SIGNATURE);
        }
        tSess[SS_PEER] = 0;
        md.reset();
        md.doFinal(tIn, Proto.CERT_PUB, Proto.PUB_LEN, tPeer, (short) 0);
        Ram.copy(tIn, Proto.CERT_VID, tPeer, Proto.ID_LEN, Proto.VID_LEN);
        kPeer.setW(tIn, Proto.CERT_PUB, Proto.PUB_LEN);
        tSess[SS_PEER] = 1;
        Ram.copy(tPeer, (short) 0, tOut, (short) 0, Proto.ID_LEN);
        return Proto.ID_LEN;
    }

    /** Builds HELLO in tBuf for nonce tTmp[T_E..+4), capacity cap[capOff..+8), slot, flags. Returns its length. */
    private short buildHello(short slot, byte[] cap, short capOff, byte flags) {
        writeHeader(tBuf, (short) 0, Proto.T_HELLO);
        Ram.copy(pChipId, (short) 0, tBuf, Proto.H_RID, Proto.ID_LEN);
        Ram.copy(tTmp, T_E, tBuf, Proto.H_M, (short) 4);
        Ram.copy(cap, capOff, tBuf, Proto.H_CAP, Proto.AMT);
        Ram.copy(pSlots, (short) (so(slot) + Proto.SL_TOKEN), tBuf, Proto.H_TOKEN, Proto.TOKEN_LEN);
        Ram.copy(pState, Proto.G_SNAPVER, tBuf, Proto.H_SNAP, (short) 4);
        tBuf[Proto.H_FLAGS] = flags;
        return Proto.H_BODY;
    }

    /** Capacity for a new HELLO into tTmp[T_C..): the room under the holding limit, or the request, or unlimited. */
    private void helloCap(short slot, short len) {
        if (len == Proto.AMT) {
            Ram.copy(tIn, (short) 0, tTmp, T_C, Proto.AMT);
            if (U.isZero(tTmp, T_C, Proto.AMT)) {
                fail(Proto.SW_AMOUNT);
            }
        } else if (len == 0) {
            Ram.copy(MAX_ATOMS, (short) 0, tTmp, T_C, Proto.AMT);
        } else {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        if (hasLimit(slot)) {
            room(slot);
            if (U.cmp(tTmp, T_D, tTmp, T_C, Proto.AMT) < 0) {
                Ram.copy(tTmp, T_D, tTmp, T_C, Proto.AMT);
            }
            if (U.isZero(tTmp, T_C, Proto.AMT)) {
                fail(Proto.SW_LIMIT);
            }
        }
    }

    /** Takes an entry of the outstanding-nonce table; evicts (retires) the oldest if all are used. Transaction open. */
    private short takeOutEntry() {
        short oldest = -1;
        for (short i = 0; i < Proto.OUT_N; i++) {
            short o = (short) (i * Proto.OUT_LEN);
            if ((pOut[(short) (o + Proto.OU_FLAGS)] & Proto.OF_USED) == 0) {
                return i;
            }
            if (oldest < 0 || U.cmp(pOut, (short) (o + Proto.OU_M),
                pOut, (short) ((short) (oldest * Proto.OUT_LEN) + Proto.OU_M), (short) 4) < 0) {
                oldest = i;
            }
        }
        short o = (short) (oldest * Proto.OUT_LEN);
        release(pOut[(short) (o + Proto.OU_SLOT)], pOut, (short) (o + Proto.OU_CAP));
        return oldest;
    }

    /** HELLO (receiver): P1 = slot; data = optional requested capacity (8). */
    private short hello(byte p1, short len) {
        requireActive();
        short slot = requireSlot(p1);
        helloCap(slot, len);
        nextNonce((short) 1);
        Persist.begin();
        short e = takeOutEntry();
        writeOutEntry(e, slot, Proto.OF_USED);
        reserve(slot, tTmp, T_C);
        writeNextNonce((short) 1);
        Persist.commit();
        short bl = buildHello(slot, tTmp, T_C, (byte) 0);
        return emitSigned(bl);
    }

    private void writeOutEntry(short e, short slot, byte flags) {
        short o = (short) (e * Proto.OUT_LEN);
        Ram.copy(tTmp, T_E, tBuf, (short) 0, (short) 4);
        tBuf[4] = (byte) slot;
        tBuf[5] = flags;
        Ram.copy(tTmp, T_C, tBuf, (short) 6, Proto.AMT);
        tBuf[14] = 0;
        tBuf[15] = 0;
        Persist.write(tBuf, (short) 0, pOut, o, Proto.OUT_LEN);
    }

    /** PAY (payer): data = HELLO wire | amount (8). Commit, then emit the TRANSFER. */
    private short pay(short len) {
        requireActive();
        short hl = wireLen(Proto.H_BODY, len);
        if ((short) (hl + Proto.AMT) != len || !checkHeader(tIn, (short) 0, Proto.T_HELLO)) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        requirePeer(tIn, Proto.H_RID);
        if (!verify(kPeer, tIn, (short) 0, Proto.H_BODY, tIn, (short) (Proto.H_BODY + 1), (short) (hl - Proto.H_BODY - 1))) {
            fail(Proto.SW_BAD_SIGNATURE);
        }
        if (revoked(tIn, Proto.H_RID, revCount())) {
            fail(Proto.SW_REVOKED);
        }
        short slot = slotOfToken(tIn, Proto.H_TOKEN);
        if (slot < 0) {
            fail(Proto.SW_CURRENCY);
        }
        short o = so(slot);
        short a = hl; // offset of the amount in tIn
        if (U.isZero(tIn, a, Proto.AMT) || U.cmp(tIn, a, tIn, Proto.H_CAP, Proto.AMT) > 0) {
            fail(Proto.SW_AMOUNT);
        }
        if (U.sub(pSlots, (short) (o + Proto.SL_BAL), tIn, a, tTmp, T_A, Proto.AMT) != 0) {
            fail(Proto.SW_AMOUNT);                                  // T_A = balance after
        }
        if (!U.isZero(pSlots, (short) (o + Proto.SL_PERPAY), Proto.AMT)
            && U.cmp(tIn, a, pSlots, (short) (o + Proto.SL_PERPAY), Proto.AMT) > 0) {
            fail(Proto.SW_LIMIT);
        }
        boolean ticket = (tIn[Proto.H_FLAGS] & Proto.HF_TICKET) != 0;
        // refuse to pay the same HELLO twice (a relay duplicating it to this payer)
        for (short i = 0; i < Proto.PEND_N; i++) {
            short po = (short) (i * Proto.PEND_LEN);
            byte st = pPend[(short) (po + Proto.PE_STATUS)];
            if ((st == Proto.PS_PENDING || st == Proto.PS_ACKED)
                && Util.arrayCompare(pPend, (short) (po + Proto.PE_WIRE + Proto.X_RID), tIn, Proto.H_RID, Proto.ID_LEN) == 0
                && Util.arrayCompare(pPend, (short) (po + Proto.PE_WIRE + Proto.X_M), tIn, Proto.H_M, (short) 4) == 0) {
                fail(Proto.SW_NONCE_NOT_OUTSTANDING);
            }
        }
        // PIN rules (3.4): PIN-less up to the per-payment and cumulative allowances; else a PIN this session, or an arm
        byte mode = 0; // 0 PIN-less, 1 session PIN, 2 arm
        byte carry = U.add(pSlots, (short) (o + Proto.SL_SPENT), tIn, a, tTmp, T_B, Proto.AMT); // T_B = spent + a
        if (U.cmp(tIn, a, pSlots, (short) (o + Proto.SL_PL_PAY), Proto.AMT) <= 0 && carry == 0
            && U.cmp(tTmp, T_B, pSlots, (short) (o + Proto.SL_PL_TOT), Proto.AMT) <= 0) {
            mode = 0;
        } else if (tSess[SS_PIN_OK] == 1) {
            mode = 1;
        } else if (!U.isZero(pSlots, (short) (o + Proto.SL_ARM), Proto.AMT)
            && U.cmp(tIn, a, pSlots, (short) (o + Proto.SL_ARM), Proto.AMT) <= 0) {
            mode = 2;
        } else {
            fail(Proto.SW_PIN_REQUIRED);
        }
        short e = pendingSlot(ticket);
        // S + a
        if (U.add(pSlots, (short) (o + Proto.SL_S), tIn, a, tTmp, T_C, Proto.AMT) != 0) {
            fail(Proto.SW_AMOUNT);
        }
        // n + 1
        if (U.inc(pState, Proto.G_N, tTmp, T_D, (short) 4) != 0) {
            fail(Proto.SW_EXHAUSTED);
        }
        // TRANSFER body in tBuf
        writeHeader(tBuf, (short) 0, Proto.T_TRANSFER);
        Ram.copy(pChipId, (short) 0, tBuf, Proto.X_PID, Proto.ID_LEN);
        Ram.copy(tTmp, T_D, tBuf, Proto.X_N, (short) 4);
        Ram.copy(tIn, Proto.H_RID, tBuf, Proto.X_RID, Proto.ID_LEN);
        Ram.copy(tIn, Proto.H_M, tBuf, Proto.X_M, (short) 4);
        Ram.copy(tIn, a, tBuf, Proto.X_A, Proto.AMT);
        Ram.copy(tIn, Proto.H_TOKEN, tBuf, Proto.X_TOKEN, Proto.TOKEN_LEN);
        Ram.copy(pSlots, (short) (o + Proto.SL_K), tBuf, Proto.X_K, (short) 4);
        Ram.copy(pSlots, (short) (o + Proto.SL_F), tBuf, Proto.X_F, Proto.AMT);
        Ram.copy(pState, Proto.G_SNAPVER, tBuf, Proto.X_SNAP, (short) 4);
        Ram.copy(tTmp, T_A, tBuf, Proto.X_BAL, Proto.AMT);
        short sl = signWithDevice(tBuf, (short) 0, Proto.X_BODY, tSig, (short) 0);
        tBuf[Proto.X_BODY] = (byte) sl;
        Ram.copy(tSig, (short) 0, tBuf, (short) (Proto.X_BODY + 1), sl);
        short wl = (short) (Proto.X_BODY + 1 + sl);
        // commit: debit, counters, the exact signed transfer in the pending ring
        short po = (short) (e * Proto.PEND_LEN);
        Persist.begin();
        Persist.write(tTmp, T_A, pSlots, (short) (o + Proto.SL_BAL), Proto.AMT);
        Persist.write(tTmp, T_C, pSlots, (short) (o + Proto.SL_S), Proto.AMT);
        if (mode == 0) {
            Persist.write(tTmp, T_B, pSlots, (short) (o + Proto.SL_SPENT), Proto.AMT);
        } else if (mode == 2) {
            Persist.fill(pSlots, (short) (o + Proto.SL_ARM), Proto.AMT, (byte) 0);
        }
        Persist.write(tTmp, T_D, pState, Proto.G_N, (short) 4);
        Persist.write(tBuf, (short) 0, pPend, (short) (po + Proto.PE_WIRE), wl);
        Persist.setByte(pPend, (short) (po + Proto.PE_LEN), (byte) wl);
        Persist.setByte(pPend, (short) (po + Proto.PE_FLAGS), ticket ? Proto.HF_TICKET : (byte) 0);
        Persist.setByte(pPend, (short) (po + Proto.PE_STATUS), Proto.PS_PENDING);
        Persist.commit();
        if (mode == 1) {
            tSess[SS_PIN_OK] = 0;
        }
        // then emit
        Ram.copy(pPend, (short) (po + Proto.PE_WIRE), tOut, (short) 0, wl);
        return wl;
    }

    /**
     * A pending-ring entry for a new transfer: a free, acknowledged or cancelled one; for a ticket payment (no ACK
     * ever reaches the payer at the tap, 4.4) the oldest ticket entry may be overwritten.
     */
    private short pendingSlot(boolean ticket) {
        short oldestTicket = -1;
        for (short i = 0; i < Proto.PEND_N; i++) {
            short po = (short) (i * Proto.PEND_LEN);
            byte st = pPend[(short) (po + Proto.PE_STATUS)];
            if (st != Proto.PS_PENDING) {
                return i;
            }
            if ((pPend[(short) (po + Proto.PE_FLAGS)] & Proto.HF_TICKET) != 0) {
                if (oldestTicket < 0 || U.cmp(pPend, (short) (po + Proto.PE_WIRE + Proto.X_N), pPend,
                    (short) ((short) (oldestTicket * Proto.PEND_LEN) + Proto.PE_WIRE + Proto.X_N), (short) 4) < 0) {
                    oldestTicket = i;
                }
            }
        }
        if (ticket && oldestTicket >= 0) {
            return oldestTicket;
        }
        fail(Proto.SW_PENDING_FULL);
        return -1;
    }

    /** Checks a TRANSFER wire in tIn addressed to this chip from the cached peer. Returns the wire length. */
    private short checkTransferToMe(short len) {
        short wl = wireLen(Proto.X_BODY, len);
        if (wl != len || !checkHeader(tIn, (short) 0, Proto.T_TRANSFER)) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        if (Util.arrayCompare(tIn, Proto.X_RID, pChipId, (short) 0, Proto.ID_LEN) != 0) {
            fail(Proto.SW_NOT_FOR_ME);
        }
        requirePeer(tIn, Proto.X_PID);
        if (!verify(kPeer, tIn, (short) 0, Proto.X_BODY, tIn, (short) (Proto.X_BODY + 1), (short) (wl - Proto.X_BODY - 1))) {
            fail(Proto.SW_BAD_SIGNATURE);
        }
        // the transfer's identity for the credit log: first 16 bytes of SHA-256(body)
        md.reset();
        md.doFinal(tIn, (short) 0, Proto.X_BODY, tTmp, T_DIG);
        return wl;
    }

    /**
     * Credit-log lookup for nonce m (tIn[X_M]): 1 = this transfer credited it; 2 = a different transfer consumed m and m
     * was a single-use HELLO nonce (so this one never was, and never can be); 0 = not known (no entry left in the log, or
     * m was a receive ticket, which several payers may have used and which several transfers may have credited).
     */
    private byte creditLog() {
        byte r = 0;
        for (short i = 0; i < Proto.CLOG_N; i++) {
            short o = (short) (i * Proto.CLOG_LEN);
            if (Util.arrayCompare(pCredLog, (short) (o + Proto.CL_M + 1), tIn, (short) (Proto.X_M + 1), (short) 3) == 0
                && !U.isZero(pCredLog, (short) (o + Proto.CL_DIG), (short) 16)) {
                if (Util.arrayCompare(pCredLog, (short) (o + Proto.CL_DIG), tTmp, T_DIG, (short) 16) == 0) {
                    return 1;
                }
                if (pCredLog[(short) (o + Proto.CL_M)] == 0) {
                    r = 2;
                }
            }
        }
        return r;
    }

    /** Index of this transfer (digest in tTmp[T_DIG..+16)) in the current batch's ticket log, or -1. */
    private short tkLogged() {
        short n = (short) (pState[Proto.G_TK_LOGN] & 0xFF);
        for (short i = 0; i < n; i++) {
            if (Util.arrayCompare(pTkLog, (short) (i * Proto.TKLOG_LEN), tTmp, T_DIG, Proto.TKLOG_LEN) == 0) {
                return i;
            }
        }
        return -1;
    }

    /** CREDIT (receiver): data = TRANSFER wire. Verify, credit once, commit, then emit the ACK. */
    private short credit(short len) {
        requireActive();
        checkTransferToMe(len);
        if (!U.fits16(tIn, Proto.X_M)) {
            fail(Proto.SW_NONCE_NOT_OUTSTANDING);
        }
        short m16 = U.u32lo(tIn, Proto.X_M);
        short slot = slotOfToken(tIn, Proto.X_TOKEN);
        if (slot < 0) {
            fail(Proto.SW_CURRENCY);
        }
        short e = outIndex(tIn, Proto.X_M);
        short j = (e < 0) ? ticketIndex(m16) : (short) -1;
        if (j >= 0) {
            return creditTicket(slot, m16, j);
        }
        if (isCredited(m16)) {
            if (creditLog() == 1) {
                return buildAck(slot); // the same transfer: re-issue the ACK, credit nothing
            }
            fail(Proto.SW_ALREADY_CREDITED);
        }
        if (e < 0) {
            fail(Proto.SW_NONCE_NOT_OUTSTANDING);
        }
        short eo = (short) (e * Proto.OUT_LEN);
        if (pOut[(short) (eo + Proto.OU_SLOT)] != slot) {
            fail(Proto.SW_CURRENCY);
        }
        // capacity signed in the HELLO
        Ram.copy(pOut, (short) (eo + Proto.OU_CAP), tTmp, T_C, Proto.AMT);
        if (U.isZero(tIn, Proto.X_A, Proto.AMT) || U.cmp(tIn, Proto.X_A, tTmp, T_C, Proto.AMT) > 0) {
            fail(Proto.SW_AMOUNT);
        }
        if (revoked(tIn, Proto.X_PID, revCount())) {
            fail(Proto.SW_REVOKED);
        }
        boolean swap = (pOut[(short) (eo + Proto.OU_FLAGS)] & Proto.OF_SWAP) != 0
            && pState[Proto.G_SW_ACTIVE] == 1
            && Util.arrayCompare(pState, Proto.G_SW_M, tIn, Proto.X_M, (short) 4) == 0;
        if (swap && U.cmp(tIn, Proto.X_A, pState, Proto.G_SW_AMT, Proto.AMT) < 0) {
            fail(Proto.SW_SWAP_UNDERPAID);
        }
        short o = so(slot);
        if (U.add(pSlots, (short) (o + Proto.SL_BAL), tIn, Proto.X_A, tTmp, T_A, Proto.AMT) != 0
            || U.cmp(tTmp, T_A, MAX_ATOMS, (short) 0, Proto.AMT) > 0) {
            fail(Proto.SW_AMOUNT);
        }
        if (hasLimit(slot) && U.cmp(tTmp, T_A, pSlots, (short) (o + Proto.SL_HOLD), Proto.AMT) > 0) {
            fail(Proto.SW_LIMIT);
        }
        U.add(pSlots, (short) (o + Proto.SL_R), tIn, Proto.X_A, tTmp, T_B, Proto.AMT);
        short bi = (short) ((short) (m16 >> 3) & 0x1FFF);
        byte nb = (byte) (pCredited[bi] | BIT[(short) (m16 & 7)]);
        short cl = (short) (pState[Proto.G_CLOGNEXT] & 0xFF);
        short co = (short) (cl * Proto.CLOG_LEN);
        // commit: credit, mark m credited, retire it, log the transfer
        Persist.begin();
        Persist.write(tTmp, T_A, pSlots, (short) (o + Proto.SL_BAL), Proto.AMT);
        Persist.write(tTmp, T_B, pSlots, (short) (o + Proto.SL_R), Proto.AMT);
        Persist.setByte(pCredited, bi, nb);
        release(slot, tTmp, T_C);
        Persist.fill(pOut, eo, Proto.OUT_LEN, (byte) 0);
        Persist.write(tIn, Proto.X_M, pCredLog, (short) (co + Proto.CL_M), (short) 4);
        Persist.write(tTmp, T_DIG, pCredLog, (short) (co + Proto.CL_DIG), (short) 16);
        Persist.setByte(pState, Proto.G_CLOGNEXT, (byte) ((short) (cl + 1) % Proto.CLOG_N));
        if (swap) {
            Persist.setByte(pState, Proto.G_SW_PAID, (byte) 1);
        }
        Persist.commit();
        // then emit
        return buildAck(slot);
    }

    /**
     * CREDIT of a transfer made against receive ticket j of the current batch (4.4; gap fix 2026-09-29).
     *
     * A ticket is a HELLO signed in advance and held by the merchant's phone, which is untrusted and may hand one ticket
     * to several payers. So a ticket does not limit itself to one credit: every distinct transfer made against a ticket
     * of the current batch is credited exactly once. A transfer is identified by the digest of its signed body, which
     * covers the payer's chip id and the payer's own signed counter n, and it is recorded in the batch's ticket log in
     * the same transaction as its credit. A reused ticket therefore loads every payment made with it (no second payer's
     * money is left waiting for a cancel proof), and a replayed transfer loads nothing. The log is bounded (TKLOG_N
     * per batch): once full, further transfers on the batch are refused, and CANCEL_PROOF answers them exactly. A new
     * batch (ISSUE_TICKETS) closes this one.
     */
    private short creditTicket(short slot, short m16, short j) {
        if (tkLogged() >= 0) {
            return buildAck(slot); // the same transfer again: re-issue the ACK, credit nothing
        }
        if (ticketRetired(j)) {
            fail(Proto.SW_NONCE_NOT_OUTSTANDING);
        }
        if (pState[Proto.G_TK_SLOT] != slot) {
            fail(Proto.SW_CURRENCY);
        }
        // capacity signed in the ticket
        Ram.copy(pState, Proto.G_TK_CAP, tTmp, T_C, Proto.AMT);
        if (U.isZero(tIn, Proto.X_A, Proto.AMT) || U.cmp(tIn, Proto.X_A, tTmp, T_C, Proto.AMT) > 0) {
            fail(Proto.SW_AMOUNT);
        }
        // owner revocation: judged by the list as it was when the ticket was issued (4.4, good faith)
        if (revoked(tIn, Proto.X_PID, Util.getShort(pState, Proto.G_TK_REVCOUNT))) {
            fail(Proto.SW_REVOKED);
        }
        short ln = (short) (pState[Proto.G_TK_LOGN] & 0xFF);
        if (ln >= Proto.TKLOG_N) {
            fail(Proto.SW_TICKET_LOG_FULL);
        }
        short o = so(slot);
        if (U.add(pSlots, (short) (o + Proto.SL_BAL), tIn, Proto.X_A, tTmp, T_A, Proto.AMT) != 0
            || U.cmp(tTmp, T_A, MAX_ATOMS, (short) 0, Proto.AMT) > 0) {
            fail(Proto.SW_AMOUNT);
        }
        if (hasLimit(slot) && U.cmp(tTmp, T_A, pSlots, (short) (o + Proto.SL_HOLD), Proto.AMT) > 0) {
            fail(Proto.SW_LIMIT);
        }
        U.add(pSlots, (short) (o + Proto.SL_R), tIn, Proto.X_A, tTmp, T_B, Proto.AMT);
        boolean first = !isCredited(m16);
        short bi = (short) ((short) (m16 >> 3) & 0x1FFF);
        byte nb = (byte) (pCredited[bi] | BIT[(short) (m16 & 7)]);
        short cl = (short) (pState[Proto.G_CLOGNEXT] & 0xFF);
        short co = (short) (cl * Proto.CLOG_LEN);
        // commit: credit, record the transfer in the ticket log, mark the ticket used, log the credit
        Persist.begin();
        Persist.write(tTmp, T_A, pSlots, (short) (o + Proto.SL_BAL), Proto.AMT);
        Persist.write(tTmp, T_B, pSlots, (short) (o + Proto.SL_R), Proto.AMT);
        Persist.write(tTmp, T_DIG, pTkLog, (short) (ln * Proto.TKLOG_LEN), Proto.TKLOG_LEN);
        Persist.setByte(pState, Proto.G_TK_LOGN, (byte) (ln + 1));
        Persist.setByte(pCredited, bi, nb);
        if (first) {
            release(slot, tTmp, T_C); // the capacity this ticket reserved, once
        }
        Persist.write(tIn, Proto.X_M, pCredLog, (short) (co + Proto.CL_M), (short) 4);
        Persist.setByte(pCredLog, (short) (co + Proto.CL_M), Proto.CL_TICKET);
        Persist.write(tTmp, T_DIG, pCredLog, (short) (co + Proto.CL_DIG), (short) 16);
        Persist.setByte(pState, Proto.G_CLOGNEXT, (byte) ((short) (cl + 1) % Proto.CLOG_N));
        Persist.commit();
        // then emit
        return buildAck(slot);
    }

    /** ACK for the transfer in tIn; carries the swap secret when the nonce is the paid swap's. */
    private short buildAck(short slot) {
        writeHeader(tBuf, (short) 0, Proto.T_ACK);
        Ram.copy(pChipId, (short) 0, tBuf, Proto.A_RID, Proto.ID_LEN);
        Ram.copy(tIn, Proto.X_PID, tBuf, Proto.A_PID, Proto.ID_LEN);
        Ram.copy(tIn, Proto.X_N, tBuf, Proto.A_N, (short) 4);
        Ram.copy(tIn, Proto.X_M, tBuf, Proto.A_M, (short) 4);
        Ram.copy(tIn, Proto.X_A, tBuf, Proto.A_A, Proto.AMT);
        Ram.copy(tIn, Proto.X_TOKEN, tBuf, Proto.A_TOKEN, Proto.TOKEN_LEN);
        short bl = Proto.A_BODY;
        tBuf[Proto.A_EXTRA] = 0;
        if (pState[Proto.G_SW_ACTIVE] == 1 && pState[Proto.G_SW_PAID] == 1
            && Util.arrayCompare(pState, Proto.G_SW_M, tIn, Proto.X_M, (short) 4) == 0) {
            tBuf[Proto.A_EXTRA] = 1;
            Ram.copy(pState, Proto.G_SW_SECRET, tBuf, Proto.A_SECRET, (short) 32);
            bl = Proto.A_BODY_SWAP;
        }
        return emitSigned(bl);
    }

    /** Pending entry whose transfer has counter n (4 bytes at a[off]), or -1. */
    private short pendingByN(byte[] a, short off) {
        for (short i = 0; i < Proto.PEND_N; i++) {
            short po = (short) (i * Proto.PEND_LEN);
            if (pPend[(short) (po + Proto.PE_STATUS)] != Proto.PS_FREE
                && Util.arrayCompare(pPend, (short) (po + Proto.PE_WIRE + Proto.X_N), a, off, (short) 4) == 0) {
                return i;
            }
        }
        return -1;
    }

    /** The ACK or CANCEL in tIn must match pending entry e: R id, m, a, token. */
    private void matchPending(short e) {
        short w = (short) ((short) (e * Proto.PEND_LEN) + Proto.PE_WIRE);
        if (Util.arrayCompare(pPend, (short) (w + Proto.X_RID), tIn, Proto.A_RID, Proto.ID_LEN) != 0
            || Util.arrayCompare(pPend, (short) (w + Proto.X_M), tIn, Proto.A_M, (short) 4) != 0
            || Util.arrayCompare(pPend, (short) (w + Proto.X_A), tIn, Proto.A_A, Proto.AMT) != 0
            || Util.arrayCompare(pPend, (short) (w + Proto.X_TOKEN), tIn, Proto.A_TOKEN, Proto.TOKEN_LEN) != 0) {
            fail(ISO7816.SW_WRONG_DATA);
        }
    }

    /** Checks an ACK or CANCEL wire (body bodyLen) from the cached peer, addressed to this chip as payer. */
    private void checkReceipt(short len, short bodyLen, byte type) {
        short wl = wireLen(bodyLen, len);
        if (wl != len || !checkHeader(tIn, (short) 0, type)) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        if (Util.arrayCompare(tIn, Proto.A_PID, pChipId, (short) 0, Proto.ID_LEN) != 0) {
            fail(Proto.SW_NOT_FOR_ME);
        }
        requirePeer(tIn, Proto.A_RID);
        if (!verify(kPeer, tIn, (short) 0, bodyLen, tIn, (short) (bodyLen + 1), (short) (wl - bodyLen - 1))) {
            fail(Proto.SW_BAD_SIGNATURE);
        }
    }

    /** ACK (payer): clear the pending entry. */
    private short ack(short len) {
        requireActive();
        if (len <= Proto.A_EXTRA) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        short bl = (tIn[Proto.A_EXTRA] == 1) ? Proto.A_BODY_SWAP : Proto.A_BODY;
        checkReceipt(len, bl, Proto.T_ACK);
        short e = pendingByN(tIn, Proto.A_N);
        if (e < 0) {
            fail(Proto.SW_NOT_PENDING);
        }
        matchPending(e);
        short po = (short) (e * Proto.PEND_LEN);
        byte st = pPend[(short) (po + Proto.PE_STATUS)];
        if (st == Proto.PS_ACKED) {
            return 0;
        }
        if (st != Proto.PS_PENDING) {
            fail(Proto.SW_NOT_PENDING);
        }
        Persist.setByte(pPend, (short) (po + Proto.PE_STATUS), Proto.PS_ACKED);
        return 0;
    }

    /** RESEND (payer): data = n (4). The same signed bytes again (torn-tap recovery, 3.3). */
    private short resend(short len) {
        requireActive();
        if (len != 4) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        short e = pendingByN(tIn, (short) 0);
        if (e < 0) {
            fail(Proto.SW_NOT_PENDING);
        }
        short po = (short) (e * Proto.PEND_LEN);
        byte st = pPend[(short) (po + Proto.PE_STATUS)];
        if (st != Proto.PS_PENDING && st != Proto.PS_ACKED) {
            fail(Proto.SW_NOT_PENDING);
        }
        short wl = (short) (pPend[(short) (po + Proto.PE_LEN)] & 0xFF);
        Ram.copy(pPend, (short) (po + Proto.PE_WIRE), tOut, (short) 0, wl);
        return wl;
    }

    /**
     * CANCEL_PROOF (receiver): data = TRANSFER wire. Signs "this transfer is not credited and never will be", retiring
     * the nonce first if it could still be credited. Refused if this transfer credited it, or if the chip can no longer
     * tell (UNKNOWN_STATE).
     */
    private short cancelProof(short len) {
        requireActive();
        checkTransferToMe(len);
        if (!U.fits16(tIn, Proto.X_M) || U.cmp(tIn, Proto.X_M, pState, Proto.G_MNEXT, (short) 4) >= 0) {
            fail(Proto.SW_NONCE_NOT_OUTSTANDING);
        }
        short m16 = U.u32lo(tIn, Proto.X_M);
        byte reason = Proto.CANCEL_UNCREDITED;
        short e = outIndex(tIn, Proto.X_M);
        short j = (e < 0) ? ticketIndex(m16) : (short) -1;
        if (j >= 0) {
            // a ticket of the current batch: its ticket log is complete, so the answer is exact (gap fix 2026-09-29)
            if (tkLogged() >= 0) {
                fail(Proto.SW_ALREADY_CREDITED);
            }
            if (isCredited(m16)) {
                reason = Proto.CANCEL_OTHER_TRANSFER;
            }
            if (!ticketRetired(j)) {
                // retire the ticket first: no transfer made against it can be credited afterwards, this one included
                short bi = (short) (Proto.G_TK_RETIRED + 3 - (short) (j >> 3));
                Persist.begin();
                if (!isCredited(m16)) {
                    release(pState[Proto.G_TK_SLOT], pState, Proto.G_TK_CAP);
                }
                Persist.setByte(pState, bi, (byte) (pState[bi] | BIT[(short) (j & 7)]));
                Persist.commit();
            }
        } else if (isCredited(m16)) {
            byte lg = creditLog();
            if (lg == 1) {
                fail(Proto.SW_ALREADY_CREDITED);
            }
            if (lg == 0) {
                fail(Proto.SW_UNKNOWN_STATE);
            }
            reason = Proto.CANCEL_OTHER_TRANSFER;
        } else if (e >= 0) {
            short eo = (short) (e * Proto.OUT_LEN);
            Persist.begin();
            release(pOut[(short) (eo + Proto.OU_SLOT)], pOut, (short) (eo + Proto.OU_CAP));
            Persist.fill(pOut, eo, Proto.OUT_LEN, (byte) 0);
            Persist.commit();
        }
        // otherwise m was never credited and can never be now (a retired HELLO, or a ticket of an earlier batch)
        writeHeader(tBuf, (short) 0, Proto.T_CANCEL);
        Ram.copy(pChipId, (short) 0, tBuf, Proto.A_RID, Proto.ID_LEN);
        Ram.copy(tIn, Proto.X_PID, tBuf, Proto.A_PID, Proto.ID_LEN);
        Ram.copy(tIn, Proto.X_N, tBuf, Proto.A_N, (short) 4);
        Ram.copy(tIn, Proto.X_M, tBuf, Proto.A_M, (short) 4);
        Ram.copy(tIn, Proto.X_A, tBuf, Proto.A_A, Proto.AMT);
        Ram.copy(tIn, Proto.X_TOKEN, tBuf, Proto.A_TOKEN, Proto.TOKEN_LEN);
        tBuf[Proto.A_EXTRA] = reason;
        return emitSigned(Proto.A_BODY);
    }

    /** CANCEL (payer): data = cancel proof. Restores the amount once; the entry can never be credited afterwards. */
    private short cancel(short len) {
        requireActive();
        checkReceipt(len, Proto.A_BODY, Proto.T_CANCEL);
        short e = pendingByN(tIn, Proto.A_N);
        if (e < 0) {
            fail(Proto.SW_NOT_PENDING);
        }
        matchPending(e);
        short po = (short) (e * Proto.PEND_LEN);
        if (pPend[(short) (po + Proto.PE_STATUS)] != Proto.PS_PENDING) {
            fail(Proto.SW_NOT_PENDING);
        }
        short slot = slotOfToken(tIn, Proto.A_TOKEN);
        if (slot < 0) {
            fail(Proto.SW_CURRENCY);
        }
        short o = so(slot);
        if (U.add(pSlots, (short) (o + Proto.SL_BAL), tIn, Proto.A_A, tTmp, T_A, Proto.AMT) != 0) {
            fail(Proto.SW_AMOUNT);
        }
        if (U.sub(pSlots, (short) (o + Proto.SL_S), tIn, Proto.A_A, tTmp, T_B, Proto.AMT) != 0) {
            Ram.fill(tTmp, T_B, Proto.AMT, (byte) 0);
        }
        Persist.begin();
        Persist.write(tTmp, T_A, pSlots, (short) (o + Proto.SL_BAL), Proto.AMT);
        Persist.write(tTmp, T_B, pSlots, (short) (o + Proto.SL_S), Proto.AMT);
        Persist.setByte(pPend, (short) (po + Proto.PE_STATUS), Proto.PS_CANCELLED);
        Persist.commit();
        return 0;
    }

    // ================================================================ receive tickets (4.4) and the swap secret (1.4)
    /**
     * ISSUE_TICKETS (receiver): P1 = slot (bit 7: retire the remaining open tickets of the previous range), P2 = count
     * (1..32); data = capacity per ticket (8), required when a holding limit is set. Returns start m (4) | count (1).
     * The new batch closes the previous one: its transfers can no longer be loaded, and its ticket log is cleared.
     */
    private short issueTickets(byte p1, byte p2, short len) {
        requireActive();
        boolean retire = (p1 & (byte) 0x80) != 0;
        short slot = requireSlot((byte) (p1 & 0x7F));
        short count = p2;
        if (count < 1 || count > Proto.MAX_TICKETS) {
            fail(ISO7816.SW_INCORRECT_P1P2);
        }
        // tickets of the previous range still open?
        short old = (short) (pState[Proto.G_TK_COUNT] & 0xFF);
        short open = 0;
        for (short j = 0; j < old; j++) {
            if (ticketOpen(j)) {
                open++;
            }
        }
        if (open > 0 && !retire) {
            fail(Proto.SW_TICKETS_OPEN);
        }
        if (len == Proto.AMT) {
            Ram.copy(tIn, (short) 0, tTmp, T_C, Proto.AMT);
            if (U.isZero(tTmp, T_C, Proto.AMT)) {
                fail(Proto.SW_AMOUNT);
            }
        } else if (len == 0 && !hasLimit(slot)) {
            Ram.copy(MAX_ATOMS, (short) 0, tTmp, T_C, Proto.AMT);
        } else {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        nextNonce(count);
        boolean limit = hasLimit(slot);
        if (limit) {
            // room under the holding limit once the old open tickets are released, then count x capacity must fit
            room(slot);
            if (pState[Proto.G_TK_SLOT] == (byte) slot) {
                for (short j = 0; j < open; j++) {
                    if (U.add(tTmp, T_D, pState, Proto.G_TK_CAP, tTmp, T_D, Proto.AMT) != 0) {
                        Ram.copy(MAX_ATOMS, (short) 0, tTmp, T_D, Proto.AMT);
                    }
                }
            }
            for (short j = 0; j < count; j++) {
                if (U.sub(tTmp, T_D, tTmp, T_C, tTmp, T_D, Proto.AMT) != 0) {
                    fail(Proto.SW_LIMIT);
                }
            }
        }
        Persist.begin();
        // release what the old open tickets reserved
        for (short j = 0; j < open; j++) {
            release(pState[Proto.G_TK_SLOT], pState, Proto.G_TK_CAP);
        }
        if (limit) {
            for (short j = 0; j < count; j++) {
                reserve(slot, tTmp, T_C);
            }
        }
        Persist.write(tTmp, T_E, pState, Proto.G_TK_START, (short) 4);
        Persist.setByte(pState, Proto.G_TK_COUNT, (byte) count);
        Persist.setByte(pState, Proto.G_TK_SLOT, (byte) slot);
        Persist.write(pState, Proto.G_REVCOUNT, pState, Proto.G_TK_REVCOUNT, (short) 2);
        Persist.write(tTmp, T_C, pState, Proto.G_TK_CAP, Proto.AMT);
        Persist.fill(pState, Proto.G_TK_RETIRED, (short) 4, (byte) 0);
        Persist.setByte(pState, Proto.G_TK_LOGN, (byte) 0); // the new batch starts an empty ticket log
        writeNextNonce(count);
        Persist.commit();
        Ram.copy(tTmp, T_E, tOut, (short) 0, (short) 4);
        tOut[4] = (byte) count;
        return 5;
    }

    /** GET_TICKET: data = m (4). The signed HELLO of an open ticket (no state change). */
    private short getTicket(short len) {
        requireActive();
        if (len != 4 || !U.fits16(tIn, (short) 0)) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        short m16 = U.u32lo(tIn, (short) 0);
        short j = ticketIndex(m16);
        if (j < 0 || !ticketOpen(j)) {
            fail(Proto.SW_NONCE_NOT_OUTSTANDING);
        }
        Ram.copy(tIn, (short) 0, tTmp, T_E, (short) 4);
        Ram.copy(pState, Proto.G_TK_CAP, tTmp, T_C, Proto.AMT);
        short bl = buildHello(pState[Proto.G_TK_SLOT], tTmp, T_C, Proto.HF_TICKET);
        return emitSigned(bl);
    }

    /**
     * SWAP_EXPECT (buyer): P1 = slot; data = amount X (8). Makes the one-time secret s, returns h = SHA-256(s) and a
     * HELLO for the swap nonce. s is released only inside the ACK of a transfer of at least X to that nonce.
     */
    private short swapExpect(byte p1, short len) {
        requireActive();
        short slot = requireSlot(p1);
        if (len != Proto.AMT || U.isZero(tIn, (short) 0, Proto.AMT)) {
            fail(Proto.SW_AMOUNT);
        }
        // one open swap at a time: open = active, unpaid, and its nonce still outstanding (a cancelled or evicted swap
        // nonce can never be credited, so that swap is over and its lock is refunded on chain after the deadline)
        if (pState[Proto.G_SW_ACTIVE] == 1 && pState[Proto.G_SW_PAID] == 0 && outIndex(pState, Proto.G_SW_M) >= 0) {
            fail(Proto.SW_TICKETS_OPEN);
        }
        Ram.copy(tIn, (short) 0, tTmp, T_A, Proto.AMT);                 // X
        Ram.copy(MAX_ATOMS, (short) 0, tTmp, T_C, Proto.AMT);
        if (hasLimit(slot)) {
            room(slot);
            if (U.cmp(tTmp, T_D, tTmp, T_A, Proto.AMT) < 0) {
                fail(Proto.SW_LIMIT);
            }
            Ram.copy(tTmp, T_D, tTmp, T_C, Proto.AMT);
        }
        nextNonce((short) 1);
        rng.generateData(tSig, (short) 0, (short) 32);                   // s
        Persist.begin();
        short e = takeOutEntry();
        writeOutEntry(e, slot, (byte) (Proto.OF_USED | Proto.OF_SWAP));
        reserve(slot, tTmp, T_C);
        writeNextNonce((short) 1);
        Persist.write(tSig, (short) 0, pState, Proto.G_SW_SECRET, (short) 32);
        Persist.write(tTmp, T_E, pState, Proto.G_SW_M, (short) 4);
        Persist.write(tTmp, T_A, pState, Proto.G_SW_AMT, Proto.AMT);
        Persist.setByte(pState, Proto.G_SW_SLOT, (byte) slot);
        Persist.setByte(pState, Proto.G_SW_PAID, (byte) 0);
        Persist.setByte(pState, Proto.G_SW_ACTIVE, (byte) 1);
        Persist.commit();
        md.reset();
        md.doFinal(pState, Proto.G_SW_SECRET, (short) 32, tTmp, T_DIG);   // h
        short bl = buildHello(slot, tTmp, T_C, Proto.HF_SWAP);
        short wl = emitSigned(bl);
        // tOut = h (32) | HELLO wire
        Ram.copy(tOut, (short) 0, tBuf, (short) 0, wl);
        Ram.copy(tTmp, T_DIG, tOut, (short) 0, (short) 32);
        Ram.copy(tBuf, (short) 0, tOut, (short) 32, wl);
        return (short) (32 + wl);
    }

    // ================================================================ funding (1.3 routes 1 and 3) and defund (5.1)
    /** FUND: a voucher from this chip's own vendor, numbered k_chip + 1 exactly. */
    private short fund(short len) {
        if (pState[Proto.G_ISSUER] != 1) {
            fail(Proto.SW_LIFECYCLE);
        }
        short wl = wireLen(Proto.F_BODY, len);
        if (wl != len || !checkHeader(tIn, (short) 0, Proto.T_FUND)) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        if (Util.arrayCompare(tIn, Proto.F_ID, pChipId, (short) 0, Proto.ID_LEN) != 0) {
            fail(Proto.SW_NOT_FOR_ME);
        }
        short slot = slotOfToken(tIn, Proto.F_TOKEN);
        if (slot < 0) {
            fail(Proto.SW_CURRENCY);
        }
        if (!verify(kIssuer, tIn, (short) 0, Proto.F_BODY, tIn, (short) (Proto.F_BODY + 1), (short) (wl - Proto.F_BODY - 1))) {
            fail(Proto.SW_BAD_SIGNATURE);
        }
        short o = so(slot);
        if (U.isZero(tIn, Proto.F_X, Proto.AMT)) {
            fail(Proto.SW_AMOUNT);
        }
        U.inc(pSlots, (short) (o + Proto.SL_K), tTmp, T_E, (short) 4);
        if (U.cmp(tTmp, T_E, tIn, Proto.F_K, (short) 4) != 0) {
            fail(Proto.SW_STALE);
        }
        if (U.add(pSlots, (short) (o + Proto.SL_F), tIn, Proto.F_X, tTmp, T_B, Proto.AMT) != 0
            || U.cmp(tTmp, T_B, tIn, Proto.F_F, Proto.AMT) != 0) {
            fail(Proto.SW_STALE);
        }
        if (U.add(pSlots, (short) (o + Proto.SL_BAL), tIn, Proto.F_X, tTmp, T_A, Proto.AMT) != 0
            || U.cmp(tTmp, T_A, MAX_ATOMS, (short) 0, Proto.AMT) > 0) {
            fail(Proto.SW_AMOUNT);
        }
        if (hasLimit(slot) && U.cmp(tTmp, T_A, pSlots, (short) (o + Proto.SL_HOLD), Proto.AMT) > 0) {
            fail(Proto.SW_LIMIT);
        }
        Persist.begin();
        Persist.write(tTmp, T_A, pSlots, (short) (o + Proto.SL_BAL), Proto.AMT);
        Persist.write(tTmp, T_B, pSlots, (short) (o + Proto.SL_F), Proto.AMT);
        Persist.write(tTmp, T_E, pSlots, (short) (o + Proto.SL_K), (short) 4);
        Persist.commit();
        return 0;
    }

    /**
     * DEFUND: P1 = slot (the chain currency); data = amount y (8). PIN required. In one transaction the chip debits,
     * raises its cumulative defunded total D by y, marks its next LX16 key used and stores {key index, message, digest,
     * chunk digests}; only then does the voucher leave. Returns ring index (1) | message (52) | digest (32) | chunk
     * digests (160). DEFUND_READ streams the signature. A key is never used for a second digest: the signature is only
     * ever computed from a stored record.
     *
     * Gap fix 2026-09-29 (defund voucher ordering): the message carries D, not y. The chain pays D minus what it has
     * already paid this chip and accepts only a higher key index (kiss/balance/chip_account_v2_cumulative.kiss), so an
     * older voucher that reaches the chain after a newer one is refused having lost nothing: the newer one already paid
     * it. The newest voucher always stays in the ring, so no voucher has to be kept by the phone or posted in order.
     */
    private short defund(byte p1, short len) {
        requireActive();
        short slot = requireSlot(p1);
        short o = so(slot);
        if ((pSlots[(short) (o + Proto.SL_FLAGS)] & Proto.SLF_DEFUNDABLE) == 0) {
            fail(Proto.SW_CURRENCY);
        }
        if (len != Proto.AMT || U.isZero(tIn, (short) 0, Proto.AMT)) {
            fail(Proto.SW_AMOUNT);
        }
        if (tSess[SS_PIN_OK] != 1) {
            fail(Proto.SW_PIN_REQUIRED);
        }
        short ki = Util.getShort(pState, Proto.G_KEYNEXT);
        if (ki < 1 || ki >= Proto.KEYS) {
            fail(Proto.SW_EXHAUSTED);
        }
        // balance after, defunded total
        if (U.sub(pSlots, (short) (o + Proto.SL_BAL), tIn, (short) 0, tTmp, T_A, Proto.AMT) != 0) {
            fail(Proto.SW_AMOUNT);
        }
        if (U.add(pSlots, (short) (o + Proto.SL_D), tIn, (short) 0, tTmp, T_B, Proto.AMT) != 0) {
            fail(Proto.SW_AMOUNT);
        }
        // the voucher record in tBuf: status | slot | i (2) | message (52) | digest (32) | chunk digests (160)
        tBuf[Proto.VO_STATUS] = 1;
        tBuf[Proto.VO_SLOT] = (byte) slot;
        Ram.setShort(tBuf, Proto.VO_I, ki);
        short m = Proto.VO_MSG;
        U.u16to32(ki, tBuf, (short) (m + Proto.V_I));
        Ram.copy(tTmp, T_B, tBuf, (short) (m + Proto.V_DTOT), Proto.AMT);   // cumulative D after this defund
        Ram.copy(pSlots, (short) (o + Proto.SL_K), tBuf, (short) (m + Proto.V_KC), (short) 4);
        Ram.copy(pSlots, (short) (o + Proto.SL_F), tBuf, (short) (m + Proto.V_FC), Proto.AMT);
        Ram.copy(pState, Proto.G_SNAPVER, tBuf, (short) (m + Proto.V_VER), (short) 4);
        Ram.copy(tTmp, T_A, tBuf, (short) (m + Proto.V_BAL), Proto.AMT);
        Ram.copy(pSlots, (short) (o + Proto.SL_S), tBuf, (short) (m + Proto.V_SENT), Proto.AMT);
        Ram.copy(pSlots, (short) (o + Proto.SL_R), tBuf, (short) (m + Proto.V_RECV), Proto.AMT);
        // d = SHA-256(0x44 | chip id | message)
        tTmp[T_C] = Proto.V_DOMAIN;
        md.reset();
        md.update(tTmp, T_C, (short) 1);
        md.update(pChipId, (short) 0, Proto.ID_LEN);
        md.doFinal(tBuf, m, Proto.V_MSG, tBuf, Proto.VO_DIG);
        // the key's chunk digests (the D1 covenant recomputes the key commitment from them)
        lx.publicKey(kChain, ki, tOut, (short) 0, Lx16.CD_LEN);
        Ram.copy(tOut, (short) 0, tBuf, Proto.VO_CD, Lx16.CD_LEN);
        short vi = (short) (pState[Proto.G_VNEXT] & 0xFF);
        short ubi = (short) (ki >> 3);
        byte ub = (byte) (pKeyUsed[ubi] | BIT[(short) (ki & 7)]);
        // commit
        Persist.begin();
        Persist.write(tTmp, T_A, pSlots, (short) (o + Proto.SL_BAL), Proto.AMT);
        Persist.write(tTmp, T_B, pSlots, (short) (o + Proto.SL_D), Proto.AMT);
        Persist.setByte(pKeyUsed, ubi, ub);
        Persist.setShort(pState, Proto.G_KEYNEXT, (short) (ki + 1));
        Persist.write(tBuf, (short) 0, pVouch, (short) (vi * Proto.VOUCH_LEN), Proto.VOUCH_LEN);
        Persist.setByte(pState, Proto.G_VNEXT, (byte) ((short) (vi + 1) % Proto.VOUCH_N));
        Persist.commit();
        tSess[SS_PIN_OK] = 0;
        // then emit
        return voucherHeader(vi);
    }

    private short voucherHeader(short vi) {
        short vo = (short) (vi * Proto.VOUCH_LEN);
        tOut[0] = (byte) vi;
        Ram.copy(pVouch, (short) (vo + Proto.VO_MSG), tOut, (short) 1, (short) (Proto.V_MSG + 32 + Lx16.CD_LEN));
        return (short) (1 + Proto.V_MSG + 32 + Lx16.CD_LEN);
    }

    /** DEFUND_READ: P1 = ring index; P2 = block 0..33 (R then C), or 0xFF for the header again. */
    private short defundRead(byte p1, byte p2) {
        short vi = p1;
        if (vi < 0 || vi >= Proto.VOUCH_N) {
            fail(ISO7816.SW_INCORRECT_P1P2);
        }
        short vo = (short) (vi * Proto.VOUCH_LEN);
        if (pVouch[(short) (vo + Proto.VO_STATUS)] != 1) {
            fail(Proto.SW_NOT_PENDING);
        }
        if (p2 == (byte) 0xFF) {
            return voucherHeader(vi);
        }
        short b = p2;
        if (b < 0 || b >= (short) (2 * Lx16.BLOCKS)) {
            fail(ISO7816.SW_INCORRECT_P1P2);
        }
        short ki = Util.getShort(pVouch, (short) (vo + Proto.VO_I));
        Ram.copy(pVouch, (short) (vo + Proto.VO_DIG), tTmp, T_DIG, (short) 32);
        lx.sigBlock(kChain, ki, tTmp, T_DIG, b, tOut, (short) 0);
        return Lx16.BLOCK_BYTES;
    }

    // ================================================================ registry snapshots (6.2)
    /** SNAP_BEGIN: the signed header, from an accepted vendor, newer than the chip's own snapshot. */
    private short snapBegin(short len) {
        tSess[SS_SNAP] = 0;
        short wl = wireLen(Proto.S_BODY, len);
        if (wl != len || !checkHeader(tIn, (short) 0, Proto.T_SNAP)) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        if (U.cmp(tIn, Proto.S_VER, pState, Proto.G_SNAPVER, (short) 4) <= 0) {
            fail(Proto.SW_STALE);
        }
        short vo = vendorIndex(tIn, Proto.S_SIGNER);
        if (vo < 0) {
            fail(Proto.SW_FOREIGN_VENDOR);
        }
        kVend.setW(pVend, (short) (vo + Proto.VID_LEN), Proto.PUB_LEN);
        if (!verify(kVend, tIn, (short) 0, Proto.S_BODY, tIn, (short) (Proto.S_BODY + 1), (short) (wl - Proto.S_BODY - 1))) {
            fail(Proto.SW_BAD_SIGNATURE);
        }
        short vc = (short) (tIn[Proto.S_VCOUNT] & 0xFF);
        short rc = Util.getShort(tIn, Proto.S_RCOUNT);
        if (vc < 1 || vc > Proto.VEND_MAX || rc < 0 || rc > Proto.REV_MAX) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        if (rc < revCount()) {
            fail(Proto.SW_STALE); // the revocation list only grows
        }
        Ram.copy(tIn, (short) 0, tSnap, (short) 0, Proto.S_BODY);
        tSess[SS_SNAP] = 1;
        return 0;
    }

    /** SNAP_VENDORS (UPDATE_ACCEPTANCE): P1 = index of the first entry; data = entries of 73 bytes, into the idle buffer. */
    private short snapVendors(byte p1, short len) {
        if (tSess[SS_SNAP] != 1) {
            fail(Proto.SW_LIFECYCLE);
        }
        short idx = p1;
        short n = (short) (len / Proto.VEND_ENTRY);
        short vc = (short) (tSnap[Proto.S_VCOUNT] & 0xFF);
        if (n < 1 || (short) (n * Proto.VEND_ENTRY) != len || idx < 0 || (short) (idx + n) > vc) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        short idle = (short) ((short) (1 - pState[Proto.G_VACTIVE]) * (short) (Proto.VEND_MAX * Proto.VEND_ENTRY));
        Persist.write(tIn, (short) 0, pVend, (short) (idle + (short) (idx * Proto.VEND_ENTRY)), len);
        return 0;
    }

    /** SNAP_REVOCATIONS (UPDATE_REVOCATIONS): data = first index (2) | entries of 8 bytes, appended beyond the live list. */
    private short snapRevocations(short len) {
        if (tSess[SS_SNAP] != 1) {
            fail(Proto.SW_LIFECYCLE);
        }
        short start = Util.getShort(tIn, (short) 0);
        short n = (short) ((short) (len - 2) / Proto.REV_ENTRY);
        short rc = Util.getShort(tSnap, Proto.S_RCOUNT);
        if (len < 10 || (short) ((short) (n * Proto.REV_ENTRY) + 2) != len || start < revCount() || (short) (start + n) > rc) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        Persist.write(tIn, (short) 2, pRev, (short) (start * Proto.REV_ENTRY), (short) (n * Proto.REV_ENTRY));
        return 0;
    }

    /** SNAP_COMMIT: both staged lists must match the signed digests; then the snapshot becomes live atomically. */
    private short snapCommit() {
        if (tSess[SS_SNAP] != 1) {
            fail(Proto.SW_LIFECYCLE);
        }
        short vc = (short) (tSnap[Proto.S_VCOUNT] & 0xFF);
        short rc = Util.getShort(tSnap, Proto.S_RCOUNT);
        short idleSel = (short) (1 - pState[Proto.G_VACTIVE]);
        short idle = (short) (idleSel * (short) (Proto.VEND_MAX * Proto.VEND_ENTRY));
        md.reset();
        md.doFinal(pVend, idle, (short) (vc * Proto.VEND_ENTRY), tTmp, T_DIG);
        if (Util.arrayCompare(tTmp, T_DIG, tSnap, Proto.S_VDIGEST, (short) 32) != 0) {
            fail(Proto.SW_DIGEST_MISMATCH);
        }
        md.reset();
        md.doFinal(pRev, (short) 0, (short) (rc * Proto.REV_ENTRY), tTmp, T_DIG);
        if (Util.arrayCompare(tTmp, T_DIG, tSnap, Proto.S_RDIGEST, (short) 32) != 0) {
            fail(Proto.SW_DIGEST_MISMATCH);
        }
        Persist.begin();
        Persist.setByte(pState, Proto.G_VACTIVE, (byte) idleSel);
        Persist.setByte(pState, Proto.G_VCOUNT, (byte) vc);
        Persist.write(tSnap, Proto.S_RCOUNT, pState, Proto.G_REVCOUNT, (short) 2);
        Persist.write(tSnap, Proto.S_VER, pState, Proto.G_SNAPVER, (short) 4);
        Persist.write(tSnap, Proto.S_BLOCK, pState, Proto.G_SNAPBLOCK, (short) 4);
        Persist.commit();
        tSess[SS_SNAP] = 0;
        return 0;
    }

    // ================================================================ personalisation (vendor, at manufacture)
    /** The issuer (this chip's vendor): vendorId (8) | P-256 public key (65). Also its first accepted vendor. */
    private short persoSetIssuer(short len) {
        requirePerso();
        if (len != Proto.VEND_ENTRY || tIn[Proto.VID_LEN] != (byte) 0x04) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        kIssuer.setW(tIn, Proto.VID_LEN, Proto.PUB_LEN);
        short base = (short) (pState[Proto.G_VACTIVE] * (short) (Proto.VEND_MAX * Proto.VEND_ENTRY));
        Persist.begin();
        Persist.write(tIn, (short) 0, pIssuer, (short) 0, Proto.VEND_ENTRY);
        Persist.write(tIn, (short) 0, pVend, base, Proto.VEND_ENTRY);
        Persist.setByte(pState, Proto.G_VCOUNT, (byte) 1);
        Persist.setByte(pState, Proto.G_ISSUER, (byte) 1);
        Persist.commit();
        return 0;
    }

    /** The vendor certificate: data = sigLen (1) | signature over the certificate body the chip builds itself. */
    private short persoSetCert(short len) {
        requirePerso();
        if (pState[Proto.G_ISSUER] != 1) {
            fail(Proto.SW_LIFECYCLE);
        }
        short sl = (short) (tIn[0] & 0xFF);
        if (len != (short) (sl + 1) || sl < 8 || sl > Proto.MAX_SIG) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        writeHeader(tBuf, (short) 0, Proto.T_CERT);
        Ram.copy(pIssuer, (short) 0, tBuf, Proto.CERT_VID, Proto.VID_LEN);
        kPub.getW(tBuf, Proto.CERT_PUB);
        tBuf[Proto.CERT_BODY] = (byte) sl;
        Ram.copy(tIn, (short) 1, tBuf, (short) (Proto.CERT_BODY + 1), sl);
        if (!verify(kIssuer, tBuf, (short) 0, Proto.CERT_BODY, tBuf, (short) (Proto.CERT_BODY + 1), sl)) {
            fail(Proto.SW_BAD_SIGNATURE);
        }
        short cl = (short) (Proto.CERT_BODY + 1 + sl);
        Persist.begin();
        Persist.write(tBuf, (short) 0, pCert, (short) 0, cl);
        Persist.setByte(pState, Proto.G_CERTLEN, (byte) cl);
        Persist.commit();
        return 0;
    }

    private short persoSetPin(short len) {
        requirePerso();
        if (len < PIN_MIN || len > PIN_MAX) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        Ram.fill(tBuf, (short) 0, PIN_MAX, (byte) 0xFF);
        Ram.copy(tIn, (short) 0, tBuf, (short) 0, len);
        Persist.begin();
        Persist.write(tBuf, (short) 0, pPin, (short) 0, PIN_MAX);
        Persist.setByte(pState, Proto.G_PINLEN, (byte) len);
        Persist.setByte(pState, Proto.G_PINTRIES, PIN_TRIES);
        Persist.commit();
        return 0;
    }

    private short persoSetPuk(short len) {
        requirePerso();
        if (len != PUK_LEN) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        Persist.begin();
        Persist.write(tIn, (short) 0, pPuk, (short) 0, PUK_LEN);
        Persist.setByte(pState, Proto.G_PUKTRIES, PUK_TRIES);
        Persist.commit();
        return 0;
    }

    /** A currency: token id (32) | PIN-less per payment (8) | PIN-less total (8) | flags (1: 0x02 = defundable). */
    private short persoAddCurrency(short len) {
        requirePerso();
        if (len != 49) {
            fail(ISO7816.SW_WRONG_LENGTH);
        }
        if (slotOfToken(tIn, (short) 0) >= 0) {
            fail(ISO7816.SW_WRONG_DATA);
        }
        boolean defundable = (tIn[48] & Proto.SLF_DEFUNDABLE) != 0;
        short free = -1;
        for (short s = 0; s < Proto.NUM_SLOTS; s++) {
            byte f = pSlots[(short) (so(s) + Proto.SL_FLAGS)];
            if ((f & Proto.SLF_USED) == 0 && free < 0) {
                free = s;
            }
            if (defundable && (f & Proto.SLF_DEFUNDABLE) != 0) {
                fail(ISO7816.SW_WRONG_DATA); // one chain currency: its vouchers carry no token id
            }
        }
        if (free < 0) {
            fail(Proto.SW_EXHAUSTED);
        }
        short o = so(free);
        Persist.begin();
        Persist.write(tIn, (short) 0, pSlots, (short) (o + Proto.SL_TOKEN), Proto.TOKEN_LEN);
        Persist.write(tIn, (short) 32, pSlots, (short) (o + Proto.SL_PL_PAY), Proto.AMT);
        Persist.write(tIn, (short) 40, pSlots, (short) (o + Proto.SL_PL_TOT), Proto.AMT);
        Persist.write(tIn, (short) 32, pSlots, (short) (o + Proto.SL_PL_PAY_MAX), Proto.AMT);
        Persist.write(tIn, (short) 40, pSlots, (short) (o + Proto.SL_PL_TOT_MAX), Proto.AMT);
        Persist.setByte(pSlots, (short) (o + Proto.SL_FLAGS),
            (byte) (Proto.SLF_USED | (defundable ? Proto.SLF_DEFUNDABLE : 0)));
        Persist.commit();
        return 0;
    }

    private short persoLock() {
        requirePerso();
        boolean anySlot = false;
        for (short s = 0; s < Proto.NUM_SLOTS; s++) {
            if ((pSlots[(short) (so(s) + Proto.SL_FLAGS)] & Proto.SLF_USED) != 0) {
                anySlot = true;
            }
        }
        if (pState[Proto.G_ISSUER] != 1 || pState[Proto.G_CERTLEN] == 0 || pState[Proto.G_PINLEN] == 0
            || U.isZero(pPuk, (short) 0, PUK_LEN) || !anySlot) {
            fail(Proto.SW_LIFECYCLE);
        }
        Persist.setByte(pState, Proto.G_LIFE, (byte) 1);
        return 0;
    }
}
