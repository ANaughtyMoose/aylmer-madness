// [w8-courseproof] QA-only course driver. NOT part of the game.
//
// The cloud browser checker runs the game on SwiftShader at about 0.1x real
// time, and its bot steers a few times a second: it cannot finish a Blitz, so
// medals, the R rerun and the ghost were never seen working in a browser
// (wave7-cloud/RESULTS.md, pressure-2026-10-27 risk 4). This module lets a
// check finish a course on purpose:
//
//   completeNextGate(G)   the truck straight into the next gate's ring
//   follow(G, { kmh })    the truck carried along the GPS route through every
//                         gate in order, at a fixed speed in GAME time, so the
//                         run has a believable time and the ghost a real path
//
// Reachable only through window.AYLMER.qa, which main.js defines only when
// qaAllowed(AYLMER_STORAGE) is true: ?review=<name>, ?audioReview=1, or the
// page iframed by a tools/ harness (storage-ns.js). In normal play there is no
// AYLMER.qa, G.qaFollow is never set and main.js's tick pays one null check.
// No DOM, no GL: node-tested by tools/smoke_qacourse.mjs.

/** True only under a review namespace (the harness, the rig, ?review=). */
export function qaAllowed(info) {
  return !!(info && info.installed && typeof info.review === 'string' && info.review);
}

/** The running course race (m.race of racejobs.js), or null. */
function raceOf(G) {
  const m = G && G.mission;
  return m && m.race && m.race.track ? m : null;
}

/** Where the course stands: stage, gates done, the next gate. null = no course race running. */
export function gateInfo(G) {
  const m = G && G.mission;
  if (!m) return null;
  const st = m.stages ? m.stages[m.idx] : null;
  const R = m.race || null;
  const out = { id: m.def ? m.def.id : null, stage: m.idx, kind: st ? st.kind || null : null, going: !!(R && R.going), raceT: R ? +R.t.toFixed(2) : null };
  if (!R || !R.track) return out;
  const T = R.track, done = R.me.done, fin = T.isFinished(done);
  out.done = done; out.n = T.n * T.laps; out.finished = fin;
  if (!fin && G.veh) {
    const g = T.gate(done);
    out.gate = { x: g.x, z: g.z, r: g.r, d: +Math.hypot(g.x - G.veh.x, g.z - G.veh.z).toFixed(1) };
  }
  return out;
}

function place(G, x, z, yaw) {
  const v = G.veh;
  const y = G.phys && G.phys.groundY ? G.phys.groundY(x, z) : 0;
  v.reset(x, z, yaw, y);
  if (G.world && G.world.roadAt) v.onRoad = G.world.roadAt(x, z);
}

/**
 * Put the truck in the middle of the next gate, facing the one after it. The
 * race's own gate test (Track.check in racejobs.js) clears it on the next tick,
 * exactly as if it had been driven there. Refuses before GO.
 */
export function completeNextGate(G) {
  const m = raceOf(G);
  if (!m) return { ok: false, why: 'no course race running' };
  const R = m.race, T = R.track;
  if (!R.going) return { ok: false, why: 'not started (grid or count-in)' };
  if (T.isFinished(R.me.done)) return { ok: false, why: 'finished' };
  const g = T.gate(R.me.done);
  const nx = T.isFinished(R.me.done + 1) ? null : T.gate(R.me.done + 1);
  const yaw = nx ? Math.atan2(nx.x - g.x, nx.z - g.z) : (G.veh ? G.veh.yaw : 0);
  place(G, g.x, g.z, yaw);
  return { ok: true, done: R.me.done, x: g.x, z: g.z };
}

/** Start (opts) or stop (null) carrying the truck along the course at opts.kmh. */
export function follow(G, opts) {
  if (!G) return null;
  if (!opts) { G.qaFollow = null; return null; }
  const kmh = Math.max(5, Math.min(400, Number(opts.kmh) || 120));
  // opts.path: a fixed polyline ([[x, z], ...], e.g. a shortcut's points) walked once,
  // course or not; without it, the GPS route to each gate of the running course.
  const fixed = Array.isArray(opts.path) && opts.path.length >= 2 ? opts.path.map((p) => [+p[0], +p[1]]) : null;
  G.qaFollow = { kmh, m: null, done: -1, path: fixed, fixed: !!fixed, seg: 0, s: 0, metres: 0, gates: 0 };
  return { kmh, fixed: !!fixed };
}

/**
 * main.js tick, before updateMission: one step along the route to the next
 * gate. Idle on the grid, in the count-in and after the line. The route is
 * rebuilt only when a gate clears (QA only: the allocation is not in play).
 */
export function qaTick(G, dt) {
  const F = G.qaFollow;
  if (!F || !(dt > 0)) return;
  if (F.fixed) { if (F.seg < F.path.length - 1) walk(G, F, dt); return; }
  const m = raceOf(G);
  if (!m || !m.race.going || m.race.track.isFinished(m.race.me.done)) { F.m = null; return; }
  const R = m.race, T = R.track, v = G.veh;
  if (F.m !== m || F.done !== R.me.done || !F.path) {
    if (F.m === m && F.done !== R.me.done) F.gates++;
    F.m = m; F.done = R.me.done;
    const g = T.gate(R.me.done);
    const p = G.nav && G.nav.route ? G.nav.route(v.x, v.z, g.x, g.z) : null;
    F.path = p && p.length >= 2 ? p : [[v.x, v.z], [g.x, g.z]];
    F.path[0] = [v.x, v.z];
    F.seg = 0; F.s = 0;
  }
  walk(G, F, dt);
}

function walk(G, F, dt) {
  const v = G.veh;
  let left = (F.kmh / 3.6) * dt;
  const P = F.path;
  let x = v.x, z = v.z, yaw = v.yaw;
  while (left > 0 && F.seg < P.length - 1) {
    const a = P[F.seg], b = P[F.seg + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > 1e-6) yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const room = L - F.s;
    if (left < room) { F.s += left; F.metres += left; left = 0; }
    else { left -= room; F.metres += room; F.seg++; F.s = 0; }
    const k = L > 1e-6 ? F.s / L : 1;
    const A = P[F.seg], B = P[Math.min(F.seg + 1, P.length - 1)];
    x = A[0] + (B[0] - A[0]) * k; z = A[1] + (B[1] - A[1]) * k;
  }
  place(G, x, z, yaw);
}

/** The follow state for a check (no path arrays). */
export function followState(G) {
  const F = G && G.qaFollow;
  return F ? { kmh: F.kmh, fixed: F.fixed, done: F.fixed ? F.seg >= F.path.length - 1 : null, gates: F.gates, metres: Math.round(F.metres), seg: F.seg, segs: F.path ? F.path.length - 1 : 0 } : null;
}

/** What main.js hangs on window.AYLMER.qa (only when qaAllowed). */
export function qaApi(G) {
  return {
    gate: () => gateInfo(G),
    completeNextGate: () => completeNextGate(G),
    follow: (opts) => follow(G, opts === undefined ? { kmh: 120 } : opts),
    followState: () => followState(G),
  };
}
