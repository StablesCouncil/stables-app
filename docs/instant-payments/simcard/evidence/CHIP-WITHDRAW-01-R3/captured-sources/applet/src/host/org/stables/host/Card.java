package org.stables.host;

import java.util.ArrayList;
import java.util.List;

/**
 * Typed client of the Stables applet over any Apdu transport: what a phone app would send. Every method is one APDU.
 * A refusal (any SW other than 9000) raises Card.Err with the status word.
 */
public final class Card {
    public static final int CLA = 0x80;
    public static final int GET_STATE = 0x10, GET_CERT = 0x12, GET_PUBKEY = 0x14, LX_PUBKEY = 0x16, VERIFY_PIN = 0x20,
        CHANGE_PIN = 0x22, UNBLOCK_PIN = 0x24, SET_LIMITS = 0x26, PEER = 0x30, HELLO = 0x32, PAY = 0x34, CREDIT = 0x36,
        ACK = 0x38, RESEND = 0x3A, CANCEL_PROOF = 0x3C, CANCEL = 0x3E, ISSUE_TICKETS = 0x40, GET_TICKET = 0x42,
        SWAP_EXPECT = 0x44, FUND = 0x50, DEFUND = 0x52, DEFUND_READ = 0x54, SNAP_BEGIN = 0x60, SNAP_VENDORS = 0x62,
        SNAP_REVOCATIONS = 0x64, SNAP_COMMIT = 0x66, PERSO_SET_ISSUER = 0x70, PERSO_SET_CERT = 0x72,
        PERSO_SET_PIN = 0x74, PERSO_SET_PUK = 0x76, PERSO_ADD_CURRENCY = 0x78, PERSO_LOCK = 0x7A;

    public static final int SW_OK = 0x9000, SW_REVOKED = 0x69A1, SW_FOREIGN_VENDOR = 0x69A2, SW_BAD_SIGNATURE = 0x69A3,
        SW_NOT_FOR_ME = 0x69A4, SW_NONCE_NOT_OUTSTANDING = 0x69A5, SW_ALREADY_CREDITED = 0x69A6, SW_AMOUNT = 0x69A7,
        SW_PIN_REQUIRED = 0x69A8, SW_NO_PEER = 0x69A9, SW_PENDING_FULL = 0x69AA, SW_NOT_PENDING = 0x69AB,
        SW_STALE = 0x69AC, SW_CURRENCY = 0x69AD, SW_LIFECYCLE = 0x69AE, SW_EXHAUSTED = 0x69AF,
        SW_DIGEST_MISMATCH = 0x69B0, SW_LIMIT = 0x69B1, SW_SWAP_UNDERPAID = 0x69B2, SW_UNKNOWN_STATE = 0x69B3,
        SW_TICKETS_OPEN = 0x69B5, SW_TICKET_LOG_FULL = 0x69B6, SW_PIN_BLOCKED = 0x6983, SW_WRONG_DATA = 0x6A80,
        SW_WRONG_LENGTH = 0x6700;

    /** A refusal from the card. */
    public static final class Err extends RuntimeException {
        public final int sw;

        Err(String card, int ins, int sw) {
            super(String.format("%s INS %02X refused: SW %04X", card, ins, sw));
            this.sw = sw;
        }
    }

    public final Apdu io;
    public final String name;

    public Card(Apdu io) {
        this.io = io;
        this.name = io.name();
    }

    public static byte[] command(int ins, int p1, int p2, byte[] data) {
        if (data == null || data.length == 0) {
            return new byte[] { (byte) CLA, (byte) ins, (byte) p1, (byte) p2, 0x00 };
        }
        if (data.length > 255) {
            throw new IllegalArgumentException("data longer than a short APDU");
        }
        return Hex.cat(new byte[] { (byte) CLA, (byte) ins, (byte) p1, (byte) p2, (byte) data.length }, data, new byte[] { 0x00 });
    }

    /** Full response (data | SW1 SW2). */
    public byte[] raw(int ins, int p1, int p2, byte[] data) {
        TearControl.step(name + ":" + insName(ins));
        return io.transmit(command(ins, p1, p2, data));
    }

    public static String insName(int ins) {
        switch (ins) {
            case GET_STATE: return "GET_STATE";
            case GET_CERT: return "GET_CERT";
            case GET_PUBKEY: return "GET_PUBKEY";
            case LX_PUBKEY: return "LX_PUBKEY";
            case VERIFY_PIN: return "VERIFY_PIN";
            case CHANGE_PIN: return "CHANGE_PIN";
            case UNBLOCK_PIN: return "UNBLOCK_PIN";
            case SET_LIMITS: return "SET_LIMITS";
            case PEER: return "PEER";
            case HELLO: return "HELLO";
            case PAY: return "PAY";
            case CREDIT: return "CREDIT";
            case ACK: return "ACK";
            case RESEND: return "RESEND";
            case CANCEL_PROOF: return "CANCEL_PROOF";
            case CANCEL: return "CANCEL";
            case ISSUE_TICKETS: return "ISSUE_TICKETS";
            case GET_TICKET: return "GET_TICKET";
            case SWAP_EXPECT: return "SWAP_EXPECT";
            case FUND: return "FUND";
            case DEFUND: return "DEFUND";
            case DEFUND_READ: return "DEFUND_READ";
            case SNAP_BEGIN: return "SNAP_BEGIN";
            case SNAP_VENDORS: return "SNAP_VENDORS";
            case SNAP_REVOCATIONS: return "SNAP_REVOCATIONS";
            case SNAP_COMMIT: return "SNAP_COMMIT";
            case PERSO_SET_ISSUER: return "PERSO_SET_ISSUER";
            case PERSO_SET_CERT: return "PERSO_SET_CERT";
            case PERSO_SET_PIN: return "PERSO_SET_PIN";
            case PERSO_SET_PUK: return "PERSO_SET_PUK";
            case PERSO_ADD_CURRENCY: return "PERSO_ADD_CURRENCY";
            case PERSO_LOCK: return "PERSO_LOCK";
            default: return String.format("INS_%02X", ins);
        }
    }

    public byte[] call(int ins, int p1, int p2, byte[] data) {
        byte[] r = raw(ins, p1, p2, data);
        int sw = ((r[r.length - 2] & 0xFF) << 8) | (r[r.length - 1] & 0xFF);
        record(ins, sw);
        if (sw != SW_OK) {
            throw new Err(name, ins, sw);
        }
        return Hex.sub(r, 0, r.length - 2);
    }

    /** The status word of a command (for refusal checks). */
    public int sw(int ins, int p1, int p2, byte[] data) {
        byte[] r = raw(ins, p1, p2, data);
        int sw = ((r[r.length - 2] & 0xFF) << 8) | (r[r.length - 1] & 0xFF);
        record(ins, sw);
        return sw;
    }

    /** Runtime command coverage: instruction -> {accepted count, refused count} (Stables applet instructions only). */
    public static final java.util.TreeMap<Integer, int[]> COVERAGE = new java.util.TreeMap<Integer, int[]>();

    private void record(int ins, int sw) {
        if (!(io instanceof SimCard) || !java.util.Arrays.equals(lastSelected(), SimCard.AID_APPLET)) {
            return;
        }
        int[] c = COVERAGE.get(ins);
        if (c == null) {
            c = new int[2];
            COVERAGE.put(ins, c);
        }
        c[sw == SW_OK ? 0 : 1]++;
    }

    private byte[] lastSelected() {
        return ((SimCard) io).selected();
    }

    /** Every instruction of the Stables applet. */
    public static final int[] ALL_INS = { GET_STATE, GET_CERT, GET_PUBKEY, LX_PUBKEY, VERIFY_PIN, CHANGE_PIN, UNBLOCK_PIN,
        SET_LIMITS, PEER, HELLO, PAY, CREDIT, ACK, RESEND, CANCEL_PROOF, CANCEL, ISSUE_TICKETS, GET_TICKET, SWAP_EXPECT, FUND,
        DEFUND, DEFUND_READ, SNAP_BEGIN, SNAP_VENDORS, SNAP_REVOCATIONS, SNAP_COMMIT, PERSO_SET_ISSUER, PERSO_SET_CERT,
        PERSO_SET_PIN, PERSO_SET_PUK, PERSO_ADD_CURRENCY, PERSO_LOCK };

    // ------------------------------------------------------------------ state
    public static final class State {
        public byte life;
        public byte[] chipId;
        public long n, mNext, snapVer, snapBlock;
        public int keyNext, revCount, vCount, pinTries, pukTries, selfTest, alloc, commitCap, certLen;
        public long tkStart;
        public int tkCount, tkSlot;
        public boolean swapActive, swapPaid;
        public long swapM;
        public byte[] raw;
    }

    public State state() {
        byte[] r = call(GET_STATE, 0, 0, null);
        State s = new State();
        s.raw = r;
        s.life = r[0];
        s.chipId = Hex.sub(r, 1, 32);
        int g = 33;
        s.n = Hex.u32(r, g + 1);
        s.mNext = Hex.u32(r, g + 5);
        s.keyNext = Hex.u16(r, g + 9);
        s.snapVer = Hex.u32(r, g + 11);
        s.snapBlock = Hex.u32(r, g + 15);
        s.revCount = Hex.u16(r, g + 19);
        s.vCount = r[g + 21] & 0xFF;
        s.certLen = r[g + 23] & 0xFF;
        s.pinTries = r[g + 26];
        s.pukTries = r[g + 27];
        s.selfTest = Hex.u16(r, g + 28);
        s.tkStart = Hex.u32(r, g + 31);
        s.tkCount = r[g + 35] & 0xFF;
        s.tkSlot = r[g + 36];
        s.swapActive = r[g + 51] == 1;
        s.swapM = Hex.u32(r, g + 53);
        s.swapPaid = r[g + 65] == 1;
        s.alloc = Hex.u16(r, g + 72);
        s.commitCap = (short) Hex.u16(r, g + 74);
        return s;
    }

    public static final class Slot {
        public byte[] token;
        public long bal, funded, sent, received, defunded, k, hold, perPay, plPay, plTot, spent, reserved, arm;
        public int flags;
    }

    public Slot slot(int i) {
        byte[] r = call(GET_STATE, 1, i, null);
        Slot s = new Slot();
        s.token = Hex.sub(r, 0, 32);
        s.bal = Hex.u64(r, 32);
        s.funded = Hex.u64(r, 40);
        s.sent = Hex.u64(r, 48);
        s.received = Hex.u64(r, 56);
        s.defunded = Hex.u64(r, 64);
        s.k = Hex.u32(r, 72);
        s.hold = Hex.u64(r, 76);
        s.perPay = Hex.u64(r, 84);
        s.plPay = Hex.u64(r, 92);
        s.plTot = Hex.u64(r, 100);
        s.spent = Hex.u64(r, 124);
        s.reserved = Hex.u64(r, 132);
        s.arm = Hex.u64(r, 140);
        s.flags = r[148];
        return s;
    }

    public long balance(int slot) {
        return slot(slot).bal;
    }

    public static final class Pending {
        public int index, status, flags;
        public byte[] wire;
    }

    public List<Pending> pendings() {
        List<Pending> out = new ArrayList<Pending>();
        for (int i = 0; i < 16; i++) {
            byte[] r = call(GET_STATE, 2, i, null);
            Pending p = new Pending();
            p.index = i;
            p.status = r[0];
            p.flags = r[1];
            int len = r[2] & 0xFF;
            p.wire = Hex.sub(r, 3, len);
            if (p.status != 0) {
                out.add(p);
            }
        }
        return out;
    }

    public byte[] voucherRecord(int i) {
        return call(GET_STATE, 3, i, null);
    }

    /** issued | credited | outstanding HELLO | open ticket. */
    public int[] nonce(long m) {
        byte[] r = call(GET_STATE, 4, 0, Hex.u32(m));
        return new int[] { r[0], r[1], r[2], r[3] };
    }

    /** Credit log entries {m, digest16}. */
    public List<byte[]> creditLog() {
        List<byte[]> out = new ArrayList<byte[]>();
        for (int pg = 0; pg < 4; pg++) {
            byte[] r = call(GET_STATE, 6, pg, null);
            for (int i = 0; i < 8; i++) {
                byte[] e = Hex.sub(r, i * 20, 20);
                if (!java.util.Arrays.equals(Hex.sub(e, 4, 16), new byte[16])) {
                    out.add(e);
                }
            }
        }
        return out;
    }

    /**
     * The current receive-ticket batch's log: the 16-byte digests of the transfers credited against its tickets (GET_STATE
     * part 7, added by the gap fix of 2026-09-29). An applet without it (the pre-fix build) answers 6A86: empty list.
     */
    public List<byte[]> ticketLog() {
        List<byte[]> out = new ArrayList<byte[]>();
        byte[] first = raw(GET_STATE, 7, 0, null);
        int sw = ((first[first.length - 2] & 0xFF) << 8) | (first[first.length - 1] & 0xFF);
        if (sw != SW_OK) {
            return out;
        }
        int n = first[0] & 0xFF;
        for (int pg = 0; pg * 8 < n; pg++) {
            byte[] r = pg == 0 ? Hex.sub(first, 0, first.length - 2) : call(GET_STATE, 7, pg, null);
            for (int i = 0; i < 8 && pg * 8 + i < n; i++) {
                out.add(Hex.sub(r, 1 + 16 * i, 16));
            }
        }
        return out;
    }

    public byte[] cert() {
        return call(GET_CERT, 0, 0, null);
    }

    public byte[] pubkey() {
        return call(GET_PUBKEY, 0, 0, null);
    }

    public byte[] chipId() {
        return state().chipId;
    }

    /** chunk digests (160) | pk (32) of LX16 key i. */
    public byte[] lxPubkey(int i) {
        return call(LX_PUBKEY, 0, 0, Hex.u16(i));
    }

    // ------------------------------------------------------------------ PIN and limits
    public void verifyPin(byte[] pin) {
        call(VERIFY_PIN, 0, 0, pin);
    }

    public void verifyPinArm(byte[] pin, int slot, long arm) {
        call(VERIFY_PIN, 0, 0, Hex.cat(pin, new byte[] { (byte) slot }, Hex.u64(arm)));
    }

    public void changePin(byte[] pin) {
        call(CHANGE_PIN, 0, 0, pin);
    }

    public void unblock(byte[] puk, byte[] newPin) {
        call(UNBLOCK_PIN, 0, 0, Hex.cat(puk, newPin));
    }

    public void setLimits(int slot, long hold, long perPay, long plPay, long plTot) {
        call(SET_LIMITS, slot, 0, Hex.cat(Hex.u64(hold), Hex.u64(perPay), Hex.u64(plPay), Hex.u64(plTot)));
    }

    // ------------------------------------------------------------------ payments
    public byte[] peer(byte[] cert) {
        return call(PEER, 0, 0, cert);
    }

    public byte[] hello(int slot) {
        return call(HELLO, slot, 0, null);
    }

    public byte[] hello(int slot, long cap) {
        return call(HELLO, slot, 0, Hex.u64(cap));
    }

    public byte[] pay(byte[] hello, long amount) {
        return call(PAY, 0, 0, Hex.cat(hello, Hex.u64(amount)));
    }

    public byte[] credit(byte[] transfer) {
        return call(CREDIT, 0, 0, transfer);
    }

    public void ack(byte[] ack) {
        call(ACK, 0, 0, ack);
    }

    public byte[] resend(long n) {
        return call(RESEND, 0, 0, Hex.u32(n));
    }

    public byte[] cancelProof(byte[] transfer) {
        return call(CANCEL_PROOF, 0, 0, transfer);
    }

    public void cancel(byte[] proof) {
        call(CANCEL, 0, 0, proof);
    }

    /** Returns {start m, count}. */
    public long[] issueTickets(int slot, int count, Long cap, boolean retireOpen) {
        byte[] r = call(ISSUE_TICKETS, slot | (retireOpen ? 0x80 : 0), count, cap == null ? null : Hex.u64(cap));
        return new long[] { Hex.u32(r, 0), r[4] & 0xFF };
    }

    public byte[] ticket(long m) {
        return call(GET_TICKET, 0, 0, Hex.u32(m));
    }

    /** Returns h (32) | HELLO wire. */
    public byte[] swapExpect(int slot, long x) {
        return call(SWAP_EXPECT, slot, 0, Hex.u64(x));
    }

    // ------------------------------------------------------------------ funding and defund
    public void fund(byte[] voucher) {
        call(FUND, 0, 0, voucher);
    }

    /** ring index (1) | message (52) | digest (32) | chunk digests (160). */
    public byte[] defund(int slot, long y) {
        return call(DEFUND, slot, 0, Hex.u64(y));
    }

    public byte[] defundRead(int vi, int block) {
        return call(DEFUND_READ, vi, block, null);
    }

    /** The whole LX16 signature of voucher vi: R (4,080) | C (4,080), streamed in 34 APDUs. */
    public byte[][] defundSignature(int vi) {
        byte[] r = new byte[0], c = new byte[0];
        for (int b = 0; b < 17; b++) {
            r = Hex.cat(r, defundRead(vi, b));
        }
        for (int b = 17; b < 34; b++) {
            c = Hex.cat(c, defundRead(vi, b));
        }
        return new byte[][] { r, c };
    }

    // ------------------------------------------------------------------ registry snapshots
    public void snapBegin(byte[] header) {
        call(SNAP_BEGIN, 0, 0, header);
    }

    public void snapVendors(int index, byte[] entries) {
        call(SNAP_VENDORS, index, 0, entries);
    }

    public void snapRevocations(int start, byte[] entries) {
        call(SNAP_REVOCATIONS, 0, 0, Hex.cat(Hex.u16(start), entries));
    }

    public void snapCommit() {
        call(SNAP_COMMIT, 0, 0, null);
    }

    /** Loads a full snapshot: header, every vendor entry (3 per APDU), the revocation entries this chip lacks. */
    public void loadSnapshot(byte[] header, List<byte[]> vendors, List<byte[]> revocations) {
        snapBegin(header);
        for (int i = 0; i < vendors.size(); i += 3) {
            byte[] chunk = new byte[0];
            for (int j = i; j < Math.min(i + 3, vendors.size()); j++) {
                chunk = Hex.cat(chunk, vendors.get(j));
            }
            snapVendors(i, chunk);
        }
        int have = state().revCount;
        for (int i = have; i < revocations.size(); i += 30) {
            byte[] chunk = new byte[0];
            for (int j = i; j < Math.min(i + 30, revocations.size()); j++) {
                chunk = Hex.cat(chunk, revocations.get(j));
            }
            snapRevocations(i, chunk);
        }
        snapCommit();
    }

    // ------------------------------------------------------------------ personalisation
    public void persoIssuer(byte[] entry) {
        call(PERSO_SET_ISSUER, 0, 0, entry);
    }

    public void persoCert(byte[] der) {
        call(PERSO_SET_CERT, 0, 0, Hex.cat(new byte[] { (byte) der.length }, der));
    }

    public void persoPin(byte[] pin) {
        call(PERSO_SET_PIN, 0, 0, pin);
    }

    public void persoPuk(byte[] puk) {
        call(PERSO_SET_PUK, 0, 0, puk);
    }

    public void persoCurrency(byte[] token, long plPay, long plTot, boolean defundable) {
        call(PERSO_ADD_CURRENCY, 0, 0, Hex.cat(token, Hex.u64(plPay), Hex.u64(plTot), new byte[] { (byte) (defundable ? 2 : 0) }));
    }

    public void persoLock() {
        call(PERSO_LOCK, 0, 0, null);
    }
}
