#!/usr/bin/env node
// A-06 acceptance in the real game: speed cues, slow-mo on a crash and on a
// long jump, the race card footer, and T doing nothing at speed unless stuck.
//
//   node tools/qa/feel_a06.mjs [--entry=index]
//
// Own server (CMP_SRV_PORT, default 8193), own headless Chrome (CMP_CDP_PORT,
// default 9493), GPU on (software WebGL stalls under load), throwaway profile; both are closed on exit. The sim is
// stepped through window.AYLMER.step, never on the page's own rAF.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startChrome, Page, boot, CLEAR_SCRIPT, ports, arg, done, ROOT } from './lib/rig.mjs';

const entry = String(arg('entry', 'index'));
const { srv, cdp } = ports();
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/aylmer-compare/poses.json'), 'utf8')).poses.chase_chemin_aylmer;

const server = await startServer(srv);
const ch = await startChrome({ gpu: true, port: cdp });
const page = await Page.open(cdp);
const out = {};
let fail = 0;
const check = (name, ok, info) => { out[name] = { ok: !!ok, ...info }; if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  ${JSON.stringify(info)}`); };
try {
  await boot(page, `http://127.0.0.1:${srv}/${entry}.html?review=feel`);
  await page.eval(CLEAR_SCRIPT);
  await page.eval(`window.requestAnimationFrame = () => 0; 'ok'`);
  // A helper in the page: put the car at speed along its heading.
  await page.eval(`(() => { window.__fx = {
    at(x, z, yaw, kmh) { const A = window.AYLMER, v = A.G.veh; A.teleport(x, z, yaw);
      for (let i = 0; i < 30; i++) A.step(1 / 60);
      const s = kmh / 3.6; v.vLong = s; v.vLat = 0; v.vx = Math.sin(v.yaw) * s; v.vz = Math.cos(v.yaw) * s; },
    key(code, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true })); },
  }; return 1; })()`);

  // 1. Speed: FOV delta and the wind layer at 100 km/h.
  const sp = JSON.parse(await page.eval(`(() => { const A = window.AYLMER, G = A.G, F = window.__fx;
    F.at(${P.x}, ${P.z}, ${P.yaw}, 100); F.key('KeyW', true);
    let k = 0; for (let i = 0; i < 20; i++) { A.step(1 / 60); A.render(); k = Math.max(k, G.veh.speedKmh); }
    F.key('KeyW', false);
    const f = A.feel(); return JSON.stringify({ kmh: +G.veh.speedKmh.toFixed(1), speedFov: +f.speedFov.toFixed(3), wind: f.wind }); })()`));
  check('speed-fov', sp.kmh >= 95 && sp.speedFov >= 0.2, sp);
  check('wind-layer', sp.wind && sp.wind.wind > 0.3 && sp.wind.windGain > 0.01, sp.wind);

  // 2. T at speed, not stuck: nothing happens.
  const tr = JSON.parse(await page.eval(`(() => { const A = window.AYLMER, G = A.G, F = window.__fx;
    F.at(${P.x}, ${P.z}, ${P.yaw}, 80); F.key('KeyW', true);
    const path = []; let jump = 0, px = G.veh.x, pz = G.veh.z;
    for (let i = 0; i < 40; i++) { if (i === 10) F.key('KeyT', true); if (i === 12) F.key('KeyT', false);
      A.step(1 / 60); const d = Math.hypot(G.veh.x - px, G.veh.z - pz); jump = Math.max(jump, d); px = G.veh.x; pz = G.veh.z; }
    F.key('KeyW', false);
    return JSON.stringify({ stuck: A.feel().stuck, maxStepM: +jump.toFixed(2), kmh: +G.veh.speedKmh.toFixed(1) }); })()`));
  check('t-gated', !tr.stuck && tr.maxStepM < 1.5 && tr.kmh > 40, tr);

  // 3. A 2 s jump: drop the car from height and count the slow-mo.
  const jp = JSON.parse(await page.eval(`(() => { const A = window.AYLMER, G = A.G, F = window.__fx;
    F.at(${P.x}, ${P.z}, ${P.yaw}, 0); for (let i = 0; i < 200; i++) A.step(1 / 60);
    const before = G.feel.jump, v = G.veh; v.y += 21; v.vy = 0;
    let air = 0; for (let i = 0; i < 240; i++) { A.step(1 / 60); if (v.inAir) air += 1 / 60; }
    return JSON.stringify({ air: +air.toFixed(2), fired: G.feel.jump - before }); })()`));
  check('jump-slowmo', jp.air >= 1.6 && jp.fired >= 1, jp);

  // 4. A crash at speed: aimed square off the road at Principale, as the
  // harness crash beat does, floored from 70 km/h.
  const cr = JSON.parse(await page.eval(`(async () => { const A = window.AYLMER, G = A.G, F = window.__fx;
    const PL = (await import('/src/game/places.js')).PLACES;
    const tries = [];
    for (const place of ['principale', 'marina', 'gas']) for (const side of [1, -1]) {
      const a = PL[place], o = PL.marina === a ? PL.principale : PL.marina;
      const r = G.nav && G.nav.route(a.x, a.z, o.x, o.z); if (!r || r.length < 2) continue;
      const h = Math.atan2(r[1][0] - r[0][0], r[1][1] - r[0][1]) + Math.PI / 2 * side;
      G.slowmo.cool = 0; const before = G.feel.crash; G.veh.repair && G.veh.repair();
      F.at(r[0][0] - Math.sin(h) * 25, r[0][1] - Math.cos(h) * 25, h, 70); F.key('KeyW', true);
      let maxImpact = 0;
      for (let i = 0; i < 360 && G.feel.crash === before; i++) { A.step(1 / 60); maxImpact = Math.max(maxImpact, G.veh.impact || 0); }
      F.key('KeyW', false);
      tries.push({ place, side, fired: G.feel.crash - before, maxImpact: +maxImpact.toFixed(2) });
      if (G.feel.crash > before) break;
    }
    return JSON.stringify({ tries, slowmo: { ...G.slowmo } }); })()`));
  check('crash-slowmo', cr.tries.some((t) => t.fired > 0), cr);

  // 5. The racedave brief card names the rival (a copy of the def with a
  // non-campaign id, so the story order does not lock it).
  const rc = JSON.parse(await page.eval(`(async () => { const A = window.AYLMER, G = A.G;
    const M = await import('/src/game/missions.js'); const def = M.ALL_MISSIONS.find((m) => m.id === 'racedave');
    if (!def) return JSON.stringify({ err: 'no racedave' });
    A.start({ ...def, id: 'qa_racedave' });
    const t = (document.getElementById('cinematic')?.innerText || '').replace(/\\s+/g, ' ');
    const note = (t.match(/(Course contre[^.]*\\.[^.]*\\.?|Race against[^.]*\\.[^.]*\\.?)/) || [])[0] || '';
    A.cinema.finish && A.cinema.finish(); A.abandon();
    return JSON.stringify({ note, hasAucun: /Aucun chrono/.test(t) }); })()`));
  check('race-footer', /Adam/.test(rc.note || '') && !rc.hasAucun, rc);

  // 6. A-03 wiring: a job that runs out of clock offers a retry, R takes it.
  const rt = JSON.parse(await page.eval(`(async () => { const A = window.AYLMER, G = A.G, F = window.__fx;
    const M = await import('/src/game/missions.js'); const def = M.ALL_MISSIONS.find((m) => m.id === 'racedave');
    F.at(${P.x}, ${P.z}, ${P.yaw}, 0);
    const copy = { ...def, id: 'qa_retry' }; if (!M.ALL_MISSIONS.includes(copy)) M.ALL_MISSIONS.push(copy);
    A.start(copy); A.cinema.finish && A.cinema.finish();
    for (let i = 0; i < 5; i++) A.step(1 / 60);
    if (!G.mission) return JSON.stringify({ err: 'no mission' });
    G.mission.elapsed = 60; G.mission.timeLeft = 0.001;
    for (let i = 0; i < 3; i++) A.step(1 / 60);
    const offer = G.retry ? { reason: G.retry.reason, free: G.retry.free, gag: G.retry.gag } : null;
    const failed = !G.mission;
    F.key('KeyR', true); A.step(1 / 60); F.key('KeyR', false); A.step(1 / 60);
    const back = G.mission ? G.mission.def.id : null;
    A.cinema.finish && A.cinema.finish(); A.abandon();
    return JSON.stringify({ failed, offer, back }); })()`));
  check('retry-wired', rt.failed && rt.offer && rt.back === 'qa_retry', rt);
} catch (e) { console.log('HARNESS: ' + e.message); fail++; }
const errs = page.errors.filter((e) => !/favicon/i.test(e));
console.log(`console errors: ${errs.length}`); for (const e of errs.slice(0, 6)) console.log('   ' + e);
await page.close(); await ch.stop(); await server.stop();
console.log(JSON.stringify({ feel_a06: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.ok])) }));
console.log(fail ? `feel_a06: ${fail} failed` : 'feel_a06: all ok');
done(fail ? 1 : 0);
