// Stables payment account: agent-based economic simulation (Phase 1, step C).
//
// Many devices pay each other offline with notes under the design's rules, with ForgedCards (devices that
// sign the same note many times) mixed in. Reports honest losses against bond coverage, cheater profit, the
// fraud-profitability condition, and sweeps the slash split (share of a slashed bond paid to victims).
//
//   node sim/payment-sim.mjs            full sweep, writes sim/results/*.json and prints tables
//   node sim/payment-sim.mjs quick      one baseline run
//
// Every behaviour here is ASSUMED (the parameters are in DEFAULTS and echoed into each result). The
// mechanics follow the Phase 1 design: hop caps (phone 2, chip 3), receiver limits, the 72-hour freshness
// window, the rule that an offline receiver only accepts a note whose anchor its phone has already seen,
// first cashing wins at the anchor, record-backed claims inside a claim window, pro-rata payout of the
// victims' share with the rest burned, optional vendor top-up, and the self-claim (sock-puppet) attack.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'results');

export const DEFAULTS = {
  seed: 7, users: 3000, days: 14,
  merchantShare: 0.05, chipShare: 0.3, rarelyOnlineShare: 0.15,
  pOnlineHour: { merchant: 0.9, regular: 0.35, rarely: 0.03 },
  paymentsPerDay: 3, merchantPaymentShare: 0.8,
  denominations: [5, 10, 20, 50], loadAmount: 120, loadBelow: 20,
  hopCap: { phone: 2, chip: 3 },
  freshnessHours: 72, anchorVisibilityRule: true,
  // receiver limits for offline acceptance (USDw); rarely-online receivers use rarelyFactor of these
  limits: { phone: { perPayment: 50, perSenderWindow: 50, perDay: 200 }, chip: { perPayment: 200, perSenderWindow: 200, perDay: 500 } },
  rarelyFactor: 0.5,
  bond: { phone: 250, chip: 250 }, vendorBondCap: 1000, minBondAccepted: { phone: 100, chip: 100 },
  // merchants give part of their intake back out as change and cash the rest now and then
  merchantCashPerOnlineHour: 0.03, merchantRespendPerHour: 0.15,
  // chain transactions per note: a T1 cashing with hops (about one note per T1) plus a share of a batched
  // T2; a refresh of the loader's own unspent note (small h = 0 T1s, several per transaction, plus T2 share)
  txPerCashedNote: 1.1, txPerRefreshedOwnNote: 0.35,
  claimWindowHours: 7 * 24,
  victimShare: 0.5, claimFee: 0.0, vendorTopUpToVictims: true,
  cheaterShare: 0.005, cheaterTier: 'mixed', cheaterPaymentsPerHour: 2.0, cheaterActiveHours: 36, cheaterWaitHours: 24,
  cheaterStrategy: 'aggressive', // 'naive' (never cashes, no puppets) | 'aggressive' (self-cashes, best-response puppet claims)
  puppetFlood: 20, cheaterTargetsOffline: true, chipBreakCost: 3000,
};

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const round = (x) => Math.round(x * 100) / 100;

export function simulate(overrides = {}) {
  const P = { ...DEFAULTS, ...overrides, limits: { ...DEFAULTS.limits, ...(overrides.limits || {}) } };
  const r = rng(P.seed);
  const H = P.days * 24;
  const devices = [];
  for (let i = 0; i < P.users; i++) {
    const merchant = r() < P.merchantShare;
    const rarely = !merchant && r() < P.rarelyOnlineShare;
    const tier = r() < P.chipShare ? 'chip' : 'phone';
    devices.push({ id: i, merchant, rarely, tier, cheater: false, bond: P.bond[tier], frozen: false,
      pOnline: merchant ? P.pOnlineHour.merchant : rarely ? P.pOnlineHour.rarely : P.pOnlineHour.regular,
      lastSync: 0, holdings: [], revoked: new Set(), windowSums: new Map(), daySums: new Map(), dead: [],
      stats: { loss: 0, compensated: 0, txns: 0, refused: 0, accepted: 0 } });
  }
  const nCheat = Math.max(1, Math.round(P.users * P.cheaterShare));
  const cheaters = [];
  for (let k = 0; k < nCheat; k++) {
    const d = devices[devices.length - 1 - k];
    d.cheater = true; d.merchant = false; d.rarely = false; d.pOnline = 0.5;
    if (P.cheaterTier !== 'mixed') d.tier = P.cheaterTier;
    d.bond = P.bond[d.tier];
    d.cheat = { goods: 0, noteMoney: 0, puppetRecovered: 0, bondLost: 0, active: false, notes: [] };
    cheaters.push(d);
  }
  const notes = [];
  let copySeq = 0;
  const pools = new Map();
  const chain = { txns: 0, byKind: {} };
  const tx = (d, kind, n = 1) => { chain.txns += n; chain.byKind[kind] = round((chain.byKind[kind] || 0) + n); if (d) d.stats.txns += n; };

  function load(d, hour) {
    let left = P.loadAmount;
    const dens = [...P.denominations].sort((a, b) => b - a);
    while (left >= dens[dens.length - 1]) {
      const v = dens.find((x) => x <= left) || dens[dens.length - 1];
      const note = { id: notes.length, value: v, loader: d.id, anchorHour: hour, cashed: false };
      notes.push(note); d.holdings.push({ note: note.id, chain: [d.id], hops: 0, copy: copySeq++ }); left -= v;
    }
    tx(d, 'load');
  }
  const balance = (d) => d.holdings.reduce((a, h) => a + notes[h.note].value, 0);
  // a note's hop cap is the tightest cap among everyone who has held it (phone-only money stays phone-only)
  const capOf = (h) => h.chain.reduce((m, id) => Math.min(m, P.hopCap[devices[id].tier]), Infinity);
  const divergenceCheater = (h) => { for (const id of h.chain) if (devices[id].cheater) return id; return null; };

  function freeze(c, hour) {
    if (c.frozen) return;
    c.frozen = true;
    pools.set(c.id, { frozenAt: hour, claims: [], settled: false, bond: c.bond });
    tx(null, 'freeze');
  }
  function sync(d, hour) {
    d.lastSync = hour;
    d.windowSums.clear();
    for (const c of cheaters) if (c.frozen) d.revoked.add(c.id);
    const keep = [];
    for (const h of d.holdings) {
      const note = notes[h.note];
      if (note.cashed && note.winnerCopy !== h.copy) { d.dead.push(h); d.stats.loss += note.value; } else keep.push(h);
    }
    d.holdings = keep;
    for (const h of d.dead) {
      const cid = divergenceCheater(h);
      if (cid === null) continue;
      const c = devices[cid];
      if (!c.frozen) freeze(c, hour);
      const pool = pools.get(c.id);
      if (!pool.settled && hour <= pool.frozenAt + P.claimWindowHours) { pool.claims.push({ device: d.id, amount: notes[h.note].value }); tx(d, 'claim', 2); }
    }
    d.dead = [];
  }
  function settle(hour) {
    for (const [cid, pool] of pools) {
      if (pool.settled || hour < pool.frozenAt + P.claimWindowHours) continue;
      pool.settled = true;
      const c = devices[cid];
      const real = pool.claims.reduce((a, x) => a + x.amount, 0);
      let pot = P.victimShare * pool.bond;
      const vendorAvail = c.tier === 'chip' && P.vendorTopUpToVictims ? P.vendorBondCap : 0;
      // Self-claim best response. Puppet claims are real double spends of the cheater's own notes to devices it
      // controls, indistinguishable on chain. With a burned claim fee phi per unit claimed it maximises
      //   pot * F / (R + F) - phi * F   ->   R + F = sqrt(pot * R / phi), F = 0 when that is <= R.
      let puppets = 0;
      if (P.cheaterStrategy === 'aggressive') {
        const potMax = pot + vendorAvail;
        puppets = P.claimFee <= 0 ? P.puppetFlood * Math.max(real, P.denominations[P.denominations.length - 1])
          : Math.max(0, Math.sqrt(potMax * Math.max(real, 1) / P.claimFee) - real);
        puppets = Math.round(puppets);
      }
      if (puppets > 0) tx(c, 'claim', 2 * Math.ceil(puppets / 20));
      const total = real + puppets;
      let vendorTop = 0;
      if (vendorAvail) { vendorTop = Math.min(vendorAvail, Math.max(0, total - pot)); pot += vendorTop; }
      const ratio = total > 0 ? Math.min(1, pot / total) : 0;
      // the claim fee is deducted from each payout (never below zero) and burned: payout = claim * max(0, ratio - fee)
      const net = Math.max(0, ratio - P.claimFee);
      for (const cl of pool.claims) devices[cl.device].stats.compensated += cl.amount * net;
      c.cheat.puppetRecovered += puppets * net;
      c.cheat.bondLost += pool.bond;
      pool.result = { real, puppets, pot: round(pot), vendorTop: round(vendorTop), ratio: round(ratio), burned: round(pool.bond + vendorTop - total * net) };
      tx(null, 'settle');
    }
  }
  function limitsFor(d, senderTier) {
    const L = P.limits[senderTier], f = d.rarely ? P.rarelyFactor : 1;
    return { perPayment: L.perPayment * f, perSenderWindow: L.perSenderWindow * f, perDay: L.perDay * f };
  }
  // Receiver-side checks for one incoming note from sender s (the phone does these offline).
  function accept(recv, s, h, hour, isOnline) {
    const note = notes[h.note];
    if (recv.revoked.has(s.id) || (isOnline && s.frozen)) return 'revoked';
    if (s.bond < P.minBondAccepted[s.tier]) return 'bond';
    if (h.hops + 1 > capOf(h)) return 'hops';
    if (hour - note.anchorHour > P.freshnessHours) return 'stale';
    if (P.anchorVisibilityRule && !isOnline && note.anchorHour > recv.lastSync) return 'unseen-origin';
    if (isOnline && note.cashed) return 'already-cashed';
    const L = limitsFor(recv, s.tier);
    if (note.value > L.perPayment) return isOnline ? 'cash-first' : 'needs-online';
    const day = Math.floor(hour / 24);
    const ws = (recv.windowSums.get(s.id) || 0) + note.value, ds = (recv.daySums.get(day) || 0) + note.value;
    if (!isOnline && ws > L.perSenderWindow) return 'sender-limit';
    if (!isOnline && ds > L.perDay) return 'day-limit';
    recv.windowSums.set(s.id, ws); if (!isOnline) recv.daySums.set(day, ds);
    return 'accept';
  }
  function refresh(d, h, hour) {
    const note = notes[h.note];
    if (note.cashed) return;
    note.cashed = true; note.winnerCopy = h.copy; tx(d, 'refresh', P.txPerRefreshedOwnNote);
    const nn = { id: notes.length, value: note.value, loader: d.id, anchorHour: hour, cashed: false };
    notes.push(nn); h.note = nn.id; h.hops = 0; h.chain = [d.id]; h.copy = copySeq++;
  }
  function cash(d, h, hour) {
    const note = notes[h.note];
    tx(d, 'cash', P.txPerCashedNote);
    if (note.cashed) { if (note.winnerCopy !== h.copy) { d.stats.loss += note.value; d.dead.push(h); } return false; }
    note.cashed = true; note.winnerCopy = h.copy;
    return true;
  }

  const totals = { honestPayments: 0, honestAccepted: 0, refusals: {}, fraudAccepted: 0, fraudAttempts: 0 };
  const consumers = devices.filter((d) => !d.merchant && !d.cheater);
  const merchants = devices.filter((d) => d.merchant);
  for (const d of devices) if (!d.cheater) load(d, 0);

  for (let hour = 1; hour <= H; hour++) {
    const onl = new Map();
    for (const d of devices) { const o = r() < d.pOnline; onl.set(d.id, o); if (o && !d.cheater) sync(d, hour); }
    for (const d of devices) {
      if (d.cheater) continue;
      const o = onl.get(d.id);
      if (o && balance(d) < P.loadBelow && !d.merchant) load(d, hour);
      if (o) {
        const keep = [];
        for (const h of d.holdings) {
          const capped = h.hops >= capOf(h);
          const expiring = hour - notes[h.note].anchorHour > P.freshnessHours - 6;
          const takings = d.merchant && h.chain.length > 1 && r() < P.merchantCashPerOnlineHour;
          if (expiring && h.chain.length === 1) { refresh(d, h, hour); keep.push(h); }
          else if ((capped && h.chain.length > 1) || expiring || takings) cash(d, h, hour); else keep.push(h);
        }
        d.holdings = keep;
      }
      if (d.merchant) {
        const movable = d.holdings.filter((h) => h.hops < capOf(h));
        if (movable.length && r() < P.merchantRespendPerHour) {
          const recv = pick(r, consumers), h = pick(r, movable), idx = d.holdings.indexOf(h);
          if (accept(recv, d, h, hour, onl.get(recv.id)) === 'accept') { d.holdings.splice(idx, 1); recv.holdings.push({ note: h.note, chain: [...h.chain, recv.id], hops: h.hops + 1, copy: h.copy }); }
        }
        continue;
      }
      const spendable = d.holdings.filter((h) => h.hops < capOf(h));
      if (r() < P.paymentsPerDay / 24 && spendable.length) {
        const recv = r() < P.merchantPaymentShare ? pick(r, merchants) : pick(r, consumers);
        if (recv.id === d.id) continue;
        const h = pick(r, spendable), idx = d.holdings.indexOf(h);
        totals.honestPayments++;
        const ro = onl.get(recv.id);
        for (const x of d.revoked) recv.revoked.add(x); for (const x of recv.revoked) d.revoked.add(x); // gossip at the tap
        const verdict = accept(recv, d, h, hour, ro);
        if (verdict === 'accept' || verdict === 'cash-first') {
          d.holdings.splice(idx, 1);
          const nh = { note: h.note, chain: [...h.chain, recv.id], hops: h.hops + 1, copy: h.copy };
          if (verdict === 'cash-first') { if (!cash(recv, nh, hour)) continue; } else recv.holdings.push(nh);
          totals.honestAccepted++; recv.stats.accepted++;
        } else { totals.refusals[verdict] = (totals.refusals[verdict] || 0) + 1; d.stats.refused++; }
      }
    }
    // cheaters: load, wait until receivers have seen the anchors, clone-spend, then (aggressive) self-cash
    const offlineHonest = devices.filter((x) => !x.cheater && !onl.get(x.id));
    for (const c of cheaters) {
      const o = onl.get(c.id);
      if (!c.cheat.active && o) { load(c, hour); c.cheat.active = hour + P.cheaterWaitHours; c.cheat.notes = [...c.holdings]; c.cheat.noteMoney = balance(c); }
      if (!c.cheat.active || c.frozen || hour < c.cheat.active) continue;
      if (hour - c.cheat.active <= P.cheaterActiveHours) {
        for (let t = 0; t < P.cheaterPaymentsPerHour; t++) {
          const cand = P.cheaterTargetsOffline ? offlineHonest : consumers;
          const recv = pick(r, cand.length ? cand : consumers);
          const base = pick(r, c.cheat.notes);
          const h = { note: base.note, chain: [c.id], hops: 0, copy: copySeq++ };
          totals.fraudAttempts++;
          for (const x of recv.revoked) c.revoked.add(x);
          const v = accept(recv, c, h, hour, onl.get(recv.id));
          const nh = { ...h, chain: [c.id, recv.id], hops: 1 };
          if (v === 'accept') { recv.holdings.push(nh); c.cheat.goods += notes[h.note].value; totals.fraudAccepted += notes[h.note].value; }
          else if (v === 'cash-first' && cash(recv, nh, hour)) { c.cheat.goods += notes[h.note].value; totals.fraudAccepted += notes[h.note].value; }
        }
      } else if (P.cheaterStrategy === 'aggressive' && o) {
        for (const base of c.cheat.notes) { const note = notes[base.note]; if (!note.cashed) { note.cashed = true; note.winnerCopy = -1; c.cheat.selfCashed = (c.cheat.selfCashed || 0) + note.value; tx(c, 'cash', P.txPerCashedNote); } }
      }
    }
    settle(hour);
  }
  settle(H + P.claimWindowHours + 1);

  const honest = devices.filter((d) => !d.cheater);
  const sum = (g, k) => round(g.reduce((a, d) => a + d.stats[k], 0));
  const honestLoss = sum(honest, 'loss'), compensated = sum(honest, 'compensated');
  const group = (f) => { const g = honest.filter(f); return { users: g.length, loss: sum(g, 'loss'), compensated: sum(g, 'compensated'), txnsPerUserPerDay: round(sum(g, 'txns') / g.length / P.days) }; };
  const perCheater = cheaters.map((c) => {
    const noteBack = c.cheat.selfCashed || 0; // note money returns only for notes the cheater cashed itself
    const breakCost = c.tier === 'chip' ? P.chipBreakCost : 0;
    const profit = c.cheat.goods + noteBack - c.cheat.noteMoney - c.cheat.bondLost + c.cheat.puppetRecovered - breakCost;
    return { tier: c.tier, goods: c.cheat.goods, bond: c.bond, bondLost: c.cheat.bondLost, puppetRecovered: round(c.cheat.puppetRecovered), breakCost, profit: round(profit), profitExBreakCost: round(profit + breakCost), frozen: c.frozen };
  });
  const burned = [...pools.values()].reduce((a, p) => a + (p.result ? p.result.burned : 0), 0);
  return {
    params: P,
    honest: { payments: totals.honestPayments, accepted: totals.honestAccepted, acceptRate: round(totals.honestAccepted / Math.max(1, totals.honestPayments)), refusals: totals.refusals },
    fraud: { attempts: totals.fraudAttempts, acceptedValue: totals.fraudAccepted, honestLoss, compensated, coverage: round(compensated / Math.max(1e-9, honestLoss)), burned: round(burned) },
    byGroup: { merchants: group((d) => d.merchant), regular: group((d) => !d.merchant && !d.rarely), rarelyOnline: group((d) => d.rarely) },
    cheaters: perCheater,
    cheaterProfitMean: round(perCheater.reduce((a, c) => a + c.profit, 0) / perCheater.length),
    cheaterProfitExBreakMean: round(perCheater.reduce((a, c) => a + c.profitExBreakCost, 0) / perCheater.length),
    chain: { txnsPerUserPerDay: round(chain.txns / P.users / P.days), byKind: chain.byKind },
    pools: [...pools.values()].map((p) => p.result),
  };
}

// ------------------------------------------------------------------------ fraud-profitability condition
// Per cheating identity (one device root):
//   gain  G = N * L        N = receivers who accept a clone before the identity is revoked, L = what each accepts
//   cost  C = B_d - R + K  B_d = device bond (always frozen, never returned), R = what the cheater claws back
//                          as fake victims, K = cost of extracting a chip's keys (0 for a phone key)
//   Fraud is unprofitable iff N * L < B_d - R + K.  Worst case R = s * B_d (s = victims' share), so the
//   bond must satisfy B_d > (N * L - K) / (1 - s). A burned claim fee phi shrinks R (see settle()).
export function breakEvenBond({ N, L, s, K = 0, worstCase = true }) {
  const need = Math.max(0, N * L - K);
  return worstCase ? need / Math.max(1e-9, 1 - s) : need;
}

if (process.argv[1] && process.argv[1].endsWith('payment-sim.mjs')) {
  mkdirSync(OUT, { recursive: true });
  const quick = process.argv[2] === 'quick';
  const base = simulate();
  writeFileSync(join(OUT, 'baseline.json'), JSON.stringify(base, null, 2));
  console.log('BASELINE', JSON.stringify({ honest: base.honest, fraud: base.fraud, cheaterProfitMean: base.cheaterProfitMean, cheaterProfitExBreakMean: base.cheaterProfitExBreakMean, chain: base.chain, byGroup: base.byGroup }, null, 1));
  if (!quick) {
    const avg = (fn, seeds = [1, 2]) => seeds.map(fn);
    const rows = [];
    for (const strategy of ['naive', 'aggressive']) for (const fee of [0, 0.1]) for (const s of [0, 0.25, 0.5, 0.75]) for (const b of [100, 250, 500, 1000]) {
      const rs = avg((seed) => simulate({ seed, victimShare: s, claimFee: fee, cheaterStrategy: strategy, bond: { phone: b, chip: b }, users: 2000, cheaterShare: 0.005, vendorTopUpToVictims: false }));
      const m = (f) => round(rs.reduce((a, x) => a + f(x), 0) / rs.length);
      const ch = rs.flatMap((x) => x.cheaters);
      rows.push({ strategy, claimFee: fee, victimShare: s, bond: b,
        meanProfitPhoneCheater: round(avg2(ch.filter((c) => c.tier === 'phone').map((c) => c.profit))),
        meanProfitChipCheaterExBreak: round(avg2(ch.filter((c) => c.tier === 'chip').map((c) => c.profitExBreakCost))),
        honestLoss: m((x) => x.fraud.honestLoss), compensated: m((x) => x.fraud.compensated), coverage: round(m((x) => x.fraud.compensated) / Math.max(1e-9, m((x) => x.fraud.honestLoss))), burned: m((x) => x.fraud.burned) });
    }
    writeFileSync(join(OUT, 'sweep-split-bond.json'), JSON.stringify(rows, null, 2));
    console.log('\nstrategy   fee  s    bond  phoneCheaterProfit  chipCheaterProfit(exK)  honestLoss  compensated  coverage  burned');
    for (const x of rows) console.log(`${x.strategy.padEnd(10)} ${String(x.claimFee).padEnd(4)} ${String(x.victimShare).padEnd(4)} ${String(x.bond).padStart(5)} ${String(x.meanProfitPhoneCheater).padStart(19)} ${String(x.meanProfitChipCheaterExBreak).padStart(22)} ${String(x.honestLoss).padStart(11)} ${String(x.compensated).padStart(12)} ${String(x.coverage).padStart(9)} ${String(x.burned).padStart(7)}`);

    const vendor = [];
    for (const toVictims of [true, false]) for (const fee of [0, 0.1]) {
      const res = simulate({ seed: 9, cheaterTier: 'chip', users: 2000, cheaterShare: 0.01, vendorTopUpToVictims: toVictims, claimFee: fee });
      vendor.push({ vendorTopUpToVictims: toVictims, claimFee: fee, chipCheaterProfitExBreak: res.cheaterProfitExBreakMean, puppetRecoveredMean: round(res.cheaters.reduce((a, c) => a + c.puppetRecovered, 0) / res.cheaters.length), coverage: res.fraud.coverage, honestLoss: res.fraud.honestLoss });
    }
    writeFileSync(join(OUT, 'vendor-topup.json'), JSON.stringify(vendor, null, 2));
    console.log('\nvendor top-up', JSON.stringify(vendor));

    const intensity = [];
    for (const perHour of [1, 2, 4, 8]) for (const targetsOffline of [true, false]) {
      const res = simulate({ seed: 13, cheaterPaymentsPerHour: perHour, cheaterTargetsOffline: targetsOffline, users: 2000, cheaterShare: 0.005 });
      const g = res.cheaters.reduce((a, c) => a + c.goods, 0) / res.cheaters.length;
      intensity.push({ attemptsPerHour: perHour, targetsOffline, goodsPerCheater: round(g), profitPhoneMean: round(avg2(res.cheaters.filter((c) => c.tier === 'phone').map((c) => c.profit))) });
    }
    writeFileSync(join(OUT, 'intensity.json'), JSON.stringify(intensity, null, 2));
    console.log('\nintensity', JSON.stringify(intensity));

    const lim = [];
    for (const phoneLimit of [20, 50]) for (const rarely of [0.15, 0.3]) {
      const res = simulate({ seed: 17, users: 2000, rarelyOnlineShare: rarely, limits: { phone: { perPayment: phoneLimit, perSenderWindow: phoneLimit, perDay: phoneLimit * 4 } }, cheaterShare: 0.005 });
      lim.push({ phonePerPayment: phoneLimit, rarelyOnlineShare: rarely, acceptRate: res.honest.acceptRate, refusals: res.honest.refusals, byGroup: res.byGroup, goodsPerCheater: round(res.cheaters.reduce((a, c) => a + c.goods, 0) / res.cheaters.length), txnsPerUserPerDay: res.chain.txnsPerUserPerDay });
    }
    writeFileSync(join(OUT, 'limits.json'), JSON.stringify(lim, null, 2));
    console.log('\nlimits', JSON.stringify(lim.map((x) => ({ L: x.phonePerPayment, rarely: x.rarelyOnlineShare, acceptRate: x.acceptRate, goods: x.goodsPerCheater, tx: x.txnsPerUserPerDay, merchantsTx: x.byGroup.merchants.txnsPerUserPerDay, regularTx: x.byGroup.regular.txnsPerUserPerDay }))));

    // the recommended configuration (section 10): phone 20 / bond 500, chip 200 / bond 1,000, 25 % to victims,
    // 10 % claim fee, vendor money burned; cheater intensity 2, 4 and 8 attempts an hour; chip break cost 0 or 3,000
    const rec = [];
    for (const chipLimit of [100, 200]) for (const perHour of [2, 4, 8]) for (const K of [0, 3000]) {
      const rs = [1, 2].map((seed) => simulate({ seed, users: 2000, cheaterShare: 0.01, cheaterPaymentsPerHour: perHour, chipBreakCost: K,
        limits: { phone: { perPayment: 20, perSenderWindow: 50, perDay: 200 }, chip: { perPayment: chipLimit, perSenderWindow: chipLimit, perDay: 500 } },
        bond: { phone: 500, chip: 1000 }, victimShare: 0.25, claimFee: 0.1, vendorTopUpToVictims: false, denominations: [5, 10, 20, 50] }));
      const ch = rs.flatMap((x) => x.cheaters);
      rec.push({ chipLimit, attemptsPerHour: perHour, chipBreakCost: K,
        phoneCheaterProfit: round(avg2(ch.filter((c) => c.tier === 'phone').map((c) => c.profit))),
        chipCheaterProfit: round(avg2(ch.filter((c) => c.tier === 'chip').map((c) => c.profit))),
        coverage: round(avg2(rs.map((x) => x.fraud.coverage))), honestAccept: round(avg2(rs.map((x) => x.honest.acceptRate))),
        txPerUserDay: round(avg2(rs.map((x) => x.chain.txnsPerUserPerDay))), merchantsTx: round(avg2(rs.map((x) => x.byGroup.merchants.txnsPerUserPerDay))), regularTx: round(avg2(rs.map((x) => x.byGroup.regular.txnsPerUserPerDay))) });
    }
    writeFileSync(join(OUT, 'recommended.json'), JSON.stringify(rec, null, 2));
    console.log('\nrecommended', JSON.stringify(rec));

    const table = [];
    for (const N of [5, 10, 20, 40]) for (const L of [20, 50, 200]) for (const s of [0.25, 0.5]) table.push({ N, L, s, bondWorstCase: round(breakEvenBond({ N, L, s })), bondNaive: round(breakEvenBond({ N, L, s, worstCase: false })), chipBondWorstCase_K3000: round(breakEvenBond({ N, L, s, K: 3000 })) });
    writeFileSync(join(OUT, 'break-even.json'), JSON.stringify(table, null, 2));
  }
}
function avg2(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
