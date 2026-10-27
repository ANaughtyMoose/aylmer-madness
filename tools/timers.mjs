// Every story clock against the map (G1, redone for s1-timers, 20 Oct 2026).
//
//   node tools/timers.mjs          -> writes tools/timers.md (static: routes + ceilings)
//   node tools/timers.mjs --print  -> the same, to stdout
//   node tools/timers.mjs --pace   -> also drives every road clock with the pace
//                                     car on the real road bake (about a minute),
//                                     writes tools/timers_pace.json, then the table
//
// What a "clock" is: one countdown the player sees. Most are one stage. Two are
// shared over several stages (the golf night's owners' chase carries one clock
// over four flags and the bikes; Russell's marshal chase over six flags), and the
// story blitz is one clock plus a bonus per gate. Every clock is a list of legs:
//
//   road  routed over the real road graph, the same Dijkstra the GPS line draws
//   cart  a golf cart on the grass, straight line from flag to flag
//
// The rule (Tom's bar, s1-timers brief): a clock is (pace + REACT_S) x PACE_FACTOR,
// rounded to 5 s. Pace on the road is the race.js pace car (SKILL.pace, cruise 33 m/s, the
// ~116 km/h the packs measure) in the Ranger, from a standstill, on the real bake.
// It lifts for every bend and never cuts a corner, so it is a decent human on a
// keyboard and not a great one. Pace in a cart is CART_PACE_KMH (measured: the
// review bot pinned at the 34 km/h governor did the four chase flags, ramps and
// all, in 59 s for 476 m, 29 km/h) plus STOP_E_S for each stop-and-E.
//
// tools/smoke_timers.mjs reads clocks() and CEILING_KMH from here: a clock that
// asks a faster average than the per-road-class ceiling fails the build, and so
// does one slow enough to be set dressing.

import { MAP } from '../src/game/mapdata.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';
import { MISSIONS } from '../src/game/missions.js';
import { Nav } from '../src/game/nav.js';
import { CARS } from '../src/game/cars.js';
import { CART_SPOT as ROYAL_CART } from '../src/game/setpieces/royal.js';

export const PACE_FACTOR = 1.35;
export const CART_PACE_KMH = 29;
export const STOP_E_S = 4;
// The pace car leaves the instant a stage starts; a player first reads the new
// objective and picks a direction. Added once per clock, before the 1.35.
export const REACT_S = 3;
// W6-CURFEW: how the pace car meets a stage's maxSpeed circle. It brakes at
// BRAKE_MS2 (firm, under the Ranger's 8.0 m/s2 limit: a driver who knows the
// drive is coming, not one who stamps on it) to VMAX_MARGIN km/h under the cap
// by the circle's edge, and the stage only finishes at or under the cap.
export const BRAKE_MS2 = 6;
export const VMAX_MARGIN = 3;
/** The clock a pace earns: (pace + REACT_S) x PACE_FACTOR, rounded to 5 s. */
export const clockFor = (pace) => Math.round(((pace + REACT_S) * PACE_FACTOR) / 5) * 5;

// The fastest average a clock may ASK of a player in the Ranger, per road class,
// door to door with corners, junctions and traffic. A clock asking more than the
// length-weighted blend of these fails smoke_timers. They sit about 1.35 under
// what the pace car holds on each class (it does 105 to 115 km/h on the trunk
// and the chemin d'Aylmer, 75 to 95 through the Vieux), so a clock set by the
// rule passes and a clock like Highway to Hull's old 168 km/h never can.
export const CEILING_KMH = {
  trunk: 100, primary: 90, secondary: 88, tertiary: 75, residential: 65, service: 35,
  cart: 26,      // the governor is 34 km/h, the bot holds 29 with the ramps
};
// ...and the slowest average a clock may ask before it stops mattering. A clock
// you meet at these is set dressing (La Saint-Jean's old 24 km/h haul).
export const FLOOR_KMH = {
  trunk: 50, primary: 45, secondary: 42, tertiary: 38, residential: 32, service: 18,
  cart: 15,
};

const CART_JOBS = new Set(['golfcart', 'russellroyal']);
// Where a cart chase really starts when it is not the last stage's target: the
// marshal chase starts in the cart Russell hands you by the lot.
const CART_START = { russellroyal: ROYAL_CART };
const SHARED = /^(chase\d+|bikes)$/;

export const round5 = (s) => Math.round(s / 5) * 5;
/** One key per clock: a job id, plus the stage when a job has several clocks. */
export const keyOf = (c) => `${c.id} ${c.stage.split('-')[0]}`;

// world.js's nearestRoad, minus the WebGL: closest point on any non-service
// road. resolvePlaces only ever asks for this one method.
function stubWorld() {
  return {
    nearestRoad(x, z) {
      let best = Infinity, bx = x, bz = z, byaw = 0, bname = '';
      for (const r of MAP.roads) {
        if (r.cls === 'service') continue;
        const p = r.pts;
        for (let i = 0; i + 1 < p.length; i++) {
          const ax = p[i][0], az = p[i][1];
          const dx = p[i + 1][0] - ax, dz = p[i + 1][1] - az;
          const l2 = dx * dx + dz * dz;
          let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + t * dx, pz = az + t * dz;
          const d2 = (px - x) ** 2 + (pz - z) ** 2;
          if (d2 < best) { best = d2; bx = px; bz = pz; byaw = Math.atan2(dx, dz); bname = r.name || ''; }
        }
      }
      return { x: bx, z: bz, yaw: byaw, name: bname, dist: Math.sqrt(best) };
    },
  };
}

// A route with its length per road class. Nav.route returns points; the class of
// each hop is the edge between the two graph nodes it joins.
export function roadLeg(nav, from, to) {
  const path = nav.route(from.x, from.z, to.x, to.z);
  const byClass = {};
  let metres = 0;
  if (!path) return { kind: 'road', from, to, metres: NaN, byClass, path: null };
  const add = (cls, m) => { byClass[cls] = (byClass[cls] || 0) + m; metres += m; };
  // from -> first node, last node -> to: count as residential (the drive or lot).
  add('residential', Math.hypot(path[0][0] - from.x, path[0][1] - from.z));
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k], b = path[k + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const na = nav.nearest(a[0], a[1]);
    const e = na && na.edges.find((ed) => Math.abs(ed.to.x - b[0]) < 1e-6 && Math.abs(ed.to.z - b[1]) < 1e-6);
    add(e ? e.cls : 'residential', len);
  }
  return { kind: 'road', from, to, metres, byClass, path };
}
const cartLeg = (from, to) => {
  const m = Math.hypot(to.x - from.x, to.z - from.z);
  return { kind: 'cart', from, to, metres: m, byClass: { cart: m }, path: null };
};

const resolveAt = (at, G) => (typeof at === 'function' ? at(G) : typeof at === 'string' ? PLACES[at] : at);

/**
 * Every clock a player can meet in the summer (story, optional jobs, the story
 * blitz), in campaign order. `time` is the seconds the player gets in total.
 */
export function clocks(nav, ctx) {
  const G = { nav, parked: {}, mission: null, veh: null };
  const out = [];
  for (const def of MISSIONS) {
    let stages;
    try { stages = def.build(ctx); } catch (e) { continue; }
    let pos = PLACES[def.giver] || null;
    let open = null;
    for (let i = 0; i < stages.length; i++) {
      const st = stages[i];
      let p = null;
      try { p = st.noTarget ? null : resolveAt(st.at, G); } catch (e) { p = null; }
      const shared = open && SHARED.test(st.kind || '') && st.time === open.stageTime;
      if (!shared) open = null;
      if (def.clockCourse && st.kind === 'race') {
        // The blitz: the clock plus `bonus` per gate, over every gate in order.
        const c = def.clockCourse;
        const legs = [];
        let from = PLACES[c.start] || pos;
        for (const cp of c.cps) { const q = resolveAt(cp, G); legs.push(roadLeg(nav, from, q)); from = q; }
        out.push({ id: def.id, stage: `${i + 1}/${stages.length}`, text: st.text, kind: 'blitz',
          start: c.clock, bonus: c.bonus, time: c.clock + c.bonus * (c.cps.length - 1), legs, stops: 0 });
        // The last gate's bonus lands after the finish: it buys nothing.
        pos = from;
        continue;
      }
      if (st.time && p && p.x != null) {
        const cart = CART_JOBS.has(def.id) && SHARED.test(st.kind || '');
        const from = cart && !shared && CART_START[def.id] ? CART_START[def.id] : pos;
        const leg = cart ? cartLeg(from, p) : roadLeg(nav, from, p);
        if (shared) {
          open.legs.push(leg);
          open.stage = open.stage.split('-')[0] + '-' + (i + 1) + '/' + stages.length;
          if (st.hold) open.stops++;
        } else {
          open = { id: def.id, stage: `${i + 1}/${stages.length}`, text: st.text, kind: cart ? 'cart' : 'road',
            time: st.time, stageTime: st.time, legs: [leg], stops: st.hold ? 1 : 0,
            anywhere: !!st.anywhere, stageRef: st,
            // After the doughnuts you leave the ring facing anywhere: the pace
            // car starts facing away from the route, the worst case.
            turned: i > 0 && /doughnut/i.test(stages[i - 1].kind || stages[i - 1].text || '') };
          out.push(open);
        }
      }
      if (p && p.x != null) pos = p;
    }
  }
  for (const c of out) {
    c.metres = c.legs.reduce((a, l) => a + (isFinite(l.metres) ? l.metres : 0), 0);
    c.byClass = {};
    for (const l of c.legs) for (const [k, v] of Object.entries(l.byClass)) c.byClass[k] = (c.byClass[k] || 0) + v;
  }
  return out;
}

/** Seconds a clock needs at a per-class speed table (+ the stops). */
export function secondsAt(clock, table) {
  let s = clock.stops * STOP_E_S;
  for (const [cls, m] of Object.entries(clock.byClass)) s += m / ((table[cls] || table.residential) / 3.6);
  return s;
}

export function staticNav() {
  resolvePlaces(stubWorld());
  return new Nav();
}

export const rangerCtx = () => {
  const r = CARS.find((c) => c.id === 'ranger');
  return { carId: r.id, carName: r.name, seats: r.seats };
};

// ---------------------------------------------------------------- the pace car

export async function paceAll() {
  const ctx2d = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 40 })
    : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) : () => {}) });
  globalThis.document = globalThis.document || {
    createElement() { return { width: 0, height: 0, style: {}, getContext() { return ctx2d; } }; },
    getElementById() { return null; },
  };
  const mem = new Map();
  globalThis.localStorage = globalThis.localStorage || {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
  };
  { let seed = 0x9e3779b9; Math.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1e6) / 1e6; }; }
  class StubRenderer {
    upload(b) { if (b.finish) b.finish(); return { vao: null, count: b.i.length, min: b.min && b.min.slice(), max: b.max && b.max.slice() }; }
    texture() { return { stub: true }; } visible() { return true; } draw() {}
  }
  const { buildWorld } = await import('../src/game/world.js');
  const MATS = (await import('../src/game/materials_stub.js')).default;
  const { carById } = await import('../src/game/cars.js');
  const { Rival, SKILL } = await import('../src/game/race.js');
  const { installJumps } = await import('../src/game/jumps.js');
  installJumps();
  const world = buildWorld(new StubRenderer(), MATS);
  resolvePlaces(world);
  const nav = new Nav();
  const phys = {
    roadAt: (x, z) => world.roadAt(x, z), querySegments: (x, z, r) => world.querySegments(x, z, r),
    waterAt: (x, z) => world.waterAt(x, z), queryPoles: (x, z, r) => world.queryPoles(x, z, r),
    snapPole: (p, ux, uz) => world.snapPole(p, ux, uz), groundAt: world.groundAt, bounds: world.bounds,
  };
  const all = clocks(nav, rangerCtx());
  const res = {};
  for (const c of all) {
    if (c.kind === 'cart') {
      res[keyOf(c)] = { pace: c.metres / (CART_PACE_KMH / 3.6) + c.stops * STOP_E_S, how: `cart ${CART_PACE_KMH} km/h` };
      continue;
    }
    // One car, one standing start, every leg in a row (a blitz never stops).
    const path = [];
    for (const l of c.legs) {
      const pts = l.path || [[l.from.x, l.from.z], [l.to.x, l.to.z]];
      if (!path.length) path.push([l.from.x, l.from.z]);
      for (const p of pts) path.push(p);
    }
    const s = c.legs[0].from;
    const rv = new Rival(carById('ranger'), { skill: SKILL.pace });
    rv.setPath(path);
    rv.place(s.x, s.z, Math.atan2(path[1][0] - s.x, path[1][1] - s.z) + (c.turned ? Math.PI : 0));
    rv.active = true;
    const STEP = 1 / 60;
    const split = [];
    let leg = 0, t = 0, top = 0;
    const st = c.stageRef;
    // The circle is missionkit's: st.radius, else 14 m (stageTarget). The blitz
    // gates keep the 16 m they were paced with.
    const R = (st && st.radius) || (c.kind === 'blitz' ? 16 : 14);
    // W6-CURFEW: a stage with maxSpeed only finishes at or under it inside the
    // circle (missionkit stageStep), so the pace car has to arrive that slow too.
    // It brakes on a plan, BRAKE_MS2 from the speed it holds down to VMAX_MARGIN
    // under the cap at the circle's edge, the way a decent driver lifts and
    // brakes for a driveway, and only the last leg is capped (a capped stage is
    // never part of a shared clock).
    const vmax = st && st.maxSpeed ? st.maxSpeed : null;
    const capCtx = { cap: null };
    const done = (l, last) => {
      const tgt = l.to;
      if (Math.hypot(rv.x - tgt.x, rv.z - tgt.z) < R) return !(last && vmax && rv.speedKmh > vmax);
      if (st && st.anywhere && st.condition) { try { return !!st.condition({ veh: rv }); } catch (e) { return false; } }
      return false;
    };
    let arrive = null;
    for (let i = 0; i < 60 * 60 * 20 && leg < c.legs.length; i++) {
      const last = leg === c.legs.length - 1;
      if (vmax && last) {
        const tgt = c.legs[leg].to;
        const d = Math.max(0, Math.hypot(rv.x - tgt.x, rv.z - tgt.z) - R);
        const v0 = Math.max(1, (vmax - VMAX_MARGIN) / 3.6);
        capCtx.cap = Math.sqrt(v0 * v0 + 2 * BRAKE_MS2 * d);
      }
      rv.update(STEP, phys, vmax && last ? capCtx : null);
      t += STEP;
      if (rv.speedKmh > top) top = rv.speedKmh;
      if (done(c.legs[leg], last)) { if (last && vmax) arrive = Math.round(rv.speedKmh); split.push(+t.toFixed(1)); leg++; }
    }
    res[keyOf(c)] = leg < c.legs.length ? { pace: null, split, top } : { pace: t, split, top: Math.round(top), resets: rv.resets, how: 'pace car, Ranger', ...(vmax ? { maxSpeed: vmax, arriveKmh: arrive } : {}) };
    console.error(`  paced ${keyOf(c).padEnd(22)} ${res[keyOf(c)].pace ? res[keyOf(c)].pace.toFixed(1) + ' s' : 'NEVER'}  top ${Math.round(top)} km/h  splits ${split.join(' ')}${vmax ? `  in at ${arrive} km/h (max ${vmax})` : ''}`);
  }
  return res;
}

// ---------------------------------------------------------------- the table

const kmh = (m, s) => (s ? (m / s) * 3.6 : null);
const f1 = (v) => (v == null || !isFinite(v) ? '-' : v.toFixed(1));
const f0 = (v) => (v == null || !isFinite(v) ? '-' : Math.round(v).toLocaleString('en-CA'));

export function buildTimersTable(pace = null) {
  const nav = staticNav();
  const all = clocks(nav, rangerCtx());
  const L = [];
  L.push('# Story clocks vs. the map');
  L.push('');
  L.push('Generated by `node tools/timers.mjs` (`--pace` re-drives the pace car). The rule: a clock is');
  L.push(`(pace + ${REACT_S} s to read the prompt) x ${PACE_FACTOR}, rounded to 5 s. Road pace is the race.js pace car in the Ranger from a`);
  L.push(`standstill on the real bake (tools/timers_pace.json); cart pace is ${CART_PACE_KMH} km/h straight`);
  L.push(`flag to flag plus ${STOP_E_S} s per stop-and-E. \`route m\` is the GPS route (road) or the straight`);
  L.push('line (cart). `ceil s` is the least a clock may give (the per-class ceiling on what it asks);');
  L.push('`floor s` the most a clock may give before it stops mattering. tools/smoke_timers.mjs');
  L.push('fails the build when a clock is outside [ceil, floor].');
  L.push('');
  L.push('Ceilings km/h: ' + Object.entries(CEILING_KMH).map(([k, v]) => `${k} ${v}`).join(' · '));
  L.push('');
  L.push('| job | stage | what | route m | clock s | asks km/h | pace s | (pace+3) x1.35 | ceil s | floor s |');
  L.push('|---|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of all) {
    const p = pace && pace[keyOf(c)] && pace[keyOf(c)].pace;
    const clock = c.kind === 'blitz' ? `${c.time} (${c.start}+${c.bonus}x${c.legs.length - 1})` : c.time;
    L.push(`| ${c.id} | ${c.stage} | ${c.text} | ${f0(c.metres)} | ${clock} | ${f1(kmh(c.metres, c.time))} | ` +
      `${p ? f1(p) : '-'} | ${p ? clockFor(p) : '-'} | ${f0(secondsAt(c, CEILING_KMH))} | ${f0(secondsAt(c, FLOOR_KMH))} |`);
  }
  L.push('');
  // Every stage of every job, timed or not: the whole summer's driving, so a new
  // clock has a distance to start from (smoke_ui checks every job is here).
  L.push('## Every stage');
  L.push('');
  L.push('| mission | stage | target | route m | timer s | implied km/h |');
  L.push('|---|---|---|---:|---:|---:|');
  const G = { nav, parked: {}, mission: null, veh: null };
  for (const def of MISSIONS) {
    let stages = [];
    try { stages = def.build(rangerCtx()); } catch (e) { /* listed with no stages */ }
    let pos = PLACES[def.giver], total = 0;
    stages.forEach((st, i) => {
      let p = null;
      try { p = st.noTarget ? null : resolveAt(st.at, G); } catch (e) { p = null; }
      let m = null;
      if (p && p.x != null && pos) {
        const cart = CART_JOBS.has(def.id) && SHARED.test(st.kind || '');
        m = (cart ? cartLeg(pos, p) : roadLeg(nav, pos, p)).metres;
        if (!isFinite(m)) m = null;
        pos = p;
      }
      total += m || 0;
      L.push(`| ${def.id} | ${i + 1}/${stages.length} | ${st.text} | ${f0(m)} | ${st.time ?? '-'} | ${st.time && m ? f1(kmh(m, st.time)) : '-'} |`);
    });
    L.push(`| **${def.id}** | **total** | ${stages.length} stages | **${f0(total)}** | - | - |`);
  }
  L.push('');
  L.push('## Notes');
  L.push('');
  L.push('- A stage with no `time` is untimed and is not listed. The golf night and Russell\'s chase carry');
  L.push('  one clock over several stages (`m.chaseLeft`): one row each, legs summed.');
  L.push('- The getaway at Sayyad\'s passes at 300 m in a straight line (`anywhere`): the pace car is');
  L.push('  stopped there, not at the marker.');
  L.push('- Route length is a lower bound: no U-turns, no overshoot, no traffic. The pace car meets');
  L.push('  traffic-free roads; the 1.35 is the human\'s and the traffic\'s share.');
  L.push('- `nearestRoad` in the static table is a stand-in for world.js\'s, so a place may snap a metre');
  L.push('  or two differently from the pace run.');
  L.push('');
  return L.join('\n');
}

// CLI. Compare paths, not URLs: a URL encodes the space in "Coding Projects"
// and `file://${argv[1]}` does not, so the old guard never matched on Tom's Mac.
const { fileURLToPath } = await import('node:url');
const { resolve, dirname, join } = await import('node:path');
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { writeFileSync, readFileSync, existsSync } = await import('node:fs');
  const here = dirname(fileURLToPath(import.meta.url));
  const pj = join(here, 'timers_pace.json');
  let pace = null;
  if (process.argv.includes('--pace')) {
    pace = await paceAll();
    writeFileSync(pj, JSON.stringify(pace, null, 1) + '\n');
    console.error('wrote ' + pj);
  } else if (existsSync(pj)) pace = JSON.parse(readFileSync(pj, 'utf8'));
  const md = buildTimersTable(pace);
  if (process.argv.includes('--print')) process.stdout.write(md);
  else {
    const out = join(here, 'timers.md');
    writeFileSync(out, md);
    console.log('wrote ' + out);
  }
}
