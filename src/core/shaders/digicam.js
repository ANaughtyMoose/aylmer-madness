// 2004 digicam photo grade. The last hook on every fragment's output colour.
// Identity (and off) until V6-02 (2004 digicam photo mode).
export const UNIFORMS = {};

export const VERT = '';

export const GLSL = `
vec3 digicam(vec3 col) { return col; }
`;
