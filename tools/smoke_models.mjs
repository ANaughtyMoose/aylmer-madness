#!/usr/bin/env node
// The converter, the mesh format and the shipped model manifest, checked
// without a browser.
//   node tools/smoke_models.mjs
//
// The fixtures in tools/fixtures/ are hand-built so every assertion here has a
// number that was worked out on paper, not read off the tool it is testing.
// What each group is really guarding:
//   * winding — a mirrored node instance (negative scale) has inside-out
//     triangles, and the renderer culls by winding. A model that renders as a
//     hollow shell from outside is this bug.
//   * axis fixes are ROTATIONS, not mirrors: +x -> +z must also send +z -> -x,
//     or the truck arrives correct in silhouette and inside out in fact.
//   * colours come out sRGB, because the shader multiplies the texture by the
//     vertex colour and every other colour in the game is a hex sRGB triple.
import { readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run } from './gltf2mesh.mjs';
import { loadModelDoc } from '../src/game/models.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = join(ROOT, 'tools/fixtures');
const TMP = join(ROOT, 'tools/.smoke_models_tmp');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

let checks = 0;
const fails = [];
function ok(cond, what) {
  checks++;
  if (!cond) fails.push(what);
}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;
const conv = (args) => run([...args, '--quiet']);

// --------------------------------------------------------------- mesh helpers

// Signed volume via the divergence theorem: sum of dot(a, cross(b, c)) / 6.
// Positive for a closed mesh wound counter-clockwise seen from outside, and
// negative — by exactly the same magnitude — for one that is inside out. This
// is the single number that catches a mirrored instance nobody re-wound.
function signedVolume(m) {
  let v = 0;
  for (let i = 0; i < m.idx.length; i += 3) {
    const a = m.idx[i] * 3, b = m.idx[i + 1] * 3, c = m.idx[i + 2] * 3;
    const ax = m.pos[a], ay = m.pos[a + 1], az = m.pos[a + 2];
    const bx = m.pos[b], by = m.pos[b + 1], bz = m.pos[b + 2];
    const cx = m.pos[c], cy = m.pos[c + 1], cz = m.pos[c + 2];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

// Triangles whose winding disagrees with the normal their vertices carry.
// Same idea as tools/car_views.mjs's check on the procedural cars.
function windingMismatches(m) {
  let bad = 0;
  for (let i = 0; i < m.idx.length; i += 3) {
    const a = m.idx[i] * 3, b = m.idx[i + 1] * 3, c = m.idx[i + 2] * 3;
    const ux = m.pos[b] - m.pos[a], uy = m.pos[b + 1] - m.pos[a + 1], uz = m.pos[b + 2] - m.pos[a + 2];
    const vx = m.pos[c] - m.pos[a], vy = m.pos[c + 1] - m.pos[a + 1], vz = m.pos[c + 2] - m.pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) continue;
    const sn = [0, 1, 2].map((k) => (m.nor[a + k] + m.nor[b + k] + m.nor[c + k]) / 3);
    if ((nx * sn[0] + ny * sn[1] + nz * sn[2]) / l < 0) bad++;
  }
  return bad;
}

function worstNormalError(m) {
  let worst = 0;
  for (let i = 0; i < m.nor.length; i += 3) {
    const l = Math.hypot(m.nor[i], m.nor[i + 1], m.nor[i + 2]);
    worst = Math.max(worst, Math.abs(l - 1));
  }
  return worst;
}

const srgb = (lin) => (lin <= 0.0031308 ? lin * 12.92 : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055);

// ------------------------------------------------------------- 1. the cube
// 2 m cube, no NORMAL in the source, one baseColorFactor material.

const cube = conv([join(FIX, 'cube.gltf'), '--out', join(TMP, 'cube.json'), '--slug', 'cube']);
ok(cube.verts === 24, `cube: 24 verts (got ${cube.verts})`);
ok(cube.tris === 12, `cube: 12 tris (got ${cube.tris})`);
ok(cube.min.every((v) => near(v, -1)) && cube.max.every((v) => near(v, 1)),
  `cube: bounds are ±1 (got ${cube.min} .. ${cube.max})`);
ok(near(signedVolume(cube), 8, 1e-6), `cube: signed volume is +8 m³ (got ${signedVolume(cube).toFixed(4)})`);
ok(windingMismatches(cube) === 0, `cube: every triangle agrees with its normal (${windingMismatches(cube)} bad)`);
ok(worstNormalError(cube) < 1e-6, `cube: normals are unit length (worst ${worstNormalError(cube)})`);
// The source has no NORMAL, so these were computed. Each box face is its own
// four vertices, so the answer must come out flat: ±1 on exactly one axis.
{
  let axisAligned = 0;
  for (let i = 0; i < cube.nor.length; i += 3) {
    const c = [cube.nor[i], cube.nor[i + 1], cube.nor[i + 2]].filter((v) => Math.abs(Math.abs(v) - 1) < 1e-6);
    if (c.length === 1) axisAligned++;
  }
  ok(axisAligned === 24, `cube: computed normals are flat and axis-aligned (${axisAligned}/24)`);
}
// linear (0.8, 0.2, 0.1) -> sRGB
ok(near(cube.col[0], srgb(0.8), 5e-4) && near(cube.col[1], srgb(0.2), 5e-4) && near(cube.col[2], srgb(0.1), 5e-4),
  `cube: baseColorFactor arrives as sRGB (got ${cube.col.slice(0, 3)}, want ${[0.8, 0.2, 0.1].map(srgb)})`);

// The .glb container must produce exactly the same mesh as the .gltf + .bin.
const cubeGlb = conv([join(FIX, 'cube.glb'), '--out', join(TMP, 'cube_glb.json'), '--slug', 'cube']);
// Same slug on both, so the only thing left that could differ is the geometry.
const stripSource = (t) => t.replace(/"source":"[^"]*",/, '');
ok(stripSource(readFileSync(join(TMP, 'cube.json'), 'utf8'))
  === stripSource(readFileSync(join(TMP, 'cube_glb.json'), 'utf8')),
  'glb: the binary container converts identically to the .gltf + .bin pair');
ok(cubeGlb.tris === 12, 'glb: 12 tris');

// --maxTris must REFUSE, not truncate: shipping 40k tris quietly is the failure
// mode the flag exists to prevent.
{
  let threw = null;
  try { conv([join(FIX, 'cube.gltf'), '--out', join(TMP, 'nope.json'), '--maxTris', '11']); }
  catch (e) { threw = e; }
  ok(threw && /maxTris/.test(threw.message), 'maxTris: over budget throws, naming the budget');
  ok(!existsSync(join(TMP, 'nope.json')), 'maxTris: nothing is written when it refuses');
}
ok(conv([join(FIX, 'cube.gltf'), '--out', join(TMP, 'cube2.json'), '--maxTris', '12']).tris === 12,
  'maxTris: exactly at budget is allowed');

// --scale is metres, applied after the axis fixes: one number or three.
{
  const s = conv([join(FIX, 'cube.gltf'), '--out', join(TMP, 'cube_s.json'), '--scale', '2.5']);
  ok(s.max.every((v) => near(v, 2.5)), `scale: ±1 becomes ±2.5 (got ${s.max})`);
  ok(near(signedVolume(s), 125, 1e-4), 'scale: positive scale keeps the winding');
  const n = conv([join(FIX, 'cube.gltf'), '--out', join(TMP, 'cube_n.json'), '--scale', '3,1,0.5']);
  ok(near(n.max[0], 3) && near(n.max[1], 1) && near(n.max[2], 0.5),
    `scale: SX,SY,SZ scales per axis (got ${n.max})`);
  ok(near(signedVolume(n), 8 * 3 * 1 * 0.5, 1e-4), 'scale: a non-uniform scale still winds outward');
  ok(worstNormalError(n) < 1e-6, 'scale: normals stay unit length under a non-uniform scale');
  ok(windingMismatches(n) === 0,
    'scale: normals go through the INVERSE scale, so they still agree with the faces');
}

// ------------------------------------------------------- 2. the axis fixes
// Every --forward is a ROTATION about Y. Two things must hold at once: the
// named axis lands on +Z, and the volume stays positive. Checking only the
// first accepts a mirror, which is the bug this pins.
{
  const base = conv([join(FIX, 'pickup.gltf'), '--out', join(TMP, 'p_base.json')]);
  const V = signedVolume(base);
  ok(V > 0, `pickup: the source itself is wound outward (volume ${V.toFixed(3)})`);
  for (const [fwd, want] of [['+z', 'z'], ['-z', 'z'], ['+x', 'x'], ['-x', 'x']]) {
    const m = conv([join(FIX, 'pickup.gltf'), '--out', join(TMP, `p_${want}${fwd[0]}.json`), '--forward', fwd]);
    ok(near(signedVolume(m), V, 1e-4), `forward ${fwd}: volume unchanged — a rotation, not a mirror`);
    ok(windingMismatches(m) === 0, `forward ${fwd}: no triangle disagrees with its normal`);
    ok(near(m.max[1], base.max[1], 1e-6), `forward ${fwd}: height is untouched`);
  }
}

// ------------------------------------------------- 3. the pickup lands right
// Authored nose along +X, floating 0.35 m, wheelbase 2.75, track 1.67. The
// grille is the only geometry that reaches 2.55 from the axle midpoint, so
// "the far end of the box is at +z" is a proof the nose turned the right way.
// The fixture's own numbers, which are the Ranger's own numbers: see
// tools/fixtures/make_fixtures.mjs on why TRACK is 1.66 and not the 1.67 the
// cars.js spec table writes down.
const NOSE = 2.55, TAIL = 2.39, FLOAT = 0.35, WB = 2.75, TRACK = 1.66;
{
  const p = conv([join(FIX, 'pickup.gltf'), '--out', join(TMP, 'p_nose.json'), '--forward', '+x']);
  ok(near(p.max[2], NOSE), `forward +x: the nose lands at +z (max z ${p.max[2]}, want ${NOSE})`);
  ok(near(p.min[2], -TAIL), `forward +x: the tail lands at -z (min z ${p.min[2]}, want ${-TAIL})`);
  ok(near(p.min[1], FLOAT), `forward +x: without --center the truck still floats (${p.min[1]})`);
  ok(near(p.max[0], TRACK / 2 + 0.12) && near(p.min[0], -(TRACK / 2 + 0.12)),
    `forward +x: the track becomes the x axis (${p.min[0]} .. ${p.max[0]})`);
}

const truck = conv([join(FIX, 'pickup.gltf'), '--out', join(TMP, 'pickup.json'), '--forward', '+x', '--center']);
ok(near(truck.min[1], 0), `--center: the truck sits on y = 0 (min y ${truck.min[1]})`);
ok(near((truck.min[0] + truck.max[0]) / 2, 0) && near((truck.min[2] + truck.max[2]) / 2, 0),
  '--center: centred in x and z');
ok(windingMismatches(truck) === 0,
  `pickup: the two MIRRORED wheel instances were re-wound (${windingMismatches(truck)} bad triangles)`);
ok(signedVolume(truck) > 0, 'pickup: the whole truck is wound outward');
ok(worstNormalError(truck) < 1e-6, `pickup: normals are unit length (worst ${worstNormalError(truck)})`);

// Four wheels ON THE GROUND: one contact patch within 2 cm of each expected
// (x, z). A truck whose wheels float, or whose wheels ended up on one side, is
// the thing that looks fine on a turntable and wrong in the game.
{
  // --center shifted z by -(NOSE - TAIL) / 2, so the axles moved with it.
  const dz = -(NOSE - TAIL) / 2;
  const want = [
    [TRACK / 2, WB / 2 + dz], [-TRACK / 2, WB / 2 + dz],
    [TRACK / 2, -WB / 2 + dz], [-TRACK / 2, -WB / 2 + dz],
  ];
  // 0.4 m is a wheel's own footprint and a quarter of the track, so a patch
  // cannot be credited to the wrong corner.
  const R = 0.34;
  let found = 0, strays = 0, low = 0;
  for (const [wx, wz] of want) {
    let hit = false;
    for (let i = 0; i < truck.pos.length; i += 3) {
      if (truck.pos[i + 1] > 0.02) continue;
      if (Math.hypot(truck.pos[i] - wx, truck.pos[i + 2] - wz) <= R + 0.06) { hit = true; break; }
    }
    if (hit) found++;
  }
  for (let i = 0; i < truck.pos.length; i += 3) {
    if (truck.pos[i + 1] > 0.02) continue;
    low++;
    if (!want.some(([wx, wz]) => Math.hypot(truck.pos[i] - wx, truck.pos[i + 2] - wz) <= R + 0.06)) strays++;
  }
  ok(found === 4, `pickup: all four wheels touch y = 0 at the right (x, z) (${found}/4)`);
  ok(low > 0 && strays === 0,
    `pickup: nothing but the wheels reaches the ground (${strays} stray of ${low} low verts)`);
}

// The Ranger's own spec, so a converted body can be told to fit it.
{
  const { CARS } = await import('../src/game/cars.js');
  const ranger = CARS.find((c) => c.id === 'ranger');
  ok(near(ranger.wheelbase, WB, 1e-9) && near(ranger.track, TRACK, 1e-9),
    'pickup: the fixture is built to the real Ranger wheelbase and track');
  // The game hangs its own wheels at ±wheelbase/2 in z. A converted body has to
  // put its arches there, or the tyres come out through the doors.
  ok(near(truck.max[2] - truck.min[2], ranger.len + 0.16, 1e-6),
    'pickup: overall length is the Ranger plus its grille bumper');
}

// --offset moves the origin after everything else, which is how a body whose
// overhangs are unequal gets its origin onto the axle midpoint rather than the
// centre of its bounding box.
{
  const m = conv([join(FIX, 'pickup.gltf'), '--out', join(TMP, 'p_off.json'),
    '--forward', '+x', '--center', '--offset', '0,0.5,-1.25']);
  ok(near(m.min[1], truck.min[1] + 0.5) && near(m.min[2], truck.min[2] - 1.25),
    `--offset: shifts after --center (${m.min})`);
  ok(near(m.max[0], truck.max[0]), '--offset: leaves the axes it was not given alone');
  ok(near(signedVolume(m), signedVolume(truck), 1e-4), '--offset: a translation changes no volume');
}

// ------------------------------------------------------------- 4. colours
// COLOR_0 wins, then baseColorFactor, then the average of baseColorTexture.
{
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const seen = new Map();
  for (let i = 0; i < truck.col.length; i += 3) {
    const k = truck.col.slice(i, i + 3).map((v) => v.toFixed(3)).join(',');
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  const green = [46, 122, 52].map((v) => srgb(v / 255));
  ok([...seen.keys()].some((k) => k === green.map((v) => v.toFixed(3)).join(',')),
    `colour: COLOR_0 beats baseColorFactor on the bed (want ${green.map((v) => v.toFixed(3))}, saw ${[...seen.keys()]})`);
  ok([...seen.keys()].some((k) => k === [0.78, 0.76, 0.70].map((v) => srgb(v).toFixed(3)).join(',')),
    'colour: baseColorFactor is used where there is no COLOR_0');
  // The tyre PNG is (60,60,64) (30,30,34) (40,40,44) (20,20,24) in sRGB. Mean
  // taken in LINEAR light and re-encoded — mixing sRGB numbers directly gives a
  // visibly different, and wrong, grey.
  const lin = [[60, 60, 64], [30, 30, 34], [40, 40, 44], [20, 20, 24]];
  const avg = [0, 1, 2].map((k) => srgb(lin.reduce((s, p) => s + toLin(p[k] / 255), 0) / 4));
  ok([...seen.keys()].some((k) => k === avg.map((v) => v.toFixed(3)).join(',')),
    `colour: the tyres take the average of their baseColorTexture (want ${avg.map((v) => v.toFixed(3))})`);
  // The SIGN is one primitive whose two halves point at two different texels of
  // that 2x2 PNG. Both texels must come out separately, or the converter has
  // flattened the texture to one average — which is what turns a Kenney
  // palette-atlas kit into a grey blob.
  const texel = (r, g, b) => [r, g, b].map((v) => srgb(toLin(v / 255)).toFixed(3)).join(',');
  ok([...seen.keys()].includes(texel(40, 40, 44)),
    'colour: a textured primitive is sampled PER VERTEX (lower texel)');
  ok([...seen.keys()].includes(texel(30, 30, 34)),
    'colour: ...and its other half gets the other texel, not their average');
  ok(seen.size === 6,
    `colour: four flat materials plus the sign's two sampled texels (got ${seen.size}: ${[...seen.keys()]})`);
}

// --material repaints by name, and says so when a name matched nothing —
// a silent no-op would ship the model in the kit's own palette.
{
  const m = conv([join(FIX, 'pickup.gltf'), '--out', join(TMP, 'p_paint.json'),
    '--material', 'Paint=#1c8f83', '--material', 'Tyre=#17181a']);
  const has = (hex) => {
    const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    for (let i = 0; i < m.col.length; i += 3) {
      if (Math.abs(m.col[i] - want[0]) < 1e-3 && Math.abs(m.col[i + 1] - want[1]) < 1e-3
        && Math.abs(m.col[i + 2] - want[2]) < 1e-3) return true;
    }
    return false;
  };
  ok(has('#1c8f83'), '--material: repaints the named material, sRGB hex as written');
  ok(has('#17181a'), '--material: beats the baseColorTexture average too');
  ok(m.warnings.length === 0, `--material: no warning when every name matched (${m.warnings})`);
  const typo = conv([join(FIX, 'pickup.gltf'), '--out', join(TMP, 'p_typo.json'), '--material', 'Pain=#ff0000']);
  ok(typo.warnings.some((w) => /matched no material/.test(w)),
    '--material: a name that matched nothing warns rather than silently doing nothing');
}

// ----------------------------------------------------------- 5. UVs and IO
{
  const noUv = JSON.parse(readFileSync(join(TMP, 'pickup.json'), 'utf8'));
  ok(noUv.uv === false && noUv.uvs === undefined, 'uv: off by default, and no stray array');
  conv([join(FIX, 'pickup.gltf'), '--out', join(TMP, 'p_uv.json'), '--uv']);
  const withUv = JSON.parse(readFileSync(join(TMP, 'p_uv.json'), 'utf8'));
  ok(withUv.uv === true && withUv.uvs.length === withUv.verts * 2,
    '--uv: a UV pair per vertex, parallel with the positions');
}

// Over --maxJson the payload moves to a sibling .bin. Same mesh, read back.
{
  conv([join(FIX, 'pickup.gltf'), '--out', join(TMP, 'p_bin.json'), '--forward', '+x', '--center', '--maxJson', '512']);
  const doc = JSON.parse(readFileSync(join(TMP, 'p_bin.json'), 'utf8'));
  ok(doc.bin === 'p_bin.bin' && existsSync(join(TMP, 'p_bin.bin')), 'bin: a big mesh spills to a .bin');
  ok(!doc.positions, 'bin: the .json keeps only the header');
  const back = await loadModelDoc(doc, (name) =>
    Promise.resolve(readFileSync(join(TMP, name)).buffer.slice(0)));
  ok(back.positions.length === truck.pos.length && back.indices.length === truck.idx.length,
    'bin: the loader reads back the same array lengths');
  let worst = 0;
  for (let i = 0; i < back.positions.length; i++) {
    worst = Math.max(worst, Math.abs(back.positions[i] - truck.pos[i]));
  }
  ok(worst < 1e-5, `bin: positions survive the round trip (worst ${worst})`);
  ok(back.indices.every((v, i) => v === truck.idx[i]), 'bin: indices survive the round trip');
}

// The JSON path goes through the same loader.
{
  const doc = JSON.parse(readFileSync(join(TMP, 'pickup.json'), 'utf8'));
  const m = await loadModelDoc(doc, () => { throw new Error('should not fetch a bin'); });
  ok(m.positions instanceof Float32Array && m.normals instanceof Float32Array
    && m.colors instanceof Float32Array && m.indices instanceof Uint32Array,
    'json: the loader hands back typed arrays in the layout upload() wants');
  ok(m.tris === truck.tris && m.positions.length === truck.verts * 3, 'json: counts match the header');
}

// ---------------------------------------------------- 6. the licence block
{
  const doc = JSON.parse(readFileSync(join(TMP, 'pickup.json'), 'utf8'));
  const side = JSON.parse(readFileSync(join(FIX, 'pickup.license.json'), 'utf8'));
  ok(JSON.stringify(doc.license) === JSON.stringify(side),
    'licence: the sidecar is copied verbatim into the model');
  ok(doc.format === 'aylmer-mesh-1' && doc.slug === 'pickup', 'header: format and slug');
}

// ------------------------------------------------- 7. what actually shipped
// The manifest is an OPTIONAL asset (models.js is silent without it), but if it
// is there every entry has to be real, in budget, and licensed.
const MODELS = join(ROOT, 'assets/models');
if (existsSync(join(MODELS, 'manifest.json'))) {
  const man = JSON.parse(readFileSync(join(MODELS, 'manifest.json'), 'utf8'));
  ok(Array.isArray(man.models) && man.models.length > 0, 'manifest: lists models');
  const budget = { prop: 600, vehicle: 6000 };
  const slugs = new Set();
  let totalTris = 0;
  for (const entry of man.models) {
    const file = join(MODELS, `${entry.slug}.json`);
    ok(!slugs.has(entry.slug), `manifest: ${entry.slug} is listed once`);
    slugs.add(entry.slug);
    ok(existsSync(file), `manifest: ${entry.slug}.json exists`);
    if (!existsSync(file)) continue;
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    ok(doc.format === 'aylmer-mesh-1', `${entry.slug}: known format`);
    ok(doc.slug === entry.slug, `${entry.slug}: slug matches its filename`);
    ok(doc.tris > 0, `${entry.slug}: has triangles`);
    totalTris += doc.tris;
    const cap = budget[entry.kind];
    ok(cap !== undefined, `${entry.slug}: kind is prop or vehicle (got ${entry.kind})`);
    if (cap) {
      ok(doc.tris <= cap, `${entry.slug}: ${doc.tris} tris is inside the ${entry.kind} budget of ${cap}`);
    }
    // Nothing ships without an explicit CC0 line. This is the check that keeps
    // "I'll add the licence later" from becoming "we shipped someone's model".
    ok(doc.license && /CC0/i.test(doc.license.license || ''),
      `${entry.slug}: carries an explicit CC0 licence`);
    ok(doc.license && doc.license.source && doc.license.author,
      `${entry.slug}: licence names a source URL and an author`);
    // Nothing is allowed to be a degenerate blob: a real model has a real box.
    const size = [0, 1, 2].map((k) => doc.bounds.max[k] - doc.bounds.min[k]);
    ok(size.every((v) => v > 0.02 && v < 60), `${entry.slug}: bounds are plausible (${size.map((v) => v.toFixed(2))})`);
    if (entry.kind === 'prop' && entry.ground !== false) {
      ok(Math.abs(doc.bounds.min[1]) < 0.02, `${entry.slug}: stands on y = 0 (min y ${doc.bounds.min[1]})`);
    }
  }
  const licenses = readFileSync(join(MODELS, 'LICENSES.md'), 'utf8');
  for (const slug of slugs) {
    ok(licenses.includes(slug), `LICENSES.md names ${slug}`);
  }
  console.log(`manifest: ${man.models.length} models, ${totalTris} tris total`);
}

rmSync(TMP, { recursive: true, force: true });
console.log(`${checks - fails.length}/${checks} checks passed`);
if (fails.length) {
  for (const f of [...new Set(fails)]) console.error('FAIL:', f);
  process.exit(1);
}
console.log('OK: gltf2mesh converts, winds, colours and grounds correctly');
