// core/gl.js and core/shaders/ with a fake WebGL2 context (V0-01): the one
// program is assembled from every chunk, the uniform registry, material
// routing, the second sampler, dynamic meshes with no per-frame allocation,
// and the GPU timer. The real compile is checked by booting the game.
//
//   node tools/smoke_shaders.mjs
let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
  if (c) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  - ' + extra : '')); }
};
const throws = (f) => { try { f(); return false; } catch { return true; } };

// ------------------------------------------------------------ fake WebGL2
function fakeGL({ timer = false } = {}) {
  const calls = [];
  const C = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, ARRAY_BUFFER: 10, ELEMENT_ARRAY_BUFFER: 11,
    STATIC_DRAW: 20, DYNAMIC_DRAW: 21, FLOAT: 30, TRIANGLES: 40, UNSIGNED_INT: 41, UNSIGNED_BYTE: 42,
    TEXTURE_2D: 50, TEXTURE0: 100, TEXTURE1: 101, RGBA: 60, DEPTH_TEST: 70, CULL_FACE: 71, BACK: 72,
    BLEND: 73, SRC_ALPHA: 74, ONE_MINUS_SRC_ALPHA: 75, COLOR_BUFFER_BIT: 1, DEPTH_BUFFER_BIT: 2,
    QUERY_RESULT_AVAILABLE: 80, QUERY_RESULT: 81, COMPILE_STATUS: 90, LINK_STATUS: 91,
    TEXTURE_MIN_FILTER: 1, TEXTURE_MAG_FILTER: 2, TEXTURE_WRAP_S: 3, TEXTURE_WRAP_T: 4,
    LINEAR: 5, LINEAR_MIPMAP_LINEAR: 6, CLAMP_TO_EDGE: 7, TEXTURE_MAX_LEVEL: 8, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 9,
  };
  const state = { active: C.TEXTURE0, units: {}, queries: [], drawn: [] };
  const ext = timer ? { TIME_ELAPSED_EXT: 500, GPU_DISJOINT_EXT: 501 } : null;
  let id = 0;
  const gl = new Proxy(C, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'drawingBufferWidth') return 64;
      if (k === 'drawingBufferHeight') return 64;
      if (k === '_calls') return calls;
      if (k === '_state') return state;
      return (...a) => {
        calls.push([k, a]);
        switch (k) {
          case 'getShaderParameter': case 'getProgramParameter': return true;
          case 'getUniformLocation': return { name: a[1] };
          case 'getExtension': return a[0] === 'EXT_disjoint_timer_query_webgl2' ? ext : null;
          case 'getParameter': return a[0] === 501 ? false : 0;
          case 'createQuery': { const q = { id: ++id, done: false }; state.queries.push(q); return q; }
          case 'endQuery': for (const q of state.queries) if (q.running) { q.running = false; q.done = true; } return;
          case 'beginQuery': a[1].running = true; a[1].done = false; return;
          case 'getQueryParameter': return a[1] === C.QUERY_RESULT_AVAILABLE ? a[0].done : 2.5e6;
          case 'activeTexture': state.active = a[0]; return;
          case 'bindTexture': state.units[state.active] = a[1]; return;
          case 'drawElements': state.drawn.push(a[1]); return;
          default: return k.startsWith('create') ? { id: ++id, kind: k } : undefined;
        }
      };
    },
  });
  return gl;
}
globalThis.window = { devicePixelRatio: 1 };
const canvasFor = (gl) => ({ clientWidth: 64, clientHeight: 64, width: 0, height: 0, getContext: () => gl });

const shaders = await import('../src/core/shaders/index.js');
const { Renderer, gradeLight, MATERIALS } = await import('../src/core/gl.js');
const { MeshBuilder, STRIDE } = await import('../src/core/mesh.js');
const ENV = { fog: [0.6, 0.7, 0.8], sky: [0.4, 0.6, 0.9], ground: [0.3, 0.3, 0.25], sun: [1, 0.95, 0.9],
  lightDir: [0.3, 0.9, 0.3], fogDensity: 0.002 };
const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

console.log('the one program, from every chunk');
{
  const want = ['common', 'light', 'tonemap', 'fog', 'sky', 'water', 'material', 'glass', 'car', 'decal',
    'wire', 'corona', 'dynlights', 'wet', 'post', 'digicam', 'shadow'];
  for (const n of want) {
    const m = await import(`../src/core/shaders/${n}.js`);
    ok(typeof m.GLSL === 'string' && typeof m.VERT === 'string' && m.UNIFORMS && typeof m.UNIFORMS === 'object',
      `${n}.js exports GLSL, VERT and UNIFORMS`);
    ok(shaders.CHUNKS[n] === m, `${n}.js is assembled`);
  }
  ok(Object.keys(shaders.CHUNKS).length === want.length, 'no chunk outside the list');
  const { vs, fs, uniforms } = shaders.assemble();
  const bal = (s) => [...s].reduce((n, ch) => n + (ch === '{') - (ch === '}'), 0) === 0
    && [...s].reduce((n, ch) => n + (ch === '(') - (ch === ')'), 0) === 0;
  ok(vs.startsWith('#version 300 es') && fs.startsWith('#version 300 es'), 'both stages are GLSL ES 3.00');
  ok(bal(vs) && bal(fs), 'braces and parentheses balance');
  ok((vs.match(/void main\(\)/g) || []).length === 1 && (fs.match(/void main\(\)/g) || []).length === 1, 'one main per stage');
  for (const n of Object.keys(uniforms)) {
    const re = new RegExp(`uniform [\\w ]*\\b${n}\\b`, 'g');
    ok((fs.match(re) || []).length === 1 && (vs.match(re) || []).length === 1, `uniform ${n} declared once per stage`);
  }
  for (const h of ['sunLambert', 'ambientLight', 'tonemap', 'applyFog', 'skyColor', 'waterAlbedo', 'materialTexel',
    'materialAlbedo', 'glassShade', 'carShade', 'decalShade', 'wireShade', 'spriteShade', 'dynLight', 'wetAlbedo',
    'sunShadow', 'postColor', 'digicam']) {
    ok(new RegExp(`\\b${h}\\(`).test(fs.split('void main()')[0]) && new RegExp(`\\b${h}\\(`).test(fs.split('void main()')[1]),
      `fragment hook ${h} defined and called`);
  }
  for (const h of ['waterVertex', 'decalVertex', 'wireVertex', 'spriteVertex']) {
    ok(new RegExp(`\\b${h}\\(`).test(vs.split('void main()')[1]), `vertex hook ${h} called`);
  }
  ok(/vRect\.x >= 2\.0/.test(fs) && /textureGrad\(uTex2/.test(fs), 'a face with rect u0 >= 2 samples uTex2');
  ok(!/uniform float uSkyMode|uWater/.test(fs + vs), 'the old uSkyMode / uWater floats are gone');
  ok(Object.entries(MATERIALS).every(([k, v]) => fs.includes(`#define MAT_${k.toUpperCase()} ${v}`)), 'material codes are GLSL defines');
  const dup = { ...shaders.CHUNKS };
  ok(throws(() => { shaders.CHUNKS.glass.UNIFORMS.uFogColor = 'vec3'; try { shaders.uniformTable(); } finally { delete shaders.CHUNKS.glass.UNIFORMS.uFogColor; } }),
    'a uniform declared by two chunks is an error');
  void dup;
}

console.log('gradeLight moved, unchanged');
{
  const light = await import('../src/core/shaders/light.js');
  ok(light.gradeLight === gradeLight, 'gl.js re-exports shaders/light.js gradeLight');
  const out = { sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3) };
  gradeLight(ENV, out);
  ok(out.sun.every(Number.isFinite) && out.sky.every(Number.isFinite), 'grade returns finite light');
}

console.log('uniform registry and material routing');
{
  const gl = fakeGL();
  const r = new Renderer(canvasFor(gl));
  r.setEnvironment(ENV);
  ok(r.gpuMs === null, 'gpuMs is null with no timer extension');
  const n0 = gl._calls.length;
  r.uniform('uFogColor', [1, 0, 0]);
  const c = gl._calls.slice(n0).find((x) => x[0] === 'uniform3fv');
  ok(c && c[1][0].name === 'uFogColor' && c[1][1][0] === 1, 'r.uniform sets a chunk uniform by name');
  ok(throws(() => r.uniform('uNoSuchThing', 1)), 'an unknown uniform name throws in dev');
  const matOf = (opts) => {
    const k = gl._calls.length;
    r.begin([0, 0, 0], 0, 0, 1);
    r.draw({ vao: {}, count: 3, min: [0, 0, 0], max: [1, 1, 1] }, I, opts);
    const u = gl._calls.slice(k).filter((x) => x[0] === 'uniform1i' && x[1][0] && x[1][0].name === 'uMaterial');
    return u.length ? u[u.length - 1][1][1] : null;
  };
  ok(matOf(undefined) === 0, 'no opts: world (0)');
  ok(matOf({ sky: true }) === MATERIALS.sky, 'opts.sky still routes to sky');
  ok(matOf({ water: true }) === MATERIALS.water, 'opts.water still routes to water');
  for (const m of ['world', 'sky', 'water', 'car', 'decal', 'wire', 'sprite', 'particle']) {
    ok(matOf({ material: m }) === MATERIALS[m], `opts.material '${m}' -> uMaterial ${MATERIALS[m]}`);
  }
  ok(matOf({ material: 'car', water: true }) === MATERIALS.car, 'an explicit material wins over opts.water');
  ok(throws(() => matOf({ material: 'chrome' })), 'an unknown material throws in dev');
  ok(matOf({ material: 'building' }) === MATERIALS.world, "the prototype's 'building' role draws as world");
  // sky draws turn depth writes and culling off and back on
  const k = gl._calls.length;
  r.begin([0, 0, 0], 0, 0, 1);
  r.draw({ vao: {}, count: 3, min: [0, 0, 0], max: [1, 1, 1] }, I, { material: 'sky' });
  const seq = gl._calls.slice(k).map((x) => x[0] + (x[0] === 'depthMask' ? ':' + x[1][0] : ''));
  ok(seq.includes('depthMask:false') && seq.includes('depthMask:true') && seq.includes('disable') && seq.includes('enable'),
    'material sky keeps the dome GL state');

  console.log('second sampler');
  const t2 = { id: 'groundAtlas' }, t1 = { id: 'atlas' };
  r.begin([0, 0, 0], 0, 0, 1);
  r.draw({ vao: {}, count: 3, min: [0, 0, 0], max: [1, 1, 1] }, I, { tex: t1, tex2: t2 });
  ok(gl._state.units[gl.TEXTURE1] === t2 && gl._state.units[gl.TEXTURE0] === t1, 'opts.tex2 binds unit 1, opts.tex unit 0');
  ok(gl._state.active === gl.TEXTURE0, 'the active unit is back on 0 after a draw');
  r.draw({ vao: {}, count: 3, min: [0, 0, 0], max: [1, 1, 1] }, I, {});
  ok(gl._state.units[gl.TEXTURE1] === r._white, 'no tex2: unit 1 holds the white texel');
  const samp = gl._calls.filter((x) => x[0] === 'uniform1i' && x[1][0] && /^uTex2?$/.test(x[1][0].name)).map((x) => x[1][0].name + '=' + x[1][1]);
  ok(samp.includes('uTex=0') && samp.includes('uTex2=1'), 'uTex on unit 0, uTex2 on unit 1');
}

console.log('dynamic meshes');
{
  const gl = fakeGL();
  const r = new Renderer(canvasFor(gl));
  r.setEnvironment(ENV);
  const bytes0 = r.gpuBytes;
  const dm = r.uploadDynamic(1000);
  ok(dm.count === 0 && r.gpuBytes > bytes0, 'uploadDynamic allocates once and draws nothing yet');
  const b = new MeshBuilder();
  const fill = (k) => {
    b.v.length = 0; b.i.length = 0; b.uv.length = 0; b.rect.length = 0;
    b.min[0] = b.min[1] = b.min[2] = 1e9; b.max[0] = b.max[1] = b.max[2] = -1e9;
    for (let q = 0; q < 10 + (k % 5); q++) b.box(q * 2 + k * 0.01, 0, 0, 1, 1, 1, [1, 0.5, 0.25]);
  };
  fill(0);
  r.updateDynamic(dm, b);
  ok(dm.count === b.i.length && dm.dynamic.verts === b.v.length / STRIDE, 'updateDynamic sets the count from the builder');
  ok(dm.min[0] === b.min[0] && dm.max[0] === b.max[0], 'bounds follow the builder');
  const subs = gl._calls.filter((x) => x[0] === 'bufferSubData').slice(-4);
  ok(subs.length === 4 && subs[0][1][2] === dm.dynamic.v && subs[0][1][4] === b.v.length, 'only the used vertices are sent');
  // warm up, then count every typed array made during 1000 updates
  for (let k = 0; k < 20; k++) { fill(k); r.begin([0, 0, 0], 0, 0, 1); r.updateDynamic(dm, b); r.draw(dm, I); r.end(); }
  const made = { n: 0 };
  const real = {};
  for (const T of ['Float32Array', 'Uint32Array', 'Uint8Array', 'Uint16Array', 'Int32Array', 'Float64Array', 'ArrayBuffer']) {
    real[T] = globalThis[T];
    globalThis[T] = new Proxy(real[T], { construct(t, a, nt) { made.n++; if (process.env.TRACE) console.log(new Error(t.name).stack.split("\n").slice(1,4).join(" | ")); return Reflect.construct(t, a, nt); } });
  }
  const created0 = gl._calls.filter((x) => /^create|^bufferData$/.test(x[0])).length;
  try {
    for (let k = 0; k < 1000; k++) {
      fill(k);
      r.begin([0, 0, 0], 0, 0, 1);
      r.updateDynamic(dm, b);
      r.draw(dm, I);
      r.end();
    }
  } finally { for (const T of Object.keys(real)) globalThis[T] = real[T]; }
  const created1 = gl._calls.filter((x) => /^create|^bufferData$/.test(x[0])).length;
  ok(made.n === 0, 'no typed array or buffer allocated per frame', `${made.n} made`);
  ok(created1 === created0, 'no GL object or buffer storage created per frame');
  ok(gl._state.drawn[gl._state.drawn.length - 1] === dm.count, 'the dynamic mesh draws its current count');
  const big = new MeshBuilder();
  for (let q = 0; q < 200; q++) big.box(q, 0, 0, 1, 1, 1, [1, 1, 1]);
  ok(throws(() => r.updateDynamic(dm, big)), 'over capacity throws instead of drawing half');
  const lean = r.uploadDynamic(64, { uv: false, rect: false });
  ok(lean.dynamic.uv === null && lean.dynamic.rect === null && lean.bytes === (64 * STRIDE + 64 * 3) * 4, 'uv and rect streams are optional');
  const g0 = r.gpuBytes;
  r.free(dm);
  ok(r.gpuBytes === g0 - dm.bytes && dm.count === 0, 'free() gives a dynamic mesh back');
}

console.log('GPU timer');
{
  const gl = fakeGL({ timer: true });
  const r = new Renderer(canvasFor(gl));
  r.setEnvironment(ENV);
  ok(r.gpuMs === null, 'null before any frame comes back');
  for (let k = 0; k < 3; k++) { r.begin([0, 0, 0], 0, 0, 1); r.end(); }
  ok(r.gpuMs === 2.5, 'gpuMs reads the last finished frame in ms', String(r.gpuMs));
  const q0 = gl._calls.filter((x) => x[0] === 'createQuery').length;
  for (let k = 0; k < 50; k++) { r.begin([0, 0, 0], 0, 0, 1); r.end(); }
  ok(gl._calls.filter((x) => x[0] === 'createQuery').length === q0, 'queries come from a fixed ring');
  const bq = gl._calls.filter((x) => x[0] === 'beginQuery').length, eq = gl._calls.filter((x) => x[0] === 'endQuery').length;
  ok(bq === eq, 'every beginQuery is ended');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
