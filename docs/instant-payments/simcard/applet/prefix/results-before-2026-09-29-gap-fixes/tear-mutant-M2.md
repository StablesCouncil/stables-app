# Tear harness results (jCardSim, instrumented build)

Simulator only. The instrumented Persist layer models Java Card transaction semantics (journal and roll back at a tear); it is not evidence about a card's EEPROM. See docs/simulator-status.md for the limits.

**39 of 40 interruption points pass all four invariants.**

Largest single transaction: 246 bytes written (pay:965 < process:293); the applet's install self-test requires a commit buffer of at least 512 bytes.

## Summary per scenario

| Scenario | Commands covered | Write points | APDUs | Cuts before a write | Cuts between APDUs | Failures |
|---|---|---|---|---|---|---|
| tap (PIN-less) | HELLO, PAY, CREDIT, ACK | 24 | 8 | 24 | 16 | 1 |

## Every interruption point

I1 value conserved; I2 counters monotonic (and no PIN try given back); I3 no LX16 key reused; I4 torn tap credited once.

| # | Scenario | Interruption | APDU | Write (kind, source line, bytes) | Tx | I1 | I2 | I3 | I4 | Result | After the cut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | tap (PIN-less) | power cut before write 0 | R:HELLO | begin hello:850 < process:292 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 2 | tap (PIN-less) | power cut before write 1 | R:HELLO | write writeOutEntry:868 < hello:852 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 3 | tap (PIN-less) | power cut before write 2 | R:HELLO | write writeNextNonce:532 < hello:854 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 4 | tap (PIN-less) | power cut before write 3 | R:HELLO | commit hello:855 < process:292 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 5 | tap (PIN-less) | power cut before write 4 | P:PAY | begin pay:953 < process:293 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 6 | tap (PIN-less) | power cut before write 5 | P:PAY | write pay:954 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 7 | tap (PIN-less) | power cut before write 6 | P:PAY | write pay:955 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 8 | tap (PIN-less) | power cut before write 7 | P:PAY | write pay:957 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 9 | tap (PIN-less) | power cut before write 8 | P:PAY | write pay:961 < process:293 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 10 | tap (PIN-less) | power cut before write 9 | P:PAY | write pay:962 < process:293 (214 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 11 | tap (PIN-less) | power cut before write 10 | P:PAY | setByte pay:963 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 12 | tap (PIN-less) | power cut before write 11 | P:PAY | setByte pay:964 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 13 | tap (PIN-less) | power cut before write 12 | P:PAY | setByte pay:965 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 14 | tap (PIN-less) | power cut before write 13 | P:PAY | commit pay:966 < process:293 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 15 | tap (PIN-less) | power cut before write 14 | R:CREDIT | begin credit:1093 < process:294 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 16 | tap (PIN-less) | power cut before write 15 | R:CREDIT | write credit:1094 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 17 | tap (PIN-less) | power cut before write 16 | R:CREDIT | write credit:1095 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 18 | tap (PIN-less) | power cut before write 17 | R:CREDIT | fill credit:1098 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 19 | tap (PIN-less) | power cut before write 18 | R:CREDIT | write credit:1100 < process:294 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 20 | tap (PIN-less) | power cut before write 19 | R:CREDIT | write credit:1101 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 21 | tap (PIN-less) | power cut before write 20 | R:CREDIT | setByte credit:1102 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 22 | tap (PIN-less) | power cut before write 21 | R:CREDIT | commit credit:1106 < process:294 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 23 | tap (PIN-less) | power cut before write 22 | R:CREDIT | setByte credit:1107 < process:294 (1 B) | atomic | FAIL after recovery: value created: USDw balances 240.00 + in flight 0.00 + vouchers 0.00 = 240.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 | pass | pass | pass | **FAIL**  | power cut on R |
| 24 | tap (PIN-less) | power cut before write 23 | P:ACK | setByte ack:1191 < process:295 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 25 | tap (PIN-less) | response lost from APDU 1 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 26 | tap (PIN-less) | power lost after APDU 1 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 27 | tap (PIN-less) | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 28 | tap (PIN-less) | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 29 | tap (PIN-less) | response lost from APDU 3 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 30 | tap (PIN-less) | power lost after APDU 3 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 31 | tap (PIN-less) | response lost from APDU 4 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 32 | tap (PIN-less) | power lost after APDU 4 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 33 | tap (PIN-less) | response lost from APDU 5 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 34 | tap (PIN-less) | power lost after APDU 5 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 35 | tap (PIN-less) | response lost from APDU 6 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 36 | tap (PIN-less) | power lost after APDU 6 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 37 | tap (PIN-less) | response lost from APDU 7 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 38 | tap (PIN-less) | power lost after APDU 7 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 39 | tap (PIN-less) | response lost from APDU 8 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 40 | tap (PIN-less) | power lost after APDU 8 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
