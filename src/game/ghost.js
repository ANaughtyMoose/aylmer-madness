// [w7-replay] The ghost of your best run (spec C-11, cut to its core).
//
// On every Blitz and Checkpoint course, and the solo story Blitz, the best run
// on this computer comes back as a pale, medal-tinted truck that leaves the
// line with you. Recorded at 20 Hz from GO to the line, kept in memory (so R
// races it at once) and saved through save.js saveGhost, deferred off the
// driving frame. No collision, no shadow, no sound; it fades out near you.
//
// main.js calls update(G) once per sub-step after updateMission, draw(r, G,
// specFor) once per frame with the rivals, and finishLine(G, m, en) for the
// end card. Duck-typed on def.mode / def.course / m.race: this file imports
// neither modes.js, racejobs.js nor race.js (the import cycle).
import * as save from './save.js';
import { m4 } from '../core/math.js';

export const GHOST_HZ = 20;
export const STRIDE = 7;                 // x, y, z, yaw (unwrapped), pitch, roll, steer
export const MAX_REC_S = 900;
export const DOWNSAMPLE_OVER_S = 240;    // longer runs save at 10 Hz (C-02b budget)
export const TELEPORT_M = 25;
export const ALPHA = 0.34;
export const NEAR_IN = 2.5, NEAR_FULL = 7.0;
export const HOLD_S = 1.5, FADE_S = 0.6;
export const DRAW_DIST = 400;
export const TINT = {
  or: [1.09, 0.87, 0.36], argent: [0.90, 0.94, 0.98], bronze: [0.91, 0.62, 0.33], none: [0.71, 0.97, 1.15],
};
const ID_RE = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i;

/** The ghost id for a mission def, or null. */
export function ghostIdFor(def) {
  if (!def) return null;
  let id = null;
  const kind = def.course && def.course.kind;
  if ((def.mode === 'blitz' || def.mode === 'checkpoint' || kind === 'blitz' || kind === 'checkpoint') && def.course) id = def.course.id;
  else if (def.race && def.id === 'blitz') id = 'blitz';
  return id && ID_RE.test(id) ? id : null;
}

const cache = new Map();                 // id -> prepared ghost
const rec = { m: null, id: null, buf: null, n: 0, nextT: 0, prev: new Float64Array(8), yawU: 0, lastYaw: 0,
  cuts: [], tooLong: false, car: '', by: '', started: false };
const play = { id: null, g: null };
export const last = { save: null, finish: null };
const P = new Float64Array(8);           // current pose scratch: t, x, y, z, yaw, pitch, roll, steer
const S = new Float64Array(8);           // sample scratch
const MM = new Float32Array(16);
const BODY = { alpha: 1, unlit: true, colorMul: TINT.none };
const WHEEL = { alpha: 1, unlit: true, colorMul: TINT.none };
let enabled = true;
export function setGhostEnabled(on) { enabled = !!on; }
export function resetGhost() { cache.clear(); rec.m = null; rec.buf = null; play.id = null; play.g = null; }

const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

/** Prepare a stored ghost for playback: cuts as a Set, path length per sample. */
export function prep(g) {
  if (!g || !g.frames || !(g.hz > 0) || g.stride !== STRIDE) return null;
  const n = g.frames.length / STRIDE;
  const dist = new Float32Array(n);
  const f = g.frames;
  for (let i = 1; i < n; i++) {
    const a = (i - 1) * STRIDE, b = i * STRIDE;
    dist[i] = dist[i - 1] + Math.hypot(f[b] - f[a], f[b + 2] - f[a + 2]);
  }
  const cuts = new Set(String((g.meta && g.meta.cuts) || '').split(',').filter(Boolean).map(Number));
  const medal = (g.meta && g.meta.medal) || '';
  return { hz: g.hz, frames: f, n, t: g.t, car: g.car || 'ranger', by: g.by || '', medal, cuts, dist };
}

function poseOf(G, t) {
  const v = G.veh;
  P[0] = t; P[1] = v.x; P[2] = v.bodyY != null ? v.bodyY : (v.y || 0); P[3] = v.z;
  rec.yawU += wrapPi(v.yaw - rec.lastYaw); rec.lastYaw = v.yaw;
  P[4] = rec.yawU; P[5] = v.pitch || 0; P[6] = v.roll || 0; P[7] = v.steer || 0;
}
function write(src, k0) {
  if (rec.n * STRIDE + STRIDE > rec.buf.length) {
    const cap = Math.min(rec.buf.length * 2, GHOST_HZ * MAX_REC_S * STRIDE + STRIDE);
    if (cap <= rec.buf.length) { rec.tooLong = true; return; }
    const nb = new Float32Array(cap); nb.set(rec.buf); rec.buf = nb;
  }
  const o = rec.n * STRIDE;
  for (let k = 0; k < STRIDE; k++) rec.buf[o + k] = src[k0 + k];
  rec.n++;
}
function sampleBetween(t) {
  // Linear between the previous update and now, at grid time t.
  const a = rec.prev, span = P[0] - a[0];
  const s = span > 1e-9 ? (t - a[0]) / span : 1;
  for (let k = 1; k < 8; k++) S[k] = a[k] + (P[k] - a[k]) * s;
  write(S, 1);
}

/** Once per sub-step, right after updateMission. */
export function update(G) {
  const m = G.mission;
  if (rec.m && m !== rec.m) {
    const old = rec.m;
    if (old.idx >= old.stages.length && rec.n > 0 && !rec.tooLong) finish(G, old);
    rec.m = null; rec.buf = null; rec.n = 0; play.id = null; play.g = null;
  }
  if (!m || rec.m === m) { if (m && rec.m === m) record(G, m); return; }
  const id = ghostIdFor(m.def);
  if (!id) return;
  rec.m = m; rec.id = id; rec.n = 0; rec.buf = null; rec.cuts = []; rec.tooLong = false; rec.started = false;
  rec.car = G.veh && G.veh.spec ? G.veh.spec.id : ''; rec.by = G.character || '';
  load(id);
}
function record(G, m) {
  const R = m.race;
  if (!R || !R.going || rec.tooLong || !G.veh) return;
  if (!rec.started) {
    rec.started = true;
    rec.buf = new Float32Array(GHOST_HZ * 180 * STRIDE);
    rec.yawU = G.veh.yaw; rec.lastYaw = G.veh.yaw;
    poseOf(G, 0);
    write(P, 1);
    rec.prev.set(P); rec.nextT = 1 / GHOST_HZ;
    return;
  }
  if (R.t > MAX_REC_S) { rec.tooLong = true; return; }
  poseOf(G, R.t);
  if (Math.hypot(P[1] - rec.prev[1], P[3] - rec.prev[3]) > TELEPORT_M) {
    // A reset, not driving: no interpolation across it.
    rec.cuts.push(rec.n);
    while (rec.nextT <= R.t) { write(P, 1); rec.nextT += 1 / GHOST_HZ; }
  } else {
    while (rec.nextT <= R.t) { sampleBetween(rec.nextT); rec.nextT += 1 / GHOST_HZ; }
  }
  rec.prev.set(P);
}
function finish(G, m) {
  const t = m.race && m.race.t;
  if (!(t > 0) || !rec.buf) return;
  if (G.veh) poseOf(G, t);
  write(P, 1);                                  // the line itself, from the finishing pose
  let frames = rec.buf.subarray(0, rec.n * STRIDE), hz = GHOST_HZ, cuts = rec.cuts;
  if (t > DOWNSAMPLE_OVER_S) {
    const n = rec.n, keep = Math.floor((n - 1) / 2) + 1 + ((n - 1) % 2 ? 1 : 0);
    const out = new Float32Array(keep * STRIDE);
    let j = 0;
    for (let i = 0; i < n; i += 2) { out.set(frames.subarray(i * STRIDE, i * STRIDE + STRIDE), j * STRIDE); j++; }
    if ((n - 1) % 2) out.set(frames.subarray((n - 1) * STRIDE, n * STRIDE), j * STRIDE);
    frames = out; hz = GHOST_HZ / 2; cuts = cuts.map((i) => Math.ceil(i / 2));
  }
  rec.buf = null;
  const medal = (m.medal && m.medal.medal) || '';
  const ghost = { hz, stride: STRIDE, frames, t, car: rec.car, by: rec.by, meta: { v: 1, medal, cuts: cuts.join(',') } };
  const id = rec.id;
  const had = cache.get(id);
  last.finish = { id, t, prev: had ? had.t : null, by: had ? had.by : '' };
  if (!had || t < had.t) cache.set(id, prep(ghost));
  // Off the driving frame: the encode lands on the end card.
  const doSave = () => { last.save = save.saveGhost ? save.saveGhost(id, ghost, { better: 'lower' }) : { ok: false, reason: 'no-api' }; };
  if (typeof setTimeout === 'function') setTimeout(doSave, 0); else doSave();
}
function load(id) {
  if (cache.has(id)) { play.id = id; play.g = cache.get(id); return; }
  play.id = id; play.g = null;
  const go = () => {
    if (!cache.has(id)) cache.set(id, prep(save.loadGhost ? save.loadGhost(id) : null));
    if (play.id === id) play.g = cache.get(id);
  };
  if (typeof setTimeout === 'function') setTimeout(go, 0); else go();
}

/** Pose at run time tg into out (Catmull-Rom positions, linear angles). */
export function sampleAt(g, tg, out) {
  const n = g.n, f = g.frames;
  const u = Math.max(0, tg) * g.hz;
  let i = Math.floor(u), s = u - i;
  if (i >= n - 1) { i = n - 1; s = 0; }
  const j = Math.min(n - 1, i + 1);
  const cutNext = g.cuts.has(j);
  if (cutNext) { if (s >= 0.5) { i = j; } s = 0; }
  const h = i > 0 && !g.cuts.has(i) ? i - 1 : i;
  const k = j + 1 < n && !g.cuts.has(j + 1) ? j + 1 : j;
  const a = h * STRIDE, b = i * STRIDE, c = (cutNext ? i : j) * STRIDE, d = (cutNext ? i : k) * STRIDE;
  const s2 = s * s, s3 = s2 * s;
  for (let q = 0; q < 3; q++) {
    const p0 = f[a + q], p1 = f[b + q], p2 = f[c + q], p3 = f[d + q];
    out[q] = 0.5 * (2 * p1 + (p2 - p0) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (3 * p1 - p0 - 3 * p2 + p3) * s3);
  }
  for (let q = 3; q < STRIDE; q++) out[q] = f[b + q] + (f[c + q] - f[b + q]) * s;
  out[7] = g.dist[i] + (g.dist[cutNext ? i : j] - g.dist[i]) * s;
  return out;
}

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Queue the ghost into r's transparent list (5 draws for a car), or return at once. */
export function draw(r, G, specFor) {
  const g = play.g, m = G.mission;
  if (!enabled || !g || !m || m !== rec.m || play.id !== rec.id || G.cineCam || !G.veh || !G.meshes) return false;
  const tg = m.race && m.race.going ? m.race.t : 0;
  const o = sampleAt(g, tg, S);
  const d = Math.hypot(o[0] - G.veh.x, o[2] - G.veh.z);
  if (d > DRAW_DIST) return false;
  const end = tg <= g.t + HOLD_S ? 1 : Math.max(0, 1 - (tg - g.t - HOLD_S) / FADE_S);
  const alpha = ALPHA * smooth(NEAR_IN, NEAR_FULL, d) * end;
  if (alpha < 0.02) return false;
  let spec = specFor(g.car);
  if (!G.meshes.cars[spec.id] || !G.meshes.wheels[spec.id]) spec = specFor('ranger');
  const body = G.meshes.cars[spec.id], wheel = G.meshes.wheels[spec.id];
  if (!body || !wheel) return false;
  const tint = TINT[g.medal] || TINT.none;
  BODY.alpha = alpha; BODY.colorMul = tint;
  WHEEL.alpha = alpha * 0.8; WHEEL.colorMul = tint;
  const x = o[0], y = o[1], z = o[2], yaw = o[3];
  m4.compose(MM, x, y, z, yaw, o[4], o[5]);
  r.draw(body, MM, BODY);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), hx = spec.track / 2, wr = spec.wheelR, spin = o[7] / wr;
  for (let sz = 1; sz >= -1; sz -= 2) {
    for (let sx = spec.twoWheel ? 0 : -1; sx <= (spec.twoWheel ? 0 : 1); sx += 2) {
      const lx = sx * hx, lz = sz * spec.axleZ;
      m4.compose(MM, x + lx * cy + lz * sy, y + wr, z - lx * sy + lz * cy, yaw - (sz > 0 ? o[6] : 0), spin, 0, 1, 1, 1);
      r.draw(wheel, MM, WHEEL);
      if (spec.twoWheel) break;
    }
  }
  return true;
}

/** End-card line against the ghost that was raced, '' when there was none. */
export function finishLine(G, m, en = false) {
  const g = play.g;
  if (!g || !m || !m.race || !(m.race.t > 0) || play.id !== ghostIdFor(m.def)) return '';
  const dlt = m.race.t - g.t;
  const txt = (x) => Math.max(0.1, Math.round(Math.abs(x) * 10) / 10).toFixed(1).replace('.', en ? '.' : ',');
  if (Math.abs(dlt) < 0.05) return en ? 'Level with the ghost' : 'À égalité avec le fantôme';
  return dlt < 0 ? (en ? `Ghost beaten by ${txt(dlt)} s` : `Fantôme battu de ${txt(dlt)} s`)
    : (en ? `${txt(dlt)} s behind the ghost` : `${txt(dlt)} s derrière le fantôme`);
}
/** For tests and the review beats. */
export function ghostState() {
  return { id: play.id, loaded: !!play.g, t: play.g ? play.g.t : null, recording: !!(rec.m && rec.started), n: rec.n, cached: cache.size };
}
