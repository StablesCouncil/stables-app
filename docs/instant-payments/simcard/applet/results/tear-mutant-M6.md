# Tear harness results (jCardSim, instrumented build)

Simulator only. The instrumented Persist layer models Java Card transaction semantics (journal and roll back at a tear); it is not evidence about a card's EEPROM. See docs/simulator-status.md for the limits.

**0 of 4 interruption points pass all four invariants.**

Largest single transaction: 153 bytes written (persoSetCert:1833 < process:312); the applet's install self-test requires a commit buffer of at least 512 bytes.

## Summary per scenario

| Scenario | Commands covered | Write points | APDUs | Cuts before a write | Cuts between APDUs | Failures |
|---|---|---|---|---|---|---|
| wrong PIN | VERIFY_PIN with a wrong PIN | 1 | 1 | 1 | 2 | 3 |

## Every interruption point

I1 value conserved; I2 counters monotonic (and no PIN try given back); I3 no LX16 key reused; I4 torn tap credited once.

| # | Scenario | Interruption | APDU | Write (kind, source line, bytes) | Tx | I1 | I2 | I3 | I4 | Result | After the cut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | wrong PIN | none (enumeration run) | - | - | - | pass | pass | pass | pass | **FAIL** persistence violations: [secret compared before a try was durably spent (tries before 3, now 3) at verifyPin:688 < process:289] | completed |
| 2 | wrong PIN | power cut before write 0 | P:VERIFY_PIN | setByte verifyPin:690 < process:289 (1 B) | atomic | pass | pass | pass | pass | **FAIL**  persistence violations: [secret compared before a try was durably spent (tries before 3, now 3) at verifyPin:688 < process:289] | power cut on P |
| 3 | wrong PIN | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | **FAIL**  persistence violations: [secret compared before a try was durably spent (tries before 3, now 3) at verifyPin:688 < process:289] | response lost from P |
| 4 | wrong PIN | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | **FAIL**  persistence violations: [secret compared before a try was durably spent (tries before 3, now 3) at verifyPin:688 < process:289] | power lost after the response of P |
