# Agent brief: Stables payment account (offline payments on Minima), v3

> ## Version 3 pivot, 2026-09-27 (read this first; it overrides the sections listed below)
>
> **Founder decision 13: the chip-balance model.** The checking account is a **balance held inside a certified secure chip** (SIM applet or contactless card). The chip is **trusted to operate honestly**; the chain and bonds are the **insurance** for the day a chip is broken. In Chuck's words: "if we can't trust the chip, all this venue is pretty much hopeless."
>
> **Required product (founder):**
> - **Savings account:** the on-chain wallet, as today.
> - **Checking account:** on the SIM or card.
> - The user keeps money in checking **as long as they want**, makes **as many payments as they want**, of **any amount**, with **no internet**, and **settlement is final at the tap**.
> - Users post **no bond**.
>
> **Why:** the notes model (Phase 1, first design) refused to trust the chip. That forced coin history, hop caps, freshness and expiry, fixed notes with change, heavy cashing, and user bonds. The founder rejected it as too compromised. The notes design stays on file, marked superseded (`docs/payment-account-design.md`). Its proven parts carry over: the LX16 on-chain signature check, the helper-coin split, vendor certificates and bonds, the applet rules, and the measurement tools.
>
> **How it works:**
> - Payments are chip to chip and never touch the chain.
> - The chain sees only **funding** (savings to chip) and **defunding** (chip to savings), which are rare. Defunding is authorised by a chip signature the chain can check: LX16, split across helper coins as in Phase 1.
>
> **Working assumptions for the redesign** (recommended to Chuck; confirm at the gate):
> - a holding cap per chip, starting at 1,000 USDw;
> - phones without a chip get online payments only;
> - losses from a broken chip family hit that vendor's bond first; beyond that, compare a shared haircut with one vault per vendor.
>
> **Superseded by this pivot:**
> - founder decisions 3 and 8 (hop caps), 7 and 9 (user-bond slashing and loss rule), and 10 (coin-history privacy);
> - the "Signature architecture" and "The hard open question" sections;
> - the note-specific parts of "Fraud and risk mechanisms" (hop cap, freshness, device bond per user);
> - the two-tier table, since phone-only offline is dropped.
>
> **Still in force:** everything else, in particular:
> - the design principles (decentralisation first, no upstream Minima changes, retirement branches);
> - the verified facts;
> - the Phase 0 findings (`docs/phase-0-research.md`);
> - vendors as open, bonded certifiers who load the published open-source applet (decisions 4, 11 and 12);
> - virtual first; test devices; environment and constraints.
>
> **Founder decision 14 (2026-09-27): design from full trust in the chip.** The baseline assumes certified chips are never broken. Chuck: "start from a point of view where we trust the chip and on the road if we don't we will take decision; otherwise we end up pretty much with a centralised system." So:
> - Everything added only to survive a broken chip is **removed from the baseline** and parked in a "Deferred: if a chip is ever broken" appendix, to be decided later on evidence. That covers the revocation-freshness rule, public solvency reporting, the emergency freeze and haircut, vendors vouching for vendors, the protocol holding cap, and counterfeit-detection machinery.
> - **Top-up baseline, no operated service required:**
>   1. pre-loaded chips (the vendor loads at manufacture);
>   2. the trustless swap (anyone with checking money sells it for savings money);
>   3. an optional vendor self-top-up voucher, a *removable accelerator* under the dependency-free law, since routes 1 and 2 work without it.
> - **Kept, because they are not about chip breakage:**
>   - open, bonded vendors (decision 4);
>   - the published applet (11);
>   - PIN and no-PIN thresholds and user-set limits, for lost chips;
>   - defund via a chain-checked chip voucher;
>   - revocation of a lost or stolen chip by its owner.
> - Cheap protocol hooks that let later mitigations be added without a redesign (version byte, counters, a revocation field) stay in, unused.
>
> **Founder decision 15 (2026-09-27): build it in the test phase first; hardware is a roadmap.** The payment account must be implementable and testable in the current test channel. The first milestone is a working off-chain layer (L2) with **direct wallet-to-wallet payments by NFC tap** between two phones. At this stage it does **not** need to live in a SIM or chip: the Stables Android app plays the chip ("software chip"), running the same protocol. The hardware stages are a **vision to document**, not a purchase. No hardware order until the virtual stages prove the design. The ultimate target is **a Minima node on the chip**.
> - **Stage 1 (test phase):** the checking account lives in the standalone Android app. The app's own embedded Minima node sees the chain, so top-ups are verified by the app itself (no voucher, no swap needed), and defunds can use Minima-native signatures. It is tested with valueless test tokens on the two Pixels. Stated honestly: this is trusted *software*, fine for test tokens and not for real value.
> - **Stage 2:** the key and balance move into a secure element (Java Card SIM or card: `docs/chip-balance-design.md`). Chips cannot see the chain, so top-ups use pre-loaded chips, swaps, or the optional voucher. This stage is emulated virtually (jCardSim) before any purchase.
> - **Stage 3 (ultimate):** a Minima node running on the secure chip itself. It verifies the chain and signs natively, and the phone becomes only a screen and an antenna. *Updated 2026-09-29:* Minima, with the University of Southampton, Siemens and Arm, already runs a full node on embedded hardware (the Arm subsystem of an FPGA development board, with hardware SHA-3 cores). It was announced as a breakthrough on 15 December 2025, and a drone proof of concept followed in 2026 (VERIFIED at the public sources). Whether that chip has a secure element, attestation, anti-rollback storage, third-party code loading or a phone form factor is **unknown**. Facts and sources are in `docs/chip-balance-design.md` 0a; the questions for the Minima team are in 0b.3.
>
> **Reconciled 2026-09-29:** an outside hardware-first research prompt (`docs/hardware-l2-prompt.md`) was mapped against decisions 13 to 15 in `docs/chip-balance-design.md` section 0b. Its superseded parts and its conflicts with settled decisions are not to be built. Adopted: a card tapped on a merchant's phone that receives but cannot re-spend offline until it loads into its own card (4.4), the first build once cards arrive (0b.2), the questions for the Minima team (0b.3), and class-break mitigations (appendix D.9 only).
>
> **Reconciled 2026-09-29 (second prompt):** `docs/javacard-simulator-prompt.md` (build the Java Card L2 in jCardSim first) was mapped the same way in `docs/chip-balance-design.md` section 0c. Recorded there as the founder's stated direction: **Java Card route only**; the phone-keystore route (Android limited-use keys) is parked, because single-use limits are not hardware-enforced on the target phones. Stage 1's software chip is a test-phase stand-in and is unaffected. The prompt's adopted deliverables form the Stage 2 virtual work package (0c.2). Its private node, notes, fraud proofs, caps, expiry and hop limits are not to be built. Open: whether step 1b is parked too (0c.3).
>
> **Phase 1 redo done 2026-09-27; waiting for Chuck's gate.** Design: `docs/chip-balance-design.md` (decisions in its final section). Scripts: `kiss/balance/`. Receipts: `measure/receipts/balance_*.json` (82 covenant cases, all as expected). Simulation: `sim/balance/`. The funding crux is answered by vendor vouchers (an operated service in the funding path, which is Chuck's decision) plus a trustless swap fallback. The structural weakness is stated: a broken chip mints untraceable money, and losses are shared unless there is on-chain evidence.
>
> **The first crux for the redesign:** how does a chip learn, securely, that money was really locked on chain when it is funded? The chip cannot verify Minima proofs (they use SHA-3), and the phone owner is untrusted. Any answer that trusts an operated service (for example a vendor's funding attester) must be stated plainly against the dependency-free law.

> **Version 2, 2026-09-27.** Replaces v1 (kept at `archive/stables-payment-layer-agent-brief.v1.md`).
> What changed and why:
> - Secure chips **cannot produce Minima signatures** (verified, see "Verified facts"), so transfers are signed with a SHA-256 one-time signature scheme the chain can check.
> - **Virtual first:** everything is built and proven with a virtual chip; hardware confirms later.
> - Money received offline is **re-spendable offline right away**, made safe by receiver rules.
> - **Two tiers** (phone-only and chip) run one protocol.
> - **Certifiers are chip vendors**, open to anyone and bonded.
> - The chain-usage budget is removed: transactions compete through burn.
> - Environment, paths and laws are corrected to this repository.

## Who you're working with

You're working with Chuck, product manager and founder of **Stables**, a Minima-based system for wrapped fiat tokens (USDw, EURw, etc.). Chuck doesn't write code: **you do the implementation**, and you explain decisions to him in plain language. Stop at each phase gate below and summarise before moving on.

Before starting, read the files under "Required reading". Build on what already exists (the Stables app, its embedded node bridge, the covenant playbook) rather than duplicating it.

## The goal

Give each Stables user two accounts:

- **Savings account:** the user's normal on-chain Minima wallet, with full Minima security. A direct payment is seen by the receiver in about 5 seconds and final in one block (about 50 seconds).
- **Payment account:** capped spending money that moves **peer to peer, offline, instantly**, with no ledger check at payment time. **Money received offline can be spent offline again right away.** Minima is the backstop for loading, cashing, revocation and fraud.

The payment account comes in **two tiers that share one protocol**:

| Tier | Where the signing key lives | What protects receivers | Offline limits |
|---|---|---|---|
| **Phone-only** | In the app (software) | The holder's bond only | Small |
| **Chip** | Inside a certified secure chip (card, SIM, ring, sticker) | The chip refuses to sign twice, plus the holder's and the vendor's bonds | Larger |

The receiver's app knows the tier from the payment itself, because a chip payment carries a vendor certificate. Existing product language for a fast balance is "Main balance / Instant balance / Prepare money" (see the Omnia handover in Required reading). Propose in Phase 1 whether the payment account adopts it; Chuck decides the naming.

## Founder decisions (2026-09-27)

1. **Virtual first.** Real chips are hard to obtain, so build and prove everything with a virtual chip. Hardware (Phase 6) confirms the design on real silicon.
2. **No chain-usage budget.** Minima transactions compete through burn, so there is no Stables-imposed cap. Still keep on-chain steps per user low, because each one can cost that user a burn when blocks are full.
3. **Offline-received money is spendable offline immediately.** Safety comes from rules the receiver enforces: an offline threshold (above it, cash the coin on chain before handing over goods), a hop cap and a freshness window.
4. **Certifiers are chip vendors.** A vendor is the company that loads the Stables applet onto a chip, locks it and sells it.
   - Anyone can become one (open).
   - A vendor may lock a bond on chain, which is slashed if a chip it certified is proven to cheat. The vendor chooses the bond size; the receiver chooses the minimum it accepts.
   - A vendor with no bond is allowed, but its chips are treated as phone-only tier.
   - Vendors act once, at manufacture, and are never in the payment path. If a vendor disappears, its chips keep working.
5. **Two tiers** as above. The phone-only tier is a real product mode with honestly stated risk, not just a test harness. It is also the only route for iPhone users until iOS allows an equivalent.
6. **Test devices:** a Pixel 7 Pro running stock Android, which is also Chuck's primary Stables review phone, and a Pixel 7 running GrapheneOS.

**Phase 0 gate decisions (2026-09-27; Chuck accepted every recommendation)**

7. **Slashed bonds:** start at half burned, half paid to claimants pro rata after a claim window. The Phase 1 simulation tunes the split. Burning exists because a cheater can pose as their own victims.
8. **Hop cap for phone-only money: 2.** A receiver can re-spend it offline once before it must be cashed. The chip-tier cap is set in Phase 1, bounded by transaction size.
9. **Loss rule:** whoever cashes second bears the loss and is compensated from the device bond, then the vendor bond. Default offline limits are lower for people who are rarely online.
10. **Privacy:** accepted for version 1. A coin reveals the anonymous device IDs of its recent holders (up to the hop cap), never names.
11. **Vendors must load the published open-source Stables applet** (reproducible build), backed by their bond.
12. **Vendors keep their card-management keys after locking,** so they can ship security updates. Abuse costs them their bond.

## Design principles (non-negotiable)

- **Decentralisation comes first,** ahead of speed. No coordinator, operator, oracle, federation or server in the payment path or any protocol path, and nothing that needs permission from a telecom, phone maker or platform. Before adding anything hosted, ask: "what breaks if this host disappears?" If the answer is anything protocol-visible, redesign, or stop and tell Chuck.
- **No upstream Minima changes.** Design within the node's existing commands and the KISS VM as it is today. Never plan on a future Minima feature, such as new signature types.
- **Fraud-unprofitable, not fraud-free.** Assume chips will eventually be broken and phone keys copied. Every mechanism exists to keep the cost of cheating above what cheating can collect.
- **Savings stay on-chain.** Only capped amounts ever sit in the payment account.
- **The chip has one security job: never sign the same coin twice.** Everything else runs in the app, where receivers protect themselves: verifying incoming payments, storing coin history, revocation, limits.
- **Every covenant that holds value has a mechanical retirement branch** (vault retirement-branch law).
- **Ambassadors stay communication-only** (2026-09-24 ruling): they never hold, front or forward money and sign nothing, so they take no role in this system.
- **Minimal information in the UI:** users see decision-relevant figures only. Details such as vendor and bond sit behind a details view.

## Verified facts (checked 2026-09-27; cite them, don't re-derive)

**Minima signatures and scripts.** Source: `1_development/stream_1_app/work/scratch/minima-core-runtime-gap-2026-08-07/src/org/minima/`.

- A Minima key (TreeKey) is Winternitz one-time signatures with w=8 over SHA3-256, arranged in a tree:
  - 34 hash chains.
  - About 8,670 hashes to generate one one-time key and about 4,300 on average to sign.
  - 1,088 bytes per one-time signature.
  - The default tree is 64 keys × 3 levels = 262,144 signatures, and one tree layer costs about 555,000 hashes.
  - Sources: `objects/keys/TreeKey.java`, `TreeKeyNode.java`, `Winternitz.java`.
- KISS `CHECKSIG` builds an empty TreeKey from the public key alone, so it accepts any tree shape up to 8 levels. It costs 32 instructions (`kissvm/functions/sigs/CHECKSIG.java`).
- KISS limits are 1,024 instructions per script and a stack depth of 64 (`kissvm/Contract.java`).
- **Every evaluated expression counts as an instruction:** constants, variables, operators, function calls and statements (`kissvm/expressions/*.java`, `StatementBlock.java`). A loop of hash checks therefore costs roughly 10 to 15 instructions per iteration, not 1.
- KISS has `SHA2`, `SHA3`, `PROOF` (Minima MMR proofs), `BITGET`, `SUBSET` and `CONCAT`.
- `runscript` dry-runs a script with `state`, `prevstate`, `globals`, `signatures` and `extrascripts`, and returns the trace, `success` and `monotonic` flags with no chain write. Use it for every instruction-cost measurement.
- Heavy scripts can fail to mine even under 1,024 instructions. This is recorded as a per-branch complexity budget (`basic:false`), is still open and unreproduced, and has a known workaround of splitting work across co-spent coins. See `MINIMA_BUILDING_DOCTRINE.md` and `USDW_CHAIN_BUILD_PLAN.md` §5. Arithmetic products must stay under 2^64 (same section). So **measure every script on a real node too**, not only in `runscript`.
- **A transaction (TxPoW) is capped at 65,536 bytes** (measured: "TxPoW size too large 95243/65536", 2026-09-03). Minima Core's IPC reply is capped at 100,000 characters, and `txnbasics` hits that first. Both limit how many hops a single cashing transaction can carry.
- Chain capacity is 256 transactions per block with blocks about 49 s apart: about 450,000 a day **shared by every app on Minima** (`0_handshake/global_knowledge_base.md`, 2026-09-24).
- Full Minima transaction signing measured 2.6 to 4.2 s on desktop JVMs (`RETAIL_PAYMENT_INFRASTRUCTURE_PLAN.md`, F-029). Measure the phone figure yourself.

**Secure chips (the finding that reshaped v1).**

- **NXP JCOP4 J3R180:** no SHA-3 at all; every `ALG_SHA3_*` returns `NO_SUCH_ALGORITHM`. SHA-256 is in hardware: 2.56 ms for 32 bytes and 7.9 ms for 256 bytes. Free memory is 139,360 bytes persistent and about 4 KB transient. Source: JCAlgTest measured results.
- **sysmoISIM-SJA5:**
  - Java Card 3.0.4 with SHA-1/224/256, AES, DES and HMAC. No SHA-3 is available to applets; its internal TUAK algorithm uses Keccak but is not exposed.
  - The ARA-M applet is preinstalled (AID `a00000015141434c00`).
  - Applets install via GlobalPlatformPro over SCP02 with card-specific keys.
  - Source: sysmocom SJA5 manual.
- Of about 60 cards JCAlgTest tested for SHA-3, one supports it, and that one is a test eUICC, not a product you can buy.
- Software SHA-3 on a Java Card measures about 6.7 s per hash (OptimizedJCAlgs), which works out to **about 8 hours per Minima signature**.
- **Consequence:**
  - A secure chip cannot produce Minima signatures.
  - v1's fallback ("fast standard signatures until KISS supports them") is ruled out by the no-upstream-changes law.
  - The chain can never verify ECDSA or other standard chip signatures.

Sources:
- https://github.com/crocs-muni/jcalgtest_results (J3R180 profile)
- https://www.fi.muni.cz/~xsvenda/jcalgtest/run_time/NXPJCOP4J3R180SECIDP71.html
- https://sysmocom.de/manuals/sysmoisim-sja5-manual.pdf
- https://github.com/crocs-muni/OptimizedJCAlgs (Sha3)

## Signature architecture (proposed; Phase 1 must prove it or replace it)

- **Transfers are signed with a Stables one-time signature scheme built on SHA-256.** Chips compute SHA-256 in hardware, and KISS checks it with `SHA2` and `PROOF`.
  - Candidates: Lamport over a 256-bit digest, and Winternitz over SHA-256 with a small w.
  - Compare signature size, chip time and KISS cost.
  - The message digest must include the receiver's fresh nonce, so a cheater cannot grind two messages into colliding signatures.
- **Required property (equivocation evidence):** signing two different messages with the same one-time key must reveal material that proves it. That proof must be:
  - cheap to check on chain;
  - self-verifying, so it can spread phone to phone as a revocation that needs no authority.
- **Slot binding (required).** Each coin a device holds is bound to exactly one of that device's one-time keys, named in the transfer that delivered the coin, and spending the coin must use that key. Without this, a cheater pays the same coin twice using two different keys, and no evidence ever appears.
- **Device identity** is the Merkle root of the device's one-time public keys.
  - The chip generates its secrets and outputs SHA-256 leaf hashes.
  - The phone builds the tree. The tree is public data, built in Minima's MMR format so `PROOF` works, and only the phone ever needs SHA-3.
  - Design renewal for when the keys run out (for example, the last key signs the next root).
- **Vendor certificate:** the vendor signs the device root with an ordinary Minima key (checkable on chain with `CHECKSIG`). The vendor uses a normal computer, so Minima signing is no problem for it.
- **Phone-only tier:** the same protocol, with the app playing the chip in software. Phase 1 decides whether phone-only transfers use the same SHA-256 scheme (one code path) or Minima-native signatures (cheap on chain at 32 instructions per hop, but seconds per payment on the phone).
- **Checking:** offline receivers check everything on the phone, which is fast. The chain checks only when a coin is cashed or fraud is proven.

## The hard open question (Phase 1 must answer it with measured numbers)

Checking a *proof of cheating* on chain is small: a few hashes and two Merkle proofs. But two operations need a **full signature check** on chain, and a full SHA-256 one-time signature check probably exceeds one script's 1,024 instructions, given that every expression counts:

1. **Cashing a coin that passed through several hands offline.** The chain must check every hop back to the coin's last on-chain point.
2. **Paying the right victim from a bond.** The chain must check the victim's own transfer in full. Otherwise a bystander who saw the evidence could redirect the payout to themselves.

Compare these approaches, each with instruction count, transaction size and number of on-chain steps, measured in `runscript` **and** on a real node:

- **(a)** Split one check across several co-spent covenant coins; each input's script has its own budget.
- **(b)** Optimistic cashing with a challenge window: the claim posts the coin's path, and anyone can prove one bad signature within the window.
- **(c)** A lower hop cap on Minima.
- **(d)** Minima-native signatures for the phone-only tier.

**If none of them works, stop and tell Chuck before any app code.**

A second design question sits alongside it: **where do the two conflicting transfers meet?** Cheating is only provable once both copies are seen together. Define the on-chain record that a first cashing leaves behind, so that a later conflicting cashing collides with it, and define how evidence spreads through taps.

## Fraud and risk mechanisms

- **Receiver-enforced limits.** Below the offline threshold, accept offline. Above it, cash the coin on chain before releasing goods.
  - Be explicit in the design and the UI copy: an online *look-up* can see coins already cashed and revoked devices, but **it cannot see another copy still offline in someone else's pocket**. Only cashing on chain makes a large payment safe.
  - Limits apply per sender and per sync window. Defaults depend on the tier and can be changed in the receiver's settings.
- **Hop cap.** A coin carries every hop's signature since it last touched the chain.
  - Start at 5 hops; receivers may set lower.
  - A coin at the cap must be cashed before it can be spent again.
- **Freshness.** Each coin records its last on-chain touch, and receivers refuse coins older than a window. Start with a few days and make it configurable.
- **Revocation.** A revocation entry *is* an equivocation proof.
  - It verifies itself, so no authority keeps the list.
  - Every tap exchanges the latest entries, so revocations spread even offline. They go on chain when someone submits them.
  - Phones hold the list; chips hold none of it.
- **Device bond** (every registered device, both tiers).
  - Funded by the user by default; sponsors are optional.
  - Slashed by a fraud proof to pay victims.
  - Honest withdrawal waits longer than the maximum freshness window.
- **Vendor bond** (chip tier). It is also slashed when a chip it certified is proven to cheat. The receiver's setting "minimum vendor bond for chip-tier limits" decides which vendors' chips get the larger limits.
- **Who bears a loss:** whoever accepted offline and cashes second. They are paid from the device bond, then the vendor bond, up to their size. Write down the formula, and the fraud-profitability condition for each tier: the number of victims reachable before the evidence spreads, times the limit, compared with the bonds at stake.

## Hardware abstraction (important)

Build a single `SecureElement` interface in the app, with interchangeable implementations:

1. **VirtualCard:** the applet logic in software inside the app.
   - It is the key holder for the phone-only tier and the workhorse for all development.
   - Build a **ForgedCard** variant too, which deliberately breaks the rules for adversarial testing.
2. **JavaCardNfc:** a real Java Card over NFC (an external card works with Android and iPhone).
3. **SimOmapi:** a programmable SIM reached through Android's OMAPI (Android only).

The rest of the app must not know or care which implementation is in use. The applet's job is small:
- generate secrets and output leaf hashes;
- sign a transfer exactly once, with the signature, the "key used" mark and the coin deletion in **one atomic Java Card transaction**;
- report its state.

A power cut in the middle of signing must never leave a key reusable.

**Transport.** Offline, phone to phone:
- NFC, where one phone emulates a card through Android host card emulation (allowed for any app) and the other reads it;
- QR codes in both directions as a fallback;
- Bluetooth optional.

Security never depends on the transport; it only carries signed messages. Check current iOS limits on card emulation in Phase 0.

## Phases

### Phase 0: research (report only, no code)

> **Done 2026-09-27.** Results: `docs/phase-0-research.md`. No blocker was found. Carry its section 5 ("Carried into Phase 1") into Phase 1 as settled technical decisions.

1. Rely on the verified facts above. Extend them only where a later phase needs more.
2. **Minima on Android:** how the app reaches its node for loading, cashing and bonds (embedded node native bridge, MDS, RPC). Read the existing standalone app and its transport rules.
3. **Prior art:**
   - `lnflash/cashu-javacard` (MIT): its `docs/SECURITY-MODEL.md` and `docs/DECISIONS.md`. List what we can reuse (applet structure, atomic spend, NFC flow). Note that it signs with secp256k1 and relies on a Cashu mint.
   - The BIS Innovation Hub **Project Polaris** handbook on offline CBDC payments.
   - The **digital euro's offline design** (holding limits, device certification, counterfeit handling).
4. **Test tooling:** jCardSim (applet simulation), vsmartcard's Android smart card emulator, GlobalPlatformPro.
5. **Programmable SIM:**
   - Confirm the sysmoISIM-SJA5 flow (SCP02 install, preinstalled ARA-M).
   - Confirm OMAPI access on stock Android versus GrapheneOS, and whether it works with no mobile service.
   - Note that the Pixel 7 and 7 Pro have one physical SIM slot, so the carrier moves to eSIM.
6. **Chip time estimate** for the SHA-256 scheme candidates, from the measured J3R180 SHA-256 figure.

**Gate:** plain-language findings for Chuck, with any blockers stated upfront.

### Phase 1: design and cost proofs (no app code, no chain writes)

> **Done 2026-09-27; waiting for Chuck's gate.** Design: `docs/payment-account-design.md` (decisions in its section 15). Scripts: `kiss/`. Measurements: `measure/receipts/`. Simulation: `sim/`. The main feasibility test passed on lab node 1.0.45.15 (L1, dry runs; the headline numbers were independently re-run and matched). Nothing has been mined yet.

Write `1_development/stream_1_app/work/simcard/docs/payment-account-design.md` covering:

- The coin format, including the origin proof and size per hop.
- The payment protocol message by message: nonces, replay protection, slot binding, atomic spend.
- The chosen signature scheme, with sizes and estimated chip time.
- Freshness, the revocation proof format and offline gossip.
- Device bond, vendor bond, fraud proof, victim payout, withdrawal flow and retirement branches.
- Vendor certification (open, bonded): certificate format and key renewal.
- **Every KISS script written out and measured with `runscript`** (instruction count each), and an answer to the hard open question.
- On-chain steps per user per day for typical use, so Chuck can see the burn cost.
- Default limits per tier (offline threshold, hop cap, freshness window, bond sizes) with reasoning and the fraud-profitability formula.
- A simulation (scripts under `simcard/sim/`) of many devices paying each other with a few ForgedCards mixed in, reporting losses against bond coverage.

**Gate:** Chuck reviews the design before any app code.

### Phase 2: protocol core and adversarial tests (no chain, no app)

- Build the protocol as a platform-neutral module with its own tests: coins, transfers, verification, revocation, limits, and an in-memory stand-in for the chain.
- Build `SecureElement`, `VirtualCard` and `ForgedCard` against it.
- Run the adversarial list below. Every case must fail safely or be caught, and each result is reported in plain language.

**Adversarial list** (run in Phase 2 in simulation, then again in Phase 4 on phones and chain):

- Paying the same coin twice to different receivers with the same one-time key.
- Paying the same coin twice using two *different* one-time keys (slot binding must reject it).
- Inventing coins with no valid origin proof.
- Replaying old payment messages.
- Spending stale coins past the freshness window.
- Exceeding receivers' offline limits, and exceeding the hop cap.
- Using a revoked device, including after the revocation has only spread phone to phone.
- A bystander trying to redirect a bond payout to themselves.
- A cheater cashing a conflicting copy on chain first; the victim must be compensated.
- A vendor certifying a software key as a "chip"; the vendor bond must be slashed.
- Power loss in the middle of a payment.
- One ForgedCard paying many receivers before evidence spreads, with losses measured against the bonds.

### Phase 3: Minima contracts (mainnet, valueless test token)

- Implement loading (savings to payment account), cashing (batched where possible), device registration and bond, vendor bond, fraud proof and payout, withdrawal and retirement.
- Follow `EXPERIMENT_GOVERNANCE_STANDARD.md` before every test campaign.
- Use a purpose-created valueless test token that Chuck approves. **Mainnet only, never testnet.**
- Measure real transaction sizes, script costs, batch limits and timings.

### Phase 4: virtual payment account in the app, two phones

- Integrate into the `3-test` channel behind a feature flag that is off by default.
- Obey the three-platform rule, RULE 0 (bump `APP_BUILD_ITERATION` on every run that edits the tree), the UI system reference, `Machinery/AGENT_RULES.md` and the founder UX laws. Chuck approves the UI before it ships.
- Flows: loading, paying, receiving, re-spending received money offline, cashing and refresh.
- UI: balance, recent payments, and a health indicator (green, amber, red) with background refresh whenever the phone is online. Use the app's visible-only repeat helper, never `setInterval` (battery law).
- **Real offline test:** both phones in airplane mode, Pixel 7 Pro (stock) ↔ Pixel 7 (GrapheneOS), over NFC and over QR.
- Repeat the adversarial list on phones and chain.

### Phase 5: performance measurements

Measure and report:
- time per payment and per receiving verification on the phone;
- memory per coin and per receipt (app and applet);
- coin size at each hop;
- on-chain steps and burn per user per day.

Compare with direct on-chain payments (about 5 s to be seen, about 50 s to be final).

### Phase 6: real hardware (once Chuck has it)

1. **Chip speed test first:** a minimal applet running the chosen SHA-256 scheme on an NXP JCOP4 card (J3R180 or similar, dual-interface, unfused), loaded through an ACS ACR1252U reader using GlobalPlatformPro. This decides whether chip signing is fast enough at the tap. (Minima-native signing on the chip is already ruled out.)
2. **The full applet:** coin storage, atomic spend, PIN, change-making and key renewal.
3. **Programmable SIM:** load the same applet onto a sysmoISIM-SJA5 (it needs a contact reader such as the ACS ACR39U). Set ARA-M rules for the app and test OMAPI on both phones, with and without mobile service.

The simulator doesn't reproduce real memory limits, crypto speed or power loss mid-payment. Treat Phase 6 results as the real verdict.

## Environment and constraints

- **Machine:** Windows 11, PowerShell 7 (WSL2 optional). Repository: `<STABLES_WORKSPACE>\`.
  - Edit only in `1_development/`.
  - Never write to `2_current/` without Chuck's explicit approval.
- **Minima:** mainnet only, with purpose-created valueless tokens. **Never touch real funds.**
  - Lab peers are the DevNodesSet (ports 9101 to 9401), started with `pwsh -File 1_development/stream_1_app/work/tools/dev-up.ps1 -DevNodes <n>`.
  - The Test12 treasury (port 9001) is opt-in only.
- **Phones:**
  - The Pixel 7 Pro is also Chuck's primary Stables review phone: `adb install -r` only, force-stop before installing, **never uninstall**.
  - The Pixel 7 runs GrapheneOS.
- **Seed phrases:** restoration is always done interactively by Chuck. Never automate it and never ask for a seed phrase.
- **Key separation:** chip secrets, phone keys, node keys, vendor keys and any admin keys are always different. Never write keys, card admin keys (KIC/KID/KIK, ADM PINs) or keystores into the repository.
- **Evidence:** grade claims per `BUILDER_KIT.md` (L0 to L3), and verify in the running system, not by reading source text.

## Required reading

- `CLAUDE.md`, `0_handshake/handshake.md`, `0_handshake/stables_master_reference.md`
- `1_development/stream_3_governance/task_test_channel/`:
  - `SYSTEM_ARCHITECTURE.md` (the front door)
  - `BUILDER_KIT.md` (read EPISTEMIC STATUS first)
  - `COVENANT_ENGINEERING_PLAYBOOK.md`
  - `MINIMA_BUILDING_DOCTRINE.md`
  - `EXPERIMENT_GOVERNANCE_STANDARD.md`
  - `USDW_CHAIN_BUILD_PLAN.md` §5
  - `V9_SYSTEM_REFERENCE.md`, `TOKENS.md`
  - `RETAIL_PAYMENT_INFRASTRUCTURE_PLAN.md`
- `0_handshake/global_knowledge_base.md`: "Payment scaling research (2026-09-24)" and the Omnia notes.
- `1_development/stream_3_governance/prod_governance_papers/stables_payment_capacity_omnia_instant_balance_handover.md`
- For app work: `1_development/stream_1_app/work/docs/ui_inventory/STABLES_APP_UI_SYSTEM_REFERENCE.md` and `1_development/stream_1_app/work/Machinery/AGENT_RULES.md`

## How to report

- After each phase, give a short plain-language summary: what works, what doesn't, and what decision Chuck needs to make.
- Separate what you've **verified** (with its evidence level) from what you're **assuming**.
- If a finding undermines the approach, say so plainly and early. Examples: the hard open question has no workable answer, chip signing is too slow at the tap, or bonds cannot make cheating unprofitable at useful limits.
