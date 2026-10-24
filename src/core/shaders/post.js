// Post. The in-shader end of the post pipeline: a hook on every fragment's
// output colour after the tone curve (the offscreen target, bloom and blit
// live in gl.js). Identity until V5-01 (post pipeline and bloom-lite).
export const UNIFORMS = {};

export const VERT = '';

export const GLSL = `
vec3 postColor(vec3 col) { return col; }
`;
