package org.stables.card;

/**
 * Wire formats, command codes, state layouts and status words of the Stables chip applet.
 * Design: simcard/docs/chip-balance-design.md sections 3 (applet), 4.1 (EC profile), 4.4 (receive tickets),
 * 5.1 (defund voucher), 6.2 (registry snapshots). Everything here is ASSUMED design until a real card runs it.
 *
 * Every signed body starts with the domain tag "STBC", the version byte (a hook: a later rule arrives as a new
 * version) and a type byte. On the wire a signed message is: body | sigLen (1) | DER ECDSA P-256 signature.
 */
final class Proto {
    private Proto() { }

    // ------------------------------------------------------------------ APDU class and instructions
    static final byte CLA = (byte) 0x80;

    static final byte INS_GET_STATE = (byte) 0x10;
    static final byte INS_GET_CERT = (byte) 0x12;
    static final byte INS_GET_PUBKEY = (byte) 0x14;
    static final byte INS_LX_PUBKEY = (byte) 0x16;

    static final byte INS_VERIFY_PIN = (byte) 0x20;
    static final byte INS_CHANGE_PIN = (byte) 0x22;
    static final byte INS_UNBLOCK_PIN = (byte) 0x24;
    static final byte INS_SET_LIMITS = (byte) 0x26;

    static final byte INS_PEER = (byte) 0x30;
    static final byte INS_HELLO = (byte) 0x32;
    static final byte INS_PAY = (byte) 0x34;
    static final byte INS_CREDIT = (byte) 0x36;
    static final byte INS_ACK = (byte) 0x38;
    static final byte INS_RESEND = (byte) 0x3A;
    static final byte INS_CANCEL_PROOF = (byte) 0x3C;
    static final byte INS_CANCEL = (byte) 0x3E;
    static final byte INS_ISSUE_TICKETS = (byte) 0x40;
    static final byte INS_GET_TICKET = (byte) 0x42;
    static final byte INS_SWAP_EXPECT = (byte) 0x44;

    static final byte INS_FUND = (byte) 0x50;
    static final byte INS_DEFUND = (byte) 0x52;
    static final byte INS_DEFUND_READ = (byte) 0x54;

    static final byte INS_SNAP_BEGIN = (byte) 0x60;
    static final byte INS_SNAP_VENDORS = (byte) 0x62;      // UPDATE_ACCEPTANCE (vendor entries of a snapshot)
    static final byte INS_SNAP_REVOCATIONS = (byte) 0x64;  // UPDATE_REVOCATIONS (revocation entries of a snapshot)
    static final byte INS_SNAP_COMMIT = (byte) 0x66;

    static final byte INS_PERSO_SET_ISSUER = (byte) 0x70;
    static final byte INS_PERSO_SET_CERT = (byte) 0x72;
    static final byte INS_PERSO_SET_PIN = (byte) 0x74;
    static final byte INS_PERSO_SET_PUK = (byte) 0x76;
    static final byte INS_PERSO_ADD_CURRENCY = (byte) 0x78;
    static final byte INS_PERSO_LOCK = (byte) 0x7A;

    // ------------------------------------------------------------------ status words (refusals are 69Ax / 69Bx)
    static final short SW_REVOKED = (short) 0x69A1;
    static final short SW_FOREIGN_VENDOR = (short) 0x69A2;
    static final short SW_BAD_SIGNATURE = (short) 0x69A3;
    static final short SW_NOT_FOR_ME = (short) 0x69A4;
    static final short SW_NONCE_NOT_OUTSTANDING = (short) 0x69A5;
    static final short SW_ALREADY_CREDITED = (short) 0x69A6;
    static final short SW_AMOUNT = (short) 0x69A7;
    static final short SW_PIN_REQUIRED = (short) 0x69A8;
    static final short SW_NO_PEER = (short) 0x69A9;
    static final short SW_PENDING_FULL = (short) 0x69AA;
    static final short SW_NOT_PENDING = (short) 0x69AB;
    static final short SW_STALE = (short) 0x69AC;
    static final short SW_CURRENCY = (short) 0x69AD;
    static final short SW_LIFECYCLE = (short) 0x69AE;
    static final short SW_EXHAUSTED = (short) 0x69AF;
    static final short SW_DIGEST_MISMATCH = (short) 0x69B0;
    static final short SW_LIMIT = (short) 0x69B1;
    static final short SW_SWAP_UNDERPAID = (short) 0x69B2;
    static final short SW_UNKNOWN_STATE = (short) 0x69B3;
    static final short SW_SELFTEST = (short) 0x69B4;
    static final short SW_TICKETS_OPEN = (short) 0x69B5;
    static final short SW_TICKET_LOG_FULL = (short) 0x69B6; // the batch's ticket log is full (gap fix 2026-09-29)
    static final short SW_PIN_BLOCKED = (short) 0x6983;
    static final short SW_WRONG_PIN_BASE = (short) 0x63C0; // 63Cx: x tries left

    // ------------------------------------------------------------------ message bodies
    static final byte VER = (byte) 0x01;
    static final byte T_CERT = (byte) 0x51;     // 'Q'
    static final byte T_HELLO = (byte) 0x48;    // 'H'
    static final byte T_TRANSFER = (byte) 0x54; // 'T'
    static final byte T_ACK = (byte) 0x41;      // 'A'
    static final byte T_CANCEL = (byte) 0x43;   // 'C'
    static final byte T_FUND = (byte) 0x46;     // 'F'
    static final byte T_SNAP = (byte) 0x53;     // 'S'
    static final short HDR = 6;                 // "STBC" | ver | type

    static final short ID_LEN = 32;             // chip id = SHA-256 of the chip's uncompressed P-256 public key
    static final short PUB_LEN = 65;
    static final short VID_LEN = 8;             // vendor id
    static final short TOKEN_LEN = 32;          // currency = token id
    static final short AMT = 8;                 // u64 atoms, big endian
    static final short MAX_SIG = 72;            // DER ECDSA P-256

    // certificate body: HDR | vendorId(8) | chipPub(65)
    static final short CERT_VID = 6;
    static final short CERT_PUB = 14;
    static final short CERT_BODY = 79;
    static final short CERT_MAX = (short) (CERT_BODY + 1 + MAX_SIG);

    // HELLO body: HDR | R id | m(4) | cap(8) | token | snapshot version(4) | flags(1)
    static final short H_RID = 6;
    static final short H_M = 38;
    static final short H_CAP = 42;
    static final short H_TOKEN = 50;
    static final short H_SNAP = 82;
    static final short H_FLAGS = 86;
    static final short H_BODY = 87;
    static final byte HF_TICKET = (byte) 0x01;
    static final byte HF_SWAP = (byte) 0x02;

    // TRANSFER body: HDR | P id | n(4) | R id | m(4) | a(8) | token | k(4) | F(8) | snapshot version(4) | balance after(8)
    static final short X_PID = 6;
    static final short X_N = 38;
    static final short X_RID = 42;
    static final short X_M = 74;
    static final short X_A = 78;
    static final short X_TOKEN = 86;
    static final short X_K = 118;
    static final short X_F = 122;
    static final short X_SNAP = 130;
    static final short X_BAL = 134;
    static final short X_BODY = 142;
    static final short X_MAX = (short) (X_BODY + 1 + MAX_SIG);

    // ACK and CANCEL bodies: HDR | R id | P id | n(4) | m(4) | a(8) | token | (ACK: hasSecret(1) [secret 32]) (CANCEL: reason 1)
    static final short A_RID = 6;
    static final short A_PID = 38;
    static final short A_N = 70;
    static final short A_M = 74;
    static final short A_A = 78;
    static final short A_TOKEN = 86;
    static final short A_EXTRA = 118;
    static final short A_SECRET = 119;
    static final short A_BODY = 119;
    static final short A_BODY_SWAP = 151;
    static final byte CANCEL_UNCREDITED = (byte) 0x01;       // m retired (or retired now) and never credited
    static final byte CANCEL_OTHER_TRANSFER = (byte) 0x02;   // m was credited by a different transfer

    // FUND voucher body: HDR | chip id | token | k(4) | F(8) | X(8)
    static final short F_ID = 6;
    static final short F_TOKEN = 38;
    static final short F_K = 70;
    static final short F_F = 74;
    static final short F_X = 82;
    static final short F_BODY = 90;

    // registry snapshot header: HDR | signer vendorId(8) | version(4) | block(4) | vendorCount(1) | vendorDigest(32)
    //                                | revCount(2) | revDigest(32)
    static final short S_SIGNER = 6;
    static final short S_VER = 14;
    static final short S_BLOCK = 18;
    static final short S_VCOUNT = 22;
    static final short S_VDIGEST = 23;
    static final short S_RCOUNT = 55;
    static final short S_RDIGEST = 57;
    static final short S_BODY = 89;

    // ------------------------------------------------------------------ defund voucher (chain format, 52 bytes)
    // i(4) | D(8) | kc(4) | fc(8) | snapshot version(4) | balance after(8) | sent(8) | received(8)
    // digest d = SHA-256(0x44 | chip id | message)  (kiss/balance/chip_account_v2_cumulative.kiss, D1)
    // D is the chip's CUMULATIVE defunded total after this defund (gap fix 2026-09-29; the measured chip_account.kiss
    // read this field as the amount y of this defund alone). The chain pays D minus the total it has already paid and
    // accepts only a higher key index, so vouchers may reach the chain in any order and the newest covers every older
    // one: an older voucher posted late is refused without losing anything.
    static final short V_I = 0;
    static final short V_DTOT = 4;
    static final short V_KC = 12;
    static final short V_FC = 16;
    static final short V_VER = 24;
    static final short V_BAL = 28;
    static final short V_SENT = 36;
    static final short V_RECV = 44;
    static final short V_MSG = 52;
    static final byte V_DOMAIN = (byte) 0x44;

    // ------------------------------------------------------------------ persistent layouts
    // currency slot
    static final short NUM_SLOTS = 4;
    static final short SL_TOKEN = 0;
    static final short SL_BAL = 32;
    static final short SL_F = 40;          // funded total (hook: carried in TRANSFER)
    static final short SL_S = 48;          // cumulative sent (hook)
    static final short SL_R = 56;          // cumulative received (hook)
    static final short SL_D = 64;          // cumulative defunded D: carried in every defund voucher (5.1, gap fix 2026-09-29)
    static final short SL_K = 72;          // funding count k_chip (4): orders funding vouchers
    static final short SL_HOLD = 76;       // owner holding limit, 0 = none
    static final short SL_PERPAY = 84;     // owner per-payment limit, 0 = none
    static final short SL_PL_PAY = 92;     // PIN-less per payment
    static final short SL_PL_TOT = 100;    // PIN-less total since the last PIN
    static final short SL_PL_PAY_MAX = 108;// ceilings set at personalisation; the owner may only lower
    static final short SL_PL_TOT_MAX = 116;
    static final short SL_SPENT = 124;     // PIN-less amount spent since the last PIN
    static final short SL_RESERVED = 132;  // capacity reserved by outstanding HELLOs and tickets (holding limit only)
    static final short SL_ARM = 140;       // amount armed by a PIN on the owner's own phone, used by the next payment
    static final short SL_FLAGS = 148;
    static final short SLOT_LEN = 152;
    static final byte SLF_USED = (byte) 0x01;
    static final byte SLF_DEFUNDABLE = (byte) 0x02;

    // general state
    static final short G_LIFE = 0;          // 0 personalisation, 1 active, LIFE_FAILED self-test failed (inert)
    static final byte LIFE_FAILED = (byte) 0x7F;
    static final short G_N = 1;             // payment counter n (4)
    static final short G_MNEXT = 5;         // next receiver nonce m (4), at most 65,536
    static final short G_KEYNEXT = 9;       // next LX16 key index (2); index 0 is never usable on chain (D1: i > u, u = 0)
    static final short G_SNAPVER = 11;      // registry snapshot version (4)
    static final short G_SNAPBLOCK = 15;    // block height of that snapshot (4); hook for the deferred freshness rule
    static final short G_REVCOUNT = 19;     // revocation entries (2)
    static final short G_VCOUNT = 21;       // accepted vendors (1)
    static final short G_VACTIVE = 22;      // which vendor buffer is live (1)
    static final short G_CERTLEN = 23;
    static final short G_ISSUER = 24;       // 1 once the issuer key is set
    static final short G_PINLEN = 25;
    static final short G_PINTRIES = 26;
    static final short G_PUKTRIES = 27;
    static final short G_SELFTEST = 28;     // self-test bits (2)
    static final short G_CLOGNEXT = 30;     // credit log cursor (1)
    static final short G_TK_START = 31;     // ticket range start m (4)
    static final short G_TK_COUNT = 35;     // (1) 0 = none
    static final short G_TK_SLOT = 36;
    static final short G_TK_REVCOUNT = 37;  // revocation entries at issue (2): later revocations do not refuse a ticket payment
    static final short G_TK_CAP = 39;       // capacity per ticket (8)
    static final short G_TK_RETIRED = 47;   // retired mask (4), bit j = ticket start + j
    static final short G_SW_ACTIVE = 51;
    static final short G_SW_SLOT = 52;
    static final short G_SW_M = 53;         // (4)
    static final short G_SW_AMT = 57;       // (8)
    static final short G_SW_PAID = 65;
    static final short G_VNEXT = 66;        // voucher ring cursor
    static final short G_HOOK_STATUS = 67;  // hook, unused: evidence status (appendix D.3)
    static final short G_HOOK_FRESH = 68;   // hook, unused: freshness window (appendix D.4) (4)
    static final short G_ALLOC = 72;        // bytes of persistent arrays allocated at install (2), for the benchmark
    static final short G_COMMITCAP = 74;    // JCSystem.getMaxCommitCapacity() seen at install (2)
    static final short G_SW_SECRET = 76;    // swap secret s (32)
    static final short G_TK_LOGN = 108;     // entries in the current batch's ticket log (1) (gap fix 2026-09-29)
    static final short G_LEN = 109;

    // pending ring (payer): the exact signed TRANSFER, so a torn tap re-sends the same bytes
    static final short PEND_N = 16;
    static final short PE_STATUS = 0;
    static final short PE_FLAGS = 1;
    static final short PE_LEN = 2;
    static final short PE_WIRE = 3;
    static final short PEND_LEN = (short) (PE_WIRE + X_MAX);
    static final byte PS_FREE = 0;
    static final byte PS_PENDING = 1;
    static final byte PS_ACKED = 2;
    static final byte PS_CANCELLED = 3;

    // outstanding HELLO nonces (receiver)
    static final short OUT_N = 4;
    static final short OU_M = 0;
    static final short OU_SLOT = 4;
    static final short OU_FLAGS = 5;
    static final short OU_CAP = 6;
    static final short OUT_LEN = 16;
    static final byte OF_USED = (byte) 0x01;
    static final byte OF_SWAP = (byte) 0x02;

    // credit log (receiver): which transfer credited which nonce, for ACK re-issue and "credited by another" proofs
    static final short CLOG_N = 32;
    static final short CL_M = 0;
    static final short CL_DIG = 4;
    static final short CLOG_LEN = 20;
    // first byte of CL_M (always 0 in a nonce, which fits 16 bits): set for a credit made against a receive ticket.
    // A ticket may be used by several payers, so "another transfer credited m" proves nothing for a ticket nonce.
    static final byte CL_TICKET = (byte) 0x80;

    // ticket log (receiver, gap fix 2026-09-29): the first 16 bytes of SHA-256 of every transfer credited against a
    // receive ticket of the current batch. A transfer is credited at most once because it is recorded here in the same
    // transaction as its credit; a ticket handed to several payers therefore loads every payment made with it.
    static final short TKLOG_N = 64;
    static final short TKLOG_LEN = 16;

    // defund voucher ring
    static final short VOUCH_N = 4;
    static final short VO_STATUS = 0;
    static final short VO_SLOT = 1;
    static final short VO_I = 2;            // key index (2)
    static final short VO_MSG = 4;          // message (52)
    static final short VO_DIG = 56;         // digest (32)
    static final short VO_CD = 88;          // chunk digests (160)
    static final short VOUCH_LEN = 248;

    // lists
    static final short NONCES = (short) 8192;       // credited-nonce bitmap bytes (65,536 nonces)
    static final short REV_MAX = (short) 2048;
    static final short REV_ENTRY = 8;               // truncated chip id
    static final short VEND_MAX = 16;
    static final short VEND_ENTRY = 73;             // vendorId(8) | public key(65)
    static final short KEYS = 1024;                 // LX16 keys per tree
    static final short MAX_TICKETS = 32;
}
