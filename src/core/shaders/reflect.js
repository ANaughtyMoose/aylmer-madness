// ==== s5-reflect: shared analytic reflection helpers (lake, car paint, glass) ====
// Not a chunk of its own: water.js prepends REFLECT_GLSL to its fragment GLSL,
// so it sits right after sky.js in the chunk order and every later chunk
// (glass, car, wet) can call it, with no edit to shaders/index.js.
//
// The one point of contact with the sky and light contract is reflSky(): it
// rebuilds the dome's colour along any world direction from the sky uniforms
// (uSkyLo / uSkyHi are written by the sky draw, which comes first every frame,
// and stick in the one program; uSunSky is the raw sun; uLightDir the sun
// direction). If the sky model changes (a skyDirColor(dir) from the sky owner),
// only this function needs to follow it.
//
// No texture, no pass, no cubemap: a reflection is a few ALU on the fragments
// that show it.
export const REFLECT_GLSL = `
// ---- s5-reflect: reflSky / reflEnv / reflFresnel (shaders/reflect.js)
// The sky dome's colour along a world direction R (y up), as game/sky.js
// draws it: the ramp t = pow(sin(elevation), 0.6) between the horizon colour
// and the zenith, plus the wide soft sun glow (the disc is left to the glint).
vec3 reflSky(highp vec3 R) {
  float t = pow(clamp(R.y, 0.0, 1.0), 0.6);
  vec3 c = mix(uSkyLo, uSkyHi, t);
  highp float s = max(dot(R, uLightDir), 0.0);
  return c + uSunSky * (pow(s, 10.0) * 0.16);
}
// The sky above the horizon and, below it, the street, lawns and walls across
// the way (the ground bounce, dimmed). blur widens the join for rough surfaces.
vec3 reflEnv(highp vec3 R, float blur) {
  vec3 sky = reflSky(vec3(R.x, max(R.y, 0.0), R.z));
  return mix(uGround * 0.45, sky, smoothstep(-blur, blur, R.y));
}
// Schlick Fresnel; cosT is dot(normal, direction to the eye).
float reflFresnel(float cosT, float f0) {
  float m = 1.0 - clamp(cosT, 0.0, 1.0);
  float m2 = m * m;
  return f0 + (1.0 - f0) * m2 * m2 * m;
}
// ---- end s5-reflect helpers
`;
