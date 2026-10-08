# Relay attack suite (jCardSim, applet instrumented (src/tear Persist/Ram), chain defund rule per-voucher (chip_account.kiss, before the fix))

Simulator only. The relay (an untrusted phone) sits between two or three simulated chips. Every row also checks that balances plus value in flight never rise, and that after the documented recovery (re-send the pending transfer, or the receiver's cancel proof) nothing is lost.

Not built or tested (deferred by decision 14; hooks carried): fraud proofs, proof-of-cheating revocation, per-card caps, note expiry, hop limits.

relay suite: 2 passed, 8 failed, 10 total

| # | Group | Test | Result | Detail |
|---|---|---|---|---|
| 1 | defund order | two defund vouchers delivered to the chain out of order (the newer first, the older late): the owner is paid both amounts, once; the late voucher is refused | **FAIL** | AssertionError: paid in total (paid 25.00 for key 2; refused key 1: key index not above 2): want 6500000000, got 2500000000 |
| 2 | defund order | drop: the phone keeps no voucher and posts nothing while six defunds overwrite the chip's 4-voucher ring; posting what the chip still holds pays everything, once | **FAIL** | AssertionError: paid (paid 30.00 for key 3; paid 40.00 for key 4; paid 50.00 for key 5; paid 60.00 for key 6): want 21000000000, got 18000000000 |
| 3 | defund order | delay and interleave: vouchers 1 and 3 posted, voucher 2 arrives last: refused, nothing lost; a fourth voucher then pays only its own amount | **FAIL** | AssertionError: paid after three (paid 20.00 for key 1; paid 20.00 for key 3; refused key 2: key index not above 3): want 6000000000, got 4000000000 |
| 4 | defund order | double defund attempts: every voucher posted twice, and each again after the newest; the chain never pays more than the chip debited | pass |  |
| 5 | defund order | modify: a voucher whose amount field the relay raised is refused by the chain (the LX16 signature covers the message); the genuine one still pays | pass |  |
| 6 | ticket reuse | one receive ticket used by two payers: both payments load into the merchant's card, each once (replays load nothing); neither payer is left waiting for a cancel proof | **FAIL** | Err: M INS 36 refused: SW 69A6 |
| 7 | ticket reuse | delay: the second payer's transfer on a reused ticket reaches the merchant's card only after 40 other payments were loaded (its credit log has wrapped) and the card left the field: it still loads, once | **FAIL** | Err: M INS 36 refused: SW 69A6 |
| 8 | ticket reuse | drop: the phone loses the first payer's transfer; the second payer's use of the same ticket loads; the first payer's card re-sends the same bytes at its next tap and they load too | **FAIL** | Err: M INS 36 refused: SW 69A6 |
| 9 | ticket reuse | bound: a phone reuses the 22 tickets of one batch for 66 payments by 3 payers; 64 load, the last 2 are refused at loading (ticket log full) and each is restored by an exact cancel proof; nothing created | **FAIL** | AssertionError: refusal 22: want 27062, got 27046 |
| 10 | ticket reuse | documented residual: transfers the merchant's phone holds back until after a new batch do not load (the batch is closed); one on a ticket used once is restored by a cancel proof; one on a reused ticket gets 'unknown' and stays in flight (the merchant's own loss; nothing created) | **FAIL** | AssertionError: the card cannot prove it was not loaded: want 27059, got 36864 |
