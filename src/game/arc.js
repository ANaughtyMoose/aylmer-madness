// The summer, in five beats.
//
// The game had seventeen jobs and no shape. assets/text/arc.json gives it one:
// the keys in late June, the town's logistics in July, the radiator hose on the
// Champlain span, the last big night, and the morning the keys go back on the
// kitchen counter. Each beat is an ordinary MISSIONS entry — same stage model,
// same yellow pillar — so nothing in main.js has to know the arc exists.
//
// Two things are different from every other job:
//
//   1. They arrive in order. MISSIONS is a live array that main.js re-filters
//      every frame, so `unlockArc(G)` pushes the next beat onto it when its gate
//      opens and the marker simply appears on the map. The gate is progress, not
//      a calendar: the day/night cycle is a ten-minute loop, not a season, so
//      "it is August now" has to mean "you have done fourteen jobs".
//   2. The epilogue has no clock. No `time` on any stage, no rivals, and its
//      stages clear the police heat every tick. Everything else in this game is
//      a countdown; the last thing you do should not be.
//
// Text comes from assets/text/arc.json at runtime (loadArcText), which
// overwrites the titles and briefs below. The ones written here are the
// fallback, so a missing assets/ costs you the wording and nothing else.
import { PLACES } from './places.js';
import { restoreDamage } from './damage.js';

// ---------------------------------------------------------------- geography

// Places the arc needs that places.js has no key for. Every one of these is a
// point on the real road graph (checked with Nav: each routes from Aylmer), so
// the GPS line reaches them like any other target.
//
//   SPAN      mid-span on the Pont Champlain, where the hose lets go
//   SHOULDER  228 m further on, the first place you can get off the road
//   CHAUDIERE / ALEXANDRA  two more of the river crossings
//   NEPEAN    the Ottawa end of the Alexandra, under the Champlain statue —
//             Nepean Point, with Parliament lit up across the water
//   LUCERNE_A / LUCERNE_B  1,5 km of Boulevard de Lucerne, which is where
//             Sayyad's midnight time trials happen because it is empty at
//             midnight and it always was
export const SPAN = { x: 6194, z: -1491 };
export const SHOULDER = { x: 6300, z: -1300 };
export const CHAUDIERE = { x: 9078, z: -3194 };
export const ALEXANDRA = { x: 10478, z: -3890 };
export const NEPEAN = { x: 10660, z: -3855 };
export const LUCERNE_A = { x: 942, z: 1010 };
export const LUCERNE_B = { x: 2424, z: 805 };

// What the hose costs, and what the Ranger is worth driving in the meantime.
// 55 is above DAMAGE.COSMETIC (the HUD starts nagging and the map puts a wrench
// on Norm's) and below DAMAGE.PERF (it does not start pulling to one side), so
// you feel it without being punished for the next twenty minutes.
export const HOSE = { damage: 55, parts: 60 };

const say = (G, text, ms) => G && G.hud && G.hud.toast(text, ms);

// ---------------------------------------------------------------- the beats

// 1 — Les clés du Ranger -----------------------------------------------------

const keys = {
  id: 'arckeys',
  beat: 'prologue',
  title: 'Les clés du Ranger',
  brief: 'Ton père laisse les clés du Ranger pour l’été. Une condition: t’es le camion de la famille.',
  giver: 'home',
  timeOfDay: 'morning',
  build() {
    return [
      {
        kind: 'load',
        text: '299 Chemin Fraser — charge les outils',
        sub: 'Arrête-toi dans le pilier jaune de l’entrée, pis E pour charger',
        hint: 'Le pilier est sur ton propre char, dans ton entrée. Faut être arrêté pour que le E marche.',
        at: 'home', radius: 13, hold: true,
        holdText: 'E — charger la tondeuse pis les outils',
        toast: 'Ton père: « Tu fais le transport, tu mets ton gaz. C’est ça, le deal. »',
      },
      {
        text: 'Livre-les à la paroisse Saint-Paul',
        sub: 'Suis la ligne bleue du GPS, pis 40 km/h max dans le pilier (S pour freiner)',
        hint: 'L’église est sur la rue Bancroft, dans le Vieux-Aylmer. Tab pour la grande carte.',
        at: 'church', radius: 16, maxSpeed: 40,
        toast: 'Le bedeau te fait un signe de tête. C’est déjà beaucoup.',
        money: 20,
      },
      {
        text: 'Le dep — la gang t’attend',
        sub: 'GPS jusqu’au pilier jaune, arrête-toi dedans',
        hint: 'Dépanneur Palmyra, sur la rue Principale. Deux coins de rue de l’église.',
        at: 'dep', radius: 14,
        toast: 'Sayyad, en voyant le Ranger: « OK. OK! On fait quoi à soir, d’abord? »',
      },
      {
        text: 'La marina, avant que le soleil tombe',
        sub: 'W pis suis le GPS plein ouest jusqu’au dernier pilier',
        hint: 'La marina est à l’ouest du Vieux, au bord de l’eau. Le chrono roule.',
        at: 'marina', radius: 16, time: 240,
        toast: 'Deux mois. Ça a l’air infini, deux mois.',
        money: 20,
      },
    ];
  },
};

// 2 — La bâche bleue ---------------------------------------------------------

const bache = {
  id: 'arcbache',
  beat: 'turn1',
  title: 'La bâche bleue',
  brief: 'La Saint-Jean s’installe à la plage. T’es devenu le camion de la ville au complet.',
  giver: 'mall',
  timeOfDay: 'day',
  build(ctx) {
    return [
      {
        kind: 'load',
        text: 'Galeries d’Aylmer — les haut-parleurs',
        sub: 'GPS jusqu’au pilier jaune, arrête-toi, pis E pour charger',
        hint: 'Le stationnement des Galeries, chemin d’Aylmer. Faut être arrêté dans le pilier.',
        at: 'mall', radius: 22, hold: true,
        holdText: `E — charger les haut-parleurs pis la bâche bleue dans le ${ctx.carName}`,
        toast: 'Deux caisses de son, une bâche bleue, pis huit tendeurs. Ça va tenir.',
      },
      {
        text: 'Plage des Cèdres — sans rien casser',
        sub: 'GPS, pis 35 km/h max dans le pilier (S pour freiner) — c’est fragile',
        hint: 'Plein ouest par la Principale, jusqu’au bout, au bord de la rivière.',
        at: 'beach', radius: 20, maxSpeed: 35, time: 320,
        toast: 'Montés, branchés, pis ça marche. La plage a du son.',
        money: 35,
      },
      {
        text: 'Sayyad t’attend sur Lucerne',
        sub: 'GPS jusqu’au pilier jaune — il a sa montre à son père dans la main',
        hint: 'Boulevard de Lucerne, à l’est du Vieux, le long de la rivière.',
        at: LUCERNE_A, radius: 20,
        toast: 'Sayyad: « Un kilomètre et demi. Je pars le chrono quand tu bouges. »',
      },
      {
        kind: 'trial',
        text: 'Le sprint de minuit — 1,5 km sur Lucerne',
        sub: 'W à fond, suis le GPS jusqu’au dernier pilier. Pas de rival: juste le chrono.',
        hint: 'Reste sur Lucerne, vers l’est. C’est droit. C’est vraiment juste droit.',
        at: LUCERNE_B, radius: 22, time: 115,
        failWhy: 'Sayyad: « ...bon. On recommencera. »',
        toast: 'Sayyad: « Ok. OK. Refais-le pas devant du monde, je vais avoir l’air fou. »',
        money: 20,
      },
    ];
  },
};

// 3 — La surchauffe du pont --------------------------------------------------
//
// The beat that turns the economy from a menu into a consequence: the truck
// breaks in public, Norm fixes it for money, and the money has to come from
// somewhere. It does not build its own repair system — it sets the damage and
// then charges the parts through the ordinary stage `cost`, which is the same
// wallet gate the yard-sale canoe uses.

const surchauffe = {
  id: 'arcsurchauffe',
  beat: 'turn2',
  title: 'La surchauffe du pont',
  brief: 'Canicule de juillet. Un divan, le pont Champlain, l’heure de pointe. Ça va bien aller.',
  giver: 'home',
  timeOfDay: 'day',
  build(ctx) {
    return [
      {
        kind: 'load',
        text: '299 Chemin Fraser — charge le divan',
        sub: 'Arrête-toi dans le pilier de l’entrée, pis E pour charger',
        hint: 'Chez vous. Le divan de ta tante s’en va à Hull. Faut être arrêté pour le E.',
        at: 'home', radius: 13, hold: true,
        holdText: `E — charger le divan sur le ${ctx.carName}`,
        toast: 'Zahra embarque: « Y fait 34. T’as-tu regardé ton gauge une fois cet été? »',
      },
      {
        kind: 'blow',
        text: 'Le pont Champlain — plein est',
        sub: 'W pis suis la ligne bleue du GPS jusqu’au pilier au milieu du pont',
        hint: 'Prends le chemin d’Aylmer vers l’est, pis la 148. Le pont est indiqué.',
        at: SPAN, radius: 30,
        toast: 'BANG.\nUn boyau de radiateur, en plein milieu du pont, à l’heure de pointe.\nCent chars derrière toi. Cent klaxons.',
        onExit(G) {
          // The whole point of the beat. restoreDamage is damage.js's own
          // "the car arrives already hurt" path, so the HUD, the map wrench and
          // Norm's price all pick it up without a special case anywhere.
          if (G.veh) restoreDamage(G.veh, Math.max(G.veh.damage || 0, HOSE.damage));
          if (G.health && G.veh) G.health[G.veh.spec.id] = G.veh.damage;
          if (G.repairHints) { G.repairHints.h25 = false; G.repairHints.h60 = false; }
        },
      },
      {
        text: 'Sors-toi de là — l’accotement',
        sub: 'Laisse-la rouler pis 30 km/h max dans le pilier (S pour freiner)',
        hint: 'Deux cents mètres de plus, de l’autre bord du pont. Elle fume, mais elle avance.',
        at: SHOULDER, radius: 18, maxSpeed: 30,
        toast: 'Zahra, sans lever les yeux: « J’ai appelé Norm de la cabine. Y arrive. »',
        onExit(G) {
          // The flatbed. Norm does not drive you back — he drives the truck
          // back, and you are at his garage when it gets there.
          const p = PLACES.ctire;
          if (G.veh && p) {
            G.veh.reset(p.x, p.z, p.a || 0);
            G.veh.syncFrame && G.veh.syncFrame();
          }
          say(G, 'Norm charge le Ranger sur la plateforme sans dire un mot.\nSoixante-cinq kilomètres de silence.', 3600);
        },
      },
      {
        kind: 'lecture',
        text: 'Garage Lafleur — écoute Norm',
        sub: 'T’es déjà dans le pilier: appuie sur E',
        hint: 'Norm Lafleur, chemin d’Aylmer. Il a une Export A derrière l’oreille pis rien à te vendre.',
        at: 'ctire', radius: 20, hold: true,
        holdText: 'E — écouter Norm',
        toast: 'Norm: « Un boyau, c’est huit piasses. Un moteur, c’est deux mille. »\n« Les pièces: 60 $. Fais-moi mes trois livraisons pis on est quittes. »',
      },
      {
        text: 'Livraison 1/3 — Galeries d’Aylmer',
        sub: 'GPS jusqu’au pilier jaune dans le stationnement, arrête-toi dedans',
        hint: 'Les Galeries sont sur le chemin d’Aylmer, deux minutes du garage.',
        at: 'mall', radius: 22,
        toast: 'Un alternateur pour le gars du Canadian Tire. 30 $.',
        money: 30,
      },
      {
        text: 'Livraison 2/3 — le McDo du chemin d’Aylmer',
        sub: 'GPS, pis 40 km/h max dans le pilier (S pour freiner)',
        hint: 'Plus loin à l’est sur le chemin d’Aylmer. Le gérant attend une caisse.',
        at: 'mcdo', radius: 18, maxSpeed: 40,
        toast: 'Le gérant te donne un Coke avec. 30 $.',
        money: 30,
      },
      {
        text: 'Livraison 3/3 — la station',
        sub: 'GPS jusqu’au pilier jaune, arrête-toi',
        hint: 'Le Petro-Canada. Norm leur doit un jeu de filtres depuis mars.',
        at: 'gas', radius: 18, time: 300,
        toast: 'Trois sur trois. T’as gagné soixante piasses en une soirée.',
        money: 30,
      },
      {
        kind: 'pay',
        text: 'Paye Norm — 60 $ de pièces',
        sub: 'Retourne au garage par le GPS, arrête-toi dans le pilier, pis E',
        hint: 'Garage Lafleur, chemin d’Aylmer. Faut avoir les 60 $ sur toi.',
        at: 'ctire', radius: 20, hold: true, cost: HOSE.parts,
        holdText: `E — payer Norm   ·   ${HOSE.parts} $`,
        brokeText: 'Norm: « Reviens quand t’auras l’argent. Le camion bouge pas d’icitte. »',
        toast: 'Norm: « Astheure tu sais ce que ça coûte. »\nLe Ranger est réparé.',
        onExit(G) {
          if (G.veh) G.veh.repair();
          if (G.health && G.veh) G.health[G.veh.spec.id] = 0;
          if (G.repairHints) { G.repairHints.h25 = false; G.repairHints.h60 = false; }
          if (G.hud) { G.hud.setRepairHint(null); G.hud.setRepairPrompt(null); }
        },
      },
    ];
  },
};

// 4 — La dernière veillée ----------------------------------------------------

const veillee = {
  id: 'arcveillee',
  beat: 'turn3',
  title: 'La dernière veillée',
  brief: 'Les lettres d’acceptation sont arrivées. Un convoi, les ponts, pis du take-out à Nepean Point.',
  giver: 'arena',
  timeOfDay: 'dusk',
  build() {
    return [
      {
        kind: 'load',
        text: 'Stationnement de l’aréna — le convoi part d’ici',
        sub: 'Arrête-toi dans le pilier jaune, pis E quand t’es prêt',
        hint: 'Aréna Frank-Robinson, au nord de la Principale. Cinq chars t’attendent.',
        at: 'arena', radius: 18, hold: true,
        holdText: 'E — partir le convoi',
        toast: 'Cinq chars. Mike ouvre, toi tu fermes.\nMontréal pis Toronto dans trois semaines.',
      },
      {
        text: 'Pont 1 — le Champlain',
        sub: 'W pis suis la ligne bleue du GPS jusqu’au pilier au milieu du pont',
        hint: 'Plein est par le chemin d’Aylmer pis la 148. Pas de chrono à soir.',
        at: SPAN, radius: 30,
        toast: 'Adam klaxonne en montant sur le pont. Tout le monde klaxonne.',
      },
      {
        text: 'Pont 2 — la Chaudière',
        sub: 'GPS vers l’est jusqu’au pilier — reste avec le convoi (W)',
        hint: 'Continue vers Hull par Alexandre-Taché, la Chaudière est au bout.',
        at: CHAUDIERE, radius: 26,
        toast: 'Sayyad a baissé les quatre vitres. Personne se plaint.',
      },
      {
        text: 'Pont 3 — l’Alexandra',
        sub: 'GPS jusqu’au pilier, traverse vers Ottawa (W)',
        hint: 'Par le centre-ville de Hull, pis le pont de fer vers le musée.',
        at: ALEXANDRA, radius: 26,
        toast: 'Le pont de fer fait le bruit qu’il fait. Zahra le filme avec rien.',
      },
      {
        text: 'Nepean Point — les hayons, le take-out',
        sub: 'GPS jusqu’au dernier pilier, pis 30 km/h max en arrivant (S pour freiner)',
        hint: 'De l’autre bord de l’Alexandra, en haut, sous la statue. Le Parlement est en face.',
        at: NEPEAN, radius: 24, maxSpeed: 30,
        toast: 'Assis sur les hayons, le Parlement allumé de l’autre bord de l’eau.\nPersonne dit rien pendant un bout.',
        money: 45,
      },
    ];
  },
};

// 5 — Le dernier voyage ------------------------------------------------------
//
// No `time` on any stage, no rivals, and cops.clear() every tick. That is not a
// style choice: a countdown here would turn the last thing you do in this game
// into something you can fail.

const noCops = (G) => { if (G && G.cops && G.cops.clear) G.cops.clear(); return null; };

const dernier = {
  id: 'arcdernier',
  beat: 'epilogue',
  title: 'Le dernier voyage',
  brief: 'Fin août, première fraîche. Les dernières boîtes de Mike, la gare, pis un tour de Principale.',
  giver: 'home',
  timeOfDay: 'morning',
  build() {
    return [
      {
        kind: 'load',
        text: 'Chez Mike — 129 avenue Frank-Robinson',
        sub: 'GPS jusqu’au pilier jaune, arrête-toi, pis E pour charger les boîtes',
        hint: 'Frank-Robinson, au nord de la Principale. Le divan est encore dans l’arbre.',
        at: 'mike', radius: 14, hold: true,
        holdText: 'E — charger les dernières boîtes',
        toast: 'Le divan est encore dans l’arbre. Personne l’a jamais descendu.\nMike: « Laisse-le. C’est correct. »',
        onTick: (G) => noCops(G),
      },
      {
        // The 59 to Ottawa left from the Galeries lot, and the Montreal bus went
        // from Ottawa. Nobody in Aylmer drove to a depot; you drove to the mall.
        text: 'Les Galeries — l’autobus part d’icitte',
        sub: 'Suis le GPS jusqu’au pilier dans le stationnement. Prends ton temps (W).',
        hint: 'Le stationnement incitatif des Galeries, chemin d’Aylmer. Y a pas de chrono.',
        at: 'mall', radius: 22,
        toast: 'Le 59 vers Ottawa, pis l’autobus de Montréal après.\nMike te serre la main comme si c’était normal, une poignée de main.\n« Ben. Bon. »',
        onTick: (G) => noCops(G),
      },
      {
        text: 'Un dernier tour de la rue Principale',
        sub: 'Reviens par le GPS, pis 40 km/h max dans le pilier (S pour freiner)',
        hint: 'Le Vieux-Aylmer. Lentement. C’est le but.',
        at: 'principale', radius: 16, maxSpeed: 40,
        toast: 'Le Tim, la Palmyra, l’Auberge. Tout est encore là.',
        onTick: (G) => noCops(G),
      },
      {
        kind: 'park',
        text: 'Chez vous — stationne-le comme il faut',
        sub: 'GPS jusqu’à l’entrée, arrête-toi dans le pilier, pis E',
        hint: '299 Chemin Fraser. Entre les deux lignes de l’entrée, pour une fois.',
        at: 'home', radius: 13, hold: true, stopped: 4,
        holdText: 'E — mettre les clés sur le comptoir',
        toast: 'Les clés à côté de la tasse de ton père.\nLa ville est encore là. Toi, t’es plus le même gars qu’en juin.',
        money: 20,
        onTick: (G) => noCops(G),
      },
    ];
  },
};

// ---------------------------------------------------------------- the gates

export const ARC = [keys, bache, surchauffe, veillee, dernier];

/**
 * When each beat turns up. `after` is the beat before it and `jobs` is how much
 * of the summer has to be behind you — a stand-in for the calendar, because the
 * day/night cycle is ten minutes long and July is not a thing the game can
 * count. The prologue is open from the first morning: it is the beat where you
 * get the keys.
 */
export const GATES = {
  // One job first. The game opens with your father having left the keys in the
  // change dish for a morning; « Les clés du Ranger » is him turning that into
  // a deal with conditions, which only means something once you have driven it.
  arckeys: { jobs: 1, after: null },
  arcbache: { jobs: 3, after: 'arckeys' },
  arcsurchauffe: { jobs: 6, after: 'arcbache' },
  arcveillee: { jobs: 10, after: 'arcsurchauffe' },
  arcdernier: { jobs: 14, after: 'arcveillee' },
};

/** Is this beat's gate open for a save with these finished jobs? */
export function gateOpen(id, done) {
  const g = GATES[id];
  if (!g) return true;
  const has = (k) => !!(done && done.has && done.has(k));
  const n = (done && done.size) || 0;
  if (g.after && !has(g.after)) return false;
  return n >= g.jobs;
}

/** The beats a save with these finished jobs should be able to see. */
export function openBeats(done) {
  return ARC.filter((d) => gateOpen(d.id, done));
}

// ---------------------------------------------------------------- the text

// Fallback: the titles and briefs written above. loadArcText replaces them.
export async function loadArcText(fetchImpl, base = 'assets/text/') {
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return null;
  try {
    const r = await f(base + 'arc.json', { cache: 'no-cache' });
    if (!r || !r.ok) return null;
    const j = await r.json();
    return Array.isArray(j && j.arc) ? j.arc : null;
  } catch { return null; }
}

/**
 * Overwrite the beats' titles from arc.json. The brief keeps the wording
 * written here — arc.json's `what` is a paragraph of English design notes, not
 * something a seventeen-year-old in Aylmer would read off a screen — but the
 * title is the beat's name and that comes from the file.
 */
export function applyArcText(rows, list = ARC) {
  if (!Array.isArray(rows)) return 0;
  let n = 0;
  for (const row of rows) {
    const def = list.find((d) => d.beat === (row && row.beat));
    if (!def || !row.title) continue;
    def.title = String(row.title);
    def.note = row.emotionalNote ? String(row.emotionalNote) : def.note;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- the voices

// story.js's FRIEND_LINES, for the five beats. It is registered at runtime
// rather than imported here: story.js imports missions.js and missions.js
// imports this file, so a static `import { FRIEND_LINES } from './story.js'`
// would read the binding while story.js is still half-evaluated and throw. A
// dynamic import inside registerArcLines() runs after every module is up.
export const ARC_LINES = {
  arckeys: {
    start: [
      ['Ton père', '« Tu fais le transport de la famille, pis tu mets ton gaz dedans. »'],
      ['Ton père', '« C\'est pas un cadeau. C\'est une entente. »'],
    ],
    end: [
      ['Sayyad', '« Deux mois. On a deux mois complets. »'],
      ['Margaret', '« Y va falloir que quelqu\'un le surveille, lui. »'],
    ],
  },
  arcbache: {
    start: [
      ['Sayyad', '« Les haut-parleurs, c\'est ceux de son père. Casse-les pas. »'],
      ['Zahra', '« Y sont pas à son père. Y sont à l\'école. »'],
    ],
    end: [
      ['Sayyad', '« Un kilomètre et demi. Ok. OK. »'],
      ['Zahra', '« J\'ai le chrono icitte. Y va dire qu\'y a mal parti. »'],
    ],
  },
  arcsurchauffe: {
    start: [
      ['Zahra', '« Y fait 34 degrés pis tu transportes un divan. Explique-moi ça. »'],
      ['Zahra', '« Ton gauge est dans le rouge depuis Deschênes, en passant. »'],
    ],
    end: [
      ['Norm Lafleur', '« Un boyau, c\'est huit piasses. Attends après, pis c\'est un moteur. »'],
      ['Norm Lafleur', '« Reviens me voir avant que ça casse, la prochaine fois. Pas après. »'],
    ],
  },
  arcveillee: {
    start: [
      ['Mike', '« Cinq chars. CINQ. Écoute-moi, j\'ai pensé à l\'ordre. »'],
      ['Margaret', '« Trois semaines. Faque à soir on fait ça comme il faut. »'],
    ],
    end: [
      ['Adam', '« ...c\'est beau, le Parlement, quand on le regarde de loin. »'],
      ['Sayyad', '« Dites-le pas à personne que j\'ai trouvé ça beau. »'],
    ],
  },
  arcdernier: {
    start: [
      ['Mike', '« Y en reste quatre boîtes. Pis le divan. Le divan reste. »'],
      ['Mike', '« ...merci d\'avoir un truck, mon homme. »'],
    ],
    end: [
      ['Ton père', '« T\'as mis ton gaz dedans tout l\'été. »'],
      ['Ton père', '« Les clés, laisse-les là. Elles sont autant à toi. »'],
    ],
  },
};

let linesT = null;
/** Fire and forget; safe to call every frame. */
export function registerArcLines() {
  if (linesT) return linesT;
  linesT = import('./story.js')
    .then((m) => { if (m && m.FRIEND_LINES) Object.assign(m.FRIEND_LINES, ARC_LINES); return true; })
    .catch(() => false);
  return linesT;
}
