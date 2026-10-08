# LX16 and P-256 cross-check (card-made signatures, existing verifiers)

Signatures made by the Stables applet in jCardSim (simulator), exported by `Main fixtures`. KISS scripts run as `runscript` dry runs on lab peer 9101 (Minima 1.0.45.15, block 2339305); nothing posted, signed or tracked.

**39 of 39 checks as expected.**

| # | Verifier | Check | Expected | Got | Instructions | Result |
|---|---|---|---|---|---|---|
| 1 | ots.mjs | voucher key 1: digest = SHA-256(0x44 / chip id / message) | true | true |  | pass |
| 2 | ots.mjs | voucher key 1: lxVerify (n=16, 5 chunks, 255 positions) | true | true |  | pass |
| 3 | ots.mjs | voucher key 1: pk = SHA-256(0x01 / chunk digests) | true | true |  | pass |
| 4 | ots.mjs | voucher key 1: a tampered secret is refused | false | false |  | pass |
| 5 | ots.mjs | voucher key 1: another digest is refused | false | false |  | pass |
| 6 | ots.mjs | voucher key 2: digest = SHA-256(0x44 / chip id / message) | true | true |  | pass |
| 7 | ots.mjs | voucher key 2: lxVerify (n=16, 5 chunks, 255 positions) | true | true |  | pass |
| 8 | ots.mjs | voucher key 2: pk = SHA-256(0x01 / chunk digests) | true | true |  | pass |
| 9 | ots.mjs | voucher key 2: a tampered secret is refused | false | false |  | pass |
| 10 | ots.mjs | voucher key 2: another digest is refused | false | false |  | pass |
| 11 | ots.mjs | bench key 5, digest 0: lxVerify | true | true |  | pass |
| 12 | ots.mjs | bench key 5, digest 1: lxVerify | true | true |  | pass |
| 13 | P-256 (node:crypto) | vendor certificate over the chip key, by the vendor key | true | true |  | pass |
| 14 | P-256 (node:crypto) | HELLO, by the receiver chip | true | true |  | pass |
| 15 | P-256 (node:crypto) | TRANSFER, by the payer chip | true | true |  | pass |
| 16 | P-256 (node:crypto) | ACK, by the receiver chip | true | true |  | pass |
| 17 | P-256 (node:crypto) | TRANSFER with the amount altered is refused | false | false |  | pass |
| 18 | P-256 (node:crypto) | TRANSFER checked with another chip key is refused | false | false |  | pass |
| 19 | KISS helper (runscript) | voucher key 1, helper input 1 (chunk 0) | true | true | 790 | pass |
| 20 | KISS helper (runscript) | voucher key 1, helper input 2 (chunk 1) | true | true | 790 | pass |
| 21 | KISS helper (runscript) | voucher key 1, helper input 3 (chunk 2) | true | true | 790 | pass |
| 22 | KISS helper (runscript) | voucher key 1, helper input 4 (chunk 3) | true | true | 790 | pass |
| 23 | KISS helper (runscript) | voucher key 1, helper input 5 (chunk 4) | true | true | 790 | pass |
| 24 | KISS helper (runscript) | voucher key 2, helper input 1 (chunk 0) | true | true | 790 | pass |
| 25 | KISS helper (runscript) | voucher key 2, helper input 2 (chunk 1) | true | true | 790 | pass |
| 26 | KISS helper (runscript) | voucher key 2, helper input 3 (chunk 2) | true | true | 790 | pass |
| 27 | KISS helper (runscript) | voucher key 2, helper input 4 (chunk 3) | true | true | 790 | pass |
| 28 | KISS helper (runscript) | voucher key 2, helper input 5 (chunk 4) | true | true | 790 | pass |
| 29 | KISS helper (runscript) | refusal: a tampered secret | false | false | 788 | pass |
| 30 | KISS helper (runscript) | refusal: a tampered complement | false | false | 788 | pass |
| 31 | KISS D1 core (runscript) | voucher key 1 against the chip account record | true | true | 313 | pass |
| 32 | KISS D1 core (runscript) | voucher key 2 after key 1 was used on chain | true | true | 313 | pass |
| 33 | KISS D1 core (runscript) | refusal: key index already used (i <= u) | false | false | 212 | pass |
| 34 | KISS D1 core (runscript) | refusal: a label flipped | false | false | 177 | pass |
| 35 | KISS D1 core (runscript) | refusal: signed by another key (chunk digests of key 2 claimed for key 1) | false | false | 198 | pass |
| 36 | KISS D1 core (runscript) | refusal: the amount in the message altered | false | false | 177 | pass |
| 37 | KISS proof of cheating (runscript) | two card signatures by one key (position 1, chunk 0) | true | true | 114 | pass |
| 38 | KISS proof of cheating (runscript) | refusal: the same secret twice | false | false | 50 | pass |
| 39 | KISS proof of cheating (runscript) | refusal: the key is not the one in the tree at that index | false | false | 112 | pass |
