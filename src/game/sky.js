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

  return { mesh, clouds };
}

export function skyOpts(env) {
  return { sky: true, skyLo: env.fog, skyHi: env.sky };
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
    alpha: 0.42, unlit: true, fogMul: 0.02,
    colorMul: [k * (0.7 + 0.3 * sun[0]), k * (0.7 + 0.3 * sun[1]), k * (0.7 + 0.3 * sun[2])],
  };
}
