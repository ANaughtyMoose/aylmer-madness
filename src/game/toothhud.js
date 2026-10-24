// The crown on the dash: Margaret's box, drawn as one molar with its crown,
// in the top-left corner under the objective, only during « La boîte du Dr Morin ».
//
// Tom, 6 Oct 2026: "a tooth graphic that is hilarious and highly realistic
// that shows tooth damage as you drive." The realism is six photographic
// states of the same tooth (assets/ui/tooth/state0..5.webp, Gemini image
// edits of one shot, keyed off a green screen, 96 KB together):
//   0 impeccable, 1 hairline crack, 2 chip, 3 big fracture,
//   4 crown popping off, 5 shattered.
// The comedy is the timing on top: a cartoon pair of eyes on the crown that
// squeeze shut on every hit, a shake, a squash, a porcelain « tink », an
// « Ayoye! » pop, and a sparkle while the work is still perfect.
//
// No document (node tests): every call is a no-op that still tracks state, so
// tools/smoke_dental.mjs can drive it.

export const TOOTH_STATES = 6;
export const TOOTH_LABELS = [
  'Couronnes : impeccables',
  'Fêlure fine',
  'Un éclat',
  'Grosse fracture',
  'Ça décolle!',
  'En miettes',
];
// Damage since pickup, as a fraction of the job's tolerance, that moves the
// tooth to each state. State 5 is the break itself (the job fails past 1.0).
export const TOOTH_AT = [0, 0.03, 0.25, 0.5, 0.75, 1.0001];
export function toothState(dmg, tol = 10) {
  const f = Math.max(0, dmg) / (tol || 10);
  let s = 0;
  for (let i = 1; i < TOOTH_AT.length; i++) if (f >= TOOTH_AT[i]) s = i;
  return s;
}

const POPS = ['Ayoye!', 'Aïe!', 'Ouch!', 'Crac!', 'Ayoye!!'];
const SRC = (i) => `assets/ui/tooth/state${i}.webp`;

// Where the eyes sit on the crown in each state (320 x 320 art space):
// left eye x, right eye x, y, tilt in degrees. The popped crown floats up and
// to the right; the shattered tooth has no crown, so no eyes.
const EYES = [
  [136, 184, 132, 0], [136, 184, 132, 0], [136, 182, 134, -2],
  [134, 186, 138, 3], [150, 196, 70, -12], null,
];

const CSS = `
#toothhud{position:relative;margin:10px 0 0 4px;width:clamp(74px,10.5vw,132px);
  pointer-events:none;text-align:center;transition:opacity .35s;opacity:0}
#toothhud.on{opacity:1}
#toothhud .tt-stage{position:relative;width:100%;aspect-ratio:1/1;transform-origin:50% 85%;
  filter:drop-shadow(0 6px 10px rgba(0,0,0,.55))}
#toothhud .tt-stage img{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .12s}
#toothhud .tt-stage img.cur{opacity:1}
#toothhud svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
#toothhud .tt-lbl{margin-top:3px;font-size:clamp(9px,1.05vw,12px);font-weight:800;letter-spacing:.4px;
  color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.9);white-space:nowrap}
#toothhud .tt-lbl.bad{color:#ffb19e}
#toothhud .tt-pop{position:absolute;left:78%;top:2%;font:900 clamp(13px,1.6vw,19px)/1 system-ui,sans-serif;
  color:#ffe14d;-webkit-text-stroke:1.2px #4a1300;transform:rotate(-14deg) scale(0);opacity:0}
#toothhud .tt-pop.go{animation:ttpop .7s cubic-bezier(.2,1.6,.4,1) forwards}
#toothhud .tt-spark{position:absolute;width:22%;aspect-ratio:1/1;left:58%;top:10%;opacity:0}
#toothhud.pristine .tt-spark{animation:ttspark 2.6s ease-in-out infinite}
#toothhud .tt-stage.wince{animation:ttwince .42s cubic-bezier(.3,1.8,.5,1)}
#toothhud .tt-stage.big{animation:ttbig .6s cubic-bezier(.3,1.8,.5,1)}
#toothhud .tt-stage.done{animation:ttdone .9s ease-out}
#toothhud .tt-eyes .shut{display:none}
#toothhud.closed .tt-eyes .open{display:none}
#toothhud.closed .tt-eyes .shut{display:inline}
#toothhud .tt-sweat{opacity:0;transition:opacity .3s}
#toothhud.worried .tt-sweat{opacity:1;animation:ttsweat 1.4s ease-in infinite}
@keyframes ttwince{0%{transform:none}18%{transform:translateX(-7%) rotate(-7deg) scale(1.06,.9)}
  40%{transform:translateX(6%) rotate(5deg) scale(.95,1.05)}62%{transform:translateX(-3%) rotate(-2deg)}100%{transform:none}}
@keyframes ttbig{0%{transform:none}12%{transform:translate(-9%,4%) rotate(-12deg) scale(1.12,.82)}
  30%{transform:translate(8%,-6%) rotate(9deg) scale(.9,1.12)}50%{transform:translate(-5%,2%) rotate(-5deg)}
  72%{transform:translateX(2%) rotate(2deg)}100%{transform:none}}
@keyframes ttdone{0%{transform:none}35%{transform:translateY(-10%) scale(1.1)}100%{transform:none}}
@keyframes ttpop{0%{transform:rotate(-14deg) scale(0);opacity:1}35%{transform:rotate(-8deg) scale(1.15);opacity:1}
  80%{transform:rotate(-10deg) scale(1);opacity:1}100%{transform:rotate(-10deg) translateY(-30%) scale(.9);opacity:0}}
@keyframes ttspark{0%,62%{opacity:0;transform:scale(.2) rotate(0)}74%{opacity:1;transform:scale(1) rotate(45deg)}
  88%{opacity:0;transform:scale(.3) rotate(90deg)}100%{opacity:0}}
@keyframes ttsweat{0%{transform:translateY(0);opacity:0}25%{opacity:1}100%{transform:translateY(30px);opacity:0}}
#toothhud .tt-sweat{transform-box:fill-box}
@media (max-width:640px){#toothhud{width:clamp(60px,16vw,88px);margin-top:6px}}
`;

function eyesSvg() {
  // Two cartoon eyes, a brow each, a closed version for the wince, and a
  // drop of sweat for the bad states. Drawn once; moved per state.
  const eye = (cls) => `
    <g class="${cls}">
      <g class="open"><ellipse rx="13" ry="15" fill="#fff" stroke="#1d1410" stroke-width="2.4"/>
        <circle class="pupil" r="6.2" cx="1.5" cy="2.5" fill="#1d1410"/><circle r="2" cx="3.6" cy="0" fill="#fff"/></g>
      <path class="shut" d="M-12 -4 L4 2 L-12 8" fill="none" stroke="#1d1410" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="brow" d="M-12 -22 Q0 -27 12 -22" fill="none" stroke="#1d1410" stroke-width="3.2" stroke-linecap="round"/>
    </g>`;
  return `<svg viewBox="0 0 320 320" aria-hidden="true">
    <g class="tt-eyes">
      <g class="l">${eye('e')}</g>
      <g class="r"><g transform="scale(-1,1)">${eye('e')}</g></g>
      <g class="tt-sweatpos"><path class="tt-sweat" d="M0 0 C-5 8 -7 12 -7 15 A7 7 0 0 0 7 15 C7 12 5 8 0 0Z" fill="#9fdcff" stroke="#2c6f93" stroke-width="1.5"/></g>
    </g>
  </svg>`;
}
const SPARK = `<svg class="tt-spark" viewBox="-10 -10 20 20" aria-hidden="true">
  <path d="M0 -10 L2 -2 L10 0 L2 2 L0 10 L-2 2 L-10 0 L-2 -2Z" fill="#fff"/></svg>`;

export class ToothHud {
  constructor(opts = {}) {
    this.state = 0;
    this.winces = 0;
    this.closing = false;
    this.audio = opts.audio || null;
    this.el = null;
    this._timers = [];
    const doc = typeof document !== 'undefined' && document.createElement ? document : null;
    if (!doc) return;
    if (!doc.getElementById('toothhud-css')) {
      const s = doc.createElement('style');
      s.id = 'toothhud-css';
      s.textContent = CSS;
      doc.head.appendChild(s);
    }
    doc.getElementById('toothhud')?.remove();
    const el = doc.createElement('div');
    el.id = 'toothhud';
    el.className = 'pristine';
    el.innerHTML = `<div class="tt-stage">${
      Array.from({ length: TOOTH_STATES }, (_, i) => `<img alt="" draggable="false" src="${SRC(i)}"${i === 0 ? ' class="cur"' : ''}>`).join('')
    }${eyesSvg()}${SPARK}</div><div class="tt-pop"></div><div class="tt-lbl">${TOOTH_LABELS[0]}</div>`;
    // Under the objective, in the top-left block's own flow, so it follows the
    // text down and never sits on the road, the clock or the money.
    (doc.getElementById('topleft') || doc.getElementById('hud') || doc.body).appendChild(el);
    this.el = el;
    this.stage = el.querySelector('.tt-stage');
    this.pop = el.querySelector('.tt-pop');
    this.lbl = el.querySelector('.tt-lbl');
    this.imgs = Array.from(el.querySelectorAll('.tt-stage img'));
    this.eyes = el.querySelector('.tt-eyes');
    this._placeEyes(0);
    // Fade in on the next frame so the transition runs.
    this._later(() => el.classList.add('on'), 30);
  }

  _later(fn, ms) {
    if (typeof setTimeout === 'undefined') return;
    this._timers.push(setTimeout(fn, ms));
  }

  _placeEyes(s) {
    if (!this.eyes) return;
    const e = EYES[s];
    if (!e) { this.eyes.style.display = 'none'; return; }
    this.eyes.style.display = '';
    const [lx, rx, y, tilt] = e;
    const cx = (lx + rx) / 2;
    this.eyes.setAttribute('transform', `rotate(${tilt} ${cx} ${y})`);
    this.eyes.querySelector('.l').setAttribute('transform', `translate(${lx} ${y}) scale(1.18)`);
    this.eyes.querySelector('.r').setAttribute('transform', `translate(${rx} ${y}) scale(1.18)`);
    this.eyes.querySelector('.tt-sweatpos').setAttribute('transform', `translate(${rx + 22} ${y - 22})`);
    // Worry: the brows tilt up in the middle as the damage climbs, and the
    // pupils look down at the crack.
    const worry = [0, 5, 9, 13, 16, 0][s];
    this.eyes.querySelectorAll('.brow').forEach((b) => b.setAttribute('transform', `rotate(${-worry}) translate(0 ${-worry * 0.25})`));
    this.eyes.querySelectorAll('.pupil').forEach((p) => p.setAttribute('cy', String(2.5 + Math.min(5, s * 1.4))));
  }

  /** Show damage state `s` (0..5). Returns true when it changed. */
  set(s) {
    const n = Math.max(0, Math.min(TOOTH_STATES - 1, s | 0));
    if (n === this.state) return false;
    const worse = n > this.state;
    this.state = n;
    if (!this.el) return true;
    this.imgs.forEach((im, i) => im.classList.toggle('cur', i === n));
    this.lbl.textContent = TOOTH_LABELS[n];
    this.lbl.classList.toggle('bad', n >= 3);
    this.el.classList.toggle('pristine', n === 0);
    this.el.classList.toggle('worried', n >= 2 && n < 5);
    this._placeEyes(n);
    if (worse && n === 4) this._tink(0.9, 2);
    return true;
  }

  /** A hit. `force` 0..1 picks the size of the flinch. */
  wince(force = 0.5) {
    this.winces++;
    if (!this.el) return;
    const big = force > 0.45;
    this.stage.classList.remove('wince', 'big');
    void this.stage.offsetWidth; // restart the animation
    this.stage.classList.add(big ? 'big' : 'wince');
    this.el.classList.add('closed');
    this._later(() => this.el && this.el.classList.remove('closed'), big ? 620 : 420);
    this.pop.textContent = POPS[this.winces % POPS.length];
    this.pop.classList.remove('go');
    void this.pop.offsetWidth;
    this.pop.classList.add('go');
    this._tink(force, 1);
  }

  /** Delivered: a little hop, then out. */
  done() {
    if (!this.el) return;
    this.stage.classList.remove('wince', 'big');
    void this.stage.offsetWidth;
    this.stage.classList.add('done');
  }

  // Porcelain on porcelain, plus a tiny squeak for the flinch, through the
  // game's effects bus so the Options volume applies. Silent with no audio.
  _tink(force, kind) {
    const a = this.audio;
    const ctx = a && a.ctx, dest = a && (a.fx || a.master);
    if (!ctx || !dest || !ctx.createOscillator) return;
    try {
      const t = ctx.currentTime;
      const vol = 0.05 + 0.07 * Math.min(1, force);
      for (const [f, d] of [[2630, 0.22], [3950, 0.14], [5210, 0.09]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(f * (kind === 2 ? 0.8 : 1), t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(dest); o.start(t); o.stop(t + d + 0.02);
      }
      // The squeak: a short falling « eek ».
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(kind === 2 ? 1300 : 1000, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(kind === 2 ? 420 : 560, t + 0.2);
      g.gain.setValueAtTime(0.0001, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.04, t + 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(dest); o.start(t + 0.05); o.stop(t + 0.25);
    } catch (e) { /* audio is a nicety */ }
  }

  /**
   * Take it off the screen. `shatter`: the job broke the work, so show the
   * last state with one big flinch for a beat before it goes.
   */
  close(opts = {}) {
    if (this.closing) return;
    this.closing = true;
    const el = this.el;
    if (opts.shatter) { this.set(5); this.wince(1); }
    if (!el) return;
    const hold = opts.shatter ? 2400 : opts.delivered ? 1100 : 0;
    const out = () => {
      el.classList.remove('on');
      if (typeof setTimeout !== 'undefined') setTimeout(() => el.remove(), 400); else el.remove();
    };
    if (hold && typeof setTimeout !== 'undefined') setTimeout(out, hold); else out();
  }
}
