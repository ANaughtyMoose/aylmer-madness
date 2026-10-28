// Missions and lighting presets. Everything here is data + pure builders; the
// only shared state is localStorage, and that is always optional.
import { PLACES } from './places.js';
import { JUMPS } from './jumps.js';
import { SIDE_MISSIONS } from './sidejobs.js';
import { RACE_MISSIONS } from './racejobs.js';
import { VERB_MISSIONS } from './verbjobs.js';
import { GOLF_MISSIONS } from './golfjob.js';
import { LIFE_MISSIONS } from './lifejobs.js';
// Mission 9's first half and mission 8 are set-piece modules (qr/setpieces).
import { SCHOOL_MISSION } from './setpieces/royal.js';
import { NUITTIM_MISSION } from './setpieces/nuittim.js';
// The arc's beats (arc.js): the Saint-Jean, the sauna drive and the finale.
import {
  ARC, GATES, gateOpen, openBeats, loadArcText, applyArcText, registerArcLines,
} from './arc.js';
// The summer's order and gates (restructure, 29 Sept 2026).
import {
  FINALE, nextMain, finaleOpen, storyBlocker, isMain, isRetired, orderRank, setKnown,
  dateLock, pastSaintJean, mainStepsDone, mainStepsTotal, quietStart, QUIET_UNTIL,
} from './campaign.js';
import { LAST as LAST_DAY } from './calendar.js';
// When a job may start, by the hour and by the date, in the prototype.
import { windowLock, isPrototype } from './jobwindows.js';

// lightDir points TOWARD the light, unit length. Ambient is hemispheric, so the
// sky/ground pair is doing most of the mood work — night leans on it hard so the
// town stays readable under a sodium-orange haze instead of going pitch black.
export const TIME_OF_DAY = {
  // Clear July in the Outaouais. `sky` is both the zenith colour of the dome and
  // the upper hemisphere of the ambient; `fog` is the horizon colour and the fog.
  // main.js scales fogDensity by a quality factor (1.1-2.0), so these run thin.
  morning: {
    sky: [0.46, 0.64, 0.92],
    ground: [0.30, 0.33, 0.30],
    sun: [1.00, 0.93, 0.80],
    lightDir: [0.830083, 0.30003, 0.470047],
    fog: [0.76, 0.82, 0.92],
    fogDensity: 0.0013,
  },
  day: {
    sky: [0.42, 0.62, 0.95],
    ground: [0.34, 0.38, 0.30],
    // A touch warmer than white: core/gl.js gradeLight() takes the blue out of
    // the sky ambient, and this is what keeps noon on the warm side of neutral.
    sun: [1.00, 0.95, 0.86],
    lightDir: [0.25069, 0.942596, 0.220608],
    fog: [0.72, 0.80, 0.92],
    fogDensity: 0.0011,
  },
  dusk: {
    sky: [0.52, 0.38, 0.52],
    ground: [0.30, 0.22, 0.22],
    sun: [1.00, 0.60, 0.34],
    lightDir: [-0.922229, 0.321708, 0.214472],
    fog: [0.92, 0.58, 0.42],
    fogDensity: 0.0016,
  },
  night: {
    sky: [0.16, 0.18, 0.34],
    ground: [0.22, 0.19, 0.15],
    sun: [0.55, 0.58, 0.85],
    lightDir: [-0.349843, 0.719676, -0.59973],
    fog: [0.13, 0.13, 0.22],
    fogDensity: 0.0020,
  },
};

// L’alternateur, the first five minutes (refine A-07, 6 Oct: Lex called it
// "the weakest five minutes, and it is the first five"). On the way out the
// route runs over la rampe de garnotte on chemin d’Aylmer (jumps.js), and the game
// says so once. On the way back the box on the bench is the verb: brake hard,
// corner hard or leave the ground and it slides, then falls. It never fails the
// job; it is the joke. There is no speed cap on the way home any more.
export const FIRST_RAMP = 'garnotte';
// B-04: the ramp is on the GPS line now, 63 m past the turn off Fraser. At
// 90 m the call lands as you come down to the corner, five to seven seconds
// before the lip, instead of half a street early.
export const RAMP_CALL_D = 90;
export const BOX_LINES = [
  'La boîte a glissé sur le banc. Elle tient encore.',
  'La boîte est tombée sur le plancher. L’alternateur s’en fout, lui.',
  'La boîte fait des tonneaux dans la cabine. Ça sonne comme des maracas.',
];
// What counts as a slide: a stop this hard (m/s²), a turn this hard (lateral
// m/s²), or any air at all. Then a few seconds before it can slide again.
export const BOX = { brake: 7, lateral: 7, again: 3 };

/** Stage 0's watch for the ramp: one toast, the first time you are near it. */
export function rampCall(G, m, ramp) {
  if (m.rampCalled || !ramp || !G.veh) return null;
  const v = G.veh;
  if (Math.hypot(v.x - ramp.x, v.z - ramp.z) > RAMP_CALL_D) return null;
  m.rampCalled = 1;
  const line = 'Essaie le tremplin : la rampe de garnotte, en travers du chemin d’Aylmer. Suis le bleu pis garde le W au fond.';
  G.hud?.toast?.(line, 3600);
  return line;
}

/**
 * Stage 1's box. Pure on (G, m, dt) and the car's speed and yaw, so the smoke
 * test can feed it numbers. Returns the line it said, or null.
 */
export function boxTick(G, m, dt) {
  const v = G.veh;
  if (!v || !(dt > 0)) return null;
  const ms = (v.speedKmh || 0) / 3.6;
  const yaw = v.yaw || 0;
  let said = null;
  m.boxCool = Math.max(0, (m.boxCool || 0) - dt);
  if (m.boxLast != null) {
    const decel = (m.boxLast - ms) / dt;
    let dy = yaw - (m.boxYaw || 0);
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const lateral = Math.abs(dy / dt) * ms;
    const hard = decel > BOX.brake || lateral > BOX.lateral || !!v.inAir;
    if (hard && m.boxCool <= 0) {
      m.boxSlides = (m.boxSlides || 0) + 1;
      m.boxCool = BOX.again;
      said = BOX_LINES[Math.min(m.boxSlides, BOX_LINES.length) - 1];
      G.hud?.toast?.(said, 2600);
    }
  }
  m.boxLast = ms; m.boxYaw = yaw;
  return said;
}

// W8-FIRST15 (pressure check 27 Oct risk 3; redteam FIRST-15 dead spot 1): the
// way home was 1.6 km with nothing to aim at, and Margaret's « I'm timing you »
// was a lie. Two things on stage 2 only, and neither can fail the job (Tom: the
// first errand is a driving lesson, so it stays untimed as a job):
//   * Maman's time, a soft record. A dim count-up in the clock slot, « 1:12 ·
//     Maman 2:10 », then one line from Margaret at the door: under her time or
//     not. Your own best for the leg is kept (G.best[LEG_BEST]) for a replay.
//     2:10 is 1,660 m (tools/timers.md, stage 2/2) at 46 km/h on average: a
//     new driver who pushes a little beats it, one who potters does not.
//     It scales with the difficulty's timer factor like every story clock.
//   * A slide zone: the last sharp corner of the GPS line before home (off
//     chemin d'Aylmer onto Fraser on the usual line, right after the ramp's
//     west face). The game calls it once as you come up to it, and a handbrake
//     slide through it gets a line. Found on the live route, so no coordinate
//     is hard-coded and a player who comes home another way gets his own corner.
export const MAMAN_T = 130;
export const LEG_BEST = 'alternateur.retour';
export function mamanTime(G) { return Math.round(MAMAN_T * ((G && G.timerScale) || 1)); }
const clock = (t) => { const s = Math.max(0, Math.round(t)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export const MAMAN_LINES = {
  beat: (t) => `« ${t}. Faster than I said. Don’t make a habit of it. »`,
  miss: (t) => `« ${t}. I said straight back, Tom. »`,
};

/**
 * The way home, scored softly. Pure on (G, m); writes the leg's best to G.best
 * when it is one. Returns { t, maman, beat, best, record, slid, line, task }:
 * `line` is Margaret's (English, main cast), `task` the end card's line in the
 * HUD's language. Never a fail.
 */
export function homeLeg(G, m) {
  const t = Math.max(0, (m && m.legT) || 0);
  const maman = mamanTime(G);
  const beat = t <= maman;
  if (G && !G.best) G.best = {};
  const prev = G && G.best ? G.best[LEG_BEST] : undefined;
  const record = !(Number.isFinite(prev)) || t < prev;
  if (record && G && G.best) G.best[LEG_BEST] = Math.round(t * 10) / 10;
  const best = G && G.best ? G.best[LEG_BEST] : t;
  const en = !!(G && G.settings && G.settings.lang === 'en');
  const slid = !!(m && m.slid);
  const task = (en ? `Home leg ${clock(t)}  ·  Mom ${clock(maman)}` : `Retour ${clock(t)}  ·  Maman ${clock(maman)}`)
    + (beat ? (en ? '  ·  beaten' : '  ·  battue') : '')
    + (Number.isFinite(prev) ? (record ? (en ? '  ·  new personal best' : '  ·  nouveau record perso') : (en ? `  ·  your best ${clock(prev)}` : `  ·  ton record ${clock(prev)}`)) : '')
    + (slid ? (en ? '  ·  corner slid' : '  ·  coin glissé') : '');
  return { t, maman, beat, best, record, slid, line: (beat ? MAMAN_LINES.beat : MAMAN_LINES.miss)(clock(t)), task };
}

export const SLIDE = { callD: 90, r: 26, kmh: 20, yawRate: 0.5, skipEnd: 60, maxEnd: 900, arm: 12, turnDeg: 50 };
export const SLIDE_LINES = {
  call: ['Dernier coin avant la maison : Espace pour le frein à main, pis prends-le en dérapage.', 'Last corner before home: Space for the handbrake, and slide it.'],
  done: ['BEAU DÉRAPAGE. La boîte, elle, a pas aimé ça.', 'NICE SLIDE. The box did not enjoy it.'],
};

/**
 * The last sharp corner of a GPS line, counted back from its end: the first
 * vertex at least SLIDE.skipEnd m and at most SLIDE.maxEnd m from the end whose
 * heading turns by SLIDE.turnDeg or more, measured SLIDE.arm m either side so a
 * curve drawn in short segments still reads as one corner. Pure. {x, z} or null.
 */
export function lastCorner(route) {
  if (!Array.isArray(route) || route.length < 3) return null;
  const n = route.length;
  const cum = new Array(n).fill(0);   // metres from each vertex to the end
  for (let i = n - 2; i >= 0; i--) cum[i] = cum[i + 1] + Math.hypot(route[i + 1][0] - route[i][0], route[i + 1][1] - route[i][1]);
  const cos = Math.cos(SLIDE.turnDeg * Math.PI / 180);
  for (let i = n - 2; i >= 1; i--) {
    if (cum[i] < SLIDE.skipEnd) continue;
    if (cum[i] > SLIDE.maxEnd) break;
    let a = i - 1; while (a > 0 && cum[a] - cum[i] < SLIDE.arm) a--;
    let b = i + 1; while (b < n - 1 && cum[i] - cum[b] < SLIDE.arm) b++;
    const ux = route[i][0] - route[a][0], uz = route[i][1] - route[a][1];
    const wx = route[b][0] - route[i][0], wz = route[b][1] - route[i][1];
    const lu = Math.hypot(ux, uz), lw = Math.hypot(wx, wz);
    if (lu < 1 || lw < 1) continue;
    if ((ux * wx + uz * wz) / (lu * lw) <= cos) return { x: route[i][0], z: route[i][1] };
  }
  return null;
}

/** Stage 2's slide zone, once a step. Pure on G.veh, G.route, G.input. Returns the line said, or null. */
export function slideZoneTick(G, m) {
  const v = G && G.veh;
  if (!v || !m) return null;
  if (!m.slideCalled && G.route && G.route !== m.slideRoute) { m.slideRoute = G.route; m.slideAt = lastCorner(G.route); }
  const c = m.slideAt;
  if (!c) return null;
  const en = !!(G.settings && G.settings.lang === 'en') ? 1 : 0;
  const d = Math.hypot(v.x - c.x, v.z - c.z);
  if (!m.slideCalled && d < SLIDE.callD) {
    m.slideCalled = 1;
    G.hud?.toast?.(SLIDE_LINES.call[en], 3200);
    return SLIDE_LINES.call[en];
  }
  if (m.slideCalled && !m.slid && d < SLIDE.r && G.input && G.input.handbrake
    && (v.speedKmh || 0) > SLIDE.kmh && Math.abs(v.yawRate || 0) > SLIDE.yawRate) {
    m.slid = 1;
    G.hud?.toast?.(SLIDE_LINES.done[en], 2600);
    return SLIDE_LINES.done[en];
  }
  return null;
}

const CORE_MISSIONS = [
  // Tom owns the Ranger. The first errand doubles as an untimed driving lesson.
  {
    id: 'alternateur',
    title: 'L’alternateur',
    brief: 'La lumière de batterie clignote. Ton alternateur est commandé au Canadian Tire des Galeries d’Aylmer. Prends ton Ranger : on commence par une commission sans chrono pour apprendre à conduire. Au retour, ta mère te chronomètre, pour le fun.',
    giver: 'home',
    timeOfDay: 'morning',
    build(ctx) {
      return [
        {
          text: 'Canadian Tire, le comptoir des commandes',
          sub: 'Recule (S) pour sortir de l’entrée, suis la ligne bleue du GPS, arrête-toi (S) dans le pilier jaune pis E pour ramasser ta commande. ? affiche les commandes',
          hint: 'Vers les Galeries d’Aylmer : Canadian Tire est au bout ouest du centre, près de Wilfrid-Lavigne. Tab ouvre la carte.',
          at: 'ctire', radius: 18, time: null,
          hold: true, holdText: 'E : ramasser l’alternateur',
          toast: 'Ta commande est prête. La boîte, le reçu, pis ton argent Canadian Tire.',
          onTick(G, m) { rampCall(G, m, JUMPS.find((j) => j.id === FIRST_RAMP)); return null; },
        },
        {
          text: 'Ramène la boîte au 299 Chemin Fraser',
          sub: `GPS jusqu’au pilier jaune dans l’entrée. La boîte est debout sur le banc du ${ctx.carName} : freine sec pis elle glisse.`,
          hint: 'Chez vous, plein est: le chemin d’Aylmer, pis le chemin Fraser au bout.',
          // A wide pillar: the job ends as you pull into the drive, not after a
          // parking lesson (the return leg was 188 s of the bot's 304, 6 Oct).
          at: 'home', radius: 22, time: null,
          kind: 'slidingbox',
          // W8-FIRST15: Maman's soft clock (main.js paints it, homeLeg scores it).
          softClock: true,
          onEnter(G, m) {
            m.boxSlides = 0; m.boxCool = 0; m.boxLast = null; m.boxYaw = null;
            m.legT = 0; m.slideRoute = null; m.slideAt = null; m.slideCalled = 0; m.slid = 0;
          },
          onTick(G, m, st, dt) {
            if (dt > 0) m.legT = (m.legT || 0) + dt;
            boxTick(G, m, dt);
            slideZoneTick(G, m);
            return null;
          },
          // The twist is Tom's (28 Sept): it only needed the solenoid.
          toast: 'L’alternateur est rendu chez vous. Pis là tu lis le manuel : c’était juste le solénoïde. Bonus de formation, 22 $. Ça couvre le gaz.',
          money: 22,
        },
      ];
    },
  },

  // Mission 9, first half (set-piece module, qr/setpieces).
  SCHOOL_MISSION,

  {
    id: 'highwayhull',
    title: 'Highway to Hull',
    // The drive to Hull is real, and Vertical Reality, the climbing gym in the
    // old paper mill by the bridge (28 Sept). Destination unchanged.
    brief: 'La 148 est ouverte. Au bout : Vertical Reality, le mur d’escalade dans la vieille usine de papier, au pont.',
    giver: 'home',
    timeOfDay: 'dusk',
    build() {
      return [
        {
          text: 'Prends la sortie vers Hull',
          sub: 'W pis suis le GPS jusqu’au pilier jaune à l’entrée de l’autoroute',
          hint: 'Chemin d’Aylmer vers l’est, jusqu’au nouveau tronçon de la 148.',
          // s1-timers: 12.1 km, pace 387 s. Was 260 s = 168 km/h, impossible.
          at: 'hullgate', radius: 24, time: 525,
          toast: 'La pancarte dit Hull. Là, c’est pour vrai.',
        },
        {
          text: 'Fais un arrêt au musée',
          sub: 'Suis le GPS par Alexandre-Taché, puis ralentis à 45 km/h dans le pilier',
          hint: 'Prends la bretelle, puis continue vers le parc Jacques-Cartier.',
          at: 'hullmuseum', radius: 24, time: 360, maxSpeed: 45,   // W6-CURFEW: 8.1 km, pace 263 s braking to 45 (s1-timers 355, was 300)
          toast: 'Hull débloqué. Les grosses bâtisses commencent ici.',
        },
        {
          text: 'Vertical Reality, la vieille usine proche du pont',
          sub: 'GPS jusqu’au dernier pilier, au bord de la rivière',
          hint: 'Continue vers l’est par Montcalm, Eddy ou Maisonneuve.',
          at: 'hulldowntown', radius: 22, time: 65,   // s1-timers: 840 m, pace 46 s (was 110)
          toast: 'Vertical Reality. Des murs d’escalade dans une usine de papier. Sayyad a déjà les avant-bras en feu. Expansion débloquée.',
          money: 60,
        },
      ];
    },
  },

  {
    id: 'chelsea',
    title: 'La run de Chelsea',
    brief: 'Tu pars de Heritage. La 105 monte jusqu’à Chelsea, pis c’est juste des arbres.',
    giver: 'heritage',
    timeOfDay: 'morning',
    build() {
      return [{
        text: 'Monte jusqu’au village de Chelsea',
        sub: 'W pis suis le GPS vers le nord jusqu’au pilier jaune à l’hôtel de ville',
        hint: 'Remonte par Saint-Joseph, puis prends la route 105 vers Chelsea.',
        at: 'chelsea', radius: 24, time: 465, maxSpeed: 45,   // s1-timers: 9.8 km, pace 341 s (was 600)
        toast: 'Chelsea. T’es rendu pas mal plus loin que le dep.',
        money: 75,
      }];
    },
  },

  {
    id: 'gang',
    title: 'Ramasser la gang',
    // Abraham waiting in Tom's own driveway, his bike on the ground in the
    // middle of it (Tom, 29 Sept). Margaret is his mother: she is at home, she
    // lends the Saturn at the end, and she never gets in with the gang.
    brief: 'Sayyad pis Adam veulent chill au parc. Abraham est déjà dans ton entrée. Devine qui a le char.',
    giver: 'principale',
    timeOfDay: 'day',
    build(ctx) {
      const marc = {
        text: 'Ramasse Abraham : ton entrée, 299 Chemin Fraser',
        sub: 'Suis le GPS pis arrête-toi dans le pilier jaune. Son bicycle est couché au milieu de l’entrée',
        hint: 'Il est chez vous, dans ta propre entrée. Les grandes boucles pis le chandail de Led Zeppelin : tu peux pas le manquer.',
        at: 'home', radius: 13, toast: 'Abraham embarque. Le bicycle reste couché dans l’entrée. Ta mère le regarde.', passengers: +1,
      };
      const steph = {
        text: 'Ramasse Sayyad, 75 Denise-Friend',
        sub: 'GPS jusqu’au pilier jaune. Il amène le radio pis les cassettes',
        hint: 'Denise-Friend, dans le Vieux-Aylmer. La ligne bleue t’y amène.',
        at: 'steph', radius: 13, toast: 'Sayyad embarque', passengers: +1,
        // ...and the first thing he does is turn the radio on.
        onExit: (G) => { if (G && G.radio) G.radio.power(true); },
      };
      // Adam vient de Mayo, quarante minutes à l'est: il ne se ramasse pas chez
      // eux, il arrive. Le Sunfire est stationné à la marina depuis à matin.
      const dave = {
        text: 'Ramasse Adam : le stationnement de la marina',
        sub: 'GPS jusqu’au pilier jaune. Il a fait la route de Mayo à matin, il attend à côté du Sunfire',
        hint: 'La marina, à l’ouest du Vieux-Aylmer, au bord de la rivière.',
        at: 'marina', radius: 16, toast: 'Adam embarque', passengers: +1,
      };
      const beach = (sub, passengers, money) => ({
        text: 'Dépose la gang au Parc des Cèdres',
        sub,
        hint: 'Le parc est à l’ouest, au bord de la rivière. 45 km/h dans le pilier.',
        at: 'beach', radius: 20, maxSpeed: 45,
        toast: 'Tout le monde débarque', passengers, money,
      });

      // A bicycle carries the rider and nobody else. `ctx.places` is
      // cars.js's carPlaces(): 3 in the Ranger, 7 in the Sienna, 1 on the
      // Diamondback — which is the number that says « this errand is not
      // possible on that », where `seats` would have quietly built the
      // two-trip variant and then never let anybody in. Same shape as
      // golfjob.js: the stage refuses and says why, rather than failing.
      if (ctx.places <= 1) {
        return [{ ...marc, condition: () => false,
          prompt: () => 'Trois personnes pis un vélo. Reviens en char.' }];
      }
      // The Ranger's bench seats three total, so two friends is the legal max
      // and the run has to be done twice.
      if (ctx.seats < 3) {
        return [
          marc,
          { ...steph, sub: "GPS jusqu'au pilier. Trois sur le banc, c'est pas légal, il s'assoit au milieu pareil" },
          beach('S pour freiner: 45 km/h max dans le pilier, y a des kids', -2),
          { ...dave, sub: 'GPS. Deuxième voyage, il a même pas remarqué' },
          beach('S pour freiner: 45 km/h max dans le pilier, pour de vrai cette fois', -1, 30),
        ];
      }
      return [marc, steph, dave, beach('S pour freiner: 45 km/h max dans le pilier, y a des kids partout', -3, 30)];
    },
  },

  {
    id: 'poutine',
    // Thomas, after the first playtest: « reality is I never went to the poutine
    // place so it just doesn't feel right. » It is not Tom's errand and never
    // was — it is Sayyad's craving, Sayyad's order and Sayyad's money. Tom is
    // the one with the truck, which is the whole social contract of this summer.
    title: 'Poutine express',
    brief: 'Sayyad a une envie pis pas de char à midi. Deux grosses au food court des Galeries, sauce à part, pis ça refroidit vite.',
    giver: 'home',
    timeOfDay: 'day',
    build(ctx) {
      return [
        {
          text: 'Galeries Aylmer : la commande de Sayyad',
          sub: 'GPS jusqu’au pilier jaune : l’entrée sud, sous l’auvent orange. C’est payé, c’est à son nom.',
          hint: 'Les Galeries sont sur le chemin d’Aylmer. La porte sud donne sur le stationnement. Tab pour la carte.',
          at: 'foodcourt', radius: 14,
          toast: 'Deux poutines. Sauce à part, comme il a dit trois fois.',
        },
        {
          text: 'Livre chez Sayyad, 75 Denise-Friend',
          sub: `GPS, pis 40 km/h max en arrivant (S pour freiner). Le fromage fait scouic dans le ${ctx.carName}`,
          hint: 'Denise-Friend, dans le Vieux. Le chrono roule: coupe par la Principale.',
          at: 'steph', radius: 13, time: 95, maxSpeed: 40,
          toast: 'Livrées encore chaudes. Légende.',
          money: 18,
        },
      ];
    },
  },

  {
    id: 'dep',
    // Liberty yogurt, not slush (28 Sept). The real run was the $1.99 750 g
    // tubs at the Super C in the Galeries; moving the pillar there makes the
    // 95 s leg to the park 2.1 km (81 km/h average), so the stop stays at the
    // dep until the clock's owner retunes it. See docs/STORY-REBUILD.md.
    title: 'La run de yogourt',
    brief: 'Du yogourt Liberty pour tout le monde, pis on redescend au parc.',
    giver: 'gas',
    timeOfDay: 'dusk',
    build() {
      return [
        {
          text: 'Dépanneur Palmyra : le yogourt Liberty',
          sub: 'GPS jusqu’au pilier jaune, arrête-toi dedans : quatre pots de 750 g',
          hint: 'Le dep est sur Principale, dans le Vieux-Aylmer.',
          at: 'dep', radius: 14,
          toast: 'Quatre pots de Liberty. Au dep, c’est pas 1,99 $ comme au Super C. Pis pas de cuillères.',
        },
        {
          text: 'Parc des Cèdres, avant que ça tourne',
          sub: 'W à fond, suis le GPS jusqu’au pilier jaune. Du yogourt au soleil dans un truck, ça tourne vite',
          hint: 'Plein ouest par la Principale, le long de la rivière.',
          at: 'beach', radius: 20, time: 60,   // s1-timers: 1.1 km, pace 42 s (was 95)
          toast: 'Encore froid. De justesse. 15 $. Le gaz, à peu près pareil.',
          money: 15,
        },
      ];
    },
  },

  {
    id: 'cv',
    // OPEN DECISION (docs/STORY-REBUILD.md): handing out CVs did not happen.
    // Tom did teach guitar, so the three stops post his lesson ads. Id kept.
    title: 'Les annonces de guitare',
    brief: 'Tu donnes des cours de guitare. Trois annonces à poser aujourd’hui, avec ton numéro dessus.',
    giver: 'home',
    timeOfDay: 'day',
    build() {
      return [
        {
          text: 'Annonce #1 : Tim Hortons, rue Principale',
          sub: 'GPS jusqu’au pilier jaune, arrête-toi. Le babillard est à côté des toilettes',
          hint: 'Le Tim est sur la Principale, dans le Vieux-Aylmer.',
          at: 'tims', radius: 14,
          toast: 'Punaisée entre un chat perdu pis un cours de yoga. Personne va la voir.',
        },
        {
          text: 'Annonce #2 : Galeries Aylmer',
          sub: 'GPS jusqu’au pilier jaune : le babillard de l’entrée sud',
          hint: 'Les Galeries, chemin d’Aylmer. Suis la ligne bleue.',
          at: 'mall', radius: 22,
          toast: 'Une mère lit l’annonce. Son kid regarde ailleurs. C’est un client.',
        },
        {
          text: 'Annonce #3 : Marina d’Aylmer',
          sub: 'GPS jusqu’au pilier jaune sur le quai : le babillard du casse-croûte',
          hint: 'La marina est à l’ouest du Vieux, au bord de l’eau.',
          at: 'marina', radius: 16,
          toast: 'Premier appel : un cours samedi matin. Six heures. Six heures du matin.',
          money: 25,
        },
      ];
    },
  },

  {
    id: 'curfew',
    // Main mission 10 (restructure, 29 Sept 2026). Breakfast nachos, home
    // before « Little Big Man » ends at five in the morning (28 Sept); the whole
    // gang is there (29 Sept: Zahra, Tyler, Sayyad, Alex Wolski, Robin, Adam,
    // Mike, Abraham, Russell; first names only in game). At five Margaret comes
    // down and sits and eats with them. Same race home, same clock.
    title: 'Nachos avant Little Big Man',
    brief: 'Quatre heures et demie à la marina. Toute la gang veut des nachos pour déjeuner, chez vous, avant que « Little Big Man » finisse à la télé. Cinq heures, pas une minute de plus.',
    giver: 'marina',
    timeOfDay: 'night',
    build(ctx) {
      return [{
        text: 'Chez vous, 299 Chemin Fraser, avant cinq heures',
        sub: `Traverse la ville par le GPS, pis 35 km/h max dans le pilier (S pour freiner). Ta mère dort, pis le ${ctx.carName} fait trop de bruit dans l'entrée`,
        hint: "Chez vous, c'est à l'est de la ville. Tab pour voir le chemin au complet.",
        at: 'home', radius: 14, time: 165, maxSpeed: 35,   // W6-CURFEW: 3.2 km, pace 119 s braking to 35 in the pillar (s1-timers 160, was 210)
        toast: 'Zahra, Tyler, Sayyad, Alex, Robin, Adam, Mike, Abraham pis Russell dans la cuisine.\nLes nachos sortent du four. Le film est pas fini.\nÀ cinq heures, ta mère descend, se tire une chaise, pis mange avec vous autres.',
        money: 22,
      }];
    },
  },

  {
    id: 'tour',
    title: 'Le tour de ville',
    brief: 'Coucher de soleil, réservoir plein. Cinq spots, pas une seconde de trop.',
    giver: 'arena',
    timeOfDay: 'dusk',
    build() {
      return [
        {
          text: 'Spot 1/5 : le phare de la marina',
          sub: 'GPS jusqu’au pilier jaune : le meilleur point de vue sur l’Outaouais',
          hint: 'La marina, à l’ouest du Vieux-Aylmer. Le chrono roule.',
          at: 'lookout', radius: 16, time: 100,
        },
        {
          text: 'Spot 2/5 : Aréna Frank-Robinson',
          sub: 'GPS jusqu’au pilier jaune. Fermé pour l’été, le stationnement est à nous',
          hint: 'Frank-Robinson, au nord de la Principale.',
          at: 'arena', radius: 18, time: 95,
        },
        {
          // Chemin d'Aylmer runs at z = -40; this sits in front of the Galeries.
          text: "Spot 3/5 : chemin d'Aylmer, devant les Galeries",
          sub: 'GPS jusqu’au pilier jaune, fenêtres baissées',
          hint: 'Plein est sur le chemin d’Aylmer, en face du centre d’achat.',
          at: { x: 236, z: -40 }, radius: 16, time: 95,
        },
        {
          text: 'Spot 4/5 : rue Principale',
          sub: 'GPS jusqu’au pilier jaune : le Vieux-Aylmer au complet en une passe',
          hint: 'Reviens vers l’ouest par la Principale.',
          at: 'principale', radius: 15, time: 125,
        },
        {
          text: 'Spot 5/5 : Parc des Cèdres',
          sub: 'GPS jusqu’au dernier pilier. Le soleil tombe dans la rivière',
          hint: 'Tout au bout à l’ouest, au bord de l’eau.',
          at: 'beach', radius: 20, time: 100,
          toast: 'Tu connais ta ville, là.',
          money: 40,
        },
      ];
    },
  },
];

// The side jobs (canoe / Sayyad / couch) are the ones that need stateful stages,
// so they are built in sidejobs.js. They are ordinary MISSIONS entries here.
// The four races (racejobs.js) are the same again: a grid stage and one long
// stage that owns the countdown, the checkpoints and the rivals.
// ...and the golf cart's own errand (golfjob.js), the life jobs (lifejobs.js)
// and the arc's beats (arc.js). Since the restructure (29 Sept 2026) the order
// and the gating are campaign.js's: ten main missions, one after the other,
// then « Le dernier soir »; optional jobs open once the main mission that
// introduces their place is done. The cut jobs (campaign.js RETIRED) keep their
// definitions for old saves and are in none of these lists.
const POOL = [...CORE_MISSIONS, ...SIDE_MISSIONS, ...VERB_MISSIONS, ...RACE_MISSIONS, ...GOLF_MISSIONS, ...LIFE_MISSIONS, NUITTIM_MISSION, ...ARC];
const byCampaign = (a, b) => orderRank(a.id) - orderRank(b.id);

/** Every job a player can meet, in campaign order. */
export const ALL_MISSIONS = POOL.filter((d) => !isRetired(d.id)).sort(byCampaign);
/** The cut jobs, for save compatibility only (never offered). */
export const RETIRED_MISSIONS = POOL.filter((d) => isRetired(d.id));
setKnown(ALL_MISSIONS.map((d) => d.id));

/**
 * The live list main.js reads. Same jobs as ALL_MISSIONS: nothing is pushed in
 * or taken out any more (the arc's job-count gates are gone), the lock is the
 * story's (missionLockReason). Other branches may push a job of their own in;
 * `missionsChanged()` picks it up.
 */
export const MISSIONS = ALL_MISSIONS.slice();
/** Kept for older callers: the whole summer, in order. */
export const CAMPAIGN = ALL_MISSIONS;

const known = (id) => ALL_MISSIONS.some((d) => d.id === id);
const byId = (id) => ALL_MISSIONS.find((d) => d.id === id) || null;
const lastDay = (G) => !!(G && (G.summerOver || G.lastNight || (Number.isFinite(G.day) && G.day >= LAST_DAY)));

// The queue: the next main mission, the finale once it is open, then the
// optional jobs that are open and not done yet.
function queue(G) {
  const done = G?.done || new Set();
  const out = [];
  const next = nextMain(done, known);
  if (next) out.push(byId(next));
  const fin = byId(FINALE);
  if (fin && !done.has(FINALE) && finaleOpen(done, known, lastDay(G))) out.unshift(fin);
  for (const d of ALL_MISSIONS) {
    if (done.has(d.id) || out.includes(d) || isMain(d.id) || d.id === FINALE) continue;
    if (storyBlocker(d.id, done, known, lastDay(G)) == null && !quietHold(G, d.id)) out.push(d);
  }
  return out.filter(Boolean);
}

// W8-FIRST15: an optional job waits for Sayyad in index.html (campaign.js
// quietStart), so the first driveway has one « next ». Main jobs and the
// finale are never held here.
function quietHold(G, id) {
  if (isMain(id) || id === FINALE) return null;
  return quietStart(G, known) ? QUIET_UNTIL : null;
}

// A job can also be waiting on the calendar (campaign.js DATE_GATES: in
// index.html every main mission has a date since S4-SUMMER; the prototype keeps
// only the Saint-Jean's) or, in the prototype only, on the clock (its hour
// window, jobwindows.js). The finale never waits: it is Labour Day night when it starts.
function timeLock(G, def) {
  if (def.id === FINALE) return null;
  return dateLock(G, def.id) || windowLock(G, def);
}

/**
 * The job the story offers next: the first in the queue that can start now.
 * When the head of the queue is waiting on the hour or the date, the next one
 * that can start takes its turn, so the summer never stalls on a clock. When
 * nothing can start right now, it is the head of the queue anyway (and
 * missionLockReason says why), and null only when every job is done.
 */
export function nextMission(G) {
  const q = queue(G);
  return q.find(d => !timeLock(G, d)) || q[0] || null;
}

const finishFirst = (G, id) => (G?.settings?.lang === 'en' ? 'Finish first: ' : 'Finis d’abord : ') + (byId(id)?.title || '');

/**
 * Why this job cannot be started right now, in French, or null if it can.
 * « Reviens après 21 h (jusqu’à 4 h). », « Pas avant le 24 juin… »,
 * « Finis d'abord : Réveiller Sayyad ». Replays are only held by the hour.
 */
export function missionLockReason(G, def) {
  if (!def) return 'Job indisponible';
  if (isRetired(def.id)) return G?.settings?.lang === 'en' ? 'Not part of this summer any more' : 'Pas dans cet été-là';
  // Generated driving modes and roadside encounters are not campaign jobs.
  if (!known(def.id)) return null;
  const done = G?.done || new Set();
  if (done.has(def.id)) return def.id === FINALE ? null : windowLock(G, def);
  const blocker = storyBlocker(def.id, done, known, lastDay(G));
  if (blocker) return finishFirst(G, blocker);
  const quiet = quietHold(G, def.id);
  if (quiet) return finishFirst(G, quiet);
  return timeLock(G, def);
}

export function missionAvailable(G, def) {
  if (!def) return false;
  return missionLockReason(G, def) == null;
}
export function availableMissions(G) {
  return ALL_MISSIONS.filter(d => missionAvailable(G, d));
}

/** « 3/10 » for the pause screen and the end-of-job card: main steps done / total. */
export function storyProgress(G) {
  const done = G?.done || new Set();
  return { done: mainStepsDone(done, known), total: mainStepsTotal(known), finale: done.has(FINALE) };
}


// What a job hands you, in its own brief. The garage already knows which car
// each mission unlocks — it prints "Finis « Ramasser la gang »" on the locked
// card in the menu — but the job itself never said, so from the driver's seat
// every errand looked equally worth doing. This reads that same table backwards
// and appends one line, so the reward is visible before you commit to the drive
// rather than only after.
try {
  const { UNLOCKS } = await import('./garage.js');
  const byMission = {};
  for (const carId of Object.keys(UNLOCKS)) {
    const u = UNLOCKS[carId];
    if (u.kind === 'mission' && u.mission) (byMission[u.mission] ||= []).push(u.who || carId);
  }
  for (const m of ALL_MISSIONS) {
    const who = byMission[m.id];
    if (!who) continue;
    m.unlocks = who;
    const keys = who.length === 1 ? `les clés du char à ${who[0]}` : `des clés`;
    m.unlockLine = `\u00c7a te donne ${keys}.`;
    m.brief = (m.brief ? m.brief + ' ' : '') + m.unlockLine;
  }
} catch { /* the garage is optional here; a brief without the line still reads */ }


// The beats' names come out of assets/text/arc.json when it is there; the ones
// written in arc.js are the fallback. Fire and forget — a title that lands two
// seconds after the map does is a title that lands.
let arcTextT = null;
export function ensureArcText() {
  if (arcTextT) return arcTextT;
  registerArcLines();
  arcTextT = loadArcText().then((rows) => applyArcText(rows)).catch(() => 0);
  return arcTextT;
}

// What G.done looked like the last time we looked, so a new save (a brand new
// Set) is told apart from « you just finished a job ». The day is in the key
// too: the Saint-Jean's text depends on it.
let arcSeen = null;
let arcSize = -1;
let arcDay = null;
let arcNext = null;

/**
 * Once a frame from main.js. Nothing is pushed or spliced any more (every job
 * is in MISSIONS from the start; the lock is the story's). What is left:
 * the Saint-Jean's text follows the date, a job another branch pushed into
 * MISSIONS is adopted, and the next main mission is announced when finishing
 * one opens it (silent on the first sync of a save).
 *
 * Returns the jobs that just opened, so a test can watch the summer open up.
 */
// W9-LEVELS fix: `quiet` syncs the arc with no « NOUVELLE JOB » toast. main.js
// passes it when a job ends on its card, which already names the next mission
// (missionframe.js nextLine); the toast would replay it as the card closes.
export function unlockArc(G, { quiet = false } = {}) {
  if (G && isPrototype(G)) waitNotice(G);
  const done = (G && G.done) || new Set();
  const day = G && Number.isFinite(G.day) ? Math.floor(G.day) : null;
  if (done === arcSeen && done.size === arcSize && day === arcDay) return [];
  const fresh = done !== arcSeen;
  arcSeen = done; arcSize = done.size; arcDay = day;
  ensureArcText();
  applyDatedText(G);
  const before = arcNext;
  const next = nextMain(done, known);
  arcNext = next;
  const added = [];
  if (!fresh && next && next !== before) added.push(byId(next));
  if (!fresh && before && !next && !done.has(FINALE) && byId(FINALE)) added.push(byId(FINALE));
  if (added.length && G && G.hud && !quiet) {
    for (const def of added.filter(Boolean)) {
      const p = PLACES[def.giver];
      G.hud.toast(`NOUVELLE JOB\n${def.title}\n${p && p.label ? p.label : ''}`, 3600);
    }
    G.audio && G.audio.chime && G.audio.chime(true);
  }
  return added.filter(Boolean);
}

// The Saint-Jean (arcbache) claims its date only on or before the 24th.
function applyDatedText(G) {
  const def = byId('arcbache');
  if (!def || !def.datedText) return;
  const t = pastSaintJean(G) ? def.datedText.after : def.datedText.on;
  if (t) { def.title = t.title; def.brief = t.brief + (def.unlockLine ? ' ' + def.unlockLine : ''); }
}


// Prototype: parked at a job giver whose job is waiting on the hour or the
// date, and no job running. main.js offers nothing there (the job is not
// available), so without this the pillar would just be silent. Once per visit.
const WAIT_R = 12, WAIT_LEAVE = 24;
let waitAt = null;
function waitNotice(G) {
  const v = G.veh;
  if (!v || G.mission || !G.hud || !G.hud.toast) return;
  if (waitAt) {
    const p = PLACES[waitAt];
    if (!p || Math.hypot(v.x - p.x, v.z - p.z) > WAIT_LEAVE) waitAt = null;
    return;
  }
  for (const def of ALL_MISSIONS) {
    const p = PLACES[def.giver];
    if (!p || Math.hypot(v.x - p.x, v.z - p.z) > WAIT_R) continue;
    const why = missionLockReason(G, def);
    if (!why || /^(Finis|Finish)/.test(why)) continue;
    waitAt = def.giver;
    G.hud.toast(`${def.title}\n${why}`, 3200);
    return;
  }
}

/** Tests only: forget which save we were tracking. */
export function resetArcSync() { arcSeen = null; arcSize = -1; arcDay = null; arcNext = null; waitAt = null; }

export { ARC, GATES, gateOpen, openBeats, registerArcLines };

const KEY = 'aylmer.progress';

function store() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function loadProgress() {
  try {
    const raw = store()?.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(arr) ? arr.filter(v => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveProgress(idOrSet) {
  const set = idOrSet instanceof Set ? new Set(idOrSet) : loadProgress().add(idOrSet);
  try { store()?.setItem(KEY, JSON.stringify([...set])); } catch { /* private mode */ }
  return set;
}

export function resetProgress() {
  try { store()?.removeItem(KEY); } catch { /* private mode */ }
  return new Set();
}

export function missionById(id) {
  return MISSIONS.find(m => m.id === id) || null;
}

// Cheap sanity net: a typo'd place key should blow up at import, not mid-drive.
// ALL_MISSIONS, not MISSIONS — a locked beat with a bad giver has to fail here
// and not eight jobs from now.
for (const m of ALL_MISSIONS) {
  if (!PLACES[m.giver]) throw new Error(`mission ${m.id}: unknown giver ${m.giver}`);
  if (!TIME_OF_DAY[m.timeOfDay]) throw new Error(`mission ${m.id}: unknown timeOfDay`);
}

// Every job pays. The economy only works if the used lot is reachable by
// working, so a job with no `money` anywhere in it is a bug, not a design.
// (Two builds per job: the bench-seat variant and the normal one.)
export function missionPayout(def, ctx) {
  const c = Object.assign({ carId: 'ranger', carName: 'Ranger', seats: 2, places: 3, money: 0 }, ctx || {});
  let total = 0;
  for (const st of def.build(c)) total += (st.money || 0) - (st.cost || 0);
  return total;
}
