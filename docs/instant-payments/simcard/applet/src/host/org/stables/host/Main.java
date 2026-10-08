package org.stables.host;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Entry point for the harnesses:
 *   unit      jCardSim unit tests (every command)
 *   tear      the tear harness (instrumented build only)
 *   relay     the relay attack suite (optional: a regular expression of groups to run, and an output file name)
 *   bench     the benchmark harness (--pcsc "reader" for a real card)
 *   fixtures  LX16 and P-256 fixtures for crosscheck/lx16-crosscheck.mjs (optional: output file name)
 * -Dstables.d1=per-voucher makes the chain model apply the defund rule of the measured chip_account.kiss (before the
 * 2026-09-29 gap fix); the default is the cumulative rule of chip_account_v2_cumulative.kiss (see ChainModel).
 * Results are written to ../results (relative to the working directory: the applet folder).
 */
public final class Main {
    private Main() { }

    static final File RESULTS = new File("results");

    public static void main(String[] args) throws Exception {
        String what = args.length > 0 ? args[0] : "unit";
        RESULTS.mkdirs();
        // jCardSim's random generators are unseeded by default (see src/simshim): seed RandomData, and insist that the
        // seeded replacement for its key/nonce generator is ahead of jCardSim on the class path.
        System.setProperty("com.licel.jcardsim.randomdata.secure", "1");
        String shim = Class.forName("com.licel.jcardsim.crypto.SecureRandomNullProvider").getProtectionDomain()
            .getCodeSource().getLocation().toString();
        if (!shim.contains("simshim")) {
            throw new IllegalStateException("the seeded jCardSim shim must come before jCardSim on the class path: " + shim);
        }
        String build = TearControl.available() ? "instrumented (src/tear Persist/Ram)" : "as shipped (src/main)";
        System.out.println("Stables applet harness: " + what + ", applet build " + build + ", chain defund rule " + ChainModel.rule());
        int failed = 0;
        switch (what) {
            case "unit": {
                T t = UnitTests.run();
                String tag = TearControl.available() ? "tear-build" : "shipped-build";
                failed += t.failed();
                if (TearControl.available() && !TearControl.violations().isEmpty()) {
                    System.out.println("PERSISTENCE VIOLATIONS: " + TearControl.violations());
                    failed++;
                }
                StringBuilder cov = new StringBuilder("\n## Command coverage (measured at run time)\n\n| Instruction | Accepted | Refused |\n|---|---|---|\n");
                int covered = 0, both = 0;
                for (int ins : Card.ALL_INS) {
                    int[] c = Card.COVERAGE.get(ins);
                    int ok = c == null ? 0 : c[0], no = c == null ? 0 : c[1];
                    if (ok > 0) {
                        covered++;
                    }
                    if (ok > 0 && no > 0) {
                        both++;
                    }
                    cov.append("| ").append(Card.insName(ins)).append(" | ").append(ok).append(" | ").append(no).append(" |\n");
                }
                if (covered != Card.ALL_INS.length) {
                    failed++;
                }
                String covLine = "Commands exercised with success: " + covered + " of " + Card.ALL_INS.length
                    + "; with both a success and a refusal: " + both + ".";
                write("unit-tests-" + tag + ".md", "# Unit tests (jCardSim, applet " + build + ")\n\n"
                    + "Simulator only: shows the applet logic, never evidence about a card (Phase 0 decision 6).\n\n"
                    + t.summary() + "\n\n" + covLine + "\n\nPersistence-layer violations: "
                    + (TearControl.available() ? TearControl.violations().size() : "n/a (shipped build)") + "\n\n" + t.markdown() + cov);
                System.out.println(t.summary());
                System.out.println(covLine);
                break;
            }
            case "tear": {
                if (!TearControl.available()) {
                    throw new IllegalStateException("the tear harness needs the instrumented build (build/sim-tear) on the class path");
                }
                String filter = args.length > 1 ? args[1] : "";
                String out = args.length > 2 ? args[2] : "tear-results.md";
                TearHarness.Result r = TearHarness.run(filter);
                int bad = 0;
                for (TearHarness.Row row : r.rows) {
                    if (!row.pass()) {
                        bad++;
                    }
                }
                failed += bad;
                write(out, TearHarness.markdown(r));
                System.out.println("tear harness: " + (r.rows.size() - bad) + " of " + r.rows.size() + " interruption points pass; "
                    + "largest transaction " + r.maxTxBytes + " B at " + r.maxTxSite);
                break;
            }
            case "relay": {
                String groups = args.length > 1 ? args[1] : "";
                T t = RelaySuite.run(groups);
                failed += t.failed();
                if (TearControl.available() && !TearControl.violations().isEmpty()) {
                    System.out.println("PERSISTENCE VIOLATIONS: " + TearControl.violations());
                    failed++;
                }
                String rtag = TearControl.available() ? "tear-build" : "shipped-build";
                String rout = args.length > 2 ? args[2] : "relay-results-" + rtag + ".md";
                write(rout, "# Relay attack suite (jCardSim, applet " + build + ", chain defund rule " + ChainModel.rule() + ")\n\n"
                    + "Simulator only. The relay (an untrusted phone) sits between two or three simulated chips. Every row also checks "
                    + "that balances plus value in flight never rise, and that after the documented recovery (re-send the pending "
                    + "transfer, or the receiver's cancel proof) nothing is lost.\n\n"
                    + "Not built or tested (deferred by decision 14; hooks carried): fraud proofs, proof-of-cheating revocation, "
                    + "per-card caps, note expiry, hop limits.\n\n" + t.summary() + "\n\n" + t.markdown());
                System.out.println(t.summary());
                break;
            }
            case "bench": {
                boolean pcsc = args.length > 1 && args[1].equals("--pcsc");
                Object[] card = pcsc ? Bench.pcsc(args.length > 2 ? args[2] : "") : Bench.simulated();
                if (card == null) {
                    System.out.println("bench: no card reader present; nothing measured (expected until cards arrive)");
                    break;
                }
                String text = Bench.run((Apdu) card[0], (Card) card[1], !pcsc);
                if (!pcsc) {
                    text += Bench.tapTiming();
                }
                write(pcsc ? "bench-card.md" : "bench-sim.md", text);
                break;
            }
            case "fixtures":
                write(args.length > 1 ? args[1] : "lx16-fixtures.json", Fixtures.json());
                break;
            default:
                throw new IllegalArgumentException("unknown harness " + what);
        }
        System.exit(failed == 0 ? 0 : 1);
    }

    static void write(String name, String text) throws Exception {
        Files.write(new File(RESULTS, name).toPath(), text.getBytes(StandardCharsets.UTF_8));
        System.out.println("wrote results/" + name);
    }
}
