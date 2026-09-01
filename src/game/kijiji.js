// Kijiji, août 2004. A web page inside a web page.
//
// The lot on chemin d'Aylmer is still there and still sells the same four
// beaters (garage.js FOR_SALE); this is where you find out about them without
// driving over, plus the one thing that is only ever sold this way — a Tempo
// for less than the cheapest car on the gravel. Everything for sale goes
// through Garage.buy(), so the ten-job gate on the bus and the wallet check are
// the same ones the E-prompt at the lot uses. Nothing here can hand you a car
// the garage would not.
//
// The look is deliberate: Verdana, a table, blue underlined links, a hit
// counter, and photographs taken at night with a flash by somebody holding the
// camera in one hand and a beer in the other.
import { CARS, carById } from './cars.js';
import { UNLOCKS } from './garage.js';
// Side effect, and the reason it is a named import: famouscars.js is what puts
// the Tempo into CARS and its price into UNLOCKS, and the ad below would have
// nothing to sell without it.
import { TEMPO } from './famouscars.js';

const ID = 'kijiji';
const STYLE_ID = 'kijiji-css';
// Dial-up. The first connection of the session takes as long as it took.
const CONNECT_MS = 1400;
let connected = false;

// ---------------------------------------------------------------- the ads

// The five ads that are actually attached to a car this game can build. `car`
// is a CARS id, and `flaw` is what is wrong with it — see the inspection below,
// which is the whole reason the flaw is written down instead of hidden.
//
// Everything else on the page comes out of assets/text/kijiji.json: forty ads
// for cars the game has no model for. Those are phantoms, and being unable to
// buy them is not a limitation, it is the joke — in 2004 half the ads in the
// paper were for a car that was gone, or a number that rang forever.
export const ADS = [
  {
    car: 'tempo', seller: 'Ghyslain', where: 'Aylmer (secteur Wychwood)',
    posted: 'le 11 août 2004', calls: 4,
    flaw: { text: 'Plancher mou côté conducteur, rebouché avec un tapis. Rouille perforante commencée.', damage: 18 },
    title: 'FORD TEMPO 1991 GL — BON POUR ETUDIANT',
    body: 'TEMPO 91 AUTOMATIQUE. 214 000 KM. LA PORTE DU PASSAGER EST GRISE PIS LE '
      + 'RESTE EST BLEU, C\'EST PAS GRAVE CA ROULE. VIENT DE PASSER SUR LE BANC D\'ESSAI. '
      + 'PNEUS NEUFS EN AVANT. LE CHAUFFAGE MARCHE JUSTE AU BOUTTE MAIS ON EST EN AOUT.\n'
      + 'PAS DE LOWBALLER. JE SAIS CE QUE J\'AI.\nSERIEUX SEULEMENT.',
  },
  {
    car: 'caravan', seller: 'Denise', where: 'Aylmer (Vieux-Aylmer)',
    posted: 'le 9 août 2004', calls: 2,
    flaw: { text: 'Essieu arrière ressoudé à la chandelle. Ça tient. Pour astheure.', damage: 14 },
    title: 'DODGE CARAVAN 1988 — 7 PLACES — PARFAIT DEMENAGEMENT',
    body: 'CARAVAN 88. LES DEUX PORTES COULISSANTES MARCHENT. LES BANCS D\'EN ARRIERE '
      + 'SORTENT (SONT DANS LE GARAGE). SENT UN PEU LE CHIEN MAIS UN ARBRE MAGIQUE PIS '
      + 'C\'EST REGLE.\nAUCUN ECHANGE. ARGENT COMPTANT.',
  },
  {
    // « Les Chars à Ti-Guy » is the plywood sign over PLACES.usedlot. The four
    // beaters on that gravel are his, and this is how you hear about them
    // without driving out to chemin d'Aylmer.
    car: 'cutlass', seller: 'Ti-Guy (Les Chars à Ti-Guy)', where: 'Aylmer (lot, chemin d’Aylmer)',
    posted: 'le 2 août 2004', calls: 5,
    flaw: { text: 'Rouille perforante aux deux ailes arrière, rebouchée à la pâte pis peinturée par-dessus.', damage: 22 },
    title: 'OLDSMOBILE CUTLASS CIERA 1987 BRUN — MOTEUR BON',
    body: 'CIERA 87. BRUN. BANQUETTE EN AVANT. CENDRIER PLEIN, JE LE VIDERAI PAS C\'EST '
      + 'PAS DANS LE PRIX. LA SUSPENSION EST MOLLE MAIS C\'EST DE MEME QUE C\'EST FAIT.\n'
      + 'PREMIER ARRIVE PREMIER SERVI. PAS DE NEGO.\nJE REPONDS PAS AUX COURRIELS.',
  },
  {
    car: 'cavalier', seller: 'Ti-Guy (Les Chars à Ti-Guy)', where: 'Aylmer (lot, chemin d\'Aylmer)',
    posted: 'le 13 août 2004', calls: 3,
    flaw: { text: 'Silencieux troué. Les deux 12 pouces cachent un plancher de valise pourri jusqu’au pneu de secours.', damage: 26 },
    title: 'CAVALIER Z24 1991 V6 SPOILER — TRES PROPRE!!!!',
    body: 'Z24!!! LE V6 3.1 PAS LE 4 CYLINDRES. SPOILER D\'ORIGINE. SYSTEME DE SON '
      + 'INSTALLE PAR MOI-MEME (2 12 POUCES DANS LE COFFRE, INCLUS).\n'
      + 'CA RATTLE EN DESSOUS DE 60 PIS CA RATTLE EN HAUT DE 60, C\'EST NORMAL SUR CES '
      + 'CHARS LA.\nNEGO UN PEU. SERIEUX SEULEMENT. PAS DE TIRE-KICKER.',
  },
  {
    car: 'bus', seller: 'Transport urbain (liquidation)', where: 'Gatineau (garage municipal)',
    posted: 'le 28 juillet 2004', calls: 6,
    flaw: { text: 'Fuite d’air au frein arrière gauche pis ça fume bleu à froid. C’est un autobus de ville de 1979.', damage: 30 },
    title: 'AUTOBUS ORION I — HORS SERVICE — VENDU TEL QUEL',
    body: 'ANCIEN AUTOBUS DE VILLE. 40 PLACES. LE DIESEL PART. LA PANCARTE DIT HORS '
      + 'SERVICE PIS ON CHANGERA PAS CA.\nVOUS VENEZ LE CHERCHER. ON LE LIVRE PAS.\n'
      + 'PASSE PAS SUR BANCROFT, LE VIADUC EST TROP BAS. VOUS ETES AVERTIS.\n'
      + 'APPELEZ APRES 18H. PAS DE MESSAGE DANS LA BOITE VOCALE.',
  },
  // ---- not for sale to you, and that is the joke ------------------------
  {
    seller: 'Marie-Josée', where: 'Aylmer (Promenade Wychwood)', posted: 'le 12 août 2004',
    calls: 1, priceText: 'Gratuit', look: { body: 0x7a5c34, len: 2.1, h: 0.9, style: 'thing' },
    title: 'DIVAN 3 PLACES BRUN — GRATUIT',
    body: 'DIVAN BRUN. PROPRE. FAUT LE MONTER TOI-MEME, 2E ETAGE, PAS D\'ASCENSEUR.\n'
      + 'IL EST LOURD. JE LE REPETE: IL EST LOURD.',
    footer: 'Tu connais déjà ce divan-là.',
  },
  {
    seller: 'Sayyad', where: 'Aylmer (Denise-Friend)', posted: 'le 14 août 2004', calls: 0,
    priceText: 'Recherché', look: { body: 0xb8bcc0, len: 1.2, h: 0.7, style: 'thing' },
    title: 'RECHERCHÉ: JANTES 4x100 15 POUCES',
    body: 'CHERCHE 4 JANTES 4x100 EN 15. PAS DE ROUILLE. PAYE COMPTANT.\n'
      + 'PAS DE JANTES DE CIVIC 4x114, J\'AI DEJA VERIFIE, MERCI.',
    footer: 'C’est ton chum. Il t’a pas dit qu’il cherchait ça.',
  },
  {
    seller: 'Réjean', where: 'Aylmer (Frank-Robinson)', posted: 'le 3 août 2004', calls: 9,
    priceText: '40 $', look: { body: 0x1a1c1e, len: 1.6, h: 1.1, style: 'thing' },
    title: 'PNEUS D\'HIVER 185/70R14 x4 — 40$',
    body: 'QUATRE PNEUS D\'HIVER. PAS DE JANTES. RESTE DE LA GOMME CORRECT.\n'
      + 'ON EST EN AOUT JE SAIS. C\'EST POUR CA QU\'ILS SONT A 40.',
    footer: 'Le mécanicien vend les siens neufs. Ceux-là ont fait dix hivers.',
  },
  {
    seller: 'Patrick', where: 'Gatineau (Hull)', posted: 'le 1er août 2004', calls: 12,
    sold: true, look: { body: 0x9a9384, len: 1.0, h: 0.5, style: 'thing' },
    title: 'NINTENDO 64 + 3 JEUX — 60$',
    body: 'N64 AVEC MARIO KART, GOLDENEYE PIS UN AUTRE. MANETTE GRISE UN PEU MOLLE.\n'
      + 'PREMIER ARRIVE PREMIER SERVI.',
    footer: 'Quelqu’un a été plus vite que toi. En 2004 ça se passait de même.',
  },
];

// ---------------------------------------------------------------- phantoms

// assets/text/kijiji.json is forty real-shaped 2004 Outaouais ads for cars this
// game has no model for. They are what makes the page look like a classifieds
// section instead of a shop window, and the fact that you can never buy one is
// period-correct: half the ads in the paper were for a car already gone.
export const LISTINGS_URL = 'assets/text/kijiji.json';
// The file's prices are honest 2004 asking prices ($400-$4500). This game's
// whole economy is one notch below that — you start with $80 and a job pays
// $15-75 — so they are scaled onto the same curve the lot already sits on, with
// a floor that keeps the $180 Tempo the cheapest whole car on the page.
export const PHANTOM_SCALE = 0.4;
export const PHANTOM_MIN = 200;
export const phantomPrice = (p) => Math.max(PHANTOM_MIN, Math.round((p * PHANTOM_SCALE) / 5) * 5);

// Some of these are ads for a car that IS in the game and is not for sale at any
// price. Saying so is better than pretending the coincidence is not there.
const ECHO = [
  [/FIREBIRD TRANS AM/, 'Y en a un en ville, un vrai. Il est pas à vendre, celui-là.'],
  [/EX AUTO DE POLICE/, 'La Ville a vendu la sienne à l’encan. Pas celle-là.'],
  [/FORD RANGER .* POUR PIECES/, 'C’est le tien, en morceaux, dans la cour de quelqu’un d’autre.'],
  [/SATURN SL2/, 'Margaret a la même en SL. Elle la vendra jamais.'],
  [/OLDSMOBILE CUTLASS SUPREME/, 'Pas la même que celle du lot. Celle-là a un V8.'],
];

// Sellers write the colour in the title, in capitals, every time. When they do
// not, the car gets one off the 1988 dealer chart at random-but-deterministic.
const COLOURS = [
  [/\bROUGES?\b/, 0xa8322b], [/\bBLEUE?\b/, 0x2f5fa8], [/\bNOIRE?\b/, 0x1b1c1f],
  [/\bBLANCH?E?\b/, 0xe4e2d8], [/\bVERTE?\b/, 0x2f6b3a], [/\bGRISE?\b/, 0x8a8f94],
  [/\bBRUN|\bTAN\b/, 0x7a5c34], [/TURQUOISE/, 0x1c8f83], [/BOURGOGNE|\bVIN\b/, 0x5d1b22],
  [/ARGENT|SILVER/, 0xb8bcc0], [/\bOR\b|DOR[ÉE]/, 0xc8a03c], [/JAUNE/, 0xd8b83a],
  [/CHAMPAGNE|BEIGE/, 0xcfc4a8],
];
const SHAPES = [
  [/VOYAGER|CARAVAN|WINDSTAR|LUMINA APV|MINIVAN/i, { len: 4.6, h: 1.72, style: 'van' }],
  [/RANGER|S10|BRONCO|CHEROKEE|TRACKER|SIDEKICK|4X4/i, { len: 4.4, h: 1.74, style: 'truck' }],
  [/CAPRICE|LESABRE|CUTLASS SUPREME|CROWN|INTREPID/i, { len: 5.15, h: 1.42, style: 'sedan' }],
  [/FIREBIRD|MUSTANG|TALON|INTEGRA|ESCORT GT|PROTEGE GT/i, { len: 4.75, h: 1.30, style: 'coupe' }],
  [/WAGON|LEGACY/i, { len: 4.55, h: 1.48, style: 'sedan' }],
];
function phantomLook(l) {
  const text = ((l.title || '') + ' ' + (l.body || '')).toUpperCase();
  const hit = COLOURS.find(([re]) => re.test(text));
  const shape = (SHAPES.find(([re]) => re.test(l.title || '')) || [null, { len: 4.3, h: 1.36, style: 'sedan' }])[1];
  const fallback = [0xc9c3b4, 0x6b5334, 0x2f5fa8, 0x8a8f94, 0xa8322b, 0xe4e2d8][(l.year || 1990) % 6];
  return { body: hit ? hit[1] : fallback, ...shape };
}

/** One JSON row into the shape the page draws. Never buyable, always spoken for. */
export function phantomAd(l) {
  const echo = ECHO.find(([re]) => re.test(l.title || ''));
  return {
    car: null, phantom: true,
    title: l.title,
    look: phantomLook(l),
    body: String(l.body || '').replace(/(.{58,74}\s)/g, '$1\n'),
    price: phantomPrice(Number(l.price) || 0),
    seller: l.seller, phone: l.phone,
    where: (l.km ? l.km.toLocaleString('fr-CA') + ' km' : '') + ' · Outaouais',
    posted: 'en août 2004',
    calls: 3,
    redFlag: l.redFlag || '',
    footer: echo ? echo[1] : '',
  };
}

/** The five local ads plus every phantom in `json`. Pure, so node can test it. */
export function mergeListings(json) {
  const rows = json && Array.isArray(json.listings) ? json.listings : [];
  return ADS.concat(rows.map(phantomAd));
}

// Everything the page draws. Starts as the five hardcoded ads so the screen
// still works with the file missing, and grows once the fetch lands.
let ALL = ADS;
let loading = null;
export function loadListings(fetchFn) {
  if (loading) return loading;
  const f = fetchFn || (typeof fetch === 'function' ? fetch : null);
  if (!f) return Promise.resolve(ALL);
  loading = f(LISTINGS_URL, { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j) ALL = mergeListings(j); return ALL; })
    .catch(() => ALL);
  return loading;
}

// ---------------------------------------------------------------- the garage's opinion

// What a pre-purchase inspection costs, and what pointing at the rot is worth
// when you go back to the seller. On a $180 Tempo the rebate barely covers the
// inspection; on the $1500 bus it is most of a used car. That gradient is the
// decision — and early on, with eighty dollars in your pocket, you genuinely
// cannot afford both the inspection and the car.
export const INSPECT_PRICE = 25;
export const REBATE = 0.15;
export const rebateOn = (cost) => Math.round((cost * REBATE) / 5) * 5;
const inspected = new Set();
const called = new Set();
export const wasInspected = (ad) => inspected.has(ad && ad.title);
export const wasCalled = (ad) => called.has(ad && ad.title);

/**
 * What you would actually hand over: the asking price, less whatever the
 * inspection let you argue for and whatever he knocked off on the phone. Capped
 * at DEAL_CAP, because a car half off twice over is not a bargain, it is a bug.
 */
export function dealtPrice(ad, cost) {
  if (!ad || !ad.car || !(cost > 0)) return cost;
  let off = 0;
  if (inspected.has(ad.title)) off += rebateOn(cost);
  if (called.has(ad.title)) off += dealOn(callerFor(ad), cost);
  return Math.max(Math.round(cost * (1 - DEAL_CAP) / 5) * 5, cost - off);
}

// ---------------------------------------------------------------- the phone
//
// Thirty sellers live in assets/text/calls.json, each with an opening, a middle
// and an English stage direction for how the call ends. The two French lines
// are spoken verbatim; the stage direction is what this table turns into
// something the game can DO, because the point of picking up the phone is that
// it changes the price — or wastes your afternoon, which was the other half of
// buying a car in 2004.
//
//   'ferme'      he will not move, and says so
//   'jase'       twenty minutes of somebody else's summer, no sale
//   'repondeur'  a machine, a dog, and a call back four days too late
//   'absent'     he will not give you an address
//   'vendu'      gone, and the ad is still up
//   'menteur'    he lies out loud — and the lie is free to check, because the
//                red flag is on the table the moment he says it
//   'deal'       `cut` off the asking price, offered before you ask
export const CALLS_URL = 'assets/text/calls.json';
export const DEAL_CAP = 0.5;   // no car is ever half off twice over

const CALL_KIND = {
  'Won\'t come down a dollar': { kind: 'ferme' },
  'Mother selling her son\'s car while he\'s away': { kind: 'deal', cut: 0.45 },
  'Already sold it but wants to talk': { kind: 'jase' },
  'Answering machine, large dog': { kind: 'repondeur' },
  'It\'s my buddy\'s car actually': { kind: 'jase' },
  'Suspicious elderly farmer': { kind: 'absent' },
  'Hyperactive teenager who tuned it himself': { kind: 'menteur' },
  'Weary dad clearing out the garage': { kind: 'deal', cut: 0.25 },
  'Mechanic selling an abandoned repair': { kind: 'deal', cut: 0.20 },
  'Anglophone seller across the river': { kind: 'absent' },
  'Public parking lot only': { kind: 'ferme' },
  'Student moving tomorrow': { kind: 'deal', cut: 0.35 },
  'Treats the car as a firstborn': { kind: 'ferme' },
  'Doesn\'t know what he has': { kind: 'deal', cut: 0.40 },
  'Chain-smoking uncle as middleman': { kind: 'jase' },
  'School rival on his parents\' landline': { kind: 'ferme' },
  'Painfully honest': { kind: 'menteur' },        // he tells you everything, which amounts to the same reveal
  'Answering machine, screaming children': { kind: 'repondeur' },
  'Unbearable line noise': { kind: 'repondeur' },
  'Trades only': { kind: 'absent' },
  'Grandmother selling her late husband\'s sedan': { kind: 'deal', cut: 0.20 },
  'Night calls only': { kind: 'absent' },
  'Forgot he posted the ad': { kind: 'deal', cut: 0.15 },
  'Encyclopedic about trim packages': { kind: 'jase' },
  'Practically brand new': { kind: 'menteur' },
  'Lost his licence': { kind: 'deal', cut: 0.20 },
  'Upsells you the rest of his yard': { kind: 'jase' },
  'Polite civil servant': { kind: 'ferme' },
  'Bring your own battery': { kind: 'menteur' },
  'Crying about letting it go': { kind: 'deal', cut: 0.10 },
};

// How each kind reads in French once the receiver goes down. The `deal` line is
// built with the number, because the number is the whole point.
const CALL_END = {
  ferme: 'Il raccroche. « Le prix c’est le prix. »',
  jase: 'Vingt minutes plus tard tu sais tout de son été en Gaspésie. Pas le prix.',
  repondeur: 'Répondeur. Tu laisses ton numéro. Il va rappeler dans quatre jours, en pleine course, pour dire « vendu ».',
  absent: 'Il veut pas donner son adresse tant qu’il sait pas pour qui tu travailles.',
  vendu: 'Vendu depuis mardi. L’annonce est encore là pareil.',
  menteur: 'Il t’a tout dit. C’est pas ce qu’il pense t’avoir dit.',
};

// The five hardcoded ads keep a seller each; everything else is assigned one
// deterministically off its own title, so the guy who will not budge is the
// same guy every time you ring him.
const CALL_BY_TITLE = [
  [/TERCEL/, 'Mechanic selling an abandoned repair'],      // Garage Lafleur's lien sale
  [/FORD TEMPO 1991/, 'Won\'t come down a dollar'],
  [/CARAVAN 1988/, 'Mother selling her son\'s car while he\'s away'],
  [/CUTLASS CIERA 1987/, 'Upsells you the rest of his yard'],
  [/CAVALIER Z24 1991/, 'Hyperactive teenager who tuned it himself'],
  [/AUTOBUS ORION/, 'Polite civil servant'],
  [/SUBARU|AWD|4X4/, 'Doesn\'t know what he has'],
  [/DIVAN/, 'Weary dad clearing out the garage'],
];

export const CALLS = { list: [], byType: {} };
let callsLoading = null;
export function loadCalls(fetchFn) {
  if (callsLoading) return callsLoading;
  const f = fetchFn || (typeof fetch === 'function' ? fetch : null);
  if (!f) return Promise.resolve(CALLS);
  callsLoading = f(CALLS_URL, { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const rows = j && Array.isArray(j.calls) ? j.calls : [];
      const fix = (t) => String(t || '').replace(/'/g, '\u2019');
      CALLS.list = rows.map((c) => ({
        sellerType: c.sellerType,
        opening: fix(c.opening),
        middle: fix(c.middle),
        ...(CALL_KIND[c.sellerType] || { kind: 'jase' }),
      }));
      CALLS.byType = Object.fromEntries(CALLS.list.map((c) => [c.sellerType, c]));
      return CALLS;
    })
    .catch(() => CALLS);
  return callsLoading;
}

/** Which of the thirty sellers is on the other end of this ad. */
export function callerFor(ad) {
  if (!CALLS.list.length) return null;
  const bound = CALL_BY_TITLE.find(([re]) => re.test(ad.title || ''));
  if (bound && CALLS.byType[bound[1]]) return CALLS.byType[bound[1]];
  let seed = 0;
  for (let i = 0; i < ad.title.length; i++) seed = (seed * 33 + ad.title.charCodeAt(i)) >>> 0;
  return CALLS.list[seed % CALLS.list.length];
}

/** What he knocks off, in dollars, or 0. Rounded to a bill he would actually count. */
export function dealOn(caller, cost) {
  if (!caller || caller.kind !== 'deal' || !(cost > 0)) return 0;
  return Math.round((cost * caller.cut) / 5) * 5;
}

// ---------------------------------------------------------------- the photos

// A 2004 point-and-shoot in the hands of somebody who is not selling a car for
// a living: 64x48 of driveway, the flash doing most of the work, the camera not
// level, and the orange date stamp burned into the corner because nobody ever
// turned that off. Scaled up with the smoothing off, which is what a 41 ko JPEG
// of a 640x480 looked like.
function shoot(canvas, ad, w = 132, h = 99) {
  // A real spec if the game has one, the ad's own guess at one if it does not,
  // and a cardboard box on a driveway for a couch.
  const spec = ad.car ? carById(ad.car) : (ad.look && ad.look.style !== 'thing' ? ad.look : null);
  const SW = 64, SH = 48;
  const off = document.createElement('canvas');
  off.width = SW; off.height = SH;
  const c = off.getContext('2d');
  if (!c) return;
  // Deterministic per ad, so the photo does not reshuffle every time you scroll.
  let seed = 0;
  for (let i = 0; i < ad.title.length; i++) seed = (seed * 31 + ad.title.charCodeAt(i)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const night = rnd() < 0.45;

  // sky / garage wall, a hedge or a fence, then the driveway
  const horizon = SH * (0.36 + rnd() * 0.10);
  c.fillStyle = night ? '#10141a' : '#9fb0c2';
  c.fillRect(0, 0, SW, horizon);
  c.fillStyle = night ? '#0b1510' : '#4d6a44';
  c.fillRect(0, horizon - 4, SW, 6);
  c.fillStyle = night ? '#1a1f25' : '#7d8188';
  c.fillRect(0, horizon + 2, SW, SH - horizon);
  // The neighbour's siding, off to one side.
  c.fillStyle = night ? '#191c1f' : '#c3bfae';
  c.fillRect(rnd() < 0.5 ? 0 : SW - 14, horizon - 14, 14, 16);

  if (spec) {
    const hex = '#' + spec.body.toString(16).padStart(6, '0');
    const bw = Math.round(SW * (0.30 + 0.34 * (spec.len / 5.4)));
    const bh = Math.round(SH * 0.13 * (spec.h / 1.4) + 4);
    const bx = Math.round((SW - bw) / 2 + (rnd() - 0.5) * 8);
    const by = Math.round(horizon + 5 + (rnd() - 0.5) * 4);
    const gh = Math.round(bh * (spec.style === 'bus' || spec.style === 'van' ? 1.1 : 0.75));
    // greenhouse first, so the body sits in front of it
    c.fillStyle = night ? '#20262c' : '#3d454e';
    c.fillRect(bx + bw * 0.22, by - gh, bw * 0.56, gh + 1);
    c.fillStyle = night ? '#39434d' : '#8ea2b4';
    c.fillRect(bx + bw * 0.26, by - gh + 1, bw * 0.48, gh - 2);   // glass
    c.fillStyle = hex;
    c.fillRect(bx, by, bw, bh);
    c.fillRect(bx + bw * 0.20, by - 2, bw * 0.60, 3);             // roof edge
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(bx, by + bh - 1, bw, 2);                            // rocker shadow
    c.fillStyle = '#0c0e10';
    c.fillRect(bx + bw * 0.11, by + bh, Math.max(2, bw * 0.15), 3);
    c.fillRect(bx + bw * 0.74, by + bh, Math.max(2, bw * 0.15), 3);
    if (night) {                                                   // the flash
      const g2 = c.createRadialGradient(bx + bw * 0.5, by, 1, bx + bw * 0.5, by, bw * 0.75);
      g2.addColorStop(0, 'rgba(255,252,235,0.62)');
      g2.addColorStop(1, 'rgba(255,252,235,0)');
      c.fillStyle = g2;
      c.fillRect(0, 0, SW, SH);
    }
  } else {
    c.fillStyle = night ? '#3a2f22' : '#7a6144';                   // a couch, a box of tyres
    c.fillRect(SW * 0.24, horizon - 2, SW * 0.52, SH * 0.30);
    c.fillStyle = night ? '#4a3d2c' : '#8f7351';
    c.fillRect(SW * 0.24, horizon - 8, SW * 0.52, 7);
  }

  // Grain. A 2 megapixel sensor at ISO 400 in a garage.
  const im = c.getImageData(0, 0, SW, SH);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * (night ? 46 : 22);
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 1.2;
  }
  c.putImageData(im, 0, 0);

  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.imageSmoothingEnabled = false;
  // Nobody held the camera straight.
  const tilt = (rnd() - 0.5) * 0.09;
  g.save();
  g.translate(w / 2, h / 2);
  g.rotate(tilt);
  g.scale(1.10, 1.10);
  g.drawImage(off, -w / 2, -h / 2, w, h);
  g.restore();
  // A thumb over the corner of the lens. It happens.
  if (rnd() < 0.45) {
    g.fillStyle = night ? 'rgba(72,44,38,0.95)' : 'rgba(196,154,134,0.95)';
    g.beginPath();
    g.ellipse(rnd() < 0.5 ? 0 : w, h, w * 0.20, h * 0.22, 0, 0, 7);
    g.fill();
  }
  // The date stamp. Always on, always wrong by a year, always orange.
  g.fillStyle = '#ff8c1a';
  g.font = `700 ${Math.max(8, Math.round(h * 0.10))}px "Courier New",monospace`;
  g.textAlign = 'right';
  g.fillText('2004 08 ' + String(4 + (ad.title.length % 24)).padStart(2, '0'), w - 4, h - 5);
}

// ---------------------------------------------------------------- the page

const CSS = `
#kijiji{position:fixed;inset:0;z-index:60;background:#fff;color:#000;overflow:auto;
  font:12px/1.5 Verdana,Geneva,Arial,sans-serif}
#kijiji *{box-sizing:border-box}
#kijiji .wrap{max-width:812px;margin:0 auto;padding:0 8px 40px}
#kijiji .bar{background:#4b0f6e;color:#fff;padding:6px 10px;display:flex;align-items:baseline;gap:10px}
/* The italic Georgia 'j' overhangs its own box, so the logo gets a width of its
   own rather than padding the strapline away from it. */
#kijiji .bar b{font:italic 700 24px/1 Georgia,serif;color:#ffd94a;flex:0 0 96px}
#kijiji .bar span{font-size:11px;opacity:.9}
#kijiji .bar .x{margin-left:auto}
#kijiji .strip{background:#0f8a8a;color:#fff;padding:3px 10px;font-size:11px}
#kijiji .crumb{padding:8px 2px;font-size:11px;color:#333}
#kijiji a{color:#0000cc;text-decoration:underline;cursor:pointer}
#kijiji a:visited{color:#551a8b}
#kijiji .search{border:1px solid #999;background:#eee;padding:6px 8px;margin:4px 0 10px;display:flex;gap:6px;align-items:center}
#kijiji .search input{border:1px solid #7f7f7f;padding:3px;font:12px Verdana,Arial,sans-serif;width:220px}
#kijiji .search button,#kijiji button{font:11px Verdana,Arial,sans-serif;padding:3px 8px;border:2px outset #ddd;background:#ddd;cursor:pointer}
#kijiji button:active{border-style:inset}
#kijiji table{border-collapse:collapse;width:100%}
#kijiji td{border-bottom:1px solid #ccc;padding:8px 6px;vertical-align:top}
#kijiji tr:nth-child(even) td{background:#f4f4f8}
#kijiji canvas{border:1px solid #666;display:block;background:#000}
#kijiji .t{font-size:13px;font-weight:700}
#kijiji .price{color:#c00;font-weight:700;white-space:nowrap;font-size:14px}
#kijiji .meta{color:#555;font-size:10px}
#kijiji .snip{color:#222;font-size:11px;margin-top:3px}
#kijiji .sold{color:#888;text-decoration:line-through}
#kijiji .flag{background:#ffffcc;border:1px solid #e0d000;padding:6px 8px;margin:8px 0;font-size:11px}
#kijiji .desc{white-space:pre-wrap;font-family:"Courier New",monospace;font-size:12.5px;
  background:#fbfbf4;border:1px solid #ddd;padding:10px;margin:10px 0}
#kijiji .detail{display:flex;gap:14px;align-items:flex-start}
#kijiji .detail canvas{width:330px;height:248px}
#kijiji .buyrow{display:flex;gap:10px;align-items:center;margin:10px 0}
#kijiji .buyrow button{font:700 13px Verdana,Arial,sans-serif;padding:6px 14px}
#kijiji .no{color:#a00;font-size:11px}
#kijiji .foot{margin-top:18px;border-top:1px solid #ccc;padding-top:8px;color:#666;font-size:10px;
  display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
#kijiji .hits{font-family:"Courier New",monospace;background:#000;color:#0f0;padding:1px 4px;letter-spacing:2px}
#kijiji .modem{padding:60px 20px;text-align:center;font-family:"Courier New",monospace;font-size:13px;color:#333}
#kijiji .modem b{display:block;font-size:18px;margin-bottom:10px}
#kijiji .note{font-size:11px;color:#444;font-style:italic;margin-top:6px}
`;

let root = null, ctx = null, screen = 'list', current = null, callsMade = 0;

function el() {
  if (root) return root;
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  root = document.createElement('div');
  root.id = ID;
  root.className = 'hidden';
  root.style.display = 'none';
  document.body.appendChild(root);
  return root;
}

const money = (n) => Math.round(n).toLocaleString('fr-CA') + ' $';

// The ads that are still worth showing: a car you already own has been sold.
// `priceOf` is the one place a number on this page comes from, so a buyable ad
// can never disagree with what Garage.buy() is about to charge.
function visible(garage) {
  return ALL.filter((a) => !(a.car && garage.has(a.car)));
}
function priceOf(ad) {
  if (ad.car) return UNLOCKS[ad.car] ? UNLOCKS[ad.car].cost : 0;
  return ad.price != null ? ad.price : null;
}
// What goes in the red column: the asking price, or whatever the ad says instead.
function priceLabel(ad) {
  if (ad.sold) return '<span class="sold">vendu</span>';
  if (ad.priceText) return ad.priceText;
  const c = priceOf(ad);
  return c != null ? money(c) : '&mdash;';
}

function listHTML(garage) {
  const list = visible(garage);
  const rows = list.map((a, i) => {
    const price = priceLabel(a);
    const snip = a.body.split('\n')[0].slice(0, 96) + '…';
    return `<tr><td style="width:146px"><canvas data-shot="${i}"></canvas></td>`
      + `<td><a class="t" data-ad="${i}">${a.title}</a>`
      + `<div class="meta">${a.where} &middot; ${a.posted} &middot; ${a.seller}</div>`
      + `<div class="snip">${snip}</div></td>`
      + `<td style="width:96px;text-align:right" class="price">${price}</td></tr>`;
  }).join('');
  return `
  <div class="crumb"><a data-nav="list">Accueil</a> &gt; Autos et véhicules &gt;
    <b>Autos d’occasion — Gatineau / Outaouais</b> &mdash; ${list.length} annonces</div>
  <div class="search">
    <span>Rechercher&nbsp;:</span><input id="kjq" value="char pas cher aylmer">
    <button data-act="search">Rechercher</button>
    <span id="kjerr" class="no"></span>
  </div>
  <div class="flag"><b>Avis :</b> Kijiji n’est pas responsable des annonces. Rencontrez le
    vendeur dans un endroit public. Ne donnez jamais votre NIP. Le stationnement du
    Tim Hortons de la Principale, c’est correct.<br>
    <b>Conseil du mois :</b> fais inspecter avant d’acheter. ${INSPECT_PRICE} $ au garage, pis
    tu sais quoi dire au vendeur.</div>
  <table>${rows}</table>`;
}

function detailHTML(ad, garage, wallet, done) {
  const cost = priceOf(ad);
  const spec = ad.car ? carById(ad.car) : null;
  const seen = wasInspected(ad);
  const rang = wasCalled(ad);
  const pay = ad.car ? dealtPrice(ad, cost) : cost;
  const off = cost - pay;
  const can = ad.car ? garage.canBuy(ad.car, wallet, done, off) : null;
  const caller = callerFor(ad);
  const buy = ad.car
    ? `<div class="buyrow"><button data-act="buy">ACHETER &mdash; ${money(pay)}</button>`
      + (can.ok
        ? `<span class="meta">Il te rejoint au Tim Hortons de la Principale.${off
            ? ` Il a coupé ${money(off)}.` : ''}</span>`
        : `<span class="no">${can.why}</span>`) + '</div>'
    : `<div class="buyrow"><button disabled>PAS À VENDRE</button>`
      + `<span class="meta">${ad.sold ? 'L’annonce est encore là, l’affaire est partie.'
        : ad.phantom ? 'Le vendeur répond pas. Il a jamais répondu.' : 'C’est pas un char.'}</span></div>`;
  // The inspection. On a buyable car it is a real $25 decision; on a phantom
  // there is nothing to put on the hoist, and the only way to find out what is
  // wrong with it is the same way anybody found out in 2004 — somebody knows.
  const inspect = ad.car
    ? `<div class="buyrow"><button data-act="inspect" ${seen ? 'disabled' : ''}>
         ${seen ? 'INSPECTÉ' : 'FAIRE INSPECTER — ' + money(INSPECT_PRICE)}</button>
       <span class="meta">Le mécanicien le met sur le pont avant que tu signes.</span></div>`
    : '';
  // The inspection report, and the free half of it: a seller who lied on the
  // phone has already told you where to look.
  const known = (seen || (rang && caller && caller.kind === 'menteur')) && ad.flaw;
  const report = known
    ? `<div class="flag" id="kjrep"><b>${seen ? 'Rapport d’inspection' : 'Ce qu’il t’a échappé au téléphone'} :</b> ${ad.flaw.text}</div>`
    : '<div id="kjrep"></div>';
  return `
  <div class="crumb"><a data-nav="list">&larr; Retour aux annonces</a></div>
  <h2 style="font:700 17px Verdana,Arial,sans-serif;margin:6px 0">${ad.title}</h2>
  <div class="meta">${ad.where} &middot; publié ${ad.posted} &middot; ${ad.seller}
    &middot; annonce n&deg; ${100000 + ad.title.length * 137}</div>
  <div class="detail" style="margin-top:10px">
    <div><canvas data-shot="big"></canvas>
      <div class="meta" style="margin-top:4px">1 photo &middot; 640x480 &middot; 41 ko</div></div>
    <div style="flex:1">
      <div class="price" style="font-size:22px">${ad.car
        ? (off ? `<span class="sold">${money(cost)}</span> ` : '') + money(pay)
        : priceLabel(ad).toUpperCase()}</div>
      ${spec ? `<div class="meta" style="margin-top:6px">${spec.len} m &middot; ${spec.seats + 1} places
        &middot; ${spec.mass} kg</div>` : ''}
      <div class="desc">${ad.body}</div>
      ${report}
      ${buy}
      ${inspect}
      <div class="buyrow"><button data-act="call">Appeler le vendeur</button>
        <span class="meta" id="kjphone">${ad.phone || '(819) 555-' + String(1000 + ad.title.length * 7).slice(0, 4)}</span></div>
      <div class="note" id="kjnote">${ad.footer || ''}</div>
    </div>
  </div>`;
}

function paint() {
  const { garage, wallet, done } = ctx;
  const body = screen === 'list' ? listHTML(garage) : detailHTML(current, garage, wallet, done);
  root.innerHTML = `
  <div class="bar"><b>kijiji</b><span>Petites annonces gratuites &mdash; Gatineau / Outaouais</span>
    <button class="x" data-act="close">Fermer (Échap)</button></div>
  <div class="strip">Autos &middot; Meubles &middot; Emplois &middot; Rencontres &middot; À donner
    &nbsp;&nbsp;|&nbsp;&nbsp; ${new Date(2004, 7, 14).toLocaleDateString('fr-CA')}</div>
  <div class="wrap">${body}
    <div class="foot"><span>Meilleur avec Internet Explorer 6 &middot; 800x600 &middot;
      Connexion Sympatico 56k &mdash; 4,2 ko/s</span>
      <span>visiteurs : <span class="hits">0041827</span></span></div>
  </div>`;
  for (const c of root.querySelectorAll('canvas[data-shot]')) {
    const k = c.dataset.shot;
    if (k === 'big') shoot(c, current, 330, 248);
    else shoot(c, visible(garage)[Number(k)]);
  }
  root.onclick = onClick;
}

function say(id, text) {
  const e = root.querySelector('#' + id);
  if (e) e.textContent = text;
}

function onClick(e) {
  const a = e.target.closest('[data-ad],[data-act],[data-nav]');
  if (!a) return;
  e.preventDefault();
  if (a.dataset.nav === 'list') { screen = 'list'; paint(); return; }
  if (a.dataset.ad != null) {
    current = visible(ctx.garage)[Number(a.dataset.ad)];
    screen = 'detail'; callsMade = 0; paint();
    return;
  }
  const act = a.dataset.act;
  if (act === 'close') { close(); return; }
  if (act === 'search') {
    say('kjerr', 'Erreur : le serveur ne répond pas. Réessayez plus tard.');
    return;
  }
  if (act === 'call') {
    const c = callerFor(current);
    callsMade++;
    if (!c) { say('kjnote', 'Ça sonne. Ça sonne. Personne.'); return; }
    // Three rings deep: he says hello, he tells you about it, and then the
    // call ends the way that seller's calls always end.
    if (callsMade === 1) { say('kjnote', c.opening); return; }
    if (callsMade === 2) { say('kjnote', c.middle); return; }
    if (callsMade > 3) { say('kjnote', 'T\u2019as fini de l\u2019achaler. Il décroche pu.'); return; }
    if (c.kind === 'deal' && current.car) {
      called.add(current.title);
      paint();
      const cut = dealOn(c, priceOf(current));
      say('kjnote', `Il coupe ${money(cut)} avant que t\u2019aies fini ta question.`);
      return;
    }
    if (c.kind === 'menteur') {
      // He lied out loud, and it was a big enough lie to be worth checking.
      called.add(current.title);
      paint();
      say('kjnote', current.flaw || current.redFlag
        ? CALL_END.menteur : 'Il t\u2019a tout dit. Deux fois.');
      return;
    }
    say('kjnote', CALL_END[c.kind] || CALL_END.jase);
    return;
  }
  if (act === 'inspect' && current && current.car) {
    if (!ctx.wallet.can(INSPECT_PRICE)) {
      say('kjnote', `Le garage veut ${INSPECT_PRICE} $ d’avance. T’as pas ${INSPECT_PRICE} $.`);
      return;
    }
    ctx.wallet.spend(INSPECT_PRICE);
    inspected.add(current.title);
    paint();
    return;
  }
  if (act === 'buy' && current && current.car) {
    const id = current.car;
    const ad = current;
    const seen = wasInspected(ad);
    const cost = priceOf(ad);
    const off = cost - dealtPrice(ad, cost);
    const r = ctx.garage.buy(id, ctx.wallet, ctx.done, off);
    if (!r.ok) { say('kjnote', r.why); return; }
    screen = 'list'; current = null;
    close();
    ctx.onBuy(id, { flaw: ad.flaw || null, inspected: seen, rebate: off });
  }
}

// ---------------------------------------------------------------- open/close

export function isOpen() { return !!root && root.style.display === 'block'; }

export function close() {
  if (!root) return false;
  root.style.display = 'none';
  root.classList.add('hidden');
  if (ctx && ctx.onClose) ctx.onClose();
  return true;
}

/**
 * `opts` is { garage, wallet, done, onBuy(carId), onClose() }. The screen owns
 * nothing: it reads the garage and the wallet and hands the purchase straight
 * back to them.
 */
export function open(opts) {
  ctx = opts;
  screen = 'list'; current = null; callsMade = 0;
  const e = el();
  e.style.display = 'block';
  e.classList.remove('hidden');
  // The classifieds file is fetched behind the modem screen, which is exactly
  // where a 56k connection would have spent that time anyway.
  const ready = Promise.all([loadListings(), loadCalls()]);
  if (connected) { ready.then(() => { if (isOpen()) paint(); }); paint(); return e; }
  e.innerHTML = `<div class="modem"><b>Connexion…</b>
    Composition du 1&nbsp;800&nbsp;773&nbsp;9977…<br>Sympatico &mdash; 56 000 bps<br><br>
    <span style="color:#888">(ta mère va crier si le téléphone sonne)</span></div>`;
  const t = new Promise((r) => setTimeout(r, CONNECT_MS));
  Promise.all([ready, t]).then(() => { connected = true; if (isOpen()) paint(); });
  return e;
}

// Every ad that names a car has to name one that exists and has a price on it,
// or the page would show a number on nothing.
for (const a of ADS) {
  if (!a.car) continue;
  if (!CARS.some((c) => c.id === a.car)) throw new Error('kijiji: no car ' + a.car);
  if (!UNLOCKS[a.car] || UNLOCKS[a.car].kind !== 'buy') throw new Error('kijiji: ' + a.car + ' is not for sale');
}
if (!TEMPO) throw new Error('kijiji: famouscars.js did not register the Tempo');
