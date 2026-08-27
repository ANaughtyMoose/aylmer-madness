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
};

/** Every line in the pool, once. */
export function allLines() {
  const out = [];
  for (const k of Object.keys(HECKLES)) out.push(...HECKLES[k]);
  return out;
}

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
  }

  bind(G) { this.G = G; return this; }

  /** Options -> Jeu -> « Les gens gueulent ». Default on. */
  get enabled() {
    const s = this.G && this.G.settings;
    return !s || s.heckles !== false;
  }

  reset() {
    this.t = 0; this.lastAt = -1e9; this.said.clear();
    this.count = 0; this.last = null; this.cleanT = 0; this.cleanMove = 0;
    this.pending.length = 0;
    this._clearBubbles();
  }

  /**
   * Somebody yells at you. `who` is the label on the bubble, `key` picks the
   * pool. Returns the line that went out, or null when the limiter ate it.
   */
  say(who, key) {
    const pool = HECKLES[key];
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
    this._bubble(who || SPEAKER[key] || '', best);
    return best;
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
    root.appendChild(el);
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
}

// One per page. main.js binds it to G; peds/traffic/cops/race just talk to it.
export const heckle = new Heckle();
export default heckle;
