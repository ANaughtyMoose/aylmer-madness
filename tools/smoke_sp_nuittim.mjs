// « La nuit du Tim » (mission 8, id nuittim):  node tools/smoke_sp_nuittim.mjs
//
//   1. the pure mechanics: the watch clock, the daze drift, the follower,
//      the hand-off point, the walking-pace clamp
//   2. the mission is well formed: every stage has a goal, a how line naming a
//      key, a hint; canon (Sam, no Margaret, nobody drinking but Sam, short
//      bubbles, no em dash)
//   3. a fake G drives every stage to completion through missionkit, without
//      a document (the effects are no-ops in node)
//   4. with a tiny fake DOM, every overlay is torn down on success, on a
//      failure/abort in the middle of the dazed walk, and on the cut
import {
  NUITTIM_MISSION, TUNE, clockText, watchInit, watchStep, dazeInit, dazeSteer,
  followerStep, pointBeforeEnd, applyWalk, handOff,
  CALL_LINES, WATCH_LINES, CHECK_LINES, WALK_LINES, SCHOOL_LINES, STRANGER_ASK, TOM_SURE, CLOSING,
} from '../src/game/setpieces/nuittim.js';
import { createNuitFx, FX } from '../src/game/setpieces/nuittim_fx.js';
import { stageEnter, stageStep, stageExit, stageTarget, missionCleanup } from '../src/game/missionkit.js';
import { PLACES } from '../src/game/places.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ---------------------------------------------------------------- 1. pure
group('1. pure mechanics');
{
  ok(clockText(23 * 60 + 40) === '23 h 40', 'clock reads 23 h 40', clockText(23 * 60 + 40));
  ok(clockText(TUNE.watchTo) === '3 h 10', 'clock wraps past midnight to 3 h 10', clockText(TUNE.watchTo));
  ok(clockText(24 * 60 + 5) === '0 h 05', 'minutes are zero-padded');

  let s = watchInit(); const said = []; let checks = 0, steps = 0;
  while (!s.done && steps < 10000) {
    s = watchStep(s, 0.1, { check: steps % 50 === 0, moving: false });
    if (s.say) said.push(s.say);
    if (s.check) checks++;
    steps++;
  }
  ok(s.done, 'the watch ends by itself');
  ok(near(steps * 0.1, TUNE.watchSeconds, 0.2), `in about ${TUNE.watchSeconds} s (${(steps * 0.1).toFixed(1)})`);
  ok(clockText(s.minutes) === '3 h 10', 'at 3 h 10');
  ok(said.length === WATCH_LINES.length, 'every scheduled line plays once', said.length);
  ok(checks > 0 && CHECK_LINES.length >= 3, 'E checks on Sam get a line each');
  let m1 = watchInit(); m1 = watchStep(m1, 5, { moving: true });
  ok(m1.t === 0 && m1.minutes === TUNE.watchFrom, 'the clock stops while the truck moves');
  ok(watchStep({ ...s }, 1, {}).done, 'a finished watch stays finished');

  let d = dazeInit(1); let maxNudge = 0, sumSigned = 0; const lv = [];
  for (let i = 0; i < 1200; i++) {
    d = dazeSteer(d, 1 / 60, { speedKmh: 10 });
    maxNudge = Math.max(maxNudge, Math.abs(d.nudge)); sumSigned += d.nudge;
    if (i % 300 === 0) lv.push(d.level);
  }
  ok(maxNudge > 0 && maxNudge <= TUNE.driftRadS / 60 + 1e-9, 'drift is bounded by driftRadS', maxNudge);
  ok(lv.every((x, i) => i === 0 || x <= lv[i - 1]), 'the daze eases over time', lv.join(','));
  ok(d.cap === TUNE.walkKmh, 'walking pace cap');
  let dl = dazeInit(1); for (let i = 0; i < 20000; i++) dl = dazeSteer(dl, 0.1, { speedKmh: 10 });
  ok(near(dl.level, TUNE.dazeFloor), 'never clears below the floor tonight', dl.level);
  const still = dazeSteer(dazeInit(1), 0.5, { speedKmh: 0 });
  const walking = dazeSteer(dazeInit(1), 0.5, { speedKmh: 10 });
  ok(Math.abs(still.nudge) < Math.abs(walking.nudge), 'standing still barely turns you');
  ok(Math.abs(sumSigned) < 1.2, 'drift wanders, it is not a constant pull', sumSigned.toFixed(3));

  let g = TUNE.followNear;
  for (let i = 0; i < 1000; i++) g = followerStep(g, 0.1, 10);
  ok(near(g, TUNE.followFar), 'walking, he falls back to followFar', g);
  for (let i = 0; i < 1000; i++) g = followerStep(g, 0.1, 0);
  ok(near(g, TUNE.followNear), 'standing, he closes to followNear and no closer', g);

  const path = [[0, 0], [0, 100], [100, 100]];
  const p = pointBeforeEnd(path, 50);
  ok(near(p.x, 50) && near(p.z, 100) && near(p.yaw, Math.PI / 2), 'hand-off point 50 m back, facing along the road', JSON.stringify(p));
  const p2 = pointBeforeEnd(path, 150);
  ok(near(p2.x, 0) && near(p2.z, 50) && near(p2.yaw, 0), 'across a corner');
  ok(pointBeforeEnd([[0, 0]], 10) === null, 'no route, no point');

  const v = { yaw: 0, vx: 0, vz: 10, vLong: 10 };
  applyWalk(v, 0, TUNE.walkKmh);
  ok(near(Math.hypot(v.vx, v.vz), TUNE.walkKmh / 3.6) && near(v.vLong, TUNE.walkKmh / 3.6), 'speed clamped to walking pace');
  const w = { yaw: 0, vx: 0, vz: 2, vLong: 2 };
  applyWalk(w, 0.3, null);
  ok(near(w.yaw, 0.3) && near(Math.atan2(w.vx, w.vz), 0.3), 'velocity turns with the heading (drift, not skid)');
}

// ---------------------------------------------------------------- 2. shape + canon
group('2. mission shape and canon');
const KEY_RE = /\bEspace\b|\bGPS\b|pilier|(?:^|[\s(«])[EWSAD](?:\/[EWSAD])?(?=[\s,.!:·)»]|$)/u;
const def = NUITTIM_MISSION;
const stages = def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, places: 3 });
{
  ok(def.id === 'nuittim' && def.title === 'La nuit du Tim', 'id and title');
  ok(def.timeOfDay === 'night', 'night');
  ok(PLACES[def.giver], 'giver is a real place', def.giver);
  ok(typeof def.cleanup === 'function', 'mission-level cleanup');
  ok(stages.length >= 8, `${stages.length} stages`);
  for (const st of stages) {
    const w = `${st.kind}`;
    ok(typeof st.text === 'string' && st.text.length > 0, `${w}: goal line`);
    ok(KEY_RE.test(st.sub || ''), `${w}: how line names a key`, st.sub);
    ok(typeof st.hint === 'string' && st.hint.length > 8, `${w}: hint`);
    if (st.at) ok(!!PLACES[st.at], `${w}: at '${st.at}' is a place`);
  }
  const kinds = stages.map((s) => s.kind).join(',');
  ok(/arrive,call,watch,tim,bag,stranger,walk,school,home/.test(kinds), 'stage order: call, watch, Tim, bag, punch, walk, school, home', kinds);
  ok(stages.at(-1).at === 'home', 'ends at 299 Fraser');
  ok(stages.find((s) => s.kind === 'tim').at === 'tims', 'the Tim on Principale');
  ok(!stages.some((s) => s.money > 0), 'no pay (a bag of muffins)');

  const lines = [...CALL_LINES, ...WATCH_LINES.map((l) => [l[1], l[2]]), ...WALK_LINES, ...SCHOOL_LINES, STRANGER_ASK, TOM_SURE];
  const texts = [def.brief, ...lines.map((l) => l[1]), ...CHECK_LINES, CLOSING,
    ...stages.flatMap((s) => [s.text, s.sub, s.hint, s.toast, s.holdText])].filter(Boolean);
  const blob = texts.join('\n');
  ok(!/—/.test(blob), 'no em dash anywhere');
  ok(!/Margaret|ta mère|your mom/i.test(blob), 'no Margaret (Tom’s ruling)');
  ok(!/\b(bière|beer|saoul|soûl|drunk)\b/i.test(blob), 'canon word list: no bière/drunk on screen');
  ok(/Sam/.test(blob) && !/Sam (est|is) (un|a) (idiot|cave|loser)/i.test(blob), 'Sam is named, not mocked');
  ok(/Centre antipoison/.test(blob), 'poison control is the Centre antipoison');
  ok(!/Tom (a bu|drinks|boit)|j’ai bu|on a bu/i.test(blob), 'Tom, Sayyad, Mike do not drink');
  ok(lines.every(([, t]) => t.length <= 70 && t.split(/\s+/).length <= 12), 'every bubble fits 12 words / 70 chars',
    lines.filter(([, t]) => t.length > 70 || t.split(/\s+/).length > 12).map((l) => l[1]).join(' | '));
  ok(!/\b(Kevin|Marc|Jean|Luc)\b/.test(blob) && SCHOOL_LINES[0][0] === 'Un gars de l’école', 'the school guy stays unnamed');
  ok(WALK_LINES.some(([w, t]) => w === 'Tom' && /^No\b/.test(t)), 'Tom says no to the stake');
  // Tom answers the Centre antipoison and the stranger in French (they are
  // French); with his friends he speaks English (Tom, 6 Oct and 20 Oct 2026).
  ok(WATCH_LINES.every(([, w, t]) => !/\b(le|la|pis|c’est|sur|il)\b/i.test(t)), 'the friends speak English on the watch',
    WATCH_LINES.map((l) => l[2]).join(' | '));
  ok(WALK_LINES.every(([, t]) => !/\b(le|la|pis|c’est|moé|toé)\b/i.test(t)), 'and on the walk');
  ok(CLOSING === 'Sayyad maintient encore que le piquet aurait marché.' && stages.at(-1).toast === CLOSING, 'closing card (Tom, 29 Sept: option A) is the last toast');
  ok(!/h[ôo]pital/i.test(CLOSING), 'not the old hospital line');
}

// ---------------------------------------------------------------- 3. drive it
function makeG() {
  const toasts = [];
  const veh = {
    x: 0, z: 0, yaw: 0, vx: 0, vz: 0, vLong: 0, passengers: 0, spec: { id: 'ranger', seats: 2 },
    get speedKmh() { return Math.abs(this.vLong) * 3.6; },
    reset(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; this.vx = this.vz = this.vLong = 0; this.resets = (this.resets || 0) + 1; },
  };
  return {
    veh, toasts, wantStart: false,
    hud: { toast: (t) => toasts.push(t), prompt: () => {} },
    nav: { route: (x0, z0, x1, z1) => [[x0, z0], [x0, z1], [x1, z1]] },
    phys: { groundY: () => 0 },
  };
}

// Plays one stage the way main.js does, with a "player" who does the obvious
// thing: drives to the marker, stops, taps E now and then, walks forward.
function play(G, m, st, maxT = 600) {
  const dt = 1 / 30;
  m.target = stageTarget(G, m, st);
  stageEnter(G, m, st);
  for (let t = 0; t < maxT; t += dt) {
    const v = G.veh;
    if (st.kind === 'walk' || st.kind === 'home') {
      // Walk toward the target (or straight on), pedal down; the stage clamps.
      const tgt = m.target;
      const yaw = tgt && Math.hypot(tgt.x - v.x, tgt.z - v.z) > 3 ? Math.atan2(tgt.x - v.x, tgt.z - v.z) : v.yaw;
      const near = tgt && Math.hypot(tgt.x - v.x, tgt.z - v.z) < 6;
      const sp = near ? 0 : 20;                         // "physics" would go 20 m/s
      v.yaw = yaw; v.vx = Math.sin(yaw) * sp; v.vz = Math.cos(yaw) * sp; v.vLong = sp;
    } else if (m.target) {
      v.x = m.target.x; v.z = m.target.z; v.vx = v.vz = v.vLong = 0;
    }
    // Integrate last tick's (clamped) velocity, like the vehicle would.
    if (st.kind === 'walk' || st.kind === 'home') {
      // stageStep's onTick clamps after "physics"; move with the clamped value.
    }
    G.wantStart = Math.floor(t / dt) % 20 === 0;
    const r = stageStep(G, m, st, dt);
    if (st.kind === 'walk' || st.kind === 'home') { v.x += v.vx * dt; v.z += v.vz * dt; }
    if (r === 'done') { stageExit(G, m, st); return { ok: true, t }; }
    if (r && r.fail) return { ok: false, why: r.fail };
  }
  return { ok: false, why: 'timeout' };
}

group('3. a fake G plays every stage to completion (no document)');
{
  const G = makeG();
  const m = { def, stages, idx: 0 };
  let all = true; const times = {};
  for (const st of stages) {
    const r = play(G, m, st);
    times[st.kind] = r.t;
    ok(r.ok, `stage ${st.kind} completes`, r.why);
    if (!r.ok) { all = false; break; }
    if (st.passengers) G.veh.passengers += st.passengers;
  }
  ok(all, 'the whole night plays through');
  ok(times.watch > TUNE.watchSeconds - 1, `the watch takes its time (${times.watch?.toFixed(1)} s)`);
  ok(times.stranger >= TUNE.blackHold, `the black cut holds ${TUNE.blackHold} s`, times.stranger);
  ok(G.veh.resets === 1, 'the gars de l’école hand-off moved Tom once', G.veh.resets);
  ok(G.toasts.some((t) => /T’aurais-tu un beigne/.test(t)), 'the stranger asks for a doughnut');
  ok(G.toasts.some((t) => /good stake/.test(t)) && G.toasts.some((t) => /No, Sayyad/.test(t)), 'the stake pitch, and no');
  ok(G.toasts.some((t) => /Centre antipoison/.test(t)), 'the call plays');
  ok(G.veh.passengers === 0, 'Sayyad got in at Mike’s and went home before 299 Fraser');
  missionCleanup(G, m, false);
  ok(!m.nuitFx, 'cleanup drops the effects handle');
  ok(handOff({ veh: { x: 0, z: 0 } }) === false, 'no nav: no hand-off, no throw');
}

// ---------------------------------------------------------------- 4. teardown with a fake DOM
function fakeDom() {
  const byId = new Map();
  const mk = (tag) => {
    const n = {
      tagName: tag, id: '', style: {}, attrs: {}, children: [], parentNode: null, textContent: '',
      setAttribute(k, v) { this.attrs[k] = v; },
      appendChild(c) { c.parentNode = this; this.children.push(c); if (c.id) byId.set(c.id, c); return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; if (c.id) byId.delete(c.id); },
      querySelector(sel) { return this._q?.[sel] || null; },
      set innerHTML(h) { this._html = h; this._q = { feOffset: mk('feOffset'), feGaussianBlur: mk('feGaussianBlur') }; },
    };
    return n;
  };
  const body = mk('body');
  const canvas = mk('canvas'); canvas.id = 'gl'; canvas.style.filter = 'saturate(1.1)'; canvas.style.transform = '';
  body.appendChild(canvas);
  return {
    body, canvas,
    createElement: (t) => mk(t), createElementNS: (ns, t) => mk(t),
    getElementById: (id) => byId.get(id) || null,
    querySelector: (s) => (s === 'canvas' ? canvas : null),
  };
}

group('4. effects tear down on success, abort, and mid-cut');
{
  const doc = fakeDom();
  globalThis.document = doc;
  try {
    const fx = createNuitFx();
    fx.clock('23 h 40'); fx.black(true); fx.tag('Le gars: 30 m derrière'); fx.daze(1, 0.5);
    ok(doc.body.children.length >= 5, 'clock, black, tag, vignette, svg are on screen', doc.body.children.length);
    ok(doc.canvas.style.filter === 'url(#nuittim-dv)', 'double-vision filter on the canvas', doc.canvas.style.filter);
    FX.mode = 'css'; fx.daze(0.8, 1.0);
    ok(/blur\(/.test(doc.canvas.style.filter) && /scale/.test(doc.canvas.style.transform), 'css fallback: blur + sway');
    FX.mode = 'svg';
    fx.teardown();
    ok(doc.body.children.length === 1, 'teardown leaves only the canvas', doc.body.children.length);
    ok(doc.canvas.style.filter === 'saturate(1.1)' && doc.canvas.style.transform === '', 'canvas filter/transform restored exactly');

    // Success: play the whole mission with the DOM present.
    const G = makeG();
    const m = { def, stages: def.build({}), idx: 0 };
    let blackSeen = false, dazeSeen = false;
    for (const st of m.stages) {
      const origTick = st.onTick;
      if (origTick) st.onTick = (...a) => {
        const r = origTick(...a);
        if (doc.getElementById('nuittim-black')) blackSeen = true;
        if (doc.canvas.style.filter.includes('nuittim')) dazeSeen = true;
        return r;
      };
      const r = play(G, m, st);
      if (!r.ok) { ok(false, `DOM run: ${st.kind}`, r.why); break; }
    }
    ok(blackSeen, 'the black cut went up during the punch');
    ok(dazeSeen, 'double vision was on during the walk');
    missionCleanup(G, m, false);
    ok(doc.body.children.length === 1 && doc.canvas.style.filter === 'saturate(1.1)', 'success: nothing left on screen');

    // Abort in the middle of the dazed walk (Backspace / failure path).
    for (const cut of ['watch', 'stranger', 'walk', 'school']) {
      const G2 = makeG();
      const m2 = { def, stages: def.build({}), idx: 0 };
      for (let i = 0; i < m2.stages.length; i++) {
        const st = m2.stages[i];
        if (st.kind === cut) {
          m2.idx = i; m2.target = stageTarget(G2, m2, st); stageEnter(G2, m2, st);
          if (cut === 'stranger') { G2.wantStart = true; for (let k = 0; k < 30; k++) stageStep(G2, m2, st, 1 / 30); }
          else for (let k = 0; k < 10; k++) stageStep(G2, m2, st, 1 / 30);
          break;
        }
        play(G2, m2, st);
      }
      ok(doc.body.children.length > 1 || cut === 'school', `${cut}: something is on screen before the abort`);
      missionCleanup(G2, m2, true);
      ok(doc.body.children.length === 1 && doc.canvas.style.filter === 'saturate(1.1)', `abort during ${cut}: everything torn down`);
    }
  } finally {
    delete globalThis.document;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
