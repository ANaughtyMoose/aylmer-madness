// Ground decals (MAT_DECAL): a vertex hook on the world position and a fragment
// hook on the final colour. Identity until V2-08 (moving tree and house shadow
// decals).
export const UNIFORMS = {};

export const VERT = `
vec3 decalVertex(vec3 wp) { return wp; }
`;

export const GLSL = `
vec4 decalShade(vec4 c) { return c; }
`;
