// The written lines for the racing side of the game.
//
// assets/text/racing.json carries the course names, the rival taunts, the jump
// names and the stunt callouts; assets/text/ambient.json carries the police
// radio. All of it is written copy, all of it has an `en` gloss beside the
// French, and none of it is invented here — this file only loads it, keeps the
// records whole (glosses included, because the translation hotkey is going to
// want them), and hands out a line at a time.
//
// Two rules the rest of the code depends on:
//
//   * it is never required. Every pool below has a small hardcoded fallback, so
//     a build with no assets/text/ directory still races, still jumps and still
//     gets chased. The game does not wait on a fetch to start.
//   * a NAME is not a line. Course and jump names come out of racing.json by
//     index — the mapping lives next to the course, in modes.js and jumps.js —
//     and the hardcoded name is the fallback for that one entry. Names have to
//     be stable the instant the picker opens; flavour lines can turn up late.
//
// Loading is fetch in the browser and node:fs under the smoke tests, so the
// tests check the real strings and not the fallbacks.

/** Everything, as loaded. Records, not strings: `{ line, en, ... }`. */
export const TEXT = {
  courses: [],      // { name, area, character }
  taunts: [],       // { when: pre|ahead|beaten, line, en }
  jumps: [],        // { name, where, description }
  callouts: [],     // { when: air|combo|landing|crash, line, en }
  police: [],       // { state: idle|spotted|pursuit|lost|caught|warning, line, en }
  loaded: false,
};

// The fallbacks. Deliberately thin — enough that nothing reads as a blank, not
// so much that anyone is tempted to edit them instead of the JSON.
const FALLBACK = {
  taunts: [
    { when: 'pre', line: 'Ton tailgate tient avec de la corde à foin. Bonne chance.',
      en: 'Your tailgate is held on with baling twine. Good luck.' },
    { when: 'ahead', line: 'Salut là! J’vais te garder une place au fil d’arrivée.',
      en: 'Bye now! I’ll save you a spot at the finish.' },
    { when: 'beaten', line: 'J’avais un pneu mou. C’est pas une vraie victoire.',
      en: 'I had a soft tire. That’s not a real win.' },
  ],
  callouts: [
    { when: 'air', line: 'On touche pu à terre!', en: 'We’re not touching ground anymore!' },
    { when: 'combo', line: 'Encore! Encore!', en: 'Again! Again!' },
    { when: 'landing', line: 'Posé comme un pro.', en: 'Landed like a pro.' },
    { when: 'crash', line: 'Ayoye. Ça, ça va paraître.', en: 'Ouch. That’s going to show.' },
  ],
  police: [
    { state: 'idle', line: 'Centrale à toutes les unités, rien à signaler.',
      en: 'Dispatch to all units, nothing to report.' },
    { state: 'spotted', line: 'Centrale, j’ai un pick-up qui roule pas mal vite.',
      en: 'Dispatch, I’ve got a pickup moving pretty quick.' },
    { state: 'pursuit', line: 'Unité 42 en poursuite, le pick-up refuse d’obtempérer!',
      en: 'Unit 42 in pursuit, the pickup is refusing to stop!' },
    { state: 'lost', line: 'Centrale, on l’a perdu. On repasse en patrouille.',
      en: 'Dispatch, we lost him. Back on patrol.' },
    { state: 'caught', line: 'Coupe le moteur pis sors les mains en vue.',
      en: 'Cut the engine and step out with your hands showing.' },
    { state: 'warning', line: 'Ralentis, mon jeune. Prochaine fois c’est un ticket.',
      en: 'Slow it down, kid. Next time it’s a ticket.' },
  ],
};

const RACING_KEYS = ['courses', 'taunts', 'jumps', 'callouts'];

for (const k of ['taunts', 'callouts', 'police']) TEXT[k] = FALLBACK[k].slice();

// ---------------------------------------------------------------- loading

function merge(racing, ambient) {
  if (racing) {
    for (const k of RACING_KEYS) if (Array.isArray(racing[k]) && racing[k].length) TEXT[k] = racing[k];
  }
  if (ambient && Array.isArray(ambient.police) && ambient.police.length) TEXT.police = ambient.police;
  TEXT.loaded = true;
  return TEXT;
}

/**
 * Read both files. `base` is the directory they live in, relative to the page.
 * Resolves to TEXT whatever happens — a missing file is not an error, it is a
 * build without the copy in it.
 */
export async function loadRacingText(base = 'assets/text/') {
  const one = async (name) => {
    try {
      if (typeof fetch === 'function' && typeof document !== 'undefined' && document.baseURI) {
        const r = await fetch(base + name, { cache: 'no-cache' });
        return r.ok ? await r.json() : null;
      }
      const fs = await import('node:fs/promises');
      return JSON.parse(await fs.readFile(base + name, 'utf8'));
    } catch { return null; }
  };
  const [racing, ambient] = await Promise.all([one('racing.json'), one('ambient.json')]);
  return merge(racing, ambient);
}

/** For a test, or for anyone who already has the parsed objects. */
export function setRacingText(racing, ambient) { return merge(racing, ambient); }

// ---------------------------------------------------------------- picking
//
// A deterministic-ish shuffle bag per tag: you hear all of them before you hear
// any of them twice, which is the difference between a game with forty lines in
// it and a game with the same four lines in it.
const bags = new Map();

function bagFor(pool, tag, field) {
  const key = pool + ':' + tag;
  let bag = bags.get(key);
  if (!bag || !bag.length) {
    bag = TEXT[pool].filter((r) => !tag || r[field] === tag);
    if (!bag.length) bag = FALLBACK[pool] ? FALLBACK[pool].filter((r) => !tag || r[field] === tag) : [];
    bag = bag.slice();
    // Shuffle once, then drain.
    for (let i = bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    bags.set(key, bag);
  }
  return bag;
}

function pick(pool, tag, field) {
  const bag = bagFor(pool, tag, field);
  return bag.length ? bag.pop() : null;
}

/** A rival line for `when` — 'pre' | 'ahead' | 'beaten'. Record, or null. */
export const taunt = (when) => pick('taunts', when, 'when');
/** A stunt line for `when` — 'air' | 'combo' | 'landing' | 'crash'. */
export const callout = (when) => pick('callouts', when, 'when');
/** A police line for `state` — idle|spotted|pursuit|lost|caught|warning. */
export const policeLine = (state) => pick('police', state, 'state');

/** Just the French, for a toast. Empty string when there is nothing to say. */
export const line = (rec) => (rec && rec.line) || '';

/**
 * The written name for a course or a jump, by its index in racing.json, with
 * the local name as the fallback. The index lives beside the course so the
 * mapping is reviewable in one place.
 */
export function writtenName(pool, i, fallback) {
  const rec = i != null && TEXT[pool] ? TEXT[pool][i] : null;
  return (rec && rec.name) || fallback;
}

/** Forget the shuffle bags. Tests, and a new game. */
export function resetText() { bags.clear(); }
