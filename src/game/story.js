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
import { MISSIONS } from './missions.js';
import { PLACES } from './places.js';
import { carById } from './cars.js';

export const STUCK_M = 20;        // metres you have to cover...
export const STUCK_T = 20;        // ...in this many seconds, or you get a nudge

// ---------------------------------------------------------------- the opener

export const STORY_CARDS = [
  {
    title: 'ÉTÉ 2004',
    body: 'T’as dix-sept ans pis t’es à Aylmer, Québec. L’école est finie, il fait '
      + '28 degrés, pis ton père a laissé les clés du Ranger XLT 1993 dans le plat '
      + 'à monnaie en partant travailler.\n\n'
      + 'Un permis. Un demi-réservoir. Rien de prévu jusqu’en septembre.',
  },
  {
    title: 'LA GANG',
    body: 'Margaret reste juste à côté, au 299 Fraser — c’est sa Saturn dans l’entrée.\n'
      + 'Sayyad est sur Denise-Friend, avec la Civic pis ses jantes neuves.\n'
      + 'Adam reste loin en s’il-vous-plaît, à Deschênes, avec le Sunfire.\n'
      + 'Pis Mike, sur Frank-Robinson, a un divan pis une idée.',
  },
  {
    title: 'LES PILIERS JAUNES',
    body: 'Une job, c’est un pilier jaune. Roule dedans, arrête-toi, pis appuie sur E.\n\n'
      + 'La ligne bleue, c’est le GPS: elle t’amène toujours au prochain arrêt.\n'
      + 'Tab ouvre la grande carte. Backspace abandonne une job. T remet le char '
      + 'sur le chemin quand t’es dans le fossé.',
  },
  {
    title: 'PREMIÈRE JOB',
    body: 'Va chercher ta première job: le pilier jaune chez vous (E dessus).\n\n'
      + 'On te met un waypoint dessus. Prends ton temps — la ville est à toi '
      + 'jusqu’à minuit.',
  },
];

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
    if (this.root) this.root.classList.remove('hidden');
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
    if (this.root) this.root.classList.add('hidden');
    const fn = this.onDone;
    this.onDone = null;
    if (fn) fn();
    return true;
  }

  hide() { this.active = false; if (this.root) this.root.classList.add('hidden'); }

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
        ? 'E — embarque   ·   Échap pour passer'
        : 'E — la suite   ·   Échap pour passer';
    }
  }
}

// ---------------------------------------------------------------- guidance

export const fmtDist = (d) => (d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km');

/** The closest job you have not done yet (or, if you did them all, null). */
export function nearestJob(G, list = MISSIONS) {
  const v = G && (G.focus || G.veh);
  if (!v) return null;
  let best = null, bd = Infinity;
  for (const def of list) {
    if (G.done && G.done.has && G.done.has(def.id)) continue;
    const p = PLACES[def.giver];
    if (!p) continue;
    const d = Math.hypot(p.x - v.x, p.z - v.z);
    if (d < bd) { bd = d; best = { def, place: p, dist: d }; }
  }
  return best;
}

/** The closest job of all, done or not — for when there is nothing left to do. */
export function nearestAnyJob(G, list = MISSIONS) {
  const v = G && (G.focus || G.veh);
  if (!v) return null;
  let best = null, bd = Infinity;
  for (const def of list) {
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
  cutlass: 'Cutlass', cavalier: 'Cavalier Z24', caravan: 'Caravan', bus: 'bus scolaire',
};
const CAR_ART = {
  ranger: 'le', saturn: 'la', civic: 'la', sunfire: 'la',
  cutlass: 'la', cavalier: 'la', caravan: 'la', bus: 'le',
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
  saturn: 'Margaret a dit oui en 1998, ça compte encore',
  sunfire: 'Adam a laissé les clés dedans, comme toujours',
  ranger: 'ton char, tes règles',
  cutlass: 'ça sent le cendrier pis c’est correct de même',
  cavalier: 'quelqu’un a mis des flammes dessus. Quelqu’un.',
  caravan: 'sept places, zéro dignité',
  bus: 'personne va te demander ton permis de classe 2',
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
  if (car) {
    const owned = !garage || !garage.has || garage.has(car.id, G.done);
    if (!owned) {
      const cost = garage.cost ? garage.cost(car.id) : 0;
      return {
        text: `E — acheter ${car.art} ${car.name}   ·   ${cost} $`,
        sub: `Arrête-toi à côté pis appuie sur E${car.why ? ' (' + car.why + ')' : ''}`,
        kind: 'buy',
        car,
      };
    }
    return {
      text: car.who
        ? `E — prendre ${car.art} ${car.name} de ${car.who}`
        : `E — prendre ton ${car.name}`,
      sub: car.why ? `(${car.why})` : 'Appuie sur E pour changer de char',
      kind: 'car',
      car,
    };
  }

  const job = nearestJob(G);
  if (job) {
    return {
      text: `Prochaine job: ${job.def.title} — ${fmtDist(job.dist)}`,
      sub: `E sur le pilier jaune   ·   ${job.place.label}`,
      kind: 'job',
      job,
    };
  }

  const again = nearestAnyJob(G);
  return {
    text: 'T’as tout fait. Roule.',
    sub: again
      ? `E sur un pilier pour refaire une job   ·   ${again.def.title}, ${fmtDist(again.dist)}`
      : 'Tab pour la carte   ·   E sur un pilier pour refaire une job',
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
export function updateStuck(G, dt, hud = null) {
  const m = G && G.mission;
  if (!m) { G.stuck = null; return null; }
  const v = G.focus || G.veh;
  if (!v) return null;
  let s = G.stuck;
  if (!s || s.mission !== m) { s = G.stuck = { mission: m, idx: m.idx, x: v.x, z: v.z, t: 0 }; }
  if (s.idx !== m.idx) { s.idx = m.idx; s.x = v.x; s.z = v.z; s.t = 0; }
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
export const FRIEND_LINES = {
  school: {
    start: [['Ton père', '« Les clés sont dans le plat à monnaie. Touche pas au radio. »']],
    end: [['Ta mère', '« Ton prof a appelé. Il a dit que t’étais “à l’heure”. »']],
  },
  gang: {
    start: [
      ['Margaret', '« Enfin. Ça fait vingt minutes que j’attends dans l’entrée. »'],
      ['Sayyad', '« J’amène mes cassettes. Discute pas. »'],
    ],
    end: [
      ['Adam', '« La prochaine fois, tu pars de chez nous. »'],
      ['Margaret', '« Bon chauffeur. Pour un gars. »'],
    ],
  },
  poutine: {
    start: [
      ['Sayyad', '« Deux grosses. Sauce à part. Pis grouille, le fromage attend pas. »'],
    ],
    end: [
      ['Sayyad', '« Encore chaud. T’es une légende, mon homme. »'],
      ['Sayyad', '« ...t’as-tu mangé des frites en chemin, toé? »'],
    ],
  },
  dep: {
    start: [['Margaret', '« Quatre slush bleues. Pas de rouge. Le rouge, c’est pour les enfants. »']],
    end: [['Adam', '« Y en reste encore. C’est un miracle. »']],
  },
  cv: {
    start: [['Ta mère', '« J’en ai imprimé douze. Reviens pas avec douze. »']],
    end: [['Ta mère', '« Un essai samedi six heures du matin. Six heures, mon grand. »']],
  },
  curfew: {
    start: [['Ton père', '« Minuit. Pas minuit et cinq. Minuit. »']],
    end: [['Ton père', '« ...j’dormais pas. J’lisais. »']],
  },
  tour: {
    start: [['Margaret', '« Cinq spots avant que le soleil tombe. Vas-y. »']],
    end: [['Margaret', '« Tu la connais, ta ville, là. »']],
  },
  canot: {
    start: [
      ['Le monsieur', '« Quarante-cinq piasses. Il flotte. En principe. »'],
      ['Sayyad', '« Un canot. T’as acheté un canot. »'],
    ],
    end: [
      ['Sayyad', '« T’as traversé le lac Deschênes dans un canot patché au Bondo. »'],
      ['Sayyad', '« J’suis fier pis inquiet en même temps. »'],
    ],
  },
  sayyad: {
    start: [
      ['Margaret', '« Il répond pas depuis mardi. Réveille-le. »'],
      ['Margaret', '« ...pas trop fort quand même. »'],
    ],
    end: [
      ['Sayyad', '« C’ÉTAIT TOÉ?! »'],
      ['Sayyad', '« Si tu scratches la Civic, tu la répares. Tiens, 20 piasses. »'],
    ],
  },
  divan: {
    start: [
      ['Mike', '« Ma mère veut le divan dehors. Moi je le veux dans l’arbre. »'],
      ['Mike', '« C’est pas la même affaire, mais c’est dehors pareil. »'],
    ],
    end: [
      ['Mike', '« OSTIE. »'],
      ['La mère de Mike', '« Tiens, 30 piasses. Pis descends-le avant l’hiver. »'],
    ],
  },
  golfcart: {
    start: [
      ['Le kid du pro shop', '« Les carts des membres disparaissent. Y en a un à l’école, encore. »'],
      ['Le kid du pro shop', '« Le marshal fait son tour dans dix minutes. Fais ça vite. »'],
    ],
    end: [
      ['Le kid du pro shop', '« Merci. Dis rien au marshal. »'],
      ['Le marshal', '« … C’était-tu toi, ça? »'],
    ],
  },
  racedave: {
    start: [
      ['Adam', '« Mon Sunfire est plus vite que ton char. C’est mathématique. »'],
      ['Adam', '« Premier arrivé paye le Slush. »'],
    ],
    end: [['Adam', '« ...bon. C’était la mathématique de l’autre sens. »']],
  },
  racecivic: {
    start: [
      ['Sayyad', '« J’ai mis des jantes. Faut que le monde le sache. »'],
      ['Sayyad', '« Par le Vieux. Pas par le boulevard, c’est plate. »'],
    ],
    end: [['Sayyad', '« Les jantes, c’est peut-être pas dans les jantes. »']],
  },
  circuit: {
    start: [
      ['Margaret', '« Trois tours. Pis touche pas à ma Saturn. »'],
      ['Adam', '« Y a personne le dimanche matin. Personne. »'],
    ],
    end: [['Adam', '« Ma suspension est finie. Elle l’était avant, mais quand même. »']],
  },
  blitz: {
    start: [
      ['Sayyad', '« Soixante secondes. Chaque checkpoint t’en redonne quinze. »'],
      ['Sayyad', '« Le chrono arrête jamais. Moi non plus. »'],
    ],
    end: [['Sayyad', '« Six sur six. T’as battu la ville. »']],
  },
};

/** [[who, text], ...] for a job's start or end; [] when nobody has anything to say. */
export function friendLines(id, which = 'start') {
  const e = FRIEND_LINES[id];
  if (!e) return [];
  return (e[which] || []).slice();
}
