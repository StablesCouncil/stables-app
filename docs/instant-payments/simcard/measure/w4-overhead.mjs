// Winternitz-4 per-digit overhead: the verification loop with chain steps removed, over 16 and 8 digits.
import { randomBytes } from 'node:crypto';
import { runscript, nodeVersion, saveReceipt } from './rpc.mjs';
import * as O from './ots.mjs';
import * as G from './kissgen.mjs';
const node = await nodeVersion();
const key = O.w4Keygen(); const d = randomBytes(32); const sig = O.w4Sign(key, d);
const base = G.w4Verify().script;
const out = {};
for (const digits of [4, 8]) {
  const s = base.replace('WHILE i LT 67 DO', `WHILE i LT ${digits} DO`).replace('LET k=v WHILE', 'LET k=15 WHILE').replace(/RETURN .*$/, 'RETURN TRUE');
  const r = await runscript(s, { state: { 20: O.hex(sig.S), 21: O.hex(d), 22: O.hex(key.pk) } });
  out['digits' + digits] = r.instructions; console.log(digits, r.instructions, r.success, r.executionError || '');
}
const perDigit = (out.digits8 - out.digits4) / 4;
const stepsMeasured = 10; // w4_chain_* receipts: 21, 61, 161 for 1, 5, 15 steps
const digits = O.w4Digits(d); const steps = digits.reduce((a, v) => a + (15 - v), 0);
const estimate = Math.round(out.digits8 - 8 * perDigit + 67 * perDigit + stepsMeasured * steps);
saveReceipt('w4_overhead', { node, timestamp: new Date().toISOString(), purpose: 'W4 per-digit loop overhead (chain steps removed) and whole-signature estimate',
  measured: out, perDigitOverhead: perDigit, perChainStep: stepsMeasured, chainStepsThisSignature: steps, expectedChainSteps: 67 * 7.5,
  estimatedWholeSignatureInstructions: estimate, estimateForExpectedSteps: Math.round(out.digits8 - 8 * perDigit + 67 * perDigit + 10 * 502.5),
  note: 'Extrapolation from measured slopes; the whole signature cannot run in one script (receipt w4_full_verify hits 1,025).' });
console.log({ perDigit, steps, estimate });
