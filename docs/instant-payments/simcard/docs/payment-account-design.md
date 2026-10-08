> **SUPERSEDED 2026-09-27 (founder decision 13).** This is the first Phase 1 design, the chain-verified **notes model**. Chuck rejected it as too compromised (coin history, hop caps, expiry, fixed notes, heavy cashing, user bonds) and switched to the **chip-balance model** (see the v3 pivot at the top of the brief). Kept for its proven parts: the LX16 on-chain signature check (section 1), the helper-coin split, the transaction-size measurements, the SPHINCS baseline, and the simulation findings on sock-puppet claims and bond burning.

# Stables payment account: Phase 1 design and cost proofs

**Date:** 2026-09-27. **Status:** Phase 1 complete, waiting for Chuck's gate review. No app code, no chain writes.
**Brief:** `../stables-payment-layer-agent-brief.md` (v2). **Phase 0:** `phase-0-research.md`.
**Measured on:** lab peer 9101, Minima **1.0.45.15** (`status`, 2026-09-27, block 2,336,7xx). The embedded node
(1.1.1.26) and phone Core (1.6.11) were **not** measured; see section 14.
**Tags:** VERIFIED = measured (receipt named) or read at the cited source. ASSUMED = design, arithmetic or
simulation, with the reason. **Evidence level (BUILDER_KIT):** everything measured here is **L1** (lab node,
one operator, dry runs). Nothing has been mined. Nothing is L2 or L3.

All receipts are in `../measure/receipts/`, all scripts in `../kiss/`, the tools in `../measure/`, the
simulation in `../sim/`.

---

## 0. Summary for Chuck

**Step A passed: the chain can check our chip signatures, with a price.**

- One full chip signature is too big for one Minima script (about 4,000 steps against a limit of 1,024), but
  it **splits cleanly across five small "helper" coins** spent in the same transaction, each doing 790 steps
  (a quarter of headroom each). Measured on the lab node, including refusals of forged signatures.
- A **proof of cheating** (the two secrets a chip leaks when it signs one key twice) costs 117 to 158 steps:
  cheap enough to freeze a cheater's bond in one small transaction, and it can also travel phone to phone.
- A cashing that carries **1, 2 or 3 hops measures 28 KB, 42 KB and 56 KB** against the 64 KB transaction
  limit. **4 hops does not fit (70 KB).** So the **chip-tier hop cap is 3** (2 for people on the Minima Core
  companion, whose 100,000-character reply limit stops at 2).
- **Cashing and fraud proofs need no signature from anyone:** the scripts alone authorise them, so they work
  in MiniDapp read mode and without Core admin rights. Fees are paid by burning the helper coins' dust.
- **Optimistic cashing (post, then wait for challenges) is not needed**, because full checking fits.

**What it costs and what it cannot do (read these before deciding):**

1. **Cashing is big.** Each cashed note is one 28 to 56 KB transaction plus a small settle step. A shop that
   cashes everything it takes in would post about one transaction per note (the simulation shows about 35 a
   day for a busy shop). Notes that circulate (change, wages) avoid this. At national scale this is a real
   load on Minima; at Stables' test scale it is fine.
2. **An offline phone can only accept a note whose on-chain origin it has already seen.** Money loaded after
   the receiver's last sync cannot be checked offline and is refused (about 3% of payments in the
   simulation). This is the price of having no issuer signature; it can be lifted later with compact block
   proofs (not designed yet).
3. **Bonds do not reliably compensate victims.** A cheater can pose as many of its own victims and take back
   most of the victims' share of its slashed bond. The simulation confirms it: victims recovered 2 to 9% of
   their losses with no counter-measure, and **every extra 25% given to victims added about 240 to the
   cheater's profit** (bond 1,000). The **burned share is what actually deters.** A 10% claim fee, deducted
   from payouts and burned, halves the rebate and lifts victims' recovery to 15 to 25%. The same trick
   drains a vendor bond if the vendor's money is paid to claimants (+1,184 to a chip cheater against +235
   when burned), so **vendor money should be burned, not paid out**.
4. **At a 250 USDw bond, a phone-only cheater with 50 USDw limits profits** (+168 to +197 on average; one
   identity takes 290 to 1,020 USDw of goods in 36 hours). The recommended settings (phone-only 20 per
   payment with a 500 bond, 25% to victims, 10% claim fee) keep every simulated cheater at a loss, at the
   cost of refusing 50 USDw notes offline for phone-only payers.

**Chosen signature scheme:** a Lamport variant we call **labelled-XOR Lamport (LX16)**: 16-byte secrets, 255
signed bits, each secret carries its own bit as a label, and each pair of public hashes is committed in an
order-free way. This removes the per-bit branching that made plain Lamport 50% more expensive on chain.
8.3 KB per hop, about 1.2 s of chip time to make a key, about 0.05 s of chip computing to sign.

**Decisions for Chuck** are collected in section 15.

---

## 1. Step A: the crux, measured

### 1.1 Limits that bound everything (VERIFIED)

| Limit | Value | Source |
|---|---|---|
| Instructions per input script | 1,024, every expression counts | `kissvm/Contract.java`; `Magic.java` DEFAULT_KISSVM_OPERATIONS; runs hit "MAX instruction number reached! 1025" |
| Budget is per input | a new `Contract` per input, own counter | `TxPoWChecker.checkTxPoWScripts` (source); cross-checked: the same 790-instruction helper runs 15 times in one transaction design |
| One script copy per address | the witness looks scripts up by address | `TxPoWChecker`: `zWitness.getScript(coin.getAddress())` |
| TxPoW size | 65,536 bytes | brief; `Magic.java` DEFAULT_TXPOW_SIZE |
| Stored state | an output with `storestate:true` copies the **whole** transaction state; total stored ≤ 64 KB | `TxBlock.calculateCoins`, `RelayPolicy.checkMaxStateStoreSize` (source) |
| CONCAT parameters | at most 32 | `receipts/vm-probes.json` (33 fails to parse) |
| Hex AND/OR/XOR and shifts | strip leading zero bytes (BigInteger); hex EQ is length-sensitive | `receipts/vm-probes.json` |
| Variable names | lowercase letters only (`S`, `T`, `s2` fail to parse) | parse errors during `covenants-run.mjs` |
| `runscript` | empty transaction: cannot run VERIFYOUT, GETINADDR, GETINID, @TOTIN | `runscript.java` (source); doctrine section 2 |

### 1.2 One full signature: every candidate measured

All figures from `runscript` on node 1.0.45.15 unless marked in-process. Per-bit slopes come from two chunk
sizes of the same script.

| Scheme | Positions checked | Instructions (whole signature) | Fits one coin? | Signature bytes per hop | Leaves per key (chip hashes) | Receipt |
|---|---|---|---|---|---|---|
| **LX16** labelled-XOR Lamport, 16-byte elements | 255 | 5 helpers × **790** + 119 anchor-side | no, **5 coins** | **8,425** (R 4,080 + C 4,080 + chunk digests 160 + message 80 + port overhead) | 510 | `lx16_helper_K5_P255_in*`, `lx16_anchor_hops*_P255` |
| LX16, 4-way split | 256 | 4 × 978 + 114 | no, 4 coins but at 96% of the limit | 8,465 | 512 | `lx16_helper_K4_in1` |
| LX32 labelled-XOR, 32-byte elements | 256 | 4 × **786** + 74 | no, 4 coins | 16,657 | 512 | `lx32_helper_K4_in1`, `lx32_anchor_hops*` |
| LO ordered (textbook) Lamport, 32-byte | 256 | 8 × 601 (16.6 per bit) | no, 8 coins | 16,672 | 512 | `lo32_helper_K8_in1` |
| W4 Winternitz, 4 bits per chain | 67 chains | **about 9,300** (10 per hash step, 63 per digit) | no, about 10 coins | 2,208 | 67 chains × 15 | `w4_chain_*`, `w4_overhead`, `w4_full_verify` |
| FORS-SHA2, k=32 trees of 256 (the shipped SPHINCS technique) | 32 reveals | **625** | **yes, one coin** | 12,692 | **8,192** | `fors_k32_a8`, `fors_k32_a8_sizes` |
| FORS-SHA2, k=64 trees of 16 | 64 reveals | over 1,024 (2 coins) | no | 14,720 | 1,024 | `fors_k64_a4` |
| **Minima's shipped SPHINCS** (baseline) | 16 HORST rounds + 1 WOTS CHECKSIG | core **837**; full script 893 to 997 (in-process, 1.1.2.6 build) | yes | 20,363 | 16 × 65,536 (SHA-3) | `sphincs_baseline` |
| Whole LX signature in one script | 256 | aborts at 1,025 | **no** | | | `lx16_full_single_coin`, `lx32_full_single_coin` |

Refusals measured (VERIFIED, all return `success=false`): a tampered secret (`*_tampered`), a tampered
complement (`lx16_helper_K5_P255_in6_tampered_complement`), a flipped label (`*_label_flipped`), a signature by
another key (`*_wrong_key`), a wrong message (SPHINCS baseline, 94 instructions).

**SPHINCS baseline (requested during Phase 1).** Minima's shipped `KISSVM_SPHINCS_SCRIPT`
(`utils/sphincs/SPHINCSUtils.java:22`) verifies a real signature generated by Minima's own SPHINCS code
(`measure/java/SphincsBaseline.java`) in **837 instructions** on node 1.0.45.15 (message loops replaced by a
state port) and 893 to 997 in-process with the transaction loops, carrying **20.4 KB** of signature data in
state ports 0-79, 100 and 101. It proves that a hash-based signature with MMR proofs fits one coin. It is not
usable on a chip as shipped: its leaves are SHA-3 (the chip has none), its root is signed with a Minima WOTS
key (SHA-3 again), and each key needs about a million leaf hashes (about 45 minutes of chip time). Its
technique, **PROOF with the leaf index carried as the MMR sum value**, is what the FORS-SHA2 rows adopt.

**Note: a few-time scheme does give a cheap proof of cheating.** Two different digests
differ in at least one byte, so a FORS key used twice reveals **two different leaves of the same tree**; each
comes with its MMR path to that tree's root. That pair is a self-verifying proof of cheating of about 1 KB,
checkable with two PROOFs (ASSUMED cost about 60 instructions, from the measured PROOF costs). FORS is also
more robust than Lamport after a double signature (forging a third message ≈ 2^-224 against Lamport's
2^-128, ASSUMED arithmetic).

### 1.3 Why LX (labelled-XOR Lamport) and not FORS or plain Lamport

**The problem with textbook Lamport on KISS:** the verifier must place each revealed hash left or right of
its partner according to the digest bit. KISS has no cheap way to do that in bulk, so it costs an `IF` per
bit: 16.6 instructions per bit (measured), 8 helper coins per signature.

**The LX construction (ASSUMED design, VERIFIED to verify on chain):**

- Position *i*'s two secrets are random, except **big-endian bit (i mod 128) of the secret is forced to the
  bit value it stands for** (the label). The chip sets this bit when it derives the secret.
- The public key commits to each pair **symmetrically**: `T_i = SHA2(h_i0) XOR SHA2(h_i1)` with
  `h = first 16 bytes of SHA2(secret)`. The chain recomputes `T_i` from the revealed secret and the
  complement without knowing which is which, then hashes the `T` blocks in five chunks:
  `chunk_c = SHA2(0x01 ‖ T of 51 positions)`, `pk = SHA2(0x01 ‖ chunk_0 … chunk_4)`.
- The labels are checked **in bulk** against the digest: `R AND M = D AND M`, where `M` is a diagonal mask
  (block *i* has only bit *i*) built on chain by byte-doubling, and `D` is the digest replicated. Three
  operations for all 255 positions, 119 instructions per hop in total with the digest and key checks.
- Why it is binding (ASSUMED security argument, wants review by someone else): to claim the other bit at
  position *i* a forger needs a preimage with the opposite label whose double hash XORed with a hash of
  some complement equals `T_i`. Choosing the complement freely does not help because the chain hashes it:
  it is a preimage problem (2^128 for the 16-byte hash), or a two-list birthday search on 256-bit values
  (2^128). A secret from another position fails the `T_i` check for the same reason.
- 255 of the digest's 256 bits are signed so the work splits into five equal chunks of 51 (2^255
  second-preimage, 2^127.5 collision resistance).

**Why not FORS-SHA2 (the one-coin option):** it is the cheapest on chain (625 instructions, one coin) and
about the same size per hop, but each key needs **8,192 chip hashes (about 21 s of chip time per key, against
1.2 s for LX16)** and **256 KB of phone storage per key (against 8 KB)**. A card that makes its own keys in a
10-minute session gets about 27 FORS keys or about 460 LX16 keys. FORS stays the documented fallback if
Phase 3 finds that 790-instruction helpers do not mine (section 14).

**Why not Winternitz:** about 9,300 instructions per signature (10 coins), and after one key signs twice a
bystander can forge with it, which reopens the "redirect the payout" attack the brief warns about.

**Why 16-byte elements:** they halve the signature (8.4 KB against 16.7 KB) for 27% more instructions per bit.
With the per-input overhead measured below, LX16 costs about 14 KB per hop on chain against about 21 KB for
LX32, which is the difference between a hop cap of 3 and of 2. Security: 128-bit preimage resistance for the
transmitted hashes (about 2^98 against all published hashes at once); a quantum computer would halve that.
Keys are one-time and short-lived, so this is acceptable for spending money (ASSUMED judgement).

### 1.4 Splitting across co-spent coins (approach a): VERIFIED to work

- Each helper coin runs the same body (`kiss/helper_body.kiss`) and works out which hop and chunk it checks
  from its own input index: `j = @INPUT - STATE(97)`, hop = `FLOOR(j/5)+1`, chunk = `j % 5`. Measured 790
  instructions at every input position from 1 to 15 (hops 1 to 3), identical in `runscript` and in-process.
- Helpers live at a **per-owner address** `LET owner=0x<tag> MAST 0x<body hash>`: the fixed body is carried
  once in the witness and reached by MAST with a constant hash, so a spender cannot substitute other code.
  The owner tag means each person's node tracks only its own helpers. (+10 instructions: 800 measured.)
- A helper can only run next to a stamped protocol coin (`GETINTOK(0) EQ STAMP`), so strangers cannot burn
  someone's helpers outside a real cashing or claim.
- The anchor (value coin) checks that exactly `2 + 5h` inputs are present and that each helper slot holds a
  coin at the casher's helper address, so no chunk can be skipped (`NEG_T1_helper_missing`,
  `NEG_T1_foreign_helper` refuse; receipt `covenant-branches.json`).

### 1.5 Transaction size of a cashing (VERIFIED components, ASSUMED sum)

Built on the lab node with `txncreate / txninput / txnoutput / txnstate / txnscript / txnbasics / txnexport`,
deleted afterwards. Real coin proofs from unspent coins the node can still prove (17-chunk MMR proofs,
970 bytes; a covenant coin with 10 state ports is 442 bytes in the transaction and 1,412 in the witness).
Receipt `txn-sizes.json`.

| Hops | Measured body (state + witness scripts + anchor coin) | + value coin | + helpers (5 per hop, 1,102 B each) | + header allowance | **Total** | 64 KB? | Core IPC (100,000 chars)? |
|---|---|---|---|---|---|---|---|
| 0 (unload own note) | small | | 0 | | about 5 KB (ASSUMED) | yes | yes |
| 1 | 21,061 | 1,854 | 5,510 | 1,200 | **28,308** | yes | yes |
| 2 | 29,485 | 1,854 | 11,020 | 1,200 | **42,242** | yes | yes |
| 3 | 37,909 | 1,854 | 16,530 | 1,200 | **56,176** | yes (9.4 KB spare) | **no** |
| 4 | 46,333 | 1,854 | 22,040 | 1,200 | **70,110** | **no** | no |

Per hop: 8,424 bytes of state (measured) + 5 helpers (5,510) = **13.9 KB**. Fixed: the NOTES covenant text
(5,013 characters), the helper body (3,770) and helper address script (140), the anchor pair, the release
outputs, the header. The header allowance (1,200 bytes) is the phone-measured model constant in
`notes-manager.js` (ASSUMED to cover the TxPoW header).

### 1.6 The three decisions Step A had to make

| Question | Answer | Why |
|---|---|---|
| Chip-tier hop cap | **3** (standalone app, web); **2** on the Core companion | 56 KB fits, 70 KB does not; Core's reply cap stops at about 45 KB |
| Phone-only hop cap | **2** (founder decision 8) | 42 KB, fits everywhere |
| Optimistic cashing needed? | **No** | full checking fits; optimism would add a challenge window and a watcher, and a missed challenge is theft |
| Authorised by script alone? | **Yes**, for cashing (T1 + T2), claims (C1 + C2), freezes, record retirement, expiry | measured branches take no signature; the only signed steps are the owner's own (load, bond withdrawal, bond renewal) |
| Burn without a signature? | **Yes**: helper dust is burned as the fee | MINIMA inputs minus outputs is the burn; helpers are MINIMA dust with no outputs |

### 1.7 Phone-only tier: same scheme, not Minima-native signatures

The brief asked whether phone-only transfers use the SHA-256 scheme (one code path) or Minima-native
signatures (CHECKSIG, 32 instructions per hop, VERIFIED). **Recommendation: the same LX16 scheme.**

- Minima-native signatures would be much cheaper to cash (no helpers, about 1.2 KB per hop), but they are
  Winternitz with 8 bits per chain: if a cheater reuses a one-time leaf, bystanders can forge with it, which
  reopens the payout-redirect attack; and receivers would need a second verification path.
- Using the node's wallet keys conflicts with key separation and needs an approval per payment in MiniDapp
  read mode (Phase 0, VERIFIED). An app-held Minima TreeKey would avoid that but still costs seconds of
  signing on the phone (2.6 to 4.2 s on desktop JVMs for a full transaction, brief) and is a second code path.
- One scheme means one verifier, one fraud proof, one cashing path, and the VirtualCard is exactly the chip
  applet in software.

### 1.8 Carrying signature data in state ports (the SPHINCS technique)

All signature data travels in transaction state ports, as the shipped SPHINCS script does. HEX state is
serialised as binary (VERIFIED: 6 bytes of overhead per port, `txn-sizes.json`), so this is the most compact
carrier; data carried as script text would cost twice as much (hex characters). The catch, VERIFIED in the
source, is that any output that keeps state copies the whole state, which is why cashing is split into a
verify step and a settle step (section 2).

---

## 2. Objects on chain

| Object | Address | Holds | Created by | Spent by | Retirement branch |
|---|---|---|---|---|---|
| Value coin | NOTES | USDw, stored LOAD state | LOAD | T1 (with its mark), EXPIRE | EXPIRE: back to the loader after note expiry |
| Anchor mark | NOTES | 1 STAMP, port 99 = 1 | LOAD (from a lane) | T1, EXPIRE | EXPIRE burns the stamp |
| Release coin Q (pair) | per cashing, `LET h=<summary hash> LET rec=<NOTES> …` | the note value + its stamp | T1 | T2 (anyone, with the summary) | T2 is permissionless (see 14) |
| Record | NOTES | 1 STAMP, port 99 = 2, small state | T2 | C2 (read and re-create), RETIRE | RETIRE burns the stamp after the record lifetime |
| Stamp lane | DISPENSER | ≥ 2 STAMP, no state | genesis, SPLIT, MERGE | LOAD, C1, SPLIT, MERGE | not value-holding (STAMP is a protocol-only marker) |
| Helper | per owner (`LET owner=… MAST …`) | MINIMA dust | owner's wallet (top-up), T2 optional | T1, C1 (burned as fee) | dust, spendable in any cashing |
| Claim voucher V | per statement, `LET h=<statement hash> LET rec=<NOTES> …` | 1 STAMP | C1 (from a lane) | C2 | burned in C2 |
| Device bond | BOND | USDw, device roots, owner key | owner | FREEZE, WITHDRAW, RENEW, ABANDON | ABANDON: back to the owner after a year of no activity |
| Slash pool | POOL | the frozen bond, claims list | FREEZE | REGISTER (C2), SETTLE, RETIRE | RETIRE burns what is left after a year |
| Vendor bond | VENDOR | USDw, vendor key | vendor | CONTRIB (at a pool settle), WITHDRAW, ABANDON | ABANDON |

**Why a protocol-only STAMP token (VERIFIED problem, ASSUMED fix).** On Minima anyone can pay any address with
any state, so "a coin exists at the record address" proves nothing: a forged record could frame an honest
device (the doctrine records the same gap for price receipts, USDW_CHAIN_BUILD_PLAN §5.0). A coin that holds a
STAMP is genuine because STAMP's whole supply starts in the dispenser lanes and every rule only moves it
between protocol coins or burns it. Measured: a release coin posing as a voucher is refused
(`NEG_C2_fake_voucher`), a merge cannot swallow a record (`NEG_lane_MERGE_swallows_record`). STAMP needs one
genesis `tokencreate` (Phase 3, Chuck's approval).

**Why two transactions per cashing (VERIFIED constraint).** A coin that stores state stores the *whole*
transaction state, and a cashing's state is 8 to 25 KB of signatures. A record created in the cashing itself
would carry all of it forever. So T1 verifies and moves the value into a release coin Q whose **address**
commits to a 200-byte summary; T2 reveals the summary, pays out and creates the record with only that small
state. Measured: T2 refuses a wrong summary and a record that would not keep state.

**Deployment order (no cycles):** NOTES (needs STAMP, USDw, the helper body hash) → DISPENSER (embeds NOTES) →
POOL (embeds NOTES) → BOND (embeds NOTES, POOL); VENDOR is independent. Release and voucher addresses are built
at run time with `ADDRESS(prefix + STRING(hash) + …)`; the notes covenant inserts its own address with
`STRING(@ADDRESS)`. VERIFIED on the live node: the address KISS builds equals the address of the literal text,
and all runtime-built texts are clean-invariant (`covenant-branches.json` → `templateChecks`).

---

## 3. The note (coin) format

A **note** is a fixed-value piece of the payment account, anchored on chain, that carries its own history.
Payments move whole notes (like cash); change comes back as notes.

```
note = {
  version       1 byte   0x01 = LX16, 255 positions, 5 chunks (scheme/version byte, Phase 0 decision 5)
  anchor        coin id of the anchor mark (32), note index in its LOAD (1)
  anchorProof   the mark's coin + MMR proof, for offline origin checks (about 1.4 KB)
  loadEntry     marker id | value coin id | first key (96), value, loader payout, expiry block
  hops[k] (k = 1..h, h <= hop cap) = {
    signerKey   pk_k: the one-time key this hop must be signed by (slot binding: named by the previous hop,
                or by the load entry for hop 1)
    message     next key pk_(k+1) (32) | receiver payout address (32) | receiver nonce (16)
    digest      d_k = SHA2(0x01 | anchor id | k | d_(k-1) | message)    (d_0 = anchor id)
    signature   R (255 × 16) | C (255 × 16) | chunk digests (5 × 32)
    signerProof pk_k's membership in its device root (MMR proof, 406 bytes for 1,024 keys) + root's bond ref
  }
}
```

| Part | Bytes | Status |
|---|---|---|
| Header, anchor, load entry, anchor proof | about 1.6 KB, once | ASSUMED (coin proof sizes VERIFIED in `txn-sizes.json`) |
| Per hop on the wire (phone to phone) | 8,160 signature + 160 chunk digests + 80 message + 406 membership proof ≈ **8.8 KB** | ASSUMED sum of VERIFIED parts |
| Per hop on chain (cashing) | **13.9 KB** (state 8.4 KB + 5 helpers) | VERIFIED (`txn-sizes.json`) |
| A 3-hop note on the wire | about 28 KB | ASSUMED |

**Slot binding (required).** Each hop names the next holder's one-time key by its commitment `pk`, and the next
hop must be signed by exactly that key (the anchor enforces `SHA2(0x01 ‖ chunk digests) EQ pk` hop by hop;
`NEG_T1_signed_by_wrong_key` refuses). Binding is by key commitment, never by key index: an index inside a
device root could be duplicated by a cheater who builds its own root, letting it spend one note with two
different keys and leave no evidence.

---

## 4. The protocol, message by message

### 4.1 Load (online, the loader's wallet signs)

1. The app builds a LOAD transaction: one stamp lane input (the dispenser releases one STAMP per note), the
   loader's USDw inputs, outputs `[2i]` mark (1 STAMP) and `[2i+1]` value coin (≥ minimum) for each note,
   `[2c]` the lane's change. State: port 9 = 1, 8 = note count, 99 = 1, 101 = loader payout, 102 = loader
   device root, 103 = expiry block (≤ now + 7 days), 110+i = marker id | value id | first key. Coin ids are
   precomputed from the first input's coin id and the output index.
2. Measured: 203 instructions for three notes; refusals when a value coin goes elsewhere or the expiry is too
   far (`lane_LOAD_3_notes`, `NEG_lane_LOAD_*`).
3. The chip's first key for each note is fresh (never used), and the chip records "this key now holds note
   (anchor, index, value)".

### 4.2 Payment request (receiver to payer)

The receiver shows a request that **reuses the retail invoice format** (`retail-payment.js`): Payment ID
`0x53544201` + 16 random bytes, amount, token, receiver payout address, 15-minute expiry. The offline request
adds: the receiver's next one-time key `pk_next` (a fresh key from its device), its device root and bond
reference, its tier and limits. The 16 random bytes are the **receiver nonce** in the digest, so a cheater
cannot pre-compute two messages that sign alike.

### 4.3 Transfer (payer's chip or VirtualCard)

1. The app selects notes, checks the payee request, and sends the chip: note handle, `pk_next`, payout
   address, nonce.
2. **The chip computes what it signs** (Phase 0 decision 1): it builds `d = SHA2(0x01 | anchor | k | d_(k-1) |
   pk_next | payout | nonce)` from its own stored note record and the three receiver fields. There is no
   "sign anything" command.
3. **Commit, then emit** (decision 2): one Java Card transaction writes {key index used, digest} and deletes
   the note; only then are the 255 selected secrets streamed out (label bits set). The chip will re-send the
   *same* signature for the *same* digest, so a torn tap loses nothing and a power cut cannot reuse a key.
4. The phone adds the complements, chunk digests and membership proof it stores for that key and sends the
   hop to the receiver over NFC (host card emulation) or QR.

Chip time (ASSUMED arithmetic from the VERIFIED J3R180 figures in Phase 0): key generation about 1.2 s per key
(510 SHA-256 of 16-byte inputs at 2.23 ms, plus about 40 ms of AES); signing about 0.05 s of computing plus
streaming 4 KB (0.15 to 0.75 s over NFC). The chip stores 1 bit per key and about 48 bytes per note.

### 4.4 Receiver checks (offline, on the phone, in this order)

1. Every hop's LX signature (the same arithmetic as the chain; milliseconds on a phone) and slot binding.
2. **Origin:** the anchor mark's coin proof verifies against the receiver's own last-synced chain, and the
   anchor is not newer than that sync (**unseen origin → refuse**) and not older than the **freshness window**
   (72 hours) measured from that sync.
3. Hop count: after this hop, `h ≤ cap` (phone-only 2, chip 3; lower if the receiver's platform cannot cash
   more: Core companion 2).
4. Revocation: no signer is on the receiver's revocation list (on-chain frozen bonds as of last sync, plus
   self-verifying proofs received in taps).
5. Bond and tier: every signer's device root has a bond ≥ the receiver's minimum; chip tier needs a vendor
   certificate (the vendor's Minima signature on the device root) from a vendor whose bond ≥ the receiver's
   minimum vendor bond.
6. Limits (section 10): per payment, per sender per sync window, per day. Above the offline limit the receiver
   must cash on chain before handing over goods (if online) or refuse.
7. If online: **look up the anchor.** Already spent → refuse (and build a proof of cheating if the winning
   cashing's data is available). The UI copy must say: *"A look-up catches money already cashed and devices
   already revoked. It cannot see another copy still offline in someone else's pocket. Only cashing makes a
   large payment safe."*

### 4.4a Replay protection and atomic spend

- **Replay:** every transfer signs the receiver's fresh 16-byte nonce (from its own payment request, valid 15
  minutes). A replayed or captured transfer carries a nonce the receiver did not issue, or one it already
  used, and is refused. The receiver stores used nonces until their request expires. (ASSUMED design.)
- **The same note twice to one receiver** is caught offline: the receiver already holds that anchor.
- **Atomic spend:** the chip's single Java Card transaction (key marked used + digest recorded + note deleted)
  happens before any secret leaves; a torn tap re-sends the same signature for the same digest. The receiver
  only credits the note after the full signature verifies. (Phase 0 decision 2; Phase 6 must prove it on
  silicon, jCardSim cannot.)

### 4.5 Re-spending received money offline

The receiver now holds the note bound to `pk_next`, which its own chip (or VirtualCard) owns. It can pay it
onward exactly as in 4.3 while `h < cap` and the anchor is within the freshness window of the next receiver's
view. Change is given in notes.

### 4.6 Cashing (online, anyone may submit; no signatures)

- **T1 (verify):** inputs `[0]` mark, `[1]` value, `[2 …]` 5 helpers per hop; state port 1 = h, 5 = note index,
  6 = helper owner tag, 97 = 2, `16k+0..3` per hop. The mark checks its load entry, verifies the chain hop by
  hop (digest, key commitment, labels, helper slots), builds the summary `aid | pk_1 | (d_k | pk_(k+1))… |
  payout` and moves stamp and value to `Q = ADDRESS("LET h=" + SHA2(summary) + " LET rec=" + NOTES + body)`.
  Helper dust is burned as the fee. Measured: mark 136 / 372 / 537 / 702 instructions for 0 / 1 / 2 / 3 hops,
  each helper 800, value coin 29. Refusals: payout redirected, helper missing, foreign helper, tampered
  signature, wrong key, after expiry.
- **T2 (settle):** inputs the Q pair; state 99 = 2, 200 = summary, 201 = cashed-at block (within 20 blocks),
  202 = note value; outputs `[0]` payout to the address in the summary, `[1]` the record (1 STAMP, keeps T2's
  small state). Measured 73 + 30 instructions. T2s of one person can later be batched (not written yet).
- The first cashing to confirm **spends the anchor mark**: this is where conflicting copies meet. A later
  conflicting T1 fails (input already spent) and its holder learns it is the loser.

### 4.7 Refresh and expiry

A note whose anchor is older than 72 hours cannot be passed on offline. Its holder cashes it (the loader's own
unspent notes: a 0-hop T1, about 5 KB, several per transaction) and reloads. After the expiry block (7 days
recommended) the loader can take the value back (EXPIRE, 64 instructions); a holder who never cashed loses the
note. The app cashes automatically before expiry whenever it is online.

---

## 5. Where conflicting copies meet, and how long the record must live

- **Collision point: the anchor mark** (a UTXO is spent once). VERIFIED by construction (T1 spends it).
- **Record:** created by T2, 1 STAMP, state = the summary (every hop's key and digest, the final key and the
  payout), cashed-at block and note value. About 300 bytes. It lets a loser prove, without the winner's
  cooperation and without the winner's signature data, that **the same key signed something else** (or that the
  recorded chain **ended** at a key that had already paid the note onward).
- **Why records must be stored-state coins:** the signature data of T1 is only in the TxPoW body, which nodes
  keep for 3 days by default (`GeneralParams.NUMBER_DAYS_SQLTXPOWDB = 3`, VERIFIED source) and which archive
  sync does not carry (`TxBlock` keeps only stored state, VERIFIED source). A stored-state coin travels in
  every TxBlock (archive: 50 days by default, VERIFIED source) and every node that tracks the NOTES address
  captures it while syncing forward.
- **Lifetime:** at least **note expiry + claim window** (a loser may learn of the conflict only when it tries
  to cash, up to expiry). Recommended: record lifetime 21 days, claim window 14 days after a freeze, note
  expiry 7 days, freshness 72 hours.
- **Pruning (VERIFIED risk, ASSUMED mitigation).** A node can only prove coins it tracked from before they left
  its unpruned window (about 1,000 to 1,400 blocks, doctrine 5.4 and the vault pruning note). So **every Stables
  node tracks the NOTES address** (anchors and records together), bounded because notes expire in 7 days and
  records in 21. A node that falls too far behind to sync (measured elsewhere: more than about 2 days is at
  risk) and needs a MegaMMR resync loses those proofs; the existing on-chain proof snapshot mechanism
  (`tv81AnchorPublishSnapshot`) must be extended to NOTES before launch (open item).

---

## 6. Revocation as a self-verifying proof, and gossip

- **Form F1 (cheap, self-verifying):** both secrets of one position of one key, the 51-position `T` block of
  that chunk (1,632 bytes), the chunk digests (160), the key commitment and its device-root membership proof.
  About 2.3 KB. Any phone checks it in microseconds; the chain checks it in **158 instructions** and freezes the
  bond in one small transaction (`bond_freeze_by_cheat_proof`; the same secret twice is refused). F1 exists
  whenever someone holds two signatures by one key on different digests: two receivers comparing notes, a
  loser who fetched the winning T1 within 3 days, a merchant paid twice with the same note.
- **Form F2 (record-backed, on chain only):** a genuine record plus a full, verified signature by the same key
  on a different digest (or by the key the record says the chain ended at). Used by claims (C1 + C2) and by
  the first claim to freeze a bond when no F1 exists (`C2_bond_freeze_by_claim`, 97 instructions).
- **Gossip:** every tap exchanges the newest revocation entries in both directions (F1 proofs and "bond frozen
  at block B" facts with the pool coin's proof). Phones keep the list; chips keep none of it. Entries expire
  when the frozen bond's pool retires.
- **Revocation list sizing (ASSUMED):** one entry per frozen device (32-byte root plus about 2.3 KB of proof),
  so thousands of entries fit on a phone.

---

## 7. Bonds, certificates, key renewal, withdrawal, retirement

### 7.1 Device bond (both tiers)

State: up to 4 device roots (ports 120 to 123; one per key batch), root count, owner Minima key, owner payout,
vendor key and certificate (0x00 for phone-only), withdraw-request block. Measured branches
(`covenant-branches.json`):

| Branch | Who | Instructions | Refusal measured |
|---|---|---|---|
| FREEZE by proof of cheating (F1) | anyone | 158 | same secret twice |
| FREEZE by the first claim (F2) | anyone with a voucher | 97 | release coin posing as a voucher |
| WITHDRAW request | owner (SIGNEDBY) | 42 | unsigned |
| WITHDRAW after delay | anyone, pays the owner | 39 | too early |
| RENEW (append a key-batch root) | owner | 85 | replacing an existing root |
| ABANDON (retirement) | anyone after a year idle, pays the owner | 39 | |

**Withdrawal delay** must exceed note expiry + claim window + margin: **28 days** recommended (a note a device
signed stays cashable until its expiry; a loser then has the claim window). A frozen bond cannot be withdrawn.

### 7.2 Vendor certificate and vendor bond

- **Certificate:** the vendor's ordinary Minima key signs the device root (the vendor uses a normal computer,
  so Minima signing is no problem). Checkable on chain with CHECKSIG: **measured with a real TreeKey signature
  in the vendor branch** (`vendor_contribute_checksig`, 171 instructions including CHECKSIG's fixed 32).
- **Certificate content (recommended):** the signed data is `SHA2(0x43 | device root | applet build hash |
  tier flags)`, and the bond stores the applet build hash beside the root, so the chain recomputes the digest
  before CHECKSIG (about 6 more instructions than the measured version, which signs the root itself; ASSUMED).
  The applet build hash is the SHA-256 of the published, reproducible CAP file (decision 11). Receivers show
  it in the details view and refuse unknown builds by default.
- **Certificate size:** a Minima signature (about 1.1 to 1.5 KB) plus the vendor key; carried once per device
  in the bond state and in the payment request, not per hop.
- **Vendor bond:** slashed when a device carrying its certificate is frozen. As drafted (and measured), the
  vendor tops up the victims' pot up to a per-incident cap and burns a fixed penalty. **Simulation finding:
  a vendor top-up paid to claimants is drained by the cheater's sock-puppet claims** (section 11.3).
  **Recommendation: the vendor's slash is a fixed penalty per incident, burned, not paid to claimants.**
  This keeps the vendor bond doing the job it is actually good at: a vendor whose chips keep getting broken
  loses its bond incident by incident, and once the bond falls below receivers' minimum, **its chips drop to
  phone-only limits automatically** (receivers check the vendor bond). A competitor cannot cheaply drain a
  vendor this way, because each incident needs a broken chip of that vendor and a bonded device that gets
  frozen. Decision for Chuck (section 15).
- A vendor with no bond is allowed; its chips are treated as phone-only tier (decision 4).

### 7.3 Key renewal

- Keys are made in batches (a device root = an MMR of up to 1,024 key commitments; membership proof 406 bytes).
- **Chip tier:** the vendor certifies batch 1. The chip makes batch 2 later (a SIM in the background; a card in
  a long session on the phone, about 460 keys in 10 minutes) and **its last key of batch 1 signs the new root**
  (an LX signature). Receivers verify the chain of batch certificates offline; the vendor is never needed again
  (decision 4: vendors act once).
- **On chain:** the owner appends the new root to the bond (RENEW, owner-signed, cannot replace old roots).
- **Phone-only tier:** the app makes batches in software and appends them the same way.

### 7.3a Applet rules carried from Phase 0 (decision 6)

- Allocate all memory at install (enforced by a source scan); run a self-test at install.
- Never count jCardSim results as evidence (it cannot tear transactions and offers SHA-3 the chip lacks);
  build the CAP against Java Card 3.0.4 and test tearing with our own harness.
- The applet's only commands: make keys (outputs 16-byte leaf hashes), report state, and sign a transfer it
  builds itself from its stored note record and the receiver's three fields. No "sign arbitrary data".
- Secrets are derived from a chip AES key (`s = AES_k(key index | position | bit)` truncated to 16 bytes, with
  the label bit then forced); they never leave the chip except as the revealed half of one signature.
- Per key: one "used" bit; per note held: about 48 bytes (anchor, index, value, bound key index, previous
  digest, hop count).

### 7.4 Retirement branches (vault retirement-branch law)

Every value-holding covenant has a mechanical retirement branch (measured): value coin (EXPIRE → loader),
release coin (T2 is permissionless), record (RETIRE → stamp burned), device bond (ABANDON → owner), pool (RETIRE
→ burn after a year), vendor bond (ABANDON → vendor). Stamp lanes and helpers hold no value.

---

## 8. Claims and slashing (C1, C2, SETTLE)

1. **C1 (verify, big state, anyone):** a stamp lane mints one stamped voucher at
   `ADDRESS("LET h=" + SHA2(statement) + " LET rec=" + NOTES + body)` after verifying the victim's chain from
   the divergence hop j to the victim (full LX checks with helpers) and the conflicting key's membership in the
   cheater's device root. Statement: `aid | j | pk_j | d_(j-1) | victim's d'_j | victim payout | cheater root`.
   Measured 565 instructions (2 hops) + helpers 800; refusals: key not in the root, voucher redirected.
2. **C2 (settle, small state, anyone):** voucher + record + bond or pool. The voucher checks the statement
   against the record (same note, same key at hop j, same prior digest, and a **different** digest at j, or the
   record ended at that key) and burns its stamp; the record is re-created unchanged; the bond freezes into a
   pool with this first claim, or the pool appends it (duplicate statements refused). Measured: voucher 108,
   record 50, bond 97, pool 138; refusals: no conflict, duplicate claim, fake voucher.
3. **SETTLE (after the claim window, anyone):** the pool pays each claim `min(claim, claim × pot / total)` where
   `pot = victims' share × bond (+ vendor top-up if kept)`, with payouts supplied by the settler and checked by
   multiplication (never divide in a covenant); the rest is burned. Measured 308 instructions for 3 claims;
   refusals: overpaying one claimant, settling inside the window.

Bystanders cannot redirect a payout: the payout address is the one named in the victim's own verified last
hop (the payer's chip signed it), and the voucher is bound to that statement.

**Claim fee (recommended, not yet in the measured pool script):** at SETTLE each claim is paid
`claim × (pot/total − φ)` (never below zero) and `φ × claim` is burned, with φ = 10%. It needs no signature
from the claimant (it is deducted, not paid up front) and changes the pool's multiplication check to
`(p + φ·cl)·tot ≤ cl·pot < (p + φ·cl + 0.00000001)·tot` (about 6 more instructions per claim, ASSUMED).
Section 11 shows why: without it a cheater's fake claims take nearly all of the victims' share.

**Who bears a loss (decision 9):** whoever cashes second. The loser is compensated from the device bond's
victims' share (pro rata, after the claim window, fee deducted), never from the vendor bond (section 7.2).
The loss formula for one honest loser holding a note of value v whose signer is frozen with bond B, victims'
share s, real claims R and fake claims F: `payout = v × max(0, min(1, s·B / (R + F)) − φ)`.

---

## 9. Proof that nothing here needs a host

Every step is a script-authorised Minima transaction that any node can build and post: cashing, settle,
claims, freezes, settlements, retirement, expiry. Proof providers (for nodes that fell out of the window) are
trustless for validity. The one hosted convenience that could matter is data availability of the winning T1
body for F1 proofs after 3 days, and the design does not depend on it (F2 via records covers that case).
**What breaks if a host disappears: nothing protocol-visible.** (ASSUMED, by construction.)

---

## 10. Default limits per tier (recommended; receivers can lower them)

Aligned with the existing quick-pay defaults in `payment-security.js` (quick pay 50, significant 500, daily
200; VERIFIED source).

| Setting | Phone-only tier | Chip tier (vendor bond ≥ receiver minimum) | Reason |
|---|---|---|---|
| Offline limit per payment | **20** (50 if the payer's bond ≥ 1,500) | **200** | tables 11.8 and 11.9 |
| Per sender per sync window | 50 | 200 | |
| Offline received per day | 200 (= daily quick-pay cap) | 500 (= significant threshold) | |
| Above the limit | cash on chain first (online) or refuse | same | quick-pay 50 / significant 500 stay the online defaults |
| Hop cap | **2** (decision 8) | **3** (Step A); Core companion receivers 2 | 42 / 56 KB |
| Freshness window | 72 hours, measured from the receiver's last sync | 72 hours | ECB anchor (Phase 0) |
| Rarely-online receivers (last sync > 24 h) | half of all limits | half | decision 9 |
| Minimum payer device bond accepted | **500** | **1,000** device + vendor bond ≥ 5,000 | table 11.8: every simulated cheater loses money |
| Slashed bond | 25% to victims pro rata, 75% burned, 10% claim fee burned | same; vendor slash is a burned fixed penalty | section 11.10 |
| Note expiry | 7 days | 7 days | bounds records, pruning, withdrawal delay |
| Claim window | 14 days after freeze | 14 days | |
| Record lifetime | 21 days | 21 days | expiry + claim window |
| Bond withdrawal delay | 28 days | 28 days | |

The **fraud-profitability condition** and the simulation behind these numbers are in section 11.

---

## 11. Economics: fraud-profitability condition and simulation

### 11.1 The condition (ASSUMED model, per cheating identity)

```
gain  G = N × L            N = receivers who accept a copy before the identity is revoked
                           L = what each receiver accepts offline from one sender
cost  C = B_d − R + K      B_d = device bond (always frozen, never returned)
                           R = what the cheater takes back by posing as its own victims (≤ s × B_d,
                               s = victims' share of a slashed bond)
                           K = cost of breaking a chip (0 for a phone key)
fraud is unprofitable  ⇔  N × L < (1 − s) × B_d + K          (worst case, R = s × B_d)
                          N × L < B_d + K                    (naive cheater, R = 0)
```

With a burned **claim fee** φ per unit claimed, the cheater's best number of fake claims F satisfies
`R + F = sqrt(pot × R / φ)` (R here = real claims), which caps its take-back and raises victims' recovery.

<!-- SIM-RESULTS:BEGIN (generated by sim/summarize.mjs) -->
### 11.2 Simulation set-up (ASSUMED model)

3,000 devices for 14 days, hourly steps: 5% merchants (online 90% of hours), 15% of consumers rarely online (3% of hours), the rest 35%; 30% chip tier. Each consumer makes 3 payments a day (80% to merchants) with notes of 5/10/20/50 USDw loaded 120 at a time. Merchants give change from their takings and cash the rest. Receivers apply the section 10 rules (hop caps, 72-hour freshness, unseen-origin refusal, limits, online look-up). 1% of devices are ForgedCards: each loads notes, waits 24 hours so receivers have seen its anchors, then for 36 hours pays copies of the same notes (2 attempts an hour) to receivers who are offline. The **aggressive** cheater then cashes its own copies first (so every receiver loses) and registers the profit-maximising number of fake claims; the **naive** cheater does neither. Losers claim when they next sync inside a 7-day window.

### 11.3 Baseline (bond 250, victims' share 50%, no claim fee, vendor top-up paid to claimants)

| Measure | Value |
|---|---|
| Honest payments accepted | 95% of 103,078 |
| Refusals | unseen-origin 3,158, day-limit 1,192, needs-online 642, stale 110, already-cashed 24, sender-limit 6 |
| Fraudulent value accepted | 6,440 USDw (15 cheaters, 429 each) |
| Honest losses / compensated | 4,640 / 327 (**coverage 7%**) |
| Burned from bonds | 1,875 |
| Mean cheater profit (phone keys; chips before the break cost) | 168 ; 1,151 |
| Chain transactions per user per day | all 3.01; merchants 36.56; regular 1.11; rarely online 0.52 |
| Losses by group (loss / compensated) | merchants 300 / 20.92; regular 4,060 / 267; rarely online 280 / 39.89 |

### 11.4 Slash split, claim fee and bond size (mean of 2 seeds, 2,000 devices, vendor money burned)

| Cheater | Claim fee | Victims' share s | Bond | Phone cheater profit | Chip cheater profit before break cost | Honest loss | Compensated | Coverage | Burned |
|---|---|---|---|---|---|---|---|---|---|
| naive | 0% | 0% | 100 | 224 | 418 | 3,850 | 0 | 0% | 1,000 |
| naive | 0% | 0% | 250 | 74.29 | 268 | 3,850 | 0 | 0% | 2,500 |
| naive | 0% | 0% | 500 | -176 | 18.33 | 3,850 | 0 | 0% | 5,000 |
| naive | 0% | 0% | 1000 | -676 | -482 | 3,850 | 0 | 0% | 10,000 |
| naive | 0% | 25% | 100 | 224 | 418 | 3,850 | 250 | 6% | 750 |
| naive | 0% | 25% | 250 | 74.29 | 268 | 3,850 | 608 | 16% | 1,893 |
| naive | 0% | 25% | 500 | -176 | 18.33 | 3,850 | 1,170 | 30% | 3,830 |
| naive | 0% | 25% | 1000 | -676 | -482 | 3,850 | 2,270 | 59% | 7,730 |
| naive | 0% | 50% | 100 | 224 | 418 | 3,850 | 495 | 13% | 505 |
| naive | 0% | 50% | 250 | 74.29 | 268 | 3,850 | 1,170 | 30% | 1,330 |
| naive | 0% | 50% | 500 | -176 | 18.33 | 3,850 | 2,270 | 59% | 2,730 |
| naive | 0% | 50% | 1000 | -676 | -482 | 3,850 | 3,600 | 94% | 6,400 |
| naive | 0% | 75% | 100 | 224 | 418 | 3,850 | 720 | 19% | 280 |
| naive | 0% | 75% | 250 | 74.29 | 268 | 3,850 | 1,733 | 45% | 768 |
| naive | 0% | 75% | 500 | -176 | 18.33 | 3,850 | 3,075 | 80% | 1,925 |
| naive | 0% | 75% | 1000 | -676 | -482 | 3,850 | 3,850 | 100% | 6,150 |
| naive | 10% | 0% | 100 | 224 | 418 | 3,850 | 0 | 0% | 1,000 |
| naive | 10% | 0% | 250 | 74.29 | 268 | 3,850 | 0 | 0% | 2,500 |
| naive | 10% | 0% | 500 | -176 | 18.33 | 3,850 | 0 | 0% | 5,000 |
| naive | 10% | 0% | 1000 | -676 | -482 | 3,850 | 0 | 0% | 10,000 |
| naive | 10% | 25% | 100 | 224 | 418 | 3,850 | 23 | 1% | 977 |
| naive | 10% | 25% | 250 | 74.29 | 268 | 3,850 | 225 | 6% | 2,275 |
| naive | 10% | 25% | 500 | -176 | 18.33 | 3,850 | 785 | 20% | 4,215 |
| naive | 10% | 25% | 1000 | -676 | -482 | 3,850 | 1,885 | 49% | 8,115 |
| naive | 10% | 50% | 100 | 224 | 418 | 3,850 | 135 | 4% | 865 |
| naive | 10% | 50% | 250 | 74.29 | 268 | 3,850 | 785 | 20% | 1,715 |
| naive | 10% | 50% | 500 | -176 | 18.33 | 3,850 | 1,885 | 49% | 3,115 |
| naive | 10% | 50% | 1000 | -676 | -482 | 3,850 | 3,215 | 84% | 6,785 |
| naive | 10% | 75% | 100 | 224 | 418 | 3,850 | 335 | 9% | 665 |
| naive | 10% | 75% | 250 | 74.29 | 268 | 3,850 | 1,348 | 35% | 1,153 |
| naive | 10% | 75% | 500 | -176 | 18.33 | 3,850 | 2,690 | 70% | 2,310 |
| naive | 10% | 75% | 1000 | -676 | -482 | 3,850 | 3,465 | 90% | 6,535 |
| aggressive | 0% | 0% | 100 | 224 | 418 | 3,850 | 0 | 0% | 1,000 |
| aggressive | 0% | 0% | 250 | 74.29 | 268 | 3,850 | 0 | 0% | 2,500 |
| aggressive | 0% | 0% | 500 | -176 | 18.33 | 3,850 | 0 | 0% | 5,000 |
| aggressive | 0% | 0% | 1000 | -676 | -482 | 3,850 | 0 | 0% | 10,000 |
| aggressive | 0% | 25% | 100 | 248 | 442 | 3,850 | 11.79 | 0% | 750 |
| aggressive | 0% | 25% | 250 | 134 | 328 | 3,850 | 29.48 | 1% | 1,875 |
| aggressive | 0% | 25% | 500 | -56.58 | 137 | 3,850 | 58.95 | 2% | 3,750 |
| aggressive | 0% | 25% | 1000 | -437 | -244 | 3,850 | 118 | 3% | 7,500 |
| aggressive | 0% | 50% | 100 | 272 | 466 | 3,850 | 23.58 | 1% | 500 |
| aggressive | 0% | 50% | 250 | 193 | 387 | 3,850 | 58.95 | 2% | 1,250 |
| aggressive | 0% | 50% | 500 | 62.55 | 256 | 3,850 | 118 | 3% | 2,500 |
| aggressive | 0% | 50% | 1000 | -199 | -5.48 | 3,850 | 236 | 6% | 5,000 |
| aggressive | 0% | 75% | 100 | 296 | 490 | 3,850 | 35.37 | 1% | 250 |
| aggressive | 0% | 75% | 250 | 253 | 447 | 3,850 | 88.43 | 2% | 625 |
| aggressive | 0% | 75% | 500 | 182 | 375 | 3,850 | 177 | 5% | 1,250 |
| aggressive | 0% | 75% | 1000 | 39.07 | 233 | 3,850 | 354 | 9% | 2,500 |
| aggressive | 10% | 0% | 100 | 224 | 418 | 3,850 | 0 | 0% | 1,000 |
| aggressive | 10% | 0% | 250 | 74.29 | 268 | 3,850 | 0 | 0% | 2,500 |
| aggressive | 10% | 0% | 500 | -176 | 18.33 | 3,850 | 0 | 0% | 5,000 |
| aggressive | 10% | 0% | 1000 | -676 | -482 | 3,850 | 0 | 0% | 10,000 |
| aggressive | 10% | 25% | 100 | 225 | 418 | 3,850 | 7.26 | 0% | 984 |
| aggressive | 10% | 25% | 250 | 82.84 | 270 | 3,850 | 89.27 | 2% | 2,347 |
| aggressive | 10% | 25% | 500 | -141 | 35.57 | 3,850 | 284 | 7% | 4,419 |
| aggressive | 10% | 25% | 1000 | -566 | -406 | 3,850 | 561 | 15% | 8,446 |
| aggressive | 10% | 50% | 100 | 229 | 419 | 3,850 | 51.09 | 1% | 911 |
| aggressive | 10% | 50% | 250 | 109 | 286 | 3,850 | 284 | 7% | 1,919 |
| aggressive | 10% | 50% | 500 | -66.4 | 94.45 | 3,850 | 561 | 15% | 3,446 |
| aggressive | 10% | 50% | 1000 | -392 | -249 | 3,850 | 950 | 25% | 6,364 |
| aggressive | 10% | 75% | 100 | 237 | 422 | 3,850 | 133 | 3% | 768 |
| aggressive | 10% | 75% | 250 | 144 | 312 | 3,850 | 434 | 11% | 1,444 |
| aggressive | 10% | 75% | 500 | 19.61 | 169 | 3,850 | 773 | 20% | 2,408 |
| aggressive | 10% | 75% | 1000 | -216 | -70.78 | 3,850 | 1,240 | 32% | 4,308 |

### 11.5 Vendor top-up paid to claimants versus burned (chip-tier cheaters only)

| Vendor money to claimants | Claim fee | Chip cheater profit before break cost | Taken back by fake claims (mean) | Victims' coverage |
|---|---|---|---|---|
| yes | 0% | 1,184 | 1,068 | 14% |
| yes | 10% | 855 | 739 | 43% |
| no (burned) | 0% | 235 | 119 | 2% |
| no (burned) | 10% | 147 | 31.25 | 8% |

### 11.6 How far one cheating identity reaches

| Attempts per hour | Targets only offline receivers | Goods obtained per cheater (USDw) | Phone cheater profit |
|---|---|---|---|
| 1 | yes | 292 | 19.21 |
| 1 | no | 311 | 50.48 |
| 2 | yes | 436 | 198 |
| 2 | no | 489 | 190 |
| 4 | yes | 611 | 340 |
| 4 | no | 805 | 572 |
| 8 | yes | 1,023 | 736 |
| 8 | no | 849 | 566 |

### 11.7 Phone-only offline limit and rarely-online users

| Phone limit per payment | Rarely-online share | Honest acceptance | Goods per cheater | Tx/user/day (all, merchants, regular) |
|---|---|---|---|---|
| 20 | 15% | 87% | 189 | 2.89, 36.92, 1.05 |
| 20 | 30% | 86% | 196 | 2.65, 33.96, 1.03 |
| 50 | 15% | 95% | 421 | 3, 35.7, 1.12 |
| 50 | 30% | 93% | 357 | 2.7, 32.71, 1.09 |

### 11.8 The recommended configuration (phone 20 per payment with bond 500; chip bond 1,000; 25 % to victims; 10 % claim fee; vendor money burned)

| Chip limit per payment | Cheater attempts per hour | Chip break cost | Phone cheater profit | Chip cheater profit | Victims' coverage | Honest acceptance | Tx/user/day (all, merchants, regular) |
|---|---|---|---|---|---|---|---|
| 100 | 2 | 0 | -438 | -612 | 22% | 88% | 2.81, 34.25, 1.08 |
| 100 | 2 | 3,000 | -438 | -3,612 | 22% | 88% | 2.81, 34.25, 1.08 |
| 100 | 4 | 0 | -408 | -337 | 14% | 87% | 2.83, 34.41, 1.09 |
| 100 | 4 | 3,000 | -408 | -3,337 | 14% | 87% | 2.83, 34.41, 1.09 |
| 100 | 8 | 0 | -334 | -70.3 | 9% | 88% | 2.84, 34.39, 1.1 |
| 100 | 8 | 3,000 | -334 | -3,070 | 9% | 88% | 2.84, 34.39, 1.1 |
| 200 | 2 | 0 | -438 | -612 | 22% | 88% | 2.81, 34.25, 1.08 |
| 200 | 2 | 3,000 | -438 | -3,612 | 22% | 88% | 2.81, 34.25, 1.08 |
| 200 | 4 | 0 | -408 | -337 | 14% | 87% | 2.83, 34.41, 1.09 |
| 200 | 4 | 3,000 | -408 | -3,337 | 14% | 87% | 2.83, 34.41, 1.09 |
| 200 | 8 | 0 | -334 | -70.3 | 9% | 88% | 2.84, 34.39, 1.1 |
| 200 | 8 | 3,000 | -334 | -3,070 | 9% | 88% | 2.84, 34.39, 1.1 |

### 11.9 Break-even device bond from the formula (bond needed so that fraud does not pay)

| Victims reached N | Accepted each L | s | Worst case (cheater claws back s·B) | Naive cheater | Chip, break cost 3,000, worst case |
|---|---|---|---|---|---|
| 5 | 20 | 25% | 133 | 100 | 0 |
| 5 | 20 | 50% | 200 | 100 | 0 |
| 5 | 50 | 25% | 333 | 250 | 0 |
| 5 | 50 | 50% | 500 | 250 | 0 |
| 5 | 200 | 25% | 1,333 | 1,000 | 0 |
| 5 | 200 | 50% | 2,000 | 1,000 | 0 |
| 10 | 20 | 25% | 267 | 200 | 0 |
| 10 | 20 | 50% | 400 | 200 | 0 |
| 10 | 50 | 25% | 667 | 500 | 0 |
| 10 | 50 | 50% | 1,000 | 500 | 0 |
| 10 | 200 | 25% | 2,667 | 2,000 | 0 |
| 10 | 200 | 50% | 4,000 | 2,000 | 0 |
| 20 | 20 | 25% | 533 | 400 | 0 |
| 20 | 20 | 50% | 800 | 400 | 0 |
| 20 | 50 | 25% | 1,333 | 1,000 | 0 |
| 20 | 50 | 50% | 2,000 | 1,000 | 0 |
| 20 | 200 | 25% | 5,333 | 4,000 | 1,333 |
| 20 | 200 | 50% | 8,000 | 4,000 | 2,000 |
| 40 | 20 | 25% | 1,067 | 800 | 0 |
| 40 | 20 | 50% | 1,600 | 800 | 0 |
| 40 | 50 | 25% | 2,667 | 2,000 | 0 |
| 40 | 50 | 50% | 4,000 | 2,000 | 0 |
| 40 | 200 | 25% | 10,667 | 8,000 | 6,667 |
| 40 | 200 | 50% | 16,000 | 8,000 | 10,000 |

<!-- SIM-RESULTS:END -->

### 11.10 What the simulation says (ASSUMED model; the numbers are illustrative, the directions are the finding)

1. **The victims' share works as a rebate for a cheater who poses as its own victims.** With no claim fee, an
   aggressive phone-key cheater facing a 1,000 bond makes -676 with nothing paid to victims, -437 at 25%, -199 at
   50% and +39 at 75%, while victims recover only 0 to 9% of their losses (table 11.4). This confirms Phase 0's
   reason for burning.
2. **A 10% claim fee, deducted from payouts and burned, blunts the rebate:** at a 50% share and a 1,000 bond the
   cheater's result falls from -199 to -392 and victims' coverage rises from 6% to 25%. At 25% it is -566 and 15%.
3. **Against naive cheaters (no fake claims), the victims' share does its job:** coverage up to 94% (50%, bond
   1,000, no fee), 49% with the fee at 25%.
4. **Vendor money paid to claimants is drained by fake claims:** a chip cheater's result before the break cost is
   +1,184 when the vendor tops up claimants and +235 (+147 with the fee) when vendor money is burned (table 11.5).
5. **Reach:** one identity that clones notes for 36 hours takes 290 to 1,020 USDw of goods at a 50 limit (1 to 8
   attempts an hour, table 11.6), so a phone-only bond of 250 does not deter it (+168 to +197 mean profit).
6. **A 20 USDw phone-only limit halves the reach** (189 against 421 per cheater) at the cost of refusing 50 USDw
   notes offline (acceptance 87% against 95% in this model; users loading smaller notes would recover most of it).
7. **The recommended configuration** (phone-only 20 per payment with a 500 bond, chip bond 1,000, 25% to victims,
   10% claim fee, vendor money burned) keeps every simulated cheater unprofitable: phone keys -334 to -438, chips
   -70 to -612 even with a break cost of zero, victims' coverage 9 to 22%, honest acceptance 87 to 88% (table
   11.8). Caveat: notes in the model are at most 50 USDw, so the chip per-payment limit (100 or 200) never binds;
   the chip limit of 200 must be checked against the break-even table (11.9) with the real note mix.
8. **Chain load:** regular users about 1.1 transactions a day, rarely-online users 0.5, merchants about 34
   (one cashing per note they do not give out as change). See section 12.

**Recommended slash split: 25% to victims pro rata after the claim window, 75% burned, and a 10% claim fee
deducted and burned.** Alternative if Chuck weighs compensation of naive fraud more: 50/50 with the same fee
(about 175 more profit to a cheater per 1,000 of bond, about 10 points more coverage).

---

## 12. On-chain steps and burn per user per day

| Action | Transactions | Signed by | Notes |
|---|---|---|---|
| Load (several notes) | 1 | loader's wallet | about 1 per 1 to 3 days for a regular payer |
| Cash a note with hops | 1 T1 (28 to 56 KB) + a share of a batched T2 | nobody | ≈ 1.1 per note (ASSUMED batching) |
| Refresh own idle notes | ≈ 0.35 per note | nobody | small 0-hop T1s, several per transaction |
| Helper top-up | 1 per about 10 cashings | owner's wallet | makes 50 dust helpers |
| Freeze, claim, settle | rare | nobody | only after fraud |

Simulated (ASSUMED behaviour, `sim/results/recommended.json`): **regular users about 1.1 transactions a day, rarely-online users about 0.5, merchants about 34** (they cash what they do not give out as change); about 2.8 across everyone. **Burn:** when
blocks are not full Minima transactions carry no burn (ASSUMED from current usage); when they are, each of the
above competes by burn, so a user's daily burn ≈ (transactions per day) × (prevailing burn per transaction).
Helper dust pays T1's burn, so cashing needs no wallet signature even under congestion.

**Scale caveat (ASSUMED arithmetic, important):** a cashing is 28 to 56 KB. If 100,000 active users cashed at
the simulated rate, merchants alone would post about 150,000 to 175,000 large transactions a day (about a
third of Minima's 450,000 daily transaction capacity, VERIFIED in the brief) and several GB of TxPoW data a
day through every node. The payment layer is sized for Stables' current scale; mass adoption would need notes
to circulate much longer between cashings (merchant change and wages) or a leaner signature (section 14).

---

## 13. Port map (ABI draft)

| Ports | Meaning | Written by |
|---|---|---|
| 1 | hops in this cashing / claim | T1, C1 |
| 2, 3, 4 | claim: anchor id, key at hop j, digest before hop j | C1 |
| 5 | note index in its LOAD | T1 |
| 6 | helper owner tag | T1, C1 |
| 7 | claim: hop index bytes | C1 |
| 8 | LOAD note count; SPLIT amount | LOAD, SPLIT |
| 9 | operation code (1 load, 2 cash, 3 claim verify, 4 claim settle, 5 cash settle, 20 freeze, 21 withdraw request, 22 withdraw, 23 renew, 24 abandon, 30 pool settle, 40 merge, 41 split) | all |
| 10 to 19 | proof of cheating | FREEZE |
| 16k+0..3 (k = 1..3) | hop k: R, C, chunk digests, message | T1, C1 |
| 97 | helper input offset (2 cashing, 1 claim) | T1, C1 |
| 99 | role of a stamp coin at NOTES (1 mark, 2 record) | LOAD, T2 |
| 101, 102, 103 | loader payout, loader device root, expiry block | LOAD |
| 110+i | note i: marker id, value id, first key | LOAD |
| 120 to 131, 139, 140+3n..142+3n | bond and pool fields, claims | owner, FREEZE, C2 |
| 150, 151 | vendor key, vendor payout (not 125/126: shared state with the pool) | vendor |
| 200, 201, 202 | summary, cashed-at block, note value | T2, record |
| 230 to 234, 236, 239, 240+k | claim statement, cheater root, root slot, membership proof, root sum, vendor contribution, vendor address, settle payouts | C1, C2, SETTLE |

---

## 14. What remains unverified (and how Phase 3 closes it)

| Item | Status | Risk | Closes in |
|---|---|---|---|
| Any of these scripts **mining** on mainnet | not done (no chain writes allowed) | the recorded, unreproduced `basic:false` per-branch budget could reject heavy branches that pass here. **At risk:** helpers (800), T1 mark with 3 hops (702), SPHINCS-style checks (837), C1 (565). Fallback: FORS-SHA2 (625, one coin) or more, smaller helpers | Phase 3, one mined T1 per hop count |
| Node versions 1.1.1.26 (embedded) and 1.6.11 (phone Core) | not measured | instruction counting or limits could differ (the 1.1.2.6 source counts the same way, VERIFIED by reading) | Phase 3 on the phone |
| Core companion reply cap with a real 2-hop cashing | ASSUMED from the 100,000-character cap | | Phase 4 |
| TxPoW header size | allowance 1,200 bytes (model constant) | 3-hop margin is 9.4 KB | Phase 3 |
| Helper coins at a MAST address spent on chain | in-process only | | Phase 3 |
| In-process results (`covenant-branches.json`) | run on the node's own jar (same VM code, cross-checked 790 = 790 against `runscript`), not by the node | L1 | Phase 3 |
| LX security argument | ASSUMED, written by the designer | wants an independent review before real value | before Phase 3 |
| Anchor-visibility refusals, merchant cashing load, fraud reach N | ASSUMED simulation | numbers are illustrative | Phases 4 and 5 |
| Pruning: NOTES tracked by every node; snapshot fallback | ASSUMED; snapshot not extended | a node that needed a MegaMMR resync cannot prove records | Phase 3 |
| Batched T2 (several release coins per settle) | not written | | Phase 3 |
| STAMP genesis and dispenser lanes | not created | | Phase 3, Chuck approves the token |
| Chip timings | ASSUMED arithmetic from published J3R180 figures | | Phase 6 |
| Simulation coverage of chip limits | notes in the model are at most 50 USDw, so chip per-payment limits of 100 or 200 never bind | the chip-tier limit of 200 rests on the formula (11.9) and the chip break cost, not on the simulation | Phase 2 re-run with the real note mix |
| Claim fee in the pool script | recommended, not yet in the measured script (about 6 instructions more per claim) | | Phase 2 / 3 |
| Vendor slash as a burned penalty | recommended; the measured vendor branch still tops up claimants | | Phase 2 / 3 |

---

## 15. Decisions for Chuck before Phase 2 (recommendation first)

See the report back for the plain-language versions; this is the list with the reasoning pointers.

1. **Signature scheme: LX16 (labelled-XOR Lamport).** Alternative FORS-SHA2 is cheaper on chain but 17× slower
   key making on the chip. (Section 1.3.)
2. **Hop caps: chip 3, phone-only 2; Core companion receivers 2.** (Section 1.6.)
3. **Accept the "unseen origin" rule** for offline receivers (about 3% of payments refused in the model), and
   put compact block proofs on the research list rather than the Phase 2 scope. (Sections 4.4, 14.)
4. **Slashed bond split: 25% to victims, 75% burned, plus a 10% claim fee deducted and burned** (changes
   decision 7's starting 50/50). Alternative: 50/50 with the fee. Pro-rata victims' share without a fee is
   captured by sock-puppet claims. (Section 11.10.)
5. **Vendor bond slash: burned penalty only**, not paid to claimants. (Section 7.2.)
6. **Phone-only offline limit 20 per payment and minimum bond 500** (50 when the payer's bond is at least
   1,500); **chip 200 with a minimum device bond of 1,000** and a vendor bond of at least 5,000. (Sections 10, 11.)
7. **Timing constants:** note expiry 7 days, freshness 72 hours, claim window 14 days, record lifetime 21
   days, bond withdrawal 28 days. (Section 10.)
8. **STAMP, a protocol-only marker token,** created once at Phase 3 genesis. (Section 2.)
9. **Two transactions per cashing** (verify, then settle). (Section 2.)
10. **Naming:** adopt "Instant balance" for the payment account in the app (Phase 0 recommendation; Chuck
    decides the naming, section 16).

---

## 16. Naming (proposal)

Existing product language (Omnia handover): "Main balance / Instant balance / Prepare money". Proposal: the
savings account stays **Main balance**; the payment account is **Instant balance**; loading is **Prepare
money**; cashing is **Move to main balance**. Chip vendor, bond, hops and freshness sit behind a details view
(minimal-information law). Chuck decides.

---

## 17. Files

| Path | What |
|---|---|
| `../measure/rpc.mjs` | POST RPC client (raw TCP; the node's reply breaks Node's HTTP parser), allow-list of dry-run commands |
| `../measure/ots.mjs` | LX, LO and W4 key generation, signing and reference verification |
| `../measure/kissgen.mjs`, `../measure/covenants.mjs` | script generators (measurement scripts; covenant templates) |
| `../measure/step-a.mjs`, `w4-overhead.mjs`, `sphincs-baseline.mjs`, `txsize.mjs`, `covenants-run.mjs` | measurement runners |
| `../measure/java/KissRun.java`, `SphincsBaseline.java` | in-process runner on the node jar; SPHINCS signature generator |
| `../measure/receipts/*.json` | every measurement: command, node version, result, instructions, bytes, timestamp |
| `../kiss/*.kiss` | every script, with a header giving purpose, ports, measured instructions and receipt |
| `../sim/payment-sim.mjs`, `../sim/results/*.json` | the simulation and its outputs (`recommended.json`, `sweep-split-bond.json`, `vendor-topup.json`, `intensity.json`, `limits.json`, `break-even.json`, `baseline.json`) |
| `../sim/summarize.mjs` | regenerates the section 11 tables in this document from the results |
| `../measure/find-coin.mjs`, `probe-vm.mjs`, `rebuild-kiss-headers.mjs` | finds provable coins for size tests; VM behaviour probes; rebuilds the .kiss headers from receipts |
