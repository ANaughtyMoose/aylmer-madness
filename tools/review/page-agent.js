// In-page half of the review harness (tools/review/harness.mjs injects this).
//
// It never edits the game: it reads window.AYLMER, presses keys by dispatching
// KeyboardEvents on window (the game's own listeners pick them up exactly as
// they would a keyboard), and records what a player would see: every text that
// appears in an overlay, frame times, and the beats of a mission. The Node side
// polls window.__RV.drain() and takes the screenshots.
//
// A task is one of:
//   { type: 'mission', id, stageTimeout, assist }   play a job with a learner bot
//   { type: 'drive', to: {x,z}, maxKmh, timeout }    drive somewhere on the GPS route
//   { type: 'floor', seconds, steer }                full throttle, a crash or a speed run
//   { type: 'idle', seconds }                        hands off (cards, radio, traffic)
(() => {
  if (window.__RV) return;
  const A = window.AYLMER;
  const RV = window.__RV = {
    events: [], texts: [], frames: [], task: null, t0: performance.now(),
    held: new Set(), lastTap: {}, assists: 0,
  };
  const now = () => +((performance.now() - RV.t0) / 1000).toFixed(2);
  const camera = { active: false, seen: 0, snapshots: {}, captureAt: -Infinity, renderer: null };
  const cameraNumbers = () => {
    const S = A.camClipStats; if (!S) return null;
    const out = {};
    for (const k of Object.keys(S)) if (typeof S[k] === 'number' || S[k] === null) out[k] = S[k];
    out.last = { ...S.last }; return out;
  };
  RV.cameraReset = () => {
    A.camClipStats?.reset(); camera.active = true; camera.seen = 0; camera.snapshots = {}; camera.captureAt = -Infinity;
    return !!A.camClipStats;
  };
  RV.cameraReport = () => {
    camera.active = false;
    return { stats: cameraNumbers(), sourceGeometry: A.G.world?.cameraStats || null, snapshots: camera.snapshots };
  };
  function watchCamera() {
    const r = A.G.renderer; if (!r || camera.renderer === r) return;
    camera.renderer = r;
    const end = r.end;
    r.end = function (...args) {
      const result = end.apply(this, args), S = A.camClipStats;
      if (!camera.active || !S || S.frames === camera.seen) return result;
      camera.seen = S.frames;
      const L = S.last;
      const kind = !L.known || !L.rayClear ? 'ray' : !L.eyeClear ? 'eye' : !L.framed ? 'framing' : null;
      if (!kind) return result;
      const prior = camera.snapshots[kind], duration = S.blockedSeconds;
      if (prior && (performance.now() - camera.captureAt < 1000 || duration <= prior.duration)) return result;
      const v = A.G.veh;
      const snapshot = { t: now(), frame: S.frames, kind, duration, final: { ...L },
        car: { x: v.x, y: v.bodyY, z: v.z, yaw: v.yaw }, eye: [...r.eye], viewProjection: [...r.vp] };
      // Capture inside renderer.end while this exact frame is still in the
      // drawing buffer. A later CDP screenshot could show the next clear view.
      try { snapshot.image = (r.canvas || r.gl.canvas).toDataURL('image/jpeg', 0.8); }
      catch (e) { snapshot.captureError = e.message; }
      camera.snapshots[kind] = snapshot; camera.captureAt = performance.now();
      return result;
    };
  }
  const ev = (kind, o = {}) => { const e = { t: now(), kind, ...o }; RV.events.push(e);
    if (['stage', 'task-start', 'task-end', 'assist'].includes(kind)) window.__rawTiming?.mark(`${kind}:${o.id || ''}:${o.idx ?? ''}`);
    return e; };
  RV.ev = ev;
  RV.drain = () => { const out = RV.events; RV.events = []; return out; };

  // ---------------------------------------------------------------- keys
  const send = (type, code) => {
    const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code;
    window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
  };
  RV.hold = (code, on) => {
    if (on && !RV.held.has(code)) { RV.held.add(code); send('keydown', code); }
    else if (!on && RV.held.has(code)) { RV.held.delete(code); send('keyup', code); }
  };
  RV.release = () => { for (const k of [...RV.held]) RV.hold(k, false); };
  RV.tap = (code, gapMs = 350) => {
    const t = performance.now();
    if (t - (RV.lastTap[code] || 0) < gapMs) return false;
    RV.lastTap[code] = t;
    const was = RV.held.has(code);
    if (was) RV.hold(code, false);
    send('keydown', code); setTimeout(() => send('keyup', code), 60);
    return true;
  };

  // ---------------------------------------------------------------- what the player reads
  // Every overlay text that changes, deduped. This is the dialogue transcript the
  // reviewers read (friend bubbles, toasts, prompts, objective, cards).
  const seen = new Map();
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  const label = (el) => {
    const base = el.id || (el.className && String(el.className).split(' ')[0]) || el.tagName.toLowerCase();
    if (el.id || !el.parentElement) return base;
    const sib = [...el.parentElement.children].filter((c) => c.className === el.className);
    return sib.length > 1 ? base + '#' + sib.indexOf(el) : base;   // the two toast slots are two speakers, not one
  };
  // Ticking gauges and parents that only repeat their children.
  const SKIP = new Set(['speedo', 'speedtext', 'kmh', 'unit', 'carname', 'airboard', 'reactstats', 'fuel', 'towbtns', 'btnReset', 'btnTow',
    'legend', 'legendhead', 'legendrows', 'topleft', 'cinematic', 'cinema-copy', 'cinema-eyebrow', 'cinema-note', 'toast', 'envelope', 'envamt', 'timer', 'money', 'hud', 'menuinner', 'menu']);
  function scanTexts() {
    const nodes = document.querySelectorAll('body > *:not(canvas):not(script):not(style)');
    for (const root of nodes) {
      if (root.id === 'gl' || root.id === 'autopilot') continue;
      for (const el of [root, ...root.querySelectorAll('[id], [class*="toast"], [class*="bubble"], [class*="prompt"], h1, p')]) {
        if (el.children.length > 6) continue;
        const txt = (el.innerText || '').trim();
        if (!txt || txt.length > 600) continue;
        const k = label(el);
        if (SKIP.has(k)) continue;
        if (seen.get(k) === txt) continue;
        if (!visible(el)) continue;
        seen.set(k, txt);
        // Skip the speedometer and other ticking numbers.
        if (/^[\d\s.,:$%km/h-]+$/i.test(txt)) continue;
        RV.texts.push({ t: now(), el: k, text: txt });
      }
    }
  }
  setInterval(scanTexts, 400);

  // ---------------------------------------------------------------- frames
  let lastF = performance.now();
  // [w8-courseproof] Task clocks (a task's `seconds`, `timeout`, the stage watchdog,
  // the steering timers) count GAME seconds: G.time's advance since the last frame,
  // warp sub-steps included. On SwiftShader the game runs at about 0.1x real time,
  // and a wall clock timed every task out before the game got there (RESULTS.md).
  // RV.clock = 'wall' puts the old behaviour back. A menu, a card or a pause stops
  // G.time, so a task waits through them; the Node side keeps a wall-clock cap.
  RV.clock = 'game';
  let lastG = null;
  RV.gameSecs = 0;
  function gameDt(wallS) {
    const t = A && A.G && Number.isFinite(A.G.time) ? A.G.time : null;
    if (t == null) { lastG = null; return RV.clock === 'wall' ? wallS : 0; }
    const d = lastG == null ? 0 : t - lastG;
    lastG = t;
    const g = d > 0 && d < 5 ? d : 0;   // a new game resets G.time: never a negative step
    RV.gameSecs += g;
    return RV.clock === 'wall' ? wallS : g;
  }
  function rec(t) {
    watchCamera();
    const dt = t - lastF; lastF = t;
    if (Number.isFinite(dt) && dt > 0) RV.frames.push(dt);
    if (RV.frames.length > 20000) RV.frames.splice(0, 10000);
    control(gameDt(dt / 1000));
    requestAnimationFrame(rec);
  }
  requestAnimationFrame(rec);
  RV.frameStats = (reset = true) => {
    const f = RV.frames.slice().sort((a, b) => a - b);
    if (reset) RV.frames = [];
    if (!f.length) return null;
    const q = (p) => +f[Math.min(f.length - 1, Math.floor(p * f.length))].toFixed(1);
    const over33Count = f.filter((x) => x > 33.4).length;
    return { scope: 'rolling play samples, use rawFrames for the full beat', n: f.length, fpsMean: +(1000 / (f.reduce((a, b) => a + b, 0) / f.length)).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), over33Count, over33: over33Count / f.length };
  };

  // Long frames, named (B-13b). The 683 ms stvincent frame in the full pack never
  // came back in a short session, so every frame over 200 ms now says what it was:
  // script (whose function, which file), style and layout, or nothing the page
  // ran (the GPU, the compositor, a screenshot, a collector pause). One console
  // line each, so the pack's console.log carries it; RV.longFrames keeps them.
  RV.longFrames = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration < 200) continue;
        const m = A.G && A.G.mission;
        const row = { t: now(), ms: Math.round(e.duration), blockingMs: Math.round(e.blockingDuration || 0),
          renderAtMs: e.renderStart ? Math.round(e.renderStart - e.startTime) : null,
          styleLayoutAtMs: e.styleAndLayoutStart ? Math.round(e.styleAndLayoutStart - e.startTime) : null,
          scriptMs: Math.round((e.scripts || []).reduce((a, x) => a + x.duration, 0)),
          job: m ? `${m.def.id}:${m.idx}` : null, vehicle: carNow(),
          scripts: (e.scripts || []).slice().sort((a, b) => b.duration - a.duration).slice(0, 3)
            .map((x) => `${Math.round(x.duration)}ms ${x.invokerType || ''} ${x.sourceFunctionName || x.invoker || '?'} ${(x.sourceURL || '').split('/').slice(-2).join('/')}`) };
        RV.longFrames.push(row);
        if (RV.longFrames.length > 200) RV.longFrames.shift();
        console.info('[rv] long frame ' + JSON.stringify(row));
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch { /* no long-animation-frame in this browser */ }

  RV.collisionProvenance = (x, z, radius) => {
    const G = A.G, W = G.world;
    const scalar = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v == null || ['number', 'string', 'boolean'].includes(typeof v)));
    const near = (o) => Math.hypot(o.x - x, o.z - z) <= radius;
    const camera = W.queryCameraBlocks?.(x - radius, -100, z - radius, x + radius, 100, z + radius) || [];
    return { center: { x, z }, radius, mission: G.mission?.def.id, stage: G.mission?.idx,
      car: scalar(G.veh), segments: W.querySegments(x, z, radius).map(scalar),
      poles: W.queryPoles(x, z, radius).map(scalar),
      reactiveProps: (G.reactive?.props?.query(x, z, radius) || []).map(scalar),
      missionProps: (G.props?.list || []).filter(near).map(scalar),
      parked: Object.entries(G.parked || {}).filter(([, p]) => near(p)).map(([id, p]) => ({ id, ...scalar(p) })),
      cameraSources: camera.map((b) => ({ source: b.source, min: b.min, max: b.max })) };
  };

  // ---------------------------------------------------------------- state
  const cardUp = () => {
    const c = document.getElementById('cinematic');
    if (c && !c.classList.contains('hidden') && A.cinema?.active) return 'cinematic';
    const s = document.getElementById('story');
    if (s && !s.classList.contains('hidden') && visible(s)) return 'story';
    return null;
  };
  RV.cardUp = cardUp;
  // The vehicle the player is in right now: the built spec wins over G.carId (B-02).
  const carNow = () => (A.G.veh && A.G.veh.spec && A.G.veh.spec.id) || A.G.carId || '?';
  RV.vehicle = carNow;

  // ---------------------------------------------------------------- audio log (B-02)
  // The pack carries no sound, so the sound is written down: one row a second
  // with the cues the game fired that second, the engine (rpm, firing pitch,
  // load, the mean of what main.js asked audio.engine() for), and the radio's
  // state. Instrumentation only: each audio method is wrapped on the instance and
  // still called exactly as before. Radio rows name the station, never a track,
  // a title or a file (the private library stays private).
  const AU = RV.audio = { rows: [], cues: {}, eng: { n: 0, rpm: 0, load: 0 }, flags: {} };
  const cue = (k) => { AU.cues[k] = (AU.cues[k] || 0) + 1; };
  (() => {
    const au = A.audio; if (!au || au.__rvWrapped) return;
    au.__rvWrapped = true;
    const wrap = (name, test) => {
      const orig = au[name]; if (typeof orig !== 'function') return;
      au[name] = function (...a) { try { const k = test(a); if (k) cue(k); } catch {} return orig.apply(this, a); };
    };
    // Called every frame with a level or a switch: log only a rise, or a switch turning on.
    const edge = (name, on) => (a) => { const v = on(a); const was = AU.flags[name]; AU.flags[name] = v; return v && !was ? name : null; };
    wrap('horn', edge('horn', (a) => !!a[0]));
    wrap('siren', edge('siren', (a) => !!a[0]));
    wrap('skid', edge('skid', (a) => (a[0] || 0) > 0.15));
    wrap('whoosh', edge('whoosh', (a) => (a[0] || 0) > 0.1));
    for (const n of ['blip', 'chime', 'crash', 'honk', 'land', 'misfire', 'heille', 'thud', 'wrench']) wrap(n, (a) => (n === 'thud' && a[0] ? 'thud:' + a[0] : n));
    const eng = au.engine;
    if (typeof eng === 'function') au.engine = function (rpm, load, ...rest) {
      if (Number.isFinite(rpm) && rpm > 0) { AU.eng.n++; AU.eng.rpm += rpm; AU.eng.load += Number.isFinite(load) ? load : 0; }
      return eng.call(this, rpm, load, ...rest);
    };
  })();
  function audioRow() {
    const au = A.audio || {}, G = A.G, e = AU.eng;
    const rpm = e.n ? Math.round(e.rpm / e.n) : 0;
    const cyl = (au.ep && au.ep.cyl) || 4;
    let radio = 'off', music = 'off';
    try {
      const r = A.radio && A.radio.state ? A.radio.state() : null;
      if (r && r.on) { radio = String(r.stationName || '?'); music = r.onBreak ? 'talk' : 'music'; }
      else if (r && r.wantOn) radio = 'blocked';
    } catch {}
    const cues = Object.entries(AU.cues).map(([k, n]) => (n > 1 ? `${k} x${n}` : k));
    // AUD-01: the levels at the sample instant, in dB of gain (bus x voice for the
    // engine, the siren voice alone), and the nearest driving cruiser in metres.
    const db = (g) => (g > 1e-5 ? +(20 * Math.log10(g)).toFixed(1) : null);
    let engDb = null, sirenDb = null, copM = null;
    try { if (au.engBus && au.voice && au.voice.out) engDb = db(au.engBus.gain.value * au.voice.out.gain.value); } catch {}
    try { if (au._siren && au._siren.g) sirenDb = db(au._siren.g.gain.value); } catch {}
    try {
      const us = (G.cops && G.cops.units) || [], v = G.veh;
      for (const u of us) { const d = Math.hypot(u.x - v.x, u.z - v.z); if (copM === null || d < copM) copM = Math.round(d); }
    } catch {}
    AU.rows.push({ t: now(), car: carNow(), kmh: +((G.veh && G.veh.speedKmh) || 0).toFixed(0), rpm, pitchHz: rpm ? Math.round(rpm / 60 * cyl / 2) : 0,
      load: e.n ? +(e.load / e.n).toFixed(2) : 0, ctx: (au.ctx && au.ctx.state) || (au.ok ? '?' : 'none'), cabin: !!au.inCab,
      siren: !!AU.flags.siren, radio, music, cues, engDb, sirenDb, copM });
    AU.cues = {}; AU.eng = { n: 0, rpm: 0, load: 0 };
    if (AU.rows.length > 20000) AU.rows.splice(0, 10000);
  }
  setInterval(audioRow, 1000);
  RV.audioDrain = () => { const out = AU.rows; AU.rows = []; return out; };
  RV.state = () => {
    const G = A.G, v = G.veh || {};
    const m = G.mission;
    return {
      mode: G.mode, car: G.carId, vehicle: carNow(), x: +(v.x || 0).toFixed(1), z: +(v.z || 0).toFixed(1), yaw: +(v.yaw || 0).toFixed(2),
      kmh: +(v.speedKmh || 0).toFixed(1), damage: +(v.damage || 0).toFixed(3), money: G.wallet ? Math.round(G.wallet.value) : null,
      day: G.day, env: G.envKey, fps: Math.round(G.fps || 0), heat: G.cops ? G.cops.heat : null,
      loading: G.world?.sectors?.loading?.() || null, reactiveBuildMs: G.world?.sectors?.lastReactiveMs ?? null,
      mission: m ? { id: m.def.id, idx: m.idx, n: m.stages.length, text: m.stages[m.idx]?.text, timeLeft: m.timeLeft != null ? Math.round(m.timeLeft) : null, target: m.target ? { x: Math.round(m.target.x), z: Math.round(m.target.z), r: m.target.r } : null } : null,
      card: cardUp(), done: [...(G.done || [])],
      prompt: (document.querySelector('#prompt, .prompt, #hudprompt')?.innerText || '').trim().slice(0, 140),
    };
  };

  // ---------------------------------------------------------------- driving
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const D = { route: null, idx: 0, key: '', stuckT: 0, revT: 0, resets: 0, lastX: null, lastZ: null, hbT: 0, hbCool: false, handbrakes: 0 };
  RV.D = D;
  function steerTo(dest, maxKmh, dt, opts = {}) {
    const G = A.G, v = G.veh;
    const key = Math.round(dest.x) + ',' + Math.round(dest.z);
    if (D.lastX != null && Math.hypot(v.x - D.lastX, v.z - D.lastZ) > 150) D.route = null;   // towed or teleported
    D.lastX = v.x; D.lastZ = v.z;
    if (!D.route || D.key !== key) {
      // A cart on the golf course with no GPS line (noRoute): a player drives at
      // the pillar across the grass, so does the bot (s1-timers).
      const st = G.mission && G.mission.stages && G.mission.stages[G.mission.idx];
      const straight = st && st.noRoute && v.spec && v.spec.id === 'cart';
      D.route = (!straight && botRoute(G, v.x, v.z, dest.x, dest.z)) || [[v.x, v.z], [dest.x, dest.z]];
      // S3-BOT: the route runs to the road node nearest the target, which can be
      // past it; the leg back to the target then read as a hairpin and the bot
      // crawled the last 80 m to a race gate at 22 km/h. End where the route
      // passes the target instead.
      D.route = clipEnd(D.route, dest.x, dest.z);
      D.route.push([dest.x, dest.z]);
      D.rest = restLengths(D.route);
      // S3-BOT: the road on past this gate, so the corner just after it sets the speed into it.
      D.tail = opts.next ? clipStart(botRoute(G, dest.x, dest.z, opts.next.x, opts.next.z), dest.x, dest.z) : null;
      // Start from the point nearest the truck, plus one, so a fresh plan never aims behind.
      let ni = 0, nd = 1e18;
      for (let i = 0; i < Math.min(D.route.length, 12); i++) { const dd = (D.route[i][0] - v.x) ** 2 + (D.route[i][1] - v.z) ** 2; if (dd < nd) { nd = dd; ni = i; } }
      D.idx = Math.min(D.route.length - 1, ni + 1); if (D.key !== key) D.best = null; D.key = key;
    }
    const path = D.route;
    const d2 = (p) => (p[0] - v.x) ** 2 + (p[1] - v.z) ** 2;
    while (D.idx < path.length - 1 && d2(path[D.idx]) < 12 * 12) D.idx++;
    // Missed a point in a tight corner? Jump to the nearest one ahead instead of orbiting it.
    {
      let bi = D.idx, bd = d2(path[D.idx]);
      for (let i = D.idx + 1; i < Math.min(path.length, D.idx + 16); i++) { const dd = d2(path[i]); if (dd < bd) { bd = dd; bi = i; } }
      if (bi > D.idx) D.idx = Math.min(path.length - 1, bi + (bd < 20 * 20 ? 1 : 0));
    }
    // Progress watchdog: 12 s without getting 15 m closer means plan again from here.
    // Closer along the route, not as the crow flies (B-13b): the 13 km St. Vincent
    // leg starts by driving north for 200 m while the hospital is east, and the
    // straight-line distance did not shrink, so every 12 s counted as a failed
    // re-plan and four of them teleported a bot that was driving fine.
    const remainNow = Math.hypot(path[D.idx][0] - v.x, path[D.idx][1] - v.z) + (D.rest ? D.rest[D.idx] : 0);
    D.watchT = (D.watchT || 0) + dt;
    if (D.best == null || remainNow < D.best - 15) { D.best = remainNow; D.watchT = 0; }
    if (D.watchT > 12) { D.watchT = 0; D.best = null; D.route = null; D.resets++; return 'replan'; }
    // Way off the line (distance to the current segment, not to its far end): plan again from here.
    {
      const a = path[Math.max(0, D.idx - 1)], b = path[D.idx];
      const ux = b[0] - a[0], uz = b[1] - a[1], L2 = ux * ux + uz * uz || 1;
      const k = Math.max(0, Math.min(1, ((v.x - a[0]) * ux + (v.z - a[1]) * uz) / L2));
      if (Math.hypot(a[0] + ux * k - v.x, a[1] + uz * k - v.z) > 45) D.route = null;
    }
    // Pursuit point (S3-BOT): 7 to 22 m ALONG the route from where the truck is,
    // not the first route vertex 16 m away. After a short corner node that vertex
    // was 80 m down the next street, and the straight line to it cut the corner
    // through a lot into a building (bz_vieux, rue Bancroft at -788, -187).
    const t = alongRoute(path, D.idx, v, Math.max(7, Math.min(22, 5 + (v.speedKmh || 0) / 3.6 * 0.6)));
    const remain = Math.hypot(dest.x - v.x, dest.z - v.z);
    let aim = remain < 25 ? [dest.x, dest.z] : t;
    // Overtaking (S3-BOT): pass a slower car in the lane, like a player, instead
    // of sitting behind it at its speed (racecivic: 70 to 12 km/h on Principale
    // behind traffic while Sayyad went by). Only into a lane that is clear for
    // 70 m and is road; the aim moves sideways by the lane offset.
    const pass = passPlan(G, v, dt);
    if (pass && remain >= 25) { const hx = Math.sin(v.yaw), hz = Math.cos(v.yaw); aim = [aim[0] + hz * pass, aim[1] - hx * pass]; }
    const err = wrap(Math.atan2(aim[0] - v.x, aim[1] - v.z) - v.yaw);
    D.dbg = `${D.idx}/${path.length} aim ${Math.round(aim[0])},${Math.round(aim[1])} err ${err.toFixed(2)} yaw ${v.yaw.toFixed(2)}`;
    const kmh = v.speedKmh || 0;
    // The road is behind (nose-in in a driveway, as a new game opens on « S pour
    // reculer »): back out like a player, the nose swinging toward the route,
    // instead of driving into the house.
    D.backCool = Math.max(0, (D.backCool || 0) - dt);
    // S3-BOT: the road is behind and there is no room (a gate at the end of a
    // dead-end lot, the dep on bz_vieux): a three-point turn. Back up on the
    // opposite lock, then forward on full lock, each until the car stalls or 2.5 s,
    // until the nose is within 45 degrees of the route; at most 14 s.
    if (Math.abs(err) > 2.2 && kmh < 8 && remain > 20 && D.revT <= 0 && !D.turn && D.backCool <= 0) {
      D.turn = { t: 0, phase: 'back', pt: 0 }; D.backCool = 8; D.backouts = (D.backouts || 0) + 1;
    }
    if (D.turn) {
      const U = D.turn; U.t += dt; U.pt += dt;
      if (Math.abs(err) < 0.8 || U.t > 14) D.turn = null;
      else {
        const stalled = U.pt > 0.7 && kmh < 1.5;
        if (U.pt > 2.5 || stalled) { U.phase = U.phase === 'back' ? 'fwd' : 'back'; U.pt = 0; }
        if (U.phase === 'back') { RV.hold('KeyW', false); RV.hold('KeyS', true); RV.hold('KeyA', err < 0); RV.hold('KeyD', err > 0); }
        else { RV.hold('KeyS', false); RV.hold('KeyW', kmh < 9); RV.hold('KeyA', err > 0); RV.hold('KeyD', err < 0); }
        D.stuckT = 0;
        return 'turn';
      }
    }
    if (D.revT > 0) {
      D.revT -= dt;
      RV.hold('KeyW', false); RV.hold('KeyS', true);
      RV.hold('KeyA', err < 0); RV.hold('KeyD', err > 0);
      return 'reverse';
    }
    if (kmh < 3) D.stuckT += dt; else D.stuckT = Math.max(0, D.stuckT - dt);
    if (D.stuckT > 3.5) {
      D.stuckT = 0; D.resets++; D.revT = 1.4;
      // Stuck twice and the game is offering « Remettre sur la route (T, gratis) »: take it, like a player would.
      const offer = document.getElementById('btnReset');
      if (D.resets >= 2 && offer && visible(offer)) { RV.tap('KeyT', 3000); D.route = null; D.revT = 0; RV.freeResets = (RV.freeResets || 0) + 1; ev('free-reset', { at: [Math.round(v.x), Math.round(v.z)] }); }
      return 'stuck';
    }
    // Corner speed: slow down for a big heading error and near the end.
    let cap = maxKmh;
    const ae = Math.abs(err);
    if (ae > 0.35) cap = Math.min(cap, 35);
    if (ae > 0.9) cap = Math.min(cap, 18);
    // A race gate is driven through, not stopped at (S3-BOT): no lift into it.
    if (remain < 60 && !opts.through) cap = Math.min(cap, 30 + remain * 0.6);
    // Look ahead (A-12, S3-BOT): every bend in the road ahead, measured over 15 m so
    // a corner drawn as a run of short segments still reads as one corner, gives a
    // speed the car can hold through it on its own grip, and a braking point from
    // the car's own brakes. The lowest of those is the cap. A corner over 60
    // degrees gets the handbrake, the way a player swings the Ranger.
    const turn = cornerAhead(path, D.idx, v, D.tail);
    if (turn) {
      cap = Math.min(cap, Math.max(turn.cap, 12));
      D.cornerCap = Math.round(turn.cap);
      if (turn.ang > 1.05 && turn.d < 14 && kmh > 24 && D.hbT <= 0 && !D.hbCool) {
        D.hbT = 0.35; D.hbCool = true; D.handbrakes = (D.handbrakes || 0) + 1;
      }
      if (turn.d > 25) D.hbCool = false;
    }
    if (D.hbT > 0) {
      D.hbT -= dt;
      RV.hold('Space', true); RV.hold('KeyW', false); RV.hold('KeyS', false);
      RV.hold('KeyA', err > 0.06); RV.hold('KeyD', err < -0.06);
      if (D.hbT <= 0) RV.hold('Space', false);
      return 'handbrake';
    }
    // Something in the lane ahead: back off rather than shunt it. The look grows
    // with speed (about two seconds of road), and the cap is the speed that still
    // stops short of it, so a car 40 m out at 75 km/h is a lift, not a crash.
    // S3-BOT: in the lane it is in (or passing into), and the car ahead's own
    // speed counts: following a car at 40 km/h is 40 plus the closing speed that
    // still stops short, not a crawl.
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const look = Math.max(14, kmh / 3.6 * 2.2), lane = D.pass || 0;
    for (const c of roadCars(G)) {
      const rx = c.x - v.x, rz = c.z - v.z, along = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx - lane);
      if (!(along > 0 && along < look && side < 3.0)) continue;
      const cv = Math.max(0, (c.speed || 0) * Math.cos(wrap((c.yaw || 0) - v.yaw)));
      // A rival is raced, not queued behind (a4: 18 s at 1 to 11 km/h on Sayyad's
      // bumper): only a nose-to-tail stop, and the pass does the rest.
      if (c.veh && (G.rivals || []).includes(c)) { if (along < 7) cap = Math.min(cap, Math.max(8, cv * 3.6)); continue; }
      cap = Math.min(cap, along < 12 ? Math.max(8, cv * 3.6 - 5) : Math.max(8, (cv + Math.sqrt(2 * 5 * (along - 10))) * 3.6));
    }
    RV.hold('KeyW', kmh < cap - 2);
    RV.hold('KeyS', kmh > cap + 5);
    RV.hold('KeyA', err > 0.06); RV.hold('KeyD', err < -0.06);
    return 'go';
  }
  // Where a polyline passes nearest (x, z): { i (segment start), p (point) }.
  function nearestOn(r, x, z, from, to) {
    let best = null;
    for (let i = Math.max(0, from); i + 1 < Math.min(r.length, to); i++) {
      const a = r[i], b = r[i + 1], ux = b[0] - a[0], uz = b[1] - a[1], L2 = ux * ux + uz * uz;
      const k = L2 > 1e-6 ? Math.max(0, Math.min(1, ((x - a[0]) * ux + (z - a[1]) * uz) / L2)) : 0;
      const p = [a[0] + ux * k, a[1] + uz * k], d = Math.hypot(p[0] - x, p[1] - z);
      if (!best || d < best.d) best = { i, p, d };
    }
    return best;
  }
  // The route cut where it passes the target (its last 6 segments looked at).
  function clipEnd(r, x, z) {
    if (!r || r.length < 3) return r;
    const n = nearestOn(r, x, z, r.length - 7, r.length);
    if (!n || n.d > 15) return r;
    const out = r.slice(0, n.i + 1);
    if (Math.hypot(n.p[0] - out[out.length - 1][0], n.p[1] - out[out.length - 1][1]) > 0.5) out.push(n.p);
    return out;
  }
  // The leg after a gate started where it passes the gate (its first 6 segments looked at).
  function clipStart(r, x, z) {
    if (!r || r.length < 3) return r;
    const n = nearestOn(r, x, z, 0, 7);
    if (!n || n.d > 15) return r;
    return [[x, z], n.p, ...r.slice(n.i + 1)];
  }
  RV.clipEnd = clipEnd; RV.clipStart = clipStart;
  // The point `L` metres along the route from the truck's place on segment idx-1 -> idx.
  // The truck's place is the nearest point on the last few segments, not on
  // idx-1 -> idx: idx steps past any point within 12 m, so in a tight corner it
  // is already on the next street while the truck has not turned yet (a3: the
  // aim went 17 m past the Bancroft corner at -783, -187 and cut it into a wall).
  function alongRoute(path, idx, v, L) {
    let p = [v.x, v.z], from = idx;
    const n = idx > 0 ? nearestOn(path, v.x, v.z, idx - 4, idx + 1) : null;
    if (n) { p = n.p; from = n.i + 1; }
    // Off the line (a pass, a slide): a little further, so it steers back gently.
    L += Math.min(8, Math.hypot(p[0] - v.x, p[1] - v.z));
    for (let i = from; i < path.length; i++) {
      const q = path[i], seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (seg >= L) return [p[0] + (q[0] - p[0]) * L / seg, p[1] + (q[1] - p[1]) * L / seg];
      // A sharp corner (over 55 degrees) is aimed at until the truck is on it:
      // a point past it pulls the line across the inside of the corner, where the
      // building is (a3, Bancroft at -788, -194). Running wide is the safe side.
      const r = path[i + 1];
      if (r && seg > 0.5 && Math.hypot(q[0] - v.x, q[1] - v.z) > 5) {
        const h1 = Math.atan2(q[0] - p[0], q[1] - p[1]), h2 = Math.atan2(r[0] - q[0], r[1] - q[1]);
        if (Math.hypot(r[0] - q[0], r[1] - q[1]) > 2 && Math.abs(wrap(h2 - h1)) > 0.96) return q;
      }
      L -= seg; p = q;
    }
    return path[path.length - 1];
  }
  RV.alongRoute = alongRoute;
  // Everything on the road the bot has to drive round: traffic, and in a race the
  // rivals too (a3 racecivic: side by side with Sayyad at -1 m, then 18 damage in
  // one contact, because the bot never saw his Civic).
  function roadCars(G) {
    const t = (G.traffic && G.traffic.cars) || [], r = G.rivals || [];
    return r.length ? t.concat(r) : t;
  }
  // The lane offset to pass on (m, + is to the right of the heading), or 0.
  // Starts a pass when a car 8 to 45 m ahead in the lane is 2 m/s slower than
  // the truck; picks the side whose lane is road and clear of traffic for 70 m
  // (oncoming cars included); holds it until the car is 8 m behind or 6 s pass.
  const PASS_OFF = 3.4;
  function passPlan(G, v, dt) {
    const cars = roadCars(G), vms = Math.max(0, v.vLong || (v.speedKmh || 0) / 3.6);
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const rel = (c) => { const rx = c.x - v.x, rz = c.z - v.z; return { along: rx * fx + rz * fz, lat: rx * fz - rz * fx }; };
    if (D.pass) {
      D.passT -= dt;
      const c = D.passCar, r = c ? rel(c) : null;
      if (!r || r.along < -8 || D.passT <= 0 || !laneClear(G, v, cars, D.pass, c, 40)) { D.pass = 0; D.passCar = null; }
      return D.pass;
    }
    if (vms < 6) return 0;
    let block = null;
    for (const c of cars) {
      const r = rel(c);
      if (r.along < 8 || r.along > 45 || Math.abs(r.lat) > 2.6) continue;
      const cv = (c.speed || 0) * Math.cos(wrap((c.yaw || 0) - v.yaw));
      if (cv > vms - 2) continue;
      if (!block || r.along < block.along) block = { c, along: r.along, lat: r.lat };
    }
    if (!block) return 0;
    const first = block.lat > 0 ? -PASS_OFF : PASS_OFF;
    for (const off of [first, -first]) {
      if (!laneClear(G, v, cars, off, block.c, 70)) continue;
      D.pass = off; D.passCar = block.c; D.passT = 6; D.passes = (D.passes || 0) + 1;
      return off;
    }
    return 0;
  }
  // Is the lane `off` metres to the side road for 30 m and free of other cars for `ahead` m?
  function laneClear(G, v, cars, off, except, ahead) {
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), W = G.world;
    if (W && W.roadAt) for (const d of [8, 18, 30]) if (!W.roadAt(v.x + fx * d + fz * off, v.z + fz * d - fx * off)) return false;
    for (const c of cars) {
      if (c === except) continue;
      const rx = c.x - v.x, rz = c.z - v.z, along = rx * fx + rz * fz, lat = rx * fz - rz * fx;
      if (along > -6 && along < ahead && Math.abs(lat - off) < 2.4) return false;
    }
    return true;
  }
  // Metres from each route point to the end of the route.
  function restLengths(path) {
    const rest = new Float64Array(path.length);
    for (let i = path.length - 2; i >= 0; i--) rest[i] = rest[i + 1] + Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    return rest;
  }
  RV.restLengths = restLengths;
  // Where an assist puts a lost bot (B-13b): `off` metres back from the target
  // along the road route to it, facing down the route. The old spot was `off`
  // metres from the target on the straight line toward the truck, which from
  // 10 km away is wherever that line lands: a lawn, a lot behind a fence, the
  // inside of the hospital. The bot then sat stuck there until a second and a
  // third teleport put it on the target itself.
  function assistSpot(tx, tz, off) {
    const G = A.G, v = G.veh;
    const r = G.nav && G.nav.route(v.x, v.z, tx, tz);
    if (r && r.length >= 2) {
      const last = r[r.length - 1];
      if (Math.hypot(last[0] - tx, last[1] - tz) > 1) r.push([tx, tz]);
      let left = off;
      for (let i = r.length - 1; i > 0; i--) {
        const a = r[i - 1], b = r[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (seg < 0.5) continue;
        const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
        if (seg >= left) { const k = left / seg; return { x: b[0] + (a[0] - b[0]) * k, z: b[1] + (a[1] - b[1]) * k, yaw, onRoute: true }; }
        left -= seg;
      }
      const a = r[0], b = r[1];
      return { x: a[0], z: a[1], yaw: Math.atan2(b[0] - a[0], b[1] - a[1]), onRoute: true };
    }
    const a = Math.atan2(v.x - tx, v.z - tz);
    return { x: tx + Math.sin(a) * off, z: tz + Math.cos(a) * off, yaw: a + Math.PI, onRoute: false };
  }
  RV.assistSpot = assistSpot;
  // The road ahead (S3-BOT). Resampled every 3 m from where the truck stands on
  // its route segment, through the rest of the route and on into `tail` (the
  // leg after a race gate). For each 15 m window: the heading change, the radius
  // it implies, the speed the car holds on that radius at 62 % of its grip, and
  // the most it can carry from here and still brake down to that at 60 % of its
  // brakes, less a reaction margin. Returns { cap (km/h), ang, d }: the lowest
  // cap, and the sharpest bend with its distance (for the handbrake).
  const STEP_M = 3, WIN = 5;
  function cornerAhead(path, idx, v, tail) {
    const sp = v.spec || {}, aLat = 0.62 * (sp.grip || 0.8) * 9.81, aBrk = 0.6 * (sp.brake || 8);
    const vms = Math.abs(v.vLong || (v.speedKmh || 0) / 3.6);
    const look = Math.max(80, vms * vms / (2 * aBrk) + 50);
    const a = path[Math.max(0, idx - 1)], b = path[idx];
    // Start on the route where the truck is; a truck short of the segment starts
    // from where it stands, so the distances stay distances from the truck.
    let start = [v.x, v.z], before = null;
    if (idx > 0) {
      const ux = b[0] - a[0], uz = b[1] - a[1], L2 = ux * ux + uz * uz;
      const k = L2 > 1 ? ((v.x - a[0]) * ux + (v.z - a[1]) * uz) / L2 : 0;
      if (k > 0) { const kk = Math.min(1, k); start = [a[0] + ux * kk, a[1] + uz * kk]; } else before = a;
    }
    const pts = before ? [start, before] : [start];
    for (let i = idx; i < path.length; i++) pts.push(path[i]);
    if (tail) for (let i = 1; i < tail.length; i++) pts.push(tail[i]);
    // Resample.
    const S = [start];
    let left = STEP_M, total = 0;
    for (let i = 0; i + 1 < pts.length && total < look; i++) {
      const p = pts[i], q = pts[i + 1], seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
      let at = 0;
      while (seg - at >= left && total < look) { at += left; total += left; left = STEP_M; S.push([p[0] + (q[0] - p[0]) * at / seg, p[1] + (q[1] - p[1]) * at / seg]); }
      left -= seg - at; total += seg - at;
    }
    if (S.length < 3) return null;
    const h = [];
    for (let j = 0; j + 1 < S.length; j++) h.push(Math.atan2(S[j + 1][0] - S[j][0], S[j + 1][1] - S[j][1]));
    const margin = 3 + vms * 0.35;
    let cap = Infinity, best = null;
    for (let j = 1; j < h.length; j++) {
      const k = Math.min(h.length - 1, j + WIN - 1);
      const ang = Math.abs(wrap(h[k] - h[j - 1]));
      const d = j * STEP_M;
      if (!best || ang > best.ang + 0.05) best = { ang, d };
      if (ang < 0.05) continue;
      const R = ((k - j + 1) * STEP_M) / ang;
      const want = Math.max(5, Math.sqrt(aLat * R));
      const reach = Math.sqrt(want * want + 2 * aBrk * Math.max(0, d - margin));
      cap = Math.min(cap, reach * 3.6);
    }
    return best ? { cap, ang: best.ang, d: best.d } : null;
  }
  // Every one-way opened (S3-BOT): a player in a hurry drives the wrong way down
  // Bancroft to a checkpoint 100 m away, and the game pays for it (style.js
  // oncoming). Built once, from the game's own Nav over the same MAP; the
  // one-way flags are put back in the same synchronous block.
  let NAV2 = null;
  (async () => {
    try {
      const [{ Nav }, { MAP }] = await Promise.all([import('/src/game/nav.js'), import('/src/game/mapdata.js')]);
      const saved = MAP.roads.map((r) => (Object.prototype.hasOwnProperty.call(r, 'oneway') ? r.oneway : undefined));
      try { for (const r of MAP.roads) if (r.oneway) r.oneway = false; NAV2 = new Nav(); }
      finally { MAP.roads.forEach((r, i) => { if (saved[i] !== undefined) r.oneway = saved[i]; }); }
    } catch (e) { RV.nav2Error = String(e && e.message || e); }
  })();
  const polyLen = (r) => { let L = 0; for (let i = 1; i < r.length; i++) L += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]); return L; };
  // The GPS route, unless the same streets driven against a one-way are much
  // shorter (under 80 % and 60 m saved): then that, as a local would.
  function botRoute(G, x0, z0, x1, z1) {
    const gps = G.nav && G.nav.route(x0, z0, x1, z1);
    const two = NAV2 && NAV2.route(x0, z0, x1, z1);
    if (two && two.length >= 2) {
      const lg = gps ? polyLen(gps) : Infinity, l2 = polyLen(two);
      if (l2 < 0.8 * lg && lg - l2 > 60) { D.wrongWay = (D.wrongWay || 0) + 1; return two; }
    }
    return gps;
  }
  RV.botRoute = (x0, z0, x1, z1) => botRoute(A.G, x0, z0, x1, z1);
  RV.cornerAhead = cornerAhead;
  RV.passPlan = (v, dt) => passPlan(A.G, v, dt);
  RV.useNav2 = (n) => { NAV2 = n; };   // tools/smoke_bot.mjs, which has no page to import from
  // A game convention: A steers left. Measured once at the first drive, flipped if wrong.
  RV.steerSign = 1;

  function stopHere() {
    const v = A.G.veh;
    RV.hold('KeyW', false); RV.hold('KeyA', false); RV.hold('KeyD', false);
    RV.hold('KeyS', (v.speedKmh || 0) > 1.5 && (v.vLong == null || v.vLong > 0.3));
    if ((v.vLong || 0) < -0.3) RV.hold('KeyS', false);
  }

  // ---------------------------------------------------------------- the controller
  let cardT = 0;
  function control(dt) {
    const T = RV.task;
    if (!T || !A?.G) return;
    const G = A.G;
    T.elapsed = (T.elapsed || 0) + dt;
    T.topKmh = Math.max(T.topKmh || 0, G.veh?.speedKmh || 0);
    {
      const id = carNow();
      if (!T.vehSeq) T.vehSeq = [id]; else if (T.vehSeq[T.vehSeq.length - 1] !== id) T.vehSeq.push(id);
      T.vehSecs = T.vehSecs || {};
      if (Number.isFinite(dt) && dt > 0 && dt < 1) T.vehSecs[id] = (T.vehSecs[id] || 0) + dt;
    }
    if (T.preparing || G.seamHold) { RV.release(); return; }
    // Cards first: read for a beat (the Node side screenshots them), then Enter.
    const card = cardUp();
    if (card) {
      RV.release();
      if (!T.cardSince) { T.cardSince = performance.now(); const h = document.querySelector('#cinematic h1')?.innerText; ev('card', { card, title: h || '', shot: true }); }
      if (performance.now() - T.cardSince > (T.cardReadMs || 1500) && performance.now() - cardT > 700) { cardT = performance.now(); RV.tap(card === 'story' ? 'Enter' : 'Enter', 600); }
      return;
    }
    T.cardSince = 0;
    if (G.mode !== 'drive') { RV.release(); return; }
    if (T.type === 'idle') { RV.release(); if (T.elapsed > T.seconds) finish('done'); return; }
    if (T.type === 'floor') {
      RV.hold('KeyW', true); RV.hold('KeyS', false);
      RV.hold('KeyA', T.steer < 0); RV.hold('KeyD', T.steer > 0);
      T.maxKmh = Math.max(T.maxKmh || 0, G.veh.speedKmh || 0);
      if (T.elapsed > T.seconds) { RV.release(); finish('done', { maxKmh: +T.maxKmh.toFixed(1) }); }
      return;
    }
    if (T.type === 'aim') {
      // Full throttle through a list of points (a run-up, a ramp lip, the landing), steering at each in turn.
      const v = G.veh, P = T.points, p = P[Math.min(T.pi || 0, P.length - 1)];   // S3-JUMPS: held on the last point while still in the air
      T.maxAir = Math.max(T.maxAir || 0, v.airT || 0, T.pi >= 1 ? v.lastAir || 0 : 0);
      if ((v.airT || 0) > 0.3 && !T.airShot) { T.airShot = true; T.lipKmh = T.lipKmh ?? +(v.speedKmh || 0).toFixed(1); ev('air', { shot: true }); }
      if ((T.pi || 0) === 1 && Math.hypot(p[0] - v.x, p[1] - v.z) < 12 && T.lipKmh == null) T.lipKmh = +(v.speedKmh || 0).toFixed(1);
      // S3-JUMPS: with a `lip`, the flight that counts is the one that takes off within 16 m of it,
      // timed to the ground (the old reading stopped 40 m past the lip, mid-air on a fast ramp).
      if (T.lip) {
        if ((v.airT || 0) > 0 && !T.fl) T.fl = { d: Math.hypot(T.lip[0] - v.x, T.lip[1] - v.z), kmh: v.speedKmh || 0, x: v.x, z: v.z };
        if (T.fl && !(v.airT > 0)) {
          if (T.fl.d < 16 && (v.lastAir || 0) > (T.lipAir || 0)) { T.lipAir = v.lastAir; T.takeoffKmh = +T.fl.kmh.toFixed(1); T.lipDist = +Math.hypot(v.x - T.fl.x, v.z - T.fl.z).toFixed(1); }
          T.fl = null;
        }
      }
      // Past it (beyond the point along the leg that leads to it) counts as reached.
      const q = P[(T.pi || 0) - 1] || T.from || [v.x, v.z];
      const past = T.pi >= 1 && ((v.x - p[0]) * (p[0] - q[0]) + (v.z - p[1]) * (p[1] - q[1])) > 0;
      if ((T.pi || 0) < P.length && (Math.hypot(p[0] - v.x, p[1] - v.z) < 9 || past)) T.pi = (T.pi || 0) + 1;
      const flying = T.lip && (v.airT || 0) > 0;
      if ((T.pi >= P.length && !flying) || T.elapsed > T.seconds) { RV.release(); finish(T.pi >= P.length ? 'done' : 'timeout', { maxAir: +(T.maxAir || 0).toFixed(2), lipKmh: T.lipKmh ?? null, lastAir: +(v.lastAir || 0).toFixed(2), ...(T.lip ? { lipAir: T.lipAir != null ? +T.lipAir.toFixed(2) : null, takeoffKmh: T.takeoffKmh ?? null, lipDist: T.lipDist ?? null } : {}) }); return; }
      const err = wrap(Math.atan2(p[0] - v.x, p[1] - v.z) - v.yaw);
      RV.hold('KeyS', false); RV.hold('KeyW', true);
      RV.hold('KeyA', (v.airT || 0) === 0 && err > 0.04); RV.hold('KeyD', (v.airT || 0) === 0 && err < -0.04);
      return;
    }
    if (T.type === 'drive') {
      const v = G.veh, d = Math.hypot(T.to.x - v.x, T.to.z - v.z);
      if (d < (T.r || 25)) { stopHere(); if ((v.speedKmh || 0) < 2) { RV.release(); finish('arrived', { d: Math.round(d) }); } return; }
      steerTo(T.to, T.maxKmh || 70, dt);
      if (T.elapsed > (T.timeout || 240)) { RV.release(); finish('timeout', { d: Math.round(d) }); }
      return;
    }
    if (T.type === 'mission') return missionTick(T, dt);
  }

  function finish(outcome, extra = {}) {
    const T = RV.task; RV.task = null; RV.release();
    // bot.vehicle (B-02): every vehicle the bot drove in this task, in order ("ranger>cart"),
    // and the seconds spent in each, so a pack shows a job played in the wrong vehicle.
    const vs = T.vehSecs || {};
    const bot = { handbrakes: D.handbrakes - (T.hb0 || 0), backouts: (D.backouts || 0) - (T.bo0 || 0), maxKmh: +(T.topKmh || 0).toFixed(1),
      vehicle: (T.vehSeq || [carNow()]).join('>'), vehicleSecs: Object.fromEntries(Object.entries(vs).map(([k, s]) => [k, +s.toFixed(1)])) };
    ev('task-end', { task: T.type, id: T.id, outcome, elapsed: +(T.elapsed || 0).toFixed(1), bot, ...extra, shot: true });
  }

  const LEG_CAP_S = 420;
  // A player in a race floors it (S3-BOT): the 72 km/h job cap is for errands.
  // The corner look-ahead, not this, is what keeps it on the road.
  const RACE_KMH = 100;
  // The golf night fence (S3-BOT): on the bike, ride square at the wire and tap
  // Space when « Espace : sauter la clôture » is up and the wire is 2 to 7 m
  // ahead, as the stage's hint says. Straight across the grass, no GPS line. A
  // bounce off the wire (the game puts the bike back 1.2 m short) backs off 8 m
  // for a run-up and comes again.
  function fenceTick(T, st, m, v, prompt, dt) {
    const f = m.target, side = v.z - f.z, kmh = v.speedKmh || 0;
    T.fence = T.fence || { back: 0, hops: 0, runup: true };
    const F = T.fence;
    const over = m.fenceS && m.fenceS.over;
    if (side > 1.5 && over) { stopHere(); return; }      // over the wire: the stage closes when the bike lands
    // Round the end of the wire, not over it (a2: crossed at x 1359.8, 12.2 m off the
    // middle of a 24 m fence, so no hop counted): ride back to the run-up and come square.
    if (side > 1.5) F.runup = true;
    const ru = { x: f.x, z: f.z - 16 };
    if (F.runup) {
      if (Math.hypot(ru.x - v.x, ru.z - v.z) < 4) F.runup = false;
      else {
        const e = wrap(Math.atan2(ru.x - v.x, ru.z - v.z) - v.yaw);
        RV.hold('KeyS', false); RV.hold('Space', false); RV.hold('KeyW', kmh < 22);
        RV.hold('KeyA', e > 0.06); RV.hold('KeyD', e < -0.06);
        return;
      }
    }
    if (F.back > 0) {
      F.back -= dt;
      RV.hold('KeyW', false); RV.hold('KeyS', true); RV.hold('KeyA', false); RV.hold('KeyD', false); RV.hold('Space', false);
      return;
    }
    if (side > -2.5 && kmh < 4 && !v.inAir && F.hops > 0 && T.stageT - (F.lastHop || 0) > 1.2) { F.back = 1.6; return; }
    const aimX = f.x, aimZ = f.z + 10;
    const err = wrap(Math.atan2(aimX - v.x, aimZ - v.z) - v.yaw);
    RV.hold('KeyS', false); RV.hold('KeyW', true);
    RV.hold('KeyA', err > 0.06); RV.hold('KeyD', err < -0.06);
    if (/sauter la cl[oô]ture/i.test(prompt) && side < -2 && side > -7 && Math.abs(err) < 0.5 && !v.inAir) {
      if (RV.tap('Space', 900)) { F.hops++; F.lastHop = T.stageT; ev('fence-hop', { side: +side.toFixed(1), kmh: +kmh.toFixed(1) }); }
    }
  }
  function missionTick(T, dt) {
    const G = A.G, v = G.veh, m = G.mission;
    if (!T.started) {
      T.started = true;
      T.stage = -1; T.stageT = 0; T.assists = []; T.stages = []; T.textMark = RV.texts.length;
      if (T.attach) { if (!m) finish('unavailable', { why: 'nothing to attach to' }); else T.id = m.def.id; return; }
      const ok = A.start(T.id);
      if (ok === false) { const why = document.querySelector('[class*="toast"]')?.innerText || ''; finish('unavailable', { why }); }
      return;
    }
    if (!m || m.def.id !== T.id) {
      // The job closed: done (it is in G.done) or failed (a toast said why).
      const done = G.done.has(T.id);
      scanTexts();   // the fail toast lands in the same tick the job closes
      // The toast queue holds two on screen and the rest pending, so read the queue itself first.
      const q = A.hud?.toasts ? [...(A.hud.toasts.active || []), ...(A.hud.toasts.pending || [])].map((a) => String(a.text || a)) : [];
      const fromQueue = q.filter((x) => /RATÉ|Remorqu|Abandonn|Trop tard/i.test(x)).pop();
      const lastToast = fromQueue || RV.texts.slice(T.textMark || 0).filter((x) => x.t >= now() - 3).map((x) => x.text).filter((x) => /RATÉ|Remorqu|Abandonn|Trop tard|fini\b/i.test(x)).pop() || '';
      if (T.stage >= 0) T.stages.push({ idx: T.stage, secs: +T.stageT.toFixed(1), text: T.stageText });
      return finish(done ? 'done' : 'fail', { stages: T.stages, assists: T.assists, why: done ? '' : lastToast, ...(T.sauna ? { sauna: T.sauna } : {}) });
    }
    if (m.idx !== T.stage) {
      if (T.stage >= 0) T.stages.push({ idx: T.stage, secs: +T.stageT.toFixed(1), text: T.stageText });
      T.stage = m.idx; T.stageT = 0; T.holdT = 0; T.stageAssist = 0; T.stageD0 = null; T.stageText = m.stages[m.idx]?.text || '';
      D.route = null; D.resets = 0; D.best = null; D.watchT = 0; D.turn = null; D.pass = 0; RV.hold('Space', false); RV.hold('KeyE', false); T.spinning = false; T.spinAt = null; T.liftBack = 0;
      ev('stage', { id: T.id, idx: m.idx, of: m.stages.length, text: T.stageText, shot: true });
    }
    T.stageT += dt;
    const st = m.stages[m.idx] || {};
    const prompt = (document.querySelector('#prompt, .prompt, #hudprompt')?.innerText || '');
    // Money gate: the bot is not here to grind; hand it the cash and say so.
    if (/Il te manque|manque \d+ \$/.test(prompt) && G.wallet) { G.wallet.add(50); T.assists.push({ idx: m.idx, kind: 'money' }); }
    // The meal shift (St. Vincent) is its own little game on WASD + E.
    const spin = st.kind === 'doughnuts' || /doughnut/i.test(st.text || '');
    if (spin && m.target) {
      // Doughnuts (Sayyad): get into the street in front of the house, then W + handbrake (Space) + full lock,
      // as the stage's own hint says. Leave the circle and it drives back in first.
      const R = st.radius || m.target.r || 22, d = Math.hypot(m.target.x - v.x, m.target.z - v.z);
      // The house is the centre and it is in a yard: spin on the road node nearest it (still inside the radius).
      if (!T.spinAt) {
        const r = G.nav && G.nav.route(v.x, v.z, m.target.x, m.target.z), e = r && r.length ? r[r.length - 1] : null;
        T.spinAt = e && Math.hypot(e[0] - m.target.x, e[1] - m.target.z) < R - 2 ? { x: e[0], z: e[1] } : { x: m.target.x, z: m.target.z };
      }
      const ds = Math.hypot(T.spinAt.x - v.x, T.spinAt.z - v.z);
      // The meter counts only while the truck slides (DONUT.slipLat / slipYawRate): full throttle, full lock, and the
      // handbrake pulsed (0.7 s on, 0.5 s off) so the speed builds between slides instead of dying at 10 km/h.
      if (d > R - 2) T.spinning = false; else if (d < R - 5 || (ds < 8 && d < R - 2)) T.spinning = true;
      if (!T.spinning) { RV.hold('Space', false); steerTo(d > R - 2 && ds > 4 ? T.spinAt : m.target, 25, dt); }
      else {
        // Build speed on a wide arc to 24 km/h (the hint: « Espace en roulant (20 km/h+) »), then W + full lock +
        // handbrake held until it bleeds under 9 km/h; again.
        const k = (v.speedKmh || 0);
        if (T.slide && k < 9) T.slide = false; else if (!T.slide && k > 24) T.slide = true;
        const err = wrap(Math.atan2(m.target.x - v.x, m.target.z - v.z) - v.yaw);
        RV.hold('KeyS', false); RV.hold('KeyW', true);
        if (T.slide) { RV.hold('KeyD', false); RV.hold('KeyA', true); RV.hold('Space', true); }
        else { RV.hold('Space', false); RV.hold('KeyA', err > 0.5); RV.hold('KeyD', err < -0.5 && d > R - 8); }
      }
      if (/klaxon|\bH\b/i.test(st.sub || '')) RV.tap('KeyH', 2500);
    } else if (st.kind === 'lift' && st.at) {
      // The couch lift (Mike's maple): the middle of the bed has to stop under the fork, then E is held.
      // Same geometry as sidejobs.js cargoSpot(): the bed centre sits lz metres along the heading.
      const sp = v.spec || {}, fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      const lz = sp.bed ? -(sp.wheelbase / 2 + (sp.len - sp.wheelbase - sp.overhangF)) + sp.len * (sp.bed[0] + sp.bed[1]) / 2 : -0.15;
      const L = st.at, bx = v.x + fx * lz, bz = v.z + fz * lz, dBed = Math.hypot(bx - L.x, bz - L.z);
      const cx = L.x - fx * lz, cz = L.z - fz * lz;            // where the truck's centre must be, on this heading
      const along = (cx - v.x) * fx + (cz - v.z) * fz, lat = (cx - v.x) * fz - (cz - v.z) * fx;
      const kmh = v.speedKmh || 0;
      if (T.liftBack > 0) { T.liftBack -= dt; RV.hold('KeyE', false); RV.hold('KeyW', false); RV.hold('KeyS', true); RV.hold('KeyA', false); RV.hold('KeyD', false); }
      else if (dBed < 1.3) { stopHere(); RV.hold('KeyE', kmh < 1.5); }
      else if (Math.hypot(cx - v.x, cz - v.z) > 12) { RV.hold('KeyE', false); steerTo({ x: cx, z: cz }, 22, dt); }
      else {
        RV.hold('KeyE', false);
        if (Math.abs(along) < 1 && Math.abs(lat) > 1.2) T.liftBack = 2.2;   // alongside it but off to the side: back up and come again
        const want = Math.max(2.5, Math.min(7, Math.abs(along) * 1.5));
        const fwd = along > 0;
        RV.hold('KeyW', fwd && kmh < want); RV.hold('KeyS', !fwd ? kmh < want || (v.vLong || 0) > 0.2 : kmh > want + 3);
        const err = wrap(Math.atan2(L.x - v.x, L.z - v.z) - v.yaw);
        RV.hold('KeyA', fwd && err > 0.08); RV.hold('KeyD', fwd && err < -0.08);
      }
    } else if (G.mealShift) {
      // The meal service (St. Vincent, B-13b): walk to the next bed still waiting,
      // wait for its green, one bite (E, as Space). The old random walk never got a
      // bed in 480 s and the job was abandoned every run.
      const S = G.mealShift.state, i = S.served.findIndex((n) => n < 3);
      const b = i >= 0 ? S.beds[i] : null;
      const dx = b ? b.x - S.x : 0, dy = b ? b.y - S.y : 0;
      const far = b && Math.hypot(dx, dy) > 60;
      RV.hold('KeyW', !!far && dy < -8); RV.hold('KeyS', !!far && dy > 8);
      RV.hold('KeyA', !!far && dx < -8); RV.hold('KeyD', !!far && dx > 8);
      if (b && !far && S.cool === 0 && S.ready(i)) RV.tap('KeyE', 300);
    } else if (st.kind === 'heat' && G.sauna && m.target && heatTick(T, G.sauna, v, dt)) {
      // never true: the sauna pours on the way and the drive below steers
    } else if (st.kind === 'fence' && m.target) {
      fenceTick(T, st, m, v, prompt, dt);
    } else if (m.race && m.target) {
      // A race or a course (S3-BOT): sit on the line through 3-2-1 like a player
      // (the clock and the rivals wait for GO, so rolling early was a free head
      // start), then drive through each gate at speed, the next one in the look-ahead.
      const R = m.race;
      if (!R.going) stopHere();
      else {
        const tr = R.track, nxt = tr && !tr.isFinished(R.me.done + 1) ? tr.gate(R.me.done + 1) : null;
        steerTo(m.target, st.maxSpeed ? st.maxSpeed - 3 : (T.maxKmh || RACE_KMH), dt, { through: true, next: nxt });
      }
    } else if (m.def.id === 'arcdernier' && m.idx === 0 && m.fin && finaleTour(T, m, v, dt)) {
      // S4-SUMMER: « Le dernier soir » stage 1 is a free drive with no GPS line;
      // the places still to see are lit on the map (m.fin.todo). A player goes
      // to a few of them, nearest first, then home. While touring, the stage's
      // assist and abandon clocks are held (T.holdT): the tour IS the stage.
    } else if (m.target) {
      // A race stage is `anywhere` (it owns its gates) but still has a target: the next gate.
      const d = Math.hypot(m.target.x - v.x, m.target.z - v.z);
      if (d < m.target.r * 0.8 || (d < m.target.r && (v.speedKmh || 0) < 6)) {
        stopHere();
        if (/[Tt]iens E|[Mm]aintiens E|[Hh]old E/.test(prompt)) RV.hold('KeyE', (v.speedKmh || 0) < 2);
        else if ((v.speedKmh || 0) < 5) RV.tap('KeyE', 700);
      } else {
        const max = st.maxSpeed ? st.maxSpeed - 3 : (T.maxKmh || 72);
        steerTo(m.target, max, dt);
      }
    } else {
      // No place to be: the stage is a mechanic (E presses, a held key, a timer).
      RV.hold('KeyW', false);
      if (/[Tt]iens E|[Mm]aintiens E|[Hh]old E/.test(prompt)) RV.hold('KeyE', true);
      else if (/\bE\b|⏎|Entrée|Espace/.test(prompt)) RV.tap('KeyE', 450);
      else RV.tap('KeyE', 1500);
      stopHere();
    }
    // Assists: a learner who is lost gets put near the target, and it is counted.
    // A long leg gets the time a careful driver needs: 2.5 x distance at the stage's cap.
    if (T.stageD0 == null && m.target) T.stageD0 = Math.hypot(m.target.x - v.x, m.target.z - v.z);
    // ...in the vehicle it is driving (B-13b): the golf cart tops out at 24 km/h,
    // so a limit worked out at 62 km/h ran out at 40 % of the way to Sayyad's.
    const top = v.spec && v.spec.topSpeed > 0 ? v.spec.topSpeed * 0.9 : Infinity;
    const capMs = Math.min(((st.maxSpeed || T.maxKmh || 65) - 3) / 3.6, top);
    // Never past LEG_CAP_S, though: the harness gives a whole job 900 s (its
    // runTask maxSecs), and with the watchdog honest (it no longer fakes four
    // failed re-plans on a long winding leg) a 13 km leg would otherwise eat
    // that budget and end the job as a harness timeout before its later stages.
    const limit = Math.max(T.stageTimeout || 150, Math.min(LEG_CAP_S, T.stageD0 ? 2.5 * T.stageD0 / capMs : 0));
    const stageT = T.stageT - (T.holdT || 0);   // S4-SUMMER: the finale tour's seconds are not the stage being stuck
    if (T.assist !== false && m.target && !st.anywhere && (stageT > limit * (T.stageAssist + 1) || D.resets >= 4)) {
      const why = D.resets >= 4 ? 'replans' : 'time';
      const off = T.stageAssist >= 1 ? 0 : Math.min(40, m.target.r * 2);
      const at = assistSpot(m.target.x, m.target.z, off);
      T.preparing = true; RV.release();
      Promise.resolve(A.teleport(at.x, at.z, at.yaw))
        .catch((error) => { ev('assist-error', { id: T.id, message: error.message }); })
        .finally(() => { T.preparing = false; });
      T.stageAssist++; D.resets = 0; D.route = null;
      T.assists.push({ idx: m.idx, kind: 'teleport', at: +T.stageT.toFixed(1), why, onRoute: at.onRoute });
      ev('assist', { id: T.id, idx: m.idx, kind: 'teleport' });
    }
    // A mechanic stage the bot cannot read (doughnuts, a set-piece mini-game) gets 1.5 x the stage timeout, not 3.2 x.
    if (stageT > limit * (st.anywhere && T.assist !== false ? 1.5 : 3.2)) {
      ev('assist', { id: T.id, idx: m.idx, kind: 'abandon' });
      T.assists.push({ idx: m.idx, kind: 'abandon' });
      A.abandon();
    }
  }

  // S4-SUMMER: the finale's free drive. `T.tour` (place keys, in order) or the
  // nearest lit place, `T.tourN` of them (default 4); a leg that cannot reach
  // its place in `T.tourLegS` (240 s) is dropped. Returns true while touring.
  function finaleTour(T, m, v, dt) {
    const F = T.fin || (T.fin = { n: 0, skip: new Set(), leg: null, legT: 0, seen0: m.fin.seen.size, done: false });
    if (F.done) return false;
    const want = T.tour ? T.tour.length : (T.tourN || 4);
    const todo = (m.fin.todo || []).filter((p) => !F.skip.has(p.at));
    if (F.leg && m.fin.seen.has(F.leg.at)) { ev('finale-place', { at: F.leg.at, secs: +F.legT.toFixed(1), shot: true }); F.n++; F.leg = null; }
    if (F.n >= want || !todo.length) {
      F.done = true; D.route = null;
      T.stageD0 = Math.hypot(m.target.x - v.x, m.target.z - v.z);   // the drive home gets its own clock
      ev('finale-home', { seen: [...m.fin.seen], skipped: [...F.skip] });
      return false;
    }
    if (!F.leg) {
      let p = null;
      if (T.tour) { const k = T.tour.find((x) => !m.fin.seen.has(x) && !F.skip.has(x)); p = todo.find((q) => q.at === k) || null; }
      if (!p) p = todo.slice().sort((a, b) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z))[0];
      const r = botRoute(A.G, v.x, v.z, p.x, p.z), e = r && r.length ? r[r.length - 1] : null;
      F.leg = { at: p.at, x: e ? e[0] : p.x, z: e ? e[1] : p.z }; F.legT = 0; D.route = null;
      ev('finale-leg', { at: p.at });
    }
    F.legT += dt; T.holdT = (T.holdT || 0) + dt;
    const d = Math.hypot(F.leg.x - v.x, F.leg.z - v.z);
    if (F.legT > (T.tourLegS || 240) || (d < 8 && (v.speedKmh || 0) < 3)) { F.skip.add(F.leg.at); ev('finale-skip', { at: F.leg.at, d: Math.round(d) }); F.leg = null; return true; }
    if (d < 10) stopHere(); else steerTo(F.leg, T.maxKmh || 60, dt);
    return true;
  }

  // The cedar sauna (St. Vincent, S4-SAUNA): one splash of water (F) when the
  // needle and its ghost are under the bottom of the green plus a little
  // (sauna_heat.js BOT_POUR_BELOW 0.48), never when it is already wet. There
  // is no jug to refill any more, so it never detours: returns false and the
  // caller keeps steering to the hospital. Pours are counted for the report.
  function heatTick(T, h, v, dt) {
    const s = h.s;
    if (s.w + s.pend < 0.48 && s.cool <= 0 && !h.cut) { if (RV.tap('KeyF', 400) !== false) T.pours = (T.pours || 0) + 1; }
    T.sauna = { inBand: s.driveT > 0 ? +(s.inBandT / s.driveT).toFixed(3) : 0, shorts: s.shorts, spills: s.spills, pours: s.pours, w: +s.w.toFixed(2) };
    return false;
  }

  RV.run = (task) => { RV.release(); D.route = null; D.resets = 0; D.turn = null; D.pass = 0; RV.task = { ...task, elapsed: 0, hb0: D.handbrakes, bo0: D.backouts || 0 }; D.hbT = 0; D.hbCool = false; ev('task-start', { task: task.type, id: task.id || null }); return true; };
  RV.busy = () => !!RV.task;
  ev('agent-ready');
})();
