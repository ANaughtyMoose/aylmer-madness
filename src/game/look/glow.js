// S5-LIGHT (20 Oct): the night side of V3-02 glass, look flag `glass`. Lit
// windows and lamp heads (tagged in the bake, drawn by shaders/glass.js) glow
// as much as the sky is dark: uNightGlow = nightAmount(env), the same rule the
// lamp pools and the headlights follow, so all three come on together.
import { onChange, isOn } from './flags.js';
import { advLight } from './advlight.js';   // W8-LIGHT: nothing here runs with Advanced lighting off
import { nightAmount } from '../world/headlights.js';

let R = null, last = -1, listening = false;
const ok = (r) => r && typeof r.uniform === 'function' && !r.isPrototype && advLight();
export function init(G, r) {
  R = r; last = -1;
  if (!listening) { listening = true; onChange(() => { if (!isOn('glass') && ok(R)) { R.uniform('uNightGlow', 0); last = 0; } }); }
}
export function tick(dt) {}
export function draw(r, G) {
  if (!ok(r) || !G.env) return;
  const k = Math.round(nightAmount(G.env) * 500) / 500;
  if (k !== last) { last = k; r.uniform('uNightGlow', k); }
}
