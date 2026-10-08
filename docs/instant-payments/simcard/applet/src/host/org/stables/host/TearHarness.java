package org.stables.host;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The tear harness (chip-balance-design.md 0c.2 item 2). Instrumented build only (src/tear Persist/Ram).
 *
 * For every scenario (a sequence of APDUs that writes persistent state):
 *  1. an enumeration run records every persistent write point (Persist call) with its APDU and source line;
 *  2. for every write point k, a fresh set of cards runs the scenario with the power cut just before point k: the
 *     instrumented layer rolls back the open transaction as a card would, and the card is powered up again;
 *  3. for every APDU i, two more runs: the response of APDU i is lost (the card acted, the phone never heard), and
 *     the card loses power right after answering APDU i (transient state lost between APDUs);
 *  4. after each interruption the four invariants are checked, then the documented recovery runs (Phone.recover:
 *     re-send the same signed transfer, credit once or cancel with the receiver's proof; re-read defund vouchers;
 *     reload the snapshot) and the invariants are checked again, and once more after a second, redundant recovery.
 *
 * Invariants (0c.2, restated for a balance):
 *  I1 value conserved: balances + in flight never exceed the original, and after recovery equal it;
 *  I2 counters monotonic: n, m, k_chip, the LX16 used-key bitmap and next index, the snapshot version and revocation
 *     count never go back, and a tear never gives back a PIN (or PUK) try;
 *  I3 no one-time LX16 key reused: every voucher the chip ever emitted maps one key index to one digest, the key is
 *     marked used, and the signature read back (again, after the tear) is the same one;
 *  I4 the torn tap is credited once: after recovery no transfer is pending; each acknowledged transfer was credited
 *     by its receiver exactly once, each cancelled one never; a second recovery changes nothing.
 */
public final class TearHarness {
    private TearHarness() { }

    static final long U = Hex.atoms(1);
    static final int SLOTS = 2;

    // ================================================================ scenarios
    abstract static class Scenario {
        final String name;
        final String covers;
        /** The scenario itself verifies the right PIN or PUK, which legitimately resets the tries. */
        boolean pinMayReset;
        /** The recovery procedure verifies the right PIN (for example before a new defund). */
        boolean recoveryVerifiesPin;
        /** Chain-backed value a FUND voucher brings in, per step of the funding count k (slot 0); 0 = none. */
        long inflowPerK;

        Scenario(String name, String covers) {
            this.name = name;
            this.covers = covers;
        }

        abstract Ctx setup();

        abstract void run(Ctx c);

        void recover(Ctx c) {
            for (Card x : c.cards) {
                Phone.recover(x, c.cards);
            }
        }

        /** Scenario-specific checks after recovery; returns "" or a failure note. */
        String finalCheck(Ctx c) {
            return "";
        }
    }

    static final class Ctx {
        Lab lab;
        final List<Card> cards = new ArrayList<Card>();
        final Map<String, Object> m = new HashMap<String, Object>();
        /** Every LX16 voucher emission seen: card:keyIndex -> digest. */
        final Map<String, String> lx = new HashMap<String, String>();
        final List<String> lxBad = new ArrayList<String>();

        Card add(Card c) {
            cards.add(c);
            return c;
        }

        Card get(String n) {
            for (Card c : cards) {
                if (c.name.equals(n)) {
                    return c;
                }
            }
            throw new IllegalArgumentException(n);
        }

        void observeVoucher(Card c, byte[] msg, byte[] d) {
            String key = c.name + ":" + Hex.u32(msg, 0);
            String prev = lx.put(key, Hex.x(d));
            if (prev != null && !prev.equals(Hex.x(d))) {
                lxBad.add("key " + key + " emitted two digests");
            }
        }
    }

    static Ctx lab2(long pUsd, long rUsd) {
        Ctx c = new Ctx();
        c.lab = new Lab();
        c.add(c.lab.card("P", c.lab.v1, pUsd, Hex.atoms(40), false));
        c.add(c.lab.card("R", c.lab.v2, rUsd, 0, false));
        return c;
    }

    static List<Scenario> scenarios() {
        List<Scenario> s = new ArrayList<Scenario>();
        s.add(new Scenario("tap (PIN-less)", "HELLO, PAY, CREDIT, ACK") {
            Ctx setup() {
                return lab2(Hex.atoms(200), Hex.atoms(10));
            }

            void run(Ctx c) {
                Phone.tap(c.get("P"), c.get("R"), 0, Hex.atoms(30));
            }
        });
        s.add(new Scenario("tap with PIN", "VERIFY_PIN, PAY above the PIN-less limit") {
            Ctx setup() {
                return lab2(Hex.atoms(300), 0);
            }

            void run(Ctx c) {
                Card p = c.get("P"), r = c.get("R");
                Phone.introduce(p, r);
                p.verifyPin(Lab.PIN);
                byte[] tr = p.pay(r.hello(0), Hex.atoms(80));
                p.ack(r.credit(tr));
            }
        });
        s.add(new Scenario("tap with an arm", "VERIFY_PIN with arm (own phone), card leaves the field, PAY uses the arm") {
            Ctx setup() {
                return lab2(Hex.atoms(300), 0);
            }

            void run(Ctx c) {
                Card p = c.get("P"), r = c.get("R");
                p.verifyPinArm(Lab.PIN, 0, Hex.atoms(150));
                ((SimCard) p.io).powerCycle();
                Phone.introduce(p, r);
                p.ack(r.credit(p.pay(r.hello(0), Hex.atoms(120))));
            }
        });
        s.add(new Scenario("tap in Winiwa (second currency)", "per-currency balance") {
            Ctx setup() {
                return lab2(Hex.atoms(10), 0);
            }

            void run(Ctx c) {
                Phone.tap(c.get("P"), c.get("R"), 1, Hex.atoms(15));
            }
        });
        s.add(new Scenario("cancel", "PAY, the TRANSFER is lost, CANCEL_PROOF, CANCEL") {
            Ctx setup() {
                return lab2(Hex.atoms(200), 0);
            }

            void run(Ctx c) {
                Card p = c.get("P"), r = c.get("R");
                Phone.introduce(p, r);
                byte[] tr = p.pay(r.hello(0), Hex.atoms(25));
                p.cancel(r.cancelProof(tr));
            }
        });
        s.add(new Scenario("fund", "FUND voucher k+1") {
            {
                inflowPerK = Hex.atoms(60);
            }

            Ctx setup() {
                Ctx c = lab2(Hex.atoms(100), 0);
                Card p = c.get("P");
                c.m.put("voucher", c.lab.v1.fundVoucher(p.chipId(), Lab.USDW, 2, Hex.atoms(160), Hex.atoms(60)));
                return c;
            }

            void run(Ctx c) {
                c.get("P").fund((byte[]) c.m.get("voucher"));
            }

            String finalCheck(Ctx c) {
                Card p = c.get("P");
                // the voucher was applied once, or not at all and is still applicable exactly once
                long before = p.balance(0);
                int sw = p.sw(Card.FUND, 0, 0, (byte[]) c.m.get("voucher"));
                long after = p.balance(0);
                if (before == Hex.atoms(160)) {
                    return sw == Card.SW_STALE && after == before ? "" : "an applied voucher was accepted again";
                }
                if (before == Hex.atoms(100)) {
                    int sw2 = p.sw(Card.FUND, 0, 0, (byte[]) c.m.get("voucher"));
                    return sw == Card.SW_OK && after == Hex.atoms(160) && sw2 == Card.SW_STALE ? ""
                        : "an unapplied voucher did not apply exactly once";
                }
                return "balance " + Hex.units(before);
            }
        });
        s.add(new Scenario("defund", "VERIFY_PIN, DEFUND (commit key + debit), DEFUND_READ x34") {
            {
                recoveryVerifiesPin = true;
            }

            Ctx setup() {
                return lab2(Hex.atoms(500), 0);
            }

            void run(Ctx c) {
                Card p = c.get("P");
                p.verifyPin(Lab.PIN);
                byte[] hdr = p.defund(0, Hex.atoms(40));
                c.observeVoucher(p, Hex.sub(hdr, 1, 52), Hex.sub(hdr, 53, 32));
                p.defundSignature(hdr[0]);
            }

            void recover(Ctx c) {
                Card p = c.get("P");
                // the phone re-reads every committed voucher (the same key and digest, the same signature)
                for (int v = 0; v < 4; v++) {
                    byte[] rec = p.voucherRecord(v);
                    if (rec[0] != 1) {
                        continue;
                    }
                    byte[] hdr = p.defundRead(v, 0xFF);
                    byte[] msg = Hex.sub(hdr, 1, 52), d = Hex.sub(hdr, 53, 32);
                    c.observeVoucher(p, msg, d);
                    byte[][] sig = p.defundSignature(v);
                    int ki = (int) Hex.u32(msg, 0);
                    if (!Lx16Ref.verify(Hex.sub(p.lxPubkey(ki), 160, 32), d, sig[0], sig[1])) {
                        c.lxBad.add("voucher " + v + " does not verify after the tear");
                    }
                }
                // and a second defund afterwards must use a fresh key index
                p.verifyPin(Lab.PIN);
                byte[] hdr = p.defund(0, Hex.atoms(1));
                c.observeVoucher(p, Hex.sub(hdr, 1, 52), Hex.sub(hdr, 53, 32));
                c.m.put("second", hdr);
            }

            String finalCheck(Ctx c) {
                Card p = c.get("P");
                byte[] second = (byte[]) c.m.get("second");
                long ki = Hex.u32(second, 1);
                byte[] used = ((SimCard) p.io).peekField(SimCard.AID_APPLET, "pKeyUsed");
                for (int v = 0; v < 4; v++) {
                    byte[] rec = p.voucherRecord(v);
                    if (rec[0] == 1) {
                        int i = Hex.u16(rec, 2);
                        if ((used[i >> 3] & (1 << (i & 7))) == 0) {
                            return "voucher key " + i + " not marked used";
                        }
                    }
                }
                return ki >= 1 ? "" : "bad key index";
            }
        });
        s.add(new Scenario("wrong PIN", "VERIFY_PIN with a wrong PIN") {
            Ctx setup() {
                return lab2(Hex.atoms(10), 0);
            }

            void run(Ctx c) {
                int sw = c.get("P").sw(Card.VERIFY_PIN, 0, 0, Hex.ascii("0000"));
                c.m.put("sw", sw);
            }

            String finalCheck(Ctx c) {
                Integer sw = (Integer) c.m.get("sw");
                int tries = c.get("P").state().pinTries;
                if (sw != null && (sw & 0xFFF0) == 0x63C0 && tries != 2) {
                    return "a wrong-PIN answer without a spent try";
                }
                return tries <= 3 && tries >= 2 ? "" : "tries " + tries;
            }
        });
        s.add(new Scenario("PUK unblock", "UNBLOCK_PIN with the vendor PUK after the PIN is blocked") {
            {
                pinMayReset = true;
            }

            Ctx setup() {
                Ctx c = lab2(Hex.atoms(10), 0);
                Card p = c.get("P");
                for (int i = 0; i < 3; i++) {
                    p.sw(Card.VERIFY_PIN, 0, 0, Hex.ascii("0000"));
                }
                return c;
            }

            void run(Ctx c) {
                c.get("P").unblock(Lab.PUK, Hex.ascii("4321"));
            }
        });
        s.add(new Scenario("wrong PUK", "UNBLOCK_PIN with a wrong PUK") {
            Ctx setup() {
                Ctx c = lab2(Hex.atoms(10), 0);
                for (int i = 0; i < 3; i++) {
                    c.get("P").sw(Card.VERIFY_PIN, 0, 0, Hex.ascii("0000"));
                }
                return c;
            }

            void run(Ctx c) {
                c.get("P").sw(Card.UNBLOCK_PIN, 0, 0, Hex.cat(Hex.ascii("00000000"), Hex.ascii("4321")));
            }
        });
        s.add(new Scenario("set limits", "VERIFY_PIN, SET_LIMITS") {
            Ctx setup() {
                return lab2(Hex.atoms(10), 0);
            }

            void run(Ctx c) {
                Card p = c.get("P");
                p.verifyPin(Lab.PIN);
                p.setLimits(0, Hex.atoms(900), Hex.atoms(100), Hex.atoms(20), Hex.atoms(60));
            }

            String finalCheck(Ctx c) {
                Card.Slot s = c.get("P").slot(0);
                boolean old = s.hold == 0 && s.perPay == 0 && s.plPay == Lab.PL_PAY && s.plTot == Lab.PL_TOT;
                boolean now = s.hold == Hex.atoms(900) && s.perPay == Hex.atoms(100) && s.plPay == Hex.atoms(20) && s.plTot == Hex.atoms(60);
                return old || now ? "" : "limits half written";
            }
        });
        s.add(new Scenario("change PIN", "VERIFY_PIN, CHANGE_PIN") {
            {
                pinMayReset = true;
            }

            Ctx setup() {
                return lab2(Hex.atoms(10), 0);
            }

            void run(Ctx c) {
                Card p = c.get("P");
                p.verifyPin(Lab.PIN);
                p.changePin(Hex.ascii("98765"));
            }

            String finalCheck(Ctx c) {
                Card p = c.get("P");
                ((SimCard) p.io).powerCycle();
                if (p.sw(Card.VERIFY_PIN, 0, 0, Lab.PIN) == Card.SW_OK) {
                    return "";
                }
                ((SimCard) p.io).powerCycle();
                return p.sw(Card.VERIFY_PIN, 0, 0, Hex.ascii("98765")) == Card.SW_OK ? "" : "neither PIN works";
            }
        });
        s.add(new Scenario("registry snapshot", "SNAP_BEGIN, SNAP_VENDORS, SNAP_REVOCATIONS, SNAP_COMMIT (new vendor, 2 revocations)") {
            Ctx setup() {
                Ctx c = lab2(Hex.atoms(10), 0);
                c.m.put("old", c.get("P").state().raw);
                c.lab.vendors.add(new Vendor("V3").entry());
                c.lab.revocations.add(Hex.sub(Hex.sha256(Hex.ascii("lost-1")), 0, 8));
                c.lab.revocations.add(Hex.sub(c.get("R").chipId(), 0, 8));
                c.lab.snapVersion++;
                return c;
            }

            void run(Ctx c) {
                c.lab.pushSnapshot(c.get("P"), c.lab.v2);
            }

            void recover(Ctx c) {
                Card p = c.get("P");
                if (p.state().snapVer != c.lab.snapVersion) {
                    c.lab.pushSnapshot(p, c.lab.v2);
                }
            }

            String finalCheck(Ctx c) {
                Card.State st = c.get("P").state();
                return st.snapVer == c.lab.snapVersion && st.revCount == 2 && st.vCount == 3 ? "" : "snapshot not applied atomically";
            }
        });
        s.add(new Scenario("swap receipt", "SWAP_EXPECT (buyer), VERIFY_PIN + PAY (seller), CREDIT releases s, ACK") {
            Ctx setup() {
                Ctx c = new Ctx();
                c.lab = new Lab();
                c.add(c.lab.card("U", c.lab.v1, 0, 0, false));
                c.add(c.lab.card("S", c.lab.v2, Hex.atoms(300), 0, false));
                return c;
            }

            void run(Ctx c) {
                Card u = c.get("U"), s = c.get("S");
                byte[] r = u.swapExpect(0, Hex.atoms(100));
                c.m.put("h", Hex.sub(r, 0, 32));
                Phone.introduce(s, u);
                s.verifyPin(Lab.PIN);
                byte[] tr = s.pay(Hex.sub(r, 32, r.length - 32), Hex.atoms(100));
                byte[] ack = u.credit(tr);
                c.m.put("ack", ack);
                s.ack(ack);
            }

            String finalCheck(Ctx c) {
                Card u = c.get("U");
                byte[] h = (byte[]) c.m.get("h");
                if (h == null) {
                    return "";
                }
                boolean credited = u.balance(0) == Hex.atoms(100);
                Card.State st = u.state();
                if (credited != st.swapPaid) {
                    return "swap paid flag disagrees with the credit";
                }
                return "";
            }
        });
        s.add(new Scenario("receive tickets", "ISSUE_TICKETS, GET_TICKET, PAY at the till, CREDIT when loading") {
            Ctx setup() {
                Ctx c = new Ctx();
                c.lab = new Lab();
                c.add(c.lab.card("M", c.lab.v1, 0, 0, false));
                c.add(c.lab.card("P", c.lab.v2, Hex.atoms(100), 0, false));
                return c;
            }

            void run(Ctx c) {
                Card m = c.get("M"), p = c.get("P");
                long[] rng = m.issueTickets(0, 3, null, false);
                byte[] tk = m.ticket(rng[0]);
                p.peer(m.cert());
                byte[] tr = p.pay(tk, Hex.atoms(20));
                m.peer(p.cert());
                m.credit(tr);
            }
        });
        // ---------------------------------------------------------------- gap fixes of 2026-09-29
        s.add(new Scenario("defund twice, chain out of order", "VERIFY_PIN, DEFUND, DEFUND_READ x34, twice; the newer voucher "
            + "reaches the chain first, the older one late") {
            {
                recoveryVerifiesPin = true;
            }

            Ctx setup() {
                return lab2(Hex.atoms(500), 0);
            }

            void run(Ctx c) {
                Card p = c.get("P");
                p.verifyPin(Lab.PIN);
                byte[] h1 = p.defund(0, Hex.atoms(40));
                c.observeVoucher(p, Hex.sub(h1, 1, 52), Hex.sub(h1, 53, 32));
                byte[][] s1 = p.defundSignature(h1[0]);
                p.verifyPin(Lab.PIN);
                byte[] h2 = p.defund(0, Hex.atoms(25));
                c.observeVoucher(p, Hex.sub(h2, 1, 52), Hex.sub(h2, 53, 32));
                byte[][] s2 = p.defundSignature(h2[0]);
                post(p, h2, s2);
                post(p, h1, s1);
            }

            void post(Card p, byte[] hdr, byte[][] sig) {
                byte[] msg = Hex.sub(hdr, 1, 52);
                byte[] pk = Hex.sub(p.lxPubkey((int) Hex.u32(msg, 0)), 160, 32);
                ChainModel.post(p.chipId(), msg, sig[0], sig[1], pk);
            }

            void recover(Ctx c) {
                Card p = c.get("P");
                // the phone re-reads every voucher still in the chip's ring and posts each one, newest first
                for (int vi : ChainModel.vouchersNewestFirst(p)) {
                    byte[] hdr = p.defundRead(vi, 0xFF);
                    c.observeVoucher(p, Hex.sub(hdr, 1, 52), Hex.sub(hdr, 53, 32));
                    ChainModel.post(p, vi);
                }
                // once: a later defund is still paid in full after the late and the refused vouchers
                if (c.m.get("third") == null) {
                    c.m.put("third", Boolean.TRUE);
                    p.verifyPin(Lab.PIN);
                    byte[] h3 = p.defund(0, Hex.atoms(1));
                    c.observeVoucher(p, Hex.sub(h3, 1, 52), Hex.sub(h3, 53, 32));
                    ChainModel.post(p, h3[0]);
                }
            }

            String finalCheck(Ctx c) {
                Card p = c.get("P");
                long debited = p.slot(0).defunded, paid = ChainModel.paid(p);
                return paid == debited ? "" : "the chain paid " + Hex.units(paid) + " for " + Hex.units(debited) + " debited ("
                    + ChainModel.log(p) + ")";
            }
        });
        s.add(new Scenario("receive ticket used by two payers", "ISSUE_TICKETS, GET_TICKET, PAY by two payers on ONE ticket, "
            + "CREDIT both when loading") {
            Ctx setup() {
                Ctx c = new Ctx();
                c.lab = new Lab();
                c.add(c.lab.card("M", c.lab.v1, 0, 0, false));
                c.add(c.lab.card("P1", c.lab.v2, Hex.atoms(100), 0, false));
                c.add(c.lab.card("P2", c.lab.v2, Hex.atoms(100), 0, false));
                return c;
            }

            void run(Ctx c) {
                Card m = c.get("M"), p1 = c.get("P1"), p2 = c.get("P2");
                long[] rng = m.issueTickets(0, 2, null, false);
                byte[] tk = m.ticket(rng[0]);
                p1.peer(m.cert());
                byte[] t1 = p1.pay(tk, Hex.atoms(20));
                p2.peer(m.cert());
                byte[] t2 = p2.pay(tk, Hex.atoms(10));
                m.peer(p1.cert());
                m.credit(t1);
                m.peer(p2.cert());
                m.credit(t2);
            }

            String finalCheck(Ctx c) {
                // with the merchant's card present, every ticket payment a payer's card committed must load: none may
                // end cancelled (restored) because another payer used the same ticket
                for (String n : new String[] { "P1", "P2" }) {
                    for (Card.Pending p : c.get(n).pendings()) {
                        if (p.status == 3) {
                            return n + "'s payment was cancelled instead of loading";
                        }
                    }
                }
                long mb = c.get("M").balance(0);
                long paid = Hex.atoms(200) - c.get("P1").balance(0) - c.get("P2").balance(0);
                return mb == paid ? "" : "merchant " + Hex.units(mb) + " but the payers paid " + Hex.units(paid);
            }
        });
        return s;
    }

    // ================================================================ state snapshots and invariants
    static final class Snap {
        final Map<String, long[]> counters = new LinkedHashMap<String, long[]>();
        final long[] totals = new long[SLOTS];
        final Map<String, byte[]> keyUsed = new HashMap<String, byte[]>();
        String totalsText = "";
    }

    /** n, mNext, keyNext, snapVer, revCount, pinTries, pukTries, k0, k1 per card. */
    static Snap snap(Ctx c) {
        Snap s = new Snap();
        for (Card x : c.cards) {
            Card.State st = x.state();
            s.counters.put(x.name, new long[] { st.n, st.mNext, st.keyNext, st.snapVer, st.revCount, st.pinTries, st.pukTries,
                x.slot(0).k, x.slot(1).k });
            s.keyUsed.put(x.name, ((SimCard) x.io).peekField(SimCard.AID_APPLET, "pKeyUsed"));
        }
        StringBuilder sb = new StringBuilder();
        for (int slot = 0; slot < SLOTS; slot++) {
            Audit.Total t = Audit.total(c.cards, slot);
            s.totals[slot] = t.total();
            sb.append(slot == 0 ? "USDw " : "; Winiwa ").append(t);
        }
        s.totalsText = sb.toString();
        return s;
    }

    static final String[] CNAMES = { "n", "m", "LX16 next key", "snapshot version", "revocations", "PIN tries", "PUK tries",
        "k (USDw)", "k (Winiwa)" };

    /** I2: counters never go back; PIN/PUK tries never come back (unless a right PIN/PUK legitimately reset them). */
    static String counters(Snap before, Snap after, boolean pinMayReset) {
        return counters(before, after, pinMayReset, true);
    }

    static String counters(Snap before, Snap after, boolean pinMayReset, boolean checkTries) {
        for (String card : before.counters.keySet()) {
            long[] a = before.counters.get(card), b = after.counters.get(card);
            for (int i = 0; i < a.length; i++) {
                boolean tries = i == 5 || i == 6;
                if (tries) {
                    if (checkTries && b[i] > a[i] && !(pinMayReset && (b[i] == 3 || b[i] == 10))) {
                        return card + " " + CNAMES[i] + " came back " + a[i] + " -> " + b[i];
                    }
                } else if (b[i] < a[i]) {
                    return card + " " + CNAMES[i] + " went back " + a[i] + " -> " + b[i];
                }
            }
            byte[] ua = before.keyUsed.get(card), ub = after.keyUsed.get(card);
            for (int j = 0; j < ua.length; j++) {
                if ((ua[j] & ~ub[j]) != 0) {
                    return card + " LX16 used-key bitmap went back";
                }
            }
        }
        return "";
    }

    /** I3: one digest per key, each committed voucher's key marked used and below the next index. */
    static String lx16(Ctx c) {
        if (!c.lxBad.isEmpty()) {
            return String.join("; ", c.lxBad);
        }
        for (Card x : c.cards) {
            byte[] used = ((SimCard) x.io).peekField(SimCard.AID_APPLET, "pKeyUsed");
            int next = x.state().keyNext;
            for (int v = 0; v < 4; v++) {
                byte[] rec = x.voucherRecord(v);
                if (rec[0] != 1) {
                    continue;
                }
                int i = Hex.u16(rec, 2);
                if (i >= next || (used[i >> 3] & (1 << (i & 7))) == 0) {
                    return x.name + " voucher key " + i + " not marked used";
                }
                String seen = c.lx.get(x.name + ":" + i);
                String stored = Hex.x(Hex.sub(rec, 56, 32));
                if (seen != null && !seen.equals(stored)) {
                    return x.name + " key " + i + " stored digest differs from an emitted one";
                }
            }
        }
        return "";
    }

    /** I4: nothing pending; each acknowledged transfer credited once by its receiver; each cancelled one never. */
    static String creditedOnce(Ctx c) {
        for (Card x : c.cards) {
            for (Card.Pending p : x.pendings()) {
                boolean credited = Audit.creditedBy(c.cards, p.wire);
                if (p.status == 1) {
                    return x.name + " transfer n=" + Hex.u32(p.wire, Wire.X_N) + " still pending after recovery";
                }
                if (p.status == 2 && !credited) {
                    return x.name + " acknowledged transfer not credited";
                }
                if (p.status == 3 && credited) {
                    return x.name + " transfer both credited and cancelled";
                }
            }
        }
        return "";
    }

    // ================================================================ runs
    static final class Row {
        String scenario, cut, step, site, tx, i1 = "pass", i2 = "pass", i3 = "pass", i4 = "pass", outcome, note = "";

        boolean pass() {
            return i1.equals("pass") && i2.equals("pass") && i3.equals("pass") && i4.equals("pass") && note.isEmpty();
        }
    }

    static Row runOne(Scenario s, int tearAt, int cutAfter, boolean power, Object[] point) {
        Row row = new Row();
        row.scenario = s.name;
        Ctx c = s.setup();
        Snap pre = snap(c);
        TearControl.reset();
        SimCard.globalApdus = 0;
        TearControl.tearAt(tearAt);
        SimCard.cutAfter = cutAfter;
        SimCard.cutPower = power;
        String outcome = "completed";
        try {
            s.run(c);
        } catch (SimCard.Torn e) {
            outcome = "power cut on " + e.card;
        } catch (SimCard.Cut e) {
            outcome = e.getMessage();
        } catch (Card.Err e) {
            outcome = "then refused: " + e.getMessage();
        }
        TearControl.tearAt(-1);
        SimCard.cutAfter = -1;
        row.outcome = outcome;
        if (tearAt >= 0 && !outcome.startsWith("power cut")) {
            row.note = "planned cut was not reached";
        }
        try {
            Snap mid = snap(c);
            for (int slot = 0; slot < SLOTS; slot++) {
                if (mid.totals[slot] > pre.totals[slot] + inflow(s, pre, mid, slot)) {
                    row.i1 = "FAIL after tear: " + mid.totalsText;
                }
            }
            String k = counters(pre, mid, s.pinMayReset);
            if (!k.isEmpty()) {
                row.i2 = "FAIL after tear: " + k;
            }
            String l = lx16(c);
            if (!l.isEmpty()) {
                row.i3 = "FAIL after tear: " + l;
            }
            s.recover(c);
            Snap post = snap(c);
            for (int slot = 0; slot < SLOTS; slot++) {
                long want = pre.totals[slot] + inflow(s, pre, post, slot);
                if (post.totals[slot] != want && !s.name.equals("defund")) {
                    row.i1 = "FAIL after recovery: " + post.totalsText + " (before: " + pre.totalsText + ")";
                }
                if (post.totals[slot] > want) {
                    row.i1 = "FAIL after recovery: value created: " + post.totalsText;
                }
            }
            if (s.name.equals("defund") && post.totals[0] != pre.totals[0]) {
                row.i1 = "FAIL after recovery: balance + vouchers " + post.totalsText + " vs " + pre.totalsText;
            }
            k = counters(mid, post, s.pinMayReset, !s.recoveryVerifiesPin);
            if (k.isEmpty()) {
                k = counters(pre, post, s.pinMayReset, !s.recoveryVerifiesPin);
            }
            if (!k.isEmpty()) {
                row.i2 = "FAIL after recovery: " + k;
            }
            l = lx16(c);
            if (!l.isEmpty()) {
                row.i3 = "FAIL after recovery: " + l;
            }
            String once = creditedOnce(c);
            // a redundant second recovery, and every acknowledged transfer re-sent once more, must change nothing
            Map<String, String> bal1 = balances(c);
            s.recover(c);
            for (Card x : c.cards) {
                for (Card.Pending p : x.pendings()) {
                    if (p.status == 2) {
                        byte[] rid = Hex.sub(p.wire, Wire.X_RID, 32);
                        for (Card r : c.cards) {
                            if (Arrays.equals(r.chipId(), rid)) {
                                r.peer(x.cert());
                                r.credit(p.wire);
                            }
                        }
                    }
                }
            }
            Snap again = snap(c);
            if (once.isEmpty() && !Arrays.equals(again.totals, post.totals)) {
                once = "a second recovery changed the totals";
            }
            if (once.isEmpty() && !bal1.equals(balances(c)) && !s.name.equals("defund")) {
                once = "a second recovery or a re-sent transfer changed a balance: " + bal1 + " -> " + balances(c);
            }
            if (!once.isEmpty()) {
                row.i4 = "FAIL: " + once;
            }
            String fin = s.finalCheck(c);
            if (!fin.isEmpty()) {
                row.note = fin;
            }
        } catch (Exception e) {
            row.note = "harness error: " + e;
        }
        if (!TearControl.violations().isEmpty()) {
            row.note = row.note + " persistence violations: " + TearControl.violations();
            TearControl.violations().clear();
        }
        return row;
    }

    /** Chain-backed value legitimately brought in by FUND vouchers between two snapshots (slot 0 only). */
    static long inflow(Scenario s, Snap a, Snap b, int slot) {
        if (s.inflowPerK == 0 || slot != 0) {
            return 0;
        }
        long steps = 0;
        for (String card : a.counters.keySet()) {
            steps += b.counters.get(card)[7] - a.counters.get(card)[7];
        }
        return steps * s.inflowPerK;
    }

    private static Map<String, String> balances(Ctx c) {
        Map<String, String> m = new LinkedHashMap<String, String>();
        for (Card x : c.cards) {
            m.put(x.name, Hex.units(x.balance(0)) + "/" + Hex.units(x.balance(1)));
        }
        return m;
    }

    public static final class Result {
        public final List<Row> rows = new ArrayList<Row>();
        public final Map<String, int[]> perScenario = new LinkedHashMap<String, int[]>();
        public int maxTxBytes;
        public String maxTxSite;
    }

    public static Result run() {
        return run("");
    }

    /** Runs the scenarios whose name contains filter, or one of its "|"-separated parts (all when empty). */
    public static Result run(String filter) {
        Result res = new Result();
        for (Scenario s : scenarios()) {
            boolean match = filter.isEmpty();
            for (String part : filter.split("\\|")) {
                if (!part.isEmpty() && s.name.contains(part)) {
                    match = true;
                }
            }
            if (!match) {
                continue;
            }
            // 1. enumeration
            Ctx c0 = s.setup();
            TearControl.reset();
            SimCard.globalApdus = 0;
            TearControl.recording(true);
            String refusedRun = null;
            try {
                s.run(c0);
            } catch (Card.Err e) {
                refusedRun = e.getMessage(); // an applet that refuses its own uninterrupted scenario fails it (below)
            }
            TearControl.recording(false);
            if (refusedRun != null) {
                Row r = new Row();
                r.scenario = s.name;
                r.cut = "none (uninterrupted run)";
                r.step = "-";
                r.site = "-";
                r.tx = "-";
                r.outcome = "refused";
                r.note = "the uninterrupted scenario was refused: " + refusedRun;
                res.rows.add(r);
            }
            if (!TearControl.violations().isEmpty()) {
                Row r = new Row();
                r.scenario = s.name;
                r.cut = "none (enumeration run)";
                r.step = "-";
                r.site = "-";
                r.tx = "-";
                r.outcome = "completed";
                r.note = "persistence violations: " + TearControl.violations();
                res.rows.add(r);
                TearControl.violations().clear();
            }
            List<Object[]> points = TearControl.points();
            int apdus = SimCard.globalApdus;
            int writes = TearControl.writes();
            System.out.println(String.format("  %-34s %3d write points, %3d APDUs", s.name, writes, apdus));
            int[] counts = new int[3];
            if (refusedRun != null) {
                counts[2]++;
            }
            // 2. a power cut before every write point
            for (Object[] p : points) {
                int k = (Integer) p[0];
                Row r = runOne(s, k, -1, false, p);
                r.cut = "power cut before write " + k;
                r.step = (String) p[3];
                r.site = p[1] + " " + p[2] + " (" + p[4] + " B)";
                r.tx = ((Boolean) p[5]) ? "in tx" : "atomic";
                res.rows.add(r);
                counts[0]++;
                if (!r.pass()) {
                    counts[2]++;
                }
            }
            // 3. between APDUs: response lost, and power lost after the response
            for (int i = 1; i <= apdus; i++) {
                for (boolean power : new boolean[] { false, true }) {
                    Row r = runOne(s, -1, i, power, null);
                    r.cut = (power ? "power lost after APDU " : "response lost from APDU ") + i;
                    r.step = r.outcome.replace("response lost from ", "").replace("power lost after the response of ", "");
                    r.site = "-";
                    r.tx = "-";
                    res.rows.add(r);
                    counts[1]++;
                    if (!r.pass()) {
                        counts[2]++;
                    }
                }
            }
            res.perScenario.put(s.name + "|" + s.covers + "|" + writes + "|" + apdus, counts);
        }
        res.maxTxBytes = TearControl.maxTxBytes();
        res.maxTxSite = TearControl.maxTxSite();
        return res;
    }

    public static String markdown(Result res) {
        StringBuilder sb = new StringBuilder();
        int pass = 0;
        for (Row r : res.rows) {
            if (r.pass()) {
                pass++;
            }
        }
        sb.append("# Tear harness results (jCardSim, instrumented build)\n\n");
        sb.append("Simulator only. The instrumented Persist layer models Java Card transaction semantics (journal and roll back "
            + "at a tear); it is not evidence about a card's EEPROM. See docs/simulator-status.md for the limits.\n\n");
        sb.append("**").append(pass).append(" of ").append(res.rows.size()).append(" interruption points pass all four invariants.**\n\n");
        sb.append("Largest single transaction: ").append(res.maxTxBytes).append(" bytes written (").append(res.maxTxSite)
            .append("); the applet's install self-test requires a commit buffer of at least ")
            .append(512).append(" bytes.\n\n");
        sb.append("## Summary per scenario\n\n| Scenario | Commands covered | Write points | APDUs | Cuts before a write | Cuts between APDUs | Failures |\n|---|---|---|---|---|---|---|\n");
        for (Map.Entry<String, int[]> e : res.perScenario.entrySet()) {
            String[] k = e.getKey().split("\\|");
            int[] v = e.getValue();
            sb.append("| ").append(k[0]).append(" | ").append(k[1]).append(" | ").append(k[2]).append(" | ").append(k[3])
                .append(" | ").append(v[0]).append(" | ").append(v[1]).append(" | ").append(v[2]).append(" |\n");
        }
        sb.append("\n## Every interruption point\n\nI1 value conserved; I2 counters monotonic (and no PIN try given back); "
            + "I3 no LX16 key reused; I4 torn tap credited once.\n\n");
        sb.append("| # | Scenario | Interruption | APDU | Write (kind, source line, bytes) | Tx | I1 | I2 | I3 | I4 | Result | After the cut |\n");
        sb.append("|---|---|---|---|---|---|---|---|---|---|---|---|\n");
        int i = 1;
        for (Row r : res.rows) {
            sb.append("| ").append(i++).append(" | ").append(r.scenario).append(" | ").append(r.cut).append(" | ").append(r.step)
                .append(" | ").append(r.site).append(" | ").append(r.tx).append(" | ").append(r.i1).append(" | ").append(r.i2)
                .append(" | ").append(r.i3).append(" | ").append(r.i4).append(" | ").append(r.pass() ? "pass" : "**FAIL** " + r.note)
                .append(" | ").append(r.outcome.replace("|", "/")).append(" |\n");
        }
        return sb.toString();
    }
}
