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
export const MAX_BUBBLES = 2;
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
    'Ostie que t’es dangereux!',
    'Va donc chier!',
    'Es-tu soûl, toé?',
    'C’est un trottoir, ça, pas une piste!',
    'Y’a des enfants qui jouent icitte!',
    'Ralentis, mon tabarnak!',
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
  'Ostie que t’es dangereux!': ['God, you are dangerous!', '“Ostie” is the communion host. Another altar word doing duty as a swear.'],
  'Va donc chier!': ['Go to hell!', 'Literally “go take a crap”. Not affectionate.'],
  'Es-tu soûl, toé?': ['Are you drunk or what?', '“Toé” is “toi”, tacked on the end for emphasis. Everybody does it.'],
  'C’est un trottoir, ça, pas une piste!': ['That’s a sidewalk, not a racetrack!'],
  'Y’a des enfants qui jouent icitte!': ['There are kids playing here!', '“Icitte” is “ici” — here — with the Québec ending on it.'],
  'Ralentis, mon tabarnak!': ['Slow down, you son of a—!'],
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
    this.pending = [];      // bubbles waiting for a slot
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

  reset() {
    this.t = 0; this.lastAt = -1e9; this.said.clear();
    this.count = 0; this.last = null; this.cleanT = 0; this.cleanMove = 0;
    this.pending.length = 0;
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
    if (this.t - this.lastAt < GAP) return null;
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

  /**
   * A line of story dialogue — a friend at the start or the end of a job. Not a
   * heckle: it ignores the limiter and the « les gens gueulent » switch, because
   * it is the plot.
   */
  line(who, text, ms = BUBBLE_MS) {
    if (!text) return null;
    this._bubble(who || '', text, ms, true);
    return text;
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

  _bubble(who, text, ms = BUBBLE_MS, story = false) {
    const root = this._mount();
    if (!root) return;
    if (this.live.length >= MAX_BUBBLES) {
      if (this.pending.length > 3) this.pending.shift();
      this.pending.push({ who, text, ms, story });
      return;
    }
    const el = document.createElement('div');
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
    this.live.push({ el, until: this.t + ms / 1000, ms });
    // The clock only runs while the game does, so hold a wall-clock backstop:
    // a bubble raised in a menu still goes away.
    if (typeof setTimeout === 'function') {
      setTimeout(() => this._drop(el), ms + 600);
    }
  }

  _expire() {
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (this.live[i].until <= this.t) this._drop(this.live[i].el);
    }
    while (this.live.length < MAX_BUBBLES && this.pending.length) {
      const p = this.pending.shift();
      this._bubble(p.who, p.text, p.ms, p.story);
    }
  }

  _drop(el) {
    const i = this.live.findIndex((b) => b.el === el);
    if (i >= 0) this.live.splice(i, 1);
    if (!el || !el.parentNode) return;
    el.classList.add('out');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
  }

  _clearBubbles() {
    for (const b of this.live.slice()) this._drop(b.el);
    this.live.length = 0;
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

// One per page. main.js binds it to G; peds/traffic/cops/race just talk to it.
export const heckle = new Heckle();
export default heckle;
