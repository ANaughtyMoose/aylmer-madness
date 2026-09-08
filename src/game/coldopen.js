// The cold open: the first eight seconds of a new summer, in the world.
//
// What was here before was a modal. Five cards of prose over a black panel, E
// to turn the page, and the HUD switched off behind it (U7) — so the first
// thing a new player did was READ, with the game paused underneath, and the
// first thing he saw of Aylmer was a wall of text about it. Thomas asked for
// the opposite: « make it feel like GTA a bit ». A GTA cold open never stops
// the world. The car is already running, the camera is already moving, and
// somebody is already talking to you about the thing you are about to do.
//
// So: the Ranger is in the driveway at 299 Chemin Fraser with the engine
// idling, the camera swings slowly around it for eight seconds, and the four
// lines that used to be five cards arrive as speech bubbles in his father's
// voice — ending on the alternator, which is the first job. The player can
// drive out of the shot at any moment; touching a driving key ends the
// cinematic on that same frame, Escape drops the rest of the lines, and if he
// touches nothing control comes back on its own at HOLD seconds.
//
// HOW THE CAMERA IS MOVED, and why it is done this way: main.js's chase camera
// follows `G.focus || G.veh` and eases its yaw toward `focus.yaw + PI`. That is
// all an orbit needs. This module points G.focus at a proxy object that sits
// exactly where the truck sits and whose `yaw` turns at ORBIT rad/s, so the
// boom swings around a stationary car with the camera's own spring providing
// the lag. Not one line of the chase-camera block is touched: the jitter agent
// owns those, and a cinematic that needs its own camera code is a cinematic
// that will break the next time somebody tunes the boom.
//
// The other half of the trick is `G.cam`: the establishing shot borrows the
// `far` camera (14.5 m out, 6.4 m up) for the length of the open and puts back
// whatever the player had. Both are restored by end(), which is idempotent and
// is also what G.story.hide() calls, because tools/headless.mjs and half the
// other agents' page scripts dismiss the opener that way and must keep landing
// in a drivable game.

// Roughly 20 degrees a second: a full quarter turn in the time it takes to say
// two lines. Faster than this reads as a menu attract mode.
export const ORBIT = 0.35;
// Control comes back here whether or not the player has touched anything.
export const HOLD = 8.0;
// The date slate, GTA's establishing caption. Up early, gone before the last line.
export const SLATE_IN = 0.5, SLATE_OUT = 4.6;

/**
 * The four lines, and when each one lands. Same facts as STORY_CARDS in
 * story.js — seventeen, Aylmer, the Ranger, the envelope, the alternator — said
 * out loud instead of written down, and in the order that puts the objective
 * last so it is the sentence still on screen when you get the wheel.
 *
 * `at` is seconds from the start, `ms` is how long the bubble stays up.
 */
export const COLD_OPEN = [
  {
    at: 0.9, who: 'Ton père', ms: 3200,
    text: '« Les clés sont dans le plat à monnaie. Le truck est à toi jusqu’en septembre. »',
  },
  {
    at: 3.0, who: 'Ton père', ms: 3200,
    text: '« Ton gaz pis tes réparations, c’est de ta poche. Discute pas. »',
  },
  {
    at: 5.0, who: 'Ton père', ms: 3600,
    text: '« Pis l’enveloppe brune su’a table: 1 200 $ avant la fête du Travail, sinon le Ranger part en échange. »',
  },
  // The errand that came with the keys. It is the last thing said on purpose:
  // when the camera hands the truck back, the objective is the sentence still
  // hanging over the hood. Same wording as FRIEND_LINES.alternateur in story.js.
  {
    at: 7.4, who: 'Ton père', ms: 4200,
    text: '« La lumière de batterie clignote depuis mardi. L’alternateur est payé, il t’attend au comptoir du Canadian Tire. »',
  },
];

// The caption. Two lines, lower left, the way a place and a date are stamped on
// the screen the first time you see a town.
export const SLATE = ['AYLMER, QUÉBEC', 'samedi 26 juin 2004'];

/**
 * One cold open. Everything it owns it puts back: G.focus, G.cam, its own DOM.
 *
 * ctx = { G, heckle, onDone } — `heckle.line(who, text, ms)` is the bubble, and
 * `onDone` is the same callback StoryOpener.show() took, so main.js's waypoint
 * drop did not have to move.
 */
export class ColdOpen {
  constructor() {
    this.active = false;
    this.t = 0;
    this.G = null;
    this.heckle = null;
    this.onDone = null;
    this.said = 0;          // how many lines have gone out
    this.lines = COLD_OPEN;
    this.proxy = null;      // what the camera orbits
    this.prevCam = null;    // the camera the player had
    this.prevFocus = null;
    this.slate = undefined; // the caption element, built lazily
  }

  /**
   * Start it. Returns false — having changed nothing — when there is no car to
   * orbit, which is how main.js knows to fall back to the old cards.
   */
  play({ G, heckle, cams = null, onDone = null } = {}) {
    const v = G && (G.veh || null);
    if (!v) return false;
    this.end(true);
    this.G = G;
    this.heckle = heckle || null;
    this.onDone = onDone;
    this.t = 0;
    this.said = 0;
    this.active = true;
    // The proxy the chase camera follows: the truck's position, a turning yaw.
    this.proxy = {
      x: v.x, z: v.z, yaw: v.yaw, pitch: 0, bodyY: v.bodyY || 0,
      vLong: 0, vLat: 0, inAir: false, reversing: false, spec: v.spec,
    };
    this.prevFocus = G.focus || null;
    G.focus = this.proxy;
    // Borrow the wide camera for the establishing shot, if the caller told us
    // where it is. No CAMS import here: cockpit.js owns that list.
    if (cams && Array.isArray(cams)) {
      const i = cams.findIndex((c) => c && c.name === 'far');
      if (i >= 0) { this.prevCam = G.cam; G.cam = i; }
    }
    this._paintSlate(0);
    return true;
  }

  /**
   * One tick, from the same clock the game runs on. Fires each line as its
   * moment arrives and hands the truck back at HOLD.
   */
  update(dt) {
    if (!this.active) return;
    const d = Number.isFinite(dt) ? dt : 0;
    this.t += d;
    const G = this.G, v = G && G.veh;
    if (this.proxy && v) {
      // The car may have been settled onto the driveway a frame late (or the
      // player may already be rolling): follow it rather than a stale point.
      this.proxy.x = v.x; this.proxy.z = v.z; this.proxy.bodyY = v.bodyY || 0;
      this.proxy.yaw += ORBIT * d;
    }
    while (this.said < this.lines.length && this.t >= this.lines[this.said].at) {
      const l = this.lines[this.said++];
      if (this.heckle && this.heckle.line) this.heckle.line(l.who, l.text, l.ms);
    }
    this._paintSlate(this.t);
    if (this.t >= HOLD) this.end();
  }

  /**
   * Escape, or a hand on the wheel. The remaining lines are dropped — they are
   * a cutscene, and skipping a cutscene means skipping it — but the game is not
   * touched: you are already driving.
   */
  skip() { return this.end(); }

  /**
   * Put everything back. `quiet` suppresses the callback, which is what
   * G.story.hide() wants: the harness is dismissing the intro, not finishing it.
   * Safe to call on an open that never started.
   */
  end(quiet = false) {
    if (!this.active) { this._paintSlate(1e9); return false; }
    this.active = false;
    const G = this.G;
    if (G) {
      if (G.focus === this.proxy) G.focus = this.prevFocus || null;
      if (this.prevCam != null) G.cam = this.prevCam;
    }
    this.prevCam = null;
    this.proxy = null;
    this._paintSlate(1e9);
    const fn = this.onDone;
    this.onDone = null;
    if (fn && !quiet) fn();
    return true;
  }

  // ---- the caption -------------------------------------------------------

  _mountSlate() {
    if (this.slate !== undefined) return this.slate;
    this.slate = null;
    if (typeof document === 'undefined' || !document.createElement || !document.body) return null;
    const el = document.createElement('div');
    el.id = 'coldslate';
    el.style.cssText = 'position:fixed;left:34px;bottom:16%;z-index:7;pointer-events:none;'
      + 'color:#f4f6f7;font:700 13px/1.3 Helvetica,Arial,sans-serif;letter-spacing:3px;'
      + 'text-transform:uppercase;text-shadow:0 2px 14px rgba(0,0,0,.9);opacity:0;'
      + 'transition:opacity .5s ease';
    const a = document.createElement('div');
    a.textContent = SLATE[0];
    a.style.cssText = 'font-size:27px;letter-spacing:5px';
    const b = document.createElement('div');
    b.textContent = SLATE[1];
    b.style.cssText = 'margin-top:5px;opacity:.7;letter-spacing:2.6px';
    el.appendChild(a);
    el.appendChild(b);
    document.body.appendChild(el);
    this.slate = el;
    return el;
  }

  _paintSlate(t) {
    const el = this._mountSlate();
    if (!el) return;
    const on = this.active && t >= SLATE_IN && t < SLATE_OUT;
    el.style.opacity = on ? '1' : '0';
  }
}

export const coldOpen = new ColdOpen();
export default coldOpen;
