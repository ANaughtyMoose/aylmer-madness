// When a job can be started, by the clock and by the calendar, in the 2004
// prototype (prototype.html). index.html is untouched: there a job's
// `timeOfDay` pins the sky for the length of the job and the calendar moves one
// day per job, so neither question comes up.
//
// In the prototype the clock is real — 24 real minutes to a game day at the
// default rate — and a job no longer moves it (main.js setEnv returns early).
// So a job whose text says « avant minuit » or « Il dort comme une roche » ran
// at one in the afternoon (progression review P1). The fix is not to move the
// clock for the player, which would be a concealed time jump; it is to only
// OFFER the job while its own hour is on the clock, and to say plainly when
// that is: « Reviens après 21 h ».
//
// The windows are data, here, keyed by mission id, so the story agent can
// rewrite the jobs' text without this table and that text ever touching.
// [start, end] are whole hours on the 24 h clock; end < start wraps midnight.
// The window is checked when the job STARTS only (review H3: a long job can run
// past the end of its window, and that is fine).
//
// Two jobs are being rethemed by the story agent as of 29 Sept, and their
// windows are written for BOTH versions:
//   curfew  « Avant minuit » -> breakfast nachos before 5 a.m. Night, and the
//           small hours: 21 h to 4 h covers « home before midnight » and
//           « nachos before five ».
//   school  « Première période » (woke up at 8:52) -> the 5:45 a.m. shift at
//           the Royal Ottawa. Early morning: 4 h to 8 h.
//
// Restructure (29 Sept 2026): the table follows the ten main missions. The
// cut jobs (seme, quatre, tour) are gone from it; the new night and dawn
// premises are in. `nuittim` is built on the set-pieces branch; its row is
// here so its hour is right the moment it lands.
export const MISSION_WINDOWS = {
  sayyad: [21, 4],       // 2 Réveiller Sayyad: revving and honking outside his house, at night
  arcbache: [17, 23],    // 3 La Saint-Jean: the bonfire at the beach, the evening of the 24th
  golfcart: [21, 4],     // 6 N'importe quelle petite clé: the golf-key night
  nuittim: [21, 4],      // 8 La nuit du Tim: a night, and its small hours
  school: [4, 8],        // 9 5 h 45 au Royal Ottawa: the dawn shift
  curfew: [2, 5],        // 10 Nachos avant Little Big Man: 4 h 30 at the marina, home before 5 h (QA 29 Sept: was 21-4)
};

// What main.js calls DAY_NIGHT_CYCLE: seconds of G.dayClock in one game day.
export const DAY_CYCLE = 600;

/**
 * Is this the prototype? G.prototype2004 decides when it is set (the node
 * suites set it); otherwise the page says so the way main.js reads it.
 */
export function isPrototype(G) {
  if (G && typeof G.prototype2004 === 'boolean') return G.prototype2004;
  try {
    return typeof document !== 'undefined' && !!document.documentElement
      && !!document.documentElement.dataset && document.documentElement.dataset.prototype === '2004';
  } catch { return false; }
}

/** The hour on the game clock, 0 <= h < 24. */
export function gameHour(G) {
  const cyc = (G && G.dayCycle) || DAY_CYCLE;
  const c = G && Number.isFinite(G.dayClock) ? G.dayClock : 0;
  return ((((c / cyc) % 1) + 1) % 1) * 24;
}

export function jobWindow(def) {
  if (!def) return null;
  return MISSION_WINDOWS[def.id] || def.window || null;
}

/** Is `hour` inside [start, end)? A window whose end is before its start wraps midnight. */
export function inWindow(hour, w) {
  if (!w) return true;
  const [a, b] = w;
  return a <= b ? hour >= a && hour < b : hour >= a || hour < b;
}

const hh = (h) => `${h} h`;

/**
 * The line a player reads when a job is not open at this hour, in French:
 * « Reviens après 21 h », or for a morning job in the afternoon « Reviens
 * demain matin, entre 4 h et 8 h ». Null when the window is open (or there is
 * none).
 */
export function windowMessage(def, hour) {
  const w = jobWindow(def);
  if (!w || inWindow(hour, w)) return null;
  const [a, b] = w;
  if (a < 12 && hour >= b) return `Reviens demain matin, entre ${hh(a)} et ${hh(b)}.`;
  return `Reviens après ${hh(a)} (jusqu’à ${hh(b)}).`;
}

/** Prototype only: why this job cannot start at this hour, or null. */
export function windowLock(G, def) {
  if (!isPrototype(G)) return null;
  return windowMessage(def, gameHour(G));
}

// ---------------------------------------------------------------- the dates

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const SUMMER_START = Date.UTC(2004, 5, 22);   // Tue 22 June 2004 (calendar.js)

/** « 25 août » for a summer day index (0 = mar 22 juin 2004). */
export function dayName(day) {
  const d = new Date(SUMMER_START + Math.floor(day) * 86400000);
  return `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** « Pas avant le 25 août. » */
export function dateMessage(fromDay) {
  return `Pas avant le ${dayName(fromDay)}. L’été est pas rendu là.`;
}
