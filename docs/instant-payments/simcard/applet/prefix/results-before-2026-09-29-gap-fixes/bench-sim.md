# Benchmark (jCardSim: RELATIVE ONLY, NOT REPRESENTATIVE)

These figures come from the JVM running jCardSim and Bouncy Castle. They show that the harness runs and how operations compare with each other in the simulator; they say nothing about a card (Phase 0 decision 6). The reference column is the JCAlgTest J3R180 figure (VERIFIED, card-capabilities.md) or the design's ASSUMED arithmetic, and stays the reference until a card is timed with this same harness over PC/SC.

| Measurement | Simulator (not representative) | J3R180 reference |
|---|---|---|
| SHA-256, 16 B | 0.042 ms | 2.23 ms |
| SHA-256, 32 B | 0.008 ms | 2.56 ms |
| SHA-256, 64 B | 0.000 ms | 3.64 ms |
| SHA-256, 128 B | 0.004 ms | 4.95 ms |
| SHA-256, 256 B | 0.010 ms | 7.87 ms |
| SHA-256, 512 B | 0.022 ms | 13.6 ms |
| AES-256 ECB, 16 B | 0.016 ms | - |
| AES-256 ECB, 512 B | 0.000 ms | 2.48 ms |
| P-256 ECDSA-SHA256 sign, 32 B | 1.907 ms | 31.96 ms (SHA-1 variant, 256 B) |
| P-256 ECDSA-SHA256 sign, 256 B | 2.280 ms | 31.96 ms |
| P-256 ECDSA-SHA256 verify, 256 B | 7.294 ms | 30.22 ms |
| P-256 key pair generation | 8.676 ms | 26.8 ms |
| transaction: begin, write 16 B, commit | 0.001 ms | atomic copy 3.2 to 5.6 ms; commit unmeasured (ASSUMED 10 to 30 ms) |
| transaction: begin, write 64 B, commit | 0.001 ms | atomic copy 3.2 to 5.6 ms; commit unmeasured (ASSUMED 10 to 30 ms) |
| transaction: begin, write 150 B, commit | 0.001 ms | atomic copy 3.2 to 5.6 ms; commit unmeasured (ASSUMED 10 to 30 ms) |
| transaction: begin, write 250 B, commit | 0.001 ms | atomic copy 3.2 to 5.6 ms; commit unmeasured (ASSUMED 10 to 30 ms) |
| LX16 key generation (one key: 255 x (AES + 4 SHA-256) + 6 chunk hashes) | 8.921 ms | about 1.2 s (ASSUMED arithmetic) |
| LX16 signature streamed out: 34 APDUs, 8160 B (R and C; the 160 B chunk digests come with DEFUND) | 10.770 ms | about 0.05 s of chip time + about 37 APDUs (ASSUMED) |
| JCSystem.getAvailableMemory: persistent / transient reset / transient deselect (short form) | 32767 / 32767 / 32767 B | J3R180: 139,360 B persistent, 4,084 B transient (JCAlgTest); jCardSim always reports 32,767 |
| JCSystem.getMaxCommitCapacity | 32767 B | UNKNOWN on the J3R180; jCardSim always 32,767 |
| memory per account: persistent arrays the Stables applet allocates at install (its own tally) | 33213 B | 25 to 35 KB (ASSUMED sizing, 3.1); key objects and object headers not included |
| memory per revocation entry | 8 B (2,048 entries = 16,384 B) | 8 B (3.1) |
| memory per pending transfer (the exact signed TRANSFER) | 218 B (16 entries) | about 150 B (3.1) |
| memory per accepted vendor (double-buffered for atomic snapshot updates) | 2 x 73 B (16 entries) | about 75 B (3.1) |
| credited-nonce bitmap | 8,192 B (65,536 receives per chip) | 8 KB (3.1) |
| LX16 per key | 1 bit used + 0 B stored (secrets re-derived from a 32 B AES seed) | 1 bit + 32 B seed (3.1) |

## A whole tap in the simulator (not representative)

| Step | Time |
|---|---|
| read both certificates | 0.098 ms |
| PEER both ways (2 certificate verifications) | 14.491 ms |
| HELLO (commit nonce, sign) | 7.153 ms |
| PAY (verify HELLO, sign, commit, emit) | 16.006 ms |
| CREDIT (verify, commit, sign ACK) | 15.320 ms |
| ACK (verify, commit) | 6.883 ms |
| **whole tap** | 61.046 ms |

Design estimate for a card tapped on a phone: about 0.9 to 1.4 s (ASSUMED arithmetic, 4.3).
