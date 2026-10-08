# R3 closure: preparation settled; withdrawal builder stopped

Setup, vendor-signed registration and funding 600 valueless reserve units were
confirmed on both peers at mainnet blocks 2355455, 2355457 and 2355459.

The first altered-secret attempt correctly failed the helper's cryptographic check,
but basic validation also failed. The runner stopped and never posted this attempt.
Its exported witness has 12 proofs for 6 inputs: the builder called txnbasics twice
around adding the MAST body. Each call appended another set of proofs.

This is a reproduced structural builder defect, not a consensus instruction-limit
failure. The local synthetic runner created one proof per input and therefore did
not expose this real-witness construction bug. Its L0 result cannot substitute for
the full validator.

The malformed builder was exported and deleted. Original frozen source bytes,
fixture manifest, command log, per-input cryptographic refusal, duplicate proof IDs
and HARD_STOP.json are preserved. No chip-authorised withdrawal was posted or mined.

R4 uses a fresh identity/source hash and prospective version 2. It adds the MAST
body before a single txnbasics call and asserts proof count. R3's already canonical,
unredeemed account/reserve/helper coins are verified on both peers as R4's initial
conditions. No new mint or customer funding is needed. Recommendation: continue
with the corrected transaction builder; no protocol or hardware conclusion yet.
