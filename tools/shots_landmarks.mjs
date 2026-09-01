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
const [VW, VH] = sizeArg ? sizeArg.slice(7).split('x').map(Number) : [1280, 800];

// [key, camera x, z, yaw looking at the target, height, pitch]
// yaw is the game's: 0 looks toward +Z, and it turns the way the car turns.
const VIEWS = [
  ['pwhs-approach', 6800, -7900, 3.14, 3.0, -0.02],
  ['pwhs-entrance', 6800, -7952, 3.14, 2.0, 0.03],
  ['pwhs-lot', 6752, -8092, 2.2, 2.2, 0.02],
  ['pwhs-wing', 6660, -8060, 1.4, 2.2, 0.02],
  ['heritage-approach', 5648, -6928, 2.35, 3.0, 0.0],
  ['heritage-atrium', 5590, -6836, 1.9, 2.0, 0.05],
  ['heritage-rotunda', 5572, -6892, 2.5, 1.9, 0.06],
  ['heritage-lot', 5620, -6760, 4.1, 2.4, 0.0],
  ['mike-front', -406, 56, 1.57, 1.8, 0.02],
  ['mike-couch', -404, 50, 1.35, 1.8, 0.30],
  ['mike-corner', -404, 30, 2.0, 2.0, 0.03],
  ['lordaylmer', -408, 62, 4.71, 2.0, 0.02],
  ['symmesinn', -1518, -22, 3.14, 1.9, 0.03],
  ['british', -916, -150, 0.0, 1.9, 0.03],
  ['marina', -1760, 6, 3.6, 2.0, 0.02],
  ['symmesjr', -318, 410, 3.14, 2.0, 0.02],
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
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = await import('node:fs');
fs.mkdirSync(outdir, { recursive: true });

await send('Storage.clearDataForOrigin', { origin: new URL(url).origin, storageTypes: 'all' });
await send('Page.navigate', { url });
await sleep(1500);

// #start opens the start-point picker, not the game: pick the first point,
// confirm, then wait for drive mode.
console.log('boot:', await evaluate(`(async () => {
  const b = document.getElementById('start'); if (!b) return 'no #start';
  b.click();
  await new Promise(r => setTimeout(r, 500));
  const p = document.getElementById('startpoints');
  if (p && p.children[0]) p.children[0].click();
  await new Promise(r => setTimeout(r, 120));
  document.getElementById('startconfirm')?.click();
  for (let i = 0; i < 400; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (window.AYLMER?.G?.mode === 'drive') return 'drive after ' + (i * 100) + ' ms';
  }
  return 'stuck at mode=' + window.AYLMER?.G?.mode;
})()`));

console.log('env:', await evaluate(`window.AYLMER.env('day')`));

for (const [name, x, z, yaw, h, pitch] of VIEWS) {
  if (only && !only.split(',').some((k) => name.startsWith(k))) continue;
  // Park the car out of shot, then drive the camera by hand. G.camOverride is
  // not a thing, so the vehicle IS the camera rig: teleport it, then push the
  // free camera onto the same spot.
  const info = await evaluate(`(() => {
    const A = window.AYLMER, G = A.G;
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
  console.log(name.padEnd(20), info, '->', file);
}

console.log('--- console ---');
for (const l of logs.slice(-40)) console.log(l);
await send('Page.close').catch(() => {});
ws.close();
process.exit(logs.some((l) => l.startsWith('[EXCEPTION]')) ? 1 : 0);
