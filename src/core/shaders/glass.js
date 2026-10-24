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
// Not built from the V3-02 spec: interiors, curtains and lit windows at night.
import { isOn, onChange } from '../../game/look/flags.js';
import { GLASS_LEN } from '../../game/world/glasstag.js';

// Window cells (assets/materials/atlas.json) and their panes in cell-local
// coordinates (tools/make_atlas.py), trimmed to hold whichever way v runs.
export const GLASS_CELLS = { v0: 0.49609375, v1: 0.73828125,
  u: [[0.00390625, 0.24609375], [0.25390625, 0.49609375], [0.50390625, 0.74609375]] };

export const UNIFORMS = {
  uGlassOn: { type: 'float', value: isOn('glass') ? 1 : 0 },
  uGlassAtlas: { type: 'float', value: 0 },
};
onChange((s) => {
  const r = globalThis.AYLMER?.G?.renderer;
  if (r && r.uniforms && r.uniforms.uGlassOn) r.uniform('uGlassOn', s.glass ? 1 : 0);
});

export const VERT = '';

const f = (x) => Number(x).toFixed(8);
const C = GLASS_CELLS;

export const GLSL = `
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
