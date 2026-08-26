// WebGL2 renderer: one shader, vertex-coloured lambert + hemispheric ambient + exp2 fog.
// Deliberately tiny — a MacBook Air's integrated GPU should never break a sweat.
import { m4, extractFrustum, aabbInFrustum } from './math.js';
import { STRIDE } from './mesh.js';

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec3 aCol;
layout(location=3) in vec2 aUV;
uniform mat4 uVP, uModel;
uniform vec3 uEye;
uniform float uTime, uWater;
out vec3 vNor; out vec3 vCol; out float vDist; out vec2 vUV; out vec3 vRel;
void main(){
  vUV = aUV;
  vec3 p = aPos;
  // Water draws (opts.water) get a shallow swell. It is one-sided — the surface
  // only ever rises off its baked height — so the river can never sink under the
  // grass it is supposed to sit a couple of centimetres above.
  if (uWater > 0.5) {
    float s = sin(p.x * 0.11 + uTime * 0.9) * sin(p.z * 0.083 - uTime * 0.7);
    p.y += 0.045 * (0.5 + 0.5 * s);
  }
  vec4 wp = uModel * vec4(p,1.0);
  vNor = mat3(uModel) * aNor;
  vCol = aCol;
  gl_Position = uVP * wp;
  vRel = wp.xyz - uEye;
  vDist = length(vRel);
}`;

const FS = `#version 300 es
precision highp float;   // must match the vertex shader: shared uniforms may not differ in precision (ANGLE link error)
in vec3 vNor; in vec3 vCol; in float vDist; in vec2 vUV; in highp vec3 vRel;
uniform vec3 uLightDir, uSun, uSky, uGround, uFogColor, uColorMul, uSkyLo, uSkyHi, uEye;
uniform float uFogDensity, uAlpha, uUnlit, uUseTex, uSkyMode;
uniform highp float uTime, uWater;
uniform sampler2D uTex;
out vec4 outColor;
void main(){
  if (uSkyMode > 0.5) {
    // Sky dome (see game/sky.js): vCol.r is 0 at the horizon and 1 at the zenith.
    // No lighting, no fog; the sun is a small disc plus a wide soft glow.
    highp vec3 dir = normalize(vRel);
    highp float s = max(dot(dir, uLightDir), 0.0);
    vec3 skyCol = mix(uSkyLo, uSkyHi, vCol.r);
    skyCol += uSun * (pow(s, 1500.0) * 1.1 + pow(s, 10.0) * 0.16);
    outColor = vec4(skyCol, 1.0);
    return;
  }
  vec3 n = normalize(vNor);
  float d = max(dot(n, uLightDir), 0.0);
  vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5);
  vec4 tx = texture(uTex, vUV);
  vec3 base = mix(vCol, tx.rgb, uUseTex);
  if (uUseTex > 0.5 && tx.a < 0.35) discard;
  if (uWater > 0.5) {
    // Two crossed ripple trains at different speeds: enough to break the flat
    // slab of river without a normal map or a second pass.
    highp vec3 wp = vRel + uEye;
    float r1 = sin(wp.x * 0.21 + uTime * 1.25) * sin(wp.z * 0.17 - uTime * 1.0);
    float r2 = sin(wp.x * 0.052 + wp.z * 0.061 - uTime * 0.42);
    base += vec3(0.035, 0.055, 0.075) * r1 + vec3(0.02, 0.03, 0.045) * r2;
  }
  vec3 lit = base * uColorMul * (amb + uSun * d);
  vec3 col = mix(lit, base * uColorMul, uUnlit);
  float f = exp(-pow(vDist * uFogDensity, 2.0));
  col = mix(uFogColor, col, clamp(f, 0.0, 1.0));
  outColor = vec4(col, uAlpha);
}`;

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

    const vs = this._shader(gl.VERTEX_SHADER, VS);
    const fs = this._shader(gl.FRAGMENT_SHADER, FS);
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    this.prog = p;
    gl.useProgram(p);
    this.u = {};
    for (const n of ['uVP', 'uModel', 'uEye', 'uLightDir', 'uSun', 'uSky', 'uGround',
      'uFogColor', 'uFogDensity', 'uAlpha', 'uUnlit', 'uColorMul', 'uUseTex', 'uTex',
      'uSkyLo', 'uSkyHi', 'uSkyMode', 'uTime', 'uWater']) {
      this.u[n] = gl.getUniformLocation(p, n);
    }
    gl.uniform1i(this.u.uTex, 0);
    gl.uniform1f(this.u.uSkyMode, 0);
    gl.uniform1f(this.u.uWater, 0);
    this._clock = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.time = 0;

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
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.v), gl.STATIC_DRAW);
    const bs = STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, bs, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, bs, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, bs, 24);
    if (builder.uv.length) {
      const ub = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, ub);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.uv), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(3);
    }
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(builder.i), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return {
      vao, count: builder.i.length,
      min: builder.min.slice(), max: builder.max.slice(),
    };
  }

  setEnvironment(env) { this.env = env; }

  begin(camPos, camYaw, camPitch, fov) {
    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const e = this.env;
    gl.clearColor(e.fog[0], e.fog[1], e.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    m4.perspective(this.proj, fov, this.aspect, 0.4, 9000);
    m4.compose(this.camWorld, camPos[0], camPos[1], camPos[2], camYaw, camPitch, 0);
    m4.invertRigid(this.view, this.camWorld);
    m4.mul(this.vp, this.proj, this.view);
    extractFrustum(this.planes, this.vp);
    this.eye = camPos;

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uVP, false, this.vp);
    gl.uniform3fv(this.u.uEye, camPos);
    gl.uniform3fv(this.u.uLightDir, e.lightDir);
    gl.uniform3fv(this.u.uSun, e.sun);
    gl.uniform3fv(this.u.uSky, e.sky);
    gl.uniform3fv(this.u.uGround, e.ground);
    gl.uniform3fv(this.u.uFogColor, e.fog);
    gl.uniform1f(this.u.uFogDensity, e.fogDensity);
    // Wall-clock seconds since the renderer was made — drives the water swell.
    this.time = ((typeof performance !== 'undefined' ? performance.now() : Date.now())
      - this._clock) / 1000;
    gl.uniform1f(this.u.uTime, this.time);
    this.stats.draws = 0; this.stats.tris = 0;
    this.transparent.length = 0;
    this._alpha = -1; this._unlit = -1; this._mul = null; this._tex = null; this._fm = -1;
    this._sky = -1; this._water = -1;
  }

  // Upload an image as an RGBA texture (mipmapped, clamped).
  texture(image) {
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
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    return t;
  }

  visible(mesh) { return aabbInFrustum(this.planes, mesh.min, mesh.max); }

  // opts: { alpha, unlit, colorMul, tex, fogMul, water,
  //         sky, skyLo, skyHi }
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
    const water = (opts && opts.water) ? 1 : 0;
    if (water !== this._water) { gl.uniform1f(this.u.uWater, water); this._water = water; }
    const sky = (opts && opts.sky) ? 1 : 0;
    if (sky !== this._sky) { gl.uniform1f(this.u.uSkyMode, sky); this._sky = sky; }
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
    if (!this.transparent.length) return;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    for (const [mesh, model, opts] of this.transparent) this._draw(mesh, model, opts);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}

const WHITE = new Float32Array([1, 1, 1]);
export { WHITE };
