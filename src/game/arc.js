// The summer, in four beats (five until D31 cut the bridge, 13 Oct 2026).
//
// The game had seventeen jobs and no shape. assets/text/arc.json gives it one:
// the first favours with your own truck, the Saint-Jean bonfire at the beach,
// a night of bridges, and one slow last lap of Principale. (The Ranger is Tom's from the first morning: his
// father gave it to him, and nobody takes the keys back. Ledger s.1, s.3.) Each beat is an ordinary MISSIONS entry — same stage model,
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
import { isPrototype, dateMessage, DAY_CYCLE } from './jobwindows.js';
import { LAST } from './calendar.js';
import { storyBlocker, isRetired, dateLock, SAINT_JEAN_DAY } from './campaign.js';
import { PLACES } from './places.js';
import { toastLive } from './heckle.js';

// ---------------------------------------------------------------- geography

// Places the arc needs that places.js has no key for. Every one of these is a
// point on the real road graph (checked with Nav: each routes from Aylmer), so
// the GPS line reaches them like any other target.
//
//   SPAN      mid-span on the Pont Champlain (the retired veillée's first bridge)
//   CHAUDIERE / ALEXANDRA  two more of the river crossings
//   NEPEAN    the Ottawa end of the Alexandra, under the Champlain statue,
//             with Parliament lit up across the water. The key keeps its old
//             name; no player text names the place (Tom did not go there in
//             2004: ledger s.3). Its beat is an open decision, STORY-REBUILD.md.
//   LUCERNE_A / LUCERNE_B  1,5 km of Boulevard de Lucerne, which is where
//             Sayyad's time trials happen because it is empty and it always was
export const SPAN = { x: 6194, z: -1491 };
export const CHAUDIERE = { x: 9078, z: -3194 };
export const ALEXANDRA = { x: 10478, z: -3890 };
export const NEPEAN = { x: 10660, z: -3855 };
export const LUCERNE_A = { x: 942, z: 1010 };
export const LUCERNE_B = { x: 2424, z: 805 };

const say = (G, text, ms) => G && G.hud && G.hud.toast(text, ms);
// The scene hush (B-08, heckle.js): while a scene told in toasts runs, the
// street says nothing. Raised every tick, so it lapses on its own a second
// after the scene stops ticking. sceneToast() also holds the street for as
// long as that toast waits in the HUD's queue or stays on screen.
const hush = (G, reason, secs) => { if (G && G.heckle && G.heckle.hush) G.heckle.hush(reason, secs); };
const sceneToast = (G, reason, text, ms) => {
  say(G, text, ms);
  if (G && G.heckle && G.heckle.hushWhile && G.hud) G.heckle.hushWhile(reason + ':' + text, () => toastLive(G.hud, text));
};

// ---------------------------------------------------------------- the beats

// 1 — Le Ranger rend service -----------------------------------------------------

const keys = {
  id: 'arckeys',
  beat: 'prologue',
  title: 'Le Ranger rend service',
  brief: 'Avec ton Ranger, tu peux rendre service à ta mère pis à la gang. Les mêmes détours, ton gaz, pis chacun fait sa part.',
  giver: 'home',
  timeOfDay: 'morning',
  build() {
    return [
      {
        kind: 'load',
        text: '299 Chemin Fraser : charge les outils',
        sub: 'Arrête-toi dans le pilier jaune de l’entrée, pis E pour charger',
        hint: 'Le pilier est sur ton propre char, dans ton entrée. Faut être arrêté pour que le E marche.',
        at: 'home', radius: 13, hold: true,
        holdText: 'E : charger la tondeuse pis les outils',
        // The truck was already Tom's: no deal, no lender (ledger s.1, s.3).
        toast: 'Ta mère: « You have the truck. » Personne a parlé du gaz.',
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
        text: 'Le dep : la gang t’attend',
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

// 3 · La Saint-Jean ---------------------------------------------------------
//
// Main mission 3 (restructure, 29 Sept 2026). Aylmer's big Saint-Jean bonfire
// at the beach is very real (Tom, 28 Sept); what happens at it is the game's.
// The summer starts on 22 June so the night itself, the 24th, is in it: in the
// prototype the job is not offered before the 24th (campaign.js DATE_GATES) and
// only in the evening (jobwindows.js). A player who gets here later still plays
// it, and then nothing says it is the 24th: `datedText.after` is used
// (missions.js applyDatedText). The stages never name the date.
//
// Mechanics kept from « La bâche bleue »: the fragile haul from the Galeries to
// the beach. The Lucerne time trial is gone (it had nothing to do with a
// bonfire); the last two stages bring Sayyad and Zahra to the fire at dusk.
const bache = {
  id: 'arcbache',
  beat: 'turn1',
  title: 'La Saint-Jean',
  brief: 'Le 24 juin. Le gros feu de la Saint-Jean à la plage des Cèdres, pis toute la ville y va. Le son est dans ton truck.',
  datedText: {
    on: {
      title: 'La Saint-Jean',
      brief: 'Le 24 juin. Le gros feu de la Saint-Jean à la plage des Cèdres, pis toute la ville y va. Le son est dans ton truck.',
    },
    after: {
      title: 'Le feu à la plage',
      brief: 'Un soir de feu de joie à la plage des Cèdres, pis toute la ville y va. Le son est dans ton truck.',
    },
  },
  giver: 'mall',
  timeOfDay: 'dusk',
  build(ctx) {
    return [
      {
        kind: 'load',
        text: 'Galeries d’Aylmer : les haut-parleurs',
        sub: 'GPS jusqu’au pilier jaune, arrête-toi, pis E pour charger',
        hint: 'Le stationnement des Galeries, chemin d’Aylmer. Faut être arrêté dans le pilier.',
        at: 'mall', radius: 22, hold: true,
        holdText: `E : charger les haut-parleurs pis la bâche bleue dans le ${ctx.carName}`,
        toast: 'Deux caisses de son, une bâche bleue, pis huit tendeurs. Ça va tenir.',
      },
      {
        text: 'Plage des Cèdres, sans rien casser',
        sub: 'GPS, pis 35 km/h max dans le pilier (S pour freiner). C’est fragile.',
        hint: 'Plein ouest par la Principale, jusqu’au bout, au bord de la rivière.',
        // s1-timers: 2.1 km (was 320 s, 24 km/h: set dressing). W6-CURFEW: the
        // pace car now brakes to 35 for the pillar, 85 s, so 120 s (was 115).
        at: 'beach', radius: 20, maxSpeed: 35, time: 120,
        toast: 'Montés, branchés, pis ça marche. La plage a du son. Le bois est empilé pour le feu.',
        money: 35,
      },
      {
        kind: 'load',
        text: 'Sayyad pis Zahra : 75 Denise-Friend',
        sub: 'GPS jusqu’au pilier jaune, arrête-toi, pis E',
        hint: 'Denise-Friend, dans le Vieux-Aylmer. Sayyad est réveillé, pour une fois.',
        at: 'sayyad', radius: 16, hold: true,
        holdText: 'E : klaxonner une fois, poliment',
        toast: 'Zahra sort la première. Sayyad suit, en parlant déjà.',
      },
      {
        kind: 'park',
        text: 'Le feu, à la plage',
        sub: 'Retour à la plage des Cèdres. Pas de chrono. Stationne-toi, pis E.',
        hint: 'La plage des Cèdres, au bout de la Principale. Suis la fumée.',
        at: 'beach', radius: 22, hold: true, stopped: 4,
        holdText: 'E : aller t’asseoir près du feu',
        toast: 'Le feu monte plus haut que les arbres.\nToute la gang est là, pis la moitié de la ville.\nPersonne regarde l’heure.',
        money: 20,
      },
      // Tom, 6 Oct 2026: "We started speaking French to each other, getting
      // caught up in the moment." The one place the gang, who speak English
      // with each other, switch to French: one starts, the others follow,
      // Tom answers and gets laughed at for his accent. Back to English in
      // the morning (the toast, then ARC_LINES.arcbache.end).
      {
        kind: 'francais',
        text: 'Le feu : la gang parle français',
        sub: 'Reste près du feu pis écoute. Quand c’est ton tour, E pour répondre en français.',
        hint: 'Attends que Sayyad embarque, lui aussi. Après, E.',
        at: 'beach', radius: 30,
        // Only onTick finishes it: the friends, then your E, then the laughs.
        condition: () => false,
        prompt: (G, m) => (!m || m.sjAnswered ? null : m.sjReady ? 'E : répondre en français' : 'Écoute-les.'),
        onEnter(G, m) {
          m.sjReady = false; m.sjAnswered = false; m.sjDone = false; m.sjT = 0; m.sjT2 = 0;
          sceneToast(G, 'stjean', SAINT_JEAN_SCENE, 3600);
          lines(G, SAINT_JEAN_FRENCH, () => { m.sjReady = true; });
        },
        onTick(G, m, st, dt) {
          hush(G, 'stjean');
          const t = dt || 0;
          m.sjT = (m.sjT || 0) + t;
          if (m.sjT >= SAINT_JEAN_WAIT) m.sjReady = true;   // no bubbles (tests), or they were cut
          if (!m.sjAnswered) {
            const v = G && G.veh, p = m.target;
            const here = v && p && Math.hypot(v.x - p.x, v.z - p.z) < p.r && v.speedKmh <= 4;
            if (m.sjReady && here && G.wantStart) {
              G.wantStart = false;
              m.sjAnswered = true; m.sjT2 = 0;
              lines(G, SAINT_JEAN_REPLY, () => { m.sjDone = true; });
            }
            return null;
          }
          m.sjT2 = (m.sjT2 || 0) + t;
          return m.sjDone || m.sjT2 >= SAINT_JEAN_REPLY_WAIT ? 'done' : null;
        },
        toast: 'Vous parlez français jusqu’à la fin du feu. Personne le fait exprès.\nLe lendemain matin, tout le monde reparle anglais. Personne en parle.',
      },
    ];
  },
};

// The French at the fire (Tom, 6 Oct 2026). Every other line the gang says to
// each other is English; this is the exception, on purpose. Glosses:
//   Zahra   Look. Everybody's singing.
//   Mike    Well, sing then! It's Saint-Jean!
//   Sayyad  Wait. Are we speaking French right now?
//   Zahra   Yes. And so are you.
//   Sayyad  OK OK OK. Happy Saint-Jean, everybody!
export const SAINT_JEAN_SCENE = 'Les haut-parleurs jouent « Gens du pays ». Des drapeaux bleus partout. Toute la plage chante.';
export const SAINT_JEAN_FRENCH = [
  ['Zahra', '« Regarde. Tout le monde chante. »'],
  ['Mike', '« Ben chante, d’abord! C’est la Saint-Jean! »'],
  ['Sayyad', '« Attends. On parle-tu en français, là? »'],
  ['Zahra', '« Oui. Pis toi aussi. »'],
  ['Sayyad', '« OK OK OK. Bonne Saint-Jean, tout le monde! »'],
];
// Tom answers, and pays for it. Glosses:
//   Tom     Uh... happy Saint-Jean, guys!
//   Zahra   Your accent, Tom. My God.
//   Adam    Leave him alone. He's doing his best.
export const SAINT_JEAN_REPLY = [
  ['Tom', '« Euh... bonne Saint-Jean, la gang! »'],
  ['Zahra', '« Ton accent, Tom. Mon Dieu. »'],
  ['Adam', '« Laisse-le. Y fait son possible. »'],
];
// Seconds before E works even if the bubbles never report back, and before
// the beat ends after Tom's answer.
export const SAINT_JEAN_WAIT = 16;
export const SAINT_JEAN_REPLY_WAIT = 10;

// A run of story bubbles; `done` once the last has left the screen.
function lines(G, list, done) {
  const last = list.length - 1;
  list.forEach(([who, text], i) => {
    if (G && G.heckle && G.heckle.line) G.heckle.line(who, text, 3000, { group: 'saintjean', then: i === last ? done : null });
  });
}

// 3 — La surchauffe du pont: CUT (Tom, D31, 13 Oct 2026: « none of that
// radiator shit is remotely real »). No code left; its id is in campaign.js
// RETIRED so an old save that had it still loads and goes on to the sauna.

// 4 — La dernière veillée ----------------------------------------------------

const veillee = {
  id: 'arcveillee',
  beat: 'turn3',
  // OPEN DECISION (STORY-REBUILD.md). The acceptance letters, the five-car
  // convoy, the departures and Nepean Point did not happen (ledger s.3). What is
  // left is neutral: one truck, three bridges, no reason. Stages unchanged.
  title: 'La dernière veillée',
  brief: 'Un soir sans raison. Trois ponts, la rivière, pis le Parlement de l’autre bord.',
  giver: 'arena',
  timeOfDay: 'dusk',
  build() {
    return [
      {
        kind: 'load',
        text: 'Stationnement de l’aréna : tout le monde embarque',
        sub: 'Arrête-toi dans le pilier jaune, pis E quand t’es prêt',
        hint: 'Aréna Frank-Robinson, au nord de la Principale. La gang t’attend.',
        at: 'arena', radius: 18, hold: true,
        holdText: 'E : on part',
        toast: 'Mike part la radio. Personne sait où on va, à part toi.',
      },
      {
        text: 'Pont 1 : le Champlain',
        sub: 'W pis suis la ligne bleue du GPS jusqu’au pilier au milieu du pont',
        hint: 'Plein est par le chemin d’Aylmer pis la 148. Pas de chrono à soir.',
        at: SPAN, radius: 30,
        toast: 'Adam klaxonne en montant sur le pont. Avec ton klaxon. Tout le monde crie.',
      },
      {
        text: 'Pont 2 : la Chaudière',
        sub: 'GPS vers l’est jusqu’au pilier (W)',
        hint: 'Continue vers Hull par Alexandre-Taché, la Chaudière est au bout.',
        at: CHAUDIERE, radius: 26,
        toast: 'Sayyad baisse sa vitre. Personne se plaint.',
      },
      {
        text: 'Pont 3 : l’Alexandra',
        sub: 'GPS jusqu’au pilier, traverse vers Ottawa (W)',
        hint: 'Par le centre-ville de Hull, pis le pont de fer vers le musée.',
        at: ALEXANDRA, radius: 26,
        toast: 'Le pont de fer fait le bruit qu’il fait. Zahra le filme avec rien.',
      },
      {
        text: 'De l’autre bord : le belvédère sous la statue',
        sub: 'GPS jusqu’au dernier pilier, pis 30 km/h max en arrivant (S pour freiner)',
        hint: 'De l’autre bord de l’Alexandra, en haut, sous la statue. Le Parlement est en face.',
        at: NEPEAN, radius: 24, maxSpeed: 30,
        toast: 'Assis sur le hayon, le Parlement allumé de l’autre bord de l’eau.\nPersonne dit rien pendant un bout.',
        money: 45,
      },
    ];
  },
};

// Finale · Le dernier soir ---------------------------------------------------
//
// Labour Day night (restructure, 29 Sept 2026; Tom's approved plan, ledger 29
// Sept). No `time` on any stage, no rivals, and cops.clear() every tick: the
// last thing you do in this game cannot be failed.
//
//   1. A free drive, untimed, no GPS line. Each main mission's place holds one
//      small callback, and friends are where they would be on a Labour Day
//      night, one line each. Nobody says goodbye. Home when you are ready.
//   2. The landline rings at 299 Fraser: Dad, excited. « So? Ottawa or McGill? »
//   3. On the kitchen table, next to Tom's Heritage nanotech project: a
//      brochure. University of Waterloo, a new program, Nanotechnology
//      Engineering. E picks it up; main.js plays the end cards (story.js).
//
// Starting it IS Labour Day evening: the calendar goes to the last day and, in
// the prototype, the clock to 20 h (a job cannot wait weeks for its date).
// The brochure's timing is a composite (docs/STORY-REBUILD.md).

const noCops = (G) => { if (G && G.cops && G.cops.clear) G.cops.clear(); return null; };

// Where the summer happened. `at` is a PLACES key; `line` is narration (a
// toast), `who`/`say` a friend's one line (a bubble, <= 12 words).
export const FINALE_CALLBACKS = [
  { at: 'ctire', mission: 'alternateur', line: 'Le Canadian Tire. Les solénoïdes sont encore sur le crochet.' },
  { at: 'sayyad', mission: 'sayyad', line: 'Le 75 Denise-Friend. La lumière de Sayyad est allumée.',
    friends: [['Sayyad', '« I’m awake. On purpose. OK OK OK. Note it somewhere. »'], ['Zahra', '« Wrong. He didn’t sleep. He’s talking about the new iMac. »']] },
  { at: 'beach', mission: 'arcbache', line: 'La plage des Cèdres. Le rond noir du feu est encore dans le sable.',
    friends: [['Adam', '« Mayo’s far tonight. The town, not the sauce. I’m staying. »'], ['Alex', '« Hey. You’re right on time. »'], ['Robin', '« Sit down. There’s chips left. »']] },
  { at: 'mike', mission: 'divan', line: 'Le 129 Frank-Robinson. Le divan est encore dans l’arbre.',
    friends: [['Mike', '« It stays up there. Hear me out: it’s a monument now. »']] },
  { at: 'marina', mission: 'canot', line: 'La marina. Le canot à 45 piasses, à l’envers sur le quai. Le Bondo tient.' },
  { at: 'golf', mission: 'golfcart', line: 'La clôture du golf, entre le Loblaws pis le cimetière. Les carts dorment.' },
  { at: 'stvincent', mission: 'stvincent', line: 'St. Vincent. Les lumières du troisième. C’est tranquille.' },
  { at: 'tims', mission: 'nuittim', line: 'Le stationnement du Tim. Personne en arrière, à soir.' },
  { at: 'royalottawa', mission: 'school', line: 'Le Royal Ottawa. Une balle de golf dans le fossé.',
    friends: [['Russell', '« Not my ball. Probably not my ball. »']] },
  { at: 'abraham', line: 'Wilfrid-Lavigne. Un vélo couché au milieu d’une entrée.',
    friends: [['Abraham', '« One more lap? Just one. »']] },
  { at: 'tyler', line: 'Samuel-Edey. Le char à Tyler, les portes ouvertes, la radio.',
    friends: [['Tyler', '« Nachos next week? Same time, same movie. »']] },
];
export const FINALE_NEAR = 40;       // metres: close enough to notice
export const FINALE_LEAVE = 200;     // metres from home before you may come back in

// The call. Margaret answers (she never rides with the gang; Dad is only ever
// on the landline at 299 Fraser). Dad speaks English with Tom.
export const FINALE_CALL = [
  ['Margaret', '« Tom! Phone! It’s your father. »'],
  ['Ton père, au téléphone', '« Tom! Hey! Last night of the summer, eh? »'],
  ['Ton père, au téléphone', '« So? Ottawa or McGill? »'],
];

function finaleState(m) { return m.fin || (m.fin = { seen: new Set(), left: false, todo: [], shown: -1 }); }

// ---- S4-SUMMER finale (begin) ----
// The places still to see tonight, with their points: the map pins them (main.js
// finalePins) and the harness bot tours them. No GPS line, no list on screen:
// a light on the map and a count in the objective, « 3/11 places de l’été ».
export function finaleTodo(m) {
  const f = finaleState(m);
  return FINALE_CALLBACKS.filter((c) => !f.seen.has(c.at) && PLACES[c.at])
    .map((c) => ({ at: c.at, x: PLACES[c.at].x, z: PLACES[c.at].z, label: PLACES[c.at].label || c.at }));
}
function finaleCount(G, m) {
  const f = finaleState(m), n = f.seen.size, total = FINALE_CALLBACKS.length;
  if (f.shown === n) return;
  f.shown = n;
  const st = m.stages && m.stages[m.idx];
  if (!st || !G || !G.hud || !G.hud.setObjective) return;
  const head = n ? `Le dernier soir : ${n}/${total} places de l’été` : st.text;
  const sub = n >= total ? 'T’as fait le tour. Rentre au 299 Fraser, pis E.'
    : (f.left ? 'Les lumières sur la carte, c’est l’été. Rentre quand t’es prêt, pis E.' : st.sub);
  G.hud.setObjective(head, sub);
}
// ---- S4-SUMMER finale (end) ----

/** Labour Day, evening. Exported for the campaign smoke test. */
export function enterLastNight(G) {
  if (!G) return;
  G.day = LAST;
  G.lastNight = true;
  if (isPrototype(G)) G.dayClock = (20 / 24) * (G.dayCycle || DAY_CYCLE);
}

/** Once a tick in stage 1: the callbacks and the friends, one each. */
export function finaleTick(G, m) {
  noCops(G);
  const v = G && G.veh;
  if (!v) return null;
  const f = finaleState(m);
  const home = PLACES.home;
  if (home && Math.hypot(v.x - home.x, v.z - home.z) > FINALE_LEAVE) f.left = true;
  const wasLeft = f.shownLeft;
  for (const c of FINALE_CALLBACKS) {
    if (f.seen.has(c.at)) continue;
    const p = PLACES[c.at];
    if (!p || Math.hypot(v.x - p.x, v.z - p.z) > FINALE_NEAR) continue;
    f.seen.add(c.at);
    sceneToast(G, 'finale', c.line, 3400);
    for (const [who, text] of c.friends || []) {
      if (G.heckle && G.heckle.line) G.heckle.line(who, text, 3400);
      else say(G, `${who}: ${text}`, 3400);
    }
    // S4-SUMMER: every place seen, once.
    if (f.seen.size === FINALE_CALLBACKS.length) say(G, 'Toutes les places de l’été. Il reste juste chez vous.', 3600);
  }
  // ---- S4-SUMMER finale (begin): the count, and the pins' list ----
  f.todo = finaleTodo(m);
  if (f.left !== wasLeft) { f.shownLeft = f.left; f.shown = -1; }
  finaleCount(G, m);
  // ---- S4-SUMMER finale (end) ----
  return null;
}

const dernier = {
  id: 'arcdernier',
  beat: 'epilogue',
  title: 'Le dernier soir',
  brief: 'La fête du Travail. Le dernier soir de l’été. Pas de chrono, pas de liste. Roule où tu veux, pis rentre au 299 Fraser quand t’es prêt.',
  giver: 'home',
  timeOfDay: 'dusk',
  build() {
    return [
      {
        kind: 'drive',
        text: 'Le dernier soir : roule où tu veux',
        sub: 'Pas de chrono, pas de GPS. Les places de l’été sont encore là. Rentre quand t’es prêt, pis E.',
        hint: 'Le Canadian Tire, la plage, chez Mike, la marina, le golf, le Tim. Ou nulle part. Chez vous, c’est E.',
        at: 'home', radius: 13, hold: true, noRoute: true,
        holdText: 'E : rentrer',
        gate: (G, m) => (finaleState(m).left ? null : 'Pas tout de suite. Va faire un tour, c’est le dernier soir.'),
        onEnter(G, m) {
          enterLastNight(G);
          finaleState(m);
          say(G, 'La planche de cèdre sent encore, sur le dash.', 3200);
        },
        onTick: (G, m) => finaleTick(G, m),
        toast: 'La lumière de la cuisine est allumée.',
      },
      {
        kind: 'phone',
        text: 'Le téléphone sonne dans la maison',
        sub: 'E pour répondre',
        hint: 'Le téléphone noir, dans la cuisine. E.',
        at: 'home', radius: 20, hold: true,
        holdText: 'E : répondre',
        onEnter(G) {
          if (G.audio && G.audio.blip) { G.audio.blip(440, 0.5, 'sine', 0.1); G.audio.blip(480, 0.5, 'sine', 0.1); }
        },
        onExit(G) {
          for (const [who, text] of FINALE_CALL) {
            if (G.heckle && G.heckle.line) G.heckle.line(who, text, 3400, { group: 'dad' });
          }
        },
        toast: 'Au bout du fil, il a l’air tellement content.\nIl t’envoie 20 $ pour le gaz. Il insiste.\nTu réponds pas tout de suite.',
        // Dad offers before being asked (ledger 28 Sept); the one payout of
        // the finale, so the rule « every job pays » still holds.
        money: 20,
        onTick: (G) => { hush(G, 'finale'); return noCops(G); },
      },
      {
        kind: 'table',
        text: 'La table de cuisine',
        sub: 'E pour prendre la brochure',
        hint: 'À côté de ton projet de nanotech de Heritage. E.',
        at: 'home', radius: 20, hold: true,
        holdText: 'E : prendre la brochure',
        toast: 'Sur la table, à côté de ton projet de nanotech de Heritage : une brochure.\nUniversity of Waterloo. Un nouveau programme : Nanotechnology Engineering.\nTu la prends.',
        onTick: (G) => { hush(G, 'finale'); return noCops(G); },
      },
    ];
  },
};

// ---------------------------------------------------------------- the gates

export const ARC = [keys, bache, veillee, dernier];

/**
 * Restructure (29 Sept 2026): the beats no longer open on job counts. The
 * story's order is campaign.js's (ten main missions, then the finale), and
 * missions.js asks it, not this table. What is left here is the shape older
 * callers read: `after` is the main mission a beat follows (or 'all' for the
 * finale), `fromDay` the prototype's date gate (the Saint-Jean, 24 June = day
 * 2). The retired beats (arckeys, arcveillee, and arcsurchauffe, which has no
 * code left) have no row: they are never offered.
 */
export const GATES = {
  arcbache: { after: 'sayyad', fromDay: SAINT_JEAN_DAY },
  arcdernier: { after: 'all' },
};

/** Is this beat's story gate open for a save with these finished jobs? */
export function gateOpen(id, done) {
  if (isRetired(id)) return false;
  return storyBlocker(id, done || new Set()) == null;
}

/**
 * Prototype only: the date line when a beat's calendar gate is still shut
 * (« Pas avant le 24 juin »), else null. `day` is G.day.
 */
export function beatDateLock(G, id) {
  return dateLock(G, id);
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
    // A beat whose title follows the date (the Saint-Jean) keeps its own.
    if (!def.datedText) def.title = String(row.title);
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
      ['Margaret', '« Take the mower to the church for me? You have the truck. »'],
      ['Margaret', '« That wasn’t really a question, Tom. »'],
    ],
    end: [
      ['Sayyad', '« Two months. Deux mois complets. What’s the plan? »'],
      ['Mike', '« Deux mois. J’ai une liste. Écoute-moi. »'],
    ],
  },
  // The gang in English, as always; at the fire they switch to French
  // (SAINT_JEAN_FRENCH, Tom 6 Oct 2026). The end lines are the morning after.
  arcbache: {
    start: [
      ['Sayyad', '« The speakers are his dad’s. Don’t break them. »'],
      ['Zahra', '« Wrong. They’re the school’s. Don’t break those either. »'],
    ],
    end: [
      ['Sayyad', '« Morning. So. Last night we were very French. »'],
      ['Zahra', '« Tom was very... trying. »'],
    ],
  },
  // OPEN DECISION beat: no convoy, no letters, nobody leaving.
  arcveillee: {
    start: [
      ['Mike', '« Tout le monde dans le truck. J\'ai pensé à l\'ordre des ponts. »'],
      ['Sayyad', '« Trois ponts. No reason. Best reason. »'],
    ],
    end: [
      ['Adam', '« ...c\'est beau, le Parlement, quand on le regarde de loin. »'],
      ['Sayyad', '« Dites-le pas à personne que j\'ai trouvé ça beau. »'],
    ],
  },
  // Le dernier soir: Margaret in her own driveway, then the end cards. The
  // friends' lines are the finale's own (FINALE_CALLBACKS), one each, where
  // they would be; nobody says goodbye.
  arcdernier: {
    start: [
      ['Margaret', '« Last night of the summer. Don’t be too late, Tom. »'],
    ],
    end: [
      ['Margaret', '« Lights off when you go down, Tom. »'],
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
