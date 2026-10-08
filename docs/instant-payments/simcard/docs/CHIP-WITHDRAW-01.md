# CHIP-WITHDRAW-01: complete cumulative withdrawal on Minima

Date: 2026-10-08. Prospective protocol, version 1. Exploratory preparation precedes
the formal frozen run. Nothing in this record authorizes production issuance.

1. **Question:** Can the existing applet's cumulative LX16 withdrawal vouchers drive
   complete D1 verification and D2 reserve payout transactions on Minima mainnet?
2. **Reason:** Prior receipts exercised signature cores and synthetic transactions,
   not the complete revised transaction path. Hardware is unnecessary for this question.
3. **Hypothesis:** Authenticated simulated-applet vouchers redeem once to the pinned
   owner; the second cumulative voucher pays only its increment. Invalid signatures,
   replay, payout redirection, overpayment and reserve skimming fail validation.
4. **Initial conditions:** Two synced canonical lab peers, 9101 and 9201, mainnet,
   Minima 1.0.45.15 or the actual recorded version. Fresh purpose-created marker
   token (10 units, zero decimals) and valueless reserve token (1,000 units, eight
   decimals). Entire marker stock locked in the lab vendor registration covenant.
   One account registered for the applet fixture's key tree. Fund 600 reserve units
   in the same transaction that raises account funding count to 1 and total to 600.
   Ten native helper coins of 0.00000001 MINIMA each are returned, never burnt.
   All identities and exact sources are hashed in fixture-block.json before formal setup.
5. **Independent variables:** Valid vouchers 1 and 2; one altered secret; altered
   complement; redirected release; replay of voucher 1; redirected owner payout;
   inflated payout; reduced vault change; fake release made from an account coin.
6. **Dependent variables:** Full txncheck flags, per-input KISS results and failing
   clauses, transaction/export hashes and sizes, canonical blocks on both peers,
   account highest key index and cumulative debit, reserve and owner amounts.
7. **Expected:** Vouchers report cumulative 250 and 290 units. Payouts are 250 and
   40, not 250 and 290. End reserve is 310; owner receives 290; total remains 600.
   Refusals are exported and deleted without posting and leave all inputs unspent.
8. **Falsification:** Any honest validator/settlement failure, accepted negative,
   wrong delta, changed state after refusal, or unequal canonical blocks.
9. **Recipe:** `node measure/chip-withdrawal-mainnet.mjs prepare`, then `freeze`,
   then phases `setup`, `register`, `fund`, `d1a-refusals`, `d1a`, `d2a-refusals`, `d2a`,
   `replay`, `d1b`, `d2b`, `close`. Preparation builds fresh simulator fixtures and
   new tokens. Freeze records runner, generator, inherited verifier, applet/harness,
   node jar and fixture hashes. Every later phase checks them. Honest transactions:
   txncreate, ordered txninput, txnoutput with explicit storestate, txnstate,
   txnbasics, txnsign only for wallet inputs, txnscript for the helper MAST body,
   txncheck, txnexport, txnpost only after all validator flags pass. Observe one
   canonical block on BOTH peers before consuming outputs. Negative transactions
   use the same builder path but never txnpost. Full commands and responses persist.
10. **Evidence:** Immutable commands.jsonl, per-phase full validator responses,
    exported transaction bytes/hashes, exact generated KISS, source hashes,
    simulator voucher fixtures, start/end coins, mainnet TxPoW/block receipts,
    independent-node observations and honest/negative per-input replay traces.
11. **Pass effect:** Supports complete Minima-side feasibility for these exact
    candidate baseline withdrawal contracts and signatures. Opens real-card
    installation/performance/atomicity work. Does not certify hardware or production.
12. **Fail effect:** Correct a reproduced builder defect in a fresh run, or stop this
    architecture branch if a hard Minima limit prevents the honest construction.
13. **Stop:** First unexpected result; lost/foreign-spent input; source/fixture change;
    node transport failure; differing canonical blocks; more than 20 new blocks or
    20 minutes without honest settlement; hard consensus limit breach. No retries
    inside a formal phase and no posting of a refusal.
14. **Level:** Seek L2, purpose-created valueless mainnet generation. In-process
    preflight is L0 and cannot substitute for mined transactions.
15. **Budget:** Preparation mints two tokens, then 7 honest transactions (setup locks
    marker stock and creates helpers; registration; funding; two D1; two D2), approximately
    30 to 60 minutes plus node startup. One canonical block on both peers per honest
    transaction. No burn; tiny native colouring for two tokens and 0.00000010 MINIMA
    temporarily held in ten helpers, returned to the lab wallet. No customer coins,
    existing Winiwa vaults, app keys or deployed app modifications.
16. **Review/authorization:** Agent readiness review against the current experiment
    standard, covenant playbook and transaction cookbook. Founder explicitly asked
    to do this test now; purpose-created valueless mainnet work also has standing
    authorization under EXPERIMENT_GOVERNANCE_STANDARD.md. A succeeding run requires
    a recorded cause, changed source where applicable and fresh run identity, not
    another approval. Production, economic architecture and hardware purchases
    remain outside this authorization.

## Candidate scope

`balance-baseline-covenants.mjs` retains the measured LX16 digest/label/MMR/helper
verifier and 249-byte record, uses cumulative debit Dv with payout Dv minus prior D,
and drops the deferred caps, windows and vault retirement. D2 uses Q and the vault
only; vendor certification is enforced through the unique marker-token provenance
and vendor-signed registration. The purpose-created lab gate stands in for vendor
certification; it does not prove secure provisioning or hardware enforcement.
The candidate retains owner revocation, payout changes, account retirement and
vault merge/split, but this campaign does not claim their full branch validation.
The real applet creates the signatures in jCardSim; the desktop never fabricates
an attestation of protected memory. No production economic policy is set here.
