// Mission 8, « La nuit du Tim » (id nuittim). The low point of the summer.
//
// Tom's real night, his framing: funny in hindsight AND serious. Sam (a
// friend) is black-out drunk. Tom, Sayyad and Mike, none of them drinking (Tom
// never drank), call the Centre antipoison and watch him for hours. Then, at
// three in the morning, Tom and Sayyad go to the Tim Hortons on Principale,
// where the friends who work there leave the old muffins and doughnuts out
// back. A stranger asks for a doughnut. Tom says sure. The stranger punches
// him. Hard cut to black. Then the walk home, dazed, with the stranger still
// following, Sayyad pitching a wooden stake off a garage-sale sign (Tom says
// no), and un gars de l'école walking Tom most of the way to 299 Fraser.
//
// Tom's rulings (docs/STORY-LEDGER.md, 29 Sept): the friend is Sam; LEAVE OUT
// Margaret thinking he'd been drinking. There is no Margaret in this file.
// Nobody mocks Sam. Nobody but Sam drinks.
//
// WHERE IT STARTS: chez Mike, 129 Frank-Robinson (PLACES.mike). PROPOSAL, TOM
// TO CONFIRM whose place it was. Why Mike's: it is a friend's house (the watch
// has to happen at somebody's place, not at 299 Fraser, where Margaret would
// be), Mike stays behind with Sam when the other two go for food, and it is
// about 600 m from the Tim on Principale, so the night drive is short and the
// pacing stays on the watch and the walk.
//
// ON FOOT: the game has no on-foot mode (no onFoot/walk player anywhere in
// src; peds.js is ambient only). The most feasible faithful version: the
// player keeps the controls, but the speed is clamped to a walking pace and the
// heading drifts by itself (dazeSteer), with double vision on the canvas
// (nuittim_fx.js). It reads as "walking home dazed". The truck is the
// camera's body; the text says you are walking. Known limit, see the doc.
//
// RADIO: « My Immortal » (Evanescence) would be right on the drive to the Tim.
// TODO: it is not in the private radio library (radio-library.js /
// recorded-radio.js have no such track as of 29 Sept). If Tom adds it to his
// private build, cue it on the 'tim' stage. Never ship the file.
//
// SOUND ON THE CUT: main.js keeps the audio engine module-local (no G.audio),
// so the black cut is silent only in the sense that nothing new plays. TODO if
// the lead exposes a mute hook.
//
// Pay: none. You leave with a bag of yesterday's muffins.
import { PLACES } from '../places.js';
import { createNuitFx } from './nuittim_fx.js';
import { toastLive } from '../heckle.js';

// ---------------------------------------------------------------- tuning

export const TUNE = {
  // The call: seconds between lines, E skips ahead.
  lineGap: 2.6,
  // The watch: 23 h 40 to 3 h 10 in this many seconds of play.
  watchFrom: 23 * 60 + 40,
  watchTo: 27 * 60 + 10,          // 3 h 10 the next morning (minutes, past 24 h)
  watchSeconds: 26,
  stillKmh: 6,                    // the watch clock only runs with the truck stopped
  // The cut: how long the screen stays black after the punch.
  blackHold: 2.2,
  // The walk.
  walkKmh: 11,                    // walking pace (arcade walking: honest 5 km/h is a crawl)
  walkMeters: 170,                // dazed metres before the gars de l'école shows up
  driftRadS: 0.55,                // heading drift at full daze, rad/s
  dazeFade: 70,                   // seconds for the daze to ease from full to the floor
  dazeFloor: 0.45,                // it never fully clears tonight
  schoolLevel: 0.35,              // daze level once he has you by the shoulder
  handoffMeters: 150,             // how far from 299 Fraser the gars de l'école lets go
  schoolCard: 4.5,                // seconds before he has walked you most of the way
  // The stranger, following.
  followNear: 22, followFar: 60, followRate: 1.2,
  // Speech pacing on the walk: one line every this many metres.
  stakeEvery: 24,
};

// ---------------------------------------------------------------- lines
// Dialogue, [who, line]. Bubbles: 12 words / 70 characters at most, no em dash.
// Narrator and staff speak Quebec French; the friends English (Tom, 6 Oct and
// 20 Oct 2026). Tom answers the Centre antipoison and the stranger in French
// because they are French: that is Aylmer, not a breach of the rule.

export const CALL_LINES = [
  ['Centre antipoison', 'Centre antipoison, bonsoir. Je vous écoute.'],
  ['Tom', 'Mon ami a trop bu. Il répond presque plus.'],
  ['Centre antipoison', 'Il respire normalement? Couchez-le sur le côté.'],
  ['Centre antipoison', 'Restez avec lui. Vérifiez sa respiration souvent.'],
  ['Centre antipoison', 'S’il arrête de répondre, vous faites le 911.'],
  ['Mike', 'Okay. On his side. We don’t leave him.'],
];

// Time-stamped by fraction of the watch. Calm, practical, nobody laughs at Sam.
export const WATCH_LINES = [
  [0.08, 'Sayyad', 'I’ve got his feet. On his side, like she said.'],
  [0.30, 'Mike', 'He’s breathing. Slow, but okay.'],
  [0.52, 'Sayyad', 'Nobody sleeps tonight, eh.'],
  [0.74, 'Tom', 'Still on his side. He’s breathing fine.'],
  [0.95, 'Mike', 'I got him. Go eat something.'],
];
export const CHECK_LINES = [
  'Sam respire. Lentement, mais il respire.',
  'Encore sur le côté. Tu remontes la couverte.',
  'Il marmonne quelque chose. C’est bon signe.',
  'Sa respiration est correcte. Tu te rassois.',
];

export const STRANGER_ASK = ['Un gars', 'T’aurais-tu un beigne?'];
export const TOM_SURE = ['Tom', 'Ben oui. Tiens.'];

export const WALK_LINES = [
  ['Sayyad', 'Man. Tom. You okay? Look at me.'],
  ['Sayyad', 'That guy’s still following us. Right there, behind.'],
  ['Sayyad', 'Check it. A garage sale sign.'],
  ['Sayyad', 'The stake is wood. Pointy, even.'],
  ['Sayyad', 'I’m just saying. You, the stake, him. Done.'],
  ['Tom', 'No, Sayyad.'],
  ['Sayyad', 'Fine. But it’s a good stake.'],
];

export const SCHOOL_LINES = [
  ['Un gars de l’école', 'Heille, t’es Tom? Viens, j’te ramène.'],
];

// The closing card, in Tom's voice. Tom's pick, 29 Sept 2026 (option A; "something
// funny always"). Final.
export const CLOSING = 'Sayyad maintient encore que le piquet aurait marché.';

// Every scene line is a toast, and the HUD may hold it in its queue past the
// end of its stage, so the street also waits for each one (B-08).
const toastScene = (G, text, ms) => {
  if (!G || !G.hud || !G.hud.toast) return;
  G.hud.toast(text, ms);
  if (G.heckle && G.heckle.hushWhile) G.heckle.hushWhile('nuittim:' + text, () => toastLive(G.hud, text));
};
const say = (G, who, line, ms = 2600) => toastScene(G, `${who}: « ${line} »`, ms);

// ---------------------------------------------------------------- pure mechanics

/** « 23 h 40 », « 3 h 10 ». `minutes` may run past 24 h. */
export function clockText(minutes) {
  const m = Math.floor(((minutes % 1440) + 1440) % 1440);
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h} h ${String(mm).padStart(2, '0')}`;
}

export function watchInit() {
  return { t: 0, minutes: TUNE.watchFrom, next: 0, checks: 0, done: false, say: null, check: null };
}

/**
 * One tick of the watch. input: { check: bool (E pressed), moving: bool }.
 * The clock only runs with the truck stopped. Returns a NEW state; `say` is
 * the scheduled line that fell due this tick ([who, line]) and `check` the
 * line for an E press, both null otherwise. No fail state: you just wait.
 */
export function watchStep(s, dt, input = {}) {
  const n = { ...s, say: null, check: null };
  if (n.done) return n;
  if (!input.moving) n.t = Math.min(TUNE.watchSeconds, n.t + dt);
  const f = n.t / TUNE.watchSeconds;
  n.minutes = TUNE.watchFrom + (TUNE.watchTo - TUNE.watchFrom) * f;
  if (n.next < WATCH_LINES.length && f >= WATCH_LINES[n.next][0]) {
    const [, who, line] = WATCH_LINES[n.next];
    n.say = [who, line];
    n.next++;
  }
  if (input.check) {
    n.check = CHECK_LINES[n.checks % CHECK_LINES.length];
    n.checks++;
  }
  if (f >= 1) n.done = true;
  return n;
}

export function dazeInit(level = 1) { return { t: 0, level, start: level, nudge: 0, cap: TUNE.walkKmh }; }

/**
 * The dazed walk. input: { speedKmh, floor }. Returns a NEW state with:
 *   level  0..1, easing from where it started down to `floor` over dazeFade s
 *   nudge  radians to add to the heading this tick (the drift you fight with A/D)
 *   cap    km/h ceiling this tick (walking pace)
 * The drift is two slow sines so it wanders, never a constant pull, and it is
 * mostly off while you stand still (you sway, you don't turn in place).
 */
export function dazeSteer(s, dt, input = {}) {
  const floor = input.floor != null ? input.floor : TUNE.dazeFloor;
  const t = s.t + dt;
  const k = Math.min(1, t / TUNE.dazeFade);
  const level = Math.max(floor, s.start + (floor - s.start) * k);
  const wave = Math.sin(t * 0.7) * 0.7 + Math.sin(t * 1.9 + 0.8) * 0.3;
  const moving = (input.speedKmh || 0) > 1.5;
  const nudge = TUNE.driftRadS * level * wave * dt * (moving ? 1 : 0.15);
  return { ...s, t, level, nudge, cap: TUNE.walkKmh };
}

/**
 * The stranger. gap in metres. Walking, you pull away toward followFar;
 * standing still, he closes toward followNear. He never catches up.
 */
export function followerStep(gap, dt, speedKmh) {
  const target = speedKmh > 2 ? TUNE.followFar : TUNE.followNear;
  const d = target - gap;
  const step = Math.sign(d) * Math.min(Math.abs(d), TUNE.followRate * dt);
  return gap + step;
}

/** The point `meters` back from the end of a route [[x,z],...], facing along it. */
export function pointBeforeEnd(path, meters) {
  if (!path || path.length < 2) return null;
  let left = meters;
  for (let i = path.length - 1; i > 0; i--) {
    const [bx, bz] = path[i], [ax, az] = path[i - 1];
    const seg = Math.hypot(bx - ax, bz - az);
    if (seg >= left && seg > 0) {
      const f = 1 - left / seg;
      return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, yaw: Math.atan2(bx - ax, bz - az) };
    }
    left -= seg;
  }
  const [ax, az] = path[0], [bx, bz] = path[1];
  return { x: ax, z: az, yaw: Math.atan2(bx - ax, bz - az) };
}

// Apply a heading nudge and a speed cap to the vehicle, after physics ran
// (main.js runs updateMission after v.update). The velocity turns with the
// heading so the nudge is a drift, not a skid.
export function applyWalk(v, nudge, capKmh) {
  if (!v) return;
  if (nudge && Number.isFinite(v.yaw)) {
    v.yaw += nudge;
    if (Number.isFinite(v.vx) && Number.isFinite(v.vz)) {
      // forward = (sin yaw, cos yaw): rotating by +nudge maps (vx,vz) like this.
      const c = Math.cos(nudge), s = Math.sin(nudge);
      const vx = v.vx * c + v.vz * s, vz = -v.vx * s + v.vz * c;
      v.vx = vx; v.vz = vz;
    }
  }
  if (capKmh != null) {
    const cap = capKmh / 3.6;
    if (Number.isFinite(v.vx) && Number.isFinite(v.vz)) {
      const sp = Math.hypot(v.vx, v.vz);
      if (sp > cap) { v.vx *= cap / sp; v.vz *= cap / sp; }
    }
    if (Number.isFinite(v.vLong) && Math.abs(v.vLong) > cap) v.vLong = Math.sign(v.vLong) * cap;
  }
}

function freeze(v) {
  if (!v) return;
  if (Number.isFinite(v.vx)) v.vx = 0;
  if (Number.isFinite(v.vz)) v.vz = 0;
  if (Number.isFinite(v.vLong)) v.vLong = 0;
}

// missionkit completes a stage that has no hold and no failing condition as soon
// as you are in place; these stages finish only when their onTick says 'done'.
const onTickDecides = () => false;
const fxOf = (m) => m.nuitFx || (m.nuitFx = createNuitFx());
const speedOf = (G) => (G.veh ? G.veh.speedKmh || 0 : 0);
const takeE = (G) => { const e = !!G.wantStart; G.wantStart = false; return e; };
// The scene hush (B-08, heckle.js): from the call to the front door, nobody on
// the street gets a line in. Raised every tick a scene stage runs, so it lapses
// by itself a second after the job ends however it ends; cleanup() lifts it
// at once. The two drive legs (to Mike's, to the Tim) keep the town.
export const HUSH = 'nuittim';
const hush = (G) => { if (G && G.heckle && G.heckle.hush) G.heckle.hush(HUSH); };

// A queue of lines, one every `gap` seconds; E shows the next one right away.
function lineQueue(G, m, key, lines, dt, gap) {
  const q = m[key] || (m[key] = { i: 0, wait: 0.3 });
  q.wait -= dt;
  const e = takeE(G);
  if (q.i < lines.length && (q.wait <= 0 || e)) {
    const [who, line] = lines[q.i++];
    say(G, who, line, Math.max(2200, gap * 1000));
    q.wait = gap;
  }
  return q.i >= lines.length && (q.wait <= 0 || e);
}

// ---------------------------------------------------------------- the mission

export const NUITTIM_MISSION = {
  id: 'nuittim',
  title: 'La nuit du Tim',
  giver: 'mike',
  timeOfDay: 'night',
  brief: 'Sam a trop bu. Il répond presque plus. Personne d’autre a bu, pis personne va dormir.',

  // Success, failure and Backspace all land here. Nothing this job put on
  // screen outlives it.
  cleanup(G, m) {
    if (m && m.nuitFx) { m.nuitFx.teardown(); m.nuitFx = null; }
    if (G && G.heckle && G.heckle.unhush) G.heckle.unhush(HUSH);
    // The scene toasts' holds lapse by themselves once the HUD lets them go.
  },

  build() {
    const stages = [];

    // ---- 1a. chez Mike: the call --------------------------------------
    stages.push({
      kind: 'arrive',
      text: 'Chez Mike, 129 Frank-Robinson',
      sub: 'Suis le GPS, arrête-toi devant chez Mike pis appuie sur E pour appeler le Centre antipoison.',
      hint: 'Sam répond presque plus. Stationne-toi devant chez Mike, E pour téléphoner.',
      at: 'mike', radius: 24, stopped: 6, hold: true,
      holdText: 'E  -  appeler le Centre antipoison',
    });
    stages.push({
      kind: 'call',
      text: 'Au téléphone avec le Centre antipoison',
      sub: 'Écoute. E pour la ligne suivante.',
      hint: 'Laisse parler la dame du Centre antipoison. E fait avancer.',
      noTarget: true, anywhere: true, condition: onTickDecides,
      onTick(G, m, st, dt) {
        hush(G);
        freeze(G.veh);
        return lineQueue(G, m, 'callQ', CALL_LINES, dt, TUNE.lineGap) ? 'done' : null;
      },
      prompt: () => 'E  -  ligne suivante',
    });

    // ---- 1b. the watch ------------------------------------------------
    stages.push({
      kind: 'watch',
      text: 'Surveille Sam',
      sub: 'Reste arrêté. E pour aller voir Sam, ou attends. Le temps passe.',
      hint: 'Pas de chrono, pas d’échec. Arrête le truck, E pour vérifier sa respiration.',
      noTarget: true, anywhere: true, condition: onTickDecides,
      onEnter(G, m) { m.watch = watchInit(); fxOf(m).clock(clockText(m.watch.minutes)); },
      onTick(G, m, st, dt) {
        hush(G);
        const moving = speedOf(G) > TUNE.stillKmh;
        m.watch = watchStep(m.watch || watchInit(), dt, { moving, check: takeE(G) });
        fxOf(m).clock(clockText(m.watch.minutes));
        if (m.watch.say) say(G, m.watch.say[0], m.watch.say[1], 2800);
        if (m.watch.check) toastScene(G, m.watch.check, 2400);
        return m.watch.done ? 'done' : null;
      },
      prompt: (G) => (speedOf(G) > TUNE.stillKmh ? 'Arrête-toi. Tu restes avec Sam.' : 'E  -  aller voir Sam'),
      onExit(G, m) { m.nuitFx?.clock(null); },
      passengers: 1,
      toast: '3 h 10. Sam dort pour vrai. Mike reste avec lui.\nSayyad: « I’m starving, man. The Tim? »',
    });

    // ---- 2. the Tim ---------------------------------------------------
    // TODO (radio): « My Immortal » here, private build only, if Tom adds it.
    stages.push({
      kind: 'tim',
      text: 'Le Tim Hortons, rue Principale',
      sub: 'Suis le GPS. Sayyad est avec toi. Passe en arrière, dans le stationnement.',
      hint: 'Le Tim est sur Principale. La gang qui travaille là laisse les vieux muffins en arrière.',
      at: 'tims', radius: 30,
    });
    stages.push({
      kind: 'bag',
      text: 'Le sac en arrière du Tim',
      sub: 'Arrête-toi derrière pis appuie sur E pour prendre le sac.',
      hint: 'Le sac est à côté de la porte d’en arrière. Arrête-toi, E.',
      at: 'tims', radius: 30, stopped: 6, hold: true,
      holdText: 'E  -  prendre le sac de muffins pis de beignes',
      toast: 'Des muffins pis des beignes d’hier. Merci, la gang du Tim.',
    });

    // ---- 3. the doughnut, and the cut --------------------------------
    stages.push({
      kind: 'stranger',
      text: 'Un gars s’approche',
      sub: 'Il demande un beigne. E pour lui en donner un.',
      hint: 'Il veut juste un beigne. E.',
      at: 'tims', radius: 40, anywhere: true, condition: onTickDecides,
      onEnter(G, m) { m.cut = { phase: 'ask', t: 0 }; say(G, STRANGER_ASK[0], STRANGER_ASK[1], 3000); },
      onTick(G, m, st, dt) {
        hush(G);
        const c = m.cut || (m.cut = { phase: 'ask', t: 0 });
        if (c.phase === 'ask') {
          if (takeE(G)) {
            say(G, TOM_SURE[0], TOM_SURE[1], 900);
            c.phase = 'give'; c.t = 0;
          }
          return null;
        }
        c.t += dt;
        if (c.phase === 'give' && c.t >= 0.45) {
          // The punch. No wind-up on screen: it is just black, in one frame.
          c.phase = 'black'; c.t = 0;
          fxOf(m).black(true);
          G.camShake = 1;
        }
        if (c.phase === 'black') {
          freeze(G.veh);
          if (c.t >= TUNE.blackHold) return 'done';
        }
        return null;
      },
      prompt: (G, m) => (m.cut && m.cut.phase !== 'ask' ? null : 'E  -  lui donner un beigne'),
      onExit(G, m) { m.nuitFx?.black(false); },
    });

    // ---- 4a. the dazed walk, the stranger behind, Sayyad's stake -----
    stages.push({
      kind: 'walk',
      text: 'Rentre à pied, 299 Fraser',
      sub: 'W pour marcher, A/D pour rester droit. Suis le GPS. Tu vois double.',
      hint: 'Tu marches, tu cours pas. A/D pour corriger quand ça tire d’un bord.',
      at: 'home', anywhere: true, condition: onTickDecides,
      onEnter(G, m) {
        m.daze = dazeInit(1); m.walked = 0; m.gap = TUNE.followNear; m.stake = 0;
        m.lastPos = G.veh ? { x: G.veh.x, z: G.veh.z } : null;
        fxOf(m).daze(1, 0);
      },
      onTick(G, m, st, dt) {
        hush(G);
        const v = G.veh;
        const kmh = speedOf(G);
        m.daze = dazeSteer(m.daze || dazeInit(1), dt, { speedKmh: kmh });
        applyWalk(v, m.daze.nudge, m.daze.cap);
        fxOf(m).daze(m.daze.level, m.daze.t);
        if (v) {
          if (m.lastPos) {
            const d = Math.hypot(v.x - m.lastPos.x, v.z - m.lastPos.z);
            if (d < 20) m.walked = (m.walked || 0) + d;   // a reset is not walking
          }
          m.lastPos = { x: v.x, z: v.z };
        }
        m.gap = followerStep(m.gap ?? TUNE.followNear, dt, kmh);
        fxOf(m).tag(`Le gars: ${Math.round(m.gap)} m derrière`);
        m.stake = m.stake || 0;
        const due = Math.floor((m.walked || 0) / TUNE.stakeEvery);
        if (m.stake < WALK_LINES.length && due > m.stake) {
          const [who, line] = WALK_LINES[m.stake++];
          say(G, who, line, 2600);
        }
        return m.walked >= TUNE.walkMeters && m.stake >= WALK_LINES.length ? 'done' : null;
      },
      onExit(G, m) { m.nuitFx?.tag(null); },
    });

    // ---- 4b. un gars de l'école, most of the way ---------------------
    stages.push({
      kind: 'school',
      text: 'Un gars de l’école',
      sub: 'Il te prend par l’épaule. Laisse-toi guider, E pour avancer.',
      hint: 'Il te ramène presque jusque chez vous. E ou attends.',
      noTarget: true, anywhere: true, condition: onTickDecides,
      onEnter(G, m) {
        m.school = 0;
        const [who, line] = SCHOOL_LINES[0];
        say(G, who, line, 3000);
      },
      onTick(G, m, st, dt) {
        hush(G);
        freeze(G.veh);
        m.school = (m.school || 0) + dt;
        m.daze = dazeSteer(m.daze || dazeInit(1), dt, { speedKmh: 0, floor: TUNE.schoolLevel });
        fxOf(m).daze(m.daze.level, m.daze.t);
        if (m.school >= TUNE.schoolCard || (m.school > 1 && takeE(G))) {
          m.handedOff = handOff(G);
          return 'done';
        }
        return null;
      },
      passengers: -1,
      toast: 'Le gars te suit plus. Sayyad rentre chez eux.\nIl te laisse au coin de la rue. Sayyad: « You gonna be okay? »',
    });

    // ---- 4c. the last metres, alone ----------------------------------
    stages.push({
      kind: 'home',
      text: '299 Fraser',
      sub: 'W pour les derniers mètres, A/D. Arrête-toi devant la porte.',
      hint: 'La maison est là. Doucement. W, pis arrête-toi.',
      at: 'home', radius: 18, stopped: 6,
      onTick(G, m, st, dt) {
        hush(G);
        m.daze = dazeSteer(m.daze || dazeInit(TUNE.schoolLevel), dt, { speedKmh: speedOf(G), floor: TUNE.schoolLevel });
        applyWalk(G.veh, m.daze.nudge, m.daze.cap);
        fxOf(m).daze(m.daze.level, m.daze.t);
        return null;
      },
      onExit(G, m) { m.nuitFx?.teardown(); },
      // PROPOSAL, TOM TO APPROVE: the closing card. main.js puts the last
      // stage's toast on the JOB TERMINÉE card, which is the quiet end card.
      toast: CLOSING,
    });

    return stages;
  },
};

// The gars de l'école walks you most of the way: put Tom handoffMeters short
// of 299 Fraser along the real road graph. No nav (node, or before the GPS
// loads): stay put and walk the whole way, which is slow but still correct.
export function handOff(G) {
  const v = G && G.veh;
  if (!v || !G.nav || !G.nav.route || typeof v.reset !== 'function') return false;
  const home = PLACES.home;
  const path = G.nav.route(v.x, v.z, home.x, home.z);
  const p = pointBeforeEnd(path, TUNE.handoffMeters);
  if (!p) return false;
  const y = G.phys && G.phys.groundY ? G.phys.groundY(p.x, p.z) : 0;
  v.reset(p.x, p.z, p.yaw, y);
  G.route = null; G.routeKey = '';
  return true;
}
