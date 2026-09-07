// Wave 3: verbs that are not "pick up, drive, drop off". Every one of these is
// a stage the mission runner already knows how to run — nothing here touches
// missionkit.js. A stage's behaviour lives in the fields the runner reads
// (`at`, `condition`, `onEnter`, `onTick`, `onExit`, `prompt`); `kind` is a
// label. The rule that keeps these saveable: progress lives as flat scalars
// hung on `m` (`m.followLost`, `m.dropMask`), never as objects — save.js keeps
// only scalars across a reload and the stage's own onEnter rebuilds the rest.
import { PLACES } from './places.js';
import { carById } from './cars.js';
import { Rival, SKILL } from './race.js';
import { ROSTER } from './rivals.js';
import { heckle } from './heckle.js';

const at = (c) => (typeof c === 'string' ? PLACES[c] : c);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- rivals on demand
//
// A Rival needs only a path (race.js), not a course. This borrows the car off
// the street the way racejobs does, so Sayyad's Civic is not in two places.
export function spawnRival(G, carId, opts = {}) {
  const spec = carById(carId);
  if (!spec) return null;
  const who = ROSTER.find((r) => r.id === opts.roster) || null;
  const base = (who && who.skill) || SKILL[opts.skill] || SKILL.sayyad;
  const skill = { ...base, ...(opts.skill && typeof opts.skill === 'object' ? opts.skill : {}) };
  if (opts.cruise) skill.cruise = opts.cruise;
  const rv = new Rival(spec, { id: 'verb-' + carId, name: opts.name || (who && who.name) || spec.who || spec.name, skill });
  G.raceParked = G.raceParked || {};
  if (G.parked && G.parked[carId] && !G.raceParked[carId]) { G.raceParked[carId] = G.parked[carId]; delete G.parked[carId]; }
  rv.place(opts.x, opts.z, opts.yaw || 0);
  if (opts.path) rv.setPath(opts.path);
  rv.active = !!opts.active;
  rv.verb = true;
  G.rivals = G.rivals || [];
  G.rivals.push(rv);
  return rv;
}

export function removeRival(G, rv) {
  if (!rv) return;
  const i = (G.rivals || []).indexOf(rv);
  if (i >= 0) G.rivals.splice(i, 1);
  const carId = rv.spec && rv.spec.id;
  if (carId && G.raceParked && G.raceParked[carId]) {
    G.parked = G.parked || {};
    G.parked[carId] = G.raceParked[carId];
    delete G.raceParked[carId];
  }
}

/** Metres of route the rival still has to drive. */
export function remaining(rv) {
  if (!rv || rv.n < 2) return Infinity;
  return rv.cum[rv.n - 1] - rv.along();
}

/** A road-side spawn `back` metres behind the player, facing the player's way. */
export function behindPlayer(G, back = 120) {
  const v = G.veh;
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  return { x: v.x - fx * back, z: v.z - fz * back, yaw: v.yaw };
}

/** The leader's or rival's cruise, scaled from YOUR car so a Civic and a bus get a fair chase. */
export function cruiseFor(G, frac) {
  const top = (G.veh && (G.veh.baseSpec || G.veh.spec) && (G.veh.baseSpec || G.veh.spec).topSpeed) || 41;
  return clamp(top * frac, 8, 30);
}

// ---------------------------------------------------------------- 1. keep up
//
// Somebody drives from A to B and does not wait. Stay within `maxBehind`; fall
// further back for more than `grace` seconds and they are gone. The GPS still
// shows the destination — you know where he is going, the point is the pace.
export function follow(o) {
  const to = at(o.to), from = at(o.from);
  return {
    kind: 'follow',
    text: o.text, sub: o.sub || 'W à fond. Reste en arrière de lui, il t’attend pas.', hint: o.hint || 'La ligne bleue va où il va.',
    at: to, radius: o.radius || 40,
    failWhy: o.failWhy || `${o.name} t’a perdu. Il t’attendait pas.`,
    money: o.money, toast: o.toast,
    onEnter(G, m) {
      m.followLost = 0;
      const p = from;
      const path = G.nav ? G.nav.route(p.x, p.z, to.x, to.z) : null;
      m._leader = spawnRival(G, o.carId, {
        roster: o.roster, name: o.name, x: p.x, z: p.z, yaw: p.a || 0, path, active: true,
        cruise: cruiseFor(G, o.pace || 0.5),
      });
      if (o.start) heckle.line(o.name, o.start, 3000);
    },
    onTick(G, m, st, dt) {
      const rv = m._leader;
      if (!rv) return null;
      const d = dist(G.veh, rv);
      const gone = remaining(rv) < 25;
      if (gone) rv.active = false;
      // He eases off a little when you are dropping back — once. Then he goes.
      rv.band = d > 80 && m.followLost < (o.grace || 8) * 0.5 ? 0.85 : 1;
      if (d > (o.maxBehind || 130)) m.followLost += dt; else m.followLost = Math.max(0, m.followLost - dt * 0.5);
      if (m.followLost > (o.grace || 8) || d > 420) return { fail: st.failWhy };
      return null;
    },
    condition(G, m) { const rv = m._leader; return !!rv && remaining(rv) < 25 && dist(G.veh, rv) < (o.radius || 40); },
    prompt(G, m) {
      const rv = m._leader; if (!rv) return '';
      const d = Math.round(dist(G.veh, rv));
      return remaining(rv) < 25 ? `${o.name} est rendu — rejoins-le` : `${o.name}: ${d} m devant${d > 90 ? ' — pèse!' : ''}`;
    },
    onExit(G, m) { removeRival(G, m._leader); m._leader = null; },
  };
}

// ---------------------------------------------------------------- 2. don't get caught
//
// Two stages: shake the police (heat you did not earn, on purpose), then get
// where you were going. A bust fails the job through cops.js on its own.
export function loseThem(o) {
  const stars = o.stars || 2;
  return [
    {
      kind: 'escape',
      text: o.text, sub: o.sub || 'Sème-les. Hors de vue assez longtemps pis y lâchent.',
      hint: o.hint || 'Les petites rues, les ruelles, le parc. Pas le chemin d’Aylmer.',
      noTarget: true, noRoute: true, time: o.time || 150,
      failWhy: o.failWhy || 'Y t’ont eu.',
      onEnter(G) { if (G.cops) { G.cops.clear(); G.cops.add(stars + 0.05, o.why || 'le défi de Mike'); } },
      condition(G) { return !G.cops || (G.cops.heat < 0.05 && !G.cops.chasing); },
      prompt(G) {
        const c = G.cops; if (!c) return '';
        return c.chasing ? `${'★'.repeat(Math.max(1, c.stars))} — y sont dessus` : 'Y te cherchent encore. Reste caché.';
      },
      toast: o.lostToast || 'Y t’ont perdu.',
    },
    {
      kind: 'go',
      text: o.thenText, sub: o.thenSub || 'Tranquille sur le W, astheure.', hint: o.thenHint || 'Suis la ligne bleue.',
      at: at(o.to), radius: o.radius || 16, money: o.money, toast: o.toast,
    },
  ];
}

// ---------------------------------------------------------------- 3. find it
//
// A description, no marker, no GPS. The prompt runs hot and cold by distance;
// arriving is the whole job.
const BANDS = [[600, 'Froid.'], [300, 'Tiède.'], [130, 'Chaud.'], [50, 'Brûlant.']];
export function find(o) {
  const t = at(o.target);
  const r = o.radius || 18;
  return {
    kind: 'find',
    text: o.text, hint: o.hint || 'Lis la description. Le prompt te dit si tu chauffes.',
    noTarget: true, noRoute: true, time: o.time,
    failWhy: o.failWhy,
    sub: o.sub || 'Pas de marqueur. Roule (W), arrête-toi (S) quand c’est brûlant.',
    condition(G) { return dist(G.veh, t) < r && Math.abs(G.veh.vLong) < 2; },
    prompt(G) {
      const d = dist(G.veh, t);
      let word = 'Glacé.';
      for (const [lim, w] of BANDS) if (d < lim) word = w;
      return `${word} ${o.clue || ''}`.trim();
    },
    money: o.money, toast: o.toast,
  };
}

// ---------------------------------------------------------------- 4. fragile
//
// Load it, then drive like it matters: more than `tolerance` points of new
// damage between here and there and it is in pieces. The driving is the job.
export function fragile(o) {
  const tol = o.tolerance || 6;
  return [
    {
      kind: 'load',
      text: o.loadText, sub: o.loadSub || 'Arrête-toi (S) pis E pour charger', hint: o.loadHint || 'Suis la ligne bleue jusqu’au pilier.',
      at: at(o.from), radius: o.radius || 14, hold: true, holdText: o.holdText || 'E — charger',
      toast: o.loadToast,
    },
    {
      kind: 'fragile',
      text: o.text, sub: o.sub || 'Doux sur le W pis le S. Pas de coups, pas de trottoirs, pas de sauts.', hint: o.hint || 'Suis la ligne bleue, lentement.',
      at: at(o.to), radius: o.radius || 14, time: o.time,
      failWhy: o.failWhy || 'Ça a cassé.',
      onEnter(G, m) { m.fragileStart = G.veh.damage || 0; },
      onTick(G, m, st) {
        const d = (G.veh.damage || 0) - (m.fragileStart || 0);
        if (d > tol) return { fail: st.failWhy };
        if (G.veh.inAir && (o.noAir !== false)) { m.fragileAir = (m.fragileAir || 0) + 1; if (m.fragileAir > 45) return { fail: o.airWhy || 'Ça a décollé du siège.' }; }
        return null;
      },
      prompt(G, m) {
        const d = Math.max(0, (G.veh.damage || 0) - (m.fragileStart || 0));
        return `Ménage-le · ${Math.round(d)}/${tol}`;
      },
      money: o.money, toast: o.toast,
    },
  ];
}

// ---------------------------------------------------------------- 5. a lift, and listen
//
// Somebody gets in and talks. The lines land every few seconds while you
// drive; the point of the job is that you were there for them.
export function lift(o) {
  const every = o.every || 11;
  return [
    {
      kind: 'pickup',
      text: o.pickText, sub: o.pickSub || 'Arrête-toi (S) pis E', hint: o.pickHint || 'Suis la ligne bleue jusqu’au pilier.',
      at: at(o.from), radius: o.radius || 14, hold: true, holdText: o.holdText || `E — ${o.who} embarque`,
      passengers: +1, toast: o.pickToast || `${o.who} embarque.`,
    },
    {
      kind: 'listen',
      text: o.text, sub: o.sub || 'Roule (W). Écoute.', hint: o.hint || 'Suis la ligne bleue.',
      at: at(o.to), radius: o.radius || 16, time: o.time,
      passengers: -1,
      onEnter(G, m) { m.liftLine = 0; m.liftT = 3; },
      onTick(G, m, st, dt) {
        m.liftT -= dt;
        if (m.liftT <= 0 && m.liftLine < o.lines.length) {
          heckle.line(o.who, o.lines[m.liftLine++], 3400);
          m.liftT = every;
        }
        return null;
      },
      money: o.money, toast: o.toast,
    },
  ];
}

// ---------------------------------------------------------------- 6. four people, your order
//
// One stage, several stops, any order. The marker and the GPS follow the
// nearest stop you have not made yet; `m.dropMask` is the scalar that survives
// a save.
export function dropoffs(o) {
  const stops = o.stops.map((s) => ({ ...s, p: at(s.at) }));
  const left = (m) => stops.filter((s, i) => !((m.dropMask || 0) & (1 << i)));
  const nearest = (G, m) => {
    let best = null, bd = Infinity;
    for (const s of left(m)) { const d = dist(G.veh, s.p); if (d < bd) { bd = d; best = s; } }
    return best;
  };
  return {
    kind: 'dropoffs',
    text: o.text, sub: o.sub || 'Dans l’ordre que tu veux. Arrête-toi (S) devant chez eux.', hint: o.hint || 'Le marqueur suit le plus proche. Tab pour la carte.',
    at: stops[0].p, radius: o.radius || 15, time: o.time,
    failWhy: o.failWhy,
    passengers: o.passengers != null ? o.passengers : 0,
    onEnter(G, m) { m.dropMask = m.dropMask || 0; m.dropAt = -1; },
    onTick(G, m, st) {
      // Drops first, so the marker below never points at the door you just
      // closed for a frame.
      for (const t of left(m)) {
        const j = stops.indexOf(t);
        if (dist(G.veh, t.p) < (st.radius || 15) && Math.abs(G.veh.vLong) < 1.7) {
          m.dropMask |= (1 << j);
          if (t.line) heckle.line(t.who, t.line, 3200);
          if (G.hud) G.hud.toast(`${t.who} débarque.`, 1800);
          if (G.veh.passengers > 0) G.veh.passengers -= 1;
          m.dropAt = -1;
        }
      }
      const s = nearest(G, m);
      if (!s) return null;
      const i = stops.indexOf(s);
      if (m.dropAt !== i) { m.dropAt = i; m.target = { x: s.p.x, z: s.p.z, r: st.radius || 15 }; G.routeKey = ''; }
      return null;
    },
    condition(G, m) { return left(m).length === 0; },
    prompt(G, m) { const l = left(m); return l.length ? `Reste: ${l.map((s) => s.who).join(', ')}` : ''; },
    money: o.money, toast: o.toast,
  };
}

// ---------------------------------------------------------------- 7. a race to somewhere
//
// One rival, one destination, first there wins. What the ambush uses.
export function raceTo(o) {
  const to = at(o.to);
  return {
    kind: 'race',
    text: o.text, sub: o.sub || 'W à fond. Premier rendu. Pas de règles.', hint: o.hint || 'Suis la ligne bleue, pis coupe où tu peux.',
    at: to, radius: o.radius || 22, time: o.time,
    failWhy: o.failWhy || `${o.name} était là avant toi.`,
    onEnter(G, m) {
      const s = o.spawn || behindPlayer(G, 110);
      const path = G.nav ? G.nav.route(s.x, s.z, to.x, to.z) : null;
      m._rival = spawnRival(G, o.carId, { roster: o.roster, name: o.name, x: s.x, z: s.z, yaw: s.yaw, path, active: true, cruise: o.cruise || cruiseFor(G, (G.rivalFrac || 0.82) * 0.62) });
    },
    onTick(G, m, st) {
      const rv = m._rival;
      if (rv && remaining(rv) < 20) return { fail: st.failWhy };
      return null;
    },
    prompt(G, m) {
      const rv = m._rival; if (!rv) return '';
      const you = dist(G.veh, to), him = remaining(rv);
      return you < him ? `T’es devant — ${Math.round(you)} m` : `${o.name} est devant de ${Math.round(you - him)} m`;
    },
    onExit(G, m) { removeRival(G, m._rival); m._rival = null; },
    money: o.money, toast: o.toast,
  };
}
