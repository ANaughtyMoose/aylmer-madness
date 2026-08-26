// Turntable viewer for the house archetypes. Served by ./serve.sh at
//   http://localhost:8123/src/game/houses_lab.html
//
// Two modes: one archetype on a synthetic (or real) footprint, and "random
// Aylmer street", which lays out eight real MAP footprints from one named
// street with their real road, so a street can be eyeballed as a street.
import { Renderer } from '../core/gl.js';
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { m4, mulberry32, clamp } from '../core/math.js';
import { MAP } from './mapdata.js';
import STUB from './materials_stub.js';
import { loadMaterials } from './materials.js';

// The lab draws with the real atlas when it is there and the stub when it is
// not, which is exactly the choice world.js makes — so what you see here is
// what the game bakes.
let MATS = STUB;
import { buildHouse, ARCHETYPES, inferAttrs, makeStreetYawIndex } from './houses.js';

const r = new Renderer(document.getElementById('gl'));
r.setEnvironment({
  sky: [0.60, 0.70, 0.84], ground: [0.30, 0.33, 0.28], sun: [0.95, 0.90, 0.80],
  lightDir: norm([0.42, 0.82, 0.38]), fog: [0.66, 0.74, 0.84], fogDensity: 0.0016,
});
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

const $ = (id) => document.getElementById(id);
const streetYawAt = makeStreetYawIndex(MAP.roads);

// -------------------------------------------------------------- forced attrs
// Same table as tools/smoke_houses.mjs: the minimum needed to pin an archetype.
const FORCE = {
  old_2s_gable_brick: { era: 'old', storeys: 2, link: 'detached', roof: 'gable', garage: 'none', porch: true },
  old_25s_mansard: { era: 'old', storeys: 2.5, link: 'detached', roof: 'mansard', garage: 'detached', porch: true },
  old_2s_semi: { era: 'old', storeys: 2, link: 'semi', roof: 'gable', garage: 'none', porch: true },
  mid_bungalow_hip: { era: 'midcentury', storeys: 1, link: 'detached', roof: 'hip', garage: 'carport', porch: true },
  mid_bungalow_gable: { era: 'midcentury', storeys: 1, link: 'detached', roof: 'gable', garage: 'attached', porch: true },
  mid_15s_dormer: { era: 'midcentury', storeys: 1.5, link: 'detached', roof: 'gable', garage: 'attached', porch: true },
  cottage_1s_gable: { era: 'cottage', storeys: 1, link: 'detached', roof: 'gable', garage: 'none', porch: true },
  cottage_15s_gable: { era: 'cottage', storeys: 1.5, link: 'detached', roof: 'gable', garage: 'detached', porch: true },
  sub_split: { era: 'suburban', storeys: 1.5, link: 'detached', roof: 'gable', garage: 'attached', porch: true },
  sub_2s_colonial: { era: 'suburban', storeys: 2, link: 'detached', roof: 'gable', garage: 'attached', porch: true },
  sub_bungalow_hip: { era: 'suburban', storeys: 1, link: 'detached', roof: 'hip', garage: 'attached', porch: true },
  mod_2s_stone: { era: 'modern', storeys: 2, link: 'detached', roof: 'hip', garage: 'attached', porch: true },
  mod_2s_gable: { era: 'modern', storeys: 2, link: 'detached', roof: 'gable', garage: 'attached', porch: true },
  row_terrace: { era: 'suburban', storeys: 2, link: 'row', roof: 'gable', garage: 'none', porch: false },
};

const LABEL = {
  old_2s_gable_brick: 'old · 2 storey brick gable + porch',
  old_25s_mansard: 'old · 2.5 storey mansard',
  old_2s_semi: 'old · semi-detached twin',
  mid_bungalow_hip: 'midcentury · hip bungalow + carport',
  mid_bungalow_gable: 'midcentury · gable bungalow',
  mid_15s_dormer: 'midcentury · 1.5 storey w/ dormers',
  cottage_1s_gable: 'cottage · Deschênes 1 storey',
  cottage_15s_gable: 'cottage · 1.5 storey + shed',
  sub_split: 'suburban · split level',
  sub_2s_colonial: 'suburban · 2 storey colonial',
  sub_bungalow_hip: 'suburban · hip bungalow + garage',
  mod_2s_stone: 'modern · stone front, 2-car hip',
  mod_2s_gable: 'modern · 2 storey gable, 2-car',
  row_terrace: 'row · terrace of mirrored units',
};

// ------------------------------------------------------------- synthetic plans
function rectFootprint(w, d, ang, cx, cz) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (u, v) => [cx + u * ca - v * sa, cz + u * sa + v * ca];
  return {
    k: 'house', h: 5.5, a: ang, c: [cx, cz],
    p: [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)],
    t: [0, 1, 2, 0, 2, 3],
  };
}
function lFootprint() {
  return {
    k: 'house', h: 5.5, a: 0, c: [0, 0],
    p: [[-6.5, -4.5], [6.5, -4.5], [6.5, 4.5], [1.5, 4.5], [1.5, 0.5], [-6.5, 0.5]],
    t: [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5],
  };
}
// Move a real MAP footprint to the origin so the turntable still works on it.
function recentre(b) {
  const p = b.p.map((q) => [q[0] - b.c[0], q[1] - b.c[1]]);
  return { ...b, p, c: [0, 0] };
}

// ---------------------------------------------------------------- street data
// Every addressed street with at least eight houses, best ones first.
const STREETS = (() => {
  const m = new Map();
  for (let i = 0; i < MAP.buildings.length; i++) {
    const b = MAP.buildings[i];
    if (!b.addr || (b.k !== 'house' && b.k !== 'terrace')) continue;
    const name = b.addr.replace(/^\S+\s/, '');
    let a = m.get(name);
    if (!a) { a = []; m.set(name, a); }
    a.push(i);
  }
  const out = [];
  for (const [name, idx] of m) if (idx.length >= 8) out.push({ name, idx });
  const PREF = ['Rue Denise-Friend', 'Avenue Frank-Robinson', 'Rue Bancroft',
    'Rue Principale', 'Rue Court', 'Promenade Wychwood', 'Rue Deschênes',
    'Chemin Fraser', 'Boulevard de Lucerne', 'Rue Broad'];
  out.sort((a, b) => {
    const ia = PREF.indexOf(a.name), ib = PREF.indexOf(b.name);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.name.localeCompare(b.name);
  });
  return out;
})();

// The eight footprints on a street that sit closest together, so the lab shows a
// block and not the whole 700 m of Rue Victor-Beaudry.
function streetRun(entry, seed) {
  const rnd = mulberry32(seed);
  const all = entry.idx;
  const anchor = MAP.buildings[all[(rnd() * all.length) | 0]];
  const scored = all.map((i) => {
    const b = MAP.buildings[i];
    return { i, d: Math.hypot(b.c[0] - anchor.c[0], b.c[1] - anchor.c[1]) };
  });
  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, 8).map((s) => s.i);
}

// ------------------------------------------------------------------ scene build
let mesh = null, target = [0, 0, 0], baseDist = 26, stats = '';

function build() {
  const mode = $('mode').value;
  const lod = +$('lod').value;
  const mb = new MeshBuilder();
  const grass = shade(0x6a8449, 1.0);
  let tris = 0, lines = [];

  if (mode === 'street') {
    const entry = STREETS[+$('street').value] || STREETS[0];
    const idx = streetRun(entry, seed);
    let cx = 0, cz = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const i of idx) {
      const c = MAP.buildings[i].c;
      cx += c[0]; cz += c[1];
      x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]);
      z0 = Math.min(z0, c[1]); z1 = Math.max(z1, c[1]);
    }
    cx /= idx.length; cz /= idx.length;
    const pad = Math.max(60, Math.max(x1 - x0, z1 - z0) * 0.7);
    mb.flat(cx - pad, cz - pad, cx + pad, cz + pad, 0, grass);
    drawRoads(mb, cx, cz, pad + 10);
    for (const i of idx) {
      const b = MAP.buildings[i];
      const res = buildHouse(mb, b, b.hs || null, MATS, mulberry32(seed ^ (i * 2654435761)),
        { lod, index: i, streetYaw: streetYawAt(b.c[0], b.c[1], -b.a) });
      tris += res.tris;
      lines.push(`${(b.addr || '?').slice(0, 26).padEnd(27)}${String(res.tris).padStart(4)}  ${res.archetype}`);
    }
    target = [cx, 3, cz];
    baseDist = clamp(Math.max(x1 - x0, z1 - z0) * 0.85 + 30, 40, 320);
    stats = `${entry.name}\n${idx.length} houses · ${tris} tris · ${(tris / idx.length).toFixed(0)}/house\n\n`
      + lines.join('\n');
  } else {
    const id = $('arch').value;
    const kind = $('foot').value;
    let b;
    if (kind === 'rect') b = rectFootprint(11, 8, 0, 0, 0);
    else if (kind === 'wide') b = rectFootprint(17, 9, 0, 0, 0);
    else if (kind === 'deep') b = rectFootprint(8, 13, 0, 0, 0);
    else if (kind === 'real') {
      const houses = MAP.buildings.filter((q) => q.k === 'house' && q.p.length >= 5);
      b = recentre(houses[(mulberry32(seed)() * houses.length) | 0]);
    } else b = lFootprint();
    mb.flat(-40, -40, 40, 40, 0, grass);
    // the "street": a strip of asphalt to the +Z side, which is where
    // streetYaw = +PI/2 points, so the front of the house faces the camera home
    mb.flat(-40, 16, 40, 24, 0.04, rgb(0x3b3b40));
    const res = buildHouse(mb, b, FORCE[id], MATS, mulberry32(seed),
      { lod, index: 7, streetYaw: Math.PI / 2 });
    tris = res.tris;
    const a = res.attrs;
    target = [0, 3, 0];
    baseDist = 26;
    stats = `${LABEL[id] || id}\n${tris} triangles at lod ${lod}\n`
      + `era ${a.era} · ${a.storeys} storey · ${a.roof}\n`
      + `link ${a.link} · garage ${a.garage} · porch ${a.porch}\n`
      + `eave ${a.height.toFixed(2)} m · ridge ${a.ridgeHeight.toFixed(2)} m\n`
      + `footprint ${b.p.length} verts`;
  }
  mesh = r.upload(mb);
  $('stats').textContent = stats;
}

// Road ribbons near (cx,cz) so a street run reads as a street.
function drawRoads(mb, cx, cz, rad) {
  const col = rgb(0x3b3b40), yellow = rgb(0xd4be55);
  for (const road of MAP.roads) {
    const pts = road.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (Math.hypot((a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cz) > rad) continue;
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(dx, dz);
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      mb.flatRot(mx, mz, road.w, L + 1.2, 0.05, yaw, col);
      if (L > 6) mb.flatRot(mx, mz, 0.3, L * 0.5, 0.085, yaw, yellow);
    }
  }
}

// ------------------------------------------------------------------------ ui
let seed = 0x51ee7;
const archSel = $('arch');
for (const id of ARCHETYPES) {
  const o = document.createElement('option');
  o.value = id; o.textContent = LABEL[id] || id;
  archSel.appendChild(o);
}
const stSel = $('street');
STREETS.forEach((s, i) => {
  const o = document.createElement('option');
  o.value = String(i); o.textContent = `${s.name}  (${s.idx.length})`;
  stSel.appendChild(o);
});

for (const id of ['mode', 'arch', 'foot', 'street', 'lod']) $(id).addEventListener('change', () => {
  $('oneBox').style.display = $('mode').value === 'one' ? '' : 'none';
  $('streetBox').style.display = $('mode').value === 'street' ? '' : 'none';
  build();
});
$('reroll').addEventListener('click', () => { seed = (seed * 1664525 + 1013904223) >>> 0; build(); });

let yaw = 0.6, pitch = -0.22, dist = 1, drag = null, spin = true;
addEventListener('pointerdown', (e) => { if (e.target.tagName === 'CANVAS') drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  yaw += (e.clientX - drag[0]) * 0.008;
  pitch = clamp(pitch + (e.clientY - drag[1]) * 0.004, -1.2, -0.02);
  drag = [e.clientX, e.clientY];
});
addEventListener('wheel', (e) => { dist = clamp(dist + e.deltaY * 0.0012, 0.25, 3.5); }, { passive: true });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT') return;
  if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    const n = ARCHETYPES.length;
    archSel.selectedIndex = (archSel.selectedIndex + (e.code === 'ArrowRight' ? 1 : n - 1)) % n;
    $('mode').value = 'one';
    $('oneBox').style.display = ''; $('streetBox').style.display = 'none';
    build();
  }
  if (e.code === 'KeyR') { seed = (seed * 1664525 + 1013904223) >>> 0; build(); }
  if (e.code === 'Space') { spin = !spin; e.preventDefault(); }
});

build();

// Atlas in the background: rebuild once it lands, keep the stub look if it does not.
const drawOpts = { tex: null };
loadMaterials(r, { base: '../../assets/materials/' }).then((m) => { MATS = m; drawOpts.tex = m.tex; build(); })
  .catch((e) => console.warn('lab: no atlas, vertex colours only —', e.message));

const mm = m4.create();
function frame(t) {
  requestAnimationFrame(frame);
  const a = yaw + (spin && !drag ? t * 0.00016 : 0);
  const d = baseDist * dist;
  const cp = [
    target[0] + Math.sin(a) * d * Math.cos(pitch),
    target[1] - Math.sin(pitch) * d,
    target[2] + Math.cos(a) * d * Math.cos(pitch),
  ];
  r.begin(cp, a, pitch, 0.9);
  m4.identity(mm);
  if (mesh) r.draw(mesh, mm, MATS.tex ? drawOpts : undefined);
  r.end();
}
requestAnimationFrame(frame);
