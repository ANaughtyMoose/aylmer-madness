// Night amount and the player headlight cones (moved out of world.js unchanged, V0-02).
import { clamp } from '../../core/math.js';
import { MeshBuilder } from '../../core/mesh.js';

// How dark it is, 0 by day and 1 at night, from the ambient sky colour - so it
// follows the environment blend instead of needing a flag threaded through.
export function nightAmount(env) {
  if (!env) return 0;
  const s = env.sky;
  const lum = 0.3 * s[0] + 0.59 * s[1] + 0.11 * s[2];
  return clamp((0.36 - lum) / 0.2, 0, 1);
}

// Two translucent wedges in car-local space (nose at +Z), drawn unlit in front
// of the player at night. One mesh, one draw. (W7)
export function buildHeadlights(renderer, spec) {
  const b = new MeshBuilder();
  const col = [1, 0.95, 0.78];
  const zf = (spec ? spec.len : 4.4) * 0.5;
  for (const s of [-1, 1]) {
    const ox = s * 0.62;
    // near edge at the lamp, far edge 15 m out and wide, sloping down to the road
    const p0 = [ox - 0.16, 0.62, zf], p1 = [ox + 0.16, 0.62, zf];
    const p2 = [ox * 0.4 + 2.6, 0.06, zf + 15], p3 = [ox * 0.4 - 2.6, 0.06, zf + 15];
    b.quad(p1, p0, p3, p2, col, [0, 1, 0]);
  }
  return renderer.upload(b);
}
