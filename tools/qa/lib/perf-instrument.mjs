// Serialized functions run inside the page. Keep them dependency-free for CDP.
export function resourceInstrumentation() {
  if (window.__qaResources) return;
  const counts = {}, installed = [];
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const p = C.prototype;
    for (const type of ['Buffer', 'Texture', 'Renderbuffer', 'Framebuffer', 'Program', 'Shader', 'Query', 'VertexArray', 'Sampler', 'TransformFeedback']) {
      const create = 'create' + type, del = 'delete' + type;
      if (!Object.hasOwn(p, create) || !Object.hasOwn(p, del)) continue;
      const make = p[create], destroy = p[del], live = new WeakSet();
      const c = counts[type] ||= { created: 0, deleted: 0, unbalanced: 0 };
      p[create] = function (...args) { const out = make.apply(this, args); if (out) { live.add(out); c.created++; c.unbalanced++; } return out; };
      p[del] = function (o) { const out = destroy.call(this, o); if (o && live.has(o)) { live.delete(o); c.deleted++; c.unbalanced--; } return out; };
      installed.push(create);
    }
  }
  // Counts describe explicit create/delete balance, not driver allocations or
  // resources implicitly reclaimed by GC. WeakSets do not retain GL objects.
  window.__qaResources = { counts, installed, note: 'explicit create minus delete; implicit GC/driver reclamation is not observable' };
}
export const RESOURCE_SCRIPT = `(${resourceInstrumentation.toString()})()`;

// The renderer owns a four-query ring. Drain it before taking the same GL target.
// Kept separate from installTiming so the asynchronous drain finishes before any
// external sample starts, including the query-free control.
export async function suspendNativeTiming() {
  const r = window.AYLMER.G.renderer, gl = r.gl, Q = window.__qa ||= {};
  if (Q.nativeTiming?.suspended) throw new Error('native timing already suspended');
  const timer = r._timer;
  const state = Q.nativeTiming = { supported: !!timer, suspended: false, drained: 0, restored: false };
  state.restore = () => {
    if (state.restored) return;
    if (timer) r._timer = timer;
    state.suspended = false; state.restored = true;
  };
  if (!timer) { state.suspended = true; return { supported: false, drained: 0 }; }
  r._timer = null;
  try {
    if (!Array.isArray(r._q)) throw new Error('unknown native timer ring');
    if (r._qActive) {
      const expected = r._q[(r._qHead + r._qCount) % r._q.length];
      if (gl.getQuery(timer.TIME_ELAPSED_EXT, gl.CURRENT_QUERY) !== expected) throw new Error('native active query does not own the elapsed target');
      gl.endQuery(timer.TIME_ELAPSED_EXT); r._qActive = false; r._qCount++;
    }
    const deadline = performance.now() + 5000;
    gl.flush();
    while (r._qCount) {
      const q = r._q[r._qHead];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
        if (performance.now() >= deadline) throw new Error('native timer queries did not drain');
        await new Promise((resolve) => setTimeout(resolve, 10)); continue;
      }
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) r.gpuMs = ns / 1e6;
      r._qHead = (r._qHead + 1) % r._q.length; r._qCount--; state.drained++;
    }
    if (gl.getQuery(timer.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) throw new Error('another elapsed query is active');
    state.suspended = true;
    return { supported: true, drained: state.drained };
  } catch (e) { state.restore(); throw e; }
}
export const SUSPEND_NATIVE_SCRIPT = `(${suspendNativeTiming.toString()})()`;

export function installTiming({ timer = true, maxPending = 128 } = {}) {
  const G = window.AYLMER.G, r = G.renderer, gl = r.gl;
  const Q = window.__qa ||= {};
  if (Q.perf) throw new Error('timing already installed');
  if (r._timer) throw new Error('native timing must be suspended before external timing');
  const ext = timer ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  const P = Q.perf = { enabled: timer, ext: !!ext, on: false, target: Infinity, pend: [], last: 0,
    query: { created: 0, deleted: 0, pending: 0, peakPending: 0, resetDeleted: 0, disjointDeleted: 0, capSkipped: 0, createFailed: 0 }, glErrors: [] };
  let serial = 0;
  const closed = new Map();
  const newBucket = (carry = false) => ({ id: serial++, n: 0, interval: [], cpu: [], gpu: [], gpuCpu: [], tris: [], draws: [], pending: 0,
    disjoint: 0, carry, openedAt: performance.now(), closedAt: null, queryStart: { ...P.query } });
  let current = newBucket();
  for (const key of ['n', 'interval', 'cpu', 'gpu', 'gpuCpu', 'tris', 'draws', 'disjoint', 'queryStart']) {
    Object.defineProperty(P, key, { get: () => current[key], set: (value) => { current[key] = value; } });
  }
  const checkGl = (where) => {
    for (let i = 0; i < 32; i++) {
      const code = gl.getError(); if (code === gl.NO_ERROR) return;
      P.glErrors.push({ where, code });
    }
  };
  checkGl('install');
  const begin = r.begin, end = r.end;
  const remove = (q, why) => { gl.deleteQuery(q); P.query.deleted++; if (why) P.query[why]++; };
  const discard = (why) => {
    if (P.q) { gl.endQuery(ext.TIME_ELAPSED_EXT); remove(P.q, why); P.q = null; }
    for (const e of P.pend) { remove(e.q, why); e.bucket.pending--; if (why === 'disjointDeleted') e.bucket.disjoint++; }
    P.pend.length = 0; P.query.pending = 0;
  };
  const drain = () => {
    if (!ext || !P.pend.length) return;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) { discard('disjointDeleted'); return; }
    while (P.pend.length && gl.getQueryParameter(P.pend[0].q, gl.QUERY_RESULT_AVAILABLE)) {
      const e = P.pend.shift(), ms = gl.getQueryParameter(e.q, gl.QUERY_RESULT) / 1e6;
      remove(e.q); e.bucket.gpu.push(ms); e.bucket.gpuCpu.push(ms + e.cpu); e.bucket.pending--;
    }
    P.query.pending = P.pend.length;
  };
  r.begin = function (...args) {
    const now = performance.now(); P.t0 = null;
    if (P.on && P.n < P.target) {
      if (P.last !== 0) P.interval.push(now - P.last);
      P.last = now; P.t0 = now; P.frameBucket = current;
      if (ext && P.pend.length < maxPending) {
        const q = gl.createQuery();
        if (q) { P.query.created++; gl.beginQuery(ext.TIME_ELAPSED_EXT, q); P.q = q; }
        else P.query.createFailed++;
      } else if (ext) P.query.capSkipped++;
    }
    return begin.apply(this, args);
  };
  r.end = function (...args) {
    const out = end.apply(this, args);
    if (P.t0 !== null) {
      const cpu = performance.now() - P.t0;
      const b = P.frameBucket;
      if (P.q) { gl.endQuery(ext.TIME_ELAPSED_EXT); P.pend.push({ q: P.q, cpu, bucket: b }); b.pending++; P.q = null; }
      b.cpu.push(cpu); b.tris.push(r.stats.tris); b.draws.push(r.stats.draws); b.n++;
      P.query.pending = P.pend.length; P.query.peakPending = Math.max(P.query.peakPending, P.pend.length);
      P.t0 = null;
      if (P.n >= P.target) { P.on = false; current.closedAt = performance.now(); }
    }
    drain(); return out;
  };
  P.reset = (target = Infinity) => {
    P.on = false; discard('resetDeleted');
    closed.clear(); current = newBucket(); P.last = 0; P.target = target; P.on = true;
  };
  P.stop = () => { P.on = false; current.closedAt ??= performance.now(); drain(); checkGl('stop'); return P.pend.length; };
  const collect = (b) => ({ n: b.n, interval: b.interval, cpu: b.cpu, gpu: b.gpu, gpuCpu: b.gpuCpu, tris: b.tris, draws: b.draws,
    ext: P.ext, disjoint: b.disjoint, query: { ...P.query }, queryStart: b.queryStart, windowPending: b.pending,
    expectedIntervals: Math.max(0, b.n - (b.carry ? 0 : 1)), sampledSeconds: ((b.closedAt ?? performance.now()) - b.openedAt) / 1000,
    openedAt: b.openedAt, closedAt: b.closedAt, capped: b.n >= P.target, gpuBytes: r.gpuBytes,
    heapApi: performance.memory?.usedJSHeapSize ?? null, resources: window.__qaResources, contextLost: gl.isContextLost(), glErrors: P.glErrors.slice(),
    nativeTiming: Q.nativeTiming ? { supported: Q.nativeTiming.supported, suspended: Q.nativeTiming.suspended, drained: Q.nativeTiming.drained } : null });
  // Switch arrays without stopping rAF sampling. Delayed GPU results retain
  // their originating bucket; the interval crossing the boundary goes to the
  // next bucket. CDP collection and checkpoint stalls therefore remain visible.
  P.rotate = (keepRunning = true) => {
    if (P.t0 != null) throw new Error('cannot rotate during a render');
    const b = current; b.closedAt ??= performance.now(); closed.set(b.id, b);
    if (keepRunning) { current = newBucket(P.last !== 0); current.openedAt = b.closedAt; P.on = true; } else P.on = false;
    return { id: b.id, openedAt: b.openedAt, closedAt: b.closedAt };
  };
  P.takeWindow = (id) => {
    drain(); checkGl('window');
    const b = closed.get(id); if (!b) throw new Error('unknown timing window ' + id);
    if (b.pending) return { ready: false, pending: b.pending };
    const timing = collect(b); closed.delete(id); return { ready: true, timing };
  };
  P.releaseSamples = () => {
    if (P.on || P.pend.length || P.q) throw new Error('stop and drain before releasing samples');
    current = newBucket(); closed.clear(); P.frameBucket = null; P.last = 0;
    return { empty: P.n === 0 };
  };
  P.dispose = () => {
    P.on = false; discard('resetDeleted'); checkGl('dispose');
    r.begin = begin; r.end = end; Q.nativeTiming?.restore();
    return { glErrors: P.glErrors.slice(), nativeRestored: Q.nativeTiming?.restored ?? null };
  };
  P.collect = () => { checkGl('collect'); return collect(current); };
  return { timer, extension: !!ext };
}
export const timingScript = (opts) => `(${installTiming.toString()})(${JSON.stringify(opts)})`;

export const preserveTrafficScript = (script) => `(async () => {
  const traffic = window.AYLMER.G.traffic, cars = traffic?.cars.slice();
  try { return await ${script}; }
  finally { if (traffic && cars) traffic.cars.splice(0, traffic.cars.length, ...cars); }
})()`;

export const SET_TIER = (tier) => `(async () => {
  const A = window.AYLMER, G = A.G;
  const { presetSettings } = await import('/src/game/options.js');
  A.settings(presetSettings(G.settings, ${JSON.stringify(tier)}));
  // Live options do not recreate the traffic fleet. Match a new game's tier
  // population before warmup, including the constructor's cyclists and buses.
  const { Traffic } = await import('/src/game/traffic.js');
  G.traffic = new Traffic(G.q.traffic);
  G.traffic.signals = G.signals; G.traffic.phys = G.phys;
  window.__qa.expectedTraffic = G.traffic.cars.length;
  return { quality: G.quality, scale: G.settings.renderScale, trafficBase: G.q.traffic, trafficTotal: G.traffic.cars.length };
})()`;
export const PLACE = (pose, env, settle = 120) => `(async () => {
  const A = window.AYLMER, G = A.G, Q = window.__qa, W = G.world, p = ${JSON.stringify(pose)}, env = ${JSON.stringify(env)};
  const tick = () => new Promise((r) => setTimeout(r, 0)), CAM = { chase: 0, close: 1, far: 2, hood: 3 };
  Q.perf.on = false; Q.noDraw(false); Q.setEnv(env);
  try {
    let car;
    if (p.kind === 'eye') { const rd = W.nearestRoad(p.x, p.z); await A.teleport(rd.x, rd.z, 0); car = { x: rd.x, z: rd.z }; G.cam = 0; Q.camera(null); }
    else { await A.teleport(p.x, p.z, p.yaw); car = p; G.cam = CAM[p.camera] ?? 0; Q.camera(null); }
    G.mode = 'drive'; G.veh.vx = G.veh.vz = G.veh.speed = 0;
    if (W.sectors) await W.sectors.update(car.x, car.z);
    Q.noDraw(true);
    const every = p.kind === 'eye' ? 3 : 1;
    for (let i = 0; i < ${settle}; i++) { A.step(1 / 60); if (i % every === 0) A.render(); if (i % 40 === 0) await tick(); }
    Q.setEnv(env);
    if (p.kind === 'eye') { const gy = G.phys?.groundY ? G.phys.groundY(p.x, p.z) : 0; Q.camera({ x: p.x, y: gy + p.eye, z: p.z, yaw: p.yaw, pitch: p.pitch, fov: p.fov }); }
  } finally { Q.noDraw(false); }
  return 'placed';
})()`;
export const snapshotScript = (withTiming = true) => `(() => {
  const G = window.AYLMER.G, W = G.world, entries = performance.getEntriesByType('resource');
  return { timing: ${withTiming ? 'window.__qa.perf.collect()' : 'undefined'}, mode: G.mode, cinemaActive: !!window.AYLMER.cinema?.active,
    quality: G.quality, traffic: { actual: G.traffic?.cars.length ?? null, expected: window.__qa.expectedTraffic ?? null, base: G.q.traffic },
    rendererGpuBytes: G.renderer.gpuBytes,
    world: { chunks: W.chunks.length, resident: W.stats.resident, drawnChunks: W.stats.chunks, sectors: W.sectors?.loaded() ?? null },
    resources: { entries: entries.length, encodedBytes: entries.reduce((s, e) => s + (e.encodedBodySize || 0), 0), transferBytes: entries.reduce((s, e) => s + (e.transferSize || 0), 0) },
    domNodes: document.getElementsByTagName('*').length, position: { x: G.veh.x, z: G.veh.z } };
})()`;
export const SNAPSHOT = snapshotScript();
