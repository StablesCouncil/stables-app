# STEP2-DEMO-01: load, two offline payments and three offloads across three wallets

- **ID:** `STEP2-DEMO-01`
- **Version:** 2, 2026-09-29. It supersedes version 1 (DRAFT, 2026-09-28, never approved, never run). Version 1 is kept
  unchanged, byte for byte, in
  [`v1_superseded/STEP2-DEMO-01.v1-draft-2026-09-28.md`](v1_superseded/STEP2-DEMO-01.v1-draft-2026-09-28.md)
  (SHA-256 `cda3f317cd09e3e138a68b2be13cdfd123ccd8200b0d475bb036cbd00a0472a0`). Section 17 lists what changed.
- **Status:** **APPROVED v2 by the founder, 2026-09-29** ("let's go", replying to "approve the demo as recommended": witness 9201; option (a), transactions found on the observer nodes; the laptop webcam for the QR leg with Chrome on the Pro over USB as fallback; keep the three registrations). One run, `STEP2-DEMO-01-R1`, is authorised. Both blockers
  named in version 1 are cleared:
  - the pre-seed [`STEP2-PRESEED-01`](STEP2-PRESEED-01.md) closed **green** (run R1, 2026-09-29, closure report
    [`../evidence/STEP2-PRESEED-01-R1/CLOSURE_REPORT.md`](../evidence/STEP2-PRESEED-01-R1/CLOSURE_REPORT.md));
  - the app feature is built in **v0.0.11.103**, APK SHA-256
    `850bb9567ac7dcfc429b58d6ab135251f47ae17559df54335f338872580577f2`. It was installed on both phones on
    2026-09-29 at 04:21, and the installed hash equals the build hash on each
    (`1_development/stream_3_governance/task_test_channel/evidence/instant-payments-step2/2026-09-29/phones/device-install.txt`).
- **Run identity once approved:** `STEP2-DEMO-01-R1` (one run of this version; standard section 6)
- **Mode:** formal evidence mode (`EXPERIMENT_GOVERNANCE_STANDARD.md` section 3)
- **Network:** Minima mainnet only; the V9 test token Winiwa (valueless)
- **Observer nodes:**
  - Lab node **9101** (RPC `http://127.0.0.1:9105`, Minima 1.0.45.15). It is also wallet C, which reaches it
    through its CORS proxy `http://localhost:9106`.
  - Witness **9201** (RPC `http://127.0.0.1:9205`). It observes only.
  - The agent's reads go to 9105 and 9205 directly, never through 9106 (section 4.1). The phones' own views are
    recorded as supplementary.
- **Confirmation rule:** the app's own rule for crediting (3 confirmations, UX law 16d); for evidence, one canonical
  block observed by both observer nodes (standard section 6.8).
- **Design:** [`step2-load-offload-design.md`](step2-load-offload-design.md), version 2, sections 9 and 10
- **Basis for version 2:** [`STEP2-DEMO-01-readiness.md`](STEP2-DEMO-01-readiness.md), section 3, items 1 to 11,
  written after build 103.
- **Location note:** the standard names no folder for records; the brief puts them beside the design.
  Evidence goes to `../evidence/STEP2-DEMO-01-R1/`.

---

## 1. Research question

Can a real on-chain load, two offline Instant payments and three real on-chain offloads run end to end across three
wallets on three platforms, with every Instant figure matching the chain, every payout reaching its owner's own
Savings, and the vault ending with nothing in it?

## 2. Reason for testing

It is the founder's goal of 2026-09-28: "really load the instant wallet with an onchain transaction and off load it
the same way with the receiving wallet and even more with a 3rd wallet". It is the first time the app uses the pooled
vault. It is the first time a wallet that never loaded (C) takes out money that another wallet (A) put in. It is also
the first on-chain evidence from the phones' embedded node (1.1.1.26) for these scripts. In particular, the key and
signing commands the app uses were proven on 1.0.45.15 by the pre-seed (HP5), but never on 1.1.1.26 (section 4.4).

## 3. Hypotheses

- **HD1 (load).** T1 mines. A's app credits exactly 100.00 Winiwa to A's Instant payments once, only after 3
  confirmations, and never again for the same load coin.
- **HD2 (offline).** With both phones in airplane mode, A pays B 60 by tap and B pays C 25 by QR. The 60 is above
  quick pay, so A confirms it with the payment code (UX law 24). The Instant figures become A 40, B 35, C 25. Nothing
  reaches the chain.
- **HD3 (pooled offload).** C's app registers (T2). Once that registration is 3 blocks deep, the app withdraws (T3),
  spending **A's load coin**. C's Savings (lab node 9101) gains exactly 25, C's Instant payments show 0, and the vault
  holds 75 in one coin.
- **HD4.** B's app registers (T4). Once that registration is 3 blocks deep, the app withdraws (T5). B's Savings gains
  exactly 35, B's Instant payments show 0, and the vault holds 40.
- **HD5 (vault to zero).** A's app withdraws (T6) with the registration made in T1. A's Savings gains exactly 40, A's
  Instant payments show 0, and **the vault holds no coin**.
- **HD6 (chain agreement).** 9101 and 9201 each see T1 to T6 in the same canonical block. Every payout output pays
  the payout address (port 3) fixed by that wallet's own registration (A: T1, C: T2, B: T4).

## 4. Exact initial conditions

### 4.1 Cast

| Wallet | Device | Savings (node) | Instant account | Payments |
|---|---|---|---|---|
| **A** | Pixel 7 Pro, standalone app v0.0.11.103, release-signed | its embedded node (1.1.1.26) | a fresh v2 account (scheme 0x05) | NFC |
| **B** | Pixel 7 (GrapheneOS), standalone app, the same build | its embedded node (1.1.1.26) | a fresh v2 account (scheme 0x05) | NFC with A, QR with C |
| **C** | web preview on the laptop, `http://localhost:8080/dapp/3-test/` (the same 103 tree), connected to lab node 9101 with RPC URL **`http://localhost:9106`**, in **one browser tab** | lab node 9101's wallet | a fresh v2 account in that browser's storage | QR (the laptop webcam reads B's payment QR; the path is fixed at D0, decision 3) |

**How C is connected.** The preview's built-in browser bridge points at `http://localhost:9006` (the Test12 treasury
ladder), not at 9101. Without the RPC URL, C would be another wallet. So C uses Connect with RPC URL
`http://localhost:9106` (stored as localStorage `stables_rpc_url`). 9106 is 9101's CORS proxy in front of its RPC
9105.

**One tab, one profile.** The 9106 proxy forwards over a single upstream socket. During the build of 103, several
open tabs jammed it until the proxy was restarted. So exactly one app tab is open on it, in one browser profile, from
D0 to the closing reads. C's Instant payments live in that profile's storage. There is no second tab and no second
tool on 9106; the agent's reads use 9105 directly.

### 4.2 Addresses and identities

| Name | Value |
|---|---|
| Registration v2 (REG) | `0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449` (`MxG082J6T2PS1QV22QJ82MFCHDNG5EG2PBGF1TCNTHWPYDDNCCSHT2K96PU118J`) |
| Vault v2 (VAULT) | `0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413` (`MxG08727WKV4J7YNN29MTCM9MGKB85EENR9SRFT6UUSTAQNCMNB799K2EU5DAJE`) |
| Phantom addresses (must never appear) | REG multi-line form `0xC4B574EA362B47D8DDA72518E696908F0A7BFE363A2B58F90822463436EDD12F`; VAULT multi-line form `0x5FF94F305A3CFCDB24A1D3B00DE5C8EC495C3795FFD9AF37C63C785A54290C6C` |
| Winiwa | `0xD4F5DD3546F25D327CBF2B6867E193CE5DB6491AC9C65BBDCECACA1A6688063F` |
| Clean texts (what every app registers) | `kiss/step2/instant_registration_v2.clean.txt` SHA-256 `a033264f9442cded205a8f7224d41e2387763148e2138351b2e0fbf541ce2d9e`; `kiss/step2/instant_vault_v2.clean.txt` SHA-256 `e63e0452b1a3d3e641f7b3016e1318070e0291223e0dae48a74f826bc0b76f6a` |
| Addresses computed by | Minima 1.0.45.15 live (`runscript` clean form on 9101), and in-process on the 1.0.45.15 and 1.1.2.6 jars, all agreeing (`step2v2_addresses.json`). Proven spendable, and returned by `newscript` on 9101 and 9201, by STEP2-PRESEED-01-R1 (green). |
| Per wallet, fixed by its registration (run outputs, not D0 fixtures) | Each wallet's registration output (A: T1, C: T2, B: T4) holds three values in its state. **ACCT** (port 1) is the account id, the SHA-256 of the v2 Instant P-256 public key. **K** (port 2) is the withdrawal key, a new key the app makes with `keys action:new` at that wallet's first load or move. **P** (port 3) is the payout address, in that wallet's own Savings. K does not exist before the run, and none of the three can be read on the release phones beforehand. So the observers record all three from the chain as each registration mines, and every later check of that wallet uses them. For C, P_C is also checked on 9101 with `checkaddress` (`relevant:true`, `simple:true`). |
| Build, frozen at D0 | **v0.0.11.103** (`APP_BUILD_ITERATION` 103). APK `Stables_v0.0.11.103.apk`, SHA-256 `850bb9567ac7dcfc429b58d6ab135251f47ae17559df54335f338872580577f2`, signer `dabb1b2a79b134b6008e6401735d649c140b51f2c4a83eb001b2ffdad5ce5dd4`, versionCode 11103. The installed hash on each phone is re-read over adb at D0. The five reference files served to C are listed below the table. Each surface's `[STABLES-FINGERPRINT]` line (`"version":103`) is also recorded. |

**Reference hashes for the tree served to C** (SHA-256, measured 2026-09-29 when this version was written; they
match the readiness note's truncated values; re-measured at D0):

| File (under `website/dapp/3-test/`) | SHA-256 |
|---|---|
| `index.html` | `0eecd1b8674b623fe2456ff0a2494915ab71ca5eb7d36d92eafd30f02a2013b5` |
| `assets/instant-chain.js` | `6b6aa7e497a35bf729a2fb71245966400931517299bae34a1ed03f6f7fcb10c4` |
| `assets/instant-balance.js` | `91e3d06b75fd6b4f0f6d5ab35f61cccb339bab48cd917a85774ed562b4b785f6` |
| `assets/instant-protocol.js` | `e5a54de087a565e9c13b8a1bc8585d635c41a8a45f5e591291182c892ab9ce41` |
| `assets/config/runtime-config.js` | `29acf3ed080581ee901581ff2a102e8f78c66838b7e4815a387b78fca55d60b6` |

### 4.3 Preconditions (all checked at D0; any failure stops before T1)

- STEP2-PRESEED-01-R1 closed green (done, 2026-09-29). Its closing reads show nothing of its own at REG or VAULT.
- `coins address:<VAULT>` on 9101 and 9201 returns **no coin**. Anyone can send coins to a public address. If a
  foreign coin is there, stop and ask: the app could pick it, and the 100, 75, 40, 0 sequence would no longer be the
  one registered. `coins address:<REG>` is read and recorded on both nodes. A foreign coin at REG is recorded, is not
  touched, and is not a stop, because each app uses only its own registration.
- `txpow address:<VAULT>` and `txpow address:<REG>` answer on both nodes, and the replies are recorded. They are the
  search section 9 uses to find T1 to T6. The pre-seed's H01 to H06 may still be inside the nodes' in-memory chain.
  If they are, they appear here, which shows the search hits. If they are not, an empty reply proves nothing yet: the
  first proof that the search hits is T1 (section 9 gives the fallback).
- Both phones run build 103: the installed APK hash equals the frozen hash. If a reinstall were ever needed: force-stop,
  `adb install -r`, never uninstall. Both show Instant payments at 0.00 on a fresh v2 account (scheme 0x05). The
  Pixel 7 Pro has not yet been opened on 103. It is opened at D0, and its `[STABLES-FINGERPRINT]` line is recorded.
- **Test credit retired** (build 103). It appears only on a device whose old account held a non-zero figure. There,
  the old figure shows in two places:
  - in the Instant payments pop-up, as a static currency row "Winiwa · Test credit retired";
  - in Activity, as one row "Test credit retired".

  It is counted nowhere, so the Instant figure reads 0.00. A device whose old account held nothing shows nothing. The
  preview used for C has none. What each phone shows is captured at D0 (the pop-up and Activity). A retired figure
  counted in any total fails the preconditions.
- **Tracking over the exact clean texts** (build 103). Each app tracks REG and VAULT itself, on its first pass after
  its node connects and again before any build. It runs `newscript trackall:true` over the exact clean texts of 4.2
  and checks the address the node answers. On a phantom address (4.2) the app refuses everything, and the step's row
  reads **Not sent**. On 9101 the answered addresses were the frozen ones (runtime check during the build of 103).
  The agent cannot read this on the release phones (no WebView debugging). There, the first proof is T1 itself paying
  the frozen VAULT and REG. 9101 and 9201 already track both scripts (pre-seed P0.4).
- C is served by `dev-up.ps1 -DevNodes 2`, and the five reference hashes of 4.2 match. C is open in one tab and
  connected with RPC URL `http://localhost:9106`.
- Lab nodes 9101 and 9201 are healthy by `lab-node-health.mjs` (`--rpc 9105 --proxy 9106` and
  `--rpc 9205 --proxy 9206`), with tips within 2 blocks. The history of both nodes since the pre-seed is in 4.5.
- A's Savings holds at least 100.00000001 Winiwa in coins the app can use. B and 9101 each hold at least one atom of
  Winiwa for their registration (all three wallets have faucet Winiwa).
- The fixture block is written into the evidence folder and hashed. It holds the build and tree hashes, the
  fingerprints, both tips, C's RPC URL, and the D0 reads of this section. Nothing in it changes after T1.

### 4.4 Not yet proven on the phones' embedded node (1.1.1.26)

| Command | First used on a phone | Proven where |
|---|---|---|
| `keys action:new` | T1 on A (A's first load makes the registration and a dedicated key); then B's first move (T4) | 1.0.45.15 (pre-seed P0.5, K1) |
| `txnsign publickey:<that key>` | T5 on B; then T6 on A | 1.0.45.15 (pre-seed HP5: H02, H05, H06 mined) |

C's key is made and used on 9101 (1.0.45.15), the path the pre-seed proved.

If either command is refused on 1.1.1.26, the app stops before posting:
- the row reads **Not sent**;
- nothing moves, and the balances are as they were;
- a move to Savings, which debits first, gives the debit back because nothing was posted.

That is a stop under section 13 ("an app refuses to post an honest step"). If the refusal comes at T5, B's
registration T4 has already mined. It stays, owned by B and harmless.

### 4.5 Lab node history since the pre-seed

- **9101** was restarted during the build of 103. It wedged under load, and only 9101 and its proxy 9106 were
  restarted. The harness runs made a few unused keys on it with `keys action:new`. The loads they built were deleted,
  never posted, so 9101's Winiwa is unchanged. The unused keys are harmless. C's withdrawal key K_C will be another
  new key, made at C's first move (step 4). `txnlist` on 9101 is recorded at D0. Any leftover built transaction is
  recorded and not touched.
- **9201.** This corrects readiness item 10. The two Java processes on 9201 are the Java launcher stub (`java8path`,
  PID 30460) and its one real JVM (PID 36080). That is a normal pair, not a duplicate. The real duplicate seen in the
  pre-seed (its anomaly b, PID 33600) was stopped on 2026-09-29. Nothing needs stopping before D0. The pre-run health
  check stays as written in 4.3, and the process list for 9201's data folder is recorded at D0.

## 5. Independent variables

- the wallet acting;
- the platform (embedded 1.1.1.26 node, or lab node over RPC);
- the amounts;
- the payment channel (NFC or QR) and its tier (the payment code for the 60 by tap, law 24);
- the network state of each device (online or airplane mode);
- whether the offloading wallet ever loaded (A yes; B and C no).

## 6. Dependent variables

- **For every on-chain transaction:** transaction id, canonical TxPoW id, block number and block id on 9101 and
  9201, confirmations, inputs and outputs (coin ids, addresses, amounts, state), and size.
- **For every registration:** ACCT, K and P as mined.
- **For every step:**
  - the vault's and the registration address's unspent coins before and after (both observer nodes);
  - each wallet's Savings and Instant figures before and after;
  - the activity rows and statuses each app shows;
  - the time each step takes.

## 7. Expected results (the step board)

| Step | Who, how | On-chain | Vault after | Instant A / B / C after | Savings change |
|---|---|---|---|---|---|
| 1 | **A adds 100 from Savings** (Pixel 7 Pro, online; Savings Standard pay, no code) | **T1**: A's Savings coins in; out: VAULT 100 (load coin L, state: magic, ACCT_A, K_A, P_A, currency), REG 0.00000001 (A's registration), change to A | 100 (one coin, L) | 100 / 0 / 0 (credited at 3 confirmations) | A: -100.00000001 |
| 2 | **A pays B 60 by tap** (both phones in airplane mode). 60 is above quick pay (50 by default), so at Confirm send **A enters the payment code, or chooses one first** (law 24). The amount stays 60. | none | 100 | 40 / 60 / 0 | none |
| 3 | **B pays C 25 by QR** (C on the laptop shows its receiver code, B scans it, B shows the payment QR, the laptop reads it; 25 needs no code) | none | 100 | 40 / 35 / 25 | none |
| 4 | Phones back online. **C moves 25 to Savings** (laptop) | **T2**: C's registration (9101 Savings, 0.00000001 to REG), then **Preparing** until T2 is 3 blocks deep (about 3 blocks). **T3**: in: C's registration, **A's load coin L** (100); out: P_C 25, VAULT 75 (no state), C's registration again | 75 (one coin) | 40 / 35 / 0 | C (9101): +25, -0.00000001 |
| 5 | **B moves 35 to Savings** (Pixel 7) | **T4**: B's registration, then **Preparing** until T4 is 3 blocks deep. **T5**: in: B's registration, the 75 coin; out: P_B 35, VAULT 40, B's registration | 40 (one coin) | 40 / 0 / 0 | B: +35, -0.00000001 |
| 6 | **A moves 40 to Savings** (Pixel 7 Pro; registered in T1, so no Preparing) | **T6**: in: A's registration, the 40 coin; out: P_A 40, A's registration (no change output) | **nothing** | 0 / 0 / 0 | A: +40 |

At the end every unit that went into the vault has come out, to three different wallets. The three registration
coins (one atom each) stay, owned and closable by their owners.

These shapes were measured in two ways:
- **In-process, with these exact amounts.** T3 is `DEMO_T3_C_withdraws_25_from_A_load_of_100` (88/31 instructions),
  T5 is `DEMO_T5_B_withdraws_35_from_change_75` (88/31), and T6 is `DEMO_T6_A_withdraws_40_vault_to_zero` (93/28).
  All three are valid, and `NEG_DEMO_T6_A_registration_paying_C` is refused.
- **On chain, as the pre-seed's controls.** Build 103 builds them command for command like those controls: T1 = H01,
  T2 and T4 = the registration part of H01, T3 and T5 = H02, T6 = H05.

Size estimates: T1 8.1 KB, T2 and T4 7.9 KB, T3 and T5 11.0 KB, T6 10.8 KB (`step2v2_txn_sizes.json`). The pre-seed
measured the same shapes below these estimates: H01 7,233 bytes, H02 8,736, H05 8,209.

**What each person sees** (design section 9 as build 103 presents it; informational, recorded, not scored):
- **One row per operation.**
  - "To Instant payments": Sending, Broadcasted, On-chain, Confirming 1/3, 2/3, then **Added**.
  - "To Savings": **Preparing** (steps 4 and 5 only), then Sending, Broadcasted, Confirming n/3, then **Received**.
- **The pending amount** is a wordless + figure beside the balance: +100.00 on the Instant row until credited;
  +25.00 on the Savings row until settled.
- **Step 1:** Savings drops by 100 at once, and the total does not dip.
- **Step 2:** A sees "Hold the phones together". A's row then reads Received, and B's Wallet shows "Payment
  detected. Final: 60.00 Winiwa".
- **Every step:** the app lands on the Wallet after Confirm send, and there are no toasts.

## 8. Falsification conditions

Any of these falsifies the named hypothesis:
- **HD1:** a credit without its load, a load credited twice, or a credit before 3 confirmations.
- **HD1 to HD5:** an Instant figure different from section 7 after any step.
- **HD3 to HD5:** an offload paying any address other than the payout address (port 3) of that wallet's own
  registration, or any amount other than section 7.
- **HD3:** T3 not spending A's load coin while that coin is the only one in the vault.
- **HD5:** a vault coin of this run still unspent at the end, or the vault not empty.
- **HD6:** the two observer nodes reporting different blocks for one TxPoW.

## 9. Exact recipe

**D0 (no coin moved):**
- the preconditions of 4.3;
- on 9101 and 9201: `status`, `coins address:<VAULT>`, `coins address:<REG>`, `txpow address:<VAULT>` and
  `txpow address:<REG>`;
- on 9101: `balance` (Winiwa) and `txnlist`;
- the two health checks and the 9201 process list;
- the installed APK hash on each phone, and every surface's fingerprint;
- each wallet's Savings and Instant figures: screenshots over adb (`adb exec-out screencap`) for A and B, a browser
  capture for C;
- logcat started on both phones (see section 10 for what it holds);
- the fixture block written.

**Steps 1 to 6** are done by the founder in the app, exactly as section 7 says. The app builds, signs and posts; no
command is typed for the wallets.

1. **A (Pixel 7 Pro):**
   1. Wallet, tap the Instant payments row, **Add from Savings**.
   2. Send opens on Savings with the recipient "My Instant payments". Type 100 and keep Winiwa.
   3. Press **Confirm send**.
2. **Both phones:** airplane mode on.
   1. B: Receive, Instant payments.
   2. A: Send, Instant payments, type 60, **Confirm send**.
   3. A enters the payment code, or chooses one when asked (law 24).
   4. At "Hold the phones together", hold them together once.
3. **QR payment:**
   1. C (laptop): Receive, Instant payments.
   2. B: Send, Instant payments, scan C's code, type 25, **Confirm send**. No code is needed.
   3. B shows the payment QR, because C has no NFC.
   4. C: Scan payment, with the laptop webcam reading B's screen.
4. **Phones back online (airplane mode off). C (laptop):**
   1. Wallet, the Instant payments row, **Move to Savings**.
   2. Send opens on Instant payments with the recipient "My Savings". Type 25.
   3. Press **Confirm send**.
5. **B (Pixel 7):** as step 4, with 35.
6. **A (Pixel 7 Pro):** as step 4, with 40.

Never press Add or Move twice for one step. A row reading **Not sent** means nothing moved; it is a stop (section 13).

**Phone captures while in airplane mode.** Airplane mode switches Wi-Fi off (Android's default), and with it
wireless adb. For the captures after steps 2 and 3, each phone is either:
- on a USB cable (adb over USB keeps working in airplane mode); or
- captured by the founder with the phone's own screenshot (power and volume down). The agent then pulls the file
  over adb once the phone is back online, before step 4, and keeps its file time.

Either way the image is the device's own, never hand-copied. Wi-Fi is not switched back on inside airplane mode
during steps 2 and 3.

**After each on-chain transaction: finding it on the observer nodes** (option (a); the agent, read-only on the
observer nodes)

1. Run `txpow address:<VAULT>` and `txpow address:<REG>` on 9101 and 9201. The new TxPoW is the one missing from the
   previous reply. Each of T1 to T6 creates a coin at REG:
   - T1, T2 and T4 create a registration;
   - T3, T5 and T6 spend one and create it again.

   So the REG search catches all six on each node. The VAULT search also catches T1, T3, T5 and T6.
2. Name it T1 to T6 by its shape against section 7: inputs and outputs, amounts, and the registration output's
   port 1 account id, which names the wallet.
3. On both nodes, run `txpow txpowid:<id>` (keep the full JSON: inputs, outputs, state), `txpow onchain:<id>` (block,
   block id, confirmations) and `txpow block:<block>`.
4. Read `coins address:<VAULT>` and `coins address:<REG>` on both nodes.
5. For a registration (T1, T2, T4), record ACCT, K and P from the new REG coin's state. For C, also run
   `checkaddress address:<P_C>` on 9101.
6. Take the wallet screenshots.
7. Wait until the app shows the step finished (Added or Received) before the next step.

**The search's scope, and its fallback.** In the Minima 1.1.2.6 source (`TxPoWSearcher.searchTxPoWviaAddress`),
`txpow address:` walks only the node's in-memory chain tree back from the tip. It has not yet been exercised on 9101
or 9201. So it is read right after each transaction, never saved for the end.

Suppose it does not return a transaction that `coins address:` shows happened (a new coin, or a coin gone). Then the
agent uses the method the pre-seed used (its closure report, anomaly e):
1. take the `created` block of the new coin from `coins address:`;
2. read `txpow block:<that block>`;
3. read `txpow txpowid:` for each transaction the block lists.

Using the fallback is recorded as an anomaly. It is not a stop.

**After steps 2 and 3 (offline):** `txpow address:` and `coins address:` on both nodes show nothing new (HD2).

**The evidence of a single credit** is the Instant figures plus the chain, not an app log line.
- **The credit waits for 3 confirmations.** During T1, A's Wallet is captured while the row reads Confirming 1/3 and
  2/3: the Instant figure is still 0.00, with +100.00 pending. Each capture is paired with the observers'
  `txpow onchain:` confirmations read at the same moment.
- **Credited once.** A's Wallet is captured at Added (100.00), and again at every later read before step 2. It must
  still read 100.00, never 200.00. The chain shows exactly one load coin carrying ACCT_A.
- **Moves to Savings, the same way.** The Instant figure drops once, the Savings figure rises once by the exact
  amount, and the chain shows the one payout.

**Option (b), the founder's alternative to (a).** A small build 104 before the run, adding one log line per record
change: load coin id, transaction id, withdrawal id, credit, debit, restore. Choosing (b) does three things:
- the build frozen at D0 becomes 104, so there is a new APK hash, both phones are reinstalled
  (`install -r`, never uninstall), and C gets a new tree;
- section 10 regains the log lines, and the search above becomes a cross-check;
- the record is re-issued as version 3 before the run.

**Closing:** the vault and registration addresses read on both nodes; each wallet's figures; the explorer pages below.

## 10. Evidence to preserve (`../evidence/STEP2-DEMO-01-R1/`)

- Run id, start and end times, the fixture block and its hash, OS and Minima versions, the build fingerprints, the
  installed APK hash on each phone, and the hashes of the tree served to C.
- **Per transaction T1 to T6:**
  - transaction id and canonical TxPoW id;
  - block number and block id **as seen by 9101 and by 9201**, and confirmations;
  - the `txpow address:` replies that found it (or the fallback reads), and the full `txpow txpowid:` JSON from both
    nodes;
  - the explorer link `https://explorer.minima.global/search?q=<txpowid>`.
- **Per registration (T1, T2, T4):** ACCT, K and P from the mined state, and for C the `checkaddress` reply from 9101.
- **Vault coins before and after every step** (coin id, amount, token, state) from both nodes, and the same for REG.
  - The vault address page
    `https://explorer.minima.global/address/0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413` is
    captured after T1 and after T6.
  - The registration page
    `https://explorer.minima.global/address/0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449` is
    captured after T6.
  - Whether the explorer shows coin state is unknown; it is noted either way.
- Each wallet's Savings and Instant figures before and after every step, never hand-copied:
  - A and B: phone screenshots taken by the agent over adb. For steps 2 and 3, a USB capture or the phone's own
    screenshot pulled over adb (section 9).
  - C: a browser capture and 9101 `balance`.
  - The T1 captures during Confirming, each paired with the observers' confirmations.
- **What the apps record.** Build 103 does not log load coin ids, seen records, withdrawal ids, debits or credits; it
  logs only refusals and failures. The records sit in each app's own store:
  - **On C,** they are saved as supplementary evidence after steps 3 and 4: `StablesInstant.snapshot().chain.records`,
    from the developer console of C's one tab, as JSON (ids, statuses, amounts, depth; no coin ids).
  - **On the release phones,** they cannot be read (no WebView debugging).
  - **Logcat** is still captured on both phones, for any refusal or failure line and the fingerprint.
  - **The offline payments** (steps 2 and 3) are evidenced by the screens of both sides: A's row Received and B's
    "Payment detected. Final: 60.00 Winiwa"; B's payment QR shown, and C's arrival of 25.
- Step durations; anything unexpected, verbatim; a closure report (standard section 8).

## 11. Effect of passing

The Instant payments load and offload are L2-demonstrated on three platforms with these valueless tokens. Pooled
custody works, a wallet that never loaded can offload, and the vault empties exactly. It supports asking for the
public post (explorer links, drafted separately and approved separately). It says nothing about security against a
modified app, which this stage does not claim (design section 4.7).

## 12. Effect of failing

A hard stop. The evidence is kept, and the funds are located and reported. Nothing is swept: every vault coin stays
withdrawable by any registered account, so a stopped run's Winiwa can always be moved back to Savings. The fix goes
into a new app iteration and a new record version.

If 1.1.1.26 refuses `keys action:new` or `txnsign publickey:` (4.4), the phones need another key source (design
section 12, the `newaddress` fallback). That is a new app iteration and a new version of this record.

## 13. Stop conditions (abort criteria)

Stop at the first of:
- any precondition in 4.3 false;
- the builds on the two phones differing, or differing from the frozen hashes;
- an app refusing to post an honest step, or the network refusing its transaction;
- a transaction not mined within 20 blocks, twice;
- the observer nodes disagreeing on a block;
- any falsifier in section 8;
- **a vault coin of this run spent by a transaction that is not T3, T5 or T6.** With no limit, anyone with a
  hand-built transaction can take from the vault. That ends the run, it is recorded, and it is exactly the trust
  statement of design section 4.7;
- an app crash or lost app data;
- the QR path failing (the path is fixed at D0; switching mid-run is a new version);
- any need to edit a node or the app's store by hand.

Build 103 makes some cases of "an app refusing to post an honest step" explicit. These add no new condition:
- a row reading **Not sent** for any step;
- a refusal of `keys action:new` or `txnsign publickey:` on 1.1.1.26 (4.4);
- a refusal on a phantom address (4.3).

In each case nothing moves, and the balances are as they were.

## 14. Evidence level sought

L2: purpose-created valueless tokens on Minima mainnet, own tests, three wallets on three platforms, one operator.

## 15. Runtime and budget

About 60 minutes:
- six on-chain transactions of about 2.5 minutes each to 3 confirmations;
- in steps 4 and 5, the registration (T2, T4) must be 3 blocks deep before the withdrawal is built. That is the same
  spend-age rule the pre-seed used, not one block. Preparing therefore lasts about 3 blocks (about 2.5 to 3 minutes),
  and each of those steps takes about 5 to 6 minutes;
- the offline steps.

The 60-minute budget holds. Budget: A loads 100 Winiwa, and all 100 leave the vault again (A +40, B +35, C +25).
Three atoms stay in the three registration coins, still owned and closable. No MINIMA is spent (feeless) and no token
is created.

## 16. Reviewer and approval state

**Reviewer:** the founder. **State: APPROVED v2, 2026-09-29.** Approval authorises one run,
`STEP2-DEMO-01-R1`, of this version, with build 103 frozen at D0. Version 1 was never approved and never run.

### Decisions this record asks for

1. **Approve version 2.** It covers:
   - the cast: A Pixel 7 Pro, B Pixel 7, C the web preview on lab node 9101 through `http://localhost:9106`, one tab;
   - the witness: 9201, as chosen for the pre-seed;
   - the amounts: 100 in; 60 by tap with the payment code, 25 by QR; 25, 35 and 40 out;
   - build 103.
2. **Finding the transactions:**
   - **(a)**, written into this version (proposed): the observer nodes' address search, with the figures plus the
     chain as the evidence of each credit;
   - **(b)**: a logging build 104 before the run; the record then becomes version 3 with the new build hash, and
     both phones are reinstalled.
3. **The QR leg:**
   - **the laptop webcam** (proposed, if it reads the phone's screen at D0);
   - or the fallback, **C in Chrome on the Pixel 7 Pro** over `adb reverse`. C is still lab node 9101's wallet, on
     another screen. The fallback needs the Pro on a USB cable, since airplane mode drops wireless adb. C's Instant
     account then lives in that Chrome, so the choice is made at D0, before C's account is used.
4. **The three registrations after the run:**
   - **keep them** (proposed: they are the wallets' standing registrations);
   - or close them as a cleanup step (a new version of this record).

---

## 17. Version history

Superseded text is kept as labelled history (standard sections 2 and 9.6). The full version 1 is the archived copy
named in the header. No part of this record has been executed.

**Version 1 (2026-09-28): DRAFT, never approved, never run.** Written before the pre-seed ran and before the feature
was built. Archived byte for byte at `v1_superseded/STEP2-DEMO-01.v1-draft-2026-09-28.md`.

**Version 2 (2026-09-29): DRAFT v2.** It applies readiness section 3 as follows.

| Readiness item | Change | Where |
|---|---|---|
| 1 | Status: the pre-seed is green, and the feature is in build 103, installed and hash-verified on both phones; build 103 is frozen at D0 | Header, 4.2, 4.3, 16 |
| 2 | Option (a): each transaction is found on the observer nodes with `txpow address:` on 9101 and 9201, then `txpowid:`, `onchain:` and `block:`. The evidence of a single credit is the Instant figures plus the chain. Option (b), a logging build 104, is named as the alternative. The version 1 text "find the canonical TxPoW from the app's logged transaction id" and the `[instant]` log-line evidence are withdrawn: build 103 does not write those lines. | 9, 10, 16 |
| 3 | Preparing lasts about 3 blocks: the registration must be 3 blocks deep. It replaced "two registrations that add a block each" | 3, 7, 15 |
| 4 | Step 2: law 24, so A enters the payment code or chooses one first; the amounts stay as registered | 3, 5, 7, 9 |
| 5 | C connects to 9101 with RPC URL `http://localhost:9106`, one tab only (the jammed-proxy lesson) | Header, 4.1, 4.3 |
| 6 | How "Test credit retired" appears (the pop-up row and one Activity row, only where an old figure existed, counted nowhere) | 4.3 |
| 7 | Tracking over the exact clean texts, with the app's phantom-address refusal; phantom addresses listed | 4.2, 4.3, 13 |
| 8 | `keys action:new` and `txnsign publickey:` are not yet proven on 1.1.1.26. A refusal shows Not sent, nothing moves, and it is a stop | 2, 4.4, 12, 13 |
| 9 | 9101 was restarted during the build, and it holds unused keys (harmless) | 4.5 |
| 10 | Corrected: 9201 runs a launcher stub (`java8path`, PID 30460) and one real JVM (PID 36080), a normal pair. The pre-seed's duplicate (PID 33600) was stopped on 2026-09-29. The `lab-node-health.mjs` check stays | 4.3, 4.5 |
| 11 | No change to the stop conditions. Build 103's explicit cases are listed under them without adding a condition | 13 |

**Also changed in version 2, beyond the readiness list** (each is needed for the record to be executable as build
103 works):
- **K, ACCT and P are run outputs.** Version 1 listed K_A, K_B, K_C (with ACCT and P) as "captured at D0". Build 103
  makes each withdrawal key at that wallet's first load or move, and the release phones expose none of the three
  beforehand. So they are recorded from each registration as it mines. HD6 and the section 8 falsifier now refer to
  the payout address fixed by that wallet's own registration, not one "frozen at D0" (3, 4.2, 8, 9, 10).
- **Airplane mode drops wireless adb.** The captures for steps 2 and 3 use USB, or the phone's own screenshot pulled
  afterwards. The Chrome-on-Pro fallback for the QR leg needs a USB cable (9, 10, 16).
- **Reference hashes.** The five reference hashes of the tree served to C are written in full (4.2).
- **The witness decision is folded into approval.** It was decision 2 in version 1. The founder chose 9201 for the
  pre-seed, and this version keeps it (16).
- **Shapes and sizes.** Section 7 names the pre-seed controls each transaction matches and their measured sizes.

**Unchanged from version 1:**
- the research question;
- the six-transaction plan and its amounts (A loads 100; offline, A pays B 60 by tap and B pays C 25 by QR; online,
  C moves 25, B moves 35 and A moves 40; the vault ends at zero);
- the witness 9201;
- the stop conditions;
- the evidence capture (with the log-line item replaced as in item 2);
- the evidence level;
- the budget.
