# INSTANT-ABC-01-R3: Instant payments A -> B -> C on three laptop nodes (the clean run)

**Open `trace.html` first** (one self-contained page, no server needed; light and dark). Screenshots of it:
`trace-1280-light.png`, `trace-1280-dark.png`, `trace-390-light.png`, `trace-390-dark.png`.

## What was tested
Real Winiwa (V9 test token `0xD4F5DD35...063F`, valueless) on Minima mainnet, driven only through the real app
screens (clicks and typing over CDP; reads for evidence only), three separate browser profiles, each on its own node:

1. A takes 100 Winiwa from Savings into Instant payments (Add).
2. A pays B 40 instantly by QR code.
3. B pays C 25 instantly by QR code, out of the money B just received (multi-hop).
4. C moves its 25 back on chain into C's Savings (Remove).

Plus four refusals: the same payment accepted twice (N3), the same signed payment shown again and read again (N1),
a payment read by the wrong person (N4), a Remove of more than held (N2).

**How the QR codes moved:** each profile has its own fake camera (Chrome `--use-file-for-fake-video-capture`). To
"show" a code, the showing profile's screen is captured and cropped to the code's frame; that image becomes the other
profile's camera before its scanner opens; the app's own scanner (jsQR) reads it. No paste, no internal call.
Scripts: `raw/pay.mjs`, `raw/qrcam.mjs`.

## Build and environment
- Stables 3-test **v0.0.12.012** (`APP_BUILD_ITERATION` 12), local preview http://localhost:8080/dapp/3-test/, file
  hashes in `experiment-record.md`. Unpublished, uncommitted.
- Nodes: DevNodesSet 9101 (A), 9201 (B), 9301 (C), Minima 1.0.45.15; CORS proxies 9106/9206/9306.
- Browsers: headless Chrome 154, profiles `prof3/A|B|C` (CDP 9341/9342/9343). OS Windows 11 (10.0.26300), Node.js 25.8.

## Verdict per step

| Step | Verdict | Chain |
|---|---|---|
| 1 A adds 100 | **PASS** (second press; the first was cut off by the lab proxy before posting, "Not sent", nothing moved) | Load `0x00031EC30847F7DC97E88493A9E1FD1527AE922AA58DEDBFE892A74CA52CD7A9`, block 2,347,290, seen by 9101, 9201, 9301 |
| 2 A pays B 40 (QR) | **PASS** | none (offline) |
| 3 B pays C 25 (QR, multi-hop) | **PASS** | none (offline) |
| 4 C removes 25 | **PASS** (value, chain, end state). Display defect while settling: see F3 | Registration `0x0000A662FA097121F1BF9D5CAA7E96ADEC9DDC07D1AF856203599DA49ACBC06C` (block 2,347,302); withdrawal `0x000050FBFF5830837CDC1BC4263C89051DEC5E568AE30CE04220EFAAC97200C1` (block 2,347,310); both seen by all three nodes |
| N3 same payment accepted twice | **Refused** ("This payment was already received.") | none |
| N1 same signed payment shown again | **Refused** (same text, same signature) | none |
| N4 wrong payee | **Refused** ("This payment is for another account. It was not credited.") | none |
| N2 Remove 26 holding 25 | **Refused in place** (button disabled with the reason) | none |
| Reconciliation | **Exact**: 100 = 25 + 60 + 15 + 0; vault +75.00000000; sum of all changes 0.00000000; fees 0 | `reconciliation.md` |

End state: Instant A 60.00, B 15.00, C 0.00. Savings A 5,737.88215197 (-100.00000001), B unchanged, C 1,102.99999798
(+24.99999999). Explorer: vault https://explorer.minima.global/address/0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413

## Findings
- **F1 (fixed in 0.0.12.011, found in R1):** the Instant QR codes were drawn larger than their frame and clipped; the
  app's own scanner could not read them from a screen. Gates: `work/tools/verify-instant-qr-readable.mjs` (runtime) and
  `verify-instant-balance.mjs` block 0.0.12.011.
- **F2 (fixed in 0.0.12.012, found in R2):** "Show payment again" threw `selectedTxId is not defined` and did nothing.
  Gate: `verify-instant-balance.mjs` block 0.0.12.012.
- **F3 (found here; FIXED after this run in 0.0.12.014 on the founder's decision, see `task_test_channel/evidence/instant-remove-no-double-count/2026-10-03/`):** while a Remove settles, the Savings figure counts the amount twice once
  the node already includes the coin (here "1,128.00 +25.00" for "1,103.00"). Normally about one block; 15 minutes here
  because 9301 stalled. Cause and options in `CLOSURE_REPORT.md`.
- **F4 (lab):** 9301 stops taking new blocks a few minutes after each start since its MegaMMR resync; it was restarted
  at step boundaries (`lab-actions.log`). In R2, C's app also showed a false "out of sync" on that node until it
  imported the on-chain anchor snapshot (by itself).
- **F5 (small display):** the Remove screen shows Savings as 1,077.99 where the Wallet shows 1,078.00 for the same
  1,077.99999799 (rounding down vs to nearest).

## What this run does NOT prove
- Anything on the phones, NFC, or the standalone app's embedded node (Android); the Core companion; the MiniDapp.
- A second, independent operator; multi-day operation; adversarial users (L3 is out of reach here: evidence is L2).
- A camera pointed at a real screen: the camera here is Chrome's fake camera fed with a crop of the other profile's
  screen (the same pixels, without glare or blur).
- Value at risk: Winiwa is a valueless test token.

## Folder
`experiment-record.md` (written before the first post), `run-log.md`, `steps/NN-name/` (screens of A, B and C,
`balances.json`, `chain.json`, `vault-before.json` / `vault-after.json`, console logs, `ui-actions.log`),
`reconciliation.md`, `trace.html`, `CLOSURE_REPORT.md`, `lab-actions.log`, `raw/` (CDP and node scripts;
`commands.jsonl.gz` = every node command and reply, gzip). Earlier runs: `../INSTANT-ABC-01-R1/`, `../INSTANT-ABC-01-R2/`.

To repeat: start the lab (`dev-up.ps1 -DevNodes 3 -NoBrowser`), launch three Chrome profiles as in
`run-log.md`, then in `raw/`: `connect-node.mjs`, `prove-address.mjs`, `move.mjs A add 100`, `pay.mjs A B 40`,
`rescan.mjs`, `pay.mjs B C 25`, `reshow.mjs`, `move.mjs C remove 26`, `move.mjs C remove 25`, with `capture.mjs`,
`vault-snapshot.mjs` and `chainfind.mjs` around each step; `build-trace.mjs` rebuilds the page.
