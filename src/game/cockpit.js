// The driver's seat (BACKLOG C6).
//
// Gemini offered three ways to do this and recommended the one we did not take:
// a photoreal 2048x768 plate locked to the screen. The reason is one line up in
// the brief — "the overall render should be consistent even in chase cam". A
// plate is a second renderer. It has its own sun, baked at whatever hour the
// photograph was taken, and it does not know that it is half past nine on a wet
// Tuesday in Aylmer. Press C back to chase and the truck you were sitting in is
// a different object from the truck you are now looking at.
//
// So: the cockpit is a mesh, built out of the same MeshBuilder boxes, lofts and
// vertex colours as the body in cars.js, uploaded once per spec, and drawn with
// the car's OWN model matrix. It pitches, rolls and bounces with the body
// because it IS the body's frame, and the sun that lights the hood lights the
// dash. Everything the checklist asks for is geometry, and the whole Ranger cab
// costs about a fortieth of the triangle budget of one house.
//
// Car-local space, exactly as cars.js states it: +Z forward, +Y up (y = 0 is
// the ground plane the wheels stand on), +X is the driver's LEFT.

import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { pl, tToZ } from './cars.js';
import { clamp, m4 } from '../core/math.js';

// C cycles these. The first four are unchanged; `driver` is the fifth stop.
// It lives here rather than in main.js so a node suite can assert on it without
// importing a module that touches `document`.
export const CAMS = [
  { name: 'chase', dist: 9.2, height: 3.7, pitch: -0.17, fovAdd: 0 },
  { name: 'close', dist: 6.4, height: 2.9, pitch: -0.15, fovAdd: 0.03 },
  { name: 'far',   dist: 14.5, height: 6.4, pitch: -0.26, fovAdd: -0.03 },
  { name: 'hood',  dist: -0.2, height: 1.55, pitch: -0.04, fovAdd: 0.06 },
  // dist/height are unused: the eye is a point in the car's own frame, not an
  // offset from it. `pitch` is eleven and a half degrees of down-look, which is
  // more than it sounds and less than it needs: a driver's eye is 33 cm above
  // the dash pad and 66 cm behind the instruments, so at a level axis the whole
  // cluster — needles, warning bank and all — falls off the bottom of a 62°
  // frame. A human looks down at a road; a camera bolted to a skull does not.
  // `fovAdd` lands on 1.09 rad off the med/high preset's 1.15, a little
  // narrower than the chase cam because the cab is close and a wide lens in
  // here bends the A-pillars.
  { name: 'driver', dist: 0, height: 0, pitch: -0.20, fovAdd: -0.06 },
];

export const DRIVER_CAM = CAMS.findIndex((c) => c.name === 'driver');

// The near plane the driver's view asks for. The world runs at 0.4 m, which is
// fine when the closest thing to the eye is the bonnet of a car nine metres
// ahead and hopeless when it is a door card at 45 cm. 0.15 clears everything in
// the cab with room for the head motion and the look-back, and costs about
// 2 cm of depth resolution at 400 m — under the fog, and invisible.
export const DRIVER_NEAR = 0.15;

// How far the head turns on Shift. Not a camera flip: you look over your left
// shoulder, the A-pillar and the door glass sweep past, and the back of the cab
// is what you get. 150 degrees is about the limit of a neck plus a shoulder.
export const HEAD_TURN = 150 * Math.PI / 180;

// ---------------------------------------------------------------- palette
// 2004, nine years in. The Ranger XL came in exactly one interior colour and
// Ford called it Opal Grey; everything else here is a shade of it, because that
// is what the inside of a base-trim truck is.
const OPAL = 0x8d8f93;            // the moulded dash, the pillars, the door cards
const OPAL_LO = 0x74767a;         // lower fascia, knee bolster, under-dash
const OPAL_DK = 0x4c4e52;         // recesses: vents, the cluster surround, the tray
const SLATE = 0x2a2c2f;           // the cluster face, the radio face, switchgear
const VINYL = 0x6b6e72;           // the bench: grey vinyl, sun-hardened
const RUBBER = 0x1a1b1d;          // the shift boot, the pedal pads, the floor mat
const HEADLINER = 0xb5b2a8;       // light grey cloth, and it sags
const TACK = 0xdad6c8;            // the two thumbtacks holding it up
const MUVO_BLUE = 0x1f45cc;       // Creative MuVo TX FM: anodised royal blue
const CORD = 0x121214;            // the cassette adapter lead
const AMBER = 0xf2a02c;           // CHECK ENGINE
const WEB = 0xcdcdc4;             // what is left of a spider's summer
const NEEDLEPINE = 0x6d6a3f;      // two dried pine needles caught in it
const GLASSDK = 0x1d2226;         // mirror glass. See buildExtras().
const NEEDLE = 0xe86a4a;          // orange, like every Ford cluster of the era
// The cluster reads the way a real Ford one does: a light grey plastic MASK
// with round holes cut in it, black dial faces behind the holes, white
// graduations round each and an orange needle over them. Panel and dial were
// both near-black to start with, and at a driver's distance that is one black
// rectangle with a couple of white specks on it.
const DIALMARK = 0xe6e4da;        // the graduations, white on black
const DIALFACE = 0x121417;        // the dial face behind the mask
const CLUSTER = 0x53575f;         // the mask itself, moulded grey plastic
const DEADLAMP = 0x2a2d31;        // the three warning lamps that are NOT on
const RUST = 0x8a5a30;            // the cowl seam, nine winters of road salt

// ---------------------------------------------------------------- geometry

/** Two-wheelers ride, they do not sit; the cart has no cab to sit in. */
export function hasCockpit(spec) {
  return !!(spec && !spec.twoWheel && spec.style !== 'cart'
    && spec.glassTop && spec.glassTop.length && spec.top && spec.plan);
}

/**
 * Everything about a cab that can be read off the spec sheet rather than typed
 * into one, so the Civic and the school bus get a dash that fits them without
 * anybody measuring a Civic.
 *
 * The windshield is the LAST range in `glassTop` on every spec in the game —
 * t runs from the rear bumper forward, so a backlight or a hatch always sorts
 * before it. Its two ends are the cowl (where the glass meets the dash) and the
 * header rail (where it meets the roof), and those two points fix the cab.
 */
export function cabOf(spec) {
  const s = spec;
  const gt = s.glassTop[s.glassTop.length - 1];
  const tCowl = gt[1], tHeader = gt[0];
  const zCowl = tToZ(s, tCowl), yCowl = pl(s.top, tCowl);
  const zHeader = tToZ(s, tHeader), yHeader = pl(s.top, tHeader);
  // The roof is the top surface a little way behind the header.
  const tRoof = Math.max(0, tHeader - 0.03);
  const yRoof = Math.max(yHeader, pl(s.top, tRoof));
  const zRoof = tToZ(s, tRoof);
  // Half width across the cab, and the interior face of the doors inside it.
  const hwBody = pl(s.plan, (tCowl + tHeader) / 2);
  const hwIn = Math.max(0.35, hwBody - 0.09);

  // The eye. This USED to come off `seatY`, and `seatY` is a number cars.js
  // picked so the blob heads it draws for your passengers do not poke out
  // through the roof — 1.28 m in the Ranger, which puts an eye 7 cm above the
  // base of the windshield. Sit in the truck and you are a good 20 cm above it;
  // the glass is 49 cm tall and your eye is nearly half way up it. So the eye
  // hangs off the ROOF, which is the one measurement in the cab a driver's
  // head is actually related to, and the cowl and the header rail bracket it.
  let eyeY = yRoof - 0.30;
  if (eyeY < yCowl + 0.12) eyeY = yCowl + 0.12;
  if (eyeY > yHeader - 0.10) eyeY = yHeader - 0.10;

  // The floor, then, is a seated body below the eye — hip to eye is about
  // 0.85 m — but never inside the frame rails.
  const floorY = Math.max(s.clearance + 0.06, eyeY - 0.85);
  // The dash pad tucks just under the base of the glass; a gap there is a hole
  // you can see the firewall through. `zDash` is the lip nearest the driver,
  // `zFace` the vertical fascia a hand's width in front of it — everything a
  // driver reads or reaches for is on that face, NOT buried in the pad.
  const yPad = Math.min(yCowl - 0.08, floorY + 0.52);
  const zDash = zCowl - 0.34;
  const zFace = zDash + 0.04;
  const yInstr = yPad - 0.10;    // the middle of the instrument cluster
  // The wheel hangs off a column that comes through the fascia; on every one of
  // these the hub is a little under half a metre behind the base of the glass,
  // and its centre sits a hand's width below the top of the dash.
  const zWheel = zCowl - 0.46;
  const yWheel = yPad - 0.06;
  const rake = s.style === 'truck' || s.style === 'bus' ? 0.55 : 0.42;   // trucks hold the wheel flat
  const wheelR = s.style === 'bus' ? 0.26 : 0.19;

  // The back of the cab. A truck has a wall there and a backlight above it, and
  // both are in `glassTop`'s FIRST range (the windshield is the last). A car has
  // a rear seat instead, so the wall goes behind it — far enough back that a
  // look over the shoulder does not clip through it.
  const gb = s.glassTop.length > 1 ? s.glassTop[0] : null;
  const truckish = s.style === 'truck' || s.style === 'bus';
  const zBack = gb && truckish ? tToZ(s, gb[0]) : zRoof - 1.15;
  const yBack = gb && truckish && gb[2] != null ? gb[2] : Math.min(yRoof - 0.28, yCowl + 0.10);

  return { tCowl, tHeader, zCowl, yCowl, zHeader, yHeader, yRoof, zRoof,
    hwBody, hwIn, floorY, yPad, zDash, zFace, yInstr, eyeY,
    zWheel, yWheel, rake, wheelR, zBack, yBack };
}

/**
 * Where the driver's eye is, in car-local metres. Null for anything with no cab.
 *
 * x: `seatX` is the seat centreline; a driver leans a hand's width inboard of
 *    it toward the wheel. (Ranger: 0.50 - 0.08 = 0.42 m left of centre.)
 * y: see cabOf() — off the roof, not off `seatY`.
 * z: arm's length behind the wheel, which is itself fixed off the cowl. The
 *    brief guessed 0.35 m behind the windshield base; that is where the dash
 *    pad is, not where a head is, so this derives it from the reach instead and
 *    lands about 0.9 m back — which is what a tape measure says in a Ranger.
 */
export function driverEye(spec) {
  if (!hasCockpit(spec)) return null;
  const c = cabOf(spec);
  return [Math.max(0.16, (spec.seatX || 0.45) - 0.08), c.eyeY, c.zWheel - 0.52];
}

// --- small builders the checklist needs and MeshBuilder does not have --------

// A ring of `n` boxes swept round a circle in the mesh's XY plane: the wheel
// rim, and cheaper per triangle than anything smoother would be.
function torus(mb, R, r, major, minor, c) {
  const base = mb.vertCount;
  for (let i = 0; i < major; i++) {
    const a = (i / major) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j < minor; j++) {
      const b = (j / minor) * Math.PI * 2, cb = Math.cos(b), sb = Math.sin(b);
      const nx = ca * cb, ny = sa * cb, nz = sb;
      mb.vert((R + r * cb) * ca, (R + r * cb) * sa, r * sb, nx, ny, nz, c);
    }
  }
  for (let i = 0; i < major; i++) {
    const i1 = (i + 1) % major;
    for (let j = 0; j < minor; j++) {
      const j1 = (j + 1) % minor;
      const a = base + i * minor + j, b = base + i * minor + j1;
      const d = base + i1 * minor + j, e = base + i1 * minor + j1;
      mb.tri(a, d, e); mb.tri(a, e, b);
    }
  }
}

// A chain of thin boxes from p to q with a sag: the cassette adapter lead, and
// the one part of this cab that is genuinely a piece of string.
function cord(mb, p, q, segs, thick, c, sag) {
  let prev = p;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const x = p[0] + (q[0] - p[0]) * t;
    const y = p[1] + (q[1] - p[1]) * t - Math.sin(t * Math.PI) * sag;
    const z = p[2] + (q[2] - p[2]) * t;
    mb.box((prev[0] + x) / 2, (prev[1] + y) / 2, (prev[2] + z) / 2,
      Math.abs(x - prev[0]) + thick, Math.abs(y - prev[1]) + thick,
      Math.abs(z - prev[2]) + thick, c);
    prev = [x, y, z];
  }
}

// A flat bar in the mesh's own XY plane, running from the origin out to `len`
// at angle `a`, `w` wide and `t` thick, at depth `z`. MeshBuilder.box is
// axis-aligned, so a diagonal built with it is not a bar at all.
//
// Six quads, each wound so its normal points out of the slab: `quad` takes the
// four corners counter-clockwise AS SEEN FROM THE FRONT, and a bar whose faces
// are wound the other way is a bar you can see straight through.
function bar(mb, a, len, w, t, z, c) {
  const ux = Math.cos(a), uy = Math.sin(a);
  const vx = -uy, vy = ux;
  const h = w / 2, k = t / 2;
  const P = (s, d, e) => [ux * s + vx * d, uy * s + vy * d, z + e];
  const a00 = P(0, -h, -k), a10 = P(len, -h, -k), a11 = P(len, h, -k), a01 = P(0, h, -k);
  const b00 = P(0, -h, k), b10 = P(len, -h, k), b11 = P(len, h, k), b01 = P(0, h, k);
  mb.quad(a00, a01, a11, a10, c);     // -Z, the face the driver sees
  mb.quad(b00, b10, b11, b01, c);     // +Z
  mb.quad(a01, b01, b11, a11, c);     // +across
  mb.quad(a00, a10, b10, b00, c);     // -across
  mb.quad(a10, a11, b11, b10, c);     // the far end, at the rim
  mb.quad(a00, b00, b01, a01, c);     // the near end, at the hub
}

// A round instrument face lying in the cab's XY plane and looking BACK at the
// driver. MeshBuilder.cyl only knows the Y and X axes, and a speedometer on its
// side is a speedometer nobody can read. Wound the other way round from the
// obvious one: a front face is counter-clockwise seen from where its normal
// points, and that normal is -Z.
function dial(mb, cx, cy, cz, r, segs, c, rim) {
  const b = mb.vert(cx, cy, cz, 0, 0, -1, c);
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    mb.vert(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz, 0, 0, -1, c);
  }
  for (let i = 0; i < segs; i++) mb.tri(b, b + 1 + ((i + 1) % segs), b + 1 + i);
  if (!rim) return;
  for (let i = 0; i < segs; i++) {
    const a = ((i + 0.5) / segs) * Math.PI * 2;
    mb.box(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz + 0.004, 0.012, 0.012, 0.016, rim);
  }
}

// The headliner: a grid of quads pulled down in the middle. Two thumbtacks hold
// the front corners and everything between them hangs, which is exactly what a
// nine-year-old glue joint does.
function headliner(mb, cab, hw, z0, z1, sagAmt, c) {
  const NX = 5, NZ = 4;
  const yAt = (u, v) => {
    // u, v in 0..1 across and along. Zero sag at the edges and at the tacks.
    const s = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
    return cab.yRoof - 0.035 - sagAmt * s;
  };
  const P = (i, j) => {
    const u = i / NX, v = j / NZ;
    return [(-1 + 2 * u) * hw, yAt(u, v), z0 + (z1 - z0) * v];
  };
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      // Wound so the visible face is the one pointing DOWN at the driver.
      mb.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), c);
    }
  }
}

// ---------------------------------------------------------------- the cab

/**
 * One cockpit mesh for a spec, in car-local space. Returns a MeshBuilder (never
 * uploaded here — that is the caller's job, and the node suites want the raw
 * counts). Null for a bicycle or the golf cart.
 *
 * The windshield itself is not drawn: the world IS the windshield, and a quad
 * over it would only cost a blend and tint the town. The one exception is the
 * crack, which is its own mesh so it can go through the transparent pass.
 *
 * Everything in here faces INWARD, and that is the whole reason it exists: the
 * body loft is one-sided, so from a seat inside it the roof, the doors and the
 * rear wall are back faces and the renderer throws them away. Without a cab you
 * would be sitting in a convertible made of sky.
 */
export function buildCockpit(spec) {
  if (!hasCockpit(spec)) return null;
  const s = spec, c = cabOf(s);
  const mb = new MeshBuilder();
  const ranger = s.id === 'ranger';

  const opal = rgb(OPAL), opalLo = rgb(OPAL_LO), opalDk = rgb(OPAL_DK);
  const slate = rgb(SLATE), rubber = rgb(RUBBER), vinyl = rgb(VINYL);
  const hw = c.hwIn, floor = c.floorY, yPad = c.yPad;
  const zDashBack = c.zDash, zF = c.zFace;
  const eye = driverEye(s);
  const sideD = Math.sign(eye[0]) || 1;         // +1: the driver sits on the +X side

  // ---- floor, tunnel, firewall ------------------------------------------
  const zMat0 = c.zBack + 0.06, zMat1 = c.zCowl - 0.26;
  mb.box(0, floor + 0.01, (zMat0 + zMat1) / 2, hw * 2, 0.02, zMat1 - zMat0, rubber);
  mb.box(0, floor + 0.11, zDashBack - 0.25, 0.34, 0.22, 0.9, shade(RUBBER, 1.4));  // transmission tunnel
  // The firewall, tucked UNDER the pad rather than across the glass line: it
  // closes the hole between the bottom of the dash and the floor and nothing
  // more. A slab up at cowl height would have blanked out the hood.
  mb.box(0, (floor + yPad - 0.30) / 2, c.zCowl - 0.06, hw * 2, yPad - 0.30 - floor, 0.05, opalLo);

  // ---- the dash ----------------------------------------------------------
  // The pad is a SHELF, not a slab. Its top face runs from the lip nearest the
  // driver forward and up to the base of the glass, and everything a driver
  // reads or reaches for hangs on the vertical fascia under that lip. Built the
  // other way round — one deep box with the instruments sunk into its front
  // half, which is where this started — the pad's own top surface hides the
  // cluster, the deck and the vents completely, and the whole dash reads as one
  // blank plane.
  // Its forward edge lands ON the cowl line and not a centimetre under it: the
  // body loft is one-sided, so a 2 cm slot between the pad and the base of the
  // glass is a strip of daylight through the middle of the truck, and that is
  // exactly what it was.
  mb.quad([-hw, yPad, zDashBack], [-hw, c.yCowl, c.zCowl],
    [hw, c.yCowl, c.zCowl], [hw, yPad, zDashBack], shade(OPAL, 1.04));              // the shelf
  mb.box(0, c.yCowl - 0.025, c.zCowl - 0.015, hw * 2, 0.05, 0.05, shade(OPAL_DK, 1.1));  // the seal at the glass
  mb.box(0, yPad - 0.02, zDashBack + 0.01, hw * 2, 0.05, 0.05, shade(OPAL, 0.94));  // the lip
  // The defroster grille: a run of slots along the base of the glass. Two thirds
  // of what you see from a driver's seat is this shelf, and without a line
  // across it the whole dash is one grey plane the size of a garage door.
  const nSlot = Math.max(6, Math.round(hw * 12));
  const zSlot = c.zCowl - 0.085;
  // The shelf is a single quad, so a slot sunk into it is a slot behind it and
  // invisible; these sit a few millimetres proud instead.
  const ySlot = yPad + (c.yCowl - yPad) * ((zSlot - zDashBack) / (c.zCowl - zDashBack)) + 0.005;
  for (let k = 0; k < nSlot; k++) {
    const u = (k + 0.5) / nSlot;
    mb.box((-1 + 2 * u) * (hw - 0.06), ySlot, zSlot,
      (hw * 2 - 0.12) / nSlot - 0.024, 0.012, 0.050, shade(OPAL_DK, 0.85));
  }
  mb.box(0, yPad - 0.17, zF, hw * 2, 0.30, 0.05, opal);                             // the fascia
  mb.box(0, yPad - 0.36, zF + 0.10, hw * 2, 0.14, 0.22, opalLo);                    // knee bolster

  // Four vents: two outboard, two either side of the stack, each a dark recess
  // with three slats. Nothing on a dash reads as a dash faster.
  for (const [vx, vw] of [[hw - 0.13, 0.19], [0.30 * sideD, 0.15], [-0.04 * sideD, 0.15], [-(hw - 0.13), 0.19]]) {
    mb.box(vx, yPad - 0.075, zF - 0.028, vw, 0.070, 0.02, opalDk);
    for (let k = -1; k <= 1; k++) {
      mb.box(vx, yPad - 0.075 + k * 0.022, zF - 0.040, vw - 0.02, 0.007, 0.006, shade(SLATE, 1.3));
    }
  }

  if (ranger) {
    // The passenger-side tray: a dusty recessed shelf moulded into the pad,
    // open at the top, the one place in the truck anything ever gets put. The
    // dust is a lighter, flatter grey laid on the floor of it — nine years of
    // it, and nobody has ever wiped it out.
    const tx = -0.42, tw = 0.44;
    mb.box(tx, yPad - 0.055, zDashBack + 0.16, tw, 0.02, 0.20, shade(OPAL_DK, 1.1));   // the floor of it
    mb.box(tx, yPad - 0.044, zDashBack + 0.16, tw - 0.03, 0.002, 0.17, shade(0x9a978c, 1.0));  // the dust
    mb.box(tx, yPad - 0.022, zDashBack + 0.055, tw, 0.06, 0.02, opal);                 // front lip
    for (const sx of [-1, 1]) mb.box(tx + sx * tw / 2, yPad - 0.022, zDashBack + 0.16, 0.02, 0.06, 0.20, opal);
  }

  // ---- instrument binnacle ----------------------------------------------
  // Only the brow here: it is moulded plastic and it takes the sun like the
  // rest of the dash. The cluster itself is buildCluster(), drawn unlit.
  mb.tower(eye[0], yPad - 0.055, zF - 0.046, 0.54, 0.10, 0.055, opal, { dTop: 0.16, dz: -0.04 });

  // ---- centre stack: the factory cassette deck ---------------------------
  mb.box(0, yPad - 0.20, zF - 0.012, 0.24, 0.30, 0.05, opalDk);                     // the bezel
  mb.box(0, yPad - 0.145, zF - 0.032, 0.20, 0.09, 0.02, slate);                     // the head unit face
  // The slot. A dark recess, and there is a tape in it — or there would be, if
  // the adapter were not.
  mb.box(0, yPad - 0.150, zF - 0.045, 0.135, 0.016, 0.02, shade(SLATE, 0.35));
  for (const kx of [-0.075, 0.075]) {
    mb.box(kx, yPad - 0.112, zF - 0.045, 0.026, 0.026, 0.014, shade(SLATE, 1.8));   // the two knobs
  }
  for (const kx of [-0.055, 0, 0.055]) {                                            // heater sliders
    mb.box(kx, yPad - 0.27, zF - 0.040, 0.030, 0.012, 0.010, shade(SLATE, 1.6));
  }
  mb.box(0, yPad - 0.27, zF - 0.026, 0.20, 0.09, 0.03, shade(OPAL_DK, 0.9));        // the heater controls

  // ---- steering column ---------------------------------------------------
  mb.tower(eye[0] + 0.05, c.yWheel - 0.30, c.zWheel - 0.14, 0.11, 0.11, 0.30, opalLo,
    { wTop: 0.09, dTop: 0.09, dz: 0.10 });
  for (const sx of [1, -1]) {   // indicator and wiper stalks
    mb.box(eye[0] + 0.05 + sx * 0.10, c.yWheel - 0.02, c.zWheel - 0.10, 0.12, 0.014, 0.014, slate);
  }
  // Pedals, because you can see your own feet from here and an empty floor pan
  // is the emptiest thing in the frame.
  for (const [px, pw] of [[eye[0] + 0.02, 0.09], [eye[0] - 0.16, 0.075]]) {
    mb.box(px, floor + 0.10, c.zCowl - 0.30, pw, 0.13, 0.02, rubber);
  }

  // ---- A-pillars, header rail, roof edge ---------------------------------
  // The pillars run from the cowl corner up to the header. Two tapered towers
  // with a dz lean; the loft outside does the same thing for the body.
  const pillarLean = c.zHeader - c.zCowl;
  for (const sx of [1, -1]) {
    mb.tower(sx * (hw - 0.03), c.yCowl - 0.02, c.zCowl - 0.04, 0.09, 0.10,
      c.yHeader - c.yCowl + 0.04, opal,
      { wTop: 0.075, dTop: 0.085, dz: pillarLean + 0.03, dx: -sx * 0.03 });
  }
  mb.box(0, c.yHeader - 0.03, c.zHeader + 0.03, hw * 2, 0.07, 0.08, opal);            // header rail
  for (const sx of [1, -1]) {   // roof side rails, back to the rear wall
    mb.box(sx * (hw - 0.02), c.yRoof - 0.05, (c.zHeader + c.zBack) / 2,
      0.06, 0.09, Math.abs(c.zHeader - c.zBack) + 0.06, opal);
  }

  // Two sun visors, folded up. Between them: bare glass. The rear-view mirror
  // came off this windshield years ago and there is deliberately nothing here —
  // no stub, no bracket, no ring of old adhesive. That absence is the detail.
  for (const sx of [1, -1]) {
    mb.box(sx * 0.33, c.yHeader - 0.055, c.zHeader + 0.10, 0.42, 0.015, 0.16, shade(HEADLINER, 0.94));
  }

  // ---- the rear wall -----------------------------------------------------
  // Trim panel below the backlight, the sill under it, and the two roof-to-wall
  // corners. Above `yBack` the glass is left open, exactly like the windshield:
  // look over your shoulder and you see the bed and the road, not a grey plate.
  mb.box(0, (floor + c.yBack) / 2, c.zBack, hw * 2, c.yBack - floor, 0.05, shade(OPAL, 0.94));
  mb.box(0, c.yBack + 0.03, c.zBack + 0.03, hw * 2, 0.06, 0.06, opal);                 // the sill
  mb.box(0, c.yRoof - 0.05, c.zBack + 0.05, hw * 2, 0.09, 0.06, opal);                 // the rear header

  // ---- headliner ---------------------------------------------------------
  const zLinerFront = c.zHeader + 0.02, zLinerBack = c.zBack + 0.04;
  headliner(mb, c, hw - 0.03, zLinerBack, zLinerFront, ranger ? 0.055 : 0.012, rgb(HEADLINER));
  if (ranger) {
    // The two thumbtacks. Pushed in at the front corners, which is where it
    // started letting go, and they are the reason the sag is a curve and not a
    // collapse.
    for (const sx of [1, -1]) {
      mb.cyl(sx * 0.30, c.yRoof - 0.042, zLinerFront - 0.16, 0.011, 0.006, 8, rgb(TACK), 'y', true);
    }
  }

  // ---- door cards --------------------------------------------------------
  const zDoorC = (c.zCowl + c.zBack) / 2 + 0.05;
  const doorD = Math.max(0.55, (c.zCowl - c.zBack) - 0.30);
  for (const sx of [1, -1]) {
    mb.box(sx * (hw + 0.01), c.yCowl - 0.30, zDoorC, 0.03, 0.56, doorD, opal);         // the card
    mb.box(sx * (hw - 0.04), c.yCowl - 0.15, zDoorC, 0.09, 0.06, doorD - 0.15, shade(OPAL, 1.05));  // armrest
    mb.box(sx * (hw - 0.02), c.yCowl - 0.02, zDoorC, 0.05, 0.03, doorD - 0.03, opalLo);  // window sill
    mb.box(sx * (hw - 0.03), c.yCowl - 0.10, zDoorC + 0.30, 0.05, 0.03, 0.10, shade(SLATE, 1.6));  // handle
    mb.box(sx * (hw - 0.02), c.yCowl - 0.22, zDoorC + 0.36, 0.04, 0.05, 0.05, slate); // window crank
    if (ranger) mb.box(sx * (hw - 0.01), c.yCowl - 0.40, zDoorC - 0.10, 0.03, 0.14, 0.30, shade(OPAL, 0.90));  // scuffed lower card
  }

  // ---- the bench ---------------------------------------------------------
  // A truck bench, three across, one piece. On a car this is two buckets, but
  // one slab of vinyl behind the driver is all that is ever in frame.
  const yCush = floor + 0.33, zCush = eye[2] - 0.19;
  mb.tower(0, yCush - 0.16, zCush, hw * 2 - 0.10, 0.46, 0.16, vinyl, { top: shade(VINYL, 1.08) });
  mb.tower(0, yCush, zCush - 0.30, hw * 2 - 0.10, 0.16, 0.30, shade(VINYL, 0.96), { dz: -0.07 });
  if (ranger) {
    // Two seams down the bench, and the split where the back folds forward.
    for (const sx of [1, -1]) {
      mb.box(sx * 0.28, yCush + 0.005, zCush, 0.02, 0.01, 0.44, shade(VINYL, 0.78));
    }
  }

  if (ranger) {
    // ---- the shift boot --------------------------------------------------
    // The stick itself is buildStick(): it leans with the gear. What stays here
    // is the accordion boot, four ribs of black rubber round the tunnel hole.
    const gz = c.zWheel - 0.10, gy = floor + 0.22;
    mb.tower(-0.02, gy - 0.09, gz, 0.20, 0.20, 0.09, rubber, { wTop: 0.11, dTop: 0.11 });
    for (let k = 0; k < 4; k++) {
      const kk = k / 3;
      mb.box(-0.02, gy + 0.01 + k * 0.035, gz, 0.135 - kk * 0.045, 0.016, 0.135 - kk * 0.045,
        shade(RUBBER, 1.5 + k * 0.15));
    }

    // ---- the MuVo, and the cord that reaches it --------------------------
    // 512 MB, a jog wheel and a monochrome strip, sitting on the bench beside
    // you because there is nowhere else in this truck to put anything.
    const mx = -0.30, my = yCush + 0.012, mz = zCush + 0.06;
    mb.box(mx, my, mz, 0.075, 0.024, 0.048, rgb(MUVO_BLUE));
    mb.box(mx, my + 0.013, mz + 0.006, 0.048, 0.002, 0.020, shade(0x9fb4c8, 1.0));    // the LCD
    mb.cyl(mx, my + 0.013, mz - 0.014, 0.011, 0.003, 10, shade(MUVO_BLUE, 1.35), 'y', true);
    cord(mb, [0, yPad - 0.150, zF - 0.055], [mx + 0.03, my + 0.012, mz - 0.02],
      9, 0.007, rgb(CORD), 0.06);
  }

  mb.finish();
  return mb;
}

/**
 * The steering wheel, authored in its own frame: centred on the origin, lying
 * in the XY plane with its axis along +Z. main.js turns it by composing a local
 * matrix with `roll = -steer * 1.6` and multiplying it onto the car's, so the
 * wheel spins about its own hub and nothing else in the cab moves.
 */
export function buildWheelMesh(spec) {
  if (!hasCockpit(spec)) return null;
  const c = cabOf(spec), R = c.wheelR;
  const mb = new MeshBuilder();
  const dark = rgb(0x28292c), grip = rgb(0x1e1f22);
  torus(mb, R, 0.017, 20, 6, dark);
  // Two worn patches at ten and two, where nine years of hands have been.
  for (const a of [Math.PI * 0.72, Math.PI * 0.28]) {
    mb.box(Math.cos(a) * R, Math.sin(a) * R, 0, 0.05, 0.05, 0.042, grip);
  }
  // Three spokes: two low, one up the middle — the XL wheel, no airbag, no
  // buttons, no leather. bar() and not box(): an axis-aligned box on a diagonal
  // is not a spoke, it is a slab filling the whole quadrant between the hub and
  // the rim, and that is what this wheel was — two black plates where a driver
  // should have been able to read the speedometer through the wheel.
  for (const a of [Math.PI * 1.22, Math.PI * 1.78, Math.PI * 0.5]) {
    bar(mb, a, R - 0.030, 0.026, 0.014, -0.008, dark);
  }
  mb.cyl(0, 0, -0.012, 0.052, 0.028, 14, shade(0x28292c, 1.15), 'y', false);
  mb.box(0, 0, -0.028, 0.10, 0.10, 0.012, shade(0x28292c, 1.25));
  mb.box(0, 0, -0.036, 0.042, 0.020, 0.006, rgb(0x1f3f9a));       // the blue oval
  mb.finish();
  return mb;
}

/**
 * The floor shifter above the boot: shaft and knob, authored about its pivot at
 * the origin with the shaft running up +Y, so a lean is two rotations of the
 * local matrix. Trucks and the cars of 2004 that had one; nothing else.
 */
export function buildStick(spec) {
  if (!hasCockpit(spec) || spec.style === 'bus') return null;
  const mb = new MeshBuilder();
  const c = rgb(0x232427);
  // Long and curved: two segments, the upper one canted back toward the driver,
  // which is the whole shape of a Ranger's five-speed.
  mb.box(0, 0.09, 0, 0.020, 0.19, 0.020, c);
  mb.box(0, 0.24, 0.035, 0.020, 0.14, 0.030, c);
  mb.cyl(0, 0.325, 0.055, 0.030, 0.045, 12, shade(0x2c2d31, 1.2), 'y', true);   // the round knob
  mb.box(0, 0.348, 0.055, 0.030, 0.002, 0.030, shade(0xb8bcc0, 1.0));           // the shift pattern on top
  mb.finish();
  return mb;
}

/**
 * The instrument cluster: the black face, the speedometer, the fuel gauge, the
 * graduations round both, and the three dead lamps beside the live one.
 *
 * Its own mesh because it is drawn UNLIT, and that is not a cheat — instrument
 * lighting is exactly a surface that does not take the sun. Shaded like the rest
 * of the cab it was unreadable: the fascia faces backward and downward, so it
 * catches neither sun nor sky, and a black-on-black cluster behind a black wheel
 * rim is a cluster nobody can see at any hour of the day. Unlit, it reads on a
 * bright afternoon and it reads at midnight, which is what a real one does.
 */
export function buildCluster(spec) {
  if (!hasCockpit(spec)) return null;
  const c = cabOf(spec), eye = driverEye(spec);
  const mb = new MeshBuilder();
  const bx = eye[0], by = c.yInstr, bz = c.zFace - 0.030;
  mb.box(bx, by, bz, 0.50, 0.20, 0.014, rgb(CLUSTER));                    // the face
  dial(mb, bx + 0.10, by + 0.012, bz - 0.010, 0.082, 18, rgb(DIALFACE), rgb(DIALMARK));
  dial(mb, bx - 0.14, by + 0.012, bz - 0.010, 0.050, 12, rgb(DIALFACE), rgb(DIALMARK));
  // The dead lamps, inboard of the live one and clear of the wheel's spokes.
  // They are what makes the amber beside them read as ON.
  for (let k = 1; k <= 3; k++) {
    mb.box(bx + 0.075 - k * 0.052, by - 0.078, bz - 0.010, 0.040, 0.022, 0.004, rgb(DEADLAMP));
  }
  mb.finish();
  return mb;
}

/**
 * The CHECK ENGINE telltale, alone, so it can be skipped when the lamp is out.
 * An OBD-I light is either on or it is not, and this one has been on since 1999.
 */
export function buildTelltale(spec) {
  if (!hasCockpit(spec)) return null;
  const c = cabOf(spec), eye = driverEye(spec);
  const mb = new MeshBuilder();
  mb.box(eye[0] + 0.075, c.yInstr - 0.078, c.zFace - 0.042, 0.044, 0.024, 0.004, rgb(AMBER));
  mb.finish();
  return mb;
}

/**
 * One needle, authored about its pivot at the origin pointing up +Y in the XY
 * plane. Drawn twice: road speed on the big dial, tank on the small one.
 */
export function buildNeedle(len = 0.075) {
  const mb = new MeshBuilder();
  const c = rgb(NEEDLE);
  mb.box(0, len / 2, 0, 0.006, len, 0.004, c);
  mb.cyl(0, 0, 0, 0.010, 0.008, 8, shade(NEEDLE, 0.7), 'y', true);
  mb.finish();
  return mb;
}

/**
 * The hairline crack, low on the passenger side, lying in the plane of the
 * windshield. Drawn translucent, which puts it in the renderer's transparent
 * pass — depth-tested against the dash but not depth-written, so it neither
 * flickers against the glass line nor hides anything behind it.
 *
 * It is a RUNNING crack and not a bullseye: four short segments that wander a
 * few millimetres off the line between their ends, the way glass actually
 * splits, and it stays on the -X half and low.
 */
export function buildCrack(spec) {
  if (!spec || spec.id !== 'ranger') return null;
  const c = cabOf(spec);
  const mb = new MeshBuilder();
  // A point on the glass, `u` up the windshield and `off` across it. The plane
  // is pulled 12 mm into the cab so the quad never fights the body loft.
  const at = (u, off) => {
    const y = c.yCowl + (c.yHeader - c.yCowl) * u;
    const z = c.zCowl + (c.zHeader - c.zCowl) * u;
    return [off, y - 0.012, z + 0.010];
  };
  const pts = [at(0.03, -0.70), at(0.10, -0.55), at(0.13, -0.40), at(0.22, -0.26), at(0.26, -0.15)];
  const w = 0.0016;   // one pixel at any sane resolution is about 1.5 mm at this range
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    mb.quad([a[0], a[1] - w, a[2]], [b[0], b[1] - w, b[2]],
      [b[0], b[1] + w, b[2]], [a[0], a[1] + w, a[2]], rgb(0xdfe6ea));
  }
  mb.finish();
  return mb;
}

/**
 * Exterior details drawn with the car in EVERY view, so what you see out of the
 * side window from the seat is the same object the chase cam sees.
 *
 * cars.js already puts a small black block where each mirror goes. That block
 * is the right colour and the right place and the wrong shape: a 1993 XL wears
 * a non-folding rectangular paddle on a steel loop bracket. This grows the
 * paddle round the block and adds the bracket, so no spec file has to change
 * and there is no chrome anywhere. It also carries the wipers (parked at the
 * cowl, in frame from the seat and from behind), the rust along the cowl seam
 * and the hood misalignment.
 *
 * The mirrors do not reflect. A second render pass per mirror to show a road
 * you already have behind you is not worth a frame; the glass is a dark quad,
 * which is what a mirror looks like from the wrong angle anyway.
 */
export function buildExtras(spec) {
  if (!hasCockpit(spec) || spec.style === 'bus') return null;
  const s = spec;
  const mb = new MeshBuilder();
  const blk = shade(0x2e3033, 0.85), glass = rgb(GLASSDK), steel = shade(0x2e3033, 1.15);
  const tMirror = s.style === 'truck' ? 0.69 : s.glassSide[1] - 0.03;
  const hw = pl(s.plan, tMirror);
  const beltY = Math.min(pl(s.belt, tMirror), pl(s.top, tMirror));
  const zM = tToZ(s, tMirror);
  const yM = beltY + 0.08;
  for (const sx of [1, -1]) {
    const x = sx * (hw + 0.13);
    mb.box(x, yM, zM, 0.055, 0.23, 0.17, blk);                       // the paddle housing
    mb.box(x - sx * 0.030, yM, zM - 0.005, 0.006, 0.19, 0.14, glass); // the glass, facing back and in
    // The loop bracket: two arms off the door skin and a stem between them.
    for (const dy of [0.09, -0.09]) {
      mb.box(sx * (hw + 0.065), yM + dy, zM + 0.01, 0.13, 0.016, 0.016, steel);
    }
    mb.box(sx * (hw + 0.125), yM, zM + 0.01, 0.016, 0.20, 0.016, steel);
  }
  if (s.id === 'ranger') {
    // The web. Ragged strands off the driver's mirror that have survived every
    // trip down the 148 this summer, and they are still there — with two dried
    // pine needles caught in them, which is the part that makes it a real web
    // and not a cobweb decal.
    const x = (hw + 0.13);
    for (const [dy, dz, l] of [[0.10, 0.10, 0.16], [0.02, 0.13, 0.20], [-0.07, 0.09, 0.13]]) {
      mb.box(x - 0.05, yM + dy + l * 0.15, zM + dz / 2, 0.004, l * 0.3, dz, rgb(WEB));
    }
    mb.box(x - 0.05, yM + 0.055, zM + 0.075, 0.006, 0.055, 0.008, rgb(NEEDLEPINE));
    mb.box(x - 0.05, yM - 0.010, zM + 0.055, 0.006, 0.045, 0.012, rgb(NEEDLEPINE));

    // Wipers, parked at the cowl.
    const tC = s.glassTop[s.glassTop.length - 1][1];
    const zC = tToZ(s, tC) + 0.03, yC = pl(s.top, tC) - 0.01;
    for (const sx of [1, -1]) {
      mb.box(sx * 0.30, yC + 0.012, zC + 0.02, 0.62, 0.014, 0.020, shade(0x2e3033, 0.8));
      mb.box(sx * 0.30, yC + 0.024, zC + 0.02, 0.10, 0.022, 0.022, shade(0x2e3033, 0.7));
    }
    // The hinge. The loft cannot raise one corner of the hood — the profiles are
    // symmetric about X by construction — so the misalignment is added here: a
    // 15 mm sliver of body colour standing proud of the driver's side of the
    // cowl seam, with the dark gap under it. It is the first thing you see over
    // the wheel and it is why the truck looks like it has been hit.
    const tH = tC + 0.030, zH = tToZ(s, tH), yH = pl(s.top, tH);
    mb.box(0.42, yH + 0.016, zH, 0.62, 0.015, 0.10, shade(s.body, 1.0));
    mb.box(0.42, yH + 0.004, zH + 0.055, 0.62, 0.016, 0.012, shade(0x2e3033, 0.7));
    // And the rust: a thin uneven line of orange-brown where the cowl seam
    // holds water every March. Three pieces, none of them the same length,
    // because a rust line that repeats reads as a stripe.
    for (const [rx, rw] of [[0.52, 0.34], [0.10, 0.16], [-0.36, 0.44]]) {
      mb.box(rx, yH + 0.009, zH - 0.045, rw, 0.004, 0.030, shade(RUST, 1.0));
    }
  }
  mb.finish();
  return mb;
}

// ---------------------------------------------------------------- the view

const LAMP_OPTS = { unlit: true };
const CRACK_OPTS = { alpha: 0.42, unlit: true };
// The needles and the cluster's graduations are lit from behind, which is what
// instrument lighting IS: they take no sun, no cab shadow and no night. Drawing
// them shaded made an orange needle into a brown one behind a black wheel rim.
const NEEDLE_OPTS = { unlit: true };
// The inside of a cab is in the cab's own shadow, and the renderer has no such
// thing: an up-facing dash pad takes the full sky term and comes out the pale
// blue of a sidewalk, brighter than the white hood in front of it. This is that
// shadow, as one multiply — a little bluer than neutral because what light does
// get in here has bounced off the glass.
const CAB_OPTS = { colorMul: new Float32Array([0.52, 0.53, 0.58]) };

/**
 * Per-frame state for the driver's view: what the head is doing, and the two
 * matrices main.js needs. One instance on G, built on the first frame that has
 * a renderer, exactly like G.avatars.
 */
export class Cockpit {
  constructor(renderer) {
    this.r = renderer;
    this.cache = new Map();          // spec.id -> uploaded meshes
    this.needle = null;
    this.dip = 0;                    // head pitch from longitudinal accel, radians
    this.lastV = 0;
    this.shiver = 0;                 // 0..1: how much the idle is coming through
    this.head = 0;                   // head yaw, radians: 0 forward, +HEAD_TURN left
    this.t = 0;
    this._m = m4.create();
    this._l = m4.create();
  }

  /** Uploaded meshes for a spec, built once. */
  meshes(spec) {
    let m = this.cache.get(spec.id);
    if (m) return m;
    const up = (b) => (b && !b.empty ? this.r.upload(b) : null);
    m = {
      cab: up(buildCockpit(spec)),
      wheel: up(buildWheelMesh(spec)),
      stick: up(buildStick(spec)),
      clus: up(buildCluster(spec)),
      lamp: up(buildTelltale(spec)),
      crack: up(buildCrack(spec)),
      ext: up(buildExtras(spec)),
      eye: driverEye(spec),
      cab0: hasCockpit(spec) ? cabOf(spec) : null,
    };
    if (!this.needle) this.needle = this.r.upload(buildNeedle());
    this.cache.set(spec.id, m);
    return m;
  }

  /**
   * Head motion. Four things, all small, all real:
   *   - the dip. You pitch forward into a stop and settle back off the line.
   *     Off measured longitudinal acceleration, clamped at two and a half
   *     degrees, which is as much as a neck gives before it is a whiplash gag.
   *   - the shiver. A 2.3 L four idling at 800 rpm through nine-year-old mounts
   *     puts a couple of millimetres into the rim. It stops the moment the
   *     truck is moving, because then the road is louder than the engine.
   *   - the turn. Shift is hold-to-look everywhere else in the game; in here it
   *     is a neck, not a camera flip, so it eases rather than cuts.
   *   - the settle. All of them damped, not stepped, so a bump does not tick.
   */
  update(dt, G) {
    const v = G.veh;
    if (!v || !dt) return;
    this.t += dt;
    const a = (v.vLong - this.lastV) / Math.max(dt, 1e-3);
    this.lastV = v.vLong;
    // Braking is negative a and should tip the head FORWARD (positive pitch is
    // nose-up in the camera, so the dip is negative).
    const want = clamp(a * 0.010, -0.0436, 0.0436);      // +-2.5 degrees
    this.dip += (want - this.dip) * Math.min(1, dt * 9);
    // Idle: the gearbox knows the real rpm; without it, standing still is the
    // same tell.
    const gb = G.gearbox;
    const rpm = gb ? gb.rpm : 0;
    const idling = gb
      ? (rpm > 1 && rpm < 1250 && Math.abs(v.vLong) < 1.2)
      : Math.abs(v.vLong) < 0.5;
    this.shiver += ((idling ? 1 : 0) - this.shiver) * Math.min(1, dt * 6);
    const wantHead = G.lookBack ? HEAD_TURN : 0;
    this.head += (wantHead - this.head) * Math.min(1, dt * 9);
  }

  /** The 12 Hz tremble, in metres. `k` scales it per part. */
  wobble(k) {
    return Math.sin(this.t * 75.4) * this.shiver * k;
  }

  /**
   * The camera, as a world matrix, for a car whose model matrix is `model`.
   *
   * Composed rather than smoothed: the camera sits INSIDE the car's frame, and
   * any lag at all makes the dash swim, because the dash is drawn in that frame
   * and the eye would not be. Multiplying the eye's local transform onto the
   * car's model matrix also gets the body's pitch and roll for free and with
   * the right signs, which hand-composed Euler angles would not.
   *
   * The local yaw is PI because car-local +Z is forward and a camera looks down
   * its own -Z; +head then turns toward +X, which is the driver's left, which is
   * the shoulder you can actually look over.
   *
   * Writes the eye's world position into `eye` and returns the matrix.
   */
  view(out, eye, model, spec, pitch) {
    const e = this.meshes(spec).eye;
    if (!e) return null;
    m4.compose(this._l, e[0], e[1] + this.wobble(0.0004), e[2],
      Math.PI + this.head, pitch + this.dip, 0);
    m4.mul(out, model, this._l);
    eye[0] = out[12]; eye[1] = out[13]; eye[2] = out[14];
    return out;
  }

  /**
   * Draw the cab. `model` is the car's own model matrix — the same one drawCar
   * built — so everything here inherits bodyY, pitch and roll for free.
   */
  draw(G, model, spec, opts) {
    const r = this.r, m = this.meshes(spec);
    if (!m.cab) return;
    const c = m.cab0;
    opts = opts || CAB_OPTS;
    r.draw(m.cab, model, opts);

    // The wheel: its own frame, hub at the column, raked back, yawed by the
    // steering. 1.6 turns of rim per unit of `steer` is roughly the 3.2 turns
    // lock to lock a Ranger's unassisted rack actually has.
    const steer = (G.veh && G.veh.steer) || 0;
    const wob = this.wobble(0.0018);
    this.local(m.eye[0] + 0.05, c.yWheel + wob, c.zWheel, 0, c.rake, -steer * 1.6);
    m4.mul(this._m, model, this._l);
    r.draw(m.wheel, this._m, opts);

    // The shifter. Its lean follows the gear when the gearbox has one: an H
    // pattern is left/right by pair and forward/back by row, and reverse is
    // over and back.
    if (m.stick) {
      const gb = G.gearbox;
      const g = gb ? gb.gear : 1;
      const col = g === 0 ? 1 : Math.floor((clamp(g, 1, 6) - 1) / 2) - 0.5;
      const row = g === 0 ? -1 : (g % 2 === 1 ? 1 : -1);
      const gz = c.zWheel - 0.10, gy = c.floorY + 0.22;
      this.local(-0.02, gy, gz, 0, -row * 0.16, -col * 0.20);
      m4.mul(this._m, model, this._l);
      r.draw(m.stick, this._m, opts);
    }

    // The needles. Speed sweeps 0-160 over 240 degrees from seven o'clock; the
    // fuel needle does a quarter of that arc off whatever is in the tank.
    const by = c.yInstr + 0.012, bz = c.zFace - 0.044;
    const kmh = clamp((G.veh && G.veh.speedKmh) || 0, 0, 160);
    this.local(m.eye[0] + 0.10, by, bz, 0, 0, -2.094 + 4.189 * (kmh / 160));
    m4.mul(this._m, model, this._l);
    r.draw(this.needle, this._m, NEEDLE_OPTS);
    const tank = G.fuelTank || 0, lit = G.fuel;
    if (tank > 0 && lit != null) {
      this.local(m.eye[0] - 0.14, by, bz, 0, 0,
        -1.047 + 2.094 * clamp(lit / tank, 0, 1), 0.55);
      m4.mul(this._m, model, this._l);
      r.draw(this.needle, this._m, NEEDLE_OPTS);
    }

    // The cluster and CHECK ENGINE. Unlit, because that is what instrument
    // lighting is: a bulb behind an amber lens is a bulb, not a painted square.
    if (m.clus) r.draw(m.clus, model, LAMP_OPTS);
    if (m.lamp) r.draw(m.lamp, model, LAMP_OPTS);
    // The crack goes last, translucent, into the transparent pass.
    if (m.crack) r.draw(m.crack, model, CRACK_OPTS);
  }

  /** Compose a local (in-car) transform into this._l. */
  local(x, y, z, yaw, pitch, roll, s = 1) {
    return m4.compose(this._l, x, y, z, yaw, pitch, roll, s, s, s);
  }

  /** The exterior bits, drawn with the car in every camera. */
  drawExtras(model, spec, opts) {
    if (!hasCockpit(spec)) return;
    const m = this.meshes(spec);
    if (m.ext) this.r.draw(m.ext, model, opts);
  }
}
