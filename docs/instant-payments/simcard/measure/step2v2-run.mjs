// Step 2, version 2 (Instant payments: load from and offload to the chain): measures every covenant branch of the
// revised texts (no daily limit, no time-based retirement; founder decisions 2026-09-28), honest and refused, and
// writes the measured .kiss files and the receipt measure/receipts/step2v2_covenant_branches.json.
//  - Parse, clean form, address and clean-invariance of every text: on the LIVE lab node (runscript).
//  - The transaction-free core of the withdrawal (identity pin, signature, operation, amount): counted by the LIVE
//    node (runscript) and in-process, to cross-check the in-process counts. The live node also refuses the retired
//    operation 4 on the vault text.
//  - Every branch that reads the transaction (VERIFYOUT, GETINADDR, SUMINPUTS, @TOTOUT ...): in-process with
//    java/KissRunScaled.java on the lab node's own jar (Minima 1.0.45.15), one Contract per input as TxPoWChecker
//    does, with REAL 8-decimal token scaling (scale 36) and 8-decimal amounts.
//  - Every case that exists in v1 is compared with the v1 receipt (step2_covenant_branches.json): same verdict,
//    same refusing inputs. That is the mechanical proof that nothing else changed.
// A transaction is valid only if EVERY input's script passes, so each case runs every input and the verdict is the
// conjunction; the receipt keeps each input's count, outcome and monotonic flag.
// Nothing is posted, signed or written to any node or wallet (rpc.mjs allows only runscript and dry-run commands).
// Setup (once): javac -cp <DevNodesSet/9101/minima.jar> -d <SIMCARD_SCRATCH>/jrun3 java/KissRunScaled.java java/Step2SigSize.java java/Step2Address.java
// Order: step2v2-run.mjs (branches, addresses) -> step2v2-addresses.mjs -> step2v2-txsize.mjs -> step2v2-probes.mjs.
import { randomBytes, createHash } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { rpc, runscript, nodeVersion, saveReceipt, HERE, RECEIPTS, quoteScript } from './rpc.mjs';
import * as S from './step2v2-covenants.mjs';

const node = await nodeVersion();
const SCRATCH = process.env.SIMCARD_SCRATCH || 'C:/Users/Charles/AppData/Local/Temp/claude/c--Users-Charles-Documents-Stables/c983ae49-c861-4c13-a438-a127ecd8670d/scratchpad';
const JAVA = 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot/bin/java.exe';
const JAR = 'C:/Users/Charles/Documents/Crypto/Minima/Nodes/DevNodesSet/9101/minima.jar';
const CP = [JAR, join(SCRATCH, 'jrun3')].join(';');
const KISS_DIR = join(HERE, '..', 'kiss', 'step2'); mkdirSync(KISS_DIR, { recursive: true });
const V1 = JSON.parse(readFileSync(join(RECEIPTS, 'step2_covenant_branches.json'), 'utf8'));
const hex = (b) => '0x' + Buffer.from(b).toString('hex').toUpperCase();
const rnd = (n = 32) => hex(randomBytes(n));
const sha2 = (h) => hex(createHash('sha256').update(Buffer.from(h.slice(2), 'hex')).digest());

// ------------------------------------------------------------------------------------------ identities
const WIN = '0xD4F5DD3546F25D327CBF2B6867E193CE5DB6491AC9C65BBDCECACA1A6688063F';  // Winiwa (V9)
const XWIN = '0xEFA53EFF58616DDBDF0B6D6DBB4E18F041C4509FB3DB3B7E5482B99ABC72F127'; // xWiniwa (V9)
const OLD_SUCCESSOR = V1.parameters.successorPlaceholder;   // v1's placeholder successor: nothing may reach it now
const BLOCK = 2340000;
const DUST = '0.00000001';        // one atom of the currency: what a registration coin holds
const V1_DORMANCY = 3153600;      // v1's retirement age (about 5 years): used only to prove op 4 is gone
const TEN_YEARS = 6307200;        // about 10 years of 50-second blocks

// ------------------------------------------------------------------------------ live node: texts, addresses
async function live(name, text) {
  const r = await runscript(text);
  if (!r.ok || !r.parseok) throw new Error(name + ' does not parse on the live node: ' + JSON.stringify(r));
  const full = await rpc('runscript ' + quoteScript(text));
  const clean = full.response.clean.script;
  const again = await rpc('runscript ' + quoteScript(clean));
  return { name, chars: text.length, cleanChars: clean.length, address: full.response.clean.address,
    mxaddress: full.response.clean.mxaddress, cleanInvariant: again.response.clean.address === full.response.clean.address, clean };
}
const T = {};
T.reg = await live('reg', S.regScript());
T.regh = await live('regh', S.regHashScript());
T.vault = await live('vault', S.vaultScript({ regAddress: T.reg.address }));
T.vaulth = await live('vaulth', S.vaultScript({ regAddress: T.regh.address }));
T.core = await live('core', S.regCoreScript());
const REG = T.reg.address, VAULT = T.vault.address, REGH = T.regh.address, VAULTH = T.vaulth.address;
console.log('REG', REG, 'VAULT', VAULT, 'REGH', REGH, 'VAULTH', VAULTH);

// ------------------------------------------------------------------------------------------ fixtures
const acctA = rnd(), acctB = rnd(), acctC = rnd(), acctX = rnd();
const keyA = rnd(), keyB = rnd(), keyC = rnd(), keyX = rnd();   // dedicated withdrawal keys; keyX an attacker's
const payA = rnd(), payB = rnd(), payC = rnd(), payX = rnd();   // Savings payout addresses; payX an attacker's
const who = { A: [acctA, keyA, payA], B: [acctB, keyB, payB], C: [acctC, keyC, payC] };
const regPrevOf = (id, o = {}) => ({ 0: S.MAGIC, 1: who[id][0], 2: who[id][1], 3: who[id][2], 12: WIN, ...o });
const regPrev = (o = {}) => regPrevOf('C', o);
const coinReg = (o = {}) => ({ coinid: rnd(), address: REG, amount: DUST, tokenid: WIN, storestate: true, state: regPrev(o.prev), created: 2300000, ...o.coin });
const coinRegOf = (id, o = {}) => ({ coinid: rnd(), address: REG, amount: DUST, tokenid: WIN, storestate: true, state: regPrevOf(id, o.prev), created: 2300000, ...o.coin });
const coinLoad = (amount, o = {}) => ({ coinid: rnd(), address: VAULT, amount, tokenid: WIN, storestate: true, state: { 0: S.MAGIC, 1: acctA, 3: payA }, created: BLOCK - 90, ...o });
const coinChange = (amount, o = {}) => ({ coinid: rnd(), address: VAULT, amount, tokenid: WIN, storestate: false, created: BLOCK - 40, ...o });
const out = (address, amount, storestate = false, tokenid = WIN) => ({ address, amount, tokenid, storestate });
// The withdrawal's transaction state: the registration's pinned ports (0 to 3, 12), then W, op, change, dust.
// Ports 4, 5 and 6 are reserved and left unset.
const wState = ({ w, c, prev = regPrev(), op = '1', extra = {} }) => ({
  0: prev[0], 1: prev[1], 2: prev[2], 3: prev[3], 7: String(w), 8: op, 10: String(c), 11: DUST, 12: prev[12], ...extra });

// A case is one transaction. `expect` is the transaction verdict; `refusedBy` names the input(s) expected to fail.
// `v1` names the v1 case this one repeats unchanged (compared against the v1 receipt); `isNew` marks v2 additions.
const cases = [];
function tx(name, { script = 'A', inputs, outputs, state, signatures = [keyC], block = BLOCK, expect, refusedBy = [], note = '', v1 = null, isNew = false }) {
  // A coin at any other address is foreign: its own script is not ours, so it is not run (it is marked unmeasured).
  cases.push({ name, script, inputs, outputs, state, signatures, block, expect, refusedBy, note, v1, isNew });
}
const honest = (w, c, vaultIns) => ({ inputs: [coinReg(), ...vaultIns], outputs: [out(payC, w), ...(Number(c) > 0 ? [out(VAULT, c)] : []), out(REG, DUST, true)], state: wState({ w, c }) });

// ---- WITHDRAW (design A), honest
tx('A_WITHDRAW_1_vault_coin', { ...honest('25.12345678', '74.87654322', [coinLoad('100')]), expect: true, v1: 'A_WITHDRAW_1_vault_coin_fresh_window',
  note: 'C withdraws 25.12345678 Winiwa from A\'s 100 load (pooled). No window, no claimed block.' });
tx('A_WITHDRAW_whole_coin_no_change', { ...honest('100', '0', [coinLoad('100')]), expect: true, isNew: true,
  note: 'The whole coin out, no change output (2 outputs): the vault can always be emptied.' });
for (const k of [2, 5, 10, 20, 30]) {
  const each = '10';
  const vins = Array.from({ length: k }, (_, i) => (i % 2 ? coinChange(each) : coinLoad(each)));
  const total = 10 * k, w = '7.5', c = String(total - 7.5);
  tx(`A_WITHDRAW_${k}_vault_coins`, { inputs: [coinReg(), ...vins], outputs: [out(payC, w), out(VAULT, c), out(REG, DUST, true)],
    state: wState({ w, c }), expect: true, v1: k === 30 ? null : `A_WITHDRAW_${k}_vault_coins`, isNew: k === 30,
    note: `${k} vault coins (loads and earlier change) in one withdrawal.` });
}
tx('A_WITHDRAW_own_coin_added_goes_to_the_vault', { inputs: [coinReg(), coinLoad('100'), { coinid: rnd(), address: rnd(), amount: '5', tokenid: WIN, storestate: false, created: BLOCK - 50 }],
  outputs: [out(payC, '25'), out(VAULT, '80'), out(REG, DUST, true)], state: wState({ w: '25', c: '80' }),
  expect: true, v1: 'A_WITHDRAW_own_coin_added_goes_to_the_vault',
  note: 'A foreign coin of the same currency can only be donated into the vault change: SUMINPUTS counts it, and no output can take it back. (Its own script, not run here, must also agree.)' });
{
  // C holds no xWiniwa in Savings: its registration for xWiniwa holds one atom of WINIWA and names xWiniwa in port 12.
  const prev = regPrev({ 12: XWIN });
  tx('A_WITHDRAW_xWiniwa_via_Winiwa_dust_registration', { inputs: [coinReg({ prev: { 12: XWIN } }), coinLoad('40', { tokenid: XWIN })],
    outputs: [out(payC, '15.5', false, XWIN), out(VAULT, '24.5', false, XWIN), out(REG, DUST, true)],
    state: wState({ w: '15.5', c: '24.5', prev }), expect: true, v1: 'A_WITHDRAW_xWiniwa_via_Winiwa_dust_registration',
    note: 'The registration coin holds Winiwa dust but governs xWiniwa (port 12): a receiver with no xWiniwa in Savings can still move xWiniwa out.' });
  tx('NEG_A_currency_swapped_in_state', { inputs: [coinReg({ prev: { 12: XWIN } }), coinLoad('100')],
    outputs: [out(payC, '25'), out(VAULT, '75'), out(REG, DUST, true)],
    state: wState({ w: '25', c: '75', prev, extra: { 12: WIN } }), expect: false, refusedBy: [0], v1: 'NEG_A_currency_swapped_in_state',
    note: 'A registration for xWiniwa cannot be pointed at Winiwa (SAMESTATE on port 12).' });
}
// ---- v2 additions: the limit is gone, the exit never closes, the reserved ports are not read
tx('A_WITHDRAW_large_amount_no_limit', { ...honest('250000.12345678', '749999.87654322', [coinLoad('1000000')]), expect: true, isNew: true,
  note: 'Far above v1\'s 1,000 per day: v2 has no limit (founder decision 1, 2026-09-28).' });
tx('A_WITHDRAW_everything_5_coins_no_change', { ...honest('12345.75000001', '0', [coinLoad('1000'), coinChange('2000'), coinLoad('3000.5'), coinChange('4000.25'), coinLoad('2345.00000001')]),
  expect: true, isNew: true, note: 'One withdrawal empties five vault coins, 12,345.75000001 Winiwa, no change output.' });
tx('A_WITHDRAW_coin_10_years_old', { inputs: [coinReg({ coin: { created: BLOCK - TEN_YEARS - 100 } }), coinLoad('100', { created: BLOCK - TEN_YEARS })],
  outputs: [out(payC, '100'), out(REG, DUST, true)], state: wState({ w: '100', c: '0' }), expect: true, isNew: true,
  note: 'A load and a registration untouched for about 10 years still withdraw: no time limit, nothing expires (founder decision 2).' });
{
  const prev = regPrev({ 4: '123', 5: '-999', 6: '0xDEAD' });
  tx('A_WITHDRAW_reserved_ports_4_to_6_not_read', { inputs: [coinReg({ prev: { 4: '123', 5: '-999', 6: '0xDEAD' } }), coinLoad('100')],
    outputs: [out(payC, '25'), out(VAULT, '75'), out(REG, DUST, true)], state: wState({ w: '25', c: '75', prev, extra: { 4: '1', 5: '2', 6: '3' } }),
    expect: true, isNew: true, note: 'Ports 4 to 6 are reserved and unused: v2 neither reads nor pins them, whatever they hold.' });
}
// ---- the demo's three withdrawals, with the demo's real amounts (STEP2-DEMO-01 T3, T5, T6)
{
  const st = (id, w, c) => wState({ w, c, prev: regPrevOf(id) });
  tx('DEMO_T3_C_withdraws_25_from_A_load_of_100', { inputs: [coinRegOf('C'), coinLoad('100')],
    outputs: [out(payC, '25'), out(VAULT, '75'), out(REG, DUST, true)], state: st('C', '25', '75'), signatures: [keyC], expect: true, isNew: true,
    note: 'C, who never loaded, spends A\'s load coin: 25 to C\'s Savings, 75 back to the vault.' });
  tx('DEMO_T5_B_withdraws_35_from_change_75', { inputs: [coinRegOf('B'), coinChange('75')],
    outputs: [out(payB, '35'), out(VAULT, '40'), out(REG, DUST, true)], state: st('B', '35', '40'), signatures: [keyB], expect: true, isNew: true,
    note: 'B spends the change coin: 35 to B\'s Savings, 40 back to the vault.' });
  tx('DEMO_T6_A_withdraws_40_vault_to_zero', { inputs: [coinRegOf('A'), coinChange('40')],
    outputs: [out(payA, '40'), out(REG, DUST, true)], state: st('A', '40', '0'), signatures: [keyA], expect: true, isNew: true,
    note: 'A takes the last 40: no change output, the vault ends empty.' });
  tx('NEG_DEMO_T6_A_registration_paying_C', { inputs: [coinRegOf('A'), coinChange('40')],
    outputs: [out(payC, '40'), out(REG, DUST, true)], state: st('A', '40', '0'), signatures: [keyA], expect: false, refusedBy: [0], isNew: true,
    note: 'A\'s key and registration cannot pay anyone but A\'s own Savings.' });
}

// ---- WITHDRAW (design A), refused (all kept from v1 unless marked new)
tx('NEG_A_unsigned', { ...honest('25', '75', [coinLoad('100')]), signatures: [], expect: false, refusedBy: [0], v1: 'NEG_A_unsigned' });
tx('NEG_A_signed_by_another_key', { ...honest('25', '75', [coinLoad('100')]), signatures: [keyX], expect: false, refusedBy: [0], v1: 'NEG_A_signed_by_another_key' });
tx('NEG_A_payout_redirected_in_output', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payX, '25'), out(VAULT, '75'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75' }), expect: false, refusedBy: [0], v1: 'NEG_A_payout_redirected_in_output' });
tx('NEG_A_payout_redirected_in_state', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payX, '25'), out(VAULT, '75'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75', extra: { 3: payX } }), expect: false, refusedBy: [0], v1: 'NEG_A_payout_redirected_in_state', note: 'SAMESTATE(0 3) pins the payout.' });
tx('NEG_A_key_swapped_in_state_signed_by_attacker', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '75'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75', extra: { 2: keyX } }), signatures: [keyX], expect: false, refusedBy: [0], v1: 'NEG_A_key_swapped_in_state_signed_by_attacker' });
tx('NEG_A_account_id_swapped_in_state', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '75'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75', extra: { 1: acctX } }), expect: false, refusedBy: [0], isNew: true, note: 'SAMESTATE(0 3) pins the account id too.' });
tx('NEG_A_change_skimmed_to_extra_output', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '70'), out(payX, '5'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75' }), expect: false, refusedBy: [0, 1], v1: 'NEG_A_change_skimmed_to_extra_output' });
tx('NEG_A_change_understated', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '50'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '50' }), expect: false, refusedBy: [0], v1: 'NEG_A_change_understated', note: 'The vault coin accepts the declared change; the registration coin refuses it (SUMINPUTS).' });
tx('NEG_A_change_kept_with_state_fake_load', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '75', true), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75' }), expect: false, refusedBy: [1], v1: 'NEG_A_change_kept_with_state_fake_load', note: 'Change carrying state would look like a new load naming the account in port 1.' });
tx('NEG_A_vault_coin_of_another_currency', { inputs: [coinReg(), coinLoad('100'), coinLoad('50', { tokenid: XWIN })],
  outputs: [out(payC, '25'), out(VAULT, '75'), out(payX, '50', false, XWIN), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75' }), expect: false, refusedBy: [0, 2], v1: 'NEG_A_vault_coin_of_another_currency' });
tx('NEG_A_no_registration_at_input_0', { inputs: [{ coinid: rnd(), address: payX, amount: DUST, tokenid: WIN, storestate: false, created: BLOCK - 50 }, coinLoad('100')],
  outputs: [out(payX, '100')], state: wState({ w: '100', c: '0' }), expect: false, refusedBy: [1], v1: 'NEG_A_no_registration_at_input_0',
  note: 'A thief puts its own coin at input 0: the vault coin refuses.' });
tx('NEG_A_vault_coin_alone', { inputs: [coinLoad('100')], outputs: [out(payX, '100')], state: wState({ w: '100', c: '0' }), expect: false, refusedBy: [0], v1: 'NEG_A_vault_coin_alone' });
tx('NEG_A_registration_not_at_input_0', { inputs: [coinLoad('100'), coinReg()], outputs: [out(payC, '25'), out(VAULT, '75'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75' }), expect: false, refusedBy: [0, 1], v1: 'NEG_A_registration_not_at_input_0' });
tx('NEG_A_registration_recreated_elsewhere', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '75'), out(payX, DUST, true)],
  state: wState({ w: '25', c: '75' }), expect: false, refusedBy: [0], v1: 'NEG_A_registration_recreated_elsewhere' });
tx('NEG_A_registration_recreated_without_state', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '75'), out(REG, DUST, false)],
  state: wState({ w: '25', c: '75' }), expect: false, refusedBy: [0], v1: 'NEG_A_registration_recreated_without_state' });
tx('NEG_A_registration_not_recreated', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '75')],
  state: wState({ w: '25', c: '75' }), expect: false, refusedBy: [0], isNew: true, note: 'A withdrawal cannot consume the registration coin (only CLOSE can).' });
tx('NEG_A_registration_dust_skimmed', { inputs: [coinReg({ coin: { amount: '0.00000002' } }), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '75'), out(REG, DUST, true)],
  state: { ...wState({ w: '25', c: '75' }), 11: '0.00000002' }, expect: false, refusedBy: [0], isNew: true, note: 'The registration comes back with all of its own amount.' });
tx('NEG_A_extra_keepstate_output_at_vault', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '70'), out(VAULT, '5', true), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75' }), expect: false, refusedBy: [0, 1], v1: 'NEG_A_extra_keepstate_output_at_vault' });
tx('NEG_A_zero_amount', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '0'), out(VAULT, '100'), out(REG, DUST, true)],
  state: wState({ w: '0', c: '100' }), expect: false, refusedBy: [0], isNew: true, note: 'A withdrawal must move something (ASSERT w GT 0).' });
tx('NEG_A_negative_amount', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '0'), out(VAULT, '105'), out(REG, DUST, true)],
  state: wState({ w: '-5', c: '105' }), expect: false, refusedBy: [0], isNew: true, note: 'A negative amount would grow the change; refused before any arithmetic matters.' });

// ---- CLOSE (design A)
const closeState = (extra = {}) => ({ ...regPrev(), 8: '2', 11: DUST, ...extra });
tx('A_CLOSE_dust_to_owner', { inputs: [coinReg()], outputs: [out(payC, DUST)], state: closeState(), expect: true, v1: 'A_CLOSE_dust_to_owner' });
tx('A_CLOSE_after_10_years', { inputs: [coinReg({ coin: { created: BLOCK - TEN_YEARS } })], outputs: [out(payC, DUST)], state: closeState(), expect: true, isNew: true,
  note: 'The owner can close at any age.' });
tx('NEG_A_CLOSE_unsigned', { inputs: [coinReg()], outputs: [out(payC, DUST)], state: closeState(), signatures: [], expect: false, refusedBy: [0], v1: 'NEG_A_CLOSE_unsigned' });
tx('NEG_A_CLOSE_redirected', { inputs: [coinReg()], outputs: [out(payX, DUST)], state: closeState(), expect: false, refusedBy: [0], v1: 'NEG_A_CLOSE_redirected' });
tx('NEG_A_CLOSE_with_vault_coins', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, DUST), out(payX, '100')], state: closeState(), expect: false, refusedBy: [1], v1: 'NEG_A_CLOSE_with_vault_coins' });

// ---- VAULT: MERGE, the retired operation 4, unknown operation
const mergeState = (s) => ({ 8: '3', 10: s });
tx('V_MERGE_3_coins', { inputs: [coinLoad('10.5'), coinChange('20.25'), coinLoad('0.00000001')], outputs: [out(VAULT, '30.75000001')],
  state: mergeState('30.75000001'), signatures: [], expect: true, v1: 'V_MERGE_3_coins', note: 'Anyone may merge vault coins of one currency into one coin that carries no state.' });
tx('V_MERGE_coins_10_years_old', { inputs: [coinLoad('10', { created: BLOCK - TEN_YEARS }), coinChange('20', { created: BLOCK - TEN_YEARS })], outputs: [out(VAULT, '30')],
  state: mergeState('30'), signatures: [], expect: true, isNew: true, note: 'Merge works at any age.' });
tx('NEG_V_MERGE_skims', { inputs: [coinLoad('10'), coinLoad('20')], outputs: [out(VAULT, '25')], state: mergeState('30'), signatures: [], expect: false, refusedBy: [0], v1: 'NEG_V_MERGE_skims' });
tx('NEG_V_MERGE_skims_to_second_output', { inputs: [coinLoad('10'), coinLoad('20')], outputs: [out(VAULT, '25'), out(payX, '5')], state: mergeState('25'), signatures: [], expect: false, refusedBy: [0], v1: 'NEG_V_MERGE_skims_to_second_output' });
tx('NEG_V_MERGE_output_keeps_state', { inputs: [coinLoad('10'), coinLoad('20')], outputs: [out(VAULT, '30', true)], state: mergeState('30'), signatures: [], expect: false, refusedBy: [0], v1: 'NEG_V_MERGE_output_keeps_state' });
tx('NEG_V_MERGE_mixed_currency', { inputs: [coinLoad('10'), coinLoad('20', { tokenid: XWIN })], outputs: [out(VAULT, '10'), out(payX, '20', false, XWIN)],
  state: mergeState('10'), signatures: [], expect: false, refusedBy: [0, 1], v1: 'NEG_V_MERGE_mixed_currency' });
{
  const dormant = BLOCK - V1_DORMANCY - 1;
  tx('NEG_V_op4_retire_after_dormancy_to_old_successor', { inputs: [coinLoad('10', { created: dormant }), coinChange('20', { created: dormant })],
    outputs: [out(OLD_SUCCESSOR, '10'), out(OLD_SUCCESSOR, '20')], state: { 8: '4', 100: '10', 101: '20' }, signatures: [], expect: false, refusedBy: [0, 1], isNew: true,
    note: 'Exactly v1\'s honest retirement (V_RETIRE_after_dormancy): now refused by every coin. Nothing is ever swept.' });
  tx('NEG_V_op4_after_10_years_to_anyone', { inputs: [coinLoad('10', { created: BLOCK - TEN_YEARS })], outputs: [out(payX, '10')], state: { 8: '4', 100: '10' },
    signatures: [], expect: false, refusedBy: [0], isNew: true, note: 'Age gives no one a way out: op 4 is unknown at any age.' });
  tx('NEG_V_withdraw_op_after_10_years_without_registration', { inputs: [coinLoad('10', { created: BLOCK - TEN_YEARS })], outputs: [out(payX, '10')],
    state: wState({ w: '10', c: '0' }), signatures: [], expect: false, refusedBy: [0], isNew: true, note: 'An old coin is exactly as protected as a new one.' });
}
tx('NEG_V_unknown_operation', { inputs: [coinLoad('10')], outputs: [out(payX, '10')], state: { 8: '5' }, signatures: [], expect: false, refusedBy: [0], v1: 'NEG_V_unknown_operation' });

// ---- design C (hash chain held by the app, no Minima key; compared, not adopted)
{
  const link1 = rnd(), head = sha2(link1);                       // the app reveals link1; the coin holds SHA2(link1)
  const hPrev = { 0: S.MAGIC, 1: acctC, 2: head, 3: payC, 12: WIN };
  const cReg = (prev = hPrev) => ({ coinid: rnd(), address: REGH, amount: DUST, tokenid: WIN, storestate: true, state: prev, created: 2300000 });
  const cLoad = (amount) => ({ coinid: rnd(), address: VAULTH, amount, tokenid: WIN, storestate: true, state: { 0: S.MAGIC, 1: acctA, 3: payA }, created: BLOCK - 90 });
  const hState = ({ w, c, reveal = link1, extra = {} }) => ({ 0: S.MAGIC, 1: acctC, 2: reveal, 3: payC, 7: String(w), 8: '1', 10: String(c), 11: DUST, 12: WIN, ...extra });
  tx('C_WITHDRAW_reveal_next_link', { script: 'C', inputs: [cReg(), cLoad('100')], outputs: [out(payC, '25'), out(VAULTH, '75'), out(REGH, DUST, true)],
    state: hState({ w: '25', c: '75' }), signatures: [], expect: true, v1: 'C_WITHDRAW_reveal_next_link', note: 'No signature at all: works in MiniDapp read mode and on Core without Admin.' });
  tx('NEG_C_wrong_link', { script: 'C', inputs: [cReg(), cLoad('100')], outputs: [out(payC, '25'), out(VAULTH, '75'), out(REGH, DUST, true)],
    state: hState({ w: '25', c: '75', reveal: rnd() }), signatures: [], expect: false, refusedBy: [0], v1: 'NEG_C_wrong_link' });
  tx('NEG_C_replay_the_head_itself', { script: 'C', inputs: [cReg(), cLoad('100')], outputs: [out(payC, '25'), out(VAULTH, '75'), out(REGH, DUST, true)],
    state: hState({ w: '25', c: '75', reveal: head }), signatures: [], expect: false, refusedBy: [0], v1: 'NEG_C_replay_the_head_itself' });
  tx('NEG_C_payout_redirected', { script: 'C', inputs: [cReg(), cLoad('100')], outputs: [out(payX, '25'), out(VAULTH, '75'), out(REGH, DUST, true)],
    state: hState({ w: '25', c: '75' }), signatures: [], expect: false, refusedBy: [0], v1: 'NEG_C_payout_redirected' });
  tx('C_FRONTRUN_same_link_whole_vault_still_valid', { script: 'C', inputs: [cReg(), cLoad('100000')], outputs: [out(payC, '100000'), out(REGH, DUST, true)],
    state: hState({ w: '100000', c: '0' }), signatures: [], expect: true, v1: 'C_FRONTRUN_same_link_other_amount_still_valid',
    note: 'THE WEAKNESS OF C, larger without a limit: whoever sees link1 in the mempool can post a competing withdrawal of ANY amount. It still pays only the owner, but not the amount the owner\'s app debited.' });
}

// The v1 cases that no longer exist, and why.
const dropped = {
  'founder decision 1 (no daily cash-out limit)': ['A_WITHDRAW_window_continues_900_62', 'A_WITHDRAW_window_resets_after_a_day', 'A_WITHDRAW_exactly_the_limit',
    'NEG_A_over_daily_limit_same_day', 'NEG_A_over_limit_in_one_withdrawal', 'NEG_A_claimed_block_stale', 'NEG_A_claimed_block_in_future',
    'NEG_A_window_not_advanced', 'NEG_A_forged_negative_usage'],
  'founder decision 2 (no time-based retirement)': ['V_RETIRE_after_dormancy', 'NEG_V_RETIRE_too_early', 'NEG_V_RETIRE_redirected', 'NEG_V_RETIRE_amount_misstated'],
};

// ------------------------------------------------------------------------------------ run in-process
const scriptFor = (addr, which) => {
  if (which === 'C') return addr === REGH ? T.regh.clean : addr === VAULTH ? T.vaulth.clean : null;
  return addr === REG ? T.reg.clean : addr === VAULT ? T.vault.clean : null;
};
const runs = [];
for (const c of cases) {
  c.inputs.forEach((inp, i) => {
    const script = scriptFor(inp.address, c.script);
    if (!script) return;               // a foreign coin: its own script is not ours to measure
    runs.push({ name: c.name + '#in' + i, script, input: i, block: c.block, state: c.state, inputs: c.inputs, outputs: c.outputs, signatures: c.signatures });
  });
}
const casesFile = join(SCRATCH, 'step2v2-cases.json');
writeFileSync(casesFile, JSON.stringify(runs));
const results = JSON.parse(execFileSync(JAVA, ['-cp', CP, 'KissRunScaled', casesFile], { maxBuffer: 1 << 27 }).toString());
const byName = Object.fromEntries(results.map((r) => [r.name, r]));
const v1ByName = Object.fromEntries(V1.cases.map((c) => [c.name, c]));

let unexpected = 0, v1Mismatch = 0;
const table = cases.map((c) => {
  const per = c.inputs.map((inp, i) => {
    const r = byName[c.name + '#in' + i];
    if (!r) return { input: i, role: 'foreign', measured: false };
    const role = (inp.address === REG || inp.address === REGH) ? 'registration' : 'vault';
    return { input: i, role, success: r.success, instructions: r.instructions, monotonic: r.monotonic, exception: r.exception ? r.exception.slice(0, 160) : '' };
  });
  const measured = per.filter((p) => p.measured !== false);
  const verdict = measured.every((p) => p.success);
  const failed = measured.filter((p) => !p.success).map((p) => p.input);
  const refusalOk = c.expect || c.refusedBy.every((i) => failed.includes(i));
  const ok = verdict === c.expect && refusalOk;
  if (!ok) unexpected++;
  let vsV1 = null;
  if (c.v1) {
    const o = v1ByName[c.v1];
    if (!o) throw new Error('no v1 case ' + c.v1);
    const same = o.valid === verdict && JSON.stringify(o.refusedBy) === JSON.stringify(failed);
    if (!same) v1Mismatch++;
    vsV1 = { v1Case: c.v1, v1Valid: o.valid, v1RefusedBy: o.refusedBy, v1PerInput: o.inputs.filter((p) => p.instructions != null).map((p) => p.instructions + (p.success ? '' : '!')).join('/'), sameVerdictAndRefusers: same };
  }
  const maxIns = Math.max(...measured.map((p) => p.instructions));
  const sumIns = measured.reduce((a, p) => a + p.instructions, 0);
  console.log((ok ? 'ok  ' : 'BAD ') + c.name.padEnd(56) + ' valid=' + String(verdict).padEnd(5) + ' expected=' + String(c.expect).padEnd(5) +
    ' per-input=' + measured.map((p) => p.instructions + (p.success ? '' : '!')).join('/') + (vsV1 ? (vsV1.sameVerdictAndRefusers ? '  (= v1 ' + vsV1.v1PerInput + ')' : '  DIFFERS FROM V1') : (c.isNew ? '  (new)' : '')));
  return { name: c.name, design: c.script, expectedValid: c.expect, valid: verdict, asExpected: ok, expectedRefusedBy: c.refusedBy, refusedBy: failed,
    maxInstructionsPerInput: maxIns, sumInstructionsAllInputs: sumIns, allInputsMonotonic: measured.every((p) => p.monotonic), inputs: per,
    isNew: c.isNew, comparedWithV1: vsV1, note: c.note };
});

// ------------------------------------------------------------ live cross-check: the withdrawal core, op 4
const coreState = { 0: S.MAGIC, 1: acctC, 2: keyC, 3: payC, 7: '400.12345678', 8: '1', 12: WIN };
const corePrev = { 0: S.MAGIC, 1: acctC, 2: keyC, 3: payC, 12: WIN };
const liveCore = await runscript(T.core.clean, { state: coreState, prevstate: corePrev, signatures: [keyC] });
const liveCoreUnsigned = await runscript(T.core.clean, { state: coreState, prevstate: corePrev, signatures: [] });
const liveCoreZero = await runscript(T.core.clean, { state: { ...coreState, 7: '0' }, prevstate: corePrev, signatures: [keyC] });
const liveCorePayout = await runscript(T.core.clean, { state: { ...coreState, 3: payX }, prevstate: corePrev, signatures: [keyC] });
const liveVaultOp4 = await runscript(T.vault.clean, { state: { 8: '4', 100: '10' } });
const coreRun = (name, state) => ({ name, script: T.core.clean, input: 0, block: BLOCK, state, signatures: [keyC],
  inputs: [{ coinid: rnd(), address: T.core.address, amount: DUST, tokenid: WIN, storestate: true, state: corePrev, created: 2300000 }], outputs: [] });
const coreRuns = [coreRun('core', coreState), coreRun('core_zero_amount', { ...coreState, 7: '0' }), coreRun('core_payout_changed', { ...coreState, 3: payX }),
  { ...coreRun('core_unsigned', coreState), signatures: [] }];
writeFileSync(join(SCRATCH, 'step2v2-core.json'), JSON.stringify(coreRuns));
const inProcCore = JSON.parse(execFileSync(JAVA, ['-cp', CP, 'KissRunScaled', join(SCRATCH, 'step2v2-core.json')]).toString());
const pick = (r) => ({ success: r.success, instructions: r.instructions, monotonic: r.monotonic });
const crossCheck = {
  script: 'kiss/step2/reg_core_v2_runscript.kiss',
  honest: { live: { ...pick(liveCore), error: liveCore.executionError }, inProcess: pick(inProcCore[0]) },
  zeroAmount: { live: pick(liveCoreZero), inProcess: pick(inProcCore[1]) },
  payoutChanged: { live: pick(liveCorePayout), inProcess: pick(inProcCore[2]) },
  unsigned: { live: pick(liveCoreUnsigned), inProcess: pick(inProcCore[3]) },
  vaultOp4OnLiveNode: { ...pick(liveVaultOp4), note: 'the full vault text on the live node with operation 4 (v1 RETIRE): refused' },
};
crossCheck.countsMatch = ['honest', 'zeroAmount', 'payoutChanged', 'unsigned'].every((k) =>
  crossCheck[k].live.instructions === crossCheck[k].inProcess.instructions && crossCheck[k].live.success === crossCheck[k].inProcess.success);
console.log('core cross-check', JSON.stringify(crossCheck));

// ------------------------------------------------------------------------------------------ receipt
const regIns = table.filter((t) => t.design === 'A').flatMap((t) => t.inputs.filter((p) => p.role === 'registration' && p.success).map((p) => p.instructions));
const vaultIns = table.filter((t) => t.design === 'A').flatMap((t) => t.inputs.filter((p) => p.role === 'vault' && p.success).map((p) => p.instructions));
const receipt = {
  purpose: 'Step 2 version 2 (no daily limit, no time-based retirement; founder decisions 2026-09-28): instruction cost and refusal behaviour of every covenant branch, honest and refused, with 8-decimal token scaling, compared case by case with v1',
  node, jar: 'DevNodesSet/9101/minima.jar (1.0.45.15)', timestamp: new Date().toISOString(),
  method: 'java/KissRunScaled.java: new Contract per input + setGlobals + run, as TxPoWChecker; tokens at scale 36 (8 decimals); every input of each transaction run, verdict = all inputs pass. Texts, addresses and clean-invariance on the live node (runscript). Cases shared with v1 compared against receipts/step2_covenant_branches.json (verdict and refusing inputs).',
  parameters: { magic: S.MAGIC, reservedPorts: S.RESERVED_PORTS, dust: DUST, block: BLOCK, winiwa: WIN, xwiniwa: XWIN, v1SuccessorPlaceholderNowUnreachable: OLD_SUCCESSOR },
  texts: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, { chars: v.chars, cleanChars: v.cleanChars, address: v.address, mxaddress: v.mxaddress, cleanInvariant: v.cleanInvariant }])),
  summary: { transactions: table.length, unexpected, honest: table.filter((t) => t.expectedValid).length, refusals: table.filter((t) => !t.expectedValid).length,
    newCases: table.filter((t) => t.isNew).length, comparedWithV1: table.filter((t) => t.comparedWithV1).length, differFromV1: v1Mismatch,
    maxInstructionsAnyInput: Math.max(...table.map((t) => t.maxInstructionsPerInput)),
    designA: { registrationInputHonest: { min: Math.min(...regIns), max: Math.max(...regIns) }, vaultCoinHonest: { min: Math.min(...vaultIns), max: Math.max(...vaultIns) } },
    everyInputMonotonic: table.every((t) => t.allInputsMonotonic) },
  droppedV1Cases: dropped,
  crossCheck,
  cases: table,
};
const file = saveReceipt('step2v2_covenant_branches', receipt);
console.log('receipt', file, 'unexpected', unexpected, 'differ from v1', v1Mismatch, 'monotonic', receipt.summary.everyInputMonotonic);

// ------------------------------------------------------------------------------ measured .kiss files
function header(title, purpose, ports, names, extra = []) {
  const rows = table.filter((t) => names(t));
  return [
    `// ${title} (step 2 version 2: Instant payments load and offload, docs/step2-load-offload-design.md)`,
    `// Purpose: ${purpose}`,
    `// Ports: ${ports}`,
    `// Measured: measure/receipts/step2v2_covenant_branches.json (node ${node.version} jar in-process, 8-decimal token scaling; parse, clean form and address on the live node ${node.version}).`,
    '// DEPLOY ONLY THE CLEAN FORM: register and spend the exact single-line text in the matching .clean.txt file (runscript clean form); the multi-line text below hashes to a different, phantom address (txn-building laws 2 and 3).',
    ...extra,
    '// Measured transactions (instructions per input, ! = that input refused; verdict = every input passes):',
    ...rows.map((t) => `//   ${t.name}: ${t.inputs.filter((p) => p.instructions != null).map((p) => p.instructions + (p.success ? '' : '!')).join('/')} -> valid=${t.valid} (expected ${t.expectedValid})`),
    '',
  ].join('\n');
}
const portsReg = '0 magic; 1 account id; 2 withdrawal key; 3 payout; 4, 5, 6 RESERVED and unused (a later registration version with a limit: 4 window start, 5 used, 6 claimed block); 7 amount; 8 op (1 withdraw, 2 close); 10 change; 11 dust; 12 currency governed';
writeFileSync(join(KISS_DIR, 'instant_registration_v2.kiss'), header('instant_registration_v2.kiss', 'design A (adopted 2026-09-28): per-account, per-currency registration coin; the dedicated withdrawal key signs; payout pinned to the owner\'s Savings address; NO limit, NO window',
  portsReg, (t) => t.design === 'A' && !/^V_|^NEG_V_/.test(t.name),
  [`// Address of the clean form: ${T.reg.address} (${T.reg.mxaddress}). No parameters.`]) + S.regScript() + '\n');
writeFileSync(join(KISS_DIR, 'instant_vault_v2.kiss'), header('instant_vault_v2.kiss', 'the pooled vault, generic by token id: WITHDRAW (only beside a registration coin at input 0) and MERGE (anyone); NO retirement branch, no successor, nothing is ever swept',
  '8 op (1 withdraw, 3 merge; anything else refused); 10 change or merged total; 12 currency (withdraw, pinned by the registration coin)', (t) => t.design === 'A',
  [`// Address of the clean form: ${T.vault.address} (${T.vault.mxaddress}). It names the registration address ${T.reg.address}.`]) + S.vaultScript({ regAddress: T.reg.address }) + '\n');
writeFileSync(join(KISS_DIR, 'instant_registration_hashchain_v2.kiss'), header('instant_registration_hashchain_v2.kiss', 'design C (compared, NOT adopted): the same registration authorised by revealing the next link of an app-held SHA-256 hash chain; no Minima key; no limit',
  portsReg.replace('2 withdrawal key', '2 hash-chain head (the spend reveals its preimage here)'), (t) => t.design === 'C',
  [`// Address of the clean form: ${T.regh.address}; its vault variant (the same vault text naming this address): ${T.vaulth.address}.`]) + S.regHashScript() + '\n');
writeFileSync(join(KISS_DIR, 'reg_core_v2_runscript.kiss'), [
  '// reg_core_v2_runscript.kiss (step 2 version 2): the transaction-free core of the registration coin\'s WITHDRAW, for a live-node cross-check',
  `// Measured: live node ${node.version} runscript = ${liveCore.instructions} instructions (success=${liveCore.success}, monotonic=${liveCore.monotonic}); in-process = ${inProcCore[0].instructions} (success=${inProcCore[0].success}); counts match: ${crossCheck.countsMatch}.`,
  `// Refusals on the live node: unsigned ${liveCoreUnsigned.instructions} (success=${liveCoreUnsigned.success}); zero amount ${liveCoreZero.instructions} (success=${liveCoreZero.success}); payout changed ${liveCorePayout.instructions} (success=${liveCorePayout.success}).`,
  `// The full vault v2 text with operation 4 (v1 RETIRE) on the live node: ${liveVaultOp4.instructions} instructions, success=${liveVaultOp4.success}.`,
  '', S.regCoreScript(), ''].join('\n'));
console.log('kiss files written to', KISS_DIR);
