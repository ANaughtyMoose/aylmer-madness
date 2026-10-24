// Presentation only: rewards, saves and stage transitions stay in the runner.
import { setModal } from './ui.js';
import { getLang } from './i18n.js';

export function missionClock(stages, scale = 1) {
  const timed = stages.filter(s => s.time != null);
  return timed.length ? timed.map(s => Math.max(1, Math.round(s.time * scale))) : null;
}

export const CINEMA_ART = {
  home: 'assets/cinema/fraser-2004.png',
  alternateur: 'assets/cinema/alternateur.png',
};

// B-10: the shared painting graded to the job's hour, so the 3 a.m. Nuit du
// Tim never opens on a sunny noon driveway. A grade is CSS only, applied
// inline to the .cinema-art layer (cinematic.css is not this file's): colour
// layers stacked over the painting with a blend mode, then a filter chain. No
// image is baked, so a new fraser-2004.png (E-05) needs no rebuild. The same
// numbers drive tools/smoke_cinematic.mjs, which applies them to the painting's
// pixels under node, so the luminance bars are checked on the data the page
// uses. Layers are listed top first, as CSS lists them.
//   linear: a top-to-bottom gradient, [r, g, b, a] at the top and the bottom
//   radial: an ellipse at (x, y), radii (rx, ry), fractions of the box, fading out
//   pattern: a repeating image from assets/cinema/tints/ (`cover` is its mean
//            coverage, used only by the smoke's estimate)
export const CARD_GRADES = {
  // The painting is a clear noon; day is the painting as painted.
  day: { layers: [], filter: [] },
  dusk: {
    layers: [
      { kind: 'linear', blend: 'multiply', top: [150, 96, 150, 0.85], bottom: [255, 168, 104, 0.75] },
      { kind: 'radial', blend: 'screen', x: 0.15, y: 0.25, rx: 0.70, ry: 0.55, color: [255, 150, 70, 0.30] },
    ],
    filter: [['saturate', 1.15], ['brightness', 0.88]],
  },
  night: {
    layers: [
      { kind: 'radial', blend: 'screen', x: 0.30, y: 0.72, rx: 0.42, ry: 0.32, color: [255, 150, 50, 0.16] },
      { kind: 'linear', blend: 'multiply', top: [26, 34, 82, 1], bottom: [62, 66, 112, 1] },
    ],
    filter: [['saturate', 0.75], ['contrast', 1.05], ['brightness', 0.95]],
  },
  // Midnight rain (golfcart): grey-blue, drained, streaks on the glass.
  rain: {
    layers: [
      { kind: 'pattern', blend: 'screen', url: 'assets/cinema/tints/rain.svg', size: '180px 240px', color: [210, 222, 240, 0.55], cover: 0.06 },
      { kind: 'linear', blend: 'multiply', top: [52, 66, 90, 1], bottom: [86, 100, 118, 1] },
    ],
    filter: [['saturate', 0.35], ['contrast', 0.92], ['brightness', 0.92]],
  },
};

// The weather a card is painted in, where the job's own def has none. No def
// carries a weather field; golfcart's rain is a card-art choice (plan B-10),
// not a story claim.
export const CARD_WEATHER = { golfcart: 'rain' };

// Jobs with their own painting take it ungraded (a tint on a painting that
// already has its hour would crush it).
const OWN_ART = { alternateur: 'alternateur' };

const HOUR_GRADE = { morning: 'day', day: 'day', dusk: 'dusk', night: 'night' };

/** The grade for a job: its card weather first, then its scheduled timeOfDay. */
export function cardGrade(defOrId) {
  const def = typeof defOrId === 'string' ? { id: defOrId } : (defOrId || {});
  const wx = def.weather || CARD_WEATHER[def.id];
  if (wx === 'rain' || wx === 'storm') return 'rain';
  return HOUR_GRADE[def.timeOfDay] || 'day';
}

/**
 * The `art` key for a job's card: its own painting, or the shared one graded
 * to its hour ('home@night'). Pass it to show({ art }), or pass show({ job }).
 */
export function cardArt(defOrId) {
  const id = typeof defOrId === 'string' ? defOrId : defOrId?.id;
  if (id && OWN_ART[id]) return OWN_ART[id];
  const g = cardGrade(defOrId);
  return g === 'day' ? 'home' : `home@${g}`;
}

/** 'home@night' -> { base: 'home', grade: 'night', src }; unknown art -> src null. */
export function resolveArt(art) {
  const [base, grade = 'day'] = String(art || 'home').split('@');
  const src = CINEMA_ART[base] || null;
  return { base, grade: CARD_GRADES[grade] && src ? grade : 'day', src };
}

const rgba = ([r, g, b, a]) => `rgba(${r},${g},${b},${a})`;
const pct = (v) => `${+(v * 100).toFixed(2)}%`;

/** The inline style for a grade over `src`: backgroundImage, backgroundBlendMode, backgroundSize, filter. */
export function gradeStyle(grade, src) {
  const G = CARD_GRADES[grade] || CARD_GRADES.day;
  const images = [], blends = [], sizes = [];
  for (const L of G.layers) {
    if (L.kind === 'linear') images.push(`linear-gradient(to bottom,${rgba(L.top)},${rgba(L.bottom)})`);
    else if (L.kind === 'radial') images.push(`radial-gradient(ellipse ${pct(L.rx)} ${pct(L.ry)} at ${pct(L.x)} ${pct(L.y)},${rgba(L.color)},${rgba([...L.color.slice(0, 3), 0])})`);
    else if (L.kind === 'pattern') images.push(`url("${L.url}")`);
    else continue;
    blends.push(L.blend || 'normal');
    sizes.push(L.kind === 'pattern' ? L.size : 'cover');
  }
  const graded = images.length > 0;
  return {
    backgroundImage: [...images, `url("${src}")`].join(','),
    backgroundBlendMode: graded ? [...blends, 'normal'].join(',') : '',
    backgroundSize: graded ? [...sizes, 'cover'].join(',') : '',
    filter: G.filter.map(([f, v]) => `${f}(${v})`).join(' '),
  };
}

function clearGrade(layer) {
  Object.assign(layer.style, { backgroundImage: '', backgroundBlendMode: '', backgroundSize: '', filter: '' });
}

export class Cinematic {
  constructor({ clearInput = () => {}, onHold = () => {} } = {}) {
    this.active = false;
    this.clearInput = clearInput;
    this.onHold = onHold;
    this.root = document.createElement('section');
    this.root.id = 'cinematic';
    this.root.className = 'hidden';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'cinema-title');
    this.root.innerHTML = `<div class="cinema-art" aria-hidden="true"></div>
      <div class="cinema-copy"><p class="cinema-eyebrow"></p><h1 id="cinema-title"></h1>
      <p class="cinema-body"></p><div class="cinema-task"></div>
      <footer><button type="button" class="cinema-go"></button><p class="cinema-note"></p></footer></div>`;
    document.body.appendChild(this.root);
    this.button = this.root.querySelector('button');
    this.button.onclick = () => this.finish();
    window.addEventListener('keydown', e => {
      if (!this.active) return;
      // A held key cannot dismiss the next card or leak throttle into driving.
      if (e.code !== 'Tab') e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Tab') { e.preventDefault(); this.button.focus(); }
      if (!e.repeat && ['Enter', 'Space', 'KeyE', 'Escape'].includes(e.code)) this.finish();
    }, true);
  }

  show({ title, body, task = '', note = '', art, job = null, eyebrow, button, onDone = null }) {
    if (!art) art = job ? cardArt(job) : 'home';
    const en = getLang() === 'en';
    this.previousFocus = document.activeElement;
    this.onDone = onDone;
    this.active = true;
    this.clearInput();
    this.onHold();
    const set = (selector, text) => { this.root.querySelector(selector).textContent = text; };
    set('.cinema-eyebrow', eyebrow || (en ? 'AYLMER, QUÉBEC · SUMMER 2004' : 'AYLMER, QUÉBEC · ÉTÉ 2004'));
    set('h1', title);
    set('.cinema-body', body);
    set('.cinema-task', task);
    set('.cinema-note', note || (en ? 'Enter to continue · Esc to skip' : 'Entrée pour continuer · Échap pour passer'));
    set('button', button || (en ? 'Continue →' : 'Continuer →'));
    const { base, grade, src } = resolveArt(art);
    // The stylesheet keys its crop on the painting ('home', 'alternateur').
    this.root.dataset.art = base;
    this.root.dataset.grade = grade;
    const layer = this.root.querySelector('.cinema-art');
    clearGrade(layer);
    // Missing art leaves a deliberate dark background and usable controls.
    const request = this.request = {};
    if (src) {
      const image = new Image();
      image.onload = () => { if (this.request === request) Object.assign(layer.style, gradeStyle(grade, src)); };
      image.src = src;
    }
    setModal('cinematic', true);
    this.button.focus();
  }

  finish() {
    if (!this.active) return false;
    const done = this.onDone;
    this.hide();
    if (done) done();
    return true;
  }

  hide() {
    this.active = false;
    this.onDone = null;
    this.request = null;
    const layer = this.root?.querySelector?.('.cinema-art');
    if (layer) clearGrade(layer);
    this.clearInput();
    setModal('cinematic', false);
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }
}
