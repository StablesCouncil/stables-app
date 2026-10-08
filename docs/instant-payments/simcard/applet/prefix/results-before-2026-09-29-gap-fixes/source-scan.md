# Source scan of the card code

Scanned `src/main/javacard/org/stables/card` on 2026-09-29T01:19:23.600Z (tools/scan-applet.mjs).

**No findings.**

| Check | Result |
|---|---|
| Java Card subset: no String, int, long, floating point, char, threads, java.util/io; no SHA-3 | pass |
| Allocation only at install (constructors, install(), static constants) | pass |
| Every field final (mutable state only in arrays) | pass |
| Persistent arrays written only through Persist | pass |
| No sign-anything: the device key signs only in emitSigned (bodies the chip builds), pay, and the install self-test | pass |
| Every API and algorithm used appears in card-capabilities.md | pass |
| No int bytecode (CAP converted without the `ints` option) | checked by the converter, not here |

## Details

- files scanned: BenchApplet.java, Ec.java, Lx16.java, Persist.java, Proto.java, Ram.java, StablesApplet.java, U.java
- field declarations checked (all must be final): 331
- allocation sites (all must be at install): 57
- device-key signing sites: BenchApplet.java:130 in process; BenchApplet.java:139 in process; StablesApplet.java:237 in selfTest; StablesApplet.java:416 in signWithDevice; StablesApplet.java:430 in emitSigned; StablesApplet.java:947 in pay
- Java Card APIs and algorithms used (61): APDU.getBuffer, APDU.getIncomingLength, APDU.getOffsetCdata, APDU.receiveBytes, APDU.sendBytesLong, APDU.setIncomingAndReceive, APDU.setOutgoing, APDU.setOutgoingLength, Cipher.ALG_AES_BLOCK_128_ECB_NOPAD, Cipher.MODE_ENCRYPT, Cipher.getInstance, CryptoException, ISOException.throwIt, JCSystem.CLEAR_ON_DESELECT, JCSystem.MEMORY_TYPE_PERSISTENT, JCSystem.MEMORY_TYPE_TRANSIENT_DESELECT, JCSystem.MEMORY_TYPE_TRANSIENT_RESET, JCSystem.beginTransaction, JCSystem.commitTransaction, JCSystem.getAvailableMemory, JCSystem.getMaxCommitCapacity, JCSystem.makeTransientByteArray, KeyBuilder.LENGTH_AES_256, KeyBuilder.LENGTH_EC_FP_256, KeyBuilder.TYPE_AES, KeyBuilder.TYPE_EC_FP_PRIVATE, KeyBuilder.TYPE_EC_FP_PUBLIC, KeyBuilder.buildKey, MessageDigest.ALG_SHA_256, MessageDigest.getInstance, RandomData.ALG_SECURE_RANDOM, RandomData.getInstance, Signature.ALG_ECDSA_SHA_256, Signature.MODE_SIGN, Signature.MODE_VERIFY, Signature.getInstance, Util.arrayCompare, Util.arrayCopy, Util.arrayCopyNonAtomic, Util.arrayFillNonAtomic, Util.getShort, Util.setShort, doFinal, genKeyPair, generateData, getW, init, register, reset, selectingApplet, setA, setB, setFieldFP, setG, setK, setKey, setR, setW, sign, update, verify


## Negative control

Five violations injected into a copy of the sources (tools/scan-negative-control.mjs): the scan reported 5 of 5 (Java Card subset: String; field not final; allocation outside install; direct write to a persistent array; signs in an unreviewed place) and exited 1. The scan does fire.
