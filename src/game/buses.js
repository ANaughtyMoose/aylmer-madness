// The two buses, from photographs.
//
// 1. The city bus. What was on the lot was "an Orion I" that was really just a
//    box with windows. What actually ran the Aylmer routes in 2004 was the GM
//    New Look — the fishbowl — in the STO's white / turquoise / magenta. The
//    identifying things, in the order you notice them: the six-piece windshield
//    curved so hard it wraps round the corner posts, the standing ribs down the
//    panel under the windows, the orange dot-matrix sign in the brow, twin
//    round sealed beams each side over a chrome bumper, and the front door
//    immediately behind the front wheel. Route 40 LAVIGNE is off the photograph
//    and is a real Aylmer street (Wilfrid-Lavigne); 33, 37, 51 and 59 were the
//    other Aylmer/Hull runs and would do just as well.
//
// 2. The school bus: a Blue Bird body on an International 3800 chassis, which
//    is a conventional — engine out front, long snout, big slatted grille —
//    and not a flat-front transit bus. Yellow, black rub rails, black bumpers,
//    a white roof cap, warning lamps at roof level at both ends, a stop arm and
//    a crossing gate. It is July 2004, so the lettering is Québec's: ÉCOLIERS
//    on both headers and ARRÊT on the arm, not SCHOOL BUS.
//
// Both bodies are lofted with cars.js's own loft() off hand-authored profiles,
// exactly like a car; what is different is that everything hung off them is
// here rather than in addDetails(), which is keyed on the ids cars.js owns.
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { loft, specRing, tToZ } from './cars.js';
import { register, unlock, tube, discZ, ringZ, stripe, letters, lampMeshes } from './vehiclekit.js';

const GLASS = 0x26313b, TIRE = 0x17181a, CHROME = 0xd4d6d8;
const AMBER = 0xf0a030, TAIL = 0xc0332a, LAMP = 0xfff3c4, PLATE = 0xe8e6dc;

// ---------------------------------------------------------------- city bus

// STO's old scheme, off the photograph: an off-white body, a turquoise band,
// and the magenta comma that everybody in the Outaouais remembers.
const STO_WHITE = 0xeeece6, STO_TEAL = 0x3fb3c2, STO_PINK = 0xd0308c, STO_BLUE = 0x2a5cab;
const SIGN_ORANGE = 0xff8c14;

const CITY = {
  id: 'bus',
  name: 'GM New Look — ex-STO 7901', who: 'Le lot',
  body: STO_WHITE,
  flavour: 'Le fishbowl. Quarante places, un diesel qui claque, pis la pancarte 40 LAVIGNE encore dedans. Passe pas sur Bancroft.',
  // Dimensions, wheelbase, mass and every driving number stay exactly what the
  // lot bus already had — this is a rebody, not a new vehicle.
  len: 12.00, wid: 2.59, h: 3.10, wheelbase: 6.20, overhangF: 2.00, wheelR: 0.53,
  clearance: 0.42,
  // Flat roof the whole way, then the brow rolls over and dives into the
  // windshield: 1.3 m of drop in the last 1.4 m of bus, which is the fishbowl.
  top: [[0, 2.55], [0.008, 2.92], [0.02, 3.04], [0.035, 3.07], [0.935, 3.07], [0.952, 3.02],
        [0.962, 2.88], [0.972, 2.58], [0.981, 2.28], [0.990, 1.99], [1, 1.76]],
  belt: [[0, 1.60], [0.025, 1.90], [0.05, 1.95], [0.940, 1.95], [0.958, 1.88], [0.975, 1.78], [1, 1.76]],
  // The nose rounds off in plan as well as in section — that is what makes the
  // windshield wrap instead of just leaning back.
  plan: [[0, 1.08], [0.008, 1.22], [0.022, 1.285], [0.04, 1.295], [0.955, 1.295],
         [0.976, 1.25], [0.99, 1.17], [1, 1.10]],
  roofK: [[0, 0.93], [0.90, 0.93], [0.95, 0.96], [1, 1.0]],
  tuck: 0.02,
  glassSide: [0.055, 0.938],
  glassTop: [[0.955, 0.999, 1.85]],
  cladding: { rocker: 0.30, bumper: 0.42, tRear: 0.012, tFront: 0.988, color: 0x9ba0a6 },
  sign: '40 LAVIGNE', fleet: '7901',
};

function cityPaint(s) {
  const white = rgb(s.body), glass = rgb(GLASS), under = shade(0x1c1d20, 1);
  // The windshield faces half upward, so it takes the sun full on and comes out
  // pale; it is tinted down to keep it reading as glass rather than as panel.
  const wind = shade(GLASS, 0.62);
  const dark = shade(s.body, 0.80);
  return (face, t, y) => {
    if (face === 'bottom') return [under, 0, 0];
    if (face === 'glassL' || face === 'glassR') {
      return [t >= s.glassSide[0] && t <= s.glassSide[1] ? glass : white, 0, 0];
    }
    if (face === 'top') {
      if (t >= 0.955 && y > 1.85) return [wind, 0, 0];       // the fishbowl
      return [white, 0, 0];
    }
    if (face === 'sideL' || face === 'sideR') return [white, 0, 0];
    return [y < 1.0 ? dark : white, 0, 0];                   // end caps
  };
}

function buildCityBus(s, opts = {}) {
  const mb = new MeshBuilder();
  loft(mb, s, 72, (t) => specRing(s, t), cityPaint(s));
  const z = (t) => tToZ(s, t);
  const zF = z(1), zR = z(0);
  const white = rgb(s.body), teal = rgb(STO_TEAL), pink = rgb(STO_PINK), blue = rgb(STO_BLUE);
  const chrome = rgb(CHROME), dark = rgb(0x2a2c30), glass = shade(GLASS, 0.9);
  const both = (fn) => { fn(1); fn(-1); };
  const hw = 1.295;

  // ---- the greenhouse -------------------------------------------------
  // Pillars follow the tumblehome: the body is 9 cm narrower at the roof than
  // at the sill, so a vertical box would float off the glass at one end.
  for (let k = 0; k < 11; k++) {
    const t = 0.062 + k * 0.0866, zz = z(t);
    both((sx) => tube(mb, [sx * (hw + 0.004), 1.94, zz], [sx * (hw * 0.93 + 0.004), 3.02, zz], 0.030, white, 4));
  }
  both((sx) => {
    // Roof fascia above the glass, and the bar the standee sash slides in.
    mb.box(sx * (hw * 0.945), 2.90, -1.15, 0.030, 0.26, 10.6, white);
    mb.box(sx * (hw * 0.975), 2.62, -1.15, 0.026, 0.05, 10.6, white);
    // Standing ribs: the corrugated panel between the sill and the belt band.
    for (let k = 0; k < 5; k++) {
      mb.box(sx * (hw + 0.008), 1.46 + k * 0.088, -1.15, 0.018, 0.030, 10.9, shade(s.body, 0.94));
    }
  });

  // ---- the livery -----------------------------------------------------
  both((sx) => {
    mb.box(sx * (hw + 0.010), 1.90, -1.15, 0.018, 0.075, 11.0, teal);   // thin band under the sill
    mb.box(sx * (hw + 0.010), 1.16, -1.15, 0.018, 0.30, 11.0, teal);    // the wide turquoise band
    // The magenta comma: it comes up out of the band ahead of the centre door,
    // curls over and drops back into it. Fourteen segments of a spiral whose
    // radius grows as it goes, so it ends in a tail instead of closing back on
    // itself into a ring — which is what the first attempt did.
    for (let k = 0; k < 14; k++) {
      const u0 = k / 14, u1 = (k + 1) / 14;
      const seg = [u0, u1].map((u) => {
        const a = -1.05 + u * 4.35, r = 0.62 + u * 0.42;
        return [1.30 + Math.sin(a) * r * 0.62, -0.35 + Math.cos(a) * r * 1.30];
      });
      stripe(mb, sx * (hw + 0.021), sx, seg, 0.30 - u0 * 0.21, pink);
    }
  });
  // Fleet number on both flanks, and again on the front panel.
  both((sx) => letters(mb, s.fleet, {
    cx: sx * (hw + 0.024), cy: 1.66, cz: z(0.83), h: 0.16, color: blue,
    face: sx > 0 ? '+x' : '-x', solid: true, off: 0,
  }));
  both((sx) => letters(mb, 'STO', {
    cx: sx * (hw + 0.024), cy: 1.66, cz: z(0.13), h: 0.20, color: teal,
    face: sx > 0 ? '+x' : '-x', solid: true, off: 0,
  }));
  letters(mb, s.fleet, { cx: 0, cy: 1.34, cz: zF, h: 0.22, color: blue, face: '+z', solid: true, off: 0.02 });

  // ---- the brow, and what is written in it ----------------------------
  // The sign sits in the top of the fishbowl, an orange dot matrix behind a
  // dark mask. It is the one thing on a bus you can read from a block away.
  const zs = z(0.966);
  mb.box(0, 2.82, zs + 0.05, 2.16, 0.36, 0.08, dark);
  letters(mb, s.sign, { cx: 0, cy: 2.82, cz: zs + 0.09, h: 0.24, color: rgb(SIGN_ORANGE), face: '+z', off: 0.01 });
  // A route number over the front door and one on the tail, the way they ran.
  letters(mb, '40', { cx: -(hw + 0.02), cy: 2.72, cz: z(0.80), h: 0.20, color: rgb(SIGN_ORANGE), face: '-x', off: 0.01 });
  letters(mb, '40', { cx: 0.58, cy: 2.62, cz: zR - 0.06, h: 0.20, color: rgb(SIGN_ORANGE), face: '-z', off: 0.01 });

  // ---- the front ------------------------------------------------------
  // Twin round sealed beams each side, chrome-ringed, with the turn signal in
  // a square lens under them. Everything sits on the flat front panel.
  both((sx) => {
    for (const ax of [0.70, 0.98]) {
      discZ(mb, sx * ax, 0.95, zF + 0.055, 0.105, rgb(LAMP), 1, 12);
      ringZ(mb, sx * ax, 0.95, zF + 0.050, 0.105, 0.140, chrome, 1, 12);
      tube(mb, [sx * ax, 0.95, zF - 0.02], [sx * ax, 0.95, zF + 0.05], 0.132, chrome, 12);
    }
    mb.box(sx * 0.84, 0.68, zF + 0.03, 0.34, 0.14, 0.06, rgb(AMBER));
    // The marker light that wraps onto the corner.
    mb.box(sx * 1.10, 2.20, z(0.985), 0.05, 0.16, 0.20, rgb(AMBER));
    // Mirror on its arm, out where a bus driver can actually see down the side.
    if (!opts.noMirrors) {
      mb.box(sx * 1.40, 2.16, z(0.955), 0.06, 0.06, 0.30, dark);
      mb.box(sx * 1.44, 1.94, z(0.955), 0.05, 0.46, 0.17, dark);
    }
  });
  mb.box(0, 0.56, zF + 0.02, 2.30, 0.24, 0.14, chrome);                    // chrome bumper
  both((sx) => mb.box(sx * 1.16, 0.56, z(0.986), 0.16, 0.24, 0.30, chrome, { yaw: sx * 0.42 }));
  mb.box(0, 1.02, zF + 0.02, 2.10, 0.06, 0.03, teal);                      // the band crossing the nose
  mb.box(0, 0.80, zF + 0.02, 2.10, 0.30, 0.03, teal);
  mb.box(0, 1.70, zF + 0.02, 1.60, 0.10, 0.03, shade(s.body, 0.86));       // the panel seam under the glass
  // The six-piece windshield: two centre panes, two lowers, two wrapped
  // corners. The mullions are what make you count them.
  mb.box(0, 2.30, z(0.981) + 0.04, 0.07, 1.10, 0.07, shade(s.body, 0.7));
  both((sx) => mb.box(sx * 0.94, 2.30, z(0.979) + 0.04, 0.06, 1.05, 0.06, shade(s.body, 0.7)));
  mb.box(0, 2.06, z(0.988) + 0.04, 2.00, 0.06, 0.06, shade(s.body, 0.7));

  // ---- doors, arches, skirt -------------------------------------------
  // Québec drives on the right, so the kerb — and both doors — are on -X.
  for (const [zd, wd] of [[2.20, 0.98], [-0.90, 1.12]]) {
    // A folding leaf is a white frame with glass in it, top to bottom — not a
    // black slab. The frame stands 8 mm proud, the glass sits back inside it.
    mb.box(-(hw + 0.008), 1.62, zd, 0.016, 2.36, wd + 0.05, white);
    mb.box(-(hw + 0.004), 1.62, zd, 0.014, 2.24, wd - 0.03, glass);
    mb.box(-(hw + 0.012), 1.62, zd, 0.016, 2.30, 0.04, white);              // the split between the leaves
    mb.box(-(hw + 0.012), 0.55, zd, 0.016, 0.20, wd - 0.03, white);         // the step under it
  }
  both((sx) => {
    for (const sz of [1, -1]) {
      mb.cyl(sx * (hw - 0.03), s.wheelR + 0.06, sz * s.axleZ, s.wheelR + 0.11, 0.09, 14, shade(0x2e3033, 0.8), 'x', true);
    }
    // Rear duals: the inner tyre never turns where you can see it, so it is
    // part of the body rather than a fifth wheel to transform every frame.
    mb.cyl(sx * 0.86, s.wheelR, -s.axleZ, s.wheelR, 0.30, 12, rgb(TIRE), 'x');
    // Skirt panel, brushed rather than painted, between the arches.
    mb.box(sx * (hw + 0.006), 0.58, -0.9, 0.024, 0.30, s.len * 0.52, rgb(0x9ba0a6));
  });

  // ---- roof and tail ---------------------------------------------------
  for (const t of [0.30, 0.62]) mb.box(0, 3.09, z(t), 0.80, 0.05, 0.80, shade(0x2e3033, 0.85));
  mb.box(0, 3.08, z(0.06), 1.30, 0.06, 0.60, shade(s.body, 0.9));           // the rear roof vent
  both((sx) => {
    discZ(mb, sx * 0.92, 1.34, zR - 0.055, 0.115, rgb(TAIL), -1, 12);
    ringZ(mb, sx * 0.92, 1.34, zR - 0.050, 0.115, 0.145, chrome, -1, 12);
    discZ(mb, sx * 0.92, 0.98, zR - 0.055, 0.085, rgb(AMBER), -1, 10);
  });
  mb.box(0, 2.42, zR - 0.02, 1.70, 0.86, 0.03, glass);                      // rear window
  for (let k = -1; k <= 1; k++) mb.box(0, 1.62 + k * 0.13, zR - 0.02, 1.50, 0.07, 0.03, shade(0x2e3033, 0.7));
  mb.box(0, 0.56, zR - 0.02, 2.20, 0.24, 0.14, chrome);
  mb.box(0, 0.90, zR - 0.03, 0.44, 0.18, 0.03, rgb(PLATE));
  return mb;
}

// A transit wheel: a lot of black rubber, a pale disc and eight lug nuts. No
// alloys, no covers — nobody has ever polished a bus wheel.
function buildBusWheel(s) {
  const mb = new MeshBuilder();
  const w = s.id === 'bus' ? 0.32 : 0.30;
  const rim = s.id === 'bus' ? 0xc6c8ca : 0x34373c;      // school buses run black steel
  mb.cyl(0, 0, 0, s.wheelR, w, 16, rgb(TIRE), 'x');
  mb.cyl(0, 0, 0, s.wheelR * 0.60, w * 1.06, 12, rgb(rim), 'x');
  for (const dir of [1, -1]) {
    const x = dir * (w / 2 + 0.014);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const cy = Math.cos(a) * s.wheelR * 0.30, cz = Math.sin(a) * s.wheelR * 0.30;
      mb.box(x, cy, cz, 0.02, 0.045, 0.045, shade(rim, s.id === 'bus' ? 0.55 : 2.1));
    }
    mb.cyl(x, 0, 0, s.wheelR * 0.14, 0.05, 8, shade(rim, s.id === 'bus' ? 0.75 : 1.7), 'x');
  }
  return mb;
}

// ---------------------------------------------------------------- school bus

const SB_YELLOW = 0xf2bf0d, SB_BLACK = 0x16171a, SB_ROOF = 0xe6e6e2;

const SCHOOL = {
  id: 'schoolbus',
  name: 'Autobus scolaire Blue Bird', who: 'La commission scolaire', whoDe: '',
  body: SB_YELLOW, seats: 6, style: 'bus',
  park: 'building', noTraffic: true, duals: true,
  flavour: 'International 3800, 72 places, pis un été complet sans écoliers dedans. La clé est au-dessus du pare-soleil.',
  len: 11.60, wid: 2.44, h: 3.08, wheelbase: 6.93, overhangF: 1.22, track: 2.06, wheelR: 0.52,
  topSpeed: 25.5, accel: 1.75, brake: 6.2, grip: 0.64, steerMax: 0.36, mass: 10500,
  seatY: 2.30, seatZ: 1.10, seatX: 0.70, clearance: 0.36,
  hbGrip: 0.86, hbYaw: 0.94, revTop: 4.44, revEngage: 0.29,
  // Conventional: a body that stops at the cowl, then a windshield, then two
  // metres of hood with the engine under it.
  top: [[0, 2.60], [0.006, 2.95], [0.016, 3.03], [0.030, 3.05], [0.780, 3.05], [0.795, 3.02],
        [0.812, 2.72], [0.828, 2.36], [0.848, 1.96], [0.864, 1.90], [0.878, 1.60],
        [0.92, 1.575], [0.965, 1.55], [0.985, 1.50], [0.995, 1.40], [1, 1.28]],
  belt: [[0, 2.06], [0.03, 2.10], [0.06, 2.12], [0.775, 2.12], [0.80, 2.05], [0.83, 1.95], [1, 1.90]],
  plan: [[0, 1.14], [0.012, 1.20], [0.026, 1.22], [0.790, 1.22], [0.815, 1.19], [0.848, 1.10],
         [0.866, 1.02], [0.880, 0.96], [0.955, 0.95], [0.988, 0.93], [1, 0.88]],
  roofK: [[0, 0.94], [0.78, 0.94], [0.85, 0.99], [1, 1.0]],
  tuck: 0.015,
  glassSide: [0.06, 0.772],
  glassTop: [[0.812, 0.850, 1.95]],
  cladding: { rocker: 0.22, bumper: 0.34, tRear: 0.02, tFront: 0.98, color: SB_BLACK },
  electric: false,
  // A big naturally-aspirated diesel four ahead of you rather than a six behind
  // you: slower firing, more clatter through the firewall, no turbo hiss.
  sound: { cyl: 6, idle: 640, redline: 2600, limiter: 2650,
           decay: 3.6, uneven: 0.32, tilt: 0.12, harm: 244,
           exhQ: 0.66, exhG: 1.34, intF0: 400, intSpan: 720, intQ: 0.75, intG: 0.50,
           hissG: 0.26, raspG: 0.38, raspFrom: 1700, rasp: 0.62, raspK: 3.6,
           boomF: 88, boomQ: 3.6, boomDb: 11, tickF: 2400, tickG: 0.082,
           lumpy: 0.024, pop: 0.5, gain: 1.18, rattle: 0, rattleFrom: 0 },
  drive: { gears: [3.10, 1.81, 1.41, 1.00, 0.71], reverse: 4.49, final: 5.57, tyre: 1.030,
           idle: 640, redline: 2600, limiter: 2650,
           shiftUp: 2350, shiftUpLight: 1700, shiftDown: 950, launch: 1250, shiftTime: 0.50 },
  lamps: {
    head: [[0.62, 1.02, 0, 0.30, 0.20]],
    tail: [[0.98, 1.42, 0, 0.26, 0.34]],
    rev: [[0.98, 1.02, 0, 0.22, 0.16]],
  },
};

function schoolPaint(s) {
  const yellow = rgb(s.body), glass = rgb(GLASS), under = shade(0x1c1d20, 1);
  const roof = rgb(SB_ROOF), black = rgb(SB_BLACK);
  return (face, t, y) => {
    if (face === 'bottom') return [under, 0, 0];
    if (face === 'glassL' || face === 'glassR') {
      return [t >= s.glassSide[0] && t <= s.glassSide[1] ? glass : yellow, 0, 0];
    }
    if (face === 'top') {
      if (t >= 0.812 && t <= 0.852 && y > 1.95) return [glass, 0, 0];
      // The white cap covers the roof proper and stops at the header.
      if (t < 0.792 && y > 3.0) return [roof, 0, 0];
      return [yellow, 0, 0];
    }
    if (face === 'sideL' || face === 'sideR') return [yellow, 0, 0];
    return [y < 0.80 ? black : yellow, 0, 0];               // end caps: black bumper
  };
}

function buildSchoolBus(s, opts = {}) {
  const mb = new MeshBuilder();
  loft(mb, s, 72, (t) => specRing(s, t), schoolPaint(s));
  const z = (t) => tToZ(s, t);
  const zF = z(1), zR = z(0);
  const yellow = rgb(s.body), black = rgb(SB_BLACK), roof = rgb(SB_ROOF);
  const glass = shade(GLASS, 0.9);
  const both = (fn) => { fn(1); fn(-1); };
  const hw = 1.22;

  // ---- the sides -------------------------------------------------------
  // Rub rails: three black bands the full length, which is what stops a school
  // bus reading as a yellow van. The window pillars are yellow, not black.
  both((sx) => {
    for (const [y, h] of [[2.02, 0.09], [1.60, 0.11], [1.14, 0.09], [0.66, 0.09]]) {
      mb.box(sx * (hw + 0.010), y, -2.05, 0.022, h, 8.70, black);
    }
    for (let k = 0; k < 11; k++) {
      const zz = z(0.075 + k * 0.0645);
      tube(mb, [sx * (hw + 0.006), 2.11, zz], [sx * (hw * 0.94 + 0.006), 3.01, zz], 0.030, yellow, 4);
    }
    mb.box(sx * (hw * 0.955), 2.96, -2.10, 0.028, 0.16, 8.55, yellow);   // fascia over the glass
    letters(mb, 'ÉCOLIERS', { cx: sx * (hw + 0.026), cy: 1.82, cz: z(0.30), h: 0.16, color: black,
      face: sx > 0 ? '+x' : '-x', solid: true, off: 0 });
    // Arches and the rear duals.
    mb.cyl(sx * (hw - 0.03), s.wheelR + 0.05, -s.axleZ, s.wheelR + 0.10, 0.09, 14, black, 'x', true);
    mb.cyl(sx * 0.72, s.wheelR, -s.axleZ, s.wheelR, 0.28, 12, rgb(TIRE), 'x');
    // Front fenders: the wheels stand well outside the hood on a conventional.
    mb.cyl(sx * 0.96, s.wheelR + 0.06, s.axleZ, s.wheelR + 0.16, 0.10, 12, yellow, 'x', true);
  });

  // ---- the header, the warning lamps, the mirrors ----------------------
  const zh = z(0.800);
  mb.box(0, 2.88, zh + 0.06, 2.30, 0.36, 0.12, yellow);
  letters(mb, 'ÉCOLIERS', { cx: 0, cy: 2.86, cz: zh + 0.13, h: 0.17, color: black, face: '+z', solid: true, off: 0 });
  both((sx) => {
    mb.box(sx * 1.03, 2.90, zh + 0.14, 0.20, 0.22, 0.08, rgb(TAIL));            // red on the outside
    mb.box(sx * 0.78, 2.90, zh + 0.14, 0.18, 0.20, 0.08, rgb(AMBER));           // amber inboard
    mb.box(sx * 0.36, 3.06, z(0.40), 0.10, 0.06, 0.10, rgb(AMBER));             // roof clearance lamps
    mb.box(sx * 0.80, 3.06, z(0.79), 0.10, 0.06, 0.10, rgb(AMBER));
    // Flat mirrors on long arms, plus the convex one over the fender.
    if (!opts.noMirrors) {
      mb.box(sx * 1.16, 2.30, z(0.868), 0.05, 0.05, 0.42, black);
      mb.box(sx * 1.22, 2.06, z(0.885), 0.05, 0.56, 0.16, black);
      mb.box(sx * 0.92, 1.86, z(0.972), 0.05, 0.05, 0.24, black);
      mb.box(sx * 0.94, 1.70, z(0.982), 0.05, 0.22, 0.16, black);
    }
  });
  // Rear header: the same lamps and the same word, because it is the end that
  // the traffic behind you is reading.
  mb.box(0, 2.86, zR - 0.05, 2.20, 0.34, 0.10, yellow);
  letters(mb, 'ÉCOLIERS', { cx: 0, cy: 2.84, cz: zR - 0.11, h: 0.17, color: black, face: '-z', solid: true, off: 0 });
  both((sx) => {
    mb.box(sx * 0.99, 2.88, zR - 0.12, 0.20, 0.22, 0.08, rgb(TAIL));
    mb.box(sx * 0.76, 2.88, zR - 0.12, 0.18, 0.20, 0.08, rgb(AMBER));
    mb.box(sx * 0.98, 1.42, zR - 0.04, 0.26, 0.34, 0.06, rgb(TAIL));
    mb.box(sx * 0.98, 1.02, zR - 0.04, 0.22, 0.16, 0.06, rgb(LAMP));
  });
  mb.box(0, 2.36, zR - 0.03, 1.30, 0.72, 0.03, glass);
  mb.box(0, 0.62, zR - 0.05, 2.20, 0.22, 0.16, black);                          // rear bumper
  mb.box(0, 1.00, zR - 0.04, 0.42, 0.17, 0.03, rgb(PLATE));

  // ---- the snout -------------------------------------------------------
  // International 3800: a tall slatted grille with the headlamps outboard of
  // it, amber turn signals under those, and a black steel bumper below.
  const zg = zF;
  mb.box(0, 1.12, zg + 0.02, 1.06, 0.62, 0.06, shade(SB_BLACK, 1.4));
  for (let k = 0; k < 7; k++) {
    mb.box(0, 0.88 + k * 0.083, zg + 0.05, 1.00, 0.045, 0.03, shade(s.body, 0.86));
  }
  both((sx) => {
    mb.box(sx * 0.72, 1.06, zg + 0.03, 0.28, 0.19, 0.06, rgb(LAMP));
    mb.box(sx * 0.74, 0.80, zg + 0.03, 0.22, 0.12, 0.06, rgb(AMBER));
    mb.box(sx * 0.88, 1.34, z(0.958), 0.06, 0.10, 0.30, rgb(AMBER));            // hood-top markers
  });
  mb.box(0, 0.56, zF + 0.01, 2.16, 0.20, 0.14, black);                          // black front bumper
  letters(mb, '3800', { cx: 0.52, cy: 1.42, cz: z(0.905), h: 0.09, color: black, face: '+x', solid: true, off: 0.005 });
  // The crossing gate, folded back along the bumper where it lives when the
  // lights are off, and the stop arm folded flat against the driver's side.
  mb.box(0.70, 0.68, z(0.94), 0.06, 0.06, 1.30, black);
  mb.box(hw + 0.010, 1.72, z(0.60), 0.05, 0.62, 0.62, rgb(0xc42a24));
  letters(mb, 'ARRÊT', { cx: hw + 0.036, cy: 1.72, cz: z(0.60), h: 0.16, color: rgb(0xf4f2ee),
    face: '+x', solid: true, off: 0 });

  // ---- the entrance and the roof hatch ---------------------------------
  mb.box(-(hw + 0.014), 2.30, z(0.735), 0.024, 1.10, 0.86, glass);
  mb.box(-(hw + 0.020), 1.34, z(0.735), 0.024, 1.86, 0.92, black);
  mb.box(0, 3.08, z(0.44), 0.72, 0.06, 0.72, roof);
  mb.box(0, 3.07, z(0.16), 0.60, 0.05, 0.44, roof);
  return mb;
}

// ---------------------------------------------------------------- register

CITY.buildBody = buildCityBus;
CITY.buildWheel = buildBusWheel;
// Round sealed beams: one lamp box a side covers both of them, and the tail
// pair sits where the round red lenses are.
CITY.lamps = {
  head: [[0.84, 0.95, 5.155, 0.60, 0.24]],
  tail: [[0.92, 1.34, -6.955, 0.26, 0.26]],
  rev: [[0.55, 0.98, -6.955, 0.20, 0.16]],
};
SCHOOL.buildBody = buildSchoolBus;
SCHOOL.buildWheel = buildBusWheel;

export const CITY_BUS = register(CITY);
export const SCHOOL_BUS = register(SCHOOL);
// The lamp boxes are in mesh space, so they need the axle offsets the register
// above just worked out.
SCHOOL_BUS.lamps = {
  head: [[0.72, 1.06, tToZ(SCHOOL_BUS, 1) + 0.06, 0.28, 0.19]],
  tail: [[0.98, 1.42, tToZ(SCHOOL_BUS, 0) - 0.04, 0.26, 0.34]],
  rev: [[0.98, 1.02, tToZ(SCHOOL_BUS, 0) - 0.04, 0.22, 0.16]],
};

// Nobody sells you a school bus. It is July, the yard is the lot behind École
// de l'Aigle, and the key is over the sun visor the way it has been all summer.
unlock('schoolbus', { kind: 'free', who: 'La commission scolaire' });

export const BUS_LAMPS = { bus: CITY_BUS.lamps, schoolbus: SCHOOL_BUS.lamps };
export { lampMeshes };
