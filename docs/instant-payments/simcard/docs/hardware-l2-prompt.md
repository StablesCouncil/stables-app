> ## Reconciled 2026-09-29, read first
>
> This prompt comes from an outside research session. It has been mapped against the founder's settled decisions (13, 14 and 15 in `../stables-payment-layer-agent-brief.md`) in **`chip-balance-design.md` section 0b**, which holds the full table. **Settled decisions win. Read that section before acting on anything below.**
>
> - **Superseded by our verified findings:** "anything a covenant checks must carry a Minima WOTS signature" (LX16, a SHA-256 signature, is checked on chain, and chips can make it); benchmarks 1 and 2 (the J3R180, which is the Satochip DIY card, has no SHA-3, at about 8 hours per Minima signature: no-go); the §4 fraud-proof question (LX16 for anything the chain checks, P-256 card to card); and the spent-note registry (it would serialise the chain; on Minima the coin itself is the spent-once marker).
> - **Conflicts with settled founder decisions, so do not build:** notes, transfer history, hop counts, expiry and per-card caps (decisions 13 and 14; no time limits, 2026-09-28); private or test networks (mainnet only, with valueless tokens; the lab is DevNodesSet 9101 to 9401 plus Test12); buying cards now (decision 15); an on-chain switch to disable a chip model (an authority, so appendix D.9 only); and a new `hardware-l2-design.md` (the Stage 2 design is `chip-balance-design.md`).
> - **Adopted, and where:** the card tapped on the merchant's phone, which receives but cannot re-spend offline until it loads into its own card (4.4 and section 7); facts on Minima's chip for Stage 3 (0a); questions for the Minima team (0b.3); the first build when cards arrive (0b.2); class-break mitigations (appendix D.9 only).
> - **Already ours (consistent):** an offline key certifying each card (open, bonded vendors), monotonic counters, commit before emit, no shared secrets, and revocation spread at every tap.
>
> The body below is left as received and is not edited.

---

# Task: Hardware-secured Stables L2 ,  Java Card applet plan, fraud proofs, revocation and note expiry

You are working on our hardware-secured L2 for Stables (Minima-based wrapped fiat tokens: USDw, EURw, …). The goal is **real digital cash**: value held on a secure hardware card, transferable **off-chain, peer-to-peer, without 1-to-1 payment channels**, loadable from and unloadable to the Minima chain at any time.

This prompt consolidates a research session. **First re-read what already exists in this repo for the L2** and map this plan against it: keep what is already better, flag conflicts, and do not silently overwrite design decisions. Then produce the deliverables at the end.

## Ground rules

- Priorities: decentralisation and permissionlessness first. **No price oracles.** Any unavoidable trust (hardware vendor, card issuer/personaliser) must be **explicit, bounded and transparent** ,  never hidden.
- Minima command syntax comes from the node (`help command:X`, `tutorial`); the docs site renders blank. Use local test nodes (Test04/Test07/Test08) or a private `-test -genesis -nop2p` node for covenant tests.
- Never automate seed-phrase restoration.
- Label every claim **verified** (tested/checked), **believed**, or **unknown**.
- Research prototype, no real funds.

## Facts already verified (Minima 1.0.49-TEST.4, private node)

- KISS-VM functions: `SHA2`, `SHA3`, `SIGNEDBY`, `MULTISIG`, `CHECKSIG(pubkey data sig)`, `PROOF` (MMR proofs), `STATE`/`PREVSTATE`/`SAMESTATE`, `VERIFYOUT`/`VERIFYIN`, `GETOUT*`/`GETIN*`, `SUMINPUTS`/`SUMOUTPUTS`, `@BLOCK`, `@COINAGE`, `@AMOUNT`, `@TOKENID`, `@ADDRESS`; floating ELTOO inputs exist (`txninput floating:true`).
- **Only Minima's own signatures (WOTS, Winternitz one-time signatures in a Merkle tree) can be verified on-chain.** No ECDSA/secp256k1, Ed25519, P-256 or BLS. ⇒ Anything that must be checked by a covenant (redemption claims, fraud proofs) must carry **Minima WOTS signatures**.
- WOTS signature ≈ 4.1 KB; each key = 262,144 uses (64^3). Leaf reuse breaks security ⇒ the signing counter must never roll back.
- `HEX()` only converts positive whole numbers ⇒ encode amounts as integer base units with fixed length (`SETLEN`).
- A 2-party channel covenant (FUND + SETTLE, `CHECKSIG` on off-chain states, latest-seq-wins dispute window) passed all tests (stale close overridden, replay rejected, early/wrong settle rejected). See `stables-channel/` prototype if copied into the repo. Not the target design here, but reuse its encoding and test harness patterns.

## Target architecture

### 1. Backing on Minima
- Value enters the L2 by locking USDw in a **Stables L2 covenant** on Minima. Each lock creates **notes** (fixed or variable denomination) with a unique `noteId`, bound to the receiving card's public key.
- Total notes outstanding can never exceed locked collateral: the covenant pays each `noteId` **at most once** (spent-note registry, e.g. MMR/nullifier set in covenant state).
- Unload = redeem a note on-chain with a WOTS-signed claim from its current holder.

### 2. The card (Java Card applet)
Holds per-card unique keys, notes, balance, counters, revocation list. Must provide:
1. **Non-extractable keys** ,  generated on card; certified secure element (EAL5+/6+ platform).
2. **Spending rules the holder can't override** ,  note is deleted/decremented atomically (`JCSystem.beginTransaction`) before a transfer is released.
3. **Attestation** ,  card key pair generated on card; its public key certified at personalisation by an **issuer key kept offline, never on any card**. Counterparties verify the certificate chain before accepting.
4. **Monotonic counters** ,  transfer sequence number and WOTS leaf index never go backwards (anti-rollback, anti leaf-reuse).
5. **Caps** ,  maximum offline balance per card and maximum per-payment amount (parameters, e.g. €200 / €50 to start).

**Never put a shared secret on cards** (no global symmetric keys, no shared attestation private key). One cracked card must only compromise itself.

### 3. Transfers
- **Card → card (offline):** mutual attestation → payer card deletes note(s), signs a transfer record `{noteId, amount, fromCard, toCardPubKey, seq, expiry, hopCount}` → payee card verifies and stores. Card-to-card hops may use the card's fast native signature (e.g. P-256) for speed; the note keeps its **transfer history** (or a compact commitment to it) for fraud detection.
- **Card → merchant phone only (receive & redeem):** payer taps card on merchant phone (NFC; the phone is an untrusted relay). The card signs a **WOTS claim** to the merchant's Minima key so the merchant can redeem on-chain later. The merchant phone **cannot re-spend offline** (no hardware protection); to re-spend offline it loads the note into its own card.
- The phone app is always an **untrusted transport**: all security decisions happen on the cards/covenant.

### 4. Fraud proofs (double-spend detection)
- A double-spend = **two conflicting transfer records for the same `noteId` (and same seq) signed by the same card.** This pair is an objective, self-verifying fraud proof.
- Detected when (a) a second copy is redeemed on-chain, or (b) two copies meet at any card/phone.
- **On-chain (permissionless):** anyone submits the fraud proof to the covenant → card marked revoked in an on-chain registry → the card's **bond** (posted at issuance, in the same token, no oracle) is slashed to compensate the loser; submitter rewarded.
- Design question for you: fraud proofs involving card-native (non-WOTS) signatures cannot be verified by KISS-VM. Options: (i) cards co-sign each transfer with WOTS too (cost!), (ii) only redemption claims are WOTS and the on-chain proof is "two redemptions of the same noteId from different holders, each carrying the offending card's WOTS-signed release", (iii) other. Evaluate and recommend.

### 5. Self-verifying revocation list
- A revocation entry = the fraud proof itself (two conflicting signatures). Any card or phone can verify it **without trusting who delivered it**.
- Propagation: phone app syncs from its Minima node / Maxima; **every card-to-card transaction exchanges revocation updates** (epidemic/gossip spread, works offline). Store compactly (card: hundreds of entries; phone: thousands; consider Bloom filter + full proofs on demand).
- Enforcement is **receiver-side**: a card/phone refuses notes from, or with history through, a revoked card. The cheater's card cannot prevent this.
- A cracked card cannot be remotely stopped; it is shut out by everyone else.

### 6. Note expiry and freshness
- Each note carries an **expiry** (e.g. N days since its last on-chain or online touch) and a **max offline hop count**. After that, it must be refreshed online (re-issued by the covenant flow) before being spent again. This bounds how long duplicates can circulate.
- Receivers that have not synced recently accept only smaller amounts.
- Above a threshold amount, the merchant app requires an online check.
- Incentivise prompt redemption/refresh so duplicates are caught early.

### 7. Class-break safety
- A flaw across a whole chip model (e.g. ROCA 2017, Infineon RSA key-gen) is the real systemic risk. Mitigate with: per-card caps (total exposure ≤ cap × cards), an **on-chain switch to disable offline sending for a chip model / certificate batch**, and support for more than one chip vendor.

## Hardware for prototyping

- Satochip "Blank Javacard for DIY project" (€25, dual interface contact + NFC, **unlocked with default GlobalPlatform keys**). Chip model not stated on the page; Satochip products are built on NXP JCOP4 ,  **verify** with GlobalPlatformPro (`gp --info`, `gp --list`). Buy ≥ 3 cards. Reader: standard PC/SC contact reader (e.g. ACR39U) or Android NFC.
- Card handling rules:
  - Keep default GP keys on test cards → unlimited delete/reload of the applet (deleting the applet wipes its data).
  - **Never** set lifecycle to TERMINATED; don't lock keys on test cards; always script `gp` with the correct keys ,  ~10 failed authentications can brick a card.
- Toolchain: Java Card SDK (match the card's JC version, likely 3.0.4/3.0.5), `ant-javacard` for building CAP files, GlobalPlatformPro for loading, jCardSim for unit tests off-card.

## Benchmarks to run first (go/no-go)

1. Does the card support **SHA3-256** (`MessageDigest.ALG_SHA3_256`)? Measure hash throughput (bytes/s) for SHA-256 and SHA3-256.
2. **Minima WOTS signing on card**: implement (or port) Minima's WOTS parameters from the Minima source; measure time per signature and RAM/EEPROM footprint; estimate tree-key generation cost (64-leaf levels). Verify card-produced signatures with `verify` on a Minima node and with `CHECKSIG` in `runscript`.
3. Native signature (P-256 ECDSA) time per transfer, and APDU round-trip time over NFC via a phone.
4. EEPROM budget: notes, revocation entries, transfer history.

If WOTS on card is too slow for per-payment use, confirm the hybrid: native signatures for card-to-card hops, WOTS only for redemption claims and phone-only-merchant payments (possibly precomputed/cached where safe ,  never reuse a leaf).

## Deliverables

1. `docs/hardware-l2-design.md` ,  architecture, trust model (who is trusted for what, explicitly), threat model table (attack → mitigation → residual risk), parameters (caps, expiry, hop limit, bond size), and the decision on fraud-proof signature handling (§4).
2. Applet skeleton (Java Card): key gen, attestation cert storage, balance/notes store, monotonic counters, transfer protocol APDUs, revocation store, caps, expiry checks. Unit tests in jCardSim.
3. KISS-VM covenant drafts: note lock/issue, redemption with spent-note registry, fraud-proof slashing + revocation registry. Test with `runscript` and on a private node.
4. Benchmark script + results table from the real card.
5. A short list of questions for the Minima team: will the Minima chip include a tamper-resistant enclave, can third parties load code onto it, and does it expose attestation.

Summarise in chat: verdict on feasibility, the three biggest risks, and the first thing to build once cards arrive. Ask me before changing existing design docs or code.
