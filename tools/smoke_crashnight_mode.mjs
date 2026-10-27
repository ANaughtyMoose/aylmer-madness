// [w7-crashnight] C-04 Crash Night as a mode: the junction plan on the real
// road graph, the lights, the pinned wave, three scripted tries through the
// stage's onTick with the real Traffic and Signals, the record, the cleanup,
// and the mode tab. Loads the map (run it on the test VM, not on the Mac).
class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
globalThis.localStorage = new FakeStorage();

await import('../src/game/mapdata.js');
const { Traffic } = await import('../src/game/traffic.js');
const { Signals } = await import('../src/game/signals.js');
const CN = await import('../src/game/crashnight.js');
const modes = await import('../src/game/modes.js');
const { CRASH, WAVE, planJunction, setLightsForTry, crashNightMission, installCrashNight, crashNightState } = CN;

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL ' + m); } };

// ---- the plan
const traffic = new Traffic(26, 7);
const signals = new Signals();
traffic.signals = signals;
const plan = planJunction(traffic, signals);
ok(!!plan, 'plan found');
const J = CRASH.junction;
ok(Math.hypot(plan.sig.x - J.x, plan.sig.z - J.z) < 5, 'signal by its two road names, within 5 m');
const sd = Math.hypot(plan.start.x - J.x, plan.start.z - J.z);
ok(sd > 140 && sd < 195, 'start about 170 m back: ' + sd.toFixed(1));
ok(plan.start.x < J.x, 'start west of the junction');
const toJ = Math.atan2(J.x - plan.start.x, J.z - plan.start.z);
const dyaw = Math.abs(Math.atan2(Math.sin(toJ - plan.start.a), Math.cos(toJ - plan.start.a)));
ok(dyaw < 0.35, 'start faces the junction: ' + (dyaw * 57.3).toFixed(1) + ' deg');
ok(plan.queue.length === 3, '3 queue slots');
ok(plan.cross.length >= 1, 'cross approach found: ' + plan.cross.length);
console.log(`plan: start (${plan.start.x.toFixed(1)}, ${plan.start.z.toFixed(1)}), ${plan.oncoming.length} oncoming, ${plan.cross.length} cross`);

// ---- the lights: cross green GO..GO+12, player not green before GO+15
setLightsForTry(signals, plan, CRASH.countdown);
let lightsOk = true;
const t0 = signals.t;
for (let s = 0; s <= CRASH.countdown + 15; s += 0.5) {
  signals.t = t0 + s;
  const rel = s - CRASH.countdown;
  const me = signals.stateName(plan.sig, plan.playerAxis), x = signals.stateName(plan.sig, plan.crossAxis);
  if (me === 'green' && rel < 14.9) lightsOk = false;
  if (rel >= 0 && rel < 14.9 && me !== 'red') lightsOk = false;
  if (rel >= 0.01 && rel < 11.9 && x !== 'green') lightsOk = false;
}
ok(lightsOk, 'lights: cross green from GO, player red GO..GO+15');

// ---- a full night with a scripted straight run
function stubVeh() {
  return {
    x: 0, z: 0, y: 0, yaw: 0, vx: 0, vz: 0, vLong: 0, yawSpin: 0, mass: 1500, len: 5.1, wid: 1.9,
    damage: 12, spec: { id: 'ranger', name: 'Ranger' },
    hit(closing) { this.damage += 2 * (this.damageSensitivity ?? 1) * closing / 18; },
    syncFrame() {}, repair() { this.damage = 0; },
    reset(x, z, a, y = 0) { this.x = x; this.z = z; this.yaw = a; this.y = y; this.vx = 0; this.vz = 0; this.vLong = 0; },
  };
}
function night(G, drive = true) {
  G.crashPlan = plan;
  const def = crashNightMission(G);
  const stages = def.build({});
  const st = stages[0];
  ok(st.at && isFinite(st.at.x) && !st.noTarget, 'stage has a finite at');
  ok(st.condition() === false, 'stage never finishes on its own');
  const m = { def, stages };
  G.mission = m;
  st.onEnter(G, m, st);
  const tr = G.traffic, v = G.veh;
  const dt = 1 / 60;
  let t = 0, res = null, heldOk = true;
  const held = G.crashNight.hold.map((h) => ({ c: h.c, x: h.x, z: h.z }));
  while (t < 120 && res !== 'done') {
    const S = G.crashNight;
    if (drive && S.phase === 'run') {
      // Aim at the back of the queue (the last pinned car on your side), then the box.
      const q = S.hold[2] && S.hold[2].c ? S.hold[2].c : J;
      const a = Math.atan2(q.x - v.x, q.z - v.z), sp = Math.min(28, (v.vLong || 0) + 4 * dt);
      v.yaw = a; v.vLong = sp; v.vx = Math.sin(a) * sp; v.vz = Math.cos(a) * sp;
      v.x += v.vx * dt; v.z += v.vz * dt;
    }
    tr.update(dt, v);
    G.signals.update(dt);
    res = st.onTick(G, m, st, dt);
    if (S && S.tries.length === 0 && S.phase === 'run' && S.t < 8 && !drive) {
      for (const h of held) if (Math.hypot(h.c.x - h.x, h.c.z - h.z) > 0.1) heldOk = false;
    }
    t += dt;
  }
  const S = G.crashNight;
  def.cleanup(G, m);
  G.mission = null;
  return { res, t, tries: S.tries.map((x) => x.total), heldOk, def, last: S };
}
const orig = traffic.cars.map((c) => ({ c, spec: c.spec, len: c.len, tint: c.tint, pace: c.pace }));
const toasts = [];
const G = {
  traffic, signals, veh: stubVeh(), phys: { groundY: () => 0 }, health: {},
  hud: { toast: (s) => toasts.push(s), setObjective() {} }, cops: { clear() {} },
  character: 'tom', carId: 'ranger',
};
const r1 = night(G, true);
ok(r1.res === 'done', 'three tries finish: ' + r1.res);
ok(r1.tries.length === 3, '3 tries');
ok(r1.t <= 80, 'night under 80 s of sim: ' + r1.t.toFixed(1));
ok(r1.tries.every((x) => x > 0), 'straight run scores every try: ' + r1.tries.join(' / '));
console.log('scores ' + r1.tries.join(' / ') + ', medal ' + CN.medalFor(Math.max(...r1.tries)));
ok(G.veh.damage === 12, 'player damage back to before the night: ' + G.veh.damage);
ok(G.veh.damageSensitivity === undefined, 'damageSensitivity restored');
ok(orig.every((o) => o.c.spec === o.spec && o.c.len === o.len && o.c.tint === o.tint && o.c.pace === o.pace), 'every traffic car restored');
ok(traffic.cars.every((c) => c.respawnT < 1e9 && c.stunT < 1e9), 'no car left parked away');
ok(traffic.onHit == null, 'traffic hook released');
ok(!WAVE.some((w) => ['ranger', 'saturn', 'civic', 'sunfire', 'forester', 'sienna', 'cavalier'].includes(w.spec)), 'no cast car in the wave');
const rec = (await import('../src/game/save.js')).loadRecord('crashnight');
ok(rec && rec.t === Math.max(...r1.tries) && rec.better === 'higher', 'record saved, higher is better');
const result = r1.def.result(G);
ok(/TÔLE FROISSÉE/.test(result.toast) && result.best === Math.max(...r1.tries), 'result toast: ' + result.toast.split('\n')[0]);
ok(!/[–—]/.test(result.toast + toasts.join('')), 'no em or en dash in player text');

// ---- no contact: the pinned wave holds, a try with no hit scores 0
const r2 = night(G, false);
ok(r2.heldOk, 'queue and oncoming pinned until touched');
ok(r2.tries.length === 3 && r2.tries.every((x) => x === 0), 'no hit scores 0 and still counts');
ok(crashNightState(G).phase === null && crashNightState(G).best === Math.max(...r1.tries), 'state after the night shows the record');

// ---- the mode tab
const api = installCrashNight(G, { startMission: () => true }, modes);
ok(modes.MODES.some((m) => m.id === 'crashnight'), 'registered with the mode picker');
ok(typeof api.start === 'function' && typeof api.records === 'function', 'install returns start/state/records');
G.mission = { def: { title: 'Une job', mode: undefined } };
ok(api.start() === false, 'refuses over a story job');
// W8-BUGS: a Balade libre start puts L'alternateur on by itself. Picked from M
// before the player has done anything in it, Tôle froissée starts, like a
// course does (one rule, missionkit yieldsToMode); startMission closes it
// quietly (no RATÉ). A real job, or the first job once moved on, keeps the refusal.
{
  let failed = 0;
  G.failMission = () => { failed++; };
  const auto = { def: { id: 'alternateur', title: 'L’alternateur' }, idx: 0, autoStarted: true };
  G.mission = auto;
  ok(modes.busyWith(G) === null, 'M picker: the untouched auto-started first job does not grey the rows');
  G.modeNow = 'cruise';
  ok(api.start() === true && failed === 0, 'Tôle froissée starts over the untouched auto-started first job, without a fail');
  G.mission = { ...auto, idx: 1 };
  ok(modes.busyWith(G) === 'L’alternateur' && api.start() === false, 'once the first job has moved on, both refuse');
  G.mission = { def: { id: 'alternateur', title: 'L’alternateur' }, idx: 0 };
  ok(modes.busyWith(G) === 'L’alternateur' && api.start() === false, 'the same job taken by the player (not auto-started) is refused');
  G.failMission = undefined;
}
G.mission = null;
G.modeNow = 'cruise';

console.log(fails ? `smoke_crashnight_mode: ${fails} FAIL` : `smoke_crashnight_mode: ${n}/${n} ok`);
if (fails) process.exit(1);
