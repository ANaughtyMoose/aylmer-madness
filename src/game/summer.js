// The summer, paced and summed up (S4-SUMMER, 20 Oct 2026; story red team F3
// and F5, plan bar 8).
//
// Three things live here, none of which draws or steps anything:
//
//   1. What opens next on the calendar (campaign.js DATE_GATES): the line the
//      free-roam HUD shows when the story is waiting on a date, and the note on
//      a job's end card (« Prochaine histoire : le 2 juillet »).
//   2. Sleeping at 299 Fraser (Z, stopped in the driveway): the way to pass
//      days. Straight to the morning of the next day something opens (never
//      past it, never past Labour Day); jobs already open stay open.
//   3. The summer-end screen after the last end card: what you did this summer.
//
// index.html only. The prototype runs its own clock (24 real minutes to a day)
// and keeps only the Saint-Jean's date, so it has no sleep.
import { ALL_MISSIONS, missionAvailable } from './missions.js';
import {
  DATE_GATES, FINALE, isRetired, nextMain, storyBlocker, mainStepsDone, mainStepsTotal,
} from './campaign.js';
import { LAST, label, daysLeft, dateOf } from './calendar.js';
import { dayName, isPrototype } from './jobwindows.js';
import { PLACES } from './places.js';
import { streetsPct, aylmerStreets } from './streets.js';

export const SLEEP_R = 30;          // metres from 299 Fraser: in the driveway or at the kerb
export const SLEEP_KMH = 3;         // stopped, near enough
export const DEAD_STRETCH_MAX = 6;  // nights in a row with nothing new, for a player who does each thing once (smoke_summer)

const known = (id) => ALL_MISSIONS.some((d) => d.id === id);
const byId = (id) => ALL_MISSIONS.find((d) => d.id === id) || null;
const today = (G) => Math.floor(G && Number.isFinite(G.day) ? G.day : 0);
const en = (G) => !!(G && G.settings && G.settings.lang === 'en');
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** « 2 juillet » or « July 2 », the HUD's language. */
const dayText = (G, day) => {
  if (!en(G)) return dayName(day);
  const d = dateOf(day);
  return `${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/** The day this job is first offered in index.html, or null when it has no date. */
export function opensOn(id) {
  return Object.prototype.hasOwnProperty.call(DATE_GATES, id) ? DATE_GATES[id] : null;
}

/** Jobs not done yet that can start right now (the finale included once open). */
export function freshNow(G) {
  const done = (G && G.done) || new Set();
  return ALL_MISSIONS.filter((d) => !done.has(d.id) && !isRetired(d.id) && missionAvailable(G, d));
}

/**
 * The next day something not done yet opens: a job whose story lock is clear
 * and whose only wait is its date. { day, id } or null.
 */
export function nextOpening(G) {
  const done = (G && G.done) || new Set();
  const now = today(G);
  let best = null;
  for (const [id, day] of Object.entries(DATE_GATES)) {
    if (day <= now || done.has(id) || isRetired(id) || !known(id)) continue;
    if (storyBlocker(id, done, known) != null) continue;
    if (!best || day < best.day) best = { day, id };
  }
  return best;
}

/** The next main mission when it is waiting on its date: { def, day } or null. */
export function storyWaiting(G) {
  if (!G || isPrototype(G)) return null;
  const id = nextMain((G && G.done) || new Set(), known);
  if (!id) return null;
  const day = opensOn(id);
  if (day == null || today(G) >= day) return null;
  return { def: byId(id), day };
}

/** « Prochaine histoire : le 2 juillet · 68 jours d’été », for a job's end card. */
export function nextStoryNote(G) {
  const w = storyWaiting(G);
  if (!w) return '';
  const left = daysLeft(G.day || 0);
  return en(G)
    ? `Next story: ${dayText(G, w.day)}  ·  ${left} days of summer left`
    : `Prochaine histoire : le ${dayName(w.day)}  ·  il reste ${left} jours d’été`;
}

/**
 * The free-roam lines when nothing new can start: the story is waiting on a
 * date. Null when there is something to do now (story.js shows that instead).
 */
export function waitLines(G) {
  const w = storyWaiting(G);
  if (!w) return null;
  if (freshNow(G).length) return null;
  return en(G)
    ? { text: `Next story: ${w.def.title}, ${dayText(G, w.day)}`, sub: 'Z at 299 Fraser to sleep till then   ·   or replay a job, race, cruise', kind: 'wait' }
    : { text: `Prochaine histoire : ${w.def.title}, le ${dayName(w.day)}`, sub: 'Z au 299 Fraser pour dormir jusque-là   ·   ou refais une job, une course, une balade', kind: 'wait' };
}

// ---------------------------------------------------------------- sleeping

function nearHome(G) {
  const v = G && (G.focus || G.veh), h = PLACES.home;
  return !!(v && h && Math.hypot(v.x - h.x, v.z - h.z) <= SLEEP_R);
}

/**
 * Where a sleep takes you: the morning of the next day something new opens
 * (a job whose only wait is its date), else Labour Day. At least one night,
 * never past Labour Day. A job that is already open stays open (nothing
 * expires), so sleeping past it loses nothing: it is still on the map.
 */
export function sleepTarget(G) {
  const from = today(G);
  if (from >= LAST) return from;
  const n = nextOpening(G);
  return Math.max(from + 1, Math.min(LAST, n ? n.day : LAST));
}

/** Can you sleep here, now? null when yes, else the reason (a toast). */
export function sleepBlock(G) {
  if (!G || isPrototype(G)) return 'proto';
  const E = en(G);
  if (G.mission || G.ambush) return E ? 'Finish the job first.' : 'Finis la job d’abord.';
  if (G.summerOver) return E ? 'The summer is over. Drive.' : 'L’été est fini. Roule.';
  if (G.lastNight || today(G) >= LAST) return E ? 'Not tonight. It’s the last night.' : 'Pas à soir. C’est le dernier soir.';
  if (!nearHome(G)) return E ? 'Your bed is at 299 Fraser.' : 'Ton lit est au 299 Fraser.';
  const v = G.focus || G.veh;
  if (Math.abs(v.speedKmh || 0) > SLEEP_KMH) return E ? 'Park first.' : 'Arrête-toi d’abord.';
  return null;
}

/** « Z : dormir jusqu’au 2 juillet », for the HUD when you are parked at home. */
export function sleepHint(G) {
  if (sleepBlock(G)) return '';
  const to = sleepTarget(G), nights = to - today(G);
  if (en(G)) return nights > 1 ? `Z: sleep till ${dayText(G, to)}` : 'Z: sleep';
  return nights > 1 ? `Z : dormir jusqu’au ${dayName(to)}` : 'Z : dormir';
}

/** The card a sleep shows, and where it lands. { from, to, nights, title, body, task } */
export function planSleep(G) {
  const from = today(G), to = sleepTarget(G), nights = to - from;
  const E = en(G);
  const next = nextMain((G && G.done) || new Set(), known);
  const lines = [`${label(from)}  →  ${label(to)}`];
  if (to >= LAST) lines.push(E ? 'Labour Day.' : 'La fête du Travail.');
  else {
    const on = next ? opensOn(next) : null;
    if (on != null && on > from && on <= to) lines.push((E ? 'Today: ' : 'Aujourd’hui : ') + byId(next).title);
    lines.push(E ? `${daysLeft(to)} days of summer left` : `Il reste ${daysLeft(to)} jours d’été`);
  }
  // The narrator is French, always (Tom 6 Oct 2026).
  const title = nights > 1 ? 'Les jours passent.' : 'Dodo.';
  const body = nights > 1
    ? 'La plage, le dep, la radio dans l’entrée. Des journées de même, il y en a plein dans un été.'
    : 'Tu dors comme une roche. Le Ranger refroidit dans l’entrée.';
  return { from, to, nights, title, body, task: lines.join('\n') };
}

/** Move the calendar. A day a failed job still owed (calendar.deferDay) is paid by the nights. */
export function applySleep(G, plan) {
  if (!G || !plan) return false;
  G.day = Math.min(LAST, Math.max(today(G), plan.to));
  G.dayOwed = 0;
  return true;
}

// ---------------------------------------------------------------- the end

const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const nf = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * The summer-end screen: what you did, in the HUD's language (the narrator
 * line stays French). `opts.courseBests` is modes.js loadModeBests(),
 * `opts.courseName(id)` its name. Returns the cinema card's fields.
 */
export function summerSummary(G, opts = {}) {
  const E = en(G);
  const done = (G && G.done) || new Set();
  const s = (G && G.stats) || {};
  const jobs = ALL_MISSIONS.filter((d) => done.has(d.id) && !isRetired(d.id) && d.id !== FINALE).length;
  const steps = mainStepsDone(done, known), total = mainStepsTotal(known);
  const km = (s.dist || 0) / 1000;
  const money = G && G.wallet ? Math.round(G.wallet.value) : 0;
  const lines = [];
  lines.push(E ? `Story ${steps}/${total}  ·  ${jobs} jobs done` : `Histoire ${steps}/${total}  ·  ${jobs} jobs faites`);
  // The street count, with the share once it is a whole percent (Aylmer has about 1,600 named streets).
  const names = aylmerStreets();
  const nStreets = G && G.streets ? [...G.streets].filter((x) => names.has(x)).length : 0;
  const pct = streetsPct(G);
  lines.push(E ? `${nf(km)} km on the roads  ·  ${nStreets} Aylmer streets${pct >= 1 ? ` (${pct} %)` : ''}`
    : `${nf(km)} km sur les chemins  ·  ${nStreets} rues d’Aylmer${pct >= 1 ? ` (${pct} %)` : ''}`);
  const air = s.bigAir > 0 ? (E ? `, longest ${s.bigAir.toFixed(1)} s in the air` : `, le plus long ${s.bigAir.toFixed(1).replace('.', ',')} s dans les airs`) : '';
  lines.push(E ? `Jumps ${s.jumps || 0}${air}  ·  crashes ${s.crashes || 0}  ·  near misses ${s.nearMiss || 0}`
    : `Sauts ${s.jumps || 0}${air}  ·  accidents ${s.crashes || 0}  ·  frôlés ${s.nearMiss || 0}`);
  // Best times: your records on the story jobs, and the courses you ran.
  const recs = Object.entries((G && G.best) || {}).filter(([id, t]) => Number.isFinite(t) && known(id) && !isRetired(id) && id !== FINALE);
  const courses = Object.entries(opts.courseBests || {}).filter(([, t]) => Number.isFinite(t)).sort((a, b) => a[1] - b[1]);
  if (recs.length || courses.length) {
    const best = courses[0] ? `${(opts.courseName && opts.courseName(courses[0][0])) || courses[0][0]} ${fmtTime(courses[0][1])}` : '';
    const pl = (k, w) => `${k} ${w}${k > 1 ? 's' : ''}`;
    lines.push((E ? 'Records: ' : 'Records : ') + [recs.length ? pl(recs.length, 'job') : '', courses.length ? pl(courses.length, 'course') : ''].filter(Boolean).join(', ') + (best ? `  ·  ${best}` : ''));
  }
  lines.push(E ? `In your pocket: ${nf(money)} $` : `Dans tes poches : ${nf(money)} $`);
  if (done.has('divan')) lines.push(E ? 'The couch: still in the tree.' : 'Le divan : encore dans l’arbre.');
  return {
    eyebrow: E ? 'AYLMER, QUÉBEC · SUMMER 2004' : 'AYLMER, QUÉBEC · ÉTÉ 2004',
    title: E ? 'Your summer' : 'Ton été',
    // The narrator, French by rule. Short, and nobody says goodbye.
    body: 'Le Ranger est dans l’entrée. Le moteur fait tic, tic, en refroidissant.\nC’était ça, l’été.',
    task: lines.join('\n'),
    note: E ? 'Aylmer is still there. Enter to drive on.' : 'Aylmer est encore là. Entrée pour rouler.',
    button: E ? 'Drive on →' : 'Roule →',
    lines,
  };
}
