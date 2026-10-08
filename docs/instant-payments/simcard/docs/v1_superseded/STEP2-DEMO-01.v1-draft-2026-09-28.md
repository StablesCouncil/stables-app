# STEP2-DEMO-01: load, two offline payments and three offloads across three wallets

- **ID:** `STEP2-DEMO-01`
- **Version:** 1
- **Status:** **DRAFT, awaiting founder approval.** Not authorised to run. It also cannot run yet: the app feature
  it exercises is not built, and [`STEP2-PRESEED-01`](../STEP2-PRESEED-01.md) must first close green.
- **Run identity once approved:** `STEP2-DEMO-01-R1` (one run; standard section 6)
- **Mode:** formal evidence mode (`EXPERIMENT_GOVERNANCE_STANDARD.md` section 3)
- **Network:** Minima mainnet only; the V9 test token Winiwa (valueless)
- **Observer nodes:** lab node **9101** (RPC `http://127.0.0.1:9105`, Minima 1.0.45.15; also wallet C) and witness
  **9201** (RPC `http://127.0.0.1:9205`, observes only). The phones' own views are recorded as supplementary.
- **Confirmation rule:** the app's own rule for crediting (3 confirmations, UX law 16d); for evidence, one canonical
  block observed by both observer nodes (standard section 6.8).
- **Design:** [`step2-load-offload-design.md`](../step2-load-offload-design.md), version 2, sections 9 and 10
- **Location note:** the standard names no folder for records; the brief puts them beside the design.
  Evidence goes to `../evidence/STEP2-DEMO-01-R1/`.

---

## 1. Research question

Can a real on-chain load, two offline Instant payments and three real on-chain offloads run end to end across three
wallets on three platforms, with every Instant figure matching the chain, every payout reaching its owner's own
Savings, and the vault ending with nothing in it?

## 2. Reason for testing

It is the founder's goal of 2026-09-28: "really load the instant wallet with an onchain transaction and off load it
the same way with the receiving wallet and even more with a 3rd wallet". It is the first time the pooled vault is
used by the app, the first time a wallet that never loaded (C) takes money out that another wallet (A) put in, and
the first on-chain evidence from the phones' embedded node (1.1.1.26) for these scripts.

## 3. Hypotheses

- **HD1 (load).** T1 mines; A's app credits exactly 100.00 Winiwa to A's Instant payments once, only after 3
  confirmations, and never again for the same load coin.
- **HD2 (offline).** With both phones in airplane mode, A pays B 60 by tap and B pays C 25 by QR; the Instant
  figures become A 40, B 35, C 25. Nothing reaches the chain.
- **HD3 (pooled offload).** C's app registers (T2) and then withdraws (T3), spending **A's load coin**: C's
  Savings (lab node 9101) gains exactly 25, C's Instant payments show 0, the vault holds 75 in one coin.
- **HD4.** B's app registers (T4) and withdraws (T5): B's Savings gains exactly 35, B's Instant 0, the vault 40.
- **HD5 (vault to zero).** A's app withdraws (T6) with the registration made in T1: A's Savings gains exactly 40,
  A's Instant 0, and **the vault holds no coin**.
- **HD6 (chain agreement).** T1 to T6 are each seen by 9101 and 9201 in the same canonical block, and every payout
  output pays the Savings address frozen for that wallet at D0.

## 4. Exact initial conditions

### 4.1 Cast

| Wallet | Device | Savings (node) | Instant account | Payments |
|---|---|---|---|---|
| **A** | Pixel 7 Pro, standalone app, release-signed | its embedded node (1.1.1.26) | a fresh v2 account (scheme 0x05) | NFC |
| **B** | Pixel 7 (GrapheneOS), standalone app, the same build | its embedded node (1.1.1.26) | a fresh v2 account | NFC with A, QR with C |
| **C** | web preview on the laptop, `http://localhost:8080/dapp/3-test/`, against lab node 9101 over RPC and its CORS proxy | lab node 9101's wallet | a fresh v2 account in the browser | QR (the laptop webcam reads B's payment QR; the path is fixed at D0, see decision 4) |

### 4.2 Addresses and identities

| Name | Value |
|---|---|
| Registration v2 (REG) | `0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449` (`MxG082J6T2PS1QV22QJ82MFCHDNG5EG2PBGF1TCNTHWPYDDNCCSHT2K96PU118J`) |
| Vault v2 (VAULT) | `0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413` (`MxG08727WKV4J7YNN29MTCM9MGKB85EENR9SRFT6UUSTAQNCMNB799K2EU5DAJE`) |
| Winiwa | `0xD4F5DD3546F25D327CBF2B6867E193CE5DB6491AC9C65BBDCECACA1A6688063F` |
| Clean texts (what every app registers) | `kiss/step2/instant_registration_v2.clean.txt` SHA-256 `a033264f9442cded205a8f7224d41e2387763148e2138351b2e0fbf541ce2d9e`; `kiss/step2/instant_vault_v2.clean.txt` SHA-256 `e63e0452b1a3d3e641f7b3016e1318070e0291223e0dae48a74f826bc0b76f6a` |
| Addresses computed by | Minima 1.0.45.15 live (`runscript` clean form on 9101) and in-process on the 1.0.45.15 and 1.1.2.6 jars, all agreeing (`step2v2_addresses.json`); proven spendable by STEP2-PRESEED-01 |
| Per wallet, captured at D0 | Savings payout address P_A, P_B, P_C (port 3); account id ACCT_A/B/C (SHA-256 of the v2 Instant P-256 public key, port 1); withdrawal key K_A/K_B/K_C (port 2, made by each app with `keys action:new`) |
| Build, captured at D0 | the step 2 feature build: `APP_BUILD_ITERATION`, the APK SHA-256 on each phone, the SHA-256 of `dapp/3-test/` served to C, and each surface's `[STABLES-FINGERPRINT]` line |

### 4.3 Preconditions (all checked at D0; any failure stops before T1)

- STEP2-PRESEED-01-R1 closed green; its final reads show nothing of its own at REG or VAULT.
- `coins address:<VAULT>` on 9101 and 9201 returns **no coin**. (Anyone can send coins to a public address. If a
  foreign coin is there, stop and ask: the app could pick it and the 100, 75, 40, 0 sequence would no longer be the
  one registered.)
- Both phones on the same frozen build (force-stop, `adb install -r`, never uninstall), both with fresh v2 Instant
  accounts at 0, and "Add test credit" retired (the old figure shown once as "Test credit retired").
- C's preview served by `dev-up.ps1 -DevNodes 2`, lab nodes 9101 and 9201 healthy (`lab-node-health.mjs`), tips
  within 2 blocks; every app tracks the vault (clean form) before T1.
- A's Savings holds at least 100.00000001 Winiwa in coins the app can use; B and 9101 each hold at least one atom of
  Winiwa for their registration (all three wallets have faucet Winiwa).
- Fixture block (4.2, "captured at D0") written into the evidence folder and hashed. Nothing in it changes after T1.

## 5. Independent variables

The wallet acting, the platform (embedded 1.1.1.26 node, lab node over RPC), the amounts, the payment channel (NFC,
QR), the network state of each device (online, airplane mode), and whether the offloading wallet ever loaded (A yes;
B and C no).

## 6. Dependent variables

For every on-chain transaction: transaction id, canonical TxPoW id, block number and block id on 9101 and 9201,
confirmations, inputs and outputs (coin ids, addresses, amounts, state), size. For every step: the vault's and the
registration address's unspent coins before and after (both observer nodes), each wallet's Savings and Instant
figures before and after, the activity rows and statuses each app shows, and the time each step takes.

## 7. Expected results (the step board)

| Step | Who, how | On-chain | Vault after | Instant A / B / C after | Savings change |
|---|---|---|---|---|---|
| 1 | **A adds 100 from Savings** (Pixel 7 Pro, online) | **T1**: A's Savings coins in; out: VAULT 100 (load coin L, state: magic, ACCT_A, K_A, P_A, currency), REG 0.00000001 (A's registration), change to A | 100 (one coin, L) | 100 / 0 / 0 (credited at 3 confirmations) | A: -100.00000001 |
| 2 | **A pays B 60 by tap** (both phones in airplane mode) | none | 100 | 40 / 60 / 0 | none |
| 3 | **B pays C 25 by QR** (C on the laptop shows its receiver code, B scans, B shows the payment QR, the laptop reads it) | none | 100 | 40 / 35 / 25 | none |
| 4 | Phones back online. **C moves 25 to Savings** (laptop) | **T2**: C's registration (9101 Savings, 0.00000001 to REG). **T3**: in: C's registration, **A's load coin L** (100); out: P_C 25, VAULT 75 (no state), C's registration again | 75 (one coin) | 40 / 35 / 0 | C (9101): +25, -0.00000001 |
| 5 | **B moves 35 to Savings** (Pixel 7) | **T4**: B's registration. **T5**: in: B's registration, the 75 coin; out: P_B 35, VAULT 40, B's registration | 40 (one coin) | 40 / 0 / 0 | B: +35, -0.00000001 |
| 6 | **A moves 40 to Savings** (Pixel 7 Pro; registered in T1) | **T6**: in: A's registration, the 40 coin; out: P_A 40, A's registration (no change output) | **nothing** | 0 / 0 / 0 | A: +40 |

At the end every unit that went into the vault has come out, to three different wallets. The three registration
coins (one atom each) stay, owned and closable by their owners. The shapes of T3, T5 and T6 with these exact
amounts were measured in-process (`DEMO_T3_C_withdraws_25_from_A_load_of_100` 88/31,
`DEMO_T5_B_withdraws_35_from_change_75` 88/31, `DEMO_T6_A_withdraws_40_vault_to_zero` 93/28 instructions, all
valid; and `NEG_DEMO_T6_A_registration_paying_C` refused). Size estimates: T1 8.1 KB, T2 and T4 7.9 KB, T3 and T5
11.0 KB, T6 10.8 KB (`step2v2_txn_sizes.json`).

What each person sees (design section 9, informational, recorded not scored): one row per operation, "To Instant
payments" then Added, "To Savings" with Preparing (steps 4 and 5 only) then Received; the pending amount as a
wordless + figure; landing on the Wallet after Confirm; no toasts.

## 8. Falsification conditions

Any of: a credit without its load, or a load credited twice, or credited before 3 confirmations (HD1); an Instant
figure different from section 7 after any step (HD1 to HD5); an offload paying any address other than that wallet's
frozen payout, or any amount other than section 7 (HD3 to HD5); T3 not spending A's load coin while that coin is
the only one in the vault (HD3); a vault coin of this run still unspent at the end, or the vault not empty (HD5);
the two observer nodes reporting different blocks for one TxPoW (HD6).

## 9. Exact recipe

**D0 (no coin moved):** preconditions 4.3; `status` and `coins address:<VAULT>` / `coins address:<REG>` on 9101 and
9201; each wallet's Savings and Instant figures (screenshots over adb, `adb exec-out screencap`, and a browser
capture for C); `balance` of Winiwa on 9101; logcat started on both phones (`[instant]` lines); fixture block written.

**Steps 1 to 6** are done by the founder in the app exactly as section 7 says (Wallet, Instant payments, **Add from
Savings** or **Move to Savings**, amount, Confirm send; Send, Instant payments, tap or QR for the payments). The app
builds, signs and posts; no command is typed for the wallets.

**After each on-chain transaction** (the agent, read-only on the observer nodes): find the canonical TxPoW from the
app's logged transaction id (the preliminary id at post can differ, `XN-MAIN-001-R1`); on 9101 and 9201 run
`txpow txpowid:<id>` (keep the full JSON: inputs, outputs, state), `txpow onchain:<id>` and `txpow block:<block>`;
read `coins address:<VAULT>` and `coins address:<REG>` on both; take the wallet screenshots. Wait until the app shows
the step finished (Added or Received) before the next step.

**Closing:** the vault and registration addresses read on both nodes; each wallet's figures; the explorer pages below.

## 10. Evidence to preserve (`../evidence/STEP2-DEMO-01-R1/`)

- Run id, start and end times, the fixture block and its hash, OS and Minima versions, the build fingerprints.
- **Per transaction T1 to T6:** transaction id, canonical TxPoW id, block number and block id **as seen by 9101 and by
  9201**, confirmations, the full `txpow txpowid:` JSON from both, and the explorer link
  `https://explorer.minima.global/search?q=<txpowid>`.
- **Vault coins before and after every step** (coin id, amount, token, state) from both nodes, and the same for REG.
  The vault address page `https://explorer.minima.global/address/0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413`
  captured after T1 and after T6; the registration page
  `https://explorer.minima.global/address/0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449`
  after T6. (Whether the explorer shows coin state is unknown; noted either way.)
- Each wallet's Savings and Instant figures before and after every step: phone screenshots taken by the agent over
  adb, never hand-copied; C by browser capture and 9101 `balance`.
- The apps' `[instant]` log lines: load coin ids, the `load:<coinid>` seen records, withdrawal ids, debits, credits;
  the offline payment records for steps 2 and 3.
- Step durations; anything unexpected, verbatim; a closure report (standard section 8).

## 11. Effect of passing

The Instant payments load and offload are L2-demonstrated on three platforms with these valueless tokens: pooled
custody works, a wallet that never loaded can offload, and the vault empties exactly. It supports asking for the
public post (explorer links, drafted separately and approved separately). It says nothing about security against a
modified app, which this stage does not claim (design section 4.7).

## 12. Effect of failing

A hard stop, the evidence kept, the funds located and reported (nothing is swept: every vault coin stays
withdrawable by any registered account, so a stopped run's Winiwa can always be moved back to Savings). The fix goes
into a new app iteration and a new record version.

## 13. Stop conditions (abort criteria)

Stop at the first of: any precondition in 4.3 false; the builds on the two phones differ or differ from the frozen
hashes; an app refuses to post an honest step, or its transaction is refused by the network; a transaction not mined
within 20 blocks, twice; the observer nodes disagreeing on a block; any falsifier in section 8; **a vault coin of
this run spent by a transaction that is not T3, T5 or T6** (with no limit, anyone with a hand-built transaction can
take from the vault; that ends the run, it is recorded, and it is exactly the trust statement of design section
4.7); an app crash or lost app data; the QR path failing (the path is fixed at D0; switching mid-run is a new
version); any need to edit a node or the app's store by hand.

## 14. Evidence level sought

L2: purpose-created valueless tokens on Minima mainnet, own tests, three wallets on three platforms, one operator.

## 15. Runtime and budget

About 60 minutes: six on-chain transactions of about 2.5 minutes each to 3 confirmations, two registrations that
add a block each (Preparing), and the offline steps. Budget: A loads 100 Winiwa; all 100 leave the vault again
(A +40, B +35, C +25); three atoms stay in the three registration coins, still owned and closable. No MINIMA
(feeless), no token creation.

## 16. Reviewer and approval state

**Reviewer:** the founder. **State: DRAFT, awaiting founder approval.** Approval authorises one run,
`STEP2-DEMO-01-R1`, of this version, after STEP2-PRESEED-01 closes green and the build is frozen at D0.

### Decisions this record asks for

1. Approve the record, the cast (A Pixel 7 Pro, B Pixel 7, C the web preview on lab node 9101) and the amounts
   (100 in; 60 and 25 offline; 25, 35 and 40 out).
2. The witness node: DevNodesSet 9201 (proposed) or a phone.
3. Registrations after the run: keep them (proposed: they are the wallets' standing registrations) or close them
   as a cleanup step (a new version of this record).
4. The QR leg: the laptop webcam (proposed, if it reads the phone's screen at D0) or the registered fallback, C in
   Chrome on the Pixel 7 Pro over `adb reverse` (then C is still lab node 9101's wallet, on another screen).
