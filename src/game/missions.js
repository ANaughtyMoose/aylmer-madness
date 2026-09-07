// Missions and lighting presets. Everything here is data + pure builders; the
// only shared state is localStorage, and that is always optional.
import { PLACES } from './places.js';
import { SIDE_MISSIONS } from './sidejobs.js';
import { RACE_MISSIONS } from './racejobs.js';
import { VERB_MISSIONS } from './verbjobs.js';
import { GOLF_MISSIONS } from './golfjob.js';
// The five-beat summer (arc.js). Only the beats whose gate is open are in
// MISSIONS; unlockArc() pushes the rest in as you earn them.
import {
  ARC, GATES, gateOpen, openBeats, loadArcText, applyArcText, registerArcLines,
} from './arc.js';

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
    sun: [1.00, 0.97, 0.90],
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

const CORE_MISSIONS = [
  // The first job of the summer, and the reason the keys are in the coin dish at
  // all. Thomas, after the first playtest: « First mission for Tom should not be
  // poutine — should be buying something at Canadian Tire. » The alternator does
  // more work than the hockey stick would: it explains why a seventeen-year-old
  // has his father's truck this morning, it is an errand a father really does
  // send his kid on, it introduces the Canadian Tire — which damage.js already
  // knows as the paid garage — and the chemin d'Aylmer, and the change out of
  // the hundred is the first money in the envelope.
  //
  // No timer on either stage. It is the first two minutes: the player is still
  // finding out that W goes and S stops, and a clock would teach him to panic
  // instead of to drive.
  {
    id: 'alternateur',
    title: 'L’alternateur',
    brief: 'La lumière de batterie clignote depuis mardi. Ton père a laissé les clés, un cent piastres, pis un alternateur payé qui t’attend au comptoir du Canadian Tire.',
    giver: 'home',
    timeOfDay: 'morning',
    build(ctx) {
      return [
        {
          text: 'Canadian Tire — le comptoir des commandes',
          sub: 'W pour partir, suis la ligne bleue du GPS, arrête-toi (S) dans le pilier jaune pis E — c’est payé, c’est au nom de ton père',
          hint: 'Chemin d’Aylmer, vers l’ouest. La grosse enseigne rouge, à gauche. Tab ouvre la grande carte.',
          at: 'ctire', radius: 18, time: null,
          hold: true, holdText: 'E — ramasser l’alternateur',
          toast: 'Une boîte grise pis vingt-deux piasses de change.\nLe gars te demande même pas ton nom.',
        },
        {
          text: 'Ramène la boîte au 299 Chemin Fraser',
          sub: `GPS jusqu’au pilier jaune dans l’entrée, pis 40 km/h max en arrivant (S pour freiner) — la boîte est debout sur le banc du ${ctx.carName}`,
          hint: 'Chez vous, plein est: le chemin d’Aylmer, pis le chemin Fraser au bout.',
          at: 'home', radius: 14, time: null, maxSpeed: 40,
          toast: 'La boîte sur l’établi. Ton père la posera à soir.',
          money: 22,
        },
      ];
    },
  },

  {
    id: 'school',
    title: 'Première période',
    brief: "Tu t'es réveillé à 8h52. Le cours d'anglais est à 9h.",
    giver: 'home',
    timeOfDay: 'morning',
    build(ctx) {
      return [{
        text: 'Heritage College — secteur Hull',
        sub: `W pour partir, suis la ligne bleue du GPS jusqu'au pilier jaune (le ${ctx.carName} est déjà chaud)`,
        hint: "C'est plein est, au bout du chemin d'Aylmer. Tab ouvre la grande carte.",
        at: 'heritage',
        radius: 24,
        // This is the first expansion drive: Aylmer, the highway seam, then
        // Saint-Joseph in Hull. Five minutes leaves room for one wrong exit.
        time: 420,
        toast: 'Arrivé. Personne a rien vu.',
        money: 20,
      }];
    },
  },

  {
    id: 'highwayhull',
    title: 'Highway to Hull',
    brief: 'La 148 est ouverte. On va voir si Hull est vraiment si loin que ça.',
    giver: 'home',
    timeOfDay: 'dusk',
    build() {
      return [
        {
          text: 'Prends la sortie vers Hull',
          sub: 'W pis suis le GPS jusqu’au pilier jaune à l’entrée de l’autoroute',
          hint: 'Chemin d’Aylmer vers l’est, jusqu’au nouveau tronçon de la 148.',
          at: 'hullgate', radius: 24, time: 260,
          toast: 'La pancarte dit Hull. Là, c’est pour vrai.',
        },
        {
          text: 'Fais un arrêt au musée',
          sub: 'Suis le GPS par Alexandre-Taché, puis ralentis à 45 km/h dans le pilier',
          hint: 'Prends la bretelle, puis continue vers le parc Jacques-Cartier.',
          at: 'hullmuseum', radius: 24, time: 300, maxSpeed: 45,
          toast: 'Hull débloqué — les grosses bâtisses commencent ici.',
        },
        {
          text: 'Termine au centre-ville de Hull',
          sub: 'GPS jusqu’au dernier pilier sur la promenade du Portage',
          hint: 'Continue vers l’est par Montcalm, Eddy ou Maisonneuve.',
          at: 'hulldowntown', radius: 22, time: 110,
          toast: 'Aylmer derrière, Hull devant. Expansion débloquée.',
          money: 60,
        },
      ];
    },
  },

  {
    id: 'chelsea',
    title: 'La run de Chelsea',
    brief: 'Heritage est derrière toi. La 105 monte encore jusqu’à Chelsea.',
    giver: 'heritage',
    timeOfDay: 'morning',
    build() {
      return [{
        text: 'Monte jusqu’au village de Chelsea',
        sub: 'W pis suis le GPS vers le nord jusqu’au pilier jaune à l’hôtel de ville',
        hint: 'Remonte par Saint-Joseph, puis prends la route 105 vers Chelsea.',
        at: 'chelsea', radius: 24, time: 600, maxSpeed: 45,
        toast: 'Chelsea. T’es rendu pas mal plus loin que le dep.',
        money: 75,
      }];
    },
  },

  {
    id: 'gang',
    title: 'Ramasser la gang',
    brief: 'Margaret, Sayyad pis Adam veulent chill au parc. Devine qui a le char.',
    giver: 'principale',
    timeOfDay: 'day',
    build(ctx) {
      const marc = {
        text: 'Ramasse Margaret — 299 Chemin Fraser',
        sub: 'Suis le GPS pis arrête-toi dans le pilier jaune — elle embarque toute seule',
        hint: 'Elle est chez vous, dans ta propre entrée. Le pilier est sur ton char.',
        at: 'home', radius: 13, toast: 'Margaret embarque', passengers: +1,
      };
      const steph = {
        text: 'Ramasse Sayyad — 75 Denise-Friend',
        sub: 'GPS jusqu’au pilier jaune — il amène le radio pis les cassettes',
        hint: 'Denise-Friend, dans le Vieux-Aylmer. La ligne bleue t’y amène.',
        at: 'steph', radius: 13, toast: 'Sayyad embarque', passengers: +1,
        // ...and the first thing he does is turn the radio on.
        onExit: (G) => { if (G && G.radio) G.radio.power(true); },
      };
      // Adam vient de Mayo, quarante minutes à l'est: il ne se ramasse pas chez
      // eux, il arrive. Le Sunfire est stationné à la marina depuis à matin.
      const dave = {
        text: 'Ramasse Adam — le stationnement de la marina',
        sub: 'GPS jusqu’au pilier jaune — il a fait la route de Mayo à matin, il attend à côté du Sunfire',
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
          { ...steph, sub: "GPS jusqu'au pilier — trois sur le banc, c'est pas légal, il s'assoit au milieu pareil" },
          beach('S pour freiner: 45 km/h max dans le pilier, y a des kids', -2),
          { ...dave, sub: 'GPS — deuxième voyage, il a même pas remarqué' },
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
          text: 'Galeries Aylmer — la commande de Sayyad',
          sub: 'GPS jusqu’au pilier jaune — l’entrée sud, sous l’auvent orange. C’est payé, c’est à son nom.',
          hint: 'Les Galeries sont sur le chemin d’Aylmer. La porte sud donne sur le stationnement. Tab pour la carte.',
          at: 'foodcourt', radius: 14,
          toast: 'Deux poutines. Sauce à part, comme il a dit trois fois.',
        },
        {
          text: 'Livre chez Sayyad — 75 Denise-Friend',
          sub: `GPS, pis 40 km/h max en arrivant (S pour freiner) — le fromage fait scouic dans le ${ctx.carName}`,
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
    title: 'Run au dep',
    brief: 'Slush bleue pour tout le monde, pis on redescend au parc.',
    giver: 'gas',
    timeOfDay: 'dusk',
    build() {
      return [
        {
          text: 'Dépanneur Palmyra — quatre slush',
          sub: 'GPS jusqu’au pilier jaune, arrête-toi dedans — quatre slush pis des chips au ketchup',
          hint: 'Le dep est sur Principale, dans le Vieux-Aylmer.',
          at: 'dep', radius: 14,
          toast: 'Quatre slush bleues. Ta langue est déjà bleue.',
        },
        {
          text: 'Parc des Cèdres — avant que ça fonde',
          sub: 'W à fond, suis le GPS jusqu’au pilier jaune — ça fond, ça fond, ça fond',
          hint: 'Plein ouest par la Principale, le long de la rivière.',
          at: 'beach', radius: 20, time: 95,
          toast: 'Encore de la slush dedans. De justesse.',
          money: 15,
        },
      ];
    },
  },

  {
    id: 'cv',
    title: 'Distribuer les CV',
    brief: "Ta mère a imprimé douze copies. Faut en placer trois aujourd'hui.",
    giver: 'home',
    timeOfDay: 'day',
    build() {
      return [
        {
          text: 'CV #1 — Tim Hortons, rue Principale',
          sub: 'GPS jusqu’au pilier jaune, arrête-toi — demande le gérant, pas la fille au comptoir',
          hint: 'Le Tim est sur la Principale, dans le Vieux-Aylmer.',
          at: 'tims', radius: 14,
          toast: '« On rappelle. » Ils rappellent jamais.',
        },
        {
          text: 'CV #2 — Galeries Aylmer',
          sub: 'GPS jusqu’au pilier jaune — trois magasins, même CV, trois sourires',
          hint: 'Les Galeries, chemin d’Aylmer. Suis la ligne bleue.',
          at: 'mall', radius: 22,
          toast: 'Un des trois avait vraiment besoin de monde',
        },
        {
          text: 'CV #3 — Marina d’Aylmer',
          sub: 'GPS jusqu’au pilier jaune sur le quai — le casse-croûte cherche du monde pour l’été',
          hint: 'La marina est à l’ouest du Vieux, au bord de l’eau.',
          at: 'marina', radius: 16,
          toast: 'Essai samedi matin. Six heures. Six heures du matin.',
          money: 25,
        },
      ];
    },
  },

  {
    id: 'curfew',
    title: 'Avant minuit',
    brief: 'Le feu est éteint à la marina. Ton père se couche jamais avant toi.',
    giver: 'marina',
    timeOfDay: 'night',
    build(ctx) {
      return [{
        text: 'Chez vous — 299 Chemin Fraser, avant minuit',
        sub: `Traverse la ville par le GPS, pis 35 km/h max dans le pilier (S pour freiner) — le ${ctx.carName} fait trop de bruit dans l'entrée`,
        hint: "Chez vous, c'est à l'est de la ville. Tab pour voir le chemin au complet.",
        at: 'home', radius: 14, time: 210, maxSpeed: 35,
        toast: 'Lumière de la cuisine éteinte. Tu es correct.',
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
          text: 'Spot 1/5 — le phare de la marina',
          sub: 'GPS jusqu’au pilier jaune — le meilleur point de vue sur l’Outaouais',
          hint: 'La marina, à l’ouest du Vieux-Aylmer. Le chrono roule.',
          at: 'lookout', radius: 16, time: 100,
        },
        {
          text: 'Spot 2/5 — Aréna Frank-Robinson',
          sub: 'GPS jusqu’au pilier jaune — fermé pour l’été, le stationnement est à nous',
          hint: 'Frank-Robinson, au nord de la Principale.',
          at: 'arena', radius: 18, time: 95,
        },
        {
          // Chemin d'Aylmer runs at z = -40; this sits in front of the Galeries.
          text: "Spot 3/5 — chemin d'Aylmer, devant les Galeries",
          sub: 'GPS jusqu’au pilier jaune, fenêtres baissées',
          hint: 'Plein est sur le chemin d’Aylmer, en face du centre d’achat.',
          at: { x: 236, z: -40 }, radius: 16, time: 95,
        },
        {
          text: 'Spot 4/5 — rue Principale',
          sub: 'GPS jusqu’au pilier jaune — le Vieux-Aylmer au complet en une passe',
          hint: 'Reviens vers l’ouest par la Principale.',
          at: 'principale', radius: 15, time: 125,
        },
        {
          text: 'Spot 5/5 — Parc des Cèdres',
          sub: 'GPS jusqu’au dernier pilier — le soleil tombe dans la rivière',
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
// ...and the golf cart's own errand, which is the only job that decides what
// you are driving instead of asking (golfjob.js).
// ...and the summer's five beats (arc.js), which arrive in order. MISSIONS is
// the live array main.js re-filters every frame, so an unlocked beat is a push
// and the map marker turns up on its own. ALL_MISSIONS is the whole set,
// locked or not — the audits and the timer table want everything.
// The order the jobs are offered in, which is the order a new player meets the
// game. It used to be the order they happened to be written in, and that put the
// three long expansion drives first: the opening job was a seven-minute run to
// Heritage College with nothing on the way and twenty dollars at the end. That
// is a bad first hour — it is long, it is empty, and it teaches nothing.
//
// Open near home, short, with somebody at the far end and a car to show for it.
// « Ramasser la gang » hands you Margaret's Saturn, « Poutine express » Sayyad's
// Civic. Earn a set of keys inside ten minutes, then let the map get bigger. The
// long hauls are still all here, they are just no longer the first thing anybody
// sees.
//
// « Poutine express » held the top of this list until the first playtest, and
// Thomas said two things about it: the first job should be buying something at
// the Canadian Tire, and « reality is I never went to the poutine place so it
// just doesn't feel right ». So the summer now opens on the errand that came
// with the keys — the alternator, no clock, one road there and back — and the
// poutine run drops to fifth, after Sayyad is a person you have met twice. It
// keeps everything that hangs off it (the Civic in garage.js, the Sayyad chain
// in famouscars.js, the two start points in main.js); it just is not what a
// stranger is asked to do in his first two minutes.
//
// nearestJob() breaks distance ties in MISSIONS order, and every `home` job is
// the same nought metres from the driveway, so whichever `home` job stands
// highest here is the one a fresh save is offered. That is this list's second
// job, and the reason « L'alternateur » has to be at the top and not merely
// early.
const OPENING_ORDER = [
  'alternateur',  // the errand that came with the keys — Canadian Tire and back
  'dep',          // 95 s, the dépanneur run
  'gang',         // pick the friends up — Margaret's Saturn
  'sayyad',       // doughnuts outside 75 Denise-Friend
  'poutine',      // his order, his money, your truck — and Sayyad's Civic
  'curfew',       // home before midnight — Adam's Sunfire
  'cv',           // hand out the résumés
  'divan',        // the couch, and the tree
  'school',       // now the map opens up
  'tour',
  'canot',
  'highwayhull',
  'chelsea',
];
const openingRank = (m) => {
  const i = OPENING_ORDER.indexOf(m.id);
  return i < 0 ? OPENING_ORDER.length : i;
};
const byOpening = (a, b) => openingRank(a) - openingRank(b);

// Wave 3: the jobs that are not deliveries sit after the opening and before the
// races, so a new player meets « Suis Sayyad » before the fourth courier run.
export const MISSIONS = [...CORE_MISSIONS, ...SIDE_MISSIONS].sort(byOpening)
  .concat(VERB_MISSIONS, RACE_MISSIONS, GOLF_MISSIONS, openBeats(new Set()));
export const ALL_MISSIONS = [...CORE_MISSIONS, ...SIDE_MISSIONS, ...VERB_MISSIONS, ...RACE_MISSIONS, ...GOLF_MISSIONS, ...ARC];

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
    m.brief = (m.brief ? m.brief + ' ' : '') + `\u00c7a te donne ${keys}.`;
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

// What G.done looked like the last time we recomputed. Loading a save or
// starting a new game hands main.js a brand new Set, so comparing the object
// itself catches "this is a different summer" as well as "you finished a job".
let arcSeen = null;
let arcSize = -1;

/**
 * Bring MISSIONS in line with the gates: push in a beat that has just been
 * earned, take out one that belongs to a summer you are no longer playing.
 * Called once a frame from main.js's hook block, and on almost every frame it
 * does nothing but compare two numbers.
 *
 * Returns the beats added by this call, so a test can watch the summer open up.
 */
export function unlockArc(G) {
  const done = (G && G.done) || new Set();
  if (done === arcSeen && done.size === arcSize) return [];
  const fresh = done !== arcSeen;
  arcSeen = done; arcSize = done.size;
  ensureArcText();
  // A new save: drop the beats it has not earned. (Never mid-summer — only when
  // the Set identity changed, so finishing a job cannot delete a beat.)
  if (fresh) {
    for (let i = MISSIONS.length - 1; i >= 0; i--) {
      if (ARC.includes(MISSIONS[i]) && !gateOpen(MISSIONS[i].id, done)) MISSIONS.splice(i, 1);
    }
  }
  const added = [];
  for (const def of ARC) {
    if (MISSIONS.includes(def) || !gateOpen(def.id, done)) continue;
    MISSIONS.push(def);
    added.push(def);
  }
  // Silent on the first sync of a save — you did not just earn those. The toast
  // is for the beat that opens while you are standing there.
  if (added.length && !fresh && G && G.hud) {
    for (const def of added) {
      const p = PLACES[def.giver];
      G.hud.toast(`NOUVELLE JOB\n${def.title}\n${p && p.label ? p.label : ''}`, 3600);
    }
    G.audio && G.audio.chime(true);
  }
  return added;
}

/** Tests only: forget which save we were tracking. */
export function resetArcSync() { arcSeen = null; arcSize = -1; }

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
