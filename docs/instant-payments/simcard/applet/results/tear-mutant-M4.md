# Tear harness results (jCardSim, instrumented build)

Simulator only. The instrumented Persist layer models Java Card transaction semantics (journal and roll back at a tear); it is not evidence about a card's EEPROM. See docs/simulator-status.md for the limits.

**37 of 40 interruption points pass all four invariants.**

Largest single transaction: 246 bytes written (pay:978 < process:295); the applet's install self-test requires a commit buffer of at least 512 bytes.

## Summary per scenario

| Scenario | Commands covered | Write points | APDUs | Cuts before a write | Cuts between APDUs | Failures |
|---|---|---|---|---|---|---|
| cancel | PAY, the TRANSFER is lost, CANCEL_PROOF, CANCEL | 24 | 8 | 24 | 16 | 3 |

## Every interruption point

I1 value conserved; I2 counters monotonic (and no PIN try given back); I3 no LX16 key reused; I4 torn tap credited once.

| # | Scenario | Interruption | APDU | Write (kind, source line, bytes) | Tx | I1 | I2 | I3 | I4 | Result | After the cut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | cancel | power cut before write 0 | R:HELLO | begin hello:863 < process:294 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 2 | cancel | power cut before write 1 | R:HELLO | write writeOutEntry:881 < hello:865 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 3 | cancel | power cut before write 2 | R:HELLO | write writeNextNonce:534 < hello:867 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 4 | cancel | power cut before write 3 | R:HELLO | commit hello:868 < process:294 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 5 | cancel | power cut before write 4 | P:PAY | begin pay:966 < process:295 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 6 | cancel | power cut before write 5 | P:PAY | write pay:967 < process:295 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 7 | cancel | power cut before write 6 | P:PAY | write pay:968 < process:295 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 8 | cancel | power cut before write 7 | P:PAY | write pay:970 < process:295 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 9 | cancel | power cut before write 8 | P:PAY | write pay:974 < process:295 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 10 | cancel | power cut before write 9 | P:PAY | write pay:975 < process:295 (214 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 11 | cancel | power cut before write 10 | P:PAY | setByte pay:976 < process:295 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 12 | cancel | power cut before write 11 | P:PAY | setByte pay:977 < process:295 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 13 | cancel | power cut before write 12 | P:PAY | setByte pay:978 < process:295 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 14 | cancel | power cut before write 13 | P:PAY | commit pay:979 < process:295 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 15 | cancel | power cut before write 14 | R:CANCEL_PROOF | begin cancelProof:1356 < process:299 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 16 | cancel | power cut before write 15 | R:CANCEL_PROOF | fill cancelProof:1358 < process:299 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 17 | cancel | power cut before write 16 | R:CANCEL_PROOF | commit cancelProof:1359 < process:299 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 18 | cancel | power cut before write 17 | P:CANCEL | begin cancel:1397 < process:300 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 19 | cancel | power cut before write 18 | P:CANCEL | write cancel:1398 < process:300 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 20 | cancel | power cut before write 19 | P:CANCEL | write cancel:1399 < process:300 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 21 | cancel | power cut before write 20 | P:CANCEL | commit cancel:1400 < process:300 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 22 | cancel | power cut before write 21 | P:CANCEL | begin cancel:1401 < process:300 (0 B) | atomic | FAIL after recovery: value created: USDw balances 225.00 + in flight 0.00 + vouchers 0.00 = 225.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 | pass | pass | pass | **FAIL**  | power cut on P |
| 23 | cancel | power cut before write 22 | P:CANCEL | setByte cancel:1402 < process:300 (1 B) | in tx | FAIL after recovery: value created: USDw balances 225.00 + in flight 0.00 + vouchers 0.00 = 225.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 | pass | pass | pass | **FAIL**  | power cut on P |
| 24 | cancel | power cut before write 23 | P:CANCEL | commit cancel:1403 < process:300 (0 B) | in tx | FAIL after recovery: value created: USDw balances 225.00 + in flight 0.00 + vouchers 0.00 = 225.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 | pass | pass | pass | **FAIL**  | power cut on P |
| 25 | cancel | response lost from APDU 1 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 26 | cancel | power lost after APDU 1 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 27 | cancel | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 28 | cancel | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 29 | cancel | response lost from APDU 3 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 30 | cancel | power lost after APDU 3 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 31 | cancel | response lost from APDU 4 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 32 | cancel | power lost after APDU 4 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 33 | cancel | response lost from APDU 5 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 34 | cancel | power lost after APDU 5 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 35 | cancel | response lost from APDU 6 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 36 | cancel | power lost after APDU 6 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 37 | cancel | response lost from APDU 7 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 38 | cancel | power lost after APDU 7 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 39 | cancel | response lost from APDU 8 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 40 | cancel | power lost after APDU 8 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
