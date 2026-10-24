// WebGL2 renderer: one program, vertex-coloured lambert + hemispheric ambient + exp2 fog.
// Deliberately tiny: a MacBook Air's integrated GPU should never break a sweat.
// The GLSL lives in src/core/shaders/ (one chunk per concern, assembled into
// that one program by shaders/index.js); this file owns the GL state.
import { m4, extractFrustum, aabbInFrustum } from './math.js';
import { STRIDE } from './mesh.js';
import { assemble, MATERIALS, MATERIAL_ALIASES } from './shaders/index.js';
import { gradeLight } from './shaders/light.js';

export { gradeLight, MATERIALS };

// Unknown uniform or material names throw while developing (localhost, a file
// URL, ?dev, or Node) and warn once in a deployed build.
const DEV = (() => {
  try {
    if (typeof location === 'undefined') return true;
    if (/[?&]dev\b/.test(location.search || '')) return true;
    const h = location.hostname || '';
    return location.protocol === 'file:' || h === '' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
  } catch { return true; }
})();
const warned = new Set();
function complain(msg) {
  if (DEV) throw new Error(msg);
  if (!warned.has(msg)) { warned.add(msg); console.warn(msg); }
}
const MAT_WORLD = MATERIALS.world, MAT_SKY = MATERIALS.sky, MAT_WATER = MATERIALS.water;

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: true, alpha: false, depth: true,
      powerPreference: 'default', desynchronized: true,
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.canvas = canvas;
    this.gl = gl;
    this.scale = 1;
    this.maxDpr = 1.5;
    // Bytes handed to the GPU by upload() and not yet given back by free().
    // The JS heap is visible in DevTools; this is the half of the memory bill
    // that is not, and Safari counts both when it decides to kill the tab.
    this.gpuBytes = 0;

    // One program, assembled from the chunks in shaders/ (see shaders/index.js).
    const src = assemble();
    this.shaderSource = { vs: src.vs, fs: src.fs };
    const vs = this._shader(gl.VERTEX_SHADER, src.vs);
    const fs = this._shader(gl.FRAGMENT_SHADER, src.fs);
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    this.prog = p;
    gl.useProgram(p);
    // The uniform registry: every chunk's UNIFORMS, by name. this.u keeps the
    // locations (null for a uniform the compiler optimised out, which WebGL
    // accepts and ignores).
    this.uniforms = src.uniforms;
    this.u = {};
    for (const n of Object.keys(src.uniforms)) {
      const loc = gl.getUniformLocation(p, n);
      this.u[n] = loc === null && src.uniforms[n].count ? gl.getUniformLocation(p, n + '[0]') : loc;
    }
    for (const [n, spec] of Object.entries(src.uniforms)) {
      if (spec.value !== undefined) this._setUniform(n, spec, spec.value);
    }
    gl.uniform1i(this.u.uMaterial, MAT_WORLD);
    // The second sampler always has something bound, so a face that asks for
    // it before any ground atlas exists reads white (texel x vertex colour =
    // vertex colour) instead of undefined black.
    this._white = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // GPU time of the last finished frame, ms, from EXT_disjoint_timer_query_webgl2
    // (begin() to end()), or null when the extension is missing or nothing has
    // come back yet. Results arrive a frame or more late, from a ring of queries.
    this.gpuMs = null;
    this._timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this._q = this._timer ? [gl.createQuery(), gl.createQuery(), gl.createQuery(), gl.createQuery()] : null;
    this._qHead = 0;     // oldest query still in flight
    this._qCount = 0;    // queries in flight
    this._qActive = false;
    this._clock = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.time = 0;
    // Default for meshes with no per-vertex rect: sample the UV as-is.
    gl.vertexAttrib4f(4, 0, 0, 0, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.vp = m4.create();
    this.proj = m4.create();
    this.view = m4.create();
    this.camWorld = m4.create();
    this.planes = new Float32Array(24);
    this.eye = [0, 0, 0];
    this.transparent = [];
    this.stats = { draws: 0, tris: 0 };
    this.resize();
  }

  _shader(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
    }
    return s;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr) * this.scale;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.aspect = w / h;
  }

  upload(builder) {
    const gl = this.gl;
    if (builder.finish) builder.finish();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bufs = [];
    const vb = gl.createBuffer(); bufs.push(vb);
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.v), gl.STATIC_DRAW);
    const bs = STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, bs, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, bs, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, bs, 24);
    if (builder.uv.length) {
      const ub = gl.createBuffer(); bufs.push(ub);
      gl.bindBuffer(gl.ARRAY_BUFFER, ub);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.uv), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(3);
    }
    // Per-vertex atlas sub-rect (materials.js). 16 bytes a vertex, and only on
    // meshes that actually tile a material — everything else leaves attribute 4
    // disabled and reads the constant (0,0,0,0) set in the constructor.
    if (builder.rect && builder.rect.length) {
      const rb = gl.createBuffer(); bufs.push(rb);
      gl.bindBuffer(gl.ARRAY_BUFFER, rb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.rect), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(4);
    }
    const ib = gl.createBuffer(); bufs.push(ib);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(builder.i), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const bytes = (builder.v.length + builder.uv.length + (builder.rect ? builder.rect.length : 0)
      + builder.i.length) * 4;
    this.gpuBytes += bytes;
    return {
      vao, ibo: ib, count: builder.i.length, bytes, bufs,
      min: builder.min.slice(), max: builder.max.slice(),
    };
  }

  // Give a mesh's buffers back. Deleting the VAO alone frees nothing — the
  // buffers outlive it — so upload() keeps every handle it made in `bufs`.
  // A freed mesh draws nothing (count 0) rather than crashing if a stale
  // reference to it survives somewhere.
  free(mesh) {
    if (!mesh || !mesh.vao) return;
    const gl = this.gl;
    for (const b of mesh.bufs || []) gl.deleteBuffer(b);
    gl.deleteVertexArray(mesh.vao);
    this.gpuBytes -= mesh.bytes || 0;
    mesh.vao = null; mesh.ibo = null; mesh.bufs = null; mesh.count = 0;
  }

  // ------------------------------------------------------------ dynamic meshes
  // A mesh whose geometry is rebuilt every frame (or often): particles, wires
  // that sag with the wind, a decal that follows the sun. uploadDynamic()
  // allocates GPU buffers and CPU staging arrays for at most `maxVerts`
  // vertices once; updateDynamic() copies a MeshBuilder's contents into them
  // and sends only what is used, with no allocation at all, so it can run every
  // frame. The result draws with r.draw() like any mesh and is given back with
  // r.free().
  //   opts.maxIndices: index capacity (default maxVerts * 3)
  //   opts.uv / opts.rect: false to leave out that stream (attribute 3 / 4 then
  //     read their constants: uv (0,0), rect (0,0,0,0)). Both default to true.
  uploadDynamic(maxVerts, opts = {}) {
    const gl = this.gl;
    const maxIndices = opts.maxIndices || maxVerts * 3;
    const withUV = opts.uv !== false, withRect = opts.rect !== false;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bufs = [];
    const vb = gl.createBuffer(); bufs.push(vb);
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, maxVerts * STRIDE * 4, gl.DYNAMIC_DRAW);
    const bs = STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, bs, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, bs, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, bs, 24);
    let ub = null, rb = null;
    if (withUV) {
      ub = gl.createBuffer(); bufs.push(ub);
      gl.bindBuffer(gl.ARRAY_BUFFER, ub);
      gl.bufferData(gl.ARRAY_BUFFER, maxVerts * 2 * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 0, 0);
    } else gl.disableVertexAttribArray(3);
    if (withRect) {
      rb = gl.createBuffer(); bufs.push(rb);
      gl.bindBuffer(gl.ARRAY_BUFFER, rb);
      gl.bufferData(gl.ARRAY_BUFFER, maxVerts * 4 * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
    } else gl.disableVertexAttribArray(4);
    const ib = gl.createBuffer(); bufs.push(ib);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, maxIndices * 4, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    const bytes = (maxVerts * (STRIDE + (withUV ? 2 : 0) + (withRect ? 4 : 0)) + maxIndices) * 4;
    this.gpuBytes += bytes;
    return {
      vao, ibo: ib, count: 0, bytes, bufs, min: [0, 0, 0], max: [0, 0, 0],
      dynamic: { maxVerts, maxIndices, vbo: vb, ubo: ub, rbo: rb, verts: 0,
        v: new Float32Array(maxVerts * STRIDE),
        uv: withUV ? new Float32Array(maxVerts * 2) : null,
        rect: withRect ? new Float32Array(maxVerts * 4) : null,
        i: new Uint32Array(maxIndices) },
    };
  }

  // Replace a dynamic mesh's geometry with `builder`'s (a MeshBuilder, or any
  // { v, i, uv?, rect?, min?, max? } in the same layout). Throws if it does not
  // fit. The builder is only read: reuse it frame to frame by setting its
  // arrays' length to 0, which keeps their capacity.
  updateDynamic(mesh, builder) {
    const d = mesh && mesh.dynamic;
    if (!d || !mesh.vao) throw new Error('Renderer.updateDynamic: not a live dynamic mesh');
    const gl = this.gl;
    const nv = (builder.v.length / STRIDE) | 0, ni = builder.i.length;
    if (nv > d.maxVerts || ni > d.maxIndices) {
      throw new RangeError(`Renderer.updateDynamic: ${nv} verts / ${ni} indices over capacity ${d.maxVerts} / ${d.maxIndices}`);
    }
    gl.bindVertexArray(null);
    d.v.set(builder.v);
    gl.bindBuffer(gl.ARRAY_BUFFER, d.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.v, 0, nv * STRIDE);
    if (d.uv) this._dynStream(d.ubo, d.uv, builder.uv, nv * 2);
    if (d.rect) this._dynStream(d.rbo, d.rect, builder.rect, nv * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    d.i.set(builder.i);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, d.i, 0, ni);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    d.verts = nv;
    mesh.count = ni;
    const mn = builder.min, mx = builder.max;
    for (let k = 0; k < 3; k++) {
      mesh.min[k] = mn ? mn[k] : -1e9;
      mesh.max[k] = mx ? mx[k] : 1e9;
    }
    return mesh;
  }

  // One optional stream of a dynamic mesh: what the builder has, zero-filled up
  // to `n` (a builder only fills uv / rect once something textured arrives).
  _dynStream(buf, stage, src, n) {
    const gl = this.gl;
    const have = src ? Math.min(src.length, n) : 0;
    if (have) {
      if (src.length <= n) stage.set(src);
      else for (let k = 0; k < have; k++) stage[k] = src[k];
    }
    if (have < n) stage.fill(0, have, n);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, stage, 0, n);
  }

  // Collapse `count` indices starting at `start` to degenerate triangles, so a
  // baked-in piece of a chunk mesh can be made to disappear without rebuilding
  // the chunk. One bufferSubData; nothing costs anything per frame afterwards.
  // (world.js uses it when you take out a hydro pole.)
  blankIndices(mesh, start, count) {
    if (!mesh || !mesh.ibo || count <= 0) return;
    const gl = this.gl;
    if (!this._blank || this._blank.length < count) this._blank = new Uint32Array(count);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, start * 4, this._blank, 0, count);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  setEnvironment(env) { this.env = env; }

  // opts.near: the near plane, default 0.4 m. Every camera in the game looks at
  //   the world from outside the car, where 0.4 is free; the driver's seat has
  //   a door card at 45 cm and a wheel rim at 50, so it asks for less.
  // opts.world: the camera's world matrix, already built. The driver's view
  //   composes its eye onto the car's own model matrix rather than describing it
  //   with Euler angles, because that is the only way it inherits the body's
  //   pitch and roll exactly — including their signs — instead of approximately.
  //   `camPos` is still the eye position (the shader needs it) and camYaw /
  //   camPitch are ignored.
  begin(camPos, camYaw, camPitch, fov, opts) {
    const gl = this.gl;
    if (this._timer) this._timerFrame();
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const e = this.env;
    gl.clearColor(e.fog[0], e.fog[1], e.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    m4.perspective(this.proj, fov, this.aspect, (opts && opts.near) || 0.4, 9000);
    if (opts && opts.world) this.camWorld.set(opts.world);
    else m4.compose(this.camWorld, camPos[0], camPos[1], camPos[2], camYaw, camPitch, 0);
    m4.invertRigid(this.view, this.camWorld);
    m4.mul(this.vp, this.proj, this.view);
    extractFrustum(this.planes, this.vp);
    this.eye = camPos;

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uVP, false, this.vp);
    gl.uniform3fv(this.u.uEye, camPos);
    gl.uniform3fv(this.u.uLightDir, e.lightDir);
    // The world is lit by a GRADED copy of the env (see gradeLight, shaders/light.js); the
    // dome's sun disc keeps the raw sun colour, so the sky looks as it did.
    const g = gradeLight(e, this._grade || (this._grade = {
      sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3) }));
    gl.uniform3fv(this.u.uSun, g.sun);
    gl.uniform3fv(this.u.uSunSky, e.sun);
    gl.uniform3fv(this.u.uSky, g.sky);
    gl.uniform3fv(this.u.uGround, g.ground);
    gl.uniform3fv(this.u.uFogColor, e.fog);
    gl.uniform1f(this.u.uFogDensity, e.fogDensity);
    // Wall-clock seconds since the renderer was made — drives the water swell.
    this.time = ((typeof performance !== 'undefined' ? performance.now() : Date.now())
      - this._clock) / 1000;
    gl.uniform1f(this.u.uTime, this.time);
    this.stats.draws = 0; this.stats.tris = 0;
    this.transparent.length = 0;
    this._resetCache();
  }

  // Forget what the last draw left in the per-draw uniforms, so the next draw
  // sets every one of them again.
  _resetCache() {
    this._alpha = -1; this._unlit = -1; this._mul = null; this._tex = null; this._fm = -1;
    this._mat = -1; this._tex2 = null;
  }

  // ---------------------------------------------------------- uniform registry
  // r.uniform(name, value): set any chunk uniform (shaders/*.js UNIFORMS) by
  // name. Numbers for float / int / sampler2D, arrays or typed arrays for
  // vectors, matrices and uniform arrays. The program is the only one, so the
  // value sticks until it is set again. Unknown names throw while developing.
  // A managed uniform (one the renderer sets itself) can be written too, but
  // begin() and draw() may overwrite it.
  uniform(name, value) {
    const spec = this.uniforms[name];
    if (!spec) { complain(`Renderer.uniform: no uniform called ${name} in any shader chunk`); return this; }
    this.gl.useProgram(this.prog);
    this._setUniform(name, spec, value);
    if (spec.managed) this._resetCache();
    return this;
  }

  _setUniform(name, spec, v) {
    const gl = this.gl, loc = this.u[name];
    if (loc === null || loc === undefined) return;   // optimised out: nothing reads it
    switch (spec.base) {
      case 'float': if (spec.count) gl.uniform1fv(loc, v); else gl.uniform1f(loc, v); break;
      case 'int': case 'sampler2D': if (spec.count) gl.uniform1iv(loc, v); else gl.uniform1i(loc, v); break;
      case 'vec2': gl.uniform2fv(loc, v); break;
      case 'vec3': gl.uniform3fv(loc, v); break;
      case 'vec4': gl.uniform4fv(loc, v); break;
      case 'mat3': gl.uniformMatrix3fv(loc, false, v); break;
      case 'mat4': gl.uniformMatrix4fv(loc, false, v); break;
      default: complain(`Renderer.uniform: ${name} has unsupported type ${spec.type}`);
    }
  }

  // ---------------------------------------------------------------- GPU timer
  // One TIME_ELAPSED query spans begin() to end(). Here, at the next begin(),
  // the finished ones are read back (oldest first) and a new one starts. A
  // disjoint event (the GPU was interrupted) throws that frame's numbers away.
  _timerFrame() {
    const gl = this.gl, T = this._timer, q = this._q;
    if (this._qActive) { gl.endQuery(T.TIME_ELAPSED_EXT); this._qActive = false; this._qCount++; }
    const disjoint = gl.getParameter(T.GPU_DISJOINT_EXT);
    while (this._qCount) {
      const h = q[this._qHead];
      if (!gl.getQueryParameter(h, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(h, gl.QUERY_RESULT);
      if (!disjoint) this.gpuMs = ns / 1e6;
      this._qHead = (this._qHead + 1) % q.length; this._qCount--;
    }
    if (this._qCount < q.length) {
      gl.beginQuery(T.TIME_ELAPSED_EXT, q[(this._qHead + this._qCount) % q.length]);
      this._qActive = true;
    }
  }

  // Upload an image as an RGBA texture (mipmapped, clamped).
  // opts.aniso: anisotropy to ask for, clamped to what the driver offers
  // (default 4; the material atlas asks for the maximum — house walls are the
  // one thing you see at a grazing angle all game long).
  // opts.maxLevel: cap the mip chain (atlas cells stop being independent once a
  // texel averages more than the bleed ring, see tools/make_atlas.py).
  texture(image, opts = {}) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (opts.maxLevel !== undefined) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, opts.maxLevel);
    }
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) {
      const want = opts.aniso || 4;
      const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
      gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(want, max));
    }
    return t;
  }

  visible(mesh) { return aabbInFrustum(this.planes, mesh.min, mesh.max); }

  // opts: { alpha, unlit, colorMul, tex, tex2, fogMul, material, water,
  //         sky, skyLo, skyHi }
  //         material: 'world' (default), 'sky', 'water', 'car', 'decal', 'wire',
  //         'sprite' or 'particle' (shaders/common.js MATERIALS), sent to the
  //         shader as uMaterial. water: true is material 'water' and sky: true
  //         is material 'sky'; an explicit material wins.
  //         tex2: the second sampler (unit 1), read by tiled faces whose rect
  //         u0 is offset by 2 (shaders/material.js). Default: a white texel.
  //         water: this draw is a water surface — the vertices get a shallow
  //         upward swell and the colour a pair of scrolling ripples, both keyed
  //         off uTime (seconds since the renderer was created).
  //         sky: draw as the sky dome — fragment colour is
  //         mix(skyLo, skyHi, vertex.r) plus a sun disc, no lighting/fog, depth
  //         writes and back-face culling off for that draw (so draw it FIRST).
  //         skyLo/skyHi default to env.fog / env.sky.
  draw(mesh, model, opts) {
    if (opts && opts.alpha !== undefined && opts.alpha < 1) {
      this.transparent.push([mesh, new Float32Array(model), opts]);
      return;
    }
    this._draw(mesh, model, opts);
  }

  _draw(mesh, model, opts) {
    const gl = this.gl;
    const alpha = (opts && opts.alpha !== undefined) ? opts.alpha : 1;
    const unlit = (opts && opts.unlit) ? 1 : 0;
    const mul = (opts && opts.colorMul) || WHITE;
    const tex = (opts && opts.tex) || null;
    // Far scenery gets thinner fog so the hills stay a silhouette, not haze.
    const fm = (opts && opts.fogMul) || 1;
    if (fm !== this._fm) { gl.uniform1f(this.u.uFogDensity, this.env.fogDensity * fm); this._fm = fm; }
    if (tex !== this._tex) {
      gl.uniform1f(this.u.uUseTex, tex ? 1 : 0);
      if (tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); }
      this._tex = tex;
    }
    if (alpha !== this._alpha) { gl.uniform1f(this.u.uAlpha, alpha); this._alpha = alpha; }
    if (unlit !== this._unlit) { gl.uniform1f(this.u.uUnlit, unlit); this._unlit = unlit; }
    if (mul !== this._mul) { gl.uniform3fv(this.u.uColorMul, mul); this._mul = mul; }
    const tex2 = (opts && opts.tex2) || this._white;
    if (tex2 !== this._tex2) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex2);
      gl.activeTexture(gl.TEXTURE0);   // texture() uploads through unit 0
      this._tex2 = tex2;
    }
    let mat = MAT_WORLD;
    if (opts) {
      if (opts.material !== undefined) {
        mat = typeof opts.material === 'number' ? opts.material
          : MATERIALS[MATERIAL_ALIASES[opts.material] || opts.material];
        if (mat === undefined) { complain(`Renderer.draw: unknown material ${opts.material}`); mat = MAT_WORLD; }
      } else if (opts.sky) mat = MAT_SKY;
      else if (opts.water) mat = MAT_WATER;
    }
    if (mat !== this._mat) { gl.uniform1i(this.u.uMaterial, mat); this._mat = mat; }
    const sky = mat === MAT_SKY;
    if (sky) {
      gl.uniform3fv(this.u.uSkyLo, opts.skyLo || this.env.fog);
      gl.uniform3fv(this.u.uSkyHi, opts.skyHi || this.env.sky);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
    }
    gl.uniformMatrix4fv(this.u.uModel, false, model);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    this.stats.draws++; this.stats.tris += mesh.count / 3;
    if (sky) {
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
    }
  }

  end() {
    const gl = this.gl;
    if (this.transparent.length) {
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      for (const [mesh, model, opts] of this.transparent) this._draw(mesh, model, opts);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    if (this._qActive) {
      gl.endQuery(this._timer.TIME_ELAPSED_EXT);
      this._qActive = false; this._qCount++;
    }
  }
}

const WHITE = new Float32Array([1, 1, 1]);
export { WHITE };
