// W8-LIGHTAUTO (Tom's ruling, 27 Oct 2026): « Éclairage avancé » is on by
// default. If the game then runs under 50 fps while actually driving, a small
// card offers to turn it off.
//
//   createFpsWatch()      the rolling frame-time window. Fed once a frame with
//                         the real frame time and whether the player is driving
//                         right now; fires once, with the average fps, when the
//                         last ~8 s of driving averaged under 50 fps.
//   lightPromptSuppressed()  QA and perf never see the card: ?light= (an explicit
//                         choice for the run), ?review= / ?audioReview= or a
//                         tools/ harness frame (storage-ns.js), a driven browser
//                         (navigator.webdriver, HeadlessChrome).
//   lightWatchArmed(s)    only while Advanced lighting is on this session and the
//                         player never said « Garder ».
//   LightPrompt           the card. Two steps: [Désactiver] [Garder], then, after
//                         Désactiver, [Relancer maintenant] [Au prochain lancement].
//                         Keys 1 / 2 (and the numpad), pad LB / RB, or the mouse.
//                         It never takes W A S D, the arrows or Space, and its
//                         buttons never hold focus (Enter and Space stay the game's).
//
// Nothing here allocates per frame: the window is one Float64Array, the card's
// DOM is built the first time it shows.
import { advLight } from './advlight.js';

export const FPS_MIN = 50;      // Tom: "below 50 fps"
export const WINDOW_S = 8;      // that long of driving, averaged
export const GRACE_S = 10;      // nothing counts for this long after control comes back (load, card, menu, bake)
export const HITCH_S = 1;       // a single frame this long is a tab switch or a stall: start over
export const CARD_S = 25;       // an unanswered card folds away after this long on screen

/**
 * The rolling window. `frame(dt, driving)` returns 0, or the average fps the
 * moment it fires (once; then it is spent for the session).
 */
export function createFpsWatch({ fpsMin = FPS_MIN, windowS = WINDOW_S, graceS = GRACE_S, hitchS = HITCH_S, cap = 2048 } = {}) {
  const ring = new Float64Array(cap);
  let tail = 0, count = 0, sum = 0, grace = graceS, fired = false;
  const W = {
    ring,
    get fired() { return fired; },
    get count() { return count; },
    get seconds() { return sum; },
    get grace() { return grace; },
    /** Start over: empty window, full grace (control just came back). */
    reset() { tail = 0; count = 0; sum = 0; grace = graceS; },
    frame(dt, driving) {
      if (fired) return 0;
      if (!driving || !(dt > 0) || dt >= hitchS) { tail = 0; count = 0; sum = 0; grace = graceS; return 0; }
      if (grace > 0) { grace -= dt; return 0; }
      if (count === cap) { sum -= ring[tail]; tail = (tail + 1) % cap; count--; }
      ring[(tail + count) % cap] = dt; count++; sum += dt;
      // Keep just over windowS seconds: drop the oldest while the rest still covers it.
      while (count > 1 && sum - ring[tail] >= windowS) { sum -= ring[tail]; tail = (tail + 1) % cap; count--; }
      if (sum < windowS) return 0;
      const fps = count / sum;
      if (fps < fpsMin) { fired = true; return fps; }
      return 0;
    },
  };
  return W;
}

/** True when the card must never show in this page (QA, perf, harness, rig). */
export function lightPromptSuppressed(env = null) {
  const g = globalThis;
  const e = env || {
    search: (() => { try { return g.location ? g.location.search : ''; } catch { return ''; } })(),
    review: g.AYLMER_STORAGE ? g.AYLMER_STORAGE.review : null,
    webdriver: !!(g.navigator && g.navigator.webdriver),
    ua: (g.navigator && g.navigator.userAgent) || '',
  };
  let q = null;
  try { q = new URLSearchParams(e.search || ''); } catch { q = null; }
  if (q && (q.has('light') || q.has('review') || q.has('audioReview'))) return true;
  if (e.review) return true;
  if (e.webdriver) return true;
  if (/HeadlessChrome/.test(e.ua || '')) return true;
  return false;
}

/** Watch only while the session runs Advanced lighting and the player never said « Garder ». */
export function lightWatchArmed(settings) {
  return advLight() && !(settings && settings.advLightNoAsk === true);
}

// The two settings the card writes (main.js saves them through store.js).
export const lightOffSettings = (s) => ({ ...s, advLight: false, advLightChosen: true });
export const lightKeepSettings = (s) => ({ ...s, advLightNoAsk: true });

// The card's keys. Never a driving key.
export const KEY_FIRST = ['Digit1', 'Numpad1', 'PadLB'];
export const KEY_SECOND = ['Digit2', 'Numpad2', 'PadRB'];

/**
 * The card. ctx:
 *   t(key)          i18n (French by default, English when the game is)
 *   disable()       write advLight false, chosen
 *   keep()          write « never ask again »
 *   relaunch()      autosave then reload; returns false when the save failed
 *   toast(text, ms) the HUD's toast
 *   doc             a document (defaults to the page's; none under node)
 */
export class LightPrompt {
  constructor(ctx = {}) {
    this.ctx = ctx;
    this.step = null;      // null | 'ask' | 'relaunch'
    this.fps = 0;
    this.shownS = 0;
    this.el = null;
    this.visible = false;
  }
  get open() { return this.step !== null; }

  show(fps) {
    if (this.step) return;
    this.fps = Math.round(fps);
    this.step = 'ask';
    this.shownS = 0;
    this.draw();
  }

  /** Once a frame while open: hide it outside driving, fold it after CARD_S on screen. */
  frame(dt, driving) {
    if (!this.step) return;
    this.setVisible(driving);
    if (driving && dt > 0 && dt < HITCH_S) this.shownS += dt;
    if (this.shownS >= CARD_S) this.close();
  }

  /** Read the card's keys (before the game reads its own). Returns true when one acted. */
  keys(input) {
    if (!this.step || !this.visible || !input) return false;
    // Spelled out, not spread from KEY_FIRST / KEY_SECOND: no argument arrays.
    if (input.hit('Digit1', 'Numpad1', 'PadLB')) { input.consume('Digit1', 'Numpad1', 'PadLB'); this.choose(1); return true; }
    if (input.hit('Digit2', 'Numpad2', 'PadRB')) { input.consume('Digit2', 'Numpad2', 'PadRB'); this.choose(2); return true; }
    return false;
  }

  choose(n) {
    const c = this.ctx, t = c.t || ((k) => k);
    if (this.step === 'ask') {
      if (n === 1) { c.disable?.(); this.step = 'relaunch'; this.shownS = 0; this.draw(); return 'disabled'; }
      c.keep?.(); this.close(); return 'kept';
    }
    if (this.step === 'relaunch') {
      this.close();
      if (n === 1) {
        if (c.relaunch?.() === false) { c.toast?.(t('light.nosave'), 3600); return 'nosave'; }
        return 'relaunch';
      }
      c.toast?.(t('light.later.toast'), 2600);
      return 'later';
    }
    return null;
  }

  close() {
    this.step = null;
    this.setVisible(false);
  }

  setVisible(on) {
    on = !!on && !!this.step;
    if (on === this.visible) return;
    this.visible = on;
    if (this.el) this.el.style.display = on ? 'block' : 'none';
  }

  /** The card's words for the current step, in the game's language. */
  message() {
    const t = this.ctx.t || ((k) => k);
    if (this.step === 'ask') {
      return { msg: t('light.slow').replace('{fps}', String(this.fps)),
        first: '1 / LB  ' + t('light.off'), second: '2 / RB  ' + t('light.keep') };
    }
    return { msg: t('light.relaunch'), first: '1 / LB  ' + t('light.now'), second: '2 / RB  ' + t('light.later') };
  }

  draw() {
    const d = this.ctx.doc !== undefined ? this.ctx.doc : (typeof document !== 'undefined' ? document : null);
    if (!d || !d.body) { this.visible = false; this.setVisible(true); return; }   // node: state only
    if (!this.el) {
      const el = d.createElement('div');
      el.id = 'lightprompt';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:60;max-width:min(420px,calc(100vw - 32px));'
        + 'padding:12px 14px;border-radius:8px;background:rgba(18,20,24,.88);color:#f3efe6;font:14px/1.35 system-ui,sans-serif;'
        + 'box-shadow:0 6px 20px rgba(0,0,0,.35);display:none;pointer-events:auto';
      el.innerHTML = '<p data-k="msg" style="margin:0 0 10px"></p><div style="display:flex;gap:8px;flex-wrap:wrap">'
        + '<button type="button" tabindex="-1" data-n="1"></button><button type="button" tabindex="-1" data-n="2"></button></div>';
      for (const b of el.querySelectorAll('button')) {
        b.style.cssText = 'font:inherit;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:inherit;cursor:pointer';
        // A click must never leave focus on the button, or Enter and Space
        // would press it instead of reaching the game (the legend's lesson, UX P3).
        b.addEventListener('pointerdown', (e) => e.preventDefault());
        b.addEventListener('click', () => { b.blur?.(); this.choose(Number(b.dataset.n)); });
      }
      d.body.appendChild(el);
      this.el = el;
    }
    const m = this.message();
    const [b1, b2] = this.el.querySelectorAll('button');
    this.el.querySelector('[data-k="msg"]').textContent = m.msg;
    b1.textContent = m.first;
    b2.textContent = m.second;
    this.visible = false;
    this.setVisible(true);
  }
}
