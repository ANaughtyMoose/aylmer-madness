// The look hooks render() and tick() call (docs/visual-wave/PLAN.md, 3.3).
// main.js calls these and nothing else from the visual wave, so no later task
// edits main.js: each feature fills in its own module below.
//
// Where each stage sits in main.js render():
//   beforeSky(r, G)         after r.begin, before the sky dome
//   afterWorld(r, G)        after the world, the distant ring and the signals,
//                           before any car
//   perCar(r, G, spec, x, z, yaw, y, gy)
//                           from drawCar, after the body, wheels and heads:
//                           the blob shadow (look/carshadow.js)
//   paint(G, spec, opts)    from drawCar, before the body draws: may add to the
//                           body's draw options (car paint); a no-op today
//   afterTransparent(r, G)  after the last translucent draw is queued (cones,
//                           markers, damage fx), before r.end()
//   post(r, G)              after r.end(), before the HUD
// and tick(dt) runs on the fixed step, from tick() after the day/night clock.
//
// A feature module exports init(G, r), tick(dt) and draw(r, G); draw runs at
// the stage the table below gives it. It may also export any stage by name, or
// perCar / paint with the arguments above, and is called there too. Everything is skipped while the feature's flag is off.
// The lists are built once here, so a frame costs a loop and a flag read per
// feature and allocates nothing.
import { isOn } from './flags.js';
import * as carshadow from './carshadow.js';
import * as timecycle from './timecycle.js';
import * as aobake from './aobake.js';
import * as particles from './particles.js';
import * as coronas from './coronas.js';
import * as headlights from './headlights.js';
import * as parkedfleet from './parkedfleet.js';
import * as photomode from './photomode.js';
import * as tiers from './tiers.js';
import * as season from './season.js';
import * as grade from './grade.js';   // S5-LIGHT (V1-01)
import * as glow from './glow.js';     // S5-LIGHT (V3-02 night side)
import * as carpaint from './carpaint.js';   // s5-reflect (V3-05)
import * as wetroads from './wetroads.js';   // s5-reflect (V5-02 subset)

// [module, flag, the stage its draw() runs at]. Order is draw order inside a stage.
const FEATURES = [
  [grade, 'linear', 'beforeSky'],   // S5-LIGHT: first, so the timecycle's ambient lands after it
  [tiers, 'tiers', 'beforeSky'],
  [season, 'season', 'beforeSky'],
  [timecycle, 'timecycle', 'beforeSky'],
  [glow, 'glass', 'beforeSky'],   // S5-LIGHT
  [aobake, 'ao', 'afterWorld'],
  [parkedfleet, 'parked', 'afterWorld'],
  [headlights, 'headlights2', 'afterTransparent'],
  [coronas, 'coronas', 'afterTransparent'],
  [particles, 'particles', 'afterTransparent'],
  [photomode, 'digicam', 'post'],
  [carpaint, 'carpaint', 'afterWorld'],   // s5-reflect: paint() only
  [wetroads, 'wet', 'beforeSky'],         // s5-reflect: wet road uniforms
];
const STAGES = ['beforeSky', 'afterWorld', 'afterTransparent', 'post'];

// stage -> flat [flag, fn, flag, fn, ...]
const calls = {};
for (const s of STAGES) {
  const list = [];
  for (const [m, flag, at] of FEATURES) {
    if (typeof m[s] === 'function') list.push(flag, m[s]);
    if (at === s && typeof m.draw === 'function') list.push(flag, m.draw);
  }
  calls[s] = list;
}
const ticks = [], cars = [], paints = [];
for (const [m, flag] of FEATURES) {
  if (typeof m.tick === 'function') ticks.push(flag, m.tick);
  if (typeof m.perCar === 'function') cars.push(flag, m.perCar);
  if (typeof m.paint === 'function') paints.push(flag, m.paint);
}

let initFor = null;
// Once per renderer: the first frame that has one (and again if it is replaced).
function ensure(r, G) {
  if (initFor === r) return;
  initFor = r;
  carshadow.init(G, r);
  for (const [m] of FEATURES) m.init(G, r);
}

function run(list, r, G) {
  for (let i = 0; i < list.length; i += 2) if (isOn(list[i])) list[i + 1](r, G);
}

export function beforeSky(r, G) { ensure(r, G); run(calls.beforeSky, r, G); }
export function afterWorld(r, G) { run(calls.afterWorld, r, G); }
export function afterTransparent(r, G) { run(calls.afterTransparent, r, G); }
export function post(r, G) { run(calls.post, r, G); }

// The blob shadow always (it is the shipped look, not a wave feature), then any
// feature that exports perCar (tail lights, say), with the same arguments.
export function perCar(r, G, spec, x, z, yaw, y, gy) {
  carshadow.perCar(r, G, spec, x, z, yaw, y, gy);
  for (let i = 0; i < cars.length; i += 2) if (isOn(cars[i])) cars[i + 1](r, G, spec, x, z, yaw, y, gy);
}
// Any feature that exports paint(G, spec, opts) may add to a car body's draw
// options before it draws (look/carpaint.js: the car paint material).
export function paint(G, spec, opts) {
  for (let i = 0; i < paints.length; i += 2) if (isOn(paints[i])) paints[i + 1](G, spec, opts);
  return opts;
}

export function tick(dt) {
  if (!initFor) return;
  for (let i = 0; i < ticks.length; i += 2) if (isOn(ticks[i])) ticks[i + 1](dt);
}
