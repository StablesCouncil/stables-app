/*
 * Stables Instant payments, step 2 (build 103): the ON-CHAIN side. Loading the Instant payments
 * balance from Savings ("Add from Savings") and offloading it back ("Move to Savings"), on the two
 * covenants proven on Minima mainnet by STEP2-PRESEED-01-R1 (2026-09-29, green, L2 for these shapes).
 *
 * Design: simcard/docs/step2-load-offload-design.md version 2, founder decisions of 2026-09-28:
 * design A (a dedicated withdrawal key and one registration coin per account and currency, a POOLED
 * vault), no daily limit, no time-based retirement, no global brake, automatic registration.
 *
 * THE SHAPES ARE THE MINED ONES. Every transaction here is built with the exact command sequence of
 * the pre-seed runner (simcard/measure/step2v2-preseed.mjs, buildCommands) and the exact inputs,
 * outputs and state ports of the control that was mined:
 *   load with registration   H01  in: Savings coins; out: 0 VAULT (keep), 1 REG one atom (keep),
 *                                 2 change to Savings; state 0 magic, 1 account, 2 key, 3 payout, 12 token
 *   load                     H03  in: Savings coins; out: 0 VAULT (keep), 1 change; state 0, 1, 3
 *   registration alone       H01 without the vault output (the registration part of H01 unchanged)
 *   withdrawal with change   H02  in: 0 registration, then vault coins; out: 0 payout, 1 VAULT change
 *                                 (no state), 2 REG (keep); state 0-3, 7 amount, 8 = 1, 10 change,
 *                                 11 registration dust, 12 token; signed by the withdrawal key
 *   withdrawal of the rest   H05  as H02 with no change output and port 10 = 0
 *   merge (anyone)           H04  in: vault coins; out: 0 VAULT the exact sum (no state); 8 = 3, 10 sum
 * Build order as in the runner: txncreate, txninput, txnoutput, txnstate (ports ascending), txnbasics,
 * txnsign (publickey:auto for a Savings spend, publickey:<the withdrawal key> for a withdrawal, none
 * for a merge), txncheck (all four flags true, or nothing is posted), txnpost txndelete:true. The
 * withdrawal key comes from `keys action:new` (HP5 of the pre-seed: it signs covenant inputs through
 * txnsign publickey:). The covenants are tracked with `newscript trackall:true` over the EXACT clean
 * text (txn-building laws 2 and 3: any other form tracks a phantom address), and the address the node
 * answers must be the frozen one, or nothing proceeds.
 *
 * CREDITING (design section 3.2). A load is credited ONCE PER LOAD COIN ID (the protocol's seen key
 * load:<coinid>), after THREE confirmations seen by this app's own node, by whichever path finds it
 * first: the app's own record (fast path: the load coin, then its transaction by id), or a scan of
 * the vault for coins naming this account (a load made elsewhere, or a record lost while the coin is
 * unspent). A load the chain never took is "Not sent" once its inputs are still unspent after the
 * mempool would have kept it; one this node can no longer answer for is "Proof unavailable" (the
 * four-state law), never credited on a guess and never dropped.
 *
 * OFFLOAD (design section 4). Debit first (the protocol's beginOffload), then register if this
 * currency has no registration yet ("Preparing"), merge first if more than ten vault coins would be
 * needed, then the withdrawal. The debit is given back ONLY while nothing was posted (a failed build,
 * a post the node refused, an approval the person never gave). A posted withdrawal is followed to the
 * chain; if it is dropped it is rebuilt with fresh vault coins under the SAME withdrawal id and the
 * same debit. Refused in place, BEFORE any debit: more than the Instant balance holds, a registration
 * that this node cannot see, more than the vault can pay right now (law 11).
 *
 * Platforms: the standalone Android app signs in-process; the web preview through the node's RPC; a
 * MiniDapp in read mode queues each txnsign for the person's approval in Minima (the one write command
 * here, Minima's CommandRunner write list), and the app waits for it by reading txncheck; the Core
 * companion needs Admin pairing (every command is on its CommandPolicy allowlist; its history is
 * capped at three, so nothing here depends on history there, and the vault is never listed whole
 * there: the reply cap).
 *
 * Runs in the browser (window.StablesInstantChain) and in Node (module.exports) for unit tests: all
 * node access goes through the `node` adapter given to create(), so tests hand it mocked replies.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.StablesInstantChainCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function (G) {
  'use strict';

  var MAGIC = '0x53544931';             // "STI1", port 0 of load and registration coins
  var ONE = '0.00000001';               // one atom: the registration coin's dust
  var DEPTH = 3;                        // before a coin is spent (the wallet age rule of XN-MAIN-001-R4), and the
                                        // confirmations an Add or Remove waits for when the app gives no setting.
                                        // Build 0.0.12.026 (founder 2026-10-04, "confirming 0/3, it should be 0/1"):
                                        // an Add is credited and a Remove is received at the person's OWN confirmation
                                        // setting (opts.confirmBlocks, default 1); the spend age stays 3.
  var MAX_WITHDRAW_COINS = 10;          // design section 7: at most ten vault coins per withdrawal (28 KB)
  var MAX_MERGE_COINS = 20;             // a merge of twenty stays well inside the Core reply cap
  /* The shared pool kept usable (build 0.0.12.039; founder 2026-10-04: "if the pool for the Stables cards is fully
     autonomous couldn't we face the same issue, that someone will come today and won't be able to cash out because too
     many UTXO?"). Nothing here needs a server: a cash-out merges as many rounds as it needs, sweeps small coins into its
     own change, and every app with the card tidies the pool a little while it is open. */
  var MAX_MERGE_ROUNDS = 6;             // rounds of merges a cash-out may wait for (each about three blocks)
  var MERGES_PER_ROUND = 3;             // disjoint merges posted together in one round
  var SWEEP_ABOVE = 12;                 // a pool with more coins than this is swept by every cash-out
  var TIDY_ABOVE = 30;                  // a pool with more coins than this is tidied by any open app
  var DROP_MS = 20 * 60 * 1000;         // longer than the mempool keeps a transaction
  var PROOF_WINDOW_MS = 15 * 60 * 60 * 1000;   // about the unpruned window (design section 3.2)
  var APPROVAL_MS = 4 * 60 * 1000;      // how long a MiniDapp waits for the person's approval
  var OFFLOAD_PREPOST = ['committed', 'preparing', 'merging'];   // debited, nothing posted in this attempt
  var TXN = { load: 'stables_instant_load', register: 'stables_instant_register', merge: 'stables_instant_merge', withdraw: 'stables_instant_withdraw', carrier: 'stables_instant_carrier' };

  var MESSAGES = {
    'insufficient': 'Your Stables card balance is too low for this.',
    'vault-short': 'Stables card cannot move this much to Savings right now.',
    'reg-unavailable': 'Your Stables card registration is not visible to your node yet, so nothing can move to Savings. Nothing was moved.',
    'phantom': 'Your node filed the Stables card script at an unexpected address. Nothing was moved.',
    'savings-short': 'Not enough in Savings for this.',
    'not-approved': 'Not approved in Minima. Nothing was moved.',
    'not-valid': 'Your node could not validate this transaction. Nothing was moved.',
    'refused': 'Your node refused this transaction. Nothing was moved.',
    'no-node': 'Your node is not connected yet. Nothing was moved.',
    'core-readonly': 'Moving money between Savings and your Stables card needs you to allow Admin in Minima Core.',
    'registration-slow': 'Your Stables card registration has not confirmed yet. Nothing was moved; try again in a minute.',
    'merge-slow': 'Preparing Stables card for this amount has not confirmed yet. Nothing was moved; try again in a minute.'
  };
  function ChainError(code, message, extra) {
    var e = new Error(message || MESSAGES[code] || code);
    e.code = code;
    e.instantChain = true;
    Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  /* ---------- exact amounts: 8-decimal token units, BigInt atoms, never floating point ---------- */
  var SCALE = BigInt(100000000);
  function toAtoms(value) {
    var s = String(value == null ? '' : value).replace(/,/g, '').trim();
    var m = s.match(/^(\d+)(?:\.(\d+))?$/);
    if (!m) throw ChainError('not-valid', 'Not a token amount: ' + s);
    var frac = (m[2] || '').replace(/0+$/, '');
    if (frac.length > 8) throw ChainError('not-valid', 'More than 8 decimals: ' + s);
    return BigInt(m[1]) * SCALE + BigInt((frac + '00000000').slice(0, 8));
  }
  function dec(atoms) {
    var a = BigInt(atoms);
    if (a < BigInt(0)) throw ChainError('not-valid', 'A negative amount');
    var whole = (a / SCALE).toString();
    var frac = (a % SCALE).toString().padStart(8, '0').replace(/0+$/, '');
    return whole + (frac ? '.' + frac : '');
  }
  /** An amount in a state port: the same canonical decimal the runner wrote ("0.00000001", "0.00000002", "0"). */
  function stateDec(atoms) { return dec(atoms); }
  function coinAtoms(c) { return toAtoms(c && (c.tokenamount != null ? c.tokenamount : c.amount)); }

  /* ---------- identities ---------- */
  function hx(value) {
    var h = String(value == null ? '' : value).trim().replace(/^0x/i, '');
    return /^[0-9a-fA-F]+$/.test(h) ? '0x' + h.toUpperCase() : '';
  }
  function same(a, b) { return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase(); }
  function stateMap(coin) {
    var out = {};
    var st = coin && coin.state;
    if (Array.isArray(st)) st.forEach(function (e) { if (e && e.port != null) out[String(e.port)] = String(e.data == null ? '' : e.data).replace(/^\[|\]$/g, ''); });
    else if (st && typeof st === 'object') Object.keys(st).forEach(function (k) { out[String(k)] = String(st[k]); });
    return out;
  }

  /* ---------- the plans: the mined shapes, as data ---------- */
  function out(address, atoms, tokenid, storestate) { return { address: address, amount: dec(atoms), tokenid: tokenid, storestate: !!storestate }; }

  /**
   * A load (H03), or the first load in a currency with its registration (H01).
   *   p {config, coins, atoms, tokenId, payout, account, key, register}
   */
  function loadPlan(p) {
    var cfg = p.config;
    var token = hx(p.tokenId);
    var atoms = BigInt(p.atoms);
    if (atoms <= BigInt(0)) throw ChainError('not-valid', 'Enter an amount above zero.');
    var total = BigInt(0);
    var inputs = (p.coins || []).map(function (c) {
      if (!same(c.tokenid, token)) throw ChainError('not-valid', 'A Savings coin of another currency.');
      total += coinAtoms(c);
      return c.coinid;
    });
    var dust = p.register ? BigInt(1) : BigInt(0);
    var change = total - atoms - dust;
    if (!inputs.length || change < BigInt(0)) throw ChainError('savings-short');
    var outputs = [out(cfg.VAULT, atoms, token, true)];
    if (p.register) outputs.push(out(cfg.REG, dust, token, true));
    if (change > BigInt(0)) outputs.push(out(p.changeTo || p.payout, change, token, false));   // 0.0.12.044: back to the picked address
    var state = { 0: MAGIC, 1: hx(p.account), 3: hx(p.payout) };
    if (p.register) { state[2] = p.key; state[12] = token; }
    return { kind: 'load', inputs: inputs, outputs: outputs, state: state, sign: 'auto', loadIndex: 0, regIndex: p.register ? 1 : -1 };
  }

  /**
   * A registration on its own (the first move to Savings in a currency that was never loaded): the
   * registration part of H01, one atom of `dustToken` at REG naming `currency` in port 12.
   *   p {config, coins, dustToken, currency, payout, account, key}
   */
  function registrationPlan(p) {
    var cfg = p.config;
    var dust = hx(p.dustToken);
    var total = BigInt(0);
    var inputs = (p.coins || []).map(function (c) {
      if (!same(c.tokenid, dust)) throw ChainError('not-valid', 'A Savings coin of another currency.');
      total += coinAtoms(c);
      return c.coinid;
    });
    var change = total - BigInt(1);
    if (!inputs.length || change < BigInt(0)) throw ChainError('savings-short');
    var outputs = [out(cfg.REG, BigInt(1), dust, true)];
    if (change > BigInt(0)) outputs.push(out(p.changeTo || p.payout, change, dust, false));   // 0.0.12.044: the change goes back where the coin came from
    var state = { 0: MAGIC, 1: hx(p.account), 2: p.key, 3: hx(p.payout), 12: hx(p.currency) };
    return { kind: 'register', inputs: inputs, outputs: outputs, state: state, sign: 'auto', regIndex: 0 };
  }

  /**
   * A withdrawal (H02 with change, H05 without): the registration coin at input 0, then vault coins
   * of the currency; the amount to the registered payout, the change back to the vault with NO state,
   * the registration coin re-created last with all it held and its state. Change = everything of that
   * currency coming in, minus the registration's own dust if it is that currency, minus the amount
   * (the registration script's own arithmetic, SUMINPUTS).
   *   p {config, reg, vault, atoms, currency, payout, account, key}
   */
  function withdrawPlan(p) {
    var cfg = p.config;
    var t = hx(p.currency);
    var atoms = BigInt(p.atoms);
    if (atoms <= BigInt(0)) throw ChainError('not-valid', 'Enter an amount above zero.');
    var reg = p.reg;
    var regToken = hx(reg.tokenid);
    var regAtoms = coinAtoms(reg);
    var sum = same(regToken, t) ? regAtoms : BigInt(0);
    (p.vault || []).forEach(function (c) {
      if (!same(c.tokenid, t)) throw ChainError('not-valid', 'A vault coin of another currency.');
      sum += coinAtoms(c);
    });
    var d = same(regToken, t) ? regAtoms : BigInt(0);
    var change = sum - d - atoms;
    if (change < BigInt(0)) throw ChainError('vault-short');
    var outputs = [out(hx(p.payout), atoms, t, false)];
    if (change > BigInt(0)) outputs.push(out(cfg.VAULT, change, t, false));
    outputs.push({ address: cfg.REG, amount: dec(regAtoms), tokenid: regToken, storestate: true });
    var state = {
      0: MAGIC, 1: hx(p.account), 2: p.key, 3: hx(p.payout),
      7: stateDec(atoms), 8: '1', 10: stateDec(change), 11: stateDec(regAtoms), 12: t
    };
    return { kind: 'withdraw', inputs: [reg.coinid].concat((p.vault || []).map(function (c) { return c.coinid; })), outputs: outputs,
      state: state, sign: p.key, payoutIndex: 0, regIndex: outputs.length - 1 };
  }

  /** A merge (H04): vault coins of one currency into one coin of exactly their sum, no state. Anyone. */
  function mergePlan(p) {
    var cfg = p.config;
    var coins = p.vault || [];
    if (coins.length < 2) throw ChainError('not-valid', 'Nothing to merge.');
    var t = hx(coins[0].tokenid);
    var sum = BigInt(0);
    coins.forEach(function (c) {
      if (!same(c.tokenid, t)) throw ChainError('not-valid', 'Vault coins of two currencies.');
      sum += coinAtoms(c);
    });
    return { kind: 'merge', inputs: coins.map(function (c) { return c.coinid; }), outputs: [out(cfg.VAULT, sum, t, false)],
      state: { 8: '3', 10: stateDec(sum) }, sign: null, mergeIndex: 0 };
  }

  /* ---------- the payment carrier (build 0.0.12.021, Machinery D087) ----------
   * Founder 2026-10-04: "One scan only, the receiver shows his code and the payer scans and confirms, the
   * payment goes directly ... What we have onchain, from saving is good, we just need to replicate it for
   * instant payment as much as possible." A QR is one way (receiver's screen to payer's camera), so the
   * signed payment goes back the way a Savings payment travels: a transaction to the receiver's Savings
   * address. One atom of dust to that address (the payment's own currency, else Winiwa), the change back
   * to the payer, and the payment text in the state: port 0 the magic "STI2", port 1 the UTF-8 text in
   * hex. The receiver's node sees it in its history at mempool time (the same read the Activity mirror
   * makes on every NEWTXPOW) and the app credits it there: the carrier is only the envelope, the payment
   * inside is what counts, so it is final the moment it is read, mined or not. Its own safety is the
   * payment's: bound to its Payee and refused twice (payer id + counter), so a copy read by anyone else
   * on the network can never be cashed. Proven before building (txncheck, nothing posted): a 4 KB state
   * passes every check.
   *   p {coins, dustToken, to, payout, text}
   */
  var CARRIER_MAGIC = '0x53544932';      // "STI2"
  function utf8Hex(text) {
    var bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(String(text)) : Buffer.from(String(text), 'utf8');
    var h = '';
    for (var i = 0; i < bytes.length; i++) h += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return '0x' + h.toUpperCase();
  }
  function hexUtf8(hex) {
    var h = String(hex || '').replace(/^\[|\]$/g, '').replace(/^0x/i, '');
    if (!h || h.length % 2 || /[^0-9a-fA-F]/.test(h)) return '';
    var bytes = new Uint8Array(h.length / 2);
    for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.substr(i * 2, 2), 16);
    try { return typeof TextDecoder === 'function' ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : Buffer.from(bytes).toString('utf8'); } catch (_) { return ''; }
  }
  function carrierPlan(p) {
    var dust = hx(p.dustToken);
    var to = hx(p.to);
    if (!/^0x[0-9a-fA-F]{64}$/.test(to)) throw ChainError('not-valid', 'The receiver’s code has no address to send to.');
    var total = BigInt(0);
    var inputs = (p.coins || []).map(function (c) {
      if (!same(c.tokenid, dust)) throw ChainError('not-valid', 'A Savings coin of another currency.');
      total += coinAtoms(c);
      return c.coinid;
    });
    var change = total - BigInt(1);
    if (!inputs.length || change < BigInt(0)) throw ChainError('savings-short');
    var outputs = [out(to, BigInt(1), dust, true)];
    if (change > BigInt(0)) outputs.push(out(hx(p.payout), change, dust, false));
    return { kind: 'carrier', inputs: inputs, outputs: outputs, state: { 0: CARRIER_MAGIC, 1: utf8Hex(p.text) }, sign: 'auto', carrierIndex: 0 };
  }
  /** The payment text a transaction carries, or '' (a txpow from `history`, or its txn). */
  function carrierText(txpow) {
    var txn = txpow && txpow.body && txpow.body.txn ? txpow.body.txn : (txpow && txpow.state ? txpow : null);
    var st = txn && txn.state;
    if (!Array.isArray(st)) return '';
    var magic = '', body = '';
    st.forEach(function (e) {
      if (!e) return;
      var v = String(e.data == null ? '' : e.data).replace(/^\[|\]$/g, '');
      if (String(e.port) === '0') magic = v;
      if (String(e.port) === '1') body = v;
    });
    return same(magic, CARRIER_MAGIC) ? hexUtf8(body) : '';
  }

  /** The builder commands of a plan: the pre-seed runner's buildCommands, line for line. */
  function planCommands(id, plan) {
    var c = ['txncreate id:' + id];
    plan.inputs.forEach(function (coinid) { c.push('txninput id:' + id + ' coinid:' + coinid); });
    plan.outputs.forEach(function (o) {
      c.push('txnoutput id:' + id + ' amount:' + o.amount + ' address:' + o.address + ' tokenid:' + o.tokenid + ' storestate:' + (o.storestate ? 'true' : 'false'));
    });
    Object.keys(plan.state).map(Number).sort(function (a, b) { return a - b; }).forEach(function (port) {
      c.push('txnstate id:' + id + ' port:' + port + ' value:' + plan.state[port]);
    });
    return c;
  }

  /**
   * Which vault coins pay `atoms` (design section 4.6): one coin large enough, chosen at random among
   * those, else the largest first up to `max`. {coins} when that works; {merge, merges} when more than
   * `max` would be needed but the vault holds enough; {short: available} when it does not.
   *
   * Build 0.0.12.039, the pool kept usable:
   *   - DUST RULE: a merge takes the smallest of the coins the cash-out NEEDS (the largest-first cover), never the
   *     smallest coins of the whole pool. Before, a pool sprinkled with thousands of tiny coins made every merge round
   *     merge dust, so a cash-out could never be covered; now tiny coins can only be ignored, never block.
   *   - up to MERGES_PER_ROUND disjoint merges ({merges}), so a heavily split cover needs fewer rounds;
   *   - SWEEP: when the pool holds more than SWEEP_ABOVE coins, the free input slots (up to `max`) take small coins,
   *     chosen at random among the smallest, and the change returns them to the pool as ONE coin. Every cash-out
   *     lowers the coin count instead of keeping it. Random among the smallest, so two phones rarely pick the same.
   */
  function pickVaultCoins(coins, atoms, max, random) {
    var need = BigInt(atoms);
    var cap = max || MAX_WITHDRAW_COINS;
    var rnd = typeof random === 'function' ? random : Math.random;
    var list = (coins || []).slice();
    var total = list.reduce(function (s, c) { return s + coinAtoms(c); }, BigInt(0));
    if (total < need) return { short: total };
    var picked;
    var big = list.filter(function (c) { return coinAtoms(c) >= need; });
    if (big.length) {
      picked = [big[Math.min(big.length - 1, Math.floor(rnd() * big.length))]];
    } else {
      list.sort(function (a, b) { var x = coinAtoms(a), y = coinAtoms(b); return x === y ? 0 : (x > y ? -1 : 1); });
      picked = [];
      var sum = BigInt(0);
      for (var i = 0; i < list.length && sum < need; i++) { picked.push(list[i]); sum += coinAtoms(list[i]); }
      if (picked.length > cap) {
        // Merge the smallest of the coins this cash-out needs: they are what makes it need so many.
        var needed = picked.slice().reverse();
        var merges = [];
        for (var m = 0; m < MERGES_PER_ROUND && needed.length >= 2 && picked.length - merges.reduce(function (s, b) { return s + b.length - 1; }, 0) > cap; m++) {
          merges.push(needed.splice(0, MAX_MERGE_COINS));
        }
        return { merge: merges[0], merges: merges };
      }
    }
    return { coins: picked.concat(sweepCoins(list, picked, cap - picked.length, rnd)) };
  }
  /** Up to `slots` small pool coins not already picked, chosen at random among the smallest; none when the pool is tidy. */
  function sweepCoins(all, picked, slots, rnd) {
    if (!(slots > 0) || all.length <= SWEEP_ABOVE) return [];
    var taken = {};
    picked.forEach(function (c) { taken[String(c.coinid).toLowerCase()] = true; });
    var rest = all.filter(function (c) { return !taken[String(c.coinid).toLowerCase()]; });
    rest.sort(function (a, b) { var x = coinAtoms(a), y = coinAtoms(b); return x === y ? 0 : (x < y ? -1 : 1); });
    var smallest = rest.slice(0, slots * 3);
    var out = [];
    while (out.length < slots && smallest.length) out.push(smallest.splice(Math.floor(rnd() * smallest.length), 1)[0]);
    return out;
  }
  /** A tidy merge for an open app: up to MAX_MERGE_COINS coins chosen at random among the pool's smallest, or null. */
  function tidyPick(coins, random) {
    var list = (coins || []).slice();
    if (list.length <= TIDY_ABOVE) return null;
    var rnd = typeof random === 'function' ? random : Math.random;
    list.sort(function (a, b) { var x = coinAtoms(a), y = coinAtoms(b); return x === y ? 0 : (x < y ? -1 : 1); });
    var smallest = list.slice(0, MAX_MERGE_COINS * 2);
    var out = [];
    while (out.length < MAX_MERGE_COINS && smallest.length) out.push(smallest.splice(Math.floor(rnd() * smallest.length), 1)[0]);
    return out.length >= 2 ? out : null;
  }

  /* ---------- the executor ---------- */
  /**
   * create(opts):
   *   opts.config   {REG, VAULT, REG_SCRIPT, VAULT_SCRIPT} (runtime-config INSTANT_CHAIN)
   *   opts.account  the Instant account (instant-protocol.js createAccount)
   *   opts.node     {cmd(command, label, timeoutMs) -> the reply's response payload (throws; e.needsConfirmation
   *                  for a command Minima queued for approval), coinsAt(address, extra[]) -> coins (the
   *                  relevant:false-safe read), coinsById(coinid) -> coins, gather(tokenId, amount, label,
   *                  covenantInputs, outputs) -> Savings coins, wallet() -> {address}, tip() -> block,
   *                  platform() -> 'standalone'|'web'|'minidapp'|'core', coreAdmin() -> bool, connected() -> bool,
   *                  canListVault() -> bool, noteInFlight(coins), visible() -> bool}
   *   opts.onChange function (entry) called whenever a load or offload record moves
   *   opts.now, opts.sleep, opts.random, opts.log
   */
  function create(opts) {
    var cfg = opts.config;
    var account = opts.account;
    var node = opts.node;
    var now = opts.now || function () { return Date.now(); };
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var log = opts.log || function () {};
    var onChange = opts.onChange || function () {};
    /* The confirmations an Add or a Remove waits for: the person's setting for that amount (Settings, confirmation
       levels), never below 1. The spend-age rule (DEPTH) is separate: it is the node's, not a choice. */
    function confirmDepth(e) {
      var d = NaN;
      try { if (typeof opts.confirmBlocks === 'function') d = Number(opts.confirmBlocks(e)); } catch (_) { d = NaN; }
      return d >= 1 && d <= 30 ? Math.floor(d) : DEPTH;
    }
    var protocol = opts.protocol || G.StablesInstantProtocol;
    var tracked = false;
    var busy = {};                       // entry id -> true while this session's own flow owns it
    var inFlightVault = {};              // vault coin id -> ms, coins our unconfirmed withdrawals spend

    function changed(entry) { try { onChange(entry); } catch (e) { log('onChange: ' + (e && e.message)); } return entry; }

    /* The platform decides whether a move can be made here at all (law 4: refused in place, never hidden). */
    function availability() {
      var platform = node.platform();
      if (!node.connected()) return { ok: false, code: 'no-node', reason: MESSAGES['no-node'], platform: platform };
      if (platform === 'core' && !node.coreAdmin()) return { ok: false, code: 'core-readonly', reason: MESSAGES['core-readonly'], platform: platform };
      return { ok: true, platform: platform, approvals: platform === 'minidapp' };
    }

    /* Track both covenants over their EXACT clean text; the node must answer the frozen address. */
    async function ensureTracked() {
      if (tracked) return;
      var pairs = [[cfg.REG_SCRIPT, cfg.REG], [cfg.VAULT_SCRIPT, cfg.VAULT]];
      for (var i = 0; i < pairs.length; i++) {
        var r = await node.cmd('newscript trackall:true script:"' + pairs[i][0] + '"', 'tracking Stables card', 60000);
        var got = r && (r.address || (r.response && r.response.address));
        if (!same(got, pairs[i][1])) throw ChainError('phantom', null, { got: got, want: pairs[i][1] });
      }
      tracked = true;
    }

    async function identity() {
      var me = await account.ensure();
      var info = await account.chainInfo();
      return { account: hx(me.id), info: info };
    }
    /* The dedicated withdrawal key: made once with `keys action:new`, never a Savings address. */
    async function ensureKey() {
      var info = await account.chainInfo();
      if (info.withdrawKey) return info.withdrawKey;
      var r = await node.cmd('keys action:new', 'making the Stables card key', 60000);
      var key = String((r && (r.publickey || (r.response && r.response.publickey))) || '');
      if (!/^0x[0-9a-fA-F]{8,}$/.test(key)) throw ChainError('not-valid', 'Your node did not return a key.');
      await account.setChainInfo({ withdrawKey: key });
      return key;
    }
    /* The payout: this wallet's own Savings address, fixed at the first move and pinned by the registration. */
    async function ensurePayout() {
      var info = await account.chainInfo();
      if (info.payout) return info.payout;
      var w = await node.wallet();
      var addr = hx(w && w.address);
      if (!addr || addr.length !== 66) throw ChainError('not-valid', 'Your node did not return a Savings address.');
      await account.setChainInfo({ payout: addr });
      return addr;
    }

    function tokenKey(tokenId) { return hx(tokenId).toLowerCase(); }
    /**
     * Build 0.0.12.044 (founder 2026-10-05: "when we bring back onchain from the card ... we should be able to specify the
     * wallet address to use"). The frozen registration covenant pays a withdrawal ONLY to the payout its registration
     * records (VERIFYOUT(0 PREVSTATE(3) ...), SAMESTATE(0 3)), so a move to another Savings address uses a registration of
     * its own for that address, made at its first use. The first payout keeps the plain currency key (every record made
     * before this build); another payout is keyed currency@payout.
     */
    function regKey(tokenId, payout, info) {
      var p = payout ? hx(payout).toLowerCase() : '';
      return !p || same(p, info && info.payout) ? tokenKey(tokenId) : tokenKey(tokenId) + '@' + p;
    }
    /** The Savings addresses this currency is registered to pay, the first payout first. */
    async function registeredPayouts(tokenId) {
      var info = await account.chainInfo();
      var t = tokenKey(tokenId), out = [];
      if (info.payout) out.push(hx(info.payout).toLowerCase());
      Object.keys(info.registrations || {}).forEach(function (k) {
        var r = info.registrations[k];
        if (k.indexOf(t + '@') === 0 && r && r.coinid) out.push(k.slice(t.length + 1));
      });
      return { payout: info.payout ? hx(info.payout).toLowerCase() : '', registered: out };
    }

    /* Run a plan through the builder and the checks. Returns {txnid, outputs:[coinid...]}. */
    async function build(id, plan, onApproval) {
      try { await node.cmd('txndelete id:' + id, 'clearing a previous draft', 15000); } catch (_) { /* none */ }
      var steps = planCommands(id, plan);
      if (typeof node.batch === 'function') await node.batch(steps, 'building the transaction', 90000);
      else for (var i = 0; i < steps.length; i++) await node.cmd(steps[i], 'building the transaction', 60000);
      var basics = await node.cmd('txnbasics id:' + id, 'finishing the transaction', 120000);
      var txn = basics && basics.transaction;
      var txnid = String((txn && txn.transactionid) || '');
      var outs = ((txn && txn.outputs) || []).map(function (o) { return String(o.coinid || ''); });
      if (!txnid || outs.length !== plan.outputs.length || outs.some(function (c) { return !/^0x[0-9a-fA-F]{64}$/.test(c); })) {
        throw ChainError('not-valid', 'The transaction could not be read back from your node.');
      }
      if (plan.sign) {
        try {
          await node.cmd('txnsign id:' + id + ' publickey:' + plan.sign, 'signing', 240000);
        } catch (e) {
          if (!(e && e.needsConfirmation)) throw e;
          if (typeof onApproval === 'function') await onApproval(true);
          var ok = await waitApproved(id);
          if (typeof onApproval === 'function') await onApproval(false);
          if (!ok) throw ChainError('not-approved');
        }
      }
      var check = await node.cmd('txncheck id:' + id, 'checking the transaction', 90000);
      var v = (check && check.valid) || {};
      var sig = v.signatures;
      if (Array.isArray(sig)) sig = sig.every(function (s) { return s && s.valid === true; });
      if (!(v.basic === true && sig === true && v.mmrproofs === true && v.scripts === true)) {
        log('txncheck refused ' + id + ': ' + JSON.stringify(v));
        throw ChainError('not-valid', null, { flags: v });
      }
      return { txnid: txnid, outputs: outs };
    }

    /* A MiniDapp in read mode: Minima queued the signature. Wait by READING txncheck (the pending
       queue is itself a write command), while the app is visible, for a bounded time. */
    async function waitApproved(id) {
      var until = now() + APPROVAL_MS;
      while (now() < until) {
        if (typeof node.visible === 'function' && !node.visible()) return false;
        await sleep(4000);
        try {
          var c = await node.cmd('txncheck id:' + id, 'checking the approval', 20000);
          var v = (c && c.valid) || {};
          if (v.basic && v.scripts && v.mmrproofs && v.signatures) return true;
        } catch (_) { /* not an answer; try again */ }
      }
      return false;
    }

    /* Post. {posted:true} | throws {refused:true} when the node said no (nothing posted), or
       {indeterminate:true} when no answer came back (the chain decides later). */
    async function post(id) {
      try {
        await node.cmd('txnpost id:' + id + ' txndelete:true', 'posting', 120000);
        return { posted: true };
      } catch (e) {
        var msg = String((e && e.message) || e || '');
        var transport = /timed out|timeout|abort|network|failed to fetch|not returning|connection/i.test(msg);
        var err = ChainError(transport ? 'indeterminate' : 'refused', transport ? msg : (MESSAGES.refused + (msg ? ' (' + msg + ')' : '')));
        err.refused = !transport;
        err.indeterminate = transport;
        throw err;
      }
    }

    async function drop(id) { try { await node.cmd('txndelete id:' + id, 'clearing the draft', 15000); } catch (_) { /* gone */ } }

    /* Coins at depth: {coin, depth} or null. */
    async function coinAt(coinid, tip) {
      coinid = hx(coinid);                 // records keep ids without 0x; the node wants it
      if (!coinid) return null;
      var list = await node.coinsById(coinid);
      var coin = (list || []).find(function (c) { return c && same(c.coinid, coinid); }) || null;
      if (!coin) return null;
      var created = Number(coin.created);
      return { coin: coin, spent: coin.spent === true || coin.spent === 'true', depth: created > 0 && tip >= created ? tip - created : 0, created: created };
    }

    /* ---------- registrations ---------- */
    /**
     * This account's registration coin for a currency, proven: unspent, at REG, naming this account,
     * this key, this payout and this currency, 3 blocks deep. {coin} | {pending} | {missing} |
     * {unavailable} (recorded, but this node cannot see it: refuse, never guess).
     */
    async function registration(tokenId, tip, payoutArg) {
      var id = await identity();
      var key = id.info.withdrawKey, payout = payoutArg ? hx(payoutArg) : id.info.payout;
      var t = hx(tokenId);
      var rk = regKey(t, payout, id.info);
      var rec = (id.info.registrations || {})[rk] || null;
      function mine(c) {
        var s = stateMap(c);
        return c && same(c.address, cfg.REG) && same(s['0'], MAGIC) && same(s['1'], id.account) && same(s['2'], key)
          && same(s['3'], payout) && same(s['12'], t) && !(c.spent === true || c.spent === 'true');
      }
      if (rec && rec.coinid) {
        var at = await coinAt(rec.coinid, tip);
        if (at && !at.spent && mine(at.coin)) return at.depth >= DEPTH ? { coin: at.coin, depth: at.depth } : { pending: true, depth: at.depth, coin: at.coin };
      }
      // Not where the record says (or no record): look for one this app made, by its key and payout.
      if (key && payout && node.canListVault()) {
        var all = await node.coinsAt(cfg.REG, []);
        var found = (all || []).filter(mine).sort(function (a, b) { return Number(b.created) - Number(a.created); })[0];
        if (found) {
          await account.setChainInfo({ registrations: (function () { var o = {}; o[rk] = { coinid: found.coinid, status: 'ready' }; return o; })() });
          var depth = tip - Number(found.created);
          return depth >= DEPTH ? { coin: found, depth: depth } : { pending: true, depth: depth, coin: found };
        }
      }
      if (rec && rec.coinid) {
        // A registration posted moments ago is not in a block yet: pending, not missing.
        if (rec.status === 'pending' && rec.at && now() - Number(rec.at) < DROP_MS) return { pending: true, depth: 0 };
        return { unavailable: true };
      }
      return { missing: true };
    }

    async function setRegistration(tokenId, patch, payout) {
      var o = {};
      o[regKey(tokenId, payout, payout ? await account.chainInfo() : null)] = patch;
      return account.setChainInfo({ registrations: o });
    }

    /* Wait until a registration or merge coin is DEPTH deep (a coin must be in a block, and aged, to be spent). */
    async function waitDeep(coinid, maxMs, code) {
      var until = now() + maxMs;
      while (now() < until) {
        var at = await coinAt(coinid, await node.tip());
        if (at && !at.spent && at.depth >= DEPTH) return at.coin;
        await sleep(12000);
      }
      throw ChainError(code);
    }

    /* ---------- the vault ---------- */
    async function vaultCoins(tokenId, tip) {
      var t = hx(tokenId);
      var coins = await node.coinsAt(cfg.VAULT, ['tokenid:' + t]);
      var cut = now() - DROP_MS;
      return (coins || []).filter(function (c) {
        if (!c || !same(c.address, cfg.VAULT) || !same(c.tokenid, t)) return false;
        if (c.spent === true || c.spent === 'true') return false;
        var mark = inFlightVault[String(c.coinid).toLowerCase()];
        if (mark && mark > cut) return false;
        return tip - Number(c.created) >= DEPTH;
      });
    }
    /** What the vault can pay out right now in a currency (for the in-place refusal), as atoms. */
    async function vaultCapacity(tokenId) {
      if (!node.canListVault()) return null;
      var coins = await vaultCoins(tokenId, await node.tip());
      return coins.reduce(function (s, c) { return s + coinAtoms(c); }, BigInt(0));
    }

    /* ---------- LOAD ("Add from Savings") ---------- */
    /**
     * Build and post one load. The caller made the record (account.recordLoad) and the row. Throws on
     * any failure before the post (the record reads "failed": nothing moved). After the post the record
     * reads "posted" and advance() credits it at three confirmations.
     *   req {lid, tokenId, atoms}
     */
    async function load(req) {
      var lid = String(req.lid);
      var entryId = 'LOAD-' + lid;
      busy[entryId] = true;
      try {
        await ensureTracked();
        var id = await identity();
        var t = hx(req.tokenId);
        var rec = (id.info.registrations || {})[tokenKey(t)];
        var register = !(rec && rec.coinid);
        var key = register ? await ensureKey() : id.info.withdrawKey;
        var payout = await ensurePayout();
        var atoms = BigInt(req.atoms);
        var from = req.from ? hx(req.from) : '';
        var coins = await node.gather(t, dec(atoms + (register ? BigInt(1) : BigInt(0))), req.label || 'Savings', 0, register ? 3 : 2, from || undefined);
        var plan = loadPlan({ config: cfg, coins: coins, atoms: atoms, tokenId: t, payout: payout, changeTo: from || payout, account: id.account, key: key, register: register });
        changed(await account.updateLoad(lid, { status: 'building', stage: 'building', inputs: plan.inputs }));
        var built = await build(TXN.load, plan, function (waiting) {
          return account.updateLoad(lid, { awaitingApproval: waiting }).then(changed);
        });
        var coinid = built.outputs[plan.loadIndex];
        var regCoinid = plan.regIndex >= 0 ? built.outputs[plan.regIndex] : '';
        changed(await account.updateLoad(lid, { coinid: coinid, txnid: built.txnid, regCoinid: regCoinid, regToken: register ? t : '' }));
        try {
          await post(TXN.load);
        } catch (e) {
          if (e && e.refused) { changed(await account.updateLoad(lid, { status: 'failed', note: e.message })); throw e; }
          // No answer: the chain decides (advance() finds the coin, or calls it Not sent later).
          changed(await account.updateLoad(lid, { status: 'posted', postedAt: now(), note: '' }));
          throw e;
        }
        try { node.noteInFlight(coins); } catch (_) { /* a convenience */ }
        if (register) await setRegistration(t, { coinid: regCoinid, status: 'pending', txnid: built.txnid, at: now(), regToken: t });
        return changed(await account.updateLoad(lid, { status: 'posted', postedAt: now(), awaitingApproval: false }));
      } catch (e) {
        await drop(TXN.load);
        var cur = await findEntry('load', lid);
        if (cur && cur.status === 'building' && !(e && e.indeterminate)) changed(await account.updateLoad(lid, { status: 'failed', note: (e && e.message) || MESSAGES.refused, awaitingApproval: false }));
        throw e;
      } finally {
        delete busy[entryId];
      }
    }

    async function findEntry(kind, key) {
      var list = await account.entries(kind);
      return list.find(function (e) { return (kind === 'load' ? e.lid : e.wid) === key; }) || null;
    }

    /* ---------- OFFLOAD ("Move to Savings") ---------- */
    /**
     * Checks that refuse IN PLACE, before any debit (law 11). Resolves {ok:true, capacity} or throws
     * with code 'insufficient' | 'reg-unavailable' | 'vault-short' (with .available, atoms).
     */
    async function offloadPreflight(req) {
      var t = hx(req.tokenId);
      var atoms = BigInt(req.atoms);
      var st = await account.state();
      var have = st.balances[t.slice(2).toLowerCase()] || BigInt(0);
      if (have < atoms) throw ChainError('insufficient', null, { balance: have, amount: atoms });
      var tip = await node.tip();
      var reg = await registration(t, tip, req.payout);
      if (reg.unavailable) throw ChainError('reg-unavailable');
      var cap = await vaultCapacity(t);
      if (cap != null && cap < atoms) throw ChainError('vault-short', null, { available: cap });
      return { ok: true, capacity: cap, registration: reg.coin ? 'ready' : (reg.pending ? 'pending' : 'missing') };
    }

    /**
     * Carry out a move to Savings whose debit is already committed (account.beginOffload). Returns the
     * record once posted. Anything that fails before the post gives the debit back (restoreOffload).
     *   req {wid, tokenId, atoms}
     */
    async function offload(req) {
      var wid = String(req.wid);
      var entryId = 'OFFLOAD-' + wid;
      busy[entryId] = true;
      var posted = false;
      var t = hx(req.tokenId);
      var atoms = BigInt(req.atoms);
      try {
        await ensureTracked();
        var key = await ensureKey();
        var payout = await ensurePayout();
        if (req.payout) payout = hx(req.payout);          // 0.0.12.044: the Savings address the person picked
        var id = await identity();
        var tip = await node.tip();
        if (req.payout) changed(await account.updateOffload(wid, { payout: payout }));
        var reg = await registration(t, tip, payout);
        if (reg.unavailable) throw ChainError('reg-unavailable');
        if (reg.missing) {
          // Automatic registration at the first move in this currency (decided 2026-09-28): one atom of
          // the currency itself when Savings holds it, else of Winiwa (design section 5).
          changed(await account.updateOffload(wid, { status: 'preparing', stage: 'registering' }));
          var dustToken = t, coins = null;
          try { coins = await node.gather(t, ONE, req.label || 'Savings', 0, 2); } catch (_) { coins = null; }
          if (!coins || !coins.length) {
            dustToken = hx(cfg.DUST_TOKEN || t);
            coins = await node.gather(dustToken, ONE, 'Winiwa', 0, 2);
          }
          var rplan = registrationPlan({ config: cfg, coins: coins, dustToken: dustToken, currency: t, payout: payout, changeTo: (coins[0] && coins[0].address) || payout, account: id.account, key: key });
          var rbuilt = await build(TXN.register, rplan, function (waiting) { return account.updateOffload(wid, { awaitingApproval: waiting }).then(changed); });
          await post(TXN.register);
          try { node.noteInFlight(coins); } catch (_) { /* a convenience */ }
          var regCoinid = rbuilt.outputs[rplan.regIndex];
          await setRegistration(t, { coinid: regCoinid, status: 'pending', txnid: rbuilt.txnid, at: now(), regToken: dustToken }, payout);
          changed(await account.updateOffload(wid, { regCoinid: regCoinid, regTxnid: rbuilt.txnid, awaitingApproval: false }));
          await waitDeep(regCoinid, 15 * 60 * 1000, 'registration-slow');
          reg = await registration(t, await node.tip(), payout);
        } else if (reg.pending) {
          changed(await account.updateOffload(wid, { status: 'preparing', stage: 'registering' }));
          if (reg.coin) await waitDeep(reg.coin.coinid, 15 * 60 * 1000, 'registration-slow');
          else await sleep(12000);
          reg = await registration(t, await node.tip(), payout);
        }
        if (!reg.coin) throw ChainError(reg.unavailable ? 'reg-unavailable' : 'registration-slow');
        await setRegistration(t, { coinid: reg.coin.coinid, status: 'ready' }, payout);

        // The vault coins: at most ten; merge first if more would be needed.
        var pick = pickVaultCoins(await vaultCoins(t, await node.tip()), atoms, MAX_WITHDRAW_COINS, opts.random);
        // Build 0.0.12.039: as many merge rounds as the cover needs (one round only before: a split pool then read "short").
        for (var round = 1; pick.merge && round <= MAX_MERGE_ROUNDS; round++) {
          changed(await account.updateOffload(wid, { status: 'merging', stage: 'merging', mergeRound: round }));
          var outs = [];
          for (var b = 0; b < pick.merges.length; b++) {
            var mbuilt = await build(TXN.merge, mergePlan({ config: cfg, vault: pick.merges[b] }));
            await post(TXN.merge);
            pick.merges[b].forEach(function (c) { inFlightVault[String(c.coinid).toLowerCase()] = now(); });
            outs.push(mbuilt);
          }
          var last = outs[outs.length - 1];
          changed(await account.updateOffload(wid, { mergeCoinid: last.outputs[0], mergeTxnid: last.txnid }));
          log('offload ' + wid + ': merge round ' + round + ', ' + outs.length + ' merge(s)');
          for (var o = 0; o < outs.length; o++) await waitDeep(outs[o].outputs[0], 15 * 60 * 1000, 'merge-slow');
          pick = pickVaultCoins(await vaultCoins(t, await node.tip()), atoms, MAX_WITHDRAW_COINS, opts.random);
        }
        if (pick.merge) throw ChainError('merge-slow');
        if (pick.short != null) throw ChainError('vault-short', null, { available: pick.short });
        if (!pick.coins) throw ChainError('vault-short', null, { available: BigInt(0) });

        var plan = withdrawPlan({ config: cfg, reg: reg.coin, vault: pick.coins, atoms: atoms, currency: t, payout: payout, account: id.account, key: key });
        changed(await account.updateOffload(wid, { status: 'building', stage: 'building', inputs: plan.inputs }));
        var built = await build(TXN.withdraw, plan, function (waiting) { return account.updateOffload(wid, { awaitingApproval: waiting }).then(changed); });
        changed(await account.updateOffload(wid, { txnid: built.txnid, payoutCoinid: built.outputs[plan.payoutIndex], regNextCoinid: built.outputs[plan.regIndex] }));
        try {
          await post(TXN.withdraw);
        } catch (e) {
          // No answer from the post: it may be on its way. From here it is followed, never given back.
          if (e && e.indeterminate) { posted = true; changed(await account.updateOffload(wid, { status: 'posted', everPosted: true, postedAt: now() })); }
          throw e;
        }
        posted = true;
        pick.coins.forEach(function (c) { inFlightVault[String(c.coinid).toLowerCase()] = now(); });
        await setRegistration(t, { coinid: built.outputs[plan.regIndex], status: 'pending', at: now() }, payout);
        return changed(await account.updateOffload(wid, { status: 'posted', everPosted: true, postedAt: now(), awaitingApproval: false, note: '' }));
      } catch (e) {
        if (!posted) {
          await drop(TXN.withdraw);
          var cur = await findEntry('offload', wid);
          if (cur && cur.everPosted) {
            // A rebuild of a withdrawal that was posted once and not seen since. Its debit stands (it
            // may still arrive); the follow loop tries again, and says where it got to.
            changed(await account.updateOffload(wid, { status: 'posted', payoutCoinid: '', awaitingApproval: false,
              note: 'Not received yet. The amount is not given back to your Stables card while this may still arrive.' }));
          } else {
            try {
              var r = await account.restoreOffload(wid, (e && e.message) || MESSAGES.refused);
              changed(r.entry);
            } catch (re) { log('restore refused: ' + (re && (re.code || re.message))); }
          }
        }
        throw e;
      } finally {
        delete busy[entryId];
      }
    }

    /* ---------- following the chain: credit loads, finish offloads ---------- */
    /** Find a transaction's canonical TxPoW by its transaction id (the post's id can differ, XN-MAIN-001-R1). */
    /**
     * Tidy the shared pool a little (build 0.0.12.039): when this node can list the pool and it holds more than
     * TIDY_ABOVE coins of a currency, one merge of up to MAX_MERGE_COINS small coins, chosen at random among the
     * smallest. Anyone may merge; nothing is signed and nobody's balance changes. Never while this app is moving money.
     */
    async function tidyVault(tokenId) {
      if (!node.canListVault() || Object.keys(busy).length) return { skipped: 'busy-or-unlisted' };
      var t = hx(tokenId);
      var batch = tidyPick(await vaultCoins(t, await node.tip()), opts.random);
      if (!batch) return { skipped: 'tidy' };
      busy['TIDY-' + t] = true;
      try {
        await ensureTracked();
        var built = await build(TXN.merge, mergePlan({ config: cfg, vault: batch }));
        await post(TXN.merge);
        batch.forEach(function (c) { inFlightVault[String(c.coinid).toLowerCase()] = now(); });
        log('tidy: merged ' + batch.length + ' pool coins of ' + t.slice(0, 10) + '…');
        return { merged: batch.length, coinid: built.outputs[0] };
      } finally {
        delete busy['TIDY-' + t];
      }
    }

    async function canonical(txnid) {
      if (!txnid || node.platform() === 'core') return null;   // Core caps history at three: coin reads decide there
      var h = await node.cmd('history max:20', 'reading history', 30000);
      var txpows = (h && h.txpows) || [];
      for (var i = 0; i < txpows.length; i++) {
        var tid = txpows[i] && txpows[i].body && txpows[i].body.txn && txpows[i].body.txn.transactionid;
        if (same(tid, txnid)) {
          var id = txpows[i].txpowid;
          var on = await node.cmd('txpow onchain:' + id, 'checking the block', 20000);
          if (on && (on.found === true || on.found === 'true')) return { txpowid: id, block: Number(on.block), confirmations: Number(on.confirmations) };
          return { txpowid: id, block: 0, confirmations: -1 };
        }
      }
      return null;
    }

    /** The TxPoW id of transaction txnid in block (build 0.0.12.056): the block's own TxPoW when it carries the
     *  transaction, else the one of its txnlist whose transaction id is txnid; '' when not found. */
    async function txpowInBlock(block, txnid) {
      if (!(Number(block) > 0) || !txnid) return '';
      var b = await node.cmd('txpow block:' + Number(block), 'reading the block', 20000);
      if (!b || !b.body) return '';
      if (b.body.txn && same(b.body.txn.transactionid, txnid)) return String(b.txpowid || '');
      var list = b.body.txnlist || [];
      for (var i = 0; i < list.length; i++) {
        var t = await node.cmd('txpow txpowid:' + list[i], 'reading the transaction', 20000);
        if (t && t.body && t.body.txn && same(t.body.txn.transactionid, txnid)) return String(t.txpowid || list[i]);
      }
      return '';
    }
    var txpowTried = {};
    /** Finished Adds and Removes that have their block but not their TxPoW id: up to three a pass, each tried once a session. */
    async function backfillTxpowids(loads, offs) {
      var todo = [];
      loads.forEach(function (e) { if (e.status === 'credited' && !e.txpowid && e.txnid && Number(e.block) > 0) todo.push(['load', e.lid, e]); });
      offs.forEach(function (e) { if ((e.status === 'received' || e.status === 'posted') && !e.txpowid && e.txnid && Number(e.block) > 0) todo.push(['offload', e.wid, e]); });
      var n = 0;
      for (var i = 0; i < todo.length && n < 3; i++) {
        var key = todo[i][0] + ':' + todo[i][1];
        if (txpowTried[key]) continue;
        txpowTried[key] = true;
        n++;
        try {
          var id = await txpowInBlock(todo[i][2].block, todo[i][2].txnid);
          if (id) { changed(await account.noteTxpowid(todo[i][0], todo[i][1], id)); log(key + ': TxPoW ' + id.slice(0, 12) + '…'); }
        } catch (err) { log(key + ' TxPoW: ' + (err && (err.code || err.message))); }
      }
    }

    async function inputsUnspent(inputs) {
      if (!inputs || !inputs.length) return false;
      for (var i = 0; i < inputs.length; i++) {
        var list = await node.coinsById(inputs[i]);
        var c = (list || []).find(function (x) { return x && same(x.coinid, inputs[i]); });
        if (!c || c.spent === true || c.spent === 'true') return false;
      }
      return true;
    }

    /** One load record against the chain. Credits at DEPTH, once. */
    async function advanceLoad(e, tip) {
      if (busy['LOAD-' + e.lid]) return e;
      if (e.status !== 'posted' && !(e.status === 'building' && e.coinid && now() - Number(e.updatedAt || e.ts) > 2 * 60 * 1000)) return e;
      if (!e.coinid) return e;
      var at = await coinAt(e.coinid, tip);
      var depth = null, block = 0, txpowid = e.txpowid || '';
      if (at) { depth = at.depth; block = at.created; }
      else {
        var c = await canonical(e.txnid);
        if (c && c.confirmations >= 0) { depth = c.confirmations; block = c.block; txpowid = c.txpowid; }
        else if (c) { txpowid = c.txpowid; }
      }
      if (depth != null && !txpowid && block > 0) { try { txpowid = await txpowInBlock(block, e.txnid); } catch (_) { txpowid = ''; } }
      if (depth != null && depth >= confirmDepth(e)) {
        var amount = at ? coinAtoms(at.coin) : BigInt(e.amount);
        if (txpowid && txpowid !== e.txpowid) await account.updateLoad(e.lid, { txpowid: txpowid, block: block });
        var r = await account.creditLoad({ coinid: e.coinid, amount: amount, tokenId: e.tokenId, lid: e.lid, block: block, source: 'record' });
        if (e.regCoinid && e.regToken) {
          var info = await account.chainInfo();
          var rec = (info.registrations || {})[tokenKey(e.regToken)];
          if (!rec || !rec.coinid) await setRegistration(e.regToken, { coinid: e.regCoinid, status: 'ready' });
        }
        return changed(r.entry || await findEntry('load', e.lid));
      }
      if (depth != null) {
        return changed(await account.updateLoad(e.lid, { status: 'posted', block: block, depth: depth, txpowid: txpowid, proof: '' }));
      }
      // Neither the coin nor the transaction: after the mempool's time, with its inputs back unspent,
      // the load was never taken (Not sent). Past the unpruned window, this node cannot answer.
      var since = now() - Number(e.postedAt || e.updatedAt || e.ts);
      if (since > PROOF_WINDOW_MS) return changed(await account.updateLoad(e.lid, { proof: 'unavailable' }));
      if (since > DROP_MS && await inputsUnspent(e.inputs)) {
        if (e.regCoinid && e.regToken) {
          // Its registration output never existed either: forget it, so the next load registers again.
          var info2 = await account.chainInfo();
          var rec2 = (info2.registrations || {})[tokenKey(e.regToken)];
          if (rec2 && same(rec2.coinid, e.regCoinid)) await setRegistration(e.regToken, null);
        }
        return changed(await account.updateLoad(e.lid, { status: 'failed', note: 'This did not reach the network. Nothing moved.' }));
      }
      return e;
    }

    /** One offload record against the chain: Received at DEPTH, settled one block later. */
    async function advanceOffload(e, tip) {
      if (busy['OFFLOAD-' + e.wid]) return e;
      var age = now() - Number(e.updatedAt || e.ts);
      if (OFFLOAD_PREPOST.indexOf(e.status) >= 0) {
        // The app closed in the middle of this move, before its withdrawal was posted: carry on.
        if (age > 2 * 60 * 1000) resume(e);
        return e;
      }
      if (['posted', 'building'].indexOf(e.status) < 0 && !(e.status === 'received' && !e.settled)) return e;
      if (e.status === 'building' && age < 2 * 60 * 1000) return e;
      if (e.proof === 'stuck') return e;
      var depth = null, block = 0, txpowid = e.txpowid || '';
      if (e.payoutCoinid) {
        var at = await coinAt(e.payoutCoinid, tip);
        if (at) { depth = at.depth; block = at.created; }
        else {
          var c = await canonical(e.txnid);
          if (c && c.confirmations >= 0) { depth = c.confirmations; block = c.block; txpowid = c.txpowid; }
        }
      }
      if (depth != null && !txpowid && block > 0) { try { txpowid = await txpowInBlock(block, e.txnid); } catch (_) { txpowid = ''; } }
      if (depth != null) {
        var patch = { status: depth >= confirmDepth(e) ? 'received' : 'posted', block: block, depth: depth, txpowid: txpowid };
        if (depth >= confirmDepth(e) && !e.receivedAt) patch.receivedAt = now();
        // The Savings figure is the node's SENDABLE balance, which a received coin joins at coin
        // depth; the "+X" beside it stays one block past that, as the mirror does for any receipt.
        if (depth >= DEPTH + 1) patch.settled = true;
        if (depth >= DEPTH && e.regNextCoinid) await setRegistration(e.tokenId.length === 64 ? '0x' + e.tokenId : e.tokenId, { coinid: e.regNextCoinid, status: 'ready' }, e.payout || undefined);
        return changed(await account.updateOffload(e.wid, patch));
      }
      var since = now() - Number(e.postedAt || e.updatedAt || e.ts);
      if (since > PROOF_WINDOW_MS) return changed(await account.updateOffload(e.wid, { proof: 'unavailable' }));
      // Dropped: the registration input is unspent again. Rebuild under the SAME id and the same
      // debit (design section 4.1), with fresh vault coins; after three attempts say so and stop.
      if (since > DROP_MS && e.inputs && e.inputs[0] && await inputsUnspent([e.inputs[0]])) {
        if (Number(e.attempt || 1) >= 3) {
          return changed(await account.updateOffload(e.wid, { proof: 'stuck',
            note: 'Not received. The amount is not given back to your Stables card while this may still arrive.' }));
        }
        (e.inputs || []).slice(1).forEach(function (id) { delete inFlightVault[String(id).toLowerCase()]; });
        var next = await account.updateOffload(e.wid, { status: 'committed', attempt: Number(e.attempt || 1) + 1, everPosted: true, payoutCoinid: '', txnid: '', note: '' });
        changed(next);
        resume(next);
      }
      return e;
    }
    /* Carry an unfinished move on (after a restart, or a dropped withdrawal). Its debit stands. */
    function resume(e) {
      offload({ wid: e.wid, tokenId: e.tokenId.length === 64 ? '0x' + e.tokenId : e.tokenId, atoms: BigInt(e.amount), label: e.label, payout: e.payout || undefined })
        .catch(function (err) { log('resume ' + e.wid + ': ' + (err && (err.code || err.message))); });
    }

    /**
     * Loads made for this account that the app holds no open record of (design section 3.2, path two):
     * vault coins naming this account, 3 deep. Credited once per coin id, like any load. Never on Core
     * (the vault is not listed whole there).
     */
    async function scanVault(tip) {
      if (!node.canListVault()) return [];
      var me = await account.ensure();
      var acct = hx(me.id);
      var coins = await node.coinsAt(cfg.VAULT, []);
      var credited = [];
      for (var i = 0; i < (coins || []).length; i++) {
        var c = coins[i];
        var s = stateMap(c);
        if (!same(c.address, cfg.VAULT) || !same(s['0'], MAGIC) || !same(s['1'], acct)) continue;
        if (!(tip - Number(c.created) >= confirmDepth({ amount: coinAtoms(c).toString(), tokenId: String(c.tokenid || '') }))) continue;
        var token = String(c.tokenid || '');
        if (!protocol || !protocol.currencyOf(token)) continue;
        try {
          var r = await account.creditLoad({ coinid: c.coinid, amount: coinAtoms(c), tokenId: token, block: Number(c.created), source: 'scan' });
          if (r.status === 'credited') { credited.push(r.entry); changed(r.entry); }
        } catch (err) { log('scan credit: ' + (err && (err.code || err.message))); }
      }
      return credited;
    }

    /* ---------- the payment carrier (D087) ---------- */
    /**
     * Send a committed payment to its receiver over the network: one atom of dust to the receiver's
     * Savings address, the payment text in the state (carrierPlan). The payment is already debited and
     * stored; this only carries it. Resolves {coinid, txnid} once posted; throws when nothing could be
     * posted (no node, no dust, refused), and the caller then offers the second scan instead.
     *   req {text, to, tokenId, label}
     */
    var carrying = false;
    async function sendCarrier(req) {
      var a = availability();
      if (!a.ok) throw ChainError(a.code, a.reason);
      if (carrying) throw ChainError('not-valid', 'Another payment is being sent.');
      carrying = true;
      try {
        var t = hx(req.tokenId);
        var payout = await ensurePayout();
        var dustToken = t, coins = null;
        try { coins = await node.gather(t, ONE, req.label || 'Savings', 0, 2); } catch (_) { coins = null; }
        if (!coins || !coins.length) {
          dustToken = hx(cfg.DUST_TOKEN || t);
          coins = await node.gather(dustToken, ONE, 'Winiwa', 0, 2);
        }
        var plan = carrierPlan({ coins: coins, dustToken: dustToken, to: req.to, payout: payout, text: req.text });
        var built = await build(TXN.carrier, plan);
        await post(TXN.carrier);
        try { node.noteInFlight(coins); } catch (_) { /* a convenience */ }
        return { coinid: built.outputs[plan.carrierIndex], txnid: built.txnid, dustToken: dustToken, inputs: plan.inputs };
      } catch (e) {
        await drop(TXN.carrier);
        throw e;
      } finally {
        carrying = false;
      }
    }
    /** Where a posted carrier stands: {depth} once in a block, {pending} before, {dropped} when its inputs are unspent again. */
    async function carrierState(c) {
      var tip = await node.tip();
      var at = await coinAt(c.coinid, tip);
      if (at) {
        // Build 0.0.12.057: the payer's row links to the carrier's transaction, so its TxPoW id comes with the block.
        var tid = c.txpowid || '';
        if (!tid && c.txnid && at.created > 0) { try { tid = await txpowInBlock(at.created, c.txnid); } catch (_) { tid = ''; } }
        return { depth: at.depth, block: at.created, txpowid: tid };
      }
      if (c.inputs && c.inputs.length && now() - Number(c.at || 0) > DROP_MS && await inputsUnspent(c.inputs)) return { dropped: true };
      return { pending: true };
    }

    /** One pass over every open record. Returns true while something is still open. */
    async function advance(opts2) {
      var tip = await node.tip();
      if (!(tip > 0)) return true;
      var loads = await account.entries('load');
      var offs = await account.entries('offload');
      var open = false;
      for (var i = 0; i < loads.length; i++) {
        var e = loads[i];
        if (e.status === 'posted' || e.status === 'building') {
          try { e = await advanceLoad(e, tip); } catch (err) { log('load ' + e.lid + ': ' + (err && (err.code || err.message))); }
          if (e && (e.status === 'posted' || e.status === 'building')) open = true;
        }
      }
      for (var j = 0; j < offs.length; j++) {
        var o = offs[j];
        if (OFFLOAD_PREPOST.concat(['posted', 'building']).indexOf(o.status) >= 0 || (o.status === 'received' && !o.settled)) {
          try { o = await advanceOffload(o, tip); } catch (err) { log('offload ' + o.wid + ': ' + (err && (err.code || err.message))); }
          if (o && o.proof !== 'stuck' && (OFFLOAD_PREPOST.concat(['posted', 'building']).indexOf(o.status) >= 0 || (o.status === 'received' && !o.settled))) open = true;
        }
      }
      try { await backfillTxpowids(loads, offs); } catch (err) { log('txpow backfill: ' + (err && (err.code || err.message))); }
      if (opts2 && opts2.scan) { try { await scanVault(tip); } catch (err) { log('scan: ' + (err && (err.code || err.message))); } }
      return open;
    }

    return {
      availability: availability, ensureTracked: ensureTracked, vaultCapacity: vaultCapacity,
      load: load, offloadPreflight: offloadPreflight, offload: offload,
      advance: advance, advanceLoad: advanceLoad, advanceOffload: advanceOffload, scanVault: scanVault,
      registration: registration, registeredPayouts: registeredPayouts, tidyVault: tidyVault, sendCarrier: sendCarrier, carrierState: carrierState, txpowInBlock: txpowInBlock, payoutAddress: ensurePayout, node: node, busy: function () { return Object.keys(busy); }
    };
  }

  return {
    MAGIC: MAGIC, ONE: ONE, DEPTH: DEPTH, MAX_WITHDRAW_COINS: MAX_WITHDRAW_COINS, MAX_MERGE_COINS: MAX_MERGE_COINS,
    DROP_MS: DROP_MS, TXN: TXN, MESSAGES: MESSAGES, ChainError: ChainError,
    toAtoms: toAtoms, dec: dec, stateDec: stateDec, hx: hx, stateMap: stateMap,
    loadPlan: loadPlan, registrationPlan: registrationPlan, withdrawPlan: withdrawPlan, mergePlan: mergePlan,
    CARRIER_MAGIC: CARRIER_MAGIC, carrierPlan: carrierPlan, carrierText: carrierText, utf8Hex: utf8Hex, hexUtf8: hexUtf8,
    planCommands: planCommands, pickVaultCoins: pickVaultCoins, tidyPick: tidyPick, create: create,
    MAX_MERGE_ROUNDS: MAX_MERGE_ROUNDS, SWEEP_ABOVE: SWEEP_ABOVE, TIDY_ABOVE: TIDY_ABOVE
  };
});
