// Find any coin id (from old journals) that the lab node can still resolve, so a real CoinProof can be
// measured with txninput + txnbasics + txnexport. The transaction is deleted immediately; nothing posts.
import { readFileSync } from 'node:fs';
import { rpc } from './rpc.mjs';
const ids = readFileSync(process.argv[2], 'utf8').split(/\s+/).filter(Boolean);
const found = [];
await rpc('txncreate id:simcardprobe');
try {
  for (const id of ids) {
    const r = await rpc('txninput id:simcardprobe coinid:' + id);
    if (r.status) { found.push(id); await rpc('txndelete id:simcardprobe'); await rpc('txncreate id:simcardprobe'); if (found.length >= 3) break; }
  }
} finally { await rpc('txndelete id:simcardprobe'); }
console.log(JSON.stringify(found));
