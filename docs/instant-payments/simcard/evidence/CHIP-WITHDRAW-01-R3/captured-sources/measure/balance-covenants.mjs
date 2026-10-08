// Covenant generators for the chip-balance model (Phase 1 redo, founder decision 13).
// Deployed KISS must be comment-free; explanations live in docs/chip-balance-design.md.
// Evidence level of the texts: L0 until a receipt in measure/receipts/balance_covenant_branches.json says otherwise.
//
// Objects and addresses, deployed in this order (no cycles):
//   1. VAULT     shared USDw reserve: stateless deposit coins + lanes with a per-lane outflow brake (ports 180, 181).
//                Recognises a genuine release coin Q by its CHIP marker and its address template.
//   2. HELPER    per owner: "LET owner=0x<tag> MAST 0x<body hash>" (LX16 chunk verifier, reused from Phase 1,
//                guarded by GETINTOK(0) EQ CHIP).
//   3. CHIPACC   one coin per chip (exactly 1 CHIP), the whole account record in port 120 (249 bytes, fixed layout):
//                FUND, D1 defund-verify, funding-mismatch / cap evidence, clone evidence, owner revoke, owner payout
//                change, vendor revoke, retirement. Embeds VAULT and the helper body hash.
//   4. VENDOR    per-vendor gate coins (>= 2 CHIP, pinned ports 150-156: vendor key, payout, window start, window
//                use, bond total, incidents, withdraw request) and bond coins (USDw, pin port 150). Embeds CHIPACC
//                and VAULT. REGISTER mints a chip account; GATE caps each vendor's defunds per window in proportion
//                to its bond; SLASH moves a penalty from the bond into the vault on chain-checked evidence.
//   5. DISP      CHIP dispenser: ADMIT releases a CHIP stock to a new vendor gate with a bond >= minimum.
//   6. SWAP      template "LET h= LET sel= LET buy= LET dl=": trustless savings -> checking swap (crux 1, a4).
// Release coin Q (per defund / evidence): "LET h=<hash> LET acc=<CHIPACC> LET vlt=<VAULT> " + QBODY.
//
// CHIP is a protocol-only marker token: its supply starts in dispenser lanes and every rule only moves it between
// protocol coins (DISP -> VENDOR gates -> CHIPACC accounts <-> Q) or burns it. On Minima anyone can pay any address
// with any state, so "holds CHIP" is what proves a coin was made by the protocol (Phase 1 STAMP finding).
//
// Account record (port 120), byte offsets:
//   0 chip id | 32 chain-key root | 64 owner key | 96 owner payout | 128 vendor key | 160 helper owner tag |
//   192 fund count k (4) | 196 funded total F (8, atoms) | 204 highest chain-key index used u (4) |
//   208 defunded total D (8) | 216 window start (4) | 220 window use (8) | 228 window limit (8) | 236 status (1) |
//   237 status block (4) | 241 key-tree root sum (8)                                              = 249 bytes
// Defund voucher message (port 19), signed by chain key i with LX16:
//   0 key index i (4) | 4 amount y (8, atoms) | 12 funding count k_chip (4) | 16 funded total F_chip (8) |
//   24 revocation-list version (4) | 28 balance after (8) | 36 cumulative sent (8) | 44 cumulative received (8) = 52
//   digest d = SHA2(0x44 | chip id | message)
// Status: 0 active, 1 owner-revoked (defund still allowed: it pays the owner), 2 evidence-revoked, 3 vendor-revoked.
import * as G from './kissgen.mjs';
import * as C from './covenants.mjs';

export const REC = { chip: [0, 32], root: [32, 64], okey: [64, 96], opay: [96, 128], vkey: [128, 160], tag: [160, 192],
  k: [192, 196], f: [196, 204], u: [204, 208], dd: [208, 216], ws: [216, 220], wu: [220, 228], wl: [228, 236],
  st: [236, 237], sb: [237, 241], rs: [241, 249], LEN: 249 };
export const MSG = { i: [0, 4], y: [4, 12], kc: [12, 16], fc: [16, 24], ver: [24, 28], bal: [28, 36], sent: [36, 44], recv: [44, 52], LEN: 52 };
export const OPS = { FUND: 1, D1: 2, EVMISMATCH: 3, EVCLONE: 4, D2: 10, MERGE: 11, SPLIT: 12, OWNERREVOKE: 20, SETPAYOUT: 21,
  VENDORREVOKE: 22, RETIRE: 24, EVSETTLE: 30, WREQ: 31, WDO: 32, REGISTER: 40, ADMIT: 50 };
const sub = (f, v = 'r') => `SUBSET(${f[0]} ${f[1]} ${v})`;
const num = (f, v = 'r') => `NUMBER(${sub(f, v)})`;
const hexz = (n) => '0x' + '00'.repeat(n);

// --------------------------------------------------------------------------------------- release coin Q
export function qBody({ chip }) {
  return 'LET nr=STATE(120) LET ex=STATE(201) ASSERT SHA2(CONCAT(nr ex)) EQ h ASSERT @INPUT EQ 0' +
    ` ASSERT GETINTOK(1) EQ ${chip} ASSERT GETINAMT(1) GT 1 ASSERT STATE(150) EQ ${sub(REC.vkey, 'nr')}` +
    ' ASSERT VERIFYOUT(0 acc 1 @TOKENID TRUE)' +
    ' IF NUMBER(SUBSET(0 1 ex)) EQ 0 THEN ASSERT STATE(9) EQ 10 RETURN GETINADDR(2) EQ vlt ENDIF' +
    ' ASSERT STATE(9) EQ 30 RETURN TRUE';
}
export const qScript = (h, acc, vlt, chip) => `LET h=${h} LET acc=${acc} LET vlt=${vlt} ${qBody({ chip })}`;
// KISS expression computing Q's address (used by CHIPACC with its own @ADDRESS, by VAULT and VENDOR from state)
const qAddrExpr = ({ chip, hashExpr, accExpr, vltExpr }) =>
  `ADDRESS([LET h=]+STRING(${hashExpr})+[ LET acc=]+STRING(${accExpr})+[ LET vlt=]+STRING(${vltExpr})+[ ${qBody({ chip })}])`;

// ------------------------------------------------------------------------ LX16 single-signature machinery
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
// Checks the LX16 signature in ports 16 (R), 17 (C, checked by helpers), 18 (chunk digests) on digest d, by the
// key committed as pk, and that the 5 helpers at inputs 1..5 sit at the owner's helper address.
function lxCheck({ n = 16, P = 255, K = 5, helperHash, tagExpr }) {
  const drep = 'LET e=CONCAT(SUBSET(16 32 d) SUBSET(16 32 d)) LET ff=CONCAT(SUBSET(0 16 d) SUBSET(0 16 d)) ' +
    Array(6).fill('LET e=CONCAT(e e) LET ff=CONCAT(ff ff)').join(' ') + ' LET e=CONCAT(e ff)';
  const helpers = []; for (let c = 0; c < K; c++) helpers.push(`ASSERT GETINADDR(${1 + c}) EQ ha`);
  return [
    'LET pk=SHA2(CONCAT(0x01 STATE(18)))',
    maskBlock(n, P), drep, `LET e=SUBSET(0 ${P * n} e)`,
    'ASSERT (CONCAT(0x01 STATE(16)) & CONCAT(0x01 m)) EQ (CONCAT(0x01 e) & CONCAT(0x01 m))',
    `LET ha=ADDRESS([LET owner=]+STRING(${tagExpr})+[ MAST ${helperHash}])`,
    helpers.join(' '),
  ].join(' ');
}

// ------------------------------------------------------------------------------------------------ CHIPACC
export function accScript({ chip, usdw, vault, burn, helperHash, awindow, capAtoms, minFund, retireAge }) {
  const recOnly = (st) => `CONCAT(SUBSET(0 236 r) ${st} SETLEN(4 HEX(STATE(29))) SUBSET(241 249 r))`;
  const blockOk = 'ASSERT STATE(29) LTE @BLOCK ASSERT STATE(29) GTE @BLOCK-20';
  const toQ = `LET q=${qAddrExpr({ chip, hashExpr: 'SHA2(CONCAT(nr ex))', accExpr: '@ADDRESS', vltExpr: vault })} RETURN VERIFYOUT(0 q 1 @TOKENID FALSE)`;
  const verify = ['LET mm=STATE(19) ASSERT LEN(mm) EQ 52', `LET d=SHA2(CONCAT(0x44 ${sub(REC.chip)} mm))`,
    lxCheck({ helperHash, tagExpr: sub(REC.tag) }),
    `LET i=${num(MSG.i, 'mm')} ASSERT PROOF(pk i ${sub(REC.root)} ${num(REC.rs)} STATE(27))`].join(' ');
  return [
    `ASSERT @TOKENID EQ ${chip} ASSERT @AMOUNT EQ 1 LET r=PREVSTATE(120) LET op=STATE(9) LET st=${num(REC.st)}`,
    // FUND: anyone; USDw enters the vault in the same transaction; k and F rise, nothing else changes
    `IF op EQ 1 THEN ASSERT @INPUT EQ 0 ASSERT st EQ 0 LET x=GETOUTAMT(1)`,
    ` ASSERT GETOUTADDR(1) EQ ${vault} ASSERT GETOUTTOK(1) EQ ${usdw} ASSERT NOT GETOUTKEEPSTATE(1) ASSERT x GTE ${minFund}`,
    ` ASSERT STATE(120) EQ CONCAT(SUBSET(0 192 r) SETLEN(4 HEX(${num(REC.k)}+1)) SETLEN(8 HEX(${num(REC.f)}+x*100000000)) SUBSET(204 249 r))`,
    ' RETURN VERIFYOUT(0 @ADDRESS 1 @TOKENID TRUE) ENDIF',
    // D1 (defund verify) and funding-mismatch / cap evidence: the chip's LX16 voucher, checked with 5 helpers
    `IF (op EQ 2) OR (op EQ 3) THEN ASSERT @INPUT EQ 0 ASSERT STATE(97) EQ 1 ASSERT @TOTIN EQ 6 ${blockOk} ${verify}`,
    ` LET kc=${num(MSG.kc, 'mm')}`,
    ` IF op EQ 2 THEN ASSERT st LTE 1 ASSERT i GT ${num(REC.u)} ASSERT kc LTE ${num(REC.k)} ASSERT ${num(MSG.bal, 'mm')} LTE ${capAtoms}`,
    `  LET y=${num(MSG.y, 'mm')} ASSERT y GT 0 LET ws=${num(REC.ws)} LET wu=${num(REC.wu)}+y`,
    `  IF STATE(29) GT ws+${awindow} THEN LET ws=STATE(29) LET wu=y ENDIF ASSERT wu LTE ${num(REC.wl)}`,
    `  LET nr=CONCAT(SUBSET(0 204 r) SETLEN(4 HEX(i)) SETLEN(8 HEX(${num(REC.dd)}+y)) SETLEN(4 HEX(ws)) SETLEN(8 HEX(wu)) SUBSET(228 249 r))`,
    '  LET ex=CONCAT(0x00 SETLEN(8 HEX(y)))',
    ` ELSE ASSERT st LTE 1 ASSERT (kc GT ${num(REC.k)}) OR (${num(MSG.bal, 'mm')} GT ${capAtoms})`,
    `  LET nr=${recOnly('0x02')} LET ex=CONCAT(0x01 ${hexz(8)}) ENDIF`,
    ` ${toQ} ENDIF`,
    // clone evidence: both secrets of one position of one of this chip's chain keys (two different signatures)
    `IF op EQ 4 THEN ASSERT @INPUT EQ 0 ASSERT st LTE 1 ${blockOk}`,
    ' LET i=STATE(12) LET c=STATE(13) LET w=i-c*51 LET a=STATE(10) LET b=STATE(11)',
    ' LET tt=SHA2(SUBSET(0 16 SHA2(a)))^SHA2(SUBSET(0 16 SHA2(b)))',
    ' ASSERT CONCAT(0x01 tt) EQ CONCAT(0x01 SUBSET(w*32 w*32+32 STATE(14)))',
    ' LET v=i%128 LET z=8*(15-FLOOR(v/8))+(v%8) ASSERT NOT BITGET(a z) ASSERT BITGET(b z)',
    ' ASSERT SHA2(CONCAT(0x01 STATE(14))) EQ SUBSET(c*32 c*32+32 STATE(15))',
    ` LET pk=SHA2(CONCAT(0x01 STATE(15))) ASSERT PROOF(pk STATE(26) ${sub(REC.root)} ${num(REC.rs)} STATE(28))`,
    ` LET nr=${recOnly('0x02')} LET ex=CONCAT(0x01 ${hexz(8)}) ${toQ} ENDIF`,
    // owner revoke (lost / stolen chip), owner payout change, vendor revoke: all keep the coin at CHIPACC
    `IF op EQ 20 THEN ASSERT SIGNEDBY(${sub(REC.okey)}) ASSERT st EQ 0 ${blockOk} ASSERT STATE(120) EQ ${recOnly('0x01')} RETURN VERIFYOUT(@INPUT @ADDRESS 1 @TOKENID TRUE) ENDIF`,
    `IF op EQ 21 THEN ASSERT SIGNEDBY(${sub(REC.okey)}) ASSERT LEN(STATE(122)) EQ 32 ASSERT STATE(120) EQ CONCAT(SUBSET(0 96 r) STATE(122) SUBSET(128 249 r)) RETURN VERIFYOUT(@INPUT @ADDRESS 1 @TOKENID TRUE) ENDIF`,
    `IF op EQ 22 THEN ASSERT SIGNEDBY(${sub(REC.vkey)}) ASSERT st LTE 1 ${blockOk} ASSERT STATE(120) EQ ${recOnly('0x03')} RETURN VERIFYOUT(@INPUT @ADDRESS 1 @TOKENID TRUE) ENDIF`,
    // retirement: a revoked account idle for a long time burns its marker (the account holds no value)
    `IF op EQ 24 THEN ASSERT st GT 0 ASSERT @COINAGE GT ${retireAge} RETURN VERIFYOUT(@INPUT ${burn} 1 @TOKENID FALSE) ENDIF`,
    'RETURN FALSE',
  ].join(' ');
}

// -------------------------------------------------------------------------------------------------- VAULT
export function vaultScript({ chip, usdw, successor, vwindow, betaPct, floorAtoms, dormancy }) {
  return [
    `ASSERT @TOKENID EQ ${usdw} LET op=STATE(9)`,
    // retirement (any coin at the vault, lane or deposit): after long dormancy the reserve moves to the successor
    `IF op EQ 24 THEN ASSERT @COINAGE GT ${dormancy} RETURN VERIFYOUT(@INPUT ${successor} GETINAMT(@INPUT) @TOKENID FALSE) ENDIF`,
    // deposits merged into a lane (anyone): the lane at input 0 keeps its window, gains every input
    `IF op EQ 11 THEN IF @INPUT GT 0 THEN RETURN GETINADDR(0) EQ @ADDRESS ENDIF`,
    ' LET t=0 LET s=0 WHILE t LT @TOTIN DO ASSERT GETINADDR(t) EQ @ADDRESS ASSERT GETINTOK(t) EQ @TOKENID LET s=s+GETINAMT(t) LET t=t+1 ENDWHILE',
    ' ASSERT SAMESTATE(180 181) RETURN VERIFYOUT(0 @ADDRESS s @TOKENID TRUE) ENDIF',
    // lane split (anyone): both halves keep the same window state
    `IF op EQ 12 THEN ASSERT @TOTIN EQ 1 ASSERT SAMESTATE(180 181) LET a=GETOUTAMT(0) ASSERT a GT 0 ASSERT VERIFYOUT(0 @ADDRESS a @TOKENID TRUE) RETURN VERIFYOUT(1 @ADDRESS GETINAMT(0)-a @TOKENID TRUE) ENDIF`,
    // PAY (defund settle, D2): a genuine release coin at input 0, the vendor gate at 1, this lane at 2
    `IF op EQ 10 THEN ASSERT @INPUT EQ 2 ASSERT GETINTOK(0) EQ ${chip} LET nr=STATE(120) LET ex=STATE(201)`,
    ` ASSERT NUMBER(SUBSET(0 1 ex)) EQ 0 ASSERT GETINADDR(0) EQ ${qAddrExpr({ chip, hashExpr: 'SHA2(CONCAT(nr ex))', accExpr: 'STATE(202)', vltExpr: '@ADDRESS' })}`,
    ' ASSERT STATE(29) LTE @BLOCK ASSERT STATE(29) GTE @BLOCK-20',
    ` LET y=NUMBER(SUBSET(1 9 ex)) LET ws=PREVSTATE(180) LET wu=PREVSTATE(181)+y IF STATE(29) GT ws+${vwindow} THEN LET ws=STATE(29) LET wu=y ENDIF`,
    ` ASSERT STATE(180) EQ ws ASSERT STATE(181) EQ wu LET bal=GETINAMT(2)`,
    ` ASSERT (wu*100 LTE bal*100000000*${betaPct}) OR (wu LTE ${floorAtoms})`,
    ` LET p=GETOUTAMT(3) ASSERT p*100000000 EQ y ASSERT GETOUTADDR(3) EQ SUBSET(96 128 nr) ASSERT GETOUTTOK(3) EQ @TOKENID ASSERT NOT GETOUTKEEPSTATE(3)`,
    ' RETURN VERIFYOUT(2 @ADDRESS bal-p @TOKENID TRUE) ENDIF',
    'RETURN FALSE',
  ].join(' ');
}

// ------------------------------------------------------------------------------------------------- VENDOR
export function vendorScript({ chip, usdw, acc, vault, burn, vwindow, rhoPct, vfloorAtoms, penaltyAtoms, freezeAt, maxWl, wdelay, abandon }) {
  const qCheck = (flag) => `ASSERT GETINTOK(0) EQ ${chip} LET nr=STATE(120) LET ex=STATE(201) ASSERT NUMBER(SUBSET(0 1 ex)) EQ ${flag}` +
    ` ASSERT GETINADDR(0) EQ ${qAddrExpr({ chip, hashExpr: 'SHA2(CONCAT(nr ex))', accExpr: acc, vltExpr: 'STATE(203)' })}`;
  return [
    'LET op=STATE(9)',
    `IF @TOKENID EQ ${chip} THEN ASSERT @AMOUNT GT 1`,
    // GATE at a defund settle: per-vendor window cap proportional to the bond, floor so a bond-less vendor's chips can still exit
    ` IF op EQ 10 THEN ASSERT @INPUT EQ 1 ${qCheck(0)} ASSERT SAMESTATE(150 151) ASSERT SAMESTATE(154 156) ASSERT PREVSTATE(155) LT ${freezeAt}`,
    `  LET y=NUMBER(SUBSET(1 9 ex)) LET ws=PREVSTATE(152) LET wu=PREVSTATE(153)+y IF STATE(29) GT ws+${vwindow} THEN LET ws=STATE(29) LET wu=y ENDIF`,
    `  ASSERT STATE(152) EQ ws ASSERT STATE(153) EQ wu ASSERT (wu*100 LTE PREVSTATE(154)*${rhoPct}) OR (wu LTE ${vfloorAtoms})`,
    '  RETURN VERIFYOUT(1 @ADDRESS @AMOUNT @TOKENID TRUE) ENDIF',
    // SLASH at an evidence settle: penalty from the bond coin at input 2 into the vault, incident counted
    ` IF op EQ 30 THEN ASSERT @INPUT EQ 1 ${qCheck(1)} ASSERT SAMESTATE(150 153) ASSERT SAMESTATE(156 156)`,
    `  LET p=${penaltyAtoms} IF p GT PREVSTATE(154) THEN LET p=PREVSTATE(154) ENDIF ASSERT STATE(157) EQ p`,
    '  ASSERT STATE(154) EQ PREVSTATE(154)-p ASSERT STATE(155) EQ PREVSTATE(155)+1 ASSERT GETINADDR(2) EQ @ADDRESS',
    '  RETURN VERIFYOUT(1 @ADDRESS @AMOUNT @TOKENID TRUE) ENDIF',
    // REGISTER (vendor-signed): mint one chip account with a clean record carrying this vendor's key
    ` IF op EQ 40 THEN ASSERT @INPUT EQ 0 ASSERT SIGNEDBY(PREVSTATE(150)) ASSERT PREVSTATE(155) LT ${freezeAt} LET nr=STATE(120) ASSERT LEN(nr) EQ 249`,
    `  ASSERT ${sub(REC.vkey, 'nr')} EQ PREVSTATE(150) ASSERT SUBSET(192 228 nr) EQ ${hexz(36)} ASSERT ${num(REC.wl, 'nr')} LTE ${maxWl} ASSERT SUBSET(236 241 nr) EQ ${hexz(5)}`,
    `  ASSERT SAMESTATE(150 156) ASSERT VERIFYOUT(0 ${acc} 1 @TOKENID TRUE) RETURN VERIFYOUT(1 @ADDRESS @AMOUNT-1 @TOKENID TRUE) ENDIF`,
    // withdrawal request (vendor-signed) and withdrawal after the delay, co-spent with a bond coin at input 1
    ' IF op EQ 31 THEN ASSERT SIGNEDBY(PREVSTATE(150)) ASSERT SAMESTATE(150 155) ASSERT STATE(156) LTE @BLOCK ASSERT STATE(156) GTE @BLOCK-20 RETURN VERIFYOUT(@INPUT @ADDRESS @AMOUNT @TOKENID TRUE) ENDIF',
    ` IF op EQ 32 THEN ASSERT @INPUT EQ 0 ASSERT SIGNEDBY(PREVSTATE(150)) ASSERT PREVSTATE(156) GT 0 ASSERT @BLOCK GT PREVSTATE(156)+${wdelay} ASSERT PREVSTATE(155) EQ 0`,
    '  ASSERT SAMESTATE(150 153) ASSERT STATE(155) EQ 0 ASSERT STATE(156) EQ 0 ASSERT STATE(157)*1 EQ PREVSTATE(154)-STATE(154) ASSERT GETINADDR(1) EQ @ADDRESS',
    '  RETURN VERIFYOUT(0 @ADDRESS @AMOUNT @TOKENID TRUE) ENDIF',
    // gate retirement: a long-idle gate burns its unused CHIP stock (accounts already minted keep working)
    ` IF op EQ 24 THEN ASSERT @COINAGE GT ${abandon} RETURN VERIFYOUT(@INPUT ${burn} @AMOUNT @TOKENID FALSE) ENDIF`,
    ' RETURN FALSE ENDIF',
    // bond coins (USDw), pinned to one vendor key by port 150
    `ASSERT @TOKENID EQ ${usdw}`,
    `IF op EQ 30 THEN ASSERT @INPUT EQ 2 ASSERT GETINTOK(1) EQ ${chip} ASSERT GETINADDR(1) EQ @ADDRESS ASSERT STATE(150) EQ PREVSTATE(150)`,
    ` LET pay=GETOUTAMT(2) ASSERT pay*100000000 EQ STATE(157) ASSERT VERIFYOUT(2 ${vault} pay @TOKENID FALSE) RETURN VERIFYOUT(3 @ADDRESS GETINAMT(2)-pay @TOKENID TRUE) ENDIF`,
    `IF op EQ 32 THEN ASSERT @INPUT EQ 1 ASSERT GETINTOK(0) EQ ${chip} ASSERT GETINADDR(0) EQ @ADDRESS ASSERT STATE(150) EQ PREVSTATE(150)`,
    ' LET out=GETOUTAMT(1) ASSERT out*100000000 EQ STATE(157) ASSERT VERIFYOUT(1 STATE(151) out @TOKENID FALSE)',
    ' IF GETINAMT(1) GT out THEN RETURN VERIFYOUT(2 @ADDRESS GETINAMT(1)-out @TOKENID TRUE) ENDIF RETURN TRUE ENDIF',
    `IF op EQ 24 THEN ASSERT @COINAGE GT ${abandon} RETURN VERIFYOUT(@INPUT PREVSTATE(151) GETINAMT(@INPUT) @TOKENID FALSE) ENDIF`,
    'RETURN FALSE',
  ].join(' ');
}

// ----------------------------------------------------------------------------------------------- DISPENSER
export function dispenserScript({ chip, usdw, vendor, minBondAtoms, bondPerChipAtoms }) {
  return [
    `ASSERT @TOKENID EQ ${chip} ASSERT @AMOUNT GT 1 LET op=STATE(9)`,
    'IF op EQ 50 THEN ASSERT @INPUT EQ 0 LET k=STATE(158) ASSERT k GT 1 ASSERT @AMOUNT-k GT 1',
    ` ASSERT STATE(154) GTE ${minBondAtoms} ASSERT k*${bondPerChipAtoms} LTE STATE(154)`,
    ' ASSERT STATE(153) EQ 0 ASSERT STATE(155) EQ 0 ASSERT STATE(156) EQ 0 ASSERT STATE(152) LTE @BLOCK ASSERT LEN(STATE(150)) EQ 32',
    ` ASSERT VERIFYOUT(0 ${vendor} k @TOKENID TRUE)`,
    ` ASSERT GETOUTADDR(1) EQ ${vendor} ASSERT GETOUTTOK(1) EQ ${usdw} ASSERT GETOUTAMT(1)*100000000 EQ STATE(154) ASSERT GETOUTKEEPSTATE(1)`,
    ' RETURN VERIFYOUT(2 @ADDRESS @AMOUNT-k @TOKENID FALSE) ENDIF',
    'RETURN FALSE',
  ].join(' ');
}

// ---------------------------------------------------------------------------------------------------- SWAP
export const swapBody = () => 'IF @BLOCK GT dl THEN RETURN VERIFYOUT(@INPUT buy GETINAMT(@INPUT) @TOKENID FALSE) ENDIF' +
  ' ASSERT SHA2(STATE(210+@INPUT)) EQ h RETURN VERIFYOUT(@INPUT sel GETINAMT(@INPUT) @TOKENID FALSE)';
export const swapScript = (h, sel, buy, dl) => `LET h=${h} LET sel=${sel} LET buy=${buy} LET dl=${dl} ${swapBody()}`;

// ------------------------------------------------------------------------------------------------- helpers
export const helperBody = ({ chip }) => C.helperBody({ stamp: chip, n: 16, K: 5, P: 255 });
export const helperAddressScript = C.helperAddressScript;

// Stand-alone copy of the D1 signature core (no transaction functions) so the LIVE node can count it with runscript:
// digest, key commitment, bulk label check, key membership, record update.
export function d1CoreForRunscript({ capAtoms, awindow }) {
  return [
    'LET r=STATE(120) LET mm=STATE(19) ASSERT LEN(mm) EQ 52', `LET d=SHA2(CONCAT(0x44 ${sub(REC.chip)} mm))`,
    'LET pk=SHA2(CONCAT(0x01 STATE(18)))', maskBlock(16, 255),
    'LET e=CONCAT(SUBSET(16 32 d) SUBSET(16 32 d)) LET ff=CONCAT(SUBSET(0 16 d) SUBSET(0 16 d)) ' + Array(6).fill('LET e=CONCAT(e e) LET ff=CONCAT(ff ff)').join(' ') + ' LET e=CONCAT(e ff)',
    'LET e=SUBSET(0 4080 e)', 'ASSERT (CONCAT(0x01 STATE(16)) & CONCAT(0x01 m)) EQ (CONCAT(0x01 e) & CONCAT(0x01 m))',
    `LET i=${num(MSG.i, 'mm')} ASSERT PROOF(pk i ${sub(REC.root)} ${num(REC.rs)} STATE(27))`,
    `LET kc=${num(MSG.kc, 'mm')} ASSERT i GT ${num(REC.u)} ASSERT kc LTE ${num(REC.k)} ASSERT ${num(MSG.bal, 'mm')} LTE ${capAtoms}`,
    `LET y=${num(MSG.y, 'mm')} ASSERT y GT 0 LET ws=${num(REC.ws)} LET wu=${num(REC.wu)}+y`,
    `IF STATE(29) GT ws+${awindow} THEN LET ws=STATE(29) LET wu=y ENDIF ASSERT wu LTE ${num(REC.wl)}`,
    `LET nr=CONCAT(SUBSET(0 204 r) SETLEN(4 HEX(i)) SETLEN(8 HEX(${num(REC.dd)}+y)) SETLEN(4 HEX(ws)) SETLEN(8 HEX(wu)) SUBSET(228 249 r))`,
    'LET ex=CONCAT(0x00 SETLEN(8 HEX(y))) LET hh=SHA2(CONCAT(nr ex))',
    'RETURN TRUE',
  ].join(' ');
}
export { G };
