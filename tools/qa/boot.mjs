#!/usr/bin/env node
// Boot gate: both entries (index.html and prototype.html) must reach the menu,
// start a drive, and run with 0 console errors, and holding W for 10 s of game
// time must move the truck 10 m or more.
//
//   node tools/qa/boot.mjs [--entries=index,prototype] [--look=<flags>] [--light=on|off] [--seconds=10]
//
// Own server (CMP_SRV_PORT, default 8193), own headless Chrome on SwiftShader
// (CMP_CDP_PORT, default 9493), throwaway profile; both are closed on exit.
// Console errors counted: console.error, uncaught exceptions, and failed
// resource loads (favicon requests are ignored).
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startChrome, Page, boot, CLEAR_SCRIPT, ports, arg, done, ROOT } from './lib/rig.mjs';

const entries = String(arg('entries', 'index,prototype')).split(',').map((s) => s.trim()).filter(Boolean);
const look = arg('look', '');
const light = arg('light', '');   // W8-LIGHT: --light=on|off, Advanced lighting for this boot (?light=)
const seconds = Number(arg('seconds', 10));
const { srv, cdp } = ports();
// The spawn point is a driveway with a street and a hedge 9 m ahead: the truck stops there whatever W does. Drive from the long straight
// (chase_chemin_aylmer in poses.json) instead, so the check measures the truck and not the parking.
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/aylmer-compare/poses.json'), 'utf8')).poses.chase_chemin_aylmer;

const server = await startServer(srv);
const ch = await startChrome({ gpu: false, port: cdp });
let fail = 0;
const rows = [];
for (const entry of entries) {
  const row = { entry, menu: false, drive: false, errors: [], moved: 0, ok: false };
  const page = await Page.open(cdp);
  try {
    const q = new URLSearchParams({ review: 'boot' }); if (look) q.set('look', look); if (light) q.set('light', light);
    const b = await boot(page, `http://127.0.0.1:${srv}/${entry}.html?${q}`);
    row.menu = b.menu; row.drive = b.mode === 'drive'; row.bootSeconds = b.seconds;
    await page.eval(CLEAR_SCRIPT);
    await page.eval(`window.requestAnimationFrame = () => 0; 'ok'`);       // we step the sim ourselves
    await page.eval(`(async () => { await window.AYLMER.teleport(${P.x}, ${P.z}, ${P.yaw}); for (let i = 0; i < 60; i++) window.AYLMER.step(1 / 60); return 1; })()`);
    const before = JSON.parse(await page.eval(`JSON.stringify({ x: window.AYLMER.G.veh.x, z: window.AYLMER.G.veh.z })`));
    const after = JSON.parse(await page.eval(`(async () => {
      const A = window.AYLMER, G = A.G;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      const n = Math.round(${seconds} * 60);
      const trace = [];
      for (let i = 0; i < n; i++) { A.step(1 / 60); if (i % 60 === 0) { trace.push(+Math.hypot(G.veh.x - ${before.x}, G.veh.z - ${before.z}).toFixed(1)); await new Promise((r) => setTimeout(r, 0)); } }
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
      A.render();
      return JSON.stringify({ x: G.veh.x, z: G.veh.z, trace, speed: G.veh.speedKmh, mode: G.mode, mission: !!G.mission });
    })()`, 900000));
    row.moved = +Math.hypot(after.x - before.x, after.z - before.z).toFixed(1); row.trace = after.trace; row.speedKmh = after.speed;
  } catch (e) { row.errors.push('HARNESS: ' + e.message); }
  row.errors.push(...page.errors.filter((e) => !/favicon/i.test(e)));
  row.ok = row.menu && row.drive && row.errors.length === 0 && row.moved >= 10;
  if (!row.ok) fail++;
  rows.push(row);
  console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${entry}.html  menu=${row.menu} drive=${row.drive} (${row.bootSeconds ?? '?'} s)  console errors=${row.errors.length}  W moved ${row.moved} m  (per second: ${(row.trace || []).join(' ')})`);
  for (const e of row.errors.slice(0, 8)) console.log('       ' + e);
  await page.close();
}
await ch.stop(); await server.stop();
console.log(JSON.stringify({ boot: rows.map(({ entry, ok, moved, errors }) => ({ entry, ok, moved, errors: errors.length })) }));
console.log(fail ? `boot: ${fail} entr${fail === 1 ? 'y' : 'ies'} failed` : `boot: ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} ok`);
done(fail ? 1 : 0);
