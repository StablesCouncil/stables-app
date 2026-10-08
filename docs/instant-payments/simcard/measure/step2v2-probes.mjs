// Step 2, version 2 (Instant payments): probes behind the revised design, dry runs only.
// Receipt: measure/receipts/step2v2_probes.json.
//  1. 8-decimal token arithmetic in-process (java/KissRunScaled.java, scale 36): GETINAMT, @AMOUNT, SUMINPUTS, and the
//     doctrine's trap form VERIFYOUT(@AMOUNT) under keepstate (re-run of v1; the @COINAGE probe is dropped: no v2
//     text reads the block or a coin's age).
//  2. SUMINPUTS exists and runs on the LIVE node (1.0.45.15) through runscript.
//  3. Monotonic by construction: the v2 texts read none of the globals that make a script block-dependent
//     (@BLOCK, @BLOCKMILLI, @COINAGE; src/org/minima/kissvm/Contract.java getGlobal), so a valid withdrawal can never
//     go stale in the mempool.
//  4. Trap probes: can any coin that reaches the vault be stuck because of its own state or its token? And what a
//     malformed registration (missing a pinned port) costs.
// Nothing is posted, signed or written to any node or wallet.
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runscript, nodeVersion, saveReceipt, RECEIPTS } from './rpc.mjs';
import * as S from './step2v2-covenants.mjs';

const node = await nodeVersion();
const SCRATCH = process.env.SIMCARD_SCRATCH || 'C:/Users/Charles/AppData/Local/Temp/claude/c--Users-Charles-Documents-Stables/c983ae49-c861-4c13-a438-a127ecd8670d/scratchpad';
const JAVA = 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot/bin/java.exe';
const CP = ['C:/Users/Charles/Documents/Crypto/Minima/Nodes/DevNodesSet/9101/minima.jar', join(SCRATCH, 'jrun3')].join(';');
const BR = JSON.parse(readFileSync(join(RECEIPTS, 'step2v2_covenant_branches.json'), 'utf8'));
const WIN = '0xD4F5DD3546F25D327CBF2B6867E193CE5DB6491AC9C65BBDCECACA1A6688063F';
const REG = BR.texts.reg.address, VAULT = BR.texts.vault.address;
const REG_TEXT = S.regScript(), VAULT_TEXT = S.vaultScript({ regAddress: REG });
const hx = () => '0x' + randomBytes(32).toString('hex').toUpperCase();
const coin = (amount, extra = {}) => ({ coinid: '0x01', address: '0xAA', amount, tokenid: WIN, ...extra });

// 1. arithmetic (as v1)
const arith = [
  { name: 'GETINAMT reads 8-decimal token units', script: 'RETURN GETINAMT(0) EQ 25.12345678', inputs: [coin('25.12345678')], expect: true },
  { name: '@AMOUNT reads 8-decimal token units', script: 'RETURN @AMOUNT EQ 25.12345678', inputs: [coin('25.12345678')], expect: true },
  { name: 'VERIFYOUT(@AMOUNT) under keepstate at 8 decimals (the doctrine trap form)', script: 'RETURN VERIFYOUT(0 @ADDRESS @AMOUNT @TOKENID TRUE)',
    inputs: [coin('25.12345678')], outputs: [{ address: '0xAA', amount: '25.12345678', tokenid: WIN, storestate: true }], expect: 'observe' },
  { name: 'SUMINPUTS adds 8-decimal amounts exactly', script: 'RETURN SUMINPUTS(@TOKENID) EQ 100.00000001',
    inputs: [coin('25.12345678'), coin('74.87654323', { coinid: '0x02' })], expect: true },
  { name: 'SUMINPUTS one atom off is refused', script: 'RETURN SUMINPUTS(@TOKENID) EQ 100.00000002',
    inputs: [coin('25.12345678'), coin('74.87654323', { coinid: '0x02' })], expect: false },
];

// 4. trap probes, on the real v2 texts, every input run
const acct = hx(), key = hx(), pay = hx();
const prev = { 0: S.MAGIC, 1: acct, 2: key, 3: pay, 12: WIN };
const reg = (state = prev, extra = {}) => ({ coinid: hx(), address: REG, amount: '0.00000001', tokenid: WIN, storestate: true, state, created: 2300000, ...extra });
const wst = (w, c, t = WIN, p = prev) => ({ 0: p[0], 1: p[1], 2: p[2], 3: p[3], 7: w, 8: '1', 10: c, 11: '0.00000001', 12: t });
const traps = [
  { name: 'TRAP vault coin carrying junk state (ports 8, 10, 12 set to hostile values) is still withdrawable',
    note: 'The vault reads only the spending transaction\'s state, never a coin\'s own stored state, so no stored state can lock a vault coin.',
    inputs: [reg(), { coinid: hx(), address: VAULT, amount: '10', tokenid: WIN, storestate: true, state: { 8: '4', 10: '-1', 12: '0x00', 1: hx() }, created: 2339000 }],
    outputs: [{ address: pay, amount: '10', tokenid: WIN, storestate: false }, { address: REG, amount: '0.00000001', tokenid: WIN, storestate: true }],
    state: wst('10', '0'), expect: true },
  { name: 'TRAP native MINIMA sent to the vault is withdrawable (registration holding Winiwa dust governs 0x00)',
    note: 'Any token that reaches the vault can leave: a registration for that token id is free to create.',
    inputs: [reg({ ...prev, 12: '0x00' }), { coinid: hx(), address: VAULT, amount: '3.5', tokenid: '0x00', storestate: false, created: 2339000 }],
    outputs: [{ address: pay, amount: '3.5', tokenid: '0x00', storestate: false }, { address: REG, amount: '0.00000001', tokenid: WIN, storestate: true }],
    state: wst('3.5', '0', '0x00', { ...prev, 12: '0x00' }), expect: true },
  { name: 'TRAP a registration coin stored WITHOUT port 12 cannot withdraw (refused; it cannot touch the vault)',
    note: 'App rule: create a registration only with ports 0, 1, 2, 3 and 12 set. A malformed one is refused for withdrawals; its owner can still close it (next probe).',
    inputs: [reg({ 0: S.MAGIC, 1: acct, 2: key, 3: pay }), { coinid: hx(), address: VAULT, amount: '10', tokenid: WIN, storestate: false, created: 2339000 }],
    outputs: [{ address: pay, amount: '10', tokenid: WIN, storestate: false }, { address: REG, amount: '0.00000001', tokenid: WIN, storestate: true }],
    state: wst('10', '0'), expect: false },
  { name: 'TRAP a registration coin stored WITHOUT port 12 can still be CLOSED by its owner',
    note: 'v2 puts CLOSE before the state pins, so the owner recovers the atom of a malformed registration (only ports 2 and 3 are needed).',
    inputs: [reg({ 0: S.MAGIC, 1: acct, 2: key, 3: pay })],
    outputs: [{ address: pay, amount: '0.00000001', tokenid: WIN, storestate: false }],
    state: { 0: S.MAGIC, 1: acct, 2: key, 3: pay, 8: '2', 11: '0.00000001' }, expect: true },
  { name: 'TRAP a registration coin holding 100 Winiwa by mistake: CLOSE returns all of it to the owner',
    note: 'Whatever amount sits in a registration coin, its owner gets all of it back (STATE(11) must equal @AMOUNT).',
    inputs: [reg(prev, { amount: '100' })],
    outputs: [{ address: pay, amount: '100', tokenid: WIN, storestate: false }],
    state: { ...prev, 8: '2', 11: '100' }, expect: true },
];
const cases = [];
for (const c of arith) cases.push({ group: 'arith', name: c.name, expect: c.expect, run: [{ name: c.name, script: c.script, inputs: c.inputs, outputs: c.outputs || [], input: 0 }] });
for (const c of traps) {
  const run = c.inputs.map((inp, i) => ({ name: c.name + '#in' + i, script: inp.address === REG ? REG_TEXT : VAULT_TEXT, input: i, inputs: c.inputs, outputs: c.outputs, state: c.state, signatures: [key], block: 2340000 }));
  cases.push({ group: 'trap', name: c.name, note: c.note, expect: c.expect, run });
}
const flat = cases.flatMap((c) => c.run);
const file = join(SCRATCH, 'step2v2-probes.json');
writeFileSync(file, JSON.stringify(flat));
const res = JSON.parse(execFileSync(JAVA, ['-cp', CP, 'KissRunScaled', file], { maxBuffer: 1 << 24 }).toString());
const byName = Object.fromEntries(res.map((r) => [r.name, r]));
const inProcess = cases.map((c) => {
  const per = c.run.map((r) => byName[r.name]);
  const success = per.every((r) => r.success);
  return { group: c.group, name: c.name, note: c.note, expected: c.expect, success, perInput: per.map((r) => ({ success: r.success, instructions: r.instructions, monotonic: r.monotonic, exception: r.exception ? r.exception.slice(0, 160) : '' })),
    asExpected: c.expect === 'observe' ? null : success === c.expect };
});
for (const r of inProcess) console.log((r.asExpected === false ? 'BAD ' : 'ok  ') + r.name + ' -> ' + r.success + ' ' + r.perInput.map((p) => p.instructions + (p.success ? '' : '!') + (p.exception ? ' [' + p.exception + ']' : '')).join('/'));

// 2. SUMINPUTS on the live node
const liveSum = await runscript('RETURN SUMINPUTS(0x00) EQ 0');
// 3. monotonic by construction
const NON_MONOTONIC = ['@BLOCK', '@BLOCKMILLI', '@COINAGE'];
const scan = Object.fromEntries([['registration_v2', REG_TEXT], ['vault_v2', VAULT_TEXT], ['registration_hashchain_v2', S.regHashScript()]].map(([k, t]) =>
  [k, { nonMonotonicGlobalsRead: NON_MONOTONIC.filter((g) => new RegExp(g.replace('@', '@') + '(?![A-Z])').test(t)) }]));
const receipt = {
  purpose: 'Probes behind the step 2 version 2 design: 8-decimal arithmetic, SUMINPUTS on the live node, monotonic texts, and whether any coin can be trapped at the vault',
  node, timestamp: new Date().toISOString(),
  inProcess,
  liveSuminputs: { script: 'RETURN SUMINPUTS(0x00) EQ 0', parseok: liveSum.parseok, success: liveSum.success, instructions: liveSum.instructions,
    note: 'runscript runs on an empty transaction, so the sum is 0: this proves the function exists and runs on 1.0.45.15, not its arithmetic (that is the in-process rows).' },
  monotonicByConstruction: { rule: 'Contract.getGlobal marks a script non-monotonic when it reads @BLOCK, @BLOCKMILLI or @COINAGE (src/org/minima/kissvm/Contract.java, 1.1.2.6); a monotonic transaction is script-checked once and never goes stale (TxPoWChecker.checkTxPoWScripts, NIOMessage).', scan,
    measured: 'every input of every case in step2v2_covenant_branches.json reports monotonic=true (summary.everyInputMonotonic)' , everyInputMonotonic: BR.summary.everyInputMonotonic },
  finding: 'Unchanged from v1: VERIFYOUT(@AMOUNT) under keepstate PASSES in-process at scale 36, so this method does not reproduce the doctrine\'s recorded on-chain failure; the v2 texts keep the pinned-port form (STATE(11) EQ @AMOUNT, then VERIFYOUT(... STATE(11) ...)).',
};
console.log(JSON.stringify({ liveSum: receipt.liveSuminputs.success, scan }, null, 1));
console.log('receipt', saveReceipt('step2v2_probes', receipt));
