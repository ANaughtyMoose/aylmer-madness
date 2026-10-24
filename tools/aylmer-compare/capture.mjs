// Aylmer compare, capture v2: "Street View eye" game shots for every VERIFIED
// reference in references/places/_manifest/core-refs.json.
//
//   node tools/aylmer-compare/capture.mjs [--only=slug,slug] [--keep-open]      (reference mode, below)
//   node tools/aylmer-compare/capture.mjs --poses=core,chase --env=noon,golden --tag=before [--look=-flag] [--out=dir] [--task=V1-01]
//
// NAMED-POSE MODE (any --poses=): the visual wave's capture. Poses, sets and
// environments come from tools/aylmer-compare/poses.json; the work is in
// tools/qa/lib/capture-run.mjs. Output: <out>/<pose>__<env>.png + .json, and a
// manifest.json. Default <out> is references/places/_feedback/visual-wave/<task or _adhoc>/<tag>/
// in CMP_REF_ROOT. --look=X is passed to the game as ?look=X. Ports from
// CMP_SRV_PORT (default 8193) and CMP_CDP_PORT (default 9493).
//
// REFERENCE MODE (no --poses): the original v2 capture described next.
//
// What it does, in one boot of the real game in headless Chrome:
//  - starts its OWN static server (port 8131) and its OWN headless Chrome
//    (port 9341, throwaway profile), and closes both at the end, whatever happens
//  - boots the game, finishes the cold open and every cinema card, unpauses,
//    hides the HUD and every overlay (window.AYLMER.hideHud), forces summer day
//    and clear weather
//  - for each reference: converts the Street View lat/lng with the same
//    projection tools/build_map.py uses, stands a free camera there
//    (window.AYLMER.devCam) at 2.5 m eye height with the reference heading,
//    pitch and field of view, no car drawn, and screenshots a frame cropped to
//    the reference's aspect ratio
//  - rejects a shot that is flat (near-zero variance), identical to another
//    shot or to the old title card, or taken with an overlay up
//  - writes references/places/<slug>/<SHOTS>/<ref>__game_<stamp>.png
//    plus a .json sidecar (pose used, game x/z, commit, pose quality)
//
// Projection (tools/build_map.py, also MAP.origin in src/game/mapdata.js):
//   x = (lng - 75.8355 W) * 111320 * cos(45.394 deg), z = -(lat - 45.394) * 110574
//   x is east, z is SOUTH. Checked on 299 chemin Fraser: its pano point lands
//   on Chemin Fraser 28 m west of building 460808559 (c 932.9, 143.9), and the
//   reference looks east (heading 90) straight at it.
// Heading: Street View heading h is compass degrees clockwise from north. The
// game camera (src/core/math.js compose, src/core/gl.js begin) looks along
// (-sin yaw, sin pitch, -cos yaw), so looking at compass h means yaw = -h.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
if (process.argv.some((a) => a === '--poses' || a.startsWith('--poses='))) {
  const { arg, done } = await import('../qa/lib/rig.mjs');
  const { reportRoot } = await import('../qa/lib/poses.mjs');
  const { capturePoses } = await import('../qa/lib/capture-run.mjs');
  const tag = arg('tag', 'run'), task = arg('task', null);
  const out = path.resolve(arg('out', null) || path.join(reportRoot(task), tag));
  const r = await capturePoses({ posesArg: arg('poses'), envArg: arg('env'), look: arg('look', ''), tag, out, task });
  done(r.failed || r.results.some((x) => !x.ok) ? 1 : 0);
}
const ROOT = path.resolve(HERE, '../..');
const PLACES = path.join(ROOT, 'references/places');
const CORE = path.join(PLACES, '_manifest/core-refs.json');
const TITLE_CARD = path.join(PLACES, '_previous/game-shots-v1');   // old bad shots live here
const SRV_PORT = Number(process.env.CMP_SRV_PORT || 8193);
const CDP_PORT = Number(process.env.CMP_CDP_PORT || 9493);
const VW = 1280, VH = 800;
const EYE = 2.5;
const SHOTS = process.env.CMP_SHOTS_DIR || 'game-shots-v3';   // v3: shots taken on the build with the opening (v2 are the older ones)
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const keepOpen = process.argv.includes('--keep-open');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

function commit() {
  try {
    const head = fs.readFileSync(path.join(ROOT, '.git/HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return head;
    const ref = head.slice(5);
    const f = path.join(ROOT, '.git', ref);
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
    const packed = fs.readFileSync(path.join(ROOT, '.git/packed-refs'), 'utf8');
    const line = packed.split('\n').find((l) => l.endsWith(' ' + ref));
    return line ? line.split(' ')[0] : 'unknown';
  } catch { return 'unknown'; }
}

// Image size from the file header (JPEG SOF or PNG IHDR), no dependencies.
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return { w: 4, h: 3 };
}

const MX = 111320 * Math.cos(45.394 * Math.PI / 180), MZ = 110574;
const proj = (lat, lng) => [(lng + 75.8355) * MX, -(lat - 45.394) * MZ];

// Known hashes the shot must never equal: every old v1 shot (all the title card).
const banned = new Set();
const walk = (d) => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) {
  const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.png')) banned.add(md5(fs.readFileSync(p))); } };
walk(TITLE_CARD);
for (const s of fs.readdirSync(PLACES)) walk(path.join(PLACES, s, 'game-shots'));

// numeric OSM polygon ids from the facade study, used to aim approximate shots
const polyIds = {};
try {
  for (const f of JSON.parse(fs.readFileSync(path.join(ROOT, 'gemini-inbox/look/facades/facades.json'), 'utf8')).facades)
    if (typeof f.polygon_id === 'number') polyIds[f.slug] = f.polygon_id;
} catch {}

// The detached garage at 1 rue Arial has no OSM footprint of its own (the
// facade study calls it 'detached_garage_1_arial'); every garage photo shows it
// beside the house, so its shots aim at the house lot.
if (!polyIds['1-rue-arial-garage'] && polyIds['1-rue-arial-house']) polyIds['1-rue-arial-garage'] = polyIds['1-rue-arial-house'];
const core = JSON.parse(fs.readFileSync(CORE, 'utf8'));
const jobs = [];
for (const place of core.places) {
  if (only.length && !only.includes(place.slug)) continue;
  for (const ref of place.refs || []) {
    if (ref.verified === false) continue;
    const abs = path.join(ROOT, ref.file);
    if (!fs.existsSync(abs)) { console.log('MISSING ref file', ref.file); continue; }
    const pose = ref.pose || {};
    jobs.push({ slug: place.slug, name: place.name, building: place.building_latlng || null,
      poly: polyIds[place.slug] || null, file: ref.file, size: imageSize(abs),
      lat: pose.lat ?? null, lng: pose.lng ?? null, heading: pose.heading ?? null,
      pitch: pose.pitch ?? null, fov: pose.fov ?? null, source: pose.pose_source || 'missing',
      free: !!pose.free, eye: pose.eye ?? null, alt: pose.alt ?? null });
  }
}
// References that carry exactly the same pose (same pano point, heading, pitch
// and fov) get the same frame, and that is not a capture fault; count them.
for (const j of jobs) j.poseKey = [j.lat, j.lng, j.heading, j.pitch, j.fov, j.size.w / j.size.h].join('|');
for (const j of jobs) j.shared = j.lat == null ? 1 : new Set(jobs.filter((k) => k.poseKey === j.poseKey).map((k) => k.file)).size;
console.log('jobs:', jobs.length, 'from', core.places.length, 'places');

// ----------------------------------------------------------------- processes
const kids = [];
const killAll = () => { for (const k of kids) { try { k.kill('SIGTERM'); } catch {} } };
process.on('exit', killAll);
process.on('SIGINT', () => { killAll(); process.exit(130); });
// node tools/serve.mjs, not python http.server: that one drops connections under this game's parallel module loads.
const srv = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), String(SRV_PORT)], { cwd: ROOT, stdio: 'ignore' });
kids.push(srv);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aylmer-cmp-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--use-angle=swiftshader',
  `--window-size=${VW},${VH}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--mute-audio', 'about:blank'], { stdio: 'ignore' });
kids.push(chrome);
let ver = null;
for (let i = 0; i < 40 && !ver; i++) { await sleep(500); ver = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then((r) => r.json()).catch(() => null); }
if (!ver) { console.log('chrome did not start'); process.exit(1); }

const tab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res) => (ws.onopen = res));
let nid = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; logs.push('[EXCEPTION] ' + d.text + ' ' + (d.exception?.description || '').split('\n')[0]); }
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('[error] ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
};
const send = (method, params = {}) => new Promise((res, rej) => { const n = ++nid; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression, ms = 240000) => {
  const r = await Promise.race([send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + expression.slice(0, 50))), ms))]);
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

const results = [];
let exitCode = 0;
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  const url = `http://127.0.0.1:${SRV_PORT}/index.html`;
  await send('Storage.clearDataForOrigin', { origin: new URL(url).origin, storageTypes: 'all' });
  await send('Page.navigate', { url });
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    const ready = await evaluate("document.readyState + '|' + !!document.getElementById('start')", 20000).catch(() => '');
    if (String(ready).startsWith('complete|true')) { console.log('document ready', i + 1, 's'); break; }
  }
  for (let i = 0; i < 40; i++) { const ok = await evaluate("!!(window.AYLMER && window.AYLMER.G)", 30000).catch(() => false); if (ok) break; await sleep(3000); }
  // New builds: EMBARQUE plays the opening and the start picker is behind "Balade libre"; old builds: EMBARQUE opens the picker.
  await evaluate("(() => { const f = document.getElementById('btnFree'); if (f) { f.hidden = false; f.click(); } else document.getElementById('start').click(); return 'ok'; })()", 240000);
  await sleep(1500);
  await evaluate("document.getElementById('startpoints').children[0]?.click(); 'ok'", 240000);
  await sleep(400);
  await evaluate("document.getElementById('startconfirm').click(); 'ok'", 240000);
  let mode = '';
  for (let i = 0; i < 90; i++) {
    await sleep(4000);
    mode = await evaluate("window.AYLMER?.G?.mode || 'none'", 60000).catch(() => 'err');
    if (mode === 'drive') { console.log('drive after', (i + 1) * 4, 's'); break; }
  }
  if (mode !== 'drive') throw new Error('never reached drive mode: ' + mode);

  // Finish the cold open ("Ete 2004 ... 299, chemin Fraser") and whatever card
  // its onDone opens next (the first job's brief), then make sure it is gone.
  // The committed build may have no window.AYLMER.devCam / hideHud (src/main.js hooks): install them from outside.
  const { SHIM } = await import('../qa/lib/rig.mjs');
  await evaluate(`(() => { const A = window.AYLMER; if (typeof A.devCam === 'function') return 'native'; ${SHIM.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')};
    A.devCam = (o) => { window.__qa.camera(o); return o; }; A.hideHud = (on = true) => window.__qa.hud(!on); return 'shimmed'; })()`);
  const cleared = await evaluate(`(async () => {
    const A = window.AYLMER, G = A.G;
    for (let i = 0; i < 40; i++) {
      if (A.cinema.active) A.cinema.finish();
      if (A.story && A.story.active && A.story.hide) A.story.hide();
      await new Promise((r) => setTimeout(r, 150));
      if (!A.cinema.active && i > 6) break;
    }
    A.cinema.hide();
    A.pause(false);
    for (const id of ['story', 'pause', 'bigmap', 'options', 'garage', 'radio']) document.getElementById(id)?.classList.add('hidden');
    G.mode = 'drive';
    G.cam = 0;
    A.hud.setVisible(false);
    A.hideHud(true);
    A.env('day'); A.weather('clear');
    if (G.traffic && G.traffic.cars) G.traffic.cars.length = 0;   // this session only: no car parked across a facade
    const shown = [...document.body.children].filter((e) => e.id !== 'gl' && getComputedStyle(e).visibility !== 'hidden'
      && e.getBoundingClientRect().width > 0).map((e) => e.id || e.tagName);
    return JSON.stringify({ cinema: A.cinema.active, mode: G.mode, shown, hasDevCam: typeof A.devCam === 'function' });
  })()`);
  console.log('cleared:', cleared);
  if (!JSON.parse(cleared).hasDevCam) throw new Error('window.AYLMER.devCam missing: the dev-only hook in src/main.js is not loaded');

  const sha = commit();
  const seen = new Map();
  for (const j of jobs) {
    // The clip is the reference's aspect ratio inside the 1280x800 frame, and
    // the vertical field of view is worked out so the clip's WIDTH spans the
    // reference's horizontal fov. A phone photo with no fov gets 69 deg on its
    // long side (a 26 mm equivalent lens).
    const aspect = j.size.w / j.size.h;
    let cw = Math.min(VW, VH * aspect), ch = cw / aspect;
    cw = Math.round(cw); ch = Math.round(ch);
    let hfovDeg = j.fov;
    let fovNote = 'reference fov';
    if (hfovDeg == null) {
      if (aspect >= 1) hfovDeg = 69; else hfovDeg = 2 * Math.atan(Math.tan(69 * Math.PI / 360) * aspect) * 180 / Math.PI;
      fovNote = 'assumed 69 deg on long side';
    }
    const focal = (cw / 2) / Math.tan(hfovDeg * Math.PI / 360);
    const fovy = 2 * Math.atan((VH / 2) / focal);
    const camLL = j.lat != null && j.lng != null ? proj(j.lat, j.lng) : null;
    const bld = j.building ? proj(j.building[0], j.building[1]) : null;
    const args = JSON.stringify({ camLL, bld, poly: j.poly, heading: j.heading, pitch: j.pitch, guess: j.source === 'guess', source: j.source, free: j.free, alt: j.alt, fovy, hfov: hfovDeg, EYE: j.alt != null ? j.alt : (j.eye || EYE), shared: j.shared });
    let info;
    try {
      info = JSON.parse(await evaluate(`(async () => {
        const A = window.AYLMER, G = A.G, W = G.world;
        const o = ${args};
        const { MAP } = await import('/src/game/mapdata.js');
        const inside = (b, x, z) => { let c = false; const p = b.p; for (let i = 0, k = p.length - 1; i < p.length; k = i++) {
          const [xi, zi] = p[i], [xk, zk] = p[k]; if ((zi > z) !== (zk > z) && x < (xk - xi) * (z - zi) / (zk - zi) + xi) c = !c; } return c; };
        const near = (x, z, r) => MAP.buildings.filter((b) => Math.abs(b.c[0] - x) < r && Math.abs(b.c[1] - z) < r);
        const inBuilding = (x, z) => near(x, z, 80).find((b) => inside(b, x, z)) || null;
        // The thing the reference is about, for aiming when the heading is not known.
        let target = null, targetHow = '';
        if (o.poly) { const b = MAP.buildings.find((b) => b.id === o.poly); if (b) { target = b.c; targetHow = 'osm ' + o.poly; } }
        if (!target && o.bld) {
          const b = inBuilding(o.bld[0], o.bld[1]);
          if (b) { target = b.c; targetHow = 'footprint at building_latlng ' + b.id; }
          else { target = o.bld; targetHow = 'building_latlng point'; }
        }
        const reasons = [];
        let cx, cz, yaw, quality = 'streetview';
        // A Street View camera stands in the roadway. A pose point more than 8 m
        // off a road centreline, inside a footprint, or within 12 m of the
        // building it is supposed to be photographing is the index's TARGET
        // point (the building), not the pano, so it is not trusted as a camera.
        const rawRoad = o.camLL ? W.nearestRoad(o.camLL[0], o.camLL[1]).dist : null;
        const camOk = (x, z) => W.nearestRoad(x, z).dist <= 8 && !inBuilding(x, z)
          && !(target && o.poly && Math.hypot(target[0] - x, target[1] - z) < 12);
        // Consistency test: from a real pano, the building the photo is about
        // has to be inside the reference's field of view. If it is not, the
        // pose point is not where the photo was taken, so the camera is put on
        // the road behind the BUILDING along the reference heading instead.
        let offFrame = null;
        if (o.camLL && o.heading != null && !o.guess && o.poly && target) {
          const brg = (Math.atan2(target[0] - o.camLL[0], -(target[1] - o.camLL[1])) * 180 / Math.PI + 360) % 360;
          const diff = Math.abs(((brg - o.heading + 540) % 360) - 180);
          if (diff > o.hfov / 2 + 15) offFrame = diff;   // 15 deg: a house is wide, its edge can be in frame
        }
        if (o.free && o.camLL && o.heading != null) { cx = o.camLL[0]; cz = o.camLL[1]; reasons.push('free camera: pose point trusted, no road snap'); }
        else if (offFrame != null) {
          quality = 'approximate';
          reasons.push('building ' + offFrame.toFixed(0) + ' deg off the reference heading from the pose point: camera put on the road behind the building along the heading');
          const h = o.heading * Math.PI / 180, dx = Math.sin(h), dz = -Math.cos(h);
          let found = null;
          for (let d = 6; d <= 120 && !found; d += 1) { const x = target[0] - dx * d, z = target[1] - dz * d;
            if (W.nearestRoad(x, z).dist < 3 && !inBuilding(x, z)) found = [x, z]; }
          if (!found) { const r = W.nearestRoad(target[0], target[1]); found = [r.x, r.z]; reasons.push('no road on the heading line, nearest road used'); }
          [cx, cz] = found;
        } else if (o.camLL && camOk(o.camLL[0], o.camLL[1])) { cx = o.camLL[0]; cz = o.camLL[1]; }
        else if (o.camLL && o.heading != null) {
          // The pose point is in a house or off the road (often it is the
          // building coordinate, not the pano): back off along the reference
          // heading until the camera stands on a road.
          quality = 'approximate'; reasons.push(inBuilding(o.camLL[0], o.camLL[1]) ? 'pose point inside a building'
            : rawRoad > 8 ? 'pose point ' + rawRoad.toFixed(0) + ' m off the road' : 'pose point is the building itself, not the pano');
          const h = o.heading * Math.PI / 180, dx = Math.sin(h), dz = -Math.cos(h);
          let found = null;
          // Search the heading line both ways, nearest first: backwards (the
          // pano stood behind the photo) as far as 120 m, forwards only 30 m
          // and never when the pose point is the building itself.
          const fwdOk = !inBuilding(o.camLL[0], o.camLL[1]);
          for (let d = 0; d <= 120 && !found; d += 1) {
            for (const sgn of fwdOk && d <= 30 ? [-1, 1] : [-1]) {
              const x = o.camLL[0] + sgn * dx * d, z = o.camLL[1] + sgn * dz * d; const r = W.nearestRoad(x, z);
              if (!found && r.dist < 3 && !inBuilding(x, z)) found = [x, z];
            }
          }
          if (!found) { const r = W.nearestRoad(o.camLL[0], o.camLL[1]); found = [r.x, r.z]; reasons.push('no road on the heading line, nearest road used'); }
          [cx, cz] = found; reasons.push('camera moved onto the nearest road along the reference heading line');
        } else {
          quality = 'approximate';
          const base = o.camLL || target;
          if (!base) return JSON.stringify({ error: 'no position at all' });
          const r = W.nearestRoad(base[0], base[1]);
          cx = r.x; cz = r.z; reasons.push(o.camLL ? 'pose point off road, nearest road used' : 'no camera position, nearest road to the building');
        }
        if (o.heading != null && !o.guess) yaw = -o.heading * Math.PI / 180;
        else {
          quality = 'approximate';
          const t = target || o.bld;
          if (!t) return JSON.stringify({ error: 'no heading and no target' });
          yaw = Math.atan2(-(t[0] - cx), -(t[1] - cz));
          reasons.push(o.heading == null ? 'no heading, camera faces the building centre' : 'heading is a guess, camera faces the building centre');
        }
        if (o.guess) reasons.push('pose_source guess');
        if (o.source === 'filename') { quality = 'approximate'; reasons.push('position and heading read from the file name, not a recorded pano'); }
        if (o.camLL && o.bld && Math.hypot(o.camLL[0] - o.bld[0], o.camLL[1] - o.bld[1]) < 5) {
          reasons.push('note: pose lat/lng equals the place coordinate (index target point), not a measured pano: the camera may stand closer or farther than the photographer did');
        }
        if (o.shared > 1) { quality = 'approximate'; reasons.push('pose identical to ' + (o.shared - 1) + ' other reference(s): the pose data cannot tell these crops apart'); }
        // pose.alt: an aerial. The eye is alt metres above the ground and, with no pitch recorded, looks down at a point 120 m ahead.
        const pitch = o.alt != null && o.pitch == null ? -Math.atan2(o.alt, 120) : (o.pitch == null ? 4 : o.pitch) * Math.PI / 180;
        if (o.alt != null) reasons.push('aerial: eye ' + o.alt + ' m above the ground');
        else if (o.pitch == null) reasons.push('pitch assumed 4 deg');
        const gy = G.phys && G.phys.groundY ? G.phys.groundY(cx, cz) : 0;
        // The car is not drawn under devCam, but the world draws around it, so
        // park it on the nearest road under the camera.
        const r = W.nearestRoad(cx, cz);
        A.teleport(r.x, r.z, 0);
        G.veh.vx = 0; G.veh.vz = 0; G.veh.speed = 0;
        A.devCam({ x: cx, y: gy + o.EYE, z: cz, yaw, pitch, fov: o.fovy });
        G.mode = 'drive'; A.env('day'); A.weather('clear');
        if (G.traffic && G.traffic.cars) G.traffic.cars.length = 0;
        for (let i = 0; i < 10; i++) A.step(1 / 60);
        A.render(); A.render();
        return JSON.stringify({ x: +cx.toFixed(1), z: +cz.toFixed(1), y: +(gy + o.EYE).toFixed(2), ground: +gy.toFixed(2),
          yawRad: +yaw.toFixed(4), headingUsedDeg: +(((-yaw * 180 / Math.PI) % 360 + 360) % 360).toFixed(1), pitchRad: +pitch.toFixed(4),
          fovyRad: +o.fovy.toFixed(4), road: r.name, roadDist: +W.nearestRoad(cx, cz).dist.toFixed(1),
          target: target ? target.map((v) => +v.toFixed(1)) : null, targetHow, quality, reasons });
      })()`));
    } catch (e) { info = { error: e.message }; }
    if (info.error) { console.log('FAIL', j.slug, path.basename(j.file), info.error); results.push({ ...j, ok: false, why: info.error }); continue; }
    await sleep(250);
    // Render once more and measure the frame in the same task (no
    // preserveDrawingBuffer, so the pixels are only readable before it returns).
    const px = JSON.parse(await evaluate(`(() => {
      const A = window.AYLMER, G = A.G; A.render();
      const gl = G.renderer.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let n = 0, s = 0, s2 = 0, skyish = 0;
      for (let i = 0; i < buf.length; i += 4 * 97) { const l = 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2]; n++; s += l; s2 += l * l; }
      const m = s / n;
      const shown = [...document.body.children].filter((e) => e.id !== 'gl' && getComputedStyle(e).visibility !== 'hidden'
        && e.getBoundingClientRect().width > 0).map((e) => e.id || e.tagName);
      return JSON.stringify({ mean: +m.toFixed(1), std: +Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(1), cinema: A.cinema.active, shown, tris: A.stats()?.tris | 0 });
    })()`));
    const clip = { x: Math.round((VW - cw) / 2), y: Math.round((VH - ch) / 2), width: cw, height: ch, scale: 1 };
    const shot = await send('Page.captureScreenshot', { format: 'png', clip });
    const buf = Buffer.from(shot.data, 'base64');
    const h = md5(buf);
    const why = [];
    if (px.std < 6) why.push('flat frame (luma std ' + px.std + ')');
    if (px.cinema) why.push('cinema card still up');
    if (px.shown.length) why.push('overlay visible: ' + px.shown.join(','));
    if (banned.has(h)) why.push('identical to an old title-card shot');
    if (seen.has(h) && seen.get(h).key !== j.poseKey) why.push('identical to ' + seen.get(h).rel + ' (a different pose)');
    const base = path.basename(j.file).replace(/\.[^.]+$/, '');
    const outDir = path.join(PLACES, j.slug, SHOTS);
    fs.mkdirSync(outDir, { recursive: true });
    let name = `${base}__game_${stamp()}`;
    let k = 2; while (fs.existsSync(path.join(outDir, name + '.png'))) name = `${base}__game_${stamp()}_${k++}`;
    const rel = path.relative(ROOT, path.join(outDir, name + '.png'));
    if (why.length) { console.log('REJECT', j.slug, base, why.join('; ')); results.push({ ...j, ok: false, why: why.join('; ') }); continue; }
    if (!seen.has(h)) seen.set(h, { rel, key: j.poseKey });
    fs.writeFileSync(path.join(outDir, name + '.png'), buf);
    const side = {
      schema: 'aylmer-compare-shot', version: 2, slug: j.slug, reference: j.file, game_shot: rel,
      captured: new Date().toISOString(), commit: sha,
      pose_quality: info.quality, pose_notes: info.reasons,
      pose_in: { lat: j.lat, lng: j.lng, heading: j.heading, pitch: j.pitch, fov: j.fov, pose_source: j.source },
      camera: { x: info.x, z: info.z, y: info.y, ground_y: info.ground, eye_height_m: j.alt != null ? j.alt : (j.eye || EYE), yaw_rad: info.yawRad,
        heading_deg: info.headingUsedDeg, pitch_rad: info.pitchRad, fovy_rad: info.fovyRad, hfov_deg: +hfovDeg.toFixed(1), fov_note: fovNote,
        road: info.road, road_dist_m: info.roadDist },
      target: info.target, target_how: info.targetHow,
      frame: { window: [VW, VH], clip, ref_size: [j.size.w, j.size.h], luma_mean: px.mean, luma_std: px.std, tris: px.tris, md5: h },
      env: 'day', weather: 'clear', hud: 'hidden', car: 'not drawn', traffic: 'cleared for the shot',
    };
    fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(side, null, 1));
    console.log('OK  ', j.slug.padEnd(26), base.slice(0, 40).padEnd(40), info.quality.padEnd(11), `x${info.x} z${info.z} h${info.headingUsedDeg}`, 'std', px.std);
    results.push({ ...j, ok: true, shot: rel, quality: info.quality });
  }
} catch (e) { console.log('HARNESS ERROR:', e.message); exitCode = 1; }

fs.writeFileSync(path.join(PLACES, '_feedback/capture-last-run.json'), JSON.stringify({ when: new Date().toISOString(), results, console: logs }, null, 1));
console.log('--- page errors:', logs.length); for (const l of logs.slice(-20)) console.log(l);
const ok = results.filter((r) => r.ok).length;
console.log(`done: ${ok} ok, ${results.length - ok} failed or rejected`);
if (!keepOpen) { await send('Page.close').catch(() => {}); try { ws.close(); } catch {} }
killAll();
await sleep(500);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(exitCode);
