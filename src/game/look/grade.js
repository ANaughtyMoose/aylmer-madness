// S5-LIGHT (V1-01): the grade, look flag `linear`. At beforeSky, once a frame:
// the fog colour decoded to linear (gl.js begin() wrote it display-referred),
// the light uniforms graded from the env's ambient fields when the timecycle
// publishes them (env.ambSky / env.ambGround), and the tone-curve uniforms
// (exposure from the eye's adaptation, the env's own grade). Each uniform is
// sent only when it changed. Flag off: uLinear 0 and begin() draws today's frame.
import { isOn, onChange } from './flags.js';
import { advLight } from './advlight.js';   // W8-LIGHT: nothing here runs with Advanced lighting off
import { gradeLight, srgbToLinear3 } from '../../core/shaders/light.js';
import { gradeUniforms } from '../../core/shaders/tonemap.js';

let R = null, listening = false;
const fogL = new Float32Array(3);
const lightOut = { sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3), exposure: 1 };
const input = { sky: null, ground: null, sun: null, lightDir: null };
const U = { exposure: 1, sat: 1, contrast: 0, warm: 0, lift: 0 };
const last = { exposure: NaN, sat: NaN, contrast: NaN, warm: NaN, lift: NaN, fast: NaN };
const lift3 = new Float32Array(3);
const ok = (r) => r && typeof r.uniform === 'function' && !r.isPrototype && advLight();

function sendFlag() {
  if (!ok(R)) return;
  R.uniform('uLinear', isOn('linear') ? 1 : 0);
  for (const k in last) last[k] = NaN;
}

export function init(G, r) {
  R = r;
  sendFlag();
  if (!listening) { listening = true; onChange(() => sendFlag()); }
}
export function tick(dt) {}
export function draw(r, G) {
  if (!ok(r) || !G.env) return;
  const env = G.env;
  srgbToLinear3(env.fog, fogL);
  r.uniform('uFogColor', fogL);
  input.sky = env.ambSky || env.sky; input.ground = env.ambGround || env.ground;
  input.sun = env.sun; input.lightDir = env.lightDir;
  gradeLight(input, lightOut);
  if (env.ambSky) {   // the timecycle split the world's ambient from the dome zenith
    r.uniform('uSky', lightOut.sky); r.uniform('uGround', lightOut.ground); r.uniform('uSun', lightOut.sun);
  }
  gradeUniforms(env, lightOut, U);
  if (U.exposure !== last.exposure) r.uniform('uExposure', (last.exposure = U.exposure));
  if (U.sat !== last.sat) r.uniform('uSat', (last.sat = U.sat));
  if (U.contrast !== last.contrast) r.uniform('uContrast', (last.contrast = U.contrast));
  if (U.warm !== last.warm) r.uniform('uWarmth', (last.warm = U.warm));
  // Wave 7 cut 8: the fitted sRGB encode on low and medium, exact on high.
  const fast = G.quality === 'high' ? 0 : 1;
  if (fast !== last.fast) r.uniform('uToneFast', (last.fast = fast));
  if (U.lift !== last.lift) { last.lift = U.lift; lift3[0] = lift3[1] = lift3[2] = U.lift; r.uniform('uLift', lift3); }
}
