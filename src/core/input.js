// W3C standard mapping: which pad buttons become which presses (pollPad).
export const PAD_EDGES = [
  [0, 'PadA'], [1, 'PadB'], [2, 'PadX'], [3, 'PadY'], [4, 'PadLB'], [5, 'PadRB'],
  [8, 'PadBack'], [9, 'PadStart'], [12, 'PadUp'], [13, 'PadDown'], [14, 'PadLeft'], [15, 'PadRight'],
];

// Keyboard + gamepad. Analogue-ish steering: keys ramp instead of snapping,
// which is what makes a laptop keyboard feel drivable.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.radioShiftConsumed = false;
    this.shiftPending = false;
    this.steer = 0;      // -1 .. 1  (smoothed)
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.pad = null;
    this.padHorn = false;
    this._rumbleUntil = 0;
    this._padPrev = [];
    // main.js says when the game owns Tab, the arrows and Space. Outside the
    // drive (menus, pause, options) they must keep their browser meaning, or
    // nothing but a mouse can move between buttons (UX review P4).
    this.captureNav = () => true;
    window.addEventListener('keydown', (e) => {
      // Editing library/settings controls must never steer or tune the game.
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable || e.target?.closest?.('[contenteditable="true"]')) return;
      // The legend key is whatever types « ? » (or « / »). On a Canadian
      // French / CSA keyboard the key where a US « / » sits types « é », and
      // « ? » is somewhere else entirely, so the physical code is the wrong
      // question (UX review P6). AltGr arrives as Ctrl+Alt on some systems, so
      // this is read before the modifier bail-out below.
      if (!e.repeat && !e.metaKey && (e.key === '?' || e.key === '/' || e.code === 'NumpadDivide')) this.pressed.add('Legend');
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      this.pressed.add(k);
      if (k === 'ShiftLeft' || k === 'ShiftRight') this.shiftPending = true;
      // Any other key while Shift is down makes it a chord, not a tap: the
      // release must not latch the rear view (UX review J3).
      else if (this.down('ShiftLeft', 'ShiftRight')) this.shiftPending = false;
      if (k === 'KeyR' && (e.shiftKey || this.down('ShiftLeft', 'ShiftRight'))) {
        this.pressed.delete('KeyR'); this.pressed.add('RadioNext');
        this.radioShiftConsumed = true; this.shiftPending = false;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k) && this.captureNav()) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !this.down('ShiftLeft', 'ShiftRight')) {
        if (this.shiftPending && !this.radioShiftConsumed) this.pressed.add('LookBackToggle');
        this.shiftPending = false; this.radioShiftConsumed = false;
      }
    });
    const clear = () => { this.keys.clear(); this.pressed.clear(); this.shiftPending = false; this.radioShiftConsumed = false; };
    window.addEventListener('blur', clear);
    window.addEventListener('focusin', e => { if (['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable || e.target?.closest?.('[contenteditable="true"]')) clear(); });
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  // True once per physical press.
  hit(...codes) {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }
  endFrame() { this.pressed.clear(); }
  /**
   * Swallow a press so a second reader in the same frame never sees it. The
   * pause menu closes itself from a DOM keydown listener; without this the
   * drive loop's handleKeys() picks up the SAME Escape on the next frame and
   * re-opens the menu, which is why Esc used to refuse to resume the game.
   */
  consume(...codes) { for (const c of codes) this.pressed.delete(c); }

  /**
   * D6 — a thump through the pad on impact. `force` is 0..1; the call is a
   * no-op on a pad (or a browser) without an actuator, and overlapping calls
   * are dropped so a scrape along a wall doesn't queue up a hundred effects.
   */
  rumble(force, ms = 180) {
    const p = this.pad;
    if (!p || !(force > 0.05)) return;
    const act = p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0]);
    if (!act || !act.playEffect) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now < this._rumbleUntil) return;
    this._rumbleUntil = now + ms * 0.6;
    const f = Math.min(1, force);
    try {
      act.playEffect('dual-rumble', {
        startDelay: 0, duration: ms,
        strongMagnitude: f, weakMagnitude: Math.min(1, f * 1.3),
      });
    } catch (e) { /* older pads only know 'vibration' */ }
  }

  /**
   * Gamepad button EDGES as presses, once a frame, in every mode (UX review
   * P5). A pad could drive but not dismiss the opening card, take a job, pause
   * or open the map, because the pad was only read inside update(), which only
   * runs while driving. Presses land in `pressed` under their own names so a
   * pad can never be mistaken for the keyboard key it stands in for:
   *   PadA PadB PadX PadY PadLB PadRB PadBack PadStart PadUp PadDown PadLeft PadRight
   */
  pollPad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let p = null;
    for (const q of pads || []) if (q && q.connected) { p = q; break; }
    this.pad = p;
    if (!p) { this._padPrev.length = 0; return null; }
    for (const [i, name] of PAD_EDGES) {
      const on = !!(p.buttons[i] && p.buttons[i].pressed);
      if (on && !this._padPrev[i]) this.pressed.add(name);
      this._padPrev[i] = on;
    }
    return p;
  }

  update(dt) {
    let sx = 0, th = 0, br = 0, hb = false;
    if (this.down('KeyA', 'ArrowLeft')) sx -= 1;
    if (this.down('KeyD', 'ArrowRight')) sx += 1;
    if (this.down('KeyW', 'ArrowUp')) th = 1;
    if (this.down('KeyS', 'ArrowDown')) br = 1;
    if (this.down('Space')) hb = true;

    // D6 — the W3C "standard" mapping, which is what Chrome reports for both an
    // Xbox pad and a DualShock/DualSense: axes[0] is the left stick's X, the
    // triggers are analogue buttons 6 (L2/LT) and 7 (R2/RT), button 0 is A/✕,
    // and 12–15 are the d-pad. Anything Chrome can't identify comes through
    // with mapping === '' and the triggers on axes instead, so fall back to
    // axes[2]/[3] (and the shoulder buttons) rather than going dead.
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.pad = null;
    this.padHorn = false;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      this.pad = p;
      const dead = (v) => (Math.abs(v) > 0.14 ? (v - Math.sign(v) * 0.14) / 0.86 : 0);
      const ax = dead(p.axes[0] || 0);
      if (ax !== 0) sx = ax;
      const btn = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const held = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      let rt = btn(7), lt = btn(6);
      if (p.mapping !== 'standard' && p.buttons.length < 7) {
        // Trigger axes rest at -1 and travel to +1.
        // `??`, not `||`: a half-pressed trigger reads exactly 0 (UX P12).
        rt = Math.max(0, ((p.axes[3] ?? -1) + 1) / 2);
        lt = Math.max(0, ((p.axes[2] ?? -1) + 1) / 2);
      }
      if (rt > 0.06) th = rt;
      if (lt > 0.06) br = lt;
      if (held(0)) hb = true;                       // A / ✕
      if (held(12)) th = 1;                          // d-pad up / down still drive
      if (held(13)) br = 1;
      if (held(14)) sx = -1;
      if (held(15)) sx = 1;
      this.padHorn = held(1) || held(2);             // B/○ or X/□
      break;
    }

    // Ramp steering toward the target; snap back to centre faster than away from it.
    const toward = Math.sign(sx) !== Math.sign(this.steer) || sx === 0;
    const rate = toward ? 7.5 : 4.2;
    this.steer += (sx - this.steer) * Math.min(1, rate * dt);
    if (Math.abs(this.steer) < 0.002) this.steer = 0;
    this.throttle = th;
    this.brake = br;
    this.handbrake = hb;
  }
}
