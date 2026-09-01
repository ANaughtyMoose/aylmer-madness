// The four-point memory measurement from docs/VERIFY.md, in one run.
// Boots the real game in a headless Chrome (same protocol as headless.mjs),
// then teleports the car to each point, lets the sim run long enough for the
// chunks to come in, forces a full GC and reads the heap and GPU-buffer totals.
// Usage: node tools/measure_memory.mjs [url] [--drive N]   (N = sim seconds per point)
// Requires: "Google Chrome" --headless=new --remote-debugging-port=9222 --use-angle=swiftshader
const url = process.argv[2] || 'http://localhost:8123/index.html';
const driveIdx = process.argv.indexOf('--drive');
const SIM = driveIdx > 0 ? Number(process.argv[driveIdx + 1]) : 3;   // sim seconds per point

const POINTS = [
  ['driveway', 932.9, 143.9],      // 299 Chemin Fraser
  ['galeries', -18.9, -331.2],     // Galeries d'Aylmer
  ['hull', 9510, -3364],           // Place du Portage
  ['champlain', 6311, -1107],      // Ottawa end of the Champlain Bridge deck
  ['parlement', 10668, -3330],     // Parliament Hill — the far east edge
];

const list = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(list.webSocketDebuggerUrl);
await new Promise((res) => (ws.onopen = res));
let id = 0; const pending = new Map(); const logs = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params }));
});
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXCEPTION] ' + (m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text));
  else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error')) logs.push('[error] ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  else if (m.method === 'Runtime.consoleAPICalled' && /^(world|sector):/.test(m.params.args[0]?.value || '')) logs.push('[log] ' + m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 160));
};
await send('Runtime.enable'); await send('Page.enable'); await send('HeapProfiler.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const measure = async (label) => {
  await send('HeapProfiler.collectGarbage');
  await sleep(300);
  await send('HeapProfiler.collectGarbage');
  const h = await send('Runtime.getHeapUsage');
  const page = await evaluate(`(() => { const G = window.AYLMER.G, s = G.world.stats;
    return { gpuMB: +(G.renderer.gpuBytes / 1e6).toFixed(0), resident: s.resident, chunks: G.world.chunks.length,
      drawn: s.chunks, x: Math.round(G.veh.x), z: Math.round(G.veh.z), sector: G.world.sectors ? G.world.sectors.loaded() : 'n/a' }; })()`);
  const row = { point: label, heapMB: Math.round(h.usedSize / 1e6), heapTotalMB: Math.round(h.totalSize / 1e6), ...page };
  console.log(JSON.stringify(row));
  return row;
};

let code = 0;
try {
  await send('Storage.clearDataForOrigin', { origin: new URL(url).origin, storageTypes: 'all' });
  await send('Page.navigate', { url });
  await sleep(1500);
  const boot = await evaluate(`(async () => {
    const b = document.getElementById('start'); if (!b) return 'no #start'; b.click();
    let go = null;
    for (let i = 0; i < 20 && !go; i++) { await new Promise(r => setTimeout(r, 100));
      const c = document.getElementById('startconfirm'); if (c && !c.disabled && c.getBoundingClientRect().width > 0) go = c; }
    if (go) go.click();
    for (let i = 0; i < 600; i++) { await new Promise(r => setTimeout(r, 100)); if (window.AYLMER?.G?.mode === 'drive') return 'drive after ' + (i * 100) + ' ms'; }
    return 'mode=' + window.AYLMER?.G?.mode;
  })()`);
  console.log('boot:', boot);
  if (!/^drive/.test(boot)) throw new Error('did not reach drive');
  const dl = await evaluate(`(() => { const r = performance.getEntriesByType('resource'); return +(r.reduce((s,x)=>s+(x.transferSize||0),0)/1e6).toFixed(1); })()`);
  console.log('downloaded MB:', dl, ' buildMs:', await evaluate('window.AYLMER.G.buildMs ?? null'));
  const rows = [];
  for (const [label, x, z] of POINTS) {
    // Escape swallows the new-game story card; a teleport with the card up still
    // works but the sim would not step. Then SIM seconds of sim so the chunk
    // fade and anything distance-triggered has had its chance to run.
    await evaluate(`(async () => { const A = window.AYLMER; document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
      A.teleport(${x}, ${z}, 0);
      const n = Math.round(${SIM} * 60);
      for (let i = 0; i < n; i++) { A.step(1/60); if (i % 20 === 0) { A.render(); await new Promise(r => setTimeout(r, 0)); } }
      A.render(); })()`);
    await sleep(500);
    rows.push(await measure(label));
  }
  console.log('\nsummary: ' + rows.map((r) => `${r.point} ${r.heapMB} MB heap / ${r.gpuMB} MB gpu`).join(' · '));
} catch (e) { console.log('HARNESS ERROR:', e.message); code = 1; }
for (const l of logs) console.log(l);
if (logs.some((l) => l.startsWith('[EXCEPTION]') || l.startsWith('[error]'))) code = 1;
await send('Page.close').catch(() => {});
ws.close(); process.exit(code);
