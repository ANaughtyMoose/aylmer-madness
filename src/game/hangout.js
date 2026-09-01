// 129 avenue Frank-Robinson, après souper.
//
// Mike's house is where everybody hung out in the evenings, so it is not a job:
// it is the place you end up when you have nothing else on. Everything here is
// free-roam. main.js owns exactly one hook block — `hangout.update(dt, G)` after
// the mission runner, plus `G.startMission` so a friend can hand you a job — and
// this file owns the rest: who is on the lawn tonight, what they say about what
// you have actually done, the bins in the street, and the ten dollars riding on
// them.
//
// Four rules it is built around:
//
//   1. It is a SOIR. At morning/day the driveway is empty and the prompt says so.
//      Dusk and night only, off G.envKey (main.js's day/night cycle).
//   2. The people are real people. Sayyad, Margaret, Adam, Mike and Zahra, never
//      the historical PLACES keys (`steph`/`marc`/`dave`) — those never reach a
//      screen.
//   3. Being recognised is the reward. Every catch-up line carries a `need`, and
//      the most specific line that is true tonight is the one that gets said. Win
//      a race and Mike wants to hear about it; leave the couch in the tree and
//      five people have an opinion about the couch.
//   4. It is a driving game. The mini-game is driving: Mike's mother's recycling
//      bins, out to rue Smiley and back, on the clock.
//
// Text is loaded from assets/text/hangout.json (and the friends' own lines from
// assets/text/dialogue.json) at runtime; FALLBACK below is a trimmed copy so the
// porch still works when the files are missing, which is what the node smoke
// tests and a file:// load both hit.
import { clamp, mulberry32 } from '../core/math.js';
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { PLACES } from './places.js';
import { MISSIONS } from './missions.js';
import { heckle } from './heckle.js';

// ---------------------------------------------------------------- constants

const P = 'hang:';                     // every prop this file owns
export const EVENING = ['dusk', 'night'];
export const SPAWN_R = 170;            // friends appear on the lawn inside this
export const PORCH_R = 17;             // ...and E works inside this
export const PORCH_KMH = 8;            // stopped, i.e. you pulled into the driveway
export const LEAVE_M = 34;             // drive this far and the evening is over

// The slalom. Five gates up Frank-Robinson toward rue Smiley — the course runs
// north from the driveway, which is the direction the corner is in — then back
// into the driveway. GATE_0 + 4 * GATE_GAP is 110 m out, so it is a 240 m round
// trip: about half a minute if you commit to it and a minute if you brake.
export const SLALOM = {
  gates: 5, gate0: 22, gap: 22, side: 1.9, mouth: 2.1,
  gateR: 3.4, binR: 1.5, penalty: 3,
  target: 34, floor: 26, bet: 10, homeR: 9, homeKmh: 16,
  abandonM: 320, abandonS: 150,
};

// The five of them. `key` is internal; `name` is the only thing a player sees.
export const FRIENDS = ['mike', 'sayyad', 'margaret', 'adam', 'zahra'];

// ---------------------------------------------------------------- content

// Trimmed copy of assets/text/hangout.json — enough that the porch is never
// silent if the fetch fails. The real file has five times as many lines.
export const FALLBACK = {
  names: { mike: 'Mike', sayyad: 'Sayyad', margaret: 'Margaret', adam: 'Adam', zahra: 'Zahra' },
  day: ["L'entrée est vide. Le monde arrive quand le soleil descend."],
  greet: [
    { who: 'mike', line: 'Heille! Coupe le moteur, ma mère dort à dix heures.' },
    { who: 'sayyad', line: 'ENFIN. Ça fait vingt minutes qu’on parle de rien.' },
    { who: 'margaret', line: 'Assis-toi. Y a de la place sur les marches.' },
    { who: 'adam', line: '...t’es en retard.' },
    { who: 'zahra', line: 'Je rentre à dix heures. Pas parce que je veux.' },
  ],
  catch: [
    { who: 'mike', need: '', line: '...faque le gars me dit que le moteur est correct. Écoute-moi deux secondes.' },
    { who: 'mike', need: 'couch', line: 'Regarde-le. REGARDE-LE. Y est encore là-haut. Ça, c’est de l’ingénierie.' },
    { who: 'sayyad', need: '', line: 'Check la chemise. Palmiers jaunes. C’est pas tout le monde qui porte ça.' },
    { who: 'sayyad', need: 'radio:off', line: 'Y a pas de musique. Pars le radio, mon chum.' },
    { who: 'margaret', need: '', line: 'Assis-toi deux minutes. Ça changera rien.' },
    { who: 'adam', need: '', line: '...ouais.' },
    { who: 'adam', need: 'couch', line: 'Y a un divan dans l’arbre.' },
    { who: 'zahra', need: '', line: 'Vous dites les mêmes affaires chaque soir. Je les ai comptées.' },
  ],
  slalom: {
    pitch: [{ who: 'sayyad', line: 'J’ai sorti les bacs. Jusqu’à Smiley pis tu reviens. Dix piasses.' }],
    win: [{ who: 'sayyad', line: 'OUAIS! T’AS VU ÇA?' }],
    lose: [{ who: 'adam', line: 'Non.' }],
    bin: [{ who: 'mike', line: 'LE BAC!' }],
  },
  job: [{ who: 'sayyad', line: 'J’ai de quoi pour toi. Embarque, je t’explique en chemin.' }],
  leave: [
    { who: 'mike', line: 'Reviens demain! J’aurai fini mon explication.' },
    { who: 'adam', line: 'Bye.' },
  ],
};

/**
 * assets/text/hangout.json, plus whatever of the friends' own lines
 * assets/text/dialogue.json has. Never rejects: a missing file is a fallback,
 * not a crash, because the game has to boot off file:// too.
 */
export async function loadHangoutContent(fetchImpl, base = 'assets/text/') {
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const out = { ...FALLBACK, catch: FALLBACK.catch.slice(), small: { start: {}, end: {} }, ambient: [] };
  if (!f) return out;
  const get = async (name) => {
    try {
      const r = await f(base + name, { cache: 'no-cache' });
      if (!r || !r.ok) return null;
      return await r.json();
    } catch { return null; }
  };
  const h = await get('hangout.json');
  if (h && typeof h === 'object') {
    for (const k of ['names', 'day', 'greet', 'catch', 'slalom', 'job', 'leave']) {
      if (h[k]) out[k] = k === 'catch' ? h[k].slice() : h[k];
    }
  }
  // The written dialogue: 96 lines for Sayyad / Margaret / Adam, 32 for Zahra.
  // They are ride-along lines, so they get used where a ride is starting or
  // ending — the friend's parting shot when you take a job off the porch, and
  // the whoop when you beat the bins. « Ton père » is not on this lawn.
  const KEY = { Sayyad: 'sayyad', Margaret: 'margaret', Adam: 'adam', Zahra: 'zahra' };
  for (const file of ['dialogue.json', 'zahra.json']) {
    const d = await get(file);
    for (const row of (d && Array.isArray(d.dialogue)) ? d.dialogue : []) {
      const key = KEY[row && row.who];
      if (!key || !row.line) continue;
      // Zahra roasting her brother is a hangout line, not a ride line: it only
      // works if he is standing right there, so it gets that condition.
      if (row.when === 'about-sayyad') {
        out.catch.push({ who: key, need: 'here:sayyad', line: row.line });
      } else if (row.when === 'start' || row.when === 'end') {
        (out.small[row.when][key] = out.small[row.when][key] || []).push(row.line);
      }
    }
  }
  // The street itself, after supper: mosquitoes, bats over the pool, somebody
  // being told to put the bikes in the shed. Nobody on the porch says these —
  // they drift over from the next yard.
  const a = await get('ambient.json');
  for (const row of (a && Array.isArray(a.ambient)) ? a.ambient : []) {
    if (!row || row.where !== 'residential' || !row.line) continue;
    if (row.timeOfDay !== 'dusk' && row.timeOfDay !== 'night') continue;
    out.ambient.push(row.line);
  }
  return out;
}

// ---------------------------------------------------------------- the facts

/** Race jobs, so « t'as gagné combien de courses » is a real number. */
export const RACE_IDS = ['racedave', 'racecivic', 'circuit', 'blitz'];

/**
 * Is the couch up in Mike's maple?
 *
 * The landmarks agent owns the tree and the couch, so this reads whatever it
 * exposes and only falls back to our own progress. Accepted, in order:
 *   G.landmarks.couchInTree — boolean, or a function (G) => boolean
 *   G.couchInTree           — boolean
 *   G.done.has('divan')     — you put it there yourself, which is the truth
 *                             until something else says otherwise
 */
export function couchUp(G) {
  const l = G && G.landmarks;
  if (l && l.couchInTree !== undefined) {
    const v = typeof l.couchInTree === 'function' ? l.couchInTree(G) : l.couchInTree;
    if (typeof v === 'boolean') return v;
  }
  if (typeof (G && G.couchInTree) === 'boolean') return G.couchInTree;
  return !!(G && G.done && G.done.has && G.done.has('divan'));
}

/** Everything a `need` can ask about, read off G once per catch-up round. */
export function hangoutFacts(G, store = null, roster = []) {
  const done = (G && G.done) || new Set();
  const has = (id) => !!(done.has && done.has(id));
  const veh = G && G.veh;
  const radio = G && G.radio && G.radio.state ? G.radio.state() : null;
  const st = store || {};
  return {
    done: has,
    here: new Set(roster || []),
    couch: couchUp(G),
    car: (veh && veh.spec && veh.spec.id) || '',
    radio: radio && (radio.on || radio.wantOn) ? 'on' : 'off',
    races: RACE_IDS.filter(has).length,
    jobs: done.size || 0,
    money: (G && G.wallet && G.wallet.value) || 0,
    damage: (veh && veh.damage) || 0,
    nights: st.nights || 0,
    best: st.best == null ? 999 : st.best,
  };
}

const CMP = {
  '>=': (a, b) => a >= b, '<=': (a, b) => a <= b,
  '>': (a, b) => a > b, '<': (a, b) => a < b, '=': (a, b) => a === b,
};

/**
 * One `need` string against the facts. Space-separated, all must hold; an empty
 * need is always true. Anything it does not understand is false, so a typo in
 * the JSON silences one line instead of breaking the evening.
 */
export function matches(need, facts) {
  const toks = String(need || '').trim().split(/\s+/).filter(Boolean);
  for (const raw of toks) {
    const neg = raw.startsWith('!');
    const tok = neg ? raw.slice(1) : raw;
    let val;
    if (tok === 'couch') val = !!facts.couch;
    else if (tok.startsWith('done:')) val = !!facts.done(tok.slice(5));
    else if (tok.startsWith('here:')) val = !!(facts.here && facts.here.has(tok.slice(5)));
    else if (tok.startsWith('car:')) val = facts.car === tok.slice(4);
    else if (tok.startsWith('radio:')) val = facts.radio === tok.slice(6);
    else {
      const m = /^([a-z]+)(>=|<=|>|<|=)(-?\d+(?:\.\d+)?)$/.exec(tok);
      if (!m || !(m[1] in facts)) return false;
      val = CMP[m[2]](Number(facts[m[1]]), Number(m[3]));
    }
    if (neg ? val : !val) return false;
  }
  return true;
}

/** How many conditions a line stakes on being true. More specific wins. */
export const weight = (line) => String(line.need || '').trim().split(/\s+/).filter(Boolean).length;

/**
 * The line this person says next: true tonight, not said yet, and the most
 * specific of the ones left — then one of THOSE at random, because eight lines
 * that are all equally about you should not always resolve to whichever one
 * happens to be first in the JSON. Falls back to a line already heard rather
 * than going mute.
 */
export function pickLine(pool, who, facts, said, rnd = Math.random) {
  const mine = pool.filter((l) => l.who === who && matches(l.need, facts));
  if (!mine.length) return null;
  const fresh = mine.filter((l) => !said.has(l.line));
  const from = fresh.length ? fresh : mine;
  let top = 0;
  for (const l of from) top = Math.max(top, weight(l));
  const best = from.filter((l) => weight(l) === top);
  return best[Math.min(best.length - 1, Math.floor(rnd() * best.length))];
}

// ---------------------------------------------------------------- the roster

/**
 * Which night is it? The day/night cycle is ten minutes of wheel time, so this
 * is « how many evenings into the summer are you », and it is what seeds who
 * shows up. Deterministic, and it comes out of the save with the playtime.
 */
export function nightIndex(G, cycle = 600) {
  const t = (G && G.playtime) || 0;
  return Math.floor(t / cycle);
}

/**
 * Who is on the lawn tonight. Mike always — it is his house. Sayyad most
 * nights. Two or three of the rest, and Zahra only when her brother is there,
 * because she is thirteen and she did not walk over alone.
 */
export function rosterFor(n) {
  const rnd = mulberry32((n | 0) * 2654435761 + 0x91f3);
  const out = ['mike'];
  if (rnd() < 0.78) out.push('sayyad');
  const rest = ['margaret', 'adam'];
  // Shuffle, then take one or both — an evening with two people on it reads
  // differently from an evening with four, and that is the point of coming back.
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  out.push(rest[0]);
  if (rnd() < 0.6) out.push(rest[1]);
  if (out.includes('sayyad') && rnd() < 0.45) out.push('zahra');
  return out;
}

// ---------------------------------------------------------------- the course

/** Unit vectors at the porch: `f` up the street toward Smiley, `l` across it. */
function axes(p) {
  const a = p.a || 0;
  return { fx: Math.sin(a), fz: Math.cos(a), lx: Math.cos(a), lz: -Math.sin(a) };
}

/**
 * The slalom, as five gate centres and the ten bins that make them. Gate i sits
 * `gate0 + i*gap` metres up the street, `side` metres to alternating sides of
 * the centreline, and the two bins straddle it `mouth` metres apart — a 4.2 m
 * mouth, which is a Ranger and a bit.
 */
export function courseGates(p = PLACES.mike, s = SLALOM) {
  const { fx, fz, lx, lz } = axes(p);
  const gates = [];
  for (let i = 0; i < s.gates; i++) {
    const d = s.gate0 + i * s.gap;
    const off = (i % 2 ? 1 : -1) * s.side;
    const cx = p.x + fx * d + lx * off;
    const cz = p.z + fz * d + lz * off;
    gates.push({
      i, x: cx, z: cz,
      bins: [
        { x: cx + lx * s.mouth, z: cz + lz * s.mouth },
        { x: cx - lx * s.mouth, z: cz - lz * s.mouth },
      ],
    });
  }
  return gates;
}

/** They match whatever you did last time, and never ask for less than 26 s. */
export function slalomTarget(best, s = SLALOM) {
  if (!(best > 0)) return s.target;
  return Math.max(s.floor, Math.min(s.target, best - 0.4));
}

// ---------------------------------------------------------------- the store

// Its own key, next to aylmer.progress and aylmer.money. Three things worth
// remembering between sessions: how many evenings you have spent here, the best
// slalom, and which lines you have already heard.
const KEY = 'aylmer.hangout';
const EMPTY = { nights: 0, best: null, said: [], gifts: [] };

function ls() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function loadHangout() {
  try {
    const raw = ls()?.getItem(KEY);
    const j = raw ? JSON.parse(raw) : null;
    if (!j || typeof j !== 'object') return { ...EMPTY };
    return {
      nights: Number(j.nights) || 0,
      best: Number(j.best) > 0 ? Number(j.best) : null,
      said: Array.isArray(j.said) ? j.said.filter((s) => typeof s === 'string').slice(-160) : [],
      gifts: Array.isArray(j.gifts) ? j.gifts.filter((s) => typeof s === 'string') : [],
    };
  } catch { return { ...EMPTY }; }
}

export function saveHangout(st) {
  try { ls()?.setItem(KEY, JSON.stringify(st)); } catch { /* private mode */ }
  return st;
}

// ---------------------------------------------------------------- the jobs

// Whose job is whose. A friend only offers something that sounds like them, so
// « Adam: La run de Chelsea » never comes out of Zahra's mouth.
// The summer's beats (arc.js) come first in each list: if the next beat is open
// and it is yours, that is what you lead with. Nobody offers the epilogue — that
// one starts in your own driveway, with your father.
export const JOB_OWNER = {
  sayyad: ['arcbache', 'racecivic', 'blitz', 'poutine', 'canot', 'dep'],
  adam: ['racedave', 'circuit', 'chelsea'],
  margaret: ['tour', 'gang', 'cv', 'curfew'],
  mike: ['arcveillee', 'divan', 'highwayhull'],
  zahra: ['arcsurchauffe', 'golfcart', 'school'],
};

/**
 * What is on offer from the porch tonight: up to two jobs you have not done,
 * each attributed to somebody who is actually sitting there. This is how you
 * find work in the evening — you do not drive around looking for a yellow
 * pillar, you ask.
 */
export function porchJobs(G, roster, list = MISSIONS, max = 2) {
  const done = (G && G.done) || new Set();
  const out = [];
  for (const who of roster) {
    for (const id of JOB_OWNER[who] || []) {
      if (done.has && done.has(id)) continue;
      if (out.some((o) => o.def.id === id)) continue;
      const def = list.find((m) => m.id === id);
      if (!def) continue;
      out.push({ who, def });
      break;                       // one job each, so two friends get to talk
    }
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------- the meshes

// Same proportions as peds.js, because these are the same townspeople; the
// difference is that these five have names.
const HIP = 0.86, HEAD_Y = 1.58, TOP = 1.76;

export const LOOKS = {
  mike: { shirt: 0xd8d2c4, pants: 0x46586e, skin: 0xd0a37c, hair: 0x6a4a2c, scale: 1.02 },
  // The Hawaiian shirt is the whole point of Sayyad, so it gets its own palms.
  sayyad: { shirt: 0x1fa3a0, pants: 0x2b3550, skin: 0x8a5f3f, hair: 0x1c1815, palms: 0xe8c443 },
  margaret: { shirt: 0x9c5a76, pants: 0x3a3f46, skin: 0xd8ae8a, hair: 0x9a9088 },
  adam: { shirt: 0x33383f, pants: 0x2f3a4a, skin: 0xc79a72, hair: 0x3a2f26 },
  zahra: { shirt: 0x7b4fa8, pants: 0x2b3550, skin: 0x8a5f3f, hair: 0x14100e, scale: 0.86, pack: 0x2b6b4a },
};

/** One of them, standing. `armsUp` is Mike explaining something. */
export function buildPerson(o, armsUp = false) {
  const b = new MeshBuilder();
  const skin = rgb(o.skin), shirt = rgb(o.shirt);
  b.box(0, 1.16, 0, 0.40, 0.60, 0.24, shirt, { noBottom: true });
  b.box(0, HEAD_Y, 0, 0.22, 0.24, 0.22, skin, { noBottom: true });
  b.box(0, TOP - 0.05, 0, 0.24, 0.08, 0.24, rgb(o.hair));
  if (o.palms) {
    // Two yellow blotches on the chest. At 30 m it is a loud shirt, which is all
    // it has to be.
    b.box(-0.10, 1.26, -0.13, 0.12, 0.16, 0.02, rgb(o.palms));
    b.box(0.11, 1.08, -0.13, 0.10, 0.14, 0.02, rgb(o.palms));
  }
  if (o.pack) b.box(0, 1.18, 0.16, 0.30, 0.42, 0.14, rgb(o.pack), { noBottom: true });
  for (const sx of [-0.26, 0.26]) {
    if (armsUp) {
      b.box(sx * 1.05, 1.44, -0.06, 0.12, 0.52, 0.12, shade(o.shirt, 1.08), { noBottom: true });
      b.box(sx * 1.12, 1.70, -0.10, 0.11, 0.11, 0.11, skin, { noBottom: true });
    } else {
      b.box(sx, 1.14, 0, 0.12, 0.54, 0.12, shade(o.shirt, 1.08), { noBottom: true });
      b.box(sx, 0.84, 0, 0.11, 0.11, 0.11, skin, { noBottom: true });
    }
  }
  for (const sx of [-0.11, 0.11]) b.box(sx, HIP / 2, 0, 0.16, HIP, 0.18, rgb(o.pants), { noBottom: true });
  for (const sx of [-0.11, 0.11]) b.box(sx, 0.04, 0.03, 0.17, 0.08, 0.26, rgb(0x241f1c));
  return b;
}

/** A blue wheeled bin. Origin at the ground so tipping it is a roll. */
export function buildBin() {
  const b = new MeshBuilder();
  b.box(0, 0.44, 0, 0.62, 0.88, 0.54, rgb(0x2f5fa8), { noBottom: true });
  b.box(0, 0.90, -0.02, 0.66, 0.06, 0.58, rgb(0x24487d));
  b.box(0, 0.62, -0.29, 0.26, 0.10, 0.05, rgb(0x1b3a68));
  for (const sx of [-0.26, 0.26]) b.cyl(sx, 0.09, 0.22, 0.09, 0.06, 6, rgb(0x1a1a1c), 'x', true);
  return b;
}

/** The ghetto blaster on the steps. It is 2004 and it takes six D cells. */
export function buildBoombox() {
  const b = new MeshBuilder();
  b.box(0, 0.16, 0, 0.72, 0.32, 0.20, rgb(0x3a3d42), { noBottom: true });
  // MeshBuilder.cyl only knows the Y and X axes, and a speaker has to face the
  // street, so the cones are squares. At this size nobody can tell.
  for (const sx of [-0.22, 0.22]) b.box(sx, 0.16, -0.10, 0.18, 0.18, 0.03, rgb(0x1a1c1f));
  b.box(0, 0.19, -0.10, 0.16, 0.12, 0.03, rgb(0x7d8288));
  b.box(0, 0.34, 0.02, 0.34, 0.04, 0.04, rgb(0x9aa0a6));
  return b;
}

// ---------------------------------------------------------------- the evening

const say = (G, text, ms) => G && G.hud && G.hud.toast(text, ms);
const blip = (G, f, d, t, v) => G && G.audio && G.audio.blip(f, d, t, v);
const fmt = (s) => s.toFixed(1).replace('.', ',') + ' s';

export class Hangout {
  constructor() {
    this.state = 'off';        // off | idle | menu | slalom
    this.content = FALLBACK;
    this.loading = false;
    this.store = loadHangout();
    this.said = new Set(this.store.said);
    this.night = -1;
    this.roster = [];
    this.jobs = [];
    this.menu = [];
    this.pick = 0;
    this.talkIdx = 0;
    this.spawned = false;
    this.meshes = null;
    this.bins = null;
    this.run = null;
    this.dayToldAt = -1e9;
    this.ambientT = 0;
    this.countedNight = false;
    this.t = 0;
  }

  /** Fire-and-forget; until it lands the porch talks out of FALLBACK. */
  ensureContent() {
    if (this.loading || this.content !== FALLBACK) return;
    this.loading = true;
    loadHangoutContent().then((c) => { this.content = c; }).catch(() => {});
  }

  name(key) { return (this.content.names && this.content.names[key]) || FALLBACK.names[key] || key; }

  // ---- the frame -------------------------------------------------------

  update(dt, G) {
    if (!G || !G.veh || G.mission) { if (this.state !== 'off') this.leave(G, true); return; }
    this.t += dt;
    const p = PLACES.mike;
    const v = G.veh;
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    const evening = EVENING.includes(G.envKey);

    // The props go up when you are on the street and come down when you are not,
    // or when the sun does. G.props is rebuilt on every enterDrive, so a cleared
    // prop list means "spawn again", not "already there". A run already on the
    // clock keeps its bins even if the sun comes up on it.
    if (this.state !== 'slalom') {
      if (evening && d < SPAWN_R) this.spawn(G);
      else this.despawn(G);
    }

    if (this.state === 'slalom') { this.stepSlalom(dt, G, p); return; }

    if (!evening) {
      if (d < PORCH_R && v.speedKmh < PORCH_KMH && this.t - this.dayToldAt > 8) {
        this.dayToldAt = this.t;
        const lines = this.content.day || FALLBACK.day;
        say(G, lines[(this.night + 1 + lines.length) % lines.length] || lines[0], 2600);
      }
      if (d < PORCH_R) {
        G.hud && G.hud.prompt('Personne sur le perron   ·   reviens à la brunante');
      }
      if (this.state !== 'off') this.leave(G, true);
      return;
    }

    if (this.state === 'menu') {
      if (d > LEAVE_M || v.speedKmh > 26) { this.leave(G, false); return; }
      this.ambientLine(G, dt);
      this.drawMenu(G);
      this.readKeys(G);
      return;
    }

    // Idle: within the circle, stopped, E opens the evening.
    if (d < PORCH_R) {
      const who = this.roster.map((k) => this.name(k)).join(', ');
      G.hud && G.hud.setObjective(`Chez Mike — ${who} ${this.roster.length > 1 ? 'sont' : 'est'} sur le perron`,
        'Arrête-toi dans l’entrée pis appuie sur E pour jaser');
      if (v.speedKmh > PORCH_KMH) {
        G.hud && G.hud.prompt('Arrête-toi dans l’entrée');
      } else {
        G.hud && G.hud.prompt('E  —  descendre chez Mike');
        if (this.hit(G, 'KeyE', 'Enter')) this.enter(G);
      }
    }
  }

  // main.js has already handed E to the mission runner by the time we run, and
  // the mission runner had nothing to do with it (nothing is a job-giver at
  // 129 Frank-Robinson). So read the edge again and swallow it, so no later
  // reader sees the same press twice.
  hit(G, ...codes) {
    const inp = G && G.input;
    if (!inp || !inp.hit || !inp.hit(...codes)) return false;
    if (inp.consume) inp.consume(...codes);
    G.wantStart = false;
    return true;
  }

  // ---- arriving and leaving -------------------------------------------

  enter(G) {
    this.ensureContent();
    this.state = 'menu';
    this.pick = 0;
    this.talkIdx = 0;
    this.jobs = porchJobs(G, this.roster);
    this.buildMenu(G);
    this.ambientT = 12;
    if (!this.countedNight) {
      this.countedNight = true;
      this.store.nights++;
      this.persist();
    }
    G.audio && G.audio.blip(560, 0.10, 'triangle', 0.16);
    const greet = (this.content.greet || FALLBACK.greet).filter((l) => this.roster.includes(l.who));
    if (greet.length) {
      const g = greet[nightIndex(G) % greet.length];
      heckle.line(this.name(g.who), '« ' + g.line + ' »', 3200);
    }
  }

  leave(G, quiet) {
    const wasIn = this.state === 'menu' || this.state === 'slalom';
    if (this.state === 'slalom') this.clearBins(G);
    this.state = this.spawned ? 'idle' : 'off';
    if (!G) return;
    G.hud && G.hud.prompt(null);
    G.hud && G.hud.setTimer(null);
    if (wasIn && !quiet) {
      const pool = (this.content.leave || FALLBACK.leave).filter((l) => this.roster.includes(l.who));
      if (pool.length) {
        const l = pool[Math.floor(Math.random() * pool.length)];
        heckle.line(this.name(l.who), '« ' + l.line + ' »', 2600);
      }
    }
  }

  // ---- the menu --------------------------------------------------------

  buildMenu(G) {
    const best = this.store.best;
    const menu = [{ kind: 'talk', label: 'Jaser' }];
    menu.push({
      kind: 'slalom',
      label: 'Le slalom des bacs   ·   '
        + (best ? `à battre: ${fmt(slalomTarget(best))}` : `${fmt(SLALOM.target)} à faire`)
        + `   ·   ${SLALOM.bet} $`,
    });
    for (const j of this.jobs) menu.push({ kind: 'job', job: j, label: `${this.name(j.who)}: ${j.def.title}` });
    menu.push({ kind: 'leave', label: 'Repartir' });
    this.menu = menu;
    this.pick = Math.min(this.pick, menu.length - 1);
  }

  drawMenu(G) {
    const it = this.menu[this.pick];
    if (!it) return;
    const who = this.roster.map((k) => this.name(k)).join(', ');
    G.hud && G.hud.setObjective(`Sur le perron: ${who}`,
      'E choisit   ·   Q change   ·   W pour repartir');
    G.hud && G.hud.prompt(`E  —  ${it.label}   ·   Q  —  autre chose  (${this.pick + 1}/${this.menu.length})`);
  }

  readKeys(G) {
    if (this.hit(G, 'KeyQ')) {
      this.pick = (this.pick + 1) % this.menu.length;
      blip(G, 440, 0.05, 'square', 0.12);
      G.wantCycle = false;
      return;
    }
    if (!this.hit(G, 'KeyE', 'Enter')) return;
    const it = this.menu[this.pick];
    if (!it) return;
    if (it.kind === 'talk') this.talk(G);
    else if (it.kind === 'slalom') this.startSlalom(G);
    else if (it.kind === 'job') this.takeJob(G, it.job);
    else this.leave(G, false);
  }

  /**
   * One person says one thing about what you have actually been doing. It walks
   * the roster so everybody gets a turn, and remembers what has been said across
   * sessions — the porch is not a slot machine.
   */
  talk(G) {
    const facts = hangoutFacts(G, this.store, this.roster);
    const pool = this.content.catch || FALLBACK.catch;
    for (let n = 0; n < this.roster.length; n++) {
      const who = this.roster[(this.talkIdx + n) % this.roster.length];
      const l = pickLine(pool, who, facts, this.said);
      if (!l) continue;
      this.talkIdx = (this.talkIdx + n + 1) % this.roster.length;
      this.said.add(l.line);
      this.store.said = [...this.said].slice(-160);
      if (l.gift && G.wallet && !this.store.gifts.includes(l.line)) {
        this.store.gifts.push(l.line);
        G.wallet.add(l.gift);
        say(G, `+${l.gift} $`, 1600);
      }
      this.persist();
      heckle.line(this.name(who), '« ' + l.line + ' »', 3400);
      blip(G, 620, 0.05, 'triangle', 0.10);
      this.menu[0].label = 'Jaser encore';
      return;
    }
    heckle.line(this.name(this.roster[0]), '« ...ouais. »', 2200);
  }

  /**
   * The next yard over, every AMBIENT_GAP seconds: mosquitoes, bullfrogs, a
   * mother telling somebody to put the bikes in the shed. It is what a
   * residential street in Aylmer sounds like at nine o'clock, and it is the
   * reason sitting in the driveway doing nothing is not silence.
   */
  ambientLine(G, dt) {
    const pool = this.content.ambient || [];
    if (!pool.length) return;
    this.ambientT = (this.ambientT || 0) - dt;
    if (this.ambientT > 0) return;
    this.ambientT = 26 + Math.random() * 14;
    heckle.line('Le voisin', '« ' + pool[Math.floor(Math.random() * pool.length)] + ' »', 2600);
  }

  takeJob(G, job) {
    if (!G.startMission) { say(G, 'Reviens-moi là-dessus.', 1600); return; }
    const pitch = (this.content.job || FALLBACK.job).find((l) => l.who === job.who)
      || (FALLBACK.job[0]);
    this.leave(G, true);
    heckle.line(this.name(job.who), '« ' + pitch.line + ' »', 3000);
    // ...and one of their own lines from dialogue.json, if that file is there.
    const extra = this.content.small && this.content.small.start[job.who];
    if (extra && extra.length) {
      heckle.line(this.name(job.who), '« ' + extra[nightIndex(G) % extra.length] + ' »', 3000);
    }
    G.startMission(job.def);
  }

  // ---- the slalom ------------------------------------------------------

  startSlalom(G) {
    const p = PLACES.mike;
    this.state = 'slalom';
    const gates = courseGates(p);
    this.run = {
      gates, gate: 0, t: 0, penalty: 0, started: false, home: false,
      target: slalomTarget(this.store.best), hit: 0, binSaid: 0,
    };
    this.placeBins(G, gates);
    const pitch = (this.content.slalom || FALLBACK.slalom).pitch || FALLBACK.slalom.pitch;
    const mine = pitch.filter((l) => this.roster.includes(l.who));
    const l = (mine.length ? mine : pitch)[nightIndex(G) % (mine.length || pitch.length)];
    heckle.line(this.name(l.who), '« ' + l.line + ' »', 3400);
    say(G, `LE SLALOM DES BACS\n5 barrières jusqu’à Smiley, pis reviens dans l’entrée\nÀ battre: ${fmt(this.run.target)}`, 3600);
    G.audio && G.audio.chime(true);
  }

  stepSlalom(dt, G, p) {
    const r = this.run;
    const v = G.veh;
    if (!r) { this.state = 'idle'; return; }
    if (!r.started) {
      if (v.speedKmh > 5) r.started = true;
    } else r.t += dt;
    const total = r.t + r.penalty;

    // A knocked bin is three seconds and a yell. It stays knocked, so the course
    // gets harder the worse you drive it.
    for (const b of this.bins || []) {
      if (b.down) continue;
      if (Math.hypot(v.x - b.x, v.z - b.z) > SLALOM.binR) continue;
      b.down = true;
      r.penalty += SLALOM.penalty;
      r.hit++;
      const pr = G.props && G.props.get(b.id);
      if (pr) { pr.roll = 1.5; pr.y = 0.28; pr.yaw += 0.6; }
      G.audio && G.audio.crash(0.25);
      const pool = (this.content.slalom || FALLBACK.slalom).bin || FALLBACK.slalom.bin;
      const bl = pool[r.binSaid++ % pool.length];
      heckle.line(this.name(bl.who), '« ' + bl.line + ' »', 1800);
    }

    if (r.gate < r.gates.length) {
      const g = r.gates[r.gate];
      if (Math.hypot(v.x - g.x, v.z - g.z) < SLALOM.gateR) {
        r.gate++;
        blip(G, 520 + r.gate * 90, 0.10, 'triangle', 0.22);
      }
      G.hud && G.hud.setObjective(`Slalom — barrière ${r.gate + 1}/${r.gates.length}`,
        'W pis A/D entre les bacs — monte vers Smiley, la ligne bleue sert à rien icitte');
      G.hud && G.hud.prompt(`${fmt(total)}   ·   à battre ${fmt(r.target)}`
        + (r.hit ? `   ·   ${r.hit} bac${r.hit > 1 ? 's' : ''} (+${r.penalty} s)` : ''));
    } else {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      G.hud && G.hud.setObjective('Slalom — reviens dans l’entrée',
        'Fais demi-tour pis arrête-toi devant chez Mike (S pour freiner)');
      G.hud && G.hud.prompt(`${fmt(total)}   ·   entrée: ${Math.round(d)} m`
        + (r.hit ? `   ·   +${r.penalty} s` : ''));
      if (d < SLALOM.homeR && v.speedKmh < SLALOM.homeKmh) { this.finishSlalom(G, total); return; }
    }
    G.hud && G.hud.setTimer(total);

    // Bail-outs: you drove to Hull, or you have been at it for two and a half
    // minutes. Either way the bet is off and nobody says anything about it.
    const far = Math.hypot(v.x - p.x, v.z - p.z);
    if (far > SLALOM.abandonM || r.t > SLALOM.abandonS) {
      say(G, 'Le pari est off. Les bacs restent dehors.', 2400);
      this.clearBins(G);
      this.run = null;
      this.state = 'idle';
      G.hud && G.hud.setTimer(null);
      G.hud && G.hud.prompt(null);
    }
  }

  finishSlalom(G, total) {
    const r = this.run;
    const won = total <= r.target;
    const record = this.store.best == null || total < this.store.best;
    if (record) { this.store.best = Math.round(total * 10) / 10; this.persist(); }
    const s = this.content.slalom || FALLBACK.slalom;
    const pool = (won ? s.win : s.lose) || (won ? FALLBACK.slalom.win : FALLBACK.slalom.lose);
    const mine = pool.filter((l) => this.roster.includes(l.who));
    const line = (mine.length ? mine : pool)[Math.floor(Math.random() * (mine.length || pool.length))];
    heckle.line(this.name(line.who), '« ' + line.line + ' »', 3200);
    if (won && G.wallet) G.wallet.add(SLALOM.bet);
    // A win is also worth one of their own lines, when dialogue.json is there.
    const extra = this.content.small && this.content.small.end[line.who];
    if (won && extra && extra.length) {
      heckle.line(this.name(line.who), '« ' + extra[Math.floor(Math.random() * extra.length)] + ' »', 3000);
    }
    say(G, (won ? 'GAGNÉ' : 'RATÉ') + ` — ${fmt(total)}`
      + (r.hit ? `  (dont +${r.penalty} s de bacs)` : '')
      + `\nÀ battre: ${fmt(r.target)}`
      + (record ? '\nNOUVEAU RECORD' : '')
      + (won ? `\n+${SLALOM.bet} $` : ''), 4200);
    G.audio && G.audio.chime(won);
    this.clearBins(G);
    this.run = null;
    G.hud && G.hud.setTimer(null);
    this.state = 'menu';
    this.buildMenu(G);
  }

  // ---- the props -------------------------------------------------------

  meshFor(G, key, build) {
    if (!this.meshes) this.meshes = {};
    if (this.meshes[key]) return this.meshes[key];
    const r = G.props && G.props.renderer;
    if (!r || !r.upload) return null;
    this.meshes[key] = r.upload(build());
    return this.meshes[key];
  }

  spawn(G) {
    // enterDrive() clears the prop list out from under us; a missing anchor prop
    // is how we notice and put the evening back.
    if (this.spawned && G.props && G.props.has(P + 'boombox')) {
      if (this.night !== nightIndex(G)) this.reroll(G);
      return;
    }
    if (!G.props) return;
    this.ensureContent();
    this.reroll(G);
    const p = PLACES.mike;
    // Inward: from the kerb toward the house, so the lawn is between them.
    let dx = p.bx - p.x, dz = p.bz - p.z;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    const sx = -dz, sz = dx;              // along the street
    const yaw = Math.atan2(-dx, -dz);     // built facing -Z, so turn them around

    G.props.add({
      id: P + 'lit', mesh: 'litwin', far: 260, opts: { unlit: true, colorMul: new Float32Array([1, 0.92, 0.66]) },
      x: p.bx - dx * 3.2, z: p.bz - dz * 3.2, y: 0, yaw,
    });
    G.props.add({
      id: P + 'boombox', mesh: this.meshFor(G, 'boombox', buildBoombox), far: 160,
      x: p.x + dx * 9.4 + sx * 1.6, z: p.z + dz * 9.4 + sz * 1.6, y: 0.5, yaw,
    });
    // Two bins parked at the kerb until somebody drags them into the street.
    for (let i = 0; i < 2; i++) {
      G.props.add({
        id: P + 'kerbbin' + i, mesh: this.meshFor(G, 'bin', buildBin), far: 200,
        x: p.x + dx * 1.4 + sx * (2.6 + i * 0.9), z: p.z + dz * 1.4 + sz * (2.6 + i * 0.9),
        y: 0, yaw: yaw + 0.2 * i,
      });
    }
    this.roster.forEach((who, i) => {
      const look = LOOKS[who] || LOOKS.adam;
      // Offset up the street as well as across it: people stand at the front
      // corner of a lawn, not dead abeam of the truck in the driveway, and it
      // puts them in frame instead of at the edge of it.
      const along = 3.4 + (i - (this.roster.length - 1) / 2) * 1.35;
      const inset = 7.4 + (i % 2 ? 0.9 : 0);
      const base = yaw + (i % 2 ? 0.25 : -0.2);
      const mesh = this.meshFor(G, who, () => buildPerson(look, who === 'mike'));
      const alt = who === 'mike' ? this.meshFor(G, 'mike2', () => buildPerson(look, false)) : null;
      const prop = G.props.add({
        id: P + 'p' + who, mesh, far: 210,
        x: p.x + dx * inset + sx * along, z: p.z + dz * inset + sz * along, y: 0,
        yaw: base, sx: look.scale || 1, sy: look.scale || 1, sz: look.scale || 1,
        data: { t: i * 1.7, base },
      });
      // Standing around is not standing still: a slow sway, and Mike's hands
      // come up and down because he is still explaining the thing.
      prop.anim = (dt, pr) => {
        pr.data.t += dt;
        pr.yaw = pr.data.base + Math.sin(pr.data.t * 0.7) * 0.06;
        if (alt) pr.mesh = (Math.floor(pr.data.t / 1.4) % 3 === 2) ? alt : mesh;
      };
    });
    this.spawned = true;
    if (this.state === 'off') this.state = 'idle';
  }

  /** A new evening: a different two or three people, and a fresh « Jaser ». */
  reroll(G) {
    const n = nightIndex(G);
    if (n === this.night) return;
    this.night = n;
    this.roster = rosterFor(n);
    this.countedNight = false;
    this.talkIdx = 0;
    if (this.spawned && G.props) {
      for (const who of FRIENDS) G.props.remove(P + 'p' + who);
      this.spawned = false;
    }
  }

  despawn(G) {
    if (!this.spawned) return;
    if (G && G.props) G.props.removePrefix(P);
    this.spawned = false;
    this.bins = null;
    // 'menu' has its own way out (you drive off, and somebody says bye), so it
    // is the state machine's business, not the prop layer's.
    if (this.state === 'idle') this.state = 'off';
  }

  placeBins(G, gates) {
    this.bins = [];
    if (!G.props) return;
    for (let i = 0; i < 2; i++) G.props.remove(P + 'kerbbin' + i);
    const mesh = this.meshFor(G, 'bin', buildBin);
    gates.forEach((g, gi) => {
      g.bins.forEach((b, bi) => {
        const id = `${P}bin${gi}_${bi}`;
        G.props.add({ id, mesh, x: b.x, z: b.z, y: 0, yaw: gi * 0.4 + bi, far: 240 });
        this.bins.push({ id, x: b.x, z: b.z, down: false });
      });
    });
  }

  clearBins(G) {
    if (G && G.props) G.props.removePrefix(P + 'bin');
    this.bins = null;
    this.spawned = false;         // put the kerb bins back on the next spawn
  }

  persist() { saveHangout(this.store); }
}

// One per page, like heckle. main.js binds nothing: it calls update(dt, G).
export const hangout = new Hangout();
export default hangout;
