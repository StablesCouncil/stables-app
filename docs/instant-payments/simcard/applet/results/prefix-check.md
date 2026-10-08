# Pre-fix check: the new cases fail on the build from before the gap fixes

Negative control (simulator only). Pre-fix build: `prefix/card-src-before-2026-09-29-gap-fixes` (the card source as it was
before the fixes) with the instrumented Persist/Ram, and the chain model on the defund rule of the measured
`kiss/balance/chip_account.kiss` (per-voucher amount, key index above the last). Post-fix build: `build/sim-tear` with the
cumulative rule of `kiss/balance/chip_account_v2_cumulative.kiss`. Same host harness for both (tools/prefix-check.mjs).
Per-row details: `results/prefix-check-*.md`.

**Every fix case fails on the pre-fix build and passes on the fixed build; the safety guards pass on both.**

| Harness | Group | Case | Fixed build | Pre-fix build | Verdict |
|---|---|---|---|---|---|
| relay | defund order | two defund vouchers delivered to the chain out of order (the newer first, the older late): the owner is paid both amounts, once; the late voucher is refused | pass | FAIL: AssertionError: paid in total (paid 25.00 for key 2; refused key 1: key index not above 2): want 6500000000, got 2500000000 | proven: fails before, passes after |
| relay | defund order | drop: the phone keeps no voucher and posts nothing while six defunds overwrite the chip's 4-voucher ring; posting what the chip still holds pays everything, once | pass | FAIL: AssertionError: paid (paid 30.00 for key 3; paid 40.00 for key 4; paid 50.00 for key 5; paid 60.00 for key 6): want 21000000000, got 18000000000 | proven: fails before, passes after |
| relay | defund order | delay and interleave: vouchers 1 and 3 posted, voucher 2 arrives last: refused, nothing lost; a fourth voucher then pays only its own amount | pass | FAIL: AssertionError: paid after three (paid 20.00 for key 1; paid 20.00 for key 3; refused key 2: key index not above 3): want 6000000000, got 4000000000 | proven: fails before, passes after |
| relay | defund order | double defund attempts: every voucher posted twice, and each again after the newest; the chain never pays more than the chip debited | pass | pass | safety guard: passes on both |
| relay | defund order | modify: a voucher whose amount field the relay raised is refused by the chain (the LX16 signature covers the message); the genuine one still pays | pass | pass | safety guard: passes on both |
| relay | ticket reuse | one receive ticket used by two payers: both payments load into the merchant's card, each once (replays load nothing); neither payer is left waiting for a cancel proof | pass | FAIL: Err: M INS 36 refused: SW 69A6 | proven: fails before, passes after |
| relay | ticket reuse | delay: the second payer's transfer on a reused ticket reaches the merchant's card only after 40 other payments were loaded (its credit log has wrapped) and the card left the field: it still loads, once | pass | FAIL: Err: M INS 36 refused: SW 69A6 | proven: fails before, passes after |
| relay | ticket reuse | drop: the phone loses the first payer's transfer; the second payer's use of the same ticket loads; the first payer's card re-sends the same bytes at its next tap and they load too | pass | FAIL: Err: M INS 36 refused: SW 69A6 | proven: fails before, passes after |
| relay | ticket reuse | bound: a phone reuses the 22 tickets of one batch for 66 payments by 3 payers; 64 load, the last 2 are refused at loading (ticket log full) and each is restored by an exact cancel proof; nothing created | pass | FAIL: AssertionError: refusal 22: want 27062, got 27046 | proven: fails before, passes after |
| relay | ticket reuse | documented residual: transfers the merchant's phone holds back until after a new batch do not load (the batch is closed); one on a ticket used once is restored by a cancel proof; one on a reused ticket gets 'unknown' and stays in flight (the merchant's own loss; nothing created) | pass | FAIL: AssertionError: the card cannot prove it was not loaded: want 27059, got 36864 | informational |
| tear | scenario | defund twice, chain out of order | 180 of 180 points pass | 78 of 180 points FAIL | proven: fails before, passes after |
| tear | scenario | receive ticket used by two payers | 80 of 80 points pass | 23 of 65 points FAIL | proven: fails before, passes after |

First failing tear row on the pre-fix build (truncated): / 103 / defund twice, chain out of order / response lost from APDU 38 / P / - / - / FAIL after recovery: USDw balances 434.00 + in flight 0.00 + vouchers 26.00 = 460.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 500.00 + in flight 0.00 + vouchers 0.00 = 500.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) / pass / pass / pass / **FAIL** the chain paid 26.00 for 66.00 debited (paid 25.00 for key 2; refused key 1: key index not above 2
