// Screenshot every hero landmark from a driver's eye and from an approach, in
// ONE boot. tools/headless.mjs takes a single frame per run and the world takes
// ten seconds to bake, so shooting sixteen views that way costs three minutes
// and a lot of patience.
//
//   node tools/shots_landmarks.mjs [url] [outdir] [--far] [--only=pwhs,heritage]
//
// --far forces every view past HERO_NEAR so the far bake can be compared with
// the near one at the same camera — that is how you tell whether the LOD swap
// reads as a pop.
const url = process.argv[2] || 'http://localhost:8138/index.html';
const outdir = process.argv[3] || 'docs/shots';
const far = process.argv.includes('--far');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const sizeArg = process.argv.find((a) => /^--size=\d+x\d+$/.test(a));
const [VW, VH] = sizeArg ? sizeArg.slice(7).split('x').map(Number) : [1152, 720];

// [key, camera x, z, target x, z, cam] — the yaw is worked out from the target
// so a view can be re-aimed by moving the thing it looks at. `cam` indexes
// main.js's CAMS: 0 is the chase camera (an approach), 3 is the hood camera,
// which is as close to a driver's eye as the game has.
const VIEWS = [
  ['pwhs-approach',     6800, -7886,  6800, -8005, 0],
  ['pwhs-entrance',     6800, -7962,  6800, -8002, 3],
  ['pwhs-lot',          6760, -8102,  6800, -8024, 3],
  ['pwhs-wing',         6664, -8060,  6706, -8060, 3],
  ['pwhs-field',        6790, -8126,  6790, -8188, 0],
  ['heritage-approach', 5642, -6934,  5535, -6856, 0],
  ['heritage-atrium',   5562, -6790,  5513, -6790, 3],
  ['heritage-rotunda',  5570, -6888,  5535, -6856, 3],
  ['heritage-lot',      5608, -6800,  5513, -6790, 3],
  ['mike-front',        -405,    58,   -428,    58, 3],
  ['mike-couch',        -396,    57, -415.2,  57.4, 3],
  ['mike-corner',       -402,    36,   -424,    56, 0],
  ['lordaylmer',        -404,    60,   -370,    60, 3],
  ['symmesinn',        -1518,   -30,  -1517,   -55, 3],
  ['british',           -916,   -85,   -916,  -105, 3],
  ['marina',           -1770,   -70,  -1790,   -32, 0],
  ['symmesjr',          -318,   404,   -318,   382, 3],
];

const list = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(list.webSocketDebuggerUrl);
await new Promise((res) => (ws.onopen = res));
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id; pending.set(n, { res, rej });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    return;
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    logs.push('[' + m.params.type + '] ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push('[EXCEPTION] ' + d.text + ' ' + (d.exception?.description || '').split('\n')[0]);
  }
};
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
// Chrome is shared with every other agent in the wave, so a renderer can sit
// starved for minutes. Every call is bounded and every step says where it got
// to, because a silent hang is indistinguishable from a broken script.
const withTimeout = (p, ms, what) => Promise.race([p,
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + what)), ms))]);
const evaluate = async (expression, ms = 240000) => {
  const r = await withTimeout(
    send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
    ms, expression.slice(0, 40));
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const log = (...a) => { console.log(...a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = await import('node:fs');
fs.mkdirSync(outdir, { recursive: true });

await send('Storage.clearDataForOrigin', { origin: new URL(url).origin, storageTypes: 'all' });
await send('Page.navigate', { url });
log('navigated');
// Wait for the document rather than guessing at a sleep.
for (let i = 0; i < 120; i++) {
  await sleep(1000);
  const ready = await evaluate("document.readyState + '|' + !!document.getElementById('start')", 20000)
    .catch((e) => 'err ' + e.message);
  if (String(ready).startsWith('complete|true')) { log('document ready after', i + 1, 's'); break; }
  if (i % 10 === 9) log('  waiting for the document:', ready, `(${i + 1}s)`);
}

// #start opens the start-point picker, not the game: pick the first point,
// confirm, then wait for drive mode.
log('boot:', await evaluate(`(async () => {
  const b = document.getElementById('start'); if (!b) return 'no #start';
  b.click();
  await new Promise(r => setTimeout(r, 500));
  const p = document.getElementById('startpoints');
  if (p && p.children[0]) p.children[0].click();
  await new Promise(r => setTimeout(r, 120));
  document.getElementById('startconfirm')?.click();
  for (let i = 0; i < 3000; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (window.AYLMER?.G?.mode === 'drive') return 'drive after ' + (i * 0.2 | 0) + ' s';
  }
  return 'stuck at mode=' + window.AYLMER?.G?.mode;
})()`, 620000));

log('env:', await evaluate(`window.AYLMER.env('day')`));

for (const [name, x, z, tx, tz, cam] of VIEWS) {
  const yaw = Math.atan2(tx - x, tz - z);
  if (only && !only.split(',').some((k) => name.startsWith(k))) continue;
  // Park the car out of shot, then drive the camera by hand. G.camOverride is
  // not a thing, so the vehicle IS the camera rig: teleport it, then push the
  // free camera onto the same spot.
  const info = await evaluate(`(() => {
    const A = window.AYLMER, G = A.G;
    G.cam = ${cam};
    A.teleport(${x}, ${z}, ${yaw});
    G.veh.vx = 0; G.veh.vz = 0; G.veh.speed = 0;
    ${far ? 'G.q.drawDist = 1400;' : ''}
    A.step(1/60); A.render();
    return JSON.stringify({ x: +G.veh.x.toFixed(1), z: +G.veh.z.toFixed(1), tris: A.stats()?.tris | 0 });
  })()`);
  await sleep(220);
  await evaluate(`(() => { const A = window.AYLMER; for (let i = 0; i < 8; i++) { A.step(1/60); } A.render(); })()`);
  await sleep(180);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
  const file = `${outdir}/${name}${far ? '-far' : ''}.jpg`;
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  log(name.padEnd(20), info, '->', file);
}

console.log('--- console ---');
for (const l of logs.slice(-40)) console.log(l);
await send('Page.close').catch(() => {});
ws.close();
process.exit(logs.some((l) => l.startsWith('[EXCEPTION]')) ? 1 : 0);
