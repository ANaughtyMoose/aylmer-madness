// Sky dome (see game/sky.js): vCol.r is 0 at the horizon and 1 at the zenith.
// No lighting, no fog; the sun is a small disc plus a wide soft glow. Drawn
// with opts.sky (or opts.material 'sky'); gl.js turns depth writes and culling
// off for that draw. uSkyLo / uSkyHi default to env.fog / env.sky; uSunSky is
// the raw (ungraded) sun colour.
// Owner after V0-01: V1-03 (sky model and clouds).
export const UNIFORMS = {
  uSkyLo: { type: 'vec3', managed: true },
  uSkyHi: { type: 'vec3', managed: true },
  uSunSky: { type: 'vec3', managed: true },
};

export const VERT = '';

export const GLSL = `
// dir: normalised view direction from the eye.
vec3 skyColor(highp vec3 dir) {
  highp float s = max(dot(dir, uLightDir), 0.0);
  vec3 skyCol = mix(uSkyLo, uSkyHi, vCol.r);
  skyCol += uSunSky * (pow(s, 1500.0) * 1.1 + pow(s, 10.0) * 0.16);
  return skyCol;
}
`;
