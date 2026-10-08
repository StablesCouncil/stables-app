# Tear harness results (jCardSim, instrumented build)

Simulator only. The instrumented Persist layer models Java Card transaction semantics (journal and roll back at a tear); it is not evidence about a card's EEPROM. See docs/simulator-status.md for the limits.

**178 of 184 interruption points pass all four invariants.**

Largest single transaction: 260 bytes written (defund:1662 < process:305); the applet's install self-test requires a commit buffer of at least 512 bytes.

## Summary per scenario

| Scenario | Commands covered | Write points | APDUs | Cuts before a write | Cuts between APDUs | Failures |
|---|---|---|---|---|---|---|
| defund twice, chain out of order | VERIFY_PIN, DEFUND, DEFUND_READ x34, twice; the newer voucher reaches the chain first, the older one late | 32 | 76 | 32 | 152 | 6 |

## Every interruption point

I1 value conserved; I2 counters monotonic (and no PIN try given back); I3 no LX16 key reused; I4 torn tap credited once.

| # | Scenario | Interruption | APDU | Write (kind, source line, bytes) | Tx | I1 | I2 | I3 | I4 | Result | After the cut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | defund twice, chain out of order | power cut before write 0 | P:VERIFY_PIN | setByte verifyPin:688 < process:289 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 2 | defund twice, chain out of order | power cut before write 1 | P:VERIFY_PIN | begin verifyPin:694 < process:289 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 3 | defund twice, chain out of order | power cut before write 2 | P:VERIFY_PIN | setByte verifyPin:695 < process:289 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 4 | defund twice, chain out of order | power cut before write 3 | P:VERIFY_PIN | write verifyPin:698 < process:289 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 5 | defund twice, chain out of order | power cut before write 4 | P:VERIFY_PIN | write verifyPin:698 < process:289 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 6 | defund twice, chain out of order | power cut before write 5 | P:VERIFY_PIN | commit verifyPin:704 < process:289 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 7 | defund twice, chain out of order | power cut before write 6 | P:DEFUND | begin defund:1657 < process:305 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 8 | defund twice, chain out of order | power cut before write 7 | P:DEFUND | write defund:1658 < process:305 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 9 | defund twice, chain out of order | power cut before write 8 | P:DEFUND | setByte defund:1659 < process:305 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 10 | defund twice, chain out of order | power cut before write 9 | P:DEFUND | setShort defund:1660 < process:305 (2 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 11 | defund twice, chain out of order | power cut before write 10 | P:DEFUND | write defund:1661 < process:305 (248 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 12 | defund twice, chain out of order | power cut before write 11 | P:DEFUND | setByte defund:1662 < process:305 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 13 | defund twice, chain out of order | power cut before write 12 | P:DEFUND | commit defund:1663 < process:305 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 14 | defund twice, chain out of order | power cut before write 13 | P:DEFUND | begin defund:1664 < process:305 (0 B) | atomic | FAIL after recovery: USDw balances 459.00 + in flight 0.00 + vouchers 40.00 = 499.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 500.00 + in flight 0.00 + vouchers 0.00 = 500.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL** the chain paid 40.00 for 1.00 debited (paid 40.00 for key 1; refused key 2: nothing to pay; refused key 2: nothing to pay; refused key 1: key index not above 1) | power cut on P |
| 15 | defund twice, chain out of order | power cut before write 14 | P:DEFUND | write defund:1665 < process:305 (8 B) | in tx | FAIL after recovery: USDw balances 459.00 + in flight 0.00 + vouchers 40.00 = 499.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 500.00 + in flight 0.00 + vouchers 0.00 = 500.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL** the chain paid 40.00 for 1.00 debited (paid 40.00 for key 1; refused key 2: nothing to pay; refused key 2: nothing to pay; refused key 1: key index not above 1) | power cut on P |
| 16 | defund twice, chain out of order | power cut before write 15 | P:DEFUND | commit defund:1666 < process:305 (0 B) | in tx | FAIL after recovery: USDw balances 459.00 + in flight 0.00 + vouchers 40.00 = 499.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 500.00 + in flight 0.00 + vouchers 0.00 = 500.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL** the chain paid 40.00 for 1.00 debited (paid 40.00 for key 1; refused key 2: nothing to pay; refused key 2: nothing to pay; refused key 1: key index not above 1) | power cut on P |
| 17 | defund twice, chain out of order | power cut before write 16 | P:VERIFY_PIN | setByte verifyPin:688 < process:289 (1 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 18 | defund twice, chain out of order | power cut before write 17 | P:VERIFY_PIN | begin verifyPin:694 < process:289 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 19 | defund twice, chain out of order | power cut before write 18 | P:VERIFY_PIN | setByte verifyPin:695 < process:289 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 20 | defund twice, chain out of order | power cut before write 19 | P:VERIFY_PIN | write verifyPin:698 < process:289 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 21 | defund twice, chain out of order | power cut before write 20 | P:VERIFY_PIN | write verifyPin:698 < process:289 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 22 | defund twice, chain out of order | power cut before write 21 | P:VERIFY_PIN | commit verifyPin:704 < process:289 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 23 | defund twice, chain out of order | power cut before write 22 | P:DEFUND | begin defund:1657 < process:305 (0 B) | atomic | pass | pass | pass | pass | pass | power cut on P |
| 24 | defund twice, chain out of order | power cut before write 23 | P:DEFUND | write defund:1658 < process:305 (8 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 25 | defund twice, chain out of order | power cut before write 24 | P:DEFUND | setByte defund:1659 < process:305 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 26 | defund twice, chain out of order | power cut before write 25 | P:DEFUND | setShort defund:1660 < process:305 (2 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 27 | defund twice, chain out of order | power cut before write 26 | P:DEFUND | write defund:1661 < process:305 (248 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 28 | defund twice, chain out of order | power cut before write 27 | P:DEFUND | setByte defund:1662 < process:305 (1 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 29 | defund twice, chain out of order | power cut before write 28 | P:DEFUND | commit defund:1663 < process:305 (0 B) | in tx | pass | pass | pass | pass | pass | power cut on P |
| 30 | defund twice, chain out of order | power cut before write 29 | P:DEFUND | begin defund:1664 < process:305 (0 B) | atomic | FAIL after recovery: USDw balances 434.00 + in flight 0.00 + vouchers 65.00 = 499.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 500.00 + in flight 0.00 + vouchers 0.00 = 500.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL** the chain paid 65.00 for 41.00 debited (paid 65.00 for key 2; refused key 1: key index not above 2; refused key 3: nothing to pay; refused key 3: nothing to pay; refused key 2: key index not above 2; refused key 1: key index not above 2) | power cut on P |
| 31 | defund twice, chain out of order | power cut before write 30 | P:DEFUND | write defund:1665 < process:305 (8 B) | in tx | FAIL after recovery: USDw balances 434.00 + in flight 0.00 + vouchers 65.00 = 499.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 500.00 + in flight 0.00 + vouchers 0.00 = 500.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL** the chain paid 65.00 for 41.00 debited (paid 65.00 for key 2; refused key 1: key index not above 2; refused key 3: nothing to pay; refused key 3: nothing to pay; refused key 2: key index not above 2; refused key 1: key index not above 2) | power cut on P |
| 32 | defund twice, chain out of order | power cut before write 31 | P:DEFUND | commit defund:1666 < process:305 (0 B) | in tx | FAIL after recovery: USDw balances 434.00 + in flight 0.00 + vouchers 65.00 = 499.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00 (before: USDw balances 500.00 + in flight 0.00 + vouchers 0.00 = 500.00; Winiwa balances 40.00 + in flight 0.00 + vouchers 0.00 = 40.00) | pass | pass | pass | **FAIL** the chain paid 65.00 for 41.00 debited (paid 65.00 for key 2; refused key 1: key index not above 2; refused key 3: nothing to pay; refused key 3: nothing to pay; refused key 2: key index not above 2; refused key 1: key index not above 2) | power cut on P |
| 33 | defund twice, chain out of order | response lost from APDU 1 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 34 | defund twice, chain out of order | power lost after APDU 1 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 35 | defund twice, chain out of order | response lost from APDU 2 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 36 | defund twice, chain out of order | power lost after APDU 2 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 37 | defund twice, chain out of order | response lost from APDU 3 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 38 | defund twice, chain out of order | power lost after APDU 3 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 39 | defund twice, chain out of order | response lost from APDU 4 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 40 | defund twice, chain out of order | power lost after APDU 4 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 41 | defund twice, chain out of order | response lost from APDU 5 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 42 | defund twice, chain out of order | power lost after APDU 5 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 43 | defund twice, chain out of order | response lost from APDU 6 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 44 | defund twice, chain out of order | power lost after APDU 6 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 45 | defund twice, chain out of order | response lost from APDU 7 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 46 | defund twice, chain out of order | power lost after APDU 7 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 47 | defund twice, chain out of order | response lost from APDU 8 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 48 | defund twice, chain out of order | power lost after APDU 8 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 49 | defund twice, chain out of order | response lost from APDU 9 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 50 | defund twice, chain out of order | power lost after APDU 9 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 51 | defund twice, chain out of order | response lost from APDU 10 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 52 | defund twice, chain out of order | power lost after APDU 10 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 53 | defund twice, chain out of order | response lost from APDU 11 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 54 | defund twice, chain out of order | power lost after APDU 11 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 55 | defund twice, chain out of order | response lost from APDU 12 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 56 | defund twice, chain out of order | power lost after APDU 12 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 57 | defund twice, chain out of order | response lost from APDU 13 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 58 | defund twice, chain out of order | power lost after APDU 13 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 59 | defund twice, chain out of order | response lost from APDU 14 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 60 | defund twice, chain out of order | power lost after APDU 14 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 61 | defund twice, chain out of order | response lost from APDU 15 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 62 | defund twice, chain out of order | power lost after APDU 15 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 63 | defund twice, chain out of order | response lost from APDU 16 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 64 | defund twice, chain out of order | power lost after APDU 16 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 65 | defund twice, chain out of order | response lost from APDU 17 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 66 | defund twice, chain out of order | power lost after APDU 17 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 67 | defund twice, chain out of order | response lost from APDU 18 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 68 | defund twice, chain out of order | power lost after APDU 18 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 69 | defund twice, chain out of order | response lost from APDU 19 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 70 | defund twice, chain out of order | power lost after APDU 19 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 71 | defund twice, chain out of order | response lost from APDU 20 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 72 | defund twice, chain out of order | power lost after APDU 20 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 73 | defund twice, chain out of order | response lost from APDU 21 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 74 | defund twice, chain out of order | power lost after APDU 21 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 75 | defund twice, chain out of order | response lost from APDU 22 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 76 | defund twice, chain out of order | power lost after APDU 22 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 77 | defund twice, chain out of order | response lost from APDU 23 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 78 | defund twice, chain out of order | power lost after APDU 23 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 79 | defund twice, chain out of order | response lost from APDU 24 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 80 | defund twice, chain out of order | power lost after APDU 24 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 81 | defund twice, chain out of order | response lost from APDU 25 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 82 | defund twice, chain out of order | power lost after APDU 25 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 83 | defund twice, chain out of order | response lost from APDU 26 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 84 | defund twice, chain out of order | power lost after APDU 26 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 85 | defund twice, chain out of order | response lost from APDU 27 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 86 | defund twice, chain out of order | power lost after APDU 27 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 87 | defund twice, chain out of order | response lost from APDU 28 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 88 | defund twice, chain out of order | power lost after APDU 28 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 89 | defund twice, chain out of order | response lost from APDU 29 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 90 | defund twice, chain out of order | power lost after APDU 29 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 91 | defund twice, chain out of order | response lost from APDU 30 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 92 | defund twice, chain out of order | power lost after APDU 30 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 93 | defund twice, chain out of order | response lost from APDU 31 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 94 | defund twice, chain out of order | power lost after APDU 31 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 95 | defund twice, chain out of order | response lost from APDU 32 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 96 | defund twice, chain out of order | power lost after APDU 32 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 97 | defund twice, chain out of order | response lost from APDU 33 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 98 | defund twice, chain out of order | power lost after APDU 33 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 99 | defund twice, chain out of order | response lost from APDU 34 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 100 | defund twice, chain out of order | power lost after APDU 34 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 101 | defund twice, chain out of order | response lost from APDU 35 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 102 | defund twice, chain out of order | power lost after APDU 35 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 103 | defund twice, chain out of order | response lost from APDU 36 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 104 | defund twice, chain out of order | power lost after APDU 36 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 105 | defund twice, chain out of order | response lost from APDU 37 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 106 | defund twice, chain out of order | power lost after APDU 37 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 107 | defund twice, chain out of order | response lost from APDU 38 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 108 | defund twice, chain out of order | power lost after APDU 38 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 109 | defund twice, chain out of order | response lost from APDU 39 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 110 | defund twice, chain out of order | power lost after APDU 39 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 111 | defund twice, chain out of order | response lost from APDU 40 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 112 | defund twice, chain out of order | power lost after APDU 40 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 113 | defund twice, chain out of order | response lost from APDU 41 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 114 | defund twice, chain out of order | power lost after APDU 41 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 115 | defund twice, chain out of order | response lost from APDU 42 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 116 | defund twice, chain out of order | power lost after APDU 42 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 117 | defund twice, chain out of order | response lost from APDU 43 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 118 | defund twice, chain out of order | power lost after APDU 43 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 119 | defund twice, chain out of order | response lost from APDU 44 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 120 | defund twice, chain out of order | power lost after APDU 44 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 121 | defund twice, chain out of order | response lost from APDU 45 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 122 | defund twice, chain out of order | power lost after APDU 45 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 123 | defund twice, chain out of order | response lost from APDU 46 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 124 | defund twice, chain out of order | power lost after APDU 46 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 125 | defund twice, chain out of order | response lost from APDU 47 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 126 | defund twice, chain out of order | power lost after APDU 47 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 127 | defund twice, chain out of order | response lost from APDU 48 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 128 | defund twice, chain out of order | power lost after APDU 48 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 129 | defund twice, chain out of order | response lost from APDU 49 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 130 | defund twice, chain out of order | power lost after APDU 49 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 131 | defund twice, chain out of order | response lost from APDU 50 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 132 | defund twice, chain out of order | power lost after APDU 50 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 133 | defund twice, chain out of order | response lost from APDU 51 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 134 | defund twice, chain out of order | power lost after APDU 51 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 135 | defund twice, chain out of order | response lost from APDU 52 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 136 | defund twice, chain out of order | power lost after APDU 52 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 137 | defund twice, chain out of order | response lost from APDU 53 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 138 | defund twice, chain out of order | power lost after APDU 53 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 139 | defund twice, chain out of order | response lost from APDU 54 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 140 | defund twice, chain out of order | power lost after APDU 54 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 141 | defund twice, chain out of order | response lost from APDU 55 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 142 | defund twice, chain out of order | power lost after APDU 55 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 143 | defund twice, chain out of order | response lost from APDU 56 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 144 | defund twice, chain out of order | power lost after APDU 56 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 145 | defund twice, chain out of order | response lost from APDU 57 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 146 | defund twice, chain out of order | power lost after APDU 57 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 147 | defund twice, chain out of order | response lost from APDU 58 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 148 | defund twice, chain out of order | power lost after APDU 58 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 149 | defund twice, chain out of order | response lost from APDU 59 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 150 | defund twice, chain out of order | power lost after APDU 59 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 151 | defund twice, chain out of order | response lost from APDU 60 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 152 | defund twice, chain out of order | power lost after APDU 60 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 153 | defund twice, chain out of order | response lost from APDU 61 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 154 | defund twice, chain out of order | power lost after APDU 61 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 155 | defund twice, chain out of order | response lost from APDU 62 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 156 | defund twice, chain out of order | power lost after APDU 62 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 157 | defund twice, chain out of order | response lost from APDU 63 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 158 | defund twice, chain out of order | power lost after APDU 63 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 159 | defund twice, chain out of order | response lost from APDU 64 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 160 | defund twice, chain out of order | power lost after APDU 64 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 161 | defund twice, chain out of order | response lost from APDU 65 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 162 | defund twice, chain out of order | power lost after APDU 65 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 163 | defund twice, chain out of order | response lost from APDU 66 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 164 | defund twice, chain out of order | power lost after APDU 66 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 165 | defund twice, chain out of order | response lost from APDU 67 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 166 | defund twice, chain out of order | power lost after APDU 67 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 167 | defund twice, chain out of order | response lost from APDU 68 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 168 | defund twice, chain out of order | power lost after APDU 68 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 169 | defund twice, chain out of order | response lost from APDU 69 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 170 | defund twice, chain out of order | power lost after APDU 69 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 171 | defund twice, chain out of order | response lost from APDU 70 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 172 | defund twice, chain out of order | power lost after APDU 70 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 173 | defund twice, chain out of order | response lost from APDU 71 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 174 | defund twice, chain out of order | power lost after APDU 71 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 175 | defund twice, chain out of order | response lost from APDU 72 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 176 | defund twice, chain out of order | power lost after APDU 72 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 177 | defund twice, chain out of order | response lost from APDU 73 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 178 | defund twice, chain out of order | power lost after APDU 73 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 179 | defund twice, chain out of order | response lost from APDU 74 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 180 | defund twice, chain out of order | power lost after APDU 74 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 181 | defund twice, chain out of order | response lost from APDU 75 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 182 | defund twice, chain out of order | power lost after APDU 75 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
| 183 | defund twice, chain out of order | response lost from APDU 76 | P | - | - | pass | pass | pass | pass | pass | response lost from P |
| 184 | defund twice, chain out of order | power lost after APDU 76 | P | - | - | pass | pass | pass | pass | pass | power lost after the response of P |
