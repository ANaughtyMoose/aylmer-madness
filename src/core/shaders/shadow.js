// Sun shadow. Hook on the sun's Lambert term (1.0 = fully lit by the sun).
// Identity until V6-01 (near sun shadows, high tier).
export const UNIFORMS = {};

export const VERT = '';

export const GLSL = `
float sunShadow(float d, vec3 n) { return d; }
`;
