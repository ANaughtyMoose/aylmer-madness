// The four races. Same stage model as everything else (see missionkit.js): a
// grid stage you have to roll up to and press E on, then one long stage that
// owns the countdown, the checkpoints, the laps and the clock through onTick.
//
// Every race stage is `anywhere: true` with a condition that never passes, so
// the runner in main.js never decides anything: the marker still moves (we
// rewrite `m.target` as the checkpoints go by, which is what feeds the GPS line
// and the minimap), but "have I won" is one place, down in tick().
//
// The rivals drive the friends' actual cars, so during a race that car is out
// of G.parked and back in it the moment the job ends, whichever way it ended.
import { PLACES } from './places.js';
import { carById } from './cars.js';
import { Rival, Track, SKILL, ordinalFr, fmtGap, BAND_AHEAD, BAND_BEHIND } from './race.js';

export const GATE_R = 18;         // checkpoint ring radius, metres
export const FINISH_R = 20;
export const COUNT_IN = 3;        // 3 - 2 - 1 - GO
export const BLITZ_BONUS = 15;    // seconds per checkpoint

const say = (G, text, ms) => G.hud && G.hud.toast(text, ms);
const blip = (G, f, d, t, v) => G.audio && G.audio.blip(f, d, t, v);

const at = (c) => (typeof c === 'string' ? PLACES[c] : c);

// ---------------------------------------------------------------- best laps

const LAP_KEY = 'aylmer.bestlap';
function lapStore() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
export function loadBestLaps() {
  try { return JSON.parse(lapStore()?.getItem(LAP_KEY) || '{}') || {}; } catch { return {}; }
}
export function saveBestLap(id, secs) {
  const all = loadBestLaps();
  if (all[id] != null && all[id] <= secs) return all[id];
  all[id] = secs;
  try { lapStore()?.setItem(LAP_KEY, JSON.stringify(all)); } catch { /* private mode */ }
  return secs;
}
const lapTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 10))}`;

// ---------------------------------------------------------------- the grid

// Where a car sits on the line: one lane over, one length back per row.
function gridSpot(start, i) {
  const a = start.a || 0;
  const fx = Math.sin(a), fz = Math.cos(a);
  const rx = -fz, rz = fx;
  const side = i === 0 ? 0 : (i % 2 ? 1 : -1);
  const row = Math.floor(i / 2);
  return {
    x: start.x + rx * side * 3.2 - fx * row * 5.8,
    z: start.z + rz * side * 3.2 - fz * row * 5.8,
    yaw: a,
  };
}

// The whole race as one list of [x, z]: start -> every checkpoint, every lap.
// Built once, at the line, so a racing rival never re-plans mid-corner.
function buildRacePath(G, start, cps, laps) {
  if (!G.nav) return { path: null, legs: null };
  const path = [];
  const legs = [];
  let fx = start.x, fz = start.z;
  for (let lap = 0; lap < laps; lap++) {
    for (let i = 0; i < cps.length; i++) {
      const c = at(cps[i]);
      const leg = G.nav.route(fx, fz, c.x, c.z);
      let len = 0;
      if (leg && leg.length > 1) {
        for (let k = 1; k < leg.length; k++) {
          len += Math.hypot(leg[k][0] - leg[k - 1][0], leg[k][1] - leg[k - 1][1]);
          path.push(leg[k]);
        }
        if (!path.length) path.push(leg[0]);
      } else {
        len = Math.hypot(c.x - fx, c.z - fz);
        path.push([c.x, c.z]);
      }
      if (lap === 0) legs.push(len);
      fx = c.x; fz = c.z;
    }
  }
  path.unshift([start.x, start.z]);
  return { path, legs };
}

function spawnRivals(G, cfg) {
  const start = at(cfg.start);
  const cps = cfg.cps;
  const laps = cfg.laps || 1;
  const { path, legs } = buildRacePath(G, start, cps, laps);
  G.raceParked = G.raceParked || {};
  G.rivals = [];
  const list = cfg.rivals || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const spec = carById(r.carId);
    // Borrow the car off the street; cleanup() puts it back where it was.
    if (G.parked && G.parked[r.carId]) {
      G.raceParked[r.carId] = G.parked[r.carId];
      delete G.parked[r.carId];
    }
    const rv = new Rival(spec, { id: r.carId, name: r.name, skill: SKILL[r.skill] || SKILL.dave });
    const spot = gridSpot(start, i + 1);
    rv.place(spot.x, spot.z, spot.yaw);
    if (path) rv.setPath(path);
    rv.active = false;
    rv.done = 0;
    G.rivals.push(rv);
  }
  return legs;
}

/** Put the borrowed cars back and take the rivals off the road. */
export function endRace(G) {
  if (G.raceParked && G.parked) {
    for (const id of Object.keys(G.raceParked)) {
      if (!G.parked[id]) G.parked[id] = G.raceParked[id];
    }
  }
  G.raceParked = {};
  G.rivals = [];
  if (G.hud) G.hud.prompt(null);
}

// ---------------------------------------------------------------- the stages

function raceStages(cfg, ctx) {
  const grid = {
    kind: 'grid',
    text: cfg.gridText || 'À la ligne de départ',
    sub: cfg.gridSub || `Le ${ctx.carName}, pis pas d’excuses.`,
    at: cfg.start, radius: 16, stopped: 7, hold: true,
    holdText: cfg.gridHold || 'E — on part',
    onEnter(G, m) {
      m.legs = spawnRivals(G, cfg);
      if (cfg.onGrid) cfg.onGrid(G, m);
    },
    toast: cfg.gridToast,
  };

  const run = {
    kind: 'race',
    text: cfg.text,
    sub: cfg.sub,
    at: () => at(cfg.cps[0]),
    radius: cfg.cps.length > 1 ? GATE_R : FINISH_R,
    anywhere: true,
    condition: () => false,
    time: cfg.clock != null ? cfg.clock : undefined,
    failWhy: cfg.clockFail || 'Le chrono t’a battu.',
    money: cfg.money,
    toast: cfg.win,

    onEnter(G, m) {
      const laps = cfg.laps || 1;
      const cps = cfg.cps.map((c) => {
        const p = at(c);
        return { x: p.x, z: p.z, r: cfg.cps.length > 1 ? GATE_R : FINISH_R, label: p.label || '' };
      });
      const line = at(cfg.start);
      const track = new Track(cps, laps, m.legs, { x: line.x, z: line.z });
      m.race = {
        track, laps,
        me: { done: 0 },
        count: COUNT_IN, lastN: 99, going: false,
        lapT: 0, bestLap: null, lastLapSaid: 0,
        pos: 1, gap: 0, gapName: '',
        t: 0,
      };
      if (!m.target) m.target = { x: cps[0].x, z: cps[0].z, r: cps[0].r };
      say(G, cfg.intro || 'Trois. Deux. Un.', 2000);
    },

    onExit(G) {
      if (G.hud) G.hud.prompt(null);
    },

    prompt(G, m) {
      const R = m.race;
      if (!R) return null;
      if (!R.going) {
        const n = Math.min(3, Math.max(0, Math.ceil(R.count)));
        return n > 0 ? `— ${n} —` : 'GO';
      }
      const bits = [];
      if (cfg.rivals && cfg.rivals.length) {
        bits.push(`${ordinalFr(R.pos)} / ${cfg.rivals.length + 1}`);
        if (R.gapName) {
          bits.push(`${R.gap >= 0 ? '+' : '−'}${fmtGap(Math.abs(R.gap))} ${R.gap >= 0 ? 'd’avance sur' : 'de retard sur'} ${R.gapName}`);
        }
      }
      if (R.laps > 1) {
        bits.push(`tour ${Math.min(R.laps, R.track.lapOf(R.me.done) + 1)}/${R.laps}`);
        if (R.bestLap != null) bits.push(`meilleur ${lapTime(R.bestLap)}`);
      }
      if (cfg.bonus) {
        const left = R.track.n * R.laps - R.me.done;
        bits.push(`${left} checkpoint${left > 1 ? 's' : ''}   ·   +${cfg.bonus} s chacun`);
      }
      return bits.join('   ·   ');
    },

    onTick(G, m, st, dt) {
      const R = m.race;
      if (!R) return null;
      const v = G.veh;
      const rivals = G.rivals || [];

      // ---- 3 - 2 - 1 - GO. The clock does not run during it.
      if (!R.going) {
        R.count -= dt;
        if (m.timeLeft != null) m.timeLeft += dt;
        const n = Math.min(3, Math.ceil(R.count));
        if (n !== R.lastN) {
          R.lastN = n;
          if (n > 0) blip(G, 440, 0.12, 'square', 0.22);
        }
        if (R.count <= 0) {
          R.going = true;
          for (const rv of rivals) rv.active = true;
          blip(G, 880, 0.22, 'triangle', 0.26);
          say(G, 'GO', 900);
        }
        return null;
      }
      R.t += dt;
      R.lapT += dt;

      // ---- the rivals' gates. Nobody wins here — a tie on the same tick goes
      // to the player, which is the only sporting way to break it.
      let beaten = null;
      for (const rv of rivals) {
        if (!R.track.isFinished(rv.done)) {
          R.track.check(rv, rv.x, rv.z, R.track.gate(rv.done).r);
        }
        rv.progress = R.track.progress(rv.done, rv.x, rv.z);
        if (R.track.isFinished(rv.done) && !beaten) beaten = rv;
      }

      // ---- your gates
      const before = R.me.done;
      const finished = R.track.check(R.me, v.x, v.z, R.track.gate(R.me.done).r);
      if (R.me.done !== before) {
        blip(G, 720, 0.10, 'triangle', 0.20);
        if (cfg.bonus && m.timeLeft != null && !finished) {
          m.timeLeft += cfg.bonus;
          say(G, `CHECKPOINT   +${cfg.bonus} s`, 1200);
        }
        // A lap just closed: time it, keep the best.
        if (R.laps > 1 && R.me.done % R.track.n === 0) {
          const lap = R.lapT;
          R.lapT = 0;
          if (R.bestLap == null || lap < R.bestLap) {
            R.bestLap = lap;
            saveBestLap(cfg.id, lap);
            say(G, `Tour ${R.track.lapOf(R.me.done)} — ${lapTime(lap)}\nMEILLEUR TOUR`, 2200);
          } else say(G, `Tour ${R.track.lapOf(R.me.done)} — ${lapTime(lap)}`, 1800);
        }
        if (finished) return 'done';
        // Move the marker (and the GPS line) onto the next gate.
        const g = R.track.gate(R.me.done);
        if (m.target) {
          m.target.x = g.x; m.target.z = g.z; m.target.r = g.r;
          G.routeKey = '';
        }
      }

      if (beaten) {
        return { fail: cfg.lose ? cfg.lose(beaten) : `${beaten.name} est arrivé avant toi.` };
      }

      // ---- position, gap, and the rubber band
      const mine = R.track.progress(R.me.done, v.x, v.z);
      let pos = 1, best = null, bestGap = 0;
      for (const rv of rivals) {
        if (rv.progress > mine) pos++;
        const d = mine - rv.progress;
        if (best === null || Math.abs(d) < Math.abs(bestGap)) { best = rv; bestGap = d; }
        // Gentle: a friend well up the road lifts, one well behind leans on it.
        const lead = rv.progress - mine;
        rv.band = lead > BAND_AHEAD ? rv.skill.band.ahead
          : lead < -BAND_BEHIND ? rv.skill.band.behind : 1;
      }
      R.pos = pos;
      R.gap = bestGap;
      R.gapName = best ? best.name : '';
      return null;
    },
  };

  return [grid, run];
}

function raceMission(cfg) {
  return {
    id: cfg.id,
    title: cfg.title,
    brief: cfg.brief,
    giver: cfg.giver,
    timeOfDay: cfg.timeOfDay || 'day',
    race: true,
    cleanup(G) { endRace(G); },
    build(ctx) { return raceStages(cfg, ctx); },
  };
}

// ============================================================ 1. Dave

const daveRace = raceMission({
  id: 'racedave',
  title: 'Dave jusqu’aux Galeries',
  brief: 'Dave dit que son Sunfire est plus vite que ton char. Dave dit ben des affaires.',
  giver: 'dave',
  start: 'dave',
  cps: ['mall'],
  money: 25,
  timeOfDay: 'day',
  gridText: 'Devant chez Dave — chemin Vanier',
  gridSub: 'Il chauffe le moteur depuis dix minutes. Colle-toi à côté.',
  gridHold: 'E — « trois, deux, un »',
  gridToast: 'Dave: « Premier arrivé paye le Slush. »',
  intro: 'Dave: « Trois. Deux. UN— »',
  text: 'Galeries d’Aylmer — le stationnement',
  sub: 'Deschênes, chemin d’Aylmer, pis tout droit. Lui il connaît le chemin.',
  win: 'PREMIER.\nDave arrive douze secondes plus tard, ben tranquille.\n+25 $ — il paye le Slush.',
  lose: (rv) => `${rv.name} est déjà stationné. Il te fait de la main.\n` +
    '« Tu veux-tu que je te montre le raccourci? »',
  rivals: [{ carId: 'sunfire', name: 'Dave', skill: 'dave' }],
});

// ============================================================ 2. Sayyad

const civicRace = raceMission({
  id: 'racecivic',
  title: 'La Civic de Sayyad à la marina',
  brief: 'Sayyad a mis des jantes. Il veut que tout le monde le sache.',
  giver: 'sayyad',
  start: 'sayyad',
  cps: ['principale', 'marina'],
  money: 30,
  timeOfDay: 'dusk',
  gridText: 'Devant le 75 Denise-Friend',
  gridSub: 'La Civic tourne au ralenti. Ça sonne comme une guêpe dans une canne.',
  gridHold: 'E — quand t’es prêt',
  gridToast: 'Sayyad: « Par le Vieux. Pas par le boulevard, c’est plate. »',
  intro: 'Sayyad: « Compte, toi. »',
  text: 'Le Vieux-Aylmer, pis la marina',
  sub: 'Passe par la rue Principale. Lui, il freine pas dans les courbes.',
  win: 'La Civic arrive au quai en deuxième.\nSayyad dit rien pendant un boutte.\n+30 $',
  lose: (rv) => `${rv.name} est assis sur le capot au bout du quai.\n` +
    '« Les jantes, mon chum. Les jantes. »',
  rivals: [{ carId: 'civic', name: 'Sayyad', skill: 'sayyad' }],
});

// ============================================================ 3. Le circuit

// Four real corners of the Vieux-Aylmer grid, straight off the road graph:
// Principale east to Frank-Robinson, south to du Patrimoine, west to Bancroft,
// north back onto Principale. About 1.4 km a lap.
export const CIRCUIT = [
  { x: -426, z: -130, label: 'Principale × Frank-Robinson' },
  { x: -416, z: -36, label: 'Frank-Robinson × du Patrimoine' },
  { x: -856, z: 4, label: 'du Patrimoine × Bancroft' },
  { x: -867, z: -99, label: 'Bancroft × Principale' },
];
export const CIRCUIT_START = { x: -800, z: -97, a: Math.PI / 2 };

const circuit = raceMission({
  id: 'circuit',
  title: 'Circuit du Vieux-Aylmer',
  brief: 'Trois tours. Principale, Frank-Robinson, du Patrimoine, Bancroft. Margaret pis Dave embarquent.',
  giver: 'arena',
  start: CIRCUIT_START,
  cps: CIRCUIT,
  laps: 3,
  money: 40,
  timeOfDay: 'morning',
  gridText: 'Ligne de départ — rue Principale, coin Bancroft',
  gridSub: 'Trois chars sur deux voies. C’est correct, y a personne le dimanche matin.',
  gridHold: 'E — départ',
  gridToast: 'Margaret: « Trois tours. Pis touche pas à ma Saturn. »',
  intro: 'Trois tours du Vieux. Départ arrêté.',
  text: 'Circuit du Vieux-Aylmer — 3 tours',
  sub: 'Principale → Frank-Robinson → du Patrimoine → Bancroft.',
  win: 'TROIS TOURS, PREMIER.\nDave dit que sa suspension est finie. Elle l’était avant.\n+40 $',
  lose: (rv) => `${rv.name} passe la ligne avant toi. Trois tours pour rien.`,
  rivals: [
    { carId: 'saturn', name: 'Margaret', skill: 'margaret' },
    { carId: 'sunfire', name: 'Dave', skill: 'dave' },
  ],
});

// ============================================================ 4. Le blitz

const blitz = raceMission({
  id: 'blitz',
  title: 'Blitz: le tour de l’île',
  brief: 'Six points dans la ville, un chrono, pis quinze secondes à chaque fois.',
  giver: 'principale',
  start: 'principale',
  cps: ['church', 'dep', 'arena', 'mike', 'tims', 'mall'],
  clock: 60,
  bonus: BLITZ_BONUS,
  money: 35,
  timeOfDay: 'dusk',
  gridText: 'Rue Principale — le départ du blitz',
  gridSub: 'Soixante secondes au départ. Chaque checkpoint t’en redonne quinze.',
  gridHold: 'E — partir le chrono',
  gridToast: 'Six checkpoints. Le chrono arrête jamais.',
  intro: 'Le chrono part à zéro.',
  text: 'Blitz — six checkpoints',
  sub: 'Saint-Paul, le dep, l’aréna, Frank-Robinson, le Tim, les Galeries.',
  clockFail: 'Le chrono est à zéro. Le blitz est fini.',
  win: 'SIX SUR SIX.\nT’as fait le tour de la ville avant que le chrono te rattrape.\n+35 $',
  rivals: [],
});

export const RACE_MISSIONS = [daveRace, civicRace, circuit, blitz];
export { daveRace, civicRace, circuit, blitz };
