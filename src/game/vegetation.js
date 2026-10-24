// Trees and shrubs for the lit prototype renderer (prototype.html).
//
// The classic renderer keeps world.js's cone trees. When the renderer is the
// Three.js prototype, world.js calls these instead, and the vegetation goes into
// the same per-chunk land mesh as before, so knocking a tree over, its flying
// debris and sector freeing all work unchanged.
//
// A broadleaf tree is a tapered trunk, a few branches, a dark inner core that
// stops you seeing through the crown, and 16-24 double-sided leaf cards spread
// over an ellipsoid. A conifer is a trunk, a dark core cone and tiers of
// drooping bough cards. Card normals point away from the crown's centre, the
// usual trick that makes a cloud of cards light like one soft volume.
//
// The cards carry a UV sentinel the prototype shader reads (renderer.js,
// src/prototype/nature.js): u = 4000 + 10 * kind + local u, v = local v.
//   kind 0  broadleaf leaf cluster (procedural leaves, alpha cut)
//   kind 1  conifer bough (procedural needles, alpha cut)
//   kind 2  solid foliage (inner cores, shrub bodies): no cut, leaf-scale mottling
//   kind 3  bark
// The shader also sways kinds 0 and 1 a little in the wind.
import { mulberry32 } from '../core/math.js';

const LEAF_U = 4000, CONE_U = 4010, SOLID_U = 4020, BARK_U = 4030;

// Mid-summer Outaouais palettes (sRGB 0..1). Several greens per species so a
// street of maples is not one flat colour.
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const SPECIES = {
  maple: { leaf: [0x3f6b28, 0x4b7a2e, 0x567f31, 0x3a6127, 0x5d8636].map(hex), bark: hex(0x5a4c40) },
  elm:   { leaf: [0x3b6030, 0x456b33, 0x4f7438].map(hex), bark: hex(0x4f453d) },
  birch: { leaf: [0x5d8a36, 0x6a933c, 0x587f31].map(hex), bark: hex(0xd8d4c8) },
  spruce:{ leaf: [0x2c4a2f, 0x33523a, 0x2a4534].map(hex), bark: hex(0x4a3b30) },
  pine:  { leaf: [0x34543a, 0x3b5d3c, 0x2f4d35].map(hex), bark: hex(0x4d3d33) },
  cedar: { leaf: [0x4b6a30, 0x557434, 0x46622f].map(hex), bark: hex(0x6a5444) },
};
const SHRUB_LEAF = [0x3d6530, 0x4a7236, 0x56803b, 0x335a34, 0x4d6b2e].map(hex);
const BLOOM = [0xe4c34f, 0xd96b73, 0xb985c8, 0xe8e2d2, 0xe0714a].map(hex);

const mul = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
const tint = (c, r, g, b) => [Math.min(1, c[0] * r), Math.min(1, c[1] * g), Math.min(1, c[2] * b)];
function norm(x, y, z) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }

// A position hash seeds each tree's own generator, so the look of a tree never
// depends on how many random numbers the rest of the world bake used.
function rngAt(x, z, salt) {
  const h = (Math.imul(Math.round(x * 10) | 0, 73856093) ^ Math.imul(Math.round(z * 10) | 0, 19349663) ^ salt) >>> 0;
  return mulberry32(h);
}

// One double-sided quad with the same (outward) normal on both faces.
// c0..c3 are the corners, uv local 0..1: c0 (0,0) c1 (1,0) c2 (1,1) c3 (0,1).
function card(bd, c0, c1, c2, c3, n, colBot, colTop, base) {
  const a = bd.vert(c0[0], c0[1], c0[2], n[0], n[1], n[2], colBot, base, 0.001);
  bd.vert(c1[0], c1[1], c1[2], n[0], n[1], n[2], colBot, base + 1, 0.001);
  bd.vert(c2[0], c2[1], c2[2], n[0], n[1], n[2], colTop, base + 1, 1);
  bd.vert(c3[0], c3[1], c3[2], n[0], n[1], n[2], colTop, base, 1);
  bd.tri(a, a + 1, a + 2); bd.tri(a, a + 2, a + 3);
  bd.tri(a, a + 2, a + 1); bd.tri(a, a + 3, a + 2);
}

// A square card of half-size s centred on p, spanned by unit axes e1, e2.
function cardAt(bd, p, e1, e2, s, n, colBot, colTop, base) {
  const q = (a, b) => [p[0] + (e1[0] * a + e2[0] * b) * s, p[1] + (e1[1] * a + e2[1] * b) * s, p[2] + (e1[2] * a + e2[2] * b) * s];
  card(bd, q(-1, -1), q(1, -1), q(1, 1), q(-1, 1), n, colBot, colTop, base);
}

// Tapered open cylinder (no caps), bark UVs: u around, v up in metres/2.
function trunk(bd, x, y0, z, r0, y1, r1, segs, col, lean) {
  const b = bd.vertCount;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    bd.vert(x + ca * r0, y0, z + sa * r0, ca, 0, sa, mul(col, 0.8), BARK_U + i / segs, 0.001);
    bd.vert(x + lean[0] + ca * r1, y1, z + lean[1] + sa * r1, ca, 0.2, sa, col, BARK_U + i / segs, Math.min(1, (y1 - y0) / 6));
  }
  for (let i = 0; i < segs; i++) {
    const k = b + i * 2;
    bd.tri(k, k + 1, k + 3); bd.tri(k, k + 3, k + 2);
  }
}

// Branch: a thin 4-sided tube from a to b.
function branch(bd, a, b, r, col) {
  const d = norm(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const s = norm(-d[2], 0, d[0]);
  const t = [d[1] * s[2] - d[2] * s[1], d[2] * s[0] - d[0] * s[2], d[0] * s[1] - d[1] * s[0]];
  const base = bd.vertCount;
  for (let i = 0; i < 4; i++) {
    const ang = i * Math.PI / 2, c = Math.cos(ang), sn = Math.sin(ang);
    const n = [s[0] * c + t[0] * sn, s[1] * c + t[1] * sn, s[2] * c + t[2] * sn];
    bd.vert(a[0] + n[0] * r, a[1] + n[1] * r, a[2] + n[2] * r, n[0], n[1], n[2], col, BARK_U + i / 4, 0.001);
    bd.vert(b[0] + n[0] * r * 0.4, b[1] + n[1] * r * 0.4, b[2] + n[2] * r * 0.4, n[0], n[1], n[2], col, BARK_U + i / 4, 0.5);
  }
  for (let i = 0; i < 4; i++) {
    const k = base + i * 2, j = base + ((i + 1) % 4) * 2;
    bd.tri(k, k + 1, j + 1); bd.tri(k, j + 1, j);
  }
}

// Icosahedron blob with jittered radius and outward (spherical) normals.
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => norm(...p));
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return { v, f };
})();
function blob(bd, cx, cy, cz, rx, ry, rz, col, rnd, jitter = 0.18, flatBottom = false) {
  const base = bd.vertCount;
  for (const p of ICO.v) {
    const k = 1 - jitter + rnd() * jitter * 2;
    let y = p[1];
    if (flatBottom && y < -0.3) y = -0.3 - (y + 0.3) * 0.2;
    const shadeK = 0.62 + 0.38 * (p[1] * 0.5 + 0.5);
    bd.vert(cx + p[0] * rx * k, cy + y * ry * k, cz + p[2] * rz * k, p[0], p[1] * 0.8 + 0.2, p[2], mul(col, shadeK), SOLID_U + p[0] * 0.5 + 0.5, p[2] * 0.5 + 0.5);
  }
  for (const f of ICO.f) bd.tri(base + f[0], base + f[2], base + f[1]);
}

// A clump: two or three crossed leaf cards at a point on the crown.
function clump(bd, p, out, size, col, rnd, kindU, cards = 3) {
  const n = norm(out[0] * 0.8, out[1] * 0.8 + 0.35, out[2] * 0.8);
  // Build an orthonormal frame around a random axis near the outward direction.
  const ax = norm(out[0] + (rnd() - 0.5), out[1] + (rnd() - 0.5), out[2] + (rnd() - 0.5));
  let e1 = norm(-ax[2], 0.0001, ax[0]);
  let e2 = [ax[1] * e1[2] - ax[2] * e1[1], ax[2] * e1[0] - ax[0] * e1[2], ax[0] * e1[1] - ax[1] * e1[0]];
  const bot = mul(col, 0.78), top = mul(col, 1.08);
  cardAt(bd, p, e1, e2, size, n, bot, top, kindU);           // faces outward-ish
  cardAt(bd, p, e1, ax, size * 0.9, n, bot, top, kindU);     // crossed
  if (cards > 2) cardAt(bd, p, e2, ax, size * 0.85, n, bot, top, kindU);
}

function broadleaf(bd, x, g, z, scale, sp, rnd, shape, leafOver) {
  const H = 9.2 * scale * (0.88 + rnd() * 0.26);
  const P = SPECIES[sp];
  let leaf = P.leaf[(rnd() * P.leaf.length) | 0];
  if (leafOver) leaf = hex(leafOver);
  // Crown ellipsoid by shape: maple round, elm vase (high, wide, flat), birch narrow.
  const cy = g + H * (shape === 'elm' ? 0.7 : shape === 'birch' ? 0.62 : 0.6);
  const rx = H * (shape === 'elm' ? 0.36 : shape === 'birch' ? 0.22 : 0.3) * (0.9 + rnd() * 0.2);
  const rz = rx * (0.85 + rnd() * 0.3);
  const ry = H * (shape === 'elm' ? 0.26 : shape === 'birch' ? 0.32 : 0.3);
  const leanX = (rnd() - 0.5) * 0.5 * scale, leanZ = (rnd() - 0.5) * 0.5 * scale;
  const r0 = (sp === 'birch' ? 0.14 : 0.2) * scale;
  const trunkTop = cy - ry * 0.2;
  trunk(bd, x, g - 0.25, z, r0, trunkTop, r0 * 0.55, 6, P.bark, [leanX, leanZ]);
  // Branches from the upper trunk into the crown.
  const nb = 3 + ((rnd() * 2) | 0);
  const phase = rnd() * Math.PI * 2;
  for (let i = 0; i < nb; i++) {
    const a = phase + (i / nb) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
    const y0 = g + (trunkTop - g) * (0.62 + rnd() * 0.3);
    const t0 = (y0 - g) / (trunkTop - g);
    const from = [x + leanX * t0, y0, z + leanZ * t0];
    const to = [x + leanX + Math.cos(a) * rx * 0.72, cy + ry * (0.05 + rnd() * 0.35), z + leanZ + Math.sin(a) * rz * 0.72];
    branch(bd, from, to, r0 * 0.45, P.bark);
  }
  const ccx = x + leanX, ccz = z + leanZ;
  // Dark core so the crown never reads as a see-through lattice.
  blob(bd, ccx, cy, ccz, rx * 0.68, ry * 0.66, rz * 0.68, mul(leaf, 0.55), rnd, 0.22);
  // Leaf clusters on a shell, denser toward the top and the sunny outside.
  const n = Math.round(14 + scale * 7);
  const size = Math.max(rx, rz) * (shape === 'birch' ? 0.5 : 0.44);
  for (let i = 0; i < n; i++) {
    // Fibonacci-ish spread with jitter keeps clumps from bunching.
    const t = (i + 0.5) / n;
    const yN = 1 - 1.7 * t;                    // top -> a little below the equator
    const rr = Math.sqrt(Math.max(0, 1 - yN * yN));
    const a = i * 2.39996 + rnd() * 0.7;
    const f = 0.62 + rnd() * 0.36;
    const dx = Math.cos(a) * rr, dz = Math.sin(a) * rr;
    const p = [ccx + dx * rx * f, cy + yN * ry * f, ccz + dz * rz * f];
    // Per-clump colour: a small hue shift, darker low in the crown.
    const k = (0.72 + 0.32 * (yN * 0.5 + 0.5)) * (0.9 + rnd() * 0.2);
    const col = tint(leaf, k * (0.95 + rnd() * 0.12), k, k * (0.9 + rnd() * 0.12));
    clump(bd, p, [dx, yN, dz], size * (0.8 + rnd() * 0.4), col, rnd, LEAF_U, 3);
  }
}

function conifer(bd, x, g, z, scale, sp, rnd, leafOver) {
  const P = SPECIES[sp];
  let leaf = P.leaf[(rnd() * P.leaf.length) | 0];
  if (leafOver) leaf = hex(leafOver);
  const H = (sp === 'pine' ? 12.5 : sp === 'cedar' ? 8.0 : 11.0) * scale * (0.85 + rnd() * 0.3);
  const R = H * (sp === 'pine' ? 0.27 : sp === 'cedar' ? 0.15 : 0.22) * (0.9 + rnd() * 0.2);
  trunk(bd, x, g - 0.25, z, 0.16 * scale, g + H * 0.92, 0.04, 5, P.bark, [0, 0]);
  if (sp === 'cedar') {
    // Eastern white cedar: a dense column, rounded top, cards all over it.
    const cy = g + H * 0.55;
    blob(bd, x, cy, z, R, H * 0.48, R * (0.9 + rnd() * 0.2), mul(leaf, 0.72), rnd, 0.14);
    const n = Math.round(12 + scale * 6);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, yN = 0.95 - 1.8 * t, a = i * 2.39996 + rnd() * 0.5;
      const rr = Math.sqrt(Math.max(0.05, 1 - yN * yN));
      const dx = Math.cos(a) * rr, dz = Math.sin(a) * rr;
      const p = [x + dx * R * 0.92, cy + yN * H * 0.44, z + dz * R * 0.92];
      clump(bd, p, [dx, yN * 0.3, dz], R * 0.62, mul(leaf, 0.85 + rnd() * 0.25 + yN * 0.08), rnd, CONE_U, 2);
    }
    return;
  }
  // Spruce / white pine: a dark core cone and tiers of drooping boughs.
  const base = bd.vertCount, segs = 7, coreY0 = g + H * 0.1;
  const coreCol = mul(leaf, 0.62);
  const tip = bd.vert(x, g + H, z, 0, 1, 0, coreCol, SOLID_U + 0.5, 0.5);
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2, k = 0.4 + rnd() * 0.18;
    bd.vert(x + Math.cos(a) * R * k, coreY0, z + Math.sin(a) * R * k, Math.cos(a), 0.4, Math.sin(a), mul(coreCol, 0.8), SOLID_U + i / segs, 0.001);
  }
  for (let i = 0; i < segs; i++) bd.tri(tip, base + 1 + ((i + 1) % segs), base + 1 + i);
  const tiers = sp === 'pine' ? 6 : 10;
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const y = g + H * (0.12 + 0.82 * f) + (rnd() - 0.5) * 0.3 * scale;
    const irregular = sp === 'pine' ? 0.55 + rnd() * 0.7 : 0.85 + rnd() * 0.3;
    const r = R * (sp === 'pine' ? (1 - Math.pow(f, 1.6)) : Math.pow(1 - f, 0.95)) * irregular + 0.35 * scale;
    const boughs = sp === 'pine' ? 5 : Math.max(4, Math.round(7 - f * 3));
    const phase = rnd() * Math.PI * 2;
    const k = (0.72 + 0.4 * f) * (0.9 + rnd() * 0.2);
    const col = mul(leaf, k);
    for (let b = 0; b < boughs; b++) {
      const a = phase + (b / boughs) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
      const ca = Math.cos(a), sa = Math.sin(a);
      const len = r * (1.0 + rnd() * 0.3);
      const droop = len * (sp === 'pine' ? 0.08 : 0.3);
      const w0 = 0.25 * scale, w1 = len * (sp === 'pine' ? 0.55 : 0.48);
      const px = -sa, pz = ca;                       // across the bough
      const o = [x + ca * 0.1, y, z + sa * 0.1];
      const e = [x + ca * len, y - droop, z + sa * len];
      const n = norm(ca * 0.7, 0.75, sa * 0.7);
      // u runs along the bough (trunk -> tip), v across it.
      const c0 = [o[0] - px * w0, o[1] + 0.05, o[2] - pz * w0];
      const c1 = [e[0] - px * w1, e[1] - 0.1 * len, e[2] - pz * w1];
      const c2 = [e[0] + px * w1, e[1] - 0.1 * len, e[2] + pz * w1];
      const c3 = [o[0] + px * w0, o[1] + 0.05, o[2] + pz * w0];
      const a0 = bd.vert(c0[0], c0[1], c0[2], n[0], n[1], n[2], mul(col, 0.7), CONE_U, 0.001);
      bd.vert(c1[0], c1[1], c1[2], n[0], n[1], n[2], col, CONE_U + 1, 0.001);
      bd.vert(c2[0], c2[1], c2[2], n[0], n[1], n[2], col, CONE_U + 1, 1);
      bd.vert(c3[0], c3[1], c3[2], n[0], n[1], n[2], mul(col, 0.7), CONE_U, 1);
      bd.tri(a0, a0 + 1, a0 + 2); bd.tri(a0, a0 + 2, a0 + 3);
      bd.tri(a0, a0 + 2, a0 + 1); bd.tri(a0, a0 + 3, a0 + 2);
    }
  }
}

// tree(bd, x, g, z, scale, conifer): the prototype replacement for world.js's
// cone tree. `conifer` keeps world.js's own split; the species inside each
// group come from the position hash.
// Options: { species: 'maple'|'elm'|'birch'|'spruce'|'pine'|'cedar', leaf: 0xRRGGBB }
// pin one tree (the red maple and the young fir on 299 Fraser's lawn).
export function protoTree(bd, x, g, z, scale, isConifer, o = null) {
  const rnd = rngAt(x, z, 0x7ee5);
  const pick = rnd();
  if (o && o.species) {
    const sp = o.species;
    if (sp === 'spruce' || sp === 'pine' || sp === 'cedar') conifer(bd, x, g, z, scale, sp, rnd, o.leaf);
    else broadleaf(bd, x, g, z, scale, sp, rnd, sp, o.leaf);
    return;
  }
  if (isConifer) conifer(bd, x, g, z, scale, pick < 0.55 ? 'spruce' : pick < 0.78 ? 'pine' : 'cedar', rnd);
  else if (pick < 0.58) broadleaf(bd, x, g, z, scale, 'maple', rnd, 'maple');
  else if (pick < 0.8) broadleaf(bd, x, g, z, scale, 'elm', rnd, 'elm');
  else broadleaf(bd, x, g, z, scale, 'birch', rnd, 'birch');
}

// A front-garden shrub: a low rounded body plus a few leaf cards so its
// outline is soft, and a scatter of blossom when it flowers.
export function protoShrub(bd, x, g, z, scale, flowers) {
  const rnd = rngAt(x, z, 0x5b12);
  const col = SHRUB_LEAF[(rnd() * SHRUB_LEAF.length) | 0];
  const w = 0.95 * scale * (0.85 + rnd() * 0.3), h = 0.75 * scale * (0.8 + rnd() * 0.4);
  blob(bd, x, g + h * 0.55, z, w, h * 0.6, w * (0.75 + rnd() * 0.3), mul(col, 0.9), rnd, 0.16, true);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.2566 + rnd() * 0.5, yN = 0.2 + rnd() * 0.6;
    const dx = Math.cos(a), dz = Math.sin(a);
    const p = [x + dx * w * 0.75, g + h * (0.45 + yN * 0.5), z + dz * w * 0.75];
    clump(bd, p, [dx, yN, dz], w * 0.55, mul(col, 0.95 + rnd() * 0.2), rnd, LEAF_U, 2);
  }
  if (!flowers) return;
  const bloom = BLOOM[(rnd() * BLOOM.length) | 0];
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 0.7;
    blob(bd, x + Math.cos(a) * w * d, g + h * (0.95 + rnd() * 0.15), z + Math.sin(a) * w * d * 0.8,
      0.18 * scale, 0.12 * scale, 0.18 * scale, bloom, rnd, 0.3);
  }
}

// A clipped cedar hedge from (x0,z0) to (x1,z1): overlapping flattened blobs
// for the body and small cedar cards over the faces, so it reads as foliage
// rather than a green box. groundY(x, z) drapes it on the lawn.
export function protoHedge(bd, x0, z0, x1, z1, width, height, groundY, leafHex = 0x44583b) {
  const rnd = rngAt(x0 + x1, z0 + z1, 0x4ed9);
  const L = Math.hypot(x1 - x0, z1 - z0) || 1, ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  const n = Math.max(2, Math.round(L / 1.1));
  const col = hex(leafHex);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const g = groundY(x, z), h = height * (0.9 + rnd() * 0.18);
    const c = mul(col, 0.9 + rnd() * 0.2);
    // The body: long axis along the hedge line, which blob() cannot rotate, so
    // use two rounder blobs per step instead.
    blob(bd, x, g + h * 0.5, z, width * 0.55, h * 0.52, width * 0.55, mul(c, 0.8), rnd, 0.1, true);
    for (let k = 0; k < 2; k++) {
      const side = k ? 1 : -1;
      const px = -uz * side, pz = ux * side;
      const p = [x + px * width * 0.5, g + h * (k === 2 ? 0.98 : 0.35 + rnd() * 0.45), z + pz * width * 0.5];
      clump(bd, p, [px, k === 2 ? 1 : 0.1, pz], width * 0.42, mul(c, 1.0 + rnd() * 0.12), rnd, CONE_U, 2);
    }
  }
}
