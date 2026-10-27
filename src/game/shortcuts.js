// C-06 shortcuts: real cuts an Aylmer kid would take, counted once each.
//
// Found means you drove the cut, not that you hit the sawhorse: a swept 10 Hz
// pass tracker over three pass points (the middle one is the off-road one),
// either direction, any vehicle. A find toasts « Raccourci trouvé! n/total »,
// is saved with the summer (G.stats.shortcuts, or save.js extras when they
// exist), and the cut is drawn on the big map from then on (mapLines).
//
// Optional hooks that are not on this head yet are called through optional
// chaining so the module boots without them: modes.js registerMode (C-02a,
// the Checkpoint gate pairs and the Blitz no-GPS bonus) and breakables.seal
// (V4-03, the sawhorses). debug() says which ones were live.
import * as BRK from './breakables.js';
import * as SAVE from './save.js';
import * as MODES from './modes.js';

export const PASS_R = 9;                 // m, radius of each pass point
export const NO_GPS_BONUS = 0.06;        // the Blitz « Sans GPS » bonus C-02a reads
const STEP = 0.1, OFF_LINE = 40, JUMP = 30;   // s; m off the line that cancels; m in one step that means a teleport

// Coordinates are game metres; heading `a` uses the game's forward (sin a, cos a).
// cutM, roadM: frozen lengths (the smoke checks drift within 5 %). pace: the
// pace car on the gate's GPS road, seconds (smoke group 3 checks within 8 %).
// Measured 27 Oct 2026 on the Colab VM, rf/w6-shortcuts be4e1c2 (fix/look-on-qr merged).
// gate: false keeps a cut out of gateDefs: the Galeries cut beats the road at
// 50 km/h (7 s) but the pace car is faster on the road (38.1 s) than through
// the lot (39.7 s), so a gold set off the road pace could not be won by the cut.
// The arena cut bends 4 m round the gravel pile (arenaPile) instead of over it.
// [w7-polish] the Galeries cut passes the lot kiosk at (8, -278), not (8, -283):
// 0.6 m off its north-east corner before, about 4 m now (W7-WALLS; smoke_landmark_roads group 5).
export const SHORTCUTS = [
  { id: 'sc_galeries', on: true, name: 'Le raccourci des Galeries', where: 'le stationnement des Galeries d’Aylmer',
    pts: [[-216,-236],[-195,-236],[-110,-243],[-58,-264],[-24,-274],[8,-278],[27,-279],[27,-262],[81,-263],[97,-290],[93,-327],[246,-342],[261,-344]],
    pass: [[-150,-240],[54,-262],[93,-327]], seal: { x: 54, z: -262, yaw: 1.589, w: 6 },
    from: { x: -215, z: -215, a: -3.048, label: 'boulevard Wilfrid-Lavigne' }, to: { x: 262, z: -336, label: 'avenue de la Colline' },
    roadM: 787, cutM0: 559, pace: 38.1, gate: false, via: 'Wilfrid-Lavigne, Principale, Bordeaux, chemin d’Aylmer, Colline' },
  { id: 'sc_arena', on: true, name: 'En arrière de l’aréna', where: 'derrière l’aréna Frank-Robinson',
    pts: [[-500,112],[-585,94],[-607,152],[-622,176],[-685,184],[-700,199],[-712,200],[-740,208],[-744,212]],
    pass: [[-607,152],[-712,200],[-744,212]], seal: { x: -712, z: 200, yaw: -1.292, w: 6 },
    from: { x: -500, z: 112, a: -1.812, label: 'rue Lord-Aylmer' }, to: { x: -744, z: 212, label: 'rue Court' },
    roadM: 633, cutM0: 306, pace: 38.1, via: 'Lord-Aylmer, Wychwood, Patrimoine, Court' },
  { id: 'sc_piste', on: true, name: 'La piste cyclable', where: 'le parc linéaire, entre Lord-Aylmer et Woods',
    pts: [[-940,316],[-898,329],[-880,352],[-845,382],[-800,410],[-793,433]],
    pass: [[-889,341],[-845,382],[-793,433]], seal: { x: -889, z: 341, yaw: 0.664, w: 6 },
    from: { x: -940, z: 316, a: 1.238, label: 'rue Lord-Aylmer' }, to: { x: -793, z: 433, label: 'rue Woods' },
    roadM: 988, cutM0: 196, pace: 48.2, via: 'Lucerne, Lake, Glenholm, Forest, Lortie' },
  // Tom 14 Oct: the church cut, 4th. The church lot off Principale nearest the
  // friends' street: from Frank-Robinson along the church lane, across the back
  // of the lot and out at the end of rue Valencia. The GPS goes round by
  // Frank-Robinson, du Barsac and Valencia.
  { id: 'sc_eglise', on: true, name: 'En arrière de l’église', where: 'le stationnement de l’église St. Mark, près de la rue Principale',
    pts: [[-415,-27],[-353,-33],[-309,-38],[-294,-48],[-262,-56],[-246,-52],[-246,-49]],
    pass: [[-340,-35],[-294,-48],[-246,-50]], seal: { x: -294, z: -48, yaw: 1.937, w: 6 },
    from: { x: -415, z: -27, a: 1.667, label: 'avenue Frank-Robinson' }, to: { x: -246, z: -49, label: 'rue Valencia' },
    roadM: 511, cutM0: 177, pace: 28.3, via: 'Frank-Robinson, du Barsac, Valencia' },
];

function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]); return L; }
for (const s of SHORTCUTS) s.cutM = polyLen(s.pts);

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx*dx + dz*dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px-ax)*dx + (pz-az)*dz) / L2)) : 0;
  return Math.hypot(px - (ax + t*dx), pz - (az + t*dz));
}
function segHit(ax, az, px, pz, pt) { return segDist(pt[0], pt[1], ax, az, px, pz) <= PASS_R; }
function lineDist(s, x, z) { let m = Infinity; const p = s.pts; for (let i = 1; i < p.length; i++) m = Math.min(m, segDist(x, z, p[i-1][0], p[i-1][1], p[i][0], p[i][1])); return m; }

const LIVE = SHORTCUTS.filter((s) => s.on);
const BYID = new Map(LIVE.map((s) => [s.id, s]));
const PROG = LIVE.map(() => ({ k: -1, dir: 0, t: 0 }));
let found = new Set(), acc = 0, qx = NaN, qz = NaN;
let lastStats = undefined, lastExtras = undefined, sealedOnce = false, unsealHooked = false;
let sealed = {}, smashed = new Set(), toasts = {}, lines = [];
let brkOverride = null;                  // tests only: a stub breakables object

const hasExtras = () => typeof SAVE.getExtra === 'function' && typeof SAVE.setExtra === 'function';
const brk = () => brkOverride || BRK.breakables || null;

// ---- registration (C-02a). A throw costs the gates, never the boot.
export function gateDefs() {
  return LIVE.filter((s) => s.gate !== false).map((s) => ({ id: 'cp_' + s.id, name: s.name, from: { ...s.from }, to: { ...s.to }, pace: s.pace || undefined, money: 10 }));
}
let registered = false;
try {
  if (typeof MODES.registerMode === 'function') {
    MODES.registerMode({ id: 'checkpoint', gates: gateDefs() });
    MODES.registerMode({ id: 'blitz', noGpsBonus: NO_GPS_BONUS });
    registered = true;
  }
} catch (e) { console.warn('shortcuts: gate registration skipped', e && e.message); }

// ---- persistence
function rebuildLines() {
  lines = LIVE.filter((s) => found.has(s.id)).map((s) => ({ id: s.id, name: s.name, pts: s.pts }));
}
function resetProgress() {
  for (const p of PROG) { p.k = -1; p.dir = 0; p.t = 0; }
  acc = 0; qx = qz = NaN;
}
function restore(G) {
  if (G.stats === lastStats && G.extras === lastExtras) return;
  lastStats = G.stats; lastExtras = G.extras;
  let blob = null;
  if (G.extras && hasExtras()) blob = SAVE.getExtra(G, 'shortcuts', null);
  if (!blob && G.stats) blob = G.stats.shortcuts;
  found = new Set();
  if (blob && Array.isArray(blob.found)) for (const id of blob.found) if (BYID.has(id)) found.add(id);
  resetProgress(); rebuildLines();
}
function persist(G) {
  const blob = { v: 1, found: [...found] };
  if (G.extras && hasExtras()) SAVE.setExtra(G, 'shortcuts', blob);
  if (G.stats) { G.stats.shortcuts = blob; lastStats = G.stats; }
  lastExtras = G.extras;
}

// ---- the sawhorses (V4-03). Never seal a found cut: there is no unseal.
function sealAll() {
  sealedOnce = true;
  const b = brk();
  for (const s of LIVE) sealed[s.id] = false;
  if (!b) return;
  if (!unsealHooked && typeof b.onUnseal === 'function') { unsealHooked = true; b.onUnseal((id) => { if (BYID.has(id)) smashed.add(id); }); }
  if (typeof b.seal !== 'function') return;
  for (const s of LIVE) {
    if (found.has(s.id)) continue;
    try { b.seal(s.id, { ...s.seal }); sealed[s.id] = true; } catch (e) { console.warn('shortcuts: seal', s.id, e && e.message); }
  }
}

export function _reset() {
  found = new Set(); resetProgress(); lastStats = lastExtras = undefined;
  sealedOnce = false; unsealHooked = false; sealed = {}; smashed = new Set(); toasts = {}; lines = [];
}
export function _useBreakables(stub) { brkOverride = stub; }
export function foundIds() { return [...found]; }

/** Call every sub-step with the player's vehicle. null, or { id, n, total, text } once per find. */
export function tick(G, dt, v) {
  if (!G || G.mode !== 'drive' || !v) return null;
  restore(G);
  if (!sealedOnce) sealAll();
  acc += dt; if (acc < STEP) return null;
  acc -= STEP; if (acc > STEP) acc = 0;
  const px = v.x, pz = v.z;
  if (Number.isNaN(qx)) { qx = px; qz = pz; return null; }
  const ax = qx, az = qz; qx = px; qz = pz;
  if (Math.abs(px - ax) + Math.abs(pz - az) > JUMP) { for (const k of PROG) { k.k = -1; k.dir = 0; k.t = 0; } return null; }
  let out = null;
  for (let i = 0; i < LIVE.length; i++) {
    const s = LIVE[i];
    if (found.has(s.id)) continue;
    const k = PROG[i];
    if (k.k === -1) {
      if (segHit(ax, az, px, pz, s.pass[0])) { k.k = 0; k.dir = 1; k.t = 0; }
      else if (segHit(ax, az, px, pz, s.pass[2])) { k.k = 2; k.dir = -1; k.t = 0; }
    } else {
      k.t += STEP;
      if (k.t > Math.max(20, s.cutM / 4) || lineDist(s, px, pz) > OFF_LINE) { k.k = -1; k.dir = 0; k.t = 0; }
      else if (segHit(ax, az, px, pz, s.pass[k.k + k.dir])) k.k += k.dir;
      if (k.k !== -1 && ((k.dir === 1 && k.k === 2) || (k.dir === -1 && k.k === 0))) {
        found.add(s.id); k.k = -1; k.dir = 0; k.t = 0;
        toasts[s.id] = (toasts[s.id] || 0) + 1;
        persist(G); rebuildLines();
        const n = found.size, total = LIVE.length;
        // Narrator text; the name stays French in English too, it is a place name.
        out = { id: s.id, n, total, text: (G.settings && G.settings.lang === 'en' ? 'Shortcut found! ' : 'Raccourci trouvé! ') + `${n}/${total}\n${s.name}` };
      }
    }
  }
  return out;
}

/** « Raccourcis n/total » for the pause screen, or null when there are none. */
export function countLine(G, en = false) {
  if (G) restore(G);
  const total = LIVE.length; if (!total) return null;
  return en ? `Shortcuts ${found.size}/${total}` : `Raccourcis ${found.size}/${total}`;
}

/** The found cuts, for the big map: [{ id, name, pts }]. Same array until the next find or load. */
export function mapLines(G) {
  if (G) restore(G);
  return lines;
}

export function debug(G) {
  if (G) restore(G);
  const prog = {}; LIVE.forEach((s, i) => { prog[s.id] = PROG[i].k; });
  return { total: LIVE.length, n: found.size, found: [...found], sealed: { ...sealed }, smashed: [...smashed],
    toasts: { ...toasts }, prog, gates: gateDefs().map((d) => d.id), registered };
}
