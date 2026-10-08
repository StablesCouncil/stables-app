# Tear harness results (jCardSim, instrumented build)

Simulator only. The instrumented Persist layer models Java Card transaction semantics (journal and roll back at a tear); it is not evidence about a card's EEPROM. See docs/simulator-status.md for the limits.

**260 of 266 interruption points pass all four invariants.**

Largest single transaction: 265 bytes written (defund:1661 < process:305); the applet's install self-test requires a commit buffer of at least 512 bytes.

## Summary per scenario

| Scenario | Commands covered | Write points | APDUs | Cuts before a write | Cuts between APDUs | Failures |
|---|---|---|---|---|---|---|
| defund | VERIFY_PIN, DEFUND (commit key + debit), DEFUND_READ x34 | 14 | 36 | 14 | 72 | 2 |
| defund twice, chain out of order | VERIFY_PIN, DEFUND, DEFUND_READ x34, twice; the newer voucher reaches the chain first, the older one late | 28 | 76 | 28 | 152 | 4 |

## Every interruption point

I1 value conserved; I2 counters monotonic (and no PIN try given back); I3 no LX16 key reused; I4 torn tap credited once.

| # | Scenario | Interruption | APDU | Write (kind, source line, bytes) | Tx | I1 | I2 | I3 | I4 | Result | After the cut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | defund | power cut before write 0 | P:VERIFY_PIN | setByte verifyPin:688 < process:289 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 2 | defund | power cut before write 1 | P:VERIFY_PIN | begin verifyPin:694 < process:289 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 3 | defund | power cut before write 2 | P:VERIFY_PIN | setByte verifyPin:695 < process:289 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 4 | defund | power cut before write 3 | P:VERIFY_PIN | write verifyPin:698 < process:289 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 5 | defund | power cut before write 4 | P:VERIFY_PIN | write verifyPin:698 < process:289 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 6 | defund | power cut before write 5 | P:VERIFY_PIN | commit verifyPin:704 < process:289 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 7 | defund | power cut before write 6 | P:DEFUND | begin defund:1657 < process:305 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 8 | defund | power cut before write 7 | P:DEFUND | write defund:1658 < process:305 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 9 | defund | power cut before write 8 | P:DEFUND | write defund:1659 < process:305 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 10 | defund | power cut before write 9 | P:DEFUND | write defund:1660 < process:305 (248 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 11 | defund | power cut before write 10 | P:DEFUND | setByte defund:1661 < process:305 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 12 | defund | power cut before write 11 | P:DEFUND | commit defund:1662 < process:305 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 13 | defund | power cut before write 12 | P:DEFUND | setByte defund:1663 < process:305 (1 B) | atomic | pass | pass | FAIL after recovery: key P:1 emitted two digests | pass | **FAIL**  | power cut on P |
| 14 | defund | power cut before write 13 | P:DEFUND | setByte defund:1664 < process:305 (1 B) | atomic | pass | pass | FAIL after recovery: key P:1 emitted two digests | pass | **FAIL**  | power cut on P |
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
| 87 | defund twice, chain out of order | power cut before write 0 | P:VERIFY_PIN | setByte verifyPin:688 < process:289 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 88 | defund twice, chain out of order | power cut before write 1 | P:VERIFY_PIN | begin verifyPin:694 < process:289 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 89 | defund twice, chain out of order | power cut before write 2 | P:VERIFY_PIN | setByte verifyPin:695 < process:289 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 90 | defund twice, chain out of order | power cut before write 3 | P:VERIFY_PIN | write verifyPin:698 < process:289 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 91 | defund twice, chain out of order | power cut before write 4 | P:VERIFY_PIN | write verifyPin:698 < process:289 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 92 | defund twice, chain out of order | power cut before write 5 | P:VERIFY_PIN | commit verifyPin:704 < process:289 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 93 | defund twice, chain out of order | power cut before write 6 | P:DEFUND | begin defund:1657 < process:305 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 94 | defund twice, chain out of order | power cut before write 7 | P:DEFUND | write defund:1658 < process:305 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 95 | defund twice, chain out of order | power cut before write 8 | P:DEFUND | write defund:1659 < process:305 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 96 | defund twice, chain out of order | power cut before write 9 | P:DEFUND | write defund:1660 < process:305 (248 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 97 | defund twice, chain out of order | power cut before write 10 | P:DEFUND | setByte defund:1661 < process:305 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 98 | defund twice, chain out of order | power cut before write 11 | P:DEFUND | commit defund:1662 < process:305 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 99 | defund twice, chain out of order | power cut before write 12 | P:DEFUND | setByte defund:1663 < process:305 (1 B) | atomic | FAIL after recovery: USDw balances 459.00 + in flight 0.00 + vouchers 40.00 = 499.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 500.00 + in flight 0.00 + vouchers 0.00 = 500.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | FAIL after recovery: key P:1 emitted two digests | pass | **FAIL** the chain paid 40.00 for 41.00 debited (paid 40.00 for key 1; refused key 1: key index not above 1; refused key 1: key index not above 1; refused key 1: key index not above 1) | power cut on P |
| 100 | defund twice, chain out of order | power cut before write 13 | P:DEFUND | setByte defund:1664 < process:305 (1 B) | atomic | FAIL after recovery: USDw balances 459.00 + in flight 0.00 + vouchers 40.00 = 499.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 500.00 + in flight 0.00 + vouchers 0.00 = 500.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | FAIL after recovery: key P:1 emitted two digests | pass | **FAIL** the chain paid 40.00 for 41.00 debited (paid 40.00 for key 1; refused key 1: key index not above 1; refused key 1: key index not above 1; refused key 1: key index not above 1) | power cut on P |
| 101 | defund twice, chain out of order | power cut before write 14 | P:VERIFY_PIN | setByte verifyPin:688 < process:289 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 102 | defund twice, chain out of order | power cut before write 15 | P:VERIFY_PIN | begin verifyPin:694 < process:289 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 103 | defund twice, chain out of order | power cut before write 16 | P:VERIFY_PIN | setByte verifyPin:695 < process:289 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 104 | defund twice, chain out of order | power cut before write 17 | P:VERIFY_PIN | write verifyPin:698 < process:289 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 105 | defund twice, chain out of order | power cut before write 18 | P:VERIFY_PIN | write verifyPin:698 < process:289 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 106 | defund twice, chain out of order | power cut before write 19 | P:VERIFY_PIN | commit verifyPin:704 < process:289 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 107 | defund twice, chain out of order | power cut before write 20 | P:DEFUND | begin defund:1657 < process:305 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 108 | defund twice, chain out of order | power cut before write 21 | P:DEFUND | write defund:1658 < process:305 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 109 | defund twice, chain out of order | power cut before write 22 | P:DEFUND | write defund:1659 < process:305 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 110 | defund twice, chain out of order | power cut before write 23 | P:DEFUND | write defund:1660 < process:305 (248 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 111 | defund twice, chain out of order | power cut before write 24 | P:DEFUND | setByte defund:1661 < process:305 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 112 | defund twice, chain out of order | power cut before write 25 | P:DEFUND | commit defund:1662 < process:305 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 113 | defund twice, chain out of order | power cut before write 26 | P:DEFUND | setByte defund:1663 < process:305 (1 B) | atomic | FAIL after recovery: USDw balances 434.00 + in flight 0.00 + vouchers 65.00 = 499.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 500.00 + in flight 0.00 + vouchers 0.00 = 500.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | FAIL after recovery: key P:2 emitted two digests | pass | **FAIL** the chain paid 65.00 for 66.00 debited (paid 65.00 for key 2; refused key 1: key index not above 2; refused key 2: key index not above 2; refused key 2: key index not above 2; refused key 2: key index not above 2; refused key 1: key index not above 2) | power cut on P |
| 114 | defund twice, chain out of order | power cut before write 27 | P:DEFUND | setByte defund:1664 < process:305 (1 B) | atomic | FAIL after recovery: USDw balances 434.00 + in flight 0.00 + vouchers 65.00 = 499.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 500.00 + in flight 0.00 + vouchers 0.00 = 500.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | FAIL after recovery: key P:2 emitted two digests | pass | **FAIL** the chain paid 65.00 for 66.00 debited (paid 65.00 for key 2; refused key 1: key index not above 2; refused key 2: key index not above 2; refused key 2: key index not above 2; refused key 2: key index not above 2; refused key 1: key index not above 2) | power cut on P |
| 115 | defund twice, chain out of order | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 116 | defund twice, chain out of order | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 117 | defund twice, chain out of order | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 118 | defund twice, chain out of order | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 119 | defund twice, chain out of order | response lost from APDU 3 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 120 | defund twice, chain out of order | power lost after APDU 3 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 121 | defund twice, chain out of order | response lost from APDU 4 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 122 | defund twice, chain out of order | power lost after APDU 4 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 123 | defund twice, chain out of order | response lost from APDU 5 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 124 | defund twice, chain out of order | power lost after APDU 5 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 125 | defund twice, chain out of order | response lost from APDU 6 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 126 | defund twice, chain out of order | power lost after APDU 6 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 127 | defund twice, chain out of order | response lost from APDU 7 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 128 | defund twice, chain out of order | power lost after APDU 7 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 129 | defund twice, chain out of order | response lost from APDU 8 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 130 | defund twice, chain out of order | power lost after APDU 8 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 131 | defund twice, chain out of order | response lost from APDU 9 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 132 | defund twice, chain out of order | power lost after APDU 9 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 133 | defund twice, chain out of order | response lost from APDU 10 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 134 | defund twice, chain out of order | power lost after APDU 10 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 135 | defund twice, chain out of order | response lost from APDU 11 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 136 | defund twice, chain out of order | power lost after APDU 11 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 137 | defund twice, chain out of order | response lost from APDU 12 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 138 | defund twice, chain out of order | power lost after APDU 12 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 139 | defund twice, chain out of order | response lost from APDU 13 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 140 | defund twice, chain out of order | power lost after APDU 13 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 141 | defund twice, chain out of order | response lost from APDU 14 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 142 | defund twice, chain out of order | power lost after APDU 14 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 143 | defund twice, chain out of order | response lost from APDU 15 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 144 | defund twice, chain out of order | power lost after APDU 15 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 145 | defund twice, chain out of order | response lost from APDU 16 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 146 | defund twice, chain out of order | power lost after APDU 16 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 147 | defund twice, chain out of order | response lost from APDU 17 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 148 | defund twice, chain out of order | power lost after APDU 17 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 149 | defund twice, chain out of order | response lost from APDU 18 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 150 | defund twice, chain out of order | power lost after APDU 18 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 151 | defund twice, chain out of order | response lost from APDU 19 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 152 | defund twice, chain out of order | power lost after APDU 19 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 153 | defund twice, chain out of order | response lost from APDU 20 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 154 | defund twice, chain out of order | power lost after APDU 20 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 155 | defund twice, chain out of order | response lost from APDU 21 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 156 | defund twice, chain out of order | power lost after APDU 21 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 157 | defund twice, chain out of order | response lost from APDU 22 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 158 | defund twice, chain out of order | power lost after APDU 22 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 159 | defund twice, chain out of order | response lost from APDU 23 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 160 | defund twice, chain out of order | power lost after APDU 23 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 161 | defund twice, chain out of order | response lost from APDU 24 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 162 | defund twice, chain out of order | power lost after APDU 24 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 163 | defund twice, chain out of order | response lost from APDU 25 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 164 | defund twice, chain out of order | power lost after APDU 25 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 165 | defund twice, chain out of order | response lost from APDU 26 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 166 | defund twice, chain out of order | power lost after APDU 26 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 167 | defund twice, chain out of order | response lost from APDU 27 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 168 | defund twice, chain out of order | power lost after APDU 27 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 169 | defund twice, chain out of order | response lost from APDU 28 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 170 | defund twice, chain out of order | power lost after APDU 28 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 171 | defund twice, chain out of order | response lost from APDU 29 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 172 | defund twice, chain out of order | power lost after APDU 29 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 173 | defund twice, chain out of order | response lost from APDU 30 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 174 | defund twice, chain out of order | power lost after APDU 30 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 175 | defund twice, chain out of order | response lost from APDU 31 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 176 | defund twice, chain out of order | power lost after APDU 31 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 177 | defund twice, chain out of order | response lost from APDU 32 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 178 | defund twice, chain out of order | power lost after APDU 32 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 179 | defund twice, chain out of order | response lost from APDU 33 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 180 | defund twice, chain out of order | power lost after APDU 33 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 181 | defund twice, chain out of order | response lost from APDU 34 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 182 | defund twice, chain out of order | power lost after APDU 34 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 183 | defund twice, chain out of order | response lost from APDU 35 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 184 | defund twice, chain out of order | power lost after APDU 35 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 185 | defund twice, chain out of order | response lost from APDU 36 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 186 | defund twice, chain out of order | power lost after APDU 36 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 187 | defund twice, chain out of order | response lost from APDU 37 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 188 | defund twice, chain out of order | power lost after APDU 37 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 189 | defund twice, chain out of order | response lost from APDU 38 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 190 | defund twice, chain out of order | power lost after APDU 38 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 191 | defund twice, chain out of order | response lost from APDU 39 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 192 | defund twice, chain out of order | power lost after APDU 39 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 193 | defund twice, chain out of order | response lost from APDU 40 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 194 | defund twice, chain out of order | power lost after APDU 40 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 195 | defund twice, chain out of order | response lost from APDU 41 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 196 | defund twice, chain out of order | power lost after APDU 41 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 197 | defund twice, chain out of order | response lost from APDU 42 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 198 | defund twice, chain out of order | power lost after APDU 42 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 199 | defund twice, chain out of order | response lost from APDU 43 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 200 | defund twice, chain out of order | power lost after APDU 43 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 201 | defund twice, chain out of order | response lost from APDU 44 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 202 | defund twice, chain out of order | power lost after APDU 44 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 203 | defund twice, chain out of order | response lost from APDU 45 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 204 | defund twice, chain out of order | power lost after APDU 45 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 205 | defund twice, chain out of order | response lost from APDU 46 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 206 | defund twice, chain out of order | power lost after APDU 46 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 207 | defund twice, chain out of order | response lost from APDU 47 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 208 | defund twice, chain out of order | power lost after APDU 47 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 209 | defund twice, chain out of order | response lost from APDU 48 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 210 | defund twice, chain out of order | power lost after APDU 48 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 211 | defund twice, chain out of order | response lost from APDU 49 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 212 | defund twice, chain out of order | power lost after APDU 49 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 213 | defund twice, chain out of order | response lost from APDU 50 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 214 | defund twice, chain out of order | power lost after APDU 50 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 215 | defund twice, chain out of order | response lost from APDU 51 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 216 | defund twice, chain out of order | power lost after APDU 51 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 217 | defund twice, chain out of order | response lost from APDU 52 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 218 | defund twice, chain out of order | power lost after APDU 52 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 219 | defund twice, chain out of order | response lost from APDU 53 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 220 | defund twice, chain out of order | power lost after APDU 53 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 221 | defund twice, chain out of order | response lost from APDU 54 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 222 | defund twice, chain out of order | power lost after APDU 54 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 223 | defund twice, chain out of order | response lost from APDU 55 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 224 | defund twice, chain out of order | power lost after APDU 55 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 225 | defund twice, chain out of order | response lost from APDU 56 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 226 | defund twice, chain out of order | power lost after APDU 56 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 227 | defund twice, chain out of order | response lost from APDU 57 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 228 | defund twice, chain out of order | power lost after APDU 57 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 229 | defund twice, chain out of order | response lost from APDU 58 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 230 | defund twice, chain out of order | power lost after APDU 58 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 231 | defund twice, chain out of order | response lost from APDU 59 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 232 | defund twice, chain out of order | power lost after APDU 59 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 233 | defund twice, chain out of order | response lost from APDU 60 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 234 | defund twice, chain out of order | power lost after APDU 60 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 235 | defund twice, chain out of order | response lost from APDU 61 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 236 | defund twice, chain out of order | power lost after APDU 61 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 237 | defund twice, chain out of order | response lost from APDU 62 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 238 | defund twice, chain out of order | power lost after APDU 62 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 239 | defund twice, chain out of order | response lost from APDU 63 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 240 | defund twice, chain out of order | power lost after APDU 63 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 241 | defund twice, chain out of order | response lost from APDU 64 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 242 | defund twice, chain out of order | power lost after APDU 64 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 243 | defund twice, chain out of order | response lost from APDU 65 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 244 | defund twice, chain out of order | power lost after APDU 65 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 245 | defund twice, chain out of order | response lost from APDU 66 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 246 | defund twice, chain out of order | power lost after APDU 66 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 247 | defund twice, chain out of order | response lost from APDU 67 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 248 | defund twice, chain out of order | power lost after APDU 67 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 249 | defund twice, chain out of order | response lost from APDU 68 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 250 | defund twice, chain out of order | power lost after APDU 68 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 251 | defund twice, chain out of order | response lost from APDU 69 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 252 | defund twice, chain out of order | power lost after APDU 69 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 253 | defund twice, chain out of order | response lost from APDU 70 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 254 | defund twice, chain out of order | power lost after APDU 70 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 255 | defund twice, chain out of order | response lost from APDU 71 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 256 | defund twice, chain out of order | power lost after APDU 71 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 257 | defund twice, chain out of order | response lost from APDU 72 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 258 | defund twice, chain out of order | power lost after APDU 72 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 259 | defund twice, chain out of order | response lost from APDU 73 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 260 | defund twice, chain out of order | power lost after APDU 73 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 261 | defund twice, chain out of order | response lost from APDU 74 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 262 | defund twice, chain out of order | power lost after APDU 74 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 263 | defund twice, chain out of order | response lost from APDU 75 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 264 | defund twice, chain out of order | power lost after APDU 75 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 265 | defund twice, chain out of order | response lost from APDU 76 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 266 | defund twice, chain out of order | power lost after APDU 76 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
