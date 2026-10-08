> ## Reconciled 2026-09-29, read first
>
> This prompt comes from an outside research session. It has been mapped against the founder's settled decisions (13, 14 and 15 in `../stables-payment-layer-agent-brief.md`) and Phase 0's findings in **`chip-balance-design.md` section 0c**, which holds the full table. **Settled decisions win. Read that section before acting on anything below.**
>
> - **Recorded as the founder's direction:** Java Card route only; the phone-keystore route (Android limited-use keys) is parked. Stage 1's software chip in the app is a test-phase stand-in and is unaffected. Open: whether step 1b (an Android Keystore key with attestation, in Stage 1) is parked too (0c.3).
> - **Superseded by our verified findings:** SHA3-256 behind an interface with fallbacks (the J3R180 has no SHA-3 and software SHA-3 is a no-go, so the applet uses none; P-256 and LX16 need only SHA-256); Minima WOTS signing on the card, checked with `verify` or `CHECKSIG` (about 8 hours per signature; card-made **LX16** signatures are checked with our existing verifiers instead); WOTS-signed releases (LX16); the spent-note registry (the chip's account coin is the spent-once marker).
> - **Conflicts with settled decisions, so do not build:** notes, per-card caps, note expiry and hop limits (decision 13; no time limits, 2026-09-28); fraud proofs, self-verifying revocation gossip and slashing (deferred by decision 14; only the unused hooks stay); "revoked cards cannot redeem" (an owner-revoked chip still defunds, only to its owner); the private `-test -genesis -nop2p` node (mainnet only: lab dry runs, then mainnet dust records under `EXPERIMENT_GOVERNANCE_STANDARD.md`).
> - **Adopted, and where:** the applet with an `ant-javacard` Java Card 3.0.4 build and jCardSim tests; the tear harness, with its invariants restated for a balance; the relay suite, minus the rejected features and with foreign-certificate and owner-revocation refusals; the benchmark harness (SHA-256, P-256, LX16, memory per account and per revocation entry); and `docs/simulator-status.md`. Together they are the **Stage 2 virtual work package**, `chip-balance-design.md` 0c.2. `docs/card-capabilities.md` is written, pre-filled with the J3R180 data. Deliverable 5 is replaced by our existing lab dry-run tools and mainnet records. Once cards arrive: 0b.2.
> - **Already ours (consistent):** Java Card 3.0.4, allocation at install, commit before emit, simulator timings as relative only, an offline key certifying each card with no shared secrets, and the `txnbasics` + `txncheck` pattern. Amounts: keep ours; `SETLEN(16 HEX(x))` is an alternative only.
>
> The body below is left as received and is not edited.

---

# Task: Make the virtual Java Card version of the Stables L2 portable to real cards

We are building the hardware-secured Stables L2 (offline notes on a Java Card, phone as untrusted relay, Minima covenants for backing/redemption) **in a simulator first (jCardSim)** to prove that everything we control can be built. Decision taken: **Java Card route only** ,  the phone-keystore "Route 2" is parked because single-use key limits are not hardware-enforced on target phones.

Before writing code, review what already exists in this repo for the L2 and the applet, and report how it maps to the five requirements below. Keep what is already right; flag conflicts; ask before changing existing design docs.

## Ground rules
- Decentralisation first, no price oracles. Research prototype, no real funds. Never automate seed restoration.
- Label findings **verified** (test passes), **believed**, **unknown**.
- Minima command syntax comes from the node (`help`, `tutorial`), not the docs site.

## Requirement 1 ,  Stay within the real card's platform
Target: Satochip DIY card (NXP JCOP4 family, to be confirmed with `gp --info` when cards arrive).
- Compile against **Java Card 3.0.4** API (upgrade to 3.0.5 only if the card confirms it); set this in the `ant-javacard` build, not just the simulator.
- jCardSim runs on a PC crypto library and accepts algorithms/APIs the card may lack. Create `docs/card-capabilities.md` listing every algorithm/API the applet uses, marked *assumed* until verified on the card. Treat **SHA3-256** and anything outside JC 3.0.4 as *assumed*; wrap them behind an interface so a fallback (e.g. SHA-256, or a software SHA3 in the applet) can be swapped in.
- No `java.lang` features beyond the Java Card subset (no `String`, `int` only if the card supports the int option, no dynamic allocation after install: allocate all arrays in the constructor).

## Requirement 2 ,  Don't trust simulator performance
- Record timings in the simulator only as relative numbers; label them "not representative".
- Write the benchmark harness now so it runs unchanged on the real card: SHA-256 and SHA3-256 throughput, P-256 sign/verify, Minima WOTS signature (with Minima's exact parameters from the Minima source), key-tree generation cost, EEPROM/RAM usage per note and per revocation entry.
- Verify WOTS signatures produced by the applet with a Minima node (`verify` command and `CHECKSIG` in `runscript`).

## Requirement 3 ,  Survive power loss at every step
Pulling the card mid-payment must never create or destroy value.
- Every change to notes, balance, counters, WOTS leaf index and revocation list happens inside `JCSystem.beginTransaction()` / `commitTransaction()`, or uses the documented atomic primitives.
- The payer must **commit the note deletion before releasing the transfer signature**; the payee must commit the note only after full verification.
- jCardSim does not model tearing reliably. Build a **tear-test harness**: an instrumented build/test mode that aborts at every persistent-write point (or a wrapper that throws between APDUs and mid-APDU), then re-powers the simulated card and checks invariants: total value conserved (payer + payee + in-flight ≤ original), no note both spent and unspent, counters monotonic, no WOTS leaf reused.
- Report which interruption points exist and that each one passes.

## Requirement 4 ,  The phone is an untrusted relay
Card-to-card transfers pass through a relay the tests control.
- Build a relay test layer that can **drop, delay, duplicate, replay, reorder and modify** APDUs, and substitute messages from a third card.
- Required outcomes: no double-spend, no value creation, no acceptance of altered amounts/recipients, replayed transfers rejected (challenge/nonce binding), a dropped final message leaves value recoverable by a defined procedure (document it).
- Mutual attestation between cards: card key generated on card, public key certified at personalisation by an **offline issuer key that never goes on a card**; no shared secrets across cards. Test that a card with a revoked or foreign certificate is refused.
- Include fraud-proof generation (two conflicting transfers of the same note from one card), self-verifying revocation entries exchanged on every transaction, per-card caps, note expiry and hop limits ,  each with tests.

## Requirement 5 ,  Minima side on a private node
Test the covenants on a private node (`java -jar minima.jar -test -genesis -nop2p -rpcenable`), reusing the harness pattern from our channel prototype (`txnbasics` + `txncheck` so invalid spends show as script failures).
- **Issue:** lock USDw (test token) → notes bound to card keys.
- **Redeem:** a note redeemed once succeeds; a second redemption of the same `noteId` is rejected (spent-note registry).
- **Fraud proof → slashing:** the covenant accepts a valid fraud proof, marks the card revoked and pays compensation from its bond. Note: KISS-VM can only verify Minima (WOTS) signatures, not P-256 ,  design the fraud proof so the covenant can check it (e.g. WOTS-signed releases/redemptions) and document the choice.
- **Revocation registry:** revoked cards cannot redeem.
- Encode amounts as fixed-length integer base units (`SETLEN(16 HEX(x))`), since `HEX()` only takes positive whole numbers.

## Deliverables
1. Applet source + `ant-javacard` build targeting JC 3.0.4; jCardSim unit tests.
2. Tear-test harness and results table (interruption point → invariant checks → pass/fail).
3. Relay attack test suite and results table.
4. Benchmark harness (runs in simulator now, on card later) and `docs/card-capabilities.md`.
5. KISS-VM covenant scripts + private-node test harness and results.
6. `docs/simulator-status.md`: what is verified, what is only assumed until real cards, and the exact steps to move to the Satochip cards (`gp --info`, load CAP with default keys, never lock/terminate test cards, ~10 wrong-key attempts can brick a card).

Summarise in chat: what passes, what is blocked or assumed, and the first three things to run once the cards arrive.
