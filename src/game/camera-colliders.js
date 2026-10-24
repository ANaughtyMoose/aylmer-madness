// CPU-only copies of rendered building surfaces. Positions and indices are
// copied before upload; colors, normals, UVs and the MeshBuilder are not kept.
// A grid indexes whole building blocks, then each query culls their triangles.
// Geometry stays finite in all three dimensions, including roofs and eaves.
const CELL = 32;
const EPS = 1e-9;
const key = (x, z) => `${x},${z}`;

export function makeCameraColliders(packet = null) {
  const grid = new Map(), blocks = [], result = [];
  const stats = { blocks: 0, triangles: 0, vertices: 0, bytes: 0, cellEntries: 0 };
  let serial = 0;
  function insert(positions, indices, min, max, source) {
    const block = { positions, indices, min, max, source, stamp: 0 };
    blocks.push(block);
    const x0 = Math.floor(min[0] / CELL), x1 = Math.floor(max[0] / CELL);
    const z0 = Math.floor(min[2] / CELL), z1 = Math.floor(max[2] / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = key(x, z);
      let a = grid.get(k); if (!a) { a = []; grid.set(k, a); }
      a.push(block); stats.cellEntries++;
    }
    stats.blocks++; stats.vertices += positions.length / 3; stats.triangles += indices.length / 3;
    stats.bytes += positions.byteLength + indices.byteLength;
    return block;
  }
  function addMesh(mesh, from = 0, to = mesh.i.length, source = 'building') {
    if (from === to) return null;
    if (from % 3 || to % 3 || from < 0 || to > mesh.i.length) throw new Error('camera mesh range must contain whole triangles');
    // Rendered primitives use contiguous vertices. Copy their occupied range,
    // not the whole town chunk that several buildings happen to share.
    let first = Infinity, last = -1;
    for (let i = from; i < to; i++) { first = Math.min(first, mesh.i[i]); last = Math.max(last, mesh.i[i]); }
    const n = last - first + 1, positions = new Float32Array(n * 3);
    const indices = n <= 65536 ? new Uint16Array(to - from) : new Uint32Array(to - from);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
      const v = mesh.v[(first + i) * 9 + k];
      if (!Number.isFinite(v)) throw new Error('non-finite camera surface');
      positions[i * 3 + k] = v;
      const stored = positions[i * 3 + k];
      min[k] = Math.min(min[k], stored); max[k] = Math.max(max[k], stored);
    }
    for (let i = from; i < to; i++) indices[i - from] = mesh.i[i] - first;
    return insert(positions, indices, min, max, source);
  }
  function query(minX, minY, minZ, maxX, maxY, maxZ, into = result) {
    if (into === result) into.length = 0;
    serial++;
    if (serial > 0x7fffffff) { serial = 1; for (const b of blocks) b.stamp = 0; }
    for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++) {
      for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++) {
        const a = grid.get(key(x, z)); if (!a) continue;
        for (const b of a) {
          if (b.stamp === serial) continue;
          b.stamp = serial;
          if (b.min[0] <= maxX && b.max[0] >= minX && b.min[1] <= maxY && b.max[1] >= minY
            && b.min[2] <= maxZ && b.max[2] >= minZ) into.push(b);
        }
      }
    }
    return into;
  }
  function free() {
    grid.clear(); blocks.length = result.length = 0;
    for (const k of Object.keys(stats)) stats[k] = 0;
  }
  // Worker transport keeps the exact packed buffers and triangle ordering.
  // The receiving thread rebuilds only its spatial grid, with no mesh rebuild.
  function toPacket() {
    return { schema: 'aylmer-camera-colliders', version: 1,
      blocks: blocks.map(({ positions, indices, min, max, source }) => ({ positions, indices, min, max, source })) };
  }
  if (packet) {
    if (packet.schema !== 'aylmer-camera-colliders' || packet.version !== 1) throw new Error('unknown camera collider packet');
    for (const b of packet.blocks) {
      if (!(b.positions instanceof Float32Array) || !(b.indices instanceof Uint16Array || b.indices instanceof Uint32Array)
        || b.positions.length % 3 || b.indices.length % 3 || b.min?.length !== 3 || b.max?.length !== 3
        || !b.min.every(Number.isFinite) || !b.max.every(Number.isFinite)
        || b.min.some((v, k) => v > b.max[k])) throw new Error('invalid camera collider buffers');
      insert(b.positions, b.indices, b.min, b.max, b.source);
    }
  }
  return { addMesh, query, free, stats, toPacket };
}

// Closest point on a finite triangle (including its edges and vertices).
// Shared scratch; this module is synchronous and keeps no per-frame objects.
const close = [0, 0, 0];
function closest(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let u = 0, v = 0;
  if (!(d1 <= 0 && d2 <= 0)) {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) u = 1;
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) u = d1 / (d1 - d3);
      else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) v = 1;
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) v = d2 / (d2 - d6);
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              v = (d4 - d3) / (d4 - d3 + d5 - d6); u = 1 - v;
            } else { const den = 1 / (va + vb + vc); u = vb * den; v = vc * den; }
          }
        }
      }
    }
  }
  close[0] = ax + abx * u + acx * v;
  close[1] = ay + aby * u + acy * v;
  close[2] = az + abz * u + acz * v;
  return close;
}

function root(a, b, c) {
  if (a < EPS) return Infinity;
  const d = b * b - a * c;
  if (d < -EPS) return Infinity;
  return (-b - Math.sqrt(Math.max(0, d))) / a;
}
function sphereVertex(px, py, pz, dx, dy, dz, x, y, z, r) {
  const ox = px - x, oy = py - y, oz = pz - z;
  return root(dx * dx + dy * dy + dz * dz, ox * dx + oy * dy + oz * dz,
    ox * ox + oy * oy + oz * oz - r * r);
}
function sphereEdge(px, py, pz, dx, dy, dz, ax, ay, az, bx, by, bz, r) {
  const ex = bx - ax, ey = by - ay, ez = bz - az, ee = ex * ex + ey * ey + ez * ez;
  if (ee < EPS) return Infinity;
  const ox = px - ax, oy = py - ay, oz = pz - az;
  const oe = (ox * ex + oy * ey + oz * ez) / ee, de = (dx * ex + dy * ey + dz * ez) / ee;
  const qx = ox - ex * oe, qy = oy - ey * oe, qz = oz - ez * oe;
  const vx = dx - ex * de, vy = dy - ey * de, vz = dz - ez * de;
  const t = root(vx * vx + vy * vy + vz * vz, qx * vx + qy * vy + qz * vz,
    qx * qx + qy * qy + qz * qz - r * r);
  const along = oe + t * de;
  return along >= -EPS && along <= 1 + EPS ? t : Infinity;
}

// Exact sphere sweep against a two-sided triangle: face, three edge capsules,
// three vertex spheres. A start overlap may leave only while moving outward.
// It may not tunnel through the surface or pass into a neighbouring triangle.
export function sphereTriangle(px, py, pz, dx, dy, dz, r, p, ia, ib, ic, escape = true) {
  const ax = p[ia], ay = p[ia + 1], az = p[ia + 2];
  const bx = p[ib], by = p[ib + 1], bz = p[ib + 2];
  const cx = p[ic], cy = p[ic + 1], cz = p[ic + 2];
  const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < EPS) return Infinity;
  nx /= nl; ny /= nl; nz /= nl;
  closest(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz);
  const ox = px - close[0], oy = py - close[1], oz = pz - close[2];
  const d2 = ox * ox + oy * oy + oz * oz;
  if (d2 < r * r + EPS) {
    // Squared distance to a convex set is convex along the sweep. A positive
    // derivative therefore proves that an initial skin contact is being left.
    if (escape && d2 > EPS && ox * dx + oy * dy + oz * dz >= -EPS) return Infinity;
    return 0;
  }
  let near = Infinity;
  const plane = (px - ax) * nx + (py - ay) * ny + (pz - az) * nz;
  const speed = dx * nx + dy * ny + dz * nz;
  if (Math.abs(speed) > EPS) for (let sign = -1; sign <= 1; sign += 2) {
    const t = (sign * r - plane) / speed;
    if (t < 0 || t > 1 || t >= near) continue;
    const x = px + dx * t - nx * sign * r, y = py + dy * t - ny * sign * r, z = pz + dz * t - nz * sign * r;
    closest(x, y, z, ax, ay, az, bx, by, bz, cx, cy, cz);
    if ((x - close[0]) ** 2 + (y - close[1]) ** 2 + (z - close[2]) ** 2 < 1e-12) near = t;
  }
  let t = sphereEdge(px, py, pz, dx, dy, dz, ax, ay, az, bx, by, bz, r);
  if (t >= 0 && t <= 1 && t < near) near = t;
  t = sphereEdge(px, py, pz, dx, dy, dz, bx, by, bz, cx, cy, cz, r);
  if (t >= 0 && t <= 1 && t < near) near = t;
  t = sphereEdge(px, py, pz, dx, dy, dz, cx, cy, cz, ax, ay, az, r);
  if (t >= 0 && t <= 1 && t < near) near = t;
  t = sphereVertex(px, py, pz, dx, dy, dz, ax, ay, az, r);
  if (t >= 0 && t <= 1 && t < near) near = t;
  t = sphereVertex(px, py, pz, dx, dy, dz, bx, by, bz, r);
  if (t >= 0 && t <= 1 && t < near) near = t;
  t = sphereVertex(px, py, pz, dx, dy, dz, cx, cy, cz, r);
  if (t >= 0 && t <= 1 && t < near) near = t;
  return near;
}

const sweep = { t: 1, hit: false, source: null, triangles: 0, blocks: 0 };
export const cameraWork = { queries: 0, scanned: 0, tested: 0, blocks: 0 };
export function sweepCamera(world, fx, fy, fz, tx, ty, tz, radius, escape = true) {
  sweep.t = 1; sweep.hit = false; sweep.source = null; sweep.triangles = sweep.blocks = 0;
  if (!world?.queryCameraBlocks) return sweep;
  cameraWork.queries++;
  const minX = Math.min(fx, tx) - radius, maxX = Math.max(fx, tx) + radius;
  const minY = Math.min(fy, ty) - radius, maxY = Math.max(fy, ty) + radius;
  const minZ = Math.min(fz, tz) - radius, maxZ = Math.max(fz, tz) + radius;
  const blocks = world.queryCameraBlocks(minX, minY, minZ, maxX, maxY, maxZ);
  const dx = tx - fx, dy = ty - fy, dz = tz - fz;
  sweep.blocks = blocks.length;
  cameraWork.blocks += blocks.length;
  for (const block of blocks) {
    const p = block.positions, ids = block.indices;
    cameraWork.scanned += ids.length / 3;
    for (let i = 0; i < ids.length; i += 3) {
      const a = ids[i] * 3, b = ids[i + 1] * 3, c = ids[i + 2] * 3;
      if (Math.min(p[a], p[b], p[c]) > maxX || Math.max(p[a], p[b], p[c]) < minX
        || Math.min(p[a + 1], p[b + 1], p[c + 1]) > maxY || Math.max(p[a + 1], p[b + 1], p[c + 1]) < minY
        || Math.min(p[a + 2], p[b + 2], p[c + 2]) > maxZ || Math.max(p[a + 2], p[b + 2], p[c + 2]) < minZ) continue;
      sweep.triangles++;
      cameraWork.tested++;
      const t = sphereTriangle(fx, fy, fz, dx, dy, dz, radius, p, a, b, c, escape);
      if (t <= sweep.t) { sweep.t = t; sweep.hit = true; sweep.source = block.source; }
    }
  }
  return sweep;
}
