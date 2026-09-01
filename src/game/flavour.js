// The written flavour: assets/text/ui.json.
//
// Three things, none of which the game needs to run:
//
//   * `loading` — sixty lines for the loading screen. Real driving advice about
//     THIS map (lift off before the Pink Road gravel, a soft front tyre pulls
//     you toward the ditch, the police change shift at four), 2004 period
//     detail, and jokes. Every one has an English gloss, so the G key that
//     translates the slang translates these too.
//   * `pause` — twenty quiet lines for the pause screen. « Le soleil tape fort
//     su' le capot en métal ». They are atmosphere, not information.
//   * `achievements` — fifteen, with a French name and an English description of
//     how you earn it. Most of them belong to systems other agents are still
//     building, so they are DEFINED but DORMANT: `RULES` below is the short list
//     of the ones this build can honestly award, and anything not in it simply
//     never fires. That is deliberate — an achievement that cannot be earned is
//     better than one that fires on a condition nobody implemented.
//
// Everything loads at runtime with a fallback and fails quietly: no ui.json, no
// tips, no achievements, and the game is otherwise identical.

// Enough to look deliberate on a checkout with no assets/text/.
export const FALLBACK_TIPS = [
  { kind: 'tip', line: 'Lève le pied AVANT la courbe, pas dedans.', en: 'Lift off before the corner, not in it.' },
  { kind: 'tip', line: 'Le frein à main, c’est pour sortir le cul, pas pour arrêter.', en: 'The handbrake is for getting the back end out, not for stopping.' },
  { kind: 'trivia', line: 'Été 2004. L’essence est à 84,9 le litre.', en: 'Summer 2004. Gas is 84.9 a litre.' },
];
export const FALLBACK_PAUSE = [
  'Moteur au ralenti. Ça sent la peinture chaude.',
  'Respire par le nez: l’été 2004 durera pas éternellement.',
];

// The achievements this build can actually award, and what it takes. Everything
// else in ui.json stays defined and dormant until the system it depends on
// exists. `test(G, ev)` runs about once a second; `ev` carries the one-shot
// events main.js hands over (a landing, mostly).
export const RULES = {
  // Three seconds of continuous air. ui.json says "on the Galeries loading dock
  // jump", which is where you will get it — terrain.js builds that ramp — but
  // the rule does not care which ramp you used.
  "L'Envolée d'Aylmer": (G) => (G.stats && G.stats.bigAir) >= 3,
  // Off the marina boat ramp and into the river past the docks. The landing
  // event carries where you came down and whether it was wet.
  "Bain de Minuit": (G, ev) => !!(ev && ev.landedInWater && ev.air > 0.6),
};

const OWN_KEY = 'aylmer.achievements';

export class Flavour {
  constructor() {
    this.tips = FALLBACK_TIPS;
    this.pause = FALLBACK_PAUSE;
    this.achievements = [];
    this.loaded = false;
    this.unlocked = new Set(readUnlocked());
    this.i = 0;                 // which tip is showing
    this.t = 0;
    this.tipEl = undefined;     // built lazily inside the loading box
    this.pauseEl = undefined;
    this.checkT = 0;
    this.onUnlock = null;       // main.js toasts it
  }

  /** Pull assets/text/ui.json in. Safe to call once at boot; never throws. */
  async load(url = 'assets/text/ui.json') {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      const j = await res.json();
      if (Array.isArray(j.loading) && j.loading.length) {
        this.tips = j.loading.filter((r) => r && typeof r.line === 'string');
      }
      if (Array.isArray(j.pause) && j.pause.length) {
        this.pause = j.pause.filter((s) => typeof s === 'string' && s);
      }
      if (Array.isArray(j.achievements)) {
        this.achievements = j.achievements
          .filter((a) => a && a.name)
          .map((a) => ({ name: a.name, how: a.howEarned || '', live: !!RULES[a.name] }));
      }
      this.loaded = true;
      const live = this.achievements.filter((a) => a.live).length;
      console.log(`ui text: ${this.tips.length} loading lines, ${this.pause.length} pause lines,`
        + ` ${this.achievements.length} achievements (${live} live, ${this.achievements.length - live} dormant)`);
      return true;
    } catch (e) {
      return null;
    }
  }

  // ---- the loading screen ------------------------------------------------

  // A tip under the progress bar, rotating while the world bakes. The Loading
  // class and index.html belong to somebody else, so the element is built here
  // and styled inline.
  _mountTip() {
    if (this.tipEl !== undefined) return this.tipEl;
    this.tipEl = null;
    if (typeof document === 'undefined') return null;
    const box = document.querySelector('#loading .lbox');
    if (!box) return null;
    const el = document.createElement('div');
    el.className = 'ltip';
    el.style.cssText = 'margin-top:18px;max-width:min(620px,80vw);font-size:13px;line-height:1.5;'
      + 'opacity:.72;text-align:center;min-height:3.2em';
    box.appendChild(el);
    this.tipEl = el;
    return el;
  }

  /** A fresh tip on the loading screen. `gloss` adds the English under it. */
  showTip(gloss = false) {
    const el = this._mountTip();
    if (!el || !this.tips.length) return null;
    const tip = this.tips[this.i % this.tips.length];
    this.i++;
    el.textContent = '';
    const fr = document.createElement('div');
    fr.textContent = tip.line;
    el.appendChild(fr);
    if (gloss && tip.en) {
      const en = document.createElement('div');
      en.textContent = tip.en;
      en.style.cssText = 'opacity:.62;margin-top:4px;font-size:12px';
      el.appendChild(en);
    }
    return tip;
  }

  /** Rotate the tip every few seconds while the loading screen is up. */
  tickLoading(dt, gloss = false) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 5.5;
    this.showTip(gloss);
  }

  /**
   * More trivia from somewhere else — Le Droit's summer 2004 headlines, which
   * radio_extra.json carries and the radio loads. They read as loading-screen
   * trivia as well as they read as news, so they do both.
   */
  addTrivia(lines) {
    if (!Array.isArray(lines) || !lines.length) return 0;
    const add = lines
      .filter((l) => typeof l === 'string' && l)
      .map((l) => ({ kind: 'trivia', line: l, en: '' }))
      .filter((r) => !this.tips.some((t) => t.line === r.line));
    this.tips = this.tips.concat(add);
    return add.length;
  }

  // ---- the pause screen --------------------------------------------------

  _mountPause() {
    if (this.pauseEl !== undefined) return this.pauseEl;
    this.pauseEl = null;
    if (typeof document === 'undefined') return null;
    const title = document.getElementById('pausetitle');
    if (!title || !title.parentNode) return null;
    const el = document.createElement('div');
    el.id = 'pauseflavour';
    el.style.cssText = 'margin:-4px 0 12px;font-size:13px;opacity:.6;font-style:italic;line-height:1.45';
    title.parentNode.insertBefore(el, title.nextSibling);
    this.pauseEl = el;
    return el;
  }

  /** One quiet line on the pause screen. A different one each time you pause. */
  showPause() {
    const el = this._mountPause();
    if (!el || !this.pause.length) return null;
    const line = this.pause[Math.floor(Math.random() * this.pause.length)];
    el.textContent = line;
    return line;
  }

  // ---- achievements ------------------------------------------------------

  /** Has it been earned in this browser? */
  has(name) { return this.unlocked.has(name); }
  /** The whole list, with whether each one is live in this build. */
  list() { return this.achievements.map((a) => ({ ...a, done: this.unlocked.has(a.name) })); }

  /**
   * One tick. `ev` is the one-shot event bag main.js fills in (a landing, a
   * finished job); everything else is read off G. Checked about once a second,
   * because none of these can be missed in a single frame.
   */
  update(dt, G, ev = null) {
    this.checkT -= dt;
    if (this.checkT > 0 && !ev) return null;
    this.checkT = 1;
    for (const a of this.achievements) {
      if (!a.live || this.unlocked.has(a.name)) continue;
      let hit = false;
      try { hit = !!RULES[a.name](G, ev); } catch (e) { hit = false; }
      if (!hit) continue;
      this.unlocked.add(a.name);
      writeUnlocked([...this.unlocked]);
      if (this.onUnlock) this.onUnlock(a);
      return a;
    }
    return null;
  }

  /** Wipe them — the options screen's "delete every save" reaches this. */
  reset() { this.unlocked.clear(); writeUnlocked([]); }
}

// Its own localStorage key: store.js keeps a closed set and this is not a
// setting. Guarded on `window` for the same reason heckle.js is — the headless
// suites stub `document` but not `window`, and naming globalThis.localStorage
// under node prints a warning across everybody's test output.
function readUnlocked() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage?.getItem(OWN_KEY);
    const j = raw ? JSON.parse(raw) : [];
    return Array.isArray(j) ? j.filter((s) => typeof s === 'string') : [];
  } catch { return []; }
}
function writeUnlocked(list) {
  if (typeof window === 'undefined') return;
  try { window.localStorage?.setItem(OWN_KEY, JSON.stringify(list.slice(0, 64))); } catch { /* private mode */ }
}

export const flavour = new Flavour();
export default flavour;
