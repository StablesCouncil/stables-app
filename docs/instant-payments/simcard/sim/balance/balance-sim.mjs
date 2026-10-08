// Chip-balance model simulation (Phase 1 redo). ASSUMED model: daily flows, deterministic, transparent.
//
// What it answers (brief, item 6):
//   A. the honest economy: vault size, defunds, swaps, per-vendor weekly defund volume, chain load per user;
//   B. a broken chip / broken family / dishonest vendor / stolen funding key: how much leaves before it stops,
//      through which exits, under which response;
//   C. vendor bond sizing against those losses;
//   D. shared vault (last-out or pro-rata haircut) against one vault per vendor;
//   E. lost and stolen chips.
//
// The central mechanism modelled (section 7 of the design): a broken chip E pays attacker-owned "fence" chips. Fences
// are genuine, honest chips whose owner's phone never gives them revocation updates, so they keep accepting E after E
// is revoked. Counterfeit leaves the system through three exits:
//   goods   the attacker spends at honest merchants (resold at `resale`),
//   swaps   the attacker sells checking money to honest buyers for savings money (a share of the day's swap demand),
//   defund  fences move money to savings on chain, limited by each chip's weekly window, the fences' vendors' weekly
//           allowance and the vault's daily brake.
// Before detection E spends directly as well. After detection honest chips refuse E, but fences keep going unless:
//   - "fresh" rule: a chip must hold a revocation snapshot younger than `delta` days to PAY (snapshots are signed by
//     vendors and passed on in taps); fences cut off from the network stop paying `delta` days after detection;
//   - "freeze": a governed emergency stop of all defunds and swaps at detection (then a pro-rata settlement).
// Odometer: every payment carries the payer's signed lifetime total sent; receivers refuse a payer past `odometer`.
// A careful emulator that reports it honestly can inject at most identities x odometer in total; one that lies is
// caught when two of its receipts meet (receipt gossip), modelled as detection after `gossipDays`.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'results'); mkdirSync(OUT, { recursive: true });

export const BASE = {
  days: 90,
  vendors: 5,
  consumers: 20000, merchants: 1000,
  consumerVendorMix: [0.4, 0.3, 0.2, 0.05, 0.05], // who bought which vendor's chip
  merchantVendorMix: [0.05, 0.05, 0.2, 0.3, 0.4], // skewed on purpose: tests per-vendor vaults
  spendPerConsumerDay: 15,          // USDw of chip payments per consumer per day
  wageShare: 0.30,                  // share of merchant takings paid back to consumers chip-to-chip (wages, change)
  supplierShare: 0.10,              // share re-paid merchant to merchant
  swapShare: 0.5,                   // share of consumer top-ups bought from merchants by swap (rest: FUND via vendor voucher)
  avgConsumerBalance: 250, avgMerchantBalance: 600,
  cap: 1000,
  chipWeeklyDefund: 1000, merchantWeeklyDefund: 5000,
  brakePctPerDay: 10, brakeFloorPerLane: 1000, lanes: 40,
  vendorAllowancePctPerWeek: 100,   // of the vendor's bond
  vendorBond: 200000,               // per vendor
  defundFeeBps: 10,                 // optional insurance fee on defunds, kept in the vault (0.1 %)
};

// ------------------------------------------------------------------------------------------ honest economy
export function honest(p = BASE) {
  const spend = p.consumers * p.spendPerConsumerDay;                    // merchant takings per day
  const surplus = spend * (1 - p.wageShare - p.supplierShare);          // what merchants must turn into savings
  const topUp = spend * (1 - p.wageShare);                              // consumers' net need for new checking money
  const swaps = Math.min(surplus, topUp * p.swapShare);
  const funds = topUp - swaps;                                          // FUND into the vault
  const defunds = surplus - swaps;                                      // merchants' defunds from the vault
  const reserve = p.consumers * p.avgConsumerBalance + p.merchants * p.avgMerchantBalance;
  const perVendorWeeklyDefund = p.merchantVendorMix.map((s) => 7 * defunds * s);
  const perVendorWeeklyFund = p.consumerVendorMix.map((s) => 7 * funds * s);
  // chain load (per month, 30 days)
  const fundTxPerConsumer = 30 * (funds / p.consumers) / 100;           // FUND in lots of 100
  const swapTxPerConsumer = 30 * (swaps / p.consumers) / 100;           // one lock per 100 bought
  const merchantDefunds = 30 * (defunds / p.merchants) / 1000;          // one defund per 1,000 (the cap)
  const merchantSwapClaims = 30 * (swaps / p.merchants) / 100;
  const KB = { fund: 12.6, defund: 43.3, swapLock: 2.0, swapClaim: 3.8 };
  return {
    perDay: { spend, surplus, topUp, swaps, funds, defunds }, reserve,
    reserveTurnoverDays: reserve / Math.max(1, defunds),
    brakeCapacityPerDay: Math.max(reserve * p.brakePctPerDay / 100, p.lanes * p.brakeFloorPerLane),
    perVendorWeeklyDefund, perVendorWeeklyFund,
    bondNeededForHonestDefunds: perVendorWeeklyDefund.map((w) => w * 100 / p.vendorAllowancePctPerWeek),
    chainLoadPerMonth: {
      consumer: { tx: fundTxPerConsumer + swapTxPerConsumer, KB: fundTxPerConsumer * KB.fund + swapTxPerConsumer * KB.swapLock },
      merchant: { tx: 2 * merchantDefunds + merchantSwapClaims, KB: merchantDefunds * KB.defund + merchantSwapClaims * KB.swapClaim },
      allUsersTxPerDay: (funds / 100) + (swaps / 100) * 2 + (defunds / 1000) * 2,
      allUsersMBPerDay: ((funds / 100) * KB.fund + (swaps / 100) * (KB.swapLock + KB.swapClaim) + (defunds / 1000) * KB.defund) / 1024,
    },
  };
}

// --------------------------------------------------------------------------------------------- the attack
// scenario: { kind, fences, fenceVendor (index or 'spread'), goodsPerDay, resale, swapCapture, detectDay,
//             response: 'revoke' | 'fresh' | 'freeze', delta, identities, bondSlashable, breakCost }
export function attack(s, p = BASE) {
  const h = honest(p);
  const days = p.days;
  const fences = s.fences;
  const fenceCap = fences * p.cap;
  let stock = 0;                       // counterfeit held in fences
  let injected = 0, gotGoods = 0, gotSwaps = 0, gotDefunds = 0;
  let stopDay = Infinity;              // day after which no NEW counterfeit can be injected
  const injectCap = s.odometer && !s.lies ? (s.identities || 1) * s.odometer : Infinity; // a liar is not capped: it is caught by gossip
  if (s.odometer && s.lies) { s = { ...s, detectDay: Math.min(s.detectDay, s.gossipDays) }; }
  if (s.response === 'fresh') stopDay = s.detectDay + s.delta;
  if (s.response === 'freeze') stopDay = s.detectDay;
  let frozenFrom = s.response === 'freeze' ? s.detectDay : Infinity;
  const daily = [];
  // fence defund capacity per day: each fence's weekly window, the allowances of the vendors whose chips are fences,
  // and the vault brake (shared with honest defunds)
  const fenceWeekly = fences * p.chipWeeklyDefund;
  const vendorsOfFences = s.fenceVendor === 'spread' ? [...Array(p.vendors).keys()] : [s.fenceVendor];
  const allowanceWeekly = vendorsOfFences.reduce((a, v) => a + Math.max(p.vendorBond * p.vendorAllowancePctPerWeek / 100 - h.perVendorWeeklyDefund[v], p.brakeFloorPerLane), 0);
  const brakeSpare = Math.max(0, h.brakeCapacityPerDay - h.perDay.defunds);
  const defundCapDay = Math.min(fenceWeekly / 7, allowanceWeekly / 7, brakeSpare);
  const swapCapDay = h.perDay.swaps * s.swapCapture;
  // detection by the solvency monitor: reported honest balances exceed the vault reserve once counterfeit that reached
  // honest hands passes the share of balances that does not report (1 - coverage), plus a reporting lag
  let detectDay = s.detectDay;
  const solvencyThreshold = s.detectBy === 'solvency' ? (1 - s.coverage) * h.reserve : Infinity;
  if (s.detectBy === 'solvency') detectDay = Infinity;
  const setStops = () => {
    stopDay = s.response === 'fresh' ? detectDay + s.delta : s.response === 'freeze' ? detectDay : Infinity;
    if (s.response === 'freeze') frozenFrom = detectDay;
  };
  setStops();
  for (let d = 0; d < days; d++) {
    if (s.detectBy === 'solvency' && detectDay === Infinity && gotGoods + gotSwaps + gotDefunds >= solvencyThreshold) { detectDay = d + s.lagDays; setStops(); }
    // one pool: counterfeit already sitting in fences, plus whatever E can still emit today (E pays directly before
    // detection and refills fences until the freshness rule, a freeze or its odometer stops it)
    const canInject = d < stopDay && injected < injectCap;
    const newRoom = canInject ? injectCap - injected : 0;
    let avail = stock + newRoom;
    let goods = 0, swaps = 0, defunds = 0;
    if (d < frozenFrom) {
      goods = Math.min(s.goodsPerDay, avail); avail -= goods;
      swaps = Math.min(swapCapDay, avail); avail -= swaps;
      defunds = Math.min(defundCapDay, avail, stock + Math.max(0, newRoom - goods - swaps)); avail -= defunds;
    }
    const out = goods + swaps + defunds;
    const fromStock = Math.min(stock, out); stock -= fromStock; injected += out - fromStock;
    if (canInject) { const refill = Math.min(fenceCap - stock, injectCap - injected); if (refill > 0) { stock += refill; injected += refill; } }
    gotGoods += goods; gotSwaps += swaps; gotDefunds += defunds;
    daily.push({ d, goods, swaps, defunds, stock });
  }
  // the loss to honest people is every counterfeit unit that got goods, savings money or a defund, plus fence stock
  // still claimable at the end (a pro-rata settlement pays fences too)
  const extracted = gotGoods + gotSwaps + gotDefunds;
  const attackerValue = gotGoods * s.resale + gotSwaps * 0.98 + gotDefunds;
  const shortfall = extracted + stock;                  // unbacked checking money created
  const bond = s.bondSlashable ? p.vendorBond : 0;
  const fees = p.defundFeeBps / 10000 * h.perDay.defunds * days;
  const residual = Math.max(0, shortfall - bond - fees);
  return {
    scenario: s, detectedOnDay: detectDay === Infinity ? null : detectDay, extracted: Math.round(extracted), byExit: { goods: Math.round(gotGoods), swaps: Math.round(gotSwaps), defunds: Math.round(gotDefunds) },
    fenceStockAtEnd: Math.round(stock), shortfall: Math.round(shortfall), attackerValue: Math.round(attackerValue),
    attackerProfit: Math.round(attackerValue - s.breakCost - fences * 25), coveredByBond: Math.round(Math.min(bond, shortfall)),
    coveredByFees: Math.round(Math.min(fees, Math.max(0, shortfall - bond))), residual: Math.round(residual),
    haircutPct: +(100 * residual / h.reserve).toFixed(2), defundCapPerDay: Math.round(defundCapDay), swapCapPerDay: Math.round(swapCapDay),
  };
}

// ------------------------------------------------------------------------ who bears a residual shortfall
// Shared vault, last-out (the vault pays until empty), shared vault pro-rata, one vault per vendor with and
// without settlement between vaults. Honest balances and flows by vendor come from the mixes above.
export function lossRules(att, p = BASE, s = att.scenario) {
  const h = honest(p);
  const consumersBal = p.consumerVendorMix.map((m) => m * p.consumers * p.avgConsumerBalance);
  const merchantsBal = p.merchantVendorMix.map((m) => m * p.merchants * p.avgMerchantBalance);
  const bal = consumersBal.map((c, i) => c + merchantsBal[i]);
  const total = bal.reduce((a, b) => a + b, 0);
  const R = att.residual;
  // pro-rata: everyone loses the same share
  const proRata = bal.map((b) => +(100 * R / (total + att.fenceStockAtEnd)).toFixed(2));
  // last-out: the vault pays defunds in order until it is short; merchants defund every day, consumers rarely,
  // so the people still holding balances at the end (mostly consumers) carry the whole residual
  const lastOutHolders = consumersBal.map((c) => +(100 * R / consumersBal.reduce((a, b) => a + b, 0)).toFixed(2));
  // per-vendor vaults, no settlement: vault v receives FUNDs from its consumers and pays defunds of its merchants
  const netWeekly = p.consumerVendorMix.map((c, i) => 7 * h.perDay.funds * c - 7 * h.perDay.defunds * p.merchantVendorMix[i]);
  const reserveV = p.consumerVendorMix.map((c, i) => c * p.consumers * p.avgConsumerBalance + p.merchantVendorMix[i] * p.merchants * p.avgMerchantBalance);
  const daysToDry = reserveV.map((r, i) => (netWeekly[i] >= 0 ? null : +(r / (-netWeekly[i] / 7)).toFixed(1)));
  // per-vendor vaults with last-hop settlement: losses land on the vault of whichever vendor's chips the fences are
  const fenceVendors = s.fenceVendor === 'spread' ? [...Array(p.vendors).keys()] : [s.fenceVendor];
  const lastHop = bal.map((b, i) => (fenceVendors.includes(i) ? +(100 * R / fenceVendors.length / b).toFixed(2) : 0));
  const brokenVendor = s.brokenVendor ?? 0;
  return {
    residual: R, sharedProRataPctByVendor: proRata, sharedLastOutPctForConsumersByVendor: lastOutHolders,
    perVendorVaultsNoSettlement: { netWeeklyFlow: netWeekly.map(Math.round), daysUntilHonestDefundsFail: daysToDry },
    perVendorVaultsLastHopSettlement: { lossPctByVendor: lastHop, brokenVendor, brokenVendorBearsPct: lastHop[brokenVendor] },
  };
}

// ------------------------------------------------------------------------------------------- lost chips
export function lostChips({ chips = 21000, lossRatePerYear = 0.03, avgBalance = 280, pinless = 150 } = {}) {
  const lost = chips * lossRatePerYear;
  return { lostPerYear: lost, ownerLossPerChip: avgBalance, finderCanSpendPerChip: Math.min(avgBalance, pinless),
    ownerLossPerYear: Math.round(lost * avgBalance), finderGainPerYear: Math.round(lost * Math.min(avgBalance, pinless)),
    systemEffect: 'none: the unspent part of a lost balance stays in the vault as unclaimed backing (see design 6.1)' };
}

// ------------------------------------------------------------------------------------------------ runs
if (process.argv[1] && process.argv[1].endsWith('balance-sim.mjs')) {
  const res = {};
  res.honest = honest();
  const sc = (o) => ({ kind: 'single chip', fences: 50, fenceVendor: 'spread', goodsPerDay: 2000, resale: 0.5, swapCapture: 0.1,
    detectDay: 14, response: 'revoke', delta: 7, bondSlashable: false, breakCost: 50000, brokenVendor: 0, ...o });
  // B1: a stealthy broken chip that pays only its owner's fence chips; found by the solvency monitor (95 % of honest
  // balances report, 1-day lag). Response: revocation only / relative freshness (delta 3 or 7 days) / freeze.
  res.stealthy = [];
  for (const fences of [10, 100]) for (const [response, delta] of [['revoke', 0], ['fresh', 3], ['fresh', 7], ['freeze', 0]]) {
    res.stealthy.push(attack(sc({ kind: 'stealthy single chip', fences, response, delta, detectBy: 'solvency', coverage: 0.95, lagDays: 1 })));
  }
  // B1b: coverage of balance reporting (fences 100, freshness 7)
  res.coverage = [0.8, 0.9, 0.95, 0.99].map((coverage) => attack(sc({ kind: 'stealthy single chip', fences: 100, response: 'fresh', delta: 7, detectBy: 'solvency', coverage, lagDays: 1 })));
  // B2: a sloppy broken chip (pays honest people directly, or clones): cryptographic evidence within 2 days, bond slashable
  res.sloppy = [['fresh', 7], ['freeze', 0]].map(([response, delta]) => attack(sc({ kind: 'sloppy single chip (evidence)', fences: 100, response, delta, detectDay: 2, bondSlashable: true })));
  // B3: broken family / dishonest vendor: many free identities, 1,000 fences, big market share, solvency detection
  res.family = [['revoke', 0], ['fresh', 7], ['freeze', 0]].map(([response, delta]) => attack(sc({ kind: 'broken family / dishonest vendor', fences: 1000, goodsPerDay: 20000, swapCapture: 0.3, response, delta, detectBy: 'solvency', coverage: 0.95, lagDays: 1, bondSlashable: false, breakCost: 0 })));
  // B4: stolen funding (voucher) key: every payment carries k_chip, so online phones see it within a day
  res.voucherKey = [['revoke', 0], ['fresh', 7], ['freeze', 0]].map(([response, delta]) => attack(sc({ kind: 'stolen funding key', fences: 200, goodsPerDay: 5000, swapCapture: 0.2, detectDay: 1, response, delta, bondSlashable: true, breakCost: 0 })));
  // B5: odometer: caps what a broken chip pays honest people directly; fence routing is not capped (each fence is
  // its own identity). Shown for a careful chip that pays honest people only (no fences).
  res.odometer = [50000, 100000, 250000].map((odometer) => ({ odometer, direct: attack(sc({ kind: 'careful chip paying honest people directly', fences: 0, response: 'fresh', delta: 7, detectDay: 90, odometer, identities: 1 })).shortfall }));
  // C: vendor bond needed = shortfall, by detection day and response (single chip, 50 fences)
  res.bondSizing = [];
  for (const [response, delta] of [['fresh', 7], ['freeze', 0]]) for (const detectDay of [1, 3, 7, 14, 30]) {
    const a = attack(sc({ response, delta, detectDay, fences: 50 }));
    res.bondSizing.push({ response, detectDay, shortfall: a.shortfall, attackerProfitAtBreakCost50k: a.attackerProfit });
  }
  // D: who bears a residual (family scenario, freshness 7)
  const fam = res.family[1];
  res.lossRules = { spreadFences: lossRules(fam), fencesAtOneHonestVendor: lossRules(attack({ ...fam.scenario, fenceVendor: 3 })) };
  res.noAllowance = attack(sc({ fences: 100, response: 'fresh', delta: 7 }), { ...BASE, vendorAllowancePctPerWeek: 1e6 });
  res.lostChips = lostChips();
  res.parameters = BASE;
  writeFileSync(join(OUT, 'balance-results.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ honest: res.honest.perDay, reserve: res.honest.reserve, brake: res.honest.brakeCapacityPerDay, bondsForHonest: res.honest.bondNeededForHonestDefunds.map(Math.round), load: res.honest.chainLoadPerMonth }));
  const line = (t, r) => console.log(t, r.scenario.response, r.scenario.delta || '', 'fences', r.scenario.fences, 'detected', r.detectedOnDay, '-> shortfall', r.shortfall, JSON.stringify(r.byExit), 'stock', r.fenceStockAtEnd, 'haircut', r.haircutPct + '%', 'profit', r.attackerProfit);
  for (const r of res.stealthy) line('stealthy', r);
  for (const r of res.coverage) console.log('coverage', r.scenario.coverage, 'detected', r.detectedOnDay, 'shortfall', r.shortfall, 'haircut', r.haircutPct);
  for (const r of res.sloppy) line('sloppy', r);
  for (const r of res.family) line('family', r);
  for (const r of res.voucherKey) line('voucherKey', r);
  console.log('odometer', JSON.stringify(res.odometer));
  console.log('bond sizing', JSON.stringify(res.bondSizing));
  console.log('loss rules', JSON.stringify(res.lossRules));
  console.log('no allowance', res.noAllowance.shortfall);
  console.log(JSON.stringify(res.lostChips));
}
