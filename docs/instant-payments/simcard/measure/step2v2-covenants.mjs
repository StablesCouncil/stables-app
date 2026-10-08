// Step 2, version 2 (Instant payments: load from and offload to the chain): covenant text generators.
// Design: docs/step2-load-offload-design.md, revised after the founder's decisions of 2026-09-28:
//   1. NO daily cash-out limit. The rolling window, its state and the claimed block are gone from the registration
//      coin. Ports 4, 5 and 6 are RESERVED and unused (see RESERVED_PORTS): a later registration version that adds a
//      limit would use them exactly as v1 did (4 window start, 5 amount used, 6 claimed block).
//   2. NO time-based retirement. The vault's RETIRE branch (op 4, after about 5 years, to a successor) and the
//      successor address are gone. The retirement path is the always-open exit: any registered account can always
//      withdraw to its own Savings; anyone can merge; the owner can close a registration. Nothing is ever swept.
// v1 (with the limit and the retirement branch) stays reproducible: step2-covenants.mjs, step2-run.mjs, receipts
// step2_*.json, texts in kiss/step2/v1_superseded/. Nothing here touches a node; step2v2-run.mjs measures these texts.
//
// Two covenants, deployed in this order (the dependency graph is acyclic):
//   1. REG, the per-account registration coin (one per account per currency; port 12 names the currency). Carries
//      the account id, the dedicated withdrawal key, the owner's Savings payout address and the currency. Its
//      address depends on nothing.
//   2. VAULT, the pooled vault. Every load is its own coin here. It names REG's address as a literal, so a vault
//      coin can be spent for a withdrawal only beside a registration coin at input 0.
// A third text, REGH, is the compared alternative (design C, not adopted): the same registration, authorised by
// revealing the next link of a SHA-256 hash chain the app holds, instead of a Minima signature.
//
// Shared port map (transaction state; REG coins keep it, load coins carry ports 0, 1 and 3):
//   0 magic 0x53544931 ("STI1")      1 account id (SHA-256 of the Instant P-256 public key, 32 bytes)
//   2 withdrawal public key (REG) / hash-chain head (REGH)            3 payout address (the owner's Savings)
//   4, 5, 6 RESERVED, unused by v2 (v1: window start, amount used, claimed block)
//   7 withdrawal amount W (per spend)          8 operation (per spend: 1 withdraw, 2 close, 3 merge)
//   10 vault change or merged total (per spend) 11 registration dust amount (per spend)   12 currency governed
// A registration coin may hold dust of ANY token (the app uses one atom of Winiwa, which every wallet has from the
// faucet); the currency it governs is port 12, pinned. So a receiver who holds none of a currency in Savings can
// still register to move that currency out. Operation 4 (v1 RETIRE) no longer exists and is refused.

export const MAGIC = '0x53544931';
export const RESERVED_PORTS = [4, 5, 6];
export const VERSION = 2;

// CLOSE comes before the state pins on purpose (v2 change, found by the trap probes): closing needs only the key
// (port 2) and the payout (port 3) the coin itself stores, so a registration coin created without port 0, 1 or 12
// (a buggy app) can still be closed by its owner instead of locking its atom forever. The pins guard only the
// WITHDRAW branch, where the coin is re-created and its state must survive unchanged.

/** Registration coin, design A (adopted 2026-09-28): the dedicated withdrawal key signs; no limit. */
export function regScript() {
  return [
    'LET op=STATE(8)',
    'ASSERT @INPUT EQ 0',
    'ASSERT SIGNEDBY(PREVSTATE(2))',
    'IF op EQ 2 THEN',
    'ASSERT STATE(11) EQ @AMOUNT',
    'RETURN VERIFYOUT(0 PREVSTATE(3) STATE(11) @TOKENID FALSE)',
    'ENDIF',
    'ASSERT SAMESTATE(0 3)',
    'ASSERT SAMESTATE(12 12)',
    ...withdrawBody(),
  ].join('\n');
}

/** Registration coin, design C (compared, not adopted): the app reveals the next link of a SHA-256 hash chain. */
export function regHashScript() {
  return [
    'LET op=STATE(8)',
    'ASSERT @INPUT EQ 0',
    'ASSERT SHA2(STATE(2)) EQ PREVSTATE(2)',
    'IF op EQ 2 THEN',
    'ASSERT STATE(11) EQ @AMOUNT',
    'RETURN VERIFYOUT(0 PREVSTATE(3) STATE(11) @TOKENID FALSE)',
    'ENDIF',
    'ASSERT SAMESTATE(0 1)',
    'ASSERT SAMESTATE(3 3)',
    'ASSERT SAMESTATE(12 12)',
    ...withdrawBody(),
  ].join('\n');
}

// WITHDRAW: pay exactly W to the pinned payout (output 0), return exactly the rest of that currency to the vault
// (output 1, only if any), re-create the registration coin with its state (last output). No window, no block.
function withdrawBody() {
  return [
    'ASSERT op EQ 1',
    'LET w=STATE(7)',
    'ASSERT w GT 0',
    'ASSERT STATE(11) EQ @AMOUNT',
    'LET t=PREVSTATE(12)',
    'LET d=0',
    'IF @TOKENID EQ t THEN',
    'LET d=@AMOUNT',
    'ENDIF',
    'LET c=SUMINPUTS(t)-d-w',
    'ASSERT STATE(10) EQ c',
    'ASSERT VERIFYOUT(0 PREVSTATE(3) w t FALSE)',
    'IF c GT 0 THEN',
    'ASSERT @TOTOUT EQ 3',
    'ELSE',
    'ASSERT c EQ 0',
    'ASSERT @TOTOUT EQ 2',
    'ENDIF',
    'RETURN VERIFYOUT(@TOTOUT-1 @ADDRESS STATE(11) @TOKENID TRUE)',
  ];
}

/** The pooled vault. Generic by token id. Two branches only: WITHDRAW (beside a registration) and MERGE (anyone). */
export function vaultScript({ regAddress }) {
  if (!/^0x[0-9A-F]{64}$/i.test(regAddress)) throw new Error('vaultScript: bad address');
  return [
    'LET op=STATE(8)',
    'IF op EQ 1 THEN',
    `ASSERT GETINADDR(0) EQ ${regAddress}`,
    'ASSERT @TOKENID EQ STATE(12)',
    'LET c=STATE(10)',
    'IF c GT 0 THEN',
    'RETURN VERIFYOUT(1 @ADDRESS c @TOKENID FALSE)',
    'ENDIF',
    'RETURN c EQ 0',
    'ENDIF',
    'IF op EQ 3 THEN',
    'ASSERT GETINADDR(0) EQ @ADDRESS',
    'ASSERT GETINTOK(0) EQ @TOKENID',
    'ASSERT @TOTOUT EQ 1',
    'ASSERT STATE(10) EQ SUMINPUTS(@TOKENID)',
    'RETURN VERIFYOUT(0 @ADDRESS STATE(10) @TOKENID FALSE)',
    'ENDIF',
    'RETURN FALSE',
  ].join('\n');
}

/**
 * The transaction-free core of REG's WITHDRAW (identity pin, signature, operation, amount), for a cross-check of
 * the instruction count on the LIVE node with runscript (runscript has no transaction, so it cannot run VERIFYOUT,
 * GETINADDR or SUMINPUTS).
 */
export function regCoreScript() {
  return [
    'LET op=STATE(8)',
    'ASSERT SIGNEDBY(PREVSTATE(2))',
    'IF op EQ 2 THEN',
    'RETURN FALSE',
    'ENDIF',
    'ASSERT SAMESTATE(0 3)',
    'ASSERT SAMESTATE(12 12)',
    'ASSERT op EQ 1',
    'LET w=STATE(7)',
    'RETURN w GT 0',
  ].join('\n');
}
