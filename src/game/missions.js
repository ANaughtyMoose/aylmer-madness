// Missions and lighting presets. Everything here is data + pure builders; the
// only shared state is localStorage, and that is always optional.
import { PLACES } from './places.js';
import { SIDE_MISSIONS } from './sidejobs.js';

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
  {
    id: 'school',
    title: 'Première période',
    brief: "Tu t'es réveillé à 8h52. Le cours d'anglais est à 9h.",
    giver: 'home',
    timeOfDay: 'morning',
    build(ctx) {
      return [{
        text: 'Heritage College — sortie vers Hull',
        sub: `Chemin d'Aylmer jusqu'au bout de la ville, le ${ctx.carName} est déjà chaud`,
        at: 'heritage',
        radius: 24,
        time: 130,
        toast: 'Arrivé. Personne a rien vu.',
      }];
    },
  },

  {
    id: 'gang',
    title: 'Ramasser la gang',
    brief: 'Marc, Steph pis Dave veulent chill au parc. Devine qui a le char.',
    giver: 'principale',
    timeOfDay: 'day',
    build(ctx) {
      const marc = {
        text: 'Chez Marc', sub: 'il est dehors depuis vingt minutes',
        at: 'marc', radius: 13, toast: 'Marc embarque', passengers: +1,
      };
      const steph = {
        text: 'Chez Steph', sub: "elle amène le radio pis les cassettes",
        at: 'steph', radius: 13, toast: 'Steph embarque', passengers: +1,
      };
      const dave = {
        text: 'Chez Dave', sub: 'il habite loin, on le sait, il le sait',
        at: 'dave', radius: 13, toast: 'Dave embarque', passengers: +1,
      };
      const beach = (sub, passengers) => ({
        text: 'Parc des Cèdres',
        sub,
        at: 'beach', radius: 20, maxSpeed: 45,
        toast: 'Tout le monde débarque', passengers,
      });

      // The Ranger's bench seats three total, so two friends is the legal max
      // and the run has to be done twice.
      if (ctx.seats < 3) {
        return [
          marc,
          { ...steph, sub: "trois sur le banc, c'est pas légal — elle s'assoit au milieu pareil" },
          beach('dépose-les, tranquille, y a des kids', -2),
          { ...dave, sub: 'deuxième voyage, il a même pas remarqué' },
          beach('pour de vrai cette fois', -1),
        ];
      }
      return [marc, steph, dave, beach('roule lentement, y a des kids partout', -3)];
    },
  },

  {
    id: 'poutine',
    title: 'Poutine express',
    brief: 'Food court des Galeries, deux grosses poutines, pis ça refroidit vite.',
    giver: 'home',
    timeOfDay: 'day',
    build(ctx) {
      return [
        {
          text: 'Galeries Aylmer',
          sub: 'food court, au fond à gauche',
          at: 'mall', radius: 22,
          toast: 'Deux poutines. Sauce à part, comme demandé.',
        },
        {
          text: 'Chez Steph',
          sub: `avant que le fromage arrête de faire scouic dans le ${ctx.carName}`,
          at: 'steph', radius: 13, time: 95, maxSpeed: 40,
          toast: 'Livrées encore chaudes. Légende.',
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
          text: 'Dépanneur du Coin',
          sub: 'quatre slush, pis des chips au ketchup',
          at: 'dep', radius: 14,
          toast: 'Quatre slush bleues. Ta langue est déjà bleue.',
        },
        {
          text: 'Parc des Cèdres',
          sub: 'ça fond, ça fond, ça fond',
          at: 'beach', radius: 20, time: 95,
          toast: 'Encore de la slush dedans. De justesse.',
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
          text: 'Tim Hortons',
          sub: "demande le gérant, pas la fille au comptoir",
          at: 'tims', radius: 14,
          toast: '« On rappelle. » Ils rappellent jamais.',
        },
        {
          text: 'Galeries Aylmer',
          sub: 'trois magasins, même CV, trois sourires',
          at: 'mall', radius: 22,
          toast: 'Un des trois avait vraiment besoin de monde',
        },
        {
          text: 'Marina d’Aylmer',
          sub: 'le casse-croûte cherche quelqu’un pour l’été',
          at: 'marina', radius: 16,
          toast: 'Essai samedi matin. Six heures. Six heures du matin.',
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
        text: 'Chez vous',
        sub: `traverse la ville — le ${ctx.carName} fait trop de bruit dans l'entrée`,
        at: 'home', radius: 14, time: 210, maxSpeed: 35,
        toast: 'Lumière de la cuisine éteinte. Tu es correct.',
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
          text: 'Le phare de la marina',
          sub: 'le meilleur point de vue sur l’Outaouais',
          at: 'lookout', radius: 16, time: 100,
        },
        {
          text: 'Aréna d’Aylmer',
          sub: 'fermé pour l’été, le stationnement est à nous',
          at: 'arena', radius: 18, time: 95,
        },
        {
          // Chemin d'Aylmer runs at z = -40; this sits in front of the Galeries.
          text: "Chemin d'Aylmer",
          sub: 'devant les Galeries, fenêtres baissées',
          at: { x: 236, z: -40 }, radius: 16, time: 95,
        },
        {
          text: 'Rue Principale',
          sub: 'le vieux Aylmer au complet en une passe',
          at: 'principale', radius: 15, time: 125,
        },
        {
          text: 'Parc des Cèdres',
          sub: 'dernier arrêt — le soleil tombe dans la rivière',
          at: 'beach', radius: 20, time: 100,
          toast: 'Tu connais ta ville, là.',
        },
      ];
    },
  },
];

// The side jobs (canoe / Sayyad / couch) are the ones that need stateful stages,
// so they are built in sidejobs.js. They are ordinary MISSIONS entries here.
export const MISSIONS = [...CORE_MISSIONS, ...SIDE_MISSIONS];

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
for (const m of MISSIONS) {
  if (!PLACES[m.giver]) throw new Error(`mission ${m.id}: unknown giver ${m.giver}`);
  if (!TIME_OF_DAY[m.timeOfDay]) throw new Error(`mission ${m.id}: unknown timeOfDay`);
}
