// « Job faite » — the beat at the end of an errand.
//
// What was here was a toast. Four lines of text in the same grey box the game
// uses for a weather change, up for four and a half seconds, saying FINI, the
// clock, the record, the style bonus and 7/29. It was a receipt. Nothing about
// it said that the money had gone anywhere, that a day had gone by, or that
// anybody was pleased.
//
// This is the same information as a moment: a strip under the envelope on the
// right, the pay lifting off it and sliding up INTO the envelope, and the date
// with how many days are left underneath — because the envelope and the
// calendar are the two things the whole summer is about and the end of a job is
// the one second when both of them move. A second and a half. No card, no
// modal, no pause (U7); you can be driving away the whole time, and you usually
// are, because the next call comes in while this is still on screen.
//
// The friend's own end line still comes out of story.js as a bubble
// (main.js's sayFriend), and the horn is whatever you just got the keys to.

// How long the strip holds before it starts to go.
export const HOLD_S = 1.6;
export const FADE_S = 0.35;

const fmtTime = (s) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m + ':' + String(r).padStart(2, '0');
};

/**
 * One per page. main.js calls play() from the mission-complete path and
 * update() from the tick.
 */
export class Passed {
  constructor() {
    this.root = undefined;
    this.el = {};
    this.left = 0;
    this.audio = null;
  }

  bind(audio = null) { this.audio = audio || null; return this; }

  /**
   * The beat.
   *
   *   title    the job
   *   paid     dollars that just went in the envelope (m.paid + the style bonus)
   *   elapsed  how long it took, and `record` if it was your best
   *   day      the two lines calendar.envelopeText() prints, so the strip and
   *            the envelope above it are saying the same thing
   *   hornOf   the spec of the car you were just handed the keys to, or null
   */
  play({ title, paid = 0, elapsed = 0, record = false, best = null, day = '', done = 0, total = 0, hornOf = null } = {}) {
    this.left = HOLD_S + FADE_S;
    this._paint({ title, paid, elapsed, record, best, day, done, total });
    this._horn(hornOf);
    return true;
  }

  update(dt) {
    if (this.left <= 0) return;
    this.left -= Number.isFinite(dt) ? dt : 0;
    const el = this._mount();
    if (!el) return;
    if (this.left <= 0) { el.style.opacity = '0'; el.style.transform = 'translateY(-6px)'; return; }
    if (this.left <= FADE_S) { el.style.opacity = '0'; el.style.transform = 'translateY(-6px)'; }
  }

  /** Is it on screen? (the tests, and anything that wants to not talk over it) */
  get showing() { return this.left > 0; }

  hide() { this.left = 0; const el = this._mount(); if (el) el.style.opacity = '0'; }

  // The horn of whatever you just unlocked. cars.js gives the golf cart a bike
  // bell through the same field; everything else takes the default two-saw
  // horn, which is what audio.honk() already is.
  _horn(spec) {
    const a = this.audio;
    if (!a || !a.honk) return;
    const h = spec && spec.sound && spec.sound.horn;
    try { a.honk((h && h.f) || 330, 0.5, 0.07); } catch { /* muted */ }
  }

  // ---- the strip ---------------------------------------------------------
  //
  // Built here, not in index.html: five agents are editing that file and
  // style.css this wave and nothing else has to know this element exists.

  _mount() {
    if (this.root !== undefined) return this.root;
    this.root = null;
    if (typeof document === 'undefined' || !document.createElement || !document.body) return null;
    const el = document.createElement('div');
    el.id = 'passed';
    // Directly under #envelope (right:22px, top:18px), which is where the money
    // is going.
    el.style.cssText = 'position:fixed;right:22px;top:82px;z-index:8;pointer-events:none;'
      + 'text-align:right;opacity:0;transform:translateY(-6px);'
      + 'transition:opacity .22s ease,transform .22s ease;'
      + 'font:13px/1.35 Helvetica,Arial,sans-serif;color:#f3f5f6;'
      + 'text-shadow:0 2px 10px rgba(0,0,0,.85)';
    const cap = document.createElement('div');
    cap.textContent = 'Job faite';
    cap.style.cssText = 'font-size:10px;letter-spacing:3px;text-transform:uppercase;opacity:.6';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:19px;font-weight:800;letter-spacing:.3px;margin-top:2px';
    const pay = document.createElement('div');
    pay.style.cssText = 'font-size:22px;font-weight:800;color:#f2d98c;margin-top:3px;'
      + 'font-variant-numeric:tabular-nums';
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:11.5px;opacity:.72;margin-top:3px;letter-spacing:.3px';
    const day = document.createElement('div');
    day.style.cssText = 'font-size:11.5px;opacity:.6;margin-top:1px;letter-spacing:.3px';
    el.appendChild(cap); el.appendChild(title); el.appendChild(pay);
    el.appendChild(meta); el.appendChild(day);
    document.body.appendChild(el);
    this.el = { title, pay, meta, day };
    this.root = el;
    return el;
  }

  _paint(d) {
    const el = this._mount();
    if (!el) return;
    this.el.title.textContent = d.title || '';
    this.el.pay.textContent = d.paid > 0 ? '+ ' + Math.round(d.paid) + ' $' : '';
    this.el.meta.textContent = fmtTime(d.elapsed)
      + (d.record ? '  ·  nouveau record' : (d.best != null ? '  ·  record ' + fmtTime(d.best) : ''))
      + (d.total ? '  ·  ' + d.done + '/' + d.total : '');
    this.el.day.textContent = d.day || '';
    // Reset, then run: the pay lifts off the strip and slides up into the
    // envelope sitting right above it.
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    this.el.pay.style.transition = 'none';
    this.el.pay.style.transform = 'translateY(0)';
    this.el.pay.style.opacity = '1';
    // Two frames, so the browser actually sees the reset before the transition.
    const go = () => {
      el.style.transition = 'opacity .22s ease,transform .22s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      if (d.paid > 0) {
        this.el.pay.style.transition = 'transform 1.1s cubic-bezier(.3,.7,.3,1),opacity 1.1s ease .35s';
        this.el.pay.style.transform = 'translateY(-58px)';
        this.el.pay.style.opacity = '0';
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(go));
    else go();
  }
}

export const passed = new Passed();
export default passed;
