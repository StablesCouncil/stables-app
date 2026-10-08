// POST-based Minima RPC client for Phase 1 measurements (Stables payment account).
//
// The node's RPC (system/network/rpc/CMDHandler.java) accepts POST with the raw command as the body,
// which avoids the URL-length limit of the GET helper (task_test_channel/tools/minima-rpc.mjs) for the
// large state parameters these measurements need (a Lamport signature is 8 to 16 KB of hex).
// Node's own HTTP client rejects the node's reply (println after a Content-length header -> ECONNRESET),
// so this talks raw TCP, curl-style: write the request, read until the node closes, parse the body.
//
// Only read-only / dry-run commands are allowed here. Nothing posts, signs, or changes wallet state.
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const RECEIPTS = join(HERE, 'receipts');
const HOST = process.env.MINIMA_RPC_HOST || '127.0.0.1';
const PORT = Number(process.env.MINIMA_RPC_PORT || 9105);
const CRLF = String.fromCharCode(13, 10);

const ALLOWED = new Set(['runscript', 'mmrcreate', 'hash', 'status', 'help', 'txncreate', 'txninput',
  'txnoutput', 'txnstate', 'txnscript', 'txncheck', 'txnbasics', 'txnlist', 'txnexport', 'txndelete']);

export function rpc(command, { timeoutMs = 300000 } = {}) {
  const verb = command.trim().split(/\s+/)[0].toLowerCase();
  if (!ALLOWED.has(verb)) throw new Error('command not on the Phase 1 allow-list: ' + verb);
  if (command.includes(';')) throw new Error('semicolons split commands on the node; refusing');
  const body = Buffer.from(command, 'utf8');
  const head = Buffer.from(['POST / HTTP/1.1', 'Host: ' + HOST, 'Content-Type: text/plain',
    'Content-Length: ' + body.length, 'Connection: close', '', ''].join(CRLF), 'utf8');
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: HOST, port: PORT });
    const chunks = [];
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('RPC timeout')); }, timeoutMs);
    sock.on('connect', () => { sock.write(head); sock.end(body); });
    sock.on('data', (c) => chunks.push(c));
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
    sock.on('close', () => {
      clearTimeout(timer);
      const text = Buffer.concat(chunks).toString('utf8');
      const i = text.indexOf('{');
      const payload = i >= 0 ? text.slice(i).trim() : text.trim();
      try { resolve(JSON.parse(payload)); } catch { reject(new Error('non-JSON reply (' + text.length + ' chars): ' + text.slice(0, 300))); }
    });
  });
}

let cachedVersion = null;
export async function nodeVersion() {
  if (!cachedVersion) {
    const s = await rpc('status');
    cachedVersion = { version: s.response.version, block: s.response.chain.block, rpcPort: PORT };
  }
  return cachedVersion;
}

export function saveReceipt(name, obj) {
  mkdirSync(RECEIPTS, { recursive: true });
  const file = join(RECEIPTS, name + '.json');
  writeFileSync(file, JSON.stringify(obj, null, 2));
  return file;
}

// The instruction count from a runscript trace: the "Contract instructions : N" line (written at the end
// of Contract.run), else the highest INST[n] prefix seen.
export function instructionsFromTrace(trace) {
  const m = trace.match(/Contract instructions : (\d+)/);
  if (m) return Number(m[1]);
  let max = 0;
  for (const mm of trace.matchAll(/INST\[(\d+)\]/g)) max = Math.max(max, Number(mm[1]));
  return max;
}

export function quoteScript(script) {
  return 'script:"' + script.replace(/"/g, '\\"') + '"';
}

// runscript wrapper. state / prevstate: {port: value}. Returns a compact result plus the instruction count.
export async function runscript(script, { state = {}, prevstate = {}, globals = {}, signatures = [], keepTrace = false } = {}) {
  const q = (o) => JSON.stringify(o);
  let cmd = 'runscript ' + quoteScript(script);
  if (Object.keys(state).length) cmd += ' state:' + q(state);
  if (Object.keys(prevstate).length) cmd += ' prevstate:' + q(prevstate);
  if (Object.keys(globals).length) cmd += ' globals:' + q(globals);
  if (signatures.length) cmd += ' signatures:' + q(signatures);
  const t0 = Date.now();
  const r = await rpc(cmd);
  const ms = Date.now() - t0;
  if (!r.status) return { ok: false, error: r.error || 'status false', ms, commandBytes: Buffer.byteLength(cmd) };
  const resp = r.response;
  const trace = resp.trace || '';
  const exc = (trace.match(/Execution Error - (.*)/) || [])[1] || null;
  const out = {
    ok: true, parseok: resp.parseok, success: resp.success, monotonic: resp.monotonic,
    instructions: instructionsFromTrace(trace), executionError: exc ? exc.slice(0, 300) : null,
    scriptChars: script.length, cleanScriptChars: resp.clean.script.length,
    address: resp.clean.address, commandBytes: Buffer.byteLength(cmd), traceChars: trace.length, rpcMs: ms,
  };
  if (keepTrace) out.trace = trace;
  return out;
}
