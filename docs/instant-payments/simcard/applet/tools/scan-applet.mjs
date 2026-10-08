// Source scan of the card code (src/main/javacard), the acceptance checks of chip-balance-design.md 0c.2 item 1 and
// Phase 0 decision 6 that a compiler does not make by itself:
//   1. Java Card subset: no String, int, long, float, double, char, threads, java.util or java.io, and no SHA-3;
//   2. allocation only at install: `new`, makeTransient*, buildKey, getInstance only in constructors, install(),
//      or static constant initialisers;
//   3. every field final (so all mutable state lives in arrays: no scalar persistent write can bypass Persist);
//   4. persistent arrays (named pXxx) written only through Persist: no element assignment, no Util write, no crypto
//      output, no Ram/U destination naming a pXxx array, anywhere else;
//   5. no "sign anything": the device key signs only in the reviewed call sites;
//   6. every Java Card algorithm and API the code uses appears in docs/card-capabilities.md.
// The converter separately rejects int bytecodes (the CAP build has no `ints` option). Writes results/source-scan.md.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || join(ROOT, 'src', 'main', 'javacard', 'org', 'stables', 'card');
const OUT = process.argv[3] || join(ROOT, 'results', 'source-scan.md');
const CAPS = readFileSync(join(ROOT, '..', 'docs', 'card-capabilities.md'), 'utf8');
const files = readdirSync(SRC).filter((f) => f.endsWith('.java'));
const findings = [];
const ok = [];
const bad = (file, line, rule, text) => findings.push({ file, line, rule, text: text.trim().slice(0, 160) });

// strip comments and string literals, keeping line structure
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '').replace(/"(?:\\.|[^"\\])*"/g, '""');
}
function splitArgs(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
// argument positions that receive output, per call
const OUTPUT_ARG = { doFinal: 3, sign: 3, getW: 0, generateData: 0, publicKey: 2, sigBlock: 5, encryptBlock: 3,
  'Ram.copy': 2, 'Ram.fill': 0, 'Ram.setShort': 0, 'U.add': 4, 'U.sub': 4, 'U.inc': 2, 'U.u16to32': 1 };
const isPersistent = (a) => /^p[A-Z]\w*$/.test(a);

const signSites = [];
const apis = new Set();
let allocations = 0, fields = 0;
for (const f of files) {
  const raw = readFileSync(join(SRC, f), 'utf8');
  const s = strip(raw);
  const lines = s.split('\n');
  const cls = f.replace('.java', '');

  // 1. subset
  lines.forEach((l, i) => {
    for (const [re, rule] of [[/\bString\b/, 'String'], [/\bint\b/, 'int'], [/\blong\b/, 'long'], [/\bfloat\b|\bdouble\b/, 'floating point'],
      [/\bchar\b/, 'char'], [/ALG_SHA3/, 'SHA-3'], [/\bsynchronized\b|\bThread\b/, 'threads'], [/import\s+java\.(util|io)/, 'java.util/io']]) {
      if (re.test(l)) bad(f, i + 1, 'Java Card subset: ' + rule, l);
    }
  });

  // 2/3. walk blocks to know the enclosing method of each line
  const ctx = []; // stack of {kind, name}
  let header = '';
  let lineNo = 1;
  const methodAt = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\n') { lineNo++; }
    if (ch === '{') {
      const h = header.trim();
      let entry = { kind: 'block', name: null };
      const mc = h.match(/\b(class|interface)\s+(\w+)/);
      const mm = h.match(/(\w+)\s*\([^()]*\)\s*(throws\s+[\w\s,.]+)?$/);
      if (mc) entry = { kind: 'class', name: mc[2] };
      else if (mm && !/^(if|for|while|switch|catch|synchronized)$/.test(mm[1]) && !/\b(if|for|while|switch|catch)\s*\(/.test(h.split('\n').pop())) entry = { kind: 'method', name: mm[1] };
      else if (/=\s*$/.test(h)) entry = { kind: 'init', name: null };
      ctx.push(entry);
      header = '';
      continue;
    }
    if (ch === '}') { ctx.pop(); header = ''; continue; }
    if (ch === ';') {
      // a statement at class level = a field (or constant) declaration
      const top = ctx[ctx.length - 1];
      if (top && top.kind === 'class') {
        const decl = header.trim();
        if (decl && !/\(/.test(decl.split('=')[0])) {
          fields++;
          if (!/\bfinal\b/.test(decl.split('=')[0])) bad(f, lineNo, 'field not final', decl);
        }
      }
      header = '';
      continue;
    }
    header += ch;
    methodAt[lineNo] = [...ctx].reverse().find((c) => c.kind === 'method' || c.kind === 'class');
  }
  lines.forEach((l, i) => {
    const m = methodAt[i + 1];
    const inMethod = m && m.kind === 'method';
    const installTime = !inMethod || m.name === cls || m.name === 'install';
    for (const re of [/\bnew\s+\w/, /makeTransient\w*\(/, /buildKey\(/, /getInstance\(/]) {
      if (re.test(l)) {
        allocations++;
        if (!installTime) bad(f, i + 1, 'allocation outside install (in ' + m.name + ')', l);
      }
    }
    if (/\bsig\.sign\(|signWithDevice\(/.test(l) && !/private short signWithDevice/.test(l)) signSites.push(`${f}:${i + 1} in ${inMethod ? m.name : '?'}`);
  });

  // 4. persistent writes only through Persist
  if (f !== 'Persist.java') {
    lines.forEach((l, i) => {
      if (/\bp[A-Z]\w*\s*\[[^\]]*\]\s*(=(?!=)|\+=|-=|\|=|&=|\^=|\+\+|--)/.test(l)) bad(f, i + 1, 'direct write to a persistent array', l);
      if (f !== 'Ram.java' && /Util\.(arrayCopy|arrayCopyNonAtomic|arrayFillNonAtomic|setShort)\s*\(/.test(l)) bad(f, i + 1, 'Util write outside Persist/Ram', l);
    });
    const callRe = /(Ram\.copy|Ram\.fill|Ram\.setShort|U\.add|U\.sub|U\.inc|U\.u16to32|\.doFinal|\.sign|\.getW|\.generateData|\.publicKey|\.sigBlock|\.encryptBlock)\s*\(/g;
    for (const mt of s.matchAll(callRe)) {
      let depth = 1, j = mt.index + mt[0].length, body = '';
      while (j < s.length && depth > 0) { const c = s[j]; if (c === '(') depth++; if (c === ')') depth--; if (depth > 0) body += c; j++; }
      const key = mt[1].replace(/^\./, '');
      const pos = OUTPUT_ARG[key];
      const args = splitArgs(body);
      if (pos !== undefined && args[pos] && isPersistent(args[pos])) {
        const line = s.slice(0, mt.index).split('\n').length;
        bad(f, line, 'output into a persistent array outside Persist', mt[0] + body + ')');
      }
    }
  }

  // 6. APIs used
  for (const mt of s.matchAll(/\b(MessageDigest|Signature|Cipher|RandomData|KeyBuilder|JCSystem|Util|ISOException|KeyPair)\.([A-Za-z_0-9]+)/g)) apis.add(`${mt[1]}.${mt[2]}`);
  for (const mt of s.matchAll(/\b(apdu)\.(\w+)\s*\(/g)) apis.add(`APDU.${mt[2]}`);
  for (const mt of s.matchAll(/\.(setFieldFP|setA|setB|setG|setR|setK|setW|getW|setKey|genKeyPair|generateData|update|doFinal|reset|init|sign|verify|register|selectingApplet)\s*\(/g)) apis.add(mt[1]);
  if (/\bselectingApplet\(\)/.test(s)) apis.add('selectingApplet');
  if (/\bregister\(/.test(s)) apis.add('register');
  if (/CryptoException/.test(s)) apis.add('CryptoException');
}

// 5. signing call sites: exactly the reviewed ones
const expectedSigners = ['signWithDevice', 'emitSigned', 'pay', 'selfTest'];
const signers = [...new Set(signSites.map((x) => x.split(' in ')[1]))].filter((n) => n !== 'StablesApplet' && n !== 'BenchApplet' && n !== 'process');
for (const n of signers) if (!expectedSigners.includes(n)) bad('StablesApplet.java', 0, 'device key signs in an unreviewed place: ' + n, n);

// 6. capability rows
const skip = new Set(['JCSystem.CLEAR_ON_DESELECT', 'JCSystem.MEMORY_TYPE_PERSISTENT', 'JCSystem.MEMORY_TYPE_TRANSIENT_RESET',
  'JCSystem.MEMORY_TYPE_TRANSIENT_DESELECT', 'Signature.MODE_SIGN', 'Signature.MODE_VERIFY', 'Cipher.MODE_ENCRYPT', 'reset', 'init', 'update']);
const missingCaps = [];
for (const a of [...apis].sort()) {
  if (skip.has(a)) continue;
  const name = a.includes('.') ? a.split('.')[1] : a;
  if (!CAPS.includes(name)) missingCaps.push(a);
}
for (const m of missingCaps) bad('docs/card-capabilities.md', 0, 'API used but not listed in card-capabilities.md', m);

ok.push(`files scanned: ${files.join(', ')}`);
ok.push(`field declarations checked (all must be final): ${fields}`);
ok.push(`allocation sites (all must be at install): ${allocations}`);
ok.push(`device-key signing sites: ${signSites.join('; ')}`);
ok.push(`Java Card APIs and algorithms used (${apis.size}): ${[...apis].sort().join(', ')}`);
const md = ['# Source scan of the card code', '', `Scanned \`${process.argv[2] ? SRC : 'src/main/javacard/org/stables/card'}\` on ${new Date().toISOString()} (tools/scan-applet.mjs).`, '',
  `**${findings.length === 0 ? 'No findings.' : findings.length + ' finding(s).'}**`, '',
  '| Check | Result |', '|---|---|',
  '| Java Card subset: no String, int, long, floating point, char, threads, java.util/io; no SHA-3 | ' + (findings.some((x) => x.rule.startsWith('Java Card subset')) ? 'FAIL' : 'pass') + ' |',
  '| Allocation only at install (constructors, install(), static constants) | ' + (findings.some((x) => x.rule.startsWith('allocation')) ? 'FAIL' : 'pass') + ' |',
  '| Every field final (mutable state only in arrays) | ' + (findings.some((x) => x.rule === 'field not final') ? 'FAIL' : 'pass') + ' |',
  '| Persistent arrays written only through Persist | ' + (findings.some((x) => /persistent|Util write/.test(x.rule)) ? 'FAIL' : 'pass') + ' |',
  '| No sign-anything: the device key signs only in emitSigned (bodies the chip builds), pay, and the install self-test | ' + (findings.some((x) => /signs in an unreviewed/.test(x.rule)) ? 'FAIL' : 'pass') + ' |',
  '| Every API and algorithm used appears in card-capabilities.md | ' + (missingCaps.length ? 'FAIL: ' + missingCaps.join(', ') : 'pass') + ' |',
  '| No int bytecode (CAP converted without the `ints` option) | checked by the converter, not here |', '',
  '## Details', '', ...ok.map((x) => '- ' + x), '',
  ...(findings.length ? ['## Findings', '', '| File | Line | Rule | Text |', '|---|---|---|---|',
    ...findings.map((x) => `| ${x.file} | ${x.line} | ${x.rule} | \`${x.text.replace(/\|/g, '/')}\` |`)] : []), ''].join('\n');
writeFileSync(OUT, md);
console.log(findings.length ? findings.map((x) => `${x.file}:${x.line} ${x.rule}: ${x.text}`).join('\n') : 'source scan: no findings');
process.exit(findings.length ? 1 : 0);
