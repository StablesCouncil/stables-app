# Tear harness results (jCardSim, instrumented build)

Simulator only. The instrumented Persist layer models Java Card transaction semantics (journal and roll back at a tear); it is not evidence about a card's EEPROM. See docs/simulator-status.md for the limits.

**33 of 42 interruption points pass all four invariants.**

Largest single transaction: 238 bytes written (pay:967 < process:293); the applet's install self-test requires a commit buffer of at least 512 bytes.

## Summary per scenario

| Scenario | Commands covered | Write points | APDUs | Cuts before a write | Cuts between APDUs | Failures |
|---|---|---|---|---|---|---|
| tap (PIN-less) | HELLO, PAY, CREDIT, ACK | 26 | 8 | 26 | 16 | 9 |

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
| 7 | tap (PIN-less) | power cut before write 6 | P:PAY | commit pay:955 < process:293 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 8 | tap (PIN-less) | power cut before write 7 | P:PAY | begin pay:956 < process:293 (0 B) | atomic | FAIL after recovery: USDw balances 180.00 + in flight 0.00 + vouchers 0.00 = 180.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 210.00 + in flight 0.00 + vouchers 0.00 = 210.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL**  | power cut on P |
| 9 | tap (PIN-less) | power cut before write 8 | P:PAY | write pay:957 < process:293 (8 B) | in tx | FAIL after recovery: USDw balances 180.00 + in flight 0.00 + vouchers 0.00 = 180.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 210.00 + in flight 0.00 + vouchers 0.00 = 210.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL**  | power cut on P |
| 10 | tap (PIN-less) | power cut before write 9 | P:PAY | write pay:959 < process:293 (8 B) | in tx | FAIL after recovery: USDw balances 180.00 + in flight 0.00 + vouchers 0.00 = 180.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 210.00 + in flight 0.00 + vouchers 0.00 = 210.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL**  | power cut on P |
| 11 | tap (PIN-less) | power cut before write 10 | P:PAY | write pay:963 < process:293 (4 B) | in tx | FAIL after recovery: USDw balances 180.00 + in flight 0.00 + vouchers 0.00 = 180.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 210.00 + in flight 0.00 + vouchers 0.00 = 210.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL**  | power cut on P |
| 12 | tap (PIN-less) | power cut before write 11 | P:PAY | write pay:964 < process:293 (214 B) | in tx | FAIL after recovery: USDw balances 180.00 + in flight 0.00 + vouchers 0.00 = 180.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 210.00 + in flight 0.00 + vouchers 0.00 = 210.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL**  | power cut on P |
| 13 | tap (PIN-less) | power cut before write 12 | P:PAY | setByte pay:965 < process:293 (1 B) | in tx | FAIL after recovery: USDw balances 180.00 + in flight 0.00 + vouchers 0.00 = 180.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 210.00 + in flight 0.00 + vouchers 0.00 = 210.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL**  | power cut on P |
| 14 | tap (PIN-less) | power cut before write 13 | P:PAY | setByte pay:966 < process:293 (1 B) | in tx | FAIL after recovery: USDw balances 180.00 + in flight 0.00 + vouchers 0.00 = 180.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 210.00 + in flight 0.00 + vouchers 0.00 = 210.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL**  | power cut on P |
| 15 | tap (PIN-less) | power cut before write 14 | P:PAY | setByte pay:967 < process:293 (1 B) | in tx | FAIL after recovery: USDw balances 180.00 + in flight 0.00 + vouchers 0.00 = 180.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 210.00 + in flight 0.00 + vouchers 0.00 = 210.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL**  | power cut on P |
| 16 | tap (PIN-less) | power cut before write 15 | P:PAY | commit pay:968 < process:293 (0 B) | in tx | FAIL after recovery: USDw balances 180.00 + in flight 0.00 + vouchers 0.00 = 180.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 210.00 + in flight 0.00 + vouchers 0.00 = 210.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL**  | power cut on P |
| 17 | tap (PIN-less) | power cut before write 16 | R:CREDIT | begin credit:1095 < process:294 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 18 | tap (PIN-less) | power cut before write 17 | R:CREDIT | write credit:1096 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 19 | tap (PIN-less) | power cut before write 18 | R:CREDIT | write credit:1097 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 20 | tap (PIN-less) | power cut before write 19 | R:CREDIT | setByte credit:1098 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 21 | tap (PIN-less) | power cut before write 20 | R:CREDIT | fill credit:1101 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 22 | tap (PIN-less) | power cut before write 21 | R:CREDIT | write credit:1103 < process:294 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 23 | tap (PIN-less) | power cut before write 22 | R:CREDIT | write credit:1104 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 24 | tap (PIN-less) | power cut before write 23 | R:CREDIT | setByte credit:1105 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 25 | tap (PIN-less) | power cut before write 24 | R:CREDIT | commit credit:1109 < process:294 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 26 | tap (PIN-less) | power cut before write 25 | P:ACK | setByte ack:1193 < process:295 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 27 | tap (PIN-less) | response lost from APDU 1 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 28 | tap (PIN-less) | power lost after APDU 1 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 29 | tap (PIN-less) | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 30 | tap (PIN-less) | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 31 | tap (PIN-less) | response lost from APDU 3 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 32 | tap (PIN-less) | power lost after APDU 3 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 33 | tap (PIN-less) | response lost from APDU 4 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 34 | tap (PIN-less) | power lost after APDU 4 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 35 | tap (PIN-less) | response lost from APDU 5 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 36 | tap (PIN-less) | power lost after APDU 5 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 37 | tap (PIN-less) | response lost from APDU 6 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 38 | tap (PIN-less) | power lost after APDU 6 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 39 | tap (PIN-less) | response lost from APDU 7 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 40 | tap (PIN-less) | power lost after APDU 7 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 41 | tap (PIN-less) | response lost from APDU 8 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 42 | tap (PIN-less) | power lost after APDU 8 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
