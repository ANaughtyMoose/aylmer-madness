// Three side jobs that need more than a radius: the canoe, Sayyad, and the couch.
// They live here rather than in missions.js so the original seven stay a flat
// list of data and this file can be as stateful as it needs to be.
//
// Everything a stage touches goes through the hooks documented in missionkit.js,
// and every prop id starts with "job:" so cleanup() is one call.
import { clamp } from '../core/math.js';
import { PLACES } from './places.js';
import { meterBar, fillBar, stageHint } from './missionkit.js';
import {
  ISLAND, PADDLE_LAUNCH, YARD_SALE,
  islandLandAt, LIT_OPTS, DONUT_ARC, donutArcId,
} from './props.js';
import { Boat, currentToward } from './boat.js';
// Ground height under (x, z); 0 where there is no physics world (tests).
function gY(G, x, z) { return G && G.phys && G.phys.groundY ? G.phys.groundY(x, z) : 0; }
import { DoughnutMeter, DONUT, doughnutAssist } from './stunts.js';
// Where the couch ends up in Mike's maple (the landmark draws it from there).
import { COUCH } from './landmarks.js';

const P = 'job:';
const say = (G, text, ms) => G.hud && G.hud.toast(text, ms);

// A canoe and a three-seater couch go on a ROOF. A bicycle has no roof, and
// Zahra is the reason that is suddenly a live question: her whole summer is on
// two wheels. Same shape as golfjob.js's `wrongCar` — `condition` refuses the
// stage and `prompt` says why out loud, so the job stalls with a line instead
// of strapping a canoe to a Diamondback or dividing by a roof that is not
// there. It reads the spec, not an id, so it covers the chrome cruiser and
// anything else two-wheeled that gets added later.
const onTwoWheels = (G) => !!(G.veh && G.veh.spec && G.veh.spec.twoWheel);
const needsARoof = (what) => (G) => (onTwoWheels(G)
  ? `${what} sur un vélo? Reviens avec un char.` : null);
const blip = (G, f, d, t, v) => G.audio && G.audio.blip(f, d, t, v);

function clearJob(G) {
  if (G.props) G.props.removePrefix(P);
}

// Put a prop on the roof of whatever you happen to be driving.
function onRoof(G, id, mesh, lift = 0.10, lz = 0) {
  return G.props.add({
    id: P + id, mesh, attach: 'car',
    off: [0, G.veh.spec.h + lift, lz], far: 500,
  });
}

// ============================================================ 1. Le canot

// The paddle is 1.2 km. LEAK_BASE is how long a *perfect* Bondo patch takes to
// fill the boat; a sloppy one is 0.55x that, which is still enough to make it if
// you point the thing at the island and stop sightseeing.
const LEAK_BASE = 480;
const REPAIR = { sweep: 0.62, lo: 0.40, hi: 0.60, need: 3, taps: 6 };

// B-05: the paddle used to be up to 113 s of nothing on screen (Jen, G10).
// Two causes: after HINT_AFTER the stage hint took the prompt over for good,
// hiding the compass (distance and arrows), and nothing was said between the
// leak lines. The compass is now the stage's own prompt, and a narrator line
// comes up whenever the crossing has gone PADDLE_QUIET seconds without one.
// Every line is an existing narrator line, word for word, from the marina and
// beach pools of assets/text/ambient.json (tools/smoke_doughnut.mjs checks
// that): no new line, no cast line.
export const PADDLE_QUIET = 30;
// In order: leaving the marina, out on the lake, the far shore, the wind.
export const PADDLE_LINES = [
  "Les mâts de voiliers tintent quand le clapotis de l'eau frappe la berge.",
  "Le gars du club de voile est déjà en train de démêler ses cordages.",
  "Y'a encore de la rosée su' le pont du ponton.",
  "Un voilier blanc hisse sa grand-voile avec des bruits de poulie.",
  "La brume s'effiloche au-dessus de l'eau calme comme un miroir.",
  "Y'a un héron bleu planté là-bas su' le banc de sable.",
  "Y'a pas un chat su' plage à cette heure-là, c'est tranquille.",
  "Les traces de pas d'hier soir sont toutes effacées par le clapotis.",
  "Le reflet du soleil su' l'eau est aveuglant pour les yeux.",
  "Regarde le voilier qui rentre au ralenti vers le quai.",
  "Le clapotis régulier contre la coque berce les bateaux à quai.",
  "Le vent du large se lève, ça va faire des vagues su' le bord.",
];

// Distance and which way to lean on the paddle: the island is well inside the
// fog at this range, so this is the compass.
export function paddleCompass(b) {
  const d = Math.hypot(b.x - ISLAND.x, b.z - ISLAND.z);
  const want = Math.atan2(ISLAND.x - b.x, ISLAND.z - b.z);
  const err = ((want - b.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const arrow = Math.abs(err) < 0.12 ? '▲' : err > 0 ? '◀ ◀' : '▶ ▶';
  return `eau dans le canot ${fillBar(b.water)} ${Math.round(b.water * 100)}%`
    + `   ·   île: ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'}  ${arrow}`;
}

// One tick of the crossing's narration. `m.paddleSaid` is seconds since the
// last line this stage put up (leak lines included); returns the line said.
export function paddleBeat(G, m, dt) {
  m.paddleSaid = (m.paddleSaid || 0) + dt;
  m.paddleLine = m.paddleLine || 0;
  if (m.paddleSaid < PADDLE_QUIET || m.paddleLine >= PADDLE_LINES.length) return null;
  const line = PADDLE_LINES[m.paddleLine++];
  m.paddleSaid = 0;
  say(G, line, 3200);
  return line;
}

function repairState(m) {
  if (!m.repair) m.repair = { on: false, t: 0, hits: 0, taps: 0, done: false, quality: 0 };
  return m.repair;
}

const canot = {
  id: 'canot',
  title: 'Le canot à 45 piasses',
  brief: 'Vente de garage sur Wychwood. Un canot. Quarante-cinq piasses. Du Bondo, la marina, pis l’île Aylmer au milieu de la rivière.',
  giver: 'home',
  timeOfDay: 'morning',
  cleanup(G) { clearJob(G); },
  build(ctx) {
    return [
      // ---- a. the garage sale -------------------------------------------
      {
        kind: 'buy',
        text: 'Vente de garage — 41 Promenade Wychwood',
        sub: 'GPS jusqu’au pilier jaune, arrête-toi, pis E pour acheter le canot (45 $)',
        hint: 'Promenade Wychwood. Faut être arrêté dans le pilier avant que le E marche.',
        at: 'yardsale', radius: 13, hold: true, cost: 45,
        condition: (G) => !onTwoWheels(G),
        prompt: needsARoof('Un canot de cèdre de seize pieds'),
        holdText: 'E — acheter le canot   ·   45 $',
        brokeText: 'Quarante-cinq piasses. T’en as pas quarante-cinq. Va tondre des gazons.',
        toast: 'Un canot. 45 $. « Il flotte », qu’il a dit. En principe.',
        onEnter(G) {
          G.props.add({
            id: P + 'sale', mesh: 'yardsale',
            x: YARD_SALE.x, z: YARD_SALE.z, y: gY(G, YARD_SALE.x, YARD_SALE.z), yaw: YARD_SALE.yaw, far: 320,
          });
          G.props.add({
            id: P + 'lawncanoe', mesh: 'canoe',
            x: YARD_SALE.x + 2.6, z: YARD_SALE.z + 2.2,
            y: gY(G, YARD_SALE.x + 2.6, YARD_SALE.z + 2.2) + 0.05,
            yaw: YARD_SALE.yaw + 1.35, roll: 0.06, far: 320,
          });
        },
      },

      // ---- b. Canadian Tire ---------------------------------------------
      {
        kind: 'buy',
        text: 'Canadian Tire — 225 chemin d’Aylmer',
        sub: `GPS jusqu’au pilier, arrête-toi, pis E pour acheter du Bondo (21 $) — le canot est attaché sur le ${ctx.carName}`,
        hint: 'Chemin d’Aylmer, le gros magasin rouge. Arrête-toi dans le pilier, pis E.',
        at: 'ctire', radius: 20, hold: true, cost: 21,
        holdText: 'E — acheter du Bondo   ·   21 $',
        brokeText: 'Vingt-et-une piasses pour du Bondo. T’es cassé.',
        toast: 'Bondo, papier sablé, pis un Coke. 21 $.',
        onEnter(G) {
          G.props.removePrefix(P + 'sale');
          G.props.removePrefix(P + 'lawncanoe');
          onRoof(G, 'canoe', 'canoe', 0.14, 0.10);
          say(G, 'Le canot est sur le toit. Les cordes tiennent. Probablement.', 2200);
        },
      },

      // ---- c. the marina, and the Bondo ---------------------------------
      {
        kind: 'repair',
        text: 'Marina d’Aylmer : patcher le canot',
        sub: 'Arrête-toi dans le pilier, E pour sortir le Bondo, pis E dans le vert ×3',
        hint: 'Faut être arrêté (moins de 7 km/h) DANS le pilier. E sort le Bondo, E encore quand le curseur est dans le vert.',
        at: 'marina', radius: 22, stopped: 7,
        condition: (G, m) => repairState(m).done,
        prompt(G, m) {
          const r = repairState(m);
          if (r.done) return null;
          if (!r.on) return 'E — sortir le Bondo';
          const u = (r.t * REPAIR.sweep * 2) % 2;
          const pos = u < 1 ? u : 2 - u;
          return `E dans le vert   ${meterBar(pos, REPAIR.lo, REPAIR.hi)}   `
            + `patch ${r.hits}/${REPAIR.need}   ·   ${REPAIR.taps - r.taps} essais`;
        },
        onTick(G, m, st, dt) {
          const r = repairState(m);
          if (r.done) return null;
          const d = Math.hypot(G.veh.x - m.target.x, G.veh.z - m.target.z);
          if (d > m.target.r || G.veh.speedKmh > 7) { G.wantStart = false; return null; }
          if (!r.on) {
            if (G.wantStart) { G.wantStart = false; r.on = true; r.t = 0; blip(G, 440, 0.1, 'square', 0.2); }
            return null;
          }
          r.t += dt;
          if (!G.wantStart) return null;
          G.wantStart = false;
          const u = (r.t * REPAIR.sweep * 2) % 2;
          const pos = u < 1 ? u : 2 - u;
          r.taps++;
          if (pos >= REPAIR.lo && pos <= REPAIR.hi) {
            r.hits++;
            blip(G, 660 + r.hits * 110, 0.10, 'triangle', 0.22);
          } else {
            blip(G, 150, 0.16, 'sawtooth', 0.18);
            say(G, 'Ça, c’est du Bondo sur ton jean.', 1100);
          }
          if (r.hits >= REPAIR.need || r.taps >= REPAIR.taps) {
            r.done = true;
            r.quality = 0.35 + 0.65 * (r.hits / REPAIR.need);
            const lines = [
              'T’as sablé le sable. Bonne chance.',
              'Bon. C’est du Bondo, pas un miracle.',
              'Correct. Amène une canne vide, au cas.',
              'Patch propre. Ça devrait tenir jusqu’à l’île.',
            ];
            say(G, lines[Math.min(3, r.hits)], 2600);
          }
          return null;
        },
      },

      // ---- d/e. the crossing, and Île Aylmer ----------------------------
      {
        kind: 'paddle',
        text: 'Île Aylmer : 850 m d’eau',
        sub: 'W pagaie, S recule, A/D tourne — l’île est droit devant, suis la flèche',
        hint: 'La flèche ▲ dans le prompt veut dire « t’es dans la bonne direction ». ◀ ou ▶ veut dire tourne avec A/D.',
        at: 'island', radius: 34, focus: 'boat', noRoute: true,
        toast: 'L’ÎLE. Le canot a fait la traversée. Quarante-cinq piasses bien placées.',
        // Un gars campé sur l'île le rachète sur le champ. Quatre-vingt-dix.
        money: 90,
        onEnter(G, m) {
          const q = repairState(m).quality || 0.35;
          G.props.removePrefix(P + 'canoe');
          const boat = new Boat(G.phys, {
            land: (x, z) => islandLandAt(x, z),
            current: currentToward(PADDLE_LAUNCH, ISLAND),
          });
          boat.reset(PADDLE_LAUNCH.x, PADDLE_LAUNCH.z,
            Math.atan2(ISLAND.x - PADDLE_LAUNCH.x, ISLAND.z - PADDLE_LAUNCH.z));
          boat.setLeak(q, LEAK_BASE);
          boat.active = true;
          G.boat = boat;
          G.focus = boat;
          m.carSpot = { x: G.veh.x, z: G.veh.z, yaw: G.veh.yaw };
          G.props.add({
            id: P + 'boat', mesh: 'canoe', attach: 'boat', off: [0, 0.02, 0], far: 600,
            anim: (dt, p) => { p.off[1] = 0.02 - (G.boat ? G.boat.draft || 0 : 0); },
          });
          G.props.add({
            id: P + 'wake', mesh: 'wake', attach: 'boat', off: [0, 0.05, -1.0], far: 400,
            opts: { alpha: 0.22, unlit: true },
            anim: (dt, p) => {
              const k = G.boat ? clamp(Math.abs(G.boat.vLong) / 3, 0.25, 1.15) : 0.3;
              p.sx = 0.55 + k * 0.5; p.sz = 0.5 + k * 0.9;
            },
          });
          say(G, 'Tu portes le canot jusqu’à l’eau.\nÇa paraît loin, une île.', 3000);
        },
        onTick(G, m, st, dt) {
          const b = G.boat;
          if (!b) return null;
          const w = b.water;
          if (w >= 1) {
            return { fail: 'Le canot est au fond. Le Bondo était pour les chars.' };
          }
          if (!m.leakSaid) m.leakSaid = 0;
          for (const [at, line] of [[0.3, 'ça rentre…'], [0.6, 'ça rentre pas mal, là'],
            [0.85, 'PAGAIE']]) {
            if (w >= at && m.leakSaid < at) { m.leakSaid = at; m.paddleSaid = 0; say(G, line, 1800); }
          }
          paddleBeat(G, m, dt);
          return null;
        },
        // The compass is the prompt (it used to be set from onTick, and the
        // stage hint overwrote it six seconds in). The hint still comes up,
        // but only while the canoe is sitting still.
        prompt(G, m, st) {
          const b = G.boat;
          if (!b) return null;
          const hint = Math.abs(b.vLong || 0) < 0.3 ? stageHint(m, st) : null;
          return hint || paddleCompass(b);
        },
        onExit(G, m) {
          G.props.removePrefix(P + 'boat');
          G.props.removePrefix(P + 'wake');
          G.boat = null;
          G.focus = null;
          if (m && m.carSpot) {
            const c = m.carSpot;
            G.veh.reset(c.x, c.z, c.yaw,
              G.phys && G.phys.groundY ? G.phys.groundY(c.x, c.z) : 0);
          }
          G.hud && G.hud.prompt(null);
        },
      },
    ];
  },
};

// ============================================================ 2. Sayyad

const GRACE = 5;          // seconds after the third one where extras still count
const ESCAPE_M = 300;
// s1-timers: the pace car makes 300 m from the ring in 18.3 s, turned the wrong
// way first; (18.3 + 3) x 1.35 = 30 s. It was 25 s: 2 passes in 6 Ranger runs.
const ESCAPE_S = 30;

// B-05: the ring and the arc. The chalk ring sits on PLACES.sayyad, which
// resolvePlaces() already snapped onto the street in front of the 75 (the
// house itself is p.bx/p.bz), so it is on the road and the strip of lawn by
// the curb. The arc rides on the truck and fills as the doughnut comes round.
const ARC_STEP = (Math.PI * 2) / DONUT_ARC.steps;

function donutProps(G, m) {
  if (!G.props) return;
  const p = PLACES.sayyad;
  G.props.add({
    id: P + 'chalk', mesh: 'chalkring', far: 260,
    x: p.x, z: p.z, y: gY(G, p.x, p.z), opts: CHALK_OPTS,
  });
  G.props.add({
    id: P + 'donutarc', mesh: donutArcId(1), far: 200, visible: false, opts: ARC_OPTS,
    anim: (dt, a, GG) => { donutArcFollow(GG || G, m, a); },
  });
}

// Where the arc starts is where this doughnut started: progress is how far
// round the heading has come, so the arc's leading end is always the nose.
export function donutArcFollow(G, m, a) {
  const d = m && m.donut, v = G && G.veh;
  const st = d && d.meter && d.meter.state ? d.meter.state() : null;
  if (!st || !v || !(st.progress > 0) || d.meter.count >= DONUT.target) { a.visible = false; return; }
  const k = Math.max(1, Math.min(DONUT_ARC.steps, Math.round(st.progress * DONUT_ARC.steps)));
  const meshes = G.props && G.props.meshes;
  if (meshes && meshes[donutArcId(k)]) a.mesh = meshes[donutArcId(k)];
  const turned = st.progress * Math.PI * 2;
  a.yaw = st.dir < 0 ? v.yaw + turned - k * ARC_STEP : v.yaw - turned;
  a.x = v.x; a.z = v.z;
  a.y = gY(G, v.x, v.z);
  a.visible = true;
}
const CHALK_OPTS = { alpha: 0.55, unlit: true };
const ARC_OPTS = { alpha: 0.8, unlit: true };

// B-05: the getaway had no marker and no GPS line, so a player who did not
// already know the street had to guess a direction (and the review bot,
// which drives to markers, sat still and failed it every time). The marker is
// now the nearest road node, by road, that is ESCAPE_M + 40 m from the house
// in a straight line: the GPS line shows the quickest way out. The stage still
// passes anywhere past ESCAPE_M (`anywhere`), the marker is a suggestion.
const ESCAPE_PAD = 40;
const ESCAPE_SEARCH = 900;      // metres of road searched, plenty for 340 m out
let escapeCache = null;
export function escapeSpot(G) {
  const p = PLACES.sayyad;
  if (escapeCache && escapeCache.px === p.x && escapeCache.pz === p.z && escapeCache.nav === (G && G.nav)) return escapeCache.at;
  const want = ESCAPE_M + ESCAPE_PAD;
  let at = null;
  const nav = G && G.nav;
  const start = nav && nav.nearest ? nav.nearest(p.x, p.z) : null;
  if (start) {
    // Dijkstra on road length, stopped at the first node far enough out.
    const dist = new Map([[start, 0]]);
    const open = [start];
    while (open.length && !at) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
      const n = open.splice(bi, 1)[0], dn = dist.get(n);
      if (dn > ESCAPE_SEARCH) break;
      if (Math.hypot(n.x - p.x, n.z - p.z) >= want) { at = { x: n.x, z: n.z }; break; }
      for (const e of n.edges || []) {
        const d = dn + e.len;
        if (d < (dist.has(e.to) ? dist.get(e.to) : Infinity)) {
          if (!dist.has(e.to)) open.push(e.to);
          dist.set(e.to, d);
        }
      }
    }
  }
  if (!at) {
    // No road graph (tests): straight out from the house, past the line.
    const dx = p.x - (p.bx != null ? p.bx : p.x), dz = p.z - (p.bz != null ? p.bz : p.z - 1);
    const dl = Math.hypot(dx, dz) || 1;
    at = { x: p.x + (dx / dl) * want, z: p.z + (dz / dl) * want };
  }
  escapeCache = { px: p.x, pz: p.z, nav, at };
  return at;
}

// The pedals the assist reads: the same input the vehicle got this tick.
function pedals(G) {
  const i = G.input || {};
  return { throttle: +i.throttle || 0, steer: +i.steer || 0, handbrake: !!i.handbrake };
}

const sayyad = {
  id: 'sayyad',
  title: 'Réveiller Sayyad',
  // Revving, doughnuts and honking outside his house at night; he sleeps
  // through all of it, then he is awake and talking fast (Tom, 28 Sept).
  brief: 'Il répond pas au téléphone depuis trois jours. Il dort. On va sonner autrement : le moteur, le klaxon, pis des doughnuts.',
  giver: 'principale',
  timeOfDay: 'night',
  cleanup(G) { clearJob(G); },
  build(ctx) {
    return [
      {
        kind: 'drive',
        text: 'Rends-toi chez Sayyad — 75 Denise-Friend',
        sub: 'Suis la ligne bleue du GPS jusqu’au pilier jaune devant sa maison',
        hint: 'Denise-Friend, dans le Vieux-Aylmer, au sud-ouest. Tab ouvre la grande carte.',
        at: 'sayyad', radius: 30,
        toast: 'Sa fenêtre est en haut à gauche. Il dort comme une roche.\nFais rugir le moteur. H pour le klaxon.',
      },
      {
        kind: 'doughnuts',
        text: 'Fais 3 doughnuts devant chez lui — 0/3',
        sub: 'Dans le cercle de craie : Espace (frein à main) + A/D pour braquer, garde le gaz W, pis H pour klaxonner',
        hint: 'Reste dans le cercle de craie devant le 75. Tiens Espace ET W en même temps, pis braque à fond avec A ou D.',
        at: 'sayyad', radius: DONUT.radius, anywhere: true, noRoute: true,
        condition: (G, m) => m.donut && m.donut.meter.count >= 3 && m.donut.grace <= 0,
        onEnter(G, m) {
          m.donut = { meter: new DoughnutMeter(), grace: GRACE, lit: false, shown: -1, assisted: 0 };
          donutProps(G, m);
        },
        onExit(G) {
          if (G.props) { G.props.removePrefix(P + 'chalk'); G.props.removePrefix(P + 'donutarc'); }
        },
        prompt(G, m) {
          const d = m.donut;
          if (!d) return null;
          const n = d.meter.count;
          if (n >= 3) return `Doughnuts: ${n}/3   ·   ${d.meter.state().sliding ? 'ENCORE' : 'décrisse dans ' + Math.ceil(d.grace) + ' s'}`;
          const st = d.meter.state();
          const bar = fillBar(st.progress, 8);
          // A banked half-turn shows as « ½ »: it is kept even if the slide breaks.
          const half = (st.halves || 0) % 2 ? '½' : '';
          return `Doughnuts: ${n}${half}/3   ${bar}   ·   Espace + A/D` + (st.sliding ? '   ·   TIENS ÇA' : '');
        },
        onTick(G, m, st, dt) {
          const d = m.donut;
          if (!d) return null;
          const p = PLACES.sayyad;
          // The counter is live on the objective line too, not just in the
          // prompt: the top-left is where a lost player looks first.
          if (d.shown !== d.meter.count && G.hud && G.hud.setObjective) {
            d.shown = d.meter.count;
            G.hud.setObjective(`Fais 3 doughnuts devant chez lui — ${Math.min(3, d.meter.count)}/3`, st.sub);
          }
          // In the zone the lever spins the rear instead of stopping the truck
          // (stunts.js doughnutAssist): from rest it gets past DONUT.minKmh.
          const ctl = pedals(G);
          if (G.veh && Math.hypot(G.veh.x - p.x, G.veh.z - p.z) < DONUT.radius
            && doughnutAssist(G.veh, ctl, dt)) d.assisted += dt;
          const s = d.meter.update(dt, G.veh, {
            handbrake: ctl.handbrake, cx: p.x, cz: p.z,
          });
          // Half a doughnut is worth a tick of the horn-note too: it shows on
          // the bar, the arc and the ear at once.
          if (s.halfScored && !s.scored) blip(G, 240 + (s.halves || 0) * 40, 0.06, 'square', 0.12);
          if (s.scored) {
            blip(G, 300 + d.meter.count * 140, 0.14, 'square', 0.24);
            if (d.meter.count === 1) say(G, 'Un. Rien. Il dort.', 900);
            if (d.meter.count === 2) say(G, 'Deux. La lumière du voisin s’allume. Pas la sienne.', 1400);
          }
          if (d.meter.count >= 3 && !d.lit) {
            d.lit = true;
            // The facade is the local -Z face, so turn it toward the street:
            // p.x/p.z is the snapped curb point, p.bx/p.bz the footprint centre.
            const dx = p.x - p.bx, dz = p.z - p.bz, dl = Math.hypot(dx, dz) || 1;
            const lx = p.bx + (dx / dl) * 3.2, lz = p.bz + (dz / dl) * 3.2;
            G.props.add({
              id: P + 'lit', mesh: 'litwin', far: 260, opts: LIT_OPTS,
              x: lx, z: lz, y: gY(G, lx, lz),
              yaw: Math.atan2(-dx / dl, -dz / dl),
            });
            say(G, 'Sayyad, à la fenêtre: « WAIT. Is that you? Two minutes! »', 2600);
            G.audio && G.audio.chime(true);
          }
          if (d.meter.count >= 3) {
            d.grace -= dt;
            if (d.meter.count >= 5 && !d.bonus) {
              d.bonus = true;
              say(G, 'Cinq. Toute la rue est réveillée. Beau travail.', 2400);
            }
          }
          return null;
        },
      },
      {
        kind: 'escape',
        text: `Sacre ton camp! ${ESCAPE_M} m en ${ESCAPE_S} s`,
        sub: 'W à fond, n’importe quelle direction (le GPS montre la plus courte), 300 m avant que quelqu’un compose le 9-1-1',
        hint: 'Peu importe où: c’est la distance en ligne droite depuis chez Sayyad qui compte. Suis le GPS si tu sais pas où aller. Fonce.',
        at: escapeSpot, radius: 25, anywhere: true, time: ESCAPE_S,
        failWhy: 'Les voisins ont eu le temps de noter la plaque.',
        condition: (G) => Math.hypot(G.veh.x - PLACES.sayyad.x, G.veh.z - PLACES.sayyad.z) > ESCAPE_M,
        prompt(G) {
          const d = Math.hypot(G.veh.x - PLACES.sayyad.x, G.veh.z - PLACES.sayyad.z);
          return `${Math.max(0, Math.round(ESCAPE_M - d))} m`;
        },
        money: 20,
        toast: 'Personne t’a vu. Sayyad est réveillé pis il parle déjà de son Mac.\n+20 $ — il te devait ça depuis avril.',
      },
    ];
  },
};

// ============================================================ 3. Le divan
//
// The TRUE version (ledger s.1; Tom, 21 and 28 Sept 2026): Tom and Sayyad stood
// on the truck and lifted the couch into Mike's maple. It stayed up there all
// summer. So the job is a parking job and a lift, not a stunt: back the bed in
// under the low fork, stop, and hold E while the two of you heave it up. Once
// it is in the crown, landmarks.js draws it there for the rest of the game
// (couchInMaple() below is what economy.js hands LANDMARK_FLAGS every frame).

export const LIFT = {
  x: COUCH.x, z: COUCH.z,   // straight under the fork it ends up in
  r: 1.7,                   // how close the middle of the bed has to be, metres
  secs: 3.2,                // E held this long, start to finish
  decay: 0.5,               // progress lost per second off the key (fraction)
  stopKmh: 2,               // standing on a moving truck is a different job
  climb: 0.22,              // first part of the hold: climbing up; then the couch rises
};

const ease = (t) => t * t * (3 - 2 * t);
const keyE = (G) => !!(G.input && G.input.down && G.input.down('KeyE', 'PadY'));

// Where the couch rides: the middle of the pickup bed, or the roof of anything
// without one. `lz` is metres ahead of the car's origin (the midpoint between
// the axles), `y` the floor it sits on, in the car's own frame.
function cargoSpot(spec) {
  if (spec && spec.bed) {
    const rearZ = -(spec.wheelbase / 2 + (spec.len - spec.wheelbase - spec.overhangF));
    return { bed: true, lz: rearZ + spec.len * (spec.bed[0] + spec.bed[1]) / 2, y: spec.bed[2] + 0.05 };
  }
  return { bed: false, lz: -0.15, y: ((spec && spec.h) || 1.4) + 0.06 };
}
function cargoWorld(G) {
  const v = G.veh, c = cargoSpot(v.spec);
  return { x: v.x + Math.sin(v.yaw) * c.lz, z: v.z + Math.cos(v.yaw) * c.lz, ...c };
}

// Sayyad standing on the truck for the lift: the same body the driveways draw
// (avatars.js, already uploaded by main.js). No avatars, no Sayyad: the lift
// still works, it is just harder to watch.
function sayyadMesh(G) {
  const a = G && G.avatars && G.avatars.mesh && G.avatars.mesh.sayyad;
  return (a && a.stand) || null;
}

/** Is the couch up in the maple right now? Done, and not mid-replay. */
export function couchInMaple(G) {
  const m = G && G.mission;
  if (m && m.def && m.def.id === 'divan') return !!(m.couch && m.couch.up);
  return !!(G && G.done && G.done.has && G.done.has('divan'));
}

const divan = {
  id: 'divan',
  title: 'Le divan de Mike',
  brief: 'Sa mère veut le divan dehors. Mike veut le divan dans l’arbre.',
  giver: 'arena',
  timeOfDay: 'dusk',
  cleanup(G) { clearJob(G); },
  build(ctx) {
    return [
      {
        kind: 'load',
        text: 'Chez Mike — 129 avenue Frank-Robinson',
        sub: 'GPS jusqu’au pilier jaune, arrête-toi, pis E pour charger le divan',
        hint: 'Frank-Robinson, au nord de la Principale. Faut être arrêté dans le pilier pour que le E marche.',
        at: 'mike', radius: 14, hold: true,
        condition: (G) => !onTwoWheels(G),
        prompt: needsARoof('Un divan trois places'),
        holdText: `E — charger le divan sur le ${ctx.carName}`,
        toast: 'Le divan est chargé. Sayyad tient le bras. Mike a un plan.',
        onEnter(G) {
          G.props.add({
            id: P + 'couchlawn', mesh: 'couch', far: 300,
            x: PLACES.mike.bx - 3, z: PLACES.mike.bz + 4,
            y: gY(G, PLACES.mike.bx - 3, PLACES.mike.bz + 4), yaw: 0.6,
          });
        },
        onExit(G) { G.props.removePrefix(P + 'couchlawn'); },
      },
      {
        kind: 'lift',
        text: 'Le divan dans l’arbre',
        sub: 'Recule sous l’érable jusqu’au pilier jaune, arrête-toi, pis tiens E : toi pis Sayyad debout sur le truck, vous le montez',
        hint: 'Le gros érable devant le 129. Recule doucement jusqu’à ce que le divan soit drette en dessous de la fourche, arrête-toi (S), pis tiens E sans lâcher.',
        at: { x: LIFT.x, z: LIFT.z }, radius: 3, anywhere: true, noRoute: true,
        money: 30,
        toast: 'Le divan est dans l’arbre. Il va passer l’été là.\nLa mère de Mike te donne 30 $ pour le trouble.\n+30 $',
        condition: () => false,
        onEnter(G, m) {
          m.couch = { p: 0, up: false, climbed: false, rising: false, said: false };
          loadCouch(G);
          if (G.heckle && G.heckle.line) G.heckle.line('Mike', 'Under the big branch. Back it up. Keep going.', 2600, { group: 'friend' });
        },
        onExit(G) {
          G.props.removePrefix(P + 'couch');
          G.props.removePrefix(P + 'sayyadbed');
        },
        prompt(G, m) {
          const c = m.couch;
          if (!c || c.up) return null;
          const at = cargoWorld(G);
          const what = at.bed ? 'la boîte du truck' : `le ${G.veh.spec.name || 'char'}`;
          const d = Math.hypot(at.x - LIFT.x, at.z - LIFT.z);
          if (d >= LIFT.r) {
            return d < 10
              ? `Recule ${what} sous la fourche de l’érable   ·   ${d.toFixed(1)} m`
              : `Recule ${what} sous le gros érable, au pilier jaune`;
          }
          if (G.veh.speedKmh >= LIFT.stopKmh) return 'Arrête-toi (S)';
          return `Tiens E : toi pis Sayyad, vous le montez   ${fillBar(c.p)}`;
        },
        onTick(G, m, st, dt) {
          const c = m.couch;
          if (!c || c.up) return null;
          const v = G.veh;
          const at = cargoWorld(G);
          const under = Math.hypot(at.x - LIFT.x, at.z - LIFT.z) < LIFT.r;
          const still = v.speedKmh < LIFT.stopKmh;
          const held = keyE(G);
          if (held) G.wantStart = false;

          if (!under || !still) {
            // Drive off mid-lift and it comes back down into the bed.
            if (c.p > 0) {
              if (c.rising) say(G, 'Le divan redescend. Personne est blessé.', 2000);
              dropBack(G, c);
            }
            return null;
          }
          if (held) c.p = Math.min(1, c.p + dt / LIFT.secs);
          else c.p = Math.max(0, c.p - dt * LIFT.decay);
          if (c.p <= 0 && c.climbed && !c.rising) { dropBack(G, c); return null; }

          // Climbing up: Sayyad is on the truck with you.
          if (c.p > 0 && !c.climbed) {
            c.climbed = true;
            const mesh = sayyadMesh(G);
            if (mesh) {
              G.props.add({
                id: P + 'sayyadbed', mesh, attach: 'car', far: 200,
                off: [0.45, at.y, at.lz - 0.55],
              });
            }
            if (!c.said) {
              c.said = true;
              if (G.heckle && G.heckle.line) G.heckle.line('Sayyad', 'Lift with your legs. On three. One, two... three!', 2600, { group: 'friend' });
            }
          }

          // The couch leaves the truck and goes up into the fork.
          const k = c.p <= LIFT.climb ? 0 : ease((c.p - LIFT.climb) / (1 - LIFT.climb));
          if (k > 0 && !c.rising) {
            c.rising = true;
            G.props.removePrefix(P + 'couch');
            c.from = { x: at.x, z: at.z, y: (v.bodyY != null ? v.bodyY : (v.y || 0)) + at.y, yaw: v.yaw };
            G.props.add({ id: P + 'couchlift', mesh: 'couch', far: 300, x: at.x, y: c.from.y, z: at.z, yaw: v.yaw });
          }
          if (c.rising) {
            const pr = G.props.get(P + 'couchlift');
            const to = { x: COUCH.x, z: COUCH.z, y: gY(G, COUCH.x, COUCH.z) + COUCH.y };
            if (pr) {
              pr.x = c.from.x + (to.x - c.from.x) * k;
              pr.z = c.from.z + (to.z - c.from.z) * k;
              pr.y = c.from.y + (to.y - c.from.y) * k;
              pr.yaw = c.from.yaw + angleTo(c.from.yaw, COUCH.yaw) * k;
              // It wobbles on the way up; it settles at the angle the fork holds it.
              pr.roll = COUCH.roll * k + Math.sin(c.p * 23) * 0.10 * (1 - k);
              pr.pitch = COUCH.pitch * k;
            }
          }

          if (c.p >= 1) {
            c.up = true;
            G.props.removePrefix(P + 'sayyadbed');
            // landmarks.js draws it from here on; ours would sit on top of it.
            if (G.world && G.world.landmarks) G.props.removePrefix(P + 'couchlift');
            G.audio && G.audio.chime(true);
            return 'done';
          }
          return null;
        },
      },
    ];
  },
};

// Back to the start of the lift: couch in the bed, Sayyad down off the truck.
function dropBack(G, c) {
  c.p = 0; c.climbed = false; c.rising = false;
  G.props.removePrefix(P + 'couchlift');
  G.props.removePrefix(P + 'sayyadbed');
  if (!G.props.has(P + 'couch')) loadCouch(G);
}

const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function loadCouch(G) {
  const c = cargoSpot(G.veh && G.veh.spec);
  return G.props.add({ id: P + 'couch', mesh: 'couch', attach: 'car', off: [0, c.y, c.lz], far: 500 });
}

export const SIDE_MISSIONS = [canot, sayyad, divan];
export { canot, sayyad, divan, LEAK_BASE, REPAIR, ESCAPE_M, ESCAPE_S };
