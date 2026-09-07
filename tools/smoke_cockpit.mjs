// The driver's seat:  node tools/smoke_cockpit.mjs
//
// BACKLOG C6. The cab is a mesh in car-local space drawn with the car's own
// model matrix, so almost everything that can be wrong with it is wrong in
// numbers a node process can read — no canvas, no GL, no `document`. That is
// the whole reason CAMS and the geometry live in game/cockpit.js and not in
// main.js: main.js touches `document` on the first line and cannot be imported
// here at all (see docs/VERIFY.md, "green tests, broken game").
//
// What this suite is actually protecting, in the order it broke while it was
// being written:
//
//   1. C has five stops and `driver` is the last of them, because the settings
//      clamp in store.js and the options list both hard-code that count.
//   2. The eye is INSIDE the cab. It got derived from `seatY` first, and
//      `seatY` is a number cars.js picked so passenger head blobs do not poke
//      through the roof — it put the eye 7 cm above the base of the windshield,
//      which is a driver lying down. It comes off the roof now.
//   3. Every mesh is finite, wound, and small. A cab that costs more triangles
//      than a house is a cab nobody can afford to draw at 60 fps.
//   4. Everything with a cab gets one, nothing without a cab gets one, and no
//      call in here throws for a bicycle.
//   5. The Ranger's own checklist is geometry, so it is checkable: an amber
//      lamp, a crack low on the passenger side, a sagging headliner, a royal
//      blue MuVo on the bench, and NO rear-view mirror anywhere near the glass.

import { CARS, carById } from '../src/game/cars.js';
import { STRIDE } from '../src/core/mesh.js';
import {
  CAMS, DRIVER_CAM, DRIVER_NEAR, HEAD_TURN,
  hasCockpit, cabOf, driverEye,
  buildCockpit, buildWheelMesh, buildStick, buildCluster, buildTelltale, buildNeedle,
  buildCrack, buildExtras,
} from '../src/game/cockpit.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);
const r2 = (n) => Number(n).toFixed(2);

const tris = (mb) => mb.i.length / 3;
const verts = (mb) => mb.v.length / STRIDE;
// Every colour channel a builder wrote, so a mesh can be asked whether it
// contains a particular paint without knowing which primitive laid it down.
function hasColour(mb, hex, tol = 0.02) {
  const want = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  for (let i = 0; i < mb.v.length; i += STRIDE) {
    if (Math.abs(mb.v[i + 6] - want[0]) < tol
      && Math.abs(mb.v[i + 7] - want[1]) < tol
      && Math.abs(mb.v[i + 8] - want[2]) < tol) return true;
  }
  return false;
}
// Positions of every vertex that carries a colour, for "where is the crack".
function pointsWithColour(mb, hex, tol = 0.02) {
  const want = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const out = [];
  for (let i = 0; i < mb.v.length; i += STRIDE) {
    if (Math.abs(mb.v[i + 6] - want[0]) < tol
      && Math.abs(mb.v[i + 7] - want[1]) < tol
      && Math.abs(mb.v[i + 8] - want[2]) < tol) out.push([mb.v[i], mb.v[i + 1], mb.v[i + 2]]);
  }
  return out;
}

const ranger = carById('ranger');

// ------------------------------------------------------------------ 1. cameras

group('C cycles five stops now, and the fifth is the seat');
ok(CAMS.length === 5, `five cameras (${CAMS.map((c) => c.name).join(', ')})`);
ok(CAMS[CAMS.length - 1].name === 'driver', 'driver is the LAST of them — main.js cycles with % CAMS.length');
ok(DRIVER_CAM === 4, `DRIVER_CAM is ${DRIVER_CAM}`);
ok(CAMS[DRIVER_CAM] === CAMS[CAMS.length - 1], 'DRIVER_CAM indexes the driver entry, not a copy of it');
ok(['chase', 'close', 'far', 'hood'].every((n, i) => CAMS[i].name === n),
  'the first four are untouched — a saved settings.cam still means what it meant');
ok(CAMS.every((c) => typeof c.pitch === 'number' && typeof c.fovAdd === 'number' && isFinite(c.pitch)),
  'every entry still has the fields main.js reads off it');
ok(CAMS[DRIVER_CAM].pitch < -0.05,
  `the driver's camera looks DOWN (${r2(CAMS[DRIVER_CAM].pitch)} rad)`,
  'at a level axis a 1993 dash is entirely below the bottom of the frame');
ok(DRIVER_NEAR > 0 && DRIVER_NEAR < 0.4,
  `the near plane drops to ${DRIVER_NEAR} m`, 'the world runs at 0.4 and a door card is at 0.45');
ok(HEAD_TURN > Math.PI / 2 && HEAD_TURN < Math.PI, `the head turns ${Math.round(HEAD_TURN * 57.3)}°, not 180`);

// ------------------------------------------------------------------ 2. the eye

group("the eye is where a driver's head is, and it is inside the cab");
const cab = cabOf(ranger);
const eye = driverEye(ranger);
ok(eye && eye.every(isFinite), `eye at [${eye.map(r2).join(', ')}]`);
ok(eye[0] > 0.15 && eye[0] < cab.hwIn,
  `${r2(eye[0])} m off centre, inside the door card at ${r2(cab.hwIn)}`);
ok(eye[1] > cab.floorY + 0.4 && eye[1] < cab.yRoof - 0.15,
  `${r2(eye[1])} m up: clear of the floor (${r2(cab.floorY)}) and under the roof (${r2(cab.yRoof)})`);
// The one that was actually wrong. seatY put it at 1.19, seven centimetres over
// the cowl; a real Ranger eye is nearly half way up a 49 cm windshield.
ok(eye[1] > cab.yCowl + 0.15,
  `${r2(eye[1] - cab.yCowl)} m above the base of the windshield`,
  'off seatY this was 0.07 — a driver lying down');
ok(eye[1] < cab.yHeader,
  'and below the header rail, so the glass is in front of you and not over you');
ok(eye[2] < cab.zCowl && eye[2] > cab.zBack,
  `${r2(eye[2])} m: behind the cowl (${r2(cab.zCowl)}) and ahead of the rear wall (${r2(cab.zBack)})`);
const reach = cab.zWheel - eye[2];
ok(reach > 0.35 && reach < 0.75, `${r2(reach)} m of reach to the wheel hub`);
ok(cab.yWheel < eye[1] && cab.yWheel + cab.wheelR < eye[1],
  'the whole rim sits below eye level — you look over it, not through the top of it');
ok(cab.yPad < eye[1] && cab.yPad > cab.floorY,
  `the dash pad at ${r2(cab.yPad)} is ${r2(eye[1] - cab.yPad)} m below the eye`);
ok(cab.yPad <= cab.yCowl,
  'and never above the base of the glass, which would be a dash across the windshield');

// ------------------------------------------------------------------ 3. meshes

group('the cab builds, and it is cheap');
const cabMesh = buildCockpit(ranger);
ok(cabMesh && tris(cabMesh) > 300, `${tris(cabMesh)} triangles in the Ranger cab`);
ok(tris(cabMesh) < 3000, `and under 3000 — a house is forty times this`, `${tris(cabMesh)}`);
ok(cabMesh.v.every(isFinite) && cabMesh.i.every((n) => n >= 0 && n < verts(cabMesh)),
  'every vertex finite and every index in range');
ok(cabMesh.i.length % 3 === 0, 'the index buffer is whole triangles');
ok(!cabMesh.uv.length && !cabMesh.rect.length,
  'untextured: no atlas rect, no UVs, so it draws in the same pass as the body');
// It has to fit inside the truck it is drawn in, or it pokes out through the doors.
ok(cabMesh.max[0] <= ranger.wid / 2 + 0.06 && cabMesh.min[0] >= -ranger.wid / 2 - 0.06,
  `${r2(cabMesh.min[0])} .. ${r2(cabMesh.max[0])} across, inside a ${ranger.wid} m body`);
ok(cabMesh.max[1] <= ranger.h + 0.02, `and never above the roof line (${r2(cabMesh.max[1])} <= ${ranger.h})`);
ok(cabMesh.min[1] >= 0, 'and nothing below the ground plane');

for (const [name, mb] of [['wheel', buildWheelMesh(ranger)], ['stick', buildStick(ranger)],
  ['cluster', buildCluster(ranger)], ['telltale', buildTelltale(ranger)],
  ['needle', buildNeedle()], ['crack', buildCrack(ranger)],
  ['extras', buildExtras(ranger)]]) {
  ok(mb && !mb.empty && mb.v.every(isFinite) && mb.i.length % 3 === 0,
    `${name}: ${mb ? tris(mb) : 0} triangles, all finite`);
}
// The wheel, the stick and the needles are authored about their own pivot so a
// local matrix can spin them; a mesh built around the pivot straddles zero.
const wheel = buildWheelMesh(ranger);
ok(Math.abs(wheel.min[0] + wheel.max[0]) < 0.02 && Math.abs(wheel.min[1] + wheel.max[1]) < 0.02,
  'the wheel is centred on its own hub, so roll spins it and nothing else moves');
ok(Math.abs(wheel.max[0] - cabOf(ranger).wheelR) < 0.04,
  `and it is ${r2(wheel.max[0] * 2)} m across, which is a truck wheel`);
const needle = buildNeedle();
ok(needle.min[1] > -0.02 && needle.max[1] > 0.05, 'the needle pivots at its own root and points up +Y');
const stick = buildStick(ranger);
ok(stick.min[1] >= -0.02 && stick.max[1] > 0.3, 'the shifter stands on its pivot, and it is long');

// ------------------------------------------------------------------ 4. coverage

group('everything with a cab gets one; nothing else is asked to have one');
for (const s of CARS) {
  const has = hasCockpit(s);
  if (s.twoWheel || s.style === 'cart') {
    ok(!has, `${s.id}: no cab (${s.twoWheel ? 'two wheels' : 'a golf cart'})`);
    ok(driverEye(s) === null && buildCockpit(s) === null, `${s.id}: and asking for one gives null, not a throw`);
    continue;
  }
  ok(has, `${s.id}: has a cab`);
  const c = cabOf(s), e = driverEye(s);
  ok(e.every(isFinite) && e[1] > c.floorY && e[1] < c.yRoof,
    `${s.id}: eye at ${r2(e[1])} m, between floor ${r2(c.floorY)} and roof ${r2(c.yRoof)}`);
  ok(e[2] < c.zCowl && e[2] > c.zBack, `${s.id}: and between the cowl and the back wall`);
  const m = buildCockpit(s);
  ok(m && tris(m) > 200 && m.v.every(isFinite), `${s.id}: ${tris(m)} triangles, all finite`);
  ok(m.max[0] <= s.wid / 2 + 0.08, `${s.id}: the cab fits inside the body`);
}
// The generic path has to survive the odd ones without a Ranger-only branch.
ok(buildCrack(carById('civic')) === null, 'only the Ranger has the crack — it is Tom\'s windshield');
ok(buildStick(carById('bus')) === null, 'and a city bus does not get a floor shifter');

// ------------------------------------------------------------------ 5. Tom's truck

group("the checklist, which is Tom's actual 1993 Ranger XL");
ok(hasColour(buildTelltale(ranger), 0xf2a02c),
  'an amber CHECK ENGINE lamp, and it has been on since 1999');
const lamp = buildTelltale(ranger);
ok(lamp.max[0] > 0 && lamp.max[1] < cab.yPad,
  'in the lower warning bank on the driver\'s side of the binnacle');
ok(hasColour(cabMesh, 0x1f45cc), 'a royal blue Creative MuVo TX');
const muvo = pointsWithColour(cabMesh, 0x1f45cc);
ok(muvo.every((p) => p[0] < 0), 'on the bench beside you, on the passenger half');
ok(muvo.every((p) => p[1] > cab.floorY && p[1] < cab.yPad),
  'sitting on the seat, not floating and not on the dash');
ok(hasColour(cabMesh, 0x121214), 'and the cassette adapter lead running up to the deck');
ok(hasColour(cabMesh, 0xdad6c8), 'two plastic thumbtacks holding the headliner up');
ok(hasColour(cabMesh, 0xb5b2a8), 'and the light grey cloth they are holding');
// The sag: the headliner in the middle of the cab hangs below the roof rail.
const liner = pointsWithColour(cabMesh, 0xb5b2a8);
const lowest = Math.min(...liner.map((p) => p[1])), highest = Math.max(...liner.map((p) => p[1]));
ok(highest - lowest > 0.03, `and it sags ${r2(highest - lowest)} m in the middle`);

const crack = buildCrack(ranger);
const cpts = pointsWithColour(crack, 0xdfe6ea);
ok(cpts.length > 0 && cpts.every((p) => p[0] < 0),
  'the stress crack is on the passenger side of the glass');
ok(cpts.every((p) => p[1] < cab.yCowl + (cab.yHeader - cab.yCowl) * 0.4),
  'low down on it, which is where a stone off the 148 puts one');
ok(tris(crack) >= 6, `and it runs (${tris(crack) / 2} segments), rather than being one bullseye`);
const crackH = Math.max(...cpts.map((p) => p[1])) - Math.min(...cpts.map((p) => p[1]));
ok(crackH > 0.02 && crackH < 0.30, `${r2(crackH)} m of it — a hairline, not a shatter`);

const ext = buildExtras(ranger);
ok(hasColour(ext, 0xcdcdc4), 'ragged web strands on the driver\'s mirror');
const web = pointsWithColour(ext, 0xcdcdc4);
ok(web.every((p) => p[0] > 0), 'on the DRIVER\'s mirror only — the one you look at');
ok(hasColour(ext, 0x6d6a3f), 'with two dried pine needles caught in them');
ok(hasColour(ext, 0x8a5a30), 'and orange-brown rust along the cowl seam');
// The glass is sky over road: it does not reflect, but from the seat you look
// straight into it, and a dark quad out there is a hole in the door.
ok(hasColour(ext, 0x7d93ab) && hasColour(ext, 0x4a4f56),
  'black paddle mirrors whose glass reads as sky over road');
const mglass = pointsWithColour(ext, 0x7d93ab);
ok(mglass.some((p) => p[0] > 0) && mglass.some((p) => p[0] < 0), 'one on each door');
ok(!hasColour(ext, 0xd8d8d8) && !hasColour(ext, 0xc0c0c0), 'and nothing chromed on the brackets either');
// The hood misalignment: a sliver of body colour standing PROUD of the cowl on
// the driver's side only. It is the first thing you see over the wheel.
const proud = pointsWithColour(ext, ranger.body);
ok(proud.length > 0, 'the hood hinge corner sits proud of the cowl');
ok(proud.every((p) => p[0] > 0), 'on the driver\'s side, which is the side that is bent');
const tCowl = ranger.glassTop[ranger.glassTop.length - 1][1];
ok(Math.max(...proud.map((p) => p[1])) > 1.09,
  'and it stands above the cowl line rather than flush with it');
void tCowl;

// The absence that matters most. There is nothing at all on the glass between
// the visors: no mirror, no stub, no bracket, no ring of old adhesive. This is
// the one item on the checklist that is checked by finding NOTHING.
group('and the thing that is not there');
// The pocket a mirror would occupy: on the centreline, below the header rail
// and the visors, ahead of the roof, up against the glass.
const y0 = cab.yHeader - 0.30, y1 = cab.yHeader - 0.08;
const z0 = cab.zHeader - 0.02, z1 = cab.zHeader + 0.25;
let nearGlassMid = 0;
for (let i = 0; i < cabMesh.v.length; i += STRIDE) {
  const x = cabMesh.v[i], y = cabMesh.v[i + 1], z = cabMesh.v[i + 2];
  if (Math.abs(x) < 0.22 && y > y0 && y < y1 && z > z0 && z < z1) nearGlassMid++;
}
ok(nearGlassMid === 0,
  'no rear-view mirror on the centreline of the windshield — it fell off years ago',
  `${nearGlassMid} vertices in the space where one would hang`);
const visors = pointsWithColour(cabMesh, 0xaaa79e, 0.05);
ok(visors.length > 0 && visors.every((p) => Math.abs(p[0]) > 0.10),
  'two sun visors, and bare glass between them');

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
