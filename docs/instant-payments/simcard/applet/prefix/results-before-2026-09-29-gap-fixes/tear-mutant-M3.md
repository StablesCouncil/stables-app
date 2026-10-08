# Tear harness results (jCardSim, instrumented build)

Simulator only. The instrumented Persist layer models Java Card transaction semantics (journal and roll back at a tear); it is not evidence about a card's EEPROM. See docs/simulator-status.md for the limits.

**84 of 86 interruption points pass all four invariants.**

Largest single transaction: 265 bytes written (defund:1544 < process:303); the applet's install self-test requires a commit buffer of at least 512 bytes.

## Summary per scenario

| Scenario | Commands covered | Write points | APDUs | Cuts before a write | Cuts between APDUs | Failures |
|---|---|---|---|---|---|---|
| defund | VERIFY_PIN, DEFUND (commit key + debit), DEFUND_READ x34 | 14 | 36 | 14 | 72 | 2 |

## Every interruption point

I1 value conserved; I2 counters monotonic (and no PIN try given back); I3 no LX16 key reused; I4 torn tap credited once.

| # | Scenario | Interruption | APDU | Write (kind, source line, bytes) | Tx | I1 | I2 | I3 | I4 | Result | After the cut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | defund | power cut before write 0 | P:VERIFY_PIN | setByte verifyPin:675 < process:287 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 2 | defund | power cut before write 1 | P:VERIFY_PIN | begin verifyPin:681 < process:287 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 3 | defund | power cut before write 2 | P:VERIFY_PIN | setByte verifyPin:682 < process:287 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 4 | defund | power cut before write 3 | P:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 5 | defund | power cut before write 4 | P:VERIFY_PIN | write verifyPin:685 < process:287 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 6 | defund | power cut before write 5 | P:VERIFY_PIN | commit verifyPin:691 < process:287 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 7 | defund | power cut before write 6 | P:DEFUND | begin defund:1540 < process:303 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 8 | defund | power cut before write 7 | P:DEFUND | write defund:1541 < process:303 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 9 | defund | power cut before write 8 | P:DEFUND | write defund:1542 < process:303 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 10 | defund | power cut before write 9 | P:DEFUND | write defund:1543 < process:303 (248 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 11 | defund | power cut before write 10 | P:DEFUND | setByte defund:1544 < process:303 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 12 | defund | power cut before write 11 | P:DEFUND | commit defund:1545 < process:303 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 13 | defund | power cut before write 12 | P:DEFUND | setByte defund:1546 < process:303 (1 B) | atomic | pass | pass | FAIL after recovery: key P:1 emitted two digests | pass | **FAIL**  | power cut on P |
| 14 | defund | power cut before write 13 | P:DEFUND | setByte defund:1547 < process:303 (1 B) | atomic | pass | pass | FAIL after recovery: key P:1 emitted two digests | pass | **FAIL**  | power cut on P |
| 15 | defund | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 16 | defund | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 17 | defund | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 18 | defund | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 19 | defund | response lost from APDU 3 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 20 | defund | power lost after APDU 3 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 21 | defund | response lost from APDU 4 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 22 | defund | power lost after APDU 4 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 23 | defund | response lost from APDU 5 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 24 | defund | power lost after APDU 5 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 25 | defund | response lost from APDU 6 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 26 | defund | power lost after APDU 6 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 27 | defund | response lost from APDU 7 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 28 | defund | power lost after APDU 7 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 29 | defund | response lost from APDU 8 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 30 | defund | power lost after APDU 8 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 31 | defund | response lost from APDU 9 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 32 | defund | power lost after APDU 9 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 33 | defund | response lost from APDU 10 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 34 | defund | power lost after APDU 10 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 35 | defund | response lost from APDU 11 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 36 | defund | power lost after APDU 11 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 37 | defund | response lost from APDU 12 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 38 | defund | power lost after APDU 12 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 39 | defund | response lost from APDU 13 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 40 | defund | power lost after APDU 13 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 41 | defund | response lost from APDU 14 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 42 | defund | power lost after APDU 14 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 43 | defund | response lost from APDU 15 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 44 | defund | power lost after APDU 15 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 45 | defund | response lost from APDU 16 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 46 | defund | power lost after APDU 16 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 47 | defund | response lost from APDU 17 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 48 | defund | power lost after APDU 17 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 49 | defund | response lost from APDU 18 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 50 | defund | power lost after APDU 18 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 51 | defund | response lost from APDU 19 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 52 | defund | power lost after APDU 19 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 53 | defund | response lost from APDU 20 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 54 | defund | power lost after APDU 20 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 55 | defund | response lost from APDU 21 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 56 | defund | power lost after APDU 21 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 57 | defund | response lost from APDU 22 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 58 | defund | power lost after APDU 22 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 59 | defund | response lost from APDU 23 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 60 | defund | power lost after APDU 23 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 61 | defund | response lost from APDU 24 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 62 | defund | power lost after APDU 24 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 63 | defund | response lost from APDU 25 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 64 | defund | power lost after APDU 25 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 65 | defund | response lost from APDU 26 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 66 | defund | power lost after APDU 26 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 67 | defund | response lost from APDU 27 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 68 | defund | power lost after APDU 27 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 69 | defund | response lost from APDU 28 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 70 | defund | power lost after APDU 28 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 71 | defund | response lost from APDU 29 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 72 | defund | power lost after APDU 29 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 73 | defund | response lost from APDU 30 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 74 | defund | power lost after APDU 30 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 75 | defund | response lost from APDU 31 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 76 | defund | power lost after APDU 31 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 77 | defund | response lost from APDU 32 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 78 | defund | power lost after APDU 32 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 79 | defund | response lost from APDU 33 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 80 | defund | power lost after APDU 33 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 81 | defund | response lost from APDU 34 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 82 | defund | power lost after APDU 34 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 83 | defund | response lost from APDU 35 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 84 | defund | power lost after APDU 35 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 85 | defund | response lost from APDU 36 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 86 | defund | power lost after APDU 36 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
