// Preview for the three Glenwood bungalows. Served by `node tools/serve.mjs` at
//   http://localhost:8123/src/game/glenwood_lab.html?focus=0&view=front
//
// The three variants stand side by side on their reference-sized footprints with
// the street along +Z, so "front" looks at them the way the photographs do. Goes
// through buildHouse() exactly as world.js does, with opts.glenwood forcing the
// variant, and uses the real atlas when it loads (the stub until then).
import { Renderer } from './renderer.js';
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { m4, mulberry32, clamp } from '../core/math.js';
import STUB from '../game/materials_stub.js';
import { loadMaterials } from '../game/materials.js';
import { buildHouse, GLENWOOD_VARIANTS } from '../game/houses.js';

let MATS = STUB;
const r = new Renderer(document.getElementById('gl'));
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
r.setEnvironment({
  sky: [0.60, 0.70, 0.84], ground: [0.30, 0.33, 0.28], sun: [0.95, 0.90, 0.80],
  lightDir: nrm([0.42, 0.82, 0.38]), fog: [0.66, 0.74, 0.84], fogDensity: 0.0012,
});
const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
for (const k of ['focus', 'lod', 'side']) if (Q.has(k)) $(k).value = Q.get(k);

const SIZE = [[16, 10], [13.5, 10], [9, 8.5]];
const XS = [-24, 0, 21];
const ATTRS = { era: 'midcentury', storeys: 1, link: 'detached', roof: 'gable', garage: 'carport', porch: false };

function rect(w, d, cx, cz) {
  return { k: 'house', h: 5.5, a: 0, c: [cx, cz],
    p: [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]],
    t: [0, 1, 2, 0, 2, 3] };
}

let mesh = null;
const info = [];
function build() {
  const lod = +$('lod').value, side = +$('side').value;
  const mb = new MeshBuilder();
  mb.flat(-60, -40, 60, 40, 0, shade(0x6a8449, 1));
  mb.flat(-60, 14, 60, 22, 0.05, rgb(0x3b3b40));                 // the street, +Z
  mb.flat(-60, 12.2, 60, 13.8, 0.03, rgb(0xa9a59b));             // sidewalk
  info.length = 0;
  GLENWOOD_VARIANTS.forEach((v, i) => {
    const [w, d] = SIZE[i];
    const b = rect(w, d, XS[i], 0);
    // pick the first index whose seed puts the carport/porch on the requested side
    let index = 0;
    for (; index < 64; index++) {
      const res = buildHouse(new MeshBuilder(), b, ATTRS, STUB, mulberry32(1),
        { lod: 2, streetYaw: Math.PI / 2, index, glenwood: v });
      if (res.glenwood && res.glenwood.side === side) break;
    }
    const res = buildHouse(mb, b, ATTRS, MATS, mulberry32(1), { lod, streetYaw: Math.PI / 2, index, glenwood: v });
    info.push({ variant: res.archetype, tris: res.tris, eave: +res.attrs.height.toFixed(2),
      ridge: +res.attrs.ridgeHeight.toFixed(2),
      clearance: Number.isFinite(res.glenwood.clearance) ? +res.glenwood.clearance.toFixed(2) : null,
      side: res.glenwood.side, footprint: `${w} x ${d}` });
  });
  if(mesh)r.free(mesh);
  mesh = r.upload(mb);
  $('stats').textContent = `lod ${lod} · atlas ${MATS === STUB ? 'stub' : 'real'}\n`
    + info.map((s) => `${s.variant.padEnd(17)} ${String(s.tris).padStart(3)} tris  eave ${s.eave}  ridge ${s.ridge}`
      + (s.clearance ? `  carport ${s.clearance} m` : '')).join('\n');
  window.GLENWOOD = { info, atlas: MATS !== STUB, lod };
}

const VIEWS = {
  front: [0, -0.1, 1], back: [Math.PI, -0.1, 1], left: [-Math.PI / 2, -0.1, 1], right: [Math.PI / 2, -0.1, 1],
  aerial: [0.5, -0.85, 1.25], eye: [0.25, -0.02, 0.62], orbit: [0.6, -0.2, 1],
};
let yaw = 0, pitch = -0.1, dist = 1, spin = false, drag = null;
function setView(name) {
  const v = VIEWS[name] || VIEWS.front;
  [yaw, pitch, dist] = v; spin = name === 'orbit';
}
setView(Q.get('view') || 'front');

for (const id of ['focus', 'lod', 'side']) $(id).addEventListener('change', build);
document.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => setView(el.dataset.view)));
addEventListener('pointerdown', (e) => { if (e.target.tagName === 'CANVAS') { drag = [e.clientX, e.clientY]; spin = false; } });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  yaw += (e.clientX - drag[0]) * 0.008;
  pitch = clamp(pitch + (e.clientY - drag[1]) * 0.004, -1.3, -0.01);
  drag = [e.clientX, e.clientY];
});
addEventListener('wheel', (e) => { dist = clamp(dist + e.deltaY * 0.0012, 0.2, 3.5); }, { passive: true });

build();
const drawOpts = { tex: null };
loadMaterials(r, { base: 'assets/materials/' })
  .then((m) => { MATS = m; drawOpts.tex = m.tex; build(); })
  .catch((e) => console.warn('glenwood lab: no atlas, vertex colours only —', e.message));

const mm = m4.create();
function frame(t) {
  requestAnimationFrame(frame);
  const f = +$('focus').value;
  const target = f < 0 ? [0, 2.4, 0] : [XS[f], 2.2, 0];
  const base = f < 0 ? 62 : 24;
  const a = yaw + (spin && !drag ? t * 0.0002 : 0);
  const d = base * dist;
  const cp = [target[0] + Math.sin(a) * d * Math.cos(pitch), target[1] - Math.sin(pitch) * d,
    target[2] + Math.cos(a) * d * Math.cos(pitch)];
  if (cp[1] < 1.2) cp[1] = 1.2;                    // street eye: a driver's height, not the lawn
  r.begin(cp, a, pitch, 0.9);
  m4.identity(mm);
  if (mesh) r.draw(mesh, mm, MATS.tex ? drawOpts : undefined);
  r.end();
}
requestAnimationFrame(frame);
