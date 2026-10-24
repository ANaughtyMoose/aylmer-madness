// The opening, as data (docs/design/OPENING.md). Pure: no DOM, no imports, so
// tools/smoke_opening.mjs can read every word and every camera key in Node.
//
// Language (Tom, 6 Oct 2026): the narrator, the crawl, the captions and the
// name cards are Quebec French; what a main character SAYS is English (Tom,
// Margaret, the friends, Russell, Dad on the phone). `en` is the English-build
// copy of the narrator text. No em dashes anywhere.
//
// Coordinates are the game's: x east, z SOUTH, metres (tools/build_map.py).
// A camera key is [t, x, y, z, lx, ly, lz, fov]: t is 0..1 through the shot,
// (x, y, z) the eye and (lx, ly, lz) what it looks at. Both heights are metres
// ABOVE THE GROUND at that point (the director adds the terrain), so a rail
// written over Rue Principale stays over Rue Principale on its hill.

/** Seconds. The 2D part plays over the world bake; the 3D part needs the world. */
export const COLD_AT = 0, TITLE_AT = 6.5, CRAWL_AT = 14, CRAWL_END = 42;

/** « A long time ago in a galaxy far, far away », done as Aylmer. */
export const COLD_OPEN = {
  fr: 'Il y a pas si longtemps, dans une banlieue pas si loin d’Ottawa…',
  en: 'Not so long ago, in a suburb not so far from Ottawa…',
};

export const TITLE = { top: 'AYLMER', bottom: 'MADNESS', tag: { fr: 'ÉTÉ 2004', en: 'SUMMER 2004' } };

// The crawl. Three short paragraphs, Star Wars length: who, the situation and
// the stakes, then the thing nobody says out loud yet (the theme, not stated:
// MAIN-STORY-PROPOSAL.md rule 3). All true to the ledger: the Ranger was Dad's
// gift, bald tires; the year before Tom finishes Heritage; 76 days from 22 June
// to Labour Day 2004; the $1,200 envelope (save.js DEFAULT_TARGET); Aylmer was
// merged into Gatineau on 1 January 2002.
export const CRAWL = {
  episode: { fr: 'ÉPISODE XVII', en: 'EPISODE XVII' },
  title: { fr: 'LE DERNIER ÉTÉ TRANQUILLE', en: 'THE LAST EASY SUMMER' },
  paragraphs: {
    fr: [
      'C’est l’été 2004. Aylmer fait partie de Gatineau depuis deux ans, mais personne l’appelle de même. Tom a dix-sept ans, une dernière année à Heritage devant lui, pis un Ford Ranger 1993 aux pneus chauves que son père lui a donné.',
      'Le Ranger part. La plupart du temps. Le gaz pis les pièces, c’est Tom qui paie, pis ses chums le remboursent surtout en « merci ». Objectif : 1 200 $ dans l’enveloppe avant la fête du Travail.',
      'Personne le dit encore, mais tout le monde le sait. C’est le dernier été où personne a besoin de décider quoi que ce soit. Il reste soixante-seize jours…',
    ],
    en: [
      'It is the summer of 2004. Aylmer has been part of Gatineau for two years, but nobody calls it that. Tom is seventeen, with one last year at Heritage ahead of him and a 1993 Ford Ranger on bald tires that his father gave him.',
      'The Ranger starts. Most of the time. Tom pays for the gas and the parts, and his friends pay him back mostly in thank-yous. The goal: $1,200 in the envelope by Labour Day.',
      'Nobody says it yet, but everybody knows. It is the last summer when nobody has to decide anything. There are seventy-six days left…',
    ],
  },
};

// The whole 3D part runs on one clock: from 5:30 a.m., the last stars out over
// the lake, to 6:30 with the sun up on Fraser. The prototype's day carries on
// from there; the classic renderer goes back to its own clock (main.js). A card
// freezes the clock with the picture.
export const DAWN = { from: 5.5, to: 6.5 };

// Accent colours for the name cards: one per person, never reused.
const ACCENT = {
  sayyad: '#ffb02e', zahra: '#e8508a', mike: '#5ec8f2', abraham: '#9ad04a',
  russell: '#ff6a3d', ranger: '#f2f2ea', margaret: '#f7c66b', dad: '#b9a7ff', tom: '#ffd23f', gang: '#7fe0c8',
};

/**
 * A name card. `kicker` over the name, `place` under it, `line` is the
 * narrator's one sentence (French), `says` is what the person says (English,
 * 12 words or fewer, docs/STORY-HANDOFF.md), `portrait` the optional private
 * art (references/story/intro/opening/, never in the repo). `ink` is where the
 * bubble points on screen when the director cannot project a head.
 */
function card(id, o) { return { id, accent: ACCENT[id], ...o }; }

export const CARDS = {
  sayyad: card('sayyad', {
    name: 'SAYYAD',
    kicker: { fr: 'LE MEILLEUR CHUM', en: 'THE BEST FRIEND' },
    place: '75, rue Denise-Friend',
    line: { fr: 'Dort jusqu’à midi. Une fois réveillé, parle juste de Mac.', en: 'Sleeps until noon. Once awake, talks only about Macs.' },
    says: [['Sayyad', 'Five more minutes… the new G5 is liquid-cooled, Tom.', 'muffled']],
    portrait: 'card_sayyad',
  }),
  zahra: card('zahra', {
    name: 'ZAHRA',
    kicker: { fr: 'LA SŒUR DE SAYYAD', en: 'SAYYAD’S SISTER' },
    place: '16 ans',
    line: { fr: 'Aime les chats. Plus intelligente que toi. Griffe.', en: 'Loves cats. Smarter than you. Scratches.' },
    says: [['Zahra', 'He’s asleep. He’s always asleep. Honk, I dare you.']],
    portrait: 'card_zahra',
  }),
  mike: card('mike', {
    name: 'MIKE',
    kicker: { fr: 'LE DISCOURS', en: 'THE SPEECH' },
    place: '129, avenue Frank-Robinson',
    // Only Mike gets to make a speech (ledger); the theories were Sayyad's.
    line: { fr: 'Un iPod, un discours pour chaque occasion, pis un érable vide. Pour l’instant.', en: 'An iPod, a speech for every occasion, and an empty maple. For now.' },
    says: [['Mike', 'Hear me out. That tree is missing a couch.']],
    portrait: 'card_mike',
  }),
  abraham: card('abraham', {
    name: 'ABRAHAM',
    kicker: { fr: 'LA GUITARE', en: 'THE GUITAR' },
    place: '841, boulevard Wilfrid-Lavigne',
    // Summer 2004 = long curls (Tom, 14 Oct); the dreadlocks were earlier.
    line: { fr: 'Des grandes boucles, un t-shirt de Led Zep. Sa bike va finir couchée dans ton entrée.', en: 'Long curls, a Led Zep shirt. His bike will end up lying in your driveway.' },
    says: [['Abraham', 'Your mom still thinks I’m up to something. I’m not. Mostly.']],
    portrait: 'card_abraham',
  }),
  russell: card('russell', {
    name: 'RUSSELL',
    kicker: { fr: 'L’ANGLAIS', en: 'THE ANGLO' },
    place: '1, rue Arial',
    line: { fr: 'Conduit une voiturette de golf comme un char de course. C’est jamais de sa faute.', en: 'Drives a golf cart like a race car. It is never his fault.' },
    says: [['Russell', 'Whatever you heard, it wasn’t my fault. The hill did that.']],
    portrait: 'card_russell',
  }),
  gang: card('gang', {
    name: 'PIS LA GANG',
    kicker: { fr: 'ADAM · TYLER · ROBIN · ALEX', en: 'ADAM · TYLER · ROBIN · ALEX' },
    place: '',
    line: { fr: 'Adam descend de Mayo. Les autres, tu vas les ramasser en chemin.', en: 'Adam drives in from Mayo. The rest you will pick up on the way.' },
    says: [],
    portrait: null,
  }),
  ranger: card('ranger', {
    name: 'LE RANGER',
    kicker: { fr: '0 À 100 KM/H : ÉVENTUELLEMENT', en: '0 TO 100 KM/H: EVENTUALLY' },
    place: 'Ford 1993 · 4 cylindres · banc 3 places',
    line: { fr: 'Un cadeau de ton père. Quatre pneus chauves. Pas le plus beau. Le seul.', en: 'A gift from your father. Four bald tires. Not the best looking. The only one.' },
    says: [],
    portrait: 'card_ranger',
  }),
  margaret: card('margaret', {
    name: 'MARGARET',
    kicker: { fr: 'TA MÈRE', en: 'YOUR MOTHER' },
    place: '299, chemin Fraser',
    line: { fr: 'Très, très fine. Convaincue que t’es en train de faire un mauvais coup.', en: 'Very, very nice. Convinced you are up to something.' },
    says: [['Margaret', 'Tom. Where are you going this early?'], ['Margaret', 'Who else is going? …Take a muffin.']],
    portrait: 'card_margaret',
  }),
  dad: card('dad', {
    name: 'TON PÈRE',
    kicker: { fr: 'SUR LA LIGNE FIXE', en: 'ON THE LANDLINE' },
    place: '',
    line: { fr: 'Reste pas à Aylmer. Appelle quand même. Paie toujours plus qu’il le dit.', en: 'Does not live in Aylmer. Calls anyway. Always pays more than he says.' },
    says: [
      ['Ton père', 'Hey, it’s me. Is that battery light still on?'],
      ['Ton père', 'I ordered you an alternator. Canadian Tire, at the Galeries. It’s paid.'],
      ['Ton père', 'Don’t worry about it. Tell your mother I called.'],
    ],
    portrait: null,
    phone: true,
  }),
  tom: card('tom', {
    name: 'TOM',
    kicker: { fr: 'LE GARS DU SOUS-SOL', en: 'THE GUY IN THE BASEMENT' },
    place: '17 ans · une dernière année à Heritage',
    line: { fr: 'Soixante-seize jours. Un truck. Toute la ville.', en: 'Seventy-six days. One truck. The whole town.' },
    says: [],
    portrait: 'card_tom',
  }),
};

/**
 * The shots, in order. `dur` seconds; `cardAt` is when the picture freezes and
 * the card slams in, `hold` how long it stays. `caption` is the location slug
 * typed into the letterbox. `fog` scales the fog (dawn haze is welcome, but an
 * aerial needs to see the town) and `dd` the draw distance, both restored after.
 * `hide` lists avatars that are not on their lawn in this shot (Sayyad is
 * asleep); `couch: false` empties Mike's maple for the setup.
 *
 * B-11: this is the director's cut now (« Revoir l'intro », ?intro=long), kept
 * byte for byte. A first launch plays FIRST_SHOTS below.
 */
export const LONG_SHOTS = [
  { id: 'lake', dur: 9, fog: 0.55, dd: 1500,
    caption: { fr: 'LAC DESCHÊNES · MARDI 22 JUIN 2004', en: 'LAC DESCHÊNES · TUESDAY, 22 JUNE 2004' },
    // The Star Wars move: up in the stars, tilt down to the planet. Here the
    // stars are the game's own 5 a.m. sky and the planet is the marina light.
    keys: [
      [0, -2160, 46, 270, -1960, 250, -40, 1.05],
      [0.55, -2130, 42, 245, -1720, 40, -120, 1.0],
      [1, -2090, 38, 215, -1690, 4, -106, 0.95],
    ] },
  { id: 'marina', dur: 6.5, fog: 0.6, dd: 1400,
    caption: { fr: 'MARINA D’AYLMER', en: 'AYLMER MARINA' },
    keys: [
      [0, -1905, 26, 10, -1686, 8, -106, 0.95],
      [0.5, -1790, 20, -30, -1600, 6, -90, 0.95],
      [1, -1700, 17, -55, -1517, 6, -61, 0.92],
    ] },
  { id: 'principale', dur: 7, fog: 0.7, dd: 1200,
    caption: { fr: 'VIEUX-AYLMER · RUE PRINCIPALE', en: 'OLD AYLMER · RUE PRINCIPALE' },
    // Down onto the old strip, the British Hotel's stone front coming up on the left.
    keys: [
      [0, -1110, 14, -62, -950, 6, -100, 0.85],
      [0.5, -1020, 8, -72, -916, 6, -112, 0.85],
      [1, -962, 4.2, -80, -916, 7, -112, 0.85],
    ] },
  { id: 'sayyad', dur: 3.2, cardAt: 2.2, hold: 4, card: 'sayyad', fog: 0.8, dd: 900, hide: ['sayyad'], sx: 0.66,
    // Nobody on the lawn: he is upstairs, asleep, and will be until noon.
    keys: [
      [0, -726, 15, -420, -721, 4, -465, 0.78],
      [1, -731, 3.4, -441, -721, 4.2, -465, 0.7],
    ] },
  { id: 'zahra', dur: 2.2, cardAt: 2.0, hold: 3.6, card: 'zahra', fog: 0.8, dd: 900, hide: ['sayyad'], sx: 0.7,
    keys: [
      [0, -731, 3.4, -441, -721, 4.2, -465, 0.7],
      [1, -706, 1.7, -450, -714.6, 1.3, -456.8, 0.55],
    ] },
  { id: 'mike', dur: 3.2, cardAt: 2.4, hold: 3.8, card: 'mike', fog: 0.8, dd: 900, couch: false, sx: 0.7, sy: 0.58,
    keys: [
      [0, -382, 11, 84, -413, 4, 57, 0.9],
      [1, -404, 1.9, 66, -413.3, 2.6, 56.8, 0.8],
    ] },
  { id: 'abraham', dur: 3.2, cardAt: 2.4, hold: 3.8, card: 'abraham', fog: 0.8, dd: 900, sx: 0.66,
    keys: [
      [0, -222, 14, -965, -160, 4, -998, 0.85],
      [1, -198, 4, -985, -160, 3, -998, 0.7],
    ] },
  { id: 'russell', dur: 3.2, cardAt: 2.4, hold: 3.8, card: 'russell', fog: 0.8, dd: 900, sx: 0.66,
    keys: [
      [0, 1022, 12, 800, 994, 4, 750, 0.85],
      [1, 1000, 3.5, 776, 994, 3, 750, 0.7],
    ] },
  { id: 'fraser', dur: 8, cardAt: 2.6, hold: 3.4, card: 'gang', moving: true, fog: 0.7, dd: 1100, hide: ['margaret'],
    caption: { fr: 'CHEMIN FRASER', en: 'CHEMIN FRASER' },
    // North up Fraser from Russell's corner, the sun coming up on the right.
    // The rest of the gang gets a card on the move: no freeze, no stop.
    keys: [
      [0, 985, 30, 700, 960, 10, 500, 1.0],
      [0.5, 940, 24, 420, 925, 6, 200, 0.95],
      [1, 903, 9, 196, 922, 3, 146, 0.9],
    ] },
  { id: 'ranger', dur: 3.2, cardAt: 2.6, hold: 3.8, card: 'ranger', fog: 0.85, dd: 800, sx: 0.68, hide: ['margaret'],
    keys: [
      [0, 903, 9, 196, 922, 3, 146, 0.9],
      [1, 905.5, 2.2, 149, 915, 1.1, 142.6, 0.6],
    ] },
  { id: 'margaret', dur: 2.4, cardAt: 2.2, hold: 5, card: 'margaret', fog: 0.85, dd: 800, margaret: true, sx: 0.7,
    keys: [
      [0, 912, 2.6, 151, 926.3, 1.5, 148.5, 0.7],
      [1, 920, 1.6, 144.5, 926.3, 1.4, 148.5, 0.6],
    ] },
  { id: 'phone', dur: 3.0, cardAt: 2.8, hold: 7.6, card: 'dad', fog: 0.85, dd: 800, margaret: true, ring: true,
    says: [[0.4, 'Margaret', 'Tom! Phone! It’s your father.']],
    keys: [
      [0, 920, 1.6, 144.5, 926.3, 1.4, 148.5, 0.6],
      [1, 913, 3.4, 151, 930, 3.6, 146, 0.85],
    ] },
  { id: 'handoff', dur: 5.5, cardAt: 2.2, hold: 2.6, card: 'tom', fog: 0.9, dd: 800, handoff: true, margaret: true,
    // Ends on the chase camera's own pose (main.js fills `end` in at runtime),
    // so the hand-off into play is a continuation, not a cut.
    keys: [
      [0, 907, 5.5, 162, 915, 1.5, 143, 0.9],
      [1, 905, 3.7, 143, 925, 1.2, 141, 1.0],
    ] },
];

export const SHOTS = LONG_SHOTS;

// ---------------------------------------------------------------- B-11: the first launch

// B-11 (Tom, 13 Oct 2026: "fantastic and not repetitive ... like a real game.
// Epic."). One key, then one continuous camera move through Aylmer at dawn,
// the title landing on a music hit over the live lake, and play at 32 s. No
// freeze-frames, no crawl, no menus (design: references/review/design-2026-10-13
// OPENING.md, section 3). The lines are the long film's own, byte for byte:
// nothing is written here that the director's cut does not already say.
//
// A shot in FIRST_SHOTS / QUICK_SHOTS:
//   move    one of skim, rise, run, glide, settle (never two alike in a row)
//   join    true: no cut into this shot (its first key is the last one's end)
//   cards   [[t, id, hold]] moving cards: they slide in and out, the camera
//           never stops; a card may outlive its shot only into a `join` shot
//   says    [[t, who, text, anchor]] spoken lines, readable SAY_HOLD seconds
//   lower   [[t0, t1, key]] narrator lower-thirds (LOWER[key])
//   cues    [[t, cue, arg, bus]] score.js cues, scheduled on the audio clock;
//           'radio' is the radio coming up with the engine (hooks.radioUp)
// Every t is seconds from the start of that shot.

/** How long a spoken line stays readable in the first film, seconds. */
export const SAY_HOLD = 3.5;

/** The narrator's two lower-thirds: cut verbatim from the crawl's second paragraph. */
export const LOWER = {
  l1: { fr: 'Le gaz pis les pièces, c’est Tom qui paie, pis ses chums le remboursent surtout en « merci ».',
    en: 'Tom pays for the gas and the parts, and his friends pay him back mostly in thank-yous.' },
  l2: { fr: 'Objectif : 1 200 $ dans l’enveloppe avant la fête du Travail.',
    en: 'The goal: $1,200 in the envelope by Labour Day.' },
};

/** The first film's clock: 5:36 a.m. on the lake, 6:24 when he turns the key. */
export const FIRST_DAWN = { from: 5.6, to: 6.4 };

const longShot = (id) => LONG_SHOTS.find((s) => s.id === id);
const PHONE_CALL = longShot('phone').says[0];   // [0.4, 'Margaret', 'Tom! Phone! It’s your father.']

export const FIRST_SHOTS = [
  { id: 'coldlake', dur: 4.5, move: 'skim', fog: 0.55, dd: 1500,
    // Low over Lac Deschênes toward the marina lights, the last stars going.
    keys: [
      [0, -2150, 9, 250, -1690, 6, -106, 0.9],
      [1, -2060, 7, 175, -1690, 6, -106, 0.88],
    ],
    cues: [[0.05, 'coldOpen', null, 'music'], [0.5, 'shore', 9, 'fx']] },
  { id: 'title', dur: 5, move: 'rise', join: true, fog: 0.6, dd: 1500,
    caption: longShot('lake').caption,
    // The same move: up and round over the breakwater toward the town. The
    // needle locks on a station at t 0 and the title slams in on that hit.
    keys: [
      [0, -2060, 7, 175, -1690, 6, -106, 0.88],
      [0.5, -1950, 22, 60, -1600, 8, -90, 0.95],
      [1, -1840, 34, -20, -1200, 10, -90, 1.05],
    ],
    cues: [[0, 'sting', null, 'music'], [0.5, 'dawn', 30, 'music']] },
  { id: 'principale', dur: 4.5, move: 'run', fog: 0.7, dd: 1200,
    caption: longShot('principale').caption,
    // Hard cut on the bar line: low and fast down the old strip.
    keys: [
      [0, -1110, 9, -62, -950, 6, -100, 0.85],
      [1, -962, 4.2, -80, -916, 7, -112, 0.85],
    ],
    lower: [[0.7, 4.1, 'l1']] },
  { id: 'fraser', dur: 6, move: 'glide', fog: 0.7, dd: 1100, margaret: true,
    caption: longShot('fraser').caption,
    // Whip-pan onto Chemin Fraser: the long glide north, the sun up on the right.
    keys: [
      [0, 970, 26, 560, 955, 8, 420, 1.0],
      [0.5, 935, 20, 380, 925, 6, 200, 0.95],
      [1, 903, 9, 196, 922, 3, 146, 0.9],
    ],
    lower: [[0.6, 3.6, 'l2']],
    cards: [[3.7, 'ranger', 3.0]],
    cues: [[0.3, 'dawnChorus', 18, 'fx']] },
  { id: 'door', dur: 12, move: 'settle', join: true, handoff: true, fog: 0.85, dd: 800, margaret: true,
    // Down past the truck to the front step, back along the drive, into the
    // chase pose (the last key is replaced at runtime, as the long hand-off).
    keys: [
      [0, 903, 9, 196, 922, 3, 146, 0.9],
      [0.25, 912, 2.6, 151, 926.3, 1.5, 148.5, 0.7],
      [0.55, 913, 3.4, 151, 930, 3.6, 146, 0.85],
      [0.8, 907, 5.5, 162, 915, 1.5, 143, 0.9],
      [1, 905, 3.7, 143, 925, 1.2, 141, 1.0],
    ],
    cards: [[0.9, 'margaret', 3.7], [5.0, 'dad', 6.4]],
    says: [
      [1.4, ...CARDS.margaret.says[0], 'margaret'],
      [3.0, ...CARDS.margaret.says[1], 'margaret'],
      [4.4, PHONE_CALL[1], PHONE_CALL[2], 'margaret'],
      [5.2, ...CARDS.dad.says[0], 'dad'],
      [6.8, ...CARDS.dad.says[1], 'dad'],
      [8.4, ...CARDS.dad.says[2], 'dad'],
    ],
    cues: [[4.0, 'ring', 2, 'fx'], [10.8, 'crank', null, 'fx'], [10.8, 'radio', 3.0, null], [11.6, 'release', 2.2, 'music']] },
];

/**
 * A New Game once the film has been seen: the curtain while the world bakes,
 * then one 3.5 s settle into the chase pose and the starter. No title, no cards.
 */
export const QUICK_SHOTS = [
  { id: 'driveway', dur: 3.5, move: 'settle', handoff: true, fog: 0.9, dd: 800, margaret: true,
    keys: [
      [0, 907, 5.5, 162, 915, 1.5, 143, 0.9],
      [1, 905, 3.7, 143, 925, 1.2, 141, 1.0],
    ],
    cues: [[1.5, 'crank', null, 'fx'], [1.5, 'radio', 3.0, null]] },
];

/**
 * The three films. `first` and `quick` never freeze a frame; `long` is the
 * director's cut (crawl, title and all ten freeze-frame cards). `pre` is how
 * many seconds may play before the world exists (in 2D over the sky).
 */
export const FILMS = {
  first: { id: 'first', shots: FIRST_SHOTS, dawn: FIRST_DAWN, pre: 9.5, freeze: false },
  quick: { id: 'quick', shots: QUICK_SHOTS, dawn: FIRST_DAWN, pre: 0, freeze: false },
  long: { id: 'long', shots: LONG_SHOTS, dawn: DAWN, pre: CRAWL_END, freeze: true },
};

/** Total running time, seconds, if nothing is skipped (the long film counts 2D and the freezes). */
export function runningTime(film = 'long') {
  if (film === 'long') {
    let t = CRAWL_END;
    for (const s of LONG_SHOTS) t += s.dur + (s.card && !s.moving ? s.hold || 0 : 0);
    return t;
  }
  const f = FILMS[film];
  return f ? f.shots.reduce((t, s) => t + s.dur, 0) : 0;
}

/** Where each shot of a film starts, seconds (no freezes: first and quick only). */
export function shotStarts(film) {
  const out = [];
  let t = 0;
  for (const s of FILMS[film].shots) { out.push(t); t += s.dur; }
  return out;
}

/**
 * A film as one timeline, absolute seconds: every card, line, lower-third
 * and cue. Pure, so the smoke checks exactly what the director plays.
 */
export function timeline(film) {
  const starts = shotStarts(film), shots = FILMS[film].shots;
  const cards = [], says = [], lower = [], cues = [];
  shots.forEach((s, i) => {
    const t0 = starts[i];
    for (const [t, id, hold] of s.cards || []) cards.push({ t: t0 + t, end: t0 + t + hold, id, shot: i });
    for (const [t, who, text, anchor] of s.says || []) says.push({ t: t0 + t, end: t0 + t + SAY_HOLD, who, text, anchor, shot: i });
    for (const [a, b, key] of s.lower || []) lower.push({ t: t0 + a, end: t0 + b, key, shot: i });
    for (const [t, cue, arg, bus] of s.cues || []) cues.push({ t: t0 + t, cue, arg, bus, shot: i });
  });
  const by = (a, b) => a.t - b.t;
  return { starts, cards: cards.sort(by), says: says.sort(by), lower: lower.sort(by), cues: cues.sort(by) };
}

// ---------------------------------------------------------------- B-11: cast cards on first appearance

/**
 * The ten name cards, each shown once per machine, the first time its person
 * appears in a job the player starts (the four at 299 Fraser in the first
 * film). A list is a set: the first started job in it fires the card. Built
 * from the speakers in story.js FRIEND_LINES and arc.js ARC_LINES, retired
 * jobs left out (they can never be started); Adam and Tyler are `gang`.
 * `job@end` fires just before that job's end lines instead of at its start;
 * `*` is any job's start. `opening` is the film itself (the director shows
 * those four; castFor never returns a card for it).
 * tools/smoke_opening.mjs proves every speaking job is listed.
 */
export const CAST_FIRST = {
  ranger: ['opening', 'alternateur', '*'],
  margaret: ['opening', 'alternateur', 'margaretdental', 'gang', 'school', 'russellroyal', 'highwayhull', 'curfew', 'arcdernier'],
  dad: ['opening', 'alternateur'],
  tom: ['opening', 'alternateur', 'stvincent'],
  mike: ['sayyad', 'divan', 'nuittim'],
  zahra: ['sayyad', 'solerrand', 'arcbache', 'curfew'],
  sayyad: ['sayyad@end', 'dep', 'racecivic', 'arcbache', 'divan', 'canot', 'golfcart', 'stvincent', 'nuittim',
    'solerrand', 'highwayhull', 'chelsea', 'circuit', 'blitz'],
  russell: ['russellroyal', 'curfew'],
  gang: ['dep', 'gang', 'racedave', 'circuit', 'highwayhull', 'chelsea', 'curfew'],
  abraham: ['gang', 'curfew', 'arcdernier'],
};

/** Who goes first when two are due at once (Mike speaks first in « sayyad »). */
export const CAST_ORDER = ['ranger', 'margaret', 'dad', 'tom', 'mike', 'zahra', 'sayyad', 'russell', 'gang', 'abraham'];

/** At most this many cards at one job start (0.6 s apart); the rest carry over. */
export const CAST_MAX = 2;

/** Speaker name in the line tables -> card id. */
export const SPEAKER_CARD = {
  Margaret: 'margaret', Tom: 'tom', Sayyad: 'sayyad', Zahra: 'zahra', Mike: 'mike', Russell: 'russell',
  Abraham: 'abraham', Adam: 'gang', Tyler: 'gang', 'Ton père': 'dad',
};

/**
 * The cards due when job `jobId` starts (`phase` 'start') or is about to say
 * its end lines ('end'), given the ids already `seen`. Pure; at most CAST_MAX.
 */
export function castFor(jobId, seen = [], phase = 'start') {
  if (!jobId || jobId === 'opening') return [];
  const have = seen instanceof Set ? seen : new Set(seen || []);
  const key = phase === 'end' ? jobId + '@end' : jobId;
  const out = [];
  for (const id of CAST_ORDER) {
    if (have.has(id)) continue;
    const list = CAST_FIRST[id] || [];
    if (list.includes(key) || (phase !== 'end' && list.includes('*'))) out.push(id);
    if (out.length >= CAST_MAX) break;
  }
  return out;
}
// ---------------------------------------------------------------- the math

export const easeInOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// Slower in the middle than smoothstep's cousin: camera moves glide and settle.
export const easeGlide = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.cos(Math.PI * t)) / 2);

function cr(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/**
 * The camera at fraction `t` of a shot: a Catmull-Rom spline through the keys
 * (positions and look targets alike), eased so every move starts and lands
 * soft. Returns { x, y, z, lx, ly, lz, fov } with AGL heights.
 */
export function railAt(keys, t, ease = easeGlide) {
  const k = keys;
  if (!k || !k.length) return null;
  const e = ease(Math.max(0, Math.min(1, t)));
  if (k.length === 1) return toPose(k[0]);
  let i = 0;
  while (i < k.length - 2 && e > k[i + 1][0]) i++;
  const a = k[i], b = k[i + 1];
  const span = b[0] - a[0] || 1;
  const u = Math.max(0, Math.min(1, (e - a[0]) / span));
  const p0 = k[Math.max(0, i - 1)], p3 = k[Math.min(k.length - 1, i + 2)];
  const out = new Array(8);
  for (let n = 1; n < 8; n++) out[n] = cr(p0[n], a[n], b[n], p3[n], u);
  return toPose(out);
}
const toPose = (r) => ({ x: r[1], y: r[2], z: r[3], lx: r[4], ly: r[5], lz: r[6], fov: r[7] });

/** Yaw and pitch for the game camera, which looks along (-sin yaw, sin pitch, -cos yaw). */
export function aim(x, y, z, lx, ly, lz) {
  const dx = lx - x, dy = ly - y, dz = lz - z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/**
 * Where a world point lands on screen, 0..1 from the top-left, or null behind
 * the camera. Same projection as core/gl.js (vertical fov).
 */
export function project(cam, px, py, pz, aspect) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const f = [-sy * cp, sp, -cy * cp];
  const r = [cy, 0, -sy];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d = [px - cam.x, py - cam.y, pz - cam.z];
  const zf = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (zf <= 0.1) return null;
  const th = Math.tan(cam.fov / 2);
  const xs = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / zf / (th * aspect);
  const ys = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / zf / th;
  return { x: 0.5 + xs / 2, y: 0.5 - ys / 2 };
}

/** The hour at 3D seconds `s` of `total` (cards are excluded by the caller). */
export function dawnHour(s, total, dawn = DAWN) {
  const k = total > 0 ? Math.max(0, Math.min(1, s / total)) : 1;
  return dawn.from + (dawn.to - dawn.from) * easeInOut(k);
}
