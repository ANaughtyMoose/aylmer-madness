// Coronas and sprites (MAT_SPRITE, MAT_PARTICLE): a vertex hook on the world
// position (billboarding goes here) and a fragment hook on the final colour.
// Identity until V4-01 (sodium night and coronas).
export const UNIFORMS = {};

export const VERT = `
vec3 spriteVertex(vec3 wp) { return wp; }
`;

export const GLSL = `
vec4 spriteShade(vec4 c) { return c; }
`;
