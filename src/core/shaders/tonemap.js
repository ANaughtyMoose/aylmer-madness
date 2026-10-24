// Tone curve and grade, applied to every lit and sky fragment after fog.
// Identity until V1-01 (linear light, filmic curve and grade) fills it in.
export const UNIFORMS = {};

export const VERT = '';

export const GLSL = `
vec3 tonemap(vec3 col) { return col; }
`;
