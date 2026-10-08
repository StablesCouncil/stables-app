# Tear harness results (jCardSim, instrumented build)

Simulator only. The instrumented Persist layer models Java Card transaction semantics (journal and roll back at a tear); it is not evidence about a card's EEPROM. See docs/simulator-status.md for the limits.

**76 of 80 interruption points pass all four invariants.**

Largest single transaction: 246 bytes written (pay:978 < process:295); the applet's install self-test requires a commit buffer of at least 512 bytes.

## Summary per scenario

| Scenario | Commands covered | Write points | APDUs | Cuts before a write | Cuts between APDUs | Failures |
|---|---|---|---|---|---|---|
| receive ticket used by two payers | ISSUE_TICKETS, GET_TICKET, PAY by two payers on ONE ticket, CREDIT both when loading | 52 | 14 | 52 | 28 | 4 |

## Every interruption point

I1 value conserved; I2 counters monotonic (and no PIN try given back); I3 no LX16 key reused; I4 torn tap credited once.

| # | Scenario | Interruption | APDU | Write (kind, source line, bytes) | Tx | I1 | I2 | I3 | I4 | Result | After the cut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | receive ticket used by two payers | power cut before write 0 | M:ISSUE_TICKETS | begin issueTickets:1458 < process:301 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on M |
| 2 | receive ticket used by two payers | power cut before write 1 | M:ISSUE_TICKETS | write issueTickets:1468 < process:301 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 3 | receive ticket used by two payers | power cut before write 2 | M:ISSUE_TICKETS | setByte issueTickets:1469 < process:301 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 4 | receive ticket used by two payers | power cut before write 3 | M:ISSUE_TICKETS | setByte issueTickets:1470 < process:301 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 5 | receive ticket used by two payers | power cut before write 4 | M:ISSUE_TICKETS | write issueTickets:1471 < process:301 (2 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 6 | receive ticket used by two payers | power cut before write 5 | M:ISSUE_TICKETS | write issueTickets:1472 < process:301 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 7 | receive ticket used by two payers | power cut before write 6 | M:ISSUE_TICKETS | fill issueTickets:1473 < process:301 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 8 | receive ticket used by two payers | power cut before write 7 | M:ISSUE_TICKETS | setByte issueTickets:1474 < process:301 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 9 | receive ticket used by two payers | power cut before write 8 | M:ISSUE_TICKETS | write writeNextNonce:534 < issueTickets:1475 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 10 | receive ticket used by two payers | power cut before write 9 | M:ISSUE_TICKETS | commit issueTickets:1476 < process:301 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 11 | receive ticket used by two payers | power cut before write 10 | P1:PAY | begin pay:966 < process:295 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P1 |
| 12 | receive ticket used by two payers | power cut before write 11 | P1:PAY | write pay:967 < process:295 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P1 |
| 13 | receive ticket used by two payers | power cut before write 12 | P1:PAY | write pay:968 < process:295 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P1 |
| 14 | receive ticket used by two payers | power cut before write 13 | P1:PAY | write pay:970 < process:295 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P1 |
| 15 | receive ticket used by two payers | power cut before write 14 | P1:PAY | write pay:974 < process:295 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on P1 |
| 16 | receive ticket used by two payers | power cut before write 15 | P1:PAY | write pay:975 < process:295 (214 B) | in tx | pass | pass | pass | pass | pass | power cut on P1 |
| 17 | receive ticket used by two payers | power cut before write 16 | P1:PAY | setByte pay:976 < process:295 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P1 |
| 18 | receive ticket used by two payers | power cut before write 17 | P1:PAY | setByte pay:977 < process:295 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P1 |
| 19 | receive ticket used by two payers | power cut before write 18 | P1:PAY | setByte pay:978 < process:295 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P1 |
| 20 | receive ticket used by two payers | power cut before write 19 | P1:PAY | commit pay:979 < process:295 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P1 |
| 21 | receive ticket used by two payers | power cut before write 20 | P2:PAY | begin pay:966 < process:295 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P2 |
| 22 | receive ticket used by two payers | power cut before write 21 | P2:PAY | write pay:967 < process:295 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P2 |
| 23 | receive ticket used by two payers | power cut before write 22 | P2:PAY | write pay:968 < process:295 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P2 |
| 24 | receive ticket used by two payers | power cut before write 23 | P2:PAY | write pay:970 < process:295 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P2 |
| 25 | receive ticket used by two payers | power cut before write 24 | P2:PAY | write pay:974 < process:295 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on P2 |
| 26 | receive ticket used by two payers | power cut before write 25 | P2:PAY | write pay:975 < process:295 (213 B) | in tx | pass | pass | pass | pass | pass | power cut on P2 |
| 27 | receive ticket used by two payers | power cut before write 26 | P2:PAY | setByte pay:976 < process:295 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P2 |
| 28 | receive ticket used by two payers | power cut before write 27 | P2:PAY | setByte pay:977 < process:295 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P2 |
| 29 | receive ticket used by two payers | power cut before write 28 | P2:PAY | setByte pay:978 < process:295 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P2 |
| 30 | receive ticket used by two payers | power cut before write 29 | P2:PAY | commit pay:979 < process:295 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P2 |
| 31 | receive ticket used by two payers | power cut before write 30 | M:CREDIT | begin creditTicket:1191 < credit:1081 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on M |
| 32 | receive ticket used by two payers | power cut before write 31 | M:CREDIT | write creditTicket:1192 < credit:1081 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 33 | receive ticket used by two payers | power cut before write 32 | M:CREDIT | write creditTicket:1193 < credit:1081 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 34 | receive ticket used by two payers | power cut before write 33 | M:CREDIT | setByte creditTicket:1194 < credit:1081 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 35 | receive ticket used by two payers | power cut before write 34 | M:CREDIT | write creditTicket:1198 < credit:1081 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 36 | receive ticket used by two payers | power cut before write 35 | M:CREDIT | setByte creditTicket:1199 < credit:1081 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 37 | receive ticket used by two payers | power cut before write 36 | M:CREDIT | write creditTicket:1200 < credit:1081 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 38 | receive ticket used by two payers | power cut before write 37 | M:CREDIT | setByte creditTicket:1201 < credit:1081 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 39 | receive ticket used by two payers | power cut before write 38 | M:CREDIT | commit creditTicket:1202 < credit:1081 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 40 | receive ticket used by two payers | power cut before write 39 | M:CREDIT | write creditTicket:1203 < credit:1081 (16 B) | atomic | FAIL after recovery: value created: USDw balances 220.00 + in flight 0.00 + vouchers 0.00 = 220.00; Winiwa balances 0.00 + in flight 0.00 + vouchers 0.00 = 0.00 | pass | pass | pass | **FAIL** merchant 50.00 but the payers paid 30.00 | power cut on M |
| 41 | receive ticket used by two payers | power cut before write 40 | M:CREDIT | setByte creditTicket:1204 < credit:1081 (1 B) | atomic | FAIL after recovery: value created: USDw balances 220.00 + in flight 0.00 + vouchers 0.00 = 220.00; Winiwa balances 0.00 + in flight 0.00 + vouchers 0.00 = 0.00 | pass | pass | pass | **FAIL** merchant 50.00 but the payers paid 30.00 | power cut on M |
| 42 | receive ticket used by two payers | power cut before write 41 | M:CREDIT | begin creditTicket:1191 < credit:1081 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on M |
| 43 | receive ticket used by two payers | power cut before write 42 | M:CREDIT | write creditTicket:1192 < credit:1081 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 44 | receive ticket used by two payers | power cut before write 43 | M:CREDIT | write creditTicket:1193 < credit:1081 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 45 | receive ticket used by two payers | power cut before write 44 | M:CREDIT | setByte creditTicket:1194 < credit:1081 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 46 | receive ticket used by two payers | power cut before write 45 | M:CREDIT | write creditTicket:1198 < credit:1081 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 47 | receive ticket used by two payers | power cut before write 46 | M:CREDIT | setByte creditTicket:1199 < credit:1081 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 48 | receive ticket used by two payers | power cut before write 47 | M:CREDIT | write creditTicket:1200 < credit:1081 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 49 | receive ticket used by two payers | power cut before write 48 | M:CREDIT | setByte creditTicket:1201 < credit:1081 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 50 | receive ticket used by two payers | power cut before write 49 | M:CREDIT | commit creditTicket:1202 < credit:1081 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 51 | receive ticket used by two payers | power cut before write 50 | M:CREDIT | write creditTicket:1203 < credit:1081 (16 B) | atomic | FAIL after recovery: value created: USDw balances 210.00 + in flight 0.00 + vouchers 0.00 = 210.00; Winiwa balances 0.00 + in flight 0.00 + vouchers 0.00 = 0.00 | pass | pass | pass | **FAIL** merchant 40.00 but the payers paid 30.00 | power cut on M |
| 52 | receive ticket used by two payers | power cut before write 51 | M:CREDIT | setByte creditTicket:1204 < credit:1081 (1 B) | atomic | FAIL after recovery: value created: USDw balances 210.00 + in flight 0.00 + vouchers 0.00 = 210.00; Winiwa balances 0.00 + in flight 0.00 + vouchers 0.00 = 0.00 | pass | pass | pass | **FAIL** merchant 40.00 but the payers paid 30.00 | power cut on M |
| 53 | receive ticket used by two payers | response lost from APDU 1 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 54 | receive ticket used by two payers | power lost after APDU 1 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
| 55 | receive ticket used by two payers | response lost from APDU 2 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 56 | receive ticket used by two payers | power lost after APDU 2 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
| 57 | receive ticket used by two payers | response lost from APDU 3 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 58 | receive ticket used by two payers | power lost after APDU 3 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
| 59 | receive ticket used by two payers | response lost from APDU 4 | P1 | - | - | pass | pass | pass | pass | pass | response lost from P1 |
| 60 | receive ticket used by two payers | power lost after APDU 4 | P1 | - | - | pass | pass | pass | pass | pass | power lost after the response of P1 |
| 61 | receive ticket used by two payers | response lost from APDU 5 | P1 | - | - | pass | pass | pass | pass | pass | response lost from P1 |
| 62 | receive ticket used by two payers | power lost after APDU 5 | P1 | - | - | pass | pass | pass | pass | pass | power lost after the response of P1 |
| 63 | receive ticket used by two payers | response lost from APDU 6 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 64 | receive ticket used by two payers | power lost after APDU 6 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
| 65 | receive ticket used by two payers | response lost from APDU 7 | P2 | - | - | pass | pass | pass | pass | pass | response lost from P2 |
| 66 | receive ticket used by two payers | power lost after APDU 7 | P2 | - | - | pass | pass | pass | pass | pass | power lost after the response of P2 |
| 67 | receive ticket used by two payers | response lost from APDU 8 | P2 | - | - | pass | pass | pass | pass | pass | response lost from P2 |
| 68 | receive ticket used by two payers | power lost after APDU 8 | P2 | - | - | pass | pass | pass | pass | pass | power lost after the response of P2 |
| 69 | receive ticket used by two payers | response lost from APDU 9 | P1 | - | - | pass | pass | pass | pass | pass | response lost from P1 |
| 70 | receive ticket used by two payers | power lost after APDU 9 | P1 | - | - | pass | pass | pass | pass | pass | power lost after the response of P1 |
| 71 | receive ticket used by two payers | response lost from APDU 10 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 72 | receive ticket used by two payers | power lost after APDU 10 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
| 73 | receive ticket used by two payers | response lost from APDU 11 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 74 | receive ticket used by two payers | power lost after APDU 11 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
| 75 | receive ticket used by two payers | response lost from APDU 12 | P2 | - | - | pass | pass | pass | pass | pass | response lost from P2 |
| 76 | receive ticket used by two payers | power lost after APDU 12 | P2 | - | - | pass | pass | pass | pass | pass | power lost after the response of P2 |
| 77 | receive ticket used by two payers | response lost from APDU 13 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 78 | receive ticket used by two payers | power lost after APDU 13 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
| 79 | receive ticket used by two payers | response lost from APDU 14 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 80 | receive ticket used by two payers | power lost after APDU 14 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
