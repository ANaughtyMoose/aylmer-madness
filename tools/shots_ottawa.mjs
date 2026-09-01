// Driver's-eye screenshots of the six Ottawa landmarks, one boot for all of them.
//
//   cd <worktree> && python3 -m http.server 8139 --bind 127.0.0.1 &
//   node tools/shots_ottawa.mjs [port] [outdir]
//
// tools/headless.mjs takes one screenshot per browser session, which is fine for
// a single check and wasteful here: the world bake is four seconds and the debug
// Chrome is shared with every other agent on this machine. This boots once,
// teleports to each vantage point and captures, which is one page instead of six.
//
// Vantage points are hand-picked, not derived: each is a spot a car can actually
// be, at the distance and bearing that frames the building the way you first see
// it when you arrive.
const PORT = process.argv[2] || '8139';
const OUT = process.argv[3] || 'docs/shots';
// Not named URL: that would shadow the global URL constructor used just below.
const PAGE = `http://localhost:${PORT}/index.html`;

const VIEWS = [
  // key, camera x, camera z, yaw (0 = +Z south, PI = -Z north), note
  ['parliament', 10920, -3390, 4.597,
    'across the canal from Mackenzie Avenue: Centre Block, the Peace Tower and the Library'],
  ['parliament_wellington', 10700, -3245, 3.1416,
    'northbound on Wellington Street, the way you arrive from the Portage bridge'],
  ['chateau', 11090, -3560, 5.05,
    'Rideau Street at Mackenzie, looking at the Château across the canal locks'],
  ['rideau', 11284, -3620, 3.1416,
    'Rideau Street outside the mall, northbound'],
  ['byward', 11181, -3830, 3.1416,
    'ByWard Market Square, looking up William Street at the market building'],
  ['gallery', 10701, -3800, 3.1416,
    'St. Patrick Street, the National Gallery and the Great Hall'],
  ['stvincent', 9895, -2250, 3.1416,
    'Cambridge Street North outside St. Vincent Hospital'],
];

const send = (ws, pending, method, params = {}) => new Promise((res, rej) => {
  const n = ++send.id;
  pending.set(n, { res, rej });
  ws.send(JSON.stringify({ id: n, method, params }));
});
send.id = 0;

// The debug Chrome on 9222 is shared with every other agent on this machine and
// will drop a freshly-opened target's socket under load, so connecting is a
// retry loop rather than a single call. Every request also carries its own
// deadline: a silently wedged socket used to hang the whole run.
const pending = new Map();
const logs = [];
let ws = null;

async function connect() {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const t = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })
        .then((r) => r.json());
      const sock = new WebSocket(t.webSocketDebuggerUrl);
      let closed = false;
      sock.onclose = () => { closed = true; };
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
        }
      };
      ws = sock;
      // Prove the target is really talking before committing to it.
      await S('Runtime.enable');
      if (closed) throw new Error('closed right after open');
      return;
    } catch (e) {
      console.log(`connect attempt ${attempt + 1} failed: ${e.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('could not get a usable Chrome target on :9222');
}

const S = (method, params) => Promise.race([
  send(ws, pending, method, params),
  new Promise((_, rej) => setTimeout(() => rej(new Error(method + ' timed out')), 180000)),
]);

await connect();
const evaluate = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


await S('Page.enable');
await S('Network.enable');
await S('Network.setCacheDisabled', { cacheDisabled: true });
await S('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await S('Storage.clearDataForOrigin', { origin: new URL(PAGE).origin, storageTypes: 'all' });
await S('Page.navigate', { url: PAGE });
await sleep(2500);

// #start opens the start-point picker, not the game: pick the first point and
// confirm. The picker's own first entry is home, which is where we want to be
// standing when the world finishes baking anyway.
const boot = await evaluate(`(async () => {
  const s = (ms) => new Promise(r => setTimeout(r, ms));
  document.getElementById('start').click();
  await s(700);
  const list = document.getElementById('startpoints');
  if (!list || !list.children.length) return 'no start points';
  list.children[0].click();
  await s(250);
  document.getElementById('startconfirm').click();
  for (let i = 0; i < 400; i++) { await s(100); if (window.AYLMER?.G?.mode === 'drive') return 'drive'; }
  return 'stuck in ' + window.AYLMER?.G?.mode;
})()`);
console.log('boot:', boot);
if (boot !== 'drive') { console.log(logs.join('\n')); process.exit(1); }

// The HUD, the intro card and the key legend all sit on top of the thing we
// came to look at.
await evaluate(`(() => {
  const A = window.AYLMER;
  A.env('day');
  try { A.story.hide(); } catch (e) {}
  try { A.hud.setVisible(false); } catch (e) {}
  document.querySelectorAll('.card,.introcard,.legend,#keys,#story,#hud').forEach(e => { e.style.display = 'none'; });
  return 1;
})()`);

const fs = await import('node:fs');
fs.mkdirSync(OUT, { recursive: true });
for (const [key, x, z, yaw, note] of VIEWS) {
  const info = await evaluate(`(async () => {
    const A = window.AYLMER, G = A.G;
    A.teleport(${x}, ${z}, ${yaw});
    // Two settles: the first lets the world stream the chunks in, the second
    // puts the car back where the first one's physics may have nudged it.
    for (let i = 0; i < 60; i++) A.step(1/60);
    A.teleport(${x}, ${z}, ${yaw});
    for (let i = 0; i < 20; i++) { A.step(1/60); A.render(); }
    await new Promise(r => setTimeout(r, 700));
    A.render();
    const vis = G.props ? G.props.list.filter(p => p.id.startsWith('ott:') && p.visible).map(p => p.id) : [];
    return JSON.stringify({ at: [G.veh.x | 0, G.veh.z | 0], lod: vis, stats: A.stats() });
  })()`);
  const png = await S('Page.captureScreenshot', { format: 'jpeg', quality: 84 });
  const path = `${OUT}/ottawa_${key}.jpg`;
  fs.writeFileSync(path, Buffer.from(png.data, 'base64'));
  const d = JSON.parse(info);
  console.log(`${path}  ${note}`);
  console.log(`    frame ${d.stats.tris} world tris, ${d.stats.drawCalls} draws; ${d.lod.filter((s) => s.includes(key.split('_')[0])).join(' ') || '(no hero prop in range)'}`);
}
if (logs.length) console.log(logs.join('\n'));
await S('Page.close').catch(() => {});
ws.close();
process.exit(0);
