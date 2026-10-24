// The Marina d'Aylmer, summer 2004: riprap breakwaters, the quay wall's coping
// and bollards, five finger docks off the east quay and a guest dock on the
// south arm, full of small sailboats and runabouts. Built from the aerial
// (references/story/intro/marina_aerial_reference.png) onto the basin outline
// OSM gives us; the heights come from terrain.js `marinaPads` (the breakwaters
// and quays are `abs` pads, 1.35-1.5 m over the water) and world.js
// `shapeRiver` (the basin is cut to -1.8 under the water quad).
//
// Everything is baked into the ordinary world chunks. Boats carry a UV tag,
// u = 5000 + phase, which the lit prototype's vertex shader (nature.js
// NATURE_WIND) reads to bob and roll them on the swell; the classic renderer
// ignores UVs on untextured chunks and draws them still.
import { mulberry32 } from '../core/math.js';
import { MeshBuilder } from '../core/mesh.js';

// A quad wound so its front face is the side `n` points to, whatever order the
// corners came in (the prototype culls back faces).
function Q(bd, p0, p1, p2, p3, c, n) {
  const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
  const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) bd.quad(p3, p2, p1, p0, c, n);
  else bd.quad(p0, p1, p2, p3, c, n);
}

export const BOAT_U = 5000;
// Rocks carry u = 5100 in the prototype so the ground shader (nature.js
// GROUND) does not paint path grain on their tops.
export const ROCK_U = 5100;
const WATER_Y = 0.02;

// A rough rock: two jittered pentagon rings (a wide base, a smaller top turned
// a fifth) and a low cap, faceted with its own normal per face. 15 triangles.
function rock(bd, x, y, z, s, col, r, tag = false) {
  const tu = tag ? ROCK_U : 0, tv = tag ? 0.5 : 0;
  const sx = s * (0.8 + r() * 0.5), sy = s * (0.4 + r() * 0.3), sz = s * (0.8 + r() * 0.5);
  const yaw = r() * Math.PI, c = Math.cos(yaw), si = Math.sin(yaw);
  const P = (lx, ly, lz) => [x + lx * sx * c - lz * sz * si, y + ly * sy, z + lx * sx * si + lz * sz * c];
  const N = 5, lo = [], hi = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2, j = 0.8 + r() * 0.4;
    lo.push(P(Math.cos(a) * j, -0.2, Math.sin(a) * j));
    const b = a + Math.PI / N, jj = (0.5 + r() * 0.25);
    hi.push(P(Math.cos(b) * jj, 0.75 + r() * 0.3, Math.sin(b) * jj));
  }
  const cap = P((r() - 0.5) * 0.2, 1.0 + r() * 0.15, (r() - 0.5) * 0.2);
  const face = (a, b, d, k) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const kk = k * (0.8 + 0.25 * Math.max(0, ny));
    const cc = [col[0] * kk, col[1] * kk, col[2] * kk];
    const i = bd.vert(a[0], a[1], a[2], nx, ny, nz, cc, tu, tv);
    bd.vert(b[0], b[1], b[2], nx, ny, nz, cc, tu, tv);
    bd.vert(d[0], d[1], d[2], nx, ny, nz, cc, tu, tv);
    bd.tri(i, i + 1, i + 2);
  };
  // ring order runs +x -> +z, which seen from above is clockwise in this
  // frame's handedness; each face below is wound outward
  for (let k = 0; k < N; k++) {
    const k1 = (k + 1) % N;
    face(lo[k], hi[k], lo[k1], 0.9 + r() * 0.2);
    face(lo[k1], hi[k], hi[k1], 0.85 + r() * 0.2);
    face(hi[k], cap, hi[k1], 1.0);
  }
}

// A small hull: a flat-sheered deck outline with a pointed bow, sides that
// tuck in to a narrow bottom, a transom. Local frame: +w forward, +u left.
function hull(mb, L, W, free, draft, col, deckCol, stripe) {
  const half = W / 2;
  const deck = [[-L / 2, half * 0.86], [L * 0.1, half], [L * 0.36, half * 0.72], [L / 2, 0],
    [L * 0.36, -half * 0.72], [L * 0.1, -half], [-L / 2, -half * 0.86]];
  const bot = deck.map(([w, u]) => [w * 0.92 - (w > L * 0.3 ? L * 0.05 : 0), u * 0.42]);
  const yT = free, yB = -draft;
  const n = deck.length;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    const a = deck[k], b = deck[j], c = bot[j], d = bot[k];
    // outward normal in the (w,u) plane
    let nw = b[1] - a[1], nu = -(b[0] - a[0]);
    const l = Math.hypot(nw, nu) || 1; nw /= l; nu /= l;
    const sideCol = k === n - 1 ? col : col;
    Q(mb, [a[0], yT, a[1]], [d[0], yB, d[1]], [c[0], yB, c[1]], [b[0], yT, b[1]], sideCol, [nw, 0.25, nu]);
    if (stripe) {
      const s0 = yT - 0.16, s1 = yT - 0.3;
      const o = 0.012;
      const lerpP = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      const ta = (yT - s0) / (yT - yB), tb = (yT - s1) / (yT - yB);
      const a0 = lerpP(a, d, ta), a1 = lerpP(a, d, tb), b0 = lerpP(b, c, ta), b1 = lerpP(b, c, tb);
      Q(mb, [a0[0] + nw * o, s0, a0[1] + nu * o], [a1[0] + nw * o, s1, a1[1] + nu * o],
        [b1[0] + nw * o, s1, b1[1] + nu * o], [b0[0] + nw * o, s0, b0[1] + nu * o], stripe, [nw, 0, nu]);
    }
  }
  // deck: a fan from the middle
  const c0 = mb.vert(0, yT, 0, 0, 1, 0, deckCol);
  for (const [w, u] of deck) mb.vert(w, yT, u, 0, 1, 0, deckCol);
  for (let k = 0; k < n; k++) mb.tri(c0, c0 + 1 + k, c0 + 1 + ((k + 1) % n));
}

function sailboat(r) {
  const mb = new MeshBuilder();
  const L = 7 + r() * 3, W = L * 0.33;
  const white = [0.93, 0.93, 0.9].map((v) => v - r() * 0.05);
  const pick = r();
  const hullCol = pick < 0.72 ? white : pick < 0.86 ? [0.12, 0.2, 0.36] : [0.55, 0.12, 0.1];
  const stripe = hullCol === white && r() < 0.6 ? (r() < 0.5 ? [0.12, 0.22, 0.42] : [0.6, 0.14, 0.12]) : null;
  hull(mb, L, W, 0.62, 0.35, hullCol, [0.82, 0.8, 0.74], stripe);
  // coachroof
  mb.box(-L * 0.05, 0.62 + 0.22, 0, L * 0.34, 0.44, W * 0.52, [0.9, 0.9, 0.86]);
  mb.box(-L * 0.05, 0.62 + 0.3, W * 0.265, L * 0.22, 0.1, 0.02, [0.12, 0.16, 0.2]);
  mb.box(-L * 0.05, 0.62 + 0.3, -W * 0.265, L * 0.22, 0.1, 0.02, [0.12, 0.16, 0.2]);
  // mast, boom with the furled main under its blue cover
  const mh = L * 1.25 + r();
  mb.box(L * 0.1, 0.62 + mh / 2, 0, 0.12, mh, 0.14, [0.78, 0.78, 0.76]);
  mb.box(-L * 0.12, 1.55, 0, L * 0.46, 0.2, 0.22, r() < 0.7 ? [0.12, 0.26, 0.5] : [0.8, 0.78, 0.72]);
  // forestay and backstay as hair-thin slivers (they catch the light at dusk)
  const stay = [0.5, 0.52, 0.54];
  Q(mb, [L * 0.1, 0.62 + mh, 0.02], [L * 0.47, 0.7, 0.02], [L * 0.47, 0.7, -0.02], [L * 0.1, 0.62 + mh, -0.02], stay, [0, 0, 1]);
  Q(mb, [L * 0.1, 0.62 + mh, -0.02], [-L * 0.48, 0.7, -0.02], [-L * 0.48, 0.7, 0.02], [L * 0.1, 0.62 + mh, 0.02], stay, [0, 0, 1]);
  return { mb, L, W };
}

function motorboat(r) {
  const mb = new MeshBuilder();
  const L = 5 + r() * 2.5, W = L * 0.38;
  const pick = r();
  const hullCol = pick < 0.6 ? [0.93, 0.92, 0.88] : pick < 0.8 ? [0.2, 0.3, 0.5] : [0.62, 0.62, 0.6];
  hull(mb, L, W, 0.72, 0.28, hullCol, [0.78, 0.74, 0.66], r() < 0.5 ? [0.72, 0.16, 0.12] : null);
  // console and windscreen, a bimini or a cuddy
  if (r() < 0.5) {
    mb.box(L * 0.12, 0.72 + 0.3, 0, L * 0.3, 0.6, W * 0.7, [0.9, 0.9, 0.87]);
    mb.box(L * 0.0, 0.72 + 0.72, 0, 0.06, 0.34, W * 0.66, [0.22, 0.3, 0.36]);
  } else {
    mb.box(-L * 0.02, 0.72 + 0.35, W * 0.2, 0.9, 0.7, 0.8, [0.88, 0.88, 0.85]);
    mb.box(0.3, 0.72 + 0.84, W * 0.2, 0.05, 0.3, 0.8, [0.22, 0.3, 0.36]);
    if (r() < 0.6) mb.box(-L * 0.12, 0.72 + 1.45, 0, L * 0.34, 0.06, W * 0.86, [0.15, 0.25, 0.45]);
  }
  mb.box(-L / 2 - 0.25, 0.55, 0, 0.45, 0.8, 0.5, [0.15, 0.15, 0.16]);   // outboard
  return { mb, L, W };
}

// Append `m` to `bd`, turned by yaw, at (x, y, z), with every vertex tagged.
function place(bd, m, x, y, z, yaw, phase, tag) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const V = m.v, stride = 9;
  const base = bd.vertCount;
  for (let i = 0; i < V.length; i += stride) {
    const lw = V[i], ly = V[i + 1], lu = V[i + 2];
    const nw = V[i + 3], ny = V[i + 4], nu = V[i + 5];
    // local w runs along (sin yaw, cos yaw), local u along (cos yaw, -sin yaw)
    // (w, u) -> (sin, cos) and (-cos, sin): a rotation, not a mirror, so the
    // winding survives the move
    const wx = x + lw * s - lu * c, wz = z + lw * c + lu * s;
    const nx = nw * s - nu * c, nz = nw * c + nu * s;
    const l = Math.hypot(nx, ny, nz) || 1;
    bd.vert(wx, y + ly, wz, nx / l, ny / l, nz / l, [V[i + 6], V[i + 7], V[i + 8]],
      tag ? BOAT_U + phase : 0, tag ? 0.5 : 0);
  }
  for (const k of m.i) bd.i.push(base + k);
}

/**
 * @param ctx { bAt, groundAt, waterAt, features, proto }
 * @returns counts for world.stats
 */
export function buildMarinaScene(ctx) {
  const { bAt, groundAt, features, proto } = ctx;
  const r = mulberry32(0x3a71a);
  const F = (id) => features.find((f) => f.id === id);
  const stats = { rocks: 0, boats: 0, docks: 0 };

  // ---------------------------------------------------------- riprap
  const ROCK = [[0.4, 0.39, 0.37], [0.47, 0.44, 0.4], [0.35, 0.34, 0.33], [0.46, 0.41, 0.35], [0.52, 0.5, 0.47]];
  for (const id of ['breakwaterW', 'breakwaterTip', 'breakwaterS']) {
    const f = F(id);
    if (!f) continue;
    const s = Math.sin(f.yaw), c = Math.cos(f.yaw);
    const P = (u, w) => [f.cx + u * c + w * s, f.cz - u * s + w * c];
    const wLo = -f.hl - (f.runs[2] || 0) * 0.6, wHi = f.hl + (f.runs[3] || 0) * 0.8;
    const step = 1.25;
    for (let w = wLo; w <= wHi; w += step) {
      for (const side of [-1, 1]) {
        const run = side < 0 ? f.runs[0] : f.runs[1];
        // across the slope, from the path edge out past the waterline
        for (let a = f.hw + 0.35; a < f.hw + run + 1.2; a += 1.05 + r() * 0.5) {
          const [x, z] = P(side * (a + r() * 0.4), w + (r() - 0.5) * 1.1);
          const g = groundAt(x, z).h;
          if (g < -1.2) continue;
          const sz = 0.75 + r() * 0.85 + (a > f.hw + 1 ? 0.3 : 0);
          const col = ROCK[(r() * ROCK.length) | 0];
          const k = 0.88 + r() * 0.22;
          rock(bAt(x, z), x, Math.max(g, -0.6) - 0.1, z, sz, [col[0] * k, col[1] * k, col[2] * k], r, proto);
          stats.rocks++;
        }
      }
    }
    // the end of each arm is a heap
    const [ex, ez] = P(0, f.hl + (f.runs[3] || 0) * 0.5);
    if (id !== 'breakwaterW') {
      for (let k = 0; k < 14; k++) {
        const x = ex + (r() - 0.5) * 7, z = ez + (r() - 0.5) * 7;
        rock(bAt(x, z), x, Math.max(groundAt(x, z).h, -0.5) - 0.1, z, 0.9 + r() * 0.9, ROCK[(r() * 5) | 0], r, proto);
        stats.rocks++;
      }
    }
  }

  // ---------------------------------------------------------- quay coping + bollards
  const COPING = [0.72, 0.7, 0.66], BOLLARD = [0.2, 0.21, 0.22], PLANK = [0.52, 0.45, 0.37];
  const quays = ['quayE1', 'quayE2', 'quayN'].map(F).filter(Boolean);
  for (const f of quays) {
    const s = Math.sin(f.yaw), c = Math.cos(f.yaw);
    const P = (u, w) => [f.cx + u * c + w * s, f.cz - u * s + w * c];
    const L = f.hl * 2;
    const n = Math.ceil(L / 4);
    for (let i = 0; i < n; i++) {
      const w0 = -f.hl + (L * i) / n, w1 = -f.hl + (L * (i + 1)) / n;
      const [ax, az] = P(-f.hw, w0), [bx, bz] = P(-f.hw, w1);
      const [cx2, cz2] = P(-f.hw + 0.45, w1), [dx, dz] = P(-f.hw + 0.45, w0);
      const bd = bAt((ax + bx) / 2, (az + bz) / 2);
      const y = f.H + 0.07;
      Q(bd, [ax, y, az], [dx, y, dz], [cx2, y, cz2], [bx, y, bz], COPING, [0, 1, 0]);
      Q(bd, [ax - c * 0.03, y, az + s * 0.03], [bx - c * 0.03, y, bz + s * 0.03],
        [bx - c * 0.03, f.H - 0.25, bz + s * 0.03], [ax - c * 0.03, f.H - 0.25, az + s * 0.03], COPING, [-c, 0, s]);
      // a black fender line of old tyres' worth of rubber where the boats rub
      Q(bd, [ax - c * 0.05, 0.75, az + s * 0.05], [bx - c * 0.05, 0.75, bz + s * 0.05],
        [bx - c * 0.05, 0.45, bz + s * 0.05], [ax - c * 0.05, 0.45, az + s * 0.05], [0.13, 0.13, 0.14], [-c, 0, s]);
      if (i % 2 === 0) {
        const [px, pz] = P(-f.hw + 0.35, (w0 + w1) / 2);
        bd.cyl(px, f.H + 0.3, pz, 0.14, 0.45, 6, BOLLARD, 'y', true);
      }
    }
  }

  // ---------------------------------------------------------- finger docks
  // Off the east quay, square to it, like the aerial: five long fingers with
  // boats stern-in on both sides, a gangway down from the coping to a float
  // 0.9 m under the promenade.
  const DECK_Y = 0.42;
  const dockAt = (bd, ax, az, bx, bz, wid) => {
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
    const ux = dz * wid / 2, uz = -dx * wid / 2;
    bd.tower((ax + bx) / 2, DECK_Y - 0.28, (az + bz) / 2, wid, L, 0.28, PLANK,
      { yaw: Math.atan2(dx, dz), noBottom: true });
    // float pontoons, dark, just above the water
    Q(bd, [ax + ux * 0.9, 0.14, az + uz * 0.9], [bx + ux * 0.9, 0.14, bz + uz * 0.9],
      [bx + ux * 0.9, DECK_Y - 0.28, bz + uz * 0.9], [ax + ux * 0.9, DECK_Y - 0.28, az + uz * 0.9], [0.3, 0.3, 0.3], [dz, 0, -dx]);
    for (let t = 3; t < L; t += 9) {
      for (const sd of [-1, 1]) {
        const px = ax + dx * t + ux * sd * 1.05, pz = az + dz * t + uz * sd * 1.05;
        bd.cyl(px, 0.4, pz, 0.14, 2.4, 6, [0.4, 0.34, 0.27], 'y', false);
      }
    }
  };
  const boatLine = (ax, az, dx, dz, len, side, sp) => {
    // boats moored square to a dock, bows out, on `side` (+1 left of a->b)
    const ux = dz * side, uz = -dx * side;
    for (let t = 2.5; t < len - 1.5; t += sp + r() * 0.6) {
      if (r() < 0.12) continue;                        // an empty slip
      const sail = r() < 0.58;
      const b = sail ? sailboat(r) : motorboat(r);
      const off = 1.3 + b.L / 2 + 0.4;
      const x = ax + dx * t + ux * off, z = az + dz * t + uz * off;
      const yaw = Math.atan2(ux, uz) + (r() - 0.5) * 0.06;
      place(bAt(x, z), b.mb, x, WATER_Y, z, yaw, r() * 6.28, proto);
      stats.boats++;
      // a finger slip between every other pair
      if (r() < 0.5) {
        const fx = ax + dx * (t + sp / 2), fz = az + dz * (t + sp / 2);
        const bd = bAt(fx, fz);
        bd.tower(fx + ux * 3.8, DECK_Y - 0.3, fz + uz * 3.8, 0.7, 5.4, 0.26, PLANK,
          { yaw: Math.atan2(ux, uz), noBottom: true });
      }
    }
  };
  const E1 = F('quayE1'), E2 = F('quayE2');
  if (E1 && E2) {
    // the combined east quay face, as a polyline
    const face = (f) => {
      const s = Math.sin(f.yaw), c = Math.cos(f.yaw);
      return [[f.cx - f.hw * c - f.hl * s, f.cz + f.hw * s - f.hl * c], [f.cx - f.hw * c + f.hl * s, f.cz + f.hw * s + f.hl * c], -c, s];
    };
    const q = [face(E1), face(E2)];
    const total = [0, 0];
    for (let k = 0; k < 2; k++) total[k] = Math.hypot(q[k][1][0] - q[k][0][0], q[k][1][1] - q[k][0][1]);
    for (const tAlong of [22, 54, 88, 121, 152]) {
      const k = tAlong < total[0] ? 0 : 1;
      const t = k === 0 ? tAlong : tAlong - total[0];
      const [[ax, az], [bx, bz], ox, oz] = q[k];
      const L = total[k], dx = (bx - ax) / L, dz = (bz - az) / L;
      const x0 = ax + dx * t, z0 = az + dz * t;
      // out into the basin until 9 m short of the breakwater's slope
      let len = 0;
      while (len < 62) {
        const x = x0 + ox * (len + 9), z = z0 + oz * (len + 9);
        if (groundAt(x, z).h > -1.2) break;
        len += 1;
      }
      len = Math.max(18, Math.min(58, len));
      const x1 = x0 + ox * len, z1 = z0 + oz * len;
      const bd = bAt((x0 + x1) / 2, (z0 + z1) / 2);
      dockAt(bd, x0 + ox * 4.5, z0 + oz * 4.5, x1, z1, 2.2);
      // gangway: a sloping plank from the coping down onto the float
      const g0 = [x0 - dz * 0.6, z0 + dx * 0.6], g1 = [x0 + dz * 0.6, z0 - dx * 0.6];
      const gx = ox * 4.6, gz = oz * 4.6;
      Q(bd, [g0[0], 1.4, g0[1]], [g1[0], 1.4, g1[1]], [g1[0] + gx, DECK_Y, g1[1] + gz], [g0[0] + gx, DECK_Y, g0[1] + gz], [0.6, 0.6, 0.58], [0, 1, 0]);
      for (const sd of [-1, 1]) {
        Q(bd, [x0 + dz * 0.6 * sd, 2.3, z0 - dx * 0.6 * sd], [x0 + dz * 0.6 * sd, 2.25, z0 - dx * 0.6 * sd],
          [x0 + dz * 0.6 * sd + gx, 1.3, z0 - dx * 0.6 * sd + gz], [x0 + dz * 0.6 * sd + gx, 1.35, z0 - dx * 0.6 * sd + gz], [0.7, 0.7, 0.72], [dz * sd, 0, -dx * sd]);
      }
      // boats along both sides; the tee end gets one moored alongside
      const bl = len - 4.5;
      boatLine(x0 + ox * 4.5, z0 + oz * 4.5, ox, oz, bl, 1, 3.5);
      boatLine(x0 + ox * 4.5, z0 + oz * 4.5, ox, oz, bl, -1, 3.5);
      stats.docks++;
    }
  }
  // the guest dock along the inside of the south arm, and a line of dinghies
  // and runabouts on the north quay
  const S = F('breakwaterS');
  if (S) {
    const s = Math.sin(S.yaw), c = Math.cos(S.yaw);
    const P = (u, w) => [S.cx + u * c + w * s, S.cz - u * s + w * c];
    // the basin is on the driver's right of this arm (u < 0 is north)
    const [ax, az] = P(-(S.hw + S.runs[0] + 2.2), -S.hl + 10), [bx, bz] = P(-(S.hw + S.runs[0] + 2.2), S.hl - 14);
    dockAt(bAt((ax + bx) / 2, (az + bz) / 2), ax, az, bx, bz, 2.0);
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
    for (let t = 4; t < L - 4; t += 9 + r() * 3) {
      if (r() < 0.25) continue;
      const b = r() < 0.5 ? sailboat(r) : motorboat(r);
      // alongside, on the basin side
      const x = ax + dx * t + dz * -(1 + b.W / 2 + 0.3), z = az + dz * t - dx * -(1 + b.W / 2 + 0.3);
      place(bAt(x, z), b.mb, x, WATER_Y, z, Math.atan2(dx, dz) + (r() < 0.5 ? Math.PI : 0), r() * 6.28, proto);
      stats.boats++;
    }
    stats.docks++;
  }
  const N = F('quayN');
  if (N) {
    const s = Math.sin(N.yaw), c = Math.cos(N.yaw);
    const P = (u, w) => [N.cx + u * c + w * s, N.cz - u * s + w * c];
    for (let w = -N.hl + 3; w < N.hl - 2; w += 3.2) {
      if (r() < 0.3) continue;
      const b = motorboat(r);
      const [x, z] = P(-N.hw - b.L / 2 - 0.5, w);
      place(bAt(x, z), b.mb, x, WATER_Y, z, N.yaw - Math.PI / 2 + (r() - 0.5) * 0.1, r() * 6.28, proto);
      stats.boats++;
    }
  }
  return stats;
}

// Aylmer Island (Île d'Aylmer), a low wooded island in the Ottawa River about
// 2.2 km west of the marina, where the canoe job paddles to. Outside the LiDAR
// clip and the map's water mask, so it is scenery only: a low bank, a stony
// shore and a canopy of lumpy crowns, lightly fogged so it reads through the
// haze from the breakwater.
export const ISLAND = { x: -4060, z: -330, rx: 150, rz: 55, yaw: -0.35 };
export function buildIsland(bd) {
  const r = mulberry32(0x1a1e);
  const { x, z, rx, rz, yaw } = ISLAND;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const NS = 28;
  const ring = (k, jit) => {
    const out = [];
    for (let i = 0; i < NS; i++) {
      const a = (i / NS) * Math.PI * 2;
      const wob = 1 + jit * Math.sin(a * 3 + 1.3) + jit * 0.6 * Math.sin(a * 5 + 0.4);
      const lx = Math.cos(a) * rx * k * wob, lz = Math.sin(a) * rz * k * wob * (a > Math.PI ? 0.8 : 1);
      out.push([x + lx * c - lz * s, z + lx * s + lz * c]);
    }
    return out;
  };
  const shore = ring(1, 0.08), bank = ring(0.9, 0.08), top = ring(0.7, 0.1);
  const SAND = [0.62, 0.58, 0.5], GRASS = [0.3, 0.38, 0.2];
  const band = (A, yA, B, yB, col) => {
    for (let i = 0; i < NS; i++) {
      const j = (i + 1) % NS;
      Q(bd, [A[i][0], yA, A[i][1]], [A[j][0], yA, A[j][1]], [B[j][0], yB, B[j][1]], [B[i][0], yB, B[i][1]], col, [0, 1, 0]);
    }
  };
  band(shore, -0.4, bank, 1.2, SAND);
  band(bank, 1.2, top, 2.6, GRASS);
  const cI = bd.vert(x, 3, z, 0, 1, 0, GRASS);
  for (const p of top) bd.vert(p[0], 2.6, p[1], 0, 1, 0, GRASS);
  for (let i = 0; i < NS; i++) bd.tri(cI, cI + 1 + ((i + 1) % NS), cI + 1 + i);
  // crowns: dark lumpy cones and rounded clumps, taller in the middle
  const trees = 150;
  for (let k = 0; k < trees; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.82;
    const lx = Math.cos(a) * rx * d, lz = Math.sin(a) * rz * d;
    const tx = x + lx * c - lz * s, tz = z + lx * s + lz * c;
    const h = (9 + r() * 9) * (1.1 - d * 0.5);
    const g = 0.75 + r() * 0.35;
    const conifer = r() < 0.35;
    const col = conifer ? [0.13 * g, 0.22 * g, 0.12 * g] : [0.2 * g, 0.32 * g, 0.14 * g];
    if (conifer) bd.cone(tx, 1.5, tz, 2.4 + r() * 1.5, h + 2, 5, col);
    else {
      const rr = 3.5 + r() * 3;
      bd.cyl(tx, h * 0.62, tz, rr, h * 0.7, 6, col, 'y', true);
      bd.cone(tx, h * 0.95, tz, rr * 0.9, rr * 0.8, 6, col);
    }
  }
}
