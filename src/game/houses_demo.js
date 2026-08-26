// Material-atlas turntable: six sample houses, each a different wall + roof
// material, so the tiling scale, the seams and the decals can be eyeballed at
// real-world size before the archetype builders (houses.js, phase 2) land.
//
// Everything the page draws — ground included — goes into ONE MeshBuilder and
// therefore ONE draw call, which is the whole point of the atlas: untextured
// vertex-coloured geometry samples the white 'flat' tile at UV (0,0) and comes
// out exactly as it always did.
import { MeshBuilder, rgb } from '../core/mesh.js';

export const WALLS = [
  'brick_red', 'vinyl_blue', 'clapboard_white', 'stone_grey', 'stucco',
  'brick_buff', 'brick_brown', 'stone_beige', 'vinyl_white', 'vinyl_beige',
  'vinyl_grey', 'vinyl_green', 'clapboard_yellow', 'cedar',
];
export const ROOFS = ['shingle_dark', 'shingle_grey', 'shingle_brown', 'cedar'];

// wall material, roof material, storeys — six recognisably Aylmer recipes.
export const SAMPLES = [
  { wall: 'brick_red', roof: 'shingle_dark', storeys: 2, label: 'Vieux-Aylmer brick two-storey' },
  { wall: 'clapboard_white', roof: 'shingle_grey', storeys: 2, label: 'painted clapboard' },
  { wall: 'brick_buff', roof: 'shingle_brown', storeys: 1, label: '60s brick-veneer bungalow' },
  { wall: 'vinyl_blue', roof: 'shingle_dark', storeys: 1, label: 'vinyl split-level' },
  { wall: 'stone_grey', roof: 'shingle_grey', storeys: 2, label: '2000s stone front' },
  { wall: 'stucco', roof: 'cedar', storeys: 1, label: 'stucco + cedar shakes' },
];

const STOREY = 2.7;

/**
 * One sample house at (cx, cz): a 8 × 6.5 m box with a gabled roof, a front
 * door and a window per storey. Wall/roof come from `s`, geometry is deliberately
 * dumb — this page is about materials, not archetypes.
 */
export function sampleHouse(mb, mats, s, cx, cz, opts = {}) {
  const W = opts.w || 8, D = opts.d || 6.5;
  const h = STOREY * s.storeys;
  const ridge = opts.ridge || 2.2;
  const tint = s.tint || null;
  const hw = W / 2, hd = D / 2;
  const P = (x, y, z) => [cx + x, y, cz + z];
  const o = { tint };

  // four walls, CCW from outside: bottom-left, bottom-right, top-right, top-left
  mats.quadTex(mb, P(-hw, 0, hd), P(hw, 0, hd), P(hw, h, hd), P(-hw, h, hd), s.wall, o);
  mats.quadTex(mb, P(hw, 0, -hd), P(-hw, 0, -hd), P(-hw, h, -hd), P(hw, h, -hd), s.wall, o);
  mats.quadTex(mb, P(hw, 0, hd), P(hw, 0, -hd), P(hw, h, -hd), P(hw, h, hd), s.wall, o);
  mats.quadTex(mb, P(-hw, 0, -hd), P(-hw, 0, hd), P(-hw, h, hd), P(-hw, h, -hd), s.wall, o);

  // gable triangles (ridge runs along X), in the wall material
  mats.faceTex(mb, [P(-hw, h, hd), P(hw, h, hd), P(0, h + ridge, hd)], s.wall,
    { tint, n: [0, 0, 1] });
  mats.faceTex(mb, [P(hw, h, -hd), P(-hw, h, -hd), P(0, h + ridge, -hd)], s.wall,
    { tint, n: [0, 0, -1] });

  // two roof slopes, with a 0.35 m overhang; UV height is the SLOPE length so
  // the shingle courses keep their real size on the pitch.
  const ov = 0.35;
  const rw = hw + ov, rd = hd + ov;
  const pitch = ridge / hd;                    // rise per metre of run
  const eaveY = h - ov * pitch;
  const rise = ridge + ov * pitch;             // ridge -> eave drop over rd
  const slope = Math.hypot(rd, rise);          // real slope length, for the UVs
  const ny = rd / slope, nz = rise / slope;
  mats.quadTex(mb, P(-rw, eaveY, rd), P(rw, eaveY, rd),
    P(rw, h + ridge, 0), P(-rw, h + ridge, 0), s.roof,
    { widthM: rw * 2, heightM: slope, n: [0, ny, nz] });
  mats.quadTex(mb, P(rw, eaveY, -rd), P(-rw, eaveY, -rd),
    P(-rw, h + ridge, 0), P(rw, h + ridge, 0), s.roof,
    { widthM: rw * 2, heightM: slope, n: [0, ny, -nz] });

  // front door + a window beside it, and one window per upper storey
  const right = [1, 0, 0], up = [0, 1, 0];
  mats.decal(mb, s.storeys > 1 ? 'door_wood' : 'door_white',
    P(-1.9, 1.05, hd), right, up, { scale: 1 });
  mats.decal(mb, 'window_2pane', P(1.2, 1.45, hd), right, up, { scale: 1 });
  for (let k = 1; k < s.storeys; k++) {
    mats.decal(mb, 'window_2pane', P(-1.9, k * STOREY + 1.45, hd), right, up, {});
    mats.decal(mb, 'window_2pane', P(1.2, k * STOREY + 1.45, hd), right, up, {});
  }
  mats.decal(mb, 'window_small', P(hw, h - 1.3, 0), [0, 0, -1], up, {});
  return mb;
}

/** A long low slab: the fastest way to spot a repeat seam at a grazing angle. */
export function seamWall(mb, mats, name, cx, cz, opts = {}) {
  const W = opts.w || 40, H = opts.h || 7;
  const P = (x, y, z) => [cx + x, y, cz + z];
  mats.quadTex(mb, P(-W / 2, 0, 0), P(W / 2, 0, 0), P(W / 2, H, 0), P(-W / 2, H, 0), name, {});
  mats.quadTex(mb, P(W / 2, 0, -0.4), P(-W / 2, 0, -0.4), P(-W / 2, H, -0.4), P(W / 2, H, -0.4),
    name, {});
  return mb;
}

/**
 * The whole demo scene in one builder: ground (untextured, vertex colour only),
 * six houses in a 3 × 2 grid, a scale-reference 1.8 m post, and optionally the
 * seam slab behind them.
 */
export function buildDemoScene(mats, opts = {}) {
  const mb = new MeshBuilder();
  mb.textured = true;
  const samples = opts.samples || SAMPLES;
  const grass = rgb(0x59684a);
  mb.flat(-70, -70, 70, 70, 0, grass);                 // no UVs -> white 'flat'
  mb.flat(-60, -1.6, 60, 1.6, 0.02, rgb(0x3b3d3f));    // a strip of asphalt

  const cols = opts.cols || 3, gapX = 15, gapZ = 16;
  samples.forEach((s, i) => {
    const cx = ((i % cols) - (cols - 1) / 2) * gapX;
    const cz = (Math.floor(i / cols) - (Math.ceil(samples.length / cols) - 1) / 2) * gapZ - 6;
    sampleHouse(mb, mats, s, cx, cz);
  });
  if (opts.seam) seamWall(mb, mats, opts.seam, 0, 26);
  // 1.8 m reference post by the road, plain vertex colour
  mats.end(mb);
  mb.box(-13, 0.9, 6, 0.4, 1.8, 0.4, rgb(0xd8d2c4));
  return mb;
}
