// Skills that improve with use (Wave 3). Three of them, earned by driving, not
// bought: braking late without hitting anything, holding a car sideways, and
// getting off the line. Each is a 0..1 number in G.stats (so the save carries
// it) and feeds the car as a small multiplier on the spec — the same trick
// weather.js plays, chained outside it so its cache still sees the base spec.
// The numbers are deliberately modest: a maxed driver brakes 10 % later,
// corners 6 % harder, launches 6 % quicker. The player gets better; the car
// does not turn into a different car.

export const SKILLS = {
  brake:  { key: 'skBrake',  field: 'brake', max: 0.10, lines: ['Tu freines plus tard.', 'Tu freines quand il faut, pas avant.', 'Tu freines comme quelqu’un qui a un char.'] },
  corner: { key: 'skCorner', field: 'grip',  max: 0.06, lines: ['Tu tiens le char de travers.', 'Le derrière sort quand tu le veux.', 'T’as arrêté d’avoir peur du frein à main.'] },
  launch: { key: 'skLaunch', field: 'accel', max: 0.06, lines: ['Tu cales plus.', 'Tu pars sans faire crier les pneus.', 'Le feu vert, c’est toi.'] },
};
const LEVELS = [0.34, 0.67, 1.0];

const S = { prevV: 0, brakeT: 0, launchT: -1, launchFrom: 0 };

function gain(G, id, amount, hud) {
  const sk = SKILLS[id];
  const st = G.stats; if (!st) return;
  const before = st[sk.key] || 0;
  const after = Math.min(1, before + amount);
  st[sk.key] = after;
  const lvlKey = sk.key + 'Lvl';
  const lvl = st[lvlKey] || 0;
  if (lvl < LEVELS.length && after >= LEVELS[lvl]) {
    st[lvlKey] = lvl + 1;
    if (hud && hud.toast) hud.toast(sk.lines[lvl], 2800);
  }
}

/**
 * Once a tick, after the car has integrated. `ctl` is what the player asked
 * for this frame; `v.lastHit` is still this frame's impact (driveHooks zeroes
 * it later in the tick).
 */
export function tick(G, dt, v, ctl, hud) {
  if (!v || !G.stats || dt <= 0) return;
  const sp = v.vLong || 0;
  const acc = (sp - S.prevV) / dt;
  S.prevV = sp;
  const hit = (v.lastHit || 0) > 0.05;

  // Late braking: a real stop (> 6 m/s² for half a second) from speed, clean.
  if (ctl && ctl.brake > 0.5 && acc < -6 && sp > 6 && !hit) {
    S.brakeT += dt;
    if (S.brakeT > 0.5) { gain(G, 'brake', 0.025, hud); S.brakeT = -1.5; }
  } else if (S.brakeT > 0 || hit) S.brakeT = Math.min(0, S.brakeT);
  else if (S.brakeT < 0) S.brakeT = Math.min(0, S.brakeT + dt);

  // Holding it sideways at speed, without touching anything.
  if (Math.abs(v.vLat || 0) > 2.5 && sp > 8 && !hit) gain(G, 'corner', dt * 0.012, hud);

  // The launch: full throttle from a standstill to 8 m/s inside 2.5 s.
  if (ctl && ctl.throttle > 0.9 && sp < 0.8 && S.launchT < 0) { S.launchT = 0; }
  if (S.launchT >= 0) {
    S.launchT += dt;
    if (sp >= 8) { if (S.launchT <= 2.5 && !hit) gain(G, 'launch', 0.03, hud); S.launchT = -1; }
    else if (S.launchT > 3 || (ctl && ctl.throttle < 0.5)) S.launchT = -1;
  }
}

/** What each skill multiplies right now. */
export function multipliers(G) {
  const st = (G && G.stats) || {};
  const out = {};
  for (const id of Object.keys(SKILLS)) { const sk = SKILLS[id]; out[sk.field] = 1 + sk.max * Math.max(0, Math.min(1, st[sk.key] || 0)); }
  return out;
}

const cache = new Map();
/** The spec the car drives this frame: the base (or weather's clone) with the skill multipliers on it. */
export function specFor(spec, G) {
  if (!spec || !G || !G.stats) return spec;
  const m = multipliers(G);
  if (m.brake < 1.004 && m.grip < 1.004 && m.accel < 1.004) return spec;
  const bucket = Math.round(m.brake * 250) * 1e6 + Math.round(m.grip * 250) * 1e3 + Math.round(m.accel * 250);
  let hit = cache.get(spec.id);
  if (hit && hit.bucket === bucket && hit.base === spec) return hit.spec;
  const out = { ...spec, brake: spec.brake * m.brake, grip: spec.grip * m.grip, accel: spec.accel * m.accel };
  cache.set(spec.id, { bucket, base: spec, spec: out });
  return out;
}

export function reset() { S.prevV = 0; S.brakeT = 0; S.launchT = -1; cache.clear(); }
