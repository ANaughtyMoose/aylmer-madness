// Chase camera collision and final-render evidence. The world supplies finite
// rendered building surfaces through queryCameraBlocks, including roofs.
import { clamp, segCross, angleDelta } from '../core/math.js';
import { sweepCamera, cameraWork } from './camera-colliders.js';
export { segCross };

export const CAST_R = 0.45;
export const MARGIN = CAST_R;
export const SKIN = 0.025;
export const RELEASE = 2.4;
export const SNAP = 0.004;
const MIN_VIEW = 1.7;
const out = { x: 0, y: 0, z: 0, frac: 1, hit: false, alternate: false };
const resolved = { x: 0, y: 0, z: 0, frac: 1, alternate: false };
const directions = [[0, 1], [1, 0], [-1, 0], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];

export function makeClip() {
  return { frac: 1, clipped: false, guarded: false, alternate: false, escaping: false, ox: 0, oy: 0, oz: 0,
    focusX: null, focusZ: null, teleported: false,
    solveMs: 0,
    workQueries: cameraWork.queries, workScanned: cameraWork.scanned, workTested: cameraWork.tested, workBlocks: cameraWork.blocks };
}

function safeFraction(world, fx, fy, fz, x, y, z) {
  const hit = sweepCamera(world, fx, fy, fz, x, y, z, CAST_R);
  const f = hit.hit ? Math.max(0, hit.t - SKIN / Math.max(1e-9, Math.hypot(x - fx, y - fy, z - fz))) : 1;
  // Initial skin contact may be left, but a tangent boom may keep its eye in
  // that skin all the way. The final camera sphere still has to be clear.
  const ex = fx + (x - fx) * f, ey = fy + (y - fy) * f, ez = fz + (z - fz) * f;
  return sweepCamera(world, ex, ey, ez, ex, ey, ez, CAST_R, false).hit ? 0 : f;
}

// Keep the boom on the car's side of the first surface. If a crash leaves
// insufficient room behind the car, search finite alternative booms on its
// visible side. A minimum boom length must never force the eye through a wall.
function resolve(world, fx, fy, fz, x, y, z, groundY) {
  const dx = x - fx, dy = y - fy, dz = z - fz, len = Math.hypot(dx, dy, dz);
  const frac = safeFraction(world, fx, fy, fz, x, y, z);
  resolved.x = fx + dx * frac; resolved.y = fy + dy * frac; resolved.z = fz + dz * frac;
  resolved.frac = frac; resolved.alternate = false;
  const aboveGround = !groundY || resolved.y >= groundY(resolved.x, resolved.z) + 1.1;
  if (!world?.queryCameraBlocks || (len * frac >= MIN_VIEW && aboveGround)) return resolved;
  const hlen = Math.hypot(dx, dz), ux = hlen > 1e-6 ? dx / hlen : 0, uz = hlen > 1e-6 ? dz / hlen : 1;
  let best = -Infinity;
  // Always test the same order, so an exactly symmetric corner is stable.
  for (let i = 0; i < directions.length; i++) for (let lift = 0; lift < 2; lift++) {
    const d = directions[i], reach = Math.min(Math.max(len, 3), 5);
    const tx = fx + (ux * d[1] + uz * d[0]) * reach;
    const tz = fz + (uz * d[1] - ux * d[0]) * reach;
    let ty = fy + (lift ? 3.8 : 1.5);
    if (groundY) ty = Math.max(ty, groundY(tx, tz) + 1.1);
    const f = safeFraction(world, fx, fy, fz, tx, ty, tz);
    const distance = Math.hypot(tx - fx, ty - fy, tz - fz) * f;
    if (distance < MIN_VIEW) continue;
    const ex = fx + (tx - fx) * f, ey = fy + (ty - fy) * f, ez = fz + (tz - fz) * f;
    if (groundY && ey < groundY(ex, ez) + 1.1) continue;
    const score = Math.min(distance, 4) + d[1] * 0.6 - lift * 0.15;
    if (score <= best) continue;
    best = score;
    resolved.x = ex; resolved.y = ey; resolved.z = ez;
    resolved.alternate = true;
  }
  return resolved;
}

// S3-CRASH: the crash cam's eye. A fixed point `dist` metres off to one side
// of the car and `up` metres above `fy`, on whichever side has the room: both
// pure sides first, then the four quarters, each swept from the car with the
// same safe fraction the chase boom uses, so it can never sit inside a wall.
// The longest clear view wins, a pure side breaking ties. When nothing is
// clear for at least MIN_VIEW, null: the caller keeps the chase cam.
const SIDES = [[1, 0, 'left'], [-1, 0, 'right'], [0.8, 0.6, 'left-front'], [-0.8, 0.6, 'right-front'],
  [0.8, -0.6, 'left-rear'], [-0.8, -0.6, 'right-rear']];
const side = { x: 0, y: 0, z: 0, side: '', clear: 0 };
export function sideView(world, fx, fy, fz, yaw, dist = 6, up = 1.2, groundY = null) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let best = -Infinity;
  side.side = '';
  for (let i = 0; i < SIDES.length; i++) {
    const [lx, lz, name] = SIDES[i];
    // Local +X is the driver's left: world = (lx cos y + lz sin y, -lx sin y + lz cos y).
    const tx = fx + (lx * c + lz * s) * dist, tz = fz + (-lx * s + lz * c) * dist;
    let ty = fy + up;
    if (groundY) ty = Math.max(ty, groundY(tx, tz) + 1.1);
    const f = world?.queryCameraBlocks ? safeFraction(world, fx, fy, fz, tx, ty, tz) : 1;
    const reach = Math.hypot(tx - fx, ty - fy, tz - fz) * f;
    if (reach < MIN_VIEW) continue;
    const ex = fx + (tx - fx) * f, ey = fy + (ty - fy) * f, ez = fz + (tz - fz) * f;
    if (groundY && ey < groundY(ex, ez) + 1.1) continue;
    const score = reach + (lz === 0 ? 0.5 : 0);
    if (score <= best) continue;
    best = score;
    side.x = ex; side.y = ey; side.z = ez; side.side = name; side.clear = f;
  }
  return side.side ? side : null;
}

export function clipCamera(st, world, fx, fy, fz, cx, cy, cz, dt) {
  const started = performance.now();
  st.workQueries = cameraWork.queries; st.workScanned = cameraWork.scanned;
  st.workTested = cameraWork.tested; st.workBlocks = cameraWork.blocks;
  const dx = cx - fx, dy = cy - fy, dz = cz - fz;
  const len = Math.hypot(dx, dy, dz);
  st.teleported = st.focusX === null || Math.hypot(fx - st.focusX, fz - st.focusZ) > Math.max(40, len * 2);
  st.focusX = fx; st.focusZ = fz;
  if (st.teleported) { st.frac = 1; st.escaping = false; }
  const want = safeFraction(world, fx, fy, fz, cx, cy, cz);
  if (want < st.frac) st.frac = want;
  else if (dt > 0) {
    st.frac += (want - st.frac) * (1 - Math.exp(-RELEASE * dt));
    if (Math.abs(want - st.frac) < SNAP) st.frac = want;
  }
  st.frac = clamp(st.frac, 0, 1);
  out.x = fx + dx * st.frac; out.y = fy + dy * st.frac; out.z = fz + dz * st.frac;
  out.frac = st.frac; out.hit = st.frac < 1; out.alternate = false;
  if (len * want < MIN_VIEW && world?.queryCameraBlocks) {
    const safe = resolve(world, fx, fy, fz, cx, cy, cz, null);
    out.x = safe.x; out.y = safe.y; out.z = safe.z; out.alternate = safe.alternate;
    st.escaping = safe.alternate;
    st.ox = out.x - fx; st.oy = out.y - fy; st.oz = out.z - fz;
  } else if (st.escaping) {
    // Releasing an alternate view needs its actual boom, not the old zero
    // fraction of the blocked direction. Orbit it home instead of interpolating
    // through the car or jumping to full distance for a few frames.
    const k = dt > 0 ? 1 - Math.exp(-RELEASE * dt) : 0;
    const yaw = Math.atan2(st.ox, st.oz), goal = Math.atan2(dx, dz);
    const a = yaw + angleDelta(goal, yaw) * k;
    const h = Math.hypot(st.ox, st.oz) + (Math.hypot(dx, dz) * want - Math.hypot(st.ox, st.oz)) * k;
    const y = st.oy + (dy * want - st.oy) * k;
    const safe = resolve(world, fx, fy, fz, fx + Math.sin(a) * h, fy + y, fz + Math.cos(a) * h, null);
    out.x = safe.x; out.y = safe.y; out.z = safe.z; out.alternate = true;
    st.ox = out.x - fx; st.oy = out.y - fy; st.oz = out.z - fz;
    if (Math.hypot(st.ox - dx * want, st.oy - dy * want, st.oz - dz * want) < SKIN) {
      st.escaping = false; st.frac = want;
      out.x = fx + dx * want; out.y = fy + dy * want; out.z = fz + dz * want; out.alternate = false;
    }
    out.frac = len > 1e-9 ? Math.min(1, Math.hypot(st.ox, st.oy, st.oz) / len) : 1;
    out.hit = out.frac < 1 || out.alternate;
  }
  st.clipped = out.hit; st.guarded = false; st.alternate = out.alternate;
  st.solveMs = performance.now() - started;
  return out;
}

// Call after position smoothing and ground correction. It modifies the exact
// eye passed to Renderer.begin. No unchecked lift follows this correction.
export function guardView(st, world, fx, fy, fz, pos, groundY = null) {
  const started = performance.now();
  const oldX = pos[0], oldY = pos[1], oldZ = pos[2];
  if (groundY) pos[1] = Math.max(pos[1], groundY(pos[0], pos[2]) + 1.1);
  const safe = resolve(world, fx, fy, fz, pos[0], pos[1], pos[2], groundY);
  pos[0] = safe.x; pos[1] = safe.y; pos[2] = safe.z;
  let alternate = safe.alternate;
  // A clipped boom can put the eye over rising ground. The raised point is
  // tested again instead of trusting the old horizontal clearance.
  if (groundY && pos[1] < groundY(pos[0], pos[2]) + 1.1) {
    const s = resolve(world, fx, fy, fz, pos[0], groundY(pos[0], pos[2]) + 1.1, pos[2], groundY);
    pos[0] = s.x; pos[1] = s.y; pos[2] = s.z;
    alternate ||= s.alternate;
  }
  const moved = Math.hypot(oldX - pos[0], oldY - pos[1], oldZ - pos[2]) > 1e-7;
  st.guarded = moved; st.alternate = st.alternate || alternate;
  // The target's release rate still controls return to full distance. Its
  // fraction is relative to the desired boom, so do not multiply it by the
  // guard's fraction of an already-smoothed boom.
  st.solveMs += performance.now() - started;
  return moved;
}

export const camClipStats = {
  frames: 0, rayBlocked: 0, eyeBlocked: 0, sphereBlocked: 0, unframed: 0, unknown: 0,
  clipped: 0, guarded: 0, alternate: 0, maxBlockedSeconds: 0, blockedSeconds: 0,
  queries: 0, scannedTriangles: 0, testedTriangles: 0,
  solveMs: 0, maxSolveMs: 0,
  maxQueries: 0, maxScannedTriangles: 0, maxTestedTriangles: 0, maxBlocks: 0,
  last: { rayClear: true, sphereClear: true, eyeClear: true, framed: true, known: false, x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, source: null },
  get clearPct() { return this.frames ? 100 * (1 - (this.rayBlocked + this.unknown) / this.frames) : null; },
  reset() {
    for (const k of Object.keys(this)) if (typeof Object.getOwnPropertyDescriptor(this, k).value === 'number') this[k] = 0;
    return this;
  },
};

// Read after Renderer.begin using the actual view-projection matrix. These
// counters validate the corrected position, not the desired target or a hit
// flag. Unavailable geometry is unknown, never counted as a clear frame.
export function recordCameraFrame(st, world, fx, fy, fz, eye, vp, dt = 0, yaw = null, pitch = null) {
  const started = performance.now();
  const S = camClipStats, L = S.last;
  S.frames++; L.known = !!world?.queryCameraBlocks && (!world.cameraReady || world.cameraReady(fx, fz, eye[0], eye[2]));
  L.x = eye[0]; L.y = eye[1]; L.z = eye[2]; L.fx = fx; L.fy = fy; L.fz = fz;
  L.yaw = yaw; L.pitch = pitch;
  if (!L.known) S.unknown++;
  const ray = sweepCamera(world, fx, fy, fz, ...eye, 0, false);
  L.rayClear = !ray.hit; L.source = ray.source;
  const path = sweepCamera(world, fx, fy, fz, ...eye, CAST_R);
  L.sphereClear = !path.hit;
  const sphere = sweepCamera(world, ...eye, ...eye, CAST_R, false);
  L.eyeClear = !sphere.hit;
  const w = vp ? vp[3] * fx + vp[7] * fy + vp[11] * fz + vp[15] : NaN;
  const px = vp ? (vp[0] * fx + vp[4] * fy + vp[8] * fz + vp[12]) / w : NaN;
  const py = vp ? (vp[1] * fx + vp[5] * fy + vp[9] * fz + vp[13]) / w : NaN;
  L.framed = w > 0.4 && Math.abs(px) <= 0.9 && Math.abs(py) <= 0.9;
  if (!L.rayClear && L.known) S.rayBlocked++;
  if (!L.sphereClear && L.known) S.sphereBlocked++;
  if (!L.eyeClear && L.known) S.eyeBlocked++;
  if (!L.framed) S.unframed++;
  if (st.clipped) S.clipped++;
  if (st.guarded) S.guarded++;
  if (st.alternate) S.alternate++;
  S.blockedSeconds = !L.known || !L.rayClear ? S.blockedSeconds + Math.max(0, dt) : 0;
  S.maxBlockedSeconds = Math.max(S.maxBlockedSeconds, S.blockedSeconds);
  const queries = cameraWork.queries - st.workQueries, scanned = cameraWork.scanned - st.workScanned;
  const tested = cameraWork.tested - st.workTested, blocks = cameraWork.blocks - st.workBlocks;
  S.queries += queries; S.scannedTriangles += scanned; S.testedTriangles += tested;
  S.maxQueries = Math.max(S.maxQueries, queries); S.maxScannedTriangles = Math.max(S.maxScannedTriangles, scanned);
  S.maxTestedTriangles = Math.max(S.maxTestedTriangles, tested); S.maxBlocks = Math.max(S.maxBlocks, blocks);
  const solveMs = st.solveMs + performance.now() - started;
  S.solveMs += solveMs; S.maxSolveMs = Math.max(S.maxSolveMs, solveMs);
  return L;
}
