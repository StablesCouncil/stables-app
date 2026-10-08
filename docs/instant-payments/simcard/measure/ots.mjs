// One-time signature schemes over SHA-256 for the Stables payment account (Phase 1 cost proofs).
//
// Everything here is the phone/chip side: key generation, signing, and a reference verifier that the
// KISS scripts must agree with. The KISS generators live in kissgen.mjs.
//
// Schemes:
//   LX  "labelled-XOR Lamport" (the candidate this phase recommends). 256 positions. Each secret carries
//       its own bit as a label (position i's secret has big-endian bit i forced to the value it signs), and
//       the public key commits to each position's PAIR symmetrically: T_i = SHA2(h_i0) XOR SHA2(h_i1).
//       The chain therefore needs no per-bit branch: it hashes, XORs and compares in bulk, and checks all
//       256 labels against the digest with three bulk operations.
//   LO  "ordered Lamport" (textbook). pk = SHA2(h_00 || h_01 || ... || h_255,1). The verifier must place
//       each revealed hash left or right by the digest bit: one IF per bit.
//   W4  Winternitz over SHA-256 with 4 bits per chain (64 message chains + 3 checksum chains).
//
// Element size n (bytes) for secrets and transmitted hashes: 32 or 16. With n = 16 a hash is the first
// 16 bytes of SHA-256. The internal pair commitment T_i always stays 32 bytes.
import { createHash, randomBytes } from 'node:crypto';

export const sha2 = (buf) => createHash('sha256').update(buf).digest();
export const hex = (buf) => '0x' + Buffer.from(buf).toString('hex').toUpperCase();
export const unhex = (h) => Buffer.from(h.replace(/^0x/i, ''), 'hex');
export const xor = (a, b) => { const o = Buffer.alloc(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] ^ b[i]; return o; };
export const cat = (...bufs) => Buffer.concat(bufs);

// Big-endian bit i of a byte string (bit 0 = least significant bit of the last byte). This is the bit
// convention of KISS hex arithmetic (BigInteger), which the bulk label check relies on.
export function beBit(buf, i) { return (buf[buf.length - 1 - (i >> 3)] >> (i & 7)) & 1; }
export function setBeBit(buf, i, v) {
  const idx = buf.length - 1 - (i >> 3), m = 1 << (i & 7);
  if (v) buf[idx] |= m; else buf[idx] &= ~m;
}
// Little-endian bit i as KISS BITGET reads it (java.util.BitSet.valueOf: bit 0 = LSB of the FIRST byte).
export function leBit(buf, i) { return (buf[i >> 3] >> (i & 7)) & 1; }

const trunc = (h, n) => (n === 32 ? h : h.subarray(0, n));
export const H = (x, n) => trunc(sha2(x), n); // transmitted hash of a secret

// ----------------------------------------------------------------------------------------------------
// LX: labelled-XOR Lamport
// ----------------------------------------------------------------------------------------------------
// The label of position i sits at bit (i mod 8n) of its n-byte secret. For n = 32 that is bit i; for
// n = 16 positions 0..127 use the low half of the digest and 128..255 the high half.
export function lxLabelBit(i, n) { return i % (8 * n); }
export function lxDigestHalf(d, i, n) { // the n-byte slice of d that position i's label is compared with
  if (n === 32) return d;
  return i < 128 ? d.subarray(16, 32) : d.subarray(0, 16);
}

// Chunking: the public key is a two-level hash so the work can be split across co-spent coins.
//   chunkDigest_c = SHA2(0x01 || T_(c*B) || ... || T_(c*B+B-1))
//   pk            = SHA2(0x01 || chunkDigest_0 || ... || chunkDigest_(K-1))
export function lxKeygen({ n = 32, chunks = 4, positions = 256, seed = randomBytes(32) } = {}) {
  const P = positions, B = P / chunks;
  if (!Number.isInteger(B)) throw new Error('positions must divide into chunks');
  const s = [], h = [], T = [];
  for (let i = 0; i < P; i++) {
    const pair = [];
    for (let b = 0; b < 2; b++) {
      const x = sha2(cat(seed, Buffer.from([i >> 8, i & 255, b]))).subarray(0, n); // stand-in for chip AES
      const sec = Buffer.from(x);
      setBeBit(sec, lxLabelBit(i, n), b);
      pair.push(sec);
    }
    s.push(pair);
    h.push([H(s[i][0], n), H(s[i][1], n)]);
    T.push(xor(sha2(h[i][0]), sha2(h[i][1])));
  }
  const chunkDigests = [];
  for (let c = 0; c < chunks; c++) chunkDigests.push(sha2(cat(Buffer.from([1]), ...T.slice(c * B, c * B + B))));
  const pk = sha2(cat(Buffer.from([1]), ...chunkDigests));
  return { scheme: 'LX', n, chunks, positions: P, B, s, h, T, chunkDigests, pk };
}

// Signature on a 32-byte digest d: for each position i the secret whose label equals the digest bit,
// plus the hash of the other secret (the complement).
export function lxSign(key, d) {
  const { n, positions: P } = key;
  const R = [], C = [];
  for (let i = 0; i < P; i++) {
    const bit = beBit(lxDigestHalf(d, i, n), lxLabelBit(i, n));
    R.push(key.s[i][bit]);
    C.push(key.h[i][1 - bit]);
  }
  return { R: cat(...R), C: cat(...C), chunkDigests: key.chunkDigests };
}

export function lxVerify(pk, d, sig, { n = 32, chunks = 4, positions = 256 } = {}) {
  const B = positions / chunks;
  const T = [];
  for (let i = 0; i < positions; i++) {
    const r = sig.R.subarray(i * n, i * n + n), c = sig.C.subarray(i * n, i * n + n);
    const want = beBit(lxDigestHalf(d, i, n), lxLabelBit(i, n));
    if (beBit(r, lxLabelBit(i, n)) !== want) return false;
    T.push(xor(sha2(H(r, n)), sha2(c)));
  }
  const cds = [];
  for (let c = 0; c < chunks; c++) cds.push(sha2(cat(Buffer.from([1]), ...T.slice(c * B, c * B + B))));
  return sha2(cat(Buffer.from([1]), ...cds)).equals(pk);
}

// The "proof of cheating" for LX: both secrets of one position of one key.
export function lxCheatProof(key, sig1, sig2, d1, d2) {
  const { n, positions: P } = key;
  for (let i = 0; i < P; i++) {
    const b1 = beBit(lxDigestHalf(d1, i, n), lxLabelBit(i, n));
    const b2 = beBit(lxDigestHalf(d2, i, n), lxLabelBit(i, n));
    if (b1 !== b2) {
      const r1 = sig1.R.subarray(i * n, i * n + n), r2 = sig2.R.subarray(i * n, i * n + n);
      return { position: i, s0: b1 === 0 ? r1 : r2, s1: b1 === 0 ? r2 : r1 };
    }
  }
  return null;
}

// ----------------------------------------------------------------------------------------------------
// LO: ordered (textbook) Lamport, flat or chunked two-level public key
// ----------------------------------------------------------------------------------------------------
export function loKeygen({ n = 32, chunks = 4, seed = randomBytes(32) } = {}) {
  const B = 256 / chunks;
  const s = [], h = [];
  for (let i = 0; i < 256; i++) {
    const pair = [0, 1].map((b) => sha2(cat(seed, Buffer.from([i >> 8, i & 255, b, 7]))).subarray(0, n));
    s.push(pair);
    h.push(pair.map((x) => H(x, n)));
  }
  const chunkDigests = [];
  for (let c = 0; c < chunks; c++) {
    const parts = [];
    for (let i = c * B; i < c * B + B; i++) parts.push(h[i][0], h[i][1]);
    chunkDigests.push(sha2(cat(...parts)));
  }
  const pk = sha2(cat(Buffer.from([1]), ...chunkDigests));
  return { scheme: 'LO', n, chunks, B, s, h, chunkDigests, pk };
}
export function loSign(key, d) {
  const R = [], C = [];
  for (let i = 0; i < 256; i++) {
    const bit = leBit(d, i); // BITGET convention
    R.push(key.s[i][bit]); C.push(key.h[i][1 - bit]);
  }
  return { R: cat(...R), C: cat(...C), chunkDigests: key.chunkDigests };
}

// ----------------------------------------------------------------------------------------------------
// W4: Winternitz, 4 bits per chain, over SHA-256 (n = 32)
// ----------------------------------------------------------------------------------------------------
export function w4Digits(d) {
  const digits = [];
  for (let i = 0; i < 32; i++) { digits.push(d[i] >> 4, d[i] & 15); }
  let csum = 0; for (const v of digits) csum += 15 - v; // max 960, three base-16 digits
  digits.push((csum >> 8) & 15, (csum >> 4) & 15, csum & 15);
  return digits; // 67
}
const chain = (x, k) => { let y = x; for (let j = 0; j < k; j++) y = sha2(y); return y; };
export function w4Keygen({ seed = randomBytes(32) } = {}) {
  const sk = [], pkParts = [];
  for (let i = 0; i < 67; i++) { const x = sha2(cat(seed, Buffer.from([i, 9]))); sk.push(x); pkParts.push(chain(x, 15)); }
  return { scheme: 'W4', sk, pkParts, pk: sha2(cat(...pkParts)) };
}
export function w4Sign(key, d) {
  const digits = w4Digits(d);
  return { S: cat(...digits.map((v, i) => chain(key.sk[i], v))), digits };
}
