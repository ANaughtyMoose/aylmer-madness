#!/usr/bin/env node
// Every story clock against the map (s1-timers, 20 Oct 2026):
//
//   node tools/smoke_timers.mjs
//
// tools/timers.mjs routes every timed stage of the summer (story, optional jobs,
// the story blitz) over the real road graph, or flag to flag on the grass for the
// golf carts, and splits the route by road class. This fails the build when a
// clock asks a faster average than the per-class ceiling (CEILING_KMH: the most a
// clock may ask of a human in the Ranger, corners included), gives so much time that
// the clock is set dressing (FLOOR_KMH), or drifts from the pace rule in
// tools/timers_pace.json. Highway to Hull's old 168 km/h stage and
// La Saint-Jean's old 24 km/h haul are the two this was written for.
//
// It is static (no world bake), so it is quick. The clocks themselves come from
// the pace car (node tools/timers.mjs --pace): see tools/timers.md.
import { readFileSync, existsSync } from 'node:fs';
import {
  clocks, staticNav, rangerCtx, secondsAt, keyOf, clockFor, CEILING_KMH, FLOOR_KMH,
} from './timers.mjs';
const PACE_JSON = new URL('./timers_pace.json', import.meta.url);
const pace = existsSync(PACE_JSON) ? JSON.parse(readFileSync(PACE_JSON, 'utf8')) : {};

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${extra ? '   ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '   ' + extra : ''}`); }
};
const kmh = (m, s) => (m / s) * 3.6;

const all = clocks(staticNav(), rangerCtx());

console.log('\nthe clocks are found');
for (const id of ['sayyad', 'arcbache', 'golfcart', 'russellroyal', 'school', 'curfew', 'highwayhull', 'chelsea', 'blitz']) {
  ok(all.some((c) => c.id === id), `${id} has a clock on the map`);
}
ok(all.every((c) => c.legs.every((l) => isFinite(l.metres) && l.metres > 0)), 'every leg of every clock routes');

console.log('\nno clock asks more than the road allows, none is set dressing');
for (const c of all) {
  const ceil = secondsAt(c, CEILING_KMH), floor = secondsAt(c, FLOOR_KMH);
  const what = `${c.id} ${c.stage}: ${Math.round(c.metres)} m in ${c.time} s (${kmh(c.metres, c.time).toFixed(0)} km/h)`;
  ok(c.time >= ceil, `${what} is beatable`, `ceiling needs ${ceil.toFixed(0)} s`);
  ok(c.time <= floor, `${what} still matters`, `floor allows ${floor.toFixed(0)} s`);
}

console.log('\na blitz clock lasts to every gate, not just the last');
for (const c of all.filter((x) => x.kind === 'blitz')) {
  let s = 0;
  c.legs.forEach((l, k) => {
    s += secondsAt({ byClass: l.byClass, stops: 0 }, CEILING_KMH);
    ok(c.start + c.bonus * k >= s, `${c.id} gate ${k + 1}/${c.legs.length}`,
      `${c.start + c.bonus * k} s on the clock, ceiling needs ${s.toFixed(0)} s`);
  });
}

console.log('\nevery clock is the pace rule, (pace + 3 s) x 1.35 (re-pace: node tools/timers.mjs --pace)');
for (const c of all) {
  const p = pace[keyOf(c)];
  ok(p && p.pace > 0, `${keyOf(c)} has a measured pace`, p ? `${p.pace.toFixed(1)} s (${p.how})` : 'missing from tools/timers_pace.json');
  if (p && p.pace > 0) ok(Math.abs(c.time - clockFor(p.pace)) <= 5, `${keyOf(c)}: ${c.time} s against the rule's ${clockFor(p.pace)} s`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
