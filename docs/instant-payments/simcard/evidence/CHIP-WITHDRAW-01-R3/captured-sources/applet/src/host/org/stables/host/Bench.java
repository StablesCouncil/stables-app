package org.stables.host;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;


/**
 * The benchmark harness (chip-balance-design.md 0c.2 item 4). APDU-driven: the same code runs against jCardSim now
 * (`bench`) and against a real card over PC/SC later (`bench --pcsc "<reader name part>"`, with the test CAP loaded
 * by GlobalPlatformPro on a test card that keeps its default keys).
 *
 * Every timing is host-measured wall time per APDU. Per-operation figures use two iteration counts in one APDU and take
 * the difference, which removes the APDU round trip. In the simulator every number is RELATIVE ONLY and NOT
 * REPRESENTATIVE of a card (Phase 0 decision 6); the JCAlgTest J3R180 figures stay the reference until a card is timed.
 */
public final class Bench {
    private Bench() { }

    static final String[] SIZES = { "16", "32", "64", "128", "256", "512" };

    // the benchmark applet's instructions (host copy: the harness must not need the applet classes on a real card)
    static final int INS_SHA = 0x02, INS_AES = 0x04, INS_SIGN = 0x06, INS_VERIFY = 0x08, INS_LX_KEYGEN = 0x0A,
        INS_LX_BLOCK = 0x0C, INS_MEM = 0x0E, INS_ECGEN = 0x10, INS_COMMIT = 0x12, INS_DIGESTS = 0x14;

    static final class Line {
        final String what, value, reference;

        Line(String what, String value, String reference) {
            this.what = what;
            this.value = value;
            this.reference = reference;
        }
    }

    /** Median wall time (ms) of one APDU, over reps runs. */
    static double timeApdu(Card c, int ins, int p1, int p2, byte[] data, int reps) {
        double[] v = new double[reps];
        for (int i = 0; i < reps; i++) {
            long t0 = System.nanoTime();
            c.call(ins, p1, p2, data);
            v[i] = (System.nanoTime() - t0) / 1e6;
        }
        Arrays.sort(v);
        return v[reps / 2];
    }

    /** Per-operation time from two iteration counts in one APDU. */
    static double perOp(Card c, int ins, int p1, byte[] data, int lo, int hi) {
        double a = timeApdu(c, ins, p1, lo, data, 5), b = timeApdu(c, ins, p1, hi, data, 5);
        return Math.max(0, (b - a) / (hi - lo));
    }

    static String ms(double v) {
        return String.format("%.3f ms", v);
    }

    public static String run(Apdu io, Card applet, boolean simulated) {
        if (!io.select(SimCard.AID_BENCH)) {
            throw new IllegalStateException("benchmark applet " + Hex.x(SimCard.AID_BENCH) + " not selectable on " + io.name());
        }
        Card b = new Card(io);
        List<Line> out = new ArrayList<Line>();
        String[] shaRef = { "2.23 ms", "2.56 ms", "3.64 ms", "4.95 ms", "7.87 ms", "13.6 ms" };
        for (int s = 0; s < SIZES.length; s++) {
            out.add(new Line("SHA-256, " + SIZES[s] + " B", ms(perOp(b, Bench.INS_SHA, s, null, 2, 22)), shaRef[s]));
        }
        for (int s : new int[] { 0, 5 }) {
            out.add(new Line("AES-256 ECB, " + SIZES[s] + " B", ms(perOp(b, Bench.INS_AES, s, null, 2, 22)),
                s == 5 ? "2.48 ms" : "-"));
        }
        out.add(new Line("P-256 ECDSA-SHA256 sign, 32 B", ms(perOp(b, Bench.INS_SIGN, 0, null, 1, 6)), "31.96 ms (SHA-1 variant, 256 B)"));
        out.add(new Line("P-256 ECDSA-SHA256 sign, 256 B", ms(perOp(b, Bench.INS_SIGN, 1, null, 1, 6)), "31.96 ms"));
        out.add(new Line("P-256 ECDSA-SHA256 verify, 256 B", ms(perOp(b, Bench.INS_VERIFY, 1, null, 1, 6)), "30.22 ms"));
        out.add(new Line("P-256 key pair generation", ms(perOp(b, Bench.INS_ECGEN, 0, null, 1, 4)), "26.8 ms"));
        String[] txRef = { "16", "64", "150", "250" };
        for (int s = 0; s < 4; s++) {
            out.add(new Line("transaction: begin, write " + txRef[s] + " B, commit", ms(perOp(b, Bench.INS_COMMIT, s, null, 1, 11)),
                "atomic copy 3.2 to 5.6 ms; commit unmeasured (ASSUMED 10 to 30 ms)"));
        }
        out.add(new Line("LX16 key generation (one key: 255 x (AES + 4 SHA-256) + 6 chunk hashes)",
            ms(timeApdu(b, Bench.INS_LX_KEYGEN, 0, 0, Hex.u16(5), 3)), "about 1.2 s (ASSUMED arithmetic)"));
        long t0 = System.nanoTime();
        int bytes = 0;
        for (int blk = 0; blk < 34; blk++) {
            bytes += b.call(Bench.INS_LX_BLOCK, 0, blk, Hex.u16(5)).length;
        }
        double sig = (System.nanoTime() - t0) / 1e6;
        out.add(new Line("LX16 signature streamed out: 34 APDUs, " + bytes + " B (R and C; the 160 B chunk digests come with DEFUND)",
            ms(sig), "about 0.05 s of chip time + about 37 APDUs (ASSUMED)"));
        byte[] mem = b.call(Bench.INS_MEM, 0, 0, null);
        out.add(new Line("JCSystem.getAvailableMemory: persistent / transient reset / transient deselect (short form)",
            Hex.u16(mem, 0) + " / " + Hex.u16(mem, 2) + " / " + Hex.u16(mem, 4) + " B",
            "J3R180: 139,360 B persistent, 4,084 B transient (JCAlgTest); jCardSim always reports 32,767"));
        out.add(new Line("JCSystem.getMaxCommitCapacity", (short) Hex.u16(mem, 6) + " B", "UNKNOWN on the J3R180; jCardSim always 32,767"));

        // the Stables applet itself: its own allocation tally and a whole tap (simulator: two cards)
        io.select(SimCard.AID_APPLET);
        Card.State st = applet.state();
        out.add(new Line("memory per account: persistent arrays the Stables applet allocates at install (its own tally)",
            st.alloc + " B", "25 to 35 KB (ASSUMED sizing, 3.1); key objects and object headers not included"));
        out.add(new Line("memory per revocation entry", "8 B (2,048 entries = 16,384 B)", "8 B (3.1)"));
        out.add(new Line("memory per pending transfer (the exact signed TRANSFER)", "218 B (16 entries)", "about 150 B (3.1)"));
        out.add(new Line("memory per accepted vendor (double-buffered for atomic snapshot updates)", "2 x 73 B (16 entries)", "about 75 B (3.1)"));
        out.add(new Line("credited-nonce bitmap", "8,192 B (65,536 receives per chip)", "8 KB (3.1)"));
        out.add(new Line("LX16 per key", "1 bit used + 0 B stored (secrets re-derived from a 32 B AES seed)", "1 bit + 32 B seed (3.1)"));

        StringBuilder sb = new StringBuilder();
        sb.append("# Benchmark (").append(simulated ? "jCardSim: RELATIVE ONLY, NOT REPRESENTATIVE" : "card: " + io.name()).append(")\n\n");
        if (simulated) {
            sb.append("These figures come from the JVM running jCardSim and Bouncy Castle. They show that the harness runs and how "
                + "operations compare with each other in the simulator; they say nothing about a card (Phase 0 decision 6). "
                + "The reference column is the JCAlgTest J3R180 figure (VERIFIED, card-capabilities.md) or the design's "
                + "ASSUMED arithmetic, and stays the reference until a card is timed with this same harness over PC/SC.\n\n");
        }
        sb.append("| Measurement | ").append(simulated ? "Simulator (not representative)" : "This card").append(" | J3R180 reference |\n|---|---|---|\n");
        for (Line l : out) {
            sb.append("| ").append(l.what).append(" | ").append(l.value).append(" | ").append(l.reference).append(" |\n");
        }
        return sb.toString();
    }

    /** A whole tap between two simulated cards, APDU by APDU (simulator only). */
    public static String tapTiming() {
        Lab lab = new Lab();
        Card p = lab.card("P", lab.v1, Hex.atoms(100), 0, false), r = lab.card("R", lab.v2, 0, 0, false);
        StringBuilder sb = new StringBuilder("\n## A whole tap in the simulator (not representative)\n\n| Step | Time |\n|---|---|\n");
        long t0 = System.nanoTime();
        long a = System.nanoTime();
        byte[] rc = r.cert(), pc = p.cert();
        sb.append("| read both certificates | ").append(ms((System.nanoTime() - a) / 1e6)).append(" |\n");
        a = System.nanoTime();
        p.peer(rc);
        r.peer(pc);
        sb.append("| PEER both ways (2 certificate verifications) | ").append(ms((System.nanoTime() - a) / 1e6)).append(" |\n");
        a = System.nanoTime();
        byte[] h = r.hello(0);
        sb.append("| HELLO (commit nonce, sign) | ").append(ms((System.nanoTime() - a) / 1e6)).append(" |\n");
        a = System.nanoTime();
        byte[] tr = p.pay(h, Hex.atoms(10));
        sb.append("| PAY (verify HELLO, sign, commit, emit) | ").append(ms((System.nanoTime() - a) / 1e6)).append(" |\n");
        a = System.nanoTime();
        byte[] ack = r.credit(tr);
        sb.append("| CREDIT (verify, commit, sign ACK) | ").append(ms((System.nanoTime() - a) / 1e6)).append(" |\n");
        a = System.nanoTime();
        p.ack(ack);
        sb.append("| ACK (verify, commit) | ").append(ms((System.nanoTime() - a) / 1e6)).append(" |\n");
        sb.append("| **whole tap** | ").append(ms((System.nanoTime() - t0) / 1e6)).append(" |\n");
        sb.append("\nDesign estimate for a card tapped on a phone: about 0.9 to 1.4 s (ASSUMED arithmetic, 4.3).\n");
        return sb.toString();
    }

    /** A simulated card with both applets, for `bench` without a reader. */
    public static Object[] simulated() {
        Lab lab = new Lab();
        Card c = lab.card("bench-card", lab.v1, Hex.atoms(100), 0, true);
        return new Object[] { c.io, c };
    }

    /** Real card over PC/SC. Returns null (and prints the readers) when none matches. */
    public static Object[] pcsc(String readerPart) throws Exception {
        List<javax.smartcardio.CardTerminal> rs;
        try {
            rs = PcscCard.readers();
        } catch (Exception e) {
            System.out.println("PC/SC: no reader available (" + e.getClass().getSimpleName() + ": " + e.getMessage() + ")");
            return null;
        }
        System.out.println("PC/SC readers: " + rs);
        if (rs.isEmpty()) {
            return null;
        }
        PcscCard io = PcscCard.open(readerPart);
        io.select(SimCard.AID_APPLET);
        return new Object[] { io, new Card(io) };
    }
}
