// The summer, counted. Tuesday 22 June 2004 to Monday 6 September 2004 —
// Labour Day — is 77 days, and every job and every race costs one of them.
// (Restructure, 29 Sept 2026: the summer starts on the 22nd so the Saint-Jean,
// 24 June, is in it. It used to start on Saturday 26 June; save.js moves an old
// save's day index forward by four so its date does not change.)
// That single rule is the whole difficulty system: it bounds farming without a
// replay penalty, it makes the date on screen mean something, and it never
// punishes an ordinary player, who does everything once in about 35 days and
// has five weeks of slack for driving around. Somebody who runs « Run au dep »
// forty times hits September. The deadline is there to be felt in August, not
// to fail people in July (docs/PLAN.md, « Difficulty — the numbers »).
//
// Nothing here reads the sky. The ten-minute day/night loop in main.js is
// atmosphere; the calendar is progress. Keeping them apart is what lets the
// seam card freeze the sim without a day going missing.

export const SUMMER_START = Date.UTC(2004, 5, 22);   // Tue 22 June 2004
export const DAYS = 77;                               // through Mon 6 Sept
// How far the old 26 June day 0 sits from the new one (save.js migration).
export const OLD_START_SHIFT = 4;
// The first day the recorded weather file covers (assets/text/summer2004.json).
export const WEATHER_FROM = '2004-06-26';
export const LAST = DAYS - 1;                         // day index of Labour Day
// The old $1,200 envelope. No longer the HUD's headline or a win condition
// (restructure: the headline is the days left in the summer and the ending
// cannot be failed); kept so old saves and the save format keep their field.
export const TARGET = 1200;
// The beat that ends the summer in index.html (arc.js « Le dernier voyage »).
export const FINALE = 'arcdernier';                           // the envelope, in dollars
// Every job's money was worth an hour of a 17-year-old's time in 1994, not
// 2004: one clean pass of all 22 jobs netted $724 against a $1,200 goal. The
// lift lands the pass at ~$950 (the budget table) without touching a def.
// Races are already priced right and take only the difficulty factor. It is
// set on G by startSummer, so the node suites — which never start a summer —
// keep the numbers they were written against.
export const PAY_LIFT = 1.05;   // was 1.3 with 22 jobs; the six Wave 3 jobs carry the budget now

// Easy / normal / hard, straight from the plan. `firstDay` is where the summer
// starts (hard begins on 24 July, the day after Tom's birthday), `dayCost` is
// what a job takes off the calendar, `pay` scales every job's money, `rival`
// is a rival's cruise as a fraction of YOUR car's top speed (Wave 3 reads it),
// `ticket` is the fine, `timer` stretches or squeezes every stage clock.
export const DIFF = {
  easy:   { firstDay: 0,  dayCost: 0.5, pay: 1.3, rival: 0.70, ticket: 40,  timer: 1.4 },
  normal: { firstDay: 0,  dayCost: 1,   pay: 1.0, rival: 0.82, ticket: 75,  timer: 1.0 },
  hard:   { firstDay: 32, dayCost: 1,   pay: 0.8, rival: 0.92, ticket: 120, timer: 0.9 },
};
export function diff(G) { return DIFF[G && G.difficulty] || DIFF.normal; }

// W8-FIRST15: the Saint-Jean (mission 3) is date-locked to 24 June, day 2
// (campaign.js SAINT_JEAN_DAY; calendar.js imports nothing, so the number is
// repeated here and smoke_first15 checks the two agree). On easy a job was half
// a day, so L'alternateur and Sayyad left the calendar on the 23rd and a new
// player was told to sleep before mission 3. Before that day a job costs a
// whole day on every difficulty; easy's half days start on the 24th.
export const WHOLE_DAYS_UNTIL = 2;
export function dayCost(G) {
  const c = diff(G).dayCost;
  return G && Number.isFinite(G.day) && G.day < WHOLE_DAYS_UNTIL ? Math.max(1, c) : c;
}

const DOW = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juill', 'août', 'sept', 'oct', 'nov', 'déc'];

export function dateOf(day) { return new Date(SUMMER_START + Math.floor(Math.max(0, Math.min(LAST, day))) * 86400000); }
export function iso(day) { return dateOf(day).toISOString().slice(0, 10); }
/** « sam 26 juin », « lun 6 sept » — the way a Caisse populaire calendar prints it. */
export function label(day) {
  const d = dateOf(day);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export function daysLeft(day) { return Math.max(0, Math.ceil(LAST - day)); }
export function isOver(day) { return day >= LAST; }

// ---------------------------------------------------------------- the state
//
// Lives on G so save.js can carry it: G.day (float, 0..76), G.target, and two
// flags. `startSummer` is a new game; `restoreSummer` is a load.

export function startSummer(G) {
  const d = diff(G);
  G.day = d.firstDay;
  G.target = TARGET;
  G.summerOver = false;
  G.reached = false;
  G.ticket = d.ticket;
  G.payScale = PAY_LIFT * d.pay;
  G.racePayScale = d.pay;
  G.timerScale = d.timer;
  G.rivalFrac = d.rival;
  return G;
}

export function restoreSummer(G, save) {
  startSummer(G);
  if (save) {
    if (Number.isFinite(save.day)) G.day = Math.max(0, Math.min(LAST, save.day));
    if (Number.isFinite(save.target)) G.target = Math.max(100, Math.min(5000, save.target));
    G.summerOver = !!save.summerOver;
    G.reached = !!save.reached;
  }
  return G;
}

/**
 * A job or a race just ended, for good or ill. Returns true when the date on
 * the calendar actually changed (easy mode spends half-days). The toast is the
 * new date with the real weather when the summer file is loaded, and the
 * countdown once it is short enough to matter.
 */
export function spendDay(G, hud = G.hud) {
  // B-07: a main story job that just failed keeps its day (keepDay, below).
  // The mark is good for one spendDay, and only while that job is still the
  // one on G (main.js's failMission spends before closeMission).
  const kept = G.dayKept;
  G.dayKept = null;
  if (kept && G.mission && G.mission.def && G.mission.def.id === kept) return false;
  if (G.summerOver) return false;
  const before = Math.floor(G.day);
  // A day a failed job still owes (deferDay, below) is paid with this one, so
  // a retry window that never got settled cannot turn into a free day.
  const owed = Math.max(0, G.dayOwed | 0);
  G.dayOwed = 0;
  G.day = Math.min(LAST, G.day + dayCost(G) * (1 + owed));
  // index.html (progression review P7): the ending needs Labour Day, which is
  // 72 day-spends, but there are only 33 jobs, so a player who did everything
  // never saw it without replaying 39 more. « Le dernier voyage » is written as
  // the end of the summer and arc.js gates it behind every other job, so when
  // it is done the summer is: the calendar goes to Labour Day, and main.js's
  // endOfJob() runs the ending off isOver() like any other last day.
  if (G.done && G.done.has && G.done.has(FINALE)) G.day = LAST;
  const after = Math.floor(G.day);
  const changed = after !== before;
  if (changed && hud && hud.toast) hud.toast(dayToast(G.day), 2800);
  return changed;
}

// ------------------------------------------------------------ owed days
//
// A failed job that offers a free retry (retry.js) does not spend its day at
// the fail: it puts it on the slate. Taking the free retry forgives it; letting
// the retry window run out settles it. G.dayOwed is a small integer on G, and
// spendDay above pays whatever is still owed along with its own day.

// B-07: a failed story job's day is kept, not spent. retry.js marks it with the
// job's id; the next spendDay (main.js's endOfJob in failMission) consumes the
// mark and spends nothing. unkeepDay drops a mark nobody consumed.
export function keepDay(G, id) {
  G.dayKept = id || null;
  return G.dayKept;
}
export function unkeepDay(G) {
  const had = !!G.dayKept;
  G.dayKept = null;
  return had;
}

export function deferDay(G) {
  G.dayOwed = Math.max(0, G.dayOwed | 0) + 1;
  return G.dayOwed;
}

export function forgiveDay(G) {
  const had = Math.max(0, G.dayOwed | 0);
  G.dayOwed = Math.max(0, had - 1);
  return had > 0;
}

/** Spend the days still owed, if any. Returns true when the date changed. */
export function settleDay(G, hud = G.hud) {
  const owed = Math.max(0, G.dayOwed | 0);
  if (!owed) return false;
  G.dayOwed = owed - 1;          // spendDay pays the rest along with this one
  return spendDay(G, hud);
}

export function dayToast(day) {
  const left = daysLeft(day);
  const w = weatherLine(day);
  const head = capitalize(label(day)) + (w ? ' · ' + w : '');
  if (left <= 0) return head + '\nFête du Travail.';
  if (left <= 14) return head + `\n${left} jour${left > 1 ? 's' : ''} avant la fête du Travail.`;
  return head;
}

/** « 74 jours d’été », the HUD's headline (restructure: not a dollar goal). */
export function daysLeftText(day) {
  const left = daysLeft(day || 0);
  if (left <= 0) return 'Fête du Travail';
  return `${left} jour${left > 1 ? 's' : ''} d’été`;
}

/**
 * The two lines of the box top right. The first (big) line is the days left in
 * the summer; the second is the date and the wallet, which still matters (gas
 * and repairs cost, and Dad's call on the landline is the rescue).
 * The field names are the old envelope's so hud.setEnvelope is unchanged.
 */
export function envelopeText(G) {
  const v = Math.round(G.wallet ? G.wallet.value : 0);
  const money = `${fmt(v)} $`;
  if (G.summerOver) return { amount: 'L’été est fini.', day: money, headline: 'days' };
  return { amount: daysLeftText(G.day || 0), day: `${label(G.day || 0)} · ${money}`, headline: 'days' };
}

/**
 * Once a summer: the moment the envelope holds the number. Not the ending —
 * that is Labour Day — but the father notices, and so should the player.
 */
export function checkReached(G, hud = G.hud) {
  // Restructure (29 Sept 2026): there is no dollar goal any more. Kept as a
  // no-op so old callers and saves (`reached`) keep working.
  if (!G || !G.useTarget) return false;
  if (G.reached || G.summerOver || !G.wallet) return false;
  if (G.wallet.value < (G.target || TARGET)) return false;
  G.reached = true;
  if (hud && hud.toast) {
    hud.toast('1 200 $ de côté pour le Ranger et les études.\nContinue à prévoir le gaz et les pièces : septembre approche.', 5200);
  }
  return true;
}

// ---------------------------------------------------------------- the weather
//
// Optional: assets/text/summer2004.json, the real Environment Canada day-by-day
// for Ottawa (a Gemini job, docs/GEMINI_CALENDAR_PROMPT.md). Absent, the toast
// is just the date. Never a 404 in the console: the manifest-style gate is a
// fetch that is allowed to fail quietly.
let SUMMER = null;
export async function loadSummer(fetchImpl, url = 'assets/text/summer2004.json') {
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return null;
  try {
    const r = await f(url);
    if (!r || !r.ok) return null;
    const j = await r.json();
    const arr = Array.isArray(j) ? j : (j && j.days) || null;
    if (!arr) return null;
    SUMMER = new Map(arr.filter((d) => d && d.date).map((d) => [d.date, d]));
    return SUMMER;
  } catch { return null; }
}
export function setSummer(map) { SUMMER = map; }
/**
 * The recorded day, or for 22-25 June (before the Environment Canada file
 * starts on the 26th) a plain clear default with no numbers, so the prototype's
 * sky is fair for the Saint-Jean instead of whatever the last run left. Marked
 * `synthetic`: weatherLine() says nothing about it rather than invent a
 * temperature.
 */
export function dayInfo(day) {
  if (!SUMMER) return null;
  const k = iso(day);
  const i = SUMMER.get(k);
  if (i) return i;
  return k < WEATHER_FROM ? { date: k, sky: 'clear', synthetic: true } : null;
}

const SKY_FR = {
  clear: 'ciel dégagé', fair: 'beau', cloudy: 'nuageux', overcast: 'couvert',
  showers: 'averses', rain: 'pluie', thunderstorm: 'orages', fog: 'brume',
};
export function weatherLine(day) {
  const i = dayInfo(day);
  if (!i || i.synthetic) return '';
  const parts = [];
  if (Number.isFinite(i.tmaxC)) parts.push(`${Math.round(i.tmaxC)}°`);
  if (i.humidex && i.humidex >= 30) parts.push(`humidex ${Math.round(i.humidex)}`);
  if (i.sky && SKY_FR[i.sky]) parts.push(SKY_FR[i.sky]);
  return parts.join(', ');
}

function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'); }   // narrow no-break space: 1 200 $, the French way
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
