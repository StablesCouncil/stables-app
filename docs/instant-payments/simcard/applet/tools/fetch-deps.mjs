// Fetches every build and test dependency of the Stage 2 applet package into ../lib and checks it.
//
// Sources: GitHub releases and repositories, and Maven Central only (work package rule).
// Each file is checked twice:
//   1. against the digest its publisher states (GitHub release asset sha256; Maven Central .sha1; for files taken from
//      the oracle_javacard_sdks repository, the git blob sha1 in the pinned commit's tree), then
//   2. against the SHA-256 recorded in ../deps.lock.json.
// If the lock has no entry yet (bootstrap), step 1 must pass and the SHA-256 is recorded. After that the lock wins:
// a changed file fails the build.
//
//   node tools/fetch-deps.mjs            fetch missing files, verify all
//   node tools/fetch-deps.mjs --verify   verify only (no network)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const LIB = join(ROOT, 'lib');
const LOCK = join(ROOT, 'deps.lock.json');
const verifyOnly = process.argv.includes('--verify');

const SDK_REPO = 'martinpaljak/oracle_javacard_sdks';
const SDK_COMMIT = '700ec80afdda210a0e62fb6a151a9cddc1acd244'; // 2026-09-23, "Note about Maven"
const SDK_KITS = ['jc304_kit', 'jc305u4_kit'];
// Only what the converter and the compiler read: the libraries and the export files.
const SDK_KEEP = (p) => /\/(lib\/[^/]+\.(jar|properties)|api_export_files\/.+\.exp)$/.test(p) && !p.includes('/classic_simulator/');

const direct = [
  { name: 'ant-javacard', version: 'v26.05.15', file: 'ant-javacard.jar', kind: 'github-release',
    url: 'https://github.com/martinpaljak/ant-javacard/releases/download/v26.05.15/ant-javacard.jar',
    published: { sha256: '14f5e25c07b184e4ec02ee148892c2ea7ad5d7e9db8b91109524df8f7d000589' } },
  { name: 'org.apache.ant:ant', version: '1.10.15', file: 'ant-1.10.15.jar', kind: 'maven-central',
    url: 'https://repo1.maven.org/maven2/org/apache/ant/ant/1.10.15/ant-1.10.15.jar',
    published: { sha1: 'da854f5503ee061a5a3b2cfcbe98ee27aa4a5ef9' } },
  { name: 'org.apache.ant:ant-launcher', version: '1.10.15', file: 'ant-launcher-1.10.15.jar', kind: 'maven-central',
    url: 'https://repo1.maven.org/maven2/org/apache/ant/ant-launcher/1.10.15/ant-launcher-1.10.15.jar',
    published: { sha1: '81431ce614ae38b187de683381f4a35a1db3b1c6' } },
  { name: 'com.klinec:jcardsim', version: '3.0.6.0', file: 'jcardsim-3.0.6.0.jar', kind: 'maven-central',
    url: 'https://repo1.maven.org/maven2/com/klinec/jcardsim/3.0.6.0/jcardsim-3.0.6.0.jar',
    published: { sha1: '826e315e72e158e67c534c5be2e90e8cf7be76d8' } },
];

const hash = (alg, buf) => createHash(alg).update(buf).digest('hex');
const gitBlobSha1 = (buf) => hash('sha1', Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));

async function get(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function sdkEntries() {
  const cache = join(LIB, 'sdk-tree.json');
  let tree;
  if (existsSync(cache)) tree = JSON.parse(readFileSync(cache, 'utf8'));
  else {
    if (verifyOnly) throw new Error('no cached SDK tree; run without --verify first');
    tree = JSON.parse((await get(`https://api.github.com/repos/${SDK_REPO}/git/trees/${SDK_COMMIT}?recursive=1`)).toString('utf8'));
    if (tree.truncated) throw new Error('GitHub tree listing truncated');
    mkdirSync(LIB, { recursive: true });
    writeFileSync(cache, JSON.stringify(tree));
  }
  return tree.tree
    .filter((t) => t.type === 'blob' && SDK_KITS.some((k) => t.path.startsWith(k + '/')) && SDK_KEEP('/' + t.path))
    .map((t) => ({ name: `${SDK_REPO}:${t.path}`, version: SDK_COMMIT, file: join('sdks', t.path), kind: 'github-repo-file',
      url: `https://raw.githubusercontent.com/${SDK_REPO}/${SDK_COMMIT}/${t.path}`, published: { gitBlobSha1: t.sha }, size: t.size }));
}

const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : { note: '', files: {} };
const deps = [...direct, ...(await sdkEntries())];
let fetched = 0, verified = 0, recorded = 0;
for (const d of deps) {
  const path = join(LIB, d.file);
  let buf;
  if (existsSync(path)) buf = readFileSync(path);
  else {
    if (verifyOnly) throw new Error('missing ' + d.file);
    buf = await get(d.url);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buf);
    fetched++;
  }
  const p = d.published;
  if (p.sha256 && hash('sha256', buf) !== p.sha256) throw new Error(`published sha256 mismatch: ${d.file}`);
  if (p.sha1 && hash('sha1', buf) !== p.sha1) throw new Error(`published sha1 mismatch: ${d.file}`);
  if (p.gitBlobSha1 && gitBlobSha1(buf) !== p.gitBlobSha1) throw new Error(`git blob sha1 mismatch: ${d.file}`);
  const sha256 = hash('sha256', buf);
  const key = d.file.replace(/\\/g, '/');
  const prev = lock.files[key];
  if (prev) {
    if (prev.sha256 !== sha256) throw new Error(`LOCK MISMATCH ${key}: lock ${prev.sha256}, file ${sha256}`);
    verified++;
  } else {
    lock.files[key] = { name: d.name, version: d.version, kind: d.kind, url: d.url, bytes: buf.length, published: p, sha256 };
    recorded++;
  }
}
lock.note = 'Stage 2 applet package dependencies. Every file is checked against its publisher digest and this SHA-256 by tools/fetch-deps.mjs. ' +
  `SDK files come from ${SDK_REPO} at commit ${SDK_COMMIT} (a repository, not a release; its files are checked by git blob sha1). ` +
  'JDK: the installed Eclipse Adoptium JDK 17 (not downloaded).';
if (recorded) writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
console.log(`deps: ${deps.length} files, fetched ${fetched}, verified against lock ${verified}, newly recorded ${recorded}`);
