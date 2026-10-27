#!/usr/bin/env node
// S5-LIGHT (V1-02): the timecycle table. Pure node.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tc = await import('../src/game/look/timecycle.js');
const { Weather, STATE_KEYS } = await import('../src/game/weather.js');
const { TIME_OF_DAY } = await import('../src/game/missions.js');
const { nightAmount } = await import('../src/game/world/headlights.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const L255 = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) * 255;
const near = (a, b, e = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) <= e);
const clone = (e) => JSON.parse(JSON.stringify(e));

const T = tc.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/look/timecycle.json'), 'utf8')));
const env = tc.makeEnv();

console.log('the table');
ok(T.rows.length === 9, '9 keys');
for (const w of STATE_KEYS) {
  const W = new Weather({ state: w });
  let finite = true;
  for (let h = 0; h < 24; h += 0.25) { tc.sample(h, 23, W, env); for (const f of ['sky', 'fog', 'sun', 'ambSky', 'ambGround', 'lightDir']) if (!env[f].every(Number.isFinite)) finite = false; if (!Number.isFinite(env.fogDensity)) finite = false; }
  ok(finite, `${w}: every field finite all day`);
}

console.log('noon is the shipped noon, in every weather');
for (const w of STATE_KEYS) {
  const W = new Weather({ state: w });
  for (const h of [11.87, 13, 14]) {
    tc.sample(h, 23, W, env);
    const d = W.tintEnv(clone(TIME_OF_DAY.day));
    ok(near(env.sky, d.sky) && near(env.fog, d.fog) && near(env.sun, d.sun) && near(env.ground, d.ground)
      && near(env.lightDir, d.lightDir, 1e-5) && Math.abs(env.fogDensity - d.fogDensity) < 1e-9, `${w} at ${h}: equals tintEnv(TIME_OF_DAY.day)`);
  }
}

console.log('night is night');
for (const w of STATE_KEYS) {
  const W = new Weather({ state: w });
  for (const h of [22.5, 23.5, 1, 3]) {
    tc.sample(h, 23, W, env);
    const bad = [];
    if (L255(env.fog) > 42) bad.push('fog luma ' + L255(env.fog).toFixed(1));
    if (L255(env.sky) > 42) bad.push('sky luma ' + L255(env.sky).toFixed(1));
    const br = (c) => (c[2] - c[0]) * 255;
    if (br(env.sky) < 19 || br(env.sky) > 35) bad.push('sky B-R ' + br(env.sky).toFixed(1));
    if (br(env.fog) < 19 || br(env.fog) > 35) bad.push('fog B-R ' + br(env.fog).toFixed(1));
    if (env.ambGround[2] < env.ambGround[0]) bad.push('sepia ground');
    if (env.fogDensity > T.checks.nightFogDensityMax + 1e-9) bad.push('fog density ' + env.fogDensity);
    if (nightAmount(env) <= 0.35) bad.push('cones off');
    ok(!bad.length, `${w} at ${h}: dark, navy, no sepia, fog <= 0.0026, lights on ${bad.join(', ')}`);
  }
}
{
  const R = new Weather({ state: 'rain' }), C = new Weather({ state: 'clear' });
  tc.sample(23.5, 23, R, env); const rs = lum(env.sun), rfd = env.fogDensity;
  tc.sample(23.5, 23, C, env);
  ok(rs < lum(env.sun), 'night rain: the moon is dimmer than on a clear night');
  ok(rfd <= 0.0026, 'night rain is not a fog: density ' + rfd.toFixed(4));
  tc.sample(3, 23, C, env); const l3 = lum(env.sky);
  tc.sample(1, 23, C, env); const l1 = lum(env.sky);
  tc.sample(5, 23, C, env); const l5 = lum(env.sky);
  ok(l3 <= l1 + 0.01 && l3 < l5, '3 a.m. is darker than 05:00');
}

console.log('golden is low, warm and from the west');
{
  tc.sample(19.5, 23, new Weather({ state: 'clear' }), env);
  const el = Math.asin(env.lightDir[1]) * 180 / Math.PI;
  ok(el > 5 && el < 16, `19:30 sun elevation ${el.toFixed(1)}`);
  ok(env.lightDir[0] < -0.7, '19:30 sun from the west');
  ok(env.sun[0] - env.sun[2] > 0.3, '19:30 sun is warm');
  ok(nightAmount(env) === 0, '19:30 is not night');
}

console.log('the sun path (15 July)');
{
  const d = [0, 0, 0]; let best = -1, bh = 0;
  for (let h = 12; h < 14.5; h += 1 / 60) { tc.sunDir(h, 23, d); if (d[1] > best) { best = d[1]; bh = h; } }
  const peak = Math.asin(best) * 180 / Math.PI;
  ok(peak > 64 && peak < 68 && bh > 12.9 && bh < 13.4, `peak ${peak.toFixed(1)} deg at ${bh.toFixed(2)} h`);
  tc.sunDir(19.5, 23, d); const az = (Math.atan2(d[0], -d[2]) * 180 / Math.PI + 360) % 360;
  ok(az > 285 && az < 305, `19:30 azimuth ${az.toFixed(0)}`);
}

console.log('evening lights come on around today\'s moments');
{
  const C = new Weather({ state: 'clear' });
  let pools = null, night = null, cones = null;
  for (let h = 19; h < 23; h += 1 / 60) {
    tc.sample(h, 23, C, env); const n = nightAmount(env);
    if (pools === null && n > 0.02) pools = h; if (night === null && n > 0.15) night = h; if (cones === null && n > 0.35) cones = h;
  }
  const hm = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  ok(pools > 20.4 && pools < 21.0 && cones > 20.6 && cones < 21.3, `pools ${hm(pools)}, G.night ${hm(night)}, cones ${hm(cones)} (legacy 20:39, 20:45, 20:54)`);
}

console.log('no allocation');
{
  const W = new Weather({ state: 'rain' });
  for (let i = 0; i < 2000; i++) tc.sample((i % 96) / 4, 23, W, env);
  globalThis.gc?.();
  const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < 20000; i++) tc.sample((i % 96) / 4, 23, W, env);
  const grew = process.memoryUsage().heapUsed - h0;
  ok(grew < 512 * 1024, `20k samples grow the heap by ${(grew / 1024).toFixed(0)} KB`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
