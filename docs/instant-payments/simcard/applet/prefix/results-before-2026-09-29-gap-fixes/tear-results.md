# Tear harness results (jCardSim, instrumented build)

Simulator only. The instrumented Persist layer models Java Card transaction semantics (journal and roll back at a tear); it is not evidence about a card's EEPROM. See docs/simulator-status.md for the limits.

**465 of 465 interruption points pass all four invariants.**

Largest single transaction: 268 bytes written (defund:1546 < process:303); the applet's install self-test requires a commit buffer of at least 512 bytes.

## Summary per scenario

| Scenario | Commands covered | Write points | APDUs | Cuts before a write | Cuts between APDUs | Failures |
|---|---|---|---|---|---|---|
| tap (PIN-less) | HELLO, PAY, CREDIT, ACK | 24 | 8 | 24 | 16 | 0 |
| tap with PIN | VERIFY_PIN, PAY above the PIN-less limit | 29 | 9 | 29 | 18 | 0 |
| tap with an arm | VERIFY_PIN with arm (own phone), card leaves the field, PAY uses the arm | 31 | 9 | 31 | 18 | 0 |
| tap in Winiwa (second currency) | per-currency balance | 24 | 8 | 24 | 16 | 0 |
| cancel | PAY, the TRANSFER is lost, CANCEL_PROOF, CANCEL | 22 | 8 | 22 | 16 | 0 |
| fund | FUND voucher k+1 | 5 | 1 | 5 | 2 | 0 |
| defund | VERIFY_PIN, DEFUND (commit key + debit), DEFUND_READ x34 | 14 | 36 | 14 | 72 | 0 |
| wrong PIN | VERIFY_PIN with a wrong PIN | 1 | 1 | 1 | 2 | 0 |
| PUK unblock | UNBLOCK_PIN with the vendor PUK after the PIN is blocked | 7 | 1 | 7 | 2 | 0 |
| wrong PUK | UNBLOCK_PIN with a wrong PUK | 1 | 1 | 1 | 2 | 0 |
| set limits | VERIFY_PIN, SET_LIMITS | 9 | 2 | 9 | 4 | 0 |
| change PIN | VERIFY_PIN, CHANGE_PIN | 10 | 2 | 10 | 4 | 0 |
| registry snapshot | SNAP_BEGIN, SNAP_VENDORS, SNAP_REVOCATIONS, SNAP_COMMIT (new vendor, 2 revocations) | 9 | 5 | 9 | 10 | 0 |
| swap receipt | SWAP_EXPECT (buyer), VERIFY_PIN + PAY (seller), CREDIT releases s, ACK | 36 | 9 | 36 | 18 | 0 |
| receive tickets | ISSUE_TICKETS, GET_TICKET, PAY at the till, CREDIT when loading | 27 | 8 | 27 | 16 | 0 |

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
| 18 | tap (PIN-less) | power cut before write 17 | R:CREDIT | setByte credit:1096 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 19 | tap (PIN-less) | power cut before write 18 | R:CREDIT | fill credit:1099 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 20 | tap (PIN-less) | power cut before write 19 | R:CREDIT | write credit:1101 < process:294 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 21 | tap (PIN-less) | power cut before write 20 | R:CREDIT | write credit:1102 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 22 | tap (PIN-less) | power cut before write 21 | R:CREDIT | setByte credit:1103 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 23 | tap (PIN-less) | power cut before write 22 | R:CREDIT | commit credit:1107 < process:294 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
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
| 41 | tap with PIN | power cut before write 0 | P:VERIFY_PIN | setByte verifyPin:675 < process:287 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 42 | tap with PIN | power cut before write 1 | P:VERIFY_PIN | begin verifyPin:681 < process:287 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 43 | tap with PIN | power cut before write 2 | P:VERIFY_PIN | setByte verifyPin:682 < process:287 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 44 | tap with PIN | power cut before write 3 | P:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 45 | tap with PIN | power cut before write 4 | P:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 46 | tap with PIN | power cut before write 5 | P:VERIFY_PIN | commit verifyPin:691 < process:287 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 47 | tap with PIN | power cut before write 6 | R:HELLO | begin hello:850 < process:292 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 48 | tap with PIN | power cut before write 7 | R:HELLO | write writeOutEntry:868 < hello:852 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 49 | tap with PIN | power cut before write 8 | R:HELLO | write writeNextNonce:532 < hello:854 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 50 | tap with PIN | power cut before write 9 | R:HELLO | commit hello:855 < process:292 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 51 | tap with PIN | power cut before write 10 | P:PAY | begin pay:953 < process:293 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 52 | tap with PIN | power cut before write 11 | P:PAY | write pay:954 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 53 | tap with PIN | power cut before write 12 | P:PAY | write pay:955 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 54 | tap with PIN | power cut before write 13 | P:PAY | write pay:961 < process:293 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 55 | tap with PIN | power cut before write 14 | P:PAY | write pay:962 < process:293 (214 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 56 | tap with PIN | power cut before write 15 | P:PAY | setByte pay:963 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 57 | tap with PIN | power cut before write 16 | P:PAY | setByte pay:964 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 58 | tap with PIN | power cut before write 17 | P:PAY | setByte pay:965 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 59 | tap with PIN | power cut before write 18 | P:PAY | commit pay:966 < process:293 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 60 | tap with PIN | power cut before write 19 | R:CREDIT | begin credit:1093 < process:294 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 61 | tap with PIN | power cut before write 20 | R:CREDIT | write credit:1094 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 62 | tap with PIN | power cut before write 21 | R:CREDIT | write credit:1095 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 63 | tap with PIN | power cut before write 22 | R:CREDIT | setByte credit:1096 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 64 | tap with PIN | power cut before write 23 | R:CREDIT | fill credit:1099 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 65 | tap with PIN | power cut before write 24 | R:CREDIT | write credit:1101 < process:294 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 66 | tap with PIN | power cut before write 25 | R:CREDIT | write credit:1102 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 67 | tap with PIN | power cut before write 26 | R:CREDIT | setByte credit:1103 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 68 | tap with PIN | power cut before write 27 | R:CREDIT | commit credit:1107 < process:294 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 69 | tap with PIN | power cut before write 28 | P:ACK | setByte ack:1191 < process:295 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 70 | tap with PIN | response lost from APDU 1 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 71 | tap with PIN | power lost after APDU 1 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 72 | tap with PIN | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 73 | tap with PIN | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 74 | tap with PIN | response lost from APDU 3 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 75 | tap with PIN | power lost after APDU 3 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 76 | tap with PIN | response lost from APDU 4 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 77 | tap with PIN | power lost after APDU 4 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 78 | tap with PIN | response lost from APDU 5 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 79 | tap with PIN | power lost after APDU 5 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 80 | tap with PIN | response lost from APDU 6 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 81 | tap with PIN | power lost after APDU 6 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 82 | tap with PIN | response lost from APDU 7 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 83 | tap with PIN | power lost after APDU 7 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 84 | tap with PIN | response lost from APDU 8 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 85 | tap with PIN | power lost after APDU 8 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 86 | tap with PIN | response lost from APDU 9 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 87 | tap with PIN | power lost after APDU 9 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 88 | tap with an arm | power cut before write 0 | P:VERIFY_PIN | setByte verifyPin:675 < process:287 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 89 | tap with an arm | power cut before write 1 | P:VERIFY_PIN | begin verifyPin:681 < process:287 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 90 | tap with an arm | power cut before write 2 | P:VERIFY_PIN | setByte verifyPin:682 < process:287 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 91 | tap with an arm | power cut before write 3 | P:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 92 | tap with an arm | power cut before write 4 | P:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 93 | tap with an arm | power cut before write 5 | P:VERIFY_PIN | write verifyPin:689 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 94 | tap with an arm | power cut before write 6 | P:VERIFY_PIN | commit verifyPin:691 < process:287 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 95 | tap with an arm | power cut before write 7 | R:HELLO | begin hello:850 < process:292 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 96 | tap with an arm | power cut before write 8 | R:HELLO | write writeOutEntry:868 < hello:852 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 97 | tap with an arm | power cut before write 9 | R:HELLO | write writeNextNonce:532 < hello:854 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 98 | tap with an arm | power cut before write 10 | R:HELLO | commit hello:855 < process:292 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 99 | tap with an arm | power cut before write 11 | P:PAY | begin pay:953 < process:293 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 100 | tap with an arm | power cut before write 12 | P:PAY | write pay:954 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 101 | tap with an arm | power cut before write 13 | P:PAY | write pay:955 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 102 | tap with an arm | power cut before write 14 | P:PAY | fill pay:959 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 103 | tap with an arm | power cut before write 15 | P:PAY | write pay:961 < process:293 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 104 | tap with an arm | power cut before write 16 | P:PAY | write pay:962 < process:293 (214 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 105 | tap with an arm | power cut before write 17 | P:PAY | setByte pay:963 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 106 | tap with an arm | power cut before write 18 | P:PAY | setByte pay:964 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 107 | tap with an arm | power cut before write 19 | P:PAY | setByte pay:965 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 108 | tap with an arm | power cut before write 20 | P:PAY | commit pay:966 < process:293 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 109 | tap with an arm | power cut before write 21 | R:CREDIT | begin credit:1093 < process:294 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 110 | tap with an arm | power cut before write 22 | R:CREDIT | write credit:1094 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 111 | tap with an arm | power cut before write 23 | R:CREDIT | write credit:1095 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 112 | tap with an arm | power cut before write 24 | R:CREDIT | setByte credit:1096 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 113 | tap with an arm | power cut before write 25 | R:CREDIT | fill credit:1099 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 114 | tap with an arm | power cut before write 26 | R:CREDIT | write credit:1101 < process:294 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 115 | tap with an arm | power cut before write 27 | R:CREDIT | write credit:1102 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 116 | tap with an arm | power cut before write 28 | R:CREDIT | setByte credit:1103 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 117 | tap with an arm | power cut before write 29 | R:CREDIT | commit credit:1107 < process:294 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 118 | tap with an arm | power cut before write 30 | P:ACK | setByte ack:1191 < process:295 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 119 | tap with an arm | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 120 | tap with an arm | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 121 | tap with an arm | response lost from APDU 2 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 122 | tap with an arm | power lost after APDU 2 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 123 | tap with an arm | response lost from APDU 3 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 124 | tap with an arm | power lost after APDU 3 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 125 | tap with an arm | response lost from APDU 4 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 126 | tap with an arm | power lost after APDU 4 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 127 | tap with an arm | response lost from APDU 5 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 128 | tap with an arm | power lost after APDU 5 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 129 | tap with an arm | response lost from APDU 6 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 130 | tap with an arm | power lost after APDU 6 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 131 | tap with an arm | response lost from APDU 7 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 132 | tap with an arm | power lost after APDU 7 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 133 | tap with an arm | response lost from APDU 8 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 134 | tap with an arm | power lost after APDU 8 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 135 | tap with an arm | response lost from APDU 9 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 136 | tap with an arm | power lost after APDU 9 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 137 | tap in Winiwa (second currency) | power cut before write 0 | R:HELLO | begin hello:850 < process:292 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 138 | tap in Winiwa (second currency) | power cut before write 1 | R:HELLO | write writeOutEntry:868 < hello:852 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 139 | tap in Winiwa (second currency) | power cut before write 2 | R:HELLO | write writeNextNonce:532 < hello:854 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 140 | tap in Winiwa (second currency) | power cut before write 3 | R:HELLO | commit hello:855 < process:292 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 141 | tap in Winiwa (second currency) | power cut before write 4 | P:PAY | begin pay:953 < process:293 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 142 | tap in Winiwa (second currency) | power cut before write 5 | P:PAY | write pay:954 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 143 | tap in Winiwa (second currency) | power cut before write 6 | P:PAY | write pay:955 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 144 | tap in Winiwa (second currency) | power cut before write 7 | P:PAY | write pay:957 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 145 | tap in Winiwa (second currency) | power cut before write 8 | P:PAY | write pay:961 < process:293 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 146 | tap in Winiwa (second currency) | power cut before write 9 | P:PAY | write pay:962 < process:293 (214 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 147 | tap in Winiwa (second currency) | power cut before write 10 | P:PAY | setByte pay:963 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 148 | tap in Winiwa (second currency) | power cut before write 11 | P:PAY | setByte pay:964 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 149 | tap in Winiwa (second currency) | power cut before write 12 | P:PAY | setByte pay:965 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 150 | tap in Winiwa (second currency) | power cut before write 13 | P:PAY | commit pay:966 < process:293 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 151 | tap in Winiwa (second currency) | power cut before write 14 | R:CREDIT | begin credit:1093 < process:294 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 152 | tap in Winiwa (second currency) | power cut before write 15 | R:CREDIT | write credit:1094 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 153 | tap in Winiwa (second currency) | power cut before write 16 | R:CREDIT | write credit:1095 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 154 | tap in Winiwa (second currency) | power cut before write 17 | R:CREDIT | setByte credit:1096 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 155 | tap in Winiwa (second currency) | power cut before write 18 | R:CREDIT | fill credit:1099 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 156 | tap in Winiwa (second currency) | power cut before write 19 | R:CREDIT | write credit:1101 < process:294 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 157 | tap in Winiwa (second currency) | power cut before write 20 | R:CREDIT | write credit:1102 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 158 | tap in Winiwa (second currency) | power cut before write 21 | R:CREDIT | setByte credit:1103 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 159 | tap in Winiwa (second currency) | power cut before write 22 | R:CREDIT | commit credit:1107 < process:294 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 160 | tap in Winiwa (second currency) | power cut before write 23 | P:ACK | setByte ack:1191 < process:295 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 161 | tap in Winiwa (second currency) | response lost from APDU 1 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 162 | tap in Winiwa (second currency) | power lost after APDU 1 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 163 | tap in Winiwa (second currency) | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 164 | tap in Winiwa (second currency) | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 165 | tap in Winiwa (second currency) | response lost from APDU 3 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 166 | tap in Winiwa (second currency) | power lost after APDU 3 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 167 | tap in Winiwa (second currency) | response lost from APDU 4 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 168 | tap in Winiwa (second currency) | power lost after APDU 4 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 169 | tap in Winiwa (second currency) | response lost from APDU 5 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 170 | tap in Winiwa (second currency) | power lost after APDU 5 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 171 | tap in Winiwa (second currency) | response lost from APDU 6 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 172 | tap in Winiwa (second currency) | power lost after APDU 6 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 173 | tap in Winiwa (second currency) | response lost from APDU 7 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 174 | tap in Winiwa (second currency) | power lost after APDU 7 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 175 | tap in Winiwa (second currency) | response lost from APDU 8 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 176 | tap in Winiwa (second currency) | power lost after APDU 8 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 177 | cancel | power cut before write 0 | R:HELLO | begin hello:850 < process:292 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 178 | cancel | power cut before write 1 | R:HELLO | write writeOutEntry:868 < hello:852 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 179 | cancel | power cut before write 2 | R:HELLO | write writeNextNonce:532 < hello:854 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 180 | cancel | power cut before write 3 | R:HELLO | commit hello:855 < process:292 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 181 | cancel | power cut before write 4 | P:PAY | begin pay:953 < process:293 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 182 | cancel | power cut before write 5 | P:PAY | write pay:954 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 183 | cancel | power cut before write 6 | P:PAY | write pay:955 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 184 | cancel | power cut before write 7 | P:PAY | write pay:957 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 185 | cancel | power cut before write 8 | P:PAY | write pay:961 < process:293 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 186 | cancel | power cut before write 9 | P:PAY | write pay:962 < process:293 (213 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 187 | cancel | power cut before write 10 | P:PAY | setByte pay:963 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 188 | cancel | power cut before write 11 | P:PAY | setByte pay:964 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 189 | cancel | power cut before write 12 | P:PAY | setByte pay:965 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 190 | cancel | power cut before write 13 | P:PAY | commit pay:966 < process:293 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 191 | cancel | power cut before write 14 | R:CANCEL_PROOF | begin cancelProof:1241 < process:297 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on R |
| 192 | cancel | power cut before write 15 | R:CANCEL_PROOF | fill cancelProof:1243 < process:297 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 193 | cancel | power cut before write 16 | R:CANCEL_PROOF | commit cancelProof:1244 < process:297 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on R |
| 194 | cancel | power cut before write 17 | P:CANCEL | begin cancel:1288 < process:298 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 195 | cancel | power cut before write 18 | P:CANCEL | write cancel:1289 < process:298 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 196 | cancel | power cut before write 19 | P:CANCEL | write cancel:1290 < process:298 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 197 | cancel | power cut before write 20 | P:CANCEL | setByte cancel:1291 < process:298 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 198 | cancel | power cut before write 21 | P:CANCEL | commit cancel:1292 < process:298 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 199 | cancel | response lost from APDU 1 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 200 | cancel | power lost after APDU 1 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 201 | cancel | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 202 | cancel | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 203 | cancel | response lost from APDU 3 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 204 | cancel | power lost after APDU 3 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 205 | cancel | response lost from APDU 4 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 206 | cancel | power lost after APDU 4 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 207 | cancel | response lost from APDU 5 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 208 | cancel | power lost after APDU 5 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 209 | cancel | response lost from APDU 6 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 210 | cancel | power lost after APDU 6 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 211 | cancel | response lost from APDU 7 | R | - | - | pass | pass | pass | pass | pass | response lost from R |
| 212 | cancel | power lost after APDU 7 | R | - | - | pass | pass | pass | pass | pass | power lost after the response of R |
| 213 | cancel | response lost from APDU 8 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 214 | cancel | power lost after APDU 8 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 215 | fund | power cut before write 0 | P:FUND | begin fund:1476 < process:302 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 216 | fund | power cut before write 1 | P:FUND | write fund:1477 < process:302 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 217 | fund | power cut before write 2 | P:FUND | write fund:1478 < process:302 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 218 | fund | power cut before write 3 | P:FUND | write fund:1479 < process:302 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 219 | fund | power cut before write 4 | P:FUND | commit fund:1480 < process:302 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 220 | fund | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 221 | fund | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 222 | defund | power cut before write 0 | P:VERIFY_PIN | setByte verifyPin:675 < process:287 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 223 | defund | power cut before write 1 | P:VERIFY_PIN | begin verifyPin:681 < process:287 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 224 | defund | power cut before write 2 | P:VERIFY_PIN | setByte verifyPin:682 < process:287 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 225 | defund | power cut before write 3 | P:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 226 | defund | power cut before write 4 | P:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 227 | defund | power cut before write 5 | P:VERIFY_PIN | commit verifyPin:691 < process:287 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 228 | defund | power cut before write 6 | P:DEFUND | begin defund:1540 < process:303 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 229 | defund | power cut before write 7 | P:DEFUND | write defund:1541 < process:303 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 230 | defund | power cut before write 8 | P:DEFUND | write defund:1542 < process:303 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 231 | defund | power cut before write 9 | P:DEFUND | setByte defund:1543 < process:303 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 232 | defund | power cut before write 10 | P:DEFUND | setShort defund:1544 < process:303 (2 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 233 | defund | power cut before write 11 | P:DEFUND | write defund:1545 < process:303 (248 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 234 | defund | power cut before write 12 | P:DEFUND | setByte defund:1546 < process:303 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 235 | defund | power cut before write 13 | P:DEFUND | commit defund:1547 < process:303 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 236 | defund | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 237 | defund | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 238 | defund | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 239 | defund | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 240 | defund | response lost from APDU 3 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 241 | defund | power lost after APDU 3 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 242 | defund | response lost from APDU 4 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 243 | defund | power lost after APDU 4 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 244 | defund | response lost from APDU 5 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 245 | defund | power lost after APDU 5 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 246 | defund | response lost from APDU 6 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 247 | defund | power lost after APDU 6 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 248 | defund | response lost from APDU 7 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 249 | defund | power lost after APDU 7 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 250 | defund | response lost from APDU 8 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 251 | defund | power lost after APDU 8 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 252 | defund | response lost from APDU 9 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 253 | defund | power lost after APDU 9 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 254 | defund | response lost from APDU 10 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 255 | defund | power lost after APDU 10 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 256 | defund | response lost from APDU 11 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 257 | defund | power lost after APDU 11 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 258 | defund | response lost from APDU 12 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 259 | defund | power lost after APDU 12 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 260 | defund | response lost from APDU 13 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 261 | defund | power lost after APDU 13 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 262 | defund | response lost from APDU 14 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 263 | defund | power lost after APDU 14 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 264 | defund | response lost from APDU 15 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 265 | defund | power lost after APDU 15 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 266 | defund | response lost from APDU 16 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 267 | defund | power lost after APDU 16 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 268 | defund | response lost from APDU 17 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 269 | defund | power lost after APDU 17 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 270 | defund | response lost from APDU 18 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 271 | defund | power lost after APDU 18 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 272 | defund | response lost from APDU 19 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 273 | defund | power lost after APDU 19 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 274 | defund | response lost from APDU 20 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 275 | defund | power lost after APDU 20 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 276 | defund | response lost from APDU 21 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 277 | defund | power lost after APDU 21 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 278 | defund | response lost from APDU 22 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 279 | defund | power lost after APDU 22 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 280 | defund | response lost from APDU 23 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 281 | defund | power lost after APDU 23 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 282 | defund | response lost from APDU 24 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 283 | defund | power lost after APDU 24 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 284 | defund | response lost from APDU 25 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 285 | defund | power lost after APDU 25 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 286 | defund | response lost from APDU 26 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 287 | defund | power lost after APDU 26 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 288 | defund | response lost from APDU 27 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 289 | defund | power lost after APDU 27 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 290 | defund | response lost from APDU 28 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 291 | defund | power lost after APDU 28 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 292 | defund | response lost from APDU 29 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 293 | defund | power lost after APDU 29 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 294 | defund | response lost from APDU 30 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 295 | defund | power lost after APDU 30 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 296 | defund | response lost from APDU 31 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 297 | defund | power lost after APDU 31 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 298 | defund | response lost from APDU 32 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 299 | defund | power lost after APDU 32 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 300 | defund | response lost from APDU 33 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 301 | defund | power lost after APDU 33 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 302 | defund | response lost from APDU 34 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 303 | defund | power lost after APDU 34 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 304 | defund | response lost from APDU 35 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 305 | defund | power lost after APDU 35 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 306 | defund | response lost from APDU 36 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 307 | defund | power lost after APDU 36 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 308 | wrong PIN | power cut before write 0 | P:VERIFY_PIN | setByte verifyPin:675 < process:287 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 309 | wrong PIN | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 310 | wrong PIN | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 311 | PUK unblock | power cut before write 0 | P:UNBLOCK_PIN | setByte unblockPin:728 < process:289 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 312 | PUK unblock | power cut before write 1 | P:UNBLOCK_PIN | begin unblockPin:735 < process:289 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 313 | PUK unblock | power cut before write 2 | P:UNBLOCK_PIN | setByte unblockPin:736 < process:289 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 314 | PUK unblock | power cut before write 3 | P:UNBLOCK_PIN | write unblockPin:737 < process:289 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 315 | PUK unblock | power cut before write 4 | P:UNBLOCK_PIN | setByte unblockPin:738 < process:289 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 316 | PUK unblock | power cut before write 5 | P:UNBLOCK_PIN | setByte unblockPin:739 < process:289 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 317 | PUK unblock | power cut before write 6 | P:UNBLOCK_PIN | commit unblockPin:740 < process:289 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 318 | PUK unblock | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 319 | PUK unblock | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 320 | wrong PUK | power cut before write 0 | P:UNBLOCK_PIN | setByte unblockPin:728 < process:289 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 321 | wrong PUK | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 322 | wrong PUK | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 323 | set limits | power cut before write 0 | P:VERIFY_PIN | setByte verifyPin:675 < process:287 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 324 | set limits | power cut before write 1 | P:VERIFY_PIN | begin verifyPin:681 < process:287 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 325 | set limits | power cut before write 2 | P:VERIFY_PIN | setByte verifyPin:682 < process:287 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 326 | set limits | power cut before write 3 | P:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 327 | set limits | power cut before write 4 | P:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 328 | set limits | power cut before write 5 | P:VERIFY_PIN | commit verifyPin:691 < process:287 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 329 | set limits | power cut before write 6 | P:SET_LIMITS | begin setLimits:758 < process:290 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 330 | set limits | power cut before write 7 | P:SET_LIMITS | write setLimits:759 < process:290 (32 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 331 | set limits | power cut before write 8 | P:SET_LIMITS | commit setLimits:760 < process:290 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 332 | set limits | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 333 | set limits | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 334 | set limits | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 335 | set limits | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 336 | change PIN | power cut before write 0 | P:VERIFY_PIN | setByte verifyPin:675 < process:287 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 337 | change PIN | power cut before write 1 | P:VERIFY_PIN | begin verifyPin:681 < process:287 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 338 | change PIN | power cut before write 2 | P:VERIFY_PIN | setByte verifyPin:682 < process:287 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 339 | change PIN | power cut before write 3 | P:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 340 | change PIN | power cut before write 4 | P:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 341 | change PIN | power cut before write 5 | P:VERIFY_PIN | commit verifyPin:691 < process:287 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 342 | change PIN | power cut before write 6 | P:CHANGE_PIN | begin changePin:711 < process:288 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 343 | change PIN | power cut before write 7 | P:CHANGE_PIN | write changePin:712 < process:288 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 344 | change PIN | power cut before write 8 | P:CHANGE_PIN | setByte changePin:713 < process:288 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 345 | change PIN | power cut before write 9 | P:CHANGE_PIN | commit changePin:714 < process:288 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 346 | change PIN | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 347 | change PIN | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 348 | change PIN | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 349 | change PIN | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 350 | registry snapshot | power cut before write 0 | P:SNAP_VENDORS | write snapVendors:1627 < process:306 (219 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 351 | registry snapshot | power cut before write 1 | P:SNAP_REVOCATIONS | write snapRevocations:1642 < process:307 (16 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 352 | registry snapshot | power cut before write 2 | P:SNAP_COMMIT | begin snapCommit:1665 < process:308 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 353 | registry snapshot | power cut before write 3 | P:SNAP_COMMIT | setByte snapCommit:1666 < process:308 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 354 | registry snapshot | power cut before write 4 | P:SNAP_COMMIT | setByte snapCommit:1667 < process:308 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 355 | registry snapshot | power cut before write 5 | P:SNAP_COMMIT | write snapCommit:1668 < process:308 (2 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 356 | registry snapshot | power cut before write 6 | P:SNAP_COMMIT | write snapCommit:1669 < process:308 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 357 | registry snapshot | power cut before write 7 | P:SNAP_COMMIT | write snapCommit:1670 < process:308 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 358 | registry snapshot | power cut before write 8 | P:SNAP_COMMIT | commit snapCommit:1671 < process:308 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 359 | registry snapshot | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 360 | registry snapshot | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 361 | registry snapshot | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 362 | registry snapshot | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 363 | registry snapshot | response lost from APDU 3 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 364 | registry snapshot | power lost after APDU 3 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 365 | registry snapshot | response lost from APDU 4 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 366 | registry snapshot | power lost after APDU 4 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 367 | registry snapshot | response lost from APDU 5 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 368 | registry snapshot | power lost after APDU 5 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 369 | swap receipt | power cut before write 0 | U:SWAP_EXPECT | begin swapExpect:1414 < process:301 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on U |
| 370 | swap receipt | power cut before write 1 | U:SWAP_EXPECT | write writeOutEntry:868 < swapExpect:1416 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 371 | swap receipt | power cut before write 2 | U:SWAP_EXPECT | write writeNextNonce:532 < swapExpect:1418 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 372 | swap receipt | power cut before write 3 | U:SWAP_EXPECT | write swapExpect:1419 < process:301 (32 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 373 | swap receipt | power cut before write 4 | U:SWAP_EXPECT | write swapExpect:1420 < process:301 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 374 | swap receipt | power cut before write 5 | U:SWAP_EXPECT | write swapExpect:1421 < process:301 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 375 | swap receipt | power cut before write 6 | U:SWAP_EXPECT | setByte swapExpect:1422 < process:301 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 376 | swap receipt | power cut before write 7 | U:SWAP_EXPECT | setByte swapExpect:1423 < process:301 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 377 | swap receipt | power cut before write 8 | U:SWAP_EXPECT | setByte swapExpect:1424 < process:301 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 378 | swap receipt | power cut before write 9 | U:SWAP_EXPECT | commit swapExpect:1425 < process:301 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 379 | swap receipt | power cut before write 10 | S:VERIFY_PIN | setByte verifyPin:675 < process:287 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on S |
| 380 | swap receipt | power cut before write 11 | S:VERIFY_PIN | begin verifyPin:681 < process:287 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on S |
| 381 | swap receipt | power cut before write 12 | S:VERIFY_PIN | setByte verifyPin:682 < process:287 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on S |
| 382 | swap receipt | power cut before write 13 | S:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on S |
| 383 | swap receipt | power cut before write 14 | S:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on S |
| 384 | swap receipt | power cut before write 15 | S:VERIFY_PIN | commit verifyPin:691 < process:287 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on S |
| 385 | swap receipt | power cut before write 16 | S:PAY | begin pay:953 < process:293 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on S |
| 386 | swap receipt | power cut before write 17 | S:PAY | write pay:954 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on S |
| 387 | swap receipt | power cut before write 18 | S:PAY | write pay:955 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on S |
| 388 | swap receipt | power cut before write 19 | S:PAY | write pay:961 < process:293 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on S |
| 389 | swap receipt | power cut before write 20 | S:PAY | write pay:962 < process:293 (215 B) | in tx | pass | pass | pass | pass | pass | power cut on S |
| 390 | swap receipt | power cut before write 21 | S:PAY | setByte pay:963 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on S |
| 391 | swap receipt | power cut before write 22 | S:PAY | setByte pay:964 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on S |
| 392 | swap receipt | power cut before write 23 | S:PAY | setByte pay:965 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on S |
| 393 | swap receipt | power cut before write 24 | S:PAY | commit pay:966 < process:293 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on S |
| 394 | swap receipt | power cut before write 25 | U:CREDIT | begin credit:1093 < process:294 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on U |
| 395 | swap receipt | power cut before write 26 | U:CREDIT | write credit:1094 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 396 | swap receipt | power cut before write 27 | U:CREDIT | write credit:1095 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 397 | swap receipt | power cut before write 28 | U:CREDIT | setByte credit:1096 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 398 | swap receipt | power cut before write 29 | U:CREDIT | fill credit:1099 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 399 | swap receipt | power cut before write 30 | U:CREDIT | write credit:1101 < process:294 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 400 | swap receipt | power cut before write 31 | U:CREDIT | write credit:1102 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 401 | swap receipt | power cut before write 32 | U:CREDIT | setByte credit:1103 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 402 | swap receipt | power cut before write 33 | U:CREDIT | setByte credit:1105 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 403 | swap receipt | power cut before write 34 | U:CREDIT | commit credit:1107 < process:294 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on U |
| 404 | swap receipt | power cut before write 35 | S:ACK | setByte ack:1191 < process:295 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on S |
| 405 | swap receipt | response lost from APDU 1 | U | - | - | pass | pass | pass | pass | pass | response lost from U |
| 406 | swap receipt | power lost after APDU 1 | U | - | - | pass | pass | pass | pass | pass | power lost after the response of U |
| 407 | swap receipt | response lost from APDU 2 | U | - | - | pass | pass | pass | pass | pass | response lost from U |
| 408 | swap receipt | power lost after APDU 2 | U | - | - | pass | pass | pass | pass | pass | power lost after the response of U |
| 409 | swap receipt | response lost from APDU 3 | S | - | - | pass | pass | pass | pass | pass | response lost from S |
| 410 | swap receipt | power lost after APDU 3 | S | - | - | pass | pass | pass | pass | pass | power lost after the response of S |
| 411 | swap receipt | response lost from APDU 4 | S | - | - | pass | pass | pass | pass | pass | response lost from S |
| 412 | swap receipt | power lost after APDU 4 | S | - | - | pass | pass | pass | pass | pass | power lost after the response of S |
| 413 | swap receipt | response lost from APDU 5 | U | - | - | pass | pass | pass | pass | pass | response lost from U |
| 414 | swap receipt | power lost after APDU 5 | U | - | - | pass | pass | pass | pass | pass | power lost after the response of U |
| 415 | swap receipt | response lost from APDU 6 | S | - | - | pass | pass | pass | pass | pass | response lost from S |
| 416 | swap receipt | power lost after APDU 6 | S | - | - | pass | pass | pass | pass | pass | power lost after the response of S |
| 417 | swap receipt | response lost from APDU 7 | S | - | - | pass | pass | pass | pass | pass | response lost from S |
| 418 | swap receipt | power lost after APDU 7 | S | - | - | pass | pass | pass | pass | pass | power lost after the response of S |
| 419 | swap receipt | response lost from APDU 8 | U | - | - | pass | pass | pass | pass | pass | response lost from U |
| 420 | swap receipt | power lost after APDU 8 | U | - | - | pass | pass | pass | pass | pass | power lost after the response of U |
| 421 | swap receipt | response lost from APDU 9 | S | - | - | pass | pass | pass | pass | pass | response lost from S |
| 422 | swap receipt | power lost after APDU 9 | S | - | - | pass | pass | pass | pass | pass | power lost after the response of S |
| 423 | receive tickets | power cut before write 0 | M:ISSUE_TICKETS | begin issueTickets:1348 < process:299 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on M |
| 424 | receive tickets | power cut before write 1 | M:ISSUE_TICKETS | write issueTickets:1358 < process:299 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 425 | receive tickets | power cut before write 2 | M:ISSUE_TICKETS | setByte issueTickets:1359 < process:299 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 426 | receive tickets | power cut before write 3 | M:ISSUE_TICKETS | setByte issueTickets:1360 < process:299 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 427 | receive tickets | power cut before write 4 | M:ISSUE_TICKETS | write issueTickets:1361 < process:299 (2 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 428 | receive tickets | power cut before write 5 | M:ISSUE_TICKETS | write issueTickets:1362 < process:299 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 429 | receive tickets | power cut before write 6 | M:ISSUE_TICKETS | fill issueTickets:1363 < process:299 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 430 | receive tickets | power cut before write 7 | M:ISSUE_TICKETS | write writeNextNonce:532 < issueTickets:1364 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 431 | receive tickets | power cut before write 8 | M:ISSUE_TICKETS | commit issueTickets:1365 < process:299 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 432 | receive tickets | power cut before write 9 | P:PAY | begin pay:953 < process:293 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 433 | receive tickets | power cut before write 10 | P:PAY | write pay:954 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 434 | receive tickets | power cut before write 11 | P:PAY | write pay:955 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 435 | receive tickets | power cut before write 12 | P:PAY | write pay:957 < process:293 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 436 | receive tickets | power cut before write 13 | P:PAY | write pay:961 < process:293 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 437 | receive tickets | power cut before write 14 | P:PAY | write pay:962 < process:293 (215 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 438 | receive tickets | power cut before write 15 | P:PAY | setByte pay:963 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 439 | receive tickets | power cut before write 16 | P:PAY | setByte pay:964 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 440 | receive tickets | power cut before write 17 | P:PAY | setByte pay:965 < process:293 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 441 | receive tickets | power cut before write 18 | P:PAY | commit pay:966 < process:293 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 442 | receive tickets | power cut before write 19 | M:CREDIT | begin credit:1093 < process:294 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on M |
| 443 | receive tickets | power cut before write 20 | M:CREDIT | write credit:1094 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 444 | receive tickets | power cut before write 21 | M:CREDIT | write credit:1095 < process:294 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 445 | receive tickets | power cut before write 22 | M:CREDIT | setByte credit:1096 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 446 | receive tickets | power cut before write 23 | M:CREDIT | write credit:1101 < process:294 (4 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 447 | receive tickets | power cut before write 24 | M:CREDIT | write credit:1102 < process:294 (16 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 448 | receive tickets | power cut before write 25 | M:CREDIT | setByte credit:1103 < process:294 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 449 | receive tickets | power cut before write 26 | M:CREDIT | commit credit:1107 < process:294 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on M |
| 450 | receive tickets | response lost from APDU 1 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 451 | receive tickets | power lost after APDU 1 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
| 452 | receive tickets | response lost from APDU 2 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 453 | receive tickets | power lost after APDU 2 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
| 454 | receive tickets | response lost from APDU 3 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 455 | receive tickets | power lost after APDU 3 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
| 456 | receive tickets | response lost from APDU 4 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 457 | receive tickets | power lost after APDU 4 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 458 | receive tickets | response lost from APDU 5 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 459 | receive tickets | power lost after APDU 5 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 460 | receive tickets | response lost from APDU 6 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 461 | receive tickets | power lost after APDU 6 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 462 | receive tickets | response lost from APDU 7 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 463 | receive tickets | power lost after APDU 7 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
| 464 | receive tickets | response lost from APDU 8 | M | - | - | pass | pass | pass | pass | pass | response lost from M |
| 465 | receive tickets | power lost after APDU 8 | M | - | - | pass | pass | pass | pass | pass | power lost after the response of M |
