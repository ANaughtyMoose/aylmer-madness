// ==== s5-reflect (V3-05): car paint ====
// Routes a car body to MAT_CAR (shaders/car.js: clear coat, analytic sky,
// sun lobe) through the look.paint hook drawCar already calls, so main.js is
// untouched. Only bodies cars.js tagged (PAINTED) qualify: a photo skin
// (opts.tex) and anything built with the carpaint flag off stay world.
// look/frame.js skips this while the carpaint flag is off, which is the
// exact old look (MAT_WORLD normalises the tagged normals).
import { PAINTED } from '../cars.js';
import { PROTOTYPE } from './flags.js';

export function init(G, r) {}
export function tick(dt) {}
export function draw(r, G) {}

export function paint(G, spec, opts) {
  if (PROTOTYPE || opts.material !== undefined || opts.tex) return;
  if (PAINTED.has(spec.id)) opts.material = 'car';
}
