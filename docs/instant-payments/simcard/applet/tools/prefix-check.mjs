// Negative control for the gap fixes of 2026-09-29 (docs/simulator-status.md, "fixed"): the NEW relay cases and tear
// scenarios must FAIL on the build from before the fixes, or they prove nothing.
//
// The pre-fix build is the card source saved before the fixes (prefix/card-src-before-2026-09-29-gap-fixes, byte for
// byte the applet that produced the 2026-09-29 results before this change) compiled with the instrumented Persist/Ram
// (src/tear), run by the same host harness with the chain model on the defund rule of the measured
// kiss/balance/chip_account.kiss (-Dstables.d1=per-voucher). The post-fix run uses build/sim-tear and the cumulative rule
// of kiss/balance/chip_account_v2_cumulative.kiss. Also writes results/lx16-fixtures-prefix.json (pre-fix card-made
// vouchers) for crosscheck/d1-order-check.mjs. Writes results/prefix-check.md. Run after `ant host`.
//
//   node tools/prefix-check.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JDK = process.env.JAVA_HOME || 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot';
const JAVAC = join(JDK, 'bin', 'javac.exe');
const JAVA = join(JDK, 'bin', 'java.exe');
const PREFIX_SRC = join(ROOT, 'prefix', 'card-src-before-2026-09-29-gap-fixes');
const JCARDSIM = join(ROOT, 'lib', 'jcardsim-3.0.6.0.jar');
const OUT = join(ROOT, 'build', 'prefix');
if (!existsSync(join(ROOT, 'build', 'host'))) throw new Error('run `ant host` first');

// 1. the pre-fix card classes, with the instrumented persistence layer
rmSync(OUT, { recursive: true, force: true });
const src = join(OUT, 'src', 'org', 'stables', 'card');
mkdirSync(src, { recursive: true });
cpSync(join(PREFIX_SRC, 'org', 'stables', 'card'), src, { recursive: true });
for (const f of ['Persist.java', 'Ram.java']) cpSync(join(ROOT, 'src', 'tear', 'org', 'stables', 'card', f), join(src, f));
mkdirSync(join(OUT, 'classes'), { recursive: true });
execFileSync(JAVAC, ['--release', '11', '-nowarn', '-encoding', 'UTF-8', '-g', '-cp', JCARDSIM, '-d', join(OUT, 'classes'),
  ...readdirSync(src).filter((f) => f.endsWith('.java')).map((f) => join(src, f))], { stdio: 'pipe' });

const cp = (card) => [join(ROOT, 'build', 'simshim'), JCARDSIM, card, join(ROOT, 'build', 'host')].join(';');
const PRE = { cp: cp(join(OUT, 'classes')), rule: 'per-voucher', tag: 'pre-fix' };
const POST = { cp: cp(join(ROOT, 'build', 'sim-tear')), rule: 'cumulative', tag: 'post-fix' };
function run(b, args) {
  try {
    return execFileSync(JAVA, [`-Dstables.d1=${b.rule}`, '-cp', b.cp, 'org.stables.host.Main', ...args],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
}

// 2. the new relay cases on both builds
const GROUPS = 'defund order|ticket reuse';
function relayRows(file) {
  const rows = new Map();
  for (const line of readFileSync(join(ROOT, 'results', file), 'utf8').split('\n')) {
    const m = line.match(/^\| (\d+) \| ([^|]+) \| (.+) \| (pass|\*\*FAIL\*\*) \| (.*) \|$/);
    if (m) rows.set(m[3].trim(), { group: m[2].trim(), pass: m[4] === 'pass', detail: m[5].trim() });
  }
  return rows;
}
run(POST, ['relay', GROUPS, 'prefix-check-relay-postfix.md']);
run(PRE, ['relay', GROUPS, 'prefix-check-relay-prefix.md']);
const rPost = relayRows('prefix-check-relay-postfix.md');
const rPre = relayRows('prefix-check-relay-prefix.md');

// what each new case must do on the pre-fix build
const expectPre = (name) => {
  if (/^double defund attempts|^modify: a voucher/.test(name)) return 'pass'; // safety guards: hold on both builds
  if (/^documented residual/.test(name)) return 'info'; // documents a limit of the fix, not a fix case
  return 'fail';
};

// 3. the new tear scenarios on both builds
const TEAR = 'defund twice|two payers';
function tearRows(file) {
  const rows = new Map();
  const text = readFileSync(join(ROOT, 'results', file), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\| ([^|]+) \| ([^|]+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|$/);
    if (m) rows.set(m[1].trim(), { points: Number(m[5]) + Number(m[6]), failures: Number(m[7]) });
  }
  const first = (text.split('\n').find((l) => /\*\*FAIL\*\*/.test(l)) || '').slice(0, 500);
  return { rows, first };
}
run(POST, ['tear', TEAR, 'prefix-check-tear-postfix.md']);
run(PRE, ['tear', TEAR, 'prefix-check-tear-prefix.md']);
const tPost = tearRows('prefix-check-tear-postfix.md');
const tPre = tearRows('prefix-check-tear-prefix.md');

// 4. pre-fix card-made vouchers for the KISS order check
run(PRE, ['fixtures', 'lx16-fixtures-prefix.json']);

// 5. report
const lines = [];
let ok = true;
for (const [name, post] of rPost) {
  const pre = rPre.get(name);
  const want = expectPre(name);
  const verdict = !post.pass ? 'FAIL (post-fix build fails)'
    : want === 'fail' ? (pre && !pre.pass ? 'proven: fails before, passes after' : '**NOT PROVEN** (passes on the pre-fix build)')
    : want === 'pass' ? (pre && pre.pass ? 'safety guard: passes on both' : '**UNEXPECTED** pre-fix failure')
    : 'informational';
  if (verdict.startsWith('FAIL') || verdict.startsWith('**')) ok = false;
  lines.push(`| relay | ${post.group} | ${name} | ${post.pass ? 'pass' : '**FAIL**'} | ${pre ? (pre.pass ? 'pass' : 'FAIL: ' + pre.detail.replace(/\|/g, '/').slice(0, 220)) : 'not run'} | ${verdict} |`);
}
for (const [name, post] of tPost.rows) {
  const pre = tPre.rows.get(name);
  const verdict = post.failures > 0 ? 'FAIL (post-fix build fails)'
    : pre && pre.failures > 0 ? 'proven: fails before, passes after' : '**NOT PROVEN**';
  if (!verdict.startsWith('proven')) ok = false;
  lines.push(`| tear | scenario | ${name} | ${post.points - post.failures} of ${post.points} points pass | ${pre ? `${pre.failures} of ${pre.points} points FAIL` : 'not run'} | ${verdict} |`);
}
const md = ['# Pre-fix check: the new cases fail on the build from before the gap fixes', '',
  'Negative control (simulator only). Pre-fix build: `prefix/card-src-before-2026-09-29-gap-fixes` (the card source as it was',
  'before the fixes) with the instrumented Persist/Ram, and the chain model on the defund rule of the measured',
  '`kiss/balance/chip_account.kiss` (per-voucher amount, key index above the last). Post-fix build: `build/sim-tear` with the',
  'cumulative rule of `kiss/balance/chip_account_v2_cumulative.kiss`. Same host harness for both (tools/prefix-check.mjs).',
  'Per-row details: `results/prefix-check-*.md`.', '',
  `**${ok ? 'Every fix case fails on the pre-fix build and passes on the fixed build; the safety guards pass on both.' : 'NOT all fix cases are proven: see the table.'}**`, '',
  '| Harness | Group | Case | Fixed build | Pre-fix build | Verdict |', '|---|---|---|---|---|---|', ...lines, '',
  `First failing tear row on the pre-fix build (truncated): ${tPre.first.replace(/\|/g, '/')}`, ''].join('\n');
writeFileSync(join(ROOT, 'results', 'prefix-check.md'), md);
console.log(lines.join('\n'));
console.log(ok ? 'prefix check: every fix case proven' : 'prefix check: NOT all proven');
process.exit(ok ? 0 : 1);
