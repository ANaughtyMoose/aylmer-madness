// Turntable viewer for the six Ottawa hero landmarks. Served by ./serve.sh at
//   http://localhost:8123/src/game/ottawa_lab.html
//
// Same idea as houses_lab.js, and the same reason to exist: iterating on a
// building through the full game means waiting out a four-second world bake and
// a drive across the river every time. This loads mapdata (for the real
// footprints), builds one landmark, and draws it — nothing else. On a loaded
// machine that is the difference between one look a minute and one a second.
//
// The "driver" eye is the one that matters: 1.5 m off the ground on the far
// kerb, which is where the player actually sees these buildings from.
import { Renderer } from '../core/gl.js';
import { MeshBuilder } from '../core/mesh.js';
import { m4 } from '../core/math.js';
// The baked footprints, not the live map: importing ottawa.js here would drag
// in 21 MB of map modules and put a long synchronous parse in front of every
// reload, which is exactly what this page exists to avoid. Regenerate them with
// tools/build_hero_rings.mjs; tools/smoke_ottawa.mjs checks they still match.
import { HERO, seedRings } from './ottawa_landmarks.js';
import { HERO_RINGS } from './ottawa_hero_rings.js';

seedRings(HERO_RINGS);

const r = new Renderer(document.getElementById('gl'));
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
r.setEnvironment({
  sky: [0.60, 0.70, 0.84], ground: [0.32, 0.40, 0.26], sun: [0.98, 0.94, 0.86],
  lightDir: norm([0.42, 0.82, 0.38]), fog: [0.66, 0.74, 0.84], fogDensity: 0.0004,
});

const $ = (id) => document.getElementById(id);
for (const h of HERO) {
  const o = document.createElement('option');
  o.value = h.key; o.textContent = h.label;
  $('pick').appendChild(o);
}

let mesh = null, ground = null, radius = 60, height = 40;

function build() {
  const h = HERO.find((x) => x.key === $('pick').value) || HERO[0];
  const mb = new MeshBuilder();
  const far = $('lod').value === 'far';
  (far ? h.buildFar : h.build)(mb, h.at);
  mesh = r.upload(mb.finish());
  // The mesh's own bounds decide the framing, so a 92 m tower and a 9 m market
  // building both fill the view without a per-landmark camera table.
  const lo = mesh.min, hi = mesh.max;
  // Circumradius, not half the longest side: viewed along a diagonal the near
  // corner of a 134 x 130 m building is 93 m from the centre, not 67, and a
  // camera placed for the smaller number ends up standing on the wall.
  radius = Math.hypot(hi[0] - lo[0], hi[2] - lo[2]) / 2;
  height = hi[1] - lo[1];
  centre = [(lo[0] + hi[0]) / 2, 0, (lo[2] + hi[2]) / 2];

  // A patch of grass, so the building has something to stand on and the eye has
  // a horizon to judge its height against.
  const g = new MeshBuilder();
  const s = radius * 6;
  g.flat(centre[0] - s, centre[2] - s, centre[0] + s, centre[2] + s, -0.05, [0.34, 0.42, 0.27]);
  ground = r.upload(g.finish());

  $('stats').textContent = [
    `${h.label}`,
    `${far ? 'far' : 'near'} LOD  ${mb.i.length / 3} tris  (budget ${far ? h.farBudget : h.budget})`,
    `footprint ${(hi[0] - lo[0]).toFixed(0)} x ${(hi[2] - lo[2]).toFixed(0)} m`,
    `height ${height.toFixed(1)} m`,
    `OSM ways ${h.ids.join(', ')}`,
  ].join('\n');
}

let centre = [0, 0, 0];
let yaw = 0.7, pitch = 0.22, dist = 1, drag = false, spin = true, lastX = 0, lastY = 0;

for (const id of ['pick', 'lod', 'eye']) $(id).onchange = build;
addEventListener('keydown', (e) => {
  const sel = $('pick');
  if (e.key === 'ArrowRight') { sel.selectedIndex = (sel.selectedIndex + 1) % sel.length; build(); }
  if (e.key === 'ArrowLeft') { sel.selectedIndex = (sel.selectedIndex + sel.length - 1) % sel.length; build(); }
  if (e.key === ' ') { spin = !spin; e.preventDefault(); }
});
const cv = $('gl');
cv.onpointerdown = (e) => { drag = true; lastX = e.clientX; lastY = e.clientY; cv.setPointerCapture(e.pointerId); };
cv.onpointerup = () => { drag = false; };
cv.onpointermove = (e) => {
  if (!drag) return;
  yaw -= (e.clientX - lastX) * 0.006;
  pitch = Math.max(-0.35, Math.min(1.2, pitch + (e.clientY - lastY) * 0.004));
  lastX = e.clientX; lastY = e.clientY;
};
cv.onwheel = (e) => { dist = Math.max(0.25, Math.min(4, dist * (1 + Math.sign(e.deltaY) * 0.12))); e.preventDefault(); };

build();

// The lab is deliberately reachable from a script: tools/shots_ottawa.mjs falls
// back to it when the full game's bake is too slow to wait out.
window.LAB = {
  show(key, lod = 'near', eye = 'driver') {
    $('pick').value = key; $('lod').value = lod; $('eye').value = eye;
    build(); return $('stats').textContent;
  },
  view(y, p, d) { yaw = y; pitch = p; dist = d; spin = false; },
  spin(on) { spin = !!on; },
  // Take the panel out of the frame before a screenshot; it sits exactly where
  // a tall building's top does.
  chrome(on) { for (const id of ['ui', 'hint']) $(id).style.display = on ? '' : 'none'; },
  keys: HERO.map((h) => h.key),
};

const mm = m4.create();
function frame(t) {
  requestAnimationFrame(frame);
  const a = yaw + (spin && !drag ? t * 0.00012 : 0);
  const driver = $('eye').value === 'driver';
  // Driver: eye height 1.5 m, standing back about a building's width — the far
  // kerb of a wide street, which is where you first get the whole elevation in
  // a windscreen. Orbit: up and out, the way you would frame a photograph.
  const d = driver ? (radius * 1.25 + height * 0.55) * dist
    : (radius * 2.0 + height * 1.2) * dist;
  const pit = driver ? 0 : pitch;
  const eyeY = driver ? 1.5 : height * 0.55 + Math.sin(pit) * d;
  const cp = [
    centre[0] + Math.sin(a) * d * Math.cos(pit),
    eyeY,
    centre[2] + Math.cos(a) * d * Math.cos(pit),
  ];
  // Aim a little above half height so the roofline — which is the whole point
  // of these six — sits in frame rather than off the top of it. Positive
  // camPitch looks UP in this renderer (see houses_lab.js, which drops the
  // camera below the target for a positive pitch), so this is NOT negated.
  const aim = driver ? height * 0.58 : height * 0.45;
  r.begin(cp, a, Math.atan2(aim - cp[1], d), 0.9);
  m4.identity(mm);
  if (ground) r.draw(ground, mm);
  if (mesh) r.draw(mesh, mm);
  r.end();
}
requestAnimationFrame(frame);
