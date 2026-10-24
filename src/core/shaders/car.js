// Car paint. Hook on the lit colour of MAT_CAR fragments, before fog.
//
// ==== s5-reflect (V3-05 shader): clear coat with an analytic sky ====
// Only bodies cars.js tagged reach here as MAT_CAR (look/carpaint.js), and
// the tag is the normal's length (cars.js CAR_MAT_LEN): paint 0.90 to 1.0
// (roughness in the length), glass 0.75, chrome 0.55, rubber and lenses 0.35,
// matte 0.15. The environment is built from the sky uniforms along the
// reflected ray (reflEnv, shaders/reflect.js, prepended by water.js) plus a
// dark tree-and-roof skyline band: no texture, no pass, no cubemap, and it
// follows the time of day every frame. A sun lobe whose width follows the
// roughness slides over the hood as the car turns.
export const CAR = { F0: 0.04, SUN_MAX: 1.6, NIGHT_LO: 0.06, NIGHT_HI: 0.30 };

export const UNIFORMS = {};

export const VERT = '';

const f = (x) => Number(x).toFixed(4);

export const GLSL = `
// ---- s5-reflect: car env and paint
vec3 carEnv(highp vec3 r, float rough) {
  float w = 0.02 + 0.30 * rough;
  vec3 env = reflEnv(r, w);
  // Trees and roofs 50 to 100 m off fill 3 to 7 degrees over the horizon.
  // Integer multiples of the azimuth keep the atan seam continuous.
  float az = atan(r.z, r.x);
  float h = 0.05 + 0.03 * sin(7.0 * az + 1.3) + 0.02 * sin(17.0 * az + 4.1) + 0.012 * sin(41.0 * az + 0.7);
  float band = (1.0 - smoothstep(h - w * 0.5, h + w * 0.5, r.y)) * smoothstep(-w, 0.0, r.y);
  return mix(env, mix(uGround, uFogColor, 0.35) * 0.35, band * (1.0 - 0.5 * rough));
}
vec3 carLobe(highp vec3 r, vec3 n, float rough, float F, float day) {
  float a = rough * rough;
  float p = clamp(2.0 / (a * a) - 2.0, 8.0, 4000.0);
  vec3 lobe = uSun * (F * (p + 2.0) / 8.0 * pow(max(dot(r, uLightDir), 0.0), p));
  return min(lobe, vec3(${f(CAR.SUN_MAX)})) * step(0.0, dot(n, uLightDir)) * day;
}
vec3 carShade(vec3 col, vec3 base, vec3 n) {
  float sx = length(uModel[0].xyz);
  if (abs(length(uModel[1].xyz) - sx) > 1e-3 * sx || abs(length(uModel[2].xyz) - sx) > 1e-3 * sx) return col;   // tags need a uniform scale
  float L = length(vNor) / max(sx, 1e-4);
  if (L <= 0.25) return col;                                   // matte: plates, rust
  highp vec3 V = -vRel / max(vDist, 0.001);
  highp vec3 r = reflect(-V, n);
  float F = reflFresnel(dot(n, V), ${f(CAR.F0)});
  float day = smoothstep(${f(CAR.NIGHT_LO)}, ${f(CAR.NIGHT_HI)}, dot(uSun, vec3(0.2126, 0.7152, 0.0722)));
  vec3 raw = col / max(uColorMul, vec3(0.05));                  // before the traffic tint
  if (L > 0.875) {                                              // paint
    float rough = clamp(0.15 + (1.0 - L) * 6.0, 0.15, 0.75);
    float clear = 1.0 - 0.5 * smoothstep(0.35, 0.70, rough);
    float k = F * clear * (1.0 - 0.5 * rough);
    return col * (1.0 - k) + carEnv(r, rough) * k + carLobe(r, n, rough, F, day);
  }
  if (L > 0.65) {                                               // glass: a dark mirror
    return raw * 0.35 + carEnv(r, 0.04) * (0.18 + 0.75 * F) + carLobe(r, n, 0.06, F, day) * 0.8;
  }
  if (L > 0.45) {                                               // chrome
    return base * carEnv(r, 0.10) * 1.05 + raw * 0.10 + carLobe(r, n, 0.10, 1.0, day) * base * 0.6;
  }
  return col + carEnv(r, 0.75) * (F * 0.25);                    // rubber, trim, lenses
}
`;
