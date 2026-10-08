# Unit tests (jCardSim, applet as shipped (src/main))

Simulator only: shows the applet logic, never evidence about a card (Phase 0 decision 6).

unit tests: 42 passed, 0 failed, 42 total

Commands exercised with success: 32 of 32; with both a success and a refusal: 32.

Persistence-layer violations: n/a (shipped build)

| # | Group | Test | Result | Detail |
|---|---|---|---|---|
| 1 | install | self-test: all 8 checks pass (SHA-256, AES-256, ECDSA KAT, refusal, round trip, random, LX16 labels, commit buffer) | pass |  |
| 2 | install | chip id = SHA-256(on-card public key) | pass |  |
| 3 | install | first LX16 key index is 1 (index 0 can never pass D1: i > u, u = 0 at registration) | pass |  |
| 4 | install | lifecycle active after PERSO_LOCK | pass |  |
| 5 | install | a failed self-test (a card reporting a 100-byte commit buffer) installs inert: GET_STATE shows which check failed, every other command is refused | pass |  |
| 6 | install | every simulated card has its own device key and LX16 seed (guards the jCardSim random shim) | pass |  |
| 7 | state | GET_STATE parts 0 to 6 answer; an unknown part is refused | pass |  |
| 8 | state | GET_PUBKEY: 65-byte uncompressed P-256 point | pass |  |
| 9 | state | GET_CERT: vendor certificate over the on-card key verifies off card (SunEC) | pass |  |
| 10 | state | LX_PUBKEY: chunk digests hash to pk; index 1024 refused | pass |  |
| 11 | state | no sign-anything: no instruction outside the documented set is accepted | pass |  |
| 12 | perso | PERSO commands refused after lock; payment commands refused before lock | pass |  |
| 13 | pin | VERIFY_PIN: right PIN; wrong PIN counts down 63C2, 63C1, 63C0, then blocked 6983 | pass |  |
| 14 | pin | UNBLOCK_PIN: wrong PUK counts down; the vendor PUK sets a new PIN | pass |  |
| 15 | pin | CHANGE_PIN needs the PIN in this session | pass |  |
| 16 | pin | SET_LIMITS needs the PIN, may lower the PIN-less allowances, never raise them | pass |  |
| 17 | peer | PEER accepts a certificate from an accepted vendor (either one) | pass |  |
| 18 | peer | PEER refuses a certificate from a vendor not on the list (69A2) | pass |  |
| 19 | peer | PEER refuses a software key with a self-made certificate (69A2) | pass |  |
| 20 | peer | PEER refuses a certificate whose chip key was swapped (69A3) | pass |  |
| 21 | pay | HELLO: signed by the receiver (SunEC), fresh nonce, unlimited capacity with no holding limit | pass |  |
| 22 | pay | full tap: PAY commits then emits a TRANSFER (SunEC-valid), CREDIT credits, ACK clears | pass |  |
| 23 | pay | RESEND returns the exact signed bytes | pass |  |
| 24 | pay | PAY refusals: no peer, wrong peer, amount 0, above balance, above capacity, same HELLO twice | pass |  |
| 25 | pay | PIN rules (3.4): up to 50 per payment and 150 in total PIN-less; above that the PIN or an arm | pass |  |
| 26 | pay | owner limits: per-payment limit refuses; holding limit caps HELLO and CREDIT | pass |  |
| 27 | pay | CREDIT refusals: not for me, tampered, revoked payer | pass |  |
| 28 | pay | ACK refusals: an ACK signed by another chip, or for another payer | pass |  |
| 29 | cancel | CANCEL_PROOF retires an uncredited nonce; CANCEL restores once; the transfer can never be credited | pass |  |
| 30 | cancel | CANCEL_PROOF refused for a transfer that was credited | pass |  |
| 31 | tickets | ISSUE_TICKETS and GET_TICKET: signed ticket HELLOs; payer pays; the merchant card loads them once | pass |  |
| 32 | tickets | open tickets block a new batch unless the phone retires them; a retired ticket is refused | pass |  |
| 33 | tickets | gap fix 2026-09-29: a ticket used by two payers loads both transfers once each; the ticket log (GET_STATE part 7) lists them; a cancel proof is refused for a loaded transfer and exact for an unloaded one | pass |  |
| 34 | swap | SWAP_EXPECT: h = SHA-256(s); s released only in the ACK of a transfer of at least X | pass |  |
| 35 | swap | a paid swap's ACK carries s; a re-issued ACK carries the same s | pass |  |
| 36 | fund | FUND: the vendor voucher numbered k+1 credits once; replay, skip, wrong total, wrong vendor, wrong chip refused | pass |  |
| 37 | defund | DEFUND: PIN required; commits the debit and the key index; the LX16 voucher verifies (ots port) | pass |  |
| 38 | defund | gap fix 2026-09-29: each voucher carries the chip's cumulative defunded total (120, then 150), not its own amount; the balance-after field and the key index move with it | pass |  |
| 39 | snapshot | a newer snapshot from any accepted vendor is accepted; revocations reach the chip | pass |  |
| 40 | snapshot | same, older or foreign-signed snapshots refused; tampered entries refused with the old state intact | pass |  |
| 41 | refusals | the remaining commands refuse out of context: GET_CERT before a certificate, DEFUND_READ of an empty voucher slot, snapshot entries without a header, PERSO after lock, GET_PUBKEY with a bad class | pass |  |
| 42 | bench | benchmark applet: every command answers 9000 in the simulator | pass |  |

## Command coverage (measured at run time)

| Instruction | Accepted | Refused |
|---|---|---|
| GET_STATE | 177 | 2 |
| GET_CERT | 47 | 1 |
| GET_PUBKEY | 48 | 1 |
| LX_PUBKEY | 4 | 2 |
| VERIFY_PIN | 13 | 5 |
| CHANGE_PIN | 1 | 1 |
| UNBLOCK_PIN | 1 | 1 |
| SET_LIMITS | 3 | 2 |
| PEER | 44 | 3 |
| HELLO | 25 | 3 |
| PAY | 21 | 12 |
| CREDIT | 22 | 6 |
| ACK | 14 | 2 |
| RESEND | 1 | 1 |
| CANCEL_PROOF | 4 | 3 |
| CANCEL | 4 | 1 |
| ISSUE_TICKETS | 4 | 1 |
| GET_TICKET | 2 | 2 |
| SWAP_EXPECT | 3 | 1 |
| FUND | 30 | 5 |
| DEFUND | 2 | 4 |
| DEFUND_READ | 68 | 2 |
| SNAP_BEGIN | 37 | 3 |
| SNAP_VENDORS | 37 | 1 |
| SNAP_REVOCATIONS | 2 | 1 |
| SNAP_COMMIT | 36 | 2 |
| PERSO_SET_ISSUER | 35 | 1 |
| PERSO_SET_CERT | 35 | 1 |
| PERSO_SET_PIN | 35 | 2 |
| PERSO_SET_PUK | 35 | 1 |
| PERSO_ADD_CURRENCY | 69 | 3 |
| PERSO_LOCK | 35 | 3 |
