#!/usr/bin/env node
// Orthographic contact sheet of the four procedural cars: side (from the
// driver's left), front and top views as flat-shaded SVG polygons, plus a
// dimension check against the real vehicles. Writes data/cars.svg.
//
//   node tools/car_views.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CARS, buildCarBody, buildWheel, tToZ, pl } from '../src/game/cars.js';
import { STRIDE } from '../src/core/mesh.js';
// Registers the two buses and the two bicycles into CARS. They carry their own
// buildBody/buildWheel/buildSteer, which is what the (c.buildX || ...) below is.
import '../src/game/buses.js';
import '../src/game/bikes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CELL_W = 420, PAD = 16, LABEL_H = 34;
const SCALE = (CELL_W - 2 * PAD) / 5.1;           // px per metre, common to every cell
const CELL_H = Math.round(2.05 * SCALE) + LABEL_H + PAD;
// Keep this in step with cars.js — a van rides on truck tyres and a bus on
// something a lot fatter than either.
const WHEEL_W = (s) => (s.tyreW != null ? s.tyreW : s.style === 'bus' ? 0.32
  : s.style === 'truck' || s.style === 'van' ? 0.24
  : s.style === 'cart' ? 0.14 : 0.20);

// ---- mesh helpers -----------------------------------------------------------
function triangles(mb, offset = [0, 0, 0]) {
  const out = [];
  const v = mb.v, idx = mb.i;
  for (let k = 0; k < idx.length; k += 3) {
    const P = [], N = [], C = [];
    for (let j = 0; j < 3; j++) {
      const b = idx[k + j] * STRIDE;
      P.push([v[b] + offset[0], v[b + 1] + offset[1], v[b + 2] + offset[2]]);
      N.push([v[b + 3], v[b + 4], v[b + 5]]);
      C.push([v[b + 6], v[b + 7], v[b + 8]]);
    }
    out.push({ P, N, C });
  }
  return out;
}
function geomNormal(P) {
  const [a, b, c] = P;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const l = Math.hypot(...n);
  return l < 1e-9 ? null : n.map((q) => q / l);
}
function bbox(mb) {
  return { min: mb.min.slice(), max: mb.max.slice() };
}
// Count triangles whose winding disagrees with the stored vertex normal.
function windingMismatches(mb) {
  let bad = 0, degenerate = 0;
  for (const t of triangles(mb)) {
    const g = geomNormal(t.P);
    if (!g) { degenerate++; continue; }
    const n = [0, 1, 2].map((i) => (t.N[0][i] + t.N[1][i] + t.N[2][i]) / 3);
    if (g[0] * n[0] + g[1] * n[1] + g[2] * n[2] < 0) bad++;
  }
  return { bad, degenerate };
}

// ---- projection -------------------------------------------------------------
// Each view: project(p) -> [u, v] in metres (u right, v up), depth(p) larger = nearer, eye direction.
const VIEWS = {
  side: { label: 'side (driver\'s left)', proj: (p) => [p[2], p[1]], depth: (p) => p[0], eye: [1, 0, 0] },
  front: { label: 'front', proj: (p) => [-p[0], p[1]], depth: (p) => p[2], eye: [0, 0, 1] },
  top: { label: 'top', proj: (p) => [p[2], p[0]], depth: (p) => p[1], eye: [0, 1, 0] },
};
const LIGHT = [0.45, 0.8, 0.35];
const hex = (c) => '#' + c.map((q) => Math.round(Math.max(0, Math.min(1, q)) * 255).toString(16).padStart(2, '0')).join('');

function renderView(tris, view, ox, oy, uMin, vMax) {
  const { proj, depth, eye } = view;
  const list = [];
  for (const t of tris) {
    const g = geomNormal(t.P);
    if (!g) continue;
    if (g[0] * eye[0] + g[1] * eye[1] + g[2] * eye[2] <= 0) continue;   // back-face cull
    const d = (depth(t.P[0]) + depth(t.P[1]) + depth(t.P[2])) / 3;
    const lit = 0.55 + 0.45 * Math.max(0, g[0] * LIGHT[0] + g[1] * LIGHT[1] + g[2] * LIGHT[2]);
    const c = [0, 1, 2].map((i) => ((t.C[0][i] + t.C[1][i] + t.C[2][i]) / 3) * lit);
    const pts = t.P.map((p) => {
      const [u, v] = proj(p);
      return `${(ox + (u - uMin) * SCALE).toFixed(1)},${(oy + (vMax - v) * SCALE).toFixed(1)}`;
    });
    const col = hex(c);
    list.push({ d, s: `<polygon points="${pts.join(' ')}" fill="${col}" stroke="${col}"/>` });
  }
  list.sort((a, b) => a.d - b.d);           // painter's order: far first
  return list.map((q) => q.s).join('');
}

// ---- main -------------------------------------------------------------------
const rows = [];
const report = [];
let y = PAD;
for (const s of CARS) {
  // The two buses and the two bicycles bring their own builders; a car is
  // lofted by cars.js the way it always was.
  const mkBody = s.buildBody || buildCarBody, mkWheel = s.buildWheel || buildWheel;
  const body = mkBody(s);
  // Measured against the spec sheet with everything that sticks out past the
  // body envelope left off: the mirrors, and the Ranger's whip antenna. A real
  // 1993 brochure quotes 69.4 in wide and 64.8 in tall for the same reason.
  // A custom builder that ignores either flag simply gets the full body back.
  const bodyNoMirrors = mkBody(s, { noMirrors: true, noAerial: true });
  const wheel = mkWheel(s);
  // A two-wheeler's bars and fork turn with the steering, so they are a mesh of
  // their own; they are most of its width and half of what identifies it, so
  // they go into the contact sheet and into the dimension check.
  const steer = s.buildSteer ? s.buildSteer(s) : null;
  const wTris = triangles(wheel).length + (steer ? steer.i.length / 3 : 0);
  const bTris = body.i.length / 3;

  // assemble body + four wheels (as the game places them)
  const tris = triangles(body);
  if (steer) {
    tris.push(...triangles(steer, [0, 0, s.axleZ]));
    for (const p of steer.min.keys()) {
      bodyNoMirrors.min[p] = Math.min(bodyNoMirrors.min[p], steer.min[p] + (p === 2 ? s.axleZ : 0));
      bodyNoMirrors.max[p] = Math.max(bodyNoMirrors.max[p], steer.max[p] + (p === 2 ? s.axleZ : 0));
    }
  }
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    tris.push(...triangles(wheel, [sx * s.track / 2, s.wheelR, sz * s.axleZ]));
  }

  // dimensions. A two-wheeler is measured over the whole assembly: its wheels
  // are half its length and its bars are all of its width.
  const bb = bbox(bodyNoMirrors), bbAll = bbox(body);
  if (s.twoWheel) {
    // The wheels: half a tyre wide, two radii tall, and a wheelbase plus two
    // radii long. Both of them sit in the frame's own plane.
    const ext = [WHEEL_W(s) / 2, 0, s.axleZ + s.wheelR];
    for (const p of [0, 1, 2]) {
      bb.min[p] = Math.min(bb.min[p], p === 1 ? 0 : -ext[p]);
      bb.max[p] = Math.max(bb.max[p], p === 1 ? 2 * s.wheelR : ext[p]);
    }
  }
  const L = bb.max[2] - bb.min[2], W = bb.max[0] - bb.min[0], H = bb.max[1];
  const pct = (a, b) => ((a / b - 1) * 100);
  const rearOverhang = s.len - s.wheelbase - s.overhangF;
  const axles = [['rear', rearOverhang / s.len], ['front', (rearOverhang + s.wheelbase) / s.len]];
  const wheelOuter = s.track / 2 + WHEEL_W(s) / 2;
  const proud = axles.map(([name, t]) => ({ name, hw: pl(s.plan, t), proud: wheelOuter - pl(s.plan, t) }));
  const wind = windingMismatches(body);
  const wheelWind = windingMismatches(wheel);
  report.push({
    id: s.id, name: s.name,
    L, W, H, dL: pct(L, s.len), dW: pct(W, s.wid), dH: pct(H, s.h),
    Wmirrors: bbAll.max[0] - bbAll.min[0],
    wheelOuter, proud, bTris, wTris, wind, wheelWind,
    twoWheel: !!s.twoWheel,
    // A bicycle has one track: both drawn wheels sit in the frame's own plane,
    // so "how far does the tyre stand proud of the body" is not a question.
    ok: Math.abs(pct(L, s.len)) <= 3 && Math.abs(pct(W, s.wid)) <= 3 && Math.abs(pct(H, s.h)) <= 3
      && (s.twoWheel || s.duals || proud.every((p) => p.proud >= 0.06 && p.proud <= 0.09)),
  });

  // svg row
  const zMin = tToZ(s, 0) - 0.15, zMax = tToZ(s, 1) + 0.15;
  const cells = [];
  let x = PAD;
  for (const [key, view] of Object.entries(VIEWS)) {
    const oy = y + LABEL_H;
    let svg = '';
    if (key === 'side') svg = renderView(tris, view, x + PAD, oy, zMin, s.h + 0.1);
    if (key === 'front') svg = renderView(tris, view, x + PAD + ((zMax - zMin) - 2.4) / 2 * SCALE, oy, -1.2, s.h + 0.1);
    if (key === 'top') svg = renderView(tris, view, x + PAD, oy + 0.1 * SCALE, zMin, 1.1);
    cells.push(`<g>${svg}</g>`);
    cells.push(`<text x="${x + PAD}" y="${y + CELL_H - PAD - 4}" class="v">${view.label}</text>`);
    x += CELL_W;
  }
  const r = report[report.length - 1];
  const dims = `target ${s.len.toFixed(2)} × ${s.wid.toFixed(2)} × ${s.h.toFixed(2)} m · mesh ${L.toFixed(2)} × ${W.toFixed(2)} × ${H.toFixed(2)} m · wb ${s.wheelbase} · track ${s.track} · ${bTris} tris`;
  rows.push(`<rect x="${PAD / 2}" y="${y - PAD / 2}" width="${CELL_W * 3}" height="${CELL_H}" class="cell"/>`
    + `<text x="${PAD * 2}" y="${y + 14}" class="t">${s.name} (${s.who})</text>`
    + `<text x="${PAD * 2}" y="${y + 28}" class="d">${dims}</text>`
    + `<line x1="${PAD}" y1="${y + LABEL_H + (s.h + 0.1) * SCALE}" x2="${PAD + CELL_W * 2 - PAD}" y2="${y + LABEL_H + (s.h + 0.1) * SCALE}" class="g"/>`
    + cells.join(''));
  y += CELL_H;
  void r;
}

const svgW = CELL_W * 3 + PAD, svgH = y + PAD / 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
<style>
  .bg{fill:#e9ebee}.cell{fill:#f7f8fa;stroke:#c9ccd2;stroke-width:1}
  .t{font:bold 13px sans-serif;fill:#222}.d{font:10px monospace;fill:#555}.v{font:10px sans-serif;fill:#777}
  .g{stroke:#b8bcc4;stroke-width:1;stroke-dasharray:3 3}
  polygon{stroke-width:0.6;stroke-linejoin:round;shape-rendering:geometricPrecision}
</style>
<rect class="bg" width="${svgW}" height="${svgH}"/>
${rows.join('\n')}
</svg>`;
mkdirSync(join(ROOT, 'data'), { recursive: true });
const out = join(ROOT, 'data', 'cars.svg');
writeFileSync(out, svg);

// ---- console report -----------------------------------------------------------
const f = (n, d = 2) => n.toFixed(d);
console.log(`wrote ${out} (${(svg.length / 1024).toFixed(0)} KB)\n`);
console.log('car       length (target)      width (target)       height (target)      w/mirrors  body tris  wheel tris  winding bad/degenerate');
for (const r of report) {
  console.log(
    `${r.id.padEnd(9)} ${f(r.L)} (${f(report.find((q) => q.id === r.id) && CARS.find((c) => c.id === r.id).len)}) ${(r.dL >= 0 ? '+' : '') + f(r.dL, 1)}%`.padEnd(32)
    + `${f(r.W)} (${f(CARS.find((c) => c.id === r.id).wid)}) ${(r.dW >= 0 ? '+' : '') + f(r.dW, 1)}%`.padEnd(21)
    + `${f(r.H)} (${f(CARS.find((c) => c.id === r.id).h)}) ${(r.dH >= 0 ? '+' : '') + f(r.dH, 1)}%`.padEnd(21)
    + `${f(r.Wmirrors)}`.padEnd(11) + `${r.bTris}`.padEnd(11) + `${r.wTris}`.padEnd(12)
    + `${r.wind.bad}/${r.wind.degenerate} (wheel ${r.wheelWind.bad}/${r.wheelWind.degenerate})`
    + (r.ok ? '' : '   <-- OUT OF SPEC'));
}
console.log('\nwheels: outer face x vs body half-width at the axle (must protrude 0.06–0.09 m)');
for (const r of report) {
  console.log(`${r.id.padEnd(9)} outer x ${f(r.wheelOuter, 3)}  ` + r.proud.map((p) => `${p.name}: hw ${f(p.hw, 3)} proud ${f(p.proud, 3)}${p.proud < 0.06 || p.proud > 0.09 ? ' !!' : ''}`).join('   '));
}
const allOk = report.every((r) => r.ok);
console.log(allOk ? '\nall four cars within 3% and wheels protruding' : '\nSOME CARS OUT OF SPEC');
process.exitCode = allOk ? 0 : 1;
