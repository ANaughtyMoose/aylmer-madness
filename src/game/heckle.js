// The town has opinions about your driving.
//
// Every time you scare somebody — a pedestrian dives, a driver you shoved finds
// his horn, you take a red, a friend goes by you in a race — somebody yells one
// short line of Québécois at you and it shows up as a speech bubble near the top
// of the HUD. The pool is deliberately big (60-odd lines) and the limiter is
// deliberately mean, so it reads as a town reacting and not as a slot machine:
//
//   * at most one bubble every GAP seconds, whatever the trigger
//   * a given line cannot come back for COOLDOWN seconds
//   * at most MAX bubbles on screen, BUBBLE_MS each
//   * off entirely when Options -> Jeu -> « Les gens gueulent » is unchecked
//
// The clock is fed by update(dt) from main.js's tick, so the whole thing is
// testable without a browser and pauses when the game does. Bubbles are plain
// DOM (#heckles at the end of index.html, styling at the end of style.css); with
// no document at all this class still counts and rate-limits, which is exactly
// what tools/smoke_story.mjs drives.
//
// TWO THINGS LIVE HERE THAT THE ORIGINAL DID NOT:
//
//   * the corpus. The pools below are a fallback; the real one is
//     assets/text/heckles.json, 300 written lines across twelve triggers, each
//     with an English gloss and a note. load() fetches it and quietly does
//     nothing if it is not there.
//   * the gloss on G. Every line has an English translation and, where the joke
//     does not survive the crossing, a note that explains it. Tapping G latches
//     the English under the bubbles; holding G also puts the last three lines
//     back up with their notes. This is NOT the old English UI — the menus stay
//     in French on purpose.

export const GAP = 4;             // seconds between any two heckles
export const COOLDOWN = 30;       // seconds before the same line can repeat
export const BUBBLE_MS = 2200;    // how long one bubble sticks around
export const MAX_BUBBLES = 2;     // (kept for callers; the queue below shows one at a time)
// A player who is stopped or crawling — stuck in a driveway, reading a prompt,
// lining up a parking spot — is not doing anything worth a remark every four
// seconds. The lead counted seven barks in four seconds at the spawn.
export const SLOW_KMH = 8;
export const SLOW_GAP = 12;
// Story lines (the friends, the plot) play ONE AT A TIME, in order, each for
// clamp(max(1, 0.3 s per word), 2.5, 5) seconds of game time, with a short
// breath between them. Tom approved the sequencing on 29 Sep 2026.
export const STORY_GAP = 0.35;
export const STORY_QUEUE_MAX = 8;
export function storySeconds(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.min(5, Math.max(2.5, Math.max(1, 0.3 * words)));
}
// The scene hush (B-08). A scripted scene told in toasts (the Centre antipoison
// call in the Nuit du Tim, the finale's kitchen, the Saint-Jean fire) is not a
// story bubble, so storyBusy() did not protect it, and a passer-by's gag landed
// between « Couchez-le sur le côté » and « Restez avec lui ». A scene raises
// hush(reason) every tick it runs; while any reason is live, say() and
// ambient() emit nothing. Story lines still play. Each raise lasts HUSH_TTL
// seconds of game time, so a scene that ends without saying so (a fail, a quit,
// a teleport) lets the town talk again on its own a moment later.
//
// A toast can be queued behind others and come up after its stage is over (the
// HUD shows one at a time, 2.5 s each; the harness saw the four antipoison
// lines land 40 s after the call stage, during the drive to the Tim). So a
// scene can also hushWhile(reason, test): the street stays quiet for as long
// as test() says the scene's toast is still queued or on screen, up to
// HUSH_MAX seconds of game time.
export const HUSH_TTL = 1.0;
export const HUSH_MAX = 60;
export const CLEAN_AFTER = 60;    // seconds of clean driving before the praise
export const CLEAN_MOVING = 25;   // ...of which this many actually moving

// The pool, by trigger. `who` is passed in by the caller (a rival yells under
// its own name), but each key has a sensible default speaker.
export const HECKLES = {
  // A pedestrian who just threw himself onto a lawn to get away from you.
  dive: [
    'Heille, le cave!',
    'Tabarnak, r’garde où tu vas!',
    'T’as-tu eu ton permis dans une boîte de Cracker Jack?',
    'Câlisse de malade!',
    'Mon doux que t’es dangereux!',
    'Va donc chier!',
    'Es-tu soûl, toé?',
    'C’est un trottoir, ça, pas une piste!',
    'Y’a des enfants qui jouent icitte!',
    'Ralentis, coudonc!',
    'J’appelle la police, moé, là!',
    'T’sais qu’y a des freins dans c’te char-là?',
    'Mon Dieu Seigneur!',
    'T’es-tu correct, toé?',
    'Va donc chez l’diable!',
  ],
  // Somebody leaning on the horn behind you.
  honk: [
    'Envoye, avance!',
    'C’est vert, tabarnak!',
    'Chauffe, chauffe!',
    'Y’a du monde qui travaille demain!',
    'Décide-toé!',
    'Le clignotant, ça existe!',
    'Coudonc, t’as-tu perdu ta rue?',
    'Ça fait deux fois que j’te vois, toé.',
    'Ramasse ton bazou!',
    'Enweye donc, grand-maman!',
  ],
  // You just put one of them in the ditch.
  shove: [
    'HEILLE! Mon pare-choc!',
    'T’as-tu vu ce que t’as fait, là?',
    'On échange nos assurances, mon homme?',
    'C’est neuf, ça, ostie!',
    'Attends que mon père voie ça.',
    'Ça, c’est du 400 piasses.',
    'Franchement, là!',
    'Ma mère m’avait dit de pas sortir aujourd’hui.',
  ],
  // A parked car. Somebody's parked car.
  parked: [
    'MON CHAR!',
    'C’EST MON CHAR, ÇA!',
    'Heille! J’te connais, toé!',
    'J’ai ton numéro de plaque!',
    'Ça vient de sortir du garage, ostie!',
    'MADAME! Y a un gars qui frappe les chars!',
  ],
  // A red light, taken at speed.
  red: [
    'Heille, c’tait rouge!',
    'Rouge, ça veut dire ARRÊTE!',
    'Y a-tu une urgence, coudonc?',
    'Tu vas tuer quelqu’un!',
    'Belle passe de feu rouge, champion.',
  ],
  // A friend going by you in a race.
  rival: [
    'Bye bye!',
    'Reste dans ton Ranger, mon homme',
    'Salut là! On se voit à l’arrivée!',
    'Y est-tu en marche arrière, lui?',
    'Tu veux-tu que je ralentisse?',
    'C’est pas un char, ça, c’est un meuble.',
    'Attache ta tuque!',
  ],
  // The megaphone.
  cop: [
    'Rangez-vous sur le côté!',
    'On vous voit, là!',
    'Immobilisez votre véhicule!',
    'Ça sert à rien de courir, on connaît la ville.',
    'Le p’tit char, là, tassez-vous!',
    'On a votre plaque, monsieur.',
  ],
  // ...and once in a while, somebody notices you driving like a human being.
  clean: [
    'Beau, propre.',
    'Ça, c’est un bon jeune.',
    'Y conduit bien, lui.',
    'Bonne journée là!',
    'Ton père serait fier.',
  ],
};

export const SPEAKER = {
  dive: 'Piéton', honk: 'Chauffeur', shove: 'Chauffeur', parked: 'Voisin',
  red: 'Chauffeur', rival: 'Chum', cop: 'Police', clean: 'Piéton',
  // The triggers that only exist once assets/text/heckles.json is loaded.
  sidewalk: 'Piéton', hitprop: 'Voisin', speeding: 'Chauffeur',
  reversing: 'Chauffeur', wrongway: 'Chauffeur', stuck: 'Passant',
  bigair: 'Témoin',
};

// ---------------------------------------------------------------- the corpus
//
// The pools above are the FALLBACK. The real corpus is assets/text/heckles.json
// — 300 lines, 25 for each of twelve triggers, each with its French original,
// an English gloss and a note explaining the joke where one does not survive
// translation. load() swaps it in; if the file is missing the game runs on the
// built-ins above and nobody notices.
//
// The JSON's twelve trigger names and this file's eight pool keys are not the
// same vocabulary, because the eight predate the file. This is the map, and the
// four with no JSON trigger keep their built-in pool:
export const TRIGGER_ALIAS = {
  dive: 'nearmiss', honk: 'honked', shove: 'hitcar', red: 'ranred', cop: 'cops',
  // parked (somebody's parked car), rival (a friend passing you in a race) and
  // clean (the compliment) have no counterpart in the file — they stay built-in.
  parked: null, rival: null, clean: null,
};
// Every trigger the file carries. The five above arrive through the alias; the
// other seven are fired directly by main.js, which owns the conditions.
export const JSON_TRIGGERS = [
  'nearmiss', 'honked', 'sidewalk', 'ranred', 'hitcar', 'hitprop',
  'speeding', 'reversing', 'wrongway', 'stuck', 'cops', 'bigair',
];

/** Every line in the pool, once. */
export function allLines() {
  const out = [];
  for (const k of Object.keys(HECKLES)) out.push(...HECKLES[k]);
  return out;
}

// ---------------------------------------------------------------- the gloss
//
// G is the translation key. This is NOT the old English UI — that toggle is
// gone on purpose and the menus stay in French. This is a gloss on the slang
// alone: what the man on the sidewalk actually said, plus, where the line only
// lands if you grew up here, the note that explains it.
//
//   GLOSS[line] = [english, note?]
//
// The English is written to be said out loud, not to be literal: « Va donc chez
// l'diable » is not "go to the devil's house". The note is only shown in the
// panel, because a bubble is two lines wide.
export const GLOSS = {
  // dive
  'Heille, le cave!': ['Hey, you moron!', '“Cave” is the everyday Québec insult — a sucker, a fool.'],
  'Tabarnak, r’garde où tu vas!': ['Christ, watch where you’re going!', '“Tabarnak” is the tabernacle off the altar. Québec swears with church furniture.'],
  'T’as-tu eu ton permis dans une boîte de Cracker Jack?': ['Did you get your licence out of a Cracker Jack box?', 'Cracker Jack came with a cheap plastic prize buried in the caramel corn.'],
  'Câlisse de malade!': ['You goddamn lunatic!', '“Câlisse” is the chalice; “malade” — sick — means dangerous here, not ill.'],
  'Mon doux que t’es dangereux!': ['Good grief, you are dangerous!', '“Mon doux” is short for « mon doux Seigneur »: the gasp of somebody who does not swear.'],
  'Va donc chier!': ['Go to hell!', 'Literally “go take a crap”. Not affectionate.'],
  'Es-tu soûl, toé?': ['Are you drunk or what?', '“Toé” is “toi”, tacked on the end for emphasis. Everybody does it.'],
  'C’est un trottoir, ça, pas une piste!': ['That’s a sidewalk, not a racetrack!'],
  'Y’a des enfants qui jouent icitte!': ['There are kids playing here!', '“Icitte” is “ici” — here — with the Québec ending on it.'],
  'Ralentis, coudonc!': ['Slow down, would you!', '“Coudonc” is « écoute donc », worn down to one word.'],
  'J’appelle la police, moé, là!': ['I am calling the cops, right now!'],
  'T’sais qu’y a des freins dans c’te char-là?': ['You do know that car has brakes?', '“Char” — chariot — is the Québec word for a car.'],
  'Mon Dieu Seigneur!': ['Good Lord above!'],
  'T’es-tu correct, toé?': ['You okay there?', 'The all-purpose Québec check-in. “Correct” means fine, working, good enough — a car, a plan or a person can be correct.'],
  'Va donc chez l’diable!': ['Oh, get lost!', 'Literally “go to the devil’s place”. Softer than it looks — this is the polite one.'],
  // honk
  'Envoye, avance!': ['Come on, move!'],
  'C’est vert, tabarnak!': ['It’s green, for Christ’s sake!'],
  'Chauffe, chauffe!': ['Drive, drive!', '“Chauffer” is to heat. In Québec it also means to drive — you heat the car.'],
  'Y’a du monde qui travaille demain!': ['Some of us work tomorrow!'],
  'Décide-toé!': ['Make up your mind!'],
  'Le clignotant, ça existe!': ['Turn signals exist, you know!'],
  'Coudonc, t’as-tu perdu ta rue?': ['Say, did you lose your street?', '“Coudonc” is “écoute donc” — hey, listen — worn down to one word.'],
  'Ça fait deux fois que j’te vois, toé.': ['That’s twice I’ve seen you now.'],
  'Ramasse ton bazou!': ['Get that heap out of here!', 'A “bazou” is a beater — a rusted-out car worth less than its plates.'],
  'Enweye donc, grand-maman!': ['Get going, grandma!', '“Enweye donc” is the shove you give somebody who is dawdling.'],
  // shove
  'HEILLE! Mon pare-choc!': ['HEY! My bumper!'],
  'T’as-tu vu ce que t’as fait, là?': ['Do you see what you just did?'],
  'On échange nos assurances, mon homme?': ['Shall we swap insurance, buddy?', '“Mon homme” is friendly in most mouths and a threat in this one.'],
  'C’est neuf, ça, ostie!': ['That is brand new, dammit!'],
  'Attends que mon père voie ça.': ['Wait until my father sees this.'],
  'Ça, c’est du 400 piasses.': ['That right there is four hundred bucks.', 'A “piasse” is a dollar — from the old Spanish piastre.'],
  'Franchement, là!': ['Honestly!'],
  'Ma mère m’avait dit de pas sortir aujourd’hui.': ['My mother told me not to go out today.'],
  // parked
  'MON CHAR!': ['MY CAR!', '“Char” is a chariot. Everybody in Québec drives a chariot.'],
  'C’EST MON CHAR, ÇA!': ['THAT IS MY CAR!'],
  'Heille! J’te connais, toé!': ['Hey! I know you!'],
  'J’ai ton numéro de plaque!': ['I have got your plate number!'],
  'Ça vient de sortir du garage, ostie!': ['That just came out of the shop!'],
  'MADAME! Y a un gars qui frappe les chars!': ['MA’AM! There’s a guy hitting the cars!'],
  // red
  'Heille, c’tait rouge!': ['Hey, that was red!'],
  'Rouge, ça veut dire ARRÊTE!': ['Red means STOP!', 'Québec stop signs say ARRÊT, not STOP — the only place in North America that bothers.'],
  'Y a-tu une urgence, coudonc?': ['Is there an emergency or something?'],
  'Tu vas tuer quelqu’un!': ['You are going to kill somebody!'],
  'Belle passe de feu rouge, champion.': ['Nice red-light run, champ.'],
  // rival
  'Bye bye!': ['Bye bye!', 'Said in English, dragged out over four syllables, entirely to annoy you.'],
  'Reste dans ton Ranger, mon homme': ['Stay in your Ranger, buddy'],
  'Salut là! On se voit à l’arrivée!': ['See ya! I’ll see you at the finish!'],
  'Y est-tu en marche arrière, lui?': ['Is that guy in reverse?'],
  'Tu veux-tu que je ralentisse?': ['Want me to slow down for you?'],
  'C’est pas un char, ça, c’est un meuble.': ['That’s not a car, that’s furniture.'],
  'Attache ta tuque!': ['Hang on tight!', 'Short for “attache ta tuque avec d’la broche” — wire your winter hat on, this is about to get rough.'],
  // cop
  'Rangez-vous sur le côté!': ['Pull over to the side!'],
  'On vous voit, là!': ['We can see you!'],
  'Immobilisez votre véhicule!': ['Stop your vehicle!'],
  'Ça sert à rien de courir, on connaît la ville.': ['No use running, we know this town.'],
  'Le p’tit char, là, tassez-vous!': ['The little car there — move over!', '“Tasse-toi” is the Québec get-out-of-the-way, heard on every rink in the province.'],
  'On a votre plaque, monsieur.': ['We have your plate, sir.'],
  // clean
  'Beau, propre.': ['Nice. Clean.', 'The whole compliment. Québec praise is short.'],
  'Ça, c’est un bon jeune.': ['Now that is a good kid.'],
  'Y conduit bien, lui.': ['That one drives well.'],
  'Bonne journée là!': ['Have a good day!'],
  'Ton père serait fier.': ['Your father would be proud.'],
};

// Lines loaded from assets/text/heckles.json land here too, so the gloss lookup
// is one table whatever the line came from.
const LOADED_GLOSS = new Map();

/** The English for a line, or '' when nobody wrote one. */
export function glossOf(line) {
  const g = GLOSS[line];
  if (g) return g[0];
  const l = LOADED_GLOSS.get(line);
  return l ? l.en || '' : '';
}
/** The note that explains the joke, or '' when the line does not need one. */
export function noteOf(line) {
  const g = GLOSS[line];
  if (g) return g[1] || '';
  const l = LOADED_GLOSS.get(line);
  return l ? l.note || '' : '';
}

/**
 * Turn the parsed contents of assets/text/heckles.json into { trigger: [fr] },
 * registering every gloss and note on the way. Anything malformed is skipped
 * rather than thrown: a bad corpus must not cost you the game.
 */
export function ingestHeckles(json) {
  const rows = json && Array.isArray(json.heckles) ? json.heckles : (Array.isArray(json) ? json : null);
  if (!rows) return null;
  const pools = {};
  for (const r of rows) {
    if (!r || typeof r.trigger !== 'string' || typeof r.fr !== 'string' || !r.fr) continue;
    (pools[r.trigger] = pools[r.trigger] || []).push(r.fr);
    LOADED_GLOSS.set(r.fr, { en: r.en || '', note: r.note || '' });
  }
  return Object.keys(pools).length ? pools : null;
}

// Where the G toggle is remembered. Its own key: the settings object in
// store.js has a closed list of keys and drops anything it does not know.
const GLOSS_KEY = 'aylmer.slang';

export class Heckle {
  constructor() {
    this.G = null;
    this.t = 0;             // seconds, fed by update(dt)
    this.lastAt = -1e9;     // when the last heckle went out
    this.said = new Map();  // line -> when it was last used
    this.count = 0;         // how many have actually been shown (tests read it)
    this.last = null;       // the last line shown
    this.cleanT = 0;        // seconds since the last heckle
    this.cleanMove = 0;     // ...of which this many were spent above 20 km/h
    this.root = undefined;  // #heckles, looked up lazily
    this.live = [];         // bubbles on screen
    this.pending = [];      // story lines waiting their turn, oldest first
    this.storyNow = null;   // the story line on screen: { who, text, group, until, entry }
    this.storyGapUntil = 0; // the breath after a story line
    // The slang gloss (G). `glossOn` is the latch, `held` is the key being held
    // down right now, and `history` is what the panel shows when nothing is on
    // screen any more — you always get to read the last thing that was yelled.
    this.glossOn = readGlossPref();
    this.held = false;
    this.history = [];      // newest first: { who, text, gloss, note }
    this.panel = undefined; // #slangpanel, built lazily
    // The written corpus, once load() has been round the network. Null means
    // "use the built-in pools", which is what every headless test sees.
    this.pools = null;
    // The scene hush: reason -> game time it lapses. `hushDropped` counts the
    // heckles and street lines it ate (the harness and the smoke read it).
    this.hushes = new Map();
    this.hushTests = new Map();   // reason -> { test, until }
    this.hushDropped = 0;
  }

  bind(G) { this.G = G; return this; }

  /**
   * Pull assets/text/heckles.json in. Safe to call once at boot and safe to
   * fail: a missing or broken file leaves the built-in pools in place and says
   * so on the console, once. Returns the trigger names it took.
   */
  async load(url = 'assets/text/heckles.json') {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      const pools = ingestHeckles(await res.json());
      if (!pools) return null;
      this.pools = pools;
      // Say out loud what did not line up rather than dropping it in silence.
      const unused = Object.keys(pools).filter((k) => !JSON_TRIGGERS.includes(k));
      if (unused.length) console.warn('heckles: triggers nobody fires —', unused.join(', '));
      const short = JSON_TRIGGERS.filter((k) => !pools[k]);
      if (short.length) console.warn('heckles: triggers with no lines —', short.join(', '));
      console.log(`heckles: ${Object.values(pools).reduce((n, p) => n + p.length, 0)} written lines,`
        + ` ${Object.keys(pools).length} triggers`);
      return Object.keys(pools);
    } catch (e) {
      return null;
    }
  }

  /** Which pool a trigger name actually draws from, written or built-in. */
  poolFor(key) {
    if (this.pools) {
      const mapped = Object.prototype.hasOwnProperty.call(TRIGGER_ALIAS, key) ? TRIGGER_ALIAS[key] : key;
      if (mapped && this.pools[mapped] && this.pools[mapped].length) return this.pools[mapped];
    }
    return HECKLES[key] || null;
  }

  // ---- the slang gloss ---------------------------------------------------

  /** Is the English showing right now — latched, or because G is held down? */
  get showGloss() { return this.glossOn || this.held; }

  /** The G latch. Persisted on its own key; returns the new state. */
  setGloss(on) {
    this.glossOn = !!on;
    writeGlossPref(this.glossOn);
    this._paintGloss();
    return this.glossOn;
  }
  toggleGloss() { return this.setGloss(!this.glossOn); }

  /** Hold-to-reveal. main.js calls this with the raw key state every frame. */
  hold(on) {
    const next = !!on;
    if (next === this.held) return this.held;
    this.held = next;
    this._paintGloss();
    return this.held;
  }

  /** The last `n` lines with their translations — what the panel draws. */
  recent(n = 3) { return this.history.slice(0, n); }

  /** Options -> Jeu -> « Les gens gueulent ». Default on. */
  get enabled() {
    const s = this.G && this.G.settings;
    return !s || s.heckles !== false;
  }

  // ---- the scene hush -----------------------------------------------------

  /**
   * A scripted scene has the floor for the next `secs` seconds of game time
   * (HUSH_TTL by default; scenes call this every tick they run). Raising it
   * takes any heckle or street bubble already on screen down; story lines
   * stay. Returns true.
   */
  hush(reason = 'scene', secs = HUSH_TTL) {
    const was = this.hushed;
    const until = this.t + (Number.isFinite(secs) ? Math.max(0, secs) : HUSH_TTL);
    const key = String(reason || 'scene');
    if (!(this.hushes.get(key) >= until)) this.hushes.set(key, until);
    if (!was && this.hushed) this._dropChatter();
    return true;
  }

  /**
   * Hold the street quiet while `test()` is true (a scene toast still queued
   * or showing), for at most `maxSecs` of game time. A test that throws or
   * returns false ends that reason. Returns true.
   */
  hushWhile(reason, test, maxSecs = HUSH_MAX) {
    if (typeof test !== 'function') return false;
    const was = this.hushed;
    const max = Number.isFinite(maxSecs) ? Math.max(0, maxSecs) : HUSH_MAX;
    this.hushTests.set(String(reason || 'scene'), { test, until: this.t + max });
    if (!was && this.hushed) this._dropChatter();
    return true;
  }

  /** The scene is over: lift one reason, or every reason with none given. */
  unhush(reason = null) {
    if (reason == null) { this.hushes.clear(); this.hushTests.clear(); return; }
    this.hushes.delete(String(reason));
    this.hushTests.delete(String(reason));
  }

  /** Is any scene holding the street quiet right now? */
  get hushed() {
    for (const [k, until] of this.hushes) {
      if (until > this.t) return true;
      this.hushes.delete(k);
    }
    for (const [k, h] of this.hushTests) {
      let on = false;
      if (h.until > this.t) { try { on = !!h.test(); } catch { on = false; } }
      if (on) return true;
      this.hushTests.delete(k);
    }
    return false;
  }

  /** The live reasons, for tests and the harness. */
  hushReasons() {
    const out = [];
    for (const [k, until] of this.hushes) if (until > this.t) out.push(k);
    for (const [k, h] of this.hushTests) {
      let on = false;
      if (h.until > this.t) { try { on = !!h.test(); } catch { on = false; } }
      if (on) out.push(k);
    }
    return out;
  }

  // Heckle and street bubbles off the screen; story bubbles stay.
  _dropChatter() {
    for (const b of this.live.slice()) if (!b.story) this._drop(b.el, b);
  }

  reset() {
    this.hushes.clear(); this.hushTests.clear(); this.hushDropped = 0;
    this.t = 0; this.lastAt = -1e9; this.said.clear();
    this.count = 0; this.last = null; this.cleanT = 0; this.cleanMove = 0;
    this._flushThen();
    this.pending.length = 0;
    this.storyNow = null; this.storyGapUntil = 0;
    this.history.length = 0;
    this.held = false;
    this._clearBubbles();
    this._paintGloss();
  }

  /**
   * Somebody yells at you. `who` is the label on the bubble, `key` picks the
   * pool. Returns the line that went out, or null when the limiter ate it.
   */
  say(who, key) {
    const pool = this.poolFor(key);
    if (!pool || !pool.length) return null;
    if (!this.enabled) return null;
    // A scripted scene has the floor: nobody on the street says anything.
    if (this.hushed) { this.hushDropped++; return null; }
    // The plot has the floor: no heckle while a friend is talking or waiting to.
    if (this.storyBusy()) return null;
    if (this.t - this.lastAt < this.gap()) return null;
    // Anything not said in the last COOLDOWN seconds is fair game; the oldest
    // wins the tie so the pool rotates instead of favouring index 0.
    let best = null, bestAt = Infinity;
    for (const line of pool) {
      const at = this.said.has(line) ? this.said.get(line) : -1e9;
      if (this.t - at < COOLDOWN) continue;
      if (at < bestAt) { bestAt = at; best = line; }
    }
    if (!best) return null;
    this.said.set(best, this.t);
    this.lastAt = this.t;
    this.count++;
    this.last = best;
    if (key !== 'clean') { this.cleanT = 0; this.cleanMove = 0; }
    this._remember(who || SPEAKER[key] || '', best);
    this._bubble(who || SPEAKER[key] || '', best);
    return best;
  }

  // The last six lines, newest first. Kept whether or not there is a document,
  // so the panel has something to show the moment G goes down.
  _remember(who, text) {
    this.history.unshift({ who, text, gloss: glossOf(text), note: noteOf(text) });
    if (this.history.length > 6) this.history.length = 6;
  }

  /** Seconds between heckles right now: longer while you are barely moving. */
  gap() {
    const v = this.G && this.G.veh;
    return v && Number.isFinite(v.speedKmh) && Math.abs(v.speedKmh) < SLOW_KMH ? SLOW_GAP : GAP;
  }

  /** Is a story line on screen, queued, or in the breath after one? */
  storyBusy() {
    return !!this.storyNow || this.pending.length > 0 || this.t < this.storyGapUntil;
  }

  /**
   * A line of story dialogue — a friend at the start or the end of a job. Not a
   * heckle: it ignores the limiter and the « les gens gueulent » switch, because
   * it is the plot.
   *
   * It is QUEUED, not shown: the queue is pumped by update(), which only runs
   * while the game does, so a line said under a full-screen card (the mission
   * card, the end card, pause) waits for the card to close instead of dying
   * underneath it (story audit, major #7). Lines play one at a time for
   * storySeconds(text). `ms` is accepted for old callers and ignored.
   * `opts.group` tags a line so it can be cut when the job moves on:
   * main.js says 'friend' for the start/end lines and cancels that group when
   * a stage completes or the job ends.
   *
   * A line with no speaker is street chatter (peds.js), not plot: it goes
   * through ambient() and its limiter.
   */
  line(who, text, ms = BUBBLE_MS, opts = {}) {
    if (!text) return null;
    if (!who) return this.ambient('', text, ms);
    if (this.pending.length >= STORY_QUEUE_MAX) this.pending.shift();
    // `opts.then`: called once when this line leaves the screen, whether it
    // played out or was cut (dadcall.js shows the money after his last line).
    const then = opts && typeof opts.then === 'function' ? opts.then : null;
    this.pending.push({ who, text, group: (opts && opts.group) || 'story', dur: storySeconds(text), then });
    return text;
  }

  /**
   * Background talk: the street, the next yard over. Never over a story line,
   * and it shares the heckles' limiter so the two together cannot pile up.
   * Returns the line, or null when it was dropped.
   */
  ambient(who, text, ms = BUBBLE_MS) {
    if (!text) return null;
    if (this.hushed) { this.hushDropped++; return null; }
    if (this.storyBusy()) return null;
    if (this.t - this.lastAt < this.gap()) return null;
    this.lastAt = this.t;
    this._bubble(who || '', text, ms, false);
    return text;
  }

  /**
   * Cut story lines: every one tagged `group`, or all of them with no group.
   * The one on screen goes too. Used when the mission state changes (a stage
   * done, a job failed or quit) so the friends do not keep talking about a job
   * that is over.
   */
  cancel(group = null) {
    const hit = (x) => !group || x.group === group;
    const cut = [];
    for (let i = this.pending.length - 1; i >= 0; i--) if (hit(this.pending[i])) cut.unshift(...this.pending.splice(i, 1));
    if (this.storyNow && hit(this.storyNow)) this._endStory();
    for (const p of cut) this._then(p);
  }

  /** Everything off the screen and out of the queue (the menu). */
  clear() {
    this.hushes.clear(); this.hushTests.clear();
    this._flushThen();
    this.pending.length = 0;
    this.storyNow = null;
    this.storyGapUntil = 0;
    this._clearBubbles();
  }

  /** One tick. Advances the clock and, eventually, hands out a compliment. */
  update(dt, G) {
    if (G) this.G = G;
    const d = Number.isFinite(dt) ? dt : 0;
    this.t += d;
    this.cleanT += d;
    const v = this.G && this.G.veh;
    if (v && v.speedKmh > 20) this.cleanMove += d;
    if (this.cleanT >= CLEAN_AFTER && this.cleanMove >= CLEAN_MOVING) {
      this.cleanT = 0; this.cleanMove = 0;
      this.say(SPEAKER.clean, 'clean');
    }
    this._expire();
  }

  // ---- the bubbles -------------------------------------------------------

  _mount() {
    if (this.root !== undefined) return this.root;
    this.root = (typeof document !== 'undefined' && document.getElementById)
      ? document.getElementById('heckles') : null;
    return this.root;
  }

  // One bubble on screen. A story line takes the screen from a heckle.
  _bubble(who, text, ms = BUBBLE_MS, story = false, group = null) {
    for (const b of this.live.slice()) this._drop(b.el, b);
    const entry = { el: null, until: this.t + ms / 1000, ms, story, group };
    this.live.push(entry);
    const root = this._mount();
    if (!root) return entry;
    const el = document.createElement('div');
    entry.el = el;
    el.className = 'bub' + (story ? ' story' : '');
    // A little tilt, so two in a row do not look like a list.
    el.style.setProperty('--tilt', ((this.count + this.live.length) % 2 ? 1.6 : -1.4) + 'deg');
    const b = document.createElement('b');
    b.textContent = who;
    const s = document.createElement('span');
    s.textContent = text;
    el.appendChild(b);
    el.appendChild(s);
    // The English, if there is any, hangs under the line and is hidden until G
    // says otherwise. Styled inline: style.css belongs to somebody else.
    const en = story ? '' : glossOf(text);
    if (en) {
      const i = document.createElement('i');
      i.className = 'gloss';
      i.textContent = en;
      i.style.cssText = 'display:none;font-style:normal;opacity:.72;font-size:.82em;' +
        'letter-spacing:.2px;border-top:1px solid rgba(255,255,255,.18);' +
        'margin-top:3px;padding-top:3px';
      el.appendChild(i);
      el._gloss = i;
    }
    root.appendChild(el);
    this._paintGloss();
    // No wall-clock backstop any more. It was there so a bubble raised in a
    // menu still went away, and it is what killed the friends' lines under the
    // mission card: 3.6 s of real time while the game clock stood still.
    // Bubbles are only raised from the game clock now, and main.js clears them
    // on the way to the menu.
    return entry;
  }

  /** Run a line's `then` once. A throw there never breaks the queue. */
  _then(p) {
    const f = p && p.then;
    if (!f) return;
    p.then = null;
    try { f(); } catch (e) { console.warn('heckle then', e); }
  }

  /** Everything queued or on screen is going away: run their `then`s first. */
  _flushThen() {
    const all = [this.storyNow, ...this.pending];
    for (const p of all) this._then(p);
  }

  _endStory() {
    const now = this.storyNow;
    this.storyNow = null;
    this._then(now);
    this.storyGapUntil = this.t + STORY_GAP;
    const e = now && this.live.find((b) => b === now.entry);
    if (e) this._drop(e.el, e);
  }

  _expire() {
    if (this.storyNow && this.storyNow.until <= this.t) this._endStory();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      if (!b.story && b.until <= this.t) this._drop(b.el, b);
    }
    if (!this.storyNow && this.pending.length && this.t >= this.storyGapUntil) {
      const p = this.pending.shift();
      const entry = this._bubble(p.who, p.text, p.dur * 1000, true, p.group);
      this.storyNow = { ...p, until: this.t + p.dur, entry };
    }
  }

  _drop(el, entry = null) {
    const i = entry ? this.live.indexOf(entry) : this.live.findIndex((b) => b.el === el);
    if (i >= 0) this.live.splice(i, 1);
    if (this.storyNow && this.storyNow.entry && (this.storyNow.entry === entry || (el && this.storyNow.entry.el === el))) {
      this._then(this.storyNow);
      this.storyNow = null;
      this.storyGapUntil = this.t + STORY_GAP;
    }
    if (!el || !el.parentNode) return;
    el.classList.add('out');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
  }

  _clearBubbles() {
    this._then(this.storyNow);
    for (const b of this.live.slice()) this._drop(b.el, b);
    this.live.length = 0;
    this.storyNow = null;
  }

  // ---- painting the gloss ------------------------------------------------

  // Every bubble on screen shows or hides its English, and the panel comes up
  // while G is held so you can still read a line that has already faded.
  _paintGloss() {
    const show = this.showGloss;
    for (const b of this.live) {
      if (b.el && b.el._gloss) b.el._gloss.style.display = show ? 'block' : 'none';
    }
    this._paintPanel();
  }

  _mountPanel() {
    if (this.panel !== undefined) return this.panel;
    this.panel = null;
    if (typeof document === 'undefined' || !document.createElement || !document.body) return null;
    const el = document.createElement('div');
    el.id = 'slangpanel';
    el.style.cssText = 'position:fixed;left:50%;bottom:14%;transform:translateX(-50%);' +
      'z-index:9;max-width:min(620px,88vw);padding:12px 16px;border-radius:12px;' +
      'background:rgba(10,15,18,.86);border:1px solid rgba(255,201,77,.35);' +
      'color:#f3f5f6;font:13px/1.45 Helvetica,Arial,sans-serif;display:none;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.5);pointer-events:none';
    document.body.appendChild(el);
    this.panel = el;
    return el;
  }

  // Only while G is held. The latch alone puts the English in the bubbles,
  // which is enough; the panel is for "what did he just say?" after the fact.
  _paintPanel() {
    const el = this._mountPanel();
    if (!el) return;
    const rows = this.held ? this.recent(3) : [];
    if (!rows.length) { el.style.display = 'none'; return; }
    el.innerHTML = '';
    const head = document.createElement('div');
    head.textContent = 'CE QU’Y ONT DIT  ·  G';
    head.style.cssText = 'font-size:10px;letter-spacing:2px;opacity:.55;margin-bottom:6px';
    el.appendChild(head);
    for (const r of rows) {
      const row = document.createElement('div');
      row.style.cssText = 'margin:5px 0';
      const fr = document.createElement('div');
      fr.textContent = (r.who ? r.who + ' — ' : '') + r.text;
      fr.style.cssText = 'color:#ffc94d';
      const en = document.createElement('div');
      en.textContent = r.gloss || '(pas de traduction)';
      row.appendChild(fr);
      row.appendChild(en);
      if (r.note) {
        const note = document.createElement('div');
        note.textContent = r.note;
        note.style.cssText = 'opacity:.6;font-size:11.5px;margin-top:1px';
        row.appendChild(note);
      }
      el.appendChild(row);
    }
    el.style.display = 'block';
  }
}

// The G latch, on its own localStorage key with the same never-throw contract
// the rest of the game's storage has.
// The `window` guard is not decoration: this module is imported by traffic.js,
// so it loads inside every headless suite, and merely NAMING globalThis
// .localStorage under node prints an experimental warning across everybody's
// test output. The suites stub `document`, none of them stubs `window`, and a
// page always has both — so `window` is the honest "is this a browser" test.
function readGlossPref() {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage?.getItem(GLOSS_KEY) === '1'; } catch { return false; }
}
function writeGlossPref(on) {
  if (typeof window === 'undefined') return;
  try { window.localStorage?.setItem(GLOSS_KEY, on ? '1' : '0'); } catch { /* private mode */ }
}

/**
 * Is `text` still in a HUD's toast queue or on screen? Reads hud.toastLive()
 * when the HUD has one, else its ToastQueue (src/game/hud.js) directly. A
 * scene passes this to hushWhile() so the street waits for its toasts.
 */
export function toastLive(hud, text) {
  if (!hud) return false;
  if (typeof hud.toastLive === 'function') return !!hud.toastLive(text);
  const q = hud.toasts;
  if (!q) return false;
  const t = String(text ?? '');
  return (Array.isArray(q.active) && q.active.some((a) => a && a.text === t))
    || (Array.isArray(q.pending) && q.pending.some((p) => p && p.text === t));
}

// One per page. main.js binds it to G; peds/traffic/cops/race just talk to it.
export const heckle = new Heckle();
export default heckle;
