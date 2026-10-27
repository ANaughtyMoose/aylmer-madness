// The summer's story, as data (restructure, 29 Sept 2026; Tom's approved plan in
// docs/design/MAIN-STORY-PROPOSAL.md with the ledger's 29 Sept changes).
//
// Ten main missions in summer order, then the finale. Each main mission needs
// the one before it; nothing else gates the story any more (the old « Finis
// d'abord » chain over all 28 jobs and arc.js's job counts are gone). Optional
// jobs open once the main mission that introduces their place is done, and stay
// open. The hour windows (jobwindows.js) and the Saint-Jean's date still apply
// in the prototype.
//
// Pure: no DOM, no imports of missions.js (missions.js imports this). Which ids
// actually exist is passed in (`has`), because four of the main ids are built
// by the set-pieces branch (golfcart, stvincent, nuittim,
// school + russellroyal) and this file must work before and after that merge:
// an id that does not exist is skipped, never waited on.

import { isPrototype, dateMessage } from './jobwindows.js';

/**
 * The ten. `ids` is played in order inside a step (the 5:45 at the Royal
 * Ottawa, then Russell's chase). Step 7 is the cedar sauna alone: the bridge
 * and radiator beat (arcsurchauffe) never happened (Tom, D31, 13 Oct 2026).
 * `n` is what the pause screen prints.
 */
export const MAIN = [
  { n: 1, key: 'alternateur', ids: ['alternateur'], name: 'L’alternateur' },
  { n: 2, key: 'sayyad', ids: ['sayyad'], name: 'Réveiller Sayyad' },
  { n: 3, key: 'saintjean', ids: ['arcbache'], name: 'La Saint-Jean' },
  { n: 4, key: 'divan', ids: ['divan'], name: 'Le divan de Mike' },
  { n: 5, key: 'canot', ids: ['canot'], name: 'Le canot à 45 piasses' },
  { n: 6, key: 'golf', ids: ['golfcart'], name: 'N’importe quelle petite clé' },
  { n: 7, key: 'sauna', ids: ['stvincent'], name: 'Le sauna de cèdre' },
  { n: 8, key: 'tim', ids: ['nuittim'], name: 'La nuit du Tim' },
  { n: 9, key: 'royal', ids: ['school', 'russellroyal'], name: '5 h 45 au Royal Ottawa' },
  { n: 10, key: 'nachos', ids: ['curfew'], name: 'Nachos avant Little Big Man' },
];

/** Labour Day night. Open when the ten are done, or when the summer has run out. */
export const FINALE = 'arcdernier';

/**
 * Optional jobs, and the main mission whose place introduces them (PROPOSAL
 * pairing, docs/STORY-REBUILD.md). Always replayable once open.
 */
export const OPTIONAL = {
  dep: 'alternateur',            // Liberty yogurt at the Super C: the Galeries, where the alternator was
  margaretdental: 'alternateur', // Margaret's box from Dr Morin: home, after the first errand
  gang: 'sayyad',                // Abraham in the driveway: the gang assembles after Sayyad is up
  racecivic: 'sayyad',           // Sayyad's Civic, once he is awake
  solerrand: 'arcbache',         // Zahra, met at the bonfire
  racedave: 'divan',             // Adam, the loser pays the gas
  circuit: 'divan',
  highwayhull: 'divan',          // Vertical Reality in Hull
  chelsea: 'canot',              // the 105 to Chelsea
  blitz: 'canot',
};

/**
 * Cut from the summer (Tom, 29 Sept, and the proposal's cuts). Their code may
 * stay for old saves, but they are on no map, list, prompt or count. A save
 * that has them in its progress keeps them there (nothing is deleted) and they
 * count for nothing. « dames » has no code left at all (cut by Tom, 6 Oct
 * 2026); its id stays here for old saves. « arcsurchauffe » (the radiator hose
 * on the Champlain, the couch, the garage bill) is the same: Tom, 13 Oct 2026
 * (D31), « none of that radiator shit is remotely real »; no code left, a save
 * that had it in progress or mid-job goes straight on to the sauna.
 */
export const RETIRED = ['cv', 'dames', 'arcveillee', 'arckeys', 'poutine', 'tour', 'vitres', 'suis', 'sunfire', 'quatre', 'seme', 'arcsurchauffe'];
const RETIRED_SET = new Set(RETIRED);
export const isRetired = (id) => RETIRED_SET.has(id);

// ---------------------------------------------------------------- the dates

// Summer day index of 24 June 2004 (day 0 = Tuesday 22 June, calendar.js).
export const SAINT_JEAN_DAY = 2;

/**
 * S4-SUMMER (20 Oct 2026, story red team F3): the summer has a middle. The
 * story used to reach « Le dernier soir » on 11 July (day 19 of 76) and the
 * finale teleported the calendar to Labour Day. Now each main mission, and the
 * optional jobs that would otherwise all open in the first week, wait for a
 * date: « Pas avant le 2 juillet ». The days between are the player's: the
 * optional jobs, races, courses, Balade, and sleeping at 299 Fraser (Z,
 * summer.js) when there is nothing new yet. A gate only says « not before »:
 * a player who is already past the date is never held back.
 *
 * Real dates where canon fixes them: the Saint-Jean is 24 June. The sauna is
 * on 30 July, the hottest day of the recorded summer (assets/text/summer2004.json:
 * 30.0 degrees, humidex 36). The nachos are the Labour Day weekend (Sunday 5
 * September, before 5 a.m.), so the day they spend is Labour Day itself and the
 * finale needs no jump. Everything else is spaced so that a player who does
 * each new thing once never sleeps more than 6 nights in a row
 * (tools/smoke_summer.mjs, bar 7). Day 0 is 22 June; 9 is 1 July; 40 is 1 August;
 * 71 is 1 September; 76 is Labour Day.
 */
export const DATE_GATES = {
  arcbache: SAINT_JEAN_DAY,   // 3  jeu 24 juin, la Saint-Jean (canon)
  solerrand: 5,               //    dim 27 juin
  divan: 10,                  // 4  ven 2 juillet
  racedave: 14,               //    mar 6 juillet
  canot: 18,                  // 5  sam 10 juillet
  blitz: 22,                  //    mer 14 juillet
  golfcart: 26,               // 6  dim 18 juillet
  circuit: 31,                //    ven 23 juillet
  stvincent: 38,              // 7  ven 30 juillet, la canicule
  nuittim: 45,                // 8  ven 6 août
  school: 52,                 // 9  ven 13 août, le shift de 5 h 45
  russellroyal: 57,           // 9b mer 18 août, Russell encore congédié
  highwayhull: 63,            //    mar 24 août
  chelsea: 69,                //    lun 30 août
  curfew: 75,                 // 10 dim 5 septembre, la fin de semaine de la fête du Travail
};
/**
 * The prototype runs a real clock (24 real minutes to a game day) and has no
 * way to sleep, so it keeps only the Saint-Jean's date, as before.
 */
export const PROTO_DATE_GATES = { arcbache: SAINT_JEAN_DAY };

/** The first day this job is offered in this build, or null (no date). */
export function gateDay(G, id) {
  const from = (isPrototype(G) ? PROTO_DATE_GATES : DATE_GATES)[id];
  return from == null ? null : from;
}

/**
 * « Pas avant le 2 juillet… » while a job's date has not come, else null.
 * index.html: needs a calendar (G.day); a node suite with no day has no date
 * gate. The prototype reads a missing day as the first day, as before.
 */
export function dateLock(G, id) {
  const from = gateDay(G, id);
  if (from == null) return null;
  const proto = isPrototype(G);
  if (!proto && !(G && Number.isFinite(G.day))) return null;
  const day = G && Number.isFinite(G.day) ? G.day : 0;
  return Math.floor(day) >= from ? null : dateMessage(from);
}

/** Is it past the night of the Saint-Jean? Then the text must not claim the date. */
export function pastSaintJean(G) {
  const day = G && Number.isFinite(G.day) ? Math.floor(G.day) : 0;
  return day > SAINT_JEAN_DAY;
}

// ---------------------------------------------------------------- the order

let KNOWN = null;
/** missions.js tells us which ids exist in this build. */
export function setKnown(ids) { KNOWN = new Set(ids); }
const exists = (id, has) => (has ? has(id) : (KNOWN ? KNOWN.has(id) : true));
const doneSet = (d) => (d && typeof d.has === 'function' ? d : new Set(d || []));

/** Every main id that exists, in play order. */
export function mainIds(has) {
  const out = [];
  for (const s of MAIN) for (const id of s.ids) if (exists(id, has)) out.push(id);
  return out;
}
export const isMain = (id) => MAIN.some((s) => s.ids.includes(id));
/** The step (1..10) an id belongs to, or 0. */
export function stepOf(id) { const s = MAIN.find((m) => m.ids.includes(id)); return s ? s.n : 0; }

/** The next main id to play, or null when the ten are done. */
export function nextMain(done, has) {
  const d = doneSet(done);
  return mainIds(has).find((id) => !d.has(id)) || null;
}

/** How many of the ten steps are complete (a step with no existing id counts once its turn has passed). */
export function mainStepsDone(done, has) {
  const d = doneSet(done);
  let n = 0;
  for (const s of MAIN) {
    const ids = s.ids.filter((id) => exists(id, has));
    if (!ids.length) continue;
    if (ids.every((id) => d.has(id))) n++;
  }
  return n;
}
/** How many steps this build can play (a step none of whose ids exist is not counted). */
export function mainStepsTotal(has) {
  return MAIN.filter((s) => s.ids.some((id) => exists(id, has))).length;
}

export function allMainDone(done, has) { return nextMain(done, has) === null; }

/** Is the finale open? The ten done, or the summer's last day reached (it can never be missed). */
export function finaleOpen(done, has, summerOver = false) {
  return allMainDone(done, has) || !!summerOver;
}

// ---------------------------------------------------------------- the first fifteen minutes
//
// W8-FIRST15 (pressure check 27 Oct, risk 3; redteam FIRST-15 dead spot 3): the
// driveway after L'alternateur showed three prompts (Dr Morin's box, « NOUVELLE
// JOB Réveiller Sayyad », « K : Kijiji ») plus « Z : dormir » before a new
// player knew days existed. Two rules, index.html only (the prototype has hour
// windows: holding its optional jobs would leave nothing to do at noon):
//   * quietStart: no optional job opens before Sayyad is awake, so the only new
//     pillar after the first errand is his. The OPTIONAL pairing above (which
//     place introduces a job) does not change; this only holds the door a step.
//   * earlyStory: until the Saint-Jean is done the free-roam line names the
//     next main mission, and the HUD does not advertise sleeping.
export const QUIET_UNTIL = 'sayyad';
export const EARLY_STEPS = 3;
export function quietStart(G, has) {
  if (!G || isPrototype(G)) return false;
  if (!exists(QUIET_UNTIL, has)) return false;
  return !doneSet(G.done).has(QUIET_UNTIL);
}
export function earlyStory(G, has) {
  if (!G || isPrototype(G)) return false;
  return mainStepsDone(doneSet(G.done), has) < EARLY_STEPS;
}

/**
 * The story's own lock (no hours, no dates): null when this id may be offered,
 * else the id of the main mission that has to come first. `lastDay` is true on
 * Labour Day (or after), which opens the finale whatever else is left.
 */
export function storyBlocker(id, done, has, lastDay = false) {
  const d = doneSet(done);
  if (isRetired(id)) return RETIRED_TAG;
  if (id === FINALE) return finaleOpen(d, has, lastDay) ? null : nextMain(d, has);
  if (isMain(id)) {
    if (d.has(id)) return null;
    const next = nextMain(d, has);
    return next === id ? null : next;
  }
  if (Object.prototype.hasOwnProperty.call(OPTIONAL, id)) {
    const need = OPTIONAL[id];
    if (!exists(need, has) || d.has(need)) return null;
    return need;
  }
  return null;   // anything this table does not name is not story-gated
}
export const RETIRED_TAG = '#retired';

/**
 * Campaign order for the pause list and missionById: the ten (in order), the
 * finale, then the optional jobs in the order they open. Unknown ids keep their
 * place after those.
 */
export function orderRank(id) {
  const main = [];
  for (const s of MAIN) main.push(...s.ids);
  let i = main.indexOf(id);
  if (i >= 0) return i;
  if (id === FINALE) return main.length;
  const opt = Object.keys(OPTIONAL).sort((a, b) => stepOf(OPTIONAL[a]) - stepOf(OPTIONAL[b]));
  i = opt.indexOf(id);
  if (i >= 0) return main.length + 1 + i;
  return main.length + 1 + opt.length;
}

// ---------------------------------------------------------------- old saves

/**
 * Migration note (docs/STORY-REBUILD.md s.10): a save's `progress` may hold the
 * retired ids. They are kept (never deleted, so an older build can still read
 * the slot) and ignored by every count. The only thing they ever granted was
 * the Civic (« Poutine express »): garage.js now hands it over with « Réveiller
 * Sayyad » and still honours a save that finished « poutine ».
 */
export function activeDone(done) {
  return [...doneSet(done)].filter((id) => !isRetired(id));
}
