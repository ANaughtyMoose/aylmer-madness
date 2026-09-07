// Your wallet. Eighty dollars of cut lawns.
//
// It used to persist itself to localStorage['aylmer.money'], independently of
// the save slots, which meant the number on screen came from somewhere no save
// could see: load a slot holding $410 and the HUD showed whatever the previous
// session had left in the loose key. The slot is the only truth now (save.js
// carries `money`, and its migration deletes the old key), so this class keeps
// no storage of its own — enterDrive sets the value at boot and that is that.
export const START = 80;

export class Wallet {
  // `onChange(value, delta)` fires after every movement, for anything that has
  // to redraw when the money does — the envelope meter wants it.
  constructor(el, onChange = null) {
    this.el = el || null;
    this.onChange = onChange || null;
    this.value = START;
    this.render();
  }

  bind(el) { this.el = el; this.render(); return this; }

  can(cost) { return this.value >= cost; }

  spend(cost) {
    if (!this.can(cost)) return false;
    this.value -= cost;
    this.render();
    this.#changed(-cost);
    return true;
  }

  add(amount) {
    const before = this.value;
    this.value = Math.max(0, this.value + amount);
    this.render();
    this.#changed(this.value - before);
    return this.value;
  }

  set(v) {
    const before = this.value;
    this.value = Math.max(0, v);
    this.render();
    this.#changed(this.value - before);
    return this.value;
  }

  render() {
    if (this.el) this.el.textContent = '$' + Math.round(this.value);
    return this;
  }

  // A listener that throws must not swallow a payout the player has earned.
  #changed(delta) {
    if (!this.onChange) return;
    try { this.onChange(this.value, delta); } catch (e) { console.warn('wallet onChange', e); }
  }
}
