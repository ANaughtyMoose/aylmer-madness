// Mission clocks against the real road graph:  node tools/smoke_timers.mjs
//
// PLAYTEST.md #6 and HANDOFF.md both flagged « Première période »: « the first
// job's timer margin is thin. » It was worse than thin. The note in missions.js
// said « five minutes leaves room for one wrong exit », and it was written when
// Heritage College was a couple of kilometres away. Over the road graph the
// college is 11 996 m from 299 Chemin Fraser, so 420 s asked a 103 km/h
// door-to-door average — every light, every stop and the 24 m stage radius
// included — of somebody who has never driven to Hull.
//
// tools/timers.mjs already prints that table, but it prints it: nothing fails,
// and it silently does not run at all when the repo path has a space in it
// (docs/HANDOFF.md, the import.meta.url guard). So the one number that matters
// is asserted here instead, and it is asserted the way the complaint was made:
// as an AVERAGE SPEED a first-time driver has to hold, not as a count of
// seconds nobody can judge.
//
// The bar is 38 km/h. That is a person reading street signs, stopping at the
// lights on the chemin d'Aylmer, watching the seam card, and taking one wrong
// exit off the 148 — measured door to door, not cruising speed. It has to hold
// on every difficulty, because calendar.js scales every stage clock (hard is
// 0.9) and the hard summer is the same road.
import { MAP } from '../src/game/mapdata.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';
import { Nav } from '../src/game/nav.js';
import { missionById } from '../src/game/missions.js';
import { DIFF } from '../src/game/calendar.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

// The same stand-in world tools/smoke_cart.mjs and tools/smoke_story.mjs use,
// so the routes below are the real ones the GPS line draws and not straight
// lines across the river.
const fakeWorld = {
  bounds: MAP.bounds,
  nearestRoad(x, z) {
    let bd = Infinity, best = { x, z, yaw: 0, name: '' };
    for (const r of MAP.roads) {
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
        const px = ax + ex * t, pz = az + ez * t;
        const d = Math.hypot(px - x, pz - z);
        if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(ex, ez), name: r.name || '' }; }
      }
    }
    return best;
  },
};
resolvePlaces(fakeWorld);
const nav = new Nav();

/** Metres over the road graph, the same path the GPS draws. */
function routeLength(fromKey, toKey) {
  const a = PLACES[fromKey], b = PLACES[toKey];
  if (!a || !b) return null;
  const r = nav.route(a.x, a.z, b.x, b.z);
  if (!r || r.length < 2) return null;
  let m = 0;
  for (let i = 1; i < r.length; i++) m += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
  return m;
}

// What the clock demands as a door-to-door average, in km/h.
const implied = (metres, seconds) => (metres / seconds) * 3.6;

// A first-timer's door-to-door average, with one wrong turn in it.
const FIRST_TIMER_KMH = 38;

const ctx = { carId: 'ranger', carName: 'Ranger', seats: 2, places: 3, money: 0 };

group('« Première période » — the drive that opens the map');
{
  const def = missionById('school');
  ok(!!def, 'the job is still in the build');
  const st = def.build(ctx)[0];
  ok(st.at === 'heritage', 'it still ends at Heritage College');
  ok(st.giver !== undefined || def.giver === 'home', 'and it is still taken in the driveway');

  const m = routeLength(def.giver, st.at);
  ok(m !== null, 'the college is reachable from 299 Chemin Fraser over the graph');
  ok(m > 10000, `it is a real haul — ${Math.round(m)} m`, String(Math.round(m)));

  ok(Number.isFinite(st.time), 'the stage has a clock');
  // THE assertion. Route length over the timer, in km/h, is what the player has
  // to hold; it may not be more than a first-timer with one wrong turn holds.
  const kmh = implied(m, st.time);
  ok(kmh <= FIRST_TIMER_KMH,
    `${Math.round(m)} m in ${st.time} s = ${kmh.toFixed(1)} km/h door to door, at or under ${FIRST_TIMER_KMH}`,
    `${kmh.toFixed(1)} km/h`);

  // main.js scales every stage clock by G.timerScale (calendar.js startSummer),
  // so the promise has to survive the squeeze as well as the stretch.
  for (const [name, d] of Object.entries(DIFF)) {
    const scaled = Math.max(60, Math.round(st.time * d.timer));
    const k = implied(m, scaled);
    ok(k <= FIRST_TIMER_KMH,
      `${name}: ${scaled} s = ${k.toFixed(1)} km/h`, `${k.toFixed(1)} km/h`);
  }

  // ...and it is not absurd in the other direction: a clock so long it is not a
  // clock teaches the player to ignore every timer after it.
  ok(implied(m, st.time) >= 20,
    `and it is still a clock — ${implied(m, st.time).toFixed(1)} km/h is not a stroll`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
