// The story layer: who you are, who your friends are, and — every single frame
// — what you are supposed to be doing and which key does it.
//
// Three things live here:
//
//   1. STORY_CARDS + StoryOpener — four cards on a new game (#story at the end
//      of index.html), E / Enter / Espace / click turns the page, Escape skips.
//      It ends by pointing the GPS at the nearest job.
//   2. freeRoamLines(G) — the two HUD lines when no job is running. Never
//      « Free roam »: it is always the nearest job's title, how far it is, and
//      the key, or the friend's car you happen to be standing beside.
//   3. updateStuck() and friendLines() — the nudge when you have not moved in
//      twenty seconds, and the two or three lines each friend says at the start
//      and the end of their job.
//
// Nothing in here draws or steps anything. main.js owns the four hook lines.
// The one exception is the opener's own card: it goes through ui.js's
// setModal() so the HUD stops drawing behind it (U7).
import { ALL_MISSIONS, missionAvailable } from './missions.js';
import { earlyStory, nextMain } from './campaign.js';
import { setModal } from './ui.js';
import { PLACES } from './places.js';
import { carById } from './cars.js';
import { waitLines } from './summer.js';

export const STUCK_M = 20;        // metres you have to cover...
export const STUCK_T = 20;        // ...in this many seconds, or you get a nudge
export const ARM_M = 3;           // the clock only starts once you have rolled this far in the job

// ---------------------------------------------------------------- the opener

export const STORY_CARDS = [
  { title: 'ÉTÉ 2004', body: 'T’es Tom. Ton Ranger XL 1993, ton gaz, tes réparations. Un été à Aylmer pour préparer la suite.' },
  { title: 'LA GANG', body: 'Sayyad pis sa Civic, Adam pis son Sunfire, Mike pis son divan, Zahra pis ses griffes. Ta mère, Margaret, pis sa Saturn : elle est sûre que vous préparez quelque chose.' },
  { title: 'L’ÉTÉ', body: 'Du 22 juin à la fête du Travail. Le gaz pis les pièces, c’est toi. Les jobs paient souvent moins que le gaz.' },
  { title: 'LES COMMANDES', body: 'W accélère, S freine. ? affiche les commandes. Tab ouvre la carte. T remet le char sur le chemin.' },
  { title: 'PREMIÈRE JOB', body: 'Ta première job, l’alternateur au Canadian Tire des Galeries d’Aylmer, commence après la présentation. Aucun chrono : suis le GPS, freine dans le pilier jaune au comptoir, puis E pour ramasser ta pièce.' },
];

/**
 * The end cards, after « Le dernier soir » (restructure, 29 Sept 2026; Tom's
 * approved plan). In Tom's voice, looking back. They cannot be failed and say
 * nothing about money. Waterloo is 2005 (ledger s.1): these cards are written
 * from after it, and the brochure on the kitchen table (arc.js) is the only
 * place the game shows it, as a composite. `streets` is the quiet counter's
 * line (streets.js), shown here and on the pause screen only.
 */
export const END_CARDS = [
  { title: 'LA FÊTE DU TRAVAIL', body: 'L’été d’après, on est tous partis.' },
  { title: 'LE RANGER', body: 'Le Ranger a tenu jusqu’en 2011. Waterloo, Boston, Montréal, Toronto, chaque déménagement.' },
  { title: 'L’ALTERNATEUR', body: 'Il marche encore, en passant. C’était juste le solénoïde.' },
];
export function endingCards(opts = {}) {
  const cards = END_CARDS.map((c) => ({ ...c }));
  if (opts && opts.streets) cards[cards.length - 1].body += `\n\n${opts.streets}`;
  return cards;
}

/**
 * The new-game opener. A sibling of ui.js's IntroCard: same idea, its own
 * markup, and it waits for the player instead of a timer.
 */
export class StoryOpener {
  constructor(cards = STORY_CARDS) {
    const $ = (id) => (typeof document !== 'undefined' && document.getElementById
      ? document.getElementById(id) : null);
    this.cards = cards;
    this.root = $('story');
    this.elTitle = this.root && this.root.querySelector('.stitle');
    this.elBody = this.root && this.root.querySelector('.sbody');
    this.elDots = this.root && this.root.querySelector('.sdots');
    this.elKey = this.root && this.root.querySelector('.skey');
    this.i = 0;
    this.active = false;
    this.onDone = null;
    if (this.root) this.root.onclick = () => this.advance();
  }

  /** Start at card 0. `onDone` fires once, whether you read it or skipped it. */
  show(onDone = null) {
    this.i = 0;
    this.active = true;
    this.onDone = onDone;
    this.render();
    setModal('story', true);      // U7: the HUD stops drawing behind it
    return this;
  }

  /** E / Enter / Espace / click: next card, or finish on the last one. */
  advance() {
    if (!this.active) return false;
    this.i++;
    if (this.i >= this.cards.length) { this.finish(); return false; }
    this.render();
    return true;
  }

  /** Escape, or falling off the end. */
  finish() {
    if (!this.active) return false;
    this.active = false;
    setModal('story', false);
    const fn = this.onDone;
    this.onDone = null;
    if (fn) fn();
    return true;
  }

  hide() { this.active = false; setModal('story', false); }

  render() {
    const c = this.cards[this.i];
    if (!c || !this.root) return;
    if (this.elTitle) this.elTitle.textContent = c.title;
    if (this.elBody) this.elBody.textContent = c.body;
    if (this.elDots) {
      this.elDots.textContent = this.cards.map((_, i) => (i === this.i ? '●' : '○')).join(' ');
    }
    if (this.elKey) {
      this.elKey.textContent = this.i >= this.cards.length - 1
        ? 'E : embarque   ·   Échap pour passer'
        : 'E : la suite   ·   Échap pour passer';
    }
  }
}

// ---------------------------------------------------------------- guidance

export const fmtDist = (d) => (d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km');

/** The closest job you have not done yet (or, if you did them all, null). */
export function nearestJob(G, list = ALL_MISSIONS) {
  const v = G && (G.focus || G.veh);
  if (!v) return null;
  let best = null, bd = Infinity;
  for (const def of list) {
    if (!missionAvailable(G, def)) continue;
    if (G.done && G.done.has && G.done.has(def.id)) continue;
    const p = PLACES[def.giver];
    if (!p) continue;
    const d = Math.hypot(p.x - v.x, p.z - v.z);
    if (d < bd) { bd = d; best = { def, place: p, dist: d }; }
  }
  return best;
}

/**
 * W8-FIRST15: until the Saint-Jean is done (campaign.js earlyStory), the line
 * names the next main mission when it can start, wherever you are, so the
 * first driveways have one « next ». Null otherwise (nearestJob decides).
 */
export function earlyNext(G, list = ALL_MISSIONS) {
  const v = G && (G.focus || G.veh);
  if (!v || !earlyStory(G)) return null;
  const id = nextMain((G && G.done) || new Set(), (x) => list.some((d) => d.id === x));
  const def = id ? list.find((d) => d.id === id) : null;
  if (!def || !missionAvailable(G, def)) return null;
  const p = PLACES[def.giver];
  if (!p) return null;
  return { def, place: p, dist: Math.hypot(p.x - v.x, p.z - v.z) };
}

/** The closest job of all, done or not — for when there is nothing left to do. */
export function nearestAnyJob(G, list = ALL_MISSIONS) {
  const v = G && (G.focus || G.veh);
  if (!v) return null;
  let best = null, bd = Infinity;
  for (const def of list) {
    if (!missionAvailable(G, def)) continue;
    const p = PLACES[def.giver];
    if (!p) continue;
    const d = Math.hypot(p.x - v.x, p.z - v.z);
    if (d < bd) { bd = d; best = { def, place: p, dist: d }; }
  }
  return best;
}

// « E — prendre la 1988 Honda Civic Si » is not how anybody talks. Nobody says
// the year and nobody says the make: it is the Civic, and it is a "la".
const CAR_SHORT = {
  ranger: 'Ranger', saturn: 'Saturn', civic: 'Civic', sunfire: 'Sunfire',
  cutlass: 'Cutlass', cavalier: 'Cavalier Z24', caravan: 'Caravan',
  // The lot bus is a transit bus and always was; there is a real school bus in
  // the game now (game/buses.js), so the two of them cannot share a name.
  bus: 'bus de ville', schoolbus: 'bus scolaire',
  cruiser: 'cruiser chromé', dbike: 'bicycle',
};
const CAR_ART = {
  ranger: 'le', saturn: 'la', civic: 'la', sunfire: 'la',
  cutlass: 'la', cavalier: 'la', caravan: 'la', bus: 'le',
  schoolbus: 'le', cruiser: 'le', dbike: 'le',
};

/** What you would call that car out loud. Falls back to dropping the year. */
export function shortCarName(id, spec = null) {
  if (CAR_SHORT[id]) return CAR_SHORT[id];
  const n = String((spec && spec.name) || id);
  return n.replace(/^\d{4}\s+/, '').split(/\s+/).slice(-1)[0] || n;
}

/** « le » or « la », because « le Civic » sounds like a tourist. */
export function carArticle(id) { return CAR_ART[id] || 'le'; }

// What each car is doing sitting there, so « E — prendre la Civic » has a reason.
const CAR_WHY = {
  civic: 'il s’en fout, il dort',
  saturn: 'ta mère a dit oui une fois, pis ça compte encore',
  sunfire: 'Adam a laissé les clés dedans, comme toujours',
  ranger: 'ton char, tes règles',
  cutlass: 'ça sent le cendrier pis c’est correct de même',
  cavalier: 'quelqu’un a mis des flammes dessus. Quelqu’un.',
  caravan: 'sept places, zéro dignité',
  bus: 'personne va te demander ton permis de classe 2',
  schoolbus: 'c’est l’été, la clé est au-dessus du pare-soleil',
  cruiser: 'Sayyad le barre jamais, il est trop fier de lui',
  dbike: 'il est dans l’entrée depuis que t’as douze ans',
};

/** A friend's car parked within reach, and whether it is yours to take. */
export function carUnderfoot(G, radius = 6.5) {
  const v = G && G.veh;
  if (!v || !G.parked) return null;
  if (Math.abs(v.vLong || 0) >= 3) return null;
  let id = null, bd = radius;
  for (const key of Object.keys(G.parked)) {
    const p = G.parked[key];
    const d = Math.hypot(p.x - v.x, p.z - v.z);
    if (d < bd) { bd = d; id = key; }
  }
  if (!id) return null;
  let spec = null;
  try { spec = carById(id); } catch { spec = null; }
  if (!spec) return null;
  const who = spec.who === 'Yours' || spec.who === 'Le lot'
    ? '' : String(spec.who).replace(/'s$/, '');
  return {
    id, spec, who, dist: bd,
    name: shortCarName(id, spec), art: carArticle(id), why: CAR_WHY[id] || '',
  };
}

/**
 * The two HUD lines when no job is running. Rule: the first line says WHAT, the
 * second says HOW, and the second always names a key.
 */
export function freeRoamLines(G, garage = null) {
  const car = carUnderfoot(G);
  const owned = !car || !garage || !garage.has || garage.has(car.id, G.done);
  const cost = car && !owned && garage.cost ? garage.cost(car.id) : 0;
  // A car you do not have and cannot buy (cost 0: a friend's, locked behind a
  // job) is not an offer at all: no « acheter … · 0 $ », fall through to the job.
  if (car && (owned || cost > 0)) {
    if (!owned) {
      return {
        text: `E : acheter ${car.art} ${car.name}   ·   ${cost} $`,
        sub: `Arrête-toi à côté pis appuie sur E${car.why ? ' (' + car.why + ')' : ''}`,
        kind: 'buy',
        car,
      };
    }
    return {
      text: car.who
        ? `E : prendre ${car.art} ${car.name} de ${car.who}`
        : `E : prendre ton ${car.name}`,
      sub: car.why ? `(${car.why})` : 'Appuie sur E pour changer de char',
      kind: 'car',
      car,
    };
  }

  const job = earlyNext(G) || nearestJob(G);
  if (job) {
    return {
      text: `Prochaine job: ${job.def.title}, ${fmtDist(job.dist)}`,
      sub: `E sur le pilier jaune   ·   ${job.place.label}`,
      kind: 'job',
      job,
    };
  }

  // S4-SUMMER: nothing new is open because the story is waiting on its date
  // (campaign.js DATE_GATES): say which one and when, and how to get there.
  const wait = waitLines(G);
  if (wait) return wait;

  const again = nearestAnyJob(G);
  return {
    text: 'T’as tout fait. Roule.',
    sub: again
      ? `E sur un pilier pour refaire une job   ·   ${again.def.title}, ${fmtDist(again.dist)}`
      : 'E sur un pilier pour refaire une job',
    kind: 'done',
  };
}

// ---------------------------------------------------------------- stuck

/**
 * Have you covered STUCK_M metres in the last STUCK_T seconds? If not, the
 * stage's hint comes back and the objective line pulses. Returns the hint that
 * went out, or null.
 *
 * State lives on G.stuck so nothing here is a module-level global; a new job or
 * a new stage resets it.
 */
export function updateStuck(G, dt, hud = null, opts = {}) {
  const m = G && G.mission;
  if (!m) { G.stuck = null; return null; }
  const v = G.focus || G.veh;
  if (!v) return null;
  let s = G.stuck;
  if (!s || s.mission !== m) {
    s = G.stuck = { mission: m, idx: m.idx, x: v.x, z: v.z, t: 0, x0: v.x, z0: v.z, armed: false };
  }
  if (s.idx !== m.idx) { s.idx = m.idx; s.x = v.x; s.z = v.z; s.t = 0; }
  // QA F2 (29 Sept 2026): standing at spawn while Margaret's start lines play
  // is not being stuck. `hold` (a story bubble or a card is up) freezes the
  // clock; `requireMove` keeps it at zero until the player has first rolled a
  // few metres in this job. main.js passes both; the defaults keep the bare
  // 20 m / 20 s rule for callers that pass neither.
  const o = opts || {};
  if (!s.armed && Math.hypot(v.x - (s.x0 ?? v.x), v.z - (s.z0 ?? v.z)) >= ARM_M) s.armed = true;
  if (o.hold || (o.requireMove && !s.armed)) { s.x = v.x; s.z = v.z; s.t = 0; return null; }
  s.t += dt;
  if (Math.hypot(v.x - s.x, v.z - s.z) >= STUCK_M) { s.x = v.x; s.z = v.z; s.t = 0; return null; }
  if (s.t < STUCK_T) return null;
  s.t = 0; s.x = v.x; s.z = v.z;
  const st = m.stages[m.idx] || {};
  const hint = st.hint || st.sub || st.text || '';
  if (hud) {
    if (hint) hud.toast('Psst: ' + hint, 2800);
    hud.pulseObjective && hud.pulseObjective();
  }
  return hint || null;
}

// ---------------------------------------------------------------- the friends

// Two or three lines each, at the start and at the end of their job. They are
// bubbles, not toasts, so the name is in bold and they do not fight the big
// mission text for the middle of the screen.
//
// Canon for every line below is docs/STORY-LEDGER.md (28 Sept 2026 rulings)
// and docs/STORY-REBUILD.md, which labels each one USER CONFIRMED or PROPOSAL.
// Language (Tom, 6 Oct and 20 Oct 2026): the main cast (Tom, Sayyad, Zahra,
// Adam, Mike, Abraham, Tyler, Russell, Rob, Margaret) speaks English, Aylmer
// English: a French place name or a « dep » is fine, a whole French line is
// not. Staff, strangers and the narrator are Quebec French. The one exception
// is the Saint-Jean fire (arc.js). Margaret is Tom's mother, speaks English
// with him, calls him Tom, and never rides along with the gang. Tom's father
// does not live at 299 Fraser: he is only ever on the phone (DAD_CALLS below).
// New lines keep to 12 words / 70 characters.
//
// One trait and one tic each, from canon only, used about three times across
// the summer and never shared (tools/smoke_lang.mjs checks the tics):
//   Sayyad   sleeps, then a run-on about Macs. Tic « OK OK OK ».
//   Mike     the speech nobody asked for. Tic « Hear me out. »
//   Zahra    corrects you, then the nails. Tic « Wrong. »
//   Adam     orders everything « frolicking in mayo » (Tom, 14 Oct); Mayo is
//            also his town.
//   Abraham  short and warm; the bike that never leaves Tom's driveway.
//   Russell  never at fault. Tic « not my fault » / « the hill ».
//   « Trust me » belongs to nobody: it was three people's and read as one writer.
export const FRIEND_LINES = {
  // Tom, 6 Oct 2026: she finished Alanis Morissette's crowns at home, ran late,
  // and told all his friends about it. English; she calls him Tom. She rides
  // to the clinic with the box on her lap and talks the whole way
  // (lifejobs.js MARGARET_RIDE).
  margaretdental: {
    start: [
      ['Margaret', '« I’m late, Tom. You drive. I hold the box. »'],
      ['Margaret', '« Those are Alanis Morissette’s crowns. Drive like you know that. »'],
    ],
    end: [['Margaret', '« You can tell your friends. I already told them. »']],
  },
  // Zahra and the blackberry soda at Sol (28 Sept).
  solerrand: {
    start: [['Zahra', '« The blackberry one. Not raspberry. I’m not a baby. »']],
    end: [
      ['Zahra', '« Perfect. Cats would like this, if cats drank pop. »'],
      ['Sayyad', '« Thanks for driving my sister. Did she scratch you? »'],
    ],
  },
  // Tom worked at St. Vincent; Sayyad came along (28 Sept) and, awake, walks to
  // NASA on Somerset for samosas during the shift (Tom, D31, 13 Oct 2026: his
  // « I'll be asleep » line is cut; the English line is S1-ENGLISH's, 20 Oct).
  // B-06: the first line is the narrator's; Tom's own English version waits in
  // assets/text/story.proposed.json.
  // S4-SAUNA (20 Oct): the start plays at Sayyad's fence, before the drive;
  // the end after the samosas, with Sayyad back from NASA, not in the truck.
  stvincent: {
    start: [
      ['Sayyad', '« OK OK OK. I have the jug. You have the truck. »'],
      ['Sayyad', '« You work, I walk to NASA for samosas. Fair. »'],
    ],
    end: [
      ['La préposée', '« Les plateaux vont sur le chariot. Même heure demain? »'],
      ['Sayyad', '« Walked to NASA and back. Samosas, still warm. How was the shift? »'],
    ],
  },
  // Russell is English; the golf carts are real (28 Sept).
  russellroyal: {
    start: [
      ['Russell', '« Can you grab me at the Royal Ottawa? I’ll explain. »'],
      ['Russell', '« It’s not what it sounds like. It’s mostly the carts. »'],
    ],
    end: [
      ['Russell', '« The cart was fine. The hill was the problem. »'],
      ['Margaret', '« Hello, Russell. ...Tom, why is Russell here again? »'],
    ],
  },
  // Wave 3 — the jobs that are not deliveries (game/verbjobs.js).
  suis: {
    start: [['Sayyad', '« Regarde pas la carte, regarde-moé. Pis si tu me perds, c’est pas moé qui t’attends. »']],
    end: [['Sayyad', '« See? Shortcut. Dis-le pas à Adam. »']],
  },
  vitres: {
    start: [['Le garagiste', '« C’est une vitre. Pas une planche. Roule comme si ta mère était dessus. »']],
    end: [['Le garagiste', '« …Correct. Va te chercher un café, je te l’offre. »']],
  },
  // The theories were Sayyad's, not Mike's (28 Sept). Mike watches.
  seme: {
    start: [
      ['Sayyad', '« Theory: la police de Gatineau lâche après deux rues. Teste-la. »'],
      ['Mike', '« Moé, je regarde. Juste je regarde. »'],
    ],
    end: [['Sayyad', '« Two streets. I called it. Je vais l’écrire quelque part. »']],
  },
  sunfire: {
    start: [['Adam', '« Au bord de l’eau, proche du belvédère, là où on était l’an passé. Je te l’ai dit trois fois. »']],
    end: [['Adam', '« Le ticket? Quel ticket. …Ah. Ok. Je vais le payer en septembre. »']],
  },
  quatre: {
    start: [['Mike', '« Tout le monde dans le truck. Tom décide de l’ordre. Tom décide de tout, c’est son char. »']],
    end: [['Sayyad', '« T’as ramené tout le monde. Ça fait de toé le gars responsable. Ris pas, c’est vrai. »']],
  },
  // The drive to Hull is real, and Vertical Reality in the old mill (28 Sept).
  highwayhull: {
    start: [
      ['Margaret', '« Hull? Call me when you get there. Not after. When. »'],
      ['Sayyad', '« Vertical Reality. I’ve been training. Mentally. »'],
    ],
    end: [['Adam', '« Okay. Now we just have to find the way back. »']],
  },
  // The 105 to Chelsea is real (28 Sept).
  chelsea: {
    start: [['Adam', '« Stay on the 105. When it’s all trees, you’re almost there. »']],
    end: [['Sayyad', '« Chelsea and back for no reason. That’s a real ride. »']],
  },
  // Late for the 5:45 a.m. shift at the Royal Ottawa (28 Sept).
  school: {
    start: [['Margaret', '« Tom. TOM. It’s twenty to six. »']],
    end: [['Le superviseur', '« Cinq heures quarante-cinq. T’es à l’heure. Presque. »']],
  },
  // Abraham waiting in Tom's driveway, bike on the ground (Tom, 29 Sept).
  // Margaret is in the driveway too, and does not get in.
  gang: {
    start: [
      ['Margaret', '« Tom. Your friend’s bike is in the middle of my driveway. »'],
      ['Abraham', '« Hey man. Your mom gave me juice. Twice. »'],
    ],
    end: [
      ['Adam', '« Next time we leave from my place. Mayo. Bring a map. »'],
      ['Abraham', '« Same time tomorrow. My bike lives here now. »'],
    ],
  },
  // The alternator, with the twist: it was only the solenoid (28 Sept).
  alternateur: {
    start: [
      ['Margaret', '« Canadian Tire and straight back, Tom. I’m timing you. »'],
      ['Margaret', '« Put the box where it won’t slide. »'],
    ],
    end: [
      ['Margaret', '« That’s the whole alternator? For one little light? »'],
      ['Tom', '« It was just the solenoid. I know. I know. »'],
    ],
  },
  poutine: {
    start: [
      ['Sayyad', '« Deux grosses. Sauce à part. Pis grouille, le fromage attend pas. »'],
      ['Sayyad', '« Moé j’ai pas de char à midi. Toé oui. C’est de même que ça marche. »'],
    ],
    end: [
      ['Sayyad', '« Still hot. T’es une légende, man. »'],
      ['Sayyad', '« ...t’as-tu mangé des frites en chemin, toé? »'],
    ],
  },
  // Liberty yogurt, $1.99 for 750 g, at the Super C in the Galeries (28 Sept).
  dep: {
    start: [['Sayyad', '« Liberty, the 750 gram. Super C has it for $1.99. Just saying. »']],
    end: [['Adam', '« We drove to the park to eat yogurt. Okay. »']],
  },
  // OPEN DECISION (STORY-REBUILD.md): the CV run is not real. Guitar lessons
  // are (Tom taught guitar), so the three stops post his lesson ads instead.
  cv: {
    start: [['Margaret', '« Guitar lessons. Put your number on it. Not mine. »']],
    end: [['Margaret', '« Six in the morning? I’ll wake you. I won’t enjoy it. »']],
  },
  // Breakfast nachos with Zahra and Tyler, home before « Little Big Man »
  // ends at five (28 Sept).
  curfew: {
    start: [
      ['Tyler', '« Nachos for breakfast. Most important meal of the day. »'],
      ['Zahra', '« Wrong. Little Big Man ends at five. Drive. »'],
    ],
    // Main mission 10 (29 Sept): the whole gang in the kitchen, and at five
    // Margaret comes down and, for the first time, sits and eats with them.
    // Adam's Subway order is Tom's own fact (14 Oct): « frolicking in mayo ».
    end: [
      ['Russell', '« I brought the salsa. That counts as cooking. »'],
      ['Adam', '« Mine frolicking in mayo. Yes, nachos. Frolicking. »'],
      ['Margaret', '« Is there a plate for me, or what? »'],
      ['Zahra', '« Shh. This is the good part. »'],
    ],
  },
  tour: {
    start: [['Mike', '« Cinq spots avant que le soleil tombe. Vas-y. »']],
    end: [['Sayyad', '« Tu la connais, ta ville, là. »']],
  },
  // The $45 canoe is real (28 Sept).
  canot: {
    start: [
      ['Le monsieur', '« Quarante-cinq piasses. Il flotte. En principe. »'],
      ['Sayyad', '« A canoe. Forty-five bucks. Does the Ranger know? »'],
    ],
    end: [
      ['Sayyad', '« You crossed Lac Deschênes in a canoe patched with Bondo. »'],
      ['Sayyad', '« I’m proud and worried. Mostly worried. No, proud. Worried. »'],
    ],
  },
  // Revving, doughnuts and honking outside Sayyad's; he sleeps through it,
  // then he is awake and talking fast (28 Sept).
  sayyad: {
    start: [
      ['Mike', '« He’s not answering. Go wake him. Honk. Make noise. »'],
      ['Zahra', '« He won’t wake up. Ever. Good luck. »'],
    ],
    end: [
      ['Sayyad', '« THAT WAS YOU?! »'],
      ['Sayyad', '« OK OK OK I’m up. Did you know Panther has Exposé? Magic. »'],
      // The Civic is his; the threat stands whether or not he lends it.
      ['Sayyad', '« Scratch the Civic driving like that, you fix it. Here. Twenty bucks. »'],
    ],
  },
  // The couch in Mike's tree is 100% real: Tom and Sayyad, standing on the
  // truck (21 and 28 Sept).
  divan: {
    start: [
      ['Mike', '« My mom wants the couch outside. I want it in the tree. »'],
      ['Mike', '« Hear me out. Outside, in the tree. Same thing. Better thing. »'],
    ],
    end: [
      ['Mike', '« IT’S UP. Nobody touch anything. IT’S UP. »'],
      ['Sayyad', '« We were standing on the truck. On. The. Truck. »'],
      ['La mère de Mike', '« Tiens, 30 piasses. Pis descends-le avant l’hiver. »'],
    ],
  },
  // nuittim (set-piece agent): mission 8, « La nuit du Tim » (setpieces/nuittim.js).
  nuittim: {
    start: [
      ['Mike', '« Tom. It’s Sam. He’s barely answering. Come now. »'],
      ['Sayyad', '« I’m at Mike’s. Nobody drank. Just him. Come. »'],
    ],
    end: [
      ['Sayyad', '« I’ll come by tomorrow. With muffins. Go sleep. »'],
    ],
  },
  // The golf-key night as Tom tells it (6 Oct 2026): Sayyad started it.
  golfcart: {
    start: [
      ['Sayyad', '« Any small key fits a golf cart. Any. I’m serious. »'],
      ['Sayyad', '« Mailbox key, bike lock, glovebox. Whatever. It works. »'],
    ],
    end: [
      ['Sayyad', '« That never happened. But I was right. »'],
    ],
  },
  racedave: {
    start: [
      ['Adam', '« My Sunfire is faster than your car. That’s math. »'],
      ['Adam', '« Loser pays for gas. The winner’s gas. »'],
    ],
    end: [['Adam', '« ...okay. The math went the other way. »']],
  },
  racecivic: {
    start: [
      ['Sayyad', '« I put rims on. People need to know. »'],
      ['Sayyad', '« Through the Vieux. Not the boulevard. The boulevard’s boring. »'],
    ],
    end: [['Sayyad', '« OK OK OK. Maybe the speed isn’t in the rims. »']],
  },
  circuit: {
    start: [
      ['Sayyad', '« Three laps. I’ve calculated the racing line. Twice. »'],
      ['Adam', '« Nobody’s out Sunday morning. Nobody. »'],
    ],
    end: [['Adam', '« My suspension’s done. It was done before, but still. »']],
  },
  // The blitz clock is BLITZ_CLOCK (130 s) plus BLITZ_BONUS per checkpoint
  // (racejobs.js); the old French line said sixty.
  blitz: {
    start: [
      ['Sayyad', '« Hundred and thirty seconds. Every checkpoint gives you fifteen back. »'],
      ['Sayyad', '« The clock never stops. Neither do I. »'],
    ],
    end: [['Sayyad', '« Six for six. You beat the town. »']],
  },
};

// Four people stand on their own lawn now (avatars.js), so you can pull up to
// them outside a job. These are what they say when you do: same bubbles, same
// voice as FRIEND_LINES, keyed by person instead of by job.
export const GREETINGS = {
  sayyad: [
    '« Hey. You drive past my house and don’t even honk? »',
    '« Two minutes. I can’t find my shoes. Or my keys. »',
    '« Don’t touch the Civic. Look at it. That’s all. »',
    '« Did you know Macs don’t get the Windows viruses? None. Zero. »',
  ],
  // Tom's mother, in her own driveway at 299 Fraser. English, and she calls
  // him Tom. Kind, and sure he is up to something (ledger s.1, 22 Sept).
  margaret: [
    '« Tom. Where are you going? ...I’m just asking. »',
    '« Did you eat? There’s pasta. Bring Sayyad, he’s polite. »',
    '« Seatbelt, Tom. I can see you from here. »',
    '« Home for supper? Say yes. »',
  ],
  mike: [
    '« OK but listen. LISTEN. Two hundred songs on my iPod. »',
    '« I have three points. The first one has two. Hear me out. »',
    '« My mom said no. My mom hasn’t seen the plan. »',
    '« No no no, wait, you don’t get it yet. It’s short. »',
  ],
  // Sayyad's sister, 16, who has heard all of it already. Smart, fun, loves
  // cats, and will go for you with her nails (21 Sept).
  zahra: [
    '« He’s not here. And no, I don’t know where. »',
    '« If you see him, it’s my turn for the Discman. »',
    '« The neighbour’s cat likes me more than people. Fair. »',
    '« Don’t come closer. I did my nails. They’re sharp. »',
  ],
};

/** One of a person's driveway lines, or null if we do not know them. */
export function greeting(who, i = 0) {
  const pool = GREETINGS[who];
  if (!pool || !pool.length) return null;
  return pool[((i % pool.length) + pool.length) % pool.length];
}

// ------------------------------------------------------- the dialogue file
//
// FRIEND_LINES above is written per JOB: the specific thing Margaret says as
// Tom leaves for the Canadian Tire. What follows is the other axis — what a
// person says when they get IN and when they get OUT, whatever the job is. It
// is data, in assets/text/dialogue.json, so a writer can add a line without
// opening a module.
//
// The pools below are the fallback and they are complete enough to play with:
// nothing here ever waits on the fetch, and the game runs with the file
// deleted. applyDialogue() merges the file over them when it lands.
//
export const DIALOGUE = {
  Sayyad: {
    start: [
      '« Two minutes. I’m up. I’m up. OK, go. »',
      '« Get in. No wait, I’m the one getting in. Go. »',
    ],
    end: ['« Okay. That was a ride. »'],
  },
  // Margaret's pool is home, not the road: « start » is Tom leaving the
  // driveway, « end » is Tom coming back to it (avatars.js picks the set).
  Margaret: {
    start: ['« Where are you off to? ...I’m just asking. »'],
    end: ['« You’re home. Good. What did you break? »'],
  },
  Adam: {
    start: ['« I’ll sit in the back. My legs are short anyway. »'],
    end: ['« Okay. See you. »'],
  },
  // Zahra has a third category of her own: what she says about her brother
  // when the two of them are in the same place, which is most of the time.
  Zahra: {
    start: ['« Don’t pull out too fast, I have a coffee. »'],
    end: ['« Seven out of ten. For the driving. »'],
    'about-sayyad': ['« My brother thinks he’s a mechanical genius. »'],
  },
};

// The file is written with straight apostrophes and no quotes around the line;
// everything else the player reads uses « » and ’, so the lines are normalised
// on the way in rather than at every call site.
const quote = (s) => {
  const t = String(s).trim().replace(/'/g, '’');
  return t.startsWith('«') ? t : '« ' + t + ' »';
};

/**
 * Merge a parsed dialogue.json into DIALOGUE. Shape: { dialogue: [{ who,
 * when, line }] }. A `who` we have never heard of gets its own pool rather
 * than being dropped — the file is allowed to know about people this module
 * does not. Returns how many lines were taken.
 */
export function applyDialogue(json) {
  const rows = json && Array.isArray(json.dialogue) ? json.dialogue : null;
  if (!rows) return 0;
  const seen = new Set();
  let n = 0;
  for (const r of rows) {
    if (!r || !r.who || !r.line) continue;
    // `when` is whatever the file says, not just start/end: zahra.json adds an
    // « about-sayyad » set, and a category that lands tomorrow should be usable
    // tomorrow rather than being folded into `start` and lost.
    const when = String(r.when || 'start');
    const p = DIALOGUE[r.who] || (DIALOGUE[r.who] = { start: [], end: [] });
    const key = r.who + '' + when;
    if (!seen.has(key)) { seen.add(key); p[when] = []; }   // the file replaces the fallback
    p[when].push(quote(r.line));
    n++;
  }
  return n;
}

/** One line from a person's pool, rotating. Null for somebody we do not know. */
export function personLine(who, when = 'start', i = 0) {
  const p = DIALOGUE[who];
  const pool = p && p[when];
  if (!pool || !pool.length) return null;
  return pool[((i % pool.length) + pool.length) % pool.length];
}

// The files that carry it. One per writer, all the same shape, all optional.
export const DIALOGUE_FILES = ['dialogue.json', 'zahra.json'];

/** Fetch and merge one dialogue file. Resolves to 0 if it is not there. */
export function loadDialogue(name = DIALOGUE_FILES[0]) {
  const u = /^[a-z0-9._-]+$/i.test(name)
    ? new URL('../../assets/text/' + name, import.meta.url).href : name;
  return fetch(u)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => applyDialogue(j))
    .catch(() => 0);
}

// Kicked from here rather than from main.js: nothing waits on it, the fallback
// pools are already live, and main.js owns four hook lines that are not this.
// Skipped outside a browser so every smoke suite stays synchronous.
if (typeof document !== 'undefined' && typeof fetch === 'function') {
  Promise.all(DIALOGUE_FILES.map(loadDialogue)).then((counts) => {
    const n = counts.reduce((a, b) => a + b, 0);
    if (n) console.log(`dialogue: ${n} lines`);
  });
}

// ------------------------------------------------------------ Dad, on the phone
//
// Tom's father did not live at 299 Fraser (ledger s.1). He is in the game only
// as a phone call when Tom is out of money (Tom, 28 Sept 2026): he offers before
// he is asked, he is eager, it clearly costs him a lot, he never complains and
// he tries to hide it. The electric piano is Tom's own example; the other two
// are PROPOSAL wording in the same shape. He drove a Dodge Intrepid (1994, Tom
// thinks). He speaks English with Tom, like the rest of the family
// (PROPOSAL: Tom quoted him in English; the ledger does not rule on it).
//
// DATA ONLY. Nothing here touches the wallet, the HUD or the clock. The
// economy owner wires it: see dadCall() and docs/STORY-REBUILD.md, « Dad's
// call: the hook ».
export const DAD_WHO = 'Ton père, au téléphone';
// 2004: the call comes in on the landline at 299 Fraser, the black corded desk
// phone (Tom, 29 Sept), so it only happens at home. Margaret picks up and calls
// down to him first. PROPOSAL wording; English, like everything she says to Tom.
export const DAD_PICKUP = ['Margaret', '« Tom! Phone! It’s your father. »'];

export const DAD_CALLS = [
  {
    id: 'piano',
    amount: 85,
    lines: [
      '« Tom! Before you say anything. How are you for money? »',
      '« Don’t worry about me. I just sold my electric piano. »',
      '« Eighty-five bucks. It’s yours. No, I insist. »',
    ],
    // What Tom hears down the line: the thing he says he sold.
    tell: '« Clonk. Trois notes de piano électrique. »',
    cover: '« ...that’s the radio. »',
  },
  {
    id: 'spare',
    amount: 40,
    lines: [
      '« Tom, it’s me. You sound broke. I can hear it. »',
      '« I sold the spare out of the Intrepid. Who needs a spare? »',
      '« Forty dollars. Take it. It’s nothing. »',
    ],
    tell: '« Pschhhh. Un pneu qui se dégonfle, pas loin. »',
    cover: '« ...that’s the neighbour. Different tire. »',
  },
  {
    id: 'coat',
    amount: 60,
    lines: [
      '« I was just thinking about you. Money okay? »',
      '« I found sixty in my winter coat. In July! Lucky. »',
      '« It’s yours. I was going to call anyway. »',
    ],
    tell: '« Un pot de monnaie qu’on vide sur une table. »',
    cover: '« ...I’m sorting buttons. »',
  },
];

// The first suggested trigger. NOT what the game uses: dadcall.js (economy)
// decides when he calls (under $15, a bill in front of Tom, stopped, once a
// game week, three a summer) and reads the calls through dadCall(n).
export const DAD_CALL_RULE = { walletBelow: 5, gapJobs: 3 };

/**
 * The n-th call (rotating), as data: who speaks, the bubbles in order, the tell
 * and the cover line, and the amount he offers. Pure; never null.
 *
 * Wired by src/game/dadcall.js (maybeDadCall, run from fuel.tickFuel): the
 * bubbles go through heckle.line() in order, the amount into the wallet, and
 * G.dadCalls = { n, week, log } is saved with the slot.
 */
export function dadCall(n = 0) {
  const i = ((Math.floor(n) % DAD_CALLS.length) + DAD_CALLS.length) % DAD_CALLS.length;
  const c = DAD_CALLS[i];
  return {
    id: c.id,
    amount: c.amount,
    who: DAD_WHO,
    bubbles: [
      ...c.lines.map((t) => [DAD_WHO, t]),
      ['Au bout du fil', c.tell],
      [DAD_WHO, c.cover],
    ],
    toast: `Ton père t’envoie ${c.amount} $. Il a dit que ça le dérangeait pas.`,
  };
}

/** [[who, text], ...] for a job's start or end; [] when nobody has anything to say. */
export function friendLines(id, which = 'start') {
  const e = FRIEND_LINES[id];
  if (!e) return [];
  return (e[which] || []).slice();
}
