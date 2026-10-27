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
  // hintTime only runs while no story line or card is up (main.js sets
  // G.hintHold); a bare stage from an old caller falls back to stageTime.
  const t = m && m.hintTime != null ? m.hintTime : (m && m.stageTime) || 0;
  if (!m || t < HINT_AFTER) return null;
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
  m.hintTime = 0;
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
  if (!G.hintHold) m.hintTime = (m.hintTime || 0) + dt;
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
      hud?.prompt(`Ralentis : ${Math.round(st.maxSpeed)} km/h max ici`);
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
    hud?.prompt(st.holdText || 'E : continuer');
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

// The pay scale is calendar.js's: PAY_LIFT × difficulty for jobs, difficulty
// alone for races — both the M-menu courses (a def with `mode`) and the four
// race jobs (racejobs.js sets `race: true` and no `mode`, which is why they
// used to pick up the lift by mistake; progression review P9). Unset — every
// node suite — is 1, so the dollar amounts those suites were written against
// still hold.
//
// ...and then what KIND of run this is (progression review P3/P5). The
// calendar used to cap farming, because every job cost a day; the prototype
// runs on the clock, so nothing did. Now:
//   * a campaign job pays in full the first time;
//   * a replay of a job you have finished pays REPLAY.share (25 %), once per
//     job per game day, and nothing on further replays that day. No style
//     bonus on a replay either (missionStyleBonus reads the flag);
//   * an M-menu course pays its purse on the first win, then MODE_PB_PAY only
//     for beating your own best time (G.best, which the save carries), else
//     nothing.
// Ambushes (`mode: 'ambush'`, no `course`) are a bet, not a course: they pay
// the bet every time, and cost it when you lose (ambush.js).
export const REPLAY = { share: 0.25 };
export const MODE_PB_PAY = 10;

const today = (G) => Math.floor((G && Number.isFinite(G.day)) ? G.day : 0);

/**
 * What this run pays, as a fraction of the listed money, decided once at its
 * first paid stage and remembered on `m.payKind` so a four-stage replay does
 * not re-decide half way. Returns { kind, k } with kind one of 'first',
 * 'replay', 'replay-unpaid', 'mode-first', 'mode-pb', 'mode-repeat', 'bet'.
 */
// [w7-polish] One clock for a course: the race time from GO (m.race.t), the
// clock its medals and « ton record » use (W6-REPLAY). m.elapsed also counts
// the grid and the E hold. A course's G.best, purse and best-time toast all
// read this; m.elapsed is the fallback before a race clock exists.
export function courseTime(m) {
  if (!m) return 0;
  return m.race && m.race.t > 0 ? m.race.t : (m.elapsed || 0);
}

export function runPay(G, m) {
  if (m && m.payKind) return m.payKind;
  const def = m && m.def;
  let out = { kind: 'first', k: 1 };
  if (def && def.course) {
    const prior = G && G.best ? G.best[def.id] : null;
    // An old save's grid-inclusive best (save.js bestLegacy) still means « won
    // once », but it is on the other clock, so it is never compared against.
    const legacy = G && G.bestLegacy ? G.bestLegacy[def.id] : null;
    const t = courseTime(m);
    if (prior == null && legacy == null) out = { kind: 'mode-first', k: 1 };
    else if (prior != null && Number.isFinite(t) && t > 0 && t < prior) out = { kind: 'mode-pb', k: 1, cap: MODE_PB_PAY };
    else out = { kind: 'mode-repeat', k: 0 };
    // Settled at the finish, so the time is final: decide every time.
    return out;
  }
  if (def && def.mode) out = { kind: 'bet', k: 1 };
  else if (def && G && G.done && G.done.has && G.done.has(def.id)) {
    const paid = G.replayPaid || (G.replayPaid = {});
    if (paid[def.id] === today(G)) out = { kind: 'replay-unpaid', k: 0 };
    else {
      out = { kind: 'replay', k: REPLAY.share };
      paid[def.id] = today(G);
      if (m) m.replayMarked = true;
    }
  }
  if (m) {
    m.payKind = out;
    // The style bonus is worked out by main.js from m.styleStart; this is how
    // it learns the run was a replay without main.js having to ask.
    if (out.kind.startsWith('replay') && m.styleStart) m.styleStart.replay = true;
  }
  return out;
}

export function scaledPay(G, m, money) {
  if (!(money > 0)) return 0;
  const race = !!(m && m.def && (m.def.mode || m.def.race));
  const k = (G && (race ? G.racePayScale : G.payScale)) || 1;
  const full = Math.round(money * k);
  // Without a G (the node payout tables) there is no history: full price.
  if (!G || !m || !m.def) return full;
  const run = runPay(G, m);
  let pay = Math.round(full * run.k);
  if (run.cap != null) pay = Math.min(pay, run.cap);
  return pay;
}

// Charge / pay for a stage that has just completed. `m.paid` is the running
// ledger for THIS job: what a failed or abandoned job hands back (see
// refundJob), because paying per stage and keeping it on failure was a money
// press: the old garage-bill job (cut, D31) banked $90 per Backspace.
export function stageSettle(G, m, st) {
  if (!G.wallet) return;
  if (m && m.paid == null) m.paid = 0;
  if (st.cost) { G.wallet.spend(st.cost); if (m) m.paid -= st.cost; }
  if (st.money) { const p = scaledPay(G, m, st.money); if (p) G.wallet.add(p); if (m) m.paid += p; }
}

/**
 * QA F7: a stage toast that names its own pay (« Bonus de formation, 22 $ »)
 * shows what the wallet actually got, after PAY_LIFT and the replay rules
 * (scaledPay). `stated` is the stage's written `money`; `actual` is the real
 * change. Nothing paid: the amount is dropped rather than shown wrong.
 */
export function payText(text, stated, actual) {
  if (!text || !(stated > 0)) return text;
  const re = new RegExp('(,\\s*)?\\b' + Math.round(stated) + '\\s*\\$', 'g');
  const got = Math.round(actual || 0);
  return got > 0 ? text.replace(re, (all, lead) => (lead || '') + got + ' $')
    : text.replace(re, '').replace(/\s+\./g, '.');
}

// A job ended badly: the stages it already paid for come back out of the
// wallet (never below zero — you may have spent it on gas, and gas is gone).
// Costs you paid stay paid. Returns what was clawed back. A replay that
// failed gives its once-a-day slot back too: you did not get paid for it.
export function refundJob(G, m) {
  if (m && m.replayMarked && G && G.replayPaid && m.def) {
    delete G.replayPaid[m.def.id];
    m.replayMarked = false;
  }
  if (m) m.payKind = null;
  if (!G.wallet || !m || !(m.paid > 0)) return 0;
  const back = Math.min(m.paid, G.wallet.value);
  G.wallet.add(-back);
  m.paid = 0;
  return back;
}

/**
 * index.html only: what « Recommencer la job » should cost. A restart is a
 * failure you chose, so it costs what failMission would have: the day, once
 * the job is past its first stage or 45 s in (main.js failMission's rule).
 * main.js calls endOfJob() when this is true; see docs/review/progression-economy.md.
 */
export function restartCostsDay(m) {
  return failCostsDay(m);
}

/**
 * The rule failMission applies: a job you actually started (past its first
 * stage, or 45 s in) costs the day; Backspace inside the first minute is
 * reading the brief. retry.js uses the same rule to decide whether a fail has a
 * day to defer while its free retry is on offer.
 */
export function failCostsDay(m) {
  return !!(m && (m.idx > 0 || (m.elapsed || 0) > 45));
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

// A small replayable side-score for every job. It deliberately uses things the
// driving model already celebrates instead of asking the player to learn a new
// control: thread traffic, find a ramp, or bring the car back in one piece.
// Prop damage is tracked for the stats screen but is not paid here; otherwise
// the optimal delivery route would be straight through every patio in Aylmer.
//
// B-03 (plan v2): once the style chain is live (style.js, ticked by
// reactive.js, which keeps `G.stats.styleTips`), near misses and jumps are
// paid as they happen, uncapped, by the chain's table; the 8 / 9 / 5 caps and
// the 22 $ ceiling below no longer bind, and the end of the job pays only the
// clean-car 5 $ and reports what the chain paid on the way. The capped sum is
// kept for a caller that has no chain (a node table with bare stats), so the
// two can never both pay the same near miss.
export const STYLE_END = { near: 2, nearMax: 8, jump: 3, jumpMax: 9, clean: 5, cleanDamage: 4 };
export function missionStyleBonus(start, now, damageNow) {
  const a = start?.stats || {};
  const b = now || {};
  // Pedestrian grazes (nearMiss) plus, with the chain live, its traffic near
  // misses (styleNear), for the feats line only.
  const near = Math.max(0, (b.nearMiss || 0) - (a.nearMiss || 0));
  const nearAll = near + Math.max(0, (b.styleNear || 0) - (a.styleNear || 0));
  const jumps = Math.max(0, (b.jumps || 0) - (a.jumps || 0));
  const damage = Math.max(0, (damageNow || 0) - (start?.damage || 0));
  const clean = damage <= STYLE_END.cleanDamage;
  const live = b.styleTips !== undefined;
  const tips = live ? Math.max(0, (b.styleTips || 0) - (a.styleTips || 0)) : 0;
  const E = STYLE_END;
  // A replay (runPay flagged it on the way through) earns the feats, not the money.
  const money = start && start.replay ? 0
    : live ? (clean ? E.clean : 0)
      : Math.min(E.nearMax, near * E.near) + Math.min(E.jumpMax, jumps * E.jump) + (clean ? E.clean : 0);
  const feats = [];
  if (nearAll) feats.push(`${nearAll} frôlement${nearAll > 1 ? 's' : ''}`);
  if (jumps) feats.push(`${jumps} saut${jumps > 1 ? 's' : ''}`);
  if (tips) feats.push(`${tips} $ de style en route`);
  if (clean) feats.push('char intact');
  return { money, near, jumps, clean, tips, live, text: feats.join(' · ') };
}

/**
 * B-03: may the style chain pay a tip right now? On a job's first run, and in
 * free roam (S1-B03: driving well pays wherever you drive; STYLE_FREE_ROAM is
 * the switch). Never on a replay of a job (the same rule as the end-of-job
 * bonus: a replay earns the feats, not the money), and never on an M-menu
 * course or a bet, which pay their own purse.
 */
export const STYLE_FREE_ROAM = true;
export function styleTipsPaying(G) {
  const m = G && G.mission;
  if (!m || !m.def) return STYLE_FREE_ROAM && !!G;
  if (m.def.mode || m.def.course) return false;
  if (m.styleStart && m.styleStart.replay) return false;
  if (G.done && G.done.has && G.done.has(m.def.id)) return false;
  return true;
}

// W8-BUGS: does this job step aside for a mode picked from M (a course, Crash
// Night)? Only the first job the game started on its own (main.js marks
// L'alternateur `autoStarted` after a Balade libre start) and only while it is
// still on its first stage: the player never chose it and has done nothing in
// it yet. Any job the player took, or has moved on in, keeps the refusal.
export function yieldsToMode(m) {
  return !!(m && m.def && !m.def.mode && m.autoStarted && !((m.idx || 0) > 0));
}
