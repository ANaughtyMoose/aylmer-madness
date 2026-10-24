// Constants of the world bake (moved out of world.js unchanged, V0-02).

export const CHUNK = 200;      // world chunk size (metres)
// How far the detailed (lod 0) house bake reaches, measured to the chunk CENTRE.
// Beyond it a chunk draws the lod 2 silhouette instead. 200 m is one chunk past
// the one you are in - windows and doors are a couple of pixels by then - and it
// keeps the per-frame triangle count within a few percent of what the old
// single-lod bake drew. Measured (world geometry only, medium quality):
//   Chemin Foley 22.8k, Rue Bancroft 28.3k, Denise-Friend 36.5k tris a frame.
export const HOUSE_NEAR = 200;
export const SEG_CELL = 32;    // broadphase cell for querySegments
export const ROAD_CELL = 40;   // broadphase cell for roadAt
export const FADE = 0.4;       // seconds a chunk takes to come out of the fog (W2)

// Decal ladder. Note the river sits slightly ABOVE the grass so the shoreline is
// exact; both are flat so it reads fine. `inter` is a hair over `road` so the
// intersection polygons win the coplanar fight with the road quads they cover.
export const Y = {
  grass: 0.0, park: 0.01, wood: 0.012, sand: 0.015,
  water: 0.02, pitch: 0.02, parking: 0.03, pool: 0.04,
  service: 0.045, road: 0.05, inter: 0.058, mark: 0.085, pool2: 0.1,
};

export const C = {
  grassLo: 0x6a8449, grassHi: 0x748e50,
  water: 0x2f5d78, sand: 0xd9cba4, wood: 0x4a6236, park: 0x668a4c,
  school: 0x6f8f52, cemetery: 0x688a57, parking: 0x46464c,
  pitch: 0x6a9a4a, pool: 0x7fc7e0,
  major: 0x57575b, minor: 0x5c5c61, service: 0x45454a,
  yellow: 0xd4be55, white: 0xdddddd, walk: 0xa9a49a,
  gutter: 0x505055, shoulder: 0x827b6e,
  flatRoof: 0x74726c,
  win: 0x2e3742, pole: 0x6f6d68, lamp: 0xf0e6c0, hydro: 0x6b5a45,
  trunk: 0x5b4632, shore: 0x2a4032, dock: 0x8a6a48,
  rock: 0x7d7a72, signHead: 0x2c2e2c, lensOff: 0x14150f,
  stopRed: 0xa8261f, stopRim: 0xe8e4dc, pool: 0xffd9a0,
};

// Caps for the new furniture so the triangle budget stays where it was.
export const CAP2 = { shoreEdges: 900, rocks: 420 };

// Real Aylmer housing stock, weighted: white vinyl and beige dominate, brick and
// dark brown are the odd one out on a street.
export const SIDING = [
  0xe9e6de, 0xe9e6de, 0xe9e6de,   // white vinyl
  0xd9cdb5, 0xd9cdb5,             // beige
  0xb9bcc0, 0xb9bcc0,             // grey
  0xb7c2ad,                       // sage
  0x9a5a48,                       // brick red
  0xe8dcb0,                       // yellow-cream
  0xb9cdd8,                       // light blue
  0x6b5a4c,                       // dark brown
];
export const COMMERCIAL = [0xb8a58f, 0xc8c3b8, 0x9a5a48];
// Gable roofs: asphalt shingle (black / charcoal) mostly, brown, dark green, and
// the odd red metal roof. Index 2 (charcoal) is what churches get.
export const ROOF = [0x3a3a3c, 0x4b4a48, 0x4b4a48, 0x5c4a3c, 0x3d4f3a, 0x8a3a33];
export const LEAF = [0x4f7a34, 0x5d8a3a, 0x6a944a];      // deciduous
export const CONIFER = [0x2f4f2e, 0x36573a];             // spruce / pine
export const SHRUB = [0x416b35, 0x527d3d, 0x638b46, 0x355c38];
export const BLOOM = [0xe4c34f, 0xd96b73, 0xb985c8, 0xe8e2d2];

export const GABLE = { house: 1, terrace: 1, shed: 1 };
export const MAJOR = { trunk: 1, primary: 1, secondary: 1 };
export const PAVED = { trunk: 1, primary: 1, secondary: 1, tertiary: 1 };

// Caps - the whole scene has to stay well under 450k triangles.
export const CAP = { woodTrees: 900, parkTrees: 500, roadTrees: 1800, shrubs: 950, poles: 2500, hedges: 1400 };
