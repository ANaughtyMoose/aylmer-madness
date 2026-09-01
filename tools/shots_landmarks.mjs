// Screenshot every hero landmark from a driver's eye and from an approach, in
// ONE boot. tools/headless.mjs takes a single frame per run and the world takes
// ten seconds to bake, so shooting sixteen views that way costs three minutes
// and a lot of patience.
//
//   node tools/shots_landmarks.mjs [url] [outdir] [--far] [--only=pwhs,heritage]
//
// --far pulls every camera back to 420 m, past HERO_NEAR, so the shot uses the
// far bake. --lod does the same but forces the NEAR bake at that distance, so
// the pair can be flicked between: if the two images differ, the swap pops.
const url = process.argv[2] || 'http://localhost:8138/index.html';
const outdir = process.argv[3] || 'docs/shots';
const far = process.argv.includes('--far');
const lod = process.argv.includes('--lod');   // near bake, shot from far-bake range
// --farbake keeps the camera where it is and forces the FAR mesh. Comparing that
// against the ordinary shot is a harsher test than the real 340 m swap: if the
// two match from thirty metres they certainly match from three hundred.
const farBake = process.argv.includes('--farbake');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const sizeArg = process.argv.find((a) => /^--size=\d+x\d+$/.test(a));
// 1280x800 is the headless window's own size; overriding to anything else
// leaves the compositor capturing the old extent and the shot comes out tiled.
const [VW, VH] = sizeArg ? sizeArg.slice(7).split('x').map(Number) : [1280, 800];

// [key, camera x, z, target x, z, cam] — the yaw is worked out from the target
// so a view can be re-aimed by moving the thing it looks at. `cam` indexes
// main.js's CAMS: 0 is the chase camera (an approach), 3 is the hood camera,
// which is as close to a driver's eye as the game has.
const VIEWS = [
  // [key, camera x, z, target x, z, cam, snapToRoad]
  ['pwhs-approach',     6752, -7930,  6800, -8000, 0, 1],
  ['pwhs-entrance',     6800, -7952,  6800, -8002, 0, 0],
  ['pwhs-lot',          6890, -7944,  6800, -8005, 0, 0],
  ['pwhs-wing',         6620, -8060,  6706, -8060, 0, 0],
  ['pwhs-field',        6790, -8120,  6790, -8188, 0, 0],
  ['heritage-approach', 5612, -6942,  5533, -6856, 0, 1],
  ['heritage-atrium',   5616, -6796,  5545, -6812, 0, 0],
  ['heritage-rotunda',  5578, -6898,  5533, -6856, 0, 0],
  ['heritage-lot',      5638, -6812,  5545, -6812, 3, 0],
  ['mike-front',        -404,    54,   -428,    54, 3, 1],
  ['mike-couch',        -398,    50, -414.5,  57.4, 3, 0],
  ['mike-corner',       -404,    34,   -426,    54, 0, 1],
  ['lordaylmer',        -406,    62,   -372,    62, 3, 1],
  ['symmesinn',        -1518,   -22,  -1517,   -55, 0, 1],
  ['british',           -916,   -70,   -916,  -105, 0, 1],
  ['marina',           -1712,   -30,  -1780,   -38, 0, 0],
  ['symmesjr',          -318,   400,   -318,   382, 3, 0],
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

// #start opens the start-point picker, not the game. Every step is its own
// evaluate: one big page-side async function looks identical whether it is
// waiting on a timer or wedged behind a synchronous 3.6 M triangle bake, and
// under a shared Chrome it is always the second one.
log('menu:', await evaluate("document.getElementById('start').click(); 'clicked'", 60000));
await sleep(1500);
log('picker:', await evaluate("document.getElementById('startpoints').childElementCount", 60000));
log('point:', await evaluate(
  "document.getElementById('startpoints').children[0].click();"
  + " document.getElementById('startpoints').children[0].dataset.key", 60000));
await sleep(400);
log('confirm:', await evaluate("document.getElementById('startconfirm').click(); 'go'", 60000));
// The bake blocks the main thread in chunks, so poll from HERE, not from a
// timer inside the page.
let mode = '';
for (let i = 0; i < 90; i++) {
  await sleep(4000);
  mode = await evaluate("window.AYLMER?.G?.mode || 'none'", 60000).catch((e) => 'err');
  if (mode === 'drive') { log('drive after', (i + 1) * 4, 's'); break; }
  if (i % 5 === 4) log('  still', mode, `(${(i + 1) * 4}s)`);
}
if (mode !== 'drive') { log('never reached drive mode; last mode', mode); }

log('env:', await evaluate(`window.AYLMER.env('day')`));
// The opening story card is up on a fresh save and it dims the whole frame.
log('overlays:', await evaluate(`(() => {
  for (const id of ['story', 'pause', 'bigmap', 'options', 'garage', 'radio']) {
    document.getElementById(id)?.classList.add('hidden');
  }
  window.AYLMER.G.mode = 'drive';
  return 'cleared';
})()`));

for (const [name, x, z, tx, tz, cam, snap] of VIEWS) {
  const yaw = Math.atan2(tx - x, tz - z);
  if (only && !only.split(',').some((k) => name.startsWith(k))) continue;
  // Park the car out of shot, then drive the camera by hand. G.camOverride is
  // not a thing, so the vehicle IS the camera rig: teleport it, then push the
  // free camera onto the same spot.
  const info = await evaluate(`(() => {
    const A = window.AYLMER, G = A.G;
    G.cam = ${cam};
    // Put the camera on the asphalt where the view says so: teleporting to a
    // hand-typed coordinate on a 190 m campus lands you inside a wall.
    let px = ${x}, pz = ${z};
    if (${snap}) {
      const r = G.world.nearestRoad(px, pz);
      if (r) { px = r.x; pz = r.z; }
    }
    if (${farBake}) for (const b of G.world.landmarks.sites) b.near2 = 0;
    if (${far || lod}) {
      // straight back along the view line until the site is 420 m off
      const dx = px - ${tx}, dz = pz - ${tz};
      const l = Math.hypot(dx, dz) || 1;
      px = ${tx} + (dx / l) * 420; pz = ${tz} + (dz / l) * 420;
      G.q.drawDist = 1500;
      for (const b of G.world.landmarks.sites) b.near2 = ${lod ? '1e12' : '0'};
    }
    A.teleport(px, pz, Math.atan2(${tx} - px, ${tz} - pz));
    G.veh.vx = 0; G.veh.vz = 0; G.veh.speed = 0;
    A.step(1/60); A.render();
    A.render();
    return JSON.stringify({ x: +G.veh.x.toFixed(1), z: +G.veh.z.toFixed(1),
      street: G.world.nearestRoad(G.veh.x, G.veh.z)?.name || '', tris: A.stats()?.tris | 0 });
  })()`);
  await sleep(220);
  await evaluate(`(() => { const A = window.AYLMER; for (let i = 0; i < 8; i++) { A.step(1/60); } A.render(); })()`);
  await sleep(180);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
  const file = `${outdir}/${name}${far ? '-far' : ''}${lod ? '-lodnear' : ''}${farBake ? '-farbake' : ''}.jpg`;
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  log(name.padEnd(20), info, '->', file);
}

console.log('--- console ---');
for (const l of logs.slice(-40)) console.log(l);
await send('Page.close').catch(() => {});
ws.close();
process.exit(logs.some((l) => l.startsWith('[EXCEPTION]')) ? 1 : 0);
