# Relay attack suite (jCardSim, applet instrumented (src/tear Persist/Ram), chain defund rule cumulative (chip_account_v2_cumulative.kiss))

Simulator only. The relay (an untrusted phone) sits between two or three simulated chips. Every row also checks that balances plus value in flight never rise, and that after the documented recovery (re-send the pending transfer, or the receiver's cancel proof) nothing is lost.

Not built or tested (deferred by decision 14; hooks carried): fraud proofs, proof-of-cheating revocation, per-card caps, note expiry, hop limits.

relay suite: 56 passed, 0 failed, 56 total

| # | Group | Test | Result | Detail |
|---|---|---|---|---|
| 1 | drop | HELLO dropped: nothing debited, the next tap works | pass |  |
| 2 | drop | TRANSFER dropped: the pending re-send credits it exactly once | pass |  |
| 3 | drop | TRANSFER dropped: the receiver's cancel proof restores it once, and the transfer can never be credited | pass |  |
| 4 | drop | ACK dropped: the re-send re-issues the ACK, no second credit | pass |  |
| 5 | drop | ACK dropped and never recovered: the value is counted once (at the receiver), nothing lost or created | pass |  |
| 6 | delay | TRANSFER delayed until the receiver retired the nonce (4 newer HELLOs): refused, cancel proof restores | pass |  |
| 7 | delay | ACK delayed past a power cycle of the payer: accepted after the phone re-introduces the chips | pass |  |
| 8 | duplicate | TRANSFER delivered twice: credited once (the second answer is the same ACK) | pass |  |
| 9 | duplicate | HELLO duplicated to two payers: one is credited, the other gets a cancel proof and is restored | pass |  |
| 10 | duplicate | the same HELLO replayed to the same payer: the payer refuses to pay it twice | pass |  |
| 11 | replay | an old TRANSFER replayed in a later session: no second credit | pass |  |
| 12 | replay | a TRANSFER copied to a third chip: refused (bound to the receiver's id) | pass |  |
| 13 | replay | a HELLO already credited, replayed to another payer: refused at credit, the payer is restored | pass |  |
| 14 | replay | a transfer made against a receive ticket, replayed at loading: credited once | pass |  |
| 15 | replay | a ticket replayed after its batch was retired: refused, the payer is restored | pass |  |
| 16 | reorder | two concurrent taps: TRANSFERs and ACKs delivered in reverse order, each credited and cleared once | pass |  |
| 17 | reorder | commands out of order (CREDIT before PEER, ACK before PAY): refused without effect | pass |  |
| 18 | modify | TRANSFER with its amount altered: refused; the original still credits once | pass |  |
| 19 | modify | TRANSFER with its recipient altered: refused; the original still credits once | pass |  |
| 20 | modify | TRANSFER with its counter n altered: refused; the original still credits once | pass |  |
| 21 | modify | TRANSFER with its currency altered: refused; the original still credits once | pass |  |
| 22 | modify | TRANSFER with its nonce m altered: refused; the original still credits once | pass |  |
| 23 | modify | TRANSFER with its payer id altered: refused; the original still credits once | pass |  |
| 24 | modify | TRANSFER with its signature altered: refused; the original still credits once | pass |  |
| 25 | modify | TRANSFER re-addressed to a third chip (recipient field set to its id): refused there | pass |  |
| 26 | modify | HELLO with a raised capacity, a changed nonce or currency: the payer refuses | pass |  |
| 27 | modify | ACK with an altered amount or counter: refused, the transfer stays pending until a genuine ACK | pass |  |
| 28 | modify | CANCEL proof with an altered amount: refused, nothing restored twice | pass |  |
| 29 | modify | fuzz: 300 random single-bit changes to the HELLO, TRANSFER or ACK of a tap; every one refused, value conserved | pass |  |
| 30 | modify | fuzz: status words of the refusals (a 6F00 would mean the simulator's crypto library threw rather than refusing) | pass | {6700=3, 69A3=201, 69A4=27, 69A9=64, 6A80=5} |
| 31 | substitute | a third chip's HELLO swapped in: the payment goes to that chip only; value conserved, no double spend | pass |  |
| 32 | substitute | a third chip's genuine ACK (from its own payment) offered for a pending transfer to R: refused | pass |  |
| 33 | substitute | a third chip asked for a cancel proof of a transfer to R: it refuses; a proof re-signed by it is refused by the payer | pass |  |
| 34 | certificate | a chip certified by a vendor not on the accepted list: refused as payer and as receiver | pass |  |
| 35 | certificate | a software key with a self-made certificate: refused | pass |  |
| 36 | revocation | owner-revoked receiver: paid normally until the snapshot reaches the payer, refused after | pass |  |
| 37 | revocation | owner-revoked payer: refused at credit once the receiver has the snapshot; the payer is restored | pass |  |
| 38 | revocation | a ticket issued before a revocation still loads (good faith, 4.4); one issued after refuses | pass |  |
| 39 | snapshot | a snapshot older than the chip's own, or signed by a vendor not accepted, or with altered entries: refused | pass |  |
| 40 | snapshot | the relay drops SNAP_COMMIT: the chip keeps its old snapshot intact | pass |  |
| 41 | pin | the relay splits a large payment into PIN-less pieces: stopped at 150 since the last PIN | pass |  |
| 42 | pin | an arm is used by exactly one payment; a replayed PAY APDU cannot use it again | pass |  |
| 43 | pin | a finder without the PIN: 3 wrong PINs block the card; payments above the allowance stay refused | pass |  |
| 44 | limits | the owner's per-payment and holding limits hold against a relay presenting two HELLOs | pass |  |
| 45 | double spend | the payer asks the receiver for a cancel proof of a credited transfer: refused | pass |  |
| 46 | double spend | a torn tap re-sent to two different receivers: only the named one can credit it | pass |  |
| 47 | defund order | two defund vouchers delivered to the chain out of order (the newer first, the older late): the owner is paid both amounts, once; the late voucher is refused | pass |  |
| 48 | defund order | drop: the phone keeps no voucher and posts nothing while six defunds overwrite the chip's 4-voucher ring; posting what the chip still holds pays everything, once | pass |  |
| 49 | defund order | delay and interleave: vouchers 1 and 3 posted, voucher 2 arrives last: refused, nothing lost; a fourth voucher then pays only its own amount | pass |  |
| 50 | defund order | double defund attempts: every voucher posted twice, and each again after the newest; the chain never pays more than the chip debited | pass |  |
| 51 | defund order | modify: a voucher whose amount field the relay raised is refused by the chain (the LX16 signature covers the message); the genuine one still pays | pass |  |
| 52 | ticket reuse | one receive ticket used by two payers: both payments load into the merchant's card, each once (replays load nothing); neither payer is left waiting for a cancel proof | pass |  |
| 53 | ticket reuse | delay: the second payer's transfer on a reused ticket reaches the merchant's card only after 40 other payments were loaded (its credit log has wrapped) and the card left the field: it still loads, once | pass |  |
| 54 | ticket reuse | drop: the phone loses the first payer's transfer; the second payer's use of the same ticket loads; the first payer's card re-sends the same bytes at its next tap and they load too | pass |  |
| 55 | ticket reuse | bound: a phone reuses the 22 tickets of one batch for 66 payments by 3 payers; 64 load, the last 2 are refused at loading (ticket log full) and each is restored by an exact cancel proof; nothing created | pass |  |
| 56 | ticket reuse | documented residual: transfers the merchant's phone holds back until after a new batch do not load (the batch is closed); one on a ticket used once is restored by a cancel proof; one on a reused ticket gets 'unknown' and stays in flight (the merchant's own loss; nothing created) | pass |  |
