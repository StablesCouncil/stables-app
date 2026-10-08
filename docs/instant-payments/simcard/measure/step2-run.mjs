// Step 2 (Instant payments: load from and offload to the chain): measures every covenant branch, honest and
// refused, and writes the measured .kiss files and the receipt.
//  - Parse, clean form, address and clean-invariance of every text: on the LIVE lab node (runscript).
//  - The transaction-free core of the withdrawal (identity pin, signature, claimed block, daily window): counted
//    by the LIVE node (runscript) and in-process, to cross-check the in-process counts.
//  - Every branch that reads the transaction (VERIFYOUT, GETINADDR, SUMINPUTS, @TOTOUT ...): in-process with
//    java/KissRunScaled.java on the lab node's own jar (Minima 1.0.45.15), one Contract per input as TxPoWChecker
//    does, with REAL 8-decimal token scaling (scale 36) and 8-decimal amounts.
// A transaction is valid only if EVERY input's script passes, so each case runs every input and the verdict is
// the conjunction; the receipt keeps each input's count and outcome.
// Nothing is posted, signed or written to any node or wallet.
// Setup (once): javac -cp <DevNodesSet/9101/minima.jar> -d <SIMCARD_SCRATCH>/jrun2 java/KissRunScaled.java java/Step2SigSize.java
// Order: step2-run.mjs (branches, addresses) -> step2-txsize.mjs (reads the addresses) -> step2-probes.mjs.
import { randomBytes, createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { rpc, runscript, nodeVersion, saveReceipt, HERE, quoteScript } from './rpc.mjs';
import * as S from './step2-covenants.mjs';

const node = await nodeVersion();
const SCRATCH = process.env.SIMCARD_SCRATCH || 'C:/Users/Charles/AppData/Local/Temp/claude/c--Users-Charles-Documents-Stables/c983ae49-c861-4c13-a438-a127ecd8670d/scratchpad';
const JAVA = 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot/bin/java.exe';
const JAR = 'C:/Users/Charles/Documents/Crypto/Minima/Nodes/DevNodesSet/9101/minima.jar';
const CP = [JAR, join(SCRATCH, 'jrun2')].join(';');
const KISS_DIR = join(HERE, '..', 'kiss', 'step2'); mkdirSync(KISS_DIR, { recursive: true });
const hex = (b) => '0x' + Buffer.from(b).toString('hex').toUpperCase();
const rnd = (n = 32) => hex(randomBytes(n));
const sha2 = (h) => hex(createHash('sha256').update(Buffer.from(h.slice(2), 'hex')).digest());

// ------------------------------------------------------------------------------------------ identities
const WIN = '0xD4F5DD3546F25D327CBF2B6867E193CE5DB6491AC9C65BBDCECACA1A6688063F';  // Winiwa (V9)
const XWIN = '0xEFA53EFF58616DDBDF0B6D6DBB4E18F041C4509FB3DB3B7E5482B99ABC72F127'; // xWiniwa (V9)
// Placeholder successor, deterministic so addresses repeat run to run: the real successor is a founder decision
// fixed before deployment (it changes the vault address).
const SUCCESSOR = hex(createHash('sha256').update('STABLES INSTANT VAULT SUCCESSOR PLACEHOLDER').digest());
const BLOCK = 2340000;
const DUST = '0.00000001';        // one atom of the currency: what a registration coin holds
const P = S.DEFAULTS;

// ------------------------------------------------------------------------------ live node: texts, addresses
async function live(name, text) {
  const r = await runscript(text);
  if (!r.ok || !r.parseok) throw new Error(name + ' does not parse on the live node: ' + JSON.stringify(r));
  const full = await rpc('runscript ' + quoteScript(text));
  const clean = full.response.clean.script;
  const again = await rpc('runscript ' + quoteScript(clean));
  return { name, chars: text.length, cleanChars: clean.length, address: full.response.clean.address,
    cleanInvariant: again.response.clean.address === full.response.clean.address, clean };
}
const T = {};
T.reg = await live('reg', S.regScript());
T.regh = await live('regh', S.regHashScript());
T.vault = await live('vault', S.vaultScript({ regAddress: T.reg.address, successor: SUCCESSOR }));
T.vaulth = await live('vaulth', S.vaultScript({ regAddress: T.regh.address, successor: SUCCESSOR }));
T.core = await live('core', S.regCoreScript());
const REG = T.reg.address, VAULT = T.vault.address, REGH = T.regh.address, VAULTH = T.vaulth.address;
console.log('REG', REG, 'VAULT', VAULT, 'REGH', REGH, 'VAULTH', VAULTH);

// ------------------------------------------------------------------------------------------ fixtures
const acctA = rnd(), acctC = rnd();         // A loaded; C withdraws (pooled: C spends A's load)
const keyC = rnd(), keyX = rnd();          // C's dedicated withdrawal key; an attacker's key
const payC = rnd(), payX = rnd();          // C's Savings payout address; an attacker's address
const regPrev = (o = {}) => ({ 0: S.MAGIC, 1: acctC, 2: keyC, 3: payC, 4: '0', 5: '0', 12: WIN, ...o });
const coinReg = (o = {}) => ({ coinid: rnd(), address: REG, amount: DUST, tokenid: WIN, storestate: true, state: regPrev(o.prev), created: 2300000, ...o.coin });
const coinLoad = (amount, o = {}) => ({ coinid: rnd(), address: VAULT, amount, tokenid: WIN, storestate: true, state: { 0: S.MAGIC, 1: acctA }, created: BLOCK - 90, ...o });
const coinChange = (amount, o = {}) => ({ coinid: rnd(), address: VAULT, amount, tokenid: WIN, storestate: false, created: BLOCK - 40, ...o });
const out = (address, amount, storestate = false, tokenid = WIN) => ({ address, amount, tokenid, storestate });
const wState = ({ w, c, cb = BLOCK - 5, ws, wu, prev = regPrev(), op = '1', extra = {} }) => ({
  0: prev[0], 1: prev[1], 2: prev[2], 3: prev[3], 4: String(ws), 5: String(wu), 6: String(cb), 7: String(w), 8: op,
  10: String(c), 11: DUST, 12: prev[12], ...extra });

// A case is one transaction. `expect` is the transaction verdict; `refusedBy` names the input(s) expected to fail.
const cases = [];
function tx(name, { script = 'A', inputs, outputs, state, signatures = [keyC], block = BLOCK, expect, refusedBy = [], note = '' }) {
  // A coin at any other address is foreign: its own script is not ours, so it is not run (it is marked unmeasured).
  cases.push({ name, script, inputs, outputs, state, signatures, block, expect, refusedBy, note });
}
const honest = (n, w, c, extraVault = []) => ({ inputs: [coinReg(), ...extraVault], outputs: [out(payC, w), ...(Number(c) > 0 ? [out(VAULT, c)] : []), out(REG, DUST, true)], state: wState({ w, c, ws: BLOCK - 5, wu: w }) });

// ---- WITHDRAW (design A), honest
tx('A_WITHDRAW_1_vault_coin_fresh_window', { ...honest(1, '25.12345678', '74.87654322', [coinLoad('100')]), expect: true,
  note: 'C withdraws 25.12345678 Winiwa from A\'s 100 load (pooled). First withdrawal: the window opens at the claimed block.' });
{
  const prev = regPrev({ 4: String(BLOCK - 900), 5: '500.5' });
  tx('A_WITHDRAW_window_continues_900_62', { inputs: [coinReg({ prev: { 4: String(BLOCK - 900), 5: '500.5' } }), coinLoad('600')],
    outputs: [out(payC, '400.12345678'), out(VAULT, '199.87654322'), out(REG, DUST, true)],
    state: wState({ w: '400.12345678', c: '199.87654322', ws: BLOCK - 900, wu: '900.62345678', prev }), expect: true,
    note: 'Same day: 500.5 already used, 400.12345678 more makes 900.62345678, under 1,000.' });
}
{
  const prev = regPrev({ 4: String(BLOCK - 2000), 5: '1000' });
  tx('A_WITHDRAW_window_resets_after_a_day', { inputs: [coinReg({ prev: { 4: String(BLOCK - 2000), 5: '1000' } }), coinLoad('300')],
    outputs: [out(payC, '300'), out(REG, DUST, true)],
    state: wState({ w: '300', c: '0', ws: BLOCK - 5, wu: '300', prev }), expect: true,
    note: 'Yesterday\'s window was full (1,000); more than 1,728 blocks later a new window opens. Exact spend: no change output.' });
}
tx('A_WITHDRAW_exactly_the_limit', { ...honest(1, '1000', '0', [coinLoad('1000')]), expect: true, note: 'The limit is inclusive.' });
for (const k of [2, 5, 10, 20]) {
  const each = '10';
  const vins = Array.from({ length: k }, (_, i) => (i % 2 ? coinChange(each) : coinLoad(each)));
  const total = 10 * k, w = '7.5', c = String(total - 7.5);
  tx(`A_WITHDRAW_${k}_vault_coins`, { inputs: [coinReg(), ...vins], outputs: [out(payC, w), out(VAULT, c), out(REG, DUST, true)],
    state: wState({ w, c, ws: BLOCK - 5, wu: w }), expect: true, note: `${k} vault coins (loads and earlier change) in one withdrawal.` });
}
tx('A_WITHDRAW_own_coin_added_goes_to_the_vault', { inputs: [coinReg(), coinLoad('100'), { coinid: rnd(), address: rnd(), amount: '5', tokenid: WIN, storestate: false, created: BLOCK - 50 }],
  outputs: [out(payC, '25'), out(VAULT, '80'), out(REG, DUST, true)], state: wState({ w: '25', c: '80', ws: BLOCK - 5, wu: '25' }),
  expect: true, refusedBy: [], note: 'A foreign coin of the same currency can only be donated into the vault change: SUMINPUTS counts it, and no output can take it back. (Its own script, not run here, must also agree.)' });

{
  // C holds no xWiniwa in Savings: its registration for xWiniwa holds one atom of WINIWA and names xWiniwa in port 12.
  const prev = regPrev({ 12: XWIN });
  tx('A_WITHDRAW_xWiniwa_via_Winiwa_dust_registration', { inputs: [coinReg({ prev: { 12: XWIN } }), coinLoad('40', { tokenid: XWIN })],
    outputs: [out(payC, '15.5', false, XWIN), out(VAULT, '24.5', false, XWIN), out(REG, DUST, true)],
    state: wState({ w: '15.5', c: '24.5', ws: BLOCK - 5, wu: '15.5', prev }), expect: true,
    note: 'The registration coin holds Winiwa dust but governs xWiniwa (port 12): a receiver with no xWiniwa in Savings can still move xWiniwa out.' });
  tx('NEG_A_currency_swapped_in_state', { inputs: [coinReg({ prev: { 12: XWIN } }), coinLoad('100')],
    outputs: [out(payC, '25'), out(VAULT, '75'), out(REG, DUST, true)],
    state: wState({ w: '25', c: '75', ws: BLOCK - 5, wu: '25', prev, extra: { 12: WIN } }), expect: false, refusedBy: [0],
    note: 'A registration for xWiniwa cannot be pointed at Winiwa (SAMESTATE on port 12).' });
}

// ---- WITHDRAW (design A), refused
{
  const prev = regPrev({ 4: String(BLOCK - 900), 5: '900' });
  tx('NEG_A_over_daily_limit_same_day', { inputs: [coinReg({ prev: { 4: String(BLOCK - 900), 5: '900' } }), coinLoad('600')],
    outputs: [out(payC, '200'), out(VAULT, '400'), out(REG, DUST, true)],
    state: wState({ w: '200', c: '400', ws: BLOCK - 900, wu: '1100', prev }), expect: false, refusedBy: [0], note: '900 used + 200 = 1,100 > 1,000.' });
}
tx('NEG_A_over_limit_in_one_withdrawal', { ...honest(1, '1000.00000001', '0.99999999', [coinLoad('1001')]), expect: false, refusedBy: [0], note: 'One atom over the limit.' });
tx('NEG_A_unsigned', { ...honest(1, '25', '75', [coinLoad('100')]), signatures: [], expect: false, refusedBy: [0] });
tx('NEG_A_signed_by_another_key', { ...honest(1, '25', '75', [coinLoad('100')]), signatures: [keyX], expect: false, refusedBy: [0] });
tx('NEG_A_payout_redirected_in_output', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payX, '25'), out(VAULT, '75'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75', ws: BLOCK - 5, wu: '25' }), expect: false, refusedBy: [0] });
tx('NEG_A_payout_redirected_in_state', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payX, '25'), out(VAULT, '75'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75', ws: BLOCK - 5, wu: '25', extra: { 3: payX } }), expect: false, refusedBy: [0], note: 'SAMESTATE(0 3) pins the payout.' });
tx('NEG_A_key_swapped_in_state_signed_by_attacker', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '75'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75', ws: BLOCK - 5, wu: '25', extra: { 2: keyX } }), signatures: [keyX], expect: false, refusedBy: [0] });
tx('NEG_A_change_skimmed_to_extra_output', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '70'), out(payX, '5'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75', ws: BLOCK - 5, wu: '25' }), expect: false, refusedBy: [0, 1] });
tx('NEG_A_change_understated', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '50'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '50', ws: BLOCK - 5, wu: '25' }), expect: false, refusedBy: [0], note: 'The vault coin accepts the declared change; the registration coin refuses it (SUMINPUTS).' });
tx('NEG_A_change_kept_with_state_fake_load', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '75', true), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75', ws: BLOCK - 5, wu: '25' }), expect: false, refusedBy: [1], note: 'Change carrying state would look like a new load naming the account in port 1.' });
tx('NEG_A_vault_coin_of_another_currency', { inputs: [coinReg(), coinLoad('100'), coinLoad('50', { tokenid: XWIN })],
  outputs: [out(payC, '25'), out(VAULT, '75'), out(payX, '50', false, XWIN), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75', ws: BLOCK - 5, wu: '25' }), expect: false, refusedBy: [0, 2] });
tx('NEG_A_no_registration_at_input_0', { inputs: [{ coinid: rnd(), address: payX, amount: DUST, tokenid: WIN, storestate: false, created: BLOCK - 50 }, coinLoad('100')],
  outputs: [out(payX, '100')], state: wState({ w: '100', c: '0', ws: BLOCK - 5, wu: '100' }), expect: false, refusedBy: [1],
  note: 'A thief puts its own coin at input 0: the vault coin refuses.' });
tx('NEG_A_vault_coin_alone', { inputs: [coinLoad('100')], outputs: [out(payX, '100')], state: wState({ w: '100', c: '0', ws: BLOCK - 5, wu: '100' }), expect: false, refusedBy: [0] });
tx('NEG_A_registration_not_at_input_0', { inputs: [coinLoad('100'), coinReg()], outputs: [out(payC, '25'), out(VAULT, '75'), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75', ws: BLOCK - 5, wu: '25' }), expect: false, refusedBy: [0, 1] });
tx('NEG_A_claimed_block_stale', { ...honest(1, '25', '75', [coinLoad('100')]), state: wState({ w: '25', c: '75', cb: BLOCK - P.slack - 1, ws: BLOCK - P.slack - 1, wu: '25' }), expect: false, refusedBy: [0] });
tx('NEG_A_claimed_block_in_future', { ...honest(1, '25', '75', [coinLoad('100')]), state: wState({ w: '25', c: '75', cb: BLOCK + 1, ws: BLOCK + 1, wu: '25' }), expect: false, refusedBy: [0] });
{
  const prev = regPrev({ 4: String(BLOCK - 900), 5: '500' });
  tx('NEG_A_window_not_advanced', { inputs: [coinReg({ prev: { 4: String(BLOCK - 900), 5: '500' } }), coinLoad('600')],
    outputs: [out(payC, '400'), out(VAULT, '200'), out(REG, DUST, true)],
    state: wState({ w: '400', c: '200', ws: BLOCK - 900, wu: '500', prev }), expect: false, refusedBy: [0], note: 'The builder tries to keep "used" at 500.' });
}
{
  const prev = regPrev({ 4: String(BLOCK - 900), 5: '-100000' });
  tx('NEG_A_forged_negative_usage', { inputs: [coinReg({ prev: { 4: String(BLOCK - 900), 5: '-100000' } }), coinLoad('5000')],
    outputs: [out(payC, '5000'), out(REG, DUST, true)],
    state: wState({ w: '5000', c: '0', ws: BLOCK - 900, wu: '-95000', prev }), expect: false, refusedBy: [0],
    note: 'Anyone can create a coin at the registration address with any state; a negative usage is refused.' });
}
tx('NEG_A_registration_recreated_elsewhere', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '75'), out(payX, DUST, true)],
  state: wState({ w: '25', c: '75', ws: BLOCK - 5, wu: '25' }), expect: false, refusedBy: [0] });
tx('NEG_A_registration_recreated_without_state', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '75'), out(REG, DUST, false)],
  state: wState({ w: '25', c: '75', ws: BLOCK - 5, wu: '25' }), expect: false, refusedBy: [0] });
tx('NEG_A_extra_keepstate_output_at_vault', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, '25'), out(VAULT, '70'), out(VAULT, '5', true), out(REG, DUST, true)],
  state: wState({ w: '25', c: '75', ws: BLOCK - 5, wu: '25' }), expect: false, refusedBy: [0, 1] });

// ---- CLOSE (design A)
const closeState = (extra = {}) => ({ ...regPrev(), 8: '2', 11: DUST, ...extra });
tx('A_CLOSE_dust_to_owner', { inputs: [coinReg()], outputs: [out(payC, DUST)], state: closeState(), expect: true });
tx('NEG_A_CLOSE_unsigned', { inputs: [coinReg()], outputs: [out(payC, DUST)], state: closeState(), signatures: [], expect: false, refusedBy: [0] });
tx('NEG_A_CLOSE_redirected', { inputs: [coinReg()], outputs: [out(payX, DUST)], state: closeState(), expect: false, refusedBy: [0] });
tx('NEG_A_CLOSE_with_vault_coins', { inputs: [coinReg(), coinLoad('100')], outputs: [out(payC, DUST), out(payX, '100')], state: closeState(), expect: false, refusedBy: [1] });

// ---- VAULT: MERGE, RETIRE, unknown operation
const mergeState = (s) => ({ 8: '3', 10: s });
tx('V_MERGE_3_coins', { script: 'A', inputs: [coinLoad('10.5'), coinChange('20.25'), coinLoad('0.00000001')], outputs: [out(VAULT, '30.75000001')],
  state: mergeState('30.75000001'), signatures: [], expect: true, note: 'Anyone may merge vault coins of one currency into one coin that carries no state.' });
tx('NEG_V_MERGE_skims', { inputs: [coinLoad('10'), coinLoad('20')], outputs: [out(VAULT, '25')], state: mergeState('30'), signatures: [], expect: false, refusedBy: [0] });
tx('NEG_V_MERGE_skims_to_second_output', { inputs: [coinLoad('10'), coinLoad('20')], outputs: [out(VAULT, '25'), out(payX, '5')], state: mergeState('25'), signatures: [], expect: false, refusedBy: [0] });
tx('NEG_V_MERGE_output_keeps_state', { inputs: [coinLoad('10'), coinLoad('20')], outputs: [out(VAULT, '30', true)], state: mergeState('30'), signatures: [], expect: false, refusedBy: [0] });
tx('NEG_V_MERGE_mixed_currency', { inputs: [coinLoad('10'), coinLoad('20', { tokenid: XWIN })], outputs: [out(VAULT, '10'), out(payX, '20', false, XWIN)],
  state: mergeState('10'), signatures: [], expect: false, refusedBy: [0, 1] });
const dormant = BLOCK - P.dormancy - 1;
tx('V_RETIRE_after_dormancy', { inputs: [coinLoad('10', { created: dormant }), coinChange('20', { created: dormant })], outputs: [out(SUCCESSOR, '10'), out(SUCCESSOR, '20')],
  state: { 8: '4', 100: '10', 101: '20' }, signatures: [], expect: true, note: 'After about 5 years without movement anyone may move a coin to the successor fixed at deployment.' });
tx('NEG_V_RETIRE_too_early', { inputs: [coinLoad('10', { created: BLOCK - P.dormancy })], outputs: [out(SUCCESSOR, '10')], state: { 8: '4', 100: '10' }, signatures: [], expect: false, refusedBy: [0] });
tx('NEG_V_RETIRE_redirected', { inputs: [coinLoad('10', { created: dormant })], outputs: [out(payX, '10')], state: { 8: '4', 100: '10' }, signatures: [], expect: false, refusedBy: [0] });
tx('NEG_V_RETIRE_amount_misstated', { inputs: [coinLoad('10', { created: dormant })], outputs: [out(SUCCESSOR, '9')], state: { 8: '4', 100: '9' }, signatures: [], expect: false, refusedBy: [0] });
tx('NEG_V_unknown_operation', { inputs: [coinLoad('10')], outputs: [out(payX, '10')], state: { 8: '5' }, signatures: [], expect: false, refusedBy: [0] });

// ---- design C (hash chain held by the app, no Minima key)
{
  const link1 = rnd(), head = sha2(link1);                       // the app reveals link1; the coin holds SHA2(link1)
  const hPrev = { 0: S.MAGIC, 1: acctC, 2: head, 3: payC, 4: '0', 5: '0', 12: WIN };
  const cReg = (prev = hPrev) => ({ coinid: rnd(), address: REGH, amount: DUST, tokenid: WIN, storestate: true, state: prev, created: 2300000 });
  const cLoad = (amount) => ({ coinid: rnd(), address: VAULTH, amount, tokenid: WIN, storestate: true, state: { 0: S.MAGIC, 1: acctA }, created: BLOCK - 90 });
  const hState = ({ w, c, reveal = link1, extra = {} }) => ({ 0: S.MAGIC, 1: acctC, 2: reveal, 3: payC, 4: String(BLOCK - 5), 5: String(w), 6: String(BLOCK - 5), 7: String(w), 8: '1', 10: String(c), 11: DUST, 12: WIN, ...extra });
  tx('C_WITHDRAW_reveal_next_link', { script: 'C', inputs: [cReg(), cLoad('100')], outputs: [out(payC, '25'), out(VAULTH, '75'), out(REGH, DUST, true)],
    state: hState({ w: '25', c: '75' }), signatures: [], expect: true, note: 'No signature at all: works in MiniDapp read mode and on Core without Admin.' });
  tx('NEG_C_wrong_link', { script: 'C', inputs: [cReg(), cLoad('100')], outputs: [out(payC, '25'), out(VAULTH, '75'), out(REGH, DUST, true)],
    state: hState({ w: '25', c: '75', reveal: rnd() }), signatures: [], expect: false, refusedBy: [0] });
  tx('NEG_C_replay_the_head_itself', { script: 'C', inputs: [cReg(), cLoad('100')], outputs: [out(payC, '25'), out(VAULTH, '75'), out(REGH, DUST, true)],
    state: hState({ w: '25', c: '75', reveal: head }), signatures: [], expect: false, refusedBy: [0] });
  tx('NEG_C_payout_redirected', { script: 'C', inputs: [cReg(), cLoad('100')], outputs: [out(payX, '25'), out(VAULTH, '75'), out(REGH, DUST, true)],
    state: hState({ w: '25', c: '75' }), signatures: [], expect: false, refusedBy: [0] });
  tx('C_FRONTRUN_same_link_other_amount_still_valid', { script: 'C', inputs: [cReg(), cLoad('1000')], outputs: [out(payC, '1000'), out(REGH, DUST, true)],
    state: hState({ w: '1000', c: '0' }), signatures: [], expect: true,
    note: 'THE WEAKNESS OF C: whoever sees link1 in the mempool can post a competing withdrawal of up to the limit. It still pays only the owner, but not the amount the owner\'s app debited.' });
}

// ------------------------------------------------------------------------------------ run in-process
const scriptFor = (addr, which) => {
  if (which === 'C') return addr === REGH ? T.regh.clean : addr === VAULTH ? T.vaulth.clean : null;
  return addr === REG ? T.reg.clean : addr === VAULT ? T.vault.clean : null;
};
const runs = [];
for (const c of cases) {
  c.inputs.forEach((inp, i) => {
    if ((c.skipInputs || []).includes(i)) return;
    const script = scriptFor(inp.address, c.script);
    if (!script) return;               // a foreign coin: its own script is not ours to measure
    runs.push({ name: c.name + '#in' + i, script, input: i, block: c.block, state: c.state, inputs: c.inputs, outputs: c.outputs, signatures: c.signatures });
  });
}
const casesFile = join(SCRATCH, 'step2-cases.json');
writeFileSync(casesFile, JSON.stringify(runs));
const results = JSON.parse(execFileSync(JAVA, ['-cp', CP, 'KissRunScaled', casesFile], { maxBuffer: 1 << 27 }).toString());
const byName = Object.fromEntries(results.map((r) => [r.name, r]));

let unexpected = 0;
const table = cases.map((c) => {
  const per = c.inputs.map((inp, i) => {
    const r = byName[c.name + '#in' + i];
    if (!r) return { input: i, address: inp.address === REG || inp.address === REGH ? 'registration' : 'foreign', measured: false };
    const role = (inp.address === REG || inp.address === REGH) ? 'registration' : 'vault';
    return { input: i, role, success: r.success, instructions: r.instructions, monotonic: r.monotonic, exception: r.exception ? r.exception.slice(0, 160) : '' };
  });
  const measured = per.filter((p) => p.measured !== false);
  const verdict = measured.every((p) => p.success);
  const failed = measured.filter((p) => !p.success).map((p) => p.input);
  const refusalOk = c.expect || c.refusedBy.every((i) => failed.includes(i));
  const ok = verdict === c.expect && refusalOk;
  if (!ok) unexpected++;
  const maxIns = Math.max(...measured.map((p) => p.instructions));
  const sumIns = measured.reduce((a, p) => a + p.instructions, 0);
  console.log((ok ? 'ok  ' : 'BAD ') + c.name.padEnd(52) + ' valid=' + String(verdict).padEnd(5) + ' expected=' + String(c.expect).padEnd(5) +
    ' per-input=' + measured.map((p) => p.instructions + (p.success ? '' : '!')).join('/'));
  return { name: c.name, design: c.script, expectedValid: c.expect, valid: verdict, asExpected: ok, expectedRefusedBy: c.refusedBy, refusedBy: failed,
    maxInstructionsPerInput: maxIns, sumInstructionsAllInputs: sumIns, inputs: per, note: c.note };
});

// ------------------------------------------------------------ live cross-check: the withdrawal core
const coreState = { 0: S.MAGIC, 1: acctC, 2: keyC, 3: payC, 4: String(BLOCK - 900), 5: '900.62345678', 6: String(BLOCK - 5), 7: '400.12345678', 8: '1', 12: WIN };
const corePrev = { 0: S.MAGIC, 1: acctC, 2: keyC, 3: payC, 4: String(BLOCK - 900), 5: '500.5', 12: WIN };
const liveCore = await runscript(T.core.clean, { state: coreState, prevstate: corePrev, globals: { '@BLOCK': String(BLOCK) }, signatures: [keyC] });
const liveCoreBad = await runscript(T.core.clean, { state: { ...coreState, 5: '500.5' }, prevstate: corePrev, globals: { '@BLOCK': String(BLOCK) }, signatures: [keyC] });
const liveCoreUnsigned = await runscript(T.core.clean, { state: coreState, prevstate: corePrev, globals: { '@BLOCK': String(BLOCK) }, signatures: [] });
const coreRuns = [
  { name: 'core', script: T.core.clean, input: 0, block: BLOCK, state: coreState, signatures: [keyC],
    inputs: [{ coinid: rnd(), address: T.core.address, amount: DUST, tokenid: WIN, storestate: true, state: corePrev, created: 2300000 }], outputs: [] },
  { name: 'core_window_not_advanced', script: T.core.clean, input: 0, block: BLOCK, state: { ...coreState, 5: '500.5' }, signatures: [keyC],
    inputs: [{ coinid: rnd(), address: T.core.address, amount: DUST, tokenid: WIN, storestate: true, state: corePrev, created: 2300000 }], outputs: [] },
];
writeFileSync(join(SCRATCH, 'step2-core.json'), JSON.stringify(coreRuns));
const inProcCore = JSON.parse(execFileSync(JAVA, ['-cp', CP, 'KissRunScaled', join(SCRATCH, 'step2-core.json')]).toString());
const crossCheck = {
  script: 'kiss/step2/reg_core_runscript.kiss',
  liveHonest: { success: liveCore.success, instructions: liveCore.instructions, monotonic: liveCore.monotonic, error: liveCore.executionError },
  inProcessHonest: inProcCore[0],
  liveWindowNotAdvanced: { success: liveCoreBad.success, instructions: liveCoreBad.instructions },
  inProcessWindowNotAdvanced: inProcCore[1],
  liveUnsigned: { success: liveCoreUnsigned.success, instructions: liveCoreUnsigned.instructions },
  countsMatch: liveCore.instructions === inProcCore[0].instructions && liveCoreBad.instructions === inProcCore[1].instructions,
};
console.log('core cross-check', JSON.stringify(crossCheck));

// ------------------------------------------------------------------------------------------ receipt
const receipt = {
  purpose: 'Step 2 (Instant payments: on-chain load and offload): instruction cost and refusal behaviour of every covenant branch, honest and refused, with 8-decimal token scaling',
  node, jar: 'DevNodesSet/9101/minima.jar (1.0.45.15)', timestamp: new Date().toISOString(),
  method: 'java/KissRunScaled.java: new Contract per input + setGlobals + run, as TxPoWChecker; tokens at scale 36 (8 decimals); every input of each transaction run, verdict = all inputs pass. Texts, addresses and clean-invariance on the live node (runscript).',
  parameters: { ...P, magic: S.MAGIC, dust: DUST, block: BLOCK, successorPlaceholder: SUCCESSOR, winiwa: WIN, xwiniwa: XWIN },
  texts: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, { chars: v.chars, cleanChars: v.cleanChars, address: v.address, cleanInvariant: v.cleanInvariant }])),
  summary: { transactions: table.length, unexpected, honest: table.filter((t) => t.expectedValid).length, refusals: table.filter((t) => !t.expectedValid).length,
    maxInstructionsAnyInput: Math.max(...table.map((t) => t.maxInstructionsPerInput)) },
  crossCheck,
  cases: table,
};
const file = saveReceipt('step2_covenant_branches', receipt);
console.log('receipt', file, 'unexpected', unexpected);

// ------------------------------------------------------------------------------ measured .kiss files
function header(title, purpose, ports, names, extra = []) {
  const rows = table.filter((t) => names(t));
  return [
    `// ${title} (step 2: Instant payments load and offload, docs/step2-load-offload-design.md)`,
    `// Purpose: ${purpose}`,
    `// Ports: ${ports}`,
    `// Measured: measure/receipts/step2_covenant_branches.json (node ${node.version} jar in-process, 8-decimal token scaling; parse, clean form and address on the live node ${node.version}).`,
    '// Register only the comment-free text below, in the runscript CLEAN form (newscript files text as given; the address is of the clean form).',
    ...extra,
    '// Measured transactions (instructions per input, ! = that input refused; verdict = every input passes):',
    ...rows.map((t) => `//   ${t.name}: ${t.inputs.filter((p) => p.instructions != null).map((p) => p.instructions + (p.success ? '' : '!')).join('/')} -> valid=${t.valid} (expected ${t.expectedValid})`),
    '',
  ].join('\n');
}
const portsReg = '0 magic; 1 account id; 2 withdrawal key; 3 payout; 4 window start; 5 used; 6 claimed block; 7 amount; 8 op (1 withdraw, 2 close); 10 change; 11 dust; 12 currency governed';
writeFileSync(join(KISS_DIR, 'instant_registration.kiss'), header('instant_registration.kiss', 'design A (recommended): per-account, per-currency registration coin; the dedicated withdrawal key signs; daily cash-out limit; payout pinned to the owner\'s Savings address',
  portsReg, (t) => t.design === 'A' && !/^V_|^NEG_V_/.test(t.name),
  [`// Address of this exact text (clean form): ${T.reg.address}. Parameters: limit ${P.limit} per window, window ${P.day} blocks, claimed-block slack ${P.slack}.`]) + S.regScript() + '\n');
writeFileSync(join(KISS_DIR, 'instant_vault.kiss'), header('instant_vault.kiss', 'the pooled vault, generic by token id: WITHDRAW (only beside a registration coin at input 0), MERGE (anyone), RETIRE (after dormancy, to the successor)',
  '8 op (1 withdraw, 3 merge, 4 retire); 10 change or merged total; 12 currency (withdraw, pinned by the registration coin); 100+i retirement amount of input i', (t) => t.design === 'A',
  [`// Address of this exact text (clean form): ${T.vault.address}. It names the registration address ${T.reg.address} and a PLACEHOLDER successor ${SUCCESSOR} (the real successor is a founder decision fixed before deployment, which changes this address). Dormancy ${P.dormancy} blocks.`]) + S.vaultScript({ regAddress: T.reg.address, successor: SUCCESSOR }) + '\n');
writeFileSync(join(KISS_DIR, 'instant_registration_hashchain.kiss'), header('instant_registration_hashchain.kiss', 'design C (compared, not recommended): the same registration authorised by revealing the next link of an app-held SHA-256 hash chain; no Minima key',
  portsReg.replace('2 withdrawal key', '2 hash-chain head (the spend reveals its preimage here)'), (t) => t.design === 'C',
  [`// Address of this exact text (clean form): ${T.regh.address}; its vault variant (same vault text naming this address): ${T.vaulth.address}.`]) + S.regHashScript() + '\n');
writeFileSync(join(KISS_DIR, 'reg_core_runscript.kiss'), [
  '// reg_core_runscript.kiss (step 2): the transaction-free core of the registration coin\'s WITHDRAW, for a live-node cross-check',
  `// Measured: live node ${node.version} runscript = ${liveCore.instructions} instructions (success=${liveCore.success}); in-process = ${inProcCore[0].instructions} (success=${inProcCore[0].success}); counts match: ${crossCheck.countsMatch}.`,
  `// Refusals on the live node: window not advanced ${liveCoreBad.instructions} (success=${liveCoreBad.success}); unsigned ${liveCoreUnsigned.instructions} (success=${liveCoreUnsigned.success}).`,
  '', S.regCoreScript(), ''].join('\n'));
console.log('kiss files written to', KISS_DIR);
