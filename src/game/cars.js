// The four cars, and the arcade driving model.
// Local car space: +Z is forward, +X is the driver's LEFT (right-handed GL axes), y=0 ground.
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { clamp } from '../core/math.js';
import { SURF, FLAT } from './terrain.js';

const TIRE = 0x17181a, GLASS = 0x26313b, CHROME = 0xd4d6d8;
const LAMP = 0xfff3c4, TAIL = 0xc0332a, AMBER = 0xf0a030, PLATE = 0xe8e6dc, TRIM = 0x2e3033;

// Real dimensions (metres). `wheelbase`/`overhangF` place the axles; the mesh
// origin is the midpoint between axles so wheels sit at ±wheelbase/2.
// Profiles are keyed by t: 0 = rear bumper, 1 = front bumper.
//   top:      [[t, y], ...] upper body surface (deck, backlight, roof, windshield, hood, fascia)
//   belt:     [[t, y], ...] height where the body stops and the glass (tumblehome) starts
//   plan:     [[t, halfWidth], ...] half width seen from above
//   roofK:    roof half width as a fraction of body half width (number, or [[t, k]] profile)
//   tuck:     how far the rocker sits inside the belt line (lower-body taper)
//   glassTop: [t0, t1, yMin?] ranges where the upper surface is glass
//   glassSide: t-range of the side windows
//   cladding: { rocker, bumper, tRear, tFront, color } — lower cladding / bumper covers
//   bed:      [t0, t1, floorY] open pickup bed (the loft top drops to the floor)
//   track:    computed below from `plan` so the tyres stand just proud of the body
export const CARS = [
  {
    id: 'ranger', name: '1993 Ford Ranger XLT', who: 'Yours',
    body: 0xf3f1ea, seats: 2, style: 'truck',
    flavour: 'Regular cab, 2.3 four-banger, five-speed, three-across bench. Slow everywhere, stops nowhere, starts every time.',
    len: 4.78, wid: 1.77, h: 1.64, wheelbase: 2.75, overhangF: 0.80, track: 1.67, wheelR: 0.34,
    topSpeed: 36.5, accel: 3.5, brake: 8.0, grip: 0.80, steerMax: 0.50, mass: 1420,
    seatY: 1.28, seatZ: 0.30, seatX: 0.50, clearance: 0.30,
    // long flat hood, upright cab, open short bed with tall sides level with the door sills
    top: [[0, 1.16], [0.021, 1.16], [0.031, 0.74], [0.408, 0.74], [0.418, 1.16], [0.435, 1.16],
          [0.45, 1.60], [0.47, 1.64], [0.62, 1.64], [0.65, 1.61], [0.68, 1.42], [0.71, 1.22],
          [0.732, 1.12], [0.80, 1.09], [0.90, 1.04], [0.966, 1.00], [0.983, 0.95], [0.993, 0.80], [1, 0.62]],
    belt: [[0, 1.16], [0.03, 1.16], [0.04, 0.74], [0.40, 0.74], [0.41, 1.16], [0.735, 1.16], [0.75, 1.10], [1, 1.10]],
    plan: [[0, 0.84], [0.02, 0.87], [0.05, 0.875], [0.40, 0.875], [0.43, 0.86], [0.44, 0.885],
           [0.80, 0.885], [0.96, 0.87], [0.985, 0.85], [1, 0.80]],
    roofK: 0.82, tuck: 0.03,
    glassTop: [[0.435, 0.452, 1.24], [0.65, 0.732]], glassSide: [0.455, 0.70],
    bed: [0.031, 0.408, 0.74],
    cladding: { rocker: 0, bumper: 0.30, tRear: 0.02, tFront: 0.98, color: 0x3a3c40 },
  },
  {
    id: 'saturn', name: '1997 Saturn SL 4-door', who: "Marc's",
    body: 0x2f5fa8, seats: 3, style: 'sedan',
    flavour: 'Polymer door panels, so the parking-lot dings pop back out. Gutless, but it never quits.',
    len: 4.49, wid: 1.70, h: 1.39, wheelbase: 2.60, overhangF: 0.95, track: 1.64, wheelR: 0.30,
    topSpeed: 41.5, accel: 4.2, brake: 9.0, grip: 0.90, steerMax: 0.57, mass: 1130,
    seatY: 1.05, seatZ: 0.05, seatX: 0.40, clearance: 0.20,
    // wedge nose, long rising hood, fast windshield, short high deck
    top: [[0, 0.92], [0.02, 0.95], [0.06, 0.965], [0.17, 0.97], [0.21, 0.99], [0.25, 1.10], [0.30, 1.24],
          [0.35, 1.34], [0.40, 1.385], [0.46, 1.39], [0.55, 1.385], [0.60, 1.35], [0.66, 1.22], [0.72, 1.07],
          [0.76, 0.99], [0.80, 0.96], [0.90, 0.88], [0.965, 0.80], [0.985, 0.72], [1, 0.52]],
    belt: [[0, 0.92], [0.18, 0.94], [0.26, 0.985], [0.68, 0.985], [0.78, 0.96], [1, 0.96]],
    plan: [[0, 0.74], [0.03, 0.82], [0.10, 0.85], [0.80, 0.85], [0.90, 0.835], [0.96, 0.80], [1, 0.72]],
    roofK: 0.82, tuck: 0.035,
    glassTop: [[0.21, 0.40], [0.60, 0.76]], glassSide: [0.27, 0.66],
    cladding: { rocker: 0.10, bumper: 0.42, tRear: 0.03, tFront: 0.962, color: 0x50545a },
  },
  {
    id: 'civic', name: '1988 Honda Civic Si', who: "Steph's",
    body: 0xa8322b, seats: 3, style: 'hatch',
    flavour: 'Two thousand pounds of nothing, a 1.6 that begs for 7000, and a hatch you could sleep in.',
    len: 3.99, wid: 1.67, h: 1.33, wheelbase: 2.50, overhangF: 0.83, track: 1.61, wheelR: 0.29,
    topSpeed: 45.5, accel: 5.3, brake: 9.6, grip: 1.04, steerMax: 0.63, mass: 940,
    seatY: 0.98, seatZ: 0.0, seatX: 0.38, clearance: 0.20,
    // very low nose, flat hood, huge greenhouse, roof peaks at the B-pillar, gentle hatch glass to a tall tail
    top: [[0, 0.90], [0.015, 0.95], [0.03, 0.98], [0.05, 1.03], [0.09, 1.15], [0.13, 1.255], [0.16, 1.29],
          [0.22, 1.31], [0.32, 1.33], [0.44, 1.335], [0.52, 1.32], [0.57, 1.29], [0.62, 1.20], [0.68, 1.08],
          [0.735, 0.98], [0.78, 0.94], [0.90, 0.84], [0.96, 0.76], [0.985, 0.68], [1, 0.50]],
    belt: [[0, 0.92], [0.03, 0.95], [0.60, 0.95], [0.74, 0.94], [1, 0.94]],
    plan: [[0, 0.72], [0.03, 0.80], [0.10, 0.835], [0.80, 0.835], [0.92, 0.80], [0.97, 0.76], [1, 0.68]],
    roofK: 0.86, tuck: 0.03,
    glassTop: [[0.03, 0.155, 1.0], [0.57, 0.735]], glassSide: [0.15, 0.60],
    cladding: { rocker: 0.09, bumper: 0.36, tRear: 0.03, tFront: 0.965, color: 0x25272a },
    spoiler: true, sunroof: [0.40, 0.52],
  },
  {
    id: 'sunfire', name: '1997 Pontiac Sunfire', who: "Dave's",
    body: 0x1c8f83, seats: 3, style: 'coupe',
    flavour: 'Coupe, body-coloured cladding, one working speaker, and a spoiler that does absolutely nothing.',
    len: 4.60, wid: 1.72, h: 1.35, wheelbase: 2.64, overhangF: 1.00, track: 1.66, wheelR: 0.32,
    topSpeed: 44.0, accel: 4.5, brake: 9.0, grip: 0.92, steerMax: 0.58, mass: 1240,
    seatY: 1.0, seatZ: 0.05, seatX: 0.40, clearance: 0.20,
    // jellybean: low nose, arched roof, long doors, high rounded deck
    top: [[0, 0.88], [0.02, 0.93], [0.05, 0.97], [0.10, 0.99], [0.17, 1.00], [0.21, 1.02], [0.25, 1.12],
          [0.30, 1.24], [0.35, 1.315], [0.40, 1.345], [0.46, 1.35], [0.53, 1.34], [0.58, 1.31], [0.63, 1.22],
          [0.70, 1.08], [0.755, 0.98], [0.80, 0.94], [0.90, 0.85], [0.965, 0.76], [0.985, 0.68], [1, 0.50]],
    belt: [[0, 0.93], [0.16, 0.95], [0.25, 0.99], [0.66, 0.99], [0.76, 0.96], [1, 0.96]],
    plan: [[0, 0.70], [0.03, 0.80], [0.08, 0.84], [0.16, 0.86], [0.80, 0.86], [0.92, 0.82], [0.97, 0.76], [1, 0.66]],
    roofK: 0.78, tuck: 0.05,
    glassTop: [[0.21, 0.40], [0.58, 0.755]], glassSide: [0.26, 0.64],
    cladding: { rocker: 0.12, bumper: 0.40, tRear: 0.03, tFront: 0.962, color: 0x1a7f75, ribbed: true },
    spoiler: true,
  },
];
// D2 — what the handbrake leaves you. `hbGrip` scales lateral grip while the
// lever is up and `hbYaw` scales the yaw the steering asks for: the Ranger is
// tall and dumb and just ploughs, the Civic pivots on its nose.
const HANDBRAKE = {
  ranger:  { hbGrip: 0.72, hbYaw: 1.06 },
  saturn:  { hbGrip: 0.42, hbYaw: 1.42 },
  civic:   { hbGrip: 0.24, hbYaw: 1.82 },
  sunfire: { hbGrip: 0.36, hbYaw: 1.52 },
};
// C5 — the procedural engine, per car. `f0`/`span` are the fundamental in Hz at
// idle and at the redline; `sub` is the octave-down square's ratio, `o2g` how
// much of it you hear; `cut0`/`cutSpan` open the lowpass with revs; `rattle` is
// the Sunfire's blown door speaker, which only buzzes once you're moving.
const SOUND = {
  ranger:  { f0: 32, span: 132, sub: 0.50, o2g: 0.64, cut0: 235, cutSpan: 1250, gain: 1.15,
             type1: 'sawtooth', type2: 'square', rattle: 0, rattleFrom: 0 },
  saturn:  { f0: 44, span: 205, sub: 0.50, o2g: 0.46, cut0: 340, cutSpan: 2100, gain: 1.00,
             type1: 'sawtooth', type2: 'square', rattle: 0, rattleFrom: 0 },
  civic:   { f0: 54, span: 335, sub: 0.50, o2g: 0.20, cut0: 430, cutSpan: 3050, gain: 0.92,
             type1: 'sawtooth', type2: 'sawtooth', rattle: 0, rattleFrom: 0 },
  sunfire: { f0: 46, span: 240, sub: 0.50, o2g: 0.32, cut0: 365, cutSpan: 2350, gain: 1.02,
             type1: 'sawtooth', type2: 'square', rattle: 0.55, rattleFrom: 40 },
};
const WHEEL_W = (s) => (s.style === 'truck' ? 0.24 : 0.20);
const WHEEL_PROUD = 0.07;   // tyre outer face this far outside the body at the axle
for (const c of CARS) {
  c.axleZ = c.wheelbase / 2;
  // Track from the plan: the tyre's outer face stands just proud of the widest axle station.
  const rearOverhang = c.len - c.wheelbase - c.overhangF;
  const hwAxle = Math.max(pl(c.plan, rearOverhang / c.len), pl(c.plan, (rearOverhang + c.wheelbase) / c.len));
  c.track = Math.round(2 * (hwAxle + WHEEL_PROUD - WHEEL_W(c) / 2) * 100) / 100;
  Object.assign(c, HANDBRAKE[c.id]);
  c.sound = SOUND[c.id];
}

export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];

// ---------------------------------------------------------------- loft

// Piecewise-linear lookup on [[t, v], ...].
export function pl(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0 || 1e-6));
    }
  }
  return pts[pts.length - 1][1];
}
const inRange = (ranges, t, y = Infinity) => ranges.some(([a, b, yMin = -Infinity]) => t >= a && t <= b && y >= yMin);

// z of a profile point: t=0 is the rear bumper; origin is between the axles.
export function tToZ(s, t) {
  const rearOverhang = s.len - s.wheelbase - s.overhangF;
  return t * s.len - rearOverhang - s.wheelbase / 2;
}

/**
 * Lofts a car body from profile functions. `ring(t)` must return 6 points
 * [ [x,y] ... ] in cross-section order: bottom-left, belt-left, roof-left,
 * roof-right, belt-right, bottom-right (x = local +X = car's left).
 * `paint(face, t, y)` returns [color, u, v] for a vertex on that face:
 * faces are 'bottom','sideL','glassL','top','glassR','sideR','front','rear'.
 */
export function loft(mb, s, n, ring, paint) {
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    rings.push({ t, z: tToZ(s, t), p: ring(t) });
  }
  const FACES = ['bottom', 'sideL', 'glassL', 'top', 'glassR', 'sideR'];
  // Edge k of the ring goes from point k to point k+1 (mod 6):
  // 0: bottom(5->0)... define explicitly for clarity.
  const EDGE = [[5, 0], [0, 1], [1, 2], [2, 3], [3, 4], [4, 5]];
  for (let i = 0; i < n; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < 6; k++) {
      const [a, b] = EDGE[k];
      const face = FACES[k];
      const p0 = [A.p[a][0], A.p[a][1], A.z], p1 = [A.p[b][0], A.p[b][1], A.z];
      const p2 = [B.p[b][0], B.p[b][1], B.z], p3 = [B.p[a][0], B.p[a][1], B.z];
      // normal from the quad, but skip degenerate (collapsed) quads
      const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
      const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-7) continue;
      nx /= l; ny /= l; nz /= l;
      const cA = paint(face, A.t, (p0[1] + p1[1]) / 2, A), cB = paint(face, B.t, (p2[1] + p3[1]) / 2, B);
      const uv = (P, R, col) => paint(face, R.t, P[1], R, P);
      const v0 = uv(p0, A), v1 = uv(p1, A), v2 = uv(p2, B), v3 = uv(p3, B);
      const i0 = mb.vert(p0[0], p0[1], p0[2], nx, ny, nz, v0[0], v0[1], v0[2]);
      mb.vert(p1[0], p1[1], p1[2], nx, ny, nz, v1[0], v1[1], v1[2]);
      mb.vert(p2[0], p2[1], p2[2], nx, ny, nz, v2[0], v2[1], v2[2]);
      mb.vert(p3[0], p3[1], p3[2], nx, ny, nz, v3[0], v3[1], v3[2]);
      // p0->p1->p2->p3 is CCW seen from outside (ring runs CCW seen from +Z)
      mb.tri(i0, i0 + 1, i0 + 2); mb.tri(i0, i0 + 2, i0 + 3);
      void cA; void cB;
    }
  }
  // End caps: fan the 6-point ring.
  for (const [R, face, dir] of [[rings[0], 'rear', -1], [rings[n], 'front', 1]]) {
    const base = mb.vertCount;
    for (const q of R.p) {
      const c = paint(face, R.t, q[1], R, [q[0], q[1], R.z]);
      mb.vert(q[0], q[1], R.z, 0, 0, dir, c[0], c[1], c[2]);
    }
    for (let k = 1; k < 5; k++) {
      if (dir > 0) mb.tri(base, base + k, base + k + 1);
      else mb.tri(base, base + k + 1, base + k);
    }
  }
}

// The cross-section from the hand-authored profiles. The belt is clamped to
// the top surface, so wherever the two meet (hood, deck, pickup bed) the glass
// faces collapse and the loft skips them. `tuck` pulls the rocker in under the
// belt line; `roofK` narrows the greenhouse (tumblehome).
export function specRing(s, t) {
  const top = pl(s.top, t), belt = Math.min(pl(s.belt, t), top);
  const hw = pl(s.plan, t);
  const roofK = typeof s.roofK === 'number' ? s.roofK : pl(s.roofK, t);
  const roofHw = top > belt + 0.02 ? hw * roofK : hw;
  const lift = t < 0.03 ? (0.03 - t) / 0.03 : t > 0.97 ? (t - 0.97) / 0.03 : 0;   // approach/departure angles
  const yb = s.clearance + 0.12 * lift;
  const tuck = (s.tuck || 0) * Math.min(1, Math.max(0, (belt - yb) / 0.4));
  return [[hw - tuck, yb], [hw, belt], [roofHw, top], [-roofHw, top], [-hw, belt], [-(hw - tuck), yb]];
}

function specPaint(s) {
  const body = rgb(s.body), glass = rgb(GLASS), under = shade(0x1c1d20, 1);
  const cl = s.cladding || { rocker: 0, bumper: 0.3, tRear: 0, tFront: 1, color: TRIM };
  const clad = rgb(cl.color), dark = shade(s.body, 0.86);
  const bedFloor = s.bed ? s.bed[2] : -1;
  const bumperY = s.clearance + cl.bumper;
  const inBumper = (t) => t <= cl.tRear || t >= cl.tFront;
  return (face, t, y) => {
    if (face === 'bottom') return [under, 0, 0];
    if (face === 'glassL' || face === 'glassR') {
      return [inRange([s.glassSide], t) ? glass : body, 0, 0];
    }
    if (face === 'top') {
      if (s.bed && t > s.bed[0] && t < s.bed[1] && y < bedFloor + 0.02) return [shade(s.body, 0.55), 0, 0];
      if (inRange(s.glassTop, t, y)) return [glass, 0, 0];
      if (inBumper(t) && y < bumperY) return [clad, 0, 0];
      return [body, 0, 0];
    }
    if (face === 'sideL' || face === 'sideR') {
      // Colours are per vertex and interpolated across the quad, so a band
      // keyed on y would smear into a gradient; the bumper corners are keyed
      // on t only (uniform per ring) and the rocker cladding is a slab in addDetails.
      return [inBumper(t) ? clad : body, 0, 0];
    }
    // end caps: bumper cover low, painted tail/nose panel above
    if (y < bumperY) return [clad, 0, 0];
    return [dark, 0, 0];
  };
}

// Where the loft's upper surface / side are at a given t, for hanging details.
const topAt = (s, t) => pl(s.top, t);
const hwAt = (s, t) => pl(s.plan, t);
const beltAt = (s, t) => Math.min(pl(s.belt, t), pl(s.top, t));
// t of the two axles (the profiles are keyed by t, the wheels by z).
const axleT = (s, sign) => (sign * s.axleZ - tToZ(s, 0)) / s.len;

// Lights, grille, mirrors, arches: the details that make a car a *that* car.
export function addDetails(mb, s, opts = {}) {
  const zF = tToZ(s, 1), zR = tToZ(s, 0);
  const hwR = hwAt(s, 0.012);
  const z = (t) => tToZ(s, t);
  const dark = rgb(TRIM), lamp = rgb(LAMP), tail = rgb(TAIL), amber = rgb(AMBER);
  const bodyC = rgb(s.body), chrome = rgb(CHROME);
  const both = (fn) => { fn(1); fn(-1); };

  // ---- shared: wheel arches, mirrors, door handles, fuel door, plate
  both((sx) => {
    for (const sign of [1, -1]) {
      const zz = sign * s.axleZ, hw = hwAt(s, axleT(s, sign));
      // arch: a dark disc on the body side, its bottom resting on the ground line
      mb.cyl(sx * (hw - 0.03), s.wheelR + 0.05, zz, s.wheelR + 0.05, 0.08, 12, shade(TRIM, 0.8), 'x', true);
    }
  });
  if (!opts.noMirrors) {
    const tMirror = s.style === 'truck' ? 0.69 : s.glassSide[1] - 0.03;   // front of the door glass
    both((sx) => mb.box(sx * (hwAt(s, tMirror) + 0.09), beltAt(s, tMirror) + 0.08, z(tMirror), 0.16, 0.10, 0.13, dark));
  }
  const handles = s.style === 'sedan' ? [0.33, 0.56] : s.style === 'truck' ? [0.49] : s.style === 'hatch' ? [0.30] : [0.34];
  for (const th of handles) {
    both((sx) => mb.box(sx * (hwAt(s, th) + 0.006), beltAt(s, th) - 0.13, z(th), 0.012, 0.03, 0.14, dark));
  }
  // fuel door on the driver's (left, +X) rear quarter — on the truck it's on the bed side
  const tf = s.style === 'truck' ? 0.36 : s.style === 'hatch' ? 0.10 : 0.12;
  mb.box(hwAt(s, tf) + 0.004, beltAt(s, tf) - 0.16 + (s.style === 'truck' ? 0.02 : 0), z(tf), 0.008, 0.15, 0.15, shade(s.body, 0.9));
  // rocker cladding: a slab between the wheel arches, sitting just proud of the tucked-in sill
  if (s.cladding && s.cladding.rocker > 0) {
    const zA = -s.axleZ + s.wheelR + 0.10, zB = s.axleZ - s.wheelR - 0.10;
    const hRock = s.cladding.rocker, tMid = axleT(s, 0);
    const ring = specRing(s, tMid), sillX = ring[0][0], beltX = ring[1][0], sillY = ring[0][1], beltY = ring[1][1];
    const xTop = sillX + (beltX - sillX) * (hRock / Math.max(0.01, beltY - sillY));   // body x at the slab's top edge
    both((sx) => mb.box(sx * (xTop + 0.014), s.clearance + hRock / 2, (zA + zB) / 2, 0.028, hRock, zB - zA, rgb(s.cladding.color)));
  }

  if (s.id === 'ranger') {
    // chrome bumpers, flush aero headlamps, chrome grille with the blue oval
    mb.box(0, s.clearance + 0.12, zF - 0.02, s.wid * 0.96, 0.18, 0.12, chrome);
    mb.box(0, s.clearance + 0.12, zR + 0.02, s.wid * 0.94, 0.18, 0.12, chrome);
    const yH = 0.84, zH = z(0.992);
    both((sx) => {
      mb.box(sx * 0.44, yH, zH, 0.34, 0.15, 0.06, lamp);
      mb.box(sx * (hwAt(s, 0.99) - 0.09), yH, zH - 0.005, 0.15, 0.14, 0.06, amber);
      mb.box(sx * (hwAt(s, 0.985) + 0.004), yH, z(0.982), 0.01, 0.12, 0.10, amber);   // wraps onto the fender
    });
    mb.box(0, yH, zH - 0.005, 0.50, 0.19, 0.05, shade(TRIM, 0.7));          // recessed grille opening
    mb.box(0, yH, zH, 0.52, 0.03, 0.05, chrome);                            // chrome bar
    mb.box(0, yH + 0.09, zH, 0.54, 0.02, 0.05, chrome);                     // grille frame top/bottom
    mb.box(0, yH - 0.09, zH, 0.54, 0.02, 0.05, chrome);
    mb.box(0, yH, zH + 0.02, 0.12, 0.06, 0.02, rgb(0x1f3f9a));               // blue oval
    // tall vertical tail lamps flanking the tailgate, FORD as a recessed dark box
    both((sx) => mb.box(sx * (hwR - 0.10), 0.93, zR + 0.012, 0.17, 0.40, 0.04, tail));
    mb.box(0, 0.98, zR + 0.014, 0.56, 0.10, 0.03, shade(s.body, 0.55));
    mb.box(0, s.clearance + 0.12, zR - 0.005, 0.32, 0.15, 0.02, rgb(PLATE));
    // bed: rails, floor and the tailgate inner face
    const [t0, t1, floor] = s.bed;
    const z0 = z(t0), z1 = z(t1), len = z1 - z0, zc = (z0 + z1) / 2;
    const hw = hwAt(s, (t0 + t1) / 2), railTop = pl(s.belt, 0.02);
    both((sx) => mb.tower(sx * (hw - 0.07), floor - 0.01, zc, 0.14, len, railTop - floor + 0.01, bodyC, { noBottom: true }));
    both((sx) => mb.box(sx * (hw - 0.13), floor + 0.10, zc, 0.03, 0.04, len - 0.30, shade(s.body, 0.6)));   // inner wheel-tub lip
    mb.box(0, floor + 0.01, zc, hw * 2 - 0.28, 0.01, len - 0.2, shade(s.body, 0.62));                    // ribbed floor
    for (let k = -3; k <= 3; k++) mb.box(0, floor + 0.02, zc + k * (len / 7), hw * 2 - 0.3, 0.008, 0.05, shade(s.body, 0.50));
  }

  if (s.id === 'saturn') {
    // wide low headlamps, thin slot grille, amber corner markers
    const zH = z(0.978), yH = 0.74;
    both((sx) => {
      mb.box(sx * 0.46, yH, zH, 0.44, 0.13, 0.08, lamp);
      mb.box(sx * (hwAt(s, 0.975) - 0.06), yH - 0.01, zH - 0.02, 0.12, 0.11, 0.08, amber);
    });
    mb.box(0, 0.775, z(0.972), 0.34, 0.045, 0.08, dark);
    mb.box(0, 0.775, z(0.972) + 0.03, 0.05, 0.06, 0.02, tail);              // Saturn badge in the slot
    // full-width dark tail panel with red lamps at the ends
    mb.box(0, 0.80, zR + 0.012, hwR * 2 - 0.06, 0.22, 0.03, shade(TRIM, 0.9));
    both((sx) => mb.box(sx * (hwR - 0.26), 0.80, zR + 0.005, 0.44, 0.18, 0.03, tail));
    both((sx) => mb.box(sx * (hwR - 0.12), 0.80, zR + 0.006, 0.12, 0.18, 0.02, amber));
    mb.box(0, 0.80, zR - 0.002, 0.40, 0.14, 0.03, rgb(PLATE));
  }

  if (s.id === 'civic') {
    // flush wide rectangular headlamps with a black slot grille between them
    const zH = z(0.982), yH = 0.72;
    both((sx) => mb.box(sx * 0.48, yH, zH, 0.46, 0.13, 0.08, lamp));
    both((sx) => mb.box(sx * (hwAt(s, 0.975) + 0.004), yH - 0.01, z(0.972), 0.01, 0.10, 0.12, amber));
    mb.box(0, yH, zH - 0.01, 0.46, 0.05, 0.08, dark);
    mb.box(0, yH - 0.13, z(0.975), 0.90, 0.03, 0.06, shade(TRIM, 0.9));       // bumper slot
    // wide tail lamps either side of the plate recess; tall tail panel
    both((sx) => mb.box(sx * (hwR - 0.27), 0.80, zR + 0.012, 0.46, 0.19, 0.04, tail));
    both((sx) => mb.box(sx * (hwR - 0.53), 0.80, zR + 0.014, 0.10, 0.19, 0.03, amber));
    mb.box(0, 0.62, zR + 0.012, 0.34, 0.15, 0.03, rgb(PLATE));
    // hatch spoiler at the top of the glass
    const ts = 0.15, zs = z(ts), ys = topAt(s, ts) + 0.03, hws = hwAt(s, ts) * 0.84;
    mb.box(0, ys, zs - 0.02, hws * 2, 0.05, 0.18, dark);
    both((sx) => mb.box(sx * (hws - 0.05), ys - 0.03, zs + 0.03, 0.10, 0.06, 0.08, dark));
    // sunroof
    if (s.sunroof) {
      const [a, b] = s.sunroof, yMax = Math.max(topAt(s, a), topAt(s, b), topAt(s, (a + b) / 2));
      mb.box(0, yMax + 0.004, (z(a) + z(b)) / 2, 0.80, 0.012, z(b) - z(a), shade(GLASS, 0.9));
    }
  }

  if (s.id === 'sunfire') {
    // twin-port dark grille with the arrowhead, wraparound lamps
    const zG = z(0.988), yG = 0.60;
    both((sx) => mb.box(sx * 0.24, yG, zG, 0.32, 0.11, 0.06, shade(TRIM, 0.8)));
    mb.box(0, yG, zG + 0.01, 0.06, 0.09, 0.03, tail);                      // arrowhead
    both((sx) => mb.box(sx * 0.44, 0.73, z(0.975), 0.40, 0.12, 0.10, lamp));
    both((sx) => mb.box(sx * (hwAt(s, 0.965) + 0.004), 0.73, z(0.962), 0.01, 0.10, 0.16, amber));
    // full-width ribbed tail panel: red lenses at the ends, dark band across
    mb.box(0, 0.78, zR + 0.012, hwR * 2 - 0.08, 0.20, 0.03, shade(TAIL, 0.55));
    both((sx) => mb.box(sx * (hwR - 0.28), 0.78, zR + 0.005, 0.44, 0.18, 0.03, tail));
    for (let k = -1; k <= 1; k++) mb.box(0, 0.78 + k * 0.06, zR + 0.002, hwR * 2 - 0.10, 0.008, 0.03, dark);
    mb.box(0, 0.78, zR - 0.002, 0.36, 0.13, 0.03, rgb(PLATE));
    // factory rear spoiler on two uprights
    const ts = 0.045, zs = z(ts), yTop = topAt(s, ts), hws = hwAt(s, ts);
    both((sx) => mb.box(sx * hws * 0.68, yTop + 0.045, zs, 0.10, 0.10, 0.10, bodyC));
    mb.box(0, yTop + 0.10, zs - 0.02, hws * 2 * 0.90, 0.04, 0.24, bodyC);
    // ribbed cladding: thin horizontal boxes along the rocker between the wheels
    const zA = -s.axleZ + s.wheelR + 0.12, zB = s.axleZ - s.wheelR - 0.12;
    both((sx) => {
      for (let k = 0; k < 3; k++) {
        mb.box(sx * (hwAt(s, 0.5) + 0.012), s.clearance + 0.03 + k * 0.035, (zA + zB) / 2, 0.012, 0.014, zB - zA - 0.1, shade(s.body, 0.62));
      }
    });
  }
}

export function buildCarBody(s, opts = {}) {
  const mb = new MeshBuilder();
  loft(mb, s, 64, (t) => specRing(s, t), specPaint(s));
  addDetails(mb, s, opts);
  return mb;
}

// ---------------------------------------------------------------- C4: lamps
// Where each car's lenses live: [ |x|, y, z, width, height ], mirrored on ±X.
// These shadow the boxes addDetails() already bakes into the body; the meshes
// below sit a few centimetres proud of them so switching a lamp on is one extra
// draw with a colour multiplier, and switching it off is drawing nothing.
export function carLampBoxes(s) {
  const z = (t) => tToZ(s, t);
  const zR = tToZ(s, 0);
  const hwR = pl(s.plan, 0.012);
  if (s.id === 'ranger') {
    return {
      head: [[0.44, 0.84, z(0.992), 0.34, 0.15]],
      tail: [[hwR - 0.10, 0.93, zR + 0.012, 0.17, 0.40]],
      rev:  [[hwR - 0.10, 0.60, zR + 0.012, 0.15, 0.11]],
    };
  }
  if (s.id === 'saturn') {
    return {
      head: [[0.46, 0.74, z(0.978), 0.44, 0.13]],
      tail: [[hwR - 0.26, 0.80, zR + 0.005, 0.44, 0.18]],
      rev:  [[hwR - 0.62, 0.80, zR + 0.005, 0.13, 0.14]],
    };
  }
  if (s.id === 'civic') {
    return {
      head: [[0.48, 0.72, z(0.982), 0.46, 0.13]],
      tail: [[hwR - 0.27, 0.80, zR + 0.012, 0.46, 0.19]],
      rev:  [[hwR - 0.66, 0.66, zR + 0.012, 0.12, 0.13]],
    };
  }
  return {
    head: [[0.44, 0.73, z(0.975), 0.40, 0.12]],
    tail: [[hwR - 0.28, 0.78, zR + 0.005, 0.44, 0.18]],
    rev:  [[hwR - 0.66, 0.78, zR + 0.005, 0.12, 0.13]],
  };
}

/**
 * Six tiny meshes per car, all painted white so the draw-time colour multiplier
 * decides what they are: headlamps (left and right separately, because damage
 * takes one out), tail/brake lenses, reversing lamps, and two soft glow cards
 * that only come out after dark.
 * Returns MeshBuilders; the caller uploads them.
 */
export function buildCarLamps(s) {
  const L = carLampBoxes(s);
  const white = rgb(0xffffff);
  const lens = (list, dir, side) => {
    const mb = new MeshBuilder();
    for (const [ax, y, zz, w, h] of list) {
      for (const sx of (side === 0 ? [1, -1] : [side])) {
        mb.box(sx * ax, y, zz + dir * 0.030, w * 0.92, h * 0.78, 0.05, white);
      }
    }
    return mb;
  };
  // Glow: an unlit card standing off the lens, drawn with alpha at night.
  const glow = (list, dir, side, sw, sh) => {
    const mb = new MeshBuilder();
    const n = [0, 0, dir];
    for (const [ax, y, zz, w, h] of list) {
      for (const sx of (side === 0 ? [1, -1] : [side])) {
        const cx = sx * ax, cz = zz + dir * 0.075;
        const hw = w * sw * 0.5, hh = h * sh * 0.5;
        const p = (px, py) => [cx + px, y + py, cz];
        if (dir > 0) mb.quad(p(hw, -hh), p(hw, hh), p(-hw, hh), p(-hw, -hh), white, n);
        else mb.quad(p(-hw, -hh), p(-hw, hh), p(hw, hh), p(hw, -hh), white, n);
      }
    }
    return mb;
  };
  return {
    headL: lens(L.head, 1, 1),
    headR: lens(L.head, 1, -1),
    tail: lens(L.tail, -1, 0),
    rev: lens(L.rev, -1, 0),
    glowHeadL: glow(L.head, 1, 1, 2.6, 3.4),
    glowHeadR: glow(L.head, 1, -1, 2.6, 3.4),
    glowTail: glow(L.tail, -1, 0, 2.0, 2.0),
  };
}

// A dented bumper cap, drawn over the crumpled end of a damaged car. One mesh
// for every car: it is scaled to the body's width at draw time.
export function buildCrumple() {
  const mb = new MeshBuilder();
  const c = rgb(0x2a2b2e);
  for (let i = -2; i <= 2; i++) {
    const w = 0.20, y = 0.34 + (i & 1 ? 0.05 : -0.03);
    mb.box(i * 0.21, y, 0, w, 0.30 + (i & 1 ? 0.06 : 0), 0.14 + Math.abs(i) * 0.04, c,
      { yaw: i * 0.16 });
  }
  return mb;
}

// One steam puff: a cheap unlit box, scaled and faded as it rises.
export function buildPuff() {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 1, 1, 1, rgb(0xd8dde2));
  return mb;
}

// A flat polygon on the wheel face (YZ plane at x), fanned from its first
// point. `pts` are [y, z] in CCW order seen from +X; flipped for the far face.
function facePoly(mb, x, dir, pts, c) {
  const base = mb.vertCount;
  for (const [y, zz] of pts) mb.vert(x, y, zz, dir, 0, 0, c);
  for (let k = 1; k < pts.length - 1; k++) {
    if (dir > 0) mb.tri(base, base + k, base + k + 1);
    else mb.tri(base, base + k + 1, base + k);
  }
}
const ellipse = (cy, cz, ry, rz, a, n = 8) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const u = Math.cos(th) * ry, v = Math.sin(th) * rz;
    out.push([cy + u * Math.cos(a) - v * Math.sin(a), cz + u * Math.sin(a) + v * Math.cos(a)]);
  }
  return out;
};
const spokeQuad = (r0, r1, a, halfW) => {
  const c = Math.cos(a), sn = Math.sin(a);
  return [[r0 * c - halfW * -sn, r0 * sn - halfW * c], [r1 * c - halfW * -sn, r1 * sn - halfW * c],
          [r1 * c + halfW * -sn, r1 * sn + halfW * c], [r0 * c + halfW * -sn, r0 * sn + halfW * c]];
};

export function buildWheel(s) {
  const mb = new MeshBuilder();
  const w = WHEEL_W(s);
  mb.cyl(0, 0, 0, s.wheelR, w, 16, rgb(TIRE), 'x');
  const rimR = s.wheelR * (s.style === 'truck' ? 0.56 : 0.62);
  const face = w / 2 + 0.012, deco = face + 0.004;
  if (s.id === 'ranger') {
    // styled steel: light rim with five oval holes and a domed centre cap
    const rim = 0xdcdcdc;
    mb.cyl(0, 0, 0, rimR, face * 2, 12, rgb(rim), 'x');
    for (const dir of [1, -1]) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
        facePoly(mb, dir * deco, dir, ellipse(Math.cos(a) * rimR * 0.62, Math.sin(a) * rimR * 0.62, rimR * 0.16, rimR * 0.26, a), shade(rim, 0.25));
      }
    }
    mb.cyl(0, 0, 0, rimR * 0.34, face * 2 + 0.04, 8, shade(rim, 0.92), 'x');
  } else if (s.id === 'saturn') {
    // plastic multi-slot cover: light grey with eight dark slots around a flat hub
    const rim = 0xcfd1d3;
    mb.cyl(0, 0, 0, rimR, face * 2, 12, rgb(rim), 'x');
    for (const dir of [1, -1]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        facePoly(mb, dir * deco, dir, spokeQuad(rimR * 0.45, rimR * 0.88, a, rimR * 0.09), shade(rim, 0.35));
      }
    }
    mb.cyl(0, 0, 0, rimR * 0.36, face * 2 + 0.01, 8, shade(rim, 0.95), 'x');
  } else if (s.id === 'civic') {
    // Si alloy: flat pale face, four dark openings, dark centre
    const rim = 0xb9bcbf;
    mb.cyl(0, 0, 0, rimR, face * 2, 12, rgb(rim), 'x');
    for (const dir of [1, -1]) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        facePoly(mb, dir * deco, dir, ellipse(Math.cos(a) * rimR * 0.6, Math.sin(a) * rimR * 0.6, rimR * 0.26, rimR * 0.20, a), shade(rim, 0.22));
      }
    }
    mb.cyl(0, 0, 0, rimR * 0.30, face * 2 + 0.01, 8, shade(rim, 0.3), 'x');
  } else {
    // five-spoke alloy: dark dish with five bright spokes and a small cap
    const rim = 0xc4c7ca;
    mb.cyl(0, 0, 0, rimR, face * 2, 12, shade(rim, 0.28), 'x');
    for (const dir of [1, -1]) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
        facePoly(mb, dir * deco, dir, spokeQuad(rimR * 0.2, rimR * 0.98, a, rimR * 0.13), rgb(rim));
      }
    }
    mb.cyl(0, 0, 0, rimR * 0.22, face * 2 + 0.03, 8, rgb(rim), 'x');
  }
  return mb;
}

export function buildHead() {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 0.3, 0.34, 0.28, rgb(0xd9a982));
  mb.box(0, 0.2, 0, 0.32, 0.14, 0.3, rgb(0x3a2c22));
  return mb;
}

export function buildShadow() {
  const mb = new MeshBuilder();
  mb.flat(-0.5, -0.5, 0.5, 0.5, 0, rgb(0x000000));
  return mb;
}

// ---------------------------------------------------------------- physics

const RESET_CLEARANCE = 3;

// R4 — the damage ladder. Below COSMETIC the car is fine; past it you lose a
// headlight and the bumper folds; past PERF it will not pull and it will not
// steer straight; at DEAD the job is over and somebody comes to get you.
export const DAMAGE = { COSMETIC: 25, PERF: 60, DEAD: 100 };

const GRASS = 0.72;                     // surface multiplier off the asphalt
const SURF_RAMP = (1 - GRASS) / 0.5;    // D4: the full penalty takes half a second
const CURB_Y = 0.15;                    // how tall the sidewalk actually is

// --------------------------------------------------------------- air & landing
// Vertical dynamics. The car is a point mass in y: it sits ON world.groundAt()
// while the surface can hold it, and goes ballistic the moment the ground falls
// away faster than gravity can pull it down. That single rule is what turns
// every ramp, berm and loading dock in terrain.js into a jump.
const GRAV = 9.81;
// The car is flying once it is separating from the deck faster than this, in
// m/s. Kept as a rate rather than a distance so the test is the honest physical
// one — "is the ground falling away faster than gravity can follow it" — at any
// timestep, and so a smooth crest launches exactly when it should.
const AIR_EPS = 0.04;
// Real flight, as far as the driving model is concerned: below this the wheels
// are still close enough to the ground to steer and to bite.
const AIR_CLEAR = 0.08;
// Downward speed a landing has to carry before it is worth a sound, a squat or
// a puff of dust; and the speed above which it starts to cost bodywork.
const LAND_MIN = 1.5;
const LAND_SAFE = 4.0;
const LAND_DMG = 0.75;
// Suspension: a spring/damper on the visible body only — the wheels stay on the
// deck. ω ≈ 14.5 rad/s, ζ ≈ 0.82, so a landing settles in about 0.4 s.
const SUSP_K = 210, SUSP_C = 24;
const SUSP_TRAVEL = 0.13;
// A step in the ground the wheels climb rather than ramp over: a driveway lip, a
// dock edge, the side of an apron. Costs speed the way a kerb does.
const STEP_BUMP = 0.06;
// Kerbs (D3, rebuilt). Below 30 km/h crossing one is a thud; above it the nose
// gets kicked and the car takes a little air. Numbers picked so a 43 km/h hop
// peaks at ~0.34 m and a 70 km/h one at ~0.75 m.
const CURB_FAST = 8.33;                 // m/s == 30 km/h
const CURB_KICK0 = 0.56, CURB_KICK1 = 0.169, CURB_KICK_MAX = 4.2;
// Wall colliders are 1.6 m of fence and hoarding; clear that much and you are
// over them. This is what lets the Galeries dock jump clear the service fence.
const AIR_OVER_WALLS = 1.6;

export class Vehicle {
  constructor(spec) {
    this.spec = spec;
    this.reset(0, 0, 0);
    this.passengers = 0;
    this.assist = true;
    // R4 state — deliberately NOT cleared by reset(), so a recover() or a
    // teleport does not quietly fix your bumper.
    this.damage = 0;
    this.deformF = 0; this.deformR = 0;
    this.headOut = 0;      // 0 none, +1 the left lamp is out, -1 the right
    this.pull = 0;         // which way a hurt car wanders
    this.misfire = false;
    this.steamT = 0;
  }

  // The collide.js body contract, straight off the spec sheet.
  get len() { return this.spec.len; }
  get wid() { return this.spec.wid; }
  get mass() { return this.spec.mass; }

  reset(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.vx = 0; this.vz = 0;
    this.vLong = 0; this.vLat = 0;
    this.steer = 0; this.yawRate = 0;
    this.yawSpin = 0;                    // spin left over from an impact
    this.spin = 0; this.roll = 0; this.pitch = 0;
    // Vertical state. `y` is where the wheels are — the ground height under the
    // car, or wherever the ballistic arc has got to. `susp` is the body on top
    // of that, which is what the renderer should draw (see `bodyY`).
    this.y = 0; this.vy = 0;
    this.gh = 0;                         // ground height under the car right now
    this.air = false;                    // integrating ballistically
    this.inAir = false;                  // ...and far enough up to have lost the tyres
    this.airT = 0;                       // seconds into the current flight
    this.lastAir = 0;                    // how long the last completed flight was
    this.landed = 0;                     // landing speed, for ONE tick after touchdown
    this.susp = 0; this.suspV = 0;       // suspension travel (negative == squat)
    this.shake = 0;                      // washboard rattle, 0..1 (stairs, gravel)
    this.kind = 'asphalt';               // surface under the wheels
    this.surface = 1;                    // D4: ramped grip/drag penalty
    this.onRoad = true;
    this.skid = 0; this.impact = 0; this.drowning = 0;
    this.reversing = false; this.braking = false;
    this.curb = 0;
    this.lastHit = 0;
    this.misfireT = 0;
    this.lastSafe = { x, z, yaw };
  }

  get speedKmh() { return Math.abs(this.vLong) * 3.6; }
  get forward() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  // Where to DRAW the body: the contact height plus whatever the springs are
  // doing. `y` alone is the wheels, and is what the physics reasons about.
  get bodyY() { return this.y + this.susp; }
  // How far the underside is off the deck. Zero on the ground, metres in flight.
  get clearance() { return this.y - this.gh; }
  // Top speed and grip after the dents. Used by the HUD and the AI alike.
  get hurt() { return this.damage > DAMAGE.PERF; }

  update(dt, ctl, world) {
    const s = this.spec;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);

    // Velocity resolved into the car's own frame.
    let vLong = this.vx * fx + this.vz * fz;
    let vLat = this.vx * rx + this.vz * rz;

    const onRoad = world.roadAt(this.x, this.z);
    // The height field (terrain.js). `groundAt` hands back a shared record, so
    // everything wanted out of it is copied into locals right here.
    const G0 = world.groundAt ? world.groundAt(this.x, this.z) : FLAT;
    // A feature's own surface wins; away from one it is tarmac or grass exactly
    // as it always was, which is what keeps the flat town byte-for-byte the same.
    const kind = G0.kind || (onRoad ? 'asphalt' : 'grass');
    this.kind = kind;
    const sd = SURF[kind] || SURF.grass;
    const inAir = this.inAir;
    // D4: grass and gravel still cut the grip the instant you leave the road,
    // but the drag ramps in over half a second instead of hitting a wall. The
    // per-kind table generalises that without moving asphalt or grass.
    const wantSurf = sd.power;
    this.surface += clamp(wantSurf - this.surface, -SURF_RAMP * dt, SURF_RAMP * dt);
    const surface = this.surface;
    const gripSurf = inAir ? 0 : sd.grip;
    const offRoad = (1 - surface) / (1 - GRASS);      // 0 on tarmac, 1 fully off it
    const inWater = world.waterAt(this.x, this.z) && !inAir;
    const topSpeed = s.topSpeed * (this.hurt ? 0.85 : 1);   // R4: −15 % once it's bad

    // Engine: force tapers off as you approach terminal speed, like a tired 4-banger.
    const frac = clamp(vLong / topSpeed, -1, 1);
    let a = 0;
    if (!inAir) {
      if (ctl.throttle > 0 && vLong > -1.5) {
        a += ctl.throttle * s.accel * surface * (1 - Math.pow(Math.max(0, frac), 1.7));
      }
      if (ctl.brake > 0) {
        if (vLong > 0.6) a -= ctl.brake * s.brake * surface;
        else a -= ctl.brake * s.accel * 0.55 * (1 - Math.max(0, -frac));  // reverse
      }
      if (ctl.handbrake && vLong > 0.5) a -= s.brake * 0.55;
      // Rolling resistance is a near-constant drag; aero grows with the square.
      // Top speed then falls out of where the power curve meets it.
      if (Math.abs(vLong) > 0.2) a -= Math.sign(vLong) * (0.28 + 1.42 * offRoad * sd.drag);
    }
    // Aero never stops, on the ground or off it. Nothing else acts in flight.
    a -= vLong * Math.abs(vLong) * 0.0006;
    if (inWater) a -= vLong * 4.5;
    // R4: a sick engine coughs. One skipped stroke, roughly once a second.
    this.misfire = false;
    if (this.hurt && ctl.throttle > 0.1) {
      this.misfireT -= dt;
      if (this.misfireT <= 0) {
        this.misfireT = 0.4 + Math.random() * 1.3;
        this.misfire = true;
        a -= s.accel * 0.5;
      }
    }
    vLong += a * dt;
    if (ctl.throttle === 0 && ctl.brake === 0 && Math.abs(vLong) < 0.25) vLong = 0;

    // D3 — the kerb, rebuilt. It is 0.15 m of concrete: take it at a walk and it
    // is a thud, take it at 30 km/h and the front wheels get thrown up and you
    // are briefly off the ground. Either way it costs you speed. The sidewalk
    // is not in the height field (it is a decal on flat ground), so this still
    // hangs off the road/off-road transition the way it always did.
    if (onRoad !== this.onRoad) {
      const spd = Math.abs(vLong);
      if (spd > 2.2 && this.clearance < 0.02) {
        const k = clamp(spd / 14, 0, 1);
        if (spd > CURB_FAST) {
          this.vy = Math.min(CURB_KICK_MAX, CURB_KICK0 + CURB_KICK1 * spd);
          this.pitch += (onRoad ? -0.075 : 0.10) * k;
          vLong *= 1 - 0.09 * k;                    // scrub
          vLat *= 1 - 0.18 * k;
        } else {                                     // a thud, and it stops you more
          this.vy = 0.30 + 0.06 * spd;
          this.pitch += (onRoad ? -0.04 : 0.055) * k;
          vLong *= 1 - 0.16 * k;
          vLat *= 1 - 0.26 * k;
        }
        this.curb = k;
        this.impact = Math.max(this.impact, k * 0.22);
      }
      this.onRoad = onRoad;
    }
    this.curb *= Math.exp(-9 * dt);

    // Steering: less lock the faster you go, so a keyboard tap can't spin you.
    const speedFrac = clamp(Math.abs(vLong) / topSpeed, 0, 1);
    let lock = s.steerMax * (0.42 + 0.58 / (1 + Math.abs(vLong) / 14));
    if (this.assist) lock *= 1 - 0.28 * speedFrac;
    let target = ctl.steer * lock;
    // R4: a bent car pulls. Enough to notice, not enough to be unplayable.
    if (this.hurt) target += this.pull * lock * 0.20 * clamp((this.damage - DAMAGE.PERF) / 40, 0, 1);
    this.steer += (target - this.steer) * Math.min(1, 12 * dt);

    // Bicycle model yaw. Handbrake lets the back end come around — how far is
    // a per-car number now (D2): the Ranger keeps most of its grip and ploughs.
    const hbGrip = s.hbGrip != null ? s.hbGrip : 0.30;
    const grip = s.grip * gripSurf * (ctl.handbrake ? hbGrip : 1) * (inWater ? 0.3 : 1);
    // Negative: positive yaw swings the nose toward local +X, which is left.
    this.yawRate = -(vLong / s.wheelbase) * Math.tan(this.steer);
    if (ctl.handbrake) this.yawRate *= (s.hbYaw != null ? s.hbYaw : 1.55);
    if (this.assist) {
      // Gentle counter-steer: pull the heading toward the direction of travel.
      this.yawRate += vLat * 0.045 * (1 - speedFrac * 0.5);
    }
    // Nothing to steer against once the wheels are off the ground: the heading
    // freezes and the stick only leans the body, Midtown Madness style.
    if (inAir) this.yawRate = 0;
    this.yaw += this.yawRate * dt;
    // R3: the spin an impact put into the car, bleeding off as the tyres bite.
    if (this.yawSpin) {
      this.yaw += this.yawSpin * dt;
      this.yawSpin *= Math.exp(-(1.1 + 2.8 * grip) * dt);
      if (Math.abs(this.yawSpin) < 0.012) this.yawSpin = 0;
    }

    // Lateral grip pulls the car's travel direction toward where it points.
    const bite = 1 - Math.exp(-9.5 * grip * dt);
    const slipBefore = vLat;
    vLat -= vLat * bite;
    this.skid = clamp((Math.abs(slipBefore) - 1.2) / 7, 0, 1) * clamp(Math.abs(vLong) / 8, 0, 1);

    // Back to world space using the PRE-turn axes: that lag is what drifting is.
    this.vx = fx * vLong + rx * vLat;
    this.vz = fz * vLong + rz * vLat;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.vLong = vLong; this.vLat = vLat;

    this.impact *= Math.exp(-4 * dt);
    this.steamT = Math.max(0, this.steamT - dt);

    // ------------------------------------------------------------- vertical
    // Done after the horizontal step so the ground under the car is the ground
    // it actually ended the frame on.
    const G = world.groundAt ? world.groundAt(this.x, this.z) : FLAT;
    let gh = G.h;
    const gnx = G.nx, gny = G.ny, gnz = G.nz;
    // Stairs and washboard gravel are modelled as a ripple the springs feel
    // rather than as geometry — 5 cm, deterministic in x/z so replays match.
    if (sd.shake > 0.5) gh += 0.05 * sd.shake * Math.sin(0.9 * (this.x + this.z));
    // How fast the surface itself is rising under the car. Taken from the
    // analytic normal, NOT from the frame-to-frame height difference, so a step
    // (a dock edge, a driveway lip) reads as a step and only a real slope
    // launches anything.
    const climb = gny > 1e-6 ? -(gnx * this.vx + gnz * this.vz) / gny : 0;
    const wasAir = this.air;
    const yWas = this.y;
    this.landed = 0;
    this.vy -= GRAV * dt;
    const yFree = this.y + this.vy * dt;
    if (yFree > gh + AIR_EPS * dt) {
      this.y = yFree;
      this.air = true;
      this.airT += dt;
    } else {
      // What the deck actually absorbs is the DIFFERENCE between the vertical
      // speed the car had and the vertical speed the surface is moving at. On a
      // steady slope that is one frame of gravity and nothing happens; out of
      // the air, or into the dip at the foot of a ramp, it is the whole landing.
      const drop = climb - this.vy;
      this.y = gh;
      this.vy = climb;
      this.air = false;
      if (wasAir && this.airT > 0.05) this.lastAir = this.airT;
      this.airT = 0;
      let scrubL = 1, scrubT = 1;
      if (drop > LAND_MIN) {
        this.landed = drop;
        this.suspV -= Math.min(drop * 0.30, 3.0);
        if (drop > LAND_SAFE) this.hit((drop - LAND_SAFE) * LAND_DMG);
        this.impact = Math.max(this.impact, clamp(drop / 14, 0, 1));
        scrubL = 1 - clamp((drop - LAND_SAFE) * 0.02, 0, 0.18);
      }
      // A step the wheels have to climb rather than ramp over: a driveway lip, a
      // dock edge. `climb * dt` is what a slope would have accounted for, so
      // what is left over is genuinely a step. It costs speed like a kerb does.
      const step = gh - yWas - Math.max(0, climb) * dt;
      if (step > STEP_BUMP) {
        const k = clamp(step / 0.5, 0, 1) * clamp(Math.abs(vLong) / 10, 0, 1);
        scrubL *= 1 - 0.14 * k;
        scrubT *= 1 - 0.22 * k;
        this.impact = Math.max(this.impact, k * 0.25);
      }
      if (scrubL !== 1 || scrubT !== 1) {
        vLong *= scrubL; vLat *= scrubT;
        this.vx = fx * vLong + rx * vLat;
        this.vz = fz * vLong + rz * vLat;
        this.vLong = vLong; this.vLat = vLat;
      }
    }
    this.gh = gh;
    this.inAir = this.y - gh > AIR_CLEAR;
    // Springs. The wheels are on the deck; this is the body on top of them.
    this.suspV += (-SUSP_K * this.susp - SUSP_C * this.suspV) * dt;
    this.susp += this.suspV * dt;
    const travel = s.suspension != null ? s.suspension : SUSP_TRAVEL;
    if (this.susp < -travel) { this.susp = -travel; if (this.suspV < 0) this.suspV = 0; }
    else if (this.susp > travel * 0.5) { this.susp = travel * 0.5; if (this.suspV > 0) this.suspV = 0; }
    // Rattle, for the camera and anyone drawing dust.
    const wantShake = this.inAir ? 0 : sd.shake * clamp(Math.abs(vLong) / 12, 0, 1);
    this.shake += (wantShake - this.shake) * Math.min(1, 10 * dt);

    // Walls and poles: skip them entirely once the car is over fence height —
    // that is what makes a jump a shortcut instead of a bounce.
    if (this.y - gh < AIR_OVER_WALLS) this.collide(world);

    // D5: which way the box is in, for the speedo and the hood camera.
    this.reversing = this.vLong < -0.4;
    this.braking = (ctl.brake > 0.05 && this.vLong > -0.05) || !!ctl.handbrake;

    // Cosmetic body attitude — a truck should visibly lean, and on a slope it
    // sits along the slope. Negative pitch is nose-up; positive roll leans right.
    const heavy = s.mass / 1100;
    const latA = vLong * this.yawRate;
    if (this.inAir) {
      // In the air the stick is worth a little attitude and nothing else.
      this.pitch = clamp(this.pitch + (ctl.brake - ctl.throttle) * 0.55 * dt, -0.55, 0.55);
      this.roll = clamp(this.roll - ctl.steer * 0.70 * dt, -0.5, 0.5);
    } else {
      // Ground slope resolved into the car's own frame: how much the deck rises
      // ahead of the nose, and how much it rises to the driver's left.
      let tPitch = 0, tRoll = 0;
      if (gny < 0.99999) {
        const dhx = -gnx / gny, dhz = -gnz / gny;
        tPitch = -Math.atan(dhx * fx + dhz * fz);
        tRoll = Math.atan(dhx * rx + dhz * rz);
      }
      this.roll += (clamp(latA * 0.016 * heavy, -0.13, 0.13) + tRoll - this.roll) * Math.min(1, 8 * dt);
      this.pitch += (clamp(-a * 0.010 * heavy, -0.07, 0.07) + tPitch - this.pitch) * Math.min(1, 7 * dt);
    }
    this.spin += (vLong / s.wheelR) * dt;

    if (inWater) {
      this.drowning += dt;
    } else {
      this.drowning = 0;
      if (onRoad && !this.inAir && Math.abs(vLong) > 2) {
        this.lastSafe = { x: this.x, z: this.z, yaw: this.yaw };
      }
    }
    // Keep everyone inside the map.
    const W = world.bounds;
    this.x = clamp(this.x, W.minX + 6, W.maxX - 6);
    this.z = clamp(this.z, W.minZ + 6, W.maxZ - 6);
  }

  /**
   * R4 — every impact in the game funnels through here. `closing` is the
   * approach speed in m/s along the contact normal; (nx, nz) points from
   * whatever we hit toward us. Returns the damage actually added.
   */
  hit(closing, nx = 0, nz = 0) {
    const force = Math.min(1, Math.abs(closing) / 18);
    this.impact = Math.max(this.impact, force);
    this.lastHit = Math.max(this.lastHit, force);
    const add = Math.max(0, force - 0.055) * 46;
    if (add <= 0) return 0;
    const before = this.damage;
    this.damage = clamp(this.damage + add, 0, DAMAGE.DEAD);
    const gained = this.damage - before;
    // Which end folded: n points at us, so a nose-on hit has n against forward.
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const fwd = nx * fx + nz * fz;
    if (fwd < -0.35) this.deformF = Math.min(1, this.deformF + gained / 55);
    else if (fwd > 0.35) this.deformR = Math.min(1, this.deformR + gained / 55);
    // Local +X is the driver's left; the lamp on the side that took the hit goes.
    if (this.damage > DAMAGE.COSMETIC && !this.headOut && fwd < -0.15) {
      const lat = nx * Math.cos(this.yaw) - nz * Math.sin(this.yaw);
      this.headOut = lat < 0 ? 1 : -1;
    }
    if (before <= DAMAGE.PERF && this.damage > DAMAGE.PERF && !this.pull) {
      this.pull = Math.random() < 0.5 ? -1 : 1;
    }
    if (this.damage > DAMAGE.COSMETIC) this.steamT = Math.max(this.steamT, 1.4);
    return gained;
  }

  // Re-resolve world velocity into the car's own frame. Anything that shoves
  // vx/vz from outside update() (the car solver, the parked-car pass) calls
  // this so the speedo and the next frame's physics agree with what happened.
  syncFrame() {
    this.vLong = this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw);
    this.vLat = this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw);
  }

  // The tow truck's invoice: everything back to zero.
  repair() {
    this.damage = 0;
    this.deformF = 0; this.deformR = 0;
    this.headOut = 0; this.pull = 0;
    this.steamT = 0; this.misfire = false;
  }

  // Two probe circles (front axle, rear axle) against nearby wall segments.
  collide(world) {
    const s = this.spec;
    if (world.queryPoles) this.collidePoles(world);
    const r = s.wid * 0.52;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const segs = world.querySegments(this.x, this.z, s.len * 0.6 + 3);
    if (!segs.length) return;
    for (const off of [s.len * 0.28, -s.len * 0.28]) {
      const px = this.x + fx * off, pz = this.z + fz * off;
      for (const g of segs) {
        const ex = g.bx - g.ax, ez = g.bz - g.az;
        const l2 = ex * ex + ez * ez || 1e-6;
        const t = clamp(((px - g.ax) * ex + (pz - g.az) * ez) / l2, 0, 1);
        const cx = g.ax + ex * t, cz = g.az + ez * t;
        let dx = px - cx, dz = pz - cz;
        let d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d < 1e-4) { // sitting on the wall line: push along its normal
          const l = Math.sqrt(l2);
          dx = -ez / l; dz = ex / l; d = 1e-3;
        }
        const nx = dx / d, nz = dz / d, pen = r - d;
        this.x += nx * pen; this.z += nz * pen;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          const force = Math.min(1, -vn / 18);
          this.hit(-vn, nx, nz);
          this.vx -= vn * nx * 1.25; this.vz -= vn * nz * 1.25;   // bounce, mostly absorbed
          const fwdDot = fx * nx + fz * nz;
          this.yaw += (nx * fz - nz * fx) * force * 0.35;          // glance off walls
          this.vx *= 0.72; this.vz *= 0.72;
          if (Math.abs(fwdDot) > 0.7) { this.vLong *= 0.35; }
        }
      }
    }
    this.vLong = this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw);
    this.vLat = this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw);
  }

  // R3 — 200 mm of hydro pole against 1.2 tonnes of Ranger. The pole loses:
  // hit one with any speed on and it snaps, the collider goes with it, and you
  // drive through with a dent and a scrub. Slower than that and it holds, in
  // which case the wall pass below treats it as the fence post it is.
  collidePoles(world) {
    const s = this.spec;
    const list = world.queryPoles(this.x, this.z, s.len * 0.55 + 1.2);
    if (!list || !list.length) return;
    const r = s.wid * 0.5;
    const off = Math.max(0.05, s.len * 0.5 - r);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.dead) continue;
      for (let k = 1; k >= -1; k -= 2) {
        const cx = this.x + fx * off * k, cz = this.z + fz * off * k;
        const dx = p.x - cx, dz = p.z - cz;
        const d = Math.hypot(dx, dz);
        if (d > r + 0.24) continue;
        const nl = d > 1e-4 ? d : 1;
        const ux = dx / nl, uz = dz / nl;
        const into = this.vx * ux + this.vz * uz;     // speed straight at it
        if (into < 3) break;                          // a nudge leaves it standing
        world.snapPole(p, ux, uz);
        this.hit(into * 0.55, -ux, -uz);
        const scrub = clamp(1 - 1.9 / Math.max(2.5, Math.abs(this.vLong)), 0.60, 0.94);
        this.vx *= scrub; this.vz *= scrub;
        const lat = dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw);
        this.yawSpin -= Math.sign(lat) * Math.min(1.1, into * 0.035);
        break;
      }
    }
    this.vLong = this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw);
    this.vLat = this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw);
  }

  // Nudge from another car. Superseded by collide.js for real contacts, kept
  // for anything that only wants to push the player out of the way.
  nudge(nx, nz, strength) {
    this.x += nx * strength; this.z += nz * strength;
    this.vx = this.vx * 0.8 + nx * strength * 6;
    this.vz = this.vz * 0.8 + nz * strength * 6;
    this.impact = Math.max(this.impact, Math.min(1, strength));
  }

  recover() {
    const p = this.lastSafe;
    this.reset(p.x, p.z, p.yaw);
  }

  // Seat positions in local space, for drawing the friends you picked up.
  seatPositions() {
    const s = this.spec;
    const out = [];
    if (s.seats >= 1) out.push([-s.seatX, s.seatY, s.seatZ]);
    if (s.seats >= 2) out.push([0, s.seatY, s.seatZ - (s.style === 'truck' ? 0 : 1.1)]);
    if (s.seats >= 3) out.push([s.seatX, s.seatY, s.seatZ - 1.1]);
    return out.slice(0, s.seats);
  }
}
export { RESET_CLEARANCE };
