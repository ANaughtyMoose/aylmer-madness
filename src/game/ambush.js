// Races that interrupt (Wave 3). Not a menu: on the road home from a job a
// friend's car turns up behind you, leans on the horn, and names a place —
// somewhere you have just driven from, so it is a road you know. E takes it,
// fourteen seconds of ignoring him and he goes. The race is a one-stage job
// (verbs.js raceTo) with `mode` set, so it takes the race pay scale, costs a
// day like everything else, and takes its own id back out of G.done.
import { PLACES } from './places.js';
import { ROSTER, rivalCarId } from './rivals.js';
import { carById } from './cars.js';
import { heckle } from './heckle.js';
import { raceTo, behindPlayer } from './verbs.js';

export const AMBUSH = {
  minJobs: 2,          // never in the first two jobs
  every: 3,            // at most one challenge per this many finished jobs
  offerSeconds: 14,
  minDist: 650,        // a race shorter than this is a drag strip
  spawnBack: 110,
  bet: 20,
  roster: ['sayyad', 'boucherk', 'beaulieu'],
  fallbacks: ['tims', 'mall', 'beach', 'arena', 'marina', 'principale', 'ctire'],
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rng = () => Math.random();

/** Which roster rival can actually be fielded right now (a car exists, not the player's). */
export function pickRival(G, roster = AMBUSH.roster) {
  const pool = [];
  for (const id of roster) {
    const r = ROSTER.find((x) => x.id === id);
    if (!r) continue;
    const carId = rivalCarId(r);
    if (!carId || !carById(carId) || carId === G.carId) continue;
    pool.push({ roster: id, name: r.name, carId });
  }
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}

/** Somewhere at least minDist away: where the job started if it qualifies, else a landmark. */
export function pickDestination(G, def) {
  const v = G.veh;
  const giver = def && def.giver && PLACES[def.giver];
  if (giver && dist(v, giver) > AMBUSH.minDist) return { key: def.giver, p: giver };
  const cands = AMBUSH.fallbacks.map((k) => ({ key: k, p: PLACES[k] })).filter((c) => c.p && dist(v, c.p) > AMBUSH.minDist);
  if (!cands.length) return null;
  cands.sort((a, b) => dist(v, a.p) - dist(v, b.p));
  return cands[0];
}

/** Can a challenge happen right now? A bike, a bus and a cart cannot race a Civic. */
export function eligible(G) {
  if (!G || G.summerOver || G.mission || G.ambush) return false;
  const spec = G.veh && (G.veh.baseSpec || G.veh.spec);
  if (!spec || spec.rider || spec.twoWheel || spec.style === 'bike' || spec.seats >= 12 || (spec.topSpeed || 0) < 20) return false;
  const jobs = (G.done && G.done.size) || 0;
  if (jobs < AMBUSH.minJobs) return false;
  if (jobs - (G.stats.ambushAt || -99) < AMBUSH.every) return false;
  return true;
}

/** Called once, right after a job completes and the save is written. */
export function afterJob(G, def, hud = G.hud) {
  if (!eligible(G)) return null;
  const who = pickRival(G);
  const to = pickDestination(G, def);
  if (!who || !to) return null;
  const label = to.p.label || to.key;
  G.ambush = { ...who, toKey: to.key, label, t: AMBUSH.offerSeconds, spawn: behindPlayer(G, AMBUSH.spawnBack) };
  G.stats.ambushAt = (G.done && G.done.size) || 0;
  heckle.line(who.name, `Heille! Jusqu’${leadIn(label)} — ${AMBUSH.bet} piasses. T’as quinze secondes.`, 4200);
  if (G.audio && G.audio.honk) G.audio.honk(330, 0.4, 0.12);
  return G.ambush;
}

export function makeDef(G, a) {
  const key = a.toKey;
  return {
    id: 'ambush',
    title: `Course: ${a.name} jusqu’${leadIn(a.label)}`,
    brief: `${a.name} veut courir jusqu’${leadIn(a.label)} pour ${AMBUSH.bet} $. Premier rendu.`,
    giver: 'principale',
    timeOfDay: G.envKey || 'day',
    mode: 'ambush',
    build: () => [raceTo({
      carId: a.carId, roster: a.roster, name: a.name, to: key, spawn: a.spawn,
      text: `Course — ${a.name} jusqu’${leadIn(a.label)}`,
      sub: `Premier rendu gagne ${AMBUSH.bet} $. Pas de règles.`,
      money: AMBUSH.bet,
      toast: `${a.name}: « …ok. OK. Correct. » +${AMBUSH.bet} $`,
      failWhy: `${a.name} était là avant toi. Tu lui dois ${AMBUSH.bet} $.`,
    })],
    cleanup(G2) {
      // A challenge is a mode, not a job: it must not count toward « jobs faites ».
      if (G2.done) G2.done.delete('ambush');
    },
  };
}

/** Once a tick while an offer stands. */
export function tick(G, dt, hud = G.hud) {
  const a = G.ambush;
  if (!a) return;
  if (G.mission) { G.ambush = null; if (hud) hud.prompt(null); return; }
  a.t -= dt;
  if (G.wantStart) {
    G.wantStart = false;
    G.ambush = null;
    if (hud) hud.prompt(null);
    if (G.startMission) G.startMission(makeDef(G, a));
    return;
  }
  if (a.t <= 0) {
    G.ambush = null;
    if (hud) hud.prompt(null);
    heckle.line(a.name, 'Correct. Une autre fois.', 2600);
    return;
  }
  if (hud) hud.prompt(`E — la course jusqu’${leadIn(a.label)} (${Math.ceil(a.t)} s)`);
}

// « jusqu’au Tim », « jusqu’à l’aréna », « jusqu’aux Galeries » — the label
// decides, the way a person would say it.
function leadIn(label) {
  const l = String(label || '');
  if (/^(Galeries|Plaines|Cèdres)/i.test(l)) return `aux ${l}`;
  if (/^(Plage|Marina|Auberge|Église|Station|Cité)/i.test(l)) return `à la ${l}`;
  return /^[aeiouyàâéèêëîïôùûh]/i.test(l) ? `à l’${l}` : `au ${l}`;
}
