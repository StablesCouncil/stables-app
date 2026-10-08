// Transaction-size measurements for cashing transactions (Step A, part 4).
//
// Builds transactions on the lab node with the local builder (txncreate / txninput / txnoutput / txnstate /
// txnscript / txnbasics / txnexport / txncheck) and deletes every one of them. Nothing is signed or posted.
// Sizes come from `txnexport` (the serialised TxnRow = transaction + witness, the body of a TxPoW).
//
// Real inputs: three unspent coins from earlier Stables campaigns that the lab node can still prove
// (found by find-coin.mjs). They give the real size of a coin and of its MMR proof on today's chain.
import { randomBytes } from 'node:crypto';
import { rpc, nodeVersion, saveReceipt } from './rpc.mjs';
import * as O from './ots.mjs';
import * as G from './kissgen.mjs';
import * as CV from './covenants.mjs';

const node = await nodeVersion();
const REAL = {
  tokenCoin: '0x02D2DEA81E2F5CDBCC3D3278CC638EEC1E9DF8C2FC71F1D3C4BEEE718CFF7125', // Winiwa, 10 state ports
  minimaStateCoin: '0x0C0D2FFFFFB16978966C87FF75DF85A058DD9CBD24C802D54A80B3A4C67B7FEB', // MINIMA, 43 state ports
};
const TOKEN = '0xD4F5DD3546F25D327CBF2B6867E193CE5DB6491AC9C65BBDCECACA1A6688063F'; // Winiwa (known to the node)
const ID = 'simcardsize';
const bytesOf = async () => { const e = await rpc(`txnexport id:${ID}`); if (!e.status) throw new Error('export failed ' + e.error); return e.response.data.length / 2 - 1; };
const fresh = async () => { await rpc(`txndelete id:${ID}`); const r = await rpc(`txncreate id:${ID}`); if (!r.status) throw new Error('txncreate failed'); };
const ok = (r, what) => { if (!r.status) throw new Error(what + ' failed: ' + (r.error || JSON.stringify(r).slice(0, 200))); return r; };
const results = {};

try {
  // a. empty
  await fresh(); results.emptyTxn = await bytesOf();

  // b. outputs
  const addr = O.hex(randomBytes(32));
  ok(await rpc(`txnoutput id:${ID} amount:0.001 address:${addr} tokenid:0x00 storestate:false`), 'txnoutput');
  results.oneMinimaOutput = (await bytesOf()) - results.emptyTxn;
  const b1 = await bytesOf();
  ok(await rpc(`txnoutput id:${ID} amount:1 address:${addr} tokenid:${TOKEN} storestate:false`), 'txnoutput token');
  results.oneTokenOutput = (await bytesOf()) - b1;

  // c. state: overhead per hex port
  await fresh(); const s0 = await bytesOf();
  ok(await rpc(`txnstate id:${ID} port:16 value:${O.hex(randomBytes(4080))}`), 'txnstate');
  results.state4080 = (await bytesOf()) - s0;
  results.stateOverheadPerHexPort = results.state4080 - 4080;

  // d. real inputs: coin bytes (in the transaction) and coin proof + script (added by txnbasics)
  for (const [label, coinid] of Object.entries(REAL)) {
    await fresh(); const e0 = await bytesOf();
    const inp = ok(await rpc(`txninput id:${ID} coinid:${coinid}`), 'txninput');
    const coin = inp.response.transaction.inputs[0];
    const e1 = await bytesOf();
    ok(await rpc(`txnbasics id:${ID}`), 'txnbasics');
    const e2 = await bytesOf();
    const ex = await rpc(`txnexport id:${ID} showtxn:true`);
    const wit = ex.response.txn.witness;
    const scriptChars = wit.scripts.reduce((a, s) => a + s.script.length, 0);
    const proofChunks = wit.mmrproofs[0].proof.proof.length;
    results[label] = { coinid, token: coin.tokenid !== '0x00', statePorts: (coin.state || []).length, mmrentry: coin.mmrentry,
      coinBytesInTxn: e1 - e0, afterBasicsDelta: e2 - e1, scriptChars, proofChunks,
      coinProofBytes: e2 - e1 - scriptChars - 4, mmrProofBytesApprox: e2 - e1 - scriptChars - 4 - (e1 - e0) };
  }
  const mmr = results.tokenCoin.mmrProofBytesApprox;
  // A helper coin is plain MINIMA dust with no state: its coin bytes ~ one MINIMA output.
  results.derived = {
    helperInputBytes: 2 * results.oneMinimaOutput + mmr,
    note: 'helper input = coin in transaction + coin in witness proof + MMR proof (proof size from the real token coin)',
  };

  // e. whole cashing-shaped transactions: LX16, 255 positions, 5 helpers per hop, h = 1..4 hops.
  const n = 16, K = 5, P = 255;
  // the real covenant texts: helper body (reached by MAST), helper address script, NOTES covenant
  const X = '0x' + 'AB'.repeat(32);
  const helper = CV.helperBody({ stamp: X, n, K, P });
  const helperAddr = CV.helperAddressScript(X, X);
  const notes = CV.notesScript({ stamp: X, usdw: X, burn: X, bodyHash: X, claimWindow: 12000, maxHops: 3, n, P, K });
  const table = [];
  for (const hops of [1, 2, 3, 4]) {
    await fresh();
    // anchor stand-in: the real token coin with stored state (the anchor holds USDw and carries state)
    ok(await rpc(`txninput id:${ID} coinid:${REAL.tokenCoin}`), 'txninput anchor');
    ok(await rpc(`txnbasics id:${ID}`), 'txnbasics');
    const withAnchor = await bytesOf();
    // outputs: release coin Q = stamp coin + value coin (two token outputs); helper dust is burned as the fee
    const qa = O.hex(randomBytes(32));
    ok(await rpc(`txnoutput id:${ID} amount:0.5 address:${qa} tokenid:${TOKEN} storestate:false`), 'out');
    ok(await rpc(`txnoutput id:${ID} amount:0.25 address:${qa} tokenid:${TOKEN} storestate:false`), 'out2');
    // state: per hop R (255*16), C (255*16), chunk digests (5*32), message (80); plus hop count
    const keys = []; for (let k = 0; k <= hops; k++) keys.push(O.lxKeygen({ n, chunks: K, positions: P }));
    ok(await rpc(`txnstate id:${ID} port:1 value:${hops}`), 'state1');
    let prevd = randomBytes(32);
    for (let k = 1; k <= hops; k++) {
      const msg = O.cat(keys[k].pk, randomBytes(32), randomBytes(16));
      const d = O.sha2(O.cat(Buffer.from([1]), prevd, msg));
      const sig = O.lxSign(keys[k - 1], d);
      const p = 16 * k;
      ok(await rpc(`txnstate id:${ID} port:${p} value:${O.hex(sig.R)}`), 'R');
      ok(await rpc(`txnstate id:${ID} port:${p + 1} value:${O.hex(sig.C)}`), 'C');
      ok(await rpc(`txnstate id:${ID} port:${p + 2} value:${O.hex(O.cat(...sig.chunkDigests))}`), 'cd');
      ok(await rpc(`txnstate id:${ID} port:${p + 3} value:${O.hex(msg)}`), 'msg');
      prevd = d;
    }
    // scripts carried in the witness: helper script once (all helpers share its address)
    ok(await rpc(`txnscript id:${ID} scripts:${JSON.stringify({ [helper]: '', [helperAddr]: '', [notes]: '' })}`), 'txnscript');
    const body = await bytesOf();
    const chk = await rpc(`txncheck id:${ID}`);
    const helpers = K * hops;
    const helperBytes = helpers * results.derived.helperInputBytes; // helper inputs; their dust is burned (no outputs)
    const valueCoinBytes = results.tokenCoin.coinProofBytes + results.tokenCoin.coinBytesInTxn; // second anchor coin (value)
    const anchorScriptExtra = valueCoinBytes; // the notes script itself is now carried in the measured body via txnscript
    const header = 1200; // TxPoW header + base, notes-manager.js BYTES_BASE (phone-measured model)
    const total = body + helperBytes + anchorScriptExtra - results.tokenCoin.scriptChars + header;
    table.push({ hops, measuredBodyBytes: body, helpers, helperBytes, valueCoinBytes, scriptsInWitnessChars: helper.length + helperAddr.length + notes.length, headerAllowance: header,
      totalTxPoWBytesEstimate: total, fits64KB: total <= 65536, fitsCoreIpcReply: total * 2 + 4000 <= 100000,
      txncheckBasic: chk.response?.valid?.basic ?? null });
    console.log(`hops=${hops} body=${body} helpers=${helpers} total~${total} fits64K=${total <= 65536} coreIPC=${total * 2 + 4000 <= 100000}`);
  }
  results.cashingTable = table;
} finally {
  await rpc(`txndelete id:${ID}`);
}

saveReceipt('txn-sizes', { purpose: 'Cashing transaction (T1) sizes with the real covenant texts (LX16, 255 positions, 5 helpers per hop) against the 65,536-byte TxPoW cap and the 100,000-character Core IPC reply cap',
  node, timestamp: new Date().toISOString(), results });
console.log(JSON.stringify(results, null, 1).slice(0, 3000));
