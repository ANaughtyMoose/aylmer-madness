// Glass and windows. Hook on the lit colour of every world, car and decal
// fragment, before fog. Identity until V3-02 (glass and windows, day and night).
// Glass is to be told apart by atlas cell or material code (vRect, uMaterial),
// never by colour.
//
// ==== s5-reflect (V3-02 reflection only): window glass takes the sky ====
// Flag glass (look/flags.js). A fragment is glass in two ways, never by colour:
//   1. an atlas window decal: MAT_WORLD, the material atlas bound (uGlassAtlas,
//      set per draw by game/materials.js), an absolute-UV face (vRect.z <= 0)
//      whose UV lies inside a pane of the window_2pane / _bay / _small cell;
//   2. a tagged pane: MAT_WORLD with a normal of length GLASS_LEN (0.43,
//      world/glasstag.js), which landmarks.js wallRow (Principale shops, the
//      British, the hero blocks), oldaylmer.js and the OSM commercial and
//      apartment windows in world/buildings.js write on their glass. The
//      light normalises, so colour and shading are unchanged without the hook.
// The reflection is the sky along reflect(V, n) with Schlick Fresnel floored
// at 0.22, plus a sun glint that flares on west-facing glass at golden hour.
// Not built from the V3-02 spec: interiors and curtains (lit windows at night
// are the S5-LIGHT block below).
//
// ==== S5-LIGHT (V3-02 night side, 20 Oct) ====
// The cheap night side: lit house windows, lit shop windows and street-lamp
// heads, as emission, no lights.
//
// The tag is in the vertex colour, which no albedo can reach: a builder adds
// 2 x kind to every channel (glowCol in world/consts.js), glowAlbedo() takes it
// off before the colour is used, and glassShade() adds the glow while the
// night lasts (uNightGlow = nightAmount(env), look/glow.js). Kinds: 1 a house
// window (warm amber), 2 a shop or flat window (warm white), 3 a lamp head
// (sodium). On a textured decal only the dark glass of the texel glows, never
// the frame. Contract for V1-05 (vertex packing): colour must stay a float
// (or carry the kind some other way) or the tag is lost.
// Order in glassShade: the reflection first, then the glow added on top.
// The glow tag rides in vCol (+2 x kind), the reflection tag in the normal
// length, so neither test reads the other's tag.
import { isOn, onChange } from '../../game/look/flags.js';
import { GLASS_LEN } from '../../game/world/glasstag.js';

// Window cells (assets/materials/atlas.json) and their panes in cell-local
// coordinates (tools/make_atlas.py), trimmed to hold whichever way v runs.
export const GLASS_CELLS = { v0: 0.49609375, v1: 0.73828125,
  u: [[0.00390625, 0.24609375], [0.25390625, 0.49609375], [0.50390625, 0.74609375]] };

// W8-LIGHT: « Éclairage avancé » off (the default) assembles fix/look-on-qr's
// glass (reflection only, no night glow), the CLASSIC_ pair; on, the ADV_ pair.
const CLASSIC_UNIFORMS = {
  uGlassOn: { type: 'float', value: isOn('glass') ? 1 : 0 },
  uGlassAtlas: { type: 'float', value: 0 },
};
const ADV_UNIFORMS = {
  ...CLASSIC_UNIFORMS,
  uNightGlow: { type: 'float', value: 0 },   // S5-LIGHT night side
};
export let UNIFORMS = CLASSIC_UNIFORMS;
onChange((s) => {
  const r = globalThis.AYLMER?.G?.renderer;
  if (r && r.uniforms && r.uniforms.uGlassOn) r.uniform('uGlassOn', s.glass ? 1 : 0);
});

export const VERT = '';

const f = (x) => Number(x).toFixed(8);
const C = GLASS_CELLS;

const ADV_GLSL = `
float glowKind() { return vCol.r > 1.5 ? floor(vCol.r * 0.5) : 0.0; }
vec3 glowAlbedo(vec3 c) { return c.r > 1.5 ? c - 2.0 * floor(c.r * 0.5) : c; }
// ---- S5-LIGHT: night glow
vec3 glassGlow(vec3 col, vec3 base) {
  if (uNightGlow < 0.002) return col;
  float k = glowKind();
  if (k < 0.5) return col;
  vec3 day = linearAlbedo(glowAlbedo(vCol));
  // The glass is the dark part of the texel: base is day colour x texel.
  float glassy = uUseTex > 0.5 ? clamp(1.0 - 1.6 * lum709(base) / max(lum709(day), 1e-3), 0.0, 1.0) : 1.0;
  vec3 g = k < 1.5 ? vec3(0.62, 0.36, 0.13) : (k < 2.5 ? vec3(0.75, 0.62, 0.42) : vec3(2.4, 1.35, 0.45));
  return col + g * (glassy * uNightGlow);
}
// ---- s5-reflect: glass
// 1.0 inside a pane of an atlas window decal.
float glassPane(highp vec2 uv) {
  if (uv.y < ${f(C.v0)} || uv.y > ${f(C.v1)}) return 0.0;
  float ly = (uv.y - ${f(C.v0)}) / ${f(C.v1 - C.v0)};
  if (uv.x >= ${f(C.u[0][0])} && uv.x <= ${f(C.u[0][1])}) {          // window_2pane
    float lx = (uv.x - ${f(C.u[0][0])}) / ${f(C.u[0][1] - C.u[0][0])};
    return step(0.14, lx) * step(lx, 0.86) * max(step(0.13, ly) * step(ly, 0.46), step(0.54, ly) * step(ly, 0.87));
  }
  if (uv.x >= ${f(C.u[1][0])} && uv.x <= ${f(C.u[1][1])}) {          // window_bay
    float lx = (uv.x - ${f(C.u[1][0])}) / ${f(C.u[1][1] - C.u[1][0])};
    float px = max(max(step(0.08, lx) * step(lx, 0.23), step(0.32, lx) * step(lx, 0.68)), step(0.77, lx) * step(lx, 0.92));
    return px * step(0.16, ly) * step(ly, 0.84);
  }
  if (uv.x >= ${f(C.u[2][0])} && uv.x <= ${f(C.u[2][1])}) {          // window_small
    float lx = (uv.x - ${f(C.u[2][0])}) / ${f(C.u[2][1] - C.u[2][0])};
    float px = max(step(0.185, lx) * step(lx, 0.475), step(0.545, lx) * step(lx, 0.825));
    float py = max(step(0.185, ly) * step(ly, 0.455), step(0.545, ly) * step(ly, 0.815));
    return px * py;
  }
  return 0.0;
}
vec3 glassReflect(vec3 col, vec3 base, vec3 n) {
  if (uGlassOn < 0.5 || uMaterial != MAT_WORLD || uUnlit > 0.5 || uAlpha < 1.0) return col;
  // The tag is a length, so it only holds under a uniform scale: a squashed
  // model (the blob shadow is 2.3 x 1 x 5) shrinks an untagged normal to 0.43.
  float sx = length(uModel[0].xyz);
  bool uni = abs(length(uModel[1].xyz) - sx) < 1e-3 * sx && abs(length(uModel[2].xyz) - sx) < 1e-3 * sx;
  float nl = uni ? length(vNor) / max(sx, 1e-4) : 1.0;
  if (abs(nl - ${GLASS_LEN.toFixed(3)}) > 0.05) {
    if (uGlassAtlas < 0.5 || uUseTex < 0.5 || vRect.z > 0.0 || glassPane(vUV) < 0.5) return col;
  }
  highp vec3 V = vRel / max(vDist, 0.001);                      // eye to fragment
  highp vec3 R = reflect(V, n);
  // Floored at 0.22: behind the pane is a dark room, so the reflection is
  // what the eye reads even head-on. Below the horizon the street and the
  // facades across the way are lit, so they reflect brighter than bare ground.
  float F = max(0.22, reflFresnel(-dot(V, n), 0.04));
  vec3 env = mix(uGround * 0.85, reflSky(vec3(R.x, max(R.y, 0.0), R.z)), smoothstep(-0.12, 0.12, R.y));
  float s = max(dot(R, uLightDir), 0.0);
  vec3 glint = uSun * (pow(s, 220.0) * 1.6 + pow(s, 24.0) * 0.12) * step(0.0, dot(n, uLightDir));
  return mix(col, env, F) + glint * F;
}
vec3 glassShade(vec3 col, vec3 base, vec3 n) {
  return glassGlow(glassReflect(col, base, n), base);
}
`;
const CLASSIC_GLSL = `
// ---- s5-reflect: glass
// 1.0 inside a pane of an atlas window decal.
float glassPane(highp vec2 uv) {
  if (uv.y < ${f(C.v0)} || uv.y > ${f(C.v1)}) return 0.0;
  float ly = (uv.y - ${f(C.v0)}) / ${f(C.v1 - C.v0)};
  if (uv.x >= ${f(C.u[0][0])} && uv.x <= ${f(C.u[0][1])}) {          // window_2pane
    float lx = (uv.x - ${f(C.u[0][0])}) / ${f(C.u[0][1] - C.u[0][0])};
    return step(0.14, lx) * step(lx, 0.86) * max(step(0.13, ly) * step(ly, 0.46), step(0.54, ly) * step(ly, 0.87));
  }
  if (uv.x >= ${f(C.u[1][0])} && uv.x <= ${f(C.u[1][1])}) {          // window_bay
    float lx = (uv.x - ${f(C.u[1][0])}) / ${f(C.u[1][1] - C.u[1][0])};
    float px = max(max(step(0.08, lx) * step(lx, 0.23), step(0.32, lx) * step(lx, 0.68)), step(0.77, lx) * step(lx, 0.92));
    return px * step(0.16, ly) * step(ly, 0.84);
  }
  if (uv.x >= ${f(C.u[2][0])} && uv.x <= ${f(C.u[2][1])}) {          // window_small
    float lx = (uv.x - ${f(C.u[2][0])}) / ${f(C.u[2][1] - C.u[2][0])};
    float px = max(step(0.185, lx) * step(lx, 0.475), step(0.545, lx) * step(lx, 0.825));
    float py = max(step(0.185, ly) * step(ly, 0.455), step(0.545, ly) * step(ly, 0.815));
    return px * py;
  }
  return 0.0;
}
vec3 glassShade(vec3 col, vec3 base, vec3 n) {
  if (uGlassOn < 0.5 || uMaterial != MAT_WORLD || uUnlit > 0.5 || uAlpha < 1.0) return col;
  // The tag is a length, so it only holds under a uniform scale: a squashed
  // model (the blob shadow is 2.3 x 1 x 5) shrinks an untagged normal to 0.43.
  float sx = length(uModel[0].xyz);
  bool uni = abs(length(uModel[1].xyz) - sx) < 1e-3 * sx && abs(length(uModel[2].xyz) - sx) < 1e-3 * sx;
  float nl = uni ? length(vNor) / max(sx, 1e-4) : 1.0;
  if (abs(nl - ${GLASS_LEN.toFixed(3)}) > 0.05) {
    if (uGlassAtlas < 0.5 || uUseTex < 0.5 || vRect.z > 0.0 || glassPane(vUV) < 0.5) return col;
  }
  highp vec3 V = vRel / max(vDist, 0.001);                      // eye to fragment
  highp vec3 R = reflect(V, n);
  // Floored at 0.22: behind the pane is a dark room, so the reflection is
  // what the eye reads even head-on. Below the horizon the street and the
  // facades across the way are lit, so they reflect brighter than bare ground.
  float F = max(0.22, reflFresnel(-dot(V, n), 0.04));
  vec3 env = mix(uGround * 0.85, reflSky(vec3(R.x, max(R.y, 0.0), R.z)), smoothstep(-0.12, 0.12, R.y));
  float s = max(dot(R, uLightDir), 0.0);
  vec3 glint = uSun * (pow(s, 220.0) * 1.6 + pow(s, 24.0) * 0.12) * step(0.0, dot(n, uLightDir));
  return mix(col, env, F) + glint * F;
}
`;
export let GLSL = CLASSIC_GLSL;
export function lightMode(adv) {
  UNIFORMS = adv ? ADV_UNIFORMS : CLASSIC_UNIFORMS; GLSL = adv ? ADV_GLSL : CLASSIC_GLSL;
}
