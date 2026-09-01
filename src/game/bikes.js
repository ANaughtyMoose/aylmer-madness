// The two bicycles, and what it takes to make one rideable.
//
// Sayyad's is a fully chromed beach cruiser: the deep double-curved cantilever
// frame, whitewall balloon tyres, a ludicrous number of thin spokes, fenders at
// both ends, wide swept-back bars and a sprung saddle. It is flashy and
// slightly absurd, which is the point.
//
// Yours is a Diamondback hardtail off the wall at Canadian Tire: black
// aluminium, blue and white decals, a white suspension fork, knobby tyres, a
// triple chainring and a flat bar. It is honest and unglamorous — exactly what
// a seventeen-year-old in Aylmer in 2004 actually had.
//
// A bicycle is not a car with two wheels missing:
//   * it is a plane, so track is zero and both drawn wheels coincide;
//   * the fork, bars and front fender turn with the steering, so they are a
//     mesh of their own (buildSteer) drawn about the front axle;
//   * the rider is drawn from six pieces and pedals, because a bicycle with
//     nobody on it moving down the road at 25 km/h is a ghost;
//   * the power is legs. bikeControl() below is the whole of that: a sprint
//     that runs out in about six seconds, and a bunny-hop on the space bar.
//
// What a bike buys you that a truck cannot: the collider is half a metre wide
// instead of a metre and three quarters (game/cars.js collide() probes at
// wid*0.52), and `turf` means grass, path and sand cost it nothing — so the
// sidewalks, the bike path along the parkway, the beach at des Cèdres and the
// gaps between the buildings on Principale are all open to it and to nothing
// else in the game.
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { m4 } from '../core/math.js';
import { register, unlock, tube, discX, ringX, letters } from './vehiclekit.js';

const TIRE = 0x17181a, CHROME = 0xdfe3e7, RUBBER = 0x1b1c1e;
const WHITEWALL = 0xe8e6df, RIM_ALLOY = 0xb9bdc2;

// Crank arm, and the gearing between the road wheel and the pedals. Both are
// only ever used to work out where a foot is: the driving model has no idea
// there is a chain.
const CRANK = 0.170;
const GEAR = 2.75;

// ---------------------------------------------------------------- helpers

// A thin flat spoke on one face of the wheel. The renderer culls back faces,
// so each side of the wheel gets its own set laid just proud of the tyre's end
// cap — the same trick cars.js plays with its five-spoke alloys.
function spoke(mb, x, dir, r0, r1, a, c, w = 0.006) {
  const co = Math.cos(a), si = Math.sin(a);
  const py = -si * w, pz = co * w;
  const P = (r, s) => [x, co * r + py * s, si * r + pz * s];
  if (dir > 0) mb.quad(P(r0, -1), P(r1, -1), P(r1, 1), P(r0, 1), c, [1, 0, 0]);
  else mb.quad(P(r0, 1), P(r1, 1), P(r1, -1), P(r0, -1), c, [-1, 0, 0]);
}

// A mudguard: an arc band over a wheel, outer and inner surface. `a0`/`a1` are
// measured from straight up, positive toward the front of the bike.
function fender(mb, cy, cz, r, a0, a1, hw, c, segs = 9) {
  const P = (a, rr, x) => [x, cy + Math.cos(a) * rr, cz + Math.sin(a) * rr];
  for (let i = 0; i < segs; i++) {
    const a = a0 + (a1 - a0) * (i / segs), b = a0 + (a1 - a0) * ((i + 1) / segs);
    const na = [0, Math.cos((a + b) / 2), Math.sin((a + b) / 2)];
    mb.quad(P(a, r, -hw), P(b, r, -hw), P(b, r, hw), P(a, r, hw), c, na);
    mb.quad(P(a, r - 0.012, hw), P(b, r - 0.012, hw), P(b, r - 0.012, -hw), P(a, r - 0.012, -hw), c,
      [0, -na[1], -na[2]]);
  }
}

// ---------------------------------------------------------------- wheels

/**
 * A bicycle wheel: tyre, sidewall, rim, hub and a great many spokes. Built in
 * the same frame cars.js's buildWheel uses — axle along X, centred on the
 * origin — so drawCar's wheel transform works on it unchanged.
 */
function buildBikeWheel(s) {
  const mb = new MeshBuilder();
  const R = s.wheelR, hw = s.tyreW / 2;
  const rim = rgb(s.rim), hub = shade(s.rim, 0.72), spokeC = rgb(s.spokeC);
  mb.cyl(0, 0, 0, R, s.tyreW, 16, rgb(s.tread), 'x');
  if (s.knobby) {
    // Lugs straddling the tread. A dozen reads as a knobby from the far side of
    // the street; thirty-six would be three hundred triangles more and would
    // look exactly the same.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      mb.box(0, Math.cos(a) * (R - 0.006), Math.sin(a) * (R - 0.006),
        s.tyreW * 1.22, 0.036, 0.036, shade(s.tread, 1.7));
    }
  }
  // Everything decorative stands just proud of the tyre's end caps, in layers:
  // sidewall, then the rim well, then the spokes, then the hub over the lot.
  for (const dir of [1, -1]) {
    const x = dir * (hw + 0.004);
    // The whitewall stops short of the shoulder so the black tread still
    // rings it; on a chrome bike the rim inside it is nearly as pale.
    if (!s.knobby) ringX(mb, x, 0, 0, R * 0.78, R * 0.925, rgb(WHITEWALL), dir, 16);
    ringX(mb, x + dir * 0.002, 0, 0, R * 0.68, R * 0.79, rim, dir, 16);
    for (let k = 0; k < s.spokes; k++) {
      spoke(mb, x + dir * 0.004, dir, R * 0.17, R * 0.69, (k / s.spokes) * Math.PI * 2, spokeC);
    }
  }
  mb.cyl(0, 0, 0, R * 0.155, s.tyreW + 0.075, 8, hub, 'x');
  return mb;
}

// ---------------------------------------------------------------- cruiser

const CRUISER = {
  id: 'cruiser',
  name: 'Cruiser chromé de Sayyad', who: 'Sayyad', whoDe: '',
  body: CHROME, seats: 1, style: 'bike', twoWheel: true,
  park: 'curb', noTraffic: true, electric: true,
  flavour: 'Chromé au complet, pneus à flanc blanc, pis à peu près six cents rayons. Sayyad l’a payé plus cher que la Civic.',
  len: 1.88, wid: 0.63, h: 1.14, wheelbase: 1.14, overhangF: 0.37, track: 0, wheelR: 0.335,
  // Legs, not litres: 25 km/h with a fresh pair and about 16 once they are
  // gone. One gear, and a lot of bike to push. See bikeControl below.
  topSpeed: 6.95, accel: 2.95, brake: 5.2, grip: 0.94, steerMax: 0.36, mass: 118,
  turf: 1.70,
  seatY: 0.98, seatZ: -0.34, seatX: 0, clearance: 0.10,
  hbGrip: 0.91, hbYaw: 1.03, revTop: 1.35, revEngage: 0.20,
  suspension: 0.05,
  // The loft profiles are never used to build this — buildBody below does that
  // — but carLampBoxes() and anything else that reaches for a plan profile
  // still expects one, so it describes the frame's envelope honestly.
  top: [[0, 0.42], [0.10, 0.90], [0.30, 0.96], [0.70, 1.00], [0.92, 1.04], [1, 0.42]],
  belt: [[0, 0.30], [1, 0.30]],
  plan: [[0, 0.05], [0.08, 0.12], [0.92, 0.12], [1, 0.05]],
  roofK: 1, tuck: 0,
  glassTop: [], glassSide: [0, 0],
  cladding: { rocker: 0, bumper: 0.10, tRear: 0.02, tFront: 0.98, color: CHROME },
  // Frame stations, in bike-local metres. Everything else is derived.
  geom: {
    bb: [0.285, -0.08], head: [[0.80, 0.470], [1.005, 0.400]],
    seatTop: [0.885, -0.315], saddle: [0.945, -0.345], hip: [0.985, -0.345],
    bar: [1.095, 0.395], barHalf: 0.300, grip: [1.075, 0.215],
  },
  tyreW: 0.058, tread: RUBBER, rim: CHROME, spokeC: 0xf0f2f4, spokes: 32, knobby: false,
  ridePose: { lean: 0.20, shirt: 0xf1f0ea, legs: 0x2c3446, skin: 0xcf9a72, hair: 0x2a2016 },
  // 36 identical pulses a cycle with `harm` low leaves one harmonic standing —
  // the cart's trick — which here is the hum of a chain and two fat tyres. It
  // mutes itself at a standstill and the horn is the chrome bell on the bars.
  sound: { cyl: 24, idle: 0, redline: 1400, limiter: 1500,
           decay: 4.2, uneven: 0, tilt: 0.30, harm: 26,
           exhQ: 0.45, exhG: 0.55, intF0: 380, intSpan: 700, intQ: 0.5, intG: 0.20,
           hissG: 0.05, raspG: 0, raspFrom: 99999, rasp: 0, raspK: 1.1,
           boomF: 260, boomQ: 1.8, boomDb: 2, tickF: 1900, tickG: 0.028,
           lumpy: 0, pop: 0, gain: 0.34, rattle: 0, rattleFrom: 0,
           horn: { f: 2637, f2: 3951, type: 'sine', gain: 0.055 } },
  drive: { gears: [1.00], reverse: 1.00, final: 4.0, tyre: 0.670,
           idle: 0, redline: 1400, limiter: 1500,
           shiftUp: 99999, shiftUpLight: 99999, shiftDown: 0, launch: 0, shiftTime: 0.05 },
};

const DBIKE = {
  id: 'dbike',
  name: 'Diamondback — ton bicycle', who: 'Yours', whoDe: '',
  body: 0x17181c, seats: 1, style: 'bike', twoWheel: true,
  park: 'curb', noTraffic: true, electric: true,
  flavour: 'Cadre en aluminium noir, fourche blanche, vingt-et-une vitesses dont sept marchent. Il passe où le truck passe pas.',
  len: 1.74, wid: 0.58, h: 1.16, wheelbase: 1.06, overhangF: 0.34, track: 0, wheelR: 0.335,
  topSpeed: 8.10, accel: 3.60, brake: 6.4, grip: 1.02, steerMax: 0.42, mass: 104,
  turf: 1.9,
  seatY: 1.02, seatZ: -0.32, seatX: 0, clearance: 0.10,
  hbGrip: 0.89, hbYaw: 1.07, revTop: 1.45, revEngage: 0.21,
  suspension: 0.07,
  top: [[0, 0.42], [0.10, 0.92], [0.32, 1.00], [0.72, 1.03], [0.92, 1.06], [1, 0.42]],
  belt: [[0, 0.30], [1, 0.30]],
  plan: [[0, 0.05], [0.08, 0.11], [0.92, 0.11], [1, 0.05]],
  roofK: 1, tuck: 0,
  glassTop: [], glassSide: [0, 0],
  cladding: { rocker: 0, bumper: 0.10, tRear: 0.02, tFront: 0.98, color: 0x17181c },
  geom: {
    bb: [0.300, -0.055], head: [[0.815, 0.455], [1.035, 0.415]],
    seatTop: [0.925, -0.300], saddle: [0.975, -0.325], hip: [1.010, -0.325],
    bar: [1.120, 0.412], barHalf: 0.290, grip: [1.120, 0.382],
  },
  tyreW: 0.052, tread: RUBBER, rim: RIM_ALLOY, spokeC: 0xd8dbde, spokes: 24, knobby: true,
  ridePose: { lean: 0.44, shirt: 0x2f5f9e, legs: 0x232a38, skin: 0xd7a37c, hair: 0x241a12 },
  sound: { cyl: 24, idle: 0, redline: 1600, limiter: 1700,
           decay: 4.6, uneven: 0, tilt: 0.34, harm: 26,
           exhQ: 0.45, exhG: 0.50, intF0: 420, intSpan: 820, intQ: 0.5, intG: 0.22,
           hissG: 0.06, raspG: 0, raspFrom: 99999, rasp: 0, raspK: 1.1,
           boomF: 300, boomQ: 1.8, boomDb: 2, tickF: 2100, tickG: 0.034,
           lumpy: 0, pop: 0, gain: 0.30, rattle: 0, rattleFrom: 0,
           horn: { f: 1976, f2: 2960, type: 'sine', gain: 0.045 } },
  drive: { gears: [1.00], reverse: 1.00, final: 4.4, tyre: 0.670,
           idle: 0, redline: 1600, limiter: 1700,
           shiftUp: 99999, shiftUpLight: 99999, shiftDown: 0, launch: 0, shiftTime: 0.05 },
};

// ---------------------------------------------------------------- frames

function buildCruiser(s) {
  const mb = new MeshBuilder();
  const g = s.geom;
  const chrome = rgb(CHROME), bright = shade(CHROME, 1.06), dark = rgb(0x1c1d20);
  const [bbY, bbZ] = g.bb, [hLo, hHi] = g.head;
  const P = (y, z, x = 0) => [x, y, z];
  const rearAxle = [0, s.wheelR, -s.axleZ], frontAxle = [0, s.wheelR, s.axleZ];

  // The cantilever: two tubes leaving the head tube together and curving all
  // the way to the seat cluster. This is the shape you buy a cruiser for.
  for (const drop of [0, 0.155]) {
    const pts = [];
    for (let k = 0; k <= 7; k++) {
      const u = k / 7;
      const y = hHi[0] - drop - u * (hHi[0] - g.seatTop[0]) - Math.sin(u * Math.PI) * 0.115;
      const z = hHi[1] + u * (g.seatTop[1] - hHi[1]);
      pts.push([y, z]);
    }
    for (let k = 0; k + 1 < pts.length; k++) {
      tube(mb, P(pts[k][0], pts[k][1]), P(pts[k + 1][0], pts[k + 1][1]), 0.021, chrome, 6);
    }
  }
  // Head tube, seat tube, down tube, and the seat post.
  tube(mb, P(hLo[0] - 0.05, hLo[1] + 0.018), P(hHi[0] + 0.03, hHi[1] - 0.010), 0.031, bright, 8, true);
  tube(mb, P(bbY, bbZ), P(g.seatTop[0], g.seatTop[1]), 0.024, chrome, 6);
  tube(mb, P(hLo[0] - 0.02, hLo[1] + 0.006), P(bbY + 0.02, bbZ + 0.02), 0.026, chrome, 6);
  tube(mb, P(g.seatTop[0] - 0.02, g.seatTop[1]), P(g.saddle[0] - 0.02, g.saddle[1]), 0.017, bright, 6);
  // Chainstays and seatstays, one pair each side of the rear wheel.
  for (const sx of [1, -1]) {
    tube(mb, P(bbY, bbZ, sx * 0.042), P(rearAxle[1], rearAxle[2], sx * 0.052), 0.017, chrome, 5);
    tube(mb, P(g.seatTop[0], g.seatTop[1], sx * 0.020), P(rearAxle[1], rearAxle[2], sx * 0.048), 0.015, chrome, 5);
  }
  // Fenders: deep chrome mudguards front and rear, on their stays.
  fender(mb, s.wheelR, -s.axleZ, s.wheelR + 0.055, -1.45, 0.60, 0.062, bright, 10);
  for (const sx of [1, -1]) {
    tube(mb, P(s.wheelR + 0.05, -s.axleZ - 0.30, sx * 0.05), P(rearAxle[1], rearAxle[2], sx * 0.05), 0.008, chrome, 4);
  }
  // Drivetrain: one chainring, two cranks, two pedals, and a chain to the hub.
  discX(mb, 0.058, bbY, bbZ, 0.115, bright, 1, 14);
  ringX(mb, 0.052, bbY, bbZ, 0.045, 0.100, shade(CHROME, 0.72), 1, 12);
  discX(mb, -0.058, bbY, bbZ, 0.052, bright, -1, 10);
  tube(mb, P(bbY, bbZ, 0.068), P(bbY, bbZ, -0.068), 0.030, bright, 8);      // crank axle
  mb.box(0.062, bbY + 0.075, (bbZ - s.axleZ) / 2, 0.02, 0.012, s.axleZ + bbZ, dark);   // chain, upper run
  mb.box(0.062, bbY - 0.075, (bbZ - s.axleZ) / 2, 0.02, 0.012, s.axleZ + bbZ, dark);
  mb.box(0, 0.115, bbZ, 0.10, 0.05, 0.06, dark);                            // kickstand foot
  tube(mb, P(bbY - 0.03, bbZ - 0.02, 0.05), P(0.12, bbZ - 0.06, 0.11), 0.010, chrome, 4);
  // Saddle: black, sprung, on two visible coils.
  mb.box(0, g.saddle[0] + 0.035, g.saddle[1] - 0.02, 0.19, 0.055, 0.28, rgb(0x141416));
  mb.box(0, g.saddle[0] + 0.05, g.saddle[1] + 0.10, 0.10, 0.045, 0.10, rgb(0x141416));
  for (const sx of [1, -1]) {
    tube(mb, P(g.saddle[0] + 0.01, g.saddle[1] - 0.10, sx * 0.055), P(g.saddle[0] - 0.06, g.saddle[1] - 0.13, sx * 0.055), 0.020, bright, 6);
  }
  letters(mb, 'TRACER', { cx: 0.055, cy: 0.40, cz: -0.30, h: 0.035, color: shade(CHROME, 0.62),
    face: '+x', solid: true, off: 0.004 });
  return mb;
}

function buildDbike(s) {
  const mb = new MeshBuilder();
  const g = s.geom;
  const black = rgb(0x17181c), grey = rgb(0x33363c), white = rgb(0xeceef0);
  const blue = rgb(0x2f6fc4), silver = rgb(0xb9bdc2);
  const [bbY, bbZ] = g.bb, [hLo, hHi] = g.head;
  const P = (y, z, x = 0) => [x, y, z];
  const rearAxle = [0, s.wheelR, -s.axleZ];

  // A plain diamond: top tube, down tube, seat tube, and the two stays. Fat
  // aluminium sections, which is what tells it apart from a steel bike.
  tube(mb, P(hHi[0] - 0.03, hHi[1] - 0.01), P(g.seatTop[0], g.seatTop[1]), 0.028, black, 6);
  tube(mb, P(hLo[0] + 0.01, hLo[1] - 0.005), P(bbY + 0.02, bbZ + 0.02), 0.034, black, 6);
  tube(mb, P(bbY, bbZ), P(g.seatTop[0] + 0.01, g.seatTop[1]), 0.030, black, 6);
  tube(mb, P(hLo[0] - 0.04, hLo[1] + 0.010), P(hHi[0] + 0.02, hHi[1] - 0.006), 0.030, black, 8, true);
  tube(mb, P(g.seatTop[0] - 0.01, g.seatTop[1]), P(g.saddle[0] - 0.02, g.saddle[1]), 0.016, silver, 6);
  for (const sx of [1, -1]) {
    tube(mb, P(bbY, bbZ, sx * 0.040), P(rearAxle[1], rearAxle[2], sx * 0.050), 0.019, black, 5);
    tube(mb, P(g.seatTop[0] - 0.02, g.seatTop[1], sx * 0.018), P(rearAxle[1], rearAxle[2], sx * 0.046), 0.014, black, 5);
  }
  // The decals: DIAMONDBACK down the top tube in white, and the blue flash
  // under it. The photograph has it on the down tube; on the top tube it is
  // readable from the chase camera, which is the only place anyone reads it.
  for (const sx of [1, -1]) {
    letters(mb, 'DIAMONDBACK', { cx: sx * 0.030, cy: 0.975, cz: 0.075, h: 0.048, color: white,
      face: sx > 0 ? '+x' : '-x', solid: true, off: 0.004 });
    mb.box(sx * 0.032, 0.930, 0.075, 0.006, 0.014, 0.46, blue);
    mb.box(sx * 0.033, 0.66, -0.16, 0.006, 0.10, 0.030, blue);
  }
  // Triple chainring, cranks, pedals, chain, and the rear mech hanging off the
  // dropout with the cassette behind it.
  for (const [rr, off] of [[0.105, 0.082], [0.086, 0.068], [0.062, 0.054]]) {
    discX(mb, off, bbY, bbZ, rr, silver, 1, 12);
  }
  discX(mb, -0.060, bbY, bbZ, 0.062, silver, -1, 10);
  tube(mb, P(bbY, bbZ, 0.086), P(bbY, bbZ, -0.072), 0.026, grey, 8);
  mb.box(0.078, bbY + 0.070, (bbZ - s.axleZ) / 2, 0.02, 0.011, s.axleZ + bbZ, grey);
  mb.box(0.078, bbY - 0.055, (bbZ - s.axleZ) / 2, 0.02, 0.011, s.axleZ + bbZ, grey);
  for (const rr of [0.050, 0.038]) discX(mb, 0.066, s.wheelR, -s.axleZ, rr, silver, 1, 10);
  mb.box(0.070, s.wheelR - 0.14, -s.axleZ + 0.03, 0.03, 0.16, 0.07, grey);
  mb.box(0, g.saddle[0] + 0.030, g.saddle[1] - 0.01, 0.13, 0.045, 0.26, rgb(0x121214));
  // Bottle cage bolts and the reflector under the saddle, because every bike
  // in 2004 had one and nobody ever took it off.
  mb.box(0, g.saddle[0] - 0.055, g.saddle[1] - 0.115, 0.07, 0.05, 0.02, rgb(0xc0332a));
  return mb;
}

// ---------------------------------------------------------------- steering

// Everything that turns with the bars, authored about the FRONT AXLE so the
// draw can spin it with the same transform the front wheel gets. Rotating the
// fork about the axle instead of the head tube is 6 cm of trail out of place
// and nobody has ever noticed.
function buildCruiserSteer(s) {
  const mb = new MeshBuilder();
  const g = s.geom, Z = (z) => z - s.axleZ;
  const bright = shade(CHROME, 1.06), grip = rgb(0x141416);
  const [hLo, hHi] = g.head;
  const P = (y, z, x = 0) => [x, y, Z(z)];
  // Fork: two legs raked forward, curving to the dropouts.
  for (const sx of [1, -1]) {
    tube(mb, P(hLo[0], hLo[1], sx * 0.028), P(0.56, s.axleZ + 0.030, sx * 0.048), 0.019, bright, 6);
    tube(mb, P(0.56, s.axleZ + 0.030, sx * 0.048), P(s.wheelR, s.axleZ, sx * 0.052), 0.016, bright, 6);
  }
  tube(mb, P(hLo[0] + 0.02, hLo[1], 0.05), P(hLo[0] + 0.02, hLo[1], -0.05), 0.026, bright, 8);
  fender(mb, s.wheelR, Z(s.axleZ), s.wheelR + 0.055, -0.45, 1.42, 0.062, bright, 10);
  // Stem, then bars that go out wide and sweep straight back at you.
  tube(mb, P(hHi[0] - 0.02, hHi[1]), P(g.bar[0], g.bar[1]), 0.022, bright, 6);
  for (const sx of [1, -1]) {
    tube(mb, P(g.bar[0], g.bar[1], 0), P(g.bar[0] + 0.010, g.bar[1] - 0.02, sx * 0.115), 0.016, bright, 6);
    tube(mb, P(g.bar[0] + 0.010, g.bar[1] - 0.02, sx * 0.115), P(g.bar[0] - 0.010, g.bar[1] - 0.11, sx * g.barHalf), 0.016, bright, 6);
    tube(mb, P(g.bar[0] - 0.010, g.bar[1] - 0.11, sx * g.barHalf), P(g.grip[0], g.grip[1], sx * (g.barHalf - 0.005)), 0.016, bright, 6);
    tube(mb, P(g.grip[0] + 0.002, g.grip[1] + 0.03, sx * (g.barHalf - 0.004)), P(g.grip[0], g.grip[1] - 0.06, sx * (g.barHalf - 0.006)), 0.020, grip, 6, true);
  }
  // The bell. It is why the horn on this thing is a bell.
  mb.cyl(0.09, g.bar[0] + 0.030, Z(g.bar[1] - 0.04), 0.035, 0.030, 10, bright, 'y');
  return mb;
}

function buildDbikeSteer(s) {
  const mb = new MeshBuilder();
  const g = s.geom, Z = (z) => z - s.axleZ;
  const white = rgb(0xeceef0), black = rgb(0x17181c), grey = rgb(0x33363c);
  const [hLo, hHi] = g.head;
  const P = (y, z, x = 0) => [x, y, Z(z)];
  // Suspension fork: a black crown, white lowers, and the arch between them.
  tube(mb, P(hLo[0] + 0.01, hLo[1], 0.06), P(hLo[0] + 0.01, hLo[1], -0.06), 0.028, black, 8);
  for (const sx of [1, -1]) {
    tube(mb, P(hLo[0], hLo[1], sx * 0.052), P(0.62, s.axleZ + 0.012, sx * 0.056), 0.021, grey, 6);
    tube(mb, P(0.64, s.axleZ + 0.012, sx * 0.056), P(s.wheelR, s.axleZ, sx * 0.056), 0.026, white, 6);
  }
  tube(mb, P(0.60, s.axleZ - 0.030, 0.055), P(0.60, s.axleZ - 0.030, -0.055), 0.020, white, 6);
  letters(mb, 'DB', { cx: 0.084, cy: 0.50, cz: Z(s.axleZ) + 0.001, h: 0.038, color: black,
    face: '+x', solid: true, off: 0.002 });
  // Flat bar, stem, grips, brake levers, and the cables looping off the front.
  tube(mb, P(hHi[0] - 0.01, hHi[1]), P(g.bar[0], g.bar[1]), 0.021, black, 6);
  tube(mb, P(g.bar[0], g.bar[1], g.barHalf), P(g.bar[0], g.bar[1], -g.barHalf), 0.015, black, 6);
  for (const sx of [1, -1]) {
    tube(mb, P(g.bar[0], g.bar[1], sx * (g.barHalf - 0.005)), P(g.bar[0], g.bar[1], sx * (g.barHalf - 0.115)), 0.020, rgb(0x141416), 6, true);
    mb.box(sx * (g.barHalf - 0.14), g.bar[0] + 0.012, Z(g.bar[1] + 0.055), 0.025, 0.022, 0.10, grey);
    tube(mb, P(g.bar[0] + 0.02, g.bar[1] - 0.02, sx * (g.barHalf - 0.16)), P(g.bar[0] + 0.038, g.bar[1] + 0.06, sx * 0.05), 0.006, grey, 4);
  }
  return mb;
}

// ---------------------------------------------------------------- the rider

// Six pieces: a torso with the head and both arms baked in (they only move
// with the bars, which move hardly at all), and a thigh and a shin per leg.
// The thigh's origin is the hip and the shin's is the knee, so the two of them
// are placed by a two-link solve against wherever the pedal has got to.
const L1 = 0.46, L2 = 0.46;

function buildTorso(s) {
  const mb = new MeshBuilder();
  const p = s.ridePose;
  const shirt = rgb(p.shirt), skin = rgb(p.skin), hair = rgb(p.hair), jean = rgb(p.legs);
  const lean = p.lean, cs = Math.cos(lean), sn = Math.sin(lean);
  const up = (d) => [0, d * cs, d * sn];                       // along the spine
  const sh = up(0.46), nk = up(0.60), hd = up(0.74);
  mb.box(0, 0.04, 0.01, 0.30, 0.20, 0.22, jean);               // seat and hips
  tube(mb, [0, 0.10, 0.01], [sh[0], 0.10 + sh[1], 0.01 + sh[2]], 0.135, shirt, 8);
  mb.box(0, 0.10 + sh[1], 0.01 + sh[2], 0.36, 0.14, 0.20, shirt);
  tube(mb, [0, 0.10 + sh[1], 0.01 + sh[2]], [0, 0.10 + nk[1], 0.01 + nk[2]], 0.055, skin, 6);
  mb.box(0, 0.12 + hd[1], 0.01 + hd[2], 0.19, 0.23, 0.21, skin);
  mb.box(0, 0.19 + hd[1], 0.00 + hd[2], 0.20, 0.10, 0.22, hair);
  // Arms: shoulder to the grips, which sit forward and a little below.
  const gx = s.geom.barHalf - 0.03, gy = s.geom.grip[0] - s.geom.hip[0], gz = s.geom.grip[1] - s.geom.hip[1];
  for (const sx of [1, -1]) {
    const sxo = [sx * 0.17, 0.10 + sh[1], 0.01 + sh[2]];
    tube(mb, sxo, [sx * gx, gy + 0.04, gz], 0.052, shirt, 6);
    tube(mb, [sx * gx, gy + 0.04, gz], [sx * gx, gy, gz + 0.02], 0.040, skin, 5);
  }
  return mb;
}
// The two crank arms, about the bottom bracket. They turn with the road wheel,
// so they cannot live in the body mesh — a foot that leaves the pedal is the
// one thing that would give the whole rider away. The pedal itself is the shoe
// on the end of the shin; nobody has ever looked past it.
function buildCrank(s) {
  const mb = new MeshBuilder();
  const c = s.knobby ? rgb(0x33363c) : shade(CHROME, 1.06);
  for (const [sx, ph] of [[-1, 1], [1, -1]]) {
    tube(mb, [sx * 0.062, 0, 0], [sx * 0.074, ph * CRANK, 0], 0.016, c, 5, true);
    mb.box(sx * 0.100, ph * CRANK, 0, 0.075, 0.020, 0.095, rgb(0x1c1d20));
  }
  return mb;
}
function buildThigh(s) {
  const mb = new MeshBuilder();
  const p = s.ridePose;
  tube(mb, [0, 0, 0], [0, -L1, 0], 0.082, rgb(p.legs), 6, true);
  return mb;
}
function buildShin(s) {
  const mb = new MeshBuilder();
  const p = s.ridePose;
  tube(mb, [0, 0.02, 0], [0, -L2, 0.02], 0.055, rgb(p.legs), 6, true);
  mb.box(0, -L2 - 0.02, 0.05, 0.09, 0.055, 0.20, rgb(0x2a2b2f));    // shoe on the pedal
  return mb;
}

// ---------------------------------------------------------------- physics

// FEEL — what a bicycle has instead of an engine.
//
// STAM is one number, 0..1. Pedalling spends it and coasting rebuilds it, and
// what it buys is throttle: on empty legs you still have 18 % of them, which is
// a cruise rather than a stop. Full to empty is about nine seconds of standing
// on it, and ten back — a fresh Diamondback tops out at 28 km/h and a spent one
// at 21. Nothing draws it — you are meant to feel it in
// the last five km/h going away and coming back, not read it off a gauge.
const STAM_DRAIN = 0.115;      // per second at full effort
const STAM_RECOVER = 0.105;    // per second freewheeling
const STAM_FLOOR = 0.18;       // fraction of the legs that never runs out
// The bunny-hop. 3.05 m/s of vertical is 47 cm of air, which clears a kerb, a
// curb-cut lip and the low wall at the marina, and costs a fifth of the legs.
const HOP_V = 3.05;
const HOP_COST = 0.19;
const HOP_MIN = 0.14;

const BIKE = { veh: null, stam: 1, hopHeld: false, effort: 0, hopT: 0 };

/**
 * Called from tick() with the control record BEFORE the vehicle integrates it.
 * A no-op in anything with a motor.
 */
export function bikeControl(G, ctl, dt) {
  const v = G && G.veh;
  if (!v || !v.spec.twoWheel) { BIKE.veh = null; return; }
  if (BIKE.veh !== v) { BIKE.veh = v; BIKE.stam = 1; BIKE.hopHeld = false; }
  const s = v.spec;
  const push = ctl.throttle > 0.05 && v.dir > 0;
  // Effort is worst near the top of the gear, which is where legs give out.
  const load = push ? 0.45 + 0.55 * Math.min(1, Math.abs(v.vLong) / s.topSpeed) : 0;
  BIKE.stam += (push ? -STAM_DRAIN * load : STAM_RECOVER * (v.inAir ? 0.3 : 1)) * dt;
  if (BIKE.stam < 0) BIKE.stam = 0; else if (BIKE.stam > 1) BIKE.stam = 1;
  ctl.throttle *= STAM_FLOOR + (1 - STAM_FLOOR) * BIKE.stam;
  BIKE.effort = push ? load * (STAM_FLOOR + (1 - STAM_FLOOR) * BIKE.stam) : 0;
  // Space is not a handbrake on a bicycle. It is both wheels off the ground.
  const want = !!ctl.handbrake;
  ctl.handbrake = false;
  BIKE.hopT = Math.max(0, BIKE.hopT - dt);
  if (want && !BIKE.hopHeld && !v.inAir && BIKE.stam > HOP_MIN) {
    v.vy = Math.max(v.vy, HOP_V);
    BIKE.stam -= HOP_COST;
    BIKE.hopT = 0.45;
  }
  BIKE.hopHeld = want;
}

/** For the HUD, the tests and anyone who wants to know how the legs are. */
export function bikeState() {
  return { stamina: BIKE.stam, effort: BIKE.effort, hop: BIKE.hopT, on: !!BIKE.veh };
}

// ---------------------------------------------------------------- drawing

const mm = m4.create();
const meshes = new Map();          // spec.id -> uploaded rider/steer meshes

function riderMeshes(r, s) {
  let m = meshes.get(s.id);
  if (!m) {
    m = {
      steer: r.upload(s.buildSteer(s)),
      crank: r.upload(buildCrank(s)),
      torso: r.upload(buildTorso(s)),
      thigh: r.upload(buildThigh(s)),
      shin: r.upload(buildShin(s)),
    };
    meshes.set(s.id, m);
  }
  return m;
}

/**
 * The fork, the bars and (when somebody is on it) the rider. Called from
 * drawCar for anything with `twoWheel`, which covers the one you are riding,
 * the ones parked outside the two houses, and every cyclist in the town.
 * `rider` is false for a bike leaning against a wall.
 */
export function drawTwoWheeler(G, spec, x, z, yaw, roll, spin, steer, y, rider) {
  const r = G.renderer;
  if (!r) return;
  const M = riderMeshes(r, spec);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // Bike-local -> world, through the same roll the body mesh was drawn with.
  const put = (lx, ly, lz) => {
    const rx = lx * cr - ly * sr, ry = lx * sr + ly * cr;
    return [x + rx * cy + lz * sy, y + ry, z - rx * sy + lz * cy];
  };
  const p = put(0, 0, spec.axleZ);
  m4.compose(mm, p[0], p[1], p[2], yaw - steer, 0, roll);
  r.draw(M.steer, mm);

  const g = spec.geom;
  const [hipY, hipZ] = g.hip, [bbY, bbZ] = g.bb;
  // The cranks turn with the road wheel through one fixed gear. Standing on
  // the pedals under load lifts the rider off the saddle a couple of inches.
  const crank = spin / GEAR;
  const bp = put(0, bbY, bbZ);
  m4.compose(mm, bp[0], bp[1], bp[2], yaw, Math.PI / 2 - crank, roll);
  r.draw(M.crank, mm);
  if (!rider) return;

  const stand = spec === (G.veh && G.veh.spec) ? BIKE.effort : 0;
  const lift = stand * 0.055 + Math.abs(Math.sin(crank)) * stand * 0.02;
  const t = put(0, hipY + lift, hipZ);
  m4.compose(mm, t[0], t[1], t[2], yaw, 0, roll);
  r.draw(M.torso, mm);
  for (let k = 0; k < 2; k++) {
    const a = crank + k * Math.PI;
    const py = bbY + Math.sin(a) * CRANK, pz = bbZ + Math.cos(a) * CRANK;
    const hy = hipY + lift, hz = hipZ;
    const vy = py - hy, vz = pz - hz;
    let d = Math.hypot(vy, vz);
    if (d > L1 + L2 - 0.004) d = L1 + L2 - 0.004;
    const base = Math.atan2(vz, -vy);
    const co = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d || 1e-6)));
    const th = base + Math.acos(co);
    const ky = hy - L1 * Math.cos(th), kz = hz + L1 * Math.sin(th);
    const sh = Math.atan2(pz - kz, -(py - ky));
    const sx = k ? 0.085 : -0.085;
    const hp = put(sx, hy - 0.02, hz);
    m4.compose(mm, hp[0], hp[1], hp[2], yaw, -th, roll);
    r.draw(M.thigh, mm);
    const kp = put(sx, ky - 0.02, kz);
    m4.compose(mm, kp[0], kp[1], kp[2], yaw, -sh, roll);
    r.draw(M.shin, mm);
  }
}

// ---------------------------------------------------------------- register

CRUISER.buildBody = buildCruiser;
CRUISER.buildSteer = buildCruiserSteer;
CRUISER.buildWheel = buildBikeWheel;
DBIKE.buildBody = buildDbike;
DBIKE.buildSteer = buildDbikeSteer;
DBIKE.buildWheel = buildBikeWheel;
// A reflector at each end, which is every lamp a bicycle has. Without these
// the damage pack would put a Sunfire's tail lights on a pushbike.
const reflectors = (s) => ({
  head: [[0.10, 1.02, s.axleZ + 0.05, 0.07, 0.05]],
  tail: [[0, s.geom.saddle[0] - 0.055, s.geom.saddle[1] - 0.13, 0.07, 0.05]],
  rev: [[0, s.geom.saddle[0] - 0.055, s.geom.saddle[1] - 0.13, 0.03, 0.03]],
});

export const CRUISER_BIKE = register(CRUISER);
export const PLAYER_BIKE = register(DBIKE);
CRUISER_BIKE.lamps = reflectors(CRUISER_BIKE);
PLAYER_BIKE.lamps = reflectors(PLAYER_BIKE);

// Nobody earns a bicycle. Sayyad's is chained to nothing outside 75
// Denise-Friend and yours has been in the driveway at 299 Fraser since you
// were twelve.
unlock('cruiser', { kind: 'free', who: 'Sayyad' });
unlock('dbike', { kind: 'free', who: 'Yours' });

export const BIKES = [CRUISER_BIKE, PLAYER_BIKE];
