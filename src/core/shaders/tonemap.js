// Tone curve and grade, applied to every lit and sky fragment after fog.
// S5-LIGHT (V1-01): with look flag `linear` on, the colour arriving here is
// linear light (the sky is display sRGB and is decoded here). Exposure, the
// ACES fit three.js r170 ships (ACESFilmicToneMapping, the prototype's look),
// a warm/cool balance, contrast about 18 % grey, saturation restored after the
// curve, then the exact sRGB encode and a 1/255 dither so the sky never bands.
// Flag off, or a sprite or particle draw: identity, as before.
export const BASE = { exposure: 0.82, sat: 1.0, warm: 0.12, contrast: 0.0 };   // contrast 0 skips 3 pow a pixel
// Column-major, as GLSL mat3() reads them (three r170 ACESInputMat / ACESOutputMat).
export const ACES_IN = [0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777];
export const ACES_OUT = [1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602];
const f5 = (a) => a.map((v) => v.toFixed(5)).join(', ');

const ADV_UNIFORMS = {
  uExposure: { type: 'float', value: BASE.exposure },
  uContrast: { type: 'float', value: BASE.contrast },
  uSat: { type: 'float', value: BASE.sat },
  uWarmth: { type: 'float', value: BASE.warm },
  uLift: { type: 'vec3', value: [0, 0, 0] },
  uToneFast: { type: 'float', value: 1 },   // wave 7 cut 8: 1 on low and medium, 0 on high (look/grade.js)
};

export const VERT = '';

const ADV_GLSL = `
const mat3 ACES_IN = mat3(${f5(ACES_IN)});
const mat3 ACES_OUT = mat3(${f5(ACES_OUT)});
vec3 acesRrtOdt(vec3 v) { return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081); }
float toneIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// CUT-PLAN cut 8, low and medium only: the sRGB encode by a sqrt fit (3 sqrt,
// no pow; linear toe kept, max error 0.40/255 over 0..1, under the dither) and
// the sky's decode by the standard cubic (max error 0.43/255). High: exact.
vec3 toneEncode(vec3 c) {
  if (uToneFast < 0.5) return linearToSrgb(c);
  vec3 s1 = sqrt(c), s2 = sqrt(s1), s3 = sqrt(s2);
  return mix(0.585122381 * s1 + 0.783140355 * s2 - 0.368262736 * s3, c * 12.92, step(c, vec3(0.0031308)));
}
vec3 toneSkyDecode(vec3 c) {
  if (uToneFast < 0.5) return srgbToLinear(c);
  c = max(c, vec3(0.0));
  return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878);
}
vec3 tonemap(vec3 col) {
  if (!linearDraw()) return col;
  if (uMaterial == MAT_SKY) col = toneSkyDecode(col);
  vec3 c = clamp(ACES_OUT * acesRrtOdt(ACES_IN * (col * (uExposure / 0.6))), 0.0, 1.0);
  c *= vec3(1.0 + 0.10 * uWarmth, 1.0, 1.0 - 0.10 * uWarmth);
  if (uContrast != 0.0) c = 0.18 * pow(max(c, 0.0) / 0.18, vec3(1.0 + uContrast));
  // CUT-PLAN cut 9: skip the neutral steps (uLift 0, uSat 1 most of the day); uniform branches.
  if (any(notEqual(uLift, vec3(0.0)))) c = c + uLift * (1.0 - c);
  if (uSat != 1.0) c = mix(vec3(lum709(c)), c, uSat);
  c = clamp(c, 0.0, 1.0);
  return toneEncode(c) + (toneIgn(gl_FragCoord.xy) - 0.5) / 255.0;
}
`;
// W8-LIGHT: « Éclairage avancé » off (the default) assembles fix/look-on-qr's
// identity tone curve and no uniforms; on, the curve above (lightMode).
const CLASSIC_UNIFORMS = {};
const CLASSIC_GLSL = `
vec3 tonemap(vec3 col) { return col; }
`;
export let UNIFORMS = CLASSIC_UNIFORMS;
export let GLSL = CLASSIC_GLSL;
export function lightMode(adv) {
  UNIFORMS = adv ? ADV_UNIFORMS : CLASSIC_UNIFORMS; GLSL = adv ? ADV_GLSL : CLASSIC_GLSL;
}

// The exact JS twin of the GLSL above (no dither), for smokes and tuning.
const rrt = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
const enc = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export function curve(rgb, U = BASE, out = [0, 0, 0]) {
  const e = U.exposure / 0.6, v = [rgb[0] * e, rgb[1] * e, rgb[2] * e];
  const a = [0, 0, 0], b = [0, 0, 0];
  for (let r = 0; r < 3; r++) a[r] = rrt(ACES_IN[r] * v[0] + ACES_IN[3 + r] * v[1] + ACES_IN[6 + r] * v[2]);
  for (let r = 0; r < 3; r++) b[r] = Math.min(1, Math.max(0, ACES_OUT[r] * a[0] + ACES_OUT[3 + r] * a[1] + ACES_OUT[6 + r] * a[2]));
  b[0] *= 1 + 0.1 * U.warm; b[2] *= 1 - 0.1 * U.warm;
  if (U.contrast) for (let i = 0; i < 3; i++) b[i] = 0.18 * Math.pow(Math.max(b[i], 0) / 0.18, 1 + U.contrast);
  const l = 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2];
  for (let i = 0; i < 3; i++) out[i] = enc(Math.min(1, Math.max(0, l + (b[i] - l) * U.sat)));
  return out;
}
// The grade uniforms for an env: BASE times or plus the env's own grade (the
// timecycle publishes exposure and grade{sat, contrast, warm, lift}), times the
// eye's adaptation from gradeLight (lightOut.exposure).
export function gradeUniforms(env, lightOut, U) {
  const g = env.grade;
  U.exposure = BASE.exposure * (lightOut.exposure ?? 1) * (env.exposure ?? 1);
  U.sat = BASE.sat * (g?.sat ?? 1);
  U.contrast = BASE.contrast + (g?.contrast ?? 0);
  U.warm = BASE.warm + (g?.warm ?? 0);
  U.lift = g?.lift ?? 0;
  return U;
}
