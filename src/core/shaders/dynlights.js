// Dynamic lights (headlights, tail lights). Hook on the light arriving at a
// lit fragment (ambient + sun), before it multiplies the albedo.
// Identity until V4-02 (headlights and tail lights).
export const UNIFORMS = {};

export const VERT = '';

export const GLSL = `
vec3 dynLight(vec3 light, vec3 n) { return light; }
`;
