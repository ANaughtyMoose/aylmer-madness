// Three side jobs that need more than a radius: the canoe, Sayyad, and the couch.
// They live here rather than in missions.js so the original seven stay a flat
// list of data and this file can be as stateful as it needs to be.
//
// Everything a stage touches goes through the hooks documented in missionkit.js,
// and every prop id starts with "job:" so cleanup() is one call.
import { clamp } from '../core/math.js';
import { PLACES } from './places.js';
import { meterBar, fillBar } from './missionkit.js';
import {
  ISLAND, PADDLE_LAUNCH, YARD_SALE, MIKE_TREE,
  islandLandAt, LIT_OPTS,
} from './props.js';
import { Boat, currentToward } from './boat.js';
import { DoughnutMeter, DONUT, couchLaunch, CouchFlight } from './stunts.js';

const P = 'job:';
const say = (G, text, ms) => G.hud && G.hud.toast(text, ms);
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

function repairState(m) {
  if (!m.repair) m.repair = { on: false, t: 0, hits: 0, taps: 0, done: false, quality: 0 };
  return m.repair;
}

const canot = {
  id: 'canot',
  title: 'Le canot à 45 piasses',
  brief: 'Vente de garage sur Wychwood. Un canot. Quarante-cinq piasses.',
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
        holdText: 'E — acheter le canot   ·   45 $',
        brokeText: 'Quarante-cinq piasses. T’en as pas quarante-cinq. Va tondre des gazons.',
        toast: 'Un canot. 45 $. « Il flotte », qu’il a dit. En principe.',
        onEnter(G) {
          G.props.add({
            id: P + 'sale', mesh: 'yardsale',
            x: YARD_SALE.x, z: YARD_SALE.z, y: 0, yaw: YARD_SALE.yaw, far: 320,
          });
          G.props.add({
            id: P + 'lawncanoe', mesh: 'canoe',
            x: YARD_SALE.x + 2.6, z: YARD_SALE.z + 2.2, y: 0.05,
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

      // ---- c. the beach, and the Bondo ----------------------------------
      {
        kind: 'repair',
        text: 'Plage des Cèdres — patcher le canot',
        sub: 'Arrête-toi dans le pilier, E pour sortir le Bondo, pis E dans le vert ×3',
        hint: 'Faut être arrêté (moins de 7 km/h) DANS le pilier. E sort le Bondo, E encore quand le curseur est dans le vert.',
        at: 'beach', radius: 22, stopped: 7,
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
        text: 'Île Aylmer — 1,2 km d’eau',
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
            if (w >= at && m.leakSaid < at) { m.leakSaid = at; say(G, line, 1800); }
          }
          // The island is well inside the fog at this range, so the prompt is the
          // compass: distance, and which way to lean on the paddle.
          const d = Math.hypot(b.x - ISLAND.x, b.z - ISLAND.z);
          const want = Math.atan2(ISLAND.x - b.x, ISLAND.z - b.z);
          const err = ((want - b.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          const arrow = Math.abs(err) < 0.12 ? '▲' : err > 0 ? '◀ ◀' : '▶ ▶';
          G.hud && G.hud.prompt(`eau dans le canot ${fillBar(w)} ${Math.round(w * 100)}%`
            + `   ·   île: ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'}  ${arrow}`);
          return null;
        },
        onExit(G, m) {
          G.props.removePrefix(P + 'boat');
          G.props.removePrefix(P + 'wake');
          G.boat = null;
          G.focus = null;
          if (m && m.carSpot) G.veh.reset(m.carSpot.x, m.carSpot.z, m.carSpot.yaw);
          G.hud && G.hud.prompt(null);
        },
      },
    ];
  },
};

// ============================================================ 2. Sayyad

const GRACE = 5;          // seconds after the third one where extras still count
const ESCAPE_M = 300;

const sayyad = {
  id: 'sayyad',
  title: 'Réveiller Sayyad',
  brief: 'Il répond pas au téléphone depuis mardi. On va sonner autrement.',
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
        toast: 'Sa fenêtre est en haut à gauche. Il dort comme une roche.\nÀ toi de sonner.',
      },
      {
        kind: 'doughnuts',
        text: 'Fais 3 doughnuts devant chez lui — 0/3',
        sub: 'Espace (frein à main) + A/D pour braquer, pis garde le gaz W',
        hint: 'Reste dans la rue devant le 75. Tiens Espace ET W en même temps, pis braque à fond avec A ou D.',
        at: 'sayyad', radius: DONUT.radius, anywhere: true, noRoute: true,
        condition: (G, m) => m.donut && m.donut.meter.count >= 3 && m.donut.grace <= 0,
        onEnter(G, m) {
          m.donut = { meter: new DoughnutMeter(), grace: GRACE, lit: false, shown: -1 };
        },
        prompt(G, m) {
          const d = m.donut;
          if (!d) return null;
          const n = d.meter.count;
          if (n >= 3) return `Doughnuts: ${n}/3   ·   ${d.meter.state().sliding ? 'ENCORE' : 'décrisse dans ' + Math.ceil(d.grace) + ' s'}`;
          const bar = fillBar(d.meter.state().progress, 8);
          return `Doughnuts: ${n}/3   ${bar}   ·   Espace + A/D` + (d.meter.state().sliding ? '   ·   TIENS ÇA' : '');
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
          const s = d.meter.update(dt, G.veh, {
            handbrake: !!(G.input && G.input.handbrake), cx: p.x, cz: p.z,
          });
          if (s.scored) {
            blip(G, 300 + d.meter.count * 140, 0.14, 'square', 0.24);
            if (d.meter.count === 1) say(G, 'Un.', 900);
            if (d.meter.count === 2) say(G, 'Deux. Une lumière s’allume à côté.', 1400);
          }
          if (d.meter.count >= 3 && !d.lit) {
            d.lit = true;
            // The facade is the local -Z face, so turn it toward the street:
            // p.x/p.z is the snapped curb point, p.bx/p.bz the footprint centre.
            const dx = p.x - p.bx, dz = p.z - p.bz, dl = Math.hypot(dx, dz) || 1;
            G.props.add({
              id: P + 'lit', mesh: 'litwin', far: 260, opts: LIT_OPTS,
              x: p.bx + (dx / dl) * 3.2, z: p.bz + (dz / dl) * 3.2, y: 0,
              yaw: Math.atan2(-dx / dl, -dz / dl),
            });
            say(G, 'Sayyad: « C’EST QUOI CE BRUIT-LÀ »', 2600);
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
        text: 'Sacre ton camp! 300 m en 25 s',
        sub: 'W à fond, n’importe quelle direction — 300 m avant que quelqu’un compose le 9-1-1',
        hint: 'Peu importe où: c’est la distance en ligne droite depuis chez Sayyad qui compte. Fonce.',
        noTarget: true, noRoute: true, time: 25,
        failWhy: 'Les voisins ont eu le temps de noter la plaque.',
        condition: (G) => Math.hypot(G.veh.x - PLACES.sayyad.x, G.veh.z - PLACES.sayyad.z) > ESCAPE_M,
        prompt(G) {
          const d = Math.hypot(G.veh.x - PLACES.sayyad.x, G.veh.z - PLACES.sayyad.z);
          return `${Math.max(0, Math.round(ESCAPE_M - d))} m`;
        },
        money: 20,
        toast: 'Personne t’a vu. Sayyad va rappeler demain, promis.\n+20 $ — il te devait ça depuis avril.',
      },
    ];
  },
};

// ============================================================ 3. Le divan

const TRIES = 3;
const MIKE_LINES = [
  'Mike: « …ok. Ramasse-le pis recommence. »',
  'Mike: « Mon père rentre à six heures. »',
];

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
        holdText: `E — charger le divan sur le ${ctx.carName}`,
        toast: 'Le divan est sur le toit. Mike tient une corde. C’est tout.',
        onEnter(G) {
          G.props.add({
            id: P + 'couchlawn', mesh: 'couch', far: 300,
            x: PLACES.mike.bx - 3, z: PLACES.mike.bz + 4, y: 0, yaw: 0.6,
          });
        },
        onExit(G) { G.props.removePrefix(P + 'couchlawn'); },
      },
      {
        kind: 'couch',
        text: 'Le divan dans l’arbre',
        sub: 'Vise le tronc de l’érable à 35+ km/h — recule, W à fond, pas de frein',
        hint: 'Recule d’une trentaine de mètres, aligne le gros érable devant le 129, pis rentre dedans à plus de 35 km/h. Si le divan tombe: E à côté pour le remonter.',
        at: MIKE_TREE, radius: 10, anywhere: true, noRoute: true,
        money: 30,
        toast: 'La mère de Mike te donne 30 $ pour le trouble.\n+30 $',
        condition: (G, m) => !!(m.couch && m.couch.stuck),
        onEnter(G, m) {
          m.couch = { tries: 0, flight: null, stuck: false, loaded: true, rest: null };
          loadCouch(G);
          say(G, 'Vise l’érable. Trente-cinq à l’heure minimum.\nMike recule un peu.', 3000);
        },
        onExit(G) {
          G.props.removePrefix(P + 'couch');
          G.props.removePrefix(P + 'flying');
        },
        prompt(G, m) {
          const c = m.couch;
          if (!c) return null;
          if (c.stuck) return null;
          if (c.flight) return null;
          if (c.loaded) {
            const d = Math.hypot(G.veh.x - MIKE_TREE.x, G.veh.z - MIKE_TREE.z);
            if (d < 6 && G.veh.speedKmh < 35) return 'Trop lent — 35 km/h minimum';
            return `Essai ${c.tries + 1}/${TRIES}   ·   ${Math.round(G.veh.speedKmh)} km/h`;
          }
          const d = c.rest ? Math.hypot(G.veh.x - c.rest.x, G.veh.z - c.rest.z) : 99;
          if (d < 7 && G.veh.speedKmh < 8) return 'E — remonter le divan sur le toit';
          return `Le divan est sur le gazon   ·   essai ${c.tries + 1}/${TRIES}`;
        },
        onTick(G, m, st, dt) {
          const c = m.couch;
          if (!c || c.stuck) return null;

          // Mid-air.
          if (c.flight) {
            c.flight.update(dt);
            const p = G.props.get(P + 'flying');
            if (p) {
              p.x = c.flight.x; p.y = c.flight.y; p.z = c.flight.z;
              p.yaw = c.flight.yaw; p.pitch = c.flight.pitch; p.roll = c.flight.roll;
            }
            if (!c.flight.done) return null;
            if (c.flight.stuck) {
              c.stuck = true;
              G.audio && G.audio.chime(true);
              say(G, 'Mike: « OSTIE. »\nLe divan est dans l’arbre.', 3200);
              return null;
            }
            c.rest = { x: c.flight.x, z: c.flight.z };
            c.flight = null;
            c.tries++;
            if (c.tries >= TRIES) {
              return { fail: 'Mike: « Laisse faire. On va le mettre au chemin. »' };
            }
            say(G, MIKE_LINES[Math.min(MIKE_LINES.length - 1, c.tries - 1)], 2600);
            return null;
          }

          // On the roof: are we hitting the tree?
          if (c.loaded) {
            const l = couchLaunch(G.veh, MIKE_TREE);
            if (l.ok) {
              c.loaded = false;
              G.props.removePrefix(P + 'couch');
              const fl = new CouchFlight(l, MIKE_TREE);
              c.flight = fl;
              G.props.add({
                id: P + 'flying', mesh: 'couch', far: 300,
                x: fl.x, y: fl.y, z: fl.z, yaw: fl.yaw,
              });
              // The tree wins the collision.
              G.veh.vLong *= 0.12; G.veh.vLat *= 0.3;
              G.veh.vx *= 0.12; G.veh.vz *= 0.12;
              G.veh.impact = Math.max(G.veh.impact, 0.8);
              G.audio && G.audio.crash(0.8);
            }
            return null;
          }

          // On the lawn: press E next to it to reload.
          if (c.rest && G.wantStart) {
            const d = Math.hypot(G.veh.x - c.rest.x, G.veh.z - c.rest.z);
            if (d < 7 && G.veh.speedKmh < 8) {
              G.wantStart = false;
              c.loaded = true;
              c.rest = null;
              G.props.removePrefix(P + 'flying');
              loadCouch(G);
              blip(G, 520, 0.12, 'triangle', 0.18);
            }
          }
          return null;
        },
      },
    ];
  },
};

function loadCouch(G) {
  onRoof(G, 'couch', 'couch', 0.06, -0.15);
}

export const SIDE_MISSIONS = [canot, sayyad, divan];
export { canot, sayyad, divan, LEAK_BASE, REPAIR, TRIES, ESCAPE_M };
