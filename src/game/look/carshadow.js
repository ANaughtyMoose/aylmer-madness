// The blob shadow under every car, moved out of main.js drawCar by V0-03 with
// the same numbers, so the same pixels. look/frame.js perCar() calls draw()
// after the body, wheels and heads, which is where drawCar drew it before.
//
// It stays on the ground and spreads out as the car climbs away from it, which
// is most of what sells a jump. The 2004 prototype renderer has real shadows
// and never drew it.
import { m4, clamp } from '../../core/math.js';
import { PROTOTYPE } from './flags.js';

const mm = m4.create();
const black = new Float32Array([0, 0, 0]);

export function init(G, r) {}
export function tick(dt) {}
export function draw(r, G) {}

// One car: its spec, where it is, its body height `y` and the ground under it `gy`.
export function perCar(r, G, spec, x, z, yaw, y, gy) {
  const lift = clamp(y - gy, 0, 4);
  const k = 1 + lift * 0.13;
  m4.compose(mm, x, gy + 0.06, z, yaw, 0, 0, (spec.wid + 0.5) * k, 1, (spec.len + 0.4) * k);
  // A fresh options object per car, as before: the renderer queues translucent
  // draws with their options by reference and draws them at end().
  if (!PROTOTYPE) r.draw(G.meshes.shadow, mm, { alpha: 0.3 * (1 - lift / 5), unlit: true, colorMul: black });
}
