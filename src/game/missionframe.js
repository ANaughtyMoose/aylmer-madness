// W9-LEVELS (27 Oct 2026): where a mission starts and where it stops.
//
// Tom on release 3: « it's not clear where the levels start and stop anymore ».
// Waves 6 to 8 took the brief card off mission 1 (both paths), took the
// new-game toast away, and let the end of a job run on past its card in a
// trail of late toasts (FINI, unlocks, the new day). And every card said
// « AYLMER, QUÉBEC · ÉTÉ 2004 », so a story mission, a side job and a course
// all looked the same. docs/qa/rf/W9-LEVELS.md has the whole diagnosis.
//
// The rules, one place for all of them (main.js only asks):
//   * Every story mission (campaign.js MAIN, and the finale) starts with its
//     number and title: on the brief card's eyebrow, or, where the opening has
//     just told the story and no card may follow (bar 1), as one short banner
//     in the toast slot that never stops the truck.
//   * Every job that ends on a card says everything on that card: the result,
//     a car you were just lent, the new day, and the one next mission. Nothing
//     about it is left in the toast queue to come up after the card closes.
//   * A side job says so; a course or a challenge says it is outside the story.
//
// Pure: no DOM, no G writes. smoke_levels.mjs runs every story mission through it.
import { ALL_MISSIONS } from './missions.js';
import { MAIN, FINALE, isMain, stepOf, nextMain, mainStepsTotal } from './campaign.js';
import { PLACES } from './places.js';

/** How long the no-card start banner stays (ms). Enter clears it sooner. */
export const BANNER_MS = 3200;

/**
 * What kind of thing a def is, for the frame around it.
 *   'story'  one of the ten (campaign.js MAIN)
 *   'finale' Le dernier soir
 *   'course' a course from M (def.mode, def.course)
 *   'challenge' a rival's street race (def.mode 'ambush')
 *   'score'  a score mode with its own result (Crash Night, def.result)
 *   'job'    everything else: a side job
 */
export function frameKind(def) {
  if (!def || !def.id) return 'job';
  if (def.id === FINALE) return 'finale';
  if (typeof def.result === 'function') return 'score';
  if (def.mode === 'ambush') return 'challenge';
  if (def.mode || def.course) return 'course';
  if (isMain(def.id)) return 'story';
  return 'job';
}

export const isStoryKind = (k) => k === 'story' || k === 'finale';

const has = (id) => ALL_MISSIONS.some((d) => d.id === id);
const total = () => mainStepsTotal(has) || MAIN.length;

/** « MISSION 3 SUR 10 », « DERNIÈRE MISSION », « JOB À CÔTÉ · HORS HISTOIRE »... */
export function startEyebrow(def, en = false) {
  const k = frameKind(def);
  if (k === 'story') return en ? `MISSION ${stepOf(def.id)} OF ${total()}` : `MISSION ${stepOf(def.id)} SUR ${total()}`;
  if (k === 'finale') return en ? 'LAST MISSION' : 'DERNIÈRE MISSION';
  if (k === 'course') return en ? 'FREE RACE · NOT THE STORY' : 'COURSE LIBRE · HORS HISTOIRE';
  if (k === 'challenge') return en ? 'CHALLENGE · NOT THE STORY' : 'DÉFI · HORS HISTOIRE';
  if (k === 'score') return en ? 'FREE MODE · NOT THE STORY' : 'MODE LIBRE · HORS HISTOIRE';
  return en ? 'SIDE JOB' : 'JOB À CÔTÉ';
}

/**
 * The start banner for a story mission that starts without its brief card
 * (L'alternateur after the opening or « Été 2004 »). Two lines in the toast
 * slot: number and title, then the first objective. Null for anything that is
 * not a story mission: a course rerun already has its « Sur la ligne » toast.
 */
export function startBanner(def, objective, en = false) {
  if (!isStoryKind(frameKind(def))) return null;
  const head = startEyebrow(def, en) + ' : ' + String(def.title || '').toUpperCase();
  return objective ? head + '\n' + objective : head;
}

/**
 * The end card's eyebrow. A story mission says which one it was; a side job
 * keeps « JOB TERMINÉE ». A medal rides after it.
 */
export function endEyebrow(def, en = false, medalWord = '') {
  const k = frameKind(def);
  let base;
  if (k === 'story') base = en ? `MISSION ${stepOf(def.id)} OF ${total()} COMPLETE` : `MISSION ${stepOf(def.id)} SUR ${total()} TERMINÉE`;
  else if (k === 'finale') base = en ? 'LAST MISSION COMPLETE' : 'DERNIÈRE MISSION TERMINÉE';
  else base = en ? 'JOB COMPLETE' : 'JOB TERMINÉE';
  return medalWord ? base + ' · ' + medalWord : base;
}

/**
 * The one next step, for the end card: the next story mission and where it
 * starts. Empty once the finale is done. `done` is G.done (a Set).
 */
export function nextLine(done, en = false) {
  const d = done && typeof done.has === 'function' ? done : new Set(done || []);
  if (d.has(FINALE)) return '';
  const id = nextMain(d, has) || (has(FINALE) ? FINALE : null);
  const def = id ? ALL_MISSIONS.find((x) => x.id === id) : null;
  if (!def) return '';
  const p = PLACES[def.giver];
  const where = p && p.label ? '  ·  ' + p.label : '';
  return (en ? 'Next mission: ' : 'Prochaine mission : ') + def.title + where;
}

/**
 * Does this end show a card? main.js: every job that is not a course, a
 * challenge or a score mode, unless the summer just ended on it (the ending's
 * own cards take over).
 */
export function endsOnCard(def, summerOver = false) {
  const k = frameKind(def);
  return !summerOver && k !== 'course' && k !== 'challenge' && k !== 'score';
}
