#!/usr/bin/env node
// Refine plan A-01: ready for the job, a fair tow, T and Y only when stuck.
//
//   node tools/smoke_jobready.mjs
//
//   1. a job started past cosmetic damage: the giver patches it to 0, one line
//   2. below that, the dents stay and nothing is said
//   3. the first tow of each game day is free, the second is not
//   4. broke (23 $ against a 60 $ flatbed): towed, fixed, the fee on the slate
//   5. the slate is paid off half of each later payment, never all of it
//   6. the T / Y offer is hidden unless the stuck watch has a reason
//   7. main.js calls prepareForJob in startMission and toasts towLine
//   8. B-01b: every timed, cargo or race job started in a cart, a bike or a
//      loaner swaps you into your own vehicle at the pillar, or refuses with a
//      narrator line and a GPS point; none starts in the cart
//   9. B-01b: the garage hand-back puts you in your own vehicle
import fs from 'node:fs';

// localStorage stand-in (garage.js and save.js read it at import time).
if (!globalThis.localStorage) {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${extra ? '   ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '   ' + extra : ''}`); }
};

const J = await import('../src/game/jobready.js');
const T = await import('../src/game/tow.js');
const { REPAIR } = await import('../src/game/damage.js');

const wallet = (v) => ({ value: v, can(n) { return this.value >= n; },
  spend(n) { if (this.value < n) return false; this.value -= n; return true; },
  add(n) { this.value = Math.max(0, this.value + n); return this.value; } });
const veh = (damage) => ({ spec: { id: 'ranger' }, x: 0, z: 0, damage,
  reset(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; }, repair() { this.damage = 0; } });
const world = {
  nearestRoad: (x, z) => ({ x: 0, z: z, yaw: 0, dist: Math.abs(x), name: 'chemin d’Aylmer' }),
  roadAt: (x) => Math.abs(x) < 4, buildingAt: () => false, waterAt: () => false,
};

console.log('1-2. prepareForJob');
{
  const v = veh(46), G = { mission: { def: { giver: 'sayyad' }, styleStart: { damage: 46 } },
    health: { ranger: 46 }, repair: { t: 2, key: 'norm' }, repairHints: { h25: true, h60: false } };
  const r = J.prepareForJob(v, G.mission, G);
  ok(r.patched && v.damage === 0 && r.before === 46, 'damage 46 at the giver: patched to 0');
  ok(G.health.ranger === 0 && G.repair.key === null && G.mission.styleStart.damage === 0, 'saved health, garage state and style baseline follow');
  ok(/Sayyad t’a patché ça avec du duct tape/.test(r.line), 'one line, the giver named', r.line);
  ok(!/—/.test(r.line), 'no em dash in the line');
  const home = J.prepareForJob(veh(99), { def: { giver: 'home' } });
  ok(home.patched && /duct tape/.test(home.line), 'from home too', home.line);
  const shop = J.prepareForJob(veh(80), { giver: 'principale' });
  ok(shop.patched && /Quelqu’un/.test(shop.line), 'a place giver: the impersonal line', shop.line);
  const v2 = veh(J.PATCH_ABOVE);
  const r2 = J.prepareForJob(v2, { def: { giver: 'sayyad' } });
  ok(!r2.patched && v2.damage === J.PATCH_ABOVE && r2.line === null, `at ${J.PATCH_ABOVE} or less the dents stay`);
  ok(!J.prepareForJob(null, null).patched, 'no car, no throw');
}

console.log('3. the first tow of each game day is free');
{
  const G = { veh: veh(100), world, wallet: wallet(500), day: 4 };
  const a = T.towHome(G, { x: 0, z: 50, a: 0 }, { fee: REPAIR.TOW });
  ok(a.ok && a.free && a.cost === 0 && G.wallet.value === 500, 'first wreck of day 4: free');
  ok(T.towLine(a, { wreck: true }).includes('gratis'), 'and the toast says so', T.towLine(a, { wreck: true }).replace('\n', ' / '));
  G.veh.damage = 100;
  const b = T.towHome(G, { x: 0, z: 50, a: 0 }, { fee: REPAIR.TOW });
  ok(b.ok && !b.free && b.paid && G.wallet.value === 500 - REPAIR.TOW, `second wreck the same day: ${REPAIR.TOW} $`);
  G.day = 5.3; G.veh.damage = 100;
  const c = T.towHome(G, { x: 0, z: 50, a: 0 }, { fee: REPAIR.TOW });
  ok(c.free && G.wallet.value === 500 - REPAIR.TOW, 'a new day, a new free one');
  G.veh.damage = 40; G.veh.x = 30;
  const y = T.callTow(G);
  ok(y.ok && !y.free && y.cost === T.towCost(40) && G.veh.damage === 0, 'Y after the free one: paid, and fixed');
}

console.log('4. 23 $ and wrecked');
{
  const G = { veh: veh(100), world, wallet: wallet(23), day: 2, towFreeDay: 2, mode: 'drive' };
  const r = T.towHome(G, { x: 0, z: 50, a: 0 }, { fee: REPAIR.TOW });
  ok(r.ok && !r.paid && G.veh.damage === 0, 'towed and fixed anyway');
  ok(G.wallet.value === 23 && G.towDebt === REPAIR.TOW, `keeps the 23 $, owes ${REPAIR.TOW} $`);
  ok(/crédit/.test(T.towLine(r, { wreck: true })), 'the debt is the gag', T.towLine(r, { wreck: true }).replace('\n', ' / '));
  G.veh.damage = 50; G.veh.x = 30;
  const y = T.callTow(G);
  ok(y.ok && G.veh.damage === 0 && G.towDebt === REPAIR.TOW + T.towCost(50), 'Y broke: still comes, on the slate');
}

console.log('5. paying the slate');
{
  const G = { wallet: wallet(0), towDebt: 60 };
  G.wallet.add(40);
  const took = T.collectTowDebt(G, 40);
  ok(took === 20 && G.wallet.value === 20 && G.towDebt === 40, 'a 40 $ job: the tow guy takes 20');
  G.wallet.add(200);
  ok(T.collectTowDebt(G, 200) === 40 && G.towDebt === 0, 'a big one squares it, no more');
  ok(T.collectTowDebt(G, 50) === 0, 'square: nothing taken');
}

console.log('6. T and Y only when stuck');
{
  const s = T.newStuckWatch();
  ok(!T.offerVisible(s), 'a fresh watch: hidden');
  const G = { veh: { x: 0, z: 0, speedKmh: 0, roll: 0, pitch: 0 }, world, input: {}, mode: 'drive' };
  for (let i = 0; i < 600; i++) T.stuckStep(s, G, 1 / 60);
  ok(!T.offerVisible(s, G), 'parked on the road, no pedal, 10 s: hidden');
  G.input = { brake: 1, handbrake: true };
  for (let i = 0; i < 600; i++) T.stuckStep(s, G, 1 / 60);
  ok(!T.offerVisible(s, G), 'stopped with the handbrake on: hidden');
  G.input = { throttle: 1 };
  for (let i = 0; i < 240; i++) T.stuckStep(s, G, 1 / 60);
  ok(T.offerVisible(s, G) && s.why === 'pinned', 'floored into a wall for 4 s: shown (pinned)');
  ok(!T.offerVisible(s, { mode: 'cinema' }), 'never over a card or a menu');
}

console.log('7. main.js wiring');
{
  const MAIN = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = MAIN.slice(MAIN.indexOf('function startMission'), MAIN.indexOf('function startMission') + 2500);
  ok(/prepareForJob\(G\.veh, G\.mission, G\)/.test(start), 'startMission calls prepareForJob');
  ok(/tow\.towLine\(r, \{ wreck: true \}\)/.test(MAIN), 'the wreck toast comes from towLine (no fixed 60 $ lie)');
  const ECON = fs.readFileSync(new URL('../src/game/economy.js', import.meta.url), 'utf8');
  ok(/collectTowDebt\(/.test(ECON), 'economy.js collects the slate');
}

console.log('8. B-01b: job start in a cart, a bike or a loaner');
{
  const { ALL_MISSIONS } = await import('../src/game/missions.js');
  await import('../src/game/bikes.js');   // registers the two bikes into CARS
  const { carById } = await import('../src/game/cars.js');
  const GA = await import('../src/game/garage.js');
  const { PLACES } = await import('../src/game/places.js');
  const { FRASER } = await import('../src/game/fraser.js');
  const R = await import('../src/game/setpieces/royal.js');

  const CLUB = { x: 5360, z: -2528 };   // the Royal Ottawa lot (royal.js CART_SPOT)
  const mk = (id, x, z, yaw = 0) => ({ spec: carById(id) || { id }, x, z, yaw, damage: 0,
    reset(nx, nz, ny) { this.x = nx; this.z = nz; this.yaw = ny; }, repair() { this.damage = 0; } });
  // The same contract as main.js swapCar: the vehicle you leave stays where you
  // left it, the one you take comes off its G.parked spot.
  const game = (from, at, parked, extra = {}) => {
    const G = { veh: mk(from, at.x, at.z, at.yaw || 0), carId: from, parked: { ...parked }, health: {},
      character: 'tom', garage: new GA.Garage(['sayyad']), ...extra };
    G.swapCar = (id) => {
      const spot = G.parked[id]; if (!spot) return;
      G.parked[G.veh.spec.id] = { x: G.veh.x, z: G.veh.z, yaw: G.veh.yaw };
      delete G.parked[id];
      G.carId = id; G.veh = mk(id, spot.x, spot.z, spot.yaw);
    };
    return G;
  };
  const FAR = { ranger: { x: 932.9, z: 143.9 + 20, yaw: 0 } };   // the Ranger 4 km away, at home

  const WANT = ['school', 'sayyad', 'arcbache', 'stvincent', 'russellroyal',
    'margaretdental', 'highwayhull', 'chelsea', 'divan', 'racecivic', 'dep'];
  const jobs = WANT.map((id) => ALL_MISSIONS.find((d) => d.id === id)).filter(Boolean);
  const kinds = jobs.map((d) => [d.id, J.jobKind(d)]);
  ok(jobs.length >= 10 && kinds.every(([, k]) => k), `${jobs.length} timed, cargo or race jobs classified`,
    kinds.map(([i, k]) => `${i}:${k}`).join(' '));

  let swapped = 0, refused = 0, inCart = 0;
  for (const def of jobs) {
    const G = game('cart', CLUB, FAR);
    const r = J.ensureOwnVehicle(def, G);
    if (r.action === 'swap' && G.veh.spec.id === 'ranger') swapped++;
    if (G.veh.spec.id === 'cart' && r.action !== 'refuse') inCart++;
  }
  ok(swapped === jobs.length && inCart === 0, `from the cart: ${swapped} of ${jobs.length} swap to the Ranger, ${inCart} start in the cart`);

  for (const def of jobs) {
    const G = game('cart', CLUB, FAR);
    const r = J.ensureOwnVehicle(def, G, { bring: false });
    if (r.action === 'refuse' && r.line && r.gps && G.veh.spec.id === 'cart') refused++;
  }
  ok(refused === jobs.length, `bring off, Ranger far: ${refused} of ${jobs.length} refuse with a line and a GPS point`);

  {
    const G = game('cart', CLUB, FAR);
    const r = J.ensureOwnVehicle(jobs[0], G);
    ok(Math.hypot(G.veh.x - CLUB.x, G.veh.z - CLUB.z) < 12, 'the Ranger is brought to the pillar', `${Math.round(Math.hypot(G.veh.x - CLUB.x, G.veh.z - CLUB.z))} m`);
    ok(G.parked.cart && Math.hypot(G.parked.cart.x - CLUB.x, G.parked.cart.z - CLUB.z) < 0.01, 'the cart stays where you got out');
    ok(/Ton Ranger t’attend au pilier/.test(r.line) && /Gratis/.test(r.line), 'one narrator line, free', r.line);
    const no = J.ensureOwnVehicle(jobs[0], game('cart', CLUB, FAR), { bring: false });
    ok(/Pas en cart/.test(no.line) && /GPS/.test(no.line) && no.gps.x === FAR.ranger.x, 'the refusal points the GPS at your truck', no.line);
    ok(![r.line, no.line].some((l) => /[–—]/.test(l)), 'no em or en dash in either line');
  }
  {
    // A pillar in a lot: a building where the truck would go ahead, open behind.
    const lot = { nearestRoad: (x, z) => ({ x: x + 250, z, yaw: 0, dist: 250, name: 'chemin d’Aylmer' }),
      roadAt: () => false, waterAt: () => false, buildingAt: (x, z) => z > CLUB.z + 4 && Math.abs(x - CLUB.x) < 6 };
    const G = game('cart', { ...CLUB, yaw: 0 }, FAR, { world: lot });
    J.ensureOwnVehicle(jobs[0], G);
    const d = Math.hypot(G.veh.x - CLUB.x, G.veh.z - CLUB.z);
    ok(G.veh.spec.id === 'ranger' && d < 12 && G.veh.z < CLUB.z, 'in a lot, ahead blocked: put down behind you, not on the far road', `${d.toFixed(1)} m`);
  }
  {
    const near = { ranger: { x: CLUB.x + 20, z: CLUB.z, yaw: 1 } };
    const G = game('cart', CLUB, near);
    const r = J.ensureOwnVehicle(jobs[0], G);
    ok(r.action === 'swap' && G.veh.x === near.ranger.x && G.veh.yaw === 1, 'Ranger parked 20 m away: swapped where it stands');
  }
  {
    const G = game('dbike', CLUB, FAR);
    const r = J.ensureOwnVehicle(jobs[0], G);
    ok(r.role === 'bike' && r.action === 'swap' && G.veh.spec.id === 'ranger', 'from Tom on the bike: the Ranger');
    const L = game('cavalier', CLUB, FAR);
    const l = J.ensureOwnVehicle(jobs[0], L);
    ok(l.role === 'loaner' && l.action === 'swap' && L.veh.spec.id === 'ranger', 'from a loaner (Tyler’s Z24): the Ranger');
    const F = game('civic', CLUB, FAR);
    const f = J.ensureOwnVehicle(jobs[0], F);
    ok(f.role === 'lent' && f.action === 'ok' && F.veh.spec.id === 'civic', 'Sayyad’s Civic, lent: kept');
    const O = game('ranger', CLUB, {});
    ok(J.ensureOwnVehicle(jobs[0], O).action === 'ok' && O.veh.spec.id === 'ranger', 'already in the Ranger: nothing');
    const Z = game('dbike', CLUB, {}, { character: 'zahra' });
    ok(J.ensureOwnVehicle(jobs[0], Z).action === 'ok' && Z.veh.spec.id === 'dbike', 'Zahra on her own bike: kept');
  }
  {
    const golf = ALL_MISSIONS.find((d) => d.id === 'golfcart');
    const G = game('cart', CLUB, FAR);
    ok(golf && J.jobKind(golf) === null && J.ensureOwnVehicle(golf, G).action === 'ok' && G.veh.spec.id === 'cart', 'golfcart brings its own vehicle: left alone');
  }
  {
    // At 299 Fraser the Ranger is brought to its nose-in spot (hard rule 4).
    const home = PLACES.home;
    const G = game('cart', { x: home.x + 15, z: home.z, yaw: 0 }, { ranger: { x: CLUB.x, z: CLUB.z, yaw: 0 } });
    J.ensureOwnVehicle(jobs[0], G);
    const dy = Math.abs(((G.veh.yaw - (FRASER.yaw + Math.PI)) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
    ok(G.veh.spec.id === 'ranger' && dy < 1e-6, 'at home the Ranger comes back nose-in, toward the house');
  }
  {
    ok(R.strandedIn(game('cart', CLUB, {})) && R.strandedIn(game('dbike', CLUB, {})), 'royal.js: Russell’s gate uses the same test (cart, bike)');
    ok(!R.strandedIn(game('ranger', CLUB, {})) && !R.strandedIn(game('civic', CLUB, {})), 'royal.js: the Ranger and the lent Civic pass');
  }

  console.log('9. B-01b: the garage hand-back');
  {
    const G = game('cart', CLUB, { ranger: { x: 100, z: 200, yaw: 0.5 } });
    const r = GA.handBack(G);
    ok(r.ok && r.swapped && G.veh.spec.id === 'ranger' && G.veh.x === 100, 'hand-back from the cart: in the Ranger, where it was parked');
    ok(G.parked.cart && G.parked.cart.x === CLUB.x, 'the cart is handed back where you stood');
    const S = game('cavalier', CLUB, {});
    const s = GA.handBack(S, { spot: { x: CLUB.x + 8, z: CLUB.z, yaw: 0 } });
    ok(s.ok && S.veh.spec.id === 'ranger' && S.veh.x === CLUB.x + 8, 'hand-back with a spot: the Ranger brought to it');
    const N = game('cart', CLUB, {});
    ok(!GA.handBack(N).ok && N.veh.spec.id === 'cart', 'no idea where the Ranger is and no spot: says so, nothing moves');
    const M = game('civic', CLUB, { civic: null }, { character: 'sayyad' });
    ok(GA.handBack(M).ok && !GA.handBack(M).swapped, 'Sayyad in his own Civic: nothing to hand back');
    ok(GA.ownCarId('tom') === 'ranger' && GA.ownCarId('zahra') === 'dbike' && GA.ownCarId('mike') === 'forester', 'ownCarId follows save.js CHARACTERS');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
