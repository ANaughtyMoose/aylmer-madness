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
    // Optional, 4 per vertex: the atlas sub-rect (u0, v0, du, dv) this vertex
    // tiles inside. The shader does uv = rect.xy + fract(uvLocal) * rect.zw, so
    // a material can repeat any number of times inside its atlas cell without a
    // second draw call. All-zero (du == 0) means "use the UV as-is" — that is
    // the path car skins and decals take. Set `curRect` (see materials.js) and
    // every vertex emitted afterwards carries it.
    this.rect = [];
    this.curRect = null;
    // Optional world-space auto-tiling. While set (materials.js `tile()`), any
    // vertex that arrives WITHOUT explicit UVs gets them from its position and
    // normal: the pattern is projected onto the face at `m` metres per repeat,
    // measured from the origin (ox,oy,oz) — one origin per house keeps the
    // numbers small enough for fract() in the shader to stay exact. It is what
    // lets the dumb primitives below (prism, roof, hip, tower, mansard) come out
    // tiled with real brick and shingle without knowing anything about UVs.
    //   { m, ox, oy, oz, u, v }
    this.autoUV = null;
    this.textured = false;
    this.min = [1e9, 1e9, 1e9];
    this.max = [-1e9, -1e9, -1e9];
  }
  get empty() { return this.i.length === 0; }
  get vertCount() { return this.v.length / STRIDE; }

  // --- THE single funnel for texture coordinates. --------------------------
  // Every UV that ever reaches the buffer goes through here, so when the
  // material atlas lands its author only has to touch this one method (and can
  // leave it a no-op for meshes that never opt in). `vert()` calls it; nothing
  // else should push into `this.uv` directly.
  //
  // Default behaviour: a no-op until the mesh is textured (this.textured), has
  // already got UVs, or a non-zero pair is offered — then it keeps this.uv
  // exactly parallel with the vertex array.
  pushUV(u, v) {
    if (!(this.textured || this.uv.length || u || v)) return;
    // Backfill zeros if UVs start mid-way so the arrays stay parallel.
    while (this.uv.length < (this.v.length / STRIDE - 1) * 2) this.uv.push(0, 0);
    this.uv.push(u, v);
  }

  // World-space projected UVs for the vertex, in REPEATS of the armed material.
  // Horizontal faces project onto XZ; everything else onto (tangent, up-slope),
  // so shingle courses keep their real size on a pitch and siding laps stay
  // level and continuous around a corner.
  // Leaves the result in _au / _av (no allocation — this runs per vertex).
  autoUVAt(x, y, z, nx, ny, nz) {
    const a = this.autoUV;
    const px = x - a.ox, py = y - a.oy, pz = z - a.oz;
    const hl = Math.hypot(nx, nz);
    if (hl < 1e-4) { this._au = px / a.m + a.u; this._av = pz / a.m + a.v; return; }
    const tx = nz / hl, tz = -nx / hl;                 // cross(up, n), normalised
    const l = Math.hypot(nx, ny, nz) || 1;
    const mx = nx / l, my = ny / l, mz = nz / l;
    const bx = my * tz, by = mz * tx - mx * tz, bz = -my * tx;   // cross(n, t)
    this._au = (px * tx + pz * tz) / a.m + a.u;
    this._av = -(px * bx + py * by + pz * bz) / a.m + a.v;
  }

  vert(x, y, z, nx, ny, nz, c, u = 0, v = 0) {
    if (this.autoUV && u === 0 && v === 0) {
      this.autoUVAt(x, y, z, nx, ny, nz);
      u = this._au; v = this._av;
    }
    this.v.push(x, y, z, nx, ny, nz, c[0], c[1], c[2]);
    this.pushUV(u, v);
    if (this.curRect || this.rect.length) {
      while (this.rect.length < (this.v.length / STRIDE - 1) * 4) this.rect.push(0, 0, 0, 0);
      const r = this.curRect;
      if (r) this.rect.push(r[0], r[1], r[2], r[3]); else this.rect.push(0, 0, 0, 0);
    }
    if (x < this.min[0]) this.min[0] = x; if (x > this.max[0]) this.max[0] = x;
    if (y < this.min[1]) this.min[1] = y; if (y > this.max[1]) this.max[1] = y;
    if (z < this.min[2]) this.min[2] = z; if (z > this.max[2]) this.max[2] = z;
    return this.vertCount - 1;
  }

  tri(a, b, c) { this.i.push(a, b, c); }

  // Pad the optional streams so every vertex has one. A mesh that mixes
  // textured and untextured geometry (a chunk of houses plus its roads) stops
  // filling uv/rect after the last textured vertex, and WebGL rejects a draw
  // whose attribute buffer is short. Called by Renderer.upload().
  finish() {
    const n = this.vertCount;
    if (this.uv.length) while (this.uv.length < n * 2) this.uv.push(0, 0);
    if (this.rect.length) while (this.rect.length < n * 4) this.rect.push(0, 0, 0, 0);
    this.curRect = null;
    this.autoUV = null;
    return this;
  }

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
  // opts.onGable() is called after the two slopes and before the two gable-end
  // triangles, which are wall, not roof: houses.js uses it to swap the armed
  // material from shingle back to brick / siding. opts.gableCol tints them.
  roof(cx, baseY, cz, w, d, h, c, yaw = 0, overhang = 0.35, opts = null) {
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const P = (px, py, pz) => [cx + px * co + pz * s, py, cz - px * s + pz * co];
    const hw = w / 2 + overhang, hd = d / 2 + overhang;
    const y0 = baseY, y1 = baseY + h;
    const a = P(-hw, y0, -hd), b = P(hw, y0, -hd), cc = P(hw, y0, hd), dd = P(-hw, y0, hd);
    const r0 = P(-hw, y1, 0), r1 = P(hw, y1, 0);
    this.quad(b, a, r0, r1, c);      // -Z slope
    this.quad(dd, cc, r1, r0, c);    // +Z slope
    if (opts && opts.onGable) opts.onGable();
    const g = (opts && opts.gableCol) || c;
    const g0 = this.vert(a[0], a[1], a[2], -co, 0, s, g);
    this.vert(dd[0], dd[1], dd[2], -co, 0, s, g);
    this.vert(r0[0], r0[1], r0[2], -co, 0, s, g);
    this.tri(g0, g0 + 1, g0 + 2);
    const g1 = this.vert(cc[0], cc[1], cc[2], co, 0, -s, g);
    this.vert(b[0], b[1], b[2], co, 0, -s, g);
    this.vert(r1[0], r1[1], r1[2], co, 0, -s, g);
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

  // ======================================================================
  // Additive helpers for src/game/houses.js (Phase 2, parametric houses).
  // Nothing above this line changed behaviour; everything below is new.
  // ======================================================================

  // Quad with an atlas rect. `r` is {u0,v0,u1,v1} (or null/undefined for the
  // untextured path, in which case this is exactly `quad`). Corners map
  // p0->(u0,v1)  p1->(u1,v1)  p2->(u1,v0)  p3->(u0,v0), i.e. p0/p1 are the
  // BOTTOM edge of the tile for a vertical quad built bottom-left first.
  texQuad(p0, p1, p2, p3, c, r, nOverride) {
    if (!r) return this.quad(p0, p1, p2, p3, c, nOverride);
    let n = nOverride;
    if (!n) {
      const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
      const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      n = [nx / l, ny / l, nz / l];
    }
    const b0 = this.vert(p0[0], p0[1], p0[2], n[0], n[1], n[2], c, r.u0, r.v1);
    this.vert(p1[0], p1[1], p1[2], n[0], n[1], n[2], c, r.u1, r.v1);
    this.vert(p2[0], p2[1], p2[2], n[0], n[1], n[2], c, r.u1, r.v0);
    this.vert(p3[0], p3[1], p3[2], n[0], n[1], n[2], c, r.u0, r.v0);
    this.tri(b0, b0 + 1, b0 + 2);
    this.tri(b0, b0 + 2, b0 + 3);
  }

  // Vertical panel (window / door / garage-door decal, siding band, sign).
  // Centred on (cx,cy,cz), `w` wide along the wall, `h` tall, pushed `off`
  // metres out along the unit outward normal (nx,nz).
  panel(cx, cy, cz, w, h, nx, nz, c, r, off = 0.04) {
    const l = Math.hypot(nx, nz) || 1;
    nx /= l; nz /= l;
    // tangent that makes quad()'s auto-normal come out as (nx,0,nz)
    const tx = nz, tz = -nx;
    const px = cx + nx * off, pz = cz + nz * off;
    const hw = w / 2, hh = h / 2;
    this.texQuad(
      [px - tx * hw, cy - hh, pz - tz * hw],
      [px + tx * hw, cy - hh, pz + tz * hw],
      [px + tx * hw, cy + hh, pz + tz * hw],
      [px - tx * hw, cy + hh, pz - tz * hw],
      c, r, [nx, 0, nz]);
  }

  // Four-sided post / column: sides only (8 tris), no caps — porch posts,
  // fence posts, deck legs. Cheaper than tower() by a fifth.
  post(cx, y0, cz, s, h, c, yaw = 0) {
    const co = Math.cos(yaw), si = Math.sin(yaw), hs = s / 2;
    const P = (px, py, pz) => [cx + px * co + pz * si, py, cz - px * si + pz * co];
    const y1 = y0 + h;
    const b00 = P(-hs, y0, -hs), b01 = P(-hs, y0, hs), b11 = P(hs, y0, hs), b10 = P(hs, y0, -hs);
    const t00 = P(-hs, y1, -hs), t01 = P(-hs, y1, hs), t11 = P(hs, y1, hs), t10 = P(hs, y1, -hs);
    this.quad(b00, b01, t01, t00, c);
    this.quad(b11, b10, t10, t11, c);
    this.quad(b10, b00, t00, t10, c);
    this.quad(b01, b11, t11, t01, c);
  }

  // Walls extruded from a closed footprint ring [[x,z],...]. `hAt` is either a
  // number (uniform eave) or a function (edgeIndex) => eave height, which is how
  // a lower garage wing gets a lower wall without splitting the polygon.
  // opts.onEdge(ax,az,bx,bz) is called per edge (collider registration).
  // Returns the triangle count added.
  prism(ring, y0, hAt, c, opts = {}) {
    const n = ring.length;
    if (n < 3) return 0;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      s += a[0] * b[1] - b[0] * a[1];
    }
    const fwd = s < 0;   // see world.js: negative shoelace == outward for [a,b,b',a']
    const f = typeof hAt === 'function' ? hAt : () => hAt;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const y1 = y0 + f(i);
      const ia = fwd ? i : j, ib = fwd ? j : i;
      const a = ring[ia], q = ring[ib];
      this.quad([a[0], y0, a[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [a[0], y1, a[1]], c);
      if (opts.onEdge) opts.onEdge(ring[i][0], ring[i][1], ring[j][0], ring[j][1]);
    }
    return n * 2;
  }

  // Up-facing cap from precomputed index triples (mapdata's `t` arrays).
  // Winding is fixed per triangle so every cap faces the sky.
  capPoly(ring, tris, y, c) {
    for (let i = 0; i < tris.length; i += 3) {
      const a = ring[tris[i]], b = ring[tris[i + 1]], d = ring[tris[i + 2]];
      if (!a || !b || !d) continue;
      const cross = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
      const v0 = this.vert(a[0], y, a[1], 0, 1, 0, c);
      if (cross > 0) {
        this.vert(d[0], y, d[1], 0, 1, 0, c);
        this.vert(b[0], y, b[1], 0, 1, 0, c);
      } else {
        this.vert(b[0], y, b[1], 0, 1, 0, c);
        this.vert(d[0], y, d[1], 0, 1, 0, c);
      }
      this.tri(v0, v0 + 1, v0 + 2);
    }
    return (tris.length / 3) | 0;
  }

  // Up-facing rectangle cap, rotated about Y (2 tris). Same yaw convention as
  // tower()/roof(): local +X maps to map-angle -yaw. `down` flips it into a
  // soffit — the underside of a roof, which you see whenever the camera is
  // below the eave and without which you look straight through the (back-face
  // culled) near slope at the sky.
  capRect(cx, cz, w, d, y, yaw, c, down = false) {
    const co = Math.cos(yaw), si = Math.sin(yaw), hw = w / 2, hd = d / 2;
    const P = (px, pz) => [cx + px * co + pz * si, y, cz - px * si + pz * co];
    if (down) this.quad(P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd), c, [0, -1, 0]);
    else this.quad(P(-hw, -hd), P(-hw, hd), P(hw, hd), P(hw, -hd), c, [0, 1, 0]);
    return 2;
  }

  // Hipped roof on a rectangle: two trapezoids + two triangular hip ends (6 tris).
  // Ridge runs along local X; if the rect is deeper than it is wide the whole
  // thing is rotated a quarter turn so the ridge still follows the long axis.
  // Degenerates to a pyramid when w == d.
  hip(cx, baseY, cz, w, d, h, c, yaw = 0, overhang = 0.45) {
    if (w < d) { const t = w; w = d; d = t; yaw += Math.PI / 2; }
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const P = (px, py, pz) => [cx + px * co + pz * s, py, cz - px * s + pz * co];
    const hw = w / 2 + overhang, hd = d / 2 + overhang;
    const rl = Math.max(0, hw - hd);
    const y0 = baseY, y1 = baseY + h;
    const a = P(-hw, y0, -hd), b = P(hw, y0, -hd);
    const e = P(hw, y0, hd), f = P(-hw, y0, hd);
    const r0 = P(-rl, y1, 0), r1 = P(rl, y1, 0);
    this.quad(b, a, r0, r1, c);      // -Z slope
    this.quad(f, e, r1, r0, c);      // +Z slope
    const g0 = this.vert(a[0], a[1], a[2], -co, 0.4, s, c);   // -X hip
    this.vert(f[0], f[1], f[2], -co, 0.4, s, c);
    this.vert(r0[0], r0[1], r0[2], -co, 0.4, s, c);
    this.tri(g0, g0 + 1, g0 + 2);
    const g1 = this.vert(e[0], e[1], e[2], co, 0.4, -s, c);   // +X hip
    this.vert(b[0], b[1], b[2], co, 0.4, -s, c);
    this.vert(r1[0], r1[1], r1[2], co, 0.4, -s, c);
    this.tri(g1, g1 + 1, g1 + 2);
    return 6;
  }

  // Mansard: a steep flared skirt with a near-flat deck on top (10 tris).
  // `h` is the skirt height, `inset` how far the deck pulls in on each side.
  mansard(cx, baseY, cz, w, d, h, c, yaw = 0, overhang = 0.35, inset = 1.3, top) {
    const iw = Math.max(0.8, w - inset * 2), id = Math.max(0.8, d - inset * 2);
    this.tower(cx, baseY, cz, w + overhang * 2, d + overhang * 2, h, c,
      { wTop: iw, dTop: id, yaw, noBottom: true, top: top || c });
    return 10;
  }

  // Shed / lean-to roof: single plane, low at local -Z, high at local +Z.
  // Used for porch and carport roofs (6 tris; 2 with opts.slopeOnly).
  shedRoof(cx, baseY, cz, w, d, h, c, yaw = 0, overhang = 0.3, opts = {}) {
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const P = (px, py, pz) => [cx + px * co + pz * s, py, cz - px * s + pz * co];
    const hw = w / 2 + overhang, hd = d / 2 + overhang;
    const y0 = baseY, y1 = baseY + h;
    const lo0 = P(-hw, y0, -hd), lo1 = P(hw, y0, -hd);
    const hi0 = P(-hw, y1, hd), hi1 = P(hw, y1, hd);
    this.quad(lo1, lo0, hi0, hi1, c);      // the slope
    if (opts.slopeOnly) return 2;
    const t0 = P(-hw, y0, hd), t1 = P(hw, y0, hd);
    const n0 = [-co, 0, s], n1 = [co, 0, -s];
    let b = this.vert(lo0[0], lo0[1], lo0[2], n0[0], n0[1], n0[2], c);   // -X gable
    this.vert(t0[0], t0[1], t0[2], n0[0], n0[1], n0[2], c);
    this.vert(hi0[0], hi0[1], hi0[2], n0[0], n0[1], n0[2], c);
    this.tri(b, b + 1, b + 2);
    b = this.vert(t1[0], t1[1], t1[2], n1[0], n1[1], n1[2], c);          // +X gable
    this.vert(lo1[0], lo1[1], lo1[2], n1[0], n1[1], n1[2], c);
    this.vert(hi1[0], hi1[1], hi1[2], n1[0], n1[1], n1[2], c);
    this.tri(b, b + 1, b + 2);
    this.quad(t0, t1, hi1, hi0, c);        // the high fascia
    return 6;
  }

  append(other) {
    const off = this.vertCount;
    if (other.uv.length || this.uv.length) {
      while (this.uv.length < off * 2) this.uv.push(0, 0);
      for (let k = 0; k < other.vertCount * 2; k++) this.uv.push(other.uv[k] || 0);
    }
    if (other.rect.length || this.rect.length) {
      while (this.rect.length < off * 4) this.rect.push(0, 0, 0, 0);
      for (let k = 0; k < other.vertCount * 4; k++) this.rect.push(other.rect[k] || 0);
    }
    for (let k = 0; k < other.v.length; k++) this.v.push(other.v[k]);
    for (let k = 0; k < other.i.length; k++) this.i.push(other.i[k] + off);
    for (let k = 0; k < 3; k++) {
      this.min[k] = Math.min(this.min[k], other.min[k]);
      this.max[k] = Math.max(this.max[k], other.max[k]);
    }
  }
}
