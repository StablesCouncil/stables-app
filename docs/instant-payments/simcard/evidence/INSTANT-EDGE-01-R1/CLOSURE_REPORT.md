# INSTANT-EDGE-01-R1: closure report

- **Record:** `experiment-record.md` (written before the first post). **Run:** R1, 2026-10-03 19:10Z to 22:58Z.
- **Result:** **GREEN for E1 to E5**; E6 answered by the existing chain cases. Four app defects found and fixed during
  the run (0.0.12.015 to 0.0.12.018), each with a gate that fails on the build before. Display notes listed below.

| Case | Result | Key evidence |
|---|---|---|
| E1 a fresh install sees older vault coins | PASS (built in .015, corrected in .016) | 9301: 3 of 6 vault coins before, 6 of 6 after its app imported the snapshot |
| E2 Remove a currency never added, Savings holding none | PASS | registration paid with 1 atom of Winiwa (block 2,347,665); withdrawal spent the old imported coin 611.195 xWiniwa (block 2,347,671) |
| E3 app closed mid-Remove | PASS | resumed by itself after reopening; Received |
| E4 node connection lost mid-Remove | PASS | not posted, debit given back, "Not sent"; the retry completed |
| E5 the vault coin taken by another transaction | PASS | merge won (block 2,347,709); the app rebuilt the same Remove after 20 min (block 2,347,730); paid once |
| E6 merge-first Remove | not run live | chain cases in `verify-instant-balance.mjs` |

**Defects fixed:** (1) .015 the snapshot did not carry Instant vault coins (new installs could not Remove from older
coins); (2) .016 just-imported coins were filed as order-book entries; (3) .017 a follow request made during a pass was
lost (an Add mined but never credited until the app was reopened); (4) .018 the Android app raised "Payment received"
for coins at the Instant vault and registration addresses (founder report).

**Display notes, not fixed (Savings figure, the founder's area):** (a) while a Remove's registration spends a Savings
coin, Savings dips by that coin until the change confirms (C' 0.00 for a minute, B 2,658.37 for 4 minutes); (b) the
double count of a settling Remove can still appear for one read (~20 s) because block height and balance are read
separately; (c) while a withdrawal that will be dropped waits out its 20 minutes, Savings shows the pending amount.
Also: three apps upgrading at once each published a snapshot (SAND only; the 8-hour limit is per device); the web
preview's own platform switcher can cover a dropdown near the bottom of a short screen (preview only).

**Not proven:** phones, NFC, the embedded node, a second operator (L2 only). Evidence: `run-log.md`, `steps/`, `raw/`.
**Recommendation:** close green; the founder's phone test (guide in the shared doc) is the next step.
