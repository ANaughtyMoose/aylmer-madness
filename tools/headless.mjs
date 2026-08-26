// Headless smoke run of the real game in Chrome over the DevTools protocol.
// No dependencies: Node >= 22 (global WebSocket) and a Chrome started with
//   "Google Chrome" --headless=new --remote-debugging-port=9222 --use-angle=swiftshader
// Usage: node tools/headless.mjs [url] [seconds] [screenshot.png] [--script file.js]
// Prints every console message / uncaught exception, boots the game (click DRIVE),
// steps the sim for `seconds` of game time, runs an optional script in the page
// (it can use window.AYLMER), and writes a screenshot.
const url = process.argv[2] || 'http://localhost:8123/index.html';
const seconds = Number(process.argv[3] || 3);
const shot = process.argv[4] || '';
const scriptIdx = process.argv.indexOf('--script');
const script = scriptIdx > 0 ? await import('node:fs').then((fs) => fs.readFileSync(process.argv[scriptIdx + 1], 'utf8')) : '';

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
    const txt = m.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
    logs.push(`[${m.params.type}] ${txt}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    const fr = (d.stackTrace?.callFrames || []).slice(0, 4).map((f) => `${f.functionName || '?'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`).join(' < ');
    logs.push(`[EXCEPTION] ${d.text} ${d.exception?.description?.split('\n')[0] || ''} @${d.url}:${d.lineNumber} ${fr}`);
  } else if (m.method === 'Log.entryAdded') {
    const e = m.params.entry;
    if (e.level === 'error' || e.level === 'warning') logs.push(`[${e.level}] ${e.text} ${e.url || ''}`);
  }
};
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

const evaluate = async (expression, awaitPromise = true) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = null;
try {
await send('Page.navigate', { url });
await sleep(1500);
const boot = await evaluate(`(async () => {
  const b = document.getElementById('start'); if (!b) return 'no #start';
  b.click();
  for (let i = 0; i < 200; i++) { await new Promise(r => setTimeout(r, 100)); if (window.AYLMER?.G?.mode === 'drive') return 'drive after ' + (i * 100) + ' ms'; }
  return 'mode=' + window.AYLMER?.G?.mode;
})()`);
console.log('boot:', boot);
// Step the sim deterministically, then let a few real frames render.
const stepped = await evaluate(`(() => { const A = window.AYLMER; if (!A) return 'no AYLMER';
  const n = Math.round(${seconds} * 60); for (let i = 0; i < n; i++) A.step(1/60); A.render();
  const G = A.G, v = G.veh; return JSON.stringify({ mode: G.mode, fps: Math.round(G.fps), x: +v.x.toFixed(1), z: +v.z.toFixed(1), car: G.carId, time: +G.time.toFixed(2) }); })()`);
console.log('after steps:', stepped);
await sleep(800);
if (script) {
  const out = await evaluate(`(async () => { ${script} })()`);
  console.log('script:', typeof out === 'string' ? out : JSON.stringify(out, null, 1));
}
if (shot) {
  // .jpg / .jpeg asks Chrome for JPEG instead — a 1280x800 PNG of the game is
  // 300-800 KB, which is more than docs/shots wants to carry.
  const jpeg = /\.jpe?g$/i.test(shot);
  const png = await send('Page.captureScreenshot',
    jpeg ? { format: 'jpeg', quality: 82 } : { format: 'png' });
  const fs = await import('node:fs'); fs.writeFileSync(shot, Buffer.from(png.data, 'base64'));
  console.log('screenshot:', shot);
}
} catch (e) { failed = e; console.log('HARNESS ERROR:', e.message); }
if (failed && shot) { try { const png = await send('Page.captureScreenshot', { format: 'png' }); (await import('node:fs')).writeFileSync(shot, Buffer.from(png.data, 'base64')); console.log('screenshot:', shot); } catch {} }
console.log('menu text:', await evaluate(`document.getElementById('menuinner')?.innerText.slice(0, 300)`).catch(() => ''));
console.log(`--- console (${logs.length}) ---`);
for (const l of logs) console.log(l);
await send('Page.close').catch(() => {});
ws.close();
process.exit(failed || logs.some((l) => l.startsWith('[EXCEPTION]') || l.startsWith('[error]')) ? 1 : 0);
