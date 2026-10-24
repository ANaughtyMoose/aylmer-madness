#!/usr/bin/env node
// Repeatable chase-camera stress poses, with the actual rendered eye saved.
// Baseline mode records missing camera counters honestly; --require-clear
// makes final-eye geometry/framing evidence a gate on the changed build.
// --target-root can serve an untouched baseline using its own existing rig.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d = null) => { const v = process.argv.find(x => x === `--${k}` || x.startsWith(`--${k}=`)); return v ? v.includes('=') ? v.slice(k.length + 3) : true : d; };
const targetRoot = path.resolve(arg('target-root', path.join(HERE, '../..')));
const out = path.resolve(arg('out', path.join(targetRoot, 'scratchpad/camera')));
const entries = String(arg('entries', 'index,prototype')).split(',');
const requireClear = !!arg('require-clear');
const poses = JSON.parse(fs.readFileSync(path.join(HERE, 'camera-poses.json'), 'utf8'));
const { startServer, startChrome, Page, boot, CLEAR_SCRIPT, SHIM, gitSha, done } = await import(pathToFileURL(path.join(targetRoot, 'tools/qa/lib/rig.mjs')));
const srv = Number(process.env.CMP_SRV_PORT || 8245), cdp = Number(process.env.CMP_CDP_PORT || 9545);
if (srv < 8240 || srv > 8299 || cdp < 9540 || cdp > 9599) throw new Error('camera QA requires reserved server/CDP ports');
fs.mkdirSync(out, { recursive: true });
const rows = [], errors = [];
let server, chrome, current = null, phase = 'starting';
const report = () => ({ schema: 'aylmer-camera-qa', revision: gitSha(targetRoot), when: new Date().toISOString(), requireClear,
  provenance: poses.provenance, phase, current, rows, errors,
  ok: phase === 'complete' && errors.length === 0 && rows.length === entries.length * poses.poses.length && rows.every(r => r.ok) });
const checkpoint = () => {
  const file = path.join(out, 'manifest.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(report(), null, 2)); fs.renameSync(file + '.tmp', file);
};
checkpoint();
try {
  server = await startServer(srv); chrome = await startChrome({ gpu: false, port: cdp, w: 1280, h: 800 });
  for (const entry of entries) {
    const page = await Page.open(cdp, { w: 1280, h: 800 });
    try {
      await boot(page, `http://127.0.0.1:${srv}/${entry}.html?review=camera`);
      await page.eval(CLEAR_SCRIPT); await page.eval(SHIM);
      await page.eval(`window.__qa.freeze(); window.__qa.hud(false); window.__qa.fixTime = 100; window.requestAnimationFrame = () => 0; 'ok'`);
      for (const pose of poses.poses) {
        phase = 'capturing'; current = { entry, pose: pose.id }; checkpoint();
        const result = JSON.parse(await page.eval(`(async () => {
          const A = window.AYLMER, G = A.G, p = ${JSON.stringify(pose)};
          window.__qa.useSeed(); G.time = 0; G.devCam = G.cineCam = null;
          await A.teleport(p.x, p.z, p.yaw); await G.world.sectors?.update(p.x, p.z);
          G.cam = p.camera; G.lookBack = false; G.camYaw = p.yaw + Math.PI; G.camClip = null;
          G.camPos[0] = p.x; G.camPos[1] = (G.veh.bodyY || 0) + 5; G.camPos[2] = p.z;
          A.env(p.env); A.camClipStats?.reset();
          for (let i = 0; i < 120; i++) A.render();
          const S = A.camClipStats;
          return JSON.stringify({ pose: p.id, car: { x: G.veh.x, y: G.veh.bodyY, z: G.veh.z, yaw: G.veh.yaw },
            eye: [...G.renderer.eye], followYaw: G.camYaw, viewProjection: [...G.renderer.vp],
            stats: S ? { frames: S.frames, rayBlocked: S.rayBlocked, eyeBlocked: S.eyeBlocked, sphereBlocked: S.sphereBlocked,
              unframed: S.unframed, unknown: S.unknown, clearPct: S.clearPct, maxBlockedSeconds: S.maxBlockedSeconds,
              queries: S.queries, scannedTriangles: S.scannedTriangles, testedTriangles: S.testedTriangles,
              maxQueries: S.maxQueries, maxScannedTriangles: S.maxScannedTriangles, maxTestedTriangles: S.maxTestedTriangles,
              maxBlocks: S.maxBlocks, solveMs: S.solveMs, maxSolveMs: S.maxSolveMs, last: S.last } : null,
            sourceGeometry: G.world.cameraStats || null });
        })()`));
        const name = `${entry}_${pose.id}__${pose.env}`;
        fs.writeFileSync(path.join(out, name + '.png'), await page.screenshot({ x: 0, y: 0, width: 1280, height: 800, scale: 1 }));
        const S = result.stats;
        const ok = !requireClear || !!(S && S.frames >= 120 && S.unknown === 0 && S.clearPct >= 99 && S.eyeBlocked === 0 && S.last.rayClear && S.last.eyeClear && S.last.framed);
        const row = { entry, ...result, input: pose, ok };
        rows.push(row); fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(row, null, 2));
        current = null; phase = 'between-poses'; checkpoint();
        console.log(`${ok ? 'ok' : 'FAIL'} ${entry} ${pose.id} clear=${S?.clearPct ?? 'unknown'} eyeBlocked=${S?.eyeBlocked ?? 'unknown'} framed=${S?.last.framed ?? 'unknown'}`);
      }
      errors.push(...page.errors.filter(e => !/favicon/i.test(e)));
    } finally { await page.close(); }
  }
  current = null; phase = 'complete';
} catch (e) { phase = 'failed'; errors.push('HARNESS: ' + e.message); }
finally { checkpoint(); if (chrome) await chrome.stop(); if (server) await server.stop(); }
const final = report();
console.log(`camera QA: ${final.ok ? 'passed' : 'FAILED'}, ${rows.length} poses, ${errors.length} errors`);
done(final.ok ? 0 : 1);
