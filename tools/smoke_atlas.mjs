// Headless check of the material atlas + materials.js UV maths.
//   node tools/smoke_atlas.mjs
// No browser, no GL: loadMaterials() takes a stub renderer and the manifest
// straight off disk, and MeshBuilder is pure arithmetic.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { MeshBuilder, rgb, STRIDE } from '../src/core/mesh.js';
import { loadMaterials } from '../src/game/materials.js';
import { buildDemoScene, SAMPLES } from '../src/game/houses_demo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

let checks = 0;
const fails = [];
function ok(cond, what) {
  checks++;
  if (!cond) fails.push(what);
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/materials/atlas.json'), 'utf8'));
const stubRenderer = {
  calls: [],
  texture(image, opts) { this.calls.push(opts); return { stub: 'texture' }; },
};
const mats = await loadMaterials(stubRenderer, { manifest, image: { stub: 'image' } });

// ---------------------------------------------------------------- 1. manifest
ok(manifest.size === 2048, 'atlas is 2048 px');
ok(mats.list.length === Object.keys(manifest.tiles).length, 'every tile is listed');
ok(stubRenderer.calls.length === 1 && stubRenderer.calls[0].aniso === 16,
  'the atlas asks for anisotropic filtering');

const boxes = [];
for (const name of mats.list) {
  const t = mats.uv(name);
  const r = mats.rect(name);
  ok(t.u0 >= 0 && t.v0 >= 0 && t.u1 <= 1 && t.v1 <= 1, `${name}: rect inside the atlas`);
  ok(t.u1 > t.u0 && t.v1 > t.v0, `${name}: rect is non-empty`);
  ok(near(r[0], t.u0) && near(r[1], t.v0) && near(r[2], t.u1 - t.u0) && near(r[3], t.v1 - t.v0),
    `${name}: rect() matches the manifest`);
  ok(typeof t.metres === 'number' && t.metres > 0, `${name}: has a metres size`);
  ok(typeof t.tiled === 'boolean', `${name}: has a tiled flag`);
  for (const [on, o] of boxes) {
    if (t.u0 < o.u1 && o.u0 < t.u1 && t.v0 < o.v1 && o.v0 < t.v1) {
      fails.push(`${name} overlaps ${on}`);
    }
  }
  boxes.push([name, t]);
}
const px = (v) => v * manifest.size;
ok(px(mats.uv('flat').u0) <= 16 && px(mats.uv('flat').v0) <= 16,
  "'flat' is the first cell, so UV (0,0) samples white");

const expect = {
  brick_red: 0.6, brick_brown: 0.6, brick_buff: 0.6, stone_grey: 0.9, stone_beige: 0.9,
  vinyl_white: 0.6, vinyl_beige: 0.6, vinyl_grey: 0.6, vinyl_blue: 0.6, vinyl_green: 0.6,
  clapboard_white: 0.6, clapboard_yellow: 0.6, stucco: 1.2,
  shingle_dark: 0.8, shingle_brown: 0.8, shingle_grey: 0.8, cedar: 0.8, flat: 1.0,
};
for (const [name, m] of Object.entries(expect)) {
  ok(mats.has(name), `${name} exists`);
  ok(mats.has(name) && near(mats.metres(name), m), `${name} repeats every ${m} m`);
  ok(mats.has(name) && mats.uv(name).tiled === true, `${name} is tileable`);
}
for (const name of ['window_2pane', 'window_bay', 'window_small', 'door_wood', 'door_white',
  'garage_door_1', 'garage_door_2', 'porch_rail']) {
  ok(mats.has(name), `${name} exists`);
  ok(mats.has(name) && mats.uv(name).tiled === false, `${name} is a decal, not tiled`);
}

// ---------------------------------------------------------------- 2. UV maths
{
  const mb = new MeshBuilder();
  // The headline case: a 6 m wall of brick (0.6 m repeat) is 10 repeats across.
  const q = mats.wallUV(mb, 'brick_red', 6, 2.7);
  ok(near(q.u1 - q.u0, 10, 1e-9), '6 m of brick_red = 10 repeats');
  ok(near(q.v1 - q.v0, 2.7 / 0.6, 1e-9), '2.7 m of brick_red = 4.5 repeats');
  ok(near(q.v1, 1), 'the bottom of a wall lands on a whole tile');
  ok(near(q.u0, 0), 'the left edge starts at a whole tile');
  ok(mb.curRect === mats.rect('brick_red'), 'wallUV arms mb.curRect');
  ok(mb.textured === true, 'wallUV marks the builder textured');
  mats.end(mb);
  ok(mb.curRect === null, 'end() disarms it');

  const s = mats.wallUV(mb, 'shingle_grey', 8, 4);
  ok(near(s.u1 - s.u0, 10, 1e-9), '8 m of shingle_grey (0.8) = 10 repeats');
  const j = mats.wallUV(mb, 'vinyl_blue', 6, 3, { uOffset: 0.5, vOffset: 0.25 });
  ok(near(j.u0, 0.5) && near(j.v1, 1.25), 'uOffset / vOffset shift the pattern');
  const o = mats.wallUV(mb, 'stucco', 6, 3, { metres: 0.5 });
  ok(near(o.u1 - o.u0, 12, 1e-9), 'metres override wins');
  const d = mats.wallUV(mb, 'door_white', 1, 2.1);
  const dt = mats.uv('door_white');
  ok(near(d.u0, dt.u0) && near(d.v1, dt.v1) && d.tiled === false,
    'a decal gets absolute UVs, no repeats');
  ok(mb.curRect === null, 'a decal disarms tiling');
}

// -------------------------------------------------- 3. emitted quads / decals
{
  const mb = new MeshBuilder();
  const white = [1, 1, 1];
  mb.flat(-5, -5, 5, 5, 0, rgb(0x556644));            // untextured first
  const before = mb.vertCount;
  ok(mb.uv.length === 0 && mb.rect.length === 0, 'plain geometry costs no uv/rect bytes');

  mats.quadTex(mb, [0, 0, 0], [6, 0, 0], [6, 2.7, 0], [0, 2.7, 0], 'brick_red');
  ok(mb.vertCount === before + 4, 'quadTex emits four vertices');
  ok(mb.i.length === 6 + 6, 'quadTex emits two triangles');
  const r = mats.rect('brick_red');
  for (let k = 0; k < 4; k++) {
    const o = (before + k) * 4;
    ok(near(mb.rect[o], r[0]) && near(mb.rect[o + 1], r[1])
      && near(mb.rect[o + 2], r[2]) && near(mb.rect[o + 3], r[3]),
      'quad vertices carry the brick sub-rect');
  }
  const uv = mb.uv.slice(before * 2);
  ok(near(uv[0], 0) && near(uv[1], 1), 'bottom-left is (0, 1)');
  ok(near(uv[2], 10, 1e-9) && near(uv[3], 1), 'bottom-right is (10, 1)');
  ok(near(uv[4], 10, 1e-9) && near(uv[5], 1 - 4.5, 1e-9), 'top-right is (10, -3.5)');
  ok(mb.rect.slice(0, before * 4).every((v) => v === 0),
    'the untextured floor backfills to rect 0 -> the white tile');
  ok(mb.uv.slice(0, before * 2).every((v) => v === 0), 'and to UV (0,0)');
  ok(mb.curRect === null, 'quadTex leaves tiling disarmed');

  // A decal: absolute UVs, no rect, and the natural size in metres.
  const at = mb.vertCount;
  mats.decal(mb, 'window_2pane', [3, 1.5, 0], [1, 0, 0], [0, 1, 0], {});
  const t = mats.uv('window_2pane');
  ok(mb.rect.slice(at * 4).every((v) => v === 0), 'a decal carries no sub-rect');
  for (let k = 0; k < 4; k++) {
    const u = mb.uv[(at + k) * 2], v = mb.uv[(at + k) * 2 + 1];
    ok(u >= t.u0 - 1e-9 && u <= t.u1 + 1e-9 && v >= t.v0 - 1e-9 && v <= t.v1 + 1e-9,
      'decal UVs stay inside their cell');
  }
  const sz = mats.decalSize('window_2pane');
  ok(near(sz.w, 1.2) && near(sz.h, 1.2 * 1.3), 'window_2pane is 1.2 x 1.56 m');
  const zs = mb.v.slice(at * STRIDE);
  ok(near(zs[2], 0.02), 'a decal is pushed off the wall so it cannot z-fight');
  ok(near(white[0], 1), 'sanity');

  mb.finish();
  ok(mb.uv.length === mb.vertCount * 2, 'finish() pads the uv stream');
  ok(mb.rect.length === mb.vertCount * 4, 'finish() pads the rect stream');
}

// ---------------------------------------------- 4. every tile is addressable
for (const name of mats.list) {
  const mb = new MeshBuilder();
  mats.quadTex(mb, [0, 0, 0], [3, 0, 0], [3, 2, 0], [0, 2, 0], name);
  mb.finish();
  // A decal-only mesh never arms curRect, so it needs no rect stream at all —
  // attribute 4 stays disabled and the shader reads the constant (0,0,0,0).
  ok(mb.vertCount === 4 && mb.uv.length === 8
    && mb.rect.length === (mats.uv(name).tiled ? 16 : 0),
    `${name}: emits a complete textured quad`);
  const t = mats.uv(name);
  for (let k = 0; k < 4; k++) {
    let u = mb.uv[k * 2], v = mb.uv[k * 2 + 1];
    const rc = mb.rect.slice(k * 4, k * 4 + 4);
    if (rc[2] > 0) {                       // what the fragment shader does
      u = rc[0] + (u - Math.floor(u)) * rc[2];
      v = rc[1] + (v - Math.floor(v)) * rc[3];
    }
    ok(u >= t.u0 - 1e-9 && u <= t.u1 + 1e-9 && v >= t.v0 - 1e-9 && v <= t.v1 + 1e-9,
      `${name}: wrapped UV lands inside its own cell`);
  }
}

// ------------------------------------------------------- 5. the demo scene
{
  const mb = buildDemoScene(mats, { seam: 'brick_red' });
  mb.finish();
  const n = mb.vertCount;
  ok(n > 200, 'the demo scene has geometry');
  ok(mb.v.length === n * STRIDE, 'vertex stream is consistent');
  ok(mb.uv.length === n * 2 && mb.rect.length === n * 4, 'uv / rect streams are parallel');
  ok(Math.max(...mb.i) < n, 'no index runs off the end');
  const known = new Set(mats.list.map((x) => mats.rect(x).join(',')));
  known.add('0,0,0,0');
  let bad = 0;
  for (let k = 0; k < n; k++) {
    if (!known.has(mb.rect.slice(k * 4, k * 4 + 4).join(','))) bad++;
  }
  ok(bad === 0, `every vertex points at a real cell (${bad} bad)`);
  const bytes = mb.v.length * 4 + mb.uv.length * 4 + mb.rect.length * 4;
  console.log(`demo scene: ${SAMPLES.length} houses, ${mb.i.length / 3} tris, ${n} verts, `
    + `${(bytes / n).toFixed(0)} B/vertex (36 plain + 8 uv + 16 rect)`);
}

console.log(`${checks - fails.length}/${checks} checks passed`);
if (fails.length) {
  for (const f of [...new Set(fails)]) console.error('FAIL:', f);
  process.exit(1);
}
console.log('OK: atlas manifest, UV maths and the demo scene all check out');
