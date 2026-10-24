// Fog: exp2 distance fog toward the env fog colour. opts.fogMul thins it per
// draw (gl.js scales uFogDensity).
// Owner after V0-01: V1-04 (aerial perspective, height fog).
export const UNIFORMS = {
  uFogColor: { type: 'vec3', managed: true },
  uFogDensity: { type: 'float', managed: true },
};

export const VERT = '';

export const GLSL = `
vec3 applyFog(vec3 col) {
  float f = exp(-pow(vDist * uFogDensity, 2.0));
  return mix(uFogColor, col, clamp(f, 0.0, 1.0));
}
`;
