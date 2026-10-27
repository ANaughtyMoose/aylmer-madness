// Shared declarations for the one program gl.js builds (see shaders/index.js).
// The vertex stream, the varyings, the material codes and the per-draw
// uniforms the renderer itself sets. Every other chunk may read these.
//
// Material codes: opts.material in Renderer.draw() picks one, and uMaterial
// carries it to both stages. The numbers are part of the GLSL ABI below, so
// add new ones at the end and never renumber.
export const MATERIALS = {
  world: 0, sky: 1, water: 2, car: 3, decal: 4, wire: 5, sprite: 6, particle: 7,
};
// Names callers already pass that share a code. 'building' is the role
// world.js and landmarks.js give house and landmark draws for the prototype
// renderer (src/prototype/renderer.js); here it is world until a task gives
// buildings their own code.
export const MATERIAL_ALIASES = { building: 'world', object: 'world' };

// Uniforms the renderer manages (begin() and draw() set them). r.uniform() can
// still write them, but the next begin()/draw() may overwrite the value.
export const UNIFORMS = {
  uVP: { type: 'mat4', managed: true },
  uModel: { type: 'mat4', managed: true },
  uEye: { type: 'vec3', managed: true },
  uTime: { type: 'float', managed: true },
  uMaterial: { type: 'int', managed: true },
  uAlpha: { type: 'float', managed: true },
  uUnlit: { type: 'float', managed: true },
  uColorMul: { type: 'vec3', managed: true },
  uUseTex: { type: 'float', managed: true },
  // Texture units are fixed: uTex is unit 0 (opts.tex, the material atlas or a
  // skin), uTex2 is unit 1 (opts.tex2, the ground atlas; see material.js).
  uTex: { type: 'sampler2D', managed: true, value: 0 },
  uTex2: { type: 'sampler2D', managed: true, value: 1 },
};

const DEFINES = Object.entries(MATERIALS).map(([k, v]) => `#define MAT_${k.toUpperCase()} ${v}`).join('\n');

export const VERT = `${DEFINES}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec3 aCol;
layout(location=3) in vec2 aUV;
// Atlas sub-rect (u0, v0, du, dv) this vertex tiles inside; du == 0 means the
// UV is absolute. Constant across a face, hence flat (see mesh.js). u0 >= 2.0
// selects the second sampler (material.js).
layout(location=4) in vec4 aRect;
out vec3 vNor; out vec3 vCol; out float vDist; out highp vec2 vUV; out vec3 vRel;
flat out highp vec4 vRect;
`;

const CLASSIC_GLSL = `${DEFINES}
in vec3 vNor; in vec3 vCol; in float vDist; in highp vec2 vUV; in highp vec3 vRel;
flat in highp vec4 vRect;
out vec4 outColor;
// World-space position of this fragment.
highp vec3 worldPos() { return vRel + uEye; }
`;
// W8-LIGHT: « Éclairage avancé » adds the transfer functions; off (the
// default) assembles exactly the lines above (shaders/index.js lightMode).
const ADV_GLSL = CLASSIC_GLSL + `// S5-LIGHT (V1-01): exact sRGB transfer, not a 2.2 power, and Rec.709 luminance.
vec3 srgbToLinear(vec3 c) { c = max(c, vec3(0.0));
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 linearToSrgb(vec3 c) { c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
float lum709(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;
export let GLSL = CLASSIC_GLSL;
export function lightMode(adv) { GLSL = adv ? ADV_GLSL : CLASSIC_GLSL; }
