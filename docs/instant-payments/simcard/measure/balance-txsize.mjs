// Transaction sizes for the chip-balance model: FUND, D1 (defund verify), D2 (defund settle), evidence, swap.
// Built on the lab node with the local builder (txncreate / txninput / txnoutput / txnstate / txnscript / txnbasics /
// txnexport) and deleted afterwards (txndelete). Nothing is signed or posted.
// Method as Phase 1 (txsize.mjs): one REAL provable coin with stored state stands in for the first covenant input
// (gives the true coin + MMR proof size on today's chain); further covenant inputs and helpers are added from the
// per-input sizes Phase 1 measured (txn-sizes.json); the header allowance is the phone-measured 1,200-byte constant.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rpc, nodeVersion, saveReceipt, RECEIPTS } from './rpc.mjs';
import * as O from './ots.mjs';
import * as B from './balance-covenants.mjs';

const node = await nodeVersion();
const P1 = JSON.parse(readFileSync(join(RECEIPTS, 'txn-sizes.json'), 'utf8')).results;
const BR = JSON.parse(readFileSync(join(RECEIPTS, 'balance_covenant_branches.json'), 'utf8'));
const REAL = '0x02D2DEA81E2F5CDBCC3D3278CC638EEC1E9DF8C2FC71F1D3C4BEEE718CFF7125'; // Winiwa token coin, 10 state ports
const TOKEN = '0xD4F5DD3546F25D327CBF2B6867E193CE5DB6491AC9C65BBDCECACA1A6688063F';
const ID = 'simcardbalance';
const X = '0x' + 'AB'.repeat(32);
const bytesOf = async () => { const e = await rpc(`txnexport id:${ID}`); if (!e.status) throw new Error('export failed ' + e.error); return e.response.data.length / 2 - 1; };
const fresh = async () => { await rpc(`txndelete id:${ID}`); if (!(await rpc(`txncreate id:${ID}`)).status) throw new Error('txncreate failed'); };
const ok = (r, what) => { if (!r.status) throw new Error(what + ' failed: ' + (r.error || JSON.stringify(r).slice(0, 200))); return r; };
const hx = (n) => O.hex(randomBytes(n));
const HEADER = 1200;
const covenantInput = P1.tokenCoin.coinBytesInTxn + P1.tokenCoin.coinProofBytes; // 442 + 1,412 per extra covenant coin with state
const helperInput = P1.derived.helperInputBytes; // 1,102
const scripts = {
  acc: B.accScript({ chip: X, usdw: X, vault: X, burn: X, helperHash: X, awindow: 12096, capAtoms: 100000000000n, minFund: 1, retireAge: 1051200 }),
  vault: B.vaultScript({ chip: X, usdw: X, successor: X, vwindow: 1728, betaPct: 10, floorAtoms: 100000000000n, dormancy: 3153600 }),
  vendor: B.vendorScript({ chip: X, usdw: X, acc: X, vault: X, burn: X, vwindow: 12096, rhoPct: 100, vfloorAtoms: 100000000000n, penaltyAtoms: 1000000000000n, freezeAt: 3, maxWl: 500000000000n, wdelay: 51840, abandon: 1261440 }),
  q: B.qScript(X, X, X, X), helperBody: B.helperBody({ chip: X }), helperAddr: B.helperAddressScript(X, X), swap: B.swapScript(X, X, X, 2340100),
};

async function build({ name, extraCovenantInputs = 0, helpers = 0, outputs = 1, state = {}, witness = [] }) {
  await fresh();
  ok(await rpc(`txninput id:${ID} coinid:${REAL}`), 'txninput');
  ok(await rpc(`txnbasics id:${ID}`), 'txnbasics');
  for (let i = 0; i < outputs; i++) ok(await rpc(`txnoutput id:${ID} amount:0.5 address:${hx(32)} tokenid:${TOKEN} storestate:${i === 0}`), 'out');
  for (const [p, v] of Object.entries(state)) ok(await rpc(`txnstate id:${ID} port:${p} value:${v}`), 'state ' + p);
  if (witness.length) ok(await rpc(`txnscript id:${ID} scripts:${JSON.stringify(Object.fromEntries(witness.map((w) => [w, ''])))}`), 'txnscript');
  const body = await bytesOf();
  const total = body + extraCovenantInputs * covenantInput + helpers * helperInput - P1.tokenCoin.scriptChars + HEADER;
  const row = { name, measuredBodyBytes: body, extraCovenantInputs, helpers, witnessScriptChars: witness.reduce((a, w) => a + w.length, 0), headerAllowance: HEADER,
    totalTxPoWBytesEstimate: total, fits64KB: total <= 65536, fitsCoreIpcReply: total * 2 + 4000 <= 100000 };
  console.log(name, JSON.stringify(row));
  return row;
}

const lx = O.lxKeygen({ n: 16, chunks: 5, positions: 255 });
const sig = O.lxSign(lx, O.sha2(randomBytes(32)));
const rec = hx(249), msg = hx(52);
const mmrProof1024 = hx(406); // Phase 1 receipt device_root_proof_sizes.json: 406 bytes for 1,024 keys
const rows = [];
try {
  rows.push(await build({ name: 'FUND (account + user USDw; outputs: account, vault deposit, change)', extraCovenantInputs: 0, outputs: 3,
    state: { 9: 1, 120: rec }, witness: [scripts.acc] }));
  rows.push(await build({ name: 'D1 defund verify (account + 5 helpers; output: release coin)', helpers: 5, outputs: 1,
    state: { 9: 2, 97: 1, 29: 2340000, 16: O.hex(sig.R), 17: O.hex(sig.C), 18: O.hex(Buffer.concat(sig.chunkDigests)), 19: msg, 27: mmrProof1024 },
    witness: [scripts.acc, scripts.helperBody, scripts.helperAddr] }));
  rows.push(await build({ name: 'D2 defund settle (release coin + vendor gate + vault lane; 4 outputs)', extraCovenantInputs: 2, outputs: 4,
    state: { 9: 10, 29: 2340000, 120: rec, 201: hx(9), 202: X, 203: X, 150: X, 151: X, 152: 2340000, 153: 1, 154: 1, 155: 0, 156: 0, 180: 2340000, 181: 1 },
    witness: [scripts.q, scripts.vendor, scripts.vault] }));
  rows.push(await build({ name: 'Evidence settle (release coin + gate + bond coin; 4 outputs)', extraCovenantInputs: 2, outputs: 4,
    state: { 9: 30, 29: 2340000, 120: rec, 201: hx(9), 202: X, 203: X, 150: X, 151: X, 152: 2340000, 153: 1, 154: 1, 155: 1, 156: 0, 157: 1 },
    witness: [scripts.q, scripts.vendor] }));
  rows.push(await build({ name: 'Swap claim (swap coin; output seller)', outputs: 1, state: { 210: hx(32) }, witness: [scripts.swap] }));
} finally {
  await rpc(`txndelete id:${ID}`);
}
const d1 = rows[1].totalTxPoWBytesEstimate, d2 = rows[2].totalTxPoWBytesEstimate;
saveReceipt('balance_txn_sizes', {
  purpose: 'Chip-balance transaction sizes (FUND, D1, D2, evidence settle, swap claim) against the 65,536-byte TxPoW cap and the 100,000-character Core IPC reply cap',
  node, timestamp: new Date().toISOString(),
  method: 'one real provable coin with stored state + measured state/witness bytes; extra covenant inputs at the Phase 1 per-input size (' + covenantInput + ' B) and helpers at ' + helperInput + ' B; header allowance 1,200 B',
  rows, defundTotalBytes: d1 + d2,
});
console.log('defund D1 + D2 =', d1 + d2);
