// Overhead wires (MAT_WIRE): a vertex hook on the world position (minimum
// on-screen width goes here) and a fragment hook on the final colour.
// Identity until V2-06 (Hydro-Quebec poles and overhead wires).
export const UNIFORMS = {};

export const VERT = `
vec3 wireVertex(vec3 wp) { return wp; }
`;

export const GLSL = `
vec4 wireShade(vec4 c) { return c; }
`;
