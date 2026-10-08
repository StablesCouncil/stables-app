// Covenant templates for the Stables payment account (Phase 1 drafts; evidence level L0 unless a receipt
// says otherwise). Deployed KISS must be comment-free; explanations live in docs/payment-account-design.md.
//
// Addresses, deployed in this order (no cycles):
//   1. NOTES      value coins (USDw, stored LOAD state), anchor marks (1 STAMP, port 99 = 1) and records
//                 (1 STAMP, port 99 = 2); the role is the coin's own stored state, so no spender can relabel it.
//   1b. DISPENSER stamp lanes (>= 2 STAMP, no state): issues marks at LOAD and claim vouchers; embeds NOTES.
//      STAMP is a protocol-only token: its whole supply sits in lanes at genesis and every rule only moves
//      it between protocol coins or burns it, so "holds a stamp" proves a coin was made by the protocol.
//      (On Minima anyone can pay any address, so an address alone proves nothing.)
//   2. HELPER  per owner: "LET owner=0x<tag> MAST 0x<body hash>", the body is the chunk verifier.
//   3. POOL    slashed bond, embeds NOTES (to rebuild voucher addresses)
//   4. BOND    device bond, embeds NOTES and POOL.      VENDOR bond: independent.
// Release coins (Q) and claim vouchers (V) live at per-statement addresses built at run time with
// ADDRESS(prefix + STRING(hash) + ...), with the NOTES address inserted through STRING(@ADDRESS).
//
// Port map (see the design doc):
//   9 operation code.  LOAD: 8 note count, 101 loader payout, 102 loader device root, 103 expiry block,
//   110+i note i = marker coin id | value coin id | first key.  T1: 1 hops, 5 note index, 6 helper tag,
//   16k+0..3 hop k.  T2 / record: 99 role, 200 summary, 201 cashed-at block, 202 note value.
//   Claim: 2 aid, 3 key at hop j, 4 digest before hop j, 6 helper tag, 7 hop index bytes, 1 hops verified,
//   230 statement, 231 cheater device root, 232 root slot in the bond, 233 membership proof, 234 root sum.
//   Bond / pool: 120..123 roots, 124 root count, 125 owner key, 126 owner payout, 127 vendor key,
//   128 vendor certificate, 129 withdraw-request block, 130 frozen-at block, 131 bond at freeze,
//   139 claim count, 140+3n / 141+3n / 142+3n claim payout / amount / statement hash, 240+k settle payouts.
import * as G from './kissgen.mjs';

export const OP = { LOAD: 1, CASH: 2, CLAIM1: 3, CLAIM2: 4, SETTLEQ: 5, FREEZE1: 20, WREQ: 21, WDO: 22, RENEW: 23, ABANDON: 24, PSETTLE: 30, MERGE: 40, SPLIT: 41, VCONTRIB: 50 };

// --------------------------------------------------------------------------------------------- helper
export function helperBody({ stamp, n = 16, K = 5, P = 255 }) {
  return G.lxHelper({ n, K, P }).script.replace('LET j=@INPUT-1', `ASSERT GETINTOK(0) EQ ${stamp} LET j=@INPUT-STATE(97)`);
}
export const helperAddressScript = (tag, bodyHash) => `LET owner=${tag} MAST ${bodyHash}`;

// ------------------------------------------------------------------------------- shared hop machinery
function maskBlock(n = 16, P = 255) {
  const seed = [];
  for (let j = 0; j < 8; j++) { const b = Buffer.alloc(n); b[n - 1] = 1 << j; seed.push(b); }
  const steps = [`LET m=0x${Buffer.concat(seed).toString('hex').toUpperCase()} LET zz=0x${'00'.repeat(n)}`];
  let blocks = 8, k = 1; const target = n === 32 ? 256 : 128;
  while (blocks < target) { steps.push(`LET m=CONCAT(m SUBSET(${k} ${blocks * n} m) SUBSET(0 ${k} zz))`); blocks *= 2; k *= 2; }
  if (n === 16) steps.push('LET m=CONCAT(m m)');
  if (P !== 256) steps.push(`LET m=SUBSET(0 ${P * n} m)`);
  return steps.join(' ');
}
// One hop of verification. idx = the hop-index byte expression, hoff = input index of this hop's first helper.
function hopBlock({ k, idx, hoff, n = 16, P = 255, K = 5 }) {
  const p = 16 * k;
  const drep = n === 16
    ? 'LET e=CONCAT(SUBSET(16 32 d) SUBSET(16 32 d)) LET f=CONCAT(SUBSET(0 16 d) SUBSET(0 16 d)) ' +
      Array(6).fill('LET e=CONCAT(e e) LET f=CONCAT(f f)').join(' ') + ' LET e=CONCAT(e f)'
    : 'LET e=CONCAT(d d) ' + Array(7).fill('LET e=CONCAT(e e)').join(' ');
  const helpers = [];
  for (let c = 0; c < K; c++) helpers.push(`ASSERT GETINADDR(${hoff}+${c}) EQ ha`);
  return [
    `LET d=SHA2(CONCAT(0x01 aid ${idx} prevd STATE(${p + 3})))`,
    `ASSERT SHA2(CONCAT(0x01 STATE(${p + 2}))) EQ pk`,
    drep, P !== 256 ? `LET e=SUBSET(0 ${P * n} e)` : '',
    `ASSERT (CONCAT(0x01 STATE(${p})) & CONCAT(0x01 m)) EQ (CONCAT(0x01 e) & CONCAT(0x01 m))`,
    helpers.join(' '),
    `LET pk=SUBSET(0 32 STATE(${p + 3})) LET pay=SUBSET(32 64 STATE(${p + 3})) LET prevd=d LET sum=CONCAT(sum d pk)`,
  ].filter(Boolean).join(' ');
}
function chain({ maxHops, K, n, P, idxExpr, hoffExpr }) {
  const out = [];
  for (let k = 1; k <= maxHops; k++) out.push(`IF h GTE ${k} THEN ${hopBlock({ k, idx: idxExpr(k), hoff: hoffExpr(k), n, P, K })} ENDIF`);
  return out.join(' ');
}

// ---------------------------------------------------------------------------------- release coin Q text
// Q = ADDRESS("LET h=0x<summary hash> LET rec=0x<NOTES> " + Q_BODY). Settle (T2): inputs [0] Q stamp,
// [1] Q value; outputs [0] payout, [1] record (1 STAMP back at NOTES, keeps T2's small state).
export function qBody({ stamp }) {
  return 'LET s=STATE(200) ASSERT SHA2(s) EQ h IF @TOKENID EQ ' + stamp + ' THEN ASSERT @INPUT EQ 0' +
    ' LET pay=SUBSET(LEN(s)-32 LEN(s) s) ASSERT GETINADDR(1) EQ @ADDRESS ASSERT STATE(202) EQ GETINAMT(1) ASSERT STATE(99) EQ 2' +
    ' ASSERT STATE(201) LTE @BLOCK ASSERT STATE(201) GTE @BLOCK-20' +
    ' ASSERT VERIFYOUT(0 pay GETINAMT(1) GETINTOK(1) FALSE) RETURN VERIFYOUT(1 rec 1 @TOKENID TRUE) ENDIF' +
    ' RETURN @INPUT EQ 1 AND GETINADDR(0) EQ @ADDRESS AND GETINTOK(0) EQ ' + stamp;
}
export const qScript = (h, notes, stamp) => `LET h=${h} LET rec=${notes} ${qBody({ stamp })}`;

// ------------------------------------------------------------------------------------- claim voucher V
// V = ADDRESS("LET h=0x<statement hash> LET rec=0x<NOTES> " + V_BODY). Statement (port 230):
//   aid 32 | j 1 | key at hop j 32 | digest before hop j 32 | victim digest at hop j 32 | victim payout 32 |
//   cheater device root 32 | note value (read from the record, not the statement)
// Claim settle (C2): inputs [0] voucher, [1] record, [2] bond or pool. The voucher checks the statement
// against the record: same note, same key and prior digest at hop j, and a different digest at hop j (or
// the recorded chain ENDED at that key, i.e. its holder cashed a note it had already paid away).
export function vBody({ burn }) {
  return 'LET s=STATE(230) ASSERT SHA2(s) EQ h ASSERT @INPUT EQ 0 ASSERT GETINADDR(1) EQ rec LET r=STATE(200)' +
    ' ASSERT SUBSET(0 32 r) EQ SUBSET(0 32 s) LET j=NUMBER(SUBSET(32 33 s)) LET o=32+64*(j-1)' +
    ' ASSERT SUBSET(o o+32 r) EQ SUBSET(33 65 s) ASSERT SUBSET(o-32 o r) EQ SUBSET(65 97 s)' +
    ' IF o+64 LT LEN(r) THEN ASSERT SUBSET(o+32 o+64 r) NEQ SUBSET(97 129 s) ENDIF' +
    ` ASSERT STATE(231) EQ SUBSET(161 193 s) RETURN VERIFYOUT(0 ${burn} 1 @TOKENID FALSE)`;
}
export const vScript = (h, notes, burn) => `LET h=${h} LET rec=${notes} ${vBody({ burn })}`;

// ------------------------------------------------------------------------------------------------ NOTES
// Value coins, anchor marks (issued by the stamp dispenser at LOAD) and records. Carried in every cashing
// (T1) witness, so it holds only what cashing, expiry and records need.
export function notesScript({ stamp, usdw, burn, bodyHash, claimWindow, maxHops = 3, n = 16, P = 255, K = 5 }) {
  const cashChain = chain({ maxHops, K, n, P, idxExpr: (k) => '0x' + k.toString(16).padStart(2, '0'), hoffExpr: (k) => String(2 + K * (k - 1)) });
  const value = `IF @TOKENID EQ ${usdw} THEN LET ent=PREVSTATE(110+STATE(5)) ASSERT SUBSET(32 64 ent) EQ @COINID ASSERT GETINID(0) EQ SUBSET(0 32 ent) RETURN @INPUT EQ 1 ENDIF`;
  const mark = [
    `ASSERT @TOKENID EQ ${stamp} ASSERT @AMOUNT EQ 1 LET role=PREVSTATE(99)`,
    'IF role EQ 1 THEN ASSERT @INPUT EQ 0 LET i=STATE(5) LET ent=PREVSTATE(110+i)',
    ' ASSERT SUBSET(0 32 ent) EQ @COINID ASSERT GETINID(1) EQ SUBSET(32 64 ent)',
    ` IF @BLOCK GT PREVSTATE(103) THEN ASSERT VERIFYOUT(0 ${burn} 1 @TOKENID FALSE) RETURN VERIFYOUT(1 PREVSTATE(101) GETINAMT(1) GETINTOK(1) FALSE) ENDIF`,
    ` LET h=STATE(1) ASSERT h LTE ${maxHops} ASSERT @TOTIN EQ 2+${K}*h IF h GT 0 THEN ASSERT STATE(97) EQ 2 ENDIF`,
    ' LET aid=@COINID LET pk=SUBSET(64 96 ent) LET prevd=aid LET pay=PREVSTATE(101) LET sum=CONCAT(aid pk)',
    ` IF h GT 0 THEN LET ha=ADDRESS([LET owner=]+STRING(STATE(6))+[ MAST ${bodyHash}]) ${maskBlock(n, P)} ENDIF`,
    ' ' + cashChain,
    ' LET sum=CONCAT(sum pay)',
    ` LET q=ADDRESS([LET h=]+STRING(SHA2(sum))+[ LET rec=]+STRING(@ADDRESS)+[ ${qBody({ stamp })}])`,
    ' ASSERT VERIFYOUT(0 q 1 @TOKENID FALSE) RETURN VERIFYOUT(1 q GETINAMT(1) GETINTOK(1) FALSE) ENDIF',
    `IF role EQ 2 THEN IF @BLOCK GT PREVSTATE(201)+${claimWindow} THEN RETURN VERIFYOUT(@INPUT ${burn} 1 @TOKENID FALSE) ENDIF`,
    ' ASSERT @INPUT EQ 1 ASSERT STATE(9) EQ 4 ASSERT SAMESTATE(99 99) ASSERT SAMESTATE(200 202) RETURN VERIFYOUT(1 @ADDRESS 1 @TOKENID TRUE) ENDIF',
    'RETURN FALSE',
  ].join(' ');
  return `${value} ${mark}`;
}

// -------------------------------------------------------------------------------------------- DISPENSER
// Stamp lanes (>= 2 STAMP, no state) at their own address. LOAD issues one stamp per note into NOTES;
// CLAIM1 verifies a victim's chain (helpers from input 1) and mints one stamped voucher; MERGE / SPLIT.
export function dispenserScript({ notes, usdw, burn, bodyHash, minNote, maxExpiry, maxHops = 3, n = 16, P = 255, K = 5 }) {
  const claimChain = chain({ maxHops, K, n, P, idxExpr: (k) => `SUBSET(${k - 1} ${k} STATE(7))`, hoffExpr: (k) => String(1 + K * (k - 1)) });
  return [
    'ASSERT @AMOUNT GT 1 LET op=STATE(9)',
    `IF op EQ 1 THEN LET c=STATE(8) ASSERT c GT 0 ASSERT STATE(99) EQ 1 ASSERT STATE(103) LTE @BLOCK+${maxExpiry} LET i=0 WHILE i LT c DO`,
    ` ASSERT VERIFYOUT(2*i ${notes} 1 @TOKENID TRUE) ASSERT GETOUTADDR(2*i+1) EQ ${notes} ASSERT GETOUTTOK(2*i+1) EQ ${usdw} ASSERT GETOUTAMT(2*i+1) GTE ${minNote} ASSERT GETOUTKEEPSTATE(2*i+1) LET i=i+1 ENDWHILE`,
    ' ASSERT @AMOUNT-c GT 1 RETURN VERIFYOUT(2*c @ADDRESS @AMOUNT-c @TOKENID FALSE) ENDIF',
    `IF op EQ 3 THEN ASSERT @INPUT EQ 0 ASSERT STATE(97) EQ 1 LET h=STATE(1) ASSERT h GT 0 ASSERT h LTE ${maxHops} ASSERT @TOTIN EQ 1+${K}*h`,
    ' LET jj=NUMBER(SUBSET(0 1 STATE(7))) LET t=1 WHILE t LT h DO ASSERT NUMBER(SUBSET(t t+1 STATE(7))) EQ jj+t LET t=t+1 ENDWHILE',
    ` LET aid=STATE(2) LET pk=STATE(3) LET prevd=STATE(4) LET sum=0x00 LET pay=0x00 LET ha=ADDRESS([LET owner=]+STRING(STATE(6))+[ MAST ${bodyHash}])`,
    ' ' + maskBlock(n, P), ' ' + claimChain,
    ' ASSERT PROOF(STATE(3) 0 STATE(231) STATE(234) STATE(233))',
    ' LET s=CONCAT(STATE(2) SUBSET(0 1 STATE(7)) STATE(3) STATE(4) SUBSET(1 33 sum) pay STATE(231))',
    ` LET v=ADDRESS([LET h=]+STRING(SHA2(s))+[ LET rec=${notes} ${vBody({ burn })}])`,
    ' ASSERT VERIFYOUT(0 v 1 @TOKENID FALSE) ASSERT @AMOUNT GT 2 RETURN VERIFYOUT(1 @ADDRESS @AMOUNT-1 @TOKENID FALSE) ENDIF',
    'IF op EQ 40 THEN LET i=0 WHILE i LT @TOTIN DO ASSERT GETINADDR(i) EQ @ADDRESS ASSERT GETINTOK(i) EQ @TOKENID LET i=i+1 ENDWHILE',
    ' RETURN VERIFYOUT(0 @ADDRESS SUMINPUTS(@TOKENID) @TOKENID FALSE) ENDIF',
    'IF op EQ 41 THEN LET a=STATE(8) ASSERT a GT 1 ASSERT @AMOUNT-a GT 1 ASSERT VERIFYOUT(0 @ADDRESS a @TOKENID FALSE) RETURN VERIFYOUT(1 @ADDRESS @AMOUNT-a @TOKENID FALSE) ENDIF',
    'RETURN FALSE',
  ].join(' ');
}

// ------------------------------------------------------------------------------------------------ POOL
// Slashed bond (USDw). REGISTER (op 4) appends a claim backed by a genuine voucher during the claim
// window; SETTLE (op 30) pays claims pro rata from the victims' share (optionally topped up by a vendor
// bond) and burns the rest; RETIRE (op 24) burns anything left after a long time.
function voucherCheck(notes, burn) {
  return `ASSERT GETINTOK(0) EQ STAMPID ASSERT GETINADDR(0) EQ ADDRESS([LET h=]+STRING(SHA2(STATE(230)))+[ LET rec=${notes} ${vBody({ burn })}])`;
}
export function poolScript({ stamp, notes, burn, claimWindow, maxClaims = 8, shareNum = 1, shareDen = 2, abandon }) {
  const vc = voucherCheck(notes, burn).replace('STAMPID', stamp);
  return [
    'LET op=STATE(9)',
    `IF op EQ 4 THEN ${vc} ASSERT @INPUT EQ 2 ASSERT @BLOCK LTE PREVSTATE(130)+${claimWindow}`,
    ' ASSERT PREVSTATE(120+STATE(232)) EQ STATE(231) ASSERT SAMESTATE(120 131)',
    ` LET c=PREVSTATE(139) ASSERT c LT ${maxClaims} ASSERT STATE(139) EQ c+1 LET x=140+3*c LET hs=SHA2(STATE(230))`,
    ' LET k=0 WHILE k LT c DO ASSERT SAMESTATE(140+3*k 142+3*k) ASSERT PREVSTATE(142+3*k) NEQ hs LET k=k+1 ENDWHILE',
    ' ASSERT STATE(x+2) EQ hs ASSERT STATE(x) EQ SUBSET(129 161 STATE(230)) ASSERT STATE(x+1) EQ STATE(202)',
    ' RETURN VERIFYOUT(2 @ADDRESS @AMOUNT @TOKENID TRUE) ENDIF',
    `IF op EQ 30 THEN ASSERT @INPUT EQ 0 ASSERT @BLOCK GT PREVSTATE(130)+${claimWindow} LET c=PREVSTATE(139) LET vv=STATE(236)`,
    ` LET pot=PREVSTATE(131)*${shareNum}+vv*${shareDen} LET tot=0 LET k=0 WHILE k LT c DO LET tot=tot+PREVSTATE(141+3*k) LET k=k+1 ENDWHILE`,
    ' LET paid=0 LET k=0 WHILE k LT c DO LET cl=PREVSTATE(141+3*k) LET p=STATE(240+k)',
    `  IF tot*${shareDen} LTE pot THEN ASSERT p EQ cl ELSE ASSERT p*tot*${shareDen} LTE cl*pot ASSERT cl*pot LT (p+0.00000001)*tot*${shareDen} ENDIF`,
    '  ASSERT VERIFYOUT(k PREVSTATE(140+3*k) p @TOKENID FALSE) LET paid=paid+p LET k=k+1 ENDWHILE',
    ' IF vv GT 0 THEN ASSERT GETINADDR(1) EQ STATE(239) ASSERT SAMESTATE(120 128) ENDIF',
    ` RETURN VERIFYOUT(c ${burn} @AMOUNT+vv-paid @TOKENID FALSE) ENDIF`,
    `IF op EQ 24 THEN ASSERT @COINAGE GT ${abandon} RETURN VERIFYOUT(0 ${burn} @AMOUNT @TOKENID FALSE) ENDIF`,
    'RETURN FALSE',
  ].join(' ');
}

// ------------------------------------------------------------------------------------------------ BOND
export function bondScript({ stamp, notes, pool, burn, n = 16, K = 5, P = 255, wDelay, abandon }) {
  const B = P / K, lbl = 8 * n;
  const cheat = [
    'LET i=STATE(12) LET c=STATE(13) LET w=i-c*' + B + ' LET a=STATE(10) LET b=STATE(11)',
    `LET tt=SHA2(SUBSET(0 ${n} SHA2(a)))^SHA2(SUBSET(0 ${n} SHA2(b)))`,
    'ASSERT CONCAT(0x01 tt) EQ CONCAT(0x01 SUBSET(w*32 w*32+32 STATE(14)))',
    `LET v=i%${lbl} LET q=8*(${n - 1}-FLOOR(v/8))+(v%8) ASSERT NOT BITGET(a q) ASSERT BITGET(b q)`,
    'ASSERT SHA2(CONCAT(0x01 STATE(14))) EQ SUBSET(c*32 c*32+32 STATE(15))',
    'ASSERT SHA2(CONCAT(0x01 STATE(15))) EQ STATE(16)',
    'ASSERT PROOF(STATE(16) 0 PREVSTATE(120+STATE(17)) STATE(18) STATE(19))',
  ].join(' ');
  const freezeCommon = 'ASSERT SAMESTATE(120 129) ASSERT STATE(130) LTE @BLOCK ASSERT STATE(130) GTE @BLOCK-20 ASSERT STATE(131) EQ @AMOUNT';
  const vc = voucherCheck(notes, burn).replace('STAMPID', stamp);
  return [
    'LET op=STATE(9)',
    `IF op EQ 20 THEN ${cheat} ${freezeCommon} ASSERT STATE(139) EQ 0 RETURN VERIFYOUT(0 ${pool} @AMOUNT @TOKENID TRUE) ENDIF`,
    `IF op EQ 4 THEN ${vc} ASSERT @INPUT EQ 2 ASSERT PREVSTATE(120+STATE(232)) EQ STATE(231) ${freezeCommon} ASSERT STATE(139) EQ 1`,
    ' ASSERT STATE(142) EQ SHA2(STATE(230)) ASSERT STATE(140) EQ SUBSET(129 161 STATE(230)) ASSERT STATE(141) EQ STATE(202)',
    ` RETURN VERIFYOUT(2 ${pool} @AMOUNT @TOKENID TRUE) ENDIF`,
    'IF op EQ 21 THEN ASSERT SIGNEDBY(PREVSTATE(125)) ASSERT SAMESTATE(120 128) ASSERT STATE(129) GTE @BLOCK-20 ASSERT STATE(129) LTE @BLOCK RETURN VERIFYOUT(0 @ADDRESS @AMOUNT @TOKENID TRUE) ENDIF',
    `IF op EQ 22 THEN ASSERT PREVSTATE(129) GT 0 ASSERT @BLOCK GT PREVSTATE(129)+${wDelay} RETURN VERIFYOUT(0 PREVSTATE(126) @AMOUNT @TOKENID FALSE) ENDIF`,
    'IF op EQ 23 THEN ASSERT SIGNEDBY(PREVSTATE(125)) LET r=PREVSTATE(124) ASSERT r LT 4 ASSERT STATE(124) EQ r+1 ASSERT SAMESTATE(125 128) ASSERT STATE(129) EQ 0',
    ' LET k=0 WHILE k LT r DO ASSERT SAMESTATE(120+k 120+k) LET k=k+1 ENDWHILE ASSERT STATE(120+r) NEQ 0x00 RETURN VERIFYOUT(0 @ADDRESS @AMOUNT @TOKENID TRUE) ENDIF',
    `IF op EQ 24 THEN ASSERT @COINAGE GT ${abandon} RETURN VERIFYOUT(0 PREVSTATE(126) @AMOUNT @TOKENID FALSE) ENDIF`,
    'RETURN FALSE',
  ].join(' ');
}

// ---------------------------------------------------------------------------------------------- VENDOR
// Vendor bond (USDw). CONTRIB (op 30, co-spent at input 1 with a pool SETTLE at input 0): the certified
// device root (pool port 120, pinned by the pool) must carry this vendor's certificate (CHECKSIG with the
// vendor's Minima key); the vendor pays min(cap, shortfall) into the settlement and burns a fixed penalty.
export function vendorScript({ burn, cap, penalty, wDelay, abandon }) {
  // vendor bond stored state: 150 vendor Minima key, 151 vendor payout (ports chosen not to collide with the
  // pool's 120..142, because both coins read the one shared transaction state at SETTLE)
  return [
    'LET op=STATE(9)',
    'IF op EQ 30 THEN ASSERT @INPUT EQ 1 ASSERT STATE(127) EQ PREVSTATE(150) ASSERT CHECKSIG(PREVSTATE(150) STATE(120) STATE(128))',
    ' LET c=STATE(139) LET tot=0 LET k=0 WHILE k LT c DO LET tot=tot+STATE(141+3*k) LET k=k+1 ENDWHILE',
    ` LET sh=tot*2-STATE(131) IF sh LT 0 THEN LET sh=0 ENDIF IF sh GT ${cap}*2 THEN LET sh=${cap}*2 ENDIF ASSERT STATE(236)*2 EQ sh`,
    ` ASSERT STATE(239) EQ @ADDRESS ASSERT VERIFYOUT(c+1 ${burn} ${penalty} @TOKENID FALSE) ASSERT SAMESTATE(150 151)`,
    ` RETURN VERIFYOUT(c+2 @ADDRESS @AMOUNT-STATE(236)-${penalty} @TOKENID TRUE) ENDIF`,
    'IF op EQ 21 THEN ASSERT SIGNEDBY(PREVSTATE(150)) ASSERT SAMESTATE(150 151) RETURN VERIFYOUT(0 @ADDRESS @AMOUNT @TOKENID TRUE) ENDIF',
    `IF op EQ 22 THEN ASSERT SIGNEDBY(PREVSTATE(150)) ASSERT @COINAGE GT ${wDelay} RETURN VERIFYOUT(0 PREVSTATE(151) @AMOUNT @TOKENID FALSE) ENDIF`,
    `IF op EQ 24 THEN ASSERT @COINAGE GT ${abandon} RETURN VERIFYOUT(0 PREVSTATE(151) @AMOUNT @TOKENID FALSE) ENDIF`,
    'RETURN FALSE',
  ].join(' ');
}
