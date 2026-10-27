// Water (opts.water, or opts.material 'water'), keyed off uTime (seconds since
// the renderer was created).
// Owner after V0-01: V3-06 (Lac Deschenes and the marina).
//
// ==== s5-reflect (V3-06 surface): the lake takes the sky ====
// Flag water2 (look/flags.js). Off: the old swell and two-ripple albedo, byte
// for byte (waterAlbedoV0). On: a Fresnel blend of the sky along the
// reflected ray (reflSky, shaders/reflect.js), a sun glitter path and four
// distance-faded ripple trains. No pass, no texture, no per-frame JS.
// Not built from the V3-06 spec (left for later): the vertex-placed mast and
// tree streaks (D3) and the shore band with tea-brown shallows (D4).
import { isOn, onChange } from '../../game/look/flags.js';
import { REFLECT_GLSL, REFLECT_GLSL_CLASSIC } from './reflect.js';

// All tuning, interpolated into the GLSL below.
export const WATER = {
  F0: 0.02,        // water at normal incidence
  FMAX: 0.92,      // never a perfect mirror: the lake still reads as water at the horizon
  BODY: [0.17, 0.25, 0.28],  // the deep body the sky is blended over (display sRGB)
  BODY_MIX: 0.55,  // share of BODY in the body colour; the rest is the vertex colour
  // Ripple trains [wavelength m, angle from the wind in degrees, slope a*k].
  // Speeds are deep-water dispersion slowed for a calm summer lake.
  TRAINS: [[9.0, 0, 0.07], [4.1, 38, 0.06], [1.7, -27, 0.05], [0.63, 71, 0.04]],
  WIND: 35,        // degrees in world xz
  GLINT_NEAR: 1200, GLINT_FAR: 80,   // sun lobe power where the ripples are sharp / faded
};

export const UNIFORMS = {
  // ?look=-water2 is read by flags.js at its own load, before this line.
  uLakeOn: { type: 'float', value: isOn('water2') ? 1 : 0 },
};
onChange((s) => {
  const r = globalThis.AYLMER?.G?.renderer;
  if (r && r.uniforms && r.uniforms.uLakeOn) r.uniform('uLakeOn', s.water2 ? 1 : 0);
});

const f = (x) => Number(x).toFixed(5);
const v3 = (c) => `vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;
const trainGLSL = WATER.TRAINS.map(([wl, ang, S]) => {
  const a = (WATER.WIND + ang) * Math.PI / 180;
  const k = 2 * Math.PI / wl, w = 0.8 * Math.sqrt(9.81 * k);
  return `  fd = clamp(2.0 - vDist / ${f(wl * 30)}, 0.0, 1.0);
  sl += vec2(${f(Math.cos(a))}, ${f(Math.sin(a))}) * (${f(S)} * fd * cos(dot(p, vec2(${f(Math.cos(a) * k)}, ${f(Math.sin(a) * k)})) - uTime * ${f(w)}));
  e += ${f(S * S)} * fd;`;
}).join('\n');
const E_TOTAL = WATER.TRAINS.reduce((s, t) => s + t[2] * t[2], 0);

export const VERT = `
// A shallow swell. It is one-sided (the surface only ever rises off its baked
// height), so the river can never sink under the grass it is supposed to sit a
// couple of centimetres above.
vec3 waterVertex(vec3 p) {
  float s = sin(p.x * 0.11 + uTime * 0.9) * sin(p.z * 0.083 - uTime * 0.7);
  p.y += 0.045 * (0.5 + 0.5 * s);
  return p;
}
`;

// W8-LIGHT: « Éclairage avancé » off (the default) assembles fix/look-on-qr's
// water, verbatim; on, the linear-light return below (lightMode).
const W8_LIN = `  if (linearDraw()) { gReflRad += refl * F + uSunSkyLin * g; return body * (1.0 - F); }   // wave 7: after the light (reflect.js)\n`;
const waterGlsl = (ADV) => (ADV ? REFLECT_GLSL : REFLECT_GLSL_CLASSIC) + `
// Two crossed ripple trains at different speeds: enough to break the flat slab
// of river without a normal map or a second pass. (The look before water2.)
vec3 waterAlbedoV0(vec3 base) {
  highp vec3 wp = worldPos();
  float r1 = sin(wp.x * 0.21 + uTime * 1.25) * sin(wp.z * 0.17 - uTime * 1.0);
  float r2 = sin(wp.x * 0.052 + wp.z * 0.061 - uTime * 0.42);
  base += vec3(0.035, 0.055, 0.075) * r1 + vec3(0.02, 0.03, 0.045) * r2;
  return base;
}
// ---- s5-reflect: the lake surface
// Surface slope (dh/dx, dh/dz) of four ripple trains, each faded out between
// 30 and 60 wavelengths so nothing shimmers far off. rough is the faded share.
vec2 waterSlope(highp vec2 p, out float rough) {
  vec2 sl = vec2(0.0); float e = 0.0; float fd;
${trainGLSL}
  rough = 1.0 - e / ${f(E_TOTAL)};
  return sl;
}
vec3 waterAlbedo(vec3 base) {
  if (uLakeOn < 0.5) return waterAlbedoV0(base);
  highp vec3 wp = worldPos();
  float rough;
  vec2 sl = waterSlope(wp.xz, rough);
  vec3 nw = normalize(vec3(-sl.x, 1.0, -sl.y));
  vec3 V = -vRel / max(vDist, 0.001);             // toward the eye
  float F = min(reflFresnel(dot(nw, V), ${f(WATER.F0)}), ${f(WATER.FMAX)});
  vec3 R = reflect(-V, nw); R.y = abs(R.y);
  vec3 refl = reflSky(R);
  // Sun glitter: hard sparkles near the camera, a long soft path toward a low
  // sun further out, gone when the sun is under the horizon.
  float s = max(dot(R, uLightDir), 0.0);
  float k = mix(${f(WATER.GLINT_NEAR)}, ${f(WATER.GLINT_FAR)}, rough);
  float g = (pow(s, k) * (0.6 + k / 400.0) + pow(s, 24.0) * 0.06) * smoothstep(-0.03, 0.08, uLightDir.y);
  // This hook runs before light: the albedo returned here is multiplied by
  // ambient + sun for the stored normal. Divide the reflected radiance by that
  // same light so it reaches the screen as radiance (the body stays lit).
  vec3 ng = normalize(vNor);
  vec3 la = max(ambientLight(ng) + uSun * sunLambert(ng), vec3(0.02));
  vec3 body = mix(base, ${v3(WATER.BODY)}, ${f(WATER.BODY_MIX)}) * (1.0 + 0.03 * sl.x);
${ADV ? W8_LIN : ''}  return body * (1.0 - F) + (refl * F + uSunSky * g) / la;
}
`;
export let GLSL = waterGlsl(false);
const ADV_GLSL = waterGlsl(true), CLASSIC_GLSL = GLSL;
export function lightMode(adv) { GLSL = adv ? ADV_GLSL : CLASSIC_GLSL; }
