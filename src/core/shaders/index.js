// The one program. gl.js compiles exactly what assemble() returns, once, at
// start-up, so no draw ever waits on a shader compile (ROADMAP 2.4).
//
// Each chunk is a module that exports:
//   UNIFORMS  { uName: 'type' | { type, value, managed } }  its own uniforms.
//             The declarations are generated here, in both stages, so a chunk
//             never writes `uniform ...` itself. Types: float, int, vec2-4,
//             mat3, mat4, sampler2D, and arrays as 'vec4[6]'. `value` is set
//             once at start-up; `managed` means gl.js sets it every frame/draw.
//   VERT      vertex-stage GLSL (functions), may be ''.
//   GLSL      fragment-stage GLSL (functions), may be ''.
// The two main() functions below call each chunk's hooks at fixed points, so
// a later task changes its own chunk and never this file. Every hook starts as
// the identity, which keeps the picture exactly what the single shader drew.
//
// Per-draw branches read uMaterial, which is constant across a draw, so they
// are coherent on the GPU.
import * as common from './common.js';
import * as light from './light.js';
import * as tonemap from './tonemap.js';
import * as fog from './fog.js';
import * as sky from './sky.js';
import * as water from './water.js';
import * as material from './material.js';
import * as glass from './glass.js';
import * as car from './car.js';
import * as decal from './decal.js';
import * as wire from './wire.js';
import * as corona from './corona.js';
import * as dynlights from './dynlights.js';
import * as wet from './wet.js';
import * as post from './post.js';
import * as digicam from './digicam.js';
import * as shadow from './shadow.js';
import { advLight } from '../../game/look/advlight.js';

export const MATERIALS = common.MATERIALS;
export const MATERIAL_ALIASES = common.MATERIAL_ALIASES;

// Order matters only for GLSL: a chunk may call functions of chunks before it.
export const CHUNKS = {
  common, light, tonemap, fog, sky, water, material, glass, car, decal, wire,
  corona, dynlights, wet, shadow, post, digicam,
};

const VERT_MAIN = `
void main(){
  vUV = aUV;
  vRect = aRect;
  vec3 p = aPos;
  if (uMaterial == MAT_WATER) p = waterVertex(p);
  vec4 wp = uModel * vec4(p,1.0);
  if (uMaterial == MAT_DECAL) wp.xyz = decalVertex(wp.xyz);
  else if (uMaterial == MAT_WIRE) wp.xyz = wireVertex(wp.xyz);
  else if (uMaterial == MAT_SPRITE || uMaterial == MAT_PARTICLE) wp.xyz = spriteVertex(wp.xyz);
  vNor = mat3(uModel) * aNor;
  vCol = aCol;
  gl_Position = uVP * wp;
  vRel = wp.xyz - uEye;
  vDist = length(vRel);
}`;

const FRAG_MAIN = `
void main(){
  if (uMaterial == MAT_SKY) {
    vec3 skyCol = skyColor(normalize(vRel));
    outColor = vec4(digicam(postColor(tonemap(skyCol))), 1.0);
    return;
  }
  vec3 n = normalize(vNor);
  float d = sunShadow(sunLambert(n), n);
  vec3 amb = ambientLight(n);
  vec4 tx = materialTexel();
  // Texture MULTIPLIES the vertex colour (white texel => vertex colour as it
  // was), so a chunk can mix textured houses and untextured scenery in one
  // draw and builders can tint a material (vinyl_white x tint = any siding).
  vec3 base = glowAlbedo(vCol) * mix(vec3(1.0), tx.rgb, uUseTex);   // S5-LIGHT: the night-glow tag off (glass.js)
  // Alpha cut-out is for absolute-UV geometry only: decals (windows, doors) and
  // car skins. A tiled cell (vRect.z > 0) never discards: at a high mip level
  // its edge texels average in the transparent gutter around the atlas cell,
  // and a roof that dissolves at 150 m is worse than a slightly soft edge.
  if (uUseTex > 0.5 && vRect.z <= 0.0 && tx.a < 0.35) discard;
  base = materialAlbedo(base, tx);
  base = wetAlbedo(base, n);
  if (uMaterial == MAT_WATER) base = waterAlbedo(base);
  // S5-LIGHT (V1-01): the albedo hooks above stay display-referred; light is linear from here.
  base = linearAlbedo(base);
  vec3 mulL = linearAlbedo(uColorMul);
  vec3 light = dynLight(amb + uSun * d, n);
  vec3 lit = albedoCeil(base) * mulL * light;
  vec3 col = mix(lit, base * mulL, uUnlit);
  col += gReflRad * mulL;   // wave 7: lake and wet-road reflection radiance, linear only (reflect.js)
  col = glassShade(col, base, n);
  if (uMaterial == MAT_CAR) col = carShade(col, base, n);
  col = applyFog(col);
  vec4 c = vec4(tonemap(col), uAlpha);
  if (uMaterial == MAT_DECAL) c = decalShade(c);
  else if (uMaterial == MAT_WIRE) c = wireShade(c);
  else if (uMaterial == MAT_SPRITE || uMaterial == MAT_PARTICLE) c = spriteShade(c);
  c.rgb = digicam(postColor(c.rgb));
  outColor = c;
}`;

// W8-LIGHT: « Éclairage avancé » off (the default) is fix/look-on-qr's main(),
// verbatim: no albedo decode, no ceiling, no linear reflection radiance.
const FRAG_MAIN_CLASSIC = `
void main(){
  if (uMaterial == MAT_SKY) {
    vec3 skyCol = skyColor(normalize(vRel));
    outColor = vec4(digicam(postColor(tonemap(skyCol))), 1.0);
    return;
  }
  vec3 n = normalize(vNor);
  float d = sunShadow(sunLambert(n), n);
  vec3 amb = ambientLight(n);
  vec4 tx = materialTexel();
  // Texture MULTIPLIES the vertex colour (white texel => vertex colour as it
  // was), so a chunk can mix textured houses and untextured scenery in one
  // draw and builders can tint a material (vinyl_white x tint = any siding).
  vec3 base = vCol * mix(vec3(1.0), tx.rgb, uUseTex);
  // Alpha cut-out is for absolute-UV geometry only: decals (windows, doors) and
  // car skins. A tiled cell (vRect.z > 0) never discards: at a high mip level
  // its edge texels average in the transparent gutter around the atlas cell,
  // and a roof that dissolves at 150 m is worse than a slightly soft edge.
  if (uUseTex > 0.5 && vRect.z <= 0.0 && tx.a < 0.35) discard;
  base = materialAlbedo(base, tx);
  base = wetAlbedo(base, n);
  if (uMaterial == MAT_WATER) base = waterAlbedo(base);
  vec3 light = dynLight(amb + uSun * d, n);
  vec3 lit = base * uColorMul * light;
  vec3 col = mix(lit, base * uColorMul, uUnlit);
  col = glassShade(col, base, n);
  if (uMaterial == MAT_CAR) col = carShade(col, base, n);
  col = applyFog(col);
  vec4 c = vec4(tonemap(col), uAlpha);
  if (uMaterial == MAT_DECAL) c = decalShade(c);
  else if (uMaterial == MAT_WIRE) c = wireShade(c);
  else if (uMaterial == MAT_SPRITE || uMaterial == MAT_PARTICLE) c = spriteShade(c);
  c.rgb = digicam(postColor(c.rgb));
  outColor = c;
}`;

const TYPES = new Set(['float', 'int', 'vec2', 'vec3', 'vec4', 'mat3', 'mat4', 'sampler2D']);

// name -> { type, base, count, value, managed, chunk } for every chunk uniform.
// A name declared by two chunks is an error: one owner per uniform.
export function uniformTable() {
  const out = {};
  for (const [chunk, mod] of Object.entries(CHUNKS)) {
    for (const [name, spec] of Object.entries(mod.UNIFORMS || {})) {
      if (out[name]) throw new Error(`uniform ${name} declared by both ${out[name].chunk} and ${chunk}`);
      const s = typeof spec === 'string' ? { type: spec } : spec;
      const m = /^(\w+)(?:\[(\d+)\])?$/.exec(s.type || '');
      if (!m || !TYPES.has(m[1])) throw new Error(`uniform ${name} (${chunk}): unknown type ${s.type}`);
      out[name] = { type: s.type, base: m[1], count: m[2] ? Number(m[2]) : 0,
        value: s.value, managed: !!s.managed, chunk };
    }
  }
  return out;
}

function declare(table) {
  const lines = [];
  for (const [name, u] of Object.entries(table)) {
    // int needs an explicit precision: the vertex stage defaults to highp and
    // the fragment stage to mediump, and a uniform shared by both must agree.
    const q = u.base === 'int' ? 'highp ' : '';
    lines.push(`uniform ${q}${u.base} ${name}${u.count ? `[${u.count}]` : ''};`);
  }
  return lines.join('\n');
}

// { vs, fs, uniforms }: the two stage sources and the uniform table.
// W8-LIGHT: point every chunk at its advanced or classic source. assemble()
// does this itself from advLight(); a smoke may call it to read one side.
export function lightMode(adv) {
  for (const m of Object.values(CHUNKS)) if (typeof m.lightMode === 'function') m.lightMode(!!adv);
}

export function assemble(adv = advLight()) {
  lightMode(adv);
  const uniforms = uniformTable();
  const decl = declare(uniforms);
  const mods = Object.values(CHUNKS);
  const head = '#version 300 es\n'
    // Both stages highp: shared uniforms may not differ in precision (ANGLE link error).
    + 'precision highp float;\n';
  const vs = head + decl + '\n' + mods.map((m) => m.VERT || '').join('\n') + VERT_MAIN;
  const fs = head + decl + '\n' + mods.map((m) => m.GLSL || '').join('\n') + (adv ? FRAG_MAIN : FRAG_MAIN_CLASSIC);
  return { vs, fs, uniforms };
}
