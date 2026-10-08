# Relay attack suite (jCardSim, applet as shipped (src/main))

Simulator only. The relay (an untrusted phone) sits between two or three simulated chips. Every row also checks that balances plus value in flight never rise, and that after the documented recovery (re-send the pending transfer, or the receiver's cancel proof) nothing is lost.

Not built or tested (deferred by decision 14; hooks carried): fraud proofs, proof-of-cheating revocation, per-card caps, note expiry, hop limits.

relay suite: 47 passed, 0 failed, 47 total

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
| 15 | replay | one receive ticket used by two payers: one credited, the other restored by a cancel proof | pass |  |
| 16 | replay | a ticket replayed after its batch was retired: refused, the payer is restored | pass |  |
| 17 | reorder | two concurrent taps: TRANSFERs and ACKs delivered in reverse order, each credited and cleared once | pass |  |
| 18 | reorder | commands out of order (CREDIT before PEER, ACK before PAY): refused without effect | pass |  |
| 19 | modify | TRANSFER with its amount altered: refused; the original still credits once | pass |  |
| 20 | modify | TRANSFER with its recipient altered: refused; the original still credits once | pass |  |
| 21 | modify | TRANSFER with its counter n altered: refused; the original still credits once | pass |  |
| 22 | modify | TRANSFER with its currency altered: refused; the original still credits once | pass |  |
| 23 | modify | TRANSFER with its nonce m altered: refused; the original still credits once | pass |  |
| 24 | modify | TRANSFER with its payer id altered: refused; the original still credits once | pass |  |
| 25 | modify | TRANSFER with its signature altered: refused; the original still credits once | pass |  |
| 26 | modify | TRANSFER re-addressed to a third chip (recipient field set to its id): refused there | pass |  |
| 27 | modify | HELLO with a raised capacity, a changed nonce or currency: the payer refuses | pass |  |
| 28 | modify | ACK with an altered amount or counter: refused, the transfer stays pending until a genuine ACK | pass |  |
| 29 | modify | CANCEL proof with an altered amount: refused, nothing restored twice | pass |  |
| 30 | modify | fuzz: 300 random single-bit changes to the HELLO, TRANSFER or ACK of a tap; every one refused, value conserved | pass |  |
| 31 | modify | fuzz: status words of the refusals (a 6F00 would mean the simulator's crypto library threw rather than refusing) | pass | {6700=2, 69A3=209, 69A4=22, 69A9=61, 6A80=6} |
| 32 | substitute | a third chip's HELLO swapped in: the payment goes to that chip only; value conserved, no double spend | pass |  |
| 33 | substitute | a third chip's genuine ACK (from its own payment) offered for a pending transfer to R: refused | pass |  |
| 34 | substitute | a third chip asked for a cancel proof of a transfer to R: it refuses; a proof re-signed by it is refused by the payer | pass |  |
| 35 | certificate | a chip certified by a vendor not on the accepted list: refused as payer and as receiver | pass |  |
| 36 | certificate | a software key with a self-made certificate: refused | pass |  |
| 37 | revocation | owner-revoked receiver: paid normally until the snapshot reaches the payer, refused after | pass |  |
| 38 | revocation | owner-revoked payer: refused at credit once the receiver has the snapshot; the payer is restored | pass |  |
| 39 | revocation | a ticket issued before a revocation still loads (good faith, 4.4); one issued after refuses | pass |  |
| 40 | snapshot | a snapshot older than the chip's own, or signed by a vendor not accepted, or with altered entries: refused | pass |  |
| 41 | snapshot | the relay drops SNAP_COMMIT: the chip keeps its old snapshot intact | pass |  |
| 42 | pin | the relay splits a large payment into PIN-less pieces: stopped at 150 since the last PIN | pass |  |
| 43 | pin | an arm is used by exactly one payment; a replayed PAY APDU cannot use it again | pass |  |
| 44 | pin | a finder without the PIN: 3 wrong PINs block the card; payments above the allowance stay refused | pass |  |
| 45 | limits | the owner's per-payment and holding limits hold against a relay presenting two HELLOs | pass |  |
| 46 | double spend | the payer asks the receiver for a cancel proof of a credited transfer: refused | pass |  |
| 47 | double spend | a torn tap re-sent to two different receivers: only the named one can credit it | pass |  |
