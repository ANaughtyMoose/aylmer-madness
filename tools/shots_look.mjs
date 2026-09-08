// Screenshot the Wave 5 look — the borrowed models, the real-texture atlas and
// the photographic facades — in ONE boot.
//
//   python3 -m http.server 8281 --bind 127.0.0.1
//   CDP_PORT=9250 node tools/shots_look.mjs http://127.0.0.1:8281/index.html docs/shots
//
// This is tools/shots_landmarks.mjs with a different VIEWS table and no LOD
// switches: the things it looks at are not hero bakes, they are ordinary
// streets, ordinary houses and the two addresses that got a photograph.
//
// Quality matters here in a way it does not for the landmarks, because the
// whole wave is behind the tier: at 'low' there are no borrowed models and the
// atlas is the drawn one. --quality=low shoots the fallback so the pair can be
// compared. The setting is applied from the MENU, before the world is baked,
// because the trees are baked geometry and the atlas is chosen once.
const url = process.argv[2] || 'http://127.0.0.1:8281/index.html';
const outdir = process.argv[3] || 'docs/shots';
const qArg = process.argv.find((a) => a.startsWith('--quality='));
const quality = qArg ? qArg.slice(10) : 'high';
const suffix = quality === 'high' ? '' : '-' + quality;
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const sizeArg = process.argv.find((a) => /^--size=\d+x\d+$/.test(a));
const [VW, VH] = sizeArg ? sizeArg.slice(7).split('x').map(Number) : [1280, 800];
const CDP_PORT = Number(process.env.CDP_PORT || 9222);

// [key, camera x, z, target x, z, cam, snapToRoad]. `cam` indexes main.js's
// CAMS: 0 is the chase camera, 3 the hood camera — as close to a driver's eye
// as the game has, and the right one for looking at a wall.
//
// The two facade cameras stand on the OUTWARD NORMAL of the wall the photograph
// is on (src/game/facades.js, checked by tools/smoke_facades.mjs), not on a
// hand-guessed offset from the centroid: 299 Chemin Fraser faces west off its
// own footprint, 75 Denise-Friend faces south onto the street.
const VIEWS = [
  // 299 Chemin Fraser — front wall mid (926.3, 145.1), outward normal (-1.00, 0.09)
  ['look-facade-299',   912.4, 146.3,  926.3, 145.1, 3, 0],
  ['look-facade-299-a', 906.0, 152.0,  926.3, 145.1, 0, 0],
  // 75 rue Denise-Friend — front wall mid (-720.6, -459.1), outward normal (0.08, 1.00)
  ['look-facade-75',   -719.6, -451.0, -720.6, -459.1, 3, 0],
  ['look-facade-75-a', -712.0, -448.0, -720.6, -459.1, 0, 0],
  // Street trees, bins and the bench: down rue Denise-Friend, which is
  // residential the whole way and therefore carries the borrowed maples.
  ['look-models',      -800.0, -443.0, -688.0, -455.0, 3, 1],
  ['look-models-a',    -640.0, -457.0, -790.0, -444.0, 3, 1],
  // Brick, siding, shingle, asphalt, kerb and lawn in one frame.
  ['look-atlas',        700.0,  189.0,  902.0,  167.0, 3, 1],
  ['look-atlas-a',     -890.0, -434.0, -800.0, -443.0, 3, 1],
];

const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
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
log('quality:', await evaluate(
  `JSON.stringify(window.AYLMER.settings({ quality: '${quality}' }))`, 60000)
  .catch((e) => 'could not set: ' + e.message));
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
  const file = `${outdir}/${name}${suffix}.jpg`;
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  log(name.padEnd(20), info, '->', file);
}

console.log('--- console ---');
for (const l of logs.slice(-40)) console.log(l);
await send('Page.close').catch(() => {});
ws.close();
process.exit(logs.some((l) => l.startsWith('[EXCEPTION]')) ? 1 : 0);
