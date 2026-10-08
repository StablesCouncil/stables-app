// Negative control for the source scan: an empty scan proves nothing until the scan is shown to hit.
// Copies the card sources to build/scan-negative, injects five violations (a String, a non-final field, an allocation in
// a command, a direct persistent write, an unreviewed signing site), runs tools/scan-applet.mjs on the copy and
// requires all five to be reported. Appends the outcome to results/source-scan.md.
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src', 'main', 'javacard', 'org', 'stables', 'card');
const DIR = join(ROOT, 'build', 'scan-negative');
rmSync(DIR, { recursive: true, force: true });
cpSync(SRC, DIR, { recursive: true });
const f = join(DIR, 'StablesApplet.java');
let s = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const inject = (from, to) => { if (!s.includes(from)) throw new Error('pattern not found: ' + from); s = s.replace(from, to); };
inject('    private short getCert() {\n', '    private short getCert() {\n        pState[Proto.G_LIFE] = 0;\n        byte[] leak = new byte[16];\n'
  + '        String text = null;\n        signWithDevice(tIn, (short) 0, (short) 32, tOut, (short) 0);\n');
inject('    private final byte[] pSlots;', '    private byte[] pSlotsCopy;\n    private final byte[] pSlots;');
writeFileSync(f, s);
let out = '';
let code = 0;
try {
  out = execFileSync(process.execPath, [join(ROOT, 'tools', 'scan-applet.mjs'), DIR, join(DIR, 'scan.md')], { encoding: 'utf8' });
} catch (e) {
  out = e.stdout || '';
  code = e.status;
}
const want = ['Java Card subset: String', 'field not final', 'allocation outside install', 'direct write to a persistent array', 'signs in an unreviewed place'];
const hit = want.filter((w) => out.includes(w));
const pass = code !== 0 && hit.length === want.length;
appendFileSync(join(ROOT, 'results', 'source-scan.md'), ['', '## Negative control', '',
  `Five violations injected into a copy of the sources (tools/scan-negative-control.mjs): the scan reported ${hit.length} of ${want.length}` +
  ` (${hit.join('; ')}) and exited ${code}. ${pass ? 'The scan does fire.' : '**The scan missed something.**'}`, ''].join('\n'));
console.log(`scan negative control: ${hit.length} of ${want.length} injected violations reported -> ${pass ? 'pass' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
