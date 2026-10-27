// Sky dome + a thin cloud layer. Pure geometry; the colours come from the
// environment at draw time, so day/dusk/night blends need no rebuild.
//
// API (main.js):
//   import { buildSky, skyOpts, cloudOpts } from './game/sky.js';
//   const sky = buildSky(r);                 // once: { mesh, clouds }
//   // Each frame, FIRST thing after r.begin(), with a model matrix that is a pure
//   // translation to the camera position (the dome rides with the eye):
//   r.draw(sky.mesh,   modelAtCamera, skyOpts(env));    // gl.js turns depth writes
//                                                      // + culling off for this draw
//   r.draw(sky.clouds, cloudModel(mm, camPos, r.time), cloudOpts(env));
//                                                      // optional; alpha < 1 so the
//                                                      // renderer defers it to r.end()
//
//   skyOpts(env)   -> { sky: true, skyLo: env.fog, skyHi: env.sky }
//   cloudModel(out, camPos, seconds) -> the cloud layer's model matrix; it rides
//                                       with the eye and turns slowly (W8)
//   cloudOpts(env) -> { alpha, unlit: true, fogMul, colorMul }  (tinted by env.sun/sky)
//
// The dome is an inverted hemisphere; vertex colour .r holds the horizon->zenith
// blend (0 at/below the horizon, 1 straight up) which the shader's sky mode
// turns into mix(skyLo, skyHi, r) plus a sun disc along env.lightDir.
import { MeshBuilder } from '../core/mesh.js';
import { m4, mulberry32 } from '../core/math.js';
// S5-LIGHT (V1-03): the per-pixel sky's uniforms, flag `sky2` (the puffs go).
import { isOn, onChange } from './look/flags.js';
import { nightAmount } from './world/headlights.js';
import { SKY_K } from '../core/shaders/sky.js';
import { srgbToLinear3 } from '../core/shaders/light.js';
import { advLight } from './look/advlight.js';   // W8-LIGHT: Advanced lighting off keeps the puffs and today's sky

const RADIUS = 2800;
const SEGS = 16;      // around
const RINGS = 6;      // horizon -> zenith
const CLOUDS = 28;
const MIN_ELEV = Math.tan(20 * Math.PI / 180);   // clouds stay 20° off the horizon
const WIND = 0.0022;  // rad/s — a puff 1.5 km out drifts at about 12 km/h

// Push a triangle so that its face normal points along `dir` (dot > 0), whatever
// order the corners came in. Keeps the dome inward-facing without winding maths.
function triFacing(b, ia, ib, ic, dir) {
  const v = b.v, S = 9;
  const ax = v[ia * S], ay = v[ia * S + 1], az = v[ia * S + 2];
  const ux = v[ib * S] - ax, uy = v[ib * S + 1] - ay, uz = v[ib * S + 2] - az;
  const wx = v[ic * S] - ax, wy = v[ic * S + 1] - ay, wz = v[ic * S + 2] - az;
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  if (nx * dir[0] + ny * dir[1] + nz * dir[2] >= 0) b.tri(ia, ib, ic); else b.tri(ia, ic, ib);
}

export function buildSky(renderer) {
  const b = new MeshBuilder();
  const up = [0, 1, 0];
  // Rings start slightly below the horizon so pitching the camera down never shows
  // the rim; they are packed tighter near the horizon where the gradient lives.
  const ringIdx = [];
  for (let k = 0; k < RINGS; k++) {
    const e = (-6 + 96 * Math.pow(k / RINGS, 1.4)) * Math.PI / 180;
    const y = RADIUS * Math.sin(e), rr = RADIUS * Math.cos(e);
    const t = Math.pow(Math.max(0, Math.min(1, y / RADIUS)), 0.6);
    const col = [t, t, t];
    const row = [];
    for (let i = 0; i < SEGS; i++) {
      const a = (i / SEGS) * Math.PI * 2;
      row.push(b.vert(Math.cos(a) * rr, y, Math.sin(a) * rr, up[0], up[1], up[2], col));
    }
    ringIdx.push(row);
  }
  const apex = b.vert(0, RADIUS, 0, 0, 1, 0, [1, 1, 1]);
  const bottomY = RADIUS * Math.sin(-6 * Math.PI / 180);
  const bottom = b.vert(0, bottomY, 0, 0, 1, 0, [0, 0, 0]);

  const inward = (ia) => [-b.v[ia * 9], -b.v[ia * 9 + 1], -b.v[ia * 9 + 2]];
  for (let k = 0; k < RINGS; k++) {
    const lo = ringIdx[k], hi = k + 1 < RINGS ? ringIdx[k + 1] : null;
    for (let i = 0; i < SEGS; i++) {
      const j = (i + 1) % SEGS;
      const dir = inward(lo[i]);
      if (hi) {
        triFacing(b, lo[i], lo[j], hi[j], dir);
        triFacing(b, lo[i], hi[j], hi[i], dir);
      } else {
        triFacing(b, lo[i], lo[j], apex, dir);
      }
    }
  }
  // flat disc under the rim: hides the edge when looking down over the river
  for (let i = 0; i < SEGS; i++) {
    const j = (i + 1) % SEGS;
    triFacing(b, bottom, ringIdx[0][i], ringIdx[0][j], up);
  }
  const mesh = renderer.upload(b);

  // Clouds: a few dozen flat, overlapping octagons well above the town. Three
  // stacked fans per cloud so the overlap builds a denser core (alpha is uniform).
  const cb = new MeshBuilder();
  const rnd = mulberry32(0xc10d);
  const down = [0, -1, 0];
  function puff(cx, cy, cz, r, shade) {
    const col = [shade, shade, shade];
    const c0 = cb.vert(cx, cy, cz, 0, -1, 0, col);
    const ring = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, rr = r * (0.85 + rnd() * 0.3);
      ring.push(cb.vert(cx + Math.cos(a) * rr, cy, cz + Math.sin(a) * rr, 0, -1, 0, col));
    }
    for (let i = 0; i < 8; i++) triFacing(cb, c0, ring[i], ring[(i + 1) % 8], down);
  }
  for (let n = 0; n < CLOUDS; n++) {
    const a = rnd() * Math.PI * 2, d = 400 + rnd() * 1700;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    // Never let a puff sit within MIN_ELEV of the horizon: the discs face down,
    // so one that grazes the skyline shows as a hard grey line on the rim.
    const cy = Math.max(720 + rnd() * 160, d * MIN_ELEV);
    const r = 90 + rnd() * 170, sh = 0.94 + rnd() * 0.06;
    puff(cx, cy, cz, r, sh);
    puff(cx + (rnd() - 0.5) * r, cy + 1, cz + (rnd() - 0.5) * r * 0.6, r * 0.7, sh);
    puff(cx + (rnd() - 0.5) * r, cy + 2, cz + (rnd() - 0.5) * r * 0.6, r * 0.5, 1.0);
  }
  const clouds = renderer.upload(cb);

  // S5-LIGHT: with sky2 on the deck is in the shader; main.js still issues its
  // clouds draw, which becomes a 0-triangle draw (same draw count).
  const puffs = clouds;
  const empty = { vao: puffs.vao, count: 0, min: puffs.min, max: puffs.max };
  const sky2 = () => advLight() && isOn('sky2');
  const out = { mesh, clouds: sky2() ? empty : puffs };
  R = renderer;
  autoOct = renderer && renderer.scale < 0.75 ? 1 : 2;
  if (!listening) { listening = true; onChange(() => { if (SKY) SKY.clouds = advLight() && isOn('sky2') ? SKY.empty : SKY.puffs; }); }
  SKY = Object.assign(out, { puffs, empty });
  return out;
}

// ---------------------------------------------------------------- S5-LIGHT sky state
let R = null, SKY = null, listening = false;
const OPTS = { sky: true, skyLo: null, skyHi: null };
// Parliament Hill as the game places it (ottawa.js), the town glow's bearing.
export const GLOW_AT = [10668, -3330];
const S = { cfg: new Float32Array(4), look: new Float32Array(4), lit: new Float32Array(3), shade: new Float32Array(3),
  glow: new Float32Array(4), glowCol: new Float32Array(3) };
const lum709 = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
let tierOctaves = null, autoOct = 2;   // octaves: low 1, med 2, high 3 (setSkyTier, else G.quality); before either, the render scale decides
export function setSkyTier(tier) { tierOctaves = tier === 'low' ? 1 : (tier === 'high' ? 3 : 2); }
const octOfQuality = (q) => (q === 'low' ? 1 : q === 'high' ? 3 : q === 'med' ? 2 : null);
// { cover, cirrus }: the timecycle's fields, else the weather's darkness, else a fair day.
const COVER_P = [[0, 0.2], [0.05, 0.2], [0.16, 0.5], [0.42, 0.95], [0.55, 1], [1, 1]];
const CV = { cover: 0.2, cirrus: 0.6 };
export function coverOf(env, weather, out = CV) {
  if (env && env.cloud !== undefined) { out.cover = env.cloud; out.cirrus = env.cirrus ?? 0.6; return out; }
  if (weather && Number.isFinite(weather.dark)) {
    const d = weather.dark, P = COVER_P;
    let c = 1;
    for (let i = 0; i < P.length - 1; i++) if (d <= P[i + 1][0]) { c = P[i][1] + (P[i + 1][1] - P[i][1]) * (d - P[i][0]) / (P[i + 1][0] - P[i][0]); break; }
    const t = Math.min(1, Math.max(0, (d - 0.1) / 0.3));
    out.cover = c; out.cirrus = 0.6 * (1 - t * t * (3 - 2 * t)); return out;
  }
  out.cover = 0.2; out.cirrus = 0.6; return out;
}
// Pure: every sky uniform for this env, time and eye.
export function skyState(env, time, eye, weather, out = S) {
  const cv = coverOf(env, weather);
  const oct = tierOctaves ?? octOfQuality(globalThis.AYLMER?.G?.quality) ?? autoOct;
  // Wave 7 cut 7: cirrus on high only (medium is the 60 fps floor on the Air).
  out.cfg[0] = 1; out.cfg[1] = cv.cover; out.cfg[2] = oct >= 3 ? cv.cirrus : 0; out.cfg[3] = oct;
  const night = nightAmount(env);
  out.look[0] = night;
  out.look[1] = Math.min(1, Math.max(0, (env.fogDensity - 0.0016) / 0.004));
  const w = (time || 0) * 0.0087;
  out.look[2] = w * SKY_K.windDir[0]; out.look[3] = w * SKY_K.windDir[1];
  const fog = env.fog, sky = env.sky, sun = env.sun, wet = weather?.wet ?? 0;
  const g = (lum709(sky) + lum709(fog)) * 0.5;
  for (let i = 0; i < 3; i++) {
    out.shade[i] = (fog[i] * 0.78 * 0.6 + g * 0.4) * (1 - 0.25 * wet);
    out.lit[i] = fog[i] * 1.05 + sun[i] * 0.35 * (1 - 0.7 * wet);
  }
  const ex = eye ? eye[0] : 0, ez = eye ? eye[2] : 0;
  const gx = GLOW_AT[0] - ex, gz = GLOW_AT[1] - ez;
  const d = Math.sqrt(gx * gx + gz * gz) || 1;
  const fade = Math.min(1, Math.max(0, (d - 5000) / 3000));
  out.glow[0] = gx / d; out.glow[1] = 0; out.glow[2] = gz / d; out.glow[3] = night * (1 + 1.2 * cv.cover) * (fade * fade * (3 - 2 * fade));
  const tg = env.townGlow;
  if (tg && (tg[0] + tg[1] + tg[2]) > 0.001) { out.glowCol[0] = tg[0]; out.glowCol[1] = tg[1]; out.glowCol[2] = tg[2]; }
  else { out.glowCol[0] = 0.23; out.glowCol[1] = 0.16; out.glowCol[2] = 0.12; }
  return out;
}

// Wave 7 folds (shaders/sky.js): per-frame constants the sky, fog and
// reflections used to rebuild per pixel. Pure; the arrays are reused.
const F = { L: new Float32Array(4), f0: new Float32Array(4), f1: new Float32Array(4), gk: new Float32Array(3),
  gkLin: new Float32Array(3), loLin: new Float32Array(3), hiLin: new Float32Array(3), hLin: new Float32Array(3), h: new Float32Array(3) };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// The sun direction, unit, and the low-sun weight; the sky colours decoded.
export function skyBase(env, out = F) {
  const d = env.lightDir, l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
  out.L[0] = d[0] / l; out.L[1] = d[1] / l; out.L[2] = d[2] / l;
  out.L[3] = 1 - smooth(0.05, 0.35, out.L[1]);
  srgbToLinear3(env.fog, out.loLin); srgbToLinear3(env.sky, out.hiLin);
  return out;
}
// The rest, from skyState's output (st): H, gradient exponent, glow and anti-sun scales, town glow.
export function skyFolds(env, st, out = F) {
  const lo = env.fog, hi = env.sky, ll = lum709(lo);
  for (let i = 0; i < 3; i++) out.h[i] = out.f0[i] = (lo[i] + (ll - lo[i]) * 0.25) * 1.06;
  const warmLo = smooth(0.4, 0.8, (lo[0] - lo[2]) - (hi[0] - hi[2]));
  out.f0[3] = SKY_K.gradPow + (0.30 - SKY_K.gradPow) * warmLo;
  const low = out.L[3], day = 1 - st.look[0];
  out.f1[0] = (1 + 0.8 * low) * (0.25 + 0.75 * day);
  out.f1[1] = 0.14 * low * day;
  const al = Math.sqrt(out.L[0] * out.L[0] + out.L[2] * out.L[2]);
  if (al > 1e-4) { out.f1[2] = out.L[0] / al; out.f1[3] = out.L[2] / al; } else { out.f1[2] = 1; out.f1[3] = 0; }
  for (let i = 0; i < 3; i++) out.gk[i] = st.glowCol[i] * 0.5 * st.glow[3];
  srgbToLinear3(out.gk, out.gkLin); srgbToLinear3(out.h, out.hLin);
  return out;
}

const cfgOff = new Float32Array([0, 0, 0, 2]);
const aerialV = { on: -1 };
export function skyOpts(env) {
  OPTS.skyLo = env.fog; OPTS.skyHi = env.sky;
  if (!R || typeof R.uniform !== 'function' || R.isPrototype || !advLight()) return OPTS;
  // V1-04's fog reads the same horizon: its switch rides along here (one uniform when it flips).
  const a = isOn('aerial') ? 1 : 0;
  if (a !== aerialV.on) { aerialV.on = a; R.uniform('uAerial', a); }
  // The fog and the reflections read these with sky2 on or off.
  skyBase(env, F);
  R.uniform('uSkyL', F.L); R.uniform('uSkyLoLin', F.loLin); R.uniform('uSkyHiLin', F.hiLin);
  if (!isOn('sky2')) { R.uniform('uSkyCfg', cfgOff); return OPTS; }
  skyState(env, R.time, R.eye, globalThis.AYLMER?.G?.weather, S);
  skyFolds(env, S, F);
  R.uniform('uSkyFold0', F.f0); R.uniform('uSkyFold1', F.f1); R.uniform('uSkyGlowK', F.gk);
  R.uniform('uSkyGlowKLin', F.gkLin); R.uniform('uSkyHLin', F.hLin);
  R.uniform('uSkyCfg', S.cfg); R.uniform('uSkyLook', S.look);
  R.uniform('uCloudLit', S.lit); R.uniform('uCloudShade', S.shade);
  R.uniform('uSkyGlow', S.glow); R.uniform('uSkyGlowCol', S.glowCol);
  return OPTS;
}

// Model matrix for the cloud layer: it rides with the eye like the dome, but
// turns slowly so the sky is never the same twice. Rotating (rather than
// sliding) keeps every puff at the elevation it was built at, so none of them
// can wander down to the horizon. (W8)
export function cloudModel(out, camPos, time) {
  return m4.compose(out, camPos[0], 0, camPos[2], time * WIND, 0, 0);
}

// Clouds are unlit white, dimmed by how bright the sky is (night -> dark grey)
// and tinted a little by the sun colour (dusk -> pink). Near-zero fogMul keeps
// the far ones from dissolving into the horizon.
export function cloudOpts(env) {
  const s = env.sky, sun = env.sun;
  const lum = 0.30 * s[0] + 0.59 * s[1] + 0.11 * s[2];
  const k = Math.max(0, Math.min(1, lum * 1.7));
  return {
    // `clouds` lets a renderer with its own sky (the lit prototype draws
    // cumulus in its sky shader) skip this layer.
    alpha: 0.42, unlit: true, fogMul: 0.02, clouds: true,
    colorMul: [k * (0.7 + 0.3 * sun[0]), k * (0.7 + 0.3 * sun[1]), k * (0.7 + 0.3 * sun[2])],
  };
}
