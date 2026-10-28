// HUD + minimap. The map data never changes, so the whole town is rasterised
// once into an offscreen canvas and every frame is just one transformed
// drawImage plus a handful of dots.

import { MAP } from './mapdata.js';
import { MAP_SIZES, MAP_RANGE } from './store.js';
// B-06: the new slots read the merged B1 modules directly (plan v2, B-06).
import { ownVehicleStatus } from './tow.js';
import { failToast } from './retry.js';
import { jobKind } from './jobready.js';
import { nearestJob } from './story.js';

const TAU = Math.PI * 2;
const SEARCH_DASH = [6, 4];   // [w6-escape] the search circle dash, reused
const DEFAULT_SIZE = MAP_SIZES[0];   // #minimap starts at 200x200 CSS px
const STATIC_PX = 1400;              // target width of the pre-rendered layer
// ~0.275 px/m over the ~5.1 km wide clip rectangle.
const STATIC_SCALE = STATIC_PX / (MAP.bounds.maxX - MAP.bounds.minX);
const DEFAULT_RANGE = MAP_RANGE.dflt;  // world radius shown on the live minimap
const LARGE_MIN_PX = 260;            // at or above this the minimap redraws at 30 Hz
const GAUGE_PX = 132;                // speedo gauge, CSS px
const GAUGE_MAX = 180;               // km/h at the end of the sweep, until a car says otherwise
// S3-RANGER (feel.md 1): the sweep fits the car you are in. One step of 20 short
// of its terminal speed, so flat out pins the needle in the red, and the red
// starts 30 km/h before the end. The Ranger (150 km/h) gets 140 with red from
// 110: 90 km/h is two thirds of the dial, not half, and the speedRun beat's
// 116 is in the red. Never under 60.
export function gaugeScale(topKmh) {
  const max = Math.max(60, Math.ceil(topKmh / 20) * 20 - 20);
  return { max, red: max - 30 };
}

// Minimap palette. Named for what they are on the map, not for whatever
// places.js used to call them.
const C = {
  land: '#22301f',
  water: '#23485c',
  sand: '#8a7d5c',
  building: '#5e5950',
  traffic: '#d9d9d9',
  job: '#ffffff',        // job start you have not taken (white ring)
  objective: '#ffc94d',  // the thing you are driving to right now
  waypoint: '#4fd3ff',
  car: '#8fe38f',        // a friend's parked car
  route: '#4fd3ff',
  player: '#ffc94d',
  own: '#ffe08a',        // B-06: your own truck, parked somewhere else
  rival: '#ff8a3d',      // a friend you are racing
  cop: '#6fb2ff',        // an auto-patrouille
  repair: '#9ee6a1',     // where you get the dents taken out
  business: '#d8c4a1',   // fictional shops anchored to real OSM POIs
  landmark: '#8fd6a3',   // parks, arenas, schools and other civic landmarks
};

// Ground cover fills, by MAP.areas kind.
const AREA_FILL = {
  park: '#2f4a2a',
  school: '#2f4a2a',
  cemetery: '#2f4a2a',
  wood: '#253d22',
  sand: '#8a7d5c',
  parking: '#33333a',
  pitch: '#35552d',
  pool: '#3d6f85',
  water: '#23485c',
};

// Road stroke colours, drawn in this order so majors win at intersections.
const ROAD_ORDER = [
  ['service', '#3c3c44'],
  ['residential', '#55555e'],
  ['tertiary', '#63636c'],
  ['secondary', '#7a7a86'],
  ['primary', '#7a7a86'],
  ['trunk', '#7a7a86'],
];

// ---------------------------------------------------------------- A-04 rules

// Every toast stays up at least this long, and only one is up at a time.
export const TOAST_MIN_MS = 2500;

/**
 * The deadline a job has coming, when the stage on screen has none: the
 * budget of the next timed stage, scaled the way main.js applyStage scales it.
 * `peek` is { mission, scale } or null. Returns seconds, or null.
 */
export function upcomingDeadline(peek) {
  const m = peek && peek.mission;
  if (!m || m.failed || !Array.isArray(m.stages)) return null;
  for (let i = (m.idx | 0) + 1; i < m.stages.length; i++) {
    const t = m.stages[i] && m.stages[i].time;
    if (t != null && Number.isFinite(+t)) return Math.max(1, Math.round(+t * (peek.scale || 1)));
  }
  return null;
}

// The middle of the screen, most important first. At most CENTRE_MAX of them
// are visible at once (Lex, shot 083: objective, bubble, toast, prompt and the
// tutorial chip, five layers of text over the road). The prompt is what to do
// now, the toast is what just happened, the bubble is someone talking, the
// tutorial chip is a tip that can wait. A story bubble (the main cast in the
// middle of a job) outranks a toast; street chatter does not. A yielded
// element is only hidden; its owner keeps its own state and it comes back
// when there is room. A yielded toast is also frozen, so it plays out in full
// once it is back instead of expiring unread.
export const CENTRE_MAX = 2;
export const CENTRE_ORDER = ['prompt', 'story', 'toast', 'heckles', 'tuto', 'prompt2'];
const CENTRE_EL = { prompt: 'prompt', story: 'heckles', toast: 'toast', heckles: 'heckles', tuto: 'tuto', prompt2: 'prompt2' };

/** Pure: which of the visible centre layers keep the screen. */
export function centreKeep(visible, max = CENTRE_MAX) {
  const keep = new Set();
  for (const id of CENTRE_ORDER) {
    if (keep.size >= max) break;
    if (visible.includes(id)) keep.add(id);
  }
  return keep;
}

// ---------------------------------------------------------------- B-06 rules

// The top-left sub line is the stage's how-to. It is read once, so it fades
// 5 s after it changes, or as soon as the tutorial ticks a chip after it went
// up (Lex, shot 030: objective, two lines of sub and a tip at once). The
// objective line stays; a stuck nudge (pulseObjective) brings the sub back.
export const SUB_FADE_MS = 5000;
// The « Tab pour la carte » chip shows in the first two minutes at the wheel
// only (Gemini: in every gameplay shot, because nobody in the pack opens the
// map). After that the pause screen's keyboard still lists Tab.
export const TAB_CHIP_S = 120;
// How often the slots read the game state (style chain, own vehicle, fail
// card). The readout must be up within 200 ms of a style event.
export const SLOT_MS = 100;
// A pillar this close is the one you are standing at.
export const PILLAR_NEAR = 40;

/** Pure: should the sub line be faded? `age` ms since it changed. */
export function subFaded({ age = 0, ticked = false } = {}) {
  return age >= SUB_FADE_MS || !!ticked;
}

/** Pure: is the tutorial chip the map tip, past its two minutes? */
export function tabChipGone({ cap = '', playtime = 0 } = {}) {
  return String(cap).trim() === 'Tab' && playtime >= TAB_CHIP_S;
}

const OWN_NAME = { ranger: 'ton Ranger', civic: 'ta Civic', dbike: 'ton vélo', forester: 'ton Forester', sienna: 'ta Sienna' };
const ROLE_IN = { cart: 'en cart', bike: 'en vélo', loaner: 'avec un char prêté' };
const KIND_WORD = { timed: 'chronométrée', race: 'de course', cargo: 'de livraison' };
const fmtM = (d) => (d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1).replace('.', ',') + ' km');

/** 'cart' | 'bike' | 'loaner' for a vehicle spec you do not own. */
export function borrowedRole(spec) {
  if (!spec) return 'loaner';
  if (spec.style === 'cart' || spec.id === 'cart') return 'cart';
  if (spec.twoWheel || spec.style === 'bike') return 'bike';
  return 'loaner';
}

/**
 * Pure: the wrong-vehicle chip. `st` is tow.js ownVehicleStatus(G); `role`
 * from borrowedRole(); `pillarKind` is jobready.js jobKind() of the job whose
 * pillar you are at ('timed' | 'race' | 'cargo' | null). The cart and a bike
 * always get the chip (they are what strands you); a friend's car only at a
 * pillar that will not take it. Narrator French. Returns { text, warn } or null.
 */
export function vehicleChip(st, role = 'loaner', pillarKind = null) {
  if (!st || st.inOwn || !st.borrowed || st.jobVehicle) return null;
  const own = OWN_NAME[st.id] || 'ton char';
  if (pillarKind) {
    return { text: `Pas ${ROLE_IN[role] || 'avec ça'} pour une job ${KIND_WORD[pillarKind] || 'comme ça'}. Y ramène ${own}.`, warn: true };
  }
  if (role === 'loaner') return null;
  const where = st.at && st.dist > 0 ? ` (${fmtM(st.dist)})` : '';
  const what = ROLE_IN[role];
  return { text: `${what.charAt(0).toUpperCase() + what.slice(1)}. Y ramène ${own}${where}.`, warn: false };
}

/**
 * Pure: the style readout from style.js hudState() (B-03:
 * { on, mult, events, fade, total, text, ... }). Returns
 * { text, mult, fade } or null when there is no chain.
 */
export function chainView(hs) {
  if (!hs || !hs.on || !(hs.events > 0)) return null;
  const mult = Math.max(1, Math.round(hs.mult || 1));
  return { text: hs.text || `STYLE x${mult}`, mult, fade: Math.max(0, Math.min(1, +hs.fade || 0)) };
}

// ---------------------------------------------------------------- toasts

// FIFO with at most `max` on screen at once. Time is passed in rather than
// read, so the ordering and the durations are testable without a clock.
export class ToastQueue {
  // A-04: `minMs` is the floor every toast gets on screen. The Hud runs one
  // slot at 2.5 s (Sean, shot 277: two toasts stacked read as one mess); the
  // class default stays two slots and no floor so the old tests keep their
  // meaning.
  constructor(max = 2, { minMs = 0 } = {}) {
    this.max = max;
    this.minMs = Math.max(0, minMs | 0);
    this.active = [];     // [{ text, ms, until }] oldest first; until null = not started
    this.pending = [];    // [{ text, ms }] FIFO
    this.dirty = false;
    this.held = false;    // a modal is up: freeze, do not play out behind it
  }

  push(text, ms = 2200, urgent = false) {
    const item = { text: String(text ?? ''), ms: Math.max(1, this.minMs, ms | 0) };
    // The same line twice in a row is one line: a held E that refuses every
    // frame, or a hint that fires on enter and on stuck, must not queue up.
    if (!urgent && (this.active.some((a) => a.text === item.text)
      || this.pending.some((p) => p.text === item.text))) return this;
    if (urgent) {
      // A button press needs an answer now, in the line the eye actually lands
      // on. `active[0]` is the big one; slot two is small and dim, and a
      // refusal that lands there reads as the button having done nothing —
      // which is exactly what « il te manque 300 $ » did at the used lot
      // (PLAYTEST #18). So an urgent toast goes straight to the front slot and
      // whatever was in it steps back into the queue and comes round again.
      // `until: null` means "start its clock the next time step() runs", so
      // push() still needs no clock of its own.
      const front = this.active.shift();
      if (front) this.pending.unshift({ text: front.text, ms: front.ms });
      this.active.unshift({ text: item.text, ms: item.ms, until: null });
      while (this.active.length > this.max) {
        const spill = this.active.pop();
        this.pending.unshift({ text: spill.text, ms: spill.ms });
      }
    } else {
      this.pending.push(item);
    }
    this.dirty = true;
    return this;
  }

  /**
   * Hold the queue while a modal owns the screen (U7). Nothing expires and
   * nothing is promoted: a toast that plays out behind a story card is a toast
   * nobody read. What is already on screen restarts its clock when the modal
   * closes.
   */
  hold(on, why = 'modal') {
    if (!this._holds) this._holds = new Set();
    if (on) this._holds.add(why); else this._holds.delete(why);
    const v = this._holds.size > 0;
    if (v === this.held) return this;
    this.held = v;
    if (v) for (const a of this.active) a.until = null;
    return this;
  }

  // Expire what is done, promote what fits. Returns true if the screen changed.
  step(now) {
    if (this.held) return false;
    let changed = false;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      if (a.until == null) { a.until = now + a.ms; changed = true; }
      else if (a.until <= now) { this.active.splice(i, 1); changed = true; }
    }
    while (this.active.length < this.max && this.pending.length) {
      const it = this.pending.shift();
      this.active.push({ text: it.text, ms: it.ms, until: now + it.ms });
      changed = true;
    }
    if (changed) this.dirty = false;
    return changed;
  }

  // ms until the next expiry, or Infinity when nothing is showing.
  nextDeadline(now) {
    if (this.held) return Infinity;
    let best = Infinity;
    for (const a of this.active) best = Math.min(best, (a.until == null ? now + a.ms : a.until) - now);
    return best;
  }

  texts() { return this.active.map((a) => a.text); }

  clear() { this.active.length = 0; this.pending.length = 0; }

  // B-12a: take one line off the screen and out of the queue (the fail card
  // retry.js has dropped). Returns true when something went.
  drop(text) {
    const t = String(text ?? '');
    const n = this.active.length + this.pending.length;
    this.active = this.active.filter((a) => a.text !== t);
    this.pending = this.pending.filter((p) => p.text !== t);
    return this.active.length + this.pending.length !== n;
  }
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Is a centre layer showing something, ignoring a yield we put on it ourselves?
function centreShows(el) {
  if (el.classList.contains('hidden') || el.classList.contains('hud-gone')) return false;
  if (el.style && el.style.display === 'none') return false;
  if (el.id === 'toast') return el.classList.contains('show');
  if (el.id === 'heckles') return !!el.querySelector('.bub');
  return (el.textContent || '').trim().length > 0;
}

// ---------------------------------------------------------------- HUD

export class Hud {
  constructor() {
    const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
    this.root = $('hud');
    this.elObjective = $('objective');
    this.elSub = $('sub');
    this.elTimer = $('timer');
    this.elKmh = $('kmh');
    this.elCar = $('carname');
    this.elToast = $('toast');
    this.elPrompt = $('prompt');
    this.el = { street: $('street') };
    this.canvas = $('minimap');
    this.gauge = $('gauge');

    this.ctx = this.canvas && this.canvas.getContext ? this.canvas.getContext('2d') : null;
    this.dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2) || 1;
    this.size = DEFAULT_SIZE;
    this.setSize(DEFAULT_SIZE);

    // One toast slot, built here so index.html stays a single <div id="toast">.
    // A-04: one at a time, 2.5 s at least each. Two slots meant two lines of
    // big white text in the middle of the road on top of a bubble and a prompt.
    this.toasts = new ToastQueue(1, { minMs: TOAST_MIN_MS });
    this._watchCentre($);
    this.slots = [];
    if (this.elToast && typeof document !== 'undefined' && document.createElement) {
      for (let i = 0; i < 1; i++) {
        const d = document.createElement('div');
        d.className = 'toastline';
        this.elToast.appendChild(d);
        this.slots.push(d);
      }
    }
    this._toastTimer = 0;
    this._buildSlots();

    this._lastKmh = -1;
    this._lastTimer = '';
    this._gear = 1;
    this._reverse = false;
    this._gaugeKmh = -1;
    this._gMax = GAUGE_MAX; this._gRed = 140; this._gTop = 0;
    this._lastMapDraw = 0;
    this.mapStats = { search: 0 };   // [w6-escape] minimap draws of the search circle
    this.range = DEFAULT_RANGE;
    this.staticMap = this._buildStatic();
    this._gaugeFace = null;
    this.gctx = this.gauge && this.gauge.getContext ? this.gauge.getContext('2d') : null;
    if (this.gauge && this.gctx) {
      this.gauge.width = Math.round(GAUGE_PX * this.dpr);
      this.gauge.height = Math.round(GAUGE_PX * this.dpr);
      this._gaugeFace = this._buildGaugeFace();
    }
  }

  // ---- text HUD ----------------------------------------------------------

  setVisible(on) {
    this.root?.classList.toggle('hidden', !on);
  }

  setObjective(text, sub = '') {
    if (this.elObjective) this.elObjective.textContent = text ?? '';
    if (this.elSub) {
      const s = sub ?? '';
      // B-06: a new sub line is shown, then fades (slots tick); the same line
      // set again (free roam refreshes it every 0.3 s) keeps its clock.
      if (s !== this._subText) { this._subText = s; this._subFresh(); }
      this.elSub.textContent = s;
    }
    // A-04: paint the stage clock now, not on the first mission tick. main.js
    // applyStage sets timeLeft on the line after this call, so wait for the
    // current task to finish. Without this the clock only appeared once the
    // card had closed and a frame had run, and a slow first frame (or a
    // screenshot taken on it) showed a timed job with no clock.
    if (!this._clockSoon && typeof queueMicrotask === 'function') {
      this._clockSoon = true;
      queueMicrotask(() => {
        this._clockSoon = false;
        const p = this.peekMission();
        if (!p) return;
        const t = p.mission.timeLeft;
        this.setTimer(t != null && Number.isFinite(+t) ? Math.max(0, +t) : null);
      });
    }
  }

  setTimer(seconds) {
    const el = this.elTimer;
    if (!el) return;
    if (this._softKey != null) { this._softKey = null; el.classList.remove('soft', 'over'); }
    if (seconds == null) {
      // A-04: no clock on this stage, but a later one has a deadline (the
      // blitz grid, a timed run after untimed stages). Show that budget now,
      // dimmed and still, so « Trop tard » never comes out of nowhere (Lex: "I didn't see a clock").
      const up = upcomingDeadline(this.peekMission());
      if (up != null) {
        this._paintTimer(el, up);
        el.classList.add('pending');
        el.classList.remove('warn');
        el.style.opacity = '';
        el.style.transform = '';
        return;
      }
      el.classList.add('hidden');
      el.classList.remove('pending');
      el.style.opacity = '';
      el.style.transform = '';
      return;
    }
    const s = Math.max(0, seconds);
    el.classList.remove('pending');
    this._paintTimer(el, s);
    el.classList.toggle('warn', s < 10);
    if (s < 5) {
      // flash on the half-second; keep the CSS centring transform intact
      const beat = (s % 0.5) < 0.25;
      el.style.opacity = beat ? '1' : '0.35';
      el.style.transform = 'translateX(-50%) scale(' + (beat ? 1.12 : 1) + ')';
    } else {
      el.style.opacity = '';
      el.style.transform = '';
    }
  }

  /**
   * Where setTimer(null) looks for the running job. main.js exposes it as
   * window.AYLMER.G; a test or a later wiring can replace this function.
   */
  peekMission() {
    const G = globalThis.AYLMER && globalThis.AYLMER.G;
    if (!G || !G.mission) return null;
    return { mission: G.mission, scale: G.timerScale || 1 };
  }

  /**
   * W8-FIRST15: a soft clock in the same slot, counting up against a time to
   * beat (Maman's, on L'alternateur's way home): « 1:12 · Maman 2:10 ». Dim, no
   * red, no flash, because nothing fails when it runs out; past the time it
   * just dims further. Repaints only when the shown second changes.
   */
  setSoftClock(seconds, target, en = false) {
    const el = this.elTimer;
    if (!el) return;
    const s = Math.max(0, Math.floor(seconds || 0));
    const key = s * 4096 + (target | 0) * 2 + (en ? 1 : 0);
    if (key === this._softKey) return;
    this._softKey = key;
    el.classList.remove('hidden', 'pending', 'warn');
    el.classList.add('soft');
    el.classList.toggle('over', s > target);
    el.style.opacity = '';
    el.style.transform = '';
    const f = (x) => Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0');
    const txt = f(s) + '  ·  ' + (en ? 'Mom ' : 'Maman ') + f(target);
    el.textContent = txt;
    this._lastTimer = txt;
  }

  _paintTimer(el, s) {
    el.classList.remove('hidden');
    const m = Math.floor(s / 60);
    const r = Math.floor(s - m * 60);
    const txt = m + ':' + (r < 10 ? '0' : '') + r;
    if (txt !== this._lastTimer) { el.textContent = txt; this._lastTimer = txt; }
  }

  /**
   * Hide the lowest-ranked centre layers beyond CENTRE_MAX. Cheap: called from
   * setSpeed (once a frame) at most every 100 ms, and right after a toast or
   * prompt change.
   */
  layoutCentre(force = false) {
    if (typeof document === 'undefined' || !document.getElementById) return null;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!force && now - (this._centreAt || 0) < 100) return this._centreKeep || null;
    this._centreAt = now;
    const els = {};
    const visible = [];
    for (const key of CENTRE_ORDER) {
      const id = CENTRE_EL[key];
      const el = els[id] || document.getElementById(id);
      if (!el) continue;
      els[id] = el;
      if (!centreShows(el)) continue;
      if (id === 'heckles') {
        const story = !!el.querySelector('.bub.story');
        if ((key === 'story') !== story) continue;
      }
      visible.push(key);
    }
    const keep = centreKeep(visible);
    for (const id of Object.keys(els)) {
      const keys = CENTRE_ORDER.filter((k) => CENTRE_EL[k] === id && visible.includes(k));
      const y = keys.length > 0 && !keys.some((k) => keep.has(k));
      if (els[id].classList.contains('hud-yield') !== y) els[id].classList.toggle('hud-yield', y);
      if (id === 'toast') {
        const was = this.toasts.held;
        this.toasts.hold(y, 'yield');
        if (was && !this.toasts.held && !this._pumping) this._pumpToasts();
      }
    }
    this._centreKeep = keep;
    return keep;
  }

  /**
   * W8-BUGS: the toast and the prompt re-rank the centre the moment they
   * change; a story bubble (heckle.js) and the tutorial chip (ui.js) did not,
   * so for up to a frame (100 ms or more on a slow frame) three layers drew at
   * once (cloud run 27 Oct, curfew start: tuto + story + toast). These two
   * owners are watched instead: any change re-ranks before the next paint.
   * Mutations only happen when they change, never per frame.
   */
  _watchCentre($) {
    if (typeof MutationObserver !== 'function') return;
    const heckles = $('heckles'), tuto = $('tuto');
    if (!heckles && !tuto) return;
    this._centreObs = new MutationObserver(() => this.layoutCentre(true));
    if (heckles) this._centreObs.observe(heckles, { childList: true });
    if (tuto) this._centreObs.observe(tuto, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
  }

  setSpeed(kmh) {
    this.layoutCentre();
    this.tickSlots();
    const v = Math.max(0, Math.round(kmh || 0));
    if (v === this._lastKmh) return;
    this._lastKmh = v;
    if (this.elKmh) this.elKmh.textContent = String(v);
    this._drawGauge(v);
  }

  // 1..5 for the fake five-speed main.js already computes for the engine note.
  // Accepts a string too, so 'R'/'N' work.
  /** S3-RANGER: fit the speedo to this car's terminal speed (km/h). Cheap when unchanged. */
  setGaugeTop(topKmh) {
    if (!(topKmh > 0) || topKmh === this._gTop) return;
    this._gTop = topKmh;
    const g = gaugeScale(topKmh);
    if (g.max === this._gMax && g.red === this._gRed) return;
    this._gMax = g.max; this._gRed = g.red;
    if (this._gaugeFace) this._gaugeFace = this._buildGaugeFace();
    this._gaugeKmh = -1;
    this._drawGauge(this._lastKmh < 0 ? 0 : (this._lastKmh || 0));
  }

  setGear(gear) {
    if (gear === this._gear) return;
    this._gear = gear;
    this._gaugeKmh = -1;                 // force the centre digit to repaint
    this._drawGauge(this._lastKmh < 0 ? 0 : this._lastKmh);
  }

  setCar(name) {
    if (this.elCar) this.elCar.textContent = name || '-';
  }

  /**
   * The one line at the bottom of the screen (U8).
   *
   * Four things want it — the mission runner, the police, a garage forecourt
   * and the Kijiji hint — and each of them used to own its own absolutely
   * positioned div, stacked 32 px apart. At 1280x800 `#econprompt` landed at
   * 110 px off the bottom and the tutorial card at 112 px, so « K — Kijiji »
   * drew underneath « W — pour avancer » on the very first frame of a new
   * game. One slot, one owner at a time, highest rank wins.
   */
  setPrompt(source, text) {
    if (!this._prompts) this._prompts = { replay: null, mission: null, repair: null, shop: null };   // [w7-crashnight] replay ranks first
    if (!(source in this._prompts)) return;
    const v = text || null;
    if (this._prompts[source] === v) return;
    this._prompts[source] = v;
    this._renderPrompt();
  }

  _renderPrompt() {
    const el = this.elPrompt;
    if (!el) return;
    const p = this._prompts || {};
    const best = p.replay || p.mission || p.repair || p.shop || null;   // [w7-crashnight]
    if (best === this._promptShown) return;
    this._promptShown = best;
    if (!best) { el.textContent = ''; el.classList.add('hidden'); this.layoutCentre(true); return; }
    el.textContent = best;
    el.classList.remove('hidden');
    this.layoutCentre(true);
  }

  prompt(text) { this.setPrompt('mission', text); }

  // Queued: at most two on screen, oldest on top, the rest wait their turn.
  toast(text, ms = 2200, urgent = false) {
    this.toasts.push(text, ms, urgent);
    this._pumpToasts();
  }

  /**
   * B-07 / B-12a: the fail card. retry.js owns it (failToast(): { text, ms }
   * or null); main.js passes it here once a frame and on a fail. It goes up
   * once, in the front slot, and comes down the moment retry.js drops it.
   */
  failCard(ft) {
    const text = ft && ft.text ? ft.text : null;
    if (text === this._failText) return;
    const old = this._failText;
    this._failText = text;
    if (old != null && this.toasts.drop(old)) this._paintToasts();
    if (text != null) this.toast(text, ft.ms || 3000, true);
  }

  /** W9-LEVELS: take one toast down early (the start banner, cleared with Enter). */
  dropToast(text) {
    if (text != null && this.toasts.drop(text)) this._paintToasts();
  }

  /** B-12a: empty the toast slot and the queue (a load, the menu). */
  clearToasts() {
    this._failText = null;
    this.toasts.clear();
    this._paintToasts();
  }

  _paintToasts() {
    const lines = this.toasts.texts();
    for (let i = 0; i < this.slots.length; i++) {
      const el = this.slots[i];
      el.textContent = lines[i] ?? '';
      el.classList.toggle('show', i < lines.length);
    }
    if (this.elToast) this.elToast.classList.toggle('show', lines.length > 0);
    this.layoutCentre(true);
  }

  _pumpToasts() {
    this._pumping = true;
    try { this._pumpToastsNow(); } finally { this._pumping = false; }
  }

  _pumpToastsNow() {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (this.toasts.step(now) && this.slots.length) this._paintToasts();
    if (this._toastTimer) { clearTimeout(this._toastTimer); this._toastTimer = 0; }
    const next = this.toasts.nextDeadline(now);
    if (next < Infinity && typeof setTimeout === 'function') {
      this._toastTimer = setTimeout(() => { this._toastTimer = 0; this._pumpToasts(); },
        Math.max(16, Math.min(next, 5000)));
    }
  }

  // ---- speedo gauge ------------------------------------------------------

  // Ticks and the arc never change, so they live on their own canvas and the
  // live gauge is one drawImage plus a needle.
  _buildGaugeFace() {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const cv = document.createElement('canvas');
    cv.width = Math.round(GAUGE_PX * this.dpr);
    cv.height = Math.round(GAUGE_PX * this.dpr);
    const g = cv.getContext && cv.getContext('2d');
    if (!g) return null;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const R = GAUGE_PX / 2, cx = R, cy = R;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;   // 270° sweep, gap at the bottom
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 12;
    g.beginPath(); g.arc(cx, cy, R - 9, a0, a1); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.20)'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, R - 9, a0, a1); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const gMax = this._gMax || GAUGE_MAX, gRed = this._gRed != null ? this._gRed : 140;
    for (let v = 0; v <= gMax; v += 20) {
      const a = a0 + (a1 - a0) * (v / gMax);
      const ca = Math.cos(a), sa = Math.sin(a);
      const major = v % 40 === 0;
      g.strokeStyle = v >= gRed ? 'rgba(255,95,77,.85)' : 'rgba(255,255,255,.6)';
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(cx + ca * (R - 16), cy + sa * (R - 16));
      g.lineTo(cx + ca * (R - (major ? 24 : 21)), cy + sa * (R - (major ? 24 : 21)));
      g.stroke();
      if (major && v > 0) {
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.font = '600 9px Helvetica, Arial, sans-serif';
        g.fillText(String(v), cx + ca * (R - 33), cy + sa * (R - 33));
      }
    }
    return cv;
  }

  _drawGauge(kmh) {
    const g = this.gctx;
    if (!g || !this._gaugeFace) return;
    if (kmh === this._gaugeKmh) return;
    this._gaugeKmh = kmh;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, GAUGE_PX, GAUGE_PX);
    g.drawImage(this._gaugeFace, 0, 0, GAUGE_PX, GAUGE_PX);
    const R = GAUGE_PX / 2, cx = R, cy = R;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const frac = Math.min(1, Math.max(0, kmh / (this._gMax || GAUGE_MAX)));
    const a = a0 + (a1 - a0) * frac;
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    g.fillStyle = kmh >= (this._gRed != null ? this._gRed : 140) ? '#ff5f4d' : '#ffc94d';
    g.beginPath();
    g.moveTo(-6, 3); g.lineTo(-6, -3); g.lineTo(R - 18, -1.4); g.lineTo(R - 18, 1.4);
    g.closePath(); g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.arc(cx, cy, 4.5, 0, TAU); g.fill();
    // Gear in the well below the hub.
    const gear = this._reverse ? 'R' : String(this._gear ?? 1);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = this._reverse ? '#ff9f8d' : 'rgba(255,255,255,.75)';
    g.font = '800 19px Helvetica, Arial, sans-serif';
    g.fillText(gear, cx, cy + 26);
  }

  // ---- minimap -----------------------------------------------------------

  setStreet(name) {
    const el = this.el && this.el.street;
    if (!el) return;
    if (name !== this._street) { el.textContent = name || ''; this._street = name; }
  }

  setRange(metres) {
    if (metres > 0) this.range = Math.min(MAP_RANGE.max, Math.max(MAP_RANGE.min, metres));
    return this.range;
  }

  // Corner minimap size in CSS px. The static layer is resolution-independent,
  // so only the visible canvas and the street label move.
  setSize(px) {
    const s = Math.max(120, Math.round(px || DEFAULT_SIZE));
    this.size = s;
    const cv = this.canvas;
    if (cv) {
      if (cv.style) { cv.style.width = s + 'px'; cv.style.height = s + 'px'; }
      cv.width = Math.round(s * this.dpr);
      cv.height = Math.round(s * this.dpr);
    }
    const st = this.el && this.el.street;
    if (st && st.style) st.style.left = (20 + s + 16) + 'px';
    // A-04: the job counters (reactive.js #reactstats) sit above the map, not
    // on it; style.css reads the size from here.
    const de = typeof document !== 'undefined' ? document.documentElement : null;
    if (de && de.style && de.style.setProperty) de.style.setProperty('--mapsize', s + 'px');
    this._lastMapDraw = 0;
    return s;
  }

  _buildStatic() {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const B = MAP.bounds;
    const w = Math.ceil((B.maxX - B.minX) * STATIC_SCALE);
    const h = Math.ceil((B.maxZ - B.minZ) * STATIC_SCALE);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext && cv.getContext('2d');
    if (!g) return null;

    // Everything below is in metres; the scale lives in the canvas transform.
    // Line widths are set in pixels, so they are divided back out by hand.
    g.setTransform(STATIC_SCALE, 0, 0, STATIC_SCALE, -B.minX * STATIC_SCALE, -B.minZ * STATIC_SCALE);

    g.fillStyle = C.land;
    g.fillRect(B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ);

    const ring = (p) => {
      if (!p || p.length < 3) return false;
      g.beginPath();
      g.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
      g.closePath();
      return true;
    };

    // Ground cover.
    for (const a of MAP.areas) {
      const col = AREA_FILL[a.k];
      if (!col) continue;
      g.fillStyle = col;
      if (ring(a.p)) g.fill();
    }

    // The Ottawa River on top of the land-side cover.
    g.fillStyle = C.water;
    for (const wtr of MAP.water) if (ring(wtr.p)) g.fill();

    // Footprints go UNDER the roads and stay faint: on a 200 px minimap the
    // 9,000 houses were reading as one grey mass with the streets lost in it.
    // Sheds and the smallest garages are dropped outright.
    g.save();
    for (const b of MAP.buildings) {
      if (b.k === 'shed') continue;
      const small = b.k === 'house' || b.k === 'terrace';
      if (small && !bigEnough(b.p)) continue;
      g.globalAlpha = small ? 0.34 : 0.6;
      g.fillStyle = C.building;
      if (ring(b.p)) g.fill();
    }
    g.restore();

    // Roads: minors first so majors win at intersections.
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const minW = 1.2 / STATIC_SCALE;   // ≥1.2 device px once scaled
    for (const [cls, col] of ROAD_ORDER) {
      g.strokeStyle = col;
      for (const r of MAP.roads) {
        if (r.cls !== cls) continue;
        const pts = r.pts;
        if (!pts || pts.length < 2) continue;
        g.lineWidth = Math.max(r.w || 0, minW);
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.stroke();
      }
    }

    return cv;
  }

  draw(state) {
    const g = this.ctx;
    if (!g || !state) return;

    const SIZE = this.size, MAP_R = SIZE / 2;
    // The big corner map costs ~3x the small one; 30 Hz is plenty for it.
    const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (SIZE >= LARGE_MIN_PX) {
      if (nowMs - this._lastMapDraw < 32) return;
    }
    this._lastMapDraw = nowMs;

    const range = state.range > 0 ? state.range : this.range;
    const px = state.x || 0, pz = state.z || 0, yaw = state.yaw || 0;
    const s = MAP_R / range;                 // px per world unit on screen
    // yaw 0 faces +Z; rotating by (yaw - PI) puts the heading at screen-up.
    const a = yaw - Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    const t = nowMs * 0.001;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath();
    g.arc(MAP_R, MAP_R, MAP_R, 0, TAU);
    g.clip();

    if (this.staticMap) {
      g.save();
      g.translate(MAP_R, MAP_R);
      g.rotate(a);
      g.scale(s, s);
      g.translate(-px, -pz);
      const B = MAP.bounds;
      g.drawImage(this.staticMap, B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ);
      g.restore();
    }

    // Screen position of a world point, without scaling the marker itself.
    const toX = (dx, dz) => MAP_R + (dx * ca - dz * sa) * s;
    const toY = (dx, dz) => MAP_R + (dx * sa + dz * ca) * s;

    const route = state.route;
    if (route && route.length > 1) {
      g.strokeStyle = C.route; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i < route.length; i++) {
        const dx = route[i][0] - px, dz = route[i][1] - pz;
        const x = toX(dx, dz), y = toY(dx, dz);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }

    const traffic = state.traffic;
    if (traffic && traffic.length) {
      g.fillStyle = C.traffic;
      g.beginPath();
      for (let i = 0; i < traffic.length; i++) {
        const dx = traffic[i].x - px, dz = traffic[i].z - pz;
        if (dx * dx + dz * dz > range * range) continue;
        const x = toX(dx, dz), y = toY(dx, dz);
        g.moveTo(x + 1.6, y);
        g.arc(x, y, 1.6, 0, TAU);
      }
      g.fill();
    }

    // Race agent: rivals and cruisers, same shape as a traffic dot but bigger
    // and in their own colour. Cops blink so they read as cops at a glance.
    const blob = (list, colour, rad) => {
      if (!list || !list.length) return;
      g.fillStyle = colour;
      g.beginPath();
      for (let i = 0; i < list.length; i++) {
        const dx = list[i].x - px, dz = list[i].z - pz;
        if (dx * dx + dz * dz > range * range) continue;
        const x = toX(dx, dz), y = toY(dx, dz);
        g.moveTo(x + rad, y);
        g.arc(x, y, rad, 0, TAU);
      }
      g.fill();
    };
    // [w6-escape] C-16: the red search circle, where the cruisers lost sight
    // of you. Red and dashed, so it never reads as the cyan route; the dash
    // crawls slowly. Drawn even when the centre is off the edge (the clip).
    const sc = state.search;
    if (sc && sc.r > 0) {
      const dx = sc.x - px, dz = sc.z - pz;
      g.save();
      g.beginPath();
      g.arc(toX(dx, dz), toY(dx, dz), sc.r * s, 0, TAU);
      g.fillStyle = 'rgba(255,95,77,0.13)';
      g.fill();
      g.setLineDash(SEARCH_DASH);
      g.lineDashOffset = -t * 12;
      g.strokeStyle = '#ff5f4d'; g.lineWidth = 1.5;
      g.stroke();
      g.restore();
      this.mapStats.search++;
    }
    // [w6-escape] hide spots while you are wanted: small hollow squares.
    const hides = state.hides;
    if (hides && hides.length) {
      g.strokeStyle = '#9fd3ff'; g.lineWidth = 1.5;
      for (let i = 0; i < hides.length; i++) {
        const dx = hides[i].x - px, dz = hides[i].z - pz;
        g.strokeRect(toX(dx, dz) - 3, toY(dx, dz) - 3, 6, 6);
      }
    }
    blob(state.rivals, C.rival, 2.8);
    blob(state.cops, (t * 5) % 1 < 0.5 ? C.cop : '#ff5f4d', 3.0);

    // Nearby businesses and landmarks. Keep these smaller than mission pins:
    // they provide local texture without competing with the current objective.
    const pois = state.pois;
    if (pois && pois.length) {
      for (let i = 0; i < pois.length; i++) {
        const p = pois[i], dx = p.x - px, dz = p.z - pz;
        if (dx * dx + dz * dz > range * range) continue;
        const x = toX(dx, dz), y = toY(dx, dz);
        g.fillStyle = p.landmark ? C.landmark : C.business;
        g.beginPath();
        if (p.landmark) {
          g.moveTo(x, y - 2.8); g.lineTo(x + 2.8, y);
          g.lineTo(x, y + 2.8); g.lineTo(x - 2.8, y); g.closePath();
        } else {
          g.arc(x, y, 2.1, 0, TAU);
        }
        g.fill();
      }
    }

    const targets = state.targets;
    let objShown = false;
    if (targets && targets.length) {
      const pulse = 1 + 0.35 * Math.sin(t * 4);
      for (let i = 0; i < targets.length; i++) {
        const tg = targets[i];
        const dx = tg.x - px, dz = tg.z - pz;
        const d = Math.hypot(dx, dz);
        const obj = tg.kind !== 'mission';
        const col = tg.kind === 'waypoint' ? C.waypoint : tg.kind === 'car' ? C.car : obj ? C.objective : C.job;

        if (d <= range) {
          const x = toX(dx, dz), y = toY(dx, dz);
          g.strokeStyle = col;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y, obj ? 4.5 * pulse : 4.5, 0, TAU);
          g.stroke();
          if (obj) {
            g.fillStyle = col;
            g.beginPath();
            g.arc(x, y, 1.8, 0, TAU);
            g.fill();
          }
          continue;
        }

        // Off the edge: chevron on the rim pointing at it.
        const ux = (dx * ca - dz * sa) / d, uy = (dx * sa + dz * ca) / d;
        const rx = MAP_R + ux * (MAP_R - 8), ry = MAP_R + uy * (MAP_R - 8);
        g.save();
        g.translate(rx, ry);
        g.rotate(Math.atan2(uy, ux));
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(5, 0); g.lineTo(-3, 4); g.lineTo(-3, -4);
        g.closePath();
        g.fill();
        g.restore();

        if (obj && !objShown) {
          objShown = true;
          g.fillStyle = col;
          g.font = '600 10px Helvetica, Arial, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km',
            MAP_R + ux * (MAP_R - 24), MAP_R + uy * (MAP_R - 24));
        }
      }
    }

    // FEEL — where you can get it fixed, once it needs fixing. Drawn like the
    // pins above, but as the wrench the damage bar is already showing you.
    const repairs = state.repairs;
    if (repairs && repairs.length) {
      g.font = '11px Helvetica, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = C.repair;
      for (let i = 0; i < repairs.length; i++) {
        const dx = repairs[i].x - px, dz = repairs[i].z - pz;
        const d = Math.hypot(dx, dz);
        const k = d <= range ? 1 : (MAP_R - 8) / (d * s);   // off the edge: pin it to the rim
        g.fillText('\u{1F527}', toX(dx * k, dz * k), toY(dx * k, dz * k));
      }
    }

    // B-06: your own truck when you are not in it (the cart, a bike, a
    // friend's car): a small square, on the rim with its distance when it is
    // off the map.
    const own = this._own;
    if (own && own.at) {
      const dx = own.at.x - px, dz = own.at.z - pz;
      const d = Math.hypot(dx, dz);
      const k = d <= range - 6 / s ? 1 : (MAP_R - 9) / (d * s);
      const x = toX(dx * k, dz * k), y = toY(dx * k, dz * k);
      g.fillStyle = 'rgba(0,0,0,.6)';
      g.fillRect(x - 5.5, y - 5.5, 11, 11);
      g.fillStyle = C.own;
      g.fillRect(x - 4, y - 4, 8, 8);
      if (k < 1 && !objShown) {
        g.font = '600 10px Helvetica, Arial, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const ux = (x - MAP_R) / (MAP_R - 9), uy = (y - MAP_R) / (MAP_R - 9);
        g.fillText(fmtM(d), MAP_R + ux * (MAP_R - 26), MAP_R + uy * (MAP_R - 26));
      }
    }

    // Player: fixed yellow arrow at the centre, always pointing up.
    g.fillStyle = C.player;
    g.beginPath();
    g.moveTo(MAP_R, MAP_R - 7);
    g.lineTo(MAP_R + 5, MAP_R + 6);
    g.lineTo(MAP_R, MAP_R + 3);
    g.lineTo(MAP_R - 5, MAP_R + 6);
    g.closePath();
    g.fill();

    g.restore();

    // Scale readout, so + / − mean something.
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.font = '600 10px Helvetica, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText(range >= 1000 ? (range / 1000).toFixed(1) + ' km' : Math.round(range) + ' m',
      MAP_R, SIZE - 5);
  }

  // ---- driving agent additions ------------------------------------------
  // Markup lives at the end of index.html and the styling at the end of
  // style.css, so this survives a rework of the rest of the HUD.

  /** R4 — the damage bar next to the speedo. `pct` is 0..100. */
  setDamage(pct) {
    if (this._dmgFill === undefined) {
      const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
      this._dmgWrap = $('dmgwrap');
      this._dmgFill = $('dmgfill');
    }
    const v = Math.max(0, Math.min(100, Math.round(pct || 0)));
    if (v === this._lastDmg) return;
    this._lastDmg = v;
    if (this._dmgWrap) this._dmgWrap.classList.toggle('hidden', v <= 0);
    if (!this._dmgFill) return;
    this._dmgFill.style.width = v + '%';
    // green → amber at the cosmetic line → red once it starts to drive badly
    this._dmgFill.className = v > 60 ? 'bad' : v > 25 ? 'warn' : '';
  }

  /**
   * Race agent (G4) — the wanted meter next to the speedo: 0 to 3 stars.
   * Markup is one <div id="stars"> at the end of index.html and the styling is
   * at the end of style.css, so this survives a rework of the rest of the HUD.
   */
  setStars(n) {
    if (this._starsEl === undefined) {
      this._starsEl = (typeof document !== 'undefined' ? document.getElementById('stars') : null);
    }
    const v = Math.max(0, Math.min(3, Math.round(n || 0)));
    if (v === this._lastStars) return v;
    this._lastStars = v;
    const el = this._starsEl;
    if (!el) return v;
    el.classList.toggle('hidden', v <= 0);
    el.textContent = '\u2605'.repeat(v) + '\u2606'.repeat(3 - v);
    el.classList.toggle('hot', v >= 3);
    return v;
  }

  /** D5 — the R on the speedo. */
  setReverse(on) {
    if (this._revEl === undefined) {
      this._revEl = (typeof document !== 'undefined' ? document.getElementById('gear') : null);
    }
    const v = !!on;
    if (v === this._lastRev) return;
    this._lastRev = v;
    if (this._revEl) this._revEl.classList.toggle('hidden', !v);
  }

  // ---- story agent additions --------------------------------------------
  // Same deal as the block above: the styling is at the end of style.css.

  /**
   * Story agent — the objective lines flash amber for a moment. game/story.js
   * calls it when you have not moved twenty metres in twenty seconds, right
   * after it toasts the stage's hint at you, so the eye goes back to the line
   * that has been telling you what to do the whole time.
   */
  pulseObjective(times = 1) {
    if (this._topleft === undefined) {
      this._topleft = (typeof document !== 'undefined' ? document.getElementById('topleft') : null);
    }
    const el = this._topleft;
    if (!el || !el.classList) return false;
    el.classList.remove('pulse');
    // Force a reflow so re-adding the class restarts the animation.
    if (typeof el.offsetWidth === 'number') void el.offsetWidth;
    el.classList.add('pulse');
    // B-06: the nudge brings the faded how-to line back for another 5 s.
    this._subFresh();
    if (this._pulseT) clearTimeout(this._pulseT);
    if (typeof setTimeout === 'function') {
      this._pulseT = setTimeout(() => {
        this._pulseT = 0;
        if (el.classList) el.classList.remove('pulse');
      }, 2300 * Math.max(1, times));
    }
    return true;
  }

  /** Is the objective line currently pulsing? (The smoke test asks.) */
  get pulsing() {
    return !!(this._topleft && this._topleft.classList && this._topleft.classList.contains('pulse'));
  }

  /** What the objective line says right now — for tests and for the save name. */
  objectiveText() {
    return [this.elObjective ? this.elObjective.textContent : '',
      this.elSub ? this.elSub.textContent : ''];
  }

  /**
   * FEEL — the line next to the damage bar that tells you where the garages
   * are. `text` is null once the car is straight again. Markup is one
   * <div id="repairhint"> at the end of index.html.
   */
  setRepairHint(text) {
    if (this._hintEl === undefined) {
      this._hintEl = (typeof document !== 'undefined' ? document.getElementById('repairhint') : null);
    }
    const v = text || null;
    if (v === this._lastHint) return;
    this._lastHint = v;
    const el = this._hintEl;
    if (!el) return;
    el.textContent = v ? '\u{1F527} ' + v : '';
    el.classList.toggle('hidden', !v);
  }

  // feel agent: the repair line. It used to be its own #prompt2 element 34 px
  // under #prompt; it shares the one slot now — see setPrompt().
  setRepairPrompt(text) { this.setPrompt('repair', text); }

  // economy agent: « U — garage » / « K — Kijiji ». Was #econprompt,
  // 66 px under #prompt, which is exactly where the tutorial card sits.
  setShopPrompt(text) { this.setPrompt('shop', text); }

  /**
   * U7: a modal owns the screen. The HUD itself goes away in CSS (body.modal),
   * and the toast queue freezes so nothing plays out where nobody can read it.
   */
  setModalOpen(on) {
    this.toasts.hold(on);
    this._pumpToasts();
  }

  /**
   * The spine (Wave 2a): the envelope, top right, always. `amount` is
   * « 340 $ / 1 200 $ », `day` is « sam 26 juin · 72 jours ». Redrawn only when
   * the strings change, so calling it every frame costs nothing.
   */
  setEnvelope(amount, day, reached) {
    const el = this._env || (this._env = this._byId('envelope'));
    if (!el) return;
    if (amount !== this._envAmt) {
      this._envAmt = amount;
      const a = el.querySelector('#envamt'); if (a) a.textContent = amount;
    }
    if (day !== this._envDay) {
      this._envDay = day;
      const d = el.querySelector('#envday'); if (d) d.textContent = day;
    }
    if (!!reached !== this._envOk) { this._envOk = !!reached; el.classList.toggle('reached', !!reached); }
  }

  /** Litres in the tank, as a bar and a number; hidden for a bike or the cart. */
  setFuel(litres, tank) {
    const el = this._fuel || (this._fuel = this._byId('fuel'));
    if (!el) return;
    const show = tank > 0;
    if (show !== this._fuelShown) { this._fuelShown = show; el.classList.toggle('hidden', !show); }
    if (!show) return;
    const key = Math.round(litres * 2) + '/' + tank;
    if (key === this._fuelKey) return;
    this._fuelKey = key;
    const f = Math.max(0, Math.min(1, litres / tank));
    const bar = el.querySelector('i'); if (bar) bar.style.setProperty('--f', (f * 100).toFixed(1) + '%');
    const txt = el.querySelector('span'); if (txt) txt.textContent = Math.round(litres) + ' L';
    el.classList.toggle('warn', litres <= 6);
  }

  _byId(id) { return typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null; }

  // ---- B-06 slots -------------------------------------------------------
  // Three slots built here (index.html stays as it is): the style chain
  // readout, bottom right above the wanted stars; the wrong-vehicle chip,
  // bottom left above the job counters; and, on the minimap, your own truck
  // when you are not in it. They read the game straight from the modules
  // (style.js through G.style, tow.js, retry.js, jobready.js), so main.js
  // needs no new call: setSpeed() ticks them, at most every SLOT_MS.

  _buildSlots() {
    if (typeof document === 'undefined' || !document.createElement || !this.root) return;
    const mk = (id, cls, html) => {
      let el = document.getElementById(id);
      if (!el) { el = document.createElement('div'); el.id = id; el.className = cls; el.innerHTML = html; this.root.appendChild(el); }
      return el;
    };
    this.elChain = mk('stylechain', 'hidden', '<b></b><i></i><span></span>');
    this.elVehChip = mk('vehchip', 'hidden', '');
  }

  /**
   * B-03 contract: reactive.js sends each style tip here (« +12 $ FRÔLÉ x3 »)
   * instead of into the one toast slot. It shows under the chain readout and
   * repaints the readout at once, so the chain is up the frame the event is.
   */
  styleTip(text, ms = 1100) {
    this._tip = { text: String(text || ''), until: nowMs() + Math.max(400, ms | 0) };
    this.tickSlots(true);
  }

  /** The style chain readout. `hs` is style.js hudState(), or null. */
  setStyle(hs) {
    const el = this.elChain;
    if (!el) return null;
    const v = chainView(hs);
    const tip = this._tip && this._tip.until > nowMs() ? this._tip.text : '';
    const key = v ? v.text + '|' + Math.round(v.fade * 20) + '|' + tip : (tip ? '|tip|' + tip : '');
    if (key === this._chainKey) return v;
    this._chainKey = key;
    if (!v && !tip) { el.classList.add('hidden'); return v; }
    el.classList.remove('hidden');
    const b = el.firstChild, bar = b && b.nextSibling, sp = bar && bar.nextSibling;
    if (b) b.textContent = v ? v.text : '';
    if (bar) bar.style.setProperty('--f', v ? Math.round(v.fade * 100) + '%' : '0%');
    if (sp) sp.textContent = tip;
    el.classList.toggle('x3', !!v && v.mult >= 3);
    el.classList.toggle('tiponly', !v);
    return v;
  }

  /** The wrong-vehicle chip, and the own-truck marker's data for draw(). */
  setVehicle(G) {
    let st = null;
    try { st = G && G.veh ? ownVehicleStatus(G) : null; } catch (e) { st = null; }
    this._own = st && !st.inOwn && st.at ? st : null;
    let chip = null;
    if (st && st.borrowed && !st.jobVehicle && !G.mission) {
      const role = borrowedRole(G.veh && G.veh.spec);
      let kind = null;
      try {
        const j = nearestJob(G);
        if (j && j.dist <= PILLAR_NEAR) kind = jobKind(j.def);
      } catch (e) { kind = null; }
      chip = vehicleChip(st, role, kind);
    }
    const el = this.elVehChip;
    const text = chip ? chip.text : '';
    if (el && text !== this._chipText) {
      this._chipText = text;
      el.textContent = text;
      el.classList.toggle('hidden', !text);
      el.classList.toggle('warn', !!(chip && chip.warn));
    }
    return chip;
  }

  // The sub line just went up: clock it, and fade it on time even when no
  // frame runs (a card, a slow frame): the fade is a timer, not a frame count.
  _subFresh() {
    this._subAt = nowMs(); this._subTick = this._tutTicks || 0; this._setSubFaded(false);
    if (typeof setTimeout !== 'function') return;
    if (this._subTimer) clearTimeout(this._subTimer);
    this._subTimer = setTimeout(() => { this._subTimer = 0; this.tickSlots(true); }, SUB_FADE_MS + 20);
    if (this._subTimer && typeof this._subTimer.unref === 'function') this._subTimer.unref();
  }

  _setSubFaded(on) {
    const el = this.elSub;
    if (!el || !el.classList) return;
    if (el.classList.contains('faded') !== !!on) el.classList.toggle('faded', !!on);
  }

  /**
   * Once a frame from setSpeed; does real work at most every SLOT_MS (or now,
   * with `force`). Reads window.AYLMER.G like peekMission() does.
   */
  tickSlots(force = false) {
    const now = nowMs();
    if (!force && now - (this._slotAt || 0) < SLOT_MS) return;
    this._slotAt = now;
    const G = globalThis.AYLMER && globalThis.AYLMER.G;
    // The tutorial chip: count its ticks (the green flash), and drop the map
    // tip after its two minutes.
    const tuto = this._tuto === undefined ? (this._tuto = this._byId('tuto')) : this._tuto;
    if (tuto && tuto.classList) {
      const ok = tuto.classList.contains('ok') && !tuto.classList.contains('hidden');
      if (ok && !this._tutOk) this._tutTicks = (this._tutTicks || 0) + 1;
      this._tutOk = ok;
      const cap = tuto.firstChild ? tuto.firstChild.textContent : '';
      const gone = tabChipGone({ cap, playtime: G ? +G.playtime || 0 : 0 });
      if (tuto.classList.contains('hud-gone') !== gone) { tuto.classList.toggle('hud-gone', gone); this.layoutCentre(true); }
    }
    // The sub line.
    if (this.elSub && this._subText) {
      this._setSubFaded(subFaded({ age: now - (this._subAt || 0), ticked: (this._tutTicks || 0) > (this._subTick || 0) }));
    }
    if (!G) return;
    // The fail card, from retry.js's state (main.js also passes it; same source).
    this.failCard(failToast());
    // The style chain (B-03 puts the chain on G.style).
    let hs = null;
    try { hs = G.style && typeof G.style.hudState === 'function' ? G.style.hudState() : null; } catch (e) { hs = null; }
    this.setStyle(hs);
    this.setVehicle(G);
  }

  /** For the checks: what the B-06 slots show now. */
  slotState() {
    const vis = (el) => !!el && !el.classList.contains('hidden');
    return {
      chain: vis(this.elChain) ? this.elChain.textContent : null,
      vehChip: vis(this.elVehChip) ? this.elVehChip.textContent : null,
      own: this._own ? { id: this._own.id, dist: Math.round(this._own.dist) } : null,
      subFaded: !!(this.elSub && this.elSub.classList.contains('faded')),
      tabGone: !!(this._tuto && this._tuto.classList && this._tuto.classList.contains('hud-gone')),
    };
  }
}

// A footprint worth drawing on a 200 px map: bounding box over ~55 m².
function bigEnough(p) {
  if (!p || p.length < 3) return false;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of p) {
    if (q[0] < x0) x0 = q[0];
    if (q[0] > x1) x1 = q[0];
    if (q[1] < z0) z0 = q[1];
    if (q[1] > z1) z1 = q[1];
  }
  return (x1 - x0) * (z1 - z0) > 55;
}
