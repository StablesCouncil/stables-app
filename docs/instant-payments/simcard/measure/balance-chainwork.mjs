// Crux 1 (chip-balance model), option (b): could a chip verify Minima chain data itself?
//
// Reads the lab node's own chain summary (status, read-only) and derives:
//   - expected hashes per block at today's difficulty (2^256 / target) and from weight / length,
//   - the network hash rate implied by a ~50 s block time,
//   - the cost for an attacker to mine a private fork of c blocks at real difficulty,
//   - the chip time a Java Card would need to check one funding proof with software SHA-3
//     (6.7 s per Keccak call, VERIFIED figure carried from Phase 0, OptimizedJCAlgs).
// Nothing is posted, signed or written to the node.
import { rpc, nodeVersion, saveReceipt } from './rpc.mjs';

const node = await nodeVersion();
const st = (await rpc('status')).response;
const chain = st.chain;
const target = BigInt(chain.difficulty);
const TWO256 = 1n << 256n;
const hashesPerBlockFromTarget = Number(TWO256 / (target + 1n));
const hashesPerBlockFromWeight = Number(BigInt(chain.weight) / BigInt(chain.length));
const blockSeconds = 50; // Minima target, brief: blocks about 49-50 s apart
const networkHashRate = hashesPerBlockFromTarget / blockSeconds;

// Attacker hardware (ASSUMED, public ballpark figures for Keccak-256 / SHA3-256):
const rigs = {
  laptopCpu: 20e6,        // ~10-50 MH/s multi-core SHA3
  consumerGpu: 2e9,       // ~1-4 GH/s Keccak on a current consumer GPU
};
const forkBlocks = [1, 6, 100, 1000];
const forkCost = {};
for (const [rig, hps] of Object.entries(rigs)) {
  forkCost[rig] = Object.fromEntries(forkBlocks.map((c) => [c + '_blocks_seconds', +(c * hashesPerBlockFromTarget / hps).toFixed(3)]));
}

// Chip-side work to check ONE funding proof in software SHA-3 (Keccak-f[1600], rate 136 bytes):
//   coin hash: ~1-3 permutations; MMR proof: one hash per proof chunk (17 chunks measured in
//   Phase 1 txn-sizes.json, 970 bytes); block header hash: header carries 32 super-parent slots
//   (GlobalParams.MINIMA_CASCADE_LEVELS = 32) so ~1.1-1.5 KB -> ~9-11 permutations; plus c
//   confirmation headers of the same size.
const keccakSeconds = 6.7;
const perms = { coin: 2, mmrProof: 17, header: 10 };
const chipSeconds = (confirmations) => (perms.coin + perms.mmrProof + perms.header * (1 + confirmations)) * keccakSeconds;
const chipTime = Object.fromEntries([0, 6, 100].map((c) => [c + '_confirmations_minutes', +(chipSeconds(c) / 60).toFixed(1)]));

const out = {
  purpose: 'Crux 1 option (b): cost and security of a chip verifying Minima chain data (PoW headers + MMR proof) itself',
  node, timestamp: new Date().toISOString(),
  measured: { difficulty: chain.difficulty, weight: chain.weight, length: chain.length, speed: chain.speed, block: chain.block },
  derived: {
    hashesPerBlockFromTarget, hashesPerBlockFromWeight,
    networkHashRatePerSecondAt50s: networkHashRate,
    attackerHashRatesAssumed: rigs,
    privateForkMiningTime: forkCost,
    chipSoftwareSha3SecondsPerCall: keccakSeconds,
    keccakPermutationsAssumed: perms,
    chipTimeToCheckOneFunding: chipTime,
  },
  reading: 'Minima blocks carry tens of millions of hashes of work; a laptop mines a fake block in seconds and a GPU in milliseconds, so a chip that trusts PoW headers can be fed a private fork cheaply, and checking even one proof in software SHA-3 takes minutes to hours of chip time.',
};
saveReceipt('balance_chain_work', out);
console.log(JSON.stringify(out.derived, null, 1));
