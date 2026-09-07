// Turntable viewer for the borrowed models. Served by ./serve.sh at
//   http://localhost:8123/src/game/models_lab.html
//
// Same shape as houses_lab.js, and the same reason for existing: a converted
// model can be the wrong scale, face the wrong way, float, or read as a grey
// blob, and every one of those looks completely fine as a triangle count.
// So: the game's own lighting, a 1 m grid to measure against, and the thing the
// game builds TODAY standing next to it.
import { Renderer } from '../core/gl.js';
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { m4, clamp, mulberry32 } from '../core/math.js';
import { loadModels, modelMeshData } from './models.js';
import { CARS, buildCarBody, buildWheel, carById } from './cars.js';
import { KINDS } from './streetprops.js';
// Registers the buses into CARS, which is where the city bus's comparison
// geometry comes from.
import './buses.js';

const r = new Renderer(document.getElementById('gl'));
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
r.setEnvironment({
  sky: [0.60, 0.70, 0.84], ground: [0.30, 0.33, 0.28], sun: [0.95, 0.90, 0.80],
  lightDir: norm([0.42, 0.82, 0.38]), fog: [0.66, 0.74, 0.84], fogDensity: 0.0016,
});
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------- the comparison side
// What the game builds today, for the same thing. Anything with no entry here
// gets an empty right-hand side and says so.

const C = { trunk: 0x5b4632, leaf: 0x4f7a34, leaf2: 0x5d8a3a, conifer: 0x2f4f2e, pole: 0x6f6455 };

// world.js's `tree()`, which is a closure inside buildWorld and cannot be
// imported. Copied rather than refactored: this file is a lab, and moving a
// function out of the world build to serve it would be the tail wagging the dog.
function proceduralTree(b, conifer, scale = 1) {
  const th = 3.0 * scale;
  const leaf = conifer ? C.conifer : C.leaf;
  b.cyl(0, th / 2, 0, 0.34 * scale, th, 4, rgb(C.trunk), 'y', false);
  if (conifer) {
    b.cone(0, th * 0.45, 0, 1.9 * scale, 7.0 * scale, 5, rgb(leaf));
    b.cone(0, th * 1.5, 0, 1.4 * scale, 5.0 * scale, 5, shade(leaf, 1.12));
  } else {
    b.cone(0, th * 0.7, 0, 3.1 * scale, 4.0 * scale, 5, rgb(leaf));
    b.cone(0, th * 1.5, 0, 2.3 * scale, 3.2 * scale, 5, shade(leaf, 1.1));
    b.cone(1.35 * scale, th * 1.14, 0, 1.45 * scale, 2.1 * scale, 5, shade(leaf, 1.02));
  }
}

// world.js section 5's street furniture: a pole is a 4-sided post.
function proceduralPole(b, h) { b.post(0, 0, 0, 0.22, h, rgb(C.pole)); }

// A car the way main.js draws one: the lofted body, plus the four wheels the
// game hangs at +-wheelbase/2. This is the whole point of the pickup comparison
// — the converted body has to accept these wheels.
function gameWheels(b, spec) {
  // A string names a car in CARS; an object is a vehicle cars.js has no spec
  // for yet (Wave 3's Forester and Sienna, the cruiser), described by the three
  // numbers that decide where a wheel goes.
  const s = typeof spec === 'string' ? carById(spec)
    : { id: '_generic', axleZ: spec.wheelbase / 2, ...spec };
  const wheel = s.buildWheel ? s.buildWheel(s) : buildWheel(s);
  const hw = (s.track || 1.6) / 2;
  for (const sz of [1, -1]) {
    for (const sx of [1, -1]) {
      const w = new MeshBuilder();
      w.append(wheel);
      // MeshBuilder has no transform, so shift the vertices: 4 wheels a car,
      // once, in a lab.
      for (let i = 0; i < w.v.length; i += 9) {
        w.v[i] += sx * hw; w.v[i + 1] += s.wheelR; w.v[i + 2] += sz * s.axleZ;
      }
      b.append(w);
    }
  }
}

function proceduralCar(b, id) {
  const s = carById(id);
  b.append(s.buildBody ? s.buildBody(s) : buildCarBody(s));
  gameWheels(b, s);
  return s;
}

// A converted vehicle body is only half a vehicle: cars.js hangs the wheels at
// +-track/2 and +-wheelbase/2 about the mesh origin, and whether they land in
// the body's own arches is the whole question. So the lab bolts the GAME'S
// wheels onto the borrowed body — if they stick out through the flanks, that is
// visible here and nowhere else.
const WHEELS_FOR = {
  'pickup-ranger': 'ranger',
  'sedan-saturn': 'saturn',
  'hatch-civic': 'civic',
  'coupe-sunfire': 'sunfire',
  // No spec in cars.js yet: the real car's own track, wheelbase and tyre, which
  // are also the numbers tools/build_models.mjs scaled the body to.
  'wagon-forester': { track: 1.47, wheelbase: 2.52, wheelR: 0.32, style: 'suv' },
  'van-sienna': { track: 1.57, wheelbase: 2.90, wheelR: 0.33, style: 'van' },
  'police-cruiser': { track: 1.62, wheelbase: 2.92, wheelR: 0.35, style: 'sedan' },
};

const COMPARE = {
  'tree-sugar-maple': (b) => proceduralTree(b, false, 1.15),
  'tree-white-pine': (b) => proceduralTree(b, true, 1.35),
  'tree-white-cedar': (b) => proceduralTree(b, true, 0.6),
  'tree-birch': (b) => proceduralTree(b, false, 1.3),
  'tree-spruce': (b) => proceduralTree(b, true, 1.15),
  'lamp-post': (b) => proceduralPole(b, 8.0),
  'hydro-pole': (b) => proceduralPole(b, 11.0),
  'garbage-can': (b) => KINDS.garbage.emit(b, 0, 0, 0, 0),
  dumpster: (b) => KINDS.relaybox.emit(b, 0, 0, 0, 0),
  'park-bench': (b) => KINDS.cafetable.emit(b, 0, 0, 0, 0),
  'stop-sign': (b) => proceduralPole(b, 2.4),
  'pickup-ranger': (b) => proceduralCar(b, 'ranger'),
  'sedan-saturn': (b) => proceduralCar(b, 'saturn'),
  'hatch-civic': (b) => proceduralCar(b, 'civic'),
  'coupe-sunfire': (b) => proceduralCar(b, 'sunfire'),
  'school-bus': (b) => proceduralCar(b, 'schoolbus'),
  'city-bus': (b) => proceduralCar(b, 'bus'),
};

// --------------------------------------------------------------- the ground
// A 1 m grid, because "is this the right size" is the question a turntable is
// worst at answering and a ruler is best at.
function buildGround(kind, half) {
  const b = new MeshBuilder();
  const base = kind === 'road' ? 0x3b3b40 : 0x5c7a42;
  b.flat(-half, -half, half, half, 0, rgb(base));
  const line = shade(base, kind === 'road' ? 1.35 : 1.18);
  for (let i = -half; i <= half; i += 1) {
    b.flat(i - 0.02, -half, i + 0.02, half, 0.006, line);
    b.flat(-half, i - 0.02, half, i + 0.02, 0.006, line);
  }
  // Every 5 m, a heavier line, so you can count without counting.
  const bold = shade(base, kind === 'road' ? 1.7 : 1.4);
  for (let i = -half; i <= half; i += 5) {
    b.flat(i - 0.05, -half, i + 0.05, half, 0.012, bold);
    b.flat(-half, i - 0.05, half, i + 0.05, 0.012, bold);
  }
  return b;
}

// ------------------------------------------------------------------ the lab

let reg = null;
let modelMesh = null, cmpMesh = null, groundMesh = null;
let target = [0, 2, 0], baseDist = 20, spin = true;
let stats = 'loading…';

function rebuild() {
  const slug = $('model').value;
  const m = reg && reg.get(slug);
  for (const mesh of [modelMesh, cmpMesh, groundMesh]) if (mesh) r.free(mesh);
  modelMesh = cmpMesh = groundMesh = null;
  if (!m) { $('stats').textContent = 'no model'; return; }

  const size = [0, 1, 2].map((k) => m.max[k] - m.min[k]);
  const span = Math.max(size[0], size[1], size[2]);
  // Stand the two side by side, a metre of daylight between them.
  const gap = Math.max(size[0], 2) / 2 + 1.2;
  const wantCmp = $('cmp').value === 'auto' && COMPARE[slug];

  const mb = new MeshBuilder();
  const converted = modelBuilder(m);
  if (WHEELS_FOR[slug]) gameWheels(converted, WHEELS_FOR[slug]);
  mb.append(shift(converted, wantCmp ? -gap : 0, 0, 0));
  let cmpTris = 0;
  if (wantCmp) {
    const cb = new MeshBuilder();
    COMPARE[slug](cb);
    cmpTris = cb.i.length / 3;
    mb.append(shift(cb, gap, 0, 0));
  }
  modelMesh = r.upload(mb);

  const half = Math.max(12, Math.ceil(span) + 6);
  groundMesh = r.upload(buildGround($('ground').value, half));

  target = [0, Math.min(span * 0.45, 6), 0];
  baseDist = clamp(span * 2.3 + 6, 12, 90);
  const e = reg.entry(slug) || {};
  const lic = m.license || {};
  stats = `${e.name || slug}\n`
    + `${m.tris} tris · ${m.verts} verts${cmpTris ? ` · procedural: ${cmpTris} tris` : ''}\n`
    + `${size.map((v) => v.toFixed(2)).join(' x ')} m  (w x h x l)\n`
    + `min y ${m.min[1].toFixed(3)}  ·  z ${m.min[2].toFixed(2)} .. ${m.max[2].toFixed(2)}\n`
    + `${lic.pack || '?'} — ${lic.author || '?'} — ${lic.license || '?'}\n`
    + (wantCmp ? `converted at x ${(-gap).toFixed(1)} m, today's geometry at x +${gap.toFixed(1)} m`
      : 'converted model only')
    + (WHEELS_FOR[slug] ? '\nboth carry the GAME\u2019S own wheels' : '');
  $('stats').textContent = stats;
}

// A MeshBuilder holding the model, so it can be appended and shifted like any
// other lab geometry rather than drawn from its own matrix.
function modelBuilder(m) {
  const b = new MeshBuilder();
  const d = modelMeshData(m);
  for (let i = 0; i < m.verts; i++) {
    const p = i * 3;
    b.vert(m.positions[p], m.positions[p + 1], m.positions[p + 2],
      m.normals[p], m.normals[p + 1], m.normals[p + 2],
      [m.colors[p], m.colors[p + 1], m.colors[p + 2]]);
  }
  for (let i = 0; i < m.indices.length; i += 3) {
    b.tri(m.indices[i], m.indices[i + 1], m.indices[i + 2]);
  }
  void d;
  return b;
}

function shift(b, dx, dy, dz) {
  for (let i = 0; i < b.v.length; i += 9) { b.v[i] += dx; b.v[i + 1] += dy; b.v[i + 2] += dz; }
  b.min[0] += dx; b.max[0] += dx; b.min[1] += dy; b.max[1] += dy; b.min[2] += dz; b.max[2] += dz;
  return b;
}

// ------------------------------------------------------------------------ ui

let yaw = 0.7, pitch = -0.24, dist = 1, drag = null;
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
  const sel = $('model');
  if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    const n = sel.options.length;
    sel.selectedIndex = (sel.selectedIndex + (e.code === 'ArrowRight' ? 1 : n - 1)) % n;
    rebuild();
  }
  if (e.code === 'Space') { spin = !spin; e.preventDefault(); }
});
for (const id of ['model', 'cmp', 'ground']) $(id).addEventListener('change', rebuild);
$('spin').addEventListener('click', () => { spin = !spin; });

const mm = m4.create();
function frame(t) {
  requestAnimationFrame(frame);
  const a = yaw + (spin && !drag ? t * 0.00018 : 0);
  const d = baseDist * dist;
  const cp = [
    target[0] + Math.sin(a) * d * Math.cos(pitch),
    target[1] - Math.sin(pitch) * d,
    target[2] + Math.cos(a) * d * Math.cos(pitch),
  ];
  r.begin(cp, a, pitch, 0.9);
  m4.identity(mm);
  if (groundMesh) r.draw(groundMesh, mm);
  if (modelMesh) r.draw(modelMesh, mm);
  r.end();
}
requestAnimationFrame(frame);

// The lab is the ONE page that must complain loudly when the models are
// missing: everywhere else in the game their absence is a normal state.
loadModels(r, { base: '../../assets/models/' }).then((got) => {
  reg = got;
  const sel = $('model');
  for (const e of reg.entries) {
    const o = document.createElement('option');
    o.value = e.slug; o.textContent = `${e.slug}  (${e.kind})`;
    sel.appendChild(o);
  }
  if (!reg.list.length) { $('stats').textContent = 'no models — run node tools/build_models.mjs'; return; }
  rebuild();
  // What the headless screenshot pass drives (tools/shots_models.mjs).
  window.LAB = {
    reg,
    slugs: reg.list,
    select(slug) { $('model').value = slug; rebuild(); },
    compare(on) { $('cmp').value = on ? 'auto' : 'none'; rebuild(); },
    ground(kind) { $('ground').value = kind; rebuild(); },
    view(y, p, d) { yaw = y; pitch = p; dist = d; spin = false; },
    get stats() { return stats; },
    ready: true,
  };
});
void mulberry32;
