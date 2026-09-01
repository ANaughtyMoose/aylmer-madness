// The workshop the things that are not cars share: two buses and two bicycles.
//
// cars.js lofts a car out of four side/top profiles and hangs boxes off it,
// which is exactly right for a Civic and no use at all for a bicycle. What is
// needed here and nowhere else: tubes that run in any direction (a bike frame
// is fifteen of them), discs that face the way a sealed-beam headlamp does,
// ribbons for a swoosh painted down a bus flank, and a 5x7 dot font — because
// a transit bus with nothing on the destination sign is a white van.
//
// Specs registered here land in the same CARS table cars.js exports, so the
// menu, the garage, the save slots and the damage model pick them up without
// having to know they came from somewhere else. What they carry that a car
// does not:
//   buildBody(spec)    the mesh, instead of loft() + addDetails()
//   buildWheel(spec)   ...and its wheel
//   buildSteer(spec)   the parts that turn with the bars (bicycles only)
//   lamps              lamp boxes, because carLampBoxes() is keyed on car ids
//   twoWheel           one track, one plane, no mirrors, no doors
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { CARS, pl } from './cars.js';
import { UNLOCKS, FREE_CARS } from './garage.js';

export { rgb, shade };

// ---------------------------------------------------------------- the table

/**
 * Add a vehicle to CARS, or replace the body of one that is already in it
 * (the used-lot bus keeps its price, its diesel and its gearbox; everything
 * that decides what it LOOKS like is overwritten). Mirrors the derived fields
 * the loop at the foot of cars.js sets for its own table.
 */
export function register(spec) {
  const old = CARS.find((c) => c.id === spec.id);
  const s = old ? Object.assign(old, spec) : spec;
  s.axleZ = s.wheelbase / 2;
  // A car's track falls out of its plan profile; ours are hand-set, because a
  // bicycle has one track and a school bus's front axle is wider than its hood.
  if (s.track == null) {
    const rearOverhang = s.len - s.wheelbase - s.overhangF;
    const hw = Math.max(pl(s.plan, rearOverhang / s.len), pl(s.plan, (rearOverhang + s.wheelbase) / s.len));
    s.track = Math.round(2 * (hw + 0.07 - 0.10) * 100) / 100;
  }
  if (!old) CARS.push(s);
  return s;
}

/** How you come by it. Mirrors garage.js's UNLOCKS, which is already loaded. */
export function unlock(id, rule) {
  UNLOCKS[id] = rule;
  if (rule.kind === 'free' && !FREE_CARS.includes(id)) FREE_CARS.push(id);
}

// ---------------------------------------------------------------- geometry

const EPS = 1e-6;

/**
 * A tube between two points, in any direction. `sides` faces, no end caps
 * unless asked: a frame tube you can see the end of is a frame tube that is
 * broken. This is the primitive a bicycle is made of.
 */
export function tube(mb, a, b, r, c, sides = 6, caps = false) {
  let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < EPS) return;
  dx /= len; dy /= len; dz /= len;
  // Any axis that is not the tube's own gives a usable first perpendicular.
  const ax = Math.abs(dy) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let ux = dy * ax[2] - dz * ax[1], uy = dz * ax[0] - dx * ax[2], uz = dx * ax[1] - dy * ax[0];
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
  const P = [], N = [];
  for (let i = 0; i < sides; i++) {
    const th = (i / sides) * Math.PI * 2, co = Math.cos(th), si = Math.sin(th);
    const nx = ux * co + vx * si, ny = uy * co + vy * si, nz = uz * co + vz * si;
    N.push([nx, ny, nz]);
    P.push([[a[0] + nx * r, a[1] + ny * r, a[2] + nz * r],
            [b[0] + nx * r, b[1] + ny * r, b[2] + nz * r]]);
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const i0 = mb.vert(P[i][0][0], P[i][0][1], P[i][0][2], N[i][0], N[i][1], N[i][2], c);
    mb.vert(P[j][0][0], P[j][0][1], P[j][0][2], N[j][0], N[j][1], N[j][2], c);
    mb.vert(P[j][1][0], P[j][1][1], P[j][1][2], N[j][0], N[j][1], N[j][2], c);
    mb.vert(P[i][1][0], P[i][1][1], P[i][1][2], N[i][0], N[i][1], N[i][2], c);
    mb.tri(i0, i0 + 1, i0 + 2); mb.tri(i0, i0 + 2, i0 + 3);
  }
  if (!caps) return;
  for (const [pt, n, end] of [[a, [-dx, -dy, -dz], 0], [b, [dx, dy, dz], 1]]) {
    const c0 = mb.vert(pt[0], pt[1], pt[2], n[0], n[1], n[2], c);
    for (let i = 0; i < sides; i++) {
      const p = P[i][end];
      mb.vert(p[0], p[1], p[2], n[0], n[1], n[2], c);
    }
    for (let i = 0; i < sides; i++) {
      const p = c0 + 1 + i, q = c0 + 1 + ((i + 1) % sides);
      if (end) mb.tri(c0, p, q); else mb.tri(c0, q, p);
    }
  }
}

/** A flat disc facing ±Z: a sealed-beam lens, a chainring, a lamp bezel. */
export function discZ(mb, cx, cy, cz, r, c, dir = 1, segs = 12) {
  const nz = dir >= 0 ? 1 : -1;
  const c0 = mb.vert(cx, cy, cz, 0, 0, nz, c);
  for (let i = 0; i < segs; i++) {
    const th = (i / segs) * Math.PI * 2;
    mb.vert(cx + Math.cos(th) * r, cy + Math.sin(th) * r, cz, 0, 0, nz, c);
  }
  for (let i = 0; i < segs; i++) {
    const a = c0 + 1 + i, b = c0 + 1 + ((i + 1) % segs);
    if (nz > 0) mb.tri(c0, a, b); else mb.tri(c0, b, a);
  }
}

/** An annulus facing ±Z: the chrome ring round a headlamp, a rim bead. */
export function ringZ(mb, cx, cy, cz, r0, r1, c, dir = 1, segs = 12) {
  const nz = dir >= 0 ? 1 : -1;
  const base = mb.vertCount;
  for (let i = 0; i < segs; i++) {
    const th = (i / segs) * Math.PI * 2, co = Math.cos(th), si = Math.sin(th);
    mb.vert(cx + co * r0, cy + si * r0, cz, 0, 0, nz, c);
    mb.vert(cx + co * r1, cy + si * r1, cz, 0, 0, nz, c);
  }
  for (let i = 0; i < segs; i++) {
    const a = base + i * 2, b = base + ((i + 1) % segs) * 2;
    if (nz > 0) { mb.tri(a, a + 1, b + 1); mb.tri(a, b + 1, b); }
    else { mb.tri(a, b + 1, a + 1); mb.tri(a, b, b + 1); }
  }
}

/** The same disc, facing ±X: a chainring, a sprocket, a wheel face. */
export function discX(mb, cx, cy, cz, r, c, dir = 1, segs = 12) {
  const nx = dir >= 0 ? 1 : -1;
  const c0 = mb.vert(cx, cy, cz, nx, 0, 0, c);
  for (let i = 0; i < segs; i++) {
    const th = (i / segs) * Math.PI * 2;
    mb.vert(cx, cy + Math.cos(th) * r, cz + Math.sin(th) * r, nx, 0, 0, c);
  }
  for (let i = 0; i < segs; i++) {
    const a = c0 + 1 + i, b = c0 + 1 + ((i + 1) % segs);
    if (nx > 0) mb.tri(c0, a, b); else mb.tri(c0, b, a);
  }
}

/** An annulus facing ±X: a whitewall, a rim well, a brake disc. */
export function ringX(mb, cx, cy, cz, r0, r1, c, dir = 1, segs = 14) {
  const nx = dir >= 0 ? 1 : -1;
  const base = mb.vertCount;
  for (let i = 0; i < segs; i++) {
    const th = (i / segs) * Math.PI * 2, co = Math.cos(th), si = Math.sin(th);
    mb.vert(cx, cy + co * r0, cz + si * r0, nx, 0, 0, c);
    mb.vert(cx, cy + co * r1, cz + si * r1, nx, 0, 0, c);
  }
  for (let i = 0; i < segs; i++) {
    const a = base + i * 2, b = base + ((i + 1) % segs) * 2;
    if (nx > 0) { mb.tri(a, a + 1, b + 1); mb.tri(a, b + 1, b); }
    else { mb.tri(a, b + 1, a + 1); mb.tri(a, b, b + 1); }
  }
}

/**
 * A ribbon of quads down a flat side, both faces. `pts` are [y, z] on the
 * x = ±hw plane and `w` is the ribbon's width measured across the centreline.
 * This is how a swoosh gets painted on a bus without a texture.
 */
export function stripe(mb, x, nx, pts, w, c) {
  const hw = w / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [y0, z0] = pts[i], [y1, z1] = pts[i + 1];
    let dy = y1 - y0, dz = z1 - z0;
    const l = Math.hypot(dy, dz) || 1;
    dy /= l; dz /= l;
    const py = -dz * hw, pz = dy * hw;               // perpendicular, in the plane
    const P = (y, z) => [x, y, z];
    if (nx > 0) mb.quad(P(y0 + py, z0 + pz), P(y0 - py, z0 - pz), P(y1 - py, z1 - pz), P(y1 + py, z1 + pz), c, [1, 0, 0]);
    else mb.quad(P(y0 - py, z0 - pz), P(y0 + py, z0 + pz), P(y1 + py, z1 + pz), P(y1 - py, z1 - pz), c, [-1, 0, 0]);
  }
}

// ---------------------------------------------------------------- lettering

// 5x7, MSB left. Only what the four vehicles actually say: route names, fleet
// numbers, ÉCOLIERS and ARRÊT. Accents are one row above the cap height, which
// at dot-matrix resolution is all an accent ever is.
const G = (...rows) => rows;
export const FONT = {
  ' ': G('.....', '.....', '.....', '.....', '.....', '.....', '.....'),
  '0': G('.XXX.', 'X...X', 'X..XX', 'X.X.X', 'XX..X', 'X...X', '.XXX.'),
  '1': G('..X..', '.XX..', '..X..', '..X..', '..X..', '..X..', '.XXX.'),
  '2': G('.XXX.', 'X...X', '....X', '...X.', '..X..', '.X...', 'XXXXX'),
  '3': G('XXXXX', '...X.', '..X..', '...X.', '....X', 'X...X', '.XXX.'),
  '4': G('...X.', '..XX.', '.X.X.', 'X..X.', 'XXXXX', '...X.', '...X.'),
  '5': G('XXXXX', 'X....', 'XXXX.', '....X', '....X', 'X...X', '.XXX.'),
  '6': G('..XX.', '.X...', 'X....', 'XXXX.', 'X...X', 'X...X', '.XXX.'),
  '7': G('XXXXX', '....X', '...X.', '..X..', '.X...', '.X...', '.X...'),
  '8': G('.XXX.', 'X...X', 'X...X', '.XXX.', 'X...X', 'X...X', '.XXX.'),
  '9': G('.XXX.', 'X...X', 'X...X', '.XXXX', '....X', '...X.', '.XX..'),
  A: G('.XXX.', 'X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X'),
  B: G('XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'),
  C: G('.XXX.', 'X...X', 'X....', 'X....', 'X....', 'X...X', '.XXX.'),
  D: G('XXX..', 'X..X.', 'X...X', 'X...X', 'X...X', 'X..X.', 'XXX..'),
  E: G('XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'),
  F: G('XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'X....'),
  G: G('.XXX.', 'X...X', 'X....', 'X.XXX', 'X...X', 'X...X', '.XXXX'),
  H: G('X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'),
  I: G('XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'),
  J: G('..XXX', '...X.', '...X.', '...X.', 'X..X.', 'X..X.', '.XX..'),
  K: G('X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'),
  L: G('X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'),
  M: G('X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'),
  N: G('X...X', 'X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X'),
  O: G('.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'),
  P: G('XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'),
  Q: G('.XXX.', 'X...X', 'X...X', 'X...X', 'X.X.X', 'X..X.', '.XX.X'),
  R: G('XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'),
  S: G('.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'),
  T: G('XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'),
  U: G('X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'),
  V: G('X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.X.X.', '..X..'),
  W: G('X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX', 'X...X'),
  X: G('X...X', 'X...X', '.X.X.', '..X..', '.X.X.', 'X...X', 'X...X'),
  Y: G('X...X', 'X...X', '.X.X.', '..X..', '..X..', '..X..', '..X..'),
  Z: G('XXXXX', '....X', '...X.', '..X..', '.X...', 'X....', 'XXXXX'),
  '-': G('.....', '.....', '.....', 'XXXXX', '.....', '.....', '.....'),
  '.': G('.....', '.....', '.....', '.....', '.....', '.XX..', '.XX..'),
};
// « É » and « Ê »: the base letter plus one row of accent above it.
const ACCENT = { 'É': ['E', '...X.'], 'Ê': ['E', '..X..'], 'È': ['E', '.X...'] };

// Which way is "right" for a reader standing in front of a face pointing this
// way: forward × up, where forward is INTO the face. Get it backwards and every
// word on the bus comes out mirrored, which is exactly what happened first.
const FACES = {
  '+z': { n: [0, 0, 1], r: [1, 0, 0] },
  '-z': { n: [0, 0, -1], r: [-1, 0, 0] },
  '+x': { n: [1, 0, 0], r: [0, 0, -1] },
  '-x': { n: [-1, 0, 0], r: [0, 0, 1] },
};

/**
 * Lettering on a flat face, centred on (cx, cy, cz). `h` is the cap height, so
 * the dot pitch is h/7. `solid: true` merges each row's runs into bars — that
 * is painted lettering (a fleet number, ÉCOLIERS); `solid: false` leaves the
 * dots separate, which is a destination sign and reads as one from a block away.
 * Returns the width the string took.
 */
export function letters(mb, text, o) {
  const f = FACES[o.face || '+z'];
  const h = o.h, p = h / 7, adv = p * 6;
  const chars = [...String(text).toUpperCase()];
  const total = chars.length * adv - p;
  const dot = (o.solid ? 1.02 : 0.80) * p;
  const off = o.off != null ? o.off : 0.012;
  const [nx, ny, nz] = f.n, [rx, ry, rz] = f.r;
  const bx = o.cx + nx * off - rx * (total / 2), by = o.cy + ny * off - ry * (total / 2),
        bz = o.cz + nz * off - rz * (total / 2);
  // (u along the reading direction, v up) -> world
  const P = (u, v) => [bx + rx * u, by + ry * u + v, bz + rz * u];
  // (r, up, n) is right-handed on all four faces, so one winding does for all.
  const cell = (u, v, w, hh, col) => {
    mb.quad(P(u, v), P(u + w, v), P(u + w, v + hh), P(u, v + hh), col, f.n);
  };
  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i];
    let acc = null;
    if (ACCENT[ch]) { acc = ACCENT[ch][1]; ch = ACCENT[ch][0]; }
    const g = FONT[ch] || FONT[' '];
    const x0 = i * adv;
    const rows = acc ? [acc, ...g] : g;
    const top = acc ? h + p : h;
    for (let ry2 = 0; ry2 < rows.length; ry2++) {
      const row = rows[ry2], y0 = top - (ry2 + 1) * p;
      let run = -1;
      for (let cx2 = 0; cx2 <= 5; cx2++) {
        const on = cx2 < 5 && row[cx2] === 'X';
        if (o.solid) {
          if (on && run < 0) run = cx2;
          if (!on && run >= 0) { cell(x0 + run * p, y0, (cx2 - run) * p * 1.02, dot, o.color); run = -1; }
        } else if (on) {
          cell(x0 + cx2 * p + (p - dot) / 2, y0 + (p - dot) / 2, dot, dot, o.color);
        }
      }
    }
  }
  return total;
}

// ---------------------------------------------------------------- lamps

/**
 * The same six little meshes buildCarLamps() makes, from a box list we own
 * rather than from carLampBoxes(), which is keyed on the car ids in cars.js
 * and would put a Sunfire's tail lamps on a bicycle. Boxes are
 * [ |x|, y, z, w, h ], mirrored on ±X.
 */
export function lampMeshes(L) {
  const white = rgb(0xffffff);
  const lens = (list, dir, side) => {
    const mb = new MeshBuilder();
    for (const [ax, y, zz, w, h] of list || []) {
      for (const sx of (side === 0 ? [1, -1] : [side])) {
        mb.box(sx * ax, y, zz + dir * 0.030, w * 0.92, h * 0.78, 0.05, white);
      }
    }
    return mb;
  };
  const glow = (list, dir, side, sw, sh) => {
    const mb = new MeshBuilder();
    const n = [0, 0, dir];
    for (const [ax, y, zz, w, h] of list || []) {
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
    headL: lens(L.head, 1, 1), headR: lens(L.head, 1, -1),
    tail: lens(L.tail, -1, 0), rev: lens(L.rev, -1, 0),
    glowHeadL: glow(L.head, 1, 1, 2.6, 3.4), glowHeadR: glow(L.head, 1, -1, 2.6, 3.4),
    glowTail: glow(L.tail, -1, 0, 2.0, 2.0),
  };
}
