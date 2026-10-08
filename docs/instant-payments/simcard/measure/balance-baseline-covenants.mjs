// Experimental baseline, not the deployed software vault. No hardware trust is proved here.
// Uses the existing LX16 account verifier, the cumulative debit revision, and no deferred
// caps, weekly allowances, vendor slashing, or time-based vault retirement.
import * as B from './balance-covenants.mjs';

export function qBody({ chip }) {
  return `LET nr=STATE(120) LET ex=STATE(201) ASSERT SHA2(CONCAT(nr ex)) EQ h ASSERT @INPUT EQ 0 ASSERT @TOTIN EQ 2 ASSERT @TOTOUT EQ 3 ASSERT @TOKENID EQ ${chip} ASSERT GETINADDR(1) EQ vlt ASSERT STATE(9) EQ 10 RETURN VERIFYOUT(0 acc 1 @TOKENID TRUE)`;
}
export const qScript = (h, acc, vlt, chip) => `LET h=${h} LET acc=${acc} LET vlt=${vlt} ${qBody({ chip })}`;
const qAddress = (chip, h, acc, vlt) => `ADDRESS([LET h=]+STRING(${h})+[ LET acc=]+STRING(${acc})+[ LET vlt=]+STRING(${vlt})+[ ${qBody({ chip })}])`;

export function accountScript({ chip, value, vault, helperHash, burn }) {
  // Extract the exact existing digest, label, helper-address and MMR membership verifier.
  // Guard its boundaries: changes to the upstream generator must cause an explicit review.
  const old = B.accScript({ chip, usdw: value, vault, burn, helperHash,
    awindow: 1, capAtoms: 1, minFund: 1, retireAge: 1051200 });
  const start = old.indexOf('LET mm=STATE(19) ASSERT LEN(mm) EQ 52');
  const end = old.indexOf(' LET kc=', start);
  if (start < 0 || end < start) throw new Error('Existing signature verifier boundaries changed');
  const verify = old.slice(start, end);
  const fresh = 'ASSERT STATE(29) LTE @BLOCK ASSERT STATE(29) GTE @BLOCK-20';
  return [
    `ASSERT @TOKENID EQ ${chip} ASSERT @AMOUNT EQ 1 ASSERT LEN(PREVSTATE(120)) EQ 249 LET r=PREVSTATE(120) LET op=STATE(9) LET st=NUMBER(SUBSET(236 237 r))`,
    `IF op EQ 1 THEN ASSERT @INPUT EQ 0 ASSERT st EQ 0 ASSERT @TOTIN EQ 2 ASSERT @TOTOUT EQ 3 LET x=GETOUTAMT(1) ASSERT x GT 0 ASSERT GETOUTADDR(1) EQ ${vault} ASSERT GETOUTTOK(1) EQ ${value} ASSERT NOT GETOUTKEEPSTATE(1)`,
    'ASSERT STATE(120) EQ CONCAT(SUBSET(0 192 r) SETLEN(4 HEX(NUMBER(SUBSET(192 196 r))+1)) SETLEN(8 HEX(NUMBER(SUBSET(196 204 r))+x*100000000)) SUBSET(204 249 r)) RETURN VERIFYOUT(0 @ADDRESS 1 @TOKENID TRUE) ENDIF',
    `IF op EQ 2 THEN ASSERT @INPUT EQ 0 ASSERT STATE(97) EQ 1 ASSERT @TOTIN EQ 6 ASSERT @TOTOUT EQ 6 ASSERT st LTE 1 ${fresh} ${verify}`,
    'ASSERT i GT NUMBER(SUBSET(204 208 r)) LET dv=NUMBER(SUBSET(4 12 mm)) LET y=dv-NUMBER(SUBSET(208 216 r)) ASSERT y GT 0',
    'LET nr=CONCAT(SUBSET(0 204 r) SETLEN(4 HEX(i)) SETLEN(8 HEX(dv)) SUBSET(216 249 r)) LET ex=CONCAT(0x00 SETLEN(8 HEX(y)))',
    `LET q=${qAddress(chip, 'SHA2(CONCAT(nr ex))', '@ADDRESS', vault)} RETURN VERIFYOUT(0 q 1 @TOKENID FALSE) ENDIF`,
    `IF op EQ 20 THEN ASSERT SIGNEDBY(SUBSET(64 96 r)) ASSERT st EQ 0 ${fresh} ASSERT STATE(120) EQ CONCAT(SUBSET(0 236 r) 0x01 SETLEN(4 HEX(STATE(29))) SUBSET(241 249 r)) RETURN VERIFYOUT(@INPUT @ADDRESS 1 @TOKENID TRUE) ENDIF`,
    'IF op EQ 21 THEN ASSERT SIGNEDBY(SUBSET(64 96 r)) ASSERT LEN(STATE(122)) EQ 32 ASSERT STATE(120) EQ CONCAT(SUBSET(0 96 r) STATE(122) SUBSET(128 249 r)) RETURN VERIFYOUT(@INPUT @ADDRESS 1 @TOKENID TRUE) ENDIF',
    `IF op EQ 24 THEN ASSERT st GT 0 ASSERT @COINAGE GT 1051200 RETURN VERIFYOUT(@INPUT ${burn} 1 @TOKENID FALSE) ENDIF RETURN FALSE`,
  ].join(' ');
}

export function vaultScript({ chip, value }) {
  return [
    `ASSERT @TOKENID EQ ${value} LET op=STATE(9)`,
    'IF op EQ 11 THEN LET t=0 LET s=0 WHILE t LT @TOTIN DO ASSERT GETINADDR(t) EQ @ADDRESS ASSERT GETINTOK(t) EQ @TOKENID LET s=s+GETINAMT(t) LET t=t+1 ENDWHILE ASSERT @TOTOUT EQ 1 RETURN VERIFYOUT(0 @ADDRESS s @TOKENID FALSE) ENDIF',
    'IF op EQ 12 THEN ASSERT @TOTIN EQ 1 ASSERT @TOTOUT EQ 2 LET a=GETOUTAMT(0) ASSERT a GT 0 ASSERT a LT GETINAMT(0) ASSERT VERIFYOUT(0 @ADDRESS a @TOKENID FALSE) RETURN VERIFYOUT(1 @ADDRESS GETINAMT(0)-a @TOKENID FALSE) ENDIF',
    `IF op EQ 10 THEN ASSERT @INPUT EQ 1 ASSERT @TOTIN EQ 2 ASSERT @TOTOUT EQ 3 ASSERT GETINTOK(0) EQ ${chip} ASSERT GETINAMT(0) EQ 1 LET nr=STATE(120) ASSERT LEN(nr) EQ 249 LET ex=STATE(201) ASSERT LEN(ex) EQ 9 ASSERT SUBSET(0 1 ex) EQ 0x00`,
    `ASSERT GETINADDR(0) EQ ${qAddress(chip, 'SHA2(CONCAT(nr ex))', 'STATE(202)', '@ADDRESS')}`,
    'ASSERT STATE(29) LTE @BLOCK ASSERT STATE(29) GTE @BLOCK-20 LET y=NUMBER(SUBSET(1 9 ex)) ASSERT y GT 0 LET p=GETOUTAMT(1) ASSERT p*100000000 EQ y ASSERT GETOUTADDR(1) EQ SUBSET(96 128 nr) ASSERT GETOUTTOK(1) EQ @TOKENID ASSERT NOT GETOUTKEEPSTATE(1) ASSERT VERIFYOUT(0 STATE(202) 1 GETINTOK(0) TRUE) RETURN VERIFYOUT(2 @ADDRESS GETINAMT(1)-p @TOKENID FALSE) ENDIF RETURN FALSE',
  ].join(' ');
}

// Laboratory certification gate: the ENTIRE purpose-created marker supply goes here.
// The lab vendor attests the tree/root, as a real vendor would attest provisioned hardware.
// Admission/bond economics are outside this withdrawal experiment.
export function registrationScript({ chip, account, vendorKey }) {
  return `ASSERT @TOKENID EQ ${chip} ASSERT @AMOUNT GT 1 ASSERT @INPUT EQ 0 ASSERT @TOTIN EQ 1 ASSERT @TOTOUT EQ 2 ASSERT STATE(9) EQ 40 ASSERT SIGNEDBY(${vendorKey}) LET nr=STATE(120) ASSERT LEN(nr) EQ 249 ASSERT SUBSET(128 160 nr) EQ ${vendorKey} ASSERT SUBSET(192 241 nr) EQ 0x${'00'.repeat(49)} ASSERT VERIFYOUT(0 ${account} 1 @TOKENID TRUE) RETURN VERIFYOUT(1 @ADDRESS @AMOUNT-1 @TOKENID FALSE)`;
}

export const helperBody = B.helperBody;
export const helperAddressScript = B.helperAddressScript;
