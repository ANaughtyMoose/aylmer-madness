// The summer, counted. Saturday 26 June 2004 to Monday 6 September 2004 —
// Labour Day — is 73 days, and every job and every race costs one of them.
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

export const SUMMER_START = Date.UTC(2004, 5, 26);   // Sat 26 June 2004
export const DAYS = 73;                               // through Mon 6 Sept
export const LAST = DAYS - 1;                         // day index of Labour Day
export const TARGET = 1200;                           // the envelope, in dollars
// Every job's money was worth an hour of a 17-year-old's time in 1994, not
// 2004: one clean pass of all 22 jobs netted $724 against a $1,200 goal. The
// lift lands the pass at ~$950 (the budget table) without touching a def.
// Races are already priced right and take only the difficulty factor. It is
// set on G by startSummer, so the node suites — which never start a summer —
// keep the numbers they were written against.
export const PAY_LIFT = 1.3;

// Easy / normal / hard, straight from the plan. `firstDay` is where the summer
// starts (hard begins on 24 July, the day after Tom's birthday), `dayCost` is
// what a job takes off the calendar, `pay` scales every job's money, `rival`
// is a rival's cruise as a fraction of YOUR car's top speed (Wave 3 reads it),
// `ticket` is the fine, `timer` stretches or squeezes every stage clock.
export const DIFF = {
  easy:   { firstDay: 0,  dayCost: 0.5, pay: 1.3, rival: 0.70, ticket: 40,  timer: 1.4 },
  normal: { firstDay: 0,  dayCost: 1,   pay: 1.0, rival: 0.82, ticket: 75,  timer: 1.0 },
  hard:   { firstDay: 28, dayCost: 1,   pay: 0.8, rival: 0.92, ticket: 120, timer: 0.9 },
};
export function diff(G) { return DIFF[G && G.difficulty] || DIFF.normal; }

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
// Lives on G so save.js can carry it: G.day (float, 0..72), G.target, and two
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
  if (G.summerOver) return false;
  const before = Math.floor(G.day);
  G.day = Math.min(LAST, G.day + diff(G).dayCost);
  const after = Math.floor(G.day);
  const changed = after !== before;
  if (changed && hud && hud.toast) hud.toast(dayToast(G.day), 2800);
  return changed;
}

export function dayToast(day) {
  const left = daysLeft(day);
  const w = weatherLine(day);
  const head = capitalize(label(day)) + (w ? ' · ' + w : '');
  if (left <= 0) return head + '\nFête du Travail.';
  if (left <= 14) return head + `\n${left} jour${left > 1 ? 's' : ''} avant la fête du Travail.`;
  return head;
}

/** The two lines the envelope on the HUD prints. */
export function envelopeText(G) {
  const v = Math.round(G.wallet ? G.wallet.value : 0);
  const amount = `${fmt(v)} $ / ${fmt(G.target || TARGET)} $`;
  if (G.summerOver) return { amount, day: 'L’été est fini.' };
  const left = daysLeft(G.day || 0);
  const day = `${label(G.day || 0)} · ${left} jour${left > 1 ? 's' : ''}`;
  return { amount, day };
}

/**
 * Once a summer: the moment the envelope holds the number. Not the ending —
 * that is Labour Day — but the father notices, and so should the player.
 */
export function checkReached(G, hud = G.hud) {
  if (G.reached || G.summerOver || !G.wallet) return false;
  if (G.wallet.value < (G.target || TARGET)) return false;
  G.reached = true;
  if (hud && hud.toast) {
    hud.toast('Ton père a compté l’enveloppe sans rien dire.\n« Garde-la de même jusqu’à la fête du Travail. Pis touche pas à ça pour des jantes. »', 5200);
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
export function dayInfo(day) { return SUMMER ? SUMMER.get(iso(day)) || null : null; }

const SKY_FR = {
  clear: 'ciel dégagé', fair: 'beau', cloudy: 'nuageux', overcast: 'couvert',
  showers: 'averses', rain: 'pluie', thunderstorm: 'orages', fog: 'brume',
};
export function weatherLine(day) {
  const i = dayInfo(day);
  if (!i) return '';
  const parts = [];
  if (Number.isFinite(i.tmaxC)) parts.push(`${Math.round(i.tmaxC)}°`);
  if (i.humidex && i.humidex >= 30) parts.push(`humidex ${Math.round(i.humidex)}`);
  if (i.sky && SKY_FR[i.sky]) parts.push(SKY_FR[i.sky]);
  return parts.join(', ');
}

function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'); }   // narrow no-break space: 1 200 $, the French way
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
