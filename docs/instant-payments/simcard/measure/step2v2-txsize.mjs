// Step 2, version 2 (Instant payments): transaction sizes for load, registration, withdrawal (offload), close and
// merge with the revised texts (no limit, no retirement), against the 65,536-byte TxPoW cap and the 100,000-character
// Core companion reply cap. Receipt: measure/receipts/step2v2_txn_sizes.json.
//
// Built on the lab node with the local builder (txncreate / txninput / txnoutput / txnstate / txnscript /
// txnbasics / txnexport) and deleted afterwards (txndelete). Nothing is signed or posted.
// Method unchanged from v1 (step2-txsize.mjs): one REAL provable token coin with stored state stands in for the first
// input (true coin + MMR proof size on today's chain); further covenant inputs are added at the per-input size Phase 1
// measured (txn-sizes.json: 1,854 bytes for a token coin with 10 state ports, an upper bound for a vault coin); the
// stand-in's own witness script is swapped for the real one (covenant texts added with txnscript, a wallet key script
// counted at its length); one Minima signature = measured witness growth (java/Step2SigSize.java); header allowance
// 1,200 bytes (phone-measured constant). v2 state carries no ports 4, 5, 6 (reserved, unset).
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { rpc, nodeVersion, saveReceipt, RECEIPTS } from './rpc.mjs';
import * as S from './step2v2-covenants.mjs';

const node = await nodeVersion();
const SCRATCH = process.env.SIMCARD_SCRATCH || 'C:/Users/Charles/AppData/Local/Temp/claude/c--Users-Charles-Documents-Stables/c983ae49-c861-4c13-a438-a127ecd8670d/scratchpad';
const JAVA = 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot/bin/java.exe';
const JAR = 'C:/Users/Charles/Documents/Crypto/Minima/Nodes/DevNodesSet/9101/minima.jar';
const P1 = JSON.parse(readFileSync(join(RECEIPTS, 'txn-sizes.json'), 'utf8')).results;
const BR = JSON.parse(readFileSync(join(RECEIPTS, 'step2v2_covenant_branches.json'), 'utf8'));
const REAL = P1.tokenCoin.coinid;                       // Winiwa token coin, 10 state ports (Phase 1)
const WIN = '0xD4F5DD3546F25D327CBF2B6867E193CE5DB6491AC9C65BBDCECACA1A6688063F';
const ID = 'simcardstep2v2';
const hx = (n = 32) => '0x' + randomBytes(n).toString('hex').toUpperCase();
const ok = (r, what) => { if (!r.status) throw new Error(what + ' failed: ' + (r.error || JSON.stringify(r).slice(0, 200))); return r; };
const bytesOf = async () => { const e = ok(await rpc(`txnexport id:${ID}`), 'txnexport'); return e.response.data.length / 2 - 1; };
const fresh = async () => { await rpc(`txndelete id:${ID}`); ok(await rpc(`txncreate id:${ID}`), 'txncreate'); };

const sig = JSON.parse(execFileSync(JAVA, ['-cp', [JAR, join(SCRATCH, 'jrun3')].join(';'), 'Step2SigSize'], { maxBuffer: 1 << 20 }).toString());
const SIG = sig.addedByOneSignature;
const HEADER = 1200;
const PER_INPUT = P1.tokenCoin.coinBytesInTxn + P1.tokenCoin.coinProofBytes;   // 1,854
const WALLET_SCRIPT = 'RETURN SIGNEDBY(0x' + 'AB'.repeat(32) + ')';          // a Savings address script (length only)
const REGADDR = BR.texts.reg.address, VAULT = BR.texts.vault.address, REGH = BR.texts.regh.address, VAULTH = BR.texts.vaulth.address;
const clean = async (text) => (await rpc('runscript script:"' + text.replace(/"/g, '\\"') + '"')).response.clean.script;
const T = {
  reg: await clean(S.regScript()), regh: await clean(S.regHashScript()),
  vault: await clean(S.vaultScript({ regAddress: REGADDR })), vaulth: await clean(S.vaultScript({ regAddress: REGH })),
};

const acct = hx(), key = hx(), pay = hx();
const regState = { 0: S.MAGIC, 1: acct, 2: key, 3: pay, 12: WIN };                         // registration: 5 ports
const loadState = { 0: S.MAGIC, 1: acct, 3: pay };                                        // plain load: 3 ports
const wState = { ...regState, 7: '25.12345678', 8: '1', 10: '74.87654322', 11: '0.00000001' };  // withdrawal: 9 ports

async function build({ name, extraInputs = 0, outputs, state = {}, covenantScripts = [], walletScripts = 0, signatures = 0 }) {
  await fresh();
  const inp = ok(await rpc(`txninput id:${ID} coinid:${REAL}`), 'txninput');
  ok(await rpc(`txnbasics id:${ID}`), 'txnbasics');
  for (const o of outputs) ok(await rpc(`txnoutput id:${ID} amount:${o.amount} address:${o.address} tokenid:${o.tokenid || WIN} storestate:${!!o.keep}`), 'txnoutput');
  for (const [p, v] of Object.entries(state)) ok(await rpc(`txnstate id:${ID} port:${p} value:${v}`), 'txnstate ' + p);
  if (covenantScripts.length) ok(await rpc(`txnscript id:${ID} scripts:${JSON.stringify(Object.fromEntries(covenantScripts.map((w) => [w, ''])))}`), 'txnscript');
  const body = await bytesOf();
  const scriptSwap = -P1.tokenCoin.scriptChars + walletScripts * WALLET_SCRIPT.length;
  const total = body + extraInputs * PER_INPUT + scriptSwap + signatures * SIG + HEADER;
  const row = { name, measuredBodyBytes: body, extraInputs, perExtraInputBytes: PER_INPUT, standInScriptRemoved: P1.tokenCoin.scriptChars,
    covenantScriptChars: covenantScripts.reduce((a, s) => a + s.length, 0), walletScriptChars: walletScripts * WALLET_SCRIPT.length,
    signatures, signatureBytesEach: SIG, headerAllowance: HEADER, statePorts: Object.keys(state).length, outputs: outputs.length,
    totalTxPoWBytesEstimate: total, fits64KB: total <= 65536, fitsCoreIpcReply: total * 2 + 4000 <= 100000,
    standInCoin: inp.response.transaction.inputs[0].coinid };
  console.log(name.padEnd(70), String(total).padStart(6), 'bytes', row.fits64KB ? '' : 'OVER 64KB', row.fitsCoreIpcReply ? '' : 'over Core reply cap');
  return row;
}

const rows = [];
try {
  rows.push(await build({ name: 'LOAD first (load + registration; outputs: load, registration, change)',
    outputs: [{ address: VAULT, amount: '100', keep: true }, { address: REGADDR, amount: '0.00000001', keep: true }, { address: hx(), amount: '894.18899199' }],
    state: regState, walletScripts: 1, signatures: 1 }));
  rows.push(await build({ name: 'LOAD again (outputs: load, change)',
    outputs: [{ address: VAULT, amount: '100', keep: true }, { address: hx(), amount: '894.18899200' }],
    state: loadState, walletScripts: 1, signatures: 1 }));
  rows.push(await build({ name: 'REGISTER only (outputs: registration, change)',
    outputs: [{ address: REGADDR, amount: '0.00000001', keep: true }, { address: hx(), amount: '994.18899199' }],
    state: regState, walletScripts: 1, signatures: 1 }));
  for (const k of [1, 2, 5, 10, 20, 25, 30, 31]) {
    rows.push(await build({ name: `WITHDRAW design A, ${k} vault coin${k > 1 ? 's' : ''} (outputs: payout, change, registration)`, extraInputs: k,
      outputs: [{ address: pay, amount: '25.12345678' }, { address: VAULT, amount: '74.87654322' }, { address: REGADDR, amount: '0.00000001', keep: true }],
      state: wState, covenantScripts: [T.reg, T.vault], signatures: 1 }));
  }
  rows.push(await build({ name: 'WITHDRAW design A, last coin, no change (outputs: payout, registration)', extraInputs: 1,
    outputs: [{ address: pay, amount: '40' }, { address: REGADDR, amount: '0.00000001', keep: true }],
    state: { ...wState, 7: '40', 10: '0' }, covenantScripts: [T.reg, T.vault], signatures: 1 }));
  rows.push(await build({ name: 'WITHDRAW design C, 1 vault coin (no signature)', extraInputs: 1,
    outputs: [{ address: pay, amount: '25.12345678' }, { address: VAULTH, amount: '74.87654322' }, { address: REGH, amount: '0.00000001', keep: true }],
    state: { ...wState, 2: hx() }, covenantScripts: [T.regh, T.vaulth], signatures: 0 }));
  rows.push(await build({ name: 'CLOSE (registration dust back to the owner)',
    outputs: [{ address: pay, amount: '0.00000001' }], state: { ...regState, 8: '2', 11: '0.00000001' }, covenantScripts: [T.reg], signatures: 1 }));
  for (const k of [2, 10]) {
    rows.push(await build({ name: `MERGE ${k} vault coins (no signature)`, extraInputs: k - 1,
      outputs: [{ address: VAULT, amount: '30.75000001' }], state: { 8: '3', 10: '30.75000001' }, covenantScripts: [T.vault], signatures: 0 }));
  }
} finally {
  await rpc(`txndelete id:${ID}`);
}
const maxA = rows.filter((r) => /design A, \d+ vault/.test(r.name));
const v1 = JSON.parse(readFileSync(join(RECEIPTS, 'step2_txn_sizes.json'), 'utf8'));
const v1By = Object.fromEntries(v1.rows.map((r) => [r.name, r.totalTxPoWBytesEstimate]));
for (const r of rows) if (v1By[r.name] != null) r.v1TotalBytes = v1By[r.name];
const receipt = {
  purpose: 'Step 2 version 2 transaction sizes (load, registration, withdrawal A and C, close, merge) against the 65,536-byte TxPoW cap and the 100,000-character Core IPC reply cap',
  node, timestamp: new Date().toISOString(),
  method: 'one real provable token coin with stored state + measured outputs/state/witness scripts (txnexport); extra covenant inputs at the Phase 1 per-input size (1,854 B, an upper bound); stand-in script swapped for the real one; one Minima signature = measured witness growth (in-process TreeKey, default 64x3); header allowance 1,200 B. Core reply check: 2 x bytes + 4,000 <= 100,000 (hex reply plus framing, the chip-balance rule). Rows named as in v1 carry v1TotalBytes.',
  signature: sig,
  limits: {
    maxVaultCoinsPerWithdrawalUnder64KB: Math.max(...maxA.filter((r) => r.fits64KB).map((r) => r.extraInputs)),
    maxVaultCoinsPerWithdrawalUnderCoreReply: Math.max(0, ...maxA.filter((r) => r.fitsCoreIpcReply).map((r) => r.extraInputs)),
  },
  rows,
};
console.log(JSON.stringify(receipt.limits));
console.log('receipt', saveReceipt('step2v2_txn_sizes', receipt));
