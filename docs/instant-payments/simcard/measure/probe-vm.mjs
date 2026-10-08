// Probes of KISS VM behaviours the designs depend on (node 1.0.45.15 via runscript).
import { runscript, nodeVersion, saveReceipt } from './rpc.mjs';
const v = await nodeVersion();
const probes = {
  concat33: 'LET a=CONCAT(' + Array.from({length:33},()=> '0x01').join(' ') + ') RETURN LEN(a) EQ 33',
  concat32: 'LET a=CONCAT(' + Array.from({length:32},()=> '0x01').join(' ') + ') RETURN LEN(a) EQ 32',
  emptyHex: 'LET a=0x RETURN TRUE',
  andStripsLeadingZeros: 'LET a=0x00FF00FF & 0x0FFF00FF RETURN LEN(a) EQ 3',
  andKeepsLenWithGuard: 'LET a=0x01FF00FF & 0x01FF00FF RETURN LEN(a) EQ 4',
  xorStripsLeadingZeros: 'LET a=0x12FF ^ 0x12AA RETURN LEN(a) EQ 1',
  orStripsLeadingZeros: 'LET a=0x0000FF | 0x000000 RETURN LEN(a) EQ 1',
  xorEqualLen: 'LET a=0x12FF ^ 0x13AA RETURN a EQ 0x0155',
  shiftlBlock: 'LET a=0x' + '00'.repeat(31) + '01' + ' LET b=a<<1 RETURN b EQ 0x' + '00'.repeat(31) + '02',
  shiftlLenKept: 'LET a=0x' + '00'.repeat(31) + '01' + ' LET b=a<<1 RETURN LEN(b) EQ 32',
  shiftlTopBitDropped: 'LET a=0x80' + '00'.repeat(31) + ' LET b=a<<1 RETURN LEN(b) EQ 32',
  shiftlTwoBlocks: 'LET a=0x' + '00'.repeat(31) + '01' + '00'.repeat(31) + '01' + ' LET b=a<<3 RETURN b EQ 0x' + '00'.repeat(31) + '08' + '00'.repeat(31) + '08',
  shift128: 'LET a=0x' + '00'.repeat(31) + '01' + ' LET b=a<<128 RETURN b EQ 0x' + '00'.repeat(15) + '01' + '00'.repeat(16),
  numberByte: 'LET d=0x00A1FF LET n=NUMBER(SUBSET(1 2 d)) RETURN n EQ 161',
  numberTwoBytes: 'LET d=0x00A1FF LET n=NUMBER(SUBSET(1 3 d)) RETURN n EQ 41471',
  bitgetLittleEndian: 'LET d=0x0100 RETURN BITGET(d 0) AND NOT BITGET(d 8)',
  hexEqLenSensitive: 'RETURN NOT (0x0001 EQ 0x01)',
  sha2Known: 'RETURN SHA2(0x616263) EQ 0xBA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD',
  moduloByte: 'LET n=NUMBER(0xB7) RETURN (n % 16) EQ 7',
  floorDiv16: 'LET n=NUMBER(0xB7) RETURN FLOOR(n / 16) EQ 11',
  proofFnExists: 'RETURN TRUE',
};
const results = {};
for (const [k, s] of Object.entries(probes)) {
  const r = await runscript(s);
  results[k] = { script: s.length > 200 ? s.slice(0, 200) + '...' : s, success: r.success, parseok: r.parseok, instructions: r.instructions, executionError: r.executionError };
  console.log(k.padEnd(24), r.success, r.instructions, r.executionError || '');
}
saveReceipt('vm-probes', { purpose: 'KISS VM behaviour probes relied on by the Phase 1 designs', node: v, timestamp: new Date().toISOString(), results });
