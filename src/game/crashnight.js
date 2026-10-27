// [w6-crashnight] C-04 Crash Night: the scoring core (body-shop dollars) and,
// [w7-crashnight], the playable mode: the junction plan on the traffic graph,
// the lights, the fixed wave, three tries, the mission def and the mode tab.
// No DOM, no GL, no main.js: node-tested by tools/smoke_crashnight.mjs.
import { knockDamage, CARS } from './cars.js';
import { collideCars } from './collide.js';
import * as save from './save.js';
import { yieldsToMode } from './missionkit.js';

export const CRASH = {
  id: 'crashnight',
  junction: { x: -209.7, z: -150.5, roads: ['Rue Principale', 'Boulevard Wilfrid-Lavigne'] },
  tries: 3,
  countdown: 3.0,
  runUp: 14.0,
  window: 5.0,
  settle: 1.0,
  hold: 2.5,
  startBack: 170,
  queueGap: 6.5,
  rate: 95,          // $ per knock point
  carCap: 60,        // knock points per car before « PERTE TOTALE »
  chainShare: 0.5,
  multStep: 0.15,
  playerSens: 0.5,
  medals: { or: 30000, argent: 16000, bronze: 6000 },
};

// Fixed wave: non-cast models only (no friend's car gets wrecked for points).
export const WAVE = [
  { key: 'q1', spec: 'caravan', role: 'queue', slot: 0 },
  { key: 'q2', spec: 'cutlass', role: 'queue', slot: 1 },
  { key: 'q3', spec: 'benz', role: 'queue', slot: 2 },
  { key: 'o1', spec: 'cutlass', role: 'oncoming', slot: 0 },
  { key: 'o2', spec: 'caravan', role: 'oncoming', slot: 1 },
  { key: 'x1', spec: 'benz', role: 'cross', arrive: -2.5 },
  { key: 'x2', spec: 'caravan', role: 'cross', arrive: -1.0 },
  { key: 'x3', spec: 'cutlass', role: 'cross', arrive: 0.5 },
];

export function billFor(points) { return Math.round(points * CRASH.rate); }

export class CrashScore {
  constructor() { this.per = new Map(); this.losses = 0; }
  reset() { this.per.clear(); this.losses = 0; }
  // src 'player' | 'chain'. Clamps the car at CRASH.carCap. Returns { dollars, totalLoss }.
  hit(car, points, src = 'player') {
    if (!(points > 0)) return { dollars: 0, totalLoss: false };
    const p = src === 'chain' ? points * CRASH.chainShare : points;
    const had = this.per.get(car) || 0;
    if (had >= CRASH.carCap) return { dollars: 0, totalLoss: false };
    const now = Math.min(CRASH.carCap, had + p);
    this.per.set(car, now);
    const totalLoss = now >= CRASH.carCap;
    if (totalLoss) this.losses++;
    return { dollars: billFor(now - had), totalLoss };
  }
  get cars() { return this.per.size; }
  get mult() { return this.cars <= 1 ? 1 : 1 + CRASH.multStep * (this.cars - 1); }
  get total() {
    let sum = 0;
    for (const v of this.per.values()) sum += v;
    return Math.round(billFor(sum) * this.mult / 10) * 10;
  }
  summary() { return { total: this.total, cars: this.cars, losses: this.losses, mult: this.mult }; }
}

// wave: a Set (or Map) of the night's wave cars. Bikes, school and city buses never score.
export function scoreable(car, wave) {
  if (!car) return false;
  if (car.kind === 'bike' || car.kind === 'school' || car.kind === 'city') return false;
  return !!(wave && wave.has(car));
}

// crashnight.js's own copy of traffic.js's stun block on a plain car (no heckle).
export function stunCar(c, secs) {
  c.stunT = secs; c.honkT = 0.30; c.horn = 1; c.speed = 0;
  return c;
}

// Try card line, e.g. « ESSAI 1 : 9 340 $ · 3 chars · 1 perte totale ».
export function tryLine(idx, s) {
  const money = String(s.total).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cars = s.cars + (s.cars === 1 ? ' char' : ' chars');
  const loss = s.losses ? ` · ${s.losses} perte${s.losses > 1 ? 's' : ''} totale${s.losses > 1 ? 's' : ''}` : '';
  return `ESSAI ${idx + 1} : ${money} $ · ${cars}${loss}`;
}

// ======================================================================
// [w7-crashnight] the playable mode
// ======================================================================

// signals.js's fixed cycle (GREEN 12, AMBER 3), copied so this file does not
// pull the map in; tools/smoke_crashnight.mjs checks it against Signals.
const HALF = 15, PERIOD = 30;

export function medalFor(total) {
  const m = CRASH.medals;
  return total >= m.or ? 'or' : total >= m.argent ? 'argent' : total >= m.bronze ? 'bronze' : null;
}
const MEDAL_FR = { or: 'OR', argent: 'ARGENT', bronze: 'BRONZE' };
export const money = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Car-to-car hits inside the pile: wave cars only, a pair counts when one of
// them is already in it. Bills both at chainShare, stuns the struck car.
export function chainPass(cars, score, inPile, onBill) {
  let hits = 0;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const ina = inPile(a), inb = inPile(b);
      if (!ina && !inb) continue;
      const closing = collideCars(a, b);
      if (closing <= 0.8) continue;
      const pts = knockDamage(closing);
      const ra = score.hit(a, pts, 'chain'), rb = score.hit(b, pts, 'chain');
      const struck = ina ? b : a;
      stunCar(struck, Math.max(struck.stunT || 0, CRASH.window + 1));
      hits++;
      if (onBill) { onBill(a, ra); onBill(b, rb); }
    }
  }
  return hits;
}

// The road graph's incoming edges per node, built once per Traffic.
const INC = new WeakMap();
function incoming(traffic) {
  let inc = INC.get(traffic);
  if (!inc) {
    inc = traffic.nodes.map(() => []);
    traffic.edges.forEach((e, i) => inc[e.b].push(i));
    INC.set(traffic, inc);
  }
  return inc;
}

// d metres back from the END of edge ei, following the straightest
// predecessor. -> { ei, t, path: [edge indices in driving order] }
export function walkBack(traffic, ei, d) {
  const inc = incoming(traffic), E = traffic.edges;
  const path = [ei];
  let cur = ei, rem = d;
  for (let guard = 0; guard < 200; guard++) {
    const e = E[cur];
    if (e.len >= rem) return { ei: cur, t: 1 - rem / e.len, path };
    rem -= e.len;
    let best = -1, bd = -2;
    for (const p of inc[e.a]) {
      const q = E[p];
      if (q.a === e.b) continue;               // no U-turn
      const dot = q.dx * e.dx + q.dz * e.dz;
      if (dot > bd) { bd = dot; best = p; }
    }
    if (best < 0 || bd < 0.3) return { ei: cur, t: 0, path };
    cur = best; path.unshift(cur);
  }
  return { ei: cur, t: 0, path };
}

function axisOf(sig, e) {
  const h = Math.atan2(e.dx, e.dz);
  const par = (y) => Math.abs(Math.cos(h - y));
  return par(sig.axisYaw[0]) >= par(sig.axisYaw[1]) ? 0 : 1;
}

/**
 * Pure on the road graph. Finds the signal by its two road names (the name
 * uses '×'), the player's approach from the west on Principale, the far
 * approach, and the cross-axis approaches near the box.
 */
export function planJunction(traffic, signals) {
  const [ra, rb] = CRASH.junction.roads;
  const sig = signals.list.find((s) => s.name.includes(ra) && s.name.includes(rb));
  if (!sig) return null;
  let node = -1, nd = 25;
  traffic.nodes.forEach((n, i) => { const d = Math.hypot(n.x - sig.x, n.z - sig.z); if (d < nd) { nd = d; node = i; } });
  if (node < 0) return null;
  const E = traffic.edges, N = traffic.nodes, inc = incoming(traffic);
  const playerAxis = sig.name.indexOf(ra) < sig.name.indexOf(rb) ? 0 : 1;
  const crossAxis = 1 - playerAxis;
  const mine = inc[node].filter((i) => axisOf(sig, E[i]) === playerAxis);
  if (mine.length < 1) return null;
  // From the west: the approach whose far end has the smallest x.
  mine.sort((a, b) => N[E[a].a].x - N[E[b].a].x);
  const playerEdge = mine[0], oncomingEdge = mine.length > 1 ? mine[mine.length - 1] : -1;
  const stop = sig.ext + 1.3;
  const s0 = walkBack(traffic, playerEdge, CRASH.startBack);
  const se = E[s0.ei];
  const sp = traffic.laneAt(se, s0.t, [0, 0], 0);
  const start = { x: sp[0], z: sp[1], a: Math.atan2(se.dx, se.dz) };
  const lenOf = 4.6;
  const queue = [0, 1, 2].map((k) => walkBack(traffic, playerEdge, stop + lenOf / 2 + k * CRASH.queueGap));
  const oncoming = oncomingEdge < 0 ? [] : [0, 1].map((k) => walkBack(traffic, oncomingEdge, stop + lenOf / 2 + k * CRASH.queueGap));
  // Cross approaches: cross-axis edges ending within 20 m of the signal and
  // arriving from outside it (their start is farther out than their end).
  const cross = [];
  for (let i = 0; i < N.length; i++) {
    const n = N[i];
    if (Math.hypot(n.x - sig.x, n.z - sig.z) > 20) continue;
    for (const ei of inc[i]) {
      const e = E[ei], a = N[e.a];
      if (axisOf(sig, e) !== crossAxis) continue;
      if (Math.hypot(a.x - sig.x, a.z - sig.z) <= Math.hypot(n.x - sig.x, n.z - sig.z)) continue;
      cross.push({ edge: ei, node: i, x: n.x, z: n.z, south: a.z < n.z });
    }
  }
  cross.sort((p, q) => (q.south - p.south));   // south branch first
  return { sig, node, start, playerEdge, oncomingEdge, queue, oncoming, cross, playerAxis, crossAxis, stop };
}

/** signals.t so the cross axis turns green exactly goIn seconds from now. */
export function setLightsForTry(signals, plan, goIn) {
  const off = plan.sig.phase + (plan.crossAxis ? HALF : 0);
  let t = -(goIn + off) % PERIOD;
  if (t < 0) t += PERIOD;
  signals.t = t;
  return t;
}

// ---------------------------------------------------------------- the run

const SPEC = (id) => CARS.find((c) => c.id === id);
const FAR = 700;

function stateOf(G) { return G.crashNight || null; }

function prep(G, st) {
  const tr = G.traffic, plan = st.plan, J = CRASH.junction;
  const v = G.veh;
  const gy = (x, z) => (G.phys && G.phys.groundY ? G.phys.groundY(x, z) : 0);
  // Player on the line, repaired, softer to damage for the night.
  v.reset(plan.start.x, plan.start.z, plan.start.a, gy(plan.start.x, plan.start.z));
  if (G.world && G.world.roadAt) v.onRoad = G.world.roadAt(v.x, v.z);
  v.repair();
  v.damageSensitivity = CRASH.playerSens;
  // The wave: the first 8 plain cars, kept for the night.
  if (!st.waveCars) {
    st.waveCars = tr.cars.filter((c) => !c.kind).slice(0, WAVE.length);
    st.others = tr.cars.filter((c) => !st.waveCars.includes(c));
    for (const c of tr.cars) {
      st.orig.set(c, { spec: c.spec, len: c.len, wid: c.wid, mass: c.mass, tint: c.tint, pace: c.pace, lane: c.lane });
    }
    st.wave = new Set(st.waveCars);
  }
  st.hold.length = 0;
  st.cross.length = 0;
  let qi = 0, oi = 0, xi = 0;
  st.waveCars.forEach((c, i) => {
    const w = WAVE[i], spec = SPEC(w.spec) || c.spec;
    c.spec = spec; c.len = spec.len; c.wid = spec.wid; c.mass = spec.mass; c.pace = 1; c.lane = 0;
    c.respawnT = 1e9;
    let slot = null;
    if (w.role === 'queue') slot = plan.queue[qi++];
    else if (w.role === 'oncoming') slot = plan.oncoming[oi++];
    if (slot) {
      tr.place(c, slot.ei, slot.t);
      c.speed = 0;
      st.hold.push({ c, x: c.x, z: c.z, yaw: c.yaw });
      return;
    }
    const br = plan.cross.length ? plan.cross[xi++ % plan.cross.length] : null;
    if (!br) { sendAway(tr, c, J, i); return; }
    const want = tr.wantOn(c, tr.edges[br.edge]);
    const back = walkBack(tr, br.edge, want * (CRASH.countdown + 11 + w.arrive));
    tr.place(c, back.ei, back.t);
    c.speed = want;
    st.cross.push({ c, path: back.path });
  });
  st.others.forEach((c, i) => sendAway(tr, c, J, i));
  if (G.cops && G.cops.clear) G.cops.clear();
  setLightsForTry(G.signals, plan, CRASH.countdown);
  st.score.reset();
  st.phase = 'count'; st.t = 0; st.firstHitAt = -1; st.calm = 0; st.lossToastT = 0;
}

function sendAway(tr, c, J, i) {
  let k = 0;
  for (let e = 0; e < tr.edges.length; e++) {
    const E = tr.edges[e], A = tr.nodes[E.a];
    if (Math.hypot(A.x - J.x, A.z - J.z) < FAR) continue;
    if (k++ < i * 7) continue;
    tr.place(c, e, 0.5);
    break;
  }
  c.speed = 0; c.respawnT = 1e9; c.stunT = 1e9; c.honkT = 0;
}

function endTry(G, st, why) {
  const s = st.score.summary();
  st.tries.push(s);
  st.phase = 'card'; st.t = 0;
  const line = tryLine(st.tries.length - 1, s) + (why ? '\n' + why : '');
  G.hud?.toast(line, CRASH.hold * 1000);
}

function onHit(G, st, c, body, closing) {
  if (body !== G.veh || (st.phase !== 'run' && st.phase !== 'window')) return;
  if (!scoreable(c, st.wave)) return;
  const r = st.score.hit(c, knockDamage(closing), 'player');
  if (st.phase === 'run') { st.phase = 'window'; st.firstHitAt = st.t; }
  billed(G, st, c, r);
  stunCar(c, CRASH.window + 1);
}

function billed(G, st, c, r) {
  if (r.totalLoss) {
    c.stunT = 1e9;
    if (st.lossToastT <= 0) {
      st.lossToastT = 0.8;
      G.hud?.toast(`PERTE TOTALE : ${(c.spec.name || '').replace(/^\d{4} /, '')} ${money(billFor(CRASH.carCap))} $`, 1400);
    }
  }
}

/** One fixed step of the night (from the stage's onTick, after traffic.update). */
export function stepNight(G, st, dt) {
  const v = G.veh;
  st.t += dt;
  if (st.lossToastT > 0) st.lossToastT -= dt;
  if (st.phase === 'count') {
    const p = st.plan.start;
    v.reset(p.x, p.z, p.a, G.phys && G.phys.groundY ? G.phys.groundY(p.x, p.z) : 0);
    if (st.t >= CRASH.countdown) { st.phase = 'run'; st.t = 0; G.hud?.toast('GO', 900); }
  }
  // Pinned cars stay put until touched.
  for (const h of st.hold) {
    const c = h.c;
    if (!c) continue;
    if (c.hitBy > 0 || c.stunT > 0) { h.c = null; continue; }
    c.x = h.x; c.z = h.z; c.yaw = h.yaw; c.speed = 0; c.vx = 0; c.vz = 0;
  }
  // Cross cars keep to their path through the box.
  for (const x of st.cross) {
    const i = x.path.indexOf(x.c.edge);
    if (i >= 0 && i < x.path.length - 1) x.c.next = x.path[i + 1];
  }
  if (st.phase === 'run' || st.phase === 'window') {
    chainPass(st.waveCars, st.score, (c) => st.score.per.has(c), (c, r) => billed(G, st, c, r));
    if (v.damage >= 90) { endTry(G, st, 'Ton char a son voyage. Essai suivant.'); return null; }
  }
  if (st.phase === 'run' && st.t > CRASH.runUp) { endTry(G, st, 'Rien frappé.'); return null; }
  if (st.phase === 'window') {
    const since = st.t - st.firstHitAt;
    let moving = Math.abs(v.vLong || 0) > 0.5;
    for (const c of st.waveCars) if (Math.hypot(c.vx || 0, c.vz || 0) > 0.5) moving = true;
    st.calm = moving ? 0 : st.calm + dt;
    if (since >= CRASH.window || (since >= 2 && st.calm >= CRASH.settle)) { endTry(G, st); return null; }
  }
  if (st.phase === 'card') {
    if (st.t >= CRASH.hold) {
      if (st.tries.length >= CRASH.tries) { st.phase = 'end'; return 'done'; }
      prep(G, st);
    }
  }
  return null;
}

function objective(st) {
  if (!st) return ['', ''];
  const n = Math.min(st.tries.length + 1, CRASH.tries);
  const s = st.score.summary();
  const mult = s.mult > 1 ? ' x' + s.mult.toFixed(2).replace(/0$/, '').replace('.', ',') : '';
  const text = `Essai ${n}/${CRASH.tries} · ${money(s.total)} $${mult}`;
  if (st.phase === 'count') return [text, 'Feu rouge pour toi, vert pour eux autres · ' + Math.ceil(CRASH.countdown - st.t)];
  if (st.phase === 'window') return [text, 'Encore ' + Math.max(0, Math.ceil(CRASH.window - (st.t - st.firstHitAt))) + ' s'];
  if (st.phase === 'card') return [text, 'Retour sur la ligne'];
  return [text, 'Feu rouge pour toi, vert pour eux autres'];
}

/** Read-only view for the harness and the HUD. */
export function crashNightState(G) {
  const st = stateOf(G);
  const rec = save.loadRecord ? save.loadRecord(CRASH.id) : null;
  if (!st) return { phase: null, tryIdx: 0, tries: [], live: 0, best: rec ? rec.t : null, medals: CRASH.medals };
  const best = st.tries.reduce((m, x) => Math.max(m, x.total), 0);
  return { phase: st.phase, tryIdx: st.tries.length, tries: st.tries.map((x) => x.total), live: st.score.total, best, medals: CRASH.medals };
}

function cleanupNight(G) {
  const st = stateOf(G);
  if (!st) return;
  const tr = G.traffic, v = G.veh;
  const step = (f) => { try { f(); } catch (e) { console.warn('crashnight cleanup', e); } };
  step(() => { if (tr) tr.onHit = st.prevOnHit || null; });
  step(() => {
    if (st.savedSens === undefined) delete v.damageSensitivity; else v.damageSensitivity = st.savedSens;
    v.repair();
    v.damage = st.savedDamage;
    if (G.health && v.spec) G.health[v.spec.id] = st.savedDamage;
  });
  step(() => {
    for (const [c, o] of st.orig) {
      Object.assign(c, o);
      c.respawnT = 0; c.stunT = 0; c.honkT = 0; c.next = -1; c.hitBy = 0;
      tr.reacquire(c);
    }
  });
  step(() => {
    if (st.tries.length >= CRASH.tries && save.saveRecord) {
      const best = st.tries.reduce((m, x) => Math.max(m, x.total), 0);
      st.record = save.saveRecord(CRASH.id, best, { better: 'higher', by: G.character, car: G.carId });
    }
  });
  G.crashNight = null;
  G.lastCrashNight = st;
}

/** The mission def main.js's runner plays. */
export function crashNightMission(G) {
  const J = CRASH.junction;
  const stage = {
    text: 'Tôle froissée', sub: 'Feu rouge pour toi, vert pour eux autres',
    at: { x: J.x, z: J.z }, radius: 14, anywhere: true, noRoute: true,
    condition: () => false,
    prompt: () => '',
    onEnter: (G2) => { const st = stateOf(G2); if (st) prep(G2, st); },
    onTick: (G2, m, s, dt) => {
      const st = stateOf(G2);
      if (!st) return { fail: 'Tôle froissée abandonnée.' };
      const r = stepNight(G2, st, dt);
      const [a, b] = objective(st);
      if (a !== st.objA || b !== st.objB) { st.objA = a; st.objB = b; G2.hud?.setObjective(a, b); }
      return r;
    },
  };
  return {
    id: CRASH.id, title: 'Tôle froissée',
    brief: 'Le feu est rouge pour toi pis vert pour eux autres. Fonce, frappe, compte. Trois essais : le meilleur compte.',
    giver: 'principale', timeOfDay: 'night', mode: 'crashnight', race: true,
    keepDamage: true, ownsWreck: true, ownVehicle: false, money: 0,
    build: () => {
      const tr = G.traffic, v = G.veh;
      const st = {
        phase: 'count', t: 0, plan: G.crashPlan, tries: [], score: new CrashScore(),
        orig: new Map(), hold: [], cross: [], waveCars: null, wave: null, others: null,
        savedDamage: v ? v.damage || 0 : 0, savedSens: v ? v.damageSensitivity : undefined,
        prevOnHit: tr ? tr.onHit : null, firstHitAt: -1, calm: 0, lossToastT: 0,
      };
      G.crashNight = st;
      if (tr) tr.onHit = (c, body, closing) => onHit(G, st, c, body, closing);
      return [stage];
    },
    cleanup: (G2) => cleanupNight(G2),
    result: (G2) => {
      const st = G2.lastCrashNight || stateOf(G2);
      const tries = st ? st.tries.map((x) => x.total) : [];
      const best = tries.reduce((m, x) => Math.max(m, x), 0);
      const medal = medalFor(best);
      const rec = save.loadRecord ? save.loadRecord(CRASH.id) : null;
      return {
        best, medal,
        toast: `TÔLE FROISSÉE : ${money(best)} $` + (medal ? `  ·  ${MEDAL_FR[medal]}` : '')
          + `\nEssais : ${tries.map(money).join(' · ')}`
          + (rec && rec.t != null ? `\nRecord : ${money(rec.t)} $` : ''),
      };
    },
  };
}

let API = null;
/** Starts the night; refuses over a story job. */
export function startCrashNight(G) {
  if (!API || !API.startMission) return false;
  // W8-BUGS: the same rule as a course from M (modes.js busyWith): a job the
  // player took keeps the refusal; the first job the game started by itself,
  // still on its first stage, steps aside and startMission closes it quietly.
  if (G.mission && G.mission.def && !G.mission.def.mode && !yieldsToMode(G.mission)) {
    G.hud?.toast('T’es en pleine job. Finis-la avant Tôle froissée.', 2600);
    return false;
  }
  if (!G.crashPlan) G.crashPlan = planJunction(G.traffic, G.signals);
  if (!G.crashPlan) { G.hud?.toast('Tôle froissée : la lumière est introuvable.', 2600); return false; }
  if (G.mission && G.failMission && !yieldsToMode(G.mission)) G.failMission('Abandonné.');
  G.modeNow = 'crashnight';
  return API.startMission(crashNightMission(G)) !== false;
}

export const DESCRIPTOR = {
  id: 'crashnight', name: 'Crash Night', fr: 'Tôle froissée',
  blurb: 'Minuit, Principale coin Wilfrid-Lavigne. Trois essais, le même trafic. Le pointage, c’est la facture du carrossier.',
  row: () => {
    const rec = save.loadRecord ? save.loadRecord(CRASH.id) : null;
    const m = CRASH.medals;
    return `Bronze ${money(m.bronze)} $ · Argent ${money(m.argent)} $ · Or ${money(m.or)} $ · ton record ${rec && rec.t != null ? money(rec.t) + ' $' : 'aucun'}`;
  },
};

/** main.js hook: registers the tab, returns { start, state, records }. */
export function installCrashNight(G, api, modes = null) {
  API = api || {};
  DESCRIPTOR.start = (G2) => startCrashNight(G2 || G);
  if (modes && modes.registerMode) modes.registerMode(DESCRIPTOR);
  return {
    start: () => startCrashNight(G),
    state: () => crashNightState(G),
    records: () => (save.loadRecord ? save.loadRecord(CRASH.id) : null),
  };
}
