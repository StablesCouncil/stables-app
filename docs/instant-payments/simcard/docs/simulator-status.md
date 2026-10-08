# Stage 2 in the simulator: what is verified, what waits for cards

**Date:** 2026-09-29. **Status:** the Stage 2 virtual work package (`chip-balance-design.md` 0c.2) has been built and
run in jCardSim. **Nothing here has touched a card, the app or the chain.** No card was bought (decision 15), no
chain command was posted or signed, and the only chain contact was dry runs (`runscript`, `mmrcreate`) on lab peer
9101.
**Where:** `../applet/` holds the source, build, harnesses and `results/`. Run everything with
`pwsh -File tools/build.ps1` from `applet/` (about 10 minutes).
**Tags:**
- **VERIFIED:** a test or build passed; the result file is named.
- **BELIEVED:** reasoned or read at a source, not tested by us.
- **UNKNOWN:** not known until a card says so.

Simulator results show that the applet's logic holds and agrees with our verifiers. They are **never evidence about a
card** (Phase 0 decision 6).

---

## 1. Summary

The Java Card applet of section 3 builds as a real CAP against the Java Card 3.0.4 API, and it does everything the
design asks in the simulator: it keeps balances per currency, pays chip to chip with P-256, commits before it emits,
re-sends a torn payment and has it credited once, applies the PIN rules, signs LX16 defund vouchers after a committed
debit, and applies owner revocations from registry snapshots. Four harnesses test it:

- the **tear harness** cut the power at every one of 465 interruption points, and all four invariants held at every
  one. It also caught all 6 deliberately broken versions of the applet;
- the **relay suite** ran 47 attacks through an untrusted relay, and every one was refused or recovered;
- the **LX16 cross-check**: card-made defund vouchers pass the existing `ots.mjs` and the measured KISS scripts on
  the lab node, and every measured refusal still refuses;
- the **benchmark** runs in the simulator now, and its PC/SC path is ready for a reader.

Two simulator traps were found and neutralised. **jCardSim gives every simulated card the same key and repeats ECDSA
nonces**, and **it does not roll back transactions**.

## 2. What the simulator has shown (VERIFIED)

| Deliverable (0c.2) | Result | Evidence (`applet/results/`) |
|---|---|---|
| CAP builds against Java Card 3.0.4 | `stables-test.cap` (applet + benchmark) and `stables-prod.cap` (applet only) convert with ant-javacard v26.05.15 (converter from the 3.0.5u4 kit, which reports itself as 3.0.5u3; `targetsdk` = the 3.0.4 kit). They import `javacard.framework` 1.5, `javacard.security` 1.5 and `javacardx.crypto` 1.5, which are the 3.0.4 versions, and pass the off-card verifier. No `ints` option, so the converter refuses any `int` bytecode | `build-info.md`, `build/cap/*.jca` |
| Unit tests cover every command | 40 of 40 tests pass, on both the shipped and the instrumented build. All 32 commands succeed at least once and are refused at least once. The install self-test passes all 8 checks, and a failed self-test leaves the applet inert (tested with a card reporting a 100-byte commit buffer) | `unit-tests-shipped-build.md`, `unit-tests-tear-build.md` |
| Source scan | No findings. The scan checks: the Java Card subset (no String, int, long, char, floating point), no SHA-3, allocation only at install, every field final, persistent arrays written only through `Persist`, the device key signing only in reviewed places, and every API used listed in `card-capabilities.md`. Negative control: 5 of 5 injected violations were reported | `source-scan.md` |
| No "sign anything" | Every signature covers a message the chip builds itself. Unknown instructions are refused (6D00; every undocumented even instruction code was probed), and the benchmark applet signs only fixed internal data with its own uncertified keys | `unit-tests-*.md`, `source-scan.md` |
| Tear harness | 465 of 465 interruption points pass I1 to I4 across 15 scenarios. The scenarios cover every command that writes: PAY, CREDIT, ACK, CANCEL, FUND, DEFUND, VERIFY_PIN, UNBLOCK, SET_LIMITS, CHANGE_PIN, the snapshot commands, SWAP_EXPECT and the swap receipt, ISSUE_TICKETS. The interruptions are a power cut before each write point, a lost response after each APDU, and power lost after each APDU. The largest single transaction writes 268 B | `tear-results.md` |
| Tear harness negative control | 6 of 6 mutants caught: a split PAY commit, the credited bit outside the commit, the LX16 key marked after the commit, a split CANCEL, the PIN try spent inside a transaction, and the PIN compared before the try is spent | `mutation-check.md`, `tear-mutant-M*.md` |
| Relay suite | 47 of 47 pass on both builds. Attacks: drop, delay, duplicate, replay (including against receive tickets), reorder, modify (amount, recipient, counter, currency, nonce, payer, signature; HELLO, ACK and cancel proof), 300 random bit-flips (all refused with proper status words), third-chip substitution, a foreign-vendor or self-made certificate, owner revocation (receiver and payer), stale, foreign-signed or tampered snapshots, a dropped SNAP_COMMIT, PIN splitting and arm replay, owner limits, and payer double-spend attempts. After each attack, balances plus in-flight value never rose, and after the documented recovery they equalled the start | `relay-results-*.md` |
| LX16 cross-check | 39 of 39 as expected. Card-made vouchers pass `measure/ots.mjs`. On lab peer 9101 (Minima 1.0.45.15), as `runscript` dry runs: the 5 helpers `lx16_helper_K5_P255.kiss` at 790 instructions each (the measured figure), the D1 core `d1_core_runscript.kiss` at 313 (the measured figure), and the K5 proof of cheating at 114, fed two bench signatures by one key. The measured refusals still refuse (tampered secret or complement, key index reused, label flipped, signed by another key, altered message, same secret twice, key not at that tree index) | `lx16-crosscheck.md`, `.json` |
| P-256 off card | The chip's certificate, HELLO, TRANSFER, ACK and cancel proof verify in the JDK's SunEC. The first four also verify in node:crypto (OpenSSL). Both are standard verifiers, independent of jCardSim's Bouncy Castle; altered messages are refused | `unit-tests-*.md`, `lx16-crosscheck.md` |
| Benchmark harness | Runs against the simulator; the numbers are relative only and **not representative**. The same code runs over PC/SC: today it reports "no reader". Memory per account (the applet's own tally of its arrays): 33,213 B | `bench-sim.md` |
| Dependencies | 64 files, each checked against its publisher's digest and recorded by SHA-256 | `../applet/deps.lock.json` |

**The applet in one paragraph.** One P-256 device key, generated on the chip at install. A vendor certificate over
that key, which the chip checks against its issuer key before storing it; the issuer key never goes on a card, and no
secret is shared between cards. Four currency slots, each holding a balance, the owner's limits, the PIN-less
allowance and the counters k, F, S, R, D. A signed payment counter n, and receiver nonces m (65,536 per chip). Pay:
HELLO, then PAY (commit, then emit), then CREDIT (commit, then emit the ACK), then ACK. A 16-entry pending ring
re-sends the exact signed transfer. A credited-nonce bitmap and a 32-entry credit log mean one credit per nonce, and
support a cancel proof when a transfer can never be credited. Receive tickets (4.4) and the swap secret (1.4) are
built. LX16 defund vouchers use keys 1 to 1,023, derived from an on-chip AES-256 seed. The key index, the digest and
the debit are committed together, and the signature is streamed from the stored record only. Registry snapshots come
signed by any accepted vendor. The revocation list is append-only and hash-checked; the vendor list is
double-buffered; both swap in one commit. Hooks carried and unused: the version byte, n, the snapshot version, k, F,
S, R, D, a status byte and a freshness field.

## 3. What the harnesses model, and their honest limits

- **Tearing is modelled, not measured.** jCardSim ignores transactions (VERIFIED, its source: begin and commit only
  count depth). Our instrumented `Persist` layer journals writes inside a transaction and rolls them back at a tear.
  It treats a write outside a transaction as one atomic step, which matches the Java Card specification for
  `Util.arrayCopy` and single bytes. It models the **specified semantics, not a JCOP4's EEPROM**: page writes, the
  real commit buffer, and the chip's own anti-tearing are not simulated (UNKNOWN until Phase 6).
- **What the tear model sees.** Every persistent array write goes through `Persist`. The source scan checks this
  statically, and a runtime check in the test build confirms it: 0 violations.
- **What it does not see.** Key objects (`genKeyPair`, `setKey`, `setW`) write inside Java Card classes, so the model
  does not journal them. They hold no value state: the device key and the seed are written once at install, and the
  peer and vendor keys are scratch values set for each tap.
- **One tear per run.** A second tear during recovery is not tested (BELIEVED harmless, since recovery reuses the same
  committed commands; not shown).
- **The PIN counter is the applet's own**, written through `Persist`, rather than `OwnerPIN`. This lets the harness
  prove that the try is spent durably before the comparison (mutants M5 and M6). The trade-off is that a real card's
  `OwnerPIN` is hardened by the vendor. Recommendation: decide at the first card build (open point 6).
- **The relay suite runs in one JVM.** It models the phone as bytes only, with no timing and no radio. "Delay" means
  events happen before the message arrives, since there is no clock and no expiry.
- **jCardSim artefacts found and neutralised** (VERIFIED in jCardSim 3.0.6.0 source):
  1. Key generation and ECDSA nonces use an unseeded SHA-1 generator. Every simulated card got the same key pair,
     and nonces repeat, which would leak a private key. A seeded test shim (`applet/src/simshim`) replaces that one
     class ahead of the jar, `RandomData` is seeded by jCardSim's own switch, and a unit test checks that two cards
     differ. **Never trust a key made in unmodified jCardSim.**
  2. `reset()` clears only CLEAR_ON_RESET memory. The harness also clears CLEAR_ON_DESELECT memory to model a card
     leaving the field.
  3. Memory and commit-capacity queries always return 32,767.
  4. Any uncaught exception becomes 6F00. None was seen in 300 fuzzed messages.
- **Simulator timings** (`bench-sim.md`) come from a PC. For example, a whole tap takes 50 to 60 ms in the JVM,
  against the design's 0.9 to 1.4 s estimate for a card.

## 4. What stays assumed or unknown until real cards

| Item | Status | Settled by |
|---|---|---|
| The CAP loads and installs on a J3R180 (CAP format, 3.0.4 on the card, the install parameters) | BELIEVED (the build targets 3.0.4 and verifies off card) | step 2 below |
| Secure random (`ALG_SECURE_RANDOM`) on the J3R180 | UNKNOWN. If the algorithm is missing, the install itself fails (getInstance throws); if it returns poor data, self-test bit 0x20 fails | step 2 below |
| Commit buffer at least 512 B (the largest transaction writes 268 B) | UNKNOWN | self-test bit 0x80 and `G_COMMITCAP` |
| P-256 with explicitly set domain parameters, ECDSA-SHA256 timings (31.96 / 30.22 ms), AES-256 ECB | P-256 support VERIFIED (JCAlgTest); our use UNKNOWN | self-test, `bench --pcsc` |
| Atomicity and tearing on silicon | UNKNOWN (the simulator only models the specification) | Phase 6: physical tears (pull the card or drop the field mid-APDU) |
| Tap time on a card (about 0.9 to 1.4 s card on phone) | BELIEVED (arithmetic, 4.3) | bench + timed taps |
| LX16 key generation (about 1.2 s) and signature streaming (34 APDUs) on the chip | BELIEVED (arithmetic) | `bench --pcsc` |
| Real memory footprint (arrays 33,213 B plus key objects and headers) | BELIEVED under 40 KB | `getAvailableMemory` before and after install |
| A Pixel's NFC with the card, and OMAPI with a SIM | UNKNOWN | Phase 6 |
| LX16's security argument | BELIEVED by its designer only | independent review before real value |
| KISS scripts mining on mainnet (`basic:false` budget) | UNKNOWN (section 9 of the design) | Phase 3 |

## 5. Choices made here that the design left open, and points for Chuck

These are implementation choices (BELIEVED sound, tested in the simulator). None reopens a settled decision.

1. **Wire formats.** Every signed message starts with "STBC" and version 0x01. The certificate is 79 B, HELLO 87 B,
   TRANSFER 142 B, and ACK and cancel proof 119 B, each plus a DER signature of at most 72 B. The currency is the
   32-byte token id, as in Stage 1's scheme 0x04. Stage 1 signs raw r||s; the chip signs DER, so the phone converts.
2. **Defund covers the chain currency only** (one slot, marked at personalisation). The measured voucher message has
   no currency field, so a second chain currency would need its own voucher domain and vault.
3. **Out-of-order defunds.** D1 accepts only a key index above the highest used on chain. If voucher 2 is posted
   before voucher 1, voucher 1 can never be posted, and its amount was already debited on the chip. The chip cannot
   see the chain, so **the phone must post vouchers in key order**. The chip keeps the last 4 for re-reading. This is
   a design gap worth a line in 5.1 (BELIEVED; follows from the measured `i > u` rule).
4. **Sizes.**
   - Pending entries hold the whole signed transfer, 218 B each, against the design's about 150 B.
   - The vendor list is double-buffered so that a snapshot swaps atomically.
   - The applet's arrays total 33,213 B, inside the design's 25 to 35 KB.
   - There are 4 outstanding HELLOs. A fifth retires the oldest; a payment against a retired nonce is cancelled and
     restored.
   - 65,536 receives and 1,023 defunds per chip. Key renewal and nonce renewal are not built (they need PIN-protected
     long sessions; later work).
5. **Receive tickets.**
   - Batches hold at most 32 tickets. A new batch is refused while tickets of the old one are open, unless the phone
     retires them.
   - A ticket used by two payers: the second payer gets a cancel proof when the merchant loads. If the merchant never
     loads, that payer's money stays stuck; that is the merchant's phone at fault.
   - The good-faith rule covers revocations only. A payer whose vendor left the list before loading is refused.
6. **PIN.**
   - The applet's own counter, written through `Persist` so the tear proof holds. Whether to use `OwnerPIN` on the
     card is decided at the first card build.
   - An "arm" is persistent, used by exactly one payment, and survives the card leaving the field.
   - A session PIN authorises one sensitive operation.
7. **Personalisation.**
   - The PERSO commands are open while the card is in its personalisation state; the vendor does this at
     manufacture. Requiring a GlobalPlatform secure channel is a later hardening step.
   - The owner narrowing the accepted-vendor list (6.3) is not built.
8. **The proof of cheating for the chip's keys** needed a 5-chunk variant
   (`applet/crosscheck/lx16_cheat_proof_K5_P255_runscript.kiss`, derived from `chip_account.kiss` op 4). The
   standalone `kiss/lx16_cheat_proof.kiss` is the 4-chunk form and does not fit these keys. This is deferred
   machinery, checked only because 0c.2 asks for it.

## 6. Once the cards arrive (after decision 15's gate and a purchase Chuck approves; 0b.2)

**Handling rules for test cards** (`card-capabilities.md` section 5; Phase 0 section 4):
- One test card at a time, on the ACS ACR1252U, with its **default keys** (`404142…4F`).
- **Never** `--lock`, `--secure-card` or terminate a test card, and never guess keys.
- **Stop at the first wrong-key or cryptogram error: 3 to 10 wrong key attempts can brick a J3R180.**
- A card on default keys is never a certified chip.
- Use only a lab test vendor key, never a real one, and never a seed phrase.

**The first three things to run:**

1. **Identify the card.** `gp --info`, then `gp --list` (GlobalPlatformPro). Record the chip, the Java Card and GP
   versions, SCP02 or SCP03, and the free memory. Confirm it is the J3R180 (JCOP4) and that the default keys
   authenticate. If anything but success comes back, stop.
2. **Load the test CAP and read the self-test.**
   - Commands (BELIEVED syntax; check `gp --help` first):
     - `gp --load build/cap/stables-test.cap`
     - `gp --create F05354424C0101 --applet F05354424C0101 --package F05354424C01`
     - the same with `F05354424C0102` for the benchmark applet
   - Then `GET_STATE` over PC/SC. Self-test bits 0xFF mean every primitive works on this chip. A failing chip
     installs inert and shows the failing bit (a missing algorithm makes the install itself fail); secure random (0x20) and the commit buffer (0x80, with the size in
     `G_COMMITCAP`) are the unknowns.
   - Then `java … org.stables.host.Main bench --pcsc ACR1252` for SHA-256, P-256, LX16 key generation and streaming,
     commit cost, and memory.
   - Unload with `gp --delete` when done. Never touch the card manager.
3. **Check card-made signatures with our existing verifiers (0b.2 step 2).** Personalise the test card with a lab
   test vendor key, make two defund vouchers and two benchmark signatures, export them, and run
   `crosscheck/lx16-crosscheck.mjs`: `ots.mjs`, then the helpers, the D1 core and the proof of cheating as
   `runscript` dry runs on lab peer 9101. A card signature must pass wherever a simulator signature passes, and the
   refusals must still refuse.

**One code change needed first (known, small).**
- `Card`, the benchmark and every command are APDU-driven over the `Apdu` interface (jCardSim or PC/SC).
- But `Lab.card()`, the unit tests, the relay suite and the fixture exporter create *simulated* cards.
- Running them on a real card needs a `Lab` that personalises a `PcscCard` with the same APDUs.
- The tear harness stays simulator-only; tearing on silicon is Phase 6, done physically.
