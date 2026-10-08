package org.stables.host;

import java.util.Arrays;

import org.stables.card.BenchApplet;
import org.stables.card.StablesApplet;

/**
 * jCardSim unit tests: every command of the applet, success and refusal paths, the install self-test, and off-card
 * verification of the chip's signatures (P-256 with the JDK's SunEC; LX16 with the Java port of measure/ots.mjs).
 * Runs against whichever build is on the class path: build/sim-card (as shipped) or build/sim-tear (instrumented).
 */
public final class UnitTests {
    private UnitTests() { }

    static final long U = Hex.atoms(1);

    public static T run() {
        T t = new T("unit tests");
        install(t);
        perso(t);
        pin(t);
        peer(t);
        payments(t);
        cancel(t);
        tickets(t);
        swap(t);
        fund(t);
        defund(t);
        snapshots(t);
        refusals(t);
        bench(t);
        return t;
    }

    static void install(T t) {
        Lab lab = new Lab();
        Card a = lab.card("A", lab.v1, Hex.atoms(500), Hex.atoms(100));
        t.test("install", "self-test: all 8 checks pass (SHA-256, AES-256, ECDSA KAT, refusal, round trip, random, LX16 labels, commit buffer)",
            () -> T.eq(0xFF, a.state().selfTest, "self-test bits"));
        t.test("install", "chip id = SHA-256(on-card public key)", () -> T.yes(Arrays.equals(a.chipId(), Hex.sha256(a.pubkey())), "chip id"));
        t.test("install", "first LX16 key index is 1 (index 0 can never pass D1: i > u, u = 0 at registration)",
            () -> T.eq(1, a.state().keyNext, "key next"));
        t.test("install", "lifecycle active after PERSO_LOCK", () -> T.eq((byte) 1, a.state().life, "life"));
        t.test("install", "a failed self-test (a card reporting a 100-byte commit buffer) installs inert: GET_STATE shows which check "
            + "failed, every other command is refused", () -> {
            com.licel.jcardsim.base.SimulatorRuntime small = new com.licel.jcardsim.base.SimulatorRuntime() {
                @Override
                public short getMaxCommitCapacity() {
                    return 100;
                }
            };
            SimCard sc = new SimCard("small-commit", small);
            sc.install(SimCard.AID_APPLET, StablesApplet.class);
            sc.select(SimCard.AID_APPLET);
            Card f = new Card(sc);
            Card.State st = f.state();
            T.eq(0x7F, st.life & 0xFF, "lifecycle");
            T.eq(0xFF & ~0x80, st.selfTest, "every check passes except the commit buffer");
            T.eq(100, st.commitCap, "commit capacity recorded");
            T.eq(0x69B4, f.sw(Card.PERSO_SET_PIN, 0, 0, Lab.PIN), "personalisation refused");
            T.eq(0x69B4, f.sw(Card.GET_PUBKEY, 0, 0, null), "everything else refused");
        });
        t.test("install", "every simulated card has its own device key and LX16 seed (guards the jCardSim random shim)", () -> {
            Card b = lab.card("B", lab.v1, 0, 0);
            T.yes(!Arrays.equals(a.pubkey(), b.pubkey()), "device keys differ");
            T.yes(!Arrays.equals(a.lxPubkey(1), b.lxPubkey(1)), "LX16 keys differ");
        });
        t.test("state", "GET_STATE parts 0 to 6 answer; an unknown part is refused", () -> {
            a.state();
            a.slot(0);
            a.pendings();
            a.voucherRecord(0);
            a.nonce(0);
            a.call(Card.GET_STATE, 5, 0, null);
            a.creditLog();
            T.eq(0x6A86, a.sw(Card.GET_STATE, 9, 0, null), "unknown part");
        });
        t.test("state", "GET_PUBKEY: 65-byte uncompressed P-256 point", () -> {
            byte[] p = a.pubkey();
            T.eq(65, p.length, "length");
            T.eq((byte) 4, p[0], "prefix");
            Wire.pubKey(p);
        });
        t.test("state", "GET_CERT: vendor certificate over the on-card key verifies off card (SunEC)", () -> {
            byte[] cert = a.cert();
            T.yes(Arrays.equals(Hex.sub(cert, Wire.CERT_PUB, 65), a.pubkey()), "cert carries the chip key");
            T.yes(Arrays.equals(Hex.sub(cert, Wire.CERT_VID, 8), lab.v1.id), "cert names the vendor");
            T.yes(Wire.verifyWire(lab.v1.pub, cert), "vendor signature");
        });
        t.test("state", "LX_PUBKEY: chunk digests hash to pk; index 1024 refused", () -> {
            byte[] r = a.lxPubkey(3);
            T.eq(192, r.length, "length");
            byte[][] cds = new byte[5][];
            for (int c = 0; c < 5; c++) {
                cds[c] = Hex.sub(r, c * 32, 32);
            }
            T.yes(Arrays.equals(Lx16Ref.pkOf(cds), Hex.sub(r, 160, 32)), "pk");
            T.eq(Card.SW_WRONG_DATA, a.sw(Card.LX_PUBKEY, 0, 0, Hex.u16(1024)), "index 1024");
        });
        t.test("state", "no sign-anything: no instruction outside the documented set is accepted", () -> {
            for (int ins = 0; ins < 256; ins += 2) {
                boolean known = Arrays.asList(0x10, 0x12, 0x14, 0x16, 0x20, 0x22, 0x24, 0x26, 0x30, 0x32, 0x34, 0x36, 0x38, 0x3A,
                    0x3C, 0x3E, 0x40, 0x42, 0x44, 0x50, 0x52, 0x54, 0x60, 0x62, 0x64, 0x66, 0x70, 0x72, 0x74, 0x76, 0x78, 0x7A).contains(ins);
                if (!known && ins != 0xA4) {
                    T.eq(0x6D00, a.sw(ins, 0, 0, Hex.h("00112233")), "INS " + Integer.toHexString(ins));
                }
            }
        });
    }

    static void perso(T t) {
        Lab lab = new Lab();
        t.test("perso", "PERSO commands refused after lock; payment commands refused before lock", () -> {
            Card a = lab.card("A", lab.v1, Hex.atoms(10), 0);
            T.eq(Card.SW_LIFECYCLE, a.sw(Card.PERSO_SET_PIN, 0, 0, Lab.PIN), "PIN after lock");
            T.eq(Card.SW_LIFECYCLE, a.sw(Card.PERSO_ADD_CURRENCY, 0, 0, new byte[49]), "currency after lock");
            T.eq(Card.SW_LIFECYCLE, a.sw(Card.PERSO_LOCK, 0, 0, null), "lock twice");
            SimCard sc = new SimCard("fresh");
            sc.install(SimCard.AID_APPLET, StablesApplet.class);
            sc.select(SimCard.AID_APPLET);
            Card f = new Card(sc);
            T.eq(Card.SW_LIFECYCLE, f.sw(Card.HELLO, 0, 0, null), "HELLO before lock");
            T.eq(Card.SW_LIFECYCLE, f.sw(Card.PERSO_LOCK, 0, 0, null), "lock with nothing set");
            f.persoIssuer(lab.v1.entry());
            T.eq(Card.SW_BAD_SIGNATURE, f.sw(Card.PERSO_SET_CERT, 0, 0, Hex.cat(new byte[] { 70 }, Arrays.copyOf(lab.v2.certify(f.pubkey()), 70))),
                "certificate from another vendor");
            f.persoCert(lab.v1.certify(f.pubkey()));
            f.persoCurrency(Lab.USDW, Lab.PL_PAY, Lab.PL_TOT, true);
            T.eq(Card.SW_WRONG_DATA, f.sw(Card.PERSO_ADD_CURRENCY, 0, 0,
                Hex.cat(Lab.USDW, Hex.u64(1), Hex.u64(1), new byte[] { 0 })), "same currency twice");
            T.eq(Card.SW_WRONG_DATA, f.sw(Card.PERSO_ADD_CURRENCY, 0, 0,
                Hex.cat(Lab.WINIWA, Hex.u64(1), Hex.u64(1), new byte[] { 2 })), "a second chain currency");
            T.eq(Card.SW_LIFECYCLE, f.sw(Card.PERSO_LOCK, 0, 0, null), "lock without PIN and PUK");
            f.persoPin(Lab.PIN);
            f.persoPuk(Lab.PUK);
            f.fund(lab.v1.fundVoucher(f.chipId(), Lab.USDW, 1, Hex.atoms(5), Hex.atoms(5)));
            f.persoLock();
            T.eq(Hex.atoms(5), f.balance(0), "pre-load at manufacture");
        });
    }

    static void pin(T t) {
        Lab lab = new Lab();
        Card a = lab.card("A", lab.v1, Hex.atoms(500), 0);
        t.test("pin", "VERIFY_PIN: right PIN; wrong PIN counts down 63C2, 63C1, 63C0, then blocked 6983", () -> {
            a.verifyPin(Lab.PIN);
            T.eq(3, a.state().pinTries, "tries");
            T.eq(0x63C2, a.sw(Card.VERIFY_PIN, 0, 0, Hex.ascii("9999")), "wrong 1");
            T.eq(0x63C1, a.sw(Card.VERIFY_PIN, 0, 0, Hex.ascii("9999")), "wrong 2");
            T.eq(0x63C0, a.sw(Card.VERIFY_PIN, 0, 0, Hex.ascii("9999")), "wrong 3");
            T.eq(Card.SW_PIN_BLOCKED, a.sw(Card.VERIFY_PIN, 0, 0, Lab.PIN), "blocked, even the right PIN");
        });
        t.test("pin", "UNBLOCK_PIN: wrong PUK counts down; the vendor PUK sets a new PIN", () -> {
            T.eq(0x63C9, a.sw(Card.UNBLOCK_PIN, 0, 0, Hex.cat(Hex.ascii("00000000"), Hex.ascii("5555"))), "wrong PUK");
            a.unblock(Lab.PUK, Hex.ascii("5555"));
            T.eq(3, a.state().pinTries, "tries restored");
            T.eq(10, a.state().pukTries, "PUK tries restored");
            a.verifyPin(Hex.ascii("5555"));
        });
        t.test("pin", "CHANGE_PIN needs the PIN in this session", () -> {
            SimCard sc = (SimCard) a.io;
            sc.powerCycle();
            T.eq(Card.SW_PIN_REQUIRED, a.sw(Card.CHANGE_PIN, 0, 0, Hex.ascii("1234")), "no PIN");
            a.verifyPin(Hex.ascii("5555"));
            a.changePin(Hex.ascii("1234"));
            T.eq(0x63C2, a.sw(Card.VERIFY_PIN, 0, 0, Hex.ascii("5555")), "old PIN");
            a.verifyPin(Lab.PIN);
        });
        t.test("pin", "SET_LIMITS needs the PIN, may lower the PIN-less allowances, never raise them", () -> {
            ((SimCard) a.io).powerCycle();
            T.eq(Card.SW_PIN_REQUIRED, a.sw(Card.SET_LIMITS, 0, 0, new byte[32]), "no PIN");
            a.verifyPin(Lab.PIN);
            T.eq(Card.SW_LIMIT, a.sw(Card.SET_LIMITS, 0, 0,
                Hex.cat(Hex.u64(0), Hex.u64(0), Hex.u64(Hex.atoms(60)), Hex.u64(Lab.PL_TOT))), "raise PIN-less");
            a.setLimits(0, 0, Hex.atoms(200), Hex.atoms(20), Hex.atoms(40));
            Card.Slot s = a.slot(0);
            T.eq(Hex.atoms(20), s.plPay, "PIN-less per payment lowered");
            T.eq(Hex.atoms(200), s.perPay, "per-payment limit");
        });
    }

    static void peer(T t) {
        Lab lab = new Lab();
        Card a = lab.card("A", lab.v1, Hex.atoms(100), 0);
        Card b = lab.card("B", lab.v2, Hex.atoms(100), 0);
        Card f = lab.card("F", lab.foreign, Hex.atoms(100), 0);
        t.test("peer", "PEER accepts a certificate from an accepted vendor (either one)", () -> {
            T.yes(Arrays.equals(a.peer(b.cert()), b.chipId()), "returns the peer's chip id");
            T.yes(Arrays.equals(b.peer(a.cert()), a.chipId()), "and the other way");
        });
        t.test("peer", "PEER refuses a certificate from a vendor not on the list (69A2)",
            () -> T.eq(Card.SW_FOREIGN_VENDOR, a.sw(Card.PEER, 0, 0, f.cert()), "foreign"));
        t.test("peer", "PEER refuses a software key with a self-made certificate (69A2)", () -> {
            Vendor fake = new Vendor("self-made");
            Vendor chipKey = new Vendor("software chip key");
            byte[] body = fake.certBody(chipKey.pub);
            T.eq(Card.SW_FOREIGN_VENDOR, a.sw(Card.PEER, 0, 0, Wire.signed(body, fake.sign(body))), "self-made");
        });
        t.test("peer", "PEER refuses a certificate whose chip key was swapped (69A3)", () -> {
            byte[] cert = b.cert();
            byte[] other = new Vendor("x").pub;
            System.arraycopy(other, 0, cert, Wire.CERT_PUB, 65);
            T.eq(Card.SW_BAD_SIGNATURE, a.sw(Card.PEER, 0, 0, cert), "swapped key");
        });
    }

    static void payments(T t) {
        Lab lab = new Lab();
        Card p = lab.card("P", lab.v1, Hex.atoms(500), Hex.atoms(100));
        Card r = lab.card("R", lab.v2, Hex.atoms(50), 0);
        Card c = lab.card("C", lab.v1, Hex.atoms(50), 0);
        t.test("pay", "HELLO: signed by the receiver (SunEC), fresh nonce, unlimited capacity with no holding limit", () -> {
            byte[] h1 = r.hello(0), h2 = r.hello(0);
            T.yes(Wire.verifyWire(r.pubkey(), h1), "HELLO signature");
            T.eq(Hex.u32(h1, Wire.H_M) + 1, Hex.u32(h2, Wire.H_M), "nonce increments");
            T.eq(0x7FFFFFFFFFFFFFFFL, Hex.u64(h1, Wire.H_CAP), "capacity");
            T.eq(Card.SW_CURRENCY, r.sw(Card.HELLO, 3, 0, null), "empty slot");
        });
        t.test("pay", "full tap: PAY commits then emits a TRANSFER (SunEC-valid), CREDIT credits, ACK clears", () -> {
            Phone.introduce(p, r);
            byte[] hello = r.hello(0);
            long n0 = p.state().n;
            byte[] transfer = p.pay(hello, Hex.atoms(30));
            T.yes(Wire.verifyWire(p.pubkey(), transfer), "TRANSFER signature");
            T.eq(n0 + 1, Hex.u32(transfer, Wire.X_N), "signed counter n");
            T.eq(Hex.atoms(470), Hex.u64(transfer, Wire.X_BAL), "balance after, signed (hook)");
            T.eq(Hex.atoms(470), p.balance(0), "payer debited at commit");
            T.eq(1, p.pendings().get(0).status, "pending entry");
            byte[] ack = r.credit(transfer);
            T.yes(Wire.verifyWire(r.pubkey(), ack), "ACK signature");
            T.eq(Hex.atoms(80), r.balance(0), "receiver credited");
            p.ack(ack);
            T.eq(2, p.pendings().get(0).status, "acknowledged");
            p.ack(ack); // idempotent
            T.eq(Hex.atoms(80), r.balance(0), "credited once");
            byte[] again = r.credit(transfer);
            T.yes(Arrays.equals(Wire.body(again), Wire.body(ack)), "a re-sent transfer re-issues the ACK");
            T.eq(Hex.atoms(80), r.balance(0), "and credits nothing");
        });
        t.test("pay", "RESEND returns the exact signed bytes", () -> {
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(1));
            T.yes(Arrays.equals(tr, p.resend(Hex.u32(tr, Wire.X_N))), "same bytes");
            p.ack(r.credit(tr));
        });
        t.test("pay", "PAY refusals: no peer, wrong peer, amount 0, above balance, above capacity, same HELLO twice", () -> {
            ((SimCard) p.io).powerCycle();
            byte[] hello = r.hello(0, Hex.atoms(20));
            T.eq(Card.SW_NO_PEER, p.sw(Card.PAY, 0, 0, Hex.cat(hello, Hex.u64(U))), "no peer");
            p.peer(c.cert());
            T.eq(Card.SW_NO_PEER, p.sw(Card.PAY, 0, 0, Hex.cat(hello, Hex.u64(U))), "HELLO from another chip");
            p.peer(r.cert());
            T.eq(Card.SW_AMOUNT, p.sw(Card.PAY, 0, 0, Hex.cat(hello, Hex.u64(0))), "zero");
            T.eq(Card.SW_AMOUNT, p.sw(Card.PAY, 0, 0, Hex.cat(hello, Hex.u64(Hex.atoms(21)))), "above capacity");
            byte[] big = r.hello(0);
            T.eq(Card.SW_AMOUNT, p.sw(Card.PAY, 0, 0, Hex.cat(big, Hex.u64(Hex.atoms(9999)))), "above balance");
            byte[] tr = p.pay(hello, Hex.atoms(2));
            T.eq(Card.SW_NONCE_NOT_OUTSTANDING, p.sw(Card.PAY, 0, 0, Hex.cat(hello, Hex.u64(U))), "same HELLO twice");
            r.peer(p.cert());
            p.ack(r.credit(tr));
        });
        t.test("pay", "PIN rules (3.4): up to 50 per payment and 150 in total PIN-less; above that the PIN or an arm", () -> {
            Lab l2 = new Lab();
            Card pp = l2.card("PP", l2.v1, Hex.atoms(1000), 0);
            Card rr = l2.card("RR", l2.v1, 0, 0);
            Phone.introduce(pp, rr);
            T.eq(Card.SW_PIN_REQUIRED, pp.sw(Card.PAY, 0, 0, Hex.cat(rr.hello(0), Hex.u64(Hex.atoms(51)))), "51 without PIN");
            pp.ack(rr.credit(pp.pay(rr.hello(0), Hex.atoms(50))));
            pp.ack(rr.credit(pp.pay(rr.hello(0), Hex.atoms(50))));
            pp.ack(rr.credit(pp.pay(rr.hello(0), Hex.atoms(50))));
            T.eq(Card.SW_PIN_REQUIRED, pp.sw(Card.PAY, 0, 0, Hex.cat(rr.hello(0), Hex.u64(Hex.atoms(1)))), "151st unit");
            pp.verifyPin(Lab.PIN);
            pp.ack(rr.credit(pp.pay(rr.hello(0), Hex.atoms(200))));
            T.eq(Card.SW_PIN_REQUIRED, pp.sw(Card.PAY, 0, 0, Hex.cat(rr.hello(0), Hex.u64(Hex.atoms(60)))), "the PIN is one use");
            pp.ack(rr.credit(pp.pay(rr.hello(0), Hex.atoms(10)))); // PIN reset the PIN-less total
            // arm on the owner's own phone, then the card leaves the field and pays on another phone
            pp.verifyPinArm(Lab.PIN, 0, Hex.atoms(300));
            ((SimCard) pp.io).powerCycle();
            Phone.introduce(pp, rr);
            pp.ack(rr.credit(pp.pay(rr.hello(0), Hex.atoms(250))));
            T.eq(0L, pp.slot(0).arm, "arm used once");
            T.eq(Card.SW_PIN_REQUIRED, pp.sw(Card.PAY, 0, 0, Hex.cat(rr.hello(0), Hex.u64(Hex.atoms(250)))), "arm gone");
            T.eq(Hex.atoms(1000 - 150 - 200 - 10 - 250), pp.balance(0), "balance");
        });
        t.test("pay", "owner limits: per-payment limit refuses; holding limit caps HELLO and CREDIT", () -> {
            Lab l3 = new Lab();
            Card pp = l3.card("PP", l3.v1, Hex.atoms(1000), 0);
            Card rr = l3.card("RR", l3.v1, Hex.atoms(100), 0);
            pp.verifyPin(Lab.PIN);
            pp.setLimits(0, 0, Hex.atoms(30), Lab.PL_PAY, Lab.PL_TOT);
            Phone.introduce(pp, rr);
            T.eq(Card.SW_LIMIT, pp.sw(Card.PAY, 0, 0, Hex.cat(rr.hello(0), Hex.u64(Hex.atoms(31)))), "per-payment");
            rr.verifyPin(Lab.PIN);
            rr.setLimits(0, Hex.atoms(140), 0, Lab.PL_PAY, Lab.PL_TOT);
            byte[] h = rr.hello(0);
            T.eq(Hex.atoms(40), Hex.u64(h, Wire.H_CAP), "HELLO capacity = room under the holding limit");
            T.eq(Hex.atoms(40), rr.slot(0).reserved, "room reserved");
            T.eq(Card.SW_LIMIT, rr.sw(Card.HELLO, 0, 0, null), "no room left for a second HELLO");
            pp.ack(rr.credit(pp.pay(h, Hex.atoms(30))));
            T.eq(Hex.atoms(130), rr.balance(0), "credited within the limit");
            T.eq(0L, rr.slot(0).reserved, "reservation released");
            T.eq(Hex.atoms(10), Hex.u64(rr.hello(0), Wire.H_CAP), "next HELLO offers the remaining room");
        });
        t.test("pay", "CREDIT refusals: not for me, tampered, revoked payer", () -> {
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(3));
            c.peer(p.cert());
            T.eq(Card.SW_NOT_FOR_ME, c.sw(Card.CREDIT, 0, 0, tr), "another chip");
            byte[] bad = tr.clone();
            bad[Wire.X_A + 7] ^= 1;
            T.eq(Card.SW_BAD_SIGNATURE, r.sw(Card.CREDIT, 0, 0, bad), "amount altered");
            p.ack(r.credit(tr));
            lab.revoke(p);
            lab.pushSnapshot(r, lab.v2);
            Phone.introduce(p, r);
            byte[] tr2 = p.pay(r.hello(0), Hex.atoms(3));
            T.eq(Card.SW_REVOKED, r.sw(Card.CREDIT, 0, 0, tr2), "revoked payer");
            p.cancel(r.cancelProof(tr2));
            T.eq(Hex.atoms(500 - 30 - 1 - 2 - 3), p.balance(0), "the refused payment came back to the payer");
        });
        t.test("pay", "ACK refusals: an ACK signed by another chip, or for another payer", () -> {
            Lab l4 = new Lab();
            Card pp = l4.card("PP", l4.v1, Hex.atoms(100), 0);
            Card rr = l4.card("RR", l4.v1, 0, 0);
            Card cc = l4.card("CC", l4.v1, 0, 0);
            Phone.introduce(pp, rr);
            byte[] tr = pp.pay(rr.hello(0), Hex.atoms(5));
            byte[] ack = rr.credit(tr);
            pp.peer(cc.cert());
            T.eq(Card.SW_NO_PEER, pp.sw(Card.ACK, 0, 0, ack), "ACK while another chip is the peer");
            pp.peer(rr.cert());
            byte[] forged = ack.clone();
            forged[Wire.A_N + 3] ^= 1;
            T.eq(Card.SW_BAD_SIGNATURE, pp.sw(Card.ACK, 0, 0, forged), "altered ACK");
            pp.ack(ack);
        });
    }

    static void cancel(T t) {
        Lab lab = new Lab();
        Card p = lab.card("P", lab.v1, Hex.atoms(100), 0);
        Card r = lab.card("R", lab.v1, 0, 0);
        t.test("cancel", "CANCEL_PROOF retires an uncredited nonce; CANCEL restores once; the transfer can never be credited", () -> {
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(40));
            T.eq(Hex.atoms(60), p.balance(0), "debited");
            byte[] proof = r.cancelProof(tr);
            T.yes(Wire.verifyWire(r.pubkey(), proof), "cancel proof signature (SunEC)");
            T.eq(Card.SW_NONCE_NOT_OUTSTANDING, r.sw(Card.CREDIT, 0, 0, tr), "credit after the proof");
            p.cancel(proof);
            T.eq(Hex.atoms(100), p.balance(0), "restored");
            T.eq(Card.SW_NOT_PENDING, p.sw(Card.CANCEL, 0, 0, proof), "second cancel");
            T.eq(Card.SW_NOT_PENDING, p.sw(Card.RESEND, 0, 0, Hex.u32(Hex.u32(tr, Wire.X_N))), "cancelled transfer is not re-sent");
        });
        t.test("cancel", "CANCEL_PROOF refused for a transfer that was credited", () -> {
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(10));
            r.credit(tr);
            T.eq(Card.SW_ALREADY_CREDITED, r.sw(Card.CANCEL_PROOF, 0, 0, tr), "credited");
            T.eq(Card.SW_BAD_SIGNATURE, r.sw(Card.CANCEL_PROOF, 0, 0,
                resigned(p, tr)), "a transfer with its nonce altered fails its signature");
        });
    }

    /** A transfer the payer never signed for a nonce the receiver never issued (for refusal tests only). */
    static byte[] resigned(Card p, byte[] tr) {
        byte[] b = tr.clone();
        System.arraycopy(Hex.u32(60000), 0, b, Wire.X_M, 4);
        return b;
    }

    static void tickets(T t) {
        Lab lab = new Lab();
        Card merchant = lab.card("M", lab.v1, 0, 0);
        Card payer = lab.card("P", lab.v2, Hex.atoms(100), 0);
        t.test("tickets", "ISSUE_TICKETS and GET_TICKET: signed ticket HELLOs; payer pays; the merchant card loads them once", () -> {
            long[] rng = merchant.issueTickets(0, 4, null, false);
            T.eq(4L, rng[1], "count");
            byte[] tk = merchant.ticket(rng[0]);
            T.yes(Wire.verifyWire(merchant.pubkey(), tk), "ticket signature");
            T.eq(1, tk[Wire.H_FLAGS] & 1, "ticket flag");
            // at the till: only the payer's card is in the field; the phone holds the merchant's certificate
            payer.peer(merchant.cert());
            byte[] tr = payer.pay(tk, Hex.atoms(12));
            T.yes(Wire.verifyWire(payer.pubkey(), tr), "the merchant phone verifies the transfer in software");
            // later: loading into the merchant's card
            merchant.peer(payer.cert());
            merchant.credit(tr);
            T.eq(Hex.atoms(12), merchant.balance(0), "loaded");
            merchant.credit(tr); // re-issue only
            T.eq(Hex.atoms(12), merchant.balance(0), "once");
            T.eq(Card.SW_NONCE_NOT_OUTSTANDING, merchant.sw(Card.GET_TICKET, 0, 0, Hex.u32(rng[0])), "a used ticket is not handed out again");
        });
        t.test("tickets", "open tickets block a new batch unless the phone retires them; a retired ticket is refused", () -> {
            T.eq(Card.SW_TICKETS_OPEN, merchant.sw(Card.ISSUE_TICKETS, 0, 2, null), "open tickets");
            long[] old = new long[] { merchant.state().tkStart };
            long[] rng2 = merchant.issueTickets(0, 2, null, true);
            T.yes(rng2[0] > old[0], "new range");
            T.eq(Card.SW_NONCE_NOT_OUTSTANDING, merchant.sw(Card.GET_TICKET, 0, 0, Hex.u32(old[0] + 2)), "retired ticket");
        });
        t.test("tickets", "gap fix 2026-09-29: a ticket used by two payers loads both transfers once each; the ticket log (GET_STATE "
            + "part 7) lists them; a cancel proof is refused for a loaded transfer and exact for an unloaded one", () -> {
            Lab l2 = new Lab();
            Card m = l2.card("M2", l2.v1, 0, 0);
            Card p1 = l2.card("Q1", l2.v2, Hex.atoms(100), 0), p2 = l2.card("Q2", l2.v2, Hex.atoms(100), 0);
            Card p3 = l2.card("Q3", l2.v1, Hex.atoms(100), 0);
            long[] rng = m.issueTickets(0, 3, null, false);
            byte[] tk = m.ticket(rng[0]);
            p1.peer(m.cert());
            p2.peer(m.cert());
            p3.peer(m.cert());
            byte[] t1 = p1.pay(tk, Hex.atoms(5)), t2 = p2.pay(tk, Hex.atoms(6)), t3 = p3.pay(tk, Hex.atoms(7));
            T.eq(0, m.ticketLog().size(), "empty log before loading");
            m.peer(p1.cert());
            byte[] a1 = m.credit(t1);
            m.peer(p2.cert());
            m.credit(t2);
            T.eq(Hex.atoms(11), m.balance(0), "both loaded");
            T.eq(2, m.ticketLog().size(), "two entries");
            T.yes(java.util.Arrays.equals(m.ticketLog().get(0), Hex.sub(Hex.sha256(Wire.body(t1)), 0, 16)), "entry = transfer digest");
            m.peer(p1.cert());
            T.yes(java.util.Arrays.equals(Wire.body(m.credit(t1)), Wire.body(a1)), "a replay re-issues the same ACK");
            T.eq(Hex.atoms(11), m.balance(0), "and loads nothing");
            T.eq(Card.SW_ALREADY_CREDITED, m.sw(Card.CANCEL_PROOF, 0, 0, t1), "no cancel proof for a loaded transfer");
            m.peer(p3.cert());
            byte[] proof = m.cancelProof(t3);
            T.eq(2, (int) proof[Wire.A_EXTRA], "reason: the ticket was credited by another transfer");
            T.eq(Card.SW_NONCE_NOT_OUTSTANDING, m.sw(Card.CREDIT, 0, 0, t3), "the cancelled transfer never loads (ticket retired)");
            p3.peer(m.cert());
            p3.cancel(proof);
            T.eq(Hex.atoms(100), p3.balance(0), "restored");
            T.eq(0x6A86, m.sw(Card.GET_STATE, 7, 8, null), "ticket log page out of range");
            m.issueTickets(0, 1, null, true);
            T.eq(0, m.ticketLog().size(), "a new batch starts an empty log");
            m.peer(p2.cert());
            m.credit(t2);
            T.eq(Hex.atoms(11), m.balance(0), "after the batch closed, a loaded transfer only gets its ACK again");
        });
    }

    static void swap(T t) {
        Lab lab = new Lab();
        Card buyer = lab.card("U", lab.v1, 0, 0);
        Card seller = lab.card("S", lab.v2, Hex.atoms(300), 0);
        t.test("swap", "SWAP_EXPECT: h = SHA-256(s); s released only in the ACK of a transfer of at least X", () -> {
            byte[] r = buyer.swapExpect(0, Hex.atoms(100));
            byte[] h = Hex.sub(r, 0, 32);
            byte[] hello = Hex.sub(r, 32, r.length - 32);
            T.yes(Wire.verifyWire(buyer.pubkey(), hello), "swap HELLO signature");
            Phone.introduce(seller, buyer);
            seller.verifyPin(Lab.PIN);
            byte[] under = seller.pay(hello, Hex.atoms(99));
            T.eq(Card.SW_SWAP_UNDERPAID, buyer.sw(Card.CREDIT, 0, 0, under), "underpaid: no credit, no secret");
            seller.cancel(buyer.cancelProof(under));
            T.eq(Hex.atoms(300), seller.balance(0), "the underpayment came back to the seller");
            byte[] r2 = buyer.swapExpect(0, Hex.atoms(100)); // the first swap's nonce was retired by the cancel
            T.eq(Card.SW_TICKETS_OPEN, buyer.sw(Card.SWAP_EXPECT, 0, 0, Hex.u64(5)), "one open swap at a time");
            T.yes(!Arrays.equals(Hex.sub(r2, 0, 32), h), "a fresh secret");
        });
        t.test("swap", "a paid swap's ACK carries s; a re-issued ACK carries the same s", () -> {
            Lab l2 = new Lab();
            Card u = l2.card("U", l2.v1, 0, 0);
            Card s = l2.card("S", l2.v2, Hex.atoms(300), 0);
            byte[] r = u.swapExpect(0, Hex.atoms(100));
            byte[] h = Hex.sub(r, 0, 32);
            Phone.introduce(s, u);
            s.verifyPin(Lab.PIN);
            byte[] tr = s.pay(Hex.sub(r, 32, r.length - 32), Hex.atoms(100));
            byte[] ack = u.credit(tr);
            T.eq(1, (int) ack[Wire.A_EXTRA], "secret present");
            byte[] secret = Hex.sub(ack, Wire.A_SECRET, 32);
            T.yes(Arrays.equals(Hex.sha256(secret), h), "SHA-256(s) = h");
            T.yes(Arrays.equals(Hex.sub(u.credit(tr), Wire.A_SECRET, 32), secret), "same s on re-issue");
            s.ack(ack);
            T.eq(Hex.atoms(100), u.balance(0), "credited once");
        });
    }

    static void fund(T t) {
        Lab lab = new Lab();
        Card a = lab.card("A", lab.v1, Hex.atoms(100), 0);
        t.test("fund", "FUND: the vendor voucher numbered k+1 credits once; replay, skip, wrong total, wrong vendor, wrong chip refused", () -> {
            byte[] id = a.chipId();
            byte[] v2 = lab.v1.fundVoucher(id, Lab.USDW, 2, Hex.atoms(150), Hex.atoms(50));
            a.fund(v2);
            T.eq(Hex.atoms(150), a.balance(0), "credited");
            T.eq(2L, a.slot(0).k, "k_chip");
            T.eq(Card.SW_STALE, a.sw(Card.FUND, 0, 0, v2), "replay");
            T.eq(Card.SW_STALE, a.sw(Card.FUND, 0, 0, lab.v1.fundVoucher(id, Lab.USDW, 4, Hex.atoms(200), Hex.atoms(50))), "skip");
            T.eq(Card.SW_STALE, a.sw(Card.FUND, 0, 0, lab.v1.fundVoucher(id, Lab.USDW, 3, Hex.atoms(999), Hex.atoms(50))), "total");
            T.eq(Card.SW_BAD_SIGNATURE, a.sw(Card.FUND, 0, 0, lab.v2.fundVoucher(id, Lab.USDW, 3, Hex.atoms(200), Hex.atoms(50))), "other vendor");
            T.eq(Card.SW_NOT_FOR_ME, a.sw(Card.FUND, 0, 0, lab.v1.fundVoucher(new byte[32], Lab.USDW, 3, Hex.atoms(200), Hex.atoms(50))), "other chip");
            T.eq(Hex.atoms(150), a.balance(0), "unchanged");
        });
    }

    static void defund(T t) {
        Lab lab = new Lab();
        Card a = lab.card("A", lab.v1, Hex.atoms(500), Hex.atoms(20));
        t.test("defund", "DEFUND: PIN required; commits the debit and the key index; the LX16 voucher verifies (ots port)", () -> {
            T.eq(Card.SW_PIN_REQUIRED, a.sw(Card.DEFUND, 0, 0, Hex.u64(Hex.atoms(10))), "no PIN");
            a.verifyPin(Lab.PIN);
            T.eq(Card.SW_CURRENCY, a.sw(Card.DEFUND, 1, 0, Hex.u64(Hex.atoms(10))), "not the chain currency");
            T.eq(Card.SW_AMOUNT, a.sw(Card.DEFUND, 0, 0, Hex.u64(Hex.atoms(501))), "above balance");
            byte[] hdr = a.defund(0, Hex.atoms(120));
            T.eq(Hex.atoms(380), a.balance(0), "debited");
            T.eq(2, a.state().keyNext, "key 1 used");
            byte[] msg = Hex.sub(hdr, 1, 52), d = Hex.sub(hdr, 53, 32);
            T.eq(1L, Hex.u32(msg, 0), "key index in the message");
            T.eq(Hex.atoms(120), Hex.u64(msg, 4), "amount");
            T.eq(Hex.atoms(380), Hex.u64(msg, 28), "balance after");
            T.eq(1L, Hex.u32(msg, 12), "funding count");
            T.yes(Arrays.equals(d, Lx16Ref.voucherDigest(a.chipId(), msg)), "d = SHA-256(0x44 | chip id | message)");
            byte[][] sig = a.defundSignature(hdr[0]);
            byte[] pk = Hex.sub(a.lxPubkey(1), 160, 32);
            T.yes(Lx16Ref.verify(pk, d, sig[0], sig[1]), "LX16 signature");
            byte[] cdCard = Hex.sub(hdr, 85, 160);
            T.yes(Arrays.equals(cdCard, Hex.cat(Lx16Ref.chunkDigests(sig[0], sig[1]))), "chunk digests");
            byte[][] again = a.defundSignature(hdr[0]);
            T.yes(Arrays.equals(again[0], sig[0]) && Arrays.equals(again[1], sig[1]), "re-read: the same voucher, same digest");
            T.eq(Card.SW_PIN_REQUIRED, a.sw(Card.DEFUND, 0, 0, Hex.u64(Hex.atoms(1))), "the PIN is one use");
        });
        t.test("defund", "gap fix 2026-09-29: each voucher carries the chip's cumulative defunded total (120, then 150), not its own "
            + "amount; the balance-after field and the key index move with it", () -> {
            a.verifyPin(Lab.PIN);
            byte[] hdr = a.defund(0, Hex.atoms(30));
            byte[] msg = Hex.sub(hdr, 1, 52);
            T.eq(2L, Hex.u32(msg, 0), "key index 2");
            T.eq(Hex.atoms(150), Hex.u64(msg, 4), "cumulative defunded total");
            T.eq(Hex.atoms(350), Hex.u64(msg, 28), "balance after");
            T.eq(Hex.atoms(150), a.slot(0).defunded, "the chip's D");
            byte[] first = a.voucherRecord(0);
            T.eq(Hex.atoms(120), Hex.u64(first, 4 + 4), "the first voucher still carries 120");
        });
    }

    static void snapshots(T t) {
        Lab lab = new Lab();
        Card a = lab.card("A", lab.v1, Hex.atoms(10), 0);
        Card x = lab.card("X", lab.v2, Hex.atoms(10), 0);
        t.test("snapshot", "a newer snapshot from any accepted vendor is accepted; revocations reach the chip", () -> {
            lab.revoke(x);
            lab.pushSnapshot(a, lab.v2);
            T.eq(lab.snapVersion, a.state().snapVer, "version");
            T.eq(1, a.state().revCount, "one revocation");
            a.peer(x.cert());
            T.eq(Card.SW_REVOKED, a.sw(Card.PAY, 0, 0, Hex.cat(x.hello(0), Hex.u64(1))), "revoked receiver refused");
        });
        t.test("snapshot", "same, older or foreign-signed snapshots refused; tampered entries refused with the old state intact", () -> {
            T.eq(Card.SW_STALE, a.sw(Card.SNAP_BEGIN, 0, 0, lab.snapshotHeader(lab.v1)), "same version");
            T.eq(Card.SW_FOREIGN_VENDOR, a.sw(Card.SNAP_BEGIN, 0, 0,
                lab.foreign.snapshotHeader(lab.snapVersion + 1, lab.block, lab.vendors, lab.revocations)), "foreign signer");
            byte[] h = lab.v1.snapshotHeader(lab.snapVersion + 1, lab.block, lab.vendors, lab.revocations);
            a.snapBegin(h);
            byte[] bad = Hex.cat(lab.vendors.get(0), lab.foreign.entry());
            a.snapVendors(0, bad);
            T.eq(Card.SW_DIGEST_MISMATCH, a.sw(Card.SNAP_COMMIT, 0, 0, null), "tampered vendor list");
            T.eq(lab.snapVersion, a.state().snapVer, "unchanged");
            T.eq(2, a.state().vCount, "vendor list unchanged");
            java.util.List<byte[]> shorter = new java.util.ArrayList<byte[]>();
            T.eq(Card.SW_STALE, a.sw(Card.SNAP_BEGIN, 0, 0,
                lab.v1.snapshotHeader(lab.snapVersion + 2, lab.block, lab.vendors, shorter)), "revocation list may not shrink");
            T.eq(Card.SW_LIFECYCLE, a.sw(Card.SNAP_COMMIT, 0, 0, null), "commit without a snapshot in progress");
        });
    }

    static void refusals(T t) {
        Lab lab = new Lab();
        Card a = lab.card("A", lab.v1, Hex.atoms(10), 0);
        t.test("refusals", "the remaining commands refuse out of context: GET_CERT before a certificate, DEFUND_READ of an empty "
            + "voucher slot, snapshot entries without a header, PERSO after lock, GET_PUBKEY with a bad class", () -> {
            SimCard sc = new SimCard("fresh");
            sc.install(SimCard.AID_APPLET, StablesApplet.class);
            sc.select(SimCard.AID_APPLET);
            Card f = new Card(sc);
            T.eq(Card.SW_LIFECYCLE, f.sw(Card.GET_CERT, 0, 0, null), "no certificate yet");
            T.eq(Card.SW_NOT_PENDING, a.sw(Card.DEFUND_READ, 2, 0, null), "empty voucher slot");
            T.eq(0x6A86, a.sw(Card.DEFUND_READ, 9, 0, null), "voucher slot out of range");
            T.eq(Card.SW_LIFECYCLE, a.sw(Card.SNAP_VENDORS, 0, 0, lab.v1.entry()), "vendors without a header");
            T.eq(Card.SW_LIFECYCLE, a.sw(Card.SNAP_REVOCATIONS, 0, 0, Hex.cat(Hex.u16(0), new byte[8])), "revocations without a header");
            T.eq(Card.SW_LIFECYCLE, a.sw(Card.PERSO_SET_ISSUER, 0, 0, lab.v2.entry()), "issuer after lock");
            T.eq(Card.SW_LIFECYCLE, a.sw(Card.PERSO_SET_PUK, 0, 0, Lab.PUK), "PUK after lock");
            byte[] r = a.io.transmit(new byte[] { 0x00, (byte) Card.GET_PUBKEY, 0, 0, 0 });
            T.eq(0x6E00, ((r[r.length - 2] & 0xFF) << 8) | (r[r.length - 1] & 0xFF), "class 00");
            T.eq(Card.SW_WRONG_DATA, a.sw(Card.LX_PUBKEY, 0, 0, Hex.u16(-1)), "negative key index");
        });
    }

    static void bench(T t) {
        t.test("bench", "benchmark applet: every command answers 9000 in the simulator", () -> {
            SimCard sc = new SimCard("bench");
            sc.install(SimCard.AID_BENCH, BenchApplet.class);
            sc.select(SimCard.AID_BENCH);
            Card b = new Card(sc);
            for (int s = 0; s < 6; s++) {
                b.call(0x02, s, 1, null);
                b.call(0x04, s, 1, null);
            }
            b.call(0x06, 0, 1, null);
            T.eq(1, (int) b.call(0x08, 1, 1, null)[0], "verify");
            T.eq(192, b.call(0x0A, 0, 0, Hex.u16(1)).length, "LX16 keygen");
            T.eq(240, b.call(0x0C, 0, 5, Hex.u16(1)).length, "LX16 block");
            T.eq(64, b.call(0x14, 0, 0, null).length, "digests");
            T.eq(8, b.call(0x0E, 0, 0, null).length, "memory");
            b.call(0x10, 0, 1, null);
            b.call(0x12, 2, 1, null);
        });
    }
}
