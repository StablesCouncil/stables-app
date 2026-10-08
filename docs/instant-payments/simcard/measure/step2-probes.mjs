// Step 2 (Instant payments): small probes behind design choices, dry runs only.
//  1. 8-decimal token arithmetic in-process (java/KissRunScaled.java, scale 36): GETINAMT, @AMOUNT, SUMINPUTS,
//     @COINAGE, and the doctrine's trap form VERIFYOUT(@AMOUNT) under keepstate.
//  2. SUMINPUTS exists and runs on the LIVE node (1.0.45.15) through runscript.
// Nothing is posted, signed or written to any node or wallet.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runscript, nodeVersion, saveReceipt } from './rpc.mjs';

const node = await nodeVersion();
const SCRATCH = process.env.SIMCARD_SCRATCH || 'C:/Users/Charles/AppData/Local/Temp/claude/c--Users-Charles-Documents-Stables/c983ae49-c861-4c13-a438-a127ecd8670d/scratchpad';
const JAVA = 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot/bin/java.exe';
const CP = ['C:/Users/Charles/Documents/Crypto/Minima/Nodes/DevNodesSet/9101/minima.jar', join(SCRATCH, 'jrun2')].join(';');
const WIN = '0xD4F5DD3546F25D327CBF2B6867E193CE5DB6491AC9C65BBDCECACA1A6688063F';
const coin = (amount, extra = {}) => ({ coinid: '0x01', address: '0xAA', amount, tokenid: WIN, ...extra });
const cases = [
  { name: 'GETINAMT reads 8-decimal token units', script: 'RETURN GETINAMT(0) EQ 25.12345678', inputs: [coin('25.12345678')], expect: true },
  { name: '@AMOUNT reads 8-decimal token units', script: 'RETURN @AMOUNT EQ 25.12345678', inputs: [coin('25.12345678')], expect: true },
  { name: 'VERIFYOUT(@AMOUNT) under keepstate at 8 decimals (the doctrine trap form)', script: 'RETURN VERIFYOUT(0 @ADDRESS @AMOUNT @TOKENID TRUE)',
    inputs: [coin('25.12345678')], outputs: [{ address: '0xAA', amount: '25.12345678', tokenid: WIN, storestate: true }], expect: 'observe' },
  { name: 'SUMINPUTS adds 8-decimal amounts exactly', script: 'RETURN SUMINPUTS(@TOKENID) EQ 100.00000001',
    inputs: [coin('25.12345678'), coin('74.87654323', { coinid: '0x02' })], expect: true },
  { name: 'SUMINPUTS one atom off is refused', script: 'RETURN SUMINPUTS(@TOKENID) EQ 100.00000002',
    inputs: [coin('25.12345678'), coin('74.87654323', { coinid: '0x02' })], expect: false },
  { name: '@COINAGE = block - created, and marks the script non-monotonic', script: 'RETURN @COINAGE EQ 7', block: 100,
    inputs: [{ coinid: '0x01', address: '0xAA', amount: '1', tokenid: '0x00', created: 93 }], expect: true },
];
const file = join(SCRATCH, 'step2-probes.json');
writeFileSync(file, JSON.stringify(cases.map(({ expect, ...c }) => c)));
const res = JSON.parse(execFileSync(JAVA, ['-cp', CP, 'KissRunScaled', file]).toString());
const inProcess = cases.map((c, i) => ({ name: c.name, expected: c.expect, success: res[i].success, instructions: res[i].instructions, monotonic: res[i].monotonic,
  asExpected: c.expect === 'observe' ? null : res[i].success === c.expect }));
const liveSum = await runscript('RETURN SUMINPUTS(0x00) EQ 0');
const receipt = {
  purpose: 'Probes behind step 2 design choices: 8-decimal arithmetic in-process, and SUMINPUTS on the live node',
  node, timestamp: new Date().toISOString(),
  inProcess,
  liveSuminputs: { script: 'RETURN SUMINPUTS(0x00) EQ 0', parseok: liveSum.parseok, success: liveSum.success, instructions: liveSum.instructions,
    note: 'runscript runs on an empty transaction, so the sum is 0: this proves the function exists and runs on 1.0.45.15, not its arithmetic (that is the in-process rows).' },
  finding: 'The doctrine records VERIFYOUT(@AMOUNT) under keepstate failing on 8-decimal tokens on chain. In-process at scale 36 the same form PASSES, so this method does not reproduce that failure and does not identify its cause (the in-process token object may differ from what a real output carries, or the cause lay elsewhere, for example amount rounding at the RPC). Step 2 keeps the doctrine\'s pinned-port form anyway (defensive, 2 instructions). L1 observation, not an overturn.',
};
console.log(JSON.stringify(receipt, null, 1));
console.log('receipt', saveReceipt('step2_probes', receipt));
