// The shared golf-cart kit. Mission 6 (« N'importe quelle petite clé »,
// setpieces/golfnuit.js) is the first user; mission 9 (Russell at the Royal
// Ottawa) is meant to be the second. Nothing in here knows which mission it is
// serving: everything takes G, the mission record `m`, and plain data.
//
// API
// ---------------------------------------------------------------------------
// RAMPS (runtime, no terrain rebake)
//   rampAt(r, x, z)              -> { h, gx, gz } | null    pure: height and
//                                   gradient of ONE ramp over flat ground.
//   rampsAt(list, x, z)          -> the tallest of the list at (x, z), or null.
//   wrapGround(orig, list)       -> a groundAt(x, z) that adds the ramps on top
//                                   of `orig` and returns ONE shared record
//                                   { h, nx, ny, nz, kind } like terrain.js.
//   installRamps(G, list, opts)  -> handle. Wraps G.phys.groundAt / groundY
//                                   (the car, traffic and camera all see the
//                                   ramps) and, when there is a renderer, adds a
//                                   visible wedge prop per ramp. opts.prefix
//                                   namespaces the props (default 'cartkit:ramp').
//   removeRamps(G, handle)       -> puts G.phys back exactly and drops the props
//                                   and meshes. Safe to call twice, or with null.
//   ramp shape: { x, z, yaw, len, height, width?, back?, kind? }
//     (x, z) is the LIP, yaw the heading you leave it on (forward = sin/cos yaw,
//     same as jumps.js). The climb is a quadratic kicker over `len` metres, so
//     the slope builds from 0 to 2*height/len and there is no hard hit at the
//     foot; behind the lip it falls away over `back` metres (default 1.4*height).
//     A car on it gets vy = slope * speed at the lip (cars.js's vertical step).
//   kickerAir(r, kmh)            -> predicted airtime at that speed (seconds).
//
// CHECKPOINTS
//   chainStages(points, opts)    -> stages[] for missionkit: one stage per point,
//                                   `text` "<label> i/n", shared sub/hint/
//                                   condition/prompt/onTick; opts.onEnter(G, m,
//                                   st, i) and opts.toast(i, n) optional.
//
// AIRTIME
//   newAir()                     -> tracker state
//   airStep(state, v, dt, cfg)   -> { state, landed } pure. Reads v.airT,
//                                   v.lastAir (cars.js). `landed` is
//                                   { air, jump } on the tick the wheels come
//                                   back, else null. `jump` means air >= cfg.minAir.
//   forgiveLanding(state, v)     -> undoes the landing damage cars.js charged on
//                                   this tick (call every tick after airStep).
//
// GOVERNOR (the cart's top speed, while a mission wants it)
//   governorStep(v, dt, topKmh, acc) -> adds forward speed while the pedal is
//                                   down and the wheels are on the ground, up to
//                                   topKmh. Does not touch the spec, so weather,
//                                   skills and economy.retune never fight it.
//
// SWAP
//   inCart(G)                    -> true while you are driving the cart
//   swapIntoCart(G, m, spot)     -> m.cameIn = your car, G.swapCar('cart'); the
//                                   car stays parked where you were. `spot`
//                                   (optional) is where the cart should be if
//                                   G.parked.cart is missing (a fresh one).
//   swapBack(G, m, opts)         -> back into m.cameIn if you are within
//                                   opts.near metres (default 25) of it; the
//                                   cart goes to opts.cartSpot if given.
//                                   Returns true when it swapped.
//   swapTo(G, id, opts)          -> into parked vehicle `id` WHATEVER the
//                                   distance (B-01a: a job's end never strands
//                                   you). opts.spot puts it there first if
//                                   G.parked[id] is missing. True when you are
//                                   in `id` afterwards (already in it counts).
import { MeshBuilder, rgb } from '../../core/mesh.js';

// ---------------------------------------------------------------- tuning
export const KIT = {
  rampWidth: 3.4,     // m, default ramp width (the cart is 1.2 m wide)
  rampBackK: 1.4,     // back face length as a multiple of height
  minAir: 0.6,        // s, a flight shorter than this is a bump, not a jump
  govAcc: 3.2,        // m/s², the extra pull the governor hack gives
};
const GRAV = 9.81;

// ---------------------------------------------------------------- ramps

/** Height and gradient of one ramp at (x, z), over flat ground. */
export function rampAt(r, x, z) {
  const s = Math.sin(r.yaw), c = Math.cos(r.yaw);
  const dx = x - r.x, dz = z - r.z;
  const u = dx * s + dz * c;               // along the heading, 0 at the lip
  const w = dx * c - dz * s;               // across it
  const hw = (r.width || KIT.rampWidth) / 2;
  if (Math.abs(w) > hw) return null;
  const H = r.height, L = r.len;
  const back = r.back || H * KIT.rampBackK;
  let h, dhdu;
  if (u < -L || u > back) return null;
  if (u <= 0) {
    const t = (u + L) / L;
    h = H * t * t;
    dhdu = (2 * H * t) / L;
  } else {
    h = H * (1 - u / back);
    dhdu = -H / back;
  }
  return { h, gx: dhdu * s, gz: dhdu * c };
}

/** The tallest ramp of a list at (x, z), or null. */
export function rampsAt(list, x, z) {
  let best = null;
  for (const r of list) {
    const d = Math.hypot(x - r.x, z - r.z);
    if (d > r.len + (r.back || r.height * KIT.rampBackK) + (r.width || KIT.rampWidth)) continue;
    const q = rampAt(r, x, z);
    if (q && (!best || q.h > best.h)) best = q;
  }
  return best;
}

/** Airtime off a kicker at this speed, landing on its own base level. */
export function kickerAir(r, kmh) {
  const vy = ((2 * r.height) / r.len) * (kmh / 3.6);
  return (vy + Math.sqrt(vy * vy + 2 * GRAV * r.height)) / GRAV;
}

/** A groundAt that adds the ramps on top of `orig`. One shared record. */
export function wrapGround(orig, list, kind = 'grass') {
  const out = { h: 0, nx: 0, ny: 1, nz: 0, kind: null };
  return function groundAt(x, z) {
    const g = orig(x, z);
    const q = rampsAt(list, x, z);
    if (!q) return g;
    const ny0 = g.ny > 1e-6 ? g.ny : 1;
    const gx = -g.nx / ny0 + q.gx, gz = -g.nz / ny0 + q.gz;
    const l = Math.hypot(gx, 1, gz);
    out.h = g.h + q.h;
    out.nx = -gx / l; out.ny = 1 / l; out.nz = -gz / l;
    out.kind = kind;
    return out;
  };
}

// The visible wedge: turf on top, packed sand on the faces. Local +Z forward,
// lip at z = 0, base at y = 0.
export function buildRampMesh(r) {
  const b = new MeshBuilder();
  const top = rgb(0x5f8a3c), face = rgb(0xcdb98a), lip = rgb(0xe8e0c8);
  const hw = (r.width || KIT.rampWidth) / 2, H = r.height, L = r.len;
  const back = r.back || H * KIT.rampBackK;
  const N = 8;
  const prof = [];
  for (let i = 0; i <= N; i++) { const t = i / N; prof.push([-L + t * L, H * t * t]); }
  prof.push([back, 0]);
  for (let i = 0; i + 1 < prof.length; i++) {
    const [z0, y0] = prof[i], [z1, y1] = prof[i + 1];
    const c = i === N - 1 ? lip : i >= N ? face : top;
    b.quad([-hw, y0, z0], [-hw, y1, z1], [hw, y1, z1], [hw, y0, z0], c);
    // the two side walls, down to the ground
    b.quad([-hw, 0, z0], [-hw, 0, z1], [-hw, y1, z1], [-hw, y0, z0], face);
    b.quad([hw, y0, z0], [hw, y1, z1], [hw, 0, z1], [hw, 0, z0], face);
  }
  return b;
}

/** Put a list of ramps into the world. Returns a handle for removeRamps. */
export function installRamps(G, list, opts = {}) {
  const prefix = opts.prefix || 'cartkit:ramp';
  const h = { list: list.slice(), prefix, phys: null, orig: null, meshes: [] };
  if (G && G.phys && G.phys.groundAt) {
    const orig = { groundAt: G.phys.groundAt, groundY: G.phys.groundY };
    const ground = wrapGround(orig.groundAt, h.list, opts.kind || 'grass');
    G.phys.groundAt = ground;
    G.phys.groundY = (x, z) => ground(x, z).h;
    h.phys = G.phys; h.orig = orig;
    h.ground = ground;
  }
  if (G && G.props && G.renderer && G.renderer.upload) {
    const base = h.orig ? h.orig.groundY || ((x, z) => h.orig.groundAt(x, z).h) : () => 0;
    h.list.forEach((r, i) => {
      try {
        const mesh = G.renderer.upload(buildRampMesh(r));
        h.meshes.push(mesh);
        G.props.add({ id: `${prefix}${i}`, mesh, x: r.x, y: base(r.x, r.z), z: r.z, yaw: r.yaw, far: 500 });
      } catch (e) { /* no GL in this context: physics only */ }
    });
  }
  return h;
}

/** Undo installRamps. Idempotent. */
export function removeRamps(G, h) {
  if (!h) return;
  if (h.phys && h.orig) {
    // Only restore if nobody wrapped on top of us since; otherwise leave the
    // ramps list empty so our wrapper becomes a pass-through.
    if (h.phys.groundAt === h.ground) {
      h.phys.groundAt = h.orig.groundAt;
      h.phys.groundY = h.orig.groundY;
    }
    h.list.length = 0;
    h.phys = null;
  }
  if (G && G.props && G.props.removePrefix) G.props.removePrefix(h.prefix);
  if (G && G.renderer && G.renderer.free) for (const mesh of h.meshes) { try { G.renderer.free(mesh); } catch (e) { /* gone */ } }
  h.meshes.length = 0;
}

// ---------------------------------------------------------------- checkpoints

/** One missionkit stage per point. */
export function chainStages(points, opts = {}) {
  const n = points.length;
  const label = opts.label || 'Drapeau';
  return points.map((p, i) => ({
    kind: 'cp' + (i + 1),
    text: `${label} ${i + 1}/${n}`,
    sub: opts.sub || '',
    hint: opts.hint || '',
    at: { x: p.x, z: p.z },
    radius: p.r || opts.radius || 12,
    condition: opts.condition,
    prompt: opts.prompt,
    toast: opts.toast ? opts.toast(i, n) : undefined,
    onEnter: opts.onEnter ? (G, m, st) => opts.onEnter(G, m, st, i) : undefined,
    onTick: opts.onTick,
  }));
}

// ---------------------------------------------------------------- airtime

export function newAir() {
  return { flying: false, t: 0, jumps: 0, total: 0, best: 0, dmg: 0 };
}

/** Pure: one tick of the airtime tracker. */
export function airStep(state, v, dt, cfg = KIT) {
  const s = { ...state };
  let landed = null;
  if (v.airT > 0) {
    if (!s.flying) { s.flying = true; s.t = 0; }
    s.t = v.airT;
  } else if (s.flying) {
    const air = s.t; // lastAir goes stale after hops < 0.05 s (playtest: 33 jumps on one fairway)
    s.flying = false; s.t = 0;
    const jump = air >= cfg.minAir;
    if (jump) {
      s.jumps += 1;
      s.total += air;
      if (air > s.best) s.best = air;
    }
    landed = { air, jump };
  }
  return { state: s, landed };
}

/**
 * The cart lands on bare turf, not on a landing ramp, so cars.js charges the
 * springs for every drop. On a joyride that is not the point: call this every
 * tick and the damage a landing adds is handed back. Mutates `state.dmg`.
 */
export function forgiveLanding(state, v) {
  if (!v) return;
  if (v.landed > 0 && Number.isFinite(state.dmg) && v.damage > state.dmg) v.damage = state.dmg;
  state.dmg = v.damage || 0;
}

// ---------------------------------------------------------------- governor

/** Extra forward pull up to topKmh while the pedal is down. Returns dv. */
export function governorStep(v, dt, topKmh, acc = KIT.govAcc) {
  if (!v || v.inAir || v.air || !(v.throttle > 0.5) || v.dir < 0) return 0;
  const top = topKmh / 3.6;
  const sp = v.vLong || 0;
  if (sp < 0.5 || sp >= top) return 0;
  const dv = acc * dt * (1 - (sp / top) * (sp / top));
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  v.vx += fx * dv; v.vz += fz * dv;
  v.vLong = sp + dv;
  return dv;
}

// ---------------------------------------------------------------- swap

export const inCart = (G) => !!G && G.carId === 'cart' && !!G.veh && !!G.veh.spec && G.veh.spec.id === 'cart';

/** Put the player in the cart; the car he came in stays where it is. */
export function swapIntoCart(G, m, spot) {
  if (!G || !G.veh || !G.veh.spec || G.veh.spec.id === 'cart') return false;
  if (!G.swapCar || !G.parked) return false;
  if (!G.parked.cart) {
    if (!spot) return false;
    G.parked.cart = { x: spot.x, z: spot.z, yaw: spot.yaw || 0 };
  }
  m.cameIn = G.veh.spec.id;
  G.swapCar('cart');
  return true;
}

/** Back into the car you came in, if you are next to it. */
export function swapBack(G, m, opts = {}) {
  const id = m && m.cameIn;
  if (!id || !G || !G.veh || !G.veh.spec || G.veh.spec.id !== 'cart') return false;
  if (!G.swapCar || !G.parked || !G.parked[id]) return false;
  const car = G.parked[id];
  const near = opts.near != null ? opts.near : 25;
  if (Math.hypot(G.veh.x - car.x, G.veh.z - car.z) > near) return false;
  m.cameIn = null;
  G.swapCar(id);
  if (opts.cartSpot && G.parked.cart) Object.assign(G.parked.cart, opts.cartSpot);
  return true;
}

/**
 * Into parked vehicle `id`, however far it is (plan v2 B-01a). swapBack's 25 m
 * limit is for a stage that wants you next to your bike; the end of a job is
 * not allowed to leave you in the cart because the truck is 300 m away.
 */
export function swapTo(G, id, opts = {}) {
  if (!id || !G || !G.veh || !G.veh.spec) return false;
  if (G.veh.spec.id === id) return true;
  if (typeof G.swapCar !== 'function' || !G.parked) return false;
  if (!G.parked[id]) {
    const s = opts.spot;
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) return false;
    G.parked[id] = { x: s.x, z: s.z, yaw: s.yaw || 0 };
  }
  G.swapCar(id);
  return !!(G.veh && G.veh.spec && G.veh.spec.id === id);
}
