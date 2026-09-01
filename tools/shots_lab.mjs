// Screenshot every Ottawa landmark out of the lab page, one boot for all six.
//
//   cd <worktree> && python3 -m http.server 8139 --bind 127.0.0.1 &
//   node tools/shots_lab.mjs [port] [outdir]
//
// The full game is the real test and tools/shots_ottawa.mjs is how you run it;
// those shots are docs/shots/ottawa_<key>.jpg and these are ottawa_<key>_lab.jpg,
// because both are worth keeping. But the game's world bake becomes minutes
// when the machine is loaded, which makes iterating on a roofline impossible.
// The lab page (src/game/ottawa_lab.html) builds one landmark and nothing else,
// so this boots in about a second regardless.
const PORT = process.argv[2] || '8139';
const OUT = process.argv[3] || 'docs/shots';
const PAGE = `http://localhost:${PORT}/src/game/ottawa_lab.html`;

// key, yaw, pitch, zoom, lod — the angle each building is recognised from.
const SHOTS = [
  ['parliament', 0.15, 0.10, 1.0, 'near'],
  ['chateau', 0.9, 0.12, 1.0, 'near'],
  ['rideau', 0.4, 0.10, 1.0, 'near'],
  ['byward', 0.9, 0.10, 0.85, 'near'],
  ['gallery', 2.1, 0.10, 1.0, 'near'],
  ['stvincent', 0.5, 0.10, 1.0, 'near'],
];

let ws = null, seq = 0;
const pending = new Map();
const logs = [];
const raw = (method, params = {}) => new Promise((res, rej) => {
  const n = ++seq;
  pending.set(n, { res, rej });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const S = (method, params) => Promise.race([
  raw(method, params),
  new Promise((_, rej) => setTimeout(() => rej(new Error(method + ' timed out')), 120000)),
]);

async function connect() {
  for (let i = 0; i < 8; i++) {
    try {
      const t = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })
        .then((r) => r.json());
      const sock = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((res, rej) => {
        sock.onopen = res;
        sock.onerror = () => rej(new Error('socket error'));
        setTimeout(() => rej(new Error('open timed out')), 8000);
      });
      sock.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) {
          const p = pending.get(m.id); pending.delete(m.id);
          m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
          return;
        }
        if (m.method === 'Runtime.exceptionThrown') {
          logs.push('[EXCEPTION] ' + (m.params.exceptionDetails.exception?.description || '').split('\n')[0]);
        } else if (m.method === 'Runtime.consoleAPICalled') {
          logs.push('[' + m.params.type + '] '
            + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
        }
      };
      ws = sock;
      await S('Runtime.enable');
      return;
    } catch (e) {
      console.log(`connect ${i + 1}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('no usable Chrome target on :9222');
}

const evaluate = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await connect();
await S('Page.enable');
await S('Network.setCacheDisabled', { cacheDisabled: true });
await S('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await S('Page.navigate', { url: PAGE });

let ready = '';
for (let i = 0; i < 90 && ready !== 'ok'; i++) {
  await sleep(1000);
  ready = await evaluate('window.LAB ? "ok" : "waiting"').catch(() => 'waiting');
}
if (ready !== 'ok') { console.log('lab never came up'); console.log(logs.join('\n')); process.exit(1); }
console.log('lab up:', await evaluate('JSON.stringify(window.LAB.keys)'));

const fs = await import('node:fs');
fs.mkdirSync(OUT, { recursive: true });
for (const [key, yaw, pitch, zoom, lod] of SHOTS) {
  const stats = await evaluate(
    `(() => { window.LAB.show(${JSON.stringify(key)}, ${JSON.stringify(lod)}, 'driver');`
    + ` window.LAB.view(${yaw}, ${pitch}, ${zoom}); return window.LAB.show(${JSON.stringify(key)}, ${JSON.stringify(lod)}, 'driver'); })()`);
  // LAB.show rebuilds, so re-apply the framing and let a few frames land.
  await evaluate(`window.LAB.chrome(false); window.LAB.view(${yaw}, ${pitch}, ${zoom})`);
  await sleep(900);
  const png = await S('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
  const path = `${OUT}/ottawa_${key}_lab.jpg`;
  fs.writeFileSync(path, Buffer.from(png.data, 'base64'));
  console.log(`${path}\n    ${String(stats).replace(/\n/g, ' | ')}`);
}
if (logs.length) console.log('--- console ---\n' + logs.slice(0, 20).join('\n'));
await S('Page.close').catch(() => {});
ws.close();
process.exit(0);
