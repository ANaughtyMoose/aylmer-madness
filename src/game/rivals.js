// The twelve people you race against.
//
// assets/text/rivals.json is the written roster: a name, the car and year they
// could plausibly own in Aylmer in 2004, one line on how they drive, one on what
// they do when they lose, and where they are from. This file is what turns that
// into a grid — a car out of cars.js, a controller tuning out of the `style`
// line, and a taunt voice that is theirs and nobody else's.
//
// Three rules it holds to:
//
//   * a rival only ever drives a car the game actually has. Nine of the twelve
//     own something cars.js has never heard of (a GTI, an Impreza, an Omni GLH),
//     and the honest answer is that they are on the roster and not on the grid
//     yet. `carId` is resolved at CALL time against the live CARS list, so the
//     day a Mustang or a Firebird lands in cars.js, Gagnon and Boucher line up
//     without a line of this file changing.
//
//   * the style line is not decoration. Marc-André carries impossible corner
//     speed and nothing down the straight; Steve is the exact opposite. The
//     twelve tunings below are those sentences turned into numbers, and
//     tools/smoke_modes.mjs drives them: Marc-André takes the village on corner
//     speed, Steve is the fastest thing on the strip in a straight line, and
//     nobody is in the top four of both lists.
//
//   * nobody borrows anybody else's mouth. The forty taunts in racing.json are
//     split into four voices — loud, cold, rough, warm — and each rival is in
//     exactly one. Sophie nods and flashes her high beams; she is never going to
//     use Kevin Boucher's lines, and now she cannot.
//
// Real people (Sayyad, Zahra, Margaret, Adam Actell, Mike McDonald) never carry
// an invented surname anywhere a player can see one. Sayyad is Sayyad.
import { CARS } from './cars.js';
import { TEXT, taunt as anyTaunt, line as textLine } from './racingtext.js';

/** Voices. A rival is in exactly one, and a voice owns a quarter of each pool. */
export const VOICES = ['loud', 'cold', 'rough', 'warm'];

// One row per rival, in racing/rivals.json order.
//   text     index into assets/text/rivals.json `rivals` — the written record
//   name     the same name written out here, so a grid can be built before the
//            fetch lands (see racingtext.js: names are identity, lines are late)
//   car      the id in cars.js they would drive if it existed...
//   standIn  ...and what they take instead until it does. Null means the roster
//            is holding a seat for them and no course may field them yet.
//   voice    which quarter of the taunts is theirs
//   skill    the `style` sentence as controller tuning (see race.js SKILL for
//            what each number does). These live here rather than in race.js
//            because they are character, not controller: race.js keeps the
//            three friends, the cruiser and the pace car.
//
// Reading the four numbers as personality, because it is not obvious:
//   cruise    what he will do on a straight
//   minSpeed  what he refuses to go below in a corner — corner speed, really
//   cornerK   how much he LIFTS for a bend. High is a careful driver, not a fast
//             one: the road graph has a kink every thirty metres, and a big
//             cornerK sheds speed at every one of them — which is why the
//             reckless drivers here have LOW numbers, not high ones. What makes
//             them slow in a corner is minSpeed and the steering, not caution
//   gain/damp precision. Low gain with high damp is a car that runs wide and
//             then saws at the wheel, which is what "sloppy" has to mean here
export const ROSTER = [
  {
    id: 'sayyad', text: 0, name: 'Sayyad', car: 'civic', standIn: 'civic', voice: 'loud',
    // Screaming high-RPM precision, late braking, weaving on the wide boulevards.
    // Two thousand pounds of nothing and he barely lifts. The boss fight.
    skill: { cruise: 18.6, cornerK: 0.38, minSpeed: 8.8, gain: 1.86, damp: 0.21,
             band: { ahead: 0.91, behind: 1.07 } },
  },
  {
    id: 'gendron', text: 1, name: 'Mathieu Gendron', car: 'sunfiregt', standIn: null, voice: 'loud',
    // Heavy-footed straight-line speed with no regard for brakes or suspension.
    // His is the Sunfire GT, which is not the 1997 Sunfire Adam Actell owns —
    // and Adam's is the only one in the game, so Mat waits for his own.
    skill: { cruise: 20.0, cornerK: 0.44, minSpeed: 6.2, gain: 1.42, damp: 0.31,
             band: { ahead: 0.88, behind: 1.09 } },
  },
  {
    id: 'gagnon', text: 2, name: 'Patrice Gagnon', car: 'mustang', standIn: null, voice: 'loud',
    // Overpowered rear-drive sliding, far too much wheelspin off the line.
    skill: { cruise: 20.6, cornerK: 0.46, minSpeed: 5.8, gain: 1.36, damp: 0.34,
             band: { ahead: 0.86, behind: 1.10 } },
  },
  {
    id: 'levesque', text: 3, name: 'Éric Lévesque', car: 'omni', standIn: null, voice: 'cold',
    // Twitchy boost and terrifying passes on narrow gravel shoulders.
    skill: { cruise: 18.2, cornerK: 0.52, minSpeed: 7.6, gain: 1.95, damp: 0.18,
             band: { ahead: 0.90, behind: 1.08 } },
  },
  {
    id: 'tremblay', text: 4, name: 'Sophie Tremblay', car: 'gti', standIn: null, voice: 'cold',
    // Smooth clinical European lines and flawless downshifts through the curves.
    // No stand-in: the only four-door on the lot is Margaret's Saturn, and
    // handing a rival somebody's real car is not a stand-in, it is a theft.
    skill: { cruise: 18.4, cornerK: 0.46, minSpeed: 8.6, gain: 1.70, damp: 0.28,
             band: { ahead: 0.92, behind: 1.05 } },
  },
  {
    id: 'boucherk', text: 5, name: 'Kevin Boucher', car: 'cavalier', standIn: 'cavalier', voice: 'rough',
    // Bumper-to-bumper tailgating and paint-trading in the narrow sections. He
    // is the one who does not brake for traffic: `avoid` shortens the distance
    // at which he will lift for a car in his lane, which is most of the reason
    // his Cavalier arrives at the finish with somebody else's paint on it.
    skill: { cruise: 18.8, cornerK: 0.60, minSpeed: 7.0, gain: 1.60, damp: 0.24,
             avoid: 0.45, band: { ahead: 0.89, behind: 1.10 } },
  },
  {
    id: 'macintyre', text: 6, name: 'Dave MacIntyre', car: 'impreza', standIn: null, voice: 'warm',
    // Unstoppable on gravel, four-wheel slides through dirt corners.
    skill: { cruise: 18.6, cornerK: 0.50, minSpeed: 8.2, gain: 1.75, damp: 0.24,
             band: { ahead: 0.90, behind: 1.07 } },
  },
  {
    id: 'larouche', text: 7, name: 'Yanick Larouche', car: 'integra', standIn: null, voice: 'cold',
    // Drafting, high-speed bridge sprints, surgical shifts at the redline.
    skill: { cruise: 20.0, cornerK: 0.66, minSpeed: 7.2, gain: 1.62, damp: 0.26,
             band: { ahead: 0.89, behind: 1.08 } },
  },
  {
    id: 'beaulieu', text: 8, name: 'Big Dan Beaulieu', car: 'montecarlo', standIn: 'cutlass', voice: 'warm',
    // Lumbering V8 momentum and wide cornering that occupies both lanes. The
    // Cutlass Ciera on the used lot is the same GM G-body underneath, which is
    // as close as this game gets to a Monte Carlo SS.
    skill: { cruise: 19.4, cornerK: 0.52, minSpeed: 5.6, gain: 1.22, damp: 0.40,
             band: { ahead: 0.87, behind: 1.10 } },
  },
  {
    id: 'roy', text: 9, name: 'Chantal Roy', car: 'celica', standIn: null, voice: 'warm',
    // Agile slalom driving through traffic and fast handbrake turns.
    skill: { cruise: 17.4, cornerK: 0.40, minSpeed: 9.4, gain: 2.00, damp: 0.20,
             band: { ahead: 0.92, behind: 1.06 } },
  },
  {
    id: 'cote', text: 10, name: 'Marc-André Côté', car: 'miata', standIn: null, voice: 'cold',
    // Momentum racing and impossible corner speed. Slowest thing here in a
    // straight line and the fastest through anything that bends.
    skill: { cruise: 16.4, cornerK: 0.30, minSpeed: 10.4, gain: 1.96, damp: 0.20,
             band: { ahead: 0.93, behind: 1.05 } },
  },
  {
    id: 'bouchers', text: 11, name: 'Steve Boucher', car: 'firebird', standIn: null, voice: 'loud',
    // Brutal straight-line acceleration and sloppy panic braking at every
    // corner. The exact inverse of Marc-André, on purpose.
    skill: { cruise: 21.6, cornerK: 0.42, minSpeed: 5.0, gain: 1.28, damp: 0.42,
             band: { ahead: 0.85, behind: 1.11 } },
  },
];

const byId = new Map(ROSTER.map((r) => [r.id, r]));
/** A rival by id, or null. */
export const rival = (id) => byId.get(id) || null;

const written = (r) => (r && r.text != null && TEXT.rivals ? TEXT.rivals[r.text] : null) || null;

/** Their name. The written one when the copy has loaded, the local one before. */
export function rivalName(r) {
  const w = written(r);
  // The written names carry a nickname in quotes — "Kevin 'Bumper' Boucher".
  // That is the name; the local one is only the fallback.
  return (w && w.name) || (r && r.name) || '';
}
/** How they drive, in their own words. */
export const rivalStyle = (r) => (written(r) && written(r).style) || '';
/** What they do when they lose. */
export const rivalWhenLosing = (r) => (written(r) && written(r).whenLosing) || '';
/** Where they are from, and how old. */
export const rivalFrom = (r) => (written(r) && written(r).fromWhere) || '';
/** The car they actually own, written out — a Monte Carlo SS, not a Cutlass. */
export function rivalCar(r) {
  const w = written(r);
  return w ? `${w.year} ${w.car}` : '';
}

/**
 * The cars.js id this rival drives, or null if the game has no car for them yet.
 * Their real car wins the moment cars.js has one by that id — which is how the
 * unlockable legends light Gagnon and Boucher up without touching this file.
 */
export function rivalCarId(r) {
  if (!r) return null;
  if (r.car && CARS.some((c) => c.id === r.car)) return r.car;
  if (r.standIn && CARS.some((c) => c.id === r.standIn)) return r.standIn;
  return null;
}

/** Every rival the game can actually put on a grid today. */
export const fieldable = () => ROSTER.filter((r) => rivalCarId(r));

/**
 * One grid entry in the shape racejobs.js's spawnRivals wants. Returns null for
 * a rival with no car, so a course can list somebody optimistically and simply
 * not field them until their car ships.
 */
export function gridEntry(id) {
  const r = rival(id);
  const carId = rivalCarId(r);
  if (!carId) return null;
  // `name` is a getter on purpose. A course's grid is built at module load and
  // rivals.json arrives over the network some time after that, so a plain string
  // here would freeze the fallback name into every race for the whole session.
  return {
    rival: r.id, carId, skill: r.skill,
    get name() { return rivalName(r); },
  };
}

/** A course's `rivals` array, skipping anyone the game has no car for. */
export const grid = (...ids) => ids.map(gridEntry).filter(Boolean);

// ---------------------------------------------------------------- the voices

// Which quarter of a taunt pool belongs to which voice. Deterministic, so the
// split is the same in the test as in the game, and disjoint, so no two voices
// can ever say the same line.
function voicePool(when, voice) {
  const all = (TEXT.taunts || []).filter((t) => t.when === when);
  const k = VOICES.indexOf(voice);
  if (k < 0 || !all.length) return all;
  return all.filter((_, i) => i % VOICES.length === k);
}

const bags = new Map();

/**
 * A line from THIS rival's voice, for 'pre' | 'ahead' | 'beaten'. Drains the
 * voice's own bag before repeating; falls back to the shared pool only for a
 * rival who is not on the roster at all.
 */
export function rivalTaunt(r, when) {
  if (!r) return anyTaunt(when);
  const key = r.voice + ':' + when;
  let bag = bags.get(key);
  if (!bag || !bag.length) {
    bag = voicePool(when, r.voice).slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    bags.set(key, bag);
  }
  return bag.length ? bag.pop() : anyTaunt(when);
}

/** `Kevin 'Bumper' Boucher: « ... »`, or an empty string when there is nothing. */
export function rivalSays(r, when) {
  const l = textLine(rivalTaunt(r, when));
  return l ? `${rivalName(r)}: « ${l} »` : '';
}

/** Tests: forget the voice bags. */
export function resetRivals() { bags.clear(); }
