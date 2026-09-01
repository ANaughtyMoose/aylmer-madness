// The dial, and there are no audio files in this repo.
//
// R walks it. With the written copy loaded (assets/text/radio.json) that is:
//
//   0  CKOI 102.1     franco top forty — the one that shipped first
//   1  MAX 104.7      CFOU-FM, modern rock, DJ Dan « Le Pitbull » Tremblay
//   2  CHLL 99.9      classic rock, Gilles « The Bear » Larocque, ex-E.B. Eddy
//   3  CKUQ 89.1      campus radio out of UQO, « B-O » at the microphone
//   4  CFRL 101.3     country franco, Ti-Gars Pilon, de Quyon
//   5  CJRC 1150 AM   ligne ouverte and municipal complaining, through an AM
//                     speaker, and it sounds like one. A real Gatineau station
//   6  CKOT 92.3      the Ottawa signal you have to drive for: it is modelled
//                     off your distance from the transmitter, solid downtown
//                     and mush by the time you are back at the Aylmer marina
//   7  Cassette       whatever the player dropped in assets/radio/
//
// Without it, the six built-in stations in STATIONS below play instead and
// nothing else changes.
//
// EVERY note is synthesised. Each song is one eight-bar loop rendered ONCE into
// an AudioBuffer on an OfflineAudioContext and then looped by a single
// BufferSource, so the running graph is a handful of nodes no matter how long
// the song is and nothing is scheduled per frame. The "DJ" is a station sting
// plus a line of text on the HUD — idents, patter and ads for businesses that
// exist in this town. There is no speech synthesis anywhere near this, and
// there are no network requests except the tape deck's own playlist.
//
// ---- the cassette deck ----------------------------------------------------
//
// The last station on the dial plays the player's own files. It is the only part of the radio that
// touches the network, and only for files the player put there themselves:
//
//   assets/radio/playlist.json   ["un.mp3", "deux.ogg"]
//                                or {"tracks":[{"file":"un.mp3","title":"Un",
//                                               "artist":"Quelqu'un"}]}
//   assets/radio/*.mp3 | *.ogg | *.m4a | *.wav
//
// loadTape() fetches that one JSON at boot. If it is missing, malformed or
// empty the station simply does not appear on the dial and R skips it — see
// assets/radio/README.md and playlist.example.json. Files are played through an
// <audio> element routed into the same Web Audio graph as the synth stations,
// so the ducking, the car-speaker filter and the volume slider all work on it.
//
// The deck lives on the Audio object's radio bus, ducks under the engine and
// the horn, and keeps playing across car swaps because nothing recreates it.
import { loadRadio, saveRadio } from './store.js';

// ---------------------------------------------------------------- the music

// Seeded, so "CKOI at 14h07" is the same song every time you drive past.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEMI = (n) => 440 * Math.pow(2, n / 12);
// Scale degrees as semitones from A, for the four styles' key centres.
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const STYLES = [
  { id: 'pop',     bpm: 118, name: 'synthé-pop' },
  { id: 'metal',   bpm: 148, name: 'métal' },
  { id: 'boom',    bpm: 92,  name: 'boom bap' },
  { id: 'folk',    bpm: 126, name: 'trad' },
  // Added with the rest of the dial.
  { id: 'ballade', bpm: 76,  name: 'ballade' },
  { id: 'classic', bpm: 132, name: 'rock classique' },
  { id: 'country', bpm: 108, name: 'country' },
  { id: 'campus',  bpm: 86,  name: 'campus' },
  { id: 'talk',    bpm: 96,  name: 'lit de nouvelles' },
];

// The playlist CKOI works through. Titles are the joke; the seed is the song.
export const CKOI_TRACKS = [
  { style: 'pop',   seed: 1999, title: 'Toute la nuit',            artist: 'Les Mardis Soir', seconds: 108 },
  { style: 'metal', seed: 8801, title: 'Chrome et Asphalte',       artist: 'Bourrasque',      seconds: 96 },
  { style: 'boom',  seed: 4242, title: 'Deux Piastres',            artist: 'DJ Vanier',       seconds: 114 },
  { style: 'folk',  seed: 1717, title: 'La Reel du Chemin d’Aylmer', artist: 'La Sacoche',    seconds: 92 },
  { style: 'pop',   seed: 2703, title: 'Été 2004',                  artist: 'Marie-Pier',      seconds: 120 },
  { style: 'metal', seed: 6161, title: 'Le Dernier Party',         artist: 'Bourrasque',      seconds: 100 },
];

// ---------------------------------------------------------------- the dial
//
// Each station is a voice, not a playlist: its own sting, its own idents, its
// own DJ, and its own advertisers — every one of which is a business you can
// actually drive to in this game. `tone` is the car speaker for that band; the
// AM station gets a narrow one and sounds like an AM station.
export const STATIONS = [
  {
    id: 'ckoi', name: 'CKOI 102.1', slogan: 'Toute la musique que j’aime',
    sting: [784, 988, 1319], tone: { freq: 900, q: 0.35 },
    tracks: CKOI_TRACKS,
    idents: [
      'CKOI 102.1 — toute la musique que j’aime',
      'T’écoutes CKOI. Monte le son.',
      'CKOI 102.1, Gatineau-Ottawa',
    ],
    patter: [
      'DJ: Y fait 31 pis y’est juste 2 h. Ouvre les fenêtres.',
      'DJ: Bonne fête à Karine du secteur Aylmer, 17 ans aujourd’hui.',
      'DJ: On s’en va au bloc de trois, pis après ça, le palmarès.',
      'DJ: Si t’es pogné dans le trafic sur le pont, ben… bonne chance.',
      'DJ: Prochain: du gros stock. Reste avec nous autres.',
    ],
    ads: [
      'PUB: Galeries d’Aylmer — la rentrée, c’est déjà commencé.',
      'PUB: Canadian Tire, chemin d’Aylmer. Pneus, BBQ, pis le reste.',
      'PUB: Dépanneur Palmyra. Ouvert tard. Loto, chips, glace.',
      'PUB: Auberge Symmes — souper sur la terrasse, vue sur l’eau.',
    ],
  },
  {
    id: 'cimf', name: 'CIMF 94.9', slogan: 'Rock Détente — doux pis tranquille',
    sting: [659, 784, 880], tone: { freq: 1000, q: 0.42 },
    tracks: [
      { style: 'ballade', seed: 5150, title: 'Reste encore un peu',  artist: 'Nathalie Pilon', seconds: 116 },
      { style: 'ballade', seed: 2211, title: 'La Route de Chelsea',  artist: 'Yvon Chartrand', seconds: 104 },
      { style: 'pop',     seed: 3312, title: 'Comme avant',          artist: 'Les Deux Rives', seconds: 110 },
      { style: 'ballade', seed: 9091, title: 'Un dimanche à Deschênes', artist: 'Claudine',    seconds: 98 },
    ],
    idents: [
      'CIMF 94.9 — Rock Détente, Gatineau',
      'Doux pis tranquille, sur CIMF 94.9',
      'La musique qui fait du bien. CIMF.',
    ],
    patter: [
      'DJ: On garde ça doux jusqu’à cinq heures.',
      'DJ: Une petite pensée pour ceux qui travaillent dehors aujourd’hui.',
      'DJ: Ça, c’est une demande spéciale de Margaret, sur le chemin Fraser.',
      'DJ: La météo dans deux minutes. Ça se gâte vers l’ouest.',
    ],
    ads: [
      'PUB: Hôtel Deschênes — cinq à sept, tous les vendredis.',
      'PUB: Club de Golf Gatineau. Le neuf trous d’après-midi, 22 $.',
      'PUB: Paroisse Saint-Paul — bazar samedi, sous-sol de l’église.',
    ],
  },
  {
    id: 'chez', name: 'CHEZ 106.1', slogan: 'Ottawa’s Rock Station',
    sting: [330, 440, 587], tone: { freq: 1100, q: 0.5 },
    // The one signal you have to drive for. `x`/`z` is the transmitter, up on
    // the Ottawa side; `near` is where it is perfect and `far` where it is gone.
    // Solid downtown Hull, mush by the time you are back at the marina — which
    // is exactly how an Ottawa FM behaved out here in 2004.
    weak: { x: 10668, z: -3330, near: 1800, far: 14000 },
    tracks: [
      { style: 'classic', seed: 7301, title: 'Highway Wind',       artist: 'The Grey Sedans', seconds: 112 },
      { style: 'classic', seed: 4404, title: 'Deschênes Rapids',   artist: 'Bytown Bros',     seconds: 100 },
      { style: 'metal',   seed: 1102, title: 'Long Weekend',       artist: 'Silver Lake',     seconds: 96 },
      { style: 'classic', seed: 6620, title: 'Two Lane Blacktop',  artist: 'The Grey Sedans', seconds: 118 },
    ],
    idents: [
      'CHEZ 106 — Ottawa’s rock station',
      'You’re on CHEZ 106.1',
      'CHEZ 106 — all the rock, all the time',
    ],
    patter: [
      'DJ: Doors at eight, tickets at the door. Get out of the house.',
      'DJ: Twenty-nine degrees on the Queensway and nobody is moving.',
      'DJ: Rock blocks all afternoon, right here on CHEZ.',
      '…du sss… …grésillement… (le signal r’vire de bord)',
    ],
    ads: [
      'PUB: Casino du Lac-Leamy — buffet, 15,95 $, tous les soirs.',
      'PUB: Les Galeries de Hull. Stationnement gratuit.',
      'PUB: Musée canadien de l’histoire — entrée libre le jeudi soir.',
    ],
  },
  {
    id: 'ckcu', name: 'CKCU 93.1', slogan: 'Radio campus, Carleton',
    sting: [523, 494, 698, 466], tone: { freq: 850, q: 0.3 },
    tracks: [
      { style: 'campus', seed: 8118, title: 'Cassette Trouvée',     artist: 'Loque',           seconds: 104 },
      { style: 'campus', seed: 3030, title: 'Sous-sol, 3 h du mat', artist: 'Les Colocs Fictifs', seconds: 96 },
      { style: 'boom',   seed: 9512, title: 'Pont Champlain',       artist: 'DJ Vanier',       seconds: 108 },
      { style: 'campus', seed: 6767, title: 'Bruit de Fond',        artist: 'Mémoire Vive',    seconds: 92 },
    ],
    idents: [
      'CKCU 93.1 FM — radio campus, Université Carleton',
      'You are listening to CKCU. Nous sommes CKCU.',
      'CKCU 93.1 — non-commercial, listener supported',
    ],
    patter: [
      'DJ: C’tait quoi ça? Aucune idée. On l’a trouvé dans une boîte.',
      'DJ: Funding drive next week. Pledge, or we play this one again.',
      'DJ: Prochaine heure: deux heures de trames sonores de films tchèques.',
      'DJ: Si quelqu’un a laissé un vélo devant le studio, viens le chercher.',
    ],
    ads: [
      'PUB: Heritage College — inscriptions d’automne, secteur Hull.',
      'PUB: Aréna Frank-Robinson — hockey libre, mercredi soir.',
      'PUB: Le lot d’occasion du chemin d’Aylmer. Ça roule. À peu près.',
    ],
  },
  {
    id: 'y105', name: 'Y105 · CKBY', slogan: 'Country capital of Canada',
    sting: [392, 494, 587], tone: { freq: 1200, q: 0.4 },
    tracks: [
      { style: 'country', seed: 2404, title: 'Half a Tank',          artist: 'Della Booth',    seconds: 106 },
      { style: 'country', seed: 8842, title: 'Gravel and Gasoline',  artist: 'The Ridge Boys', seconds: 98 },
      { style: 'folk',    seed: 5127, title: 'Reel du 148',          artist: 'La Sacoche',     seconds: 94 },
      { style: 'country', seed: 3399, title: 'Ottawa Valley Moon',   artist: 'Della Booth',    seconds: 114 },
    ],
    idents: [
      'Y105 — CKBY, the country capital of Canada',
      'Y105. Real country.',
      'CKBY 105.3, Ottawa-Gatineau',
    ],
    patter: [
      'DJ: Trucks, dogs pis des cœurs cassés. C’est tout c’qu’on a.',
      'DJ: Big weekend out at the fairgrounds. Bring a chair.',
      'DJ: On a une demande pour un gars qui répare des Ranger à Aylmer.',
      'DJ: Coming up: three in a row, no talk.',
    ],
    ads: [
      'PUB: Petro-Canada — le plein, un café, pis un lave-auto.',
      'PUB: McDo du chemin d’Aylmer. Le service au volant, jusqu’à minuit.',
      'PUB: Tim Hortons de la rue Principale. Toujours ouvert.',
      'PUB: Club de Golf Gatineau — tournoi des pompiers, samedi.',
    ],
  },
  {
    id: 'cjrc', name: 'CJRC 1150 AM', slogan: 'Nouvelles, sports pis opinions',
    sting: [440, 349], tone: { freq: 1450, q: 2.6 },
    tracks: [
      { style: 'talk', seed: 1150, title: 'La ligne ouverte',        artist: 'CJRC',  seconds: 118 },
      { style: 'talk', seed: 1151, title: 'Le bulletin de 16 h',     artist: 'CJRC',  seconds: 96 },
      { style: 'talk', seed: 1152, title: 'L’heure des sports',      artist: 'CJRC',  seconds: 110 },
    ],
    idents: [
      'CJRC 1150 — l’Outaouais vous parle',
      'Vous êtes au 1150 AM.',
      'CJRC 1150, Gatineau-Hull-Aylmer',
    ],
    patter: [
      'ANIMATEUR: Prochain appel. Marcel, d’Aylmer, bonjour.',
      'ANIMATEUR: Les Sénateurs, y’ont encore rien fait c’t’été. Rien.',
      'ANIMATEUR: Le conseil municipal a reparlé du pont. Encore.',
      'ANIMATEUR: On prend vos appels au sujet des nids-de-poule.',
      'ANIMATEUR: Trente et un degrés, humidex quarante. Buvez de l’eau.',
      'ANIMATEUR: Avis d’orage violent pour l’Outaouais. Rentrez les chaises.',
    ],
    ads: [
      'PUB: Plage des Cèdres — surveillants de 10 h à 18 h.',
      'PUB: Marina d’Aylmer. Rampe de mise à l’eau, 8 $ la journée.',
      'PUB: Canadian Tire du chemin d’Aylmer — les essuie-glaces, 2 pour 1.',
      'PUB: Dépanneur Palmyra. La glace, le vendredi, avant qu’y en aye pu.',
    ],
  },
];

// The tape deck is not in STATIONS: it only exists when the player put files in
// assets/radio/, so it is appended to the dial at runtime.
export const TAPE_NAME = 'Cassette';
export const STATION_NAMES = [...STATIONS.map((s) => s.name), TAPE_NAME];
export const CKOI_SLOGAN = STATIONS[0].slogan;
// How long one line of a break sits on the HUD before the next one.
export const BREAK_SECONDS = 7;
// An ad read is a paragraph, so it goes out in chunks of about this many
// characters, one after another, like an actual ad break.
export const AD_CHUNK = 96;

// ---------------------------------------------------------------- the writing
//
// STATIONS above is the FALLBACK. The real copy lives in assets/text/radio.json
// — six stations, each with a named DJ, eight idents, twenty-five lines of
// patter, twelve local ad reads, six news/weather/traffic stingers and four
// contest bits. This file supplies what the JSON cannot: the music.
//
// One deliberate keep: CKOI 102.1 stays at position 0 on the dial. It shipped
// first, tools/smoke_garage.mjs pins it there, and a franco top-forty station is
// not the same animal as the modern-rock one that arrived with the copy.
//
// `MUSIC[id]` is the sound of a station: its playlist, its logo notes and the
// speaker it comes out of. Anything the JSON adds that has no entry here plays
// the house band and comes out of an ordinary FM speaker.
export const MUSIC = {
  max_energie: {
    name: 'MAX 104.7',            // the brand, which is what the DJ and the
    sting: [880, 1175, 1568],     // dialogue both actually say out loud
    tone: { freq: 950, q: 0.38 },
    tracks: [
      { style: 'metal',   seed: 1047, title: 'Douze Secondes',      artist: 'Bourrasque',      seconds: 96 },
      { style: 'pop',     seed: 2047, title: 'Coup de Chaleur',     artist: 'Les Mardis Soir', seconds: 108 },
      { style: 'classic', seed: 3047, title: 'Subs dans’ Valise',   artist: 'Z24',             seconds: 100 },
      { style: 'metal',   seed: 4047, title: 'Pèse su’l Gaz',       artist: 'Bourrasque',      seconds: 92 },
    ],
  },
  le_roc: {
    name: 'CHLL 99.9',
    sting: [330, 440, 587],
    tone: { freq: 1100, q: 0.5 },
    tracks: [
      { style: 'classic', seed: 9901, title: 'Papermill Blues',     artist: 'The Grey Sedans', seconds: 112 },
      { style: 'classic', seed: 9902, title: 'Deschênes Rapids',    artist: 'Bytown Bros',     seconds: 100 },
      { style: 'metal',   seed: 9903, title: 'Long Weekend',        artist: 'Silver Lake',     seconds: 96 },
      { style: 'classic', seed: 9904, title: 'Chemin d’Aylmer',     artist: 'La Sacoche',      seconds: 118 },
    ],
  },
  radio_uqo: {
    name: 'CKUQ 89.1',
    sting: [523, 494, 698, 466],
    tone: { freq: 850, q: 0.3 },
    tracks: [
      { style: 'campus', seed: 8911, title: 'Cassette Trouvée',      artist: 'Loque',              seconds: 104 },
      { style: 'campus', seed: 8912, title: 'Sous-sol, 3 h du mat',  artist: 'Les Colocs Fictifs', seconds: 96 },
      { style: 'boom',   seed: 8913, title: 'Pont Champlain',        artist: 'DJ Vanier',          seconds: 108 },
      { style: 'campus', seed: 8914, title: 'Bruit de Fond',         artist: 'Mémoire Vive',       seconds: 92 },
    ],
  },
  riviere_country: {
    name: 'CFRL 101.3',
    sting: [392, 494, 587],
    tone: { freq: 1200, q: 0.4 },
    tracks: [
      { style: 'country', seed: 1013, title: 'Demi-Réservoir',      artist: 'Ti-Gars Pilon',  seconds: 106 },
      { style: 'country', seed: 1014, title: 'Le Traversier d’Quyon', artist: 'Della Booth',  seconds: 98 },
      { style: 'folk',    seed: 1015, title: 'Reel du 148',          artist: 'La Sacoche',     seconds: 94 },
      { style: 'country', seed: 1016, title: 'Lune su’a Vallée',     artist: 'Ti-Gars Pilon',  seconds: 114 },
    ],
  },
  cjrc_talk: {
    name: 'CJRC 1150 AM',
    sting: [440, 349],
    tone: { freq: 1450, q: 2.6 },     // an AM speaker, and it sounds like one
    tracks: [
      { style: 'talk', seed: 1150, title: 'La ligne ouverte',    artist: 'CJRC', seconds: 118 },
      { style: 'talk', seed: 1151, title: 'Le bulletin de 16 h', artist: 'CJRC', seconds: 96 },
      { style: 'talk', seed: 1152, title: 'L’heure des sports',  artist: 'CJRC', seconds: 110 },
    ],
  },
  the_buzz_ottawa: {
    name: 'CKOT 92.3',
    sting: [587, 784, 1047],
    tone: { freq: 1050, q: 0.55 },
    // The one you have to drive for. The transmitter is on the Ottawa side; it
    // is solid downtown and mush by the time you are back at the Aylmer marina,
    // which is exactly what an Ottawa FM did out here in 2004.
    weak: { x: 10668, z: -3330, near: 1800, far: 14000 },
    tracks: [
      { style: 'campus',  seed: 9231, title: 'Across the River',   artist: 'Sandy Hill',      seconds: 104 },
      { style: 'classic', seed: 9232, title: 'Two Lane Blacktop',  artist: 'The Grey Sedans', seconds: 118 },
      { style: 'campus',  seed: 9233, title: 'Britannia Beach',    artist: 'Loque',           seconds: 96 },
    ],
  },
};

// The house band, for a station the copy adds that MUSIC has never heard of.
const HOUSE = { sting: [523, 659, 784], tone: { freq: 950, q: 0.4 }, tracks: CKOI_TRACKS };

/**
 * assets/text/radio.json -> the dial. CKOI keeps position 0; every station in
 * the file follows it, wearing whatever music MUSIC has for it. Returns null if
 * the file is not the shape it should be, and the caller keeps its fallback.
 */
export function stationsFromJSON(json) {
  const rows = json && Array.isArray(json.stations) ? json.stations : null;
  if (!rows || !rows.length) return null;
  const out = [STATIONS[0]];
  for (const r of rows) {
    if (!r || typeof r.id !== 'string') continue;
    const m = MUSIC[r.id] || HOUSE;
    const ads = (r.ads || []).map((a) => (typeof a === 'string'
      ? { business: '', copy: a }
      : { business: a.business || '', copy: a.copy || '' })).filter((a) => a.copy);
    const st = {
      id: r.id,
      // The brand beats the call sign: the DJ says « MAX 104.7 », the dialogue
      // says « MAX 104.7 », so that is what goes on the HUD.
      name: m.name || `${r.call || r.id} ${r.freq || ''}`.trim(),
      slogan: [r.call, r.freq].filter(Boolean).join(' · '),
      format: r.format || '', persona: r.persona || '',
      sting: m.sting || HOUSE.sting,
      tone: m.tone || HOUSE.tone,
      tracks: m.tracks || HOUSE.tracks,
      idents: (r.idents || []).filter(Boolean),
      patter: (r.patter || []).filter(Boolean),
      ads,
      stingers: (r.stingers || []).filter(Boolean),
      contests: (r.contests || []).filter(Boolean),
    };
    if (m.weak) st.weak = m.weak;
    if (!st.idents.length && !st.patter.length && !ads.length) continue;
    out.push(st);
  }
  return out.length > 1 ? out : null;
}

// A paragraph of ad copy, cut into HUD-sized pieces on sentence boundaries.
export function chunkCopy(copy, max = AD_CHUNK) {
  const parts = String(copy || '').split(/(?<=[.!?])\s+/);
  const out = [];
  let cur = '';
  for (const p of parts) {
    if (!p) continue;
    if (cur && (cur + ' ' + p).length > max) { out.push(cur); cur = p; }
    else cur = cur ? cur + ' ' + p : p;
    // A single sentence longer than the line still has to be cut somewhere.
    while (cur.length > max * 1.6) {
      const cut = cur.lastIndexOf(' ', max);
      out.push(cur.slice(0, cut > 20 ? cut : max));
      cur = cur.slice(cut > 20 ? cut + 1 : max);
    }
  }
  if (cur) out.push(cur);
  return out;
}

// ---- little offline instruments ------------------------------------------
// Every one of these schedules its notes into an OfflineAudioContext and then
// goes away; nothing here ever runs while you are driving.

function env(ctx, node, t, a, d, peak) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.linearRampToValueAtTime(peak, t + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(ctx, dest, type, freq, t, dur, vol, cut, detune = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  f.type = 'lowpass'; f.frequency.value = cut || 4000; f.Q.value = 0.7;
  env(ctx, g, t, Math.min(0.02, dur * 0.2), dur, vol);
  o.connect(f); f.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

function noiseBuf(ctx, sec, rnd) {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
  return b;
}

function hit(ctx, dest, buf, t, dur, vol, type, freq, q) {
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  s.buffer = buf;
  f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
  env(ctx, g, t, 0.002, dur, vol);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t); s.stop(t + dur + 0.05);
}

function kick(ctx, dest, t, vol = 0.9) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + 0.32);
}

/**
 * Render one eight-bar loop of `style` into an AudioBuffer. Deterministic for a
 * given seed. This is the only expensive thing the radio does, it happens once
 * per track, and it happens off the main graph.
 */
export async function renderLoop(style, seed, sampleRate = 22050) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC) throw new Error('no OfflineAudioContext');
  const st = STYLES.find((s) => s.id === style) || STYLES[0];
  const beat = 60 / st.bpm, bar = beat * 4, bars = 8;
  const seconds = bar * bars;
  const ctx = new OAC(1, Math.ceil(seconds * sampleRate), sampleRate);
  const rnd = mulberry32(seed);

  const out = ctx.createGain(); out.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 4; comp.knee.value = 18;
  out.connect(comp); comp.connect(ctx.destination);

  const nz = noiseBuf(ctx, 1.0, rnd);
  const root = -3 + Math.floor(rnd() * 5);              // key, semitones from A
  const MAJ_STYLES = ['folk', 'pop', 'country', 'ballade'];
  const scale = MAJ_STYLES.includes(style) ? MAJOR : MINOR;
  const prog = [0, 5, 3, 4].map((d) => scale[d % 7] + root);

  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const chord = prog[b % prog.length];
    const bassF = SEMI(chord - 24);
    const fill = b % 4 === 3;

    if (style === 'pop') {
      // Straight four, a fat synth bass on eighths, and a chord stab on 2 and 4.
      for (let k = 0; k < 4; k++) kick(ctx, out, t0 + k * beat, 0.85);
      for (let k = 0; k < 8; k++) {
        hit(ctx, out, nz, t0 + k * beat / 2, 0.045, 0.12, 'highpass', 7000, 0.7);
      }
      for (const k of [1, 3]) hit(ctx, out, nz, t0 + k * beat, 0.16, 0.42, 'bandpass', 1900, 1.1);
      for (let k = 0; k < 8; k++) {
        tone(ctx, out, 'sawtooth', bassF * (k % 4 === 3 ? 1.5 : 1), t0 + k * beat / 2, beat * 0.42, 0.34, 620);
      }
      for (const k of [1, 3]) {
        for (const iv of [0, 3, 7]) {
          tone(ctx, out, 'square', SEMI(chord + iv), t0 + k * beat, beat * 0.55, 0.10, 2600, rnd() * 8 - 4);
        }
      }
      // A little four-note hook over the top, same every bar of the phrase.
      const hook = [0, 7, 5, 7];
      for (let k = 0; k < 4; k++) {
        tone(ctx, out, 'triangle', SEMI(chord + 12 + hook[k]), t0 + k * beat + beat * 0.5, beat * 0.35, 0.14, 5000);
      }
    } else if (style === 'metal') {
      // Palm-muted eighths on the root, crash on the one, double-time snare.
      for (let k = 0; k < 8; k++) {
        const f = SEMI(chord - 12) * (k === 6 && fill ? 1.122 : 1);
        tone(ctx, out, 'sawtooth', f, t0 + k * beat / 2, beat * 0.30, 0.30, 2400, -6);
        tone(ctx, out, 'sawtooth', f * 1.4983, t0 + k * beat / 2, beat * 0.30, 0.16, 2600, 6);   // fifth
        kick(ctx, out, t0 + k * beat / 2, k % 2 === 0 ? 0.8 : 0.35);
      }
      for (const k of [1, 3]) hit(ctx, out, nz, t0 + k * beat, 0.20, 0.55, 'bandpass', 2400, 0.9);
      hit(ctx, out, nz, t0, 0.55, 0.24, 'highpass', 5200, 0.7);
      // A wailing lead every other bar.
      if (b % 2 === 1) {
        const notes = [12, 15, 19, 22];
        for (let k = 0; k < 4; k++) {
          tone(ctx, out, 'square', SEMI(chord + notes[(k + b) % 4]), t0 + k * beat, beat * 0.8, 0.13, 5200);
        }
      }
    } else if (style === 'boom') {
      // Kick on 1 and the and-of-2, snare on 2 and 4, swung hats, walking bass.
      kick(ctx, out, t0, 0.95);
      kick(ctx, out, t0 + beat * 1.5, 0.7);
      kick(ctx, out, t0 + beat * 2.75, 0.55);
      for (const k of [1, 3]) hit(ctx, out, nz, t0 + k * beat, 0.22, 0.62, 'bandpass', 1500, 0.8);
      for (let k = 0; k < 8; k++) {
        const swing = k % 2 ? 0.06 * beat : 0;
        hit(ctx, out, nz, t0 + k * beat / 2 + swing, 0.05, 0.10, 'highpass', 6500, 0.7);
      }
      const walk = [0, 0, 7, 5];
      for (let k = 0; k < 4; k++) {
        tone(ctx, out, 'triangle', SEMI(chord - 24 + walk[k]), t0 + k * beat, beat * 0.75, 0.42, 420);
      }
      // A dusty two-chord loop up top, filtered like a sampled record.
      for (const k of [0, 2]) {
        for (const iv of [0, 3, 7, 10]) {
          tone(ctx, out, 'sawtooth', SEMI(chord + iv), t0 + k * beat, beat * 0.9, 0.075, 1500, rnd() * 10 - 5);
        }
      }
    } else if (style === 'ballade') {
      // Rock Détente: a slow one. Brushed kick on 1 and 3, a warm pad holding
      // the chord for the whole bar, an arpeggio on top and nothing else.
      kick(ctx, out, t0, 0.55);
      kick(ctx, out, t0 + beat * 2, 0.42);
      for (const k of [1, 3]) hit(ctx, out, nz, t0 + k * beat, 0.13, 0.16, 'bandpass', 3200, 1.3);
      tone(ctx, out, 'sine', SEMI(chord - 24), t0, bar * 0.92, 0.34, 300);
      for (const iv of [0, 4, 7, 11]) {
        for (const det of [-6, 6]) {
          tone(ctx, out, 'triangle', SEMI(chord + iv), t0, bar * 0.88, 0.062, 1900, det);
        }
      }
      const arp = [0, 4, 7, 11, 7, 4];
      for (let k = 0; k < 6; k++) {
        tone(ctx, out, 'sine', SEMI(chord + 12 + arp[k]), t0 + k * beat * 0.66, beat * 0.6, 0.11, 4200);
      }
    } else if (style === 'classic') {
      // CHEZ 106: a shuffle-ish blues rock. Power chords on the backbeat, a
      // snare you could set your watch to, and a pentatonic lick every four.
      for (let k = 0; k < 4; k++) kick(ctx, out, t0 + k * beat, k % 2 === 0 ? 0.85 : 0.45);
      for (const k of [1, 3]) hit(ctx, out, nz, t0 + k * beat, 0.19, 0.52, 'bandpass', 2000, 0.9);
      for (let k = 0; k < 8; k++) {
        const sw = k % 2 ? beat * 0.08 : 0;
        hit(ctx, out, nz, t0 + k * beat / 2 + sw, 0.06, 0.09, 'highpass', 6000, 0.7);
      }
      for (let k = 0; k < 4; k++) {
        const f = SEMI(chord - 12);
        tone(ctx, out, 'sawtooth', f, t0 + k * beat, beat * 0.62, 0.26, 1900, -5);
        tone(ctx, out, 'sawtooth', f * 1.4983, t0 + k * beat, beat * 0.62, 0.15, 2100, 5);
        tone(ctx, out, 'triangle', SEMI(chord - 24), t0 + k * beat, beat * 0.7, 0.30, 400);
      }
      if (b % 4 === 3) {
        const lick = [0, 3, 5, 6, 5, 3];
        for (let k = 0; k < 6; k++) {
          tone(ctx, out, 'square', SEMI(chord + 12 + lick[k]), t0 + k * beat * 0.62, beat * 0.5, 0.12, 4600);
        }
      }
    } else if (style === 'country') {
      // Y105: a two-beat. Bass on 1 and 3, brushed snare on 2 and 4, a plucked
      // "banjo" roll of triplets, and a slide up into every second bar.
      for (const k of [0, 2]) tone(ctx, out, 'triangle', SEMI(chord - 24), t0 + k * beat, beat * 0.55, 0.40, 380);
      for (const k of [1, 3]) hit(ctx, out, nz, t0 + k * beat, 0.12, 0.30, 'bandpass', 2800, 1.2);
      for (let k = 0; k < 12; k++) {
        const roll = [0, 7, 12][k % 3];
        tone(ctx, out, 'square', SEMI(chord + 12 + roll), t0 + k * beat / 3, beat * 0.22, 0.085, 5200);
      }
      // The pedal steel: two detuned triangles bent into the chord.
      for (const iv of [4, 7]) {
        for (const det of [-14, 14]) {
          tone(ctx, out, 'triangle', SEMI(chord + iv), t0 + beat * 0.5, beat * 2.6, 0.075, 2600, det);
        }
      }
      if (fill) for (let k = 0; k < 4; k++) hit(ctx, out, nz, t0 + 3 * beat + k * beat / 4, 0.05, 0.22, 'bandpass', 2200, 1.0);
    } else if (style === 'campus') {
      // CKCU: whatever this is. A tape-wobbled loop, a kick that is late on
      // purpose, and a minor-ninth chord nobody asked for.
      kick(ctx, out, t0, 0.7);
      kick(ctx, out, t0 + beat * 1.62, 0.5);
      for (const k of [2]) hit(ctx, out, nz, t0 + k * beat, 0.26, 0.40, 'bandpass', 1100, 0.6);
      hit(ctx, out, nz, t0, bar * 0.9, 0.035, 'highpass', 4200, 0.5);   // tape hiss
      for (const iv of [0, 3, 7, 10, 14]) {
        // The wobble: each voice detuned a different, seeded amount.
        tone(ctx, out, 'sawtooth', SEMI(chord + iv), t0 + rnd() * 0.05, bar * 0.8, 0.055, 1250, rnd() * 26 - 13);
      }
      const mel = [0, 10, 7, 3, 14, 7];
      for (let k = 0; k < 6; k++) {
        if (rnd() < 0.22) continue;                     // it drops notes
        tone(ctx, out, 'sine', SEMI(chord + 12 + mel[(k + b) % 6]), t0 + k * beat * 0.66, beat * 0.5, 0.13, 3000, rnd() * 16 - 8);
      }
    } else if (style === 'talk') {
      // CJRC 1150: not a song. A newsroom bed — a low drone, a clock tick, and
      // a two-note stab every second bar. It is meant to sit UNDER a voice that
      // this game does not have, so it is deliberately sparse and quiet.
      tone(ctx, out, 'sine', SEMI(root - 24), t0, bar * 0.98, 0.20, 240);
      tone(ctx, out, 'triangle', SEMI(root - 12), t0, bar * 0.95, 0.07, 700, 5);
      for (let k = 0; k < 4; k++) hit(ctx, out, nz, t0 + k * beat, 0.02, 0.07, 'bandpass', 2600, 4.0);
      if (b % 2 === 1) {
        for (const iv of [0, 7]) tone(ctx, out, 'square', SEMI(chord + iv), t0 + beat * 3, beat * 0.7, 0.075, 2000);
      }
    } else {
      // Folk: a two-step, a bellows drone, and a reel of eighth notes.
      for (let k = 0; k < 4; k++) kick(ctx, out, t0 + k * beat, k % 2 === 0 ? 0.7 : 0.4);
      for (const k of [1, 3]) hit(ctx, out, nz, t0 + k * beat, 0.10, 0.28, 'bandpass', 2600, 1.4);
      tone(ctx, out, 'sawtooth', SEMI(root - 24), t0, bar * 0.95, 0.26, 380);
      // The "accordion": two square waves a beat apart in tuning, slow attack.
      for (const iv of [0, 4, 7]) {
        for (const det of [-9, 9]) {
          tone(ctx, out, 'square', SEMI(chord + iv), t0, bar * 0.9, 0.055, 2100, det);
        }
      }
      const reel = [0, 2, 4, 7, 9, 7, 4, 2];
      for (let k = 0; k < 8; k++) {
        const d = scale[(reel[k] + b) % 7] + root + 12;
        tone(ctx, out, 'triangle', SEMI(d), t0 + k * beat / 2, beat * 0.40, 0.17, 5200);
      }
    }
  }

  const buf = await ctx.startRendering();
  return buf;
}

// ---------------------------------------------------------------- the deck


// The dial: the synthesised stations, plus the tape deck when there is one.
// Everything in the class talks in dial INDEXES, and the tape is always the far
// end of it — `this.tapeIdx`, because the dial grows when the copy loads.

export class Radio {
  /** @param audio the core/audio.js Audio instance (started or not). */
  constructor(audio) {
    this.audio = audio;
    const saved = loadRadio();
    this.volume = saved.volume;
    this.wantOn = saved.on;                   // the deck only runs while driving
    this.on = false;
    // store.js clamps its `station` field to 0..3 and that file is not ours, so
    // which station you were on is remembered by ID on the radio's own key. The
    // clamped index is still written, so an old build reading it still finds a
    // real station.
    // The live dial. STATIONS is the built-in fallback; loadText() swaps in the
    // written copy from assets/text/radio.json when it turns up.
    this.dial = STATIONS;
    this.station = readStationPref(saved.station, this.dial);
    this.trackIdx = new Map();                // station id -> where it is in its hour
    this.trackT = 0;
    this.breakT = 0;                          // seconds left of the line on screen
    this.breakLine = '';
    this.breakQueue = [];                     // the rest of the break, in order
    this.breakIdx = 0;
    this.built = false;
    this.loops = new Map();                   // 'style:seed' -> AudioBuffer
    this.src = null;
    this.tape = null;                         // { list, idx, el, node }
    this.tapeReady = false;
    this.duck = 1;
    this.line = '';
    this.onChange = null;                     // main.js repaints the HUD line
    this.rendering = false;
    // The weak Ottawa signal. `px`/`pz` is where the car is; setPos() feeds it.
    this.px = 0; this.pz = 0;
    this.signal = 1;
    this.sigT = 0;
  }

  // ---- graph ----------------------------------------------------------
  _build() {
    const a = this.audio;
    if (this.built || !a || !a.ok) return false;
    const ctx = a.ctx;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.duckG = ctx.createGain();
    this.duckG.gain.value = 1;
    this.tone = ctx.createBiquadFilter();     // a car speaker is not a monitor
    this.tone.type = 'bandpass';
    this.tone.frequency.value = 900;
    this.tone.Q.value = 0.35;
    this.out.connect(this.duckG);
    this.duckG.connect(this.tone);
    this.tone.connect(a.radioBus || a.master);
    // The static that lives between the stations. One looping noise source that
    // is silent unless a weak station is fading, which is only ever CHEZ.
    this.hissG = ctx.createGain();
    this.hissG.gain.value = 0;
    const hf = ctx.createBiquadFilter();
    hf.type = 'bandpass'; hf.frequency.value = 2400; hf.Q.value = 0.6;
    const hs = ctx.createBufferSource();
    hs.buffer = a.noiseBuf || noiseBufLive(ctx);
    hs.loop = true;
    hs.connect(hf); hf.connect(this.hissG); this.hissG.connect(this.duckG);
    hs.start();
    this.built = true;
    return true;
  }

  // ---- the dial -------------------------------------------------------

  /** Where the tape deck sits on the dial. */
  get tapeIdx() { return this.dial.length; }
  /** How many stations R can actually reach right now. */
  get count() { return this.dial.length + (this.tapeReady ? 1 : 0); }
  /** The station record, or null when the dial is on the tape deck. */
  get def() { return this.dial[this.station] || null; }

  /**
   * Pull the written copy in — six stations of idents, DJ patter, local ads,
   * news stingers and contests. Safe to call once at boot and safe to fail: a
   * missing file leaves the built-in dial alone and the game never notices.
   */
  async loadText(url = 'assets/text/radio.json') {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      const dial = stationsFromJSON(await res.json());
      if (!dial) return null;
      // Stay on the station you were on, if it survived the swap.
      const wasTape = this.station === this.tapeIdx;
      const id = this.def ? this.def.id : null;
      this.dial = dial;
      const i = id ? dial.findIndex((s) => s.id === id) : -1;
      this.station = wasTape ? dial.length : (i >= 0 ? i : Math.min(this.station, dial.length - 1));
      console.log(`radio: ${dial.length} stations — ${dial.map((s) => s.name).join(', ')}`);
      this._emit();
      return dial.length;
    } catch (e) {
      return null;
    }
  }

  // ---- public API -----------------------------------------------------

  /** Off -> station 0 -> ... -> the last one -> cassette, if any -> off. */
  toggle() {
    if (!this.wantOn) { this.wantOn = true; this.station = 0; }
    else if (this.station + 1 < this.count) this.station += 1;
    else this.wantOn = false;
    this.trackT = 0;
    this.breakT = 0; this.breakQueue.length = 0;
    this._restart();
    this._persist();
    return this.state();
  }

  /** Explicit power, for the missions ("elle amène le radio pis les cassettes"). */
  power(on) {
    if (!!on === this.wantOn) return this.state();
    this.wantOn = !!on;
    this._restart();
    this._persist();
    return this.state();
  }

  /** Jump to a station by id or index — the options screen and the tests. */
  tune(which) {
    const i = typeof which === 'number'
      ? which
      : (which === 'tape' ? this.tapeIdx : this.dial.findIndex((s) => s.id === which));
    if (i < 0 || i >= this.count) return this.state();
    this.station = i;
    this.wantOn = true;
    this.trackT = 0; this.breakT = 0; this.breakQueue.length = 0;
    this._restart();
    this._persist();
    return this.state();
  }

  next() {
    if (this.station === this.tapeIdx && this.tape) {
      this.tape.idx = (this.tape.idx + 1) % Math.max(1, this.tape.list.length);
    } else if (this.def) {
      const st = this.def;
      this.trackIdx.set(st.id, ((this.trackIdx.get(st.id) || 0) + 1) % st.tracks.length);
    }
    this.trackT = 0;
    this._restart();
    return this.state();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    this._persist();
    return this.volume;
  }

  /**
   * Where the car is, so a distant transmitter can fade. One call per frame
   * from main.js; nothing happens for the five stations that are local.
   */
  setPos(x, z) { this.px = x; this.pz = z; return this; }

  state() {
    const st = this.def;
    const t = this.station === this.tapeIdx ? this._tapeTrack() : this._track();
    const playing = t ? (t.artist ? `${t.artist} — ${t.title}` : t.title) : '';
    return {
      on: this.on, wantOn: this.wantOn, station: this.station,
      stationName: st ? st.name : TAPE_NAME,
      slogan: st ? st.slogan : '',
      // On a break the HUD line is the DJ, not the song. That is the whole
      // difference between a radio and a playlist.
      track: this.breakT > 0 ? this.breakLine : playing,
      song: playing,
      onBreak: this.breakT > 0,
      volume: this.volume, tape: this.tapeReady,
      signal: this.signal,
    };
  }

  /** Called by main.js when the game leaves drive mode. */
  suspend() { this._stopSource(); this.on = false; this._emit(); }

  /** ...and when it comes back. Picks up where the deck left off. */
  resume() { if (this.wantOn) this._restart(); else this._emit(); }

  /**
   * Look for assets/radio/playlist.json. Safe to call once at boot; the only
   * network request the radio makes, and only for the player's own files.
   */
  async loadTape(base = 'assets/radio/') {
    try {
      const res = await fetch(base + 'playlist.json', { cache: 'no-cache' });
      if (!res.ok) return false;
      const j = await res.json();
      const list = (Array.isArray(j) ? j : j.tracks || [])
        .map((t) => (typeof t === 'string' ? { file: t, title: t.replace(/\.[^.]+$/, '') } : t))
        .filter((t) => t && typeof t.file === 'string');
      if (!list.length) return false;
      this.tape = { list, idx: 0, base, el: null, node: null };
      this.tapeReady = true;
      this._emit();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- per-frame ------------------------------------------------------

  /**
   * `load` is engine load 0..1, `horn` whether you are leaning on it. A handful
   * of gain writes per frame; nothing is created here.
   */
  update(dt, load = 0, horn = false) {
    if (!this.built) return;
    const t = this.ctx.currentTime;
    const want = horn ? 0.28 : 1 - Math.min(0.42, load * 0.42);
    this.duck += (want - this.duck) * Math.min(1, dt * 6);
    this.duckG.gain.setTargetAtTime(this.duck, t, 0.08);
    this._signal(dt);
    const g = this.on && this.audio.enabled ? this.volume * 0.30 * (0.18 + 0.82 * this.signal) : 0;
    this.out.gain.setTargetAtTime(g, t, 0.15);
    // Static rises as the station falls away, and only while it is on.
    const hiss = this.on && this.audio.enabled ? this.volume * 0.14 * Math.pow(1 - this.signal, 1.4) : 0;
    this.hissG.gain.setTargetAtTime(hiss, t, 0.25);

    if (!this.on) return;
    // A break: the DJ, an ident, or an ad for somewhere you can drive to.
    if (this.breakT > 0) {
      this.breakT -= dt;
      if (this.breakT <= 0) {
        // The next line of the same break, or back to the music.
        if (this.breakQueue.length) { this.breakLine = this.breakQueue.shift(); this.breakT = BREAK_SECONDS; }
        else this.breakT = 0;
        this._emit();
      }
      return;
    }
    this.trackT += dt;
    const cur = this._track();
    const len = this.station === this.tapeIdx ? Infinity : ((cur && cur.seconds) || 100);
    if (this.trackT >= len) {
      this.trackT = 0;
      this._sting();
      this._openBreak();
      this.next();
    }
  }

  // ---- internals ------------------------------------------------------

  _persist() {
    // The id is the truth; the index is written clamped so an older build that
    // only knows about four stations still finds one it can play.
    writeStationPref(this.station === this.tapeIdx ? 'tape' : (this.def ? this.def.id : 'ckoi'));
    saveRadio({ on: this.wantOn, station: Math.min(3, this.station), volume: this.volume });
  }

  _emit() { if (this.onChange) this.onChange(this.state()); }

  _track() {
    const st = this.def;
    if (!st) return null;
    return st.tracks[(this.trackIdx.get(st.id) || 0) % st.tracks.length];
  }

  _tapeTrack() {
    if (!this.tape || !this.tape.list.length) return null;
    return this.tape.list[this.tape.idx % this.tape.list.length];
  }

  // What a break is, in order: the station's own ident, the DJ, an ad read, the
  // DJ again, a news/weather/traffic stinger, the DJ, a contest, the DJ. Eight
  // slots that repeat, which is an hour of commercial radio in 2004 and is
  // deterministic, so a station has a rhythm rather than a shuffle.
  static ROTATION = ['idents', 'patter', 'ads', 'patter', 'stingers', 'patter', 'contests', 'patter'];

  _openBreak() {
    const st = this.def;
    if (!st) return;
    const n = this.breakIdx++;
    const slot = Radio.ROTATION[n % Radio.ROTATION.length];
    let pool = st[slot];
    // Not every station in the fallback carries stingers and contests; fall
    // through to the DJ rather than sitting there in silence.
    if (!pool || !pool.length) pool = st.patter;
    if (!pool || !pool.length) return;
    const pick = pool[Math.floor(n / Radio.ROTATION.length) % pool.length];
    // An ad is a paragraph, so it goes out as an ad break: the business first,
    // then the copy a line at a time.
    if (pick && typeof pick === 'object' && pick.copy) {
      const head = pick.business ? 'PUB — ' + pick.business : 'PUB';
      this.breakQueue = [head, ...chunkCopy(pick.copy)];
    } else {
      this.breakQueue = [String(pick)];
    }
    this.breakLine = this.breakQueue.shift();
    this.breakT = BREAK_SECONDS;
    this._emit();
  }

  // The Ottawa signal. Distance sets the floor, and a slow two-rate wander on
  // top of it is the multipath you get driving between the ridge and the river.
  _signal(dt) {
    const st = this.def;
    if (!st || !st.weak) { this.signal = 1; return 1; }
    this.sigT += dt;
    const w = st.weak;
    const d = Math.hypot(this.px - w.x, this.pz - w.z);
    const base = clamp01(1 - (d - w.near) / (w.far - w.near));
    const wander = 0.5 + 0.5 * Math.sin(this.sigT * 0.41) * Math.sin(this.sigT * 0.13 + 1.3);
    // The swing belongs to the FRINGE. Under the transmitter the station is
    // simply there; it is out at the edge of the contour that it breathes in
    // and out, which is what driving back from Hull actually sounded like.
    const depth = 0.55 * (1 - base);
    const want = clamp01(base - depth * (1 - wander) * 1.6);
    // Ease it, so the station breathes instead of stuttering.
    this.signal += (want - this.signal) * Math.min(1, dt * 1.6);
    return this.signal;
  }

  _stopSource() {
    if (this.src) {
      try { this.src.stop(); } catch (e) { /* already done */ }
      try { this.src.disconnect(); } catch (e) { /* gone */ }
      this.src = null;
    }
    if (this.tape && this.tape.el) { try { this.tape.el.pause(); } catch (e) { /* fine */ } }
  }

  _restart() {
    if (!this._build()) { this.on = false; this._emit(); return; }
    this._stopSource();
    if (!this.wantOn) { this.on = false; this._emit(); return; }
    // Each band gets its own speaker: the AM station's is narrow, and that is
    // most of why it sounds like 1150 on the dash of a Ranger.
    const st = this.def;
    const tn = (st && st.tone) || { freq: 900, q: 0.35 };
    const now = this.ctx.currentTime;
    this.tone.frequency.setTargetAtTime(tn.freq, now, 0.05);
    this.tone.Q.setTargetAtTime(tn.q, now, 0.05);
    if (this.station === this.tapeIdx) this._playTape();
    else this._playSynth();
    this._emit();
  }

  _playSynth() {
    const t = this._track();
    if (!t) { this.on = false; return; }
    const key = `${t.style}:${t.seed}`;
    const buf = this.loops.get(key);
    if (!buf) {
      if (this.rendering) return;
      this.rendering = true;
      renderLoop(t.style, t.seed, Math.min(22050, this.ctx.sampleRate)).then((b) => {
        this.rendering = false;
        // Two loops in the cache is plenty; anything older is cheap to rebuild.
        if (this.loops.size > 2) this.loops.delete(this.loops.keys().next().value);
        this.loops.set(key, b);
        if (this.wantOn && this._track() === t) this._playSynth();
      }).catch((e) => { this.rendering = false; console.warn('radio: loop render failed', e); });
      this.on = true;
      this._sting();
      return;
    }
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.connect(this.out);
    s.start(0, this.trackT % buf.duration);
    this.src = s;
    this.on = true;
  }

  _playTape() {
    const t = this._tapeTrack();
    if (!t) { this.station = 0; this._playSynth(); return; }
    if (!this.tape.el) {
      const el = new globalThis.Audio();
      el.crossOrigin = 'anonymous';
      el.loop = false;
      el.addEventListener('ended', () => { if (this.wantOn && this.station === this.tapeIdx) this.next(); });
      this.tape.el = el;
      this.tape.node = this.ctx.createMediaElementSource(el);
      this.tape.node.connect(this.out);
    }
    const url = this.tape.base + t.file;
    if (!this.tape.el.src.endsWith(encodeURI(t.file))) this.tape.el.src = url;
    const p = this.tape.el.play();
    if (p && p.catch) p.catch(() => { /* autoplay policy; the next E will do it */ });
    this.on = true;
  }

  // The station sting: each station's own two-to-four note logo. This is the
  // "DJ" — the words go on the HUD line, because a game about 2004 Aylmer does
  // not get to depend on the browser's speech synthesiser.
  _sting() {
    const a = this.audio;
    if (!a || !a.ok || !a.enabled) return;
    const st = this.def;
    const base = st ? st.sting : [523, 659];
    base.forEach((f, i) => setTimeout(() => a.blip(f, 0.18, 'triangle', 0.10), i * 110));
  }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// A noise buffer for the live graph, for the case where the Audio object has
// not built its own. Two seconds, looped; it is static, nobody is listening for
// a pattern in it.
function noiseBufLive(ctx, seconds = 2) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// Which station you were on, by id. store.js keeps a closed set of keys and
// clamps its own station field to 0..3, so the dial keeps its place here.
const STATION_KEY = 'aylmer.radio.station';
function readStationPref(fallback = 0, dial = STATIONS) {
  if (typeof window === 'undefined') return fallback;
  try {
    const id = window.localStorage?.getItem(STATION_KEY);
    if (id === 'tape') return dial.length;
    const i = dial.findIndex((s) => s.id === id);
    return i >= 0 ? i : fallback;
  } catch { return fallback; }
}
function writeStationPref(id) {
  if (typeof window === 'undefined') return;
  try { window.localStorage?.setItem(STATION_KEY, id); } catch { /* private mode */ }
}
