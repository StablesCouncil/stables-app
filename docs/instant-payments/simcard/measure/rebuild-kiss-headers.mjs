// Rebuilds the headers of the Step A .kiss files from the receipts, so each file lists EVERY measurement of
// that script (happy path and refusals), its state ports, and the receipt names. The script bodies are kept.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERE } from './rpc.mjs';

const KISS = join(HERE, '..', 'kiss');
const REC = join(HERE, 'receipts');
const receipts = readdirSync(REC).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, ...JSON.parse(readFileSync(join(REC, f), 'utf8')) })).filter((r) => r.measurement);

const PORTS = {
  lx: 'hop k at ports 16k (R: revealed secrets), 16k+1 (C: complement hashes), 16k+2 (chunk digests), 16k+3 (next key | payout | nonce); helpers derive hop and chunk from @INPUT',
  anchor: '2 anchor id (stands in for @COINID), 3 first key (stands in for the load entry), hop k at 16k..16k+3',
  full: '16 R, 17 C, 3 key commitment',
  lo: '16 R, 17 C, 18 chunk digests, 20 digest (BITGET order)',
  cheat: '10 secret with label 0, 11 secret with label 1, 12 position, 13 chunk, 14 T block of the chunk, 15 chunk digests, 16 key commitment, 17 device root, 18 root sum, 19 MMR proof',
  member: '16 key commitment, 17 device root, 18 root sum, 19 MMR proof',
  w4: '20 signature (67 x 32) or chain start, 21 digest, 22 public key hash',
  fors: '30 revealed secrets, 31 tree roots, 32 digest, 33 key hash, 40+t MMR proof for tree t',
};
function portsFor(name) {
  if (name.startsWith('lx') && name.includes('helper')) return PORTS.lx;
  if (name.includes('anchor_hops')) return PORTS.anchor;
  if (name.includes('full_single')) return PORTS.full;
  if (name.startsWith('lo')) return PORTS.lo;
  if (name.includes('cheat')) return PORTS.cheat;
  if (name.includes('membership')) return PORTS.member;
  if (name.startsWith('w4')) return PORTS.w4;
  if (name.startsWith('fors')) return PORTS.fors;
  return '';
}

let rebuilt = 0;
for (const f of readdirSync(KISS).filter((x) => x.endsWith('.kiss'))) {
  const base = f.replace(/\.kiss$/, '');
  const bases = readdirSync(KISS).filter((x) => x.endsWith('.kiss')).map((x) => x.replace(/.kiss$/, ''));
  const owner = (m) => bases.filter((bb) => m === bb || m.startsWith(bb + '_')).sort((x, y) => y.length - x.length)[0];
  const mine = receipts.filter((r) => owner(r.measurement) === base);
  if (!mine.length) continue;
  const text = readFileSync(join(KISS, f), 'utf8');
  const bodyStart = text.indexOf('\n\n');
  const body = bodyStart >= 0 ? text.slice(bodyStart + 2) : text;
  const first = mine[0];
  const lines = [
    `// ${f}`,
    `// Purpose: ${first.purpose}`,
    portsFor(base) ? `// State ports: ${portsFor(base)}` : null,
    `// Node ${first.node.version} (lab peer 9101, RPC ${first.node.rpcPort}), runscript dry run. Measurements (receipt = measure/receipts/<name>.json):`,
    ...mine.map((r) => `//   ${r.measurement}: ${r.result.instructions} instructions, success=${r.result.success}` + (r.note ? ` (${r.note})` : '') + (r.result.executionError ? ` [${r.result.executionError.replace(/org\.minima\.kissvm\.exceptions\./, '').slice(0, 80)}]` : '')),
    `// Script size: ${first.scriptChars} characters; state data in the measured call: ${first.stateBytes} bytes. Body below is comment-free (deploy form).`,
    '',
  ].filter((l) => l !== null);
  writeFileSync(join(KISS, f), lines.join('\n') + '\n' + body);
  rebuilt++;
}
console.log('rebuilt headers:', rebuilt);
