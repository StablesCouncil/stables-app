# CHIP-WITHDRAW-01-R3: complete cumulative withdrawal

Prospective protocol: ../../docs/CHIP-WITHDRAW-01.md, version 1.

Correction before execution: read final token identities from confirmed coin
objects, not the creation placeholders in mint-transaction metadata. Preparation
reuses the untouched purpose-created supplies from R2, with unspent and amount
proofs on both peers. No R2 setup/withdrawal was posted. This run has a new identity,
regenerated dependent scripts, a new source hash and fresh frozen fixtures.

Run `node measure/chip-withdrawal-mainnet.mjs prepare-reuse CHIP-WITHDRAW-01-R2`
with `CHIP_WITHDRAW_RUN=CHIP-WITHDRAW-01-R3`, then preflight, freeze and the formal
phases listed in the prospective protocol. No purchase or production deployment.
