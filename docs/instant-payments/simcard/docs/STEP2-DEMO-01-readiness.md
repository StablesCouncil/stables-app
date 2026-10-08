# STEP2-DEMO-01: readiness note for build 103

- **For:** the founder's approval of [`STEP2-DEMO-01`](STEP2-DEMO-01.md) (version 1, DRAFT). This note does not change
  the record and does not run it. It says what is ready, what you do on each device, and where the record no longer
  matches how build 103 actually works.
- **Written:** 2026-09-29, after build 103 was built and tested. **Nothing was posted to the chain.**

## 1. What is ready

| Item | State |
|---|---|
| Pre-seed gate | `STEP2-PRESEED-01-R1` closed **green** (2026-09-29). Both covenants are proven spendable at their final addresses: REG `0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449`, VAULT `0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413`. |
| The app feature | Built in **v0.0.11.103** (`APP_BUILD_ITERATION` 103). The pop-up has "Add from Savings" and "Move to Savings". The first load in a currency makes the registration and a dedicated `keys action:new` key. A load is credited once per load coin id at 3 confirmations. A move to Savings debits first, registers if needed, and gives the debit back only while nothing was posted. The test credit is retired with a fresh account (scheme 0x05). |
| Transaction shapes | Command for command the mined pre-seed controls: T1 = H01, T2/T4 = the registration part of H01, T3/T5 = H02, T6 = H05. The unit suite checks this against the run's own `commands.jsonl`. On lab node 9101, the app built the load (T1's shape, 5 Winiwa plus the registration atom), and the real node's `txncheck` gave all four flags **true**. The built transaction was then deleted, never posted. |
| **APK (standalone, release)** | `Stables_v0.0.11.103.apk`, **SHA-256 `850bb9567ac7dcfc429b58d6ab135251f47ae17559df54335f338872580577f2`**, signer `dabb1b2a79b134b6008e6401735d649c140b51f2c4a83eb001b2ffdad5ce5dd4`, versionCode 11103. |
| Phones | Installed 2026-09-29 04:21 on **both**: clean node shutdown, force-stop, `install -r`, never uninstalled. The installed hash equals the build hash on the Pixel 7 Pro (A) and the Pixel 7 (B). The Pixel 7 has been opened on 103 (Wallet at Instant 0.00, fingerprint `"version":103,"instantChain":"direct"`). The Pixel 7 Pro was locked and has not been opened on 103 yet. |
| Web preview (C) | The same tree, served at `http://localhost:8080/dapp/3-test/`. Reference hashes for D0: `index.html` `0eecd1b8…13b5`, `assets/instant-chain.js` `6b6aa7e4…10c4`, `assets/instant-balance.js` `91e3d06b…85f6`, `assets/instant-protocol.js` `e5a54de0…ce41`, `assets/config/runtime-config.js` `29acf3ed…60b6`. |
| Evidence of the build | `stream_3_governance/task_test_channel/evidence/instant-payments-step2/2026-09-29/` (web runtime 24/24, law 24 9/9, the gate on 103 and on 102, phone install log). |

## 2. What you do on each device (as build 103 presents it)

**D0, before step 1 (the agent does the reads; you only open the apps):**
- Open Stables on the Pixel 7 Pro and the Pixel 7. Each shows Instant payments at 0.00.
- On a phone that had test credit, tap the Instant payments row: the pop-up lists the old figure as "Winiwa · Test credit retired". Activity has one row, "Test credit retired". None of it is counted.
- On the laptop, open the preview in **one** browser tab and keep that browser profile for the whole run: C's Instant payments live in that browser's storage. Connect it to lab node 9101 (Connect, RPC URL `http://localhost:9106`; see 3.5).

**Step 1, A adds 100 (Pixel 7 Pro, online):** Wallet, tap the Instant payments row, **Add from Savings**. Send opens on Savings with the recipient "My Instant payments". Type 100, keep Winiwa, press **Confirm send** (Standard pay, no code). You land on the Wallet:
- one row "To Instant payments": Sending, then Broadcasted, On-chain, Confirming 1/3, 2/3, then **Added**;
- the Instant Winiwa row shows **+100.00** beside 0.00 until it is credited, then 100.00;
- Savings drops by 100 at once, and the total does not dip.

**Step 2, A pays B 60 by tap (airplane mode on both):**
- B: Receive, Instant payments.
- A: Send, Instant payments, type 60, **Confirm send**. 60 is above the quick-pay limit (50 by default), so **law 24 asks for the payment code**; if A has none yet, the app asks A to choose one.
- A sees "Hold the phones together". Hold them together once. A's row reads Received; B's Wallet shows "Payment detected. Final: 60.00 Winiwa".

**Step 3, B pays C 25 by QR:** unchanged from build 102:
- C (laptop): Receive, Instant payments.
- B: Send, Instant payments, scan C's code, type 25, Confirm send (no code). B shows the payment QR, because C has no NFC.
- C: Scan payment, with the laptop webcam reading B's screen.

**Step 4, C moves 25 to Savings (laptop, phones back online):**
- Wallet, the Instant payments row, **Move to Savings**. Send opens on Instant payments with the recipient "My Savings". Type 25, Confirm send.
- You land on the Wallet with one row "To Savings" reading **Preparing** while C's registration goes on chain and ages 3 blocks (about 3 minutes).
- Then Sending, Broadcasted, Confirming n/3, **Received**. The Savings Winiwa row shows **+25.00** until it settles.

**Step 5, B moves 35 to Savings (Pixel 7):** the same steps as step 4, with the same Preparing, then Received.

**Step 6, A moves 40 to Savings (Pixel 7 Pro):** the same steps, with no Preparing (A registered in step 1). The vault is then empty.

**Never** press Add or Move twice for one step. If a row reads **Not sent**, nothing moved and the balance is as it was. That is a stop condition (record section 13).

## 3. What the record needs changing, given how build 103 works

These are proposals for version 2 of the record, for you to approve. The record itself is untouched.

1. **Status line and section 16:** "It also cannot run yet: the app feature it exercises is not built, and STEP2-PRESEED-01 must first close green". Both are now true: the pre-seed is green and the feature is in build 103. The build to freeze at D0 is 103, with the APK hash above.
2. **Section 9, "find the canonical TxPoW from the app's logged transaction id"** and **section 10, "The apps' `[instant]` log lines: load coin ids, the `load:<coinid>` seen records, withdrawal ids, debits, credits"**: build 103 **does not write these to the log**. It logs only refusals and failures. The records exist in each app's own store, but:
   - on C they can be read through `StablesInstant.snapshot().chain.records` (ids, statuses, amounts, depth, but no coin ids);
   - on the release phones they cannot be read at all (no WebView debugging).

   Two options:
   - **(a)** change the procedure to find each T on the observer nodes: `txpow address:<VAULT>` and `txpow address:<REG>` on 9101 and 9201 catch all six, then `txpow txpowid:`, `onchain:` and `block:` as written. The evidence of a single credit becomes the Instant figures plus the chain.
   - **(b)** approve a small build 104 before the run, adding one log line per record change (load coin id, transaction id, withdrawal id, credit, debit, restore).

   Proposed: (b) if the log is wanted as evidence, otherwise (a).
3. **Section 7, steps 4 and 5, and section 15, "two registrations that add a block each":** the app builds the withdrawal only once the new registration coin is **3 blocks deep**. That is the same spend-age rule the pre-seed used, not one block. So Preparing lasts about 3 blocks (about 2.5 to 3 minutes), and each of steps 4 and 5 takes about 5 to 6 minutes. The 60-minute budget still holds.
4. **Section 7, step 2 (new since the record was drafted):** law 24 (2026-09-29) applies. A 60 Winiwa payment by tap is above quick pay, so A is asked for the payment code at Confirm send, or to choose one first. The record should say so. Otherwise A may choose to pay 50 or less, or raise the quick-pay limit, and both would change the registered amounts.
5. **Section 4.1, C:** the preview's built-in browser bridge points at `http://localhost:9006` (the Test12 treasury ladder), not at 9101. For C to be lab node 9101's wallet, the preview must be connected with RPC URL `http://localhost:9106` (localStorage `stables_rpc_url`). Keep **one** app tab open on it. The 9106 proxy forwards over a single upstream socket, and during this build several open tabs jammed it until the proxy was restarted. The record should name the RPC URL and the one-tab rule.
6. **Section 4.3, "the old figure shown once as Test credit retired":** it is shown in the Instant payments pop-up (currency rows, static) and as one Activity row. It appears only on a device whose old account held a non-zero figure. The preview used for C has none, so it shows nothing.
7. **Section 4.3, "every app tracks the vault (clean form) before T1":** each app runs `newscript trackall:true` over the exact clean texts on its first pass after its node connects, and again before any build. It checks the address the node answers and refuses everything on a phantom. On 9101 the answered addresses were the frozen ones (runtime check).
8. **Not yet proven on the phones' embedded node (1.1.1.26):** `keys action:new` (first used by T1 on A) and `txnsign publickey:<that key>` (first used on a phone by T5 on B). If either is refused, the app stops before posting and the row reads Not sent, so nothing moves. Under section 13 that is a stop ("an app refuses to post an honest step").
9. **Lab node 9101** was restarted during this build (it wedged under load; only 9101 and its proxy were restarted). The harness runs made a few unused keys on it with `keys action:new`. The loads they built were deleted, never posted, so its Winiwa is unchanged. C's withdrawal key will be another new key, made at C's first move.
10. **Witness 9201:** two JVMs were running on its data folder, as in the pre-seed (anomaly b there). Stop the lingering one and check it with `lab-node-health.mjs --rpc 9205 --proxy 9206` before D0.
11. **Section 13 stop conditions:** no change needed. Build 103 treats a vault coin taken by someone else as the design says. The loser's withdrawal is refused with "input already spent" and rebuilt with other coins under the same id. In the demo there is only one vault coin, so that case is the stop the record already names.

## 4. What still waits for you

- Approve STEP2-DEMO-01 (with the changes in section 3, or as it stands).
- Choose 3.2 (a) or (b).
- Confirm the QR leg (record decision 4) and the witness (decision 2).
- The machinery decision record D061 (proposed) is separate and does not block the run.
