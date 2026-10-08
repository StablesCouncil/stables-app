# CHIP-WITHDRAW-01-R4: prospective withdrawal campaign, version 2

Date: 2026-10-08. This is a new frozen run after the retained R3 witness-builder stop.
It does not revise R3's hypothesis, expected results or recorded failure.

1. **Question:** Do complete cumulative chip-authorised D1/D2 transactions settle
   on Minima mainnet with the real simulated applet's LX16 signatures?
2. **Reason:** R3 confirmed setup, registration and funding. Its first negative
   construction had duplicate MMR proofs because the builder called txnbasics twice.
   The failure is reproduced by the exported witness: 12 proofs for 6 inputs.
3. **Hypothesis:** Correctly constructed withdrawals pay 250 then 40 for cumulative
   vouchers 250 then 290; invalid signatures, replay and payout/conservation attacks fail.
4. **Initial conditions:** The purpose-created R2 marker/value supplies, R3's exact
   unchanged covenants, canonical setup/registration/funding evidence and funded
   account. Before freezing, both 9101 and 9201 must observe all 12 inputs unspent:
   account marker, reserve 600 and ten helpers. Account D=0 and highest key=0, F=600,
   funding count=1. No D1 or D2 transaction has ever been posted in this generation.
   This prepared state is inherited explicitly, not represented as new R4 transactions.
5. **Independent variables:** Valid applet vouchers 1/2; one altered secret;
   altered complement; redirected Q; redirected payout; overpayment; reserve skimming;
   replay of voucher 1 after redemption; an account coin substituted for genuine Q.
6. **Dependent variables:** Full validator flags, one proof per input, per-input
   outcomes/failed clauses, serialized bytes, canonical blocks on both peers,
   owner payouts, reserve and continued account's cumulative debit/index.
7. **Expected:** Eight refusals, none posted. Four honest withdrawal transactions
   pass all checks and settle. Final D=290, highest key=2, payouts=250+40, reserve=310.
8. **Falsification:** Any honest failure, accepted attack, changed state after a
   refusal, incorrect payout/conservation, or canonical disagreement.
9. **Recipe:** With `CHIP_WITHDRAW_RUN=CHIP-WITHDRAW-01-R4`, run
   `node measure/chip-withdrawal-mainnet.mjs prepare-funded CHIP-WITHDRAW-01-R3`,
   then `preflight`, `freeze`, `d1a-refusals`, `d1a`, `d2a-refusals`, `d2a`, `replay`,
   `d1b`, `d2b`, `close`. The builder adds the helper MAST script before exactly one
   txnbasics call and asserts that proof count equals input count. All remaining
   transaction commands and restrictions are those in CHIP-WITHDRAW-01.md.
10. **Preserve:** Frozen source bytes/hashes, simulator fixtures, initial coins,
    commands/replies, full txncheck, exports and hashes, per-input traces, TxPoW,
    canonical blocks and final coins on both nodes. Link inherited R3 controls explicitly.
11. **Pass effect:** Supports the named Minima-side withdrawal feasibility with
    simulated-applet signatures and the assumed hardware/certification guarantees.
    Enables real-card validation, not production launch or universal safety claims.
12. **Fail effect:** Stop this run. Correct only a reproduced harness defect under
    a fresh ID; a hard platform-limit breach stops this architecture branch.
13. **Stop:** First unexpected result, proof count mismatch, changed frozen input,
    foreign spend, transport failure, canonical mismatch, or settlement beyond 20
    blocks/20 minutes. Never post a negative. Never debug inside the frozen run.
14. **Level:** L2 for these complete withdrawals and preserved noncanonical refusals.
    L0 preflight is separately identified.
15. **Budget:** Four honest mainnet transactions; one confirmation observed on
    both peers per transaction; about 10 to 25 minutes. No mint, no new funds,
    no burn. Ten existing native helpers are returned to the lab wallet, 0.00000010
    MINIMA in total. Only valueless reserve tokens move; deployed app vaults untouched.
16. **Review/authorization:** Same explicit founder request and standing valueless
    experiment authorization as version 1. Agent readiness review uses the retained
    structural diagnosis and preflight. A corrective successor needs a cause,
    changed source hash and new run identity, not another permission request.

Production provisioning, real-card timing/atomicity, all other covenant branches,
refresh/long-term availability integration and independent review are outside this
campaign. No economic architecture or production deployment is approved.
