package org.stables.host;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;

/**
 * The relay attack suite (chip-balance-design.md 0c.2 item 3). The phones are untrusted: this relay sits between two or
 * three simulated chips and drops, delays, duplicates, replays, reorders and modifies their messages, and substitutes
 * messages from a third chip. Every test also checks, around the attack, that all balances plus everything in flight
 * never rise above the starting total, and that after the documented recovery (Phone.recover) nothing was lost.
 *
 * Not built or tested (0c.1 items 16 to 18, deferred by decision 14): fraud proofs, proof-of-cheating revocation,
 * per-card caps, note expiry, hop limits. Their hooks (version byte, signed counter n, snapshot version) are carried.
 */
public final class RelaySuite {
    private RelaySuite() { }

    /** A small world with a conservation check. */
    static final class W {
        final Lab lab = new Lab();
        final List<Card> cards = new ArrayList<Card>();
        long[] initial;

        Card card(String name, Vendor v, double usdw, double winiwa) {
            Card c = lab.card(name, v, Hex.atoms(usdw), Hex.atoms(winiwa), false);
            cards.add(c);
            return c;
        }

        W start() {
            initial = totals();
            return this;
        }

        long[] totals() {
            return new long[] { Audit.total(cards, 0).total(), Audit.total(cards, 1).total() };
        }

        /** No value created at this point (balances + in flight never rise). */
        void noRise(String when) {
            long[] t = totals();
            if (t[0] > initial[0] || t[1] > initial[1]) {
                throw new AssertionError("value created " + when + ": " + Audit.total(cards, 0));
            }
        }

        /** The documented recovery, then nothing lost and nothing created. */
        void conserved() {
            noRise("before recovery");
            for (Card c : cards) {
                Phone.recover(c, cards);
            }
            long[] t = totals();
            if (t[0] != initial[0] || t[1] != initial[1]) {
                throw new AssertionError("not conserved after recovery: " + Audit.total(cards, 0) + " vs start "
                    + Hex.units(initial[0]));
            }
            for (Card c : cards) {
                for (Card.Pending p : c.pendings()) {
                    if (p.status == 1) {
                        throw new AssertionError(c.name + " still has a pending transfer after recovery");
                    }
                }
            }
        }
    }

    static byte[] flip(byte[] m, int off) {
        byte[] b = m.clone();
        b[off] ^= 0x01;
        return b;
    }

    static byte[] put(byte[] m, int off, byte[] v) {
        byte[] b = m.clone();
        System.arraycopy(v, 0, b, off, v.length);
        return b;
    }

    static final long A = Hex.atoms(1);

    public static T run() {
        return run("");
    }

    /** Runs the groups matching the regular expression (all when empty). */
    public static T run(String groups) {
        T t = new T("relay suite", groups);

        // ------------------------------------------------------------ drop
        t.test("drop", "HELLO dropped: nothing debited, the next tap works", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 200, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            r.hello(0); // the relay never delivers it
            T.eq(Hex.atoms(200), p.balance(0), "payer untouched");
            Phone.tap(p, r, 0, Hex.atoms(10));
            w.conserved();
            T.eq(Hex.atoms(10), r.balance(0), "later tap");
        });
        t.test("drop", "TRANSFER dropped: the pending re-send credits it exactly once", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 200, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(30));
            w.noRise("with the transfer in flight");
            T.eq(Hex.atoms(170), p.balance(0), "payer debited at commit");
            ((SimCard) p.io).powerCycle();
            ((SimCard) r.io).powerCycle();
            w.conserved(); // re-send from the pending ring
            T.eq(Hex.atoms(30), r.balance(0), "credited once");
            T.yes(Arrays.equals(p.resend(Hex.u32(tr, Wire.X_N)), tr), "the same signed bytes");
        });
        t.test("drop", "TRANSFER dropped: the receiver's cancel proof restores it once, and the transfer can never be credited", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 200, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(30));
            p.cancel(r.cancelProof(tr));
            T.eq(Hex.atoms(200), p.balance(0), "restored");
            T.eq(Card.SW_NONCE_NOT_OUTSTANDING, r.sw(Card.CREDIT, 0, 0, tr), "a late delivery is refused");
            w.conserved();
        });
        t.test("drop", "ACK dropped: the re-send re-issues the ACK, no second credit", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 200, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(30));
            r.credit(tr); // ACK dropped
            w.noRise("ACK lost");
            w.conserved();
            T.eq(Hex.atoms(30), r.balance(0), "credited once");
            T.eq(2, p.pendings().get(0).status, "acknowledged by the re-issued ACK");
        });
        t.test("drop", "ACK dropped and never recovered: the value is counted once (at the receiver), nothing lost or created", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 200, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            r.credit(p.pay(r.hello(0), Hex.atoms(30)));
            long[] now = w.totals();
            T.eq(w.initial[0], now[0], "total");
        });

        // ------------------------------------------------------------ delay
        t.test("delay", "TRANSFER delayed until the receiver retired the nonce (4 newer HELLOs): refused, cancel proof restores", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 200, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(30));
            for (int i = 0; i < 4; i++) {
                r.hello(0);
            }
            T.eq(Card.SW_NONCE_NOT_OUTSTANDING, r.sw(Card.CREDIT, 0, 0, tr), "late transfer");
            w.conserved();
            T.eq(Hex.atoms(200), p.balance(0), "restored");
            T.eq(0L, r.balance(0), "nothing credited");
        });
        t.test("delay", "ACK delayed past a power cycle of the payer: accepted after the phone re-introduces the chips", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 200, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] ack = r.credit(p.pay(r.hello(0), Hex.atoms(30)));
            ((SimCard) p.io).powerCycle();
            T.eq(Card.SW_NO_PEER, p.sw(Card.ACK, 0, 0, ack), "no peer after power loss");
            p.peer(r.cert());
            p.ack(ack);
            w.conserved();
        });

        // ------------------------------------------------------------ duplicate
        t.test("duplicate", "TRANSFER delivered twice: credited once (the second answer is the same ACK)", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 200, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(30));
            byte[] a1 = r.credit(tr), a2 = r.credit(tr);
            T.yes(Arrays.equals(Wire.body(a1), Wire.body(a2)), "same ACK");
            T.eq(Hex.atoms(30), r.balance(0), "once");
            p.ack(a1);
            p.ack(a2);
            w.conserved();
        });
        t.test("duplicate", "HELLO duplicated to two payers: one is credited, the other gets a cancel proof and is restored", () -> {
            W w = new W();
            Card p1 = w.card("P1", w.lab.v1, 100, 0), p2 = w.card("P2", w.lab.v2, 100, 0), r = w.card("R", w.lab.v1, 0, 0);
            w.start();
            byte[] hello = r.hello(0);
            p1.peer(r.cert());
            p2.peer(r.cert());
            byte[] t1 = p1.pay(hello, Hex.atoms(20)), t2 = p2.pay(hello, Hex.atoms(20));
            w.noRise("two transfers on one nonce");
            r.peer(p1.cert());
            p1.ack(r.credit(t1));
            r.peer(p2.cert());
            T.eq(Card.SW_ALREADY_CREDITED, r.sw(Card.CREDIT, 0, 0, t2), "second payer refused");
            w.conserved();
            T.eq(Hex.atoms(100), p2.balance(0), "second payer restored");
            T.eq(Hex.atoms(20), r.balance(0), "one credit");
        });
        t.test("duplicate", "the same HELLO replayed to the same payer: the payer refuses to pay it twice", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] hello = r.hello(0);
            p.ack(r.credit(p.pay(hello, Hex.atoms(5))));
            T.eq(Card.SW_NONCE_NOT_OUTSTANDING, p.sw(Card.PAY, 0, 0, Hex.cat(hello, Hex.u64(Hex.atoms(5)))), "second pay");
            w.conserved();
        });

        // ------------------------------------------------------------ replay
        t.test("replay", "an old TRANSFER replayed in a later session: no second credit", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(10));
            p.ack(r.credit(tr));
            Phone.tap(p, r, 0, Hex.atoms(5));
            ((SimCard) r.io).powerCycle();
            r.peer(p.cert());
            r.credit(tr);
            T.eq(Hex.atoms(15), r.balance(0), "replay credited nothing");
            w.conserved();
        });
        t.test("replay", "a TRANSFER copied to a third chip: refused (bound to the receiver's id)", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0), c = w.card("C", w.lab.v1, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(10));
            c.peer(p.cert());
            T.eq(Card.SW_NOT_FOR_ME, c.sw(Card.CREDIT, 0, 0, tr), "third chip");
            w.conserved();
            T.eq(0L, c.balance(0), "nothing to the third chip");
        });
        t.test("replay", "a HELLO already credited, replayed to another payer: refused at credit, the payer is restored", () -> {
            W w = new W();
            Card p1 = w.card("P1", w.lab.v1, 100, 0), p2 = w.card("P2", w.lab.v2, 100, 0), r = w.card("R", w.lab.v1, 0, 0);
            w.start();
            byte[] hello = r.hello(0);
            Phone.introduce(p1, r);
            p1.ack(r.credit(p1.pay(hello, Hex.atoms(10))));
            p2.peer(r.cert());
            byte[] t2 = p2.pay(hello, Hex.atoms(7));
            r.peer(p2.cert());
            T.eq(Card.SW_ALREADY_CREDITED, r.sw(Card.CREDIT, 0, 0, t2), "replayed HELLO");
            w.conserved();
            T.eq(Hex.atoms(100), p2.balance(0), "restored");
        });
        t.test("replay", "a transfer made against a receive ticket, replayed at loading: credited once", () -> {
            W w = new W();
            Card m = w.card("M", w.lab.v1, 0, 0), p = w.card("P", w.lab.v2, 100, 0);
            w.start();
            long[] rng = m.issueTickets(0, 2, null, false);
            p.peer(m.cert());
            byte[] tr = p.pay(m.ticket(rng[0]), Hex.atoms(12));
            m.peer(p.cert());
            m.credit(tr);
            m.credit(tr);
            m.credit(tr);
            T.eq(Hex.atoms(12), m.balance(0), "once");
            w.conserved();
        });
        t.test("replay", "a ticket replayed after its batch was retired: refused, the payer is restored", () -> {
            W w = new W();
            Card m = w.card("M", w.lab.v1, 0, 0), p = w.card("P", w.lab.v2, 100, 0);
            w.start();
            long[] rng = m.issueTickets(0, 2, null, false);
            byte[] tk = m.ticket(rng[0]);
            m.issueTickets(0, 2, null, true);
            p.peer(m.cert());
            byte[] tr = p.pay(tk, Hex.atoms(10));
            m.peer(p.cert());
            T.eq(Card.SW_NONCE_NOT_OUTSTANDING, m.sw(Card.CREDIT, 0, 0, tr), "retired ticket");
            w.conserved();
            T.eq(Hex.atoms(100), p.balance(0), "restored");
        });

        // ------------------------------------------------------------ reorder
        t.test("reorder", "two concurrent taps: TRANSFERs and ACKs delivered in reverse order, each credited and cleared once", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] h1 = r.hello(0), h2 = r.hello(0);
            byte[] t1 = p.pay(h1, Hex.atoms(10)), t2 = p.pay(h2, Hex.atoms(20));
            byte[] a2 = r.credit(t2), a1 = r.credit(t1);
            p.ack(a2);
            p.ack(a1);
            T.eq(Hex.atoms(30), r.balance(0), "both once");
            w.conserved();
        });
        t.test("reorder", "commands out of order (CREDIT before PEER, ACK before PAY): refused without effect", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0), c = w.card("C", w.lab.v1, 0, 0);
            w.start();
            p.peer(r.cert());
            byte[] tr = p.pay(r.hello(0), Hex.atoms(10));
            T.eq(Card.SW_NO_PEER, r.sw(Card.CREDIT, 0, 0, tr), "credit before the payer's certificate");
            Phone.introduce(p, c);
            byte[] other = p.pay(c.hello(0), Hex.atoms(1));
            byte[] ackC = c.credit(other);
            p.peer(r.cert());
            T.eq(Card.SW_NO_PEER, p.sw(Card.ACK, 0, 0, ackC), "an ACK from another session");
            p.peer(c.cert());
            p.ack(ackC);
            w.conserved();
        });

        // ------------------------------------------------------------ modify
        int[][] tOffsets = { { Wire.X_A + 7, 0 }, { Wire.X_RID + 3, 1 }, { Wire.X_N + 3, 2 }, { Wire.X_TOKEN, 3 }, { Wire.X_M + 3, 4 },
            { Wire.X_PID + 1, 5 }, { Wire.X_BODY + 10, 6 } };
        String[] tNames = { "amount", "recipient", "counter n", "currency", "nonce m", "payer id", "signature" };
        for (int[] o : tOffsets) {
            final int off = o[0];
            final String nm = tNames[o[1]];
            t.test("modify", "TRANSFER with its " + nm + " altered: refused; the original still credits once", () -> {
                W w = new W();
                Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0);
                w.start();
                Phone.introduce(p, r);
                byte[] tr = p.pay(r.hello(0), Hex.atoms(10));
                int sw = r.sw(Card.CREDIT, 0, 0, flip(tr, off));
                T.yes(sw == Card.SW_BAD_SIGNATURE || sw == Card.SW_NOT_FOR_ME || sw == Card.SW_NO_PEER, "refused, SW " + Integer.toHexString(sw));
                T.eq(0L, r.balance(0), "nothing credited");
                w.conserved();
                T.eq(Hex.atoms(10), r.balance(0), "original credited once by recovery");
            });
        }
        t.test("modify", "TRANSFER re-addressed to a third chip (recipient field set to its id): refused there", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0), c = w.card("C", w.lab.v1, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] tr = put(p.pay(r.hello(0), Hex.atoms(10)), Wire.X_RID, c.chipId());
            c.peer(p.cert());
            T.eq(Card.SW_BAD_SIGNATURE, c.sw(Card.CREDIT, 0, 0, tr), "re-addressed");
            w.conserved();
        });
        t.test("modify", "HELLO with a raised capacity, a changed nonce or currency: the payer refuses", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] hello = r.hello(0, Hex.atoms(5));
            T.eq(Card.SW_BAD_SIGNATURE, p.sw(Card.PAY, 0, 0, Hex.cat(put(hello, Wire.H_CAP, Hex.u64(Hex.atoms(50))), Hex.u64(Hex.atoms(40)))), "capacity");
            T.eq(Card.SW_BAD_SIGNATURE, p.sw(Card.PAY, 0, 0, Hex.cat(flip(hello, Wire.H_M + 3), Hex.u64(A))), "nonce");
            T.eq(Card.SW_BAD_SIGNATURE, p.sw(Card.PAY, 0, 0, Hex.cat(put(hello, Wire.H_TOKEN, Lab.WINIWA), Hex.u64(A))), "currency");
            T.eq(Hex.atoms(100), p.balance(0), "nothing debited");
            w.conserved();
        });
        t.test("modify", "ACK with an altered amount or counter: refused, the transfer stays pending until a genuine ACK", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] ack = r.credit(p.pay(r.hello(0), Hex.atoms(10)));
            T.eq(Card.SW_BAD_SIGNATURE, p.sw(Card.ACK, 0, 0, flip(ack, Wire.A_A + 7)), "amount");
            T.eq(Card.SW_BAD_SIGNATURE, p.sw(Card.ACK, 0, 0, flip(ack, Wire.A_N + 3)), "counter");
            T.eq(1, p.pendings().get(0).status, "still pending");
            w.conserved();
        });
        t.test("modify", "CANCEL proof with an altered amount: refused, nothing restored twice", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(10));
            byte[] proof = r.cancelProof(tr);
            byte[] bigger = put(proof, Wire.A_A, Hex.u64(Hex.atoms(90)));
            T.eq(Card.SW_BAD_SIGNATURE, p.sw(Card.CANCEL, 0, 0, bigger), "altered proof");
            p.cancel(proof);
            T.eq(Card.SW_NOT_PENDING, p.sw(Card.CANCEL, 0, 0, proof), "second use");
            w.conserved();
            T.eq(Hex.atoms(100), p.balance(0), "restored once");
        });
        final java.util.TreeMap<String, Integer> fuzzSw = new java.util.TreeMap<String, Integer>();
        t.test("modify", "fuzz: 300 random single-bit changes to the HELLO, TRANSFER or ACK of a tap; every one refused, value conserved", () -> {
            Random rnd = new Random(20260929L);
            int refused = 0, accepted = 0;
            for (int i = 0; i < 300; i++) {
                W w = new W();
                Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0);
                w.start();
                Phone.introduce(p, r);
                byte[] hello = r.hello(0);
                int which = rnd.nextInt(3);
                try {
                    if (which == 0) {
                        byte[] h = hello.clone();
                        h[rnd.nextInt(h.length)] ^= (byte) (1 << rnd.nextInt(8));
                        p.pay(h, Hex.atoms(10));
                    } else {
                        byte[] tr = p.pay(hello, Hex.atoms(10));
                        if (which == 1) {
                            byte[] x = tr.clone();
                            x[rnd.nextInt(x.length)] ^= (byte) (1 << rnd.nextInt(8));
                            r.credit(x);
                        } else {
                            byte[] ack = r.credit(tr);
                            byte[] x = ack.clone();
                            x[rnd.nextInt(x.length)] ^= (byte) (1 << rnd.nextInt(8));
                            p.ack(x);
                        }
                    }
                    accepted++;
                } catch (Card.Err e) {
                    refused++;
                    fuzzSw.merge(Integer.toHexString(e.sw).toUpperCase(), 1, Integer::sum);
                }
                w.conserved();
            }
            T.eq(0, accepted, "accepted changes (refused " + refused + ", by SW " + fuzzSw + ")");
        });
        t.check("modify", "fuzz: status words of the refusals (a 6F00 would mean the simulator's crypto library threw rather "
            + "than refusing)", !fuzzSw.containsKey("6F00"), fuzzSw.toString());

        // ------------------------------------------------------------ substitute (third chip)
        t.test("substitute", "a third chip's HELLO swapped in: the payment goes to that chip only; value conserved, no double spend", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0), c = w.card("C", w.lab.v1, 0, 0);
            w.start();
            p.peer(r.cert());
            T.eq(Card.SW_NO_PEER, p.sw(Card.PAY, 0, 0, Hex.cat(c.hello(0), Hex.u64(Hex.atoms(10)))), "HELLO from a chip other than the introduced one");
            Phone.introduce(p, c);
            p.ack(c.credit(p.pay(c.hello(0), Hex.atoms(10))));
            T.eq(0L, r.balance(0), "the intended receiver got nothing");
            T.eq(Hex.atoms(10), c.balance(0), "only the substituted chip, once");
            w.conserved();
        });
        t.test("substitute", "a third chip's genuine ACK (from its own payment) offered for a pending transfer to R: refused", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0), c = w.card("C", w.lab.v1, 0, 0);
            w.start();
            Phone.introduce(p, c);
            byte[] ackC = c.credit(p.pay(c.hello(0), Hex.atoms(3)));
            p.ack(ackC);
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(10));
            byte[] forged = put(ackC, Wire.A_N, Hex.sub(tr, Wire.X_N, 4));
            T.eq(Card.SW_NO_PEER, p.sw(Card.ACK, 0, 0, forged), "while R is the peer");
            p.peer(c.cert());
            T.eq(Card.SW_BAD_SIGNATURE, p.sw(Card.ACK, 0, 0, forged), "while C is the peer");
            int st = -1;
            for (Card.Pending pe : p.pendings()) {
                if (Hex.u32(pe.wire, Wire.X_N) == Hex.u32(tr, Wire.X_N)) {
                    st = pe.status;
                }
            }
            T.eq(1, st, "the transfer to R is still pending");
            w.conserved();
        });
        t.test("substitute", "a third chip asked for a cancel proof of a transfer to R: it refuses; a proof re-signed by it is refused by the payer", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0), c = w.card("C", w.lab.v1, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(10));
            c.peer(p.cert());
            T.eq(Card.SW_NOT_FOR_ME, c.sw(Card.CANCEL_PROOF, 0, 0, tr), "third chip");
            Phone.introduce(p, c);
            byte[] trC = p.pay(c.hello(0), Hex.atoms(2));
            byte[] proofC = c.cancelProof(trC);
            byte[] forged = put(put(proofC, Wire.A_N, Hex.sub(tr, Wire.X_N, 4)), Wire.A_A, Hex.sub(tr, Wire.X_A, 8));
            T.eq(Card.SW_BAD_SIGNATURE, p.sw(Card.CANCEL, 0, 0, forged), "forged proof");
            p.cancel(proofC);
            w.conserved();
        });

        // ------------------------------------------------------------ certificates, revocation, snapshots
        t.test("certificate", "a chip certified by a vendor not on the accepted list: refused as payer and as receiver", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), f = w.card("F", w.lab.foreign, 100, 0);
            w.start();
            T.eq(Card.SW_FOREIGN_VENDOR, p.sw(Card.PEER, 0, 0, f.cert()), "P refuses F");
            T.eq(Card.SW_NO_PEER, p.sw(Card.PAY, 0, 0, Hex.cat(f.hello(0), Hex.u64(A))), "so P cannot pay F");
            w.conserved();
        });
        t.test("certificate", "a software key with a self-made certificate: refused", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0);
            w.start();
            Vendor fake = new Vendor("self-made"), key = new Vendor("software key");
            byte[] body = fake.certBody(key.pub);
            T.eq(Card.SW_FOREIGN_VENDOR, p.sw(Card.PEER, 0, 0, Wire.signed(body, fake.sign(body))), "self-made");
            byte[] claimsV1 = Hex.cat(Wire.header('Q'), w.lab.v1.id, key.pub);
            T.eq(Card.SW_BAD_SIGNATURE, p.sw(Card.PEER, 0, 0, Wire.signed(claimsV1, fake.sign(claimsV1))), "claims V1, not signed by V1");
            w.conserved();
        });
        t.test("revocation", "owner-revoked receiver: paid normally until the snapshot reaches the payer, refused after", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            w.lab.revoke(r);
            Phone.tap(p, r, 0, Hex.atoms(5)); // baseline: no freshness rule, an old snapshot still pays (decision 14)
            w.lab.pushSnapshot(p, w.lab.v1);
            Phone.introduce(p, r);
            T.eq(Card.SW_REVOKED, p.sw(Card.PAY, 0, 0, Hex.cat(r.hello(0), Hex.u64(A))), "refused after the snapshot");
            w.conserved();
        });
        t.test("revocation", "owner-revoked payer: refused at credit once the receiver has the snapshot; the payer is restored", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            w.lab.revoke(p);
            w.lab.pushSnapshot(r, w.lab.v2);
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(10));
            T.eq(Card.SW_REVOKED, r.sw(Card.CREDIT, 0, 0, tr), "refused");
            w.conserved();
            T.eq(Hex.atoms(100), p.balance(0), "restored (a revoked chip's money still belongs to its owner)");
        });
        t.test("revocation", "a ticket issued before a revocation still loads (good faith, 4.4); one issued after refuses", () -> {
            W w = new W();
            Card m = w.card("M", w.lab.v1, 0, 0), p = w.card("P", w.lab.v2, 100, 0);
            w.start();
            long[] rng = m.issueTickets(0, 1, null, false);
            p.peer(m.cert());
            byte[] tr = p.pay(m.ticket(rng[0]), Hex.atoms(10));
            w.lab.revoke(p);
            w.lab.pushSnapshot(m, w.lab.v1);
            m.peer(p.cert());
            m.credit(tr);
            T.eq(Hex.atoms(10), m.balance(0), "good-faith ticket loads");
            long[] rng2 = m.issueTickets(0, 1, null, true);
            byte[] tr2 = p.pay(m.ticket(rng2[0]), Hex.atoms(10));
            T.eq(Card.SW_REVOKED, m.sw(Card.CREDIT, 0, 0, tr2), "ticket issued after the revocation");
            w.conserved();
        });
        t.test("snapshot", "a snapshot older than the chip's own, or signed by a vendor not accepted, or with altered entries: refused", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 10, 0), x = w.card("X", w.lab.v2, 10, 0);
            w.start();
            byte[] old = w.lab.snapshotHeader(w.lab.v1);
            w.lab.revoke(x);
            w.lab.pushSnapshot(p, w.lab.v1);
            T.eq(Card.SW_STALE, p.sw(Card.SNAP_BEGIN, 0, 0, old), "older");
            w.lab.snapVersion++;
            T.eq(Card.SW_FOREIGN_VENDOR, p.sw(Card.SNAP_BEGIN, 0, 0, w.lab.snapshotHeader(w.lab.foreign)), "foreign signer");
            p.snapBegin(w.lab.snapshotHeader(w.lab.v2));
            p.snapVendors(0, Hex.cat(w.lab.vendors.get(0), w.lab.vendors.get(1)));
            T.eq(Card.SW_OK, p.sw(Card.SNAP_COMMIT, 0, 0, null), "a complete newer snapshot from another accepted vendor commits");
            T.eq(w.lab.snapVersion, p.state().snapVer, "version");
            byte[] bad = Hex.cat(w.lab.v1.snapshotHeader(w.lab.snapVersion + 1, w.lab.block, w.lab.vendors, new ArrayList<byte[]>()));
            T.eq(Card.SW_STALE, p.sw(Card.SNAP_BEGIN, 0, 0, bad), "a list that drops a revocation");
            w.lab.snapVersion++;
            p.snapBegin(w.lab.snapshotHeader(w.lab.v1));
            p.snapVendors(0, Hex.cat(w.lab.vendors.get(0), w.lab.foreign.entry()));
            T.eq(Card.SW_DIGEST_MISMATCH, p.sw(Card.SNAP_COMMIT, 0, 0, null), "a foreign vendor slipped into the list");
            T.eq(w.lab.snapVersion - 1, p.state().snapVer, "the live snapshot is unchanged");
            w.conserved();
        });
        t.test("snapshot", "the relay drops SNAP_COMMIT: the chip keeps its old snapshot intact", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 10, 0), x = w.card("X", w.lab.v2, 10, 0);
            w.start();
            w.lab.revoke(x);
            p.snapBegin(w.lab.snapshotHeader(w.lab.v1));
            p.snapVendors(0, Hex.cat(w.lab.vendors.get(0), w.lab.vendors.get(1)));
            p.snapRevocations(0, w.lab.revocations.get(0));
            ((SimCard) p.io).powerCycle();
            T.eq(0, p.state().revCount, "old list live");
            Phone.tap(p, x, 0, Hex.atoms(1));
            w.conserved();
        });

        // ------------------------------------------------------------ PIN and owner limits
        t.test("pin", "the relay splits a large payment into PIN-less pieces: stopped at 150 since the last PIN", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 1000, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            int ok = 0;
            for (int i = 0; i < 10; i++) {
                if (p.sw(Card.PAY, 0, 0, Hex.cat(r.hello(0), Hex.u64(Hex.atoms(40)))) == Card.SW_OK) {
                    ok++;
                }
            }
            T.eq(3, ok, "three payments of 40 (120), the fourth would pass 150");
            w.conserved();
        });
        t.test("pin", "an arm is used by exactly one payment; a replayed PAY APDU cannot use it again", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 1000, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            p.verifyPinArm(Lab.PIN, 0, Hex.atoms(200));
            ((SimCard) p.io).powerCycle();
            Phone.introduce(p, r);
            byte[] h = r.hello(0);
            byte[] apdu = Card.command(Card.PAY, 0, 0, Hex.cat(h, Hex.u64(Hex.atoms(180))));
            byte[] first = p.io.transmit(apdu);
            T.eq(0x9000, ((first[first.length - 2] & 0xFF) << 8) | (first[first.length - 1] & 0xFF), "first use");
            byte[] again = p.io.transmit(apdu);
            T.eq(Card.SW_NONCE_NOT_OUTSTANDING, ((again[again.length - 2] & 0xFF) << 8) | (again[again.length - 1] & 0xFF), "replayed APDU");
            T.eq(Card.SW_PIN_REQUIRED, p.sw(Card.PAY, 0, 0, Hex.cat(r.hello(0), Hex.u64(Hex.atoms(180)))), "arm spent");
            w.conserved();
        });
        t.test("pin", "a finder without the PIN: 3 wrong PINs block the card; payments above the allowance stay refused", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 1000, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            for (int i = 0; i < 3; i++) {
                p.sw(Card.VERIFY_PIN, 0, 0, Hex.ascii("000" + i));
            }
            T.eq(Card.SW_PIN_BLOCKED, p.sw(Card.VERIFY_PIN, 0, 0, Lab.PIN), "blocked");
            Phone.introduce(p, r);
            T.eq(Card.SW_PIN_REQUIRED, p.sw(Card.PAY, 0, 0, Hex.cat(r.hello(0), Hex.u64(Hex.atoms(60)))), "above the allowance");
            T.eq(Card.SW_PIN_REQUIRED, p.sw(Card.DEFUND, 0, 0, Hex.u64(Hex.atoms(10))), "defund");
            w.conserved();
        });
        t.test("limits", "the owner's per-payment and holding limits hold against a relay presenting two HELLOs", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 1000, 0), r = w.card("R", w.lab.v2, 100, 0);
            w.start();
            r.verifyPin(Lab.PIN);
            r.setLimits(0, Hex.atoms(150), 0, Lab.PL_PAY, Lab.PL_TOT);
            byte[] h1 = r.hello(0, Hex.atoms(30));
            byte[] h2 = r.hello(0);
            T.eq(Hex.atoms(20), Hex.u64(h2, Wire.H_CAP), "second HELLO only offers the unreserved room");
            Phone.introduce(p, r);
            p.verifyPin(Lab.PIN);
            p.ack(r.credit(p.pay(h1, Hex.atoms(30))));
            p.ack(r.credit(p.pay(h2, Hex.atoms(20))));
            T.eq(Hex.atoms(150), r.balance(0), "exactly the holding limit");
            T.eq(Card.SW_LIMIT, r.sw(Card.HELLO, 0, 0, null), "no room left");
            w.conserved();
        });

        // ------------------------------------------------------------ double spend by the payer's owner
        t.test("double spend", "the payer asks the receiver for a cancel proof of a credited transfer: refused", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(10));
            r.credit(tr);
            T.eq(Card.SW_ALREADY_CREDITED, r.sw(Card.CANCEL_PROOF, 0, 0, tr), "no proof for a credited transfer");
            w.conserved();
            T.eq(Hex.atoms(90), p.balance(0), "paid once");
        });
        t.test("double spend", "a torn tap re-sent to two different receivers: only the named one can credit it", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 100, 0), r = w.card("R", w.lab.v2, 0, 0), c = w.card("C", w.lab.v1, 0, 0);
            w.start();
            Phone.introduce(p, r);
            byte[] tr = p.pay(r.hello(0), Hex.atoms(10));
            c.peer(p.cert());
            T.eq(Card.SW_NOT_FOR_ME, c.sw(Card.CREDIT, 0, 0, tr), "other receiver");
            w.conserved();
            T.eq(Hex.atoms(10), r.balance(0) + c.balance(0), "credited once in total");
        });
        // ------------------------------------------------------------ gap fixes of 2026-09-29 (chip-balance-design.md 4.4 and 5.1)
        // Defund vouchers reach the chain through the untrusted phone, in any order (ChainModel: the chain's D1/D2 rule).
        t.test("defund order", "two defund vouchers delivered to the chain out of order (the newer first, the older late): the "
            + "owner is paid both amounts, once; the late voucher is refused", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 500, 0);
            w.start();
            p.verifyPin(Lab.PIN);
            byte[] h1 = p.defund(0, Hex.atoms(40));
            p.verifyPin(Lab.PIN);
            byte[] h2 = p.defund(0, Hex.atoms(25));
            w.noRise("two vouchers committed, none posted");
            long a2 = ChainModel.post(p, h2[0]);
            long a1 = ChainModel.post(p, h1[0]);
            T.yes(a2 > 0, "the newer voucher pays");
            T.eq(-1L, a1, "the older voucher, posted late, is refused");
            T.eq(Hex.atoms(65), ChainModel.paid(p), "paid in total (" + ChainModel.log(p) + ")");
            T.eq(Hex.atoms(435), p.balance(0), "chip balance");
            w.conserved();
        });
        t.test("defund order", "drop: the phone keeps no voucher and posts nothing while six defunds overwrite the chip's 4-voucher "
            + "ring; posting what the chip still holds pays everything, once", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 500, 0);
            w.start();
            long total = 0;
            for (int k = 1; k <= 6; k++) {
                p.verifyPin(Lab.PIN);
                p.defund(0, Hex.atoms(10 * k));
                total += Hex.atoms(10 * k);
            }
            w.noRise("six vouchers committed, four kept");
            ChainModel.settle(p, false);
            T.eq(total, ChainModel.paid(p), "paid (" + ChainModel.log(p) + ")");
            w.conserved();
        });
        t.test("defund order", "delay and interleave: vouchers 1 and 3 posted, voucher 2 arrives last: refused, nothing lost; "
            + "a fourth voucher then pays only its own amount", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 500, 0);
            w.start();
            int[] ring = new int[4];
            for (int k = 0; k < 3; k++) {
                p.verifyPin(Lab.PIN);
                ring[k] = p.defund(0, Hex.atoms(20))[0];
            }
            ChainModel.post(p, ring[0]);
            ChainModel.post(p, ring[2]);
            T.eq(-1L, ChainModel.post(p, ring[1]), "voucher 2, late");
            T.eq(Hex.atoms(60), ChainModel.paid(p), "paid after three (" + ChainModel.log(p) + ")");
            p.verifyPin(Lab.PIN);
            ring[3] = p.defund(0, Hex.atoms(7))[0];
            T.eq(Hex.atoms(7), ChainModel.post(p, ring[3]), "the fourth pays its own amount");
            w.conserved();
        });
        t.test("defund order", "double defund attempts: every voucher posted twice, and each again after the newest; the chain "
            + "never pays more than the chip debited", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 500, 0);
            w.start();
            int[] ring = new int[3];
            for (int k = 0; k < 3; k++) {
                p.verifyPin(Lab.PIN);
                ring[k] = p.defund(0, Hex.atoms(30))[0];
            }
            for (int k = 0; k < 3; k++) {
                ChainModel.post(p, ring[k]);
                T.eq(-1L, ChainModel.post(p, ring[k]), "voucher " + (k + 1) + " again");
            }
            for (int k = 0; k < 3; k++) {
                T.eq(-1L, ChainModel.post(p, ring[k]), "voucher " + (k + 1) + " after the newest");
            }
            T.eq(Hex.atoms(90), ChainModel.paid(p), "paid exactly what was debited");
            w.conserved();
        });
        t.test("defund order", "modify: a voucher whose amount field the relay raised is refused by the chain (the LX16 "
            + "signature covers the message); the genuine one still pays", () -> {
            W w = new W();
            Card p = w.card("P", w.lab.v1, 500, 0);
            w.start();
            p.verifyPin(Lab.PIN);
            byte[] h = p.defund(0, Hex.atoms(40));
            byte[] msg = Hex.sub(h, 1, 52);
            byte[][] sig = p.defundSignature(h[0]);
            byte[] pk = Hex.sub(p.lxPubkey((int) Hex.u32(msg, 0)), 160, 32);
            T.eq(-1L, ChainModel.post(p.chipId(), put(msg, 4, Hex.u64(Hex.atoms(400))), sig[0], sig[1], pk), "raised");
            T.eq(Hex.atoms(40), ChainModel.post(p, h[0]), "genuine");
            w.conserved();
        });

        // Receive tickets (4.4): the merchant's phone, untrusted, may hand one ticket to several payers.
        t.test("ticket reuse", "one receive ticket used by two payers: both payments load into the merchant's card, each once "
            + "(replays load nothing); neither payer is left waiting for a cancel proof", () -> {
            W w = new W();
            Card m = w.card("M", w.lab.v1, 0, 0), p1 = w.card("P1", w.lab.v2, 100, 0), p2 = w.card("P2", w.lab.v2, 100, 0);
            w.start();
            long[] rng = m.issueTickets(0, 2, null, false);
            byte[] tk = m.ticket(rng[0]);
            p1.peer(m.cert());
            p2.peer(m.cert());
            byte[] t1 = p1.pay(tk, Hex.atoms(10)), t2 = p2.pay(tk, Hex.atoms(15));
            w.noRise("two payments on one ticket");
            m.peer(p1.cert());
            m.credit(t1);
            m.peer(p2.cert());
            m.credit(t2);
            m.credit(t2);
            m.peer(p1.cert());
            m.credit(t1);
            T.eq(Hex.atoms(25), m.balance(0), "both loaded, once each");
            T.eq(Hex.atoms(90), p1.balance(0), "first payer paid once");
            T.eq(Hex.atoms(85), p2.balance(0), "second payer paid once, not restored");
            T.eq(2, m.ticketLog().size(), "ticket log");
            w.conserved();
            T.eq(Hex.atoms(25), m.balance(0), "recovery changed nothing");
        });
        t.test("ticket reuse", "delay: the second payer's transfer on a reused ticket reaches the merchant's card only after 40 "
            + "other payments were loaded (its credit log has wrapped) and the card left the field: it still loads, once", () -> {
            W w = new W();
            Card m = w.card("M", w.lab.v1, 0, 0), p1 = w.card("P1", w.lab.v2, 100, 0), p2 = w.card("P2", w.lab.v2, 100, 0);
            Card c = w.card("C", w.lab.v1, 200, 0);
            w.start();
            long[] rng = m.issueTickets(0, 1, null, false);
            byte[] tk = m.ticket(rng[0]);
            p1.peer(m.cert());
            p2.peer(m.cert());
            byte[] t1 = p1.pay(tk, Hex.atoms(10)), t2 = p2.pay(tk, Hex.atoms(15));
            m.peer(p1.cert());
            m.credit(t1);
            for (int i = 0; i < 40; i++) {
                Phone.tap(c, m, 0, Hex.atoms(1));
            }
            ((SimCard) m.io).powerCycle();
            m.peer(p2.cert());
            m.credit(t2);
            T.eq(Hex.atoms(65), m.balance(0), "10 + 40 + 15");
            T.eq(Hex.atoms(85), p2.balance(0), "second payer paid once");
            m.credit(t2);
            T.eq(Hex.atoms(65), m.balance(0), "a late replay loads nothing");
            w.conserved();
        });
        t.test("ticket reuse", "drop: the phone loses the first payer's transfer; the second payer's use of the same ticket loads; "
            + "the first payer's card re-sends the same bytes at its next tap and they load too", () -> {
            W w = new W();
            Card m = w.card("M", w.lab.v1, 0, 0), p1 = w.card("P1", w.lab.v2, 100, 0), p2 = w.card("P2", w.lab.v2, 100, 0);
            w.start();
            long[] rng = m.issueTickets(0, 1, null, false);
            byte[] tk = m.ticket(rng[0]);
            p1.peer(m.cert());
            p2.peer(m.cert());
            byte[] t1 = p1.pay(tk, Hex.atoms(10));
            byte[] t2 = p2.pay(tk, Hex.atoms(15));
            m.peer(p2.cert());
            m.credit(t2);
            w.noRise("the first transfer lost by the phone, still in the payer's ring");
            byte[] again = p1.resend(Hex.u32(t1, Wire.X_N));
            T.yes(Arrays.equals(again, t1), "the same signed bytes");
            m.peer(p1.cert());
            m.credit(again);
            T.eq(Hex.atoms(25), m.balance(0), "both loaded");
            T.eq(Hex.atoms(90), p1.balance(0), "first payer paid once, not restored");
            w.conserved();
        });
        t.test("ticket reuse", "bound: a phone reuses the 22 tickets of one batch for 66 payments by 3 payers; 64 load, the last 2 "
            + "are refused at loading (ticket log full) and each is restored by an exact cancel proof; nothing created", () -> {
            W w = new W();
            Card m = w.card("M", w.lab.v1, 0, 0);
            Card[] ps = { w.card("P1", w.lab.v2, 100, 0), w.card("P2", w.lab.v2, 100, 0), w.card("P3", w.lab.v1, 100, 0) };
            w.start();
            long[] rng = m.issueTickets(0, 22, null, false);
            List<byte[]> trs = new ArrayList<byte[]>();
            List<Card> who = new ArrayList<Card>();
            for (Card p : ps) {
                p.peer(m.cert());
                for (int j = 0; j < 22; j++) {
                    trs.add(p.pay(m.ticket(rng[0] + j), A));
                    who.add(p);
                }
            }
            int loaded = 0, refused = 0;
            for (int k = 0; k < trs.size(); k++) {
                Card p = who.get(k);
                m.peer(p.cert());
                int sw = m.sw(Card.CREDIT, 0, 0, trs.get(k));
                if (sw == Card.SW_OK) {
                    loaded++;
                    continue;
                }
                T.eq(Card.SW_TICKET_LOG_FULL, sw, "refusal " + k);
                refused++;
                byte[] proof = m.cancelProof(trs.get(k));
                p.peer(m.cert());
                p.cancel(proof);
                m.peer(p.cert());
                T.eq(Card.SW_NONCE_NOT_OUTSTANDING, m.sw(Card.CREDIT, 0, 0, trs.get(k)), "never loads after its cancel proof");
            }
            T.eq(64, loaded, "loaded");
            T.eq(2, refused, "refused");
            T.eq(Hex.atoms(64), m.balance(0), "merchant");
            T.eq(Hex.atoms(80), ps[2].balance(0), "third payer: 22 paid, 2 restored");
            w.conserved();
        });
        t.test("ticket reuse", "documented residual: transfers the merchant's phone holds back until after a new batch do not "
            + "load (the batch is closed); one on a ticket used once is restored by a cancel proof; one on a reused ticket gets "
            + "'unknown' and stays in flight (the merchant's own loss; nothing created)", () -> {
            W w = new W();
            Card m = w.card("M", w.lab.v1, 0, 0), p1 = w.card("P1", w.lab.v2, 100, 0), p2 = w.card("P2", w.lab.v2, 100, 0);
            Card p3 = w.card("P3", w.lab.v2, 100, 0);
            w.start();
            long[] rng = m.issueTickets(0, 2, null, false);
            byte[] tkA = m.ticket(rng[0]), tkB = m.ticket(rng[0] + 1);
            p1.peer(m.cert());
            p2.peer(m.cert());
            p3.peer(m.cert());
            byte[] t1 = p1.pay(tkA, Hex.atoms(10)), t2 = p2.pay(tkA, Hex.atoms(15)), t3 = p3.pay(tkB, Hex.atoms(5));
            m.peer(p1.cert());
            m.credit(t1);
            m.issueTickets(0, 2, null, true);
            m.peer(p3.cert());
            T.eq(Card.SW_NONCE_NOT_OUTSTANDING, m.sw(Card.CREDIT, 0, 0, t3), "closed batch, ticket used once");
            byte[] proof = m.cancelProof(t3);
            p3.peer(m.cert());
            p3.cancel(proof);
            T.eq(Hex.atoms(100), p3.balance(0), "restored");
            m.peer(p2.cert());
            T.eq(Card.SW_ALREADY_CREDITED, m.sw(Card.CREDIT, 0, 0, t2), "closed batch, reused ticket: refused");
            T.eq(Card.SW_UNKNOWN_STATE, m.sw(Card.CANCEL_PROOF, 0, 0, t2), "the card cannot prove it was not loaded");
            w.noRise("the held-back transfer stays counted in flight");
            T.eq(w.initial[0], w.totals()[0], "nothing lost from the books");
        });
        return t;
    }
}
