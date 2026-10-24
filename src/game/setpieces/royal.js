// Mission 9, « 5 h 45 au Royal Ottawa ». Two jobs, two save ids:
//
//   school        Tom wakes up at 5 h 32. The shift at the Royal Ottawa starts
//                 at 5 h 45. One timed drive east on the chemin d'Aylmer.
//   russellroyal  Russell (English, aggressive with golf carts) gets fired over
//                 the golf carts. All of it is real (ledger, 28 Sept): the big
//                 chase, the handbrake down the big hill, weed-whacker string on
//                 the bumper, a golf ball in the exhaust, fairway skiing in Vans
//                 behind the cart with the sand-trap rake. Then you drive him
//                 home and he explains, in English, why none of it was his fault.
//
// russellroyal stages:
//   pickup (your car, E) -> chase1..chase6 (cart, one clock, the marshal behind)
//   -> hill (Espace down the big hill) -> string (stop, E x5) -> launch (E, W)
//   -> ski (carve points on the rope) -> back to your car (E) -> home (E)
//
// The cart swap is golfnuit's contract through cartkit.js: the car you came in
// stays parked at the club, cleanup puts you back in it if you are next to it,
// and the club cart goes back to its own apron (G.parked.cart as it was).
// Mechanics are pure functions in royal_mech.js; the overlays in royal_fx.js.
import {
  installRamps, removeRamps, newAir, airStep, forgiveLanding,
  governorStep, inCart, swapIntoCart, swapBack, rampAt,
} from './cartkit.js';
import {
  ROYAL, newChase, chaseStep, newHill, hillStep, newString, stringStep,
  newLaunch, launchStep, hillAssist, newSki, skiStep, newRant, rantStep, RANT,
} from './royal_mech.js';
import { createRoyalFx } from './royal_fx.js';
import { spawnRival, removeRival } from '../verbs.js';
import { fillBar } from '../missionkit.js';
import { vehicleRole } from '../garage.js';

// A cart, any bike, or a loaner: no seat for Russell (B-01b).
export function strandedIn(G) {
  const v = G && G.veh, s = v && v.spec;
  if (!s) return false;
  if (s.twoWheel || s.style === 'bike') return true;   // even your own: Russell needs a seat
  const role = vehicleRole(s, { character: G.character || (G.garage && G.garage.character), garage: G.garage || null, veh: v });
  return role === 'cart' || role === 'bike' || role === 'loaner';
}

// ---------------------------------------------------------------- the course
// Royal Ottawa Golf Club, the open fairways between the clubhouse and the wood
// line (tools/smoke_sp_royal.mjs checks every point against mapdata: inside the
// club's polygon, dry, out of the woods, clear of buildings).
export const CART_SPOT = { x: 5360, z: -2528, yaw: -Math.PI / 2 };   // the cart you take, by the lot
export const RUSSELL_SPOT = { x: 5350, z: -2542, yaw: -Math.PI / 2 };
export const CHASE = [
  { x: 5250, z: -2650 },
  { x: 5200, z: -2780 },
  { x: 5050, z: -2850 },
  { x: 4900, z: -2820 },
  { x: 4980, z: -2690 },
  { x: 5260, z: -2400 },   // east of the big hill: the climb starts here
];
// The big hill is a runtime slope (a cartkit ramp, driven backwards): you climb
// the gentle back face from the east, crest at the lip, and go down the steep
// quadratic face to the west. Crest at x = 5150, foot at 5150 - len.
export const HILL = { x: 5150, z: -2330, yaw: Math.PI / 2, len: 56, height: 9, back: 50, width: 36 };
export const HILL_DOWN = { x: -Math.sin(HILL.yaw), z: -Math.cos(HILL.yaw) };   // the fall line
export const HILL_TOP = { x: 5170, z: -2330 };
export const HILL_BOTTOM = { x: 5060, z: -2330 };
// The golf-ball pad faces west at a big kicker.
export const LAUNCH_PAD = { x: 5015, z: -2330 };
export const LAUNCH_RAMP = { x: 4975, z: -2330, yaw: -Math.PI / 2, len: 3.2, height: 1.4, width: 7 };
// Fairway skiing, down the west fairway, with two little kickers on it.
export const SKI_ZONE = { x: 4950, z: -2560 };
export const SKI_RAMPS = [
  { x: 4940, z: -2470, yaw: Math.PI, len: 2.6, height: 0.9, width: 5 },
  { x: 4960, z: -2640, yaw: Math.PI, len: 2.6, height: 0.9, width: 5 },
];
export const K = {
  cpRadius: 12,        // m, chase flags
  govKmh: 34,          // your cart, governor « adjusted » by Russell
  rampLen: 2.6, rampH: 1.1, rampBefore: 15,   // chase kickers (golfnuit's numbers)
  topR: 12, bottomR: 16, padR: 10,
  near: 25,            // m from your car to swap back
  gas: 15,             // what Russell pays for the gas (the gas was more)
};

/** One kicker per chase flag, on the line in, lip rampBefore short of it. */
export function chaseRamps(course = CHASE, from = CART_SPOT, k = K) {
  const out = [];
  let px = from.x, pz = from.z;
  for (const p of course) {
    const dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz) || 1;
    const back = Math.min(k.rampBefore, d * 0.4);
    out.push({ x: p.x - (dx / d) * back, z: p.z - (dz / d) * back, yaw: Math.atan2(dx, dz), len: k.rampLen, height: k.rampH });
    px = p.x; pz = p.z;
  }
  return out;
}
export const allRamps = () => [...chaseRamps(), HILL, LAUNCH_RAMP, ...SKI_RAMPS];

// ---------------------------------------------------------------- people

function say(G, who, text, ms = 2600) {
  if (G && G.heckle && G.heckle.line) G.heckle.line(who, text, ms, { group: 'royal' });
  else if (G && G.hud) G.hud.toast(`${who}: ${text}`, ms);
}
export const SAY_JUMP = [
  'WOOO! Did the marshal see that?',
  'That is how you drive a cart. Take notes.',
  'Four wheels off! Somebody write it down!',
  'Cart is fine. Cart is totally fine.',
];

// ---------------------------------------------------------------- setup / teardown

const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function ensureCart(G, m) {
  if (inCart(G)) return true;
  if (!G || !G.veh || !G.parked || !G.swapCar) return false;
  if (m.cartHome === undefined) m.cartHome = G.parked.cart ? { ...G.parked.cart } : null;
  G.parked.cart = { ...CART_SPOT };
  const ok = swapIntoCart(G, m, CART_SPOT);
  if (ok) G.__royalCar = m.cameIn;
  return ok;
}

function setup(G, m) {
  if (!m.ramps) m.ramps = installRamps(G, allRamps(), { prefix: 'royal:ramp' });
  if (!m.air) m.air = newAir();
  if (!m.fx) m.fx = createRoyalFx();
}

function dropRussell(G, m) {
  if (m && m.russell) { try { removeRival(G, m.russell); } catch (e) { /* gone */ } m.russell = null; }
}

// Back into the car you came in (if you are next to it). The club cart goes
// back where it lives (the Gatineau apron), or off the map if it had no spot.
function giveBack(G, m) {
  const carId = m.cameIn;
  const home = m.cartHome;
  const swapped = swapBack(G, m, { near: K.near });
  if (swapped && G.parked) { if (home) G.parked.cart = { ...home }; else delete G.parked.cart; }
  if (swapped) G.__royalCar = null;
  return swapped ? carId : null;
}

function tearDown(G, m) {
  if (!m) return;
  removeRamps(G, m.ramps); m.ramps = null;
  dropRussell(G, m);
  if (m.fx) { m.fx.destroy(); m.fx = null; }
  if (G && m.cameIn) giveBack(G, m);
}

// Every cart tick: jumps, the landing refund, the governor.
function cartTick(G, m, dt) {
  const v = G.veh;
  m.landedJump = null;
  if (!v || !inCart(G)) return;
  if (!m.air) m.air = newAir();
  const r = airStep(m.air, v, dt);
  m.air = r.state;
  forgiveLanding(m.air, v);
  if (r.landed) m.landedJump = r.landed;
  if (r.landed && r.landed.jump && !m.quietJumps) say(G, 'Russell', SAY_JUMP[(m.air.jumps - 1) % SAY_JUMP.length], 2000);
  governorStep(v, dt, K.govKmh);
}

const wrong = (G) => (inCart(G) ? null : 'Russell: « Not the car, man. The CART. »');

// ---------------------------------------------------------------- school

export const SCHOOL_MISSION = {
  id: 'school',
  // Tom worked at the Royal Ottawa, and waking up late for the 5:45 a.m.
  // shift is real (28 Sept). The id stays « school » because it is a save key.
  title: 'Le shift de 5 h 45',
  brief: 'Tu t’es réveillé à 5 h 32. Ton shift au Royal Ottawa commence à 5 h 45. Les souliers dans une main, les clés dans l’autre.',
  giver: 'home',
  timeOfDay: 'morning',
  build(ctx) {
    const car = (ctx && ctx.carName) || 'char';
    return [{
      kind: 'drive',
      text: 'Royal Ottawa Golf Club - le shift de 5 h 45',
      sub: `W pour partir, suis la ligne bleue du GPS jusqu'au pilier jaune (le ${car} est même pas réchauffé)`,
      hint: "C'est plein est sur le chemin d'Aylmer, avant Hull. Tab ouvre la grande carte.",
      at: 'royalottawa',
      radius: 24,
      // The first drive east along the chemin d'Aylmer. Generous: the club is
      // nearer than the Heritage run this clock was made for.
      // s1-timers: 5.7 km, pace car 190 s, so 260 s (was 420).
      time: 260,
      failWhy: 'Le superviseur a déjà donné tes carts à un autre.',
      toast: 'Punché à 5 h 44. Personne a rien vu. Tes cheveux, par contre.',
      money: 20,
    }];
  },
};

// ---------------------------------------------------------------- russellroyal

export const RUSSELL_MISSION = {
  // Russell getting fired over the golf carts is real; he is English and
  // aggressive with golf carts (28 Sept).
  id: 'russellroyal',
  title: 'Russell est encore congédié',
  giver: 'home',
  timeOfDay: 'day',
  brief: 'Russell appelle du Royal Ottawa. Les carts de golf, encore. La dernière chance était vraiment la dernière. Va le chercher, pis ramène-le au 299 Fraser. Il paie le gaz. En principe.',

  cleanup(G, m) { tearDown(G, m); },

  build() {
    const stages = [];

    // ---- 0. the pickup ----------------------------------------------------
    stages.push({
      kind: 'pickup',
      text: 'Va chercher Russell - Royal Ottawa',
      sub: 'Suis le GPS jusqu’au club. Arrête-toi, E pour sauter dans un cart avec lui.',
      hint: 'Le Royal Ottawa est sur le chemin d’Aylmer, vers Hull. Le pilier jaune est au chalet.',
      at: 'royalottawa', radius: 24, hold: true,
      holdText: 'E - prendre un cart (Russell est déjà dans le sien)',
      // B-01b: the same test every job start uses (jobready.ensureOwnVehicle
      // swaps you out of a cart, a bike or a loaner before this stage). This
      // gate stays as the backstop for a run that skipped that call.
      gate: (G) => (strandedIn(G) ? 'Russell va avoir besoin d’une place pour revenir. Reviens avec un char.' : null),
      toast: 'Russell: « The marshal is coming. Don’t ask. Just drive. »',
    });

    // ---- 1. the chase: one clock across six flags --------------------------
    const n = CHASE.length;
    CHASE.forEach((p, i) => {
      stages.push({
        kind: 'chase' + (i + 1),
        text: `Sauve-toi du marshal - drapeau ${i + 1}/${n}`,
        sub: 'W à fond dans le cart, A/D pour viser, suis Russell pis les drapeaux (GPS).',
        hint: 'Les tremplins sont dans l’axe du prochain drapeau. Arrive droit, W au plancher. Le marshal lâche pas.',
        at: { x: p.x, z: p.z }, radius: K.cpRadius,
        time: ROYAL.chaseTime,
        failWhy: 'Le marshal t’a pogné. Russell est déjà rendu au stationnement.',
        condition: (G) => inCart(G),
        prompt: wrong,
        onEnter(G, m) {
          if (i === 0) {
            ensureCart(G, m);
            setup(G, m);
            m.chase = newChase();
            m.chaseLeft = null;
            if (!m.russell && G && G.phys) {
              try {
                const path = [[RUSSELL_SPOT.x, RUSSELL_SPOT.z], ...CHASE.map((c) => [c.x, c.z]),
                  [HILL_TOP.x + 30, HILL_TOP.z], [HILL_TOP.x, HILL_TOP.z], [HILL_BOTTOM.x - 20, HILL_BOTTOM.z]];
                m.russell = spawnRival(G, 'cart', {
                  name: 'Russell', x: RUSSELL_SPOT.x, z: RUSSELL_SPOT.z, yaw: RUSSELL_SPOT.yaw,
                  path, active: true, cruise: ROYAL.russellKmh / 3.6,
                });
              } catch (e) { m.russell = null; }
            }
            say(G, 'Russell', 'GO GO GO! The marshal has a radio!', 2600);
          } else {
            setup(G, m);
            if (!m.chase) m.chase = newChase();
            if (m.chaseLeft != null) m.timeLeft = m.chaseLeft;   // one clock for the chase
          }
          if (m.fx) m.fx.tag(true);
        },
        onTick(G, m, st, dt) {
          cartTick(G, m, dt);
          const v = G.veh;
          if (!m.chase) m.chase = newChase();
          if (v && inCart(G)) {
            m.chase = chaseStep(m.chase, dt, { speedKmh: v.speedKmh });
            if (m.chase.caught) {
              if (m.timeLeft != null) m.timeLeft = Math.max(1, m.timeLeft - ROYAL.catchPenalty);
              if (G.hud) G.hud.toast(`Le marshal t’a presque pogné! -${ROYAL.catchPenalty} s`, 1800);
              say(G, 'Le marshal', 'Arrêtez! C’est des voiturettes de golf!', 2200);
            }
          }
          const rv = m.russell;
          if (rv && rv.veh) {
            governorStep(rv.veh, dt, ROYAL.russellKmh);
            rv.band = v && d2(v, rv) > 60 ? 0.6 : 1;   // he waits for you. A little.
          }
          if (m.timeLeft != null) m.chaseLeft = m.timeLeft;
          if (m.fx && v) {
            m.fx.tagText(`Marshal: ${Math.round(m.chase.gap)} m derrière`
              + (rv ? ` · Russell: ${Math.round(d2(v, rv))} m` : ''));
          }
          return null;
        },
        onExit(G, m) { if (i === n - 1 && m.fx) m.fx.tag(false); },
        toast: i === n - 1 ? 'Semé! Le marshal est resté pogné au 9e trou.' : undefined,
      });
    });

    // ---- 2. handbrake hill -------------------------------------------------
    const hillAt = (m) => (m && m.hill && m.hill.crest && !m.hill.short ? HILL_BOTTOM : HILL_TOP);
    stages.push({
      kind: 'hill',
      text: 'La grosse butte - descends-la en screechant',
      sub: `Monte par l’est, pis en descendant tiens Espace (frein à bras) ${ROYAL.hillNeed} s. A/D pour garder le cap.`,
      hint: 'Le pilier est en haut de la butte. Rendu en haut, descends vers l’ouest avec Espace enfoncé.',
      at: (G) => hillAt(G && G.mission),
      radius: K.topR,
      condition: () => false,
      onEnter(G, m) {
        setup(G, m);
        m.hill = newHill();
        m.hillWas = HILL_TOP;
        if (m.fx) { m.fx.keys(true); m.fx.tag(true); }
        m.target = { x: HILL_TOP.x, z: HILL_TOP.z, r: K.topR };
        if (G) G.routeKey = '';
        say(G, 'Russell', 'The big hill. Handbrake the whole way. What could go wrong?', 2800);
      },
      onTick(G, m, st, dt) {
        cartTick(G, m, dt);
        const v = G.veh;
        if (!v || !inCart(G)) return null;
        const hb = m.fx ? m.fx.space() : false;
        const onFace = !!rampAt(HILL, v.x, v.z) && ((v.x - HILL.x) * Math.sin(HILL.yaw) + (v.z - HILL.z) * Math.cos(HILL.yaw)) < 0;
        const push = hillAssist(v, HILL_DOWN, dt, { onFace, handbrake: hb });
        v.vx += push.dvx; v.vz += push.dvz;
        m.hill = hillStep(m.hill || newHill(), dt, {
          handbrake: hb,
          speedKmh: v.speedKmh, slip: v.vLat || 0,
          onHill: !!rampAt(HILL, v.x, v.z),
          atTop: d2(v, HILL_TOP) < K.topR,
          atBottom: d2(v, HILL_BOTTOM) < K.bottomR,
        });
        const want = hillAt(m);
        if (want !== m.hillWas) {
          m.hillWas = want;
          m.target = { x: want.x, z: want.z, r: want === HILL_TOP ? K.topR : K.bottomR };
          if (G) G.routeKey = '';
          if (m.hill.short) { if (G.hud) G.hud.toast('Pas assez de screech. Remonte pis tiens Espace!', 2200); }
          else say(G, 'Russell', 'Now. Handbrake. HANDBRAKE!', 1800);
        }
        if (m.fx) m.fx.tagText(`Screech: ${m.hill.screech.toFixed(1)} / ${ROYAL.hillNeed} s`);
        return m.hill.done ? 'done' : null;
      },
      prompt(G, m) {
        if (!inCart(G)) return wrong(G);
        const h = m.hill || newHill();
        return `Screech ${fillBar(h.screech / ROYAL.hillNeed)} Espace en descendant`;
      },
      onExit(G, m) { if (m.fx) { m.fx.keys(false); m.fx.tag(false); } dropRussell(G, m); },
      toast: 'Screeeeech. Le bumper du cart pend au bout d’une vis.',
    });

    // ---- 3. the string -----------------------------------------------------
    stages.push({
      kind: 'string',
      text: 'Le bumper tombe - attache-le avec du fil de weed-whacker',
      sub: `Arrête-toi (S), pis E ${ROYAL.stringNeed} fois pour faire le tour du bumper avec le fil.`,
      hint: 'N’importe où. Arrête le cart complètement, pis tape sur E.',
      noTarget: true,
      condition: () => false,
      onEnter(G, m) {
        setup(G, m);
        m.string = newString();
        if (G && G.hud) G.hud.toast('Russell lâche son cart dans une trappe de sable pis saute dans le tien.', 2600);
        say(G, 'Russell', 'Mine is in the sand trap. I’m with you now.', 2600);
      },
      onTick(G, m, st, dt) {
        cartTick(G, m, dt);
        const v = G.veh;
        if (!v || !inCart(G)) return null;
        const press = !!G.wantStart;
        if (press) G.wantStart = false;
        m.string = stringStep(m.string || newString(), { press, speedKmh: v.speedKmh });
        if (press && !m.string.rolling && !m.string.done && G.hud) G.hud.toast(`Un tour de fil (${m.string.ties}/${ROYAL.stringNeed})`, 900);
        return m.string.done ? 'done' : null;
      },
      prompt(G, m) {
        if (!inCart(G)) return wrong(G);
        const s = m.string || newString();
        if (G.veh && G.veh.speedKmh > ROYAL.stringStopKmh) return 'Arrête-toi (S) pour attacher le bumper';
        return `E - un tour de fil ${fillBar(s.ties / ROYAL.stringNeed, ROYAL.stringNeed)}`;
      },
      toast: 'Solide. Plus solide que le bumper, en tout cas.',
    });

    // ---- 4. the golf ball ---------------------------------------------------
    stages.push({
      kind: 'launch',
      text: 'Une balle de golf dans l’échappement',
      sub: 'Arrête-toi sur le pilier face au tremplin, E pour la balle, pis W au plancher.',
      hint: 'Le pilier est à l’ouest de la butte, face à un gros tremplin. Arrêté, E, puis W et tiens-le.',
      at: LAUNCH_PAD, radius: K.padR,
      condition: () => false,
      onEnter(G, m) {
        setup(G, m);
        m.launch = newLaunch();
        m.quietJumps = true;
        say(G, 'Russell', 'Okay. Golf ball. Exhaust. Don’t ask. Just watch.', 2800);
      },
      onTick(G, m, st, dt) {
        cartTick(G, m, dt);
        const v = G.veh;
        if (!v || !inCart(G)) return null;
        const s0 = m.launch || newLaunch();
        const onPad = d2(v, LAUNCH_PAD) < K.padR;
        const press = !!G.wantStart && onPad && s0.phase === 'idle';
        if (press) G.wantStart = false;
        const r = launchStep(s0, dt, {
          press, throttle: v.throttle || 0, speedKmh: v.speedKmh, vLong: v.vLong || 0,
          inAir: !!(v.inAir || v.airT > 0), landed: !!m.landedJump,
        });
        m.launch = r.state;
        const phase = m.launch.phase;
        if (phase === 'sputter') {
          // Pout pout pout: the cart chugs instead of going.
          v.vx *= 0.9; v.vz *= 0.9; if (v.vLong != null) v.vLong *= 0.9;
          if (m.fx) m.fx.shake(0.6);
        }
        if (r.kick > 0) {
          const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
          v.vx += fx * r.kick; v.vz += fz * r.kick;
          if (v.vLong != null) v.vLong += r.kick;
        }
        if (phase !== s0.phase) {
          if (phase === 'jammed' && G.hud) G.hud.toast('La balle est dans le tuyau. W au plancher!', 1800);
          if (phase === 'sputter' && G.hud) G.hud.toast('pout... pout... pout...', 1300);
          if (phase === 'boost') {
            if (G.hud) G.hud.toast('BANG!', 1000);
            say(G, 'Russell', 'SCIENCE!', 1500);
            if (m.fx) m.fx.shake(0);
          }
        }
        return m.launch.done ? 'done' : null;
      },
      prompt(G, m) {
        if (!inCart(G)) return wrong(G);
        const p = (m.launch || newLaunch()).phase;
        if (p === 'idle') return G.veh && d2(G.veh, LAUNCH_PAD) < K.padR ? 'Arrêté, face au tremplin: E - la balle dans le tuyau' : null;
        if (p === 'jammed') return 'W au plancher, pis tiens-le';
        if (p === 'sputter') return 'Tiens W... tiens-le...';
        return null;
      },
      onExit(G, m) { m.quietJumps = false; if (m.fx) m.fx.shake(0); },
      toast: 'Le cart a volé. La balle, personne sait où elle est rendue.',
    });

    // ---- 5. fairway skiing --------------------------------------------------
    stages.push({
      kind: 'ski',
      text: `Ski de fairway - ${ROYAL.skiNeed} points de carve`,
      sub: 'Russell conduit, t’es sur le râteau en Vans. W/A/D: tu cries les virages. Les grands S font swinguer Tom.',
      hint: 'Zigzague sur le fairway à bonne vitesse. Trop vite dans un virage serré pis Tom mange le gazon.',
      at: SKI_ZONE, radius: 60, anywhere: true,
      condition: () => false,
      onEnter(G, m) {
        setup(G, m);
        m.ski = newSki();
        m.quietJumps = true;
        if (m.fx) m.fx.ski(true);
        say(G, 'Russell', 'Rake between the seats. Vans on. I’ll drive. Mostly.', 3000);
      },
      onTick(G, m, st, dt) {
        cartTick(G, m, dt);
        const v = G.veh;
        if (!v || !inCart(G)) return null;
        const falls = (m.ski || newSki()).falls;
        m.ski = skiStep(m.ski || newSki(), dt, {
          speedKmh: v.speedKmh, yawRate: v.yawRate || 0, air: !!(m.landedJump && m.landedJump.jump),
        });
        if (m.ski.falls > falls) {
          if (G.hud) G.hud.toast(`Tom mange le fairway! -${ROYAL.fallCost} points`, 1800);
          say(G, 'Russell', 'You okay? You look okay. Get up, marshal!', 2000);
        }
        if (m.fx) m.fx.skiDraw(m.ski, ROYAL);
        return m.ski.done ? 'done' : null;
      },
      prompt(G, m) {
        if (!inCart(G)) return wrong(G);
        const s = m.ski || newSki();
        if (s.down > 0) return 'Tom se relève...';
        return `Carve ${fillBar(s.score / ROYAL.skiNeed)} ${Math.floor(s.score)}/${ROYAL.skiNeed}`;
      },
      onExit(G, m) { m.quietJumps = false; if (m.fx) m.fx.ski(false); },
      toast: 'Ski de fairway: médaille d’or. Le pro regarde par la fenêtre du chalet.',
    });

    // ---- 6. back to your car -----------------------------------------------
    stages.push({
      kind: 'back',
      text: 'Retourne à ton char avant le pro',
      sub: 'Suis le GPS jusqu’à ton char, arrête-toi à côté, E pour lâcher le cart.',
      hint: 'Ton char est resté au chalet. Le GPS te ramène dessus.',
      at: (G) => (G && G.parked && G.__royalCar && G.parked[G.__royalCar]) || CART_SPOT,
      radius: 10, hold: true, stopped: 6,
      holdText: 'E - lâcher le cart, Russell embarque avec toi',
      condition: (G) => inCart(G) || !(G && G.__royalCar),
      prompt: (G) => (G && G.__royalCar ? wrong(G) : null),
      onEnter(G, m) { setup(G, m); if (G && m.cameIn) G.__royalCar = m.cameIn; },
      onTick(G, m, st, dt) { cartTick(G, m, dt); return null; },
      onExit(G, m) {
        removeRamps(G, m.ramps); m.ramps = null;
        dropRussell(G, m);
        if (m.fx) { m.fx.destroy(); m.fx = null; }
        const back = m.cameIn ? giveBack(G, m) : null;
        // Russell rides home. Set here, after the swap, or it lands on the cart.
        if (back && G.veh) G.veh.passengers = Math.min((G.veh.passengers || 0) + 1, (G.veh.spec && G.veh.spec.seats) || 2);
      },
      toast: 'Russell: « Walk. Don’t run. Running looks guilty. »',
    });

    // ---- 7. Russell home ----------------------------------------------------
    stages.push({
      kind: 'home',
      text: 'Ramène Russell au 299 Fraser',
      sub: 'Suis le GPS pour rentrer. Arrête-toi dans l’entrée, pis E.',
      hint: 'Retour au 299 Fraser, plein ouest sur le chemin d’Aylmer. Russell parle tout le long.',
      at: 'home', radius: 20, hold: true, passengers: -1, money: K.gas,
      onEnter(G, m) { m.rant = newRant(); },
      onTick(G, m, st, dt) {
        const r = rantStep(m.rant || newRant(), dt);
        m.rant = r.state;
        if (r.say) say(G, 'Russell', r.say, 4200);
        return null;
      },
      toast: `Russell te donne ${K.gas} $ pour le gaz. Ça couvre pas le gaz. Y le sait. « They’ll call me back. »`,
    });

    return stages;
  },
};

export { RANT };
