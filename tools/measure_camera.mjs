// How much the chase camera shakes, as a number.
//
// docs/NEXT.md §3 says "the camera still jitters over bumps", which is a
// feeling. This turns it into three routes driven at a fixed dt with a fixed
// throttle, sampling the camera pose once per rendered frame, and reports the
// RMS and peak of the camera's ACCELERATION — the second difference of the
// height and the pitch, divided by dt². Acceleration is the right quantity:
// a camera that moves is fine, a camera that changes direction sixty times a
// second is the bug, and dividing by dt² is what makes 60 Hz and 120 Hz
// comparable instead of the faster one always looking better.
//
// The routes, all from a standstill with the throttle pinned:
//   jump   — the chantier ramp on chemin d'Aylmer, the biggest air in the game
//   kerb   — straight down a road, then steered off it and back on: kerb kicks
//   launch — the driveway, standstill to whatever it will do, dead straight
//
// The sim runs on AYLMER.step at the physics rate; the camera runs on
// AYLMER.camera at the frame rate, which is the real relationship (a 120 Hz
// display sub-steps the physics and moves the camera once). No frame is drawn:
// on SwiftShader that would be 80 ms a sample and the run would take an hour.
//
// Usage: node tools/measure_camera.mjs [url] [--hz 60,120] [--json out.json]
// Requires a Chrome started the way docs/VERIFY.md says, on CDP_PORT.

const url = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'http://localhost:8123/index.html';
const hzIdx = process.argv.indexOf('--hz');
const RATES = hzIdx > 0 ? process.argv[hzIdx + 1].split(',').map(Number) : [60, 120];
const jsonIdx = process.argv.indexOf('--json');
const CDP_PORT = Number(process.env.CDP_PORT || 9222);

// Each route: where to start, which way to point, how fast it is already going,
// how long it runs, and when the wheel goes over. All three use the same piece
// of chemin d'Aylmer — the 950 block, the straightest fast road in the game and
// the one jumps.js itself nominates as the run-up to the chantier ramp — so the
// three numbers differ by what the car DOES, not by where it is.
//
// `kmh` matters: at a standstill the Ranger takes 150 m to be worth measuring,
// and a run-up that arrives at the lip too slowly does not leave the ground at
// all. It is set on the body directly rather than driven up to, so the tape
// starts at the same speed at 60 Hz and at 120 Hz.
const ROAD = { x: 725.5, z: -240.2, to: [952.7, -279.3] };
const ROUTES = [
  {
    // The chantier ramp: seven metres of gravel to a 2.9 m lip. The takeoff, the
    // air and the landing, which is where `inAir` flickers and the camera pops.
    // It starts at the jump's own `entry` — 108 m out, three seconds at this
    // speed — rather than at `from`: with the throttle pinned and nobody
    // steering, a 230 m run-up wanders off the road and the two frame rates end
    // up four hundred metres apart, which is not one measurement twice.
    id: 'jump', x: 845.1, z: -264.9, to: [952.7, -279.3], kmh: 90, secs: 6, steer: 0, steerAt: 99,
  },
  {
    // Same straight, already at speed, and after a second and a half the wheel
    // goes over: the car crosses the road edge, cars.js kicks the nose (D3, the
    // kerb), and the verge is rough all the way. That is the bump in §3.
    id: 'kerb', ...ROAD, kmh: 72, secs: 8, steer: 0.55, steerAt: 1.5,
  },
  {
    // Standstill, throttle pinned, dead straight, on the same asphalt: the
    // "slightly under acceleration" half of §3 with nothing else in it.
    id: 'launch', ...ROAD, kmh: 0, secs: 7, steer: 0, steerAt: 99,
  },
];

const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(list.webSocketDebuggerUrl);
await new Promise((res) => (ws.onopen = res));
let id = 0; const pending = new Map(); const logs = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params }));
});
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    logs.push('[EXCEPTION] ' + (m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    logs.push('[error] ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
};
await send('Runtime.enable'); await send('Page.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the numbers
// Second difference / dt² is the acceleration of the signal. RMS says how rough
// the whole run was; peak says how bad the worst single frame was, which is the
// one the eye actually catches. The first and last samples have no neighbours.
function accelStats(series, dt) {
  let sum = 0, peak = 0, n = 0;
  for (let i = 1; i < series.length - 1; i++) {
    const a = (series[i + 1] - 2 * series[i] + series[i - 1]) / (dt * dt);
    sum += a * a; if (Math.abs(a) > peak) peak = Math.abs(a); n++;
  }
  return { rms: n ? Math.sqrt(sum / n) : 0, peak };
}

// One route at one frame rate, driven entirely inside the page.
// The physics sub-steps at <= 1/60 exactly as frame() does, so 120 Hz is a real
// 120 Hz and not "the same sim with more camera calls".
const runRoute = (route, hz) => `(async () => {
  const A = window.AYLMER, G = A.G;
  const st = G.story || A.story;
  if (st && st.hide) st.hide();
  // cars.js rolls for an engine misfire and traffic.js for everything it does,
  // so two runs of the same route are two different drives — the 60 Hz row
  // cleared the chantier ramp and the 120 Hz row did not, off nothing but
  // Math.random. A seeded LCG makes a route a route.
  let seed = 20040704 >>> 0;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  A.settings({ shake: 1 });
  G.cam = 0;                                   // the chase cam, which is the one that jitters
  const r = ${JSON.stringify(route)};
  const yaw = Math.atan2(r.to[0] - r.x, r.to[1] - r.z);
  A.teleport(r.x, r.z, yaw);
  G.camPos = [G.veh.x, 4, G.veh.z];
  G.camYaw = yaw + Math.PI;
  G.camClip = null;
  if (A.camReset) A.camReset();
  const keys = A.input.keys;
  keys.clear(); keys.add('KeyW');
  // Let the sector loader, the suspension and the camera settle before the tape
  // starts, THEN set the entry speed: a second of throttle from a standstill is
  // what gets the gearbox and the springs into a steady state.
  for (let i = 0; i < 60; i++) { A.step(1 / 60); A.camera(1 / 60); }
  const spd = r.kmh / 3.6;
  if (spd > 0) {
    const v = G.veh;
    v.vLong = spd; v.vLat = 0;
    v.vx = Math.sin(v.yaw) * spd; v.vz = Math.cos(v.yaw) * spd;
  }
  const dt = 1 / ${hz};
  const n = Math.round(r.secs * ${hz});
  const y = new Array(n), p = new Array(n), x = new Array(n), z = new Array(n);
  let air = 0, maxSpd = 0;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    if (r.steer > 0.2 && t >= r.steerAt) keys.add('KeyD'); else keys.delete('KeyD');
    // The physics step is pinned to 1/120 at BOTH frame rates — 2 sub-steps at
    // 60 Hz, 1 at 120 Hz — so the car drives exactly the same line either way
    // and the only thing that changes between the two rows is how often the
    // camera moves. Sub-stepping is what frame() does; letting the sub-step
    // ride the frame rate instead made the 60 Hz and 120 Hz runs two different
    // drives (one cleared the ramp, one didn't) and the numbers meant nothing.
    const sub = Math.round(dt / (1 / 120));
    for (let k = 0; k < sub; k++) A.step(1 / 120);
    const c = A.camera(dt);
    y[i] = c.y; p[i] = c.pitch; x[i] = c.x; z[i] = c.z;
    if (G.veh.inAir) air++;
    const s = Math.abs(G.veh.vLong); if (s > maxSpd) maxSpd = s;
  }
  keys.clear();
  const span = (a) => +(Math.max(...a) - Math.min(...a)).toFixed(2);
  return JSON.stringify({ y, p, x, z, airFrac: air / n, maxKmh: Math.round(maxSpd * 3.6),
    ySpan: span(y), pSpan: span(p), mode: G.mode,
    endX: Math.round(G.veh.x), endZ: Math.round(G.veh.z) });
})()`;

let code = 0;
const rows = [];
try {
  await send('Storage.clearDataForOrigin', { origin: new URL(url).origin, storageTypes: 'all' });
  await send('Page.navigate', { url });
  await sleep(1500);
  const boot = await evaluate(`(async () => {
    const b = document.getElementById('start'); if (!b) return 'no #start';
    b.click();
    let go = null;
    for (let i = 0; i < 20 && !go; i++) {
      await new Promise(r => setTimeout(r, 100));
      const c = document.getElementById('startconfirm');
      if (c && !c.disabled && c.getBoundingClientRect().width > 0) go = c;
    }
    if (go) go.click();
    for (let i = 0; i < 200; i++) { await new Promise(r => setTimeout(r, 100)); if (window.AYLMER?.G?.mode === 'drive') return 'drive'; }
    return 'mode=' + window.AYLMER?.G?.mode;
  })()`);
  if (boot !== 'drive') throw new Error('did not reach drive: ' + boot);
  console.log('# camera jitter — RMS and peak of camera acceleration (m/s², rad/s²)');
  console.log('# route   Hz   height RMS   height peak   pitch RMS   pitch peak   air%  max km/h');
  for (const hz of RATES) {
    for (const route of ROUTES) {
      const raw = await evaluate(runRoute(route, hz));
      const d = JSON.parse(raw);
      const dt = 1 / hz;
      const hy = accelStats(d.y, dt), pp = accelStats(d.p, dt);
      // The boom's horizontal wander, as one number: what the eye reads as the
      // picture sliding rather than the car moving.
      const hx = accelStats(d.x, dt), hz2 = accelStats(d.z, dt);
      const row = {
        route: route.id, hz,
        heightRms: +hy.rms.toFixed(3), heightPeak: +hy.peak.toFixed(2),
        pitchRms: +pp.rms.toFixed(3), pitchPeak: +pp.peak.toFixed(2),
        xzRms: +Math.hypot(hx.rms, hz2.rms).toFixed(2),
        airPct: Math.round(d.airFrac * 100), maxKmh: d.maxKmh,
        // The drive itself, so a row that looks calm because the car never moved
        // cannot be mistaken for a row that looks calm because the fix worked.
        ySpan: d.ySpan, pSpan: d.pSpan, endX: d.endX, endZ: d.endZ, mode: d.mode,
      };
      rows.push(row);
      console.log(
        route.id.padEnd(8), String(hz).padStart(4),
        row.heightRms.toFixed(3).padStart(11), row.heightPeak.toFixed(2).padStart(13),
        row.pitchRms.toFixed(3).padStart(11), row.pitchPeak.toFixed(2).padStart(12),
        String(row.airPct).padStart(6), String(row.maxKmh).padStart(9),
        ('  ' + row.ySpan + 'm/' + row.pSpan + 'rad @' + row.endX + ',' + row.endZ));
    }
  }
  if (jsonIdx > 0) {
    const fs = await import('node:fs');
    fs.writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(rows, null, 1));
    console.log('wrote', process.argv[jsonIdx + 1]);
  }
} catch (e) {
  console.log('MEASURE ERROR:', e.message);
  code = 1;
}
if (logs.length) { console.log(`--- console (${logs.length}) ---`); for (const l of logs) console.log(l); }
await send('Page.close').catch(() => {});
ws.close();
process.exit(code || (logs.some((l) => l.startsWith('[EXCEPTION]') || l.startsWith('[error]')) ? 1 : 0));
