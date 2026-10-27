#!/usr/bin/env node
// S5-LIGHT (V1-03, V1-04): the per-pixel sky and the aerial fog. Pure node.
// W8-LIGHT: all of it is « Éclairage avancé », off by default; this smoke turns it on.
(await import('../src/game/look/advlight.js')).setAdvLight(true);
const sky = await import('../src/game/sky.js');
const shaders = await import('../src/core/shaders/index.js');
const skyChunk = await import('../src/core/shaders/sky.js');
const fogChunk = await import('../src/core/shaders/fog.js');
const flags = await import('../src/game/look/flags.js');
const { Weather } = await import('../src/game/weather.js');
const { TIME_OF_DAY } = await import('../src/game/missions.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const calls = [];
const fake = { upload: (b) => ({ vao: {}, count: b.i.length, min: [0, 0, 0], max: [0, 0, 0] }),
  uniform(n, v) { calls.push([n, typeof v === 'number' ? v : [...v]]); return this; }, time: 100, eye: [0, 80, 0], scale: 0.85 };

console.log('the chunk');
{
  const { fs } = shaders.assemble();
  const pre = fs.split('void main()')[0];
  for (const fn of ['skyGradient', 'skyDirColor', 'skyHorizon', 'skyColor']) ok(new RegExp(`vec3 ${fn}\\(highp vec3 dir\\)`).test(pre), `${fn} defined`);
  ok(/vec3\s+skyHorizon\s*\(/.test(skyChunk.GLSL), 'skyHorizon spelled as V1-04 looks for it');
  ok(/vec3 skyHorizon\(highp vec3 dir\);/.test(fogChunk.GLSL), 'fog forward-declares skyHorizon');
  ok(skyChunk.GLSL.includes('pow(s0, 1500.0) * 1.1 + pow(s0, 10.0) * 0.16'), 'flag-off dome is the old formula');
  ok(!/normalize\(dir\.xz\)/.test(skyChunk.GLSL), 'no normalize(dir.xz) (NaN at the zenith)');
  ok(skyChunk.GLSL.includes('- uSkyLook.zw'), 'the deck samples x - wind*t, so it drifts with the wind');
  ok(fogChunk.GLSL.includes('mix(uFogColor, col, clamp(exp(-od), 0.0, 1.0))'), 'flag-off fog is the old exp2 to one colour');
}

console.log('the octagon puffs go');
{
  flags.set({ sky2: true });
  const s = sky.buildSky(fake);
  ok(s.clouds.count === 0, 'sky2 on: the clouds draw has 0 triangles');
  flags.set({ sky2: false });
  ok(s.clouds.count === 672 * 3, 'sky2 off: the 28 puffs are back');
  flags.set({ sky2: true });
  ok(s.clouds.count === 0, 'and gone again');
}

console.log('state');
{
  calls.length = 0;
  const env = JSON.parse(JSON.stringify(TIME_OF_DAY.day));
  const o = sky.skyOpts(env);
  ok(o === sky.skyOpts(env), 'skyOpts returns one reused object');
  ok(calls.some(([n, v]) => n === 'uSkyCfg' && v[0] === 1), 'uSkyCfg.x = 1 with sky2 on');
  ok(sky.coverOf({ cloud: 0.7 }, null, {}).cover === 0.7, 'the timecycle cover wins');
  ok(sky.coverOf({}, new Weather({ state: 'overcast' }), {}).cover >= 0.9, 'overcast fills the deck');
  ok(sky.coverOf({}, new Weather({ state: 'clear' }), {}).cover <= 0.3, 'clear is a few cumulus');
  const st = sky.skyState(JSON.parse(JSON.stringify(TIME_OF_DAY.night)), 100, [0, 0, 0], null);
  const bearing = (Math.atan2(st.glow[0], -st.glow[2]) * 180 / Math.PI + 360) % 360;
  ok(bearing > 68 && bearing < 78, `town glow toward Parliament, bearing ${bearing.toFixed(0)}`);
  ok(st.glow[3] > 0.8, 'glow on at night');
  ok(sky.skyState(JSON.parse(JSON.stringify(TIME_OF_DAY.day)), 100, [0, 0, 0], null).glow[3] === 0, 'no glow at noon');
  ok(sky.skyState(JSON.parse(JSON.stringify(TIME_OF_DAY.night)), 100, [9000, 0, -3000], null).glow[3] === 0, 'no glow from inside Hull');
  const a = sky.skyState(env, 100, [0, 0, 0], null).look.slice(2), b = sky.skyState(env, 100, [0, 0, 0], null).look.slice(2);
  ok(a[0] === b[0] && a[1] === b[1], 'wind is deterministic in time');
  flags.set({ sky2: false }); calls.length = 0; sky.skyOpts(env);
  ok(calls.some(([n, v]) => n === 'uSkyCfg' && v[0] === 0), 'sky2 off sends uSkyCfg.x = 0');
  flags.set({ sky2: true });
}

console.log('wave 7 cuts');
{
  const mk = (e) => JSON.parse(JSON.stringify(e));
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // JS twin of the pre-cut skyGradient at elevation 0 (display), from the raw env.
  const oldHorizon = (env, st, az) => {
    const d = env.lightDir, l = Math.hypot(...d), L = d.map((v) => v / l);
    const lo = env.fog, H = lo.map((v) => (v + (lum(lo) - v) * 0.25) * 1.06);
    const s = Math.max(az[0] * L[0] + az[1] * L[2], 0);
    const low = 1 - sm(0.05, 0.35, L[1]), day = 1 - st.look[0];
    const al = Math.hypot(L[0], L[2]), sa = [L[0] / al, L[2] / al];
    const a = Math.min(1, Math.max(0, -(az[0] * sa[0] + az[1] * sa[1])));
    const gh = sm(0.2, 0.95, az[0] * st.glow[0] + az[1] * st.glow[2]);
    return [0, 1, 2].map((i) => {
      let c = H[i] + env.sun[i] * (0.10 * s ** 8 + 0.24 * s ** 48) * 1 * (1 + 0.8 * low) * (0.25 + 0.75 * day);
      c *= 1 - 0.14 * a * low * 1 * day;
      return c + st.glowCol[i] * 0.5 * (0.25 + 0.75 * gh) * 1 * st.glow[3];
    });
  };
  // JS twin of the folded skyHorizonAz.
  const newHorizon = (F, st, az) => {
    const s = Math.max(az[0] * F.L[0] + az[1] * F.L[2], 0);
    const a = Math.min(1, Math.max(0, -(az[0] * F.f1[2] + az[1] * F.f1[3])));
    const gh = sm(0.2, 0.95, az[0] * st.glow[0] + az[1] * st.glow[2]);
    return [0, 1, 2].map((i) => (F.f0[i] + env0sun[i] * ((0.10 * s ** 8 + 0.24 * s ** 48) * F.f1[0])) * (1 - F.f1[1] * a) + F.gk[i] * (0.25 + 0.75 * gh));
  };
  let env0sun = null, worst = 0;
  const night = mk(TIME_OF_DAY.night); night.lightDir = [0.3, 0.12, -0.5];
  const golden = mk(TIME_OF_DAY.day); golden.lightDir = [-0.9, 0.15, 0.2]; golden.sun = [1.0, 0.62, 0.32];
  for (const env of [mk(TIME_OF_DAY.day), golden, night]) {
    const st = sky.skyState(env, 100, [0, 0, 0], null);
    const F = sky.skyFolds(env, st, sky.skyBase(env));
    env0sun = env.sun;
    for (let k = 0; k < 24; k++) {
      const az = [Math.cos(k * 0.2618), Math.sin(k * 0.2618)];
      const o = oldHorizon(env, st, az), n = newHorizon(F, st, az);
      for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(o[i] - n[i]));
    }
  }
  ok(worst < 2e-6, `cut 1: the folded horizon equals skyGradient at elevation 0 (worst ${worst.toExponential(1)})`);
  const F = sky.skyBase(mk(TIME_OF_DAY.day));
  ok(Math.abs(Math.hypot(F.L[0], F.L[1], F.L[2]) - 1) < 1e-6, 'uSkyL is unit');
  // Cut 6: the analytic slope of the first octave matches its finite difference.
  const fr = (x) => x - Math.floor(x);
  const hash = (x, y) => { x = fr(x * 123.34); y = fr(y * 456.21); const d = x * (x + 45.32) + y * (y + 45.32); x += d; y += d; return fr(x * y); };
  const noiseD = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), dx = 6 * fx * (1 - fx), dy = 6 * fy * (1 - fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1), k = a - b - c + d;
    const m = (p, q, t) => p + (q - p) * t;
    return [m(m(a, b, ux), m(c, d, ux), uy), dx * (b - a + k * uy), dy * (c - a + k * ux)];
  };
  let gw = 0;
  for (let i = 0; i < 200; i++) {
    const x = 0.3 + i * 0.137, y = 0.7 + i * 0.091, e = 1e-4;
    const n = noiseD(x, y), gx = (noiseD(x + e, y)[0] - noiseD(x - e, y)[0]) / (2 * e), gy = (noiseD(x, y + e)[0] - noiseD(x, y - e)[0]) / (2 * e);
    gw = Math.max(gw, Math.abs(gx - n[1]), Math.abs(gy - n[2]));
  }
  ok(gw < 1e-3, `cut 6: skyNoiseD slope is the noise's derivative (worst ${gw.toExponential(1)})`);
  ok(/vec3 skyNoiseD\(vec2 p\)/.test(skyChunk.GLSL) && skyChunk.GLSL.includes('uSkyCfg.w > 2.5 ? n0 - skyNoise('), 'cut 6: high keeps the 4th tap, the rest read the slope');
  // Cut 7: cirrus on high only.
  const G0 = globalThis.AYLMER;
  for (const [q, want] of [['low', 0], ['med', 0], ['high', 1]]) {
    globalThis.AYLMER = { G: { quality: q } };
    const st = sky.skyState(mk(TIME_OF_DAY.day), 100, [0, 0, 0], null);
    ok((st.cfg[2] > 0 ? 1 : 0) === want && st.cfg[3] === { low: 1, med: 2, high: 3 }[q], `cut 7: ${q} draws ${st.cfg[3]} octaves, cirrus ${st.cfg[2] > 0 ? 'on' : 'off'}`);
  }
  if (G0 === undefined) delete globalThis.AYLMER; else globalThis.AYLMER = G0;
  // Reflections in linear light, fog with no per-pixel decode.
  const refl = await import('../src/core/shaders/reflect.js');
  ok(/vec3 reflSky\(highp vec3 R\) \{ return skyDirColor\(R\); \}/.test(refl.REFLECT_GLSL), 'reflSky follows skyDirColor');
  ok(/bool lin = linearDraw\(\);/.test(skyChunk.GLSL) && skyChunk.GLSL.includes('uSkyHiLin'), 'skyDirColor returns linear light on a linear draw');
  ok(skyChunk.GLSL.includes('pow(s0, 10.0) * 0.16'), 'skyDirColor with sky2 off is reflSky\'s old formula');
  ok(!fogChunk.GLSL.includes('srgbToLinear(hor)') && !fogChunk.GLSL.includes('normalize(uLightDir)'), 'fog: no per-pixel decode, no normalize');
  const { fs } = shaders.assemble();
  ok(fs.includes('col += gReflRad * mulL;'), 'lake and wet reflection radiance added after the light');
  calls.length = 0; sky.skyOpts(mk(TIME_OF_DAY.day));
  for (const n of ['uSkyL', 'uSkyFold0', 'uSkyFold1', 'uSkyGlowK', 'uSkyGlowKLin', 'uSkyLoLin', 'uSkyHiLin', 'uSkyHLin']) ok(calls.some(([m]) => m === n), `skyOpts sends ${n}`);
}

console.log('no allocation');
{
  const env = JSON.parse(JSON.stringify(TIME_OF_DAY.day));
  const quiet = { ...fake, uniform() { return this; } };
  sky.buildSky(quiet);
  for (let i = 0; i < 2000; i++) sky.skyOpts(env);
  const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < 100000; i++) sky.skyOpts(env);
  const grew = process.memoryUsage().heapUsed - h0;
  ok(grew < 512 * 1024, `100k skyOpts grow the heap by ${(grew / 1024).toFixed(0)} KB`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
