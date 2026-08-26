// HUD + minimap. The map data never changes, so the whole town is rasterised
// once into an offscreen canvas and every frame is just one transformed
// drawImage plus a handful of dots.

import { MAP } from './mapdata.js';
import { MAP_SIZES, MAP_RANGE } from './store.js';

const TAU = Math.PI * 2;
const DEFAULT_SIZE = MAP_SIZES[0];   // #minimap starts at 200x200 CSS px
const STATIC_PX = 1400;              // target width of the pre-rendered layer
// ~0.275 px/m over the ~5.1 km wide clip rectangle.
const STATIC_SCALE = STATIC_PX / (MAP.bounds.maxX - MAP.bounds.minX);
const DEFAULT_RANGE = MAP_RANGE.dflt;  // world radius shown on the live minimap
const LARGE_MIN_PX = 260;            // at or above this the minimap redraws at 30 Hz
const GAUGE_PX = 132;                // speedo gauge, CSS px
const GAUGE_MAX = 180;               // km/h at the end of the sweep

// Minimap palette. Named for what they are on the map, not for whatever
// places.js used to call them.
const C = {
  land: '#22301f',
  water: '#23485c',
  sand: '#8a7d5c',
  building: '#5e5950',
  traffic: '#d9d9d9',
  job: '#ffffff',        // job start you have not taken (white ring)
  objective: '#ffc94d',  // the thing you are driving to right now
  waypoint: '#4fd3ff',
  car: '#8fe38f',        // a friend's parked car
  route: '#4fd3ff',
  player: '#ffc94d',
  rival: '#ff8a3d',      // a friend you are racing
  cop: '#6fb2ff',        // an auto-patrouille
};

// Ground cover fills, by MAP.areas kind.
const AREA_FILL = {
  park: '#2f4a2a',
  school: '#2f4a2a',
  cemetery: '#2f4a2a',
  wood: '#253d22',
  sand: '#8a7d5c',
  parking: '#33333a',
  pitch: '#35552d',
  pool: '#3d6f85',
  water: '#23485c',
};

// Road stroke colours, drawn in this order so majors win at intersections.
const ROAD_ORDER = [
  ['service', '#3c3c44'],
  ['residential', '#55555e'],
  ['tertiary', '#63636c'],
  ['secondary', '#7a7a86'],
  ['primary', '#7a7a86'],
  ['trunk', '#7a7a86'],
];

// ---------------------------------------------------------------- toasts

// FIFO with at most `max` on screen at once. Time is passed in rather than
// read, so the ordering and the durations are testable without a clock.
export class ToastQueue {
  constructor(max = 2) {
    this.max = max;
    this.active = [];     // [{ text, ms, until }] oldest first
    this.pending = [];    // [{ text, ms }] FIFO
    this.dirty = false;
  }

  push(text, ms = 2200) {
    this.pending.push({ text: String(text ?? ''), ms: Math.max(1, ms | 0) });
    this.dirty = true;
    return this;
  }

  // Expire what is done, promote what fits. Returns true if the screen changed.
  step(now) {
    let changed = false;
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i].until <= now) { this.active.splice(i, 1); changed = true; }
    }
    while (this.active.length < this.max && this.pending.length) {
      const it = this.pending.shift();
      this.active.push({ text: it.text, ms: it.ms, until: now + it.ms });
      changed = true;
    }
    if (changed) this.dirty = false;
    return changed;
  }

  // ms until the next expiry, or Infinity when nothing is showing.
  nextDeadline(now) {
    let best = Infinity;
    for (const a of this.active) best = Math.min(best, a.until - now);
    return best;
  }

  texts() { return this.active.map((a) => a.text); }

  clear() { this.active.length = 0; this.pending.length = 0; }
}

// ---------------------------------------------------------------- HUD

export class Hud {
  constructor() {
    const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
    this.root = $('hud');
    this.elObjective = $('objective');
    this.elSub = $('sub');
    this.elTimer = $('timer');
    this.elKmh = $('kmh');
    this.elCar = $('carname');
    this.elToast = $('toast');
    this.elPrompt = $('prompt');
    this.el = { street: $('street') };
    this.canvas = $('minimap');
    this.gauge = $('gauge');

    this.ctx = this.canvas && this.canvas.getContext ? this.canvas.getContext('2d') : null;
    this.dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2) || 1;
    this.size = DEFAULT_SIZE;
    this.setSize(DEFAULT_SIZE);

    // Two toast slots, built here so index.html stays a single <div id="toast">.
    this.toasts = new ToastQueue(2);
    this.slots = [];
    if (this.elToast && typeof document !== 'undefined' && document.createElement) {
      for (let i = 0; i < 2; i++) {
        const d = document.createElement('div');
        d.className = 'toastline';
        this.elToast.appendChild(d);
        this.slots.push(d);
      }
    }
    this._toastTimer = 0;

    this._lastKmh = -1;
    this._lastTimer = '';
    this._gear = 1;
    this._reverse = false;
    this._gaugeKmh = -1;
    this._lastMapDraw = 0;
    this.range = DEFAULT_RANGE;
    this.staticMap = this._buildStatic();
    this._gaugeFace = null;
    this.gctx = this.gauge && this.gauge.getContext ? this.gauge.getContext('2d') : null;
    if (this.gauge && this.gctx) {
      this.gauge.width = Math.round(GAUGE_PX * this.dpr);
      this.gauge.height = Math.round(GAUGE_PX * this.dpr);
      this._gaugeFace = this._buildGaugeFace();
    }
  }

  // ---- text HUD ----------------------------------------------------------

  setVisible(on) {
    this.root?.classList.toggle('hidden', !on);
  }

  setObjective(text, sub = '') {
    if (this.elObjective) this.elObjective.textContent = text ?? '';
    if (this.elSub) this.elSub.textContent = sub ?? '';
  }

  setTimer(seconds) {
    const el = this.elTimer;
    if (!el) return;
    if (seconds == null) {
      el.classList.add('hidden');
      el.style.opacity = '';
      el.style.transform = '';
      return;
    }
    const s = Math.max(0, seconds);
    el.classList.remove('hidden');
    const m = Math.floor(s / 60);
    const r = Math.floor(s - m * 60);
    const txt = m + ':' + (r < 10 ? '0' : '') + r;
    if (txt !== this._lastTimer) { el.textContent = txt; this._lastTimer = txt; }
    el.classList.toggle('warn', s < 10);
    if (s < 5) {
      // flash on the half-second; keep the CSS centring transform intact
      const beat = (s % 0.5) < 0.25;
      el.style.opacity = beat ? '1' : '0.35';
      el.style.transform = 'translateX(-50%) scale(' + (beat ? 1.12 : 1) + ')';
    } else {
      el.style.opacity = '';
      el.style.transform = '';
    }
  }

  setSpeed(kmh) {
    const v = Math.max(0, Math.round(kmh || 0));
    if (v === this._lastKmh) return;
    this._lastKmh = v;
    if (this.elKmh) this.elKmh.textContent = String(v);
    this._drawGauge(v);
  }

  // 1..5 for the fake five-speed main.js already computes for the engine note.
  // Accepts a string too, so 'R'/'N' work.
  setGear(gear) {
    if (gear === this._gear) return;
    this._gear = gear;
    this._gaugeKmh = -1;                 // force the centre digit to repaint
    this._drawGauge(this._lastKmh < 0 ? 0 : this._lastKmh);
  }

  setCar(name) {
    if (this.elCar) this.elCar.textContent = name || '—';
  }

  prompt(text) {
    const el = this.elPrompt;
    if (!el) return;
    if (text == null) { el.classList.add('hidden'); return; }
    el.textContent = text;
    el.classList.remove('hidden');
  }

  // Queued: at most two on screen, oldest on top, the rest wait their turn.
  toast(text, ms = 2200) {
    this.toasts.push(text, ms);
    this._pumpToasts();
  }

  _pumpToasts() {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (this.toasts.step(now) && this.slots.length) {
      const lines = this.toasts.texts();
      for (let i = 0; i < this.slots.length; i++) {
        const el = this.slots[i];
        el.textContent = lines[i] ?? '';
        el.classList.toggle('show', i < lines.length);
      }
      if (this.elToast) this.elToast.classList.toggle('show', lines.length > 0);
    }
    if (this._toastTimer) { clearTimeout(this._toastTimer); this._toastTimer = 0; }
    const next = this.toasts.nextDeadline(now);
    if (next < Infinity && typeof setTimeout === 'function') {
      this._toastTimer = setTimeout(() => { this._toastTimer = 0; this._pumpToasts(); },
        Math.max(16, Math.min(next, 5000)));
    }
  }

  // ---- speedo gauge ------------------------------------------------------

  // Ticks and the arc never change, so they live on their own canvas and the
  // live gauge is one drawImage plus a needle.
  _buildGaugeFace() {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const cv = document.createElement('canvas');
    cv.width = Math.round(GAUGE_PX * this.dpr);
    cv.height = Math.round(GAUGE_PX * this.dpr);
    const g = cv.getContext && cv.getContext('2d');
    if (!g) return null;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const R = GAUGE_PX / 2, cx = R, cy = R;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;   // 270° sweep, gap at the bottom
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 12;
    g.beginPath(); g.arc(cx, cy, R - 9, a0, a1); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.20)'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, R - 9, a0, a1); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let v = 0; v <= GAUGE_MAX; v += 20) {
      const a = a0 + (a1 - a0) * (v / GAUGE_MAX);
      const ca = Math.cos(a), sa = Math.sin(a);
      const major = v % 40 === 0;
      g.strokeStyle = v >= 140 ? 'rgba(255,95,77,.85)' : 'rgba(255,255,255,.6)';
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(cx + ca * (R - 16), cy + sa * (R - 16));
      g.lineTo(cx + ca * (R - (major ? 24 : 21)), cy + sa * (R - (major ? 24 : 21)));
      g.stroke();
      if (major && v > 0) {
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.font = '600 9px Helvetica, Arial, sans-serif';
        g.fillText(String(v), cx + ca * (R - 33), cy + sa * (R - 33));
      }
    }
    return cv;
  }

  _drawGauge(kmh) {
    const g = this.gctx;
    if (!g || !this._gaugeFace) return;
    if (kmh === this._gaugeKmh) return;
    this._gaugeKmh = kmh;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, GAUGE_PX, GAUGE_PX);
    g.drawImage(this._gaugeFace, 0, 0, GAUGE_PX, GAUGE_PX);
    const R = GAUGE_PX / 2, cx = R, cy = R;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const frac = Math.min(1, Math.max(0, kmh / GAUGE_MAX));
    const a = a0 + (a1 - a0) * frac;
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    g.fillStyle = kmh >= 140 ? '#ff5f4d' : '#ffc94d';
    g.beginPath();
    g.moveTo(-6, 3); g.lineTo(-6, -3); g.lineTo(R - 18, -1.4); g.lineTo(R - 18, 1.4);
    g.closePath(); g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.arc(cx, cy, 4.5, 0, TAU); g.fill();
    // Gear in the well below the hub.
    const gear = this._reverse ? 'R' : String(this._gear ?? 1);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = this._reverse ? '#ff9f8d' : 'rgba(255,255,255,.75)';
    g.font = '800 19px Helvetica, Arial, sans-serif';
    g.fillText(gear, cx, cy + 26);
  }

  // ---- minimap -----------------------------------------------------------

  setStreet(name) {
    const el = this.el && this.el.street;
    if (!el) return;
    if (name !== this._street) { el.textContent = name || ''; this._street = name; }
  }

  setRange(metres) {
    if (metres > 0) this.range = Math.min(MAP_RANGE.max, Math.max(MAP_RANGE.min, metres));
    return this.range;
  }

  // Corner minimap size in CSS px. The static layer is resolution-independent,
  // so only the visible canvas and the street label move.
  setSize(px) {
    const s = Math.max(120, Math.round(px || DEFAULT_SIZE));
    this.size = s;
    const cv = this.canvas;
    if (cv) {
      if (cv.style) { cv.style.width = s + 'px'; cv.style.height = s + 'px'; }
      cv.width = Math.round(s * this.dpr);
      cv.height = Math.round(s * this.dpr);
    }
    const st = this.el && this.el.street;
    if (st && st.style) st.style.left = (20 + s + 16) + 'px';
    this._lastMapDraw = 0;
    return s;
  }

  _buildStatic() {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const B = MAP.bounds;
    const w = Math.ceil((B.maxX - B.minX) * STATIC_SCALE);
    const h = Math.ceil((B.maxZ - B.minZ) * STATIC_SCALE);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext && cv.getContext('2d');
    if (!g) return null;

    // Everything below is in metres; the scale lives in the canvas transform.
    // Line widths are set in pixels, so they are divided back out by hand.
    g.setTransform(STATIC_SCALE, 0, 0, STATIC_SCALE, -B.minX * STATIC_SCALE, -B.minZ * STATIC_SCALE);

    g.fillStyle = C.land;
    g.fillRect(B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ);

    const ring = (p) => {
      if (!p || p.length < 3) return false;
      g.beginPath();
      g.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
      g.closePath();
      return true;
    };

    // Ground cover.
    for (const a of MAP.areas) {
      const col = AREA_FILL[a.k];
      if (!col) continue;
      g.fillStyle = col;
      if (ring(a.p)) g.fill();
    }

    // The Ottawa River on top of the land-side cover.
    g.fillStyle = C.water;
    for (const wtr of MAP.water) if (ring(wtr.p)) g.fill();

    // Footprints go UNDER the roads and stay faint: on a 200 px minimap the
    // 9,000 houses were reading as one grey mass with the streets lost in it.
    // Sheds and the smallest garages are dropped outright.
    g.save();
    for (const b of MAP.buildings) {
      if (b.k === 'shed') continue;
      const small = b.k === 'house' || b.k === 'terrace';
      if (small && !bigEnough(b.p)) continue;
      g.globalAlpha = small ? 0.34 : 0.6;
      g.fillStyle = C.building;
      if (ring(b.p)) g.fill();
    }
    g.restore();

    // Roads: minors first so majors win at intersections.
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const minW = 1.2 / STATIC_SCALE;   // ≥1.2 device px once scaled
    for (const [cls, col] of ROAD_ORDER) {
      g.strokeStyle = col;
      for (const r of MAP.roads) {
        if (r.cls !== cls) continue;
        const pts = r.pts;
        if (!pts || pts.length < 2) continue;
        g.lineWidth = Math.max(r.w || 0, minW);
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.stroke();
      }
    }

    return cv;
  }

  draw(state) {
    const g = this.ctx;
    if (!g || !state) return;

    const SIZE = this.size, MAP_R = SIZE / 2;
    // The big corner map costs ~3x the small one; 30 Hz is plenty for it.
    const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (SIZE >= LARGE_MIN_PX) {
      if (nowMs - this._lastMapDraw < 32) return;
    }
    this._lastMapDraw = nowMs;

    const range = state.range > 0 ? state.range : this.range;
    const px = state.x || 0, pz = state.z || 0, yaw = state.yaw || 0;
    const s = MAP_R / range;                 // px per world unit on screen
    // yaw 0 faces +Z; rotating by (yaw - PI) puts the heading at screen-up.
    const a = yaw - Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    const t = nowMs * 0.001;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath();
    g.arc(MAP_R, MAP_R, MAP_R, 0, TAU);
    g.clip();

    if (this.staticMap) {
      g.save();
      g.translate(MAP_R, MAP_R);
      g.rotate(a);
      g.scale(s, s);
      g.translate(-px, -pz);
      const B = MAP.bounds;
      g.drawImage(this.staticMap, B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ);
      g.restore();
    }

    // Screen position of a world point, without scaling the marker itself.
    const toX = (dx, dz) => MAP_R + (dx * ca - dz * sa) * s;
    const toY = (dx, dz) => MAP_R + (dx * sa + dz * ca) * s;

    const route = state.route;
    if (route && route.length > 1) {
      g.strokeStyle = C.route; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i < route.length; i++) {
        const dx = route[i][0] - px, dz = route[i][1] - pz;
        const x = toX(dx, dz), y = toY(dx, dz);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }

    const traffic = state.traffic;
    if (traffic && traffic.length) {
      g.fillStyle = C.traffic;
      g.beginPath();
      for (let i = 0; i < traffic.length; i++) {
        const dx = traffic[i].x - px, dz = traffic[i].z - pz;
        if (dx * dx + dz * dz > range * range) continue;
        const x = toX(dx, dz), y = toY(dx, dz);
        g.moveTo(x + 1.6, y);
        g.arc(x, y, 1.6, 0, TAU);
      }
      g.fill();
    }

    // Race agent: rivals and cruisers, same shape as a traffic dot but bigger
    // and in their own colour. Cops blink so they read as cops at a glance.
    const blob = (list, colour, rad) => {
      if (!list || !list.length) return;
      g.fillStyle = colour;
      g.beginPath();
      for (let i = 0; i < list.length; i++) {
        const dx = list[i].x - px, dz = list[i].z - pz;
        if (dx * dx + dz * dz > range * range) continue;
        const x = toX(dx, dz), y = toY(dx, dz);
        g.moveTo(x + rad, y);
        g.arc(x, y, rad, 0, TAU);
      }
      g.fill();
    };
    blob(state.rivals, C.rival, 2.8);
    blob(state.cops, (t * 5) % 1 < 0.5 ? C.cop : '#ff5f4d', 3.0);

    const targets = state.targets;
    let objShown = false;
    if (targets && targets.length) {
      const pulse = 1 + 0.35 * Math.sin(t * 4);
      for (let i = 0; i < targets.length; i++) {
        const tg = targets[i];
        const dx = tg.x - px, dz = tg.z - pz;
        const d = Math.hypot(dx, dz);
        const obj = tg.kind !== 'mission';
        const col = tg.kind === 'waypoint' ? C.waypoint : tg.kind === 'car' ? C.car : obj ? C.objective : C.job;

        if (d <= range) {
          const x = toX(dx, dz), y = toY(dx, dz);
          g.strokeStyle = col;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y, obj ? 4.5 * pulse : 4.5, 0, TAU);
          g.stroke();
          if (obj) {
            g.fillStyle = col;
            g.beginPath();
            g.arc(x, y, 1.8, 0, TAU);
            g.fill();
          }
          continue;
        }

        // Off the edge: chevron on the rim pointing at it.
        const ux = (dx * ca - dz * sa) / d, uy = (dx * sa + dz * ca) / d;
        const rx = MAP_R + ux * (MAP_R - 8), ry = MAP_R + uy * (MAP_R - 8);
        g.save();
        g.translate(rx, ry);
        g.rotate(Math.atan2(uy, ux));
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(5, 0); g.lineTo(-3, 4); g.lineTo(-3, -4);
        g.closePath();
        g.fill();
        g.restore();

        if (obj && !objShown) {
          objShown = true;
          g.fillStyle = col;
          g.font = '600 10px Helvetica, Arial, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km',
            MAP_R + ux * (MAP_R - 24), MAP_R + uy * (MAP_R - 24));
        }
      }
    }

    // Player: fixed yellow arrow at the centre, always pointing up.
    g.fillStyle = C.player;
    g.beginPath();
    g.moveTo(MAP_R, MAP_R - 7);
    g.lineTo(MAP_R + 5, MAP_R + 6);
    g.lineTo(MAP_R, MAP_R + 3);
    g.lineTo(MAP_R - 5, MAP_R + 6);
    g.closePath();
    g.fill();

    g.restore();

    // Scale readout, so + / − mean something.
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.font = '600 10px Helvetica, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText(range >= 1000 ? (range / 1000).toFixed(1) + ' km' : Math.round(range) + ' m',
      MAP_R, SIZE - 5);
  }

  // ---- driving agent additions ------------------------------------------
  // Markup lives at the end of index.html and the styling at the end of
  // style.css, so this survives a rework of the rest of the HUD.

  /** R4 — the damage bar next to the speedo. `pct` is 0..100. */
  setDamage(pct) {
    if (this._dmgFill === undefined) {
      const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
      this._dmgWrap = $('dmgwrap');
      this._dmgFill = $('dmgfill');
    }
    const v = Math.max(0, Math.min(100, Math.round(pct || 0)));
    if (v === this._lastDmg) return;
    this._lastDmg = v;
    if (this._dmgWrap) this._dmgWrap.classList.toggle('hidden', v <= 0);
    if (!this._dmgFill) return;
    this._dmgFill.style.width = v + '%';
    // green → amber at the cosmetic line → red once it starts to drive badly
    this._dmgFill.className = v > 60 ? 'bad' : v > 25 ? 'warn' : '';
  }

  /**
   * Race agent (G4) — the wanted meter next to the speedo: 0 to 3 stars.
   * Markup is one <div id="stars"> at the end of index.html and the styling is
   * at the end of style.css, so this survives a rework of the rest of the HUD.
   */
  setStars(n) {
    if (this._starsEl === undefined) {
      this._starsEl = (typeof document !== 'undefined' ? document.getElementById('stars') : null);
    }
    const v = Math.max(0, Math.min(3, Math.round(n || 0)));
    if (v === this._lastStars) return v;
    this._lastStars = v;
    const el = this._starsEl;
    if (!el) return v;
    el.classList.toggle('hidden', v <= 0);
    el.textContent = '\u2605'.repeat(v) + '\u2606'.repeat(3 - v);
    el.classList.toggle('hot', v >= 3);
    return v;
  }

  /** D5 — the R on the speedo. */
  setReverse(on) {
    if (this._revEl === undefined) {
      this._revEl = (typeof document !== 'undefined' ? document.getElementById('gear') : null);
    }
    const v = !!on;
    if (v === this._lastRev) return;
    this._lastRev = v;
    if (this._revEl) this._revEl.classList.toggle('hidden', !v);
  }
}

// A footprint worth drawing on a 200 px map: bounding box over ~55 m².
function bigEnough(p) {
  if (!p || p.length < 3) return false;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of p) {
    if (q[0] < x0) x0 = q[0];
    if (q[0] > x1) x1 = q[0];
    if (q[1] < z0) z0 = q[1];
    if (q[1] > z1) z1 = q[1];
  }
  return (x1 - x0) * (z1 - z0) > 55;
}
