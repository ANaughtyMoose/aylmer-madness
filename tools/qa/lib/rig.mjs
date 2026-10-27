// Shared rig for the QA tools: a static server, a headless Chrome with a
// throwaway profile, a CDP connection, the boot-to-drive sequence, and the
// page-side camera shim. Everything it starts, it closes (exit, SIGINT, SIGTERM,
// uncaught error), and nothing is left on screen.
//
// Ports come from the environment so many agents can run side by side:
//   CMP_SRV_PORT  static server (node tools/serve.mjs; python http.server drops
//                 connections under this game's parallel module loads)
//   CMP_CDP_PORT  Chrome remote-debugging port
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
export const CHROME = process.env.CMP_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function arg(name, dflt = null, argv = process.argv) {
  const a = argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return dflt;
  return a.includes('=') ? a.slice(name.length + 3) : true;
}
export const ports = () => ({
  srv: Number(process.env.CMP_SRV_PORT || 8193),
  cdp: Number(process.env.CMP_CDP_PORT || 9493),
});
export const stamp = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};
export function gitSha(cwd = ROOT) {
  try {
    const head = fs.readFileSync(path.join(cwd, '.git'), 'utf8').trim();   // a worktree: .git is a file
    const gd = head.startsWith('gitdir: ') ? head.slice(8) : path.join(cwd, '.git');
    const h = fs.readFileSync(path.join(gd, 'HEAD'), 'utf8').trim();
    if (!h.startsWith('ref: ')) return h.slice(0, 12);
    const ref = h.slice(5);
    for (const base of [gd, path.join(gd, '../..')]) {
      const f = path.join(base, ref);
      if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim().slice(0, 12);
    }
    const pr = path.join(gd, '../..', 'packed-refs');
    if (fs.existsSync(pr)) { const l = fs.readFileSync(pr, 'utf8').split('\n').find((x) => x.endsWith(' ' + ref)); if (l) return l.split(' ')[0].slice(0, 12); }
  } catch {}
  return 'unknown';
}

// ------------------------------------------------------------------ cleanup
const kids = [];
const dirs = [];
let cleaned = false;
export function cleanup() {
  if (cleaned) return; cleaned = true;
  for (const k of kids) { try { k.kill('SIGTERM'); } catch {} }
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  for (const f of cleanups) { try { f(); } catch {} }
}
const cleanups = [];
export const onCleanup = (f) => cleanups.push(f);
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { cleanup(); process.exit(130); });
process.on('uncaughtException', (e) => { console.error('UNCAUGHT', e); cleanup(); process.exit(1); });

// ------------------------------------------------------------------- server
export async function startServer(port = ports().srv) {
  const k = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), String(port)], { cwd: ROOT, stdio: 'ignore' });
  kids.push(k);
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`http://127.0.0.1:${port}/index.html`, { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
    if (ok) return { port, kill: () => { try { k.kill('SIGTERM'); } catch {} },
      stop: async () => { try { k.kill('SIGTERM'); } catch {} for (let i = 0; i < 40; i++) { const up = await fetch(`http://127.0.0.1:${port}/index.html`, { method: 'HEAD' }).then(() => true).catch(() => false); if (!up) return; await sleep(250); } } };
    await sleep(250);
  }
  throw new Error('server did not start on ' + port);
}

// ------------------------------------------------------------------- chrome
// gpu:false -> SwiftShader (software, deterministic pixels, never for timing)
// gpu:true  -> ANGLE on Metal (real GPU, the only valid timing source)
export async function startChrome({ gpu = false, port = ports().cdp, w = 1280, h = 800 } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aylmer-qa-'));
  dirs.push(profile);
  const flags = ['--headless=new', `--remote-debugging-port=${port}`, `--window-size=${w},${h}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  if (gpu) flags.push('--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu',
    '--disable-gpu-vsync', '--disable-frame-rate-limit');
  // [w8-courseproof] --enable-unsafe-swiftshader: Chrome 156 deprecates the silent software
  // fallback and warns without it. CMP_CHROME_NO_SANDBOX=1 adds --no-sandbox (a VM user
  // without user namespaces, e.g. root on Colab), the same switch as review/harness.mjs.
  else flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  if (process.env.CMP_CHROME_NO_SANDBOX === '1') flags.push('--no-sandbox');
  flags.push('about:blank');
  const k = spawn(CHROME, flags, { stdio: 'ignore' });
  kids.push(k);
  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) { await sleep(500); ver = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null); }
  if (!ver) throw new Error('chrome did not start on ' + port);
  // stop(): kill and wait until the debug port is really closed, so the next tool can reuse it
  const stop = async () => { try { k.kill('SIGTERM'); } catch {} for (let i = 0; i < 40; i++) { const up = await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true).catch(() => false); if (!up) return; await sleep(250); } };
  return { port, profile, version: ver.Browser, kill: () => { try { k.kill('SIGTERM'); } catch {} }, stop };
}

// --------------------------------------------------------------------- page
export class Page {
  constructor(ws) { this.ws = ws; this.nid = 0; this.pending = new Map(); this.logs = []; this.errors = []; }
  static async open(port, { w = 1280, h = 800, dpr = 1 } = {}) {
    const tab = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('cdp socket failed')); });
    const p = new Page(ws); p.tabId = tab.id; p.port = port;
    ws.onmessage = (ev) => p._msg(JSON.parse(ev.data));
    await p.send('Runtime.enable'); await p.send('Page.enable'); await p.send('Log.enable');
    await p.send('Network.enable'); await p.send('Network.setCacheDisabled', { cacheDisabled: true });
    await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
    p.w = w; p.h = h; p.dpr = dpr;
    return p;
  }
  _msg(m) {
    if (m.id && this.pending.has(m.id)) { const q = this.pending.get(m.id); this.pending.delete(m.id); m.error ? q.rej(new Error(m.error.message)) : q.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails; const t = '[EXCEPTION] ' + d.text + ' ' + (d.exception?.description || '').split('\n')[0];
      this.logs.push(t); this.errors.push(t);
    } else if (m.method === 'Runtime.consoleAPICalled') {
      const t = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      this.logs.push(`[${m.params.type}] ${t}`);
      if (m.params.type === 'error') this.errors.push('[error] ' + t);
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      if (e.level === 'error') { const t = `[log-error] ${e.text} ${e.url || ''}`; this.logs.push(t); this.errors.push(t); }
    }
  }
  send(method, params = {}) { return new Promise((res, rej) => { const n = ++this.nid; this.pending.set(n, { res, rej }); this.ws.send(JSON.stringify({ id: n, method, params })); }); }
  async eval(expression, ms = 240000) {
    const r = await Promise.race([this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + expression.slice(0, 60))), ms))]);
    if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async screenshot(clip) {
    const s = await this.send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' });
    return Buffer.from(s.data, 'base64');
  }
  async close() { await this.send('Page.close').catch(() => {}); try { this.ws.close(); } catch {} }
}

// --------------------------------------------------------------------- boot
// Navigate and press DRIVE the way a player does (EMBARQUE, start point, GO).
export async function boot(page, url, { entry = 'index', timeoutS = 900 } = {}) {
  const origin = new URL(url).origin;
  await page.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }).catch(() => {});
  await page.send('Page.navigate', { url });
  // The machine is often loaded by other agents (load average 50+ seen): every wait here is generous.
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const ready = await page.eval("document.readyState + '|' + !!document.getElementById('start')", 120000).catch(() => '');
    if (String(ready).startsWith('complete|true')) break;
    if (i === 299) throw new Error('page never produced #start');
  }
  for (let i = 0; i < 100; i++) { if (await page.eval('!!(window.AYLMER && window.AYLMER.G)', 120000).catch(() => false)) break; await sleep(3000); }
  const menuOk = await page.eval(`!!window.AYLMER && !!document.getElementById('start')`, 120000).catch(() => false);
  const t0 = Date.now();
  // New builds play an opening on EMBARQUE ("Nouvelle partie"); the start picker sits behind "Balade libre", which is
  // hidden until the opening has been seen. Take that door when it exists, else the old EMBARQUE-opens-the-picker flow.
  for (let i = 0; i < 60; i++) { if (await page.eval("!!(window.AYLMER && window.AYLMER.G)", 120000).catch(() => false)) break; await sleep(3000); }
  await page.eval("(() => { const f = document.getElementById('btnFree'); if (f) { f.hidden = false; f.click(); } else document.getElementById('start').click(); return 'ok'; })()", 300000);
  await sleep(1500);
  await page.eval("document.getElementById('startpoints')?.children[0]?.click(); 'ok'", 300000);
  await sleep(400);
  await page.eval("document.getElementById('startconfirm')?.click(); 'ok'", 300000);
  let mode = '';
  for (let i = 0; i < Math.ceil(timeoutS / 2); i++) {
    await sleep(2000);
    mode = await page.eval("window.AYLMER?.G?.mode || 'none'", 300000).catch(() => 'err');
    if (mode === 'drive') return { menu: menuOk, mode, seconds: +((Date.now() - t0) / 1000).toFixed(1) };
  }
  throw new Error('never reached drive mode: ' + mode);
}

// Finish the cold open and every card, unpause, force a clear summer noon, and
// clear the roads so nothing parks across a facade.
export const CLEAR_SCRIPT = `(async () => {
  const A = window.AYLMER, G = A.G;
  for (let i = 0; i < 40; i++) {
    if (A.cinema.active) A.cinema.finish();
    if (A.story && A.story.active && A.story.hide) A.story.hide();
    await new Promise((r) => setTimeout(r, 150));
    if (!A.cinema.active && i > 6) break;
  }
  A.cinema.hide(); A.pause(false);
  for (const id of ['story', 'pause', 'bigmap', 'options', 'garage', 'radio']) document.getElementById(id)?.classList.add('hidden');
  G.mode = 'drive';
  // The new game opens on the first job: its marker would stand in every shot and its pinned sky would fight the
  // clock. A.abandon() is the game's own clean way out (closeMission).
  if (G.mission && A.abandon) A.abandon();
  A.cinema.hide(); for (const id of ['story', 'pause', 'bigmap', 'options', 'garage', 'radio']) document.getElementById(id)?.classList.add('hidden');
  G.mode = 'drive';
  if (G.traffic && G.traffic.cars) G.traffic.cars.length = 0;
  return JSON.stringify({ cinema: A.cinema.active, mode: G.mode, mission: G.mission ? G.mission.def.id : null });
})()`;

export function done(code = 0) { cleanup(); process.exit(code); }

// ------------------------------------------------------- page-side QA shim
// The committed build has no window.AYLMER.devCam, and src/main.js is not ours.
// This installs the equivalent from outside, on the renderer instance, with no
// change to the game's code. After it, window.__qa has:
//   camera(o)    o = {x,y,z,yaw,pitch,fov}: a free eye, the car NOT drawn; null: the game camera
//   hud(on)      hide / show every overlay but the canvas
//   crowd(on)    hide / show pedestrians and the four real people (avatars)
//   noDraw(on)   skip every draw call (the sim and camera still run): cheap settling
//   setEnv(e)    instant time of day and weather: {phase, clock?, weather}
//   freeze()     stop ambient traffic from respawning between poses
// How: render() calls r.setGameState(G) after the chase camera is worked out and
// before anything is drawn, so it overwrites G.camPos / G.camYaw there; the
// instance r.begin swaps pitch and fov; the car is sunk 500 m for the draw
// (y and gh; bodyY is a getter on y) and put back in r.end(), so physics never sees it.
export const SHIM = `(() => {
  const A = window.AYLMER, G = A.G, r = G.renderer, Q = (window.__qa = window.__qa || {});
  if (Q.installed) return 'already';
  const proto = Object.getPrototypeOf(r), begin = proto.begin, end = proto.end;
  Q.cam = null; Q.hideCar = false; Q.saved = null; Q.fixTime = null; Q.t = r.time;
  // r.time is the wall clock since the renderer was made and drives the clouds and the water swell: pin it for deterministic frames
  Object.defineProperty(r, 'time', { configurable: true, get() { return Q.fixTime == null ? Q.t : Q.fixTime; }, set(v) { Q.t = v; } });
  r.setGameState = function (g) {
    const c = Q.cam;
    if (c) { g.camPos[0] = c.x; g.camPos[1] = c.y; g.camPos[2] = c.z; g.camYaw = c.yaw; }
    if (Q.hideCar && !Q.saved) { const v = g.veh; Q.saved = [v.y, v.gh]; v.y = -500; v.gh = -500; }
  };
  r.begin = function (p, yaw, pitch, fov, opts) {
    const c = Q.cam;
    return c ? begin.call(this, p, c.yaw, c.pitch, c.fov) : begin.call(this, p, yaw, pitch, fov, opts);
  };
  r.end = function () {
    const out = end.call(this);
    if (Q.saved) { G.veh.y = Q.saved[0]; G.veh.gh = Q.saved[1]; Q.saved = null; }
    return out;
  };
  Q.camera = (o) => { Q.cam = o ? { x: o.x, y: o.y, z: o.z, yaw: o.yaw, pitch: o.pitch || 0, fov: o.fov || 1.0 } : null; Q.hideCar = !!o; return !!o; };
  Q.hud = (on) => { for (const el of document.body.children) if (el.id !== 'gl') el.style.visibility = on ? '' : 'hidden'; try { A.hud.setVisible(!!on); } catch {} };
  Q.crowd = (on) => {
    const peds = G.reactive && G.reactive.peds;
    if (peds) { if (!peds.__qaDraw) peds.__qaDraw = peds.draw; peds.draw = on ? peds.__qaDraw : () => {}; }
    if (G.avatars) { if (!G.avatars.__qaDraw) G.avatars.__qaDraw = G.avatars.draw; G.avatars.draw = on ? G.avatars.__qaDraw : () => {}; }
    return { peds: !!peds, avatars: !!G.avatars };
  };
  Q.noDraw = (on) => { if (on) r.draw = () => {}; else delete r.draw; };
  Q.freeze = () => { if (G.traffic) { G.traffic.update = () => {}; if (G.traffic.cars) G.traffic.cars.length = 0; } };
  Q.setEnv = (e) => {
    A.weather(e.weather || 'clear'); A.env(e.phase);
    if (e.clock != null) { G.dayClock = e.clock * 600; A.step(1 / 60); }
    const a = G.env, b = G.envTarget;
    for (const f of ['sky', 'ground', 'sun', 'lightDir', 'fog']) for (let i = 0; i < a[f].length; i++) a[f][i] = b[f][i];
    a.fogDensity = b.fogDensity * G.q.fogMul;
    return G.envKey;
  };
  // Math.random feeds particles and ambient life: a seeded generator, restarted per pose, makes frames repeatable
  Q.seed = (n = 1) => { let a = (n >>> 0) || 1; Q.rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  Q.seeded = false;
  Q.useSeed = () => { if (!Q.seeded) { Q.seeded = true; Q.seed(1); Math.random = () => Q.rand(); } else Q.seed(1); };
  Q.installed = true; return 'installed';
})()`;
