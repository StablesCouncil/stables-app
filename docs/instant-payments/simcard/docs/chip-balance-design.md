# Stables payment account: chip-balance model, Phase 1 design and cost proofs

**Date:** 2026-09-27. **Status:** Phase 1 redo for founder decision 13 (chip-balance model), revised for **founder
decision 14** (design from full trust in the chip): waiting for Chuck's gate. Everything that existed only to survive
a broken chip has moved, intact, to the final appendix, "Deferred: if a chip is ever broken". This was a document
revision only: no new scripts, measurements or chain commands, and no measured number changed.
**Revision 2026-09-29:** reconciled with an outside hardware-first research prompt (`hardware-l2-prompt.md`): section
0b maps it, 4.4 adopts receiving on a merchant's phone that has no chip of its own, 0a gains the Stage 3 facts, and
appendix D.9 holds the class-break mitigations. Documentation only; no measured number changed.
**Second revision 2026-09-29:** reconciled with an outside Java Card simulator prompt (`javacard-simulator-prompt.md`):
section 0c maps it, records the founder's "Java Card route only", and defines the Stage 2 virtual work package (0c.2);
the new `card-capabilities.md` lists what the applet needs from the chip. Documentation only; no measured number changed.
**Brief:** `../stables-payment-layer-agent-brief.md` (v3 pivot, decisions 13 and 14). **Phase 0:** `phase-0-research.md`.
**Superseded notes-model design (not edited, parts reused):** `payment-account-design.md`.
**Measured on:** lab peer 9101, Minima **1.0.45.15**, RPC 9105, dry runs only (`runscript`, `status`, local
transaction builder with `txndelete`), plus the in-process runner `measure/java/KissRun.java` on the same
node's jar for branches that read the transaction. Nothing was posted, signed or mined.
**Tags:** VERIFIED = measured (receipt named) or read at the cited source. ASSUMED = design, arithmetic or
simulation, with the reason. **Evidence level (BUILDER_KIT):** everything measured here is **L1** (lab node,
one operator, dry runs). Nothing is L2 or L3.

Receipts: `../measure/receipts/balance_*.json`. Scripts: `../kiss/balance/`. Simulation: `../sim/balance/`.

---

## 0. Summary for Chuck

**The premise.** We trust certified chips; what to do if one is ever broken is a later decision, see the appendix.

**What a user gets.**
- A **savings account** (the on-chain wallet, as today) and a **checking account** on a chip: the SIM in an Android
  phone, or a contactless card.
- Checking money stays on the chip as long as the user likes, in any amount: the protocol sets no cap, and users can
  set their own limits. They pay as often as they like, any amount, with no internet, and a payment is final at the
  tap. Users post no bond.
- A lost chip is protected by its PIN: a finder without the PIN can spend at most 150. The owner revokes the chip from
  the savings wallet, and moving its money back to savings only ever pays the owner.

**How money gets onto a chip.** No operated service is required.
1. **Buy a pre-loaded chip.** The vendor locks the money on chain when it loads the chip at manufacture.
2. **Buy checking money from anyone who has some** (typically a shop) through the swap. Your savings money is released
   to them only once your chip has been paid.
3. **Optional: a "top up from savings" button.** The chip's vendor sees your lock on chain and tells your chip. It only
   makes top-ups quicker; routes 1 and 2 work without it.

A signer is needed at all only because the chip cannot see the chain. That is a question of visibility, not of trust.

**Moving money back to savings:** two chain transactions, about 43 KB together (from measured parts; an upper bound),
about two blocks.

**Tap time** (estimated): about 1 second for a card tapped on a phone, and 1.5 to 2 seconds SIM phone to SIM phone,
with chips that have built-in elliptic-curve signatures (NXP J3R180: 32 ms to sign). The sysmoISIM-SJA5-9FV SIM,
which lacks them, would take 6 to 9 seconds.

**Chain load:** payments never touch the chain. In the model, a consumer makes about 3 chain transactions a month and a
shop about 36; 21,000 users together use under 1% of Minima's capacity.

**Measured so far** (lab node 1.0.45.15, dry runs, L1): all 82 covenant cases behaved as designed, and the heaviest
script uses 800 of the 1,024 allowed steps. Nothing has been mined yet, and real tap times wait for real chips.

**Decisions for you** (section 10): the hardware to buy first, the PIN thresholds, whether to build the optional top-up
button, how new vendors and revocations reach offline chips, lost-chip recovery, the vendor bond, the vault's
successor, and two confirmations.

---

## 0a. Stages: from the app to the chip (founder decision 15)

The design in sections 1 to 10 is **Stage 2**. Chuck decided (2026-09-27) to build and test in the test phase **first**, with the app standing in for the chip, and to treat the hardware as a roadmap. **No hardware is to be bought until Stages 1 and 2 are proven virtually.**

| Stage | Where the checking account lives | How top-ups are known to be real | How defund is authorised | Status |
|---|---|---|---|---|
| **1. Test phase** | The standalone Stables Android app ("software chip") | The app's **own embedded Minima node** sees the funding coin on chain: no voucher or swap needed | A Minima-native signature (`CHECKSIG`, 32 instructions) by a dedicated key, never the wallet's spending keys: no LX16 helpers needed | **Next: Phase 2** |
| **2. Secure chip** | A Java Card SIM or contactless card (this document) | Pre-loaded chips, the swap, the optional voucher (section 1): the chip cannot see the chain | LX16 voucher across helper coins (section 5) | Designed; emulated virtually (jCardSim, work package 0c.2) before any purchase |
| **3. Minima node on the chip** (the ultimate target) | A secure chip that runs a Minima node | The chip verifies the chain itself | Native Minima signatures | Vision. Today's SIM and card chips lack SHA-3 and memory (about 8 hours per Minima signature), so this waits for more capable secure hardware. **Closest path: Minima's own chip work.** A full Minima node already runs on embedded hardware with hardware SHA-3 cores (the Arm subsystem of an FPGA development board; with the University of Southampton, Siemens and Arm; announced December 2025; drone proof of concept in 2026). Whether it can hold a payment account (tamper resistance, attestation, anti-rollback, third-party code, a phone form factor) is **unknown**: see below and 0b.3 |

**Stage 1 in more detail** (ASSUMED design, to be detailed in Phase 2):
- **Platform:** the standalone Android app only. It has the embedded node and can host NFC. The Core companion, web and MiniDapp show the feature greyed out with an honest note (UX law: no surface is hidden).
- **Payments:** the **same messages as the chip protocol** (section 4, EC profile), carried by NFC tap. One phone reads, the other answers through host card emulation, with QR as the fallback. The receiver's app checks the payer's ECDSA P-256 signature.
- **Keys and balance:**
  - The signing key sits in the Android Keystore, hardware-backed where the phone offers it.
  - The balance and counter sit in the app's native layer, never in the WebView's `localStorage`.
  - Commit, then emit, as on a chip.
- **Top-up:** savings are locked in a small vault covenant tagged with the account's id. The app credits once its own synced node has seen the lock with the agreed confirmations.
- **Defund:** the account debits, then signs with its dedicated Minima key. The vault checks that key, which was registered on chain at account creation.
- **Chain:** a vault holding valueless test tokens on mainnet. Deploying it is an on-chain step that needs Chuck's approval and follows `EXPERIMENT_GOVERNANCE_STANDARD.md`.
- **Honest limit:** this is trusted *software*. Someone who modifies their own app or node could credit themselves. That is acceptable only because test tokens are valueless, and it is exactly what Stage 2 fixes.
- **Test devices:** the Pixel 7 Pro (stock Android) and the Pixel 7 (GrapheneOS), both in airplane mode for the offline tests.

**Stage 3: what is known about Minima's chip** (sources read 2026-09-29; VERIFIED means stated at the cited source, not tested by us):
- **VERIFIED (Minima, 15 December 2025, "Minima Achieves Major Breakthrough: Blockchain-on-Chip Is Here"):** "Minima is now running on the Arm processor subsystem inside an FPGA development board", as "a fully functioning Layer-1 blockchain node running directly on embedded hardware". The accelerators include "quantum secure SHA-3 hashing cores, 256-bit arithmetic units, precision fixed-decimal modules" and a prototype mining accelerator; the SHA-3 accelerator gives "approximately 100×" the hashing rate of the CPU. The platform was integrated into an autonomous drone, with a public flight demonstration scheduled for late January 2026.
- **VERIFIED (Minima and Decrypt, 28 October 2025):** the partners are the University of Southampton (School of Electronics and Computer Science), Siemens (through Cre8Ventures) and Arm (Flexible Access and Academic Access); proof-of-concept drone validation was targeted for Q1 2026.
- **VERIFIED (University of Southampton news, 4 March 2026):** a live flight demonstration took place, with every device running a full node. The stated next steps are autonomous systems, industrial IoT and machine-to-machine communication; phones and SIMs are not mentioned.
- **VERIFIED (Minima, 9 October 2024, "The Minima Chip"):** the plan is a dedicated system-on-chip running full nodes in edge and IoT devices, in an "isolated environment for blockchain functionality"; at that date it was in early design, with no form factor stated.
- **UNKNOWN (none of these sources states it):** a secure element or tamper-resistant enclave, per-chip attestation, monotonic counters or anti-rollback storage, loading of third-party code, key custody and recovery, a phone form factor (SIM, eSIM or add-on), an ASIC or tape-out date, and availability. These are the questions in 0b.3.
- **BELIEVED (our reading):** where these posts say "tamper-proof", they mean the ledger records, not the hardware. Hardware SHA-3 removes the blocker that rules out Stage 3 today (about 8 hours per Minima signature on a Java Card). But Stage 3 also needs what Stage 2 relies on: a chip that runs its balance logic honestly and that its owner cannot override. An FPGA development board is a research platform, not a secure element.

Sources: https://minima.global/post/minima-achieves-major-breakthrough-blockchain-on-chip-is-here ,
https://decrypt.co/346324/minima-siemens-and-arm-develop-worlds-first-blockchain-on-chip-prototype ,
https://minima.global/post/the-minima-chip ,
https://minima.global/post/university-of-southampton-and-minima-to-pioneer-world-first-blockchain-on-chip ,
https://www.southampton.ac.uk/news/2026/03/student-engineers-achieve-worldfirst-in-blockchain-black-box-for-drones-.page

---

## 0b. Reconciliation with the hardware-L2 research prompt (2026-09-29)

`hardware-l2-prompt.md` is a hardware-first plan for a Java Card L2 from an outside research session: notes with
history, fraud proofs, revocation, expiry, caps, WOTS on the card, Satochip cards, and questions for the Minima team.
It was mapped against this design **with the founder's settled decisions winning**: decision 13 (the chip-balance
model), 14 (full trust in the chip; broken-chip machinery in the appendix), 15 (the test phase first; hardware as a
roadmap), the mainnet-only rule, and the 2026-09-28 rulings that there is no daily limit and no time-based retirement.
Nothing here reopens those decisions. What the prompt adds is written into the sections named below, not into a new
document.

### 0b.1 Mapping (prompt item, our status, verdict)

| # | Prompt item (where in the prompt) | Our status | Verdict |
|---|---|---|---|
| 1 | "Only Minima's own WOTS signatures can be verified on chain, so anything a covenant checks must carry a WOTS signature" (facts; §1, §4) | True for signature *types* (KISS has no ECDSA). But a script can check a hash-based signature made from `SHA2`: **LX16** (SHA-256 labelled-XOR Lamport) is checked on chain across 5 helper coins at 790 instructions each, and chips make it with hardware SHA-256 (VERIFIED, `payment-account-design.md` 1.2 to 1.4; D1 core 313 instructions, 5.2) | **Superseded** |
| 2 | Benchmarks 1 and 2: SHA3-256 on the card; Minima WOTS signing on the card | Already answered, **no-go**: the J3R180 has no SHA-3, and software SHA-3 takes about 6.7 s per hash, so about 8 hours per Minima signature (VERIFIED, Phase 0). The Satochip DIY card is the J3R180 (VERIFIED at source: https://github.com/3rdIteration/Satochip-DIY names the J3R180 as the recommended card and links the Satochip DIY card) | **Superseded**: do not run |
| 3 | §4: how to prove fraud when the card signs natively (options i to iii) | Answered: every statement the chain must check (defund voucher, swap fallback) is **LX16**; card to card uses **P-256** in hardware (31.96 ms to sign, 30.22 ms to verify, 4.2). An LX16 key used twice is provable on chain in **117 instructions** (VERIFIED, `lx16_cheat_proof.json`). In the baseline no fraud proof is needed (decision 14); that machinery is in D.3 | **Superseded** (answered) |
| 4 | §1: a spent-note registry (MMR or nullifier set) in covenant state | One registry coin would have to be spent by every redemption, and a coin can be spent only once per block, so redemptions would run one per block across the whole system (ASSUMED consequence of the VERIFIED one-spend-per-coin rule; the same contention is why the vault has lanes, 5.4). On Minima **the coin itself is the spent-once marker**: the chip's account coin with its highest used key index (5.1) | **Superseded**: do not build |
| 5 | §1, §3: notes with a `noteId`, transfer history (or a commitment to it), hop counts | The notes model was rejected by decision 13 ("way too many compromises"). This model holds a **balance**, with no notes and no history (`payment-account-design.md`, superseded) | **Conflict**: do not build |
| 6 | §6: note expiry, refresh online, smaller amounts for receivers who have not synced, an online check above a threshold | Rejected with the notes (decision 13). The relative freshness rule is parked (decision 14, D.4). Money never expires: the founder ruled out time limits and daily limits (2026-09-28; `step2-load-offload-design.md` 4.5 and 6: the always-open exit, and money on a lost device is like lost cash). Note: this document's own 5-year vault-lane retirement (5.4, 5.5, decision 7) predated that ruling and was removed on 2026-09-29 | **Conflict**: do not build |
| 7 | §2.5, §7: per-card caps (for example 200 held, 50 per payment) | No protocol holding cap (decisions 13 and 14: "any amount"); the 1,000 cap is parked (D.5). What stays is the owner's own limits and the PIN-less allowance of 50 per payment and 150 since the last PIN, which protect a **lost** chip (3.4) | **Conflict** as a protocol cap |
| 8 | §4, §5: slashing card bonds, an on-chain registry of cheating cards, payouts to victims | Users post no bond (decision 13). Broken-chip evidence, penalties and loss sharing are parked (D.3, D.5, D.6). The owner's revocation of a lost chip stays (6.1) | **Conflict** with the baseline; appendix only |
| 9 | Ground rules and deliverable 3: a private `-test -genesis -nop2p` node, Test04/07/08, "1.0.49-TEST.4" | Stables rule: **mainnet only, with valueless tokens; never testnet or private networks.** The lab is the DevNodesSet (9101 to 9401) and Test12; every figure here comes from dry runs (`runscript`) on lab peer 9101 | **Conflict**: do not use |
| 10 | Hardware: buy at least 3 Satochip cards and a reader now; benchmark first | Decision 15: **no purchase** until Stages 1 and 2 are proven virtually. The founder has not decided otherwise. The future order is section 10, item 1 | **Conflict**: do not order |
| 11 | §7: an on-chain switch that disables offline sending for a chip model or certificate batch | That is an authority over everyone's chips: a governance choice, parked with the emergency freeze | **Conflict** with the baseline; D.9 only |
| 12 | Deliverables 1 to 3: a new `docs/hardware-l2-design.md`, an applet skeleton, covenant drafts | This document is the Stage 2 design: its applet is section 3 and its covenants are section 5 (82 cases measured). Stage 1 comes first (decision 15), and the applet follows in jCardSim before any card | **Duplicate**: no parallel design |
| 13 | §3: the card signs a WOTS claim to the merchant's Minima key, so the merchant can redeem on chain later | A chip cannot make Minima signatures (item 2), and a chip statement paying someone other than its owner would break the rule that a defund pays only the owner's payout address (5.1) | **Replaced** by 4.4 (the merchant loads into its own card) |
| 14 | §2.3: an issuer key kept offline, never on a card, certifies each card's key | Vendor certificates over each chip's EC key, from a vendor key on an ordinary computer. Vendors are open and bonded, and there are many of them rather than one issuer (decisions 4, 11, 12; 4.1, 6.3) | **Consistent** |
| 15 | §2.4: monotonic counters | The payment counter `n`, receiver nonce counter `m`, funding count `k_chip` and the used chain-key bitmap only increase (3.1) | **Consistent** |
| 16 | §2.2: debit atomically before a transfer is released | Commit, then emit (3.3; Phase 0 decision 2) | **Consistent** |
| 17 | §2: no shared secret on any card | Per-chip keys only; key separation (brief, environment) | **Consistent** |
| 18 | §5: receiver-side revocation that verifies itself and spreads by gossip at every tap | Owner revocations reach chips in registry snapshots passed at every tap, and phones check each entry against their own chain view (6.2). The equivocation-proof form of revocation is parked (D.3, D.4) | **Consistent** for lost chips; the cheater form is appendix only |
| 19 | §3: the phone is always an untrusted transport | "Phones only carry bytes" (2, 4.1) | **Consistent** |
| 20 | Benchmarks 3 and 4 (P-256 time, NFC round trip, memory budget); card-handling rules (never TERMINATED, a few wrong keys can brick a card) | P-256 figures are JCAlgTest's (VERIFIED); tap times and memory are ASSUMED (4.3, 3.1) until measured on real cards. The handling rules match Phase 0 section 4 | **Consistent**: runs in the first build (0b.2) |
| 21 | Card tapped on the merchant's phone; the phone receives but cannot re-spend offline until it loads into its own card | Integrated into the balance model with no notes | **Adopted**: 4.4 and section 7 |
| 22 | Class-break safety: vendor diversity, bounded exposure | Parked with the rest of the broken-chip machinery | **Adopted into the appendix only**: D.9 |
| 23 | Deliverable 5: questions for the Minima team | Extended to seven questions | **Adopted**: 0b.3 |
| 24 | "The first thing to build once cards arrive" | Rewritten to reuse our existing verifiers | **Adopted**: 0b.2 |

### 0b.2 The first thing to build when cards arrive

This runs only after decision 15's gate (Stages 1 and 2 proven virtually) and a purchase Chuck approves (section 10,
item 1). It orders nothing.

1. **A test applet on the J3R180** that does two things only: it signs with **LX16** (hardware SHA-256, as designed
   in `payment-account-design.md` 1.3) and with **P-256** (ECDSA-SHA256 in hardware). There is no balance and no
   money, and it is loaded with GlobalPlatformPro on a test card that keeps its default keys.
2. **Check the card's signatures with the verifiers we already have**, with no new verifier:
   - **LX16:** the reference verifier `../measure/ots.mjs`, then the measured KISS scripts in dry runs (`runscript`)
     on lab peer 9101: the five helpers `../kiss/lx16_helper_K5_P255.kiss` (790 instructions each), the D1 signature
     core `../kiss/balance/d1_core_runscript.kiss` (313), and the proof of cheating `../kiss/lx16_cheat_proof.kiss`
     (117) fed with two card signatures by one test key. A card signature must pass wherever a software-made one
     passes, and the measured refusal cases must still refuse. Nothing is posted.
   - **P-256:** the chain never checks P-256 (KISS has no ECDSA, VERIFIED), so the verifier that matters is the
     phone's: the Stage 1 protocol already shipped in the app (`website/dapp/3-test/assets/instant-protocol.js`,
     scheme 0x04: a 64-byte r||s signature over SHA-256 of the signed bytes).
   - **Measure on the card:** time per LX16 key and signature, P-256 sign and verify, APDU round trips through the
     ACR1252U and through a Pixel's NFC, and persistent memory used (the prompt's benchmarks 3 and 4). The JCAlgTest
     figures in this document stay the reference until then.
3. **Then the balance applet** (section 3), plugged in through the existing seams, so that the rest of the app does
   not change. The key goes through the `keyStore` interface in `instant-protocol.js` (`{kind, create(), publicKey(),
   sign(bytes)}`, built for exactly this swap). The balance commands (`PAY`, `CREDIT` and the rest, 3.2) go through
   the brief's `SecureElement` interface, as its `JavaCardNfc` implementation (specified in the brief, not yet in
   code). jCardSim cannot tear a transaction (Phase 0), so atomicity is proven with a tearing harness on the card.

### 0b.3 Questions for the Minima team about the Minima chip

None of these is answered in the public posts (0a). Stage 3 cannot be planned on them until they are.

1. Does the chip include a tamper-resistant enclave or secure element, and is it certified (for example Common
   Criteria EAL5+ or 6+)?
2. Can third parties load their own code (an applet) onto it, and under what control?
3. Does it expose attestation: a per-chip key, generated on the chip and certified by the maker, that a counterparty
   can check?
4. Does it have a monotonic counter or anti-rollback storage?
5. Can it run the payment account's balance logic (section 3) next to the node, in the protected area, where the
   owner cannot override it?
6. What are the availability and the form factor for phones: SIM, eSIM, or an add-on (for example a card or a USB or
   NFC device)?
7. How are keys held and recovered: the node's keys, a payment account's key, and what happens when a chip is lost
   or fails?

---

## 0c. Reconciliation with the Java Card simulator prompt (2026-09-29)

`javacard-simulator-prompt.md` is a second outside prompt. It asks for the Java Card L2 to be built in a simulator
(jCardSim) first, against five requirements (R1 platform, R2 performance, R3 tearing, R4 the phone as an untrusted
relay, R5 the Minima side) and six deliverables. It was mapped as 0b was, **with the same settled decisions winning**:
decisions 13, 14 and 15, the mainnet-only rule, the 2026-09-28 rulings (no daily limit, no time-based retirement), and
Phase 0's settled technical decisions. Nothing here reopens them. Where the prompt repeats a notes-model item that 0b
already mapped, the row points to 0b.1 rather than repeating the argument.

**The founder's stated direction (recorded 2026-09-29): Java Card route only.** The phone-keystore route (Android
limited-use keys) is parked, because single-use limits are not hardware-enforced on the target phones (the prompt's
reason, not checked here). This is consistent with the stages (0a): Stage 2's security anchor is the Java Card. Stage
1's software chip is a test-phase stand-in on valueless tokens, stated as trusted software rather than a security
route, so it is unaffected. Whether the planned step 1b is parked too is open (0c.3).

### 0c.1 Mapping (prompt item, our status, verdict)

| # | Prompt item (where in the prompt) | Our status | Verdict |
|---|---|---|---|
| 1 | "Java Card route only; the phone-keystore Route 2 is parked" (preamble) | Stage 2's anchor is the Java Card (0a); Stage 1's software chip is a test-phase stand-in, not a security route | **Consistent**: recorded as the founder's direction; step 1b open (0c.3) |
| 2 | Target: the Satochip DIY card (JCOP4 family), confirmed with `gp --info` on arrival (R1) | It is the J3R180 (VERIFIED at source, 0b.1 item 2). No purchase until Stages 1 and 2 are proven virtually (decision 15) | **Consistent**; nothing is ordered |
| 3 | Compile against Java Card 3.0.4 in the `ant-javacard` build (3.0.5 only if the card confirms it); the Java Card subset only; all arrays allocated in the constructor (R1) | Phase 0 decision 6: build the CAP against 3.0.4 (it runs on the J3R180 and the SJA5; the J3R180 part is ASSUMED), allocate memory only at install (enforced by a source scan), run a self-test at install | **Consistent** |
| 4 | Treat SHA3-256 as *assumed* and put it behind an interface, with SHA-256 or a software SHA-3 as the fallback (R1) | The J3R180 has **no SHA-3** (every `ALG_SHA3_*` returns `NO_SUCH_ALGORITHM`), and software SHA-3 takes about 6.7 s per hash (VERIFIED, Phase 0). Nothing in the applet needs it: P-256 and LX16 use SHA-256 only (4.2) | **Superseded**: the applet uses no SHA-3, so there is nothing to wrap |
| 5 | `docs/card-capabilities.md`: every algorithm and API the applet uses, marked *assumed* until verified on the card (R1) | Written, pre-filled from Phase 0's VERIFIED J3R180 data (JCAlgTest) and the design's needs; every row carries its status | **Adopted**: `card-capabilities.md` |
| 6 | Simulator timings as relative numbers only, labelled "not representative" (R2) | Phase 0 decision 6: never count jCardSim results as evidence | **Consistent** |
| 7 | A benchmark harness that runs unchanged on the card: SHA-256 and SHA3-256 throughput, P-256 sign and verify, Minima WOTS signing, key-tree generation, memory per note and per revocation entry (R2) | SHA3-256 and WOTS on the card are already a no-go (0b.1 item 2), and there are no notes. What the design needs measured: SHA-256, P-256 sign and verify, LX16 key generation and signing, memory per account and per revocation entry (3.1, 4.2) | **Adopted with our list**: 0c.2 item 4 |
| 8 | Verify the applet's WOTS signatures with a Minima node (`verify`, `CHECKSIG` in `runscript`) (R2) | A chip cannot make Minima signatures (about 8 hours each, Phase 0). What the chain checks is LX16, and its verifiers exist: `../measure/ots.mjs`, then dry runs on lab peer 9101 of the five helpers (790 instructions each), the D1 core (313) and the proof of cheating (117), as in 0b.2 step 2 | **Superseded**: verify card-made LX16 signatures instead |
| 9 | Every persistent change inside `beginTransaction` / `commitTransaction` or an atomic primitive; the payer commits the deletion before releasing the signature, the payee commits only after full verification (R3) | Commit, then emit (3.3; Phase 0 decision 2): PAY commits the debit and the pending entry before the transfer leaves; CREDIT checks everything, commits, then releases the ACK | **Consistent** (restated for a balance) |
| 10 | A tear-test harness that aborts at every persistent-write point and mid-APDU, re-powers the card and checks invariants; report every interruption point (R3) | jCardSim does not roll back transactions (its calls only count depth), reports fake memory figures and cannot lose power (VERIFIED, Phase 0), so **our own tearing harness is required** | **Adopted**: 0c.2 item 2 |
| 11 | Tear invariants: value conserved, "no note both spent and unspent", counters monotonic, "no WOTS leaf reused" (R3) | No notes and no WOTS in this model | **Restated** for a balance: 0c.2 item 2 |
| 12 | A relay that drops, delays, duplicates, replays, reorders and modifies APDUs and substitutes a third card's messages. Outcomes: no double spend, no value created, no altered amount or recipient accepted, replay refused by nonce binding, a dropped final message recoverable by a documented procedure (R4) | Phones only carry bytes (2, 4.1). Every transfer names the receiver's id and the receiver's own nonce `m`, which is credited at most once; the amount is signed; recovery is the pending-ring re-send or the cancel proof (3.3), which is the documented procedure | **Adopted**: 0c.2 item 3 |
| 13 | Mutual attestation: key made on the card, certified at personalisation by an offline issuer key that never goes on a card; no shared secrets (R4) | Vendor certificates over each chip's EC key, from open, bonded vendors; per-chip keys only (0b.1 items 14 and 17) | **Consistent** |
| 14 | A card with a foreign certificate is refused (R4) | The accepted-vendor list (6.3) | **Adopted** as a test |
| 15 | A card with a revoked certificate is refused (R4) | Owner revocation of a lost chip, carried by registry snapshots, is baseline (6.1, 6.2). Revocation of a broken chip or family is deferred (D.3) | **Adopted for owner revocation only** |
| 16 | Fraud proofs: two conflicting transfers of the same note (R4) | No notes. The nearest thing, two transfers under one payer counter `n` (clone evidence), is deferred (decision 14, D.3). The hooks stay, unused: the signed counter `n`, the version byte and the snapshot version (4.1) | **Conflict** with the baseline: hooks only, not built or tested |
| 17 | Self-verifying revocation entries exchanged on every transaction (R4) | Owner revocations already travel in registry snapshots at every tap (6.2) and are tested under item 15. The self-verifying form, a proof of cheating, is deferred (D.3, D.4) | **Conflict** for the proof-of-cheating form; the owner form is **consistent** |
| 18 | Per-card caps, note expiry and hop limits, each with tests (R4) | Rejected with the notes (decision 13) and by the 2026-09-28 rulings (0b.1 items 5 to 7). The owner's own limits and the PIN-less allowance (3.4) protect a lost chip and are tested instead | **Conflict**: do not build |
| 19 | A private node, `java -jar minima.jar -test -genesis -nop2p -rpcenable` (R5) | Mainnet only, with valueless tokens (0b.1 item 9). Covenants are checked by dry runs on the lab node (`runscript`, the in-process `KissRun`), then by formal mainnet dust records under `EXPERIMENT_GOVERNANCE_STANDARD.md` | **Conflict**: do not use |
| 20 | The `txnbasics` + `txncheck` pattern, so that an invalid spend shows as a script failure (R5) | Already ours: STEP2-PRESEED-01-R1 refused its 14 registered constructions on mainnet as `scripts:false` with the other flags true, and deleted them unposted (`../evidence/STEP2-PRESEED-01-R1/CLOSURE_REPORT.md`) | **Consistent** |
| 21 | Issue: lock USDw into notes bound to card keys. Redeem: a note once, a second redemption of one `noteId` refused by a spent-note registry (R5) | No notes: the vault funds a balance, through chip registration (94 instructions) and FUND (96) in `../kiss/balance/` (5.2). The spent-note registry is superseded (0b.1 item 4): the account coin with its highest used key index is the spent-once marker, and D1 refuses a reused key index (measured, 5.2) | **Superseded** |
| 22 | A fraud proof leading to slashing, with the covenant checking WOTS-signed releases or redemptions (R5) | LX16 replaces WOTS for anything the chain checks (0b.1 items 1 and 3). Slashing is deferred; its branches are measured and parked (evidence 367, clone 221, slash 115; D.5) | **Superseded** (LX16) and **deferred** (slashing) |
| 23 | A revocation registry: revoked cards cannot redeem (R5) | The opposite rule holds: an owner-revoked chip **still defunds**, and only to the owner's payout address (6.1; measured: D1 for an owner-revoked chip, 432), so revoking never traps money. Only an evidence-revoked chip is refused, and that is deferred (D.5) | **Conflict**: do not build |
| 24 | Amounts as fixed-length integers of base units, `SETLEN(16 HEX(x))`, since `HEX()` takes only positive whole numbers (R5) | Ours: the Stage 1 vault and registration carry amounts as ordinary Minima numbers in state ports and outputs, at 8 decimals, proven on mainnet (STEP2-PRESEED-01-R1, L2). The Stage 2 account record already packs its totals as fixed-length integers of base units, `SETLEN(8 HEX(...))` (measured, L1). `SETLEN` counts **bytes** and keeps only the low bytes of a longer value (VERIFIED, `kissvm/functions/hex/SETLEN.java`), so the prompt's form is 16 bytes wide, and any width needs the value bounded to fit | **Keep ours**; `SETLEN(16 HEX(x))` is an alternative only |
| 25 | Deliverables 1 to 4 and 6: the applet with an `ant-javacard` 3.0.4 build and jCardSim tests, the tear harness, the relay suite, the benchmark harness with `card-capabilities.md`, and `docs/simulator-status.md` | No applet code exists in the repository yet (searched 2026-09-29). Together they are the virtual emulation that decision 15 requires before any purchase | **Adopted**: 0c.2, minus the conflicts above |
| 26 | Deliverable 5: KISS covenant scripts plus a private-node test harness and results | The scripts exist (`../kiss/balance/`, 82 cases, 0 unexpected, 5.2), and so do the tools (`runscript` on lab peer 9101, `../measure/java/KissRun.java`, `../measure/balance-run.mjs`) | **Replaced** by our lab dry runs and mainnet records |
| 27 | "The first three things to run once the cards arrive" (closing) | 0b.2 | **Consistent**: 0b.2 |

### 0c.2 Stage 2 virtual work package

This is the virtual emulation that decision 15 requires before any card is bought: the prompt's adopted deliverables,
minus its conflicts. It builds the applet of section 3 and the EC profile of section 4 in jCardSim. It orders nothing,
touches no chain and changes no app code. **Simulator results show that the applet's logic holds and agrees with our
verifiers; they are never evidence about a card** (Phase 0 decision 6). Timing, memory, atomicity and tearing on
silicon are settled only by the first build on real cards (0b.2) and Phase 6. The design of the harnesses below is
ASSUMED until built.

1. **The applet** (prompt deliverable 1).
   - Scope: state (3.1), commands (3.2), commit then emit (3.3), the PIN and the owner's own limits (3.4), the EC
     profile messages (4.1), receive tickets (4.4), the LX16 defund voucher (5.1) and the swap receipt secret (1.4).
     Nothing from the appendix.
   - Acceptance:
     - the CAP builds with `ant-javacard` against the Java Card 3.0.4 API, not only in the simulator, and jCardSim
       unit tests cover every command;
     - a source scan finds no allocation outside install, no SHA-3, no `String` and no reliance on the `int` option,
       and every algorithm and API the applet uses has a row in `card-capabilities.md`;
     - the install self-test runs and passes;
     - there is no "sign anything" command (3.2; Phase 0 decision 1);
     - LX16 vouchers made by the simulated applet pass `../measure/ots.mjs` and the measured KISS verifiers in lab dry
       runs (the five helpers, the D1 core, and the proof of cheating fed two signatures by one test key), and the
       measured refusal cases still refuse, exactly as for a software-made signature (0b.2 step 2). Its P-256
       signatures verify in a standard ECDSA P-256 verifier off the card.
2. **The tear harness** (deliverable 2).
   - Why it must be ours: jCardSim neither rolls back a transaction nor loses power (Phase 0). The harness supplies
     both. In an instrumented build every persistent write passes through one layer that can stop at that write and
     that discards an uncommitted transaction's writes as the card would. It can also cut between APDUs and in the
     middle of one. The simulated card is then powered up again and the invariants are checked.
   - Coverage: every command that writes persistent state (`PAY`, `CREDIT`, `ACK`, `CANCEL`, `FUND`, `DEFUND`,
     `VERIFY_PIN`, `UPDATE_REVOCATIONS`, `UPDATE_ACCEPTANCE`, `SWAP_EXPECT` and the swap receipt, `ISSUE_TICKETS`), at
     every write point.
   - **Invariants** (the prompt's, restated for a balance; there are no notes):
     1. **Value conserved:** payer + payee + in flight ≤ original. In flight means a committed transfer still in the
        payer's pending ring and not yet credited, or a committed defund voucher.
     2. **Counters monotonic:** `n`, `m`, `k_chip`, the used LX16 key bitmap and the snapshot version never go back
        after a tear, and a tear never gives back a PIN try.
     3. **No one-time (LX16) defund key reused:** a torn `DEFUND` either used no key, or marked its key used together
        with the digest; the chip may re-send the same voucher for the same digest, and never signs another digest
        with that key (Phase 0 decision 2).
     4. **The torn-tap re-send is credited once:** re-sending a pending transfer credits it at most once (deduplicated
        by `m`), and no transfer is ever both credited and cancelled (3.3).
   - Acceptance: a results table with one row per interruption point, the check of each invariant, and pass or fail;
     every point passes.
3. **The relay suite** (deliverable 3).
   - A relay controlled by the tests sits between two or three simulated chips. It drops, delays, duplicates, replays,
     reorders and modifies APDUs, and substitutes messages from a third card.
   - Required outcomes, one test each:
     - no double spend and no value created: all balances plus everything in flight never rise;
     - an altered amount, recipient or counter is refused, since the signature covers them (4.1);
     - a replayed or copied transfer is refused (the receiver's nonce `m`, credited once), including a transfer made
       against a receive ticket (4.4);
     - a dropped final message (the ACK, or the TRANSFER itself) leaves the value recoverable by the documented
       procedure: the pending-ring re-send, or the receiver's cancel proof (3.3);
     - a chip whose certificate comes from a vendor not on the accepted-vendor list is refused (6.3);
     - a chip its owner revoked is refused once the registry snapshot carrying the revocation has reached the other
       chip, and a snapshot older than the chip's own, or not signed by an accepted vendor, is refused (6.1, 6.2);
     - the PIN rules and the owner's own limits hold (3.4).
   - Not built or tested (0c.1 items 16 to 18): fraud proofs, the proof-of-cheating form of revocation, per-card
     caps, note expiry and hop limits. The hooks (the version byte, the signed counter `n`, the snapshot version) are
     carried and signed, and nothing acts on them.
   - Acceptance: a results table with one row per attack and pass or fail; every attack is refused or recovered.
4. **The benchmark harness and `card-capabilities.md`** (deliverable 4).
   - It measures, with the same code that will later run on the card: SHA-256 throughput; P-256 sign and verify;
     LX16 key generation and signing, including streaming the signature of about 8.4 KB out of the card; memory per
     account (the whole state of 3.1) and per revocation entry (8 B in 3.1).
   - In jCardSim every timing is recorded as a relative number and labelled "not representative". The JCAlgTest
     figures in `card-capabilities.md` stay the reference until a card is measured (0b.2 step 2).
   - Acceptance: the harness runs unchanged against the simulator now and against a card later, and
     `card-capabilities.md` lists every algorithm and API the applet uses, each with its status.
5. **`docs/simulator-status.md`** (deliverable 6): what the simulator has shown, what stays assumed until real cards,
   and the steps to the cards: `gp --info` first; load the CAP onto a test card that keeps its default keys; never
   lock (`--lock`), secure (`--secure-card`) or terminate a test card; stop at the first wrong-key error, since 3 to 10
   wrong key attempts can brick a J3R180 (Phase 0 section 4).

**Not in the package:** a private node or a new covenant harness (0c.1 items 19 and 26), and anything from the
appendix. **Once the cards arrive:** 0b.2, which runs only after decision 15's gate and a purchase Chuck approves.

### 0c.3 Open question for Chuck

**Is step 1b parked as well?** Step 1b is planned in the Stage 1 code (the header of
`website/dapp/3-test/assets/instant-protocol.js`). It swaps the software key for an Android Keystore key (StrongBox)
and fills the reserved "Attestation" line with that key's attestation. It is not the parked route: it improves key
custody in the test phase and relies on no single-use limit. But it is phone-keystore work. Recommend **keeping step
1b as a Stage 1 improvement, never as a security route**. The alternative is to park it with the phone-keystore route.

---

## 1. Top-up: how money gets onto a chip

### 1.1 Why a signer is needed at all: visibility, not trust

Top-up moves value from the savings wallet (on chain) into a chip's balance (off chain). In the baseline the chip is
trusted to keep its balance honestly (decisions 13 and 14). What it lacks is sight: it must add to its balance only if
the value was really locked on chain, and three facts stop it from seeing that for itself:

1. **The chip cannot compute Minima's hash.** Minima's proof of work, block ids and coin proofs (MMR) all use
   SHA3-256 (VERIFIED: `utils/Crypto.java`, `hashData` is SHA3-256 "The DEFAULT"; block headers hash with it
   and carry the MMR root, `objects/TxHeader.java`). The NXP J3R180 and the sysmoISIM-SJA5 have no SHA-3
   (VERIFIED, Phase 0); software SHA-3 on a Java Card costs about 6.7 s per call (VERIFIED, Phase 0).
2. **The chip has no trusted view of the chain.** It has no clock, no network and no tip; everything it
   sees arrives through the phone.
3. **The phone owner could show the chip anything.** Whatever the phone presents as the chain, the owner could have
   made up.

So a chip learns a chain fact only in one of two ways: it checks a proof itself (1.2 shows it cannot), or it checks a
signature by a key it was told to trust at personalisation. **That is the only reason a signer appears: the chip cannot
see the chain. It is a question of visibility, not of trust.** The signer the chip already trusts is its own vendor,
which certifies it and keeps its management keys (decision 12), so using it adds no new trusted party. Two of the three
baseline routes (1.3) need no signer after manufacture at all.

### 1.2 The chip cannot check the chain itself

**Chip time (ASSUMED arithmetic on VERIFIED inputs, receipt `balance_chain_work.json`).** One funding proof
needs the coin's hash, its MMR proof (17 hashes on today's chain, VERIFIED `txn-sizes.json`), the block
header (about 10 Keccak permutations, because every header carries 32 super-parent slots, VERIFIED
`GlobalParams.MINIMA_CASCADE_LEVELS = 32`) and some confirmation headers. At 6.7 s per call:

| Confirmations checked | Chip time for one funding |
|---|---|
| 0 | about 3 minutes |
| 6 | about 10 minutes |
| 100 | about 2 hours |

**Security (VERIFIED difficulty, ASSUMED attacker hardware).** Even with unlimited chip time the check
would be worthless, because the chip cannot know which chain is real and Minima blocks are cheap to fake
privately. The lab node reports today's target `0x00000089049C…` and a chain weight of 80.9 billion over
2,115 blocks: **about 33 to 38 million hashes per block**, i.e. a whole-network rate of about 0.66 million
SHA3 hashes a second. Minima's safety comes from the network agreeing on the heaviest chain, not from any
single block being expensive. A private fork that fools a chip costs:

| Attacker hardware (ASSUMED rate) | 1 fake block | 6 fake blocks | 100 fake blocks |
|---|---|---|---|
| Laptop CPU, ~20 MH/s SHA3 | 1.7 s | 10 s | 2.8 min |
| Consumer GPU, ~2 GH/s | 0.02 s | 0.1 s | 1.7 s |

A vendor-installed checkpoint does not help: the attacker forks from the checkpoint. **Verdict: rejected.**
A chip that trusts proof-of-work headers can be filled from nothing on a laptop.

### 1.3 The baseline: three routes, none needing an operated service

| Route | How it works | Who acts | If that party disappears | Chain cost (5.2, 5.3) |
|---|---|---|---|---|
| **1. Pre-loaded chips** | The vendor registers the chip on chain, funds its account coin (the USDw goes into the shared vault) and writes the same balance into the chip at personalisation | the vendor, once, at manufacture (decision 4) | nothing: the chip is already loaded | a registration (94 instructions) and one FUND (96 instructions, about 10 KB) |
| **2. The trustless swap** | Anyone holding checking money sells it for savings money through the swap covenant (1.4) | the two people swapping | nothing: any holder of checking money can sell | a lock (an ordinary payment) and a 3.8 KB claim (28 instructions) |
| **3. Optional vendor self-top-up voucher** | The user locks savings money for the chip on chain; the chip's vendor sees it confirmed and signs a voucher the chip accepts (1.5) | the vendor's voucher service, online | only this button stops, for that vendor's chips; routes 1 and 2, payments, defunds and revocation continue | one FUND, about 10 KB |

**Against the dependency-free law.** Routes 1 and 2 need no operated service after manufacture, so the baseline meets
the law as written. Route 3 is a **removable accelerator**: it turns a top-up from savings into one button, but nothing
depends on it, so it needs no exception to the law. Whether to build it is a decision (section 10). (The first
revision made route 3 the normal top-up, which did need an exception; decision 14 makes it optional.)

**Registration starts at zero.** The gate refuses to register an account coin with pre-loaded counters (measured,
5.2), so a pre-load is always a real FUND on chain, visible to anyone.

**How money circulates** (ASSUMED behaviour). Money enters chips at manufacture (route 1, and route 3 if built), moves
between people chip to chip and through swaps, and leaves through defunds (section 5). Shops collect checking money all
day and are the natural sellers in route 2; for them a swap claim (3.8 KB) is also cheaper than a defund (about 43 KB).
A vendor, or any market maker, can pre-load a large "float" chip for itself and sell from it through swaps; with no
protocol cap, the float is limited only by what its owner locks.

### 1.4 The swap (route 2), message by message

Buyer U has savings money and wants checking money. Seller S has checking money and wants savings money
(merchants accumulate exactly this). No party needs to trust the other, and no service is involved.

1. **U's chip** makes a one-time secret `s` and records a pending swap: "expect X from a chip, release `s`
   only in the receipt that credits it". The phone gets only `h = SHA2(s)`.
2. **U locks X on chain** in a swap coin at `ADDRESS(template(h, seller payout, buyer refund, deadline))`
   (`kiss/balance/swap_htlc.kiss`). Branches: CLAIM (anyone reveals `s`; pays the seller), REFUND (after the
   deadline; pays U). Measured in section 5.2 (claim 28, refund 20 instructions).
3. **S checks the lock on its own node** (its own risk), then **S's chip pays U's chip X** (an ordinary
   chip-to-chip payment, section 4) bound to `h`.
4. **U's chip credits X and releases `s`** inside its receipt. S claims the swap coin with `s`.
5. **If U's phone withholds `s`**, S's pending transfer remains a bearer message only U's chip can credit;
   S keeps its transfer and can claim instead with the **chip-signed transfer** (CLAIM-BY-TRANSFER, a
   chain-checked LX16 signature, sections 2 and 5) which also publishes the transfer on chain, where U's phone can
   fetch it. (This branch is the heavy fallback; the preimage path is the normal one. It is designed, not yet in the
   measured script: section 9.)
6. **If S never pays**, U refunds after the deadline. If S paid but forgot to claim before the deadline, U
   can refund and keep the chip money: that is S's own loss, never new money (total chip money is
   unchanged).

Why it is safe: money never appears in a chip without leaving another chip, and savings money moves only
against a secret that an honest chip releases only when it has been paid. Cost on chain: two small
transactions (lock, claim), smaller than a fund plus a defund.

What it needs: a counterparty holding checking money, reachable over any channel (a tap, or remotely: the
chips do not care about the transport). Matching buyers and sellers is a market convenience anyone may
offer; if every matchmaker vanished, two people can still swap face to face.

### 1.5 The optional self-top-up voucher (route 3)

1. The user (or anyone) funds the chip's account coin on chain through its FUND branch. The covenant lets the
   account's funding count `k` and total funded `F` rise only when the matching USDw enters the vault in the same
   transaction (96 instructions, 5.2; about 10 KB, 5.3).
2. The chip's vendor sees the funding confirmed and signs a voucher naming the chip, the new count `k+1` and the new
   total `F+X`.
3. The chip accepts only the voucher numbered `k_chip + 1`, in order, credits `X` and stores `(k_chip, F_chip)`. A
   voucher cannot be used twice or out of order.

- **Trust:** the vendor, which the chip already depends on (it certifies the chip and holds its management keys,
  decision 12): no new trusted party.
- **New operational risk:** the voucher key is an online ("hot") key, and a stolen voucher key could credit chips
  without a lock. The counters that would expose it already ride in every payment (4.1); the detection built on them
  is deferred with the rest of the broken-chip machinery (appendix D.2). This is one more reason to keep route 3
  optional, vendor by vendor.
- **If the vendor disappears:** only this button stops, for its chips.
- **Pre-loading** (route 1) can use the same FUND branch and the same voucher format in the factory, so a chip has one
  way to accept money from outside (ASSUMED design).

### 1.6 Other approaches considered

| # | Approach | Trust it requires | If the attester disappears | Fit with the dependency-free law | In the baseline |
|---|---|---|---|---|---|
| a1 | **The chip's own vendor signs a funding voucher** after it sees the lock confirmed | The vendor. **No new party**: the vendor already holds the chip's management keys (decision 12) and could already mint through a bad applet update. New operational risk: the voucher key is an online ("hot") key | Direct funding into that vendor's chips stops. Payments, receiving, defunding, owner revocation and swaps (a4) continue. Nothing is stranded | An operated service, but a removable one: routes 1 and 2 work without it | **Route 3**, optional |
| a2 | Any bonded party, or M of N, signs; the chip trusts attesters its vendor certified | The vendor (who chooses the attesters) plus the attesters | Funding continues while any M attesters remain | Same as a1, better availability, more chip time (M signatures) | not needed; a possible later variant of route 3 |
| a3 | **ATM / issuer float:** a vendor (or anyone) keeps checking money in its own chips and sells it | The float holder only for the few seconds of the sale (removed by a4) | Other holders can still sell | Market service, not a protocol dependency. **But the float must itself come from a1 or a5** | covered by routes 1 and 2: the float is a pre-loaded chip selling through swaps |
| a4 | **Swap with chain arbitration:** you lock savings money in a small covenant that pays the seller only against your chip's receipt secret (or the seller chip's signed transfer to you); otherwise you get a refund after a deadline | **None.** Both chips are the trusted chips the model already assumes | Nothing disappears: any holder of checking money can be the seller | **Fully compatible.** Needs a counterparty (a market), not a service | **Route 2** |
| a5 | **Vendor pre-funds chips at sale** (the vendor locks the money on chain and loads the chip, acting once, like manufacture) | The vendor, once | No top-ups except by a4 | **Compatible** (decision 4: vendors act at manufacture) | **Route 1** |
| b | The chip checks the chain itself | Minima PoW, which the chip cannot anchor | n/a | **Rejected** (1.2) | no |
| d | Credit on trust, then refuse defunds above "attested funding plus provable inflows" | The phone owner | n/a | **Rejected**: it does not stop the realistic attack (spend onward, never defund). A falsely credited chip pays an honest merchant, whose inflow is genuinely provable; closing that gap means proving every hop back to funding, which is the rejected notes model | no |
| e1 | Two-phase funding: the chip signs either "credited" or "cancelled" for a pending lock, never both | The phone owner for existence | n/a | **Rejected alone**: it stops a holder from being credited *and* refunded, but not from being credited for a lock that never existed. Its "exactly one of two chip statements" idea is reused in the swap (a4) | inside route 2 |
| e2 | Trust the phone | The adversary | n/a | **Rejected** | no |
| e3 | Certified "attester appliances" that anyone can run (a secure box running a Minima node inside its trusted boundary) | Appliance certification, like the chip | Anyone can run one | Promising for later; nothing buyable does this today (ASSUMED). Research list | research list |

How each route would be caught if it were abused (the counter comparison) is deferred: appendix D.2.

---

## 2. The architecture at a glance

| Piece | Where it lives | What it does | Trusted for |
|---|---|---|---|
| **Savings account** | the user's Minima wallet (on chain) | holds money; funds chips, locks swaps, receives defunds | ordinary Minima security |
| **Checking account** | the applet inside a certified chip (SIM via OMAPI, or contactless card) | balance, counters, atomic pay/receive, PIN, the owner's own limits, owner revocations, accepted vendors | **honest operation** (founder premise, decisions 13 and 14) |
| **Chip account coin** | chain, one per chip (`chip_account.kiss`) | the chain's record of the chip: funding count and total, defund total, highest chain key used, status, owner key and payout, vendor key | nothing: every change is covenant-checked |
| **Vault** | chain, one shared vault in lanes (`balance_vault.kiss`) | holds the USDw behind every chip balance; pays defunds; **no time-based retirement**: the always-open exit (every holder can always defund) is its retirement path (founder ruling 2026-09-28, applied 2026-09-29) | nothing |
| **Vendor admission, gate and bond** | chain (`chip_dispenser.kiss`, `vendor_gate_and_bond.kiss`) | admits a bonded vendor, registers its chips, holds its bond and releases it 30 days after a request | nothing |
| **Vendor** | an ordinary company with a computer | certifies chips it loaded with the published open-source applet (decision 11), pre-loads them, signs registry snapshots (6.2), optionally signs top-up vouchers (1.5) | its certification, which is what makes a chip "certified"; bonded (decision 4) |
| **Phone app** | the user's phone | moves bytes between chips (NFC, OMAPI, QR, internet), keeps the chip's public key data, passes registry snapshots, builds transactions | the owner only; never trusted by the protocol |

What touches the chain: vendor admission and chip registration, funding (a pre-load, or the optional voucher route:
about 10 KB, one transaction), swaps (an ordinary payment to lock, a 3.8 KB claim), defunding (two transactions, at
most about 43 KB together) and the owner's revocation or payout change. **Payments never touch the chain.**

What needs signatures the chain can check: only the chip's **chain statements**, which in the baseline are defund
vouchers and the swap's fallback claim, signed with LX16 one-time keys (Phase 1 design, section 1). Chip-to-chip
payments use the fastest signature the chip offers (section 4), which the chain never needs to see.

The account record measured on the lab node also carries a weekly defund window, and the measured scripts also carry
evidence, penalty, vendor-revoke and brake branches. Those serve the deferred machinery (appendix D.5).

---

## 3. The applet

The applet is the published open-source Stables applet, loaded by the vendor from a reproducible build (decision 11).

### 3.1 State (persistent memory, allocated at install)

| Item | Size | Notes |
|---|---|---|
| Balance and the owner's own limits (holding limit, per-payment limit) | 24 B | no protocol cap (decision 14); the limits stay unset until the owner sets them, under the PIN |
| Payment counter `n` (outgoing), receiver nonce counter `m` (incoming) | 8 B | both only increase |
| Funding count `k_chip` and total `F_chip`; cumulative sent `S`, received `R`, defunded `D` | 36 B | `k_chip` orders funding vouchers (1.5); otherwise **hooks**, carried and unused in the baseline (4.1, appendix D.1) |
| Chain-key seed and used bitmap (LX16, 1,024 keys per tree) | 32 B + 128 B | keys made by the vendor at personalisation, or in the background on a SIM |
| EC device key and vendor certificate (EC profile) | about 310 B | section 4 |
| Pending ring (outgoing transfers not yet acknowledged) | 16 x about 150 B | the exact signed transfer, so a torn tap re-sends the same bytes |
| Outstanding nonces (incoming reservations) | 4 x 12 B | nonce and reserved capacity |
| Receive-ticket range (4.4) | about 16 B | the nonces reserved for a phone that receives without its own chip; the credited-nonce bitmap below keeps each creditable once (ASSUMED sizing, added 2026-09-29) |
| Credited-nonce bitmap | 8 KB | lets the receiver prove "nonce m was never credited" for cancellations |
| Revocation list | 2,048 x 8 B = 16 KB | truncated ids of owner-revoked chips, with the snapshot version (6.2) |
| Accepted-vendor list | 16 x about 75 B | vendor ids and EC root keys of the bonded vendors registered on chain (6.3); sized for 16 (ASSUMED) |
| PIN (tries, PIN-less amount spent since the last PIN) | 16 B | |

Total about 25 to 35 KB (ASSUMED sizing, unchanged; the receipt log and stored funding voucher that moved to the
appendix save about 1.4 KB): fits the J3R180 (139,360 B free, VERIFIED Phase 0) and the SJA5 (200 KB free on the S17
variant, VERIFIED sysmocom shop page; 480 KB flash on the 9FV, VERIFIED manual).

### 3.2 Commands (no "sign anything" command, Phase 0 decision 1)

`GET_STATE`, `VERIFY_PIN`, `HELLO` (receiver: reserve capacity, return a signed nonce), `PAY` (payer: check,
debit, sign a transfer), `CREDIT` (receiver: verify, credit, sign an ack), `ACK` (payer: clear the pending entry),
`RESEND`, `CANCEL_PROOF` / `CANCEL`, `FUND` (accept a vendor voucher: the factory pre-load, or the optional top-up),
`DEFUND` (sign a chain voucher), `UPDATE_REVOCATIONS` and `UPDATE_ACCEPTANCE` (both from a registry snapshot, 6.2),
`SWAP_EXPECT` and the swap receipt secret (section 1.4), `ISSUE_TICKETS` (receive tickets for a phone without its own
chip, 4.4). Changing the owner's own limits needs the PIN. The first revision's `AUDIT` command (a signed statement of the counters, for the solvency check) moved to the appendix.

### 3.3 Atomic debit and credit: commit, then emit

- **Pay:** in one Java Card transaction the chip lowers the balance, raises `n`, adds to `S`, and writes the pending
  entry holding the exact signed transfer; **only after the commit** does it release the transfer. A power cut
  before the commit changes nothing; after it, the transfer sits in the pending ring and can be re-sent.
- **Credit:** in one transaction the chip checks that nonce `m` is outstanding and not yet credited, raises the
  balance and `R`, marks `m` credited and retires it; only then does it release the ack.
- A torn tap therefore never creates or destroys money: the value is still with the payer (no commit), or in the
  payer's pending ring as a signed bearer message that only the named receiver chip can credit, or credited (and
  the ack can be re-issued).
- **Recovery, Mondex-style but without a bank:** the payer's phone re-sends the pending transfer by any transport
  (next tap, QR, internet). The receiver credits it once (deduplicated by its own nonce `m`) or, if `m` was retired
  without credit, signs a **cancel proof** that makes the payer chip restore the amount. The only unrecoverable
  case is a receiver chip destroyed between the payer's commit and the credit: at most one payment is stuck.
  (ASSUMED design. Mondex used a five-message protocol with exception logs reconciled by the issuer, VERIFIED
  from the published Mondex specification studies; here the payer's pending entry plus the receiver's cancel proof
  replace the issuer. Phase 6 must prove atomicity on silicon: jCardSim cannot tear transactions, Phase 0.)

### 3.4 PIN and the owner's own limits (recommended defaults)

| Rule | SIM (your phone confirms) | Card tapped on someone else's phone |
|---|---|---|
| Holding limit | **none set by the protocol**; the owner may set one | same |
| Per-payment limit | up to the balance, or the owner's own limit | same |
| No PIN needed | each payment up to 50, and up to 150 in total since the last PIN | same (EMV-style contactless limit) |
| PIN | entered on your own phone | entered on **your own** phone to "arm" the card for the next payment up to an amount, or on the receiver's phone after an explicit warning |
| Defund, change of limits, key renewal | always PIN | always PIN |
| Wrong PIN | 3 tries, then blocked; unblock with the vendor-issued PUK | same |

Aligned with the app's existing quick-pay default (50 per quick payment, VERIFIED `payment-security.js`, Phase 0).
The PIN-less allowance is exactly what a finder of a lost card or phone can spend (section 6.1). These rules protect a
user who loses a chip; they are not a defence against a broken chip. The owner can lower them.

---

## 4. Chip-to-chip payments

### 4.1 Messages (EC profile)

Receiver R (a merchant or a friend) and payer P. Phones only carry bytes. Every message starts with a **version byte**.

1. **HELLO (R to P).** R's chip reserves capacity `c` (the room under R's own holding limit; with none set,
   effectively unlimited), takes a fresh nonce `m`, and signs `{version, R certificate, m, c, snapshot version}`.
2. **P's chip checks** the vendor signature on R's certificate (the vendor must be on P's accepted-vendor list, 6.3),
   that R is not on P's revocation list, R's signature on HELLO, `a <= c`, `a <= balance`, P's own limits and the PIN
   rules. Then **commit, then emit**: debit, pending entry, and
   `TRANSFER = sign_P{version, P certificate, n, R id, m, a, k_chip, F_chip, snapshot version, balance after}`.
3. **R's chip checks** P's certificate (cached per peer), that P is not revoked, the signature, that `m` is
   outstanding and not credited, then credits atomically and returns `ACK = sign_R{P id, n, a, m}`.
4. **P's chip** verifies the ACK and clears the pending entry.

**Replay protection:** every transfer names R's own nonce `m`; R credits each `m` at most once and retires it, so
a replayed or copied transfer is refused. P's signed counter `n` numbers P's transfers for re-sending and
cancellation (3.3).
**Mutual authentication:** P never pays a chip without a valid certificate from an accepted vendor (money sent to a
fake would be destroyed, never stolen, because the transfer is bound to R's id); R never credits a transfer without
P's certificate and signature.

**Hooks, present but unused.** The version byte lets a later rule arrive as a new message version without a redesign.
The counters `k_chip` and `F_chip` in every transfer (with `S`, `R` and `D` kept in the chip for the same purpose),
P's signed counter `n`, and the snapshot version (the revocation field) are carried and signed, but nothing in the
baseline acts on them beyond what is described above. They are what the deferred mitigations would plug into: counter
comparison, clone evidence and the freshness rule (appendix D.1).

### 4.2 Signature choice (VERIFIED chip facts, ASSUMED protocol costs)

| | **EC profile: ECDSA P-256 in hardware** (recommended) | **Hash profile: LX16 one-time keys** (fallback) |
|---|---|---|
| Chips | NXP JCOP4 J3R180 card: ECDSA-SHA256 supported (`ALG_ECDSA_SHA_256;yes`, VERIFIED support profile); P-256 ECDSA sign **31.96 ms**, verify **30.22 ms** on 256 bytes, key pair 26.8 ms, ECDH 20.0 ms (VERIFIED run-time profile; measured for the SHA-1 variant, the SHA-256 variant is not timed separately and should differ only by the hash of a short message, ASSUMED). sysmoISIM-SJA5-**S17**: EC hardware present for on-card SUCI (VERIFIED manual: "SUCI computation on card (if used on chip with sufficiently fast EC crypto)"); the S17 10-pack is buyable at **€95.20** (VERIFIED shop page); **whether applets can reach its EC is not documented** (ASSUMED likely; test first). NXP JCOP4 in SIM cut exists (J3R180 "SIM cut", J3R150 triple-cut; VERIFIED listings) but has no USIM or ARA-M, so whether a phone accepts it for OMAPI is unknown | sysmoISIM-SJA5-**9FV**: listed algorithms are DES, AES, CRC, SHA-1/224/256, MD5, HMAC only (VERIFIED manual 4.2.1): **no public-key crypto at all** |
| Signature size | 72 B | 8.2 KB + 160 B chunk digests + about 320 B SHA-256 Merkle proof |
| Chip time per payment | about 0.4 s for both chips together (2 signs, 3 to 4 verifies, 2 commits) | payer about 0.05 s; receiver about 2 s (765 SHA-256 at 2.2 to 2.6 ms each, VERIFIED per-hash figures) |
| Key making | one EC key for life | one LX16 key per payment: 1.2 s of chip time each, in the background on a SIM |
| Certificates | vendor ECDSA over the chip's EC key | vendor hash-based signature over the chip's key-tree root, about 2 s to check, cached per peer |

Receivers never need to check a payment on chain, so the EC profile loses nothing on chain: the chain only ever
sees the chip's LX16 **chain statements** (defund vouchers and the swap fallback), which every chip can make (SHA-256
only). The first revision's "clone evidence" row, comparing the two profiles for catching a cloned chip, moved to
appendix D.3.

### 4.3 Expected tap time (ASSUMED arithmetic)

Inputs: OMAPI APDU round trip 50 to 80 ms (a published on-device secure-element measurement, arXiv 1209.0875; a
SIM behind the modem may be slower), contactless card APDU 10 to 30 ms, phone-to-phone host card emulation
exchange 20 to 50 ms, NFC discovery 0.1 to 0.3 s, about 6 APDUs per chip (EC messages fit in 1 to 2 APDUs of 255
bytes, the SJA5 limit, VERIFIED Phase 0), chip crypto about 0.4 s.

| Path | EC profile | Hash profile |
|---|---|---|
| **Card tapped on the receiver's phone** (the receiver's chip is its SIM) | **about 0.9 to 1.4 s** (the card must stay in the field about 1 s) | about 4 to 6 s |
| **SIM phone to SIM phone** (host card emulation between phones, OMAPI to each SIM) | **about 1.3 to 2.0 s** | about 6 to 9 s (35 APDUs of 250 B on each chip link) |
| Remote (internet relay, both phones online) | about 1 to 3 s plus network | about 6 to 10 s |

The OMAPI channel can be opened when the payment screen appears, so channel set-up is off the tap. For
comparison, a direct on-chain payment is seen in about 5 s and final in about 50 s (brief).

**Recommendation:** EC profile, with the hash profile as the fallback for the 9FV. The hardware to buy first is
decision 1 in section 10.

### 4.4 Receiving on a phone without its own chip (the card is tapped on the merchant's phone)

Adopted 2026-09-29 from the hardware-L2 prompt (0b.1, item 21). ASSUMED design, detailed in Phase 2.

A merchant whose phone has no chip of its own (an iPhone, or an Android phone without a Stables SIM) still takes chip
payments offline. The payer taps a card on the merchant's phone and needs no phone of their own. The merchant's phone
**receives but cannot re-spend offline**: to spend the money offline, the merchant loads it into its own card. This
fits the balance model as it stands, with no notes, no history, no expiry and no cap.

- **Receive tickets.** The merchant's own card signs a batch of HELLO messages in advance (4.1, step 1), each with its
  own nonce `m` and capacity `c`. A ticket is simply a HELLO signed ahead of time. The card records the batch as a
  reserved nonce range (3.1), and its credited-nonce bitmap already makes each `m` creditable once. The phone keeps the
  tickets with the card's certificate and a copy of the card's accepted-vendor and revocation lists. No PIN is needed,
  because a ticket only lets money in. With no holding limit set, `c` is unlimited; if the merchant has set one, the
  card reserves the batch's capacity when it issues it.
- **At the tap.** The phone hands the payer's card one unused ticket. The payer's card runs 4.1, step 2 unchanged (the
  merchant card's certificate and vendor, revocation, the ticket's signature, `a <= c`, the balance, the payer's own
  limits and the PIN rules), then commits and emits the TRANSFER, bound to the merchant card's id and to `m`. The phone
  checks the payer's certificate against the copied accepted-vendor list and verifies the P-256 signature in
  software, so a fake card is refused at the till rather than at loading. Only then does it store the transfer durably
  and show that it was received. If the tap tears, tapping the card again on the same phone re-sends the same bytes
  from the payer's pending ring (3.3). No ACK reaches the payer's card at the tap, so its pending ring overwrites the
  oldest entries when full; a pending entry only serves re-sending.
- **What the phone holds.** Transfers bound to the merchant's card: bearer messages that only that card can credit,
  each once. The phone has no key that any chip accepts (6.3), so it cannot pay anyone with them. Until they are
  loaded they are like a cash drawer: a lost or wiped phone loses them. That risk is the merchant's own, never the
  payer's or the vault's, since no money is created and the backing stays in the vault.
- **Loading into the card.** Later (at the end of the day, or before paying), the merchant taps its own card on the
  phone, which feeds each stored transfer through `CREDIT` (4.1, step 3). The card credits each one once and retires
  its `m`. It checks the payer's revocation against the snapshot its ticket was issued under, so a payment taken in
  good faith is not refused later: under the premise, that money is real (6.1). Chip time is about 0.1 s per transfer
  (two P-256 verifies at 30.22 ms, VERIFIED, plus a commit, ASSUMED 10 to 30 ms), so about 100 transfers load in
  roughly 10 to 20 s with the APDUs (ASSUMED arithmetic). After that it is ordinary checking money: spendable offline,
  or moved to savings with a defund (section 5), which always pays the merchant's own payout address.
- **Tap time.** Only the payer's card works during the tap (the merchant's chip is not in the field), so it is no
  slower than the card-on-phone figure in 4.3 (ASSUMED).
- **What it adds:** one applet command (`ISSUE_TICKETS`) and about 16 B of state (3.1). There is no new chain step
  and no new signature the chain must check; the chain still sees only funding, swaps and defunds.
- **Not adopted from the prompt:** the payer's card signing a Minima WOTS claim to the merchant's Minima key for
  redemption on chain (0b.1, item 13). Loading into the merchant's own card replaces it.

### 4.5 Paying at a distance: signed payment requests (Stage 1, built 2026-10-06, D122 and D123)

The founder decided on 2026-10-06 that the card also pays at a distance, app to app, with no website or third party.
The receiver code gains five lines: `Name`, `Reference`, a one-time `Request` id, `Expires`, and a `Request
signature`, made with the payee's own card key over `STBR | 1 | payee | token | amount | address | name | reference |
request | expires`.

The payer's card:
- refuses a changed, expired or already paid request;
- names the signer (paid before, first payment, or a known name under a different key);
- always asks for Confirm send;
- caps the payment at the card's one-touch day level;
- sends it over the network in the D087 envelope.

The payment's 198 signed bytes are unchanged; the request id and reference ride with it unsigned, for matching. On
the physical card (Stage 2), the payment's attestation travels the same way on every channel. The full design,
including Phase 2 (merchant codes and on-chain ambassador listings) and how to test it, is in
[card-pay-at-distance.md](card-pay-at-distance.md).

---

## 5. Defund, and every covenant measured

### 5.1 Defund in two transactions

A coin that keeps state copies the **whole** transaction state (Phase 1, VERIFIED `TxBlock`), and a defund
carries an 8.4 KB chip signature. So, as in Phase 1:

- **D1 (verify; anyone can post; no signature except the chip's).** Inputs: the chip account coin and 5 helper
  coins. The account checks the chip's LX16 voucher: its digest, the key commitment, the bulk label check, the key's
  membership in the chip's registered key tree at index `i`, and `i` above the highest index already used, so no
  voucher can be used twice. It then moves its marker to a release coin Q whose address commits to the new account
  record and the amount. The helpers check the five signature chunks. Helper dust pays the fee.
- **D2 (settle; small state).** Inputs: Q and a vault lane. The vault pays the amount to the **owner's payout address
  stored on chain** (never to an address in the voucher, so a thief who knows the PIN still cannot redirect a defund),
  and the account coin is re-created with its new record.

**What the measured scripts carry beyond the baseline.** The measured D1 also checks three things that exist only for
broken chips: the chip's funding count against the chain's, its balance statement against a 1,000 cap, and a weekly
defund window. The measured D2 also spends one of the vendor's gates, whose job there is a weekly allowance per
vendor, and its vault lane applies a daily brake. All four are deferred (appendix D.5). The baseline drops them, and
dropping checks only removes instructions and bytes, so **the measured D1 and D2 figures below are upper bounds for
the baseline** (ASSUMED; the baseline variants are written and measured in Phase 3). Whether the baseline D2 keeps
the gate as an input at all (Q currently reads the vendor key from it) is settled then.

### 5.2 Measured branches (VERIFIED, receipt `balance_covenant_branches.json`: 82 cases, 0 unexpected)

In-process on the lab node's own jar (1.0.45.15), exactly as the node checks each input; templates and
clean-invariance checked on the live node. **Cross-check:** the D1 signature core counts **313 instructions on the
live node (`runscript`) and 313 in-process**, and the live node refuses the same core with a reused key index
(`kiss/balance/d1_core_runscript.kiss`).

The table lists the branches the baseline uses. The deferred branches and refusals from the same receipt (evidence,
penalties, vendor revocation, weekly windows, the brake) are in appendix D.5, numbers unchanged. † = measured with
deferred checks inside, so an upper bound for the baseline (5.1).

| Covenant | Branch | Instructions | Refusals measured (all `success=false`) |
|---|---|---|---|
| Chip account | FUND (pre-load; optional voucher top-up) | **96** | deposit sent elsewhere, count skipped, total inflated |
| | D1 defund verify † | **432** (+ 5 helpers x **800**) | release coin redirected, foreign helper, helper missing, label flipped, key index reused, signed by another key; a tampered secret or complement is refused by the helpers (798) |
| | D1 for an owner-revoked (lost) chip: still pays the owner † | 432 | |
| | Owner revoke (savings-wallet signature) | 88 | unsigned (46) |
| | Owner changes payout | 78 | signed by the vendor instead (50) |
| | Retirement (revoked, idle about 2 years: marker burned) | 67 | active account (56) |
| Release coin Q | D2 defund settle | **66** | record not kept, wrong summary, another vendor's gate |
| Vendor gate | D2: spent in the measured defund to count the vendor's weekly allowance † | **127** | |
| | Register a chip (vendor-signed) | 94 | unsigned, another vendor's key, pre-loaded counters, account sent to a fake address |
| | Withdrawal request / after 30 days | 54 / 93 | too early |
| | Retirement (idle about 2 years) | 46 | |
| Vendor bond | Withdrawal / retirement to the vendor | 72 / 36 | |
| Vault lane | D2 pay † (daily brake inside) | **167** | pays elsewhere, overpays, fake release coin (an account coin posing as Q), a stateless deposit used as a lane |
| | Merge deposits / split / retirement to a successor after 5 years (**branch removed** by the 2026-09-28 no-time-limit ruling; figure kept for the record) | 104 / 51 / 23 | a merge that skims, retirement too early |
| CHIP dispenser | Admit a vendor | 107 | bond below minimum, CHIP stock too large for the bond |
| Swap | Claim with the secret / refund after the deadline | **28 / 20** | wrong secret, redirected, refund before the deadline |

Largest single script: **800** (the helpers, 78% of the 1,024 limit; the same helper Phase 1 measured). Largest
covenant branch the baseline uses: **432** (D1, measured with its deferred checks inside). All texts parse and are
clean-invariant on the live node (the helper body must be carried in its cleaned form, which differs only in the
spacing around `^`); Q's address computed inside KISS equals the address of its literal text.

### 5.3 Transaction sizes (VERIFIED components, ASSUMED sums; receipt `balance_txn_sizes.json`)

| Transaction | Size | 64 KB cap | Core companion (100,000 characters) |
|---|---|---|---|
| FUND (a pre-load, or the optional voucher route) | about 10.1 KB (+ about 2.5 KB for the user's signed USDw input, ASSUMED) | yes | yes |
| D1 defund verify † | **27.6 KB** | yes | yes |
| D2 defund settle † | **15.7 KB** | yes | yes |
| **A whole defund (D1 + D2)** † | **about 43 KB** | | |
| Swap claim | 3.8 KB (the lock is an ordinary payment) | yes | yes |

### 5.4 Baseline parameters

| Parameter | Default | Enforced by | Why |
|---|---|---|---|
| Holding limit | **none set by the protocol**; the owner may set one | the chip | founder decision 14: keep any amount |
| No-PIN allowance | 50 per payment, 150 in total since the last PIN | the chip | protection against a lost chip (3.4) |
| Vendor admission | bond at least 10,000; one chip registration per 10 USDw of bond | CHIP dispenser | open, bonded vendors (decision 4); an entry price, not insurance |
| Vendor bond withdrawal | 30 days after the request | gate | keeps the bond in place long enough for any later rule to act on it; in the baseline nothing slashes it |
| Retirement | vault lanes: **none** (always-open exit, founder ruling 2026-09-28); vendor bond and gate: about 2 years idle; revoked chip account: about 2 years idle | each covenant | vault retirement-branch law (5.5) |

The first revision's rate limits (a 1,000 protocol cap, a weekly defund window per chip, a weekly allowance per
vendor, a daily vault brake), the evidence penalty and the defund fee reserve existed only to bound a broken chip;
they are in appendix D.5.

**Contention:** a defund spends its own account coin (only that chip uses it) and one vault lane (the measured D2 also
one of the vendor's gates). Each lane serves one defund per block, so the vault keeps many lanes. Funding creates a
new deposit coin and touches no shared coin at all.

### 5.5 Retirement branches (vault retirement-branch law)

Vault lanes and deposits: **no time-based retirement.** The founder ruled on 2026-09-28, for the Stage 1 vault, that it
"should not have time limit like 5 years". The same reason applies here, since this vault also only holds money 1:1 with
no pricing, so it was applied on 2026-09-29. The retirement path is the **always-open exit**: every chip holder can
always defund to their own savings. Nothing is ever swept, and backing for a lost chip stays in the vault like lost
cash (memory note: vault retirement-branch law, clarification of 2026-09-28). The measured 5-year branch is removed
from the design, and its figure is kept in the table for the record. Vendor bond: back to the vendor after about 2 years idle. Vendor gate:
unused marker stock burned after about 2 years idle. Chip account: holds no value; a revoked, idle account burns its
marker. Release coins and swap coins settle permissionlessly (the swap refunds after its deadline). Every branch is
in the measured table.

---

## 6. Lost chips, revocation and accepted vendors

### 6.1 A lost or stolen chip (the owner revokes with the savings wallet)

- **On chain:** OWNER REVOKE (88 instructions, needs the savings-wallet signature; refused unsigned). The account is
  marked lost. **Defunds still work and still pay only the owner's payout address**, so revoking never traps money
  and a thief who learns the PIN still cannot send a defund anywhere but to the owner.
- **Offline:** the next registry snapshot carries the revocation (6.2) and taps spread it; a chip that has it refuses
  the lost chip. Nothing in the baseline refuses a payer for carrying an old snapshot (that is the deferred freshness
  rule, appendix D.4).
- **Who is protected:** the owner. Under the premise the lost chip's money is real, so a receiver who accepts it loses
  nothing; revocation stops a thief from spending the owner's money at receivers that have heard of it.
- **What a finder can take:** only the PIN-less allowance (150 in total since the last PIN, section 3.4). A thief who
  also has the PIN can spend the whole balance chip to chip, as with cash and a known PIN. With no protocol cap, how
  much sits on a chip is the owner's choice, as with cash in a wallet.
- **Balance recovery: not in version 1 (recommended).** The chain cannot know a chip's balance, because payments never
  touch it. A recovery from the owner's last chip-signed balance statement would let a dishonest owner "lose" a chip,
  recover its balance, and keep spending it with the PIN at receivers who have not yet heard of the revocation. A
  limited form is possible (recovery after 90 days of the statement's balance minus the PIN-less allowance, capped),
  at that risk; it is a founder decision (section 10). The risk comes from a dishonest owner with an honest chip, so it
  stands under the premise. Without recovery, a lost chip costs its owner the balance, like lost cash; the system
  loses nothing (the unspent part stays in the vault as unclaimed backing). Modelled (ASSUMED, appendix D.7, table
  8.6): 630 lost chips a year with an average balance of 280 cost their owners 176,400 a year, and the system nothing.

### 6.2 Registry snapshots: how chips learn about vendors and revocations

The chip cannot read the chain, so two more chain facts reach it the same way a top-up does, through a signer it
already trusts: which vendors are registered and bonded, and which chips their owners have revoked. Visibility, not
trust, again.

- A **registry snapshot** is a vendor-signed statement "as of block h, the registered bonded vendors are V and the
  owner-revoked chips are L", with its entries. **Any accepted vendor may sign one**, and signing adds no judgement: it
  restates the chain. Phones check each entry against their own chain view and refuse snapshots dated in the future;
  a chip accepts only a snapshot newer than the one it holds.
- A vendor loads the current snapshot into every chip at manufacture. After that, every tap passes the newer snapshot
  from whichever phone has it to the other phone, which loads it into its chip. **No internet is needed**: a snapshot
  reaches an offline person through the first tap with someone more recently online.
- **Not in the payment path:** if every vendor stopped signing, payments would continue between chips that already
  accept each other's vendors; only new vendors and new revocations would stop reaching chips. This is the one job,
  besides the optional voucher, that vendors do after manufacture, and it is a decision (section 10).
- The snapshot version rides in every HELLO and TRANSFER (4.1). Nothing in the baseline acts on it; it is the hook for
  the deferred freshness rule.

Designed in words only (ASSUMED); the format is Phase 2 work.

### 6.3 Which vendors a chip accepts

Before paying or crediting, every chip checks that the other chip's certificate comes from a vendor on its
accepted-vendor list (4.1). That is what "certified" means to a chip: a software key carrying a self-made vendor
certificate is not a certified chip, and the list is what tells the two apart. The premise trusts certified chips; the
list is how a chip knows which chips those are.

In the baseline the list is **every bonded vendor registered on chain** (decision 4: open, bonded vendors). A new
vendor posts its bond, is admitted by the dispenser (107 instructions), registers its chips (94) and appears in the
next registry snapshot; from then on its chips can pay everyone the snapshot reaches. The owner's settings can narrow
the list (for example, refuse vendors below a bond), never widen it: widening would let an owner accept money from an
uncertified key.

The first revision proposed instead that vendors vouch for vendors (existing vendors decide whom to admit). That
exists only to keep a broken or dishonest vendor out, so it is deferred (appendix D.4).

---

## 7. What people see (UX flows)

Minimal-information law: the app shows the checking balance, the amount and who was paid; vendor, chip, counters and
limits sit behind a details view. Naming proposal carried from Phase 1: **Main balance** (savings) and **Instant
balance** (checking); Chuck decides (section 10).

1. **SIM phone to SIM phone (Android).** The receiver opens Receive and types the amount (or the payer does). The two
   phones touch. The payer confirms with a fingerprint or the PIN above the PIN-less limit. Both see "Paid" in about
   1.5 to 2 seconds. No internet on either side. If the tap is torn, the payer's app shows "Finishing payment" and
   completes it on the next contact.
2. **Card tapped on the receiver's phone (the payer needs no phone).** The receiver enters the amount and holds out
   the phone; the payer taps the card for about a second. Up to 50 (and 150 in total since the last PIN) no PIN is
   needed. Above that, the payer either "arms" the card on their own phone first ("Ready to pay up to 200") or types
   the PIN on the receiver's phone after a clear warning. **The receiver's phone does not need a chip of its own**
   (4.4): without one, it keeps each payment until the merchant taps its own card on the phone, and shows those
   payments as waiting to be loaded into the card. They can be spent offline once loaded. (The wording is Chuck's
   call, under the minimal-information law.)
3. **iPhone.** An iPhone reads cards but has no SIM access and no card emulation outside the EEA (Phase 0). An iPhone
   user with a card pays by tapping the card on anyone's Android phone, arms it with the iPhone, and receives into the
   card with three quick taps (own card, payer's card, own card) or online. With receive tickets (4.4), the first tap
   is done in advance and the last one is done later for a whole batch, so an iPhone at a till takes each payment with
   one tap of the payer's card. Phones with no chip pay online only (from the savings account), as assumed; they can
   still receive card payments offline (4.4).
4. **Moving money in.** "Buy a loaded chip" (a pre-loaded card or SIM from a vendor: its balance shows when the phone
   first reads it), "Buy from someone" (a swap with a nearby shop or anyone online: your savings money is released only
   when your chip has been paid), and, only where the chip's vendor offers the optional voucher, "Add from Main
   balance" (the money arrives a minute or two after the lock is confirmed).
5. **Moving money out.** "Move to Main balance" (two chain transactions, about two blocks). It always pays your own
   savings address.
6. **Lost chip and limits.** Revoking a lost chip is one button in the savings wallet. Your own limits sit in the
   checking settings, behind the PIN.

---

## 8. On-chain load per user

VERIFIED sizes (section 5.3), ASSUMED behaviour (the simulation's honest economy, appendix D.7, table 8.1): a consumer
makes about **3 chain transactions a month (about 23 KB)**: top-ups in lots of 100 by funding or swap. A merchant makes
about **36 a month (about 217 KB)**, almost all small swap claims (3.8 KB, and several can be claimed in one
transaction) plus about 2 defunds (43 KB each). The modelled economy of 21,000 users posts about **3,300 transactions
a day (0.7% of Minima's roughly 450,000-a-day capacity) and 22 MB a day**. At a million users the same behaviour would
be about 157,000 a day, a third of capacity, so batching swap claims and larger top-ups matter at scale. Payments
themselves never touch the chain.

Caveats for the baseline (ASSUMED, not re-simulated): the model sent half of all top-ups through the voucher route.
Without it those top-ups become swaps (a lock plus a 3.8 KB claim instead of one 10 KB funding), and the defund sizes
are upper bounds (5.1); neither should change the order of magnitude. The model also ran with the deferred limits in
place (cap, windows, brake); how much they shaped honest traffic was not separated out.

---

## 9. What remains unverified

| Item | Status | Risk | Closes in |
|---|---|---|---|
| Any of these scripts **mining** on mainnet | not done (no chain writes) | the unreproduced `basic:false` per-branch budget (doctrine; USDW plan 5.0) could reject heavy branches that pass here: **helpers (800), D1 (432)**. Fallback: FORS-SHA2 in one coin (625, Phase 1) or smaller helpers | Phase 3, one mined D1 + D2 |
| **Baseline variants of D1 and D2** (deferred checks removed; D2 perhaps without the gate) | not written or measured | removing checks can only lower the cost (ASSUMED); the measured versions are upper bounds | Phase 3 |
| In-process results | run on the node's own jar, cross-checked (D1 core 313 = 313 on the live node) | L1 | Phase 3 |
| Token amounts at 8 decimals in the vault and bond arithmetic | measured with whole-number test tokens | the doctrine's 8-decimal traps (`@AMOUNT` under keepstate, atom products) | Phase 3 with a valueless 8-decimal test token |
| Node versions 1.1.1.26 (embedded) and 1.6.11 (phone Core) | not measured | | Phase 3 |
| **EC reachable by applets on the sysmoISIM-SJA5-S17** | undocumented | if not, SIMs use the slow hash profile | Phase 6, first test on arrival |
| **Pixel OMAPI with a non-telecom JCOP SIM-cut card** | unknown | | Phase 6 |
| Tap times | ASSUMED from published per-APDU and per-operation figures | could be 2 to 3 times slower through the modem | Phase 6 |
| Atomicity and torn taps on silicon | ASSUMED (jCardSim cannot test it) | | Phase 6 tearing harness |
| LX16 security argument | ASSUMED, written by its designer (Phase 1) | | independent review before real value |
| Swap fallback claim by transfer (seller chip's LX16 statement) | designed; cost taken as D1's (ASSUMED) | | Phase 3 |
| Registry snapshot format (vendors and owner revocations) and accepted-vendor updates | designed in words only | | Phase 2 |
| Receive tickets and phone-held receiving (4.4) | designed in words only (2026-09-29) | the ticket batch format, pending-ring overwrite, and the revocation check at loading | Phase 2, then Phase 6 on an iPhone and an Android phone without a SIM applet |
| Optional voucher service (route 3) | designed in words only | | after routes 1 and 2, if built |
| Circulation and chain load without the voucher route | ASSUMED, not re-simulated (section 8) | | Phase 2 simulation |
| Chip-side memory and timing | ASSUMED sizing from published chip figures | | Phase 6 |

The unverified items that belong to the deferred machinery are listed in appendix D.1.

---

## 10. Decisions for Chuck (recommendation first)

1. **Deferred by founder decision 15: no purchase until Stages 1 and 2 are proven virtually.** Kept here as the future order. **Hardware to buy first, in this order** (Phase 6). Recommend the **EC profile** (tap about 1 to 2 s):
   1. NXP JCOP4 J3R180 cards (EC VERIFIED);
   2. a sysmoISIM-SJA5-S17 10-pack (€95.20; whether applets can use its EC is the first test on arrival);
   3. JCOP4 SIM-cut cards (to test whether Pixel OMAPI talks to a non-telecom card);
   4. readers: an ACS ACR1252U (contactless, for the cards) and an ACS ACR39U (contact, for the SIMs).

   The 9FV works only in the slow hash profile (6 to 9 s per tap). When the cards arrive, the first build is 0b.2.
2. **Default PIN thresholds.** Recommend no PIN for each payment up to 50 and up to 150 in total since the last PIN;
   the PIN always for defunds and limit changes; 3 wrong tries, then the vendor's PUK. Owners can lower these.
3. **Build the optional self-top-up voucher (route 3)?** Recommend **yes, later, opt-in per vendor**: build routes 1
   and 2 first, then add the voucher as a removable accelerator. It needs no exception to the dependency-free law.
   Alternative: leave it out; top-ups are then pre-loaded chips and swaps only.
4. **How new vendors and owner revocations reach offline chips.** Recommend **registry snapshots signed by any accepted
   vendor**, restating the chain and passed at taps (6.2). It is the one job, besides the optional voucher, that
   vendors do after manufacture (decision 4 says they act once), and it is never in the payment path. Alternative:
   lists fixed at manufacture, so a new vendor's chips can trade only with chips made after it registered, and a lost
   chip's revocation reaches no chip (the PIN alone protects it).
5. **Balance recovery for lost chips.** Recommend **none in version 1** (6.1): a lost chip is like lost cash, with the
   PIN as protection. The risk that rules it out is a dishonest owner, not a broken chip, so it stands under the
   premise. Alternative: a limited recovery after 90 days.
6. **The vendor bond.** In the baseline the bond is an entry price and the stake behind a vendor's certificate, not
   insurance. Recommend the measured admission values: at least 10,000 USDw, one chip registration per 10 USDw of
   bond, withdrawal 30 days after a request. (The first revision's 200,000 was sized to cover broken chips; it is in
   the appendix.)
7. **The vault's successor: resolved, none.** The founder ruled out time-based retirement (2026-09-28); applied on
   2026-09-29 (5.5). The always-open exit is the retirement path, and no successor address is needed. Still open: the
   vendor bond (about 2 years idle, back to the vendor) and the revoked chip account (about 2 years idle, marker burned)
   keep their timers, because neither sweeps user money. Confirm or remove.
8. **Confirm two working assumptions:** phones without a chip pay online only (iPhones pay with cards; they can still
   receive card payments offline, 4.4), and the names
   **Main balance** (savings) and **Instant balance** (checking).

No longer asked (moot under decision 14, kept for the record in appendix D.8): accepting the structural weakness, the
freshness rule, balance reports for a solvency check, the loss rule and emergency freeze, vendors vouching for vendors,
and the broken-chip parameters (cap 1,000, defund windows, vendor bond 200,000, penalty, brake, fee). The first
revision's funding decision is settled by the baseline routes (1.3).

---

## Appendix. Deferred: if a chip is ever broken

**Status: not in the baseline.** The baseline assumes certified chips are never broken (founder decision 14, in
Chuck's words: "start from a point of view where we trust the chip and on the road if we don't we will take decision;
otherwise we end up pretty much with a centralised system"). Everything here existed only to survive a broken chip, or
the failures that end in the same place: a cloned chip, a broken chip family, a dishonest vendor, a stolen voucher
key. It is kept intact (reasoning, measured scripts and receipts, simulation) so the question can be decided later, on
evidence. None of it appears in the baseline flows, UI, parameters or decisions. Cross-references inside the moved
text now point into this appendix (D.x) or to the baseline sections.

### D.0 The finding, as summarised for the first gate

**4. What a broken chip costs, and who pays.** This is the model's weak point and it is structural. A broken chip can
create balance from nothing, and the fake money looks exactly like real money. If its owner pays it into ordinary
chips they also own, **revoking the broken chip does not stop it**, because those chips never hear of the
revocation. In the model (5.6 million in checking balances, 21,000 users), one careful broken chip takes **1.3 to 2.5
million over 90 days with revocation alone**, and **0.36 to 0.61 million (a 6 to 11% haircut)** with the two fixes I
recommend: a **freshness rule** (a chip refuses payers whose revocation list is more than 7 days older than its own:
it cuts such chips off without making anyone depend on a service), and a **public solvency check** (chips' signed
balances compared with the vault, which proves fake money exists within about 12 days when 95% of balances report).
A broken chip family or a dishonest vendor costs **1.5 to 2.3 million even with a response**. Who pays: the
vendor's bond **only when there is on-chain evidence** (cloned chips, impossible statements); a careful attacker
leaves none, and then the loss is shared by everyone pro rata. One vault per vendor does not help: it runs dry on
honest traffic alone within about three weeks and puts the loss on the wrong vendor.

### D.1 What moved, and the hook it would use

| Mechanism | What it was for | Hook left in the baseline | Detail |
|---|---|---|---|
| Relative freshness rule (δ = 7 days) | cut off fence chips after a revocation | the snapshot version in HELLO and TRANSFER (4.1) | D.4 |
| Public solvency reporting (`AUDIT` statements, the solvency monitor) | detect counterfeit that a careful attacker leaves no proof of | the counters `S`, `R`, `D` and the balance in the chip | D.6.2 |
| Emergency freeze, pro-rata haircut, on-chain governance trigger | bound and share the loss after detection | the vault lanes (a new branch would be needed) | D.6.3 |
| Vendors vouch for vendors | keep a broken or dishonest vendor out | the accepted-vendor list (6.3) | D.4 |
| Protocol holding cap (1,000) as a security measure | bound what each fence holds | the owner's own limit field; the balance check in the measured D1 | D.5 |
| Counter comparison and on-chain evidence (impossible statements, clones), vendor penalties, vendor and family revocation | expose false funding and broken chips; make the vendor pay | the counters `k`, `F`; the account's status byte; the measured evidence, slash and revoke branches | D.2, D.3, D.5 |
| Rate limits: weekly defund window per chip, weekly allowance per vendor, daily vault brake | bound how fast fences can exit | the window fields in the measured account record; the gate; the lane | D.5 |
| Defund fee reserve (0.1%) and the loss-sharing rules | absorb and share losses | the vault | D.6.3 |
| Odometer | bound what one chip pays out over its life | none | table 8.3 |
| Receipt log and stored funding voucher in the applet, the `AUDIT` command | audits and anomaly reports | none | D.2 |
| Broken-chip loss tables and simulation conclusions | size the risk | none | D.7 |
| Class-break mitigations (vendor and chip-family diversity, bounded exposure per family, an on-chain switch per chip model), from the hardware-L2 prompt (2026-09-29) | bound the break of a whole chip model | the vendor id in each certificate; the version byte | D.9 |

**Why they centralise or restrict** (the founder's concern): the freshness rule makes being paid depend on
vendor-signed updates arriving; solvency reporting needs everyone to publish balances and someone to watch them; the
freeze is a governance switch over everyone's money; vouching lets existing vendors decide who joins; the cap limits
every user; the rate limits throttle every honest defund.

**Unverified items of the deferred machinery:** the fence and detection model, reporting coverage and attacker exit
rates (ASSUMED simulation, numbers illustrative; Phase 2 agent simulation); the emergency freeze and pro-rata claim
window (designed in words only; needs the governance covenant); the evidence branches (367) under the unreproduced
`basic:false` mining budget; the full revocation snapshot (batch ranges, attached clone proofs) and vendor-signed
acceptance-list updates (designed in words only).

### D.2 Detecting a false funding voucher

How each funding approach of 1.6 would be caught if abused (the column removed from that table):

| # | How false funding is caught and punished |
|---|---|
| a1 | Counter comparison (below): the chip reports its funding count in every payment and every chain-checked statement; a count above the chain's count is evidence, checked on chain at defund, and slashes the vendor bond |
| a2 | Same counter comparison; slashing hits the attester's bond |
| a3 | Nothing to catch: it is an ordinary chip payment |
| a4 | Nothing to catch: no money is created, it only moves chip to chip |
| a5 | Same counter comparison |
| e3 | Same counter comparison |

The first revision's text (was 1.5):

KISS cannot prove that a coin does **not** exist. The design avoids needing to:

- Every chip has an **account coin** on chain (`kiss/balance/chip_account.kiss`) that the covenant updates
  on every funding: **fund count k and total funded F**. Anyone can fund any chip; the covenant only lets k
  and F rise when the matching USDw enters the vault in the same transaction. These two numbers are
  authentic because the covenant pins them and any proof spends the current coin.
- The vendor's voucher names the chip, the new count k+1 and the new total F+X. The chip accepts only
  **k_chip + 1**, in order, and stores `(k_chip, F_chip)`.
- **Detection:** every payment the chip signs carries `(k_chip, F_chip)`. Any phone that later goes online
  compares it with the chain; `k_chip > k_chain` means the chip was credited for a funding that never
  happened (or that the chip is broken). Either way the vendor is at fault.
- **On-chain proof:** every chain-checked chip statement (a defund voucher, or an audit statement any
  receiver may ask for) carries `(k_chip, F_chip)`, signed with the chip's LX16 key. The account coin's
  DEFUND branch **refuses** a voucher with `k_chip > k` and the EVIDENCE branch accepts the same voucher as
  proof against the vendor: its bond is slashed into the vault and its chips' defund allowance stops.
  Measured in D.5 (evidence 367 instructions; refused when nothing is wrong).

**The limit, stated plainly:** a holder colluding with a dishonest vendor never lets that chip defund; the
money leaves through payments. Honest receivers' phones see the impossible funding count and can raise the
alarm, and the vendor's bond is on the line, but the fake money already paid onward cannot be told apart
from real money (D.6 explains why this is the central weakness of any fungible chip balance, not a
funding problem).

Applet state and commands that served these audits, removed from the baseline: the **receipt log** (64 x 20 B: the
last payers' truncated id, amount and counter, for audits and anomaly reports), the **latest funding voucher** (about
150 B, for audits) and the **`AUDIT`** command (sign a chain statement of the counters).

### D.3 Evidence that a chip or a family is broken (was 6.2)

| Evidence | Where it comes from | Checkable by | On chain |
|---|---|---|---|
| **Clone:** two different transfers with the same payer counter | two receivers' phones comparing receipts | any phone (EC signatures) | not directly; an honest receiver chip can re-state it with its own LX16 key |
| **Clone:** two chain statements by one chain key | two defunds or audits | the chain | EVIDENCE clone branch, **221** instructions |
| **Impossible statement:** funding count above the chain's, or balance above the cap | every payment carries both; every chain statement too | any online phone; the chain | EVIDENCE branch, **367** instructions |
| **Counterfeit exists somewhere** | the solvency monitor: chip-signed balance reports summed and compared with the vault reserve (D.6.2) | anyone, from public data | no (proves that, not who) |
| **The vendor says so** | vendor-signed family or batch revocation | chips and phones | vendor revoke (96 per chip) |

Chain-checked evidence moves the account to "revoked by evidence" (its defunds stop), moves a **10,000 USDw penalty
from the vendor's bond into the vault** (gate 115, bond 62 instructions; the release coin 63) and counts an
incident; the third incident freezes the vendor's gates. The penalty goes into the vault, not to claimants: Phase 1
showed that anything paid to claimants is captured by an attacker posing as its own victims (Phase 1 design, section 11).

The two payment profiles compared for catching a clone (the row removed from 4.2): with the **EC profile**, two ECDSA
transfers with the same counter are phone-checkable, not chain-checkable; with the **hash profile**, two LX16
signatures by one key are chain-checkable (221 instructions measured, D.5). In the first revision's payment protocol,
P's counter `n` is signed, so two different transfers with the same `n` are self-evident **equivocation** (a cloned
chip), which any phone can check and gossip (D.4).

### D.4 Relative freshness and vendor vouching (were 6.3 and 6.4)

The baseline keeps the signed snapshot and its spread through taps (6.2), but not the rule that refuses stale payers,
nor batch ranges or clone proofs, and it accepts every bonded vendor instead of vouched ones (6.3). The first
revision's text:

#### Signed snapshots and relative freshness (was 6.3)

- A **revocation snapshot** is a vendor-signed statement "the revocation list as of block h has root X", with its
  entries (chip ids and batch ranges; clone proofs can be attached so they verify themselves). Any accepted vendor may
  sign one; phones check each entry against their own chain view and refuse snapshots dated in the future.
- Every tap passes the newer snapshot from whichever phone has it to the other phone, which loads it into its chip.
  **No internet is needed**: a snapshot reaches an offline person through the first tap with someone more recently
  online.
- **Relative freshness rule (recommended, δ = 7 days):** a chip refuses to receive from a payer whose snapshot is more
  than δ older than its own. Honest payers are never blocked, only updated during the tap. A chip that is deliberately
  kept away from updates (a fence, D.6) is refused by everyone else δ after a revocation, and once it updates
  it refuses the revoked chip.
- **No availability dependency:** if every vendor disappeared, snapshots would stop advancing, nobody would be staler
  than anybody else, and payments would continue. The rule only compares chips with each other.

#### Which vendors a chip accepts: vendors vouch for vendors (was 6.4)

In the notes model a receiver's phone could check a vendor's bond on chain before trusting its notes. In the
chip-balance model that check cannot protect anyone, because once money is inside a chip it is indistinguishable from
real money wherever it goes next (D.6). So **acceptance must live in the chips**: each chip carries a list of
vendor root keys it accepts payments from, updated only by its own vendor's signature. The owner's settings can
narrow it (for example, refuse vendors below a bond), never widen it. A new vendor can post a bond and register chips
at once, but its chips can only pay each other until established vendors add it. **This turns decision 4 ("anyone can
become a vendor") into "anyone can apply; existing vendors vouch for each other"** and is a founder decision
(D.8).

### D.5 Deferred covenant branches and limits (measured)

From the same receipt as 5.2 (`balance_covenant_branches.json`, VERIFIED, L1), numbers unchanged.

**Deferred branches:**

| Covenant | Branch | Instructions | Refusals measured (all `success=false`) |
|---|---|---|---|
| Chip account | D1 after the weekly window resets | 437 | |
| | Evidence: funding count above the chain's | **367** | refused when nothing is wrong (319) |
| | Evidence: balance statement above the cap | 367 | |
| | Evidence: clone (two secrets of one chain key) | **221** | same secret twice (106), key not in the chip's tree (173) |
| | Vendor revokes a chip | 96 | |
| Release coin Q | Evidence settle | 63 | |
| Vendor gate | Slash on evidence | 115 | penalty too small |
| Vendor bond | Pay the penalty into the vault | 62 | penalty sent elsewhere |
| Vault lane | The brake floor lets a small lane pay 1,000 | 167 | |

**Deferred checks inside branches the baseline uses** (5.2), with the refusals they produced:

| Branch (5.2) | Deferred refusals measured |
|---|---|
| Chip account FUND (96) | evidence-revoked chip |
| Chip account D1 defund verify (432) | funding count above the chain's, weekly limit exceeded, balance above cap, evidence-revoked chip |
| Vendor gate D2 weekly allowance (127) | allowance exhausted, vendor frozen, a defund release coin used to slash |
| Vendor gate withdrawal (54 / 93) | after an incident |
| Vault lane D2 pay (167) | brake exceeded |

Largest covenant branch measured overall: **437** (D1 after a weekly-window reset). Evidence settle transaction:
**13.6 KB**, within the 64 KB cap and the Core companion limit (receipt `balance_txn_sizes.json`).

The first revision's limits (recommended parameters, all in the measured texts):

| Limit | Default | Enforced by | Why |
|---|---|---|---|
| Chip holding cap | 1,000 USDw | the chip; D1 refuses a larger balance statement and the evidence branch accepts it as proof | founder assumption |
| Chip defund window | 1,000 per 7 days (a vendor may register merchant chips up to 5,000) | chip account coin | bounds one chip's exit |
| Vendor weekly allowance | 100% of the vendor's bond per 7 days per gate, never below 1,000 | vendor gate | bounds all of one vendor's chips together (D.6) |
| Vault brake | 10% of a lane per day, never below 1,000 | vault lane | bounds the whole system's outflow per day (D.6) |
| Evidence penalty | 10,000 USDw per incident (or the whole bond), paid into the vault; third incident freezes the vendor | gate and bond | D.6 |
| Vendor admission | bond at least 10,000; one registration per 10 USDw of bond | dispenser | bounds how many chips a vendor can register |
| Vendor bond withdrawal | 30 days after the request; refused after any incident | gate | chips keep their exit |

### D.6 Detecting counterfeit money, and who pays (was section 7)

#### D.6.1 The central weakness, in plain words

A broken chip can create balance from nothing, and the fake money looks exactly like real money. The attacker's best
move is to pay it into ordinary chips **the attacker owns** ("fences"): genuine, honest chips whose owner's phone
simply never gives them revocation updates. Fences hold "clean-looking" money and spend it at shops, sell it for
savings money through swaps, or move it to savings on chain. Revoking the broken chip does not stop it, because
fences never hear of the revocation and keep accepting it. **Nothing the chips or the chain can check tells the fake
money apart from the real.** This is the price of fungible balances with no history (the rejected notes model paid
the opposite price). It is not a funding problem; a stolen funding key, a broken chip, a broken family and a
dishonest vendor all end here.

What exists instead:

| Mechanism | What it bounds | Measured / modelled |
|---|---|---|
| Holding cap (chip) | how much each fence holds at once | chip rule |
| Chip defund window (chain) | how fast each fence can move money to savings | 1,000 a week, account coin |
| Vendor weekly allowance (chain) | how fast all of one vendor's chips can move money to savings: this is what caps a **dishonest vendor's own** registered chips | gate, 127 instructions |
| Vault brake (chain) | how fast the whole system can drain, whatever the number of fences | lane, 167 instructions |
| Relative freshness (chips) | how long fences keep working after a revocation: δ | D.4 |
| Odometer (chips) | what a broken chip can pay **honest people directly** over its life | minor: fences are separate identities |
| Solvency monitor (public) | how long counterfeit stays unnoticed | D.6.2 |
| Emergency freeze (governance) | everything, from the moment it is triggered | not built; needs the governance covenant |
| Evidence penalty (chain) | a vendor's incentive to keep its chips sound | 10,000 per incident |

#### D.6.2 How and when the system notices

1. **Within hours, cryptographically**, when the attacker is sloppy: a cloned chip used twice (same counter or same
   chain key), a chip whose statements contradict the chain (funding count above the chain's, balance over the cap).
   Chain-checkable, penalty and revocation automatic.
2. **Within a day, for a stolen funding key**: every payment carries the payer's funding count; any online phone sees
   it exceed the chain's count.
3. **Within days to weeks, by the solvency monitor**, for a careful attacker. Phones publish their chip's signed
   balance (and the chip's counters) when online; anyone sums them and compares with the vault reserve on chain.
   Because every report comes from a genuine chip, **reported balances above the reserve prove counterfeit exists**.
   It is noticed once the counterfeit that reached honest hands exceeds the share of balances that does not report.
   Modelled: 95% reporting finds a 100-fence attack on day 12; 80% reporting only on day 43 (table 8.2, D.7). The data is
   public and self-verifying, so anyone can run the check; it is a detection tool, never in the payment path.
4. **Forensics after detection**: fences are genuine chips, but they show up on chain as accounts that defund at the
   weekly maximum, or sell swaps continuously, with no matching funding. Vendors can revoke them; that is a judgement,
   not a proof.

#### D.6.3 Who pays (loss waterfall, recommended)

1. **The vendor's bond**, through the penalty, **but mechanically only when there is chain-checkable evidence**
   (D.3). A careful attacker leaves none; then attributing the loss to a vendor needs a governance decision.
   **The founder's working assumption "broken-family losses hit that vendor's bond first" holds only for the
   evidence cases.**
2. **The defund fee reserve**: a small fee on every defund (0.1% modelled) kept in the vault absorbs small losses
   silently.
3. **Everyone, pro rata** (recommended): after an emergency freeze, a claim window in which every chip files a defund
   claim; the vault then pays each claim the same fraction. Fences file too and get the same fraction, so it does not
   reward the attacker beyond its stock.
   - The default if nothing is built is **last out loses**: the vault pays in full until it is empty. Merchants, who
     defund daily, get out; consumers holding balances lose everything that remains (table 8.5, D.7).
   - **One vault per vendor is not recommended**: honest traffic alone drains the vaults of merchant-heavy vendors
     within about three weeks (consumers fund on one vendor's vault, merchants defund from another's), and settling
     between vaults by "who paid last" puts the loss on the vendor whose chips the fences happened to be, not on the
     broken vendor (table 8.5, D.7).

#### D.6.4 Fraud-profitability condition (ASSUMED model)

```
attacker gain  ~  exit rate x (days until detected + δ)  +  fences x holding cap       (freshness rule)
               ~  exit rate x days until detected         +  fences x holding cap       (emergency freeze)
exit rate      =  goods it can buy per day + swaps it can sell per day
                  + min(fences x chip defund window, vendor allowances, vault brake) per day
breaking a chip pays  <=>  gain x resale value  >  cost of breaking the chip + cost of fences
```

Bonds do not enter the attacker's side at all unless the attacker is the vendor: **for a careful attacker the only
deterrents are the cost of breaking a certified chip and the speed of detection.** That is the founder's premise
("if we can't trust the chip, all this venue is pretty much hopeless") stated as an inequality.

### D.7 Simulation (`sim/balance/balance-sim.mjs`, results in `sim/balance/results/`)

The tables between the markers are generated by `sim/balance/summarize.mjs` and keep the generator's numbering (8.1
to 8.6, from the first revision), so a re-run replaces them cleanly. Two of them also inform the baseline: 8.1 (the
honest economy, used for chain load in section 8) and 8.6 (lost and stolen chips, used in 6.1).

<!-- BALANCE-SIM:BEGIN (generated by sim/balance/summarize.mjs) -->
### 8.1 Model and honest economy (ASSUMED model)

20,000 consumers and 1,000 merchants on 5 vendors, 90 days, daily flows. Consumers spend 15 USDw a day by chip; merchants pay 30% back as wages and 10% to suppliers chip to chip, and turn the rest into savings, half by selling to consumers through swaps and half by defunding. Holding cap 1,000; chip defund window 1,000 a week; vault brake 10% a day; vendor bond 200,000 each with a weekly allowance of 100% of the bond; 0.1% defund fee kept in the vault.

| Measure | Value |
|---|---|
| Chip payments per day | 300,000 USDw |
| Funding (FUND) / swaps / defunds per day | 105,000 / 105,000 / 75,000 USDw |
| Vault reserve (= all checking balances) | 5,600,000 USDw |
| Vault brake capacity per day | 560,000 USDw |
| Bond each vendor needs so its merchants' honest defunds fit its weekly allowance | 26,250 / 26,250 / 105,000 / 157,500 / 210,000 |
| Chain transactions per month: consumer / merchant | 3.1 (23 KB) / 36.0 (217 KB) |
| Whole economy per day | 3,300 transactions, 22.0 MB |

### 8.2 A stealthy broken chip (pays only its owner's fence chips; found by the solvency monitor, 95% of balances reporting)

| Fences | Response | Detected on day | Lost: goods / swaps / defunds | Still in fences | Total shortfall | Haircut if shared | Attacker profit (break cost 50,000) |
|---|---|---|---|---|---|---|---|
| 10 | revocation only | 22 | 180,000 / 945,000 / 128,571 | 10,000 | **1,263,571** | 22.4% | 1,094,421 |
| 10 | freshness, 3 days | 22 | 52,000 / 270,500 / 35,714 | 0 | **358,214** | 6.3% | 276,554 |
| 10 | freshness, 7 days | 22 | 60,000 / 312,500 / 41,429 | 0 | **413,929** | 7.3% | 327,429 |
| 10 | emergency freeze | 22 | 44,000 / 231,000 / 31,429 | 10,000 | **316,429** | 5.5% | 229,559 |
| 100 | revocation only | 12 | 180,000 / 945,000 / 1,285,714 | 100,000 | **2,510,714** | 44.7% | 2,249,314 |
| 100 | freshness, 3 days | 12 | 38,000 / 199,500 / 264,286 | 0 | **501,786** | 8.8% | 426,296 |
| 100 | freshness, 7 days | 12 | 46,000 / 241,500 / 321,429 | 0 | **608,929** | 10.8% | 528,599 |
| 100 | emergency freeze | 12 | 24,000 / 126,000 / 171,429 | 100,000 | **421,429** | 7.4% | 254,409 |

**How much of the economy must report its balances** (100 fences, freshness 7 days):

| Balances reporting | Detected on day | Shortfall | Haircut |
|---|---|---|---|
| 80% | 43 | 1,439,286 | 25.6% |
| 90% | 22 | 876,786 | 15.5% |
| 95% | 12 | 608,929 | 10.8% |
| 99% | 4 | 394,643 | 6.9% |

### 8.3 Other incidents

| Incident | Response | Detected on day | Shortfall | Vendor bond used | Haircut on everyone |
|---|---|---|---|---|---|
| sloppy single chip (evidence) | freshness, 7 days | 2 | 341,071 | 200,000 | 2.4% |
| sloppy single chip (evidence) | emergency freeze | 2 | 153,571 | 153,571 | 0.0% |
| stolen funding key | revocation only | 1 | 5,111,429 | 200,000 | 87.6% |
| stolen funding key | freshness, 7 days | 1 | 636,571 | 200,000 | 7.7% |
| stolen funding key | emergency freeze | 1 | 254,571 | 200,000 | 0.8% |
| broken family / dishonest vendor | revocation only | 4 | 11,883,571 | 0 | over 100% (vault emptied) |
| broken family / dishonest vendor | freshness, 7 days | 4 | 2,330,214 | 0 | 41.5% |
| broken family / dishonest vendor | emergency freeze | 4 | 1,483,714 | 0 | 26.4% |

**Odometer** (a lifetime cap on what one chip identity may pay out, enforced by receiving chips): a broken chip that pays honest people directly can take at most the cap (50,000 / 100,000 / 250,000 for caps of 50,000 / 100,000 / 250,000). It does **not** bound a chip that pays only fences, because each fence is a separate genuine identity and the broken chip can misreport its odometer to fences whose owners never publish receipts.

### 8.4 Vendor bond needed to cover one broken chip (50 fences)

| Response | Detected on day 1 | day 3 | day 7 | day 14 | day 30 |
|---|---|---|---|---|---|
| freshness, 7 days | 207,143 | 246,429 | 325,000 | 462,500 | 776,786 |
| emergency freeze | 69,643 | 108,929 | 187,500 | 325,000 | 639,286 |

### 8.5 Who bears a loss the bonds do not cover (broken family, freshness 7 days)

| Rule | Result |
|---|---|
| Shared vault, pro-rata haircut | every holder loses 41.49% |
| Shared vault, last out loses | the vault pays merchants (who defund daily) in full; the people still holding balances when it runs dry, mostly consumers, lose 46.47% |
| One vault per vendor, no settlement | fails on **honest** traffic alone: the merchant-heavy vendors' vaults run dry after 24.9 and 19.8 days (weekly net flows 267,750 / 194,250 / 42,000 / -120,750 / -173,250) |
| One vault per vendor, settled by the last payer's vendor | the loss lands where the fences are, not on the broken vendor: fences spread over all vendors: 22.89% / 30.37% / 41.49% / 108.07% / 94.84% by vendor, broken vendor 22.89%; fences all at one honest vendor: that vendor's holders lose 405.04%, the broken vendor 0% |

### 8.6 Lost and stolen chips

At 630 lost chips a year (3% of chips) with an average balance of 280: owners lose 176,400 a year in total (the whole balance, like cash); a finder without the PIN can spend at most 150 per chip (94,500 a year). The system itself loses nothing: the rest of a lost balance stays in the vault as unclaimed backing.
<!-- BALANCE-SIM:END -->

### 8.7 What the simulation says (ASSUMED model; the numbers are illustrative, the directions are the finding)

1. **Revocation alone does not stop a broken chip.** With fences it drains at the full exit rate for as long as the
   run lasts (1.3 to 2.5 million over 90 days in a 5.6 million economy), whatever the detection day.
2. **The relative freshness rule turns an open-ended loss into a bounded one**: about 0.36 to 0.61 million for one
   careful broken chip found by the solvency monitor (6 to 11% of all balances), mostly through swaps and defunds.
3. **Detection speed is the biggest lever**: the share of balances that report is worth more than any bond (80%
   reporting: 1.4 million; 99%: 0.39 million).
4. **A broken family or a dishonest vendor exceeds any plausible bond** (1.5 to 2.3 million with a response; more than
   the whole vault without one). Deliberate vendor admission (D.4) and chip certification are the real protection.
5. **A stolen funding key is caught within a day** and costs about 0.25 million (freeze) to 0.64 million
   (freshness 7 days).
6. **Bonds cover the detected, evidence-backed cases**: 200,000 covers one broken chip caught within about a week
   under a freeze (187,500); under the freshness rule even detection on day 1 costs about 207,000 (table 8.4).
7. **Shared vault, pro rata, beats the alternatives** (table 8.5).

### D.8 Decisions that would return (items 3 to 8 of the first revision's list)

Not asked now. Kept as written, for the day a chip is broken:

3. **Accept the central weakness** (D.6): a careful broken chip is noticed by the solvency monitor, not by
   cryptography, and its losses are shared. If this is not acceptable, the only structural alternative is money with
   history (the notes model), which was rejected.
4. **Add the relative freshness rule** (δ = 7 days): bounds the damage after detection; no availability dependency.
5. **Build the solvency monitor and ask users to report balances by default** (anonymous, signed by the chip):
   detection speed is the largest lever. This publishes each chip's balance under a pseudonym; a privacy decision.
6. **Loss rule: shared vault, pro-rata haircut after an emergency freeze** (needs a governance trigger), not
   last-out, and **not one vault per vendor**. Vendor bonds are first loss **only on chain evidence**; for a careful
   attacker, attributing losses to a vendor is a governance decision.
7. **Vendors vouch for vendors** (D.4): chips accept only vendors their own vendor admits. This changes decision 4.
8. **Parameters:** holding cap 1,000; no-PIN limit 50 per payment and 150 in total; chip defund window 1,000 a week
   (5,000 for merchant chips); vendor bond at least what its merchants defund in a week and not below 200,000;
   evidence penalty 10,000; vault brake 10% a day; defund fee 0.1% kept as a reserve.

### D.9 Class-break mitigations (added 2026-09-29, from the hardware-L2 prompt)

**Status: deferred like the rest of this appendix; not in the baseline.** A class break is a flaw across a whole chip
model rather than one broken chip. The prompt cites ROCA (2017, the Infineon RSA key-generation flaw) as the example
(cited by the prompt, not checked here). It is the "broken family or dishonest vendor" incident already modelled in
table 8.3 (1.5 to 2.3 million with a response, 11.9 million with revocation alone; ASSUMED model). If a chip family is
ever broken, these would be decided on evidence:

1. **Vendor and chip-family diversity.** Keep more than one vendor and more than one chip family in circulation. The
   design already allows it: the J3R180 card and the sysmoISIM-SJA5 are different chips from different makers, and
   vendors are open (decision 4). Diversity bounds the share of all balances that sits on any one family. It needs no
   authority. The hook is the vendor id in each certificate (4.1); a chip-model or batch field could arrive with a new
   version byte (ASSUMED).
2. **Bounded exposure per family.** What one family can counterfeit is bounded by holding limit x chips of that
   family, plus whatever those chips receive. In the baseline there is no protocol cap (decision 14; the 1,000 cap is
   in D.5), so the only bound today is each owner's own limit. Two forms would return for decision: a protocol cap
   per chip (D.5), or receivers narrowing their own accepted-vendor list (6.3 already allows narrowing, never
   widening), which is receiver-side and needs no authority.
3. **An on-chain switch that disables offline sending for a chip model or certificate batch** (the prompt's §7).
   Someone must be able to flip it, so it is an authority over everyone's chips, and chips cannot see the chain in
   any case (1.2), so it would have to reach them through registry snapshots (6.2). It belongs with the emergency
   freeze (D.6.3) as a **governance choice** through the governance covenant, not in the protocol baseline. The
   nearest existing pieces are the vendor's own chip revocation (96 instructions, D.5) and vendor-signed family or
   batch revocation (D.3).

The prompt's per-card caps (for example 200 held and 50 per payment) are not a class-break mitigation this design
adopts: as a protocol cap they conflict with decisions 13 and 14 (0b.1, item 7).
