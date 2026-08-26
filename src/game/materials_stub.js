// Stand-in for Phase 3's src/game/materials.js.
//
// houses.js never imports the material provider directly — it takes one as a
// parameter — so this file and the real atlas are interchangeable. The contract
// both must satisfy:
//
//   loadMaterials(renderer) -> Promise<MaterialProvider> | MaterialProvider
//   MaterialProvider = {
//     tex,                      // GL texture, or null for the vertex-colour path
//     uv(name) -> {u0,v0,u1,v1} | null,   // atlas rect for a tile or decal
//     decalUV(name) -> entry | null,      // the same, but only for DECALS
//     color(name) -> [r,g,b],             // the material's own colour
//     tint(name, k) -> [r,g,b],           // vertex colour UNDER that texture
//     tile(mb, name, opts) -> boolean,    // arm world-space tiling on a builder
//     end(mb),                            // close a textured run
//     wallUV(mb, name, widthM, heightM)   // explicit-UV tiling; a no-op here
//   }
//
// `tile()` returning false and `decalUV()` returning null are the signals to
// houses.js that there is no atlas: it then emits plain vertex-coloured
// geometry, and `tint()` collapses to `color()` so the result is exactly what
// the game looked like before the atlas existed.
//
// `uv()` returning null is the signal to houses.js that there is no atlas, so
// it emits plain vertex-coloured geometry. When the real atlas lands, the same
// calls start returning rects and MeshBuilder.texQuad writes UVs instead.
import { rgb } from '../core/mesh.js';

// Tile names Phase 3 promised, with the colour each one should average out to.
// These double as the untextured palette, so the fallback still reads as brick /
// vinyl / stone rather than random pastels.
export const TILES = {
  brick_red: 0x9a5a48, brick_brown: 0x7a5344, brick_buff: 0xbfa681,
  stone_grey: 0x9b9a95, stone_beige: 0xc0b096,
  vinyl_white: 0xe9e6de, vinyl_beige: 0xd9cdb5, vinyl_grey: 0xb9bcc0,
  vinyl_blue: 0xb4c6d4, vinyl_green: 0xb2bfa8,
  clapboard_white: 0xeeeae1, clapboard_yellow: 0xe6dcb2,
  stucco: 0xd8d2c4,
  shingle_dark: 0x39393c, shingle_brown: 0x594739, shingle_grey: 0x4b4a48,
  cedar: 0x8a6a48,
  // decals
  window_2pane: 0x2c3644, window_bay: 0x2c3644, window_small: 0x2c3644,
  door_wood: 0x6b4a30, door_white: 0xe2ded4,
  garage_door_1: 0xd6d2c8, garage_door_2: 0xd6d2c8,
  porch_rail: 0xe6e2d8,
  // structural extras houses.js asks for that are not atlas tiles
  trim: 0xf2efe7, foundation: 0x8e8b84, asphalt: 0x2e2e31,
  concrete: 0xb0aca2, deck: 0x8f7a5c, flat: 0xffffff,
};

const CACHE = new Map();

export const STUB = {
  tex: null,
  atlas: false,
  uv() { return null; },
  decalUV() { return null; },
  color(name) {
    let c = CACHE.get(name);
    if (!c) {
      const hex = TILES[name];
      c = rgb(hex === undefined ? 0xbfb8aa : hex);
      CACHE.set(name, c);
    }
    return c;
  },
  // Without an atlas the vertex colour IS the material, so a "tint" is just the
  // material colour with the caller's brightness jitter applied.
  tint(name, k = 1) {
    const c = this.color(name);
    return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
  },
  tile(mb) { if (mb) { mb.curRect = null; mb.autoUV = null; } return false; },
  end(mb) { if (mb) { mb.curRect = null; mb.autoUV = null; } return this; },
  wallUV() { /* no-op without an atlas */ },
};

export function loadMaterials(_renderer) { return STUB; }
export default STUB;
