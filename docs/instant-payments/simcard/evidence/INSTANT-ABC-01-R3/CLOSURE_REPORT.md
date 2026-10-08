# INSTANT-ABC-01-R3: closure report

- **Record:** `experiment-record.md` (R3 version, written before the first post of R3; R1's hypotheses, board,
  falsifiers and stop conditions unchanged). Standing founder authority of 2026-10-03 for the laptop test nodes.
- **Run:** `INSTANT-ABC-01-R3`, formal evidence mode. R1 and R2 stopped on app defects (below) and are kept.
- **Started:** 2026-10-03T16:20Z (P0). **Ended:** 2026-10-03T17:16Z (closing reads). About 56 minutes.
- **Result:** **GREEN for H1 to H6**, with one open display defect (F3) and lab-node restarts recorded.
- **Network:** Minima mainnet, Winiwa V9 (valueless test token), 100.00000002 Winiwa into the covenants, 25 back out.

## Environment and frozen inputs

| Item | Value |
|---|---|
| OS | Windows 11 Home 10.0.26300 x64 |
| Node.js | v25.8.0 |
| Browser | headless Chrome 154.0.8037.95, three profiles `prof3/A|B|C`, own fake cameras |
| App | Stables 3-test v0.0.12.012 (`APP_BUILD_ITERATION` 12), http://localhost:8080/dapp/3-test/; hashes in the record |
| Nodes | DevNodesSet 9101 (A), 9201 (B), 9301 (C), Minima 1.0.45.15; CORS proxies 9106 / 9206 / 9306 |
| Tips at P0 | all three 2,347,263 after 9301's restart (16:23Z); vault read at 2,347,284 |
| Health at P0 | 9101 and 9201 healthy (3.7 s); 9301 slow (5.4 s) |
| Gates on the tree | `verify-instant-balance.mjs` PASS; `verify-instant-qr-readable.mjs` PASS (412 and 360 px); four- and three-platform parity PASS; RULE 0 hook exit 0 |
| Covenants | VAULT `0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413`, REG `0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449` |
| Start figures | V0 2,802.879998 Winiwa (5 coins); REG 4 atoms Winiwa; S_A0 5,837.88215198; S_B0 3,790.13134199; S_C0 1,077.99999799; Instant 0 / 0 / 0 |

## Results by hypothesis

| Hypothesis | Result | Evidence |
|---|---|---|
| **H1** Add | **PASS** | Load `0x00031EC3...CD7A9` mined in 2,347,290 (block id `0x0000005DFB19...99BA` on all three nodes); 100 to VAULT (state kept) + 1 atom to REG + change; A credited 100 at 3 confirmations ("Added"). A first press was cut off by the lab proxy before posting (app: "Not sent"; nothing moved, no draft left). |
| **H2** A pays B 40 by QR | **PASS** | Both QR codes read by the receiving profile's own camera; A 60.00, B 40.00 within 2 s of B's scan; nothing on chain. |
| **H3** B pays C 25 by QR (multi-hop) | **PASS** | B 15.00, C 25.00; nothing on chain. |
| **H4** Remove | **PASS** | Registration `0x0000A662...BC06C` (2,347,302) then withdrawal `0x000050FB...200C1` (2,347,310), both on all three nodes; 25 to C's payout; C's Instant 0, Savings +24.99999999. First Remove proven from the app under a formal record. |
| **H5** Refusals | **PASS (4/4)** | N3, N1, N4 refused by the receiving app with the balance unchanged; N2 refused in place (button disabled with the reason). Nothing posted for any. |
| **H6** Conservation | **PASS** | 100 = 25 + 60 + 15 + 0; vault +75.00000000; sum of all account changes 0.00000000; burn 0 on all three posts; 2 atoms parked in registrations (`reconciliation.md`). |

## Honest controls (story posts)

| Post | Transaction id | Canonical TxPoW id | Block | Block id (identical on 9101, 9201, 9301) | Confirmations at final read (9101 / 9201 / 9301) | In / out | Burn |
|---|---|---|---|---|---|---|---|
| Load (A) | in `reconcile-data.json` | `0x00031EC30847F7DC97E88493A9E1FD1527AE922AA58DEDBFE892A74CA52CD7A9` | 2,347,290 | `0x0000005DFB19AB3A9FDC1A5746273D085B277792489CB8C6507455A9279099BA` | 4 / 4 / 4 (at 16:43Z) | 1 / 3 | 0 |
| Registration (C) | in `reconcile-data.json` | `0x0000A662FA097121F1BF9D5CAA7E96ADEC9DDC07D1AF856203599DA49ACBC06C` | 2,347,302 | `0x00000000D95AADE559F67F58A694BE6CD78FA8BC268FB12CA574B868792DA4CE` | 36 / 36 / 30 | 1 / 2 | 0 |
| Withdrawal (C) | in `reconcile-data.json` | `0x000050FBFF5830837CDC1BC4263C89051DEC5E568AE30CE04220EFAAC97200C1` | 2,347,310 | `0x00000024134F132D54CF271B5E4DA7DE41D3A717FBB8FEDADA0E9F869D7B0032` | 28 / 28 / 22 | 2 / 3 | 0 |

Explorer: https://explorer.minima.global/search?q=0x00031EC30847F7DC97E88493A9E1FD1527AE922AA58DEDBFE892A74CA52CD7A9 ,
https://explorer.minima.global/search?q=0x0000A662FA097121F1BF9D5CAA7E96ADEC9DDC07D1AF856203599DA49ACBC06C ,
https://explorer.minima.global/search?q=0x000050FBFF5830837CDC1BC4263C89051DEC5E568AE30CE04220EFAAC97200C1 ,
vault https://explorer.minima.global/address/0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413 .
The explorer pages were not opened in this run (links recorded).

### VAULT and REG (Winiwa), identical on 9101 and 9201 at every read

| After | VAULT | REG |
|---|---|---|
| P0 | 2,802.879998 (5 coins) | 0.00000004 |
| Step 1 | 2,902.879998 (6 coins; + load coin `0x7456864E...D397` 100) | 0.00000005 |
| Steps 2, 3 | unchanged | unchanged |
| Step 4 | 2,877.879998 (6 coins; vault coin `0x98249121...1864` 75 spent, change `0x3892E8DD...EFF` 50) | 0.00000006 |

## Closure report (standard section 8)

1. **Question answered.** Yes. The Instant payments account works end to end from the real web UI on three wallets:
   an Add, two QR payments (the second spending money received offline), a Remove by a wallet that never Added, and
   every unit reconciles.
2. **Tests run and not run.** Run: P0, steps 1 to 4, N1 to N4, closing reads. Not run: nothing in the record.
3. **Evidence level achieved.** **L2** for these flows on the web build: valueless mainnet token, one operator, own
   tests, canonical blocks seen by three registered nodes. Not L3.
4. **Findings.**
   - F1, F2: two defects found and fixed during this campaign (R1, R2), each with a gate that fails on the old build.
   - **F3 (open):** during a Remove's "received, not settled" window the Savings figure adds the amount on top of a
     node balance that already includes it. Mechanism: `instant-balance.js` `rowForChain` marks the row
     `instantSettling` until depth 4 (`settled`); `activity-contacts.js` `incomingRowOverlayAmt` adds the full amount
     for any settling row whose `txConfirmations` is null, which is always the case for an Instant row
     (`minimaOnChain: false`); the node counts the payout coin at depth 3. Options: (a) give the Instant "To Savings"
     row its confirmations (block and tip) so the overlay stops at the node's coin depth, as on-chain receipts do;
     (b) mark it `balanceAlreadyApplied` from "received" (risk: a short dip while the Savings read catches up).
     Recommended (a). It changes how the Savings figure is built, so it waits for the founder.
   - The QR leg works with whole-pixel codes of 138 px inside the 202 px frame at 1x; a larger code needs a smaller
     frame padding or a wider frame (founder's choice).
   - The withdrawal spent a vault coin made by an earlier withdrawal (the vault is pooled): reconciliation is by total.
5. **Falsifiers and anomalies.** No falsifier met. Anomalies (none a stop under the record):
   - (a) 9301 stopped taking new blocks a few minutes after each start (since its MegaMMR resync); restarted at P0,
     after step 1, before step 4 and twice during step 4 (`lab-actions.log`); C's app carried on by itself each time.
   - (b) Step 1's first press failed on the lab proxy (`cors-rpc-proxy: read ECONNRESET`); the app said "Not sent",
     nothing moved; pressed again.
   - (c) The first tap after a notice is absorbed (UX law); a second tap on Receive was needed in N3 and N1.
   - (d) The Remove screen rounds Savings down (1,077.99) where the Wallet rounds to nearest (1,078.00).
6. **Missing evidence.** No screen capture of the Savings row while it read 1,128.00 (only the follow log's read of
   the page, 16:59:54Z to 17:14:33Z). Explorer pages not opened. 9301's own console log was not kept.
7. **Architectural impact.** The Stage 1 design (pooled vault, registration per account and currency, automatic
   registration, QR as the web channel) holds in the app. The Remove path (.110 picker fix) is proven on chain.
8. **Budget and time.** About 56 minutes for R3 (whole campaign R1 to R3 about 3 hours). 3 posts in R3 (plus 3 in R2's
   exploratory pass); 100.00000002 Winiwa into covenants, 25 out; 0 MINIMA spent.
9. **Recommendation.** **Close green** for the story; open F3 for the founder (recommended option a), and replace or
   re-seed the 9301 lab node before the next run that depends on it.
10. **Knowledge-base and handshake updates required** (not made here; founder review): `HANDOFF_2026-09-29.md` state
    (Remove and QR leg proven on the web build, builds .011/.012); `TRACEABILITY_MATRIX.md` (the app flows at L2);
    memory note for the offline payment account; the UX laws file if the founder rules on F3.

## Evidence index

| Path | Contents |
|---|---|
| `trace.html` | The story as one page (timeline, A/B/C, balances, chain links, refusals, reconciliation) |
| `run-log.md` | Timestamped narrative |
| `reconciliation.md` | Conservation table, every coin, fees |
| `steps/00-p0` ... `steps/05-closing` | Screens, `balances.json`, `chain.json`, vault reads, console logs, UI action logs |
| `lab-actions.log` | Every 9301 restart with tips before and after |
| `raw/` | CDP and node scripts; `commands.jsonl.gz` (every node command and reply) |
