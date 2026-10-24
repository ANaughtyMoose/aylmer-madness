// The frame loop's clock and the camera's per-frame arithmetic in main.js
// (driving review A3, A5, A7, A8). main.js cannot be imported in node, so the
// shape is pinned in its text and the arithmetic replayed here.
//
//   node tools/smoke_frame_timing.mjs
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
  if (c) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  — ' + extra : '')); }
};
const MAIN = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const fn = (name) => { const i = MAIN.indexOf(`function ${name}(`); return MAIN.slice(i, MAIN.indexOf('\n}\n', i)); };
const frame = fn('frame'), render = fn('render'), tick = fn('tick');

console.log('the clock (A8)');
ok(/if \(!\(dt > 0\)\) dt = 0;/.test(frame), 'a negative or NaN dt (unpause, map close) becomes 0');
ok(/if \(dt > 0\) for \(let i = 0; i < n; i\+\+\) tick\(h\);/.test(frame), '...and a zero dt runs no tick');
{
  const cap = Number((frame.match(/if \(dt > ([\d.]+)\) dt = [\d.]+;/) || [])[1]);
  const subs = Number((frame.match(/Math\.min\((\d+), Math\.max\(1, Math\.ceil\(dt \/ STEP\)\)\)/) || [])[1]);
  ok(cap / subs <= 1 / 60 + 1e-6, `no sub-step is longer than 1/60 s (${(cap / subs * 1000).toFixed(2)} ms)`);
}

console.log('the hood cam sits on the bonnet (A3)');
{
  ok(/if \(cam\.name === 'hood'\) \{\s*(\/\/[^\n]*\n\s*)*G\.camPos\[0\] = px;\s*G\.camPos\[2\] = pz;/.test(render),
    'hood: x/z are the mount, not a low-passed chase of it');
  // Replay: the old filter at 100 km/h, 60 Hz, sits v/9 behind; the new one sits on it.
  const v = 100 / 3.6, dt = 1 / 60, k = 1 - Math.exp(-9 * dt);
  let car = 0, cam = 0;
  for (let i = 0; i < 600; i++) { car += v * dt; cam += (car - cam) * k; }
  ok(car - cam > 2.5, `the old smoothing trailed ${(car - cam).toFixed(2)} m at 100 km/h (why this changed)`);
}

console.log('camera shake is not frame-rate dependent (A7)');
ok(!/G\.camYaw \+= Math\.sin\(G\.time/.test(render), 'shake no longer accumulates into G.camYaw');
ok(/shakeYaw = Math\.sin\(G\.time \* 9\.1\)/.test(render) && /r\.begin\(G\.camPos, G\.camYaw \+ shakeYaw/.test(render),
  'it is a per-frame offset handed to the renderer');

console.log('a dry tank does not rev (A5)');
ok(/dryTank = !!dry;/.test(tick) && /const drivePedal = dryTank \? 0 :/.test(tick), 'no pedal into the gearbox or the engine note on an empty tank');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
