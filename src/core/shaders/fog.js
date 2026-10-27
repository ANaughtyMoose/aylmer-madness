// Fog: exp2 distance fog. opts.fogMul thins it per draw (gl.js scales uFogDensity).
// S5-LIGHT (V1-04, smallest version), look flag `aerial`: fog becomes air.
//   colour: the sky's own horizon in the view direction (skyHorizon, sky.js),
//     so a house 600 m off dissolves into the same white-blue as the sky behind
//     it, warmer toward the sun and cooler away from it, and the far ground
//     meets the dome with no seam;
//   height: the air thins above the eye, so roofs, poles and hills hold their
//     silhouette while their feet go milky;
//   inscatter: a warm glow in half-fogged air toward a low sun (0 at no fog and
//     at full fog, so it never touches near pixels or the far seam).
// The distant-ring geometry of the V1-04 spec (treelines, hills inside the far
// plane) is not built here. Flag off: today's two lines.
export const AERIAL = { THIN_LO: 15, THIN_HI: 160, THIN_MIN: 0.35, INSCATTER: 0.10, INS_POW: 6.0 };
const A = AERIAL, f = (v) => Number(v).toFixed(4);
// W8-LIGHT: « Éclairage avancé » off (the default) assembles fix/look-on-qr's
// fog, the CLASSIC_ pair; on, the ADV_ pair (lightMode, shaders/index.js).
const CLASSIC_UNIFORMS = {
  uFogColor: { type: 'vec3', managed: true },
  uFogDensity: { type: 'float', managed: true },
};
const ADV_UNIFORMS = {
  ...CLASSIC_UNIFORMS,
  uAerial: { type: 'float', value: 1 },   // game/sky.js keeps it in step with the flag
};

export const VERT = '';

// Wave 7 cuts: the horizon comes in display or linear light from folded
// uniforms (skyHorizon / skyHorizonLin, sky.js; no per-pixel decode), the sun
// direction is already unit (uSkyL), and the inscatter lobe is squarings while
// INS_POW is 6.
const insLobe = A.INS_POW === 6 ? 's2 * s2 * s2' : `pow(s, ${f(A.INS_POW)})`;
const ADV_GLSL = `
vec3 skyHorizon(highp vec3 dir);
vec3 skyHorizonLin(highp vec3 dir);
vec3 applyFog(vec3 col) {
  float od = pow(vDist * uFogDensity, 2.0);
  if (uAerial < 0.5) return mix(uFogColor, col, clamp(exp(-od), 0.0, 1.0));
  float hk = mix(1.0, ${f(A.THIN_MIN)}, smoothstep(${f(A.THIN_LO)}, ${f(A.THIN_HI)}, worldPos().y - uEye.y));
  float ff = 1.0 - exp(-od * hk);
  if (ff < 0.004) return col;
  highp vec3 dir = vRel / max(vDist, 1e-3);
  bool lin = uLinear > 0.5;
  vec3 hor = lin ? skyHorizonLin(dir) : skyHorizon(dir);
  vec3 sunC = lin ? uSunSkyLin : uSunSky;
  highp float s = max(dot(dir, uSkyL.xyz), 0.0);
  highp float s2 = s * s;
  vec3 c = mix(col, hor, ff);
  return c + sunC * (${f(A.INSCATTER)} * ${insLobe} * 4.0 * ff * (1.0 - ff));
}
`;
const CLASSIC_GLSL = `
vec3 applyFog(vec3 col) {
  float f = exp(-pow(vDist * uFogDensity, 2.0));
  return mix(uFogColor, col, clamp(f, 0.0, 1.0));
}
`;
export let UNIFORMS = CLASSIC_UNIFORMS;
export let GLSL = CLASSIC_GLSL;
export function lightMode(adv) {
  UNIFORMS = adv ? ADV_UNIFORMS : CLASSIC_UNIFORMS; GLSL = adv ? ADV_GLSL : CLASSIC_GLSL;
}
