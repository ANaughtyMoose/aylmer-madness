// Light: the sun (Lambert) and the hemispheric ambient, plus gradeLight(), the
// CPU-side grade the renderer applies to the env before it sets these uniforms.
// Owner after V0-01: V1-01 (linear light, filmic curve and grade).
export const UNIFORMS = {
  uLightDir: { type: 'vec3', managed: true },
  uSun: { type: 'vec3', managed: true },     // graded sun (gradeLight)
  uSky: { type: 'vec3', managed: true },     // graded upper hemisphere
  uGround: { type: 'vec3', managed: true },  // graded lower hemisphere
};

export const VERT = '';

export const GLSL = `
// Sun term: n is the normalised surface normal.
float sunLambert(vec3 n) { return max(dot(n, uLightDir), 0.0); }
// Hemispheric ambient: ground bounce below, sky above.
vec3 ambientLight(vec3 n) { return mix(uGround, uSky, n.y * 0.5 + 0.5); }
`;

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
