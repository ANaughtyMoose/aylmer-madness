// Sky dome (see game/sky.js). No lighting, no fog. Drawn with opts.sky (or
// opts.material 'sky'); gl.js turns depth writes and culling off for that draw.
// uSkyLo / uSkyHi default to env.fog / env.sky; uSunSky is the raw sun colour.
//
// S5-LIGHT (V1-03, 20 Oct), look flag `sky2`: a per-pixel sky instead of the
// six-ring gradient and the 28 octagon puffs the art bible bans. A milky
// horizon band, a warm glow round the sun that widens as the sun drops, a
// cooler anti-sun side, a drifting value-noise cumulus deck lit from the sun
// side (cover from the timecycle), a few cirrus streaks, stars at night and
// the town's orange glow low toward Hull and Ottawa. Everything returns
// display-referred colour; tonemap() decodes the dome (V1-01). Flag off: the
// old formula, exactly. Four functions other chunks may call:
//   skyGradient(dir)  gradient, horizon, sun glow, anti-sun, town glow; no clouds
//   skyDirColor(dir)  the cheap sky for reflections (V3-06's name): gradient and
//                     sun lobes only, LINEAR when linearDraw() (s5-reflect's
//                     reflSky calls it), display sRGB otherwise
//   skyHorizon(dir)   skyGradient at elevation 0 in dir's azimuth (V1-04's fog)
//   skyHorizonLin(dir) the same in linear light, for the fog when `linear` is on
//   skyColor(dir)     the dome
//
// Wave 7 cuts (references/review/rf-s5-light/CUT-PLAN.md): everything that is
// uniform per frame is folded on the CPU by game/sky.js skyOpts(): the sun
// direction normalised (uSkyL), the horizon colour H, the gradient exponent,
// the sun-glow and anti-sun scales, the town glow (uSkyFold0/1, uSkyGlowK) and
// the linear copies the fog and the reflections read (no per-pixel decode).
// At elevation 0 the gradient and the haze band collapse to H exactly, so
// skyHorizon is H + sun lobes + anti-sun + town glow (cut 1). Sun lobes by
// squarings or one shared log2 (cut 4). Tier cuts (game/sky.js): medium and
// low read the cloud light from the first octave's slope instead of a 4th
// noise (cut 6) and draw no cirrus (cut 7); high keeps both.
export const SKY_K = {
  gradPow: 0.6, deckScale: 1.9, peak: 3.0, glowFall: 16.0,
  windDir: [0.93, -0.36],
};
const K = SKY_K, f = (v) => Number(v).toFixed(4);

// W8-LIGHT: « Éclairage avancé » off (the default) assembles fix/look-on-qr's
// sky, the CLASSIC_ pair; on, the ADV_ pair (lightMode, shaders/index.js).
const CLASSIC_UNIFORMS = {
  uSkyLo: { type: 'vec3', managed: true },
  uSkyHi: { type: 'vec3', managed: true },
  uSunSky: { type: 'vec3', managed: true },
};
const ADV_UNIFORMS = {
  ...CLASSIC_UNIFORMS,
  uSunSkyLin: { type: 'vec3', managed: true },   // CUT-PLAN cut 2: srgbToLinear(uSunSky), decoded on the CPU
  // Wave 7 folds (game/sky.js skyOpts, once a frame):
  uSkyL: { type: 'vec4', value: [0, 1, 0, 0] },        // xyz normalize(uLightDir), w low-sun weight
  uSkyFold0: { type: 'vec4', value: [0.8, 0.85, 0.9, 0.6] },   // xyz horizon colour H (display), w gradient exponent
  uSkyFold1: { type: 'vec4', value: [0.25, 0, 1, 0] },  // x sun-glow scale, y anti-sun scale, zw sun azimuth
  uSkyGlowK: { type: 'vec3', value: [0, 0, 0] },       // town glow colour x 0.5 x strength (display)
  uSkyGlowKLin: { type: 'vec3', value: [0, 0, 0] },    // ...decoded
  uSkyLoLin: { type: 'vec3', value: [0.6, 0.7, 0.8] }, // env.fog decoded (uSkyLo)
  uSkyHiLin: { type: 'vec3', value: [0.4, 0.5, 0.7] }, // env.sky decoded (uSkyHi)
  uSkyHLin: { type: 'vec3', value: [0.6, 0.7, 0.8] },  // H decoded
  uSkyCfg: { type: 'vec4', value: [0, 0, 0, 2] },      // x sky2 on, y cumulus cover, z cirrus, w octaves (1..3)
  uSkyLook: { type: 'vec4', value: [0, 0, 0, 0] },     // x night, y haze, zw cumulus wind offset
  uCloudLit: { type: 'vec3', value: [1, 1, 1] },
  uCloudShade: { type: 'vec3', value: [0.7, 0.72, 0.75] },
  uSkyGlow: { type: 'vec4', value: [0.955, 0, -0.298, 0] },   // xyz unit dir toward Parliament, w strength
  uSkyGlowCol: { type: 'vec3', value: [0.23, 0.16, 0.12] },
};

export const VERT = '';

const ADV_GLSL = `
float skyHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float skyNoise(vec2 p) {
  vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x), mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Value noise and its slope d/dp (the smoothstep's derivative 6u(1-u)).
vec3 skyNoiseD(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = skyHash(i), b = skyHash(i + vec2(1.0, 0.0)), c = skyHash(i + vec2(0.0, 1.0)), d = skyHash(i + vec2(1.0, 1.0));
  float k = a - b - c + d;
  return vec3(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), du.x * (b - a + k * u.y), du.y * (c - a + k * u.x));
}
float skyLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec2 skyAz(highp vec3 d) { return d.xz / max(length(d.xz), 1e-4); }
vec3 skyGradient(highp vec3 dir) {
  float y = max(dir.y, 0.0);
  if (uSkyCfg.x < 0.5) return mix(uSkyLo, uSkyHi, pow(y, 0.6)) + uSunSky * (pow(max(dot(dir, uLightDir), 0.0), 10.0) * 0.16);
  highp float s = max(dot(dir, uSkyL.xyz), 0.0);
  // A warm horizon under a blue zenith (golden hour) hugs the horizon instead of
  // greying the whole dome; noon's cool-on-cool gradient keeps gradPow (the
  // exponent is folded on the CPU, uSkyFold0.w).
  float t = pow(y, uSkyFold0.w);
  vec3 c = mix(uSkyLo, uSkyHi * 0.94, t);
  float hz = 0.6 * exp(-y * (14.0 - 6.0 * uSkyLook.y)) + 0.4 * exp(-y * 80.0);
  c = mix(c, uSkyFold0.xyz, hz);
  highp float s2 = s * s, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8, s48 = s16 * s16 * s16;   // CUT-PLAN cut 4: squarings, no pow
  c += uSunSky * ((0.10 * s8 + 0.24 * s48) * (0.6 + 0.4 * (1.0 - t)) * uSkyFold1.x);
  vec2 az = skyAz(dir);
  float a = clamp(-dot(az, uSkyFold1.zw), 0.0, 1.0);
  c *= 1.0 - uSkyFold1.y * a * (1.0 - t);
  // The town's sodium glow low over Hull and Ottawa (night only).
  float gh = smoothstep(0.2, 0.95, dot(az, uSkyGlow.xz));
  c += uSkyGlowK * ((0.25 + 0.75 * gh) * exp(-y * ${f(K.glowFall)}));
  return c;
}
// CUT-PLAN cut 1: skyGradient at elevation 0, folded. H, sun and glow are the
// display or the linear set, so the fog needs no per-pixel decode (cut 3).
vec3 skyHorizonAz(vec2 az, vec3 H, vec3 sun, vec3 glowK) {
  highp float s = max(az.x * uSkyL.x + az.y * uSkyL.z, 0.0);
  highp float s2 = s * s, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8, s48 = s16 * s16 * s16;
  vec3 c = H + sun * ((0.10 * s8 + 0.24 * s48) * uSkyFold1.x);
  c *= 1.0 - uSkyFold1.y * clamp(-dot(az, uSkyFold1.zw), 0.0, 1.0);
  return c + glowK * (0.25 + 0.75 * smoothstep(0.2, 0.95, dot(az, uSkyGlow.xz)));
}
vec3 skyHorizon(highp vec3 dir) {
  vec2 a = skyAz(dir);
  if (uSkyCfg.x < 0.5) return skyGradient(vec3(a.x, 0.0, a.y));
  return skyHorizonAz(a, uSkyFold0.xyz, uSunSky, uSkyGlowK);
}
vec3 skyHorizonLin(highp vec3 dir) {
  vec2 a = skyAz(dir);
  if (uSkyCfg.x < 0.5) return srgbToLinear(skyGradient(vec3(a.x, 0.0, a.y)));
  return skyHorizonAz(a, uSkyHLin, uSunSkyLin, uSkyGlowKLin);
}
// The sky for reflections (lake, wet road, glass, car paint): one pow and the
// sun lobes by squarings; no haze band, anti-sun or town glow. Linear light when
// this draw is linear (CPU-decoded uniforms, no per-pixel decode), so a
// reflection added to linear colour does not wash out. sky2 off: reflSky's old
// formula (pow(y, 0.6) ramp + pow(s, 10) x 0.16), exact in display space.
vec3 skyDirColor(highp vec3 dir) {
  float y = clamp(dir.y, 0.0, 1.0);
  bool lin = linearDraw();
  vec3 hi = lin ? uSkyHiLin : uSkyHi;
  vec3 sun = lin ? uSunSkyLin : uSunSky;
  if (uSkyCfg.x < 0.5) {
    highp float s0 = max(dot(dir, uLightDir), 0.0);
    return mix(lin ? uSkyLoLin : uSkyLo, hi, pow(y, 0.6)) + sun * (pow(s0, 10.0) * 0.16);
  }
  float t = pow(y, uSkyFold0.w);
  highp float s = max(dot(dir, uSkyL.xyz), 0.0);
  highp float s2 = s * s, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8, s48 = s16 * s16 * s16;
  return mix(lin ? uSkyHLin : uSkyFold0.xyz, hi * 0.94, t) + sun * ((0.10 * s8 + 0.24 * s48) * (0.6 + 0.4 * (1.0 - t)) * uSkyFold1.x);
}
vec3 skyColor(highp vec3 dir) {
  highp float s = max(dot(dir, uSkyL.xyz), 0.0);
  if (uSkyCfg.x < 0.5) {   // today's formula, exactly
    highp float s0 = max(dot(dir, uLightDir), 0.0);
    vec3 skyCol = mix(uSkyLo, uSkyHi, vCol.r);
    skyCol += uSunSky * (pow(s0, 1500.0) * 1.1 + pow(s0, 10.0) * 0.16);
    return skyCol;
  }
  if (dir.y < 0.0) return skyHorizon(dir) * (0.92 + 0.08 * exp(dir.y * 20.0));
  vec3 c = skyGradient(dir);
  float y = dir.y, night = uSkyLook.x, cover = uSkyCfg.y;
  float dens = 0.0;
  vec3 H = uSkyFold0.xyz;
  if (y > 0.0 && cover + uSkyCfg.z > 0.02) {
    vec2 p = dir.xz / (y + 0.06) * ${f(K.deckScale)} - uSkyLook.zw;
    vec3 nd = skyNoiseD(p);
    float n0 = nd.x;
    float wsum = 0.5, n = 0.5 * n0;
    vec2 q = mat2(1.6, 1.2, -1.2, 1.6) * p;
    if (uSkyCfg.w > 1.5) { float w2 = 0.25 * smoothstep(0.05, 0.30, y); n += w2 * skyNoise(q); wsum += w2; }
    if (uSkyCfg.w > 2.5) { float w3 = 0.125 * smoothstep(0.05, 0.30, y); n += w3 * skyNoise(mat2(1.6, 1.2, -1.2, 1.6) * q); wsum += w3; }
    n /= wsum;
    float thr = 0.75 - 0.60 * cover, soft = 0.18 + 0.12 * cover;
    dens = smoothstep(thr, thr + soft, n);
    dens = max(dens, smoothstep(0.85, 1.0, cover));
    dens *= smoothstep(0.015, 0.20, y);
    if (dens > 0.001) {
      // High: a 4th noise a step toward the sun. Medium and low (cut 6): the same
      // finite difference read from the first octave's analytic slope.
      float dn = uSkyCfg.w > 2.5 ? n0 - skyNoise(p + uSkyFold1.zw * 0.12) : -0.12 * dot(nd.yz, uSkyFold1.zw);
      float lit = clamp(0.62 + dn * 1.6, 0.25, 1.15);
      vec3 cc = mix(uCloudShade, uCloudLit, lit);
      float low = uSkyL.w;
      cc += uSunSky * 0.45 * low * (1.0 - 0.5 * dens) * (1.0 - night);
      cc += uSunSky * 4.0 * dens * (1.0 - dens) * pow(s, 6.0) * 0.6 * (1.0 - night);
      cc = mix(cc, vec3(skyLuma(cc)), 0.6 * smoothstep(0.6, 1.0, cover));
      cc = mix(H, cc, smoothstep(0.02, 0.35, y));
      float gh = smoothstep(0.2, 0.95, dot(skyAz(dir), uSkyGlow.xz));
      cc = cc * (1.0 - 0.8 * night) + uSkyGlowCol * (0.25 + 0.75 * gh) * exp(-y * 4.0) * 0.8 * uSkyGlow.w;
      cc += H * 0.22 * exp(-y * 20.0) * smoothstep(0.9, 1.0, cover) * (1.0 - night);
      c = mix(c, cc, dens);
    }
  }
  if (uSkyCfg.z > 0.01 && y > 0.08) {
    vec2 v = dir.xz / (y + 0.02) * 0.6 - uSkyLook.zw * 0.45;
    vec2 wd = vec2(${f(K.windDir[0])}, ${f(K.windDir[1])});
    vec2 cq = vec2(dot(v, wd), dot(v, vec2(-wd.y, wd.x))) * vec2(0.22, 4.0);
    float ci = smoothstep(0.60, 0.90, skyNoise(cq)) * smoothstep(0.08, 0.5, y) * uSkyCfg.z * 0.35;
    c = mix(c, mix(H, uCloudLit + uSunSky * 0.3, 0.7), ci * (1.0 - dens));
  }
  // Sun disc and corona, hidden by the deck.
  float core = smoothstep(${f(Math.cos(0.62 * Math.PI / 180))}, ${f(Math.cos(0.50 * Math.PI / 180))}, s) * 1.4;
  highp float ls = log2(max(s, 1e-6));   // CUT-PLAN cut 4: one log2 for both corona lobes
  float cor = exp2(900.0 * ls) * 0.35 + exp2(120.0 * ls) * 0.12;
  c += uSunSky * (core + cor) * (1.0 - 0.95 * dens) * (1.0 - night);
  // Stars: a static lattice of soft points, night only, behind the clouds.
  if (night > 0.001) {
    vec3 cell = floor(dir * 150.0);
    float hs = skyHash(cell.xy + cell.z * 17.13);
    if (hs > 0.9952) {
      vec3 j = vec3(skyHash(cell.yz + 3.1), skyHash(cell.zx + 5.7), skyHash(cell.xy + 9.3)) - 0.5;
      float pt = smoothstep(0.30, 0.0, length(fract(dir * 150.0) - 0.5 - j * 0.4));
      c += vec3(0.55, 0.6, 0.7) * pt * (0.3 + 0.5 * skyHash(cell.xz + 1.7)) * night * (1.0 - cover) * smoothstep(0.05, 0.35, y) * (1.0 - dens);
    }
  }
  return min(c, vec3(${f(K.peak)}));
}
`;
const CLASSIC_GLSL = `
// dir: normalised view direction from the eye.
vec3 skyColor(highp vec3 dir) {
  highp float s = max(dot(dir, uLightDir), 0.0);
  vec3 skyCol = mix(uSkyLo, uSkyHi, vCol.r);
  skyCol += uSunSky * (pow(s, 1500.0) * 1.1 + pow(s, 10.0) * 0.16);
  return skyCol;
}
`;
export let UNIFORMS = CLASSIC_UNIFORMS;
export let GLSL = CLASSIC_GLSL;
export function lightMode(adv) {
  UNIFORMS = adv ? ADV_UNIFORMS : CLASSIC_UNIFORMS; GLSL = adv ? ADV_GLSL : CLASSIC_GLSL;
}
