// Step 2 (Instant payments: load from and offload to the chain): covenant text generators.
// Design: docs/step2-load-offload-design.md. Nothing here touches a node; step2-run.mjs measures these texts.
//
// Two covenants, deployed in this order (the dependency graph is acyclic):
//   1. REG, the per-account registration coin (one per account per currency; port 12 names the currency). Carries the account id, the dedicated withdrawal key, the owner's Savings payout
//      address and the rolling daily window. Its address does not depend on the vault.
//   2. VAULT, the pooled vault. Every load is its own coin here. It names REG's address as a literal, so a vault
//      coin can be spent for a withdrawal only beside a registration coin at input 0.
// A third text, REGH, is the compared alternative (design C): the same registration, authorised by revealing the
// next link of a SHA-256 hash chain the app holds, instead of a Minima signature.
//
// Shared port map (transaction state; REG coins keep it, load coins carry ports 0 and 1):
//   0 magic 0x53544931 ("STI1")      1 account id (SHA-256 of the Instant P-256 public key, 32 bytes)
//   2 withdrawal public key (REG) / hash-chain head (REGH)            3 payout address (the owner's Savings)
//   4 window start block             5 amount used in the window (token units)
//   6 claimed block (per spend)      7 withdrawal amount W (per spend)          8 operation (per spend)
//   10 vault change (per spend)      11 registration dust amount (per spend)    12 currency (token id) governed
//   100+i retirement amounts
// A registration coin may hold dust of ANY token (the app uses one atom of Winiwa, which every wallet has from the
// faucet); the currency it governs is port 12, pinned. So a receiver who holds none of a currency in Savings can
// still register to move that currency out.
// Operations (port 8): 1 WITHDRAW, 2 CLOSE (REG), 3 MERGE (VAULT), 4 RETIRE (VAULT).

export const MAGIC = '0x53544931';

export const DEFAULTS = {
  limit: 1000,        // daily cash-out limit per account per currency, token units (a decision for Chuck)
  day: 1728,          // rolling window length in blocks: 86,400 s / 50 s
  slack: 20,          // a claimed block must be within 20 blocks of the block that validates the spend
  dormancy: 3153600,  // vault retirement: about 5 years without movement at 50 s blocks
};

/** Registration coin, design A (recommended): the dedicated withdrawal key signs. */
export function regScript({ limit = DEFAULTS.limit, day = DEFAULTS.day, slack = DEFAULTS.slack } = {}) {
  return [
    'LET op=STATE(8)',
    'ASSERT @INPUT EQ 0',
    'ASSERT SAMESTATE(0 3)',
    'ASSERT SAMESTATE(12 12)',
    'ASSERT SIGNEDBY(PREVSTATE(2))',
    'IF op EQ 2 THEN',
    'ASSERT STATE(11) EQ @AMOUNT',
    'RETURN VERIFYOUT(0 PREVSTATE(3) STATE(11) @TOKENID FALSE)',
    'ENDIF',
    ...withdrawBody({ limit, day, slack }),
  ].join('\n');
}

/** Registration coin, design C (compared): the app reveals the next link of a SHA-256 hash chain. No key. */
export function regHashScript({ limit = DEFAULTS.limit, day = DEFAULTS.day, slack = DEFAULTS.slack } = {}) {
  return [
    'LET op=STATE(8)',
    'ASSERT @INPUT EQ 0',
    'ASSERT SAMESTATE(0 1)',
    'ASSERT SAMESTATE(3 3)',
    'ASSERT SAMESTATE(12 12)',
    'ASSERT SHA2(STATE(2)) EQ PREVSTATE(2)',
    'IF op EQ 2 THEN',
    'ASSERT STATE(11) EQ @AMOUNT',
    'RETURN VERIFYOUT(0 PREVSTATE(3) STATE(11) @TOKENID FALSE)',
    'ENDIF',
    ...withdrawBody({ limit, day, slack }),
  ].join('\n');
}

function withdrawBody({ limit, day, slack }) {
  return [
    'ASSERT op EQ 1',
    'LET cb=STATE(6)',
    'ASSERT cb LTE @BLOCK',
    `ASSERT cb GTE @BLOCK-${slack}`,
    'LET w=STATE(7)',
    'ASSERT w GT 0',
    'LET ws=PREVSTATE(4)',
    'LET wu=PREVSTATE(5)',
    `IF cb GT ws+${day} THEN`,
    'LET ws=cb',
    'LET wu=w',
    'ELSE',
    'ASSERT wu GTE 0',
    'LET wu=wu+w',
    'ENDIF',
    `ASSERT wu LTE ${limit}`,
    'ASSERT STATE(4) EQ ws',
    'ASSERT STATE(5) EQ wu',
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

/** The pooled vault. Generic by token id: every load of any token is its own coin here. */
export function vaultScript({ regAddress, successor, dormancy = DEFAULTS.dormancy }) {
  if (!/^0x[0-9A-F]{64}$/i.test(regAddress) || !/^0x[0-9A-F]{64}$/i.test(successor)) throw new Error('vaultScript: bad address');
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
    'IF op EQ 4 THEN',
    `ASSERT @COINAGE GT ${dormancy}`,
    'ASSERT STATE(100+@INPUT) EQ @AMOUNT',
    `RETURN VERIFYOUT(@INPUT ${successor} STATE(100+@INPUT) @TOKENID FALSE)`,
    'ENDIF',
    'RETURN FALSE',
  ].join('\n');
}

/**
 * The transaction-free core of REG's WITHDRAW (identity pin, signature, claimed block, daily window), for a
 * cross-check of the instruction count on the LIVE node with runscript (runscript cannot run VERIFYOUT or
 * SUMINPUTS: it has no transaction).
 */
export function regCoreScript({ limit = DEFAULTS.limit, day = DEFAULTS.day, slack = DEFAULTS.slack } = {}) {
  return [
    'LET op=STATE(8)',
    'ASSERT SAMESTATE(0 3)',
    'ASSERT SAMESTATE(12 12)',
    'ASSERT SIGNEDBY(PREVSTATE(2))',
    'ASSERT op EQ 1',
    'LET cb=STATE(6)',
    'ASSERT cb LTE @BLOCK',
    `ASSERT cb GTE @BLOCK-${slack}`,
    'LET w=STATE(7)',
    'ASSERT w GT 0',
    'LET ws=PREVSTATE(4)',
    'LET wu=PREVSTATE(5)',
    `IF cb GT ws+${day} THEN`,
    'LET ws=cb',
    'LET wu=w',
    'ELSE',
    'ASSERT wu GTE 0',
    'LET wu=wu+w',
    'ENDIF',
    `ASSERT wu LTE ${limit}`,
    'ASSERT STATE(4) EQ ws',
    'RETURN STATE(5) EQ wu',
  ].join('\n');
}
