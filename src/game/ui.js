// Chrome that is not the HUD: the always-on key legend, the first-drive
// tutorial, the pause tabs (jobs / controls / settings), the loading screen and
// the mission intro card. All plain DOM — no framework, no templating.

import { t, KEYMAP, languages } from './i18n.js';
import { MAP } from './mapdata.js';
import { KEYS, readFlag, writeFlag } from './store.js';
import { fmtWhen, fmtPlaytime, carName } from './save.js';

const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- legend

// Bottom-right, two columns, always there. `?` folds it down to one pill.
export class Legend {
  constructor() {
    this.root = $('legend');
    this.head = $('legendhead');
    this.rows = $('legendrows');
    // Absent means "never touched it": a fresh player gets the full list.
    this.open = legendOpenPref();
    if (this.head) this.head.onclick = () => this.toggle();
    this.render();
  }

  toggle() {
    this.open = !this.open;
    writeFlag(KEYS.legend, this.open);
    this.render();
  }

  // Rebuild after a language change.
  render() {
    if (!this.root) return;
    this.root.classList.toggle('collapsed', !this.open);
    if (this.head) this.head.textContent = this.open ? t('k.title') + '   ' + t('k.hide') : t('k.show');
    if (!this.rows) return;
    this.rows.innerHTML = KEYMAP.map((k) =>
      `<div class="lrow">${k.caps.map((c) => `<kbd>${esc(c)}</kbd>`).join('')}` +
      (k.alt ? `<span class="alt">${esc(k.alt)}</span>` : '') +
      `<span class="lab">${esc(t(k.label))}</span></div>`).join('');
  }
}

function legendOpenPref() {
  try {
    const v = globalThis.localStorage?.getItem(KEYS.legend);
    return v === null || v === undefined ? true : v === '1';
  } catch { return true; }
}

// ---------------------------------------------------------------- tutorial

// Fires once ever (localStorage), and each step waits for the player to
// actually do the thing before moving on.
const STEPS = [
  { cap: 'W', key: 'tut.go', done: (c) => c.speedKmh > 12 },
  { cap: 'A / D', key: 'tut.steer', done: (c) => Math.abs(c.steer) > 0.35 },
  { cap: 'S', key: 'tut.brake', done: (c) => c.brake > 0.5 && c.speedKmh > 6 },
  { cap: 'Espace', key: 'tut.hand', done: (c) => c.handbrake && c.speedKmh > 12 },
  { cap: 'Tab', key: 'tut.map', done: (c) => c.mapOpened },
  { cap: 'E', key: 'tut.job', done: (c) => c.jobTaken },
];

export class Tutorial {
  constructor() {
    this.root = $('tuto');
    this.elCap = this.root && this.root.querySelector('.cap');
    this.elTxt = this.root && this.root.querySelector('.txt');
    this.i = 0;
    this.hold = 0;          // seconds left of the green "done" flash
    this.finished = readFlag(KEYS.tutorial);
    this.wait = 1.2;        // let the opening toast breathe first
    this.render();
  }

  reset() {
    this.finished = false; this.i = 0; this.hold = 0; this.wait = 1.2;
    writeFlag(KEYS.tutorial, false);
    this.render();
  }

  update(dt, ctx) {
    if (this.finished) return;
    if (this.wait > 0) { this.wait -= dt; if (this.wait > 0) return; this.render(); }
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) {
        this.i++;
        if (this.i >= STEPS.length) { this.finish(); return; }
        this.render();
      }
      return;
    }
    const step = STEPS[this.i];
    if (step && step.done(ctx)) { this.hold = 0.9; this.render(true); }
  }

  finish() {
    this.finished = true;
    writeFlag(KEYS.tutorial, true);
    if (this.elCap) this.elCap.textContent = '✓';
    if (this.elTxt) this.elTxt.textContent = t('tut.done');
    if (this.root) {
      this.root.classList.remove('hidden');
      this.root.classList.add('ok');
      setTimeout(() => this.root && this.root.classList.add('hidden'), 2600);
    }
  }

  render(ok = false) {
    if (!this.root) return;
    if (this.finished || this.wait > 0) { this.root.classList.add('hidden'); return; }
    const step = STEPS[this.i];
    if (!step) { this.root.classList.add('hidden'); return; }
    this.root.classList.remove('hidden');
    this.root.classList.toggle('ok', ok);
    if (this.elCap) this.elCap.textContent = ok ? '✓' : step.cap;
    if (this.elTxt) this.elTxt.textContent = t(step.key);
  }
}

// ---------------------------------------------------------------- pause tabs

// A drawn keyboard: every cap the game uses is lit, the rest are there so it
// reads as a keyboard and not as a list.
const ROWS = [
  ['Esc*', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0*', '−*', '+*', '⌫*'],
  ['Tab*', 'Q*', 'W*', 'E*', 'R*', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A*', 'S*', 'D*', 'F', 'G', 'H*', 'J', 'K', 'L', '?*'],
  ['Shift*', 'Z', 'X', 'C*', 'V', 'B', 'N*', 'M'],
  ['Espace*'],
];

export function keyboardHTML() {
  const rows = ROWS.map((row, ri) => {
    const caps = row.map((c) => {
      const used = c.endsWith('*');
      const lab = used ? c.slice(0, -1) : c;
      const wide = lab === 'Espace' ? ' wide' : (lab === 'Shift' || lab === 'Tab' || lab === '⌫' ? ' wide1' : '');
      return `<kbd class="${used ? 'used' : ''}${wide}">${esc(lab)}</kbd>`;
    }).join('');
    return `<div class="krow r${ri}">${caps}</div>`;
  }).join('');
  const list = KEYMAP.map((k) =>
    `<div class="lrow">${k.caps.map((c) => `<kbd>${esc(c)}</kbd>`).join('')}` +
    (k.alt ? `<span class="alt">${esc(k.alt)}</span>` : '') +
    `<span class="lab">${esc(t(k.label))}</span></div>`).join('');
  return `<div class="kbd">${rows}</div><div class="keylist">${list}</div>` +
    `<p class="hint">${esc(t('k.pad'))}</p>`;
}

// ---------------------------------------------------------------- save slots

// Three slots plus the autosave, drawn the same way in the pause menu (where
// you can write into them) and on the main menu's Charger screen (where you
// can only read and delete). `rows` is save.js's listSlots().
//
// Deleting asks a second time on the button itself: no window.confirm anywhere
// in this game — a modal dialog freezes the headless harness.
export function slotsHTML(rows, mode = 'load') {
  const cells = rows.map((r) => {
    const auto = r.slot === 'auto';
    const title = auto ? t('save.autoslot') : t('save.slot') + ' ' + r.slot;
    if (r.empty) {
      return `<div class="slot empty" data-slot="${esc(r.slot)}">` +
        `<div class="sname">${esc(title)}</div>` +
        `<div class="smeta">${esc(t('save.empty'))}</div>` +
        (mode === 'save' && !auto
          ? `<div class="sbtns"><button class="saveslot" data-slot="${esc(r.slot)}">${esc(t('save.saveto'))}</button></div>`
          : '<div class="sbtns"></div>') +
        `</div>`;
    }
    const meta = [
      r.name ? esc(r.name) : '',
      esc(fmtWhen(r.savedAt)),
      esc(carName(r.carId)),
      '$' + Math.round(r.money),
      r.jobs + ' ' + esc(t('save.jobs')),
      esc(fmtPlaytime(r.playtime)) + ' ' + esc(t('save.playtime')),
    ].filter(Boolean).join(' · ');
    const btns = [
      mode === 'save' && !auto
        ? `<button class="saveslot" data-slot="${esc(r.slot)}">${esc(t('save.saveto'))}</button>` : '',
      `<button class="loadslot" data-slot="${esc(r.slot)}">${esc(t('save.load'))}</button>`,
      `<button class="delslot danger" data-slot="${esc(r.slot)}">${esc(t('save.delete'))}</button>`,
    ].join('');
    return `<div class="slot" data-slot="${esc(r.slot)}">` +
      `<div class="sname">${esc(title)}</div>` +
      `<div class="smeta">${meta}</div><div class="sbtns">${btns}</div></div>`;
  }).join('');
  const empty = rows.every((r) => r.empty) && mode !== 'save';
  return `<div class="slots">${cells}</div>` +
    `<p class="hint">${esc(empty ? t('save.none') : t('save.hint'))}</p>`;
}

// `handlers` = { save(slot), load(slot), del(slot) }. Delete arms first.
export function wireSlots(root, handlers = {}) {
  if (!root || !root.querySelectorAll) return;
  const bind = (sel, fn) => {
    for (const b of root.querySelectorAll(sel)) b.onclick = () => fn(b.dataset.slot);
  };
  bind('button.saveslot', (s) => handlers.save?.(s));
  bind('button.loadslot', (s) => handlers.load?.(s));
  for (const b of root.querySelectorAll('button.delslot')) {
    const label = b.textContent;
    let armed = false, timer = 0;
    b.onclick = () => {
      if (!armed) {
        armed = true;
        b.textContent = t('opt.confirm');
        b.classList.add('armed');
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { armed = false; b.textContent = label; b.classList.remove('armed'); }, 4000);
        return;
      }
      armed = false;
      if (timer) { clearTimeout(timer); timer = 0; }
      handlers.del?.(b.dataset.slot);
    };
  }
}

// ---------------------------------------------------------------- loading

export class Loading {
  constructor() {
    this.root = $('loading');
    this.elTitle = this.root && this.root.querySelector('.ltitle');
    this.elStage = this.root && this.root.querySelector('.lstage');
  }

  show() {
    if (!this.root) return;
    if (this.elTitle) this.elTitle.textContent = t('load.title');
    this.root.classList.remove('hidden');
  }

  stage(text) { if (this.elStage) this.elStage.textContent = text; }

  hide() { if (this.root) this.root.classList.add('hidden'); }

  // Run [label, fn] pairs with a paint between each, so the label the player
  // sees is the work actually happening. A stage that returns a promise (the
  // material atlas has to come off the network) holds the bar until it settles,
  // so the label is still telling the truth. Returns a promise.
  run(stages) {
    this.show();
    return new Promise((resolve, reject) => {
      let i = 0;
      const fail = (e) => { this.hide(); reject(e); };
      const next = () => {
        if (i >= stages.length) { this.hide(); resolve(); return; }
        const [label, fn] = stages[i++];
        this.stage(label);
        // Two frames: one to lay the label out, one to paint it.
        raf(() => raf(() => {
          let out;
          try { out = fn(); } catch (e) { fail(e); return; }
          if (out && typeof out.then === 'function') out.then(() => next(), fail);
          else next();
        }));
      };
      next();
    });
  }
}

const raf = (fn) => (typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame(fn) : setTimeout(fn, 16));

// ---------------------------------------------------------------- intro card

// Two seconds of "here is the job and here is roughly where you're going",
// north-up, before the clock starts.
export class IntroCard {
  constructor() {
    this.root = $('intro');
    this.elTitle = this.root && this.root.querySelector('.ititle');
    this.elBrief = this.root && this.root.querySelector('.ibrief');
    this.elTime = this.root && this.root.querySelector('.itime');
    this.canvas = this.root && this.root.querySelector('.iroute');
    this.ctx = this.canvas && this.canvas.getContext ? this.canvas.getContext('2d') : null;
    this._hide = 0;
  }

  show({ title, brief, time, route, from, to }, seconds = 2) {
    if (!this.root) return;
    if (this.elTitle) this.elTitle.textContent = title || '';
    if (this.elBrief) this.elBrief.textContent = brief || '';
    if (this.elTime) {
      this.elTime.textContent = time != null
        ? t('intro.time') + ' · ' + Math.floor(time / 60) + ':' + String(Math.floor(time % 60)).padStart(2, '0')
        : t('intro.notime');
    }
    this._drawRoute(route, from, to);
    this.root.classList.remove('hidden');
    if (this._hide) clearTimeout(this._hide);
    this._hide = setTimeout(() => { this.hide(); }, seconds * 1000);
  }

  hide() {
    if (this._hide) { clearTimeout(this._hide); this._hide = 0; }
    if (this.root) this.root.classList.add('hidden');
  }

  // Same idea as bigmap: streets in the route's bounding box, north-up.
  _drawRoute(route, from, to) {
    const g = this.ctx;
    if (!g || !this.canvas) return;
    const W = this.canvas.width, H = this.canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#111a15';
    g.fillRect(0, 0, W, H);

    const pts = [];
    if (route && route.length) for (const p of route) pts.push(p);
    if (from) pts.push([from.x, from.z]);
    if (to) pts.push([to.x, to.z]);
    if (!pts.length) return;

    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
    }
    const pad = Math.max(160, (x1 - x0) * 0.12, (z1 - z0) * 0.12);
    x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
    const sc = Math.min(W / (x1 - x0 || 1), H / (z1 - z0 || 1));
    const ox = (W - (x1 - x0) * sc) / 2, oz = (H - (z1 - z0) * sc) / 2;
    const sx = (x) => ox + (x - x0) * sc;
    const sy = (z) => oz + (z - z0) * sc;

    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of MAP.roads) {
      if (r.cls === 'service') continue;
      const p = r.pts;
      if (!p || p.length < 2) continue;
      // Cheap reject on the first point's neighbourhood.
      let hit = false;
      for (let i = 0; i < p.length; i++) {
        if (p[i][0] >= x0 && p[i][0] <= x1 && p[i][1] >= z0 && p[i][1] <= z1) { hit = true; break; }
      }
      if (!hit) continue;
      const major = r.cls === 'trunk' || r.cls === 'primary' || r.cls === 'secondary';
      g.strokeStyle = major ? '#6f6f7b' : '#454550';
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(sx(p[0][0]), sy(p[0][1]));
      for (let i = 1; i < p.length; i++) g.lineTo(sx(p[i][0]), sy(p[i][1]));
      g.stroke();
    }

    if (route && route.length > 1) {
      g.strokeStyle = '#4fd3ff'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sx(route[0][0]), sy(route[0][1]));
      for (let i = 1; i < route.length; i++) g.lineTo(sx(route[i][0]), sy(route[i][1]));
      g.stroke();
    }
    const dot = (p, col) => {
      if (!p) return;
      g.fillStyle = col;
      g.beginPath(); g.arc(sx(p.x), sy(p.z), 5, 0, Math.PI * 2); g.fill();
      g.lineWidth = 2; g.strokeStyle = '#0b0f0d'; g.stroke();
    };
    dot(from, '#e8e8e8');
    dot(to, '#ffc94d');

    // North arrow, so "north-up" is stated rather than assumed.
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.font = '700 10px Helvetica, Arial, sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('N ↑', 8, 7);
  }
}
