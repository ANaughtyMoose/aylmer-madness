// The mission stage model.
//
// A stage used to be "drive into a circle", optionally with a timer, a speed
// limit, a passenger delta and a toast. That still works exactly as before — the
// six original jobs are untouched — but a stage is now a small state machine so
// a job can ask for more than a radius:
//
//   text, sub            objective lines. The rule the story layer holds every
//                        stage to: `text` is the goal, `sub` is HOW — and `sub`
//                        names the key that does it (E, W/S, A/D, Espace, GPS).
//   hint                 the same thing said a third way, for a player who has
//                        stopped moving: it comes up in the prompt after
//                        HINT_AFTER seconds in the stage, and story.js's stuck
//                        detector toasts it again after twenty seconds of not
//                        going anywhere.
//   at, radius           the circle to reach; `at` is a PLACES key, an {x,z},
//                        or a function (G) => {x,z}. Omit for no destination.
//   time                 seconds for this stage (unchanged)
//   maxSpeed             km/h ceiling inside the circle (unchanged)
//   passengers, toast    applied on completion (unchanged)
//
//   kind                 free-form label, for readability
//   stopped: kmh         you must be at (under) this speed, default 6 for `hold`
//   hold: true           ...and press E. `holdText` is the prompt.
//   cost: n              dollars charged on completion; blocked, with a prompt,
//                        if the wallet is short
//   gate(G, m, st)       return a string to block completion and show it
//   condition(G, m, st)  extra test, ANDed with the radius test
//   prompt(G, m, st)     HUD prompt every tick (return null to clear)
//   onEnter/onExit       (G, m, st) — spawn and tear down props, boats, meters
//   onTick(G, m, st, dt) return 'done' to finish the stage now, or
//                        { fail: 'why' } to blow the whole job up
//   money                dollars added on completion (negative to charge)
//   focus: 'boat'        what the camera follows while this stage runs
//   anywhere             keep the map marker, but do not require being in it
//   noTarget             no map marker at all
//   noRoute              marker, but no GPS line (you are on the water)
//   failWhy              the failure text if the timer runs out here
//
// A mission may also carry `cleanup(G)`, called whenever it ends for any reason.
import { PLACES } from './places.js';

// Seconds in a stage before its `hint` starts showing up in the prompt. Long
// enough that a player who knows what he is doing never sees it.
export const HINT_AFTER = 6;

/**
 * « Psst: ... » — the stage's hint, once the player has been sitting in this
 * stage long enough to look lost. Null when there is no hint or it is too soon.
 */
export function stageHint(m, st) {
  if (!st || !st.hint) return null;
  if (!m || (m.stageTime || 0) < HINT_AFTER) return null;
  return 'Psst: ' + st.hint;
}

export function resolveAt(at, G) {
  if (at == null) return null;
  if (typeof at === 'function') return at(G);
  if (typeof at === 'string') return PLACES[at];
  return at;
}

export function stageTarget(G, m, st) {
  if (st.noTarget) return null;
  const p = resolveAt(st.at, G);
  if (!p) return null;
  return { x: p.x, z: p.z, r: st.radius || 14 };
}

export function stageEnter(G, m, st) {
  m.stageTime = 0;
  m.held = false;
  if (st.onEnter) st.onEnter(G, m, st);
}

export function stageExit(G, m, st) {
  if (st && st.onExit) st.onExit(G, m, st);
}

// Who the camera and the HUD follow this stage.
export function stageActor(G, st) {
  if (st && st.focus === 'boat' && G.boat) return G.boat;
  return G.veh;
}

// One fixed step of the active stage. Returns 'done', { fail } or null, and owns
// the HUD prompt while it runs.
export function stageStep(G, m, st, dt) {
  m.stageTime = (m.stageTime || 0) + dt;
  const hud = G.hud;
  const v = stageActor(G, st);

  if (st.onTick) {
    const r = st.onTick(G, m, st, dt);
    if (r === 'done') return 'done';
    if (r && r.fail) return r;
  }

  // Custom prompt first; the hold/speed prompts below may override it.
  let promptText;
  let promptSet = false;
  if (st.prompt) { promptText = st.prompt(G, m, st); promptSet = true; }

  // Where you have to be.
  let inPlace = true;
  if (m.target && !st.anywhere) {
    const d = Math.hypot(v.x - m.target.x, v.z - m.target.z);
    inPlace = d < m.target.r;
    if (inPlace && st.maxSpeed && v.speedKmh > st.maxSpeed) {
      hud?.prompt(`Ralentis — ${Math.round(st.maxSpeed)} km/h max ici`);
      return null;
    }
  }
  if (inPlace && st.condition) inPlace = !!st.condition(G, m, st);

  const stopAt = st.stopped != null ? st.stopped : (st.hold ? 6 : null);
  if (inPlace && stopAt != null && v.speedKmh > stopAt) {
    hud?.prompt(st.stopText || 'Arrête-toi');
    return null;
  }

  // A stage that has been sitting still for a while starts whispering.
  const hint = stageHint(m, st);
  if (!inPlace) {
    if (promptSet) hud?.prompt(promptText ?? hint ?? null);
    else if (st.maxSpeed || st.hold || stopAt != null) hud?.prompt(hint ?? null);
    else if (hint) hud?.prompt(hint);
    return null;
  }

  // Money and any custom gate.
  const gate = blockedBy(G, m, st);
  if (gate) { hud?.prompt(gate); return null; }

  if (st.hold) {
    hud?.prompt(st.holdText || 'E — continuer');
    if (!G.wantStart) return null;
    G.wantStart = false;
  } else if (promptSet) {
    hud?.prompt(promptText ?? null);
  }
  return 'done';
}

// The reason this stage cannot be completed right now, or null.
export function blockedBy(G, m, st) {
  if (st.cost && G.wallet && !G.wallet.can(st.cost)) {
    return st.brokeText || `Il te manque ${Math.round(st.cost - G.wallet.value)} $. Reviens quand t'auras l'argent.`;
  }
  if (st.gate) return st.gate(G, m, st) || null;
  return null;
}

// Charge / pay for a stage that has just completed.
export function stageSettle(G, m, st) {
  if (!G.wallet) return;
  if (st.cost) G.wallet.spend(st.cost);
  if (st.money) G.wallet.add(st.money);
}

// Called when a job ends for any reason. `aborted` means we are bailing out of a
// stage that never finished, so that stage still needs its onExit.
export function missionCleanup(G, m, aborted) {
  if (!m) return;
  if (aborted) {
    try { stageExit(G, m, m.stages[m.idx]); } catch (e) { console.warn('stage cleanup', e); }
  }
  try { if (m.def && m.def.cleanup) m.def.cleanup(G, m); } catch (e) { console.warn('mission cleanup', e); }
  if (G.boat) G.boat.active = false;
  G.boat = null;
  G.focus = null;
}

// A little text meter for the prompt line: [·······▬▬◆▬▬·······]
export function meterBar(pos, lo, hi, n = 27) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (Math.abs(t - pos) < 0.5 / n) s += '◆';
    else if (t >= lo && t <= hi) s += '▬';
    else s += '·';
  }
  return '[' + s + ']';
}

// A plain fill bar: [▮▮▮▮▮·····]
export function fillBar(frac, n = 12) {
  const k = Math.round(Math.max(0, Math.min(1, frac)) * n);
  return '[' + '▮'.repeat(k) + '·'.repeat(n - k) + ']';
}
