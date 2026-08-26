// Geometry construction. Everything in the game is built from these primitives:
// interleaved position(3) / normal(3) / colour(3) vertices with a 32-bit index buffer.

export const STRIDE = 9;

export function rgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
// Multiply a hex colour by a scalar (cheap shade variation).
export function shade(hex, k) {
  const c = rgb(hex);
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
}

export class MeshBuilder {
  constructor() {
    this.v = [];
    this.i = [];
    this.uv = [];      // optional, 2 per vertex; only used by textured meshes
    this.textured = false;
    this.min = [1e9, 1e9, 1e9];
    this.max = [-1e9, -1e9, -1e9];
  }
  get empty() { return this.i.length === 0; }
  get vertCount() { return this.v.length / STRIDE; }

  vert(x, y, z, nx, ny, nz, c, u = 0, v = 0) {
    this.v.push(x, y, z, nx, ny, nz, c[0], c[1], c[2]);
    if (this.textured || this.uv.length || u || v) {
      // Backfill zeros if UVs start mid-way so the arrays stay parallel.
      while (this.uv.length < (this.v.length / STRIDE - 1) * 2) this.uv.push(0, 0);
      this.uv.push(u, v);
    }
    if (x < this.min[0]) this.min[0] = x; if (x > this.max[0]) this.max[0] = x;
    if (y < this.min[1]) this.min[1] = y; if (y > this.max[1]) this.max[1] = y;
    if (z < this.min[2]) this.min[2] = z; if (z > this.max[2]) this.max[2] = z;
    return this.vertCount - 1;
  }

  tri(a, b, c) { this.i.push(a, b, c); }

  // Quad given four corner points in CCW order (seen from the front face).
  quad(p0, p1, p2, p3, c, nOverride) {
    let n = nOverride;
    if (!n) {
      const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
      const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      n = [nx / l, ny / l, nz / l];
    }
    const b0 = this.vert(p0[0], p0[1], p0[2], n[0], n[1], n[2], c);
    this.vert(p1[0], p1[1], p1[2], n[0], n[1], n[2], c);
    this.vert(p2[0], p2[1], p2[2], n[0], n[1], n[2], c);
    this.vert(p3[0], p3[1], p3[2], n[0], n[1], n[2], c);
    this.tri(b0, b0 + 1, b0 + 2);
    this.tri(b0, b0 + 2, b0 + 3);
  }

  // Horizontal quad at height y (used for ground, roads, parking lots, markings).
  flat(x0, z0, x1, z1, y, c) {
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    if (z1 < z0) { const t = z0; z0 = z1; z1 = t; }
    this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], c, [0, 1, 0]);
  }

  // Flat quad rotated about Y, centred on (cx,cz) — for angled road markings.
  flatRot(cx, cz, w, d, y, yaw, c) {
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const hw = w / 2, hd = d / 2;
    const P = (px, pz) => [cx + px * co + pz * s, y, cz - px * s + pz * co];
    this.quad(P(-hw, -hd), P(-hw, hd), P(hw, hd), P(hw, -hd), c, [0, 1, 0]);
  }

  // Box with base-centre at (cx, baseY, cz); top face may be inset for a tapered look.
  tower(cx, baseY, cz, wBot, dBot, h, c, opts = {}) {
    const wTop = opts.wTop ?? wBot, dTop = opts.dTop ?? dBot;
    const yaw = opts.yaw || 0, top = opts.top || c;
    const dx = opts.dx || 0, dz = opts.dz || 0; // top-face offset (slanted shapes)
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const P = (px, py, pz) => [cx + px * co + pz * s, py, cz - px * s + pz * co];
    const y0 = baseY, y1 = baseY + h;
    const bw = wBot / 2, bd = dBot / 2, tw = wTop / 2, td = dTop / 2;
    const b00 = P(-bw, y0, -bd), b01 = P(-bw, y0, bd), b11 = P(bw, y0, bd), b10 = P(bw, y0, -bd);
    const t00 = P(-tw + dx, y1, -td + dz), t01 = P(-tw + dx, y1, td + dz);
    const t11 = P(tw + dx, y1, td + dz), t10 = P(tw + dx, y1, -td + dz);
    this.quad(b00, b01, t01, t00, c);   // -X
    this.quad(b11, b10, t10, t11, c);   // +X
    this.quad(b10, b00, t00, t10, c);   // -Z
    this.quad(b01, b11, t11, t01, c);   // +Z
    this.quad(t01, t11, t10, t00, top, [0, 1, 0]);
    if (!opts.noBottom) this.quad(b00, b10, b11, b01, c, [0, -1, 0]);
  }

  // Box centred on (cx,cy,cz).
  box(cx, cy, cz, sx, sy, sz, c, opts = {}) {
    this.tower(cx, cy - sy / 2, cz, sx, sz, sy, c, opts);
  }

  // Gabled roof: a prism ridged along X (yaw rotates it).
  roof(cx, baseY, cz, w, d, h, c, yaw = 0, overhang = 0.35) {
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const P = (px, py, pz) => [cx + px * co + pz * s, py, cz - px * s + pz * co];
    const hw = w / 2 + overhang, hd = d / 2 + overhang;
    const y0 = baseY, y1 = baseY + h;
    const a = P(-hw, y0, -hd), b = P(hw, y0, -hd), cc = P(hw, y0, hd), dd = P(-hw, y0, hd);
    const r0 = P(-hw, y1, 0), r1 = P(hw, y1, 0);
    this.quad(b, a, r0, r1, c);      // -Z slope
    this.quad(dd, cc, r1, r0, c);    // +Z slope
    const g0 = this.vert(a[0], a[1], a[2], -co, 0, s, c);
    this.vert(dd[0], dd[1], dd[2], -co, 0, s, c);
    this.vert(r0[0], r0[1], r0[2], -co, 0, s, c);
    this.tri(g0, g0 + 1, g0 + 2);
    const g1 = this.vert(cc[0], cc[1], cc[2], co, 0, -s, c);
    this.vert(b[0], b[1], b[2], co, 0, -s, c);
    this.vert(r1[0], r1[1], r1[2], co, 0, -s, c);
    this.tri(g1, g1 + 1, g1 + 2);
  }

  // Cylinder along an axis: 'y' (poles, trunks, markers) or 'x' (wheels).
  cyl(cx, cy, cz, r, h, segs, c, axis = 'y', caps = true) {
    const half = h / 2;
    const ring = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      ring.push([Math.cos(a), Math.sin(a)]);
    }
    const pt = (i, end) => {
      const [u, v] = ring[i];
      if (axis === 'y') return [cx + u * r, cy + end * half, cz + v * r];
      return [cx + end * half, cy + u * r, cz + v * r];
    };
    const nrm = (i) => {
      const [u, v] = ring[i];
      return axis === 'y' ? [u, 0, v] : [0, u, v];
    };
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      const e = axis === 'y' ? -1 : 1;
      const p0 = pt(i, e), p1 = pt(i, -e), p2 = pt(j, -e), p3 = pt(j, e);
      const n0 = nrm(i), n1 = nrm(j);
      const b = this.vert(p0[0], p0[1], p0[2], n0[0], n0[1], n0[2], c);
      this.vert(p1[0], p1[1], p1[2], n0[0], n0[1], n0[2], c);
      this.vert(p2[0], p2[1], p2[2], n1[0], n1[1], n1[2], c);
      this.vert(p3[0], p3[1], p3[2], n1[0], n1[1], n1[2], c);
      this.tri(b, b + 1, b + 2); this.tri(b, b + 2, b + 3);
    }
    if (!caps) return;
    for (const end of [-1, 1]) {
      const n = axis === 'y' ? [0, end, 0] : [end, 0, 0];
      const ctr = axis === 'y' ? [cx, cy + end * half, cz] : [cx + end * half, cy, cz];
      const c0 = this.vert(ctr[0], ctr[1], ctr[2], n[0], n[1], n[2], c);
      for (let i = 0; i < segs; i++) {
        const p = pt(i, end);
        this.vert(p[0], p[1], p[2], n[0], n[1], n[2], c);
      }
      for (let i = 0; i < segs; i++) {
        const a = c0 + 1 + i, b = c0 + 1 + ((i + 1) % segs);
        const flip = axis === 'y' ? end > 0 : end < 0;
        if (flip) this.tri(c0, b, a); else this.tri(c0, a, b);
      }
    }
  }

  cone(cx, baseY, cz, r, h, segs, c) {
    const tip = this.vert(cx, baseY + h, cz, 0, 1, 0, c);
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
      const nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2);
      const b = this.vert(x0, baseY, z0, nx, 0.45, nz, c);
      this.vert(x1, baseY, z1, nx, 0.45, nz, c);
      this.tri(tip, b + 1, b);
    }
  }

  append(other) {
    const off = this.vertCount;
    if (other.uv.length || this.uv.length) {
      while (this.uv.length < off * 2) this.uv.push(0, 0);
      for (let k = 0; k < other.vertCount * 2; k++) this.uv.push(other.uv[k] || 0);
    }
    for (let k = 0; k < other.v.length; k++) this.v.push(other.v[k]);
    for (let k = 0; k < other.i.length; k++) this.i.push(other.i[k] + off);
    for (let k = 0; k < 3; k++) {
      this.min[k] = Math.min(this.min[k], other.min[k]);
      this.max[k] = Math.max(this.max[k], other.max[k]);
    }
  }
}
