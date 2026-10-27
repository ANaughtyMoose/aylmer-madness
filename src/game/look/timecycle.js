// The colour script as data (assets/look/timecycle.json): task V1-02, look flag `timecycle`.
// S5-LIGHT (20 Oct), the smallest version that stands alone:
//   - one table of clear-sky rows by hour (9 keys) drives sky, fog, the sun's
//     colour, the world's ambient (ambSky / ambGround, split from the dome
//     zenith) and the cloud cover the sky reads;
//   - the sun's DIRECTION comes from the real solar path over Aylmer (45.40 N,
//     75.85 W, EDT) on the game's date, so at 19:30 the light is low, warm and
//     from the west-north-west; noon keeps the shipped direction (the 13:00 row
//     overrides it) so every noon frame is the one the game ships;
//   - the weather leans the DAY rows exactly as weather.tintEnv always did,
//     and each weather has its own NIGHT colours (navy, never the daytime storm
//     grey that made night rain a grey fog), blended by how much day there is.
// envcycle.js samples it on the fixed step (sample() allocates nothing); the
// legacy four-phase cycle stays the flag-off path and the prototype's path.
import { lerp } from '../../core/math.js';
import { isOn } from './flags.js';
import { gradeLight } from '../../core/shaders/light.js';

export let TABLE = null;

const hex = (s) => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
const col = (v) => (typeof v === 'string' ? hex(v) : v.slice());
const hourOf = (k) => { const [h, m] = k.split(':').map(Number); return h + m / 60; };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const COLS = ['skyTop', 'fog', 'sun', 'ambSky', 'ambGround', 'townGlow'];
const NUMS = ['sunInt', 'fogDensity', 'cloud', 'cirrus'];

// Parse once: rows as flat float records, keyed hours (01:00 wraps as 25).
export function load(json) {
  const keys = json.keys.map((k) => ({ k, h: hourOf(k) }));
  for (const q of keys) if (q.h < 3) q.h += 24;
  const rows = keys.map(({ k, h }) => {
    const r = json.rows[k], o = { h, ease: json.ease?.[k] || 'smooth', lightDir: r.lightDir ? r.lightDir.slice() : null };
    for (const c of COLS) o[c] = col(r[c] ?? r.skyTop);
    for (const n of NUMS) o[n] = r[n] ?? 0;
    return o;
  });
  const noon = rows.find((r) => r.lightDir) || rows[3];
  const night = {};
  for (const [w, ov] of Object.entries(json.night || {})) {
    if (w === 'note') continue;
    const o = {};
    for (const [f, v] of Object.entries(ov)) o[f] = COLS.includes(f) ? col(v) : v;
    night[w] = o;
  }
  const hold = json.hold?.['13:00'] || [11.5, 14];
  TABLE = { rows, noon, hold, pins: json.pins || {}, moon: json.moon || { az: 160, el: 35 }, night,
    noonSkyLum: lum(noon.skyTop), checks: json.checks || {} };
  return TABLE;
}

// The env object the sampler fills (one per G.envTarget, reused forever).
export function makeEnv() {
  const v3 = () => [0, 0, 0];
  return { sky: v3(), ground: v3(), sun: v3(), lightDir: [0, 1, 0], fog: v3(), fogDensity: 0.001,
    ambSky: v3(), ambGround: v3(), townGlow: v3(), cloud: 0, cirrus: 0, hour: 12 };
}

// ---------------------------------------------------------------- the sun
// Real solar position for the game's date: N = day of year (2004: 22 June is
// day 174, G.day 0). Returns a unit vector toward the sun, x east, y up, z south.
const D2R = Math.PI / 180;
export function sunDir(hour, dayIndex, out = [0, 0, 0]) {
  const N = 174 + (Number.isFinite(dayIndex) ? dayIndex : 23);
  const decl = 23.44 * Math.sin(2 * Math.PI * (284 + N) / 365) * D2R;
  const B = 2 * Math.PI * (N - 81) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);   // minutes
  const solar = hour - 1 - (75.85 - 75) * 4 / 60 + eot / 60;                     // EDT, longitude
  const H = 15 * (solar - 12) * D2R, lat = 45.40 * D2R;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const cosAz = (Math.sin(decl) - Math.sin(el) * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (H > 0) az = 2 * Math.PI - az;
  out[0] = Math.sin(az) * Math.cos(el); out[1] = Math.sin(el); out[2] = -Math.cos(az) * Math.cos(el);
  return out;
}

export function pinHourFor(key, def) {
  if (def && Number.isFinite(def.hour)) return def.hour;
  return TABLE?.pins?.[key] ?? 13;
}

// ---------------------------------------------------------------- sample
// smooth by default; late t^3 (slow start), later t^4 (the small hours stay dark), early 1-(1-t)^3.
const ease = (t, kind) => (kind === 'late' ? t * t * t : kind === 'later' ? t * t * t * t : kind === 'early' ? 1 - (1 - t) ** 3 : t * t * (3 - 2 * t));
const SD = [0, 0, 0], MD = [0, 0, 0], DA = [0, 0, 0], DB = [0, 0, 0];
const rowScratch = () => { const o = { lightDir: [0, 1, 0], hour: 12 }; for (const c of COLS) o[c] = [0, 0, 0]; for (const n of NUMS) o[n] = 0; return o; };
const DAY = rowScratch(), NA = rowScratch(), NB = rowScratch();

function clearAt(hour, day, out) {
  const T = TABLE, rows = T.rows;
  let h = hour < 3 ? hour + 24 : hour;
  let a, b, t;
  if (h >= T.hold[0] && h <= T.hold[1]) { a = b = T.noon; t = 0; }
  else {
    let i = rows.length - 1;
    for (let j = 0; j < rows.length - 1; j++) if (h >= rows[j].h && h < rows[j + 1].h) { i = j; break; }
    a = rows[i]; b = rows[(i + 1) % rows.length];
    let h0 = a.h, h1 = b.h;
    if (a.lightDir) h0 = T.hold[1];          // the 13:00 row is held to 14:00
    if (b.lightDir) h1 = T.hold[0];          // ...and from 11:30
    if (h1 <= h0) h1 += 24;
    if (h < h0) h += 24;
    t = ease(Math.min(1, Math.max(0, (h - h0) / (h1 - h0))), a.ease);
  }
  for (const c of COLS) for (let n = 0; n < 3; n++) out[c][n] = lerp(a[c][n], b[c][n], t);
  for (const k of NUMS) out[k] = lerp(a[k], b[k], t);
  // Direction: a row's override (13:00), else the real sun now; then the moon.
  sunDir(hour, day, SD);
  const la = a.lightDir || SD, lb = b.lightDir || SD;
  for (let n = 0; n < 3; n++) out.lightDir[n] = lerp(la[n], lb[n], t);
  const el = Math.asin(Math.max(-1, Math.min(1, SD[1]))) / D2R;
  if (el < 2) {
    const m = T.moon, az = m.az * D2R, me = m.el * D2R;
    MD[0] = Math.sin(az) * Math.cos(me); MD[1] = Math.sin(me); MD[2] = -Math.cos(az) * Math.cos(me);
    const k = Math.min(1, (2 - el) / 8);
    for (let n = 0; n < 3; n++) out.lightDir[n] = lerp(out.lightDir[n], MD[n], k);
  }
  const L = Math.hypot(out.lightDir[0], out.lightDir[1], out.lightDir[2]) || 1;
  for (let n = 0; n < 3; n++) out.lightDir[n] /= L;
  if (out.lightDir[1] < 0.10) {
    out.lightDir[1] = 0.10;
    const s = Math.hypot(out.lightDir[0], out.lightDir[2]) || 1, f = Math.sqrt(1 - 0.01) / s;
    out.lightDir[0] *= f; out.lightDir[2] *= f;
  }
  out.hour = hour;
  return out;
}

function nightFor(base, w, out) {
  const ov = TABLE.night[w] || {};
  for (const c of COLS) { const v = ov[c] || base[c]; for (let n = 0; n < 3; n++) out[c][n] = v[n]; }
  for (const k of NUMS) out[k] = ov[k] ?? base[k];
  return out;
}

// hour: the game clock's hour; day: G.day; weather: the live Weather (its
// state, next, blend and tintEnv); out: from makeEnv(). No allocation.
export function sample(hour, day, weather, out) {
  clearAt(hour, day, DAY);
  const w = Math.min(1, (lum(DAY.skyTop) / TABLE.noonSkyLum) ** 2);
  // Day: the clear row leaned by the weather exactly as tintEnv does.
  for (let n = 0; n < 3; n++) {
    out.sky[n] = DAY.skyTop[n]; out.fog[n] = DAY.fog[n]; out.ground[n] = DAY.ambGround[n];
    out.sun[n] = DAY.sun[n] * DAY.sunInt; out.lightDir[n] = DAY.lightDir[n];
  }
  out.fogDensity = DAY.fogDensity;
  if (weather && weather.tintEnv) weather.tintEnv(out);
  // The weather's change to the sky and ground carries over to the ambient.
  for (let n = 0; n < 3; n++) {
    DA[n] = DAY.ambSky[n] * (DAY.skyTop[n] > 1e-4 ? out.sky[n] / DAY.skyTop[n] : 1);
    DB[n] = DAY.ambGround[n] * (DAY.ambGround[n] > 1e-4 ? out.ground[n] / DAY.ambGround[n] : 1);
  }
  // Night: this weather's own colours (state and next, blended as the weather blends).
  const a = weather?.state || 'clear', b = weather?.next || a, bl = weather ? weather.blend : 1;
  const k = bl * bl * (3 - 2 * bl);
  nightFor(DAY, a, NA); nightFor(DAY, b, NB);
  const wet = weather?.wet || 0;
  for (let n = 0; n < 3; n++) {
    const nSky = lerp(NA.skyTop[n], NB.skyTop[n], k), nFog = lerp(NA.fog[n], NB.fog[n], k);
    const nAmbS = lerp(NA.ambSky[n], NB.ambSky[n], k), nAmbG = lerp(NA.ambGround[n], NB.ambGround[n], k) * (1 - 0.38 * wet);
    const nSun = lerp(NA.sun[n] * NA.sunInt, NB.sun[n] * NB.sunInt, k);
    out.sky[n] = lerp(nSky, out.sky[n], w);
    out.fog[n] = lerp(nFog, out.fog[n], w);
    out.sun[n] = lerp(nSun, out.sun[n], w);
    out.ambSky[n] = lerp(nAmbS, DA[n], w);
    out.ambGround[n] = lerp(nAmbG, DB[n], w);
    out.ground[n] = out.ambGround[n];
    out.townGlow[n] = lerp(lerp(NA.townGlow[n], NB.townGlow[n], k), DAY.townGlow[n], w);
  }
  out.fogDensity = lerp(lerp(NA.fogDensity, NB.fogDensity, k), out.fogDensity, w);
  out.cloud = lerp(lerp(NA.cloud, NB.cloud, k), coverDay(weather, DAY.cloud), w);
  out.cirrus = lerp(lerp(NA.cirrus, NB.cirrus, k), DAY.cirrus * (1 - Math.min(1, (weather?.dark || 0) / 0.4)), w);
  out.hour = hour;
  return out;
}
// Day cover: the clear row's cumulus, closed by the weather's darkness.
// One table, patched per call (it ran on the fixed step and allocated 7 arrays a
// sample: the VM's no-allocation check caught it, 27 Oct).
const COVER_PTS = [[0, 0], [0.05, 0.15], [0.16, 0.50], [0.42, 0.95], [0.55, 1.0], [1, 1]];
function coverDay(weather, clearCover) {
  const d = weather?.dark || 0;
  const pts = COVER_PTS;
  pts[0][1] = clearCover; pts[1][1] = Math.max(clearCover, 0.15);
  for (let i = 0; i < pts.length - 1; i++) if (d <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], (d - pts[i][0]) / (pts[i + 1][0] - pts[i][0]));
  return 1;
}

// look/frame.js hooks: the sampling lives in envcycle on the fixed step, and
// look/grade.js sends the published ambient (env.ambSky, env.ambGround).
// With look flag `linear` off, this sends the table's ambient itself.
export function init(G, r) {}
export function tick(dt) {}
const gIn = { sky: null, ground: null, sun: null, lightDir: null };
const gOut = { sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3), exposure: 1 };
export function draw(r, G) {
  const e = G.env;
  if (isOn('linear') || !e || !e.ambSky || !r || typeof r.uniform !== 'function' || r.isPrototype) return;
  gIn.sky = e.ambSky; gIn.ground = e.ambGround; gIn.sun = e.sun; gIn.lightDir = e.lightDir;
  gradeLight(gIn, gOut);
  r.uniform('uSky', gOut.sky); r.uniform('uGround', gOut.ground); r.uniform('uSun', gOut.sun);
}
