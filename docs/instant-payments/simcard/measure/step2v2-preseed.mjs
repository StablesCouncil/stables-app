// step2v2-preseed.mjs: the runner for STEP2-PRESEED-01, run STEP2-PRESEED-01-R1 (formal evidence mode).
//
// Record: ../docs/STEP2-PRESEED-01.md (APPROVED by the founder 2026-09-29, exactly one run). This file reproduces the
// record's section 9 recipe and nothing else. Its SHA-256 is written into the fixture block at P0.8, before H01
// (record section 4.4); every later phase re-checks that hash and refuses to run if this file changed.
//
// Phases (run one at a time, in this order, each refuses to start unless the previous one completed):
//   p0  r01-r12 ... are named exactly as the record's order: p0, h01, r01-r12, h02, h03, r13-r14, h04, h05, h06, close
// Offline modes that touch no node: `selftest` (replays synthetic node-shaped transactions through the attribution
// code) and `plan` (prints every node command each phase would send, with placeholder fixtures).
//
// Rules enforced in code (record sections 9 and 13, and the run brief):
//  - Two nodes. 9101 (RPC 9105) builds, signs and posts. 9201 (RPC 9205) only observes: status, coins, newscript,
//    txpow. Any other verb to 9201 is refused before it is sent.
//  - Only the recipe's verbs are ever sent. `keys` only as `keys action:new`. `txnpost` only as
//    `txnpost id:step2pre_hNN txndelete:true`: never mine:, never for a refusal. Any `mine:` anywhere is refused.
//  - Every command and its full reply is appended to commands.jsonl before anything else happens. An empty reply,
//    a non-JSON reply, a refused connection or a timeout is recorded as a wedged/down node and STOPS the run.
//  - Amounts are exact decimal strings; change is computed with BigInt decimal arithmetic, never floating point.
//  - A coin is used as an input only when it is at least 3 blocks deep on 9101.
//  - The first stop condition met writes HARD_STOP.json and ends the phase with exit code 2. Nothing is retried.
// Refusal attribution (record section 7, L1): each refusal's own builder JSON (txnbasics reply: inputs, outputs,
// state, the scripts in its witness) and its signer list (txnsign reply) are replayed in-process with
// java/KissRunScaled.java on the 9101 node's own jar, one Contract per input, as TxPoWChecker does; plus the node's
// own "Script FAIL input:" log lines written during the txncheck, where it prints one.
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// ------------------------------------------------------------------------------------------------ identities
const SELF = fileURLToPath(import.meta.url);
const HERE = path.dirname(SELF);
const SIMCARD = path.resolve(HERE, '..');
const WORK = path.resolve(SIMCARD, '..');
const RUN_ID = 'STEP2-PRESEED-01-R1';
const EVID = path.join(SIMCARD, 'evidence', RUN_ID);
const STATE_FILE = path.join(EVID, 'run-state.json');
const LOG_FILE = path.join(EVID, 'commands.jsonl');
const FIXTURE_FILE = path.join(EVID, 'fixture-block.json');

const NODE_DIR = 'C:/Users/Charles/Documents/Crypto/Minima/Nodes/DevNodesSet/9101';
const JAR = NODE_DIR + '/minima.jar';
const JAVA = 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot/bin/java.exe';
const JAVAC = 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot/bin/javac.exe';
const REPLAY_SRC = path.join(HERE, 'java', 'KissRunScaled.java');
const HEALTH_TOOL = path.join(WORK, 'tools', 'lab-node-health.mjs');

const NODES = {
  '9101': { port: 9105, role: 'primary', healthArgs: [] },
  '9201': { port: 9205, role: 'witness', healthArgs: ['--rpc', '9205', '--proxy', '9206'] },
};

// Record section 4.1 (frozen sources) and 4.2 (addresses and identities).
const FROZEN_FILES = [
  ['kiss/step2/instant_registration_v2.clean.txt', 'a033264f9442cded205a8f7224d41e2387763148e2138351b2e0fbf541ce2d9e'],
  ['kiss/step2/instant_vault_v2.clean.txt', 'e63e0452b1a3d3e641f7b3016e1318070e0291223e0dae48a74f826bc0b76f6a'],
  ['kiss/step2/instant_registration_v2.kiss', '2b0080cf58347c0d82ddff61511a69a74cb824971036f07009195816155c9073'],
  ['kiss/step2/instant_vault_v2.kiss', '92013536f66756c7fbdc7571f70091397cbba8ed0a23251243ea3937555c4de7'],
  ['measure/step2v2-covenants.mjs', 'ea5f5da650539c98a0f0e6b791108df6802d972b22a5954d824177902c32f9c3'],
];
const REG = '0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449';
const REG_MX = 'MxG082J6T2PS1QV22QJ82MFCHDNG5EG2PBGF1TCNTHWPYDDNCCSHT2K96PU118J';
const VAULT = '0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413';
const VAULT_MX = 'MxG08727WKV4J7YNN29MTCM9MGKB85EENR9SRFT6UUSTAQNCMNB799K2EU5DAJE';
const PHANTOMS = ['0xC4B574EA362B47D8DDA72518E696908F0A7BFE363A2B58F90822463436EDD12F',
  '0x5FF94F305A3CFCDB24A1D3B00DE5C8EC495C3795FFD9AF37C63C785A54290C6C'];
const WIN = '0xD4F5DD3546F25D327CBF2B6867E193CE5DB6491AC9C65BBDCECACA1A6688063F';
const XWIN = '0xEFA53EFF58616DDBDF0B6D6DBB4E18F041C4509FB3DB3B7E5482B99ABC72F127';
const MAGIC = '0x53544931';
const ACCT = '0x2C17A5616335CD69A109C63571FD12859CED3FEF77C876ADE207E886C80F6144';
const ACCT_PREIMAGE = 'STEP2-PRESEED-01 test account (not an Instant key)';
const X = '0x319540F7563D3890A15194E4FB1E0A1DB255C29B5F054948318C20D87F7A291B';
const X_PREIMAGE = 'STEP2-PRESEED-01 foreign payout, refusals only, never posted';
const ONE = '0.00000001';
const MIN_F = '0.00000010';
const DEPTH = 3;          // record: a coin is used as an input only once it is 3 blocks deep on 9101
const MINE_LIMIT = 20;    // record section 13: an honest control not mined within 20 blocks stops the run
const TIP_GAP = 2;        // record section 13: the tips more than 2 blocks apart stops the run
const POLL_MS = 12000;
const EXPLORER = 'https://explorer.minima.global';

const ORDER = ['p0', 'h01', 'r01-r12', 'h02', 'h03', 'r13-r14', 'h04', 'h05', 'h06', 'close'];

// ------------------------------------------------------------------------------------------------ helpers
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const sha256hex0x = (s) => '0x' + sha256(Buffer.from(s, 'utf8')).toUpperCase();
const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const same = (a, b) => String(a).toUpperCase() === String(b).toUpperCase();
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJSON = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };

class Stop extends Error {
  constructor(condition, detail) { super(condition + ': ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))); this.condition = condition; this.detail = detail; }
}
// An invocation mistake caught before any node command is sent (wrong order, P0 twice): not a run event, no stop.
class Precondition extends Error {}

// Exact decimal arithmetic (record section 9: never floating point).
function splitDec(s) {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(String(s).trim());
  if (!m) throw new Error('not a plain decimal: ' + s);
  return { neg: !!m[1], i: m[2], f: m[3] || '' };
}
function decimalsOf(s) { return splitDec(s).f.replace(/0+$/, '').length; }
function toBig(s, scale) {
  const { neg, i, f } = splitDec(s);
  const ft = f.replace(/0+$/, '');
  if (ft.length > scale) throw new Error('more decimals than scale: ' + s);
  const v = BigInt(i + ft.padEnd(scale, '0'));
  return neg ? -v : v;
}
function fromBig(v, scale) {
  const neg = v < 0n;
  const s = (neg ? -v : v).toString().padStart(scale + 1, '0');
  const ip = s.slice(0, s.length - scale);
  const fp = s.slice(s.length - scale).replace(/0+$/, '');
  return (neg ? '-' : '') + ip + (fp ? '.' + fp : '');
}
function decSub(a, b) { const sc = Math.max(decimalsOf(a), decimalsOf(b)); return fromBig(toBig(a, sc) - toBig(b, sc), sc); }
function decAdd(a, b) { const sc = Math.max(decimalsOf(a), decimalsOf(b)); return fromBig(toBig(a, sc) + toBig(b, sc), sc); }
function decCmp(a, b) { const sc = Math.max(decimalsOf(a), decimalsOf(b)); const x = toBig(a, sc), y = toBig(b, sc); return x < y ? -1 : x > y ? 1 : 0; }

// ------------------------------------------------------------------------------------------------ run state
function loadState() { return fs.existsSync(STATE_FILE) ? readJSON(STATE_FILE) : null; }
function saveState(st) { writeJSON(STATE_FILE, st); }
let SEQ = 0;
function logLine(entry) {
  fs.mkdirSync(EVID, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}
function note(phase, text, data) {
  const e = { seq: ++SEQ, kind: 'note', phase, time: now(), text };
  if (data !== undefined) e.data = data;
  logLine(e);
  console.log('[' + phase + '] ' + text + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
}

// Deep redaction of secret-bearing field names (none is expected: 1.0.45.15 KeyRow.toJSON has no private key).
const SECRET_KEYS = new Set(['privatekey', 'phrase', 'seed', 'seedphrase', 'password']);
function redact(o, hits) {
  if (Array.isArray(o)) return o.map((x) => redact(x, hits));
  if (o && typeof o === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(o)) {
      if (SECRET_KEYS.has(k.toLowerCase())) { r[k] = '[REDACTED by runner]'; hits.push(k); } else r[k] = redact(v, hits);
    }
    return r;
  }
  return o;
}

// ------------------------------------------------------------------------------------------------ RPC (raw TCP POST)
// The node's reply breaks Node's HTTP parser (println after Content-length), so this talks raw TCP as rpc.mjs does.
const PRIMARY_VERBS = new Set(['status', 'txnlist', 'runscript', 'coins', 'newscript', 'keys', 'getaddress', 'balance',
  'txncreate', 'txninput', 'txnoutput', 'txnstate', 'txnbasics', 'txnsign', 'txncheck', 'txnexport', 'txnpost', 'txndelete', 'txpow']);
const WITNESS_VERBS = new Set(['status', 'coins', 'newscript', 'txpow']);
const CRLF = String.fromCharCode(13, 10);

function guard(node, command) {
  const verb = command.trim().split(/\s+/)[0].toLowerCase();
  const allowed = node === '9101' ? PRIMARY_VERBS : WITNESS_VERBS;
  if (!allowed.has(verb)) throw new Stop('command outside the recipe', { node, command });
  if (/\bmine\s*:/i.test(command)) throw new Stop('command outside the recipe (mine:)', { node, command });
  if (command.includes(';')) throw new Stop('command outside the recipe (semicolon)', { node, command });
  if (verb === 'keys' && command.trim() !== 'keys action:new') throw new Stop('command outside the recipe (keys)', { node, command });
  if (verb === 'txnpost' && !/^txnpost id:step2pre_h0[1-6] txndelete:true$/.test(command.trim())) throw new Stop('command outside the recipe (txnpost)', { node, command });
  if (/^txn/.test(verb) && verb !== 'txnlist' && !/ id:step2pre_[hr]\d\d(\s|$)/.test(command)) throw new Stop('command outside the recipe (txn id)', { node, command });
}

function rawRpc(port, command, timeoutMs) {
  const body = Buffer.from(command, 'utf8');
  const head = Buffer.from(['POST / HTTP/1.1', 'Host: 127.0.0.1', 'Content-Type: text/plain',
    'Content-Length: ' + body.length, 'Connection: close', '', ''].join(CRLF), 'utf8');
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    const chunks = [];
    let done = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    const timer = setTimeout(() => { sock.destroy(); finish({ transport: 'timeout', text: Buffer.concat(chunks).toString('utf8') }); }, timeoutMs);
    sock.on('connect', () => { sock.write(head); sock.end(body); });
    sock.on('data', (c) => chunks.push(c));
    sock.on('error', (e) => finish({ transport: 'error', error: String(e && e.message || e), text: Buffer.concat(chunks).toString('utf8') }));
    sock.on('close', () => finish({ transport: 'closed', text: Buffer.concat(chunks).toString('utf8') }));
  });
}

let PHASE = '?';
async function rpc(node, command, { timeoutMs = 300000, allowFail = false } = {}) {
  guard(node, command);
  const t0 = Date.now();
  const started = now();
  const r = await rawRpc(NODES[node].port, command, timeoutMs);
  const ms = Date.now() - t0;
  const text = r.text || '';
  const i = text.indexOf('{');
  const entry = { seq: ++SEQ, kind: 'rpc', phase: PHASE, node, rpcPort: NODES[node].port, started, ended: now(), ms, command,
    transport: r.transport, replyChars: text.length };
  let parsed = null;
  if (i >= 0) { try { parsed = JSON.parse(text.slice(i).trim()); } catch { parsed = null; } }
  if (!parsed) {
    entry.rawReply = text;
    if (r.error) entry.error = r.error;
    logLine(entry);
    const state = r.transport === 'error' ? 'down (connection refused or reset)' : r.transport === 'timeout' ? 'wedged (no reply within ' + timeoutMs + ' ms)' : text.trim() ? 'wedged (non-JSON reply)' : 'wedged (connection accepted, empty reply)';
    throw new Stop('node ' + node + ' ' + state, { command, replyChars: text.length, head: text.slice(0, 300) });
  }
  const hits = [];
  entry.reply = redact(parsed, hits);
  if (hits.length) entry.redacted = hits;
  logLine(entry);
  if (parsed.status !== true && !allowFail) throw new Stop('node ' + node + ' refused a recipe command', { command, error: parsed.error || parsed.message || null });
  return parsed;
}

async function tipOf(node) {
  const s = await rpc(node, 'status');
  return Number(s.response.chain.block);
}
async function tips() {
  const a = await tipOf('9101');
  const b = await tipOf('9201');
  return { '9101': a, '9201': b };
}
async function checkTips(where) {
  const t = await tips();
  const gap = Math.abs(t['9101'] - t['9201']);
  note(PHASE, 'tips at ' + where, { ...t, gap });
  if (gap > TIP_GAP) throw new Stop('the tips are more than 2 blocks apart', { where, ...t });
  return t;
}

// ------------------------------------------------------------------------------------------------ recipe commands
function stateEntries(state) { return Object.keys(state).map(Number).sort((a, b) => a - b).map((p) => [p, state[p]]); }
// Returns the exact builder command list of section 9 for one transaction spec.
function buildCommands(spec) {
  const id = spec.id;
  const c = ['txncreate id:' + id];
  for (const coinid of spec.inputs) c.push('txninput id:' + id + ' coinid:' + coinid);
  for (const o of spec.outputs) c.push('txnoutput id:' + id + ' amount:' + o.amount + ' address:' + o.address + ' tokenid:' + WIN + ' storestate:' + (o.storestate ? 'true' : 'false'));
  for (const [p, v] of stateEntries(spec.state)) c.push('txnstate id:' + id + ' port:' + p + ' value:' + v);
  c.push('txnbasics id:' + id);
  if (spec.sign) c.push('txnsign id:' + id + ' publickey:' + spec.sign);
  c.push('txncheck id:' + id);
  c.push('txnexport id:' + id);
  return c;
}

const withdrawState = (fx, { w, c }) => ({ 0: MAGIC, 1: ACCT, 2: fx.K1, 3: fx.P, 7: w, 8: '1', 10: c, 11: ONE, 12: WIN });
const closeState = (fx) => ({ 0: MAGIC, 1: ACCT, 2: fx.K1, 3: fx.P, 8: '2', 11: ONE, 12: WIN });
const out = (address, amount, storestate) => ({ address, amount, storestate });

// Honest controls, record section 7 (inputs in order, outputs in order, state, signer). `creates` names output coins.
function honestSpec(n, fx, coins) {
  switch (n) {
    case 'h01': return { id: 'step2pre_h01', inputs: [fx.F.coinid],
      outputs: [out(VAULT, '0.00000003', true), out(REG, ONE, true), out(fx.P, decSub(fx.F.amount, '0.00000004'), false)],
      state: { 0: MAGIC, 1: ACCT, 2: fx.K1, 3: fx.P, 12: WIN }, sign: 'auto', creates: { L1: 0, R1: 1, Fp: 2 } };
    case 'h02': return { id: 'step2pre_h02', inputs: [coins.R1.coinid, coins.L1.coinid],
      outputs: [out(fx.P, ONE, false), out(VAULT, '0.00000002', false), out(REG, ONE, true)],
      state: withdrawState(fx, { w: ONE, c: '0.00000002' }), sign: fx.K1, creates: { P2: 0, C1: 1, R2: 2 } };
    case 'h03': return { id: 'step2pre_h03', inputs: [coins.Fp.coinid],
      outputs: [out(VAULT, '0.00000002', true), out(fx.P, decSub(coins.Fp.amount, '0.00000002'), false)],
      state: { 0: MAGIC, 1: ACCT, 3: fx.P }, sign: 'auto', creates: { L2: 0, Fpp: 1 } };
    case 'h04': return { id: 'step2pre_h04', inputs: [coins.C1.coinid, coins.L2.coinid],
      outputs: [out(VAULT, '0.00000004', false)], state: { 8: '3', 10: '0.00000004' }, sign: null, creates: { M1: 0 } };
    case 'h05': return { id: 'step2pre_h05', inputs: [coins.R2.coinid, coins.M1.coinid],
      outputs: [out(fx.P, '0.00000004', false), out(REG, ONE, true)],
      state: withdrawState(fx, { w: '0.00000004', c: '0' }), sign: fx.K1, creates: { P5: 0, R3: 1 } };
    case 'h06': return { id: 'step2pre_h06', inputs: [coins.R3.coinid],
      outputs: [out(fx.P, ONE, false)], state: closeState(fx), sign: fx.K1, creates: { P6: 0 } };
  }
  throw new Error('no honest spec ' + n);
}

// Refusals, record section 7: each starts from the honest shape named and changes one thing. R09's state is the
// dry run's analogue (NEG_A_vault_coin_alone: the full withdrawal state, w = the coin, c = 0); R10's is the record's.
// `expect` maps each refusing input to the clause it must fail on (the statement the in-process trace ends on).
const CLAUSE = {
  SIGNEDBY: /^ASSERT function:SIGNEDBY, params:\[function:PREVSTATE, params:\[2\]\]$/,
  REG_OUT0: /^ASSERT function:VERIFYOUT, params:\[0, function:PREVSTATE, params:\[3\], variable:w, variable:t, FALSE\]$/,
  SAMESTATE_0_3: /^ASSERT function:SAMESTATE, params:\[0, 3\]$/,
  SAMESTATE_12: /^ASSERT function:SAMESTATE, params:\[12, 12\]$/,
  VAULT_TOKEN: /^ASSERT \( global:@TOKENID EQ function:STATE, params:\[12\] \)$/,
  VAULT_OUT1: /^RETURN function:VERIFYOUT, params:\[1, global:@ADDRESS, variable:c, global:@TOKENID, FALSE\]$/,
  TOTOUT3: /^ASSERT \( global:@TOTOUT EQ 3 \)$/,
  GETINADDR: /^ASSERT \( function:GETINADDR, params:\[0\] EQ 0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449 \)$/,
  RETURN_FALSE: /^RETURN FALSE$/,
  CLOSE_OUT0: /^RETURN function:VERIFYOUT, params:\[0, function:PREVSTATE, params:\[3\], function:STATE, params:\[11\], global:@TOKENID, FALSE\]$/,
  MERGE_SUM_OR_OUT0: /^(ASSERT \( function:STATE, params:\[10\] EQ function:SUMINPUTS, params:\[global:@TOKENID\] \)|RETURN function:VERIFYOUT, params:\[0, global:@ADDRESS, function:STATE, params:\[10\], global:@TOKENID, FALSE\])$/,
  MERGE_OUT0: /^RETURN function:VERIFYOUT, params:\[0, global:@ADDRESS, function:STATE, params:\[10\], global:@TOKENID, FALSE\]$/,
};
function refusalSpec(n, fx, coins) {
  const h02 = () => ({ inputs: [coins.R1.coinid, coins.L1.coinid],
    outputs: [out(fx.P, ONE, false), out(VAULT, '0.00000002', false), out(REG, ONE, true)],
    state: withdrawState(fx, { w: ONE, c: '0.00000002' }), sign: fx.K1 });
  const h04 = () => ({ inputs: [coins.C1.coinid, coins.L2.coinid], outputs: [out(VAULT, '0.00000004', false)], state: { 8: '3', 10: '0.00000004' }, sign: null });
  const b = { id: 'step2pre_' + n };
  switch (n) {
    case 'r01': return { ...b, ...h02(), sign: null, change: 'H02 not signed', expect: { 0: ['SIGNEDBY'] } };
    case 'r02': return { ...b, ...h02(), sign: fx.K2, change: 'H02 signed by K2 instead of K1', expect: { 0: ['SIGNEDBY'] } };
    case 'r03': { const s = h02(); s.outputs[0] = out(X, ONE, false); return { ...b, ...s, change: 'H02 output 0 pays X', expect: { 0: ['REG_OUT0'] } }; }
    case 'r04': { const s = h02(); s.outputs[0] = out(X, ONE, false); s.state[3] = X; return { ...b, ...s, change: 'H02 port 3 = X and output 0 pays X', expect: { 0: ['SAMESTATE_0_3'] } }; }
    case 'r05': { const s = h02(); s.state[12] = XWIN; return { ...b, ...s, change: 'H02 port 12 = xWiniwa', expect: { 0: ['SAMESTATE_12'], 1: ['VAULT_TOKEN'] } }; }
    case 'r06': { const s = h02(); s.outputs[1] = out(VAULT, '0.00000002', true); return { ...b, ...s, change: 'H02 output 1 keeps state (a fake load)', expect: { 1: ['VAULT_OUT1'] } }; }
    case 'r07': { const s = h02(); s.outputs = [out(fx.P, ONE, false), out(VAULT, ONE, false), out(X, ONE, false), out(REG, ONE, true)]; return { ...b, ...s, change: 'H02 output 1 = VAULT 1 plus an extra output X 1', expect: { 0: ['TOTOUT3'], 1: ['VAULT_OUT1'] } }; }
    case 'r08': { const s = h02(); s.outputs = [out(fx.P, ONE, false), out(VAULT, '0.00000002', false)]; return { ...b, ...s, change: 'H02 without the registration output', expect: { 0: ['TOTOUT3'] } }; }
    case 'r09': return { ...b, inputs: [coins.L1.coinid], outputs: [out(X, '0.00000003', false)], state: withdrawState(fx, { w: '0.00000003', c: '0' }), sign: null,
      change: 'L1 alone, op 1, output X 3', expect: { 0: ['GETINADDR'] } };
    case 'r10': return { ...b, inputs: [coins.L1.coinid], outputs: [out(X, '0.00000003', false)], state: { 8: '4', 100: '0.00000003' }, sign: null,
      change: 'L1 alone, op 4, port 100 = 0.00000003, output X 3 (v1 retirement)', expect: { 0: ['RETURN_FALSE'] } };
    case 'r11': return { ...b, inputs: [coins.R1.coinid], outputs: [out(X, ONE, false)], state: closeState(fx), sign: fx.K1, change: 'close of R1 paying X', expect: { 0: ['CLOSE_OUT0'] } };
    case 'r12': return { ...b, inputs: [coins.R1.coinid], outputs: [out(fx.P, ONE, false)], state: closeState(fx), sign: null, change: 'close of R1, not signed', expect: { 0: ['SIGNEDBY'] } };
    case 'r13': { const s = h04(); s.outputs = [out(VAULT, '0.00000003', false)]; return { ...b, ...s, change: 'H04 with output VAULT 3 (one atom burnt)', expect: { 0: ['MERGE_SUM_OR_OUT0'], 1: ['MERGE_SUM_OR_OUT0'] } }; }
    case 'r14': { const s = h04(); s.outputs = [out(VAULT, '0.00000004', true)]; return { ...b, ...s, change: 'H04 with the output keeping state', expect: { 0: ['MERGE_OUT0'], 1: ['MERGE_OUT0'] } }; }
  }
  throw new Error('no refusal spec ' + n);
}
const R_GROUP_A = ['r01', 'r02', 'r03', 'r04', 'r05', 'r06', 'r07', 'r08', 'r09', 'r10', 'r11', 'r12'];
const R_GROUP_B = ['r13', 'r14'];

// ------------------------------------------------------------------------------------------------ txncheck flags
function flagsOf(check) {
  const v = (check.response && check.response.valid) || {};
  let sig = v.signatures;
  if (Array.isArray(sig)) sig = sig.every((s) => s && s.valid === true);
  return { basic: v.basic === true, signatures: sig === true, mmrproofs: v.mmrproofs === true, scripts: v.scripts === true, raw: v };
}

// ------------------------------------------------------------------------------------------------ in-process replay
function compileReplay(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync(JAVAC, ['-cp', JAR, '-d', dir, REPLAY_SRC], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('javac failed: ' + r.stderr);
  return { srcSha256: sha256(fs.readFileSync(REPLAY_SRC)), javac: (spawnSync(JAVAC, ['-version'], { encoding: 'utf8' }).stdout || '').trim() };
}
const stateObj = (arr) => { const o = {}; for (const s of arr || []) o[String(s.port)] = String(s.data); return o; };
// Token scale from the coin's own token details; if a coin JSON carries none, a non-MINIMA token gets 36 (8 decimals,
// Winiwa's and xWiniwa's scale, KissRunScaled's own default) and the case records that it was defaulted.
const coinForReplay = (c, withMeta) => {
  const hasScale = c.token && c.token.scale != null;
  const o = { coinid: c.coinid, address: c.address, amount: String(c.tokenamount != null ? c.tokenamount : c.amount), tokenid: c.tokenid,
    scale: hasScale ? Number(c.token.scale) : (same(c.tokenid, '0x00') ? 0 : 36), storestate: c.storestate === true || c.storestate === 'true' };
  if (!hasScale) o.scaleDefaulted = true;
  if (withMeta) { o.state = stateObj(c.state); if (c.created != null) o.created = Number(c.created); }
  return o;
};
// Build one KissRunScaled case per input from the node's own builder JSON (txnbasics reply) and signer list.
function replayCases(label, txnrow, signers, block, frozenTexts) {
  const t = txnrow.transaction;
  const scripts = {};
  for (const s of ((txnrow.witness || {}).scripts || [])) scripts[String(s.address).toUpperCase()] = s.script;
  const inputs = t.inputs.map((c) => coinForReplay(c, true));
  const outputs = t.outputs.map((c) => coinForReplay(c, false));
  const state = stateObj(t.state);
  const cases = [];
  const scriptSource = [];
  inputs.forEach((c, i) => {
    const addr = String(c.address).toUpperCase();
    let script = scripts[addr];
    let source = 'witness';
    if (script == null) { script = frozenTexts[addr]; source = script == null ? 'none' : 'frozen text (not in witness)'; }
    if (script != null && frozenTexts[addr] != null && script !== frozenTexts[addr]) source = 'witness (DIFFERS from the frozen text)';
    scriptSource.push({ input: i, address: c.address, source });
    if (script == null) return;   // a wallet coin: its script is the wallet's own, not a covenant under test
    cases.push({ name: label + '_in' + i, script, input: i, block, trace: true, state, inputs, outputs, signatures: signers });
  });
  return { cases, scriptSource };
}
function runReplay(classDir, cases, outFile) {
  fs.writeFileSync(outFile + '.cases.json', JSON.stringify(cases, null, 1));
  const r = spawnSync(JAVA, ['-cp', JAR + ';' + classDir, 'KissRunScaled', outFile + '.cases.json'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  fs.writeFileSync(outFile + '.stdout.txt', r.stdout || '');
  fs.writeFileSync(outFile + '.stderr.txt', r.stderr || '');
  if (r.status !== 0) throw new Error('replay java exit ' + r.status + ': ' + (r.stderr || '').slice(0, 400));
  const lines = (r.stdout || '').trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}
// The failing clause: the last top-level statement the trace printed before "Contract finished : false".
function lastStatement(trace) {
  let last = null;
  for (const line of String(trace || '').split(/\r?\n/)) {
    const m = /^INST\[\d+\] - ((?:ASSERT|RETURN|LET|IF|ELSEIF|ELSE|ENDIF|WHILE|EXEC|MAST)\b.*)$/.exec(line.trim());
    if (m) last = m[1].trim();
  }
  return last;
}
function attribute(spec, results) {
  const perInput = results.map((r) => ({ input: Number(String(r.name).split('_in').pop()), success: r.success === true,
    instructions: r.instructions, monotonic: r.monotonic, exception: r.exception || '', clause: r.success ? null : lastStatement(r.trace) }));
  const failing = perInput.filter((p) => !p.success).map((p) => p.input).sort();
  const expected = Object.keys(spec.expect).map(Number).sort();
  const sameInputs = failing.length === expected.length && failing.every((x, i) => x === expected[i]);
  const clauses = perInput.filter((p) => !p.success).map((p) => {
    const names = spec.expect[p.input] || [];
    const ok = names.some((nm) => CLAUSE[nm].test(p.clause || ''));
    return { input: p.input, clause: p.clause, expectedClause: names, match: ok };
  });
  const asPredicted = sameInputs && clauses.every((c) => c.match);
  return { perInput, failingInputs: failing, expectedFailingInputs: expected, sameInputs, clauses, asPredicted };
}

// Node's own script log (9101 stdout file): lines appended during a window that name one of our two scripts.
function nodeLogFile() {
  const files = fs.readdirSync(NODE_DIR).filter((f) => /^node-out-.*\.log$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(NODE_DIR, f)).mtimeMs }));
  files.sort((a, b) => b.t - a.t);
  return files.length ? path.join(NODE_DIR, files[0].f) : null;
}
function logSize(file) { try { return fs.statSync(file).size; } catch { return 0; } }
function logSince(file, from) {
  if (!file) return [];
  const size = logSize(file);
  if (size <= from) return [];
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(size - from);
  fs.readSync(fd, buf, 0, buf.length, from);
  fs.closeSync(fd);
  return buf.toString('utf8').split(/\r?\n/).filter((l) => /Script FAIL input:|SIGNATURE FAIL|Token Script FAIL/.test(l))
    .filter((l) => l.includes('LET op=STATE(8) ASSERT @INPUT EQ 0') || l.includes('LET op=STATE(8) IF op EQ 1 THEN ASSERT GETINADDR(0) EQ ' + REG) || /SIGNATURE FAIL/.test(l))
    .map((l) => l.length > 400 ? l.slice(0, 400) + ' ...' : l);
}

// ------------------------------------------------------------------------------------------------ chain reads
async function coinsAt(node, address) {
  const r = await rpc(node, 'coins address:' + address);
  return (r.response || []).map((c) => ({ coinid: c.coinid, tokenamount: c.tokenamount, amount: c.amount, tokenid: c.tokenid, storestate: c.storestate, state: c.state, spent: c.spent, created: c.created }));
}
async function readAddresses(where) {
  const o = {};
  for (const node of ['9101', '9201']) o[node] = { VAULT: await coinsAt(node, VAULT), REG: await coinsAt(node, REG) };
  note(PHASE, 'coins at VAULT and REG ' + where, { '9101': { VAULT: o['9101'].VAULT.map((c) => c.coinid + '=' + c.tokenamount), REG: o['9101'].REG.map((c) => c.coinid + '=' + c.tokenamount) },
    '9201': { VAULT: o['9201'].VAULT.map((c) => c.coinid + '=' + c.tokenamount), REG: o['9201'].REG.map((c) => c.coinid + '=' + c.tokenamount) } });
  return o;
}
async function coinById(node, coinid, { allowFail = false } = {}) {
  const r = await rpc(node, 'coins coinid:' + coinid, { allowFail });
  const list = (r.status === true && Array.isArray(r.response)) ? r.response : [];
  return list.find((c) => same(c.coinid, coinid)) || null;
}
// Waits until every coin is at least DEPTH blocks deep on 9101; a coin that disappears is a foreign spend.
async function waitDeep(coinids, label) {
  for (let loop = 0; ; loop++) {
    const tip = await tipOf('9101');
    let allDeep = true;
    const seen = [];
    for (const id of coinids) {
      const c = await coinById('9101', id);
      if (!c || c.spent === true) throw new Stop('an input of this run is spent or missing before its registered control', { label, coinid: id, coin: c });
      const depth = tip - Number(c.created);
      seen.push({ coinid: id, created: Number(c.created), depth });
      if (depth < DEPTH) allDeep = false;
    }
    if (allDeep) { note(PHASE, 'inputs at least ' + DEPTH + ' blocks deep on 9101 for ' + label, { tip, seen }); return seen; }
    if (loop > 90) throw new Stop('inputs did not reach depth ' + DEPTH + ' in time', { label, seen });
    await sleep(POLL_MS);
  }
}

// Finds the mined TxPoW by the transaction id: scans each block from the tip at post (the block's own transaction
// and every TxPoW in its txnlist), re-scanning a block whose id changed (a reorg). Stops after MINE_LIMIT blocks.
async function findMined(txnId, postTip) {
  const seenBlock = {};
  for (;;) {
    const tip = await tipOf('9101');
    for (let b = postTip; b <= tip; b++) {
      if (seenBlock[b] && b < tip - 3) continue;   // deep blocks already scanned; the last 3 are re-read for a reorg
      const blk = (await rpc('9101', 'txpow block:' + b)).response;
      if (seenBlock[b] === blk.txpowid) continue;
      seenBlock[b] = blk.txpowid;
      const own = blk.body && blk.body.txn && blk.body.txn.transactionid;
      if (own && same(own, txnId)) return { txpowid: blk.txpowid, block: b, blockid: blk.txpowid, inBlockItself: true };
      for (const id of ((blk.body && blk.body.txnlist) || [])) {
        const t = await rpc('9101', 'txpow txpowid:' + id, { allowFail: true });
        const tid = t.status && t.response && t.response.body && t.response.body.txn && t.response.body.txn.transactionid;
        if (tid && same(tid, txnId)) return { txpowid: id, block: b, blockid: blk.txpowid, inBlockItself: false };
      }
    }
    if (tip > postTip + MINE_LIMIT) throw new Stop('an honest control was not mined within 20 blocks', { txnId, postTip, tip });
    await sleep(POLL_MS);
  }
}

async function onchain(node, txpowid) { return (await rpc(node, 'txpow onchain:' + txpowid)).response; }
async function blockAt(node, b) { return (await rpc(node, 'txpow block:' + b)).response; }

// ------------------------------------------------------------------------------------------------ phase: P0
async function phaseP0() {
  fs.mkdirSync(EVID, { recursive: true });
  const st = { runId: RUN_ID, record: 'docs/STEP2-PRESEED-01.md (version 1, APPROVED 2026-09-29)', started: now(), completed: [], stopped: null,
    environment: {}, p0: {}, coins: {}, steps: {} };
  saveState(st);
  // P0.1 status on both nodes, health, versions, tips; 4.3 builder has no step2pre transaction.
  const s1 = await rpc('9101', 'status');
  const s2 = await rpc('9201', 'status');
  const health = {};
  for (const node of ['9101', '9201']) {
    const r = spawnSync(process.execPath, [HEALTH_TOOL, ...NODES[node].healthArgs], { encoding: 'utf8', timeout: 120000 });
    const m = /^\s*node\s+(\w+)/m.exec(r.stdout || '');
    health[node] = { command: 'node ' + path.relative(path.resolve(WORK, '..', '..', '..'), HEALTH_TOOL).split(path.sep).join('/') + ' ' + NODES[node].healthArgs.join(' '),
      exitCode: r.status, stdout: r.stdout, stderr: r.stderr, nodeState: m ? m[1] : null };
    logLine({ seq: ++SEQ, kind: 'tool', phase: PHASE, time: now(), ...health[node] });
  }
  const versions = { '9101': s1.response.version, '9201': s2.response.version };
  const t = { '9101': Number(s1.response.chain.block), '9201': Number(s2.response.chain.block) };
  st.environment = { os: { type: os.type(), release: os.release(), version: os.version(), arch: os.arch(), hostname: os.hostname() },
    nodejs: process.version, minima: versions, java: (spawnSync(JAVA, ['-version'], { encoding: 'utf8' }).stderr || '').trim(),
    status: { '9101': s1.response, '9201': s2.response } };
  st.p0.health = Object.fromEntries(Object.entries(health).map(([k, v]) => [k, { exitCode: v.exitCode, nodeState: v.nodeState }]));
  st.p0.tips = t;
  saveState(st);
  note(PHASE, 'P0.1 versions, tips, health', { versions, tips: t, health: st.p0.health });
  for (const node of ['9101', '9201']) if (health[node].nodeState !== 'healthy') throw new Stop('a node is not healthy at P0', { node, nodeState: health[node].nodeState });
  if (Math.abs(t['9101'] - t['9201']) > TIP_GAP) throw new Stop('the tips are more than 2 blocks apart at P0', t);
  const tl = await rpc('9101', 'txnlist');
  if (JSON.stringify(tl.response).includes('"step2pre')) throw new Stop('initial condition 4.3: a step2pre transaction is already in the builder', {});
  note(PHASE, '4.3 builder holds no step2pre transaction');

  // P0.2 hashes and runscript addresses.
  const hashes = FROZEN_FILES.map(([rel, want]) => { const got = sha256(fs.readFileSync(path.join(SIMCARD, rel))); return { file: rel, expected: want, measured: got, match: got === want }; });
  st.p0.hashes = hashes; saveState(st);
  note(PHASE, 'P0.2 source hashes', hashes.map((h) => h.file + ' ' + (h.match ? 'OK' : 'MISMATCH ' + h.measured)));
  if (!hashes.every((h) => h.match)) throw new Stop('a source hash mismatch at P0', hashes.filter((h) => !h.match));
  const regText = fs.readFileSync(path.join(SIMCARD, FROZEN_FILES[0][0]), 'utf8');
  const vaultText = fs.readFileSync(path.join(SIMCARD, FROZEN_FILES[1][0]), 'utf8');
  if (Buffer.byteLength(regText) !== 589 || Buffer.byteLength(vaultText) !== 465 || /\n/.test(regText) || /\n/.test(vaultText)) throw new Stop('a clean text is not the frozen single line', {});
  const idsCheck = { ACCT: sha256hex0x(ACCT_PREIMAGE) === ACCT, X: sha256hex0x(X_PREIMAGE) === X };
  st.p0.identityPreimages = idsCheck;
  if (!idsCheck.ACCT || !idsCheck.X) throw new Stop('an identity does not match its stated preimage', idsCheck);
  const rs = {};
  for (const [name, text, addr, mx] of [['REG', regText, REG, REG_MX], ['VAULT', vaultText, VAULT, VAULT_MX]]) {
    const r = await rpc('9101', 'runscript script:"' + text + '"');
    const clean = r.response.clean || {};
    rs[name] = { parseok: r.response.parseok, address: clean.address, mxaddress: clean.mxaddress, cleanInvariant: clean.script === text,
      addressMatch: same(clean.address, addr), mxMatch: same(clean.mxaddress, mx) };
    if (!rs[name].parseok || !rs[name].addressMatch || !rs[name].mxMatch || !rs[name].cleanInvariant) { st.p0.runscript = rs; saveState(st); throw new Stop('an address mismatch at P0 (runscript)', rs[name]); }
  }
  st.p0.runscript = rs; saveState(st);
  note(PHASE, 'P0.2 runscript addresses match section 4.2', rs);

  // P0.3 coins at REG and VAULT on both nodes (expected none; any found is a foreign fixture, never touched).
  const before = await readAddresses('at P0.3 (before registration)');
  st.p0.foreignFixtures = { '9101': [...before['9101'].VAULT, ...before['9101'].REG], '9201': [...before['9201'].VAULT, ...before['9201'].REG] };
  saveState(st);

  // P0.4 newscript on 9101 then 9201 (HP1).
  const hp1 = {};
  for (const node of ['9101', '9201']) {
    hp1[node] = {};
    for (const [name, text, addr] of [['REG', regText, REG], ['VAULT', vaultText, VAULT]]) {
      const r = await rpc(node, 'newscript trackall:true script:"' + text + '"');
      const got = r.response && r.response.address;
      hp1[node][name] = { address: got, match: same(got, addr), phantom: PHANTOMS.some((p) => same(p, got)) };
      if (!hp1[node][name].match) { st.p0.hp1 = hp1; saveState(st); throw new Stop('an address mismatch at P0 (newscript, HP1)', { node, name, got }); }
    }
  }
  st.p0.hp1 = hp1; saveState(st);
  note(PHASE, 'P0.4 newscript returns the frozen addresses on both nodes (HP1)', hp1);

  // P0.5 K1; P0.6 P and K2.
  const k = await rpc('9101', 'keys action:new');
  const K1 = k.response.publickey;
  const g = await rpc('9101', 'getaddress');
  const P = g.response.address, K2 = g.response.publickey;
  if (!/^0x[0-9A-F]+$/i.test(K1 || '') || !/^0x[0-9A-F]{64}$/i.test(P || '') || !/^0x[0-9A-F]+$/i.test(K2 || '')) throw new Stop('P0.5/P0.6 returned an unexpected shape', { K1, P, K2 });
  if (same(K1, K2)) throw new Stop('K1 equals K2', {});
  note(PHASE, 'P0.5 K1 and P0.6 P, K2', { K1, P, Pmx: g.response.miniaddress, K2, Pscript: g.response.script });

  // P0.7 funding coin F and the Winiwa balance.
  const tipNow = await tipOf('9101');
  const cs = (await rpc('9101', 'coins relevant:true sendable:true tokenid:' + WIN)).response || [];
  const cands = cs.filter((c) => same(c.tokenid, WIN) && c.spent !== true && c.tokenamount != null && /^\d+(\.\d+)?$/.test(String(c.tokenamount))
    && decimalsOf(c.tokenamount) <= 12 && decCmp(c.tokenamount, MIN_F) >= 0 && tipNow - Number(c.created) >= DEPTH);
  cands.sort((a, b) => decCmp(a.tokenamount, b.tokenamount) || (String(a.coinid) < String(b.coinid) ? -1 : 1));
  if (!cands.length) throw new Stop('initial condition 4.3: no Winiwa coin of at least 0.00000010 with at most 12 decimals', { returned: cs.length });
  const Fc = cands[0];
  const bal = await rpc('9101', 'balance');
  const winBal = (bal.response || []).find((b) => same(b.tokenid, WIN)) || null;
  note(PHASE, 'P0.7 F chosen (rule: the smallest qualifying coin, at least 3 deep; ties by coin id) and the Winiwa balance', { F: { coinid: Fc.coinid, amount: Fc.tokenamount, address: Fc.address, created: Fc.created }, candidates: cands.length, balance: winBal });

  // P0.8 the fixture block. Nothing in it changes after this.
  const replayDir = path.join(EVID, 'replay', 'classes');
  const replay = compileReplay(replayDir);
  const tipsP0 = await tips();
  const fixture = {
    runId: RUN_ID, writtenAt: now(), note: 'Record section 4.4 fixture block. Frozen before H01; every later phase re-checks the hashes below.',
    K1, K2, P, Pmx: g.response.miniaddress, F: { coinid: Fc.coinid, amount: String(Fc.tokenamount), address: Fc.address, created: Number(Fc.created) },
    tipsAtP0: tipsP0, runner: { file: 'measure/step2v2-preseed.mjs', sha256: sha256(fs.readFileSync(SELF)) },
    replay: { source: 'measure/java/KissRunScaled.java', sha256: replay.srcSha256, javac: replay.javac, jar: JAR, jarSha256: sha256(fs.readFileSync(JAR)) },
    identities: { REG, VAULT, WIN, XWIN, MAGIC, ACCT, X }, startBalanceWiniwa: winBal,
    refusalConstructions: Object.fromEntries([...R_GROUP_A, ...R_GROUP_B].map((n) => [n, refusalSpec(n, { K1, K2, P }, { R1: { coinid: '<R1>' }, L1: { coinid: '<L1>' }, C1: { coinid: '<C1>' }, L2: { coinid: '<L2>' } })])),
  };
  writeJSON(FIXTURE_FILE, fixture);
  st.fixture = fixture;
  st.fixtureSha256 = sha256(fs.readFileSync(FIXTURE_FILE));
  st.startBalance = winBal;
  saveState(st);
  note(PHASE, 'P0.8 fixture block written', { fixtureSha256: st.fixtureSha256, runnerSha256: fixture.runner.sha256 });
}

// ------------------------------------------------------------------------------------------------ phase: honest
async function phaseHonest(n) {
  const st = loadState();
  const fx = st.fixture;
  const spec = honestSpec(n, fx, st.coins);
  await checkTips('start of ' + n);
  await waitDeep(spec.inputs, n);
  const inputsSeen = {};
  // Informational: the witness does not track 9101's wallet coins (F, F'), so its read of those may be empty.
  for (const id of spec.inputs) inputsSeen[id] = { '9101': await coinById('9101', id), '9201': await coinById('9201', id, { allowFail: true }) };
  const before = await readAddresses('before ' + n);
  const cmds = buildCommands(spec);
  const replies = [];
  let txnrow = null, signReply = null, checkReply = null, exportReply = null;
  for (const c of cmds) {
    const r = await rpc('9101', c, { allowFail: c.startsWith('txnsign') });
    replies.push(r);
    if (c.startsWith('txnbasics')) txnrow = r.response;
    if (c.startsWith('txnsign')) {
      signReply = r.response;
      if (r.status !== true) {
        if (spec.sign === fx.K1) throw new Stop('HP5 failed: txnsign publickey:K1 refused', { id: spec.id, error: r.error });
        throw new Stop('txnsign refused on an honest control', { id: spec.id, error: r.error });
      }
    }
    if (c.startsWith('txncheck')) {
      checkReply = r;
      const f = flagsOf(r);
      note(PHASE, n + ' txncheck flags', { basic: f.basic, signatures: f.signatures, mmrproofs: f.mmrproofs, scripts: f.scripts });
      st.steps[n] = { spec, txncheck: r.response, flags: f };
      saveState(st);
      if (!(f.basic && f.signatures && f.mmrproofs && f.scripts)) throw new Stop('an honest txncheck flag is false', { id: spec.id, flags: f });
    }
    if (c.startsWith('txnexport')) exportReply = r.response;
  }
  const hex = String(exportReply.data);
  const bytes = (hex.length - 2) / 2;
  fs.mkdirSync(path.join(EVID, 'exports'), { recursive: true });
  fs.writeFileSync(path.join(EVID, 'exports', spec.id + '.hex'), hex);
  const exportSha = sha256(Buffer.from(hex, 'utf8'));
  const exportBytesSha = sha256(Buffer.from(hex.slice(2), 'hex'));
  const postTip = await tipOf('9101');
  const post = await rpc('9101', 'txnpost id:' + spec.id + ' txndelete:true');
  const txpow = post.response;
  const txnId = txpow.body.txn.transactionid;
  const prelim = txpow.txpowid;
  const outCoinIds = txpow.body.txn.outputs.map((o) => o.coinid);
  note(PHASE, n + ' posted', { transactionid: txnId, preliminaryTxpowid: prelim, postTip, outputCoinIds: outCoinIds });
  st.steps[n] = { ...st.steps[n], transactionid: txnId, preliminaryTxpowid: prelim, postTip, exportBytes: bytes, exportHexSha256: exportSha, exportBytesSha256: exportBytesSha,
    signingKeys: signReply ? signReply.keys : [], outputCoinIds: outCoinIds, inputsSeen, before };
  saveState(st);

  // Find the mined TxPoW by transaction id, then confirm on both nodes.
  const found = await findMined(txnId, postTip);
  note(PHASE, n + ' mined', found);
  st.steps[n].found = found; saveState(st);
  // The witness must report the same block; it may lag by a block or two.
  let w = null;
  for (let loop = 0; ; loop++) {
    w = await onchain('9201', found.txpowid);
    if (w.found === true) break;
    const t = await tips();
    if (t['9201'] >= found.block + DEPTH) throw new Stop('the two nodes report different blocks for one TxPoW (the witness does not have it)', { found, witness: w, tips: t });
    if (t['9101'] > found.block + MINE_LIMIT) throw new Stop('the witness never saw the mined TxPoW', { found, tips: t });
    await sleep(POLL_MS);
  }
  // Wait until 3 confirmations on 9101, then the final reads on both nodes.
  let p = null;
  for (let loop = 0; ; loop++) {
    p = await onchain('9101', found.txpowid);
    if (p.found !== true) throw new Stop('the mined TxPoW left the chain on 9101 (reorg)', { found, now: p });
    if (Number(p.confirmations) >= DEPTH) break;
    if (loop > 90) throw new Stop('confirmations did not reach 3 in time', { p });
    await sleep(POLL_MS);
  }
  const t = await checkTips('after ' + n + ' reached ' + DEPTH + ' confirmations');
  const final = { '9101': await onchain('9101', found.txpowid), '9201': await onchain('9201', found.txpowid) };
  if (final['9101'].found !== true || final['9201'].found !== true) throw new Stop('the two nodes report different blocks for one TxPoW (not found on one node at the final read)', final);
  const B = Number(final['9101'].block);
  const blk = { '9101': await blockAt('9101', B), '9201': await blockAt('9201', Number(final['9201'].block)) };
  const agree = final['9201'].found === true && Number(final['9201'].block) === B && same(final['9101'].blockid, final['9201'].blockid)
    && same(blk['9101'].txpowid, final['9101'].blockid) && same(blk['9201'].txpowid, final['9201'].blockid);
  const confirm = { block: B, blockid: final['9101'].blockid,
    perNode: Object.fromEntries(['9101', '9201'].map((k) => [k, { block: final[k].block, blockid: final[k].blockid, tip: final[k].tip, confirmations: final[k].confirmations, blockTxpowid: blk[k].txpowid }])),
    magic: blk['9101'].header && blk['9101'].header.magic, agree };
  note(PHASE, n + ' canonical block on both nodes', confirm);
  st.steps[n].confirm = confirm; saveState(st);
  if (!agree) throw new Stop('the two nodes report different blocks for one TxPoW', confirm);
  // The canonical TxPoW itself (size), the coins after, the new coin ids.
  const canon = (await rpc('9101', 'txpow txpowid:' + found.txpowid)).response;
  const after = await readAddresses('after ' + n);
  for (const [name, idx] of Object.entries(spec.creates)) {
    const o = spec.outputs[idx];
    st.coins[name] = { coinid: outCoinIds[idx], amount: o.amount, address: o.address, storestate: o.storestate, createdBy: n, outputIndex: idx };
  }
  const wit = (txnrow && txnrow.witness) || {};
  const counts = { inputs: checkReply.response.inputs, outputs: checkReply.response.outputs, signaturesInTxncheck: checkReply.response.signatures, tokens: checkReply.response.tokens,
    scriptsInWitness: (wit.scripts || []).length, mmrproofsInWitness: (wit.mmrproofs || []).length, signingKeys: ((signReply && signReply.keys) || []).length };
  st.steps[n] = { ...st.steps[n], canonicalTxpowid: found.txpowid, canonicalTxpowSize: canon.size, counts, after, tipsAtConfirm: t,
    explorer: EXPLORER + '/search?q=' + found.txpowid, completedAt: now() };
  // L1 replay of the honest transaction (instruction counts; not a gate).
  try {
    const cls = path.join(EVID, 'replay', 'classes');
    const frozen = { [REG]: fs.readFileSync(path.join(SIMCARD, FROZEN_FILES[0][0]), 'utf8'), [VAULT]: fs.readFileSync(path.join(SIMCARD, FROZEN_FILES[1][0]), 'utf8') };
    const { cases, scriptSource } = replayCases(n, txnrow, (signReply && signReply.keys) || [], found.block, frozen);
    if (cases.length) {
      const res = runReplay(cls, cases, path.join(EVID, 'replay', n));
      st.steps[n].replayL1 = { scriptSource, perInput: res.map((r) => ({ name: r.name, success: r.success, instructions: r.instructions, monotonic: r.monotonic })) };
    } else st.steps[n].replayL1 = { scriptSource, perInput: [] };
  } catch (e) { st.steps[n].replayL1 = { error: String(e.message || e) }; }
  writeJSON(path.join(EVID, 'steps', n + '.json'), st.steps[n]);
  saveState(st);
}

// ------------------------------------------------------------------------------------------------ phase: refusals
async function phaseRefusals(names) {
  const st = loadState();
  const fx = st.fixture;
  await checkTips('start of refusals ' + names[0] + '-' + names[names.length - 1]);
  const needed = names[0] === 'r01' ? ['R1', 'L1'] : ['C1', 'L2'];
  await waitDeep(needed.map((k) => st.coins[k].coinid), 'refusals');
  const logFile = nodeLogFile();
  const cls = path.join(EVID, 'replay', 'classes');
  const frozen = { [REG]: fs.readFileSync(path.join(SIMCARD, FROZEN_FILES[0][0]), 'utf8'), [VAULT]: fs.readFileSync(path.join(SIMCARD, FROZEN_FILES[1][0]), 'utf8') };
  const deviations = [];
  for (const n of names) {
    const spec = refusalSpec(n, fx, st.coins);
    const cmds = buildCommands(spec);
    let txnrow = null, signReply = null, checkReply = null, exportReply = null, logFrom = 0;
    const tipBuild = await tipOf('9101');
    for (const c of cmds) {
      if (c.startsWith('txncheck')) logFrom = logSize(logFile);
      const r = await rpc('9101', c, { allowFail: c.startsWith('txnsign') });
      if (c.startsWith('txnbasics')) txnrow = r.response;
      if (c.startsWith('txnsign')) {
        signReply = r.response;
        if (r.status !== true) {
          if (spec.sign === fx.K1) throw new Stop('HP5 failed: txnsign publickey:K1 refused', { id: spec.id, error: r.error });
          throw new Stop('a refusal behaving differently from section 7 (txnsign refused)', { id: spec.id, error: r.error });
        }
      }
      if (c.startsWith('txncheck')) checkReply = r;
      if (c.startsWith('txnexport')) exportReply = r.response;
    }
    await sleep(1500);
    const nodeLog = logSince(logFile, logFrom);
    const hex = String(exportReply.data);
    fs.mkdirSync(path.join(EVID, 'exports'), { recursive: true });
    fs.writeFileSync(path.join(EVID, 'exports', spec.id + '.hex'), hex);
    const del = await rpc('9101', 'txndelete id:' + spec.id);
    const reads = {};
    let unchanged = true;
    for (const id of spec.inputs) {
      reads[id] = { '9101': await coinById('9101', id), '9201': await coinById('9201', id) };
      for (const node of ['9101', '9201']) if (!reads[id][node] || reads[id][node].spent === true) unchanged = false;
    }
    const f = flagsOf(checkReply);
    const rec = { id: spec.id, change: spec.change, spec, tipAtBuild: tipBuild, txnrow, signingKeys: signReply ? signReply.keys : [], txncheck: checkReply.response,
      flags: { basic: f.basic, signatures: f.signatures, mmrproofs: f.mmrproofs, scripts: f.scripts }, exportBytes: (hex.length - 2) / 2,
      exportHexSha256: sha256(Buffer.from(hex, 'utf8')), exportBytesSha256: sha256(Buffer.from(hex.slice(2), 'hex')), posted: false, deleted: del.status === true,
      nodeScriptLog: nodeLog, inputReadsAfter: reads, inputsUnspentOnBothNodes: unchanged };
    // L1 attribution by in-process replay of this exact builder transaction.
    const { cases, scriptSource } = replayCases(n, txnrow, (signReply && signReply.keys) || [], tipBuild, frozen);
    const res = runReplay(cls, cases, path.join(EVID, 'replay', n));
    rec.replay = { scriptSource, ...attribute(spec, res) };
    const flagsAsPredicted = f.basic && f.signatures && f.mmrproofs && !f.scripts;
    rec.asPredicted = flagsAsPredicted && rec.replay.asPredicted && unchanged;
    st.steps[n] = rec;
    writeJSON(path.join(EVID, 'steps', n + '.json'), rec);
    saveState(st);
    note(PHASE, n + ' refused', { flags: rec.flags, failingInputs: rec.replay.failingInputs, clauses: rec.replay.clauses.map((c) => c.input + ': ' + c.clause + (c.match ? '' : ' (NOT the predicted clause)')),
      nodeLog: nodeLog.map((l) => l.slice(0, 120)), unspentOnBoth: unchanged, exportBytes: rec.exportBytes });
    if (f.scripts) throw new Stop('a refusal passed txncheck (scripts:true)', { id: spec.id, flags: rec.flags });
    if (!unchanged) throw new Stop('an input of a refusal is not shown unspent on both nodes', { id: spec.id, reads });
    if (!flagsAsPredicted || !rec.replay.asPredicted) deviations.push(n);
    if (deviations.length) throw new Stop('a refusal behaving differently from section 7', { id: spec.id, flags: rec.flags, replay: rec.replay.clauses, failing: rec.replay.failingInputs, expected: rec.replay.expectedFailingInputs });
  }
}

// ------------------------------------------------------------------------------------------------ phase: close
async function phaseClose() {
  const st = loadState();
  const t = await checkTips('closing reads');
  const bal = await rpc('9101', 'balance');
  const winBal = (bal.response || []).find((b) => same(b.tokenid, WIN)) || null;
  const addrs = await readAddresses('at the closing reads');
  const ours = new Set(Object.values(st.coins).filter((c) => same(c.address, VAULT) || same(c.address, REG)).map((c) => String(c.coinid).toUpperCase()));
  const left = [];
  for (const node of ['9101', '9201']) for (const k of ['VAULT', 'REG']) for (const c of addrs[node][k]) if (ours.has(String(c.coinid).toUpperCase()) && c.spent !== true) left.push({ node, k, coinid: c.coinid });
  const s0 = st.startBalance || {};
  const cmp = (f) => (s0[f] != null && winBal && winBal[f] != null) ? decCmp(String(s0[f]), String(winBal[f])) === 0 : null;
  // The balance compared is the total the wallet holds (confirmed + unconfirmed); each part is reported too.
  const totalOf = (b) => (b && b.confirmed != null && b.unconfirmed != null) ? decAdd(String(b.confirmed), String(b.unconfirmed)) : null;
  const t0 = totalOf(s0), t1 = totalOf(winBal);
  const totalEqual = t0 != null && t1 != null ? decCmp(t0, t1) === 0 : null;
  const hp4 = { oursLeftAtVaultOrReg: left, start: s0, end: winBal, startTotal: t0, endTotal: t1, totalEqual,
    confirmedEqual: cmp('confirmed'), unconfirmedEqual: cmp('unconfirmed'), sendableEqual: cmp('sendable'), pass: left.length === 0 && totalEqual === true };
  st.close = { tips: t, balance: winBal, addresses: addrs, hp4, at: now() };
  writeJSON(path.join(EVID, 'steps', 'close.json'), st.close);
  saveState(st);
  note(PHASE, 'closing reads', { hp4: { left, totalEqual, startTotal: t0, endTotal: t1, confirmedEqual: hp4.confirmedEqual, unconfirmedEqual: hp4.unconfirmedEqual, sendableEqual: hp4.sendableEqual, pass: hp4.pass } });
}

// ------------------------------------------------------------------------------------------------ dispatcher
async function runPhase(phase) {
  PHASE = phase;
  const idx = ORDER.indexOf(phase);
  if (idx < 0) throw new Precondition('unknown phase ' + phase);
  let st = loadState();
  if (phase === 'p0' && st) throw new Precondition('the run has already started (run-state.json exists); P0 runs once');
  if (phase !== 'p0') {
    if (!st) throw new Precondition('P0 has not run');
    if (st.stopped) throw new Precondition('the run is stopped: ' + st.stopped.condition);
    if (st.completed[st.completed.length - 1] !== ORDER[idx - 1]) throw new Precondition('out of order: last completed ' + st.completed[st.completed.length - 1] + ', asked ' + phase);
    const runnerNow = sha256(fs.readFileSync(SELF));
    const fixtureNow = sha256(fs.readFileSync(FIXTURE_FILE));
    if (runnerNow !== st.fixture.runner.sha256 || fixtureNow !== st.fixtureSha256) {
      throw new Stop('the runner or the fixture block changed after P0.8', { runnerNow, runnerFixed: st.fixture.runner.sha256, fixtureNow, fixtureFixed: st.fixtureSha256 });
    }
  }
  SEQ = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).length : 0;
  note(phase, 'phase start');
  if (phase === 'p0') await phaseP0();
  else if (phase.startsWith('h')) await phaseHonest(phase);
  else if (phase === 'r01-r12') await phaseRefusals(R_GROUP_A);
  else if (phase === 'r13-r14') await phaseRefusals(R_GROUP_B);
  else if (phase === 'close') await phaseClose();
  st = loadState();
  st.completed.push(phase);
  saveState(st);
  note(phase, 'phase complete');
}

// ------------------------------------------------------------------------------------------------ offline modes
// selftest: node-shaped synthetic transactions (random ids and keys, the real texts and addresses) through the same
// replay and attribution code, for the six honest shapes (all inputs must pass) and the fourteen refusals.
function selftest() {
  const rnd = () => '0x' + Array.from({ length: 64 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
  const fx = { K1: rnd(), K2: rnd(), P: rnd(), F: { coinid: rnd(), amount: '12.5' } };
  const tok = { tokenid: WIN, scale: '36', decimals: 8 };
  const regState = [{ port: 0, data: MAGIC }, { port: 1, data: ACCT }, { port: 2, data: fx.K1 }, { port: 3, data: fx.P }, { port: 12, data: WIN }];
  const coin = (address, amount, storestate, state) => ({ coinid: rnd(), address, amount: 'raw', tokenamount: amount, tokenid: WIN, token: tok, storestate, state: state || [], created: 2339100 });
  const coins = {
    R1: coin(REG, ONE, true, regState), L1: coin(VAULT, '0.00000003', true, regState), C1: coin(VAULT, '0.00000002', false),
    L2: coin(VAULT, '0.00000002', true, [regState[0], regState[1], regState[3]]), R2: coin(REG, ONE, true, regState), M1: coin(VAULT, '0.00000004', false), R3: coin(REG, ONE, true, regState),
    Fp: coin(fx.P, '12.49999996', false),
  };
  coins.Fp.amount = '12.49999996';   // run-state coins carry the token amount in `amount` (as honestSpec reads it)
  const byId = Object.fromEntries(Object.values(coins).map((c) => [c.coinid, c]));
  const frozen = { [REG]: fs.readFileSync(path.join(SIMCARD, FROZEN_FILES[0][0]), 'utf8'), [VAULT]: fs.readFileSync(path.join(SIMCARD, FROZEN_FILES[1][0]), 'utf8') };
  const asRow = (spec) => ({ transaction: { inputs: spec.inputs.map((id) => byId[id] || coin(fx.P, fx.F.amount, false)),
    outputs: spec.outputs.map((o) => ({ address: o.address, amount: 'raw', tokenamount: o.amount, tokenid: WIN, token: tok, storestate: o.storestate })),
    state: stateEntries(spec.state).map(([p, v]) => ({ port: p, data: String(v) })) },
  witness: { scripts: [{ address: REG, script: frozen[REG] }, { address: VAULT, script: frozen[VAULT] }] } });
  const signerOf = (s) => (s === 'auto' ? [fx.K2] : s ? [s] : []);
  const dir = path.join(process.env.TEMP || os.tmpdir(), 'preseed-selftest-' + Date.now());
  const cls = path.join(dir, 'classes');
  compileReplay(cls);
  let ok = true;
  for (const n of ['h01', 'h02', 'h03', 'h04', 'h05', 'h06']) {
    const spec = honestSpec(n, fx, coins);
    const { cases } = replayCases(n, asRow(spec), signerOf(spec.sign), 2339200, frozen);
    const res = cases.length ? runReplay(cls, cases, path.join(dir, n)) : [];
    const pass = res.every((r) => r.success);
    ok = ok && pass;
    console.log(n, pass ? 'all inputs pass' : 'FAIL', res.map((r) => r.instructions + (r.success ? '' : '!')).join('/'));
  }
  for (const n of [...R_GROUP_A, ...R_GROUP_B]) {
    const spec = refusalSpec(n, fx, coins);
    const { cases } = replayCases(n, asRow(spec), signerOf(spec.sign), 2339200, frozen);
    const res = runReplay(cls, cases, path.join(dir, n));
    const a = attribute(spec, res);
    ok = ok && a.asPredicted;
    console.log(n, a.asPredicted ? 'as predicted' : 'NOT AS PREDICTED', a.perInput.map((p) => p.instructions + (p.success ? '' : '!')).join('/'), JSON.stringify(a.clauses.map((c) => c.input + ':' + c.clause + (c.match ? '' : ' <-- no match'))));
  }
  console.log('decimal checks', decSub('12.5', '0.00000004'), decSub('100', '0.00000004'), decSub('0.00000010', '0.00000004'), decAdd('0.00000001', '0.00000003'), decCmp('0.0000001', '0.00000010'), decimalsOf('1.123456789012'), decimalsOf('0.00000001000'));
  console.log('identity preimages', sha256hex0x(ACCT_PREIMAGE) === ACCT, sha256hex0x(X_PREIMAGE) === X);
  console.log(ok ? 'SELFTEST PASS' : 'SELFTEST FAIL');
  process.exitCode = ok ? 0 : 1;
}
function plan() {
  const fx = { K1: '<K1>', K2: '<K2>', P: '<P>', F: { coinid: '<F>', amount: '12.5' } };
  const coins = Object.fromEntries(['R1', 'L1', 'C1', 'L2', 'R2', 'M1', 'R3'].map((k) => [k, { coinid: '<' + k + '>' }]));
  coins.Fp = { coinid: '<Fp>', amount: '12.49999996' };
  for (const n of ['h01', 'r01-r12', 'h02', 'h03', 'r13-r14', 'h04', 'h05', 'h06']) {
    const list = n.startsWith('h') ? [honestSpec(n, fx, coins)] : (n === 'r01-r12' ? R_GROUP_A : R_GROUP_B).map((r) => refusalSpec(r, fx, coins));
    console.log('\n## ' + n);
    for (const s of list) {
      console.log('# ' + s.id + (s.change ? ' (' + s.change + ')' : '') + (s.expect ? ' expect ' + JSON.stringify(s.expect) : ''));
      for (const c of buildCommands(s)) console.log(c);
      console.log(n.startsWith('h') ? 'txnpost id:' + s.id + ' txndelete:true' : 'txndelete id:' + s.id);
    }
  }
}

// ------------------------------------------------------------------------------------------------ main
const arg = process.argv[2];
if (arg === 'selftest') selftest();
else if (arg === 'plan') plan();
else if (ORDER.includes(arg)) {
  try {
    await runPhase(arg);
  } catch (e) {
    if (e instanceof Precondition) { console.error('not run: ' + e.message); process.exitCode = 1; }
    else {
    const isStop = e instanceof Stop;
    const rec = { runId: RUN_ID, phase: arg, time: now(), stop: isStop, condition: isStop ? e.condition : 'runner error (a harness defect is a stop: no debugging inside the run)',
      detail: isStop ? e.detail : String(e && e.stack || e) };
    if (fs.existsSync(EVID)) {
      writeJSON(path.join(EVID, 'HARD_STOP.json'), rec);
      const st = loadState();
      if (st) { st.stopped = rec; saveState(st); }
      logLine({ seq: ++SEQ, kind: 'stop', phase: arg, time: now(), ...rec });
    }
    console.error('STOP: ' + rec.condition);
    console.error(JSON.stringify(rec.detail, null, 1));
    process.exitCode = 2;
    }
  }
} else {
  console.log('usage: node step2v2-preseed.mjs <selftest|plan|' + ORDER.join('|') + '>');
  process.exitCode = 1;
}
