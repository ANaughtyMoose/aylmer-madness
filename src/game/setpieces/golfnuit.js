// Mission 6: « N'importe quelle petite clé ».
//
// Summer 2004, night, Club de Golf Gatineau on rue du Golf. Tom's account
// (6 Oct 2026): "Sayyad started it, drove it around with Tom, the owners of the
// course came out and chased us, we had a brief high-speed golf cart chase,
// went back to our bikes, then biked away and hopped a fence." The stages are
// those beats, in that order:
//
//   velo     the bikes come out of the truck (skipped if you came on a bike)
//   keys     to the carts at the first tee; E hands Sayyad a key, three times.
//            Sayyad starts it (his theory: any small key starts a golf cart)
//   sayyad   Sayyad drives the first stretch; Tom holds on (scripted, ~12 s)
//   cp1..3   Tom's turn: the joyride down the west fairway, a kicker per flag
//   chase1..4  the clubhouse lights, the owners in their own cart with
//            flashlights, French, behind you. One clock across four flags and
//            the run back to the bikes; a near-catch costs seconds, never the job
//   bikes    ditch the cart next to the bikes, E
//   fence    pedal to the fence on the rue du Golf side, Espace to hop it
//
// No injury, no damage: the cart is left where it stops, keys in it. The truck
// waits in the club lot until the morning.
//
// The cart swap is golfjob.js's old contract, via cartkit.js: what you came in
// stays parked where you left it. Plan v2 B-01a (13 Oct panel, fix 1 for all
// five reviewers): cleanup used to put you back on your bike only if you were
// within 25 m of it, so a fail out on the course left you in the 24 km/h cart
// for the rest of the summer. Now any end (finished, failed, abandoned, quit,
// or a retry window that runs out) puts you back in the vehicle you came in,
// however far it is, with a short fade and a narrator line. A job resumed
// past its first stage (a retry) puts the bike and the cart back under you.
import { PLACES } from '../places.js';
import { apronSpot } from '../save.js';
import { LIT_OPTS } from '../props.js';
import { MeshBuilder, rgb } from '../../core/mesh.js';
import { spawnRival, removeRival } from '../verbs.js';
import { QUIET_GOLF_NOTIFICATIONS } from '../mission-notifications.js';
import { ownVehicleId } from '../tow.js';

// bikes.js registers the two bicycles into CARS when it is imported, so it is
// loaded lazily, at the fence (the game has it loaded already; a Node test that
// never reaches the fence keeps CARS as it was).
let topUpLegs = null;
function loadLegs() {
  if (topUpLegs) return;
  import('../bikes.js').then((mod) => { topUpLegs = mod.topUpLegs || null; }).catch(() => {});
}
import {
  installRamps, removeRamps, chainStages, newAir, airStep, forgiveLanding,
  governorStep, inCart, swapIntoCart, swapBack, swapTo, KIT,
} from './cartkit.js';
import { ROYAL, newChase, chaseStep } from './royal_mech.js';
import { createRoyalFx } from './royal_fx.js';

// ---------------------------------------------------------------- tuning
export const GOLFNUIT = {
  keyWorks: 3,        // the third key is the one
  keyRadius: 10,      // m from the cart to hand Sayyad a key
  keyStopped: 5,      // km/h, you have to be stopped
  govKmh: 34,         // the governor Sayyad "fixed": cart top speed
  sayyadKmh: 26,      // Sayyad's lap: how fast he drives the first stretch
  sayyadTurn: 1.8,    // rad/s he can swing the nose
  sayyadMax: 25,      // s: if the scripted drive is stuck, hand over anyway
  rampLen: 2.6,       // m of kicker
  rampH: 1.1,         // m lip height: slope 0.85 at the lip, ~1.3 s of air at 24 km/h, ~1.7 s at 34
  rampBefore: 15,     // m from the lip to the checkpoint centre (you land in the flag)
  cpRadius: 11,       // m
  // s for the whole chase, four flags and the bikes: 476 m of flags plus 172 m of
  // grass to the bikes, at 29 km/h (the bot pinned at the governor, ramps and
  // all) is 81 s, + 4 s to stop and E = 85 s; (85 + 3) x 1.35 = 120 s (s1-timers,
  // tools/timers.md). It was 100 s: 0 passes in 7 Ranger-valid packs.
  chaseTime: 120,
  catchPenalty: 6,    // s off the clock for a near-catch. Never an instant fail
  ownersKmh: 27,      // the owners' cart: theirs has a governor nobody fixed
  ownersBack: 45,     // m behind you when they show up
  ownersEvery: 6.5,   // s between the owners' yells
  jumpPay: 2,         // $ per jump (joyride money, no base pay)
  jumpPayMax: 16,
  near: 25,           // m: close enough to the bike to swap back on cleanup
  bikeRadius: 9,      // m: the bikes stage
  fenceVy: 5.2,       // m/s: the least a hop at the fence is given (~1.4 m of air)
  fenceVyMax: 6.4,    // m/s: and the most, for a slow rider far out
  fenceMinKmh: 18,    // km/h: a hop slower than this is carried over at this speed
  fenceBoostFrom: 9,  // m: a hop this close to the fence gets the boost
  fenceH: 1.1,        // m: the drawn fence
  lightAlong: [-16, -8, 0, 8, 16], // m along each clubhouse facade: lit-window sets
  apronBack: 24,      // m from the clubhouse centre to the cart's home spot. save.js's
                      // default (12) is inside the clubhouse footprint, and
                      // swapCar's settleSpawn then threw the cart 180 m onto a road.
};

// The course. Checked against mapdata (tools/smoke_sp_golfnuit.mjs): every
// flag and every ramp is dry and clear of buildings. COURSE is the loop down
// the west fairway, round the bottom and up the east side.
export const COURSE = [
  { x: 1330, z: -1400 },
  { x: 1330, z: -1520 },
  { x: 1335, z: -1640 },
  { x: 1330, z: -1765 },
  { x: 1410, z: -1790 },
  { x: 1480, z: -1690 },
  { x: 1470, z: -1560 },
  { x: 1480, z: -1420 },
];
// The first tee, east of the clubhouse: the carts, and where the bikes stay.
export const TEE = { x: 1318, z: -1362, yaw: Math.PI };
// Sayyad's stretch, from the tee to the top of the west fairway.
export const SAYYAD_PATH = [
  { x: 1324, z: -1395 },
  { x: 1330, z: -1440 },
  { x: 1331, z: -1468 },
];
export const JOYRIDE = COURSE.slice(1, 4);          // Tom's turn: three flags
export const CHASE = COURSE.slice(4);               // the owners: four flags, then the bikes
// The fence on the rue du Golf side, north of the tee. It runs east-west
// (along x); you cross it going north (+z), and the street is on the far side.
export const FENCE = { x: 1372, z: -1262, len: 24 };

const START = () => apronSpot(PLACES.golf, GOLFNUIT.apronBack);
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const isBike = (G) => !!(G && G.veh && G.veh.spec && G.veh.spec.twoWheel);

/** A cart parked inside a building (the old default apron) goes back on the asphalt. */
export function freeCart(G) {
  const c = G && G.parked && G.parked.cart, w = G && G.world;
  if (!c || !w || !w.buildingAt || !w.buildingAt(c.x, c.z, 0.6)) return false;
  Object.assign(c, START());
  return true;
}

/**
 * Where the bike comes out of the truck: beside it, behind it or in front, the
 * first of those that is clear of walls and parked cars (the lot is tight
 * against the clubhouse), facing away from the nearest wall.
 */
export function bikeOut(G, v) {
  const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw), fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  const tries = [[rx * 2.6, rz * 2.6, 0], [-rx * 2.6, -rz * 2.6, 0], [-fx * 5, -fz * 5, Math.PI], [fx * 5, fz * 5, 0]];
  const w = G && G.world;
  const busy = (x, z) => Object.entries((G && G.parked) || {}).some(([id, p]) => id !== 'dbike' && p && Math.hypot(p.x - x, p.z - z) < 2.2);
  for (const [dx, dz, turn] of tries) {
    const x = v.x + dx, z = v.z + dz;
    if (w && w.buildingAt && (w.buildingAt(x, z, 1.2) || w.buildingAt(x + fx * 2, z + fz * 2, 0.5))) continue;
    if (busy(x, z)) continue;
    return { x, z, yaw: v.yaw + turn };
  }
  return { x: v.x + rx * 2.6, z: v.z + rz * 2.6, yaw: v.yaw };
}

/** One ramp per flag, on the line in from the previous one, lip rampBefore short of it. */
export function courseRamps(course = JOYRIDE, from = SAYYAD_PATH[SAYYAD_PATH.length - 1], k = GOLFNUIT) {
  const out = [];
  let px = from.x, pz = from.z;
  for (const p of course) {
    const dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(dx, dz);
    const back = Math.min(k.rampBefore, d * 0.4);
    out.push({ x: p.x - (dx / d) * back, z: p.z - (dz / d) * back, yaw, len: k.rampLen, height: k.rampH });
    px = p.x; pz = p.z;
  }
  return out;
}
/** Every kicker of the night: the joyride's, then the chase's. */
export const allRamps = () => [
  ...courseRamps(JOYRIDE, SAYYAD_PATH[SAYYAD_PATH.length - 1]),
  ...courseRamps(CHASE, JOYRIDE[JOYRIDE.length - 1]),
];

// ---------------------------------------------------------------- the keys

const KEYS = [
  { name: 'la clé du cadenas de vélo', say: 'No? Okay okay okay. Next one, next one.' },
  { name: 'la clé de la boîte aux lettres', say: 'Almost! I felt something. Give me another.' },
  { name: 'la petite clé du coffre à gants', say: 'HA! Told you! Any small key! Get in!' },
];

export function newKeys() { return { tries: 0, works: false }; }

/**
 * Pure: try the next key. Returns { state, result, key } with result 'fail',
 * 'works', or 'already' once it has worked.
 */
export function tryKey(state, works = GOLFNUIT.keyWorks) {
  if (state.works) return { state, result: 'already', key: null };
  const tries = state.tries + 1;
  const ok = tries >= works;
  const key = KEYS[Math.min(tries, KEYS.length) - 1];
  return { state: { tries, works: ok }, result: ok ? 'works' : 'fail', key };
}

// ---------------------------------------------------------------- who says what

// Sayyad, in English (the friends speak English; ledger 28 Sept and 6 Oct).
// Fast, polite with anyone older, even the people chasing him. « Science! »
// is Russell's (royal.js) and « Trust me » is nobody's: the tics stay apart.
export const SAYYAD = {
  bikes: 'Bikes. The truck is loud. Bikes are ninjas.',
  theory: 'Any small key starts a golf cart. Any. I’m serious.',
  drive: 'I’m driving first. My theory, my lap.',
  hold: 'Hold the roof, Tom. Hold the roof!',
  handover: 'Okay, your turn. I need both hands to talk.',
  lights: 'Lights. LIGHTS. Somebody’s up. Go go go!',
  owners: 'Flashlights! They have a cart too!',
  sorry: 'Sorry, sir! So sorry! Have a good night!',
  ditch: 'Leave it! Leave the cart! Bikes, bikes, bikes!',
  fence: 'The fence! Jump it, Tom! JUMP!',
  safe: 'Any small key. Write that down somewhere.',
};
export const SAY_JUMP = [
  'WOOO! Four wheels off!',
  'Again! Do that one faster!',
  'This thing is basically a Cessna.',
  'The governor was me. You’re welcome.',
  'I’m gonna be sick. Again!',
];
// The owners, in Quebec French (everyone but the gang speaks French).
// Glosses: Hey! You lot! Stop that right now! / That's our cart! Get back
// here! / I see you, you little rascals! / Turn on your lights, at least!
export const OWNERS_WHO = 'Le proprio';
export const OWNERS_LINES = [
  'Heille! Vous autres! Arrêtez ça tout de suite!',
  'C’est notre cart, ça! Revenez icitte!',
  'J’vous vois, mes p’tits snoreaux!',
  'Allumez vos lumières, au moins!',
];
// Near-catch: I almost had him! Step on it!
export const OWNERS_CLOSE = 'Je l’avais presque! Pèse dessus!';
// At the cart, too late: And don't come back!
export const OWNERS_LAST = 'Pis revenez pas!';

// urgent: drop his queued lines first (story lines play one at a time, 2.5-5 s
// each), so a jump yell or the lights line is not heard 10 s late.
function say(G, text, ms = 2600, urgent = false, who = 'Sayyad') {
  if (urgent && G && G.heckle && G.heckle.cancel) G.heckle.cancel('golfnuit');
  if (G && G.heckle && G.heckle.line) G.heckle.line(who, text, ms, { group: 'golfnuit' });
  else if (G && G.hud) G.hud.toast(`${who}: ${text}`, ms);
}

// ---------------------------------------------------------------- the clubhouse lights

/**
 * The lit-window prop is house-sized and was placed at the clubhouse centroid,
 * i.e. inside the building, so nothing showed. Walk out from the centroid to the
 * facade on the street side and the course side, and hang a few sets along each.
 * Both orientations are added: the one facing inward is hidden by the wall.
 */
export function lightSpots(world, p = PLACES.golf, k = GOLFNUIT) {
  const bx = p.bx ?? p.x, bz = p.bz ?? p.z;
  const out = [];
  if (!world || !world.buildingAt) return out;
  let dx = p.x - bx, dz = p.z - bz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  for (const sg of [1, -1]) {
    const ox = dx * sg, oz = dz * sg, sx = -oz, sz = ox, yaw = Math.atan2(ox, oz);
    for (const a of k.lightAlong) {
      const cx = bx + sx * a, cz = bz + sz * a;
      if (!world.buildingAt(cx, cz, 0)) continue;
      let d = 0;
      while (d < 80 && world.buildingAt(cx + ox * d, cz + oz * d, 0)) d += 0.5;
      if (d >= 80) continue;
      const fx = cx + ox * (d + 0.25), fz = cz + oz * (d + 0.25);
      out.push({ x: fx, z: fz, yaw }, { x: fx, z: fz, yaw: yaw + Math.PI });
    }
  }
  return out;
}

function lightsOn(G) {
  if (!G || !G.props || !G.props.add) return 0;
  if (G.props.meshes && !G.props.meshes.litwin) return 0;
  const spots = lightSpots(G.world);
  spots.forEach((q, i) => G.props.add({
    id: `golfnuit:lights${i}`, mesh: 'litwin', x: q.x, z: q.z, yaw: q.yaw,
    y: G.phys && G.phys.groundY ? G.phys.groundY(q.x, q.z) : 0, opts: LIT_OPTS, far: 900,
  }));
  return spots.length;
}

// ---------------------------------------------------------------- the fence

/** A galvanised wire fence along local X, centred, posts every 3 m. */
export function buildFenceMesh(len = FENCE.len, h = GOLFNUIT.fenceH) {
  const b = new MeshBuilder();
  const post = rgb(0x9aa0a6), wire = rgb(0xc9ced2);
  const n = Math.max(2, Math.round(len / 3));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len * i) / n;
    b.box(x, h / 2, 0, 0.07, h, 0.07, post);
  }
  b.box(0, h, 0, len, 0.05, 0.05, post);
  for (const y of [0.3, 0.55, 0.8]) b.box(0, y, 0, len, 0.02, 0.02, wire);
  return b;
}

function fenceUp(G, m) {
  if (m.fence || !G || !G.props || !G.renderer || !G.renderer.upload) return;
  try {
    const mesh = G.renderer.upload(buildFenceMesh());
    const y = G.phys && G.phys.groundY ? G.phys.groundY(FENCE.x, FENCE.z) : 0;
    G.props.add({ id: 'golfnuit:fence', mesh, x: FENCE.x, y, z: FENCE.z, yaw: 0, far: 600 });
    m.fence = mesh;
  } catch (e) { m.fence = null; }
}

function fenceDown(G, m) {
  if (G && G.props && G.props.remove) { try { G.props.remove('golfnuit:fence'); } catch (e) { /* gone */ } }
  if (m && m.fence && G && G.renderer && G.renderer.free) { try { G.renderer.free(m.fence); } catch (e) { /* gone */ } }
  if (m) m.fence = null;
}

/**
 * Pure: one tick at the fence. `s` is { prev, boosted, over }, `v` the bike
 * ({ x, z, vy, inAir, speedKmh }). Returns { s, boost, carry, bounce, done }:
 * boost is the vy that carries a hop over the wire (enough air to cover the
 * distance left plus a bike length, at your speed), carry the forward speed
 * (m/s) a slow hop is given, bounce means you rode into the wire, done that
 * you are over and back on the ground.
 */
export function fenceStep(s, v, f = FENCE, k = GOLFNUIT) {
  const o = { ...s };
  const side = v.z - f.z;                       // < 0: still on the course
  const along = Math.abs(v.x - f.x) <= f.len / 2 + 0.5;
  let boost = null, carry = null, bounce = false;
  if (!o.boosted && v.inAir && v.vy > 0 && side < 0 && side > -k.fenceBoostFrom && along) {
    o.boosted = true;
    const kmh = Math.max(k.fenceMinKmh, v.speedKmh || 0);
    if ((v.speedKmh || 0) < k.fenceMinKmh) carry = kmh / 3.6;
    const t = (-side + 1.8) / (kmh / 3.6);             // seconds of air it needs
    boost = Math.min(k.fenceVyMax, Math.max(v.vy, k.fenceVy, (9.81 * t) / 2));
  }
  if (o.prev != null && o.prev < 0 && side >= 0 && along) {
    if (v.inAir && o.boosted) o.over = true;
    else bounce = true;
  }
  o.prev = bounce ? -1 : side;
  if (!v.inAir && side < -k.fenceBoostFrom) o.boosted = false;   // a hop too early: try again
  return { s: o, boost, carry, bounce, done: !!o.over && !v.inAir };
}

// ---------------------------------------------------------------- the owners

function ownersOut(G, m) {
  if (m.owners || !G || !G.phys || !G.veh) return;
  const v = G.veh;
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  const x = v.x - fx * GOLFNUIT.ownersBack, z = v.z - fz * GOLFNUIT.ownersBack;
  try {
    m.owners = spawnRival(G, 'cart', {
      name: 'Les proprios', x, z, yaw: v.yaw,
      path: [[x, z], ...CHASE.map((c) => [c.x, c.z]), [TEE.x, TEE.z]],
      active: true, cruise: GOLFNUIT.ownersKmh / 3.6,
    });
  } catch (e) { m.owners = null; }
}

function ownersGone(G, m) {
  if (m && m.owners) { try { removeRival(G, m.owners); } catch (e) { /* gone */ } m.owners = null; }
}

// The gap is the score (royal_mech's chaseStep, with the owners' numbers); the
// cart behind you is there so you can see it.
export const CHASE_K = { ...ROYAL, marshalKmh: 28, marshalGap0: 35, marshalGapMax: 55, marshalCatchBack: 20 };

// ---------------------------------------------------------------- clean-up

// Narrator French (hard rule 1).
export const BACK_LINE = {
  ranger: 'Tu reprends ton Ranger au stationnement du Club.',
  car: 'Tu reprends ton char au stationnement du Club.',
  bike: 'Tu reprends ton vélo au premier tertre.',
  morning: 'Le lendemain matin, tu reprends ton Ranger au stationnement du Club.',
};
// Where the truck goes if it is somehow not parked any more: the club lot,
// beside the cart's apron spot. Never 299 Fraser, so nose-in is not in play.
const LOT = () => apronSpot(PLACES.golf, GOLFNUIT.apronBack, 6);

// A short fade from black, so the swap back is not a pop. Browser only.
function fadeIn(ms = 700) {
  if (typeof document === 'undefined' || !document.createElement || !document.body) return;
  try {
    let el = document.getElementById('golfnuit-fade');
    if (!el) {
      el = document.createElement('div');
      el.id = 'golfnuit-fade';
      el.style.cssText = 'position:fixed;inset:0;background:#000;pointer-events:none;z-index:30;opacity:0.9';
      document.body.appendChild(el);
    }
    el.style.transition = 'none'; el.style.opacity = '0.9';
    void el.offsetWidth;
    el.style.transition = `opacity ${ms}ms ease-out`; el.style.opacity = '0';
    setTimeout(() => { try { el.remove(); } catch (e) { /* gone */ } }, ms + 100);
  } catch (e) { /* no fade, no harm */ }
}

/**
 * Back in the vehicle you came in, wherever it is (B-01a). Returns the id you
 * are in afterwards, or null when there was no G.veh.
 */
export function backToCameIn(G, m) {
  if (!G || !G.veh || !G.veh.spec) return null;
  let came = (m && (m.came || m.truck)) || ownVehicleId(G);
  if (came === 'cart') came = ownVehicleId(G);
  const was = G.veh.spec.id;
  if (was !== came) swapTo(G, came, { spot: LOT() });
  const now = G.veh && G.veh.spec ? G.veh.spec.id : null;
  // The bike goes back where it was before the night (it rode in the truck).
  if (m && m.bikeHome !== undefined && now !== 'dbike' && G.parked && G.parked.dbike) {
    if (m.bikeHome) G.parked.dbike = { ...m.bikeHome };
    else G.parked.dbike = bikeOut(G, G.parked[came] || G.veh);
  }
  if (now === came && was !== came) {
    fadeIn();
    const bike = !!(G.veh.spec.twoWheel);
    const line = bike ? BACK_LINE.bike
      : came !== 'ranger' ? BACK_LINE.car
        : (m && m.fenceS && m.fenceS.over ? BACK_LINE.morning : BACK_LINE.ranger);
    if (G.hud && G.hud.toast) G.hud.toast(line, 3200);
  }
  return now;
}

function tearDown(G, m) {
  if (!m) return;
  removeRamps(G, m.ramps);
  m.ramps = null;
  if (G && G.props && G.props.removePrefix) G.props.removePrefix('golfnuit:');
  fenceDown(G, m);
  ownersGone(G, m);
  if (m.fx) { m.fx.destroy(); m.fx = null; }
  backToCameIn(G, m);
  // The cart goes back to its spot by the clubhouse unless you are still in it.
  if (G && G.parked && G.parked.cart && !inCart(G)) Object.assign(G.parked.cart, START());
  if (G) G.__golfnuitCar = null;
}

// A job resumed past its first stage (the free retry, a loaded save) starts in
// whatever tearDown left you in: the truck, at the club lot. Put the rig the
// stage needs back under you. `need` is 'bike' or 'cart'; `spot` is where the
// cart (or, for 'bike', the bike) goes. Does nothing on a normal run, where the
// first stage has set m.came.
export function noteCame(G, m) {
  if (m && m.came === undefined && G && G.veh && G.veh.spec) m.came = inCart(G) ? ownVehicleId(G) : G.veh.spec.id;
}
const BIKES_AT = () => ({ x: TEE.x + 2.4, z: TEE.z, yaw: TEE.yaw });
export function ensureRig(G, m, need, spot) {
  if (!G || !m || !G.veh || !G.veh.spec || typeof G.swapCar !== 'function' || !G.parked) return false;
  if (m.came === undefined) { noteCame(G, m); m.resumed = true; }
  if (!m.resumed) return false;
  if (need === 'bike' && isBike(G)) return false;
  if (need === 'cart' && inCart(G)) {
    // Resumed already in the cart: the bikes stage still needs a bike to come back to.
    if (!m.cameIn) { m.cameIn = 'dbike'; if (!G.parked.dbike) G.parked.dbike = BIKES_AT(); }
    return false;
  }
  if (!isBike(G) && !inCart(G)) {
    m.truck = m.truck || G.veh.spec.id;
    if (m.bikeHome === undefined) m.bikeHome = G.parked.dbike ? { ...G.parked.dbike } : null;
    G.parked.dbike = need === 'bike' && spot ? { ...spot } : BIKES_AT();
    G.swapCar('dbike');
  }
  if (need === 'cart' && isBike(G)) {
    const c = spot || TEE;
    G.parked.cart = { x: c.x, z: c.z, yaw: c.yaw || 0 };
    swapIntoCart(G, m, c);
    if (m.cameIn && G.parked[m.cameIn]) G.parked[m.cameIn] = BIKES_AT();
    G.__golfnuitCar = m.cameIn || null;
    if (G.veh) G.veh.passengers = 1;
  }
  return true;
}
// Where a resumed cart stage puts the cart: the flag before, facing this one.
const fromTo = (a, b) => ({ x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) });

// Every cart tick: the air counter, the governor, and the landing refund.
function runTick(G, m) {
  const v = G.veh;
  if (!v || !inCart(G)) return null;
  if (!m.air) m.air = newAir();
  const seen = m.air.t || 0;        // longest airT seen in this flight
  const r = airStep(m.air, v, 1 / 60);
  m.air = r.state;
  // cartkit's airStep scores a landing with v.lastAir, which cars.js leaves
  // stale after a sub-0.05 s hop: every turf bump after a real jump counted
  // as another jump (33 on one fairway in the browser). Trust only what we saw.
  if (r.landed && r.landed.jump && seen < KIT.minAir) {
    m.air.jumps -= 1; m.air.total -= r.landed.air;
    r.landed = { air: seen, jump: false };
  }
  forgiveLanding(m.air, v);
  if (r.landed && r.landed.jump && !m.quiet) {
    const n = m.air.jumps;
    say(G, SAY_JUMP[(n - 1) % SAY_JUMP.length], 2000, true);
  }
  governorStep(v, m.dt || 1 / 60, GOLFNUIT.govKmh);
  return null;
}

export function jumpBonus(jumps, k = GOLFNUIT) {
  return Math.min(k.jumpPayMax, Math.max(0, jumps | 0) * k.jumpPay);
}

/**
 * Sayyad at the wheel: steer the cart along `path` at `kmh`, overriding the
 * pedals. Runs after the physics step, so the pose it sets is what is drawn and
 * what the next step integrates. Returns true at the end of the path.
 */
export function sayyadSteer(v, m, dt, path = SAYYAD_PATH, k = GOLFNUIT) {
  if (!v) return false;
  let i = m.sp | 0;
  while (i < path.length && d2(v, path[i]) < 6) i++;
  m.sp = i;
  if (i >= path.length) {
    v.vx = 0; v.vz = 0; v.vLong = 0; v.vLat = 0; v.steer = 0; v.yawRate = 0;
    return true;
  }
  const p = path[i];
  const want = Math.atan2(p.x - v.x, p.z - v.z);
  const e = wrapA(want - v.yaw), turn = k.sayyadTurn * dt;
  v.yaw += Math.max(-turn, Math.min(turn, e));
  m.spd = Math.min(k.sayyadKmh / 3.6, (m.spd || 0) + 5 * dt);
  v.vx = Math.sin(v.yaw) * m.spd; v.vz = Math.cos(v.yaw) * m.spd;
  v.vLong = m.spd; v.vLat = 0; v.steer = 0; v.yawRate = 0;
  return false;
}

// ---------------------------------------------------------------- the mission

export const golfnuit = {
  id: 'golfcart',
  notificationPolicy: QUIET_GOLF_NOTIFICATIONS,
  title: 'N’importe quelle petite clé',
  brief: 'Minuit au Club de golf. Sayyad a une théorie sur les carts pis les clés. Vous êtes venus en vélo, pour être discrets.',
  giver: 'golf',
  timeOfDay: 'night',

  cleanup(G, m) { tearDown(G, m); },

  build(ctx) {
    const stages = [];
    const k = GOLFNUIT;
    const onBike = !!(ctx && ctx.carId && /bike|cruiser/.test(ctx.carId));
    const wrong = (G) => (inCart(G) ? null : 'Sayyad: « Not the bike, man. The CART. »');
    const tick = (G, m, st, dt) => { m.dt = dt; return runTick(G, m); };
    const setup = (G, m) => {
      if (!m.ramps) m.ramps = installRamps(G, allRamps(), { prefix: 'golfnuit:ramp' });
      if (!m.air) m.air = newAir();
    };
    const cartSpot = (G) => (G && G.parked && G.parked.cart) || TEE;
    const bikeSpot = (G, m) => (G && m && G.parked && G.parked[m.cameIn]) || TEE;

    // ---- 1. the bikes come out of the truck ------------------------------
    if (!onBike) {
      const box = ctx && ctx.carId === 'ranger' ? 'la boîte du truck' : 'le char';
      stages.push({
        kind: 'velo',
        text: 'Sors les vélos',
        sub: `Arrête-toi, pis E pour sortir les vélos de ${box}.`,
        hint: 'Le char reste au stationnement du club. Arrêté, E.',
        at: 'golf', radius: 30, hold: true,
        holdText: 'E : sortir les vélos',
        onEnter(G, m) { noteCame(G, m); say(G, SAYYAD.bikes, 2800); },
        onExit(G, m) {
          if (!G || !G.veh || !G.parked || !G.swapCar) return;
          const v = G.veh;
          m.truck = v.spec && v.spec.id;
          if (m.bikeHome === undefined) m.bikeHome = G.parked.dbike ? { ...G.parked.dbike } : null;
          G.parked.dbike = bikeOut(G, v);
          G.swapCar('dbike');
        },
        toast: 'Le truck reste au stationnement. Sayyad trouve que c’est plus discret.',
      });
    }

    // ---- 2. the keys: Sayyad starts it -----------------------------------
    stages.push({
      kind: 'keys',
      text: 'Les carts, au premier tertre',
      sub: 'Roule jusqu’au cart, arrête-toi à côté, pis E pour passer une clé à Sayyad.',
      hint: 'Le cart est stationné au premier tertre, à l’est du chalet. Collé dessus, arrêté, E.',
      at: (G) => cartSpot(G), radius: k.keyRadius,
      // Only onTick finishes this stage: the third key.
      condition: () => false,
      onEnter(G, m) {
        if (onBike) noteCame(G, m);
        else ensureRig(G, m, 'bike', BIKES_AT());
        m.keys = newKeys();
        if (G && G.parked) {
          if (m.cartHome === undefined) m.cartHome = G.parked.cart ? { ...G.parked.cart } : null;
          G.parked.cart = { ...TEE };
        }
        if (m) m.target = { x: TEE.x, z: TEE.z, r: k.keyRadius };
        setup(G, m);
        say(G, SAYYAD.theory, 3000);
      },
      prompt(G, m) {
        const v = G.veh, c = cartSpot(G);
        if (!v || Math.hypot(v.x - c.x, v.z - c.z) > k.keyRadius) return null;
        if (v.speedKmh > k.keyStopped) return 'Arrête-toi à côté du cart';
        return `E : passer une clé à Sayyad (${(m.keys ? m.keys.tries : 0) + 1}/3)`;
      },
      onTick(G, m) {
        const v = G.veh, c = cartSpot(G);
        if (!v || !G.wantStart) return null;
        if (Math.hypot(v.x - c.x, v.z - c.z) > k.keyRadius || v.speedKmh > k.keyStopped) return null;
        G.wantStart = false;
        const r = tryKey(m.keys || newKeys());
        m.keys = r.state;
        if (r.key) {
          if (G.hud) G.hud.toast(r.result === 'works' ? `Sayyad essaie ${r.key.name}... le cart part!` : `Sayyad essaie ${r.key.name} : rien.`, 1800);
          say(G, r.key.say, 2400);
        }
        if (r.result === 'works') {
          swapIntoCart(G, m, TEE);
          G.__golfnuitCar = m.cameIn || null;
          if (G.veh) G.veh.passengers = 1;
          return 'done';
        }
        return null;
      },
      toast: 'Sayyad tasse le governor avec la même clé, pis prend le volant.',
    });

    // ---- 3. Sayyad drives first ------------------------------------------
    const last = SAYYAD_PATH[SAYYAD_PATH.length - 1];
    stages.push({
      kind: 'sayyad',
      text: 'Sayyad conduit',
      sub: 'Tiens-toi après le toit. Pas besoin de W : c’est Sayyad qui chauffe.',
      hint: 'C’est son tour. Le tien s’en vient.',
      at: { x: last.x, z: last.z }, radius: 8,
      condition: () => false,
      onEnter(G, m) {
        ensureRig(G, m, 'cart', TEE);
        m.sp = 0; m.spd = 0; m.quiet = true;
        say(G, SAYYAD.drive, 2400);
        say(G, SAYYAD.hold, 2200);
      },
      onTick(G, m, st, dt) {
        const v = G.veh;
        if (!v || !inCart(G)) return null;
        if (m.air) { const r = airStep(m.air, v, dt); m.air = r.state; forgiveLanding(m.air, v); }
        const end = sayyadSteer(v, m, dt) || (m.stageTime || 0) > k.sayyadMax;
        return end ? 'done' : null;
      },
      onExit(G, m) { m.quiet = false; say(G, SAYYAD.handover, 2600, true); },
      toast: 'Sayyad freine sec, pis te laisse le volant.',
    });

    // ---- 4. Tom's turn: the joyride --------------------------------------
    const joy = chainStages(JOYRIDE, {
      label: 'Drapeau',
      sub: 'À ton tour. W à fond sur les tremplins, A/D pour viser, suis les drapeaux.',
      hint: 'Les tremplins sont dans l’axe du prochain drapeau. Arrive droit, W au plancher.',
      radius: k.cpRadius,
      condition: (G) => inCart(G),
      prompt: wrong,
      onTick: tick,
      onEnter: (G, m, st, i) => {
        const prev = i > 0 ? JOYRIDE[i - 1] : SAYYAD_PATH[SAYYAD_PATH.length - 1];
        ensureRig(G, m, 'cart', fromTo(prev, JOYRIDE[i]));
        setup(G, m);
      },
    });
    joy[joy.length - 1].toast = 'Les lumières du chalet viennent de s’allumer.';
    stages.push(...joy);

    // ---- 5. the owners: the chase ----------------------------------------
    const n = CHASE.length + 1;
    const chasePts = [...CHASE, { x: TEE.x, z: TEE.z, bikes: true }];
    chasePts.forEach((p, i) => {
      const toBikes = !!p.bikes;
      stages.push({
        kind: toBikes ? 'bikes' : 'chase' + (i + 1),
        text: toBikes ? 'Lâche le cart, saute sur ton vélo' : `Les proprios! Sauve-toi : drapeau ${i + 1}/${n - 1}`,
        sub: toBikes
          ? 'Retour aux vélos, à côté du chalet : coupe par le gazon jusqu’au pilier jaune. Arrête-toi à côté, E.'
          : 'W à fond, A/D, vise le pilier jaune du prochain drapeau. Shift pour regarder derrière.',
        hint: toBikes
          ? 'Les vélos sont là où t’as pris le cart, à côté du chalet. Tout droit par le gazon, pas par la rue. Arrêté, E.'
          : 'Arrive droit sur les tremplins. Ils vont moins vite que toi, si tu lèves pas le pied.',
        at: toBikes ? (G) => bikeSpot(G, G && G.mission) : { x: p.x, z: p.z },
        radius: toBikes ? k.bikeRadius : k.cpRadius,
        // s1-timers: no GPS line on the course. The road graph routed the
        // bikes leg out to rue du Golf and back (246 m by road for 172 m of
        // grass), which is what ate the clock in every Ranger pack.
        noRoute: true,
        time: k.chaseTime,
        hold: toBikes || undefined,
        stopped: toBikes ? 6 : undefined,
        holdText: toBikes ? 'E : lâcher le cart, prendre ton vélo' : undefined,
        failWhy: 'Les proprios t’ont pogné. Sayyad leur explique sa théorie des clés, très poliment.',
        condition: (G) => inCart(G),
        prompt: wrong,
        onEnter(G, m) {
          const prev = i > 0 ? chasePts[i - 1] : JOYRIDE[JOYRIDE.length - 1];
          const resumedHere = ensureRig(G, m, 'cart', fromTo(prev, p));
          if (resumedHere) setup(G, m);
          if (!m.fx) m.fx = createRoyalFx();
          if (i === 0 || (resumedHere && !m.owners)) {
            m.chase = newChase(CHASE_K);
            m.chaseLeft = null;
            m.yell = 0; m.yellI = 0;
            lightsOn(G);
            ownersOut(G, m);
            say(G, SAYYAD.lights, 2400, true);
            say(G, SAYYAD.owners, 2400);
            if (G && G.hud) G.hud.toast('Deux lampes de poche sortent du chalet, pis un cart.\nLes proprios.', 2800);
          } else if (m.chaseLeft != null) m.timeLeft = m.chaseLeft;   // one clock for the chase
          if (toBikes) {
            const b = bikeSpot(G, m);
            m.target = { x: b.x, z: b.z, r: k.bikeRadius };
            if (G) G.routeKey = '';
          }
          m.fx.tag(true);
          // Below the friends' bubbles, not on top of them (royal_fx puts it at 92 px).
          if (typeof document !== 'undefined' && document.getElementById) {
            const el = document.getElementById('royal-tag');
            if (el) el.style.top = '148px';
          }
        },
        onTick(G, m, st, dt) {
          tick(G, m, st, dt);
          const v = G.veh;
          if (!m.chase) m.chase = newChase(CHASE_K);
          if (v && inCart(G)) {
            m.chase = chaseStep(m.chase, dt, { speedKmh: v.speedKmh }, CHASE_K);
            if (m.chase.caught) {
              if (m.timeLeft != null) m.timeLeft = Math.max(1, m.timeLeft - k.catchPenalty);
              if (G.hud) G.hud.toast(`Les proprios t’ont presque pogné! -${k.catchPenalty} s`, 1800);
              say(G, OWNERS_CLOSE, 2200, true, OWNERS_WHO);
              say(G, SAYYAD.sorry, 2200);
            }
          }
          m.yell = (m.yell || 0) + dt;
          if (m.yell >= k.ownersEvery) {
            m.yell = 0;
            say(G, OWNERS_LINES[(m.yellI || 0) % OWNERS_LINES.length], 2600, false, OWNERS_WHO);
            m.yellI = (m.yellI || 0) + 1;
          }
          const o = m.owners;
          if (o && o.veh && v) {
            governorStep(o.veh, dt, k.ownersKmh);
            // Keep their cart roughly where the gap says they are: ease off
            // when close, and when they have dropped right out of it, put them
            // back on your tail (behind you, so off the screen).
            const dist = d2(v, o.veh);
            o.band = dist < m.chase.gap - 12 ? 0.6 : 1;
            m.ownT = (m.ownT || 0) + dt;
            if (m.ownT > 2 && dist > m.chase.gap + 20 && o.place && o.setPath) {
              m.ownT = 0;
              const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), g = Math.max(20, m.chase.gap);
              const x = v.x - fx * g, z = v.z - fz * g;
              try {
                o.place(x, z, v.yaw);
                o.setPath([[x, z], ...chasePts.slice(i).map((c) => [c.x, c.z])]);
                o.active = true;
              } catch (e) { /* leave them where they are */ }
            }
          }
          if (m.timeLeft != null) m.chaseLeft = m.timeLeft;
          if (m.fx) m.fx.tagText(`Les proprios : ${Math.round(m.chase.gap)} m derrière`);
          return null;
        },
        onExit(G, m) {
          if (!toBikes) return;
          if (m.fx) m.fx.tag(false);
          removeRamps(G, m.ramps); m.ramps = null;
          ownersGone(G, m);
          say(G, SAYYAD.ditch, 2200, true);
          if (G && G.__golfnuitCar) G.__golfnuitCar = null;
          swapBack(G, m, { near: k.near });
          // A cart left right on top of the bike would pin it: give it room.
          const c = G && G.parked && G.parked.cart, b = G && G.veh;
          if (c && b && isBike(G)) {
            const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz);
            if (d < 3.6) {
              const ux = d > 0.1 ? dx / d : -Math.sin(b.yaw), uz = d > 0.1 ? dz / d : -Math.cos(b.yaw);
              c.x = b.x + ux * 3.6; c.z = b.z + uz * 3.6;
            }
          }
          say(G, OWNERS_LAST, 2400, false, OWNERS_WHO);
        },
        toast: toBikes ? 'Le cart reste là, les clés dedans. Ils vont le retrouver.' : undefined,
      });
    });

    // ---- 6. bike away, hop the fence -------------------------------------
    stages.push({
      kind: 'fence',
      text: 'Saute la clôture : rue du Golf',
      sub: 'Pédale (W) vers la clôture, pis Espace juste avant pour sauter par-dessus.',
      hint: 'La clôture est au bout du gazon, côté rue du Golf. Arrive vite, Espace à quelques mètres.',
      at: { x: FENCE.x, z: FENCE.z }, radius: 6,
      condition: () => false,
      onEnter(G, m) {
        ensureRig(G, m, 'bike', { x: FENCE.x, z: FENCE.z - 24, yaw: 0 });
        m.fenceS = { prev: null, boosted: false, over: false }; loadLegs(); fenceUp(G, m); say(G, SAYYAD.fence, 2400);
      },
      prompt(G) {
        if (!isBike(G)) return 'Sayyad: « Bike! Get on your bike! »';
        const v = G.veh;
        return v && Math.abs(v.z - FENCE.z) < 12 && Math.abs(v.x - FENCE.x) < FENCE.len / 2 + 2 ? 'Espace : sauter la clôture' : null;
      },
      onTick(G, m, st) {
        const v = G.veh;
        if (!v || !isBike(G)) return null;
        // Adrenaline: whatever the sprint cost, there is a hop left at the fence.
        if (topUpLegs && Math.abs(v.z - FENCE.z) < 20 && Math.abs(v.x - FENCE.x) < FENCE.len) topUpLegs(0.6);
        const r = fenceStep(m.fenceS || { prev: null, boosted: false, over: false }, v);
        m.fenceS = r.s;
        if (r.boost != null) v.vy = r.boost;
        if (r.carry != null) { v.vx = Math.sin(v.yaw) * r.carry; v.vz = Math.cos(v.yaw) * r.carry; v.vLong = r.carry; }
        if (r.bounce) {
          v.z = FENCE.z - 1.2; v.vx = 0; v.vz = -0.5; v.vLong = 0; v.vLat = 0;
          if (G.hud) G.hud.toast('La clôture! Espace pour sauter.', 1600);
        }
        const n = m.air ? m.air.jumps : 0;
        st.money = jumpBonus(n);
        st.toast = 'Par-dessus. Rue du Golf, personne.\nLe truck? Tu reviendras le chercher demain matin, l’air de rien.'
          + (st.money ? `\nBonus de sauts : ${st.money} $` : '');
        return r.done ? 'done' : null;
      },
      onExit(G) { say(G, SAYYAD.safe, 2800); },
      toast: 'Par-dessus. Rue du Golf, personne.\nLe truck? Tu reviendras le chercher demain matin, l’air de rien.',
    });
    return stages;
  },
};
