// Light: the sun (Lambert) and the hemispheric ambient, plus gradeLight(), the
// CPU-side grade the renderer applies to the env before it sets these uniforms.
// Owner after V0-01: V1-01 (linear light, filmic curve and grade).
//
// S5-LIGHT (V1-01, the light contract): with look flag `linear` on (default)
// light is linear. The vertex colour and texel are decoded from sRGB after the
// albedo hooks, lit by linear sun and ambient, and tonemap.js turns the result
// back into display sRGB through the ACES curve. gradeLight() is still the one
// CPU choke point for the light uniforms: gl.js begin() calls it, and so does
// look/grade.js, so the sun's direction (env.lightDir) and colour (env.sun)
// reach the world, the sky disc and the fog from one source, the env.
import { isOn } from '../../game/look/flags.js';
import { advLight } from '../../game/look/advlight.js';

// W8-LIGHT: « Éclairage avancé » off (the default) assembles fix/look-on-qr's
// uniforms and GLSL, the CLASSIC_ pair below; on, the ADV_ pair (lightMode).
const CLASSIC_UNIFORMS = {
  uLightDir: { type: 'vec3', managed: true },
  uSun: { type: 'vec3', managed: true },     // graded sun (gradeLight)
  uSky: { type: 'vec3', managed: true },     // graded upper hemisphere
  uGround: { type: 'vec3', managed: true },  // graded lower hemisphere
};
const ADV_UNIFORMS = {
  ...CLASSIC_UNIFORMS,
  uLinear: { type: 'float', value: isOn('linear') ? 1 : 0 },   // look/grade.js keeps it in step with the flag
};

export let UNIFORMS = CLASSIC_UNIFORMS;
export const VERT = '';

const CLASSIC_GLSL = `
// Sun term: n is the normalised surface normal.
float sunLambert(vec3 n) { return max(dot(n, uLightDir), 0.0); }
// Hemispheric ambient: ground bounce below, sky above.
vec3 ambientLight(vec3 n) { return mix(uGround, uSky, n.y * 0.5 + 0.5); }
`;
const ADV_GLSL = CLASSIC_GLSL + `// S5-LIGHT: no lit albedo above 0.80 linear (ROADMAP 2.4).
const float ALBEDO_MAX = 0.80;
// Per draw and coherent: sprites and particles stay display-referred.
bool linearDraw() { return uLinear > 0.5 && uMaterial != MAT_SPRITE && uMaterial != MAT_PARTICLE; }
// The vertex colours were picked by eye in display space for a flat-lit world;
// a full sRGB decode makes every dark one (brick, shingle, spruce) near black
// in shade. A 1.8 power keeps their darks readable and still puts the light in
// linear space (the light, fog and sky decode exactly).
// c * (0.8 c + 0.2) is the 1.8 power within 0.02 over 0.25..1 with no pow (perf: the
// 20 Oct quiet-ish run measured the pow path at +0.8 ms GPU p50 on the Air's backbuffer).
vec3 linearAlbedo(vec3 c) { c = max(c, vec3(0.0)); return linearDraw() ? c * (0.8 * c + 0.2) : c; }
vec3 albedoCeil(vec3 c) { return linearDraw() && uMaterial != MAT_WATER ? min(c, vec3(ALBEDO_MAX)) : c; }
`;
export let GLSL = CLASSIC_GLSL;
export function lightMode(adv) {
  UNIFORMS = adv ? ADV_UNIFORMS : CLASSIC_UNIFORMS; GLSL = adv ? ADV_GLSL : CLASSIC_GLSL;
}

// ---------------------------------------------------------------- light grade
// TIME_OF_DAY's `sky` is two things at once: the zenith colour of the dome and
// the upper half of the hemispheric ambient. As light it was far too blue, and
// added to a near-white overhead sun it lit every up-facing surface by about
// (1.36, 1.53, 1.80) at noon: lime grass, slate-blue asphalt, cyan sidewalks.
// So the env stays exactly what it is (the dome, fog, clouds and weather all
// read it) and the renderer lights the world with a graded copy:
//   1. the sky half of the ambient is mostly de-saturated (a little blue left)
//      and dimmed a touch; the ground half (bounce off grass and asphalt) gets
//      a touch brighter and less green, so walls keep their brightness;
//   2. the sun is then scaled so a flat roof's total light (ambient + sun) is
//      at most UP_MAX in luminance.
// Both are weighted by DAYLIGHT, which rises with the sun's own brightness, so
// a bright day is graded and dusk, night and a storm (whose suns are dim and
// coloured on purpose) pass through untouched. Cycle blends and weather tints
// arrive here already mixed, so the grade blends with them for free.
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const GRADE = {
  SKY_DESAT: 0.85,    // share of the sky colour's saturation removed from the ambient
  SKY_GAIN: 0.92,     // sky ambient brightness
  GROUND_DESAT: 0.35, // share of the ground bounce's saturation removed
  GROUND_GAIN: 1.10,  // ground bounce brightness
  UP_MAX: 1.08,       // luminance cap for ambient + sun on an up-facing face
  SUN_MIN: 0.35,      // the sun is never cut below this share
  DAY_LO: 0.70, DAY_HI: 0.85,   // sun luminance: 0 below LO (dusk, night, storm), 1 above HI
};
export function gradeLight(e, out) {
  if (advLight() && isOn('linear')) return gradeLinear(e, out);
  out.exposure = 1;
  return gradeDisplay(e, out);
}
function gradeDisplay(e, out) {
  const G = GRADE;
  const w = Math.min(1, Math.max(0, (lum(e.sun) - G.DAY_LO) / (G.DAY_HI - G.DAY_LO)));
  const ls = lum(e.sky), lg = lum(e.ground);
  const ds = G.SKY_DESAT * w, ks = 1 + (G.SKY_GAIN - 1) * w;
  const dg = G.GROUND_DESAT * w, kg = 1 + (G.GROUND_GAIN - 1) * w;
  for (let i = 0; i < 3; i++) {
    out.sky[i] = (e.sky[i] + (ls - e.sky[i]) * ds) * ks;
    out.ground[i] = (e.ground[i] + (lg - e.ground[i]) * dg) * kg;
  }
  const up = Math.max(0.2, e.lightDir[1]) * lum(e.sun);
  let k = up > 0 ? (G.UP_MAX - lum(out.sky)) / up : 1;
  k = Math.min(1, Math.max(G.SUN_MIN, k));
  k = 1 + (k - 1) * w;
  for (let i = 0; i < 3; i++) out.sun[i] = e.sun[i] * k;
  return out;
}

// ---------------------------------------------------------- linear grade (S5-LIGHT)
// The env colours are display sRGB, as TIME_OF_DAY and the timecycle write them.
// Decode them, then balance the light so it has a direction:
//   day (w, as above): a hard warm sun against a weaker, nearly grey sky. The
//     flat roof gets UP_LIN of light in all, SUN_SKY:1 sun to sky, so a wall
//     turned from the sun reads clearly darker (the old flat noon was 0.72).
//   golden (gw: a warm sun low in the sky, the hour after 18:30): the sun is
//     the light and the sky is only the shade, cooled toward blue-violet, so a
//     face turned to the sun is amber and the far side of the Ranger is cool.
//   night, storm, overcast dusk: decoded only; their colour is the mood and
//     the exposure carries the brightness (the eye adapts, ADAPT_*).
export const LIN = {
  UP_LIN: 1.00, SUN_SKY: 2.0, SKY_DESAT: 0.90, GROUND_DESAT: 0.35,
  ADAPT_P: 0.5, ADAPT_MAX: 4.5,   // 4.5: the ACES toe crushes a decoded navy; the night table needs about 4.5x to read as night_fill
  NIGHT_DESAT: 0.45,    // night and storm ambient: decoding makes a navy fill far bluer than it was drawn
  GOLD_SKY: 0.26,       // linear luminance of the sky ambient at golden
  GOLD_GROUND: 0.15,    // ...and of the ground bounce (warm, it is lit lawn and asphalt)
  GOLD_SUN: 0.85,       // linear luminance of the low sun
  GOLD_COOL: [0.88, 0.94, 1.12],   // the shade's hue at golden: blue-violet sky light
  GOLD_KEEP: 0.30,      // share of the sky's own chroma the shade keeps
};
const lin1 = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export function srgbToLinear3(src, out) {
  for (let i = 0; i < 3; i++) out[i] = lin1(Math.max(0, src[i]));
  return out;
}
export const linearOn = () => advLight() && isOn('linear');
const S = new Float32Array(3), Gd = new Float32Array(3), U = new Float32Array(3);
const sx = new Float32Array(3), gx = new Float32Array(3);
function gradeLinear(e, out) {
  const L = LIN;
  const ls0 = lum(e.sun);
  const w = Math.min(1, Math.max(0, (ls0 - GRADE.DAY_LO) / (GRADE.DAY_HI - GRADE.DAY_LO)));
  const ly0 = e.lightDir[1];
  // Golden: a sun clearly warmer than it is blue, above the horizon, not day.
  const warm = Math.min(1, Math.max(0, (e.sun[0] - e.sun[2] - 0.20) / 0.30));
  const up = Math.min(1, Math.max(0, ly0 / 0.08));
  const gw = warm * up * (1 - w);
  srgbToLinear3(e.sky, S); srgbToLinear3(e.ground, Gd); srgbToLinear3(e.sun, U);
  // Day balance.
  const ly = Math.max(0.2, ly0);
  const A = L.UP_LIN / (1 + L.SUN_SKY * ly);
  const sD = L.SKY_DESAT * w, gD = L.GROUND_DESAT * w;
  const ls = lum(S), lg = lum(Gd), lu = lum(U);
  for (let i = 0; i < 3; i++) { sx[i] = S[i] + (ls - S[i]) * sD; gx[i] = Gd[i] + (lg - Gd[i]) * gD; }
  const ks = A / Math.max(lum(sx), 1e-4), ku = L.SUN_SKY * A / Math.max(lu, 1e-4);
  // Golden shade: the sky's luminance in a cool hue, a little of its own chroma kept.
  const cl = lum(L.GOLD_COOL);
  for (let i = 0; i < 3; i++) {
    let sky = sx[i] * (1 + (ks - 1) * w), ground = gx[i] * (1 + (ks - 1) * w), sun = U[i] * (1 + (ku - 1) * w);
    if (gw > 0) {
      const coolSky = L.GOLD_SKY * (L.GOLD_COOL[i] / cl * (1 - L.GOLD_KEEP) + (S[i] / Math.max(ls, 1e-4)) * L.GOLD_KEEP);
      const warmGround = L.GOLD_GROUND * (Gd[i] / Math.max(lg, 1e-4) * 0.5 + 0.5);
      const gSun = U[i] * (L.GOLD_SUN / Math.max(lu, 1e-4));
      sky += (coolSky - sky) * gw; ground += (warmGround - ground) * gw; sun += (gSun - sun) * gw;
    }
    out.sky[i] = sky; out.ground[i] = ground; out.sun[i] = sun;
  }
  // Night and storm: decoded only, the fill desaturated toward its own grey.
  const nw = (1 - w) * (1 - gw);
  if (nw > 0) {
    const kd = L.NIGHT_DESAT * nw, l1 = lum(out.sky), l2 = lum(out.ground);
    for (let i = 0; i < 3; i++) { out.sky[i] += (l1 - out.sky[i]) * kd; out.ground[i] += (l2 - out.ground[i]) * kd; }
  }
  // The eye adapts in the dark only: day and golden keep exposure 1.
  const upLin = lum(out.sky) + lum(out.sun) * Math.max(0, ly0);
  const adapt = Math.min(L.ADAPT_MAX, Math.max(1, Math.pow(L.UP_LIN / Math.max(upLin, 1e-3), L.ADAPT_P)));
  out.exposure = 1 + (adapt - 1) * nw;
  return out;
}
