// The named-pose capture: one boot of the real game in headless Chrome
// (SwiftShader, so pixels are deterministic), then every (pose, environment)
// the caller asked for, saved as <out>/<pose>__<env>.png plus a .json sidecar
// and a manifest.json for the run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { startServer, startChrome, Page, boot, CLEAR_SCRIPT, SHIM, ports, gitSha, sleep, ROOT } from './rig.mjs';
import { loadPoses, resolve } from './poses.mjs';

const VW = 1280, VH = 800;
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');

// Everything the page does for one (pose, env): returns the info the sidecar keeps.
export const PLACE = (pose, env, settle) => `(async () => {
  const A = window.AYLMER, G = A.G, Q = window.__qa, W = G.world, p = ${JSON.stringify(pose)}, env = ${JSON.stringify(env)};
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const CAM = { chase: 0, close: 1, far: 2, hood: 3 };
  Q.useSeed();
  G.time = 0;                                      // the job pillars pulse with G.time, and the boot ran a variable number of real frames
  Q.setEnv(env);
  let car;
  if (p.kind === 'eye') {
    const rd = W.nearestRoad(p.x, p.z);          // the world streams around the car: keep it on the road under the eye
    await A.teleport(rd.x, rd.z, 0); car = { x: rd.x, z: rd.z, road: rd.name, roadDist: +rd.dist.toFixed(1) };
    G.cam = 0; Q.camera(null);
  } else {
    await A.teleport(p.x, p.z, p.yaw); car = { x: p.x, z: p.z };
    G.cam = CAM[p.camera] ?? 0; Q.camera(null);
  }
  G.mode = 'drive'; G.veh.vx = 0; G.veh.vz = 0; G.veh.speed = 0;
  if (W.sectors) await W.sectors.update(car.x, car.z);
  Q.noDraw(true);
  const every = p.kind === 'eye' ? 3 : 1;      // the chase camera eases toward the car one render at a time: give it every frame
  for (let i = 0; i < ${settle}; i++) { A.step(1 / 60); if (i % every === 0) A.render(); if (i % 40 === 0) await tick(); }
  Q.setEnv(env);                                   // re-assert: the clock moved a little while settling
  Q.useSeed();                                     // the final frames start from the same random stream whatever came before
  const gy = G.phys && G.phys.groundY ? G.phys.groundY(p.x, p.z) : 0;
  let y = null;
  if (p.kind === 'eye') { y = gy + p.eye; Q.camera({ x: p.x, y, z: p.z, yaw: p.yaw, pitch: p.pitch, fov: p.fov }); }
  Q.noDraw(false);
  A.render();
  return JSON.stringify({ car, ground: +gy.toFixed(2), y: y == null ? null : +y.toFixed(2), envKey: G.envKey, weather: A.weather().key, cam: G.cam });
})()`;

export const MEASURE = `(() => {
  const A = window.AYLMER, G = A.G; A.render();
  const gl = G.renderer.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let n = 0, s = 0, s2 = 0;
  for (let i = 0; i < buf.length; i += 4 * 97) { const l = 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2]; n++; s += l; s2 += l * l; }
  const m = s / n;
  const shown = [...document.body.children].filter((e) => e.id !== 'gl' && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0).map((e) => e.id || e.tagName);
  return JSON.stringify({ mean: +m.toFixed(1), std: +Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(1), cinema: A.cinema.active, shown, tris: G.renderer.stats.tris | 0, draws: G.renderer.stats.draws | 0, w, h });
})()`;

export async function capturePoses({ posesArg, envArg, look = '', tag = 'run', out, task = null, settle = 120, log = console.log } = {}) {
  const P = loadPoses();
  const { jobs } = resolve(P, posesArg, envArg);
  if (!jobs.length) throw new Error('nothing to capture');
  const { srv, cdp } = ports();
  fs.mkdirSync(out, { recursive: true });
  log(`capture: ${jobs.length} shot(s) -> ${out}`);
  const server = await startServer(srv);
  const ch = await startChrome({ gpu: false, port: cdp, w: VW, h: VH });
  const page = await Page.open(cdp, { w: VW, h: VH });
  const results = [];
  let failed = false;
  try {
    const q = new URLSearchParams({ review: 'qa' }); if (look) q.set('look', look);
    const b = await boot(page, `http://127.0.0.1:${srv}/index.html?${q}`);
    log(`booted: drive after ${b.seconds} s`);
    await page.eval(CLEAR_SCRIPT);
    log('shim:', await page.eval(SHIM));
    await page.eval(`window.__qa.freeze(); window.__qa.hud(false); window.__qa.fixTime = 100; 'ok'`);   // fixTime: clouds and water do not depend on the wall clock
    // One real frame first so the lazily built objects (avatars, reactive world) exist, then hide the crowd.
    await page.eval(`(() => { window.AYLMER.step(1 / 60); window.AYLMER.render(); return 1; })()`);
    log('crowd hidden:', await page.eval(`JSON.stringify(window.__qa.crowd(false))`));
    // From here the game must not run its own frames: every frame is one we ask for.
    await page.eval(`window.requestAnimationFrame = () => 0; 'ok'`);
    const sha = gitSha(ROOT);
    for (const j of jobs) {
      const name = `${j.pose.id}__${j.envId}`;
      const t0 = Date.now();
      let info;
      try { info = JSON.parse(await page.eval(PLACE(j.pose, j.env, settle), 600000)); }
      catch (e) { log('FAIL ', name, e.message); results.push({ pose: j.pose.id, env: j.envId, ok: false, why: e.message }); continue; }
      await sleep(150);
      const px = JSON.parse(await page.eval(MEASURE));
      // Eye poses are cropped to the reference's aspect; chase poses are the full frame the player sees.
      let clip;
      if (j.pose.kind === 'eye') {
        const [aw, ah] = j.pose.crop.split(':').map(Number), asp = aw / ah;
        const cw = Math.round(Math.min(VW, VH * asp)), chh = Math.round(cw / asp);
        clip = { x: Math.round((VW - cw) / 2), y: Math.round((VH - chh) / 2), width: cw, height: chh, scale: 1 };
      } else clip = { x: 0, y: 0, width: VW, height: VH, scale: 1 };
      const buf = await page.screenshot(clip);
      const why = [];
      if (px.std < 6) why.push('flat frame (luma std ' + px.std + ')');
      if (px.cinema) why.push('cinema card still up');
      if (px.shown.length) why.push('overlay visible: ' + px.shown.join(','));
      fs.writeFileSync(path.join(out, name + '.png'), buf);
      const side = { schema: 'aylmer-qa-shot', version: 1, pose: j.pose.id, env: j.envId, env_label: j.env.label, tag, look: look || null,
        commit: sha, captured: new Date().toISOString(), pose_in: j.pose, placed: info, frame: { clip, luma_mean: px.mean, luma_std: px.std, tris: px.tris, draws: px.draws, md5: md5(buf) },
        ref: j.pose.ref || null, problems: why };
      fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(side, null, 1));
      log((why.length ? 'WARN ' : 'OK   ') + name.padEnd(36), `std ${px.std}`, `tris ${px.tris}`, `${((Date.now() - t0) / 1000).toFixed(1)} s`, why.join('; '));
      results.push({ pose: j.pose.id, env: j.envId, ok: !why.length, file: path.relative(ROOT, path.join(out, name + '.png')), why: why.join('; '), md5: side.frame.md5 });
    }
  } catch (e) { log('HARNESS ERROR:', e.message); failed = true; }
  const errs = page.errors.slice();
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ schema: 'aylmer-qa-run', tag, look: look || null, task, commit: gitSha(ROOT), when: new Date().toISOString(), poses: posesArg, env: envArg || null, results, pageErrors: errs }, null, 1));
  log(`page errors: ${errs.length}`); for (const e of errs.slice(0, 10)) log('  ' + e);
  await page.close(); await ch.stop(); await server.stop();
  const bad = results.filter((r) => !r.ok).length;
  log(`done: ${results.length - bad} ok, ${bad} failed or flagged`);
  return { failed: failed || results.length === 0, results, errors: errs, out };
}
