// Measures every covenant branch of the chip-balance design (Phase 1 redo).
//  - Address templates (release coin Q, swap, helper) and clean-invariance of every text are checked on the LIVE lab
//    node with runscript; the heavy defund signature core is also counted by the live node with runscript.
//  - Branches that read the transaction (VERIFYOUT, GETINADDR, @TOTIN ...) run in-process in java/KissRun.java on the
//    node's own jar (Minima 1.0.45.15), as Phase 1 did.
//  - The chip's chain-key tree is a real Minima MMR built by the lab node (mmrcreate), leaf value = key index.
// Nothing is posted, signed or written to any node.
import { randomBytes, createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { rpc, runscript, nodeVersion, saveReceipt, HERE, quoteScript } from './rpc.mjs';
import * as O from './ots.mjs';
import * as B from './balance-covenants.mjs';

const node = await nodeVersion();
const SCRATCH = process.env.SIMCARD_SCRATCH || 'C:/Users/Charles/AppData/Local/Temp/claude/c--Users-Charles-Documents-Stables/c983ae49-c861-4c13-a438-a127ecd8670d/scratchpad';
const JAVA = 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot/bin/java.exe';
const CP = ['C:/Users/Charles/Documents/Crypto/Minima/Nodes/DevNodesSet/9101/minima.jar', join(SCRATCH, 'jrun')].join(';');
const KISS_DIR = join(HERE, '..', 'kiss', 'balance'); mkdirSync(KISS_DIR, { recursive: true });
const rnd = (n = 32) => O.hex(randomBytes(n));
const sha = (b) => createHash('sha256').update(b).digest();
const be = (v, n) => { let x = BigInt(v); const b = Buffer.alloc(n); for (let i = n - 1; i >= 0; i--) { b[i] = Number(x & 255n); x >>= 8n; } return b; };
const A = (usdw) => BigInt(Math.round(usdw * 1e8)); // USDw -> atoms
const n = 16, K = 5, P = 255;

// ------------------------------------------------------------------------------------------- parameters
const BLOCK = 2340000;
const PAR = {
  awindow: 12096,            // account defund window: 7 days of ~50 s blocks
  capAtoms: A(1000),         // holding cap 1,000 USDw
  minFund: 1,                // smallest funding 1 USDw
  retireAge: 1051200,        // revoked account idle ~2 years -> marker burned
  vwindow: 1728,             // vault lane brake window: 1 day
  betaPct: 10,               // a lane pays out at most 10 % of its balance per day ...
  floorAtoms: A(1000),       // ... or 1,000 USDw, whichever is larger
  dormancy: 3153600,         // vault retirement: 5 years without movement
  gwindow: 12096,            // vendor gate window: 7 days
  rhoPct: 100,               // a vendor's chips defund at most 100 % of its bond per 7 days ...
  vfloorAtoms: A(1000),      // ... or 1,000 USDw per gate per 7 days (exit floor)
  penaltyAtoms: A(10000),    // evidence penalty per incident: 10,000 USDw (or the whole bond if smaller)
  freezeAt: 3,               // third incident freezes the vendor's gates
  maxWl: A(5000),            // highest per-chip window limit a vendor may register (merchant tier)
  wdelay: 51840,             // vendor bond withdrawal delay: 30 days
  abandon: 1261440,          // vendor gate / bond abandoned after ~2 years idle
  minBondAtoms: A(10000),    // minimum vendor bond at admission
  bondPerChipAtoms: A(10),   // CHIP stock released per 10 USDw of bond (one registration each)
};
const CHIP = rnd(), USDW = rnd(), BURN = rnd(), SUCCESSOR = rnd();

// ------------------------------------------------------------------------------------------- deployment
async function cleanOf(text) { const r = await rpc('runscript ' + quoteScript(text)); if (!r.response.parseok) throw new Error('parse failed: ' + (r.response.trace.match(/PARSE ERROR : (.*)/) || [])[1] + ' :: ' + text.slice(0, 200)); return r.response.clean.script; }
async function addressOf(text) { const r = await rpc('runscript ' + quoteScript(text)); return r.response.script.address; }
async function kissAddress(expr) { const r = await rpc('runscript ' + quoteScript(`LET a=${expr} RETURN TRUE`)); return r.response.variables.a; }

const scripts = {};
scripts.vault = await cleanOf(B.vaultScript({ chip: CHIP, usdw: USDW, successor: SUCCESSOR, vwindow: PAR.vwindow, betaPct: PAR.betaPct, floorAtoms: PAR.floorAtoms, dormancy: PAR.dormancy }));
const VAULT = await addressOf(scripts.vault);
scripts.helperBody = await cleanOf(B.helperBody({ chip: CHIP })); // the clean form is what MAST hashes and what the witness must carry
const bodyHash = await addressOf(scripts.helperBody);
const TAG = rnd();
scripts.helperAddr = B.helperAddressScript(TAG, bodyHash);
const HELPER = await addressOf(scripts.helperAddr);
scripts.acc = await cleanOf(B.accScript({ chip: CHIP, usdw: USDW, vault: VAULT, burn: BURN, helperHash: bodyHash, awindow: PAR.awindow, capAtoms: PAR.capAtoms, minFund: PAR.minFund, retireAge: PAR.retireAge }));
const ACC = await addressOf(scripts.acc);
scripts.vendor = await cleanOf(B.vendorScript({ chip: CHIP, usdw: USDW, acc: ACC, vault: VAULT, burn: BURN, vwindow: PAR.gwindow, rhoPct: PAR.rhoPct, vfloorAtoms: PAR.vfloorAtoms, penaltyAtoms: PAR.penaltyAtoms, freezeAt: PAR.freezeAt, maxWl: PAR.maxWl, wdelay: PAR.wdelay, abandon: PAR.abandon }));
const VENDOR = await addressOf(scripts.vendor);
scripts.disp = await cleanOf(B.dispenserScript({ chip: CHIP, usdw: USDW, vendor: VENDOR, minBondAtoms: PAR.minBondAtoms, bondPerChipAtoms: PAR.bondPerChipAtoms }));
const DISP = await addressOf(scripts.disp);
console.log('addresses', { VAULT, ACC, VENDOR, DISP, HELPER });

// ------------------------------------------------------------------- template checks on the live node
const templateChecks = {};
{
  const h = rnd();
  const qText = B.qScript(h, ACC, VAULT, CHIP);
  const viaKiss = await kissAddress(`ADDRESS([LET h=]+STRING(${h})+[ LET acc=]+STRING(${ACC})+[ LET vlt=]+STRING(${VAULT})+[ ${B.qBody({ chip: CHIP })}])`);
  const r = await rpc('runscript ' + quoteScript(qText));
  templateChecks.releaseQ = { agree: viaKiss === r.response.script.address, cleanInvariant: r.response.clean.script === qText, chars: qText.length };
  const sText = B.swapScript(h, rnd(), rnd(), BLOCK + 100);
  const rs = await rpc('runscript ' + quoteScript(sText));
  templateChecks.swap = { cleanInvariant: rs.response.clean.script === sText, chars: sText.length };
  const viaKissH = await kissAddress(`ADDRESS([LET owner=]+STRING(${TAG})+[ MAST ${bodyHash}])`);
  templateChecks.helper = { agree: viaKissH === HELPER, cleanInvariant: (await rpc('runscript ' + quoteScript(scripts.helperAddr))).response.clean.script === scripts.helperAddr };
  templateChecks.helperBody = { cleanInvariant: (await rpc('runscript ' + quoteScript(scripts.helperBody))).response.clean.script === scripts.helperBody, chars: scripts.helperBody.length };
  for (const k of ['vault', 'acc', 'vendor', 'disp']) {
    const rr = await rpc('runscript ' + quoteScript(scripts[k]));
    templateChecks[k] = { parseok: rr.response.parseok, cleanInvariant: rr.response.clean.script === scripts[k], chars: scripts[k].length };
  }
  console.log('templates', JSON.stringify(templateChecks));
}
const qAddress = async (hashHex) => addressOf(B.qScript(hashHex, ACC, VAULT, CHIP));

// ------------------------------------------------------------------------ chip keys, tree, record
const KEYS = 8; const keys = [];
for (let i = 0; i < KEYS; i++) keys.push(O.lxKeygen({ n, chunks: K, positions: P }));
const LEAVES = 64; const leaves = [];
for (let i = 0; i < LEAVES; i++) leaves.push((i < KEYS ? O.hex(keys[i].pk) : rnd()) + ':' + i);
const mmr = (await rpc('mmrcreate nodes:' + JSON.stringify(leaves))).response;
const ROOT = mmr.root.data, ROOTSUM = BigInt(mmr.root.value);
const proofOf = (i) => mmr.nodes[i].proof;
const CHIPID = randomBytes(32), OWNERKEY = rnd(), OWNERPAY = rnd(), VKEY = rnd(), VPAY = rnd();
function record(o = {}) {
  const f = { k: 3, F: A(600), u: 5, D: A(200), ws: BLOCK - 100, wu: A(100), wl: A(1000), st: 0, sb: 0, ...o };
  return Buffer.concat([CHIPID, O.unhex(ROOT), O.unhex(OWNERKEY), O.unhex(OWNERPAY), O.unhex(f.vkey || VKEY), O.unhex(TAG),
    be(f.k, 4), be(f.F, 8), be(f.u, 4), be(f.D, 8), be(f.ws, 4), be(f.wu, 8), be(f.wl, 8), be(f.st, 1), be(f.sb, 4), be(ROOTSUM, 8)]);
}
const REC0 = record();
if (REC0.length !== 249) throw new Error('record length ' + REC0.length);
function message(o = {}) {
  const f = { i: 6, y: A(250), kc: 3, fc: A(600), ver: 7, bal: A(150), sent: A(900), recv: A(650), ...o };
  return Buffer.concat([be(f.i, 4), be(f.y, 8), be(f.kc, 4), be(f.fc, 8), be(f.ver, 4), be(f.bal, 8), be(f.sent, 8), be(f.recv, 8)]);
}
const digestOf = (msg) => sha(Buffer.concat([Buffer.from([0x44]), CHIPID, msg]));
const coin = (o) => ({ storestate: false, tokenid: '0x00', amount: '0.001', created: BLOCK - 100, ...o });
const accCoin = (rec = REC0, o = {}) => coin({ coinid: rnd(), address: ACC, amount: '1', tokenid: CHIP, storestate: true, state: { 120: O.hex(rec) }, ...o });
const helpers = () => Array.from({ length: K }, () => coin({ coinid: rnd(), address: HELPER }));

// D1 new record / extra as the covenant builds them
function d1NewRecord(rec, msg) {
  const i = msg.readUInt32BE(0); const y = msg.readBigUInt64BE(4);
  let ws = BigInt(rec.readUInt32BE(216)); let wu = rec.readBigUInt64BE(220) + y;
  if (BigInt(BLOCK) > ws + BigInt(PAR.awindow)) { ws = BigInt(BLOCK); wu = y; }
  return { nr: Buffer.concat([rec.subarray(0, 204), be(i, 4), be(rec.readBigUInt64BE(208) + y, 8), be(ws, 4), be(wu, 8), rec.subarray(228, 249)]),
    ex: Buffer.concat([Buffer.from([0]), be(y, 8)]), y };
}
const evidenceRecord = (rec) => ({ nr: Buffer.concat([rec.subarray(0, 236), Buffer.from([2]), be(BLOCK, 4), rec.subarray(241, 249)]), ex: Buffer.concat([Buffer.from([1]), be(0, 8)]) });

// --------------------------------------------------------------------------------------------- cases
const cases = [];
const add = (c) => cases.push({ block: BLOCK, ...c });

// ---- FUND
{
  const nr = Buffer.concat([REC0.subarray(0, 192), be(4, 4), be(A(600) + A(100), 8), REC0.subarray(204, 249)]);
  const st = { 9: '1', 120: O.hex(nr) };
  const outs = [coin({ address: ACC, amount: '1', tokenid: CHIP, storestate: true }), coin({ address: VAULT, amount: '100', tokenid: USDW })];
  const ins = [accCoin(), coin({ coinid: rnd(), address: rnd(), amount: '150', tokenid: USDW })];
  add({ name: 'acc_FUND_100', script: scripts.acc, input: 0, state: st, inputs: ins, outputs: outs });
  add({ name: 'NEG_acc_FUND_deposit_elsewhere', expect: false, script: scripts.acc, input: 0, state: st, inputs: ins, outputs: [outs[0], coin({ address: rnd(), amount: '100', tokenid: USDW })] });
  add({ name: 'NEG_acc_FUND_counter_skips', expect: false, script: scripts.acc, input: 0, state: { 9: '1', 120: O.hex(Buffer.concat([REC0.subarray(0, 192), be(5, 4), be(A(700), 8), REC0.subarray(204, 249)])) }, inputs: ins, outputs: outs });
  add({ name: 'NEG_acc_FUND_total_inflated', expect: false, script: scripts.acc, input: 0, state: { 9: '1', 120: O.hex(Buffer.concat([REC0.subarray(0, 192), be(4, 4), be(A(900), 8), REC0.subarray(204, 249)])) }, inputs: ins, outputs: outs });
  add({ name: 'NEG_acc_FUND_evidence_revoked', expect: false, script: scripts.acc, input: 0, state: st, inputs: [accCoin(record({ st: 2 })), ins[1]], outputs: outs });
}

// ---- D1 defund verify (and helpers)
const d1 = {};
async function buildD1({ keyIndex = 6, msgOver = {}, rec = REC0, op = 2, tamper = null } = {}) {
  const msg = message({ i: keyIndex, ...msgOver });
  const d = digestOf(msg);
  const sig = O.lxSign(keys[keyIndex], d);
  const R = Buffer.from(sig.R); if (tamper === 'label') R[2 * 16 + 15] ^= 0x04; if (tamper === 'secret') R[40] ^= 0x80; // position 2: label = big-endian bit 2
  const state = { 9: String(op), 97: '1', 29: String(BLOCK), 16: O.hex(R), 17: O.hex(sig.C), 18: O.hex(Buffer.concat(sig.chunkDigests)), 19: O.hex(msg), 27: proofOf(keyIndex) };
  const { nr, ex } = op === 2 ? d1NewRecord(rec, msg) : evidenceRecord(rec);
  const q = await qAddress(O.hex(sha(Buffer.concat([nr, ex]))));
  const inputs = [accCoin(rec), ...helpers()];
  const outputs = [coin({ address: q, amount: '1', tokenid: CHIP })];
  return { msg, state, nr, ex, q, inputs, outputs };
}
{
  const g = await buildD1(); Object.assign(d1, g);
  add({ name: 'acc_D1_defund_verify', script: scripts.acc, input: 0, state: g.state, inputs: g.inputs, outputs: g.outputs });
  add({ name: 'helper_D1_first', script: scripts.helperAddr, input: 1, state: g.state, inputs: g.inputs, outputs: g.outputs, witnessScripts: [scripts.helperBody] });
  add({ name: 'helper_D1_last', script: scripts.helperAddr, input: 5, state: g.state, inputs: g.inputs, outputs: g.outputs, witnessScripts: [scripts.helperBody] });
  const bad = { ...g.state }; const C2 = O.unhex(bad[17]); C2[33] ^= 1; bad[17] = O.hex(C2);
  add({ name: 'NEG_helper_D1_tampered_complement', expect: false, script: scripts.helperAddr, input: 1, state: bad, inputs: g.inputs, outputs: g.outputs, witnessScripts: [scripts.helperBody] });
  add({ name: 'NEG_acc_D1_Q_redirected', expect: false, script: scripts.acc, input: 0, state: g.state, inputs: g.inputs, outputs: [coin({ address: rnd(), amount: '1', tokenid: CHIP })] });
  const foreign = [...g.inputs]; foreign[3] = coin({ coinid: rnd(), address: rnd() });
  add({ name: 'NEG_acc_D1_foreign_helper', expect: false, script: scripts.acc, input: 0, state: g.state, inputs: foreign, outputs: g.outputs });
  add({ name: 'NEG_acc_D1_helper_missing', expect: false, script: scripts.acc, input: 0, state: g.state, inputs: g.inputs.slice(0, 5), outputs: g.outputs });
  const ts = await buildD1({ tamper: 'secret' });
  add({ name: 'NEG_helper_D1_tampered_secret', expect: false, script: scripts.helperAddr, input: 1, state: ts.state, inputs: ts.inputs, outputs: ts.outputs, witnessScripts: [scripts.helperBody] });
  add({ name: 'acc_D1_tampered_secret_passes_anchor_caught_by_helper', script: scripts.acc, input: 0, state: ts.state, inputs: ts.inputs, outputs: ts.outputs });
  const tl = await buildD1({ tamper: 'label' });
  add({ name: 'NEG_acc_D1_label_flipped', expect: false, script: scripts.acc, input: 0, state: tl.state, inputs: tl.inputs, outputs: tl.outputs });
  const old = await buildD1({ keyIndex: 5 });
  add({ name: 'NEG_acc_D1_key_index_reused', expect: false, script: scripts.acc, input: 0, state: old.state, inputs: old.inputs, outputs: old.outputs });
  const wk = await buildD1(); const wkState = { ...wk.state, 18: O.hex(Buffer.concat(O.lxSign(keys[7], digestOf(wk.msg)).chunkDigests)) };
  add({ name: 'NEG_acc_D1_signed_by_other_key', expect: false, script: scripts.acc, input: 0, state: wkState, inputs: wk.inputs, outputs: wk.outputs });
  const mm = await buildD1({ msgOver: { kc: 5 } });
  add({ name: 'NEG_acc_D1_funding_count_above_chain', expect: false, script: scripts.acc, input: 0, state: mm.state, inputs: mm.inputs, outputs: mm.outputs });
  const big = await buildD1({ msgOver: { y: A(901) } });
  add({ name: 'NEG_acc_D1_window_limit', expect: false, script: scripts.acc, input: 0, state: big.state, inputs: big.inputs, outputs: big.outputs });
  const reset = await buildD1({ msgOver: { y: A(901) }, rec: record({ ws: BLOCK - 13000 }) });
  add({ name: 'acc_D1_window_reset_allows_901', script: scripts.acc, input: 0, state: reset.state, inputs: reset.inputs, outputs: reset.outputs });
  const cap = await buildD1({ msgOver: { bal: A(1001) } });
  add({ name: 'NEG_acc_D1_balance_above_cap', expect: false, script: scripts.acc, input: 0, state: cap.state, inputs: cap.inputs, outputs: cap.outputs });
  const lost = await buildD1({ rec: record({ st: 1 }) });
  add({ name: 'acc_D1_owner_revoked_still_pays_owner', script: scripts.acc, input: 0, state: lost.state, inputs: lost.inputs, outputs: lost.outputs });
  const ev = await buildD1({ rec: record({ st: 2 }) });
  add({ name: 'NEG_acc_D1_evidence_revoked_chip', expect: false, script: scripts.acc, input: 0, state: ev.state, inputs: ev.inputs, outputs: ev.outputs });
  // evidence: the same kind of voucher with a funding count above the chain's count
  const e3 = await buildD1({ msgOver: { kc: 5 }, op: 3 });
  add({ name: 'acc_EVIDENCE_funding_mismatch', script: scripts.acc, input: 0, state: e3.state, inputs: e3.inputs, outputs: e3.outputs });
  const e3c = await buildD1({ msgOver: { bal: A(1200) }, op: 3 });
  add({ name: 'acc_EVIDENCE_balance_above_cap', script: scripts.acc, input: 0, state: e3c.state, inputs: e3c.inputs, outputs: e3c.outputs });
  const e3n = await buildD1({ op: 3 });
  add({ name: 'NEG_acc_EVIDENCE_nothing_wrong', expect: false, script: scripts.acc, input: 0, state: e3n.state, inputs: e3n.inputs, outputs: e3n.outputs });
  d1.e3 = e3;
}

// ---- clone evidence: key 2 signed two different vouchers
{
  const k2 = keys[2];
  const da = digestOf(message({ i: 2, y: A(10) })), db = digestOf(message({ i: 2, y: A(20) }));
  const sa = O.lxSign(k2, da), sb = O.lxSign(k2, db);
  const cp = O.lxCheatProof(k2, sa, sb, da, db);
  const Bc = P / K, ci = Math.floor(cp.position / Bc);
  const { nr, ex } = evidenceRecord(REC0);
  const q = await qAddress(O.hex(sha(Buffer.concat([nr, ex]))));
  const st = { 9: '4', 29: String(BLOCK), 10: O.hex(cp.s0), 11: O.hex(cp.s1), 12: String(cp.position), 13: String(ci), 14: O.hex(Buffer.concat(k2.T.slice(ci * Bc, ci * Bc + Bc))), 15: O.hex(Buffer.concat(k2.chunkDigests)), 26: '2', 28: proofOf(2) };
  add({ name: 'acc_EVIDENCE_clone_two_secrets', script: scripts.acc, input: 0, state: st, inputs: [accCoin()], outputs: [coin({ address: q, amount: '1', tokenid: CHIP })] });
  add({ name: 'NEG_acc_EVIDENCE_clone_same_secret', expect: false, script: scripts.acc, input: 0, state: { ...st, 11: st[10] }, inputs: [accCoin()], outputs: [coin({ address: q, amount: '1', tokenid: CHIP })] });
  add({ name: 'NEG_acc_EVIDENCE_clone_key_not_in_root', expect: false, script: scripts.acc, input: 0, state: { ...st, 26: '3' }, inputs: [accCoin()], outputs: [coin({ address: q, amount: '1', tokenid: CHIP })] });
}

// ---- owner / vendor operations and retirement
{
  const revoked = Buffer.concat([REC0.subarray(0, 236), Buffer.from([1]), be(BLOCK, 4), REC0.subarray(241, 249)]);
  const outs = [coin({ address: ACC, amount: '1', tokenid: CHIP, storestate: true })];
  add({ name: 'acc_OWNER_revoke', script: scripts.acc, input: 0, signatures: [OWNERKEY], state: { 9: '20', 29: String(BLOCK), 120: O.hex(revoked) }, inputs: [accCoin()], outputs: outs });
  add({ name: 'NEG_acc_OWNER_revoke_unsigned', expect: false, script: scripts.acc, input: 0, state: { 9: '20', 29: String(BLOCK), 120: O.hex(revoked) }, inputs: [accCoin()], outputs: outs });
  const newPay = rnd();
  const payRec = Buffer.concat([REC0.subarray(0, 96), O.unhex(newPay), REC0.subarray(128, 249)]);
  add({ name: 'acc_OWNER_set_payout', script: scripts.acc, input: 0, signatures: [OWNERKEY], state: { 9: '21', 122: newPay, 120: O.hex(payRec) }, inputs: [accCoin()], outputs: outs });
  add({ name: 'NEG_acc_OWNER_set_payout_by_vendor', expect: false, script: scripts.acc, input: 0, signatures: [VKEY], state: { 9: '21', 122: newPay, 120: O.hex(payRec) }, inputs: [accCoin()], outputs: outs });
  const vrev = Buffer.concat([REC0.subarray(0, 236), Buffer.from([3]), be(BLOCK, 4), REC0.subarray(241, 249)]);
  add({ name: 'acc_VENDOR_revoke', script: scripts.acc, input: 0, signatures: [VKEY], state: { 9: '22', 29: String(BLOCK), 120: O.hex(vrev) }, inputs: [accCoin()], outputs: outs });
  add({ name: 'acc_RETIRE_revoked_idle', script: scripts.acc, input: 0, block: BLOCK + PAR.retireAge + 200, state: { 9: '24' }, inputs: [accCoin(record({ st: 2 }))], outputs: [coin({ address: BURN, amount: '1', tokenid: CHIP })] });
  add({ name: 'NEG_acc_RETIRE_active_account', expect: false, script: scripts.acc, input: 0, block: BLOCK + PAR.retireAge + 200, state: { 9: '24' }, inputs: [accCoin()], outputs: [coin({ address: BURN, amount: '1', tokenid: CHIP })] });
}

// ---- D2 defund settle: Q + vendor gate + vault lane
const gateState0 = { 150: VKEY, 151: VPAY, 152: String(BLOCK - 10), 153: String(A(2000)), 154: String(A(20000)), 155: '0', 156: '0' };
const gateCoin = (st = gateState0, amt = '100') => coin({ coinid: rnd(), address: VENDOR, amount: amt, tokenid: CHIP, storestate: true, state: st });
const laneState0 = { 180: String(BLOCK - 50), 181: String(A(1000)) };
const laneCoin = (amt = '50000', st = laneState0) => coin({ coinid: rnd(), address: VAULT, amount: amt, tokenid: USDW, storestate: true, state: st });
{
  const { nr, ex, q } = d1; const y = A(250);
  const qCoin = coin({ coinid: rnd(), address: q, amount: '1', tokenid: CHIP });
  const st = { 9: '10', 29: String(BLOCK), 120: O.hex(nr), 201: O.hex(ex), 202: ACC, 203: VAULT, ...gateState0, 153: String(A(2000) + y), 180: laneState0[180], 181: String(A(1000) + y) };
  const ins = [qCoin, gateCoin(), laneCoin()];
  const outs = [coin({ address: ACC, amount: '1', tokenid: CHIP, storestate: true }), coin({ address: VENDOR, amount: '100', tokenid: CHIP, storestate: true }),
    coin({ address: VAULT, amount: String(50000 - 250), tokenid: USDW, storestate: true }), coin({ address: OWNERPAY, amount: '250', tokenid: USDW })];
  const qText = B.qScript(O.hex(sha(Buffer.concat([nr, ex]))), ACC, VAULT, CHIP);
  add({ name: 'D2_Q_release', script: qText, input: 0, state: st, inputs: ins, outputs: outs });
  add({ name: 'D2_vendor_gate', script: scripts.vendor, input: 1, state: st, inputs: ins, outputs: outs });
  add({ name: 'D2_vault_lane_pay', script: scripts.vault, input: 2, state: st, inputs: ins, outputs: outs });
  add({ name: 'NEG_D2_vault_pays_elsewhere', expect: false, script: scripts.vault, input: 2, state: st, inputs: ins, outputs: [outs[0], outs[1], outs[2], coin({ address: rnd(), amount: '250', tokenid: USDW })] });
  add({ name: 'NEG_D2_vault_overpays', expect: false, script: scripts.vault, input: 2, state: st, inputs: ins, outputs: [outs[0], outs[1], coin({ address: VAULT, amount: String(50000 - 300), tokenid: USDW, storestate: true }), coin({ address: OWNERPAY, amount: '300', tokenid: USDW })] });
  add({ name: 'NEG_D2_Q_record_not_kept', expect: false, script: qText, input: 0, state: st, inputs: ins, outputs: [{ ...outs[0], storestate: false }, outs[1], outs[2], outs[3]] });
  add({ name: 'NEG_D2_Q_wrong_summary', expect: false, script: qText, input: 0, state: { ...st, 120: O.hex(Buffer.concat([nr.subarray(0, 208), be(0, 8), nr.subarray(216)])) }, inputs: ins, outputs: outs });
  // an ordinary account coin (1 CHIP at ACC) posing as a release coin
  add({ name: 'NEG_D2_vault_fake_Q', expect: false, script: scripts.vault, input: 2, state: st, inputs: [accCoin(), ins[1], ins[2]], outputs: outs });
  add({ name: 'NEG_D2_gate_other_vendor', expect: false, script: qText, input: 0, state: { ...st, 150: rnd() }, inputs: ins, outputs: outs });
  const full = { ...gateState0, 153: String(A(19900)) };
  add({ name: 'NEG_D2_gate_headroom_exhausted', expect: false, script: scripts.vendor, input: 1, state: { ...st, ...full, 153: String(A(19900) + y) }, inputs: [qCoin, gateCoin(full), ins[2]], outputs: outs });
  const fz = { ...gateState0, 155: String(PAR.freezeAt) };
  add({ name: 'NEG_D2_gate_frozen_vendor', expect: false, script: scripts.vendor, input: 1, state: { ...st, 155: fz[155] }, inputs: [qCoin, gateCoin(fz), ins[2]], outputs: outs });
  const small = laneCoin('2000');
  add({ name: 'NEG_D2_vault_brake', expect: false, script: scripts.vault, input: 2, state: st, inputs: [qCoin, ins[1], small], outputs: [outs[0], outs[1], coin({ address: VAULT, amount: '1750', tokenid: USDW, storestate: true }), outs[3]] });
  const lowLane = laneCoin('2000', { 180: String(BLOCK - 50), 181: '0' });
  add({ name: 'D2_vault_brake_floor_lets_small_lane_pay', script: scripts.vault, input: 2, state: { ...st, 181: String(y) }, inputs: [qCoin, ins[1], lowLane], outputs: [outs[0], outs[1], coin({ address: VAULT, amount: '1750', tokenid: USDW, storestate: true }), outs[3]] });
}

// ---- evidence settle: Q(flag 1) + gate SLASH + bond coin -> penalty into the vault
{
  const { nr, ex, q } = d1.e3;
  const qCoin = coin({ coinid: rnd(), address: q, amount: '1', tokenid: CHIP });
  const bond = coin({ coinid: rnd(), address: VENDOR, amount: '20000', tokenid: USDW, storestate: true, state: { 150: VKEY } });
  const p = A(10000);
  const st = { 9: '30', 29: String(BLOCK), 120: O.hex(nr), 201: O.hex(ex), 202: ACC, 203: VAULT, ...gateState0, 154: String(A(20000) - p), 155: '1', 157: String(p) };
  const ins = [qCoin, gateCoin(), bond];
  const outs = [coin({ address: ACC, amount: '1', tokenid: CHIP, storestate: true }), coin({ address: VENDOR, amount: '100', tokenid: CHIP, storestate: true }),
    coin({ address: VAULT, amount: '10000', tokenid: USDW }), coin({ address: VENDOR, amount: '10000', tokenid: USDW, storestate: true })];
  const qText = B.qScript(O.hex(sha(Buffer.concat([nr, ex]))), ACC, VAULT, CHIP);
  add({ name: 'EV2_Q_release', script: qText, input: 0, state: st, inputs: ins, outputs: outs });
  add({ name: 'EV2_gate_slash', script: scripts.vendor, input: 1, state: st, inputs: ins, outputs: outs });
  add({ name: 'EV2_bond_pays_vault', script: scripts.vendor, input: 2, state: st, inputs: ins, outputs: outs });
  add({ name: 'NEG_EV2_bond_pays_elsewhere', expect: false, script: scripts.vendor, input: 2, state: st, inputs: ins, outputs: [outs[0], outs[1], coin({ address: rnd(), amount: '10000', tokenid: USDW }), outs[3]] });
  add({ name: 'NEG_EV2_gate_penalty_too_small', expect: false, script: scripts.vendor, input: 1, state: { ...st, 154: String(A(19000)), 157: String(A(1000)) }, inputs: ins, outputs: outs });
  // a defund release coin (flag 0) cannot be used to slash
  add({ name: 'NEG_EV2_gate_with_defund_Q', expect: false, script: scripts.vendor, input: 1, state: { ...st, 120: O.hex(d1.nr), 201: O.hex(d1.ex) }, inputs: [coin({ coinid: rnd(), address: d1.q, amount: '1', tokenid: CHIP }), ins[1], ins[2]], outputs: outs });
}

// ---- REGISTER, withdrawal, retirement (vendor)
{
  const fresh = Buffer.concat([randomBytes(32), randomBytes(32), randomBytes(32), randomBytes(32), O.unhex(VKEY), randomBytes(32), Buffer.alloc(36), be(A(1000), 8), Buffer.alloc(5), be(ROOTSUM, 8)]);
  const st = { 9: '40', 120: O.hex(fresh), ...gateState0 };
  const outs = [coin({ address: ACC, amount: '1', tokenid: CHIP, storestate: true }), coin({ address: VENDOR, amount: '99', tokenid: CHIP, storestate: true })];
  add({ name: 'gate_REGISTER_chip', script: scripts.vendor, input: 0, signatures: [VKEY], state: st, inputs: [gateCoin()], outputs: outs });
  add({ name: 'NEG_gate_REGISTER_unsigned', expect: false, script: scripts.vendor, input: 0, state: st, inputs: [gateCoin()], outputs: outs });
  const other = Buffer.from(fresh); O.unhex(rnd()).copy(other, 128);
  add({ name: 'NEG_gate_REGISTER_other_vendor_key', expect: false, script: scripts.vendor, input: 0, signatures: [VKEY], state: { ...st, 120: O.hex(other) }, inputs: [gateCoin()], outputs: outs });
  const preloaded = Buffer.from(fresh); be(A(5000), 8).copy(preloaded, 196);
  add({ name: 'NEG_gate_REGISTER_preloaded_balance_counter', expect: false, script: scripts.vendor, input: 0, signatures: [VKEY], state: { ...st, 120: O.hex(preloaded) }, inputs: [gateCoin()], outputs: outs });
  add({ name: 'NEG_gate_REGISTER_to_fake_account_address', expect: false, script: scripts.vendor, input: 0, signatures: [VKEY], state: st, inputs: [gateCoin()], outputs: [coin({ address: rnd(), amount: '1', tokenid: CHIP, storestate: true }), outs[1]] });
  add({ name: 'gate_WITHDRAW_request', script: scripts.vendor, input: 0, signatures: [VKEY], state: { 9: '31', ...gateState0, 156: String(BLOCK) }, inputs: [gateCoin()], outputs: [coin({ address: VENDOR, amount: '100', tokenid: CHIP, storestate: true })] });
  const wg = { ...gateState0, 156: String(BLOCK - PAR.wdelay - 10) };
  const wst = { 9: '32', ...gateState0, 154: String(A(15000)), 156: '0', 157: String(A(5000)) };
  const wins = [gateCoin(wg), coin({ coinid: rnd(), address: VENDOR, amount: '20000', tokenid: USDW, storestate: true, state: { 150: VKEY } })];
  const wouts = [coin({ address: VENDOR, amount: '100', tokenid: CHIP, storestate: true }), coin({ address: VPAY, amount: '5000', tokenid: USDW }), coin({ address: VENDOR, amount: '15000', tokenid: USDW, storestate: true })];
  add({ name: 'gate_WITHDRAW_after_delay', script: scripts.vendor, input: 0, signatures: [VKEY], state: wst, inputs: wins, outputs: wouts });
  add({ name: 'bond_WITHDRAW_after_delay', script: scripts.vendor, input: 1, signatures: [VKEY], state: wst, inputs: wins, outputs: wouts });
  add({ name: 'NEG_gate_WITHDRAW_too_early', expect: false, script: scripts.vendor, input: 0, signatures: [VKEY], state: wst, inputs: [gateCoin({ ...gateState0, 156: String(BLOCK - 100) }), wins[1]], outputs: wouts });
  add({ name: 'NEG_gate_WITHDRAW_after_incident', expect: false, script: scripts.vendor, input: 0, signatures: [VKEY], state: wst, inputs: [gateCoin({ ...wg, 155: '1' }), wins[1]], outputs: wouts });
  add({ name: 'gate_ABANDON_retirement', script: scripts.vendor, input: 0, block: BLOCK + PAR.abandon + 200, state: { 9: '24' }, inputs: [gateCoin()], outputs: [coin({ address: BURN, amount: '100', tokenid: CHIP })] });
  add({ name: 'bond_ABANDON_retirement', script: scripts.vendor, input: 0, block: BLOCK + PAR.abandon + 200, state: { 9: '24' }, inputs: [coin({ coinid: rnd(), address: VENDOR, amount: '20000', tokenid: USDW, storestate: true, state: { 150: VKEY, 151: VPAY } })], outputs: [coin({ address: VPAY, amount: '20000', tokenid: USDW })] });
}

// ---- VAULT lane maintenance and retirement
{
  const lane = laneCoin('50000');
  const d1c = coin({ coinid: rnd(), address: VAULT, amount: '100', tokenid: USDW }), d2c = coin({ coinid: rnd(), address: VAULT, amount: '250', tokenid: USDW });
  const st = { 9: '11', ...laneState0 };
  const outs = [coin({ address: VAULT, amount: '50350', tokenid: USDW, storestate: true })];
  add({ name: 'vault_MERGE_lane_plus_2_deposits', script: scripts.vault, input: 0, state: st, inputs: [lane, d1c, d2c], outputs: outs });
  add({ name: 'vault_MERGE_deposit_side', script: scripts.vault, input: 1, state: st, inputs: [lane, d1c, d2c], outputs: outs });
  add({ name: 'NEG_vault_MERGE_skims', expect: false, script: scripts.vault, input: 0, state: st, inputs: [lane, d1c, d2c], outputs: [coin({ address: VAULT, amount: '50000', tokenid: USDW, storestate: true }), coin({ address: rnd(), amount: '350', tokenid: USDW })] });
  add({ name: 'vault_SPLIT_lane', script: scripts.vault, input: 0, state: { 9: '12', ...laneState0 }, inputs: [lane], outputs: [coin({ address: VAULT, amount: '20000', tokenid: USDW, storestate: true }), coin({ address: VAULT, amount: '30000', tokenid: USDW, storestate: true })] });
  add({ name: 'vault_RETIRE_after_dormancy', script: scripts.vault, input: 0, block: BLOCK + PAR.dormancy + 200, state: { 9: '24' }, inputs: [lane], outputs: [coin({ address: SUCCESSOR, amount: '50000', tokenid: USDW })] });
  add({ name: 'NEG_vault_RETIRE_early', expect: false, script: scripts.vault, input: 0, state: { 9: '24' }, inputs: [lane], outputs: [coin({ address: SUCCESSOR, amount: '50000', tokenid: USDW })] });
  add({ name: 'NEG_vault_deposit_spent_as_lane', expect: false, script: scripts.vault, input: 2, state: { 9: '10', 29: String(BLOCK), 120: O.hex(d1.nr), 201: O.hex(d1.ex), 202: ACC, 203: VAULT, 180: '0', 181: '0' },
    inputs: [coin({ coinid: rnd(), address: d1.q, amount: '1', tokenid: CHIP }), gateCoin(), d2c], outputs: [coin({ address: ACC, amount: '1', tokenid: CHIP, storestate: true })] });
}

// ---- DISPENSER admission
{
  const st = { 9: '50', 158: '1000', 150: rnd(), 151: rnd(), 152: String(BLOCK), 153: '0', 154: String(A(10000)), 155: '0', 156: '0' };
  const lane = coin({ coinid: rnd(), address: DISP, amount: '1000000', tokenid: CHIP });
  const outs = [coin({ address: VENDOR, amount: '1000', tokenid: CHIP, storestate: true }), coin({ address: VENDOR, amount: '10000', tokenid: USDW, storestate: true }), coin({ address: DISP, amount: '999000', tokenid: CHIP })];
  add({ name: 'disp_ADMIT_vendor', script: scripts.disp, input: 0, state: st, inputs: [lane, coin({ coinid: rnd(), address: rnd(), amount: '10000', tokenid: USDW })], outputs: outs });
  add({ name: 'NEG_disp_ADMIT_bond_below_minimum', expect: false, script: scripts.disp, input: 0, state: { ...st, 154: String(A(5000)), 158: '500' }, inputs: [lane], outputs: [outs[0], coin({ address: VENDOR, amount: '5000', tokenid: USDW, storestate: true }), outs[2]] });
  add({ name: 'NEG_disp_ADMIT_too_much_stock_for_bond', expect: false, script: scripts.disp, input: 0, state: { ...st, 158: '1001' }, inputs: [lane], outputs: [coin({ address: VENDOR, amount: '1001', tokenid: CHIP, storestate: true }), outs[1], coin({ address: DISP, amount: '998999', tokenid: CHIP })] });
}

// ---- SWAP (trustless savings -> checking)
{
  const s = randomBytes(32), h = O.hex(sha(s)), SEL = rnd(), BUY = rnd(), DL = BLOCK + 100;
  const text = B.swapScript(h, SEL, BUY, DL);
  const lock = coin({ coinid: rnd(), address: await addressOf(text), amount: '200', tokenid: USDW });
  add({ name: 'swap_CLAIM_with_secret', script: text, input: 0, state: { 210: O.hex(s) }, inputs: [lock], outputs: [coin({ address: SEL, amount: '200', tokenid: USDW })] });
  add({ name: 'NEG_swap_CLAIM_wrong_secret', expect: false, script: text, input: 0, state: { 210: rnd() }, inputs: [lock], outputs: [coin({ address: SEL, amount: '200', tokenid: USDW })] });
  add({ name: 'NEG_swap_CLAIM_redirected', expect: false, script: text, input: 0, state: { 210: O.hex(s) }, inputs: [lock], outputs: [coin({ address: rnd(), amount: '200', tokenid: USDW })] });
  add({ name: 'swap_REFUND_after_deadline', script: text, input: 0, block: DL + 1, state: {}, inputs: [lock], outputs: [coin({ address: BUY, amount: '200', tokenid: USDW })] });
  add({ name: 'NEG_swap_REFUND_before_deadline', expect: false, script: text, input: 0, state: {}, inputs: [lock], outputs: [coin({ address: BUY, amount: '200', tokenid: USDW })] });
}

// ------------------------------------------------------------------- run in-process on the node jar
const casesFile = join(SCRATCH, 'balance-cases.json');
writeFileSync(casesFile, JSON.stringify(cases));
const results = JSON.parse(execFileSync(JAVA, ['-cp', CP, 'KissRun', casesFile], { maxBuffer: 1 << 27 }).toString());
const byName = Object.fromEntries(results.map((r) => [r.name, r]));
const table = cases.map((c) => {
  const r = byName[c.name]; const expect = c.expect === undefined ? true : c.expect;
  return { name: c.name, instructions: r.instructions, success: r.success, expected: expect, asExpected: r.success === expect, exception: r.exception ? String(r.exception).slice(0, 180) : '' };
});
for (const row of table) console.log(`${row.asExpected ? 'ok ' : 'BAD'} ${row.name.padEnd(48)} instr=${String(row.instructions).padStart(4)} success=${row.success}${row.exception ? ' | ' + row.exception : ''}`);

// ------------------------------------------------------------------- live-node cross-check of the D1 core
const coreText = B.d1CoreForRunscript({ capAtoms: PAR.capAtoms, awindow: PAR.awindow });
const coreState = { 120: O.hex(REC0), 16: d1.state[16], 18: d1.state[18], 19: d1.state[19], 27: d1.state[27], 29: String(BLOCK) };
const coreLive = await runscript(coreText, { state: coreState });
const coreBad = await runscript(coreText, { state: { ...coreState, 19: O.hex(message({ i: 5 })) } });
const coreInProcess = JSON.parse(execFileSync(JAVA, ['-cp', CP, 'KissRun', (writeFileSync(join(SCRATCH, 'balance-core.json'), JSON.stringify([{ name: 'core', script: coreText, input: 0, block: BLOCK, state: coreState, inputs: [coin({ coinid: rnd(), address: rnd() })], outputs: [] }])), join(SCRATCH, 'balance-core.json'))], { maxBuffer: 1 << 26 }).toString())[0];
console.log('D1 core live runscript:', coreLive.instructions, coreLive.success, '| in-process:', coreInProcess.instructions, coreInProcess.success, '| refusal (reused key index):', coreBad.success);

saveReceipt('balance_covenant_branches', {
  purpose: 'Instruction cost and refusal behaviour of every chip-balance covenant branch (in-process on the node jar) plus template checks and a live-node runscript count of the defund signature core',
  node, jar: 'DevNodesSet/9101/minima.jar (1.0.45.15)', method: 'java/KissRun.java: new Contract per input + setGlobals + run, as TxPoWChecker', timestamp: new Date().toISOString(),
  parameters: Object.fromEntries(Object.entries(PAR).map(([k, v]) => [k, String(v)])),
  addresses: { VAULT, ACC, VENDOR, DISP, HELPER }, keyTree: { leaves: LEAVES, rootSum: String(ROOTSUM), proofChars: proofOf(6).length },
  templateChecks, scriptChars: Object.fromEntries(Object.entries(scripts).map(([k, v]) => [k, v.length])),
  d1CoreCrossCheck: { liveRunscript: { instructions: coreLive.instructions, success: coreLive.success }, inProcess: { instructions: coreInProcess.instructions, success: coreInProcess.success }, liveRefusalReusedKey: { success: coreBad.success, instructions: coreBad.instructions } },
  table, badRows: table.filter((t) => !t.asExpected).length,
});

// ------------------------------------------------------------------- annotated script copies
const pretty = (s) => s.replace(/ (IF|ELSEIF|ELSE|ENDIF|WHILE|ENDWHILE|RETURN|ASSERT|LET) /g, '\n$1 ');
const rows = (pred) => table.filter(pred).map((t) => `//   ${t.name}: ${t.instructions} instructions, success=${t.success} (expected ${t.expected})`).join('\n');
const head = (name, purpose, ports) => [`// ${name}.kiss (chip-balance model, Phase 1 redo, docs/chip-balance-design.md)`, `// Purpose: ${purpose}`, `// Ports: ${ports}`,
  `// Measured: measure/receipts/balance_covenant_branches.json (node ${node.version} jar in-process; templates and clean-invariance on the live node).`,
  '// Placeholders in the measured copy: CHIP / USDw token ids, BURN / SUCCESSOR addresses and the helper owner tag are random test values;',
  '// VAULT, CHIPACC, VENDOR, DISP and the helper body hash are the real addresses of these exact texts.', '// Measured branches:'].join('\n');
const W = (file, name, purpose, ports, pred, text) => writeFileSync(join(KISS_DIR, file), head(name, purpose, ports) + '\n' + rows(pred) + '\n\n' + pretty(text) + '\n');
W('chip_account.kiss', 'chip_account', 'one coin per chip (1 CHIP): FUND, D1 defund verify with 5 LX16 helpers, funding-mismatch / cap / clone evidence, owner revoke, owner payout change, vendor revoke, retirement',
  '9 op; 120 account record (249 bytes, layout in measure/balance-covenants.mjs); 16/17/18 LX16 R, C, chunk digests; 19 voucher message (52 bytes); 27 key MMR proof; 29 claimed block; 97 helper offset; 10-15, 26, 28 clone proof; 122 new payout',
  (t) => /acc_/.test(t.name), scripts.acc);
W('balance_vault.kiss', 'balance_vault', 'shared USDw reserve: deposits, lanes with a per-lane daily outflow brake, PAY at defund settle, MERGE, SPLIT, retirement to a successor after 5 years dormant',
  '9 op; 180 lane window start; 181 lane window use; 29 claimed block; 120 / 201 / 202 release-coin summary', (t) => /vault|D2_vault/.test(t.name), scripts.vault);
W('vendor_gate_and_bond.kiss', 'vendor_gate_and_bond', 'vendor gate (CHIP stock): REGISTER a chip, GATE defunds per window in proportion to the bond, SLASH on evidence, withdrawal, retirement; bond coins (USDw) pay penalties into the vault',
  '9 op; 150 vendor key; 151 vendor payout; 152 window start; 153 window use; 154 bond total (atoms); 155 incidents; 156 withdraw request; 157 penalty / withdrawal (atoms); 120 / 201 / 203 release-coin summary', (t) => /gate|bond|EV2/.test(t.name), scripts.vendor);
W('release_q_template.kiss', 'release_q_template', 'release coin Q: LET h=<summary hash> LET acc=<CHIPACC> LET vlt=<VAULT> + body. Carries a verified defund or evidence from D1 to the small settle transaction D2',
  '9 op (10 defund, 30 evidence); 120 new account record; 201 extra (flag, amount); 150 vendor key pinned by the gate', (t) => /Q_/.test(t.name), B.qScript('0x<summary-hash>', '0x<CHIPACC>', '0x<VAULT>', 'CHIPID'));
W('chip_dispenser.kiss', 'chip_dispenser', 'CHIP marker dispenser: ADMIT a vendor (CHIP stock proportional to its bond, bond >= minimum)', '9 op; 150-156 new gate state; 158 stock released', (t) => /disp_/.test(t.name), scripts.disp);
W('swap_htlc.kiss', 'swap_htlc', 'trustless savings -> checking swap (crux 1 option a4): CLAIM with the buyer chip receipt secret, REFUND after the deadline', '210+@INPUT secret', (t) => /swap_/.test(t.name), B.swapScript('0x<h>', '0x<seller>', '0x<buyer>', '<deadline>'));
W('helper_body.kiss', 'helper_body', 'LX16 chunk verifier (51 positions per helper, 5 helpers per signature), reached through MAST at the owner helper address; guarded by GETINTOK(0) EQ CHIP', '16/17/18 LX16 R, C, chunk digests; 97 helper offset', (t) => /helper/.test(t.name), scripts.helperBody);
writeFileSync(join(KISS_DIR, 'd1_core_runscript.kiss'), [`// d1_core_runscript.kiss: the D1 defund signature core without transaction functions, so the LIVE node can count it with runscript.`,
  `// Live runscript (node ${node.version}): ${coreLive.instructions} instructions, success=${coreLive.success}; in-process: ${coreInProcess.instructions}, success=${coreInProcess.success}; reused key index refused live: success=${coreBad.success}.`,
  '// Receipt: measure/receipts/balance_covenant_branches.json (d1CoreCrossCheck).', '', pretty(coreText), ''].join('\n'));
console.log('bad rows:', table.filter((t) => !t.asExpected).length);
