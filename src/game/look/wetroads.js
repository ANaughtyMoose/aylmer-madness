// ==== s5-reflect (V5-02 subset): wet roads ====
// Pushes shaders/wet.js's uniforms: the weather's road wetness and rain each
// frame (only when they change), and at night, four times a second, the heads
// of the nearest streetlamps for the light streaks on the wet road. look/frame.js
// runs it at beforeSky while the wet flag is on; turning the flag off zeroes it.
import { onChange } from './flags.js';
import { nightAmount } from '../world/headlights.js';

const SLOTS = 8, SODIUM = [1.0, 0.58, 0.22];
const pos = new Float32Array(SLOTS * 4), col = new Float32Array(SLOTS * 4);
const wetv = new Float32Array(4);
const heads = new WeakMap();
let rig = null, last = -1, lastRain = -1, lastN = -1, clock = 0;
const DIRS = [[1, 0], [0.707, 0.707], [0, 1], [-0.707, 0.707], [-1, 0], [-0.707, -0.707], [0, -1], [0.707, -0.707]];

function ok(r) { return r && r.uniforms && r.uniforms.uWet; }
function push(r, wet, rain) {
  if (Math.abs(wet - last) < 0.004 && Math.abs(rain - lastRain) < 0.004) return;
  wetv[0] = wet; wetv[1] = rain; last = wet; lastRain = rain;
  r.uniform('uWet', wetv);
}
function setN(r, n) { if (n !== lastN) { r.uniform('uWetN', n); lastN = n; } }

onChange((s) => {
  if (s.wet || !ok(rig)) return;
  last = lastRain = -1; push(rig, 0, 0); setN(rig, 0);
});

// The lamp head sits 3 m from the pole toward the road (world/furniture.js);
// the direction is not stored, so probe the road once per pole.
function headOf(G, p) {
  let h = heads.get(p);
  if (h) return h;
  let dx = 0, dz = 0;
  const roadAt = G.world && G.world.roadAt;
  if (roadAt) for (const [x, z] of DIRS) if (roadAt(p.x + x * 3, p.z + z * 3)) { dx = x; dz = z; break; }
  h = [p.x + dx * 3, (p.y || 0) + 7.65, p.z + dz * 3];
  heads.set(p, h);
  return h;
}

export function init(G, r) { rig = r; }
export function tick(dt) { clock += dt; }
export function draw(r, G) {
  if (!ok(r)) return;
  rig = r;
  const w = G.weather;
  const wet = w ? Math.max(0, Math.min(1, w.wet || 0)) : 0;
  push(r, wet, w ? w.rain || 0 : 0);
  if (wet < 0.002) { setN(r, 0); return; }
  if (clock < 0.25 && lastN >= 0) return;
  clock = 0;
  const night = nightAmount(r.env);
  const cam = G.camPos;
  if (night <= 0.02 || !cam || !G.world || !G.world.queryPoles) { setN(r, 0); return; }
  const found = [];
  for (const p of G.world.queryPoles(cam[0], cam[2], 90)) {
    if (p.kind !== 'streetlight') continue;
    found.push([Math.hypot(p.x - cam[0], p.z - cam[2]), p]);
  }
  found.sort((a, b) => a[0] - b[0]);
  const n = Math.min(SLOTS, found.length);
  for (let i = 0; i < n; i++) {
    const h = headOf(G, found[i][1]);
    pos[i * 4] = h[0]; pos[i * 4 + 1] = h[1]; pos[i * 4 + 2] = h[2]; pos[i * 4 + 3] = 1.3 * night;
    col[i * 4] = SODIUM[0]; col[i * 4 + 1] = SODIUM[1]; col[i * 4 + 2] = SODIUM[2]; col[i * 4 + 3] = 1;
  }
  if (n) { r.uniform('uWetLight', pos); r.uniform('uWetLightCol', col); }
  setN(r, n);
}
