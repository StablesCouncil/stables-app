# Card capabilities: what the Stables applet needs from the chip

**Date:** 2026-09-29. **Status:** pre-filled. **Nothing here has been verified on our own card**, because none has been
bought (founder decision 15).
**Why this file exists:** it was adopted from `javacard-simulator-prompt.md` (R1, deliverable 4) in
`chip-balance-design.md` section 0c. jCardSim runs on a PC crypto library and accepts algorithms and APIs the real card
lacks (it offers SHA-3, which the J3R180 does not have). So the applet may use only what this file lists, and each row
keeps its status until our own card confirms it.
**Sources:** `phase-0-research.md` sections 1 and 4 (JCAlgTest J3R180 profiles, GlobalPlatformPro, sysmocom);
`chip-balance-design.md` sections 3 and 4.2; `payment-account-design.md` 1.3 and 7.3a (LX16).
**Update rule:** before the applet uses an algorithm or API, add its row here. When a card is measured
(`chip-balance-design.md` 0b.2), fill in "On our card" and keep the JCAlgTest figure beside it.

**Status tags**
- **VERIFIED (JCAlgTest):** verified on the J3R180 per JCAlgTest; to re-verify on our card.
- **VERIFIED absent (JCAlgTest):** JCAlgTest reports that the J3R180 lacks it.
- **VERIFIED (source named):** stated at another cited source.
- **ASSUMED:** design, arithmetic or inference, with the reason.
- **UNKNOWN:** not in Phase 0's data; check before relying on it.

**Target card:** NXP JCOP4 J3R180, which is the Satochip DIY card (VERIFIED at source, `chip-balance-design.md` 0b.1
item 2). It is identified on arrival with `gp --info`.

Section numbers such as 3.1 refer to `chip-balance-design.md`.

---

## 1. Platform

| Capability | Used for | J3R180 | Status | On our card |
|---|---|---|---|---|
| Java Card 3.0.4 API (the CAP is built against it with `ant-javacard`; 3.0.5 only if the card confirms it) | the whole applet | runs 3.0.4 CAPs | ASSUMED (Phase 0 section 4) | not yet: `gp --info` |
| Persistent memory | the applet state (3.1) | 139,360 B free | VERIFIED (JCAlgTest) | not yet |
| Transient memory (`JCSystem.makeTransientByteArray`) | APDU work buffers, digest inputs | 4,084 B | VERIFIED (JCAlgTest) | not yet |
| Allocation only at install | no memory lost per tap (the cashu-javacard lesson, Phase 0 section 2) | a rule, not a chip feature | rule: Phase 0 decision 6, enforced by a source scan | n/a |
| Atomic transactions (`JCSystem.beginTransaction`, `commitTransaction`, `abortTransaction`) | commit, then emit (3.3) | available | Java Card core API. Atomic copy to persistent memory 3.2 to 5.6 ms: VERIFIED (JCAlgTest). Commit cost unmeasured: ASSUMED 10 to 30 ms | not yet |
| Commit buffer capacity (`JCSystem.getMaxCommitCapacity()`) | the largest single transaction: `PAY` writes the balance, the counters and a pending entry of about 150 B (3.1, 3.3) | not known | UNKNOWN | not yet |
| `OwnerPIN` | the PIN, 3 tries (3.4) | available | Java Card core API. The tear harness checks that a tear never gives back a try (0c.2 item 2) | not yet |
| Integer arithmetic | amounts and counters | `short` always; the `int` option not known | UNKNOWN for `int`, so the applet must not rely on it (prompt R1). Amounts are u64 atoms (8 bytes, as in the app's scheme 0x04 and the account record's `SETLEN(8 ...)`), handled as byte arrays because Java Card has no `long` (ASSUMED design) | not yet |
| Short APDUs (up to 255 B of data) | EC messages fit in 1 to 2 APDUs (4.3) | available | Java Card baseline. Extended length: UNKNOWN, and not relied on (the SJA5 accepts only 255-byte commands, VERIFIED Phase 0) | not yet |
| Contact and contactless interfaces | a card tapped on a phone; the ACR1252U reader | dual interface | VERIFIED (shop listing, Phase 0 section 6) | not yet |

## 2. Cryptography the applet uses

| Algorithm (Java Card name) | Used for | J3R180 | Timing on the J3R180 | Status | On our card |
|---|---|---|---|---|---|
| SHA-256 (`MessageDigest.ALG_SHA_256`) | LX16 keys and signatures; the digest of every signed message; the swap hash `h = SHA2(s)` (1.4) | in hardware | 2.23 ms (16 B), 2.56 ms (32 B), 3.64 ms (64 B), 4.95 ms (128 B), 7.87 ms (256 B), 13.6 ms (512 B) | VERIFIED (JCAlgTest) | not yet |
| ECDSA P-256 with SHA-256 (`Signature.ALG_ECDSA_SHA_256`; `KeyPair.ALG_EC_FP`, 256-bit) | the EC profile card to card (4.1): HELLO, TRANSFER, ACK; the chip's device key; checking vendor certificates | supported (`ALG_ECDSA_SHA_256;yes`) | sign 31.96 ms, verify 30.22 ms (on 256 B), key pair 26.8 ms. Timed for the SHA-1 variant; the SHA-256 variant should differ only by hashing a short message (ASSUMED) | VERIFIED (JCAlgTest) | not yet |
| AES-256 (`Cipher`, `AESKey` 256-bit) | deriving LX16 secrets on the chip: `s = AES_k(key index, position, bit)`, truncated to 16 B with the label bit forced (`payment-account-design.md` 7.3a) | in hardware | 2.48 ms per 512 B | VERIFIED (JCAlgTest). The cipher mode is a design choice: ASSUMED one block, ECB, no padding | not yet |
| Secure random (`RandomData.ALG_SECURE_RANDOM`) | receiver nonces `m`, the swap secret `s`, on-card key generation | not in Phase 0's data | | UNKNOWN | not yet |
| LX16 one-time signature (made from SHA-256 and AES; no new primitive) | chain statements: the defund voucher (5.1) and the swap fallback claim (1.4) | n/a | about 1.2 s per key; about 0.05 s of chip time per signature; the signature (about 8.4 KB) exceeds transient memory, so it streams out in about 37 APDUs | ASSUMED arithmetic on the VERIFIED SHA-256 and AES figures (4.2; Phase 0 section 4) | not yet |
| ECDH (`KeyAgreement`) | not used by the design | supported | 20.0 ms | VERIFIED (JCAlgTest); not needed | n/a |

## 3. Must not be used

| Item | Why | Status |
|---|---|---|
| SHA-3 (`MessageDigest.ALG_SHA3_*`) | absent on the J3R180: every `ALG_SHA3_*` returns `NO_SUCH_ALGORITHM`. jCardSim offers it, so the source scan refuses it | VERIFIED absent (JCAlgTest) |
| Software SHA-3 in the applet | about 6.7 s per hash | VERIFIED (OptimizedJCAlgs, Phase 0) |
| Minima WOTS (TreeKey) signing | built on SHA-3: about 8 hours per Minima signature | VERIFIED (Phase 0) |
| A "sign anything" command | the chip computes what it signs (3.2; Phase 0 decision 1) | rule |
| `String`, or allocation after install | outside the Java Card subset; the memory rule | rule |

## 4. Memory per item (the benchmark's memory targets)

| Item | Size | Status |
|---|---|---|
| Per account (the whole applet state; one account per chip) | about 25 to 35 KB | ASSUMED sizing (3.1) |
| Per revocation entry | 8 B (2,048 entries = 16 KB) | ASSUMED (3.1) |
| Per pending transfer | about 150 B (16 entries) | ASSUMED (3.1) |
| Per LX16 key | 1 bit in the used bitmap (1,024 keys = 128 B), plus a 32 B seed | ASSUMED (3.1) |
| Per accepted vendor | about 75 B (16 entries) | ASSUMED (3.1) |
| Credited-nonce bitmap | 8 KB | ASSUMED (3.1) |

The total fits the J3R180's 139,360 B of free persistent memory (VERIFIED) with room to spare.

## 5. Card handling (Phase 0 section 4; for `simulator-status.md`)

- **J3R180 through GlobalPlatformPro:** default keys `404142…4F`, SCP02 or SCP03; `--lock` replaces the keys;
  `--secure-card` is irreversible; 3 to 10 wrong key attempts can brick the card (VERIFIED, GlobalPlatformPro wiki).
- **Test cards keep their default keys:** never lock, secure or terminate them. A card on default keys lets anyone
  load applets, so it never counts as a certified chip (ASSUMED threat model, Phase 0).

## 6. Other chips in the design

| Chip | What matters for the applet | Status |
|---|---|---|
| sysmoISIM-SJA5, both variants (SIM) | Java Card 3.0.4; SHA-1/224/256, AES, DES and HMAC; no SHA-3 for applets; 255-byte commands only; installs over SCP02 with card-specific keys; 3 wrong ADM1 attempts lock it permanently | VERIFIED (sysmocom manual, Phase 0) |
| sysmoISIM-SJA5-9FV | **no public-key crypto at all**, so only the slow hash profile (6 to 9 s per tap, 4.3); 480 KB flash | VERIFIED (manual 4.2.1) |
| sysmoISIM-SJA5-S17 | EC hardware present for on-card SUCI; 200 KB free. **Whether applets can reach the EC is not documented** | EC present and memory VERIFIED (manual, shop page); applet access ASSUMED likely, the first test on arrival |
| NXP JCOP4 in SIM cut (J3R180 SIM cut, J3R150) | the same chip family as the card, but no USIM or ARA-M | exists (VERIFIED listings); whether a Pixel accepts it over OMAPI is UNKNOWN |

## 7. Status lines from the Stage 2 virtual work package (2026-09-29)

Added by the jCardSim work package (`../applet/`, `simulator-status.md`). "VERIFIED (build)" and "VERIFIED (simulator)"
say what our tools showed; **none of them is a fact about the J3R180**, and every "On our card" cell above stays "not yet".

- **Java Card 3.0.4 API:** the applet CAP builds with `ant-javacard` v26.05.15 against the 3.0.4 kit (`targetsdk`,
  3.0.5u3 converter, because the 3.0.4 converter needs JDK 8 to 11 and only JDK 17 is installed), imports
  `javacard.framework` 1.5, `javacard.security` 1.5 and `javacardx.crypto` 1.5, and passes the off-card verifier.
  VERIFIED (build). Loading on the J3R180: not yet.
- **`int` option:** not used. The CAP is converted without `ints`, and the converter rejects int bytecodes. VERIFIED (build).
- **Secure random (`ALG_SECURE_RANDOM`):** kept behind a check. If `getInstance` fails, the install fails loudly, and
  the install self-test requires two draws that differ and are not zero. Still UNKNOWN on the J3R180.
- **Commit buffer:** in the tear model, the largest single transaction writes 268 B (DEFUND). If
  `getMaxCommitCapacity()` is below 512 B, the install self-test fails and the applet stays inert (only GET_STATE
  answers, showing the failed check; tested in jCardSim with a runtime reporting 100 B). Still UNKNOWN on the J3R180 (jCardSim
  always reports 32,767).
- **Transient memory:** the applet uses 1,222 B (CLEAR_ON_DESELECT); the benchmark applet uses 1,009 B more. Both
  fit the 4,084 B (VERIFIED JCAlgTest figure). VERIFIED (source tally).
- **Persistent memory:** the applet's arrays take 33,213 B (its own tally, reported by GET_STATE). Key objects and
  object headers are not included. This fits the 139,360 B free. VERIFIED (tally); the real footprint waits for
  `getAvailableMemory` on a card.
- **APDU buffer:** not relied on beyond the 133-byte minimum. Input is read with `receiveBytes` into a transient
  buffer, and output is sent with `sendBytesLong`. Short APDUs only; extended length is not used. VERIFIED (source).
- **ECDSA P-256:** DER signatures of at most 72 B. The RFC 6979 A.2.5 vector verifies in the install self-test, in
  jCardSim and in the JDK's SunEC. Card-made signatures verify in SunEC and in node:crypto. VERIFIED (simulator).
  Timings on the J3R180: the JCAlgTest figures above stay the reference.
- **LX16:** card-made vouchers pass `measure/ots.mjs`, the five KISS helpers (790 instructions each), the D1 core
  (313) and the K5 proof of cheating (114), all as dry runs on lab peer 9101 (Minima 1.0.45.15). The measured refusal
  cases still refuse. VERIFIED (simulator + lab node, L1). On-card timing: not yet.
- **SHA-3:** unused; the source scan refuses `ALG_SHA3_*`. VERIFIED (scan).

## 8. Java Card APIs the applet calls (rows required by 0c.2; all in the 3.0.4 API the CAP is built against)

| API | Used for | J3R180 status |
|---|---|---|
| `Applet.register`, `selectingApplet`, `ISOException.throwIt`, `CryptoException` | install, select, status words, crypto refusals | core API; ASSUMED (standard), not yet on our card |
| `APDU.getBuffer`, `setIncomingAndReceive`, `receiveBytes`, `getIncomingLength`, `getOffsetCdata`, `setOutgoing`, `setOutgoingLength`, `sendBytesLong` | short APDUs in and out without relying on the APDU buffer size | core API; ASSUMED, not yet |
| `JCSystem.makeTransientByteArray`, `beginTransaction`, `commitTransaction`, `getMaxCommitCapacity`, `getAvailableMemory` (benchmark only) | work buffers, atomic commits, the self-test check, memory figures | rows in section 1; `getAvailableMemory` returns a short capped at 32,767 (the 3.0.4 int form is not used) |
| `Util.arrayCopy` (atomic, persistent writes), `Util.arrayCopyNonAtomic`, `Util.arrayFillNonAtomic`, `Util.setShort` (transient writes), `Util.arrayCompare`, `Util.getShort` | the persistence layer and buffers | core API; ASSUMED; atomicity of `arrayCopy` is the Java Card specification, tested only in our model |
| `MessageDigest.getInstance` (`ALG_SHA_256`), `update`, `doFinal` | row in section 2 | VERIFIED (JCAlgTest) for SHA-256 |
| `Signature.getInstance` (`ALG_ECDSA_SHA_256`), `sign`, `verify` | row in section 2 | VERIFIED (JCAlgTest) |
| `KeyBuilder.buildKey` with `TYPE_EC_FP_PRIVATE`, `TYPE_EC_FP_PUBLIC`, `LENGTH_EC_FP_256`; `KeyPair.genKeyPair`; `ECKey.setFieldFP`, `setA`, `setB`, `setG`, `setR`, `setK` (P-256 parameters set explicitly); `ECPublicKey.setW`, `getW` | on-card device key, peer and vendor verification keys | P-256 key pair VERIFIED (JCAlgTest); explicit parameters: ASSUMED needed and accepted |
| `KeyBuilder.buildKey` with `TYPE_AES`, `LENGTH_AES_256`; `AESKey.setKey`; `Cipher.getInstance` (`ALG_AES_BLOCK_128_ECB_NOPAD`) | the LX16 seed and secret derivation | AES-256 VERIFIED (JCAlgTest); ECB mode ASSUMED |
| `RandomData.getInstance` (`ALG_SECURE_RANDOM`), `generateData` | nonces, the swap secret, the LX16 seed | UNKNOWN (section 2), behind a check |
