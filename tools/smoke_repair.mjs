#!/usr/bin/env node
// Headless checks on the repair economy (feel agent). The owner's complaint was
// "there should also be a repair mechanism" — there was one, at the
// Petro-Canada, and nobody could find it. There are three now:
//
//   your driveway   free, ten seconds, and your father never finds out
//   Petro-Canada    four seconds, 20 % of the damage in dollars, min $5
//   Canadian Tire   the same deal, at the other end of chemin d'Aylmer
//
//   node tools/smoke_repair.mjs
//
// game/damage.js's repair half is deliberately pure arithmetic over a places
// table and a wallet-shaped object, so none of this needs a browser: mapdata.js
// (3.2 MB) and places.js stay unread and a fake PLACES stands in for them.
import { carById, Vehicle, DAMAGE } from '../src/game/cars.js';
import {
  REPAIR, REPAIR_SPOTS, repairCost, repairSpotAt, nearestRepair,
  updateRepairs, repairHint, updateRepair,
} from '../src/game/damage.js';

let pass = 0, fail = 0;
const out = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; out.push(`  ok   ${name}${detail ? '   ' + detail : ''}`); }
  else { fail++; out.push(`  FAIL ${name}${detail ? '   ' + detail : ''}`); }
}
const r2 = (v) => Math.round(v * 100) / 100;

// The three spots, far enough apart that nothing overlaps.
const PLACES = {
  home:  { x: 0, z: 0, label: '299 Chemin Fraser' },
  gas:   { x: 2000, z: 0, label: 'La station' },
  ctire: { x: -2000, z: 0, label: 'Canadian Tire' },
};

// A wallet with the same surface money.js's has.
const wallet = (v) => ({
  value: v,
  can(c) { return this.value >= c; },
  spend(c) { if (!this.can(c)) return false; this.value -= c; return true; },
});

// A car parked at (x, z) with `dmg` points on it.
function parked(x, z, dmg, id = 'ranger') {
  const v = new Vehicle(carById(id));
  v.reset(x, z, 0);
  v.damage = dmg;
  v.vLong = 0;
  return v;
}

// Hold E once, then sit there. Returns how long it took and what it cost.
function sit(veh, w, seconds = 20) {
  const st = { t: 0, key: null };
  let t = 0, done = null, working = 0, prompts = [];
  for (let i = 0; i < seconds * 60 && !done; i++) {
    const r = updateRepairs(st, 1 / 60, veh, { places: PLACES, wallet: w, press: i === 0 });
    t += 1 / 60;
    if (r.working) working++;
    if (r.prompt) prompts.push(r.prompt);
    if (r.done) done = r;
  }
  return { t, done, working: working / 60, prompts };
}

// ---------------------------------------------------------------- the spots

{
  ok('there are three places to get it fixed', REPAIR_SPOTS.length === 3,
    REPAIR_SPOTS.map((s) => s.key).join(', '));
  ok('the driveway is free and slow, the shops are quick and not',
    REPAIR_SPOTS.find((s) => s.key === 'home').free === true
    && REPAIR_SPOTS.find((s) => s.key === 'home').seconds === 10
    && REPAIR_SPOTS.filter((s) => !s.free).every((s) => s.seconds === 4));
  ok('the driveway is a 14 m radius and the forecourts are 24',
    REPAIR.HOME_RADIUS === 14 && REPAIR.SHOP_RADIUS === 24);

  const v = parked(0, 0, 40);
  ok('parked in the driveway, a repair is offered', repairSpotAt(v, PLACES)?.key === 'home');
  v.x = 13.5;
  ok('...at 13.5 m too', repairSpotAt(v, PLACES)?.key === 'home');
  v.x = 15;
  ok('...but not from the sidewalk at 15 m', repairSpotAt(v, PLACES) === null);
  v.x = 0; v.vLong = 4;
  ok('rolling through your own driveway does not count', repairSpotAt(v, PLACES) === null);
  v.vLong = 0; v.damage = 0;
  ok('and a clean car is offered nothing', repairSpotAt(v, PLACES) === null);

  const w = parked(2010, 0, 40);
  ok('the Petro-Canada is a repair spot', repairSpotAt(w, PLACES)?.key === 'gas');
  const c = parked(-1990, 0, 40);
  ok('so is the Canadian Tire', repairSpotAt(c, PLACES)?.key === 'ctire');
}

// ---------------------------------------------------------------- the money

{
  ok('20 % of the damage, in dollars', repairCost(100) === 20 && repairCost(60) === 12);
  ok('...never under $5', repairCost(1) === 5 && repairCost(20) === 5 && repairCost(25) === 5);
  ok('...and nothing at all on a clean car', repairCost(0) === 0);
  ok('$23 is what 115 points would cost, if a car could carry them',
    repairCost(115) === 23);
  ok('a wrecked car is a $20 job', repairCost(DAMAGE.DEAD) === 20);
}

// ---------------------------------------------------------------- at home

{
  const v = parked(0, 0, 55);
  const w = wallet(80);
  const st = { t: 0, key: null };
  const first = updateRepairs(st, 1 / 60, v, { places: PLACES, wallet: w });
  ok('the driveway prompt says what it is and what it costs',
    first.prompt === 'E  —  réparer dans l’entrée (gratuit, 10 s)', first.prompt);
  ok('...and nothing happens until you press E', first.working === false && st.key === null);

  const run = sit(v, w);
  ok('the driveway repair takes ten seconds', run.done && Math.abs(run.t - 10) < 0.1,
    `${r2(run.t)} s`);
  ok('...and costs nothing', run.done.cost === 0 && w.value === 80, `wallet ${w.value}`);
  ok('...with the seconds counting down in the prompt',
    run.prompts.includes('Réparation…  10 s') && run.prompts.includes('Réparation…  6 s')
    && run.prompts.includes('Réparation…  1 s'));
  ok('...and the toast your father never hears about',
    run.done.toast === 'Comme neuf.\nTon père a rien vu.', JSON.stringify(run.done.toast));
  ok('the wrench is tapping the whole time', run.working > 9.5, `${r2(run.working)} s of work`);
}

// ---------------------------------------------------------------- at the pumps

{
  const v = parked(2000, 0, 55);
  const w = wallet(80);
  const st = { t: 0, key: null };
  const first = updateRepairs(st, 1 / 60, v, { places: PLACES, wallet: w });
  ok('the forecourt prompt is the price', first.prompt === 'E  —  réparer (11 $)', first.prompt);

  const run = sit(v, w);
  ok('the Petro-Canada takes four seconds', run.done && Math.abs(run.t - 4) < 0.1, `${r2(run.t)} s`);
  ok('...and charges 20 % of the damage', run.done.cost === 11 && w.value === 69,
    `paid ${run.done.cost}, wallet ${w.value}`);
  ok('...and says so', /11 \$/.test(run.done.toast), JSON.stringify(run.done.toast));

  // The Canadian Tire is the same deal.
  const c = parked(-2000, 0, 30);
  const cw = wallet(50);
  const crun = sit(c, cw);
  ok('the Canadian Tire is four seconds and $6', crun.done && Math.abs(crun.t - 4) < 0.1
    && crun.done.cost === 6 && cw.value === 44, `paid ${crun.done.cost}`);

  // Minimum charge.
  const m = parked(2000, 0, 10);
  const mw = wallet(50);
  const mrun = sit(m, mw);
  ok('a scratch still costs the $5 minimum', mrun.done.cost === 5 && mw.value === 45);
}

// ---------------------------------------------------------------- broke

{
  const v = parked(2000, 0, 90);
  const w = wallet(3);
  const st = { t: 0, key: null };
  const r = updateRepairs(st, 1 / 60, v, { places: PLACES, wallet: w, press: true });
  ok('broke at the pumps: it refuses', st.key === null && r.working === false);
  ok('...and points at the driveway', /gratuit/.test(r.prompt) && /18 \$/.test(r.prompt), r.prompt);
  const run = sit(v, w, 12);
  ok('...and holding E all day changes nothing', run.done === null && w.value === 3);

  // The same car in its own driveway gets fixed for nothing.
  const h = parked(0, 0, 90);
  const hrun = sit(h, w);
  ok('broke, but home is free', hrun.done !== null && hrun.done.cost === 0 && w.value === 3,
    `${r2(hrun.t)} s`);
}

// ---------------------------------------------------------------- abandoning it

{
  const v = parked(2000, 0, 60);
  const w = wallet(80);
  const st = { t: 0, key: null };
  updateRepairs(st, 1 / 60, v, { places: PLACES, wallet: w, press: true });
  for (let i = 0; i < 60; i++) updateRepairs(st, 1 / 60, v, { places: PLACES, wallet: w });
  ok('a second into it, it is running', st.key === 'gas' && st.t > 0.9);
  v.x = 2600;                                   // drive off
  const r = updateRepairs(st, 1 / 60, v, { places: PLACES, wallet: w });
  ok('drive away half done and it resets', st.key === null && st.t === 0 && r.spot === null);
  ok('...and you were never charged for it', w.value === 80, `wallet ${w.value}`);
}

// ---------------------------------------------------------------- the nagging

{
  const st = { h25: false, h60: false };
  ok('a clean car is told nothing', repairHint(st, 0).toast === null
    && repairHint(st, 5).toast === null && repairHint(st, 24).hint === null);

  const a = repairHint(st, 26);
  ok('crossing 25 % names all three garages',
    a.toast === 'Ton char est magané — Petro-Can, Canadian Tire, ou ton entrée (E)', a.toast);
  ok('...and the damage bar gets a standing line',
    a.hint === 'réparer: Petro-Can · Canadian Tire · chez vous', a.hint);
  ok('...exactly once', repairHint(st, 30).toast === null && repairHint(st, 40).toast === null);

  const b = repairHint(st, 61);
  ok('crossing 60 % is the one about pulling left',
    b.toast === 'Ça tire à gauche pis ça pétarade — va le faire réparer', b.toast);
  ok('...also exactly once', repairHint(st, 90).toast === null);
  ok('the hint stays up while it is bent', repairHint(st, 90).hint !== null);

  // Fixed: both fire again next time you wreck it.
  const clean = repairHint(st, 0);
  ok('a repair clears the hint and both flags',
    clean.hint === null && st.h25 === false && st.h60 === false);
  ok('...so the next wreck tells you again', repairHint(st, 30).toast !== null);
}

// ---------------------------------------------------------------- the map wrench

{
  const v = parked(1900, 0, 40);
  const n = nearestRepair(v, PLACES);
  ok('the wrench goes on the nearest garage', n.key === 'gas' && n.label === 'Petro-Can',
    `${n.label} at ${Math.round(n.dist)} m`);
  v.x = -100;
  ok('...which from Fraser is your own driveway', nearestRepair(v, PLACES).key === 'home');
  v.x = -1500;
  ok('...and out west it is the Canadian Tire', nearestRepair(v, PLACES).key === 'ctire');
}

// ---------------------------------------------------------------- the tow

{
  ok('the flatbed charges $60', REPAIR.TOW === 60);
  const w = wallet(80);
  ok('...taken off you when you can pay', w.spend(REPAIR.TOW) === true && w.value === 20);
  ok('...and written off when you cannot', w.spend(REPAIR.TOW) === false && w.value === 20);
}

// ---------------------------------------------------------------- the primitive

{
  // updateRepair() is still the one-spot timer the rest of the game (and
  // smoke_driving) uses; the multi-spot machine above is built on top of it.
  const v = parked(100, 100, 40, 'civic');
  const st = { t: 0 };
  ok('the primitive still counts to five by default',
    updateRepair(st, 0.1, v, { x: 100, z: 100 }) === 'start');
  let done = null;
  for (let i = 0; i < 60 * 6 && !done; i++) done = updateRepair(st, 1 / 60, v, { x: 100, z: 100 });
  ok('...and finishes', done === 'done');
  ok('...and takes a clock when it is given one',
    (() => { const s2 = { t: 0 }; let d = null;
      for (let i = 0; i < 60 * 3 && d !== 'done'; i++) {
        d = updateRepair(s2, 1 / 60, v, { x: 100, z: 100 }, { seconds: 2 });
        if (i === 60 && d === 'done') return false;         // not before its time
      }
      return d === 'done'; })());
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
