// Screenshot every borrowed model out of the model lab, one boot for all of
// them.
//
//   cd <worktree> && python3 -m http.server 8181 --bind 127.0.0.1 &
//   CDP_PORT=9226 node tools/shots_models.mjs [port] [outdir]
//
// This exists because a converted model that is the wrong scale, faces the
// wrong way, floats above the ground or reads as a grey blob looks exactly like
// a correct one from its triangle count, its bounds and its licence block. The
// only check is looking at it, and the lab puts a 1 m grid and the geometry the
// game builds today beside it so that looking is worth something.
const PORT = process.argv[2] || '8181';
const OUT = process.argv[3] || 'docs/shots';
const CDP = process.env.CDP_PORT || '9222';
const PAGE = `http://localhost:${PORT}/src/game/models_lab.html`;

// The angle each thing is recognised from. A tree is a silhouette and wants a
// low camera; a vehicle wants three-quarter front, which is where a nose that
// points the wrong way is obvious.
// The camera sits at yaw a and looks back at the origin, so world +x is screen
// RIGHT only while a is near 0. The lab puts the converted model at -x, and at
// a = 2.3 the two swap sides and the caption lies. Every angle here is < PI/2,
// which also means a vehicle is seen from its +Z end — its NOSE, which is where
// a model that turned the wrong way is obvious.
const VIEW = {
  default: [0.7, -0.22, 1.0],
  'pickup-ranger': [0.62, -0.20, 0.92],
  'city-bus': [0.62, -0.17, 0.95],
  'school-bus': [0.62, -0.17, 0.95],
  'sedan-saturn': [0.62, -0.20, 0.92],
  'hatch-civic': [0.62, -0.20, 0.92],
  'coupe-sunfire': [0.62, -0.20, 0.92],
  'wagon-forester': [0.62, -0.20, 0.92],
  'van-sienna': [0.62, -0.20, 0.92],
  'police-cruiser': [0.62, -0.20, 0.92],
  'stop-sign': [0.5, -0.12, 0.85],
  'park-bench': [0.75, -0.28, 0.85],
  'lamp-post': [0.9, -0.10, 0.85],
  'hydro-pole': [0.9, -0.12, 0.9],
  'garbage-can': [0.7, -0.25, 0.75],
};
// The stats panel overlaps a tall model, and the numbers it shows are printed to
// the console beside every path anyway.
const HIDE_UI = true;
const ROAD = new Set(['pickup-ranger', 'city-bus', 'school-bus', 'sedan-saturn', 'hatch-civic',
  'coupe-sunfire', 'wagon-forester', 'van-sienna', 'police-cruiser',
  'stop-sign', 'lamp-post', 'dumpster']);

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
      const t = await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })
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
  throw new Error(`no usable Chrome target on :${CDP}`);
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
  ready = await evaluate('window.LAB && window.LAB.ready ? "ok" : "waiting"').catch(() => 'waiting');
}
if (ready !== 'ok') { console.log('lab never came up'); console.log(logs.join('\n')); process.exit(1); }
const slugs = await evaluate('window.LAB.slugs');
console.log(`lab up: ${slugs.length} models`);

const fs = await import('node:fs');
fs.mkdirSync(OUT, { recursive: true });
for (const slug of slugs) {
  const [yaw, pitch, zoom] = VIEW[slug] || VIEW.default;
  await evaluate(`window.LAB.select(${JSON.stringify(slug)});`
    + ` window.LAB.ground(${JSON.stringify(ROAD.has(slug) ? 'road' : 'grass')});`
    + ` window.LAB.compare(true); window.LAB.view(${yaw}, ${pitch}, ${zoom});`
    + ` document.getElementById('ui').style.display = ${HIDE_UI ? "'none'" : "''"}; 1`);
  // select()/ground()/compare() each rebuild, so set the view LAST and give the
  // renderer a few real frames before asking for pixels.
  await sleep(700);
  const png = await S('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
  const path = `${OUT}/models-${slug}.jpg`;
  fs.writeFileSync(path, Buffer.from(png.data, 'base64'));
  const stats = await evaluate('window.LAB.stats');
  console.log(`${path}\n    ${String(stats).replace(/\n/g, ' | ')}`);
}
if (logs.length) console.log('--- console ---\n' + logs.slice(0, 30).join('\n'));
await S('Page.close').catch(() => {});
ws.close();
process.exit(0);
