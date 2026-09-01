// Full-screen map of Aylmer: pan, zoom, street names, landmarks, click to set
// a GPS waypoint. Its own static layer at a higher resolution than the minimap.
import { MAP } from './mapdata.js';

const PX_PER_M = 0.6;
const COL = {
  land: '#1f2a1c', park: '#2b4527', wood: '#213520', sand: '#8a7d5c', parking: '#2e2e34',
  pitch: '#33512c', pool: '#3d6f85', water: '#1e3f52', school: '#2b4527', cemetery: '#2b4527',
  service: '#3a3a42', residential: '#5c5c66', tertiary: '#6d6d78', major: '#8a8a96',
  casing: '#15151a', building: '#5c574e', text: '#d8d4c8', label: '#ffd97a',
};

export class BigMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.zoom = 0.45;            // screen px per metre
    this.cx = 0; this.cz = 0;    // world point at screen centre
    this.static = this._buildStatic();
    this.names = this._streetLabels();
    this.onWaypoint = null;
    this.drag = null;
    canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.cx -= dx / this.zoom; this.cz -= dy / this.zoom;
      this.drag.x = e.clientX; this.drag.y = e.clientY; this.drag.moved += Math.abs(dx) + Math.abs(dy);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (this.drag && this.drag.moved < 6 && this.onWaypoint) {
        const [wx, wz] = this.toWorld(e.clientX, e.clientY);
        this.onWaypoint(wx, wz);
      }
      this.drag = null;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [wx, wz] = this.toWorld(e.clientX, e.clientY);
      this.zoom = Math.min(3, Math.max(0.12, this.zoom * Math.exp(-e.deltaY * 0.0015)));
      // keep the point under the cursor fixed
      const [nx, nz] = this.toWorld(e.clientX, e.clientY);
      this.cx += wx - nx; this.cz += wz - nz;
    }, { passive: false });
  }

  toWorld(sx, sy) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return [this.cx + (sx - w / 2) / this.zoom, this.cz + (sy - h / 2) / this.zoom];
  }

  open(x, z) { this.cx = x; this.cz = z; }

  update(dt, input) {
    const v = 420 / this.zoom * dt;
    if (input.down('ArrowLeft', 'KeyA')) this.cx -= v;
    if (input.down('ArrowRight', 'KeyD')) this.cx += v;
    if (input.down('ArrowUp', 'KeyW')) this.cz -= v;
    if (input.down('ArrowDown', 'KeyS')) this.cz += v;
    if (input.down('Equal', 'NumpadAdd')) this.zoom = Math.min(3, this.zoom * (1 + 1.6 * dt));
    if (input.down('Minus', 'NumpadSubtract')) this.zoom = Math.max(0.12, this.zoom / (1 + 1.6 * dt));
  }

  _buildStatic() {
    const B = MAP.bounds;
    const c = document.createElement('canvas');
    c.width = Math.ceil((B.maxX - B.minX) * PX_PER_M);
    c.height = Math.ceil((B.maxZ - B.minZ) * PX_PER_M);
    const g = c.getContext('2d');
    g.fillStyle = COL.land; g.fillRect(0, 0, c.width, c.height);
    g.setTransform(PX_PER_M, 0, 0, PX_PER_M, -B.minX * PX_PER_M, -B.minZ * PX_PER_M);
    const poly = (p) => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); };
    for (const a of MAP.areas) { const f = COL[a.k]; if (!f) continue; g.fillStyle = f; poly(a.p); g.fill(); }
    for (const w of MAP.water) { g.fillStyle = COL.water; poly(w.p); g.fill(); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    const roads = (pred, colour, extra) => {
      g.strokeStyle = colour;
      for (const r of MAP.roads) {
        if (!pred(r)) continue;
        g.lineWidth = Math.max(r.w + extra, 2 / PX_PER_M);
        g.beginPath(); g.moveTo(r.pts[0][0], r.pts[0][1]);
        for (let i = 1; i < r.pts.length; i++) g.lineTo(r.pts[i][0], r.pts[i][1]);
        g.stroke();
      }
    };
    const major = (r) => r.cls === 'trunk' || r.cls === 'primary' || r.cls === 'secondary';
    roads((r) => r.cls !== 'service', COL.casing, 2.4);
    roads((r) => r.cls === 'service', COL.service, 0);
    roads((r) => r.cls === 'residential', COL.residential, 0);
    roads((r) => r.cls === 'tertiary', COL.tertiary, 0);
    roads(major, COL.major, 0);
    g.fillStyle = COL.building;
    for (const b of MAP.buildings) { if (b.k === 'shed') continue; poly(b.p); g.fill(); }
    return c;
  }

  // One label per named non-service street, on its longest segment.
  _streetLabels() {
    const best = new Map();
    for (const r of MAP.roads) {
      if (!r.name || r.cls === 'service') continue;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const l = Math.hypot(bx - ax, bz - az);
        const cur = best.get(r.name);
        if (!cur || l > cur.l) best.set(r.name, { l, x: (ax + bx) / 2, z: (az + bz) / 2, a: Math.atan2(bz - az, bx - ax), cls: r.cls });
      }
    }
    return [...best.entries()].map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.l - a.l);
  }

  draw(state) {
    const c = this.canvas, g = this.ctx;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0d1210'; g.fillRect(0, 0, w, h);
    const B = MAP.bounds, z = this.zoom;
    const sx = (x) => w / 2 + (x - this.cx) * z, sy = (zz) => h / 2 + (zz - this.cz) * z;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.static, sx(B.minX), sy(B.minZ), (B.maxX - B.minX) * z, (B.maxZ - B.minZ) * z);

    // route
    if (state.route && state.route.length > 1) {
      g.strokeStyle = '#4fd3ff'; g.lineWidth = 3.5; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(sx(state.route[0][0]), sy(state.route[0][1]));
      for (let i = 1; i < state.route.length; i++) g.lineTo(sx(state.route[i][0]), sy(state.route[i][1]));
      g.stroke();
    }
    // street names
    if (z > 0.22) {
      g.fillStyle = COL.text; g.textAlign = 'center'; g.textBaseline = 'middle';
      const used = [];
      let n = 0;
      for (const L of this.names) {
        if (n > 160) break;
        const isMajor = L.cls === 'trunk' || L.cls === 'primary' || L.cls === 'secondary';
        if (!isMajor && z < 0.5) continue;
        if (L.l * z < L.name.length * (isMajor ? 2.6 : 4.2)) continue;
        const x = sx(L.x), y = sy(L.z);
        if (x < -100 || y < -40 || x > w + 100 || y > h + 40) continue;
        if (used.some(([ux, uy]) => Math.abs(ux - x) < 90 && Math.abs(uy - y) < 16)) continue;
        used.push([x, y]); n++;
        let a = L.a; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
        g.save(); g.translate(x, y); g.rotate(a);
        g.font = (isMajor ? 'bold 12px' : '10px') + ' Helvetica, Arial, sans-serif';
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(L.name, 1, 1);
        g.fillStyle = COL.text; g.fillText(L.name, 0, 0);
        g.restore();
      }
    }
    // landmarks / job starts / parked cars / waypoint
    g.font = 'bold 12px Helvetica, Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    const pin = (x, y, colour, label, ring) => {
      g.beginPath(); g.arc(x, y, ring ? 7 : 5, 0, Math.PI * 2);
      g.fillStyle = colour; g.fill();
      if (ring) { g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke(); }
      if (label) {
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(label, x + 11, y + 1);
        g.fillStyle = colour; g.fillText(label, x + 10, y);
      }
    };
    const taken = [...(state.missions || []), ...(state.parked || [])];
    const placeLabels = [];
    // Mission places first, then civic landmarks, then businesses. Earlier
    // entries win label collisions, so important destinations remain named.
    const mappedPlaces = [...(state.places || [])].sort((a, b) =>
      Number(!!a.source) - Number(!!b.source) || Number(!!b.landmark) - Number(!!a.landmark));
    for (const p of mappedPlaces) {
      if (taken.some((m) => Math.hypot(m.x - p.x, m.z - p.z) < 40)) continue;   // a pin with its own label sits here
      const x = sx(p.x), y = sy(p.z);
      if (x < -30 || y < -20 || x > w + 30 || y > h + 20) continue;
      // Civic landmarks stay named at every zoom. Ordinary businesses wait
      // until their neighbourhood is legible and yield when labels overlap.
      const labelZoom = !p.source ? 0.3 : 0.28;
      let label = p.landmark || z > labelZoom ? p.label : null;
      if (label && !p.landmark &&
          placeLabels.some(([lx, ly]) => Math.abs(lx - x) < 150 && Math.abs(ly - y) < 18)) label = null;
      if (label) placeLabels.push([x, y]);
      pin(x, y, p.landmark ? '#8fd6a3' : '#bfc7d6', label, false);
    }
    // Several jobs can start at the same driveway: one pin, titles stacked.
    const groups = [];
    for (const m of state.missions || []) {
      const gp = groups.find((q) => Math.hypot(q.x - m.x, q.z - m.z) < 30);
      if (gp) gp.items.push(m); else groups.push({ x: m.x, z: m.z, place: m.place, items: [m] });
    }
    for (const gp of groups) {
      const x = sx(gp.x), y = sy(gp.z);
      pin(x, y, gp.items.every((m) => m.done) ? '#e9e9e9' : COL.label, null, true);
      let ly = y - (gp.items.length - 1) * 7;
      for (const m of gp.items) {
        g.font = 'bold 12px Helvetica, Arial, sans-serif';
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText((m.done ? '✓ ' : '') + m.title, x + 11, ly + 1);
        g.fillStyle = m.done ? '#e9e9e9' : COL.label; g.fillText((m.done ? '✓ ' : '') + m.title, x + 10, ly);
        ly += 14;
      }
      if (gp.place) { g.font = '10px Helvetica, Arial, sans-serif'; g.fillStyle = '#bfc7d6'; g.fillText(gp.place, x + 10, ly); }
    }
    g.font = 'bold 12px Helvetica, Arial, sans-serif';
    for (const p of state.parked || []) pin(sx(p.x), sy(p.z), '#8fe38f', p.name, true);
    // race agent: who you are racing, and who is chasing you
    for (const p of state.rivals || []) pin(sx(p.x), sy(p.z), '#ff8a3d', p.name || 'Rival', true);
    for (const p of state.cops || []) pin(sx(p.x), sy(p.z), '#6fb2ff', 'Police', true);
    // feel agent: where to get the dents taken out, once there are dents.
    for (const p of state.repairs || []) pin(sx(p.x), sy(p.z), '#9ee6a1', '\u{1F527} ' + (p.label || 'Réparation'), true);
    if (state.waypoint) pin(sx(state.waypoint.x), sy(state.waypoint.z), '#4fd3ff', 'Waypoint', true);
    if (state.target) pin(sx(state.target.x), sy(state.target.z), COL.label, 'Objectif', true);
    // player
    g.save(); g.translate(sx(state.x), sy(state.z)); g.rotate(Math.PI - state.yaw);   // forward = (sin yaw, cos yaw), +Z is south = screen-down
    g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath();
    g.fillStyle = '#ffc94d'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#000'; g.stroke();
    g.restore();
    // help
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, h - 30, w, 30);
    g.fillStyle = '#fff'; g.font = '13px Helvetica, Arial, sans-serif'; g.textAlign = 'center';
    g.fillText('Clique pour mettre un waypoint  ·  glisse ou flèches pour bouger  ·  molette / + − pour zoomer  ·  Tab ou Esc pour fermer', w / 2, h - 15);
  }
}
