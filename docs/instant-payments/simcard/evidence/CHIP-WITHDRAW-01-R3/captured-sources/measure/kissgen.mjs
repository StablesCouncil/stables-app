// KISS script generators for the Phase 1 cost proofs. Each function returns a comment-free script
// (deployed KISS must be comment-free, doctrine section 2) plus a header describing it; step-a.mjs
// measures them with runscript and writes the annotated copies to ../kiss/.
//
// State-port layout shared by the cashing scripts (ABI draft, see docs/payment-account-design.md):
//   port 1        number of hops h
//   port 16k+0    R_k  revealed secrets of hop k (256 * n bytes)
//   port 16k+1    C_k  complement hashes of hop k (256 * n bytes)
//   port 16k+2    chunk digests of hop k's key (K * 32 bytes)
//   port 16k+3    message fields of hop k: next key (32) || payout address (32) || receiver nonce (16)
// Helper coin at input j >= 1 verifies hop k = floor((j-1)/K)+1, chunk c = (j-1) mod K.

const hx = (buf) => '0x' + Buffer.from(buf).toString('hex').toUpperCase();

function concatGroups(items, varName) {
  // CONCAT takes at most 32 parameters (probe vm-probes.json: 33 fails to parse).
  const out = [];
  for (let i = 0; i < items.length; i += 31) {
    const grp = items.slice(i, i + 31);
    if (i === 0) out.push(`LET ${varName}=${grp.length === 1 ? grp[0] : 'CONCAT(' + grp.join(' ') + ')'}`);
    else out.push(`LET ${varName}=CONCAT(${varName} ${grp.join(' ')})`);
  }
  return out.join(' ');
}

// ---------------------------------------------------------------------------------------------------
// LX helper: verifies one chunk (B positions) of one hop's labelled-XOR Lamport signature.
// n = element bytes (32 or 16), K = chunks per signature, B = 256 / K positions per chunk.
// ---------------------------------------------------------------------------------------------------
export function lxHelper({ n = 32, K = 4, P = 256, withRecreate = false } = {}) {
  const B = P / K, span = B * n;
  const yItems = [], zItems = [];
  for (let j = 0; j < B; j++) {
    const a = j * n, b = a + n;
    yItems.push(n === 32 ? `SHA2(SHA2(SUBSET(${a} ${b} r)))` : `SHA2(SUBSET(0 ${n} SHA2(SUBSET(${a} ${b} r))))`);
    zItems.push(`SHA2(SUBSET(${a} ${b} q))`);
  }
  const s = [
    `LET j=@INPUT-1 LET c=j%${K} LET p=16*(FLOOR(j/${K})+1) LET o=c*${span}`,
    `LET r=SUBSET(o o+${span} STATE(p)) LET q=SUBSET(o o+${span} STATE(p+1))`,
    concatGroups(yItems, 'y'),
    concatGroups(zItems, 'z'),
    `LET t=CONCAT(0x01 y) ^ CONCAT(0x00 z)`,
    `ASSERT SHA2(t) EQ SUBSET(c*32 c*32+32 STATE(p+2))`,
    withRecreate ? `ASSERT VERIFYOUT(@INPUT @ADDRESS @AMOUNT @TOKENID FALSE)` : '',
    `RETURN TRUE`,
  ].filter(Boolean).join(' ');
  return { name: `lx${n}_helper_K${K}` + (P !== 256 ? `_P${P}` : ''), script: s, n, K, B,
    purpose: `Labelled-XOR Lamport (n=${n}) helper: verifies ${B} of the ${P} positions of one hop signature`,
    ports: 'reads 16k+0 (R_k), 16k+1 (C_k), 16k+2 (chunk digests) for hop k derived from @INPUT' };
}

// The 256-byte (n=32) or 128-byte (n=16) seed of the diagonal label mask: 8 blocks, block j has bit j.
function diagSeed(n) {
  const parts = [];
  for (let j = 0; j < 8; j++) { const blk = Buffer.alloc(n); blk[n - 1] = 1 << j; parts.push(blk); }
  return Buffer.concat(parts);
}

// Builds variable m = the diagonal mask (block i has big-endian bit i of its block set) by byte-doubling.
function buildMask(n) {
  const seed = hx(diagSeed(n));
  const zeros = hx(Buffer.alloc(n));
  const steps = [`LET m=${seed} LET zz=${zeros}`];
  let blocks = 8, k = 1;
  const target = n === 32 ? 256 : 128;
  while (blocks < target) {
    const len = blocks * n;
    steps.push(`LET m=CONCAT(m SUBSET(${k} ${len} m) SUBSET(0 ${k} zz))`);
    blocks *= 2; k *= 2;
  }
  if (n === 16) steps.push('LET m=CONCAT(m m)');
  return steps.join(' ');
}

// Replicate the digest so that block i holds the half of d that position i's label is checked against.
function buildDrep(n) {
  if (n === 32) {
    const s = ['LET e=CONCAT(d d)'];
    for (let i = 0; i < 7; i++) s.push('LET e=CONCAT(e e)');
    return s.join(' '); // 256 copies
  }
  const s = ['LET e=CONCAT(SUBSET(16 32 d) SUBSET(16 32 d))', 'LET f=CONCAT(SUBSET(0 16 d) SUBSET(0 16 d))'];
  for (let i = 0; i < 6; i++) s.push('LET e=CONCAT(e e) LET f=CONCAT(f f)');
  s.push('LET e=CONCAT(e f)');
  return s.join(' ');
}

// ---------------------------------------------------------------------------------------------------
// LX anchor-side hop check (runs inside the value coin, once per hop): message digest, key commitment
// from chunk digests, and the bulk label check of all 256 revealed secrets against the digest.
// For measurement the anchor id and first key come from state ports 2 and 3 instead of @COINID/PREVSTATE.
// ---------------------------------------------------------------------------------------------------
export function lxAnchorHops({ n = 32, K = 4, P = 256, hops = 1, withMask = true } = {}) {
  const s = [];
  s.push('LET aid=STATE(2) LET pk=STATE(3) LET prevd=aid');
  if (withMask) s.push(buildMask(n));
  if (P !== 256) s.push(`LET m=SUBSET(0 ${P * n} m)`);
  for (let k = 1; k <= hops; k++) {
    const p = 16 * k;
    s.push(`LET d=SHA2(CONCAT(0x01 aid 0x${k.toString(16).padStart(2, '0')} prevd STATE(${p + 3})))`);
    s.push(`ASSERT SHA2(CONCAT(0x01 STATE(${p + 2}))) EQ pk`);
    s.push(buildDrep(n));
    if (P !== 256) s.push(`LET e=SUBSET(0 ${P * n} e)`);
    s.push(`ASSERT (CONCAT(0x01 STATE(${p})) & CONCAT(0x01 m)) EQ (CONCAT(0x01 e) & CONCAT(0x01 m))`);
    s.push(`LET pk=SUBSET(0 32 STATE(${p + 3})) LET prevd=d`);
  }
  s.push('RETURN TRUE');
  return { name: `lx${n}_anchor_hops${hops}` + (P !== 256 ? `_P${P}` : ''), script: s.join(' '), n, K, hops,
    purpose: `Labelled-XOR Lamport (n=${n}) anchor-side checks for ${hops} hop(s): digest chain, key commitment, bulk label check` };
}

// Single-script full verification (to demonstrate that one coin cannot carry a whole signature).
export function lxFullSingle({ n = 32, K = 4 } = {}) {
  const B = 256 / K;
  const parts = ['LET p=16 LET h=0x01'];
  for (let c = 0; c < K; c++) {
    const yItems = [], zItems = [];
    for (let j = 0; j < B; j++) {
      const a = (c * B + j) * n, b = a + n;
      yItems.push(n === 32 ? `SHA2(SHA2(SUBSET(${a} ${b} STATE(16))))` : `SHA2(SUBSET(0 ${n} SHA2(SUBSET(${a} ${b} STATE(16)))))`);
      zItems.push(`SHA2(SUBSET(${a} ${b} STATE(17)))`);
    }
    parts.push(concatGroups(yItems, 'y'), concatGroups(zItems, 'z'));
    parts.push(`LET h=CONCAT(h SHA2(CONCAT(0x01 y) ^ CONCAT(0x00 z)))`);
  }
  parts.push('RETURN SHA2(h) EQ STATE(3)');
  return { name: `lx${n}_full_single_coin`, script: parts.join(' '), n, K,
    purpose: `Whole labelled-XOR Lamport (n=${n}) verification in ONE script (expected to exceed 1,024 instructions)` };
}

// ---------------------------------------------------------------------------------------------------
// LO (ordered Lamport) helper: one IF per bit.
// ---------------------------------------------------------------------------------------------------
export function loHelper({ n = 32, K = 4 } = {}) {
  const B = 256 / K, span = B * n;
  const s = [`LET j=@INPUT-1 LET c=j%${K} LET p=16*(FLOOR(j/${K})+1) LET o=c*${span}`,
    `LET r=SUBSET(o o+${span} STATE(p)) LET q=SUBSET(o o+${span} STATE(p+1)) LET e=SUBSET(c*${B / 8} c*${B / 8}+${B / 8} STATE(p+4))`];
  for (let j = 0; j < B; j++) {
    const a = j * n, b = a + n;
    const x = n === 32 ? `SHA2(SUBSET(${a} ${b} r))` : `SUBSET(0 ${n} SHA2(SUBSET(${a} ${b} r)))`;
    const cc = `SUBSET(${a} ${b} q)`;
    if (j === 0) s.push(`IF BITGET(e 0) THEN LET w=CONCAT(${cc} ${x}) ELSE LET w=CONCAT(${x} ${cc}) ENDIF`);
    else s.push(`IF BITGET(e ${j}) THEN LET w=CONCAT(w ${cc} ${x}) ELSE LET w=CONCAT(w ${x} ${cc}) ENDIF`);
  }
  s.push('ASSERT SHA2(w) EQ SUBSET(c*32 c*32+32 STATE(p+2)) RETURN TRUE');
  return { name: `lo${n}_helper_K${K}`, script: s.join(' '), n, K, B,
    purpose: `Ordered (textbook) Lamport (n=${n}) helper: ${B} positions, one IF per bit` };
}

// ---------------------------------------------------------------------------------------------------
// Proof of cheating for LX: both secrets of one position of one key, checked against the key's chunk,
// plus the key's membership in the device root (Minima MMR, PROOF). Ports:
//   10 s0 (label 0)   11 s1 (label 1)   12 position i (number)   13 chunk index c   14 T-blob of that chunk
//   15 chunk digests of the key (K*32)  16 key pk  17 device root hash  18 device root sum  19 MMR proof of pk
// ---------------------------------------------------------------------------------------------------
export function lxCheatProof({ n = 32, K = 4 } = {}) {
  const B = 256 / K;
  const lbl = n * 8; // label bit index within its block = i mod (8n)
  const s = [
    'LET i=STATE(12) LET c=STATE(13) LET w=i-c*' + B + ' LET a=STATE(10) LET b=STATE(11)',
    `LET tt=SHA2(${n === 32 ? 'SHA2(a)' : `SUBSET(0 ${n} SHA2(a))`}) ^ SHA2(${n === 32 ? 'SHA2(b)' : `SUBSET(0 ${n} SHA2(b))`})`,
    'ASSERT CONCAT(0x01 tt) EQ CONCAT(0x01 SUBSET(w*32 w*32+32 STATE(14)))',
    // big-endian label bit p of an n-byte secret, expressed as a BITGET (little-endian) index
    `LET v=i%${lbl} LET q=8*(${n - 1}-FLOOR(v/8))+(v%8)`,
    'ASSERT NOT BITGET(a q)',
    'ASSERT BITGET(b q)',
    'ASSERT SHA2(CONCAT(0x01 STATE(14))) EQ SUBSET(c*32 c*32+32 STATE(15))',
    'ASSERT SHA2(CONCAT(0x01 STATE(15))) EQ STATE(16)',
    'ASSERT PROOF(STATE(16) 0 STATE(17) STATE(18) STATE(19))',
    'RETURN TRUE',
  ];
  return { name: `lx${n}_cheat_proof`, script: s.join(' '), n, K,
    purpose: `Proof of cheating (labelled-XOR Lamport, n=${n}): two secrets of one position of one key, plus the key's membership in the device root` };
}

// ---------------------------------------------------------------------------------------------------
// W4 (Winternitz, 4 bits per chain) full verification with WHILE loops. Ports: 20 signature (67*32),
// 21 digest d (32 bytes), 22 public key hash. Chains run 15 - digit steps from the signature element.
// ---------------------------------------------------------------------------------------------------
export function w4Verify() {
  const s = [
    'LET d=STATE(21) LET sg=STATE(20) LET i=0 LET cs=0 LET acc=0x01',
    'WHILE i LT 67 DO',
    ' IF i LT 64 THEN LET v=NUMBER(SUBSET(FLOOR(i/2) FLOOR(i/2)+1 d)) IF i%2 EQ 0 THEN LET v=FLOOR(v/16) ELSE LET v=v%16 ENDIF LET cs=cs+15-v',
    ' ELSEIF i EQ 64 THEN LET v=FLOOR(cs/256) ELSEIF i EQ 65 THEN LET v=FLOOR(cs/16)%16 ELSE LET v=cs%16 ENDIF',
    ' LET x=SUBSET(i*32 i*32+32 sg) LET k=v WHILE k LT 15 DO LET x=SHA2(x) LET k=k+1 ENDWHILE',
    ' LET acc=CONCAT(acc x) LET i=i+1',
    'ENDWHILE',
    'RETURN SHA2(SUBSET(1 LEN(acc) acc)) EQ STATE(22)',
  ];
  return { name: 'w4_full_verify', script: s.join(' '),
    purpose: 'Winternitz (4 bits per chain, SHA-256) full verification: 64 message chains + 3 checksum chains' };
}

// One Winternitz chain step count probe: cost of x SHA2 steps in a loop (for cost-per-step slope).
export function w4ChainOnly(steps) {
  return { name: `w4_chain_${steps}`, script: `LET x=STATE(20) LET k=0 WHILE k LT ${steps} DO LET x=SHA2(x) LET k=k+1 ENDWHILE RETURN TRUE`,
    purpose: `Winternitz chain cost probe: ${steps} SHA2 steps in a WHILE loop` };
}

// ---------------------------------------------------------------------------------------------------
// FORS-style (the shipped SPHINCS technique, leaves hashed with SHA2): k trees of 2^a leaves, leaf value
// = index, root sum fixed. One PROOF per revealed secret. Ports: 30 revealed secrets (k*n), 31 roots
// (k*32), 32 digest, 33 pk, 40..40+k-1 the per-tree MMR proofs.
// ---------------------------------------------------------------------------------------------------
export function forsVerify({ k = 32, a = 8, n = 32 } = {}) {
  const leaves = 2 ** a, rootsum = (leaves * (leaves - 1)) / 2;
  const s = ['LET d=STATE(32) LET rs=STATE(31) LET sc=STATE(30)', 'ASSERT SHA2(rs) EQ STATE(33)'];
  for (let t = 0; t < k; t++) {
    let v;
    if (a === 8) v = `NUMBER(SUBSET(${t} ${t + 1} d))`;
    else if (a === 4) v = t % 2 === 0 ? `FLOOR(NUMBER(SUBSET(${t >> 1} ${(t >> 1) + 1} d))/16)` : `(NUMBER(SUBSET(${t >> 1} ${(t >> 1) + 1} d))%16)`;
    else throw new Error('a must be 8 or 4');
    s.push(`ASSERT PROOF(SHA2(SUBSET(${t * n} ${t * n + n} sc)) ${v} SUBSET(${t * 32} ${t * 32 + 32} rs) ${rootsum} STATE(${40 + t}))`);
  }
  s.push('RETURN TRUE');
  return { name: `fors_k${k}_a${a}`, script: s.join(' '), k, a, n,
    purpose: `FORS-style few-time signature with SHA2 leaves (k=${k} trees of 2^${a} leaves), one PROOF per revealed secret` };
}

// Device-root membership only.
export function membershipOnly() {
  return { name: 'device_root_membership', script: 'RETURN PROOF(STATE(16) 0 STATE(17) STATE(18) STATE(19))',
    purpose: 'Membership of a one-time key commitment in a device root (Minima MMR via PROOF)' };
}
