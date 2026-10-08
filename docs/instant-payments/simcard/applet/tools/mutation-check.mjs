// Negative controls for the tear harness: a harness that never fails proves nothing.
//
// Each mutant is a deliberately broken copy of the instrumented applet source (build/tear-src, made by `ant host`)
// with ONE change that breaks commit-then-emit or atomicity. The tear harness must FAIL on every mutant, on the
// invariant the mutation attacks. Writes results/mutation-check.md. Run after `ant host`.
//
//   node tools/mutation-check.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JDK = process.env.JAVA_HOME || 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot';
const JAVAC = join(JDK, 'bin', 'javac.exe');
const JAVA = join(JDK, 'bin', 'java.exe');
const SRC = join(ROOT, 'build', 'tear-src');
const APPLET = 'org/stables/card/StablesApplet.java';
const JCARDSIM = join(ROOT, 'lib', 'jcardsim-3.0.6.0.jar');
if (!existsSync(SRC)) throw new Error('run `ant host` first (build/tear-src missing)');

const mutants = [
  {
    id: 'M1', scenario: 'tap (PIN-less)', expect: 'I1 (value lost)',
    what: 'PAY commits the debit in its own transaction, before the pending entry is written',
    from: '        Persist.write(tTmp, T_A, pSlots, (short) (o + Proto.SL_BAL), Proto.AMT);\n        Persist.write(tTmp, T_C, pSlots, (short) (o + Proto.SL_S), Proto.AMT);',
    to: '        Persist.write(tTmp, T_A, pSlots, (short) (o + Proto.SL_BAL), Proto.AMT);\n        Persist.commit();\n        Persist.begin();\n        Persist.write(tTmp, T_C, pSlots, (short) (o + Proto.SL_S), Proto.AMT);',
  },
  {
    id: 'M2', scenario: 'tap (PIN-less)', expect: 'I1 or I4 (credited and cancelled)',
    what: 'CREDIT marks the nonce credited after the commit instead of inside it',
    from: '        Persist.setByte(pCredited, bi, nb);\n        release(slot, tTmp, T_C);',
    to: '        release(slot, tTmp, T_C);',
    from2: '        Persist.setByte(pState, Proto.G_SW_PAID, (byte) 1);\n        }\n        Persist.commit();\n        // then emit',
    to2: '        Persist.setByte(pState, Proto.G_SW_PAID, (byte) 1);\n        }\n        Persist.commit();\n        Persist.setByte(pCredited, bi, nb);\n        // then emit',
  },
  {
    id: 'M3', scenario: 'defund', expect: 'I3 (one key, two digests)',
    what: 'DEFUND marks its LX16 key used only after committing the voucher',
    from: '        Persist.setByte(pKeyUsed, ubi, ub);\n        Persist.setShort(pState, Proto.G_KEYNEXT, (short) (ki + 1));\n',
    to: '',
    from2: '        Persist.setByte(pState, Proto.G_VNEXT, (byte) ((short) (vi + 1) % Proto.VOUCH_N));\n        Persist.commit();',
    to2: '        Persist.setByte(pState, Proto.G_VNEXT, (byte) ((short) (vi + 1) % Proto.VOUCH_N));\n        Persist.commit();\n        Persist.setByte(pKeyUsed, ubi, ub);\n        Persist.setByte(pState, (short) (Proto.G_KEYNEXT + 1), (byte) (ki + 1));',
  },
  {
    id: 'M4', scenario: 'cancel', expect: 'I1 (value created)',
    what: 'CANCEL restores the balance but marks the entry cancelled in a separate transaction',
    from: '        Persist.write(tTmp, T_B, pSlots, (short) (o + Proto.SL_S), Proto.AMT);\n        Persist.setByte(pPend, (short) (po + Proto.PE_STATUS), Proto.PS_CANCELLED);',
    to: '        Persist.write(tTmp, T_B, pSlots, (short) (o + Proto.SL_S), Proto.AMT);\n        Persist.commit();\n        Persist.begin();\n        Persist.setByte(pPend, (short) (po + Proto.PE_STATUS), Proto.PS_CANCELLED);',
  },
  {
    id: 'M5', scenario: 'wrong PIN', expect: 'I2 (PIN try given back after the compare)',
    what: 'VERIFY_PIN decrements the try counter inside a transaction, so a tear after the compare rolls it back',
    from: '        Persist.setByte(pState, Proto.G_PINTRIES, (byte) (tries - 1));\n        Persist.secretCompare((byte) tries, pState, Proto.G_PINTRIES);\n        if (!U.ctEquals(tIn, (short) 0, pPin, (short) 0, pl)) {',
    to: '        Persist.begin();\n        Persist.setByte(pState, Proto.G_PINTRIES, (byte) (tries - 1));\n        Persist.secretCompare((byte) tries, pState, Proto.G_PINTRIES);\n        boolean okPin = U.ctEquals(tIn, (short) 0, pPin, (short) 0, pl);\n        Persist.setByte(pState, Proto.G_HOOK_STATUS, (byte) 0);\n        Persist.commit();\n        if (!okPin) {',
  },
  {
    id: 'M6', scenario: 'wrong PIN', expect: 'I2 (PIN compared before the try is spent)',
    what: 'VERIFY_PIN compares the PIN first and spends the try afterwards',
    from: '        Persist.setByte(pState, Proto.G_PINTRIES, (byte) (tries - 1));\n        Persist.secretCompare((byte) tries, pState, Proto.G_PINTRIES);\n        if (!U.ctEquals(tIn, (short) 0, pPin, (short) 0, pl)) {',
    to: '        Persist.secretCompare((byte) tries, pState, Proto.G_PINTRIES);\n        boolean okPin = U.ctEquals(tIn, (short) 0, pPin, (short) 0, pl);\n        Persist.setByte(pState, Proto.G_PINTRIES, (byte) (tries - 1));\n        if (!okPin) {',
  },
  // gap fixes of 2026-09-29: the new commits must be atomic too
  {
    id: 'M7', scenario: 'receive ticket used by two payers', expect: 'I1 (value created: a re-sent transfer loads twice)',
    what: 'CREDIT on a receive ticket records the transfer in the ticket log after the commit instead of inside it',
    from: '        Persist.write(tTmp, T_DIG, pTkLog, (short) (ln * Proto.TKLOG_LEN), Proto.TKLOG_LEN);\n        Persist.setByte(pState, Proto.G_TK_LOGN, (byte) (ln + 1));\n',
    to: '',
    from2: '        Persist.setByte(pState, Proto.G_CLOGNEXT, (byte) ((short) (cl + 1) % Proto.CLOG_N));\n        Persist.commit();\n',
    to2: '        Persist.setByte(pState, Proto.G_CLOGNEXT, (byte) ((short) (cl + 1) % Proto.CLOG_N));\n        Persist.commit();\n        Persist.write(tTmp, T_DIG, pTkLog, (short) (ln * Proto.TKLOG_LEN), Proto.TKLOG_LEN);\n        Persist.setByte(pState, Proto.G_TK_LOGN, (byte) (ln + 1));\n',
  },
  {
    id: 'M8', scenario: 'defund twice, chain out of order', expect: 'I1 (value lost: a later voucher carries too low a total)',
    what: 'DEFUND commits its cumulative defunded total D in a second transaction, after the voucher',
    from: '        Persist.write(tTmp, T_B, pSlots, (short) (o + Proto.SL_D), Proto.AMT);\n        Persist.setByte(pKeyUsed, ubi, ub);',
    to: '        Persist.setByte(pKeyUsed, ubi, ub);',
    from2: '        Persist.setByte(pState, Proto.G_VNEXT, (byte) ((short) (vi + 1) % Proto.VOUCH_N));\n        Persist.commit();\n        tSess[SS_PIN_OK] = 0;',
    to2: '        Persist.setByte(pState, Proto.G_VNEXT, (byte) ((short) (vi + 1) % Proto.VOUCH_N));\n        Persist.commit();\n        Persist.begin();\n        Persist.write(tTmp, T_B, pSlots, (short) (o + Proto.SL_D), Proto.AMT);\n        Persist.commit();\n        tSess[SS_PIN_OK] = 0;',
  },
];

const rows = [];
for (const m of mutants) {
  const dir = join(ROOT, 'build', 'mutants', m.id);
  rmSync(dir, { recursive: true, force: true });
  cpSync(SRC, join(dir, 'src'), { recursive: true });
  const file = join(dir, 'src', APPLET);
  let text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  for (const [a, b] of [[m.from, m.to], [m.from2, m.to2]]) {
    if (a === undefined) continue;
    if (!text.includes(a)) throw new Error(`${m.id}: pattern not found in the applet source:\n${a}`);
    text = text.replace(a, b);
  }
  writeFileSync(file, text);
  mkdirSync(join(dir, 'classes'), { recursive: true });
  execFileSync(JAVAC, ['--release', '11', '-nowarn', '-encoding', 'UTF-8', '-g', '-cp', JCARDSIM, '-d', join(dir, 'classes'),
    ...['BenchApplet', 'Ec', 'Lx16', 'Persist', 'Proto', 'Ram', 'StablesApplet', 'U'].map((c) => join(dir, 'src', 'org', 'stables', 'card', c + '.java'))], { stdio: 'pipe' });
  const cp = [join(ROOT, 'build', 'simshim'), JCARDSIM, join(dir, 'classes'), join(ROOT, 'build', 'host')].join(';');
  let out = '';
  try {
    out = execFileSync(JAVA, ['-cp', cp, 'org.stables.host.Main', 'tear', m.scenario, `tear-mutant-${m.id}.md`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  const line = (out.match(/tear harness: (\d+) of (\d+) interruption points pass/) || []);
  const pass = Number(line[1]), total = Number(line[2]);
  const report = readFileSync(join(ROOT, 'results', `tear-mutant-${m.id}.md`), 'utf8');
  const firstFail = (report.split('\n').find((l) => /\| \*\*FAIL\*\*|FAIL after/.test(l)) || '').slice(0, 400);
  const caught = Number.isFinite(pass) && pass < total;
  rows.push({ ...m, pass, total, caught, firstFail });
  console.log(`${m.id} ${m.scenario}: ${pass}/${total} pass -> ${caught ? 'CAUGHT' : 'NOT CAUGHT'}`);
}

const md = ['# Mutation check: the tear harness catches broken applets',
  '',
  'Negative controls (simulator only). Each mutant is the instrumented applet with one deliberate atomicity bug. A mutant is',
  '"caught" when at least one interruption point fails an invariant. Per-mutant tables: `results/tear-mutant-M*.md`.',
  '',
  '| Mutant | Deliberate bug | Scenario run | Expected to break | Points passing | Caught | First failing row (truncated) |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.what} | ${r.scenario} | ${r.expect} | ${r.pass} of ${r.total} | ${r.caught ? 'yes' : '**NO**'} | ${r.firstFail.replace(/\|/g, '/')} |`),
  '',
  `Caught: ${rows.filter((r) => r.caught).length} of ${rows.length}.`, ''].join('\n');
writeFileSync(join(ROOT, 'results', 'mutation-check.md'), md);
process.exit(rows.every((r) => r.caught) ? 0 : 1);
