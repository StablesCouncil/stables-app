// Step A: the crux. Measures on the lab node (runscript, dry run, no chain writes) the instruction cost
// of full SHA-256 one-time-signature checks, the proof of cheating, and the split across co-spent coins.
// Writes one receipt per measurement to receipts/ and the measured scripts to ../kiss/.
//
//   node step-a.mjs            all measurements
//   node step-a.mjs lx         only one group (lx | lo | cheat | w4 | fors | member)
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runscript, rpc, nodeVersion, saveReceipt, HERE } from './rpc.mjs';
import * as O from './ots.mjs';
import * as G from './kissgen.mjs';

const only = process.argv[2] || 'all';
const want = (g) => only === 'all' || only === g;
const KISS_DIR = join(HERE, '..', 'kiss');
mkdirSync(KISS_DIR, { recursive: true });
const node = await nodeVersion();
const stamp = () => new Date().toISOString();
const summary = [];

function writeKiss(gen, measured) {
  const lines = [
    `// ${gen.name}.kiss`,
    `// Purpose: ${gen.purpose}`,
    gen.ports ? `// State ports: ${gen.ports}` : null,
    `// Measured: ${measured.instructions} instructions, success=${measured.success}, parseok=${measured.parseok}` +
      (measured.executionError ? `, error="${measured.executionError}"` : ''),
    `// Node ${node.version} (lab peer 9101), runscript dry run, ${stamp()}. Receipt: measure/receipts/${measured.receipt}.json`,
    `// Script size: ${gen.script.length} characters. Comment-free body below (deploy form).`,
    '',
    gen.script.replace(/ (LET|ASSERT|IF|ELSEIF|ELSE|WHILE|ENDWHILE|ENDIF|RETURN) /g, '\n$1 '),
    '',
  ].filter((l) => l !== null);
  writeFileSync(join(KISS_DIR, gen.name + '.kiss'), lines.join('\n'));
}

async function measure(gen, opts, note, expect = true) {
  const r = await runscript(gen.script, opts);
  const receiptName = gen.name + (opts.tag ? '_' + opts.tag : '');
  const rec = { measurement: receiptName, purpose: gen.purpose, note, node, timestamp: stamp(),
    command: 'runscript (POST, dry run)', scriptChars: gen.script.length, stateBytes: stateBytes(opts.state || {}),
    result: { success: r.success, parseok: r.parseok, monotonic: r.monotonic, instructions: r.instructions,
      executionError: r.executionError, rpcMs: r.rpcMs, address: r.address } };
  saveReceipt(receiptName, rec);
  writeKiss(gen, { ...r, receipt: receiptName });
  const line = `${receiptName.padEnd(34)} instr=${String(r.instructions).padStart(5)} success=${r.success}${r.executionError ? ' ERR=' + r.executionError.slice(0, 80) : ''}`;
  console.log(line);
  summary.push({ name: receiptName, instructions: r.instructions, success: r.success, expectSuccess: expect, error: r.executionError, stateBytes: rec.stateBytes, scriptChars: gen.script.length });
  return r;
}

function stateBytes(state) { // binary bytes of hex state values (how StateVariable serialises HEX)
  let b = 0;
  for (const v of Object.values(state)) b += String(v).startsWith('0x') ? (String(v).length - 2) / 2 : String(v).length;
  return b;
}

// Build a signed chain of `hops` transfers for scheme LX (element n, chunks K).
function lxChain({ n, K, hops }) {
  const aid = randomBytes(32);
  const keys = [];
  for (let k = 0; k <= hops; k++) keys.push(O.lxKeygen({ n, chunks: K }));
  const state = { 1: String(hops), 2: O.hex(aid), 3: O.hex(keys[0].pk) };
  let prevd = aid;
  const sigs = [];
  for (let k = 1; k <= hops; k++) {
    const msg = O.cat(keys[k].pk, randomBytes(32), randomBytes(16)); // next key || payout address || nonce
    const d = O.sha2(O.cat(Buffer.from([1]), aid, Buffer.from([k]), prevd, msg));
    const sig = O.lxSign(keys[k - 1], d);
    if (!O.lxVerify(keys[k - 1].pk, d, sig, { n, chunks: K })) throw new Error('reference verify failed');
    const p = 16 * k;
    state[p] = O.hex(sig.R); state[p + 1] = O.hex(sig.C); state[p + 2] = O.hex(O.cat(...sig.chunkDigests)); state[p + 3] = O.hex(msg);
    sigs.push({ d, sig, key: keys[k - 1] });
    prevd = d;
  }
  return { aid, keys, state, sigs };
}

// ------------------------------------------------------------------------------------------------ LX
if (want('lx')) {
  for (const n of [32, 16]) {
    for (const K of [8, 4, 2]) {
      const ch = lxChain({ n, K, hops: 1 });
      const gen = G.lxHelper({ n, K });
      // measure chunk 0 and the last chunk of hop 1 (inputs 1 and K)
      await measure(gen, { state: ch.state, globals: { '@INPUT': '1' }, tag: 'in1' }, `hop 1 chunk 0 of ${K}`, K !== 2);
      if (K !== 2) await measure(gen, { state: ch.state, globals: { '@INPUT': String(K) }, tag: 'in' + K }, `hop 1 chunk ${K - 1} of ${K}`);
      // negative control: flip one byte of R in the chunk -> must fail
      if (K === 4) {
        const bad = { ...ch.state };
        const R = O.unhex(bad[16]); R[5] ^= 0x40; bad[16] = O.hex(R);
        await measure(gen, { state: bad, globals: { '@INPUT': '1' }, tag: 'in1_tampered' }, 'tampered secret must be refused', false);
      }
    }
    // anchor-side checks for 1, 2, 3 hops (K = 4)
    for (const hops of [1, 2, 3]) {
      const ch = lxChain({ n, K: 4, hops });
      await measure(G.lxAnchorHops({ n, K: 4, hops }), { state: ch.state }, `anchor-side checks, ${hops} hop(s)`);
      if (hops === 1) {
        // negative controls: wrong label (flip the label bit of position 7) and wrong key
        const bad = { ...ch.state };
        const R = O.unhex(bad[16]); const blk = R.subarray(7 * n, 8 * n); O.setBeBit(blk, O.lxLabelBit(7, n), 1 - O.beBit(blk, O.lxLabelBit(7, n))); bad[16] = O.hex(R);
        await measure(G.lxAnchorHops({ n, K: 4, hops }), { state: bad, tag: 'label_flipped' }, 'a secret whose label disagrees with the digest must be refused', false);
        const bad2 = { ...ch.state, 3: O.hex(randomBytes(32)) };
        await measure(G.lxAnchorHops({ n, K: 4, hops }), { state: bad2, tag: 'wrong_key' }, 'a signature by another key must be refused', false);
      }
    }
    // whole signature in one script (expected to hit the 1,024 limit)
    const ch = lxChain({ n, K: 4, hops: 1 });
    const st = { ...ch.state, 3: O.hex(ch.keys[0].pk) };
    await measure(G.lxFullSingle({ n, K: 4 }), { state: st }, 'whole signature in a single coin', false);
  }
}

// ------------------------------------------------------------------------------------ LX, 255 positions
// n = 16 split five ways (51 positions per helper) leaves ~20 % instruction headroom per coin. Signing
// 255 of the digest's 256 bits keeps 2^255 second-preimage and 2^127.5 collision resistance.
function lxChainP({ n, K, P, hops }) {
  const aid = randomBytes(32);
  const keys = [];
  for (let k = 0; k <= hops; k++) keys.push(O.lxKeygen({ n, chunks: K, positions: P }));
  const state = { 1: String(hops), 2: O.hex(aid), 3: O.hex(keys[0].pk) };
  let prevd = aid;
  for (let k = 1; k <= hops; k++) {
    const msg = O.cat(keys[k].pk, randomBytes(32), randomBytes(16));
    const d = O.sha2(O.cat(Buffer.from([1]), aid, Buffer.from([k]), prevd, msg));
    const sig = O.lxSign(keys[k - 1], d);
    if (!O.lxVerify(keys[k - 1].pk, d, sig, { n, chunks: K, positions: P })) throw new Error('reference verify failed');
    const p = 16 * k;
    state[p] = O.hex(sig.R); state[p + 1] = O.hex(sig.C); state[p + 2] = O.hex(O.cat(...sig.chunkDigests)); state[p + 3] = O.hex(msg);
    prevd = d;
  }
  return { aid, keys, state };
}
if (want('lx255')) {
  const n = 16, K = 5, P = 255;
  const ch = lxChainP({ n, K, P, hops: 3 });
  const gen = G.lxHelper({ n, K, P });
  for (const j of [1, 5, 6, 10, 11, 15]) {
    await measure(gen, { state: ch.state, globals: { '@INPUT': String(j) }, tag: 'in' + j }, `input ${j}: hop ${Math.floor((j - 1) / K) + 1} chunk ${(j - 1) % K}`);
  }
  const bad = { ...ch.state };
  const C = O.unhex(bad[33]); C[100] ^= 1; bad[33] = O.hex(C);
  await measure(gen, { state: bad, globals: { '@INPUT': '6' }, tag: 'in6_tampered_complement' }, 'tampered complement in hop 2 must be refused', false);
  for (const hops of [1, 2, 3]) {
    const c2 = lxChainP({ n, K, P, hops });
    await measure(G.lxAnchorHops({ n, K, P, hops }), { state: c2.state }, `anchor-side checks, ${hops} hop(s)`);
  }
  const c3 = lxChainP({ n, K, P, hops: 1 });
  const bad2 = { ...c3.state };
  const R = O.unhex(bad2[16]); const blk = R.subarray(200 * n, 201 * n); O.setBeBit(blk, O.lxLabelBit(200, n), 1 - O.beBit(blk, O.lxLabelBit(200, n))); bad2[16] = O.hex(R);
  await measure(G.lxAnchorHops({ n, K, P, hops: 1 }), { state: bad2, tag: 'label_flipped' }, 'label of position 200 flipped must be refused', false);
}

// ------------------------------------------------------------------------------------------------ LO
if (want('lo')) {
  for (const n of [32, 16]) {
    for (const K of [8, 4]) {
      const key = O.loKeygen({ n, chunks: K });
      const d = randomBytes(32);
      const sig = O.loSign(key, d);
      const state = { 16: O.hex(sig.R), 17: O.hex(sig.C), 18: O.hex(O.cat(...sig.chunkDigests)), 20: O.hex(d) };
      await measure(G.loHelper({ n, K }), { state, globals: { '@INPUT': '1' }, tag: 'in1' }, `ordered Lamport hop 1 chunk 0 of ${K}`, true);
    }
  }
}

// --------------------------------------------------------------------------------------------- CHEAT
async function mmrCreate(nodes) {
  const r = await rpc('mmrcreate nodes:' + JSON.stringify(nodes));
  if (!r.status) throw new Error('mmrcreate failed: ' + JSON.stringify(r).slice(0, 300));
  return r.response;
}
if (want('cheat') || want('member')) {
  for (const n of [32, 16]) {
    const K = 4, B = 64;
    const key = O.lxKeygen({ n, chunks: K });
    // device root over 1,024 key commitments (the key under test at entry 37)
    const leaves = []; for (let j = 0; j < 1024; j++) leaves.push((j === 37 ? O.hex(key.pk) : O.hex(randomBytes(32))) + ':0');
    const mmr = await mmrCreate(leaves);
    const proof37 = mmr.nodes[37].proof;
    const d1 = randomBytes(32), d2 = randomBytes(32);
    const s1 = O.lxSign(key, d1), s2 = O.lxSign(key, d2);
    const cp = O.lxCheatProof(key, s1, s2, d1, d2);
    const c = Math.floor(cp.position / B);
    const Tblob = O.cat(...key.T.slice(c * B, c * B + B));
    const state = { 10: O.hex(cp.s0), 11: O.hex(cp.s1), 12: String(cp.position), 13: String(c), 14: O.hex(Tblob),
      15: O.hex(O.cat(...key.chunkDigests)), 16: O.hex(key.pk), 17: mmr.root.data, 18: String(mmr.root.value), 19: proof37 };
    if (want('cheat')) {
      await measure(G.lxCheatProof({ n, K }), { state }, `proof of cheating, position ${cp.position}, device root of 1,024 keys`);
      const bad = { ...state, 11: state[10] }; // the same secret twice is not cheating
      await measure(G.lxCheatProof({ n, K }), { state: bad, tag: 'same_secret' }, 'the same secret twice must be refused', false);
    }
    if (want('member') && n === 32) {
      await measure(G.membershipOnly(), { state }, 'device root membership, 1,024 keys');
      saveReceipt('device_root_proof_sizes', { node, timestamp: stamp(), purpose: 'MMR proof bytes for device roots (mmrcreate)',
        keys1024_proofBytes: (proof37.length - 2) / 2 });
    }
  }
}

// ------------------------------------------------------------------------------------------------ W4
if (want('w4')) {
  for (const steps of [1, 5, 15]) {
    await measure(G.w4ChainOnly(steps), { state: { 20: O.hex(randomBytes(32)) } }, `W4 chain slope, ${steps} steps`);
  }
  const key = O.w4Keygen();
  const d = randomBytes(32);
  const sig = O.w4Sign(key, d);
  await measure(G.w4Verify(), { state: { 20: O.hex(sig.S), 21: O.hex(d), 22: O.hex(key.pk) } }, 'full W4 verification in one script', false);
  saveReceipt('w4_digits', { node, timestamp: stamp(), totalSteps: sig.digits.reduce((a, v) => a + (15 - v), 0), digits: sig.digits });
}

// ---------------------------------------------------------------------------------------------- FORS
if (want('fors')) {
  for (const [k, a] of [[32, 8], [64, 4]]) {
    const leavesPer = 2 ** a;
    const d = randomBytes(32);
    const secrets = [], roots = [], proofs = {};
    let proofBytes = 0;
    for (let t = 0; t < k; t++) {
      const sk = []; const nodes = [];
      for (let v = 0; v < leavesPer; v++) { const s = randomBytes(32); sk.push(s); nodes.push(O.hex(O.sha2(s)) + ':' + v); }
      const mmr = await mmrCreate(nodes);
      const v = a === 8 ? d[t] : (t % 2 === 0 ? d[t >> 1] >> 4 : d[t >> 1] & 15);
      secrets.push(sk[v]); roots.push(O.unhex(mmr.root.data)); proofs[40 + t] = mmr.nodes[v].proof;
      proofBytes += (mmr.nodes[v].proof.length - 2) / 2;
      if (String(mmr.root.value) !== String((leavesPer * (leavesPer - 1)) / 2)) throw new Error('unexpected root sum ' + mmr.root.value);
    }
    const rootsBlob = O.cat(...roots);
    const state = { 30: O.hex(O.cat(...secrets)), 31: O.hex(rootsBlob), 32: O.hex(d), 33: O.hex(O.sha2(rootsBlob)), ...proofs };
    await measure(G.forsVerify({ k, a }), { state }, `FORS-style k=${k} a=${a}, PROOF per revealed secret`, true);
    saveReceipt(`fors_k${k}_a${a}_sizes`, { node, timestamp: stamp(), secretsBytes: 32 * k, rootsBytes: 32 * k, proofBytes, totalSignatureBytes: 64 * k + proofBytes, leavesPerKey: k * leavesPer });
  }
}

saveReceipt('step-a-summary-' + only, { node, timestamp: stamp(), summary });
console.log('done:', summary.length, 'measurements');
