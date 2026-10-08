# INSTANT-ONESCAN-01-R1: Instant payments by one scan (build 0.0.12.021, D087)

Mainnet, laptop lab. Payer A = Chrome profile on node 9101 (proxy 9106), receiver B = profile on node 9201 (proxy 9206).
Codes move screen to camera: the receiver's screen, cropped to its code, becomes the payer's fake camera.
Driver: `raw/onescan.mjs` (clicks and typing only). `raw/watch-node.mjs` logs when an envelope reaches B's node.

| Step | Case | Payer did | Receiver did | Result |
|---|---|---|---|---|
| 1-payer-amount | payer types 2, then scans | type, Camera | nothing | A 35 → 33, B 10 → 12, A row Sent (build without the fast read: 48 s) |
| 2-receiver-amount | B asks 3 in the code | opened Send (auto-scan) | typed 3 | paid at the scan; sheet still open at that time: fixed, see 2b |
| 2b-receiver-amount | same, after the fixes | opened Send | typed 3 | A 30 → 27, B 15 → 18 in 27 s; envelope at B's node +24 s, B's screen +2 s |
| 3-no-amount (first try) | B's field kept 3 from 2b | opened Send | nothing | paid 3 (a receiver-amount case, not the one intended) |
| 3-no-amount | no amount anywhere | scan, type 1.5, Confirm | nothing | A 24 → 22.5, B 21 → 22.5 |
| 4-no-network | A's proxy 9106 stopped | type 1, Camera | Scan payment | payment QR shown; B 22.5 → 23.5; A row "QR shown" |

All rows: one per payment on each side, titles "Paid" / "Received" over the network, "Paid offline" / "Received offline"
by QR. No envelope (one-atom) Savings row on either side. A page reload re-read old envelopes and credited nothing twice.

Times are UTC (local = UTC+3). Step 1 and 2 ran before two fixes in the same build: the receiver's history read at
3 s while Instant Receive shows an address code, and Send closing once the payment is on its way.
