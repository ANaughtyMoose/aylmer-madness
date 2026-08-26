// Your wallet. Eighty dollars of cut lawns, kept in localStorage so it survives
// a reload the way the mission progress does.
const KEY = 'aylmer.money';
export const START = 80;

function store() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function loadMoney() {
  try {
    const raw = store()?.getItem(KEY);
    const v = raw == null ? NaN : Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : START;
  } catch { return START; }
}

export function saveMoney(v) {
  try { store()?.setItem(KEY, String(v)); } catch { /* private mode */ }
  return v;
}

export class Wallet {
  constructor(el) {
    this.el = el || null;
    this.value = loadMoney();
    this.render();
  }

  bind(el) { this.el = el; this.render(); return this; }

  can(cost) { return this.value >= cost; }

  spend(cost) {
    if (!this.can(cost)) return false;
    this.value -= cost;
    saveMoney(this.value);
    this.render();
    return true;
  }

  add(amount) {
    this.value = Math.max(0, this.value + amount);
    saveMoney(this.value);
    this.render();
    return this.value;
  }

  set(v) { this.value = Math.max(0, v); saveMoney(this.value); this.render(); return this.value; }

  render() {
    if (this.el) this.el.textContent = '$' + Math.round(this.value);
    return this;
  }
}
