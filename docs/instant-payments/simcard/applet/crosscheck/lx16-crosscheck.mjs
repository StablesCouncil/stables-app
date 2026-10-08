// LX16 and P-256 cross-check of CARD-MADE signatures against the EXISTING verifiers (chip-balance-design.md 0c.2 item 1,
// 0b.2 step 2). Input: results/lx16-fixtures.json (made by `Main fixtures` from the applet running in jCardSim).
//
//  1. measure/ots.mjs (the reference implementation): lxVerify on every card-made voucher and bench signature.
//  2. The measured KISS verifiers, as DRY RUNS ONLY (`runscript`, and `mmrcreate` to build the key tree) on lab peer
//     9101 through measure/rpc.mjs (RPC 127.0.0.1:9105), whose allow-list refuses every posting or signing command:
//       - the five helpers kiss/lx16_helper_K5_P255.kiss (inputs 1..5);
//       - the D1 signature core kiss/balance/d1_core_runscript.kiss;
//       - the proof of cheating for K5 keys, crosscheck/lx16_cheat_proof_K5_P255_runscript.kiss, fed two signatures
//         by one bench key;
//     and the measured refusal cases must still refuse.
//  3. node:crypto (OpenSSL) as a standard ECDSA P-256 verifier for the certificate, HELLO, TRANSFER and ACK.
// Nothing is posted, signed or tracked. Writes results/lx16-crosscheck.md and .json.
import { createHash, createPublicKey, verify as cverify, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as O from '../../measure/ots.mjs';
import { rpc, runscript, nodeVersion } from '../../measure/rpc.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPLET = join(HERE, '..');
const SIMCARD = join(APPLET, '..');
const RESULTS = join(APPLET, 'results');
const fx = JSON.parse(readFileSync(join(RESULTS, 'lx16-fixtures.json'), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest();
const u = (h) => Buffer.from(h.replace(/^0x/i, ''), 'hex');
const hx = (b) => '0x' + Buffer.from(b).toString('hex').toUpperCase();
const be = (v, n) => { let x = BigInt(v); const b = Buffer.alloc(n); for (let i = n - 1; i >= 0; i--) { b[i] = Number(x & 255n); x >>= 8n; } return b; };
const kiss = (file) => readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => !l.startsWith('//')).join(' ').replace(/\s+/g, ' ').trim();
const OPT = { n: 16, chunks: 5, positions: 255 };
const BLOCK = 2340000;

const rows = [];
function row(group, name, expect, got, extra = {}) {
  const pass = expect === got;
  rows.push({ group, name, expect, got, pass, ...extra });
  console.log(`${pass ? 'pass' : 'FAIL'}  ${group} / ${name}: expected ${expect}, got ${got}${extra.instructions !== undefined ? ` (${extra.instructions} instructions)` : ''}`);
}

// ------------------------------------------------------------------------------------------------ 1. ots.mjs
const chipId = u(fx.lx16.chipId);
const vouchers = fx.lx16.vouchers.map((v) => ({ ...v, msg: u(v.message), d: u(v.digest), R: u(v.R), C: u(v.C), cd: u(v.chunkDigests), pk: u(v.pk) }));
for (const v of vouchers) {
  const d = sha(Buffer.concat([Buffer.from([0x44]), chipId, v.msg]));
  row('ots.mjs', `voucher key ${v.keyIndex}: digest = SHA-256(0x44 | chip id | message)`, true, d.equals(v.d));
  row('ots.mjs', `voucher key ${v.keyIndex}: lxVerify (n=16, 5 chunks, 255 positions)`, true, O.lxVerify(v.pk, v.d, { R: v.R, C: v.C }, OPT));
  row('ots.mjs', `voucher key ${v.keyIndex}: pk = SHA-256(0x01 | chunk digests)`, true, sha(Buffer.concat([Buffer.from([1]), v.cd])).equals(v.pk));
  const badR = Buffer.from(v.R); badR[40] ^= 0x80;
  row('ots.mjs', `voucher key ${v.keyIndex}: a tampered secret is refused`, false, O.lxVerify(v.pk, v.d, { R: badR, C: v.C }, OPT));
  const badD = Buffer.from(v.d); badD[31] ^= 1;
  row('ots.mjs', `voucher key ${v.keyIndex}: another digest is refused`, false, O.lxVerify(v.pk, badD, { R: v.R, C: v.C }, OPT));
}
const bench = fx.bench;
const bsig = bench.signatures.map((s) => ({ d: u(s.digest), R: u(s.R), C: u(s.C) }));
for (const [k, s] of bsig.entries()) {
  row('ots.mjs', `bench key ${bench.keyIndex}, digest ${k}: lxVerify`, true, O.lxVerify(u(bench.pk), s.d, { R: s.R, C: s.C }, OPT));
}

// ------------------------------------------------------------------------------------------------ 3. P-256
function pub(p65) {
  const b = u(p65);
  return createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b.subarray(1, 33).toString('base64url'), y: b.subarray(33, 65).toString('base64url') }, format: 'jwk' });
}
function p256(wireHex, bodyLen, pubHex) {
  const w = u(wireHex);
  const body = w.subarray(0, bodyLen), sl = w[bodyLen], sig = w.subarray(bodyLen + 1, bodyLen + 1 + sl);
  return cverify('sha256', body, { key: pub(pubHex), dsaEncoding: 'der' }, sig);
}
const P = fx.p256;
row('P-256 (node:crypto)', 'vendor certificate over the chip key, by the vendor key', true, p256(P.certificate, 79, P.vendorPub));
row('P-256 (node:crypto)', 'HELLO, by the receiver chip', true, p256(P.hello, 87, P.receiverPub));
row('P-256 (node:crypto)', 'TRANSFER, by the payer chip', true, p256(P.transfer, 142, P.chipPub));
row('P-256 (node:crypto)', 'ACK, by the receiver chip', true, p256(P.ack, 119, P.receiverPub));
{
  const w = u(P.transfer); w[78 + 7] ^= 1;
  row('P-256 (node:crypto)', 'TRANSFER with the amount altered is refused', false, p256(hx(w), 142, P.chipPub));
  row('P-256 (node:crypto)', 'TRANSFER checked with another chip key is refused', false, p256(P.transfer, 142, P.receiverPub));
}

// ------------------------------------------------------------------------------------------------ 2. KISS dry runs
let node = null;
try {
  node = await nodeVersion();
} catch (e) {
  console.log('lab node not reachable on 127.0.0.1:9105: KISS dry runs skipped (' + e.message + ')');
}
if (node) {
  const helper = kiss(join(SIMCARD, 'kiss', 'lx16_helper_K5_P255.kiss'));
  const d1 = kiss(join(SIMCARD, 'kiss', 'balance', 'd1_core_runscript.kiss'));
  const cheat = kiss(join(HERE, 'lx16_cheat_proof_K5_P255_runscript.kiss'));

  // the chip's key tree: a real Minima MMR built by the node (leaf value = key index), 8 card keys + 56 fillers
  async function tree(pks) {
    const leaves = [];
    for (let i = 0; i < 64; i++) leaves.push((i < pks.length ? pks[i] : hx(randomBytes(32))) + ':' + i);
    const r = await rpc('mmrcreate nodes:' + JSON.stringify(leaves));
    if (!r.status) throw new Error('mmrcreate failed');
    return { root: r.response.root.data, sum: BigInt(r.response.root.value), proof: (i) => r.response.nodes[i].proof };
  }
  const T = await tree(fx.lx16.keyPks);
  const rnd = () => randomBytes(32);
  const OWN = rnd(), PAY = rnd(), VK = rnd(), TAG = rnd();
  // account record (kiss/balance, 249 bytes): chip id | root | owner key | payout | vendor key | helper tag | k | F | u | D |
  // window start | window use | window limit | status | status block | root sum
  const record = ({ u: used = 0, D = 0n, wu = 0n } = {}) => Buffer.concat([chipId, u(T.root), OWN, PAY, VK, TAG, be(fx.lx16.fundCount, 4),
    be(BigInt(fx.lx16.fundedAtoms), 8), be(used, 4), be(D, 8), be(BLOCK - 100, 4), be(wu, 8), be(100000000000n, 8), be(0, 1), be(0, 4), be(T.sum, 8)]);
  const helperState = (v) => ({ 16: hx(v.R), 17: hx(v.C), 18: hx(v.cd) });

  for (const v of vouchers) {
    for (let input = 1; input <= 5; input++) {
      const r = await runscript(helper, { state: helperState(v), globals: { '@INPUT': String(input) } });
      row('KISS helper (runscript)', `voucher key ${v.keyIndex}, helper input ${input} (chunk ${input - 1})`, true, r.success, { instructions: r.instructions });
    }
  }
  {
    const v = vouchers[0];
    const badR = Buffer.from(v.R); badR[40] ^= 0x80;
    const r1 = await runscript(helper, { state: { ...helperState(v), 16: hx(badR) }, globals: { '@INPUT': '1' } });
    row('KISS helper (runscript)', 'refusal: a tampered secret', false, r1.success, { instructions: r1.instructions });
    const badC = Buffer.from(v.C); badC[33] ^= 1;
    const r2 = await runscript(helper, { state: { ...helperState(v), 17: hx(badC) }, globals: { '@INPUT': '1' } });
    row('KISS helper (runscript)', 'refusal: a tampered complement', false, r2.success, { instructions: r2.instructions });
  }

  // D1 signature core: voucher 1 against the registration-fresh record (u = 0); voucher 2 after voucher 1 (u = 1)
  const [v1, v2] = vouchers;
  const y1 = BigInt(v1.msg.readBigUInt64BE(4));
  const d1State = (v, rec, over = {}) => ({ 120: hx(rec), 19: hx(v.msg), 18: hx(v.cd), 16: hx(v.R), 27: T.proof(v.keyIndex), 29: String(BLOCK), ...over });
  {
    const r = await runscript(d1, { state: d1State(v1, record()) });
    row('KISS D1 core (runscript)', `voucher key ${v1.keyIndex} against the chip account record`, true, r.success, { instructions: r.instructions });
    const r2 = await runscript(d1, { state: d1State(v2, record({ u: v1.keyIndex, D: y1, wu: y1 })) });
    row('KISS D1 core (runscript)', `voucher key ${v2.keyIndex} after key ${v1.keyIndex} was used on chain`, true, r2.success, { instructions: r2.instructions });
    const n1 = await runscript(d1, { state: d1State(v1, record({ u: v1.keyIndex })) });
    row('KISS D1 core (runscript)', 'refusal: key index already used (i <= u)', false, n1.success, { instructions: n1.instructions });
    const badR = Buffer.from(v1.R); badR[2 * 16 + 15] ^= 0x04; // position 2: label = big-endian bit 2
    const n2 = await runscript(d1, { state: d1State(v1, record(), { 16: hx(badR) }) });
    row('KISS D1 core (runscript)', 'refusal: a label flipped', false, n2.success, { instructions: n2.instructions });
    const n3 = await runscript(d1, { state: d1State(v1, record(), { 18: hx(v2.cd) }) });
    row('KISS D1 core (runscript)', 'refusal: signed by another key (chunk digests of key 2 claimed for key 1)', false, n3.success, { instructions: n3.instructions });
    const msg = Buffer.from(v1.msg); msg[11] ^= 1;
    const n4 = await runscript(d1, { state: d1State(v1, record(), { 19: hx(msg) }) });
    row('KISS D1 core (runscript)', 'refusal: the amount in the message altered', false, n4.success, { instructions: n4.instructions });
  }

  // proof of cheating: two signatures by ONE bench key over two different digests
  {
    const BT = await tree(bench.keyPks);
    const [a, b] = bsig;
    let pos = -1;
    for (let i = 0; i < 255; i++) {
      if (O.beBit(O.lxDigestHalf(a.d, i, 16), O.lxLabelBit(i, 16)) !== O.beBit(O.lxDigestHalf(b.d, i, 16), O.lxLabelBit(i, 16))) { pos = i; break; }
    }
    const bitA = O.beBit(O.lxDigestHalf(a.d, pos, 16), O.lxLabelBit(pos, 16));
    const sA = a.R.subarray(pos * 16, pos * 16 + 16), sB = b.R.subarray(pos * 16, pos * 16 + 16);
    const s0 = bitA === 0 ? sA : sB, s1 = bitA === 0 ? sB : sA;
    const c = Math.floor(pos / 51);
    const tblob = [];
    for (let q = c * 51; q < c * 51 + 51; q++) {
      const y = sha(sha(a.R.subarray(q * 16, q * 16 + 16)).subarray(0, 16)), z = sha(a.C.subarray(q * 16, q * 16 + 16));
      tblob.push(O.xor(y, z));
    }
    const st = { 10: hx(s0), 11: hx(s1), 12: String(pos), 13: String(c), 14: hx(Buffer.concat(tblob)), 15: bench.chunkDigests,
      16: BT.root, 17: String(BT.sum), 26: String(bench.keyIndex), 28: BT.proof(bench.keyIndex) };
    const r = await runscript(cheat, { state: st });
    row('KISS proof of cheating (runscript)', `two card signatures by one key (position ${pos}, chunk ${c})`, true, r.success, { instructions: r.instructions });
    const n = await runscript(cheat, { state: { ...st, 11: st[10] } });
    row('KISS proof of cheating (runscript)', 'refusal: the same secret twice', false, n.success, { instructions: n.instructions });
    const n2 = await runscript(cheat, { state: { ...st, 26: String(bench.keyIndex + 1), 28: BT.proof(bench.keyIndex + 1) } });
    row('KISS proof of cheating (runscript)', 'refusal: the key is not the one in the tree at that index', false, n2.success, { instructions: n2.instructions });
  }
}

const pass = rows.filter((r) => r.pass).length;
const out = { purpose: 'Card-made LX16 and P-256 signatures (jCardSim) checked with the existing verifiers; KISS by runscript dry runs only',
  node, timestamp: new Date().toISOString(), pass, total: rows.length, rows };
writeFileSync(join(RESULTS, 'lx16-crosscheck.json'), JSON.stringify(out, null, 2));
const md = ['# LX16 and P-256 cross-check (card-made signatures, existing verifiers)', '',
  `Signatures made by the Stables applet in jCardSim (simulator), exported by \`Main fixtures\`. KISS scripts run as \`runscript\` dry runs on lab peer 9101 (${node ? 'Minima ' + node.version + ', block ' + node.block : 'node not reachable: KISS rows skipped'}); nothing posted, signed or tracked.`, '',
  `**${pass} of ${rows.length} checks as expected.**`, '',
  '| # | Verifier | Check | Expected | Got | Instructions | Result |', '|---|---|---|---|---|---|---|',
  ...rows.map((r, i) => `| ${i + 1} | ${r.group} | ${r.name.replace(/\|/g, '/')} | ${r.expect} | ${r.got} | ${r.instructions ?? ''} | ${r.pass ? 'pass' : '**FAIL**'} |`), ''].join('\n');
writeFileSync(join(RESULTS, 'lx16-crosscheck.md'), md);
console.log(`${pass} of ${rows.length} as expected`);
process.exit(pass === rows.length ? 0 : 1);
