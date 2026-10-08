package org.stables.host;

import java.util.ArrayList;
import java.util.List;


/**
 * Card-made signatures exported for the cross-check against the EXISTING verifiers (crosscheck/lx16-crosscheck.mjs):
 * measure/ots.mjs, the KISS helper and D1 core scripts in lab dry runs, and a standard P-256 verifier (node:crypto).
 *
 *  - two defund vouchers from a personalised simulated chip (keys 1 and 2), with the public keys of its keys 0..7 for
 *    the key tree, and the chip's funding count and totals so the D1 record can be built;
 *  - two signatures by ONE bench LX16 key over the two fixed bench digests (the Stables applet never signs twice with
 *    a key, so the proof-of-cheating check uses the benchmark applet, whose keys are never registered anywhere);
 *  - P-256 messages: the vendor certificate, a HELLO, a TRANSFER, an ACK, with the public keys that must verify them.
 */
public final class Fixtures {
    private Fixtures() { }

    static String q(String k, String v) {
        return "\"" + k + "\": \"" + v + "\"";
    }

    static String h(byte[] b) {
        return "0x" + Hex.x(b);
    }

    public static String json() {
        Lab lab = new Lab();
        Card a = lab.card("A", lab.v1, Hex.atoms(600), 0, true);
        Card r = lab.card("R", lab.v2, 0, 0, false);
        byte[] chipId = a.chipId();
        // a payment first, so the voucher's counters (sent, received) are not all zero
        Phone.introduce(a, r);
        a.verifyPin(Lab.PIN);
        byte[] hello = r.hello(0);
        byte[] transfer = a.pay(hello, Hex.atoms(100));
        byte[] ack = r.credit(transfer);
        a.ack(ack);

        List<String> vouchers = new ArrayList<String>();
        long[] amounts = { Hex.atoms(250), Hex.atoms(40) };
        for (long y : amounts) {
            a.verifyPin(Lab.PIN);
            byte[] hdr = a.defund(0, y);
            byte[] msg = Hex.sub(hdr, 1, 52), d = Hex.sub(hdr, 53, 32), cd = Hex.sub(hdr, 85, 160);
            byte[][] sig = a.defundSignature(hdr[0]);
            int ki = (int) Hex.u32(msg, 0);
            byte[] pk = Hex.sub(a.lxPubkey(ki), 160, 32);
            vouchers.add("{" + String.join(", ", "\"keyIndex\": " + ki, q("message", h(msg)), q("digest", h(d)),
                q("chunkDigests", h(cd)), q("R", h(sig[0])), q("C", h(sig[1])), q("pk", h(pk))) + "}");
        }
        List<String> pks = new ArrayList<String>();
        for (int i = 0; i < 8; i++) {
            pks.add("\"" + h(Hex.sub(a.lxPubkey(i), 160, 32)) + "\"");
        }
        Card.Slot s0 = a.slot(0);

        // bench: one key, two digests
        SimCard sc = (SimCard) a.io;
        sc.select(SimCard.AID_BENCH);
        Card b = new Card(sc);
        int bk = 5;
        byte[] digests = b.call(Bench.INS_DIGESTS, 0, 0, null);
        byte[] bkey = b.call(Bench.INS_LX_KEYGEN, 0, 0, Hex.u16(bk));
        List<String> bsigs = new ArrayList<String>();
        for (int sel = 0; sel < 2; sel++) {
            byte[] rr = new byte[0], cc = new byte[0];
            for (int blk = 0; blk < 17; blk++) {
                rr = Hex.cat(rr, b.call(Bench.INS_LX_BLOCK, sel, blk, Hex.u16(bk)));
            }
            for (int blk = 17; blk < 34; blk++) {
                cc = Hex.cat(cc, b.call(Bench.INS_LX_BLOCK, sel, blk, Hex.u16(bk)));
            }
            bsigs.add("{" + String.join(", ", q("digest", h(Hex.sub(digests, 32 * sel, 32))), q("R", h(rr)), q("C", h(cc))) + "}");
        }
        List<String> benchPks = new ArrayList<String>();
        for (int i = 0; i < 8; i++) {
            benchPks.add("\"" + h(Hex.sub(b.call(Bench.INS_LX_KEYGEN, 0, 0, Hex.u16(i)), 160, 32)) + "\"");
        }
        sc.select(SimCard.AID_APPLET);

        StringBuilder sb = new StringBuilder("{\n");
        sb.append("  \"note\": \"Made by the Stables applet in jCardSim (simulator). Checked by crosscheck/lx16-crosscheck.mjs.\",\n");
        sb.append("  \"lx16\": {\n");
        sb.append("    ").append(q("chipId", h(chipId))).append(",\n");
        sb.append("    \"fundCount\": ").append(s0.k).append(",\n");
        sb.append("    \"fundedAtoms\": \"").append(s0.funded).append("\",\n");
        sb.append("    \"defundedAtoms\": \"").append(s0.defunded).append("\",\n");
        sb.append("    \"keyPks\": [").append(String.join(", ", pks)).append("],\n");
        sb.append("    \"vouchers\": [\n      ").append(String.join(",\n      ", vouchers)).append("\n    ]\n  },\n");
        sb.append("  \"bench\": {\n    \"keyIndex\": ").append(bk).append(",\n    ").append(q("pk", h(Hex.sub(bkey, 160, 32))))
            .append(",\n    ").append(q("chunkDigests", h(Hex.sub(bkey, 0, 160)))).append(",\n    \"keyPks\": [")
            .append(String.join(", ", benchPks)).append("],\n    \"signatures\": [\n      ")
            .append(String.join(",\n      ", bsigs)).append("\n    ]\n  },\n");
        sb.append("  \"p256\": {\n");
        sb.append("    ").append(q("vendorPub", h(lab.v1.pub))).append(",\n");
        sb.append("    ").append(q("chipPub", h(a.pubkey()))).append(",\n");
        sb.append("    ").append(q("receiverPub", h(r.pubkey()))).append(",\n");
        sb.append("    ").append(q("certificate", h(a.cert()))).append(",\n");
        sb.append("    ").append(q("hello", h(hello))).append(",\n");
        sb.append("    ").append(q("transfer", h(transfer))).append(",\n");
        sb.append("    ").append(q("ack", h(ack))).append(",\n");
        sb.append("    \"bodyLengths\": {\"certificate\": 79, \"hello\": 87, \"transfer\": 142, \"ack\": 119}\n  }\n}\n");
        return sb.toString();
    }
}
