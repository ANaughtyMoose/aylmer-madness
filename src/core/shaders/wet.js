// Wet surfaces (rain, puddles). Hook on the albedo of lit fragments, before
// light. Identity until V5-02 (rain, wet roads and the July storm).
//
// ==== s5-reflect (V5-02 subset): wet roads ====
// Flag wet (look/flags.js); look/wetroads.js pushes the uniforms from the
// weather (G.weather.wet, .rain) and, at night, the nearest streetlamp heads.
// What it does, MAT_WORLD lit fragments only (cars, water, decals and unlit
// pool discs are left alone): darkens wet ground (asphalt about 40 %, grass
// a little, walls a touch), then on up-facing non-grass surfaces adds a sky
// sheen by Fresnel (silver toward the horizon by day) and the long smeared
// streaks of the lamps (Blinn on a grazing ground plane stretches into a
// vertical streak by itself). Dry frames cost one compare.
// Not built from the V5-02 spec: puddles, ripples, lightning, 3D rain, car
// and signal lights in the light list.
export const WET = { SLOTS: 8, RANGE: 160 };

export const UNIFORMS = {
  uWet: { type: 'vec4', value: [0, 0, 0, 0] },    // x road wetness 0..1, y rain 0..1
  uWetN: { type: 'int', value: 0 },               // live light slots
  uWetLight: { type: `vec4[${WET.SLOTS}]` },      // xyz lamp head, w intensity
  uWetLightCol: { type: `vec4[${WET.SLOTS}]` },   // rgb colour
};

export const VERT = '';

export const GLSL = `
// ---- s5-reflect: wet roads
float wnoise(highp vec2 p) {
  highp vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  highp vec4 h = fract(sin(vec4(dot(i, vec2(127.1, 311.7)), dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7)),
    dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7)), dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7)))) * 43758.5453);
  return mix(mix(h.x, h.y, u.x), mix(h.z, h.w, u.x), u.y);
}
vec3 wetAlbedo(vec3 base, vec3 n) {
  if (uWet.x < 0.002 || uMaterial != MAT_WORLD || uUnlit > 0.5) return base;
  float up = smoothstep(0.80, 0.96, n.y);
  float veg = smoothstep(0.03, 0.08, base.g - max(base.r, base.b));
  base *= 1.0 - uWet.x * (0.42 * up * (1.0 - veg) + 0.12 * veg * up + 0.06 * (1.0 - up));
  float gloss = uWet.x * up * (1.0 - veg);
  if (gloss < 0.002) return base;
  highp vec3 p = worldPos();
  gloss *= (0.55 + 0.45 * wnoise(p.xz * 0.25)) * (0.80 + 0.20 * wnoise(p.xz * 2.1));
  highp vec3 V = -vRel / max(vDist, 0.001);
  highp vec3 R = reflect(-V, n);
  float F = reflFresnel(dot(n, V), 0.02);
  vec3 S = reflSky(vec3(R.x, abs(R.y), R.z)) * (F * 0.9);
  if (vDist < ${WET.RANGE.toFixed(1)}) {
    float shin = mix(25.0, 160.0, gloss);   // low: the grazing lobe smears into a long streak
    vec3 L = vec3(0.0);
    for (int i = 0; i < ${WET.SLOTS}; i++) {
      if (i >= uWetN) break;
      highp vec3 dl = uWetLight[i].xyz - p;
      if (dot(dl.xz, dl.xz) > 4900.0) continue;
      highp vec3 h = normalize(normalize(dl) + V);
      float att = uWetLight[i].w / (1.0 + dot(dl, dl) / 121.0);
      L += uWetLightCol[i].rgb * (att * pow(max(dot(n, h), 0.0), shin) * 7.0);
    }
    S += min(L * F * 4.0, vec3(2.5));
  }
  // The light below multiplies what this returns: divide the radiance by it.
  vec3 la = max(ambientLight(n) + uSun * sunLambert(n), vec3(0.05));
  return base + min(S * gloss / la, vec3(4.0));
}
`;
