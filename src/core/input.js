// Keyboard + gamepad. Analogue-ish steering: keys ramp instead of snapping,
// which is what makes a laptop keyboard feel drivable.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.steer = 0;      // -1 .. 1  (smoothed)
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      this.pressed.add(k);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  // True once per physical press.
  hit(...codes) {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }
  endFrame() { this.pressed.clear(); }

  update(dt) {
    let sx = 0, th = 0, br = 0, hb = false;
    if (this.down('KeyA', 'ArrowLeft')) sx -= 1;
    if (this.down('KeyD', 'ArrowRight')) sx += 1;
    if (this.down('KeyW', 'ArrowUp')) th = 1;
    if (this.down('KeyS', 'ArrowDown')) br = 1;
    if (this.down('Space')) hb = true;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) sx = ax;
      const rt = p.buttons[7] ? p.buttons[7].value : 0;
      const lt = p.buttons[6] ? p.buttons[6].value : 0;
      if (rt > 0.05) th = rt;
      if (lt > 0.05) br = lt;
      if (p.buttons[0] && p.buttons[0].pressed) hb = true;
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
