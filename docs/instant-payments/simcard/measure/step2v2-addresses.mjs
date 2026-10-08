// Step 2, version 2: the FINAL covenant addresses, computed three ways, and the exact deployable bytes.
//  1. Live lab node 9101 (Minima 1.0.45.15), `runscript`: clean form + address (as step2v2-run.mjs recorded them).
//  2. In-process on the SAME node's jar (1.0.45.15): Contract.cleanScript + new Address(clean) (java/Step2Address.java).
//  3. In-process on the 1.1.2.6 source-build jar (work/scratch/minima-core-runtime-gap-2026-08-07/jar/minima.jar):
//     the same two calls, to show the clean form and the address do not depend on the node version.
// It also computes the address of the multi-line text AS GIVEN, to show it differs (the phantom-address trap of
// txn-building laws 2 and 3), and writes the exact single-line clean texts to kiss/step2/*_v2.clean.txt (no trailing
// newline) with their SHA-256, which the test records freeze.
// Nothing is posted, signed or written to any node or wallet.
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runscript, nodeVersion, saveReceipt, HERE, RECEIPTS } from './rpc.mjs';
import * as S from './step2v2-covenants.mjs';

const node = await nodeVersion();
const SCRATCH = process.env.SIMCARD_SCRATCH || 'C:/Users/Charles/AppData/Local/Temp/claude/c--Users-Charles-Documents-Stables/c983ae49-c861-4c13-a438-a127ecd8670d/scratchpad';
const JAVA = 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot/bin/java.exe';
const JAR_1045 = 'C:/Users/Charles/Documents/Crypto/Minima/Nodes/DevNodesSet/9101/minima.jar';
const GAP = join(HERE, '..', '..', 'scratch', 'minima-core-runtime-gap-2026-08-07');
const JAR_1126 = join(GAP, 'jar', 'minima.jar');
const LIB_1126 = ['bcprov-jdk15on-169.jar', 'bcpkix-jdk15on-169.jar', 'bcutil-jdk15on-169.jar', 'h2-2.4.240.jar'].map((f) => join(GAP, 'lib', f));
const KISS_DIR = join(HERE, '..', 'kiss', 'step2');
const BR = JSON.parse(readFileSync(join(RECEIPTS, 'step2v2_covenant_branches.json'), 'utf8'));
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

const REG_ADDR = BR.texts.reg.address;
const texts = [
  { name: 'registration_v2 (design A, adopted)', file: 'instant_registration_v2', text: S.regScript() },
  { name: 'vault_v2 (names the registration_v2 address)', file: 'instant_vault_v2', text: S.vaultScript({ regAddress: REG_ADDR }) },
  { name: 'registration_hashchain_v2 (design C, not adopted)', file: null, text: S.regHashScript() },
  { name: 'vault_hashchain_v2 (design C, not adopted)', file: null, text: S.vaultScript({ regAddress: BR.texts.regh.address }) },
];
const inFile = join(SCRATCH, 'step2v2-address-texts.json');
writeFileSync(inFile, JSON.stringify(texts.map(({ name, text }) => ({ name, text }))));
const runJar = (cp) => JSON.parse(execFileSync(JAVA, ['-cp', cp.join(';'), 'Step2Address', inFile], { maxBuffer: 1 << 24 }).toString());
const j1045 = runJar([JAR_1045, join(SCRATCH, 'jrun3')]);
const j1126 = runJar([JAR_1126, ...LIB_1126, join(SCRATCH, 'jrun3')]);

const rows = [];
for (let i = 0; i < texts.length; i++) {
  const t = texts[i];
  const liveR = await runscript(t.text);
  const liveClean = await runscript(j1045.results[i].clean);
  const a = j1045.results[i], b = j1126.results[i];
  const agree = liveR.address === a.cleanAddress && a.cleanAddress === b.cleanAddress && a.clean === b.clean && liveClean.address === liveR.address;
  const row = {
    name: t.name,
    address: a.cleanAddress, mxAddress: a.cleanMxAddress,
    liveNode1_0_45_15: { address: liveR.address, parseok: liveR.parseok, cleanChars: liveR.cleanScriptChars, cleanOfCleanSameAddress: liveClean.address === liveR.address },
    inProcess: { [j1045.minimaVersion]: { address: a.cleanAddress, mx: a.cleanMxAddress, cleanIsFixedPoint: a.cleanIsFixedPoint },
      [j1126.minimaVersion]: { address: b.cleanAddress, mx: b.cleanMxAddress, cleanIsFixedPoint: b.cleanIsFixedPoint, sameCleanText: a.clean === b.clean } },
    allAgree: agree,
    phantomIfRawTextRegistered: { rawMultiLineAddress: a.rawAddress, differsFromClean: a.rawAddress !== a.cleanAddress, sameIn1126: a.rawAddress === b.rawAddress },
    cleanText: a.clean, cleanTextSha256: sha256(a.clean), cleanTextBytes: Buffer.byteLength(a.clean, 'utf8'),
  };
  if (t.file) {
    const cleanPath = join(KISS_DIR, t.file + '.clean.txt');
    writeFileSync(cleanPath, a.clean);
    row.cleanFile = 'kiss/step2/' + t.file + '.clean.txt';
    row.kissFile = 'kiss/step2/' + t.file + '.kiss';
    row.kissFileSha256 = createHash('sha256').update(readFileSync(join(KISS_DIR, t.file + '.kiss'))).digest('hex');
  }
  rows.push(row);
  console.log((agree ? 'agree ' : 'DIFFER ') + t.name.padEnd(52) + ' ' + a.cleanAddress + '  raw-form phantom ' + a.rawAddress.slice(0, 18) + '...');
}
const receipt = {
  purpose: 'Step 2 version 2 final covenant addresses: live node + two jars in-process, clean form, deployable bytes and their hashes',
  node, timestamp: new Date().toISOString(),
  versions: { liveNode: node.version, inProcessJars: [j1045.minimaVersion, j1126.minimaVersion] },
  rule: 'A covenant address is the hash of the exact script bytes. These addresses are of the runscript CLEAN form (single line). Register (newscript) and spend with exactly the clean text in the .clean.txt file; the multi-line source hashes to the phantom address listed (txn-building laws 2 and 3).',
  deploymentOrder: ['registration_v2 first (names nothing)', 'vault_v2 second (names the registration_v2 address as a literal)'],
  rows,
};
console.log('receipt', saveReceipt('step2v2_addresses', receipt));
