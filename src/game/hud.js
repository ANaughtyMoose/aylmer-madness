// HUD + minimap. The map data never changes, so the whole town is rasterised
// once into an offscreen canvas and every frame is just one transformed
// drawImage plus a handful of dots.

import { MAP } from './mapdata.js';

const TAU = Math.PI * 2;
const MAP_CSS = 200;              // #minimap is 200x200 CSS px
const MAP_R = MAP_CSS / 2;
const STATIC_PX = 1400;           // target width of the pre-rendered layer
// ~0.275 px/m over the ~5.1 km wide clip rectangle.
const STATIC_SCALE = STATIC_PX / (MAP.bounds.maxX - MAP.bounds.minX);
const DEFAULT_RANGE = 220;        // world radius shown on the live minimap

const C = {
  land: '#22301f',
  water: '#23485c',
  sand: '#8a7d5c',
  building: '#5e5950',
  traffic: '#d9d9d9',
  objective: '#ffc94d',
  mission: '#ffffff',
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

    this.ctx = this.canvas && this.canvas.getContext ? this.canvas.getContext('2d') : null;
    this.dpr = 1;
    if (this.canvas && this.ctx) {
      this.dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2) || 1;
      this.canvas.width = Math.round(MAP_CSS * this.dpr);
      this.canvas.height = Math.round(MAP_CSS * this.dpr);
    }

    this._toastTimer = 0;
    this._lastKmh = -1;
    this._lastTimer = '';
    this.range = DEFAULT_RANGE;
    this.staticMap = this._buildStatic();
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

  toast(text, ms = 2200) {
    const el = this.elToast;
    if (!el) return;
    if (this._toastTimer) { clearTimeout(this._toastTimer); this._toastTimer = 0; }
    el.textContent = text ?? '';
    el.classList.add('show');
    this._toastTimer = setTimeout(() => {
      el.classList.remove('show');
      this._toastTimer = 0;
    }, ms);
  }

  // ---- minimap -----------------------------------------------------------

  setStreet(name) {
    const el = this.el && this.el.street;
    if (!el) return;
    if (name !== this._street) { el.textContent = name || ''; this._street = name; }
  }

  setRange(metres) {
    if (metres > 0) this.range = metres;
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

    // Building footprints.
    g.fillStyle = C.building;
    for (const b of MAP.buildings) {
      if (b.k === 'shed') continue;
      if (ring(b.p)) g.fill();
    }

    return cv;
  }

  draw(state) {
    const g = this.ctx;
    if (!g || !state) return;

    const range = state.range > 0 ? state.range : this.range;
    const px = state.x || 0, pz = state.z || 0, yaw = state.yaw || 0;
    const s = MAP_R / range;                 // px per world unit on screen
    // yaw 0 faces +Z; rotating by (yaw - PI) puts the heading at screen-up.
    const a = yaw - Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, MAP_CSS, MAP_CSS);
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
      g.strokeStyle = '#4fd3ff'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
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

    const targets = state.targets;
    let objShown = false;
    if (targets && targets.length) {
      const pulse = 1 + 0.35 * Math.sin(t * 4);
      for (let i = 0; i < targets.length; i++) {
        const tg = targets[i];
        const dx = tg.x - px, dz = tg.z - pz;
        const d = Math.hypot(dx, dz);
        const obj = tg.kind !== 'mission';
        const col = tg.kind === 'waypoint' ? '#4fd3ff' : tg.kind === 'car' ? '#8fe38f' : obj ? C.objective : C.mission;

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
    g.fillStyle = C.objective;
    g.beginPath();
    g.moveTo(MAP_R, MAP_R - 7);
    g.lineTo(MAP_R + 5, MAP_R + 6);
    g.lineTo(MAP_R, MAP_R + 3);
    g.lineTo(MAP_R - 5, MAP_R + 6);
    g.closePath();
    g.fill();

    g.restore();
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

  /** D5 — the R on the speedo. */
  setReverse(on) {
    if (this._gear === undefined) {
      this._gear = (typeof document !== 'undefined' ? document.getElementById('gear') : null);
    }
    const v = !!on;
    if (v === this._lastRev) return;
    this._lastRev = v;
    if (this._gear) this._gear.classList.toggle('hidden', !v);
  }
}
