// The chase camera does not stand in a wall:  node tools/smoke_camclip.mjs
//
// Thomas's first playtest screenshot was the inside of a house: the boom had
// been placed nine metres behind the car with no regard for what was in the
// way, so it ended up in the bricks with the car on the far side. game/camclip.js
// is the fix, and it is a pure module against a `world` duck type precisely so
// this file can drive it without a canvas — main.js touches `document` on line
// one and cannot be imported here (docs/VERIFY.md, "green tests, broken game").
//
// What is being protected, in the order each one broke while it was written:
//
//   1. Nothing in the way changes nothing. A clip that quietly shortens the
//      boom on an open road is a worse bug than the one it fixes.
//   2. A wall between the car and the camera puts the camera on the CAR's side
//      of it, with a margin, never on the far side and never on the line.
//   3. A camera point inside a footprint comes out even when the boom never
//      crossed a wall segment of it (a courtyard, a dropped near wall).
//   4. Coming in is instantaneous and going out is not. One frame of lag on the
//      way in and you have already seen through the wall; no lag on the way out
//      and a boom flicking across the corner of a house pumps at frame rate.
//   5. A fence is not a building. `querySegments` hands back hoardings and
//      chain-link with no height on them, and a 1.6 m fence does not hide a car
//      from a camera 3.7 m up.

import {
  makeClip, clipCamera, segCross,
  MARGIN, LIFT, MIN_FRAC, RELEASE, FENCE_H,
} from '../src/game/camclip.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);
const r2 = (n) => Number(n).toFixed(2);

// ---------------------------------------------------------------- fake world
//
// Segments are {ax, az, bx, bz} exactly as world.js hands them out (it reuses a
// pool, which is why nothing here holds on to one). `boxes` are axis-aligned
// footprints; a box contributes both its four wall segments and its interior to
// buildingAt, so "there is a building here" and "there is a wall here" agree the
// way they do in the real world. `fences` contribute segments only — that is a
// collider with nothing behind it, which is what a fence is.
function world({ boxes = [], fences = [] } = {}) {
  const segs = [];
  for (const b of boxes) {
    segs.push({ ax: b.x0, az: b.z0, bx: b.x1, bz: b.z0 });
    segs.push({ ax: b.x1, az: b.z0, bx: b.x1, bz: b.z1 });
    segs.push({ ax: b.x1, az: b.z1, bx: b.x0, bz: b.z1 });
    segs.push({ ax: b.x0, az: b.z1, bx: b.x0, bz: b.z0 });
  }
  for (const f of fences) segs.push({ ax: f[0], az: f[1], bx: f[2], bz: f[3] });
  let calls = 0;
  return {
    get calls() { return calls; },
    querySegments(x, z, r) {
      calls++;
      // Same contract as world.js: everything within r of the point. The real
      // one is a grid query; this is the same answer, slowly.
      return segs.filter((g) => distPtSeg2(x, z, g.ax, g.az, g.bx, g.bz) <= r * r);
    },
    buildingAt(x, z, pad = 0) {
      for (const b of boxes) {
        if (x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad) return b;
      }
      return null;
    },
  };
}
function distPtSeg2(x, z, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-9;
  let t = ((x - ax) * ex + (z - az) * ez) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + ex * t - x, dz = az + ez * t - z;
  return dx * dx + dz * dz;
}

// The chase cam's real numbers, so the assertions below are about the game and
// not about a convenient toy. CAMS[0] is { dist: 9.2, height: 3.7 }.
const DIST = 9.2, HEIGHT = 3.7;
const CAR = { x: 0, y: 1.2, z: 0 };          // focus: bodyY 0 + 1.2 eye height
const DT = 1 / 60;
// The camera dead north of the car, which is where the boom points when the car
// faces south. Every case below moves the wall, never the boom.
const CAM = { x: 0, y: HEIGHT, z: DIST };

const clipAt = (st, w, cam = CAM, dt = DT) =>
  clipCamera(st, w, CAR.x, CAR.y, CAR.z, cam.x, cam.y, cam.z, dt, 0);

// ------------------------------------------------------------ 0. the geometry
group('segCross');
ok(Math.abs(segCross(0, 0, 0, 10, -5, 4, 5, 4) - 0.4) < 1e-9,
  'a crossing at 4 m along a 10 m ray reports 0.4');
ok(segCross(0, 0, 0, 10, -5, 14, 5, 14) === -1,
  'a wall past the end of the ray is not a crossing');
ok(segCross(0, 0, 0, 10, -5, -3, 5, -3) === -1,
  'a wall behind the start of the ray is not a crossing');
ok(segCross(0, 0, 0, 10, 1, 4, 6, 4) === -1,
  'a wall the ray misses sideways is not a crossing');
ok(segCross(0, 0, 0, 10, -5, 4, -5, 9) === -1,
  'a wall parallel to the ray is not a crossing');

// ------------------------------------------------- 1. nothing in the way
group('an unobstructed camera is left exactly where it was');
{
  const empty = world();
  const st = makeClip();
  const c = clipAt(st, empty);
  ok(c.x === CAM.x && c.y === CAM.y && c.z === CAM.z,
    'open ground: the camera point is unchanged',
    `${r2(c.x)}, ${r2(c.y)}, ${r2(c.z)}`);
  ok(c.frac === 1 && c.hit === false, 'and it does not claim a hit');
  // A house well off to one side must not touch it either.
  const aside = world({ boxes: [{ x0: 12, z0: -6, x1: 24, z1: 6 }] });
  const st2 = makeClip();
  const c2 = clipAt(st2, aside);
  ok(c2.z === DIST && c2.y === HEIGHT, 'a house beside the boom is not in the boom');
}

// ------------------------------------------------- 2. a wall in the way
group('a wall between the car and the camera pulls the camera to the near side');
{
  // A house whose front wall is 5 m behind the car, filling the boom.
  const w = world({ boxes: [{ x0: -8, z0: 5, x1: 8, z1: 17 }] });
  const st = makeClip();
  const c = clipAt(st, w);
  ok(c.z < 5, 'the camera is on the car\'s side of the wall', `z = ${r2(c.z)}`);
  ok(c.z > 0, 'and not behind the car', `z = ${r2(c.z)}`);
  // 5 m of boom minus the margin, to within the numerics.
  ok(Math.abs(c.z - (5 - MARGIN)) < 0.05,
    `it stands ${MARGIN} m in front of the wall`, `z = ${r2(c.z)}`);
  ok(!w.buildingAt(c.x, c.z, 0), 'the final point is not inside the footprint');
  ok(c.y > HEIGHT, 'and it rides a little higher so the shot still reads',
    `y = ${r2(c.y)} vs ${HEIGHT}`);
  ok(c.y <= HEIGHT + LIFT + 1e-9, `...by no more than ${LIFT} m`, `y = ${r2(c.y)}`);
  ok(c.hit === true && c.frac < 1, 'and it reports the hit');
}

group('a nearer wall wins, and the wall of a courtyard 30 cm away does not crush it');
{
  const w = world({
    boxes: [
      { x0: -8, z0: 7.0, x1: 8, z1: 9 },     // the far one
      { x0: -8, z0: 3.0, x1: 8, z1: 4 },     // the near one
    ],
  });
  const c = clipAt(makeClip(), w);
  ok(Math.abs(c.z - (3 - MARGIN)) < 0.05,
    'the first crossing is the one that counts', `z = ${r2(c.z)}`);
}
{
  // A wall pressed right up against the car: the boom cannot go to zero or the
  // camera is inside the bonnet.
  const w = world({ boxes: [{ x0: -8, z0: 0.3, x1: 8, z1: 9 }] });
  const c = clipAt(makeClip(), w);
  ok(c.frac >= MIN_FRAC - 1e-9, `the boom never shortens past ${MIN_FRAC} of itself`,
    `frac = ${r2(c.frac)}`);
  ok(Math.hypot(c.x - CAR.x, c.z - CAR.z) > 1.4,
    'so the camera keeps some distance from the car even in a corner',
    `${r2(Math.hypot(c.x - CAR.x, c.z - CAR.z))} m`);
}

// ------------------------------------------------- 3. inside a footprint
group('a camera point inside a footprint is moved out');
{
  // The car sits in a courtyard whose near wall the world did not collide (it
  // was on the asphalt, so world.js dropped it): only the FAR wall is a
  // segment, and the boom never crosses it before the camera point lands
  // indoors. Nothing but buildingAt can catch this.
  const w = {
    querySegments: () => [{ ax: -8, az: 30, bx: 8, bz: 30 }],
    buildingAt: (x, z, pad = 0) =>
      (x >= -8 - pad && x <= 8 + pad && z >= 6 - pad && z <= 30 + pad) ? {} : null,
  };
  const c = clipAt(makeClip(), w);
  ok(!w.buildingAt(c.x, c.z, 0), 'the camera ends up outside the bricks', `z = ${r2(c.z)}`);
  ok(c.z < 6, 'on the near side of the footprint', `z = ${r2(c.z)}`);
}

// ------------------------------------------------- 4. the smoothing
group('pull-in is immediate, release is gradual');
{
  const blocked = world({ boxes: [{ x0: -8, z0: 5, x1: 8, z1: 17 }] });
  const clear = world();
  const st = makeClip();
  // One frame. Not two, not "settles over a few".
  const first = clipAt(st, blocked);
  const zIn = first.z;
  ok(zIn < 5, 'the very first frame is already clear of the wall', `z = ${r2(zIn)}`);
  const fracIn = st.frac;
  // Same wall again: it must not creep further in.
  const again = clipAt(st, blocked);
  ok(Math.abs(again.z - zIn) < 1e-9, 'holding against the wall is stable');

  // The wall goes away. One frame later the camera is still nearly where it was.
  const rel1 = clipAt(st, clear);
  ok(rel1.z < zIn + 0.6,
    'the frame after the way clears, the camera has barely moved',
    `z = ${r2(rel1.z)} from ${r2(zIn)}`);
  ok(rel1.z > zIn, 'but it has started back out', `z = ${r2(rel1.z)}`);
  // The analytic value of the ease, so the assertion is about the rate and not
  // about "some number bigger than before".
  const wantFrac = fracIn + (1 - fracIn) * (1 - Math.exp(-RELEASE * DT));
  ok(Math.abs(st.frac - wantFrac) < 1e-9,
    `the release is a ${RELEASE}/s exponential ease`, `${r2(st.frac)} vs ${r2(wantFrac)}`);

  // ...and it does get all the way home. Three seconds of frames. Exactly
  // home: an exponential that never arrives leaves the boom two centimetres
  // short forever, so camclip snaps the last SNAP of it.
  for (let i = 0; i < 180; i++) clipAt(st, clear);
  const home = clipAt(st, clear);
  ok(home.z === DIST && home.y === HEIGHT,
    'after three seconds in the open the boom is back to exactly full length',
    `z = ${r2(home.z)}, y = ${r2(home.y)}`);
  ok(home.frac === 1 && home.hit === false, 'and the lift and the hit flag have gone with it');

  // Coming in is not rate limited even from full extension.
  const snap = clipAt(st, blocked);
  ok(Math.abs(snap.z - (5 - MARGIN)) < 0.05,
    'and going back in is one frame again, from full extension',
    `z = ${r2(snap.z)}`);
}

// ------------------------------------------------- 5. fences are not buildings
group('a fence is not a wall as far as a camera 3.7 m up is concerned');
{
  // A 1.6 m chain-link fence across the boom. The collider is identical to a
  // building's in every respect the query can see; the difference is that
  // nothing stands behind it.
  const w = world({ fences: [[-8, 5, 8, 5]] });
  const c = clipAt(makeClip(), w);
  ok(c.z === DIST && c.y === HEIGHT,
    'the chase cam ignores it', `z = ${r2(c.z)}`);
  // But a camera down at fence height does not get to see through it.
  const low = { x: 0, y: 1.4, z: DIST };
  const c2 = clipAt(makeClip(), w, low);
  ok(c2.z < 5, `a boom below ${FENCE_H} m is stopped by it`, `z = ${r2(c2.z)}`);
  // And a wall with a house behind it stops the high camera, fence or not.
  const house = world({ boxes: [{ x0: -8, z0: 5, x1: 8, z1: 17 }] });
  ok(clipAt(makeClip(), house).z < 5, 'a building stops it at any height');
}

// ------------------------------------------------- 6. it costs one query
group('cost');
{
  const w = world({ boxes: [{ x0: -8, z0: 5, x1: 8, z1: 17 }] });
  const st = makeClip();
  clipAt(st, w);
  ok(w.calls === 1, 'one segment query per camera per frame', `${w.calls}`);
  const out1 = clipAt(st, w);
  const out2 = clipAt(st, w);
  ok(out1 === out2, 'and the result is shared scratch — nothing is allocated');
}

// ------------------------------------------------- 7. it never returns garbage
group('robustness');
{
  const w = world({ boxes: [{ x0: -8, z0: 5, x1: 8, z1: 17 }] });
  const st = makeClip();
  // A camera on top of the car (dist 0) must not divide by zero.
  const c = clipCamera(st, w, 0, 1.2, 0, 0, 1.2, 0, DT, 0);
  ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z),
    'a zero-length boom is finite', `${c.x}, ${c.y}, ${c.z}`);
  // No world at all (a suite, a stage that has not loaded one yet).
  const c2 = clipCamera(makeClip(), null, 0, 1.2, 0, 0, HEIGHT, DIST, DT, 0);
  ok(c2.z === DIST && c2.y === HEIGHT, 'no world means no clipping');
  // A world with segments but no buildingAt (landmarks.js wraps querySegments).
  const c3 = clipCamera(makeClip(), { querySegments: () => [] },
    0, 1.2, 0, 0, HEIGHT, DIST, DT, 0);
  ok(c3.z === DIST, 'a world without buildingAt still works');
  // dt of 0 — a paused frame — holds rather than releasing.
  const st4 = makeClip();
  clipAt(st4, w);
  const held = st4.frac;
  clipAt(st4, world(), CAM, 0);
  ok(st4.frac === held, 'a zero-length frame does not move the boom');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
