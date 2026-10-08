// Measures every covenant branch of the payment-account design (Phase 1).
//  - Address templates (helper, release Q, voucher V) are checked on the LIVE lab node: runscript computes the
//    address KISS would build with ADDRESS(...) and the address of the literal text, and both must agree;
//    the text must also be clean-invariant (so the coin stays spendable whatever cleaning a builder applies).
//  - Branches that read the transaction (VERIFYOUT, GETINADDR, @TOTIN ...) are run in-process by
//    java/KissRun.java on the node's own jar (Minima 1.0.45.15), because runscript runs on an empty transaction.
// Nothing is posted, signed or written to any node.
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { rpc, runscript, nodeVersion, saveReceipt, HERE, quoteScript } from './rpc.mjs';
import * as O from './ots.mjs';
import * as C from './covenants.mjs';

const node = await nodeVersion();
const SCRATCH = process.env.SIMCARD_SCRATCH || 'C:/Users/Charles/AppData/Local/Temp/claude/c--Users-Charles-Documents-Stables/c983ae49-c861-4c13-a438-a127ecd8670d/scratchpad';
const JAVA = 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot/bin/java.exe';
const CP = ['C:/Users/Charles/Documents/Crypto/Minima/Nodes/DevNodesSet/9101/minima.jar', join(SCRATCH, 'jrun')].join(';');
const KISS_DIR = join(HERE, '..', 'kiss'); mkdirSync(KISS_DIR, { recursive: true });
const rnd = (n = 32) => O.hex(randomBytes(n));
const n = 16, K = 5, P = 255, MAXH = 3;

// ------------------------------------------------------------------------------------------- constants
const STAMP = rnd(), USDW = rnd(), BURN = rnd(), NOTES = rnd(), DISP = rnd(), POOL = rnd(), BONDADDR = rnd(), VENDORADDR = rnd();
const CLAIMWINDOW = 12000, MAXEXPIRY = 60000, WDELAY = 20000, ABANDON = 700000, MINNOTE = 1, BLOCK = 2340000;
const helperBody = C.helperBody({ stamp: STAMP, n, K, P });
async function addressOf(text) { const r = await rpc('runscript ' + quoteScript(text)); return r.response.script.address; }
async function kissAddress(expr) { const r = await rpc('runscript ' + quoteScript(`LET a=${expr} RETURN TRUE`)); return r.response.variables.a; }
const bodyHash = await addressOf(helperBody);
const TAG = rnd();
const HELPER = await addressOf(C.helperAddressScript(TAG, bodyHash));

async function cleanOf(text) { const r = await rpc('runscript ' + quoteScript(text)); if (!r.response.parseok) throw new Error('parse failed: ' + (r.response.trace.match(/PARSE ERROR : (.*)/) || [])[1]); return r.response.clean.script; }
const scripts = {
  notes: C.notesScript({ stamp: STAMP, usdw: USDW, burn: BURN, bodyHash, claimWindow: CLAIMWINDOW, maxHops: MAXH, n, P, K }),
  dispenser: C.dispenserScript({ notes: NOTES, usdw: USDW, burn: BURN, bodyHash, minNote: MINNOTE, maxExpiry: MAXEXPIRY, maxHops: MAXH, n, P, K }),
  helperAddr: C.helperAddressScript(TAG, bodyHash),
  helperBody,
  pool: C.poolScript({ stamp: STAMP, notes: NOTES, burn: BURN, claimWindow: CLAIMWINDOW, abandon: ABANDON }),
  bond: C.bondScript({ stamp: STAMP, notes: NOTES, pool: POOL, burn: BURN, n, K, P, wDelay: WDELAY, abandon: ABANDON }),
  vendor: C.vendorScript({ burn: BURN, cap: 1000, penalty: 50, wDelay: WDELAY, abandon: ABANDON }),
};
for (const k of ['notes', 'dispenser', 'pool', 'bond', 'vendor']) scripts[k] = await cleanOf(scripts[k]);

// ------------------------------------------------------------------- template checks on the live node
const templateChecks = {};
{
  const h = rnd();
  const qText = C.qScript(h, NOTES, STAMP);
  const viaKiss = await kissAddress(`ADDRESS([LET h=]+STRING(${h})+[ LET rec=]+STRING(${NOTES})+[ ${C.qBody({ stamp: STAMP })}])`);
  const r = await rpc('runscript ' + quoteScript(qText));
  templateChecks.releaseQ = { kissAddress: viaKiss, literalAddress: r.response.script.address, agree: viaKiss === r.response.script.address, cleanInvariant: r.response.clean.script === qText };
  const vText = C.vScript(h, NOTES, BURN);
  const viaKissV = await kissAddress(`ADDRESS([LET h=]+STRING(${h})+[ LET rec=]+STRING(${NOTES})+[ ${C.vBody({ burn: BURN })}])`);
  const rv = await rpc('runscript ' + quoteScript(vText));
  templateChecks.voucherV = { agree: viaKissV === rv.response.script.address, cleanInvariant: rv.response.clean.script === vText };
  const viaKissH = await kissAddress(`ADDRESS([LET owner=]+STRING(${TAG})+[ MAST ${bodyHash}])`);
  const rh = await rpc('runscript ' + quoteScript(scripts.helperAddr));
  templateChecks.helper = { agree: viaKissH === HELPER, cleanInvariant: rh.response.clean.script === scripts.helperAddr };
  const rb = await rpc('runscript ' + quoteScript(helperBody));
  templateChecks.helperBody = { cleanInvariant: rb.response.clean.script === helperBody, chars: helperBody.length };
  for (const [k, s] of Object.entries({ notes: scripts.notes, dispenser: scripts.dispenser, pool: scripts.pool, bond: scripts.bond, vendor: scripts.vendor })) {
    const rr = await rpc('runscript ' + quoteScript(s));
    templateChecks[k] = { parseok: rr.response.parseok, cleanInvariant: rr.response.clean.script === s, chars: s.length };
  }
  console.log('templates', JSON.stringify(templateChecks));
}
const qAddress = async (h) => addressOf(C.qScript(h, NOTES, STAMP));
const vAddress = async (h) => addressOf(C.vScript(h, NOTES, BURN));

// ------------------------------------------------------------------------------------ chain builders
function buildChain({ aid, firstKey, startIndex = 1, startPrev, hops, keysOut }) {
  // returns hop data for `hops` transfers starting at hop index startIndex signed first by firstKey
  const keys = [firstKey];
  for (let t = 0; t < hops; t++) keys.push(O.lxKeygen({ n, chunks: K, positions: P }));
  const out = []; let prevd = startPrev;
  for (let t = 1; t <= hops; t++) {
    const pay = randomBytes(32), pid = randomBytes(16);
    const msg = O.cat(keys[t].pk, pay, pid);
    const d = O.sha2(O.cat(Buffer.from([1]), aid, Buffer.from([startIndex + t - 1]), prevd, msg));
    const sig = O.lxSign(keys[t - 1], d);
    out.push({ R: sig.R, C: sig.C, cd: O.cat(...sig.chunkDigests), msg, d, pay, nextKey: keys[t] });
    prevd = d;
  }
  if (keysOut) keysOut.push(...keys);
  return out;
}
function hopState(chainData) {
  const st = {};
  chainData.forEach((hd, idx) => { const p = 16 * (idx + 1); st[p] = O.hex(hd.R); st[p + 1] = O.hex(hd.C); st[p + 2] = O.hex(hd.cd); st[p + 3] = O.hex(hd.msg); });
  return st;
}
const coin = (o) => ({ storestate: false, tokenid: '0x00', amount: '0.001', created: BLOCK - 100, ...o });

// --------------------------------------------------------------------------------------------- cases
const cases = [];
const add = (c) => cases.push({ block: BLOCK, ...c });

// LOAD-state of one anchor (note 0)
const loaderKey = O.lxKeygen({ n, chunks: K, positions: P });
const markId = rnd(), valueId = rnd(), loaderPay = rnd(), loaderRoot = rnd();
const loadState = { 99: '1', 101: loaderPay, 102: loaderRoot, 103: String(BLOCK + 5000), 110: O.hex(O.cat(O.unhex(markId), O.unhex(valueId), loaderKey.pk)) };
const mark = coin({ coinid: markId, address: NOTES, amount: '1', tokenid: STAMP, storestate: true, state: loadState });
const value = coin({ coinid: valueId, address: NOTES, amount: '10', tokenid: USDW, storestate: true, state: loadState });
const helpers = (count) => Array.from({ length: count }, () => coin({ coinid: rnd(), address: HELPER }));

const cashInfo = {};
for (const h of [0, 1, 2, 3]) {
  const aid = O.unhex(markId);
  const ch = buildChain({ aid, firstKey: loaderKey, hops: h, startPrev: aid });
  let sum = O.cat(aid, loaderKey.pk); for (const hd of ch) sum = O.cat(sum, hd.d, hd.nextKey.pk);
  const pay = h === 0 ? O.unhex(loaderPay) : ch[h - 1].pay;
  sum = O.cat(sum, pay);
  const hsum = O.hex(O.sha2(sum));
  const q = await qAddress(hsum);
  const state = { 9: '2', 1: String(h), 5: '0', 6: TAG, 97: '2', ...hopState(ch) };
  const inputs = [mark, value, ...helpers(K * h)];
  const outputs = [coin({ address: q, amount: '1', tokenid: STAMP }), coin({ address: q, amount: '10', tokenid: USDW })];
  cashInfo[h] = { sum, hsum, q, pay, ch, state, inputs, outputs };
  add({ name: `T1_cash_h${h}_mark`, script: scripts.notes, input: 0, state, inputs, outputs });
  if (h === 0) add({ name: 'T1_cash_value_coin', script: scripts.notes, input: 1, state, inputs, outputs });
  if (h > 0) add({ name: `T1_cash_h${h}_helper_first`, script: scripts.helperAddr, input: 2, state, inputs, outputs, witnessScripts: [helperBody] });
  if (h === 3) add({ name: 'T1_cash_h3_helper_last', script: scripts.helperAddr, input: 2 + K * h - 1, state, inputs, outputs, witnessScripts: [helperBody] });
}
{ // negative controls on T1
  const c2 = cashInfo[2];
  add({ name: 'NEG_T1_payout_redirected', expect: false, script: scripts.notes, input: 0, state: c2.state, inputs: c2.inputs,
    outputs: [coin({ address: rnd(), amount: '1', tokenid: STAMP }), coin({ address: rnd(), amount: '10', tokenid: USDW })] });
  add({ name: 'NEG_T1_helper_missing', expect: false, script: scripts.notes, input: 0, state: c2.state, inputs: c2.inputs.slice(0, -1), outputs: c2.outputs });
  const foreign = [...c2.inputs]; foreign[4] = coin({ coinid: rnd(), address: rnd() });
  add({ name: 'NEG_T1_foreign_helper', expect: false, script: scripts.notes, input: 0, state: c2.state, inputs: foreign, outputs: c2.outputs });
  const badSig = { ...c2.state }; const R = O.unhex(badSig[32]); R[40] ^= 1; badSig[32] = O.hex(R);
  add({ name: 'NEG_T1_hop2_tampered_helper', expect: false, script: scripts.helperAddr, input: 2 + K, state: badSig, inputs: c2.inputs, outputs: c2.outputs, witnessScripts: [helperBody] });
  const wrongKey = { ...c2.state, 5: '0' }; // right index but a different first key: swap the list entry
  const otherLoad = { ...loadState, 110: O.hex(O.cat(O.unhex(markId), O.unhex(valueId), O.lxKeygen({ n, chunks: K, positions: P }).pk)) };
  add({ name: 'NEG_T1_signed_by_wrong_key', expect: false, script: scripts.notes, input: 0, state: wrongKey,
    inputs: [{ ...mark, state: otherLoad }, { ...value, state: otherLoad }, ...c2.inputs.slice(2)], outputs: c2.outputs });
  add({ name: 'NEG_T1_after_expiry', expect: false, script: scripts.notes, input: 0, block: BLOCK + 6000, state: c2.state, inputs: c2.inputs, outputs: c2.outputs });
}

// Cross-check against runscript: the exact helper script from step-a (lx16_helper_K5_P255) in-process
{
  const G2 = await import('./kissgen.mjs');
  const gen = G2.lxHelper({ n, K, P });
  const aid = O.unhex(markId); const ch = buildChain({ aid, firstKey: loaderKey, hops: 1, startPrev: aid });
  const st = hopState(ch);
  const rs = await runscript(gen.script, { state: st, globals: { '@INPUT': '1' } });
  add({ name: 'XCHECK_helper_in_process', script: gen.script, input: 1, state: st, inputs: [coin({ address: rnd() }), coin({ address: rnd() })], outputs: [], runscriptInstructions: rs.instructions, runscriptSuccess: rs.success });
}
// EXPIRE (retirement of an anchor)
add({ name: 'anchor_expire', script: scripts.notes, input: 0, block: BLOCK + 6000, state: { 5: '0' }, inputs: [mark, value],
  outputs: [coin({ address: BURN, amount: '1', tokenid: STAMP }), coin({ address: loaderPay, amount: '10', tokenid: USDW })] });

// T2 settle (release Q -> payout + record)
const c3 = cashInfo[3];
const recState = { 99: '2', 200: O.hex(c3.sum), 201: String(BLOCK - 2), 202: '10' };
const qMark = coin({ coinid: rnd(), address: c3.q, amount: '1', tokenid: STAMP }), qVal = coin({ coinid: rnd(), address: c3.q, amount: '10', tokenid: USDW });
const t2Out = [coin({ address: O.hex(c3.pay), amount: '10', tokenid: USDW }), coin({ address: NOTES, amount: '1', tokenid: STAMP, storestate: true })];
const qText = C.qScript(c3.hsum, NOTES, STAMP);
add({ name: 'T2_settle_Q_stamp', script: qText, input: 0, state: { 9: '5', ...recState }, inputs: [qMark, qVal], outputs: t2Out });
add({ name: 'T2_settle_Q_value', script: qText, input: 1, state: { 9: '5', ...recState }, inputs: [qMark, qVal], outputs: t2Out });
add({ name: 'NEG_T2_wrong_summary', expect: false, script: qText, input: 0, state: { 9: '5', ...recState, 200: rnd(200) }, inputs: [qMark, qVal], outputs: t2Out });
add({ name: 'NEG_T2_record_not_stored', expect: false, script: qText, input: 0, state: { 9: '5', ...recState }, inputs: [qMark, qVal],
  outputs: [t2Out[0], { ...t2Out[1], storestate: false }] });

// Record retire
const recCoin = coin({ coinid: rnd(), address: NOTES, amount: '1', tokenid: STAMP, storestate: true, state: recState });
add({ name: 'record_retire', script: scripts.notes, input: 0, block: BLOCK + CLAIMWINDOW + 10, state: {}, inputs: [recCoin], outputs: [coin({ address: BURN, amount: '1', tokenid: STAMP })] });
add({ name: 'NEG_record_retire_early', expect: false, script: scripts.notes, input: 0, state: {}, inputs: [recCoin], outputs: [coin({ address: BURN, amount: '1', tokenid: STAMP })] });

// LOAD three notes from a stamp lane
{
  const lane = coin({ coinid: rnd(), address: DISP, amount: '1000', tokenid: STAMP });
  const st = { 9: '1', 8: '3', 99: '1', 101: loaderPay, 102: loaderRoot, 103: String(BLOCK + 5000), 110: rnd(96), 111: rnd(96), 112: rnd(96) };
  const outs = [];
  for (let i = 0; i < 3; i++) outs.push(coin({ address: NOTES, amount: '1', tokenid: STAMP, storestate: true }), coin({ address: NOTES, amount: '20', tokenid: USDW, storestate: true }));
  outs.push(coin({ address: DISP, amount: '997', tokenid: STAMP }));
  add({ name: 'lane_LOAD_3_notes', script: scripts.dispenser, input: 0, state: st, inputs: [lane], outputs: outs });
  const bad = [...outs]; bad[1] = coin({ address: rnd(), amount: '20', tokenid: USDW, storestate: true });
  add({ name: 'NEG_lane_LOAD_value_elsewhere', expect: false, script: scripts.dispenser, input: 0, state: st, inputs: [lane], outputs: bad });
  add({ name: 'NEG_lane_LOAD_expiry_too_far', expect: false, script: scripts.dispenser, input: 0, state: { ...st, 103: String(BLOCK + MAXEXPIRY + 1) }, inputs: [lane], outputs: outs });
  const l2 = coin({ coinid: rnd(), address: DISP, amount: '500', tokenid: STAMP });
  add({ name: 'lane_MERGE_2', script: scripts.dispenser, input: 0, state: { 9: '40' }, inputs: [lane, l2], outputs: [coin({ address: DISP, amount: '1500', tokenid: STAMP })] });
  add({ name: 'NEG_lane_MERGE_swallows_record', expect: false, script: scripts.dispenser, input: 0, state: { 9: '40' }, inputs: [lane, recCoin], outputs: [coin({ address: DISP, amount: '1001', tokenid: STAMP })] });
  add({ name: 'lane_SPLIT', script: scripts.dispenser, input: 0, state: { 9: '41', 8: '400' }, inputs: [lane],
    outputs: [coin({ address: DISP, amount: '400', tokenid: STAMP }), coin({ address: DISP, amount: '600', tokenid: STAMP })] });
}

// A double spend: the key at hop 2 (holder A) signs two different transfers. The winner's chain was cashed
// (record = c3.sum style); the victim holds the other branch. Build both from a common prefix.
const claimInfo = {};
{
  const aid = O.unhex(markId);
  const keys = [];
  const prefix = buildChain({ aid, firstKey: loaderKey, hops: 1, startPrev: aid, keysOut: keys }); // hop 1: loader -> A
  const keyA = prefix[0].nextKey;
  const winner = buildChain({ aid, firstKey: keyA, startIndex: 2, hops: 1, startPrev: prefix[0].d }); // hop 2: A -> W
  const victim = buildChain({ aid, firstKey: keyA, startIndex: 2, hops: 2, startPrev: prefix[0].d }); // hop 2: A -> V1, hop 3: V1 -> V2
  // record of the winner's cashing: aid | pk1 | d1 | pkA | d2w | pkW | payW
  const recSum = O.cat(aid, loaderKey.pk, prefix[0].d, keyA.pk, winner[0].d, winner[0].nextKey.pk, winner[0].pay);
  const rState = { 99: '2', 200: O.hex(recSum), 201: String(BLOCK - 500), 202: '10' };
  // cheater's device root: MMR of 64 key commitments including keyA
  const leaves = []; for (let j = 0; j < 64; j++) leaves.push((j === 9 ? O.hex(keyA.pk) : rnd()) + ':0');
  const mmr = (await rpc('mmrcreate nodes:' + JSON.stringify(leaves))).response;
  const RX = mmr.root.data;
  // CLAIM1: victim verifies its 2-hop branch from hop 2
  const vPay = victim[1].pay;
  const s = O.cat(aid, Buffer.from([2]), keyA.pk, prefix[0].d, victim[0].d, vPay, O.unhex(RX));
  const hs = O.hex(O.sha2(s));
  const vAddr = await vAddress(hs);
  const lane = coin({ coinid: rnd(), address: DISP, amount: '1000', tokenid: STAMP });
  const c1State = { 9: '3', 97: '1', 1: '2', 2: O.hex(aid), 3: O.hex(keyA.pk), 4: O.hex(prefix[0].d), 6: TAG, 7: '0x0203', ...hopState(victim),
    231: RX, 233: mmr.nodes[9].proof, 234: String(mmr.root.value) };
  const c1In = [lane, ...helpers(K * 2)];
  const c1Out = [coin({ address: vAddr, amount: '1', tokenid: STAMP }), coin({ address: DISP, amount: '999', tokenid: STAMP })];
  add({ name: 'C1_claim_verify_2hops_lane', script: scripts.dispenser, input: 0, state: c1State, inputs: c1In, outputs: c1Out });
  add({ name: 'C1_claim_verify_2hops_helper', script: scripts.helperAddr, input: 1, state: c1State, inputs: c1In, outputs: c1Out, witnessScripts: [helperBody] });
  add({ name: 'NEG_C1_key_not_in_root', expect: false, script: scripts.dispenser, input: 0, state: { ...c1State, 231: rnd() }, inputs: c1In, outputs: c1Out });
  add({ name: 'NEG_C1_voucher_redirected', expect: false, script: scripts.dispenser, input: 0, state: c1State, inputs: c1In,
    outputs: [coin({ address: rnd(), amount: '1', tokenid: STAMP }), c1Out[1]] });
  // C2 against a LIVE bond (first claim freezes it)
  const ownerKey = rnd(), ownerPay = rnd();
  const bondState = { 120: RX, 121: '0x00', 122: '0x00', 123: '0x00', 124: '1', 125: ownerKey, 126: ownerPay, 127: '0x00', 128: '0x00', 129: '0' };
  const bond = coin({ coinid: rnd(), address: BONDADDR, amount: '300', tokenid: USDW, storestate: true, state: bondState, created: BLOCK - 20000 });
  const voucher = coin({ coinid: rnd(), address: vAddr, amount: '1', tokenid: STAMP });
  const recIn = coin({ coinid: rnd(), address: NOTES, amount: '1', tokenid: STAMP, storestate: true, state: rState });
  const c2State = { 9: '4', 230: O.hex(s), 231: RX, 232: '0', ...rState, ...bondState, 130: String(BLOCK - 1), 131: '300', 139: '1', 140: O.hex(vPay), 141: '10', 142: hs };
  const c2In = [voucher, recIn, bond];
  const c2Out = [coin({ address: BURN, amount: '1', tokenid: STAMP }), coin({ address: NOTES, amount: '1', tokenid: STAMP, storestate: true }), coin({ address: POOL, amount: '300', tokenid: USDW, storestate: true })];
  add({ name: 'C2_voucher', script: C.vScript(hs, NOTES, BURN), input: 0, state: c2State, inputs: c2In, outputs: c2Out });
  add({ name: 'C2_record_read', script: scripts.notes, input: 1, state: c2State, inputs: c2In, outputs: c2Out });
  add({ name: 'C2_bond_freeze_by_claim', script: scripts.bond, input: 2, state: c2State, inputs: c2In, outputs: c2Out });
  // negative: the victim claims against a record where the same key signed the SAME message (no conflict)
  const sameS = O.cat(aid, Buffer.from([2]), keyA.pk, prefix[0].d, winner[0].d, vPay, O.unhex(RX));
  const hsSame = O.hex(O.sha2(sameS));
  add({ name: 'NEG_C2_no_conflict', expect: false, script: C.vScript(hsSame, NOTES, BURN), input: 0, state: { ...c2State, 230: O.hex(sameS), 142: hsSame },
    inputs: [coin({ coinid: rnd(), address: await vAddress(hsSame), amount: '1', tokenid: STAMP }), recIn, bond], outputs: c2Out });
  // negative: a stamp coin that is NOT a voucher (a release coin) posing as one, against the bond
  add({ name: 'NEG_C2_fake_voucher', expect: false, script: scripts.bond, input: 2, state: c2State,
    inputs: [coin({ coinid: rnd(), address: cashInfo[1].q, amount: '1', tokenid: STAMP }), recIn, bond], outputs: c2Out });
  // second claim against the now-frozen pool
  const poolState = { ...bondState, 130: String(BLOCK - 1), 131: '300', 139: '1', 140: O.hex(vPay), 141: '10', 142: hs, 9: '4', 99: '2' };
  const pool = coin({ coinid: rnd(), address: POOL, amount: '300', tokenid: USDW, storestate: true, state: poolState });
  const s2 = O.cat(aid, Buffer.from([2]), keyA.pk, prefix[0].d, O.sha2(randomBytes(8)), randomBytes(32), O.unhex(RX));
  const hs2 = O.hex(O.sha2(s2));
  const v2 = coin({ coinid: rnd(), address: await vAddress(hs2), amount: '1', tokenid: STAMP });
  const p2State = { ...c2State, 230: O.hex(s2), 139: '2', 143: O.hex(s2.subarray(129, 161)), 144: '10', 145: hs2 };
  add({ name: 'C2_pool_register_2nd', script: scripts.pool, input: 2, state: p2State, inputs: [v2, recIn, pool],
    outputs: [c2Out[0], c2Out[1], coin({ address: POOL, amount: '300', tokenid: USDW, storestate: true })] });
  add({ name: 'NEG_C2_pool_duplicate_claim', expect: false, script: scripts.pool, input: 2,
    state: { ...c2State, 139: '2', 143: O.hex(vPay), 144: '10', 145: hs }, inputs: [voucher, recIn, pool],
    outputs: [c2Out[0], c2Out[1], coin({ address: POOL, amount: '300', tokenid: USDW, storestate: true })] });
  claimInfo.poolState = poolState; claimInfo.RX = RX; claimInfo.bondState = bondState; claimInfo.keyA = keyA; claimInfo.mmr = mmr;
  claimInfo.bond = bond;

  // FREEZE by the cheap proof of cheating (both secrets of one position of keyA), no claim needed
  const sw = O.lxSign(keyA, winner[0].d), sv = O.lxSign(keyA, victim[0].d);
  const cp = O.lxCheatProof(keyA, sw, sv, winner[0].d, victim[0].d);
  const B = P / K, ci = Math.floor(cp.position / B);
  const fState = { 9: '20', 10: O.hex(cp.s0), 11: O.hex(cp.s1), 12: String(cp.position), 13: String(ci), 14: O.hex(O.cat(...keyA.T.slice(ci * B, ci * B + B))),
    15: O.hex(O.cat(...keyA.chunkDigests)), 16: O.hex(keyA.pk), 17: '0', 18: String(mmr.root.value), 19: mmr.nodes[9].proof,
    ...bondState, 130: String(BLOCK - 1), 131: '300', 139: '0' };
  add({ name: 'bond_freeze_by_cheat_proof', script: scripts.bond, input: 0, state: fState, inputs: [bond], outputs: [coin({ address: POOL, amount: '300', tokenid: USDW, storestate: true })] });
  add({ name: 'NEG_bond_freeze_same_secret_twice', expect: false, script: scripts.bond, input: 0, state: { ...fState, 11: fState[10] }, inputs: [bond], outputs: [coin({ address: POOL, amount: '300', tokenid: USDW, storestate: true })] });

  // bond lifecycle
  add({ name: 'bond_withdraw_request', script: scripts.bond, input: 0, state: { 9: '21', ...bondState, 129: String(BLOCK - 1) }, signatures: [ownerKey], inputs: [bond],
    outputs: [coin({ address: BONDADDR, amount: '300', tokenid: USDW, storestate: true })] });
  add({ name: 'NEG_bond_withdraw_request_unsigned', expect: false, script: scripts.bond, input: 0, state: { 9: '21', ...bondState, 129: String(BLOCK - 1) }, inputs: [bond],
    outputs: [coin({ address: BONDADDR, amount: '300', tokenid: USDW, storestate: true })] });
  const wBond = { ...bond, state: { ...bondState, 129: String(BLOCK - WDELAY - 5) } };
  add({ name: 'bond_withdraw_after_delay', script: scripts.bond, input: 0, state: { 9: '22' }, inputs: [wBond], outputs: [coin({ address: ownerPay, amount: '300', tokenid: USDW })] });
  add({ name: 'NEG_bond_withdraw_too_early', expect: false, script: scripts.bond, input: 0, state: { 9: '22' }, inputs: [{ ...bond, state: { ...bondState, 129: String(BLOCK - 10) } }], outputs: [coin({ address: ownerPay, amount: '300', tokenid: USDW })] });
  add({ name: 'bond_renew_add_root', script: scripts.bond, input: 0, state: { 9: '23', ...bondState, 121: rnd(), 124: '2' }, signatures: [ownerKey], inputs: [bond],
    outputs: [coin({ address: BONDADDR, amount: '300', tokenid: USDW, storestate: true })] });
  add({ name: 'NEG_bond_renew_replaces_root', expect: false, script: scripts.bond, input: 0, state: { 9: '23', ...bondState, 120: rnd(), 121: rnd(), 124: '2' }, signatures: [ownerKey], inputs: [bond],
    outputs: [coin({ address: BONDADDR, amount: '300', tokenid: USDW, storestate: true })] });
  add({ name: 'bond_abandoned_retirement', script: scripts.bond, input: 0, block: BLOCK + ABANDON + 100, state: { 9: '24' }, inputs: [bond], outputs: [coin({ address: ownerPay, amount: '300', tokenid: USDW })] });
}

// Pool settle: three claims, victims' half of a 300 bond = 150; claims total 10 + 90 + 200 = 300 -> pro rata
{
  const payouts = [rnd(), rnd(), rnd()], amounts = [10, 90, 200];
  const ps = { ...claimInfo.bondState, 130: String(BLOCK - CLAIMWINDOW - 50), 131: '300', 139: '3' };
  amounts.forEach((a, k) => { ps[140 + 3 * k] = payouts[k]; ps[141 + 3 * k] = String(a); ps[142 + 3 * k] = rnd(); });
  const pool = coin({ coinid: rnd(), address: POOL, amount: '300', tokenid: USDW, storestate: true, state: ps });
  const T = 300, S = 150; const pay = amounts.map((a) => Math.floor((a * S / T) * 1e8) / 1e8);
  const st = { 9: '30', 236: '0', 240: String(pay[0]), 241: String(pay[1]), 242: String(pay[2]) };
  const outs = payouts.map((p, k) => coin({ address: p, amount: String(pay[k]), tokenid: USDW }));
  const paid = pay.reduce((a, b) => a + b, 0);
  outs.push(coin({ address: BURN, amount: String(300 - paid), tokenid: USDW }));
  add({ name: 'pool_settle_3_claims_pro_rata', script: scripts.pool, input: 0, state: st, inputs: [pool], outputs: outs });
  const greedy = { ...st, 242: '101' };
  add({ name: 'NEG_pool_settle_overpays_one', expect: false, script: scripts.pool, input: 0, state: greedy, inputs: [pool], outputs: outs });
  add({ name: 'NEG_pool_settle_inside_window', expect: false, script: scripts.pool, input: 0, state: st, inputs: [{ ...pool, state: { ...ps, 130: String(BLOCK - 10) } }], outputs: outs });

  // With a vendor bond topping up: shortfall = T - B/2 = 150, vendor cap 1000 -> vendor pays 150, penalty 50
  const vKeySeed = '0x5354414245535645';
  const psV = { ...ps, 127: 'FILLED', 128: 'FILLED' };
  const vendorState = { 150: 'FILLED', 151: rnd() };
  const vendor = coin({ coinid: rnd(), address: VENDORADDR, amount: '5000', tokenid: USDW, storestate: true, state: vendorState });
  const stV = { ...st, 151: vendorState[151], 236: '150', 239: VENDORADDR, 240: '10', 241: '90', 242: '200', ...psV, 120: claimInfo.RX };
  const outsV = payouts.map((p, k) => coin({ address: p, amount: String(amounts[k]), tokenid: USDW }));
  outsV.push(coin({ address: BURN, amount: '150', tokenid: USDW }), coin({ address: BURN, amount: '50', tokenid: USDW }), coin({ address: VENDORADDR, amount: '4800', tokenid: USDW, storestate: true }));
  // the vendor key signs the device root; KissRun fills 127 (key), 128 (certificate) and copies them into the coins
  const vendorCase = (name, input, script) => ({ name, script, input, state: stV, inputs: [{ ...pool, state: psV }, vendor], outputs: outsV,
    treekey: { seed: vKeySeed, dataPort: 120, pkPort: 127, sigPort: 128, copyState: [[150, 127]], copy: [[0, 127, 127], [0, 128, 128], [1, 150, 127]] } });
  cases.push({ block: BLOCK, ...vendorCase('pool_settle_with_vendor_topup', 0, scripts.pool) });
  cases.push({ block: BLOCK, ...vendorCase('vendor_contribute_checksig', 1, scripts.vendor) });
}

const casesFile = join(SCRATCH, 'covenant-cases.json');
function runCases(cs) {
  writeFileSync(casesFile, JSON.stringify(cs));
  return JSON.parse(execFileSync(JAVA, ['-cp', CP, 'KissRun', casesFile], { maxBuffer: 1 << 26 }).toString());
}
const results = runCases(cases);
const byName = Object.fromEntries(results.map((r) => [r.name, r]));
const table = cases.map((c) => {
  const r = byName[c.name];
  const expect = c.expect === undefined ? true : c.expect;
  return { name: c.name, instructions: r.instructions, success: r.success, expected: expect, asExpected: r.success === expect, exception: r.exception ? String(r.exception).slice(0, 160) : '', ...(c.runscriptInstructions !== undefined ? { runscriptInstructions: c.runscriptInstructions, runscriptSuccess: c.runscriptSuccess } : {}) };
});
for (const row of table) console.log(`${row.asExpected ? 'ok ' : 'BAD'} ${row.name.padEnd(40)} instr=${String(row.instructions).padStart(4)} success=${row.success}${row.exception ? ' | ' + row.exception : ''}`);

saveReceipt('covenant-branches', { purpose: 'Instruction cost and refusal behaviour of every covenant branch (in-process, node jar) plus template checks on the live node',
  node, jar: 'DevNodesSet/9101/minima.jar (1.0.45.15)', method: 'java/KissRun.java: new Contract per input + setGlobals + run, as TxPoWChecker', timestamp: new Date().toISOString(),
  templateChecks, scriptChars: Object.fromEntries(Object.entries(scripts).map(([k, v]) => [k, v.length])), table });

// annotated copies of the covenant texts
const header = (name, purpose) => [`// ${name}.kiss`, `// ${purpose}`, `// Measured: see measure/receipts/covenant-branches.json (node ${node.version} jar, in-process) and templateChecks there.`,
  '// Placeholders used in the measured copy: STAMP/USDW token ids, BURN/NOTES/POOL addresses and the helper body hash are random test values.', ''].join('\n');
const pretty = (s) => s.replace(/ (IF|ELSEIF|ELSE|ENDIF|WHILE|ENDWHILE|RETURN|ASSERT|LET) /g, '\n$1 ');
const rows = (prefix) => table.filter((t) => t.name.includes(prefix)).map((t) => `//   ${t.name}: ${t.instructions} instructions, success=${t.success} (expected ${t.expected})`).join('\n');
writeFileSync(join(KISS_DIR, 'notes_covenant.kiss'), header('notes_covenant', 'NOTES covenant: value coins and anchor marks (CASH / EXPIRE), records (READ / RETIRE).') + rows('T1_') + '\n' + rows('record') + '\n' + rows('anchor_') + '\n\n' + pretty(scripts.notes) + '\n');
writeFileSync(join(KISS_DIR, 'stamp_dispenser.kiss'), header('stamp_dispenser', 'Stamp dispenser lanes: LOAD (issue marks), CLAIM1 (verify a victim chain, mint a voucher), MERGE, SPLIT.') + rows('lane_') + '\n' + rows('C1_') + '\n\n' + pretty(scripts.dispenser) + '\n');
writeFileSync(join(KISS_DIR, 'helper_address.kiss'), header('helper_address', 'Per-owner helper address; MAST runs the fixed chunk-verifier body.') + rows('helper') + '\n\n' + scripts.helperAddr + '\n');
writeFileSync(join(KISS_DIR, 'helper_body.kiss'), header('helper_body', 'Chunk verifier body (labelled-XOR Lamport, n=16, 255 positions, 51 per helper), reached through MAST.') + rows('helper') + '\n\n' + pretty(helperBody) + '\n');
writeFileSync(join(KISS_DIR, 'release_q_template.kiss'), header('release_q_template', 'Release coin Q: LET h=<summary hash> LET rec=<NOTES> + body. Settles a cashing into payout + stamped record.') + rows('T2_') + '\n\n' + pretty(C.qScript('0x<summary-hash>', '0x<NOTES>', 'STAMPID')) + '\n');
writeFileSync(join(KISS_DIR, 'claim_voucher_template.kiss'), header('claim_voucher_template', 'Claim voucher V: LET h=<statement hash> LET rec=<NOTES> + body. Proves a verified victim chain conflicts with a record.') + rows('C2_') + '\n\n' + pretty(C.vScript('0x<statement-hash>', '0x<NOTES>', 'BURN')) + '\n');
writeFileSync(join(KISS_DIR, 'device_bond.kiss'), header('device_bond', 'Device bond: freeze by proof of cheating or by claim, withdrawal with delay, root renewal, retirement.') + rows('bond') + '\n\n' + pretty(scripts.bond) + '\n');
writeFileSync(join(KISS_DIR, 'slash_pool.kiss'), header('slash_pool', 'Slashed bond pool: register claims in the window, settle pro rata (half to victims) and burn the rest, retirement.') + rows('pool') + '\n\n' + pretty(scripts.pool) + '\n');
writeFileSync(join(KISS_DIR, 'vendor_bond.kiss'), header('vendor_bond', 'Vendor bond: tops up victims of a certified chip (CHECKSIG of the device root) and burns a penalty; withdrawal; retirement.') + rows('vendor') + '\n\n' + pretty(scripts.vendor) + '\n');
console.log('bad rows:', table.filter((t) => !t.asExpected).length);
